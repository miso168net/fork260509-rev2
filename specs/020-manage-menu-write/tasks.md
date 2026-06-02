---
description: "Task list — 020 manage-menu-write"
---

# Tasks: Menu Management Write (CRUD on DB-driven menu)

**Input**: `specs/020-manage-menu-write/`(plan / spec / research / data-model / contracts / quickstart)

**Tests**:純函式邏輯 test-first(guard `is_seed_menu` / parentId `de_parent_id` / `create_menu`·`update_menu`·`soft_delete` SQL-build〔§I.6 成對、update 不含 route_name/menu_type/parent_id〕/ 寫端 DTO 序列化·反序列化);**4 寫端 wiring + guard + batch 原子 + base-web 接線 + D1 payoff 無單元測試 → 由 `contracts/verification-commands.md` C-V(curl + psql + CDP)覆蓋**(沿 016/017/018/019 慣例)。

**Organization**:**rust-api + base-web 兩倉**(非 server-only);Foundational(migration write policy + 共用 guard 純函式)→ US1(addMenu)→ US2(updateMenu,immutable 鍵)→ US3(deleteMenu/batchDelete,種子+父子 guard)→ base-web 接線 → Polish/C-V。

## ★ 紀律
`git push` / `git merge` **不排入本 tasks**(§3:留 `superpowers:finishing-a-development-branch`)。實作期間僅 **本地** 兩段式 commit ×2 worktree(rust-api + base-web worktree commit + 外層 SHA pin commit,皆 local)。**不建表/不 alter**(用 019 sys_menu);**020 runtime 零 casbin_rule 寫入**(D3,migration 010 不動);`get_user_routes` code 不動(D1 payoff 自然成立)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:可平行(不同檔、無未完依賴)
- **[Story]**:US1/US2/US3(Setup/Foundational/Polish 無 label)

---

## Phase 1: Setup

