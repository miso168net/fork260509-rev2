# 002 · dockerfile-base-web

> rev2 第二個 spec-kit feature 的 Phase 0 brainstorm spec-design。
> 對應 DESIGN §10 Phase 1 #2(base-web Dockerfile feature)+ 補 [000 base-web docker bootstrap](000-base-web-docker-bootstrap.md) deferred 項。
>
> 編號 `002` = 對齊 CLAUDE.md §3 階段 0「`docs/superpowers/<NNN>-<feature-name>.md`」命名。
> 本檔是 spec-kit `/speckit-specify` 的 input 來源(階段 0 → 階段 1 的交棒物件)。

---

## 1. 目的與紀律

### 1.1 為什麼是這個 feature

- 000 base-web docker bootstrap(2026-05-26 落地、commit `24ed26d`)是 pre-spec-kit 快速容器化、port 9527/9528 與 [CLAUDE.md §8.2](../../CLAUDE.md) 規劃不對齊;§8.2 base-web 規劃改用 `host 21079:21079`(2026-05-28 拍板,理由是 internal `:80` 在單 compose 啟動易撞 host port)
- rev2 第一個 feature [001-dockerfile-rust-api](001-dockerfile-rust-api.md) 用 21081 已示範 standalone compose + image tag + container_name + HEALTHCHECK 的對齊紀律;本 feature 把 base-web 補齊到同一基線
- 000 §6.1 列「prod profile 沒實機跑(必補)」、§6.3 列「跟 §8.2 整合策略待評」— 本 feature 一併收掉
- 同時封袋 DESIGN §10 Phase 1 #2 原 scope 的 `build-arg VITE_SERVICE_BASE_URL`(讓未來不同 backend URL 共用一套 image)

Phase 1 部署基建的第二片拼圖。

### 1.2 軌道對齊

- 屬 **BASE-WEB-ADAPT**(constitution v1.0.0 §III / DESIGN §7.1)— 軌道描述「`.env` + `src/typings/api/rev2-extra.d.ts` 等新檔;新增為主、不改 inline;禁止刪除既有 type / field」
- 本 feature 新增 `base-web/public/health.html`(2-line `ok` 靜態檔),語義對齊軌道 spirit
- **首次在 `public/` 子目錄應用本軌道**;spec 階段在 Constitution Compliance 段 explicit acknowledge、不觸發 constitution amendment;DESIGN §7.1 在後續 update 中可補一個 example(`public/health*` 加進已列舉清單)
- 不觸及其他軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG / BASE-WEB-WRAPPER / RUSTAPI-SOURCE-ISOLATION)

### 1.3 與後續 feature 的邊界

| feature | 本 feature 交 | 留給後續 |
|---|---|---|
| Phase 1 #1 dockerfile-rust-api(已完成 2026-05-28) | rust-api standalone compose + Dockerfile + secret loader | — |
| **Phase 1 #2 dockerfile-base-web(本)** | base-web standalone compose port 對齊 21079 + image tag/container_name 對齊 001 + nginx HEALTHCHECK + `public/health.html` + build-arg `VITE_SERVICE_BASE_URL` + 補 000 §6.1 prod 驗證 + 000 §2.3/§6.3 surgical patch | — |
| Phase 1 #3 TLS 憑證 skeleton | — | `deploy/generate-dev-cert.sh` + nginx TLS conf |
| Phase 1 #4 容器 port 與編排 | base-web standalone compose 已對齊 §8.2 規劃 21079(整合直接抄) | 整套 `docker-compose.yml` + `.dev.yml` + `.prod.yml` + obs override;base-web service 移過去、standalone compose 退場;prod 不對外 expose 21079(由 front-nginx 21080/21443 reverse proxy 至 internal:21079) |
| Phase 1 #5 secret 注入機制 | base-web 不需 secret(無 env-file pattern) | rust-api 9 個其他 secret 範本檔 + `deploy/generate-secrets.sh` + dual-write docs |
| Phase 3 base-web 環境配置(CHECKLIST §5.5) | build-arg 機制已交 | `VITE_SERVICE_BASE_URL` 切到自家 rust-api(`http://rust-api:21081` internal name);本 feature 已交機制、後續只需 compose `build.args` 帶不同 URL |

---

## 2. Scope 凍結摘要

