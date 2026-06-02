# Research: 019 manage-menu-list (Phase 0)

> 依 CLAUDE.md §3 紀律:grep 驗證真實 code、不信 brainstorm 命名假設。5-cluster 並行驗證(workflow `wf_ac073965-790`)。**No new crate/dep**(sea-orm 1.1.20 內建 Json + serde_json 既有)。所有 NEEDS CLARIFICATION 已解。

---

## R0 ★ 範圍確認:019 = **server-only**(base-web 不動)

**Decision**: 019 不改任何 base-web 檔。

**Rationale(grep 證實)**:
- `base-web/src/service/api/system-manage.ts:34-54`:`fetchGetMenuList`(→`/systemManage/getMenuList/v2`)、`fetchGetAllPages`(→`/systemManage/getAllPages`)、`fetchGetMenuTree`(→`/systemManage/getMenuTree`)**已存在於 upstream 檔**、URL 已對 —— rev2 提供對應 rust endpoint 後**自然接上**,無需新 wrapper、無需改 base-web。
- `getUserRoutes` 遷 sys_menu 對 base-web **透明**(wire 逐字不變、D5)。
- menu 寫端 placeholder(menu-operate-modal `// request`)**本波不接**(→ 020)。
- ∴ 019 觸及面全在 rust-api(entity/migration/server)→ Constitution §IV #2(base-web inline)= N/A、§III ★ 軌道未觸發。

---

## R1 014 runtime menu 精確樹 + structs(seed 逐字重現權威,D5 回歸鐵律)

**Source**: `rust-api/server/src/route/menu.rs` `business_routes()`(lines 171-283)。**sys_menu seed 必須逐字重現此樹**(欄值如下):

| route_name | parent | path | component | title/i18n_key | icon | order | 其他 meta |
|---|---|---|---|---|---|---|---|
| `home` | (top) | `/home` | `layout.base$view.home` | home / route.home | `mdi:monitor-dashboard` | 1 | — |
| `manage` | (top) | `/manage` | `layout.base` | manage / route.manage | `carbon:cloud-service-management` | 9 | (父、無自身 view) |
| `manage_user` | manage | `/manage/user` | `view.manage_user` | manage_user / route.manage_user | `ic:round-manage-accounts` | 1 | — |
| `manage_role` | manage | `/manage/role` | `view.manage_role` | manage_role / route.manage_role | `carbon:user-role` | 2 | — |
| `manage_menu` | manage | `/manage/menu` | `view.manage_menu` | manage_menu / route.manage_menu | `material-symbols:route` | 3 | `keep_alive:true` |
| `manage_user-detail` | manage | `/manage/user-detail/:id` | `view.manage_user-detail` | manage_user-detail / route.manage_user-detail | (null) | (null) | `hide_in_menu:true`、`active_menu:manage_user`、`props:true` |

**MenuRoute / RouteMeta wire 形**(`#[serde(rename_all="camelCase")]`、`skip_serializing_if=Option::is_none`):
- `MenuRoute{ id:String(=route_name), name:String, path:String, component:String, meta:RouteMeta, children:Option<Vec<MenuRoute>>, props:Option<bool> }`
- `RouteMeta{ title:String, i18n_key:String, icon:Option<String>, order:Option<i32>, hide_in_menu:Option<bool>, keep_alive:Option<bool>, constant:Option<bool>, active_menu:Option<String> }` —— **`meta.roles` 不序列化**(dynamic mode 後端已過濾、前端不再 filter)。
- `UserRoute{ routes:Vec<MenuRoute>, home:String }`。

**filter_routes_for_roles**(menu.rs:301-323):`menu_visible(name, roles, enforcer)` = 對每 role 跑 `enforcer.enforce((role, route_name, "menu"))`、`.any()` 取聯集。**葉**:可見才留;**父(manage)**:不自身 enforce、子過濾後 ≥1 可見才留(struct spread `MenuRoute{children:Some(visible), ..route}`)。

**回歸 ladder(menu.rs 測試 392-465)**:R_SUPER=[home, manage(4 子)]、R_ADMIN=[home, manage(manage_user + manage_user-detail)]、R_USER_COMMON=[home]。**019 遷 sys_menu 後須逐字一致**。

---

## R2 getUserRoutes 遷 sys_menu(★ 核心、最高風險)

**Decision**: `get_user_routes`(`handler/route.rs:35-72`)維持「bearer→verify→`roles_for_user`(DB-fresh)→過濾→`UserRoute{routes, home:"home"}`」骨架不變;只把**route 來源**由 in-code `business_routes()` 改為 **sys_menu 讀取 + 純函式樹組裝**。

