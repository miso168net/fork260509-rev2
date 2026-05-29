# Research: 013-auth-login-enforce（Phase 0）

> **§I.5 紀律**：rust-api 全新寫、**不准 grep rev1 source**。login/getUserInfo/enforce 皆 rev2 全新寫（非 §11.6 拷貝例外）。wire 權威 = **base-web mock + base-web 自身 `service/api` + `typings`**（§I.1/§I.3）。本檔 grep 對象為 base-web worktree（授權權威）+ rev2 rust-api 現有產物，**未讀 rev1**。
> 日期：2026-05-29。

## grep 事實基準（base-web 權威 + rev2 現有，2026-05-29）

- **base-web `src/service/api/auth.ts`**：`fetchLogin(userName,password)` → `POST /auth/login {userName,password}` 回 `Api.Auth.LoginToken`；`fetchGetUserInfo()` → `GET /auth/getUserInfo` 回 `Api.Auth.UserInfo`；`fetchRefreshToken(refreshToken)` → `POST /auth/refreshToken {refreshToken}` 回 `Api.Auth.LoginToken`。
- **base-web `src/typings/api/auth.d.ts`**：`LoginToken { token: string; refreshToken: string }`；`UserInfo { userId: string; userName: string; roles: string[]; buttons: string[] }`。
- **base-web store**（MOCK §4.12.1）：token 為 opaque string（LS `SOY_token`）、**不 decode**；`userInfo` 由 getUserInfo response `Object.assign({userId,userName,roles,buttons})`。
- **rev2 `envelope.rs`**：`Res<T> { data: Option<T>, code: String, msg: String }`（`data:None`→`null`、序 data→code→msg、code 為 string）；`ok`/`ok_msg` 在 `impl<T>`、**`err`/`err_msg` 在 `impl Res<()>`**（§2.11 待泛型化）。`BizCode` 12-variant 含 `0000/1000/3333/8888/...`（008）。
- **rev2 `config.rs`**：`JwtConfig { access_token_ttl_secs, refresh_token_ttl_secs, jwt_secret, refresh_token_secret }` 已備（005/007）。**無 JWT 簽/驗碼**。
- **rev2 `state.rs`**：`AppState { db, redis }`（Clone、Arc-backed）。**無 enforcer**。
- **rev2 `main.rs`**：router 僅 `GET /health` + `.fallback()`；**無 handler 目錄、無 middleware**。
- **rev2 entity/migration**：`sys_user`(id/user_name/password) + `sys_operation_log`；migration 到 005（含 012 casbin_rule）。**無 sys_role/sys_user_role**。
- **012 `sea-orm-adapter`**：`SeaOrmAdapter::new(conn)`（stock、casbin 2.20）；casbin_rule stock schema。

---

## R1. wire 3-端對齊（login / getUserInfo / refresh）

**Decision**：rust-api DTO 序列化**精確對齊 base-web typing**（camelCase）：
- `LoginToken`（login / refresh response data）：`{ token: String, refreshToken: String }` → serde `rename_all="camelCase"`（`refreshToken`）。
- `UserInfo`（getUserInfo response data）：`{ userId: String, userName: String, roles: Vec<String>, buttons: Vec<String> }` → `userId`/`userName` camelCase；**`userId` 為 string**（§I.3 mock）。
- request body：login `{userName,password}`、refresh `{refreshToken}`（camelCase deserialize）。
- 全部 wrap 在 008 `Res<T>` envelope（`data`=上述 DTO、`code`/`msg`）。

**3 端對齊**：(a) rust handler 回 `Res<LoginToken>`/`Res<UserInfo>`（本 feature 新建）；(b) base-web `auth.ts` + `auth.d.ts`（上方 grep、權威、不動）；(c) base-web store 消費 `{userId,userName,roles,buttons}`（對齊 UserInfo）。**三端一致、無 type lie**。

**Rationale**：§I.1/§I.3 base-web/mock 權威。**§I.5：未 grep rev1**（rev2 全新寫，依 base-web typing 設計 DTO）。

## R2. JWT 簽發/驗證

