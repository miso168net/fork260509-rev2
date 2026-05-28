# Data Model: 007-db-redis-connection

> 連線層基礎 + proof migration。entity 分兩類：(A) 執行期連線設定/狀態（config struct + AppState）、(B) DB schema（sys_user proof 表）。完整 7-entity 業務 schema 屬 soft-delete(#2)，**不在本檔**。命名以 [research.md](./research.md) 對齊真實來源（act on authority、不信 §8.1 stale 值）。

---

## Entity 1: DatabaseConfig（執行期連線設定）

| 欄位 | 型 | 來源 | 說明 |
|---|---|---|---|
| `url` | `String`（secret）| `load_secret("APP_DATABASE_URL")`（`_FILE`>envvar + validate）| 005 `database_url`：`postgres://soybean:<hex48>@postgres:5432/soybean_admin_rust` |
| `max_connections` | `u32` | application.yaml `database.max_connections` | 連線池上限（預設建議 10）|
| `connect_timeout_secs` | `u64` | application.yaml `database.connect_timeout_secs` | 連線 timeout 秒（預設建議 5）|

- 非機密 pool 參數走 yaml；機密 URL 走 secret loader（既有機制）。

## Entity 2: RedisConfig（執行期連線設定）

| 欄位 | 型 | 來源 | 說明 |
|---|---|---|---|
| `url` | `String`（secret）| `load_secret("APP_REDIS_URL")` | 005 `redis_url`：`redis://:<hex48>@redis-stack:6379`（password-only）|

- 本 foundation 無額外 yaml 參數（ConnectionManager 自管）。

## Entity 3: AppConfig（既有，擴充）

既有 `AppConfig { server, jwt, logging }`（`rust-api/server/src/config.rs`）擴充加 `database: DatabaseConfig` + `redis: RedisConfig`。`AppConfigYaml` 對應加 `database: DatabaseYaml { max_connections, connect_timeout_secs }`（server/jwt/logging 不動）。`AppConfig::load()` 在既有 JWT load 後加 `load_secret("APP_DATABASE_URL")` / `load_secret("APP_REDIS_URL")`。

## Entity 4: AppState（執行期共享連線握把）

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: sea_orm::DatabaseConnection,        // sea-orm 連線池(cheap-clone)
    pub redis: redis::aio::ConnectionManager,   // 自動重連、cloneable
}
```

- boot 時建立、握住；axum `.with_state(state)` 注入 handler。
- `DatabaseConnection` 與 `ConnectionManager` 皆 cheap-clone（內部 Arc），AppState 直接 `#[derive(Clone)]`。
- 本 feature 不在 handler 用它（無業務 endpoint）；只證明可建立 + 持有，供 Phase 3+ 取用。

---

## Entity 5: sys_user（proof migration 表）

> **最小欄位**（proof + Phase 3 login）；完整業務欄（roles/buttons/status/soft-delete）留 soft-delete(#2)。

| column | type | constraint | 說明 |
|---|---|---|---|
| `id` | `bigint`（i64）| PK | DESIGN §4.6 L335 pin i64；seed 用 1/2/3 |
| `user_name` | `varchar` | UNIQUE NOT NULL | login lookup key（mock `userName`）|
| `password` | `varchar` | NOT NULL | argon2id PHC hash（impl 自生 of `123456`）|

**Seed（3 筆）**：

| id | user_name | password |
|---|---|---|
| 1 | `Super` | argon2id(`123456`) |
| 2 | `Admin` | argon2id(`123456`) |
| 3 | `User` | argon2id(`123456`) |

- 帳號名 = rev2 權威 `Super/Admin/User`（DESIGN §11.1 拍板 + mock；非 §8.1 rev1 的 `Soybean/...`，見 research R1）。
- 3 帳號共用一個 argon2id hash 字串（plaintext `123456`）。
- **`User → User01` alias** 為 getUserInfo 回應細節（Phase 3）、**非 seed 值**；seed `user_name = User`。
- **冪等**：seed 用 conflict-safe 寫法（`ON CONFLICT (user_name) DO NOTHING` 或 sea-orm 等效），重跑不重複插入。

---

## 命名規則 / 不變式

- migration 檔名 `m<YYYYMMDD>_<NNNNNN>_create_sys_user` / `..._seed_sys_user`（sea-orm-migration `DeriveMigrationName`）。
- `seaql_migrations` 追蹤表由 sea-orm-migration 自動建/維護，記錄已套用 migration（冪等基礎）。
- sys_user 欄名 snake_case；wire 層 camelCase 對映（`userName`/`userId`）由後續 wire feature 處理、**不在本 feature**。

## 邊界（MUST NOT）

- 不建 sys_user 以外的表（7 業務 / sys_tokens / casbin_rule / sys_operation_log）。
- 不加 roles/buttons/nick_name/status/deleted_at 等業務/軟刪欄（soft-delete #2）。
- 不在 handler 消費 AppState（無業務 endpoint，Phase 3+）。
