# Feature Specification: dockerfile-rust-api

**Feature Branch**: `001-dockerfile-rust-api`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "rust-api Phase 1 #1: 3 crate workspace 骨架 + axum 啟動 + _FILE secret loader + multi-stage Dockerfile + standalone compose"

**Phase 0 brainstorm source**: [`docs/superpowers/001-dockerfile-rust-api.md`](../../docs/superpowers/001-dockerfile-rust-api.md)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 部署起點 (Priority: P1)

rev2 開發者拿到空的 rust-api worktree(只有 `LICENSE` 與 `.gitignore`),想要從 0 跑出一個能回應健康檢查的容器化 backend baseline,作為後續 JWT / migration / 業務 endpoint 等 feature 累積的基座。

**Why this priority**:此 feature 是 Phase 1-5 所有後續 feature 的硬前提 — 沒有「能 build 成 image 並啟動」的 baseline,任何 JWT 機密管理 / soft-delete / 業務 endpoint 都無從疊加。屬部署起點(對應 rev1 W-F1)。

**Independent Test**:從 workspace root 跑 prod build 命令、然後跑 prod profile 啟動容器、最後 `curl http://127.0.0.1:21081/health` 回 `ok` HTTP 200,即可獨立驗證價值。

**Acceptance Scenarios**:

1. **Given** rust-api worktree 為空(無 Cargo.toml 等),**When** 跑「初始化 + prod build」命令序列,**Then** 容器 image 建立成功、含 server / migration / cleanup-job 三個可執行入口
2. **Given** image 已 build、合法 secret 已配置,**When** 跑 prod profile 啟動容器,**Then** server 在 port 21081 listening、`/health` 回 plain text `ok` HTTP 200
3. **Given** server 容器跑起來,**When** 用 entrypoint 切到 `migration` 或 `cleanup-job`,**Then** 對應 binary 印出 stub 訊息並正常 exit(非 fatal error)

---

### User Story 2 — Dev 熱重載 (Priority: P2)

rev2 開發者改 server source code 後,希望容器內**自動 rebuild + restart server**,不用手動 `docker compose up --build` 全段 rebuild;改完一行到 curl 反映新行為的迭代時間需在分鐘級內。

**Why this priority**:沒有此功能,日常迭代每次都要等 1-2 分鐘 full rebuild,嚴重拖慢 Phase 2+ 各 feature 開發節奏。但本 feature 仍能在無熱重載下交付 P1(prod build + 啟動 + 健康檢查),故為 P2。

**Independent Test**:跑 dev profile 容器、`curl /health` 確認回 `ok`、改 source 內 `/health` handler 回 `ok-v2`、等 60 秒、再 `curl /health` 應回 `ok-v2`。

**Acceptance Scenarios**:

1. **Given** dev profile 容器跑起來、`/health` 回 `ok`,**When** 開發者改 server source 一行(改 `/health` 回值),**Then** 容器內偵測到變更並自動 rebuild + restart,60 秒內 `curl /health` 反映新值

---

### User Story 3 — Boot panic 自我保護 (Priority: P3)

operator 不慎用佔位 secret(`change-me`)/ 長度過短 secret / 完全未設 secret 啟動 server 時,server 必須在 boot 階段 panic 並印出明確錯誤訊息,**禁止啟動成功**;避免「prod 啟動後才發現用了預設 secret」的安全事故。

**Why this priority**:此防護避免最嚴重的安全事故(prod 跑了預設 secret),但只在 misuse 時觸發、不在 happy path 內。P1 跑通即知 strict validation 默默過了,P3 是 explicit「跑壞」驗收。

**Independent Test**:三條 misuse 路徑各跑一次,確認 server 都 boot panic 且錯誤訊息可定位問題:
- `APP_JWT_JWT_SECRET=change-me` → panic 訊息含「placeholder value」
- `APP_JWT_JWT_SECRET=too_short` → panic 訊息含「length < 32」
- 未設 `APP_JWT_JWT_SECRET` 也未設 `APP_JWT_JWT_SECRET_FILE` → panic 訊息含「neither ... nor ... set」

**Acceptance Scenarios**:

