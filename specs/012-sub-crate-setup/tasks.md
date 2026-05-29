---
description: "Task list for 012-sub-crate-setup implementation"
---

# Tasks: sub-crate-setup

**Input**: Design documents from `/specs/012-sub-crate-setup/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **無新純函式邏輯**（拷貝既有 crate + wiring）→ **由 acceptance（活體 smoke）覆蓋**，本 tasks 明示「無新單元測試、由 smoke 覆蓋」；拷貝 crate 自帶單測一併納入、確認在 rev2 tokio runtime 下綠。
- **adapter round-trip / casbin_rule 表**需真實 DB → C-V 整合驗證對 dev live postgres（[verification §1/§3](./contracts/verification-commands.md)），in-crate `#[ignore]` + env-gate（沿用 011 harness）。
- **無 HTTP 業務 endpoint / 無 enforce 接線**（enforce 屬 Phase 3）→ 無 CDP/curl 業務消費者，smoke 直接呼 crate API。

**Organization**：6 phase；3 個 user story phase 各對應 spec US1（adapter round-trip）/US2（xdb 解析）/US3（casbin_rule via migration）+ acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔/crate、無未完依賴）
- **[Story]**：User Story phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 rust-api worktree 內相對路徑（`rust-api/` 為 worktree root）

> **★ commit 提醒**：本 feature **動 rust-api worktree**（新增 2 crate + migration）→ **兩段式 commit**（worktree commit + push fork `rev2-admin-rust-api`，再回外層 bump SHA pin；同 007/008/009/011）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）；commit/push/merge 於 `executing-plans` / `finishing` 階段處理。

> **★ 拷貝治理**：sea-orm-adapter / xdb 自 rev1 `fork260509-rev1/rust-api/{sea-orm-adapter,xdb}` 拷貝，屬 §11.6 / constitution §I.5 **明文授權例外**；各 crate 須標 rev1 來源 commit。

---

## Phase 1: Setup (Pre-flight)

