# 019 manage-menu-list — Phase 0 brainstorm (spec-design)

> rev2 Phase 4 主流業務 — **menu 改 DB-driven(sys_menu 表)+ 管理頁讀端 + runtime getUserRoutes 遷移**。
> 把 014 的 in-code route 常數遷成 sys_menu 業務表(單一真相),讓 runtime menu(getUserRoutes)與管理頁(getMenuList)**共讀 sys_menu**,可見性仍走 Casbin enforce(§I.2 不變)。
> **凍結設計來源**:本檔(D1–D5 user 親決,2026-06-02 brainstorm)。交棒 `/speckit-specify`(階段 1,**手動執行**)。
> 設計骨幹參考 = 016-manage-role-user-list(讀端分頁/全量)+ 017/018 schema·facade pattern;本檔記 menu-specific 決策與差異。
> **★ 本 feature 動到已運作的 014 runtime menu** → 回歸鐵律見 D5 + §7。

---

## 1. Scope / User Stories

**範圍拍板(D2):019 = 讀端 + runtime 遷移;寫端 CRUD → 020。**

- **US1 menu 管理頁讀端**:管理頁顯示真實 menu 結構(分頁列表 + 樹 + 頁面選項)。3 endpoint:
  - `GET /systemManage/getMenuList/v2`(分頁 `MenuList`,管理表)
  - `GET /systemManage/getAllPages`(`string[]` 頁面 component 名,建 menu 時下拉用)
  - `GET /systemManage/getMenuTree`(`MenuTree[]`{id,label,pId,children},父選擇下拉)
- **US2 runtime menu DB-driven 遷移**:`GET /route/getUserRoutes` 由 014 in-code 常數改讀 sys_menu(樹組裝 + Casbin tree-prune 過濾),**輸出 wire 逐字不變**(D5)。
- 讀端授權:沿既有 —— getMenuList/getAllPages/getMenuTree 掛 `enforce_mw`(Super-only 或依 policy);getUserRoutes 維持 014 JWT-verified + handler 內 Casbin 過濾(不掛 enforce_mw)。
- **不在 019**(D2/D4):menu 寫端 CRUD(addMenu/updateMenu/deleteMenu)→ 020;role-menu 可見性編輯(MenuAuthModal/ButtonAuthModal)→ 後續「受管 policy / menu-auth」feature。

## 2. 親決(D1–D5)

### D1 — menu 資料來源 = DB-driven 統一源(sys_menu)
- sys_menu 業務表成為 menu 定義的**單一真相**;runtime(getUserRoutes)與 management(getMenuList)**都讀 sys_menu**。
- 對齊 §I.1「base-web 為權威」—— 管理頁編輯選單(020 起)會真實反映於 nav(非半功能)。
- **現況**:014 runtime 是 `rust-api/server/src/route/menu.rs` 的 in-code `business_routes()` 常數 + migration 010 casbin menu policy;**無 sys_menu 表**。本 feature 建表 + 遷移 runtime 源。

### D2 — scope = 讀端 + runtime 遷移(寫端 → 020)
- 鏡像 016(讀)→017/018(寫)節奏;把高風險的 runtime 遷移與讀端一起穩驗、寫端獨立。
- 019 seed sys_menu(鏡像現有 in-code 樹、唯讀);新增/編輯/刪除 menu 留 020。

### D3 — buttons 存 sys_menu JSONB 欄
- `Menu.buttons[]`(`MenuButton{code,desc}`)以 `buttons` JSONB 欄存(直接 round-trip wire 巢狀形,最簡、無額外 table/join、避「sys_menu_button 是否業務表需 §I.6」問題)。
- **與 013 button 權限矩陣兩件事**:sys_menu.buttons = 「某 menu 有哪些 button」(定義);013 getUserInfo 的 buttons = 「role 可用哪些 button code」(權限,現為 in-code role→[B_CODE] 矩陣)。**019 不動 013 button 矩陣**。button-level enforce(若未來要)另議。

