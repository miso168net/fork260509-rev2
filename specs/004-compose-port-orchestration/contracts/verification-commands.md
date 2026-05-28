# Contract: Verification commands(C-V acceptance)

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — CLAUDE.md §3 紀律提醒**:本 feature 屬「docker-compose orchestration + nginx conf + acme skeleton」,**無新純函式邏輯**(全 wiring + 配置)。整體 feature 由本 C-V contract 覆蓋驗收;`tasks.md` 與 `plan.md` 明示「無單元測試,由 acceptance commands 覆蓋」及理由。
>
> **CDP browser smoke defer**:§1-§2 用 curl 直送驗 nginx 路由 ≠ base-web SPA 在 browser 內經 nginx 打 rust-api;後者留 Phase 4 wire feature / CDP 巡檢(spec Assumptions + follow-up backlog 登記)。

---

## §1 dev profile 完整 stack 啟動(US1 + SC-001)

```bash
# 前置:003 已生 dev cert
bash deploy/generate-dev-cert.sh   # 若 deploy/dev-certs/ 已有 4 檔可跳
# 前置:dev secret(dev 可用 .example 或現生)
cp deploy/secrets/postgres_password.txt.example deploy/secrets/postgres_password.txt 2>/dev/null || openssl rand -base64 24 > deploy/secrets/postgres_password.txt
cp deploy/secrets/redis_password.txt.example deploy/secrets/redis_password.txt 2>/dev/null || openssl rand -base64 24 > deploy/secrets/redis_password.txt

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
echo "exit: $?"
# 預期: --wait 成功返回(5 service 全 healthy),exit 0(SC-001)

docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format '{{.Name}} {{.State}} {{.Health}}'
# 預期: front-nginx / base-web / rust-api / postgres / redis-stack 5 個 running + healthy

curl -fsS http://127.0.0.1:21080/health
# 預期: ok(front-nginx self)

pg_isready -h 127.0.0.1 -p 25432
# 預期: accepting connections

redis-cli -h 127.0.0.1 -p 26379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping
# 預期: PONG
```

---

## §2 nginx 路由分流(US2 + SC-002/SC-003)

```bash
# (a) / → base-web SPA
curl -fsS http://127.0.0.1:21080/ | head -5
# 預期: HTTP 200 + base-web SPA index.html(<!DOCTYPE html> ...)

# (b) /api/* strip → rust-api(SC-003 關鍵:strip /api 前綴)
curl -fsS http://127.0.0.1:21080/api/health
# 預期: ok(rust-api 收到 /health,證明 /api 前綴正確 strip)

# (c) 反證:rust-api 直連同結果
curl -fsS http://127.0.0.1:21081/health
# 預期: ok(dev profile rust-api host expose;與 (b) 一致證明 nginx strip 正確)
```

---

## §3 TLS handshake(US2 + SC-004)

```bash
curl -kfsS https://127.0.0.1:21443/health
# 預期: ok(HTTPS front-nginx self)

openssl s_client -connect 127.0.0.1:21443 -servername localhost </dev/null 2>&1 | grep -E "subject=|issuer="
# 預期: subject=CN=localhost / issuer=CN=rev2-admin-root dev CA(003 cert)

echo | openssl s_client -connect 127.0.0.1:21443 -servername localhost 2>/dev/null | openssl x509 -noout -ext subjectAltName
# 預期: DNS:localhost, IP Address:127.0.0.1(SC-004)
```

---

## §4 prod baseline + 80→443 redirect(US3 + SC-005)

```bash
# 先 down dev + seed cert 進 named volume
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
# ⚠️ superseded(006-docker-volume-naming):卷名已改 rev2-admin_front_nginx_certs(現行指令見 CLAUDE.md §8.2.1);下行 rev2_front_nginx_certs 為 004 凍結當時舊名、勿直接複製
docker run --rm -v rev2_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
echo "exit: $?"

# 80 → 443 redirect(SC-005)
curl -sI http://127.0.0.1:21080/ | head -3   # prod dev-host 用 21080 映射 :80;或實機 :80
# 預期: HTTP/1.1 301 + Location: https://...

# 443 ssl handshake
curl -kfsS https://127.0.0.1:21443/health    # prod dev-host 用 21443 映射 :443
# 預期: ok
```

> 註:prod profile 對 0.0.0.0:80,443;在 dev host 機驗證時 host port 仍以 §8.2 規劃(實機部署 host 直用 :80/:443)。acceptance 跑時 port 映射細節依實作 compose.prod.yml 為準。

---

## §5 prod + acme skeleton sanity(US3 + SC-006)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod exec acme acme.sh --version
# 預期: acme.sh 版本字串(如 v3.1.3);skeleton sanity,不真實 issue cert

docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod ps acme --format '{{.State}}'
# 預期: running(idle entrypoint 不 crash)
```

---

## §6 standalone DEPRECATED header(US3 + SC-007)

```bash
head -5 docker-compose.base-web.yml | grep -c "DEPRECATED"
# 預期: ≥ 1

head -5 docker-compose.rust-api.yml | grep -c "DEPRECATED"
# 預期: ≥ 1

# standalone 仍可獨立跑(後備未壞)
docker compose -f docker-compose.rust-api.yml config -q && echo "standalone rust-api still valid"
docker compose -f docker-compose.base-web.yml config -q && echo "standalone base-web still valid"
# 預期: 兩者 config 驗證通過(service 定義未動)
```

---

## §7 Constitution Compliance 自我覆查(對應 plan Constitution Re-Check)

```bash
# (1) base-web worktree 不動(§I.1 + FR-023)
git -C base-web status --short
# 預期: 空

# (2) rust-api worktree 不動(§I.5 + FR-023)
git -C rust-api status --short
# 預期: 空

# (3) 不動 001/002 Dockerfile/secret 範本(FR-023)
git diff --name-only HEAD -- deploy/Dockerfile.base-web.txt deploy/Dockerfile.rust-api.txt deploy/secrets/jwt_secret.txt.example deploy/secrets/refresh_token_secret.txt.example
# 預期: 空(未動既有 Dockerfile / 001 secret 範本)

# (4) plan Constitution Check 7+7 對照
grep -c "✅ Pass" specs/004-compose-port-orchestration/plan.md
# 預期: ≥ 14(Constitution Check 7 + Re-Check 7)
```

---

## 驗收紀律總結

- §1 dev profile 完整 stack 啟動(US1 + SC-001)
- §2 nginx 路由分流 / strip(US2 + SC-002/SC-003)
- §3 TLS handshake(US2 + SC-004)
- §4 prod baseline + redirect(US3 + SC-005)
- §5 prod + acme sanity(US3 + SC-006)
- §6 standalone DEPRECATED(US3 + SC-007)
- §7 Constitution self-check(SC-008 + plan Re-Check)

`tasks.md` 階段把以上 §1-§7 排程進 task、對應 spec acceptance scenario 與 SC。
