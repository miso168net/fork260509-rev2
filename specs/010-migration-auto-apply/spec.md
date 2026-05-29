# Feature Specification: migration-auto-apply

**Feature Branch**: `010-migration-auto-apply`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "@docs/superpowers/010-migration-auto-apply.md"（dev/prod 應用 stack 啟動時自動套用 schema migration —— 啟動即套、API 起來前完成、失敗則擋下 API）

**Phase 0 brainstorm source**: [`docs/superpowers/010-migration-auto-apply.md`](../../docs/superpowers/010-migration-auto-apply.md)

---

## Clarifications

### Session 2026-05-29

- Phase 0 brainstorm 已凍結全部 5 項設計決策（D1 範圍=dev+prod 對齊 / D2 機制=專用一次性 migrate 步驟 + 完成閘門 / D3 fail-fast / D4 冪等每次跑 / D5 outer-only 無兩段式 commit），見 [`docs/superpowers/010-migration-auto-apply.md`](../../docs/superpowers/010-migration-auto-apply.md)。本 feature 忠實落地,非自由設計。spec 0 [NEEDS CLARIFICATION]。
- 「應用 stack 啟動即自動套 migration」為補位 [CHECKLIST §2.12 / §2.10](../../docs/INTEGRATION-CHECKLIST.md) 的 migration 套用 gap;**不變更 007 已凍結契約**（FR-009:API server 與 migration runner 維持獨立、server 不自動跑 migration）。
- 全 taxonomy 掃描:無 spec-level critical ambiguity 需正式 clarify。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 開發 stack 啟動即自動套好 migration（Priority: P1）🎯 MVP

開發者用單一啟動指令把開發環境 stack 拉起來時,所有未套用的 schema migration 會在 API 開始服務**之前自動套好**,**不需任何額外的手動步驟**。亦即:拉起 stack → 資料庫 schema 已是最新 → API 正常服務,一氣呵成。

**Why this priority**:這是本 feature 的核心價值與 MVP —— 目前開發者每次拉 stack 後都得記得手動跑一次 migration 指令,否則 API 對著舊/空 schema 跑;每個帶 migration 的後續 feature（audit log 起）驗收都要重複這個易漏的手動步。把「啟動即套」做掉,後續所有 schema 工作的開發/驗收都一致可靠。

**Independent Test**:從一個全新（空）資料庫,單一指令拉起開發 stack;不執行任何額外 migration 指令,即可看到 schema 已建立、預設資料已 seed、API 健康。即驗。

**Acceptance Scenarios**:

1. **Given** 一個全新（空）資料庫,**When** 拉起開發 stack,**Then** 所有現有 migration 被自動套用（schema + seed 就緒）且 API 健康,過程中無需任何手動 migration 指令
2. **Given** 一個 schema 已是最新的資料庫,**When** 再次拉起開發 stack,**Then** 不重複套用任何 migration（無副作用)、API 正常起來
3. **Given** 新增了一個尚未套用的 migration,**When** 拉起開發 stack,**Then** 該 migration 在 API 起來前被自動套上

---

### User Story 2 — 生產 stack 啟動即自動套好 migration（對齊）（Priority: P2）

生產環境 stack 拉起時,同樣在 API 開始服務之前自動套好未套用的 migration,行為與開發環境一致。

**Why this priority**:dev/prod 行為對齊,避免「dev 自動、prod 手動」的落差造成部署時遺漏或不一致;補位既有的 prod migration 套用路徑缺口。P2(開發體驗痛點先解=P1,生產對齊緊接其後)。

**Independent Test**:用生產 stack 設定拉起,不執行額外 migration 指令,schema 被自動套好、API 健康。即驗。

**Acceptance Scenarios**:

1. **Given** 生產 stack 設定,**When** 拉起,**Then** 未套用的 migration 在 API 起來前被自動套好、API 健康
2. **Given** 開發與生產兩種 stack 設定,**When** 各自拉起,**Then** 「啟動即自動套」行為一致

---

### User Story 3 — migration 失敗時擋下 API（fail-fast）（Priority: P3）

若自動套用 migration 過程失敗,API **不得啟動**,且拉起指令**回報失敗**。避免 API 對著未套用 / 半套用的 schema 開始服務。

**Why this priority**:安全收尾 —— 沒有它,migration 失敗時 API 可能照樣起來、對著壞 schema 服務,造成隱晦錯誤。但它防的是異常路徑,正常路徑由 US1/US2 覆蓋,故為收尾正確性。P3。

