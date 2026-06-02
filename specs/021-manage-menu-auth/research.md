# Research: 021 manage-menu-auth (Phase 0)

> 依 CLAUDE.md §3 紀律:grep 驗證真實 code(不信 brainstorm 命名)。7-cluster 並行驗證(workflow `wf_b7e25ff4`)。**No new crate/dep / No new table**(ALTER sys_role +home;casbin_rule runtime 編輯不改 schema)。下列 ★ 標 brainstorm 假設被**否證/修正**處。

---

## R1 — Casbin Enforcer + SeaOrmAdapter + menu RBAC(021 runtime 編輯地基)

**Decision**: menu 可見性 runtime 編輯用 casbin `Enforcer` MgmtApi(`remove_filtered_policy` + `add_policies`)在 `enforcer.write()` 鎖內改;stock `SeaOrmAdapter` auto_save 同步 in-memory + DB,**不 fork、不改 casbin_rule schema**(方案 1)。

- `AppState.enforcer: Arc<RwLock<casbin::Enforcer>>`(state.rs:28、main.rs:69);enforce_mw 現只 `.read()`(enforce.rs:103),寫鎖架構已預留。
- casbin **2.20**(Cargo.lock 2.20);`SeaOrmAdapter`(adapter.rs:54-187)實作 `add_policy`/`add_policies`(insert_many)/`remove_policy`/`remove_policies`/`remove_filtered_policy`/`load_policy`/`save_policy`/`clear_policy`。**auto_save 預設開**(main.rs `Enforcer::new` 未顯式設、adapter `round_trip_live` test L504-539 證 add_policy 後新 conn 讀回成立)→ MgmtApi 改即 persist、不需顯式 save_policy。
- **menu policy 格式**(migration 010):`('p', <role_code>, <route_name>, 'menu', '', '', '')` = `ptype/v0/v1/v2`;`v2='menu'` 區隔可見性 domain 與 endpoint domain(`v2=GET/POST`)、共表不衝突。menu.rs:339 `enforce((role, route_name, "menu"))`、union(任一 role allow 即可見)、tree-prune(父無可見子則剪)、fail-closed。
- **★ `remove_filtered_policy(field_index, field_values)` 空字串=wildcard**:adapter action.rs 建 delete Condition 時 `.filter(|(value,_)| !value.is_empty())` **跳過空值欄**。故 `remove_filtered_policy(0, ["<role>", "", "menu"])` = `DELETE WHERE v0=role AND v2='menu'`(v1 不過濾)→ **只清該角色的 menu 列、不碰其 endpoint policy**(R5 初疑「無 compound AND」由此解決)。
- **★ open(impl 時確認)**:`get_filtered_policy(field_index, field_values)->Vec<Vec<String>>` 為 casbin MgmtApi 標準但**現 code 未用**、簽名未在本倉驗;讀某 role 現有 menu 列(供 getRoleMenuIds 預載 + audit before 快照)時 impl 須確認真實簽名(或 `enforcer.get_policy()` 全取後過濾 v0=role,v2=menu)。
- **★ 注意**:`add_policies` 在 adapter 內為迴圈、**非單 txn**(部分失敗風險);MenuAuth 批次替換採「先 remove_filtered 再 add_policies」、中途失敗極罕(admin 低頻)、由 redis reload + 重編修正,acceptance 記。

