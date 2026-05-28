# Contract: Verification commands（C-V acceptance）

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — CLAUDE.md §3 紀律**：本 feature 有 1 個可單測純邏輯單元（config 反序列化 + URL secret 載入），其餘（連線建立、migration、compose wiring）為需真 DB/Redis 的 wiring → 由本 C-V contract 覆蓋。`tasks.md`/`plan.md` 須明示「config 反序列化單測 + 連線/migration acceptance 覆蓋」及理由。
> dev rust-api 為 cargo-watch image（bind-mount source）；dev migration invocation = `run --rm --entrypoint "" rust-api cargo run --bin migration -- up`（覆寫 cargo-watch entrypoint）；prod 用 image entrypoint dispatch `migration`。implementer 對真 image 確認可跑。

---

## §1 build + config 單元測試（US3 + SC-005）

```bash
# rust-api 編譯通過（新增 sea-orm/redis/argon2 deps + infra/state 模組）
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api    # 或 cargo build --workspace
# config 反序列化 + URL secret 載入單測
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server config
# 預期: DatabaseConfig/RedisConfig 反序列化 + load_secret(_FILE>envvar、validate 通過) 測試 PASS
```

---

## §2 migration pipeline + proof（US2 + SC-003）

```bash
# 前置: dev stack postgres healthy(或單起 postgres)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres --wait

# 跑 migration（dev：覆寫 cargo-watch entrypoint）
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo run --bin migration -- up
# 預期: exit 0、sys_user 表建立 + 3 帳號 seed

# 驗證 sys_user 3 筆
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c 'SELECT count(*) FROM sys_user'
# 預期: 3

# 驗證帳號名 = Super/Admin/User（非 rev1 Soybean/...）
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "SELECT id, user_name FROM sys_user ORDER BY id"
# 預期: 1 Super / 2 Admin / 3 User

# 冪等: 再跑一次 migration
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo run --bin migration -- up
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c 'SELECT count(*) FROM sys_user'
# 預期: 仍 3（seaql_migrations 追蹤跳過 + seed conflict-safe）
```

---

## §3 連線層 boot + fail-fast（US1 + SC-001 + SC-002）

```bash
# 正常: dev stack 全起、rust-api 連 DB+Redis 成功才 healthy
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "exit: $?"
# 預期: exit 0、5 service 全 healthy
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format 'table {{.Service}}\t{{.Status}}'
# 預期: rust-api healthy

# log 顯示 Postgres + Redis 連線成功
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs rust-api | grep -iE 'postgres|redis|connect'
# 預期: 可見 DB + Redis connected 記錄

# fail-fast(implementer 跑;loader 為 _FILE>envvar): 令 redis 不可達後啟 rust-api,斷言非零退出 + log 指 Redis 連線失敗
# 方法擇一:(a) docker compose ... stop redis-stack 後重啟 rust-api;(b) 暫改 deploy/secrets/redis_url.txt 內嵌 host 為不存在值再 up rust-api(用畢還原)
# ⚠️ 不可用 `-e APP_REDIS_URL=...` 覆寫——既有 load_secret 為 _FILE 優先於 envvar,有 _FILE 掛載時 envvar 被忽略、蓋不到
```

---

## §4 secret / compose wiring（US3 + SC-004）

```bash
# rust-api service 掛 database_url/redis_url secret + APP_*_URL_FILE env
grep -nE 'database_url|redis_url|APP_DATABASE_URL_FILE|APP_REDIS_URL_FILE' docker-compose.yml
# 預期: top-level secrets 區 + rust-api service secrets/environment 皆有

# 設定檔/compose 無明文連線密碼
grep -rnE 'postgres://|redis://' docker-compose.yml docker-compose.dev.yml rust-api/application.yaml
# 預期: 無明文 URL（URL 只在 deploy/secrets/*.txt，gitignored；compose 走 _FILE 掛載）
```

---

## 驗收紀律總結

- §1 build + config 單測（US3 + SC-005）
- §2 migration pipeline + sys_user 3 帳號 + 冪等（US2 + SC-003）
- §3 連線層 boot healthy + log connected + fail-fast（US1 + SC-001/SC-002）
- §4 secret/compose wiring + 無明文（US3 + SC-004）

`tasks.md` 階段把 §1-§4 排程進 task、對應 spec acceptance scenario 與 SC；確切 migration invocation（`run --rm --entrypoint` vs 專用 compose service）於 tasks 定稿。
