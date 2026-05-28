# Implementation Plan: db-redis-connection

**Branch**: `007-db-redis-connection` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-db-redis-connection/spec.md`

**Brainstorm**: [`docs/superpowers/007-db-redis-connection.md`](../../docs/superpowers/007-db-redis-connection.md)（Phase 0,5 決策凍結）

---

## Summary

rev2 第七個 spec-kit feature、**Phase 2 P1 基礎設施起點**：rust-api 建立 Postgres（sea-orm）+ Redis 連線層基礎。boot 時建立並 fail-fast 驗證兩連線（`db.ping()` / Redis `PING`）、握在 `AppState`（cheap-clone）供 Phase 3+ 取用；`migration` crate 從 stub 變成真正的 sea-orm-migration runner，附 1 個 **proof migration** 建 `sys_user`（最小欄位 `id`/`user_name`/`password`）+ seed 3 帳號（`Super`/`Admin`/`User`、argon2id of `123456`）；compose 接上 005 的 `database_url`/`redis_url` secret。`/health` 維持 liveness。本 feature **動 rust-api worktree**（→ 兩段式 commit）+ 外層 compose/docs；不涉 base-web、不涉 wire endpoint、不建其餘 entity 表、不做 Casbin adapter。

---

## Technical Context

**Language/Version**：Rust 1.86（`rust-api/rust-toolchain.toml`）；edition 2021。

**Primary Dependencies**（新增,版本 pin stable、皆 MSRV < 1.86、無 prerelease,符合 CLAUDE.md §6;見 [research.md](./research.md)）：
- `sea-orm = "1.1.20"`（features `sqlx-postgres`, `runtime-tokio-rustls`, `macros`）
- `sea-orm-migration = "1.1.20"`（features `sqlx-postgres`, `runtime-tokio-rustls`）
- `redis = "1.2"`（features `tokio-comp`, `connection-manager`;user 拍板選 max stable）
- `argon2 = "0.5.3"`（seed hash 生成）
- `async-trait`（migration crate）
- 既有：axum 0.7 / tokio 1 / serde / serde_yaml / tracing / anyhow

**Storage**：PostgreSQL（sea-orm + sqlx-postgres）；Redis（連線管理器,本 feature 僅連線驗證、未做業務讀寫）。proof schema = `sys_user`（1 表）。

**Testing**：
- 單元測試：config 反序列化 + URL secret 載入（`cargo test -p server config`）。
- Acceptance（C-V，需真 DB/Redis）：[contracts/verification-commands.md](./contracts/verification-commands.md) §1-§4。

**Target Platform**：容器（rust-api dev/prod image）+ dev stack（postgres / redis-stack）。

**Project Type**：Rust backend 連線層基礎（rust-api worktree source + 外層 compose/docs）。

**Performance Goals**（對應 spec SC）：dev stack 5 service healthy（SC-001）；boot log 顯示連線成功 / fail-fast（SC-002）；sys_user 3 帳號 + 冪等（SC-003）；無明文密碼 + secret 掛載（SC-004）；config 單測通過（SC-005）。

**Constraints**：
- fail-fast：連線失敗即非零退出（沿用既有 `.expect()` 風格）。
- 機密走既有 `load_secret`（`_FILE`>envvar + validate len≥32，URL 通過）。
- `sys_user` 最小欄位（roles/status/soft-delete 留 soft-delete #2）。
- 不繼承 rev1 code（§I.5）。

**Scale/Scope**：rust-api workspace（server + migration crate）+ `docker-compose.yml`/dev override + `application.yaml`；新增 ~5 server 模組（config 擴充 / infra/db / infra/redis / state / main wiring）+ migration crate（Migrator + 2 migration）。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項：

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?rust-api 未提供 base-web 用到的 endpoint? | N/A — 純連線層基礎、不涉任何 wire endpoint;base-web 不依賴本 feature 的直接 endpoint | ✅ Pass |
| 2 | 動到 base-web inline? | 否 — 只動 rust-api worktree + 外層 compose/application.yaml/docs,完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不涉 menu/auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock? | N/A 無 wire endpoint;**且** sys_user seed(`Super/Admin/User`、id i64)主動對齊 mock ground truth + DESIGN §11.1 拍板(非 rev1 §8.1) | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?grep rev1? | 否 — research 只 grep rev2 產物(rust-api/源倉/DESIGN/MOCK-AUDIT/base-web typings)+ crate 官方版本;sys_user schema 衍生自 mock/DESIGN 權威、非 rev1;屬 **RUSTAPI-SOURCE-ISOLATION**(§III.1,全新寫、設計繼承 code 不繼承) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | 不違反;§11.1 拍板(`Super/Admin/User`)本 feature 正確遵循 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 走 **RUSTAPI-SOURCE-ISOLATION**(§III.1 預設可動、無需額外授權);不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG ★ | ✅ Pass |

**結論**：7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/007-db-redis-connection/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交
├── research.md          # Phase 0（本次,R1-R4）
├── data-model.md        # Phase 1（本次,5 entity）
├── quickstart.md        # Phase 1（本次）
├── contracts/
│   └── verification-commands.md   # Phase 1（本次,C-V §1-§4）
└── checklists/
    └── requirements.md  # /speckit-specify 已交（16/16 PASS）
```

