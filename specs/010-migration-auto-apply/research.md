# Research: 010-migration-auto-apply（Phase 0）

> 遵守 [CLAUDE.md §3](../../CLAUDE.md) + [constitution §I.5](../../.specify/memory/constitution.md) research 紀律:只 grep rev2 deploy 真實產物、**不 grep rev1**（避免答案污染)。
> 本 feature 無 service trait / wire endpoint / DTO / 新資料實體 → 「rust service trait 返回型 grep」「wire 3 端對齊 grep」「struct 命名 grep」「CDP smoke」**全 N/A**。

## grep 事實基準（rev2 deploy 現有產物，2026-05-29）

- **compose 結構**:master `docker-compose.yml`(top-level `name: rev2-admin`,無 `version:` 欄 — Compose v2 spec)。`rust-api` service:`build.dockerfile=deploy/Dockerfile.rust-api.txt`、`target=runtime`、`image=rev2-admin-rust-api:latest`、`depends_on: {postgres: service_healthy, redis-stack: service_healthy}`、`environment: APP_DATABASE_URL_FILE=/run/secrets/database_url`、`secrets: [..., database_url]`、`networks: [rev2_net]`。
- **top-level `secrets:`**:`database_url.file = ./deploy/secrets/database_url.txt`(內容 `postgres://soybean:<pw>@postgres:5432/soybean_admin_rust`,內部 host `postgres`)。
- **dev override**（`docker-compose.dev.yml`）:`rust-api` → `build.target=dev`、`image=:dev`、`volumes: [./rust-api:/app, rust_api_cargo_cache:/usr/local/cargo, rust_api_target:/app/target]`、`environment` 加 inline `APP_JWT_*`、`RUST_LOG`。
- **prod override**（`docker-compose.prod.yml`）:`rust-api` → `image=:latest`、`restart: unless-stopped`;`acme` service `profile=prod`。
- **Dockerfile**（`deploy/Dockerfile.rust-api.txt`）:**dev target** `ENTRYPOINT ["cargo","watch","--poll","-x","run --bin server"]`;**runtime target** `ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]` + `CMD ["server"]`。
- **entrypoint**（`deploy/entrypoint.rust-api.sh`）:`case "$1"` dispatcher，已含 `migration) shift; exec /usr/local/bin/migration "$@"`。
- **migration binary**（`rust-api/migration/src/main.rs`）:`cli::run_cli(Migrator)`，讀 `DATABASE_URL` ← `APP_DATABASE_URL_FILE` ← `APP_DATABASE_URL`;冪等(`seaql_migrations` + seed `ON CONFLICT DO NOTHING`)。
- **standalone**:`docker-compose.rust-api.yml` 存在(獨立 rust-api stack;**本 feature 不在 scope**,follow-up)。

---

## R1. `migrate` 一次性 service + `service_completed_successfully` 閘門

**Decision**:master `docker-compose.yml` 新增 `migrate` service 骨架(共用 build context/dockerfile、`depends_on: postgres service_healthy`、`environment APP_DATABASE_URL_FILE=/run/secrets/database_url`、`secrets: [database_url]`、`restart: "no"`、`networks: [rev2_net]`;image/target/command 由 override 指定)。`rust-api` service 加一條 `depends_on: migrate: {condition: service_completed_successfully}`(保留既有 postgres/redis-stack 兩條)。

**Rationale**:docker-compose 正典 migration 模式 —— migrate 是獨立 service/process(守 [007 FR-009](../007-db-redis-connection/spec.md) server 不自動 migrate);`service_completed_successfully` 是 Compose v2 spec 標準 condition,語意 = 「該 service 跑到 exit 0 才放行依賴者」,天然 fail-fast(migrate exit≠0 → 依賴不滿足 → rust-api 不啟動)。

**關鍵**:`restart: "no"` 必要 —— 一次性 service 不可重啟迴圈;否則 `--wait` 會誤判。`depends_on` 用 long-syntax(condition map)而非 short list(short list 無 condition 能力)。

**Alternatives**:server-boot auto-migrate(撞 FR-009 + 多 replica race);entrypoint 包一層 migrate-then-server(與 FR-009 精神牴觸、restart/scale 重跑);Makefile wrapper(達不到「`up` 自動套」)—— 三者皆 brainstorm D2 否決。

---

## R2. dev `migrate` override（cargo + bind-mount + entrypoint 覆寫）

**Decision**:`docker-compose.dev.yml` 的 `migrate`:`build.target=dev`、`image=rev2-admin-rust-api:dev`、`volumes: [./rust-api:/app, rust_api_cargo_cache:/usr/local/cargo, rust_api_target:/app/target]`(與 dev rust-api 同三卷)、`entrypoint: ["cargo","run","--bin","migration"]`、`command: ["up"]`。

