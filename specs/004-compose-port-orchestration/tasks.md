---
description: "Task list for 004-compose-port-orchestration implementation"
---

# Tasks: compose-port-orchestration

**Input**: Design documents from `/specs/004-compose-port-orchestration/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0 紀律):
- **無單元測試**:本 feature 全 docker-compose orchestration + nginx conf + acme skeleton,無新純函式邏輯
- **Acceptance**(C-V contract):由 [verification-commands.md](./contracts/verification-commands.md) 7 段覆蓋(dev stack healthy + nginx 路由 strip + TLS handshake + prod redirect + acme sanity + standalone DEPRECATED + Constitution self-check)
- 此紀律已在 spec + plan + verification-commands.md §0 明示

**Organization**: 6 個 phase,3 個 user story phase 各對應 spec P1/P2/P3 story + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User Story phase 內必加(US1 / US2 / US3);Setup / Foundational / Polish 無 story label
- 全部 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

---

## Phase 1: Setup (Pre-flight Sanity Check)

**Purpose**:確認 outer 狀態正確、前置 feature(001/002/003)就緒,才能安全動 master compose。

- [ ] T001 Pre-flight check:外層 `git branch --show-current` 必須 = `004-compose-port-orchestration`、`git status --short` 必須空(乾淨)。`base-web/` 與 `rust-api/` worktree status 必須空(本 feature 完全不動)。確認前置:`docker image inspect rev2-admin-rust-api:latest`(001)+ `rev2-admin-base-web:latest`(002)可 build OR 已存在;`deploy/dev-certs/{fullchain,privkey}.pem`(003)存在。任一不符 → 停下並回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:全部 source 新增(3 compose + nginx 4 檔 + acme 2 檔 + 2 secret 範本)+ 2 standalone DEPRECATED header。**所有 user story 都需此 phase 完成才能 verify**。

**⚠️ CRITICAL**: 無 user story 任務可在此 phase 完成前開始

### Source changes — Wave 1(並行,不同檔)

- [ ] T002 [P] Create `rev2-root/docker-compose.yml`(base,5 service 共通定義):對齊 [contracts/compose-topology.md](./contracts/compose-topology.md) + [data-model.md Entity 1-3](./data-model.md)。頂層 `name: rev2-admin`(COMPOSE_PROJECT_NAME);5 service(`front-nginx` image `nginx:1.31.0-alpine` / `base-web` build prod `:latest` / `rust-api` build prod `:latest` runtime target / `postgres` `postgres:17-alpine` / `redis-stack` `redis/redis-stack-server:latest`);各 service `healthcheck`(R6:front-nginx wget /health、postgres pg_isready、redis redis-cli -a ping;base-web/rust-api prod image 自帶)+ `depends_on service_healthy`(front-nginx → base-web+rust-api;rust-api → postgres+redis-stack 預留);network `rev2_net`;named volume 顯式 `name: rev2_postgres_data` / `rev2_redis_data` / `rev2_front_nginx_certs` + 既有 rev2_bw_* / rev2_rust_api_*;secrets `postgres_password` / `redis_password` / 既有 jwt/refresh。**★ base 層不放 host `ports`、不放 dev/prod 專屬 volume**(R1 list append gotcha);acme service 定義 `profiles: [prod]`

- [ ] T003 [P] Create `rev2-root/docker-compose.dev.yml`(dev override):對齊 [contracts/compose-topology.md](./contracts/compose-topology.md) port 表 + [data-model.md Entity 2 dev hot-reload](./data-model.md)。`base-web` override → `image: node:20.19-alpine` + `./base-web:/app` bind mount + `rev2_bw_node_modules`/`rev2_bw_pnpm_store` mask + `command: pnpm dev --host`(繼承 002 standalone dev)+ healthcheck wget /;`rust-api` override → build target `dev`(`:dev`)+ `./rust-api:/app` + `rev2_rust_api_*` mask + cargo-watch + healthcheck curl /health;host port `127.0.0.1:` loopback(front-nginx 21080/21443、base-web 21079、rust-api 21081、postgres 25432:5432、redis 26379:6379);front-nginx bind mount `./deploy/dev-certs:/etc/nginx/certs:ro` + `./deploy/nginx/conf.d/dev.conf:/etc/nginx/conf.d/default.conf:ro`

- [ ] T004 [P] Create `rev2-root/docker-compose.prod.yml`(prod override):對齊 [contracts/compose-topology.md](./contracts/compose-topology.md) + [contracts/nginx-routing.md TLS](./contracts/nginx-routing.md)。front-nginx `0.0.0.0:80,443` + named volume `rev2_front_nginx_certs:/etc/nginx/certs` + `./deploy/nginx/conf.d/prod.conf:/etc/nginx/conf.d/default.conf:ro`;base-web/rust-api 用 built `:latest`(internal only,不對 host expose);`acme` service(`profiles: [prod]`,build `deploy/Dockerfile.acme.txt` + mount `rev2_front_nginx_certs`)

- [ ] T005 [P] Create `rev2-root/deploy/nginx/nginx.conf`(main):`events { worker_connections 1024; }` + `http { include /etc/nginx/conf.d/*.conf; ... gzip / log 基本設定 }`(對齊 [data-model.md Entity 4](./data-model.md))

- [ ] T006 [P] Create `rev2-root/deploy/nginx/conf.d/_locations.inc`(共用 location):對齊 [contracts/nginx-routing.md](./contracts/nginx-routing.md) — `location /`(proxy_pass http://base-web:21079 + X-Forwarded headers)+ `location /api/`(proxy_pass http://rust-api:21081**/** 末尾 `/` strip 前綴 + headers)+ `location = /health`(return 200 ok)。**★ proxy_pass 末尾 `/` 必要**(R2 strip /api)

