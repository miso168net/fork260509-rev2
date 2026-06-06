# Phase 0 Research — 030 cleanup-job

> 所有決策以 grep 過的 `file:line` 為據（grounding workflow 2026-06-06 五面向 + plan 階段補讀覆驗）。不信 brainstorm 命名/抽象假設。NEEDS CLARIFICATION：無（spec 0 markers）。

## D1 — 刪除述詞：純過期 + 安全邊際

- **Decision**: `DELETE FROM sys_token WHERE expires_at < (now - 60s)`，**與 status 無關**。
- **Rationale**: sys_token 列在「live 路徑」只被 `rotate()` 以 `token_hash` 查（`model/facade/sys_token.rs:147-150`），而 `rotate()` 只在 `jwt::verify()`（`auth/jwt.rs:102-119`，`validate_exp=true`、`leeway=0`）通過後才被呼叫 → **一旦 `expires_at` 過了，對應 JWT 必驗不過 → 該列永遠不可能再被查到 → 任何 status 皆可安全刪**。未過期的 used/revoked 列仍可達、保留以維持 reuse 偵測（`rotate()` 對 used-過-grace/revoked 列做整鏈撤銷，`:192-196`）。
- **Alternatives**: 「積極三態」（revoked + used-過-grace + active-過期）→ **rejected**：used-過-grace 但**未過期**列若刪，會把「整鏈撤銷」降為單次 NotFound 登出（reuse 偵測退步）。純過期嚴格更安全且仍把表封頂在 7d TTL 窗（`refresh_token_ttl_secs: 604800`，`application.yaml:7`）。

## D2 — cutoff 計算：app-side chrono（可單元測）

- **Decision**: 純函式 `purge_cutoff(now: DateTimeWithTimeZone, margin_secs: i64) -> DateTimeWithTimeZone`，回 `now - Duration::seconds(margin)`；`SKEW_MARGIN_SECS = 60` 常數。run 時 `now = Utc::now().fixed_offset()`。
- **Rationale**: `expires_at: DateTimeWithTimeZone`（`entity/src/sys_token.rs:13`）→ filter 用同型 cutoff。app-side 算 cutoff 讓 `purge_cutoff` 可注入固定 `now` 做 red→green 單元測（固化「只刪 cutoff 前」安全規則）。60s margin 同時吸收 app↔DB 與 `expires_at`↔JWT `exp` 任何偏移。
- **Alternatives**: DB-side `Expr::cust("now() - interval '60 seconds'")` → rejected（純函式不可單元測；無實益，margin 已覆蓋 clock skew）。

## D3 — cleanup-job 依賴 + DB 連線：鏡像 migration bin

- **Decision**: `cleanup-job/Cargo.toml` 加 `entity` / `sea-orm` / `tokio` / `anyhow` / `chrono`（皆 `workspace = true`）。連線鏡像 `migration/src/main.rs:6-14`：`DATABASE_URL` →（`APP_DATABASE_URL_FILE` 讀檔 trim）→ `APP_DATABASE_URL`，再 `sea_orm::Database::connect(url)`。
- **Rationale**: server 的 `config` / `infra::db::connect_postgres` 皆 server-internal 且 **server bin-only 無 lib target**（`server/Cargo.toml` 僅 `[[bin]]`）→ 無法 depend、不重用。migration bin 已示範極簡 env-loading，直接照搬。
- **chrono 取得**: 現 workspace.dependencies **無** chrono（`rust-api/Cargo.toml:5-33`，sea-orm 1.1.20 transitively 帶 chrono）。新增 `chrono` 為 workspace 直接 dep（暴露 `Utc::now`/`Duration` API、不引入新編譯產物）—— 同 `tokio-stream` 既有範式（`Cargo.toml:24-27` 註：宣告 transitive dep 為直接以暴露 trait）。pin 對齊 sea-orm 鏈的 chrono（`cargo tree -i chrono` 實證版本後寫入）。
- **Alternatives**: 抽 server 共用 lib crate → rejected（過度工程、超出窄範圍）。

## D4 — entity 直接存取 + DeleteMany/count API

- **Decision**: cleanup-job **直接** `use entity::sys_token`，`sys_token::Entity::delete_many().filter(sys_token::Column::ExpiresAt.lt(cutoff)).exec(&db)` → `DeleteResult.rows_affected`；dry-run 用 `sys_token::Entity::find().filter(<同>).count(&db)`。
- **Rationale**: 009 entity-access lint（`server/tests/entity_access_lint.rs:348`）以 **server crate 的 `CARGO_MANIFEST_DIR`** 為根、**只掃 `server/src`** → **不掃 cleanup-job**；且 cleanup-job 是「物理清理工具」、本就該繞 soft-delete facade（facade 防護是給 server handler 的）。sea-orm 1.1.20 提供 `delete_many/filter/exec` 與 `find/filter/count`（標準 API）。
- **Alternatives**: 走 server facade（需新 facade fn + server lib）→ rejected（無 lib target、且清理屬正當繞道）。

## D5 — jti：sign() 內鑄 per-token uuid

