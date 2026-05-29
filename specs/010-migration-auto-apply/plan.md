# Implementation Plan: migration-auto-apply

**Branch**: `010-migration-auto-apply` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-migration-auto-apply/spec.md`

**Brainstorm**: [`docs/superpowers/010-migration-auto-apply.md`](../../docs/superpowers/010-migration-auto-apply.md)（Phase 0,5 決策 D1-D5 凍結）

---

## Summary

rev2 第 10 個 spec-kit feature、**Phase 2 P1 基礎設施補位**（[CHECKLIST §2.12 / §2.10](../../docs/INTEGRATION-CHECKLIST.md) migration 套用 gap;audit log feature 前置）。**讓 dev/prod 應用 stack `up` 時自動套用 sea-orm migration、API 起來前完成、失敗則 fail-fast 擋下 API**。機制:compose 新增一個一次性 `migrate` service（dev 跑 `cargo run --bin migration up`、prod 經 entrypoint dispatcher 跑 `migration up`),`rust-api`(server) 以 `depends_on: migrate: condition: service_completed_successfully` 閘門等它跑完。守 007 FR-009(server 不自動 migrate — migrate 維持獨立 process)。**本 feature outer-only**:只動 `docker-compose.yml` / `.dev.yml` / `.prod.yml` 三個外層檔,**完全不碰 rust-api worktree**(不改 server/migration code、不改 Dockerfile/entrypoint)→ **無兩段式 commit**。無新資料實體、無 wire/DTO、無業務 endpoint。

---

## Technical Context

**Language/Version**:無新程式碼 —— 純 docker-compose 編排。沿用既有 rust-api 1.86 image(`deploy/Dockerfile.rust-api.txt` dev/runtime target)。

**Primary Dependencies**（既有,無新增）:
- docker-compose(top-level `name: rev2-admin`,Compose v2 spec — `depends_on` long-syntax 支援 `condition: service_completed_successfully`)。
- 既有 `deploy/Dockerfile.rust-api.txt`(dev target = cargo-watch;runtime target = entrypoint.sh dispatcher 已支援 `migration`)。
- 既有 `database_url` secret(`./deploy/secrets/database_url.txt`,top-level `secrets:` 已宣告)。
- migration binary(007 已是可跑的 sea-orm `cli::run_cli`,冪等)。

**Storage**:Postgres(既有;不改 schema,只編排 migration 套用時機)。

**Testing**:
- **無單元測試** —— 本 feature 為 compose wiring,無新純邏輯函式(理由寫進 tasks/plan,對齊 [CLAUDE.md §3](../../CLAUDE.md))。
- Acceptance（C-V）:[contracts/verification-commands.md](./contracts/verification-commands.md) §1-§4（dev stack up 自動套 + 冪等 / fail-fast / prod stack up / FR-009 regression）。

**Target Platform**:容器(docker compose dev/prod stack)。

**Project Type**:部署 / infra 編排(outer compose only;無 source code crate)。

**Performance Goals**（對應 spec SC）:dev/prod 啟動即自動套(SC-001/SC-004)、冪等 no-op(SC-002)、fail-fast(SC-003)、既有不破(SC-005)。

**Constraints**:
- 守 007 FR-009 — migrate 維持獨立 process,server 不自動 migrate(不改 server boot)。
- outer-only — 不改 rust-api worktree(server/migration code / Dockerfile / entrypoint 皆不動)。
- 自動只前進(`up`),不自動 rollback。
- 不繼承 rev1 code（§I.5);research 只 grep rev2 deploy 產物。

**Scale/Scope**:3 個外層 compose 檔改動(base + dev + prod);新增 1 個 `migrate` service + rust-api 1 條 depends_on 閘門。standalone `docker-compose.rust-api.yml` 不在 scope(follow-up)。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | N/A — migration 套用時機編排,不涉特定 endpoint;反而讓 Phase 3+ schema 工作驗收更可靠 | ✅ Pass |
| 2 | 動到 base-web inline? | 否 — 只動 3 個外層 compose 檔,完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不涉 menu/auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock? | N/A — 無 wire/DTO/envelope/id 型/error code;純編排 | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | 否 — 無任何 code(compose config);research 只 grep rev2 deploy 產物(compose/Dockerfile/entrypoint/secrets),**未 grep rev1**（§I.5;**RUSTAPI-SOURCE-ISOLATION** §III.1，且本 feature 連 rust-api source 都不動) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | 不違反;無拍板項受影響(§11.11 `/api` 前綴等皆不涉) | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 不動 base-web inline/build;屬 deploy/infra 編排,連 rust-api source 都不碰(RUSTAPI-SOURCE-ISOLATION 範圍外) | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/010-migration-auto-apply/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交(16/16 PASS、0 提問)
├── research.md          # Phase 0(本次,R1-R5)
├── contracts/
│   └── verification-commands.md   # Phase 1(本次,C-V §1-§4)
├── quickstart.md        # Phase 1(本次)
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16/16 PASS)
```

