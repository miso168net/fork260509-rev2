# Research: 007-db-redis-connection（Phase 0）

> 遵守 [CLAUDE.md §3](../../CLAUDE.md) research 紀律：grep 真實來源、不信 brainstorm 命名假設、不拷 rev1 code（Constitution §I.5）。本檔解析 spec 留 plan 的 research 項。

---

## R1. `sys_user` proof-migration schema + seed

**Decision**：
- **建表最小欄位**（proof 用，足以證明 migrate+seed + 撐 Phase 3 login）：
  | column | type | note |
  |---|---|---|
  | `id` | `i64` PK | DESIGN §4.6 L335 pin **i64**（對齊 mock，非 ULID）；mock `userId` 為 string `"1"/"2"/"3"`，wire 時由後續 feature 序列化為 string |
  | `user_name` | `VARCHAR` UNIQUE NOT NULL | login lookup key（mock 登入 req `{userName, password}`，`base-web/src/service/api/auth.ts:9-22`）|
  | `password` | `VARCHAR` NOT NULL | 存 argon2id hash；login verify plaintext `123456` |
- **seed 3 帳號 = `Super` / `Admin` / `User`**（id 1/2/3、密碼 `123456`）。
- **argon2id hash**：implementer 用 `argon2` crate（pin `0.5.3` stable；0.6.0-rc 不用）impl 時自生（`Argon2::default().hash_password(b"123456", &salt)` → PHC string）。anew rust-api 無 rev1 hash 需 byte-match，login 僅需 `verify_password("123456", stored)` 成功，random salt 故任何 valid hash 皆可。3 帳號可共用一個 hash 字串。

