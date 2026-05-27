---
description: "Task list for 002-dockerfile-base-web implementation"
---

# Tasks: dockerfile-base-web

**Input**: Design documents from `/specs/002-dockerfile-base-web/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) 開頭紀律):
- **無單元測試**:本 feature 全 wiring + Dockerfile / compose 配置 + 1 個 4-line static HTML、無新純函式邏輯
- **Acceptance**(C-V contract):由 [verification-commands.md](./contracts/verification-commands.md) 6 段 acceptance 覆蓋(dev profile + prod profile 3 acceptance + image tag + 軌道紀律 + 000 修 + Constitution)
- 此紀律已在 spec + plan + verification-commands.md §0 明示

**Organization**: 6 個 phase,3 個 user story phase 各對應 spec 內 P1/P2/P3 story + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: 在 User Story phase 內必加(US1 / US2 / US3);Setup / Foundational / Polish 無 story label
- 全部 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

---

## Phase 1: Setup (Pre-flight Sanity Check)

**Purpose**:確認 worktree 與 outer 狀態正確,才能安全動 `base-web/` 與 `deploy/`。

- [ ] T001 Pre-flight check:`git -C base-web branch --show-current` 必須 = `rev2-admin-rust-api`、`git -C base-web status --short` 必須空(乾淨);外層 `git branch --show-current` 必須 = `002-dockerfile-base-web`、`git status --short` 必須空。任一不符 → 停下並回報。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:全部 source 修改 + 新增 1 檔。**所有 user story 都需此 phase 完成才能 verify**。

**⚠️ CRITICAL**: 無 user story 任務可在此 phase 完成前開始

### Source changes(部分可並行)

- [ ] T002 [P] Create `base-web/public/health.html` per [contracts/health-html-static.md](./contracts/health-html-static.md);內容 4 行(2 HTML 註解 + `ok` body + trailing newline);**注意:這在 base-web/ worktree 內、屬 BASE-WEB-ADAPT 軌道(constitution §III.1 預設可動)**,完成後本檔 `git -C base-web status` 應只顯示 `?? public/health.html`

- [ ] T003 Modify `deploy/Dockerfile.base-web.txt` **builder stage**(對齊 [contracts/build-arg-vite-service-base-url.md](./contracts/build-arg-vite-service-base-url.md) + research §1):
    * 在 `COPY .env .env.prod .env.test ./` 後、`RUN pnpm build` 前,加 `ARG VITE_SERVICE_BASE_URL=https://mock.apifox.cn/m1/3109515-0-default` + `RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local`(**注意**:不要寫 `ENV VITE_SERVICE_BASE_URL=$ARG` — vite `loadEnv` 不讀 process.env、會無效,detail 見 research §1)
    * nginx config heredoc 內 `listen 80;` 改為 `listen 21079;`(對齊 [contracts/health-html-static.md](./contracts/health-html-static.md) nginx config 紀律)

- [ ] T004 Modify `deploy/Dockerfile.base-web.txt` **runtime stage**(sequential after T003 同檔):
    * `EXPOSE 80` 改為 `EXPOSE 21079`
    * 加 `HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok" || exit 1`(對齊 [contracts/healthcheck-probe.md](./contracts/healthcheck-probe.md);timing 對齊 001)

- [ ] T005 Modify `docker-compose.base-web.yml` **dev profile**(對齊 [contracts/compose-profiles.md](./contracts/compose-profiles.md)):
    * `container_name: rev2-base-web-dev` 改為 `rev2-admin-base-web-dev`
    * `ports: ["9527:9527"]` 改為 `["21079:21079"]`
    * `command` 內 `pnpm dev --host 0.0.0.0 --port 9527` 改為 `--port 21079`
    * **不動** environment / volumes / init / tty / stdin_open(全 000 既有)

