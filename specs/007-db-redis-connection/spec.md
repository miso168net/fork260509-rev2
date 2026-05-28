# Feature Specification: db-redis-connection

**Feature Branch**: `007-db-redis-connection`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "用這份文檔 docs/superpowers/007-db-redis-connection.md"（rust-api Postgres + Redis 連線層基礎 + AppState + proof migration: sys_user + 3 帳號 seed）

**Phase 0 brainstorm source**: [`docs/superpowers/007-db-redis-connection.md`](../../docs/superpowers/007-db-redis-connection.md)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rust-api 連得上 Postgres + Redis（連線層基礎，Priority: P1）🎯 MVP

維運者啟動 rev2 dev stack 後，rust-api 於 boot 時成功建立並驗證 Postgres 與 Redis 連線；連線握在共享應用狀態（AppState）供後續業務取用。任一連線建立失敗，rust-api 快速失敗（fail-fast）、非零退出並留下可診斷的 log，而非以半殘狀態啟動。

**Why this priority**：這是本 feature 的核心價值與 MVP —— Phase 2 後續所有 feature（soft-delete entity、envelope、audit-log）都依賴一個「已驗證可用」的 DB/Redis 連線。沒有連線層，後面什麼都做不了。fail-fast 確保「rust-api 起來了」等同「連線是好的」，避免 runtime 才爆。

**Independent Test**：dev stack `up -d --wait` → rust-api 變 healthy（連線成功才會 serve `/health`）、log 顯示 Postgres + Redis connected；故意給錯 URL → rust-api 非零退出、log 指出連線失敗，即驗。

**Acceptance Scenarios**：

1. **Given** dev stack（postgres / redis-stack healthy）+ 正確的 `database_url`/`redis_url` secret，**When** rust-api 容器啟動，**Then** rust-api 成功建立 Postgres + Redis 連線、serve `/health` 回 `ok`、5 service 全 healthy
2. **Given** rust-api 啟動完成，**When** 檢查啟動 log，**Then** 可見 Postgres 連線成功與 Redis 連線成功的明確記錄（fail-fast 未觸發）
3. **Given** 一個無法連線的 DB/Redis URL（錯 host / 錯密碼），**When** rust-api 啟動，**Then** rust-api 非零退出、log 指出是 DB 或 Redis 連線失敗（不以半殘狀態 serve）

---

### User Story 2 — migration pipeline 端到端可跑（proof: sys_user + seed，Priority: P2）

開發者執行 migration 後，`sys_user` 表被建立並 seed 3 個預設帳號（`Soybean` / `Administrator` / `GeneralUser`）。這證明 sea-orm-migration runner 從原本的 stub 變成真正可跑的 pipeline，Phase 2+ 的 entity migration 有了可複製的基礎。migration 可重複執行而不重複插入（冪等）。

**Why this priority**：migration pipeline 是 Phase 2+ 所有 schema 工作的載體。用 `sys_user` + seed 當 proof 一次驗證「建表 + seed 資料」兩件事都通；且 `sys_user` 是 Phase 3 login 馬上要用的表。P2（連線層通了之後，證明 schema pipeline 是第二層基礎）。

**Independent Test**：跑 migration → `psql -U soybean -d soybean_admin_rust -c 'SELECT count(*) FROM sys_user'` = 3；再跑一次 migration → 仍 = 3（冪等、未重複 seed），即驗。

**Acceptance Scenarios**：

1. **Given** Postgres 可連、migration 尚未跑，**When** 執行 migration，**Then** `sys_user` 表存在且含 3 筆預設帳號（plaintext 密碼 `123456` 的 argon2id hash）
2. **Given** migration 已跑過一次，**When** 再次執行 migration，**Then** 不重複建表、不重複 seed（`sys_user` 仍 3 筆），exit 0
3. **Given** migration 已套用，**When** 查 migration 追蹤狀態，**Then** 該 migration 標記為已套用

---

### User Story 3 — 連線設定走 005 secret + 既有 secret 機制（Priority: P3）

