# Implementation Plan: 受管 RBAC Policy 治理層（Managed RBAC Policy Governance）

**Branch**: `034-managed-rbac-policy` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-managed-rbac-policy/spec.md`

**設計輸入(brainstorm)**: [`docs/superpowers/034-managed-rbac-policy.md`](../../docs/superpowers/034-managed-rbac-policy.md)

## Summary

在既有 Casbin policy 上加 rev2 治理層,4 能力 + 漂移修復 + 前端回收桶:**(a)** soft-delete 可復原 **(b)** 受保護不可刪(seed 固定、執行期不可變)**(c)** 變更走 011 audit(同 txn、both-or-neither)**(d)** 統一 CRUD facade(收斂 021/022/023 三胞胎)+ menu↔casbin 漂移修復(D2/D3/D4)+ base-web policy 回收桶 UI。

**技術取徑(架構 B = archive 表、免 fork)**:核心不變式 = `casbin_rule` 永遠只裝 live policy;軟刪列搬 `sys_casbin_policy_archive`。已親驗 stock `sea-orm-adapter` 嚴格 column-scoped 到 `ptype,v0..v5`(`load_policy = Entity::find().all()` 只選 entity 定義欄、`insert` 只填那 6 欄),故加治理欄 / archive 對 adapter 隱形 → **不 fork adapter、§11.6 後端不觸、無 backend amendment**。治理 facade DB-first(sea-orm 直寫 casbin_rule + archive + 011 audit 同 txn → commit → enforcer `reload_policy` → publish invalidate),旁路 adapter auto_save 的 pool-handle(原子性死結根因)。讀熱路徑(enforce_mw / getUserRoutes)零改、純寫側。

## Technical Context

**Language/Version**: Rust(rust-api,MSRV 1.86;`#[tokio::main]` axum)+ TypeScript / Vue 3(base-web)

**Primary Dependencies**: axum 0.7 / sea-orm 1.1.20 / casbin 2.20.0 / **sea-orm-adapter(stock、本 feature 不改)** / argon2 / jsonwebtoken;base-web:naive-ui + elegant-router + alova。**無新 workspace crate、無新 runtime dep**(全用既有)。

**Storage**: PostgreSQL(`casbin_rule` += 治理欄、新 `sys_casbin_policy_archive`、`sys_menu` += `protected`、既有 `sys_operation_log` audit)+ Redis(既有 `casbin:policy:invalidate` pub-sub)。

**Testing**: cargo 純函式單測(diff / protected-拒 / dimension 對映)+ `#[ignore]` live-DB 整合測(走 dev docker image + 快取卷,本機無 cargo)+ acceptance C-V(curl + CDP + psql)。

**Target Platform**: Linux server(docker compose、**單一 rust-api 實例**;多副本 fan-out 驗 out-of-scope)。

**Project Type**: web(backend rust-api + frontend base-web,worktree + submodule 雙身分)。

**Performance Goals**: 純寫側治理、**不增 per-request 讀壓**;enforcer reload = 全量 `load_policy()`(= 既有 watcher 行為,policy 編輯罕見、可接受)。讀側快取屬獨立 perf feature、out-of-scope。

**Constraints**: 後端 **不 fork** vendored `sea-orm-adapter`、**不需 §11.6 / backend constitution amendment**;唯 US5 base-web 回收桶 UI 可能需 **MODAL-WIRING amendment(v1.7.0、user 親決)**。三個既有 auth-modal wire **逐位元組不變**。守 009 entity-access lint、007 FR-009(server 不自動 migrate)、008 envelope、§I.6。

**Scale/Scope**: admin 治理;casbin ~69 seed policy 列;policy 編輯 / 撤銷罕見;archive 表小。5 US、4 新 migration(m031-m034)。

## Constitution Check

*GATE: 對照 `.specify/memory/constitution.md` §IV 8 項逐項判定。Phase 0 前須通過、Phase 1 後重判。*

| # | §IV 檢查項 | 判定 | 理由 |
|---|---|:---:|---|
| 1 | §I.1 base-web 為權威(rust-api 是否未提供 base-web 用到的端點?)| ✅ PASS | US5 新增 rev2 端點(getArchivedPolicies/restorePolicy)由 base-web 新頁消費;既有 3 modal 的端點不動。rust-api 主動提供新 UI 所需。 |
| 2 | §I.2 menu 顯示走 Casbin enforce? | ✅ PASS | 回收桶頁可見性走 §I.2(seed sys_menu 列 + R_SUPER role-menu policy);FR-013。 |
| 3 | §I.3 wire 對齊 mock ground truth(envelope/id 型/error code/enum)? | ✅ PASS | 新端點走 `Res<T>` envelope、string id、**重用 008 BizCode 矩陣既有碼(2222/4040/5000/0000)、不新增**;3 modal wire 零改(US4 對外逐位元組不變)。 |
| 4 | §I.5 是否從 rev1 拷貝 code? | ✅ PASS | 全新 rev2 碼;**adapter 完全不改**(archive 路線)→ 不觸 §I.5 例外清單、不新增拷貝。 |
| 5 | §I.5 / §II §11.6 adapter「拷貝」前提 | ✅ PASS | 治理走 DB-first(sea-orm 直寫 casbin_rule、新 rust-api 側 entity + facade),**不 fork adapter load/remove** → §11.6「sea-orm-adapter 拷貝」前提**不動、無 backend amendment**。 |
| 6 | §II 12 拍板凍結是否需改? | ✅ PASS(backend)| backend 不撤回任何 §II 拍板。 |
| 7 | §III ★ MODAL-WIRING 軌道 | ⚠ **NEEDS AMENDMENT(US5、user 親決)** | US5 base-web policy 回收桶頁屬「policy 還原維運 UI」,**超出**現行 MODAL-WIRING (a)-(e) 授權範圍 → 需評估落 (e)「同 manage 範式新管理頁」內、或新增 use (f) 的 **v1.7.0 amendment**。依 §V.2:Claude 不主動 amend、做到 US5 時於 DESIGN §11 提案、**user 親決**。**不阻擋 US1-US4**(純後端、全 PASS)。 |
| 8 | §I.6 新建業務表審計欄? | ✅ PASS(例外註明)| 新 `sys_casbin_policy_archive` 走 §I.6 **例外**(governance restore-buffer,帶 `archived_at`/`archived_by` = deleted_at/by 對應 + grant 出處欄,不帶完整 6 審計欄、archive 列不可再軟刪);`casbin_rule`(adapter 標準表、§I.6 非業務例外)+= 治理欄、`sys_menu` += `protected`,皆為 alter 非新業務表。 |

