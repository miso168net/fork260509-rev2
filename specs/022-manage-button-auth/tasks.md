---
description: "Task list — 022 Button Permission Authorization"
---

# Tasks: Button Permission Authorization (022)

**Input**: Design documents from `/specs/022-manage-button-auth/`
**Prerequisites**: plan.md ✅ / spec.md ✅ / research.md ✅ / data-model.md ✅ / contracts/ ✅
**Tests**: 純函式單元測試(button_auth 機制:HARD REPLACE / union 字典序 / dedup)—— plan 明示;wiring / 形狀類無純函式者由 contracts/verification-commands.md C-V 覆蓋(curl + psql + CDP)。
**Organization**: 依 spec user story(US1 P1 / US2 P2 / US3 P3)。**雙倉**:`rust-api/`(worktree `rev2-admin-rust-api`)+ `base-web/`(worktree `rev2-admin-base-web`)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:不同檔、無未完成依賴 → 可平行
- **[Story]**:US1 / US2 / US3(Setup / Foundational / Polish 無 story label)

## 機制鏡像來源(實作時對照,勿盲信本檔命名)
- `rust-api/server/src/auth/menu_auth.rs`(021)→ 鏡像成 `button_auth.rs`(`'menu'`→`'button'`、route_name→code、**去自鎖**)
- `rust-api/server/src/auth/policy_watcher.rs`(redis `casbin:policy:invalidate`,共用、零新增)
- `rust-api/server/src/handler/system_manage.rs`(021 getRoleMenu/updateRoleMenu + `de_role_id`)
- `base-web/src/views/manage/role/modules/menu-auth-modal.vue`(021 modal 接線 pattern,**watch visible**)

---

## Phase 1: Setup

