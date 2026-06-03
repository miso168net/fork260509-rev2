# Implementation Plan: Endpoint Permission Authorization (023)

**Branch**: `023-manage-endpoint-auth` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-manage-endpoint-auth/spec.md`

## Summary

把建置期硬編的「角色 × API endpoint」Casbin policy 變**維運期可編輯**,鏡像 021 MenuAuth / 022 ButtonAuth:新 `auth/endpoint_auth.rs`(stock adapter HARD REPLACE、**逐 method `remove_filtered_policy` 避免誤刪 v2='menu'/'button' 列**、無自鎖)、3 條 Super-only handler(getAllEndpoints / getRoleEndpoints / updateRoleEndpoints)、`getUserInfo` 不變。**root-mode**:R_SUPER 永遠全通、`update_role_endpoints` 拒編輯 R_SUPER → 整站自鎖歸零。**D1 build-time 靜態 lint**(parse main.rs + migrations、斷言每 enforce_mw route 有 seed policy + `ENDPOINT_REGISTRY` const 一致)= 關「path typo / 漏 seed 靜默死路由」破口。base-web 新 `endpoint-auth-modal.vue`(root-mode disabled-for-Super)+ 3 fetch fn。reconcile DESIGN 過時 `R_SUPER,*,*` wildcard 文字(matcher exact-equality、wildcard 從未實作)。**單一 migration 023 只 seed 3 治理端點列、無新 crate/dep、無 fork**。

## Technical Context

**Language/Version**: Rust 1.x(rust-api,axum + SeaORM + casbin 2.20)/ TypeScript + Vue 3(base-web,naive-ui)

**Primary Dependencies**: 既有 —— casbin(stock `sea-orm-adapter`,**不 fork**)、`policy_watcher`(redis pub-sub `casbin:policy:invalidate`,共用 021)。**無新 crate / 無新 dep**(D1 guard 純 `std` string scan、無 reqwest;對照 022 同)。

**Storage**: PostgreSQL —— 既有 `casbin_rule`(endpoint policy v2=HTTP method)、`sys_role`。**不建表、不加欄**;migration 023 只 seed casbin 3 列(新治理端點 R_SUPER)。dev DB = `soybean_admin_rust`。

**Testing**: 純函式單元測試(multi-method HARD REPLACE 正交 / get 排序 / root-mode reject)+ **D1 build-time 靜態 lint**(`server/tests/`、model on entity_access_lint、含 negative fixture)+ C-V acceptance(curl + psql + CDP);wiring 類由 C-V 覆蓋。

**Target Platform**: Linux docker dev stack(front-nginx :21080 `/api` → base-web + rust-api :21081;dev 須 `dcargo build` + restart,WSL2 inotify 不可靠)。

**Project Type**: Web(rust-api backend + base-web frontend,兩 worktree submodule)。

**Performance Goals**: N/A(admin 低頻;getAllEndpoints 回 ~28-item const、零 DB)。

**Constraints**: endpoint 以 `(path,method)` 為鍵(exact-equality matcher、`enforce.rs:41`);**root-mode** R_SUPER 不可編輯;既有 endpoint 矩陣**不變**(FR-010、唯一 intended 變更 = 選單讀端分歧文件對齊);ENDPOINT_REGISTRY const path 須與 main.rs route literal byte-identical(D1 強制)。

**Scale/Scope**: rust:+1 module(`auth/endpoint_auth.rs`)+ 3 handler + 1 migration(3 列)+ 1 D1 lint test;base-web:+1 modal + 抽屜按鈕 + 3 fetch fn + Endpoint type + i18n。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* 對照 **constitution v1.3.0**(§IV 8 項):

1. **§I.1 base-web 權威 / rust 提供對應 endpoint?** ✅ PASS —— rust 提供 getAllEndpoints/getRoleEndpoints/updateRoleEndpoints 對應 base-web endpoint-auth-modal(rev2 feature、BASE-WEB-WRAPPER 消費);getUserInfo/enforce 不變。
2. **動 base-web inline?屬哪 ★ 軌道?邊界內?** ✅ **PASS(v1.4.0 amendment `d700434` 已套用、邊界擴展消解)** —— (a) 3 fetch fn 入 `rev2-system-manage.ts` = **BASE-WEB-WRAPPER**(預設軌道、OK);(b) `endpoint-auth-modal.vue` 內部接線 = **MODAL-WIRING ★**(同 button-auth-modal);(c) 新增 modal component + role-operate-drawer 新 trigger NButton(v-if=isEdit)= **MODAL-WIRING ★ v1.4.0 擴邊界 (c) 子句已授權**(§III.2、DESIGN §11.21)。**i18n** `page.manage.role.endpointAuth` 為既有 block 加 key(同 022 buttonAuth 先例)。
3. **menu 顯示走 Casbin enforce?(§I.2)** ✅ PASS/N/A —— endpoint policy 是 `enforce_mw` 消費、與 menu visibility(v2='menu')正交;本波不動 menu。
4. **wire 對齊 §I.3 mock?** ✅ PASS —— envelope `{data,code:"0000",msg}`;`Endpoint{method,path}` string、無 id 型問題;業務錯誤 2222、授權 5003/3333 由 enforce_mw;沿 mock error code 契約。
5. **從 rev1 拷貝 code?** ✅ PASS —— 否(endpoint_auth.rs 鏡像 rev2 自家 button_auth/menu_auth)。
6. **凍結到 §II 12 拍板?** ✅ PASS —— 無 §II 拍板變動;**stock adapter 不 fork**(守 §11.6);無新 crate/dep。
7. **觸及 ★ 軌道?邊界內?** ✅ **PASS(同 #2,v1.4.0 amendment `d700434`)** —— MODAL-WIRING ★ 觸及,**新 modal+trigger 已由 v1.4.0 擴邊界 (c) 子句授權**(§III.2、§V.3 軌道授權邊界擴展、非新軌道、§11.9 計數不變)。BASE-WEB-BUILD-CONFIG ★ 未觸及。
8. **新建業務表 + §I.6 審計欄?** ✅ N/A —— 不建表(用既有 casbin_rule/sys_role);migration 023 只 seed 3 casbin 列。

**結論:§IV 8/8 PASS(constitution v1.4.0)。** #2/#7 的 MODAL-WIRING 新 modal+trigger 已由 **v1.4.0 amendment**(commit `d700434` + MILESTONES `6fb4725`、user 親決逐行核可:§III.2 ★ 邊界 +(c) 同模式新權限 modal+trigger、§11.21)正式授權消解。其餘 6 項本即 PASS/N/A。

**Post-Phase-1 re-check**:design(data-model/contracts)未引入新違規 —— 不建表(§IV.8 N/A)、無 fork(§IV.6、§11.6)、wire 對齊 §I.3、endpoint policy 與 menu enforce 正交(§IV.3)、MODAL-WIRING 在 v1.4.0 擴邊界內(§IV.2/7)→ **維持 8/8 PASS**。

## Project Structure

```text
rust-api/  (worktree, submodule)
├── server/src/
│   ├── auth/endpoint_auth.rs        # 新:鏡像 button_auth(get/replace/set、multi-method HARD REPLACE、SetRoleEndpointError;無自鎖)
│   ├── auth/mod.rs                  # 改:+ pub mod endpoint_auth;
│   ├── handler/system_manage.rs     # 改:+ get_all_endpoints/get_role_endpoints/update_role_endpoints + RoleEndpointReq + Endpoint DTO + root-mode guard + ENDPOINT_REGISTRY const(或置 endpoint_auth.rs)
│   └── main.rs                      # 改:+ 3 route 掛 enforce_mw
├── migration/src/m20260529_000023_seed_endpoint_auth_policy.rs  # 新:3 R_SUPER 列(新治理端點)+ down by v1
└── server/tests/endpoint_coverage_lint.rs  # 新:D1 build-time 靜態 lint(main.rs route ↔ migration policy ↔ registry 一致 + negative fixture)

