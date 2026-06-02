# Research: 020 manage-menu-write (Phase 0)

> 依 CLAUDE.md §3 紀律:grep 驗證真實 code(不信 brainstorm 命名假設)。5-cluster 並行驗證(workflow `wf_5cd259ad-73d`)。**No new crate/dep / No new table**(用 019 sys_menu)。所有 NEEDS CLARIFICATION 已解。

---

## R0 ★ 範圍確認:020 = rust-api 寫端 + base-web 接線(**非 server-only**)

**Decision**: 020 改 rust-api(entity 寫路徑 facade + handler + 1 migration)**與** base-web(rev2 wrapper 新檔 + MODAL-WIRING placeholder)。對比 019(server-only),020 因要接 base-web 寫端 placeholder → **兩 worktree 皆動**(鏡像 017/018)。

**Rationale(grep 證實)**:
- base-web menu 寫端 fn **upstream 不存在**(R4:`rev2-system-manage.ts` 只有 user/role 8 fn,`system-manage.ts` 只有 menu 讀端 3 fn)→ 需新增 4 個 rev2 wrapper fn(BASE-WEB-WRAPPER 軌道,鏡像 017/018)。
- base-web 5 個寫端 placeholder 未接線(R1:`menu-operate-modal.vue:259` handleSubmit、`index.vue:191` handleDelete、`index.vue:184` handleBatchDelete)→ MODAL-WIRING ★ 接線。
- ∴ 收尾為**兩段式 commit ×2 worktree**(rust-api + base-web)+ 外層 SHA pin(鏡像 017)。

---

## R1 base-web 寫端 form 送出形(wire 對齊權威)

**Source**: `menu-operate-modal.vue`(add/addChild/edit)+ `index.vue`(delete/batchDelete)。

