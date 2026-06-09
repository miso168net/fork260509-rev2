# Implementation Plan: 治理層收尾硬化（Policy Governance Hardening）

**Branch**: `035-policy-governance-hardening` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/035-policy-governance-hardening/spec.md`

**設計輸入(brainstorm)**: [`docs/superpowers/035-policy-governance-hardening.md`](../../docs/superpowers/035-policy-governance-hardening.md)

## Summary

收 034 治理 facade 兩個「正確但不夠好」的內部債,**純 rust-api、對外行為/wire/讀決策逐項不變、無 migration/端點/crate/base-web 變更**:

- **US1（P1）restore 審計豐富化**:`RestoreOutcome::Restored` 從 unit variant → 帶 `{v0,v1,v2}`(role/obj/act);`restore_policy` 的 Restore 審計 `payload_after` 從懸空 `{archive_id}` → `{role, target, dimension}`(`dimension_from_v2` 既有)。archive 列在同 txn 被刪故 archive_id 還原後懸空、forensic 無價值,改記實際身分。
- **US2（P2）no-op reload 跳過**:新 trait `PolicyMutated { fn mutated(&self)->bool }`(3 impl);`mutate_and_reload` commit 後改 `if result.mutated() { reload_and_publish().. }`(原無條件)。**只跳明確 no-op**(`SetRoleOutcome::Rejected` / `RestoreOutcome::{NoOp,NotFound}` / menu cascade `bool=false`);空-diff Applied 與 menu-found-no-policy **仍 reload**(刻意、FR-006)。`batch_delete_menus` 走直呼 `reload_and_publish` → loop 內 `any_mutated` 追蹤。

## Technical Context

**Language/Version**: Rust(rust-api,MSRV 1.86;`#[tokio::main]` axum)。**base-web 零改**。

**Primary Dependencies**: axum 0.7 / sea-orm 1.1.20 / casbin 2.20.0(全既有)。**無新 dep / 無新 workspace crate**(改既有 `server` crate)。

**Storage**: PostgreSQL —— **無 schema / migration 變更**(不增 m036;casbin_rule / sys_casbin_policy_archive / sys_menu / sys_operation_log 不動)。

**Testing**: cargo 純函式單測(`PolicyMutated::mutated()` 真值表 + restore audit payload 構造)+ `#[ignore]` live-DB(restore payload = {role,target,dimension},走 dev docker image + 快取卷)+ psql 守恆。reload-skip 由真值表 + code review 守(無 spy)。

**Target Platform**: Linux server(docker compose、單一 rust-api 實例)。

**Project Type**: web(僅後端 rust-api;base-web 不觸)。

**Performance Goals**: US2 削掉「零變更治理寫入」的一次全量 `load_policy()` + redis publish;治理寫入低頻、改善為純效率、**結果不變**。

**Constraints**: **對外請求/回應/錯誤碼/讀決策逐項不變**(FR-005/SC-003);守恆 `entity_access_lint` 17 / `endpoint_coverage_lint` 35 不退;**無 amendment**;承 034 治理 facade 契約不改。

**Scale/Scope**: admin 治理、低頻;改 4 檔(`sys_casbin_rule.rs` enum+測 / `policy_governance.rs` trait+條件化 / `system_manage.rs` restore_policy 審計+batch any_mutated / `menu_policy_sync.rs` match 臂)。2 US、順序依賴(US1 改 enum shape、US2 trait 依賴之 → US1 先)。

## Constitution Check

*GATE: 對照 `.specify/memory/constitution.md` §IV 8 項逐項判定。Phase 0 前須通過、Phase 1 後重判。*

| # | §IV 檢查項 | 判定 | 理由 |
|---|---|:---:|---|
| 1 | §I.1 base-web 為權威(rust-api 是否未提供 base-web 用到的端點?)| ✅ PASS | 無新端點、不改既有端點 wire;base-web 用到的端點全在、契約不變。 |
| 2 | §I.2 menu 顯示走 Casbin enforce? | ✅ PASS | 不碰 menu 讀路徑 / getUserRoutes / enforce。 |
| 3 | §I.3 wire 對齊 mock(envelope/id 型/error code/enum)? | ✅ PASS | **零 wire 變更**;restore 審計是 011 內部 `payload_after`、非對外 wire(R4);錯誤碼不新增。 |
| 4 | §I.5 從 rev1 拷貝 code? | ✅ PASS | 全新 rev2 碼、不拷貝、不動 vendored adapter。 |
| 5 | §I.5 / §II §11.6 adapter「拷貝」前提 | ✅ PASS | 不觸 adapter;§11.6 不動。 |
| 6 | §II 12 拍板凍結是否需改? | ✅ PASS | 不撤回任何 §II 拍板。 |
| 7 | §III ★ MODAL-WIRING / BASE-WEB-BUILD-CONFIG 軌道 | ✅ PASS | **base-web 零改**、不觸任何前端 ★ 軌道、無 amendment。 |
| 8 | §I.6 新建業務表審計欄? | ✅ PASS | **無新表 / 無 migration / 無 schema 變更**。 |

**Gate 結論**:**8/8 PASS、無 amendment、無新 migration / 端點 / crate / dep**。可進 Phase 0(已完成)→ Phase 1(已完成)→ /speckit-tasks。

## Project Structure

### Documentation (this feature)

```text
specs/035-policy-governance-hardening/
├── plan.md              # 本檔
├── research.md          # Phase 0(grep grounding 合成)
├── data-model.md        # Phase 1(型 + 審計負載變更、無 DB schema)
├── quickstart.md        # Phase 1(本地驗收)
├── contracts/
│   └── verification-commands.md  # Phase 1(C-V;無 endpoints.md = 無 wire 契約變更)
├── checklists/
│   └── requirements.md  # /speckit-specify 產(17/17 PASS)
└── tasks.md             # Phase 2(/speckit-tasks 產、非本步)
```

### Source Code (repository root)

```text
rust-api/                                    # worktree + submodule(改後兩段式 commit)
└── server/src/
    ├── model/facade/sys_casbin_rule.rs      # 改:RestoreOutcome::Restored 帶 {v0,v1,v2}(US1)+ 既有 :970/:1069 測試斷言改 matches!
    ├── auth/policy_governance.rs            # 改:新 trait PolicyMutated(3 impl)+ mutate_and_reload 條件化 reload(US2)
    ├── handler/system_manage.rs             # 改:restore_policy 審計 payload {archive_id}→{role,target,dimension}(US1、:1963)+ batch_delete_menus any_mutated 追蹤(US2、:2058)
    └── model/menu_policy_sync.rs            # 改:restore cascade match 臂 Restored{..}(US1、:128;summary 審計負載不改)

base-web/                                    # ★ 零改(無 service/型/view/i18n 觸及)
```

**Structure Decision**: web(僅後端)。4 個既有檔內改 + 1 新 trait(進既有 `policy_governance.rs`);**無新檔/crate/migration**。`PolicyMutated` 與 `RestoreOutcome` 同屬治理層、就近放(trait 進 policy_governance.rs 或 sys_casbin_rule.rs,/speckit-tasks 定)。**無新 workspace crate → 不觸發「加 crate 須 prod image build」硬守則**,但 acceptance 仍含一條 prod runtime image build sanity(§3 紀律)。

## Complexity Tracking

> Constitution Check 8/8 PASS、無 violation → 本節無項目。
