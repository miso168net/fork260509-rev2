# Data Model: 017-manage-menu-list（Phase 1）

> 命名/型以 [research.md](./research.md) grep 的 base-web `Menu` typing + rev2 既有 pattern 權威為準。**新建 sys_menu 表 + seed 6 節點 + 1 seed policy migration + entity + facade + 純 tree-builder/分頁/role-filter + Output DTO + handler/main 接線**。不動 014、不建 sys_role_menu/sys_menu_button。id wire=number（v1.1.0）、route_name=string（casbin 對齊鍵）。

## 1. schema 變更（migration `m20260529_000016` / `m..017`，接 015 後、經 010 自動套）

### `m..016_create_sys_menu` — 建表 + seed 6 節點

| 欄 | sea-orm builder | 約束 | 對應 base-web `Menu` |
|---|---|---|---|
| `id` | `.big_integer().auto_increment().not_null().primary_key()` | PK BIGSERIAL | `id`(number) |
| `route_name` | `.string().not_null()` | NOT NULL | `routeName`（+ casbin v1 鍵） |
| `parent_id` | `.big_integer().not_null().default(0)` | NOT NULL default 0 | `parentId`（0=頂層） |
| `menu_type` | `.string().not_null()` | NOT NULL '1'/'2' | `menuType` |
| `menu_name` | `.string().not_null()` | NOT NULL | `menuName` |
| `route_path` | `.string().not_null()` | NOT NULL | `routePath` |
| `component` | `.string().null()` | NULL | `component` |
| `icon` | `.string().null()` | NULL | `icon` |
| `icon_type` | `.string().null()` | NULL '1'/'2' | `iconType` |
| `i18n_key` | `.string().null()` | NULL | `i18nKey` |
| `menu_order` | `.integer().null()` | NULL | `order`（保留字→menu_order） |
| `keep_alive` | `.boolean().null()` | NULL | `keepAlive` |
| `constant` | `.boolean().null()` | NULL | `constant` |
| `hide_in_menu` | `.boolean().null()` | NULL | `hideInMenu` |
| `active_menu` | `.string().null()` | NULL | `activeMenu` |
| `route_ext` | `.json_binary().null()` | NULL JSONB | →攤平 `href`/`query`/`multiTab`/`fixedIndexInTab` |
| `buttons` | `.json_binary().null()` | NULL JSONB | `buttons`(`[{code,desc}]`) |
| `status` | `.string().not_null().default("1")` | NOT NULL default '1' | `status` |
| `created_at` | `.timestamp_with_time_zone().not_null().default(Expr::current_timestamp())` | NOT NULL default now() | `createTime` |
| `updated_at` | `.timestamp_with_time_zone().null()` | NULL | `updateTime` |
| `deleted_at` | `.timestamp_with_time_zone().null()` | NULL | —（soft-delete 過濾） |

**index**:partial unique `sys_menu_route_name_active_uniq` ON (route_name) WHERE deleted_at IS NULL（同 sys_role code 套路）。
**`down`** = drop table。
**JSONB**:`.json_binary()`（同 011 sys_operation_log m..004:48,53）。

**seed 6 節點**（同檔 up()、`execute_unprepared` INSERT;children parent_id 用 route_name subquery）:先插 2 頂層（home / manage），再插 4 children（parent_id = `(SELECT id FROM sys_menu WHERE route_name='manage')`、同 013 role_id subquery 套路）。值對齊 014 `business_routes()`:

| route_name | parent_id | menu_type | menu_name | route_path | component | icon | icon_type | i18n_key | menu_order | keep_alive | hide_in_menu | active_menu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home | 0 | 2 | home | /home | layout.base$view.home | mdi:monitor-dashboard | 1 | route.home | 1 | | | |
| manage | 0 | 1 | manage | /manage | layout.base | carbon:cloud-service-management | 1 | route.manage | 9 | | | |
| manage_user | (manage) | 2 | manage_user | /manage/user | view.manage_user | ic:round-manage-accounts | 1 | route.manage_user | 1 | | | |
| manage_role | (manage) | 2 | manage_role | /manage/role | view.manage_role | carbon:user-role | 1 | route.manage_role | 2 | | | |
| manage_menu | (manage) | 2 | manage_menu | /manage/menu | view.manage_menu | material-symbols:route | 1 | route.manage_menu | 3 | true | | |
| manage_user-detail | (manage) | 2 | manage_user-detail | /manage/user-detail/:id | view.manage_user-detail | | | route.manage_user-detail | | | true | manage_user |

