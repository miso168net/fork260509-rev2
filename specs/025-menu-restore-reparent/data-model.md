# Data Model: menu-restore-reparent (025) — Phase 1

> 拍定 research.md。file:line 以 actual code 為準(grounding 實證)。**不建表、不加欄、無新 crate/dep**;sys_menu 既有 schema(含 deleted_at/deleted_by + partial-unique route_name active index)沿用。

## 0. 狀態機(Menu)

```
active  ──soft_delete(020)──▶  deleted   (deleted_at/by set)
deleted ──restore(025 新)───▶  active    (deleted_at/by → NULL 成對;route_name 唯一性 + 父 active 守衛)
active  ──update_menu re-parent(025 新)──▶ active(parent_id 改;cycle/種子/有效父守衛;route_name/menu_type 不變)
```
- route_name(穩定鍵、Casbin 可見性 policy v1)**全程不變**(D2);故 restore/re-parent **不動可見性 policy**(R6)。

## 1. facade `model/facade/sys_menu.rs`(新增 + 1 處改)

| 項 | 形 |
|---|---|
| **新** `fn find_deleted() -> Select<Entity>` | `Entity::find().filter(Column::DeletedAt.is_not_null())`(private seam) |
| **新** `pub async fn list_deleted_paginated(db, page_idx: u64, size: u64) -> Result<(Vec<Model>, u64), DbErr>` | `find_deleted().order_by_asc(Column::Id).paginate(db, size)`→(rows,total)(鏡像 list_active_paginated@68) |
| **新** `pub async fn find_deleted_by_id(db, id: i64) -> Result<Option<Model>, DbErr>` | `find_deleted().filter(Column::Id.eq(id)).one(db)`(restore 載入已刪目標;**不可用 find_active_by_id**) |
| **新** `fn restore_query(id: i64) -> UpdateMany<Entity>` | `update_many().col_expr(DeletedAt, Expr::value(Option::<DateTimeWithTimeZone>::None)).col_expr(DeletedBy, Expr::value(Option::<i64>::None)).filter(Id.eq(id))`(§I.6 成對清空) |
| **新** `pub async fn restore(db, id: i64, operator: i64) -> Result<bool, DbErr>` | mutate_in_txn:find_deleted 列→None→Ok(false)/Some→snapshot(deleted 態 `audit_json`)→restore_query.exec→`AuditEvent{ operation: AuditOperation::Restore, entity_table:"sys_menu", entity_id:Some(id), payload_before:Some(before), payload_after:None, operator:Some(AuditOperator{id:operator, ip:None}) }`→Ok(true) |
| **改** `struct UpdateMenuData`(@276) | **+`pub parent_id: Option<i64>`**(17→18 欄;route_name/menu_type 仍不在) |
| **改** `fn update_menu_query`(@302) | **+`.col_expr(Column::ParentId, Expr::value(data.parent_id))`**(其餘不變;route_name/menu_type 仍不進 SET) |
| **新** `fn would_create_cycle(id: i64, new_parent_id: Option<i64>, all_menus: &[(i64, Option<i64>)]) -> bool` | 從 new_parent 走 (id→parent_id) 父鏈;`new_parent==Some(id)` 或鏈中撞 id ⇒ true;`None`⇒false。純函式、TDD |

- **audit.rs 零改**:`AuditOperation::Restore`(@19)已存在(dormant);restore 為首消費者。
- `restore` 用 plain `DbErr`(route_name 唯一性由 handler pre-check;若仍 race 撞 partial-unique → DbErr→handler 5000+log,可接受;plan 不另造 RestoreError)。

## 2. handler `handler/system_manage.rs`(2 新 + 1 改)

| 端 | 簽名 / 邏輯 |
|---|---|
| **新** `get_deleted_menus` | `(State, Query(MenuSearchParams)) -> Res<PageRes<MenuItem>>` —— **逐字 copy get_menu_list(@1740)**,只把 `list_active_paginated`→`list_deleted_paginated`;reuse MenuItem/PageRes/parent_id_to_wire/i16_to_wire_str/normalize_page。GET、Super-only(enforce_mw)、讀路徑無 operator |
| **新** `restore_menu` | `(State, Extension(ctx), Json(DeleteReq)) -> Res<()>` —— **reuse `DeleteReq{id:String}`**;operator 取 ctx(None→5000);parse id(2222「菜单ID无效」);guards 依序 ①②③(見下)→ `sys_menu::restore`;Ok(false)→2222「菜单不存在或未删除」、Err→5000+log |
| **改** `update_menu`(@1162) | MenuUpdateReq **+`parent_id`**;在既有 `Ok(Some(model))` arm(@1187)加 re-parent guards(a)(b)(c)(見下);build UpdateMenuData 時 `parent_id: req.parent_id` |

**restore_menu guards(順序固定,R4)**:
1. `find_deleted_by_id(id)`==None → `err_msg(BizError, "菜单不存在或未删除")`
2. route_name 被某 active 列佔用(`find_active` by `route_name==model.route_name`)→ `err_msg(BizError, "路由名已被占用")`
3. `model.parent_id == Some(p)` && `find_active_by_id(p)`==None → `err_msg(BizError, "上层菜单已删除,请先复原上层")`(頂層 None 跳過)