| 維度 | 拍板結果 |
|---|---|
| **port** | host 21079 → container 21079;dev/prod 共用單 port(只能擇一 up、避撞)|
| **image tag** | `rev2-admin-base-web:dev` / `:latest`(對齊 001 命名);dev 因不 build 不設 tag |
| **container_name** | `rev2-admin-base-web-dev` / `rev2-admin-base-web`(對齊 001;從 `rev2-base-web-*` 改名)|
| **Dockerfile stage** | 保留 **2 stage**(builder + runtime),**不加 dev stage**(dev 仍用 `image: node:20.19-alpine` + inline `command:`,保留 000 結構)|
| **dev profile** | 保留 000 結構(image / command / pnpm@10 / 3 named volume / CI=true / store dir),只改 port + container_name |
| **HEALTHCHECK** | runtime stage 加 `HEALTHCHECK ... wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok"`(`nginx:alpine` 內含 wget、不含 curl,跟 001 用 curl 是 base image 差異)|
| **`/health.html` 來源** | 新增 `base-web/public/health.html` 內容 `ok`;vite build 自動 copy 到 `dist/`;nginx `try_files $uri` 第一段命中、不走 SPA fallback |
| **build-arg** | builder stage 加 `ARG VITE_SERVICE_BASE_URL` → `ENV VITE_SERVICE_BASE_URL=$ARG`(放 `RUN pnpm build` 前);compose prod `build.args:` 預設 `https://mock.apifox.cn/m1/3109515-0-default`(對齊現 .env.prod);override 由 user shell envvar 傳 |
| **000 修** | surgical patch §2.3 + §6.1 + §6.3 prose;檔尾加 footnote 引用 feature 002 update;§3 / §4 6 輪 debug / §5 CDP / §7 可重做命令 / §8 持久記憶 / Appendix A scripts 保留不動 |
| **Constitution** | BASE-WEB-ADAPT 軌道首次應用於 `public/` 子目錄;spec 階段 Constitution Compliance 段 explicit acknowledge、不觸發 amendment |
| **拆 feature** | 整包單一 feature(scope ~15-20 task、單 spec 容得下);不拆「port-only + build-arg-later」(避免 spec-kit overhead 翻倍) |

---

## 3. 檔案異動清單

| 路徑 | 動作 | 行數量級 |
|---|---|---|
| `base-web/public/health.html` | **新增**(2-line `ok` + 註解) | +2 |
| `deploy/Dockerfile.base-web.txt` | 改:builder ARG/ENV `VITE_SERVICE_BASE_URL` / nginx config heredoc `listen 21079` / runtime EXPOSE 21079 + HEALTHCHECK | ~+10 -2 |
| `docker-compose.base-web.yml` | 改:dev/prod port → 21079 / container_name 對齊 001 / 顯式 image tag / prod build.args 加 VITE_SERVICE_BASE_URL default | ~+15 -8 |
| `docs/superpowers/000-base-web-docker-bootstrap.md` | surgical patch §2.3 / §6.1 / §6.3 + 檔尾 footnote | ~+15 -10 |

**不動**(保紀律):
- `base-web/src/*`、`base-web/.env*`、`base-web/vite.config.ts` — 不改 inline(constitution §I.1)
- `docker-compose.base-web.yml` 內 dev profile structure(image / command / 3 volume / pnpm@10 / CI=true / store dir)— 保留 000 路線
- 000 §3 / §4 / §5 / §7 / §8 / Appendix(debug 紀錄完整保留)

---

## 4. `base-web/public/health.html` 新增

```html
<!-- ops health probe target;feature 002-dockerfile-base-web 新增 -->
<!-- 不被 SPA 渲染;nginx try_files $uri 直接命中、不走 SPA fallback -->
ok
```

- 內容 = `ok\n`(3 bytes)
- 為何安全:vite copy `public/*` 到 `dist/` 不轉譯;nginx 在 dist/ 找到 `/health.html` 直接 serve、不會落到 `try_files` fallback
- 不影響 SPA:routing 由 vue-router 接管 `/`,SPA bundle 內不會引用 `/health.html`
- upstream rebase 友善:soybean-admin upstream `public/` 內無 `health.html`,rebase 不會 conflict

---

## 5. Dockerfile + entrypoint 變動

### 5.1 Stage 1 builder

