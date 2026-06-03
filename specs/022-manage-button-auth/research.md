# Research: Button Permission Authorization (022) — Phase 0

> grounding workflow(9 agent 對抗驗證,2026-06-03)+ 本輪 plan grep 實證。CLAUDE.md §3「Phase 0 research 必 grep」紀律:不信 brainstorm 命名假設、act on actual code。

## R0. grounding 對抗驗證(4 宣稱全 CONFIRMED)

- **toggle-auth 唯一消費 button code**:`hasAuth` 僅定義一次(`base-web/src/hooks/business/auth.ts:6`,`userInfo.buttons.includes(code)`);唯一呼叫處 `views/function/toggle-auth/index.vue:93-95`(`B_CODE1/2/3`);業務頁 manage/* 零 `hasAuth`。
- **sys_menu.buttons seed 全 NULL**:migration 018 6 seed row INSERT 不含 buttons 欄;無其他 migration 寫入。
- **後端對按鈕不 enforce**:`buttons.rs` 硬編 matrix → `handler/auth.rs:254` `buttons_for_roles(&roles)` 塞 `UserInfo.buttons`;無 button 層 Casbin/中介層 → **022 只改來源**。
- **回歸基線 = B_CODE1/2/3**:`buttons.rs:17-19` R_SUPER→[1,2,3]/R_ADMIN→[2,3]/R_USER_COMMON→[3];`CANONICAL_BUTTONS=[B_CODE1,B_CODE2,B_CODE3]`;7 單元測試釘死。
- **toggle-auth 現況不可達**(CDP 實測 not-found):非 constant route、不在 sys_menu、無 menu policy。

## R1. Casbin policy 機制(鏡像 021 menu_auth.rs)

**grep**:`server/src/auth/menu_auth.rs` ——
- policy 形:`(ptype='p', v0=role_code, v1=route_name, v2='menu')`(line 5)。
- `get_role_menu_route_names(enforcer, role_code)` ← `get_filtered_policy(0, [role_code, "", "menu"])`(line 72-76,空字串=wildcard)。
- `replace_role_menu_policies`:`remove_filtered_policy(0,[role,"","menu"])` + `add_policies(rules)`(line 104-118,stock adapter auto_save;空 vec → `add_policies` 回 `Ok(false)` 非錯誤)。
- `set_role_menu(...)`(line 135)= write-lock 內 before 快照 → replace → 011 audit → `publish_policy_invalidate`。
- 自鎖 `menu_set_locks_out_super`(021 專屬)。

**Decision**:022 新 `auth/button_auth.rs` 鏡像:`(v0=role_code, v1=button_code, v2='button')`;`get_role_button_codes` / `replace_role_button_policies`(remove_filtered + add_policies,HARD REPLACE)/ `set_role_button`(write-lock + audit + publish)。**`v2='button'` 與既有 `'menu'`/endpoint method 列正交** —— remove_filtered(0,[role,"","button"]) 只清該 role 的 button 列。
**Rationale**:最大重用、零新表、policy 機制與 021 一致(stock adapter、不 fork → 守 §11.6)。
**Alternatives**:新 `sys_button` 表(rejected:K1 選 per-menu 聚合、無需獨立 registry 表)/ enforce 中介層(rejected:R0 證後端不 enforce 按鈕、純廣告)。
**自鎖 guard:N/A**(button 非 nav access)→ 不移植 `menu_set_locks_out_super`。

## R2. 可用按鈕 registry 來源(facade 真實返回型 grep)

**grep**:`server/src/model/facade/sys_menu.rs` —— `list_active_all(db) -> Result<Vec<Model>, DbErr>`(line 81);`entity/src/sys_menu.rs:28 pub buttons: Option<Json>`。

**Decision**:getAllButtons = `sys_menu::list_active_all` → 各 Model 解析 `buttons` JSON(`Vec<MenuButton{code,desc}>`)→ flatten → **dedup by code** → `Vec<{code, desc}>`(對照 `get_all_pages` 的聚合風格)。
**Rationale**:K1 per-menu 來源;active-only 自動排除軟刪選單(FR-003)。
**Alternatives**:`CANONICAL_BUTTONS` 常數(rejected:K1 要 per-menu 真實按鈕、且要 runtime 可由 menu-operate-modal 擴充)。

## R3. role code 解析(facade grep)

**grep**:`server/src/model/facade/sys_role.rs:51 find_active_by_id(db,id) -> Result<Option<Model>, DbErr>`;`handler/system_manage.rs:123-142 de_role_id`(RoleIdRaw untagged number|string → i64)。
**Decision**:getRoleButton / updateRoleButton 沿 021:`de_role_id` 解 roleId → `find_active_by_id().code` → policy v0 用 **code**(非 id)。**Rationale**:逐字鏡像 021,降風險。

## R4. getUserInfo.buttons 改源 + union order(wire 3 端對齊)

**grep**:`handler/auth.rs:196 UserInfo{user_id,user_name,roles,buttons:Vec<String>}`(camelCase)、`:254 buttons = buttons_for_roles(&roles)`;base-web `typings/api/auth.d.ts:17 buttons: string[]`;`store/modules/auth buttons:[]`;`hooks/business/auth.ts:12 includes`。
**Decision**:`getUserInfo` 改 `buttons = button_auth::buttons_for_roles_via_casbin(&enforcer, &roles)`(union over active roles 的 `(role,*,'button')` codes,**deterministic order**)。**UserInfo struct 不改**(仍 `Vec<String>`)。
**Union order**:以**可用按鈕 registry 順序**(sys_menu order → 各 menu buttons 陣列序)為 canonical,union 後依此序輸出 → 穩定、可逐字斷言。B_CODE 來自 toggle-auth menu(order 靠後)、user:* 來自 manage_user menu(order 靠前)。**回歸**:seed 後三角色 getUserInfo.buttons 對 data-model §「新基線」逐字。
**Alternatives**:沿 `CANONICAL_BUTTONS` 字典序(rejected:新增 user:* 後需可預測序、以 registry 序最自然)。
**3 端對齊**:rust `Vec<String>` ↔ base-web `string[]` ↔ `userInfo.buttons.includes(code)` —— 形狀不變、零型 drift。

## R5. base-web modal + pilot gating(命名/送出形 grep)

**grep**:`button-auth-modal.vue` —— `ButtonConfig{id,label,code}`、`getAllButtons()` stub 10 筆、`getChecks()` stub `[1,2,3,4,5]`(number[])、NTree `key-field="id"`、**`init()` 在 setup 立即跑**(非 watch visible)、無 home;由 `role-operate-drawer.vue:128` `v-if="isEdit"` 觸發。
**Decision(C1 key-on-code)**:改 `ButtonConfig` → `{code, label/desc}`、`checks: string[]`、NTree `key-field="code"`、**`init()` 改 `watch(visible)`**(對齊 menu-auth-modal、每次開以當前 roleId 重載);3 placeholder 接 `fetchGetAllButtons` / `fetchGetRoleButton(roleId)` / `fetchUpdateRoleButton(roleId, checks)`。
**Rationale**:Casbin grant 以 code 為鍵、MenuButton 無 id → key-on-code 最直、免造合成 id;watch visible 修 stub 的 setup-once bug。

**grep**:`views/manage/user/index.vue` —— row `编辑`(`common.edit`)/`删除`(`common.delete`,NPopconfirm)inline;toolbar `新增`/`批量删除` 在共用元件 `components/advanced/table-header-operation.vue`(`@add`/`@delete`,已有 `:disabled-delete` prop)。
**Decision(pilot gating)**:row `编辑`→`v-if="hasAuth('user:edit')"`、`删除`→`hasAuth('user:delete')`(index.vue inline,直接);toolbar `新增`→table-header-operation **加附加 `show-add` prop**(預設 true → 不影響 role/menu 頁),用戶頁傳 `:show-add="hasAuth('user:add')"`。**批量删除本波不 gate**(留後續,避免改共用元件刪除鈕語意)。
**Rationale**:row 鈕 inline 最小改;共用元件用附加 prop + 安全預設守 MODAL-WIRING v1.3.0 紀律。

## R6. toggle-auth 救活(elegant route 對齊 + getUserRoutes 基線 grep)

**grep**:`base-web/src/router/elegant/routes.ts` —— parent `function`(`/function`,`layout.base`,i18n `route.function`,icon `icon-park-outline:all-application`)+ child `function_toggle-auth`(`/function/toggle-auth`,`view.function_toggle-auth`,i18n `route.function_toggle-auth`=「切换权限」,icon `ic:round-construction`,order 4);getUserRoutes 基線源 = migration 010(9 menu policy);constant_routes = login/403/404/500/iframe-page(`route/menu.rs`)。
**Decision**:migration 022 seed sys_menu 2 row(function 父 menu_type=1 + function_toggle-auth 子 menu_type=2,**route_path/component/i18n_key 逐字對齊 elegant route**否則前端 resolve 不到)+ casbin menu policy `(role, function|function_toggle-auth, 'menu')` × 三角色 → getUserRoutes 三角色新增 function>toggle-auth 節點。
**基線 re-base**:新 getUserRoutes 逐字基線 = 021 基線 + function(含 toggle-auth)節點(三角色皆得,C2);per-role home 不受影響(toggle-auth 非 home)。
**Rationale**:§I.2 v1.3.0 例外授權;sys_menu seed 對齊 elegant route 確保 SPA resolve。

## R7. 範圍 / 無新 crate / prod build

**Decision**:022 **不新增 workspace crate**(只加 module `auth/button_auth.rs` 到既有 server crate + migration 檔到既有 migration crate)→ CLAUDE.md §3「加 crate 須 prod image build」**不適用**;acceptance 仍可選跑 prod image build 但非強制。
**無新 dep**(對照 021 tokio-stream 已落地、redis pub-sub 共用)。

## R8. CDP smoke 計劃(defer 風險自覺)

**Decision**:C-V 含 CDP browser click-through —— ① 用戶管理頁(收回/指派 user:delete → 該角色 row 刪除鈕有/無)② toggle-auth(三角色各見對應 B_CODE 鈕)。**一併補 021 menu-auth-modal CDP click-through**(同 /manage/role 頁、同 harness,清 021 §2.25 defer)。
**風險**:若 CDP defer(headless 無 :9229),curl 雙路徑(:21081 直連 + :21080 /api proxy)+ typecheck 為 fallback,但 button gating 的視覺效果**唯有 CDP 能證**(curl 驗 getUserInfo.buttons、不驗 v-if 渲染)→ **本波優先實跑 CDP**(user 正用瀏覽器、:9229 可用,見 docs/superpowers/000 §5)。

## 未決(交 data-model.md 拍板)

- 精確 pilot 按鈕碼字串 + desc(`user:add/edit/delete`)→ data-model §1。
- 三角色 button grant 分布(讓可見差異)→ data-model §3。
- getUserInfo.buttons 新逐字基線(三角色)→ data-model §4 + contracts。
