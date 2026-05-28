# 004 · compose-port-orchestration

> rev2 第四個 spec-kit feature 的 Phase 0 brainstorm spec-design。
> 對應 DESIGN §10 Phase 1 #4(容器 port 與編排 feature)+ [CLAUDE.md §8.2](../../CLAUDE.md) port 配置與 3 啟動模式規劃。
> Phase 1 部署基建的第四片拼圖 — 把 001(rust-api)/ 002(base-web)/ 003(dev TLS cert)三片組裝成單一 master compose stack,front-nginx 反向代理對外。

---

## 1. Intro

**問題**:001 / 002 各落了 standalone compose(`docker-compose.rust-api.yml` / `docker-compose.base-web.yml`),003 落了 dev TLS cert 生成(`deploy/generate-dev-cert.sh` + `deploy/dev-certs/`),但**尚無 master compose 把它們組成一套對外 stack** ⏳。本 feature 補這片:`docker-compose.yml`(base)+ `docker-compose.{dev,prod}.yml`(override)+ front-nginx 反向代理 service,wire 003 的 cert 進 nginx TLS server block,並連帶落 postgres + redis-stack 底層 service(Phase 2 dep 前置)。

**scope 邊界**(brainstorm Q1 拍板):**5 個 service** — front-nginx + base-web + rust-api + postgres + redis-stack。**不**含 obs stack(grafana / prometheus / pushgateway,留 Phase 6);**不**含 db schema / migration(留 Phase 2);**不**含 Casbin policy(留 Phase 3);**不**含 rust-api → db 實際連線(留 Phase 2,本 feature rust-api 仍 stateless `/health`)。

**design 主軸**:三檔分層(base + dev/prod override)+ `--profile prod` 控 acme service + front-nginx `/` → base-web、`/api/*` → rust-api(strip 前綴)+ TLS cert 三來源(dev bind mount / prod baseline named volume seed / prod+acme acme.sh 寫 volume)。

---

## 2. brainstorm 拍板項(收斂順序)

| # | 維度 | 拍板 | 理由 |
|---|---|---|---|
| 1 | scope 邊界 | **B. 5 service**(front-nginx + base-web + rust-api + postgres + redis-stack;不含 obs) | Phase 2 許多 feature(JWT/migration/Casbin)需 db/redis,本 feature 同步落 service 可避免 Phase 2 又動 master compose;obs 留 Phase 6 deliverable(dashboard config 是 obs feature 本體)|
| 2 | standalone compose 退場 | **C. 保留 + DEPRECATED header** | user 偏好保留作 single-service debug 後備(zero friction,原命令仍可跑);只加頂部 DEPRECATED 註解提醒主流走 master compose |
| 3 | nginx 路由分流 | **A. `/` → base-web,`/api/*` → rust-api(strip /api 前綴)** | 同 origin、無 CORS;strip 前綴對齊 mock ground truth(MOCK-AUDIT §4 path 樣 `/auth/login` 不帶 /api);base-web build `VITE_SERVICE_BASE_URL=/api` |
| 4 | acme.sh 範圍 | **A. 落 skeleton(service + Dockerfile + entrypoint,不啟動真 cert)** | Phase 1 完整收尾、prod+acme 啟動模式不留 placeholder;真實 cert acquisition 需公網+真 domain+DNS creds、留 user 後續配 |
| 5 | postgres / redis 規格 | **postgres:17-alpine + redis/redis-stack-server:latest** | user 拍板:postgres 跟最新(17,2029 EOL);redis-stack 對齊 §8.2 字眼(含 ReJSON/RediSearch modules 預留)|

**追加拍板**(present design 階段):
- **6. front-nginx image**:`nginx:1.31.0-alpine`(user 指定;已 verify Docker Hub active stable tag,2026-05-19 push,26 MB,multi-arch,非 pre-release)
- **7. acme image**:`neilpang/acme.sh:3.1.3`(官方 image;pin 最新 stable semver 而非浮動 `latest`,對齊 CLAUDE.md §6 reproducibility 紀律)
- **8. compose 結構**:三檔分層(`docker-compose.yml` base + `docker-compose.dev.yml` + `docker-compose.prod.yml` override)+ `--profile prod` 控 acme(對齊 §8.2.1 啟動命令字面;非單檔 multi-profile)
- **9. nginx conf 結構**:`deploy/nginx/conf.d/{dev,prod}.conf` 分檔(共用 `_locations.inc`);dev/prod 由 compose override mount 切換(避免單 conf 內 if 判斷)
- **10. base-web wire**:prod build 帶 build-arg `VITE_SERVICE_BASE_URL=/api`(002 已驗 build-arg override 機制)
- **11. rust-api depends_on**:`depends_on (service_healthy) postgres + redis-stack`(預留;現 `/health` stateless,Phase 2 連 db 時 zero 改動)
- **12. HTTP→HTTPS redirect**:dev **不**強制(雙開 21080 + 21443,debug 友善);prod **強制**(`return 301 https://$host$request_uri`)

