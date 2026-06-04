# Data Model: auth DRY refactor (026) — Phase 1

> **無實際資料 model**(純 refactor、不碰 schema/entity)。本檔以「helper 介面 + callsite 轉換表」替代 —— 即重構引入的兩個共用單元契約與 7 處 callsite 的精確改法。file:line 以 actual code 為準(prefer grep;implementer act on actual code、勿盲信本檔行號)。

## 1. Helper 1 — `verify_bearer`(`auth/bearer.rs`,與 `bearer_token` 同檔)

| 項 | 形 |
|---|---|
| 簽名 | `pub fn verify_bearer(headers: &HeaderMap, secret: &str, aud: &str) -> Option<Claims>` |
| 邏輯 | `let token = bearer_token(headers)?;`<br>`match jwt::verify(token, secret, aud) { Ok(c) => Some(c), Err(e) => { tracing::debug!(error = %e, "auth: bearer JWT verify failed"); None } }` |
| 回傳語意 | `Some(claims)`=token 有效;`None`=缺 token(靜默)或 verify 失敗(合併 debug log)。**不決定**任何 HTTP/業務碼映射 |
| import | `Claims`(from `crate::auth::jwt`)、`jwt`、`HeaderMap` |

## 2. Helper 2 — `issue_tokens`(`handler/auth.rs`,近 `LoginToken`)

| 項 | 形 |
|---|---|
| 簽名 | `fn issue_tokens(user_id: i64, roles: Vec<String>, jwt: &JwtConfig) -> Result<LoginToken, jwt::JwtError>`（私有) |
| 邏輯 | `let access = jwt::sign(user_id, roles.clone(), &jwt.jwt_secret, jwt.access_token_ttl_secs, JWT_ISS, JWT_AUD)?;`<br>`let refresh = jwt::sign(user_id, roles, &jwt.refresh_token_secret, jwt.refresh_token_ttl_secs, JWT_ISS, JWT_AUD)?;`<br>`Ok(LoginToken { token: access, refresh_token: refresh })` |
| 回傳語意 | `Ok(LoginToken)` 成功對;`Err(jwt::JwtError)` 簽發失敗(callsite 映 `Internal`/5000) |

## 3. Callsite 轉換表（7 處;**roles/user-load/失敗映射皆不動**)

### 3.1 verify_bearer 消費（5 處）

| callsite | 改前(摘) | 改後 |
|---|---|---|
| `enforce_mw`（`auth/enforce.rs`) | `let token = match bearer_token(req.headers()) {…None=>3333};`<br>`let claims = match jwt::verify(token,&state.jwt.jwt_secret,JWT_AUD) {…Err=>{debug;3333}};` | `let Some(claims) = verify_bearer(req.headers(), &state.jwt.jwt_secret, JWT_AUD) else { return Res::<()>::err(BizCode::TokenExpired).into_response(); };`<br>(後續 `roles_for_user` + **403 fail-closed** 段**不動**) |
| `get_user_info`（`handler/auth.rs`) | 同上兩段 `…3333` | `let Some(claims) = verify_bearer(&headers, &state.jwt.jwt_secret, JWT_AUD) else { return Res::err(BizCode::TokenExpired); };`<br>(後續 `find_active_by_id` 載 user 取 nick_name + `roles_for_user` + buttons **不動**) |
| `get_user_routes`（`handler/route.rs`) | 同上兩段 `…3333` | 同 get_user_info 式;(後續 `roles_for_user_ordered` + sys_menu tree + per-role home **不動**) |
| `is_route_exist`（`handler/route.rs`） | 同上兩段 `…3333` | 同上;(後續 `roles_for_user` + route_exists **不動**) |
| `ctx_mw`（`audit_ctx.rs`) | `bearer_token(headers).and_then(|t| jwt::verify(t,&state.jwt.jwt_secret,JWT_AUD).ok()).map(|c| c.user_id)` | `verify_bearer(headers, &state.jwt.jwt_secret, JWT_AUD).map(|c| c.user_id)`（best-effort、`operator_id: Option<i64>` 不變) |

### 3.2 issue_tokens 消費（2 處）

| callsite | 改前(摘) | 改後 |
|---|---|---|
| `login_attempt_inner`（`handler/auth.rs`) | 兩段 `jwt::sign(...)` `match{…Err=>Internal}` + 組 `LoginToken` | `let token = match issue_tokens(user.id, roles, &state.jwt) { Ok(t)=>t, Err(e)=>{ tracing::error!(error=%e, "login: token signing failed"); return Err(BizCode::Internal); } };`<br>`Ok((token, user.id))`（回型 `Result<(LoginToken,i64),BizCode>` 不變） |
| `refresh_token`（`handler/auth.rs`) | 兩段 `jwt::sign(...)`（reuse claims.user_id/roles）`match{…Err=>Internal}` + 組 `LoginToken` | `let token = match issue_tokens(claims.user_id, claims.roles, &state.jwt) { Ok(t)=>t, Err(e)=>{ tracing::error!(error=%e, "refresh_token: token signing failed"); return Res::err(BizCode::Internal); } };`<br>`Res::ok(token)`（回型 `Res<LoginToken>` 不變） |

## 4. 不變式（refactor invariants）

- **wire/碼零變**:login(成功 token 對 / 失敗 1000 / 簽發失敗 5000)、getUserInfo(3333 / 200 payload)、getUserRoutes·isRouteExist(3333 / 200)、enforce(403+5003 / 3333 / pass)、refresh(8888 / 5000 / 200)逐字不變。
- **失敗策略保留**:enforce roles-DB 失敗仍 403 fail-closed(不被 helper 觸碰);route/info 仍 3333;ctx 仍 None。
- **log**:唯一差異 = 4 條 per-handler verify-failed debug → helper 內 1 條通用 debug(保留 `error=%e`)。
- **不抽**:roles 段(含 ordered)、get_user_info user-load、enforce 的 casbin loop、get_user_routes 的 sys_menu/home —— 全留 inline 不動。

## 5. 純單測（新增 2)

- `verify_bearer`(`auth/bearer.rs` test mod):`valid 簽發 token → Some(claims 對)` / `無 Authorization header → None` / `壞簽名 → None` / `過期 → None` / `錯 aud → None`。沿 `jwt` 既有 sign/verify fixture + `bearer_token` 既有 header fixture 組合。
- `issue_tokens`(`handler/auth.rs` test mod):給 user_id+roles → 回 `LoginToken`;`token` 用 `jwt_secret`+JWT_AUD verify 得回 user_id/roles;`refresh_token` 用 `refresh_token_secret`+JWT_AUD verify 得回 user_id/roles。(需 test 用的 `JwtConfig` fixture — 沿既有 config test pattern 或最小構造。)
