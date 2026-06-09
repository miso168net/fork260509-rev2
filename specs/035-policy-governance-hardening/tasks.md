---
description: "Task list — 035 治理層收尾硬化"
---

# Tasks: 治理層收尾硬化（Policy Governance Hardening）

**Input**: `specs/035-policy-governance-hardening/`（plan.md / spec.md / research.md / data-model.md / contracts/）

**Tests**: 含測試任務（plan/research §5 紀律:純函式 test-first〔`PolicyMutated` 真值表 + restore audit payload〕、live-DB `#[ignore]`;reload-skip 無 spy → 真值表 + conditional code review 守）。

**Organization**: 依 spec User Story 優先序 P1→P2 分 phase;US 標籤對齊 spec.md（US1 restore 審計豐富化 / US2 no-op reload 跳過）。

> **命名鐵則（research R1 校正、act 前再 grep 確認行號）**:`RestoreOutcome` @`sys_casbin_rule.rs:156`(unit→帶 `{v0,v1,v2}`)/ `restore()` :171-223 / `restore_policy` handler :1948-1969(審計 :1963)/ `dimension_from_v2(v2:&str)->String` :1877(**private、與 restore_policy 同檔直呼**)/ menu cascade :124-142(match :128)/ `SetRoleOutcome` :300 / `mutate_and_reload`+`reload_and_publish` @`policy_governance.rs`:51/65/75 / 6 caller :809·1027·1196·1775·1847·1959 + `batch_delete_menus` reload 直呼 :2058。
>
> **跑活體前**:`dcargo build` + `restart rust-api`(cargo-watch /mnt/d 不可靠);PUBLISH 測試污染 running watcher → 先 restart/re-sync(MEMORY)。**無 migration**(不套表)。**base-web 零改**。**兩段式 commit**:動 rust-api worktree → worktree commit+push fork + 外層 bump SHA pin(§4.1)。

---

## Phase 1: Setup

- [ ] T001 確認 feature branch `035-policy-governance-hardening` + dev stack 已起、baseline 既有測試綠（`dcargo test -p server`、`dcargo test -p server --test entity_access_lint` 17、`dcargo test -p server --test endpoint_coverage_lint` 5@35）+ `casbin_rule` live 72 作 regression 基準

---

## Phase 2: User Story 1 — restore 審計豐富化 (P1) 🎯 MVP

**Goal**: restore 審計記實際 policy 身分 `{role, target, dimension}`,取代懸空 `{archive_id}`。

**Independent Test**: 造一筆 archive → restorePolicy → `sys_operation_log` 最新 RESTORE 列 `payload_after == {role,target,dimension}`（非 archive_id、且還原後仍可解析）。

### Tests for US1 ⚠️（test-first）

- [ ] T002 [P] [US1] 純函式單測:restore audit payload 構造（`Restored{v0,v1,v2}` → `{"role":v0,"target":v1,"dimension":dimension_from_v2(v2)}`、三維度 menu/button/HTTP-method 各一例），in `rust-api/server/src/handler/system_manage.rs`（`#[cfg(test)]`、沿既有 `dimension_from_v2` 測範式）
- [ ] T003 [P] [US1] live-DB `#[ignore]` 整合測:grant fake→revoke 造 archive → `restore` → 查 `sys_operation_log` 最新 `operation='RESTORE' entity_table='casbin_rule'` 列 `payload_after=={role,target,dimension}`（沿 034 `sys_casbin_rule::live_tests` 隔離:fake role、clean 前後、**不 publish**），in `rust-api/server/src/model/facade/sys_casbin_rule.rs` 或 handler 的 live module（env-gate `DATABASE_URL`）

### Implementation for US1

- [ ] T004 [US1] `RestoreOutcome::Restored` unit → `Restored { v0: String, v1: String, v2: String }`,in `rust-api/server/src/model/facade/sys_casbin_rule.rs:156`;`restore()` :223 回 `Restored { v0: archive.v0, v1: archive.v1, v2: archive.v2 }`;**改既有測試斷言** :970/:1069 為 `matches!(.., RestoreOutcome::Restored { .. })`（act 前 grep 校正行號）
- [ ] T005 [US1] menu restore cascade match 臂 → `RestoreOutcome::Restored { .. } => restored_roles.push(role)`,in `rust-api/server/src/model/menu_policy_sync.rs:128`（summary 審計 `{route_name,roles}` 負載**不改**;`NoOp`/`NotFound` 臂不動）
- [ ] T006 [US1] `restore_policy` 的 Restore 審計 `payload_after`:`{"archive_id":archive_id}` → `{"role":v0,"target":v1,"dimension":dimension_from_v2(&v2)}`（解構 `RestoreOutcome::Restored { v0, v1, v2 }`、`dimension_from_v2` 同檔直呼），in `rust-api/server/src/handler/system_manage.rs:1963`;**`NoOp`/`NotFound → None`(不寫審計)路徑不動**
- [ ] T007 [US1] 跑 T002/T003 綠（`dcargo build` + restart + `dcargo test -p server` + live `#[ignore]` `sys_casbin_rule`）;既有 034 live 測不退;**0 failed**

**Checkpoint**: US1 可獨立 live 驗（restore 審計記 {role,target,dimension}）;`RestoreOutcome` 新 `Restored{..}` shape 就緒（US2 `PolicyMutated for RestoreOutcome` 依賴）

---

## Phase 3: User Story 2 — no-op reload 跳過 (P2)

> **依賴 US1**:`impl PolicyMutated for RestoreOutcome` 用新 `Restored { .. }` shape（T004 必先完成）。

