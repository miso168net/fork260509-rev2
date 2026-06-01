---
description: "Task list — 018 manage-role-write"
---

# Tasks: Manage Role Write (CRUD)

**Input**: `specs/018-manage-role-write/`(plan / spec / research / data-model / contracts / quickstart)

**Tests**:純函式邏輯 test-first(`is_seed_role_id` / `find_active_enabled` SQL / facade SQL-build / enum);**wiring + 形狀對映 + base-web 接線無單元測試 → 由 `contracts/verification-commands.md` C-V(CDP + curl + psql)覆蓋**(理由:wiring/接線無可獨立測的純邏輯,沿 016/017 慣例)。

**Organization**:server-first(rust-api 先、base-web 後);依 spec US1(add)/US2(edit)/US3(delete)分階段。

**★ 紀律**:`git push` / `git merge` **不排入本 tasks**(§3:不在實作中執行、留 `superpowers:finishing-a-development-branch` 收尾)。實作期間僅 **本地** 兩段式 commit(worktree commit + 外層 SHA pin commit,皆 local)。

## Format: `[ID] [P?] [Story] Description`

- **[P]**:可平行(不同檔、無未完依賴)
- **[Story]**:US1/US2/US3(Setup/Foundational/Polish 無 label)

---

## Phase 1: Setup

