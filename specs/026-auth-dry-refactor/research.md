# Research: auth DRY refactor (026) — Phase 0

> grep/Read 實證(CLAUDE.md §3:act on actual code)。本檔由 Phase 0 brainstorm 直接讀 `rust-api/server/src` auth 相關檔(`auth/{bearer,enforce,jwt}.rs`、`handler/{auth,route}.rs`、`audit_ctx.rs`、`model/facade/sys_user.rs`)逐項落地。**純 refactor、無新 wire** → 無「facade 返回型 / wire 3 端」類 grounding(那是新 wire feature 的紀律);本檔 grounding = 重複點的精確現況。

## R0. 現況 CONFIRMED（2026-06-04 grounding）

### R0.1 既有 helper `bearer_token`（`auth/bearer.rs:14`）
`pub fn bearer_token(headers: &HeaderMap) -> Option<&str>` —— 已是 SoT，從 `Authorization: Bearer <token>` 取 token、case-sensitive `Bearer ` 前綴、trim、空→`None`。有 4 個單測。**`verify_bearer` 將建在它之上**(同檔)。

### R0.2 `jwt::verify` 簽名（`auth/jwt.rs`)
`jwt::verify(token, secret, aud) -> Result<Claims, jwt::Error>`;`Claims { user_id: i64, roles: Vec<String>, .. }`(login 簽入 roles、enforce 後改讀 DB-fresh 故 claims.roles 對 enforce 為 vestigial)。`jwt::sign(user_id, roles, secret, ttl_secs, iss, aud) -> Result<String, jwt::Error>`;常數 `JWT_AUD` / `JWT_ISS`。

### R0.3 五處 `bearer→verify→claims` 前導 CONFIRMED

| # | callsite | 檔:fn | 前導後續(留 inline) | 失敗映射(保留) |
|---|---|---|---|---|
| 1 | `enforce_mw` | `auth/enforce.rs:60` | `roles_for_user(claims.user_id)` → casbin enforce | bearer None/verify Err → **3333**(`TokenExpired`,debug log);**roles-DB Err → 403 + 5003 fail-closed** |
| 2 | `get_user_info` | `handler/auth.rs:209` | `find_active_by_id`(載 user 取 nick_name)→ `roles_for_user` → buttons | bearer None/verify Err/user None·Err/roles Err → **全 3333** |
| 3 | `get_user_routes` | `handler/route.rs:39` | `roles_for_user_ordered`(per-role home)→ sys_menu tree filter | bearer None/verify Err/roles Err → **全 3333**;sys_menu Err → 5000 |
| 4 | `is_route_exist` | `handler/route.rs:125` | `roles_for_user` → route_exists 檢查 | bearer None/verify Err/roles Err → **全 3333** |
| 5 | `ctx_mw` | `audit_ctx.rs:110` | (僅 `claims.user_id` → operator_id,無 roles) | 失敗 → **`operator_id = None`**(best-effort,不擾請求) |

- 1-4 的 verify-Err 各有一行 `tracing::debug!(error=%e, "<handler>: token verify failed")`;bearer-None 靜默。5 為 `bearer_token(headers).and_then(|t| jwt::verify(t,secret,JWT_AUD).ok()).map(|c| c.user_id)`(已是 chain、無 log)。
- **失敗策略三分(§2.18)**:enforce **fail-closed**(roles-DB 失敗→403、不誤導重驗)/ route+info **advisory**(→3333 叫重驗)/ ctx **best-effort**(→None)。三者刻意、各 callsite 自映。

### R0.4 兩處 access+refresh 簽發對 CONFIRMED

| # | callsite | 檔:行 | 形 | 失敗碼 |
|---|---|---|---|---|
| 1 | `login_attempt_inner` | `handler/auth.rs:152-187` | `jwt::sign(uid, roles, jwt_secret, access_ttl, ISS, AUD)` + `jwt::sign(uid, roles, refresh_token_secret, refresh_ttl, ISS, AUD)` → `LoginToken{token,refresh_token}` | sign Err → `BizCode::Internal`(5000) |
| 2 | `refresh_token` | `handler/auth.rs:298-327` | 同上(reuse 驗過的 `claims.user_id`/`claims.roles`,stateless D4) | sign Err → `Res::err(BizCode::Internal)`(5000) |

