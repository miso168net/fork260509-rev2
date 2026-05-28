# Quickstart: compose-port-orchestration

> 「容器 port 與編排」master compose stack 單頁指南。
> 詳細設計見 [plan.md](./plan.md);驗收細節見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

---

## 前置

- docker 23+(compose v2)+ bash
- WSL2 需 `networkingMode=mirrored`(Win11 22H2+ 預設)使 `127.0.0.1` 從 Windows host 可達
- 001 rust-api image + 002 base-web image 可 build;003 `deploy/generate-dev-cert.sh` 已跑(`deploy/dev-certs/{fullchain,privkey}.pem` 存在)
- 在 feature branch `004-compose-port-orchestration`

```bash
# 一次性:生 dev cert(003)+ dev secret
bash deploy/generate-dev-cert.sh
openssl rand -base64 24 > deploy/secrets/postgres_password.txt
openssl rand -base64 24 > deploy/secrets/redis_password.txt
```

---

## Path A — dev profile 一鍵拉起完整 stack

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 預期: 5 service(front-nginx + base-web + rust-api + postgres + redis-stack)全 healthy、exit 0

docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
# 預期: 5 個 running + healthy

curl -fsS http://127.0.0.1:21080/health        # front-nginx self → ok
pg_isready -h 127.0.0.1 -p 25432               # postgres → accepting
redis-cli -h 127.0.0.1 -p 26379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping  # → PONG
```

dev 改 base-web / rust-api source → hot-reload 即時生效(vite HMR / cargo-watch 重編)。

---

## Path B — nginx 路由分流 + TLS

```bash
# / → base-web SPA
curl -fsS http://127.0.0.1:21080/ | head -5
# 預期: <!DOCTYPE html> ... (base-web SPA)

# /api/* strip → rust-api(rust-api 收 /health,不帶 /api)
curl -fsS http://127.0.0.1:21080/api/health
# 預期: ok

# HTTPS(003 self-signed cert)
curl -kfsS https://127.0.0.1:21443/health
# 預期: ok

openssl s_client -connect 127.0.0.1:21443 -servername localhost </dev/null 2>&1 | grep "subject="
# 預期: subject=CN=localhost
echo | openssl s_client -connect 127.0.0.1:21443 -servername localhost 2>/dev/null | openssl x509 -noout -ext subjectAltName
# 預期: DNS:localhost, IP Address:127.0.0.1
```

> browser 開 `https://localhost:21443`:先 trust `deploy/dev-certs/ca.pem`(003 印的 OS trust 教學),否則跳 NET::ERR_CERT_AUTHORITY_INVALID。

---

## Path C — prod baseline + acme skeleton

```bash
# down dev + seed cert 進 named volume
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
# ⚠️ superseded(006-docker-volume-naming):卷名已改 rev2-admin_front_nginx_certs(現行指令見 CLAUDE.md §8.2.1);下行 rev2_front_nginx_certs 為 004 凍結當時舊名、勿直接複製
docker run --rm -v rev2_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"

# prod baseline(0.0.0.0 + 80→443 redirect)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
curl -sI http://127.0.0.1:21080/ | head -3
# 預期: 301 + Location: https://...

# prod + acme(skeleton sanity)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod exec acme acme.sh --version
# 預期: acme.sh v3.x 版本字串(不真實 issue cert)
```

> 真實 acme cert acquisition 留後續:設 DNS provider creds + 真 domain + `acme.sh --issue --dns ...`(本 feature 只 skeleton)。

---

## Path D — standalone DEPRECATED + 後備

```bash
head -5 docker-compose.base-web.yml    # 預期: 含 DEPRECATED header
head -5 docker-compose.rust-api.yml    # 預期: 含 DEPRECATED header

# standalone 仍可獨立跑(single-service debug 後備)
docker compose -f docker-compose.rust-api.yml --profile dev up -d
# 仍可用,但主流請走 master compose
```

---

## Troubleshooting

| 症狀 | 處置 |
|---|---|
| `--wait` timeout,某 service unhealthy | `docker compose ... logs <service>`;檢查 healthcheck 命令 + start_period |
| `curl /api/health` 回 404 | nginx `proxy_pass` 末尾 `/` 漏掉(未 strip /api);檢查 `deploy/nginx/conf.d/_locations.inc` |
| HTTPS 443 起不來 | dev:`deploy/dev-certs/{fullchain,privkey}.pem` 不存在(先跑 003);prod:named volume 未 seed cert |
| redis healthcheck fail | `deploy/secrets/redis_password.txt` 不存在 / `--requirepass` 未正確注入 |
| postgres 起不來 | `deploy/secrets/postgres_password.txt` 不存在 |
| `127.0.0.1` 從 Windows host curl 不到 | WSL2 非 mirrored mode;設 `.wslconfig` `networkingMode=mirrored` 或用 `wsl hostname -I` IP |
| port 衝突(疊加)| base 層誤放 host port(R1);host port 只該在 dev/prod override |
| base-web SPA 打 ApiFox 而非 rust-api | prod build 未帶 `VITE_SERVICE_BASE_URL=/api`;重 build base-web prod image |

---

## 下一步

- 跑完 Path A-D → 本 feature MVP 達成(dev/prod/acme 三模式 + 路由 + TLS + 退場)
- Phase 2 basic infra:rust-api DATABASE_URL / redis URL wire + db schema migration + Casbin adapter(本 feature 已起 postgres/redis service,留連線 wire)
- Phase 6 obs:grafana / prometheus / pushgateway 加進 master compose(network + 結構就緒)
- 實作走 `superpowers:executing-plans`(**不**用 `/speckit-implement`,對齊 CLAUDE.md §3 紀律)
