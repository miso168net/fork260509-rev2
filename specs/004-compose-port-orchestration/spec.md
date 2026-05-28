# Feature Specification: compose-port-orchestration

**Feature Branch**: `004-compose-port-orchestration`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Phase 1 #4 容器 port 與編排:master docker-compose stack(base + dev/prod override)+ front-nginx 反向代理(21080/21443,`/` → base-web、`/api/*` → rust-api strip 前綴)+ postgres17 + redis-stack + acme skeleton;wire 003 dev TLS cert;standalone compose 保留加 DEPRECATED header"

**Phase 0 brainstorm source**: [`docs/superpowers/004-compose-port-orchestration.md`](../../docs/superpowers/004-compose-port-orchestration.md)

---

## Clarifications

### Session 2026-05-28

- Q: master compose dev profile 的 base-web / rust-api 用 hot-reload dev container 還是 built prod image? → A: **hot-reload dev container** — base-web 用 `node:20-alpine` + vite dev server、rust-api 用 dev build target + cargo-watch,bind mount source(對齊 001/002 standalone dev profile;dev 改 code 即時生效)。built `:latest` image 僅 prod profile 用。
- Q: postgres / redis data 持久化策略? → A: **named volume 持久** — postgres data → `rev2_postgres_data`、redis → `rev2_redis_data`;`docker compose down` 保留資料、`down -v` 才清(Phase 2 migration / seed 不每次重跑,符合 db service 慣例)。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — dev profile 一鍵拉起完整 stack (Priority: P1)

rev2 開發者在 workspace root 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`,單一命令把 5 個 service(front-nginx + base-web + rust-api + postgres + redis-stack)依依賴順序拉起;`--wait` 回來時全部 healthy;開發者從 host 機 `curl http://127.0.0.1:21080/health` 拿到 front-nginx 的 `ok`,代表整套 dev stack 運轉。

**Why this priority**:沒有 master compose,001/002/003 三片各自獨立、無法組成一套對外服務;一鍵拉起完整 stack 是「容器 port 與編排」feature 的核心價值,也是後續 Phase 2-6 所有 feature 的運行底座。優先級 P1,本 feature MVP = dev profile 全 stack healthy 啟動。

**Independent Test**:從 workspace root 跑 dev profile up,`docker compose ps` 看 5 service 全 `healthy`,`curl 127.0.0.1:21080/health` 回 `ok`,即可獨立驗證價值。

**Acceptance Scenarios**:

1. **Given** clean workspace(003 已生 `deploy/dev-certs/`、001/002 image 可 build),**When** 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`,**Then** front-nginx + base-web + rust-api + postgres + redis-stack 5 service 全部達 `healthy`,`--wait` 成功返回
2. **Given** dev stack running,**When** `curl http://127.0.0.1:21080/health`,**Then** 回 `ok`(front-nginx self healthcheck)
3. **Given** dev stack running,**When** `docker compose ps --format '{{.Name}} {{.Health}}'`,**Then** 5 service 健康狀態皆 `healthy`
4. **Given** dev stack running,**When** host 機 `pg_isready -h 127.0.0.1 -p 25432` 與 `redis-cli -h 127.0.0.1 -p 26379 -a <pw> ping`,**Then** postgres 回 accepting connections、redis 回 `PONG`(底層 service host 直連可用)

---

### User Story 2 — front-nginx 反向代理路由分流 + TLS (Priority: P2)

開發者 browser 開 `https://localhost:21443`,front-nginx 把 `/` 路徑 proxy 到 base-web(SPA + static asset),`/api/*` 路徑 strip `/api` 前綴後 proxy 到 rust-api;HTTPS 走 003 生成的 self-signed cert(SAN localhost+127.0.0.1),browser trust `ca.pem` 後不跳憑證警告。base-web 與 rust-api 在 browser 視角是同一 origin、無 CORS。

**Why this priority**:路由分流 + TLS 是 front-nginx 存在的理由(否則只是 dumb proxy);`/api/*` strip 前綴讓 rust-api 收到對齊 mock ground truth 的 path(`/auth/login` 不帶 `/api`),是 Phase 4 wire feature 的前置。優先級 P2(P1 stack 起來後、路由正確是第二層價值)。

