# 024 ButtonAuth Rollout — spec-design (Phase 0 brainstorm)

**Created**: 2026-06-04 · **Status**: spec-design 完成、待 `/speckit-specify`
**承**: [§2.26 follow-up](../INTEGRATION-CHECKLIST.md)（022 button gating pilot 僅用戶頁、其餘業務頁留後續）· [DESIGN §10 Phase 4](../INTEGRATION-DESIGN.md)
**鏡像**: 022-manage-button-auth（同機制、同 modal、同 gating 範式）

---

## 1. 一句話

把 022 用戶頁的「按鈕權限可編輯迴路」（在角色管理頁「按钮权限」modal 勾選 → 自動同步 casbin → 頁面按鈕依授權顯/隱）**rollout 到角色頁與選單頁**，讓 `role:*` / `menu:*` 操作按鈕也成為可經 modal 指派、即時生效的按鈕權限。

## 2. 背景與問題

- **022 落地了完整的按鈕權限編輯迴路**，但 pilot **只覆蓋用戶頁**：
  - registry（哪些按鈕存在）來自 `sys_menu.buttons`，022 只 seed 了 `manage_user.buttons = [user:add, user:edit, user:delete]`。
  - 編輯迴路（modal 勾選 → casbin 同步）：「按钮权限」modal 的 `getAllButtons`（聚合 sys_menu.buttons）+ `getRoleButton`（預載）+ `updateRoleButton`→`set_role_button`（HARD REPLACE 寫 casbin `(role, code, 'button')` + redis 廣播）。
  - 用戶頁前端 gating：`hasAuth('user:add'|'user:edit'|'user:delete')`。
- **缺口**：角色頁、選單頁的 `manage_role.buttons` / `manage_menu.buttons` **未 seed 任何按鈕碼** → 它們的操作按鈕（新增/編輯/刪除/加子選單）：
  1. 在「按钮权限」modal 裡**列不出來**（registry 沒有它們）→ 無從勾選/指派；
  2. 頁面上**完全無 gating**（永遠全顯，不論角色）。
- 全站只有 3 個 manage 業務頁（user/role/menu）；user 已做，缺 role + menu。

## 3. 設計取捨（brainstorm 親決）

> brainstorm 過程探討過「更野心」的方向並**刻意排除**，留痕如下，避免日後重議或誤把本波當成那些。

- **K1 — 對齊 vs 解耦：採「解耦」（按鈕權限可獨立指派）。** 探討過「按鈕可見 = 端點可呼叫」(aligned，derive 自 023 runtime 端點權限、零漂移) vs 「按鈕碼獨立授權」(decoupled，022 模型)。**親決 decoupled**：按鈕權限是一個**可經 modal 獨立勾選指派**的維度（這正是 user 要的核心價值），不自動綁定端點權限。
- **K2 — env 總開關（aligned↔decoupled）：本波不做。** 探討過用 `VITE_*` 旗標讓不同部署切換 aligned/decoupled。結論：aligned 那一側需動 getUserInfo（回 callableEndpoints）+ 兩套機制並存 = Phase 4 polish 裡最重的版本，**超出本波輕量意圖**。**留「完整版」未來 feature**。
- **K3 — 範圍：完整迴路（modal 編輯端 + 頁面生效端都做）。** 不只 seed registry 讓 modal 列得出（編輯端），也補前端 gating 讓勾選結果在畫面顯/隱（生效端），否則「勾了 casbin 有資料但畫面沒反應」。
- **K4 — 初始授權分布：R_SUPER-only seed，非-Super 由 modal 指派。** 角色/選單寫端點本就 Super-only，故 R_SUPER 開箱即見/可用；非-Super 不預設 seed，由運維在「按钮权限」modal 勾選賦予。

## 4. 設計

### 4.1 後端 — 一支 migration（鏡像 022 結構）

- **registry seed**（`sys_menu.buttons` JSON、含中文 desc，供 modal 顯示）：
  - `UPDATE sys_menu SET buttons = [{role:add 新增角色}, {role:edit 编辑角色}, {role:delete 删除角色}] WHERE route_name='manage_role'`
  - `UPDATE sys_menu SET buttons = [{menu:add 新增菜单}, {menu:edit 编辑菜单}, {menu:delete 删除菜单}] WHERE route_name='manage_menu'`
- **初始 casbin button policy**（`(p, role, code, 'button')`）：**只 seed R_SUPER 6 列**（role:add/edit/delete + menu:add/edit/delete）。`ON CONFLICT DO NOTHING`。
- **down 精準可逆**：刪本 migration 的 6 casbin 列（by code + v2='button'）+ 還原 `manage_role`/`manage_menu`.buttons = NULL（建表時即 NULL）。**不踩** 022 的 `user:*`/`B_CODE*` button policy、010 menu policy。up→down→up throwaway DB 可逆。
- **不建表、不加欄、無新 crate/dep/fork**。

### 4.2 編輯迴路 — 零改動，沿用 022