```dockerfile
FROM node:20.19-alpine AS builder
RUN corepack enable
WORKDIR /app

# ARG + ENV:給 vite build-time 讀(VITE_ prefix 自動 expose to client bundle)
# 預設指向 ApiFox Mock(對齊現 base-web/.env.prod);compose 可 override
ARG VITE_SERVICE_BASE_URL=https://mock.apifox.cn/m1/3109515-0-default
ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL

# === 以下與既有 builder 邏輯一致 ===
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

COPY build ./build
COPY public ./public                           # ← 包含本 feature 新增的 health.html
COPY src ./src
COPY .env .env.prod .env.test ./
COPY index.html vite.config.ts tsconfig.json uno.config.ts ./

RUN pnpm build                                 # ENV VITE_SERVICE_BASE_URL override .env.prod 同 key

# nginx config heredoc — listen 改 21079(原 80)
RUN mkdir -p /tmp/nginx && cat > /tmp/nginx/default.conf << 'NGINX_EOF'
server {
    listen 21079;                              # ← 從 80 改
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;      # SPA fallback;health.html 在 $uri 階段命中、不 fallback
    }
}
NGINX_EOF
```

### 5.2 Stage 2 runtime

```dockerfile
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /tmp/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 21079                                   # ← 從 80 改

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok" || exit 1
```

**為何 wget 而非 curl**:`nginx:alpine` 內含 `wget`(busybox)但**不含** `curl`,所以 HEALTHCHECK 用 wget(rust-api runtime 用 debian-slim + apt curl,所以 001 那邊用 curl)。HEALTHCHECK timing 對齊 001(`10s / 3s / 5s / 3`)。

### 5.3 紀律重點

- builder ARG/ENV 放 `RUN pnpm build` 前才能被 vite 讀到
- `VITE_` prefix 是 vite 規約 — 自動 expose to client-side bundle(`import.meta.env.VITE_*`);Phase 3 base-web 接 rust-api 時,改 compose `build.args` 帶不同 URL 即可,不動 inline `.env`
- nginx config heredoc 用 `NGINX_EOF` quoted heredoc 避變數展開 quirk(對齊 000 §3.2 既有寫法)
- HEALTHCHECK 不靠 wget exit code(`grep -q "ok"` 更穩,讀 body 比 status 嚴格)

---

## 6. `docker-compose.base-web.yml` 變動

### 6.1 完整 compose 內容

```yaml
# docker-compose.base-web.yml
# 標準用法:
#   dev:  docker compose -f docker-compose.base-web.yml --profile dev up
#   prod: docker compose -f docker-compose.base-web.yml --profile prod up --build
# (override backend URL:VITE_SERVICE_BASE_URL=http://rust-api:21081 docker compose ... up --build)

services:
  base-web-dev:
    profiles: ["dev"]
    image: node:20.19-alpine                                 # 保留 000 — 不換 dev pattern
    container_name: rev2-admin-base-web-dev                  # ← 從 rev2-base-web-dev 改(對齊 001)
    working_dir: /app
    environment:
      - NODE_ENV=development
      - COREPACK_ENABLE_DOWNLOAD_PROMPT=0
      - npm_config_store_dir=/pnpm-store
      - CI=true
    volumes:
      - ./base-web:/app
      - bw_node_modules:/app/node_modules
      - bw_pnpm_store:/pnpm-store
    ports:
      - "21079:21079"                                        # ← 從 9527:9527 改
    command:
      - sh
      - -c
      - "npm install -g pnpm@10 && pnpm install && pnpm dev --host 0.0.0.0 --port 21079"   # ← --port 21079
    init: true
    tty: true
    stdin_open: true

  base-web-prod:
    profiles: ["prod"]
    build:
      context: ./base-web
      dockerfile: ../deploy/Dockerfile.base-web.txt
      args:                                                  # ← 新增 build-args 段
        VITE_SERVICE_BASE_URL: "${VITE_SERVICE_BASE_URL:-https://mock.apifox.cn/m1/3109515-0-default}"
    image: rev2-admin-base-web:latest                        # ← 新增 顯式 image tag
    container_name: rev2-admin-base-web                      # ← 從 rev2-base-web-prod 改(對齊 001)
    ports:
      - "21079:21079"                                        # ← 從 9528:80 改
    restart: unless-stopped

volumes:
  bw_node_modules:
    name: rev2_bw_node_modules
  bw_pnpm_store:
    name: rev2_bw_pnpm_store
```

### 6.2 dev 為何不設 image tag

