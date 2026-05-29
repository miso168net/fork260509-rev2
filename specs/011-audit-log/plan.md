# Implementation Plan: audit-log

**Branch**: `011-audit-log` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-audit-log/spec.md`

**Brainstorm**: [`docs/superpowers/011-audit-log.md`](../../docs/superpowers/011-audit-log.md)（Phase 0，3 決策 D1-D3 + 子決策凍結）

---

## Summary

rev2 第 11 個 spec-kit feature、**Phase 2 P1 後端基礎設施 #4**（[DESIGN §10 Phase 2](../../docs/INTEGRATION-DESIGN.md)；[§1.4 三方資料變動紀律](../../docs/INTEGRATION-DESIGN.md) 第 2 支柱 audit）。**建統一資料變動 audit 基礎設施**：新增 `sys_operation_log` 表（[§6.4 schema](../../docs/INTEGRATION-DESIGN.md)，經 010 自動套用）+ 統一寫入 API（`write_in_txn` + 唯一寫入入口 `mutate_in_txn`）+ 敏感欄位 redact（`AuditSerialize`），並以 009 唯一寫入路徑 `facade::sys_user::soft_delete` 作活體 proof（軟刪 + audit 同一 transaction、原子）。守 007 FR-009（server 不自動 migrate、新表經既有自動 migration）+ 009 soft-delete facade 邊界。**本 feature 動 rust-api worktree** → **兩段式 commit**（與 010 outer-only 不同）。

---

## Technical Context

**Language/Version**：Rust 1.86（既有 rust-api workspace；無新語言）。

**Primary Dependencies**（既有，無新增）：
- `sea-orm` / `sea-orm-migration`（既有 workspace dep）—— 本 feature 首次用 `TransactionTrait`（`db.begin()` → `DatabaseTransaction`）+ `Json`（JSONB 欄、= `serde_json::Value`，由 sea-orm prelude 提供）。
- `serde` / `serde_json`（008 已入 workspace dep）—— redact JSON 建構（`serde_json::json!`）。
- 既有 `entity` crate（009 建，含 `sys_user`）、`server/src/model/{soft_delete.rs, facade/}`（009）、`migration`（001-003）。
- 既有 `database_url` secret + AppState（`db: DatabaseConnection`）。

**Storage**：Postgres（既有；新增 `sys_operation_log` 表，經 010 stack `up` 自動套用）。

**Testing**：
- **單元 test-first**：`AuditSerialize` redact（純函式）；`write_in_txn` insert statement 形狀（純 SQL-build，仿 009 `soft_delete_query` 的 `QueryTrait::build` 斷言）。
- Acceptance（C-V）：[contracts/verification-commands.md](./contracts/verification-commands.md)（軟刪 user → 恰 1 筆 audit、redact、原子 rollback、0-rows no-op、FR-009/既有不破 regression）。

**Target Platform**：容器（dev/prod docker stack；migration 經 010 自動套）。

**Project Type**：後端基礎設施（rust-api 單 crate + entity/migration 子 crate；無前端、無 wire endpoint）。

**Performance Goals**（對應 spec SC）：受管變動恰 1 筆 audit（SC-001）、原子 rollback（SC-002）、redact 無明文（SC-003）、0-rows no-op（SC-004）、既有不破（SC-005）。本 feature 不設延遲/吞吐目標（infra proof；audit volume/retention 屬 ops/Phase 6）。

**Constraints**：
- 守 007 FR-009 — server 不自動 migrate（新表經既有自動 migration、不改 server boot）。
- 守 009 soft-delete facade 邊界 — 資料存取仍只經 facade；既有 entity-access lint 不破。
- audit 原子性（D2）— audit 與資料變動同一 transaction。
- 不繼承 rev1 code（§I.5 RUSTAPI-SOURCE-ISOLATION）— audit/entity/migration 全新寫、不拷 rev1。
- 兩段式 commit（動 rust-api worktree）。

**Scale/Scope**：rust-api worktree 改動 = 新增 `migration/src/m20260529_000004_create_sys_operation_log.rs` + `entity/src/sys_operation_log.rs`（+ lib.rs 註冊）+ `server/src/model/audit.rs`（write_in_txn / mutate_in_txn / AuditEvent / AuditOperation / AuditSerialize）+ sys_user 的 `AuditSerialize` 實作 + 改寫 `facade::sys_user::soft_delete`（接 mutate_in_txn）。其餘 entity / HTTP middleware / INSERT·UPDATE·RESTORE 接線 / bypass-lint = scope 外（follow-up）。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項：

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | N/A — audit 為內部資料變動編排，base-web 不消費 audit；無 endpoint 範圍 | ✅ Pass |
| 2 | 動到 base-web inline? | 否 — 完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不涉 menu/auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock?(envelope/id 型/error code/enum) | N/A — 無 wire/DTO/envelope；audit record 為內部資料、非 wire 回應；redact 為安全屬性、非 wire shape | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | 否 — audit/entity/migration **全新寫**（new-written）；**本 feature 動 rust-api source（§I.5 RUSTAPI-SOURCE-ISOLATION 範圍內）但僅新寫、未拷 rev1** | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | 不違反；無拍板項受影響（audit 屬 §1.4 既定設計、非 §II 拍板爭點） | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — ★ 軌道皆 base-web（MODAL-WIRING / BASE-WEB-BUILD-CONFIG）；本 feature 純 rust-api source、屬 §III.1 預設可動（RUSTAPI-SOURCE-ISOLATION，new-written）、無需額外授權 | ✅ Pass |

**結論**：7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

> 註：與 010（outer-only、連 rust-api source 都不碰）關鍵差異 —— 011 **動 rust-api source**，但屬 §I.5 RUSTAPI-SOURCE-ISOLATION 的「全新寫」常態軌道（§III.1 預設可動），非 ★ 軌道，且未拷 rev1，故仍 PASS。

---

## Project Structure

### Documentation (this feature)

```text
specs/011-audit-log/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交(16/16 PASS、0 提問)
├── research.md          # Phase 0(本次,R1-R6)
├── data-model.md        # Phase 1(本次)—— 新實體 sys_operation_log(與 010「無 data-model」不同)
├── contracts/
│   └── verification-commands.md   # Phase 1(本次,C-V §1-§5)
├── quickstart.md        # Phase 1(本次)
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16/16 PASS)
```

### Source Code (rust-api worktree)

```text
rust-api/
├── migration/src/
│   ├── m20260529_000004_create_sys_operation_log.rs   ← 新增(§6.4 schema、靜態 DDL)
│   └── lib.rs                                          ← 註冊 004 到 Migrator::migrations()
├── entity/src/
│   ├── sys_operation_log.rs                            ← 新增 raw model(BIGSERIAL/JSONB/INET 欄)
│   └── lib.rs                                          ← 加 mod sys_operation_log
└── server/src/model/
    ├── audit.rs                                        ← 新增:AuditEvent / AuditOperation /
    │                                                      write_in_txn / mutate_in_txn / AuditSerialize
    ├── facade/sys_user.rs                              ← 改寫 soft_delete 接 mutate_in_txn(原子) +
    │                                                      impl AuditSerialize for sys_user(redact password)
    └── mod.rs                                          ← 加 pub mod audit
