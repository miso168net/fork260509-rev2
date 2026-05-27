# Contract: `docker-compose.rust-api.yml` profiles

**Type**: Docker Compose v2 file(`docker-compose.rust-api.yml`,workspace root)

## Profile 紀律

- 用法**永遠**顯式 `-f` 指定 + `--profile dev|prod`,**不**用 `docker-compose.override.yml` auto-load(spec FR-020)
- standalone 期 dev / prod 同檔切 profile(對齊 000 base-web 路線);未來整合 §8.2 後此檔退場

## Profile: `dev`

| 屬性 | 值 |
|---|---|
| Service | `rust-api-dev` |
| build.target | `dev`(Dockerfile stage = builder image + cargo-watch) |
| build.context | `./` |
| build.dockerfile | `deploy/Dockerfile.rust-api.txt` |
| container_name | `rev2-admin-rust-api-dev` |
| volumes | `./rust-api:/app` + `rust_api_cargo_cache:/usr/local/cargo` + `rust_api_target:/app/target` |
| ports | `127.0.0.1:21081:21081`(loopback only,不對 LAN 暴露) |
| environment.APP_JWT_JWT_SECRET | `${APP_JWT_JWT_SECRET:-dev_jwt_secret_for_local_only_x32xxxxxx}`(長度 39) |
| environment.APP_JWT_REFRESH_TOKEN_SECRET | `${APP_JWT_REFRESH_TOKEN_SECRET:-dev_refresh_secret_for_local_only_x32xx}`(長度 38) |
| environment.RUST_LOG | `"info,tower_http=debug"` |

**啟動命令**:
```bash
docker compose -f docker-compose.rust-api.yml --profile dev up
```

**驗收**:
- `curl -fsS http://127.0.0.1:21081/health` → `ok`
- 改 `rust-api/server/src/main.rs` → 60 秒內偵測 + rebuild + restart(SC-002)

## Profile: `prod`

| 屬性 | 值 |
|---|---|
| Service | `rust-api` |
| build.target | `runtime`(multi-stage runtime image,non-root) |
| container_name | `rev2-admin-rust-api` |
| ports | `127.0.0.1:21081:21081`(standalone 期,整合 §8.2 後 internal-only) |
| environment.APP_JWT_JWT_SECRET_FILE | `/run/secrets/jwt_secret` |
| environment.APP_JWT_REFRESH_TOKEN_SECRET_FILE | `/run/secrets/refresh_token_secret` |
| environment.RUST_LOG | `"info"` |
| secrets | `jwt_secret` + `refresh_token_secret` |

**Top-level secrets(file-based)**:
```yaml
secrets:
  jwt_secret:
    file: ./deploy/secrets/jwt_secret.txt
  refresh_token_secret:
    file: ./deploy/secrets/refresh_token_secret.txt
```

**啟動命令**:
```bash
# 第一次:operator 用 openssl rand 生 secret
openssl rand -base64 48 > deploy/secrets/jwt_secret.txt
openssl rand -base64 48 > deploy/secrets/refresh_token_secret.txt

# build + up
docker compose -f docker-compose.rust-api.yml --profile prod up --build
```

**驗收**:
- `curl -fsS http://127.0.0.1:21081/health` → `ok`
- `docker run --rm rev2-admin-rust-api:latest migration` → stub 訊息 exit 0
- `docker run --rm rev2-admin-rust-api:latest cleanup-job` → stub 訊息 exit 0

## Top-level volumes

| Volume | 用途 |
|---|---|
| `rust_api_cargo_cache` | dev profile cargo registry / git deps cache(避 cold cache 每次 rebuild) |
| `rust_api_target` | dev profile `target/` mask(避 WSL2 9P 慢 + 避 host worktree 污染) |

## 整套 §8.2 stack 整合預留

未來 Phase 1 #4 「容器 port 與編排 feature」啟動後:
- 本 standalone compose 退場
- service 移到 `docker-compose.yml`(base)+ `docker-compose.dev.yml`(dev override)+ `docker-compose.prod.yml`(prod override)
- prod profile 不對外 expose 21081(由 front-nginx reverse proxy)
- secret 檔位置可能改(對齊 §8.2 secret 統一管理)

本 feature 為過渡狀態、不過度設計。

## 驗收

對應 spec User Story 1 + User Story 2 全 acceptance scenarios + FR-017 + FR-020。
