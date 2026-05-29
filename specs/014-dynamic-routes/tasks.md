---
description: "Task list for 014-dynamic-routes implementation"
---

# Tasks: dynamic-routes

**Input**: Design documents from `/specs/014-dynamic-routes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **enforce 決策 + tree-prune → test-first（red→green）**：`filter_routes_for_roles`（Super→全 / Admin→home+manage〔user,user-detail〕/ User→只 home;父層無可見 child omit;多 role 聯集）、`route_exists_for_roles`（enforce-filtered true/false）。用 `casbin::MemoryAdapter` seed 同 D3 menu policy（沿 013 enforce 決策測試模式）。
- **wiring / 形狀對映**（3 handler + router）→ **由活體 acceptance + CDP smoke 覆蓋**,明示「無新純函式單元測試」處。
- **活體 acceptance** 對 dev stack（curl + psql）+ **CDP dynamic-mode browser smoke**（[contracts §2-§5](./contracts/verification-commands.md)）。

**Organization**：6 phase；3 個 user story phase 對應 spec US1（getUserRoutes 依角色,MVP）/ US2（getConstantRoutes 公開）/ US3（isRouteExist）+ acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔、無未完依賴）
- **[Story]**：US phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 rust-api worktree 內相對路徑（`rust-api/` 為 worktree root）；base-web 改動標明 `base-web/`

> **★ commit 提醒**：本 feature **動 rust-api worktree**（新增 route 模組 + handler + 1 migration）**＋ base-web `.env`**（BASE-WEB-ADAPT、`VITE_AUTH_ROUTE_MODE=dynamic`）→ **兩段式 commit**（worktree commit + push fork、再回外層 bump SHA pin）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）;commit/push/merge 於 `executing-plans` / `finishing` 階段處理。

> **★ §I.2 紀律**：業務 menu 可見性**走 Casbin enforce 過濾**（menu-visibility policy + 013 enforcer）;**非**程式內寫死 map（plan Deviation D-001 re-scope）。constantRoutes 公開不過濾。

> **★ §I.5 / §I.1 紀律**：route 定義 act on **base-web `elegant/routes.ts` 真實 shape**（component `layout.base$view.x` 複合格式）、**未 grep rev1**。最高風險 = shape 不對 base-web 渲染不出 menu（CDP smoke 抓）。

---

## Phase 1: Setup (Pre-flight)

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`;外層在 `014-dynamic-routes`;`docker run ... rev2-admin-rust-api:dev test` 既有基線綠（013 後 server 50+3 ignored + 17 lint〔`--test entity_access_lint`〕+ xdb 9 + adapter 2 ignored）;確認**尚無** 014 產物（`ls rust-api/server/src/route rust-api/migration/src/m20260529_000010*` 皆不存在）;確認 dev stack image + `deploy/secrets/database_url.txt` 可得;確認 013 enforcer 在 `AppState`（`grep enforcer rust-api/server/src/state.rs`）。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：route DTO + 程式內 route 定義 + menu policy seed + enforce filter。**必須先完成才進 user story**。

- [ ] T002 route 模組 + DTO + 程式內 route 定義：`server/src/route/menu.rs`（新）+ `server/src/route/mod.rs`（`pub mod menu;`）+ `main.rs` 加 `mod route;`。DTO：`MenuRoute{id:String,name,path,component,meta:RouteMeta,children:Option<Vec<MenuRoute>>,props:Option<bool>}` / `RouteMeta{title,i18n_key,icon?,order?,hide_in_menu?,keep_alive?,constant?,active_menu?}` / `UserRoute{routes,home}`,全 serde `rename_all="camelCase"` + `Option` 欄 `skip_serializing_if`（[data-model §1](./data-model.md)）。**程式內 route 定義**（[data-model §2](./data-model.md)）：constant 5 條（403/404/500/login/iframe-page,component `layout.blank$view.x`/`layout.base$view.iframe-page`、meta.constant=true）+ business（home `layout.base$view.home` + manage `layout.base` 父含 children manage_user/role/menu/user-detail,component `view.manage_*`）;**id=route name、精確對齊 base-web `elegant/routes.ts`、省略 meta.roles**。`docker run ... build -p server` 過。（[research R1/R2/R6](./research.md)）
- [ ] T003 menu-visibility policy seed migration：`migration/src/m20260529_000010_seed_menu_policy.rs`（INSERT `p,<role>,<route_name>,menu` 進 casbin_rule、`ON CONFLICT DO NOTHING`、沿 013 `m..009` casbin seed 寫法）+ `migration/src/lib.rs` 註冊 010。**9 rows**（[data-model §3](./data-model.md)；= 矩陣 ✓ 數 Super5+Admin3+User1，原稿誤植 8、impl 階段修正）：home→全 3 role;manage_user/manage_user-detail→R_SUPER+R_ADMIN;manage_role/manage_menu→R_SUPER。casbin_rule 維持 012 stock（v2=`menu`、無 deleted_at）。**父層 manage 不 seed**（tree-prune 計算）。（[research R3/R4](./research.md)）
- [ ] T004 enforce-based filter + 單測：`server/src/route/menu.rs` 加 `filter_routes_for_roles(roles:&[String], enforcer:&Enforcer) -> Vec<MenuRoute>`（對每 business 葉 route `enforce((role,route_name,"menu"))`、任一 allow 即收;**父層 manage tree-prune**：子項任一可見則保留、children 只留 visible、否則整個 omit;home 葉直接判）+ `route_exists_for_roles(name:&str, roles:&[String], enforcer:&Enforcer) -> bool`。**test-first 單測**（用 `casbin::MemoryAdapter` + RBAC model seed 同 D3 的 9 條 menu policy）：Super→全集 / Admin→home+manage〔user,user-detail〕/ User→只 home〔manage omit〕;`route_exists` User×manage_role→false、×home→true;method/obj 不符→false。沿 013 enforce 決策測試模式。依 T002/T003。（[research R3](./research.md) / [data-model §4](./data-model.md)）

