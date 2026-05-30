---
description: "Task list for 017-manage-menu-list implementation"
---

# Tasks: manage-menu-list

**Input**: Design documents from `/specs/017-manage-menu-list/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **純邏輯 → test-first（red→green）**：`build_menu_tree`（parent_id→巢狀、menu_order 排序、孤兒處理）、root-slice 分頁（reuse 016 `normalize_page`、clamp 100）、`pages_for_roles`（Super real+demo / Admin real / multi-role union）、`route_ext` JSONB↔wire 攤平（href/query/multiTab/fixedIndexInTab、null→四欄 null）、facade `all_active` SQL-build（`deleted_at IS NULL` + `ORDER BY menu_order`）。
- **wiring / 形狀對映**（handler 接線 / enforce route_layer / Query extractor / getAllPages role 讀取 / tree fetch）→ **由活體 acceptance（curl + psql）覆蓋**,明示「無新純函式單元測試」處。
- **無 CDP**（純後端 read;base-web manage/menu tree-table 渲染 + role 選單授權 modal 留 prod-stack 巡檢 [CHECKLIST §2.8](../../docs/INTEGRATION-CHECKLIST.md)）。

**Organization**：6 phase；3 個 user story phase 對應 spec US1（getMenuList/v2 分頁樹,MVP）/ US2（getMenuTree 輕量樹）/ US3（getAllPages role-aware）+ Polish。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔、無未完依賴）
- **[Story]**：US phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 **rust-api worktree 內相對路徑**（`rust-api/` 為 worktree root）

> **★ commit 提醒**：本 feature **純動 rust-api worktree**（2 migration + 1 entity〔新 sys_menu〕+ 1 facade〔新 sys_menu〕+ handler/system_manage.rs 擴充 + main.rs）→ **兩段式 commit**（worktree commit + push fork、外層 commit〔spec docs〕+ bump rust-api SHA pin）。**不動 base-web、不動 014、無外層 deploy 改動**（plan Structure Decision）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）;commit/push/merge 於 `executing-plans`/`finishing` 階段處理。

> **★ 核心紀律**：id wire = **number**（constitution v1.1.0、i64 直序列化）;`route_name`=string、unique(active)、casbin `v2='menu'` 對齊鍵。**JSONB 用 011 先例**（entity `Option<Json>` + migration `.json_binary()`）。**getMenuList 非 016 DB 分頁** = 取全 active + 記憶體 `build_menu_tree` + 頂層 slice（D-A）。**getAllPages 唯一 role-aware**（`Claims.roles` 判 Super、double-JWT defer §2.17、D-B）。**不動 014 getUserRoutes**、**可見性續住 casbin**（不建 sys_role_menu）、**demo 頁只進 getAllPages catalog 不 seed 成 menu**（D-D/D-E）。

---

## Phase 1: Setup (Pre-flight)

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`;外層在 `017-manage-menu-list`;`docker run ... rev2-admin-rust-api:dev test` 既有基線綠（016 後 server 92+3 ignored + 17 lint〔`--test entity_access_lint`〕+ xdb 9）;確認**尚無** 017 產物（`ls rust-api/entity/src/sys_menu.rs rust-api/server/src/model/facade/sys_menu.rs rust-api/migration/src/m20260529_000016*` 皆不存在）;確認 dev image + `deploy/secrets/database_url.txt` 可得;確認承接點存在（`grep -n "payload_before: Option<Json>" rust-api/entity/src/sys_operation_log.rs` + `grep -n "json_binary" rust-api/migration/src/m20260529_000004*`〔JSONB 先例〕 / `grep -n "pub fn normalize_page\|struct PageResp" rust-api/server/src/handler/system_manage.rs`〔016 既有〕 / `grep -n "pub roles" rust-api/server/src/auth/jwt.rs`〔Claims.roles〕 / `grep -n "pub async fn enforce_mw" rust-api/server/src/auth/enforce.rs` / `grep -n "business_routes" rust-api/server/src/route/menu.rs`〔014 6 節點 seed 對照、**不改此檔**〕 / `grep -c "v2='menu'" rust-api/migration/src/m20260529_000010*`〔既有 9 條 menu 政策對齊〕）。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：sys_menu 儲存（建表 + seed + entity + facade）+ endpoint policy seed。**必須先完成才進 user story**（三 US 皆依賴 sys_menu 表/facade）。

