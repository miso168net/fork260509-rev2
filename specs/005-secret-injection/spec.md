# Feature Specification: secret-injection

**Feature Branch**: `005-secret-injection`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Phase 1 #5 secret 注入機制:補 database_url/redis_url/cleanup_database_url 必須範本 + deploy/generate-secrets.sh 一鍵生成腳本(自動 dual-write)+ deploy/secrets/README.md + retrofit postgres/redis 範本格式 + 連帶修 004 DB 命名為 soybean/soybean_admin_rust"

**Phase 0 brainstorm source**: [`docs/superpowers/005-secret-injection.md`](../../docs/superpowers/005-secret-injection.md)

---

## Clarifications

### Session 2026-05-28

- 全 taxonomy 掃描結果:無 spec-level critical ambiguity 需正式 clarify(brainstorm 已做 3 輪澄清:scope / DB 命名 / 腳本行為;剩餘開放點已吸收進 Assumptions)。
- Deferred 到 `/speckit-plan`:`generate-secrets.sh` 的 openssl 來源(host vs docker 化 alpine/openssl fallback)屬 plan-level 實作細節,預設沿用 003 `generate-dev-cert.sh` hybrid 模式(已記 Assumptions),不影響 spec 的 WHAT/驗收。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 一鍵生成全部必須 secret (Priority: P1)

rev2 開發者在 workspace root 跑單一命令 `bash deploy/generate-secrets.sh`,腳本自動生成全部 7 個必須 secret 的真實值檔(`deploy/secrets/*.txt`):4 個葉子值(jwt / refresh / postgres password / redis password)用隨機亂數生成,3 個連線 URL(database / redis / cleanup)自動嵌入剛生的對應 password 組成 —— 開發者**不需手動組任何 URL**,dual-write 一致性由腳本保證。重跑時已存在的檔預設跳過(idempotent),`--force` 才全部重生。

**Why this priority**:這是本 feature 的核心價值與 MVP —— 在此之前每個 secret 要手動 `openssl rand`、URL 要手動拼接(dual-write 容易打錯造成連線認證失敗)。一鍵生成 + 自動 dual-write 直接消除這個易錯點,是整個 Phase 1 部署基建可重複落地的關鍵。優先級 P1。

**Independent Test**:`rm -f deploy/secrets/*.txt && bash deploy/generate-secrets.sh` → `ls deploy/secrets/*.txt | wc -l` = 7,且 grep 驗證 database_url 內嵌 password 段等於 postgres_password.txt 純值,即可獨立驗證價值。

**Acceptance Scenarios**:

1. **Given** `deploy/secrets/` 無任何 `.txt`,**When** 跑 `bash deploy/generate-secrets.sh`,**Then** 生成 7 個必須 secret `.txt`(jwt_secret / refresh_token_secret / postgres_password / redis_password / database_url / redis_url / cleanup_database_url),exit 0
2. **Given** secret 已生成,**When** 檢查 `database_url.txt` / `cleanup_database_url.txt`,**Then** 內嵌 password 段 ≡ `postgres_password.txt` 純值;`redis_url.txt` 內嵌 password ≡ `redis_password.txt` 純值(dual-write 不變式)
3. **Given** secret 已存在,**When** 不帶參數重跑腳本,**Then** 既有 `.txt` 值不變(idempotent skip)
4. **Given** secret 已存在,**When** 跑 `bash deploy/generate-secrets.sh --force`,**Then** 全部 secret 重生為新值,且 URL 連帶用新葉子值重組(dual-write 維持)
5. **Given** 腳本執行,**When** 觀察輸出,**Then** 只印生成摘要(哪些檔生成/跳過),**不**印任何 secret 值本體

---

### User Story 2 — secret 範本與文件齊備 (Priority: P2)

維運者 / 新進開發者打開 `deploy/secrets/`,看到 7 個必須 secret 的 `.txt.example` 範本(git-tracked),每個範本頂部都有註解說明用途、如何生成、以及(URL 類)dual-write 規則;另有一頁 `deploy/secrets/README.md` 列出完整 7 secret 清單、dual-write 不變式、與手動 fallback 指令。真實 `.txt`(含密碼)全部 gitignored、永不進版控。

**Why this priority**:範本 + 文件是 secret 機制的「自說明」介面 —— 讓任何人不需讀腳本就知道有哪些 secret、各自用途、怎麼正確生成。P2(P1 腳本能跑之後,文件齊備是第二層價值,也是團隊協作與災後重建的依據)。