1. **Given** dev/prod profile,**When** 給 secret 黑名單值(`change-me` 等),**Then** server boot 在 5 秒內 panic、log 含明確的「placeholder value」識別字串
2. **Given** 同前,**When** secret 長度 < 32 字元,**Then** server boot panic、log 含「length ... < 32」
3. **Given** envvar 與 `_FILE` 都未設,**When** server 啟動,**Then** boot panic、log 含「neither {KEY} nor {KEY}_FILE set」
4. **Given** envvar 設黑名單值、同時 `_FILE` 指向合法值檔案,**When** server 啟動,**Then** boot **成功**(`_FILE` 優先讀檔、envvar 被無視)、`/health` 回 `ok`

---

### Edge Cases

- secret 給**空字串**或**全空白**:過 validation 視為 empty → boot panic
- `_FILE` 路徑指向**不存在的檔案**:read 失敗 → boot panic + 路徑訊息
- `_FILE` 路徑指向**空檔**:trim 後空字串 → 過 validation panic
- source bind mount 後 `cargo target/` 目錄寫到 host 造成 WSL2 9P 慢:對 user 透明(由 named volume mask 解決)
- 第一次 build 因 cargo deps 大量下載需 5-10 分鐘:接受,後續 incremental build < 1 分鐘

---

## Requirements *(mandatory)*

### Functional Requirements

**Container image baseline**

- **FR-001**: 系統 MUST 提供單一 container image,包含三個可執行入口:`server`(HTTP)、`migration`(DB schema CLI)、`cleanup-job`(soft-delete 物理清理)
- **FR-002**: 系統 MUST 透過 entrypoint dispatcher 讓同一 image 切換到三個入口的任一個,compose service 用簡短 command 名(如 `["server"]` / `["migration"]` / `["cleanup-job"]`)指定
- **FR-003**: runtime image MUST 以 non-root user(uid 10001)執行,避免容器內 process 取得 root 權限

**Health endpoint**

- **FR-004**: server 入口 MUST 在 port 21081 listening、提供 `/health` 端點回 plain text `ok` HTTP 200
- **FR-005**: `/health` MUST 不走任何 authentication / authorization middleware(無 token 也能訪問)

**Secret loading + validation**

- **FR-006**: 系統 MUST 支援 `_FILE` 模式:envvar `<KEY>_FILE` 設置時優先讀檔案內容,作為 secret 值
- **FR-007**: `_FILE` 未設時,系統 MUST fallback 到 bare envvar `<KEY>`
- **FR-008**: 兩者皆未設時,server MUST 在 boot 階段 panic、不進入 listening 狀態
- **FR-009**: 所有 secret(無論來源 `_FILE` 或 envvar)MUST 過 strict validation:非空、不在 placeholder 黑名單(至少含 `change-me` / `secret` / `xxx` / `<TO_BE_SET>` / `TODO` 等)、長度 ≥ 32
- **FR-010**: validation 失敗 MUST boot panic、輸出明確錯誤訊息(含 envvar key 名 + 失敗類型)
- **FR-011**: 系統 MUST 用同一機制處理至少 2 個 secret:`APP_JWT_JWT_SECRET` 與 `APP_JWT_REFRESH_TOKEN_SECRET`(同一 loader function、各自獨立驗證)

**Dev hot reload**

- **FR-012**: dev 模式 MUST 在 server source code 變動時偵測並自動 rebuild + restart server,無需開發者手動觸發
- **FR-013**: dev 模式 MUST bind mount workspace source 進容器,容器內讀的就是 host 最新內容
- **FR-014**: dev 模式 cargo build target 目錄 MUST 不寫回 host(避免 WSL2 9P 慢與 target/ 污染 worktree)

**Prod build pipeline**

- **FR-015**: prod build MUST 用 multi-stage,builder image 含完整 toolchain,runtime image 僅含執行所需 runtime lib + 3 binary
- **FR-016**: build pipeline MUST 跨 build 共享 cargo cache(registry / git deps / target artifact),避免每次完整重抓 deps
- **FR-017**: 系統 MUST 提供 standalone compose 檔(獨立於未來整套 stack),內含 dev 與 prod 兩個 profile

**Config + non-secret**

- **FR-018**: 系統 MUST 提供 `application.yaml` 結構(server host/port、JWT TTL 等非機密欄位)
- **FR-019**: `application.yaml` MUST 不含任何 secret 值或 secret placeholder(secret 完全走 envvar / `_FILE` 路徑)

