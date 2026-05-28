# Implementation Plan: response-envelope

**Branch**: `008-response-envelope` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-response-envelope/spec.md`

**Brainstorm**: [`docs/superpowers/008-response-envelope.md`](../../docs/superpowers/008-response-envelope.md)（Phase 0,5 決策凍結）

---

## Summary

rev2 第 8 個 spec-kit feature、**Phase 2 P1 基礎設施**（DESIGN §10 Phase 2 #3「envelope 對齊」),選為「最小可獨立完成」的 Phase 2 feature。建立 rust-api 統一回應契約基礎型別:成功信封 `Res<T>`（`{data, code, msg}`、`code` 為 string、無 `success`、欄位序 data→code→msg）+ `IntoResponse`;完整業務 `BizCode` 矩陣 enum（對齊 mock 釘死集,只 wire `0000`/`4040`/`5000`)；`AppError`（thiserror,最小 variant `NotFound`/`Internal`)+ `IntoResponse`;並接 axum `.fallback()` → 「path 不存在」回 `4040`/HTTP404 作第一個 live 消費者。`/health` 維持純 text。本 feature **動 rust-api worktree**（→ 兩段式 commit)；無業務 endpoint、無 DTO、不做 camelCase 機制。

---

## Technical Context

**Language/Version**:Rust 1.86（`rust-api/rust-toolchain.toml`）;edition 2021。

**Primary Dependencies**（既有 + 新增 1）:
- 既有:`axum = "0.7"`、`serde = "1"`(derive)、`thiserror = "1"`、tokio / tracing。
- **新增:`serde_json = "1"`**（workspace + server;單測 assert 序列化字串需直接 dep;Cargo.lock 已解析 1.0.150 transitive,stable 無 prerelease,符合 [§6](../../CLAUDE.md)）。
- 不新增 `convert_case`（本 feature 不做 camelCase 機制,[research R3](./research.md)）。

**Storage**:N/A（純回應型別,無 DB / 無 Redis 讀寫）。

**Testing**:
- 單元測試:`cargo test -p server envelope error`（信封序列化形狀 + BizCode 全矩陣 + AppError→信封 映射）。
- Acceptance（C-V）:[contracts/verification-commands.md](./contracts/verification-commands.md) §1-§3（含 404 live curl + /health 不變）。

**Target Platform**:容器（rust-api dev/prod image）。

**Project Type**:Rust backend 回應契約基礎（rust-api worktree source + spec docs 外層)。

**Performance Goals**（對應 spec SC）:404 回標準信封（SC-001)、信封序列化形狀正確（SC-002)、code 詞彙全集對應（SC-003)、內部錯誤 5000（SC-004)、/health 不變（SC-005)。

**Constraints**:
- 信封形狀 / code 集為 mock 契約事實（DESIGN §3.2/§3.3),忠實實作、不自由設計。
- `code` 為 string、無 `success`、`data: None`→`null`(不 skip)、欄位序 data→code→msg。
- 不繼承 rev1 code（§I.5）。

**Scale/Scope**:rust-api server crate;新增 2 模組（`envelope.rs` / `error.rs`)+ `main.rs` 接 fallback + workspace/server Cargo.toml 加 `serde_json`。無 DTO、無業務 endpoint。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | N/A — envelope 是回應契約基礎,不涉特定 endpoint;反而是讓 Phase 3+ endpoint 能對齊 base-web 契約的地基 | ✅ Pass |
| 2 | 動到 base-web inline? | 否 — 只動 rust-api worktree（server/src + Cargo.toml)+ spec docs,完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不涉 menu/auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock? | ✅ **主動對齊** — envelope `{data,code,msg}`、`code`=string、無 `success`、業務 error `5xxx` 區段皆為 §I.3 鎖定不變式,本 feature 正是忠實實作它們(非自由設計) | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?grep rev1? | 否 — research 只 grep rev2 產物（Cargo.toml/lock、main.rs、DESIGN/MOCK 權威);全新寫,**RUSTAPI-SOURCE-ISOLATION**（§III.1) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | 不違反;§11.10 wire 細節（business error `5xxx`)本 feature 遵循（`5000` 在 5xxx 自訂授權內) | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 走 **RUSTAPI-SOURCE-ISOLATION**（§III.1 預設可動);不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG ★ | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/008-response-envelope/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交
├── research.md          # Phase 0（本次,R1-R4）
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
rust-api/Cargo.toml                  ← workspace deps 加 serde_json = "1"
rust-api/server/Cargo.toml           ← 加 serde_json.workspace = true
rust-api/server/src/envelope.rs      ← 新:Res<T> + 建構子 + IntoResponse + BizCode 完整矩陣
rust-api/server/src/error.rs         ← 新:AppError(thiserror;NotFound/Internal)+ IntoResponse
rust-api/server/src/main.rs          ← 加 mod envelope; mod error; + .fallback(404→AppError::NotFound);/health 不動
```

**Structure Decision**:本 feature **只動 rust-api worktree source**（server crate)+ spec docs。rust-api 內檔走 **§4.1 兩段式 commit**（worktree commit+push → 外層 `git add rust-api` bump SHA pin)；spec docs 為外層檔（落 008 feature branch）。屬 **RUSTAPI-SOURCE-ISOLATION** 軌道（§III.1)。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 code 矩陣確切字串 / R2 axum fallback+IntoResponse pattern / R3 serde 欄位順序+Option→null+serde_json dep / R4 AppError thiserror+IntoResponse）。

**結論**:4 項全解析、0 NEEDS CLARIFICATION。新增 1 直接 dep（`serde_json = "1"`,stable)。**遵守 §I.5**:只 grep rev2 產物 + DESIGN/mock 權威,未拷 rev1。

---

## Phase 1 Status

Design：
- [`data-model.md`](./data-model.md)— 3 entity（`Res<T>` / `BizCode` 完整矩陣 / `AppError` 最小 variant）
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)— C-V acceptance §1-§3（單測 + 404 live + envelope 不漏 grep）
- [`quickstart.md`](./quickstart.md)— Path A 編譯+單測 / B 404 live

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 plan（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項:

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — Phase 1 contracts 純信封/404,無特定業務 endpoint | ✅ Pass |
| 2 | 仍否 — 未碰 base-web | ✅ Pass |
| 3 | 仍 N/A | ✅ Pass |
| 4 | data-model `Res<T>`/`BizCode` 明示對齊 §I.3 不變式（code string、無 success、欄位序、5xxx) | ✅ Pass |
| 5 | data-model/contracts 純 rust-api 自建 + crate 官方;未拷 rev1 | ✅ Pass |
| 6 | 仍不違反 §II;§11.10 遵循 | ✅ Pass |
| 7 | 仍 RUSTAPI-SOURCE-ISOLATION（非 ★)、授權邊界內 | ✅ Pass |

**結果**:7 項仍全 PASS。Phase 1 設計未引入 base-web 改動 / wire endpoint / menu / rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。