- [ ] T002 migrations + register：`migration/src/m20260529_000016_create_sys_menu.rs`（建 sys_menu 21 欄〔[data-model §1](./data-model.md):id BIGSERIAL PK / route_name string not_null / parent_id big_integer not_null default 0 / menu_type·menu_name·route_path not_null / component·icon·icon_type·i18n_key·active_menu string null / menu_order integer null / keep_alive·constant·hide_in_menu boolean null / **route_ext·buttons `.json_binary().null()`** / status string not_null default '1' / created_at timestamptz not_null default now() / updated_at·deleted_at timestamptz null〕+ **partial unique** `sys_menu_route_name_active_uniq` ON (route_name) WHERE deleted_at IS NULL + **同檔 seed 6 節點**〔home/manage 頂層先插、4 children parent_id 用 `(SELECT id FROM sys_menu WHERE route_name='manage')` subquery、值對齊 014 business_routes、同 013 套路〕;`down` drop table）+ `m20260529_000017_seed_menu_endpoint_policy.rs`（沿 m..009/m..015 `INSERT ... ON CONFLICT DO NOTHING`:seed getMenuList/v2 + getAllPages + getMenuTree 各 R_SUPER/R_ADMIN 共 6 條;`down` DELETE 本 migration 6 條）+ `migration/src/lib.rs` 註冊 016/017（接 015 後、mod + migrations() vec）。`docker run ... build -p migration` 過。**對應 spec FR-006〔建表+seed〕/ FR-005〔policy 授權〕**。（[data-model §1](./data-model.md) / [research R3·R4·R7·R8](./research.md)）
- [ ] T003 entity sys_menu：`entity/src/sys_menu.rs`（新、`DeriveEntityModel`、`table_name="sys_menu"`、Model 21 欄;`route_ext`/`buttons`: `Option<Json>`〔`sea_orm::entity::prelude::Json`、同 011 sys_operation_log〕;`menu_order: Option<i32>`;`Relation {}` + `ActiveModelBehavior` 空）。`build -p entity` 過。**對應 spec FR-006**。（[data-model §2](./data-model.md) / [research R4](./research.md)）
- [ ] T004 facade sys_menu + SQL-build 單測（**test-first**）：`server/src/model/facade/sys_menu.rs`（新）`impl SoftDeletable for Entity`（`deleted_at_column`）+ `find_active() -> Select<Entity>`（委派）+ `all_active(db) -> Result<Vec<Model>, DbErr>`（`find_active().order_by_asc(Column::MenuOrder).all(db)`）+ `server/src/model/facade/mod.rs` 加 `pub mod sys_menu;`。**單測**（沿 016 facade）：`all_active 的 query` build 斷言含 `"deleted_at" IS NULL` + `ORDER BY "menu_order"`。`build -p server` + 既有測試綠 + `--test entity_access_lint` 17。依 T003。**對應 spec FR-007〔只回 active〕**。（[data-model §3](./data-model.md) / [research R9](./research.md)）

**Checkpoint**：sys_menu 建表（經 010）+ 6 節點 seed + entity + facade（find_active/all_active）+ endpoint policy seed;entity-access lint 仍綠（facade 為唯一 sys_menu 存取管道）

---

## Phase 3: User Story 1 — getMenuList/v2（分頁巢狀樹）（Priority: P1）🎯 MVP

**Goal**：`getMenuList/v2` 回分頁巢狀樹（頂層 menu 分頁 + children 巢狀、完整 Menu 顯示欄）;掛 admin enforce。

**Independent Test**：dev stack up → Super Bearer 取 getMenuList/v2 → `{records,current,size,total=2}`、頂層 home+manage、manage 含 4 children 巢狀、id number、route_ext 攤平、createBy/updateBy null;User → 403+5003。