**Purpose**：確認前置就緒。

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`；外層在 `012-sub-crate-setup`；`docker run ... rev2-admin-rust-api:dev test`（無 DB）綠（25+3 ignored server + 17 entity_access_lint，011 既有基線）；確認**尚無** sub-crate（`ls rust-api/sea-orm-adapter rust-api/xdb rust-api/migration/src/m20260529_000005_create_casbin_rule.rs` 皆不存在）；確認 rev1 拷貝來源可得（`ls /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api/{sea-orm-adapter,xdb} /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api/server/resources/ip2region.xdb`）。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：兩工具 crate 引入 + 編譯相容 + casbin_rule schema —— US1/US2/US3 共同前提。**必須先完成才進 user story**。

- [ ] T002 拷貝 `sea-orm-adapter`：把 rev1 `rust-api/sea-orm-adapter/{src,Cargo.toml}` 拷到 `rust-api/sea-orm-adapter/`；`Cargo.toml` 的 `authors/publish/version/edition.workspace` 改為 concrete 值（rev2 workspace 無 `[workspace.package]`）；保留 `[features] default = ["postgres","runtime-tokio-rustls"]`；`Cargo.toml` 加註 rev1 來源 commit（§11.6 授權拷貝）。`rust-api/Cargo.toml` workspace `members` 加 `"sea-orm-adapter"`、`[workspace.dependencies]` 加 `casbin = { version = "2.20", default-features = false }`（user 拍板 bump、[research R2](./research.md)）（[data-model](./data-model.md)）
- [ ] T003 [P] 拷貝 `xdb`：把 rev1 `rust-api/xdb/{src,Cargo.toml}` 拷到 `rust-api/xdb/`；`*.workspace` 對齊 concrete；`rust-api/Cargo.toml` `members` 加 `"xdb"`、`[workspace.dependencies]` 加 `once_cell`（如缺）；`ip2region.xdb` 從 rev1 `server/resources/` 拷到 `rust-api/xdb/resources/`（或 implementer 依 xdb default 路徑決定、tasks 註明）；調 searcher default 路徑對齊 rev2；`Cargo.toml` 加註 rev1 來源 commit（[research R4](./research.md)）
- [ ] T004 **casbin 2.20 × adapter 相容性閘門（最高風險）**：`docker run ... rev2-admin-rust-api:dev build -p sea-orm-adapter -p xdb`。**過 → 進 T005**；**不過（casbin 2.10→2.20 的 `casbin::Adapter` trait 簽名/型 drift）→ 依 casbin 2.20 Adapter trait 修 `sea-orm-adapter/src/adapter.rs`（最小修補、保持語意），並在 [plan.md](./plan.md) 補 Deviation Log（同 010 D-1 格式：背景/處置/驗證）**。對應 spec FR-002 + [verification §0](./contracts/verification-commands.md)
- [ ] T005 在 `migration/src/m20260529_000005_create_casbin_rule.rs` 新增建表 migration：`up()` 呼 `sea_orm_adapter::up(manager.get_connection())`、`down()` 呼 `sea_orm_adapter::down(...)`（單一 schema 來源、避免手寫 DDL 與 adapter drift，[research R3](./research.md)）；`migration/Cargo.toml` 加 dep `sea-orm-adapter`（path）；`migration/src/lib.rs` 加 `mod` + `Box::new(...005...::Migration)`。並**確認/補** `sea-orm-adapter/src/migration.rs` 的 `create_table` 帶 `.if_not_exists()`（grep 確認；rev1 原碼若未帶則補）→ 使 adapter `new()` 重複呼叫 `up()` 成無害 no-op（**FR-005 調和關鍵**）。**驗證 `sea_orm_adapter::up` 同時建出 `casbin_rule` 表 + unique index `(ptype,v0..v5)`**（migration 005 委派此單一來源、不另手寫 DDL，[research R3](./research.md)）

**Checkpoint**：兩 crate 編譯（casbin 2.20 相容）+ casbin_rule schema 經 migration 005 就緒；entity-access lint 仍綠（新 crate 不在 `server/src` 掃描範圍）

---

## Phase 3: User Story 1 — 授權政策可被可靠地儲存與重載（活體證明）（Priority: P1）🎯 MVP

**Goal**：透過 sea-orm-adapter 對 live postgres 寫入一筆 casbin policy、重載仍在 —— 證 casbin 2.20 + runtime-tokio-rustls 在 rev2 真接通。

**Independent Test**：dev stack（010 自動套表、casbin_rule 已建）→ 建 Enforcer（最小 RBAC model + 此 adapter）→ add_policy → save → 重載 → 斷言 policy 存在 + casbin_rule 有列。

- [ ] T006 [US1] 寫 adapter round-trip 活體 smoke（in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`；放 `sea-orm-adapter/src/` 測試模組或 `server/src/` 依 implementer，沿用 011 harness）：連 `DATABASE_URL` → 建最小 RBAC casbin model 字串 + `Adapter::new(conn)` 組 `Enforcer` → `add_policy(["alice","data1","read"])` → `save_policy` → 重建 Enforcer 重載 → 斷言該 policy 在重載結果中。**無新純函式單元測試（拷貝+wiring）→ 由本 smoke 覆蓋**。對應 spec US1 + SC-001 + 執行環境對齊 SC-002（[verification §1](./contracts/verification-commands.md)）
- [ ] T007 [US1] Acceptance：[verification §1](./contracts/verification-commands.md) —— dev stack up（postgres + `run --rm migrate` 套 001..005）；跑 T006 smoke（`docker run --network rev2-admin_rev2_net -e DATABASE_URL=... ... test -- --ignored`）→ 綠；psql 斷言 `casbin_rule` 有 `p,alice,data1,read` 列。**＋ FR-005 idempotency 顯性驗證**：T006 的 `Adapter::new(conn)` 在 migration 005 已建表「之後」仍成功（不報 `relation "casbin_rule" already exists`）—— 即證 adapter 自動建表為無害 no-op、casbin_rule 唯一權威建立者為 migration 005、FR-005 調和成立。對應 spec US1 + SC-001/SC-002