**Independent Test**:刻意讓一個 migration 失敗,拉起 stack;確認 API 未啟動、拉起指令以失敗(非零)收場。即驗。

**Acceptance Scenarios**:

1. **Given** 一個會失敗的 migration,**When** 拉起 stack,**Then** API 不啟動、拉起指令回報失敗
2. **Given** migration 全數成功,**When** 拉起 stack,**Then** API 正常啟動(閘門放行)

---

### Edge Cases

- **資料庫已最新**:再次拉起 → migration 全跳過(冪等 no-op)、API 直接起。
- **migration 中途失敗**:fail-fast,API 被擋、拉起回報失敗(US3)。
- **全新資料庫**:完整 schema + seed 一次套好(US1)。
- **重複拉起**:每次拉起都安全(冪等),不累積副作用。
- **自動只前進**:自動套用只做「前進(套用)」;回滾(rollback)不自動執行(需人工)。

---

## Requirements *(mandatory)*

### Functional Requirements

**自動套用**

- **FR-001**:拉起應用 stack MUST 在 API 開始服務**之前**自動套用所有未套用的 migration,**不需**任何獨立的手動 migration 步驟
- **FR-002**:migration 套用 MUST 以**獨立於 API server 的步驟/程序**執行;API server 本身 MUST NOT 自行套用 migration（維持 007 FR-009:server 與 migration 獨立)
- **FR-003**:migration 自動套用 MUST 冪等 —— 對 schema 已最新的資料庫拉起 stack MUST 不套用任何東西、且 API 正常起來

**失敗行為**

- **FR-004**:若 migration 自動套用失敗,API MUST NOT 啟動,且拉起指令 MUST 回報失敗(非零結果)

**範圍 / 對齊**

- **FR-005**:「啟動即自動套」行為 MUST 同時適用於開發與生產兩種 stack 設定(對齊)
- **FR-006**:自動套用 MUST 只做前進(套用 / "up");rollback MUST NOT 自動執行

**範圍邊界（不做）**

- **FR-007**:本 feature MUST NOT 修改 API server boot 使其自行套 migration(守 FR-009);MUST NOT 修改 migration runner 程式或其映像建置 / entrypoint(既有已支援套用指令);MUST NOT 改動既有 schema / seed 行為或 `/health`;MUST NOT 實作自動 rollback

### Key Entities

本 feature 不引入新資料實體（僅編排既有 migration 的套用時機）。

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:從空資料庫,單一次拉起 stack 即得「API 健康 + 所有現有 migration 已套用(schema + seed 就緒)」,**零**手動 migration 指令(可驗)
- **SC-002**:對 schema 已最新的資料庫拉起 stack,API 健康起來且無錯誤(冪等 no-op,可驗)
- **SC-003**:當 migration 失敗時,API 不啟動、拉起回報失敗(可驗:正反向)
- **SC-004**:開發與生產兩種設定皆具備相同的「啟動即自動套」行為(可驗)
- **SC-005**:套用本 feature 後,既有 API 行為(`/health`、預設帳號 seed)不被破壞(可驗)

---

## Assumptions

- **設計決策已凍結**:brainstorm 階段 user 親決 5 項(D1-D5),見 [`docs/superpowers/010-migration-auto-apply.md`](../../docs/superpowers/010-migration-auto-apply.md);本 feature 忠實落地,非自由設計。
- **migration runner 已冪等**:007 已建立 `seaql_migrations` 追蹤 + conflict-safe seed,自動每次拉起都安全(本 feature 不需另造冪等機制)。
- **連線憑證沿用既有機制**:migration 套用步驟透過既有 secret 機制取得資料庫連線(不新增憑證來源)。
- **007 FR-009 維持**:server 不自動 migrate;本 feature 新增的是「外部的自動套用步驟 + 啟動閘門」,非 server-boot migration。
- **outer-only**:本 feature 只動應用 stack 的編排設定(外層),不改 rust-api worktree 內任何程式 / 映像 / entrypoint;故無兩段式 commit。

### 不在 scope

standalone 單一服務的 stack 設定(niche dev aid,列 follow-up);生產部署的 CI / 編排 invocation 細節(Phase 5 部署時細化,本 feature 只保證「stack 拉起即自動套」);自動 rollback;migration runner / server / 映像建置的任何程式變更。
