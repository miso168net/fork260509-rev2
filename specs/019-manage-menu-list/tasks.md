---
description: "Task list — 019 manage-menu-list"
---

# Tasks: Menu Management List (DB-driven menu source)

**Input**: `specs/019-manage-menu-list/`(plan / spec / research / data-model / contracts / quickstart)

**Tests**:純函式邏輯 test-first(`assemble_menu_tree` 樹組裝 / `find_active` SQL / MenuItem·MenuTreeNode 序列化〔id 型·camelCase·enum 字串·jsonb〕);**wiring + getUserRoutes 遷移 + 形狀類無單元測試 → 由 `contracts/verification-commands.md` C-V(curl + psql + CDP)覆蓋**(沿 016/017/018 慣例)。

**Organization**:**server-only**(base-web 不動,R0);Foundational(sys_menu 表 + facade + 樹組裝)→ US1(getUserRoutes 遷移,★ 逐字回歸)→ US2(管理讀端)。

**★ 紀律**:`git push` / `git merge` **不排入本 tasks**(§3:留 `superpowers:finishing-a-development-branch`)。實作期間僅 **本地** 兩段式 commit(rust-api worktree commit + 外層 SHA pin commit,皆 local)。**base-web 本波不動**(收尾僅 rust-api 單倉 + 外層 SHA pin)。

## Format: `[ID] [P?] [Story] Description`

- **[P]**:可平行(不同檔、無未完依賴)
- **[Story]**:US1/US2(Setup/Foundational/Polish 無 label)

---

## Phase 1: Setup

- [ ] T001 確立回歸 baseline:`dcargo build -p server` 綠 + 既有 server 單測 + entity_access_lint + xdb 全綠;**★ 存 014 getUserRoutes 三角色輸出基準**(`before_Super.json`/`before_Admin.json`/`before_User.json`,供 US1 逐字 diff)+ getConstantRoutes 基準 + 013/016/017/018 acceptance baseline 紀錄;確認在 `019-manage-menu-list` branch、dev stack 可起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`)

---

## Phase 2: Foundational(Blocking — US1/US2 之前必完成)

**⚠️ sys_menu 表 + facade + 樹組裝,US1/US2 共用前置;sys_menu = §I.6 凍結後首張新建業務表 → create 即帶 6 審計欄**

- [ ] T002 [P] entity `sys_menu` Model(~26 欄:`id`/`parent_id`/`route_name`/`menu_type:Option<i16>`/`menu_name`/`route_path`/`component`/`icon`/`icon_type:Option<i16>`/`i18n_key`/`order`〔**保留字** → `#[sea_orm(column_name="order")] pub order_no: Option<i32>`〕/`status:Option<i16>`/`hide_in_menu`/`keep_alive`/`constant`/`multi_tab:Option<bool>`/`href`/`active_menu`/`fixed_index_in_tab:Option<i32>`/`query:Option<Json>`/`buttons:Option<Json>` + §I.6 6 審計欄〔created_at NN / created_by / updated_at / updated_by / deleted_at / deleted_by〕)in `rust-api/entity/src/sys_menu.rs` + `pub mod sys_menu` in `rust-api/entity/src/lib.rs`(data-model §1;**無新 crate/dep**:`Json` 經 `sea_orm::entity::prelude::*`)
- [ ] T003 migration `m20260529_000018_create_sys_menu`(`create_table`〔jsonb 用 `.json_binary()`、i16 `.small_integer()`、i32 `.integer()`、bool `.boolean()`、timestamptz `.timestamp_with_time_zone()`、`order` Iden raw `"order"`〕+ partial unique index `sys_menu_route_name_active_uniq`〔`ON sys_menu (route_name) WHERE deleted_at IS NULL`,raw SQL 鏡像 006〕+ **seed 6 筆逐字重現 014 樹**〔home/manage top + manage_user/role/menu/user-detail 子,parent_id 用 subquery `(SELECT id FROM sys_menu WHERE route_name='manage' AND deleted_at IS NULL)`,欄值對齊 data-model §2,ON CONFLICT DO NOTHING〕;down 對稱〔drop index + drop table〕)+ `migration/src/lib.rs` mod + migrations() vec 註冊 in `rust-api/migration/src/`;**驗 up→down→up 對 throwaway DB 可逆 + seed 6 筆欄值對 014**
- [ ] T004 [P] facade `sys_menu`:`impl SoftDeletable`(deleted_at_column)+ `find_active()->Select<Entity>` + `list_active_paginated(db,filter,page_idx,size)`(getMenuList 分頁,沿 016)+ `list_active_all(db)`(getMenuTree/getUserRoutes 基礎)+ `impl AuditSerialize for Model`(結構欄 + 時間 rfc3339 + jsonb,無敏感欄)in `rust-api/server/src/model/facade/sys_menu.rs`(依賴 T002)
- [ ] T005 [P] **純函式 `assemble_menu_tree(rows) -> Vec<MenuNode>`**(無 DB I/O:依 `parent_id` 組 parent→children、依 `order` 排序、孤節點〔parent 不存在/軟刪〕略過掛接)+ **單測**(扁平 rows → 正確巢狀 + order 排序 + 孤節點 + 空輸入)in `rust-api/server/src/model/facade/sys_menu.rs`(或 `route/menu.rs` helper 區;供 US1 getUserRoutes + US2 getMenuTree 共用)