**Anti-patterns**

- **FR-020**: 系統 MUST 不使用 `docker-compose.override.yml` auto-load(避免 dev override 誤暴露到 prod)
- **FR-021**: 系統 MUST 不繼承 rev1 rust source code(對齊 RUSTAPI-SOURCE-ISOLATION 軌道、避免「答案污染」)

### Key Entities

- **container image (rev2-admin-rust-api)**:rev2 backend 的唯一可部署單元;含 3 binary entrypoint + entrypoint dispatcher + non-secret config + non-root user
- **secret**:從 envvar 或 file 載入、過 strict validation 的機密字串;v1 含 `jwt_secret` 與 `refresh_token_secret` 兩個
- **standalone compose**:獨立 compose 檔(`docker-compose.rust-api.yml`),與未來整套 stack 解耦,提供 dev / prod profile 切換
- **placeholder 黑名單**:strict validation 拒絕的 6 個 placeholder 字串集合(`change-me` / `changeme` / `secret` / `xxx` / `<TO_BE_SET>` / `TODO`,case-insensitive)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: rev2 開發者從空 worktree 到「prod build 完成 + dev container 跑起來 + `curl /health` 回 ok」的完整時間 < 15 分鐘(首次 build,含 cargo deps 下載)
- **SC-002**: 改 server source 一行後,dev 容器在 60 秒內偵測 + rebuild + restart 完成,`/health` 反映新行為
- **SC-003**: 三條 boot panic 路徑(黑名單 / 長度不足 / 未設)各在 server 啟動的 5 秒內 panic,錯誤訊息含 envvar key + 失敗類型字串(operator 不用 grep source code 就能定位)
- **SC-004**: prod runtime image 大小 < 200MB(對齊 debian-slim baseline + 3 binary)
- **SC-005**: 從 prod profile 切到 migration / cleanup-job entrypoint 各印出 stub 訊息並正常 exit(exit code 0、非 fatal),verify 3 binary 都進了 image
- **SC-006**: `grep -r "<TO_BE_SET>" rust-api/` 結果為空(對應 DESIGN §4.6.1 placeholder 完整性驗收)

---

## Assumptions

- **Host 環境**:rev2 開發者在本機已裝 docker 23+(BuildKit 自動啟用);WSL2 環境下 bind mount 路徑可達、`127.0.0.1` loopback 可從 Windows host 訪問(mirrored networking 或 WSL IP)
- **Worktree 狀態**:rust-api worktree 起點為空(僅 `LICENSE` + `.gitignore` + `x_fork.branch-origin.md`);本 feature 從零建立 Cargo workspace 與 source
- **Secret 生成**:operator 第一次跑 prod profile 前用 `openssl rand -base64 48` 生成兩個 JWT secret 到 `deploy/secrets/*.txt`;統一生成腳本留給 Phase 1 #5
- **Build 時間**:首次 build 接受 5-10 分鐘(cargo deps 抓取);incremental rebuild(只改 server source)接受 30 秒-1 分鐘
- **後續 feature 邊界**(留給對應 Phase):
  - DB / Redis / Casbin / 業務 endpoint:Phase 2-4
  - migration 真實 logic(sea-orm-migration + entity migration):Phase 2 migration feature
  - cleanup-job 真實 logic(soft-delete 物理清理 + cron):Phase 5 cleanup-job feature
  - 9 個其他 secret 範本檔 + 統一生成腳本 + dual-write docs:Phase 1 #5
  - 整套 docker-compose.yml + dev/prod override + obs override:Phase 1 #4
- **軌道授權**:本 feature 屬 `RUSTAPI-SOURCE-ISOLATION` 軌道(DESIGN §7.6),不繼承 rev1 source code、只繼承 rev1 設計沉澱(brainstorm 001 已萃取);不涉及 base-web 任何軌道
- **Constitution v1.0.0 對齊**:Phase 0 brainstorm §8 Compliance 預檢通過(7 項對 §IV)— 本 feature 純基建、不涉及 base-web / Casbin / wire envelope / 三端對齊等 §I-V 條款的 active 適用範圍
- **不在 scope**:CI/CD pipeline(GitHub Actions 等);cross-platform build(本 feature 只關注本機 dev + 單 host prod);image signing / SBOM;observability(留給 Phase 6)