- [ ] T007 [P] Create `rev2-root/deploy/nginx/conf.d/dev.conf`:對齊 [contracts/nginx-routing.md dev.conf](./contracts/nginx-routing.md) — `server { listen 21080; include _locations.inc; }` + `server { listen 21443 ssl; ssl_certificate /etc/nginx/certs/fullchain.pem; ssl_certificate_key /etc/nginx/certs/privkey.pem; include _locations.inc; }`(雙開、不 redirect)

- [ ] T008 [P] Create `rev2-root/deploy/nginx/conf.d/prod.conf`:對齊 [contracts/nginx-routing.md prod.conf](./contracts/nginx-routing.md) — `server { listen 80; return 301 https://$host$request_uri; }` + `server { listen 443 ssl; ssl_certificate ...; include _locations.inc; }`(80→443 強制 redirect)

- [ ] T009 [P] Create `rev2-root/deploy/Dockerfile.acme.txt`:`FROM neilpang/acme.sh:3.1.3` + `COPY acme-entrypoint.sh /acme-entrypoint.sh` + `RUN chmod +x /acme-entrypoint.sh` + `ENTRYPOINT ["/acme-entrypoint.sh"]`(對齊 [data-model.md Entity 5](./data-model.md) + [research.md R7](./research.md))

- [ ] T010 [P] Create `rev2-root/deploy/acme-entrypoint.sh`(skeleton idle):`#!/usr/bin/env sh` + 印「acme skeleton ready — 設 DNS provider creds + domain 後啟用 acme.sh --issue」+ `exec tail -f /dev/null`(idle,不 crash loop;R7)。chmod +x

- [ ] T011 [P] Create `rev2-root/deploy/secrets/postgres_password.txt.example`(範本,git-tracked):placeholder 內容(如 `change_me_postgres_password`)。**注意**:`.gitignore` line 68-69 已有 `/deploy/secrets/*.txt` ignore + `!*.txt.example` 豁免,實 `.txt` 自動 ignored(不需改 .gitignore)

- [ ] T012 [P] Create `rev2-root/deploy/secrets/redis_password.txt.example`(範本,git-tracked):placeholder 內容(如 `change_me_redis_password`)

