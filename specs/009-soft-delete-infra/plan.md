# Implementation Plan: soft-delete-infra

**Branch**: `009-soft-delete-infra` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-soft-delete-infra/spec.md`

**Brainstorm**: [`docs/superpowers/009-soft-delete-infra.md`](../../docs/superpowers/009-soft-delete-infra.md)（Phase 0,6 決策 D1-D6 凍結）

---

## Summary

rev2 第 9 個 spec-kit feature、**Phase 2 P1 基礎設施**（[DESIGN §6.5](../../docs/INTEGRATION-DESIGN.md) soft delete infrastructure / [§10 Phase 2](../../docs/INTEGRATION-DESIGN.md) #2）。**立 soft-delete 機制 + 套既有 `sys_user` 為 proof**,其餘 6 entity 延後（各自被建時沿用 pattern)。三重防護:① 類型層 `SoftDeletable` trait（`find_active` 過濾 `deleted_at IS NULL`）② facade（`server/src/model/facade/`,唯一受管管道、不 re-export Entity、提供 `soft_delete` 設標記)③ build-failing lint test（facade 外 `use entity::` → 測試 fail)。schema:`sys_user` 加 `deleted_at TIMESTAMPTZ` + 把 `user_name` column unique 改 partial unique index `WHERE deleted_at IS NULL`(active 唯一、deleted 可重用同名)。新增共用 `entity` crate（首個 sea-orm model)。本 feature **動 rust-api worktree**（→ 兩段式 commit);無業務 endpoint、無 DTO、無 audit(下個 feature、依本)。

---

## Technical Context

**Language/Version**:Rust 1.86（`rust-api/rust-toolchain.toml`)；edition 2021。

**Primary Dependencies**（既有,無新外部 dep）:
- `sea-orm = "1.1.20"`（features `sqlx-postgres` / `runtime-tokio-rustls` / `macros`;workspace dep)、`sea-orm-migration = "1.1.20"`。
- 新增 **workspace member `entity` crate**（非外部 dep;`sea-orm.workspace = true`)。
- 不新增任何外部 crate（partial index 用 raw SQL、lint 用 `std::fs`+正則,[research R2/R5](./research.md))。

**Storage**:Postgres（既有;migration 加欄 + partial unique index)。

**Testing**:
- 單元測試:`cargo test -p server -p entity`（`find_active`/`soft_delete` SQL-build 斷言 + lint 掃描 fn 正反向 + lint test)。
- Acceptance（C-V):[contracts/verification-commands.md](./contracts/verification-commands.md) §1-§3（含 migration 套用 + partial unique 行為 + 既有不破)。

**Target Platform**:容器（rust-api dev/prod image)。

**Project Type**:Rust backend 資料基礎設施（rust-api worktree source + spec docs 外層)。

**Performance Goals**（對應 spec SC）:軟刪除標記不物理刪 + active 過濾(SC-001)、partial unique 可重用(SC-002)、繞過防護 build-fail(SC-003)、find_active SQL 含 IS NULL(SC-004)、既有不破(SC-005)。

**Constraints**:
- soft-delete pattern = DESIGN §6.5 三重防護,忠實落地、不自由設計。
- 只套 `sys_user`;不碰 `id` auto_increment（§2.10);trait 最小面（無 restore/update_active);`deleted_at` 為 internal 欄(不經 wire)。
- 不繼承 rev1 code（§I.5);research 未 grep rev1。

**Scale/Scope**:新增 `entity` crate（1 model)+ 1 migration + server `model/`（trait + facade)+ 1 lint integration test + lib.rs/Cargo.toml 接線。無 DTO、無業務 endpoint。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | N/A — soft-delete 為內部資料基礎設施,不涉特定 endpoint;反而是 Phase 3+ 業務 entity 安全刪除的地基 | ✅ Pass |
| 2 | 動到 base-web inline? | 否 — 只動 rust-api worktree（新 `entity` crate + migration + server model)+ spec docs,完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不涉 menu/auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock? | N/A — `deleted_at` 為 internal 欄、不經 wire;無 DTO/envelope/id 型/error code 表面。§I.3 不變式不適用 | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | 否 — `entity` crate / trait / facade / migration / lint 全新寫;research 只 grep rev2 產物 + DESIGN §6.5,**未 grep rev1**(§I.5;**RUSTAPI-SOURCE-ISOLATION** §III.1) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | 不違反;無拍板項受影響 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 走 **RUSTAPI-SOURCE-ISOLATION**（§III.1 預設可動);不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG ★ | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/009-soft-delete-infra/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交（16/16 PASS、0 提問)
├── research.md          # Phase 0（本次,R1-R5）
├── data-model.md        # Phase 1（本次,3 entity）
├── quickstart.md        # Phase 1（本次）
├── contracts/
│   └── verification-commands.md   # Phase 1（本次,C-V §1-§3）
└── checklists/
    └── requirements.md  # /speckit-specify 已交（16/16 PASS）
```