dev profile 直接用 `image: node:20.19-alpine` base、不 build,所以沒 image tag 可指(setting `image: rev2-admin-base-web:dev` 沒意義因為沒 build 對應 stage)。若未來 §10.2 把 dev 改為 build target=dev,再加 tag。

### 6.3 為何 prod port 改 host:21079 容器:21079(原 9528:80)

舊 host:9528 / container:80 是 nginx 預設;新規劃單 port 21079:21079 對齊 §8.2 規劃,理由是 internal:80 在單 compose 啟動易撞 host port(若 host 上有別的 80 服務或 rev1 並存)。container 改 listen 21079(Dockerfile nginx config heredoc 改)+ EXPOSE 21079。

---

## 7. 000-bootstrap.md surgical patches

### 7.1 §2.3 port 表 prose

```diff
- | dev | `21079` | `21079` | base-web/package.json 內 vite 預設 |
- | prod | `21079` | `80` | 避開 dev 21079、單調 +1 易記 |
+ | dev | `21079` | `21079` | feature 002 對齊 §8.2 規劃 21079(原 vite 預設 9527 由 compose `--port` override) |
+ | prod | `21079` | `21079` | feature 002 對齊;單 port 跟 dev,避開 internal:80 撞 host |
```

並把 §2.3 開頭 "⚠️ 未來與 §8.2 整合考量" 那段從「避開兩套並存」改為「對齊 §8.2 規劃 21079」(原 9527/9528 quick bootstrap 過渡期已結束)。

### 7.2 §6.1 prod profile 沒實機跑 — 改為已驗收

```diff
- ### 6.1 prod profile 沒實機跑(必補)
- `docker compose -f docker-compose.base-web.yml --profile prod up --build` 只 paper-checked,沒實際 build/run。重點驗:
- - `pnpm install --frozen-lockfile` 是否能過...
+ ### 6.1 prod profile 實機驗收 ✅(feature 002 完成)
+ feature 002 acceptance §8.2 已實機驗證 `--profile prod up --build`(SPA fallback / `/health.html` static / build-arg override 三路徑)。詳見 [specs/002-dockerfile-base-web/contracts/](../../specs/002-dockerfile-base-web/contracts/)。
```

### 7.3 §6.3 §8.2 整合策略

```diff
- port 也要對齊:21080/21443(front-nginx 對外)vs 21079/21079(本 standalone)。決定點:§8.2 落地時再評。
+ port 已對齊:本 standalone 用 21079 = §8.2 base-web 內部規劃 port;§8.2 整套 stack 落地時 front-nginx 對外 21080/21443、內部 reverse proxy 至 base-web:21079(internal 同 port、不再轉)。standalone compose 在 §8.2 落地後可退場(由整套 compose 取代)。
```

### 7.4 檔尾 footnote

```
> feature 002-dockerfile-base-web(2026-05-28)後續 update:port 9527/9528 → 21079;
> 加 build-arg VITE_SERVICE_BASE_URL;加 nginx HEALTHCHECK probe /health.html;
> 新增 base-web/public/health.html。詳見 specs/002-dockerfile-base-web/。
```

### 7.5 不動

§3 檔案位置 / §4 6 輪 debug / §5 CDP / §7 可重做命令 / §8 持久記憶 / Appendix A scripts。

---

## 8. 驗收清單

每項列命令 + 預期輸出。spec 階段 `/speckit-plan` 會落 `contracts/verification-commands.md` 完整版。

### 8.1 dev profile up + /health.html

```bash
docker compose -f docker-compose.base-web.yml --profile dev up -d
# 等 ~30s(pnpm install + vite ready)
curl -fsS http://127.0.0.1:21079/health.html
# 預期:ok
curl -fsS http://127.0.0.1:21079/
# 預期:HTTP 200 + SPA index.html(SPA fallback 走 vue-router)
```

### 8.2 prod build + 3 acceptance(SPA fallback / /health.html static / build-arg override)

```bash
# (a) Standard build (預設 backend = ApiFox Mock)
DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait

curl -fsS http://127.0.0.1:21079/health.html        # 預期:ok
curl -fsS http://127.0.0.1:21079/some/random/route  # 預期:200 + SPA index.html(try_files fallback)
curl -fsS http://127.0.0.1:21079/                   # 預期:200 + SPA index.html

# (b) build-arg override 驗收
docker compose -f docker-compose.base-web.yml --profile prod down
VITE_SERVICE_BASE_URL=http://rust-api:21081 \
docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait
docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'rust-api:21081' /usr/share/nginx/html/assets/*.js"
# 預期:> 0(VITE_SERVICE_BASE_URL inline 進 prod bundle)

# (c) HEALTHCHECK 驗收
docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期:healthy
```