**Decision**：
- **HS256**（mock §4.5 / brainstorm D11；base-web 不 decode token → claims 自由設計、但**仍驗 exp**）。
- **Claims**：標準（`sub`=user_name 或 user_id / `exp` / `iat` / `iss` / `aud`）+ `user_id` + `roles: Vec<String>`。access 用 `jwt_secret` 簽、refresh 用 `refresh_token_secret` 簽（兩 secret 已備、分離）。
- **新增 workspace dep `jsonwebtoken`**（現行穩定版；**§6 紀律：executing-plans 安裝前確認 crates.io max_stable、非 pre-release**，預期 9.x）。
- access TTL = `access_token_ttl_secs`、refresh TTL = `refresh_token_ttl_secs`（JwtConfig 既有）。

**Rationale**：接上既有 JwtConfig；wire 不依賴 claims 結構（base-web opaque）→ 標準設計即可。

**Alternatives**：RS256（否決、HS256 對齊 mock + JwtConfig 單 secret 設計）。

## R3. Casbin enforce 中介層（rev2 自家、§11.6 重寫第一刀）

**Decision**：
- **rev2 自家 axum middleware**（`axum::middleware::from_fn_with_state`）—— **非拷貝 rev1 `axum-casbin` crate**（§11.6/§I.5「axum-casbin 必須重寫」）。本 feature 為其**第一刀（最小機制）**；全路由/metrics/observability 續 Phase 3 #5。
- **Enforcer** = casbin RBAC model（字串或 `.conf`）+ **012 `SeaOrmAdapter`（stock）**；boot 時建好、`AppState` 加 `enforcer: Arc<...>`（Enforcer 需可變 load_policy → `Arc<RwLock<Enforcer>>` 或 casbin `CachedEnforcer`）。
- **model**：`r=sub,obj,act` / `p=sub,obj,act` / `e=some(where p.eft==allow)` / `m=r.sub==p.sub && r.obj==p.obj && r.act==p.act`。
- **middleware 流程**：驗 access JWT → 取 `roles` → 對每個 role `enforce((role, path, method))` → 任一 allow 放行；全 deny → 403 + `Res::err(<5xxx 權限不足>)`。

**Rationale**：§11.6 重寫拍板；enforce subject=role + 多 role 試一輪 = 最小可用 RBAC。

**Alternatives**：拷貝 rev1 axum-casbin（§11.6 否決、必重寫）。

## R4. RBAC schema + seed

**Decision**：新增 migration（編號接 005 後；建議 006 sys_role / 007 sys_user_role / 008 sys_user nick_name / 009 casbin policy seed，executing-plans 定）：
- **`sys_role`**：`id` BIGSERIAL PK / `code` VARCHAR / `name` VARCHAR / `deleted_at`（**沿 009 SoftDeletable pattern** + partial unique index `code WHERE deleted_at IS NULL`）。
- **`sys_user_role`**：`user_id` / `role_id`（join、硬刪、複合 PK 或 unique）。
- **`sys_user` 加 `nick_name`** VARCHAR（alter）。
- **seed**：roles R_SUPER/R_ADMIN/R_USER_COMMON；user-role 1→SUPER、2→ADMIN、3→USER_COMMON；nick_name Super→`Super`、Admin→`Admin`、**User→`User01`**（alias）。
- **casbin policy seed**（維持 casbin_rule stock）：`p,R_SUPER,/systemManage/getUserList,GET` + `p,R_ADMIN,/systemManage/getUserList,GET`（**不給 R_USER_COMMON** → deny 證明）。經 migration 寫入（INSERT 或呼 adapter）。
- **buttons 矩陣**（程式內、非表）：`R_SUPER→[B_CODE1,B_CODE2,B_CODE3]` / `R_ADMIN→[B_CODE2,B_CODE3]` / `R_USER_COMMON→[B_CODE3]`（對齊 mock §4.4 incremental subset）。

**Rationale**：D5 最小關聯 + 寫死矩陣；新 entity 走 facade（守 009 lint）；新表經 010 自動套（守 007 FR-009）。

**Alternatives**：table-driven buttons（D5 否決、Phase 4）。

## R5. `Res<T>` 泛型化（§2.11）

