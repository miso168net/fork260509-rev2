# Implementation Plan: menu-restore-reparent (025)

**Branch**: `025-menu-restore-reparent` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/025-menu-restore-reparent/spec.md`

## Summary

補完 020 FR-011 OUT scope:**(1) restore** 軟刪選單(回收桶=選單頁「顯示已刪除」切換 + 復原鈕)+ **(2) re-parent** 自訂選單上層父(編輯 modal 的 parentId selector)。後端鏡像既有 soft_delete/update_menu 範式:facade 加 `restore`/`list_deleted_paginated`/`find_deleted_by_id`/`would_create_cycle`(純函式)+ updateMenu 加回 parent_id;2 新 Super-only endpoint(getDeletedMenus/restoreMenu,migration 025 seed,**D1 lint 三方一致 count 28→30**);re-parent 騎既有 updateMenu(無新 endpoint)。base-web 加 parentId NTreeSelect + 已刪 toggle/restore 鈕 + 2 wrapper fn。**無新表/crate/dep/fork**。**唯一 Constitution finding = MODAL-WIRING ★ 需 v1.5.0 (d) amendment**(base-web 新 form 控件 + toggle 超出 (a)(b)(c) 邊界;先例 022/023;**待 user 親決**)。

## Technical Context

**Language/Version**: Rust 1.x(rust-api,SeaORM facade/handler/migration)/ TypeScript + Vue 3(base-web,naive-ui NTreeSelect/NSwitch)

**Primary Dependencies**: 既有 —— SeaORM(`update_many`/`col_expr`/partial-unique index)、Casbin endpoint policy(v2=HTTP method,023)、`mutate_in_txn`+`AuditOperation::Restore`(011,**Restore variant 已存在 dormant**)、`enforce_mw`、D1 `endpoint_coverage_lint`(023)。**無新 crate / 無新 dep / 無 fork**。

**Storage**: PostgreSQL —— 既有 `sys_menu`(deleted_at/deleted_by + `sys_menu_route_name_active_uniq` partial-unique WHERE deleted_at IS NULL)、`casbin_rule`(v2=method)。**不建表、不加欄**;migration 025 只 INSERT 2 Super-only endpoint policy 列。

**Testing**: **新純單測 = `would_create_cycle`(TDD red→green)+ 重寫 `update_menu_query_sets_..._omits_immutables`(parent_id 由「不得在 SQL」→「可在 SQL」)**;restore/re-parent guards = handler wiring + DB → C-V acceptance(curl/psql/CDP/migration 可逆)覆蓋,plan/tasks 明示理由(同 020)。

**Target Platform**: Linux docker dev stack(front-nginx :21080 `/api` → base-web + rust-api :21081;rust 改 `dcargo build -p server` + `restart rust-api`;migration `run --rm migrate up`;base-web 改 `restart base-web`)。

**Project Type**: Web(rust-api + base-web 兩 worktree submodule)。

**Performance Goals**: N/A(admin 低頻;cycle guard 走 in-memory active 集 walk)。

**Constraints**: route_name(Casbin 可見性 v1 鍵)**immutable**(D2)→ restore/re-parent **不動可見性 policy**(R6 實證);種子選單父固定(R2)/ 不可刪(既有);restore 孤兒父已刪則擋(R1);D1 lint 強制 endpoint 3-way;**re-parent wire 契約已帶 parentId**(只加 server 反序列化+SET+guard、base-web wire 零改,R2 grounding 更正 brainstorm「已 absorb」誤述)。

**Scale/Scope**: rust:facade +5 fn/1 改 + handler +2/1 改 + migration 025(2 INSERT)+ D1 count 3 處 + 2 純單測。base-web:menu/index.vue(toggle+restore)+ menu-operate-modal(parentId NTreeSelect)+ rev2-system-manage(+2 fn)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* 對照 **constitution v1.4.0**(§IV 8 項):

1. **§I.1 base-web 權威 / rust 提供對應 endpoint?** ✅ PASS —— getDeletedMenus/restoreMenu 為 base-web(已刪 toggle/restore)消費的新端點;re-parent 騎既有 updateMenu(base-web `MenuWriteModel` 已含 parentId)。
2. **動 base-web inline?屬哪 ★ 軌道?邊界內?** ❌ **FINDING(超出 MODAL-WIRING ★ v1.4.0 邊界)** —— parentId `NTreeSelect`(menu-operate-modal、**新 form 控件**、現 parentId 純內部無控件)+「顯示已刪除」toggle/restore 鈕(index.vue、**全新 inline UI**)literally **非 (a)`// request` 接線、非 (b)hasAuth gating、非 (c)role-page auth-modal**(grounding G4 逐一判定)。→ **需 §III.2 (d) 子句 v1.5.0 amendment**(MINOR、§V.3 軌道授權邊界擴展、非新軌道、§11.9「5 軌道/2★」計數不變)。**待 user 親決**(§V.2、Claude 不主動 amend)。
3. **menu 顯示走 Casbin enforce?(§I.2)** ✅ N/A —— restore/re-parent route_name immutable → 不改可見性機制;casbin menu-visibility 列零觸碰(R6);getDeletedMenus 為管理讀端(非 nav 渲染)。
4. **wire 對齊 §I.3 mock?** ✅ PASS —— getDeletedMenus reuse `MenuItem`/`PageRes`/`MenuList`(零新 typing)、restoreMenu `Res<()>`→null、id/parentId=string、業務錯誤 2222、envelope `{data,code,msg}`(R5 三端對齊)。
5. **從 rev1 拷貝 code?** ✅ PASS —— 否(鏡像 rev2 自家 020 menu write + 023 endpoint pattern)。
6. **凍結到 §II 12 拍板?** ✅ PASS —— 無 §II 拍板變動;stock 機制、無新 crate/dep/fork;business error 2222(§11.10)。
7. **觸及 ★ 軌道?邊界內?** ❌ **FINDING(同 #2)** —— MODAL-WIRING ★ 需 (d) v1.5.0 amendment;**BASE-WEB-WRAPPER**(rev2-system-manage +2 fetch fn)**在授權邊界內**(service/api 非 views/manage,017-023 自由加);**BASE-WEB-BUILD-CONFIG ★ 未觸及**。
8. **新建業務表 + §I.6 審計欄?** ✅ N/A —— 不建表(migration 025 只 seed 2 endpoint policy);restore 為既有 sys_menu 列狀態翻轉、§I.6 成對(deleted_at+deleted_by 同清 NULL)。

**結論:§IV 6/8 PASS + 2 FINDING(#2/#7,同一 MODAL-WIRING ★ 邊界議題)→ 需 v1.5.0 (d) amendment 親決後成 8/8 PASS。** 與 023 同 gap-pattern(literally (a)(b)(c) 之外的新 UI 用途)。

### ★ 提議 amendment(待 user 親決,逐行列、分流四檔)

- **constitution §III.2 MODAL-WIRING ★**:(i) header(@131)+`;v1.5.0 amend:加選單復原/re-parent 維運控制`;(ii) 邊界(@133)+ **(d,v1.5.0 amend)** 子句:`於 views/manage/menu/** 的選單管理頁,新增選單復原/re-parent 維運 UI:(d-1) menu-operate-modal.vue edit 模式 parentId selector(種子父固定不可改、僅自訂可搬 R2);(d-2) index.vue「顯示已刪除」toggle(R3)+ 已刪列 restore 觸發鈕(孤兒父已刪擋下 R1);+ page.manage.menu.* i18n —— 嚴格限「選單樹復原/父層級調整」runtime 維運介面,不擴張到任意新 UI`;(iii) 紀律 use-count(@138)三用途→**四用途**;(iv) rationale(@142)+`/ §11.23(v1.5.0)`;(v) footer(@199)Version `1.4.0 → 1.5.0`。
- **DESIGN §11.23**(新):`### §11.23 v1.5.0 amend — MODAL-WIRING ★ 邊界 +選單復原/re-parent 維運控制(2026-06-04,025)`(4-line 改哪節/為何/改後影響=MINOR §V.3/觸發=025 plan FINDING #2/#7 skeleton)。
- **CHECKLIST §1** 1 行;**MILESTONES** row(獨立 follow-up commit 指 amend SHA、避 self-ref;memory `milestones_self_ref_sha`)。
- **commit**:`docs(constitution): amend v1.5.0 — MODAL-WIRING ★ 邊界 +選單復原/re-parent 維運控制`(落 025 feature branch、隨 --no-ff merge)。

**Post-Phase-1 re-check**:design 未引入其他違規 —— 不建表(§IV.8 N/A)、無 fork(§IV.6)、wire reuse(§IV.4)、casbin 可見性零觸(§IV.3)、rev1 不拷(§IV.5);**唯 MODAL-WIRING (d) 待 ratify** → ratify 後 8/8 PASS。

## Project Structure

```text
rust-api/  (worktree, submodule)
├── server/src/model/facade/sys_menu.rs   # 改:+find_deleted/list_deleted_paginated/find_deleted_by_id/restore/restore_query/would_create_cycle;UpdateMenuData+parent_id;update_menu_query+ParentId;重寫 immutability 單測
├── server/src/handler/system_manage.rs   # 改:+get_deleted_menus/+restore_menu;MenuUpdateReq+parent_id;update_menu re-parent guards(a)(b)(c)
├── server/src/auth/endpoint_auth.rs       # 改:ENDPOINT_REGISTRY +2;len 斷言 28→30;doc-comment 28→30
├── server/src/main.rs                     # 改:+2 route(getDeletedMenus get / restoreMenu post,enforce_mw)
├── server/tests/endpoint_coverage_lint.rs # 改:EXPECTED_ROUTE_COUNT 28→30
└── migration/src/m20260529_000025_seed_menu_restore_policy.rs  # 新:2 Super-only endpoint policy;down by-v1;註冊 lib.rs

base-web/  (worktree, submodule)  [★ MODAL-WIRING (d) amendment 親決後]
├── src/views/manage/menu/index.vue                    # 改:已刪 toggle + restore 鈕 + 資料源切換
├── src/views/manage/menu/modules/menu-operate-modal.vue # 改:parentId NTreeSelect(種子 disabled)
└── src/service/api/rev2-system-manage.ts              # 改:+fetchGetDeletedMenus/+fetchRestoreMenu(BASE-WEB-WRAPPER)

docs/INTEGRATION-DESIGN.md          # 收尾:§10 Phase 4 as-built + §11.23 amendment proposal
.specify/memory/constitution.md     # v1.5.0 amend(待親決)
tests/025-menu-restore-reparent/    # 外層:CDP isolated-context harness
```

**Structure Decision**:Web(rust-api + base-web 兩 worktree)。rust 鏡像 020/023;base-web MODAL-WIRING (d)(待 amend)+ BASE-WEB-WRAPPER。

## Complexity Tracking

| 項 | 說明 | 處置 |
|---|---|---|
| **MODAL-WIRING ★ (d) v1.5.0 amendment** | base-web parentId NTreeSelect(新 form 控件)+ 已刪 toggle/restore 超出 (a)(b)(c) | §V.2 user 親決(逐行列)→ ratify;先例 022/023;**plan FINDING #2/#7** |
| **brainstorm「de_parent_id 已 absorb」更正** | grounding G5 證 de_parent_id 只接 MenuCreateReq;re-parent 須加 MenuUpdateReq.parent_id+SET+guard | research R2 留痕;wire 契約已帶 parentId、僅 server 反序列化新 |
| **孤兒 casbin 列已知債** | 軟刪選單留 `[role,route_name,'menu']` 孤兒列;新建同 route_name 選單繼承舊可見性 grant | R6 文件記錄;restore/create 唯一性 guard 只擋 active 撞(§2.24 同類);不解、follow-up |
| **restore route_name TOCTOU** | handler pre-check active 唯一性 + DB partial-unique 最終防線;race 撞→DbErr→5000 | R4 ② handler guard;同 create_menu(§2.24);可接受 |
| **無單元測試(cycle/immutability 外)** | restore/re-parent guards = handler wiring + DB | C-V(curl/psql/CDP/migration 可逆)覆蓋;tasks/plan 明示(同 020) |