「按钮权限」modal（`button-auth-modal.vue`）+ `getAllButtons`/`getRoleButton`/`updateRoleButton`/`set_role_button` **自動涵蓋新碼**（registry 聚合 + HARD REPLACE 對任意 code 通用）。編某角色「按钮权限」→ 勾選 → 提交 → 自動同步 casbin + redis 即時生效。**本波後端除 migration 外無 rust code 改動。**

### 4.3 前端 — gating（鏡像 022 用戶頁）

- **角色頁** `views/manage/role/index.vue`：toolbar 新增 `:show-add="hasAuth('role:add')"`；row 編輯 `hasAuth('role:edit')`、刪除 `hasAuth('role:delete')`。
- **選單頁** `views/manage/menu/index.vue`：toolbar 新增 `hasAuth('menu:add')`；row 加子選單 **`row.menuType === '1' && hasAuth('menu:add')`**（保留既有「僅目錄可加子」資料條件、疊加 hasAuth、不可取代）、編輯 `hasAuth('menu:edit')`、刪除 `hasAuth('menu:delete')`。
- **§2.26 reactive-columns 修正**：row 按鈕 gating 改為隨 `authStore.userInfo.buttons` 變動會重渲染的 reactive columns 樣式，**套 user + role + menu 三頁**（§2.26 本指用戶頁缺口，順手 retrofit user 一併閉）。
- batch-delete toolbar 鈕沿 022：依 `disabled-delete`（選取數）控制，不另加 button code（與 row delete 能力同源）。

## 5. Scope

**IN**：
- migration：role/menu registry seed（sys_menu.buttons）+ R_SUPER 6 button policy 列。
- frontend：role/menu 頁寫按鈕 `hasAuth` gating + user/role/menu 三頁 reactive-columns 修正。
- 沿用 022 編輯迴路（modal→casbin 同步）覆蓋新碼。

**OUT（明示排除）**：
- aligned「按鈕可見=端點可呼叫」+ env 總開關 + getUserInfo callableEndpoints（K1/K2 → 留「完整版」未來 feature）。
- 修改 022 用戶頁既有授權分布（`user:edit→R_ADMIN` demo grant 不動）。
- 其他非 manage 業務頁、toggle-auth demo 頁（B_CODE*）— 不在本波。
- 任何後端機制重寫 / 新 button code 系統（沿 022 既有）。

## 6. 已知債（文件記錄、不解）

- **按鈕碼授權（v2='button'）與 023 端點權限（v2=HTTP method）為兩套獨立維度**：可勾選 `role:edit`（按鈕顯示）但該角色端點仍 Super-only → 點下去 enforce_mw 回 5003。此為「按鈕權限可獨立指派」模型（decoupled、K1）的本質、user 要的就是它可獨立勾。**兩者自動對齊（visible=clickable）留「完整版」未來 feature**（DESIGN 候選）。

## 7. 測試策略

- **無新純函式邏輯**（gating 用既有 `hasAuth`、後端僅 seed migration）→ **無單元測試**（同 022、須於 plan/tasks 明示理由）。
- **CDP browser smoke**（沿 022/023 isolated-context harness）：三角色 × role/menu 頁 × 寫按鈕顯隱；經「按钮权限」modal 勾選 `role:edit` 給某角色 → 該角色頁面出現編輯鈕（端到端編輯迴路生效）。
- **migration up→down→up throwaway DB 可逆**（既有 022 user:* / menu policy 存活）。
- **守恆**：server 單測 + entity_access_lint + Migrator::up=0 + 回歸 013-023 不破。**無新 crate → prod image build 非強制**。

## 8. Constitution / 軌道

- **MODAL-WIRING ★ v1.3.0 (b) button gating 子句已涵蓋**（`views/manage/**/index.vue` v-if/JSX `hasAuth` gating + 共用元件 prop）→ **無需新 amendment**。
- **BASE-WEB-WRAPPER**：本波不加 fetch fn（getAllButtons/getRoleButton/updateRoleButton 022 已有）。
- **無新表**（§I.6 N/A）、**無 fork**（§11.6 不觸）、**無新 crate/dep**。
- 預期 `/speckit-plan` Constitution Check §IV 8/8 PASS（無 finding）。

## 9. 交 `/speckit-specify` 要點

- feature 名建議 `024-button-auth-rollout`（specify 可調）。
- spec 須涵蓋：FR（registry seed / R_SUPER 初始授權 / modal 編輯迴路覆蓋新碼 / role+menu 頁 gating / reactive 修正 / 既有不破）、SC（三角色×頁×按鈕顯隱正確、勾選即時生效、migration 可逆）、明示 OUT（aligned/env-toggle/getUserInfo）+ 已知債。
- Phase 0 research 紀律：grep 022 migration seed 實際格式 + `manage_role`/`manage_menu` sys_menu 列存在性 + role/menu index.vue 實際按鈕結構 + hasAuth/table-header-operation 實際簽名（已於 brainstorm grounding 確認、plan research 再實證）。
