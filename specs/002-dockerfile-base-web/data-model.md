# Phase 1 Data Model: dockerfile-base-web

> 本 feature 為部署基建、無 DB entity / 業務 model。本檔列 4 個 key entity 與其驗證規則。

---

## Entity 1: Container Image (`rev2-admin-base-web`)

**意義**:rev2 frontend SPA 的唯一可部署單元(prod);dev 直接用 base node:20.19-alpine、不 build 自家 image。

**Variants**:

| Tag | Stage | 用途 | 內容 |
|---|---|---|---|
| (no tag) | (dev profile 直用 base) | dev profile,bind mount + inline `pnpm install + pnpm dev` | `node:20.19-alpine` + bind mount source + named volume mask `node_modules` / `pnpm-store` |
| `rev2-admin-base-web:latest` | `target: runtime` | prod profile + 獨立 `docker run` | runtime image + dist/ + 自訂 nginx config + HEALTHCHECK + EXPOSE 21079 |

**Image layers(runtime stage)**:

| Layer | 內容 |
|---|---|
| Base | `nginx:alpine`(~30 MB) |
| Static assets | `dist/`(從 builder COPY,含 vite build 產物 + `health.html` + `favicon.svg`) |
| nginx config | `/etc/nginx/conf.d/default.conf`(從 builder `/tmp/nginx/default.conf` COPY,listen 21079 + SPA fallback) |
| Port | `EXPOSE 21079` |
| Healthcheck | `wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok"`,interval 10s / timeout 3s / start-period 5s / retries 3 |

**Validation**:
- `docker image inspect rev2-admin-base-web:latest --format='{{.Size}}'` < 80 MB(SC-004)
- `docker run --rm -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest` + `curl /health.html` 回 `ok`(FR-007)
- `docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'` 30 秒內回 `healthy`(SC-002 / FR-010)

---

## Entity 2: `/health.html` static file

**意義**:nginx 直接服務的 ops health probe target;HEALTHCHECK 探測對象;不被 SPA 渲染。

**Fields**:

| Field | Value | Required |
|---|---|---|
| Source path | `base-web/public/health.html` | yes — 新增本 feature |
| Built path | `dist/health.html`(vite default behavior) | derived — vite copy public/ → dist/ |
| Served path | `/health.html`(nginx serve from `/usr/share/nginx/html/health.html`) | derived |
| Content | `ok\n`(+ 2 行 HTML 註解) | yes — 必含 `ok` 字串(HEALTHCHECK grep target) |
| Content-Type | `text/html`(nginx 預設由副檔名推) | derived |

**Loading flow**(build-time):
```
base-web/public/health.html
   ↓ (vite build copy public/ → dist/)
dist/health.html
   ↓ (Dockerfile builder COPY dist/ → runtime image)
/usr/share/nginx/html/health.html
   ↓ (nginx try_files $uri 命中)
HTTP GET /health.html → 200 + body "ok\n"
```

**Validation**:
- 內容 grep `-q "ok"` 命中
- nginx 直接 serve、**不**走 SPA fallback(verify:`curl /health.html` 回 `ok` 而非 SPA index HTML;FR-013)
- vite copy 自動生效(verify:`docker run --rm rev2-admin-base-web:latest sh -c "test -f /usr/share/nginx/html/health.html"`)

**State transition**:N/A(stateless static file,build-once、serve-many)

---

## Entity 3: `VITE_SERVICE_BASE_URL` build-time env var

**意義**:vite client bundle inline 的 backend URL;一套 image 透過 build-arg 切不同 backend、不動 inline `.env.*`。

**Fields**:

| Field | Type | Required | Default |
|---|---|---|---|
| Dockerfile ARG | string | yes | `https://mock.apifox.cn/m1/3109515-0-default`(對齊現 `base-web/.env.prod`) |
| compose build.args | shell envvar interpolation | yes | `${VITE_SERVICE_BASE_URL:-<default>}` |
| Builder stage 寫入 | `.env.prod.local` 內 `VITE_SERVICE_BASE_URL=<value>` | yes(research §1 發現必須走 .env file) | — |
| vite build-time | `import.meta.env.VITE_SERVICE_BASE_URL` inline 進 bundle | yes(vite VITE_ prefix 自動 expose) | — |
| Runtime | bundle 內字面 string,frontend HTTP request 用 | yes | — |

