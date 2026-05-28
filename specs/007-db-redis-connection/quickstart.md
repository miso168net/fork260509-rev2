# Quickstart: 007-db-redis-connection

> 連線層 + proof migration 的落地 + 驗證路徑。確切 migration invocation 由 tasks 定稿（見 [contracts/verification-commands.md](./contracts/verification-commands.md)）。

## 前置

- 005 secret 已生成（`bash deploy/generate-secrets.sh`）→ `deploy/secrets/database_url.txt` / `redis_url.txt` 存在。
- dev stack 可起（004/005 落地）。

## Path A — 編譯 + config 單測

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server config
# DatabaseConfig/RedisConfig 反序列化 + URL secret 載入測試 PASS
```

## Path B — migration pipeline（proof: sys_user + seed）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo run --bin migration -- up
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "SELECT id, user_name FROM sys_user ORDER BY id"
# 1 Super / 2 Admin / 3 User
```

## Path C — 連線層 boot（full dev stack）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format 'table {{.Service}}\t{{.Status}}'   # 5 service healthy(rust-api 連 DB+Redis 成功才 healthy)
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs rust-api | grep -iE 'postgres|redis|connect'
curl -fsS http://127.0.0.1:21081/health    # ok(liveness 不變)
```

## 落地檔案範圍（plan）

| 檔 | 動作 |
|---|---|
| `rust-api/Cargo.toml`（workspace）| 加 sea-orm 1.1.20 / sea-orm-migration 1.1.20 / redis 1.2 / argon2 0.5.3 / async-trait |
| `rust-api/application.yaml` | 加 `database:` section（max_connections / connect_timeout_secs）|
| `rust-api/server/src/config.rs` | 加 `DatabaseConfig`/`RedisConfig` + `AppConfig::load()` 載 URL secret |
| `rust-api/server/src/infra/db.rs`（新）| `connect_postgres` + ping |
| `rust-api/server/src/infra/redis.rs`（新）| `connect_redis` + PING |
| `rust-api/server/src/state.rs`（新）| `AppState{db, redis}` |
| `rust-api/server/src/main.rs` | boot 序加連線建立 + fail-fast；`.with_state` |
| `rust-api/migration/`（stub→真）| `lib.rs` Migrator + `m*_create_sys_user` + `m*_seed_sys_user` + `main.rs` CLI |
| `docker-compose.yml` + dev override | top-level `secrets:` 加 `database_url`/`redis_url`；rust-api service 掛 secret + `APP_*_URL_FILE` env |

> rust-api 為 worktree + submodule → 改 `rust-api/` 內檔走**兩段式 commit**（§4.1）：worktree commit+push → 外層 bump SHA pin。compose/spec docs 為外層檔（落 007 feature branch）。
