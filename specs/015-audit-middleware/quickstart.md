# Quickstart: 015-audit-middleware

## Path A — 純單測（no-DB、最快）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test -p server
```
驗：client_ip/x_forwarded_for 抽取、trace_id（X-Request-Id else uuid）、`sys_access_log`/`sys_login_attempt` 的 ActiveModel SQL-build（INET 欄寫真值、不再 42804）。

## Path B — 活體 access-log + login-attempt（curl + psql）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate            # 套 001..012
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api               # 需 XDB_FILEPATH env
```
- login 成功/失敗 → `sys_login_attempt` 各 1 筆（success + attempted_user_name + INET client_ip + region）。
- `getUserInfo`（Bearer）→ `sys_access_log` 1 筆（operator_id + method/path/status + INET + region）。
- `getConstantRoutes`（公開）/ `/health` → **不**寫 access-log。
- 帶 `X-Forwarded-For` → `x_forwarded_for` 存原始鏈、`client_ip` 仍直連。
（完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)）

## Path C — prod build + xdb 打包 sanity（§2.15）

```bash
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-015 .
docker run --rm --entrypoint sh rev2-admin-rust-api:prod-verify-015 -c 'ls -la /app/resources/ip2region.xdb'   # ~11MB
```

## 關鍵事實速查

- **2 endpoint 不新增**：015 無新對外 wire；middleware（全域 `.layer`）+ login handler 改 + 兩審計表。
- **只記已認證**：middleware iff JWT verify Ok（operator_id 已知）才寫 access-log（public/health/login skip）;login 由 handler 記 `sys_login_attempt`（成敗）。
- **來源**：`client_ip`(直連 INET、ConnectInfo) + `x_forwarded_for`(原始鏈 raw) 並存;`region`=xdb raw 字串。
- **INET（§2.14）**：sea-orm `with-ipnetwork` + `IpNetwork` 欄型（自動 `::inet` cast）。
- **xdb（§2.15）**：`XDB_FILEPATH` env（dev `/app/xdb/resources/...`、prod `/app/resources/...`）+ prod runtime COPY 11MB 檔;boot `searcher_init`。
- **best-effort**：審計寫失敗只 warn、不失敗業務請求。
- **新 dep**：`uuid`(direct、已 transitive)；無新 workspace crate。
- **commit**：rust-api worktree（code）+ **外層**（Dockerfile + compose XDB_FILEPATH + spec docs）+ SHA pin（兩段式、不動 base-web）。
