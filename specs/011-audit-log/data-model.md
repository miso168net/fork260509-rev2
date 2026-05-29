# Data Model: 011-audit-log（Phase 1）

> 對齊 [DESIGN §6.4 sys_operation_log](../../docs/INTEGRATION-DESIGN.md)。本 feature **新增 1 個資料實體**（與 010「無 data-model」不同）。所有命名以 [research.md](./research.md) grep 的真實 rust-api pattern 為準（implementer act on actual code、不盲信本檔推測命名）。

## 實體 1：`sys_operation_log`（統一 audit、不可變 append-only）

**性質**：不可變稽核紀錄。**非 soft-deletable**（無 `deleted_at`、不 impl `SoftDeletable`）、不被更新覆蓋（FR-003）。由系統大量寫入 → BIGSERIAL 自動序號。

### 欄位（migration 004 建表、對齊 §6.4）

| 欄 | 型（postgres） | sea-orm migration DSL | entity 欄型 | null | 說明 |
|---|---|---|---|---|---|
| `id` | BIGSERIAL PK | `big_integer().auto_increment().primary_key()` | `i64`（primary_key） | NO | 自動序號 |
| `operation` | VARCHAR(20) | `string_len(20).not_null()` | `String` | NO | `INSERT`/`UPDATE`/`SOFT_DELETE`/`RESTORE`（本 feature 只寫 `SOFT_DELETE`） |
| `entity_table` | VARCHAR(64) | `string_len(64).not_null()` | `String` | NO | 受影響表名（proof = `"sys_user"`） |
| `entity_id` | BIGINT | `big_integer().null()` | `Option<i64>` | YES | 受影響紀錄 id |
| `payload_before` | JSONB | `json_binary().null()` | `Option<Json>` | YES | 變動前內容（redact 後） |
| `payload_after` | JSONB | `json_binary().null()` | `Option<Json>` | YES | 變動後內容（SOFT_DELETE = null） |
| `operator_id` | BIGINT | `big_integer().null()` | `Option<i64>` | YES | 操作者（本 feature 永遠 None＝系統） |
| `operator_ip` | INET | `.custom(Alias::new("INET")).null()` | `Option<String>` | YES | 來源 IP（本 feature 永遠 None；INET、見 research R2） |
| `trace_id` | VARCHAR(64) | `string_len(64).null()` | `Option<String>` | YES | tracing span id（本 feature 永遠 None） |
| `created_at` | TIMESTAMPTZ | `timestamp_with_time_zone().not_null().default(Expr::current_timestamp())` | `DateTimeWithTimeZone` | NO | 建立時間（DB 預設 now()） |

- `Json` = sea-orm prelude `serde_json::Value`（entity crate 無需加 serde_json dep）。
- entity derive：`#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]`（**不** derive Serialize、不 impl SoftDeletable）。
- `migration/src/lib.rs` 註冊 `m20260529_000004_create_sys_operation_log::Migration` 於 `Migrator::migrations()` vec 末。

### 關係

- 無 FK 強約束（audit 為獨立 append-only log；`entity_table` + `entity_id` 為**邏輯**指向，刻意不設 FK —— 避免被指向表的刪除/演進綁住、且 audit 須能記錄已不存在的紀錄）。

### 不變式

- **append-only**：只 INSERT，不 UPDATE/DELETE/soft-delete（FR-003）。
- **redact**：寫入前 `payload_before`/`payload_after` 已由 `AuditSerialize` 遮蔽敏感欄（FR-004）。
- **原子**：每筆 audit 與其對應資料變動同一 transaction（FR-002）。

---

## In-memory 型（非 DB 實體，`server/src/model/audit.rs`）

### `AuditOperation`（enum）

`Insert` / `Update` / `SoftDelete` / `Restore` → 映射 `operation` VARCHAR（如 `SoftDelete` → `"SOFT_DELETE"`）。本 feature 只實際使用 `SoftDelete`，餘 variant 先定義齊（scope：不真實接線）。

### `AuditEvent`（struct）

| 欄 | 型 | 來源 |
|---|---|---|
| `operation` | `AuditOperation` | 呼叫端指定 |
| `entity_table` | `String` | 呼叫端指定（"sys_user"） |
| `entity_id` | `Option<i64>` | 受影響 id |
| `payload_before` | `Option<serde_json::Value>` | `AuditSerialize::audit_json()`（redacted） |
| `payload_after` | `Option<serde_json::Value>` | 同上（SOFT_DELETE = None） |
| `operator` | `Option<{ id: i64, ip: Option<String> }>` | 本 feature None |
| `trace_id` | `Option<String>` | 本 feature None |

> `AuditEvent` 為**純資料**（不 import entity）—— 由 facade 層（持有 entity 寫入權）轉成 `sys_operation_log::ActiveModel`，保 009 entity-access lint 續綠（research R6 路線 b）。`write_in_txn` 收 `AuditEvent` + `&DatabaseTransaction`。
> **欄位對映**（`AuditEvent` → `sys_operation_log` 兩欄）：`operator_id = operator.map(|o| o.id)`、`operator_ip = operator.and_then(|o| o.ip)`（本 feature `operator=None` → 兩欄皆 NULL）。

### `AuditSerialize`（trait）

`fn audit_json(&self) -> serde_json::Value` —— 手動 `serde_json::json!` 建 redacted JSON。`impl for entity::sys_user::Model`：`{ id, user_name, password: "<redacted>", deleted_at }`。純函式、test-first。

---

## 與既有實體關係

- **`sys_user`（009 既有）**：本 feature 不改其 schema；只在其 facade `soft_delete` 路徑接上 audit + 為其 impl `AuditSerialize`（redact password）。
- 其餘 6 業務 entity 的 audit rollout（各自 `AuditSerialize` + facade 接線）= scope 外 follow-up。
