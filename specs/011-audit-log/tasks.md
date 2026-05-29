---
description: "Task list for 011-audit-log implementation"
---

# Tasks: audit-log

**Input**: Design documents from `/specs/011-audit-log/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **純邏輯 → test-first**：`AuditSerialize` redact（US2）、`write_in_txn` insert SQL-build 形狀（Polish）。
- **transaction 接線 / 形狀對映無新純函式 → 由 acceptance 覆蓋**：`mutate_in_txn` / `soft_delete` 改寫 / 原子 rollback / 0-rows，皆需真實 DB transaction → C-V 整合驗證（對 dev live postgres，[verification §2-§4](./contracts/verification-commands.md)），於本 tasks 明示「無單元測試、由 acceptance 覆蓋」。
- **無 HTTP 業務 endpoint / 無 base-web modal → 無 CDP/curl 業務消費者**（soft_delete 為 facade fn，整合驗證直呼 facade）。

**Organization**：6 phase；3 個 user story phase 各對應 spec US1/US2/US3 + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔、無未完依賴）
- **[Story]**：User Story phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 rust-api worktree 內相對路徑（`rust-api/` 為 worktree root）

> **★ commit 提醒**：本 feature **動 rust-api worktree**（migration / entity / server model）→ **兩段式 commit**（worktree commit + push fork `rev2-admin-rust-api`，再回外層 bump SHA pin；同 007/008/009、與 010 outer-only 不同）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）；commit/push/merge 於 `executing-plans` / `finishing` 階段處理。

---

## Phase 1: Setup (Pre-flight)

**Purpose**：確認前置就緒。

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`；外層在 `011-audit-log`；`cargo -C rust-api build` 綠（009 既有狀態）；既有測試基線綠（`cargo test`，含 `entity_access_lint`）；確認**尚無** audit 檔（`ls rust-api/server/src/model/audit.rs rust-api/entity/src/sys_operation_log.rs` 皆不存在）。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：audit 機制骨架（表 / entity / 純資料型 / 統一原子寫入入口）—— US1/US2/US3 共同前提。**必須先完成才進 user story**。

- [ ] T002 在 `migration/src/m20260529_000004_create_sys_operation_log.rs` 新增建表 migration（沿用 001 的 `DeriveMigrationName` + `#[derive(Iden)] enum` + `create_table` DSL）：欄對齊 [data-model.md](./data-model.md)（`id` BIGSERIAL `big_integer().auto_increment().primary_key()` / `operation` `string_len(20)` / `entity_table` `string_len(64)` / `entity_id` `big_integer().null()` / `payload_before`·`payload_after` `json_binary().null()` / `operator_id` `big_integer().null()` / `operator_ip` INET `.custom(Alias::new("INET")).null()` / `trace_id` `string_len(64).null()` / `created_at` `timestamp_with_time_zone().not_null().default(Expr::current_timestamp())`）；`down` = `drop_table`。並在 `migration/src/lib.rs` 加 `mod` + `Box::new(...004...::Migration)`（[research R1](./research.md)）
- [ ] T003 在 `entity/src/sys_operation_log.rs` 新增 raw model（`#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]`、`table_name="sys_operation_log"`；欄型見 data-model：`payload_*: Option<Json>`、`operator_ip: Option<String>`、`created_at: DateTimeWithTimeZone`；**不** derive Serialize、**不** impl SoftDeletable）；`entity/src/lib.rs` 加 `pub mod sys_operation_log`（[research R2](./research.md)）
- [ ] T004 在 `server/src/model/audit.rs` 定義純資料型：`AuditOperation` enum（Insert/Update/SoftDelete/Restore，附 `as_str()` → `"SOFT_DELETE"` 等）+ `AuditEvent` struct（`operation` / `entity_table` / `entity_id: Option<i64>` / `payload_before`·`payload_after: Option<serde_json::Value>` / `operator: Option<...>` / `trace_id: Option<String>`）+ `AuditSerialize` trait 宣告（`fn audit_json(&self) -> serde_json::Value`）。**audit.rs 不 `use entity::`**（純資料；保 009 entity-access lint，[research R6 路線 b](./research.md)）；`server/src/model/mod.rs` 加 `pub mod audit`
- [ ] T005 在 `server/src/model/facade/sys_operation_log.rs` 新增 audit 寫入 facade（**唯一 import `entity::sys_operation_log` 之處**、被既有 entity-access lint 自然豁免）：`pub async fn write_in_txn(txn: &DatabaseTransaction, event: AuditEvent) -> Result<(), DbErr>` —— 把 `AuditEvent` 轉 `sys_operation_log::ActiveModel` 並 `.insert(txn)`；`facade/mod.rs` 加 `pub mod sys_operation_log`（[research R3/R6](./research.md)）
- [ ] T006 在 `server/src/model/audit.rs` 加 `mutate_in_txn`（**唯一寫入入口**、codebase 首個 transaction pattern）：`db.begin()` → 跑資料變動 closure（收 `&DatabaseTransaction`）→ 依結果呼 `facade::sys_operation_log::write_in_txn` → `txn.commit()`；任一步 `?` 失敗 → rollback（drop / 顯式）。簽名/closure 形狀由 implementer 依 `sea_orm::TransactionTrait` 定，**核心不變式：資料變動 + audit 同一 `DatabaseTransaction`、both-or-neither**（[research R3](./research.md)）

