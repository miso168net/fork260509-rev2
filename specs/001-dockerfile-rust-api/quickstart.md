# Quickstart: dockerfile-rust-api

> 「從 0 到 server 跑起來」單頁指南。
> 詳細設計見 [plan.md](./plan.md);驗收細節見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

---

## 前置

- WSL2 + docker 23+(BuildKit 自動)
- `openssl`(prod profile 用,dev 不需)
- 從 `rev2-admin-root` repo clone(含 `base-web` / `rust-api` worktree)
- 當前在 feature branch `001-dockerfile-rust-api`

---

## Path A — 跑 dev profile(60 秒迭代開發)

```bash
# 從 workspace root
docker compose -f docker-compose.rust-api.yml --profile dev up
```

開另一 terminal:
```bash
curl -fsS http://127.0.0.1:21081/health
# 預期: ok
```

改 `rust-api/server/src/main.rs` 內 `health()` 函式回值,等 60 秒,再 curl 看新值。

---

## Path B — 跑 prod profile(near-prod 驗收)

第一次:生 secret 範本檔:
```bash
openssl rand -base64 48 > deploy/secrets/jwt_secret.txt
openssl rand -base64 48 > deploy/secrets/refresh_token_secret.txt
```

Build + up:
```bash
DOCKER_BUILDKIT=1 docker compose -f docker-compose.rust-api.yml --profile prod up --build
```

驗證:
```bash
curl -fsS http://127.0.0.1:21081/health
# 預期: ok

docker run --rm rev2-admin-rust-api:latest migration
# 預期 stdout: migration stub — will be implemented in Phase 2 migration feature
# 預期 exit: 0

docker run --rm rev2-admin-rust-api:latest cleanup-job
# 預期 stdout: cleanup-job stub — will be implemented in Phase 5 cleanup-job feature
# 預期 exit: 0
```

---

## Path C — Boot panic 自我保護驗收

```bash
# 黑名單值
APP_JWT_JWT_SECRET="change-me" docker compose -f docker-compose.rust-api.yml --profile dev up
# 預期: 5 秒內 panic,log 含「APP_JWT_JWT_SECRET is a placeholder value」

# 長度 < 32
APP_JWT_JWT_SECRET="too_short" docker compose -f docker-compose.rust-api.yml --profile dev up
# 預期: panic,log 含「APP_JWT_JWT_SECRET length 9 < 32」

# 不設
unset APP_JWT_JWT_SECRET APP_JWT_JWT_SECRET_FILE
docker compose -f docker-compose.rust-api.yml --profile dev up
# 預期: panic,log 含「neither APP_JWT_JWT_SECRET nor APP_JWT_JWT_SECRET_FILE set」
```

---

## Path D — Unit test(secret loader TDD)

```bash
cd rust-api
cargo test --bin server -- config::tests
```

預期 8 條 unit test 全 PASS(見 [contracts/secret-loader.md](./contracts/secret-loader.md))。

---

## Troubleshooting

| 症狀 | 處置 |
|---|---|
| `cargo watch` 不偵測 source 變動 | WSL2 9P inotify 不可靠 — 改 `cargo watch --poll` 或 `--poll 2`;brainstorm §9.1 Open Question |
| 首次 build 卡住超 15 分鐘 | 網路慢/cargo deps 抓取超時。`Ctrl+C` 後重跑(BuildKit cache mount 保留進度) |
| `curl localhost` connection refused | check `docker compose ps` 確認 container `running` 且 `healthy`;若 `unhealthy` → `docker compose logs` 看 boot panic |
| Windows host 從 `127.0.0.1` 連不到 WSL2 內 port | `.wslconfig` 加 `[wsl2] networkingMode=mirrored`(Win11 22H2+);或從 `wsl hostname -I` 拿 WSL IP |
| `target/` 被寫回 host 污染 worktree | check `docker-compose.rust-api.yml` 內 `rust_api_target:/app/target` named volume mount 是否存在 |

---

## 下一步

- 跑完上述驗收 → `/speckit-tasks` 產 dependency-ordered task 清單
- `/speckit-analyze` 跨檔 consistency 報告(spec / plan / tasks)
- 實作走 `superpowers:executing-plans`(**不**用 `/speckit-implement`,對齊 CLAUDE.md §3 紀律)
