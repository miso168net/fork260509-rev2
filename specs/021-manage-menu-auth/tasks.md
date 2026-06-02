---
description: "Task list — 021 manage-menu-auth"
---

# Tasks: Menu Auth (role↔menu 可見性編輯 + per-role home)

**Input**: `specs/021-manage-menu-auth/`(plan / spec / research / data-model / contracts / quickstart)

**Tests**:純函式邏輯 test-first(自鎖 guard 判定〔R_SUPER 須留 manage_menu〕/ `update_role_home_query` SQL-build〔§I.6 成對〕/ DTO 反序列化〔roleId 彈性 number\|string→i64、menuIds number[]〕/ `roles_for_user_ordered` 取序〔role id ASC〕);**4 端點 wiring + policy 即時反映 + redis reload + id↔route_name 對映 + getUserRoutes home per-role + base-web 接線無單元測試 → 由 `contracts/verification-commands.md` C-V(curl + psql + CDP)覆蓋**(沿 016-020 慣例)。

**Organization**:**rust-api + base-web 兩倉**;Foundational(migration:ALTER sys_role +home + casbin 4 write policy)→ US1(menu 可見性編輯:facade 對映 + redis watcher + policy 寫路徑 + 2 handler)→ US2(per-role home:facade home/roles 加序 + 2 handler + getUserRoutes home)→ base-web 接線 → Polish/C-V。

## ★ 紀律
`git push` / `git merge` **不排入本 tasks**(§3:留 `superpowers:finishing-a-development-branch`)。實作期間僅 **本地** 兩段式 commit ×2 worktree(rust-api + base-web worktree commit + 外層 SHA pin commit,皆 local)。**不建表**(ALTER sys_role +home);**不 fork sea-orm-adapter**(§11.6、stock MgmtApi);**policy v0 用 role code 非 id**(roleId→查 sys_role.code);**getUserRoutes menu 過濾邏輯不動**(只改 home 來源);010 menu policy 9 行起始 seed runtime 增刪、不於 migration 改。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:可平行(不同檔、無未完依賴)
- **[Story]**:US1/US2(Setup/Foundational/Polish 無 label)

---

## Phase 1: Setup

