# 022-manage-button-auth — Phase 0 Brainstorm spec-design（DEFINED，待 /speckit-specify）

> **狀態**:brainstorm **已定案**（2026-06-03,接 021 收尾後 → grounding workflow 對抗驗證 → 4 keystone 親決 → 設計骨架 user 核可）。本檔為 `/speckit-specify` 的輸入 spec-design。
> 工作流見 [CLAUDE.md §3](../../CLAUDE.md);brainstorm 慣例同 [`021-manage-menu-auth.md`](021-manage-menu-auth.md)。

## 1. Feature 意圖

**ButtonAuth = 角色×按鈕權限 runtime 編輯** —— 021 MenuAuth 的直系兄弟,完成角色管理頁的最後一塊（role CRUD〔018〕+ menu 可見性〔021〕+ **button 權限〔022〕**）。把僅存的程式內硬編按鈕權限（`rust-api/server/src/auth/buttons.rs` 的 role→button-code map）變維運期可編輯,接 base-web 已有的 `button-auth-modal.vue` placeholder;並把「指派了按鈕沒地方生效」的地基缺口補成**端到端有效果**（pilot：用戶管理頁）。

## 2. Grounding findings（grounding workflow 對抗驗證 ✅ CONFIRMED）

### 2.1 4 個設計地基宣稱全部 CONFIRMED（窮舉證據）
1. **toggle-auth demo 是唯一消費 button code（hasAuth）處**:`hasAuth` 只定義一次（`base-web/src/hooks/business/auth.ts:6`,`userInfo.buttons.includes(code)`）、只被 `views/function/toggle-auth/index.vue` import、全 src 僅 3 個呼叫（`B_CODE1/2/3` @ index.vue:93-95）。業務頁 manage/user·role·menu **完全沒 gate** 按鈕。
2. **sys_menu.buttons seed 全 NULL**:migration 018 的 6 個 seed row INSERT 欄位清單不含 `buttons` → 全取 NULL;無其他 migration 寫入。
3. **後端對按鈕完全不 enforce**:buttons 純是 getUserInfo 廣告欄（`buttons.rs` 硬編 matrix → `handler/auth.rs:254` 塞進 `UserInfo`）;無 button 層 Casbin / 中介層。**022 只需改其來源（硬編 → 可編輯）,無需新增 button enforce mw**。
4. **回歸基線 = B_CODE1/2/3**:`buttons.rs:17-19` R_SUPER→[1,2,3] / R_ADMIN→[2,3] / R_USER_COMMON→[3],7 個單元測試釘死,`CANONICAL_BUTTONS=[B_CODE1,B_CODE2,B_CODE3]`。

### 2.2 其他關鍵事實
- **toggle-auth 在 rev2 目前已死、不可達**（CDP 實測:Super 導 `/function/toggle-auth` → title `not-found`;nav 僅 `["首页","系统管理"]`）。因 toggle-auth 是 `function/*` 動態路由（elegant routes 有、**無 `constant:true`**）、**不在 sys_menu 6 seed 選單**、**無對應 Casbin menu policy** → getUserRoutes 過濾後剪掉。故 B_CODE1/2/3 雖在 getUserInfo 回傳卻**無可達消費者**。
- **button-auth-modal.vue 是 stub**:`ButtonConfig={id,label,code}`、`getAllButtons()` 寫死 10 筆、`getChecks()` 寫死 `[1,2,3,4,5]`（number[]）、`handleSubmit()` 只 console.log;NTree `key-field="id"`;**`init()` 在 setup 立即跑（非 watch visible）**;無 home（對照 menu-auth-modal 有 home）。由 `role-operate-drawer.vue:128` 在 `v-if="isEdit"` 區觸發（同 menu-auth）。
- **MenuButton 無 id**:`typings/api/system-manage.d.ts:72` `MenuButton={code,desc}`;`Menu.buttons?: MenuButton[]|null`。menu-operate-modal.vue 可編 `sys_menu.buttons`（NDynamicInput + `handleCreateButton()→{code,desc}`）。
- **用戶頁可 gate 的鈕**:row inline（`manage/user/index.vue`）`编辑`/`删除`;toolbar（**共用元件** `components/advanced/table-header-operation.vue`）`新增`/`批量删除`（`@add`/`@delete` event,已有 `:disabled-delete` prop）。
- **getUserRoutes 基線源** = migration 010（`seed_menu_policy.rs`）9 行 `(role, route_name, 'menu')`:home×3 / manage_user×(super,admin) / manage_user-detail×(super,admin) / manage_role×super / manage_menu×super。021 contracts 記逐字基線於 [`specs/021-manage-menu-auth/contracts/verification-commands.md`](../../specs/021-manage-menu-auth/contracts/verification-commands.md)。
- **`function` parent route**:`name:'function', path:'/function', component:'layout.base', i18nKey:'route.function'`;child `function_toggle-auth`（`/function/toggle-auth`,`view.function_toggle-auth`,i18nKey `route.function_toggle-auth`=「切换权限」）。
- **UserInfo struct**（`handler/auth.rs:196`,camelCase）:`{userId, userName, roles, buttons:Vec<String>}` —— 022 不改 struct、只改 `buttons` 來源。

