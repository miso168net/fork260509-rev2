# 021 manage-menu-auth — Phase 0 brainstorm (spec-design)

> rev2 Phase 3/4 交界 — **MenuAuth:角色×選單可見性 runtime 編輯**(動既有 Casbin menu-visibility policy)+ **per-role home** + **Casbin redis pub-sub 失效通知**。
> 接 base-web 角色管理頁 `menu-auth-modal.vue` 的 4 個 `// request` placeholder(role-operate-drawer 內)。
> **這是 §I.2 rev2 核心(menu 走 Casbin enforce)從「migration 硬編」變成「runtime 可編輯」的那一步**,並解 020 留下的「新選單在指派可見性前不顯於 nav」缺口。
> **凍結設計來源**:本檔(M1–M5 user 親決,2026-06-02 brainstorm)。交棒 `/speckit-specify`(階段 1、**手動執行**、勿在 brainstorm 觸發)。
> 設計骨幹參考 = 019/020(menu 讀/寫 facade+handler+base-web MODAL-WIRING)+ 013/014(enforce/casbin/getUserRoutes/menu::filter_routes)+ 018(寫 facade pattern + 種子 code guard)。
> **ButtonAuth 不在本波**(機制不同、另開 feature)。

---

## 1. Scope / User Stories

**範圍拍板(M1):021 = MenuAuth(role↔menu 可見性編輯)+ per-role home;ButtonAuth(role↔button 權限)= 獨立後續 feature。**

- **US1 編輯角色可見選單**:`updateRoleMenu`(POST)—— 設某角色可見的選單集(勾選 menu 樹);`getRoleMenuIds`(GET)讀該角色目前可見集。runtime 改 Casbin menu-visibility policy → **該角色 getUserRoutes/nav 即時反映**。
- **US2 角色 home(落地頁)**:`getRoleHome`/`updateRoleHome` —— 設某角色登入後落地頁;getUserRoutes 回 per-role home。
- 授權:沿 017/018/020 —— 端點掛 `enforce_mw`、**Super-only**(migration seed casbin write policy)。

**不在 021**:
- **ButtonAuth(角色×按鈕代碼權限)**:`button-auth-modal.vue`、現由 013 getUserInfo 程式內 `role→[B_CODE]` map 供應、不走 Casbin、儲存機制待定 → 獨立後續 feature。
- **受管 policy 層完整體**(casbin_rule soft-delete 可復原 / protected DB flag / 完整 policy CRUD facade)= Phase 3 #6,本波用「方案 1 混合」最小達標、不做 soft-delete/restore(見 M2)。
- role priority 欄(multi-role home 用 role id ASC 簡規、不加 priority 欄,見 M4)。

## 2. 親決(M1–M5)

### M1 — 範圍 = MenuAuth(menu 可見性 + per-role home);ButtonAuth 另開
- 接 `menu-auth-modal.vue` 4 placeholder;`button-auth-modal.vue` 不碰(buttons≠menu、機制不同,[[feedback_menu_route_via_casbin_enforce]])。