**Independent Test**:dev stack running 後 `curl http://127.0.0.1:21080/`(回 base-web SPA index)+ `curl http://127.0.0.1:21080/api/health`(經 nginx strip → rust-api `/health` 回 200)+ `openssl s_client -connect 127.0.0.1:21443`(cert SAN 對齊),三段通過即驗。

**Acceptance Scenarios**:

1. **Given** dev stack running,**When** `curl http://127.0.0.1:21080/`,**Then** 回 HTTP 200 + base-web SPA index.html
2. **Given** dev stack running,**When** `curl http://127.0.0.1:21080/api/health`,**Then** rust-api 收到 `/health`(strip `/api` 前綴)回 200 `ok`(對齊 mock ground truth path 不帶 `/api`)
3. **Given** dev stack running,**When** `curl -k https://127.0.0.1:21443/health`,**Then** HTTPS 回 200 `ok`(front-nginx self)
4. **Given** dev stack running,**When** `openssl s_client -connect 127.0.0.1:21443 -servername localhost </dev/null`,**Then** cert subject CN=localhost、SAN 含 `DNS:localhost` + `IP Address:127.0.0.1`(003 cert)

---

### User Story 3 — prod baseline + acme skeleton + standalone 退場 (Priority: P3)

維運者跑 prod baseline 模式(`-f docker-compose.yml -f docker-compose.prod.yml`),front-nginx 對 `0.0.0.0:80,443`、port 80 強制 301 redirect 到 443、cert 從 named volume `front_nginx_certs` 讀(預先 seed);加 `--profile prod` 時 acme service 拉起(skeleton,`acme.sh --version` 可跑、不真實 issue cert)。原 standalone compose(`docker-compose.{base-web,rust-api}.yml`)保留作 single-service debug 後備、頂部加 DEPRECATED header。

**Why this priority**:prod 模式 + acme skeleton 是 Phase 1 部署基建的完整收尾(讓 §8.2 三啟動模式全部可跑、不留 placeholder);standalone 退場紀律確保主流走 master compose。優先級 P3(dev 主軸 P1/P2 已可運轉、prod + 退場是完整性收尾)。

**Independent Test**:seed cert 後跑 prod baseline,`curl -I http://127.0.0.1:21080/`(或 :80)回 301 → https;`--profile prod` 跑 `docker compose exec acme acme.sh --version` 回版本;`head docker-compose.base-web.yml` 含 DEPRECATED header,三段通過即驗。

**Acceptance Scenarios**:

1. **Given** cert 已 seed 進 named volume `front_nginx_certs`,**When** 跑 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait`,**Then** front-nginx 對 0.0.0.0:80,443 listen、stack healthy
2. **Given** prod baseline running,**When** `curl -I http://127.0.0.1:21080/`(HTTP),**Then** 回 `301` redirect 到 `https://`
3. **Given** prod + acme(`--profile prod`)running,**When** `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod exec acme acme.sh --version`,**Then** 回 acme.sh 版本字串(skeleton sanity,不真實 issue cert)
4. **Given** 本 feature 落地,**When** `head -5 docker-compose.base-web.yml` 與 `head -5 docker-compose.rust-api.yml`,**Then** 兩檔頂部皆含 `DEPRECATED` header 指向 master compose

---

### Edge Cases

