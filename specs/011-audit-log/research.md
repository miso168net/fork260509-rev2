# Research: 011-audit-log（Phase 0）

> 遵守 [CLAUDE.md §3](../../CLAUDE.md) + [constitution §I.5](../../.specify/memory/constitution.md) research 紀律:只 grep rev2 rust-api 真實產物、**全新寫、不 grep / 不拷 rev1**。
> 本 feature 無 wire endpoint / DTO / base-web 消費者 → 「wire 3 端對齊 grep」「CDP smoke」**N/A**。「rust service trait 返回型」以既有 `facade::sys_user::soft_delete` 真實簽名為準（下 R5）。

## grep 事實基準（rev2 rust-api 現有產物，2026-05-29，worktree `rev2-admin-rust-api`）

- **soft_delete 真實簽名**（`server/src/model/facade/sys_user.rs:36`）：`pub async fn soft_delete(db: &DatabaseConnection, id: i64) -> Result<UpdateResult, DbErr>`，內部 `Entity::update_many().col_expr(Column::DeletedAt, ...).filter(Column::Id.eq(id)).exec(db)`（單一 exec、**無 transaction**）。`find_active() -> Select<Entity>`（委派 `SoftDeletable` trait）。
- **既有 transaction 用法**：grep `TransactionTrait` / `.begin()` / `DatabaseTransaction` 於 `server/src` → **0 命中**。本 feature 引入 codebase **首個 transaction pattern**。
- **db handle**：`AppState.db: sea_orm::DatabaseConnection`（`server/src/state.rs:9`）；`connect_postgres() -> DatabaseConnection`（`infra/db.rs`）。
- **serde / serde_json**：workspace dep 已備（`serde.workspace=true` / `serde_json.workspace=true`，008 入；root `serde={features=["derive"]}` / `serde_json="1"`）。
- **entity Model derive**：`sys_user.rs` = `#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]` —— **未 derive Serialize**。`entity/Cargo.toml` 僅依 `sea-orm.workspace`（無 serde_json 直接 dep；但 sea-orm prelude re-export `Json` = `serde_json::Value`）。
- **migration pattern**（`m20260529_000001_create_sys_user.rs`）：`#[derive(DeriveMigrationName)] pub struct Migration` + `#[derive(Iden)] enum SysUser { Table, Id, ... }` + `manager.create_table(Table::create().table(...).if_not_exists().col(ColumnDef::new(...)...).to_owned())`；`down` = `drop_table`。`lib.rs` = `mod m...; ... Migrator::migrations() -> vec![Box::new(m...::Migration), ...]`。
- **sys_user.id**：`big_integer().primary_key()` **無 auto_increment**（007 顯式 seed id 1/2/3）；audit 表用 BIGSERIAL（auto_increment）。

---

## R1. `sys_operation_log` 表 + migration 004

**Decision**：新增 `migration/src/m20260529_000004_create_sys_operation_log.rs`（沿用 001 的 `DeriveMigrationName` + `Iden` enum + `create_table` DSL），欄對齊 [DESIGN §6.4](../../docs/INTEGRATION-DESIGN.md)：`id`（`big_integer().auto_increment().primary_key()` → postgres BIGSERIAL）、`operation`（`string_len(20).not_null()`）、`entity_table`（`string_len(64).not_null()`）、`entity_id`（`big_integer().null()`）、`payload_before`/`payload_after`（`json_binary().null()` → JSONB）、`operator_id`（`big_integer().null()`）、`operator_ip`（INET、見 R2）、`trace_id`（`string_len(64).null()`）、`created_at`（`timestamp_with_time_zone().not_null().default(Expr::current_timestamp())`）。`lib.rs` 加 `mod` + `Box::new(...004...::Migration)`。經 010 stack `up` 自動套用。

**Rationale**：audit 為**不可變 append-only**、**非 soft-deletable**（無 `deleted_at`、不 impl `SoftDeletable`）—— 守 FR-003。BIGSERIAL（auto_increment）因 audit 由系統大量寫入、需自動序號（與 sys_user 顯式 id 不同）。

**INET 欄**：sea-orm `ColumnDef` 無原生 `.inet()` builder → 用 `.custom(Alias::new("INET"))`（或 `ColumnType::custom`）產生 `INET` 欄。nullable。