- [ ] T013 [P] Append DEPRECATED header to `rev2-root/docker-compose.base-web.yml`:檔頂加 `# ⚠️ DEPRECATED — 本 standalone compose 已退場(Phase 1 #4 master compose 落地 2026-05-28)`+ 主流命令提示 + 「保留作 single-service debug 後備、未來不一定同步」。**不**動既有 service 定義本體(對齊 [data-model.md Entity 8](./data-model.md))

- [ ] T014 [P] Append DEPRECATED header to `rev2-root/docker-compose.rust-api.yml`:同 T013 格式

### Foundation gates — Wave 2(sequential,承 Wave 1 全完成)

- [ ] T015 Verify compose config:`docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q`(dev)+ `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod config -q`(prod+acme)兩者無 error(YAML + merge + secret/volume reference 合法)

- [ ] T016 Verify nginx conf syntax:`docker run --rm -v "$PWD/deploy/nginx:/etc/nginx:ro" nginx:1.31.0-alpine nginx -t`(或 mount 個別 conf 驗);無 syntax error。**注意** `include` 路徑解析(`_locations.inc` 須在 `/etc/nginx/conf.d/`);若 `nginx -t` 因 default.conf 未 mount 而 warn,改 mount dev.conf 為 default.conf 驗

- [ ] T017 Verify acme Dockerfile build + entrypoint:`docker build -f deploy/Dockerfile.acme.txt -t rev2-acme-test deploy/`(build 成功)+ `sh -n deploy/acme-entrypoint.sh`(shell syntax OK)+ `[ -x deploy/acme-entrypoint.sh ]`(exec bit)

- [ ] T018 Verify secret 範本 + gitignore:`[ -f deploy/secrets/postgres_password.txt.example ]` + `[ -f deploy/secrets/redis_password.txt.example ]` true;`echo test > deploy/secrets/postgres_password.txt && git check-ignore deploy/secrets/postgres_password.txt`(回路徑 = ignored)+ `git check-ignore deploy/secrets/postgres_password.txt.example`(exit 1 = NOT ignored、範本可 track);清掉測試 `.txt`

**Checkpoint**: Foundation 就緒 — 所有 user story 可以開始 acceptance verify

---

## Phase 3: User Story 1 — dev profile 一鍵拉起完整 stack (Priority: P1) 🎯 MVP

**Goal**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 把 5 service 拉起全 healthy;`curl 127.0.0.1:21080/health` 回 ok;postgres/redis host 直連可用。

**Independent Test**:dev profile up + `docker compose ps` 5 service healthy + `curl 21080/health` ok,即驗。

### Implementation for User Story 1

> 本 phase 無新 implementation tasks(實作全在 Foundational T002-T018);本 phase 只跑 acceptance verification。

- [ ] T019 [US1] Acceptance:dev profile 完整 stack 啟動(對應 spec US1 Acceptance 1-3 + SC-001;[verification-commands.md §1](./contracts/verification-commands.md))
    * 前置:`bash deploy/generate-dev-cert.sh`(003,若 dev-certs 已有可跳)+ 生 dev secret(`openssl rand -base64 24 > deploy/secrets/{postgres,redis}_password.txt`)
    * `time docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` → exit 0、5 service 全 healthy(cache 後 < 60s,SC-001)
    * `docker compose ... ps` 顯示 front-nginx / base-web / rust-api / postgres / redis-stack 5 個 running + healthy

- [ ] T020 [US1] Acceptance:底層 service host 直連(對應 spec US1 Acceptance 4;[verification-commands.md §1](./contracts/verification-commands.md))
    * `curl -fsS http://127.0.0.1:21080/health` 回 `ok`
    * `pg_isready -h 127.0.0.1 -p 25432` 回 accepting connections
    * `redis-cli -h 127.0.0.1 -p 26379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping` 回 `PONG`

**Checkpoint**: User Story 1 fully functional;MVP 達成(dev stack 一鍵拉起)

---

## Phase 4: User Story 2 — nginx 路由分流 + TLS (Priority: P2)