- **Model 型**(`menu-operate-modal.vue:57-83`):`Pick<Menu, menuType|menuName|routeName|routePath|component|order|i18nKey|icon|iconType|status|parentId|keepAlive|constant|href|hideInMenu|activeMenu|multiTab|fixedIndexInTab>` + `{query, buttons, layout, page, pathParam}`。
- **`getSubmitParams()`**(`:240-250`):移除 `layout/page/pathParam`,加 `component=transformLayoutAndPageToComponent(layout,page)`、`routePath=getRoutePathWithParam(routePath,pathParam)`;**edit 時含 `id`**(來自 rowData)、add/addChild **無 id**(createDefaultModel 無 id)。
- **placeholder 行號**:`handleSubmit` 的 `// request` = **`menu-operate-modal.vue:259**(緊接 `console.log(params)` 後);`index.vue` `handleBatchDelete` = **`:184`**、`handleDelete(id)` = **`:191`**(其後各有本地 `onBatchDeleted()`/`onDeleted()` UI 更新)。
- **送出形**:
  - **addMenu**(operateType add/addChild):全 18 Menu 業務欄 + `query`/`buttons`,**無 id**;`parentId` add=`0`(number 預設、頂層)、addChild=父項 `id`(`Object.assign(model,{parentId:id})`,`:189-191`)。
  - **updateMenu**(operateType edit):同上 + **`id`**(原 rowData id)。`menuType` 在 edit 鎖定(`disabledMenuType`=`operateType==='edit'`,`:124`)。
  - **deleteMenu**:`{ id }`(`index.vue:191` handleDelete(id))。
  - **batchDeleteMenu**:`{ ids }`= `checkedRowKeys.value`(`number[]`,row-key=`row.id`,`:174,244`)。
- **wire 型**(`system-manage.d.ts:105-127`):`Menu = CommonRecord<{parentId:number, menuType:MenuType, menuName, routeName, routePath, component?, icon, iconType:IconType, buttons?:MenuButton[]|null, children?}> & MenuPropsOfRoute{i18nKey,keepAlive,constant,order,href,hideInMenu,activeMenu,multiTab,fixedIndexInTab,query}`;`MenuButton={code,desc}`;`MenuType/IconType='1'|'2'`;`query=[{key,value}]`。

**★ parentId 寫端混型 gotcha(R1+R4)**:`createDefaultModel` 設 `parentId=0`(**number**);但 addChild 設為 `item.id`(item 來自 read list、rev2 read wire `Menu.id`=**string** → parentId=`"2"` string);edit 從 rowData.parentId(read wire `MenuItem.parentId`=**string** `"0"`/`"2"`)→ string。∴ **寫端 wire `parentId` 可能是 number(fresh top=0)或 string(addChild/edit 衍生)** → rust DTO 須**彈性反序列化(number|string|null → Option<i64>**,`0`/`"0"`/null→None=頂層)。同理 `id`(edit)read wire 為 string → MenuUpdateReq.id=String parse i64(R7、§I.3、鏡像 017/018)。

---

## R2 018 sys_role 寫端 pattern(020 facade/handler 鏡像對象)

**Source**: `model/facade/sys_role.rs` + `handler/system_manage.rs`。

- **facade**(走 011 `mutate_in_txn` + audit):
  - `CreateRoleData{code,name,role_desc,status}` / `UpdateRoleData{name,role_desc,status}`(**省 code**,D2 immutable;`:107-112,193-200`)。
  - `create_role(db, data, operator) -> Result<i64, CreateRoleError>`(`:154-191`):**唯一前檢(active)→ `DuplicateCode`(交易外)** → `mutate_in_txn`(`build_create_role_active`:id/created_at/updated_*/deleted_* NotSet、`created_by` Set(operator)、業務欄 Set;`:131-145`)+ audit `Insert`。
  - `update_role(db, id, data, operator) -> Result<bool, DbErr>`(`:236-290`):load active→`Ok(false)`(查無)/ `update_role_query` col_expr(Name/RoleDesc/Status + `UpdatedAt=Expr::current_timestamp()` + `UpdatedBy(operator)`、**不含 Code**;`:205-219`)+ 重查讀回 + audit `Update`。
  - `soft_delete(db, id, operator) -> Result<bool, DbErr>`(`:309-336`):`soft_delete_query` col_expr(`DeletedAt=Expr::current_timestamp()` + `DeletedBy(operator)` 成對;`:294-299`)+ audit `SoftDelete`;查無→`Ok(false)`。
  - `find_active_by_id(db, id) -> Result<Option<Model>, DbErr>`(`:49-52`,種子 guard 載入用)。
  - `impl AuditSerialize for Model`(`:19-35`,全欄 + 時間 rfc3339、無 redact)。
- **handler**(`system_manage.rs`):
  - `add_role(State, Extension<RequestContext>, Json<RoleCreateReq>) -> Res<()>`(`:427-462`):operator=`ctx.operator_id`→None 回 `Internal(5000)`;status 非法→`err_msg(BizError,...)`=2222;`DuplicateCode`→2222「角色代码已存在」;`Db(e)`→5000+log。
  - `update_role`(`:483-537`):id parse 失敗→2222;status 非法→2222;**種子停用 guard**(`status != Some(1)` 且 `is_seed_role_code(code)`→2222「不可停用系统内置角色」;`:507-522`);`Ok(false)`→2222「角色不存在」。
  - `delete_role`(`:707-743`)/ `batch_delete_roles`(`:752-797`):種子保護 guard(`is_seed_role_code`→2222「不可删除系统内置角色」);**batch 兩段**(pass1 全載入種子檢查→任一種子整批拒、pass2 逐筆 soft_delete 寬鬆 Ok(false) 跳過)。
  - `is_seed_role_code(code)`=`matches!(code, "R_SUPER"|"R_ADMIN"|"R_USER_COMMON")`(`:62-64`,code-based)。
  - DTO:`RoleCreateReq{role_name,role_code,role_desc,status}` / `RoleUpdateReq{id,role_name,role_desc,status}`(**省 role_code**,serde 靜默丟,D2;`:415-420,468-475`)。
  - 業務碼:`BizCode::BizError="2222"` / `Internal="5000"`(`envelope.rs:114,124`);`Res::err_msg(code,msg)` 永遠 HTTP 200(`:55-69`)。

**Decision**: 020 menu facade/handler **逐字鏡像** 上述 pattern(create/update/soft_delete + 種子 guard code-based + batch 兩段原子拒 + error 2222/5000)。

---

## R3 019 sys_menu entity + read facade(020 寫端擴充對象)

**Source**: `entity/src/sys_menu.rs` + `model/facade/sys_menu.rs` + `model/{soft_delete,audit}.rs`。

- **entity `sys_menu::Model`**(27 欄 = id + 26;`:5-35`):id(i64 PK)/ parent_id(Option<i64>)/ route_name(String)/ menu_type·icon_type·status(Option<i16>)/ menu_name(String)/ route_path·component·icon·i18n_key·href·active_menu(Option<String>)/ **order_no(Option<i32>)`#[sea_orm(column_name="order")]`**(`:17-18`)/ fixed_index_in_tab(Option<i32>)/ hide_in_menu·keep_alive·constant·multi_tab(Option<bool>)/ query·buttons(Option<Json>)/ §I.6 6 審計欄。**`DeriveEntityModel` → `ActiveModel` 自動可用**(`:3,40`)。
- **facade `sys_menu`**(讀端,`:9` import `use entity::sys_menu::{Column, Entity, Model}`):
  - `impl SoftDeletable for Entity`(deleted_at_column=DeletedAt;`:47-51`)+ `find_active() -> Select<Entity>`(`:54-56`)。
  - `list_active_paginated(db, page_idx, size) -> Result<(Vec<Model>, u64), DbErr>`(`:61-70`,id ASC)+ `list_active_all(db) -> Result<Vec<Model>, DbErr>`(`:74-76`)。
  - `MenuNode{id,parent_id,route_name,menu_name,route_path,component,icon,order_no,i18n_key,hide_in_menu,keep_alive,constant,active_menu,children}` + `assemble_menu_tree(rows) -> Vec<MenuNode>`(`:81-96,107`,純函式)。
  - `impl AuditSerialize for Model`(全 26 欄 + `"order"` 鍵=order_no、時間 rfc3339、jsonb 透傳;`:13-45`)。