**Independent Test**:`ls deploy/secrets/*.txt.example | wc -l` = 7 + 每個範本首行為註解(`^#`)+ `deploy/secrets/README.md` 存在且列出 7 secret + `git check-ignore` 驗 `.txt` ignored / `.txt.example` tracked,即可獨立驗。

**Acceptance Scenarios**:

1. **Given** 本 feature 落地,**When** `ls deploy/secrets/*.txt.example`,**Then** 7 個必須 secret 的範本齊備(含新增 database_url / redis_url / cleanup_database_url)
2. **Given** 範本齊備,**When** 檢查既有 postgres_password / redis_password 範本,**Then** 已 retrofit 成「註解(用途 + 生成方式 + dual-write 提醒)+ placeholder」豐富格式(對齊 jwt/refresh 範本風格)
3. **Given** 本 feature 落地,**When** 開 `deploy/secrets/README.md`,**Then** 列出 7 必須 secret 清單、dual-write 不變式、手動 fallback 指令
4. **Given** 生成真實 secret 後,**When** `git check-ignore deploy/secrets/postgres_password.txt`,**Then** 回傳路徑(ignored);`git check-ignore deploy/secrets/postgres_password.txt.example` exit 非 0(範本可 track)

---

### User Story 3 — DB 命名對齊 + stack 用新 secret 連線通 (Priority: P3)

維運者把 master compose 的 postgres user/db 命名對齊設計權威(`soybean` / `soybean_admin_rust`,取代 004 落地時暫用的 `rev2admin` / `rev2`),並用 `generate-secrets.sh` 生成的 secret 啟動 dev stack:`down -v` 清掉舊命名 init 的資料卷後重新 `up --wait`,postgres 以新 user/db 重新初始化、5 service 全 healthy、可用 `soybean` 帳號連進 `soybean_admin_rust` 資料庫。

**Why this priority**:命名對齊確保 `database_url` / `cleanup_database_url` 範本嵌的連線字串與 postgres 實際 init 的 user/db 一致(否則 Phase 2 接線時連不上)。這是 secret 機制與 004 compose 的整合收尾。P3(P1/P2 交付物本身可獨立驗,本故事是與既有 stack 的整合驗證)。

**Independent Test**:改 compose postgres `POSTGRES_USER`/`POSTGRES_DB` 為 soybean/soybean_admin_rust 後 `down -v` + `up --wait` → 5 service healthy + `psql -U soybean -d soybean_admin_rust -c '\conninfo'` 連線成功,即驗。

**Acceptance Scenarios**:

1. **Given** 本 feature 落地,**When** 檢查 `docker-compose.yml` postgres service,**Then** `POSTGRES_USER=soybean`、`POSTGRES_DB=soybean_admin_rust`、healthcheck `pg_isready -U soybean`(取代 rev2admin/rev2)
2. **Given** 舊命名資料卷存在,**When** `docker compose ... down -v` 後重 `up -d --wait`,**Then** exit 0、5 service 全 healthy(postgres 以 soybean/soybean_admin_rust 重 init)
3. **Given** dev stack running,**When** `docker compose ... exec postgres psql -U soybean -d soybean_admin_rust -c '\conninfo'`,**Then** 連線成功(新 user/db init 正確)
4. **Given** `database_url.txt` 已生成,**When** 比對其連線字串,**Then** user/db 段為 `soybean` / `soybean_admin_rust`,host `postgres:5432`,與 compose 實際 init 一致

---

### Edge Cases

- **既有部分 secret 存在、缺部分 URL**:idempotent 模式下腳本用既有葉子 `.txt` 值組缺少的 URL(維持 dual-write,不重生既有葉子)
- **`--force` 覆寫正在運行的 stack 用的 secret**:既有 stack 需重啟才會讀到新值;README 須警示此風險
- **host 無 openssl**:腳本需有 fallback(對齊 003 `generate-dev-cert.sh` 的 docker 化 alpine/openssl 模式),或在前置明示需 host 裝 openssl(見 Assumptions)
- **改 soybean 命名但資料卷已用舊命名 init**:postgres 偵測非空 data dir 會跳過 init,新 user/db 不生效 → 必須 `down -v` 清卷重 init;漏掉會導致 `psql -U soybean` 認證失敗
- **dual-write 在手動編輯時 drift**:若有人手改 `postgres_password.txt` 卻沒更新 `database_url.txt` → 連線認證失敗;緩解是「永遠用 `generate-secrets.sh` 重生而非手改」,README 明示

