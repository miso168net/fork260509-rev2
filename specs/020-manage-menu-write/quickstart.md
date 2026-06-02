# Quickstart: 020 manage-menu-write

## 這個 feature 做什麼
把 019 唯讀選單管理頁閉成**完整 CRUD**:4 條 Super-only 寫端(addMenu/updateMenu/deleteMenu/batchDeleteMenu)寫 019 的 `sys_menu` 表,接 base-web 選單管理頁 5 個 `// request` placeholder。**D1 payoff**:編輯選單因 runtime 導覽與管理頁共讀同源 → 即時反映於導覽。**rust-api + base-web 兩倉**(非 server-only);可見性仍走既有 Casbin(D3 不動);**不建表**(用 019 sys_menu)。

## 實作順序(鏡像 017/018 寫端 + 擴 019 facade)
1. **facade 寫端**(`model/facade/sys_menu.rs` 擴):`CreateMenuData`/`UpdateMenuData`(省 route_name/menu_type/parent_id)+ `create_menu`(唯一前檢→DuplicateRouteName + mutate_in_txn + audit Insert)/ `update_menu`(load active→Ok(false) + col_expr 業務欄 + updated_at·by 成對 + 重查 + audit Update)/ `soft_delete`(deleted_at·by 成對 + audit SoftDelete)/ `find_active_by_id` / `count_active_children` + SQL-build seam 單測。
2. **handler 寫端**(`handler/system_manage.rs` 擴):`add_menu`/`update_menu`(POST)+ `delete_menu`/`batch_delete_menus`(DELETE,沿用 DeleteReq/BatchDeleteReq)+ `MenuCreateReq`/`MenuUpdateReq`(de_parent_id 彈性 + 省 immutable 欄)+ `is_seed_menu` guard(種子刪/停用拒)+ 父刪 guard(count_active_children)+ batch 兩段原子拒 + 業務錯誤 2222。
3. **migration**:`m20260529_000020_seed_menu_write_policy`(casbin 4 行 R_SUPER)+ lib.rs 註冊;**migration 010/019 policy 不動**。
4. **routes**(`main.rs`):4 route + enforce_mw(addMenu/updateMenu post、deleteMenu/batchDeleteMenu delete)。
5. **base-web**(MODAL-WIRING ★ + WRAPPER):`rev2-system-manage.ts` +4 fetch fn(fetchAddMenu/UpdateMenu/DeleteMenu/BatchDeleteMenu)+ index.ts export;接 `menu-operate-modal.vue:259`(handleSubmit add/edit)+ `index.vue:191`(handleDelete)/`:184`(handleBatchDelete),只改 `// request` 行。

## 跑與驗(dev stack)
```bash
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up   # 套 020
# 驗收:見 contracts/verification-commands.md(US1-3 寫端 + 種子/父子/批次 guard + Super-only + D1 payoff + 019/getUserRoutes 基線回歸 + migration 可逆 + CDP :21080 + prod build)
cargo test -p server   # 單元:guard 純函式 / de_parent_id / create·update·soft_delete SQL-build / DTO
```

## 關鍵紀律
- **routeName/menuType immutable on edit**(D2):updateMenu DTO 省該兩欄(serde 靜默丟);update_menu_query 不含 route_name/menu_type/parent_id(雙鎖)。
- **種子保護**(D4,code-based `is_seed_menu`):6 seed route_name 不可刪/停用、可改其他欄。
- **父刪擋**(D5):有 active 子 → 2222;batch 任一種子或具子 → 整批拒、無部分執行。
- **020 不碰 casbin**(D3):新選單可見性等 MenuAuth;migration 010 menu policy 不動;getUserRoutes code 不動。
- **parentId 彈性反序列化**(R1/R4 混型):number(fresh top=0)|string(addChild/edit 衍生)|null → Option<i64>(0/"0"/null→None)。
- id=string parse i64(R7);enum i16↔string;業務錯誤一律 2222;§I.6 成對審計(operator 由 015 ctx);handler 零 `entity::`。
- **無新 crate/dep**;**不建表**(用 019 sys_menu);收尾兩段式 commit ×2 worktree(rust-api + base-web)+ 外層 SHA pin。
