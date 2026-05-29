# Implementation Plan: sub-crate-setup

**Branch**: `012-sub-crate-setup` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-sub-crate-setup/spec.md`

**Brainstorm**: [`docs/superpowers/012-sub-crate-setup.md`](../../docs/superpowers/012-sub-crate-setup.md)（Phase 0，D1-D3 凍結 + Phase 3 衍生）

---

## Summary

rev2 第 12 個 spec-kit feature、**Phase 2 P1 後端基礎設施最後一個 feature**（[DESIGN §10 Phase 2](../../docs/INTEGRATION-DESIGN.md)）。**鋪 Casbin RBAC 的工具層地基**：把 `sea-orm-adapter`（Casbin↔Postgres policy 儲存）+ `xdb`（IP→地區解析）兩個工具 crate 從 rev1 **拷貝**引入 rev2 workspace（§11.6 / constitution §I.5 例外授權）、對齊 rev2 執行環境（adapter 既有 `runtime-tokio-rustls` default + casbin **bump 2.10→2.20**）、新增 `casbin_rule` 建表 migration（005、經 010 自動套、呼 adapter `up()` 為單一 schema 來源）、並以**活體 smoke** 證兩 crate 真能運作（adapter policy round-trip vs live postgres / xdb 解析已知 IP）。`axum-casbin` 重寫 + 受管 RBAC policy 層（soft-delete/protected/audit/CRUD）**移 Phase 3**（brainstorm 重定位）。守 007 FR-009 + 009 facade 邊界。**動 rust-api worktree → 兩段式 commit**。

---

## Technical Context

**Language/Version**：Rust 1.86（既有 rust-api workspace；無新語言）。

**Primary Dependencies**：
- **新增 workspace dep**：`casbin = { version = "2.20", default-features = false }`（user 拍板 bump rev1 2.10→現行最新穩定 2.20.0、[§6](../../CLAUDE.md) surface、非 pre-release）；`once_cell`（xdb 需）。
- 既有：`sea-orm 1.1.20`（features `sqlx-postgres, runtime-tokio-rustls, macros`）、`async-trait 0.1`、`tracing` / `tracing-subscriber`（皆 workspace、adapter/xdb 復用）。
- **新 workspace member**：`sea-orm-adapter`（features `default = ["postgres","runtime-tokio-rustls"]`，對齊 rev2）、`xdb`。

**Storage**：Postgres（既有；新增 `casbin_rule` 表，經 010 stack `up` 自動套用）。

**Testing**：
- **無新純函式邏輯**（拷貝 + wiring）→ acceptance（活體 smoke）為主；拷貝 crate 自帶單測一併納入（在 rev2 tokio runtime 下確認綠）。
- Acceptance（C-V）：[contracts/verification-commands.md](./contracts/verification-commands.md)（§0 casbin 2.20×adapter 編譯閘門 / §1 adapter round-trip / §2 xdb 解析 / §3 casbin_rule 自動套 + FR-009 regression / §4 既有不破）。

**Target Platform**：容器（dev/prod docker stack；migration 經 010 自動套）。

**Project Type**：後端基礎設施（rust-api 多 crate workspace；無前端、無 wire endpoint、無 enforce 接線）。

**Performance Goals**（對應 spec SC）：adapter round-trip 成功（SC-001）、xdb 解析回非空地區（SC-002）、casbin_rule 經自動 schema 機制建（SC-003）、既有不破（SC-004）。本 feature 不設延遲/吞吐目標（工具層地基；無消費者）。

**Constraints**：
- 守 007 FR-009 — server 不自動 migrate（casbin_rule 經 010 自動套、不改 server boot；adapter `new()` 內部 `up()` 屬 adapter crate、Phase 3 才接）。
- 守 009 entity-access lint — lint 只掃 `server/src`，新 crate 不在範圍、不觸 lint。
- **§I.5 RUSTAPI-SOURCE-ISOLATION 例外**：本 feature **拷貝 rev1**（sea-orm-adapter + xdb）— 屬 §11.6 / §I.5 例外清單明文授權；非「全新寫」常態、但在授權邊界內。標 rev1 出處 commit。
- 兩段式 commit（動 rust-api worktree）。

**Scale/Scope**：rust-api worktree 改動 = 新增 `sea-orm-adapter/`（拷貝 + `*.workspace` 對齊 + 可能依 casbin 2.20 修 Adapter trait + migration `if_not_exists`）+ `xdb/`（拷貝 + `ip2region.xdb` 資料檔 + 路徑）+ `migration/src/m20260529_000005_create_casbin_rule.rs`（呼 adapter `up()`）+ `Cargo.toml`（workspace members + casbin/once_cell dep）+ 活體 smoke 測試。**axum-casbin / enforce 接線 / 受管 policy 層（soft-delete/protected/audit/CRUD）/ policy seed = scope 外（Phase 3）**。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項：

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | N/A — 工具層地基，base-web 不消費;無 endpoint 範圍 | ✅ Pass |
| 2 | 動到 base-web inline? | 否 — 完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 本 feature 只備 policy **儲存層**，**不**接 enforce（enforce 屬 Phase 3 axum-casbin） | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock?(envelope/id 型/error code/enum) | N/A — 無 wire/DTO/envelope;casbin_rule 為內部 policy 儲存、非 wire | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | **是 — 但屬 §I.5 例外清單明文授權**（`sea-orm-adapter` + `xdb`，§11.6 拍板）。**這是 007 以來首個「拷貝 rev1」feature**，在授權邊界內;標 rev1 出處。casbin 2.10→2.20 bump 為 user 拍板（§6） | ✅ Pass（授權例外） |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | 不違反 — 本 feature **實作 §11.6 的拷貝處置**（adapter/xdb 拷貝不變）;brainstorm 重定位（axum-casbin 移 Phase 3）已回填 DESIGN §11.6、不改 012 對 §11.6 的遵循。**Phase 3 的 adapter-fork-for-soft-delete 才可能需 Amendment、非本 feature** | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — ★ 軌道皆 base-web（MODAL-WIRING / BASE-WEB-BUILD-CONFIG）;本 feature 屬 RUSTAPI-SOURCE-ISOLATION（§III.1、非 ★），拷貝在 §I.5 例外授權內 | ✅ Pass |

**結論**：7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

> 註：與 007-011（全新寫、§III.1 預設可動）關鍵差異 —— 012 **拷貝 rev1**（首個），但屬 §I.5 / §11.6 **明文授權例外**，非破例;casbin bump 2.20 經 §6 surface user 拍板。

---

## Project Structure

### Documentation (this feature)

```text
specs/012-sub-crate-setup/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交(16/16 PASS、0 提問)
├── research.md          # Phase 0(本次,R1-R6)
├── data-model.md        # Phase 1(本次)—— casbin_rule stock schema(adapter 擁有、無 soft-delete)
├── contracts/
│   └── verification-commands.md   # Phase 1(本次,C-V §0-§4)
├── quickstart.md        # Phase 1(本次,Path A/B/C)
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16/16 PASS)
```

### Source Code (rust-api worktree)

```text
rust-api/
├── Cargo.toml                                          ← workspace members 加 sea-orm-adapter / xdb;deps 加 casbin 2.20 / once_cell
├── sea-orm-adapter/                                    ← 拷貝 rev1(§11.6 授權)
│   ├── Cargo.toml                                      ← *.workspace 對齊 concrete;default=["postgres","runtime-tokio-rustls"];標 rev1 出處
│   └── src/{lib,adapter,entity,action,migration}.rs    ← 可能依 casbin 2.20 修 Adapter trait;migration 補 if_not_exists
├── xdb/                                                ← 拷貝 rev1(§11.6 授權)
│   ├── Cargo.toml                                      ← *.workspace 對齊;deps once_cell/tracing;標 rev1 出處
│   ├── src/{lib,searcher,ip_value}.rs
│   └── resources/ip2region.xdb                         ← 從 rev1 拷入;default 路徑對齊
└── migration/src/
    ├── m20260529_000005_create_casbin_rule.rs          ← 呼 sea_orm_adapter::up/down(單一 schema 來源)
    └── lib.rs                                          ← 註冊 005 到 Migrator::migrations()
