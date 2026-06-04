# 026 — auth DRY refactor(Phase 0 brainstorm / spec-design)

> 階段 0 brainstorm 拍板。承 CHECKLIST §1 下一步「Phase 3 #5 axum-casbin fuller rewrite」—— grounding(025 收尾後)揭露 #5 已縮水:全路由 enforce 字面早完成(30/30 零破口)、metrics defer Phase 6。本 feature 取其**實質剩餘 = auth 層 DRY refactor**(§2.16 token 簽發 / §2.17 bearer→verify 前導 / §2.18 fail-closed 文件 / §2.19 ctx_mw 重複)。
>
> **2026-06-04 brainstorm 拍板**:Approach **A**(最小/最安全)—— 只抽兩個乾淨 helper、roles 段留 inline;debug log 合併版;純 refactor 行為零變。

## 1. 目標與性質

把 auth 層**重複的請求前導與 token 簽發**收斂成共用 helper,消除 5 處 `bearer→jwt::verify` 與 2 處 access+refresh 簽發的 drift 風險。**純 refactor —— wire/response/code 行為零變**(由現有測試前後逐字不變驗證);唯一可觀察差異是 4 條重複 debug log 合併成 1 條(訊息少 handler 前綴、保留 `error=%e`)。

**非功能性 feature**:無新 endpoint / 表 / crate / dep / migration、不動 casbin、不動 base-web。

## 2. Grounding(實際 code,2026-06-04 落地)

**5 處 `bearer_token → jwt::verify(jwt_secret, JWT_AUD) → claims` 前導**(`bearer_token` 已是 helper、重複的是它 + verify 兩段):

| callsite | 檔:fn | roles 段(留 inline) | error 映射(保留) |
|---|---|---|---|
| `enforce_mw` | `auth/enforce.rs:60` | `roles_for_user` | bearer/verify→3333;**roles-DB 失敗→403/5003 fail-closed** |
| `get_user_info` | `handler/auth.rs:209` | +`find_active_by_id`(載 user 取 nick_name)+`roles_for_user` | 全→3333 |
| `get_user_routes` | `handler/route.rs:39` | `roles_for_user_ordered`(per-role home) | 全→3333 |
| `is_route_exist` | `handler/route.rs:125` | `roles_for_user` | 全→3333 |
| `ctx_mw` | `audit_ctx.rs:95` | (僅 user_id、無 roles) | best-effort→`None` |

**2 處 access+refresh 簽發對**(各 ~28 行,`jwt::sign` × 2、不同 secret/TTL、`Err→Internal(5000)`):
- `login_attempt_inner`(`handler/auth.rs:152-187`)
- `refresh_token`(`handler/auth.rs:298-327`)

**已是幻影、不在 scope**:
- `sys_user.audit_json()` **已含 `nick_name`**(facade `sys_user.rs:28`,017 §I.6 retrofit 時補)→ §2.16 nick_name 條已解、本 doc 收尾標 ✅。
- roles 段不抽:4 callsites 有 3 變體(`roles_for_user` / `_ordered` / +user-load)+ 2 種 error 映射(403 vs 3333)→ 強抽需 typed-error 抽象、CP 值低(Approach A 否決)。

## 3. Scope

**IN**:
1. **`verify_bearer` helper**(新)— 收斂 5 處 bearer+verify。
2. **`issue_tokens` helper**(新)— 收斂 2 處 access+refresh 簽發。
3. **§2.18 fail-closed/open 決策文件化**(spec + doc-comment,無 code 改)。
4. helper 單測 +(若有)清掉因抽離產生的 orphan import。

**OUT**(明示):
- metrics / observability / tracing 標準化 → defer Phase 6(避免 obs-stack 設計返工)。
- `verify_and_load_roles`(roles 段)→ 留 inline(Approach A)。
- token rotation / stale token → Phase 5(獨立)。

## 4. 設計

### 4.1 `verify_bearer`(放 `server/src/auth/bearer.rs`,與既有 `bearer_token` 同檔)
```rust
pub fn verify_bearer(headers: &HeaderMap, secret: &str, aud: &str) -> Option<Claims> {
    let token = bearer_token(headers)?;
    match jwt::verify(token, secret, aud) {
        Ok(claims) => Some(claims),
        Err(e) => {
            tracing::debug!(error = %e, "auth: bearer JWT verify failed");
            None
        }
    }
}
```
- 簽名鏡像 `jwt::verify(token, secret, aud)`(解耦、不伸進 `JwtConfig`)。所有 5 callsites 傳 `&state.jwt.jwt_secret, JWT_AUD`(access secret)。
- bearer 缺失 → 靜默 `None`(同現況);verify 失敗 → **合併的 debug log** + `None`(收斂 4 處重複 log)。
- **callsite 改法**:
  - `enforce_mw`:`let Some(claims) = verify_bearer(req.headers(), &state.jwt.jwt_secret, JWT_AUD) else { return Res::<()>::err(BizCode::TokenExpired).into_response(); };`
  - `get_user_info`/`get_user_routes`/`is_route_exist`:`let Some(claims) = verify_bearer(&headers, &state.jwt.jwt_secret, JWT_AUD) else { return Res::err(BizCode::TokenExpired); };`
  - `ctx_mw`:`let operator_id = verify_bearer(headers, &state.jwt.jwt_secret, JWT_AUD).map(|c| c.user_id);`