---

## Requirements *(mandatory)*

### Functional Requirements

**生成腳本**

- **FR-001**:系統 MUST 提供 `deploy/generate-secrets.sh`,zero-arg 一鍵生成全部 7 個必須 secret 的真實值檔到 `deploy/secrets/*.txt`
- **FR-002**:腳本 MUST 生成 4 個葉子 secret 用隨機亂數:`jwt_secret`(高強度,≥ 32 字元、過 001 loader 黑名單)、`refresh_token_secret`(同)、`postgres_password`、`redis_password`
- **FR-003**:腳本 MUST 自動組 3 個連線 URL secret,將剛生成的對應葉子 password **嵌入** URL,使 dual-write 一致性由腳本保證(人不手組):
  - `database_url` = `postgres://soybean:<postgres_password>@postgres:5432/soybean_admin_rust`
  - `redis_url` = `redis://:<redis_password>@redis-stack:6379`
  - `cleanup_database_url` = 暫與 `database_url` 同連線(最小權限 cleanup role 留 Phase 5)
- **FR-004**:腳本 MUST 為 idempotent — zero-arg 時跳過已存在的 `.txt`(不覆寫);若葉子已存在但 URL 缺,MUST 用既有葉子值組 URL(維持 dual-write)
- **FR-005**:腳本 MUST 支援 `--force` 旗標:全部重生(覆寫既有),且 URL 連帶用新葉子值重組
- **FR-006**:腳本 MUST 對生成的 `.txt` 設 `chmod 600`,且輸出**只**印生成摘要、**絕不**印 secret 值本體

**範本與文件**

- **FR-007**:系統 MUST 新增 3 個必須 secret 範本:`deploy/secrets/{database_url,redis_url,cleanup_database_url}.txt.example`(git-tracked)
- **FR-008**:新範本與 retrofit 後的範本 MUST 用統一「豐富格式」:頂部註解含(a)secret 用途、(b)以 `generate-secrets.sh` 生成的指引、(c)URL 類額外標註 dual-write 規則 + 一行 placeholder 值
- **FR-009**:系統 MUST 將既有 `deploy/secrets/{postgres_password,redis_password}.txt.example`(004 落地的極簡一行)retrofit 成 FR-008 豐富格式(只加註解,不改值語義)
- **FR-010**:系統 MUST 新增 `deploy/secrets/README.md`,列出完整 7 必須 secret 清單(用途 + 消費者 service)、dual-write 不變式、手動 fallback 指令、`--force` 風險警示
- **FR-011**:真實 secret `.txt` MUST gitignored、`.txt.example` 範本 MUST git-tracked(沿用既有 `.gitignore` 規則,**不**改 `.gitignore`)

**DB 命名對齊(連帶修 004)**

- **FR-012**:`docker-compose.yml` postgres service MUST 改用 `POSTGRES_USER=soybean`、`POSTGRES_DB=soybean_admin_rust`(對齊 DESIGN §8.4 權威,取代 004 暫用的 rev2admin/rev2),healthcheck `pg_isready -U soybean` 同步改
- **FR-013**:`database_url` / `cleanup_database_url` 範本與生成值的 user/db 段 MUST 與 FR-012 的 postgres init 命名一致
- **FR-014**:落地文件 MUST 明示改命名後需 `docker compose ... down -v` 清資料卷,讓 postgres 以新 user/db 重 init

**dual-write 不變式**

- **FR-015**:`database_url` 與 `cleanup_database_url` 內嵌的 password 段 MUST 恆等於 `postgres_password.txt` 純值;`redis_url` 內嵌 password MUST 恆等於 `redis_password.txt` 純值

**scope 邊界 / 不做的事**

- **FR-016**:系統 MUST **不**把 3 個 URL secret 接進 compose(`secrets:` 掛載或 service `APP_*_FILE` env)— rust-api / migration / cleanup-job 現未消費 DATABASE_URL/REDIS_URL,接線留 Phase 2
- **FR-017**:系統 MUST **不**新增 obs 可選 secret(`acme_email` / `grafana_admin_password` / `postgres_exporter_dsn` / `redis_exporter_password`)— 留 Phase 5/6 obs 啟用時
- **FR-018**:系統 MUST **不**動 `base-web/` `rust-api/` worktree source、001/002 `deploy/Dockerfile.{base-web,rust-api}.txt`、`server/src/config.rs`(loader 已是 001 成品)、jwt/refresh 既有範本「值」語義