**Checkpoint**：US1 達成（adapter 在 rev2 runtime 真能 round-trip policy）= MVP

---

## Phase 4: User Story 2 — 由 IP 解析地理地區（Priority: P2）

**Goal**：xdb 以 `ip2region.xdb` 解析已知 IP → 非空地區字串。

**Independent Test**：解析 `1.2.4.8` → 回非空、格式合理地區字串。

- [ ] T008 [P] [US2] 寫/納入 xdb 解析 smoke（`xdb` crate 自帶單測若有則確認綠；否則加一個 `#[test]` 解析已知 IP）：以引入的 `ip2region.xdb` 解析 `1.2.4.8` → 斷言回傳非空、格式合理（分段格式如 `國|區域|省|市|ISP`）。無需 DB（純資料檔）。對應 spec US2 + SC-002（[verification §2](./contracts/verification-commands.md)）

**Checkpoint**：US1+US2 = 政策儲存 + IP 解析兩工具地基皆證可用

---

## Phase 5: User Story 3 — 授權政策表經系統標準 schema 機制建立（Priority: P3）

**Goal**：casbin_rule 由 migration 005 經 010 自動套建立（無手動步驟）、server 不自動 migrate。

**Independent Test**：乾淨環境拉起 → casbin_rule 已存在、seaql_migrations 含 005、server boot 未自動 migrate。

- [ ] T009 [US3] Acceptance：[verification §3](./contracts/verification-commands.md) —— `SELECT to_regclass('public.casbin_rule')` 非 null；`seaql_migrations` 含 `m20260529_000005_create_casbin_rule`；**FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中（server 不自動 migrate；adapter `new()` 的 `migration::up` 屬 adapter crate、非 server/src）；casbin_rule **無 `deleted_at` 欄**（scope 邊界）。對應 spec US3 + SC-003

**Checkpoint**：三 user story 全達成（adapter round-trip / xdb 解析 / casbin_rule 經自動 schema 機制建）

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**：既有不破 + Constitution Compliance 自查 + 契約守恆 + scope 邊界。

- [ ] T010 既有不破 + 契約守恆 + Constitution 自查（[verification §4](./contracts/verification-commands.md)）：
    * (a) 既有測試全綠：`docker run ... rev2-admin-rust-api:dev test`（25+3 ignored server + 17 entity_access_lint；新 crate 自帶單測一併綠）
    * (b) **009 entity-access lint 續綠**：`cargo test -p server entity_access_lint`（新 crate 不在 `server/src` 掃描範圍、不觸 lint）
    * (c) `/health` 不破：dev stack 起 rust-api → `curl -fsS http://127.0.0.1:21081/health` = ok；seed `WHERE deleted_at IS NULL` >= 3
    * (d) **FR-009 regression**（同 T009、最終覆查）：server 不自動 migrate、grep 0 命中
    * (e) **scope 邊界**：未接 enforce / 未加 axum-casbin（`grep -rn "axum_casbin\|Enforcer" rust-api/server/src/` 無命中）；casbin_rule 無 deleted_at / 無 protected 欄；未對 policy 加 soft-delete/audit/CRUD（皆 Phase 3 受管 policy 層）
    * (f) **拷貝治理**：sea-orm-adapter / xdb 各 `Cargo.toml` 已標 rev1 來源 commit（§11.6 授權出處）
    * (g) `grep -c "✅ Pass" specs/012-sub-crate-setup/plan.md` ≥ 14（Constitution 7+7）；若 T004 觸發 adapter 修補 → plan Deviation Log 已補

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup；**阻斷所有 user story**（兩 crate 引入 + casbin 2.20 編譯閘門 + casbin_rule migration）
- **US1(Phase 3,P1)**：依 Foundational（T002 adapter + T004 編譯 + T005 casbin_rule 表）；MVP
- **US2(Phase 4,P2)**：依 Foundational（T003 xdb + T004 編譯）；與 US1 獨立
- **US3(Phase 5,P3)**：依 Foundational（T005 migration）；驗證自動套
- **Polish(Phase 6)**：依所有 user story