- [ ] T005 [US1] 純函式 build_menu_tree + MenuItem DTO + root 分頁（**test-first**）：`server/src/handler/system_manage.rs` 加 `MenuItem`（[data-model §4](./data-model.md):id:i64→number、parentId、menuType、menuName、routeName、routePath、component、icon、iconType、i18nKey、order〔←menu_order〕、keepAlive、constant、hideInMenu、activeMenu、href/query/multiTab/fixedIndexInTab〔← route_ext 攤平〕、buttons、status、createTime/updateTime、createBy/updateBy null、children:Vec<MenuItem>、camelCase）+ 純 `build_menu_tree(rows: Vec<Model>) -> Vec<MenuItem>`（parent_id→children map、遞迴巢狀、依 menu_order 排序、頂層=parent_id 0/無父、孤兒處理）+ root-slice 分頁（reuse 016 `normalize_page`、頂層 slice + total=頂層數）。**單測**：tree 巢狀（manage 含 4 children、依 order）+ 孤兒 + root slice 邊界 + clamp 100 + `route_ext` 攤平（含/不含 → 四欄值/null）。**不 `use entity::`**（inline map）。依 T004。**對應 spec FR-001/FR-002 + SC-005**。（[data-model §4·§5](./data-model.md) / [research R5](./research.md)）
- [ ] T006 [US1] handler get_menu_list_v2 + route+enforce：`server/src/handler/system_manage.rs` 加 `MenuListParams`（`Query<>`、current/size Option、camelCase）+ `pub async fn get_menu_list_v2(State, Query<MenuListParams>) -> Res<PageResp<MenuItem>>`（`sys_menu::all_active` → `build_menu_tree` → 頂層 slice〔normalize_page〕→ `Res::ok(PageResp)`;DbErr → `Res::err(BizCode::Internal)` + warn）;`main.rs` 加 `.route("/systemManage/getMenuList/v2", get(system_manage::get_menu_list_v2).route_layer(from_fn_with_state(state.clone(), enforce_mw)))`〔注意 nested `/v2` path〕。`build -p server` 過 + 既有測試綠。**無新純函式單元測試（wiring）→ acceptance 覆蓋**。對應 spec US1 FR-001 + **FR-005〔enforce〕/ FR-009〔envelope+id number〕** + SC-001。（[data-model §6](./data-model.md) / [research R1·R7](./research.md)）
- [ ] T007 [US1] curl acceptance（[verification §1·§2·§5](./contracts/verification-commands.md)）：dev stack up（postgres + `run --rm migrate` 套 001..017）+ psql 驗（sys_menu 21 欄 + 6 節點 seed + 頂層 2 + route_name 對齊 casbin 5 + endpoint policy 12）+ rust-api up;Super Bearer getMenuList/v2 → `{records,current,size,total=2}`、manage 含 4 children 巢狀、records[].id number、route_ext 攤平、createBy/updateBy null;User → 403+5003、無 token → 3333。對應 spec US1 + SC-001/SC-004/SC-005。

**Checkpoint**：US1 達成（getMenuList/v2 分頁巢狀樹 + enforce）= MVP 核心

---

## Phase 4: User Story 2 — getMenuTree（輕量樹）（Priority: P2）

**Goal**：`getMenuTree` 回全 active menu 的完整輕量巢狀樹（`{id,label,pId,children}`、不分頁）;掛 admin enforce。

**Independent Test**：Super Bearer getMenuTree → bare array、每節點僅 id/label/pId/children、完整樹;User → 403+5003。

- [ ] T008 [US2] MenuTreeItem DTO + handler get_menu_tree + route+enforce：`server/src/handler/system_manage.rs` 加 `MenuTreeItem`（`{id:i64→number, label〔←menu_name〕, p_id→pId〔←parent_id〕, children:Vec<MenuTreeItem>}`、camelCase）+ `pub async fn get_menu_tree(State) -> Res<Vec<MenuTreeItem>>`（`sys_menu::all_active` → 組輕量巢狀樹〔複用 T005 nesting 邏輯、直接從 Model 組輕量節點、依 menu_order〕→ `Res::ok(vec)`、**bare array 非分頁**）;`main.rs` 加 `.route("/systemManage/getMenuTree", get(system_manage::get_menu_tree).route_layer(...))`。`build -p server` 過。**無新純函式單元測試（wiring;nesting 已於 T005 測〕→ acceptance 覆蓋**。對應 spec US2 FR-003 + **FR-005/FR-009** + SC-002。（[data-model §4·§5·§6](./data-model.md) / [research R1·R5](./research.md)）
- [ ] T009 [US2] curl acceptance（[verification §3·§5](./contracts/verification-commands.md)）：Super Bearer getMenuTree → `data` 為 array（非分頁 wrapper）、每節點僅 {id:number,label,pId:number,children}、manage 節點含 children;User → 403+5003。對應 spec US2 + SC-002/SC-004。

**Checkpoint**：US1+US2 = 選單清單（分頁巢狀樹）+ 選單樹（輕量）

---

## Phase 5: User Story 3 — getAllPages（role-aware 頁名 catalog）（Priority: P3）

**Goal**：`getAllPages` 回可用頁面名清單;**唯一 role-aware**:R_SUPER 真頁+demo、R_ADMIN 只真頁;掛 admin enforce。

**Independent Test**：Super getAllPages → real+demo;Admin getAllPages → 只 real;User → 403+5003。

