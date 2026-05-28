# Phase 0 Research: secret-injection

> 9 個 research 主題,全為既有 code / 既有檔 ground truth grep + best-practice 確認。
> 本 feature 純 secret tooling(shell 腳本 + 範本 + docs),不涉 wire endpoint / rust service trait / DTO;依 [CLAUDE.md §3](../../CLAUDE.md) 紀律改以「既有 config.rs loader / 003 script / 004 compose ground truth grep」為依據。
> **§I.5 紀律遵守**:research **未** grep rev1 source;所有 grep 針對 rev2 現有產物(001 config.rs / 003 script / 004 compose),非 rev1。

---

## R1 — rust-api `_FILE` secret loader 契約(001 既有)

**Decision**:生成的 secret 名 + 值須對齊 `server/src/config.rs` 既有 loader 契約;本 feature **不**改 config.rs。

**Ground truth**（`rust-api/server/src/config.rs`）:
- `load_secret(key)`(L80-96):`<KEY>_FILE` envvar 優先於 `<KEY>`;讀檔後 `.trim()`;兩者皆無 → `bail!("neither {key} nor {file_key} set")`
- `validate_secret(key, value)`(L99-113):順序 empty → placeholder → length;**placeholder 黑名單**(L19-26,case-insensitive **相等**比對,非 substring):`change-me` / `changeme` / `secret` / `xxx` / `<TO_BE_SET>` / `TODO`;**length < 32 → reject**
- 實際讀取(L129-130):`APP_JWT_JWT_SECRET` / `APP_JWT_REFRESH_TOKEN_SECRET`(各 `_FILE` 後綴)

**Rationale**:本 feature 生的 jwt/refresh 值必須過此驗證。

**Alternatives considered**:改 config.rs 接更多 secret — 否決(DB 連線層是 Phase 2;FR-018 凍結 config.rs)。

---

## R2 — jwt/refresh 生成強度(過 001 validate_secret)

**Decision**:jwt_secret / refresh_token_secret = `openssl rand -base64 48`。

**Decision(postgres/redis,implementation 偏離)**:postgres_password / redis_password 改用 `openssl rand -hex 24`(原訂 `rand -base64 24`)。

**Rationale**:`rand -base64 48`(48 bytes)→ 64 字元 base64 字串,遠超 length ≥ 32 門檻;隨機值不可能 case-insensitive 等於 6 個黑名單 placeholder;非空。三項驗證全過。

> **[implementation 偏離 · 2026-05-28 · executing-plans 階段 code review 發現,user 拍板]**:postgres/redis password 從 `rand -base64 24` 改為 `rand -hex 24`(48 hex 字元)。原因:base64 字母表含 `+` `/` `=`,這兩個 password 會被嵌入 `database_url` / `redis_url`,Phase 2 用 sqlx 解析 URL 時 `/` 會被當路徑分隔、`+` 被當空白,致連線認證失敗。hex(`0-9a-f`)全 URL-safe、熵與 base64 24 相同(皆 24 bytes 隨機源)、長度 48 仍過 `validate_secret` len ≥ 32。jwt/refresh 不進 URL、維持 `rand -base64 48` 不變。

**Alternatives considered**:URL-safe base64(`tr '+/' '-_' | tr -d '='`)— 可行但多一層轉換、字元集較雜;Phase 2 才 percent-encode — 把已知隱患推遲、provision-ahead 失去意義。hex 最簡且 host-independent(docker openssl 內建)。

---

## R3 — openssl 來源(host vs docker 化)

**Decision**:**docker 化** — `docker run --rm alpine/openssl rand -base64 N`(host 只需 docker,無 host openssl dep);沿用 003 `generate-dev-cert.sh` 既定模式。

**Rationale**:003 已確立全 docker 化 openssl 的 host-independent 模式(`OPENSSL_IMG="alpine/openssl:latest"` + `docker run --rm -i -v ... -w ...`),rev2 哲學是 host 不裝工具(對齊 000/001/002/003)。generate-secrets.sh 只需 `openssl rand`,比 003 的 cert 簽發更簡單。**解決 spec Clarifications 的 deferred 項**。

**Ground truth**(`deploy/generate-dev-cert.sh` L47-53):`docker pull -q "$OPENSSL_IMG"` + `run_openssl(){ docker run --rm -i -v "$CERT_DIR:/certs" -w /certs "$OPENSSL_IMG" "$@"; }`。

**Alternatives considered**:假設 host 有 openssl — 否決(違反 host-independent 哲學 + 與 003 不一致)。

---

## R4 — 004 postgres env 實際值 + rename 目標

**Decision**:`docker-compose.yml` postgres `POSTGRES_USER` / `POSTGRES_DB` 從 `rev2admin` / `rev2` 改為 `soybean` / `soybean_admin_rust`(對齊 [DESIGN §8.4](../../docs/INTEGRATION-DESIGN.md) 權威);healthcheck `pg_isready -U` 同步。

**Ground truth**(`docker-compose.yml`):
- L69-71:`POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password` / `POSTGRES_USER: rev2admin` / `POSTGRES_DB: rev2`
- L77:`test: ["CMD-SHELL", "pg_isready -U rev2admin"]`

**Rationale**:004 落地時 user/db 名是 brief 臨時定的、偏離 DESIGN §8.4;`database_url` 範本須嵌與 postgres 實際 init 一致的 user/db。grep 證實 rust-api/migration/cleanup 程式碼**無**寫死此名(改名零 code 風險)。