**update_menu re-parent guards(順序固定,R3;`changed = req.parent_id != model.parent_id`)**:
- (a) `changed && is_seed_menu(&model.route_name)` → `err_msg(BizError, "不可移动系统内置菜单")`
- (b) `changed && would_create_cycle(id, req.parent_id, &all)` → `err_msg(BizError, "不可移动到自己的子层")`(`all` = `list_active_all` 取 `(id, parent_id)`)
- (c) `changed && req.parent_id==Some(p) && (find_active_by_id(p)==None || p.menu_type != Some(1))` → `err_msg(BizError, "上层菜单无效")`
- `!changed` → 全 pass(既有編輯不變)

**MenuUpdateReq(@1131)新增**:`#[serde(default, deserialize_with = "de_parent_id")] pub parent_id: Option<i64>`(de_parent_id@85 既有:number 0/"0"/null/absent→None)。

## 3. 純函式單測(TDD red→green)+ 單測重寫

- **新** `would_create_cycle`:`self_move`(new_parent==id→true)/ `move_to_descendant`(true)/ `legal_move`(false)/ `move_to_top`(None→false)。落 facade tests mod(旁 assemble_menu_tree tests@581,in-memory Vec)。
- **重寫** `update_menu_query_sets_updated_at_db_side_pairs_by_and_omits_immutables`(@788):UpdateMenuData fixture **+`parent_id: Some(2)`**;@842 `assert!(!sql.contains("parent_id"))` → `assert!(sql.contains("\"parent_id\""))`;route_name/menu_type negative(@834-841)**留**。

## 4. migration `m20260529_000025`(2 endpoint policy,鏡像 023)

`m20260529_000025_seed_menu_restore_policy.rs`(註冊 lib.rs:mod@26 後 + Box::new@57 後):
- **up**:`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES ('p','R_SUPER','/systemManage/getDeletedMenus','GET','','',''), ('p','R_SUPER','/systemManage/restoreMenu','POST','','','') ON CONFLICT DO NOTHING`(R_SUPER-only 初始、非-Super 由接口权限 modal〔023〕指派)。
- **down**:`DELETE FROM casbin_rule WHERE ptype='p' AND v1 IN ('/systemManage/getDeletedMenus','/systemManage/restoreMenu')`(★by-v1 精準、不裸 v2)。
- **不建表**(§I.6 N/A);up→down→up throwaway DB 可逆。

## 5. D1 endpoint lint 3-way(023,build-gate)— 4 site 連動

| site | 改 |
|---|---|
| `main.rs`(@384 後,023 trio 末尾後) | +2 route:`.route("/systemManage/getDeletedMenus", get(handler::system_manage::get_deleted_menus).route_layer(from_fn_with_state(state.clone(), enforce_mw)))` + restoreMenu `post(...)` 同式 |
| `auth/endpoint_auth.rs` ENDPOINT_REGISTRY(@73) | +`("GET","/systemManage/getDeletedMenus")`,`("POST","/systemManage/restoreMenu")`;doc-comment「28 entries」(@61)→30 |
| `auth/endpoint_auth.rs`(@490)| `ENDPOINT_REGISTRY.len(), 28`→`30` |
| `server/tests/endpoint_coverage_lint.rs`(@602)| `EXPECTED_ROUTE_COUNT: usize = 28`→`30` |

- path 字串 **byte-identical** 三處(exact-equality casbin matcher);VERBS 僅 GET/POST/DELETE(restoreMenu 必 POST、getDeletedMenus 必 GET)。

## 6. base-web(MODAL-WIRING ★ — **(d) v1.5.0 amendment 待 user 親決後**)

| 檔 | 改 | 軌道 |
|---|---|---|
| `views/manage/menu/index.vue` | 「顯示已刪除」toggle(NSwitch)→ ON 切資料源 `fetchGetDeletedMenus`、operate 欄條件渲染「復原」鈕(`fetchRestoreMenu(id)`、`!error` refresh)；OFF 正常 active 樹 | **(d)** |
| `views/manage/menu/modules/menu-operate-modal.vue` | edit 模式加 parentId `NTreeSelect`(選單樹選項)；**種子選單 disabled**(沿 menuType disabled 範式、R2)；submit 帶 parentId(既有流) | **(d)** |
| `service/api/rev2-system-manage.ts` | +`fetchGetDeletedMenus`(`request<Api.SystemManage.MenuList>`)/ +`fetchRestoreMenu`(`request<null>`,`data:{id}`)；i18n `page.manage.menu.*`(restore/已刪) | BASE-WEB-WRAPPER(免 amendment) |

- **wire 零新 typing**:getDeletedMenus reuse MenuList、restoreMenu reuse null + DeleteReq 形;updateMenu wire 已帶 parentId(只加 UI 控件)。
- **MODAL-WIRING 紀律**:每改記 file:line + upstream 衝突風險;共用元件附加 prop + 安全預設(此波 menu 頁專屬、無共用元件改)。

## 7. 測試(無新純函式以外單測;C-V 覆蓋)
- **純單測**:would_create_cycle(新)+ immutability 重寫。**無其他新純函式**(restore/re-parent guards 為 handler wiring + DB)→ 由 contracts C-V(curl/psql/CDP/migration 可逆)覆蓋,plan/tasks 明示理由(同 020 範式)。
