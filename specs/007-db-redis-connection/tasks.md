---
description: "Task list for 007-db-redis-connection implementation"
---

# Tasks: db-redis-connection

**Input**: Design documents from `/specs/007-db-redis-connection/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0):
- **有 1 個可單測單元**:config 反序列化 + URL secret 載入(`DatabaseConfig`/`RedisConfig` + `load_secret`)→ **test-first**(T016)。
- **其餘為 wiring**(連線建立、migration、compose 接線)無新純函式 → 由 acceptance(C-V)覆蓋:[verification-commands.md](./contracts/verification-commands.md) §1-§4。
- 此紀律已在 spec + plan + verification-commands §0 明示。

**Organization**: 6 phase;3 個 user story phase 各對應 spec US1/US2/US3 + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**:可並行(不同檔、無未完依賴)
- **[Story]**:User Story phase 內必加(US1/US2/US3);Setup/Foundational/Polish 無 story label
- 全 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

> **★ 兩段式 commit 提醒**:本 feature **動 rust-api worktree**(`rust-api/Cargo.toml`/`application.yaml`/`server/`/`migration/`)。實作階段對 `rust-api/` 內檔走 [CLAUDE.md §4.1 兩段式 commit](../../CLAUDE.md)(worktree commit+push fork → 外層 `git add rust-api` bump SHA pin)。外層檔(`docker-compose*.yml`/spec docs)為單段。**本 tasks.md 不排 git push/merge 任務**(§3 紀律);commit/push 機制於 `executing-plans`/`finishing` 階段處理。

---

## Phase 1: Setup (Pre-flight)

**Purpose**:確認前置就緒。

- [ ] T001 Pre-flight:外層 `git branch --show-current` = `007-db-redis-connection`;`rust-api/` worktree 在 `rev2-admin-rust-api` 分支且 `git -C rust-api status --short` 空;005 secret 存在(`ls deploy/secrets/database_url.txt deploy/secrets/redis_url.txt`);dev stack 可起(docker 可用);確認現況無 DB deps(`grep -c 'sea-orm\|redis' rust-api/Cargo.toml` = 0)。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:deps + config + compose 接線 —— US1/US2/US3 共同基礎。**必須先完成才進 user story**。

- [ ] T002 Edit `rev2-root/rust-api/Cargo.toml`(workspace)+ `server/Cargo.toml` + `migration/Cargo.toml`:workspace.dependencies 加 `sea-orm = { version = "1.1.20", features = ["sqlx-postgres","runtime-tokio-rustls","macros"] }`、`sea-orm-migration = { version = "1.1.20", features = ["sqlx-postgres","runtime-tokio-rustls"] }`、`redis = { version = "1.2", features = ["tokio-comp","connection-manager"] }`、`argon2 = "0.5.3"`、`async-trait = "0.1"`;server crate 引 sea-orm/redis,migration crate 引 sea-orm-migration/async-trait/tokio/argon2(對齊 [research R2/R3](./research.md))
- [ ] T003 Edit `rev2-root/rust-api/server/src/config.rs`:加 `DatabaseConfig{ url, max_connections, connect_timeout_secs }` + `RedisConfig{ url }`(對齊 [data-model Entity 1/2](./data-model.md));`AppConfigYaml` 加 `database: DatabaseYaml{ max_connections, connect_timeout_secs }`;`AppConfig` 加 `database`/`redis` 欄;`AppConfig::load()` 既有 JWT load 後加 `load_secret("APP_DATABASE_URL")` / `load_secret("APP_REDIS_URL")`(沿用既有 `_FILE`>envvar loader)
- [ ] T004 Edit `rev2-root/rust-api/application.yaml`:加 `database:` section(`max_connections: 10` / `connect_timeout_secs: 5`);server/jwt/logging 不動
- [ ] T005 Edit `rev2-root/docker-compose.yml`:top-level `secrets:` 加 `database_url`(file `./deploy/secrets/database_url.txt`)+ `redis_url`(file `./deploy/secrets/redis_url.txt`);`rust-api` service `secrets:` 加這 2 個 + `environment:` 加 `APP_DATABASE_URL_FILE: /run/secrets/database_url` / `APP_REDIS_URL_FILE: /run/secrets/redis_url`。**複查** `docker-compose.dev.yml` 的 rust-api 是否繼承到 secret(dev 連 `postgres:5432`/`redis-stack:6379` 同 URL);若 dev override 未繼承則補掛(對齊 [data-model](./data-model.md) + [quickstart](./quickstart.md))

---

## Phase 3: User Story 1 — 連線層 + AppState + fail-fast boot (Priority: P1) 🎯 MVP

**Goal**:rust-api boot 時建立並驗證 Postgres + Redis 連線(fail-fast)、握在 AppState;`/health` 維持 ok。

**Independent Test**:dev stack `up -d --wait` → rust-api healthy + log 顯示 DB/Redis connected;錯 URL → 非零退出,即驗。

- [ ] T006 [P] [US1] 新增 `rev2-root/rust-api/server/src/infra/db.rs` + `infra/mod.rs`:`connect_postgres(cfg: &DatabaseConfig) -> Result<DatabaseConnection>` —— `ConnectOptions::new(url).max_connections(..).connect_timeout(..)` → `Database::connect` → `db.ping().await?`(連線驗證、fail-fast)(對齊 [research R2](./research.md))
- [ ] T007 [P] [US1] 新增 `rev2-root/rust-api/server/src/infra/redis.rs`:`connect_redis(cfg: &RedisConfig) -> Result<ConnectionManager>` —— `redis::Client::open(url)` → `ConnectionManager::new` → `PING` 驗證(fail-fast)(對齊 [research R3](./research.md))
- [ ] T008 [US1] 新增 `rev2-root/rust-api/server/src/state.rs`:`#[derive(Clone)] AppState{ db: DatabaseConnection, redis: ConnectionManager }`(對齊 [data-model Entity 4](./data-model.md))
- [ ] T009 [US1] Edit `rev2-root/rust-api/server/src/main.rs`:boot 序 = load config → `connect_postgres`(fail-fast)→ `connect_redis`(fail-fast)→ 建 `AppState` → axum router `.with_state(state)` → serve;`/health` 維持純 `ok`;連線成功/失敗各 log(失敗即非零退出,沿用既有 `.expect()` 風格)
- [ ] T010 [US1] Acceptance:連線層 boot(對應 spec US1 + SC-001/SC-002;[verification-commands §3](./contracts/verification-commands.md)):dev stack `up -d --wait` exit 0、5 service healthy、`logs rust-api | grep -iE 'postgres|redis|connect'` 見連線成功;`curl 127.0.0.1:21081/health` = ok