### Within / Cross Phases

- T002（adapter）→ T004（編譯閘門）→ T005（migration 呼 adapter up）序列（同涉 adapter）。
- T003（xdb）與 T002 [P]（不同 crate）；但 T004 編譯閘門同時涵蓋兩 crate、建議 T002+T003 後一起跑 T004。
- US1（T006→T007）依 T004+T005；US2（T008）依 T003+T004、與 US1 [P]（不同 crate、無共用狀態，但 acceptance 共用 stack 序列驗）。
- US3（T009）依 T005，可與 US1 acceptance 一併驗（共用 stack up）。

### Parallel Opportunities

- T002（adapter 拷貝）/ T003（xdb 拷貝）[P]（不同 crate）；但都改 `rust-api/Cargo.toml`（workspace members/deps）→ 同檔協調、建議序列或小心 merge。
- T008（xdb smoke、無 DB）與 US1 acceptance [P]（不同 crate）；live-DB acceptance（T007/T009）共用 dev stack、序列驗。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T005，**T004 編譯閘門為最高風險、過不了先修 adapter**)→ US1（T006 smoke + T007 acceptance）
2. **STOP and VALIDATE**：dev stack adapter round-trip 綠 + casbin_rule 有列 = casbin 2.20 在 rev2 真接通
3. 達 MVP：授權政策儲存可靠運作

### Incremental Delivery

1. Foundational → US1 adapter round-trip（MVP 核心）
2. + US2 xdb 解析
3. + US3 casbin_rule 自動套驗證
4. + Polish（既有不破 + lint 續綠 + FR-009 regression + scope 邊界 + 拷貝治理）
5. `superpowers:finishing-a-development-branch` → **兩段式 commit**（worktree commit + push fork `rev2-admin-rust-api` + 外層 bump SHA pin）+ merge --no-ff 回 `rev2-admin-root` + 回填 DESIGN/CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy（executing-plans 階段）

- Foundational(T002-T005)：拷貝兩 crate + 編譯閘門 + migration（**T004 是 go/no-go 閘門，過不了先處理 adapter 相容**）。建議 adapter（T002/T004/T005）一個 implementer 連續處理（同涉 adapter + casbin 版本），xdb（T003/T008）可另一單元。
- US1(T006-T007)/ US2(T008)/ US3(T009)：smoke + acceptance，各對照 spec 驗收
- Polish(T010)：守恆 + 查核
- **★ commit 紀律**：兩段式 commit（動 rust-api worktree）；各 unit spec+quality 雙審

---

## Notes

- **兩段式 commit feature**：動 rust-api worktree（新增 2 crate + migration），與 007/008/009/011 同；與 010 outer-only 不同。
- **首個「拷貝 rev1」feature**：sea-orm-adapter / xdb 屬 §11.6 / constitution §I.5 **明文授權例外**（非破例）；標 rev1 出處 commit。Constitution Check item 5 已 Pass（授權例外）。
- **最高風險 = casbin 2.10→2.20 adapter Adapter-trait 相容**（T004 閘門）；user 知情接受 bump（§6 surface）。
- **runtime 非問題**（brainstorm「async-std→tokio」已於 research R2 修正：adapter 既有 `runtime-tokio-rustls` default）。
- **scope 邊界**：axum-casbin 重寫 / enforce 接線 / 受管 policy 層（soft-delete/protected/audit/CRUD）/ policy seed = Phase 3（[DESIGN §10 Phase 3](../../docs/INTEGRATION-DESIGN.md)）。
- 守 007 FR-009（casbin_rule 經 010 自動套、server 不自動 migrate）+ 009 entity-access lint（新 crate 不在 server/src）。
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md Deviation Log（Constitution v1.0.0 §V）。
- `superpowers:executing-plans` 階段把這 10 個 task 編成 execution unit + 派 fresh implementer subagent。