**Checkpoint**: sys_menu 表 + facade + 樹組裝 就緒 → US 可開始

---

## Phase 3: User Story 1 — getUserRoutes 改讀 sys_menu(DB-driven,輸出逐字不變) (P1) 🎯

**Goal**:runtime 導覽選單由 sys_menu 供應(取代 014 in-code `business_routes()`),三角色 menu 階梯與遷移前**逐字一致**,可見性仍 Casbin 過濾(§I.2)。
**Independent Test**:三角色 getUserRoutes 輸出 diff 遷移前基準 = 0 差異(C-V §1);getConstantRoutes 不變;無有效角色不崩潰。

- [ ] T006 [US1] map seam `sys_menu MenuNode → MenuRoute/RouteMeta`(lint-safe primitive:`menu_type`/`status` 等不入 wire〔MenuRoute 無這些欄〕、`i18n_key`/`icon`/`order`/`hide_in_menu`/`keep_alive`/`constant`/`active_menu` → RouteMeta、`component`/`path`/`name`/`id=route_name`;**`props` 衍生** = `route_path.contains(':')`〔manage_user-detail=true〕;`children` 遞迴)in `rust-api/server/src/route/menu.rs`(或 handler;handler 零 `entity::`、取 primitive)+ **單測**(map 後 home/manage 樹欄值 == 014 R1)(依賴 T005)
- [ ] T007 [US1] ★ `get_user_routes` 改讀 sys_menu:`sys_menu::list_active_all` → `assemble_menu_tree` → map MenuRoute(T006)→ **`filter_routes_for_roles`(現成、不改)** → `UserRoute{routes, home:"home"}` in `rust-api/server/src/handler/route.rs`(`business_routes()` 保留供測試基準/標 deprecated;`constant_routes`/`get_constant_routes`/`is_route_exist` **不動**)。**★ 落地後立即 curl diff 三角色 vs T001 基準(逐字一致)**(依賴 T006/T004)

**Checkpoint**: US1 可獨立驗(getUserRoutes DB-driven、逐字回歸)

---

## Phase 4: User Story 2 — 選單管理讀端(getMenuList/v2 + getMenuTree + getAllPages,Super-only) (P1)

**Goal**:選單管理頁顯真實 sys_menu(分頁列表 + 樹 + 頁面選項);Super-only。
**Independent Test**:Super getMenuList 分頁真值 / getMenuTree 父子 / getAllPages 集;Admin→5003、none→3333(C-V §2)。

- [ ] T008 [P] [US2] **單測**:`MenuItem` 序列化(id=string、parentId=string、menuType/iconType/status i16→"1"/"2"、order/fixedIndexInTab number、createTime rfc3339、buttons/query jsonb、camelCase、children null)+ `MenuTreeNode` 序列化(id/pId=**number**、label、children、camelCase `pId`)in `rust-api/server/src/handler/system_manage.rs`
- [ ] T009 [US2] handler `get_menu_list`(`GET /systemManage/getMenuList/v2`→`Res<PageRes<MenuItem>>`,`list_active_paginated`→flat records,lint-safe 映射真值)+ `get_menu_tree`(`GET /systemManage/getMenuTree`→`Res<Vec<MenuTreeNode>>`,`list_active_all`→`assemble_menu_tree`→映射 id/pId number)+ `get_all_pages`(`GET /systemManage/getAllPages`→`Res<Vec<String>>`,**靜態頁面集**〔對齊 base example:home/manage_user/manage_role/manage_menu/manage_user-detail/about/...〕)+ `MenuItem`/`MenuTreeNode` DTO in `rust-api/server/src/handler/system_manage.rs`(依賴 T004/T005/T008)
- [ ] T010 [US2] migration `m20260529_000019_seed_menu_read_policy`(raw SQL casbin **3 行 R_SUPER**:`/systemManage/getMenuList/v2`·`/systemManage/getAllPages`·`/systemManage/getMenuTree`=GET,ON CONFLICT DO NOTHING;down 精準 `DELETE WHERE ptype='p' AND v1 IN(3 path)` 不踩 010/013/015/017/019-create)+ lib.rs 註冊(在 000018 之後)+ **routes 3 條** `.route(...).route_layer(enforce_mw)` in `rust-api/migration/src/` + `rust-api/server/src/main.rs`(依賴 T009;driver restart 後 enforcer 重載 policy)

**Checkpoint**: US1+US2 獨立可驗

---

