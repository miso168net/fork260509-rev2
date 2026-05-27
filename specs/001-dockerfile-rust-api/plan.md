# Implementation Plan: dockerfile-rust-api

**Branch**: `001-dockerfile-rust-api` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-dockerfile-rust-api/spec.md`

**Brainstorm**: [`docs/superpowers/001-dockerfile-rust-api.md`](../../docs/superpowers/001-dockerfile-rust-api.md)(Phase 0 brainstorm spec-design)

---

## Summary

rev2 第一個 spec-kit feature:從空 worktree 建立 3 crate Cargo workspace(server + migration + cleanup-job)+ axum 啟動骨架(`/health` plain text + application.yaml + `_FILE` secret loader + strict validation)+ multi-stage Dockerfile(builder / dev / runtime)+ standalone compose(dev/prod profile)。作為 Phase 1-5 所有後續 feature 的部署 baseline,對應 rev1 W-F1。Phase 1 #5 「secret 注入機制 feature」scope 變動標:本 feature 已交 secret loader logic 與 2 個 JWT 範本檔,Phase 1 #5 變為「9 個其他 secret 範本檔 + `deploy/generate-secrets.sh` 統一生成腳本 + dual-write docs」。

---

## Technical Context

**Language/Version**: Rust 1.86(`rust-toolchain.toml` pin,對齊 §8.1 image base `rust:1.86-slim-bookworm`)

**Primary Dependencies**:
- HTTP server: `axum` 0.7 + `tokio` 1(`macros, rt-multi-thread, signal` feature)
- Config + secret: `serde` 1(`derive`)+ `serde_yaml` 0.9(無 `config` crate,結構簡單直接用 `serde_yaml::from_str`)
- Logging: `tracing` 0.1 + `tracing-subscriber` 0.3(`env-filter, json` feature)
- Error: `anyhow` 1 + `thiserror` 1

**Storage**: N/A(本 feature 不接 DB / Redis;application.yaml + `deploy/secrets/*.txt` 為 read-only config)

**Testing**:
- Rust unit test:`server/src/config.rs` 內 `load_secret` + `validate_secret`(test-first,純函式邏輯適合 TDD red→green)
- Acceptance:CDP 不需要(無 UI);走 brainstorm §10 phase 0 紀律 C-V contract `tests/verification-commands.md`(curl `/health` + docker run + boot panic 三類驗收)

**Target Platform**:
- Runtime:Docker container(`debian:bookworm-slim` + non-root uid 10001)
- Host:WSL2(Linux x86_64,Win11 22H2+ mirrored networking)+ docker 23+(BuildKit 自動啟用)

**Project Type**: Web service backend infrastructure baseline(3 binary single image)

**Performance Goals**(對應 spec SC):
- SC-001 首次 prod build → dev container 跑起來 → `curl /health` 完整時間 < 15 分鐘
- SC-002 改 server source 一行後 dev 容器 60 秒內 rebuild + restart
- SC-003 三條 boot panic 路徑各 5 秒內 panic
- SC-004 prod runtime image < 200MB
- SC-005 migration / cleanup-job entrypoint exit code 0
- SC-006 `grep -r "<TO_BE_SET>" rust-api/` 為空

**Constraints**:
- WSL2 bind mount + named volume mask `target/`(避 9P 慢)
- 3 binary 同 image、entrypoint dispatcher 切換
- non-root uid 10001 統一
- 不繼承 rev1 rust source(RUSTAPI-SOURCE-ISOLATION 軌道,§I.5)
- 不動 base-web

**Scale/Scope**:
- 個人 workspace、單一可部署 image
- 2 個 JWT secret(`jwt_secret` + `refresh_token_secret`)走 `_FILE` + strict validation
- 1 個 HTTP endpoint(`/health`)
- ~10 Rust deps(axum 生態 minimal subset)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項 Compliance Check:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威? rust-api 是否未提供 base-web 用到的對應 endpoint? | N/A — 本 feature 不提供任何業務 endpoint(只有 `/health` infra endpoint);base-web 對齊 endpoint 留給 Phase 3+ feature 落實 | ✅ Pass |
| 2 | 此 plan 是否動到 base-web inline? | 否 — 全在 `rust-api/` + workspace `deploy/`,不動 `base-web/` 任何檔 | ✅ Pass |
| 3 | 此 plan 涉及 menu 顯示是否走 Casbin enforce?(§I.2) | N/A — 本 feature 不接 Casbin 也無 menu | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock ground truth?(envelope / id 型 / error code / enum) | N/A — `/health` 不走 envelope(plain text "ok" 是 health endpoint 慣例,DESIGN §5.1 明示「global health 不走 envelope」) | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? 屬 §I.5 例外清單嗎? | 否 — 本 feature 屬 RUSTAPI-SOURCE-ISOLATION 軌道(§I.5 預設可動);**不**含 §I.5 例外 3 個 sub-crate(sea-orm-adapter / xdb / axum-casbin 全留給 Phase 2 #5) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項? 任一拍板需改變需 Amendment? | 全凍結 — 本 feature 不改任何拍板;`Super/Admin/User`(§11.1)/ alova 7 endpoint(§11.2)/ MODAL-WIRING(§11.3)等都不在本 feature scope | ✅ Pass |
| 7 | 觸及 §III ★ 軌道? 授權邊界內? | 不觸及 ★ 軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG 都針對 base-web);本 feature 屬 RUSTAPI-SOURCE-ISOLATION(III.1 預設可動) | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可直接進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/001-dockerfile-rust-api/
├── plan.md              # 本檔(/speckit-plan 輸出)
├── spec.md              # /speckit-specify 已交
├── research.md          # Phase 0 輸出(本次)
├── data-model.md        # Phase 1 輸出(本次)
├── quickstart.md        # Phase 1 輸出(本次)
├── contracts/           # Phase 1 輸出(本次)
│   ├── health-endpoint.md
│   ├── entrypoint-dispatcher.md
│   ├── secret-loader.md
│   ├── application-yaml-schema.md
│   ├── compose-profiles.md
│   └── verification-commands.md
└── checklists/
    └── requirements.md  # /speckit-specify 階段 1 已交(14 項全 PASS)
```

### Source Code (repository root)

```text
# 本 feature 落地後的 rust-api worktree 結構
rust-api/                                   ← workspace root(worktree + submodule)
├── Cargo.toml                              workspace 設定 + workspace.dependencies
├── Cargo.lock                              提交(binary workspace reproducible)
├── rust-toolchain.toml                     pin channel = "1.86"
├── .dockerignore                           排除 target/ / *.md / .git
├── application.yaml                        non-secret config
├── server/                                 axum HTTP server bin crate
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                         entry: tracing → config → router → serve
│       └── config.rs                       _FILE pattern loader + strict validation
├── migration/                              sea-orm migration stub bin crate
│   ├── Cargo.toml
│   └── src/main.rs                         println! stub
└── cleanup-job/                            cleanup stub bin crate
    ├── Cargo.toml
    └── src/main.rs                         println! stub

# 本 feature 落地後的 workspace deploy/ 結構(累積在 000 base-web 之上)
deploy/
├── Dockerfile.base-web.txt                 (已存在,000 base-web bootstrap)
├── Dockerfile.rust-api.txt                 (本 feature 新增)— 3 stage multi-stage
├── entrypoint.rust-api.sh                  (本 feature 新增)— binary dispatcher
└── secrets/
    ├── jwt_secret.txt.example              (本 feature 新增)
    └── refresh_token_secret.txt.example    (本 feature 新增)

# workspace root compose(本 feature 新增)
docker-compose.rust-api.yml                 standalone compose,dev/prod profile

# 本 feature 不動的相關 source
base-web/                                   不動
docs/                                       不動(superpowers/001 brainstorm 已 commit;spec/plan 在 specs/)
.specify/                                   不動(constitution v1.0.0 已凍結)
```

**Structure Decision**:採用 DESIGN §4.2 已決的 3 crate workspace(server + migration + cleanup-job);本 feature 不建 `model/` / `sea-orm-adapter/` / `xdb/` / `axum-casbin/`(Phase 2 #5 sub-crate setup feature scope);server bin 也不建 `api/` / `service/` / `middleware/` / `router/` 等子模組(Phase 2/3 feature 自然增長)。對齊 brainstorm 001 §2 Cargo Workspace 結構表。

---

## Phase 0 Status

Research artifacts → [`research.md`](./research.md)

**結論**:無 NEEDS CLARIFICATION 待解(spec.md `/speckit-clarify` 已判定 no critical ambiguity);research.md 內容為 brainstorm 5 題拍板的 Decision/Rationale/Alternatives consolidation,供 plan / tasks / implementation 階段對照。

---

## Phase 1 Status

Design artifacts:
- [`data-model.md`](./data-model.md)— 4 個 key entity + application.yaml schema
- [`contracts/`](./contracts/)— 6 個 contract 檔(health endpoint / entrypoint dispatcher / secret loader / yaml schema / compose profile / verification commands)
- [`quickstart.md`](./quickstart.md)— 一鍵驗證流程

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區更新指向 `specs/001-dockerfile-rust-api/plan.md`。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 Compliance Check 7 項。

**結果**:7 項仍全 PASS。Phase 1 設計未引入任何 base-web 動作、未動 wire envelope、未從 rev1 拷貝 code、未觸 ★ 軌道。Design artifacts 都嚴守 brainstorm 001 scope 凍結摘要。

可進 `/speckit-tasks` 階段。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。