- [ ] T001 確立回歸 baseline:`dcargo build -p server` 綠 + 既有 server 單測 + entity_access_lint + xdb 全綠;**★ 重存 getUserRoutes 三角色基線**(Super/Admin/User,供 US1 即時反映 diff〔編輯前/後〕+ US2 home 反映 + 未編輯逐字回歸〔== 019/014 基線、SC-007〕);確認在 `021-manage-menu-auth` branch、dev stack 可起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`)+ sys_menu seed 6 筆 + casbin menu policy 9 行 + sys_role 3 角色在(010/018 已套)

---

## Phase 2: Foundational(Blocking — US1/US2 之前必完成)

**⚠️ migration(ALTER sys_role +home + 4 端點 write policy,跨 US1/US2 共用前置)**

- [ ] T002 migration `m20260529_000021_*`(in `rust-api/migration/src/`)+ entity Model +home 欄:① `ALTER TABLE sys_role ADD COLUMN home varchar NULL`(鏡像 016 alter)+ seed 回填 `UPDATE sys_role SET home='home'`(保未編輯逐字基線)+ down `DROP COLUMN home` ② casbin **4 行 R_SUPER** write policy(`/systemManage/getRoleMenu`·`/systemManage/getRoleHome`=GET、`/systemManage/updateRoleMenu`·`/systemManage/updateRoleHome`=POST,`INSERT ... ON CONFLICT DO NOTHING`;down `DELETE WHERE ptype='p' AND v1 IN(4 path)`,**不踩 010 menu policy 9 / 019 read 3 / 020 write 4 / 017 role 4**)③ `migration/src/lib.rs` mod + migrations() 註冊(000020 之後)④ `entity/src/sys_role.rs::Model` +`home: Option<String>` 欄;**驗 up→down→up 對 throwaway DB 可逆**(data-model §1/§5)

**Checkpoint**: sys_role 有 home 欄(seed 'home')+ 4 端點 write policy 就緒 → US 可開始

---

## Phase 3: User Story 1 — 維運者編輯角色的可見選單(P1) 🎯

**Goal**:Super runtime 設定某角色可見選單集(改既有 menu-visibility policy);變更即時反映於該角色 getUserRoutes/nav(無重啟)、跨實例一致(redis)。
**Independent Test**:指派含 manage_role 的集給 R_ADMIN→Admin getUserRoutes 即時含 manage_role;移除→即時消失;getRoleMenu 預載正確 id[];軟刪選單不出現;自鎖(移 Super manage_menu)→2222;Admin→5003/none→3333(C-V §1/§2/§4)。

- [ ] T003 [P] [US1] facade `sys_menu` id↔route_name 對映 in `rust-api/server/src/model/facade/sys_menu.rs`(entity-access 唯一管道、不 re-export Entity):`route_names_for_ids(db, &[i64])->Result<Vec<String>,DbErr>`(active-only、未知/軟刪 id 略過,供 updateRoleMenu)+ `ids_for_route_names(db, &[String])->Result<Vec<i64>,DbErr>`(active-only,供 getRoleMenu 預載)+ **單測**(active-only 過濾 + 未知 id/route_name 略過 + 空輸入)(依賴 T001;`find_active`/`list_active_all` 既有 pattern)
- [ ] T004 [P] [US1] redis policy_watcher in `rust-api/server/src/auth/policy_watcher.rs`(或 infra):`spawn_policy_watcher(client, enforcer)`(boot `tokio::spawn`、`client.get_async_pubsub()` **獨立 pubsub 連線**、SUBSCRIBE `casbin:policy:invalidate`、收到→`enforcer.write()+load_policy()`、error-log 不靜默)+ `publish_policy_invalidate(&mut redis_mgr)`(`redis::cmd("PUBLISH")` via AppState.redis ConnectionManager)+ `main.rs` boot spawn(消費現 dead_code `AppState.redis`、消 `field redis is never read` warning)(依賴 T001;redis 1.2.1 既有、research R5)
- [ ] T005 [US1] menu-auth policy 寫路徑 + 自鎖 guard in `rust-api/server/src/auth/menu_auth.rs`:`set_role_menu(state, role_code, route_names, operator)`(`enforcer.write()` → before 快照〔`get_role_menu_route_names`〕→ `remove_filtered_policy(0,[role_code,"","menu"])`〔**impl 跑一次確認空字串=wildcard 只清 menu 列、不碰 endpoint policy**〕→ `add_policies(route_names.map(|rn| vec![role_code, rn, "menu"]))` → 011 AuditEvent〔Update、entity_table="casbin_rule"、payload_before/after=route_name 集、operator〕→ `publish_policy_invalidate`〔T004〕)+ `get_role_menu_route_names(enforcer, role_code)->Vec<String>`(**impl 確認 `get_filtered_policy` 簽名**、或 `get_policy()` 過濾 v0=role,v2='menu')+ **自鎖 guard 純函式** `menu_set_locks_out_super(role_code, route_names)`(R_SUPER 且新集不含 `manage_menu`→true;**leaf-only by design**:父 `manage` 無 policy、靠 020 種子保護存活 + FR-011 re-parent 排除,故只 pin leaf、不擴 6 種子,見 data-model §4)+ **單測**(自鎖 guard:R_SUPER 缺 manage_menu→true、R_SUPER 含→false、非 R_SUPER→false)(依賴 T003/T004;走 011 audit 既有)
- [ ] T006 [US1] handler `get_role_menu` + `update_role_menu` in `rust-api/server/src/handler/system_manage.rs`:`get_role_menu`(`GET /systemManage/getRoleMenu`→`Res<Vec<i64>>`,Query `RoleIdReq{role_id}`→查 sys_role.code→`get_role_menu_route_names`→`ids_for_route_names`→id[])+ `update_role_menu`(`POST /systemManage/updateRoleMenu`→`Res<()>`,Json `RoleMenuReq{role_id, menu_ids:Vec<i64>}`)+ **DTO**(camelCase、roleId 彈性 number\|string→i64〔沿 020 de_parent_id pattern〕)+ operator 由 `RequestContext`(None→5000)+ **roleId→sys_role.code**(`find_active_by_id`,查無→2222「角色不存在」)+ `menu_ids`→`route_names_for_ids`〔T003〕+ **自鎖 guard**(`menu_set_locks_out_super`〔T005〕→2222「不可移除超级管理员的菜单管理可见性」)+ `set_role_menu`〔T005〕+ 業務錯誤 2222 + 2 route(`main.rs` get/post + enforce_mw)+ **單測**(RoleIdReq/RoleMenuReq 反序列化 + roleId number/string 皆吃)(依賴 T005)+ route in `rust-api/server/src/main.rs`

**Checkpoint**: US1 可獨立驗(指派/移除即時反映 + 預載 + 自鎖 + redis + 授權)

---

## Phase 4: User Story 2 — 維運者設定角色落地頁(home)(P2)

**Goal**:Super 設角色 home(route name);該角色 getUserRoutes.home 回該值;多角色取第一 active 角色(role id ASC);未設沿用 'home'。
**Independent Test**:設 R_ADMIN home='manage_user'→Admin getUserRoutes.home=='manage_user' + §I.6 成對;getRoleHome 真值;多角色取 id 較小者;未設→'home'(C-V §3)。

- [ ] T007 [US2] facade `sys_role` home 寫 + `sys_user_role` 取序 in `rust-api/server/src/model/facade/sys_role.rs` + `rust-api/server/src/model/facade/sys_user_role.rs`:① `update_role_home_query(id, home, operator)->UpdateMany`(**純 seam**:col_expr `Home` + `UpdatedAt=Expr::current_timestamp()` + `UpdatedBy(operator)` §I.6 成對)+ `update_role_home(db, id, home, operator)->Result<bool,DbErr>`(load active→Ok(false) + exec + 重查 + audit Update)② `sys_user_role.roles_for_user` **加 `ORDER BY sys_role.id ASC`**(或新 `roles_for_user_ordered(db,user_id)->Vec<(i64,String)>` 回 (id,code))→ 供 getUserRoutes per-role home 取「第一 active 角色」確定序 + **單測**(`update_role_home_query` SQL:含 Home + current_timestamp + updated_by 成對;`roles_for_user_ordered` 取序 role id ASC〔in-crate live 或 query 斷言 ORDER BY〕)(依賴 T002 Model +home;`find_active_by_id` Model 含 home)
- [ ] T008 [US2] handler `get_role_home` + `update_role_home` + getUserRoutes home in `rust-api/server/src/handler/system_manage.rs` + `rust-api/server/src/handler/route.rs`:① `get_role_home`(`GET /systemManage/getRoleHome`→`Res<String>`,Query `RoleIdReq`→`find_active_by_id`.home〔None→'home'〕)+ `update_role_home`(`POST /systemManage/updateRoleHome`→`Res<()>`,Json `RoleHomeReq{role_id, home:String}`,operator+roleId 解析→2222、`update_role_home`〔T007〕、Ok(false)→2222「角色不存在」)② **getUserRoutes home**(`handler/route.rs:86` `home:"home".into()` 改 → `roles_for_user_ordered`〔T007〕第一 active 角色→`find_active_by_id(role_id).home`〔None/查無→`"home"`〕;**menu 過濾邏輯不動**)+ 2 route(`main.rs` get/post + enforce_mw)+ **單測**(RoleHomeReq 反序列化)(依賴 T007)+ route in `rust-api/server/src/main.rs`

**Checkpoint**: US1+US2 rust 端獨立可驗(menu 可見性 + per-role home)

---

## Phase 5: base-web 接線(US1+US2 共用;MODAL-WIRING ★ + BASE-WEB-WRAPPER,鏡像 020)

- [ ] T009 base-web `BASE-WEB-WRAPPER`:`src/service/api/rev2-system-manage.ts` +4 fetch fn(`fetchGetRoleMenu`〔GET /systemManage/getRoleMenu,`request<number[]>`〕/`fetchUpdateRoleMenu`〔POST /systemManage/updateRoleMenu,`request<null>`〕/`fetchGetRoleHome`〔GET /systemManage/getRoleHome,`request<string>`〕/`fetchUpdateRoleHome`〔POST /systemManage/updateRoleHome,`request<null>`〕,鏡像既有 fetch pattern)+ 確認 `src/service/api/index.ts` `export *` 涵蓋 in `base-web/`
- [ ] T010 base-web `MODAL-WIRING ★`(只改 `// request` 行、`!error` 才成功動作):`src/views/manage/role/modules/menu-auth-modal.vue` 接 4 placeholder — `getChecks`→`fetchGetRoleMenu(roleId)`(回 menu id[]→`checks`)/ `handleSubmit`→`fetchUpdateRoleMenu(roleId, checks)`/ `getHome`→`fetchGetRoleHome(roleId)`(回 route name)/ `updateHome`→`fetchUpdateRoleHome(roleId, home)`(NSelect 變更)in `base-web/`(依賴 T009;每處 spec 記 file:line;**upstream modal home 選項用 page key、與 route-name redirect 語意落差登記 follow-up**,research R6)