- **audit 基礎**(`model/audit.rs`):`mutate_in_txn<R,F,Fut>(db, f)`(閉包回 `(txn, R, Option<AuditEvent>)`;`:76-88`)+ `AuditEvent{operation,entity_table,entity_id,payload_before,payload_after,operator,trace_id}`(`:42-50`)+ `AuditOperation::{Insert,Update,SoftDelete}`(`:15-30`)+ `AuditOperator{id,ip}`(`:35-38`)。

**Decision**: 020 在 `facade/sys_menu.rs` **加寫端 fn**(`CreateMenuData`/`UpdateMenuData` + `create_menu`/`update_menu`/`soft_delete`/`find_active_by_id`/`count_active_children`),沿 R2 pattern;`build_create_menu_active`/`update_menu_query`/`soft_delete_query` SQL-build seam 可單測。entity 不改(ActiveModel 既有)。

---

## R4 wire 三端(rust handler ↔ rev2 wrapper ↔ form Model)+ id/parentId 型

**Source**: `rev2-system-manage.ts` + `handler/system_manage.rs`(019 MenuItem) + R1 form。

- **rev2 wrapper(017/018)**:`fetchAddUser/Update/Delete/BatchDelete` + `fetchAddRole/...` = `request<null>({url, method, data})`(`rev2-system-manage.ts:10-50`);menu 寫端 fn **缺**(grep add_menu/update_menu = 0)→ 020 加 `fetchAddMenu`(POST)/`fetchUpdateMenu`(POST)/`fetchDeleteMenu`(DELETE)/`fetchBatchDeleteMenu`(DELETE)+ `index.ts` `export *`。
- **三端對齊**:
  | 概念 | form/wrapper 送出 | rust 寫端 DTO 收 | 備註 |
  |---|---|---|---|
  | id(updateMenu) | string(read wire `Menu.id`) | `String` → parse i64 | R7、§I.3、鏡像 017/018 |
  | parentId | **number(fresh top=0)或 string(addChild/edit 衍生)** | 彈性反序列化 → `Option<i64>`(`0`/`"0"`/null→None) | ★ R1 混型 gotcha |
  | menuType/iconType/status | string `'1'`/`'2'` | `Option<String>` → `enum_str_to_i16` → i16(非法 2222) | 沿 016/017 |
  | order/fixedIndexInTab | number | `Option<i32>` | wire number |
  | keepAlive/constant/hideInMenu/multiTab | bool | `Option<bool>` | |
  | query/buttons | `[{key,value}]` / `[{code,desc}]` | `Option<serde_json::Value>`(JSONB 透傳) | 承 019 D3 |
  | menuName/routeName/routePath/component/icon/i18nKey/href/activeMenu | string | `String`/`Option<String>` | |
- **業務碼**(`envelope.rs:93-145`):2222(BizError:route_name 重複/種子/具子/不存在/非法 id·enum)/ 5003(PermissionDenied)/ 3333(TokenExpired)/ 5000(Internal)。

**Decision**: MenuCreateReq(無 id)/ MenuUpdateReq(含 id String;**省 routeName/menuType**=D2 immutable,serde 靜默丟,鏡像 RoleUpdateReq)。parentId 用 `#[serde(deserialize_with)]` 彈性 helper(number|string|null→Option<i64>)。

---

## R5 migration write-policy seed + route 註冊 + 下一號

**Source**: `migration/src/m20260529_000017_seed_write_role_policy.rs` + `lib.rs` + `m..019` + `main.rs` + `auth/enforce.rs`。

