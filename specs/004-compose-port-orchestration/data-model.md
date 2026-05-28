# Phase 1 Data Model: compose-port-orchestration

> 本 feature 無傳統 DB entity(那是 Phase 2);此處 model 的是 **orchestration entity**(compose service / volume / secret / nginx 配置)及其關係。

---

## Entity 1: master compose 三檔

| 檔 | 角色 | 含 |
|---|---|---|
| `docker-compose.yml`(base) | 5 service 共通定義 | image(prod 預設)/ build / depends_on / healthcheck / network `rev2_net`;**無** host `ports`、**無** dev/prod 專屬 volume/mount(R1 list append gotcha)|
| `docker-compose.dev.yml`(dev override) | dev 專屬 | base-web/rust-api 換 hot-reload(node:20 vite / cargo-watch dev target)+ source bind mount + `127.0.0.1:` host port(21080/21443/21079/21081/25432/26379)+ front-nginx dev-certs bind mount + dev.conf mount |
| `docker-compose.prod.yml`(prod override) | prod 專屬 | front-nginx `0.0.0.0:80,443` + named volume cert + prod.conf mount + acme service(`profiles: [prod]`)+ base-web/rust-api built `:latest` image(internal only)|

**Override merge 規則**(R1):
- scalar(`image` / `command`)→ override 覆寫
- map(`environment`)→ merge
- list(`ports` / `volumes`)→ **append**(故 base 不放 host port)

---

## Entity 2: 5 service

| service | base image/build | dev override | prod override | profile |
|---|---|---|---|---|
| `front-nginx` | `nginx:1.31.0-alpine` | `127.0.0.1:21080,21443` + dev-certs `:ro` + dev.conf | `0.0.0.0:80,443` + named volume cert + prod.conf | always |
| `base-web` | **僅共通**(healthcheck/depends/network;image/build/command 留 override)| image `node:20.19-alpine` + source bind mount + `pnpm dev --host` + `127.0.0.1:21079` | build nginx + image `:latest` + `build.args VITE_SERVICE_BASE_URL=/api`(internal only)| always |
| `rust-api` | build target `runtime` + image `:latest`(共通)| 覆寫 `build.target=dev`(`:dev`)+ source bind mount + cargo-watch + `127.0.0.1:21081` | built `:latest`(internal only)| always |

> **base-web vs rust-api base 層處理差異**(H1):rust-api dev/prod 同 Dockerfile 不同 target,override 覆寫 `build.target` 即可、故 base 放 build;base-web dev = `node:20` official(不 build)、prod = nginx build,異質無法靠 target 覆寫,故 **base 不放 base-web image/build/command**(否則 base build + dev override image=node:20 → docker 誤 build 並 tag 成 node:20)。
| `postgres` | `postgres:17-alpine` | `127.0.0.1:25432` | `127.0.0.1:25432` | always |
| `redis-stack` | `redis/redis-stack-server:latest` | `127.0.0.1:26379` | `127.0.0.1:26379` | always |
| `acme` | build `deploy/Dockerfile.acme.txt`(FROM `neilpang/acme.sh:3.1.3`)| — | named volume cert mount + idle | `prod` only |

**dev hot-reload(clarify Q1)**:base-web dev = `node:20.19-alpine` + `./base-web:/app` bind mount + `bw_node_modules` / `bw_pnpm_store` named volume mask + `pnpm dev --host 0.0.0.0 --port 21079`(完全繼承 002 standalone dev service 定義);rust-api dev = build target `dev` + `./rust-api:/app` + `rust_api_cargo_cache` / `rust_api_target` mask + cargo-watch(繼承 001 standalone dev)。

---

## Entity 3: 依賴鏈 + healthcheck

```text
front-nginx ──depends_on(service_healthy)──→ base-web + rust-api
rust-api    ──depends_on(service_healthy)──→ postgres + redis-stack  (預留,Phase 2 連 db)
base-web / postgres / redis-stack  無依賴(底層)
```

| service | healthcheck 命令 |
|---|---|
| `front-nginx` | `wget -qO- http://localhost/health \| grep -q ok`(alpine busybox wget,無 curl)|
| `base-web` | image 自帶(002 HEALTHCHECK `wget /health.html grep ok`);dev(vite)compose 補 `wget /` |
| `rust-api` | image runtime 自帶(001 `curl /health`);dev(cargo-watch)compose 補 `curl -fsS localhost:21081/health` |
| `postgres` | `pg_isready -U <user>` |
| `redis-stack` | `redis-cli -a "$(cat /run/secrets/redis_password)" --no-auth-warning ping` |

---

## Entity 4: nginx 配置(`deploy/nginx/`)