- [ ] T001 確立回歸 baseline:`dcargo build -p server` 綠 + 既有 server 單測 + entity_access_lint + xdb 全綠;**★ 重存 getUserRoutes 三角色基線**(Super/Admin/User,供 D1 payoff diff〔編輯前/後〕+ 未編輯逐字回歸〔== 019/014 基線〕);確認在 `020-manage-menu-write` branch、dev stack 可起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`)+ sys_menu seed 6 筆在(019 已套)

---

## Phase 2: Foundational(Blocking — US1/US2/US3 之前必完成)

**⚠️ migration write policy(4 route 共用)+ 共用 guard 純函式,US 寫端前置**

- [ ] T002 migration `m20260529_000020_seed_menu_write_policy`(raw SQL casbin **4 行 R_SUPER**:`/systemManage/addMenu`·`/systemManage/updateMenu`=POST、`/systemManage/deleteMenu`·`/systemManage/batchDeleteMenu`=DELETE,ON CONFLICT DO NOTHING;down 精準 `DELETE WHERE ptype='p' AND v1 IN(4 path)`,**不踩 010 menu policy / 019 read policy**)+ `migration/src/lib.rs` mod + migrations() vec 註冊(000019 之後)in `rust-api/migration/src/`;**驗 up→down→up 對 throwaway DB 可逆**(data-model §5)
- [ ] T003 [P] 共用 guard 純函式 + 單測 in `rust-api/server/src/handler/system_manage.rs`:`is_seed_menu(route_name)`=`matches!(route_name, "home"|"manage"|"manage_user"|"manage_role"|"manage_menu"|"manage_user-detail")`(6 seed code-based、鏡像 `is_seed_role_code`)+ **單測**(6 種子命中、自訂不命中、大小寫敏感)
- [ ] T004 [P] parentId 彈性反序列化 helper `de_parent_id` + 單測 in `rust-api/server/src/handler/system_manage.rs`(serde `deserialize_with`:JSON number / string / null → `Option<i64>`,`0`/`"0"`/null/空→`None`〔頂層〕、其餘→`Some(i64)`;parse 失敗→serde error)+ **單測**(number 0→None、number 2→Some(2)、string "0"→None、string "2"→Some(2)、null→None、非數字 string→err)

**Checkpoint**: migration write policy + 共用 guard 就緒 → US 可開始

---

## Phase 3: User Story 1 — addMenu(新增頂層/子選單) (P1) 🎯

**Goal**:Super 新增選單(頂層或子)寫 sys_menu,管理頁顯真值;route_name 重複拒。
**Independent Test**:addMenu 真值入表 + getMenuList 多 1 筆;dup route_name→2222;Admin→5003/none→3333(C-V §1)。

- [ ] T005 [US1] facade `create_menu` in `rust-api/server/src/model/facade/sys_menu.rs`:`CreateMenuData`(parent_id/route_name/menu_type/menu_name/route_path/component/icon/icon_type/i18n_key/order_no/status/hide_in_menu/keep_alive/constant/multi_tab/href/active_menu/fixed_index_in_tab/query/buttons)+ `CreateMenuError{DuplicateRouteName, Db}`(impl From<DbErr>)+ **`build_create_menu_active` 純 seam**(id/created_at/updated_*/deleted_* NotSet、`created_by` Set(operator)、業務欄 Set)+ `create_menu(db,data,operator)->Result<i64,CreateMenuError>`(route_name active 唯一前檢→DuplicateRouteName〔交易外〕+ `mutate_in_txn` insert + audit Insert)+ **單測**(build_create_menu_active 欄狀態 §I.6)(依賴 T001;走 011 mutate_in_txn〔既有〕)
- [ ] T006 [US1] handler `add_menu`(`POST /systemManage/addMenu`→`Res<()>`)+ `MenuCreateReq` DTO(camelCase、parentId 用 T004 `de_parent_id`、menuType/iconType/status `Option<String>`、order/fixedIndexInTab `Option<i32>`、query/buttons `Option<serde_json::Value>`)in `rust-api/server/src/handler/system_manage.rs`:operator 由 `RequestContext`(None→5000)+ enum `enum_str_to_i16`(非法→2222)+ `DuplicateRouteName`→2222「路由名称已存在」+ `Db`→5000 + route(`main.rs` post + enforce_mw)+ **單測**(MenuCreateReq 反序列化 + parentId 各型 + DTO camelCase)(依賴 T004/T005)+ route in `rust-api/server/src/main.rs`

**Checkpoint**: US1 可獨立驗(addMenu 真值 + dup 2222 + 授權)

---

## Phase 4: User Story 2 — updateMenu(編輯,routeName/menuType immutable) (P1)

**Goal**:Super 編輯選單業務欄;routeName/menuType 不可改;種子停用拒;編輯既有可見選單即時反映於 getUserRoutes(D1 payoff)。
**Independent Test**:updateMenu 業務欄更新 + routeName/menuType 不變(送了忽略)+ updated_at·by 成對 + 不存在 2222 + 種子停用 2222(C-V §2/§4)。

- [ ] T007 [US2] facade `update_menu` in `rust-api/server/src/model/facade/sys_menu.rs`:`UpdateMenuData`(CreateMenuData 減 route_name/menu_type/parent_id,D2+FR-011)+ **`update_menu_query` 純 seam**(col_expr 業務欄 + `UpdatedAt=Expr::current_timestamp()` + `UpdatedBy(operator)` 成對、**不含 route_name/menu_type/parent_id**)+ `update_menu(db,id,data,operator)->Result<bool,DbErr>`(load active→Ok(false) + update_menu_query exec + 重查 + audit Update)+ `find_active_by_id`(種子 guard 載入)+ **單測**(update_menu_query SQL:含業務欄 + current_timestamp + updated_by + **不含 route_name/menu_type/parent_id**)(依賴 T005 同檔)
- [ ] T008 [US2] handler `update_menu`(`POST /systemManage/updateMenu`→`Res<()>`)+ `MenuUpdateReq` DTO(含 `id:String`、**省 routeName/menuType/parentId**〔serde 靜默丟,D2+FR-011〕)in `rust-api/server/src/handler/system_manage.rs`:operator + id parse→2222 + enum→2222 + **種子停用 guard**(status 解析為停用〔2〕且 `is_seed_menu`〔T003,load find_active_by_id 取 route_name〕→2222「不可停用系统内置菜单」)+ Ok(false)→2222「菜单不存在」+ route(`main.rs` post + enforce_mw)+ **單測**(MenuUpdateReq 省 routeName/menuType/**parentId** 序列化驗 —— 三鍵 immutable〔D2 + FR-011 re-parent out〕)(依賴 T003/T007)+ route in `rust-api/server/src/main.rs`

**Checkpoint**: US2 可獨立驗(updateMenu 業務欄 + immutable 鍵 + 種子停用拒)

---

## Phase 5: User Story 3 — deleteMenu / batchDeleteMenu(種子 + 父子 guard) (P1)

**Goal**:Super 軟刪選單(單筆/批次);種子不可刪;有 active 子的父擋;批次原子拒。
**Independent Test**:刪自訂葉→軟刪出列 + deleted_by;刪種子→2222;刪有子父→2222;批含種子/具子→整批拒(C-V §3)。

- [ ] T009 [US3] facade `soft_delete` + `count_active_children` in `rust-api/server/src/model/facade/sys_menu.rs`:**`soft_delete_query` 純 seam**(`DeletedAt=Expr::current_timestamp()` + `DeletedBy(operator)` 成對)+ `soft_delete(db,id,operator)->Result<bool,DbErr>`(load active→Ok(false) + soft_delete_query exec + audit SoftDelete)+ `count_active_children(db,parent_id)->Result<u64,DbErr>`(parent_id=本 id AND deleted_at IS NULL)+ **單測**(soft_delete_query SQL:deleted_at current_timestamp + deleted_by 成對 + WHERE id;count_active_children SQL filter)(依賴 T005 同檔)
- [ ] T010 [US3] handler `delete_menu`(`DELETE /systemManage/deleteMenu`)+ `batch_delete_menus`(`DELETE /systemManage/batchDeleteMenu`)in `rust-api/server/src/handler/system_manage.rs`(沿用既有 `DeleteReq{id}`/`BatchDeleteReq{ids}`):operator + id parse→2222 + **種子 guard**(`is_seed_menu`→2222「不可删除系统内置菜单」)+ **父刪 guard**(`count_active_children>0`→2222「请先删除子菜单」)+ **batch 兩段原子拒**(pass1 全載入:任一種子 OR 任一具 active 子→整批 2222;pass2 逐筆 soft_delete 寬鬆 Ok(false) 跳過、DB Err→5000)+ routes(`main.rs` delete + enforce_mw)(依賴 T003/T009)+ routes in `rust-api/server/src/main.rs`

**Checkpoint**: US1+US2+US3 rust 端獨立可驗

---

## Phase 6: base-web 接線(US1-3 共用;MODAL-WIRING ★ + BASE-WEB-WRAPPER,鏡像 017/018)

- [ ] T011 base-web `BASE-WEB-WRAPPER`:`src/service/api/rev2-system-manage.ts` +4 fetch fn(`fetchAddMenu`〔POST /systemManage/addMenu〕/`fetchUpdateMenu`〔POST /systemManage/updateMenu〕/`fetchDeleteMenu`〔DELETE /systemManage/deleteMenu〕/`fetchBatchDeleteMenu`〔DELETE /systemManage/batchDeleteMenu〕,`request<null>`,鏡像既有 fetchAddRole 等)+ 確認 `src/service/api/index.ts` `export *` 涵蓋 in `base-web/`
- [ ] T012 base-web `MODAL-WIRING ★`(只改 `// request` 行、`!error` 才成功動作):`src/views/manage/menu/modules/menu-operate-modal.vue` `handleSubmit`(:259,add/addChild→`fetchAddMenu(getSubmitParams())`、edit→`fetchUpdateMenu(...)`)+ `src/views/manage/menu/index.vue` `handleDelete`(:191→`fetchDeleteMenu({id})`)/`handleBatchDelete`(:184→`fetchBatchDeleteMenu({ids:checkedRowKeys})`)in `base-web/`(依賴 T011;每處 spec 記 file:line)

