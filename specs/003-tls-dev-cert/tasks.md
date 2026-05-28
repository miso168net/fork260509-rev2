---
description: "Task list for 003-tls-dev-cert implementation"
---

# Tasks: tls-dev-cert

**Input**: Design documents from `/specs/003-tls-dev-cert/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) 開頭紀律):
- **無單元測試**:本 feature 全 shell script + cert generation 配置 + gitignore append,無新純函式邏輯
- **Acceptance**(C-V contract):由 [verification-commands.md](./contracts/verification-commands.md) 6 段 acceptance 覆蓋(自簽 happy path + idempotency + Hybrid 外部 CA + gitignore 紀律 + trust 教學印 + Constitution self-check)
- 此紀律已在 spec + plan + verification-commands.md §0 明示

**Organization**: 6 個 phase,3 個 user story phase 各對應 spec 內 P1/P2/P3 story + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: 在 User Story phase 內必加(US1 / US2 / US3);Setup / Foundational / Polish 無 story label
- 全部 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

---

## Phase 1: Setup (Pre-flight Sanity Check)

**Purpose**:確認 outer 狀態正確、`deploy/dev-certs/` 預期狀態(空 / 不存在),才能安全動 `deploy/` 與 `.gitignore`。

- [ ] T001 Pre-flight check:外層 `git branch --show-current` 必須 = `003-tls-dev-cert`、`git status --short` 必須空(乾淨)。`base-web/` 與 `rust-api/` worktree status 必須空(本 feature 完全不動)。`deploy/dev-certs/` 預期不存在 OR 為空 OR 僅有 `.gitkeep`(本 feature 前置條件)。任一不符 → 停下並回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:全部 source 修改 + 新增 2 檔(`.gitkeep` + `generate-dev-cert.sh`)+ 1 個 `.gitignore` append。**所有 user story 都需此 phase 完成才能 verify**。

**⚠️ CRITICAL**: 無 user story 任務可在此 phase 完成前開始

### Source changes(部分可並行)

- [ ] T002 [P] Create `deploy/dev-certs/.gitkeep`:空檔(0 bytes),git track 用、保留目錄存在(對齊 [contracts/gitignore-discipline.md](./contracts/gitignore-discipline.md) §`.gitkeep` 用途)。**注意**:可直接 `mkdir -p rev2-root/deploy/dev-certs && touch rev2-root/deploy/dev-certs/.gitkeep`

- [ ] T003 [P] Append `.gitignore`(workspace root,既有檔):在檔尾加 3 行(註解 + 排除 wildcard + negation 豁免),對齊 [contracts/gitignore-discipline.md](./contracts/gitignore-discipline.md) §entries 順序紀律:
    ```
    # dev TLS cert(feature 003-tls-dev-cert,內容全 ignore、保留 .gitkeep)
    deploy/dev-certs/*
    !deploy/dev-certs/.gitkeep
    ```
    **★ 順序紀律**:wildcard `deploy/dev-certs/*` 必須在 negation `!deploy/dev-certs/.gitkeep` 之前(順序錯 negation 失效)

- [ ] T004 Create `deploy/generate-dev-cert.sh`(完整 script content,對齊 [plan.md §5 邏輯描述](./plan.md) + [docs/superpowers/003-tls-dev-cert.md §5](../../docs/superpowers/003-tls-dev-cert.md) full script + [contracts/script-cli.md](./contracts/script-cli.md) + [contracts/hybrid-ca-detection.md](./contracts/hybrid-ca-detection.md)):
    * Shebang `#!/usr/bin/env bash`
    * `set -euo pipefail`
    * `--force` flag 解析(`FORCE=0 ;[ "${1:-}" = "--force" ] && FORCE=1`)
    * `SCRIPT_DIR` 解析(`SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`)
    * `CERT_DIR="$SCRIPT_DIR/dev-certs"` + `mkdir -p`
    * Hybrid 偵測(`EXTERNAL_CA=0; if [ -f ca.pem ] && [ -f ca.key ]; then EXTERNAL_CA=1; echo "📌 ..."; fi`)
    * `fullchain.pem` 已存且無 `--force` → exit 1 + 印錯誤 + 區分自簽/外部 CA 兩種 `--force` 行為提示(FR-011)
    * `docker pull -q alpine/openssl:latest >/dev/null` + `run_openssl()` helper(`docker run --rm -v "$CERT_DIR:/certs" -w /certs "$OPENSSL_IMG" "$@"`)
    * Step 1(僅自簽路線):`genrsa -out ca.key 2048` + `req -new -x509 -key ca.key -days 3650 -out ca.pem -subj "/CN=rev2-admin-root dev CA" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"`
    * Step 2(both routes):`genrsa -out privkey.pem 2048` + `req -new -key privkey.pem -out leaf.csr -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"` + `x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 365 -out leaf-only.pem -extfile /dev/stdin <<EXT ... EXT`(heredoc 帶 subjectAltName + basicConstraints + keyUsage + extendedKeyUsage)
    * fullchain.pem 組合(外部 CA = `cat leaf-only.pem ca.pem > fullchain.pem` / 自簽 = `cp leaf-only.pem fullchain.pem`)+ CHAIN_MSG 設定
    * 清理暫存:`rm -f leaf.csr ca.srl leaf-only.pem`(FR-018)
    * 收尾 print:`✅ cert 生成完成,fullchain 結構:$CHAIN_MSG` + 4 檔列表 + 標記(自簽 root / 外部 CA、未動 / nginx 用 / SECRET)
    * 自簽路線 print:3 OS trust 教學(Windows certutil / macOS security / Linux update-ca-certificates)+ 「有效期 CA 10 年 / leaf 1 年」+「renew 跑 --force」(FR-015)
    * 外部 CA 路線 print:「★ 你用了外部 CA,本 script 假設你已 trust 該 CA 的 root」提醒 +「renew leaf 跑 --force」(FR-016)
    * **注意**:本 task 完整 script 內容直接從 [`docs/superpowers/003-tls-dev-cert.md` §5](../../docs/superpowers/003-tls-dev-cert.md) 拷貝(80 行,brainstorm 拍板版),不再變動 logic;若 brainstorm doc §5 與 [plan.md §5 邏輯描述](./plan.md) 有差異,以 plan.md 為準(SDD 設計鏈權威)

- [ ] T005 `chmod +x deploy/generate-dev-cert.sh`(讓 script 可執行,User Story 用 `bash deploy/generate-dev-cert.sh` 跑也 work、但加 x 對齊一般 shell script 習慣)

### Foundation gates(sequential — 須前面全成才能跑)

- [ ] T006 Verify script syntax:`bash -n deploy/generate-dev-cert.sh`(語法檢查,無 error 通過)+ `head -1 deploy/generate-dev-cert.sh` 為 `#!/usr/bin/env bash` + `[ -x deploy/generate-dev-cert.sh ]` 為 true

- [ ] T007 Verify .gitignore + .gitkeep 對齊:`grep -c "deploy/dev-certs/\*" .gitignore` ≥ 1 + `grep -c "!deploy/dev-certs/\.gitkeep" .gitignore` ≥ 1 + `[ -f deploy/dev-certs/.gitkeep ]` true + `git ls-files deploy/dev-certs/` 結果僅 `deploy/dev-certs/.gitkeep`(預檢 SC-005 gitignore 紀律)

- [ ] T008 Verify `docker pull alpine/openssl:latest` 拉取成功(預檢 SC-001 dep):`docker pull -q alpine/openssl:latest` 無 error,有 cache 後立即返回

**Checkpoint**: Foundation 就緒 — 所有 user story 可以開始 acceptance verify

---

## Phase 3: User Story 1 — 自簽路線基線 (Priority: P1) 🎯 MVP

**Goal**:rev2 開發者跑 `bash deploy/generate-dev-cert.sh`(無 arg)→ 自簽 root CA + 簽 leaf cert,出 4 檔到 `deploy/dev-certs/`;`openssl x509 -in fullchain.pem -noout -text` 看 SAN/Issuer 對齊,`openssl verify -CAfile ca.pem fullchain.pem` 回 OK;`--force` 能 renew、無 `--force` 第二次 exit 1。

**Independent Test**:`bash deploy/generate-dev-cert.sh` + `ls deploy/dev-certs/` 看 4 檔 + cert content grep + chain verify + 第二次 zero-arg exit 1 + `--force` 重生,5 段 verification 通過即驗。

### Implementation for User Story 1

> 本 phase 無新 implementation tasks(實作全在 Foundational T002-T008 完成);本 phase 只跑 acceptance verification。

- [ ] T009 [US1] Acceptance:自簽 happy path(對應 spec User Story 1 Acceptance 1-3 + SC-001/002/003;[verification-commands.md](./contracts/verification-commands.md) §1)
    * `rm -rf deploy/dev-certs/* && touch deploy/dev-certs/.gitkeep`(clean slate)
    * `time bash deploy/generate-dev-cert.sh` 完成 < 30s 首次 / < 10s cache(SC-001)
    * `ls -la deploy/dev-certs/` 應顯示 `.gitkeep + ca.pem + ca.key + fullchain.pem + privkey.pem` 5 個 entry
    * `docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl x509 -in fullchain.pem -noout -text | grep -E "Issuer:|Subject:|DNS:localhost|IP Address:127.0.0.1|Not After"` 含 Issuer `CN = rev2-admin-root dev CA` + Subject `CN = localhost` + `DNS:localhost, IP Address:127.0.0.1` + 1 年後到期(SC-002)
    * `docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl verify -CAfile ca.pem fullchain.pem` 回 `fullchain.pem: OK`(SC-003)

- [ ] T010 [US1] Acceptance:`--force` idempotency(對應 spec User Story 1 Acceptance 4-5 + SC-006;[verification-commands.md](./contracts/verification-commands.md) §2)
    * 承 T009 4 檔已生狀態,`bash deploy/generate-dev-cert.sh && echo "exit: $?"` 應印「❌ ... fullchain.pem 已存在」+ exit 1(SC-006)
    * `bash deploy/generate-dev-cert.sh --force && echo "exit: $?"` 應重生 4 檔 + exit 0
    * `ls -la --time=modify deploy/dev-certs/{ca.pem,ca.key,fullchain.pem,privkey.pem}` 應顯示 4 檔 mtime 都是「剛剛」

- [ ] T011 [US1] Acceptance:3 OS trust 教學印(對應 FR-015;[verification-commands.md](./contracts/verification-commands.md) §5 前段)
    * `bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "Windows 11\|macOS\|Linux (Debian/Ubuntu)"` 應 ≥ 3(3 個 OS 標記都印到)
    * `bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "certutil -addstore"` 應 ≥ 1(Windows 教學命令在)
    * `bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "security add-trusted-cert"` 應 ≥ 1(macOS 教學命令在)
    * `bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "update-ca-certificates"` 應 ≥ 1(Linux 教學命令在)

**Checkpoint**: User Story 1 fully functional;MVP 達成、可 ship 此階段(若只交 cert script + 自簽路線)

---

## Phase 4: User Story 2 — Hybrid 外部 CA 路線 (Priority: P2)

**Goal**:user 預放外部 `ca.pem` + `ca.key`(plain),script 偵測到 → 跳 Step 1、用外部 CA 簽 leaf;`fullchain.pem` 含 2 個 BEGIN CERTIFICATE block(leaf + intermediate concat);`--force` 不動 `ca.*` bytes、只覆寫 leaf 2 檔。

**Independent Test**:預放 ca.pem + ca.key → 跑 script → 印「📌 偵測到外部 CA」+ `grep -c "BEGIN CERTIFICATE" fullchain.pem` = 2 + `--force` 後 `md5sum ca.*` 不變,3 段 verification 通過即驗。

### Implementation for User Story 2

> 同 Phase 3,無新 implementation tasks(Hybrid 偵測邏輯已在 T004 script body 完成)。

- [ ] T012 [US2] Acceptance:Hybrid 外部 CA 路線完整流程(對應 spec User Story 2 Acceptance 1-4 + SC-004 + SC-007;[verification-commands.md](./contracts/verification-commands.md) §3)
    * 借用 T009/T010 自簽生的 CA 模擬外部 CA:`cp deploy/dev-certs/ca.pem /tmp/ext-ca.pem && cp deploy/dev-certs/ca.key /tmp/ext-ca.key && md5sum /tmp/ext-ca.pem /tmp/ext-ca.key`
    * clean slate + 預放外部 CA:`rm -rf deploy/dev-certs/* && touch deploy/dev-certs/.gitkeep && cp /tmp/ext-ca.pem deploy/dev-certs/ca.pem && cp /tmp/ext-ca.key deploy/dev-certs/ca.key`
    * `bash deploy/generate-dev-cert.sh` 應印「📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key)— 跳 Step 1、直接用外部 CA 簽 leaf」+ 只跑 Step 2 簽 leaf
    * `md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key` 應與 `/tmp/ext-ca.*` md5sum 一致(SC-007 ca.* bytes 不變)
    * `grep -c "BEGIN CERTIFICATE" deploy/dev-certs/fullchain.pem` 應 = 2(SC-004 leaf + intermediate concat)
    * `docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl verify -CAfile ca.pem fullchain.pem` 應回 `fullchain.pem: OK`(SC-003 外部 CA 路線亦適用)
    * `--force` 測試:`md5_before=$(md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key) && bash deploy/generate-dev-cert.sh --force && md5_after=$(md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key) && [ "$md5_before" = "$md5_after" ] && echo "PASS"`(SC-007 `--force` 外部 CA 不動 ca.*)

- [ ] T013 [US2] Acceptance:外部 CA 路線 print 內容驗(對應 FR-016;[verification-commands.md](./contracts/verification-commands.md) §5 後段)
    * 承 T012 外部 CA running 狀態:`bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "假設你已 trust 該 CA 的 root"` 應 ≥ 1
    * `bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "certutil -addstore"` 應 = 0(外部 CA 路線**不**印 Windows 教學)
    * `bash deploy/generate-dev-cert.sh --force 2>&1 | grep -c "update-ca-certificates"` 應 = 0(外部 CA 路線**不**印 Linux 教學)

**Checkpoint**: User Stories 1+2 both independently functional

---

## Phase 5: User Story 3 — gitignore 紀律驗證 (Priority: P3)

**Goal**:任何時刻 `git status --short deploy/dev-certs/` 為空、`git ls-files deploy/dev-certs/` 只 `deploy/dev-certs/.gitkeep`、`git add -A` 不 stage cert/key 檔、顯式 `git add` 私鑰被 gitignore 阻擋。

**Independent Test**:跑完任何路線 4 檔在 dir 內 → `git status` 空 + `git ls-files` 僅 .gitkeep + `git add -A` 後 `git diff --cached` 空 + `git add deploy/dev-certs/ca.key` 報 ignore hint,4 段 verification 通過即驗。

### Implementation for User Story 3

> 同前,無新 implementation tasks(gitignore 規則已在 T003 完成)。

- [ ] T014 [US3] Acceptance:gitignore 紀律完整驗證(對應 spec User Story 3 Acceptance 1-3 + SC-005;[verification-commands.md](./contracts/verification-commands.md) §4)
    * 跑完 T009-T012 任一 acceptance、dev-certs/ 4 檔在內:`git status --short deploy/dev-certs/` 應為空輸出
    * `git ls-files deploy/dev-certs/` 應只 `deploy/dev-certs/.gitkeep`
    * `git add -A && git diff --cached --stat deploy/dev-certs/` 應為空(無新 stage)+ `git restore --staged deploy/dev-certs/ 2>/dev/null` 清 stage
    * 嘗試顯式 add 私鑰:`git add deploy/dev-certs/ca.key 2>&1 | head -1` 應印 ignore hint(`The following paths are ignored by one of your .gitignore files: deploy/dev-certs/ca.key`)+ exit 1(`echo "exit: $?"` = 1)

**Checkpoint**: 三 user story 全 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + end-to-end smoke + 文件友善性。

- [ ] T015 Constitution Compliance 自我覆查([verification-commands.md](./contracts/verification-commands.md) §6):
    * (a)`git -C rust-api status --short` 為空(本 feature 不動 rust-api、I.5)
    * (b)`git -C base-web status --short` 為空(本 feature 不動 base-web、I.1 + BASE-WEB-ADAPT 軌道)
    * (c)`git diff --name-only HEAD` 結果只含 `deploy/generate-dev-cert.sh` + `deploy/dev-certs/.gitkeep` + `.gitignore`(本 feature scope FR-023);**不**含 `docker-compose.*.yml` / `deploy/Dockerfile.*.txt` / `CLAUDE.md` / `base-web` gitlink / `rust-api` gitlink
    * (d)本 plan Constitution Check 7 項對照 [plan.md](./plan.md) Constitution Check + Re-Check 段、合計 ≥ 14 個 `✅ Pass`

- [ ] T016 [P] End-to-end smoke:跑 [quickstart.md](./quickstart.md) Path A(自簽 happy path)+ Path B(`--force` renew)+ Path C(Hybrid 外部 CA + `--force` 不動 ca.*)+ Path D(gitignore 紀律驗)完整流程 + **明確 assert [CLAUDE.md §8.2.1](../../CLAUDE.md) 第一行 `bash deploy/generate-dev-cert.sh` 第一次跑 `echo "exit: $?"` = 0**(SC-008 字面對齊;Path A 開頭已涵蓋、本 task 顯式紀錄)。記錄任何 friction 進 `docs/superpowers/003-tls-dev-cert.md` §10 Open Questions(若需)。**[P] 註**:本 task 與 T015 Constitution self-check 不同檔不互鎖、可平行跑

**Checkpoint**: feature 完整、可進 `superpowers:finishing-a-development-branch` 階段(outer commit + push 003-tls-dev-cert + merge 回 `rev2-admin-root` + 更新 CHECKLIST §1 + Phase 1 entry + MILESTONES append + CLAUDE.md §6 marker 收尾)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,可立即開始
- **Foundational (Phase 2)**:依 Setup 完成;**BLOCKS 所有 user story**
- **User Story 1 (Phase 3, P1)**:依 Foundational 完成
- **User Story 2 (Phase 4, P2)**:依 Foundational 完成 + T012 借用 T009/T010 自簽 ca.* 模擬外部 CA(也可 user 自帶 myca,不嚴格依賴)
- **User Story 3 (Phase 5, P3)**:依 Foundational 完成 + T014 承 T009-T012 任一狀態(dev-certs/ 4 檔在內)
- **Polish (Phase 6)**:依所需 user story 完成

### Within Phase 2 (Foundational)

**Sequential dependencies**:
- T004(script body)→ T005(chmod +x)→ T006(syntax verify)
- T002 / T003 / T004-T006 全完成 → T007(gitignore + .gitkeep 對齊 verify)→ T008(docker pull verify)

**Parallel opportunities**:
- T002(`.gitkeep`)獨立檔 — [P] 可與 T003(`.gitignore`)、T004(`generate-dev-cert.sh`)三束並行
- T003(`.gitignore`)獨立檔 — [P] 可與 T002 / T004 並行
- T004(`generate-dev-cert.sh`)獨立檔 — 但 T005 / T006 sequential after

### Within User Story Phases

- Phase 3 (US1) T009 → T010 → T011 sequential(T010 / T011 承 T009 4 檔生成狀態)
- Phase 4 (US2) T012 → T013 sequential(T013 承 T012 外部 CA running 狀態)
- Phase 5 (US3) T014 independent(承任意 Phase 3-4 跑完的 dev-certs/ 狀態)
- Cross-phase:US1 T009 自簽生的 CA 可被 US2 T012 拷貝模擬「外部 CA」(節省 user 帶 myca 步驟)

### Parallel Opportunities Summary

- Phase 1:單一 task,無並行
- Phase 2:T002 / T003 / T004 三束並行(3 個不同檔修)— Wave 1;T005-T008 sequential gates — Wave 2
- Phase 5:T014 可在 T012 / T013 進行中跑(獨立檢查 git 狀態,不互鎖)
- Phase 6:T015 與 T016 可並行(Constitution self-check 跟 quickstart smoke 不同檔)

---

## Parallel Example: Phase 2 Foundational

```bash
# Wave 1(平行)
T002:  Create deploy/dev-certs/.gitkeep
T003:  Append .gitignore 3 行
T004:  Create deploy/generate-dev-cert.sh

# Wave 2(承 Wave 1 依賴)
T005:  chmod +x deploy/generate-dev-cert.sh(承 T004)

# Wave 3:sequential gates
T006(script syntax) → T007(gitignore + .gitkeep) → T008(docker pull)
```

---

## Parallel Example: User Story phases

```bash
# Phase 3-5 acceptance 順序:
T009 (US1 自簽 happy path)  → 第一次 cert 生成(基線狀態)
  ├─ T010 (US1 --force idempotency) 承 T009 4 檔狀態
  ├─ T011 (US1 trust 教學印) 承 T010 --force renew 後(印 stdout grep)
  ├─ T012 (US2 Hybrid 外部 CA) 承 T009/T010 自簽 ca.* 拷貝模擬
  │    └─ T013 (US2 外部 CA print 驗) 承 T012 外部 CA running 狀態
  └─ T014 (US3 gitignore 紀律) [P] 隨時可跑(任意 dev-certs/ 4 檔狀態)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup(1 task)
2. 完成 Phase 2: Foundational(7 task)— **CRITICAL,blocks all stories**
3. 完成 Phase 3: User Story 1(3 acceptance task)
4. **STOP and VALIDATE**:跑 quickstart Path A + Path B
5. 達 MVP:自簽路線可跑、4 檔生、`--force` renew、trust 教學印齊,可 ship 此階段(若只交 cert script + 自簽路線)

### Incremental Delivery

1. Phase 1 + 2 完成 → Foundation ready
2. Phase 3 (US1) → MVP demo(自簽路線 + idempotency + 教學)
3. Phase 4 (US2) → 加 Hybrid 外部 CA 路線(user 帶 myca 用免 trust 新 root)
4. Phase 5 (US3) → 加 gitignore 紀律驗(私鑰永不 leak)
5. Phase 6 (Polish) → Constitution self-check + quickstart E2E smoke
6. `superpowers:finishing-a-development-branch` → outer commit + push 003-tls-dev-cert + merge 回 `rev2-admin-root` + 更新 CHECKLIST + MILESTONES + §6 marker

### Parallel Team Strategy

本 feature 單人即可完成(實作量 ~半工作天 — 主要在 T004 script body 80 行),不需多 implementer 並行;若用 `superpowers:subagent-driven-development`:
- 一個 implementer subagent 跑完 Phase 1-2(wave 並行 T002/T003/T004 + sequential T005-T008)
- 另一 implementer 或同一 subagent 跑 Phase 3-5 acceptance(不需 implement code、只跑 verify)
- 同一 implementer 跑 Phase 6 polish(Constitution self-check + quickstart smoke)
- 不適合多 implementer 並行 — `deploy/dev-certs/` single 共享狀態,只能擇一 acceptance flow 跑;script body T004 sequential(同檔修動順序 sensitive)

---

## Notes

- 全部 file path 為 `deploy/...` 或 `.gitignore`(workspace root),從 workspace root 往下
- **單段 commit 紀律**(本 feature 純 workspace-level 改動):本 feature 不動 base-web / rust-api worktree,所以**無第二段 SHA pin commit**;outer commit 一段帶完所有 source changes(對齊 CLAUDE.md §4.1「外層專屬檔的單段 commit」紀律)
- Phase 3-5 acceptance task 失敗時:回 Phase 2 對應 T002-T008 修(non-trivial 改動可能須回 brainstorm / re-design)
- 任何偏離 [plan.md](./plan.md) 設計的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V 紀律:結論在 constitution、研究歷史在 design)
- `superpowers:executing-plans` 階段會把這 16 個 task 編成 execution unit + 派 fresh implementer subagent;tasks.md 不寫具體 implementation prompt(由 implementer subagent 從本檔 + plan.md + contracts/ + spec.md 自取)
