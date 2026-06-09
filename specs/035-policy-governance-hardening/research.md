# Phase 0 Research: 治理層收尾硬化

> 方法:2026-06-09 對 **rust-api worktree 實碼**（= 合併 034 的 `a2a52fb`)重新 grep grounding（spec-design §3 行號會 rot，本檔以當下實碼為準）。每條 Decision 標 Rationale + Alternatives。本 feature 純內部硬化、無 wire/端點/schema 變更。

---

## R1 — 實碼 grounding 校正（act 須用以下實碼座標）

| 符號 | 實碼位置（`a2a52fb`） | 事實 |
|---|---|---|
| `RestoreOutcome` enum | `server/src/model/facade/sys_casbin_rule.rs:156` | `{ Restored, NoOp, NotFound }`（皆 **unit variant**）|
| `restore()` | `sys_casbin_rule.rs:171` | 讀 archive 列 → `NotFound`(:179) / 7-col 撞 live → `NoOp`(:198) / 否則 INSERT live + 刪 archive → `Restored`(:223)。**archive Model（含 v0/v1/v2）在 `Restored` 返回點仍在 scope** |
| facade 測試 | `sys_casbin_rule.rs:970`、`:1069` | `assert_eq!(r, RestoreOutcome::Restored, ..)` / `::NoOp` —— 改 enum 後須改斷言 |
| `restore_policy` handler | `server/src/handler/system_manage.rs:1948` | restore 呼叫 :1960;`Restored` 寫審計 `payload_after: {"archive_id": archive_id}`(:1963-1969,**過簡、待豐富**);`NoOp/NotFound → None`(:1976) |
| `dimension_from_v2(v2:&str)->String` | `system_manage.rs:1877`(private fn、test :3164) | menu→"menu" / button→"button" / GET·POST·DELETE→method。**與 restore_policy 同檔 → US1 可直呼**(無需改可見性)|
| menu restore cascade | `server/src/model/menu_policy_sync.rs:124-142` | `restore`(:127)→ `Restored => restored_roles.push(role)`(:128)/ `NoOp|NotFound => {}`;自建 summary 審計 `{route_name, roles}`(:134-142,**已 meaningful、負載不改**)|
| `SetRoleOutcome` enum | `sys_casbin_rule.rs:300` | `{ Applied(Vec<(String,String)>), Rejected }`;`Rejected`(:420,零變更)/ `Applied(before)`(:440)|
| `mutate_and_reload<R,F,Fut>` | `server/src/auth/policy_governance.rs:51` | commit 後**無條件** `reload_and_publish(state)`(:65);回 `Result<R, PolicyGovernanceError{Db,Reload}>`(:29) |
| `reload_and_publish(state)` | `policy_governance.rs:75` | `Result<(), casbin::Error>`(enforcer write-lock `load_policy()` + best-effort publish)|

**mutate_and_reload 的 6 caller + R 型**（`system_manage.rs`）:
- `:809` update_role_menu / `:1027` update_role_button / `:1196` update_role_endpoints → **`SetRoleOutcome`**（match `Applied(_)` / `Rejected`)。
- `:1775` delete_menu → `delete_menu_cascade_in_txn`(`menu_policy_sync.rs:40`)回 **`bool`**(deleted)。
- `:1847` restore_menu → `restore_menu_cascade_in_txn`(`menu_policy_sync.rs:110`)回 **`bool`**(restored)。
- `:1959` restore_policy → **`RestoreOutcome`**。
- 另 **`batch_delete_menus`** 走 `reload_and_publish` **直呼**(`:2058`、loop per-menu `mutate_in_txn`〔cascade `:2047`〕後末次 reload)。

---

## R2 — US2 no-op 訊號機制（trait `PolicyMutated`）

**Decision**：新 trait `PolicyMutated { fn mutated(&self) -> bool }`,3 impl;`mutate_and_reload` 加 `R: PolicyMutated` bound、commit 後改 `if result.mutated() { reload_and_publish(..).await? }`。

| impl for | `mutated()` | 涵蓋的「明確 no-op」 |
|---|---|---|
| `SetRoleOutcome` | `matches!(self, Applied(_))` | `Rejected`(protected 拒、零變更)→ false |
| `RestoreOutcome` | `matches!(self, Restored {..})` | `NoOp`(撞 live)/ `NotFound`(查無)→ false |
| `bool`(menu cascade) | `*self` | menu 查無 → false(found+刪/還 → true)|

**Rationale**：3 impl 集中判斷、**6 個 mutate_and_reload caller 全不動**(只多 trait bound)。`batch_delete_menus` 不走 mutate_and_reload → 另在 loop 內 `any_mutated |= deleted`、僅 `any_mutated` 才末次 reload。