**Loading flow**(research §1):
```
1. operator/CI 設 shell envvar: VITE_SERVICE_BASE_URL=http://rust-api:21081
   (或不設,compose 用 default)
2. docker compose --profile prod up --build
   → compose 把 envvar 透過 build.args 傳給 docker build:
     docker build --build-arg VITE_SERVICE_BASE_URL=http://rust-api:21081 ...
3. Dockerfile builder stage:
     ARG VITE_SERVICE_BASE_URL=<default>     ← 接收 build-arg(無傳時用 default)
     RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local
4. RUN pnpm build:
     vite loadEnv('prod', cwd) 讀 .env.prod.local(precedence 高於 .env.prod)
     vite 把 import.meta.env.VITE_SERVICE_BASE_URL = <override 值> inline 進 bundle
5. dist/assets/index-<hash>.js 含 "<override URL>" string literal
6. Runtime 瀏覽器執行:fetch("<override URL>/api/...")
```

**Validation**:
- override 後 `grep -c '<override URL substring>' /usr/share/nginx/html/assets/*.js` > 0(SC-003 / FR-017)
- 不動 `base-web/.env.prod`(git diff 不顯;FR-023)

---

## Entity 4: Standalone Compose (`docker-compose.base-web.yml`)

**意義**:獨立 compose 檔(workspace root)、與未來 Phase 1 #4 整套 stack 解耦,dev / prod profile 切換。

**Services**:

### `base-web-dev`(profile: dev)

| 屬性 | 值 |
|---|---|
| profiles | `["dev"]` |
| image | `node:20.19-alpine`(直接用 base、不 build) |
| container_name | `rev2-admin-base-web-dev`(原 `rev2-base-web-dev`、對齊 001) |
| working_dir | `/app` |
| environment | `NODE_ENV=development` + `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` + `npm_config_store_dir=/pnpm-store` + `CI=true`(全 000 既有) |
| volumes | `./base-web:/app` + `bw_node_modules:/app/node_modules` + `bw_pnpm_store:/pnpm-store`(全 000 既有) |
| ports | `127.0.0.1:21079:21079`(從 9527:9527 改) |
| command | `sh -c "npm install -g pnpm@10 && pnpm install && pnpm dev --host 0.0.0.0 --port 21079"`(--port 21079 替 9527) |
| init / tty / stdin_open | true / true / true(全 000 既有) |

### `base-web-prod`(profile: prod)

| 屬性 | 值 |
|---|---|
| profiles | `["prod"]` |
| build.context | `./base-web` |
| build.dockerfile | `../deploy/Dockerfile.base-web.txt` |
| build.args.VITE_SERVICE_BASE_URL | `${VITE_SERVICE_BASE_URL:-https://mock.apifox.cn/m1/3109515-0-default}`(本 feature 新增) |
| image | `rev2-admin-base-web:latest`(本 feature 新增,顯式 tag) |
| container_name | `rev2-admin-base-web`(原 `rev2-base-web-prod`、對齊 001) |
| ports | `127.0.0.1:21079:21079`(從 9528:80 改) |
| restart | `unless-stopped`(全 000 既有) |

### Top-level

| 屬性 | 值 |
|---|---|
| volumes | `bw_node_modules`(name: `rev2_bw_node_modules`)+ `bw_pnpm_store`(name: `rev2_bw_pnpm_store`)(全 000 既有) |

---

## 跨 entity 關係

```
docker-compose.base-web.yml
  ├─ base-web-dev (profile: dev)
  │   └─ image: node:20.19-alpine + bind mount source + inline cmd
  │       └─ vite dev server :21079 → 直連 host 21079
  │
  └─ base-web-prod (profile: prod)
      └─ build → builder stage
      │   ├─ ARG VITE_SERVICE_BASE_URL
      │   ├─ RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local
      │   ├─ RUN pnpm build  (vite loadEnv 讀 .env.prod.local 覆寫 .env.prod 同 key)
      │   └─ dist/  (含 dist/health.html ← base-web/public/health.html)
      │
      └─ runtime stage
          ├─ COPY dist/ → /usr/share/nginx/html/
          ├─ nginx config listen 21079 + SPA fallback
          ├─ EXPOSE 21079
          └─ HEALTHCHECK wget /health.html grep "ok"
              └─ probe /usr/share/nginx/html/health.html
                  ↑
                  (vite copy from base-web/public/health.html)
```
