---
description: "Task list for 005-secret-injection implementation"
---

# Tasks: secret-injection

**Input**: Design documents from `/specs/005-secret-injection/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0 紀律):
- **無單元測試**:本 feature 全 shell 腳本 + secret 範本 + docs + 1 處 compose env 改,無新純函式邏輯
- **Acceptance**(C-V contract):由 [verification-commands.md](./contracts/verification-commands.md) 7 段覆蓋(生成+數量 / dual-write / idempotent+--force / gitignore / 範本+README / jwt-refresh 過 001 loader / 004 命名連線)
- 此紀律已在 spec + plan + verification-commands.md §0 明示

**Organization**: 6 phase;3 個 user story phase 各對應 spec P1/P2/P3 story + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可並行(不同檔、無未完依賴)
- **[Story]**: User Story phase 內必加(US1 / US2 / US3);Setup / Foundational / Polish 無 story label
- 全 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

---

## Phase 1: Setup (Pre-flight Sanity Check)

**Purpose**:確認 outer 狀態、前置(004 compose + docker + 既有 secret 狀態)就緒。

- [ ] T001 Pre-flight check:外層 `git branch --show-current` = `005-secret-injection`、`git status --short` 空。確認 docker 可用(`docker version`)+ `alpine/openssl` 可 pull;`docker-compose.yml`(004)存在且 postgres service 現為 `rev2admin`/`rev2`(待改);`deploy/secrets/` 既有 jwt_secret/refresh_token_secret/postgres_password/redis_password 4 範本 + `server/src/config.rs` loader 存在(`grep -c load_secret rust-api/server/src/config.rs` ≥ 1)。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:本 feature 3 個 user story 交付物 1:1 對應、各自獨立檔,**無跨 story 阻斷性 foundational task**。openssl 由腳本內 docker pull 處理。直接進 user story phase。

> 無 foundational task。

---

## Phase 3: User Story 1 — 一鍵生成全部必須 secret (Priority: P1) 🎯 MVP

**Goal**:`bash deploy/generate-secrets.sh` 一鍵生 7 必 secret 真實 `.txt`,自動 dual-write,idempotent + `--force`,不印值、chmod 600。

**Independent Test**:`rm -f deploy/secrets/*.txt && bash deploy/generate-secrets.sh` → 7 個 `.txt` + dual-write grep 通過,即驗。

- [ ] T002 [US1] Create `rev2-root/deploy/generate-secrets.sh`:對齊 [contracts/generate-secrets-contract.md](./contracts/generate-secrets-contract.md) + [research R1-R6](./research.md)。`#!/usr/bin/env bash` + `set -euo pipefail` + `--force` 偵測 + `SCRIPT_DIR` via BASH_SOURCE + `SECRETS_DIR=$SCRIPT_DIR/secrets`。openssl 走 docker(`OPENSSL_IMG=alpine/openssl:latest`、`docker pull -q`、`gen_rand(){ docker run --rm alpine/openssl rand -base64 "$1"; }`)。① 生 4 葉子(缺 OR --force):jwt_secret/refresh_token_secret = `rand -base64 48`、postgres_password/redis_password = `rand -hex 24`(**hex 非 base64**:嵌 URL 須 URL-safe,見 [research R2 implementation 偏離](./research.md))(寫檔去尾換行)。② 組 3 URL(缺 OR --force,讀既有/剛生葉子):`database_url`=`postgres://soybean:$(cat postgres_password.txt)@postgres:5432/soybean_admin_rust`、`redis_url`=`redis://:$(cat redis_password.txt)@redis-stack:6379`、`cleanup_database_url`=同 database_url。③ `chmod 600 "$SECRETS_DIR"/*.txt`。④ 印 GENERATED/SKIPPED 摘要(**不印值**)。`chmod +x`。**★ dual-write 同次同源**(R6):URL 必用「剛生 OR 既有」的同一葉子 `.txt` 值組,不另生
- [ ] T003 [US1] Acceptance:一鍵生成 + 數量(對應 spec US1 Acceptance 1 + SC-001;[verification-commands.md §1](./contracts/verification-commands.md)):`rm -f deploy/secrets/*.txt && bash deploy/generate-secrets.sh` exit 0、`ls deploy/secrets/*.txt | wc -l` = 7、輸出不含 secret 值
- [ ] T004 [US1] Acceptance:dual-write 不變式(對應 spec US1 Acceptance 2 + SC-002;[verification-commands.md §2](./contracts/verification-commands.md)):`grep -qF $(cat postgres_password.txt) database_url.txt` + cleanup_database_url + redis_url(redis_password)三者皆通過;`cat database_url.txt` 形式 = `postgres://soybean:<pw>@postgres:5432/soybean_admin_rust`
- [ ] T005 [US1] Acceptance:idempotent + --force(對應 spec US1 Acceptance 3-4 + SC-003;[verification-commands.md §3](./contracts/verification-commands.md)):zero-arg 重跑值不變;`--force` 後值改變且 dual-write 仍成立
- [ ] T006 [US1] Acceptance:jwt/refresh 過 001 loader(對應 spec US1 + SC-007;[verification-commands.md §6](./contracts/verification-commands.md)):`wc -c` jwt_secret/refresh_token_secret ≥ 32(rand -base64 48 = 64 字元、非黑名單)

**Checkpoint**: User Story 1 fully functional;MVP 達成(一鍵生 7 必 secret + dual-write)

---

## Phase 4: User Story 2 — secret 範本與文件齊備 (Priority: P2)

**Goal**:3 新 URL 範本 + retrofit postgres/redis 範本(豐富格式)+ `README.md`(7 secret 清單 + dual-write + fallback + Phase 2 前瞻);真實 `.txt` gitignored、`.example` tracked。

**Independent Test**:`ls deploy/secrets/*.txt.example | wc -l` = 7 + 各首行註解 + README 列 7 secret + `git check-ignore` 驗,即驗。

> 與 US1 不同檔、可獨立進行(但勿並行派 implementer)。

- [ ] T007 [P] [US2] Create 3 URL 範本 `rev2-root/deploy/secrets/{database_url,redis_url,cleanup_database_url}.txt.example`:對齊 [contracts/secret-catalog.md](./contracts/secret-catalog.md) 豐富格式(`# 用途` + `# 跑 generate-secrets.sh` + `# 手動 fallback` + `# dual-write: 內嵌 password ≡ <葉子>.txt` + placeholder 值如 `postgres://soybean:CHANGE_ME@postgres:5432/soybean_admin_rust`);cleanup 範本加「最小權限 role Phase 5」註記
- [ ] T008 [P] [US2] Retrofit `rev2-root/deploy/secrets/{postgres_password,redis_password}.txt.example`:從 004 極簡一行改為豐富格式(註解 + 手動 fallback `docker run --rm alpine/openssl rand -base64 24`);**只加註解、placeholder 值語義不變**(對齊 [data-model.md Entity 3](./data-model.md))
- [ ] T009 [P] [US2] Create `rev2-root/deploy/secrets/README.md`:對齊 [data-model.md Entity 4](./data-model.md) — 7 必 secret 表(用途 + 消費者 service + 葉子/組合)+ 4 可選 obs secret(標 ⏳ Phase 5/6)+ dual-write 不變式 + `generate-secrets.sh` 用法 + 手動 fallback + `--force` 風險警示 + Phase 2 前瞻(`APP_DATABASE_URL_FILE`/`APP_REDIS_URL_FILE`)
- [ ] T010 [US2] Acceptance:範本 + README 齊備(對應 spec US2 Acceptance 1-3 + SC-005;[verification-commands.md §5](./contracts/verification-commands.md)):`ls *.txt.example | wc -l` = 7、新增 3 + retrofit 2 首行皆 `^#`、README 存在且 grep 7 secret ≥ 7
- [ ] T011 [US2] Acceptance:gitignore(對應 spec US2 Acceptance 4 + SC-004;[verification-commands.md §4](./contracts/verification-commands.md)):`git check-ignore deploy/secrets/database_url.txt`(回路徑=ignored)+ `git check-ignore ....txt.example`(exit≠0=tracked)

**Checkpoint**: User Stories 1+2 both independently functional

---

## Phase 5: User Story 3 — 004 DB 命名對齊 + stack 連線通 (Priority: P3)

**Goal**:`docker-compose.yml` postgres 改 `soybean`/`soybean_admin_rust`;`down -v` 重 init 後 dev stack healthy + `psql -U soybean` 連線通。

**Independent Test**:改命名 + `down -v` + `up --wait` 5 healthy + `psql -U soybean -d soybean_admin_rust` 連線成功,即驗。

> 依賴 US1(stack 起動需 generate-secrets.sh 生的 postgres_password/redis_password)。

- [ ] T012 [US3] Edit `rev2-root/docker-compose.yml` postgres service:`POSTGRES_USER: rev2admin` → `soybean`、`POSTGRES_DB: rev2` → `soybean_admin_rust`、healthcheck `pg_isready -U rev2admin` → `pg_isready -U soybean`(對齊 [research R4](./research.md) + [data-model.md Entity 6](./data-model.md))。**只改這 3 處**,不動其他 service / volume / secret 定義
- [ ] T013 [US3] Acceptance:命名對齊 + 連線(對應 spec US3 Acceptance 1-4 + SC-006;[verification-commands.md §7](./contracts/verification-commands.md)):`grep POSTGRES_USER/DB/pg_isready` 顯 soybean;前置 US1 已生 secret → `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v` + `up -d --wait` exit 0、5 healthy;`exec -T postgres psql -U soybean -d soybean_admin_rust -c '\conninfo'` 連線成功。**★ 必 `down -v`**(R9:postgres 非空 data dir 跳 init)

**Checkpoint**: 三 user story 全 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + 凍結項未動驗證。

- [ ] T014 Constitution Compliance 自我覆查:
    * (a)`git -C base-web status --short` + `git -C rust-api status --short` 皆空(§I.1/§I.5 worktree 不動)
    * (b)`git diff --name-only HEAD -- rust-api/server/src/config.rs deploy/Dockerfile.rust-api.txt deploy/Dockerfile.base-web.txt .gitignore deploy/secrets/jwt_secret.txt.example deploy/secrets/refresh_token_secret.txt.example` 為空(FR-018:config.rs / Dockerfile / gitignore / jwt-refresh 範本值未動)
    * (c)`grep -c "✅ Pass" specs/005-secret-injection/plan.md` ≥ 14(Constitution Check 7 + Re-Check 7)
    * (d)確認 3 URL secret **未**進 compose(`grep -E "database_url|redis_url|cleanup_database_url" docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml` 為空 — FR-016 scope 邊界)

**Checkpoint**: feature 完整、可進 `superpowers:finishing-a-development-branch` 階段(outer commit + push 005-secret-injection + merge 回 `rev2-admin-root` + 更新 CHECKLIST §1 + Phase 1 entry + MILESTONES append + CLAUDE.md §6 SPECKIT marker 收尾)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,立即開始
- **Foundational (Phase 2)**:無 task
- **User Story 1 (Phase 3, P1)**:依 Setup;MVP
- **User Story 2 (Phase 4, P2)**:依 Setup;**獨立於 US1**(不同檔)
- **User Story 3 (Phase 5, P3)**:依 Setup + **US1**(T013 stack 起動需 US1 生的 secret)
- **Polish (Phase 6)**:依所需 user story 完成

### User Story Dependencies

- US1(P1):獨立,可先做(MVP)
- US2(P2):獨立於 US1/US3(純檔案 + docs)
- US3(P3):依 US1(secret 須先生成,stack 才起得來)

### Within Phases

- Phase 3:T002 → T003 → T004 → T005 → T006(create 先、acceptance 後;T003-T006 承 T002 + 生成狀態)
- Phase 4:T007/T008/T009 可並行([P],不同檔)→ T010 → T011
- Phase 5:T012 → T013(T013 承 T012 + US1 secret)

### Parallel Opportunities

- Phase 4:T007(3 URL 範本)/ T008(retrofit 2)/ T009(README)不同檔 — [P] 可並行
- 跨 story:US1 與 US2 可並行推進(不同檔);US3 需 US1 完成

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup(1 task)
2. Phase 3 US1(create 腳本 + 4 acceptance)
3. **STOP and VALIDATE**:跑 quickstart Path A + B
4. 達 MVP:一鍵生 7 必 secret + dual-write 正確

### Incremental Delivery

1. Setup → US1(MVP:一鍵生成 + dual-write)
2. + US2(範本 + README 齊備)
3. + US3(004 命名對齊 + stack 連線)
4. Polish(Constitution self-check + 凍結項驗證)
5. `superpowers:finishing-a-development-branch` → outer commit + push 005 + merge 回 `rev2-admin-root` + 更新 CHECKLIST + MILESTONES + §6 marker

### Subagent Strategy(executing-plans 階段)

- US1 create(T002)→ acceptance(T003-T006):一個 implementer subagent;dual-write 邏輯需仔細(R6 同次同源)
- US2 create(T007-T009)→ acceptance(T010-T011):同/另一 implementer(獨立於 US1)
- US3 edit(T012)→ acceptance(T013):需 docker daemon + US1 secret + `down -v`(共享 docker 狀態、sequential)
- Polish(T014):查核

---

## Notes

- 全 file path 為 `rev2-root/deploy/...` 或 `rev2-root/docker-compose.yml`
- **單段 commit 紀律**(純 workspace-level、不動 base-web/rust-api worktree):outer commit 一段、**無第二段 SHA pin**(對齊 CLAUDE.md §4.1)
- **.gitignore 不需改**:L68-69 `*.txt` ignore + `!*.txt.example` 已涵蓋 3 新 URL secret(R7)
- **openssl docker 化**(R3):`docker run --rm alpine/openssl rand`,host 無需裝 openssl;沿用 003
- **dual-write 同次同源**(R6):URL 必用同一葉子 `.txt` 值組,acceptance §2 grep 驗
- **US3 必 `down -v`**(R9):改 postgres user/db 後不清卷 → postgres 不重 init、`psql -U soybean` 認證失敗
- **scope 邊界**(FR-016/017/018):3 URL secret 不接 compose(Phase 2)、不生 obs 選4(Phase 5/6)、不動 config.rs / base-web / rust-api / Dockerfile / gitignore / jwt-refresh 範本值
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V)
- `superpowers:executing-plans` 階段把這 14 個 task 編成 execution unit + 派 fresh implementer subagent
