---
description: "Task list for 006-docker-volume-naming implementation"
---

# Tasks: docker-volume-naming

**Input**: Design documents from `/specs/006-docker-volume-naming/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0):
- **無單元測試**:本 feature 為 docker-compose 設定 + 文件命名 refactor,無新純函式邏輯
- **Acceptance**(C-V contract):由 [verification-commands.md](./contracts/verification-commands.md) 5 段覆蓋(舊名清零 / 卷遷移+stack healthy+新名 / 005 dual-write / CLAUDE.md 規則 / 既有文件對齊)
- 此紀律已在 spec + plan + verification-commands.md §0 明示

**Organization**: 6 phase;3 個 user story phase 各對應 spec P1/P2/P3 story + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可並行(不同檔、無未完依賴)
- **[Story]**: User Story phase 內必加(US1 / US2 / US3);Setup / Foundational / Polish 無 story label
- 全 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

---

## Phase 1: Setup (Pre-flight Sanity Check)

**Purpose**:確認 outer 狀態、前置(branch / stack down / 7 舊卷在 / docker 可用)就緒。

- [ ] T001 Pre-flight check:外層 `git branch --show-current` = `006-docker-volume-naming`、`git status --short` 空。docker 可用(`docker version`);dev stack 已 down(`docker ps` 無 rev2 container);7 個舊卷 `docker volume ls | grep '^rev2_' | wc -l` = 7(`rev2_postgres_data` / `rev2_redis_data` / `rev2_front_nginx_certs` / `rev2_bw_node_modules` / `rev2_bw_pnpm_store` / `rev2_rust_api_cargo_cache` / `rev2_rust_api_target`)。**複查** `docker-compose.prod.yml` 無 volume `name:` 宣告(`grep 'name: rev2' docker-compose.prod.yml` 為空 → prod override 不需改;[plan Structure](./plan.md))。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:本 feature 3 個 user story 交付物各自獨立檔(US1 = compose / US2 = CLAUDE.md / US3 = DESIGN+000+凍結spec),**無跨 story 阻斷性 foundational task**。直接進 user story phase。

> 無 foundational task。

---

## Phase 3: User Story 1 — live compose 改名 + 卷遷移 + stack 驗證 (Priority: P1) 🎯 MVP

**Goal**:4 個 compose 檔移除顯式 `name:`、3 key/mount 更名、2 standalone 加 `name: rev2-admin`;`down` + rm 7 舊卷 + `up --wait` 後 7 卷以 `rev2-admin_<service>_<purpose>` 出現、5 service healthy、005 連線不變式仍成立。

**Independent Test**:改 4 compose → rm 7 舊卷 → `up -d --wait` → `docker volume ls | grep '^rev2-admin_' | wc -l` = 7 且 `grep '^rev2_'` = 0、5 healthy,即驗。

- [ ] T002 [US1] Edit `rev2-root/docker-compose.yml`:對齊 [data-model.md Entity 3](./data-model.md) + [volume-catalog.md](./contracts/volume-catalog.md)。① `volumes:` 區塊移除全部 7 個 `name: rev2_*` 行;② 3 個 key 更名:`redis_data`→`redis_stack_data`、`bw_node_modules`→`base_web_node_modules`、`bw_pnpm_store`→`base_web_pnpm_store`(其餘 4 key 不變);③ redis-stack service mount `redis_data:/data`→`redis_stack_data:/data`。頂層 `name: rev2-admin` 已存在、不動。**不動** network / secret / service 其他定義
- [ ] T003 [US1] Edit `rev2-root/docker-compose.dev.yml`:base-web service 2 個 mount `bw_node_modules:/app/node_modules`→`base_web_node_modules:/app/node_modules`、`bw_pnpm_store:/pnpm-store`→`base_web_pnpm_store:/pnpm-store`;rust-api mount key 不變(`rust_api_cargo_cache` / `rust_api_target`)。**只改這 2 行 mount key**
- [ ] T004 [US1] Edit `rev2-root/docker-compose.base-web.yml`(DEPRECATED standalone):① 加頂層 `name: rev2-admin`(services: 之前);② `volumes:` 區塊移除 2 個 `name: rev2_bw_*` 行 + key `bw_node_modules`→`base_web_node_modules`、`bw_pnpm_store`→`base_web_pnpm_store`;③ service mount 2 行同步更名;④ L16 註解 `docker volume rm rev2_bw_node_modules` → `rev2-admin_base_web_node_modules`(對齊 [research R3](./research.md))
- [ ] T005 [US1] Edit `rev2-root/docker-compose.rust-api.yml`(DEPRECATED standalone):① 加頂層 `name: rev2-admin`;② `volumes:` 區塊移除 2 個 `name: rev2_rust_api_*` 行(key `rust_api_cargo_cache` / `rust_api_target` **不變**、mount 不變)。靠 auto-prefix 得 `rev2-admin_rust_api_*`
- [ ] T006 [US1] Acceptance:語法 + 舊名清零(對應 spec US1 + SC-002;[verification-commands.md §1](./contracts/verification-commands.md)):`docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q` OK;`grep -nE "name: rev2_|redis_data:|bw_node_modules|bw_pnpm_store" docker-compose*.yml` 為空;`grep -c "^name: rev2-admin"` master/base-web/rust-api 各 1
- [ ] T007 [US1] Acceptance:卷遷移 + stack healthy + 新名(對應 spec US1 Acceptance 1-3 + SC-001/SC-003;[verification-commands.md §2](./contracts/verification-commands.md)):`docker volume rm` 7 個舊 `rev2_*` 卷 → `up -d --wait` exit 0、5 healthy;`docker volume ls | grep -c '^rev2-admin_'` = 7、`grep -c '^rev2_'` = 0。**★ 先 rm 舊卷再 up**(R6:否則舊卷殘留孤兒)
>   **偏離澄清(user 拍板 2026-05-28)**:dev `up` 實際只物化 **6** 個卷,非 7。`front_nginx_certs` 是 prod-only(dev 的 front-nginx 用 `./deploy/dev-certs` bind mount,該卷只被 `profiles:[prod]` 的 acme 掛載),dev 不物化。其命名已用 `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod config` 驗證 = `rev2-admin_front_nginx_certs`。故 SC-001/T007 的「=7」於 dev-only `up` 下讀作「dev 6 + front_nginx_certs prod-only(名稱驗證通過)」;全 7 key auto-prefix 一致、spec 意圖(統一 `rev2-admin_` 前綴、grep 友善)達成,無需重跑。連帶:`docker-compose.prod.yml` L4 陳舊註解 `rev2_front_nginx_certs`→`rev2-admin_front_nginx_certs`(user 同意修、放寬 T017(d) prod.yml 零改動驗證)
- [ ] T008 [US1] Acceptance:005 dual-write / 連線不變式(對應 spec US1 Acceptance 4 + SC-003;[verification-commands.md §3](./contracts/verification-commands.md)):`exec -T postgres psql -U soybean -d soybean_admin_rust -c '\conninfo'` 連線成功;`exec -T redis-stack redis-cli -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping` 回 PONG(卷改名不影響 secret file-based)

**Checkpoint**: User Story 1 fully functional;MVP 達成(7 卷統一 `rev2-admin_` + grep 友善 + stack 連線通)

---

## Phase 4: User Story 2 — CLAUDE.md 命名規則文件化 (Priority: P2)

**Goal**:CLAUDE.md §8.2 表新增「docker volume name」列、新增 §8.2.2 命名規則 + 正典 7 卷清單、§8.2.1 live 指令舊卷名更新為新名。

**Independent Test**:`grep` CLAUDE.md 含「docker volume name」列 + §8.2.2 + 7 正典新名 + §8.2.1 無舊卷名,即驗。

> 與 US1 不同檔(CLAUDE.md)、可獨立進行(不需 docker)。

- [ ] T009 [US2] Edit `rev2-root/CLAUDE.md` §8.2 表:`docker compose project name` 列之下新增「docker volume name」列(rev1 = `rev1-admin_<vol>`〔auto-prefix〕/ rev2 = `rev2-admin_<service>_<purpose>`〔auto-prefix,移除顯式 name:〕/ 備註指向 §8.2.2)
- [ ] T010 [US2] Edit `rev2-root/CLAUDE.md` 新增 §8.2.2「named volume 命名規則」小節:命名規則(`rev2-admin_<service>_<purpose>`、移除顯式 name: 靠 auto-prefix、4 compose 設 `name: rev2-admin`)+ 正典 7 卷清單(對齊 [volume-catalog.md](./contracts/volume-catalog.md))
- [ ] T011 [US2] Edit `rev2-root/CLAUDE.md` §8.2.1 live 指令:舊卷名 → 新(如 seed cert 的 `rev2_front_nginx_certs` → `rev2-admin_front_nginx_certs`;`docker volume rm rev2_postgres_data` 類若有 → 新名)
- [ ] T012 [US2] Acceptance:CLAUDE.md 規則齊備(對應 spec US2 Acceptance 1-3 + SC-004;[verification-commands.md §4](./contracts/verification-commands.md)):`grep "docker volume name" CLAUDE.md` 有 1 行、`grep "8.2.2"` 存在、`grep "rev2-admin_postgres_data\|rev2-admin_base_web"` ≥ 1、`grep "rev2_front_nginx_certs\|rev2_postgres_data" CLAUDE.md` 為空(§8.2.1 無殘留)

**Checkpoint**: User Stories 1+2 both independently functional

---

## Phase 5: User Story 3 — 既有文件對齊(權威同步 + 持久記憶改寫 + 凍結 spec 註記) (Priority: P3)

**Goal**:DESIGN(權威)同步新名;000(持久記憶)全面改寫;凍結 spec(002/004/005 + 002 brainstorm + RESEARCH)不改寫內文、加 superseded cross-ref。

**Independent Test**:`grep` DESIGN/000 無舊名 + 凍結 spec 內文舊名仍在(未改寫)+ 各受影響 feature 有 cross-ref 指向 006,即驗。

> 與 US1/US2 不同檔、可獨立進行(不需 docker)。

- [ ] T013 [P] [US3] Edit `rev2-root/docs/INTEGRATION-DESIGN.md`:L891 `named volume redis_data` → `redis_stack_data`(權威同步;對齊 [research R5](./research.md))
- [ ] T014 [P] [US3] Edit `rev2-root/docs/superpowers/000-base-web-docker-bootstrap.md`:全面改寫 ~14 處 `rev2_bw_node_modules`/`rev2_bw_pnpm_store`/`bw_node_modules`/`bw_pnpm_store` → `rev2-admin_base_web_node_modules`/`rev2-admin_base_web_pnpm_store`/`base_web_node_modules`/`base_web_pnpm_store`(living memory、反映 current;對齊 [data-model.md Entity 1](./data-model.md))
- [ ] T015 [US3] 凍結 spec cross-ref(對應 spec FR-010):**不改寫內文**;於 `rev2-root/specs/004-compose-port-orchestration/data-model.md`(卷表)、`rev2-root/specs/002-dockerfile-base-web/contracts/compose-profiles.md`(volume 表)各加 1 行 superseded cross-ref 指向 006(沿用 004→005 先例;[research R4](./research.md))。005 plan.md deviation 內提及 `bw_node_modules` 為歷史敘述、不動
- [ ] T016 [US3] Acceptance:既有文件對齊(對應 spec US3 Acceptance 1-3 + SC-004/SC-005;[verification-commands.md §5](./contracts/verification-commands.md)):`grep redis_data docs/INTEGRATION-DESIGN.md` 已改;`grep -E "rev2_bw_|bw_node_modules" docs/superpowers/000-*.md` 為空;`grep -rl "rev2_bw_\|rev2_redis_data" specs/002 specs/004` 仍有(內文保留)、`grep -rl "006-docker-volume-naming" specs/004 specs/002` 有 cross-ref

**Checkpoint**: 三 user story 全 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + 凍結項未動驗證。

- [ ] T017 Constitution Compliance 自我覆查:
    * (a)`git -C base-web status --short` + `git -C rust-api status --short` 皆空(§I.1/§I.5 worktree 不動)
    * (b)`git diff --name-only <branch-base>..HEAD` 不含 `rust-api/` `base-web/` worktree 內檔、`rust-api/server/src/config.rs`、network 定義未動(FR-012:不改 network / worktree / config.rs)
    * (c)`grep -c "✅ Pass" specs/006-docker-volume-naming/plan.md` ≥ 14(Constitution Check 7 + Re-Check 7)
    * (d)確認 `docker-compose.prod.yml` 僅 **L4 陳舊註解** 1 行 diff(`rev2_front_nginx_certs`→`rev2-admin_front_nginx_certs`,user 拍板 2026-05-28),**無 volume `name:`/service/結構改動**(原「零改動」放寬;見 [plan.md Implementation Deviations](./plan.md))
    * (e)`grep -rn "rev2_net" docker-compose*.yml` 仍為舊 network key(未動 — FR-012 network out of scope)

**Checkpoint**: feature 完整、可進 `superpowers:finishing-a-development-branch` 階段(outer commit + push 006 + merge 回 `rev2-admin-root` + 更新 CHECKLIST §1 + MILESTONES append + CLAUDE.md §6 SPECKIT marker 收尾)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,立即開始
- **Foundational (Phase 2)**:無 task
- **User Story 1 (Phase 3, P1)**:依 Setup;MVP;需 docker
- **User Story 2 (Phase 4, P2)**:依 Setup;**獨立於 US1**(CLAUDE.md,不需 docker)
- **User Story 3 (Phase 5, P3)**:依 Setup;**獨立於 US1/US2**(DESIGN/000/凍結spec,不需 docker)
- **Polish (Phase 6)**:依所有 user story 完成

### User Story Dependencies

- US1(P1):獨立,可先做(MVP);唯一需 docker daemon 的 story
- US2(P2):獨立(純 CLAUDE.md 文件)
- US3(P3):獨立(純 DESIGN/000/凍結spec 文件)
- 三 story 改不同檔、彼此無依賴

### Within Phases

- Phase 3:T002/T003/T004/T005 改不同 compose 檔(可並行編輯,但 T006-T008 acceptance 須全 4 檔改完);T006 → T007 → T008(承遷移狀態)
- Phase 4:T009 → T010 → T011(同檔 CLAUDE.md,sequential)→ T012
- Phase 5:T013/T014 [P](不同檔)→ T015 → T016

### Parallel Opportunities

- **跨 story**:US1(docker)/ US2(CLAUDE.md)/ US3(DESIGN/000/specs)改完全不同檔 — 三 story 可並行推進
- Phase 5:T013(DESIGN)/ T014(000)不同檔 — [P]
- 注:executing-plans 階段若派 subagent,US2/US3 純文件可與 US1 並行;US1 內 compose 編輯 T002-T005 可並行但 acceptance 須 serialize

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup(1 task)
2. Phase 3 US1(4 compose edit + 3 acceptance)
3. **STOP and VALIDATE**:跑 quickstart Path A + B + C
4. 達 MVP:7 卷統一 `rev2-admin_` + stack 連線通

### Incremental Delivery

1. Setup → US1(MVP:compose 改名 + 卷遷移 + stack 驗證)
2. + US2(CLAUDE.md 規則文件化)
3. + US3(DESIGN/000 同步 + 凍結 spec cross-ref)
4. Polish(Constitution self-check + 凍結項驗證)
5. `superpowers:finishing-a-development-branch` → outer commit + push 006 + merge 回 `rev2-admin-root` + 更新 CHECKLIST + MILESTONES + §6 marker

### Subagent Strategy(executing-plans 階段)

- US1 compose edit(T002-T005)→ acceptance(T006-T008):一個 implementer subagent;需 docker daemon + rm 舊卷 + up --wait(共享 docker 狀態、sequential);config -q 先驗語法
- US2(T009-T011)→ acceptance(T012):同/另一 implementer(純 CLAUDE.md、獨立於 US1)
- US3(T013-T015)→ acceptance(T016):同/另一 implementer(純 DESIGN/000/凍結spec、獨立)
- Polish(T017):查核

---

## Notes

- 全 file path 為 `rev2-root/docker-compose*.yml` / `rev2-root/CLAUDE.md` / `rev2-root/docs/...` / `rev2-root/specs/...`
- **單段 commit 紀律**(純 workspace-level、不動 base-web/rust-api worktree):outer commit 一段、**無第二段 SHA pin**(對齊 CLAUDE.md §4.1)
- **移除顯式 name: 靠 auto-prefix**(R1/R2):project name `rev2-admin` 為唯一前綴源
- **2 standalone 補 `name: rev2-admin`**(R3):否則卷分裂、與 master 不共用
- **遷移先 rm 7 舊卷再 up**(R6):dev 無真資料、快取重建,零損失
- **凍結 spec 不改寫、只加 cross-ref**(R4):沿用 004→005 先例;DESIGN(權威)/ 000(living memory)則改
- **scope 邊界**(FR-012):不改 network(`rev2_net`)/ redis image-tag 偏離 / base-web / rust-api / config.rs
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V)
- `superpowers:executing-plans` 階段把這 17 個 task 編成 execution unit + 派 fresh implementer subagent
