# Quickstart: 010-migration-auto-apply

> 三條驗證路徑。本 feature outer-only(只動 compose),完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

## Path A — dev 啟動即自動套 + 冪等（US1）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "exit: $?"
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "SELECT version FROM seaql_migrations ORDER BY version;"
```
驗:**不跑任何手動 migration 指令**,`up --wait` exit 0;migrate service Exited(0);`seaql_migrations` 含 001/002/003;`sys_user` + seed + 009 `deleted_at`/partial index 就緒;`/health` ok。再 `up` 一次 → 冪等 no-op、仍 exit 0。

## Path B — fail-fast（US3）

```bash
# 臨時令 migrate 失敗(壞 DATABASE_URL 或 bogus command),驗畢還原
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "exit: $?"
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps -a migrate rust-api
```
驗:`up --wait` exit≠0;migrate Exited(非0);rust-api **未啟動**(閘門擋下)。還原後正常 `up` 回綠。

## Path C — prod 對齊（US2）

```bash
# 先 seed cert(CLAUDE.md §8.2.1),再:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait ; echo "exit: $?"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -a migrate
```
驗:prod `up --wait` exit 0;migrate(runtime image、entrypoint dispatcher `migration up`)Exited(0);schema 自動套(與 dev 一致 — SC-004);API internal `/health` ok。

## 機制快檢

| 元件 | 在哪 | 驗 |
|---|---|---|
| migrate service(一次性) | `docker-compose.yml`(骨架)+ dev/prod override | `ps -a migrate` Exited(0) |
| 完成閘門 | `rust-api depends_on migrate: service_completed_successfully` | migrate 失敗 → rust-api 不起(Path B) |
| dev invoke | `docker-compose.dev.yml`(cargo run --bin migration up) | Path A |
| prod invoke | `docker-compose.prod.yml`(entrypoint dispatcher migration up) | Path C |
| 守 007 FR-009 | server boot 不呼叫 Migrator | `grep` 0 命中(verification §4) |