連線 URL（Postgres / Redis）由 005 已 provision 的 `database_url` / `redis_url` secret 經檔案掛載（`_FILE` 機制）注入 rust-api，沿用既有的 secret 載入與驗證機制；compose 接上這 2 個 secret；設定檔僅放非機密的連線池參數，不含明文密碼。dev 與 prod 共用同一組 URL secret（內嵌 host 為 internal service 名）。

**Why this priority**：確保連線機密走既有、已驗證的 secret 路徑（無明文洩漏、與 jwt/refresh secret 同機制），且不重造輪子。P3（連線能通是 P1、用對機密管道是收尾的正確性保證）。

**Independent Test**：`grep` 設定檔無明文密碼；compose `rust-api` service 有掛 `database_url`/`redis_url` secret + `APP_DATABASE_URL_FILE`/`APP_REDIS_URL_FILE` env；config 反序列化 + secret 載入單元測試通過，即驗。

**Acceptance Scenarios**：

1. **Given** 本 feature 落地，**When** 檢查 rust-api 設定檔與 compose，**Then** 連線 URL 走 `_FILE` secret（無明文密碼寫死於設定檔或 compose）
2. **Given** compose 設定，**When** 檢查 `rust-api` service，**Then** 掛載 `database_url`/`redis_url` 兩個 secret 並設 `APP_DATABASE_URL_FILE`/`APP_REDIS_URL_FILE` env
3. **Given** 連線設定載入,**When** 跑 config 反序列化 + URL secret 載入單元測試,**Then** 通過（`_FILE` 優先於 envvar、驗證通過）

---

### Edge Cases

- **postgres/redis 尚未 healthy rust-api 就起**：compose `depends_on: condition: service_healthy` 確保依賴先起；連線層的 ping 再做 app 層驗證（雙保險）。
- **URL secret 缺失 / 為 placeholder**：既有 secret loader 會拒絕（neither set / placeholder / 長度），rust-api fail-fast 退出。
- **migration 對空 DB vs 已有 sys_user**：冪等——migration 追蹤表跳過已套用；seed 用 conflict-safe 寫法不重複插入。
- **連線中途斷線（runtime）**：本 feature 只負責 boot 時建立 + 驗證連線；runtime 斷線重連由連線管理機制（pool / ConnectionManager）處理，per-request readiness 探測不在本 feature 範圍。

---

## Requirements *(mandatory)*

### Functional Requirements

**連線層**

- **FR-001**：rust-api MUST 於 boot 時建立 Postgres 連線（連線池），並以一次輕量查詢（如 `SELECT 1`）驗證可達後才繼續啟動
- **FR-002**：rust-api MUST 於 boot 時建立 Redis 連線，並以 PING 驗證可達後才繼續啟動
- **FR-003**：已建立的 Postgres 連線與 Redis 連線 MUST 握在共享應用狀態（AppState），供後續 handler / 業務模組取用
- **FR-004**：任一連線（DB 或 Redis）建立或驗證失敗時，rust-api MUST fail-fast —— 非零退出 + log 指出失敗來源（DB 或 Redis），不以半殘狀態 serve
- **FR-005**：`/health` endpoint MUST 維持 liveness 語義（純回 `ok`），不在本 feature 改為每請求探測 DB/Redis 的 readiness

**設定與機密**

- **FR-006**：連線設定 MUST 分離為「非機密參數」（連線池大小 / timeout 等，放設定檔）與「機密 URL」（`APP_DATABASE_URL` / `APP_REDIS_URL`，走既有 `_FILE`>envvar secret loader + 驗證）
- **FR-007**：連線 URL MUST 來自 005 已 provision 的 `database_url` / `redis_url` secret；rust-api 設定檔與 compose MUST NOT 含明文密碼
- **FR-008**：`docker-compose.yml`（master）MUST 將 `database_url` / `redis_url` 掛入 `rust-api` service（secret 檔 + `APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE` env）；dev 模式 MUST 能用同一組 URL secret（內嵌 host = internal service 名 `postgres` / `redis-stack`）

**Migration pipeline**