**Rationale**:dev image 的 `ENTRYPOINT` 是 cargo-watch（跑 server),migrate 要改跑 migration binary → **覆寫 `entrypoint`**(設為 `cargo run --bin migration`)+ `command: ["up"]` 組成 `cargo run --bin migration up`。共用 `rust_api_target` 卷:migrate 因閘門先跑完、其編譯產物(deps)被後續 server build 重用,不衝突(序列化、非並行)。DATABASE_URL 由 base migrate 的 `APP_DATABASE_URL_FILE` + `database_url` secret 提供(override 不需重宣告,compose 合併 base+override)。

**關鍵**:必須**覆寫 `entrypoint`**(非只給 `command`)—— 否則 cargo-watch ENTRYPOINT 會把 `up` 當 watch 參數。dev migrate 不需 JWT secret(migration 只連 DB),base migrate 骨架只掛 `database_url`、最小化。

**Alternatives**:dev migrate 用 runtime image(prod binary)—— 否決(dev 改 code 後 runtime image 未重 build、會套到舊 migration;dev 一律走 source bind-mount + cargo 才反映當前 source)。

---

## R3. prod `migrate` override（entrypoint dispatcher）

**Decision**:`docker-compose.prod.yml` 的 `migrate`:`build.target=runtime`、`image=rev2-admin-rust-api:latest`、`command: ["migration","up"]`。

**Rationale**:runtime image 的 `ENTRYPOINT` 是 `entrypoint.sh` dispatcher、`CMD=["server"]`;migrate 覆寫 `command` 為 `["migration","up"]` → dispatcher `case migration)` → `exec /usr/local/bin/migration up`。prod 用編譯好的 binary(與 rust-api server 同 `:latest` image,只派發不同 binary)。**不需**覆寫 entrypoint(dispatcher 即設計來分派)。

**關鍵**:prod migrate 與 rust-api 共用 `:latest` image — build 一次、兩 service 共用。acme service `profile=prod` 不影響 migrate(migrate 不設 profile、prod baseline 與 `--profile prod` 都會起)。

**Alternatives**:prod 也覆寫 entrypoint 直接跑 binary —— 否決(dispatcher 已是設計分派點,直接 `command` 較對齊 001 entrypoint-dispatcher 契約)。

---

## R4. DATABASE_URL 經既有 `database_url` secret 接線

**Decision**:`migrate` service(base 骨架)掛 `secrets: [database_url]` + `environment: APP_DATABASE_URL_FILE=/run/secrets/database_url`,與既有 `rust-api` 同源。migration `main.rs` 既有邏輯讀 `APP_DATABASE_URL_FILE` → 設 `DATABASE_URL`。

**Rationale**:零新增憑證來源(spec assumption);secret file 內 host = `postgres`(compose 內部網路名),migrate 與 postgres 同 `rev2_net`、`depends_on postgres service_healthy` 確保可連。

**Alternatives**:inline `APP_DATABASE_URL` env —— 否決(dev rust-api 雖 inline JWT,但 DB URL 一律走 secret;一致性 + 不外露密碼)。

---

## R5. `up --wait` 與一次性 service 退出語意 + fail-fast

**Decision**:依賴者 `rust-api` 用 `depends_on: migrate: {condition: service_completed_successfully}`;`migrate` `restart: "no"`、無 healthcheck。`docker compose … up -d --wait`:Compose 等 `migrate` 跑到 exit 0(完成條件)後才啟 `rust-api`;`migrate` exit≠0 → `up` abort 並回非 0(fail-fast)。

**Rationale**:`service_completed_successfully` 對一次性容器的標準語意即「exit 0 視為滿足、exit≠0 視為失敗令依賴鏈中止」。`--wait` 對「有完成條件依賴」的服務會等該條件達成。無 healthcheck 的一次性 service 不會被 `--wait` 當「需 healthy」誤判(它的角色是被依賴的完成閘門,非長駐服務)。

**關鍵 / 待 acceptance 確認**:`up --wait` 對「同時含長駐(rust-api/postgres)與一次性(migrate)」服務的 exit code 行為,須在 [verification-commands §1/§2](./contracts/verification-commands.md) 實測確認(migrate 成功 → `up --wait` exit 0;migrate 失敗 → exit≠0、rust-api 未起)。若實測發現 `--wait` 對一次性 service 有非預期行為(如 compose 版本差異),fallback:依賴鏈仍正確序列化(server 不會在 migrate 失敗時起),只是 `--wait` 回傳碼語意需以實測為準、並在 contract 註明。

**Alternatives**:給 migrate 一個「永遠 healthy」假 healthcheck —— 否決(一次性 service 跑完即退、healthcheck 無意義且誤導);用 `depends_on` short list —— 否決(無 condition、不 gate 完成)。

---

## Research 結論

5 項全解析、0 NEEDS CLARIFICATION。**無新外部 dep、無新 image、無 rust-api source 變更** —— 純 3 個外層 compose 檔編排。**遵守 §I.5**:只 grep rev2 deploy 現有產物(compose/Dockerfile/entrypoint/migration main/secrets),未 grep / 未拷 rev1。守 007 FR-009(migrate 獨立 process、server 不自動 migrate)。