```

**Structure Decision**：本 feature **動 rust-api worktree source**（migration / entity / server model）→ **兩段式 commit**（worktree commit + push fork，再回外層 bump SHA pin；同 007/008/009、與 010 outer-only 不同）。屬 §I.5 RUSTAPI-SOURCE-ISOLATION 的「全新寫」常態軌道（§III.1 預設可動），不觸 base-web ★ 軌道。沿用 009 的 facade/trait/lint 模板與 entity/migration 結構。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 sys_operation_log 表 + migration 004〔BIGSERIAL/JSONB/INET 欄型 DSL〕/ R2 entity model〔sea-orm `Json` + INET 模為 Option<String>〕/ R3 `write_in_txn` + `mutate_in_txn` 唯一寫入入口〔首個 transaction pattern、`db.begin()`〕/ R4 `AuditSerialize` redact〔手動 `serde_json::json!`、不在 raw entity 加 Serialize〕/ R5 facade soft_delete 改寫接線〔SELECT before → update → audit、0-rows no-op〕/ R6 enforcement lint defer + 既有 entity-access lint 守恆）。

**結論**：6 項全解析、0 NEEDS CLARIFICATION。**遵守 §I.5**：只 grep rev2 rust-api 真實產物（`facade/sys_user.rs` / `soft_delete.rs` / `entity/` / `migration/` / `Cargo.toml` / `state.rs`），全新寫、未 grep / 未拷 rev1。守 007 FR-009 + 009 facade 邊界。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— `sys_operation_log` 實體（欄、型、約束、append-only 不可變、與 §6.4 對齊）+ AuditEvent in-memory 形狀 + AuditOperation enum。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V acceptance §1-§5（軟刪 → 1 筆 audit + redact / 原子 rollback / 0-rows no-op / 既有不破 / FR-009 regression）。
- [`quickstart.md`](./quickstart.md)—— Path A 正向 audit + redact / Path B 原子 rollback / Path C 0-rows no-op。

**Agent context update**：CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項：

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — Phase 1 contracts 純 audit 寫入編排，無 base-web endpoint | ✅ Pass |
| 2 | 仍否 — 未碰 base-web | ✅ Pass |
| 3 | 仍 N/A | ✅ Pass |
| 4 | 仍 N/A — 無 wire/DTO；data-model 為內部 audit 實體、contracts 為 psql 驗收 | ✅ Pass |
| 5 | data-model/contracts 純新寫 rust-api；未拷 rev1、屬 RUSTAPI-SOURCE-ISOLATION new-written | ✅ Pass |
| 6 | 仍不違反 §II | ✅ Pass |
| 7 | 仍不觸 ★ 軌道；rust-api source 屬 §III.1 預設可動 | ✅ Pass |

**結果**：7 項仍全 PASS。Phase 1 設計未引入 base-web 改動 / wire endpoint / menu / rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。

---

## Deviation Log（Constitution v1.0.0 §V — 實作期偏離須記錄）

**D-1（commit `484c3f7`）:live-DB 整合驗收 harness 偏離 [verification-commands.md §0.1](./contracts/verification-commands.md) route (a)。**

- **背景**:契約 §0.1 原訂「route (a):`server/tests/` 整合測試連 `DATABASE_URL` 跑 soft_delete 後斷言」。實作期確認 `server` 為 **bin-only crate(無 `lib.rs`,`main.rs` 以私有 `mod model;` 宣告)** → `server/tests/` 整合測試**無法** `use server::model::...`(既有 `tests/entity_access_lint.rs` 只讀檔、不用 crate API,故不受限)。
- **處置**:改用 **in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`** 測試,放 `server/src/model/facade/sys_operation_log.rs`(facade/ 為 entity-access lint 豁免目錄、可直接查 `entity::sys_operation_log`/`entity::sys_user` 並呼 `facade::sys_user::soft_delete`)。預設 `cargo test` 跳過 `#[ignore]`、無 DB/CI 仍綠;`cargo test -p server -- --ignored --test-threads=1` 在 compose 網路內對 dev postgres 跑 3 個驗收。
- **與契約精神調和**:§0.1 本就允許「DB 不可達時 `#[ignore]`/env-gate 跳過」,偏離僅在**位置**(src in-crate vs `tests/`),權威斷言(`sys_operation_log` 實際列 + `sys_user.deleted_at` 狀態)與覆蓋(SC-001~004)不變。不為 011 副帶引入 server lib target(屬更廣架構決策,§1 不過度建構)。
- **驗證**:3 個 live 測試(1 筆 redact / 原子 rollback / 0-rows no-op)對 dev postgres 親驗通過;no-DB 25+3 ignored + entity_access_lint 17 全綠。final holistic review 認可此偏離。
- **follow-up**:日後若要真正 `tests/` 整合 harness 驅動 crate API,需給 server 加 `lib.rs` lib target(登記 [CHECKLIST §2.14](../../docs/INTEGRATION-CHECKLIST.md))。