**Decision**：`envelope.rs` 把 `err`/`err_msg` 從 `impl Res<()>` **移到 `impl<T> Res<T>`**（`data: None`）。**`data` 已是 `Option<T>` → 零結構改動、純 relocate**。login handler（回 `Res<LoginToken>`，帳密錯提早回 `Res::<LoginToken>::err(1000)`）為第一個 caller。既有 `Res::<()>::err` callsite（008 fallback 404）相容（`()` 仍滿足 `impl<T>`）。

**Rationale**：§2.11 follow-up；data 本就 Option，relocate 即可、無副作用。

## R6. error code 對齊 mock §4.11

**Decision**（[MOCK §4.11](../../docs/MOCK-COVERAGE-AUDIT.md)）：
- 成功 `0000`；**login 失敗統一 `1000`**（帳密錯/不存在/缺欄、不細分）；getUserInfo access token 無效/過期/缺失 `3333`；**refresh 失敗 `8888`**（logout，**絕不 `3333/9999/9998`**、守 §I.3 + dead-loop 紀律）。
- **enforce deny = 新增 `5xxx` BizCode variant（權限不足）**：008 `BizCode` 現有 `5000`=infra sentinel、`5001-5999` 留業務 → 新增一個（如 `5003` 權限不足、executing-plans 對 008 矩陣釘具體值 + default_msg）。base-web 對非列舉碼走 fallback toast（不 logout/refresh）。

**Rationale**：§I.3 鎖定 + mock 實機值；deny 屬業務錯（toast）非 token 類。

## R7. 既有契約守恆

**Decision**：守 **007 FR-009**（server 不自動 migrate;新 migration 經 010 自動套、不改 server boot）+ **009 entity-access lint**（新 entity `sys_role`/`sys_user_role` 經 facade 寫、lint 續綠）+ **008 envelope**（全回 `Res<T>`）。**013 不新增 workspace crate**（handler/auth 模組進既有 `server` crate）→ **無 Dockerfile builder COPY 缺口**；新增 cargo dep `jsonwebtoken` → acceptance 順手跑 prod image build sanity（[CHECKLIST §2.13/§2.15](../../docs/INTEGRATION-CHECKLIST.md) 守則）。

**Rationale**：§I 紀律 + 跨 feature 守則。

## R8. CDP 登入 smoke 的 base-web 設定相依（D10）

**Decision**：CDP browser 登入 smoke（base-web 登入頁 → Super/123456 → getUserInfo 渲染）需 **base-web 指向 rev2 rust-api**（非 ApiFox mock）：
- 切 `base-web/.env*` 的 `VITE_SERVICE_BASE_URL` → rev2（dev 直連 `http://localhost:21081` 或經 front-nginx `/api`）—— 屬 **BASE-WEB-ADAPT 軌道（§III.1 預設可動、`.env` 非 inline）**。
- vite env 為 build-time → 需 base-web dev server 讀新 `.env` 或重 build（連動 [CHECKLIST §2.8/§5.5](../../docs/INTEGRATION-CHECKLIST.md)）。
- **013 是首個真接 base-web↔rev2 的 feature**，故承擔此 wiring；executing-plans 決定 dev 直連 vs nginx `/api`（§11.11 拍板 `/api/*` 主流）。

**⚠️ CDP defer 風險自覺**（CLAUDE.md §3）：若 CDP 因 base-web 設定/build 成本臨時 defer → spec/contract 須明示「curl 直送 ≠ base-web modal/wire 對齊」風險 + Follow-up 登記補測。本 feature D10 拍板**含** CDP,故列入 acceptance；若 executing-plans 遇 base-web build 阻礙、回報 user 再定。

---

## Research 結論

8 項全解析、0 NEEDS CLARIFICATION。**新增 dep**：`jsonwebtoken`（§6 安裝前確認 stable）。wire DTO 對齊 base-web typing（camelCase、userId string）。enforce = rev2 自家 axum middleware（§11.6 重寫第一刀）+ 012 stock adapter。**§I.5 遵守**：未 grep rev1（rev2 全新寫、依 base-web 權威設計）。守 007/008/009 + 跨 feature 守則。CDP smoke 有 base-web `.env`→rev2 相依（BASE-WEB-ADAPT 軌道）。