## 3. 拍板決策（4 keystone,user 親決）

| # | 決策 | 選擇 |
|---|---|---|
| **K1 按鈕來源** | 抽象 3 碼 vs per-menu 真實按鈕 | **B：per-menu 真實按鈕**（`sys_menu.buttons` 定義 → 聚合成可用清單 → 指派角色） |
| **K2 生效範圍** | 全業務頁 / 1 頁 pilot / 不改頁 | **1 頁 pilot = 用戶管理頁**（其餘業務頁的 button gating 留後續 feature） |
| **K3 舊 demo** | 退役 B_CODE vs 保留 | **保留 B_CODE1/2/3 + 真實按鈕另加** |
| **K4 toggle-auth** | 不救（純基線保留）vs 救活 | **救活**：加進 sys_menu + Casbin menu policy 讓 B_CODE demo 重跑 |

**★ 設計細節預設（user 核可骨架時一併接受）**:
- **C1 modal key-on-code**:button-auth-modal NTree 改 `key-field="code"`、`checks: string[]`（放棄 stub synthetic id —— Casbin grant 以 code 為鍵、MenuButton 無天然 id、聚合枚舉序號不穩）。
- **C2 toggle-auth 三角色都可達**:function / function_toggle-auth 的 Casbin menu policy 給 R_SUPER/R_ADMIN/R_USER_COMMON 三角色（各自看到自己有權的 B_CODE 鈕）。
- **C3 pilot 按鈕碼**:`manage_user.buttons` seed `user:add` / `user:edit` / `user:delete`（對齊用戶頁操作鈕;最終碼/desc 於 /speckit-specify 對齊）。pilot 指派分布讓三角色有可見差異（例：Super 全給、Admin 給 edit、User 不給）。

## 4. 設計（DEFINED）

### A. 機制（照抄 021,零新表、零新 crate）
- Casbin 加**第三類 policy** `(ptype='p', v0=role_code, v1=button_code, v2='button')`（現有 `'menu'` / endpoint 兩類旁;鏡像 `menu_auth.rs` 的 `'menu'` 列模型）。
- 新 `server/src/auth/button_auth.rs`（鏡像 `menu_auth.rs`）:
  - `get_role_button_codes(enforcer, role_code)` ← `get_filtered_policy(0,[role,"","button"])`
  - `replace_role_button_policies(...)` = `remove_filtered_policy(0,[role,"","button"])` + `add_policies`（stock adapter、**HARD REPLACE**;空集 → `add_policies` 回 `Ok(false)` 非錯誤）
  - `set_role_button(state, role_code, codes, operator)`
  - **無 self-lock guard**（button 非 nav access、N/A;對照 021 `menu_set_locks_out_super` 不移植）