**Goal**:`/` → base-web SPA、`/api/*` strip → rust-api;HTTPS 走 003 cert(SAN localhost+127.0.0.1)。

**Independent Test**:`curl 21080/`(SPA)+ `curl 21080/api/health`(strip → rust-api 200)+ `openssl s_client 21443`(SAN 對齊),三段通過即驗。

### Implementation for User Story 2

> 同 Phase 3,無新 implementation tasks(路由 + TLS 已在 T006/T007/T008 nginx conf 完成)。

- [ ] T021 [US2] Acceptance:nginx 路由分流 / strip(對應 spec US2 Acceptance 1-2 + SC-002/SC-003;[verification-commands.md §2](./contracts/verification-commands.md))
    * `curl -fsS http://127.0.0.1:21080/ | head -5` 回 base-web SPA index.html(`<!DOCTYPE html>`,SC-002)
    * `curl -fsS http://127.0.0.1:21080/api/health` 回 `ok`(rust-api 收到 strip 後 `/health`,證明 `/api` 前綴正確 strip,SC-003)
    * 反證:`curl -fsS http://127.0.0.1:21081/health`(dev rust-api 直連)與上一致

- [ ] T022 [US2] Acceptance:TLS handshake + SAN(對應 spec US2 Acceptance 3-4 + SC-004;[verification-commands.md §3](./contracts/verification-commands.md))
    * `curl -kfsS https://127.0.0.1:21443/health` 回 `ok`
    * `openssl s_client -connect 127.0.0.1:21443 -servername localhost </dev/null 2>&1 | grep "subject="` 含 `CN=localhost`
    * `echo | openssl s_client -connect 127.0.0.1:21443 -servername localhost 2>/dev/null | openssl x509 -noout -ext subjectAltName` 含 `DNS:localhost, IP Address:127.0.0.1`(SC-004)

**Checkpoint**: User Stories 1+2 both independently functional

---

## Phase 5: User Story 3 — prod baseline + acme skeleton + standalone 退場 (Priority: P3)

**Goal**:prod baseline(0.0.0.0 + 80→443 redirect、named volume seed cert);`--profile prod` acme skeleton sanity;standalone DEPRECATED header。

**Independent Test**:seed cert 後 prod baseline `curl -I 21080/` 301;`--profile prod exec acme acme.sh --version` 回版本;`head docker-compose.base-web.yml` 含 DEPRECATED,三段通過即驗。

### Implementation for User Story 3

> 同前,無新 implementation tasks(prod override / acme / DEPRECATED header 已在 T004/T009/T010/T013/T014 完成)。

- [ ] T023 [US3] Acceptance:prod baseline + 80→443 redirect(對應 spec US3 Acceptance 1-2 + SC-005;[verification-commands.md §4](./contracts/verification-commands.md))
    * down dev:`docker compose -f docker-compose.yml -f docker-compose.dev.yml down`
    * seed cert:`docker run --rm -v rev2_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"`
    * `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait` → exit 0
    * `curl -sI http://127.0.0.1:21080/ | head -3` 回 `301` + `Location: https://...`(SC-005)

- [ ] T024 [US3] Acceptance:prod + acme skeleton sanity(對應 spec US3 Acceptance 3 + SC-006;[verification-commands.md §5](./contracts/verification-commands.md))
    * `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait`
    * `docker compose ... --profile prod exec acme acme.sh --version` 回 acme.sh 版本字串(skeleton sanity,不真實 issue cert)
    * `docker compose ... --profile prod ps acme --format '{{.State}}'` 回 `running`(idle entrypoint 不 crash)

- [ ] T025 [US3] Acceptance:standalone DEPRECATED + 後備(對應 spec US3 Acceptance 4 + SC-007;[verification-commands.md §6](./contracts/verification-commands.md))
    * `head -5 docker-compose.base-web.yml | grep -c "DEPRECATED"` ≥ 1
    * `head -5 docker-compose.rust-api.yml | grep -c "DEPRECATED"` ≥ 1
    * `docker compose -f docker-compose.rust-api.yml config -q && docker compose -f docker-compose.base-web.yml config -q`(standalone 仍 valid、service 定義未動)

