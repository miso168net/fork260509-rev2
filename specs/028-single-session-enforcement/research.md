# Phase 0 Research: single-session enforcement

**Feature**: 028-single-session-enforcement | **Date**: 2026-06-05
**Input**: [spec.md](spec.md) + [brainstorm](../../docs/superpowers/028-single-session-enforcement.md)(已收斂全決)

> CLAUDE.md §3 Phase 0 research 紀律:不信 brainstorm 命名,實 grep facade/entity/handler 真實型 + wire 3 端對齊 + struct/fn 命名。下列每項皆引現行 code(`rust-api/...`)。grounding 承 028 brainstorm 的 4-reader workflow + 3 確認 grep + 027 實作(本 session 親手落地)。**§I.5:未 grep rev1 source。**

## 0. Grounding grep 結果(現行 code 實證)

| 對象 | 實證 | 結論 |
|---|---|---|
| Claims | `auth/jwt.rs:28-42` `Claims{sub,user_id,roles,exp,iat,iss,aud}` 全 required、doc「never read by base-web」 | 加 `sid: String`(required)= **internal 改**;舊 token deserialize 失敗 → 部署過渡一次性重登(D3) |
| sign | `auth/jwt.rs:64-89` `sign(user_id, roles, secret, ttl_secs, iss, aud)` | 加 `session_id: &str` 參、寫入 Claims.sid |
| issue_tokens | `handler/auth.rs:63-67` `issue_tokens(user_id, roles, &JwtConfig)`(026 抽、027 重用) | 加 `session_id: &str` 參、兩 token 都帶 |
| login | `handler/auth.rs:88-137` `issue_tokens`(inner)→ 027 `create_chain_head`(outer Ok arm) | **重排**:先鑄 sid → issue_tokens → create_chain_head → (resolved=on)revoke 舊鏈 + set pointer |
| refresh_token | `handler/auth.rs:275-318`(027:verify→預簽 issue_tokens→rotate) | 繼承 `claims.sid` + (resolved=on)驗 pointer |
| verify_bearer 5 callsite | `auth/bearer.rs:40-64`(中性 `Option<Claims>`、不決定狀態) | enforce_mw(fail-closed)/ getUserInfo·getUserRoutes·isRouteExist(advisory)/ ctx_mw(best-effort);**3 advisory 不走 enforce_mw** → 檢查覆蓋 4 gate、**不放 verify_bearer**(D4) |
| enforce_mw | `auth/enforce.rs:60-121`(verify_bearer→None→3333;**per-request DB-fresh roles 018**+ casbin) | verify 後加 `session::is_current` → false→7777(D4) |
| 4 gate verify 點 | enforce.rs:62 / `handler/auth.rs:218`(get_user_info)/ `handler/route.rs:41`(get_user_routes)·:122(is_route_exist) | 各 `verify_bearer` 成功後插 is_current 檢查 |
| AppState.redis | `state.rs:14-29` `redis: redis::aio::ConnectionManager`(clone 廉、auto-reconnect)**目前只 PUBLISH** | 加 GET/SET helper(D2);`redis::cmd("GET"/"SET").arg(...).query_async(&mut conn)` |
| redis 用法範本 | `auth/policy_watcher.rs:103-112` `redis::cmd("PUBLISH").arg(CHANNEL).arg(1).query_async(redis)` | GET/SET 同 `cmd().arg().query_async` 形 |
| sys_user 欄 | `entity/src/sys_user.rs` id/user_name/password/nick_name/user_gender/user_phone/user_email/status + §I.6 六審計欄 | +2 系統欄(current_session_id Option<String> / session_policy String);§I.6 PASS-by-scope(D9) |
| sys_user alter 範本 | `migration/.../000014_alter_sys_user_business_audit.rs:25-48`(`alter_table().add_column(ColumnDef::new(...).type().null/not_null().default(...))`)、008 `add_column`/`drop_column` | migration 027 加 2 欄、down drop |
| 下一 migration | `migration/src/lib.rs` 最末 `000026`(027 sys_token) | `m20260529_000027_alter_sys_user_session` |
| 027 整鏈 revoke 範式 | `model/facade/sys_token.rs:192-196` Reuse 分支 `update_many().col_expr(Status, REVOKED).filter(RotationChain.eq(...))` | `revoke_other_chains(user_id, keep_chain)` 沿此(D7) |
| config | `config.rs:80-86` `JwtConfig{access_token_ttl_secs, refresh_token_ttl_secs, jwt_secret, refresh_token_secret}` | 加 `single_session_default`(系統預設、028=off,沿 config 載入範式)(D6) |
| 踢碼 7777 | `envelope.rs` `ModalLogout7777 => "7777"`、msg「账号在他处登录」**已存在**;base-web `request/index.ts:61-84` modalLogoutCodes 分支(modal→確認→resetStore)、排 expiredToken 前 | 踢用 `BizCode::ModalLogout7777`、**base-web 零改、無迴圈**(D5) |
| §11.17 先例 | `DESIGN:1502`「018 enforce 改 DB-fresh stateful 不需 amendment;013 stateless refresh = feature-level deviation」 | access stateful 不需 amendment(D10) |

