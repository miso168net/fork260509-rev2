# 005 · secret-injection

> rev2 第五個 spec-kit feature 的 Phase 0 brainstorm spec-design。
> 對應 DESIGN §10 Phase 1 #5(secret 注入機制 feature)+ [DESIGN §4.6.2 / §8.4](../INTEGRATION-DESIGN.md) 11 secret 清單(必7+選4)+ dual-write 紀律。
> Phase 1 部署基建的最後一片 — 001 交了 `_FILE` loader logic、004 交了 postgres/redis password 範本;本 feature 補齊「其餘必須 secret 範本 + 統一生成腳本 + dual-write 文件」,收尾整個 P0 基建。

---

## 1. Intro

**問題**:secret 注入機制目前只完成一半 —— 001 落了 rust-api 的 `_FILE` precedence loader(`server/src/config.rs`:`<KEY>_FILE` 優先於 `<KEY>` envvar)+ jwt/refresh 範本;004 落了 postgres/redis password 範本(極簡格式)。但 [DESIGN §8.4](../INTEGRATION-DESIGN.md) 權威清單的 **7 個必須 secret 還缺 3 個範本**(`database_url` / `redis_url` / `cleanup_database_url`),且**沒有統一生成腳本** —— 每個 secret 要手動 `openssl rand`、URL 要手動組(dual-write 容易出錯)。本 feature 補這片。

**scope 邊界**(brainstorm Q1 拍板):**補 3 缺必範本 + `deploy/generate-secrets.sh` + dual-write 文件 + retrofit 既有 postgres/redis 範本格式 + 連帶修 004 DB 命名**。**不**含 obs 選4 secret(`acme_email` / `grafana_admin_password` / `postgres_exporter_dsn` / `redis_exporter_password`,留 Phase 5/6 obs 啟用時);**不**把 3 個 URL secret 接進 compose service(`secrets:` 掛載 + `APP_*_FILE` env),因 rust-api / migration / cleanup-job 程式碼**現在完全沒消費 DATABASE_URL/REDIS_URL**(grep 證實 `config.rs` 只 load `APP_JWT_JWT_SECRET` / `APP_JWT_REFRESH_TOKEN_SECRET`),DB 連線層留 Phase 2。

**design 主軸**:`generate-secrets.sh` 對齊 003 `generate-dev-cert.sh` 風格(zero-arg 一鍵 + `--force` + idempotent skip-existing)+ **腳本自動保證 dual-write**(先 `openssl rand` 生葉子 password、再把同值嵌入 URL secret,人不手組 URL)+ DB 命名對齊 DESIGN §8.4 權威(`soybean` / `soybean_admin_rust`)。

---

## 2. brainstorm 拍板項(收斂順序)

