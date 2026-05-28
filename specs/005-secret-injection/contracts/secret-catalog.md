# Contract: secret catalog(7 必須 secret + 值格式)

**Type**: secret 清單 + 生成值格式合約。權威源 [DESIGN §8.4](../../../docs/INTEGRATION-DESIGN.md) + [research R1-R5](../research.md)。

---

## 7 必須 secret

| Secret | 生成值 | _FILE env(Phase 2 才接,本 feature 不掛) |
|---|---|---|
| `jwt_secret` | `openssl rand -base64 48`(64 字元) | `APP_JWT_JWT_SECRET_FILE`(001 已接) |
| `refresh_token_secret` | `openssl rand -base64 48` | `APP_JWT_REFRESH_TOKEN_SECRET_FILE`(001 已接) |
| `postgres_password` | `openssl rand -base64 24`(32 字元) | postgres `POSTGRES_PASSWORD_FILE`(004 已接) |
| `redis_password` | `openssl rand -base64 24` | redis-stack `command --requirepass`(004 已接) |
| `database_url` | `postgres://soybean:<postgres_password>@postgres:5432/soybean_admin_rust` | `APP_DATABASE_URL_FILE`(Phase 2) |
| `redis_url` | `redis://:<redis_password>@redis-stack:6379` | `APP_REDIS_URL_FILE`(Phase 2) |
| `cleanup_database_url` | = `database_url` 同值(最小權限 role Phase 5) | cleanup `_FILE`(Phase 5) |

> jwt/refresh 須過 001 `validate_secret`:非空 + 非黑名單(`change-me`/`changeme`/`secret`/`xxx`/`<TO_BE_SET>`/`TODO`,case-insensitive 相等)+ len ≥ 32。`rand -base64 48`=64 字元、隨機 → 全過。

---

## 4 可選 secret(obs,Phase 5/6,本 feature 不做)

`acme_email` / `grafana_admin_password` / `postgres_exporter_dsn` / `redis_exporter_password`(`redis_exporter` 用 `.json` 格式,見 `.gitignore` L70-71)。

---

## 範本豐富格式(統一)

```text
# <用途一行>
# 跑 bash deploy/generate-secrets.sh 自動生成(處理 dual-write)。
# 手動 fallback: <指令,如 docker run --rm alpine/openssl rand -base64 48>
# [URL 類] dual-write: 內嵌 password 段須 ≡ <對應葉子>.txt
<placeholder 值,如 change-me 或 postgres://USER:CHANGE_ME@postgres:5432/DB>
```

- jwt/refresh 範本(001)**不動**;postgres/redis 範本(004)retrofit 成此格式;3 URL 範本新增。
- placeholder 值對 jwt/refresh 用 `change-me`(在黑名單 → 誤用觸發 001 boot panic);URL 範本用明顯 placeholder(如 `CHANGE_ME`)。

---

## 驗收

對應 spec FR-002/FR-003/FR-007/FR-008/FR-009 + SC-005/SC-007。
