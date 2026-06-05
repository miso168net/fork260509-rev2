# Phase 0 Research: refresh token rotation

**Feature**: 027-refresh-token-rotation | **Date**: 2026-06-05
**Input**: [spec.md](spec.md) + [brainstorm](../../docs/superpowers/027-refresh-token-rotation.md)

> CLAUDE.md §3 Phase 0 research 紀律:不信 brainstorm 命名,實 grep facade/entity 真實型 + wire 3 端對齊 + struct/fn 命名。下列每項皆引現行 code(`rust-api/...`)。**§I.5:未 grep rev1 source。**

## 0. Grounding grep 結果(現行 code 實證)

| 對象 | 實證 | 結論 |
|---|---|---|
| 簽發 helper | `handler/auth.rs:62` `issue_tokens(user_id: i64, roles: Vec<String>, jwt: &JwtConfig) -> Result<LoginToken, jwt::JwtError>` | **027 不改**(wire 中性);login/refresh 共用 |
| Claims | `auth/jwt.rs:29` `Claims{sub,user_id,roles,exp,iat,iss,aud}` | **027 不加欄**(session 識別欄屬 028) |
| JwtConfig | 欄 `jwt_secret`/`refresh_token_secret`/`access_token_ttl_secs`/`refresh_token_ttl_secs` | refresh TTL 供算 `expires_at` |
| login | `handler/auth.rs:120` `login_attempt_inner` → `issue_tokens@164` 後直接回(無持久化) | 加一步 `create_chain_head` |
| refresh | `handler/auth.rs:251` `refresh_token` → `jwt::verify(refresh_secret)@257` 失敗→`Logout8888`、成功 `issue_tokens@268` 重簽 | 改走 `rotate` |
| wire DTO | `LoginToken{token,refresh_token}@45`、`RefreshReq{refresh_token}@54` | **逐字不變** |
| facade 範本 | `model/facade/sys_login_attempt.rs`(pure-mapping seam `*_active_model` + write-only + entity-access lint 豁免 + 純 SQL-build 測) | `sys_token` facade 照此 |
| txn helper | `model/audit.rs:76` `mutate_in_txn`(**audit-coupled** —— 寫 `sys_operation_log`) | rotate **不**用它(見 D3) |
| migration 範本 | `migration/.../000012_create_sys_login_attempt.rs`(sea-orm `Table::create` + 索引);partial index 走 raw SQL `execute_unprepared("CREATE [UNIQUE] INDEX ... WHERE ...")`(`000018:100`) | 建表 + partial index 照此 |
| entity 範本 | `entity/src/sys_login_attempt.rs`(`DeriveEntityModel`、`DateTimeWithTimeZone`、`Option<i64>` nullable) | `sys_token` entity 照此 |
| AppState | `state.rs:14` `{db,redis,jwt,enforcer}` | facade 用 `db` |
| sea-orm features | `Cargo.toml:17` `["sqlx-postgres","runtime-tokio-rustls","macros","with-ipnetwork"]` —— **無 `with-uuid`** | rotation_chain 存 **string**(見 D2) |
| uuid / sha2 | `server/Cargo.toml:30` `uuid` 1.x(`features=["v4"]`,已在 → `Uuid::new_v4()` 可用);`sha2` 在 `Cargo.lock`(transitive)、無直接 dep | sha2 加 server 直接 dep(trivial);皆**非新 crate** |
| 下一 migration | `migration/src/lib.rs` 最末 `000025` | `m20260529_000026_create_sys_token` |

**wire 3 端對齊**:027 對 base-web wire **零改** —— refresh 回 `{token,refreshToken}` 結構不變、失敗碼 `8888` 不變;base-web `fetchRefreshToken`/`logoutCodes`/`refreshTokenPromise` 消費端不動。本 feature 無 wire 漂移面。

## 1. 決策(Decision / Rationale / Alternatives)

### D1 — token 儲存 = SHA-256 雜湊
- **Decision**:`sys_token.token_hash` = refresh JWT 的 SHA-256 hex(64 字元);lookup/rotate 以雜湊比對。
- **Rationale**:DB 外洩縱深防禦(雜湊不可直接重放);brainstorm 親決。
- **Alternatives**:存原文 JWT(DESIGN §6.2 原寫法)→ DB 外洩即洩漏可用憑證,否決。回填 DESIGN §6.2 註此 as-built 偏離。

### D2 — rotation_chain 存 VARCHAR(36) 字串(非 native PG uuid)
- **Decision**:`rotation_chain` 欄型 `VARCHAR(36)`、entity 欄 `String`;以 `uuid::Uuid::new_v4().to_string()`(server 既有 uuid crate)於 facade 生成。
- **Rationale**:sea-orm features **無 `with-uuid`**(只 `with-ipnetwork`),native `uuid` 欄無法直接映射 entity;rotation_chain 僅為不透明族系分組標識,字串足夠。避開 `with-uuid` 的版本對齊風險(對齊 Cargo.toml:19-21 ipnetwork 版本鎖教訓)。
- **Alternatives**:加 `with-uuid` feature → 新 feature flag + uuid↔sea-orm 版本對齊風險,CP 值低、否決。

