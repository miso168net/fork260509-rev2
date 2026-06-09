# 035-policy-governance-hardening — spec-design（階段 0 brainstorm）

> 本檔為 feature 035-policy-governance-hardening 的 Phase 0 brainstorm spec-design（CLAUDE.md §3 階段 0）。
> 定案後由 **user 手動 `/speckit-specify`**（讓 `speckit.git.feature` pre-hook 建 `035-policy-governance-hardening` branch）→ `/speckit-clarify`（optional）→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`。
> 本檔不是 spec.md；它是餵給 `/speckit-specify` 的設計輸入。

**Feature**: 034 治理層收尾硬化 —— 兩件純 rust-api 治理碼小重構：**(US1)** restore 審計負載豐富化（記實際 policy 身分、非懸空 archive_id）**(US2)** no-op reload 跳過（治理寫入無實際 mutation 時不浪費全量 enforcer reload + redis publish）。
**Created**: 2026-06-09
**前序 / grounding**:
- **來源**：034 follow-up backlog [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) §2.39 前兩項（restore audit payload 過簡 / no-op 仍 reload+publish）。
- **設計權威**：034 已落地的治理 facade（`set_role_dimension` / `RestoreOutcome` / `mutate_and_reload`），見 [DESIGN §10 Phase 3 #6](../INTEGRATION-DESIGN.md)。
- **constitution**：§I.5（RUSTAPI-SOURCE-ISOLATION）/ §I.6（審計欄）/ §I.3（wire ground truth）。

---

## 1. 目標（purpose / success criteria）

把 034 治理 facade 兩個明確的「正確但不夠好」收掉：審計可追溯性 + 寫側效率。

**Success criteria**：
- **US1**：還原一條被移除權限後，011 Restore 審計記下**該權限的實際身分**（角色 / 對象 / 維度），而非還原後即懸空、無 forensic 價值的 `archive_id`。
- **US2**：治理寫入**沒有真正改到任何 policy 列**（被 protected 拒、restore 撞 live、restore 查無、menu 查無）時，commit 後**不**觸發全量 `load_policy()` + redis fan-out。
- **零行為/wire 變更**：對外請求/回應、錯誤碼、讀決策（FR-014）全部逐項不變；守恆 lint（entity_access 17 / endpoint_coverage 35）+ server 測試不退。

---

## 2. 決策拍板（brainstorm 2026-06-09）

| # | 決策 | 拍板 | 理由 |
|---|---|---|---|
| **D1** | 範圍 | **US1 restore audit 豐富化 + US2 no-op reload 跳過,合成一個 feature** | user 親選。兩件都小、同主題（純 rust-api 治理碼硬化）。archive purge（§2.39 D8、cleanup-job/ops 擴充）**另計、不在本 feature**。 |
| **D2** | no-op reload 跳過範圍 | **只跳「明確 no-op」**：`SetRoleOutcome::Rejected` / `RestoreOutcome::NoOp` / `RestoreOutcome::NotFound` / menu cascade 查無 | user 親選。這些已是獨立 outcome、好判；**不動 `set_role_dimension` 簽名**、blast radius 最小。**空-diff Applied**（更新成同一集、0 grant 0 revoke）**仍 reload**（罕見、可接受；要跳得讓 set_role_dimension 多報 change-count、不值）。 |
| **D3** | no-op 訊號機制 | **trait `PolicyMutated { fn mutated(&self) -> bool }`** | user 親選。3 impl（`SetRoleOutcome`/`RestoreOutcome`/`bool`）集中判斷,**6 個 mutate_and_reload caller 全不動**（只多 trait bound）。較 `should_reload` predicate 參數（每 call-site 顯式傳、囉嗦）乾淨。 |
| **D4** | restore 身分傳遞 | **`RestoreOutcome::Restored` 從 unit variant → 帶 `{ v0, v1, v2 }`** | `restore()` 開頭讀 archive 列時本就有 v0..v5、零額外 query。較「保留 unit + 另回 tuple / 還原後再讀一次」乾淨。 |

---

## 3. Grounding 驗證事實（2026-06-09 grep 實碼）

> spec/plan 階段 act 前須重新 grep 確認行號（會 rot）；以下為當下實碼。

- **`RestoreOutcome`**（`server/src/model/facade/sys_casbin_rule.rs:156`）= `{ Restored, NoOp, NotFound }`（皆 unit variant）。`restore(txn, archive_id, operator) -> Result<RestoreOutcome, DbErr>`（:171-223）：讀 archive 列 → 不存在回 `NotFound`；7-col pre-check 撞 live → 刪 archive + `NoOp`；否則 INSERT live（從 archive 快照,protected=false）+ 刪 archive → `Restored`（:223）。**archive Model 的 v0/v1/v2 在 `Restored` 返回點可得**。
- **restore 的 caller（2 個 + 測試）**：
  - `restore_policy` handler（`server/src/handler/system_manage.rs` ~:1959-1969）：`Restored` 時建 Restore 審計、`payload_after: { "archive_id": archive_id }`（:1969,**過簡**）；`NoOp/NotFound` 不寫審計（:1976）。
  - menu restore cascade（`server/src/model/menu_policy_sync.rs:127-130`）：`Restored => restored_roles.push(role)` / `NoOp/NotFound => {}`；自建 summary 審計 `{ route_name, roles }`（**已 meaningful、不需改負載**）。
  - facade `#[cfg(test)]`：`sys_casbin_rule.rs:718`（import）/ `:970`、`:1069`（`assert_eq!(r, RestoreOutcome::Restored, ..)`）。