---

## R2. entity `sys_operation_log` model

**Decision**：`entity/src/sys_operation_log.rs` = `#[derive(Clone, Debug, PartialEq, DeriveEntityModel)] #[sea_orm(table_name="sys_operation_log")]`，欄：`id: i64`（`primary_key`，auto_increment 預設 true）、`operation: String`、`entity_table: String`、`entity_id: Option<i64>`、`payload_before: Option<Json>`、`payload_after: Option<Json>`（`Json` = sea-orm prelude `serde_json::Value`）、`operator_id: Option<i64>`、`operator_ip: Option<String>`、`trace_id: Option<String>`、`created_at: DateTimeWithTimeZone`。`entity/src/lib.rs` 加 `pub mod sys_operation_log;`。

**Rationale**：`Json` 由 sea-orm prelude 提供、entity crate 無需加 serde_json dep。`operator_ip` 模為 `Option<String>`：本 feature **永遠寫 None**（無 middleware）、不觸 INET cast；真實 INET 值處理留 Phase 3 middleware 填時再評估（屆時可能需 `ipnetwork` feature）。**不 derive Serialize**（見 R4，避免 raw entity 被誤序列化外洩 password —— 雖 audit entity 無 password，但維持 entity 不可序列化的一致紀律）。

**Alternatives**：用 `sea-orm` 的 `ipnetwork` feature 把 operator_ip 模為 `IpNetwork` —— 否決（引入新 dep + 本 feature 永遠 None、不值得）。

---

## R3. `write_in_txn` + `mutate_in_txn`（唯一寫入入口、首個 transaction pattern）

**Decision**：`server/src/model/audit.rs`：
- `write_in_txn(txn: &DatabaseTransaction, event: AuditEvent) -> Result<(), DbErr>` —— 把 `AuditEvent` 轉 `sys_operation_log::ActiveModel` 並 `.insert(txn)`（在給定 txn 內）。
- `mutate_in_txn(db, build_event, change) ` —— **唯一寫入入口**：`let txn = db.begin().await?;` → 跑 `change(&txn)`（資料變動 closure，回傳變動結果 + 供 build_event 取 before/after）→ 依結果 `write_in_txn(&txn, event)` → `txn.commit()`；任一步 `?` 失敗 → drop txn 自動 rollback（或顯式 `txn.rollback()`）。簽名細節（closure 形狀、event builder 時機）由 implementer 依 sea-orm `TransactionTrait` 定，**核心不變式：資料變動 + audit 寫入同一 `DatabaseTransaction`、both-or-neither**。

**Rationale**：codebase 無既有 transaction 用法（grep 0）→ 本 feature 立 pattern。`TransactionTrait::begin` 回 `DatabaseTransaction`，其 `?`-失敗於 drop 時 rollback（sea-orm 語意）。`mutate_in_txn` 把「改 + audit」綁死，使呼叫端無法只改不 audit（D3 結構強綁）。

**關鍵**：`soft_delete` 簽名 `(db: &DatabaseConnection, id)` 保留（呼叫端不變）；內部改走 `mutate_in_txn`。

**Alternatives**：每個 facade fn 各自手寫 `db.begin()` + `write_in_txn` + commit —— 否決（重複、易漏配 audit；wrapper 把正確路徑變成唯一順手路徑）。

---

## R4. `AuditSerialize` redact（手動 JSON、不在 raw entity 加 Serialize）

**Decision**：`AuditSerialize` trait（in `audit.rs`）：`fn audit_json(&self) -> serde_json::Value`，**手動**用 `serde_json::json!({...})` 逐 entity 建 JSON、敏感欄位填固定遮蔽值 `"<redacted>"`。`impl AuditSerialize for entity::sys_user::Model`：輸出 `{ id, user_name, password: "<redacted>", deleted_at }`（password 遮蔽、其餘保留）。純函式 → **test-first**。

**Rationale**：entity Model 未 derive `Serialize`（grep 確認）；**刻意不加** —— 手動建 JSON 才能精確控制 redact、且避免 raw entity 在別處被誤 `serde_json::to_value` 連 password 一起序列化外洩。固定遮蔽值（非雜湊/長度）符 §6.4「top-level field replace `"<redacted>"`」。

