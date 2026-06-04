---
description: "Task list — 025 menu-restore-reparent"
---

# Tasks: menu-restore-reparent (025)

**Input**: Design documents from `/specs/025-menu-restore-reparent/`
**Prerequisites**: plan.md ✅(§IV 8/8 PASS,v1.5.0 (d) amendment `2b05a5e` ratified)/ spec.md ✅ / research.md ✅ / data-model.md ✅ / contracts/ ✅
**Tests**: **新純單測 = `would_create_cycle`(TDD red→green)+ 重寫 `update_menu_query_sets_..._omits_immutables`**(parent_id 由「不得在 SQL」→「可在 SQL」);**restore/re-parent guards = handler wiring + DB → 無其他新單元測試**(data-model §7、plan 明示理由,同 020 範式)—— 由 contracts/verification-commands.md C-V 覆蓋(curl + psql + CDP + migration 可逆)。
**Organization**: 依 spec user story(US1 P1 MVP restore / US2 P2 re-parent / US3 P3 回歸+即時)。**雙倉**:`rust-api/`(facade/handler/migration/D1-lint)+ `base-web/`(menu index.vue/operate-modal/wrapper,**MODAL-WIRING ★ (d) v1.5.0 邊界內**)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:不同檔、無未完成依賴 → 可平行
- **[Story]**:US1/US2/US3(Setup/Foundational/Polish 無 story label)

## 機制鏡像來源(實作對照,勿盲信本檔命名,grep actual code)
- facade `sys_menu.rs`:`soft_delete`(@410)/`soft_delete_query`(@394)/`list_active_paginated`(@68)/`find_active_by_id`(@268,**active-only**)/`update_menu_query`(@302)/`UpdateMenuData`(@276)/`assemble_menu_tree` tests(@581);immutability 單測 `update_menu_query_sets_updated_at_db_side_pairs_by_and_omits_immutables`(@788,@842 parent_id negative 須 flip)
- handler `system_manage.rs`:`update_menu`(@1162,載入現列 @1187)/`delete_menu`(@1572)/`get_menu_list`(@1740)/`is_seed_menu`(@70,6 route_name)/`DeleteReq{id:String}`(@1379)/`MenuUpdateReq`(@1131,**無 parent_id**)/`de_parent_id`(@85)/`MenuItem`(@1689)/`PageRes`+`normalize_page`/`BizCode::BizError`=2222
- audit `audit.rs`:`AuditOperation::Restore`(@19,**已存在 dormant、零改**)/`mutate_in_txn`(@76)/`AuditEvent`(@42)
- D1 `endpoint_coverage_lint.rs`(@602 `EXPECTED_ROUTE_COUNT=28`)+ `endpoint_auth.rs`(`ENDPOINT_REGISTRY`@73、`len`斷言@490、doc-comment@61)+ `main.rs`(menu route @215-274,enforce_mw)+ migration `m20260529_000023`(endpoint seed 範式)
- base-web:`menu/index.vue`(單一 `fetchGetMenuList` 資料源、operate 欄)/ `menu-operate-modal.vue`(parentId 純內部@100/191、無控件)/ `rev2-system-manage.ts`(BASE-WEB-WRAPPER +fn)/ `MenuList`=`PaginatingQueryRecord<Menu>`

---

## Phase 1: Setup

- [ ] T001 確認前置:`rust-api/` worktree 在 `rev2-admin-rust-api`、`base-web/` 在 `rev2-admin-base-web`;dev stack up;migration 套至 024 baseline。**記錄改源前 baseline** 供回歸對照:`ENDPOINT_REGISTRY` 現 **28** 列(`endpoint_coverage_lint` 綠)、`getMenuList/v2` active-only(deleted_at IS NULL)、`is_seed_menu` 6 名(home/manage/manage_user/manage_role/manage_menu/manage_user-detail)、`AuditOperation::Restore` 已存在 dormant、casbin endpoint policy 現況。確認 Constitution **v1.5.0**(d) 子句已 ratify(`2b05a5e`)。

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**:US1/US2 的 handler 皆建於本階段 facade/pure-fn;完成前不得開 US 工作。**TDD-first**(純函式 + 單測重寫先做)。

