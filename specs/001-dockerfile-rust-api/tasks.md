---
description: "Task list for 001-dockerfile-rust-api implementation"
---

# Tasks: dockerfile-rust-api

**Input**: Design documents from `/specs/001-dockerfile-rust-api/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) 開頭紀律):
- **Unit tests**(TDD red→green):`server/src/config.rs` 內 `load_secret` + `validate_secret` 8 條(純函式邏輯)— Foundational phase 內完成
- **Acceptance**(C-V contract):其餘 wiring / 形狀對映類由 [verification-commands.md](./contracts/verification-commands.md) 7 段 acceptance 覆蓋,**不**寫 integration/e2e Rust test(無新純函式邏輯要測)— 此紀律已在 spec + plan 明示

**Organization**: 6 個 phase,3 個 user story phase 各對應 spec 內 P1/P2/P3 story + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: 在 User Story phase 內必加(US1 / US2 / US3);Setup / Foundational / Polish 無 story label
- 全部 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**:建立 Cargo workspace root files 與 application.yaml + `.dockerignore`。所有後續 phase 的硬前提。

- [ ] T001 Create `rust-api/Cargo.toml` — workspace 設定:`[workspace] members = ["server", "migration", "cleanup-job"]` + `resolver = "2"` + `[workspace.dependencies]`(axum 0.7 / tokio 1 / serde 1 + derive / serde_yaml 0.9 / tracing 0.1 / tracing-subscriber 0.3 + env-filter,json / anyhow 1 / thiserror 1)
- [ ] T002 [P] Create `rust-api/rust-toolchain.toml` — `[toolchain] channel = "1.86"`(對齊 §8.1 image base)
- [ ] T003 [P] Create `rust-api/application.yaml` — non-secret config(server.host/port + jwt.access_token_ttl_secs/refresh_token_ttl_secs + logging.level/format),依 [contracts/application-yaml-schema.md](./contracts/application-yaml-schema.md) §「Default values」
- [ ] T004 [P] Create `rust-api/.dockerignore` — 排除 `target/` + `*.md` + `.git` + `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:3 crate 骨架 + secret loader logic(TDD red→green)+ minimal axum server + Dockerfile + entrypoint + compose + secret 範本檔。**所有 user story 都需此 phase 完成才能 verify**。

**⚠️ CRITICAL**: 無 user story 任務可在此 phase 完成前開始

### Crate skeletons(可並行)

- [ ] T005 [P] Create `rust-api/server/Cargo.toml` — `[package] name="server"` + `[[bin]] name="server" path="src/main.rs"` + `[dependencies]` 引 workspace deps(axum / tokio / serde / serde_yaml / tracing / tracing-subscriber / anyhow / thiserror)
- [ ] T006 [P] Create `rust-api/migration/Cargo.toml` — `[package] name="migration"` + `[[bin]] name="migration" path="src/main.rs"`(無 deps,stub 不需)
- [ ] T007 [P] Create `rust-api/cleanup-job/Cargo.toml` — `[package] name="cleanup-job"` + `[[bin]] name="cleanup-job" path="src/main.rs"`(無 deps)

### Stub bins(可並行)

- [ ] T008 [P] Implement `rust-api/migration/src/main.rs` — `fn main() { println!("migration stub — will be implemented in Phase 2 migration feature"); }`
- [ ] T009 [P] Implement `rust-api/cleanup-job/src/main.rs` — `fn main() { println!("cleanup-job stub — will be implemented in Phase 5 cleanup-job feature"); }`

### Secret loader(TDD red→green,sequential)

- [ ] T010 Create `rust-api/server/src/config.rs` — struct definitions(`AppConfigYaml` + `AppConfig` + `ServerConfig` + `JwtYaml` + `JwtConfig` + `LoggingConfig`)+ `const PLACEHOLDER_SECRETS: &[&str] = &["change-me", "changeme", "secret", "xxx", "<TO_BE_SET>", "TODO"]` + `fn load_secret(key: &str) -> anyhow::Result<String> { unimplemented!() }` + `fn validate_secret(key: &str, v: &str) -> anyhow::Result<()> { unimplemented!() }` + `impl AppConfig { pub fn load() -> anyhow::Result<Self> { unimplemented!() } }`(對齊 [contracts/secret-loader.md](./contracts/secret-loader.md) + [contracts/application-yaml-schema.md](./contracts/application-yaml-schema.md))
- [ ] T011 **[TDD red]** Write 8 unit tests in `rust-api/server/src/config.rs` `#[cfg(test)] mod tests` block per [contracts/secret-loader.md](./contracts/secret-loader.md) §「Test contract」:`load_secret_panics_when_neither_set` / `load_secret_reads_from_file_when_FILE_set` / `load_secret_falls_back_to_envvar_when_FILE_not_set` / `load_secret_FILE_takes_precedence_over_envvar` / `validate_secret_rejects_empty` / `validate_secret_rejects_placeholders`(loop 6 black list values + case variations)/ `validate_secret_rejects_short` / `validate_secret_accepts_32_or_longer_non_blacklist`。tests 寫完應 compile 過、runtime fail(unimplemented! panic)
- [ ] T012 **[TDD green]** Implement `load_secret` + `validate_secret` + `AppConfig::load` bodies in `rust-api/server/src/config.rs` per [contracts/secret-loader.md](./contracts/secret-loader.md) §「Precedence」+「Validation rules」;all 8 tests must pass