- **`dimension_from_v2(v2) -> String`** 已存（US5,`system_manage.rs`）：menu→"menu" / button→"button" / GET·POST·DELETE→method。
- **`mutate_and_reload`**（`server/src/auth/policy_governance.rs`）：`mutate_in_txn` → **無條件** `reload_and_publish(state)`（:65）→ `PolicyGovernanceError { Db, Reload }`。
- **mutate_and_reload 的 6 caller + R 型**（`system_manage.rs`）：809 update_role_menu / 1027 update_role_button / 1196 update_role_endpoints（皆 `SetRoleOutcome`）；1775 delete_menu / 1847 restore_menu（皆 `bool` = menu cascade 是否真動）；1959 restore_policy（`RestoreOutcome`）。另 **`batch_delete_menus`** 走 `reload_and_publish` 直呼（:2058、loop per-menu `mutate_in_txn` 後末次 reload）。
- **`SetRoleOutcome`**（US4）= `{ Applied(Vec<(String,String)>), Rejected }`。

---

## 4. User Story 切分 + 設計細節

### US1 — restore 審計豐富化（純 facade/handler 改）

| 改點 | 內容 |
|---|---|
| `RestoreOutcome::Restored` | unit → `Restored { v0: String, v1: String, v2: String }`（role/obj/act） |
| `restore()` 返回 | `Restored` 點改回 `Restored { v0: archive.v0, v1: archive.v1, v2: archive.v2 }`（archive Model 已有） |
| `restore_policy` handler | Restore 審計 `payload_after`：`{archive_id}` → `{ "role": v0, "target": v1, "dimension": dimension_from_v2(v2) }`（解構 `Restored { v0, v1, v2 }`） |
| menu cascade match 臂 | `Restored { .. } => restored_roles.push(role)`（負載不改、續用 summary 審計） |
| facade 測試 | 3 處 `assert_eq!(.., Restored)` → `matches!(.., RestoreOutcome::Restored { .. })`（或構造期望值斷言 v0/v1/v2） |

### US2 — no-op reload 跳過（明確型,trait 機制）

```rust
// policy_governance.rs（或就近）
pub trait PolicyMutated { fn mutated(&self) -> bool; }
impl PolicyMutated for SetRoleOutcome { // Applied(_)→true（含空-diff,不跳）/ Rejected→false
    fn mutated(&self) -> bool { matches!(self, SetRoleOutcome::Applied(_)) }
}
impl PolicyMutated for RestoreOutcome { // Restored{..}→true / NoOp|NotFound→false
    fn mutated(&self) -> bool { matches!(self, RestoreOutcome::Restored { .. }) }
}
impl PolicyMutated for bool { fn mutated(&self) -> bool { *self } } // menu cascade

pub async fn mutate_and_reload<R: PolicyMutated, F, Fut>(state, f) -> Result<R, PolicyGovernanceError> {
    let result = mutate_in_txn(&state.db, f).await.map_err(..)?;       // commit
    if result.mutated() { reload_and_publish(state).await?; }          // ★ 條件化（原無條件）
    Ok(result)
}
```
- **6 個 mutate_and_reload caller 全不動**（只因 trait bound）。
- **`batch_delete_menus`**：loop 內 `any_mutated |= cascade_result`、僅 `any_mutated` 才末次 `reload_and_publish`（明確 no-op = 整批無真刪）。