### 8.3 docker run with image tag

```bash
docker run --rm -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest
curl -fsS http://127.0.0.1:21079/health.html   # 預期:ok
```

驗證 image tag `rev2-admin-base-web:latest` 已正確 build + 可獨立 run。

### 8.4 補 000 §6.1 deferred prod 驗收(從 deferred 改 done)

跑完 §8.1-8.3 即等同。spec 階段 task 寫「跑完 acceptance 後 update 000 §6.1 + footnote」。

### 8.5 不動 base-web inline 驗收

```bash
git -C base-web diff --name-only HEAD
# 預期:只有 public/health.html(BASE-WEB-ADAPT 允許 + 軌道描述「新增為主」)
```

### 8.6 DESIGN §4.6 baseline 對應

| §4.6 子節 | 本 feature 落實 |
|---|---|
| §4.6.1 application.yaml placeholder | N/A(rust-api domain) |
| §4.6.2 11 secret 清單 | N/A(base-web 無 secret) |
| §4.6.3 Casbin seed | N/A(Phase 3) |
| §4.6.4 migration entity | N/A |
| §4.6.5 sys_user 帳號 | N/A |
| §4.6.6 graphify 落地 | N/A |

base-web feature 不對應 §4.6 baseline 任何子節(rust-api 專屬)。

---

## 9. Constitution Compliance 對齊預檢(constitution v1.0.0 §IV)

`/speckit-plan` 步將自動跑 Compliance Check;本檔預估 7 項評估如下供 plan 階段參考:

| § | 項 | 本 feature 立場 |
|---|---|---|
| §I.1 | base-web 為權威(不改 inline) | ✅ 對齊 — 不改 `base-web/src/*` 或 `.env`;新增 `public/health.html` 屬 BASE-WEB-ADAPT「新增為主」邊界內 |
| §I.2 | menu 權限 Casbin enforce | ✅ N/A — 本 feature 無 menu / 無 auth |
| §I.3 | wire ground truth(envelope / id 型 / error code) | ✅ N/A — 本 feature 無 wire endpoint(`/health.html` 是 nginx static、非 wire envelope domain) |
| §I.4 | SDD + TDD 混合工作流 | ✅ 對齊 — 已走 brainstorm,後續 `/speckit-specify` → ... → `executing-plans` |
| §I.5 | RUSTAPI-SOURCE-ISOLATION | ✅ N/A — 本 feature 不動 rust-api |
| §III | 軌道授權邊界 | ✅ BASE-WEB-ADAPT 軌道首次應用於 `public/` 子目錄;明確聲明「軌道描述『新增為主、不改 inline』spirit 的延伸應用,**新增 `public/health.html` 不違反該軌道**」— 不觸發 constitution amendment;DESIGN §7.1 可在後續 update 中補一個 example(`public/health*` 加進「`.env` + `rev2-extra.d.ts` 等新檔」清單) |
| §V | 兩條鐵紀律(base-web 為權威 / Casbin enforce) | ✅ 對齊 §I.1 + §I.2 |

**預估**:7 項全 PASS、無 violations、無 Complexity Tracking。

---

## 10. Open Questions / Follow-up

### 10.1 留給 spec-kit `/speckit-clarify` 補的細節

- vite 是否真的在 `pnpm build` 時讀 `process.env.VITE_SERVICE_BASE_URL` 並 override `.env.prod` 同 key?需 grep `base-web/vite.config.ts` + vite docs 驗證(spec/clarify research grep);若 vite 只讀 `.env.*` 不讀 process env,要改成 builder stage 寫 `.env.local` 或 `.env.production.local`(`.env.local` 在 vite mode-based 載入時 precedence 最高)
- HEALTHCHECK 用 `wget -qO- | grep -q "ok"` 是否在 alpine 上一定 work?替代:`wget --spider http://...` 純 status 檢查(不 grep body)— 二者選一,spec/clarify 評估
- `try_files $uri $uri/ /index.html` 是否真的在 `/health.html` 階段就 stop(不再 fallback)?需 spec 階段在 nginx config 內加 access_log 驗證
- 是否需要 dev profile 也加 HEALTHCHECK?本 feature 只計劃 prod(nginx runtime)的 HEALTHCHECK,dev(vite dev server)的 health 留 follow-up