---

## 3. 凍結摘要(spec/plan 階段 input)

本 feature 落地後:
- **新增**:`docker-compose.yml`(base,5 service)+ `docker-compose.dev.yml` + `docker-compose.prod.yml`(override)
- **新增**:`deploy/nginx/nginx.conf` + `deploy/nginx/conf.d/{dev,prod}.conf` + `deploy/nginx/conf.d/_locations.inc`
- **新增**:`deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh`(acme skeleton)
- **新增**:`deploy/secrets/{postgres_password,redis_password}.txt.example`(範本,git-tracked;`.txt` gitignored)
- **修改**:`docker-compose.{base-web,rust-api}.yml` 加 DEPRECATED header(只加頂部註解、不動 service 定義)
- **可能微修**:`CLAUDE.md §8.2.1` 啟動命令範例對齊實際落地(workspace-level,單獨小修)
- **不動**:`base-web/` `rust-api/` worktree 內部 source、001/002 `deploy/Dockerfile.{base-web,rust-api}.txt`、001 已落 jwt/refresh secret 範本
- **無 unit test**(全 orchestration + nginx conf + acme skeleton)— acceptance 由 7 段 C-V command 覆蓋(本檔 §6)

---

## 4. 檔案結構

```text
fork260509-rev2/
├── docker-compose.yml                  ← 本 feature 新增(base,5 service 共通定義)
├── docker-compose.dev.yml              ← 本 feature 新增(dev override)
├── docker-compose.prod.yml             ← 本 feature 新增(prod override + acme profile)
├── docker-compose.base-web.yml         ← 既有(002),本 feature 加 DEPRECATED header
├── docker-compose.rust-api.yml         ← 既有(001),本 feature 加 DEPRECATED header
└── deploy/
    ├── nginx/                          ← 本 feature 新增目錄
    │   ├── nginx.conf                  ← main conf(events / http / include conf.d/*)
    │   └── conf.d/
    │       ├── _locations.inc          ← 共用 location 區塊(/ + /api/ + /health)
    │       ├── dev.conf                ← dev:listen 21080 + 21443 ssl(self-signed), 127.0.0.1
    │       └── prod.conf               ← prod:listen 80(→443 redirect)+ 443 ssl
    ├── Dockerfile.acme.txt             ← 本 feature 新增(FROM neilpang/acme.sh:3.1.3)
    ├── acme-entrypoint.sh              ← 本 feature 新增(skeleton:印提示 + idle,不 crash loop)
    ├── secrets/
    │   ├── postgres_password.txt       ← 本 feature 新增(gitignored)
    │   ├── postgres_password.txt.example  ← 本 feature 新增(範本,git-tracked)
    │   ├── redis_password.txt          ← 本 feature 新增(gitignored)
    │   ├── redis_password.txt.example  ← 本 feature 新增(範本,git-tracked)
    │   ├── jwt_secret.txt(.example)    ← 既有(001)
    │   └── refresh_token_secret.txt(.example)  ← 既有(001)
    ├── dev-certs/                       ← 既有(003),dev profile bind mount :ro 進 front-nginx
    └── Dockerfile.{base-web,rust-api}.txt  ← 既有(001/002),不動
```

---

## 5. 詳細設計

### 5.1 Service 拓樸與 port

```text
┌──────────────────────────────────────────────────────────────────┐
│  Host (WSL2 mirrored networking,127.0.0.1)                        │
│                                                                    │
│  21080 ──┐                                                         │
│  21443 ──┼──→ front-nginx ─── /      → base-web (internal :21079)  │
│          │                  ─── /api/* (strip) → rust-api (:21081) │
│          │                  ─── /health → return 200 (self)        │
│  21081 ──┼──→ rust-api  (dev expose;prod internal only)           │
│  21079 ──┼──→ base-web  (dev expose;prod internal only)           │
│  25432 ──┼──→ postgres-17  (loopback only)                        │
│  26379 ──┼──→ redis-stack  (loopback only)                        │
│                                                                    │
│  acme (profile=prod):無 host port,寫 cert → named volume          │
│                       `front_nginx_certs`                          │
└──────────────────────────────────────────────────────────────────┘
```