**實作**:
1. facade `sys_menu::list_active_all(db)` → 取 active(deleted_at IS NULL)menu rows(id/parent_id/route_name/component/meta 欄)。
2. **純函式樹組裝 seam**(無 DB I/O、可單測):`(rows) -> Vec<MenuRoute>` —— 依 `parent_id` 組 parent→children、依 `order` 排序、欄映射到 MenuRoute/RouteMeta(`hide_in_menu`/`keep_alive` 等 i16/bool/str → wire;`children:None` 當無子;`props` 由旗標)。**輸出須逐字重現 R1 樹**。
3. `filter_routes_for_roles`(現成、不改)套在組好的樹上(enforce 過濾)。
4. `home="home"`(hardcoded 不變)。

**Cost/風險**: 動已上線 014;**回歸鐵律(D5/SC-001)= 三角色 menu ladder 與遷移前逐字一致**(curl diff + CDP)。`constant_routes()` / `get_constant_routes` **不動**(R6)。

**Alternatives**: 保留 in-code(否:違 D1 統一源);全改 DB 含 constant routes(否:constant 前端專屬、不入 sys_menu)。

---

## R3 wire 三端(getMenuList/v2 + getMenuTree + getAllPages)+ id 型

**Decision(grep base-web typing + mock 證實)**:

| endpoint | 回傳 | 形狀 | id 型決策 |
|---|---|---|---|
| `GET /systemManage/getMenuList/v2` | `MenuList`=`PaginatingQueryRecord<Menu>` | **flat 分頁**`{current,size,total,records:Menu[]}` —— records **平鋪**(每筆帶 `parentId`、前端表格非 tree、不用 children) | `Menu.id`=**string**(i64→`.to_string()`,CommonRecord type-lie,同 RoleItem;§I.3 v1.2.1「決定不修」) |
| `GET /systemManage/getMenuTree` | `MenuTree[]` | 樹陣列(非分頁)`[{id,label,pId,children?}]` | `MenuTree.id`/`pId`=**number**(typing 明寫 `number`、且為 tree-select key、與 CommonRecord 不同型;rev2 對齊此 typing 送 number、不套 string type-lie) |
| `GET /systemManage/getAllPages` | `string[]` | 頁面 component 名陣列(如 `["home","manage_user","manage_role","manage_menu","manage_user-detail","about",...]`) | N/A |

`Menu`(`system-manage.d.ts:105-127`)= `CommonRecord<{parentId:number, menuType:MenuType, menuName, routeName, routePath, component?, icon, iconType:IconType, buttons?:MenuButton[]|null, children?:Menu[]|null}>` + `MenuPropsOfRoute{i18nKey, keepAlive, constant, order, href, hideInMenu, activeMenu, multiTab, fixedIndexInTab, query}`。`MenuButton{code, desc}`。`MenuType`/`IconType`=`'1'|'2'`(menu_type:1=directory/2=menu;icon_type:1=iconify/2=local)。status `EnableStatus|null`。

**getMenuList/v2 records**:本波 seed 5 筆(home/manage/manage_user/manage_role/manage_menu)+ manage_user-detail(hideInMenu)→ 共 6 筆 flat;`children` 欄回 `null`/省略(前端表格不用、由 parentId 表樹)。`buttons` 回各 menu 的 JSONB(seed 多為 null/空、現有導覽無 button 定義)。

**v1 vs v2**:rev2 **只實作 v2**(base example 只用 v2;§5.9 v1 差異 mock 未載、低優先)。

**CDP-verify 風險**:MenuTree.id=number vs Menu.id=string 的選擇、TreeSelect/表格 rowKey 對 string|number 容忍度 —— 由 CDP(若構造)或 curl+前端實測確認(curl≠modal,但讀端低風險、鏡像 016 list 已證 number-typing/string-runtime 安全)。

---

## R4 sys_menu schema 欄型(jsonb,無新 dep)

**Decision(grep 證實、無新 crate/dep)**:
- sea-orm `1.1.20`(features `sqlx-postgres`/`runtime-tokio-rustls`/`macros`/`with-ipnetwork`,**無 `with-json`**)—— **JSONB 仍可用**(`sea_orm::Json` 內建);`serde_json` 既 workspace dep。
- **jsonb 欄**(precedent `sys_operation_log.payload_before/after`):migration `.json_binary().null()`、entity `Option<Json>`(`use sea_orm::entity::prelude::*` 帶入 `Json`)。
- 欄型對照(全有現成例):`big_integer`(i64,m004)/`integer`(i32,m011 http_status)/`small_integer`(i16,m014 status)/`boolean`(m012 success)/`string`(varchar,m006)/`timestamp_with_time_zone`(m006)/`json_binary`(m004)。
- sys_menu 各欄:`order`/`fixed_index_in_tab`=`.integer()`(i32);`hide_in_menu`/`keep_alive`/`constant`/`multi_tab`=`.boolean()`(Option<bool>);`menu_type`/`icon_type`/`status`=`.small_integer()`(i16);`query`/`buttons`=`.json_binary()`(Option<Json>);路由字串欄=`.string()`;審計欄沿 m006/m014。