**Gate 結論**:US1-US4(後端核心)**全 PASS、無 amendment**、可進 Phase 0。**US5** 帶一個 **MODAL-WIRING v1.7.0 amendment 待決**(§V.2、user 親決、做到 US5 時提案)—— 記入 Complexity Tracking、不阻擋前序 US。

## Project Structure

### Documentation (this feature)

```text
specs/034-managed-rbac-policy/
├── plan.md              # 本檔
├── research.md          # Phase 0(grep grounding 合成)
├── data-model.md        # Phase 1(實體 + 欄 + migration 對映)
├── quickstart.md        # Phase 1(本地驗收跑法)
├── contracts/           # Phase 1(端點契約 + verification-commands)
│   ├── endpoints.md
│   └── verification-commands.md
├── checklists/
│   └── requirements.md  # 已由 /speckit-specify 產
└── tasks.md             # Phase 2(/speckit-tasks 產、非本步)
```

### Source Code (repository root)

```text
rust-api/                                    # worktree + submodule(改後兩段式 commit)
├── entity/src/
│   ├── sys_casbin_rule.rs                   # 新:rust-api 側治理感知 entity(id,ptype,v0..v5,protected,created_at,created_by)
│   └── sys_casbin_policy_archive.rs         # 新:archive entity
├── migration/src/
│   ├── m20260529_000031_alter_casbin_rule_governance.rs   # 新:casbin_rule += protected/created_at/created_by
│   ├── m20260529_000032_create_casbin_policy_archive.rs   # 新:archive 表
│   ├── m20260529_000033_seed_protected_policy.rs          # 新:seed casbin protected 旗標
│   ├── m20260529_000034_alter_sys_menu_protected.rs       # 新:sys_menu += protected + seed
│   └── lib.rs                               # 註冊 4 新 migration
├── sea-orm-adapter/                         # ★ 不改(archive 路線)
└── server/src/
    ├── model/facade/
    │   ├── sys_casbin_rule.rs               # 新:casbin_rule 治理 facade(grant/revoke/restore/set_role_dimension)
    │   └── sys_casbin_policy_archive.rs     # 新:archive facade
    ├── auth/
    │   ├── policy_governance.rs             # 新:薄 service 統籌 mutate_in_txn → reload → publish(集中三胞胎 reload/publish)
    │   ├── menu_auth.rs / button_auth.rs / endpoint_auth.rs  # 改:收斂為 set_role_dimension 呼叫(US4)
    │   └── menu CRUD facade                 # 改:軟刪/還原連動 policy facade(US3)
    └── handler/                             # 改:新增 getArchivedPolicies/restorePolicy + 收斂後讀寫;+ enforce + route 註冊

base-web/                                    # worktree + submodule(US5、改後兩段式 commit)
└── src/
    ├── views/manage/policy-archive/index.vue   # 新:回收桶頁(鏡像 manage 範式)
    ├── service/api/rev2-policy-archive.ts       # 新:BASE-WEB-WRAPPER
    ├── typings/api/rev2-extra.d.ts              # 改:+ ArchivedPolicy 型 + menu isSeed(D10)
    └── locales/                                  # 改:page.manage.policyArchive.* + route.manage_policy-archive
```

**Structure Decision**: web(backend rust-api + frontend base-web)。後端 4 新 migration + 2 新 entity + 2 新 facade + 1 薄 governance service + 改 3 個 auth 寫路徑 + menu CRUD;前端 US5 新 view + wrapper + 型 + i18n。**無新 workspace crate**(entity 進既有 `entity` crate、facade/service 進既有 `server` crate)→ 不觸發「加 crate 須 prod image build」守則,但 acceptance 仍含 prod runtime image build sanity。

## Complexity Tracking

| 項目 | 為何需要 | 較簡替代被拒因 |
|---|---|---|
| 新 `sys_casbin_policy_archive` 表(archive 路線)| soft-delete 可復原 + 維持「casbin_rule == live set」不變式、**免 fork vendored adapter** | A(fork adapter 加 deleted_at 濾 load)被拒:觸 §11.6 amendment + 永久維護 fork + 「忘濾鏡」隱患(DRIFT-3 近親)。archive 表是較小代價、更乾淨不變式。 |
| US5 MODAL-WIRING **v1.7.0 amendment**(待決) | 前端 policy 回收桶頁超出現行 (a)-(e) 授權 | 不做前端 UI(僅後端 restore API)被 user 否決(D4:要前端可看可一鍵還原)。amendment 限「policy 還原維運 UI」一用途、user 親決。 |
| 收斂 021/022/023 為單一 `set_role_dimension`(改 3 條運作中 code path)| capability (d)、消除三胞胎 + 讓 audit/protected 一致套三維度 | 維持 3 套複製被拒:audit(US1)/protected(US2)需逐套重複實作、易漂移。防護 = wire 零改 + 既有 acceptance 續綠。 |