**Checkpoint**: base-web 角色管理頁 menu-auth-modal 可完整操作（接線完成）

---

## Phase 6: Polish & Acceptance(C-V 對照 `contracts/verification-commands.md`)

- [ ] T011 acceptance US1(C-V §1/§2/§4):**★ 即時反映**(指派含 manage_role 的集給 R_ADMIN→Admin getUserRoutes 即時含 manage_role〔無重啟〕;移除→即時不含)+ getRoleMenu 預載 id[] 正確 + **redis reload**(log 見 subscriber 收 `casbin:policy:invalidate`+reload)+ **自鎖 guard**(移 Super manage_menu→2222、policy 不變)+ **★ 正向實證:guard 通過的 updateRoleMenu(R_SUPER 含 manage_menu)後,Super getUserRoutes 仍實際渲染 `manage > manage_menu`**(證 tree-prune 父隨子存活、reachability 非僅 policy presence)+ Super-only(Admin 5003/none 3333)+ psql `casbin_rule v0=role,v2='menu'` 真值 + audit〔operator+前後集〕+ **完成後還原** R_ADMIN 010 原始可見性
- [ ] T012 acceptance US2(C-V §3):設 R_ADMIN home='manage_user'→**Admin getUserRoutes.home=='manage_user'** + psql sys_role.home 真值 + `updated_at·by` §I.6 成對 + getRoleHome 回真值 + 多角色取第一 active(role id ASC) + 未設→'home' + **還原** R_ADMIN home→'home'
- [ ] T013 **★ 回歸**(C-V §5,SC-007):**未編輯時三角色 getUserRoutes 逐字 == 019/014 基線**(T001 存) + getConstantRoutes 不變 + home 預設 'home' + 019 三讀端(getMenuList/Tree/AllPages)/020 寫端(addMenu/update/delete/batch)/013 enforce 階梯(Super/Admin/User allow+deny)/016 list 不破 + 守恆(server 單測〔id↔route_name 對映/roles 取序/自鎖 guard/update_role_home_query SQL〕 + entity_access_lint〔handler/route 零 `entity::`〕 + xdb + `Migrator::up` grep 0)
- [ ] T014 migration 021 up→down→up 可逆(throwaway DB:+home seed 'home' + 4 write policy up/down 精準,010 menu 9 / 019 read 3 / 020 write 4 / 017 role 4 不踩)+ **prod target image build 綠**(`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`;無新 crate〔僅模組+migration〕故非 §3 強制,沿 016-020 de-risk)
- [ ] T015 真 CDP(front-nginx `:21080`)/manage/role → menu-auth-modal 端到端:登入 Super → 開某角色 → 勾選選單儲存(該角色重登 nav 反映)+ home 下拉設定(該角色 getUserRoutes.home 反映)(harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A;**若難構造則 curl 直送證 4 端點 + 即時反映 + 自鎖 + redis log + home + 登記 follow-up**,C-V §7)
- [ ] T016 收尾**本地**兩段式 commit ×2 worktree(rust-api worktree commit + base-web worktree commit + 外層 `git add rust-api base-web` SHA pin commit;**皆 local、不 push**)+ 整體 final holistic review(FR-001..010 + SC-001..007 可追溯、跨任務一致、policy v0=role code、即時反映、redis reload、自鎖 guard、per-role home、§I.6 成對、未編輯逐字回歸、不 fork adapter)。**push/merge 留 `superpowers:finishing-a-development-branch`(§3)**