**Checkpoint**: 三 user story 全 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + §8.2.1 微修 + end-to-end smoke。

- [ ] T026 Constitution Compliance 自我覆查([verification-commands.md §7](./contracts/verification-commands.md)):
    * (a)`git -C base-web status --short` 為空(§I.1 + FR-023)
    * (b)`git -C rust-api status --short` 為空(§I.5 + FR-023)
    * (c)`git diff --name-only HEAD -- deploy/Dockerfile.base-web.txt deploy/Dockerfile.rust-api.txt deploy/secrets/jwt_secret.txt.example deploy/secrets/refresh_token_secret.txt.example` 為空(未動 001/002 既有 Dockerfile / secret 範本,FR-023)
    * (d)`grep -c "✅ Pass" specs/004-compose-port-orchestration/plan.md` ≥ 14(Constitution Check 7 + Re-Check 7)

- [ ] T027 [P] §8.2.1 微修 + E2E smoke:
    * **§8.2.1 微修**(對齊 [research.md R8](./research.md)):`CLAUDE.md §8.2.1` seed cert 命令的 named volume `rev2-admin_front_nginx_certs` → 改 `rev2_front_nginx_certs`(對齊本 feature 顯式 `name:` 命名);此為 workspace-level docs 微修(spec FR「可能微修 §8.2.1」scope 內)
    * **E2E smoke**:跑 [quickstart.md](./quickstart.md) Path A(dev)+ Path B(路由+TLS)+ Path C(prod+acme)+ Path D(standalone)完整流程;記錄任何 friction 進 `docs/superpowers/004-compose-port-orchestration.md` §10 Open Questions(若需)
    * **[P] 註**:本 task 與 T026 不同檔不互鎖、可平行跑

**Checkpoint**: feature 完整、可進 `superpowers:finishing-a-development-branch` 階段(outer commit + push 004-compose-port-orchestration + merge 回 `rev2-admin-root` + 更新 CHECKLIST §1 + Phase 1 entry + MILESTONES append + CLAUDE.md §6 SPECKIT marker 收尾)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,可立即開始
- **Foundational (Phase 2)**:依 Setup 完成;**BLOCKS 所有 user story**
- **User Story 1 (Phase 3, P1)**:依 Foundational 完成
- **User Story 2 (Phase 4, P2)**:依 Foundational + US1 dev stack running(T021/T022 承 T019 dev up 狀態)
- **User Story 3 (Phase 5, P3)**:依 Foundational + T023 需 down dev → up prod(狀態切換)
- **Polish (Phase 6)**:依所需 user story 完成

### Within Phase 2 (Foundational)

**Sequential dependencies**:
- T010(acme-entrypoint.sh)→ T009 reference(Dockerfile COPY)→ T017(acme build verify)
- T002-T014 全完成 → T015(compose config)→ T016(nginx syntax)→ T017(acme build)→ T018(secret + gitignore)

**Parallel opportunities**:
- T002-T014 全部不同檔 — [P] Wave 1 可全並行(13 個獨立檔)
- T015-T018 sequential gates — Wave 2

### Within User Story Phases

- Phase 3 (US1) T019 → T020 sequential(T020 承 T019 dev up 狀態)
- Phase 4 (US2) T021 → T022 sequential(承 US1 dev running)
- Phase 5 (US3) T023 → T024 sequential(T024 承 T023 prod up);T025 independent(查 header,任意狀態)
- Cross-phase:US2 承 US1 dev stack running;US3 需切換 prod(down dev → up prod)

### Parallel Opportunities Summary

- Phase 1:單一 task,無並行
- Phase 2:T002-T014 全並行(13 不同檔)— Wave 1;T015-T018 sequential gates — Wave 2
- Phase 6:T026 與 T027 可並行(Constitution self-check 跟 §8.2.1 微修 + smoke 不同檔)

---

## Parallel Example: Phase 2 Foundational