> `route_ext`/`buttons`/`status`('1')/`constant`(null)/`created_at`(now()) 同 016 慣例;manage_user-detail 無 icon → icon/icon_type null。

### `m..017_seed_menu_endpoint_policy` — casbin endpoint policy（沿 m..009/m..015）
```
('p','R_SUPER','/systemManage/getMenuList/v2','GET','','',''),
('p','R_ADMIN','/systemManage/getMenuList/v2','GET','','',''),
('p','R_SUPER','/systemManage/getAllPages','GET','','',''),
('p','R_ADMIN','/systemManage/getAllPages','GET','','',''),
('p','R_SUPER','/systemManage/getMenuTree','GET','','',''),
('p','R_ADMIN','/systemManage/getMenuTree','GET','','','')
```
`ON CONFLICT DO NOTHING`;R_USER_COMMON 不放（deny）;`down` = DELETE 本 migration 6 條。**lib.rs** 註冊 016/017（接 015 後、mod + migrations() vec）。

## 2. entity（`entity/src/sys_menu.rs`，新）

```
// sys_menu::Model（DeriveEntityModel、table_name="sys_menu"）
id: i64 (primary_key, auto_increment)
route_name: String / parent_id: i64 / menu_type: String
menu_name: String / route_path: String / component: Option<String>
icon: Option<String> / icon_type: Option<String>
i18n_key: Option<String> / menu_order: Option<i32>
keep_alive: Option<bool> / constant: Option<bool> / hide_in_menu: Option<bool> / active_menu: Option<String>
route_ext: Option<Json> / buttons: Option<Json>      // sea-orm Json（同 011 sys_operation_log）
status: String
created_at: DateTimeWithTimeZone / updated_at: Option<DateTimeWithTimeZone> / deleted_at: Option<DateTimeWithTimeZone>
```
- `Relation {}` / `ActiveModelBehavior` 既有空。`Json` 來自 `sea_orm::entity::prelude::Json`（= serde_json::Value）。

## 3. facade（`server/src/model/facade/sys_menu.rs`，新）

```
impl SoftDeletable for Entity { fn deleted_at_column() -> Column { Column::DeletedAt } }
pub fn find_active() -> Select<Entity>                                   // 委派 SoftDeletable（deleted_at IS NULL）
pub async fn all_active(db) -> Result<Vec<Model>, DbErr>                 // find_active + order_by_asc(MenuOrder) + all
```
- **無 list_paged**（getMenuList 走記憶體 tree+slice、非 DB 分頁）。
- 守 009 lint:sys_menu 存取唯一管道。SQL-build 單測:`find_active()`/`all_active 的 query` build 斷言 `deleted_at IS NULL` + `ORDER BY "menu_order"`。

## 4. Output DTO（`handler/system_manage.rs` 擴充，serde camelCase、id=number）

```
// getMenuList/v2 records 元素（含巢狀 children）
struct MenuItem {
  id: i64,                      // → number
  parent_id: i64,               // → parentId
  menu_type: String,            // → menuType '1'/'2'
  menu_name: String,            // → menuName
  route_name: String,           // → routeName
  route_path: String,           // → routePath
  component: Option<String>,
  icon: Option<String>,
  icon_type: Option<String>,    // → iconType
  i18n_key: Option<String>,     // → i18nKey
  order: Option<i32>,           // ← menu_order（wire 回 order）
  keep_alive: Option<bool>,     // → keepAlive
  constant: Option<bool>,
  hide_in_menu: Option<bool>,   // → hideInMenu
  active_menu: Option<String>,  // → activeMenu
  href: Option<String>,         // ← route_ext.href（攤平）
  query: Option<Value>,         // ← route_ext.query（[{key,value}]）
  multi_tab: Option<bool>,      // ← route_ext.multiTab → multiTab
  fixed_index_in_tab: Option<i32>, // ← route_ext.fixedIndexInTab → fixedIndexInTab
  buttons: Option<Value>,       // ← buttons（[{code,desc}]、017 null）
  status: String,               // '1'/'2'
  create_time: String,          // ← created_at.to_rfc3339()
  update_time: Option<String>,  // ← updated_at
  create_by: Option<String>,    // null（operator 折 Phase 4 A）
  update_by: Option<String>,    // null
  children: Vec<MenuItem>,      // 由 build_menu_tree 組（空則空 vec 或 skip_serializing_if 視 base-web 容忍度;傾向送 [] / 葉省略）
}
// getMenuTree 元素（輕量）
struct MenuTreeItem { id: i64, label: String, p_id: i64, children: Vec<MenuTreeItem> }  // label←menu_name、pId←parent_id
```
- **id: i64 → JSON number**（不 to_string）。`route_ext`/`buttons` 由 handler 從 `Option<Json>` 取值攤平/直送（明確 map，非 serde flatten）。
- `children` 序列化:base-web `Menu.children?:Menu[]|null`;葉節點可送空 `[]` 或 `skip_serializing_if`（plan 階段二擇一、傾向葉省略 children 欄）。

