# 022-manage-button-auth — Phase 0 Brainstorm（findings checkpoint，spec-design 待新 session）

> **狀態**:brainstorm **未定案** —— 這輪(2026-06-03,接 021 收尾後)挖出兩個地基問題、探索了方向,user 親決「**收尾發現、完整 spec-design 開新 session 做**」(clean context + 需深挖 base-web button/mock model)。本檔是新 session 的起點,**非**最終設計。
> 工作流見 [CLAUDE.md §3](../../CLAUDE.md);brainstorm 慣例同 [`021-manage-menu-auth.md`](021-manage-menu-auth.md)。

## 1. Feature 意圖

**ButtonAuth = 角色×按鈕權限 runtime 編輯** —— 021 MenuAuth 的直系兄弟,完成角色管理頁的最後一塊(role CRUD〔018〕+ menu 可見性〔021〕+ **button 權限〔022〕**)。把僅存的程式內硬編權限(`rust-api/server/src/auth/buttons.rs` 的 role→button-code map)變維運期可編輯,接 base-web 已有的 `button-auth-modal.vue` placeholder。

## 2. Grounding findings(這輪 grep 實證)

### 2.1 base-web `button-auth-modal.vue`(等接線的 placeholder)
- props `roleId: number`(同 menu-auth-modal)。**3 placeholder**(無 home):
  - `getAllButtons()` → `tree: ButtonConfig[]`,`ButtonConfig = { id: number; label: string; code: string }`(現寫死 10 筆 stub `{id:1..10, label:'button1..', code:'code1..'}`)= **可用按鈕清單**。
  - `getChecks()` → `checks: number[]`(現寫死 `[1,2,3,4,5]`)= 該角色已勾的按鈕 **id**(NTree `key-field="id"`)。
  - `handleSubmit()` → 存 checks。
- → modal 用按鈕 **id**(number)勾選、每按鈕帶 **code**(string)。

### 2.2 rust 現況(buttons = 硬編抽象 code、無 registry)
- `server/src/auth/buttons.rs`:`buttons_of_role(role)` 硬編 `R_SUPER→[B_CODE1,2,3] / R_ADMIN→[B_CODE2,3] / R_USER_COMMON→[B_CODE3]`;`buttons_for_roles(roles)→Vec<String>`(union、canonical order)。
- `handler/auth.rs` getUserInfo:`buttons = buttons_for_roles(&roles)` → `{userId,userName,roles,buttons}`。
- `entity/sys_menu.rs`:`buttons: Option<Json>`;**migration 018 seed 全 6 menu buttons = NULL**(沒定義任何真實按鈕)。
- base-web `MenuButton = { code: string; desc: string }`(**無 id**);`Menu.buttons?: MenuButton[] | null`。

### 2.3 ★ 地基問題 1:無「可用按鈕 registry」
021 能照抄是因 `sys_menu`(6 真選單 + 010 的 9 行 policy)早建好;ButtonAuth **無對應現成地基** —— buttons 是抽象 mock code、sys_menu.buttons 全 NULL、modal 是 stub。modal 要 `{id,label,code}` 帶**穩定 id**,但 MenuButton 無 id。

### 2.4 ★★ 地基問題 2(關鍵):base-web 只有 demo 頁消費按鈕 code
- `hooks/business/auth.ts` `hasAuth(code)` = `userInfo.buttons.includes(code)`。
- **唯一真正用 hasAuth 的是 demo 頁** `views/function/toggle-auth/index.vue`:`v-if="hasAuth('B_CODE1')"` / `'B_CODE2'`(超管/admin 可見)。
- **業務頁(manage/user·role·menu)完全沒用 hasAuth** —— 按鈕一律顯示、不 gate by code。
- toggle-auth 是 **demo menu(`function/*`)**:不在 6 個 seed 業務選單、dynamic mode 不送進 nav。
- **含義**:「按鈕綁業務選單」會定義出**沒有消費者**的按鈕(業務頁不 gate)→ grant 了無視覺效果;唯一能端到端 demonstrate 的是 toggle-auth demo 的 B_CODE1/2/3。

## 3. 探索過的方向

