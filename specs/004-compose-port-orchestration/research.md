# Phase 0 Research: compose-port-orchestration

> 10 個 research 主題,全為 best-practice 確認 + 既有 standalone/Dockerfile ground truth grep。
> 本 feature 純 orchestration、不涉 wire endpoint / rust service trait / DTO,故 CLAUDE.md §3 的「rust trait 返回型 grep / wire 3 端對齊 grep / struct 命名 grep」紀律大多 N/A;改以「既有 compose / Dockerfile ground truth grep」為 research 依據(不靠 brainstorm 假設)。CDP smoke defer 風險已在 spec Assumptions 明示。

---

## R1 — docker-compose override merge 行為(base + dev/prod)

**Decision**:base 層(`docker-compose.yml`)**不**放 host `ports` 與 dev/prod 專屬 `volumes` host port binding;由 `docker-compose.{dev,prod}.yml` override 各自放。

**Rationale**:docker-compose 多檔 merge 對 **list 型欄位(`ports` / `volumes` / `expose`)是 append 不是覆寫**(scalar 如 `image` / `command` 才覆寫,map 如 `environment` 才 merge)。若 base 放 `ports: ["21080:80"]`、dev override 放 `ports: ["127.0.0.1:21080:21080"]`,結果是兩者疊加 → port 衝突。故 base 只放共通定義(image/build/depends_on/healthcheck/network),host port binding 全落 override。

**Alternatives considered**:
- base 放共通 port + override 改 — 否決(list append 導致疊加,無法「覆寫」)
- 用 `!reset` / `!override` tag(compose 2.24+)— 否決(增加複雜度 + 版本依賴;base 不放更簡單)

**Ground truth**:既有 standalone(001/002)各自完整定義 ports,無 override 經驗;本 feature 首次用 base+override,故此 gotcha 須 plan 明示。

---

## R2 — nginx reverse proxy strip `/api` 前綴

**Decision**:`location /api/ { proxy_pass http://rust-api:21081/; }` — proxy_pass URL **末尾帶 `/`** 即 strip 掉 location 的 `/api/` 前綴。

**Rationale**:nginx proxy_pass 規則 — 當 proxy_pass 含 URI(末尾 `/` 或路徑),nginx 用「location match 部分替換為 proxy_pass URI」:`/api/auth/login` 經 `location /api/` match `/api/`、替換為 `/` → rust-api 收到 `/auth/login`(對齊 mock ground truth,無 `/api` 前綴)。若 proxy_pass **不**帶末尾 `/`(`proxy_pass http://rust-api:21081;`),則前綴不 strip、rust-api 收 `/api/auth/login`(404)。

**Alternatives considered**:
- `rewrite ^/api/(.*) /$1 break;` + proxy_pass 不帶 URI — 等效但較囉嗦;末尾 `/` 是慣用簡潔寫法
- rust-api 內 route 加 `/api` 前綴 — 否決(違反 mock ground truth + §11.11 拍板「path 不帶 /api、由 nginx 處理前綴」)

**Edge note**:spec Edge Cases 已列「proxy_pass 末尾 `/` 漏掉 → 404」風險。

---

## R3 — nginx conf dev/prod 分檔 + 共用 location

**Decision**:`deploy/nginx/conf.d/{dev,prod}.conf` 分檔,共用 `location` 區塊抽 `_locations.inc`(用 nginx `include conf.d/_locations.inc;`);compose override 用 bind mount 把對應 conf mount 到 `/etc/nginx/conf.d/default.conf`。

**Rationale**:dev(雙開 21080+21443、不 redirect)與 prod(80→443 redirect)的 server block 差異大,分檔比單檔內 `if`/env 判斷清晰(nginx `if` is evil 慣例);location 路由規則兩者相同,抽 `_locations.inc` 避免重複。`nginx.conf` main 只 `include /etc/nginx/conf.d/*.conf`,mount `default.conf` 即生效。

**Alternatives considered**:
- 單 conf + `envsubst` 環境變數模板 — 否決(nginx alpine 需 entrypoint envsubst、增加複雜度)
- dev/prod 各完整寫一份 location(不抽 inc)— 可接受 fallback;plan 階段若 include 路徑解析有問題則改各寫一份(research 確認 `include` 相對 `/etc/nginx/` 解析,mount `_locations.inc` 到 `/etc/nginx/conf.d/` 即可)

**Ground truth**:base-web(002)Dockerfile 內 nginx `listen 21079` 自帶 SPA 處理(見 R10);front-nginx 只需 proxy_pass、不重複 SPA 邏輯。

---

## R4 — redis-stack-server password 注入(無原生 `_FILE`)

**Decision**:`redis/redis-stack-server:latest` 用 command/entrypoint wrap `--requirepass "$(cat /run/secrets/redis_password)"` 注入 password;secret 經 compose `secrets:` mount 到 `/run/secrets/redis_password`。