## 5. 純查詢/邏輯函式（no-DB、純單測對象）

```
fn build_menu_tree(rows: Vec<Model>) -> Vec<MenuItem>     // parent_id→children map、遞迴巢狀、依 menu_order 排序、頂層=parent_id 0/無父
fn pages_for_roles(roles: &[String]) -> Vec<String>       // roles 含 "R_SUPER" → REAL_PAGES+DEMO_PAGES;else REAL_PAGES
const REAL_PAGES: &[&str] = &["home","manage_user","manage_role","manage_menu","manage_user-detail"];
const DEMO_PAGES: &[&str] = &[/* base-web routes.ts demo 頁級 route key、排 layout 父+系統頁;impl grep 定案 */];
// root 分頁:reuse 016 normalize_page(current,size) → slice 頂層 + total=頂層數
```
- `build_menu_tree` 共用於 getMenuList（再 root-slice 分頁）+ getMenuTree（轉 MenuTreeItem、不分頁）。
- `MenuItem→MenuTreeItem` 或各自從 Model 組（plan 階段定;傾向 getMenuTree 直接從 Model 組輕量樹、不經 MenuItem）。

## 6. handler / route 接線（`handler/system_manage.rs` 擴充 + main.rs）

```
handler/system_manage.rs（擴充、016 已有 PageResp/normalize_page/Role*/User*）:
  get_menu_list_v2(State, Query<MenuListParams{current,size}>) -> Res<PageResp<MenuItem>>
    = all_active → build_menu_tree → 頂層 slice(normalize_page) → Res::ok(PageResp{...})
  get_menu_tree(State) -> Res<Vec<MenuTreeItem>>
    = all_active → 組輕量樹 → Res::ok(vec)
  get_all_pages(State, headers) -> Res<Vec<String>>
    = bearer→jwt::verify→Claims.roles → pages_for_roles(roles) → Res::ok(vec)   // role-aware
  imports:use crate::model::facade::sys_menu;（+ 016 既有 sys_role/sys_user/sys_user_role）+ jwt/bearer（getAllPages）。NOT use entity::（inline map）。
main.rs:
  3 route 各 .route_layer(from_fn_with_state(state.clone(), enforce_mw)):
  - .route("/systemManage/getMenuList/v2", get(system_manage::get_menu_list_v2).route_layer(...))
  - .route("/systemManage/getMenuTree",   get(system_manage::get_menu_tree).route_layer(...))
  - .route("/systemManage/getAllPages",   get(system_manage::get_all_pages).route_layer(...))
  - 全域 015 audit_mw layer 仍包所有 route（不動）。
```
- enforce_mw 判 admin（handler 不判;getAllPages 的 Super-demo 過濾是內容差異、非授權閘）。
- DbErr → `Res::err(BizCode::Internal)` + `tracing::warn!`（同 016）。

## 7. 與既有關係
- 新 sys_menu 表（不動既有表）;seed 6 節點對齊 014 `business_routes()`、route_name 對齊 casbin `v2='menu'` 9 條（無漂移、seed-only）。
- **014 getUserRoutes 不動**（仍讀 in-code、行為不變;sys_menu 不被 014 讀）。
- 008 envelope:Res<T> 包 PageResp/Vec。009 soft-delete:只回 active。010:2 migration 自動套。013 enforce:3 route 掛 enforce_mw + Claims.roles（getAllPages）。016:沿 PageResp/normalize_page/facade pattern。011:JSONB `Json`/`.json_binary()` 先例。
- **無新表外實體、無新 crate、無新 dep、不建 sys_role_menu/sys_menu_button**。