- **不動** roles 段與各自的 403/3333/best-effort 映射、不動 get_user_info 的 user-load、不動 get_user_routes 的 ordered/home。

### 4.2 `issue_tokens`(私有 fn,放 `server/src/handler/auth.rs`,近 `LoginToken`)
```rust
fn issue_tokens(user_id: i64, roles: Vec<String>, jwt: &JwtConfig) -> Result<LoginToken, jwt::Error> {
    let access  = jwt::sign(user_id, roles.clone(), &jwt.jwt_secret,           jwt.access_token_ttl_secs,  JWT_ISS, JWT_AUD)?;
    let refresh = jwt::sign(user_id, roles,         &jwt.refresh_token_secret, jwt.refresh_token_ttl_secs, JWT_ISS, JWT_AUD)?;
    Ok(LoginToken { token: access, refresh_token: refresh })
}
```
- 回 `LoginToken`(既有 wire DTO);兩 callsites 保留 `match issue_tokens(...) { Ok(t)=>t, Err(e)=>{ tracing::error!(error=%e, "...: token signing failed"); return Err(BizCode::Internal)/Res::err(BizCode::Internal) } }`。
- `login_attempt_inner` 回 `Result<(LoginToken,i64),BizCode>`、`refresh_token` 回 `Res<LoginToken>` —— 兩者 signing 失敗碼仍 `Internal(5000)` 不變。
- 確認 `JwtConfig` 欄名:`jwt_secret` / `refresh_token_secret` / `access_token_ttl_secs` / `refresh_token_ttl_secs`(已 grep `handler/auth.rs` 確認)。

### 4.3 §2.18 fail-closed vs fail-open(文件化、無 code 改)
spec.md + `verify_bearer` doc-comment 記:**刻意分歧**——
- `enforce_mw`:hard authz gate → roles-DB 失敗 **fail-closed**(403/5003 honest deny,不誤叫 client 重驗)。
- route handlers(`get_user_routes`/`is_route_exist`/`get_user_info`):advisory → token/roles 問題 **3333**(叫 client 重驗)。
- `ctx_mw`:audit best-effort → 無 token/失敗 → `operator_id=None`、不擾請求。

`verify_bearer` 只做 bearer+verify(回 `Option`),**不決定**上述映射;映射留各 callsite,故此分歧自然保留。

## 5. 測試(refactor 紀律,CLAUDE.md §4)

- **回歸鐵律**:現有測試**前後逐字不變即綠** —— `auth.rs`/`route.rs`/`enforce.rs`/`bearer.rs`/`jwt.rs` 既有單測 + 13 個 `#[ignore]` live-DB auth 驗收(login round-trip / getUserInfo / getUserRoutes 三角色 / enforce allow·deny / refresh)。**這是 refactor 的主要驗證**。
- **新單測**:
  - `verify_bearer`:valid 簽發 token→`Some(claims)` / 無 header→`None` / 壞簽名·過期·錯 aud→`None`(沿 `bearer_token` + `jwt::verify` 既有測試 fixture 組合)。
  - `issue_tokens`:給定 user_id+roles → 回的 access 可用 access-secret verify、refresh 可用 refresh-secret verify、user_id/roles round-trip。
- **守恆**:`dcargo test -p server` 全綠、`entity_access_lint` 17、`endpoint_coverage_lint` 30(本 feature 不動 endpoint,應不變)、`Migrator::up` 0、base-web typecheck N/A(未動 base-web)。

## 6. Constitution / size

- rust-api only、無 base-web(無 MODAL-WIRING)、無新 endpoint / 表 / crate / dep / migration、不動 casbin policy。
- **Constitution §IV 8/8 trivially PASS**(#1 base-web N/A、#2/#7 ★ 軌道 N/A、#3 menu enforce N/A、#4 wire 不變、#5 非拷貝〔rev2 自家碼重構〕、#6 §II 拍板不動、#8 不建表)→ **無 amendment**。
- 規模:~1–1.5 人日;rust-api worktree 單倉。

## 7. 拍板紀錄(brainstorm)

- **Approach A**(最小)選定:只抽 `verify_bearer` + `issue_tokens`,roles 段 inline。
- **debug log 合併版**選定(4 條重複 verify-failed log → helper 內 1 條通用 log;response/code 零變)。
- nick_name(§2.16)已完成 → 移出 scope、收尾標 ✅。
- 純 refactor → 由現有測試前後不變驗證 + 兩 helper 新單測。

## 8. 交棒

階段 1 `/speckit-specify`(手動執行,`before_specify` pre-hook 建 `026-auth-dry-refactor` feature branch)。input = 本 doc。