**wire 3 端對齊**:028 對 base-web wire **零改** —— 登入/換新回應結構不變、`Claims` 加 `sid` 為 internal(base-web token opaque、mock JWT 無 session_id)、踢用既有 `7777`(base-web modalLogoutCodes 既有處理)。無 wire 漂移面。

## 1. 決策(Decision / Rationale / Alternatives)

### D1 — session 識別 = 獨立新 sid(uuid),與 027 rotation_chain 正交
- **Decision**:login 鑄 `Uuid::new_v4().to_string()` 為 `sid`、寫入 Claims;與 027 `rotation_chain` **各自獨立**。
- **Rationale**:027 chain = refresh 血統(輪替序列);028 sid = session 身分(哪次登入當前有效)—— 兩條不同軸。分開使各自不變式乾淨(027 多-active 容忍 index 不動、028 pointer 為簡單 per-user 值)。
- **Alternatives**:重用 rotation_chain 當 sid(少一 id,但耦合 027 chain 生命週期 + 與 027 partial index 非-unique〔多裝置容忍〕語義衝突),否決。

### D2 — pointer = Redis(讀)+ sys_user(持久真相)混合
- **Decision**:`sys_user.current_session_id` = 持久真相(must-succeed);Redis `sess:{uid}` = 熱路徑 cache(best-effort)。**SET(成功登入)**:先 `UPDATE sys_user`(失敗→`5000`)、再 Redis SET(失敗忽略)。**GET(每 gate)**:Redis GET → miss → 讀 sys_user + 回填。cache 值 = `{session_policy, current_session_id}` 一筆(一次 GET 同取 policy+pointer)。
- **Rationale**:持久(服務重啟不致全站誤登出、SC-007)+ 熱路徑快;cache miss 自持久層回填、**不誤踢**(真相在 sys_user)。AppState.redis 既有、只需加 GET/SET helper。
- **Alternatives**:純 Redis(易失、重啟全員重登)、純 sys_user(每 gate DB 讀、較慢);混合取兩者長。多實例下 sys_user/Redis 皆共享 → 一致(正交、現單實例)。

### D3 — Claims `sid` = required → 部署過渡一次性重登
- **Decision**:`Claims.sid: String`(非 Option)。pre-028 token 無 sid → deserialize 失敗 → `3333`→base-web refresh→舊 refresh 亦無 sid→deserialize 失敗→`8888`→乾淨登出重登。**與 policy 開關無關**(即使系統預設=off,Claims schema 變更仍觸發)。
- **Rationale**:級聯自然收斂(無迴圈)、零相容碼、**無「sid=None 靜默繞過檢查」安全破口**;沿 027 D9 一次性重登先例(admin 小用戶量、資料無損)。user 親決接受。
- **Alternatives**:`Option<String>`(寬容、無部署重登,但需 None 處理 + 破口風險);user 親決取 required。

### D4 — session 檢查放 4 認證 gate(不放 verify_bearer、不含 ctx_mw)
- **Decision**:新 `session::is_current(state, &claims).await -> bool`(讀 {policy,pointer}→resolve→off 直 true、on 比 sid==pointer);於 `enforce_mw` + `get_user_info` + `get_user_routes` + `is_route_exist`(各 verify_bearer 成功後)呼、false→`7777`。**ctx_mw 不加**。
- **Rationale**:3 advisory 端點不走 enforce_mw、各自 verify_bearer → 只加 enforce_mw 會漏(被踢者仍能 getUserInfo);故覆蓋 4 gate。**不放 verify_bearer**:其 026 契約為中性 `Option<Claims>`、不決定狀態,且會逼 ctx_mw(best-effort 審計)每請求多 I/O。ctx_mw 不 gate(被踢請求已由 4 gate 擋下)。
- **Alternatives**:塞 verify_bearer(破契約 + ctx_mw 負擔);只 enforce_mw(漏 3 advisory);皆否決。

### D5 — 踢碼 = 7777(現成 ModalLogout)、gate 與 refresh 統一
- **Decision**:被踢/失效路徑回 `Res::err(BizCode::ModalLogout7777)`(msg「账号在他处登录」);gate 與 refresh **統一用 7777**(非 8888)。
- **Rationale**:base-web `.env` `MODAL_LOGOUT_CODES=7777,7778`、request 層 modalLogoutCodes 分支顯 modal(content=rust msg)→確認→`resetStore` 登出;**排在 expiredTokenCodes 之前 → 永不觸發 refresh、無迴圈**;訊息「账号在他处登录」精準對應單一-session;**無新碼、base-web 零改**。比 8888(generic)更告知 user 為何登出。
- **Alternatives**:8888(generic logout,可但較不友善);新碼(碰 §I.3 13 碼凍結、不需);皆否決。