- **prod baseline 啟動前未 seed cert**:named volume `front_nginx_certs` 為空 → nginx 443 server block 起不來(`ssl_certificate` 找不到檔)。§8.2.1 已有 seed 範例;acceptance §4 先 seed 再 prod up;spec 明示 seed 為 prod 前置(非本 feature 自動化)
- **dev profile 未先跑 003 `generate-dev-cert.sh`**:`deploy/dev-certs/{fullchain,privkey}.pem` 不存在 → front-nginx dev bind mount 掛空 → 443 起不來。dev 啟動前置須先跑 003 script(quickstart 明示)
- **redis-stack-server 無原生 `_FILE` secret**:用 command wrap `--requirepass "$(cat /run/secrets/redis_password)"` 注入;若 secret 檔不存在 redis 起不來(prod 前置須先生 secret)
- **rust-api `depends_on postgres+redis` 但現 `/health` stateless**:rust-api 不連 db 也能 healthy;depends_on 只保證啟動順序(db 先 healthy),為 Phase 2 預留,現階段不影響 rust-api 啟動
- **WSL2 NAT mode(非 mirrored)127.0.0.1 binding 失效**:§8.2 已註明需 `.wslconfig` `networkingMode=mirrored`(Win11 22H2+ 預設);acceptance 跑前確認,否則改用 `wsl hostname -I` 拿 WSL IP
- **base-web prod build 未帶 `VITE_SERVICE_BASE_URL=/api`**:axios baseURL 仍指 ApiFox Mock(`.env.prod` 預設)→ browser 不經 nginx 打 rust-api。本 feature acceptance 重 build base-web prod image 帶 build-arg(002 已驗機制)
- **`/api/*` proxy_pass 末尾 `/` 漏掉**:nginx 不 strip `/api` 前綴 → rust-api 收到 `/api/health`(404,因 rust-api route 是 `/health`)。conf 須 `proxy_pass http://rust-api:21081/;`(末尾 `/` 必要)

---

## Requirements *(mandatory)*

### Functional Requirements

**master compose 結構**

- **FR-001**:系統 MUST 提供三檔分層的 master compose — `docker-compose.yml`(base,5 service 共通定義)+ `docker-compose.dev.yml`(dev override)+ `docker-compose.prod.yml`(prod override);啟動永遠顯式 `-f docker-compose.yml -f docker-compose.<env>.yml`(不依賴 `docker-compose.override.yml` auto-load)
- **FR-002**:`docker-compose.yml` base MUST 定義 5 個 service:`front-nginx`、`base-web`、`rust-api`、`postgres`、`redis-stack`;base 層含 image / build / depends_on / healthcheck / named volume / network,**不**含 host port binding 與 dev/prod 專屬 mount(那些落 override 檔)
- **FR-003**:`acme` service MUST 用 `profiles: [prod]` gate,只在 `--profile prod` 啟動時拉起;dev / prod baseline 模式不啟動 acme

**front-nginx 反向代理**

- **FR-004**:`front-nginx` service MUST 用 image `nginx:1.31.0-alpine`
- **FR-005**:front-nginx MUST 路由 `/` → base-web(internal `:21079`)、`/api/*` → rust-api(internal `:21081`)並 strip `/api` 前綴(`proxy_pass http://rust-api:21081/;` 末尾 `/`),讓 rust-api 收到對齊 mock ground truth 的 path(`/auth/login` 不帶 `/api`)
- **FR-006**:front-nginx MUST 提供 `GET /health` 回 200 `ok`(self healthcheck,§8.2.1 curl 用)
- **FR-007**:nginx conf MUST 以 `deploy/nginx/conf.d/{dev,prod}.conf` 分檔(dev/prod 各一份),由 compose override mount 切換到 `/etc/nginx/conf.d/default.conf`;共用 `location` 區塊可抽 `_locations.inc`(plan 階段確認 include 或各寫一份)

**port 配置(對齊 CLAUDE.md §8.2)**

- **FR-008**:dev profile MUST 綁 host port `127.0.0.1` loopback:front-nginx `21080`(HTTP)+ `21443`(HTTPS)、base-web `21079`、rust-api `21081`、postgres `25432`、redis-stack `26379`
- **FR-008a**:dev profile 的 `base-web` / `rust-api` MUST 用 **hot-reload dev container**(對齊 001/002 standalone dev profile):base-web 走 `node:20-alpine` + vite dev server(`pnpm dev --host`)+ source bind mount;rust-api 走 dev build target + cargo-watch + source bind mount。built `:latest` image 僅 prod profile 用(prod profile base-web nginx serve / rust-api built binary)
- **FR-009**:prod profile front-nginx MUST 對 `0.0.0.0:80,443`;port 80 server block MUST `return 301 https://$host$request_uri`(強制 redirect);base-web / rust-api prod **不**對 host expose(僅 internal,經 nginx proxy_pass)
- **FR-010**:dev profile MUST **不**強制 80→443 redirect(雙開 HTTP `21080` + HTTPS `21443`,debug 友善)

**底層 service:postgres + redis**

