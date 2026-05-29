---
description: "Task list for 013-auth-login-enforce implementation"
---

# Tasks: auth-login-enforce

**Input**: Design documents from `/specs/013-auth-login-enforce/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **純函式邏輯 → test-first（red→green）**：JWT 簽/驗（roundtrip + exp 拒絕 + access/refresh secret 分離）、argon2 password verify、button `role→[B_CODE]` 矩陣、`Res<T>` 泛型、enforce 決策（seeded policy 下 allow/deny）。
- **wiring / 形狀對映**（handler + enforce middleware + router）→ **由活體 acceptance + CDP smoke 覆蓋**，明示「無新純函式單元測試」處。
- **活體 acceptance** 對 dev stack live postgres（沿 011 in-crate `#[ignore]` + env-gate `DATABASE_URL`）+ **首次 CDP browser 登入 smoke**（[contracts §2/§3/§4/§5](./contracts/verification-commands.md)）。

**Organization**：6 phase；3 個 user story phase 對應 spec US1（登入+getUserInfo,MVP）/ US2（enforce allow+deny）/ US3（最小換發）+ acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔、無未完依賴）
- **[Story]**：US phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 rust-api worktree 內相對路徑（`rust-api/` 為 worktree root）；base-web 改動標明 `base-web/`

> **★ commit 提醒**：本 feature **動 rust-api worktree**（新增 auth/handler/facade 模組 + 4 migration + entity + Res<T> 泛型 + enforcer）**＋ base-web `.env`**（BASE-WEB-ADAPT、for CDP smoke）→ **兩段式 commit**（worktree commit + push fork、再回外層 bump SHA pin;rust-api 同 007/008/009/011/012、base-web 若改 .env 亦走兩段式）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）；commit/push/merge 於 `executing-plans` / `finishing` 階段處理。

> **★ §I.5 紀律**：login/getUserInfo/enforce 全新寫、**不 grep rev1**;enforce middleware = §11.6「axum-casbin 重寫」第一刀（非拷貝）。wire 權威 = base-web mock + `auth.d.ts`。

---

## Phase 1: Setup (Pre-flight)