**Checkpoint**:US1 達成(rust-api 連 DB+Redis、fail-fast、AppState 持有)= MVP

---

## Phase 4: User Story 2 — migration pipeline proof (Priority: P2)

**Goal**:`migration` crate 變真 sea-orm-migration runner + proof migration 建 sys_user + seed 3 帳號(冪等)。

**Independent Test**:跑 migration → `SELECT count(*) FROM sys_user` = 3(Super/Admin/User);再跑 → 仍 3,即驗。

> 依 Foundational(deps + DB 可連);獨立於 US1(migration binary 自連 DB、不依 server boot)。

- [ ] T011 [US2] Edit `rev2-root/rust-api/migration/Cargo.toml` + 新增 `migration/src/lib.rs`:`pub use sea_orm_migration::prelude::*;` + `Migrator`(`impl MigratorTrait` 列 2 migration)(對齊 [research R2](./research.md))
- [ ] T012 [P] [US2] 新增 `rev2-root/rust-api/migration/src/m<YYYYMMDD>_000001_create_sys_user.rs`:`up()` 建 `sys_user`(`id` bigint PK / `user_name` varchar UNIQUE NOT NULL / `password` varchar NOT NULL)、`down()` drop(對齊 [data-model Entity 5](./data-model.md))
- [ ] T013 [P] [US2] 新增 `rev2-root/rust-api/migration/src/m<YYYYMMDD>_000002_seed_sys_user.rs`:`up()` seed 3 帳號(id 1/2/3、user_name `Super`/`Admin`/`User`、password = argon2id hash of `123456` 用 `argon2` crate 生成、3 帳號共用一 hash)、冪等(`ON CONFLICT (user_name) DO NOTHING` 或 sea-orm 等效)、`down()` 刪該 3 筆。**帳號名用 `Super`/`Admin`/`User`**(rev2 權威,非 §8.1 rev1 `Soybean/...`;[research R1](./research.md))
- [ ] T014 [US2] Edit `rev2-root/rust-api/migration/src/main.rs`:stub → `cli::run_cli(migration::Migrator).await`(sea-orm-migration 內建 CLI;server 不自動 migrate)
- [ ] T015 [US2] Acceptance:migration pipeline(對應 spec US2 + SC-003;[verification-commands §2](./contracts/verification-commands.md)):跑 migration exit 0 → `psql -U soybean -d soybean_admin_rust -c 'SELECT count(*) FROM sys_user'` = 3、`SELECT id,user_name` = 1 Super/2 Admin/3 User;再跑一次 → 仍 3(冪等)

**Checkpoint**:US1+US2 各自 functional

---

## Phase 5: User Story 3 — 連線設定 secret 對齊 + 驗證 (Priority: P3)

**Goal**:連線 URL 走既有 secret 機制(`_FILE`)、無明文;config 反序列化 + secret 載入有單測。

**Independent Test**:`cargo test -p server config` PASS;`grep` compose 有掛 secret + env、無明文 URL,即驗。

> Foundational 已落 config struct + compose 接線;本 phase = 單測(US3 可測單元)+ secret/compose acceptance。