- **FR-011**:`postgres` service MUST 用 image `postgres:17-alpine`,password 走官方 `POSTGRES_PASSWORD_FILE` env 指向 secret mount(對齊 001 `_FILE` pattern);data MUST 掛 named volume `rev2_postgres_data` 持久化(`docker compose down` 保留、`down -v` 才清)
- **FR-012**:`redis-stack` service MUST 用 image `redis/redis-stack-server:latest`,password 經 command wrap `--requirepass "$(cat <secret>)"` 注入(redis-stack-server 無原生 `_FILE`);data MUST 掛 named volume `rev2_redis_data` 持久化
- **FR-013**:`rust-api` service MUST `depends_on (service_healthy) postgres + redis-stack`(預留:現 `/health` stateless,Phase 2 連 db 時 zero 改動);本 feature **不** wire rust-api → db 實際連線

**healthcheck**

- **FR-014**:每個 service MUST 有 healthcheck:front-nginx `curl -f localhost/health`、base-web 既有 nginx HEALTHCHECK(`/health.html`,002)、rust-api `curl -f localhost:21081/health`(001)、postgres `pg_isready`、redis-stack `redis-cli -a <pw> ping`

**TLS cert 三來源**

- **FR-015**:dev profile front-nginx MUST bind mount `deploy/dev-certs/{fullchain,privkey}.pem :ro`(003 生)到 `/etc/nginx/certs/`
- **FR-016**:prod profile front-nginx MUST 從 named volume `front_nginx_certs` 掛 `/etc/nginx/certs/`(cert 預先 seed,本 feature **不**自動化 seed)
- **FR-017**:nginx conf cert 路徑 MUST 統一 `/etc/nginx/certs/{fullchain,privkey}.pem`,dev/prod 來源差異吸收在 compose override mount 層(conf 不區分來源)

**acme skeleton**

- **FR-018**:系統 MUST 提供 `deploy/Dockerfile.acme.txt`(`FROM neilpang/acme.sh:3.1.3` 官方 pinned)+ `deploy/acme-entrypoint.sh`(skeleton:印提示 + idle,**不** crash loop,讓 container running 供 exec sanity)
- **FR-019**:`acme` service MUST mount named volume `front_nginx_certs`(與 front-nginx 共享);本 feature **只**驗 `docker compose --profile prod exec acme acme.sh --version` sanity,**不**設 DNS provider creds、**不**跑真實 `acme.sh --issue`

**base-web wire + secret**

- **FR-020**:base-web prod image build MUST 帶 build-arg `VITE_SERVICE_BASE_URL=/api`(002 已驗 build-arg override 機制),讓 axios 打 `/api/*` → nginx strip → rust-api(同 origin、無 CORS)
- **FR-021**:系統 MUST 新增 `deploy/secrets/{postgres_password,redis_password}.txt`(gitignored)+ `.example`(範本,git-tracked),對齊 001 secret 範本紀律

**standalone 退場 + Anti-patterns**

- **FR-022**:`docker-compose.base-web.yml` 與 `docker-compose.rust-api.yml` MUST 保留,頂部各加 `DEPRECATED` header 註解(指向 master compose 主流命令);**不**動兩檔 service 定義本體
- **FR-023**:系統 MUST 不動 `base-web/` `rust-api/` worktree 內部 source、001/002 `deploy/Dockerfile.{base-web,rust-api}.txt`、001 已落 jwt/refresh secret 範本
- **FR-024**:系統 MUST 不做 db schema / migration(Phase 2)、Casbin policy(Phase 3)、obs stack(Phase 6)、rust-api → db 實際連線、真實 acme cert acquisition

### Key Entities