| Service | image | host port (dev) | host port (prod baseline) | profile |
|---|---|---|---|---|
| `front-nginx` | `nginx:1.31.0-alpine` | `127.0.0.1:21080,21443` | `0.0.0.0:80,443` | always |
| `base-web` | 002 build `rev2-admin-base-web:latest` | `127.0.0.1:21079` | internal only(nginx proxy_pass) | always |
| `rust-api` | 001 build `rev2-admin-rust-api:latest` | `127.0.0.1:21081` | internal only | always |
| `postgres` | `postgres:17-alpine` | `127.0.0.1:25432` | `127.0.0.1:25432` | always |
| `redis-stack` | `redis/redis-stack-server:latest` | `127.0.0.1:26379` | `127.0.0.1:26379` | always |
| `acme` | build `deploy/Dockerfile.acme.txt`(FROM `neilpang/acme.sh:3.1.3`)| none | none | `prod` only |

### 5.2 docker-compose 三檔職責

| 檔 | 職責 | 內容要點 |
|---|---|---|
| `docker-compose.yml`(base) | 5 service 共通定義 | image / build / depends_on / healthcheck / named volume / network;**不**含 host port binding、**不**含 dev/prod 專屬 mount |
| `docker-compose.dev.yml` | dev override | base-web/rust-api 直連 host port + hot-reload bind mount + front-nginx 掛 `deploy/dev-certs/{fullchain,privkey}.pem :ro` + nginx 限 `127.0.0.1` + mount `conf.d/dev.conf` → `default.conf` |
| `docker-compose.prod.yml` | prod override | front-nginx `0.0.0.0:80,443` + cert 走 named volume `front_nginx_certs` + `acme` service(`profiles: [prod]`)+ mount `conf.d/prod.conf` → `default.conf` |

啟動命令(對齊 §8.2.1):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait              # dev
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait             # prod baseline
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait  # prod + acme
```

### 5.3 nginx 反向代理

`deploy/nginx/conf.d/_locations.inc`(dev/prod 共用):
```nginx
location / {
    proxy_pass http://base-web:21079;       # SPA + static asset
}
location /api/ {
    proxy_pass http://rust-api:21081/;       # 末尾 / → strip /api 前綴
}
location = /health {
    add_header Content-Type text/plain;
    return 200 "ok\n";                       # front-nginx self healthcheck(§8.2.1 curl 用)
}
```

- `dev.conf`:`listen 21080;` + `listen 21443 ssl;`(雙開,**不** redirect);`ssl_certificate /etc/nginx/certs/{fullchain,privkey}.pem`(dev-certs bind mount)
- `prod.conf`:port 80 server block `return 301 https://$host$request_uri;`(強制 redirect)+ port 443 ssl server block(named volume cert)
- 兩 conf 都 `include conf.d/_locations.inc;` 在 443/HTTP server block 內

base-web → rust-api wire:prod build 帶 `VITE_SERVICE_BASE_URL=/api`,axios 打 `/api/auth/login` → nginx strip → rust-api `/auth/login`(同 origin、無 CORS、對齊 mock ground truth)。

### 5.4 TLS cert 三來源

| 模式 | cert 來源 | nginx listen |
|---|---|---|
| dev | bind mount `deploy/dev-certs/{fullchain,privkey}.pem :ro`(003 生)| `127.0.0.1:21080` + `127.0.0.1:21443 ssl` |
| prod baseline | named volume `front_nginx_certs`(手動 seed,§8.2.1 範例 `docker run alpine cp dev-certs/*.pem /certs/`)| `0.0.0.0:80`(→443 redirect)+ `0.0.0.0:443 ssl` |
| prod + acme | 同 prod baseline + `acme` service 寫 cert 進同 named volume | 同 prod baseline |

nginx conf cert 路徑統一 `/etc/nginx/certs/{fullchain,privkey}.pem` — dev 由 bind mount、prod 由 named volume 掛同路徑,**conf 不需區分來源**(mount 差異吸收在 compose override)。

### 5.5 acme skeleton

- `deploy/Dockerfile.acme.txt`:`FROM neilpang/acme.sh:3.1.3`(官方 pinned)
- `deploy/acme-entrypoint.sh`:skeleton — 印「acme skeleton ready,設 DNS provider creds + domain 後啟用 `acme.sh --issue`」+ idle(`sleep infinity` 或 sanity loop,**不** crash loop,讓 container running 供 exec sanity)
- compose `acme` service:mount named volume `front_nginx_certs`(與 front-nginx 共享)+ `profiles: [prod]`
- 本 feature **只驗** `docker compose --profile prod exec acme acme.sh --version`(sanity)
- **不**設 DNS provider creds、**不**跑真實 `acme.sh --issue`(留 user 後續)

