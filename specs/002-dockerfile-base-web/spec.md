# Feature Specification: dockerfile-base-web

**Feature Branch**: `002-dockerfile-base-web`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Phase 1 #2 base-web Dockerfile feature — port align §8.2 21079 + nginx HEALTHCHECK + public/health.html + build-arg VITE_SERVICE_BASE_URL + 000 surgical patch"

**Phase 0 brainstorm source**: [`docs/superpowers/002-dockerfile-base-web.md`](../../docs/superpowers/002-dockerfile-base-web.md)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — base-web standalone compose port 對齊 §8.2 規劃 (Priority: P1)

rev2 開發者用 standalone `docker-compose.base-web.yml` 跑 base-web SPA(dev / prod profile),host port 對齊 [CLAUDE.md §8.2](../../CLAUDE.md) 規劃 21079;未來 Phase 1 #4 整套 stack(front-nginx + 全部 service)落地時可直接抄此 service 過去、不需 port 再調整。

**Why this priority**:000 base-web bootstrap 用 9527 / 9528 與 §8.2 規劃(原 internal:80 由 front-nginx reverse proxy,2026-05-28 拍板改為 host 映射 21079:21079 避撞)不對齊;未對齊 → Phase 1 #4 整合時 service 要改 port、impactful change 散落多檔;對齊後整合「直接搬」、零調整。此 feature 是 deployment baseline 的二片拼圖,優先級 P1。

**Independent Test**:從 workspace root 跑 dev 或 prod profile up、curl `http://127.0.0.1:21079/`(SPA index 200)、`http://127.0.0.1:21079/health.html`(plain text `ok`),即可獨立驗證價值。

**Acceptance Scenarios**:

1. **Given** `docker-compose.base-web.yml` 已對齊本 feature 拍板、worktree 內 `base-web/public/health.html` 已新增,**When** 跑 `docker compose -f docker-compose.base-web.yml --profile dev up -d` + 等 pnpm install / vite ready,**Then** `curl http://127.0.0.1:21079/health.html` 回 `ok`(HTTP 200)+ `curl http://127.0.0.1:21079/` 回 SPA index.html(HTTP 200,走 SPA fallback)
2. **Given** 同前,**When** 改跑 prod profile `up -d --build --wait`,**Then** image build 成功 + container 起來 + `curl /health.html` 回 `ok` + `curl /some/random/route` 回 SPA index(SPA fallback)
3. **Given** prod image 已 build,**When** 用 `docker run --rm -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest` 獨立 run,**Then** container 起、`curl /health.html` 回 `ok`(image tag 可獨立使用、不依賴 compose 才能 run)

---

### User Story 2 — nginx HEALTHCHECK 自動健康狀態 (Priority: P2)

operator 跑 prod profile 後,docker 自動健康檢查 30 秒內把 container 標為 `healthy`;若 nginx 異常(進程死掉 / dist 沒有 health.html 等)會自動標為 `unhealthy`,operator 看 `docker ps` 就知道狀態。

**Why this priority**:沒有 HEALTHCHECK 也能跑(P1 涵蓋),但 operator 監控 / 後續整合到 §8.2 整套 stack 時 front-nginx 也要 healthcheck base-web 是否 ready 才 reverse proxy。本 feature 先把 standalone HEALTHCHECK 做好、整合時直接 reuse。優先級 P2(基礎可運轉、強化 operator visibility)。

**Independent Test**:`docker compose -f docker-compose.base-web.yml --profile prod up -d --wait` + `docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'` 回 `healthy`(30 秒內);或刻意刪 `/usr/share/nginx/html/health.html` 模擬故障,等 30 秒後 status 改 `unhealthy`。

**Acceptance Scenarios**:

1. **Given** prod profile container 剛 up,**When** 等 30 秒(start-period 5s + 至少 1 次 interval probe 通過),**Then** `docker inspect ... .State.Health.Status` 回 `healthy`
2. **Given** container running、healthy,**When** 模擬故障(`docker exec rev2-admin-base-web rm /usr/share/nginx/html/health.html`),**Then** 等 30-60 秒後 status 變 `unhealthy`(`retries=3` × `interval=10s` 內 3 連續 fail 後標)

---

### User Story 3 — VITE_SERVICE_BASE_URL build-arg 共用一套 image (Priority: P3)

開發者 / operator 用同一份 `Dockerfile.base-web.txt` build prod image,但能透過 build-arg `VITE_SERVICE_BASE_URL` 指定不同 backend URL(預設 ApiFox Mock、可 override 成 `http://rust-api:21081` 內部 service name 或別的 mock),不需動 `base-web/.env*` inline 檔。

