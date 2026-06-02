# Data Model: 020 manage-menu-write (Phase 1)

> 命名/型以 grep 實證為準(research.md)。**actual code 命名優先於 spec 推測**。**無新建表/欄**(用 019 sys_menu);本波加寫路徑 + 1 casbin write-policy migration。

## 1. sys_menu(沿用 019,不建表/不 alter)

`entity/src/sys_menu.rs::Model`(27 欄,research R3)**不改**。`DeriveEntityModel` 自動生成 `ActiveModel`,寫端直接用。寫端涉及欄:

| 欄 | 型 | 寫端 |
|---|---|---|
| `id` | i64 PK(BIGSERIAL) | create NotSet(DB 生成);update/delete 以 id 定位 |
| `parent_id` | Option<i64> | create/(edit 不變,FR-011 re-parent out)。None=頂層 |
| `route_name` | String | **create Set;update 不動(D2 immutable)**;active 唯一前檢 |
| `menu_type` | Option<i16> | **create Set;update 不動(D2 immutable)** |
| `menu_name` | String | create/update Set |
| `route_path`/`component`/`icon`/`i18n_key`/`href`/`active_menu` | Option<String> | create/update Set |
| `icon_type`/`status` | Option<i16> | create/update Set(wire `'1'`/`'2'`→i16) |
| `order_no`(col `"order"`) | Option<i32> | create/update Set(wire `order` number) |
| `hide_in_menu`/`keep_alive`/`constant`/`multi_tab` | Option<bool> | create/update Set |
| `fixed_index_in_tab` | Option<i32> | create/update Set(wire number) |
| `query`/`buttons` | Option<Json> | create/update Set(JSONB 整欄替換,`[{key,value}]`/`[{code,desc}]`) |
| `created_at` | DateTimeWithTimeZone NN | create NotSet(DB default now) |
| `created_by` | Option<i64> | create Set(operator,§I.6) |
| `updated_at`/`updated_by` | Option<...> | update 成對 Set(DB `current_timestamp` / operator,§I.6) |
| `deleted_at`/`deleted_by` | Option<...> | soft_delete 成對 Set(DB `current_timestamp` / operator,§I.6) |

## 2. facade 寫端(`model/facade/sys_menu.rs` 擴,鏡像 018 sys_role,走 011 `mutate_in_txn`)

```text
pub struct CreateMenuData {        // handler 已解析 wire→DB 型
    parent_id: Option<i64>, route_name: String, menu_type: Option<i16>, menu_name: String,
    route_path/component/icon/i18n_key/href/active_menu: Option<String>,
    icon_type/status: Option<i16>, order_no/fixed_index_in_tab: Option<i32>,
    hide_in_menu/keep_alive/constant/multi_tab: Option<bool>,
    query/buttons: Option<serde_json::Value>,
}
pub struct UpdateMenuData { /* CreateMenuData 減 route_name/menu_type/parent_id(D2 + FR-011 不動) */ }

pub enum CreateMenuError { DuplicateRouteName, Db(DbErr) }   // impl From<DbErr>

fn build_create_menu_active(data, operator) -> ActiveModel   // id/created_at/updated_*/deleted_* NotSet;created_by Set(operator);業務欄 Set(純 seam、可單測)
fn update_menu_query(id, data, operator) -> UpdateMany<Entity> // col_expr 業務欄 + UpdatedAt=current_timestamp + UpdatedBy(operator);**不含 route_name/menu_type/parent_id**(純 seam、可單測)
fn soft_delete_query(id, operator) -> UpdateMany<Entity>      // DeletedAt=current_timestamp + DeletedBy 成對(純 seam、可單測)

pub async fn create_menu(db, data, operator) -> Result<i64, CreateMenuError>
    // route_name active 唯一前檢(交易外)→ DuplicateRouteName;mutate_in_txn(insert RETURNING + audit Insert);回新 id
pub async fn update_menu(db, id, data, operator) -> Result<bool, DbErr>
    // load active→Ok(false);update_menu_query exec + 重查 + audit Update
pub async fn soft_delete(db, id, operator) -> Result<bool, DbErr>
    // load active→Ok(false);soft_delete_query exec + audit SoftDelete
pub async fn find_active_by_id(db, id) -> Result<Option<Model>, DbErr>   // 種子/父子 guard 載入
pub async fn count_active_children(db, parent_id) -> Result<u64, DbErr>  // D5 父刪 guard(parent_id=本 id AND deleted_at IS NULL)
```

- `impl AuditSerialize for Model` **已存在**(019)→ create/update/soft_delete 直接用 `model.audit_json()` 作 payload。
- audit:`AuditOperation::{Insert,Update,SoftDelete}`、`entity_table="sys_menu"`、`operator{id:operator, ip:None}`(沿 018,避 INET 寫入路徑)。

## 3. handler 寫端(`handler/system_manage.rs` 擴,鏡像 017/018,零 `entity::`)

```text
add_menu(State, Extension<RequestContext>, Json<MenuCreateReq>) -> Res<()>          // POST
update_menu(State, Extension<RequestContext>, Json<MenuUpdateReq>) -> Res<()>        // POST
delete_menu(State, Extension<RequestContext>, Json<DeleteReq>) -> Res<()>            // DELETE(沿用既有 DeleteReq{id:String})
batch_delete_menus(State, Extension<RequestContext>, Json<BatchDeleteReq>) -> Res<()> // DELETE(沿用既有 BatchDeleteReq{ids:Vec<String>})
```