- [ ] T006 Modify `docker-compose.base-web.yml` **prod profile**(sequential after T005 同檔):
    * `container_name: rev2-base-web-prod` 改為 `rev2-admin-base-web`
    * `ports: ["9528:80"]` 改為 `["21079:21079"]`
    * 加 `image: rev2-admin-base-web:latest`(顯式 tag、放在 `build:` 同層)
    * 加 `build.args.VITE_SERVICE_BASE_URL: "${VITE_SERVICE_BASE_URL:-https://mock.apifox.cn/m1/3109515-0-default}"`
    * **不動** restart unless-stopped

### Foundation gates(sequential — 須前面全成才能跑)

- [ ] T007 Verify dev profile parses + builds dev image base 拉取成功:`docker compose -f docker-compose.base-web.yml --profile dev config 2>&1 | head -20` 無 error + `docker compose -f docker-compose.base-web.yml --profile dev pull base-web-dev` 拉 `node:20.19-alpine` 成功(若已 cached、立即返回)

- [ ] T008 Verify prod build:`DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod build 2>&1 | tail -10` 兩 stage(builder + runtime)build 成功 + `docker image inspect rev2-admin-base-web:latest --format='{{.Size}}' | numfmt --to=iec` < 80 MB(SC-004 預檢)

**Checkpoint**: Foundation 就緒 — 所有 user story 可以開始 acceptance verify

---

## Phase 3: User Story 1 — base-web port 對齊 §8.2 (Priority: P1) 🎯 MVP

**Goal**:standalone compose dev / prod profile 跑起來,`http://127.0.0.1:21079/health.html` 回 `ok`、`http://127.0.0.1:21079/` 回 SPA index;`docker run --rm rev2-admin-base-web:latest` 也能獨立跑。

**Independent Test**:跑 dev 或 prod profile + curl `/health.html` + curl `/` 三命令通過即驗。

### Implementation for User Story 1

> 本 phase 無新 implementation tasks(實作全在 Foundational T002-T008 完成);本 phase 只跑 acceptance verification。

- [ ] T009 [US1] Acceptance:`docker compose -f docker-compose.base-web.yml --profile dev up -d` + 等 ≤ 60s(SC-001 上限;非首次 cached 場景 30s 內就應該到位)+ `curl -fsS http://127.0.0.1:21079/health.html` 回 `ok` + `curl -fsS http://127.0.0.1:21079/` 回 SPA index(對應 spec User Story 1 Acceptance 1 + SC-001;[verification-commands.md](./contracts/verification-commands.md) §1)。完成後 `docker compose -f docker-compose.base-web.yml --profile dev down`

- [ ] T010 [US1] Acceptance:`DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait` + `curl -fsS http://127.0.0.1:21079/health.html` 回 `ok` + `curl -fsS http://127.0.0.1:21079/some/random/route` 回 SPA index(對應 spec User Story 1 Acceptance 2;[verification-commands.md](./contracts/verification-commands.md) §2.a)

- [ ] T011 [US1] Acceptance(承 T010 prod build):`docker compose -f docker-compose.base-web.yml --profile prod down` + `docker run -d --name bw_test -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest` + 等 10s + `curl -fsS http://127.0.0.1:21079/health.html` 回 `ok` + cleanup `docker stop bw_test && docker rm bw_test`(對應 spec User Story 1 Acceptance 3 + FR-007;[verification-commands.md](./contracts/verification-commands.md) §3)

**Checkpoint**: User Story 1 fully functional;MVP 達成、可 ship 此階段(若只交 port 對齊基建)

---

## Phase 4: User Story 2 — nginx HEALTHCHECK 自動健康狀態 (Priority: P2)

**Goal**:prod profile up 後 30 秒內 container 標 `healthy`;模擬故障後 60 秒內標 `unhealthy`。

**Independent Test**:`docker inspect ... .State.Health.Status` 兩次(正常 + 故障)即驗。

### Implementation for User Story 2