| # | 維度 | 拍板 | 理由 |
|---|---|---|---|
| 1 | scope 邊界 | **A. 補 3 缺必範本 + 生成腳本 + dual-write 文件**(選4 obs secret 延 Phase 5/6) | 對齊 CHECKLIST「7 必齊備、4 選 obs 啟用前可缺」+ YAGNI;obs service(grafana/exporter)Phase 6 才進 compose,現補無對應 service 的範本無法端到端驗 |
| 2 | DB user/db 命名 | **soybean / soybean_admin_rust**(對齊 DESIGN §8.4 權威) | DESIGN 是核心事實([CLAUDE.md §7.2](../../CLAUDE.md));004 我 brief 時臨時定的 `rev2admin`/`rev2` 偏離了 §8.4、本該被約束。grep 證實 rust-api/migration/cleanup 程式碼**完全沒寫死**此名(改名零 code 風險),唯一活消費者是 004 postgres init |
| 3 | `generate-secrets.sh` 行為 | **003 風格:一鍵生全 7 必 + 自動 dual-write + idempotent** | zero-arg + `--force`;先 `rand` 生 jwt/refresh/postgres_password/redis_password 四葉子值,再組 database_url/redis_url/cleanup_database_url 嵌入同值 → dual-write 由腳本保證、不靠人;已存在 `.txt` 預設 skip、`--force` 才覆寫 |
| 4 | 範本格式 | **豐富格式 + retrofit 既有 postgres/redis** | 新 3 個用「註解(用途 + generate-secrets.sh 生成 + dual-write 提醒)+ placeholder」格式對齊 jwt/refresh;順手把 004 的 postgres/redis_password 兩個極簡範本也補成同格式(一致性,user 拍板要 retrofit) |
| 5 | URL secret compose 接線 | **暫不接(留 Phase 2)** | rust-api/migration/cleanup 程式碼還沒讀 DATABASE_URL/REDIS_URL(grep 證實);提前在 compose 宣告/掛載無人消費的 secret 無意義。Phase 2 連 db 時才掛 `secrets: [database_url]` + 設 `APP_DATABASE_URL_FILE`(user 同意此邊界) |
| 6 | dual-write 文件位置 | **輕量自說明 + `deploy/secrets/README.md` 一頁** | 既然腳本自動保證 dual-write,文件走輕量:`generate-secrets.sh` header 註解 + 各範本檔內註解自說明;另寫 `deploy/secrets/README.md`(7 secret 清單 + dual-write 不變式 + 手動 fallback)。**不**動 CLAUDE.md(避免膨脹,對齊 §7.3 紀律) |

---

## 3. 凍結摘要(spec/plan 階段 input)

本 feature 落地後:
- **新增範本**:`deploy/secrets/{database_url,redis_url,cleanup_database_url}.txt.example`(git-tracked;`.txt` gitignored,沿用 `.gitignore` line 68-69 規則)
- **新增腳本**:`deploy/generate-secrets.sh`(一鍵生 7 必 secret 真實 `.txt`,自動 dual-write,idempotent + `--force`)
- **新增文件**:`deploy/secrets/README.md`(7 secret 清單 + dual-write 不變式 + 手動 fallback)
- **retrofit**:`deploy/secrets/{postgres_password,redis_password}.txt.example` 補成豐富格式(對齊 jwt/refresh 風格;不動值語義)
- **連帶修 004**:`docker-compose.yml` postgres `POSTGRES_USER` → `soybean`、`POSTGRES_DB` → `soybean_admin_rust`;落地時需 `docker compose ... down -v` 清 `rev2_postgres_data` 讓 postgres 重 init(dev 無真資料、僅 postgres 自身 init,重置零風險)
- **不動**:`base-web/` `rust-api/` worktree source、001/002 `deploy/Dockerfile.{base-web,rust-api}.txt`、001 已落 jwt/refresh secret 範本「值」(只 retrofit 不涉及的是 postgres/redis 範本格式)、`server/src/config.rs`(loader 已是 001 成品)
- **不接線**:3 個 URL secret **不**進 compose `secrets:` 掛載 / service `APP_*_FILE` env(留 Phase 2)
- **無 unit test**(shell 腳本 + 範本 + docs)— acceptance 由 C-V command 覆蓋(本檔 §6)

---

## 4. 檔案結構

```text
fork260509-rev2/
├── docker-compose.yml                       ← 既有(004),本 feature 改 postgres POSTGRES_USER/DB → soybean/soybean_admin_rust
└── deploy/
    ├── generate-secrets.sh                  ← 本 feature 新增(一鍵生 7 必 + 自動 dual-write + idempotent + --force)
    └── secrets/
        ├── README.md                        ← 本 feature 新增(7 secret 清單 + dual-write 不變式 + 手動 fallback)
        ├── database_url.txt.example         ← 本 feature 新增(範本)
        ├── redis_url.txt.example            ← 本 feature 新增(範本)
        ├── cleanup_database_url.txt.example ← 本 feature 新增(範本)
        ├── postgres_password.txt.example    ← 既有(004),retrofit 成豐富格式
        ├── redis_password.txt.example       ← 既有(004),retrofit 成豐富格式
        ├── jwt_secret.txt(.example)         ← 既有(001),不動
        ├── refresh_token_secret.txt(.example)  ← 既有(001),不動
        └── *.txt                            ← generate-secrets.sh 生成(全 gitignored)
```