**Checkpoint**：route DTO + 定義就緒 + menu policy 經 010 就緒 + enforce filter（單測綠）;entity-access lint 仍綠（route 模組不碰 `entity::`）

---

## Phase 3: User Story 1 — 登入後依角色取得選單（Priority: P1）🎯 MVP

**Goal**：getUserRoutes 依角色經 Casbin enforce 過濾供應 menu（Super 全 / Admin 部分 / User 只 home）+ home 鍵。

**Independent Test**：dev stack up → 三角色 login 拿 token → `GET /auth... getUserRoutes` Bearer → Super 含 home+manage〔4 children〕、Admin 含 home+manage〔user,user-detail〕、User 只 home;token 壞 `3333`。

- [ ] T005 [US1] get_user_routes handler：`server/src/handler/route.rs`（新）`get_user_routes(State<AppState>, HeaderMap) -> Res<UserRoute>`（bearer→`jwt::verify`(access secret + `JWT_AUD`)→ `roles_for_user(&state.db, claims.user_id)` → `menu::filter_routes_for_roles(&roles, &*state.enforcer.read().await)` → `Res::ok(UserRoute{routes, home:"home".into()})`;token 無效/缺 → `Res::<UserRoute>::err(BizCode::TokenExpired)`）。重用 013 `auth::bearer::bearer_token` + `jwt::verify` + `JWT_AUD` + `state.enforcer`。**無新純函式單元測試（wiring）→ 由 acceptance 覆蓋**。對應 spec US1 FR-001/FR-002/FR-003 + SC-001。（[data-model §5](./data-model.md)）
- [ ] T006 [US1] router wiring：`server/src/main.rs` 加 `/route/getUserRoutes`（GET）route + `handler::route` 掛載（**不掛 enforce middleware** — 過濾在 handler 內）。`cargo build -p server` 過。
- [ ] T007 [US1] curl acceptance（[verification §1/§3](./contracts/verification-commands.md)）：dev stack up（postgres + `run --rm migrate` 套 001..010）+ rust-api up;三角色 login → getUserRoutes Bearer → Super〔top=[home,manage]、manage children 4〕/ Admin〔manage children=[manage_user,manage_user-detail]〕/ User〔top=[home]、無 manage〕+ `home="home"`;token 缺/壞 → `3333`。psql 確認 menu policy 9 rows（`v2='menu'`）。對應 spec US1 + SC-001。

**Checkpoint**：US1 curl 達成（getUserRoutes 依角色 enforce 過濾）= MVP 核心

---

## Phase 4: User Story 2 — 應用啟動取得常數路由（Priority: P2）

**Goal**：getConstantRoutes 公開回 constant 5 條（登入前可用）。

**Independent Test**：不帶 Bearer `GET /route/getConstantRoutes` → 回 403/404/500/login/iframe-page。

