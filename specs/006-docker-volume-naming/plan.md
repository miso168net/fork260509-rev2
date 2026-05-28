# Implementation Plan: docker-volume-naming

**Branch**: `006-docker-volume-naming` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-docker-volume-naming/spec.md`

**Brainstorm**: [`docs/superpowers/006-docker-volume-naming.md`](../../docs/superpowers/006-docker-volume-naming.md)（Phase 0 brainstorm,5 決策凍結）

---

## Summary

rev2 第六個 spec-kit feature:統一 named volume 命名。把 7 個卷從顯式 `name: rev2_*`（繞過 project 前綴、且 `bw`/`redis` 縮寫不一致）改為 **docker auto-prefix** —— 移除所有顯式 `name:`、compose key 改 `<service>_<purpose>`（§1 短名 `-`→`_`）、4 個 compose 檔設 `name: rev2-admin`,實際卷名遂成 `rev2-admin_<service>_<purpose>`，與 container / network 前綴一致、grep 友善。連帶:CLAUDE.md §8.2 規則文件化、DESIGN/000 同步、凍結 spec 加 superseded 註記。純 workspace-level config + docs refactor,不動 base-web/rust-api worktree、不改 network、不接觸 wire/secret 機制。

---

## Technical Context

**Language/Version**:
- docker compose（YAML 設定）+ markdown（docs）
- 本 feature **沒寫** TypeScript / Rust / Vue source — 純 compose 命名 + 文件 refactor

**Primary Dependencies**:
- docker engine 的 named-volume auto-prefix 行為（project name + `_` + key）
- 既有 004 master compose（3 檔分層）、005 secret 機制（dual-write 不變式須不破）

**Storage**:7 個 named volume（rename 對象）；無 DB；secret 為 file-based（不受卷改名影響）

**Testing**:
- 本 feature 無新純函式邏輯（compose + docs）→ **不寫單元測試**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）
- Acceptance:C-V contract（grep 舊名清零 + `docker volume ls` 新名 + `up --wait` 5 healthy + 005 dual-write + 文件一致）

**Target Platform**:host docker engine（WSL2 / linux / macOS）；一次性 refactor

**Project Type**:Workspace-level deploy/infra 命名 refactor（`docker-compose*.yml` + `deploy/` + docs scope）

**Performance Goals**（對應 spec SC）:7 卷新名 grep 友善（SC-001）；live compose 舊名清零（SC-002）；stack healthy + 連線通（SC-003）；CLAUDE.md/DESIGN/000 同步（SC-004）；凍結 spec 內文保留 + cross-ref（SC-005）

**Constraints**:
- dev-only refactor（無真實資料遷移）
- 不改 network 命名 / base-web / rust-api worktree / config.rs（FR-012）
- 凍結 spec 內文不改寫（只加 cross-ref;沿用 004→005 先例）
- 005 dual-write 不變式不可破

**Scale/Scope**:
- 4 compose 檔（移除 `name:` + 3 key/mount 更名 + 2 standalone 加 project name）+ CLAUDE.md（表列 + §8.2.2 + §8.2.1）+ DESIGN（1 處）+ 000（全面改寫）+ 凍結 spec（cross-ref）
- 7 卷遷移 + 5 段 C-V acceptance + research.md + data-model.md + 2 contracts + quickstart.md

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項 Compliance Check:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?rust-api 未提供 base-web 用到的 endpoint? | N/A — 純 infra 卷命名、不涉 wire endpoint | ✅ Pass |
| 2 | 此 plan 動到 base-web inline?屬哪條 ★ 軌道? | 否 — 完全不碰 base-web source（只動 docker-compose + docs） | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 不涉 menu / auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock ground truth? | N/A — 無 wire endpoint（純卷命名） | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?research grep rev1?(§I.5) | 否 — 純改 compose/docs;**research 只 grep rev2 現有產物**（004 compose / 既有 docs）、**未 grep rev1** | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項?需 Amendment? | 不涉 — volume 命名非任何拍板項範圍;§11.12 brainstorm 位置(a)亦遵守 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 不觸 ★ 軌道 — MODAL-WIRING / BASE-WEB-BUILD-CONFIG 與本 feature 無關;純 workspace-level deploy | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可直接進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/006-docker-volume-naming/
├── plan.md              # 本檔（/speckit-plan 輸出）
├── spec.md              # /speckit-specify + /speckit-clarify 已交
├── research.md          # Phase 0 輸出（本次,6 主題）
├── data-model.md        # Phase 1 輸出（本次,3 entity）
├── quickstart.md        # Phase 1 輸出（本次）
├── contracts/           # Phase 1 輸出（本次）
│   ├── volume-catalog.md
│   └── verification-commands.md
└── checklists/
    └── requirements.md  # /speckit-specify 已交（16/16 PASS）
```

### Source Code (repository root)