- **`docker-compose.yml`**(base):5 service 共通定義;image / build / depends_on / healthcheck / volume / network
- **`docker-compose.dev.yml`**(dev override):host port loopback binding + base-web/rust-api hot-reload dev container(node:20 vite / cargo-watch,source bind mount)+ dev-certs bind mount + dev.conf mount
- **`docker-compose.prod.yml`**(prod override):0.0.0.0 binding + 80→443 redirect + named volume cert + acme service(profile gate)+ prod.conf mount
- **`deploy/nginx/`**:nginx.conf(main)+ conf.d/{dev,prod}.conf + conf.d/_locations.inc(路由分流規則)
- **`deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh`**:acme.sh skeleton(profile=prod,sanity only)
- **`front_nginx_certs`**(named volume):prod cert 共享給 front-nginx + acme
- **`rev2_postgres_data` / `rev2_redis_data`**(named volume):postgres / redis data 持久化(`down` 保留、`down -v` 才清)
- **`deploy/secrets/{postgres,redis}_password.txt`**(+ `.example`):db/redis password,gitignored secret + git-tracked 範本
- **standalone compose**(`docker-compose.{base-web,rust-api}.yml`):保留 + DEPRECATED header,single-service debug 後備

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:rev2 開發者從 workspace root 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`,5 個 service 全部達 `healthy`、`--wait` 成功返回(首次含 image build / pull;有 cache 後 < 60 秒)
- **SC-002**:dev stack running 後 `curl http://127.0.0.1:21080/` 回 HTTP 200 + base-web SPA index.html
- **SC-003**:dev stack running 後 `curl http://127.0.0.1:21080/api/health` 回 200 `ok`(rust-api 收到 strip 後的 `/health`,證明 `/api` 前綴正確 strip)
- **SC-004**:dev stack running 後 `curl -k https://127.0.0.1:21443/health` 回 200,且 `openssl s_client -connect 127.0.0.1:21443 -servername localhost` cert SAN 含 `DNS:localhost` + `IP Address:127.0.0.1`(003 cert)
- **SC-005**:prod baseline(seed cert 後)running,`curl -I http://127.0.0.1:21080/`(或 :80)回 `301` redirect 到 `https://`
- **SC-006**:prod + acme(`--profile prod`)running,`docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod exec acme acme.sh --version` 回 acme.sh 版本字串(skeleton sanity)
- **SC-007**:任何時刻 `head -5 docker-compose.base-web.yml` 與 `head -5 docker-compose.rust-api.yml` 皆含 `DEPRECATED` 字串(退場紀律)
- **SC-008**:本 feature 完成後 `git -C base-web status --short` 與 `git -C rust-api status --short` 皆為空(worktree 內部完全不動);`git diff --name-only HEAD` 不含 001/002 `deploy/Dockerfile.*.txt`

---

## Assumptions

- **Host 環境**:rev2 開發者本機已裝 docker 23+ (compose v2) + bash;WSL2 用 `networkingMode=mirrored`(Win11 22H2+ 預設)使 `127.0.0.1` binding 從 Windows host 可達
- **前置 feature 已落**:001 rust-api image(`rev2-admin-rust-api:latest`)+ 002 base-web image(`rev2-admin-base-web:latest`)可 build;003 `deploy/generate-dev-cert.sh` 已跑、`deploy/dev-certs/{fullchain,privkey}.pem` 存在(dev profile 前置)
- **prod 前置**:prod baseline 啟動前須手動 seed cert 進 named volume `front_nginx_certs`(§8.2.1 範例);prod secret(`postgres_password.txt` / `redis_password.txt`)須先生成
- **rust-api 現 stateless**:本 feature rust-api `/health` 不連 db;postgres + redis 起 service 本身(設 password),但 rust-api → db 連線 wire 留 Phase 2
- **base-web build-arg 機制**:002 已驗 prod build 帶 `VITE_SERVICE_BASE_URL` 走 `.env.prod.local` precedence(vite `loadEnv` 不讀 process.env)
- **CDP browser smoke defer**:curl `/api/health` 驗 nginx 路由 ≠ base-web SPA 在 browser 內經 nginx 打 rust-api 的端到端 wire;後者留 Phase 4 wire feature / CDP 巡檢(本 feature follow-up backlog 登記)
- **後續 feature 邊界**:
  - Phase 2 basic infra:rust-api DATABASE_URL / redis URL wire + db schema migration + Casbin adapter
  - Phase 6 obs:grafana / prometheus / pushgateway service 加進 master compose(network + 結構已就緒)
  - 後續 prod acme:DNS provider creds + 真實 domain + `acme.sh --issue` 流程
- **不在 scope**:db schema / migration;Casbin policy;obs stack;rust-api → db 實際連線;真實 acme cert acquisition;CI/CD pipeline;EC / Ed25519 cert(003 已拍板 RSA 2048)
