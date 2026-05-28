# Quickstart: 009-soft-delete-infra

> 兩條驗證路徑。無 host cargo → 經 dev image。完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

## Path A — 編譯 + 單元測試（純邏輯,不需 live DB）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server -p entity
```
驗:`find_active` SQL 含 `"deleted_at" IS NULL`、`soft_delete` SQL 含 `SET "deleted_at"`、lint 掃描 fn 正反向、繞過防護 lint test 綠。

## Path B — migration 套用 + partial unique 行為（dev stack）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean-admin-rev2 -c "\d sys_user"
```
驗:`deleted_at` 欄 + `sys_user_user_name_active_uniq` partial unique index 存在;active 同名擋、deleted 同名放行(§3);`/health`=ok、seed user 仍在。

## 三重防護快檢

| 層 | 在哪 | 驗 |
|---|---|---|
| 類型(trait) | `server/src/model/soft_delete.rs` | `find_active` SQL-build 單測 |
| facade(唯一管道) | `server/src/model/facade/sys_user.rs` | 不 re-export Entity;`soft_delete` SQL-build 單測 |
| build-time lint | `server/tests/entity_access_lint.rs` | facade 外 `use entity::` → test fail |