**結論**:sys_menu 所需全欄型既有、**無新 crate/dep**。data-model §1 列完整欄表。

---

## R5 migration(create_sys_menu + 讀端 policy seed)+ route_name 對齊

**Decision**:
- **`m20260529_000018_create_sys_menu`**:create table(含 §I.6 6 審計欄)+ partial unique index `sys_menu_route_name_active_uniq`(`ON sys_menu (route_name) WHERE deleted_at IS NULL`,鏡像 006)+ **seed 6 筆逐字重現 R1 樹**(raw SQL INSERT,parent_id 自我參照〔manage 子的 parent_id 指 manage 的 id;seed 用固定 id 或兩段 INSERT 解析〕、ON CONFLICT DO NOTHING)。down 對稱(drop index + drop table)。**up→down→up 可逆**(throwaway DB)。
- **`m20260529_000019_seed_menu_read_policy`**:casbin **3 行 R_SUPER**(`/systemManage/getMenuList/v2`、`/systemManage/getAllPages`、`/systemManage/getMenuTree`=GET,ON CONFLICT DO NOTHING;down 精準 DELETE 3 path)—— Super-only(clarify Q1)、鏡像 013 read policy seed。(getMenuList/getAllPages/getMenuTree 現未 seed 過、確認。)
- lib.rs 兩處 append(000018 create 在 000019 seed 之前)。

**migration 010 menu 可見性 policy(9 rows)不動**;sys_menu.route_name(home/manage_user/manage_role/manage_menu/manage_user-detail + manage 父)**對齊**其 v1。manage 父無 menu policy(tree-prune 衍生)。

**seed parent_id 解法**:seed manage(top,parent_id null)→ 取其 id → seed 子(parent_id=manage id)。raw SQL 可用 subquery(`(SELECT id FROM sys_menu WHERE route_name='manage')`)或 CTE;或 seed 時固定 id(BIGSERIAL 但 seed 顯式 id + setval,鏡像 002/006 seed)。data-model 定。

---

## R6 不動項確認(回歸邊界)

- **`is_route_exist`**(`handler/route.rs:92-130` → `route_exists_for_roles` → `menu_visible` → `enforce((role,routeName,"menu"))`):**純 enforce-based、不讀 route 定義清單** → sys_menu 遷移**不影響**、**019 不動**。(語意:該 route 對 user 是否可見,由 Casbin 判;與「route 是否存在於 sys_menu」無關。)
- **`constant_routes()` / `get_constant_routes`**:403/404/500/login/iframe-page,in-code、不入 sys_menu、**019 不動**(D5)。
- **migration 010 menu policy / 013/018 endpoint enforce**:不動(可見性 + 授權 domain 各異)。

---

## R7 Constitution 對照預判(plan §Constitution Check 詳列)

- §I.1 base-web 權威:rust 提供 getMenuList/v2/getAllPages/getMenuTree + getUserRoutes(DB-driven、wire 不變)→ PASS。
- §I.2 menu Casbin enforce:getUserRoutes 仍 Casbin 過濾(機制不變)→ **PASS(核心紀律守住)**。
- §I.3 wire:envelope、Menu.id=string(type-lie 同 Role)、MenuRoute.id=string、MenuTree.id=number(對齊 typing)、MenuType/IconType 字串列舉、status nullable → PASS。
- §I.5 rev1 不拷:全新寫 → PASS。
- §I.6 新建業務表:sys_menu = **凍結後首張新建業務表** → create 即帶 6 審計欄 → **PASS(forward-only 乾淨示範)**。
- §II 12 拍板:DB-driven menu 源**不違任一拍板**(§11.7 dynamic route mode 凍的是「mode」非「source」;DESIGN §5.1 原即註「從 sys_menu 過濾」、本波是 align 設計意圖、非偏離)→ **無需 amendment**。
- §III ★ 軌道 / §IV #2 base-web inline:019 server-only → N/A。

**待 plan/tasks 落實的明示項**:C-V acceptance(getUserRoutes 逐字回歸 + 三讀端形狀 + 授權 Super-only + 013/014/016/017/018 回歸 + migration 可逆 + prod build)+ 單元測試(樹組裝純函式 / find_active SQL / enum / 欄映射)。**CDP browser smoke**:沿 016/017/018,若難構造則 curl 直送證 + 登記 follow-up(本波讀端 + getUserRoutes 透明、風險低)。
