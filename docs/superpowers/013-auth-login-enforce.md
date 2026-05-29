# 013-auth-login-enforce — Phase 0 brainstorm（spec-design）

> **feature**：登入 + getUserInfo + JWT + **第一個 Casbin enforce 點**（Phase 3 起手）。
> **狀態**：brainstorm 凍結（2026-05-29 user 親決 D1-D11）。本檔為 `/speckit-specify` 的輸入；忠實落地、非自由設計。
> **對齊**：DESIGN §10 Phase 3 #1（登入+getUserInfo，Casbin enforce 首次啟用）；併入 #4(policy seed) / #5(axum-casbin) 的**第一刀**（最小機制）。鐵紀律②「menu 權限 Casbin enforce」的首次落地前置。

---

## 1. 目標與範圍

把 base-web 的登入流程對 rev2 rust-api 端到端接通，並**首次啟用 Casbin enforce**（最小機制證明）。
- base-web wire 權威（鐵紀律①）：login / getUserInfo 形狀對齊 mock（[MOCK §4.5/§4.7/§4.11/§4.12](../MOCK-COVERAGE-AUDIT.md)）。
- enforce 首次落地：rev2 自家 axum middleware（§11.6「axum-casbin 重寫」第一刀、**非**拷貝 rev1 crate）+ casbin `Enforcer`（RBAC model + 012 的 `SeaOrmAdapter`，**stock**）。

## 2. 凍結決策（D1-D11，2026-05-29 user 親決）

- **D1 範圍**：login + getUserInfo + JWT 簽發/驗證 + **第一個 Casbin enforce 點**（user 選「013 一併做第一個 enforce 點」）。
- **D2 enforce 深度＝最小機制證明**：middleware + Enforcer(RBAC model + 012 stock adapter) + seed 剛好夠的 policy + 挑**一條**代表性受保護路由示範「不同 role 不同准駁」、**含一個 deny 案例證明真的擋**。完整 policy 矩陣(3 role × 全 endpoint) + 全路由 rollout 留 Phase 3 #4/#5 續做。
- **D3 不做 login audit**：登入/請求層 audit（operator_ip 真值 / xdb 來源地）留後續「audit middleware / 請求層」feature；[§2.14](../INTEGRATION-CHECKLIST.md)(operator_ip PG 42804) + [§2.15](../INTEGRATION-CHECKLIST.md)(xdb 路徑+打包) 在那觸發、**不在 013**。
- **D4 refresh＝最小無狀態版**：login 簽 access + refresh 兩 token；`/auth/refreshToken` 驗 refresh JWT 簽章+exp → 簽新 access（可順手 rotate 新 refresh），**不持久化**。完整 rotation_chain + `sys_tokens` = Phase 5。
- **D5 RBAC schema＝最小關聯 + buttons 寫死矩陣**：`sys_role`(沿 009 soft-delete) + `sys_user_role`(join、硬刪) + seed 3 帳號 → R_SUPER/R_ADMIN/R_USER_COMMON；getUserInfo `roles` = sys_user_role join sys_role.code；`buttons` = 程式內 `role→[B_CODE]` 矩陣（Super=[B_CODE1,2,3]/Admin=[2,3]/User=[3]、對齊 mock §4.4）；User→User01 alias 用 `sys_user.nick_name` 欄。button/menu 權限管理表格化留 Phase 4。
- **D6 casbin_rule 維持 stock**：013 用 stock adapter seed/讀 policy。casbin_rule soft-delete（可復原 policy）＝**013 後的獨立「受管 RBAC policy 層」feature**（DESIGN §11.6 / Phase 3 #6；需 fork adapter `load_policy`/`remove_*` + casbin_rule 加 deleted_at + §11.6 constitution Amendment）。**不在 013**。
- **D7 error code 參照 mock §4.11 實機值**：成功 `0000`；**login 失敗（帳密錯/user 不存在/空 body 統一）= `1000`**；getUserInfo access token 過期/無效/缺失 = `3333`（expiredTokenCodes→base-web auto-refresh）；**refresh 失敗 = `8888`**（logout、**鐵紀律絕不回 3333/9999/9998**）；enforce deny（權限不足）= rev2 自訂 `5xxx`（mock 未涵蓋 enforce、走 fallback toast、不 logout）。具體 5xxx 數字對 008 `BizCode` 矩陣於 spec 釘。
- **D8 `Res<T>` 泛型化（§2.11）in-scope**：`err`/`err_msg` 從 `impl Res<()>` 改 `impl<T> Res<T>`（`data:None`），login handler 是第一個在 `Res<Dto>` 內提早回業務錯誤的 caller。
- **D9 示範 enforce 路由**：stub `GET /systemManage/getUserList`（用 Phase 4 真實名、前向相容、本 feature 回最小 stub body），seed `p,R_SUPER,...` + `p,R_ADMIN,...`（不給 R_USER_COMMON）→ Super/Admin allow、**User 403**（deny 證明）。
- **D10 acceptance 含 CDP 登入 smoke**：真開瀏覽器 base-web 登入頁 → 填 Super/123456 → 驗登入成功 + getUserInfo 渲染（envelope/code/userName/roles 真對齊）。第一條真 base-web wire、curl 直送 ≠ browser 內 wire。
- **D11 enforce middleware = rev2 自家 axum middleware**：§11.6「axum-casbin 重寫」第一刀（非拷貝 rev1 axum-casbin crate）；fuller rewrite（全路由/metrics/observability）續於 Phase 3 #5。

## 3. 元件分解（單一職責、可獨立測）