- **operator**:`ctx.operator_id`→None 回 `Internal(5000)`(沿 018)。
- **wire 解析**(非法一律 `Res::err_msg(BizCode::BizError, ...)` = 2222):
  - `id`(update/delete):`String` parse i64(R7);batch 全解析、任一失敗→2222。
  - `parent_id`(create):彈性反序列化(§4)→ Option<i64>(0/"0"/null→None)。
  - `menu_type`/`icon_type`/`status`:`Option<String>`→`enum_str_to_i16`(既有,`'1'`/`'2'`→i16;非法→2222)。
  - `order`/`fixed_index_in_tab`:Option<i32>(wire number 直收)。
  - bool/string/jsonb:直收。
- **guard**(handler 層,code-based,鏡像 018):
  - `is_seed_menu(route_name)`=`matches!(route_name, "home"|"manage"|"manage_user"|"manage_role"|"manage_menu"|"manage_user-detail")`(新增純函式)。
  - **update 停用 guard**:`status` 解析為停用(2)且目標為種子 → 2222「不可停用系统内置菜单」(載入 `find_active_by_id` 取 route_name)。
  - **delete guard**:目標為種子 → 2222「不可删除系统内置菜单」;有 active 子(`count_active_children>0`)→ 2222「请先删除子菜单」。
  - **batch_delete 兩段原子拒**:pass1 全載入 → 任一種子 OR 任一具 active 子 → 整批拒(2222、無部分執行);pass2 逐筆 soft_delete(寬鬆 Ok(false) 跳過,DB Err→5000)。
- **facade 結果映射**:`DuplicateRouteName`→2222「路由名称已存在」;create `Ok(id)`→ok;update/delete `Ok(false)`→2222「菜单不存在」;`Db/Err`→5000+log。

## 4. wire DTO(寫端,`#[serde rename_all="camelCase"]`)

### 4.1 MenuCreateReq(addMenu,無 id)
- `parentId`(彈性 number|string|null→Option<i64>)、`menuType/iconType/status:Option<String>`、`menuName:String`、`routeName:String`、`routePath/component/icon/i18nKey/href/activeMenu:Option<String>`、`order/fixedIndexInTab:Option<i32>`、`hideInMenu/keepAlive/constant/multiTab:Option<bool>`、`query/buttons:Option<serde_json::Value>`。
- **parentId 彈性反序列化**(R1/R4 混型):`#[serde(default, deserialize_with = "de_parent_id")]` —— 接受 JSON number / string / null,`0`/`"0"`/null/空→`None`(頂層)、其餘→`Some(i64)`(parse 失敗→serde error→handler 視為非法→2222 或 deserialize error);純函式 `de_parent_id` 可單測。

### 4.2 MenuUpdateReq(updateMenu,含 id)
- `id:String`(parse i64,R7)+ MenuCreateReq 業務欄 **減 `routeName`/`menuType`**(D2 immutable:serde 不宣告該兩欄 → 送了也靜默丟,鏡像 RoleUpdateReq 省 roleCode);`parentId` 亦不宣告(FR-011 re-parent out → update 不動 parent_id)。

### 4.3 delete/batchDelete
- 沿用既有 `DeleteReq{id:String}` / `BatchDeleteReq{ids:Vec<String>}`(017/018 共用)。

### 4.4 三端對齊表

| 概念 | wrapper 送 | rust DTO | facade/DB |
|---|---|---|---|
| addMenu | full Menu(無 id) | MenuCreateReq | create_menu → ActiveModel insert |
| updateMenu | full Menu + id | MenuUpdateReq(省 routeName/menuType/parentId) | update_menu → col_expr(業務欄) |
| deleteMenu | `{id}` | DeleteReq | soft_delete |
| batchDeleteMenu | `{ids}` | BatchDeleteReq | 兩段 soft_delete |
| parentId | number/string/null | de_parent_id→Option<i64> | parent_id 欄(create only) |
| id | string | String→i64 | WHERE id= |
| enum | `'1'`/`'2'` | Option<String>→i16 | menu_type/icon_type/status |
| jsonb | `[{...}]` | Option<Value> | query/buttons 整欄替換 |

## 5. casbin(寫端授權新增;可見性 010 不動)

- **migration `m20260529_000020_seed_menu_write_policy`**(鏡像 017):casbin **4 行 R_SUPER**:
  `p,R_SUPER,/systemManage/addMenu,POST` · `/systemManage/updateMenu,POST` · `/systemManage/deleteMenu,DELETE` · `/systemManage/batchDeleteMenu,DELETE`(ON CONFLICT DO NOTHING;down 精準 `DELETE WHERE ptype='p' AND v1 IN(4 path)`)。lib.rs 註冊在 000019 之後。
- **migration 010 menu-visibility policy / 019 read policy 不動**(D3)。4 route 掛 `enforce_mw`(main.rs,driver restart 後 enforcer 重載 policy)。

## 6. 種子選單集(D4,code-based guard)

`is_seed_menu` 判定集 = 019 seed 6 route_name:`home` / `manage` / `manage_user` / `manage_role` / `manage_menu` / `manage_user-detail`(對齊 migration 018 seed + 014 樹)。種子:不可刪(delete/batch 2222)、不可停用(update status=2 → 2222);可改 name/icon/order/i18nKey 等(route_name/menu_type 已 D2 鎖)。

## 7. 狀態 / 軟刪 / 不動項

- 寫端軟刪(deleted_at)+ §I.6 成對審計;復原(restore)/ re-parent → FR-011 out(後續)。
- `get_user_routes` code **不動**(編輯既有可見選單→因讀同源即時反映 = D1 payoff;未編輯時逐字基線不變)。019 三讀端、constant routes、isRouteExist 不動。
- 新選單可見性:020 不寫 casbin(D3)→ 新選單在 MenuAuth 指派前不顯於 runtime 導覽、顯於管理頁。