base-web/  (worktree, submodule)
├── src/service/api/rev2-system-manage.ts   # 新增 fetchGetAllEndpoints/fetchGetRoleEndpoints/fetchUpdateRoleEndpoints
├── src/views/manage/role/modules/endpoint-auth-modal.vue  # 新:鏡像 button-auth-modal、key-on-(method+path)、root-mode disabled-for-Super
├── src/views/manage/role/modules/role-operate-drawer.vue  # 改:v-if=isEdit +「接口权限」NButton + EndpointAuthModal
├── src/typings/api/system-manage.d.ts      # +Endpoint = {method,path}
└── src/locales/langs/{zh-cn,en-us}.ts       # +page.manage.role.endpointAuth

docs/INTEGRATION-DESIGN.md            # 改:§4.6.3(L500/521)+§6.3(L749-752)過時 wildcard 文字校正 + §11.21 amendment-of-record
.specify/memory/constitution.md       # 改:§III.2 MODAL-WIRING ★ 邊界擴 + version 1.3.0→1.4.0(待 user 核可)
```

**Structure Decision**:Web(rust-api + base-web 兩 worktree)。rust 鏡像 021/022 的 auth 模組 + handler;base-web 沿 BASE-WEB-WRAPPER + MODAL-WIRING ★(擴邊界後)。

## Complexity Tracking

> 記偏離原 brainstorm / 需留痕項:

| 項 | 說明 | 處置 |
|---|---|---|
| **D1 守衛改 build-time 靜態 lint**(非 brainstorm 假設的 live-DB test) | research R5 評估:drift 是靜態文字屬性、build-lint 跑在普通 cargo test(每次 gate)、無新 dep(免 reqwest)、繞過 token-vs-policy 陷阱 | brainstorm §E 本就「若可行更佳、plan 評估」→ 採 build-lint;live-DB smoke 降為 optional 非 guard。research.md R5 留痕 |
| **MODAL-WIRING ★ amendment(新 modal+trigger 超邊界)** | endpoint-auth-modal 無既有 placeholder(021/022 是接既有);新增 modal + drawer trigger 超出現「接 placeholder + hasAuth gating」邊界 | 擴 MODAL-WIRING ★ 邊界(允許同模式新權限 modal+trigger)、MINOR v1.3.0→1.4.0;exact text 逐行核可(constitution amendment workflow);proposal→DESIGN §11.22 |
| **過時 wildcard 文字校正**(DESIGN §4.6.3/§6.3) | `p,R_SUPER,*,*` 計畫從未實作(matcher exact-equality)、016 已 de-facto 逐條 | R7 in-place 校正 3 處 + §11.21 record;casbin seed 不變(R_SUPER 本就 per-endpoint) |
| **ENDPOINT_REGISTRY const 雙源風險** | const path 須與 main.rs route literal 同步 | D1 靜態 lint 斷言 registry ⟷ main.rs ⟷ migration 三方一致(關 drift 破口) |
| **get_all_endpoints infallible**(回 const、無 DB) | 結構性 divergence vs 022 get_all_buttons(讀 DB aggregate) | research R2/R4 留痕;無 error arm |
</content>