### 5.6 depends_on + healthcheck

```text
front-nginx  depends_on (service_healthy) → base-web + rust-api
rust-api     depends_on (service_healthy) → postgres + redis-stack   ← 預留(Phase 2 連 db)
base-web / postgres / redis-stack  無依賴
```

| Service | healthcheck |
|---|---|
| `front-nginx` | `curl -f http://localhost/health` |
| `base-web` | 002 已內建 nginx HEALTHCHECK(`/health.html`)|
| `rust-api` | `curl -f http://localhost:21081/health`(001 已有 route)|
| `postgres` | `pg_isready -U <user>` |
| `redis-stack` | `redis-cli -a "$(cat secret)" ping` |

### 5.7 secret 注入(對齊 001 `_FILE` pattern)

- `postgres`:官方 `POSTGRES_PASSWORD_FILE` env 指向 secret mount
- `redis-stack`:`--requirepass "$(cat /run/secrets/...)"` 經 command wrap(redis-stack-server 無原生 `_FILE`)
- rust-api → db 連線 secret **本 feature 不 wire**(rust-api 現 stateless,Phase 2 才連)
- 新增 `deploy/secrets/{postgres,redis}_password.txt`(gitignored)+ `.example`(範本)

---

## 6. Acceptance / verification(C-V contract)

本 feature **無 unit test**(全 orchestration + nginx conf + acme skeleton)— acceptance 由 7 段 C-V command 覆蓋(對齊 CLAUDE.md §3 紀律):

| C-V 段 | 驗收 |
|---|---|
| §1 dev profile 完整啟動 | `curl 21080/health`(nginx self 200)+ `curl -k 21443/health`(HTTPS 200)+ `curl 21080/`(base-web SPA 200)+ `curl 21080/api/health`(經 strip → rust-api 200)+ `pg_isready 25432` + `redis-cli -p 26379 -a ... ping` |
| §2 nginx 路由分流 | `/api/health` strip 前綴正確(rust-api 收到 `/health`);`/` → base-web SPA |
| §3 TLS handshake | `openssl s_client -connect 127.0.0.1:21443 -servername localhost` cert SAN = localhost+127.0.0.1(003 cert)|
| §4 prod baseline | seed cert 後 `curl -I 21080/`(或 :80)回 301 → https;443 ssl handshake OK |
| §5 prod + acme sanity | `docker compose -f ... --profile prod exec acme acme.sh --version` 回版本 |
| §6 standalone DEPRECATED | `head docker-compose.{base-web,rust-api}.yml` 含 DEPRECATED header |
| §7 Constitution self-check | `git -C base-web status` + `git -C rust-api status` 空;`git diff --name-only` 不含 001/002 Dockerfile/secret 範本 |

> **CDP browser smoke defer 風險**(對齊 CLAUDE.md §3 Phase 0 紀律):curl `/api/health` ≠ base-web 在 browser 內實際打 rust-api。本 feature acceptance 用 curl 直送驗 nginx 路由;**base-web SPA 在 browser 內經 nginx 打 rust-api 的端到端 wire 留 Phase 4 wire feature / CDP 巡檢**。spec 內須明示此邊界 + follow-up backlog 登記。

---

## 7. 與既有 + 未來 feature 介面對齊

| 對象 | 本 feature 交什麼 | 留給對方 |
|---|---|---|
| **001 rust-api** | 把 `rev2-admin-rust-api:latest` 收進 master compose,internal :21081 | rust-api → db 實際連線(Phase 2) |
| **002 base-web** | 把 `rev2-admin-base-web:latest` 收進 master compose,prod build `VITE_SERVICE_BASE_URL=/api` | base-web inline wire(Phase 4 MODAL-WIRING) |
| **003 dev TLS cert** | dev profile bind mount `deploy/dev-certs/*.pem` 進 front-nginx | — |
| **Phase 2 basic infra** | postgres + redis-stack service running(password 已設)| db schema / migration / Casbin adapter / rust-api DATABASE_URL wire |
| **Phase 6 obs** | network + compose 結構就緒 | grafana / prometheus / pushgateway service + dashboard config |
| **後續 prod acme** | acme service skeleton(`--profile prod`)+ named volume 共享 | DNS provider creds + 真實 domain + `acme.sh --issue` 流程 |

---

