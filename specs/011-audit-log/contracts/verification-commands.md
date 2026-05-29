# Contract: Verification commands（C-V acceptance）

**Type**: cargo test（pure 單元）+ 對 live postgres 的整合驗證（dev stack、010 自動套表後）+ psql 斷言；對應 spec User Stories + SCs。

> **§0 — [CLAUDE.md §3](../../../CLAUDE.md) 紀律**：
> - **純邏輯單元 → test-first**：`AuditSerialize` redact、`write_in_txn` insert statement 形狀（純 SQL-build，仿 009 `soft_delete_query` 的 `QueryTrait::build` 斷言）。
> - **原子性（rollback）/ 1-筆 / 0-rows 行為**需**真實 DB transaction** 才能證 → 整合驗證對 **dev stack live postgres**（`127.0.0.1:25432`、`soybean` / `soybean_admin_rust`，010 自動套表後）。
> - **無 HTTP 業務 endpoint / 無 base-web modal → 無 CDP/curl 業務消費者**：soft_delete 為 facade fn，整合測試/驗證直接呼叫 facade（或 sea-orm 連 live DB），非經 HTTP。
> **§0.1 整合測試 harness**：**採路線 (a)** —— `server/tests/` 整合測試連 `DATABASE_URL`（dev postgres `127.0.0.1:25432`）跑 soft_delete 後斷言（可重跑、CI 友善）；DB 不可達時以 `#[ignore]` 或 env-gate 跳過（純單測 §1 仍涵蓋 redact/SQL-build 邏輯）。**權威斷言 = `sys_operation_log` 實際列內容 + `sys_user.deleted_at` 狀態**。
> DB user `soybean` / db `soybean_admin_rust`（以 `deploy/secrets/database_url.txt` 為準）。

---

## §1 純單元（test-first、無 DB）（FR-004 / write 形狀）

```bash
cd rust-api && cargo test -p server audit   # 或對應 module 路徑
```
- `AuditSerialize for sys_user::Model`：`audit_json()` → `password` 欄 == `"<redacted>"`、`user_name`/`id`/`deleted_at` 照常保留、JSON 物件形狀正確（SC-003 純邏輯側）。
- `write_in_txn` 的 `sys_operation_log` insert statement（`ActiveModel` → `QueryTrait::build(Postgres)`）含 `operation` / `entity_table` / `payload_before` 等欄（仿 009 SQL-build 斷言）。
- 預期：相關單測全綠。

## §2 正向 proof：軟刪 → 恰 1 筆 audit + redact（US1 / SC-001·SC-003）

```bash
# 前置:dev stack up(010 自動套表,sys_operation_log 已建)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# 起點乾淨:audit 表空、seed user 在
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT count(*) FROM sys_operation_log;"           # 預期 0(或記下基準)

# 觸發受管軟刪(整合測試或 driver 呼叫 facade::sys_user::soft_delete(db, <seed id>))
#   見 §0.1 harness

# 斷言:恰 1 筆新 audit、內容正確、password 遮蔽
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT operation, entity_table, entity_id, payload_before->>'password' AS pw, payload_after \
     FROM sys_operation_log ORDER BY id DESC LIMIT 1;"
# 預期: operation=SOFT_DELETE / entity_table=sys_user / entity_id=<id> /
#        pw='<redacted>'(非明文 123456 的 hash) / payload_after IS NULL
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT deleted_at IS NOT NULL FROM sys_user WHERE id=<id>;"   # 預期 t(已軟刪)
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT count(*) FROM sys_operation_log;"           # 預期 基準+1(恰 1 筆)
```

## §3 原子性：失敗 → 變動與 audit 一起 rollback（US1#2 / SC-002）

```bash
# 反向:mid-txn 注入失敗(整合測試內，例如令 write_in_txn 後 commit 前拋錯,
#   或暫時令 audit insert 失敗),斷言「既無 audit 列、user 也未被軟刪」
# 權威斷言(end-state):
#   - sys_operation_log 無新增列(count 不變)
#   - 目標 user deleted_at 仍為 NULL(未被刪)
# 預期: 兩者皆「未發生」(both-or-neither rollback)
```

## §4 無效操作 no-op：0-rows 不寫 audit（US3 / SC-004）

```bash
# 對不存在/已軟刪的 id 呼叫 soft_delete
# 斷言:sys_operation_log count 不變(無新 audit)、無錯誤
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT count(*) FROM sys_operation_log;"           # 預期 與操作前相同
```

## §5 既有不破 + 契約守恆（SC-005 / FR-007 / 009 lint）

```bash
# (a) /health 不破
curl -fsS http://127.0.0.1:21081/health ; echo        # 預期 ok

# (b) 既有測試全綠(009 soft-delete + entity-access lint 續綠、008 envelope 等)
cd rust-api && cargo test                              # 預期 全綠(含 entity_access_lint)

# (c) FR-009 regression:server boot 仍不呼叫 Migrator
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"
# 預期: 無命中(exit 1)

# (d) entity-access lint 續綠(audit 寫入經 facade、未在 facade 外 use entity::)
cd rust-api && cargo test -p server entity_access_lint  # 預期 綠(research R6 路線 b)

# (e) seed 與軟刪過濾不破:active seed 仍可查
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT count(*) FROM sys_user WHERE deleted_at IS NULL;"   # 預期 >=2(扣掉 §2 軟刪的 1 個)
```

---

## 驗收紀律總結

- §1 純單元(redact + write SQL-build)— test-first、無 DB
- §2 正向 proof(US1/SC-001·SC-003)— 軟刪 → 恰 1 筆 audit + password 遮蔽 + user 已刪
- §3 原子性(US1#2/SC-002)— 注入失敗 → audit 與軟刪一起 rollback(end-state both-or-neither)
- §4 0-rows no-op(US3/SC-004)— 無效 id → 不寫 audit
- §5 既有不破 + FR-009 regression + 009 entity-access lint 續綠(SC-005/FR-007)
- **無 CDP / curl 業務消費者**(soft_delete 為 facade fn、無 HTTP endpoint;整合驗證直呼 facade)
- **有純單元測試**(redact + SQL-build)+ **整合驗證**(對 live postgres 證 transaction 原子性)
