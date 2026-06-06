---
description: "Task list — 030 refresh-token cleanup job + same-second login fix"
---

# Tasks: Refresh-Token Cleanup Job + Same-Second Login Fix

**Input**: Design documents from `/specs/030-cleanup-job/`

**Prerequisites**: [plan.md](plan.md) ✅、[spec.md](spec.md) ✅、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/](contracts/)（cli-contract + verification-commands C1–C6）

**Tests**: **included** —— constitution §I.4 強制 TDD;本 feature 有可獨立測純函式（`purge_cutoff`、jti 同秒互異）→ test-first（red→green）;cleanup 副作用由 in-crate `#[ignore]` live postgres + acceptance C-V 覆蓋。

**Organization**: 依 user story 分組（US1 cleanup-job / US2 jti）。**兩 story 互相獨立**：US1 是 cleanup-job binary（需 Phase 1 deps）;US2 是 server `jwt.rs` 內部欄（無 Phase 1 依賴、可平行先行）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔、無未完依賴）
- **[Story]**：US1 / US2
- 路徑為 workspace root 相對;rust-api 內檔在 **rust-api worktree**（收尾走 §4.1 兩段式 commit）

---

## Phase 1: Setup（cleanup-job 依賴接線）

**Purpose**: cleanup-job crate 建置前置（僅 US1 需要;US2 不依賴本階段）

- [ ] T001 在 `rust-api/Cargo.toml` `[workspace.dependencies]` 加 `chrono`（pin 對齊 sea-orm 鏈：先 `dcargo tree -i chrono` 取版本再寫;範式同既有 `tokio-stream` 註解 `Cargo.toml:24-27`）
- [ ] T002 在 `rust-api/cleanup-job/Cargo.toml` 加 deps：`entity` / `sea-orm` / `tokio` / `anyhow` / `chrono`（皆 `{ workspace = true }`;sea-orm 取 `delete_many`/`count` 所需 feature 沿 workspace 定義）— 依賴 T001

---

## Phase 2: Foundational（Blocking Prerequisites）

**⚠️ 無共享 foundational 任務。** US1（cleanup-job）與 US2（jti）是獨立垂直切片：US1 走 Phase 1 deps + 自有 migration;US2 僅改 server `jwt.rs`（`uuid` 已是 server dep、無新前置）。兩者可平行。**Checkpoint**：US2 可立即開工;US1 待 Phase 1 完成。

---

## Phase 3: User Story 1 — 維運者清掉已過期的 token 記錄（Priority: P1）🎯 MVP

**Goal**: on-demand `cleanup-job` binary 用純過期規則（`expires_at < now()-60s`、任何 status）安全移除「JWT 必已失效、永不可能再被 rotate() 查到」的列;dry-run 預設、`--execute` 才刪。

**Independent Test**: seed 各態列 → dry-run 回報 N 且 0 改變 → `--execute` 只刪過期超 margin（未過期含 used/revoked + active + 過期僅 30s 者全存活）→ re-run 刪 0（冪等）。

### Tests for User Story 1（TDD — 先寫、確認 FAIL）⚠️

- [ ] T003 [P] [US1] 在 `rust-api/cleanup-job/src/main.rs` 的 `#[cfg(test)] mod tests` 寫：① 純單元 `purge_cutoff(fixed_now, 60) == fixed_now - 60s`;② `#[ignore]` live postgres 整合測（seed `active-過期 / active-未過期 / used-grace內 / used-過期 / revoked-未過期 / revoked-過期 / 過期僅30s`;assert dry-run count 正確且 0 改變、execute 後只 `expires_at<cutoff` 列消失、再 execute 刪 0）。此刻應編譯失敗 / FAIL（fn 未實作）。

### Implementation for User Story 1