- [ ] T002 改 `rust-api/server/src/model/facade/sys_menu.rs` —— 依 [data-model §1] facade groundwork(兩倉 worktree commit):
  - **(restore-side)** 新 `fn find_deleted() -> Select<Entity>`(`Entity::find().filter(Column::DeletedAt.is_not_null())`)+ `pub async fn list_deleted_paginated(db, page_idx, size) -> Result<(Vec<Model>, u64), DbErr>`(鏡像 list_active_paginated@68)+ `pub async fn find_deleted_by_id(db, id) -> Result<Option<Model>, DbErr>`(**不可用 find_active_by_id**)+ private `fn restore_query(id) -> UpdateMany<Entity>`(set `DeletedAt=Expr::value(Option::<DateTimeWithTimeZone>::None)` + `DeletedBy=Expr::value(Option::<i64>::None)`,§I.6 成對清空)+ `pub async fn restore(db, id, operator) -> Result<bool, DbErr>`(mutate_in_txn:find_deleted 列→None→Ok(false)/Some→snapshot→restore_query→`AuditEvent{ operation: AuditOperation::Restore, ... }`;**audit.rs 零改**)。
  - **(re-parent-side, TDD)** 新純函式 `fn would_create_cycle(id: i64, new_parent_id: Option<i64>, all_menus: &[(i64, Option<i64>)]) -> bool`(走 new_parent 父鏈撞 id ⇒ true)+ **單測**(self_move/move_to_descendant/legal_move/move_to_top,red→green,旁 assemble_menu_tree tests@581)。`UpdateMenuData`(@276)**+`pub parent_id: Option<i64>`**;`update_menu_query`(@302)**+`.col_expr(Column::ParentId, Expr::value(data.parent_id))`**。**重寫單測** `update_menu_query_sets_..._omits_immutables`(@788):fixture +`parent_id`、@842 `!sql.contains("parent_id")` → `sql.contains("\"parent_id\"")`、route_name/menu_type negative(@834-841)留。

**Checkpoint**:`dcargo build -p server` 綠 + `dcargo test -p server would_create_cycle` + `update_menu_query_sets` 全綠(cycle 4 case + immutability 翻轉)+ facade restore/list_deleted 編譯。

---

## Phase 3: US1 (P1 MVP) — 復原誤刪的選單(restore)

**Goal**:維運者經選單頁「顯示已刪除」切換 → 列已刪選單 → 復原(孤兒父/route_name 佔用守衛)→ 回 active + 即時反映導覽 + 稽核。
**Independent Test**:刪自訂選單 → getDeletedMenus 顯 → restoreMenu → 回 active + audit RESTORE + deleted_* 成對 NULL;孤兒父已刪 → 2222。(contracts §1-2、§8①)

- [ ] T003 [US1] 改 `rust-api/server/src/handler/system_manage.rs` —— 依 [data-model §2、R4]:新 `get_deleted_menus`(`(State, Query(MenuSearchParams)) -> Res<PageRes<MenuItem>>`,**逐字 copy get_menu_list@1740 換 list_deleted_paginated**;reuse MenuItem/PageRes/parent_id_to_wire/normalize_page)+ 新 `restore_menu`(`(State, Extension(ctx), Json(DeleteReq)) -> Res<()>`,**reuse DeleteReq{id:String}**;operator ctx;parse id→2222「菜单ID无效」;guards 依序 ① find_deleted_by_id None→2222「菜单不存在或未删除」② route_name 被 active 佔用→2222「路由名已被占用」③ `model.parent_id==Some(p)` && find_active_by_id(p)==None→2222「上层菜单已删除,请先复原上层」→ `sys_menu::restore`;Ok(false)→2222、Err→5000+log)。依賴 T002 facade。
- [ ] T004 [US1] endpoint 3-way(D1 lint gate)依 [data-model §4-5、R8](漏任一 build fail):① `main.rs`(@384 後)+2 route `get(get_deleted_menus)`/`post(restore_menu)` 掛 `from_fn_with_state(state.clone(), enforce_mw)`;② `auth/endpoint_auth.rs` `ENDPOINT_REGISTRY`(@73)+`("GET","/systemManage/getDeletedMenus")`,`("POST","/systemManage/restoreMenu")`;`len`斷言(@490)28→30;doc-comment(@61)28→30;③ `server/tests/endpoint_coverage_lint.rs`(@602)`EXPECTED_ROUTE_COUNT` 28→30;④ 新 migration `m20260529_000025_seed_menu_restore_policy.rs`(註冊 lib.rs mod@26 後 + Box::new@57 後):up INSERT 2 列 `('p','R_SUPER',path,method,'','','')` ON CONFLICT、down `DELETE ... WHERE ptype='p' AND v1 IN (2 path)`(★by-v1)。path 三處 **byte-identical**。依賴 T003(handler 存在)。
- [ ] T005 [US1] 改 `base-web`(**MODAL-WIRING ★ (d) v1.5.0 邊界內**、每處記 file:line)依 [data-model §6、R5]:`views/manage/menu/index.vue` 加「顯示已刪除」NSwitch(ON→`fetchGetDeletedMenus` 資料源 + operate 欄條件渲染「復原」鈕→`fetchRestoreMenu(id)`、`!error` refresh;OFF→active 樹)+ `service/api/rev2-system-manage.ts` +`fetchGetDeletedMenus`(`request<Api.SystemManage.MenuList>`)/+`fetchRestoreMenu`(`request<null>`,`data:{id}`)+ i18n `page.manage.menu.*`(restore/已刪)。依賴 T003/T004(端點)。