- `getUserInfo.buttons` 改讀 Casbin（union over user's active roles,**deterministic order** —— 取代 `buttons_for_roles` 硬編）。
- 失效通知**共用** 021 的 redis `casbin:policy:invalidate`（`policy_watcher.rs`,零新增）。

### B. 資料模型 / seed（單一 migration 022,無新 crate）
1. **sys_menu INSERT**：`function`（parent,menu_type=1 目錄,i18n `route.function`,icon `icon-park-outline:all-application`）+ `function_toggle-auth`（child,menu_type=2,component `view.function_toggle-auth`,i18n `route.function_toggle-auth`,`buttons` = JSON `[{code:"B_CODE1",desc},{code:"B_CODE2",desc},{code:"B_CODE3",desc}]`）。→ 救活 toggle-auth。
2. **sys_menu UPDATE**：`manage_user.buttons` = JSON `[{code:"user:add",desc},{code:"user:edit",desc},{code:"user:delete",desc}]`。
3. **Casbin menu policy INSERT**：`(role, 'function', 'menu')` + `(role, 'function_toggle-auth', 'menu')` × 三角色（C2）→ getUserRoutes 可達 toggle-auth。
4. **Casbin button policy INSERT**：
   - 逐字重現 B_CODE 分布：`(R_SUPER,B_CODE1/2/3,'button')` / `(R_ADMIN,B_CODE2/3,'button')` / `(R_USER_COMMON,B_CODE3,'button')`。
   - pilot user:* 分布（C3,讓三角色有差異）。
- **down**：反向刪除以上 4 類 seed。

### C. wire / 元件
- **rust handlers**（鏡像 021 getRoleMenu/updateRoleMenu,Super-only behind enforce_mw）:
  - `GET /systemManage/getAllButtons` → 聚合所有 active `sys_menu.buttons` → registry `[{code, desc}]`（對照 `get_all_pages` 的聚合風格）
  - `GET /systemManage/getRoleButton?roleId=` → 該角色 Casbin button codes（`de_role_id` 混型反序列化共用）
  - `POST /systemManage/updateRoleButton {roleId, codes}` → `set_role_button`（HARD REPLACE）
  - `getUserInfo` 改讀 Casbin button
- **base-web**:
  - `service/api/rev2-system-manage.ts` 加 `fetchGetAllButtons` / `fetchGetRoleButton(roleId)` / `fetchUpdateRoleButton(roleId, codes)`
  - `button-auth-modal.vue` 接 3 placeholder + **改 `key-field="code"`、`checks: string[]`、`init()` 改 watch visible**（對齊 menu-auth-modal）
  - **pilot**:`manage/user/index.vue` row `编辑`/`删除` 加 `v-if="hasAuth('user:edit')"` / `'user:delete'`;`新增` 經 `table-header-operation.vue` 新增**附加 prop**（如 `:show-add`,安全預設 true → 不影響 role/menu 頁）由用戶頁傳 `hasAuth('user:add')`。

### D. 回歸基線變動（★ 已知代價,K4 已選）
- **getUserInfo.buttons**:新基線 = 既有 B_CODE 分布（逐字保留）**+** 新 user:* grant（per 角色,順序 deterministic;確切值 /speckit-specify 定）。`buttons.rs` 7 單元測試隨來源搬遷改寫/退場。
- **getUserRoutes（021 基線）**:function/function_toggle-auth 進 sys_menu + menu policy → getUserRoutes 三角色各新增 function（含 toggle-auth）節點 → **021 的逐字 getUserRoutes 基線 re-base**（022 spec 定義新預期、含 per-role home 不變）。

### E. 驗證策略（C-V contract,鏡像 021）
- **單元測試**（純函式）:code↔grant 對映、union deterministic order、HARD REPLACE 冪等。
- **curl**:getUserInfo.buttons 反映 grant;getRoleButton/updateRoleButton round-trip;空集 HARD REPLACE。
- **CDP e2e**:① **用戶管理頁** —— 收回/指派 `user:delete` 給某角色,該角色登入後 row 刪除鈕有/無（真實 gate,**取代** toggle-auth 成主驗證點）;② **toggle-auth** —— 救活後三角色各見對應 B_CODE 鈕。
- migration 022 up→down→up 可逆（throwaway DB）;三角色 getUserRoutes/getUserInfo 對**新**基線;**無新 crate → 免 prod image build 那條**（CLAUDE.md §3,只動既有 server/migration crate）。

