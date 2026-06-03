# Implementation Plan: ButtonAuth Rollout (024)

**Branch**: `024-button-auth-rollout` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-button-auth-rollout/spec.md`

## Summary

把 022 ButtonAuth 的「按鈕權限可編輯迴路」**rollout 到角色頁/選單頁**:為 `manage_role` / `manage_menu` 兩 sys_menu 列 seed `role:*` / `menu:*` 按鈕碼 registry（`sys_menu.buttons`）→ 自動進「按鈕權限」modal 的 `getAllButtons` 聚合、變可勾選指派 → 沿 022 既有 `updateRoleButton`→`set_role_button` HARD REPLACE 同步 casbin（即時、redis 廣播）→ 角色/選單頁寫按鈕依 `hasAuth(code)` 顯/隱。初始授權 **R_SUPER-only**（開箱即用）、非-Super 由運維經 modal 指派。**唯一 rust 改動 = 一支 seed migration**（後端機制零改、modal 零改）;base-web 改 role/menu index.vue gating + user/role/menu 三頁 reactive-columns 修正（§2.26）。**decoupled 模型刻意**:按鈕可見性與 023 端點權限為兩獨立可指派維度（visible≠clickable 為已知債、留「完整版」未來 feature）。

## Technical Context

**Language/Version**: Rust 1.x（rust-api,SeaORM migration only）/ TypeScript + Vue 3（base-web,naive-ui）

**Primary Dependencies**: 既有 —— casbin button policy（v2='button'，022）、`policy_watcher`（redis pub-sub，共用 021）、`hasAuth`（base-web `useAuth`，022）。**無新 crate / 無新 dep / 無 fork**。

**Storage**: PostgreSQL —— 既有 `sys_menu`（022 已用 buttons 欄）、`casbin_rule`（v2='button'）。**不建表、不加欄**;migration 024 只 UPDATE 2 sys_menu 列 buttons + INSERT 6 casbin button policy 列。dev DB = `soybean_admin_rust`。

**Testing**: **無新純函式單元測試**（gating 用既有 `hasAuth`、後端僅 seed migration、編輯迴路沿 022 已測機制）→ 由 C-V acceptance（CDP + psql + migration 可逆）覆蓋;須於 plan/tasks 明示「無單元測試」及理由。

**Target Platform**: Linux docker dev stack（front-nginx :21080 `/api` → base-web + rust-api :21081;base-web 改後 `docker compose restart base-web`、migration 經 `run --rm migrate up`)。

**Project Type**: Web（rust-api migration + base-web frontend,兩 worktree submodule）。

**Performance Goals**: N/A（admin 低頻;gating 為前端 in-memory `userInfo.buttons` 查找）。

**Constraints**: 沿用既有按鈕權限機制（022、不改 set_role_button / button-auth-modal）;`manage_role`/`manage_menu` sys_menu 列已存在（menu_type=2、buttons=NULL，grep 實證）可 UPDATE;按鈕碼授權與 023 端點權限**刻意 decoupled**;既有用戶頁授權分布（`user:edit→R_ADMIN`）**不動**（FR-007）;reactive 修正不得破 022 用戶頁既有 gating 行為。

**Scale/Scope**: rust:+1 migration（2 UPDATE + 6 casbin INSERT）。base-web:+gating 於 role/menu index.vue + reactive-columns 修正 user/role/menu 三頁。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* 對照 **constitution v1.4.0**（§IV 8 項）:

1. **§I.1 base-web 權威 / rust 提供對應 endpoint?** ✅ PASS —— 不新增 endpoint;沿用 022 getAllButtons/getRoleButton/updateRoleButton（base-web 既有消費）。
2. **動 base-web inline?屬哪 ★ 軌道?邊界內?** ✅ **PASS（v1.3.0 (b) 既有邊界內）** —— role/menu/user `index.vue` 寫按鈕 `hasAuth(<code>)` v-if/JSX gating = **MODAL-WIRING ★ v1.3.0 (b) button gating 子句**已涵蓋（022 起用、`views/manage/**/index.vue` + 共用元件 prop）。**無需新 amendment**（與 023 不同,本波無新 modal/trigger）。
3. **menu 顯示走 Casbin enforce?(§I.2)** ✅ N/A —— 本波動 button policy（v2='button'）、與 menu visibility（v2='menu'）正交;不動 menu enforce。
4. **wire 對齊 §I.3 mock?** ✅ PASS —— 沿 022 button wire（`{code,desc}` registry + `codes:string[]` 寫端），無 id 型/envelope 問題;業務驗證 2222、授權 5003/3333 由既有層。
5. **從 rev1 拷貝 code?** ✅ PASS —— 否（migration 鏡像 rev2 自家 022;前端鏡像 022 用戶頁）。
6. **凍結到 §II 12 拍板?** ✅ PASS —— 無 §II 拍板變動;stock 機制、無新 crate/dep/fork。
7. **觸及 ★ 軌道?邊界內?** ✅ **PASS（同 #2）** —— MODAL-WIRING ★ button gating（v1.3.0 (b)）邊界內;BASE-WEB-WRAPPER 未觸及（不加 fetch fn）;BASE-WEB-BUILD-CONFIG ★ 未觸及。
8. **新建業務表 + §I.6 審計欄?** ✅ N/A —— 不建表（UPDATE 既有 sys_menu.buttons + INSERT casbin）;migration 024 無 CREATE TABLE。

**結論:§IV 8/8 PASS（constitution v1.4.0、無 amendment、無 finding）。** 與 023 差異:本波 MODAL-WIRING 僅 button gating（v1.3.0 (b) 既有子句）、**無新 modal/trigger** → 不需 v1.4.0 (c) 子句、無 amendment。

**Post-Phase-1 re-check**:design（data-model/contracts）未引入新違規 —— 不建表（§IV.8 N/A）、無 fork（§IV.6）、wire 沿 022（§IV.4）、button policy 與 menu enforce 正交（§IV.3）、MODAL-WIRING 在 v1.3.0 (b) 既有邊界內（§IV.2/7）→ **維持 8/8 PASS**。

## Project Structure

```text
rust-api/  (worktree, submodule)
└── migration/src/m20260529_000024_seed_role_menu_button_auth.rs  # 新:UPDATE manage_role/manage_menu.buttons(registry)+ INSERT 6 R_SUPER button policy;down 對稱
    # （註冊 migration/src/lib.rs）