### D6 — policy = sys_user 三態 + config 系統預設(028=off)
- **Decision**:`sys_user.session_policy ∈ {inherit, on, off}`(VARCHAR(20)、default `inherit`)+ 系統預設 = config `single_session_default ∈ {on,off}`(028=`off`)。純函式 **`resolve_policy(session_policy: &str, system_default: SessionMode) -> bool`**(回「是否 enforce」:`on`→true、`off`→false、`inherit`→`system_default==On`、未知→沿 system_default);enforcement 僅回 **true** 時作用。**回傳 `bool`(非 SessionMode)** — 見 data-model §5 簽章 + contracts §1 U1。
- **Rationale**:per-account 可控 + 安全 dormant 上線(預設 off + 帳號預設 inherit → 全員 resolved=off、零行為變化〔除 D3 一次性重登〕)。`resolve_policy` 為唯一純邏輯 seam → TDD。
- **Alternatives**:全域單一開關(無 per-account 彈性);per-account 無系統預設(無 dormant 上線);皆否決。

### D7 — login revoke 舊鏈(resolved=on),沿 027 整鏈 revoke 範式
- **Decision**:`model/facade/sys_token.rs` 加 `revoke_other_chains(db, user_id, keep_chain) -> Result<u64, DbErr>`(`update_many().col_expr(Status, REVOKED).filter(user_id == AND rotation_chain != keep AND status==active)`);login resolved=on 時呼。
- **Rationale**:pointer 移動讓舊 session access 被踢(D2/D4);revoke 舊鏈讓舊 session 的 027 refresh **立刻死**(不必等 pointer 比對)+ DB 整潔(user 親決要)。沿 027 Reuse 分支整鏈 revoke 範式。
- **Alternatives**:不 revoke、只靠 pointer 擋(refresh 仍須查 pointer;舊鏈 active 殘留靠到期/cleanup);user 親決取 revoke(整潔)。

### D8 — refresh 繼承 sid + 驗 pointer(resolved=on)
- **Decision**:refresh `issue_tokens(claims.user_id, claims.roles, &claims.sid, ...)`(同 sid 過 refresh → 當前 session 存活);resolved=on 且 `claims.sid != pointer` → `7777`(被踢 session 不能 refresh 復活)。
- **Rationale**:正常單一使用跨換新不被踢(SC-003);被取代 session 之 refresh 雙重擋(D7 鏈已 revoked〔027 rotate 回 Reuse→8888〕+ D8 pointer 檢查→7777)。

### D9 — §I.6:sys_user 加 2 系統欄(PASS-by-scope)
- **Decision**:`sys_user` 加 `current_session_id VARCHAR(36) NULL` + `session_policy VARCHAR(20) NOT NULL DEFAULT 'inherit'`,**不帶 §I.6 六審計欄**。
- **Rationale**:current_session_id 純機器管理(login 寫、無 human operator);session_policy 028 後端設、029 admin 改走 011 audit(非 per-column `*_by`)。sys_user 本身已含六審計欄(017 retrofit),加系統欄不觸發新審計需求。類比 `password` / 027 `sys_token` infra。
- **Constitution note**:plan Constitution Check #8 明示 PASS-by-scope。

### D10 — access stateful 不需 amendment(§11.17 018 先例)
- **Decision**:028 access 端由 stateless 轉「可被 session 撤銷」,**不走 amendment**。
- **Rationale**:constitution 無「access stateless / refresh-only 撤銷」凍結拍板(grep 零命中);§11.17 已把 enforce 改 per-request DB-fresh stateful、明文「不需 amendment」(013 stateless refresh = feature-level deviation)。028 為同軸延伸。可選:DESIGN §11 記新公理(釐清、非 amend)。
- **Alternatives**:走 amendment(無凍結拍板被違反 → 不必),否決。

### D11 — 無新 crate / 無新 workspace member → prod image build 非強制
- **Decision**:redis/uuid/chrono 皆 server 既有 dep;無新 workspace member。
- **Rationale**:CLAUDE.md §3「加 workspace crate 須 prod image build」**不適用**;prod image build 列**可選**驗收。

## 2. 無 NEEDS CLARIFICATION
spec 0 個 NEEDS CLARIFICATION;brainstorm 已逐軸全決(11 拍板)+ /speckit-clarify 確認無高影響歧義。Phase 0 無殘留未決。