> 同 Phase 3,無新 implementation tasks(HEALTHCHECK 已在 T004 完成)。

- [ ] T012 [US2] Acceptance:`DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait` + 等 30s + `docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'` 回 `healthy`(對應 spec User Story 2 Acceptance 1 + SC-002)

- [ ] T013 [US2] Acceptance(承 T012 prod running):`docker exec rev2-admin-base-web rm /usr/share/nginx/html/health.html` + 等 60s(`retries=3` × `interval=10s` + safety margin)+ `docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'` 回 `unhealthy`(對應 spec User Story 2 Acceptance 2;[verification-commands.md](./contracts/verification-commands.md) §2.c)。完成後 `docker compose ... down`

**Checkpoint**: User Stories 1+2 both independently functional

---

## Phase 5: User Story 3 — VITE_SERVICE_BASE_URL build-arg (Priority: P3)

**Goal**:`VITE_SERVICE_BASE_URL=<custom>` build 後 bundle inline 新 URL、不含舊 ApiFox Mock URL;不動 `base-web/.env*` inline。

**Independent Test**:`grep -c '<URL substring>' /usr/share/nginx/html/assets/*.js` 比對 default vs override 兩次 build 即驗。

### Implementation for User Story 3

> 同前,無新 implementation tasks(build-arg 機制已在 T003 完成 .env.prod.local 寫入)。

- [ ] T014 [US3] Acceptance(standard build,可承 T010 或重 build):確認 `grep -c 'mock.apifox.cn' /usr/share/nginx/html/assets/*.js`(in `docker run --rm rev2-admin-base-web:latest sh -c "..."`)> 0(預設 ApiFox URL inline 進 bundle;對應 spec User Story 3 Acceptance 1;[verification-commands.md](./contracts/verification-commands.md) §2.b)

- [ ] T015 [US3] Acceptance(override build):`docker compose -f docker-compose.base-web.yml --profile prod down` + `VITE_SERVICE_BASE_URL=http://rust-api:21081 DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait` + `docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'rust-api:21081' /usr/share/nginx/html/assets/*.js"` > 0 + `grep -c 'mock.apifox.cn' ...` = 0(對應 spec User Story 3 Acceptance 2 + SC-003;[verification-commands.md](./contracts/verification-commands.md) §2.b)

- [ ] T016 [US3] Acceptance(不動 inline):`git -C base-web diff --name-only HEAD` 結果**只**含 `public/health.html`、不出現 `.env.prod` / `.env` / `vite.config.ts` / `src/` / `package.json` 等(對應 spec User Story 3 Acceptance 3 + SC-005 + FR-023;[verification-commands.md](./contracts/verification-commands.md) §4)

**Checkpoint**: 三 user story 全 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:000-bootstrap.md surgical patch + Constitution Compliance 自我覆查 + end-to-end smoke。

- [ ] T017 Update `docs/superpowers/000-base-web-docker-bootstrap.md` surgical patches(4 處,可在同一 commit / 同一 edit pass):
    * §2.3 port 表 prose:dev/prod 兩 row 改寫(消除「避開 dev 21079」自相矛盾);§2.3 開頭 "⚠️ 未來與 §8.2 整合考量" 從「避開兩套並存」改「對齊 §8.2 規劃 21079」
    * §6.1:標題 + 內文從「prod profile 沒實機跑(必補)」改「prod profile 實機驗收 ✅(feature 002 完成)」+ 引用 `specs/002-dockerfile-base-web/contracts/`
    * §6.3:「port 待對齊」段改「port 已對齊 21079」+ 補 §8.2 整合策略(internal:21079 + front-nginx 21080/21443)
    * 檔尾加 footnote 引用 feature 002 update(條列 4 項變動:port / build-arg / HEALTHCHECK / public/health.html)
    * **不動** §3 / §4 / §5 / §7 / §8 / Appendix(對齊 FR-022)