**Alternatives rejected**：`should_reload: Fn(&R)->bool` predicate 參數 —— 每 call-site 顯式傳、囉嗦;trait 一次定義、call-site 零改。

**範圍邊界(FR-006)**：`Applied(_)→true` 含「空-diff Applied」(更新成同集、0 grant 0 revoke)→ **仍 reload**(不優化、刻意);menu `bool=found→true` 含「menu found 但無 visibility policy」→ **仍 reload**(同 empty-diff 等價、刻意)。US2 只跳**結構性零變更**(Rejected/NoOp/NotFound/menu 查無)。

---

## R3 — US1 restore 身分傳遞（`Restored` 帶 `{v0,v1,v2}`）

**Decision**：`RestoreOutcome::Restored` unit → `Restored { v0: String, v1: String, v2: String }`(role/obj/act);`restore()` 在 `:223` 改回 `Restored { v0: archive.v0, v1: archive.v1, v2: archive.v2 }`(archive Model 在 scope)。`restore_policy` 審計 `payload_after`: `{archive_id}` → `{"role": v0, "target": v1, "dimension": dimension_from_v2(&v2)}`。

**Rationale**：archive 列在還原同 txn 內被刪 → `archive_id` 還原後懸空(forensic 無價值);(v0,v1,v2) 在 `Restored` 返回點零額外 query 即可帶出。

**Alternatives rejected**：保留 unit + restore 另回 tuple(簽名更醜)/ handler 還原後再 SELECT(多一次 query、且 archive 已刪)。

**連帶**：menu cascade 的 match 臂改 `Restored { .. } => restored_roles.push(role)`(它本就有 `role` 變數、summary 審計 `{route_name, roles}` 負載不改);facade 2 處 `assert_eq!(.., Restored)` → `matches!(.., Restored { .. })`(或構造期望值斷言 v0/v1/v2)。

---

## R4 — wire 3 端對齊（確認**零** wire 變更）

**Decision**：本 feature **無任何 wire / 端點變更** —— restore 審計負載是 `sys_operation_log`(011)的**內部** `payload_after` JSON,**非對外 wire DTO**;`restorePolicy` 端點的 request(`{archiveId}`)/ response(`Res<()>`)/ 錯誤碼(0000/2222)逐字不變。`getArchivedPolicies` 不動。三 auth-modal wire 不動。

**Rationale(grep 實證)**：`restore_policy`(:1948)的 `RestorePolicyReq{archive_id}`(:1934)+ 回傳 `Res<()>` + 錯誤映射(:1983-1984)皆不改;US1 只改 `payload_after`(審計列內容、稽核者讀、非 base-web 讀)。base-web 零改(無 service/型/view 觸及)。

---

## R5 — 測試策略（純函式 test-first + live-DB + 守恆）

- **純函式單測**:`PolicyMutated::mutated()` 三 impl 真值表(`SetRoleOutcome::{Applied,Rejected}` / `RestoreOutcome::{Restored,NoOp,NotFound}` / `bool` 真假);restore audit payload 構造(`Restored{v0,v1,v2}` → `{role,target,dimension}`、`dimension_from_v2` 對映,沿 `sys_operation_log` 的 SQL-build seam 或直接 JSON 斷言)。
- **live-DB `#[ignore]`**:restorePolicy 後最新 Restore 列 `payload_after == {role,target,dimension}`(沿 034 `sys_casbin_rule::live_tests` 隔離範式:fake role、clean 前後、不 publish)。
- **reload-skip 可測性誠實註**:「reload 沒被呼叫」無 spy/counter 難直接斷言 → 主要由 `mutated()` 真值表單元測 + `mutate_and_reload` conditional code review 守;間接由 no-op 後 enforcer/DB 狀態不變佐證。
- **守恆**:`dcargo test -p server` 不退(+ 新純測 + 新 `#[ignore]`)/ `entity_access_lint` **17** / `endpoint_coverage_lint` **35** 不變 / **讀決策零變**(013/014 enforce)/ casbin live 集不變。**無新 crate** → prod image build 非強制(沿 §3;仍列一條 sanity)。

---

## 殘留 open items（plan 已決 / 留 tasks）

- US1 與 US2 互不依賴(US1 改 RestoreOutcome shape + restore_policy 審計;US2 改 mutate_and_reload + 加 trait)→ 可平行,但 US1 改 `RestoreOutcome` enum、US2 的 `PolicyMutated for RestoreOutcome` 依賴新 shape → **US1 先、US2 後**(順序依賴、非平行)。
- `batch_delete_menus` 的 `any_mutated` 追蹤 → tasks 列。
- facade 既有測試斷言改寫(`Restored` shape)→ tasks 列入 US1。