## Phase 5: Polish & Acceptance(C-V 對照 `contracts/verification-commands.md`)

- [ ] T011 acceptance:**★ US1 getUserRoutes 三角色逐字回歸**(curl diff after vs T001 before = 0 差異;Super=[home,manage(4 子)]/Admin=[home,manage(manage_user,manage_user-detail)]/User=[home];getConstantRoutes 不變)(C-V §1)+ US2 三讀端形狀(getMenuList flat 分頁真值 / getMenuTree id·pId number 父子 / getAllPages string[])+ Super-only(Admin→5003、none→3333)(C-V §2)+ psql sys_menu seed 6 筆真值
- [ ] T012 回歸:013 enforce allow/deny + 014 menu(getUserRoutes 逐字〔= T011〕、getConstantRoutes、isRouteExist enforce-based 不變)+ 016/017/018(getUserList/getRoleList/getAllRoles、user/role 寫端、status enforce 即時)+ 守恆(server 單測〔assemble_menu_tree / find_active SQL / DTO 序列化〕+ entity_access_lint〔handler 零 `entity::`〕+ xdb + `Migrator::up` grep 0)
- [ ] T013 migration up→down→up 可逆(throwaway DB:000018 create_sys_menu + 000019 seed_menu_read_policy)+ **prod target image build 綠**(`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`;sys_menu 為既有 entity crate 模組、非新 crate 故非 §3 強制,沿 016/017/018 de-risk)
- [ ] T014 真 CDP(front-nginx `:21080`)/manage/menu 端到端:登入 Super → 選單管理頁顯真實 sys_menu(列表 6 筆 / 樹父子 / 頁面選項)+ 側欄導覽 menu 階梯(getUserRoutes)與遷移前一致(Super 全/Admin 中/User home)→ null 欄不 crash(harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A;**若難構造則 curl 直送證 + 登記 follow-up**,C-V §5)
- [ ] T015 收尾**本地**兩段式 commit(rust-api worktree commit + 外層 `git add rust-api` SHA pin commit;**皆 local、不 push;base-web 不動**)+ 整體 final holistic review(FR-001..010 + SC-001..008 可追溯、跨任務一致、getUserRoutes 逐字)。**push/merge 留 `superpowers:finishing-a-development-branch`(§3)**

---

## Dependencies & Execution Order

- **Phase 1**(T001)→ **Phase 2 Foundational**(T002-T005)→ **US1**(T006-T007)→ **US2**(T008-T010)→ **Polish**(T011+)。
- Phase 2 內:T002 → T004(facade 依 entity);T002 → T003(migration 對齊 entity 欄);T005 純函式(依 T002 的 Model 型供測);T003/T004/T005 相對獨立可平行([P])。
- US1:T005 → T006(map 依樹組裝)→ T007(getUserRoutes 依 map + facade)。
- US2:T004/T005/T008 → T009 → T010(route + seed)。
- **★ 高風險先驗**:T007(getUserRoutes 遷移)落地後**立即跑逐字回歸**(別積到 Polish),因動已上線 014。

### Parallel Opportunities
- T002 / T004 / T005 可平行([P],不同關注點;T004/T005 同檔 sys_menu.rs 則序);各 [P] 單測(T005/T008)test-first。
- US1 與 US2 Foundational 後可平行(若多人);本地單人建議 US1(高風險逐字)先、US2 後。

---

## Implementation Strategy

- **MVP = US1**(Phase 1+2+3):getUserRoutes DB-driven 且逐字不變,即證「DB-driven 統一源」地基 + 回歸鐵律。
- 增量:US1(runtime 遷移)→ US2(管理讀端)。每 US 獨立可驗。
- **★ 回歸鐵律(D5/SC-001)**:T007 後 getUserRoutes 三角色逐字 == 014;seed(T003)須精準重現 014 樹、`props` 衍生(T006)對齊。
- 收尾:`superpowers:finishing-a-development-branch` → push(待 user 同意)+ `merge --no-ff` 回 `rev2-admin-root`、保留 019 branch。

## Notes
- [P]=不同檔/關注點無依賴;[Story]=US 可追溯。
- 純函式 test-first(T005 樹組裝 / T006 map / T008 DTO);**getUserRoutes 遷移 + 3 讀端 wiring 無單元測試 → C-V acceptance(T011-T014)覆蓋**(沿 016/017/018,理由本檔頭 + plan 明示)。
- **server-only**:base-web 不動(menu fns 已存在 upstream、getUserRoutes wire 透明);收尾僅 rust-api 兩段式 commit。
- 實作期間僅本地 commit;**push/merge 不在 tasks、留 finishing-a-development-branch**(§3 鐵律)。
- 無新 crate/dep;handler 零 `entity::`(009 lint);可見性 Casbin(010)不動;讀端 Super-only;constantRoutes/isRouteExist 不動。sys_menu create 即帶 6 審計欄(§I.6 forward-only)。