### Minimal server entry

- [ ] T013 Implement `rust-api/server/src/main.rs` — `mod config;` + `#[tokio::main] async fn main()` 內:(1) `AppConfig::load().expect("config load failed (boot panic by design)")` (2) `init_tracing(&cfg.logging)`(`tracing_subscriber::EnvFilter::try_new(&cfg.level).unwrap_or_else(_  EnvFilter::new("info"))` + match `cfg.format.as_str()` "pretty"→.pretty() else→.json())(3) `Router::new().route("/health", get(health))` (4) `tokio::net::TcpListener::bind(format!("{}:{}", cfg.server.host, cfg.server.port))` + `axum::serve` + `tracing::info!(?addr, "rust-api server listening")`;`async fn health() -> &'static str { "ok" }`

### Image build pipeline(可並行)

- [ ] T014 [P] Create `deploy/Dockerfile.rust-api.txt` — 3 stage `builder`(`rust:1.86-slim-bookworm` + apt `pkg-config libssl-dev` + COPY `rust-api/Cargo.toml/.lock/rust-toolchain.toml` + COPY 3 crate + BuildKit cache mount `cargo build --release --bins` + cp to /out)、`dev`(`rust:1.86-slim-bookworm` + apt + `cargo install cargo-watch --locked` + `ENTRYPOINT ["cargo", "watch", "-x", "run --bin server"]`)、`runtime`(`debian:bookworm-slim` + apt `libssl3 ca-certificates curl tzdata` + groupadd/useradd uid 10001 rustapi + COPY binaries + COPY entrypoint.sh + chmod +x + COPY application.yaml + USER rustapi + EXPOSE 21081 + HEALTHCHECK + ENTRYPOINT/CMD);全文對齊 [contracts/entrypoint-dispatcher.md](./contracts/entrypoint-dispatcher.md) + [contracts/health-endpoint.md](./contracts/health-endpoint.md) + research §2
- [ ] T015 [P] Create `deploy/entrypoint.rust-api.sh` — POSIX sh `case "$1"` 切 server/migration/cleanup-job(對 server `exec /usr/local/bin/server`,migration/cleanup-job 各自 `shift; exec ... "$@"`,unknown stderr usage + `exit 64`)+ shebang `#!/bin/sh` + `set -e`(對齊 [contracts/entrypoint-dispatcher.md](./contracts/entrypoint-dispatcher.md))
- [ ] T016 [P] Create `deploy/secrets/jwt_secret.txt.example` — 含註解「`# 範例值,實際請用 openssl rand -base64 48 > deploy/secrets/jwt_secret.txt`」+ example body line(內容必為 placeholder 黑名單字串、確保誤用會 boot panic)
- [ ] T017 [P] Create `deploy/secrets/refresh_token_secret.txt.example` — 同 T016 結構

### Compose orchestration

- [ ] T018 Create `docker-compose.rust-api.yml` at workspace root — `services: rust-api-dev`(profile dev,build target dev,bind mount + named volumes,port `127.0.0.1:21081:21081`,environment `APP_JWT_JWT_SECRET / APP_JWT_REFRESH_TOKEN_SECRET` default 長度 ≥ 32 非黑名單值,`RUST_LOG="info,tower_http=debug"`)+ `rust-api`(profile prod,build target runtime,port `127.0.0.1:21081:21081`,environment `APP_JWT_JWT_SECRET_FILE=/run/secrets/jwt_secret + APP_JWT_REFRESH_TOKEN_SECRET_FILE=/run/secrets/refresh_token_secret`,secrets 連到 `deploy/secrets/*.txt`)+ `secrets:`(jwt_secret/refresh_token_secret file refs)+ `volumes:`(rust_api_cargo_cache + rust_api_target);對齊 [contracts/compose-profiles.md](./contracts/compose-profiles.md)