**Checkpoint**: base-web 選單管理頁可完整 CRUD（接線完成）

---

## Phase 7: Polish & Acceptance(C-V 對照 `contracts/verification-commands.md`)

- [ ] T013 acceptance US1-3(C-V §1-3):addMenu(真值/dup route_name 2222/parentId number·string 皆吃/Admin·none 授權/audit Insert)+ updateMenu(業務欄更新/**routeName·menuType 不變**/updated_at·by 成對/種子停用 2222/不存在 2222)+ deleteMenu·batchDelete(軟刪出列 deleted_by/**種子刪 2222**/**父有子 2222**/批次原子拒)+ psql sys_menu 真值
- [ ] T014 **★ D1 payoff + 回歸**(C-V §4/§5):編輯既有可見選單(種子 manage_user order/i18nKey)→ **getUserRoutes 即時反映**(diff 該欄變、其餘逐字),**改完還原**;**未編輯時 getUserRoutes 三角色逐字 == 019/014 基線**(T001 存)+ **★ 新增選單 absent**(addMenu 後 `getUserRoutes`〔Super〕**不含**新 route_name → 證 D3 不碰 casbin、新選單無可見性 policy 故不顯於導覽,**SC-006**)+ getConstantRoutes 不變 + 019 三讀端(getMenuList/Tree/AllPages)不破 + 013/014/016/017/018 回歸 + 守恆(server 單測〔guard/de_parent_id/SQL-build/DTO〕+ entity_access_lint〔handler 零 `entity::`〕+ xdb + `Migrator::up` grep 0)
- [ ] T015 migration 020 up→down→up 可逆(throwaway DB:write policy 4 行 up/down 精準、010 menu policy 9 + 019 read 3 不踩)+ **prod target image build 綠**(`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`;sys_menu 既有 crate 模組、非新 crate 故非 §3 強制,沿 016-018 de-risk)
- [ ] T016 真 CDP(front-nginx `:21080`)/manage/menu 端到端:登入 Super → 新增選單(列表出現;nav 需 MenuAuth、新選單暫不顯〔D3〕)+ 編輯既有(列表+nav 反映)+ 刪除自訂(出列)+ 種子刪→2222 toast + 父有子刪→2222 toast(harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A;**若難構造則 curl 直送證 + 登記 follow-up**,C-V §7)
- [ ] T017 收尾**本地**兩段式 commit ×2 worktree(rust-api worktree commit + base-web worktree commit + 外層 `git add rust-api base-web` SHA pin commit;**皆 local、不 push**)+ 整體 final holistic review(FR-001..012 + SC-001..008 可追溯、跨任務一致、routeName/menuType immutable、種子/父子 guard、D1 payoff、不碰 casbin)。**push/merge 留 `superpowers:finishing-a-development-branch`(§3)**