- [ ] T001 確立回歸 baseline:`dcargo build -p server` 綠 + 既有 server 單測 + entity_access_lint + xdb 全綠 + 013/014/016/017 acceptance baseline 紀錄(供 B 改 enforce_mw + D5 改 017 後比對);確認在 `018-manage-role-write` branch、dev stack 可起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`)

---

## Phase 2: Foundational(Blocking — 所有 US 之前必完成)

**⚠️ 含 schema retrofit + effective-role-set ripple + ★enforce_mw B 改 + D5 校正 017,皆 US1-3 共用前置**

- [ ] T002 [P] entity `sys_role` Model +7 欄(`role_desc:Option<String>` / `status:Option<i16>` / `created_at:DateTimeWithTimeZone` / `created_by:Option<i64>` / `updated_at:Option<DateTimeWithTimeZone>` / `updated_by:Option<i64>` / `deleted_by:Option<i64>`,對齊 `sys_user::Model` 形)in `rust-api/entity/src/sys_role.rs`
- [ ] T003 migration `m20260529_0000XX_alter_sys_role_business_audit`(`Table::alter().add_column ×7`;`created_at` `.not_null().default(Expr::current_timestamp())`、`updated_at` 無 default、`*_by` `.big_integer().null()`、`status`/`role_desc`;**無 BIGSERIAL retrofit**〔006 已 auto_increment〕;`UPDATE sys_role SET status=1 WHERE id<=3`;down 對稱 drop_column)+ `migration/src/lib.rs` mod + migrations() vec 註冊(在 seed_write_role_policy 之前)in `rust-api/migration/src/`;**驗 up→down→up 對 throwaway DB 可逆**
- [ ] T004 [P] `impl AuditSerialize for sys_role::Model`(audit_json:id/code/name/role_desc/status/created_at.rfc3339/updated_at·deleted_at.map(rfc3339)/*_by;無敏感欄)in `rust-api/server/src/model/facade/sys_role.rs`
- [ ] T005 [US-shared] facade `find_active_by_id(db,id)->Result<Option<Model>,DbErr>` + `find_active_enabled()->Select<Entity>`(`find_active().filter(Column::Status.eq(1))`)+ **單測**(斷言 find_active_enabled SQL 含 `deleted_at IS NULL` AND `status` = 1)in `rust-api/server/src/model/facade/sys_role.rs`(依賴 T002)
- [ ] T006 effective-role-set ripple:`roles_for_user` / `roles_for_users` / `roles_by_codes_query` 由 `sys_role::find_active()` 改吃 `find_active_enabled()` in `rust-api/server/src/model/facade/sys_user_role.rs`(停用/軟刪角色自動不授權·不可指派;依賴 T005)
- [ ] T007 ★ enforce_mw B 改:`auth/enforce.rs` enforce_mw 由 `for role in &claims.roles` 改為 `roles_for_user(&state.db, claims.user_id)`(DB-fresh 有效角色)再逐一 enforce in `rust-api/server/src/auth/enforce.rs`(依賴 T006;**回歸:013 enforce allow〔Super/Admin〕/deny〔User 5003〕不破**)
- [ ] T008 [P] D5 校正 017:`update_user` 的 `updated_at`/`updated_by` 由 `Set(SystemTime::now())` 改 `update_many().col_expr(UpdatedAt, Expr::current_timestamp()).col_expr(UpdatedBy, operator).filter(Id.eq)` + UPDATE 後重查讀回 Model(供 audit payload_after)in `rust-api/server/src/model/facade/sys_user.rs`(**回歸:017 US1-3 + 守恆**)
- [ ] T009 migration `m20260529_0000YY_seed_write_role_policy`(raw SQL INSERT casbin_rule 4 行 `p,R_SUPER,/systemManage/{addRole,updateRole}`=POST·`{deleteRole,batchDeleteRole}`=DELETE,ON CONFLICT DO NOTHING;down `DELETE WHERE ptype='p' AND v1 IN(4 path)` 精準不踩 009/013/015)+ lib.rs 註冊 in `rust-api/migration/src/`
- [ ] T010 [P] 純函式 `fn is_seed_role_id(id:i64)->bool { (1..=3).contains(&id) }` + **單測**(1/2/3=true、4+=false)in `rust-api/server/src/handler/system_manage.rs`

**Checkpoint**: schema + 有效角色集 + enforce DB-fresh + D5 + 種子判定 就緒 → US 可開始

---

## Phase 3: User Story 1 — 新增角色 (P1) 🎯 MVP

**Goal**:Super 新增角色(roleName/roleCode/roleDesc/status),列表出現真值、稽核 Insert。
**Independent Test**:Super addRole → getRoleList +1 帶真值;重複 code→2222;Admin/User→5003;無 token→3333(C-V §1)。

- [ ] T011 [P] [US1] **單測**:create_role 的 ActiveModel SQL-build(id NotSet / created_by Set / created_at NotSet〔DB default〕)+ DuplicateCode 前檢路徑 in `rust-api/server/src/model/facade/sys_role.rs`
- [ ] T012 [US1] facade `create_role(db, CreateRoleData{code,name,role_desc,status}, operator)->Result<i64,CreateRoleError>` + `enum CreateRoleError{DuplicateCode,Db(DbErr)}` + `impl From<DbErr>`(code 唯一性前檢 `find_active().filter(Code.eq).one`→DuplicateCode;`mutate_in_txn`:ActiveModel id NotSet·created_at NotSet·created_by Set(operator)→insert RETURNING→audit Insert)in `rust-api/server/src/model/facade/sys_role.rs`(依賴 T002/T004)
- [ ] T013 [US1] handler `add_role`(State/Extension<RequestContext>/Json<RoleCreateReq>→Res<()>;operator 取 ctx.operator_id〔None→Internal 5000〕;`status` 用既有 `enum_str_to_i16`〔非法→2222「状态取值无效」〕;match create_role:Ok→ok(())、DuplicateCode→err_msg(BizError,「角色代码已存在」)、Db→err(Internal)+log)+ `RoleCreateReq{roleName,roleCode,roleDesc?,status?}`(camelCase)+ route `POST /systemManage/addRole`(`.route_layer(enforce_mw)`)in `rust-api/server/src/handler/system_manage.rs` + `rust-api/server/src/main.rs`(依賴 T012)
- [ ] T014 [US1] base-web:`rev2-system-manage.ts` +`type RoleWriteModel = Pick<Api.SystemManage.Role,'roleName'|'roleCode'|'roleDesc'|'status'>` + `fetchAddRole(data)`→POST `/systemManage/addRole`;`role-operate-drawer.vue` handleSubmit 的 **add 分支**接 `fetchAddRole(model.value)`(`// request`→`!error` 才成功)+ import in `base-web/src/service/api/rev2-system-manage.ts` + `base-web/src/views/manage/role/modules/role-operate-drawer.vue`(依賴 T013;server-first)

**Checkpoint**: US1 可獨立驗(新增角色端到端)

---

## Phase 4: User Story 2 — 編輯角色 (P2)

**Goal**:Super 改 name/desc/status;roleCode immutable;停用即時不授權/不可指派、仍顯管理列表;種子不可停用、可改 name·desc。
**Independent Test**:改值反映 + roleCode 不變 + 停用→getAllRoles 排除·新請求 enforce 拒(舊 token)·getRoleList 仍見 + 重啟用恢復 + 停用種子→2222 + 改種子 name→ok + 不存在→2222(C-V §2/§4/§5)。