**Checkpoint**：audit 表 + entity + 純資料型 + 唯一原子寫入入口就緒；entity-access lint 仍綠（audit 寫入經 facade）

---

## Phase 3: User Story 1 — 受管變動原子留下不可變稽核（Priority: P1）🎯 MVP

**Goal**：受管軟刪 user 時，在 server 完成前於同一 transaction 自動寫一筆 SOFT_DELETE audit、與軟刪同生共死（原子）。

**Independent Test**：dev stack（010 自動套表）對一個 seed user 軟刪 → 恰 1 筆 `sys_operation_log`（SOFT_DELETE / entity_id 對 / payload_before 有值）、user 已軟刪；mid-txn 注入失敗 → 既無 audit 也未軟刪。

> **依賴註記**：US1 的接線（T007）在產出 `payload_before` 時呼叫 `AuditSerialize::audit_json()` → **需 US2 的 sys_user redact impl（T010）就緒**。executing-plans 應把 T010 排在 T007 之前（雖 US2 標 P2，但為 US1 正確 proof 的前置；三 story 共用同一 soft_delete 寫入路徑、刻意耦合）。

- [ ] T007 [US1] 改寫 `server/src/model/facade/sys_user.rs` 的 `soft_delete(db, id)`：經 `mutate_in_txn` —— txn 內 `find_active().filter(Id.eq(id)).one(&txn)` 取 active row → 構 `AuditEvent`（operation=SoftDelete、entity_table="sys_user"、entity_id=id、payload_before=`row.audit_json()`、payload_after=None、operator=None、trace_id=None）→ `update_many().col_expr(DeletedAt, now()).filter(Id.eq(id)).exec(&txn)` → `write_in_txn` → commit（原子）。保留既有 `soft_delete_query` 純 SQL-build 單測（009）；回傳型調整須在本 task 註明（[research R5](./research.md)）。**無新純函式單元測試（transaction 接線）→ 由 US1 acceptance 覆蓋**
- [ ] T008 [US1] Acceptance：[verification §2 + §3](./contracts/verification-commands.md) —— dev stack up（010 自動套表）；整合驗證（§0.1 harness：`server/tests/` 整合測試連 dev postgres 或 driver）呼 `soft_delete(<seed id>)` → psql 斷言**恰 1 筆**新 audit（operation=SOFT_DELETE / entity_table=sys_user / entity_id 對 / payload_after NULL）且 `sys_user.deleted_at` 已設；**原子性**：mid-txn 注入失敗 → end-state 無 audit 列 **且** user 未軟刪（both-or-neither）。對應 spec US1 + SC-001/SC-002

**Checkpoint**：US1 達成（受管變動原子留稽核）= MVP

---

## Phase 4: User Story 2 — 稽核不外洩敏感欄位（redact）（Priority: P2）

**Goal**：audit 的 payload 中密碼等敏感欄位以固定遮蔽值取代、非明文。

**Independent Test**：軟刪 user 後 audit 的 `payload_before->>'password'` == `"<redacted>"`（非明文 hash）；redact 純函式單測獨立可驗。