- [ ] T004 [P] [US1] 建 `rust-api/migration/src/m20260529_000030_index_sys_token_expires_at.rs`：`up` 用 `Index::create().name("idx_sys_token_expires_at").table(SysToken).col(ExpiresAt)`（idiom 對照 `m20260529_000026_create_sys_token.rs:92-100` 的 `idx_sys_token_chain`）;`down` `drop_index`。並在 `rust-api/migration/src/lib.rs` 註冊（`mod` 區 + `migrations()` vec 末，接在 m029 後）
- [ ] T005 [US1] 實作 `rust-api/cleanup-job/src/main.rs`：純 `purge_cutoff` fn（→ T003 單元 green）;env-load 鏡像 `migration/src/main.rs:6-14`（`DATABASE_URL`→`APP_DATABASE_URL_FILE` 讀檔 trim→`APP_DATABASE_URL`）;`sea_orm::Database::connect`;手寫 arg（無 arg=dry-run / `--execute`）;dry-run `entity::sys_token::Entity::find().filter(Column::ExpiresAt.lt(cutoff)).count(&db)`;execute `delete_many().filter(<同>).exec(&db)`;stdout/exit 依 `contracts/cli-contract.md`（依賴 T002、T003）
- [ ] T006 [US1] 跑 T003 的 `#[ignore]` live 整合測至 green（`dcargo test -p cleanup-job -- --ignored`，連 live postgres;先確認 migration 已套、stack 狀態 per memory `devstack-acceptance-restart`）（依賴 T004、T005）
- [ ] T007 [US1] 在 `docker-compose.yml` 加 `cleanup-job` service（`profiles: ["jobs"]` + `restart: "no"` + `APP_DATABASE_URL_FILE: /run/secrets/cleanup_database_url` + `secrets: [cleanup_database_url]` + `command: ["cleanup-job"]`）並在頂層 `secrets:` 加 `cleanup_database_url`（`file: ./deploy/secrets/cleanup_database_url.txt`，已存在）;`docker-compose.dev.yml` 加 dev override（`target:` + `cargo run --bin cleanup-job`）、`docker-compose.prod.yml` 加 prod override（`command: [cleanup-job]`）—— 鏡像 `migrate` service（依賴 T005 提供 binary 語意）

**Checkpoint**: US1 可獨立驗（dry-run/execute/冪等對帳）。

---

## Phase 4: User Story 2 — 同一秒內連續登入都成功（Priority: P2）

**Goal**: 為 `Claims` 加 per-token `jti`（每次 `sign()` 一個 fresh uuid）→ 同秒兩 token 的 JWT byte-distinct → `token_hash = sha256(JWT)` 不撞 UNIQUE。零 wire 影響（base-web opaque）。

**Independent Test**: 同一秒兩次 `sign()` → 兩 JWT / 兩 `sha256_hex` 互異且 verify round-trip 帶 jti;活體同秒平行 curl login×2 → 兩者皆 `0000`、無 5000 撞鍵。**不依賴 US1 / Phase 1。**

### Tests for User Story 2（TDD — 先寫、確認 FAIL）⚠️

- [ ] T008 [P] [US2] 在 `rust-api/server/src/auth/jwt.rs` `#[cfg(test)] mod tests` 寫：同一 `iat`（模擬同秒）兩次 `sign()` → 兩 token 字串互異 + 兩 `model::facade::sys_token::sha256_hex` 互異;且 `verify` round-trip 仍成功（含新 jti 欄）。此刻應編譯失敗（Claims 無 jti）/ FAIL。

### Implementation for User Story 2

- [ ] T009 [US2] 在 `rust-api/server/src/auth/jwt.rs`：`Claims`（`:29-47`）加 `pub jti: String`;`sign()`（`:80`）建 Claims 前 `let jti = uuid::Uuid::new_v4().to_string();` 設入;**原子補全 4 個手鑄 Claims test 站點** `jti`：`:157`(sign_with_past_exp)、`:243`(with_sid)、`rust-api/server/src/auth/bearer.rs:128`(sign_expired)、`rust-api/server/src/auth/session.rs:342`(claims helper)。⚠️ `jwt.rs:201/226` 的 `LegacyClaims` 是另一刻意無 sid struct、**不**加 jti。→ T008 green、`dcargo test -p server` 全綠（依賴 T008）

**Checkpoint**: US1 與 US2 各自獨立可用。

---

## Phase 5: Polish & Acceptance（Cross-Cutting）

