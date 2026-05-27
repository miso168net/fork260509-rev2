# Implementation Plan: dockerfile-base-web

**Branch**: `002-dockerfile-base-web` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-dockerfile-base-web/spec.md`

**Brainstorm**: [`docs/superpowers/002-dockerfile-base-web.md`](../../docs/superpowers/002-dockerfile-base-web.md)(Phase 0 brainstorm spec-design)

---

## Summary

rev2 第二個 spec-kit feature:base-web standalone 部署基建對齊 [CLAUDE.md §8.2](../../CLAUDE.md) 規劃 — port 改 `21079:21079`(避 internal:80 撞 host)、image tag + container_name 對齊 001、nginx 加 HEALTHCHECK probe `/health.html`、新增 `base-web/public/health.html`、Dockerfile builder 加 `ARG VITE_SERVICE_BASE_URL` 透過 **`.env.prod.local`** 寫入(research 發現 vite `loadEnv` 不讀 process.env、必走 `.env.[mode].local` precedence)、補 000 §6.1 deferred prod 實機驗證、000 §2.3/§6.3 surgical patch。Phase 1 部署基建的第二片拼圖,對應 DESIGN §10 Phase 1 #2 + 補 000 deferred 項。

---

## Technical Context

**Language/Version**:
- Vue 3 SPA(已存在於 base-web,vite 8.0.12,本 feature **不改 inline**)
- Dockerfile (BuildKit syntax 1.7+)、POSIX sh、Docker Compose v2(YAML)
- 本 feature **沒寫 TypeScript / Vue 新 source** — 只在 `base-web/public/health.html` 加 4 行 static HTML

**Primary Dependencies**:
- Image base: `node:20.19-alpine`(builder + dev profile)、`nginx:alpine`(runtime)
- Build tool: `pnpm@10`(in-container 安裝、不裝 host)、vite 8.0.12(base-web 既有)
- HEALTHCHECK probe: `wget`(busybox,nginx:alpine 內建)

**Storage**: N/A(frontend static + nginx serve)

**Testing**:
- 本 feature 無新純函式邏輯(全 wiring + config + 1 static file)→ **不寫單元測試**(對齊 CLAUDE.md §3 + [verification-commands.md](./contracts/verification-commands.md) §0 紀律)
- Acceptance:走 C-V contract `verification-commands.md`(curl `/health.html` + docker inspect health status + grep dist js bundle for build-arg URL + git diff 驗 base-web 軌道紀律 + 000 §6.1 status 改字串)

**Target Platform**:
- Runtime:Docker container(`nginx:alpine`),Dev:Docker container(`node:20.19-alpine`)
- Host:WSL2(Linux x86_64,Win11 22H2+ mirrored networking)+ docker 23+(BuildKit 自動啟用)

**Project Type**: Web service deployment infrastructure(Vue 3 SPA wrapper + standalone compose)

**Performance Goals**(對應 spec SC):
- SC-001 dev profile up → `curl /health.html` 回 `ok` 完整時間 < 60 秒(非首次、有 cache)
- SC-002 prod profile `up -d --wait` 後 30 秒內 healthy
- SC-003 `VITE_SERVICE_BASE_URL` build-arg override → bundle 內 grep > 0
- SC-004 prod runtime image < 80 MB(nginx:alpine ~30MB + dist ~30MB margin)
- SC-005 `git -C base-web diff --name-only HEAD` 只含 `public/health.html`
- SC-006 000 §6.1 標題從 deferred 改 "✅ feature 002 完成"

**Constraints**:
- 不改 base-web inline(constitution §I.1)— 只新增 `public/health.html`
- 不加 dev stage 到 Dockerfile(保留 2 stage,YAGNI;dev 走 inline command 路線)
- 單 port 21079(dev 與 prod 不可並行 up,設計接受)
- WSL2 bind mount + named volume 既有結構(000 §2.7 pnpm store 重定向紀律全保留)

**Scale/Scope**:
- 1 host port(21079)、1 container service(per profile)、1 static asset 新增、4 個 source 檔修改、5 個 contract artifact

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項 Compliance Check:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威? rust-api 是否未提供 base-web 用到的對應 endpoint? | N/A — 本 feature 不涉 wire endpoint(只動 deploy infra) | ✅ Pass |
| 2 | 此 plan 是否動到 base-web inline? | 動 `base-web/public/health.html`(**新增**、未刪未改 inline);屬 [§III.1 BASE-WEB-ADAPT](../../.specify/memory/constitution.md#iii1-預設可動軌道無需額外授權) **預設可動軌道**(無需 ★ 授權);軌道描述「`.env` + `src/typings/api/rev2-extra.d.ts` **等新檔**;新增為主、不改 inline;禁止刪除既有 type / field」— **首次在 `public/` 子目錄應用**,本 feature explicit acknowledge 為「『等新檔』描述的延伸應用」 | ✅ Pass |
| 3 | 此 plan 涉及 menu 顯示是否走 Casbin enforce?(§I.2) | N/A — 本 feature 不接 menu / 不涉 auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock ground truth?(envelope / id 型 / error code / enum) | N/A — 本 feature 無 wire endpoint(`/health.html` 是 nginx static,plain text "ok",非 wire envelope domain) | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? 屬 §I.5 例外清單嗎? | 否 — 本 feature 不動 rust-api / 不從 rev1 拷貝任何 code | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項? 任一拍板需改變需 Amendment? | 全凍結 — 本 feature 不改任何拍板 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道? 授權邊界內? | 不觸及 ★ 軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG 都不在本 feature scope);本 feature 屬 III.1 BASE-WEB-ADAPT 預設可動軌道 | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可直接進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/002-dockerfile-base-web/
├── plan.md              # 本檔(/speckit-plan 輸出)
├── spec.md              # /speckit-specify 已交
├── research.md          # Phase 0 輸出(本次)
├── data-model.md        # Phase 1 輸出(本次)
├── quickstart.md        # Phase 1 輸出(本次)
├── contracts/           # Phase 1 輸出(本次)
│   ├── health-html-static.md
│   ├── healthcheck-probe.md
│   ├── build-arg-vite-service-base-url.md
│   ├── compose-profiles.md
│   └── verification-commands.md
└── checklists/
    └── requirements.md  # /speckit-specify 階段 1 已交(14 項全 PASS)
```

