# Implementation Plan: compose-port-orchestration

**Branch**: `004-compose-port-orchestration` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-compose-port-orchestration/spec.md`

**Brainstorm**: [`docs/superpowers/004-compose-port-orchestration.md`](../../docs/superpowers/004-compose-port-orchestration.md)(Phase 0 brainstorm spec-design,12 拍板凍結)

---

## Summary

rev2 第四個 spec-kit feature:容器 port 與編排 — 把 001(rust-api)/ 002(base-web)/ 003(dev TLS cert)三片組成單一 master compose stack。三檔分層(`docker-compose.yml` base + `docker-compose.{dev,prod}.yml` override)+ `--profile prod` 控 acme。5 service:front-nginx(`nginx:1.31.0-alpine`,反向代理 `/` → base-web、`/api/*` strip → rust-api)+ base-web + rust-api + postgres(`postgres:17-alpine`)+ redis-stack(`redis/redis-stack-server:latest`)。dev profile 走 hot-reload dev container(對齊 001/002 standalone dev)、prod profile 走 built `:latest` image + 0.0.0.0 + 80→443 redirect。TLS cert 三來源(dev bind mount 003 cert / prod named volume seed / prod+acme)。postgres/redis data 持久 named volume。standalone compose 保留 + DEPRECATED header。對應 DESIGN §10 Phase 1 #4,留 Phase 2 rust-api→db 連線 + migration。

---

## Technical Context

**Language/Version**:
- docker-compose v2(compose spec)+ nginx 1.31 conf + bash(acme entrypoint skeleton)
- 本 feature **沒寫** TypeScript / Rust / Vue source — 純 orchestration(compose YAML + nginx conf + 1 個 acme entrypoint shell + Dockerfile.acme.txt)

**Primary Dependencies**:
- Host:docker 23+(compose v2)+ bash
- Images:`nginx:1.31.0-alpine`、`postgres:17-alpine`、`redis/redis-stack-server:latest`、`neilpang/acme.sh:3.1.3`(acme base);既有 001 `rev2-admin-rust-api:{dev,latest}`、002 `rev2-admin-base-web:latest` + dev `node:20.19-alpine`
- 無 lockfile / 無 package.json / 無 Cargo.toml(本 feature)

**Storage**:postgres data → named volume `rev2_postgres_data`;redis data → `rev2_redis_data`;prod cert → `front_nginx_certs`(均持久,`down -v` 才清)

**Testing**:
- 本 feature 無新純函式邏輯(全 orchestration + nginx conf + acme skeleton)→ **不寫單元測試**(對齊 CLAUDE.md §3 + [verification-commands.md](./contracts/verification-commands.md) §0 紀律)
- Acceptance:C-V contract `verification-commands.md`(dev stack healthy + nginx 路由 strip + TLS handshake + prod redirect + acme sanity + standalone DEPRECATED + Constitution self-check)

**Target Platform**:
- Runtime:host docker engine(WSL2 docker desktop / linux docker daemon / macOS docker desktop)
- WSL2 需 `networkingMode=mirrored`(Win11 22H2+ 預設)使 `127.0.0.1` binding 從 Windows host 可達
- 本 feature 是 long-running multi-service stack 編排(非一次性腳本)

**Project Type**:Workspace-level deployment orchestration(workspace root compose + `deploy/` scope,對齊 001/002/003 deploy 屬性)

**Performance Goals**(對應 spec SC):
- SC-001:dev `up -d --wait` 5 service 全 healthy(首次含 build/pull;cache 後 < 60s)
- SC-002/003:base-web SPA 200 + `/api/*` strip → rust-api 200
- SC-004:TLS handshake cert SAN localhost+127.0.0.1
- SC-005:prod 80→443 301 redirect
- SC-006:acme.sh --version sanity
- SC-007:standalone DEPRECATED header
- SC-008:worktree 不動

**Constraints**:
- host 不裝 nginx/postgres/redis(全 docker 化,對齊 000/001/002/003 哲學)
- docker-compose override list(ports/volumes)是 **append** 非覆寫 → base 層不放 host port binding(放 override)
- cert 私鑰絕不 git track(沿用既有 .gitignore + secret 範本紀律)
- 不寫死 obs stack / db migration / rust-api→db 連線 / 真實 acme cert(留對應 Phase)

**Scale/Scope**:
- 3 個新 compose 檔(base + dev + prod)+ 2 標 DEPRECATED(既有 standalone)
- `deploy/nginx/`(nginx.conf + conf.d/{dev,prod}.conf + _locations.inc)+ `deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh`
- 2 組新 secret 範本(postgres/redis password)
- 7 段 C-V acceptance + research.md + data-model.md + quickstart.md

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項 Compliance Check:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?rust-api 未提供 base-web 用到的對應 endpoint? | N/A — 本 feature 純 orchestration、不涉 wire endpoint 設計(只把既有 image 編排起來)| ✅ Pass |
| 2 | 此 plan 動到 base-web inline?屬哪條 ★ 軌道? | 否 — build-arg `VITE_SERVICE_BASE_URL=/api` 是 compose build 時傳入(002 已驗機制),不改 `base-web/` 任何 source;不觸 ★ 軌道 | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A — 本 feature 不接 menu / auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock ground truth? | 對齊 — nginx `/api/*` strip 前綴正是讓 rust-api 收到 mock ground truth path(`/auth/login` 不帶 `/api`);envelope / id 型 / error code 本 feature 不涉 | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | 否 — 純新增 compose / nginx conf / acme skeleton,非 rev1 source(Phase 0 research 亦未 grep rev1)| ✅ Pass |
| 6 | 凍結到 §II 12 拍板項?需 Amendment? | 全凍結 — 且**正面實現 §11.11 拍板**(prod 路徑前綴 (a) `/api/*` 主流):nginx `/api/*` → rust-api 路由正是此拍板落地;不改任何拍板 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 不觸 ★ 軌道 — MODAL-WIRING(views modal)/ BASE-WEB-BUILD-CONFIG(`build/plugins/router.ts` pageExcludePatterns)與本 feature 無關;build-arg 傳值 ≠ build config 軌道;純 workspace-level deploy orchestration | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可直接進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/004-compose-port-orchestration/
├── plan.md              # 本檔(/speckit-plan 輸出)
├── spec.md              # /speckit-specify + /speckit-clarify 已交
├── research.md          # Phase 0 輸出(本次)
├── data-model.md        # Phase 1 輸出(本次)
├── quickstart.md        # Phase 1 輸出(本次)
├── contracts/           # Phase 1 輸出(本次)
│   ├── compose-topology.md
│   ├── nginx-routing.md
│   ├── service-secrets.md
│   └── verification-commands.md
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16 項全 PASS)
```

### Source Code (repository root)

```text
# 本 feature 落地後的 workspace 結構(3 新 compose + deploy/nginx/ + acme)
docker-compose.yml                          ← 本 feature 新增(base,5 service)
docker-compose.dev.yml                      ← 本 feature 新增(dev override:hot-reload + loopback port + dev-certs)
docker-compose.prod.yml                     ← 本 feature 新增(prod override:0.0.0.0 + redirect + named volume cert + acme profile)
docker-compose.base-web.yml                 ← 既有(002),本 feature 加 DEPRECATED header
docker-compose.rust-api.yml                 ← 既有(001),本 feature 加 DEPRECATED header
deploy/
├── nginx/                                  ← 本 feature 新增目錄
│   ├── nginx.conf                          ← main(events / http / include conf.d/default.conf)
│   └── conf.d/
│       ├── _locations.inc                  ← 共用 location(/ + /api/ strip + /health)
│       ├── dev.conf                        ← dev:21080 + 21443 ssl(self-signed)
│       └── prod.conf                       ← prod:80(→443 redirect)+ 443 ssl
├── Dockerfile.acme.txt                     ← 本 feature 新增(FROM neilpang/acme.sh:3.1.3)
├── acme-entrypoint.sh                      ← 本 feature 新增(skeleton idle)
├── secrets/
│   ├── postgres_password.txt(.example)     ← 本 feature 新增
│   ├── redis_password.txt(.example)        ← 本 feature 新增
│   ├── jwt_secret.txt(.example)            ← 既有(001),不動
│   └── refresh_token_secret.txt(.example)  ← 既有(001),不動
├── nginx/                                  (見上)
├── dev-certs/                              ← 既有(003),dev profile bind mount :ro
└── Dockerfile.{base-web,rust-api}.txt      ← 既有(001/002),不動
```

**Structure Decision**:本 feature 無「新 source crate / module / view」— 只動 workspace root compose(3 新檔 + 2 標 deprecated)+ `deploy/nginx/` + `deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh` + 2 組 secret 範本。對齊 brainstorm §4 凍結結構。FR-023 explicit 凍結不動 base-web/rust-api worktree + 001/002 Dockerfile/secret 範本。

---

## Phase 0 Status

Research artifacts → [`research.md`](./research.md)

**結論**:10 個 research 主題,全為 best-practice 確認 + 既有 standalone/Dockerfile ground truth grep,無 NEEDS CLARIFICATION 待解。Phase 0 對 docker-compose override merge 行為(list append gotcha)、nginx proxy_pass strip 前綴、nginx conf dev/prod 分檔 mount、redis-stack-server password 注入(無 `_FILE`)、postgres `_FILE` secret + named volume、depends_on service_healthy、acme.sh skeleton idle、named volume 命名策略(COMPOSE_PROJECT_NAME 對齊 §8.2.1)、WSL2 mirrored networking、base-web prod 自帶 nginx SPA fallback 做確認。clarify 階段 2 拍板(dev hot-reload / data 持久)已收斂。

---

## Phase 1 Status

Design artifacts:
- [`data-model.md`](./data-model.md)— 8 個 key entity(3 compose 檔 / nginx 配置 / acme skeleton / 3 named volume / 2 secret / standalone deprecated)+ service 依賴鏈 + override merge 規則
- [`contracts/`](./contracts/)— 4 個 contract 檔(compose-topology / nginx-routing / service-secrets / verification-commands)
- [`quickstart.md`](./quickstart.md)— dev / prod baseline / prod+acme 一鍵流程 + 路由 + TLS 驗

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區更新指向 `specs/004-compose-port-orchestration/plan.md`。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 Compliance Check 7 項。

| § | 檢查項 | Re-Check 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威? | 仍 N/A — Phase 1 contracts 純 compose/nginx 編排、不引入 wire endpoint | ✅ Pass |
| 2 | 動到 base-web inline? | 仍否 — nginx-routing contract 用 build-arg `VITE_SERVICE_BASE_URL=/api`,不改 base-web source | ✅ Pass |
| 3 | menu 走 Casbin enforce? | 仍 N/A | ✅ Pass |
| 4 | wire 對齊 §I.3 mock ground truth? | 仍對齊 — nginx-routing contract `/api/*` strip 確保 rust-api 收 mock path | ✅ Pass |
| 5 | 從 rev1 拷貝 code? | 仍否 — Phase 1 設計純新增 orchestration artifact | ✅ Pass |
| 6 | 凍結 §II 12 拍板項? | 仍全凍結 — 正面實現 §11.11(`/api/*` 主流);Phase 1 未改任何拍板 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道? | 仍不觸 ★ 軌道 — Phase 1 contracts 純 deploy orchestration | ✅ Pass |

**結果**:7 項仍全 PASS。Phase 1 設計未引入任何 base-web inline 改動、未動 wire envelope、未從 rev1 拷貝 code、未觸 ★ 軌道;research 階段確認 docker-compose / nginx / redis-stack / postgres / acme 行為,屬 implementation detail、不違反任何凍結紀律。

可進 `/speckit-tasks` 階段。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

---

## Implementation Notes（as-built 偏離,2026-05-28 executing-plans 階段發現）

實作 + runtime acceptance 過程發現 3 處 contract 原設計在實機行不通,已修正並回填(對齊 Constitution v1.0.0 §V「偏離須註明」紀律)。三者皆 healthcheck / nginx 行為層,不影響 wire / 架構拍板。

1. **rust-api dev healthcheck:`curl /health` → `bash /dev/tcp` TCP-connect**
   - 原 contract([service-secrets.md](./contracts/service-secrets.md) / [data-model.md](./data-model.md))註「dev image 有 curl」,實測 `rev2-admin-rust-api:dev`(`rust:1.86-slim-bookworm` dev stage)**無 curl / wget / nc**(只裝 pkg-config + libssl-dev + cargo-watch);runtime stage 才裝 curl。
   - FR-023 凍結 `Dockerfile.rust-api.txt` 不可改 → 不能加 curl。dev image 有 `/usr/bin/bash` 且支援 `/dev/tcp`,改用 `test: ["CMD","bash","-c","exec 3<>/dev/tcp/127.0.0.1/21081"]` 做 TCP-accept readiness(server listen 21081 即 healthy);`start_period: 120s` 容 cargo-watch 冷編譯。

2. **prod.conf `:80` block:server-level `return 301` → location-based**
   - 原 contract([nginx-routing.md](./contracts/nginx-routing.md))prod.conf `:80` 用 server-level `return 301 https://...`。但 nginx server-level `return` 在 rewrite phase 早於 location match 觸發 → 會把 `/health` 也 301 吃掉;而 base 層 front-nginx healthcheck 在 prod 打 `:80/health`,故 `/health` 必須在 `:80` 回 200。
   - 改為 location-based:`location = /health { return 200 "ok\n"; }` + `location / { return 301 https://$host$request_uri; }`(/health 走 HTTP 200、其餘才 redirect)。

3. **全 wget-based healthcheck:`localhost` → `127.0.0.1`**
   - alpine `/etc/hosts` 把 `localhost` 先解到 `::1`(IPv6),但 nginx(`listen 80`/`21080`)與 vite(`--host 0.0.0.0`)只綁 IPv4 → `wget http://localhost` connection refused、healthcheck 永久 fail → `depends_on service_healthy` 卡死、`up --wait` exit 1。
   - 3 處 healthcheck(base front-nginx prod :80、dev front-nginx :21080、dev base-web :21079)改用 `127.0.0.1` 直打 IPv4。rust-api dev(/dev/tcp/127.0.0.1)與 prod base-web image(127.0.0.1/health.html)本就安全。

**驗收結果**:修正後 dev / prod baseline / prod+acme 三模式 `up --wait` 全 exit 0、5(prod+acme 6)service 全 healthy;7 段 C-V acceptance(SC-001~008)全 PASS。