- [ ] T015 [P] [US2] **單測**:update_role 的 col_expr SQL-build(UpdatedAt=current_timestamp + UpdatedBy=operator 成對、filter Id.eq)+ 重查路徑 in `rust-api/server/src/model/facade/sys_role.rs`
- [ ] T016 [US2] facade `update_role(db,id,UpdateRoleData{name,role_desc,status},operator)->Result<bool,DbErr>`(`mutate_in_txn`:`find_active().filter(Id.eq).one`→None=Ok(false)/Some→Set 業務欄〔**不動 code**〕+ **D5 col_expr UpdatedAt/UpdatedBy 成對 + UPDATE 後重查**→audit Update〔before/after〕)in `rust-api/server/src/model/facade/sys_role.rs`(依賴 T005)
- [ ] T017 [US2] handler `update_role` + `RoleUpdateReq{id:String,roleName,roleDesc?,status?}`(**省 roleCode**,D2 immutable;serde 丟棄 wire 帶的 roleCode)+ **種子停用 guard**(`status` 解析為停用(2) 且 `is_seed_role_id(id)`→err_msg(BizError,「不可停用系统内置角色」))+ not-found(Ok(false))→2222「角色不存在」+ id parse 失敗→2222 + route `POST /systemManage/updateRole`(enforce_mw)in `rust-api/server/src/handler/system_manage.rs` + `main.rs`(依賴 T016/T010)
- [ ] T018 [US2] 016 `role_item` 改吃真值(R10-equiv):`role_desc`/`status`(i16→wire str)/`create_by`/`create_time`/`update_by`/`update_time`(rfc3339)由 sys_role 真欄映射、缺值仍 null(不再恆 None);`getAllRoles`(`list_active_all`)改吃 `find_active_enabled`(排除停用/軟刪、不可指派)in `rust-api/server/src/handler/system_manage.rs` + `rust-api/server/src/model/facade/sys_role.rs`(依賴 T002/T005;回歸:016 getRoleList/getAllRoles)
- [ ] T019 [US2] base-web:`rev2-system-manage.ts` +`fetchUpdateRole(data & {id})`→POST `/systemManage/updateRole`;`role-operate-drawer.vue` handleSubmit 的 **edit 分支**接 `fetchUpdateRole({...model.value, id: props.rowData!.id})`(add/edit 靠 `props.operateType`)in `base-web/src/service/api/rev2-system-manage.ts` + `base-web/src/views/manage/role/modules/role-operate-drawer.vue`(依賴 T017)

**Checkpoint**: US1+US2 獨立可驗(含停用 enforce 即時)

---

## Phase 5: User Story 3 — 刪除角色(含批次) (P3)

**Goal**:Super 軟刪單筆/批次自訂角色(可復原、出有效列表、SOFT_DELETE 稽核);種子不可刪(整批拒);空 ids no-op。
**Independent Test**:軟刪→出 getRoleList + deleted_by 稽核;刪種子(單/批含種子)→2222 整批拒;空 ids→no-op;Admin→5003(C-V §3)。

- [ ] T020 [P] [US3] **單測**:soft_delete 的 col_expr SQL-build(DeletedAt=current_timestamp + DeletedBy=operator 成對)in `rust-api/server/src/model/facade/sys_role.rs`
- [ ] T021 [US3] facade `soft_delete(db,id,operator)->Result<bool,DbErr>`(私有 `soft_delete_query`=`update_many().col_expr(DeletedAt,current_timestamp).col_expr(DeletedBy,operator).filter(Id.eq)`;`mutate_in_txn`:`find_active().filter(Id.eq).one`→None=Ok(false) no-op 不寫審計/Some→audit SoftDelete)in `rust-api/server/src/model/facade/sys_role.rs`(依賴 T005)
- [ ] T022 [US3] handler `delete_role`(DeleteReq{id:String})+ `batch_delete_roles`(BatchDeleteReq{ids:Vec<String>})+ **種子保護 guard**(`is_seed_role_id`:單筆含種子或批次任一種子→err_msg(BizError,「不可删除系统内置角色」)**整批拒、無部分執行**)+ 空 ids→no-op Ok + id parse 失敗→2222 + not-found(Ok(false))寬鬆跳過 + routes `DELETE /systemManage/deleteRole`·`/batchDeleteRole`(enforce_mw)in `rust-api/server/src/handler/system_manage.rs` + `main.rs`(依賴 T021/T010)
- [ ] T023 [US3] base-web:`rev2-system-manage.ts` +`fetchDeleteRole(id)`→DELETE `{id}`·`fetchBatchDeleteRole(ids:string[])`→DELETE `{ids}`;`role/index.vue` handleDelete(async)/handleBatchDelete 接線(`const {error}=await fetch...; if(!error) onDeleted()/onBatchDeleted()`)+ import in `base-web/src/service/api/rev2-system-manage.ts` + `base-web/src/views/manage/role/index.vue`(依賴 T022)