---

## Dependencies & Execution Order

- **Phase 1**(T001)→ **Phase 2 Foundational**(T002-T004)→ **US1**(T005-T006)→ **US2**(T007-T008)→ **US3**(T009-T010)→ **base-web**(T011-T012)→ **Polish**(T013+)。
- Phase 2 內:T002(migration)/ T003(is_seed_menu)/ T004(de_parent_id)相對獨立可平行([P])。
- US1:T005(facade create)→ T006(handler 依 create + de_parent_id〔T004〕)。
- US2:T007(facade update,依 T005 同檔)→ T008(handler 依 is_seed_menu〔T003〕+ update)。
- US3:T009(facade soft_delete+count_children,依 T005 同檔)→ T010(handler 依 is_seed_menu〔T003〕+ soft_delete + count_children)。
- base-web:T011(wrapper)→ T012(MODAL-WIRING 依 wrapper)。
- **facade 同檔序**:T005 → T007 → T009 同改 `facade/sys_menu.rs`,序做(避衝突);handler T006/T008/T010 同改 `system_manage.rs`,序做。

### Parallel Opportunities
- T002 / T003 / T004 可平行([P],migration vs handler 純函式不同關注點)。
- US1/US2/US3 rust 端 Foundational 後可平行(若多人);本地單人建議序(同檔)。base-web(T011-T012)可與 rust Polish 平行。

---

## Implementation Strategy

- **MVP = US1**(Phase 1+2+3):addMenu 可寫 sys_menu + 管理頁顯真值 + 授權,即證寫端地基。
- 增量:US1(add)→ US2(update,immutable 鍵 + D1 payoff)→ US3(delete,種子+父子 guard)→ base-web 接線。每 US 獨立可驗。
- **★ D1 payoff(SC-002)**:US2 後驗「編輯既有可見選單→getUserRoutes 即時反映」;**回歸鐵律**:未編輯時 getUserRoutes 逐字 == 019/014 基線(D3 不碰 casbin、code 不動)。
- 收尾:`superpowers:finishing-a-development-branch` → push(待 user 同意)+ `merge --no-ff` 回 `rev2-admin-root`、保留 020 branch。

## Notes
- [P]=不同檔/關注點無依賴;[Story]=US 可追溯。
- 純函式 test-first(T003 is_seed_menu / T004 de_parent_id / T005·T007·T009 SQL-build seam / T006·T008 DTO);**4 寫端 wiring + guard + batch + base-web + D1 payoff 無單元測試 → C-V acceptance(T013-T016)覆蓋**(沿 016-019,理由本檔頭 + plan 明示)。
- **rust-api + base-web 兩倉**(非 server-only);收尾兩段式 commit ×2 worktree + 外層 SHA pin。
- 實作期間僅本地 commit;**push/merge 不在 tasks、留 finishing-a-development-branch**(§3 鐵律)。
- 無新 crate/dep;**不建表/不 alter**(用 019 sys_menu);handler 零 `entity::`(009 lint);**020 不碰 casbin**(D3,010 不動);routeName/menuType immutable(D2);種子保護(D4)+ 父刪擋(D5);§I.6 成對審計(operator 由 015 ctx);業務錯誤一律 2222。