- [ ] T008 [US2] get_constant_routes handler + router：`handler/route.rs` 加 `get_constant_routes() -> Res<Vec<MenuRoute>>`（**公開、無認證、不過濾**,回 `menu` 的 constant 5 條）;`main.rs` 加 `/route/getConstantRoutes`（GET、無 JWT、不掛任何 middleware）。`cargo build -p server` 過。對應 spec US2 FR-004 + SC-002。
- [ ] T009 [US2] curl acceptance（[verification §2](./contracts/verification-commands.md)）：`curl :21081/route/getConstantRoutes`（無 Bearer）→ code `0000`、data 含 403/404/500/login/iframe-page,component 為 `layout.blank$view.*`/`layout.base$view.iframe-page`、meta.constant=true。對應 spec US2 + SC-002。

**Checkpoint**：US1+US2 = 登入後 menu + 啟動 constant routes（dynamic mode boot 前置就緒）

---

## Phase 5: User Story 3 — 路由存在性依角色查驗（Priority: P3）

**Goal**：isRouteExist 經 enforce 依角色查名（role-filtered allow+deny）。

**Independent Test**：Super×manage_role→true、User×manage_role→false、皆 home→true。

- [ ] T010 [US3] is_route_exist handler + router：`handler/route.rs` 加 `is_route_exist(State<AppState>, HeaderMap, Query{routeName}) -> Res<bool>`（驗 JWT → roles → `menu::route_exists_for_roles(&route_name, &roles, &*state.enforcer.read().await)` → `Res::ok(bool)`;token 壞 → `Res::<bool>::err(3333)`）;`main.rs` 加 `/route/isRouteExist`（GET、JWT、query `routeName`）。**無新純函式單元測試（重用 T004 filter）→ 由 acceptance 覆蓋**。對應 spec US3 FR-005 + SC-003。
- [ ] T011 [US3] curl acceptance（[verification §4](./contracts/verification-commands.md)）：`isRouteExist?routeName=manage_role` Super→`true`、User→`false`（deny）;`?routeName=home` 皆 `true`。對應 spec US3 + SC-003。

**Checkpoint**：三 endpoint curl 全綠（getUserRoutes 依角色 / getConstantRoutes 公開 / isRouteExist allow+deny）

---

## Phase 6: Integration（CDP dynamic-mode）+ Polish

- [ ] T012 [US1] CDP dynamic-mode browser smoke（[verification §5](./contracts/verification-commands.md)、firm acceptance、**依賴 US1+US2+US3 三 endpoint 皆完成**）：
    * (a) **base-web `.env` 翻 dynamic**（BASE-WEB-ADAPT 軌道）：`VITE_AUTH_ROUTE_MODE=static` → `dynamic`;**動 base-web worktree → base-web 亦走兩段式 commit**;base-web 重啟讀新 env。
    * (b) ⚠️ **翻 dynamic 前先 curl 驗 T007/T009/T011 三 endpoint 全綠**（getConstantRoutes 每次 reload 觸發、沒做好 base-web reload 會壞）。
    * (c) **CDP（9229、沿 013 `tests/` harness）**：reload → 登入頁顯示（getConstantRoutes 觸發）→ 登入 Super〔側邊欄含「系统管理」完整〕vs 登入 User〔側邊欄**只「首页」**= menu deny 證明〕;Network 確認 getUserRoutes 打 rust-api、兩角色 routes 不同。
    * **CDP defer 紀律**（同 013 analyze C1）：CDP 為 **firm**;若 base-web build/設定阻礙致 CDP 臨時 defer → **必須全部**：(i) curl (b) 仍全綠、(ii) plan.md Deviation Log 記 defer、(iii) CHECKLIST Follow-up 登記補 CDP、(iv) 回報 user 定奪。
    * 對應 spec US1 SC-001（瀏覽器端到端）+ US3 deny 視覺。