- [ ] T010 [US3] 純函式 pages_for_roles + handler get_all_pages + route+enforce（**pages_for_roles test-first**）：`server/src/handler/system_manage.rs` 加 in-code `REAL_PAGES`（`["home","manage_user","manage_role","manage_menu","manage_user-detail"]`）+ `DEMO_PAGES`（base-web `src/router/elegant/routes.ts` 的 demo 頁級 route key、**排 layout 父〔manage/alova/function/plugin/pro-naive/multi-menu/...〕+ 系統頁〔403/404/500/login/iframe-page〕**;impl grep routes.ts 定案、§I.5 對齊 base-web 不 grep rev1）+ 純 `pages_for_roles(roles: &[String]) -> Vec<String>`（含 `"R_SUPER"` → REAL+DEMO;else → REAL）+ `pub async fn get_all_pages(State, headers) -> Res<Vec<String>>`（`bearer→jwt::verify〔access secret+JWT_AUD〕→claims.roles` → `pages_for_roles` → `Res::ok(vec)`;token 壞 → 3333）;`main.rs` 加 `.route("/systemManage/getAllPages", get(system_manage::get_all_pages).route_layer(...))`〔enforce_mw 仍掛 admin 閘、handler 另讀 claims.roles 做 demo 過濾 = double-JWT、§2.17 defer〕。**單測**（pages_for_roles 純）：`["R_SUPER"]`→real+demo、`["R_ADMIN"]`→只 real、`["R_USER_COMMON"]`→real〔或空、定義於實作〕、multi-role 含 R_SUPER → real+demo。`build -p server` 過。對應 spec US3 FR-004 + **FR-005/FR-009** + SC-003。（[data-model §4·§5·§6](./data-model.md) / [research R6](./research.md)）
- [ ] T011 [US3] curl acceptance（[verification §4·§5](./contracts/verification-commands.md)）：**Super** getAllPages → 含 REAL_PAGES 全部 + 額外 demo 頁（`len > real`）;**Admin** getAllPages → **只 real、無 demo**（`set == real`）;Super ⊋ Admin（差集=demo）;User → 403+5003、無 token → 3333。對應 spec US3 + SC-003/SC-004。**★ 關鍵:role-aware 內容差異活體證**。

**Checkpoint**：三 US 活體達成（getMenuList 分頁樹 / getMenuTree 輕量樹 / getAllPages role-aware）

---

## Phase 6: Polish + 守恆

- [ ] T012 純單測補齊 + 守恆（[verification §6](./contracts/verification-commands.md)）：審視/補齊純單測覆蓋 — `build_menu_tree`（巢狀/menu_order 排序/孤兒，T005 已 test-first、確認完整）+ root 分頁 clamp（reuse 016 normalize_page、確認）+ `pages_for_roles`（T010 已 test-first、確認 Super/Admin/multi-role）+ `route_ext` 攤平（null→四欄 null）。對應 spec FR-001/FR-004/FR-008 + SC-005。`docker run ... test -p server` 綠。
- [ ] T013 既有不破 + 契約守恆 + Constitution 自查（[verification §0](./contracts/verification-commands.md)）**對應 spec FR-010 + SC-007〔既有不破〕**：
    * (a) 既有 + 新單測全綠：`docker run ... rev2-admin-rust-api:dev test`（016 後 92+3 ignored + 新增 017 build_menu_tree/root 分頁/pages_for_roles/route_ext/facade SQL-build 單測）
    * (b) **009 entity-access lint 續綠**：`docker run ... test -p server --test entity_access_lint`（**用 `--test`**;handler/system_manage.rs 不碰 `entity::`、sys_menu 查詢只經 facade）= 17 passed
    * (c) **prod runtime image build sanity**（無新 dep,但新表 migration + JSONB + 新 handler/facade 須過 release build）：`DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-017 .`
    * (d) **FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中
    * (e) **scope 邊界**：psql 驗 sys_menu 21 欄 + 6 節點 seed + 頂層 2 + route_name 對齊 casbin 5 + endpoint policy 12（getMenuList/v2·getAllPages·getMenuTree 各 2 + 既有 getUserList/getRoleList/getAllRoles 各 2）;`grep entity:: rust-api/server/src/handler/system_manage.rs` 無命中（只 facade）;**不動 014**（`git -C rust-api diff <base>..HEAD --stat` 不含 `route/menu.rs`）;**不動既有表/entity**（不含 sys_user/sys_role 等）;**不建 sys_role_menu/sys_menu_button**
    * (f) **getAllPages role-aware 雙證**：Super getAllPages ⊋ Admin getAllPages（差集=demo 頁）— 活體 + `pages_for_roles` 單測雙證
    * (g) **Constitution 自查**：`grep -c "✅ Pass" specs/017-manage-menu-list/plan.md` ≥ 14（7+7）;constitution **v1.1.0**;**無 Amendment、無 §I.5 例外**（未 grep rev1）;Deviation D-A〜D-E 已記
    * (h) `/health` 不破：`curl :21081/health`=ok

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit:rust-api worktree code + 外層 spec docs + SHA pin、不動 base-web/014）

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup;**阻斷所有 user story**（sys_menu 建表 + entity + facade + policy seed）
- **US1(Phase 3,P1)**：依 Foundational（T002 sys_menu + T003 entity + T004 facade all_active）;MVP
- **US2(Phase 4,P2)**：依 Foundational + **US1 T005**（複用 build_menu_tree nesting 邏輯）;經 sys_menu facade
- **US3(Phase 5,P3)**：依 Foundational（policy seed〕+ 013 Claims.roles;與 US1/US2 獨立（不碰 sys_menu tree、走 in-code 頁名 + role）
- **Polish(Phase 6)**：依所有 user story