- **FR-009**：`migration` crate MUST 從 stub 變成可執行的 schema migration runner，且 server 與 migration MUST 維持獨立 binary（server 不自動跑 migration）
- **FR-010**：MUST 提供 1 個 proof migration 建立 `sys_user` 表並 seed 3 個預設帳號（`Soybean` / `Administrator` / `GeneralUser`，共用 plaintext `123456` 的 argon2id hash）
- **FR-011**：migration MUST 冪等 —— 重複執行不重複建表、不重複 seed（exit 0、資料筆數不變）

**scope 邊界 / 不做的事**

- **FR-012**：MUST NOT 建立 `sys_user` 以外的 entity 表（7 業務 / `sys_tokens` / `casbin_rule` / `sys_operation_log` 留對應 feature）；MUST NOT 實作 Casbin sea-orm-adapter（留 sub-crate setup）；MUST NOT 接線 `cleanup_database_url` 或建最小權限 cleanup role（留 Phase 5 cleanup-job）；MUST NOT 實作任何業務 endpoint；MUST NOT 改動 JWT 機密管理（001 已做）

### Key Entities *(include if feature involves data)*

- **連線設定（DatabaseConfig / RedisConfig）**：非機密連線參數（pool 大小、connect timeout 等）+ 機密 URL（經 secret 注入）；對應設定檔新增的 `database` / `redis` section
- **AppState**：boot 後持有的共享連線握把（Postgres 連線池 + Redis 連線管理器）；cheap-clone，供 handler 取用
- **sys_user（proof 表）**：使用者帳號表，本 feature 只建表 + seed 3 預設帳號；確切欄位由 plan 階段 research 對齊真實來源（見 Assumptions）

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack `up -d --wait` 後，rust-api 容器達 healthy 狀態（= 連線層建立成功才會 serve），5 service 全 healthy
- **SC-002**：rust-api 啟動 log 可見 Postgres + Redis 連線成功的明確記錄；給定錯誤連線設定時 rust-api 非零退出且 log 指出失敗來源
- **SC-003**：執行 migration 後 `sys_user` 表存在且恰含 3 筆預設帳號；重複執行 migration 後筆數仍為 3（冪等）
- **SC-004**：rust-api 設定檔與 compose `grep` 不到明文連線密碼；`rust-api` service 有掛 `database_url`/`redis_url` secret + `APP_*_URL_FILE` env
- **SC-005**：連線設定的 config 反序列化 + URL secret 載入有單元測試覆蓋並通過

---

## Assumptions

- **005 secret 已可用**：`database_url` / `redis_url` secret 由 `deploy/generate-secrets.sh` 產生（dual-write 保證內嵌密碼 ≡ leaf）；本 feature 不重新設計 secret 生成。
- **依賴順序由 compose 保證**：postgres / redis-stack 透過 `depends_on: condition: service_healthy` 先於 rust-api 起；連線層的 ping 為 app 層雙保險。
- **`sys_user` schema 與 seed hash 由 plan 階段 research 對齊真實來源**：CLAUDE.md §8.1 引用 `rust-api/migration/src/datas/m20241024_033005_insert_sys_user.rs`，但該檔不在當前 rust-api worktree（migration 僅 stub）。plan Phase 0 research MUST grep 定位真實 schema（upstream / rev1 來源）或設計欄位後自生 argon2id hash，**不可盲拷 rev1 code**（Constitution §I.5）。本 spec 僅定 scope（建表 + seed 3 帳號）。
- **dev/prod 共用 URL secret**：URL 內嵌 host 為 internal service 名（`postgres` / `redis-stack`），dev 與 prod 連同一組（005 已如此設計）。
- **無單元測試於連線本身**：連線建立 / migration 需真 DB/Redis，由 acceptance（C-V）覆蓋；可單測者為 config 反序列化 + secret 載入（對齊 CLAUDE.md §3 + 003/004/005 慣例）。

### 不在 scope

其餘 entity 表（soft-delete #2 + 業務 feature）；Casbin sea-orm-adapter / axum-casbin 重寫（sub-crate setup #5）；`cleanup_database_url` 接線 + 最小權限 cleanup role（Phase 5 cleanup-job）；`/health` readiness 化（日後獨立 feature）；JWT 機密管理改動（001 已做）；任何業務 endpoint（Phase 3+）。