## 8. Constitution Check 預檢(對照 v1.0.0 §IV 7 項)

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?wire endpoint 不對齊? | N/A — 本 feature 純 orchestration、不涉 wire endpoint 設計 | ✅ Pass |
| 2 | 此 plan 動到 base-web inline? | 否 — build-arg `VITE_SERVICE_BASE_URL=/api` 是 compose build 時傳入,不改 base-web/ source(002 已驗機制)| ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 本 feature 不接 menu / auth | ✅ Pass |
| 4 | wire 對齊 §I.3 mock ground truth? | 對齊 — nginx `/api/*` strip 前綴正是為了讓 rust-api 收到 mock ground truth path(`/auth/login` 不帶 /api)| ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | 否 — 純新增 compose / nginx conf / acme skeleton,非 rev1 source | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項?需 Amendment? | 全凍結 — 本 feature 不改任何拍板 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 不觸 ★ 軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG 與本 feature 無關);純 workspace-level deploy/ orchestration(對齊 001/002/003 deploy 屬性)| ✅ Pass |

**結論**:7 項全 PASS、無 violations、Complexity Tracking 不需填。可進 `/speckit-specify` → Phase 0 research。

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| redis-stack-server 無原生 `_FILE` secret | command wrap `--requirepass "$(cat /run/secrets/...)"` |
| `redis/redis-stack-server:latest` 浮動版本破壞 reproducibility | 暫用 latest、若日後出問題 follow-up pin 具體 tag(對齊 003 alpine/openssl:latest 前例)|
| WSL2 mirrored networking 127.0.0.1 binding 失效 | §8.2 已註明需 `.wslconfig` `networkingMode=mirrored`(Win11 22H2+ 預設);acceptance 跑前確認 |
| base-web prod build `VITE_SERVICE_BASE_URL=/api` 需 rebuild image | 002 已驗 build-arg override;本 feature acceptance 重 build base-web prod image |
| acme skeleton entrypoint crash loop | entrypoint 印提示後 `sleep infinity`(或 sanity loop),不退出 → container 保持 running 供 `exec acme.sh --version` sanity |
| prod baseline 啟動前未 seed cert → nginx 443 起不來 | §8.2.1 已有 seed 範例;acceptance §4 先跑 seed 再 prod up;spec 內明示 seed 為 prod 前置 |
| postgres 17 偏新、社群生態未追上 | user 拍板接受;Phase 2 動 schema 時若遇 sea-orm 相容問題再評估降版 |

---

## 10. Open Questions & 後續 contract

### 10.1 留給 `/speckit-specify` 階段釐清

- spec FR 列表(User Story 切分:P1 = dev profile 完整 stack 啟動 / P2 = nginx 路由分流 + TLS / P3 = prod baseline + acme skeleton + standalone DEPRECATED)— /speckit-specify 定
- 是否需 `/speckit-clarify`?— 本 feature 12 拍板已收斂,critical ambiguity 預估無;dry-run 看
- `_locations.inc` 是否真用 nginx `include` 抽出,還是 dev/prod conf 各自寫一份 location(避免 include 路徑解析複雜)— plan 階段 research 確認

### 10.2 留給後續 feature 的明確 contract

- **Phase 2 basic infra**:rust-api DATABASE_URL / redis URL wire(本 feature 只起 db/redis service,不 wire rust-api 連線)+ db schema migration + Casbin adapter
- **Phase 6 obs**:grafana / prometheus / pushgateway service 加進 master compose(network + 結構已就緒)+ dashboard provisioning
- **後續 prod acme**:DNS provider creds + 真實 domain + `acme.sh --issue --dns ...` 流程(本 feature 只落 skeleton + sanity)

### 10.3 風險與緩解

見 §9。

---

## 11. 交棒給 `/speckit-specify`(階段 1)

本檔(spec-design)完成 + user 審核後 **手動執行** `/speckit-specify`(CLAUDE.md §3 紀律:不可在 brainstorm 內自動觸發,會跳過 `speckit.git.feature` pre-hook、不會自動建 `004-compose-port-orchestration` feature branch)。

`/speckit-specify` 階段會:
1. `before_specify` pre-hook(`speckit.git.feature`)從當前 `rev2-admin-root` 自動建 `004-compose-port-orchestration` feature branch
2. 從本檔 input 產出 `specs/004-compose-port-orchestration/spec.md`(formal spec)
3. 後續 `/speckit-clarify`(optional)→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`(階段 2 TDD 實作)

---

**生效**:本檔成立後即為 `004-compose-port-orchestration` feature 的 Phase 0 brainstorm 權威;後續 spec / plan / tasks / implementation 任何決策若偏離本檔,需在對應 spec doc 明示理由 + 更新本檔。