### F. 範圍 / 折疊 021 follow-up
- pilot 只 gate **用戶管理頁**（add/edit/delete）;角色/選單管理頁的按鈕「定義+可指派」但**暫不 gate**（後續 feature）。
- **自鎖 guard：N/A**（button 非 nav access;pilot 不 gate 角色頁的 buttonAuth 觸發鈕 → 無自鎖風險）。
- **折疊**:① 清 stale `#[allow(dead_code)]`（`find_active`/`roles_for_user`/`normalize_page`,因 022 動這些檔順手清）;② 021 menu-auth-modal 的 CDP browser click-through（021 defer）一併在 `/manage/role` 同頁同 harness 補（menu-auth + button-auth 兩 modal）。

## 5. 可重用 021 資產

`menu_auth.rs` 全套（`get_role_menu_route_names`/`replace_role_menu_policies`/`set_role_menu`）→ `button_auth.rs` 鏡像（`'menu'`→`'button'`、route_name→code、**去掉 self-lock**）;`policy_watcher` redis `casbin:policy:invalidate` 共用;`de_role_id` 混型反序列化;`find_active_by_id().code` 解析;MODAL-WIRING pattern;getUserInfo/getUserRoutes 逐字回歸紀律;C-V acceptance pattern;migration seed_*_policy 慣例（009/010/013/.../021 鏈）。

## 6. Phase 0 research 必 grep（/speckit-plan research.md,不信本檔命名假設）

- Casbin `remove_filtered_policy`/`add_policies`/`get_filtered_policy` 簽章 + auto_save 預設 + filtered field index（v0=role/v1=code/v2='button'）—— 對照 `menu_auth.rs` 實證。
- base-web button-auth-modal 送出形（checks → 改 string[] code;NTree checked-keys 型）;`table-header-operation.vue` 是否已有 add/delete 顯隱 prop（無則加附加 prop 的最小改法）。
- `getUserInfo` 改讀 Casbin 的 union order 決定點（與 `buttons_for_roles` canonical order 對齊或重定）。
- sys_menu seed 欄位順序（m018:parent_id/route_name/menu_type/menu_name/route_path/component/icon/icon_type/i18n_key/order/status/hide_in_menu/keep_alive/active_menu）+ buttons JSON 寫法（`.json_binary()`）。
- getUserRoutes 樹建構（`route/menu.rs` filter_routes + menu_visible enforce）確認加 function 節點後三角色逐字新基線;per-role home 不受影響。
- function/function_toggle-auth 的 elegant route meta（确认 sys_menu seed 的 route_path/component/i18n_key 對得上,否則前端 resolve 不到）。

## 7. 已親決（brainstorm 收束）

- 範圍 K2（pilot=用戶管理頁）/ 機制 A（Casbin、零新表、照抄 021）/ 按鈕來源 K1（per-menu）/ 舊 demo K3（保留 B_CODE）/ toggle-auth K4（救活）/ key-on-code C1 / 三角色可達 C2 / pilot 碼 C3。
- **無 constitution amendment 預期**（§I.2 menu/button 走 Casbin enforce —— button 為 getUserInfo 廣告非 enforce,但「可編輯權限走 Casbin policy」與 §I 一致;/speckit-plan Constitution Check 再確認 §IV）。

## 8. 新 session / 下一步起手

`/speckit-specify`（input＝本檔 → 建 `022-manage-button-auth` feature branch via `before_specify` pre-hook）→ `/speckit-clarify`(optional) → `/speckit-plan`（research.md 跑 §6 grep）→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`→`subagent-driven-development` 實作。
