# Phase 1 Data Model: single-session enforcement

**Feature**: 028-single-session-enforcement | **Date**: 2026-06-05

## 1. schema:`sys_user` 加 2 系統欄(migration `m20260529_000027_alter_sys_user_session`)

**不新建表** —— 在既有 `sys_user`(業務主表、已含 §I.6 六審計欄)上加 **2 個機器管理系統欄**(非業務欄、非審計欄 — research D9、§I.6 PASS-by-scope)。

| 欄 | PG 型 | 約束 | 說明 |
|---|---|---|---|
| `current_session_id` | VARCHAR(36) | NULL | 該 user **當前有效 session 的 sid**(pointer 持久真相);login 寫;未登入過 = NULL |
| `session_policy` | VARCHAR(20) | NOT NULL DEFAULT `'inherit'` | 三態:`inherit`(用系統預設)/ `on`(強制單一-session)/ `off`(強制多裝置) |

**migration(沿 008/014 alter 範本)**:
- `up`:`manager.alter_table(Table::alter().table(SysUser::Table).add_column(ColumnDef::new(SysUser::CurrentSessionId).string_len(36).null()).add_column(ColumnDef::new(SysUser::SessionPolicy).string_len(20).not_null().default("inherit")).to_owned())`。
- `down`:`alter_table(... drop_column(SessionPolicy).drop_column(CurrentSessionId))`(反序)。
- `SysUser` `DeriveIden` enum 加 `CurrentSessionId` / `SessionPolicy` 兩 variant。
- 註冊 `migration/src/lib.rs`(mod + Box::new,接 026 之後)。
- up→down→up 可逆(throwaway DB;既有 sys_user 資料不動,2 欄加/減)。

## 2. entity `entity/src/sys_user.rs`(+2 欄)

```rust
// 既有 Model 加 2 欄(置於審計欄之外、語義分組):
pub current_session_id: Option<String>,   // NULL → None
pub session_policy: String,               // NOT NULL default 'inherit'
```
其餘 §I.6 六審計欄與既有欄不動。

## 3. config:系統預設

`config.rs` 加(沿既有 config 載入範式,如 JwtConfig 旁;從 env/設定載、預設 `off`):
```rust
// 系統層級單一-session 預設(028=off,dormant 上線;029 改為 runtime store 可調)
pub single_session_default: SessionMode,   // on | off
```
028 由 config / 環境提供(預設 `off`);**runtime 可調 = 029**。AppState 持有(或 JwtConfig 旁的 AppConfig)。

## 4. Claims:加 `sid`(`auth/jwt.rs`)

```rust
pub struct Claims {
    pub sub: String,
    pub user_id: i64,
    pub roles: Vec<String>,
    pub exp: usize,
    pub iat: usize,
    pub iss: String,
    pub aud: String,
    pub sid: String,   // 028 新增(required):此 token 所屬登入的 session 身分
}
```
`sign(user_id, roles, secret, ttl_secs, iss, aud, session_id: &str)` 寫入 `sid`;`issue_tokens(user_id, roles, session_id: &str, &JwtConfig)` 兩 token 都帶同 sid。**required → pre-028 token deserialize 失敗 → 一次性重登(research D3)**。base-web 不讀 Claims(opaque)→ 非 wire 變。

## 5. policy 解析(純函式 seam,TDD)

```rust
pub enum SessionMode { On, Off }            // 系統預設值域
// session_policy 字串:"inherit" / "on" / "off"
pub fn resolve_policy(session_policy: &str, system_default: SessionMode) -> bool
// → 回「是否啟用單一-session」(true=enforce):
//   "on"      -> true
//   "off"     -> false
//   "inherit" -> system_default == On
//   其他/未知 -> system_default(fail-safe 沿系統預設;或視為 inherit)
```
**唯一純邏輯 seam** → `resolve_policy` test-first(red→green):on/off/inherit×{系統 on,系統 off} 全分支(spec FR-015)。

## 6. `auth/session.rs`(新:pointer 混合存取 + session 檢查)

> Redis key:`sess:{user_id}`;cache 值 = `{session_policy, current_session_id}`(JSON record 或 hash,序列化格式 impl 細節)。

- **`set_pointer(state, user_id, sid, session_policy)`**(login 用):先 `sys_user_facade::set_current_session(db, user_id, sid)`(`UPDATE sys_user.current_session_id=sid`,must-succeed)→ 再 Redis SET `sess:{uid}` = `{session_policy, sid}`(best-effort、失敗忽略)。
- **`is_current(state, &claims) -> bool`**(gate/refresh 用):
  ```
  let rec = redis GET sess:{claims.user_id}
            .or_else(|| { let m = sys_user_facade::find_active_by_id(); redis SET 回填; m });   // miss→sys_user 回填(lazy rehydration)
  let enforce = resolve_policy(rec.session_policy, state.config.single_session_default);
  if !enforce { return true; }                 // resolved=off → 不踢
  rec.current_session_id.as_deref() == Some(claims.sid.as_str())   // on → 比對
  ```
  cache miss 不誤踢(真相在 sys_user)。read-only DB 失敗的 fail 策略:沿呼叫端(enforce_mw fail-closed〔此處 session 檢查失敗應 **fail-open=放行** 還是 fail-closed?見下方註〕)。