**Rationale**:postgres 官方 image 支援 `POSTGRES_PASSWORD_FILE`(原生 `_FILE`),但 redis-stack-server **無** `_FILE` 慣例。redis-stack-server 接受 `REDIS_ARGS` 環境變數或 command 追加 redis-server flag;用 `REDIS_ARGS="--requirepass $(cat ...)"` 或 entrypoint command wrap 注入。對齊 001 `_FILE` 哲學(secret 走檔案 mount、不寫 compose env 明文)。

**Alternatives considered**:
- redis env `REDIS_ARGS` 直接寫明文 password — 否決(secret leak in `docker inspect`)
- 自訂 redis.conf bind mount + requirepass — 可行但多一個 conf 檔;command wrap 更輕
- 不設 password(dev only)— 否決(§8.2.1 範例已用 `redis-cli -a` 帶 password,須設)

**Note**:redis-stack-server vs redis-stack — server 版只含 redis + modules(無 RedisInsight web UI port 8001);本 feature 用 server 版(FR-012),無 8001 port。

---

## R5 — postgres `_FILE` secret + named volume

**Decision**:`postgres:17-alpine` 用官方 `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password` + `POSTGRES_USER` env(預設 user)+ data 掛 named volume `rev2_postgres_data:/var/lib/postgresql/data`。

**Rationale**:postgres 官方 image 原生支援 `*_FILE` 變數(`POSTGRES_PASSWORD_FILE` / `POSTGRES_USER_FILE` / `POSTGRES_DB_FILE`),對齊 001 `_FILE` pattern。data 持久化掛 named volume(clarify Q2 拍板),`postgres:17-alpine` data dir = `/var/lib/postgresql/data`。

**Alternatives considered**:
- env `POSTGRES_PASSWORD` 明文 — 否決(secret leak)
- bind mount host dir for data — 否決(WSL2 9P 慢 + 權限問題;named volume 較佳)

**Ground truth**:001 secret pattern = `deploy/secrets/<name>.txt`(gitignored)+ `.txt.example`(範本);本 feature 沿用,新增 `postgres_password.txt(.example)`。

---

## R6 — depends_on service_healthy + healthcheck

**Decision**:`depends_on` 用 long-form `condition: service_healthy`;每 service 定義 healthcheck。front-nginx depends_on base-web+rust-api;rust-api depends_on postgres+redis-stack(預留)。

**Rationale**:compose `depends_on: { X: { condition: service_healthy } }` 讓 dependent service 等 X healthcheck pass 才啟動,避免 race(front-nginx 在 base-web 未 ready 時 proxy 失敗)。healthcheck 命令:
- front-nginx:`curl -f http://localhost/health`(需 alpine 裝 curl 或用 `wget`)— alpine nginx 預設無 curl,用 `wget -qO- http://localhost/health` 或 nginx 自身 stub
- base-web:002 Dockerfile 已內建 HEALTHCHECK(`wget /health.html grep ok`)— compose 不需重複定義(image 自帶)
- rust-api:001 Dockerfile runtime 已內建 HEALTHCHECK(`curl /health`);dev stage(cargo-watch)無 HEALTHCHECK → compose dev override 補
- postgres:`pg_isready -U <user>`
- redis-stack:`redis-cli -a "$(cat /run/secrets/redis_password)" ping`(或 `redis-cli --no-auth-warning`)

**Alternatives considered**:
- 短 form `depends_on: [X]`(只等啟動、不等 healthy)— 否決(race condition)
- 不用 depends_on、靠 nginx retry — 否決(啟動體驗差)

**Ground truth**:001 runtime HEALTHCHECK `curl -fsS http://127.0.0.1:21081/health`;002 HEALTHCHECK `wget -qO- http://127.0.0.1:21079/health.html | grep -q ok`。front-nginx alpine 用 wget(busybox 自帶)。

---

## R7 — acme.sh skeleton entrypoint idle

**Decision**:`deploy/Dockerfile.acme.txt` = `FROM neilpang/acme.sh:3.1.3`;`deploy/acme-entrypoint.sh` skeleton:印「acme skeleton ready,設 DNS provider creds + domain 後啟用 `acme.sh --issue`」+ `exec tail -f /dev/null`(或 `sleep infinity`)idle,**不** crash loop,讓 container running 供 `docker compose exec acme acme.sh --version` sanity。

**Rationale**:`neilpang/acme.sh` 官方 image 預設 ENTRYPOINT 是 `acme.sh` daemon mode;本 feature 只要 skeleton(不真實 issue),override entrypoint 為 idle script。`tail -f /dev/null` 是 container keep-alive 慣用法(比 `sleep infinity` 更 portable)。`acme.sh --version` 可在 idle container 內 exec(binary 已裝)。

**Alternatives considered**:
- 用官方預設 daemon entrypoint — 否決(daemon 會嘗試 cron renew、無 cert 配置會 log error)
- 自 build alpine + curl install acme.sh — 否決(user 拍板用官方 image)

**Ground truth**:`neilpang/acme.sh:3.1.3` 已 verify 為 Docker Hub stable semver tag(2026-05-16 push)。

---

