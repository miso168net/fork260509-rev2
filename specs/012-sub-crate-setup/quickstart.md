# Quickstart: 012-sub-crate-setup

> 驗證 sub-crate 地基的 3 條最短路徑。完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)。前置：dev stack postgres up + migrate 套 001..005。

## Path A — adapter 對 casbin 2.20 能編譯（相容性閘門、最高風險）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev build -p sea-orm-adapter -p xdb
```
→ 編譯成功 = casbin 2.20 Adapter trait 相容。失敗 → 先修 adapter（plan Deviation）。

## Path B — adapter 活體 round-trip（policy 寫入→重載）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套到 005
docker run --rm --network rev2-admin_rev2_net -e DATABASE_URL="$(cat deploy/secrets/database_url.txt)" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev test -- --ignored --test-threads=1
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "SELECT ptype,v0,v1,v2 FROM casbin_rule ORDER BY id;"
```
→ smoke 綠 + casbin_rule 有 `p,alice,data1,read` = adapter 在 rev2 runtime 真接通。

## Path C — xdb IP→地區 + 既有不破

```bash
# xdb 解析
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev test -p xdb
# 既有不破(25+3 ignored server + 17 lint)
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev test
```
→ xdb 解析回非空地區 + 既有全綠 + casbin_rule 無 deleted_at（scope 邊界）。

## 成功定義

- Path A 編譯過（casbin 2.20 相容）
- Path B adapter round-trip 綠 + casbin_rule 有列（執行環境對齊真接通）
- Path C xdb 解析回非空 + 既有 25+3+17 全綠 + FR-009 regression 0 命中 + casbin_rule 無 deleted_at