**Goal**: 明確 no-op（`SetRoleOutcome::Rejected` / `RestoreOutcome::{NoOp,NotFound}` / menu cascade `bool=false`）commit 後**不** `reload_and_publish`;空-diff Applied 與 menu-found-no-policy **仍 reload**（刻意、FR-006）。

**Independent Test**: `PolicyMutated::mutated()` 真值表綠;Rejected/restore NoOp/NotFound/batch-全-no-op 回應與行為同 034、對照組（有變更）仍 reload。

### Tests for US2 ⚠️

- [ ] T008 [P] [US2] 純函式單測:`PolicyMutated::mutated()` 真值表（`SetRoleOutcome::Applied(_)→true` / `Rejected→false`、`RestoreOutcome::Restored{..}→true` / `NoOp`/`NotFound→false`、`bool` 真/假），in `rust-api/server/src/auth/policy_governance.rs`（`#[cfg(test)]`）

### Implementation for US2

- [ ] T009 [US2] 新 trait `PolicyMutated { fn mutated(&self) -> bool }` + 3 impl（`SetRoleOutcome`=`matches!(Applied(_))` / `RestoreOutcome`=`matches!(Restored{..})` / `bool`=`*self`），in `rust-api/server/src/auth/policy_governance.rs`（就近;import `SetRoleOutcome`/`RestoreOutcome`）
- [ ] T010 [US2] `mutate_and_reload<R: PolicyMutated, F, Fut>` 加 trait bound + commit 後條件化 `if result.mutated() { reload_and_publish(state).await?; }`（原 :65 無條件），in `rust-api/server/src/auth/policy_governance.rs:51-65`;**6 caller 不動**（只受 trait bound）
- [ ] T011 [US2] `batch_delete_menus` loop 內追蹤 `any_mutated |= deleted`、僅 `any_mutated` 才末次 `reload_and_publish`，in `rust-api/server/src/handler/system_manage.rs:2058`（act 前 grep loop 結構;per-menu cascade 回 bool）
- [ ] T012 [US2] 跑 T008 綠 + `dcargo build`/`test`;行為不變佐證（revoke protected→Rejected→2222 / restore 撞 live→NoOp→0000 / 不存在→NotFound→2222「归档记录不存在」/ batch 全不存在→ok,皆同 034、`casbin_rule` live 72 不變）+ **對照組**（set_role_dimension Applied 改集 / restore Restored / menu 軟刪有 policy → reload 後 enforce 反映,無 stale）

**Checkpoint**: US1+US2 獨立可驗;治理 facade 收尾硬化完成、對外零變

---

## Phase 4: Polish & 守恆 & 收尾

- [ ] T013 [P] 守恆:`dcargo test -p server --test entity_access_lint`（17）+ `dcargo test -p server --test endpoint_coverage_lint`（5 @ EXPECTED_ROUTE_COUNT=35）綠
- [ ] T014 [P] 讀決策零變（FR-014/SC-003）:013/014 enforce acceptance（Super/Admin/User 選單可見 + endpoint allow/deny）逐項同 034;`restorePolicy`/`getArchivedPolicies`/三 auth-modal wire 逐字不變（curl 抽驗 request/response/錯誤碼）;base-web 零改確認（無 service/型/view 觸及）
- [ ] T015 prod runtime image build sanity（`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`、無新 crate 但驗 Dockerfile COPY 不破）
- [ ] T016 跑 `quickstart.md` 全流程驗收;回填 DESIGN §10 Phase 3 #6 補一段 035 as-built（restore 審計豐富化 + no-op reload 跳過）+ CHECKLIST §2.39 勾掉前兩項（restore audit payload / no-op reload）;**MILESTONES row 待 merge 後補**（指真實 merge SHA、memory `project_milestones_self_ref_sha`,不在此 task）

---

## Dependencies & Execution Order

- **Phase 1 Setup** → **Phase 2 US1**（`RestoreOutcome` shape + restore 審計）→ **Phase 3 US2**（`PolicyMutated` 依 US1 新 shape）→ **Phase 4 Polish**。
- **US2 依 US1**:`impl PolicyMutated for RestoreOutcome` 用 `Restored { .. }`（T004）→ **順序、不可平行**。
- **Phase 4** 依 US1+US2 完成。

### Parallel Opportunities

- T002/T003（US1 測試）[P];T008（US2 測試)[P];T013/T014（守恆）[P]。
- **US1 與 US2 不可平行**（US2 依 US1 enum shape）。

## Implementation Strategy

**MVP = US1**（restore 審計豐富化）:Setup → US1 → STOP 驗（live restore payload={role,target,dimension}）。之後 US2（no-op 跳過）增量、不破 US1。

> **★ 收尾在 tasks 外（CLAUDE.md §3）**:`superpowers:finishing-a-development-branch` + 兩段式 push（rust-api worktree push fork + 外層 bump SHA pin）+ `merge --no-ff` 回 rev2-admin-root,皆為 **user-gated、不在實作中執行、不排進本 tasks.md**;全 task 完成後另行 user 同意觸發。

## Notes

- [P] = 不同檔、無未完依賴;[US#] 對齊 spec.md（US1 restore 審計 / US2 no-op 跳過）。
- 每 implementer subagent 走 TDD:純函式 test-first（red→green:`PolicyMutated` 真值表 + restore payload）;reload-skip 無 spy → 真值表 + `mutate_and_reload` conditional code review 守（research R5）。
- 避免:改 `RestoreOutcome` 後漏改 :970/:1069 既有斷言 / 改 `restore_policy` 審計時誤動 `NoOp·NotFound`（仍 None、不寫審計）/ 動 `mutate_and_reload` 簽名時破 6 caller 既有 match / `batch_delete_menus` any_mutated 漏初值 false。