- [ ] T013 既有不破 + 契約守恆 + Constitution 自查（[verification §0](./contracts/verification-commands.md)）：
    * (a) 既有 + 新單測全綠：`docker run ... rev2-admin-rust-api:dev test`（013 後 50+3 ignored server + 新增 014 filter/route_exists 單測 + 17 lint + xdb 9）
    * (b) **009 entity-access lint 續綠**：`cargo test -p server --test entity_access_lint`（**用 `--test`、非 bare filter**;route 模組不碰 `entity::`、roles 經 facade）= 17 passed
    * (c) **prod build sanity**：`DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime .`（無新 dep/crate、跨 feature 守則保險）
    * (d) **FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中
    * (e) **scope 邊界**（FR-008）：`SELECT count(*) FROM casbin_rule WHERE v2='menu'`=9（menu policy）;`v2='GET'`=2（013 endpoint policy 不受影響）;無新表（`\dt sys_menu` 不存在）;route 模組不碰 entity;3 endpoint 不掛 access middleware（`grep from_fn rust-api/server/src/main.rs` 僅 013 的 enforce_mw layer、route 三條無）
    * (f) **Constitution 自查**：`grep -c "✅ Pass" specs/014-dynamic-routes/plan.md` ≥ 14（7+7）;Deviation D-001（§I.2 re-scope）已記
    * (g) `/health` 不破：`curl :21081/health`=ok

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit + base-web .env）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup;**阻斷所有 user story**（route DTO/defs + menu policy + enforce filter）
- **US1(Phase 3,P1)**：依 Foundational（T002 route defs + T003 policy + T004 filter）;MVP
- **US2(Phase 4,P2)**：依 Foundational（T002 constant defs）;與 US1 獨立（不同 handler fn、同 handler/route.rs 檔序列）
- **US3(Phase 5,P3)**：依 Foundational（T004 route_exists_for_roles）;與 US1/US2 獨立
- **T012 CDP(Phase 6)**：**依 US1+US2+US3 三 endpoint**（dynamic mode 需 constant + user routes + nav）+ base-web .env
- **T013 Polish**：依所有 user story

### Within / Cross Phases

- Foundational：T002（route DTO/defs）先;T003（policy migration）/ T004（filter,依 T002 defs）。
- US1：T005（handler）→ T006（router）→ T007（curl）。
- US2：T008（handler+router）→ T009（curl）;與 US1 同 `handler/route.rs`/`main.rs` 檔、序列協調。
- US3：T010（handler+router）→ T011（curl）;同 `handler/route.rs`/`main.rs`、序列。
- T012 CDP 在三 endpoint 後;T013 最後。

### Parallel Opportunities

- T003（policy migration、migration/）/ T004（filter、route/menu.rs）邏輯獨立,但 T004 依 T002 route defs → 序列較穩。
- handler/route.rs（US1/US2/US3 三 fn）/ main.rs（三 route）多 task 共改 → 同檔協調、序列或小心 merge。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T004)→ US1（T005-T007 curl）
2. **STOP and VALIDATE**：getUserRoutes 三角色 enforce 過濾 curl 綠 = 後端控 menu 核心證明 = MVP
3. + US2（getConstantRoutes）+ US3（isRouteExist）→ 三 endpoint 齊
4. + T012 CDP dynamic-mode browser smoke（翻 .env dynamic、Super vs User menu 差異）
5. + T013 Polish（既有不破 + lint〔--test〕 + prod build + FR-009 + scope + Constitution）
6. `superpowers:finishing-a-development-branch` → **兩段式 commit**（rust-api worktree push fork + 外層 SHA pin;base-web .env dynamic 亦兩段式）+ merge --no-ff 回 `rev2-admin-root` + 回填 DESIGN/CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy（executing-plans 階段）

- Foundational(T002-T004)：route DTO/defs（T002 一個 implementer、最高風險 shape 對齊）、policy migration（T003）、enforce filter + 單測（T004 test-first）。
- US1(T005-T007)/ US2(T008-T009)/ US3(T010-T011)：handler + router + curl,各對照 spec 驗收。
- T012 CDP（沿 013 harness）/ T013 Polish。
- **★ commit 紀律**：兩段式 commit（動 rust-api worktree + base-web .env）;各 unit spec+quality 雙審。

---

## Notes

- **兩段式 commit feature**：動 rust-api worktree（route 模組 + migration 010）+ base-web .env（BASE-WEB-ADAPT、`VITE_AUTH_ROUTE_MODE=dynamic`）;與 013 同。
- **menu 走 Casbin enforce**（§I.2、Deviation D-001 re-scope）+ **dynamic mode 副作用：demo menu 不送 → §11.5 隱藏 demo moot**。
- **無新 dep / 無新表 / 無新 crate**;重用 013 enforcer/jwt/bearer/roles_for_user + 008 envelope。
- **最高風險**：route 物件 component（`layout.base$view.x` 複合格式）/meta shape 對齊 base-web `elegant/routes.ts`（CDP smoke 抓）;menu policy obj/act（route_name × `menu`）與 enforce 呼叫一致;父層 tree-prune（非 seed parent policy）。
- 守 007 FR-009（menu policy 經 010 自動套、server 不自動 migrate）+ 009 entity-access lint（route 模組不碰 entity）+ 008 envelope + §I.2/§I.3。
- `superpowers:executing-plans` 階段把這 13 個 task 編成 execution unit + 派 fresh implementer subagent。