```bash
# Wave 1(13 檔並行)
T002: docker-compose.yml (base)        T009: deploy/Dockerfile.acme.txt
T003: docker-compose.dev.yml           T010: deploy/acme-entrypoint.sh
T004: docker-compose.prod.yml          T011: secrets/postgres_password.txt.example
T005: deploy/nginx/nginx.conf          T012: secrets/redis_password.txt.example
T006: deploy/nginx/conf.d/_locations.inc  T013: docker-compose.base-web.yml DEPRECATED
T007: deploy/nginx/conf.d/dev.conf     T014: docker-compose.rust-api.yml DEPRECATED
T008: deploy/nginx/conf.d/prod.conf

# Wave 2:sequential gates
T015(compose config) → T016(nginx -t) → T017(acme build) → T018(secret + gitignore)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup(1 task)
2. 完成 Phase 2: Foundational(17 task)— **CRITICAL,blocks all stories**
3. 完成 Phase 3: User Story 1(2 acceptance task)
4. **STOP and VALIDATE**:跑 quickstart Path A
5. 達 MVP:dev stack 一鍵拉起全 healthy、front-nginx self 可達

### Incremental Delivery

1. Phase 1 + 2 完成 → Foundation ready
2. Phase 3 (US1) → MVP demo(dev stack 一鍵拉起)
3. Phase 4 (US2) → 加 nginx 路由分流 + TLS 驗
4. Phase 5 (US3) → 加 prod baseline + acme skeleton + standalone 退場
5. Phase 6 (Polish) → Constitution self-check + §8.2.1 微修 + quickstart E2E smoke
6. `superpowers:finishing-a-development-branch` → outer commit + push 004 + merge 回 `rev2-admin-root` + 更新 CHECKLIST + MILESTONES + §6 marker

### Parallel Team Strategy

本 feature 主要實作量在 Phase 2(13 個 orchestration 檔);可用 `superpowers:subagent-driven-development`:
- 一個 implementer subagent 跑 Phase 1-2(Wave 1 並行 13 檔 + sequential gates T015-T018)
- 同一 subagent 跑 Phase 3-5 acceptance(不需 implement code、只跑 verify;但需 docker daemon + 5 service 起得來)
- 同一 subagent 跑 Phase 6 polish
- 不適合多 implementer 並行 acceptance — single docker stack 共享狀態,dev/prod profile 切換 sequential

---

## Notes

- 全部 file path 為 `rev2-root/docker-compose*.yml` 或 `rev2-root/deploy/...`(workspace root + deploy)
- **單段 commit 紀律**(本 feature 純 workspace-level 改動):本 feature 不動 base-web / rust-api worktree,所以**無第二段 SHA pin commit**;outer commit 一段帶完所有 source changes(對齊 CLAUDE.md §4.1「外層專屬檔的單段 commit」紀律)
- **.gitignore 不需改**:line 68-69 已有 `/deploy/secrets/*.txt` ignore + `!*.txt.example` 豁免,postgres/redis password 自動涵蓋
- **redis-stack password 注入**(R4):redis-stack-server 無原生 `_FILE`,用 command/entrypoint wrap `--requirepass "$(cat /run/secrets/redis_password)"`(見 [service-secrets.md](./contracts/service-secrets.md))
- **R1 list append gotcha**:base 層**絕不**放 host `ports`(dev/prod override 各放),否則 merge 疊加 port 衝突
- **R2 proxy_pass 末尾 `/`**:`location /api/ { proxy_pass http://rust-api:21081/; }` 末尾 `/` 必要(strip /api);漏掉 = rust-api 404
- Phase 3-5 acceptance 失敗時:回 Phase 2 對應 T002-T018 修(non-trivial 改動可能須回 plan / brainstorm)
- 任何偏離 [plan.md](./plan.md) 設計的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V 紀律)
- `superpowers:executing-plans` 階段會把這 27 個 task 編成 execution unit + 派 fresh implementer subagent;tasks.md 不寫具體 implementation prompt(由 implementer 從本檔 + plan.md + contracts/ + spec.md 自取)