---

## 5. 詳細設計

### 5.1 7 個必須 secret(權威源 DESIGN §8.4)

| Secret | 葉子/組合 | 值 | Service(消費者) |
|---|---|---|---|
| `jwt_secret` | 葉子 | `openssl rand -base64 48` | rust-api(`APP_JWT_JWT_SECRET_FILE`,001 已接) |
| `refresh_token_secret` | 葉子 | `openssl rand -base64 48` | rust-api(`APP_JWT_REFRESH_TOKEN_SECRET_FILE`,001 已接) |
| `postgres_password` | 葉子 | `openssl rand -base64 24` | postgres(`POSTGRES_PASSWORD_FILE`,004 已接) |
| `redis_password` | 葉子 | `openssl rand -base64 24` | redis-stack(command `--requirepass`,004 已接) |
| `database_url` | 組合 | `postgres://soybean:<postgres_password>@postgres:5432/soybean_admin_rust` | migration + rust-api(Phase 2 接) |
| `redis_url` | 組合 | `redis://:<redis_password>@redis-stack:6379` | rust-api(Phase 2 接) |
| `cleanup_database_url` | 組合 | 暫 = `database_url` 同值 | cleanup-job(Phase 5 接;最小權限 role 留 Phase 5) |

> 服務名 `postgres` / `redis-stack` 對齊 004 compose service 名;redis requirepass URL 形式 `redis://:<pw>@host:port`(無 username,password 在冒號後)。`cleanup_database_url` 暫與 `database_url` 同連線(最小權限 cleanup role 是 Phase 5 cleanup-job feature 本體,範本帶註解說明)。

### 5.2 `generate-secrets.sh` 行為(003 風格)

```text
用法: bash deploy/generate-secrets.sh [--force]
  zero-arg : 缺哪個生哪個(idempotent skip 已存在的 .txt)
  --force  : 全部重生(覆寫既有 .txt)

流程:
  1. 生 4 葉子(若缺 / --force):
       jwt_secret.txt           = openssl rand -base64 48
       refresh_token_secret.txt = openssl rand -base64 48
       postgres_password.txt    = openssl rand -base64 24
       redis_password.txt       = openssl rand -base64 24
  2. 組 3 URL(嵌入剛生的葉子值 → dual-write 保證):
       database_url.txt         = postgres://soybean:$(cat postgres_password.txt)@postgres:5432/soybean_admin_rust
       redis_url.txt            = redis://:$(cat redis_password.txt)@redis-stack:6379
       cleanup_database_url.txt = (同 database_url)
  3. chmod 600 所有 .txt;印生成摘要(不印 secret 值本體)
```

- **dual-write 不變式**:URL 內 password 段恆 = 對應葉子 `.txt`(腳本同次組出、不可能 drift)。`--force` 重生時 URL 連帶用新葉子值重組
- **idempotent 細節**:zero-arg 模式下,若 `postgres_password.txt` 已存在但 `database_url.txt` 缺 → 用既有 `postgres_password.txt` 值組 URL(維持 dual-write)
- 對齊 003:host 無 openssl dep 時可走 `docker run --rm alpine/openssl`(plan 階段確認是否需 docker 化,或假設 host 有 openssl)

### 5.3 範本格式(豐富格式,retrofit 既有)

新 3 個 URL 範本 + retrofit 的 postgres/redis 範本,統一格式(對齊 jwt/refresh 既有風格):
```text
# <secret 用途一行>
# 實際請跑 bash deploy/generate-secrets.sh 自動生成(會處理 dual-write)。
# 手動 fallback: <該 secret 的手動生成/組合指令>
# dual-write 提醒(URL 類): 內嵌 password 段須 ≡ <對應葉子>.txt(generate-secrets.sh 自動保證)
<placeholder 值>
```
- jwt/refresh 範本**不動**(已是豐富格式 + `change-me` 黑名單 placeholder,誤用觸發 001 loader boot panic)
- postgres/redis 範本從 004 極簡一行 retrofit 成上述格式(值語義不變,只加註解)