### D4 — 可見性 = Casbin policy(010)不變;role-menu 編輯 OUT of 019
- §I.2 NON-NEGOTIABLE:menu 可見性**必須**走 Casbin enforce。sys_menu 存「定義」,**migration 010 casbin menu policy(9 rows:role × route_name,domain `"menu"`)存「哪 role 看哪 menu」、不動**。
- sys_menu.`route_name` 為穩定鍵、**對齊 casbin policy v1**;getUserRoutes 讀 sys_menu rows 後對每 route 跑 `enforce((role, route_name, "menu"))` 過濾(同 014 `filter_routes_for_roles`、tree-prune:parent 留若 ≥1 child 可見)。
- role-menu 可見性**編輯**(role-operate-drawer 的 `MenuAuthModal`/`ButtonAuthModal` placeholder)**OUT of 019** → 後續「受管 RBAC policy 層」(Phase 3 #6)/ menu-auth feature。

### D5 — getUserRoutes 輸出逐字不變(回歸鐵律)+ 邊界
- **★ 回歸鐵律**:getUserRoutes 遷到 sys_menu 後,wire 輸出**必須與 014 現狀逐字一致**(Super/Admin/User menu 階梯不變:Super/Admin=[home,manage(含授權子項)]、User=[home])。seed + 欄映射須精準重現 014 in-code 樹;CDP menu ladder 親驗。
- `MenuRoute.id` = `route_name`(wire 不變、§I.3 string);`home`="home"。
- **constantRoutes**(login/404/403/500/iframe)**不入 sys_menu**(前端專屬、非業務 menu);`getConstantRoutes` **不動**。
- **業務錯誤**:讀端無業務寫入、無 2222 場景;沿既有 5xxx/3333 授權碼 + 5000 infra。

### 衍生(不另議)
- 對外 **id wire = string**(sys_menu.id i64→`.to_string()`、§I.3;MenuRoute.id=route_name 已 string)。
- enum `menu_type`/`icon_type`/`status` **i16 ↔ string** 純對映 fn(沿 016/017 `enum_str_to_i16`/`i16_to_wire_str` 模式)。
- facade `sys_menu` 走 SoftDeletable(`find_active` = deleted_at IS NULL),守 009 entity-access lint(handler 零 `entity::`)。
- **無新 crate/dep**(sea-orm jsonb 經既有 feature、serde_json 既有)。

## 3. Schema(migration `create_sys_menu` + entity)

> ★ §I.6 凍結 + retrofit 完成後**第一張新建業務表** → create migration **當下即帶 6 審計欄**(forward-only,無 retrofit)。

sys_menu 欄(對齊 base-web `Api.SystemManage.Menu` typing,每欄對應 wire field):

| 欄 | 型(PG / Rust) | 說明 |
|---|---|---|
| `id` | bigint PK BIGSERIAL / i64 | 對外 wire string |
| `parent_id` | bigint null / Option<i64> | 樹(0/null=top-level) |
| `route_name` | varchar not null / String | **穩定鍵**(對齊 casbin policy v1 + MenuRoute.id);partial unique index(WHERE deleted_at IS NULL) |
| `menu_type` | smallint / Option<i16> | 1=directory / 2=menu |
| `menu_name` | varchar not null / String | |
| `route_path` | varchar / Option<String> | |
| `component` | varchar / Option<String> | |
| `icon` | varchar / Option<String> | |
| `icon_type` | smallint / Option<i16> | 1=iconify / 2=local |
| `i18n_key` | varchar / Option<String> | |
| `order` | int / Option<i32> | |
| `status` | smallint / Option<i16> | EnableStatus 1/2 |
| `hide_in_menu` / `keep_alive` / `constant` / `multi_tab` | bool / Option<bool> | |
| `href` / `active_menu` | varchar / Option<String> | |
| `fixed_index_in_tab` | int / Option<i32> | |
| `query` | jsonb / Option<Json> | route query [{key,value}] |
| `buttons` | jsonb / Option<Json> | [{code,desc}](D3) |
| §I.6 審計 | `created_at`(NN default now)/`created_by`/`updated_at`/`updated_by`/`deleted_at`/`deleted_by` | soft-delete + 成對審計、`*_by`=operator i64(015 ctx) |

- migration `m20260529_000018_create_sys_menu`(序號接 017 之後;若 019 同時加 read policy seed 則 000019;spec 階段定):create table(含 6 審計欄)+ partial unique index `sys_menu_route_name_active_uniq` + seed(D5 鏡像 014 樹)。**up→down→up 可逆**(create/drop)。
- entity `entity/src/sys_menu.rs` + `impl AuditSerialize`(無敏感欄)。
- 種子 rows:home / manage(父)/ manage_user / manage_role / manage_menu / manage_user-detail(route_name 對齊 migration 010 policy)。

## 4. Facade / Handler

- **facade `sys_menu`**(讀端,鏡像 016 sys_role read facade):
  - `find_active() -> Select<Entity>`(SoftDeletable)。
  - `list_active_paginated(...)`(getMenuList/v2 分頁)+ `list_active_all()`(getMenuTree/getUserRoutes 全量基礎)。
  - **純函式樹組裝 seam**(無 DB I/O):`(rows) -> Vec<MenuNode>`(parent_id → nested children)— 供 getUserRoutes + getMenuTree + getMenuList(tree)共用、可單測。
- **handler `system_manage`**(getMenuList/getAllPages/getMenuTree)+ **handler `route`**(getUserRoutes 改讀 sys_menu):
  - 欄映射 lint-safe(取 primitive、handler 零 `entity::`,同 016 `role_item`)。
  - getUserRoutes:`sys_menu::list_active_all` → 樹組裝 → 映射 MenuRoute/RouteMeta → Casbin tree-prune(同 014 `filter_routes_for_roles`,改吃 DB 樹)。
  - getAllPages:019 讀端先回**已知頁面 component 靜態集**(spec phase 0 grep 對齊 base example 頁面集 / 或 sys_menu.component distinct)。
- **無 migration seed_*_policy 新增**(讀端沿既有 menu policy 010;getMenuList/getAllPages/getMenuTree 若需 enforce policy,spec 階段定 R_SUPER 列〔鏡像 016 getRoleList seed〕)。

## 5. 跨 feature ripple(★ 非純 019-local)

| 觸及 | 改動 | 回歸驗 |
|---|---|---|
| **014 getUserRoutes** | runtime menu 源由 in-code `business_routes()` 改讀 sys_menu(樹+映射+Casbin 過濾) | **★ menu 階梯逐字不變(Super/Admin/User);CDP** |
| 014 getConstantRoutes / isRouteExist | **不動**(constantRoutes 前端專屬;isRouteExist 若依 route 存在性、spec 階段確認是否改讀 sys_menu) | 不破 |
| migration 010 casbin menu policy | **不動**(可見性源;sys_menu.route_name 對齊) | menu deny 不破 |
| 013/018 enforce | **不動**(endpoint enforce policy 與 menu policy 不同 domain) | allow/deny 不破 |
| 016 getMenuList placeholder | base-web 管理頁讀 UI 既存、現打 mock → 接 rev2 endpoint(BASE-WEB-WRAPPER 若需新 fetch) | 管理頁顯真實 menu |

> spec phase 0 research 必 grep:014 `route/menu.rs` `business_routes()` 精確樹(供 seed 逐字對齊)、base-web `getMenuList/v2`/`getMenuTree`/`getAllPages` 三端型(rust handler / service ts / component state)、`MenuTree.id` 型(number vs string)、`getMenuList/v2` flat-分頁 vs tree-in-records、`query` 欄 wire 形。

## 6. base-web 接線

- 讀端已存在 `fetchGetMenuList`(`/systemManage/getMenuList/v2`)/`fetchGetAllPages`/`fetchGetMenuTree`(`service/api/system-manage.ts`,打 mock)→ rev2 提供對應 rust endpoint 後**自然接上**(若 URL/型對齊則無需改 base-web;若需 rev2 wrapper 則走 BASE-WEB-WRAPPER 新檔)。
- getUserRoutes 遷移**對 base-web 透明**(wire 不變、D5)→ **不動 base-web**。
- menu 寫端 placeholder(menu-operate-modal 的 `// request`)**不接**(→ 020 MODAL-WIRING)。

## 7. Acceptance

- US1:getMenuList/v2 分頁 + getAllPages + getMenuTree 形狀正確(curl + psql sys_menu 真值);管理頁顯真實 menu 結構(CDP)。
- US2 **★ 回歸鐵律**:getUserRoutes 遷 sys_menu 後 **Super/Admin/User menu 階梯與 014 逐字一致**(curl diff + CDP 側欄 menu ladder 不變);getConstantRoutes 不變。
- 守恆:013/018 enforce allow/deny 不破 + 014 menu deny 不破 + migration up→down→up 可逆 + server 單測(find_active SQL / 樹組裝 / enum / 欄映射)+ entity_access_lint(handler 零 `entity::`)+ xdb + `Migrator::up` grep 0。
- migration:sys_menu **create migration 即帶 6 審計欄**(§I.6 forward-only 驗)。
- **prod image build 綠**(無新 crate 故非 §3 強制,沿 016/017/018 de-risk 列入)。
- 無單元測試的 wiring/形狀類由 `contracts/` C-V(CDP + curl + psql)覆蓋,於 tasks/plan 明示。

## 8. 範圍提醒 / 可瘦身選項

- **★ 最大風險 = getUserRoutes runtime 遷移**(動已運作 014):D5 回歸鐵律(逐字不變)是驗收核心;seed 須精準鏡像 in-code 樹。若風險過高,可進一步把「runtime 遷移」與「管理讀端」拆兩 feature(但違 D1 統一源即時性、且管理頁會暫時無真實 runtime 對應 → user 已親決 019 一起做)。
- buttons JSONB(D3)/ 可見性 Casbin 不變(D4)/ 寫端 → 020 / MenuAuth 編輯 → 後續:皆已親決,本 feature 不擴張。
- getAllPages 靜態頁面集:019 讀端可先回固定集;020 寫端(建 menu 選 component)時再對齊完整可路由頁面集。
