# Quickstart: 011-audit-log

> 三條驗證路徑。本 feature 動 rust-api worktree（兩段式 commit）；完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)。
> 前置：dev stack up（010 自動套表，`sys_operation_log` 已建）。

## Path A — 正向：軟刪 → 恰 1 筆 audit + redact（US1 / SC-001·SC-003）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 觸發 facade::sys_user::soft_delete(db, <seed id>)（整合測試 / driver，見 contracts §0.1）
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c \
  "SELECT operation, entity_table, entity_id, payload_before->>'password' AS pw, payload_after \
     FROM sys_operation_log ORDER BY id DESC LIMIT 1;"
```
驗：恰 1 筆新 `sys_operation_log`（`operation=SOFT_DELETE` / `entity_table=sys_user` / `entity_id` 對 / `pw='<redacted>'` 非明文 / `payload_after` NULL）；目標 `sys_user.deleted_at` 已設。

## Path B — 原子性：失敗一起 rollback（US1#2 / SC-002）

```bash
# 整合測試內 mid-txn 注入失敗,斷言 end-state:
#   sys_operation_log 無新列 且 目標 user deleted_at 仍 NULL(both-or-neither)
```
驗：變動與 audit **都未發生**（同 transaction rollback）。

## Path C — 無效操作 no-op（US3 / SC-004）

```bash
# 對不存在/已軟刪 id 呼叫 soft_delete
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "SELECT count(*) FROM sys_operation_log;"
```
驗：`sys_operation_log` count 不變（無雜訊 audit）、無錯誤。

## 機制快檢

| 元件 | 在哪 | 驗 |
|---|---|---|
| `sys_operation_log` 表（不可變、BIGSERIAL） | migration 004（經 010 自動套） | psql `\d sys_operation_log` |
| 統一寫入入口（原子） | `audit_log::mutate_in_txn` / `write_in_txn` | Path A（1 筆）+ Path B（rollback） |
| redact | `AuditSerialize::audit_json`（password→`<redacted>`） | Path A `pw='<redacted>'` + §1 純單測 |
| 0-rows no-op | facade soft_delete SELECT-before 判斷 | Path C |
| 守 007 FR-009 | server boot 不呼叫 Migrator | `grep` 0 命中（contracts §5c） |
| 守 009 entity-access lint | audit 寫入經 facade（research R6 路線 b） | `cargo test entity_access_lint` 綠 |
| 兩段式 commit | 動 rust-api worktree | worktree commit + push fork + 外層 bump SHA pin |