### 5.4 連帶修 004 DB 命名

- `docker-compose.yml` postgres service:`POSTGRES_USER: soybean` + `POSTGRES_DB: soybean_admin_rust`(現為 rev2admin/rev2)
- healthcheck `pg_isready -U soybean`(現 `-U rev2admin`)同步改
- 落地步驟文件提示:`docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v` 清 `rev2_postgres_data` → 重 `up` 時 postgres 以 soybean/soybean_admin_rust 重 init

---

## 6. Acceptance / verification(C-V contract)

無 unit test(shell + 範本 + docs,對齊 [CLAUDE.md §3](../../CLAUDE.md) 紀律);acceptance 由以下 command 覆蓋:

```bash
# §1 生成 + 數量
rm -f deploy/secrets/*.txt && bash deploy/generate-secrets.sh
ls deploy/secrets/*.txt | wc -l          # 預期: 7

# §2 dual-write 不變式(關鍵)
grep -q "$(cat deploy/secrets/postgres_password.txt)" deploy/secrets/database_url.txt && echo "db dual-write OK"
grep -q "$(cat deploy/secrets/postgres_password.txt)" deploy/secrets/cleanup_database_url.txt && echo "cleanup dual-write OK"
grep -q "$(cat deploy/secrets/redis_password.txt)" deploy/secrets/redis_url.txt && echo "redis dual-write OK"

# §3 idempotent + --force
PG1=$(cat deploy/secrets/postgres_password.txt); bash deploy/generate-secrets.sh; [ "$PG1" = "$(cat deploy/secrets/postgres_password.txt)" ] && echo "idempotent skip OK"
bash deploy/generate-secrets.sh --force; [ "$PG1" != "$(cat deploy/secrets/postgres_password.txt)" ] && echo "--force regen OK"

# §4 gitignore(範本 tracked / .txt ignored)
git check-ignore deploy/secrets/database_url.txt                    # 預期: 回路徑(ignored)
git check-ignore deploy/secrets/database_url.txt.example; [ $? -ne 0 ] && echo "example tracked OK"

# §5 jwt/refresh 通過 001 loader 驗證(len>=32 + 非黑名單)
[ $(wc -c < deploy/secrets/jwt_secret.txt) -ge 32 ] && echo "jwt len OK"

# §6 004 soybean 落地 + 連線通(整合)
# 改 postgres env 後:
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait    # 預期 exit 0、5 service healthy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres psql -U soybean -d soybean_admin_rust -c '\conninfo'   # 預期: 連線成功(新 user/db init OK)

# §7 範本格式一致性
head -1 deploy/secrets/postgres_password.txt.example | grep -q "^#" && echo "postgres retrofit OK"
```

---

## 7. 與既有 + 未來 feature 介面對齊

- **001(已落)**:`server/src/config.rs` `_FILE` loader（`APP_JWT_JWT_SECRET_FILE` / `APP_JWT_REFRESH_TOKEN_SECRET_FILE`）+ 黑名單 + len≥32 驗證 —— 本 feature 生的 jwt/refresh 值須過此驗證(rand -base64 48 = 64 字元,遠超 32,非黑名單)
- **004(已落)**:postgres `POSTGRES_PASSWORD_FILE` / redis command `--requirepass $(cat ...)` —— 本 feature 修其 user/db 名 + retrofit 範本格式
- **Phase 2(未來)**:rust-api / migration 接 `database_url`(`APP_DATABASE_URL_FILE`)+ redis_url(`APP_REDIS_URL_FILE`,env 名待 Phase 2 spec 定);本 feature 已備好範本 + 生成,Phase 2 只需 compose 掛 `secrets:` + 設 `_FILE` env + code 讀
- **Phase 5(未來)**:cleanup-job 接 `cleanup_database_url`(屆時建最小權限 role、更新此 secret 值)

