# Contract: `docker-compose.base-web.yml` profiles

**Type**: Docker Compose v2 file(`docker-compose.base-web.yml`,workspace root)

## Profile 紀律

- 用法**永遠**顯式 `-f` 指定 + `--profile dev|prod`,**不**用 `docker-compose.override.yml` auto-load(對齊 001 rust-api 紀律)
- standalone 期 dev / prod 同檔切 profile;Phase 1 #4 整套 stack 落地後本檔退場(service 移到 master `docker-compose.yml`)

## Profile: `dev`

| 屬性 | 值 | 變動 |
|---|---|---|
| Service | `base-web-dev` | — |
| profiles | `["dev"]` | — |
| image | `node:20.19-alpine` | 不變(直接用 base、不 build 自家 image) |
| container_name | `rev2-admin-base-web-dev` | ✏ 從 `rev2-base-web-dev` 改(對齊 001 命名 pattern) |
| working_dir | `/app` | — |
| environment | `NODE_ENV=development` + `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` + `npm_config_store_dir=/pnpm-store` + `CI=true` | 全 000 既有、不動 |
| volumes | `./base-web:/app` + `bw_node_modules:/app/node_modules` + `bw_pnpm_store:/pnpm-store` | 全 000 既有、不動 |
| ports | `127.0.0.1:21079:21079` | ✏ 從 `9527:9527` 改 |
| command | `sh -c "npm install -g pnpm@10 && pnpm install && pnpm dev --host 0.0.0.0 --port 21079"` | ✏ `--port 21079`(原 `--port 9527`) |
| init / tty / stdin_open | true / true / true | 全 000 既有、不動 |

**啟動命令**:
```bash
docker compose -f docker-compose.base-web.yml --profile dev up -d
```

**驗收**:
- `curl -fsS http://127.0.0.1:21079/health.html` → `ok`(SC-001 < 60s)
- `curl -fsS http://127.0.0.1:21079/` → SPA index.html(200,走 SPA fallback;User Story 1 Acceptance 1)

## Profile: `prod`

| 屬性 | 值 | 變動 |
|---|---|---|
| Service | `base-web-prod` | — |
| profiles | `["prod"]` | — |
| build.context | `./base-web` | — |
| build.dockerfile | `../deploy/Dockerfile.base-web.txt` | — |
| build.args.VITE_SERVICE_BASE_URL | `${VITE_SERVICE_BASE_URL:-https://mock.apifox.cn/m1/3109515-0-default}` | ✏ 本 feature 新增 |
| image | `rev2-admin-base-web:latest` | ✏ 本 feature 新增(顯式 tag) |
| container_name | `rev2-admin-base-web` | ✏ 從 `rev2-base-web-prod` 改(對齊 001) |
| ports | `127.0.0.1:21079:21079` | ✏ 從 `9528:80` 改(host:container 都 21079) |
| restart | `unless-stopped` | 全 000 既有、不動 |

**啟動命令**:
```bash
# 預設 build
docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait

# Override build(切 backend URL)
VITE_SERVICE_BASE_URL=http://rust-api:21081 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait
```

**驗收**:
- `curl -fsS http://127.0.0.1:21079/health.html` → `ok`
- `curl -fsS http://127.0.0.1:21079/some/random/route` → SPA index(200,SPA fallback;User Story 1 Acceptance 2)
- `docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'` → `healthy`(30 秒內;SC-002)
- bundle 含 build-arg override URL([build-arg-vite-service-base-url.md](./build-arg-vite-service-base-url.md))

## Top-level volumes

| Volume | name | 用途 |
|---|---|---|
| `bw_node_modules` | `rev2_bw_node_modules` | dev profile node_modules mask(避 WSL2 9P 慢) |
| `bw_pnpm_store` | `rev2_bw_pnpm_store` | dev profile pnpm store mask(避 cross-fs hardlink fallback,000 §2.7) |

**全 000 既有、不動**。

## 整套 §8.2 stack 整合預留

Phase 1 #4「容器 port 與編排 feature」啟動後:
- 本 standalone compose 退場
- service 移到 `docker-compose.yml`(base)+ `docker-compose.dev.yml`(dev override)+ `docker-compose.prod.yml`(prod override)
- prod 不對外 expose 21079(由 front-nginx 21080/21443 reverse proxy 至 internal:21079)
- build.args 機制保留(可能加 host envvar `VITE_*`)

本 feature 為過渡狀態、不過度設計。

## 驗收

對應 spec User Story 1 + User Story 2 全 acceptance scenarios + FR-001/002/003/004/005/006 + FR-024(不動 dev structure)。
