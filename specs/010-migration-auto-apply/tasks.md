---
description: "Task list for 010-migration-auto-apply implementation"
---

# Tasks: migration-auto-apply

**Input**: Design documents from `/specs/010-migration-auto-apply/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0):
- 本 feature 為 **compose wiring**、**無新純邏輯函式 → 無單元測試**;由 dev/prod stack up acceptance 覆蓋(C-V contract)。
- **無 HTTP 業務 endpoint / 無 base-web modal → 無 CDP/curl 業務消費者**(只 `/health` + psql 驗 stack)。

**Organization**: 6 phase;3 個 user story phase 各對應 spec US1/US2/US3 + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**:可並行(不同檔、無未完依賴)
- **[Story]**:User Story phase 內必加(US1/US2/US3);Setup/Foundational/Polish 無 story label
- 全 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

> **★ commit 提醒**:本 feature **outer-only** —— 只動 `rev2-root/docker-compose.yml` / `.dev.yml` / `.prod.yml` 三個外層檔,**完全不碰 rust-api worktree**(不改 server/migration code、Dockerfile、entrypoint)。故**無兩段式 commit**,全部單段落在 `010-migration-auto-apply` feature branch。**本 tasks.md 不排 git push/merge 任務**(§3 紀律);commit/push/merge 於 `executing-plans`/`finishing` 階段處理。

---

## Phase 1: Setup (Pre-flight)

**Purpose**:確認前置就緒。

- [ ] T001 Pre-flight:外層 `git branch --show-current` = `010-migration-auto-apply`;工作樹乾淨;dev image 可 build(`docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api` 或既有 `:dev` image 在);確認現況**無** `migrate` service(`grep -c "migrate:" rev2-root/docker-compose.yml` = 0)且 `rust-api` depends_on 目前僅 `postgres`/`redis-stack`(`grep -nA4 "rust-api:" rev2-root/docker-compose.yml`)。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:base compose 的 `migrate` service 骨架 + `rust-api` 完成閘門 —— US1/US2/US3 共同前提。**必須先完成才進 user story**(無 override 時 migrate 無 image/command、尚不可獨立跑)。

- [ ] T002 在 `rev2-root/docker-compose.yml` 新增 `migrate` service 骨架:`build.context=./` + `build.dockerfile=deploy/Dockerfile.rust-api.txt`(target 留 override);`depends_on: postgres: {condition: service_healthy}`;`environment: APP_DATABASE_URL_FILE=/run/secrets/database_url`;`secrets: [database_url]`;`restart: "no"`;`networks: [rev2_net]`(image/target/command 由 dev/prod override 指定;對齊 [research R1/R4](./research.md))
- [ ] T003 在 `rev2-root/docker-compose.yml` 的 `rust-api` service `depends_on` 加一條 `migrate: {condition: service_completed_successfully}`(**保留**既有 `postgres`/`redis-stack` 兩條 `service_healthy`;long-syntax condition map)(對齊 [research R1/R5](./research.md))

**Checkpoint**:base compose 有 migrate 骨架 + 閘門;但需 override 補 image/command 才可跑

---

## Phase 3: User Story 1 — dev 啟動即自動套 + 冪等 (Priority: P1) 🎯 MVP

**Goal**:dev stack `up` 在 server 起來前自動套好 migration(`cargo run --bin migration up`),冪等可重複。

**Independent Test**:`down -v` 後 `up -d --wait` exit 0、不跑任何手動 migration、`seaql_migrations` 含 001/002/003、`sys_user`+seed+009 schema 就緒、`/health` ok;再 `up` 一次仍 exit 0(冪等 no-op)。

- [ ] T004 [US1] 在 `rev2-root/docker-compose.dev.yml` 新增 `migrate` override:`build: {target: dev}`;`image: rev2-admin-rust-api:dev`;`volumes: [./rust-api:/app, rust_api_cargo_cache:/usr/local/cargo, rust_api_target:/app/target]`;`entrypoint: ["cargo","run","--bin","migration"]`(覆寫 dev cargo-watch ENTRYPOINT);`command: ["up"]`(對齊 [research R2](./research.md);DATABASE_URL 繼承 base migrate 的 `APP_DATABASE_URL_FILE`+`database_url` secret)
- [ ] T005 [US1] Acceptance:[verification-commands §1](./contracts/verification-commands.md) —— `down -v` → `up -d --wait`。**權威斷言用可觀察 end-state**(非僅看 `--wait` 回傳碼):`ps -a migrate` = Exited(0) **且** `rust-api` running + `/health`=ok(`up --wait` exit 0 為輔助確認;若該 compose 版本對一次性 service 的 `--wait` 回傳碼語意有差異,以 end-state 為準並於驗收紀錄註明 — research R5 fallback);`seaql_migrations` 含 `m20260529_000001/000002/000003`;`\d sys_user` 見 `deleted_at` + `sys_user_user_name_active_uniq` partial index;active seed ≥3;**冪等** re-`up` 後 migrate 無新套用、`rust-api` 仍 running(對應 spec US1 + SC-001/SC-002)

**Checkpoint**:US1 達成(dev 啟動即自動套 + 冪等)= MVP

---

## Phase 4: User Story 2 — prod 啟動即自動套（對齊）(Priority: P2)

**Goal**:prod stack `up` 同樣在 server 起來前自動套好 migration(經 entrypoint dispatcher `migration up`),行為與 dev 一致。

**Independent Test**:prod(先 seed cert)`up -d --wait` exit 0、migrate Exited(0)、`seaql_migrations` 001/002/003、API internal `/health` ok。

> 與 US1 程式碼獨立(不同 override 檔 `.prod.yml`);依 Foundational(共用 base migrate 骨架+閘門)。

- [ ] T006 [US2] 在 `rev2-root/docker-compose.prod.yml` 新增 `migrate` override:`build: {target: runtime}`;`image: rev2-admin-rust-api:latest`;`command: ["migration","up"]`(經 runtime entrypoint dispatcher 派發 → `migration up`;**不**覆寫 entrypoint)(對齊 [research R3](./research.md))
- [ ] T007 [US2] Acceptance:[verification-commands §3](./contracts/verification-commands.md) —— 先 seed cert into `rev2-admin_front_nginx_certs`(§8.2.1)→ prod `up -d --wait` exit 0;`ps -a migrate` = Exited(0);`seaql_migrations` 含 001/002/003(與 dev 一致 — SC-004);`exec rust-api curl /health`=ok(對應 spec US2 + SC-004)

**Checkpoint**:US1+US2 各自 functional(dev/prod 啟動即自動套、行為對齊)

---

## Phase 5: User Story 3 — migration 失敗時擋下 API（fail-fast）(Priority: P3)

**Goal**:驗證 `service_completed_successfully` 閘門(Foundational 已建)在 migrate 失敗時擋下 server、`up --wait` 回非 0。

**Independent Test**:刻意令 migrate 失敗 → `up --wait` exit≠0、migrate Exited(非0)、rust-api 未啟動;還原後正常 `up` 回綠。

> 依 US1(用 dev override 的 migrate 注入失敗最直接)+ Foundational(閘門)。**無新實作** —— fail-fast 由 Foundational 閘門天然提供,本 phase 為 acceptance 驗證。

- [ ] T008 [US3] Acceptance:[verification-commands §2](./contracts/verification-commands.md) —— 令 migrate 失敗。**注入方式優先用「不改 tracked 檔」途徑**:臨時 env override(如 `APP_DATABASE_URL` 指向不可達 host)或臨時 compose override 把 migrate `command` 設成必失敗的 migration 子指令;**不要編輯已 commit 的 `deploy/secrets/database_url.txt`**(避免污染 tracked 檔 / 需還原)。**權威斷言用可觀察 end-state**:`ps -a migrate` = Exited(非0) **且** `rust-api` 未啟動(Created/未 running)(`up --wait` exit≠0 為輔助確認);驗畢移除 override + `down -v` + 正常 `up` 確認回綠(對應 spec US3 + SC-003 正反向)

**Checkpoint**:三 user story 全 functional(dev 自動套 / prod 對齊 / fail-fast)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + scope 邊界 + outer-only 驗證。

- [ ] T009 Constitution Compliance 自我覆查 + 邊界驗證:
    * (a)`git -C base-web status --short` 空(§I.1 未碰 base-web)
    * (b)**outer-only**:`git -C rust-api status --short` 空(本 feature 不碰 rust-api worktree);本 feature diff 範圍 = 僅 `docker-compose.yml`/`.dev.yml`/`.prod.yml`(+ spec docs)
    * (c)`grep -c "✅ Pass" specs/010-migration-auto-apply/plan.md` ≥ 14(Constitution 7+7)
    * (d)**FR-009 regression**:`grep -rni "Migrator\|cli::run_cli\|run_migration" rust-api/server/src/` 無命中(server 仍不自動 migrate);[verification-commands §4](./contracts/verification-commands.md)
    * (e)scope 邊界:只 `up`、無 auto-rollback;standalone `docker-compose.rust-api.yml` 未動(follow-up);不改 schema/seed/`/health`;不改 `Dockerfile.rust-api.txt`/`entrypoint.rust-api.sh`/migration code
    * (f)`migrate` service `restart: "no"`(一次性、不重啟迴圈);`rust-api` depends_on 保留 postgres/redis-stack healthy + 新增 migrate completed

**Checkpoint**:feature 完整、可進 `superpowers:executing-plans`(★ outer-only、無兩段式 commit)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**:無依賴
- **Foundational(Phase 2)**:依 Setup;**阻斷所有 user story**(base migrate 骨架 + 閘門)
- **US1(Phase 3,P1)**:依 Foundational;MVP;dev override + dev acceptance
- **US2(Phase 4,P2)**:依 Foundational(共用 base 骨架);與 US1 程式碼獨立(`.prod.yml` vs `.dev.yml`);需 prod stack(+ seed cert)
- **US3(Phase 5,P3)**:依 US1(用 dev override 注入失敗)+ Foundational(閘門);無新實作、純 acceptance
- **Polish(Phase 6)**:依所有 user story

### Within Phases

- Phase 2:T002(migrate 骨架)→ T003(rust-api 閘門)— 同檔 `docker-compose.yml`、順序改
- Phase 3:T004(dev override)→ T005 acceptance(dev stack)
- Phase 4:T006(prod override)→ T007 acceptance(prod stack)
- Phase 5:T008 acceptance(注入失敗 + 還原)

### Parallel Opportunities

- US1 的 T004(`docker-compose.dev.yml`)與 US2 的 T006(`docker-compose.prod.yml`)**不同檔、無依賴** → Foundational 完成後 override 撰寫可並行;但各自 acceptance 需 stack up(序列化、資源互斥),且 executing-plans 採順序 subagent unit,實務多走順序。
- US3 依 US1(dev override)。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T003)→ US1(T004-T005)
2. **STOP and VALIDATE**:dev `up --wait` 自動套好 migration、`/health` ok、冪等
3. 達 MVP:dev 啟動即自動套

### Incremental Delivery

1. Setup → Foundational → US1(MVP:dev 自動套 + 冪等)
2. + US2(prod 對齊)
3. + US3(fail-fast acceptance)
4. Polish(Constitution self-check + outer-only + FR-009 regression)
5. `superpowers:finishing-a-development-branch` → **單段** commit(outer-only,3 compose 檔 + spec docs)+ merge --no-ff 回 `rev2-admin-root` + 更新 CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy(executing-plans 階段)

- Foundational(T002-T003):base compose migrate 骨架 + 閘門(可併入 US1 implementer 起手)
- US1(T004-T005):一個 implementer(dev override + dev acceptance)
- US2(T006-T007):一個 implementer(prod override + prod acceptance)
- US3(T008):一個 implementer / 或併 US1(fail-fast acceptance)
- Polish(T009):查核
- **★ commit 紀律**:outer-only、**無兩段式 commit**(不碰 rust-api worktree);各 unit spec+quality 雙審

---

## Notes

- **outer-only feature**:只動 3 個外層 compose 檔,**無兩段式 commit**、不碰 rust-api worktree;這是與 007/008/009 的關鍵差異。
- **守 007 FR-009**:`migrate` 維持獨立 service/process,server 不自動 migrate(不改 server boot);T009(d) regression guard。
- **fail-fast 由閘門天然提供**:`service_completed_successfully`(Foundational T003)即 fail-fast 機制;US3 為 acceptance 驗證、無新實作。
- **`up --wait` 退出語意**([research R5](./research.md) 標記待驗):T005/T008 acceptance 須實測 migrate 成功→exit 0、失敗→exit≠0 且 rust-api 不起;若 compose 版本對一次性 service 的 `--wait` 行為有差異,以實測為準並在驗收紀錄註明(依賴鏈序列化仍正確)。
- **dev override 必須覆寫 `entrypoint`**(非只 command)—— 否則 dev cargo-watch ENTRYPOINT 會把 `up` 當 watch 參數([research R2](./research.md))。**此為 compose-level `entrypoint:` 覆寫,不修改 image 的 Dockerfile `ENTRYPOINT` 或 `entrypoint.rust-api.sh`**(FR-007「不改 Dockerfile/entrypoint」仍滿足 — 兩者不同層)。
- **scope 邊界**:只 `up`、無 rollback;standalone `docker-compose.rust-api.yml` 不在 scope(follow-up);不改 schema/seed/Dockerfile/entrypoint/migration code。
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V)。
- `superpowers:executing-plans` 階段把這 9 個 task 編成 execution unit + 派 fresh implementer subagent。