### M2 — policy 機制 = 方案 1「混合」(casbin 原生 MgmtApi + 011 audit、無 fork、無 §11.6 amendment)
- **實查確認**:sea-orm-adapter(stock、§11.6 拷貝)**完整實作** casbin `Adapter` trait 寫方法(`add_policy`/`add_policies`/`remove_policy`/`remove_policies`/`remove_filtered_policy`/`load_policy`/`save_policy`/`clear_policy`,adapter.rs:54-174);casbin 2.20、`enable_auto_save` 預設開 → Enforcer MgmtApi 會**同步**更新 in-memory model **與** 經 adapter persist 到 `casbin_rule`。
- `updateRoleMenu`:`enforcer.write()` 鎖內 `remove_filtered_policy(role, v2='menu')` + `add_policies(新集)` → memory+DB 同步。**hard-delete**(無 soft-delete/restore — 那是 Phase 3 #6 受管層)。
- **011 audit**:另寫 `AuditEvent`(operator + payload_before/after = route_name 集、`entity_table="casbin_rule"`)記「誰把哪角色可見性改成什麼」。
- **不動 casbin_rule schema、不 fork adapter → Constitution §IV #8 不建表、無 §11.6 amendment**。

### M3 — redis pub-sub「v1 即啟用」(方案 B,honor DESIGN §6.3 凍結)
- DESIGN §6.3 凍結:`casbin:policy:invalidate` channel **v1 即啟用、即使單 instance**(原則:一致性優先、不靠環境分支)。
- `updateRoleMenu` 改完 **PUBLISH `casbin:policy:invalidate`**;boot spawn 背景 **subscriber task**:`SUBSCRIBE` → 收到 `enforcer.write()+load_policy()` reload。
- 多 instance → 別 instance 經此 reload 同步;單 instance → 編輯 instance 已 in-place、自收冪等 reload(同態、admin 低頻可接受;或帶 sender-id 過濾)。
- **終於消費一直閒置的 `AppState.redis`**(消 `field redis is never read` dead_code),實現 Phase 3 #3 / W-F11(constitution §I.2 核心 feature 之一)。
- ⚠️ **實作注意(Phase 0/plan 研究)**:redis-rs `ConnectionManager`(AppState.redis)是 command 導向;pub-sub `SUBSCRIBE` 需**獨立 connection**(`client.get_async_pubsub()` 類)→ subscriber task 自開一條、不共用 ConnectionManager。

### M4 — per-role home(sys_role +home 欄)
- migration **ALTER sys_role +`home`**(varchar nullable、seed 回填 `'home'`);sys_role §I.6 審計欄 018 已備、僅加 business 欄。
- `updateRoleHome`:走 sys_role update(`updated_at`+`updated_by` 成對 §I.6、可沿既有 update_role facade col_expr 或專用 fn)。
- **getUserRoutes 回 per-role home**(取代 route/menu.rs 寫死 `"home"`):**multi-role 優先序 = 第一個 active 角色(role id ASC)的 home**(簡規、不加 priority 欄)。
- **回歸鐵律**:未編輯時全角色 home 仍 `'home'`(seed 預設)→ 三角色 getUserRoutes 逐字 == 014/019 基線;**編輯才反映**(延續 D5 回歸鐵律 + 020 D1 payoff「未動逐字、動了反映」模式)。

### M5 — 自鎖防護(handler code guard,鏡像 020 is_seed)
- `updateRoleMenu` 防自鎖:擋移除會造成「自己鎖死」的核心可見性(如清空 Super 對 `manage`/`manage_menu` 的可見、或整批清空),→ 2222 業務錯誤。具體規則(擋哪些)Phase 0 brainstorm/spec 細化(候選:Super 角色的種子選單可見性不可移除,鏡像 020 D4 種子保護)。
- protected「靠 code guard 非 DB flag」(方案 1 無 protected 欄)。

### 衍生(不另議,沿既有 pattern)
- **wire**:roleId/menuIds wire 型沿 §I.3(id=string parse、混型彈性沿 020 `de_parent_id` 經驗若需);業務錯誤一律 **2222**(自鎖/非法 id/角色不存在),5xxx 留 enforce/infra。
- **menuId↔route_name 對映**:modal 用 menu **id**(getMenuTree key-field=id、number);Casbin policy 用 **route_name**。`updateRoleMenu` 收 id[] → sys_menu facade 查 active route_name → 寫 policy;`getRoleMenuIds` 讀 policy route_name → sys_menu 對映回 id[]。
- **§I.6 審計**:policy 變更走 011 audit;sys_role.home update 走 §I.6 成對。
- **無新 crate/dep**(redis ConnectionManager + casbin MgmtApi 既有;redis pubsub connection 由既有 redis client 開);handler 零 `entity::`(009 lint);getUserRoutes 既有 Casbin 過濾不改邏輯。

## 3. Schema(只 ALTER sys_role,不建表)
- **不建表**;migration **ALTER sys_role +`home` varchar nullable**(seed 回填 `'home'`)+ casbin write-policy seed(MenuAuth 端點 Super-only,鏡像 017/020 write policy migration)。
- **casbin_rule schema 不動**(vendored;方案 1 不加 deleted_at)。menu-visibility policy(010 的 9 行)由本 feature **runtime 增刪**(非 migration)。
- entity `sys_role` +home 欄對齊。

## 4. Facade / Handler
- **facade `sys_menu`**(擴):`route_names_for_ids(ids)→Vec<String>`(active)+ `ids_for_route_names(rns)→Vec<i64>`(對映 helper、純可測)。
- **facade `sys_role`**(擴):home 讀/寫(`find_active_by_id` 既有取 home;update home col_expr §I.6 成對)。
- **新 menu-auth 寫路徑**(handler 或小 facade,走 enforcer + 011 audit):`set_role_menu_policy(enforcer, db, role, route_names, operator)` —— write 鎖 + remove_filtered + add_policies + before/after audit + publish。`get_role_menu_route_names(enforcer, role)` 讀 filtered policy。
- **handler `system_manage`**(擴,鏡像 020):`get_role_menu`/`update_role_menu`/`get_role_home`/`update_role_home`;operator 由 015 ctx;自鎖 guard(M5);業務錯誤 2222。
- **redis subscriber**:`infra/redis.rs` 或新 `auth/policy_watcher.rs` —— boot spawn task、獨立 pubsub conn、收到 reload enforcer。
- **getUserRoutes**(route/menu.rs):home 由寫死 `"home"` 改取 per-role(M4);**過濾邏輯不改**(已 Casbin)。

## 5. 跨 feature ripple

| 觸及 | 改動 | 回歸驗 |
|---|---|---|
| **010 casbin menu policy** | runtime 增刪該角色 menu-visibility 列(非 migration) | 未編輯時 9 行不變、getUserRoutes 三角色逐字基線 |
| **getUserRoutes(014/019)** | home 寫死→per-role;menu 過濾不改(已 Casbin) | 未編輯逐字 == 基線、編輯該角色即時反映 |
| **enforcer(013)** | runtime MgmtApi 改 + redis reload(首次 runtime policy 編輯) | enforce_mw allow/deny 仍正確、reload 後一致 |
| **AppState.redis(007)** | 首次消費(publish + subscriber) | 連線/health 不破 |
| **sys_role(018)** | +home business 欄 | 018 role 寫端 + §I.6 不破 |
| **base-web menu-auth-modal** | MODAL-WIRING 接 4 placeholder + wrapper | 角色管理頁可編輯選單可見性/home |

## 6. Acceptance(C-V curl/psql/CDP)
- **US1 curl/psql**:updateRoleMenu(指派 menu 集給某角色 → casbin_rule 該角色 menu 列真值 + audit;getRoleMenuIds 回對映 id[];Admin→5003/none→3333)+ **即時反映**(指派後該角色 getUserRoutes 含新選單、移除後不含 — **無需重啟、enforcer in-place + redis reload**)。
- **★ redis pub-sub**:publish 後 enforcer 反映新 policy(單 instance 自收 reload 驗;多 instance 留 follow-up 或以 log 證 subscriber 收到)。
- **US2 home**:updateRoleHome → getUserRoutes 該角色 home 反映 + sys_role.home 真值 + §I.6 成對;multi-role user 取第一 active 角色 home。
- **★ 回歸鐵律**:未編輯時三角色 getUserRoutes 逐字 == 014/019 基線 + getConstantRoutes 不變 + 019 三讀端 + 020 寫端 + 013 enforce 階梯不破 + 守恆(server 單測〔id↔route_name 對映 / guard〕+ entity_access_lint + xdb + Migrator::up 0)+ migration up→down→up 可逆 + **prod image build**(若動 workspace 不適用、沿 020 de-risk)。
- **CDP /manage/role**:開角色 → menu-auth-modal 勾選選單 → 儲存 → 該角色重登 nav 反映;home 下拉設定反映。沿 020 dev :21080 CDP harness(若難構造 curl 直送 + follow-up)。

## 7. Constitution 預判(v1.2.2)
- §I.1 ✓(接 base-web menu-auth-modal 4 placeholder、提供對應端點)。
- §I.2 ✓(**本 feature 正是 menu 走 Casbin enforce 的 runtime 編輯體現**、核心原則深化)。
- §I.3 ✓(id=string、業務碼 2222、envelope)。
- §I.5 ✓(全新寫 / 沿 018·020 pattern、未拷 rev1;sea-orm-adapter 用 stock、**不 fork**)。
- §I.6 N/A 建表(不建表;sys_role 僅加 business `home` 欄、審計欄 018 已備;policy 變更走 011 audit)。
- §II 拍板:**不違**(§11.6 sea-orm-adapter 用 stock 不 fork → 不觸;§11.7 dynamic mode 不變;redis pub-sub = §6.3「v1 即啟用」本就規劃)→ **無 amendment**。
- §III ★ 軌道:MODAL-WIRING ★(menu-auth-modal placeholder)+ BASE-WEB-WRAPPER(rev2- 新檔)→ 授權內。
- **結論:§IV 8/8 PASS、無 amendment**(redis pub-sub 落地 = 實現既有規劃、非偏離)。

## 8. 範圍提醒 / 可瘦身選項
- **方案 1 是 policy 編輯與 §11.6 的硬界線**:用 stock adapter MgmtApi、**不 fork、不動 casbin_rule schema**。soft-delete/restore/protected-DB-flag(受管層加值)→ Phase 3 #6 獨立 feature。
- **redis「v1 即啟用」**:即使單 instance 也接 publish+subscriber(一致性優先、不靠環境分支);多 instance 真實 reload 驗可留 follow-up。
- **per-role home 回歸鐵律**:未編輯逐字基線不破(seed 全 'home')。
- 已親決:範圍(M1)/ 機制方案1(M2)/ redis 方案B(M3)/ per-role home + 優先序(M4)/ 自鎖 code guard(M5)。
- **Phase 0 research 必 grep**(不信本檔命名假設):casbin Enforcer `remove_filtered_policy`/`add_policies` 簽章 + auto_save 預設 + filtered policy field index(role/route_name/"menu");base-web menu-auth-modal 送出形(checks=menu id、home 值是 route name 抑或 page key、getUserRoutes.home 期望型);getUserRoutes home 衍生點(route/menu.rs 寫死 "home" 位置);redis-rs pubsub 獨立 connection 用法;sys_menu id↔route_name facade 對映;role→home 多角色取第一 active(roles_for_user 順序 / role id ASC)。