**Why this priority**:此機制本身不影響本 feature MVP(prod 預設值跑得起來);但留出後續 Phase 3 base-web 接 rust-api 時、Phase 1 #4 整合 stack 時的 contract — 「一套 image 切不同 backend」是部署友善的基礎能力。優先級 P3(現在做不需重大代價、後續省 friction)。

**Independent Test**:`VITE_SERVICE_BASE_URL=http://rust-api:21081 docker compose ... --profile prod up -d --build --wait`,然後 `docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'rust-api:21081' /usr/share/nginx/html/assets/*.js"` 結果 > 0(URL inline 進 bundle)。

**Acceptance Scenarios**:

1. **Given** standard build(無 override),**When** `docker compose ... --profile prod up -d --build`,**Then** image 內 `/usr/share/nginx/html/assets/*.js` 含預設 ApiFox Mock URL 字串
2. **Given** override build,**When** `VITE_SERVICE_BASE_URL=http://rust-api:21081 docker compose ... --profile prod up -d --build`,**Then** image 內 bundle 含 `rust-api:21081` 字串、不含舊 ApiFox URL
3. **Given** 不動 `base-web/.env.prod`,**When** 跑 override build,**Then** `git -C base-web diff` 只顯示新增的 `public/health.html`(BASE-WEB-ADAPT 軌道紀律驗證)

---

### Edge Cases

- **nginx `try_files` fallback 撞到 `/health.html`**:若 nginx config 寫錯、`try_files $uri` 沒匹配到實體檔 → fallback `/index.html` → `curl /health.html` 回 SPA bundle 而非 `ok`。HEALTHCHECK `grep -q "ok"` 會 fail、container `unhealthy`(由 healthcheck 守護)
- **`/health.html` 在 dist/ 缺失**:若 vite build 沒 copy public/ 進 dist/(極不可能,但 paranoid check)→ HEALTHCHECK fail
- **build-arg override 帶 special chars**:`VITE_SERVICE_BASE_URL=http://...:port/path` 內 colon / slash 進 shell envvar interpolation 應 transparent(由 compose `${VAR:-default}` 機制處理);若 URL 含 `&` `;` 等 shell-special 需 user quote
- **dev profile 跑 prod 命令**(或反之):profile filter 強制 — 沒指定 profile 預設 0 service up;指定錯 profile container 名 / port collision 提示
- **同時 dev + prod up**:port 都 21079,後者 fail bind error。設計接受(用戶要明示一次跑一個 profile)
- **upstream rebase 帶來 `public/health.html` conflict**:soybean-admin upstream `public/` 內無 `health.html`、不衝突;若未來 upstream 真新增同名檔,git rebase 提示手動解(極低風險)
- **vite 不 honor process env override `.env.prod`**:vite `loadEnv` 只讀 `.env.*` 系列檔(不讀 `process.env`),plan/research §1 已驗證、實作走 builder stage 寫 `.env.prod.local`(base-web build mode = `prod`、`.env.prod.local` precedence 高於 `.env.prod`、`*.local` 已在 base-web `.gitignore` 內)

---

## Requirements *(mandatory)*

### Functional Requirements

**Port alignment**

- **FR-001**:系統 MUST 把 base-web standalone compose host port 改為 21079(對齊 [§8.2](../../CLAUDE.md) 規劃),dev / prod profile 共用單 port(只能擇一 up、避撞)
- **FR-002**:container 內 nginx MUST listen 21079(取代 nginx 預設 80),`EXPOSE 21079`
- **FR-003**:dev profile vite dev server MUST listen 21079(`pnpm dev --port 21079`,override 原 vite 預設 9527)
- **FR-004**:標準命令 `docker compose -f docker-compose.base-web.yml --profile {dev|prod} up` 起來後 `http://127.0.0.1:21079/` MUST 回 SPA index(HTTP 200)

**Image tag + container_name 對齊 001**

- **FR-005**:prod profile MUST 顯式 `image: rev2-admin-base-web:latest`、`container_name: rev2-admin-base-web`(對齊 001 rust-api 命名 pattern)
- **FR-006**:dev profile MUST `container_name: rev2-admin-base-web-dev`(原 `rev2-base-web-dev`)。dev 不設 image tag(因不 build、用 base node:20.19-alpine)
- **FR-007**:`docker run --rm -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest` MUST 可獨立 run 並驗 `curl /health.html` 回 `ok`(verify image tag 可獨立使用、不依賴 compose)