**Alternatives**：給 entity derive `Serialize` + `#[serde(skip)]`/自訂 serializer —— 否決（skip 會讓欄位消失而非「遮蔽」、且 derive Serialize 開了 raw entity 被序列化的口子）。

---

## R5. facade `soft_delete` 改寫（接 mutate_in_txn）+ 0-rows 行為

**Decision**：改寫 `facade::sys_user::soft_delete(db, id)`：經 `mutate_in_txn` —— 在 txn 內先 `find_active().filter(Id.eq(id)).one(&txn)` 取 active row（取 `payload_before` = `row.audit_json()` redacted）；若 `None`（不存在/已刪）→ **不寫 audit、不 update**（0-rows no-op、txn 直接 commit 或不開）；若有 → `update_many().col_expr(DeletedAt, now()).filter(Id.eq(id)).exec(&txn)` → `write_in_txn(SOFT_DELETE event: entity_table="sys_user", entity_id=id, before=redacted, after=None, operator=None, trace_id=None)` → commit。回傳型可保留 `Result<UpdateResult, DbErr>` 或調整為表達 0-rows（implementer 定，須在 tasks 註明）。

**Rationale**：SELECT-before 才能 capture `payload_before`（D2 + 子決策）；0-rows 判斷靠 SELECT 結果（比 update 的 rows_affected 更早、可省去無謂 update）。`payload_after = None`（軟刪無新值，子決策）。operator/trace = None（無 auth/middleware）。

**並發註記**（spec clarify Deferred）：同列並發軟刪的 SELECT-then-UPDATE race 屬 plan-level；本 proof 單執行緒驗收不觸發，Phase 3+ 多寫入路徑時以 transaction 隔離級別 / `find_active` 過濾天然收斂評估。

---

## R6. enforcement lint defer + 既有 entity-access lint 守恆

**Decision**：本 feature **不**新增「facade 內寫入漏 audit」的 build-failing lint（D3、登記 follow-up）；靠 `mutate_in_txn` 結構強綁 + 文件慣例。**既有 009 `server/tests/entity_access_lint.rs`（entity:: 只能在 facade 內）必須續綠** —— 新 `audit.rs` 在 `server/src/model/`（非 facade 目錄）會 `use entity::sys_operation_log`，故 audit.rs 對 entity 的存取需安排為不觸發既有 lint：audit.rs 用 `sys_operation_log` 寫入 → 若 lint 規則是「facade 外不得 `use entity::`」，audit.rs 會被 flag。

**關鍵待 implementer 處置**：兩條相容路線（tasks 擇一並註明）——（a）把 audit 寫入也歸入 facade 豁免目錄（如 `model/facade/` 或把 lint 豁免擴及 `model/audit.rs`）；（b）audit.rs 不直接 `use entity::sys_operation_log`，改由 facade 層持有 entity 寫入、audit.rs 只收 `AuditEvent`（純資料）。**傾向 (b)**：audit.rs 收 `AuditEvent`（不 import entity），實際 `sys_operation_log::ActiveModel` 建構放在一個 facade（如 `facade/sys_operation_log.rs`，唯一管道、被既有 lint 自然豁免）—— 保持「entity:: 只在 facade」不變式不破。

**Rationale**：009 lint 是現存綠燈守門員，本 feature 不得弄破它。路線 (b) 讓 audit 寫入也遵守 facade 邊界（sys_operation_log 也有自己的 facade），架構一致、lint 續綠。

**Alternatives**：擴 lint 豁免清單把 audit.rs 加入 —— 可行但弱化「只 facade」純粹性；(b) 較乾淨。最終由 implementer 在 data-model/tasks 定案並註明。

---

## Research 結論

6 項全解析、0 NEEDS CLARIFICATION。**無新外部 dep**（sea-orm transaction/Json + serde_json 皆既有）、**全新寫 rust-api source**（未拷 rev1，§I.5 RUSTAPI-SOURCE-ISOLATION new-written）。守 007 FR-009（新表經 010 自動套、server 不自動 migrate）+ 009 facade 邊界（R6 路線 (b) 保 entity-access lint 續綠）。唯一架構新 pattern = codebase 首個 transaction（R3）。