**Alternatives 否決**:fork adapter + casbin_rule.deleted_at(soft-delete/protected)= 受管 policy 層(§11.6 amendment),brainstorm M2 已否(留 Phase 3 #6)。

## R2 — getUserRoutes + menu filter + home 衍生點

**Decision**: getUserRoutes 過濾邏輯(menu_visible enforce)**不改**;只把 home 由寫死改 per-role。

- **★ home 寫死位置 = `handler/route.rs:86` `home: "home".into()`**(get_user_routes 末);`UserRoute{routes:Vec<MenuRoute>, home:String}`(menu.rs:67-72)— home 是 **UserRoute 層級單一 String**、非 per-route。
- `menu_visible`(menu.rs:336-340)= `roles.iter().any(|r| enforce((r, name, "menu"))==Ok(true))`、union、fail-closed;`filter_routes` tree-prune;`route_exists_for_roles`(isRouteExist 用,菜單可見邏輯與 getUserRoutes 對稱、改邏輯兩端同步)。
- `business_routes()`(menu.rs:179)`#[allow(dead_code)]` 僅 014 regression baseline、runtime 源是 sys_menu(018 seed)。
- **★ roles_for_user 順序無保證**(見 R4)→ per-role home「第一 active 角色」須明確排序。

## R3 — sys_menu id↔route_name 對映(facade)

**Decision**: 新增 sys_menu facade 純對映 helper(active-only);讀端 list_active_all 重用。

- `sys_menu::Model` id(i64 PK)+ route_name(String NN)(entity 27 欄,R3);`list_active_all(db)->Vec<Model>`(facade:79-83,id ASC,經 `find_active()` 濾 `deleted_at IS NULL`)已給全 (id,route_name)。`MenuNode`(assemble_menu_tree 輸出)亦含 id+route_name。
- **新增 helper**(facade/sys_menu.rs,entity-access 唯一管道、不 re-export Entity):`route_names_for_ids(db, &[i64])->Vec<String>`(active)+ `ids_for_route_names(db, &[String])->Vec<i64>`(active)。供 updateRoleMenu(id[]→route_name 寫 policy)+ getRoleMenuIds(policy route_name→id[] 預載)。
- partial unique `sys_menu_route_name_active_uniq`(018,route_name WHERE deleted_at IS NULL)→ 對映務必 **active-only**(軟刪 route_name 可重用、不取已刪)。
- **FR-006 自鎖**:`manage_menu`(選單管理頁)的 route_name→id 對映 + code guard 防移除。

## R4 — sys_role schema(+home)+ home 寫路徑 + roles_for_user 順序

**Decision**: ALTER sys_role +`home`(varchar nullable、seed 回填 'home');home 寫走 update_role_query col_expr §I.6 成對;**roles_for_user 加 ORDER BY role_id ASC**。

- `sys_role::Model`(entity:5-18)= id/code/name/role_desc/status + §I.6 6 審計欄、**無 home**(R4/R5/R7 三方確認)。
- migration 016(alter_sys_role_business_audit)`Table::alter().add_column(ColumnDef::new(...).string().null())` × N + down 對稱 drop_column → **+home 鏡像此**(`ADD home varchar null` + seed `UPDATE sys_role SET home='home'`;down drop)。
- `find_active_by_id`(facade:50,ALTER 後 Model 含 home)、`update_role_query`(facade:205-219,col_expr 業務欄 + `UpdatedAt=current_timestamp` + `UpdatedBy(operator)`)→ 寫 home 加 `.col_expr(Column::Home, Expr::value(home))`、§I.6 成對。
- **★ roles_for_user 無 ORDER BY 否證假設**(facade sys_user_role.rs:27-52:sys_user_role.find() 無序 + find_active_enabled().is_in() 無序)→ FR-004「多角色取第一 active 角色 by role id ASC」**須加 `ORDER BY sys_role.id ASC`**(改 roles_for_user 或新 `roles_for_user_ordered` 並回 (id,code) 供 home 取序;getUserRoutes 取序後 .first() 的 role → 該 role.home)。

## R5 — redis 連線 + pub-sub 訂閱

**Decision**: 方案 B —— updateRoleMenu PUBLISH `casbin:policy:invalidate`(用 AppState.redis ConnectionManager);boot tokio::spawn subscriber task(**獨立 pubsub 連線**)收到 `enforcer.write()+load_policy()` reload。

- redis **1.2.1**(`tokio-comp`+`connection-manager`);`AppState.redis: redis::aio::ConnectionManager`(state.rs:16、infra/redis.rs:18);config RedisConfig{url}。
- **★ SUBSCRIBE 需獨立連線**:ConnectionManager 是 command 導向、SUBSCRIBE 佔用連線狀態 → subscriber 須 `client.get_async_pubsub()`(由既有 redis client 開、不共用 ConnectionManager)。PUBLISH 可用 `redis::cmd("PUBLISH").arg(ch).arg(msg).query_async(&mut mgr)`(同 enforce.rs PING 模式)。
- `#[tokio::main]`(main.rs:35)→ boot 可 `tokio::spawn(subscriber_task)`;最小實作不需 graceful cancel(程式關閉 pubsub 自斷)、但 subscriber 迴圈須 error-log 不靜默 panic。
- **★ AppState.redis 現 dead_code**(grep 無 `state.redis` 消費)→ 本 feature 首次消費(消 `field redis is never read` warning、實現 Phase 3 #3/W-F11)。
- 單 instance 自收冪等:updateRoleMenu 先 in-place(MgmtApi)、PUBLISH 後自己 subscriber 收到再 load_policy(讀剛寫的 DB、同態);前提 auto_save 同步(R1 證)。

## R6 — base-web menu-auth-modal 送出形 + home wire + wrapper

**Decision**: 接 menu-auth-modal 4 placeholder(getHome/updateHome/getChecks/handleSubmit);getPages/getTree 重用 019;wrapper rev2-system-manage.ts +fetch fn;URL rev2 自訂。

- `checks: shallowRef<number[]>`(menu-auth-modal:70)、`<NTree v-model:checked-keys="checks" key-field="id">`、`MenuTree.id:number`(system-manage.d.ts:132-137)→ **checks=menu id number[]** ✓。
- `roleId: number`(props,role-operate-drawer `:role-id="roleId"`,`roleId=rowData?.id||-1`)。
- getPages=`fetchGetAllPages()`(019、string[])、getTree=`fetchGetMenuTree()`(019)→ **重用、無新讀端**。
- **★★ home = route NAME(LastLevelRouteKey)非 page key**(修正 brainstorm 假設):`UserRoute.home: LastLevelRouteKey`(route.d.ts:14-17);route store `setRouteHome(home)`+`handleUpdateRootRouteRedirect(home)`(store/modules/route/index.ts:215-286)把 home 當 **route name** redirect root(`/`)。**modal 的 home 選項雖來自 getAllPages(page key)、是 upstream 概念混淆**:rev2 端 `getRoleHome` 回 **route name 字串**(sys_role.home、default 'home')、`updateRoleHome` 存該字串;modal 的 select 顯示由 upstream form 決定(MODAL-WIRING 只改 `// request`、不動 select 來源)→ **登記 follow-up**:upstream modal home 選項用 page key、與 route-name redirect 語意有落差(現 seed 'home' 同時是合法 route name + getAllPages 項、可運作;選非 route-name page 時 redirect 行為 upstream 限制)。
- **placeholder→endpoint**:getHome→`getRoleHome(roleId)`(回 home route name) / updateHome→`updateRoleHome(roleId, home)`(NSelect 變更時) / getChecks→`getRoleMenuIds(roleId)`(回 menu id[]) / handleSubmit→`updateRoleMenu(roleId, menuIds[])`。
- 無既有 menu-auth fetch(grep 0)→ rev2-system-manage.ts +4 fn(`request<null>`/`request<...>`)、URL rev2 定。

## R7 — MenuAuth 端點 casbin write policy seed + route 註冊 + migration 號

**Decision**: 新 migration `m20260529_000021`(ALTER sys_role +home + seed write-policy 4 行 R_SUPER);main.rs +4 route(enforce_mw);handler 鏡像既有 pattern。

- write-policy seed(017/020 同構):`INSERT casbin_rule ('p','R_SUPER',<path>,<method>,'','','') ON CONFLICT DO NOTHING`;down `DELETE WHERE ptype='p' AND v1 IN(4 path)`。**021 4 端點**:`/systemManage/getRoleMenu`(GET)·`/systemManage/updateRoleMenu`(POST)·`/systemManage/getRoleHome`(GET)·`/systemManage/updateRoleHome`(POST)〔URL 命名待 plan/實作敲定、與 base-web wrapper 對齊〕。**Super-only**。
- main.rs route_layer pattern:`.route("<path>", get/post(handler).route_layer(from_fn_with_state(state.clone(), enforce_mw)))`(menu 讀/寫端 208-275 範本);enforce_mw path 無 /api 前綴、精確 match、DB-fresh roles、fail-closed。
- **下一 migration = `m20260529_000021`**(lib.rs 最高 000020);ALTER sys_role +home + write-policy seed 可同一 migration 或分兩、lib.rs 註冊。
- handler 鏡像(system_manage.rs):operator=`ctx.operator_id`(None→`Res::err(Internal)` 5000)、id `String` parse→`Res::err_msg(BizError,..)` 2222、業務錯誤一律 2222。

---

## 待 plan/tasks 落實的明示項
- **C-V acceptance**:指派 menu→role getUserRoutes 即時反映(無重啟)/ 移除→消失 / redis reload(單 instance 自收;多 instance log 證 subscriber 收到)/ getRoleMenuIds 預載對映 / home 設定→getUserRoutes 反映 + §I.6 成對 + 多角色取第一 active(role id ASC)/ 自鎖 guard(移除 Super manage_menu→2222)/ Super-only(Admin 5003·none 3333)/ **未編輯時三角色 getUserRoutes 逐字 == 014/019 基線**(回歸鐵律)+ 019 三讀端/020 寫端/013 enforce 階梯 + 守恆(server 單測〔id↔route_name 對映 / roles 取序 / 自鎖 guard〕+ entity_access_lint〔handler/route 零 entity::〕+ xdb + Migrator::up 0)+ migration 021 up→down→up 可逆。
- **單元測試**:id↔route_name 對映純函式 / roles_for_user_ordered 取序 / 自鎖 guard 判定 / sys_role home update SQL-build(col_expr §I.6 成對)。
- **impl 時確認(本研究未在 code 驗)**:`get_filtered_policy` 真實簽名/回傳(讀 role menu 列);`remove_filtered_policy` 空字串=wildcard 在 casbin 2.20 enforcer 層(adapter 已證 skip-empty,enforcer MgmtApi 層 impl 時跑一次驗)。
- **CDP**:沿 020 dev :21080 menu-auth-modal 勾選端到端(難構造則 curl 直送 + follow-up)。
- **無新 crate/dep**(casbin/redis/sea-orm 既有);**ALTER sys_role +home 非新建表** → §IV #8 N/A(審計欄 018 已備、僅加 business 欄)。