---

## Dependencies & Execution Order

- **Phase 1**(T001)→ **Phase 2 Foundational**(T002)→ **US1**(T003-T006)→ **US2**(T007-T008)→ **base-web**(T009-T010)→ **Polish**(T011+)。
- US1 內:T003(sys_menu 對映)/ T004(redis watcher)相對獨立可平行([P],不同檔)→ T005(policy 寫路徑,依 T003 對映 + T004 publish)→ T006(handler,依 T005)。
- US2 內:T007(facade home+roles 加序,依 T002 Model +home)→ T008(handler + getUserRoutes home,依 T007)。
- base-web:T009(wrapper)→ T010(MODAL-WIRING 依 wrapper)。
- **同檔序**:handler T006(US1)→ T008(US2)同改 `system_manage.rs`,序做;facade 分檔(sys_menu T003 / sys_role+sys_user_role T007)較少衝突。

### Parallel Opportunities
- US1:T003 / T004 可平行([P],sys_menu 對映 vs redis watcher 不同檔)。
- US1(P1)Foundational 後可先交付;US2(P2)獨立、可後做或平行(若多人;本地單人建議序,handler 同檔)。base-web(T009-T010)可與 rust Polish 平行。

---

## Implementation Strategy

- **MVP = US1**(Phase 1+2+3):Super 可 runtime 編輯角色可見選單 + 即時反映 getUserRoutes + redis 跨實例一致 + 自鎖防護,即閉合 menu arc 核心(解 020 新選單不顯 nav 缺口)。
- 增量:US1(menu 可見性,P1)→ US2(per-role home,P2)→ base-web 接線。每 US 獨立可驗。
- **★ 即時反映(SC-001/002)**:US1 後驗「指派 menu→getUserRoutes 即時出現、移除→消失」+ redis subscriber reload;**回歸鐵律**:未編輯時 getUserRoutes 逐字 == 019/014 基線(menu 過濾邏輯不動、home 預設 'home')。
- 收尾:`superpowers:finishing-a-development-branch` → push(待 user 同意)+ `merge --no-ff` 回 `rev2-admin-root`、保留 021 branch。

## Notes
- [P]=不同檔/關注點無依賴;[Story]=US 可追溯。
- 純函式 test-first(T005 自鎖 guard 判定 / T006 DTO roleId 彈性 / T007 update_role_home_query SQL-build + roles 取序 / T008 RoleHomeReq);**4 端點 wiring + policy 即時反映 + redis reload + id↔route_name 對映 + getUserRoutes home + base-web 接線無單元測試 → C-V acceptance(T011-T015)覆蓋**(沿 016-020,理由本檔頭 + plan 明示)。
- **rust-api + base-web 兩倉**;收尾兩段式 commit ×2 worktree + 外層 SHA pin。
- 實作期間僅本地 commit;**push/merge 不在 tasks、留 finishing-a-development-branch**(§3 鐵律)。
- 無新 crate/dep;**不建表**(ALTER sys_role +home);**不 fork sea-orm-adapter**(§11.6、stock MgmtApi);handler/route 零 `entity::`(009 lint);**policy v0 用 role code 非 id**;**getUserRoutes menu 過濾不動**(只改 home);自鎖防護(M5);redis 方案 B(消費閒置 AppState.redis、實現 Phase 3 #3);§I.6 成對審計(operator 由 015 ctx);業務錯誤一律 2222。
