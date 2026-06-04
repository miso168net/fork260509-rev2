---
description: "Task list — 024 ButtonAuth Rollout"
---

# Tasks: ButtonAuth Rollout (024)

**Input**: Design documents from `/specs/024-button-auth-rollout/`
**Prerequisites**: plan.md ✅ / spec.md ✅ / research.md ✅ / data-model.md ✅ / contracts/ ✅
**Tests**: **無新單元測試**(gating=既有 `hasAuth`、後端=seed migration 無邏輯、編輯迴路=022 已測〔button_auth.rs #[cfg(test)]〕)—— plan/data-model §5 明示理由;wiring/形狀類由 contracts/verification-commands.md C-V 覆蓋(CDP + psql + migration 可逆)。
**Organization**: 依 spec user story(US1 P1 / US2 P2 / US3 P3)。**雙倉**:`rust-api/`(migration only)+ `base-web/`(role/menu/user index.vue)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:不同檔、無未完成依賴 → 可平行
- **[Story]**:US1 / US2 / US3(Setup / Foundational / Polish 無 story label)

## 機制鏡像來源(實作時對照,勿盲信本檔命名,grep actual code)
- `rust-api/migration/src/m20260529_000022_seed_button_auth.rs`(022)→ 鏡像 section (2) UPDATE sys_menu.buttons + (3) casbin button policy;down 精準 by code/route_name
- `base-web/src/views/manage/user/index.vue`(022 gating 範式:toolbar `:show-add="hasAuth('user:add')"` + row operate column JSX `hasAuth('user:edit'/'user:delete')`)
- `base-web/src/hooks/business/auth.ts`(`useAuth().hasAuth(code)` = `authStore.userInfo.buttons.includes(code)`)
- `base-web/src/components/advanced/table-header-operation.vue`(`showAdd` prop、`v-if="showAdd !== false"`)
- `base-web/src/views/manage/role/index.vue`、`base-web/src/views/manage/menu/index.vue`(現無 gating、加之)
- 編輯迴路(零改動沿用):`getAllButtons`/`getRoleButton`/`updateRoleButton`/`set_role_button` + `button-auth-modal.vue`(registry 聚合自動涵蓋新碼)

---

## Phase 1: Setup

- [ ] T001 確認前置:`rust-api/` worktree 在 `rev2-admin-rust-api`、`base-web/` 在 `rev2-admin-base-web`;dev stack up(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`);migration 已套至 023 baseline(`run --rm migrate up`);**記錄改源前 baseline** 供回歸對照:`getAllButtons` 現 6 distinct codes(B_CODE1/2/3 + user:add/edit/delete)、casbin button policy 10 列(R_SUPER 6/R_ADMIN 3〔含 user:edit〕/R_USER_COMMON 1)、`manage_role`/`manage_menu`.buttons = NULL(FR-007 既有矩陣不變基準)。

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**:US1/US2 皆依賴本階段(role/menu 按鈕碼 registry + 初始授權);完成前不得開 user story 工作。

- [ ] T002 建 migration `rust-api/migration/src/m20260529_000024_seed_role_menu_button_auth.rs`(並註冊 `migration/src/lib.rs`):依 [data-model §2] —— (a) **registry**:2 條 `UPDATE sys_menu SET buttons = <JSON>::jsonb WHERE route_name='manage_role'|'manage_menu' AND deleted_at IS NULL`,manage_role=`[role:add 新增角色, role:edit 编辑角色, role:delete 删除角色]`、manage_menu=`[menu:add 新增菜单, menu:edit 编辑菜单, menu:delete 删除菜单]`(命名對齊 022 `user:*`);(b) **初始 casbin button policy** 只 R_SUPER 6 列(`('p','R_SUPER','role:add'|'role:edit'|'role:delete'|'menu:add'|'menu:edit'|'menu:delete','button','','','')`)、ON CONFLICT DO NOTHING;7-col 格式同 022。**down 精準**:`DELETE FROM casbin_rule WHERE ptype='p' AND v2='button' AND v1 IN (6 codes)`(★不踩 022 user:*/B_CODE*)+ `UPDATE sys_menu SET buttons=NULL WHERE route_name IN ('manage_role','manage_menu')`(grep 實證 pre-024 即 NULL)。up→down→up throwaway DB 可逆。**不建表**(§I.6 N/A)。鏡像 022 section (2)+(3)。

**Checkpoint**:`dcargo build -p migration` 綠 + migration 024 up→down→up 可逆(throwaway DB、022 button 10 列 + menu policy 存活、manage_role/manage_menu.buttons 還原 NULL)+ `getAllButtons` 套後回 12 codes(含 role:*/menu:*)。

---

## Phase 3: US1 (P1) — 角色頁寫按鈕經「按鈕權限」介面指派 + 即時生效

**Goal**:角色管理頁的寫按鈕(新增/編輯/刪除)成為可經「按鈕權限」modal 指派、即時生效(獲授予才顯)的按鈕權限。
**Independent Test**:Super 開某角色「按鈕權限」modal → 列出 role:*(可勾)→ 勾 role:edit 給 admin 角色提交 → admin 重登 /manage/role 出現「編輯」鈕(不出現新增/刪除)→ 還原;Super /manage/role 三鈕全顯、Admin 初始全不顯。(contracts §1-3、§5①②③)

- [ ] T003 [US1] 改 `base-web/src/views/manage/role/index.vue`(MODAL-WIRING ★ v1.3.0 (b) button gating)依 [data-model §3, research R3/R4] —— toolbar `<TableHeaderOperation :show-add="hasAuth('role:add')">`;operate column row 鈕 編輯 `hasAuth('role:edit')`、刪除 `hasAuth('role:delete')`(鏡像 `user/index.vue` operate column JSX);**row 鈕 gating 以隨 `authStore.userInfo.buttons` reactive 重算的 columns 來源實作**(§2.26、R4,建立可重用 reactive pattern 供 T004/T005 沿用)。`hasAuth` 既有(`useAuth`)。依賴 T002(role:* 碼已 seed、modal 可勾)。

**Checkpoint US1**:contracts §1 getAllButtons 含 role:*(12 codes)+ §2 getRoleButton(R_SUPER 含 role:*、Admin 初始 0)+ §3 updateRoleButton round-trip(指派 role:edit 給 Admin→casbin 同步)+ §5① Super /manage/role 三鈕全顯 + ②Admin 初始全不顯 + ③modal 勾選端到端(admin 重登見編輯鈕)。

---

## Phase 4: US2 (P2) — 選單頁寫按鈕同範式

**Goal**:選單管理頁寫按鈕(新增/加子選單/編輯/刪除)同 US1 範式納入可指派 + 即時生效。
**Independent Test**:Super /manage/menu 寫鈕全顯(含可加子列的「加子選單」);Admin 初始全不顯;經 modal 指派 menu:edit 給某角色 → 該角色 /manage/menu 出現編輯鈕。(contracts §5①②③ menu 頁)

- [ ] T004 [US2] 改 `base-web/src/views/manage/menu/index.vue`(MODAL-WIRING ★ v1.3.0 (b))依 [data-model §3] —— toolbar `:show-add="hasAuth('menu:add')"`;operate column row 鈕 加子選單 **`row.menuType === '1' && hasAuth('menu:add')`**(★保留既有「僅目錄可加子」資料條件、疊加 hasAuth、不取代)、編輯 `hasAuth('menu:edit')`、刪除 `hasAuth('menu:delete')`;沿用 T003 建立的 reactive columns pattern。依賴 T002(menu:* 碼已 seed)。

**Checkpoint US2**:contracts §5 menu 頁:① Super 全顯(含加子選單)② Admin 初始全不顯 ③ modal 指派 menu:edit 端到端生效。

---

## Phase 5: US3 (P3) — 三頁即時反映 + 用戶頁回歸

**Goal**:用戶/角色/選單三頁寫按鈕顯示隨授權變動即時反映(無陳舊),且既有用戶頁(022)gating 行為逐項不破。
**Independent Test**:同 session 內登入者按鈕授權集變動後三頁寫按鈕顯隱即時反映;用戶頁編輯/刪除/新增顯隱與 022 既有逐項一致。

- [ ] T005 [US3] 改 `base-web/src/views/manage/user/index.vue`(§2.26 reactive retrofit)依 [data-model §3, research R4] —— 把 022 用戶頁 row 鈕 gating(`hasAuth('user:edit'/'user:delete')`、operate column JSX)改為沿 T003 reactive columns pattern(隨 `userInfo.buttons` 即時重繪);**gating code/邏輯不變、結果與 022 逐項一致**(僅修反應性)。確認三頁 reactive 行為一致。依賴 T003(pattern)。

**Checkpoint US3**:三頁授權變動即時反映(contracts §5④)+ 022 用戶頁 gating 逐項回歸不破(Admin 見編輯·不見刪除/新增、Super 全)。

---

## Phase 6: Polish & Cross-Cutting

- [ ] T006 holistic C-V acceptance:跑 contracts/verification-commands.md 全節(§1 getAllButtons 12 codes / §2 getRoleButton 預載 / §3 updateRoleButton round-trip / §4 psql seed + 022 矩陣不變 / §5 CDP 三角色×role/menu 頁×寫按鈕 + modal 端到端 + reactive / §6 migration up→down→up 可逆)+ **回歸 022/013-023**(用戶頁 button gating 逐項不破、既有 button 矩陣 10 列不變 FR-007、menu policy 不破)+ 守恆(`dcargo test -p server` 既有不破、`--test entity_access_lint` 17、`grep Migrator::up` server/src=0、`base-web pnpm typecheck` exit 0)。CDP 沿 022/023 isolated-context harness、建 `tests/024-button-auth-rollout/`。
- [ ] T007 文件回填:`docs/INTEGRATION-DESIGN.md` §10 Phase 4 ButtonAuth as-built 補「rollout 到 role/menu 頁」段(內容增厚:registry seed + R_SUPER 初始授權 + 三頁 gating + reactive 修正 + decoupled 已知債);plan Complexity Tracking 對齊實作(若偏離);CHECKLIST/spec/plan 收尾標記留待 finishing 階段。

> **★ 紀律**:本 tasks.md **不含 `git push` / `git merge`**(constitution §I.4 / CLAUDE.md §3:凍結至 `superpowers:finishing-a-development-branch`)。subagent-driven-development 各單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality);worktree 內 commit OK、push/merge 收尾才做。

---

## Dependencies

```
Setup(T001)
  └─ Foundational(T002 migration:role/menu registry + R_SUPER 授權)
       ├─ US1(T003 role/index.vue gating + 建 reactive pattern)   ← P1 MVP
       ├─ US2(T004 menu/index.vue gating〔需 T002 menu:* 碼 + 沿 T003 pattern〕)
       └─ US3(T005 user/index.vue reactive retrofit〔需 T003 pattern〕)
  └─ Polish(T006 holistic C-V〔需全部〕 ; T007 docs)
```

- **US1 ⟂ US2 ⟂ US3**:皆建於 Foundational;US1 role-page 可獨立交付驗證(MVP);US2 menu-page 同範式;US3 = user 頁 reactive retrofit + 三頁一致(沿 T003 pattern)。
- 跨故事 file 互不衝突:role/index.vue(US1)、menu/index.vue(US2)、user/index.vue(US3)各單一檔。

## Parallel 範例

- US1/US2/US3 三頁不同檔,**T003 建 reactive pattern 後 T004/T005 可平行**(皆沿用該 pattern、不同檔)。

## MVP 範圍

**US1(P1)** = MVP:Foundational(T002)+ T003 → 角色頁寫按鈕經「按鈕權限」modal 可指派、即時生效(Super 全顯/Admin 初始隱/勾選端到端)。menu 頁(US2)、三頁 reactive 一致 + user 回歸(US3)為增量。

## 實作策略

1. Foundational 先(T002)→ migration 可逆 + getAllButtons 12 codes checkpoint。
2. US1 → MVP checkpoint(role 頁 gating + modal 端到端)+ 建立 reactive columns pattern。
3. US2 → menu 頁 checkpoint(沿 pattern)。
4. US3 → user 頁 reactive retrofit + 三頁一致 + 022 回歸。
5. Polish → holistic C-V + 回歸 → `superpowers:finishing-a-development-branch`(多段式 commit + merge --no-ff,**此階段才 push/merge**)。