**HEALTHCHECK**

- **FR-008**:Dockerfile runtime stage MUST 加 `HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3`,probe 命令 `wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok"`(`nginx:alpine` 內含 wget 不含 curl)
- **FR-009**:healthcheck timing parameters MUST 對齊 001(rust-api `10s / 3s / 5s / 3`),保持 consistency 跨 service
- **FR-010**:正常 up 後 30 秒內 container `State.Health.Status` MUST 為 `healthy`

**/health.html 來源**

- **FR-011**:系統 MUST 新增 `base-web/public/health.html`,內容含 `ok` 字串(以 grep `-q "ok"` 為驗證點)+ HTML 註解標示來源 feature
- **FR-012**:vite build MUST 自動 copy `public/health.html` 到 `dist/health.html`(vite 預設行為,不需 config 改動)
- **FR-013**:nginx config `try_files $uri $uri/ /index.html` 第一段 MUST 命中 `/health.html`、不 fallback 到 SPA index(verify:curl `/health.html` 回 `ok`,curl `/random` 回 SPA index)

**build-arg VITE_SERVICE_BASE_URL**

- **FR-014**:Dockerfile builder stage MUST 在 `RUN pnpm build` 前加 `ARG VITE_SERVICE_BASE_URL=<default>`(default 為 ApiFox Mock URL `https://mock.apifox.cn/m1/3109515-0-default`、對齊現 `base-web/.env.prod`),**不**用 `ENV VITE_SERVICE_BASE_URL=$ARG`(vite `loadEnv` 不讀 process.env、無效;見 plan/research §1)
- **FR-015**:compose prod profile MUST 含 `build.args.VITE_SERVICE_BASE_URL` 引 host envvar `${VITE_SERVICE_BASE_URL:-<default>}`,允許 shell envvar override
- **FR-016**:builder stage MUST 在 `RUN pnpm build` 前 `RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local`,讓 vite mode-aware env file 機制(`.env.prod.local` precedence 高於 `.env.prod`、`*.local` 已在 base-web `.gitignore`)把 build-arg 值 inline 進 client bundle(對應 [contracts/build-arg-vite-service-base-url.md](./contracts/build-arg-vite-service-base-url.md))
- **FR-017**:override 後驗證 `grep -c '<override URL substring>' /usr/share/nginx/html/assets/*.js` MUST > 0(URL 確實 inline 進 bundle)

**000-bootstrap.md surgical patches**

- **FR-018**:系統 MUST surgical patch `docs/superpowers/000-base-web-docker-bootstrap.md` §2.3 port 表 prose(消除「避開 dev 21079」自相矛盾語句)
- **FR-019**:系統 MUST 把 000 §6.1 從「prod profile 沒實機跑(必補)」改為「✅ 已驗收」+ 引用本 feature acceptance §8.2
- **FR-020**:系統 MUST update 000 §6.3 §8.2 整合策略段(從「port 待對齊」改為「port 已對齊 21079」)
- **FR-021**:系統 MUST 在 000 檔尾加 footnote 引用 feature 002 update(條列:port / build-arg / HEALTHCHECK / public/health.html 4 項變動)
- **FR-022**:系統 MUST 不動 000 §3 / §4 / §5 / §7 / §8 / Appendix(debug 紀錄 / CDP / scripts 保留)

**Anti-patterns + 軌道紀律**

- **FR-023**:系統 MUST 不動 `base-web/src/*`、`base-web/.env*`、`base-web/vite.config.ts`、`base-web/package.json`(對齊 constitution §I.1 不改 inline 紀律)
- **FR-024**:系統 MUST 不動 `docker-compose.base-web.yml` 內 dev profile structure(image / command / 3 named volume / pnpm@10 / CI=true / store dir / 各 environment)— 保留 000 路線、只改 port 與 container_name
- **FR-025**:系統 MUST 不加 dev stage 到 Dockerfile(保留 2 stage builder + runtime;dev 仍走 inline command 路線)
- **FR-026**:BASE-WEB-ADAPT 軌道首次應用於 `public/` 子目錄(新增 `public/health.html`)— 軌道描述「新增為主、不改 inline」spirit 對齊;spec 階段 Constitution Compliance 段 explicit acknowledge、**不**觸發 constitution amendment

### Key Entities