**fail 策略註(明文自覺)**:`is_current` 內部讀取(Redis + sys_user)若 I/O 失敗 → **建議 fail-open(放行、log warn)** —— 因 session 檢查是「附加收斂」、非主授權閘(主授權仍由 enforce_mw 的 casbin + DB-fresh roles 把關);若 fail-closed 會在 Redis/DB 抖動時誤踢全站(可用性風險 > 單一-session 嚴格性)。plan/tasks 須明示此 fail-open 抉擇與理由(對比 enforce_mw 主閘的 fail-closed)。

## 7. facade

- **`model/facade/sys_user.rs`**(唯一寫入管道,守 009 lint):
  - `set_current_session(db, user_id, sid: &str) -> Result<(), DbErr>`(`update_many().col_expr(CurrentSessionId, sid).filter(Id.eq(user_id))`)。
  - `find_active_by_id` 既有 → 回 Model 含新 `current_session_id`/`session_policy`(供 is_current 的 sys_user 回填 + login 取 policy)。
  - **`session_policy` 寫入**:028 由 **seed/psql 直接設**(無 write facade fn — 028 policy 為後端設定、無對外端點);**029 加 `update_session_policy(db, user_id, policy, operator)` facade fn**(守 009 lint + 011 audit;本 feature 故意不提前宣告 — 避免 dead code)。
- **`model/facade/sys_token.rs`** 加:
  - `revoke_other_chains(db, user_id, keep_chain: &str) -> Result<u64, DbErr>`:`update_many().col_expr(Status, REVOKED).filter(user_id == AND status==ACTIVE AND rotation_chain != keep_chain).exec()`(沿 Reuse 分支整鏈 revoke 範式,research D7)。

## 8. handler 串接(`handler/auth.rs` / `handler/route.rs`)

- **`login`**(`login_attempt_inner` 成功 + 015 審計後):
  > **policy 取得(I1 解法)**:`login_attempt_inner` 內部已 `find_active_by_*` 查得 user Model(含新 `session_policy` 欄)→ **改回傳第三欄** `session_policy`:簽章 `Result<(LoginToken, i64, String), BizCode>`(外層 `login` 由此取 policy,**不另發第二次 DB 查**)。outer `login` 既有 `Ok((token, uid))` → 改 `Ok((token, uid, policy))`(私有 fn、localized 改;015 審計只用 uid、不受影響)。
  ```
  let sid = Uuid::new_v4().to_string();
  let token = issue_tokens(uid, roles, &sid, &state.jwt)?;        // 兩 token 帶 sid（login 重排:先鑄 sid 再簽）
  let chain = Uuid::new_v4().to_string();                         // 027 chain（獨立於 sid）
  create_chain_head(db, uid, &token.refresh_token, &chain, ...);  // 027 沿用
  if resolve_policy(&policy, system_default) { revoke_other_chains(db, uid, &chain)?; }  // resolved=on:踢舊鏈
  session::set_pointer(state, uid, &sid, &policy);                 // 一律 set（即使 off,供日後切 on）
  // 任一 DB 失敗 → Internal(5000)
  ```
- **`refresh_token`**(027 verify→預簽→rotate;加):**pointer 檢查在 `issue_tokens` 之前**(I2:pointer-first、與 gate 踢碼一致、被踢 session 不浪費簽發):
  ```
  let claims = jwt::verify(refresh_secret, ...)?;                                   // 027 既有（失敗→8888）
  if !session::is_current(state, &claims).await { return Res::err(ModalLogout7777); } // 先驗 pointer（resolved=on 且 sid≠pointer→踢；off→true 不影響）
  let new = issue_tokens(claims.user_id, claims.roles, &claims.sid, &state.jwt)?;   // 才簽、繼承 sid
  match rotate(...) { Rotated|Benign => ok(new), Reuse|NotFound => Logout8888, Err => Internal }   // 027 不變
  ```
  (is_current 在 resolved=off 回 true → 027 行為完全不變。被踢 session 雙重擋:此處 pointer→`7777`〔先〕;若僥倖通過,其 027 鏈已由 login `revoke_other_chains` 標 revoked → rotate→Reuse→`8888`。)
- **4 gate**(`enforce_mw` / `get_user_info` / `get_user_routes` / `is_route_exist`):各 `verify_bearer` 成功取得 `claims` 後,插:
  ```
  if !session::is_current(&state, &claims).await { return Res::err(ModalLogout7777) / (...).into_response(); }
  ```
  在既有 role-lookup / enforce 之前。**ctx_mw 不加**。

## 9. 不變式

- **wire 中性**:`LoginToken`/登入·換新成功回應結構逐字不變;`Claims` 加 `sid` = internal(base-web opaque)。
- **任何時刻 resolved=on 帳號至多一個有效 session**:pointer = 最新登入 sid;舊 sid 的 token 在 4 gate / refresh 被 7777。
- **resolved=off 完全 = 027 行為**:is_current 回 true、不踢、login 不 revoke 舊鏈(仍 set pointer 供日後切 on)。
- **失敗碼**:踢一律 `7777`;refresh 既有失敗仍 `8888`;**絕不** `3333/9999/9998`(被踢/失效路徑)。
- **持久**:current_session_id 在 sys_user(重啟不丟);Redis 為 cache、miss 回填、不誤踢。
- **027 不破**:rotation_chain 獨立於 sid;rotate 狀態機不變;revoke_other_chains 只在 login resolved=on 觸發。
