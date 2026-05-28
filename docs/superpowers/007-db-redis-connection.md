# 007-db-redis-connection — Phase 0 brainstorm（spec-design）

**Feature**：`007-db-redis-connection`（rust-api Postgres + Redis 連線層基礎 + proof migration）
**日期**：2026-05-29
**狀態**：Phase 0 brainstorm 定案；待手動 `/speckit-specify` 起 SDD 設計鏈
**來源**：CHECKLIST §1 下一步（Phase 2 P1 基礎設施起點）；005 已 provision `database_url`/`redis_url` secret（範本明寫「供 rust-api 讀取(Phase 2 wired)」），007 把連線接起來。DESIGN §10 Phase 2 的 5 feature（JWT/soft-delete/envelope/audit-log/sub-crate-setup）全依賴可用的 DB 連線 + migration pipeline，007 為其前置基石。

---

## 1. 問題陳述

rust-api 目前是 001 落地的極簡 bootstrap：`server/`（`config.rs` + `main.rs`，axum `/health` + `_FILE` secret loader）、`migration/`（stub `main.rs`）、**完全無 sea-orm/redis/sqlx 任何 DB dependency**。`application.yaml` 只有 `server`/`jwt`/`logging` section。

005 已備好 3 個連線 URL secret（`database_url` / `redis_url` / `cleanup_database_url`，dual-write 保證內嵌密碼 ≡ leaf），但 compose 還沒掛、rust-api 也沒讀。Phase 2 後續 feature（soft-delete entity、envelope、audit-log）全要先有可用的 DB 連線 + 可跑的 migration pipeline。

**目標**：rust-api boot 時建立並驗證 Postgres（sea-orm）+ Redis 連線池、握在共享 AppState；migration crate 變成真正可跑的 sea-orm-migration runner，附 1 個 proof migration（sys_user + 3 帳號 seed）端到端證明 pipeline；compose 接上 005 的 2 個 URL secret。為 Phase 3+ 業務 feature 設好乾淨的連線基礎。

---

## 2. 設計決策（brainstorm 拍板）

