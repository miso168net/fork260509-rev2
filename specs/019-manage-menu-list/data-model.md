# Data Model: 019 manage-menu-list (Phase 1)

> 命名/型以 grep 實證為準(research.md)。**actual code 命名優先於 spec 推測**。

## 1. sys_menu entity(新建業務表,§I.6 凍結後第一張 → create 即帶 6 審計欄)

`entity/src/sys_menu.rs`(對齊 base-web `Api.SystemManage.Menu` typing,每欄對應 wire field):

| 欄 | 型(Rust / PG) | migration 宣告 | 說明 |
|---|---|---|---|
| `id` | `i64` / bigint PK BIGSERIAL | `.big_integer().auto_increment().primary_key()` | 對外 wire string(`.to_string()`) |
| `parent_id` | `Option<i64>` / bigint null | `.big_integer().null()` | 樹(null/0=top;seed top 用 null) |
| `route_name` | `String` / varchar NOT NULL | `.string().not_null()` | **穩定鍵**(對齊 migration 010 menu policy v1 + MenuRoute.id);partial unique(active) |
| `menu_type` | `Option<i16>` / smallint | `.small_integer().null()` | 1=directory / 2=menu |
| `menu_name` | `String` / varchar NOT NULL | `.string().not_null()` | wire `menuName` |
| `route_path` | `Option<String>` / varchar | `.string().null()` | wire `routePath` |
| `component` | `Option<String>` / varchar | `.string().null()` | 如 `layout.base$view.home` / `view.manage_user` |
| `icon` | `Option<String>` / varchar | `.string().null()` | |
| `icon_type` | `Option<i16>` / smallint | `.small_integer().null()` | 1=iconify / 2=local |
| `i18n_key` | `Option<String>` / varchar | `.string().null()` | wire `i18nKey` |
| `order` | `Option<i32>` / integer | `.integer().null()` | (sea-orm 保留字注意:entity 欄名 `order` 須 `r#order` 或 rename;見下註) |
| `status` | `Option<i16>` / smallint | `.small_integer().null()` | EnableStatus 1/2;seed 種子=1 |
| `hide_in_menu` | `Option<bool>` / boolean | `.boolean().null()` | wire `hideInMenu` |
| `keep_alive` | `Option<bool>` / boolean | `.boolean().null()` | wire `keepAlive` |
| `constant` | `Option<bool>` / boolean | `.boolean().null()` | |
| `multi_tab` | `Option<bool>` / boolean | `.boolean().null()` | wire `multiTab` |
| `href` | `Option<String>` / varchar | `.string().null()` | |
| `active_menu` | `Option<String>` / varchar | `.string().null()` | wire `activeMenu` |
| `fixed_index_in_tab` | `Option<i32>` / integer | `.integer().null()` | wire `fixedIndexInTab` |
| `query` | `Option<Json>` / jsonb | `.json_binary().null()` | route query `[{key,value}]` |
| `buttons` | `Option<Json>` / jsonb | `.json_binary().null()` | `[{code,desc}]`(D3) |
| `created_at` | `DateTimeWithTimeZone` / timestamptz NOT NULL default now | `.timestamp_with_time_zone().not_null().default(Expr::current_timestamp())` | §I.6 |
| `created_by` | `Option<i64>` / bigint | `.big_integer().null()` | §I.6 operator(seed=null) |
| `updated_at` | `Option<DateTimeWithTimeZone>` / timestamptz null | `.timestamp_with_time_zone().null()` | §I.6(D5 col_expr 寫,留 020 寫端) |
| `updated_by` | `Option<i64>` / bigint | `.big_integer().null()` | §I.6 |
| `deleted_at` | `Option<DateTimeWithTimeZone>` / timestamptz null | `.timestamp_with_time_zone().null()` | soft-delete |
| `deleted_by` | `Option<i64>` / bigint | `.big_integer().null()` | §I.6 |

