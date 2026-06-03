# Implementation Plan: Button Permission Authorization (022)

**Branch**: `022-manage-button-auth` | **Date**: 2026-06-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-manage-button-auth/spec.md`

## Summary

把僅存的程式內硬編按鈕權限(`rust-api/server/src/auth/buttons.rs` 的 role→button-code matrix)改為**維運期可編輯**,鏡像 021 MenuAuth:Casbin policy 加第三類 `(role_code, button_code, 'button')`、新 `auth/button_auth.rs`(remove_filtered + add_policies HARD REPLACE、**無自鎖 guard**)、`getUserInfo.buttons` 改讀 Casbin、3 條 Super-only handler(getAllButtons / getRoleButton / updateRoleButton)、base-web `button-auth-modal.vue` 接線(key-on-code)。可用按鈕來源 = 各選單 `sys_menu.buttons` 之聚合(seed 真實按鈕);**pilot** 把用戶管理頁操作鈕接 `hasAuth` 端到端生效;**救活 toggle-auth** demo(seed 入 sys_menu + Casbin menu policy)保 B_CODE1/2/3 可驗。單一 migration 022 seed,**無新 crate**。

## Technical Context

**Language/Version**: Rust 1.x(rust-api,axum + SeaORM + casbin 2.20)/ TypeScript + Vue 3(base-web,naive-ui)

**Primary Dependencies**: 既有 —— casbin(stock `sea-orm-adapter`,**不 fork**)、`policy_watcher`(redis pub-sub `casbin:policy:invalidate`,共用 021)、sea-orm `Json`。**無新 crate / 無新 dep**(對照 021 的 tokio-stream 已落地)。

**Storage**: PostgreSQL —— 既有 `sys_menu`(`buttons: Option<Json>`)、`casbin_rule`(policy)、`sys_role`。**不建表、不加欄**;單一 migration 022 只做 seed(sys_menu +2 row、UPDATE manage_user.buttons、casbin button/menu policy INSERT)。

**Testing**: 純函式單元測試(button code↔grant 對映、union deterministic order、HARD REPLACE 冪等)+ C-V acceptance(curl + psql + CDP);wiring 類無純函式者由 C-V 覆蓋(對齊 CLAUDE.md §3)。

**Target Platform**: Linux docker dev stack(front-nginx :21080 `/api` → base-web + rust-api :21081;dev 須 `dcargo build` + `docker compose restart rust-api/base-web`,WSL2 inotify 不可靠)。

**Project Type**: Web(rust-api backend + base-web frontend,兩 worktree submodule)。

**Performance Goals**: N/A(admin 低頻操作;getAllButtons 聚合 active sys_menu 全量、~7 row 規模)。

**Constraints**: 按鈕以 **code** 為穩定鍵(MenuButton 無 id);getUserInfo.buttons 既有 B_CODE 分布**逐字保留**(回歸);getUserRoutes 逐字基線**因 demo 救活 re-base**(唯一 intended 例外);pilot 僅用戶頁(角色/選單頁 gating 不在本波)。

**Scale/Scope**: rust-api:+1 module(`auth/button_auth.rs`)+ 3 handler + getUserInfo 改源 + 1 migration;base-web:+3 fetch fn + modal 接線 + 用戶頁 gating + table-header-operation 附加 prop。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* 對照 **constitution v1.3.0**(§IV 8 項):

1. **§I.1 base-web 權威 / rust 提供對應 endpoint?** ✅ PASS —— rust 提供 getAllButtons / getRoleButton / updateRoleButton 對應 base-web button-auth-modal 三 placeholder;getUserInfo.buttons 沿既有 wire。
2. **動 base-web inline?屬哪 ★ 軌道?邊界內?** ✅ PASS(**post-v1.3.0**)—— (a)button-auth-modal `// request` 接線 + (b)用戶頁 `hasAuth` gating + table-header-operation 附加 prop,皆在 **MODAL-WIRING ★(v1.3.0 擴展)** 邊界內;每處 spec/data-model 記 file:line。
3. **menu 顯示走 Casbin enforce?(§I.2)** ✅ PASS —— toggle-auth 經 **§I.2 v1.3.0 例外**提升為真實 Casbin-enforced 選單(seed menu policy);button grant 走 Casbin `(role,code,'button')`(getUserInfo 廣告非 enforce,與 §I.2 menu-enforce 不衝突)。
4. **wire 對齊 §I.3 mock?** ✅ PASS —— envelope `{data,code:"0000",msg}`;button 以 code(string)為鍵、無 id 型問題;getUserInfo.buttons 維持 `string[]`;MenuButton `{code,desc}` 沿 mock。
5. **從 rev1 拷貝 code?** ✅ PASS —— 否(button_auth.rs 鏡像 rev2 自家 menu_auth.rs)。
6. **凍結到 §II 12 拍板?** ✅ PASS —— §11.5(demo 處理)已於 v1.3.0 amend 開 toggle-auth 例外;無其他拍板變動。
7. **觸及 ★ 軌道?邊界內?** ✅ PASS —— MODAL-WIRING ★(已擴 button gating);BASE-WEB-BUILD-CONFIG 未觸及(本波不配 pageExcludePatterns)。
8. **新建業務表 + §I.6 審計欄?** ✅ N/A —— 不建表(用既有 sys_menu/sys_role/casbin_rule);sys_menu +2 seed row 非建表。