- [ ] T018 Verify SC-006:`grep -c "prod profile 沒實機跑" docs/superpowers/000-base-web-docker-bootstrap.md` = 0(原 deferred 字串已替換)+ `grep -c "prod profile 實機驗收 ✅" docs/superpowers/000-base-web-docker-bootstrap.md` ≥ 1([verification-commands.md](./contracts/verification-commands.md) §5)

- [ ] T019 Constitution Compliance 自我覆查([verification-commands.md](./contracts/verification-commands.md) §6):
    * (a)`git -C rust-api status --short` 為空(本 feature 不動 rust-api、I.5)
    * (b)`git -C base-web diff --name-only HEAD` 只含 `public/health.html`(本 feature 不改 base-web inline、I.1 + BASE-WEB-ADAPT 軌道)
    * (c)本 plan Constitution Check 7 項對照 [plan.md](./plan.md) Constitution Check 段、Re-check 仍全 PASS

- [ ] T020 [P] End-to-end smoke:跑 [quickstart.md](./quickstart.md) Path A(dev profile + curl)+ Path B(prod profile + 3 驗收)+ Path C(build-arg override)+ Path D(image tag 獨立 run)完整流程,記錄任何 friction 進 `docs/superpowers/002-dockerfile-base-web.md` §10 Open Questions(若需)。**[P] 註**:本 task 依 stack 運轉狀態(承 T010-T015)、但與 T017-T019 doc patch / Constitution self-check 不同檔不互鎖、可平行跑(controller 跑 quickstart 期間,implementer 同步進 doc patch)