> **不變式**：`mutated()` 只決定「跳不跳 reload」,**不影響 commit、不影響 audit、不影響回應**。空-diff Applied → `mutated()=true` → 照常 reload（符合 D2）。

---

## 5. testing / acceptance + 守恆

**純函式單測（test-first red→green）**：`PolicyMutated::mutated()` 三 impl 真值表（Applied/Rejected、Restored/NoOp/NotFound、true/false）；restore audit payload 構造（`Restored{v0,v1,v2}` → `{role,target,dimension}`、`dimension_from_v2` 對映）。

**live-DB `#[ignore]` 整合測**：restorePolicy 後 `sys_operation_log` 最新 Restore 列 `payload_after == {role,target,dimension}`（非 archive_id）；no-op 路徑（revoke protected→Rejected / restore 撞 live→NoOp / restore 查無→NotFound）行為與回應不變。

> **reload-skip 的可測性誠實註**：「reload 沒被呼叫」難直接斷言（無 spy/counter）→ 主要由 `mutated()` 真值表單元測 + `mutate_and_reload` conditional 的 code review 守；間接由「no-op 後 enforcer in-memory policy 與 DB 不變」佐證。**curl/CDP 不需**（無 wire/UI 變更）。

**不變式守恆**：server 測試數不退（+ 新純測 + 新 `#[ignore]`）；`entity_access_lint` **17** / `endpoint_coverage_lint` **35** 不變；**讀決策零變（FR-014）**（013/014 enforce 逐項相同）；casbin live 集不變。

---

## 6. Constitution Check 預覽

- **§I.5（RUSTAPI-SOURCE-ISOLATION）**：全新 rev2 碼、不拷貝 rev1、不動 vendored adapter。✅
- **§I.6（審計欄）**：無新表、無 schema 變更（純 enum/trait/handler 改）。✅
- **§I.3（wire ground truth）**：無新端點、無 wire 變更（restore 審計是 011 內部負載、非對外 wire）；錯誤碼不新增。✅
- **§I.2（menu Casbin enforce）**：不碰讀路徑。✅
- **§III MODAL-WIRING / base-web**：**base-web 零改**、不觸任何前端軌道。✅
- 預期 **全 PASS、無 amendment、無新 migration / 端點 / crate / dep**。

---

## 7. scope 邊界 / out-of-scope

**in-scope**：US1 restore 審計豐富化 + US2 no-op reload 跳過（明確型,trait `PolicyMutated`）。純 rust-api。

**out-of-scope（明確劃出）**：
- **casbin archive 懸空清理（D8、§2.39）** —— cleanup-job/ops 擴充,**另一 feature**（user 2026-06-09 親決拆出）。
- **空-diff Applied 也跳 reload** —— 需 `set_role_dimension` 報 change-count、blast radius 不值（D2 拒）。
- **多副本 redis fan-out 驗（D7）** —— 非當前部署目標、沿 034 既有 out-of-scope。
- restore audit `operator_ip` 真值（INET 42804、§2.14）—— 沿既有全路徑 None,不在本 feature。

---

## 8. 下一步

依 CLAUDE.md §3 / memory `feedback_speckit_specify_user_runs`：本 brainstorm spec-design 定案 → **user 手動 `/speckit-specify`**（input = 本檔；讓 `speckit.git.feature` pre-hook 建 `035-policy-governance-hardening` feature branch）→ `/speckit-clarify`（optional、本 feature 決策已拍板,可能無 [NEEDS CLARIFICATION]）→ `/speckit-plan`（Constitution Check + Phase 0 research:重新 grep 行號）→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`（subagent-driven、逐 US 雙審）。

**Phase 0 research 紀律（plan 階段必守）**：`RestoreOutcome` / `restore` caller / `mutate_and_reload` 6 caller 的 file:line act 前重新 grep（本檔 §3 行號會 rot）；確認 `dimension_from_v2` 簽名與位置；確認 menu cascade summary 審計負載不需改。