- [ ] T001 確認前置:`rust-api/` worktree 在 `rev2-admin-rust-api`、`base-web/` 在 `rev2-admin-base-web`;dev stack up(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`);migration 已套至 021 baseline(`docker compose run --rm migrate up`);三角色 getUserInfo.buttons 現為 `[B_CODE...]`(改源前 baseline 記錄供 US3 對照)。

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**:US1/US2/US3 皆依賴本階段;完成前不得開 user story 工作。

- [ ] T002 [P] 建 migration `rust-api/migration/src/m20260529_000022_seed_button_auth.rs`(並註冊 `migration/src/lib.rs`):依 [data-model §1.1/§1.2/§2/§3] —— (a) sys_menu INSERT `function`(menu_type=1)+ `function_toggle-auth`(menu_type=2、buttons JSON `[B_CODE1/2/3 + desc]`、route_path/component/i18n_key 逐字對齊 base-web elegant route);(b) UPDATE `manage_user.buttons` = JSON `[user:add/edit/delete + desc]`;(c) casbin button policy 9 列(R_SUPER:B_CODE1/2/3+user:add/edit/delete、R_ADMIN:B_CODE2/3+user:edit、R_USER_COMMON:B_CODE3);(d) casbin menu policy 6 列(function + function_toggle-auth × 三角色)。**up/down 對稱可逆**;down 精準刪(不踩 010/017/019/020/021 policy,by v1/v2 過濾)。
- [ ] T003 [P] 建 `rust-api/server/src/auth/button_auth.rs`(鏡像 `menu_auth.rs`、註冊 `auth/mod.rs`):`get_role_button_codes(enforcer, role_code) -> Vec<String>`(`get_filtered_policy(0,[role,"","button"])`)/ `replace_role_button_policies(...)`(`remove_filtered_policy(0,[role,"","button"])` + `add_policies`、HARD REPLACE、空集 Ok(false) 非錯)/ `set_role_button(state, role_code, codes, operator)`(write-lock + before 快照 + 011 audit + `publish_policy_invalidate`)/ `buttons_for_roles_via_casbin(enforcer, &roles) -> Vec<String>`(union over roles、**dedup + code 字典序**)。**無自鎖 guard**(button 非 nav access)。[research R1, data-model §8]
- [ ] T003a [P] 純函式單元測試(`button_auth.rs` #[cfg(test)],in-memory enforcer 鏡像 021):HARD REPLACE 只清該 role v2='button' 列不碰 'menu'/endpoint;`add_policies` 空集 Ok(false);`buttons_for_roles_via_casbin` union dedup + 字典序(B_CODE 子序保留、`B_*`<`user:*`)。
- [ ] T004 改 `rust-api/server/src/handler/auth.rs` getUserInfo:`buttons` 由 `crate::auth::buttons::buttons_for_roles(&roles)` 改 `crate::auth::button_auth::buttons_for_roles_via_casbin(&enforcer, &roles)`(`UserInfo` struct 不改、仍 `Vec<String>`)。依賴 T003。[data-model §4](回歸基線逐字驗證在 US3/T013)

**Checkpoint**:`dcargo build -p server` 綠 + T003a 測試綠 + migration 022 up→down→up 可逆(throwaway DB)。

---

## Phase 3: US1 (P1) — 角色×按鈕編輯 + pilot 用戶頁生效

**Goal**:Super 設定某角色可用按鈕(硬替換、即時),該角色於用戶管理頁只見被授權操作鈕。
**Independent Test**:curl `updateRoleButton(roleId=2, [...+user:add])` → Admin getUserInfo.buttons 即時含 user:add(無重啟);CDP Admin 登入 /manage/user 見 编辑、不見 删除/新增(無 user:delete/add)。

- [ ] T005 [US1] 加 `rust-api/server/src/handler/system_manage.rs`:`get_role_button`(GET `?roleId`、`de_role_id`、`find_active_by_id().code` → `get_role_button_codes`、`Res<Vec<String>>` 字典序)+ `update_role_button`(POST `{roleId,codes}`、Super-only enforce_mw、operator 由 015 ctx〔None→5000〕、**非法 code(不在 getAllButtons registry)→2222**、`set_role_button` HARD REPLACE、`Res<()>`);4... 2 route 掛 enforce_mw + casbin seed 已於 T002 給。依賴 T003。[data-model §6, contracts §2]
- [ ] T006 [P] [US1] 加 `base-web/src/service/api/rev2-system-manage.ts`:`fetchGetRoleButton(roleId)`(get、params roleId)+ `fetchUpdateRoleButton(roleId, codes)`(post、data {roleId,codes})。[data-model §6]
- [ ] T007 [P] [US1] pilot gating(MODAL-WIRING ★ v1.3.0、逐處記 file:line + upstream 風險):`base-web/src/views/manage/user/index.vue` row `编辑`→`v-if="hasAuth('user:edit')"`、`删除`→`hasAuth('user:delete')`;`base-web/src/components/advanced/table-header-operation.vue` 加 `show-add?: boolean`(預設 true)包 `新增` 鈕;`user/index.vue` toolbar 傳 `:show-add="hasAuth('user:add')"`。依賴 T004(getUserInfo 須回 user:*)。[data-model §7]

**Checkpoint US1**:contracts §2 curl round-trip 綠(updateRoleButton 即時反映、非法 code 2222、空集 Ok、roleId number|string、Super-only 5003/3333、redis reload)+ CDP 用戶頁 gating 視覺(Admin 缺 删除/新增、Super 全)。

---

## Phase 4: US2 (P2) — per-menu 按鈕來源聚合(registry)+ modal

**Goal**:可用按鈕清單 = 各選單 `sys_menu.buttons` 聚合;button-auth-modal 顯 registry 並可編輯。
**Independent Test**:`getAllButtons` 回 6 碼字典序(已軟刪選單按鈕不出現);modal 開啟顯 registry、勾選提交。

- [ ] T008 [US2] 加 `rust-api/server/src/handler/system_manage.rs`:`get_all_buttons`(Super-only、`sys_menu::list_active_all` → 各 row `buttons` JSON flatten → **dedup by code** → `Res<Vec<ButtonItem{code,desc}>>` 字典序);零 `entity::`(009 lint、收原始欄非 Model)。[data-model §1.3, research R2]
- [ ] T009 [P] [US2] 加 `base-web/src/service/api/rev2-system-manage.ts`:`fetchGetAllButtons()`(get、`request<ButtonItem[]>`)。[data-model §6]
- [ ] T010 [US2] 接線 `base-web/src/views/manage/role/modules/button-auth-modal.vue`(MODAL-WIRING ★):`getAllButtons`→`fetchGetAllButtons`、`getChecks`→`fetchGetRoleButton(roleId)`、`handleSubmit`→`fetchUpdateRoleButton(roleId, checks)`;**`ButtonConfig→{code,label/desc}`、`checks: string[]`、NTree `key-field="code"`、`init()` 改 `watch(visible)`**(對齊 menu-auth-modal、每次開以當前 roleId 重載);`!error` 才成功 toast。依賴 T005/T006/T008/T009。[research R5, data-model §6/§7]

**Checkpoint US2**:contracts §1 getAllButtons 綠 + CDP 編輯角色→菜单权限→modal 顯 registry + 勾選提交(updateRoleButton)。

---

## Phase 5: US3 (P3) — 既有 B_CODE 零退化 + toggle-auth 救活

**Goal**:getUserInfo.buttons 既有 B_CODE 分布逐字保留;toggle-auth demo 救活、三角色各見對應按鈕。
**Independent Test**:三角色 getUserInfo.buttons 對 [data-model §4] 新基線逐字;三角色 /function/toggle-auth 可達、各見 B_CODE。

- [ ] T011 [US3] `rust-api/server/src/auth/buttons.rs` 退場/改測:matrix 來源已由 T004 遷 Casbin → `buttons_for_roles` 若無 caller 則移除(+ `buttons.rs` 7 單元測試);若保留為回歸對照,改斷言對齊 [data-model §4] 新基線。確認無孤兒 import / dead_code。
- [ ] T012 [US3] 驗 getUserInfo.buttons 三角色逐字新基線(contracts §3:Super `[B_CODE1,B_CODE2,B_CODE3,user:add,user:delete,user:edit]` / Admin `[B_CODE2,B_CODE3,user:edit]` / User `[B_CODE3]`)+ getUserRoutes **re-base** 驗(contracts §4:三角色各 +function/toggle-auth、getConstantRoutes 不變、per-role home 不受影響)。acceptance(migration T002 + getUserInfo T004 已實作)。
- [ ] T013 [US3] CDP toggle-auth 救活(contracts §5②):三角色登入 → nav 出现「切换权限」→ /function/toggle-auth 可達 → 各见对应 B_CODE 钮(Super 三、Admin B_CODE2/3、User B_CODE3)。

**Checkpoint US3**:getUserInfo 新基線逐字 + getUserRoutes re-base + toggle-auth 三角色 CDP 全綠。

---

## Phase 6: Polish & Cross-Cutting

- [ ] T014 [P] 清 021 §2.25 stale `#[allow(dead_code)]`(`find_active` / `roles_for_user` / 020 §2.24 `normalize_page`)—— 022 動 sys_role.rs/sys_user_role.rs/system_manage.rs「動該檔順手清」;確認移除後 `dcargo build`/test 綠。
- [ ] T015 holistic C-V acceptance:跑 contracts/verification-commands.md 全節(US1/US2/US3 + migration up→down→up + 守恆〔server 單測 + entity_access_lint 17 + 零 `entity::` + `Migrator::up` 0〕+ 回歸 013/019/020/021)+ **順補 021 menu-auth-modal CDP browser click-through**(同 /manage/role 頁同 harness,清 021 §2.25 defer)。
- [ ] T016 文件回填:DESIGN §10 Phase 4「ButtonAuth」as-built 段 + plan Complexity Tracking 對齊實作(若偏離);更新 022 spec/plan 收尾標記(留待 finishing 階段)。

> **★ 紀律**:本 tasks.md **不含 `git push` / `git merge`**(constitution §I.4 / CLAUDE.md §3:凍結至 `superpowers:finishing-a-development-branch`)。subagent-driven-development 各單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality);worktree 內 commit OK、push/merge 收尾才做。