- [ ] T016 [US3] Edit `rev2-root/rust-api/server/src/config.rs` `#[cfg(test)] mod tests`:加 `DatabaseConfig`/`RedisConfig` 反序列化 + `load_secret("APP_DATABASE_URL")`/`("APP_REDIS_URL")` 的 `_FILE`>envvar + validate 通過測試(test-first;沿用既有 test 隔離慣例 unique env-key prefix)
- [ ] T017 [US3] Acceptance:build + config 單測 + secret/compose wiring(對應 spec US3 + SC-004/SC-005;[verification-commands §1+§4](./contracts/verification-commands.md)):`build rust-api` OK、`cargo test -p server config` PASS;`grep -nE 'database_url|redis_url|APP_DATABASE_URL_FILE|APP_REDIS_URL_FILE' docker-compose.yml` 有;`grep -rnE 'postgres://|redis://' docker-compose*.yml rust-api/application.yaml` 無明文 URL

**Checkpoint**:三 user story 全 functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + scope 邊界驗證。

- [ ] T018 Constitution Compliance 自我覆查:
    * (a)`git -C base-web status --short` 空(§I.1 未碰 base-web);diff 不含 `base-web/`
    * (b)`git diff --name-only <base>..HEAD` 改動範圍 = `rust-api/`(worktree)+ `docker-compose*.yml` + `application.yaml`(在 rust-api) + specs/CLAUDE.md;**未拷 rev1 code**(§I.5;sys_user schema 衍生自 mock/DESIGN)
    * (c)`grep -c "✅ Pass" specs/007-db-redis-connection/plan.md` ≥ 14(Constitution 7+7)
    * (d)`/health` 維持 liveness(純 ok、未加 per-request DB/Redis 探測);未建 sys_user 以外 entity 表(`psql -c '\dt'` 只見 sys_user + seaql_migrations);未做 Casbin adapter / cleanup_database_url 接線(FR-012)
    * (e)dep 版本 = pin stable(`grep -E 'sea-orm|redis|argon2' rust-api/Cargo.toml` 對上 1.1.20/1.2/0.5.3、無 prerelease)

**Checkpoint**:feature 完整、可進 `superpowers:executing-plans`(★ rust-api 改動走兩段式 commit)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**:無依賴
- **Foundational(Phase 2)**:依 Setup;**阻斷所有 user story**(deps + config + compose)
- **US1(Phase 3,P1)**:依 Foundational;MVP;需 dev stack
- **US2(Phase 4,P2)**:依 Foundational;獨立於 US1(migration binary 自連 DB)
- **US3(Phase 5,P3)**:依 Foundational(config struct/compose 已落);本 phase = 單測 + acceptance
- **Polish(Phase 6)**:依所有 user story

### Within Phases

- Phase 2:T002 → T003(config 用 deps 型)→ T004 → T005(可與 T003/T004 並行,不同檔)
- Phase 3:T006/T007 [P](不同檔)→ T008(用前兩者型)→ T009(boot 串接)→ T010 acceptance
- Phase 4:T011 → T012/T013 [P](不同 migration 檔)→ T014 → T015 acceptance
- Phase 5:T016 → T017

### Parallel Opportunities

- US1(連線層,docker)/ US2(migration)在 Foundational 後可並行推進(改不同檔);US3 為單測+acceptance、依 Foundational
- T006/T007 [P](infra/db vs infra/redis);T012/T013 [P](兩 migration 檔)

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T005)→ US1(T006-T010)
2. **STOP and VALIDATE**:dev stack up、rust-api 連 DB+Redis、log connected
3. 達 MVP:連線層 + AppState + fail-fast

### Incremental Delivery

1. Setup → Foundational → US1(MVP:連線層)
2. + US2(migration pipeline proof:sys_user + seed)
3. + US3(config 單測 + secret/compose 驗證)
4. Polish(Constitution self-check + scope 邊界)
5. `superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree)+ 外層 SHA pin + merge --no-ff 回 `rev2-admin-root` + 更新 CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy(executing-plans 階段)

- Foundational(T002-T005):一個 implementer(deps + config + compose,順序相依)
- US1(T006-T010):一個 implementer(連線層 + boot,需 dev stack acceptance)
- US2(T011-T015):一個 implementer(migration crate + proof,需 DB acceptance)
- US3(T016-T017):同/另一 implementer(config 單測 + secret/compose grep)
- Polish(T018):查核
- **★ commit 紀律**:rust-api worktree 改動走 §4.1 兩段式;executing-plans 把 task 編成 unit、各 unit spec+quality 雙審

---

## Notes

- **dep 版本全 pin stable**(sea-orm 1.1.20 / sea-orm-migration 1.1.20 / redis 1.2 / argon2 0.5.3;CLAUDE.md §6);redis 1.2 為 user 拍板選 max stable,impl 時 `cargo doc` 再確認 feature 名([research R3](./research.md))。
- **帳號名 `Super`/`Admin`/`User`**(rev2 權威 DESIGN §11.1 + mock;§8.1 `Soybean/...` 為 rev1 stale,連帶 follow-up 修 §8.1 不在本 feature)。
- **sys_user 最小欄位**(id/user_name/password);roles/status/soft-delete 留 soft-delete(#2)。
- **scope 邊界**(FR-012):不建其餘 entity 表 / 不做 Casbin adapter / 不接 cleanup_database_url / 不做業務 endpoint / 不改 JWT / `/health` 不改 readiness。
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V)。
- `superpowers:executing-plans` 階段把這 18 個 task 編成 execution unit + 派 fresh implementer subagent。