**Rationale**：
- **§8.1 cited file 不存在**：`grep -rn 'sys_user|argon2|123456|m20241024' rust-api/ fork260509-rev2-anew-rust-api/ --include=*.rs` 回空。`migration/src/main.rs:1-3` 為 stub。
- **帳號名權威 = `Super/Admin/User`**（非 §8.1 的 `Soybean/Administrator/GeneralUser`，那是 rev1 legacy）：DESIGN §11.1 拍板（L1140-1149「✅ (b) `Super/Admin/User` 對齊 mock」）+ §4.6.5（L547）+ §4.6.4（L540）+ mock ground truth `MOCK-COVERAGE-AUDIT.md:279-283`（登入 `userName`=Super/Admin/User、密碼 123456、id 1/2/3）。
- **最小欄位**：`roles`/`buttons` 由 `sys_role`/`sys_menu` join 在 `getUserInfo` 查詢時組裝（`base-web/src/typings/api/auth.d.ts:13-18`），非 sys_user 1:1 欄；完整 7-entity schema 屬 soft-delete(#2)（DESIGN §4.6.4 L529-531）。
- **`User → User01` alias** 是 `getUserInfo` 回應細節（`MOCK-COVERAGE-AUDIT.md:283-285`、DESIGN §11.10 L1279），**非 seed 值** → seed `user_name = User`，alias 留 Phase 3 login。

**Alternatives considered**：拷 rev1 sys_user migration（拒——§I.5 + 檔不存在）；建完整 sys_user 全欄（拒——soft-delete #2 owns、過度設計）；seed `Soybean/Administrator/GeneralUser`（拒——rev1 legacy、與 mock 不符）；預先 commit 一個 hash 字串常量 vs runtime 雜湊（implementer 自選，二者皆可）。

> **⚠️ 連帶 follow-up（非 007 scope）**：CLAUDE.md §8.1 對 rev2 已 stale（標 rev1 的 `Soybean/Administrator/GeneralUser`）。建議日後修 §8.1 為 `Super/Admin/User`——登記 follow-up，不在本 feature 動。

---

## R2. sea-orm + sea-orm-migration 版本與 pattern（rust 1.86 / axum 0.7 / tokio 1）

**Decision**：pin 兩者 `1.1.20`
- `sea-orm = { version = "1.1.20", features = ["sqlx-postgres", "runtime-tokio-rustls", "macros"] }`
- `sea-orm-migration = { version = "1.1.20", features = ["sqlx-postgres", "runtime-tokio-rustls"] }`
- migration crate 另加 `async-trait`、`tokio`。

**Rationale**：1.1.20 為 max_stable（2026-03-31；2.0.0-rc.* 為 prerelease、依 CLAUDE.md §6 不用）；MSRV 1.81 < toolchain 1.86。`runtime-tokio-rustls` 對齊既有 tokio runtime + 純 Rust TLS（免系統 OpenSSL、利於 slim image）；sea-orm-migration runtime feature 須與 sea-orm 一致避免 sqlx/runtime feature 衝突。

**Pattern**（concrete shape）：
```rust
// 連線池
let mut opt = ConnectOptions::new(cfg.database.url.clone());
opt.max_connections(cfg.database.max_connections)
   .connect_timeout(Duration::from_secs(cfg.database.connect_timeout_secs));
let db = Database::connect(opt).await?;        // connect() 不可達即 Err(fail-fast)
db.ping().await?;                              // 連線驗證(等效 SELECT 1)
// migration crate: lib.rs 出 Migrator(impl MigratorTrait)、各 migration #[derive(DeriveMigrationName)] impl MigrationTrait{up/down}
// main.rs: cli::run_cli(Migrator).await  ← sea-orm-migration 內建 CLI(up/down/fresh)，免裝 sea-orm-cli
```

**Alternatives**：sqlx 直用（拒——DESIGN 走 sea-orm 生態 + 後續 Casbin sea-orm-adapter）；diesel（拒——sync）；`runtime-tokio-native-tls`（拒——系統 TLS dep）；sea-orm 2.0.0-rc（拒——prerelease）。

---

## R3. redis crate 版本與 ConnectionManager pattern（rust 1.86 / tokio）

**Decision**：pin `redis = { version = "1.2", features = ["tokio-comp", "connection-manager"] }`（user 拍板 2026-05-29 選 max stable）。

**Rationale**：1.2.1 為 max_stable（2026-05-03、MSRV 1.85 < 1.86、無 prerelease）。`ConnectionManager` multiplexed + 自動重連 + cloneable，適合長壽 AppState，免額外 pool（deadpool/bb8 overkill）。
> **注意**：redis-rs 0→1 為近期 major bump，多數生態文章仍引 0.3x。**impl 時用 `cargo doc` 再確認 `tokio-comp`/`connection-manager` feature 名與 `ConnectionManager` API**（此區間穩定但值得一驗）。

**Pattern**：
```rust
let client = redis::Client::open(cfg.redis.url.clone())?;   // 解析 redis URL
let mgr = ConnectionManager::new(client).await?;            // 自動重連、cloneable
let pong: String = redis::cmd("PING").query_async(&mut mgr.clone()).await?;  // 啟動驗證
```

**URL 解析確認**：005 的 `redis://:<hex48>@redis-stack:6379`（password-only、無 username）為 redis crate 文件支援的合法形式（docs.rs IntoConnectionInfo）。歷史上極舊版需 placeholder username（issue #144），現代版正常——**impl 時對真 redis-stack 容器跑一次 PING smoke 確認**。

**Alternatives**：`MultiplexedConnection`（拒——無自動重連）；`deadpool-redis`/`bb8-redis`（拒——overkill）；`fred`（拒——非慣例、DESIGN 未引）。

---

## R4. `config.rs` 整合 shape

**Decision**：加兩個 config struct，URL 走 secret、pool 參數走 yaml：
```rust
pub struct DatabaseConfig { pub url: String, pub max_connections: u32, pub connect_timeout_secs: u64 }
pub struct RedisConfig    { pub url: String }
```
- `AppConfigYaml` 加 `DatabaseYaml { max_connections, connect_timeout_secs }`（非機密 pool 參數，application.yaml `database:` section，如 `max_connections: 10` / `connect_timeout_secs: 5`）。RedisConfig 本 foundation 無 yaml 參數。
- `AppConfig::load()` 在既有 JWT load 之後加：
  ```rust
  let database_url = load_secret("APP_DATABASE_URL")?;
  let redis_url    = load_secret("APP_REDIS_URL")?;
  ```
  沿用既有 `APP_*` / `APP_*_FILE` 慣例（005 dual-write 產 `_FILE` 掛載）。

**Rationale**：URL 含密碼 → 必走 `load_secret`/`_FILE`（不可進明文 yaml）；重用既有 loader 與 JWT secret 一致。

**`validate_secret` 長度確認**（既有 loader 要求 len≥32 + 非 placeholder）：
- `postgres://soybean:<hex48>@postgres:5432/soybean_admin_rust` ≈ 100+ 字 ✓
- `redis://:<hex48>@redis-stack:6379` = 9+48+17 = **74 字** ✓
- 兩者皆非 blacklist（placeholder 為**全字串 case-insensitive 相等**，子字串無妨）→ 通過。
> **判斷註**：`validate_secret` 的 ≥32 規則本為 opaque secret 設計，此處對 URL 恰好通過（因內嵌 hex48）。dev/prod/005 URL 皆 OK；若日後出現短 URL（如 localhost 無密碼）會 fail ≥32——本 feature 無此情形，沿用既有 loader、不另造 URL validator。

**Alternatives**：URL 放 application.yaml（拒——含密碼）；為 URL 另寫 non-validating loader（拒——重用既有 loader 一致、長度本就通過）。

---

## Research 結論

4 個 research 項全解析、無 NEEDS CLARIFICATION 殘留。版本全 pin stable（sea-orm 1.1.20 / sea-orm-migration 1.1.20 / redis 1.2 / argon2 0.5.3、皆 MSRV < 1.86、無 prerelease，符合 CLAUDE.md §6）。**遵守 §I.5**：research 只 grep rev2 現有產物（rust-api worktree / 源倉 / DESIGN / MOCK-COVERAGE-AUDIT / base-web typings）+ crate 官方版本，**未拷 rev1 code**；帳號名以 rev2 權威（DESIGN 拍板 + mock）覆蓋 §8.1 stale 值。