> **★ `order` 保留字**:`order` 在 entity 是 Rust/SQL 敏感字。entity 欄用 `#[sea_orm(column_name = "order")] pub order_no: Option<i32>`(或 `r#order`);migration `Iden` 用 raw `"order"`(需 quote)。plan/tasks 階段定具體命名(建議 entity `order_no`、column_name `"order"`、wire `order`)。
> `impl AuditSerialize for sys_menu::Model`(audit_json:結構欄 + created_at.rfc3339 / updated_at·deleted_at.map(rfc3339) / *_by;jsonb 欄直接帶;無敏感欄)—— 供 020 寫端 audit、019 先落 impl。

`entity/src/lib.rs` 加 `pub mod sys_menu;`(既有 entity crate 加模組、**非新 crate** → Dockerfile builder COPY 不動,§2.13 不觸發)。

## 2. 種子(seed)= 逐字重現 014 `business_routes()`(D5 回歸鐵律)

migration 018 seed 6 筆(raw SQL,parent_id 自我參照);**欄值逐字對齊 research.md R1**:

| route_name | parent_id | menu_type | menu_name(=title) | route_path | component | icon | order | i18n_key | 其他 |
|---|---|---|---|---|---|---|---|---|---|
| `home` | null | 2 | home | /home | layout.base$view.home | mdi:monitor-dashboard | 1 | route.home | status=1 |
| `manage` | null | 1 | manage | /manage | layout.base | carbon:cloud-service-management | 9 | route.manage | status=1 |
| `manage_user` | (manage) | 2 | manage_user | /manage/user | view.manage_user | ic:round-manage-accounts | 1 | route.manage_user | status=1 |
| `manage_role` | (manage) | 2 | manage_role | /manage/role | view.manage_role | carbon:user-role | 2 | route.manage_role | status=1 |
| `manage_menu` | (manage) | 2 | manage_menu | /manage/menu | view.manage_menu | material-symbols:route | 3 | route.manage_menu | keep_alive=true, status=1 |
| `manage_user-detail` | (manage) | 2 | manage_user-detail | /manage/user-detail/:id | view.manage_user-detail | null | null | route.manage_user-detail | hide_in_menu=true, active_menu=manage_user, (props=true → 見下), status=1 |

- `menu_type`:`home` 是葉(實質 menu)→ 2;`manage` 是父(目錄)→ 1;manage 子皆葉 → 2。(對齊 base-web MenuType 1=dir/2=menu;`home` 在 014 是葉 route 故 2。)
- **`props`**:014 MenuRoute 有 `props:Option<bool>`(manage_user-detail=true)。sys_menu 無 `props` 欄(base-web Menu typing 無 props 欄、props 屬 route-level)。getUserRoutes 樹組裝時:**`props` 由 component/route 規則衍生**(有路徑參數 `:id` → props=true),或 sys_menu 加一 `props` bool 欄。**已釘(tasks T006):樹組裝時 `props = route_path.contains(':')` 衍生**(免加欄;對當前 seed 樹正確 —— 僅 `manage_user-detail`〔`/manage/user-detail/:id`〕→ props=true,餘 home/manage/manage_user/role/menu 無 `:` → props 省略,逐字對齊 014)。**★ 020 follow-up(analyze U1)**:寫端若出現「有 `:` 路徑但非 props」或「props=true 但路徑無 `:`」之 menu,heuristic 會破 → 020 評估 sys_menu 加顯式 `props` bool 欄。
- seed parent_id:先 INSERT `home`/`manage`(parent_id null)→ 子 INSERT 用 `parent_id=(SELECT id FROM sys_menu WHERE route_name='manage' AND deleted_at IS NULL)`(subquery)。created_by=null(system seed)。
- **`icon_type`(as-built 回填,§2.23)**:上方 §2 seed 表未列 `icon_type` 欄(§1 欄定義有)。實際 migration 018 對 5 個有 iconify icon 的列 seed `icon_type=1`(home/manage/manage_user/manage_role/manage_menu)、`manage_user-detail`(無 icon)→ `icon_type=NULL`。getUserRoutes(MenuRoute 無 `iconType`)不受影響;getMenuList wire `iconType="1"` 正確。