- [ ] T010 Acceptance **C1 prod image build**（§3 紀律，新實作 workspace binary;驗 US1 cleanup-job binary）：`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api` + 驗 binary 在 runtime stage（`docker run … sh -c 'ls -l /usr/local/bin/cleanup-job'`）（依賴 T005、T007）
- [ ] T011 Acceptance **活體 C2/C3/C4/C6**（`contracts/verification-commands.md`）：C2 索引存在 + up→down→up 可逆;C3 cleanup dry-run/execute/冪等 re-run 對帳;C4 jti 同秒平行 curl login×2 皆過 + token_hash distinct;C6 一般 `up` 不啟 cleanup-job。**jti 改 code 後須重建+重啟 rust-api**（WSL2 inotify，memory `devstack-acceptance-restart`）（依賴 T006、T009）
- [ ] T012 [P] 回填 `docs/INTEGRATION-DESIGN.md` §10 Phase 5 cleanup-job as-built（純過期規則 / 60s margin / profile:[jobs] / jti 修）+ 對齊實作微調 research/quickstart（若實作中發現偏差）

> **收尾（非 task，executing-plans 完成全 task 後走 `superpowers:finishing-a-development-branch`）**：rust-api worktree 兩段式 commit（§4.1）→ 外層 SHA pin → `git merge --no-ff` 回 `rev2-admin-root` → CHECKLIST/MILESTONES 歸檔。**push / merge 嚴禁出現在收尾之前**（constitution §I.4 / CLAUDE.md §3）—— 故不列為 task。

---

## Dependencies & Execution Order

### Phase 依賴
- **Setup（P1）**：T001 → T002（chrono 須先在 workspace 才能 `workspace=true`）。僅 US1 需要。
- **Foundational（P2）**：無（兩 story 獨立）。
- **US1（P3）**：T002 後可開工;內部 T003+T004 可平行 → T005（需 T002+T003）→ T006（需 T004+T005）→ T007（需 T005）。
- **US2（P4）**：**無前置**，T008 → T009;可與整個 US1 平行。
- **Polish（P5）**：T010 需 US1 impl;T011 需 US1+US2 impl;T012 可平行。

### User Story 獨立性
- **US1（cleanup-job）**：自足 binary + migration + compose;不碰 server / base-web。
- **US2（jti）**：僅 server `jwt.rs`/`bearer.rs`/`session.rs`;不碰 cleanup-job / migration / base-web。
- 兩者零交叉依賴 → 可分別 deliver。

### Within US1
- 測（T003）先寫 FAIL → 實作（T005）green;migration（T004）與測平行;live（T006）在 impl+migration 後;compose（T007）在 impl 後。

### Parallel Opportunities
- T003（test）∥ T004（migration）—— 不同檔。
- 整個 **US2（T008→T009）∥ US1** —— 不同 crate、零依賴。
- T012（docs backfill）∥ 其他 polish。

---

## Parallel Example

```bash
# US2 可與 US1 完全平行（不同 crate）：
#   Track A（US1）: T001→T002→{T003∥T004}→T005→T006→T007
#   Track B（US2）: T008→T009         （server crate，獨立）
# 匯流於 Polish：T010（US1 prod build）+ T011（US1+US2 活體）
```

---

## Implementation Strategy

### MVP First（US1 only）
1. Phase 1 Setup（T001–T002）
2. US1（T003–T007）→ **STOP & VALIDATE**：dry-run/execute/冪等對帳（spec US1 Independent Test）
3. = 可交付 MVP（sys_token 維運清理上線）

### Incremental
1. Setup → US1（cleanup-job MVP）→ 驗
2. US2（jti 修）→ 驗同秒登入 → 拔 028 C4「≥1s gap」caveat
3. Polish：prod build（C1）+ 全 C-V 活體（C2–C6）+ DESIGN as-built

---

## Notes

- **TDD**：T003 / T008 為 test-first（先 FAIL）;對應 impl 使其 green。
- **entity 直存僅 cleanup-job**（009 lint 只掃 server/src，`entity_access_lint.rs:348`）;server/jwt 改動不碰 entity。
- **rust-api 改動在 worktree**：T001–T011 觸及的 rust-api 檔，收尾走 §4.1 兩段式 commit（worktree commit+push fork → 外層 SHA pin）+ merge —— **皆收尾階段、不在本 tasks**。
- **WSL2**：jti / cleanup 改 code 後 live 驗前須重建+重啟對應容器（inotify 不可靠）。
- **無新純函式測試的部分**（compose / migration wiring）由 acceptance C-V 覆蓋（§3 紀律已於 plan/contracts 明示）。
- 每個 task 或邏輯群完成後 commit（worktree 內;push 留收尾）。