### Source Code (repository root)

```text
# 本 feature 落地後的 base-web worktree 結構(只動 1 檔新增)
base-web/                                   ← worktree + submodule
└── public/
    └── health.html                         ← 本 feature 新增(4 行 static HTML;BASE-WEB-ADAPT)

# 本 feature 落地後的 workspace deploy/ 結構(只改 1 既有檔)
deploy/
├── Dockerfile.base-web.txt                 ← 本 feature 改(ARG / .env.prod.local 寫入 / nginx listen 21079 / EXPOSE 21079 / HEALTHCHECK)
├── Dockerfile.rust-api.txt                 (001 已落,不動)
├── entrypoint.rust-api.sh                  (001 已落,不動)
└── secrets/                                (001 已落,不動)

# workspace root 既有 compose 改 port + container_name + image tag + build.args
docker-compose.base-web.yml                 ← 本 feature 改

# 持久記憶 surgical patch
docs/superpowers/000-base-web-docker-bootstrap.md   ← 本 feature surgical patch §2.3 / §6.1 / §6.3 + 檔尾 footnote
```

**Structure Decision**:本 feature 沒有「新 source crate / module / view」— 只動 deploy infra 與 1 個 static asset。對齊 brainstorm §3 凍結摘要。FR-024/025 explicit 凍結 dev profile structure(保留 000 inline command 路線、不加 Dockerfile dev stage)。

---

## Phase 0 Status

Research artifacts → [`research.md`](./research.md)

**結論**:1 個 critical research 發現(vite `loadEnv` 不讀 process.env、`ARG+ENV` 對 `VITE_*` prefix 無效,**必走 `.env.prod.local` fallback**)— 影響 Dockerfile builder stage 實作。其餘 4 項(HEALTHCHECK wget syntax / vite public→dist copy / nginx try_files priority / Docker BuildKit ARG 機制)為 best-practice 確認、無偏離 brainstorm。

---

## Phase 1 Status

Design artifacts:
- [`data-model.md`](./data-model.md)— 4 個 key entity(Container Image / `/health.html` static / `VITE_SERVICE_BASE_URL` build-arg / Standalone Compose)
- [`contracts/`](./contracts/)— 5 個 contract 檔
- [`quickstart.md`](./quickstart.md)— 一鍵驗證流程

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區更新指向 `specs/002-dockerfile-base-web/plan.md`。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 Compliance Check 7 項。

**結果**:7 項仍全 PASS。Phase 1 設計未引入任何 base-web inline 改動(只新增 `public/health.html` 1 檔)、未動 wire envelope、未從 rev1 拷貝 code、未觸 ★ 軌道。研究階段發現 vite env-loading 機制差異不影響 constitution 評估(屬 implementation detail、不違反任何凍結紀律)。

可進 `/speckit-tasks` 階段。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。