**Alternatives considered**:保留 rev2admin/rev2 + 改 DESIGN — 否決(brainstorm Q2 user 拍板對齊 DESIGN 權威)。

---

## R5 — redis-stack requirepass + redis_url 形式

**Decision**:`redis_url` = `redis://:<redis_password>@redis-stack:6379`(無 username,password 在冒號後)。

**Ground truth**(`docker-compose.yml` L85-90):`image: redis/redis-stack-server:latest` + `command: ... 'redis-stack-server --requirepass "$(cat /run/secrets/redis_password)"'`;service 名 `redis-stack`、container 內 port `6379`。

**Rationale**:redis requirepass(無 ACL user)的標準 URL 形式為 `redis://:<password>@host:port`;host = compose service 名 `redis-stack`、port `6379`(internal)。

**Alternatives considered**:`redis://default:<pw>@...`(ACL default user 形式)— redis requirepass 模式下 `:` 後直接 password 更標準;`rediss://`(TLS)— 否決(internal network 無 TLS)。

---

## R6 — dual-write 機制(腳本同次組出)

**Decision**:`generate-secrets.sh` 在**同一次執行**內先生葉子 password(`postgres_password` / `redis_password`),再 `$(cat)` 該葉子值組 URL secret → dual-write 由「同次同源」保證、結構上不可能 drift。

**Rationale**:dual-write drift 的根因是「URL 與葉子分兩次手動產生」;腳本同次組出消除此根因。idempotent 模式下若葉子已存在但 URL 缺,用既有葉子值組(仍同源)。

**Alternatives considered**:URL 不存純值、runtime 由 entrypoint `$(cat password)` 組 — 否決(DB 連線層 Phase 2 才有 entrypoint 邏輯;本 feature provision 靜態檔);docs 教人手組 — 否決(brainstorm Q3 拍板腳本自動保證)。

---

## R7 — gitignore secret 規則(既有,不改)

**Decision**:**不**改 `.gitignore`;沿用既有規則。

**Ground truth**(`.gitignore` L68-69):`/deploy/secrets/*.txt`(ignored)+ `!/deploy/secrets/*.txt.example`(豁免)。另 L70-71 有 `*.json` 規則(obs redis_exporter 用,Phase 6)。

**Rationale**:3 個新 URL secret 的 `.txt` 自動被 `*.txt` ignore、`.txt.example` 自動被豁免 track。零 `.gitignore` 改動。

---

## R8 — cleanup_database_url(最小權限留 Phase 5)

**Decision**:`cleanup_database_url` 暫與 `database_url` 同連線值(同 soybean 帳號);範本與 README 註解標明「最小權限 cleanup role 留 Phase 5 cleanup-job feature」。

**Rationale**:最小權限 DB role 需先有 migration 建 role + grant(Phase 2/5),現階段無此 role;先 provision 一個可用的連線值(= database_url),Phase 5 cleanup-job feature 再建專用 role + 改此 secret 值。

**Alternatives considered**:現在就建 least-priv role — 否決(超出本 feature scope,需 migration 支援、屬 Phase 5)。

---

## R9 — postgres rename 需 `down -v` 重 init

**Decision**:改 `POSTGRES_USER`/`POSTGRES_DB` 後須清 `rev2_postgres_data` named volume,postgres 才會以新 user/db 重 init。

> **[implementation 偏離 · 2026-05-28]**:本 R9 原以 `down -v` 為清卷手段,實作改為 `down --remove-orphans` + `docker volume rm rev2_postgres_data`(只清 postgres 卷)。原因:`down -v` 會連 rust-api cargo / base-web node_modules build 快取一起清,致冷重建超 healthcheck 視窗 `up --wait` 假性失敗。R9 核心結論(postgres data dir 須為空才重 init)不變,僅精準化清卷範圍。見 [plan §Implementation Deviations](./plan.md)。

**Rationale**:postgres 官方 image 只在 data dir **為空**時跑 init(建 user/db);既有 `rev2_postgres_data`(004 acceptance 用 rev2admin/rev2 init 過)非空 → 改 env 不重 init、`psql -U soybean` 會認證失敗。dev 無真實資料(migration 尚未跑),`down -v` 重置零損失。

**Ground truth**:postgres:17-alpine 官方 entrypoint 行為(data dir 非空跳 initdb)。spec Edge Cases 已列此風險。

**Alternatives considered**:`ALTER USER/DATABASE RENAME` 線上改名 — 否決(複雜、dev 無資料、`down -v` 更乾淨)。

---

## 總結

9 主題全 confirmed,無 NEEDS CLARIFICATION 遺留(spec Clarifications 的 openssl deferred 項由 R3 解決 = docker 化)。關鍵 implementation 注意點:
1. **jwt/refresh 用 `rand -base64 48`**(過 001 validate:len≥32 + 非黑名單,R1/R2)
2. **openssl docker 化**(alpine/openssl,host-independent,沿用 003,R3)
3. **postgres 改 soybean/soybean_admin_rust + `down -v` 重 init**(R4/R9)
4. **redis_url = `redis://:<pw>@redis-stack:6379`**(R5)
5. **dual-write 同次同源組出**(R6)
6. **不改 .gitignore / config.rs**(R7/FR-018)
