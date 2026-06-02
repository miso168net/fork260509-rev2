# 020 manage-menu-write — Phase 0 brainstorm (spec-design)

> rev2 Phase 4 主流業務 — **menu 寫端 CRUD:把 019 唯讀選單管理頁閉成完整 CRUD**。
> 4 條 Super-only 寫端寫 `sys_menu`(019 建的業務表),接 base-web 選單管理頁 5 個 `// request` placeholder。
> **這是 D1「DB-driven 統一源」的 payoff** —— 編輯選單會真實反映於 runtime 導覽(getUserRoutes 讀同源 sys_menu)。
> **凍結設計來源**:本檔(D1–D5 user 親決,2026-06-02 brainstorm)。交棒 `/speckit-specify`(階段 1,**手動執行**)。
> 設計骨幹參考 = 017-manage-user-write + 018-manage-role-write(寫端 facade/handler/casbin seed/base-web MODAL-WIRING pattern);schema/read facade = 019-manage-menu-list。
> **server-only 後端 + base-web MODAL-WIRING ★ / BASE-WEB-WRAPPER**(寫端 placeholder 接線、不改 form/typing)。

---

## 1. Scope / User Stories

**範圍拍板(D1):020 = menu 定義 CRUD(4 endpoint);角色×選單可見性編輯(MenuAuth)= 獨立後續 feature。**

- **US1 新增選單**:`addMenu`(POST)—— 新增頂層或子選單(addChild 只是預設 parentId)。
- **US2 編輯選單**:`updateMenu`(POST)—— 改業務欄;**routeName/menuType immutable**(D2)。
- **US3 刪除選單**:`deleteMenu`(DELETE 單筆)+ `batchDeleteMenu`(DELETE 批次)—— 軟刪;種子保護(D4)+ 父刪 guard(D5)。
- 寫端授權:沿 017/018 —— 4 endpoint 掛 `enforce_mw`、**Super-only**(migration seed casbin R_SUPER 4 行)。