```

**Structure Decision**：本 feature **動 rust-api worktree source**（新增 2 crate + migration 005）→ **兩段式 commit**（worktree commit + push fork、再回外層 bump SHA pin;同 007/008/009/011）。屬 §I.5 RUSTAPI-SOURCE-ISOLATION 的**拷貝例外**（§11.6 授權、首個拷貝 feature），非常態「全新寫」。沿用 011 的 in-crate `#[ignore]` 活體 smoke harness。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 兩 crate 引入 workspace member〔`*.workspace` 對齊〕/ R2 runtime 對齊〔**修正 brainstorm**:adapter 既有 `runtime-tokio-rustls` default、非 async-std;casbin bump 2.10→2.20、user 拍板〕/ R3 casbin_rule 走 migration 005 呼 adapter `up()` + `if_not_exists` 協調 new() 自動建表 / R4 xdb + ip2region.xdb 資料檔路徑 / R5 活體 smoke harness〔沿用 011〕/ R6 既有契約守恆〔007 FR-009 + 009 lint〕）。

**結論**：6 項全解析、0 NEEDS CLARIFICATION。**遵守 §I.5 例外**：只讀「被授權拷貝的 sea-orm-adapter / xdb」之 deps/schema（執行授權拷貝、非為 rev2 新設計衍生 grep）。**最高風險 = casbin 2.10→2.20 的 adapter Adapter-trait 相容**（user 知情接受;第一道閘門 = `cargo build -p sea-orm-adapter`）。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— `casbin_rule` 實體（stock schema、adapter 擁有、無 deleted_at、與 adapter `migration.rs` 對齊）+ 兩工具 crate 對外介面。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V acceptance §0-§4（casbin 2.20 編譯閘門 / adapter round-trip / xdb 解析 / casbin_rule 自動套 + FR-009 regression / 既有不破）。
- [`quickstart.md`](./quickstart.md)—— Path A 編譯閘門 / Path B adapter round-trip / Path C xdb + 既有不破。