- [ ] T009 [P] [US2] **Test-first**（純函式）：在 `server/src/model/audit.rs`（或 facade/sys_user 測試模組）寫 `AuditSerialize for sys_user::Model` 的 redact 單測 —— 斷言 `audit_json()` 的 `password` == `"<redacted>"`、`user_name`/`id`/`deleted_at` 保留、JSON 物件形狀正確（red → 待 T010 green；[CLAUDE.md §3](../../CLAUDE.md) 純邏輯 test-first）
- [ ] T010 [US2] 在 `server/src/model/facade/sys_user.rs` impl `AuditSerialize for entity::sys_user::Model`：手動 `serde_json::json!({...})` 建 redacted JSON（`password: "<redacted>"`、其餘欄保留）。使 T009 green（[research R4](./research.md)）。（**此 impl 為 US1 T007 之前置**，見 Phase 3 依賴註記）
- [ ] T011 [US2] Acceptance：[verification §2 redact 側](./contracts/verification-commands.md) —— 軟刪後 psql `SELECT payload_before->>'password'` == `'<redacted>'`（非明文）。對應 spec US2 + SC-003

**Checkpoint**：US1+US2 = 受管變動原子留稽核且敏感欄位遮蔽

---

## Phase 5: User Story 3 — 無效操作不留雜訊稽核（0-rows no-op）（Priority: P3）

**Goal**：對不存在/已軟刪目標的軟刪不寫 audit。

**Independent Test**：對不存在/已刪 id 軟刪 → `sys_operation_log` count 不變、無錯誤。

> 依 US1（同一 soft_delete 寫入路徑）。0-rows 判斷在 T007 的 SELECT-before 結果為 `None` 時短路（不 update、不寫 audit）。

- [ ] T012 [US3] 在 T007 的 `soft_delete` 內補 0-rows 短路：`find_active(...).one(&txn)` 為 `None`（不存在/已軟刪）→ 不 update、不寫 audit、直接收尾（無錯誤）；確保正常 id 仍走完整路徑（[research R5](./research.md) + 子決策）。**無新純函式單元測試（接線分支）→ 由 US3 acceptance 覆蓋**
- [ ] T013 [US3] Acceptance：[verification §4](./contracts/verification-commands.md) —— 對不存在/已軟刪 id 呼 `soft_delete` → `sys_operation_log` count 不變、無錯誤。對應 spec US3 + SC-004

**Checkpoint**：三 user story 全 functional（原子留稽核 / redact / 0-rows no-op）

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**：純邏輯補測 + Constitution Compliance 自我覆查 + 契約守恆驗證。

- [ ] T014 [P] **Test-first/補測**（純 SQL-build）：在 `server/src/model/facade/sys_operation_log.rs` 測試模組寫 `write_in_txn` 構出的 `sys_operation_log` insert statement 形狀斷言（`ActiveModel` → `QueryTrait::build(Postgres)` 含 `operation`/`entity_table`/`payload_before` 等欄；仿 009 `soft_delete_query` build 斷言）
- [ ] T015 Constitution Compliance 自我覆查 + 契約守恆（[verification §5](./contracts/verification-commands.md)）：
    * (a) `grep -c "✅ Pass" specs/011-audit-log/plan.md` ≥ 14（Constitution 7+7）
    * (b) **FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中（server 仍不自動 migrate）
    * (c) **009 entity-access lint 續綠**：`cargo test -p server entity_access_lint` 綠（audit 寫入經 facade、`audit.rs` 不 `use entity::`）
    * (d) 既有測試全綠：`cd rust-api && cargo test`（含 008 envelope / 009 soft-delete + lint）
    * (e) `/health` 不破：`curl -fsS http://127.0.0.1:21081/health` = ok；active seed 仍可查（扣除 US1 軟刪的 1 個）
    * (f) scope 邊界：未加 HTTP audit middleware；INSERT/UPDATE/RESTORE 未真實接線（enum variant 已定義）；未建「facade 內漏 audit」build-failing lint（follow-up）；其他 6 entity 未 rollout
    * (g) **不可變**：`sys_operation_log` 無 `deleted_at`、未 impl SoftDeletable（FR-003）

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup；**阻斷所有 user story**（audit 表 + entity + 純資料型 + mutate_in_txn）
- **US1(Phase 3,P1)**：依 Foundational + **US2 的 T010 redact impl**（產 payload_before）；MVP
- **US2(Phase 4,P2)**：依 Foundational；T009→T010 test-first；**T010 為 US1 T007 前置**（耦合，見下）
- **US3(Phase 5,P3)**：依 US1（同一 soft_delete 路徑、0-rows 短路）
- **Polish(Phase 6)**：依所有 user story