**Checkpoint US1**:contracts §1 restore round-trip(刪→getDeletedMenus 顯→restore→active+audit RESTORE+deleted_* NULL)+ §2 guards(孤兒父 2222/route_name 佔用 2222/非 deleted 2222)+ §5 Super-only(Admin 5003/none 3333)+ §6 D1 lint 30 三方 + §8① CDP toggle+restore。

---

## Phase 4: US2 (P2) — 重組選單階層(re-parent)

**Goal**:維運者編輯自訂選單改上層父(cycle/種子/有效父守衛)、即時反映導覽。
**Independent Test**:編輯自訂選單改 parentId → 新位置反映;搬到自己子層/種子/非目錄 → 2222。(contracts §3-4、§8②③)

- [ ] T006 [US2] 改 `rust-api/server/src/handler/system_manage.rs` —— 依 [data-model §2、R2-R3]:`MenuUpdateReq`(@1131)**+`#[serde(default, deserialize_with = "de_parent_id")] pub parent_id: Option<i64>`**(route_name/menu_type 仍不加);`update_menu`(@1162)既有「載入現列」arm(@1187)加 re-parent guards(`changed=req.parent_id!=model.parent_id`):(a) changed && `is_seed_menu(&model.route_name)`→2222「不可移动系统内置菜单」;(b) changed && `would_create_cycle(id, req.parent_id, &all)`〔all=list_active_all〕→2222「不可移动到自己的子层」;(c) changed && `req.parent_id==Some(p)` && (find_active_by_id(p)==None || `menu_type!=Some(1)`)→2222「上层菜单无效」;`!changed`→既有編輯不變。build UpdateMenuData `parent_id: req.parent_id`。依賴 T002(parent_id/cycle)。
- [ ] T007 [US2] 改 `base-web/src/views/manage/menu/modules/menu-operate-modal.vue`(**MODAL-WIRING ★ (d)**、記 file:line)依 [data-model §6]:edit 模式加 parentId `NTreeSelect`(選單樹為選項)、**種子選單(is_seed_menu route_name)disabled**(沿 menuType disabled 範式、R2);submit 帶 parentId(既有 getSubmitParams 流、wire 契約已帶)。依賴 T006(後端接受 parentId)。

**Checkpoint US2**:contracts §3 re-parent round-trip(搬自訂→parent_id 改→getUserRoutes 反映)+ §4 guards(種子 2222/cycle 2222/無效父 2222)+ §8②③ CDP NTreeSelect re-parent + 種子 disabled。

---

## Phase 5: US3 (P3) — 即時反映 + 既有不破

**Goal**:restore/re-parent 即時反映導覽;既有選單管理(新增/編輯/刪除/批次刪/種子保護/識別類型不可改/可見性與按鈕權限編輯)逐項不破。
**Independent Test**:變更後導覽即時反映;020/019/021 行為逐項一致。