- `JwtConfig` 欄(`state.jwt`)CONFIRMED:`jwt_secret` / `refresh_token_secret` / `access_token_ttl_secs` / `refresh_token_ttl_secs`。
- `LoginToken { token, refresh_token }` 為 `handler/auth.rs` 既有 wire DTO(camelCase)。

### R0.5 兩個 stale backlog 項 —— 已實證解除（移出 scope）
- **§2.16 nick_name**:`sys_user.audit_json()`(`facade/sys_user.rs:24-39`)**已含 `nick_name`**(@28)+ 全業務欄 + §I.6 審計欄(017 retrofit 補)→ 無殘留、已標 ✅。
- **「soft-delete 6-entity rollout」**:rev2 三可軟刪業務 entity(user/role/menu)全有 soft-delete,其餘 §I.6 例外、casbin_rule=#6;「6-entity」係 rev1-era 想像 → 幻影候選已從 §1 下一步移除。

## R1 — `verify_bearer` 設計決策

**Decision**:`pub fn verify_bearer(headers: &HeaderMap, secret: &str, aud: &str) -> Option<Claims>`（入 `auth/bearer.rs`）。內部 `bearer_token(headers)? → jwt::verify(token, secret, aud)`:`Ok→Some`、`Err→{ tracing::debug!(error=%e, "auth: bearer JWT verify failed"); None }`、bearer 缺→靜默 `None`。
**Rationale**:回 `Option<Claims>` 中性、不決定各 callsite 映射(403/3333/None)→ §2.18 三策略自然保留;簽名鏡像 `jwt::verify`、不耦合 `JwtConfig`。**Alternatives rejected**:(a) 回 `Result<Claims, VerifyErr>` 讓 callsite log（保留 per-handler log,但 callsite boilerplate 多、DRY 收益小）→ 親決取「合併 log」版;(b) `verify_bearer(headers, &JwtConfig)` 硬編 access secret（更短、但耦合 config 內部）→ 取顯式 `secret, aud`。

## R2 — `issue_tokens` 設計決策

**Decision**:`fn issue_tokens(user_id: i64, roles: Vec<String>, jwt: &JwtConfig) -> Result<LoginToken, jwt::Error>`(私有,入 `handler/auth.rs` 近 `LoginToken`)。簽 access(jwt_secret/access_ttl)+ refresh(refresh_token_secret/refresh_ttl),`?` 傳播 sign Err。兩 callsite `match issue_tokens(...) { Ok(t)=>t, Err(e)=>{ tracing::error!(...); → Internal } }`。
**Rationale**:近 `LoginToken` wire DTO（兩消費者皆在 `auth.rs`）；`Vec<String>` 給 access 需 `.clone()`、refresh 取所有權（同現況）。**Alternatives rejected**:放 `auth/jwt.rs` 回 `(String,String)` tuple、handler 組 `LoginToken`（多一層、`LoginToken` 在 handler）→ 取就近。

## R3 — roles 段為何不抽（明示 OUT）

4 callsites:`roles_for_user`(enforce/info/exist)vs `roles_for_user_ordered`(routes,回 `Vec<(i64,String)>` 供 per-role home)+ get_user_info 中間插 user-load;錯誤映射 enforce **403** vs route/info **3333**。→ 單一 helper 無法乾淨涵蓋(需 typed-error 抽象 + 變體),收益 < 成本 → **留各自 inline**（Approach A 親決）。

## R4 — 測試策略(refactor)

**Decision**:**既有測試前後逐字不變即綠**為主驗(`auth.rs`/`route.rs`/`enforce.rs`/`bearer.rs`/`jwt.rs` 單測 + live-DB `#[ignore]`);+ `verify_bearer` 單測(valid→Some/缺→None/壞簽·過期·錯 aud→None,組合 bearer_token + jwt fixture)+ `issue_tokens` 單測(回的 access 用 jwt_secret verify、refresh 用 refresh_secret verify、user_id/roles round-trip)。
**Rationale**:純 refactor → 回歸由既有覆蓋驗證;新 helper 為 pure-ish 邏輯、可獨立單測。**無新 live-DB / curl wire 驗收**(無行為變更),但 contracts 仍列 curl 等價 smoke 作對抗式佐證(login/getUserInfo/enforce/refresh 行為與 baseline 一致)。

## 未決
- 無。Approach A + helper 形狀 + log 合併 + 測試策略皆 brainstorm 親決,0 NEEDS CLARIFICATION(clarify 階段確認)。