base-web/  (worktree, submodule)
├── src/views/manage/role/index.vue   # 改:toolbar show-add=hasAuth('role:add') + row 編輯/刪除 hasAuth('role:edit'/'role:delete') + reactive-columns
├── src/views/manage/menu/index.vue   # 改:toolbar hasAuth('menu:add') + row 加子選單(menuType==='1' && hasAuth('menu:add'))/編輯/刪除 + reactive-columns
└── src/views/manage/user/index.vue   # 改:reactive-columns 修正(§2.26 retrofit、gating 邏輯不變)

docs/INTEGRATION-DESIGN.md  # 收尾:§10 Phase 4 ButtonAuth as-built 補 rollout 段
.specify/memory/constitution.md  # 不動(無 amendment)
```

**Structure Decision**:Web（rust-api migration + base-web frontend 兩 worktree）。rust 鏡像 022 migration seed 結構;base-web 沿 MODAL-WIRING ★（v1.3.0 (b) button gating，既有邊界內）。

## Complexity Tracking

> 記偏離原 brainstorm / 需留痕項:

| 項 | 說明 | 處置 |
|---|---|---|
| **decoupled 已知債(按鈕可見性 ≠ 端點可呼叫)** | 按鈕碼授權(v2='button')與 023 端點權限(v2=method)兩套獨立維度 → 可勾 role:edit 顯示鈕但端點 Super-only → 5003 | brainstorm K1 親決 decoupled（user 要可獨立指派）;FR-008 明示 OUT;visible=clickable 自動對齊留「完整版」未來 feature。文件記錄、不解 |
| **reactive-columns 修正 retrofit user 頁** | §2.26:022 用戶頁 row 鈕 gating 在 columns JSX、非隨 userInfo.buttons reactive 重繪 | 本波順手 retrofit user + 套 role/menu 新 gating;FR-006、確保 022 行為不破 |
| **後端零 rust code 改動** | 編輯迴路沿 022（set_role_button HARD REPLACE 對任意 code 通用、getAllButtons 聚合自動涵蓋新碼） | 唯一 rust = seed migration;research R1/R2 留痕 |
| **無單元測試** | gating=既有 hasAuth、後端=seed migration、迴路=022 已測 | 由 C-V（CDP + psql + migration 可逆）覆蓋;tasks/plan 明示理由（同 022 範式） |