> **無 data-model.md** —— 本 feature 不引入新資料實體(僅編排既有 migration 的套用時機);spec Key Entities 段已明示。

### Source Code (repository root)

```text
# outer compose 檔(本 feature 全部改動範圍;無 rust-api worktree 變更)
docker-compose.yml          ← base:新增 migrate service 骨架 + rust-api 加 depends_on: migrate (service_completed_successfully)
docker-compose.dev.yml      ← dev override:migrate(target dev / image :dev / bind-mount source / entrypoint cargo run --bin migration / command up)
docker-compose.prod.yml     ← prod override:migrate(target runtime / image :latest / command ["migration","up"] 走 entrypoint dispatcher)
```

**Structure Decision**:本 feature **outer-only** —— 只動 3 個外層 compose 檔,**不動 rust-api worktree**(不改 server/migration code、Dockerfile、entrypoint)。故**無兩段式 commit**,所有改動單段落在 `010-migration-auto-apply` feature branch。不屬任何 base-web ★ 軌道;連 RUSTAPI-SOURCE-ISOLATION(改 rust-api source)都不觸及,純 deploy/infra 編排。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 migrate service + `service_completed_successfully` 閘門 / R2 dev migrate override〔cargo + bind-mount + entrypoint 覆寫〕/ R3 prod migrate override〔entrypoint dispatcher〕/ R4 DATABASE_URL 經 `database_url` secret 接線 / R5 `up --wait` 與一次性 service 退出語意 + fail-fast）。

**結論**:5 項全解析、0 NEEDS CLARIFICATION。無新外部 dep、無新 image。**遵守 §I.5**:只 grep rev2 deploy 產物(`docker-compose*.yml` / `Dockerfile.rust-api.txt` / `entrypoint.rust-api.sh` / `migration/src/main.rs` / `secrets/`),未 grep / 未拷 rev1。

---

## Phase 1 Status

Design:
- **無 data-model.md**(不引入新資料實體)。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)— C-V acceptance §1-§4（dev stack up 自動套 + 冪等 / fail-fast 閘門 / prod stack up / FR-009 regression grep）。
- [`quickstart.md`](./quickstart.md)— Path A dev 自動套驗證 / Path B fail-fast 驗證 / Path C prod。

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新)。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項:

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — Phase 1 contracts 純 migration 套用編排,無特定業務 endpoint | ✅ Pass |
| 2 | 仍否 — 未碰 base-web | ✅ Pass |
| 3 | 仍 N/A | ✅ Pass |
| 4 | 仍 N/A — 無 wire/DTO;contracts 為 stack up + psql 驗收 | ✅ Pass |
| 5 | research/contracts 純 rev2 deploy 編排;未拷 rev1、未動 rust-api source | ✅ Pass |
| 6 | 仍不違反 §II | ✅ Pass |
| 7 | 仍不觸 ★ 軌道;outer compose only | ✅ Pass |

**結果**:7 項仍全 PASS。Phase 1 設計未引入 base-web 改動 / wire endpoint / menu / rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。