### Within / Cross Phases
- Foundational：T002（migration）→ T003（entity）→ T004（facade）。
- US1：T005（build_menu_tree+MenuItem+root 分頁、test-first）→ T006（handler+route+enforce）→ T007（curl）。
- US2：T008（MenuTreeItem+handler+route,複用 T005 nesting）→ T009（curl）。
- US3：T010（pages_for_roles test-first + handler role-aware+route）→ T011（curl Super vs Admin）。
- Polish：T012（純測補齊）→ T013（守恆+Constitution）。

### Parallel Opportunities
- US3 T010（getAllPages、走 in-code 頁名 + Claims.roles）與 US1/US2（走 sys_menu tree）邏輯獨立 → 可較早並行（皆依 Foundational policy seed）。
- handler（T006/T008/T010）共改 `system_manage.rs` + `main.rs` → 序列（同檔）。
- acceptance（T007/T009/T011）依 live stack → 序列。

---

## Implementation Strategy

### MVP First (US1)
1. Setup(T001)→ Foundational(T002-T004)→ US1（T005-T007 curl）
2. **STOP and VALIDATE**：getMenuList/v2 分頁巢狀樹 + enforce curl 綠 = manage/menu 頁主清單可用 = MVP
3. + US2（getMenuTree 輕量樹）+ US3（getAllPages role-aware）→ 三 US 齊
4. + Polish（T012 純測 + T013 守恆 + prod build + Constitution）
5. `superpowers:finishing-a-development-branch` → **兩段式 commit**（rust-api worktree push fork + 外層〔spec docs〕+ SHA pin;**不動 base-web/014**）+ merge --no-ff 回 `rev2-admin-root` + 回填 DESIGN/CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy（executing-plans 階段）
- Foundational(T002-T004)：migration（T002）、entity（T003）、facade+SQL-build 測（T004）。
- US1(T005-T007)/ US2(T008-T009)/ US3(T010-T011)：純函式+test → handler+route+enforce → curl,各對照 spec 驗收。
- Polish（T012 純測補齊 / T013 守恆+Constitution）。
- **★ commit 紀律**：兩段式 commit（rust-api worktree + 外層 spec docs）;各 unit spec+quality 雙審。

---

## Notes
- **純 rust-api worktree feature（不動 base-web/014、無外層 deploy 改動）**：2 migration（create sys_menu+seed / seed policy）+ 1 entity（sys_menu）+ 1 facade（sys_menu find_active/all_active）+ handler/system_manage.rs 擴充（3 handler + MenuItem/MenuTreeItem + build_menu_tree/pages_for_roles + REAL_PAGES/DEMO_PAGES）+ main.rs（3 route enforce）。
- **id wire=number**（v1.1.0）;**route_name=string**、casbin `v2='menu'` 對齊鍵;**JSONB route_ext/buttons**（011 先例 Option<Json>/json_binary）;**getMenuList 非 016 DB 分頁**（取全+記憶體樹+頂層 slice、D-A）;**getAllPages role-aware**（Claims.roles、double-JWT defer、D-B）。
- **守** 008 envelope + 009 entity-access lint + 007 FR-009 + soft-delete（只回 active）+ 013 enforce + 016 PageResp/normalize_page pattern。
- **menu CRUD / role-menu 授權寫入 / demo seed 成 menu / 014 改讀 sys_menu / 按鈕權限 / operator / sys_role_menu / sys_menu_button = scope 外**（017 唯讀）。
- **無新 workspace crate、無新 dep**（sea-orm Json/json_binary 內建、011 已用）。
- `superpowers:executing-plans` 階段把這 13 個 task 編成 execution unit + 派 fresh implementer subagent。