---

## Dependencies

```
Setup(T001)
  └─ Foundational(T002 migration ∥ T003+T003a button_auth → T004 getUserInfo 改源)
       ├─ US1(T005 handler → ; T006 fetch ∥ ; T007 gating〔需 T004〕)        ← P1 MVP(curl + 用戶頁 gating)
       ├─ US2(T008 getAllButtons → ; T009 fetch ∥ ; T010 modal〔需 T005/06/08/09〕)
       └─ US3(T011 buttons.rs 退場 ; T012 getUserInfo+routes 驗 ; T013 toggle-auth CDP)
  └─ Polish(T014 dead_code ∥ ; T015 holistic C-V + 021 CDP ; T016 docs)
```

- **US1 ⟂ US2 ⟂ US3**:三者皆建於 Foundational 之上;US1 curl-testable 不依賴 modal(T010);US2 完成 modal UI;US3 主為 acceptance(code 多在 Foundational)。
- 跨故事 file 共用:`system_manage.rs`(T005/T008)、`rev2-system-manage.ts`(T006/T009)→ 同檔不同段、序列化避衝突(非 [P] 跨彼此)。

## Parallel 範例

- Foundational:`T002`(migration)∥ `T003+T003a`(button_auth)—— 不同檔。
- US1:`T006`(fetch)∥ `T007`(gating)—— 不同檔;`T005`(handler)先(T007 需 T004、T006 獨立)。
- Polish:`T014`(dead_code)∥ 其餘驗證前置。

## MVP 範圍

**US1(P1)** = MVP:Foundational + T005/T006/T007 → curl 編輯按鈕即時反映 getUserInfo + 用戶管理頁 hasAuth gating 端到端生效(toggle-auth〔US3〕、modal UI〔US2〕為增量)。

## 實作策略

1. Foundational 先(T002-T004)→ build/測試/migration 可逆 checkpoint。
2. US1 → MVP checkpoint(curl + CDP 用戶頁 gating)。
3. US2 → modal UI checkpoint。
4. US3 → 回歸基線 + toggle-auth checkpoint。
5. Polish → dead_code 清 + holistic C-V + 021 CDP 補 → `superpowers:finishing-a-development-branch`(多段式 commit + merge --no-ff,**此階段才 push/merge**)。
