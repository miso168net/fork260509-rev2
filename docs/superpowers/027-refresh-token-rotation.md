# 027 — refresh token rotation(Phase 0 brainstorm / spec-design)

> 階段 0 brainstorm 拍板。承 CHECKLIST §1 下一步「Phase 5」三候選之首(2026-06-05 next-feature 評估:readiness 9 × value 8 最高)。把 013 的**最小無狀態 refresh** 升級為 **DB 持久化 rotation chain + 盜用偵測(reuse detection)+ grace 寬限窗口**,補齊 §5.3 安全債(refresh 是目前唯一仍「無狀態、無洩漏偵測」的 auth 路徑)。
>
> **2026-06-05 brainstorm 拍板(3 軸)**:① 安全深度 = **完整 rotation + 盜用偵測**(非僅持久化);② 並發誤判防護 = **grace 寬限窗口**(非嚴格無 grace);③ token 儲存 = **SHA-256 雜湊**(非原文,DB 外洩縱深防禦)。

## 1. 目標與性質

把 refresh 從**無狀態重簽**(`refresh_token@251`:`jwt::verify → issue_tokens` 重簽、no DB lookup / no persistence)升級為**有狀態 rotation**:
- 每次 refresh 換新 token、舊 token 標 `used`;盜用偵測 = 拿「已用過且超 grace 的舊 token」或「已 revoked 的 token」再 refresh → **整鏈 revoked**、回 `8888`,真實 user 下次 refresh 被乾淨登出重認證。
- grace 寬限窗口區分**良性並發**(同 user 跨分頁/重試、剛被換掉的 token 在短窗內再現)vs **惡意 replay**(chain 已往前走好幾步的舊 token)。
- `sys_tokens` 存 refresh JWT 的 **SHA-256 雜湊**(非原文)。

**功能性質**:rust-api 單倉、新建 1 表 + 1 entity + 1 facade + 改 2 handler。**wire 中性**:`LoginToken{token,refreshToken}` 逐字不變、refresh 失敗碼維持 `8888`(絕不 3333/9999/9998)。**base-web 零改**。**無新 workspace crate、無 constitution amendment、無 fork、無新 wire endpoint、不動 casbin**。

## 2. Grounding(實際 code,2026-06-05 親驗)

**現況確為無狀態**(`server/src/handler/auth.rs`):
| 點 | 位置 | 現行 |
|---|---|---|
| 簽發 helper | `issue_tokens@62` → `Result<LoginToken, jwt::JwtError>` | 026 抽,access(`jwt_secret`)+refresh(`refresh_token_secret`)各簽、不同 TTL |
| login | `login_attempt_inner@164` | `issue_tokens(user.id, roles, &state.jwt)` 後直接回,**無持久化** |
| refresh | `refresh_token@251`(verify@257、issue@268) | `jwt::verify(refresh_secret, JWT_AUD)` 失敗→`Logout8888`;成功 reuse claims 重簽,doc 自註「stateless — D4 / no DB lookup, no persistence/rotation tracking」 |
| wire DTO | `LoginToken@45`{token,refresh_token}、`RefreshReq@54`{refresh_token} | 不變 |

**`sys_tokens` 完全不存在**:grep `sys_tokens|rotation_chain` 全 rust-api 零命中、無 migration、`entity/src/` 無 `sys_token.rs`(DESIGN §10 樹規劃過、未建)。
**範本現成**:`server/src/model/facade/sys_login_attempt.rs`(append-only 表「唯一寫入管道 + entity-access lint 豁免」完整範本)。`audit::mutate_in_txn`(011)transaction wrapper 可複用。
**dep**:`uuid` 已在 `server/Cargo.toml:30`(v1 + `v4`);`sha2` 已在 `Cargo.lock`(transitive)→ 加為 server 直接 dep 為 trivial(無新下載)。**皆非新 workspace member** → 不觸發「加 crate 須 prod image build」守則(CLAUDE.md §3:僅加模組/dep 到既有 crate 不受影響)。
**既有 baseline**:server **206** 單測 + `entity_access_lint` 17 + `endpoint_coverage_lint` 30。
**base-web 已全 wired**:`fetchRefreshToken`(service/api/auth.ts)、`logoutCodes`(request/index.ts)、`refreshTokenPromise` 去重(request/shared.ts)、store 寫 refreshToken(store/modules/auth)。