### Key Entities *(include if feature involves data)*

- **必須 secret(7)**:4 葉子(`jwt_secret` / `refresh_token_secret` / `postgres_password` / `redis_password`)+ 3 連線 URL(`database_url` / `redis_url` / `cleanup_database_url`);葉子為隨機值、URL 為組合值(嵌葉子 password)
- **`generate-secrets.sh`**:一鍵生成腳本,zero-arg(idempotent)/ `--force`(重生);保證 dual-write
- **secret 範本(`.txt.example`)**:git-tracked,豐富格式自說明;對應每個必須 secret
- **`deploy/secrets/README.md`**:secret 清單 + dual-write 不變式 + 手動 fallback + `--force` 風險
- **dual-write 不變式**:URL secret 內嵌 password ≡ 對應葉子 secret 純值

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:開發者跑 `bash deploy/generate-secrets.sh` 一次,7 個必須 secret `.txt` 全部生成、exit 0(無需任何手動 `openssl` 或 URL 拼接)
- **SC-002**:dual-write 100% 一致 — `database_url.txt` 與 `cleanup_database_url.txt` 內嵌 password = `postgres_password.txt`;`redis_url.txt` 內嵌 password = `redis_password.txt`
- **SC-003**:重跑腳本(無參數)既有 secret 值 0 變動(idempotent);`--force` 後全部 secret 值改變
- **SC-004**:真實 `.txt` 100% 被 git ignore、`.txt.example` 範本 100% 可 track(`git check-ignore` 驗)
- **SC-005**:7 個必須 secret 的 `.txt.example` 範本齊備,每個首行為註解;`deploy/secrets/README.md` 列出全 7 secret
- **SC-006**:postgres 改 soybean/soybean_admin_rust 命名後,`down -v` + `up --wait` 5 service 全 healthy,且 `psql -U soybean -d soybean_admin_rust` 連線成功
- **SC-007**:生成的 `jwt_secret` / `refresh_token_secret` 長度 ≥ 32 字元且非黑名單值(過 001 `config.rs` loader 驗證)

---

## Assumptions

- **host 環境**:開發者本機有 `openssl`;若無,`generate-secrets.sh` 沿用 003 `generate-dev-cert.sh` 的 docker 化 fallback(`docker run --rm` alpine/openssl)生成亂數 —— 具體採 host-or-docker 哪種由 plan/clarify 階段定(預設沿用 003 hybrid 模式)
- **DB 連線層 Phase 2 才實作**:`database_url` / `redis_url` / `cleanup_database_url` 目前無 code 消費者(grep 證實 `config.rs` 只 load `APP_JWT_*`);本 feature 為「provision ahead」,Phase 2 才掛 compose secret + 設 `APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE` env + code 讀取
- **README provision-ahead 提示**:README 預設列出 Phase 2 預期的 `_FILE` env 名(`APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE`)作為前瞻提示(最終呈現由 plan 階段定)
- **004 compose 已落**:postgres `POSTGRES_PASSWORD_FILE` + redis command `--requirepass $(cat /run/secrets/redis_password)` 機制已就緒;本 feature 只改 postgres user/db 命名 + retrofit 範本格式
- **dev 無真實資料**:postgres 資料卷目前只有 postgres 自身 init(migration 尚未跑),`down -v` 重置零資料損失風險
- **`.gitignore` 規則已存在**:`deploy/secrets/*.txt` ignore + `!*.txt.example` 豁免(004/001 既有),本 feature 不改 `.gitignore`
- **無 unit test**:本 feature 為 shell 腳本 + 範本 + 文件,無新純函式邏輯;驗收由 C-V acceptance command 覆蓋(對齊 CLAUDE.md §3 紀律)

### 不在 scope

URL secret 接進 compose service(Phase 2);obs 可選 4 secret(Phase 5/6);cleanup-job 最小權限 role(Phase 5);rust-api `config.rs` 加 `[database]`/`[redis]` section(Phase 2);真實 migration / db schema(Phase 2);改動 base-web/rust-api worktree 或 001/002 Dockerfile。