### D3 — rotate 用「純 transaction + FOR UPDATE」,非 mutate_in_txn
- **Decision**:rotate 用 `db.begin()` 純交易 + 對命中 row `SELECT ... FOR UPDATE`(`lock_exclusive`)序列化並發,**不**用 `audit::mutate_in_txn`。
- **Rationale**:`mutate_in_txn` 綁定寫 `sys_operation_log` 審計;token 輪替**非審計業務變更**(clarify ④:盜用事件僅 warn 日誌、持久化審計 defer Phase 6)。`FOR UPDATE` 鎖住命中 row → 並發同 token 的第二筆 rotation 阻塞至第一筆 commit 後讀到 `used`(grace 內)→ benign,杜絕誤 revoke。
- **Alternatives**:無鎖條件 UPDATE(TOCTOU 窗,良性並發可能誤判)、mutate_in_txn(引入不需要的審計寫),皆否決。

### D4 — 純邏輯 seam `decide_rotation` 供 TDD
- **Decision**:抽純函式 `decide_rotation(status, used_at, now, grace) -> RotationDecision`(`Rotate`/`Benign`/`Reuse`);DB I/O(lock/update/insert/revoke)包在外。NotFound 在查無 row 時於 facade 直接判。
- **Rationale**:唯一有實質邏輯處(status×grace 分支),test-first red→green;鏡像 `sys_login_attempt` 的 `*_active_model` 純 seam 模式。
- **Alternatives**:把判定混進 async DB fn → 無法純測,否決。

### D5 — 簽發接合 seam:handler 預簽、facade 持久化
- **Decision**:refresh handler 先 `issue_tokens(claims.user_id, claims.roles, &jwt)`(**unchanged**)簽新 pair,把新 refresh JWT 傳進 `rotate`,由 rotate 在**同一交易內** insert 新 active row(存其 hash)。`Reuse`/`NotFound` 時預簽的 pair 直接丟棄(簽發廉價、無副作用)。
- **Rationale**:滿足 spec FR-002 原子性約束(舊→used + 新 insert 同交易);`issue_tokens` 零改、access token 形狀不動(wire 中性)。
- **Alternatives**:facade 內收 `&JwtConfig`/closure 自簽 → facade 耦合 jwt 簽發、撞 026 邊界,否決。

### D6 — grace 窗 = 30 秒常數
- **Decision**:grace window 預設 `30` 秒、定義為 facade 常數(日後可改 config)。
- **Rationale**:足涵蓋前端多分頁/重試良性並發時序、遠短於攻擊者延後重放尺度;clarify ③ 記預設。
- **Alternatives**:更短(10s,風險誤判良性)、更長(數分,放寬重放窗),30s 折衷。

### D7 — §I.6 分類:sys_token = session/token 基礎設施表(非業務主表)
- **Decision**:`sys_token` **不帶** §I.6 六審計欄;帶自身 lifecycle 欄 `issued_at`/`expires_at`/`used_at`/`created_at`。
- **Rationale**:§I.6 六審計欄規則前提 = **「業務主表」**(追 human operator 的 created_by/updated_by/deleted_by)。sys_token 無 human operator —— row 由 login/refresh 機器流程代認證使用者建立、status 機器驅動(輪替/撤銷),`*_by` 永遠是使用者自身或 null、無審計價值。性質同 `sys_login_attempt`/`sys_access_log`/`sys_operation_log` 等 infra 表(皆免六審計欄)。
- **Constitution note**:§I.6 例外清單字面列「append-only 審計表」「join 表」;sys_token 是**可變狀態 session infra**(非 append-only、非 join),不字面落任一既列例外,但 §I.6 規則本身只約束「業務主表」→ sys_token 非業務主表故規則不適用(PASS by scope)。**向 user 提示**:可選 §I.6 PATCH amendment 把「session/token lifecycle infra 表」explicit 列為非業務主表示例(釐清、非改規則);推薦接受 scope 解讀、不 amend。

### D8 — 無新 workspace crate → prod image build 非強制
- **Decision**:`sha2` 加 `server/Cargo.toml` 直接 dep(已在 lock);`uuid` 已在 server。**無新 workspace member**。
- **Rationale**:CLAUDE.md §3「加 workspace crate 須 prod image build」**不適用**(僅加 dep 到既有 crate);prod image build 列為**可選**驗收。
- **Alternatives**:N/A。

### D9 — 部署過渡:既有 session 一次性重登
- **Decision**:落地前簽發、仍有效的 refresh JWT 在 sys_token 無 row → 首次 refresh → `NotFound` → `8888` → 重登一次。spec 明示、不做相容墊片。
- **Rationale**:admin panel 小用戶量、一次性、資料無損;比墊片簡單。

### D10 — 失敗碼映射(沿 §6.2 critical + §I.3)
- refresh 驗證類失敗(verify fail / NotFound / Reuse / 族系已 revoked)→ **`Logout8888`**;真伺服器故障(DbErr)→ **`Internal(5000)`**;**絕不** `3333/9999/9998`(§I.3 + spec FR-005/006)。login 的 `create_chain_head` DbErr → `Internal(5000)`(不洩 enumeration)。

## 2. 無 NEEDS CLARIFICATION
spec 0 個 NEEDS CLARIFICATION;brainstorm + clarify 已解三軸三張力 + 單一-session 拆 028。Phase 0 無殘留未決。
