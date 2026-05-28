# Phase 1 Data Model: secret-injection

> 本 feature 無傳統 DB entity(那是 Phase 2);此處 model 的是 **secret provisioning entity**(secret 檔 / 生成腳本 / 範本 / 不變式)及其關係。

---

## Entity 1: 7 個必須 secret

| Secret | 類 | 值來源 | 消費者(env / 機制) | 狀態 |
|---|---|---|---|---|
| `jwt_secret` | 葉子 | `openssl rand -base64 48` | rust-api `APP_JWT_JWT_SECRET_FILE`(001 已接) | 既有範本、本 feature 由腳本生 `.txt` |
| `refresh_token_secret` | 葉子 | `openssl rand -base64 48` | rust-api `APP_JWT_REFRESH_TOKEN_SECRET_FILE`(001 已接) | 既有範本 |
| `postgres_password` | 葉子 | `openssl rand -hex 24`(URL-safe,見 research R2 偏離) | postgres `POSTGRES_PASSWORD_FILE`(004 已接) | 既有範本(retrofit 格式) |
| `redis_password` | 葉子 | `openssl rand -hex 24`(URL-safe,見 research R2 偏離) | redis-stack `command --requirepass "$(cat ...)"`(004 已接) | 既有範本(retrofit 格式) |
| `database_url` | 組合 | `postgres://soybean:<postgres_password>@postgres:5432/soybean_admin_rust` | migration + rust-api(Phase 2 接) | **本 feature 新增範本** |
| `redis_url` | 組合 | `redis://:<redis_password>@redis-stack:6379` | rust-api(Phase 2 接) | **本 feature 新增範本** |
| `cleanup_database_url` | 組合 | 暫 = `database_url` 同值(最小權限 role Phase 5) | cleanup-job(Phase 5 接) | **本 feature 新增範本** |

**葉子 vs 組合**:葉子 = 直接隨機生成的純值;組合 = 嵌入葉子 password 的連線 URL。

---

## Entity 2: `generate-secrets.sh`

| 屬性 | 值 |
|---|---|
| 位置 | `deploy/generate-secrets.sh` |
| 介面 | `bash deploy/generate-secrets.sh [--force]` |
| openssl | docker 化 `alpine/openssl rand`(host-independent,沿用 003) |
| 模式 | zero-arg = idempotent skip-existing;`--force` = 全重生 |
| 輸出 | 生成摘要(哪些生/跳),**不**印 secret 值 |
| 權限 | 生成的 `.txt` 設 `chmod 600` |

**執行序**:① 生 4 葉子(缺則生 / --force)→ ② `$(cat)` 葉子組 3 URL → ③ chmod 600 + 印摘要。

---

## Entity 3: secret 範本(`.txt.example`)

| 範本 | 狀態 | 格式 |
|---|---|---|
| `jwt_secret.txt.example` | 既有(001),不動 | 豐富格式(註解 + `change-me` 黑名單 placeholder) |
| `refresh_token_secret.txt.example` | 既有(001),不動 | 同上 |
| `postgres_password.txt.example` | 既有(004),**retrofit** | 極簡 → 豐富格式 |
| `redis_password.txt.example` | 既有(004),**retrofit** | 極簡 → 豐富格式 |
| `database_url.txt.example` | **新增** | 豐富格式(含 dual-write 提醒) |
| `redis_url.txt.example` | **新增** | 豐富格式(含 dual-write 提醒) |
| `cleanup_database_url.txt.example` | **新增** | 豐富格式(含最小權限 Phase 5 註記) |

**豐富格式**(統一):
```text
# <用途一行>
# 跑 bash deploy/generate-secrets.sh 自動生成(處理 dual-write)。
# 手動 fallback: <指令>
# [URL 類] dual-write: 內嵌 password 段須 ≡ <對應葉子>.txt(腳本自動保證)
<placeholder 值>
```

---

## Entity 4: `deploy/secrets/README.md`

| 段 | 內容 |
|---|---|
| secret 清單 | 7 必須(用途 + 消費者 service + 葉子/組合)+ 4 可選(obs,Phase 5/6,標 ⏳) |
| dual-write 不變式 | database_url/cleanup ⊃ postgres_password;redis_url ⊃ redis_password |
| 生成方式 | `bash deploy/generate-secrets.sh` [`--force`] |
| 手動 fallback | 各 secret 的手動指令 |
| 風險警示 | `--force` 覆寫 → 既有 stack 需重啟讀新值;切勿手改葉子而不更新 URL |
| Phase 2 前瞻 | URL secret 預期 `_FILE` env 名(`APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE`,provision-ahead 提示) |

---

## Entity 5: dual-write 不變式

```text
database_url.txt        內嵌 password 段  ≡  postgres_password.txt 純值
cleanup_database_url.txt 內嵌 password 段  ≡  postgres_password.txt 純值
redis_url.txt           內嵌 password 段  ≡  redis_password.txt 純值
```

**保證機制**:`generate-secrets.sh` 同次執行先生葉子、再 `$(cat)` 葉子組 URL(R6)。**違反偵測**:acceptance grep(verification-commands §2)。

---

## Entity 6: 004 postgres 命名變更(連帶修)

| 欄位 | 現(004) | 改為 |
|---|---|---|
| `POSTGRES_USER` | `rev2admin` | `soybean` |
| `POSTGRES_DB` | `rev2` | `soybean_admin_rust` |
| healthcheck | `pg_isready -U rev2admin` | `pg_isready -U soybean` |

**落地前置**:`docker compose ... down -v` 清 `rev2_postgres_data`(R9:postgres 非空 data dir 不重 init)。`database_url` / `cleanup_database_url` 的 user/db 段與此一致(Entity 1)。

---

## 關係圖

```text
generate-secrets.sh ──生成──→ 4 葉子 .txt ──$(cat) 嵌入──→ 3 URL .txt
                                  │                            │
                          (chmod 600, gitignored)      (dual-write 不變式)
                                  │
.txt.example 範本 ──自說明──→ 人 / README ──指引──→ generate-secrets.sh

postgres service(soybean/soybean_admin_rust)←──user/db 一致──→ database_url
redis-stack service(requirepass)←──password 一致(dual-write)──→ redis_url
```

不接線(Phase 2):3 URL secret **不**進 compose `secrets:` / service `APP_*_FILE` env(FR-016)。