**Checkpoint**: feature 完整、可進 `superpowers:finishing-a-development-branch` 階段(rev2 base-web SHA pin 更新 + outer commit + merge 回 `rev2-admin-root` + 更新 CHECKLIST §4 Phase 1 #2 ✅ + MILESTONES append)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,可立即開始
- **Foundational (Phase 2)**:依 Setup 完成;**BLOCKS 所有 user story**
- **User Story 1 (Phase 3, P1)**:依 Foundational 完成
- **User Story 2 (Phase 4, P2)**:依 Foundational 完成 + 可承 T012/T013 接 T010 prod up state
- **User Story 3 (Phase 5, P3)**:依 Foundational 完成;T015 build-arg override 會重 build、不依賴 T010 之前 build
- **Polish (Phase 6)**:依所需 user story 完成

### Within Phase 2 (Foundational)

**Sequential dependencies**:
- T003 → T004(同 `Dockerfile.base-web.txt` 檔、不同 stage 但 sequential 編輯)
- T005 → T006(同 `docker-compose.base-web.yml` 檔、不同 profile 但 sequential 編輯)
- T002 / T003-T004 / T005-T006 完成 → T007 → T008

**Parallel opportunities**:
- T002(`public/health.html`)獨立檔 — [P] 可與 T003-T006 任一段並行
- T003-T004 為一束(同檔)vs T005-T006 為一束(同檔)— 兩束可並行(`Dockerfile.base-web.txt` 與 `docker-compose.base-web.yml` 不同檔)

### Within User Story Phases

- Phase 3 (US1) T009 / T010 / T011 sequential(T010 prod build 後 T011 reuse image;T009 dev/T010 prod 用同 port、不能並行)
- Phase 4 (US2) T012 → T013 sequential(同 container state)
- Phase 5 (US3) T014 / T015 sequential(同 container state);T016 independent 可在任何時點 [P]
- Cross-phase:US1 T010 prod build 可被 US2 T012 / US3 T014 共用(節省 build 時間)

### Parallel Opportunities Summary

- Phase 1:單一 task,無並行
- Phase 2:T002 與 (T003-T004) 與 (T005-T006) 三束並行(3 個不同檔修)
- Phase 5:T016 可在 T014/T015 進行中跑(獨立檢查 git diff)
- Phase 6:T020 與 T017-T019 可並行(quickstart 跑時順手做 doc patch)

---

## Parallel Example: Phase 2 Foundational

```bash
# Wave 1(平行)
T002:  Create base-web/public/health.html
T003:  Modify Dockerfile.base-web.txt builder stage
T005:  Modify docker-compose.base-web.yml dev profile

# Wave 2(承 Wave 1 同檔依賴)
T004:  Modify Dockerfile.base-web.txt runtime stage(承 T003)
T006:  Modify docker-compose.base-web.yml prod profile(承 T005)

# Wave 3:sequential gate
T007 → T008
```

---

## Parallel Example: User Story phases

```bash
# Phase 3-5 acceptance 全可承 T010 一次 prod build:
T009 (US1 dev)  → 獨立 dev profile up
T010 (US1 prod) → 第一次 prod build + container up
  ├─ T011 (US1 image tag run) 承同 image
  ├─ T012 (US2 healthy) 承同 container
  ├─ T013 (US2 unhealthy 故障模擬) 承 T012
  ├─ T014 (US3 default URL grep) 承同 image
T015 (US3 override URL) → 重 build 不同 build-arg
T016 (US3 git diff) [P] → 隨時可跑
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup(1 task)
2. 完成 Phase 2: Foundational(7 tasks)— **CRITICAL,blocks all stories**
3. 完成 Phase 3: User Story 1(3 acceptance tasks)
4. **STOP and VALIDATE**:跑 quickstart Path A + B + D
5. 達 MVP:standalone compose 跑、port 對齊 §8.2、可 demo

### Incremental Delivery

1. Phase 1 + 2 完成 → Foundation ready
2. Phase 3 (US1) → MVP demo
3. Phase 4 (US2) → 加 HEALTHCHECK 自動健康狀態
4. Phase 5 (US3) → 加 build-arg 部署彈性
5. Phase 6 (Polish) → 000 修 + Constitution Compliance 自我覆查
6. `superpowers:finishing-a-development-branch` → rev2-admin-base-web SHA pin update + outer merge 回 `rev2-admin-root` + 更新 CHECKLIST + MILESTONES

### Parallel Team Strategy

本 feature 單人即可完成(實作量 ~1 工作天),不需多 implementer 並行;若用 `superpowers:subagent-driven-development`:
- 一個 implementer subagent 跑完 Phase 1-2(wave 並行)
- 另一 implementer 或同一 subagent 跑 Phase 3-5 acceptance(不需 implement code、只跑 verify)
- 同一 implementer 跑 Phase 6 polish(000 patch + 自我覆查)
- 不適合多 implementer 並行 — port 21079 sigle,只能擇一 profile up;Dockerfile / compose 兩檔修動順序 sensitive

---

## Notes

- 全部 file path 為 `base-web/...` 或 `deploy/...` 或 `docker-compose.base-web.yml` 或 `docs/superpowers/000-...`,從 workspace root 往下
- **兩段式 commit 紀律**:`base-web/public/health.html` 新增屬 inner stage(在 base-web/ worktree 內、推到 fork remote `rev2-admin-base-web` 分支);其餘檔(Dockerfile / compose / 000 patch)是外層 stage(在 outer rev2 repo / 002-dockerfile-base-web feature branch);完成後在 outer 加第二段 `git add base-web` 更新 SHA pin。詳見 CLAUDE.md §4.1
- Phase 3-5 acceptance task 失敗時:回 Phase 2 對應 T002-T006 修(non-trivial 改動可能須回 brainstorm / re-design)
- 任何偏離 [plan.md](./plan.md) 設計的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V 紀律:結論在 constitution、研究歷史在 design)
- `superpowers:executing-plans` 階段會把這 20 個 task 編成 execution unit + 派 fresh implementer subagent;tasks.md 不寫具體 implementation prompt(由 implementer subagent 從本檔 + plan.md + contracts/ + spec.md 自取)