**Checkpoint**: US1-3 全獨立可驗

---

## Phase 6: Polish & Acceptance(C-V 對照 `contracts/verification-commands.md`)

- [ ] T024 acceptance US1-3 curl+psql 全綠(§1-3:新增真值/重複 2222/同名不同碼/種子刪·停用拒/不存在 2222/空批 no-op/Admin·User·無 token 授權/稽核 Insert·Update·SoftDelete + *_by 成對)
- [ ] T025 ★ **status enforce 即時驗(B 核心)**:停用某 user 持有角色 → 該 user **舊 token 不重登** 打受該角色保護端點 → enforce **403+5003**;重啟用→恢復(C-V §4);不可指派:getAllRoles 排除停用/軟刪、updateUser 指派含停用角色只採有效(C-V §5)
- [ ] T026 回歸:013 enforce allow/deny(B 改後)+ 014 menu 三階梯 + 016 list(getRoleList 顯停用·roleDesc/status 真值;getAllRoles 排除停用)+ **017 US1-3 + update_user updated_at DB-side 成對** + 守恆(server 單測 + entity_access_lint〔handler 零 `entity::`〕+ xdb + `Migrator::up` grep 0)
- [ ] T027 migration up→down→up 可逆(throwaway DB)+ **prod target image build 綠**(`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`;無新 crate 故非 §3 強制、沿 016/017 de-risk)
- [ ] T028 真 CDP(front-nginx `:21080`)/manage/role 端到端:登入 Super→新增→編輯(roleCode 唯讀)→停用→列表仍見→刪除自訂→出列表→種子刪/停用 toast 2222→null 欄不 crash(harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A)
- [ ] T029 收尾**本地**兩段式 commit(rust-api worktree commit + 外層 `git add rust-api` SHA pin commit;base-web worktree commit + 外層 `git add base-web` SHA pin commit;**皆 local、不 push**)+ 整體 final holistic review(FR-001..012 + SC-001..011 可追溯、跨任務一致)。**push/merge 留 `superpowers:finishing-a-development-branch`(§3)**

---

## Dependencies & Execution Order

- **Phase 1**(T001)→ **Phase 2 Foundational**(T002-T010)→ **US1/US2/US3**(T011+)→ **Polish**(T024+)。
- Phase 2 內:T002 → T005 → T006 → T007(enforce 依賴 effective-set);T002 → T004;T003/T008/T009/T010 相對獨立。
- US 內:單測 → facade → handler+route → base-web(server-first)。
- US1/US2/US3 Foundational 後可平行(若多人);本地單人建議 P1→P2→P3 序。
- T018(role_item 真值 + getAllRoles)US2 內、但 016 list 回歸與之相關。

### Parallel Opportunities
- T002 / T004 / T008 / T010 可平行([P],不同檔)。
- 各 US 的 [P] 單測(T011/T015/T020)可於該 US facade 前先寫(test-first red)。

---

## Implementation Strategy

- **MVP = US1**(Phase 1+2+3):新增角色端到端可交付即驗。
- 增量:US1→US2(編輯+停用 enforce)→US3(刪除)。每 US 獨立可驗、不破前者。
- **★ 高風險先驗**:T007(enforce B)+ T008(D5 017)落地後**立即跑 013/017 回歸**(別積到 Polish),因動到 shipped feature。
- 收尾:`superpowers:finishing-a-development-branch` → push(待 user 同意)+ `merge --no-ff` 回 `rev2-admin-root`、保留 018 branch。

## Notes
- [P]=不同檔無依賴;[Story]=US 可追溯。
- 純函式 test-first(T005/T010/T011/T015/T020);**handler wiring + base-web 接線無單元測試 → C-V acceptance(T024-T028)覆蓋**(沿 016/017 慣例,理由已於本檔頭 + plan 明示)。
- 實作期間僅本地 commit;**push/merge 不在 tasks、留 finishing-a-development-branch**(§3 鐵律)。
- 無新 crate/dep;handler 零 `entity::`(009 lint);roleCode immutable;業務違反一律 2222。