### Within / Cross Phases（耦合誠實標註）

- 三 story 共用同一 `soft_delete` 寫入路徑與 audit 機制 → **非完全獨立**。實作順序建議：
  - Phase 2（T002→T003→T004→T005→T006）骨架
  - **T009→T010**（US2 redact，test-first；T010 為 T007 前置）
  - **T007**（US1 接線，用 T010 的 redact）→ **T012**（US3 0-rows 短路、與 T007 同檔同函式、緊接）
  - T008（US1 acceptance）/ T011（US2 acceptance）/ T013（US3 acceptance）可在接線完成後一併驗（共用 stack up）
  - T014（純 SQL-build 補測）/ T015（Constitution + 守恆）

### Parallel Opportunities

- T009（US2 redact 單測）與 T014（write_in_txn SQL-build 單測）為 [P]（不同檔/測試、純函式）。
- 三 story 的 acceptance（T008/T011/T013）共用同一 dev stack、序列驗（資源互斥）。
- T002（migration）/ T003（entity）不同檔，但 T003 entity 型 T005 facade 會用 → 建議序列。

---

## Implementation Strategy

### MVP First (US1，但含 US2 redact 前置)

1. Setup(T001)→ Foundational(T002-T006)→ US2 redact(T009-T010，US1 前置)→ US1 接線(T007)+ US3 短路(T012)
2. **STOP and VALIDATE**：dev stack 軟刪 user → 恰 1 筆 audit（redact 過）、原子、0-rows no-op
3. 達 MVP+：受管變動原子留稽核 + 敏感欄位遮蔽 + 無效操作 no-op

### Incremental Delivery

1. Foundational → US2 redact → US1 原子接線（MVP 核心）
2. + US3 0-rows no-op
3. + Polish（SQL-build 補測 + Constitution + lint 續綠 + FR-009 regression）
4. `superpowers:finishing-a-development-branch` → **兩段式 commit**（worktree commit + push fork `rev2-admin-rust-api` + 外層 bump SHA pin）+ merge --no-ff 回 `rev2-admin-root` + 更新 CHECKLIST/MILESTONES/§6 marker/DESIGN 回填

### Subagent Strategy（executing-plans 階段）

- Foundational(T002-T006)：audit 機制骨架（可一個 implementer 連續產出，或 migration+entity 一單元、型+facade+mutate_in_txn 一單元）
- US2(T009-T010)→ US1(T007)+ US3(T012)：因耦合於同一 soft_delete 路徑，建議**同一 implementer 連續處理 redact impl → 接線 → 0-rows**（避免跨 subagent 改同檔衝突），再分別對照 spec US1/US2/US3 驗收
- Polish(T014-T015)：補測 + 查核
- **★ commit 紀律**：兩段式 commit（動 rust-api worktree）；各 unit spec+quality 雙審

---

## Notes

- **兩段式 commit feature**：動 rust-api worktree（migration/entity/server model），與 007/008/009 同；與 010 outer-only 不同。
- **codebase 首個 transaction pattern**（research R3 grep 確認無既有用法）—— `mutate_in_txn` 立 pattern，後續 audit rollout / 業務寫入沿用。
- **守 009 entity-access lint（R6 路線 b）**：`audit.rs` 不 `use entity::`（純資料）；entity 寫入集中在 `facade/sys_operation_log.rs`（唯一管道、自然豁免）。T015(c) regression guard。
- **守 007 FR-009**：新表經 010 自動 migration 套用、server boot 不自動 migrate。T015(b) regression guard。
- **redact = 固定遮蔽值**（`"<redacted>"`、非雜湊/長度），手動 `json!` 建、不在 raw entity 加 Serialize（research R4）。
- **scope 邊界**：只 SOFT_DELETE 真實接線（其餘 operation enum 先定義）；無 HTTP middleware；無其他 entity rollout；bypass-lint defer（follow-up）。
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md（Constitution v1.0.0 §V）。
- `superpowers:executing-plans` 階段把這 15 個 task 編成 execution unit + 派 fresh implementer subagent。