### Foundation gates(sequential — 須前面全成才能跑)

- [ ] T019 Verify `docker compose -f docker-compose.rust-api.yml --profile dev run --rm rust-api-dev cargo test --bin server -- config::tests` — 8 unit tests 全 PASS(TDD green confirmation;user host 無 cargo、走 in-container)
- [ ] T020 Verify `DOCKER_BUILDKIT=1 docker compose -f docker-compose.rust-api.yml --profile prod build` 三 stage 成功 + `docker run --rm --entrypoint=ls rev2-admin-rust-api:latest /usr/local/bin/` 含 `server  migration  cleanup-job  entrypoint.sh`(對應 [contracts/verification-commands.md](./contracts/verification-commands.md) §1)

**Checkpoint**: Foundation 就緒 — 所有 user story 可以開始 acceptance verify

---

## Phase 3: User Story 1 — 部署起點 (Priority: P1) 🎯 MVP

**Goal**:operator 跑 prod profile,container 起來、`/health` 回 ok、3 binary entrypoint 都可切換、image size < 200MB。

**Independent Test**:`docker compose --profile prod up` + `curl http://127.0.0.1:21081/health` 回 `ok`;然後 `docker run --rm rev2-admin-rust-api:latest migration` / `cleanup-job` 各印 stub 訊息 + exit 0。

### Implementation for User Story 1

> 本 phase 無新 implementation tasks(實作全在 Foundational T005-T020 完成);本 phase 只跑 acceptance verification。

- [ ] T021 [US1] Acceptance:生成 prod secret 實值(`openssl rand -base64 48 > deploy/secrets/jwt_secret.txt && openssl rand -base64 48 > deploy/secrets/refresh_token_secret.txt`);**注意**:這兩 `.txt` 是 gitignored(per `.gitignore`)、不會 commit
- [ ] T022 [US1] Acceptance:`docker compose -f docker-compose.rust-api.yml --profile prod up -d --wait` + `curl -fsS http://127.0.0.1:21081/health` 回 `ok`(對應 spec User Story 1 Acceptance Scenario 2;[verification-commands.md](./contracts/verification-commands.md) §1)
- [ ] T023 [US1] Acceptance:`docker run --rm rev2-admin-rust-api:latest migration` stdout 含 `migration stub — will be implemented in Phase 2 migration feature` + exit 0;同樣對 cleanup-job;`docker run --rm rev2-admin-rust-api:latest unknown` stderr 含 `usage:` + exit 64(對應 spec Scenario 3 + SC-005;[verification-commands.md](./contracts/verification-commands.md) §4)
- [ ] T024 [US1] Acceptance:`docker image inspect rev2-admin-rust-api:latest --format='{{.Size}}' | numfmt --to=iec` < 200 MB(SC-004;[verification-commands.md](./contracts/verification-commands.md) §1)

**Checkpoint**: User Story 1 fully functional and independently testable;MVP 達成、可 ship 此階段(若只交基建)

---

## Phase 4: User Story 2 — Dev 熱重載 (Priority: P2)

**Goal**:dev profile 容器內 cargo-watch 偵測 source 變動、60 秒內 rebuild + restart server。

**Independent Test**:`docker compose --profile dev up` + `curl /health` 確認 `ok` + `sed -i 's/"ok"/"ok-v2"/' rust-api/server/src/main.rs` + 等 60 秒 + 再 `curl /health` 應回 `ok-v2`。

### Implementation for User Story 2

> 同 Phase 3,無新 implementation tasks;cargo-watch 已在 T014 Dockerfile dev stage + T018 compose dev profile 落實。

- [ ] T025 [US2] Acceptance:`docker compose -f docker-compose.rust-api.yml --profile dev up -d --wait` + initial `curl /health` 回 `ok` + `sed -i 's/"ok"/"ok-v2"/' rust-api/server/src/main.rs` + 60 秒內 `curl /health` 回 `ok-v2`(對應 spec User Story 2 Acceptance + SC-002;[verification-commands.md](./contracts/verification-commands.md) §2);**若 cargo-watch 未觸發** → 改 `cargo watch --poll -x 'run --bin server'`(brainstorm §9.1 Open Question fallback)+ 重跑此 task。**完成後 revert** source:`sed -i 's/"ok-v2"/"ok"/' rust-api/server/src/main.rs`

**Checkpoint**: User Stories 1+2 both independently functional

---

## Phase 5: User Story 3 — Boot panic 自我保護 (Priority: P3)

**Goal**:secret 給黑名單 / 長度不足 / 未設、boot panic 並印明確訊息;`_FILE` precedence 正確。