- **Decision**: `Claims`（`auth/jwt.rs:29-47`）加 `pub jti: String`；`sign()`（`:69-96`）在建 `Claims` 前 `let jti = uuid::Uuid::new_v4().to_string();` 設入（production 建構點 `jwt.rs:80`）。**4 個手鑄 `Claims` 的 test 站點**補 `jti`（`grep "Claims {"` 全樹核實，避免漏一個就編譯失敗）：`jwt.rs:157`（`sign_with_past_exp`）、**`jwt.rs:243`（`with_sid`，在 `pre_028_token_without_sid_fails_verify`）**、`bearer.rs:128`（`sign_expired`）、`session.rs:342`（live-test `claims()`）。⚠️ `jwt.rs:201/226` 的 `LegacyClaims` 是**另一個刻意無 sid 的 struct**（用來證 pre-028 token 驗不過）、**不**加 jti；加 jti 後該測語意（缺 sid → 驗不過）仍成立。
- **Rationale**: `token_hash = sha256_hex(整個 JWT)`（`facade/sys_token.rs:56-66`）；`iat/exp` 由 `sign()` 單次 `now_secs()` 算（`jwt.rs:78-79`）→ 同秒兩 token claims 全同 → JWT byte 同 → 撞 `token_hash` UNIQUE（`m...026:42-45`）。jti 每 token 一個 fresh uuid → JWT body byte-distinct → 不撞。在 `sign()` 內鑄（而非從 caller 串）因 jti 是 **per-token**（不同於 sid 的 per-session/per-chain，`jwt.rs:42-46`）→ 免改任何 caller。`uuid` 已是 server dep（`handler/auth.rs:100` 用）。
- **wire 影響**: 零。base-web 把 token 當 opaque（`jwt.rs:9-10`）。`verify()` 用 `decode::<Claims>` 會要求 jti 存在但永不檢視（`jwt.rs:112-119`）→ 部署後「變更前已發出」舊 token 缺 jti 會驗不過 → 一次性重登（同 028 sid rollout 的 transition，spec edge case 已記、可接受）。
- **Alternatives**: 從 `issue_tokens`/handler 串 jti → rejected（per-token 語意下在 sign 內鑄最簡、最不易漏）。

## D6 — migration m030：純加索引、可逆、不建 role

- **Decision**: `m20260529_000030_index_sys_token_expires_at`：`up` = `CREATE INDEX idx_sys_token_expires_at ON sys_token (expires_at)`；`down` = `DROP INDEX`。註冊進 `migration/src/lib.rs`（`mod` 區 + `migrations()` vec 末，範式見 `:28-31` / `:64-67`）。
- **Rationale**: 現 sys_token 僅 2 索引（`idx_sys_token_user_active` partial、`idx_sys_token_chain`，`m...026:82-100`）、無 `expires_at` 索引 → 純過期 DELETE 否則全表掃。**不建 DB role**（決策 3 defer；全專案無 `CREATE ROLE`/`GRANT` 先例，留 follow-up）。
- **可逆驗**: up→down→up 用 throwaway DB（memory `devstack-acceptance-restart`）。

## D7 — 排程 / compose：one-shot profile job（鏡像 migrate）

- **Decision**: master `docker-compose.yml` 加 `cleanup-job` service：`profiles: ["jobs"]`（語法同 acme `profiles: [prod]`，`:131`）+ `restart: "no"` + `APP_DATABASE_URL_FILE: /run/secrets/cleanup_database_url` + `secrets: [cleanup_database_url]` + `command: ["cleanup-job"]`（entrypoint dispatcher 路由、預設 dry-run，`entrypoint.rust-api.sh:12-14`）。`secrets:` 區加 `cleanup_database_url`（`file: ./deploy/secrets/cleanup_database_url.txt`，已存在）。dev/prod override 各補 `target:` + dev `cargo run --bin cleanup-job` / prod `command:[cleanup-job]`（鏡像 migrate `:75-90` 的 base + override 分工）。
- **觸發**: dry-run `docker compose --profile jobs run --rm cleanup-job`；execute `docker compose --profile jobs run --rm --entrypoint /usr/local/bin/cleanup-job cleanup-job --execute`（**dispatcher arg 陷阱**：`run` 附加 arg 取代 service `command`，直接 append `--execute` 會被 dispatcher 當 `$1` → routing 失敗，故 execute 用 `--entrypoint` 直指 binary）。host cron 外觸（無 in-stack scheduler、`grep` 全 compose 0 cron）。
- **Rationale**: 對齊 DESIGN §10/§8.6 意圖（`profile:[jobs]` + `restart:no` + `docker compose run --rm` + host cron）。

## D8 — credential：沿用 cleanup_database_url（== database_url）

- **Decision**: 用既有 `cleanup_database_url` secret（`deploy/secrets/cleanup_database_url.txt`(+`.example`) 已存在、目前 == database_url、soybean superuser）。least-priv PG role **defer follow-up**。
- **Rationale**: 決策 3（YAGNI、個人 workspace 低風險）;indirection 已備，未來換 low-priv role 不動 cleanup-job（仍走此 secret）。

## D9 — CDP browser smoke：N/A（無 base-web UI）

- **Decision**: 本 feature **無 CDP browser smoke**。C-V 驗收 = curl（jti 同秒登入）+ psql（cleanup 對帳）+ docker（prod build + job run）。
- **Rationale**: §3 的「CDP smoke defer 風險」針對「有 base-web modal 但暫不測」;本 feature **根本無 base-web UI / modal**（純 CLI job + token 內部欄）→ 非 defer、是 genuinely not-applicable。無「curl ≠ modal 對齊」風險。

## D10 — prod image build acceptance（§3 紀律）

- **Decision**: acceptance **必含 prod target image build**：`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`，再驗 binary 在 runtime stage（`docker run … sh -c 'ls -l /usr/local/bin/cleanup-job'`）。
- **Rationale**: cleanup-job 是**新實作的 workspace binary**（CLAUDE.md §3：新 workspace crate ⇒ acceptance 必含 prod image build；dev bind-mount 整個 rust-api/ 會遮 Dockerfile 逐 crate COPY）。Dockerfile 本身**不需改**（builder `--bins` + runtime COPY + entrypoint case 已備，`Dockerfile.rust-api.txt:54/100`、`entrypoint:12-14`），但仍須跑一次驗 binary 實際 build 出來。