## R8 — named volume 命名策略 + COMPOSE_PROJECT_NAME + §8.2.1 seed 對齊

**Decision**:master compose 設 `COMPOSE_PROJECT_NAME=rev2-admin`(對齊 §8.2 表「project name = rev2-admin」);named volume 用**顯式 `name:`** 對齊既有 standalone `rev2_` 慣例(`rev2_postgres_data` / `rev2_redis_data`);`front_nginx_certs` 顯式 `name: rev2_front_nginx_certs`。

**Rationale**:既有 standalone(001/002)用顯式 `name: rev2_xxx`(bypass project prefix,確保跨 standalone/master 共用同一 volume 物件)。master compose 沿用此慣例。但 §8.2.1 seed 範例寫 `rev2-admin_front_nginx_certs`(project-prefix 形式)— **不一致**。

**矛盾解法**(plan 階段拍板):統一用顯式 `name: rev2_front_nginx_certs`(對齊 standalone rev2_ 慣例);**§8.2.1 seed 命令的 `rev2-admin_front_nginx_certs` 須在實作時同步修正為 `rev2_front_nginx_certs`**(登記為 CLAUDE.md §8.2.1 微修 follow-up,屬本 feature「可能微修 §8.2.1」scope FR 範圍)。

**Alternatives considered**:
- 不顯式 name、靠 COMPOSE_PROJECT_NAME prefix(`rev2-admin_<key>`)— 對齊 §8.2.1 但與 standalone `rev2_` 顯式 name 不一致(同一 db data volume 兩種名稱會變兩個 volume)
- COMPOSE_PROJECT_NAME 不設 — 否決(§8.2 明示設 rev2-admin;影響 container name 一致性)

**Ground truth**:`docker-compose.rust-api.yml` volumes `rust_api_cargo_cache: { name: rev2_rust_api_cargo_cache }`;`docker-compose.base-web.yml` `bw_node_modules: { name: rev2_bw_node_modules }` — 顯式 rev2_ 慣例確立。

---

## R9 — WSL2 mirrored networking 127.0.0.1 binding

**Decision**:dev/prod 的 `127.0.0.1:` host port binding 需 WSL2 `networkingMode=mirrored`(Win11 22H2+ `.wslconfig` 預設)使 Windows host `curl 127.0.0.1:21080` 可達 WSL2 container。

**Rationale**:WSL2 NAT mode 下 `127.0.0.1` 不跨 Windows↔WSL2 邊界;mirrored mode 共享 loopback。§8.2 已註明此前置。acceptance 跑前確認 `wsl --version` + `.wslconfig`。

**Alternatives considered**:
- 用 WSL IP(`wsl hostname -I`)而非 127.0.0.1 — fallback for NAT mode;但 §8.2 規劃 127.0.0.1 為主
- 0.0.0.0 binding for dev — 否決(dev 限 loopback 安全;§8.2 dev 用 127.0.0.1)

**Ground truth**:既有 standalone 001 已用 `127.0.0.1:21081:21081`;002 用 `21079:21079`(無 loopback prefix,本 feature dev override 統一加 127.0.0.1)。

---

## R10 — base-web prod 自帶 nginx SPA fallback(front-nginx 只 proxy)

**Decision**:front-nginx `location / { proxy_pass http://base-web:21079; }` 只做 reverse proxy;SPA client-side routing fallback(`try_files ... /index.html`)由 base-web prod image 內層 nginx 處理(002 Dockerfile runtime stage)。

**Rationale**:002 base-web prod = `nginx:alpine` serve built SPA,內層 nginx 已配 SPA fallback + `listen 21079` + `/health.html`。front-nginx 不需重複 SPA 邏輯,單純 proxy_pass 到 base-web:21079 即可(base-web 內層處理 vue-router history mode fallback)。dev profile base-web 是 vite dev server(`pnpm dev --host`),vite 自帶 SPA fallback。

**Alternatives considered**:
- front-nginx 直接 serve base-web static(不經 base-web container)— 否決(需把 build artifact 搬進 front-nginx,破壞 002 image 自足性 + dev hot-reload 無法做)
- front-nginx 加 try_files — 否決(base-web 已處理,重複)

**Ground truth**:`deploy/Dockerfile.base-web.txt` runtime stage `FROM nginx:alpine` + `listen 21079` + HEALTHCHECK `/health.html`;base-web 內層 nginx conf 自帶 SPA fallback(002 落地)。

---

## 總結

10 主題全 confirmed,無 NEEDS CLARIFICATION 遺留。關鍵 implementation 注意點:
1. **base 層不放 host port**(R1 list append gotcha)
2. **proxy_pass 末尾 `/` 必要**(R2 strip 前綴)
3. **redis-stack 無 `_FILE`、用 REDIS_ARGS/command wrap**(R4)
4. **§8.2.1 seed 命令 named volume 名稱須同步修正**(R8 `rev2-admin_front_nginx_certs` → `rev2_front_nginx_certs`)
5. **front-nginx alpine 用 wget 不是 curl 做 healthcheck**(R6)