- **下一號 = `m20260529_000020`**(lib.rs 最高 = `m20260529_000019_seed_menu_read_policy`;`lib.rs:21,47`)。
- **write policy seed pattern**(鏡像 017):`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES ('p','R_SUPER',<path>,<method>,'','','') ... ON CONFLICT DO NOTHING`;down=`DELETE WHERE ptype='p' AND v1 IN(<4 path>)`(精準、不用 LIKE)。
- **020 write 4 path**(無撞:grep 0;019 read policy 為 GET 的 getMenuList/v2·getAllPages·getMenuTree,domain 不同):`p,R_SUPER,/systemManage/addMenu,POST` · `/systemManage/updateMenu,POST` · `/systemManage/deleteMenu,DELETE` · `/systemManage/batchDeleteMenu,DELETE`。
- **main.rs route_layer**(`:99-104` pattern):`.route("/systemManage/addMenu", post(handler::system_manage::add_menu).route_layer(axum::middleware::from_fn_with_state(state.clone(), crate::auth::enforce::enforce_mw)))`;deleteMenu/batchDeleteMenu 用 `delete(...)`。
- **enforce_mw**(`auth/enforce.rs:60-97`):bearer→jwt→DB-fresh roles(deleted_at IS NULL AND status=1)→enforce((role,path,method));path 無 /api 前綴、v3-v5 空字串。

**Decision**: 020 加 `m20260529_000020_seed_menu_write_policy`(4 行 R_SUPER)+ main.rs 4 route(enforce_mw)。**migration 010 menu policy / 019 read policy 不動**。

---

## R6 不動項確認(回歸邊界)

- **migration 010 menu-visibility policy(9 rows)不動**(D3):020 runtime 零 casbin_rule 寫入;新選單可見性等 MenuAuth。
- **`get_user_routes` code 不動**(D1 payoff 自然成立):getUserRoutes 已讀 sys_menu(019),編輯既有可見選單後即時反映、**無需改 code**;未編輯時三角色逐字 == 014 基線(019 D5 延續)。
- **`constant_routes`/`get_constant_routes`/`is_route_exist`/`menu_visible` 不動**;019 三讀端(getMenuList/Tree/AllPages)不動(handler 加新 fn、不改既有)。
- **MenuAuth/ButtonAuth(角色×選單可見性編輯)out**(FR-011);選單 restore / re-parent out。
- **sys_menu 不建表/不 alter**(019 已備齊 + §I.6 審計欄)→ §IV #8 N/A(非新建/alter 業務表)。

---

## R7 Constitution 對照預判(plan §Constitution Check 詳列)

- §I.1 base-web 權威:rust 提供 addMenu/updateMenu/deleteMenu/batchDeleteMenu(base-web 寫端 placeholder 已存、需接)→ PASS。
- §I.2 menu Casbin enforce:020 不改可見性機制(D3、010 不動)→ **PASS(核心紀律守住)**。
- §I.3 wire:id=string(parse i64)、parentId 彈性(number|string→Option)、enum 字串、業務碼 2222/5003/3333、envelope → PASS。
- §I.5 rev1 不拷:全新寫 / 沿 018 + 019 pattern → PASS。
- §I.6 新建業務表:**020 不建表**(用 019 sys_menu,審計欄已備)→ §IV #8 N/A;寫路徑成對寫 §I.6 審計欄(create created_by / update updated_at·by / soft_delete deleted_at·by)。
- §II 12 拍板:menu 寫端 CRUD **不違任一拍板**(§11.3 MODAL-WIRING 啟用、§11.7 dynamic mode 不變)→ 無需 amendment。
- §III ★ 軌道:MODAL-WIRING ★(menu-operate-modal/index.vue 寫端 placeholder)+ BASE-WEB-WRAPPER(rev2-system-manage.ts +4 fn)→ 在授權邊界內(v1.2.0 含 index.vue delete/batchDelete)。

**待 plan/tasks 落實的明示項**:C-V acceptance(US1-3 寫端 curl/psql + D1 payoff〔編輯既有可見選單→getUserRoutes 反映〕+ 種子/父子/批次原子 guard + Super-only + 019/getUserRoutes 基線/013/014/016/017/018 回歸 + migration 020 可逆 + prod build + CDP)+ 單元測試(guard 純函式 / parentId 彈性反序列化 / create·update·soft_delete SQL-build §I.6 成對 + 不動 route_name/menu_type)。**CDP browser smoke**:沿 016/017/018,若難構造則 curl 直送證 + 登記 follow-up。
