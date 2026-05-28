# Contract: service secrets + healthcheck + depends_on

**Type**: postgres/redis secret 注入 + 5 service healthcheck + 依賴鏈合約。

---

## secret 注入

| service | 機制 | compose 寫法 |
|---|---|---|
| `postgres` | 官方原生 `_FILE` | `environment: { POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password, POSTGRES_USER: rev2admin, POSTGRES_DB: rev2 }` + `secrets: [postgres_password]` |
| `redis-stack` | 無 `_FILE`,command/env wrap | `environment: { REDIS_ARGS: "--requirepass <from-secret>" }` 或 entrypoint `--requirepass "$(cat /run/secrets/redis_password)"` + `secrets: [redis_password]` |
| `rust-api`(prod)| 既有 001 `_FILE` | `APP_JWT_*_SECRET_FILE`(本 feature 不動)|

```yaml
secrets:
  postgres_password:
    file: ./deploy/secrets/postgres_password.txt
  redis_password:
    file: ./deploy/secrets/redis_password.txt
  jwt_secret:                       # 既有 001
    file: ./deploy/secrets/jwt_secret.txt
  refresh_token_secret:             # 既有 001
    file: ./deploy/secrets/refresh_token_secret.txt
```

> secret `.txt` gitignored(既有 .gitignore `/deploy/secrets/*.json` 規則須確認涵蓋 `.txt`;若否本 feature 補 `deploy/secrets/*.txt` ignore + `!*.txt.example` negation);`.txt.example` 範本 git-tracked。

---

## redis-stack password 注入細節(R4)

redis-stack-server 無 `_FILE`;兩種落地擇一(plan/實作確認):
- **A(推薦)**:`command` 或 entrypoint wrap — `redis-stack-server --requirepass "$(cat /run/secrets/redis_password)"`（compose `command:` 用 `sh -c`）
- B:`environment: REDIS_ARGS: "--requirepass <value>"` — 但無法 `$(cat)`,須 entrypoint 展開

healthcheck 帶 password:`redis-cli -a "$(cat /run/secrets/redis_password)" --no-auth-warning ping`。

---

## healthcheck(對應 R6)

| service | healthcheck test | 備註 |
|---|---|---|
| `front-nginx` | `wget -qO- http://localhost/health \| grep -q ok` | alpine busybox wget(無 curl)|
| `base-web`(prod)| image 自帶(002)| compose 不重複 |
| `base-web`(dev)| `wget -qO- http://localhost:21079/ \| grep -q "<!DOCTYPE\|<html"` | vite dev,compose dev override 補 |
| `rust-api`(prod)| image 自帶(001 curl /health)| compose 不重複 |
| `rust-api`(dev)| `curl -fsS http://localhost:21081/health` | cargo-watch dev,compose dev override 補(image 有 curl)|
| `postgres` | `pg_isready -U rev2admin` | |
| `redis-stack` | `redis-cli -a "$(cat /run/secrets/redis_password)" --no-auth-warning ping` | |

healthcheck 通用參數:`interval: 10s` `timeout: 5s` `retries: 5` `start_period: 10s`(base-web/rust-api 首啟較久可調 start_period)。

---

## depends_on(service_healthy)

```yaml
front-nginx:
  depends_on:
    base-web: { condition: service_healthy }
    rust-api: { condition: service_healthy }
rust-api:
  depends_on:                          # 預留:現 /health stateless,Phase 2 連 db
    postgres: { condition: service_healthy }
    redis-stack: { condition: service_healthy }
```

> rust-api depends_on db 是預留(FR-013);現 `/health` 不連 db,但啟動順序保證 db 先 healthy,Phase 2 連線時 zero 改動。

---

## 驗收

對應 spec FR-011/FR-012/FR-013/FR-014/FR-021。