| # | 決策點 | 選擇 | 理由 |
|---|---|---|---|
| D1 | feature 範圍邊界 | **連線層 + 1 個 proof migration** | 連線基礎 + migration pipeline 端到端跑通；entity 表留 soft-delete(#2)、Casbin adapter 留 sub-crate setup(#5)，避免跨 feature 重疊 |
| D2 | proof migration 建哪表 | **sys_user + 3 預設帳號 seed** | 同時證明 migration + 資料 seed；Phase 3 login 馬上要用。soft-delete(#2) 之後 ALTER 加軟刪欄為 additive migration、正常演進、不衝突 |
| D3 | 連線層基礎結構 | **完整連線層 + AppState 基礎** | sea-orm pool + redis ConnectionManager 包進 AppState，Phase 3 login 可直接取用；boot fail-fast 驗證；/health 維持 liveness（純 ok），readiness 留日後獨立 feature |
| D4 | URL secret 載入 | **沿用現有 `load_secret`（`_FILE`>envvar + validate）** | `APP_DATABASE_URL` / `APP_REDIS_URL` 走同一 loader；URL >32 字、非 placeholder，通過既有 `validate_secret`（length≥32 對 URL 是無害冗餘檢查） |
| D5 | server 是否自動 migrate | **否，migration 為獨立 binary** | 沿用 001 的 3 binary 分離（server / migration / cleanup-job）；migration 由 `compose run rust-api migration` 顯式跑 |

---

## 3. 元件 / 架構（各有單一職責）

| 元件 | 職責 | 依賴 |
|---|---|---|
| `server/src/config.rs` | 加 `DatabaseConfig`{url(secret), max_connections, connect_timeout_secs} + `RedisConfig`{url(secret), ...}；application.yaml 放非密 pool 參數、URL 走 `load_secret` | 既有 loader |
| `server/src/infra/db.rs`（新） | `connect_postgres(cfg) -> Result<DatabaseConnection>`：sea-orm connect + pool opts + `SELECT 1` ping | sea-orm |
| `server/src/infra/redis.rs`（新） | `connect_redis(cfg) -> Result<ConnectionManager>`：redis ConnectionManager + PING | redis crate |
| `server/src/state.rs`（新） | `AppState{ db, redis }`（cheap-clone，axum `.with_state`） | 上兩者 |
| `server/src/main.rs` | boot 序：load config → connect_postgres（fail-fast）→ connect_redis（fail-fast）→ AppState → serve；/health 維持純 `ok` | 上述 |
| `migration/`（stub→真 runner） | `lib.rs` 出 `Migrator`；`m<ts>_create_sys_user.rs` 建表 + seed 3 帳號；`main.rs` 跑 CLI（`Migrator::up`） | sea-orm-migration |
| `Cargo.toml`（workspace/server/migration） | 加 sea-orm（postgres, runtime-tokio-rustls, macros）、sea-orm-migration、redis（tokio-comp, connection-manager） | — |
| `docker-compose.yml`(master) + dev override | top-level `secrets:` 加 `database_url`/`redis_url`；rust-api service 掛 secret + `APP_DATABASE_URL_FILE`/`APP_REDIS_URL_FILE` env | 005 secret 範本 |

> **redis client 選型**：用 `redis` crate 的 `ConnectionManager`（multiplexed、自動重連），v1 只需 connect + PING；不引 deadpool-redis/fred（YAGNI）。
> **dev 連線**：dev rust-api 連 `postgres:5432` / `redis-stack:6379`（internal network），與 URL secret 內嵌的 host 一致，dev/prod 同一組 URL secret 可用。

---

## 4. 資料流

```
boot:
  compose secret 檔(/run/secrets/database_url, /run/secrets/redis_url)
    → APP_DATABASE_URL_FILE / APP_REDIS_URL_FILE env
    → load_secret → DatabaseConfig.url / RedisConfig.url
    → connect_postgres(SELECT 1) / connect_redis(PING)
    → AppState{db, redis}
    → axum serve(/health = ok)

migration:
  compose run rust-api migration → Migrator::up → 建 sys_user + seed 3 帳號
```

---

## 5. 錯誤處理

- **boot fail-fast**：config load / DB connect+ping / Redis connect+ping 任一失敗 → log error + 非零退出（沿用現有 `main.rs` `.expect()` 風格）。compose `depends_on: condition: service_healthy` 確保 postgres/redis 先起，連線層的 ping 再驗 app 層可達 + 帳密正確。
- **migration 冪等**：sea-orm `seaql_migrations` 表追蹤已套用 migration，re-run 自動跳過；seed 用 `ON CONFLICT DO NOTHING`（或等效），重跑無害、不重複插入。

---

## 6. ⚠️ 已知 research 項（留給 /speckit-plan Phase 0）

**`sys_user` 確切欄位 + argon2id hash（plaintext `123456`）須 research 抓真值**：

- CLAUDE.md §8.1 引用 `rust-api/migration/src/datas/m20241024_033005_insert_sys_user.rs`，但**該檔不在現在的 rust-api worktree**（`migration/src/` 只有 stub `main.rs`）。
- plan 階段 Phase 0 research **必須** grep 定位真實 sys_user schema（upstream soybean-admin-rust 或 rev1 來源），或設計欄位後自生 argon2id hash。
- **不可盲拷 rev1 code**（Constitution §I.5）—— research 只 grep 對照真實命名 / schema，implementer act on actual code。
- brainstorm 僅定 scope：建 `sys_user` + seed 3 帳號（`Soybean`/`Administrator`/`GeneralUser`，共用 argon2id hash、plaintext `123456`，對齊 §8.1 / DESIGN §4.6.5）。

---

## 7. 驗收（C-V contract）

對齊 CLAUDE.md §3：有可獨立測的純函式 → test-first；wiring 類由 acceptance 覆蓋，plan/tasks 須明示。

**可單元測試（test-first）**：
- `DatabaseConfig` / `RedisConfig` 反序列化 + URL secret load（`_FILE`>envvar、validate 通過）。

**Acceptance（C-V，需真 DB/Redis）**：
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm rust-api migration` → exit 0。
- `psql -U soybean -d soybean_admin_rust -c 'SELECT count(*) FROM sys_user'` = 3。
- rust-api boot → `/health` 回 `ok`；log 顯示 Postgres + Redis connected（fail-fast 未觸發 = 連線成功）。
- dev stack `up -d --wait` 5 service 仍 healthy（007 加 DB 連線後 rust-api 仍正常起）。

> 大部分為 wiring（連線建立、compose 接線）→ 主要 acceptance 覆蓋；config 反序列化為可單測單元。tasks/plan 須明示「連線/migration 由 acceptance 覆蓋、config 反序列化單測」及理由。

---

## 8. 範圍外（不做）

- ❌ 業務 endpoint（Phase 3+）
- ❌ 其餘 entity 表（7 業務 / sys_tokens / casbin_rule / sys_operation_log）—— 留 soft-delete(#2) + 對應 feature
- ❌ Casbin sea-orm-adapter / axum-casbin 重寫 —— 留 sub-crate setup(#5)
- ❌ `cleanup_database_url` 接線 + 最小權限 cleanup role —— 留 Phase 5 cleanup-job
- ❌ `/health` 改 readiness（每請求 ping DB/Redis）—— 維持 liveness，readiness 留日後獨立 feature
- ❌ JWT 機密管理改動 —— 001 已實作 `_FILE` loader + strict validation + jwt/refresh 分離

---

## 9. 交棒

brainstorm 定案 → 手動 `/speckit-specify`（input = 本檔）起 `007-db-redis-connection` feature branch（`before_specify` pre-hook 自動建）→ `/speckit-clarify` → `/speckit-plan`（Phase 0 research 必含 §6 的 sys_user schema grep）→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans` 實作。