---

## 8. Constitution Check 預檢(對照 v1.0.0 §IV 7 項)

| § | 檢查項 | 立場 | Pass |
|---|---|---|---|
| 1 | base-web 權威 / rust-api 缺對應 endpoint | N/A — 純 secret provisioning、不涉 wire endpoint | ✅ |
| 2 | 動到 base-web inline | 否 — 完全不碰 base-web | ✅ |
| 3 | menu 走 Casbin enforce | N/A | ✅ |
| 4 | wire 對齊 mock ground truth | N/A — 無 wire endpoint | ✅ |
| 5 | 從 rev1 拷貝 code | 否 — 新 shell 腳本 + 範本;`_FILE` pattern 是 001 既有成品、非本 feature 拷貝 | ✅ |
| 6 | 凍結 §11 12 拍板 | 無改 — 正面實現 §8.4 secret 清單 + dual-write 紀律 | ✅ |
| 7 | 觸及 ★ 軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG) | 否 — 純 workspace-level deploy | ✅ |

預期 7 項全 PASS、無 violations、無 Complexity Tracking。

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| dual-write drift(URL password ≠ 葉子) | 腳本同次組出、不可能 drift;acceptance §2 grep 驗 |
| soybean 改名需 `down -v` 重 init | dev 無真資料(migration 連跑都沒跑)、僅 postgres 自身 init;落地步驟文件明示 |
| 3 URL secret 暫無消費者 | 刻意(Phase 2 才接);範本 + README 註解說明「provision ahead」,不進 compose 避免宣告無人用的 secret |
| `--force` 誤覆寫正在用的 secret | 預設 idempotent skip;`--force` 須顯式;README 警示 `--force` 會使既有 stack 需重啟讀新值 |
| host 無 openssl | plan 階段確認 docker 化 fallback(對齊 003 alpine/openssl 模式)或文件要求 host 裝 openssl |

---

## 10. Open Questions & 後續 contract

### 10.1 留給 `/speckit-specify` 階段釐清
- `generate-secrets.sh` 是否需 docker 化 openssl(對齊 003),或假設 host 有 openssl?(003 已 docker 化、可沿用模式)
- README.md 是否列出 Phase 2 預期的 `APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE` env 名(provision ahead 提示)?

### 10.2 留給後續 feature 的明確 contract
- **Phase 2**:compose 掛 `secrets: [database_url, redis_url]` + rust-api/migration service `APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE` env + `config.rs` 加 `[database]`/`[redis]` section 讀取
- **Phase 5**:cleanup-job 最小權限 DB role + `cleanup_database_url` 改用該 role 連線
- **Phase 5/6**:obs 選4 secret(`acme_email` / `grafana_admin_password` / `postgres_exporter_dsn` / `redis_exporter_password`)範本 + 生成

### 10.3 風險與緩解
見 §9。

---

## 11. 交棒給 `/speckit-specify`(階段 1)

本檔(spec-design)完成 + user 審核後 **手動執行** `/speckit-specify`(CLAUDE.md §3 紀律:不可在 brainstorm 內自動觸發,會跳過 `speckit.git.feature` pre-hook、不會自動建 `005-secret-injection` feature branch)。

`/speckit-specify` 階段會:
1. `before_specify` pre-hook(`speckit.git.feature`)從當前 `rev2-admin-root` 自動建 `005-secret-injection` feature branch
2. 從本檔 input 產出 `specs/005-secret-injection/spec.md`(formal spec)
3. 後續 `/speckit-clarify`(optional)→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`(階段 2 TDD 實作)

---

**生效**:本檔成立後即為 `005-secret-injection` feature 的 Phase 0 brainstorm 權威;後續 spec / plan / tasks / implementation 任何決策若偏離本檔,需在對應 spec doc 明示理由 + 更新本檔。