- **base-web container image (rev2-admin-base-web)**:rev2 frontend SPA 的唯一可部署單元(prod);prod 走 multi-stage build(builder node + runtime nginx);dev 直接用 node:20.19-alpine base、bind mount source
- **`/health.html` static file**:`base-web/public/health.html` 內容 `ok`;vite build 自動 copy 到 `dist/`;nginx 直接 serve、不走 SPA fallback;HEALTHCHECK probe 對象
- **`VITE_SERVICE_BASE_URL` build-time env var**:vite client bundle inline 的 backend URL;Dockerfile ARG + ENV 機制讓一套 image 可 build 多種 backend(預設 ApiFox Mock,override 給 rust-api / 別的 backend)
- **standalone compose (`docker-compose.base-web.yml`)**:獨立 compose 檔(workspace root)、與未來 Phase 1 #4 整套 stack 解耦,dev / prod profile 切換

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:rev2 開發者從 workspace root 跑 `docker compose -f docker-compose.base-web.yml --profile dev up -d` 到 `curl http://127.0.0.1:21079/health.html` 回 `ok` 的完整時間 < 60 秒(含 pnpm install / vite ready;非首次、有 cache 情境)
- **SC-002**:prod profile `up -d --wait` 後 30 秒內 container `State.Health.Status` 為 `healthy`(start-period 5s + 至少 1 次 interval probe 通過)
- **SC-003**:`VITE_SERVICE_BASE_URL=<custom URL> docker compose ... --profile prod up -d --build` 後 `grep -c '<custom URL substring>' /usr/share/nginx/html/assets/*.js` > 0(URL 確實 inline 進 bundle)
- **SC-004**:prod runtime image 大小 < 80 MB(nginx:alpine ~30MB + dist/ ~30MB margin)— 對齊 alpine baseline
- **SC-005**:`git -C base-web diff --name-only HEAD` 結果**只**含 `public/health.html`(BASE-WEB-ADAPT 軌道驗證:不改 inline、新增為主)
- **SC-006**:`docs/superpowers/000-base-web-docker-bootstrap.md` §6.1 標題從「prod profile 沒實機跑(必補)」改為「prod profile 實機驗收 ✅(feature 002 完成)」

---

## Assumptions

- **Host 環境**:rev2 開發者本機已裝 docker 23+(BuildKit 自動啟用);WSL2 環境下 bind mount 路徑可達、`127.0.0.1` loopback 可從 Windows host 訪問
- **Worktree 狀態**:`base-web/` worktree 已 init(submodule + worktree 雙重身分,branch `rev2-admin-base-web`)、`base-web/public/favicon.svg` 已存在(vite 預設 starter 帶);本 feature 在 public/ 新增 health.html、不刪 favicon.svg
- **fork upstream**:soybean-admin upstream `public/` 內無 `health.html`,本 feature 新增不衝突;若未來 upstream 真新增同名檔,git rebase 手動解(極低風險)
- **build 時間**:首次 prod build 接受 3-5 分鐘(pnpm install + vite build);incremental rebuild < 1 分鐘(若 source 不變、靠 docker layer cache)
- **後續 feature 邊界**(留給對應 Phase):
  - Phase 1 #3 TLS 憑證 skeleton:`deploy/generate-dev-cert.sh` + nginx TLS conf
  - Phase 1 #4 容器 port 與編排:把 standalone compose 內 service 移到整套 `docker-compose.yml`;prod 不對外 expose 21079(由 front-nginx 21080/21443 reverse proxy 至 internal:21079);standalone compose 退場
  - Phase 3 base-web 環境配置(CHECKLIST §5.5):`VITE_SERVICE_BASE_URL` 切到自家 rust-api,本 feature 已交 build-arg 機制
- **軌道授權**:本 feature 屬 BASE-WEB-ADAPT 軌道(constitution v1.0.0 §III / DESIGN §7.1)— 軌道描述「新增為主、不改 inline」,本 feature 新增 `public/health.html` 對齊 spirit;**首次在 `public/` 子目錄應用**,spec 階段在 Constitution Compliance 段 explicit acknowledge、不觸發 amendment
- **Constitution v1.0.0 對齊**:Phase 0 brainstorm §9 Compliance 預檢通過(7 項對 §IV)— 不涉及 base-web inline / Casbin / wire envelope / 三端對齊等 §I-V 條款的 active 適用範圍
- **不在 scope**:CI/CD pipeline(GitHub Actions 等);TLS / HTTPS;front-nginx 整合(留 Phase 1 #4);rust-api 整合(留 Phase 3);base-web 內 dev stage 改寫(YAGNI);observability(留 Phase 6)