- **A 最小・對齊現有 mock**:小 `sys_button` registry(id/code/desc,seed B_CODE 集)+ Casbin grant `(role, code, 'button')` + getUserInfo 讀 Casbin。範圍小、可驗(toggle-auth demo 反映 grant)。
- **B 按鈕綁選單(完整 RBAC)** ← **user 初選**:sys_menu.buttons 填 per-menu 按鈕 + 可用按鈕=全選單聚合 + Casbin grant。較貼 base-web 資料模型(Menu.buttons),但**撞上地基問題 2**(業務頁無消費者、seed buttons 全 NULL、toggle-auth menu 不在 sys_menu)。
- **C checkpoint** ← **user 終選**:鑑於地基比 021 murky + 需深挖 + context 已 ~65%,把發現存檔、spec-design 新 session 做。

## 4. 待新 session spec-design 拍板的 open questions

1. **按鈕 registry 來源 / 誰消費**:per-menu buttons 從哪 seed(含 toggle-auth menu 是否納入 sys_menu?)?可用按鈕=sys_menu.buttons 聚合 vs 新 sys_button 表?**唯一現成消費者是 toggle-auth demo 的 B_CODE1/2/3** —— registry 要不要至少含這組以保可驗?
2. **id↔code 對映**:MenuButton 無 id、modal 要 id key-field。穩定 id 怎麼派(聚合枚舉序?新表 PK?)— 類比 021 的 menu id↔route_name。
3. **getUserInfo.buttons 回歸**:現 B_CODE1/2/3 是唯一被消費的 code(toggle-auth)。保留→可驗;改真實 per-menu code→**無消費者、無視覺效果**(業務頁不 hasAuth)。回歸鐵律(同 021 getUserRoutes 逐字基線)要對齊哪組 code?
4. **驗證策略**:getUserInfo.buttons 反映 grant(curl)+ 唯一真 e2e = toggle-auth demo(B_CODE1/2/3)。CDP 怎麼驗(toggle-auth 在 demo menu、dynamic nav 不送 → 怎麼到達該頁)?
5. **機制**:Casbin policy `(role, button_code, 'button')` 鏡像 021 menu(高重用)vs 新表。**強烈傾向 Casbin**(重用 021 全套)。
6. **自鎖 guard**:button 非 nav access、likely **N/A**(brainstorm 確認)。
7. **範圍邊界**:是否要順帶把業務頁接 hasAuth(觸多頁、可能 out)?還是只交「grant 機制 + getUserInfo + modal + demo 驗」?

## 5. 可重用 021 資產(若走 Casbin 機制)

`set_role_menu` pattern(`remove_filtered_policy`+`add_policies` stock adapter)→ `set_role_button`;**`policy_watcher` redis 失效共用同一 `casbin:policy:invalidate` channel**(零新增);MODAL-WIRING pattern;roleId→code 解析(`de_role_id`、find_active_by_id.code);**getUserInfo.buttons 逐字回歸**紀律(同 021 getUserRoutes 基線);C-V acceptance pattern。

## 6. 可一併處理的 021 follow-up(CHECKLIST §2.25)

- **stale `#[allow(dead_code)]`**(`find_active`/`roles_for_user` + §2.24 `normalize_page`):022 會動 sys_role.rs / sys_user_role.rs / system_manage.rs → 「動該檔順手清」。
- **021 menu-auth-modal CDP browser click-through(defer)**:022 對 button-auth-modal 跑 CDP 時,**同一 /manage/role 頁、同一 harness** → 一次補 menu-auth + button-auth 兩 modal 的 click-through,清掉 021 的 CDP defer。

## 7. 新 session 建議起手

1. 深挖 base-web mock/button model(`function/toggle-auth`、mock §4.4、Menu.buttons 在 menu-operate-modal 的編輯路徑)確認真實 code 與消費鏈。
2. 拍板 §4 open questions(尤其 #1/#3 —— registry 來源 + 哪組 code 是回歸基線)。
3. 續 brainstorming → present design → 寫完整 spec-design(本檔)→ `/speckit-specify`(建 022 feature branch)→ plan/tasks/analyze → `superpowers:executing-plans` 實作。