**Independent Test**:4 條 acceptance scenario(spec User Story 3),覆蓋 3 條 panic 路徑 + 1 條 `_FILE` precedence。

### Implementation for User Story 3

> 同前,無新 implementation tasks(panic logic 已在 T012 secret loader 完成 TDD green);本 phase 只跑 acceptance verification。**4 task 可並行**(各自獨立 container 跑、互不影響)。

- [ ] T026 [P] [US3] Acceptance:`APP_JWT_JWT_SECRET="change-me" docker compose -f docker-compose.rust-api.yml --profile dev up` boot panic 5 秒內、log 含 `APP_JWT_JWT_SECRET is a placeholder value`(spec Acceptance 1;[verification-commands.md](./contracts/verification-commands.md) §3.1)
- [ ] T027 [P] [US3] Acceptance:`APP_JWT_JWT_SECRET="too_short" docker compose -f docker-compose.rust-api.yml --profile dev up` boot panic、log 含 `APP_JWT_JWT_SECRET length 9 < 32`(spec Acceptance 2;[verification-commands.md](./contracts/verification-commands.md) §3.2)
- [ ] T028 [P] [US3] Acceptance:`unset APP_JWT_JWT_SECRET APP_JWT_JWT_SECRET_FILE && docker compose -f docker-compose.rust-api.yml --profile dev up` boot panic、log 含 `neither APP_JWT_JWT_SECRET nor APP_JWT_JWT_SECRET_FILE set`(spec Acceptance 3;[verification-commands.md](./contracts/verification-commands.md) §3.3)
- [ ] T029 [P] [US3] Acceptance:`echo "valid_secret_loaded_from_file_xxxxxxxxxxxx" > /tmp/jwt.txt && APP_JWT_JWT_SECRET="change-me" APP_JWT_JWT_SECRET_FILE="/tmp/jwt.txt" docker compose -f docker-compose.rust-api.yml --profile dev up` boot 成功 + `curl /health` 回 `ok`(spec Acceptance 4;[verification-commands.md](./contracts/verification-commands.md) §3.4)

**Checkpoint**: 三 user story 全 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:DESIGN §4.6 baseline 對應驗收、Constitution Compliance 自我覆查、end-to-end smoke。

- [ ] T030 Verification:`grep -rn "<TO_BE_SET>" rust-api/` 為空(對應 SC-006 + DESIGN §4.6.1;[verification-commands.md](./contracts/verification-commands.md) §5.1)
- [ ] T031 Verification:`ls rust-api/migration/src/m*.rs 2>/dev/null` 為空(本 feature stub bin、無 entity migration;Phase 2 migration feature 才有 `m_<timestamp>_*.rs`;[verification-commands.md](./contracts/verification-commands.md) §5.2)
- [ ] T032 Constitution Compliance 自我覆查:(a) `grep -rn "rev1\|fork260509-soybean-admin-rust" rust-api/server/ rust-api/migration/ rust-api/cleanup-job/ 2>/dev/null` 為空(§I.5 RUSTAPI-SOURCE-ISOLATION 紀律) (b) `git -C base-web diff` 為空(§I.1 base-web 為權威紀律) (c) `grep -E "secret|password|token" rust-api/application.yaml` 為空(§I.5 + spec FR-019;對應 [verification-commands.md](./contracts/verification-commands.md) §7)
- [ ] T033 [P] Re-verify in-container unit test pass:`docker compose -f docker-compose.rust-api.yml --profile dev run --rm rust-api-dev cargo test --bin server -- config::tests` 8 tests 全 PASS(quickstart Path D)
- [ ] T034 End-to-end smoke:跑 quickstart.md Path A(dev profile + 改 source 驗熱重載)+ Path B(prod profile + 3 binary entrypoint)完整流程,記錄任何 friction 進 `docs/superpowers/001-dockerfile-rust-api.md` §9 Open Questions(若需)

**Checkpoint**: feature 完整、可進 `superpowers:finishing-a-development-branch` 階段(merge 回 `rev2-admin-root` + 更新 CHECKLIST §4 Phase 1 對應項 ✅ + MILESTONES append)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,可立即開始
- **Foundational (Phase 2)**:依 Setup 完成;**BLOCKS 所有 user story**
- **User Story 1 (Phase 3, P1)**:依 Foundational 完成
- **User Story 2 (Phase 4, P2)**:依 Foundational 完成(可與 US1 並行)
- **User Story 3 (Phase 5, P3)**:依 Foundational 完成(可與 US1/US2 並行;內 4 task 並行)
- **Polish (Phase 6)**:依所需 user story 完成

