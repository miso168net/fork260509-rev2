# Implementation Plan: secret-injection

**Branch**: `005-secret-injection` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-secret-injection/spec.md`

**Brainstorm**: [`docs/superpowers/005-secret-injection.md`](../../docs/superpowers/005-secret-injection.md)(Phase 0 brainstorm spec-design,6 拍板凍結)

---

## Summary

rev2 第五個 spec-kit feature:secret 注入機制(scope 縮小)— Phase 1 部署基建最後一片。001 交了 rust-api `_FILE` loader、004 交了 postgres/redis password 範本;本 feature 補齊 [DESIGN §8.4](../../docs/INTEGRATION-DESIGN.md) 7 必須 secret 的剩餘 3 個(`database_url` / `redis_url` / `cleanup_database_url`)+ `deploy/generate-secrets.sh`(zero-arg 一鍵生全 7 必、`--force`、idempotent、docker 化 `alpine/openssl`、**腳本同次同源組 URL 自動保證 dual-write**)+ `deploy/secrets/README.md` + retrofit postgres/redis 範本格式 + 連帶修 004 postgres 命名為 `soybean` / `soybean_admin_rust`(對齊 §8.4 權威)。3 個 URL secret **不**接進 compose(DB 連線層 Phase 2 才消費,grep 證實現無 code 讀);obs 可選 4 secret 留 Phase 5/6。

---

## Technical Context

**Language/Version**:
- bash(`generate-secrets.sh`)+ docker 化 `alpine/openssl`(rand 生成)+ markdown(範本 / README)
- 本 feature **沒寫** TypeScript / Rust / Vue source — 純 secret tooling(shell + 範本 + docs + 1 行 compose env 改)

**Primary Dependencies**:
- Host:docker(openssl 走 `docker run --rm alpine/openssl`,host-independent,沿用 003)
- 既有:001 `server/src/config.rs` `_FILE` loader(`APP_JWT_*`)、004 `docker-compose.yml`(postgres `POSTGRES_PASSWORD_FILE` / redis `--requirepass`)
- 無 lockfile / package.json / Cargo.toml

**Storage**:secret 純值檔 `deploy/secrets/*.txt`(gitignored)+ 範本 `*.txt.example`(git-tracked);無 DB

**Testing**:
- 本 feature 無新純函式邏輯(shell + 範本 + docs)→ **不寫單元測試**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0)
- Acceptance:C-V contract 7 段(生成 + dual-write + idempotent/--force + gitignore + 範本/README + jwt/refresh 過 001 loader + 004 命名連線)

**Target Platform**:host docker engine(WSL2 / linux / macOS);一次性生成腳本(非 long-running)

**Project Type**:Workspace-level deploy/secret tooling(`deploy/` scope,對齊 001/003 deploy 屬性)

**Performance Goals**(對應 spec SC):一鍵生 7 secret exit 0(SC-001);dual-write 100% 一致(SC-002);idempotent/--force 正確(SC-003);gitignore 正確(SC-004);範本/README 齊(SC-005);postgres 改名連線通(SC-006);jwt/refresh 過 001 驗證(SC-007)

**Constraints**:
- host 不裝 openssl(全 docker 化,對齊 000/001/002/003 哲學)
- secret 純值絕不 git track(沿用既有 `.gitignore` L68-69)
- dual-write 不可 drift(腳本同次同源組出)
- 不接 compose / 不動 config.rs / base-web / rust-api(留對應 Phase)

**Scale/Scope**:
- 1 新腳本(`generate-secrets.sh`)+ 3 新範本 + 2 retrofit 範本 + 1 README + 1 compose env 改(postgres user/db)
- 7 段 C-V acceptance + research.md + data-model.md + 3 contracts + quickstart.md

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項 Compliance Check:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?rust-api 未提供 base-web 用到的 endpoint? | N/A — 純 secret provisioning、不涉 wire endpoint | ✅ Pass |
| 2 | 此 plan 動到 base-web inline?屬哪條 ★ 軌道? | 否 — 完全不碰 base-web | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不接 menu / auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock ground truth? | N/A — 無 wire endpoint(secret 為 provision、URL 不接 compose) | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?research 是否 grep rev1?(§I.5) | 否 — 純新增 shell/範本/docs;**research 只 grep rev2 現有產物**(001 config.rs / 003 script / 004 compose),**未 grep rev1**(遵守 §I.5 process 紀律) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項?需 Amendment? | 全凍結 — 正面實現 §8.4 secret 清單 + dual-write 紀律;§11.12 brainstorm 位置(a)亦遵守 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 不觸 ★ 軌道 — MODAL-WIRING / BASE-WEB-BUILD-CONFIG 與本 feature 無關;純 workspace-level deploy | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可直接進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/005-secret-injection/
├── plan.md              # 本檔(/speckit-plan 輸出)
├── spec.md              # /speckit-specify + /speckit-clarify 已交
├── research.md          # Phase 0 輸出(本次,9 主題)
├── data-model.md        # Phase 1 輸出(本次,6 entity)
├── quickstart.md        # Phase 1 輸出(本次)
├── contracts/           # Phase 1 輸出(本次)
│   ├── secret-catalog.md
│   ├── generate-secrets-contract.md
│   └── verification-commands.md
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16 項全 PASS)
```

### Source Code (repository root)

```text
# 本 feature 落地後的 workspace 變動
docker-compose.yml                              ← 既有(004),改 postgres POSTGRES_USER/DB → soybean/soybean_admin_rust + pg_isready -U soybean
deploy/
├── generate-secrets.sh                         ← 本 feature 新增(一鍵生 7 必 + 自動 dual-write + idempotent + --force,docker 化 openssl)
├── generate-dev-cert.sh                        ← 既有(003),不動(風格參照)
└── secrets/
    ├── README.md                               ← 本 feature 新增
    ├── database_url.txt.example                ← 本 feature 新增
    ├── redis_url.txt.example                   ← 本 feature 新增
    ├── cleanup_database_url.txt.example        ← 本 feature 新增
    ├── postgres_password.txt.example           ← 既有(004),retrofit 豐富格式
    ├── redis_password.txt.example              ← 既有(004),retrofit 豐富格式
    ├── jwt_secret.txt(.example)                ← 既有(001),不動
    ├── refresh_token_secret.txt(.example)      ← 既有(001),不動
    └── *.txt                                   ← generate-secrets.sh 生成(全 gitignored)
```

**Structure Decision**:本 feature 無「新 source crate / module / view」— 只動 `deploy/`(1 新腳本 + 3 新範本 + 2 retrofit 範本 + 1 README)+ `docker-compose.yml` postgres env 一處。FR-018 explicit 凍結不動 base-web/rust-api worktree + 001/002 Dockerfile + config.rs + jwt/refresh 範本值。對齊 brainstorm §4 凍結結構。

---

## Phase 0 Status

Research artifacts → [`research.md`](./research.md)

**結論**:9 個 research 主題,全為既有 config.rs/003/004 ground truth grep + best-practice 確認,無 NEEDS CLARIFICATION 待解。spec Clarifications 的 deferred 項(openssl 來源)由 R3 解決 = docker 化 alpine/openssl(沿用 003)。**遵守 §I.5**:research 未 grep rev1 source,僅 grep rev2 現有產物。

---

## Phase 1 Status

Design artifacts:
- [`data-model.md`](./data-model.md)— 6 entity(7 secret / generate-secrets.sh / 範本 / README / dual-write 不變式 / 004 命名變更)
- [`contracts/`](./contracts/)— 3 contract(secret-catalog / generate-secrets-contract / verification-commands)
- [`quickstart.md`](./quickstart.md)— 一鍵生成 + dual-write + 範本文件 + 004 命名 4 path

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 更新指向 `specs/005-secret-injection/plan.md`。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 Compliance Check 7 項。

| § | 檢查項 | Re-Check 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威? | 仍 N/A — Phase 1 contracts 純 secret tooling | ✅ Pass |
| 2 | 動到 base-web inline? | 仍否 | ✅ Pass |
| 3 | menu 走 Casbin enforce? | 仍 N/A | ✅ Pass |
| 4 | wire 對齊 §I.3 mock ground truth? | 仍 N/A — URL secret 不接 compose(Phase 2) | ✅ Pass |
| 5 | 從 rev1 拷貝 code / grep rev1? | 仍否 — Phase 1 設計純新增 artifact、research 只 grep rev2 | ✅ Pass |
| 6 | 凍結 §II 12 拍板項? | 仍全凍結 — 正面實現 §8.4 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道? | 仍不觸 ★ 軌道 | ✅ Pass |

**結果**:7 項仍全 PASS。Phase 1 設計未引入任何 base-web inline 改動、未動 wire envelope、未從 rev1 拷貝 code、未觸 ★ 軌道;research 階段確認 config.rs loader / openssl docker 化 / 004 命名 / redis URL 形式 / dual-write / gitignore,屬 implementation detail、不違反任何凍結紀律。

可進 `/speckit-tasks` 階段。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

---

## Implementation Deviations(executing-plans 階段回填,Constitution v1.0.0 §V)

| 日期 | 偏離 | 原訂 | 改為 | 原因 / 觸發 |
|---|---|---|---|---|
| 2026-05-28 | postgres_password / redis_password 編碼 | `openssl rand -base64 24` | `openssl rand -hex 24` | code review 發現 base64 字母表含 `+` `/` `=`,這兩值嵌入 `database_url` / `redis_url` 後,Phase 2 sqlx 解析 URL 會壞(`/`→路徑、`+`→空白)。hex 全 URL-safe、熵同 24 bytes、48 字元仍過 `validate_secret` len ≥ 32。jwt/refresh 不進 URL、維持 base64 48。user 拍板。詳見 [research R2](./research.md)、已同步 secret-catalog / generate-secrets-contract / data-model / tasks。 |