**不在 020**:
- 角色×選單可見性編輯(`MenuAuthModal`/`ButtonAuthModal`,在角色管理頁、動 migration 010 casbin menu policy)→ **獨立「受管 policy / menu-auth」feature**(連動 [DESIGN §10 Phase 3 #6](../INTEGRATION-DESIGN.md) 受管 RBAC policy 層)。
- 020 **runtime 零 casbin_rule 寫入**(D3)。

## 2. 親決(D1–D5)

### D1 — 範圍 = menu 定義 CRUD(4 endpoint);MenuAuth 另開
- base-web 選單管理頁 5 個未接線寫操作(新增 / 新增子 / 編輯 / 刪單筆 / 批次刪)→ 後端 4 endpoint `addMenu`/`updateMenu`/`deleteMenu`/`batchDeleteMenu`,鏡像 017/018 user/role 寫端節奏。
- **MenuAuth(「哪角色看哪選單」)不在 020**:對齊 019 FR-010 + D4(可見性 = 既有 Casbin policy、由獨立 feature 編輯)。

### D2 — routeName / menuType 編輯時 immutable
- `routeName` 是**穩定鍵**(migration 010 casbin menu-visibility policy 的 `v1` + getUserRoutes `MenuRoute.id`)。可改會讓既有可見性 policy orphan(選單在側欄消失)→ **updateMenu 不收 routeName 欄**(server 端強制忽略,鏡像 018 roleCode / 017 userName immutability)。
- `menuType` 同理 immutable(base-web `menu-operate-modal` edit 模式已 `disabled`)。
- 效果:**020 完全不需動 casbin menu policy**(承接 D3)。

### D3 — 020 不碰 casbin;新選單可見性等 MenuAuth
- getUserRoutes 用 casbin 可見性 policy(010)tree-prune 過濾。新增選單**無對應 policy row → 對所有角色(含 Super)側欄不顯示**(但管理頁 getMenuList 列表看得到,因列表不過濾可見性)。
- **020 維持純粹**:只寫 `sys_menu` 定義、**runtime 零 casbin_rule 寫入**;新選單可見性由後續 MenuAuth feature 指派。職責最乾淨、對齊 019 D4 + D1/D2。
- **D1 payoff 仍成立**(見 §7):編輯**既有可見選單**(如種子 manage_user 的 order/i18nKey)→ getUserRoutes/nav **即時反映**,證 DB-driven 統一源;不需 MenuAuth 即可驗。

### D4 — 種子選單(6 筆 nav 骨幹)保護不可刪/不可停用
- 6 個種子 route_name(`home`/`manage`/`manage_user`/`manage_role`/`manage_menu`/`manage_user-detail`)= runtime nav 骨幹;刪 `manage_menu` 會把選單管理頁自己鎖掉。
- **code-based guard(鏡像 018 種子角色)**:`is_seed_menu(route_name)`;deleteMenu/batchDelete 命中種子 → 2222「不可删除系统内置菜单」;updateMenu 停用(status=2)命中種子 → 2222「不可停用系统内置菜单」。種子**可改** name/icon/order/i18nKey 等(routeName 已 D2 鎖)。

### D5 — 刪有 active 子選單的父 → 擋下(2222)
- deleteMenu/batchDelete 前檢查 active 子選單(`parent_id = 本 id AND deleted_at IS NULL`)→ 有則 2222「請先刪除子選單」(強制顯式、無連帶軟刪、無孤兒)。
- 避免孤兒:019 `assemble_menu_tree` 會略過孤節點(樹消失)但 flat list 仍顯懸空 parentId → 資料不一致,故擋下最乾淨。
- **batchDelete 原子拒**:批次內任一為種子(D4)OR 任一有 active 子(D5)→ **整批拒、無部分執行**(鏡像 018)。

### 衍生(不另議,沿 017/018/019 pattern)
- **軟刪**:`soft_delete`(deleted_at + deleted_by 成對),沿 019 `SoftDeletable`;復原留後續。
- **route_name 唯一**:create 時 active 間唯一前檢 → 重複 2222(對齊 019 partial unique `sys_menu_route_name_active_uniq`,鏡像 018 `DuplicateCode`)。
- **§I.6 審計**:create `created_by` / update `updated_at·by` 成對(DB-side `current_timestamp`)/ soft_delete `deleted_at·by` 成對,operator 由 015 ctx,走 011 `mutate_in_txn`。sys_menu 審計欄 019 已建(create-time、無 retrofit)。
- **wire**:id=String parse i64(R7、§I.3);menuType/iconType/status i16↔string 純對映 fn(沿 016/017);parentId wire string ↔ DB:`"0"`/空→`None`(top)、數字→`Some(i64)`(承 019 analyze I1 的 parentId 型);**業務錯誤一律 2222**(route_name 重複 / 種子 / 有子 / 不存在 / 非法 id·enum),5xxx 留 enforce/infra。
- **buttons / query**:JSONB 整欄替換(create/update 寫入 form 帶的 `[{code,desc}]` / `[{key,value}]`);承 019 D3。
- **無新 crate/dep**(sea-orm Json/serde_json 既有、argon2 不需);handler 零 `entity::`(009 lint);可見性 Casbin(010)不動。

## 3. Schema(無新建表/欄 — 用 019 sys_menu)

- **不建表、不 alter**:019 已建 `sys_menu`(~26 欄 + jsonb buttons/query + §I.6 6 審計欄 + partial unique route_name active)。020 只新增**寫路徑** + 1 條 casbin write-policy seed migration。
- migration `m20260529_000020_seed_menu_write_policy`(序號接 019 之後):casbin **4 行 R_SUPER**(`/systemManage/addMenu`·`/systemManage/updateMenu`=POST、`/systemManage/deleteMenu`·`/systemManage/batchDeleteMenu`=DELETE,ON CONFLICT DO NOTHING;down 精準 `DELETE WHERE ptype='p' AND v1 IN(4 path)`,不踩 010 menu policy / 019 read policy)。
- **migration 010 menu-visibility policy 不動**(D3);entity `sys_menu` 已有 `ActiveModel`(019 DeriveEntityModel),寫端直接用。

## 4. Facade / Handler

- **facade `sys_menu` 擴寫端**(承 019 read facade,鏡像 018 sys_role write,走 011 `mutate_in_txn`):
  - `create_menu(db, data, operator)`:route_name active 唯一前檢→`DuplicateRouteName`(→2222);同 txn insert(parentId/業務欄/§I.6 `created_by`)+ audit Insert;回新 id。
  - `update_menu(db, id, data, operator)`:load active→`Ok(false)`(不存在);col_expr 業務欄(menu_name/route_path/component/icon/icon_type/order/i18n_key/status/hide_in_menu/keep_alive/constant/multi_tab/href/active_menu/fixed_index_in_tab/query/buttons)+ **`updated_at·by` 成對 DB-side** + 重查 + audit Update;**不動 route_name/menu_type**(D2)。
  - `soft_delete(db, id, operator)`:**`deleted_at·by` 成對** + audit SoftDelete(擴 019 SoftDeletable 的 operator 寫入)。
  - `count_active_children(db, parent_id)`(D5 父刪 guard)+ `find_active_by_id`(載入種子判定/guard)。
- **handler `system_manage`**(擴 019 menu 讀端,鏡像 017/018 寫 handler):
  - `add_menu` / `update_menu`(POST)+ `delete_menu` / `batch_delete_menus`(DELETE),operator 由 `RequestContext`(ctx_mw)取;enum/id/parentId 解析(非法→2222);種子 guard(D4,`is_seed_menu` code-based)+ 父刪 guard(D5);**lint-safe**(取 primitive、零 `entity::`,同 016 `role_item`)。
  - DTO:`MenuCreateReq`(無 id;含 parentId/全業務欄/buttons/query)/ `MenuUpdateReq`(含 id;**省 routeName/menuType**,D2);沿 019 MenuItem 真值映射讀回。

## 5. 跨 feature ripple

| 觸及 | 改動 | 回歸驗 |
|---|---|---|
| **019 sys_menu** | 加寫路徑(facade write + handler)、seed write policy(020 migration) | 019 三讀端(getMenuList/Tree/AllPages)+ getUserRoutes 不破 |
| **019 getUserRoutes(★ D1 payoff)** | **不改 code**;但編輯既有可見選單後 nav 即時反映(統一源驗證) | 編輯種子 manage_user order/i18nKey → getUserRoutes 反映;**未編輯時三角色逐字仍 == 014 基線** |
| migration 010 casbin menu policy | **不動**(D3) | menu deny 不破 |
| 013/018 enforce | **不動**(endpoint enforce 與 menu policy 不同 domain;新增 020 write policy 4 行) | allow/deny 不破 |
| base-web menu-operate-modal / index.vue | MODAL-WIRING:接 5 placeholder(只改 `// request` 行) | 管理頁可完整 CRUD menu |

> spec phase 0 research 必 grep:base-web `menu-operate-modal.vue` `getSubmitParams`/`handleSubmit` 送出形(Menu 型、layout+page→component、routePath+pathParam→routePath)、`index.vue` `handleDelete`/`handleBatchDelete` 形;018 寫 facade/handler pattern;019 sys_menu entity ActiveModel 欄 + read facade;rust handler addMenu/updateMenu/deleteMenu/batchDeleteMenu 真實 wire(rust handler ↔ rev2 wrapper ts ↔ form Model 三端對齊,尤其 buttons/query JSONB + parentId 型 + id=string)。

## 6. base-web 接線(MODAL-WIRING ★ + BASE-WEB-WRAPPER,鏡像 017/018)

- **BASE-WEB-WRAPPER**:`src/service/api/rev2-system-manage.ts` +4 fetch fn(`fetchAddMenu`/`fetchUpdateMenu`/`fetchDeleteMenu`/`fetchBatchDeleteMenu`,`request<null>`)+ `index.ts` export(menu 寫端 upstream 無、需 wrapper,同 017/018)。
- **MODAL-WIRING ★**(v1.2.0 邊界、只改 `// request` 一行、`!error` 才成功):
  - `menu-operate-modal.vue` `handleSubmit`:add/addChild→`fetchAddMenu`、edit→`fetchUpdateMenu`(用 `getSubmitParams()` 既有組裝)。
  - `index.vue` `handleDelete`→`fetchDeleteMenu`、`handleBatchDelete`→`fetchBatchDeleteMenu`(checkedRowKeys)。
- 純接線、不改 form 結構/typing(routeName/menuType 由 server 省欄強制 immutable、不靠前端 disable,沿 017/018 D2 慣例)。

## 7. Acceptance

- **US1-3 curl/psql**:addMenu(真值入表 + audit Insert / dup route_name 2222 / parentId 寫入)/ updateMenu(業務欄更新 + `updated_at·by` 成對 / route_name·menu_type 不變〔送了也忽略〕/ 不存在 2222)/ deleteMenu·batchDelete(軟刪出列 + `deleted_by` audit / 種子刪 2222 / 父有子 2222 / 批次原子拒)/ Admin·none 授權(5003/3333)。
- **★ D1 payoff(統一源)**:編輯既有可見選單(種子 `manage_user` 的 `order` 或 `i18nKey`)→ **getUserRoutes 即時反映新值**(curl diff:該欄變、其餘逐字不變);證「編輯選單反映於 runtime 導覽」。
- **★ 回歸**:**未編輯時 getUserRoutes 三角色仍逐字 == 014 基線**(019 D5 鐵律延續)+ 019 三讀端形狀/Super-only 不破 + 013/014/016/017/018 + 守恆(server 單測〔guard 純函式 / wire 映射 / create·update·soft_delete SQL-build §I.6 成對〕+ entity_access_lint + xdb + `Migrator::up` 0)+ migration 020 up→down→up 可逆(不踩 010/019 policy)+ **prod image build 綠**(sys_menu 為既有 crate 模組、非新 crate,沿 016-018 de-risk)。
- **CDP /manage/menu**:新增選單→管理頁列表出現(nav 需 MenuAuth、暫不顯,符合 D3)/ 編輯既有→管理頁 + nav(若可見)反映 / 刪除→出列 / 種子刪→2222 toast / 父有子刪→2222 toast。CDP 沿 016/017/018,若難構造則 curl 直送證 + 登記 follow-up。

## 8. 範圍提醒 / 可瘦身選項

- **D3 是 020 與 casbin 的硬界線**:020 **runtime 零 casbin_rule 寫入**。新選單「建了但 nav 不顯」是預期(等 MenuAuth);acceptance 用「編輯既有可見選單」證 D1 payoff,別誤把「新增看 nav 出現」當驗收點。
- **不建表/不 alter**(sys_menu 019 已備齊)→ 020 是純寫路徑 + 1 casbin seed migration,scope 比 017/018(要 schema retrofit)更小。
- MenuAuth(角色×選單可見性編輯)/ 選單復原(restore soft-deleted)/ re-parent(改 parentId)→ 皆後續,本 feature 不擴張。
- 已親決:範圍(D1)/ immutable 鍵(D2)/ 不碰 casbin(D3)/ 種子保護(D4)/ 父刪擋(D5)。