**結論:§IV 8/8 PASS(v1.3.0,2 finding 已由本輪 amendment 消解)。**

**Post-Phase-1 re-check**:design(data-model.md / contracts/)未引入新違規 —— 仍不建表(§IV.8 N/A,sys_menu +2 seed row 非建表)、base-web 改動仍在 MODAL-WIRING ★ v1.3.0 邊界內(§IV.2/7,modal 接線 + 用戶頁 gating + table-header-operation 附加 prop)、toggle-auth 仍在 §I.2 v1.3.0 例外內(§IV.3)、wire 仍對齊 §I.3(envelope/code-key/string[])→ **維持 8/8 PASS**。

## Project Structure

### Documentation (this feature)

```text
specs/022-manage-button-auth/
├── plan.md              # 本檔
├── research.md          # Phase 0(§6 grep 驗證 + 決策)
├── data-model.md        # Phase 1(entity/seed/casbin/wire DTO)
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1(endpoint 契約 + verification-commands.md)
└── tasks.md             # /speckit-tasks(非本步)
```

### Source Code (repository root)

```text
rust-api/  (worktree, submodule)
├── server/src/
│   ├── auth/button_auth.rs           # 新:鏡像 menu_auth.rs(get_role_button_codes / replace_role_button_policies / set_role_button;無自鎖)
│   ├── auth/buttons.rs               # 改:matrix → 提供 CANONICAL 順序 helper(或退場,改由 Casbin);保留回歸測試對齊
│   ├── handler/system_manage.rs      # 新:get_all_buttons / get_role_button / update_role_button;de_role_id 共用
│   ├── handler/auth.rs               # 改:getUserInfo.buttons 改讀 Casbin(union over roles)
│   └── model/facade/sys_menu.rs      # 用 list_active_all 聚合 buttons(讀;可加 buttons 聚合 helper)
└── migration/src/m20260529_000022_seed_button_auth.rs  # 新:sys_menu +2 row + manage_user.buttons + casbin button/menu policy

base-web/  (worktree, submodule)
├── src/service/api/rev2-system-manage.ts            # 新增 fetchGetAllButtons / fetchGetRoleButton / fetchUpdateRoleButton
├── src/views/manage/role/modules/button-auth-modal.vue   # MODAL-WIRING:接 3 placeholder + key-on-code + watch visible
├── src/views/manage/user/index.vue                  # MODAL-WIRING(gating):row 编辑/删除 v-if=hasAuth
└── src/components/advanced/table-header-operation.vue  # MODAL-WIRING(gating):附加 show-add prop(安全預設 true)
```

**Structure Decision**:Web(rust-api + base-web 兩 worktree)。rust 側鏡像 021 的 `auth/menu_auth.rs` → `auth/button_auth.rs`;base-web 側沿 BASE-WEB-WRAPPER(rev2-system-manage.ts 新 fn)+ MODAL-WIRING ★(modal 接線 + 用戶頁 gating)。

## Complexity Tracking

> 無 Constitution 違規需 justify(2 finding 已由 v1.3.0 amendment 正式消解、非繞過)。以下記**偏離原 brainstorm 規劃 / 需留痕**項:

| 項 | 說明 | 處置 |
|---|---|---|
| getUserRoutes 逐字基線 re-base | 救活 toggle-auth 使三角色導覽新增 function/toggle-auth 節點,021 的逐字基線不再適用 | spec FR-010 記為唯一 intended 例外;data-model 定義新基線、contracts 驗新基線 |
| constitution v1.3.0 amend(2 條) | 本波啟動前置(FINDING 1+2) | 已完成(7a3ebd1 / 27410bf),DESIGN §11.19/§11.20 提案 of record |
| `buttons.rs` 來源遷移 | getUserInfo.buttons 由硬編 matrix → Casbin;7 單元測試隨之改寫/退場 | data-model 定義 Casbin seed 逐字重現 B_CODE 分布 = 回歸基線 |
| table-header-operation 共用元件改動 | pilot gate 用戶頁「新增」鈕需動共用元件 | 用附加 prop + 安全預設 true(不變 role/menu 頁呼叫端);MODAL-WIRING v1.3.0 紀律已要求 |