| 檔 | 內容 |
|---|---|
| `nginx.conf` | main:`events {}` + `http { include /etc/nginx/conf.d/*.conf; }` + 基本 gzip/log |
| `conf.d/_locations.inc` | `location /`(proxy base-web:21079)+ `location /api/`(proxy rust-api:21081/ strip)+ `location = /health`(return 200 ok)|
| `conf.d/dev.conf` | `server { listen 21080; include conf.d/_locations.inc; }` + `server { listen 21443 ssl; ssl_certificate /etc/nginx/certs/fullchain.pem; ... include _locations.inc; }`(雙開、不 redirect)|
| `conf.d/prod.conf` | `server { listen 80; return 301 https://$host$request_uri; }` + `server { listen 443 ssl; ssl_certificate ...; include _locations.inc; }`(80→443 強制)|

**cert 路徑統一** `/etc/nginx/certs/{fullchain,privkey}.pem`(dev bind mount / prod named volume,conf 不區分來源)。

---

## Entity 5: acme skeleton

| 檔 | 內容 |
|---|---|
| `deploy/Dockerfile.acme.txt` | `FROM neilpang/acme.sh:3.1.3` + `COPY acme-entrypoint.sh` + `ENTRYPOINT ["/acme-entrypoint.sh"]` |
| `deploy/acme-entrypoint.sh` | `#!/usr/bin/env sh` + 印 skeleton 提示(設 DNS creds 後啟用 `acme.sh --issue`)+ `exec tail -f /dev/null`(idle,不 crash)|

acme service mount named volume cert(與 front-nginx 共享 `/acme.sh` 或 cert out dir);`profiles: [prod]`;sanity = `docker compose --profile prod exec acme acme.sh --version`。

---

## Entity 6: named volume(3 持久 + 既有)

| volume(顯式 name)| 用途 | 持久 |
|---|---|---|
| `rev2_postgres_data` | postgres `/var/lib/postgresql/data` | ✓(down 保留,down -v 清)|
| `rev2_redis_data` | redis-stack data dir | ✓ |
| `rev2_front_nginx_certs` | prod cert 共享(front-nginx + acme)| ✓ |
| `rev2_bw_node_modules` / `rev2_bw_pnpm_store` | 既有(002 dev mask)| ✓ |
| `rev2_rust_api_cargo_cache` / `rev2_rust_api_target` | 既有(001 dev mask)| ✓ |

**命名策略**(R8):顯式 `name: rev2_*` 對齊 standalone 慣例;COMPOSE_PROJECT_NAME=rev2-admin(影響 container name + network)。**§8.2.1 seed 命令的 `rev2-admin_front_nginx_certs` 須同步改 `rev2_front_nginx_certs`**。

> **superseded(006)**:本表卷名為 002/004 凍結當時樣貌;named volume 命名已由 [006-docker-volume-naming](../006-docker-volume-naming/spec.md) 統一為 `rev2-admin_<service>_<purpose>`(移除顯式 name:、3 key 更名)。現行正典見 CLAUDE.md §8.2.2。

---

## Entity 7: secret(2 新 + 2 既有)

| secret | 檔(gitignored)| 範本(git-tracked)| 注入 |
|---|---|---|---|
| `postgres_password` | `deploy/secrets/postgres_password.txt` | `.txt.example` | postgres `POSTGRES_PASSWORD_FILE`(原生 `_FILE`)|
| `redis_password` | `deploy/secrets/redis_password.txt` | `.txt.example` | redis command wrap `--requirepass "$(cat ...)"`(無原生 `_FILE`)|
| `jwt_secret` / `refresh_token_secret` | 既有(001)| 既有 | rust-api prod `APP_JWT_*_SECRET_FILE`(本 feature 不動)|

---

## Entity 8: standalone compose(deprecated)

| 檔 | 動作 |
|---|---|
| `docker-compose.base-web.yml` | 頂部加 `# ⚠️ DEPRECATED — use master docker-compose.yml`(指向 master 命令);**不**動 service 定義 |
| `docker-compose.rust-api.yml` | 同上 |

保留作 single-service debug 後備(Q2 standalone 拍板);header 提醒主流走 master compose。

---

## State transition

本 feature stack 三啟動狀態(非 entity 內部 state,是 compose profile 切換):

```
dev          ── -f compose.yml -f dev.yml up ──→ 5 service(hot-reload + loopback + 雙開 HTTP/HTTPS)
prod baseline── -f compose.yml -f prod.yml up ──→ 5 service(built image + 0.0.0.0 + 80→443 redirect)
prod + acme  ── ... --profile prod up ──────────→ 6 service(+ acme skeleton idle)
```

cert 來源隨 profile 切(dev bind mount / prod named volume),conf 隨 override mount 切(dev.conf / prod.conf)。