### Source Code (repository root)

```text
# rust-api worktree（→ 兩段式 commit）
rust-api/Cargo.toml                          ← workspace deps 加 sea-orm/sea-orm-migration/redis/argon2/async-trait
rust-api/application.yaml                     ← 加 database: section（max_connections / connect_timeout_secs）
rust-api/server/src/config.rs                ← 加 DatabaseConfig/RedisConfig + AppConfig::load() 載 URL secret
rust-api/server/src/infra/db.rs              ← 新：connect_postgres + ping
rust-api/server/src/infra/redis.rs           ← 新：connect_redis + PING
rust-api/server/src/infra/mod.rs             ← 新：infra 模組
rust-api/server/src/state.rs                 ← 新：AppState{db, redis}
rust-api/server/src/main.rs                  ← boot 序加連線建立 + fail-fast + .with_state
rust-api/migration/src/lib.rs                ← 新：Migrator(MigratorTrait)
rust-api/migration/src/m*_create_sys_user.rs ← 新：建表
rust-api/migration/src/m*_seed_sys_user.rs   ← 新：seed 3 帳號
rust-api/migration/src/main.rs               ← stub → cli::run_cli(Migrator)
rust-api/migration/Cargo.toml                ← 加 sea-orm-migration/async-trait/tokio/argon2

# 外層（007 feature branch,單段）
docker-compose.yml                           ← top-level secrets 加 database_url/redis_url；rust-api service 掛 secret + APP_*_URL_FILE env
docker-compose.dev.yml                       ← dev rust-api 對應接線（如需）
```

**Structure Decision**：本 feature **同時動 rust-api worktree source 與外層 compose/docs** —— 與 003-006（純 workspace-level）不同。rust-api 內檔走 **§4.1 兩段式 commit**（worktree commit+push → 外層 `git add rust-api` bump SHA pin）；compose/spec docs 為外層檔（落 007 feature branch）。屬 **RUSTAPI-SOURCE-ISOLATION** 軌道（§III.1）。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 sys_user schema/seed + §8.1 stale 發現 / R2 sea-orm 版本+pattern / R3 redis 版本+pattern / R4 config 整合）。

**結論**：4 項全解析、0 NEEDS CLARIFICATION。**遵守 §I.5**：只 grep rev2 產物 + crate 官方版本,未拷 rev1;帳號名以 rev2 權威覆蓋 §8.1 stale。版本全 pin stable。

---

## Phase 1 Status

Design：
- [`data-model.md`](./data-model.md)— 5 entity（DatabaseConfig / RedisConfig / AppConfig 擴充 / AppState / sys_user proof 表 + 3 seed）
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)— C-V acceptance §1-§4
- [`quickstart.md`](./quickstart.md)— Path A 編譯+config 單測 / B migration / C 連線層 boot

**Agent context update**：CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 plan（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項：

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — Phase 1 contracts 純連線/migration,無 wire endpoint | ✅ Pass |
| 2 | 仍否 — 未碰 base-web | ✅ Pass |
| 3 | 仍 N/A | ✅ Pass |
| 4 | 仍 N/A wire;sys_user seed 對齊 mock(Super/Admin/User、id i64)、data-model 明示 | ✅ Pass |
| 5 | 仍否 — data-model/contracts 純 rust-api 自建 + crate 官方;未拷 rev1 | ✅ Pass |
| 6 | 仍不違反 §II;§11.1 拍板遵循 | ✅ Pass |
| 7 | 仍 RUSTAPI-SOURCE-ISOLATION（非 ★）、授權邊界內 | ✅ Pass |

**結果**：7 項仍全 PASS。Phase 1 設計未引入 base-web 改動 / wire / menu / rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。