- [ ] T008 [US3] 回歸 + 即時驗(contracts §7):**即時反映**(re-parent/restore 後 getUserRoutes 即時、無重啟、D1 payoff)+ **回歸逐項**:020 menu CRUD(addMenu/updateMenu〔未改 parent_id 純編輯不變〕/deleteMenu/種子刪 2222/父刪 guard)、019 三讀端 + getUserRoutes 逐字(未 reparent 時 == 基線)、021 自鎖 guard 不破(R6:re-parent route_name 不變、可見性 key 不變)、restore/re-parent 零 casbin 觸碰(restore 後舊可見性自動套回)。

---

## Phase 6: Polish & Cross-Cutting

- [ ] T009 holistic C-V acceptance:跑 contracts/verification-commands.md 全節(§1 restore round-trip / §2 restore guards / §3 re-parent round-trip / §4 re-parent guards / §5 授權+envelope / §6 psql seed + D1 lint 30 / §7 migration 025 可逆 + 守恆 / §8 CDP ①②③④)+ **守恆**(`dcargo test -p server` 含 cycle+immutability 重寫、`--test entity_access_lint` 17、`--test endpoint_coverage_lint` **30**、`grep Migrator::up server/src`=0、`base-web pnpm typecheck` exit 0)+ **回歸 019/020/021**。CDP 沿 022/023 isolated-context harness、建 `tests/025-menu-restore-reparent/`。**無新 crate → prod image build 非強制**。
- [ ] T010 文件回填:`docs/INTEGRATION-DESIGN.md` §10 Phase 4 補「menu restore + re-parent as-built」段(facade restore/list_deleted/cycle + updateMenu parent_id + 2 endpoint + MODAL-WIRING (d) amendment + 孤兒 casbin 已知債 + 021 非回歸);plan Complexity 對齊;CHECKLIST §1/§4/§5 + §2.23/§2.24 順帶清項 + spec/plan 收尾標記留 finishing 階段。

> **★ 紀律**:本 tasks.md **不含 `git push` / `git merge`**(constitution §I.4 / CLAUDE.md §3:凍結至 `superpowers:finishing-a-development-branch`)。subagent-driven-development 各單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality);worktree 內 commit OK、push/merge 收尾才做。**base-web 改動在 MODAL-WIRING ★ (d) v1.5.0 邊界內**(`2b05a5e` ratified)。

---

## Dependencies

```
Setup(T001)
  └─ Foundational(T002 facade restore/list_deleted/find_deleted + cycle 純函式 TDD + UpdateMenuData parent_id + immutability 重寫)
       ├─ US1(T003 handler get_deleted/restore → T004 endpoint 3-way → T005 base-web restore UI)   ← P1 MVP
       └─ US2(T006 MenuUpdateReq parent_id + re-parent guards → T007 base-web parentId NTreeSelect)
  └─ US3(T008 回歸+即時〔需 US1+US2〕)
  └─ Polish(T009 holistic C-V〔需全部〕 ; T010 docs)
```

- **US1 ⟂ US2**:皆建於 Foundational;US1 restore 可獨立交付驗證(MVP);US2 re-parent 同範式。**同檔順序**:T003/T006 同 system_manage.rs、T005/T007 同 menu/**,worktree 內順序 commit(避 git index 衝突);US1 先(MVP)。
- T004 依 T003(route 綁 handler 須存在);T007 依 T006(後端接 parentId);T008 依 US1+US2。

## Parallel 範例
- T002 內 restore-side 與 re-parent-side 為同檔(sys_menu.rs)→ 順序;US1/US2 不同 story 但共 system_manage.rs/menu/** → 順序 commit。實質平行機會少(單檔密集),以 dependency 順序為主。

## MVP 範圍
**US1(P1)= MVP**:Foundational(T002 restore-side)+ T003-T005 → 誤刪選單可經回收桶切換復原(孤兒/route_name 守衛、即時、稽核)。US2 re-parent + US3 回歸為增量。

## 實作策略
1. Foundational 先(T002)→ cycle/immutability 單測綠 + facade checkpoint。
2. US1 → MVP checkpoint(restore round-trip + D1 lint 30 + CDP toggle)。
3. US2 → re-parent checkpoint(guards + CDP NTreeSelect)。
4. US3 → 即時 + 回歸 019/020/021。
5. Polish → holistic C-V + CDP 4 + 守恆 → `superpowers:finishing-a-development-branch`(多段式 commit + merge --no-ff,**此階段才 push/merge**)。
