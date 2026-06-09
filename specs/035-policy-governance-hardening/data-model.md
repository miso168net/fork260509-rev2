# Phase 1 Data Model: 治理層收尾硬化

> 對齊 [research.md](./research.md) 實碼 grounding。**本 feature 無任何資料表 / 欄位 / migration 變更** —— 改的是 rust-api 程序內型與審計負載形狀。以下為「型與負載」資料模型,非 DB schema。

## 1. 資料表 / migration

**無變更**。`casbin_rule` / `sys_casbin_policy_archive` / `sys_menu` / `sys_operation_log` schema 不動;**無新 migration**(沿 m031–m035 不增)。

## 2. 程序內型變更（rust-api `server` crate）

### 2.1 `RestoreOutcome`（`model/facade/sys_casbin_rule.rs:156`）— US1

```rust
// 前(unit variant):
pub enum RestoreOutcome { Restored, NoOp, NotFound }
// 後(Restored 帶還原列身分):
pub enum RestoreOutcome {
    Restored { v0: String, v1: String, v2: String },   // role / obj(target) / act(維度源)
    NoOp,
    NotFound,
}
```
- `restore()`(:223)`Ok(RestoreOutcome::Restored)` → `Ok(RestoreOutcome::Restored { v0: archive.v0, v1: archive.v1, v2: archive.v2 })`（archive Model 在返回點可得）。
- `NoOp` / `NotFound` 不變。

### 2.2 `PolicyMutated` trait（新,`auth/policy_governance.rs` 或就近）— US2

```rust
pub trait PolicyMutated { fn mutated(&self) -> bool; }
impl PolicyMutated for SetRoleOutcome { fn mutated(&self) -> bool { matches!(self, SetRoleOutcome::Applied(_)) } }   // Rejected→false
impl PolicyMutated for RestoreOutcome { fn mutated(&self) -> bool { matches!(self, RestoreOutcome::Restored { .. }) } } // NoOp|NotFound→false
impl PolicyMutated for bool { fn mutated(&self) -> bool { *self } }                                                    // menu cascade
```
- `mutate_and_reload<R: PolicyMutated, F, Fut>`：commit 後 `if result.mutated() { reload_and_publish(state).await?; }`（原 :65 無條件）。

### 2.3 不變的型

`SetRoleOutcome`(`{Applied(Vec<(String,String)>), Rejected}`)/ `PolicyGovernanceError`(`{Db, Reload}`)/ cascade 回傳 `bool` —— **皆不改**(只新增 trait impl)。

## 3. 審計負載形狀（`sys_operation_log.payload_after`,US1）

| 操作 | 前 | 後 |
|---|---|---|
| restorePolicy 的 Restore 審計 | `{ "archive_id": <i64> }` | `{ "role": <v0>, "target": <v1>, "dimension": <dimension_from_v2(v2)> }` |
| menu restore cascade 的 Restore 審計 | `{ "route_name": .., "roles": [..] }` | **不變**（已 meaningful）|

> `dimension` ∈ `"menu" | "button" | "GET" | "POST" | "DELETE"`(由 v2 推、`dimension_from_v2` 既有)。**此負載是 011 內部稽核欄、非對外 wire**(R4)。

## 4. 狀態轉移

無新狀態機。`RestoreOutcome` 三態語意不變(Restored/NoOp/NotFound),僅 `Restored` 多帶識別欄;`mutated()` 是純查詢(不轉移狀態)。