### 10.2 留給後續 feature 的明確 contract

- **Phase 1 #4 容器 port 與編排 feature**:把本 `docker-compose.base-web.yml` 內 service 移到整套 `docker-compose.yml`;prod 不對外 expose 21079(由 front-nginx 21080/21443 reverse proxy 至 internal:21079);standalone compose 退場
- **Phase 3 base-web 環境配置(CHECKLIST §5.5)**:`VITE_SERVICE_BASE_URL` 切到自家 rust-api(`http://rust-api:21081` 或 internal 名稱);本 feature 已交 build-arg 機制、後續只需 compose `build.args` 帶不同 URL

### 10.3 風險與緩解

| 風險 | 緩解 |
|---|---|
| vite build-time 不 honor process env override `.env.prod` | spec/clarify research 階段 grep `vite.config.ts` + 試跑 build-arg 驗證;若不 work 改 `.env.production.local` 寫入 fallback |
| `nginx:alpine` 內 wget 行為與 curl 不同(stderr 寫法 / exit code) | HEALTHCHECK 寫 `wget -qO- ... | grep -q "ok"`,grep -q 不靠 wget exit code(更穩);spec 階段實機驗 |
| BASE-WEB-ADAPT 軌道擴用至 `public/` 被 challenge 為 amendment 必要 | 本 brainstorm + spec/plan 都明確 acknowledge + reasoning;若用戶 / future reviewer 認為仍需 amendment,在 spec 階段升級為正式 amendment(spec 暫不 amend、留 fallback) |
| `/health.html` 在 SPA upstream rebase 衝突 | 極低風險 — soybean-admin upstream `public/` 內無此檔;rebase 時 git 不 conflict |

### 10.4 Implementation friction notes(2026-05-28 實作階段補)

實作階段(`superpowers:executing-plans` 走完 T001-T020)碰到 3 點 friction,記下供後續 feature 或 doc patch 參考:

1. **`docker images` size 顯示虛胖**:`docker images` table 顯示 `rev2-admin-base-web:latest` 大小為 ~112 MB,但 `docker image inspect --format='{{.Size}}'` 回 ~29 MB(實際 runtime image)。差異來自 BuildKit default 啟用 attestation manifest + 多平台 manifest list。**SC-004 判讀採用 `docker image inspect .Size`**(plan/data-model.md 寫法一致)。
2. **verification-commands.md §1 字串比對 bug**:`if [ "$resp" = "ok" ]` 字面比對失敗 — 因 `health.html` 含 2 行 HTML 註解 + `ok` body,response 不會等於字面 `ok`。**正確改用 `curl ... | grep -q "ok"`**(對齊 HEALTHCHECK probe 寫法)。建議 verification-commands.md §1 後續 patch 修。
3. **builder stage `RUN corepack enable` 同款 ESM bug**:000-bootstrap.md §3.2 line 249 註解假設「builder 用 `pnpm install --frozen-lockfile` 不走 latest、corepack 沒問題」未經實機驗。實際跑碰到 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`(000 §4 第 3 輪同款 bug)。**修法**:對齊 dev profile 改 `RUN npm install -g pnpm@10`(已 update 000 §3.2 / §6.1 + 檔尾 footnote bonus 項)。

---

## 11. 交棒給 `/speckit-specify`(階段 1)

本檔(spec-design)完成 + user 審核後 **手動執行** `/speckit-specify`(CLAUDE.md §3 紀律:不可在 brainstorm 內自動觸發,會跳過 `speckit.git.feature` pre-hook、不會自動建 `002-dockerfile-base-web` feature branch)。

`/speckit-specify` 階段會:
1. `before_specify` pre-hook(`speckit.git.feature`)從當前 `rev2-admin-root` 自動建 `002-dockerfile-base-web` feature branch
2. 從本檔 input 產出 `specs/002-dockerfile-base-web/spec.md`(formal spec)
3. 後續 `/speckit-clarify` → `/speckit-plan`(對照 `.specify/memory/constitution.md` v1.0.0 跑 Compliance Check)→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`

---

**生效**:本檔成立後即為 `002-dockerfile-base-web` feature 的 Phase 0 brainstorm 權威;後續 spec / plan / tasks / implementation 任何決策若偏離本檔,需在對應 spec doc 明示理由 + 更新本檔。