**Agent context update**：CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項：

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — Phase 1 contracts 純 crate smoke + casbin_rule schema，無 base-web endpoint | ✅ Pass |
| 2 | 仍否 — 未碰 base-web | ✅ Pass |
| 3 | 仍 N/A — data-model/contracts 無 enforce 接線（policy 只儲存、Phase 3 才 enforce） | ✅ Pass |
| 4 | 仍 N/A — 無 wire/DTO;casbin_rule 為內部儲存、contracts 為 psql/cargo 驗收 | ✅ Pass |
| 5 | data-model/contracts 圍繞拷貝的 adapter/xdb + casbin_rule;拷貝屬 §I.5/§11.6 授權例外、已標出處;casbin 2.20 user 拍板 | ✅ Pass（授權例外） |
| 6 | 仍不違反 §II — 實作 §11.6 拷貝處置;Phase 3 adapter-fork 才涉 Amendment | ✅ Pass |
| 7 | 仍不觸 ★ 軌道;RUSTAPI-SOURCE-ISOLATION 拷貝在 §I.5 例外授權內 | ✅ Pass |

**結果**：7 項仍全 PASS。Phase 1 設計未引入 base-web 改動 / wire endpoint / enforce 接線 / 未授權 rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。

> **已知風險（非 violation、implement 時若觸發記 Deviation Log）**：casbin 2.10→2.20 若致 adapter `Adapter` trait impl 不相容 → 需依 casbin 2.20 修 adapter 原碼（超出純拷貝、屬「拷貝+相容性修補」）。第一道閘門 `cargo build -p sea-orm-adapter` 先驗;若需修，於本檔補 Deviation Log（同 010 D-1 格式）。