## 3. 樹組裝(純函式 seam,getUserRoutes + getMenuTree 共用基礎)

`fn assemble_menu_tree(rows: Vec<MenuRow>) -> Vec<MenuNode>`(無 DB I/O、可單測):
- 依 `parent_id` 分組(null=top)、依 `order` 排序、遞迴掛 children。
- 孤節點(parent_id 指向不存在/軟刪父)→ 略過掛接(以可顯示根為準,spec Edge Case)。
- 供:(a) getUserRoutes 映射 MenuRoute(+ Casbin filter);(b) getMenuTree 映射 MenuTree。
- 單測:扁平 rows → 正確巢狀 + 排序 + 孤節點處理。

## 4. Wire DTO(三端對齊)

### 4.1 getUserRoutes(US1,遷 sys_menu,wire 逐字不變)
- 回 `UserRoute{routes:Vec<MenuRoute>, home:"home"}`(現成型、不改)。
- 樹組裝 → 映射 `MenuRoute`/`RouteMeta`(R1 形)→ `filter_routes_for_roles`(Casbin)。
- `MenuRoute.id`=route_name(string);camelCase;skip None;**輸出逐字 == 014**。

### 4.2 getMenuList/v2(US2,新)
- 回 `Res<PageRes<MenuItem>>`(分頁外殼 `{current,size,total,records}`、沿 016 `PageRes`)。
- `MenuItem`(`#[serde camelCase]`,鏡像 016 RoleItem 真值映射):`id:String`(i64→str)、**`parentId:String`(top-level〔home/manage〕`parent_id` NULL → wire `parentId="0"`;非 top → 父 id `.to_string()` —— 見 §6,base-web `Menu.parentId:number` 非 nullable、root 慣例 0)**、`menuType:Option<String>`(i16→"1"/"2")、`menuName`、`routeName`、`routePath:Option<String>`、`component:Option<String>`、`icon:Option<String>`、`iconType:Option<String>`、`i18nKey/href/activeMenu:Option<String>`、`order/fixedIndexInTab:Option<i32>`(wire number)、`status:Option<String>`、`hideInMenu/keepAlive/constant/multiTab:Option<bool>`、`query:Option<Json>`、`buttons:Option<Json>`(`[{code,desc}]`)、`createBy/createTime/updateBy/updateTime:Option<String>`(§I.6 真值,rfc3339/str)、`children:null`(flat、前端不用)。
- **flat 分頁**(records 平鋪;前端表格非 tree、由 parentId 表樹)。本波 records = 6 seed 筆。

### 4.3 getMenuTree(US2,新)
- 回 `Res<Vec<MenuTreeNode>>`(非分頁、直接陣列)。
- `MenuTreeNode{id:i64(number), label:String(=menu_name), pId:i64(number), children:Option<Vec<MenuTreeNode>>}`(`#[serde camelCase]`;`pId` 注意大小寫:wire `pId`)。
- **id/pId = number**(對齊 typing,§6)。由 assemble_menu_tree 建。

### 4.4 getAllPages(US2,新)
- 回 `Res<Vec<String>>`(頁面 component 名集)。
- 本波:**靜態集 = 對齊 base-web example 的可路由頁面 component 名**(analyze A1 釘:impl 取 base-web example 實際頁面集,非任意值)。research C3 mock 範例:`["home","403","404","405","function_multi-tab","function_tab","exception_403","exception_404","exception_500","multi-menu_first_child","multi-menu_second_child_home","manage_user","manage_role","manage_menu","manage_user-detail","about"]` —— impl 對齊 base-web example 分支實際可路由頁(以該分支為準、不憑空增刪)。讀端用(列表顯示不依賴);**020 寫端**建 menu 選 component 時對齊完整集。