### Source Code (repository root)

```text
# rust-api worktree（→ 兩段式 commit）
rust-api/Cargo.toml                         ← workspace members 加 "entity"
rust-api/entity/Cargo.toml                  ← 新 crate;sea-orm.workspace = true
rust-api/entity/src/lib.rs                  ← 新:pub mod sys_user;
rust-api/entity/src/sys_user.rs             ← 新:DeriveEntityModel(含 deleted_at)
rust-api/migration/src/m20260529_000003_softdelete_sys_user.rs  ← 新:加欄 + drop unique + partial unique index
rust-api/migration/src/lib.rs               ← 註冊 m20260529_000003
rust-api/migration/Cargo.toml               ← (若需) entity.workspace = true（migration 一般不需 entity,raw SQL 即可)
rust-api/server/Cargo.toml                  ← 加 entity.workspace = true
rust-api/server/src/model/mod.rs            ← 新:pub mod soft_delete; pub mod facade;
rust-api/server/src/model/soft_delete.rs    ← 新:SoftDeletable trait（find_active default method)
rust-api/server/src/model/facade/mod.rs     ← 新:pub mod sys_user;
rust-api/server/src/model/facade/sys_user.rs ← 新:impl SoftDeletable + soft_delete + 不 re-export Entity
rust-api/server/src/main.rs                 ← 加 mod model;
rust-api/server/tests/entity_access_lint.rs ← 新:build-failing 繞過防護 lint test
```

**Structure Decision**:本 feature **動 rust-api worktree source**(新 `entity` crate + migration + server model + tests)+ spec docs。rust-api 內檔走 **§4.1 兩段式 commit**(worktree commit+push → 外層 `git add rust-api` bump SHA pin);spec docs 為外層檔(落 009 feature branch)。屬 **RUSTAPI-SOURCE-ISOLATION** 軌道（§III.1)。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 entity crate + DeriveEntityModel / R2 partial unique index migration〔raw SQL〕/ R3 SoftDeletable trait + find_active SQL-build 測 / R4 soft_delete statement SQL-build 測 / R5 build-failing lint test〔純掃描 fn 正反向〕）。

**結論**:5 項全解析、0 NEEDS CLARIFICATION。新增 1 workspace member（`entity` crate,用既有 sea-orm 1.1.20,無新外部 dep)。**遵守 §I.5**:只 grep rev2 產物 + DESIGN §6.5,未 grep / 未拷 rev1。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)— 3 entity（`sys_user` schema 變更 + sea-orm model / `SoftDeletable` trait / facade)
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)— C-V acceptance §1-§3（單測 + lint test + migration 套用 + partial unique 行為）
- [`quickstart.md`](./quickstart.md)— Path A 編譯+單測 / B migration 套用

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Spec/Plan 指向本 feature（本步更新)。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項:

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — Phase 1 contracts 純 soft-delete 機制/schema,無特定業務 endpoint | ✅ Pass |
| 2 | 仍否 — 未碰 base-web | ✅ Pass |
| 3 | 仍 N/A | ✅ Pass |
| 4 | data-model `deleted_at` 為 internal 欄、不經 wire;無 DTO/envelope 表面,§I.3 不變式不適用 | ✅ Pass |
| 5 | data-model/contracts 純 rust-api 自建 + sea-orm 官方;未拷 rev1 | ✅ Pass |
| 6 | 仍不違反 §II | ✅ Pass |
| 7 | 仍 RUSTAPI-SOURCE-ISOLATION（非 ★)、授權邊界內 | ✅ Pass |

**結果**:7 項仍全 PASS。Phase 1 設計未引入 base-web 改動 / wire endpoint / menu / rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。