```text
# 本 feature 落地後的 workspace 變動
docker-compose.yml                  ← 移除 7 個 name:、3 key 更名（redis_data→redis_stack_data、bw_*→base_web_*）+ redis mount 更名
docker-compose.dev.yml              ← 2 個 bw_* mount → base_web_*
docker-compose.base-web.yml         ← 加 name: rev2-admin + 移除 name: + key/mount 更名 + L16 註解（DEPRECATED）
docker-compose.rust-api.yml         ← 加 name: rev2-admin + 移除 name: rust_api_*（key 不變,DEPRECATED）
CLAUDE.md                           ← §8.2 表加 docker volume name 列 + 新 §8.2.2 規則 + §8.2.1 live 指令舊名更新
docs/INTEGRATION-DESIGN.md          ← L891 redis_data → redis_stack_data（權威同步）
docs/superpowers/000-base-web-docker-bootstrap.md  ← 全面改寫 ~14 處舊名/key → 新
specs/{002,004,005}/** + docs/superpowers/002 + INTEGRATION-RESEARCH.md  ← 不改寫內文、加 superseded cross-ref
```

**Structure Decision**:本 feature 無「新 source crate / module / view」— 只動 `docker-compose*.yml`（4 檔）+ workspace docs。FR-012 explicit 凍結不動 network / base-web / rust-api worktree / config.rs。對齊 brainstorm §5 變更面分類。

---

## Phase 0 Status

Research artifacts → [`research.md`](./research.md)

**結論**:6 個 research 主題,全為既有 compose/docs ground truth grep + docker auto-prefix 行為確認,無 NEEDS CLARIFICATION 待解。**遵守 §I.5**:research 未 grep rev1 source,僅 grep rev2 現有產物（4 compose / CLAUDE.md / DESIGN / 000 / 凍結 spec）。

---

## Phase 1 Status

Design artifacts:
- [`data-model.md`](./data-model.md)— 3 entity（7 卷 key/name/service/purpose 對照 / 命名規則 / 4 compose 檔角色）
- [`contracts/`](./contracts/)— 2 contract（volume-catalog 正典清單 / verification-commands C-V acceptance）
- [`quickstart.md`](./quickstart.md)— 改名 + 遷移 + 驗證 4 path

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 已指向 `specs/006-docker-volume-naming/plan.md`（specify 階段設）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 Compliance Check 7 項。

| § | 檢查項 | Re-Check 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威? | 仍 N/A — Phase 1 contracts 純卷命名 / docs | ✅ Pass |
| 2 | 動到 base-web inline? | 仍否 | ✅ Pass |
| 3 | menu 走 Casbin enforce? | 仍 N/A | ✅ Pass |
| 4 | wire 對齊 §I.3 mock? | 仍 N/A | ✅ Pass |
| 5 | 從 rev1 拷貝 code / grep rev1? | 仍否 — Phase 1 設計純改 compose/docs、research 只 grep rev2 | ✅ Pass |
| 6 | 凍結 §II 12 拍板項? | 仍不涉 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道? | 仍不觸 | ✅ Pass |

**結果**:7 項仍全 PASS。Phase 1 設計未引入任何 base-web inline 改動、未動 wire / menu / auth、未從 rev1 拷貝 code、未觸 ★ 軌道。可進 `/speckit-tasks` 階段。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

---

## Implementation Deviations（Constitution v1.0.0 §V）

實作階段(executing-plans / subagent-driven-development)出現、經 user 拍板的偏離,記錄於此:

1. **SC-001/T007 卷數 6 vs 7（user 拍板 2026-05-28，接受 6）**:dev `up -d --wait` 實際只物化 6 個 named volume,非 spec 寫的 7。`front_nginx_certs` 是 prod-only —— dev 的 front-nginx 服務用 `./deploy/dev-certs` bind mount,named volume `front_nginx_certs` 只被 `profiles:[prod]` 的 `acme` 服務掛載,故 dev 不物化。pre-flight 看到的舊 `rev2_front_nginx_certs` 是先前 prod/seed-cert 步驟 out-of-band 建立的殘留,並非 dev `up` 產物 → spec 作者把混雜歷史的 7 個既存卷誤當 dev 會生成 7 個。該卷命名已用 `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod config` 驗證解析為 `rev2-admin_front_nginx_certs`。**判定**:全 7 key auto-prefix 一致、spec 意圖(統一 `rev2-admin_` 前綴、grep 友善)已達成;SC-001「=7」於 dev-only 讀作「dev 6 + front_nginx_certs prod-only(名稱驗證通過)」,無需重跑、無需起 prod profile。
2. **prod.yml L4 陳舊註解修正（user 拍板 2026-05-28，同意修）**:`docker-compose.prod.yml` L4 註解仍寫舊卷名 `rev2_front_nginx_certs`,與已修正的 master compose L13 註解同類。user 同意一併修為 `rev2-admin_front_nginx_certs`(1 行註解,prod.yml 的實際 volume 引用用 key `front_nginx_certs`、本就正確、未動)。**連帶**:T017(d)「prod.yml 零改動」驗證放寬為「僅 1 行註解 diff、無 volume name:/結構改動」。