### 4.5 三端對齊表

| 概念 | rust wire | base-web typing | runtime |
|---|---|---|---|
| getUserRoutes | `UserRoute{routes,home}` | `UserRoute` | ✓(逐字不變)|
| MenuRoute.id | String(route_name) | string | ✓ |
| getMenuList | `PageRes<MenuItem>` | `MenuList=PaginatingQueryRecord<Menu>` | flat 分頁 ✓ |
| Menu.id | String(i64→str) | `number`(CommonRecord) | string(**type-lie §I.3 v1.2.1 不修**,同 Role)|
| Menu enum(menuType/iconType/status) | Option<String> "1"/"2" | `'1'\|'2'`/`null` | ✓ |
| buttons/query | Option<Json> | `MenuButton[]\|null` / query | ✓(JSONB round-trip)|
| getMenuTree | `Vec<MenuTreeNode>` | `MenuTree[]` | ✓ |
| MenuTree.id/pId | i64(**number**) | `number` | ✓(對齊 typing、不套 string)|
| getAllPages | `Vec<String>` | `string[]` | ✓ |

## 5. casbin(可見性,不動 + 讀端授權新增)

- **可見性(migration 010,9 rows,不動)**:`p,<role>,<route_name>,menu` —— sys_menu.route_name 對齊 v1(home/manage_user/manage_user-detail/manage_role/manage_menu;manage 父無 row、tree-prune 衍生)。getUserRoutes 讀 sys_menu 後仍用此 enforce 過濾。
- **讀端授權(migration 019 新,Super-only,clarify Q1)**:`p,R_SUPER,/systemManage/getMenuList/v2,GET` · `p,R_SUPER,/systemManage/getAllPages,GET` · `p,R_SUPER,/systemManage/getMenuTree,GET`(ON CONFLICT DO NOTHING;down 精準 DELETE 3 path)。三端掛 `enforce_mw` → 非 Super 讀 403+5003。

## 6. id 型決策(§I.3 + type-lie)

- **getUserRoutes `MenuRoute.id`** = string(route_name)—— §I.3 凍結、014 既有、不變。
- **getMenuList `Menu.id`** = **string**(i64→`.to_string()`)—— CommonRecord 型,沿 016/017/018 RoleItem/UserItem 的 string type-lie(typing number、runtime string、§I.3 v1.2.1「決定不修」)。
- **getMenuList `Menu.parentId`** = **string**;**top-level(home/manage)`parent_id` NULL → wire `parentId="0"`**(base-web `Menu.parentId:number` 非 nullable、root 慣例 0;送 `"0"` 對齊 id string type-lie + 避 null↔number mismatch),非 top → 父 id `.to_string()`。(analyze I1 釘)
- **getMenuTree `MenuTree.id`/`pId`** = **number**(i64)—— MenuTree 是**非 CommonRecord 的獨立型**、typing 明寫 `number`、且為 tree-select/tree-build 的 key(數值匹配較穩);rev2 對齊此 typing 送 number、**不套** string type-lie。
- ★ CDP-verify(若構造):getMenuTree number-id 與 getMenuList string-id 並存於選單管理頁不衝突(getMenuTree 用於 020 寫端的父選擇、019 讀端僅顯示);讀端低風險、鏡像 016 number-typing/string-runtime 已證。

## 7. 狀態 / 軟刪

- sys_menu 軟刪(deleted_at)+ status(1/2)—— facade `find_active`(deleted_at IS NULL)。本波**唯讀 + seed**(無寫端);getMenuList/getMenuTree/getUserRoutes 皆讀 active。停用(status=2)/軟刪 menu 的顯示語意(getMenuList 是否顯停用)留 020 寫端定;本波 seed 全 status=1。
- 復原 / 寫端 CRUD:**不在 019**(→ 020)。