**D-2（commit `484c3f7`）:`operator_ip` 寫入由 [data-model.md](./data-model.md) 的 `Set(operator.and_then(ip))` 改為 `None→NotSet`。**

- **背景**:data-model 欄位對映訂 `operator_ip = operator.and_then(|o| o.ip)`(隱含 `Set(Option<String>)`)。live-DB 驗收抓到:對 `INET` 欄 `Set(None::<String>)` 會讓 sea-orm 送 `NULL::text`,postgres 以 code **42804**(inet vs text)拒絕 → 連寫 None 都失敗。
- **處置**:`facade/sys_operation_log.rs` 改 `None→NotSet`(略過欄、DB 自填 native NULL)、`Some(ip)→Set(Some(ip))`。surgical、不動 schema(仍 INET、守 DESIGN §6.4)、不動 entity 型(仍 `Option<String>`)。
- **殘留 gap**:`Some(ip)→Set(text)` 分支對 INET **仍會** 42804;本 feature `operator` 永遠 None、不觸,真值寫入留 Phase 3 middleware(code 內已註;登記 [CHECKLIST §2.14](../../docs/INTEGRATION-CHECKLIST.md))。
- **驗證**:`write_in_txn` SQL-build 純單測斷言 `operator: None` 時 `operator_ip` 欄不出現於 INSERT;3 個 live 測試通過。