| 元件 | 職責 | 依賴 |
|---|---|---|
| `auth/jwt.rs` | JWT 簽發/驗證（HS256、claims roundtrip、驗 exp） | 新 dep `jsonwebtoken`、既有 `JwtConfig`(secret+TTL) |
| `auth/password.rs`（或併 facade） | argon2 verify | 既有 `argon2` |
| `handler/auth.rs` | login / getUserInfo / refreshToken handler（server 首次有 handler 目錄） | jwt / facade / Res |
| `auth/enforce.rs` | rev2 自家 axum enforce middleware + casbin `Enforcer`(RBAC model + 012 stock `SeaOrmAdapter`) | casbin 2.20 / sea-orm-adapter / jwt |
| RBAC facade + seed | sys_role / sys_user_role 讀取 + casbin policy seed | entity / migration |
| `Res<T>` 泛型化 | err 建構子泛型（§2.11） | envelope.rs |

## 4. 資料模型（新 migration 006+，經 010 自動套）

- `sys_role`：`id` BIGSERIAL PK / `code`(R_SUPER…) / `name` / `deleted_at`(009 soft-delete) + partial unique index。
- `sys_user_role`：`user_id` / `role_id`（join、硬刪）；seed user 1→R_SUPER、2→R_ADMIN、3→R_USER_COMMON。
- `sys_user` 加 `nick_name`（User→User01 alias；Super/Admin 的 nick_name=同 user_name）。
- casbin policy seed migration：`p(role,path,method)` for D9 示範路由（維持 casbin_rule stock）。
- 編號（006 sys_role / 007 sys_user_role / sys_user nick_name / casbin seed）於 plan 階段定。

**casbin RBAC model**：`r=sub,obj,act` / `p=sub,obj,act` / `e=some(where p.eft==allow)` / `m=r.sub==p.sub && r.obj==p.obj && r.act==p.act`（subject=role；middleware 對 user 每個 role 試 enforce、任一 allow 即放行）。

**JWT Claims**：標準（`sub`/`exp`/`iat`/`iss`/`aud`）+ `user_id` + `roles`；JWT 攜 roles → middleware enforce 不每請求查 DB（stateless）；getUserInfo 的 roles 仍從 DB 讀（權威源）。

## 5. wire flow（對齊 mock §4.12）

- **login**：`POST /auth/login {userName,password}` → 查 sys_user(active) → argon2 verify → 失敗 `1000` → 成功取 roles + 簽 access/refresh → `Res::ok({token,refreshToken})` `0000`。
- **getUserInfo**：`GET /auth/getUserInfo` Bearer → 驗 access JWT → 查 sys_user + roles → `userName=nick_name`(User→User01) / roles / buttons(矩陣) → `Res::ok({userId:string,userName,roles,buttons})`；token 無效/過期/缺失 → `3333`。
- **enforce**：受保護路由 → middleware 驗 JWT 取 roles → `enforce(role,path,method)` → 全 deny → 403 + envelope(5xxx)。
- **refresh**：`POST /auth/refreshToken` 驗 refresh JWT → 簽新 token；失敗 `8888`（**絕不 3333/9999/9998**）。

## 6. 測試 / acceptance（CLAUDE.md §3 TDD）

**純邏輯 test-first（red→green）**：JWT 簽/驗（roundtrip+exp 拒絕+access/refresh secret 分離）/ argon2 verify / button 矩陣 / `Res<T>` 泛型 / casbin enforce 決策（seeded policy 下 allow/deny）。

**wiring/形狀（無新純邏輯）→ acceptance 覆蓋**：handler + enforce middleware。

**活體 acceptance（C-V、對 dev stack live postgres、沿 011 in-crate `#[ignore]`+env-gate）**：
- login(Super/123456→token) → getUserInfo(`{userId:"1",userName:"Super",roles:["R_SUPER"],buttons}`) + User→User01 alias
- enforce：Super/Admin → `/systemManage/getUserList` 200；**User → 403**
- refresh：refresh JWT → 新 token；壞 refresh → `8888`(非 3333)
- login 帳密錯 → `1000`

**CDP browser smoke（D10）**：base-web 登入頁 → Super/123456 → 登入成功 + getUserInfo 渲染（envelope unwrap/code 分流/LS token/roles 真對齊）。

## 7. scope 邊界（不做、留後續）

- 完整 policy 矩陣(3×12) / 全路由 enforce rollout → Phase 3 #4/#5
- login audit / operator_ip / xdb 來源地 → audit-middleware feature（§2.14/§2.15）
- casbin_rule soft-delete → 受管 RBAC policy 層 feature（D6）
- sys_tokens / 完整 refresh rotation → Phase 5
- dynamic routes（getUserRoutes/getConstantRoutes/isRouteExist）→ Phase 3 #2；redis pub-sub → #3
- button/menu 權限管理表格化 → Phase 4（013 buttons=寫死矩陣）

## 8. 工程紀律

- **無新 workspace crate**（handler/auth 模組進既有 `server` crate）→ 無 Dockerfile builder COPY 缺口；新增 cargo dep `jsonwebtoken`（現行穩定版、spec 釘版本）→ acceptance 順手跑 prod image build sanity（§2.13 守則便宜保險）。
- **兩段式 commit**（動 rust-api worktree：handlers + migrations + deps）。
- 守 007 FR-009（server 不自動 migrate、新 migration 經 010 自動套）+ 009 entity-access lint（新 entity 走 facade）+ 008 envelope。

## 9. 三耦合項收口（進 Phase 3 帶入）

| 項 | 處置 |
|---|---|
| §2.11 `Res<T>` 泛型化 | ✅ **013 in-scope**（D8） |
| §2.14 operator_ip / §2.15 xdb | **延後**（D3 不做 login audit）；歸 audit-middleware feature |