## 3. Scope

**IN**:
1. **`sys_tokens` 表 + migration 027**(§6.2 schema,token 欄改存 hash + 加 `used_at`)。
2. **`sys_token` entity**(`entity/src/`)。
3. **`sys_tokens` facade**(`server/src/model/facade/sys_token.rs`,唯一寫入管道,守 009 lint):`create_chain_head` + `rotate`(核心狀態機)。
4. **改 `login_attempt_inner`**:簽發後建 chain head。
5. **改 `refresh_token`**:`jwt::verify` 後改走 `rotate`、依 outcome 映射。
6. **§5.3 stale token 不變式 formally 驗收**(getUserInfo 不改、curl 驗舊但未過期 access 仍 200)。

**OUT**(明示):
- **實體清理 / pruning** → 下一個 **cleanup-job feature**(Phase 5 #3);本 feature row 持續累積、靠 `expires_at` 查詢排除過期。follow-up 登記此依賴。
- **access token 端 stateful 撤銷 / denylist** → 維持 stateless 短 TTL 自然過期(YAGNI)。
- **`/auth/logout` endpoint** → 維持 §4.12.4(無 logout endpoint,登出只走前端 resetStore)。詳見 §5。
- **metrics / observability** → Phase 6。
- **多 instance redis fan-out** → 與本 feature 正交(現單 instance)。

## 4. 設計

### 4.1 `sys_tokens` 表(migration 027,§I.6 凍結後新建表)
對齊 DESIGN §6.2,**token 欄改存雜湊 + 加 `used_at`**:

| 欄 | 型 | 說明 |
|---|---|---|
| id | BIGSERIAL PK | |
| user_id | BIGINT NOT NULL, FK→sys_user(id) | |
| **token_hash** | VARCHAR(64) NOT NULL UNIQUE | refresh JWT 的 SHA-256 hex(取代 §6.2 `token VARCHAR(2048)`) |
| rotation_chain | UUID NOT NULL | 同鏈標識(uuid v4) |
| status | VARCHAR(20) NOT NULL | `active` / `used` / `revoked` |
| issued_at | TIMESTAMPTZ NOT NULL | |
| expires_at | TIMESTAMPTZ NOT NULL | 查詢時排除過期 |
| **used_at** | TIMESTAMPTZ NULL | active→used 時設;grace 判斷用 |
| created_at | TIMESTAMPTZ DEFAULT now() | |

+ index:partial `(user_id) WHERE status='active'`(**非 unique** — 容許 benign 並發的短暫 multi-active,見 4.3)+ `(rotation_chain)`。
**§I.6 歸類**:`sys_tokens` 是機器管理的 session lifecycle 表(無 human operator 新增/編輯 row)→ 比照 append-only/infra 表(`sys_login_attempt` 等)**免 6 審計欄**,自帶 `issued_at/expires_at/used_at/created_at` 生命週期欄。plan Constitution Check 須明示此免除歸類(沿 §2.18 例外先例)。

### 4.2 facade `sys_token`(唯一寫入管道,照 `sys_login_attempt` 範本)
- `create_chain_head(db, user_id, refresh_jwt, issued_at, expires_at)` — **login 用**:`chain = Uuid::new_v4()`、insert `{token_hash: sha256(refresh_jwt), rotation_chain: chain, status: "active", issued_at, expires_at}`。`issued_at/expires_at` 由 handler 依 `JwtConfig.refresh_token_ttl_secs` 算(對齊 JWT 內 exp)。
- `rotate(db, presented_jwt) -> RotateOutcome` — **refresh 用,核心狀態機(transaction)**。先 `h = sha256(presented_jwt)`,查 row:

| 查到的 status | grace 判斷 | 動作 | outcome |
|---|---|---|---|
| (無 row) | — | — | `NotFound` |
| `active` | — | 條件 `UPDATE active→used, used_at=now WHERE token_hash=h AND status='active'` + insert 新 active(同 chain) | `Rotated{new_pair}` |
| `used` | `used_at` 在 grace 窗內 | insert 新 active(同 chain、**不** revoke、**不** re-mark) | `BenignConcurrent{new_pair}` |
| `used` | `used_at` 超 grace | **整鏈 `UPDATE status='revoked' WHERE rotation_chain=...`** | `Reuse` |
| `revoked` | — | (已死,無需 re-revoke) | `Reuse` |

- **race guard**:transaction + 條件 `UPDATE ... WHERE status='active'`(只一個並發單步贏)+ `token_hash UNIQUE`(防雙重 insert)。
- **唯一純邏輯 seam**:status×grace → outcome 的判定 → **TDD test-first**(red→green)。
- grace 窗值(短窗,如 10–30s)為 constant / config,spec 定。

### 4.3 benign 並發為何「發新 pair 進同 chain、容忍短暫 multi-active」
hash 儲存下,DB 只有 winner 新 token 的 **hash**、無原文 JWT → loser **無法**取回 winner 的 refresh token 回傳。故 loser(在 grace 窗內再現剛被換掉的 token)= 比照一次正常 rotation **發一對全新 pair 插入同 chain**(不 revoke、不誤登出),chain 短暫有 ≥2 個 active head。**自癒**:base-web localStorage 只存一個 token(last-write-wins)→ 另一個 active 變孤兒、靠 `expires_at` 自然失效(+ 未來 cleanup-job 清)。partial index 非 unique 故 DB 容許。盜用偵測不受弱化(每 token 各自 status,stale used token replay 仍觸 revoke-chain)。

### 4.4 handler 串接
- **`login_attempt_inner@164`**:`issue_tokens` 成功後 `create_chain_head(db, user.id, &token.refresh_token, issued, expires)`;DB 失敗 → `Internal(5000)`(維持現映射、不洩 enumeration)。
- **`refresh_token@251`**:`jwt::verify`(維持失敗 → `Logout8888`)後改呼 `rotate`:
  - `Rotated{pair}` / `BenignConcurrent{pair}` → 回 `pair`
  - `Reuse` / `NotFound` → **`Logout8888`**(維持 §6.2 critical:絕不 3333/9999/9998)
  - DB error → `Internal(5000)`(genuine server fault,維持現有)
- **原子性約束**:`rotate` 須在**單一 transaction** 內完成「舊→`used` + 新 active insert」(或 reuse 的整鏈 revoke),否則中途失敗會留無-active chain(可重登恢復、chain 不腐)。
- **簽發接合 seam(plan/research 決)**:新 pair 由既有 `issue_tokens(user_id, roles, &JwtConfig)` 簽、其 refresh token hash 入新 active row;`issue_tokens` 與 rotate transaction 的接合方式(facade 收 `&JwtConfig`/closure 於 txn 內簽 vs handler 預簽後傳入)= plan 決定,**原子性為約束**。`user_id/roles` 取自 handler 已 verify 的 refresh claims。

### 4.5 §5.3 stale token(不改 code、formally 驗收)
getUserInfo 對「舊但未過期 access token」本就放行(`verify` 查 exp、舊但有效即過)→ 本 feature **不改 getUserInfo**;只 curl 驗 §5.3 不變式(簽一個 issued 較早但未過期的 access → getUserInfo 200)。access reload-restore 與 refresh 持久化正交。

## 5. 既有設計張力的解法(brainstorm 親決)

- **logout vs chain revoke(§4.12.4 ↔ §6.2 flow #3)**:§4.12.4 釘「rust-api 不實作 `/auth/logout`、登出只走前端 resetStore」;§6.2 flow #3 寫「logout 被動 → 整鏈 revoked」。**重新詮釋**:前端登出 = **放棄該 chain**(不主動 revoke、無 endpoint),被放棄 chain 靠 `expires_at` 自然失效 + 未來 cleanup-job 實體清除;**主動 revoke 只由 reuse 偵測觸發**。維持 §4.12.4 不破 → 回填 DESIGN §6.2。
- **token hash vs §6.2 原文**:存 SHA-256(已選)→ 回填 DESIGN §6.2 註明 as-built 偏離 + 理由(DB 外洩縱深防禦)。
- **無實體清理**:row 持續累積,本 feature 不清(靠 `expires_at` 查詢排除);實體刪除 = cleanup-job feature,follow-up 登記依賴。
- **部署過渡(一次性、benign)**:本 feature 落地前簽發、仍有效的 refresh token 在 `sys_tokens` 無 row → 既有已登入 session 首次 refresh 命中 `NotFound`→`8888`→被迫重登一次(admin panel 小用戶量、一次性、資料無損)。spec 明示、不另做相容墊片。

## 6. 測試(CLAUDE.md §3/§4)

- **純邏輯單測(TDD red→green)**:`rotate` 狀態機 — active→`Rotated` / used+grace→`BenignConcurrent` / used+stale→`Reuse`(整鏈 revoked)/ revoked→`Reuse` / not-found→`NotFound`;`sha256` hash 一致性。
- **活體 curl/psql**(沿 §2.10 in-crate `#[ignore]` + env-gate `DATABASE_URL`,server bin-only):
  - login 建 chain head(psql:1 active row、token_hash 非原文)
  - refresh 換新 + 舊標 `used`(psql)
  - 重放超 grace 的 used token → `8888` + psql 該 chain 全 `revoked`
  - 並發兩 refresh 同 token → **不登出**(grace、psql chain 仍有 active)
  - refresh 失敗一律 `8888`、grep response 無 `3333/9999/9998`
  - migration up→down→up 可逆(throwaway DB)
  - §5.3 stale token → getUserInfo 200
- **守恆**:`dcargo test -p server` 全綠(既有 206 + 新測)、`entity_access_lint` 17(新 facade 守)、`endpoint_coverage_lint` 30(無新 endpoint、不變)、`Migrator::up` 0。base-web typecheck N/A(零改)。
- **CDP**(建議、沿紀律):dev/prod 經 base-web 真實 refresh 一次(Network 確認 refreshToken 換新、未登出)。
- **無新 crate** → prod image build 守則不強制(惟仍可選跑一次)。

## 7. Constitution / size

- rust-api only、無 base-web(無 MODAL-WIRING)、無新 wire endpoint、不動 casbin policy、無 fork(不碰 sea-orm-adapter)。
- **新建表 `sys_tokens`** → §I.6 走機器管理 lifecycle 表免除歸類(plan Constitution Check 明示、沿 §2.18 例外先例);非 §I.6 6-審計欄業務主表。
- **新 dep `sha2`**(加既有 server crate)、`uuid` 已在 → 非新 workspace member。
- 預估 Constitution §IV:#1 base-web N/A、#2/#3 menu N/A、#4 wire 不變、#5 rev2 自家碼(非拷貝)、#6 §II 不動、#7 ★ 軌道 N/A、#8 建表走 §I.6 免除歸類 → 預期 **無 amendment**(plan 階段正式確認)。
- 規模:~2.5–4 人日;rust-api worktree 單倉、兩段式 commit。

## 8. 拍板紀錄(brainstorm)

- **安全深度 = 完整 rotation + 盜用偵測**(reuse detection:stale used / revoked token replay → 整鏈 revoked + 8888)。
- **並發防護 = grace 寬限窗口**(used_at 區分 benign 並發 vs 惡意 replay;benign → 發新 pair 進同 chain、容忍短暫 multi-active、不誤登出)。
- **token 儲存 = SHA-256 雜湊**(非原文,DB 外洩縱深防禦;偏離 §6.2 原文、回填註明)。
- **logout = 放棄 chain**(維持 §4.12.4 無 endpoint;主動 revoke 只由 reuse 觸發;§6.2 flow #3 重新詮釋、回填)。
- **實體清理 defer cleanup-job**(本 feature 只建/標、不清)。

## 9. 交棒

階段 1 `/speckit-specify`(**手動執行**,`before_specify` pre-hook 建 `027-refresh-token-rotation` feature branch)。input = 本 doc。
