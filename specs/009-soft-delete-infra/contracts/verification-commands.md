# Contract: Verification commands（C-V acceptance）

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — [CLAUDE.md §3](../../../CLAUDE.md) 紀律**:本 feature 有**可單測純邏輯單元**(find_active / soft_delete 的 SQL-build 斷言 + lint 掃描 fn)→ **test-first**。無 HTTP endpoint / 無 base-web modal → **無 CDP / curl 消費者**;migration 套用由 dev stack 驗。
> 無 host cargo → 經 dev image:`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo ...`。

---

## §1 build + 單元測試（US1/US2/US3 純邏輯 / SC-002·SC-003·SC-004）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server -p entity
# 預期 PASS:
#  - find_active SQL-build 含 `"deleted_at" IS NULL`（SC-004 / FR-002）
#  - soft_delete statement SQL-build 含 `SET "deleted_at"`（FR-001）
#  - lint 掃描 fn:clean 字串→0 違規、植入 `use entity::sys_user`→偵測到（SC-003 正反向 / FR-005·FR-006）
```

## §2 繞過防護 build-failing lint（US3 / SC-003）

```bash
# lint test 隨 cargo test 跑;單獨確認:
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server --test entity_access_lint
# 預期 exit 0(目前 facade 外無 use entity::)

# 反向人工驗(可選):在 server/src/main.rs 暫植一行 `use entity::sys_user;` → cargo test 應 FAIL 並指出 main.rs;驗畢還原
```

## §3 migration 套用（US1/US2 / SC-001·SC-002·SC-005）

```bash
# dev stack 起 → migration 自動套用(007 pipeline);或手動:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "up exit: $?"

# schema 驗:deleted_at 欄 + partial unique index 存在
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean-admin-rev2 -c "\d sys_user"
# 預期: deleted_at | timestamp with time zone | nullable
#       Indexes: "sys_user_user_name_active_uniq" UNIQUE, btree (user_name) WHERE deleted_at IS NULL

# SC-002 partial unique 行為(active 同名擋 / deleted 同名放行):
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean-admin-rev2 -c \
  "INSERT INTO sys_user(id,user_name,password) VALUES(1001,'Super','x');"
# 預期: ERROR duplicate key（'Super' 已 active、partial unique 擋)

docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean-admin-rev2 -c \
  "UPDATE sys_user SET deleted_at=now() WHERE user_name='Super'; \
   INSERT INTO sys_user(id,user_name,password) VALUES(1001,'Super','x'); \
   SELECT count(*) FROM sys_user WHERE user_name='Super';"
# 預期: INSERT 成功(舊 Super 已 deleted、同名 active 放行)、count=2(1 deleted + 1 active);驗畢 ROLLBACK/還原 seed

# SC-005 既有行為不破:/health 仍 ok、3 seed user 仍在
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean-admin-rev2 -c "SELECT count(*) FROM sys_user WHERE deleted_at IS NULL;"
# 預期: ≥3（Super/Admin/User active)
curl -fsS http://127.0.0.1:21081/health ; echo   # 預期 ok
```

> psql 連線參數(user/db 名)以 007 dev stack 實際為準;若不同,以 `deploy/secrets/database_url.txt` 內值調整。

---

## 驗收紀律總結

- §1 SQL-build 單測 + lint 掃描 fn 正反向（US1/US2/US3 純邏輯;SC-002/003/004）— test-first
- §2 lint test build-failing（US3;SC-003）
- §3 migration 套用 + partial unique 行為 + 既有不破（US1/US2;SC-001/002/005）— dev stack
- **無 CDP / curl 業務消費者**（無 HTTP delete endpoint,Phase 3+)