### Within Phase 2 (Foundational)

**Sequential dependencies**:
- T005-T007 (crate Cargo.toml) → T010 (server config.rs structs) → T011 (red tests,需 T010 函式骨架 compile)→ T012 (green impl) → T019 (verify tests pass)
- T010+T013 (server main.rs) → T014 (Dockerfile,COPY rust-api/) → T020 (build verify)
- T014+T015 (Dockerfile + entrypoint.sh) → T018 (compose 引用 image + entrypoint) → T020

**Parallel opportunities**:
- T005/T006/T007(3 個 crate Cargo.toml,不同檔)— [P]
- T008/T009(2 個 stub bin,不同檔)— [P]
- T011(unit tests,獨立 mod tests block)
- T014/T015/T016/T017(Dockerfile / entrypoint / 2 secret 範本檔,4 個不同檔)— [P]

### Within User Story Phases

- Phase 3 (US1) 4 task 全 sequential(同一 docker compose state、後一 task 依前一)
- Phase 4 (US2) 單一 task
- Phase 5 (US3) 4 task 全 [P](獨立 container 跑、各自 unset/set 不同 envvar)

### Parallel Opportunities Summary

- Phase 1:T002 / T003 / T004 並行(3 個不同檔)
- Phase 2:T005-T007 同層並行;T008-T009 並行;T014-T017 並行
- Phase 5:T026-T029 全並行(4 個獨立 acceptance)
- Phase 6:T033 與其他 polish task 並行

---

## Parallel Example: Phase 2 Foundational

```bash
# Wave 1: workspace 基設(T001 後)
T002 + T003 + T004                # 3 files 並寫

# Wave 2: crate skeletons
T005 + T006 + T007                # 3 Cargo.toml

# Wave 3: stub bins
T008 + T009                       # 2 stub main.rs

# Wave 4: secret loader TDD(sequential within wave)
T010 → T011 → T012                # struct → red tests → green impl

# Wave 5: server entry + image pipeline
T013                              # main.rs
T014 + T015 + T016 + T017         # Dockerfile + entrypoint + 2 範本檔(並行)

# Wave 6: compose + gates(sequential)
T018 → T019 → T020                # compose → test gate → build gate
```

---

## Parallel Example: Phase 5 User Story 3

```bash
# 4 個 boot panic / FILE precedence acceptance 全並行
T026 + T027 + T028 + T029         # 各自獨立 docker compose run
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup(4 tasks)
2. 完成 Phase 2: Foundational(16 tasks)— **CRITICAL,blocks all stories**
3. 完成 Phase 3: User Story 1(4 acceptance tasks)
4. **STOP and VALIDATE**:跑 quickstart Path B 確認 prod build + run + curl 通
5. 達 MVP:image build + run + `/health` ok,可 demo

### Incremental Delivery

1. Phase 1 + 2 完成 → Foundation ready
2. Phase 3 (US1) → MVP demo
3. Phase 4 (US2) → 加 dev hot reload 開發體驗
4. Phase 5 (US3) → 加 boot panic 安全防護驗收
5. Phase 6 (Polish) → baseline + Constitution Compliance 自我覆查
6. `superpowers:finishing-a-development-branch` → merge 回 `rev2-admin-root` + 更新 CHECKLIST + MILESTONES

### Parallel Team Strategy

本 feature 單人即可完成(實作量 ~1-2 工作天),不需多 implementer 並行;若用 `superpowers:subagent-driven-development`:
- 一個 implementer subagent 跑完 Phase 1-2(sequential 為主、wave 並行)
- 另一 implementer 可並行跑 Phase 3-5 各 acceptance(不需 implement code、只跑 verify)
- final reviewer 跑 Phase 6 polish

---

## Notes

- 全部 file path 為 `rust-api/...` 或 `deploy/...` 或 `docker-compose.rust-api.yml`,從 workspace root(`rev2-root/`)往下
- secret 實值檔(`deploy/secrets/*.txt` 不含 `.example`)需 user 用 `openssl rand -base64 48` 手動生成、不在 git tracked(`.gitignore` 已排除)
- Phase 3-5 acceptance task 失敗時:回 Phase 2 對應 implementation task 修(non-trivial 改動可能須回 brainstorm / re-design)
- 任何偏離 [plan.md](./plan.md) 設計的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V 紀律:結論在 constitution、研究歷史在 design)
- `superpowers:executing-plans` 階段會把這 35 個 task 編成 execution unit + 派 fresh implementer subagent;tasks.md 不寫具體 implementation prompt(由 implementer subagent 從本檔 + plan.md + contracts/ + spec.md 自取)