**Purpose**：確認前置就緒。

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`;外層在 `013-auth-login-enforce`;`docker run ... rev2-admin-rust-api:dev test` 既有基線綠（25+3 ignored server + 17 entity_access_lint + xdb 9 + adapter 2 ignored）;確認**尚無** 013 產物（`ls rust-api/server/src/auth rust-api/server/src/handler rust-api/migration/src/m20260529_000006*` 皆不存在）;確認 dev stack image + `deploy/secrets/database_url.txt` 可得。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：所有 user story 的共同前提（deps + Res<T> + JWT + schema + facade）。**必須先完成才進 user story**。

- [ ] T002 deps + 編譯閘門：`rust-api/Cargo.toml` `[workspace.dependencies]` 加 `jsonwebtoken`（**§6 紀律：安裝前確認 crates.io max_stable、非 pre-release**,預期 9.x）;`rust-api/server/Cargo.toml` 加 `jsonwebtoken`（workspace）+ `casbin = { workspace = true }` + `sea-orm-adapter = { path = "../sea-orm-adapter" }`（enforce 用）。`docker run ... rev2-admin-rust-api:dev build -p server` 過。（[research R2/R3/R7](./research.md)）
- [ ] T003 [P] `Res<T>` 泛型化（§2.11）：`server/src/envelope.rs` 把 `err`/`err_msg` 從 `impl Res<()>` 移到 `impl<T> Res<T>`（`data` 已 `Option<T>`、純 relocate）;既有 `Res::<()>::err` callsite（008 fallback）相容。**單元測試**：`Res::<SomeDto>::err(code)` 回 `data:None` + code/msg 正確。（[research R5](./research.md)）
- [ ] T004 [P] JWT 模組 + 單測：`server/src/auth/jwt.rs` —— HS256 簽/驗;`Claims{sub,user_id,roles,exp,iat,iss,aud}`;access 用 `jwt_secret`、refresh 用 `refresh_token_secret`（JwtConfig 既有）;TTL 各自。**test-first 單測**：簽→驗 roundtrip、**過期 token 驗拒絕**、access/refresh secret 不互通、壞簽章拒絕。（[research R2](./research.md) / [data-model §4](./data-model.md)）
- [ ] T005 entities + migrations（經 010 自動套）：`entity/src/{sys_role,sys_user_role}.rs` 新 entity + `sys_user.rs` 加 `nick_name`;migration `m20260529_000006_create_sys_role`（`code`/`name`/`deleted_at` + partial unique `code WHERE deleted_at IS NULL`、沿 009 soft-delete）/ `..007_create_sys_user_role`（join + seed user 1→R_SUPER·2→R_ADMIN·3→R_USER_COMMON）/ `..008_alter_sys_user_nick_name`（+ seed nick_name Super/Admin/**User01**）/ `..009_seed_casbin_policy`（`p,R_SUPER,/systemManage/getUserList,GET` + `p,R_ADMIN,...`、casbin_rule 維持 stock）;`migration/src/lib.rs` 註冊 006-009。（[data-model §1/§2](./data-model.md) / [research R4](./research.md)）
- [ ] T006 facade + button 矩陣：`server/src/model/facade/{sys_role,sys_user_role}.rs`（角色讀取、唯一 entity 寫入管道、守 009 entity-access lint）;button `role→[B_CODE]` 矩陣常量（`R_SUPER→[B_CODE1,B_CODE2,B_CODE3]`/`R_ADMIN→[B_CODE2,B_CODE3]`/`R_USER_COMMON→[B_CODE3]`、對齊 mock §4.4）。**單元測試**：button 矩陣三 role 映射。依 T005。（[data-model §7/§8](./data-model.md)）

**Checkpoint**：deps 編譯 + Res<T> 泛型 + JWT 模組 + schema/seed 經 010 就緒 + facade/button 矩陣;entity-access lint 仍綠（新 entity 經 facade）

---

## Phase 3: User Story 1 — 登入取得憑證並取回使用者資料（Priority: P1）🎯 MVP

**Goal**：base-web 登入流程對 rev2 端到端接通：login 拿 token、getUserInfo 取回 `{userId,userName,roles,buttons}`（含 User→User01 alias）。

**Independent Test**：dev stack up → `POST /auth/login {Super,123456}` 拿 token → `GET /auth/getUserInfo` Bearer → 正確使用者資料;User 登入 getUserInfo `userName=User01`;帳密錯 `1000`、token 壞/缺 `3333`;瀏覽器登入端到端。

- [ ] T007 [US1] login handler + DTO：`server/src/handler/auth.rs` `login`（`LoginReq{userName,password}` → 查 sys_user(active facade) → **argon2 verify** → 失敗 `Res::<LoginToken>::err(1000)` → 成功取 roles(facade) + JWT 簽 access/refresh → `Res::ok(LoginToken{token,refreshToken})`）;`LoginToken`/`LoginReq` DTO serde `rename_all="camelCase"`。**argon2 verify 單測**（對/錯）。對應 spec US1 FR-001/FR-002 + SC-001。（[data-model §3](./data-model.md)）
- [ ] T008 [US1] getUserInfo handler：`handler/auth.rs` `get_user_info`（驗 access JWT（T004）→ 取 user_id → facade 查 sys_user(nick_name) + sys_user_role join sys_role.code → `userName=nick_name`(User→User01)、`roles`、`buttons`(矩陣 T006) → `Res::ok(UserInfo{userId:String,userName,roles,buttons})`;token 無效/過期/缺 → `Res::<UserInfo>::err(3333)`）;`UserInfo` DTO camelCase + userId string。**無新純函式單元測試（wiring）→ 由 acceptance 覆蓋**。對應 FR-003/FR-004。（[data-model §3](./data-model.md) / [research R1](./research.md)）
- [ ] T009 [US1] router wiring：`server/src/main.rs` 加 `/auth/login`（POST）+ `/auth/getUserInfo`（GET）route + handler 模組掛載;AppState 不變（enforcer 於 US2 加）。確認 `cargo build -p server` 過。
- [ ] T010 [US1] Acceptance（[verification §1/§2/§5](./contracts/verification-commands.md)）：
    * (a) dev stack up（postgres + `run --rm migrate` 套 001..009）+ rust-api up
    * (b) **curl 活體（firm、無論如何必綠）**：login Super→token → getUserInfo `{userId:"1",userName:"Super",roles:["R_SUPER"],buttons}`;User→`User01` alias;帳密錯 `1000`;token 缺/壞 `3333`
    * (c) **base-web `.env` 切 rev2（BASE-WEB-ADAPT 軌道、[research R8](./research.md)）**：`VITE_SERVICE_BASE_URL`→rev2（dev 直連 `:21081` 或 front-nginx `/api`、§11.11）;**動 base-web worktree → base-web 亦走兩段式 commit**;vite build-time env → base-web dev server 讀新 `.env` 或重 build（連動 [CHECKLIST §2.8/§5.5](../../docs/INTEGRATION-CHECKLIST.md)）
    * (d) **CDP browser 登入 smoke（firm acceptance）**：base-web 登入頁 Super/123456 → 登入成功跳轉 + getUserInfo 渲染對齊（envelope unwrap / code 分流 / LS `SOY_token` / userName / roles）
    * **CDP defer 紀律（analyze C1）**：CDP 為 **firm**;若 (c) 的 base-web build/設定阻礙致 CDP 臨時 defer,**必須全部**：(i) curl (b) 仍全綠、(ii) plan.md Deviation Log 記 defer 原因、(iii) CHECKLIST Follow-up Backlog 登記補 CDP、(iv) 回報 user 定奪 —— 不得靜默跳過（[CLAUDE.md §3](../../CLAUDE.md) CDP defer 風險自覺）
    * 對應 spec US1 + SC-001。

**Checkpoint**：US1 達成（base-web 登入→getUserInfo 端到端）= MVP

---

## Phase 4: User Story 2 — 受保護資源依角色授權放行或拒絕（Priority: P2）

**Goal**：首次啟用 Casbin enforce（rev2 自家 axum middleware）;示範路由 Super/Admin allow、User deny。

**Independent Test**：seeded policy（T005）下,Super/Admin 打 `/systemManage/getUserList` → 200;User → 403 + 5xxx。

- [ ] T011 [US2] enforce 機制 + middleware：`server/src/auth/enforce.rs` —— casbin RBAC model（[data-model §5](./data-model.md)）+ `Enforcer`（model + 012 `SeaOrmAdapter::new(db)`、stock）;`state.rs` `AppState` 加 `enforcer: Arc<RwLock<Enforcer>>`（boot load_policy）;`main.rs` boot 建 Enforcer;**rev2 自家 axum middleware**（`from_fn_with_state`：驗 access JWT → 取 roles → 對每 role `enforce((role,path,method))` → 全 deny → 403 + `Res::err(<5xxx 權限不足>)`）。**新增 `BizCode` deny variant `5003`「權限不足」**（analyze C2 釘:008 矩陣 `5000`=infra sentinel、`5001-5999` 留業務、`5003` 未用;executing-plans 加 variant + `code()`/`default_msg()`,base-web 對非列舉碼 fallback toast 不登出）。**enforce 決策單測**（seeded policy 下 role allow/deny;可用 in-mem 或 live）。enforce 為 **§11.6「axum-casbin 重寫」第一刀（非拷貝 rev1）**。對應 spec US2 FR-005/FR-006 + SC-002。（[research R3/R6](./research.md)）
- [ ] T012 [US2] 示範受保護路由 + middleware 掛載：`handler/auth.rs`（或新 handler）加 `GET /systemManage/getUserList` stub（最小 body）;`main.rs` 對該路由套 enforce middleware layer（[data-model §6](./data-model.md)）。確認 `cargo build -p server` 過。
- [ ] T013 [US2] Acceptance：[verification §3](./contracts/verification-commands.md) —— Super/Admin Bearer → `/systemManage/getUserList` **200**;User Bearer → **403** + envelope code `5xxx`（權限不足）。對應 spec US2 + SC-002。

**Checkpoint**：US1+US2 = 登入身分 + 首次 enforce allow+deny

---

## Phase 5: User Story 3 — 存取憑證過期換發新憑證（Priority: P3）

**Goal**：最小無狀態 refresh;失敗回 `8888`（絕不 3333/9999/9998）。

**Independent Test**：有效 refreshToken → 新 access;壞 refreshToken → `8888`。

- [ ] T014 [US3] refreshToken handler：`handler/auth.rs` `refresh_token`（`RefreshReq{refreshToken}` → 驗 refresh JWT（refresh_token_secret + exp、T004）→ 簽新 access（可順手新 refresh）→ `Res::ok(LoginToken)`;驗失敗 → `Res::<LoginToken>::err(8888)`、**絕不回 3333/9999/9998**）;`main.rs` 加 `/auth/refreshToken`（POST）。**無新純函式單元測試（重用 JWT 模組）→ 由 acceptance 覆蓋**。對應 spec US3 FR-007 + SC-003。
- [ ] T015 [US3] Acceptance：[verification §4](./contracts/verification-commands.md) —— 有效 refresh → 新 token（code `0000`）;壞 refresh → code `8888`（grep 確認回應**非** 3333/9999/9998）。對應 spec US3 + SC-003。

**Checkpoint**：三 user story 全達成（登入身分 / enforce allow+deny / 換發）

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**：既有不破 + 契約守恆 + scope 邊界 + Constitution 自查。

- [ ] T016 既有不破 + 契約守恆 + Constitution 自查（[verification §0/§6](./contracts/verification-commands.md)）：
    * (a) 既有 + 新單測全綠：`docker run ... rev2-admin-rust-api:dev test`（25+3 ignored server + 17 lint + xdb 9 + 新增 JWT/argon2/button/Res<T>/enforce 單測）
    * (b) **009 entity-access lint 續綠**：`cargo test -p server entity_access_lint`（新 entity sys_role/sys_user_role 經 facade）
    * (c) **prod build sanity**：`DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime .`（新 dep jsonwebtoken;無新 workspace crate、跨 feature 守則保險）
    * (d) **FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中（server 不自動 migrate）
    * (e) `/health` 不破 + seed：`curl -fsS :21081/health`=ok;`SELECT count(*) FROM sys_user WHERE deleted_at IS NULL` >= 3
    * (f) **scope 邊界**（FR-011）：`SELECT count(*) FROM casbin_rule`=2（僅示範路由 × 2 role、無完整矩陣）;casbin_rule 無 `deleted_at` 欄;handler 不接 login audit（`grep mutate_in_txn rust-api/server/src/handler/` 無命中）;無 dynamic routes（getUserRoutes 等未做）
    * (g) **Constitution 自查**：`grep -c "✅ Pass" specs/013-auth-login-enforce/plan.md` ≥ 14（7+7）;若觸發 deviation（如 CDP defer / Enforcer 鎖型別）→ plan Deviation Log 已補

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit + base-web .env）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup;**阻斷所有 user story**（deps + Res<T> + JWT + schema/seed + facade）
- **US1(Phase 3,P1)**：依 Foundational（T002 deps + T003 Res<T> + T004 JWT + T005 schema + T006 facade/button）;MVP
- **US2(Phase 4,P2)**：依 Foundational（T004 JWT verify + T005 casbin seed）+ US1 的 router（共用 main.rs）;首次 enforce
- **US3(Phase 5,P3)**：依 Foundational（T004 JWT）+ US1 handler（共用 auth.rs）;與 US2 獨立
- **Polish(Phase 6)**：依所有 user story

### Within / Cross Phases

- Foundational：T002（deps）先;T003（Res<T>）/ T004（JWT）[P]（不同檔、獨立）;T005（schema）→ T006（facade 依 entity）。
- US1：T007（login）→ T008（getUserInfo）→ T009（router）→ T010（acceptance）。
- US2：T011（enforce 機制）→ T012（示範路由 + 掛 middleware）→ T013（acceptance）;T011/T012 同涉 main.rs/state.rs,與 US1 T009 同檔協調。
- US3：T014（refresh）→ T015（acceptance）;T014 同 auth.rs（與 US1 T007/T008 同檔、序列）。

### Parallel Opportunities

- T003（Res<T>、envelope.rs）/ T004（JWT、auth/jwt.rs）[P]（不同檔、無共用）。
- US3（T014 refresh）與 US2（T011-T013）邏輯獨立,但 T014 同 auth.rs（與 US1 同檔）+ acceptance 共用 dev stack → 序列驗較穩。
- handler（auth.rs）/ main.rs / state.rs 多 task 共改 → 同檔協調、序列或小心 merge。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T006)→ US1（T007-T010）
2. **STOP and VALIDATE**：base-web 登入→getUserInfo 端到端綠（curl + CDP）= 認證地基接通 = MVP
3. 達 MVP：登入流程對 rev2 真接通

### Incremental Delivery

1. Foundational → US1 登入+getUserInfo（MVP）
2. + US2 首次 enforce（allow+deny）
3. + US3 最小換發
4. + Polish（既有不破 + lint + prod build sanity + FR-009 + scope 邊界 + Constitution）
5. `superpowers:finishing-a-development-branch` → **兩段式 commit**（rust-api worktree push fork + 外層 SHA pin;base-web .env 若改亦兩段式）+ merge --no-ff 回 `rev2-admin-root` + 回填 DESIGN/CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy（executing-plans 階段）

- Foundational(T002-T006)：deps/Res<T>/JWT/schema/facade —— JWT（T004）一個 implementer（含 test-first 單測）、schema+facade（T005/T006）一個、Res<T>（T003）小單元。
- US1(T007-T010)/ US2(T011-T013)/ US3(T014-T015)：handler + middleware + acceptance,各對照 spec 驗收。
- Polish(T016)：守恆 + 查核。
- **★ commit 紀律**：兩段式 commit（動 rust-api worktree + base-web .env）;各 unit spec+quality 雙審。

---

## Notes

- **兩段式 commit feature**：動 rust-api worktree（auth/handler/facade + migration + entity + enforcer）+ base-web .env（BASE-WEB-ADAPT、CDP smoke）;與 007/008/009/011/012 同（rust-api）。
- **首次啟用 Casbin enforce**（§I.2 核心突破機制落地）+ **首次真接 base-web wire**（§I.1、CDP smoke）。
- **enforce = §11.6「axum-casbin 重寫」第一刀**（非拷貝 rev1）;用 012 引入的 sea-orm-adapter（stock、非 013 新拷貝）。
- **§I.5 紀律**：login/getUserInfo/enforce 全新寫、research 未 grep rev1;wire 權威 = base-web mock + auth.d.ts。
- **error code**：1000/3333/8888 為 008 既有 BizCode variant;deny `5xxx` 需新增 variant（T011）。
- 守 007 FR-009（casbin/role schema 經 010 自動套、server 不自動 migrate）+ 009 entity-access lint（新 entity 經 facade）+ 008 envelope。
- **最高風險**（plan Complexity Tracking）：wire DTO camelCase 3 端對齊 / CDP smoke base-web .env→rev2 設定相依 / Enforcer `Arc<RwLock>` 並發。任何偏離 plan 須記 plan.md Deviation Log（Constitution §V）。
- `superpowers:executing-plans` 階段把這 16 個 task 編成 execution unit + 派 fresh implementer subagent。
