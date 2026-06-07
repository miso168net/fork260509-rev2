# CLAUDE.md — workspace 指引

> 此檔覆寫並補充全域 Claude Code 設定。專案特定規則優先；通用規則沿用全域。
> 本工作區是 `fork260509-rev1` 的 **rev2 重建**：相同設計骨幹、不同命名（短名 base-web/rust-api、長名 rev2-）。
> 帶有 ⏳ 符號的說明，是檔案或內容尚未落地；user 問及此檔狀態時請列出 ⏳ 項目提醒。

---

## 1. 工作區用途

這是**跨 fork 的整合研究與設計工作區**，也是傘狀整合 repo（`rev2-admin-root`）的根。最終結構由三個 git 物件組成：

| 命名 | 是什麼 | 對應目錄 | remote / 來源 | 在外層 git |
|---|---|---|---|---|
| `rev2-admin-root` | 傘狀 monorepo（**就是當前 workspace**） | `.` | `miso168net/fork260509-rev2.git` | 自身 |
| `rev2-admin-base-web` | `fork260509-soybean-admin-base` 上的新分支（從 `example` 衍生） | `base-web/`（worktree） | push 回 `miso168net/fork260509-soybean-admin-base` 的 `rev2-admin-base-web` 分支 | submodule（記 SHA pin） |
| `rev2-admin-rust-api` | `fork260509-rev2-anew-rust-api` 上的新分支（從 `main` 衍生） | `rust-api/`（worktree） | push 回 `miso168net/fork260509-rev2-anew-rust-api` 的 `rev2-admin-rust-api` 分支 | submodule（記 SHA pin） |

**短名 vs 長名 — 命名用法分工**：實務上有兩組稱呼，依場景挑：

| 用 | 場景 | 例 |
|---|---|---|
| **短名** `base-web` / `rust-api` | 檔案、目錄、source code、worktree dir 等**檔案層面** | `cd base-web`、`改 base-web/.env`、`rust-api/server/...` |
| **長名** `rev2-admin-base-web` / `rev2-admin-rust-api` | git branch、docker compose service、image tag、runtime 行為等**服務層面** | `git push origin rev2-admin-base-web`、`docker compose up rev2-admin-rust-api`、「rev2-admin-rust-api 回 code:200」 |

兩者指同一元件、僅描述視角不同。混用一般無妨，但寫文件時依此分工最清楚。

`base-web/` 與 `rust-api/` 是**worktree + submodule 雙重身分**：
- **本機**：透過 `git worktree add -b <branch>` 建立，`.git` 是 file 指向源倉的 `worktrees/`，`cd base-web && git commit/push` 直接寫回 fork repo 的對應分支。
- **外層 `rev2-admin-root`**：把它們當 submodule 處理（gitlink + `.gitmodules`），每次外層 commit 可能含當下使用的 fork SHA pin 變動，也可能含其他追蹤檔（`CLAUDE.md` / `.specify/` / `specs/` / `docs/` 等）的正常 diff。**`base-web` 與 `rust-api` 這兩列 gitlink 只看到 SHA 字串前後不同**（不展開檔案 diff）；其他追蹤檔仍是一般 git diff。
- **別人 clone 外層**：`git clone --recurse-submodules` 會拉 fork repo 到 base-web/ rust-api/（變正常 clone 而非 worktree，但內容相同）。

**outer branch 模式**：default branch 為 `rev2-admin-root`；spec-kit 流程啟動時（完整 feature 工作流見 §3），`before_specify` mandatory pre-hook（`speckit.git.feature`，見 `.specify/extensions/git/scripts/bash/create-new-feature.sh`）會從當前 default 衍生短期 `<NNN>-<feature-name>` feature branch（命名與 `specs/<NNN>-<feature-name>/` 目錄對齊），spec docs（`spec.md` / `plan.md` / `tasks.md` / `checklists/`）+ 該 feature 對應的 submodule SHA pin 變動都落在這個 feature branch 上；feature 完成後 merge 回 `rev2-admin-root`。workspace-wide 設定 / 文件變動（`CLAUDE.md` / `.gitignore` / `.specify/` 結構等）可直接落 default branch。worktree（`base-web/` / `rust-api/`）維持各自長期分支不變、**不**為 feature 另開新分支。

兩段式 commit 是日常工作流，詳見 §4 操作手冊。

## 2. 目錄結構

> 以下為**目標結構**；rev2 尚未落地的條目以 ⏳ 標示，每落地一個就拔該標記。

```
fork260509-rev2/                            ← workspace root（傘狀 repo rev2-admin-root 的工作目錄）
├── CLAUDE.md                              ← 本檔（workspace 指引）
├── .gitattributes                         ← LF 強制（避免 Windows host autocrlf 把 .sh/.yaml/.conf 改 CRLF）
├── .gitignore                             ← 排除 fork 源倉與 graphify cache（不排除 base-web/rust-api，它們是 submodule）
├── .gitmodules                            ← base-web / rust-api 的 submodule 設定（指 fork remote）
├── .graphifyignore                        ← graphify 掃描排除（worktrees / lock files / meta 文件 CLAUDE.md README.md / 等）
├── .claude/                               ← Claude Code 設定（hook + settings.json，credentials gitignored）
│   ├── settings.json                      ← SessionStart hook 註冊
│   ├── hook-git-submodule-SOP.sh          ← 每次 session 開頭執行的 SOP 檢查
│   └── skills/                            ← 本地 skill 集合
├── .specify/                              ← spec-kit 安裝結構（templates / scripts / memory / extensions / integrations / workflows）
├── docs/                                  ← 整合設計 / 進度 / brainstorm 文件（完整職責分工見 §7）
│   ├── INTEGRATION-RESEARCH.md            ← 早期研究（rev1 設計鏈萃取，大致完結 §7.1）
│   ├── INTEGRATION-RESEARCH-FOLLOWUP.md   ← RESEARCH 深入深研（大致完結 §7.1）
│   ├── MOCK-COVERAGE-AUDIT.md             ← base-web mock api 查驗（wire ground truth §7.1）
│   ├── INTEGRATION-DESIGN.md              ← ★ 設計權威 / 核心事實（rev2 架構與執行順序 §7.2）
│   ├── INTEGRATION-CHECKLIST.md           ← 動態 todo（SOP 注入、不無限膨脹 §7.3）
│   ├── INTEGRATION-MILESTONES.md          ← commit 里程碑永久紀錄（append-only，不在 SOP 注入 §7.4）
│   ├── GRAPHIFY-NOTES.md                   ← graphify 圖譜現況統計 + 已知抽取限制（推論前必讀，§8.3）
│   ├── REVIEW-<NNN>-<NNN>.md               ← Claude workflow review 彙整報告
│   └── superpowers/                       ← 持久記憶 + brainstorm 決策（§7.4）
│       └── <NNN>-<feature-name>.md        ← 每個 feature 的 Phase 0 brainstorm
├── specs/                                 ← spec-kit feature 規格目錄（每 feature 一個 <NNN>-<feature-name>/；工作流見 §3）
├── graphify-out/                          ← 知識圖譜輸出（外層 git 追蹤 GRAPH_REPORT.md + graph.json + graph.html + obsidian/ 內 notes；只排除個人化/可重產項目）
│   ├── GRAPH_REPORT.md                    ← 含 god nodes / surprises / suggested questions
│   ├── graph.json                         ← 結構化圖譜資料（可被 graphify query 查）
│   ├── graph.html                         ← 互動視覺化（3MB+ 內嵌 JS，刻意 git-tracked）
│   ├── obsidian/                          ← Obsidian vault（5000+ markdown notes + graph.canvas，刻意 git-tracked）
│   │   └── .obsidian/          (gitignored, Obsidian app 本機 config，個人化)
│   ├── manifest.json           (gitignored, --update 增量基準，個人化)
│   ├── cost.json               (gitignored, token 用量帳單，個人化)
│   └── cache/                  (gitignored, LLM 擷取快取，可重產)
├── fork260509-soybean-admin-base/         ← Vue 3 starter，base-web worktree 源倉（gitignored，本機必留）
├── fork260509-soybean-admin-docs/         ← 文件站（gitignored，整合不用、僅參考；定期 §4.6 upstream rebase 取官方最新到 main）
├── fork260509-rev2-anew-rust-api/         ← Rust axum + Casbin backend，rust-api worktree 源倉（gitignored，本機必留）
├── base-web/                              ← worktree + submodule（外層記 gitlink SHA）
├── rust-api/                              ← worktree + submodule（外層記 gitlink SHA）
├── docker-compose.yml                     ← outer root compose（service：front-nginx/base-web/rust-api/postgres/redis-stack + migrate〔010 自動套〕/acme〔prod profile〕）；override = docker-compose.{dev,prod}.yml；另有 docker-compose.{base-web,rust-api}.yml standalone（見 §8.2）
└── deploy/                                ← 部署支援檔（nginx conf / secrets / dev-certs / cleanup 等；見 §8.2）
```

**關鍵事實**：
- `base-web/` `rust-api/` 是 worktree + submodule 雙重身分（見 §1 與 §4 操作手冊）— 外層 commit 只記 SHA pin、不記檔案 diff；別人 clone 用 `--recurse-submodules`。
- `fork260509-*` 源倉 gitignored，但**本機必須留著**（worktree 源倉）；別台機器若用 submodule clone 重來則不需要這些源倉。rev2 目前有 3 個源倉（`fork260509-soybean-admin-base`、`fork260509-soybean-admin-docs`、`fork260509-rev2-anew-rust-api`），不含 nestjs。
- Vue 源倉 GitHub repo 名稱 = `fork260509-soybean-admin-base`（從原 `fork260509-soybean-admin` rename 而來，舊 URL 仍 redirect）。
- 知識圖譜輸出 `GRAPH_REPORT.md` / `graph.json` / `graph.html` 都只存在 `graphify-out/`；要看就直接開 `graphify-out/GRAPH_REPORT.md`，或瀏覽器開 `graphify-out/graph.html` 看互動圖。
- 外層 git 追蹤：`CLAUDE.md`、`.gitignore`、`.gitmodules`、`.gitattributes`、`.graphifyignore`、`.specify/`（spec-kit 結構）、`.claude/{settings.json, hook-git-submodule-SOP.sh, skills/}`，以及 `base-web` `rust-api` 兩個 gitlink SHA、`docker-compose*.yml`、`docs/`、`specs/`、`deploy/`、`graphify-out/{graph.json, GRAPH_REPORT.md, graph.html, obsidian/}`。

## 3. feature 開發工作流（SDD 設計鏈 → TDD 實作）

> 每個 feature 走「**TDD + SDD 混合工作流**」：階段 0 brainstorm 定調後（產出 spec-design，見下方階段 0），
> 交棒給 **SDD（Spec-Driven Development＝github spec-kit）** 設計鏈產出 spec.md / plan.md / tasks.md（plan 步還會附 research.md / data-model.md / contracts/ 等），
> 交棒給 **TDD（Test-Driven Development＝superpowers）** 讀 tasks 實作，review 時對照 spec.md 驗收。
> **★ 核心紀律：實作一律用 `superpowers:executing-plans` 起手，從不使用 `/speckit-implement`。**
> **★ 核心紀律：任何 `git push` 與 `git merge` 都不得出現於 `superpowers:finishing-a-development-branch` 階段之前 — 不在實作中執行，也不得排進 tasks.md。**

**階段 0 · 前置 brainstorm**（不屬 SDD/TDD 任一階段）
`superpowers:brainstorming` 探索需求與設計、產出初步規格「spec-design」，存 `docs/superpowers/<NNN>-<feature-name>.md`。
階段 1 的 `/speckit-specify`，一定要手動執行，不要排進 `brainstorm` 流程裡觸發（**會導致 `speckit.git.feature` 沒被執行**）。

**階段 1 · SDD 設計鏈（github spec-kit）**

| 步驟 /指令 | 緊接 | 產出 |
|---|---|---|
| `/speckit-specify`（input＝階段 0 brainstorm 文件） | commit | `specs/<NNN>-<feature-name>/spec.md`；`before_specify` pre-hook 同步建 `<NNN>-<feature-name>` feature branch |
| `/speckit-clarify` | commit | spec.md 補 `## Clarifications` 段（optional） |
| `/speckit-plan` | commit | `plan.md` + `research.md`／`data-model.md`／`contracts/`／`quickstart.md`；含 Constitution Check（對照 `.specify/memory/constitution.md`）|
| `/speckit-tasks` | commit | `tasks.md`（dependency-ordered task 清單）|
| `/speckit-analyze` | commit | spec／plan／tasks 跨檔 consistency 報告（不產檔）|

**Phase 0 research 紀律**（`research.md` 必含以下 grep 結果、不信 brainstorm 階段的命名/抽象假設）：

- **rust facade/entity 真實返回型 grep**：`grep -rnE "pub (async )?fn|Result<" rust-api/server/src/model/facade/sys_*.rs`（再對照 `rust-api/entity/src/sys_*.rs` 的 SeaORM `Model` 欄位）—— rev2 **無 rev1 那種 `service` trait 層**，entity 存取唯一管道是 **facade**（009 build-time lint 強制、不 re-export `Entity`）。不同 entity 的 facade fn 可能返 raw `Model`、也可能返過濾/sanitized 形（如 `find_active_*` 濾 soft-deleted、redact password），spec 設計 wire DTO 前須對齊 facade 實際返回型。
- **wire 鏈條 3 端對齊 grep**：對每條 wire endpoint，**同時** grep（a）rust handler 真實 return type / DTO field 型，（b）base-web `service/api/*.ts` 內 inline type 與 `typings/api/*.d.ts` 宣告型，（c）frontend component 對該 wire 的內部 state 型。3 端不對齊 = runtime bug 或 type lie。
- **struct/function 命名對照 grep**：`data-model.md` 內每個 `file:line` 引用務必 grep 真實命名；spec 階段的 brainstorm 推測命名常與 actual code 不一致，implementer 須 act on actual code 而非盲信 spec naming。
- **CDP smoke defer 風險自覺**：若 `contracts/verification-commands.md` 內 CDP browser smoke 計劃 defer、要在 spec 內明示「curl 直送 ≠ base-web modal 對齊」風險、並在 follow-up backlog 登記補測。

**Phase 1 verification-commands.md 紀律**（`/speckit-plan` 產 `contracts/verification-commands.md` 時必守）：

- **新增 workspace crate ⇒ acceptance 必含 prod image build**：凡 feature 新增 rust workspace member（新 crate；僅加模組到既有 crate 不受影響），`contracts/verification-commands.md` **必含一條 prod target image build**（`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`，或 `--target builder/runtime`），**不得只靠 dev docker bind-mount 驗**。理由：dev bind-mount 整個 `rust-api/` 會遮住 prod multi-stage Dockerfile 逐 crate `COPY` 缺口，破口逃過 feature acceptance、拖到下游 deploy 才爆（009/010/012 三度被咬，見 [REVIEW-006-013 §4.1](docs/REVIEW-006-013.md)）。

**═══ 交棒物件：`specs/<NNN>-<feature-name>/tasks.md` ═══**

**階段 2 · TDD 實作（superpowers）**

實作一律用 **`superpowers:executing-plans`**（**不是 `/speckit-implement`**）：

- `executing-plans` 讀 `specs/<NNN>-<feature-name>/tasks.md`；偵測 subagent 可用 → 轉 `superpowers:subagent-driven-development`，把 task 編成執行單元。
- **每單元派 fresh implementer subagent** 實作；完成後**兩階段 review**：① **spec compliance**（對照 `specs/<NNN>-<feature-name>/spec.md` 逐項驗、抓缺漏／overbuild）→ ② **code quality**。有 issue → 同一 subagent 修 → 再 review，通過才換下一單元；全單元完成後跑整體 final review。
- 每個 implementer subagent 走 **TDD**：有可獨立測的純函式邏輯 → test-first（red → green）；wiring／形狀對映類 feature 無新純函式測試時 → 由 acceptance 覆蓋（`specs/<NNN>-<feature-name>/contracts/` 的 C-V contract：CDP browser smoke + curl + psql），且須在 `tasks.md`／`plan.md` **明示「無單元測試」及理由**。
- 收尾：`superpowers:finishing-a-development-branch` → 多段式 commit（§4.1）→ `git merge --no-ff` 回 `rev2-admin-root`，**但不清理 `<NNN>-<feature-name>` branch** 保留 spec-kit feature branch 供日後 audit / 追溯。

**branch 紀律**：`/speckit-specify` 起 pre-hook 自動建 `<NNN>-<feature-name>` feature branch、outer 即切於此；spec docs + submodule SHA pin 落此 branch，feature 完成 `merge --no-ff` 回 `rev2-admin-root`（workspace 層級檔如 CLAUDE.md 才直接落 default）。

## 4. Git / submodule 操作手冊

> `base-web` / `rust-api` 的 worktree+submodule 雙重身分操作權威來源 —— 日常兩段式 commit（§4.1）、session 健檢（§4.3）、一次性 / 偶發操作（§4.4–4.7）。使用者審核下令、Claude 執行。

### 4.1 兩段式 commit（submodule 模式的核心紀律）

改 `base-web/` 或 `rust-api/` 內檔案後，**永遠是兩段 commit**：

```bash
# === 第一段：在 worktree 內 commit + push 到 fork ===
cd base-web
git status                                    # 確認在 rev2-admin-base-web 分支
git add <files> && git commit -m "..."
git push origin rev2-admin-base-web           # 推到 miso168net/fork260509-soybean-admin-base（push 前須 user 同意）

# === 第二段：回外層更新 SHA pin ===
cd ..
git branch --show-current                     # 確認當前 outer branch（spec-kit feature 開發中應為 <NNN>-<feature-name>；workspace-level 改動才在 rev2-admin-root）
git status                                    # 應該看到 "modified content" 在 base-web
git add base-web                              # 只 add 目錄即可（記 SHA，不記檔案）
git commit -m "bump base-web to <短 SHA>: <一行描述>"
git push origin "$(git branch --show-current)"   # outer branch（feature branch 或 rev2-admin-root 取決於上面那行；push 前須 user 同意）
```

> **outer branch 預期**：§3 feature 工作流自 `/speckit-specify`（階段 1）起、到 `superpowers:executing-plans` 實作（階段 2）止全程，outer 都應該在對應 `<NNN>-<feature-name>` feature branch 上（由 `before_specify` pre-hook 在 specify 步自動建）。第二段 commit 自然落在這個 feature branch；feature 完成後 merge 回 `rev2-admin-root`。如果跑 spec-kit 流程前發現 outer 不在 `<NNN>-<feature-name>` 上、又即將改 spec / code 相關檔，先讓 pre-hook 跑（或手動 `git switch -c <NNN>-<feature-name>`）對齊。

第二段的 outer commit 訊息**建議帶 SHA 與 fork 提交標題**，以後在外層 log 看得懂：

```
bump base-web to abc1234: <fork 提交主旨一行>
bump rust-api to def5678: <fork 提交主旨一行>
```

> **外層專屬檔的單段 commit**：`CLAUDE.md` / `docs/` / `.specify/` 等非 worktree 追蹤檔的改動，直接在 `rev2-admin-root` 改、commit、push —— 單段、無第二段 SHA pin。

### 4.2 Commit message 規範

**格式**：[Conventional Commits](https://www.conventionalcommits.org/)、**訊息一律中文**。

```
<type>(<scope>): <subject>          ← subject 用中文

<body 可選，中文>

<footer 可選，中文，例如 BREAKING CHANGE / Closes #N>
```

**常用 type**：

| type | 用途 | 範例 |
|---|---|---|
| `feat` | 新功能 | `feat(rust-api): 加入 <endpoint>` |
| `fix` | 修 bug | `fix(base-web): 修正 <模組> 的 <症狀>` |
| `docs` | 純文件改動 | `docs: CLAUDE.md §X 補上 <主題>` |
| `chore` | 雜項（設定、submodule pin、依賴） | `chore: 註冊 base-web/rust-api 為 submodule` |
| `refactor` | 重構（不改功能、不修 bug） | `refactor(rust-api): 抽出 <helper>` |
| `style` | 格式調整（不影響邏輯） | `style: 統一 .env 排版` |
| `perf` | 效能優化 | `perf(rust-api): <fn> 加 lazy init` |
| `test` | 增加測試 | `test(rust-api): <feature> 單元測試` |
| `build` | 建置系統 / 外部依賴 | `build(base-web): 升 vite <舊版> → <新版>` |
| `ci` | CI 設定 | `ci: 加入 <pipeline> workflow` |
| `revert` | 還原 commit | `revert: 撤回 chore: 註冊 submodule` |

**scope 建議**（本專案）：`base-web` / `rust-api` / `deploy` / `docs` / `graphify` / `submodule` 等；可省略。

**兩段式 commit 的 message 慣例**（搭配 §4.1）：

第一段（worktree 內，正常 conventional commit）：
```
feat(rust-api): 加入 <endpoint 或功能>

<body：簡述實作方式、檔案範圍、行數量級>
```

第二段（外層更新 SHA pin，用 `chore(submodule)`）：
```
chore(submodule): bump rust-api 到 abc1234 — <fork 提交主旨>
```

> outer commit 訊息**務必帶上短 SHA 與 fork 提交主旨**，這樣外層 log 一眼看出每次 pin 移動對應哪個改動。

### 4.3 session 開場健檢

> SessionStart hook 已落地（`.claude/settings.json` 註冊 + `hook-git-submodule-SOP.sh` 腳本）；worktree（`base-web` / `rust-api`）已 add，所有檢查現已可完整觸發。

每次 session 開頭由 `.claude/hook-git-submodule-SOP.sh`（SessionStart hook）自動執行並回報：

```bash
git status                            # 外層狀態
git submodule status                  # submodule SHA 對齊（行首 空格=clean / +=超前 / -=未 init）
ls -la base-web/.git rust-api/.git    # 確認仍是 worktree（.git 為檔案而非目錄）
git log --oneline -5                  # 最近 5 個外層 commit、看 pin 變動
```

hook 另會 cat `docs/INTEGRATION-CHECKLIST.md` 全檔注入 session context（見 §6）。

`git submodule status` 行首判讀與處置：
- **空格** — outer pin == worktree HEAD，乾淨。
- **`+`** — worktree HEAD 已超前 outer pin。**主動提示** user：「base-web/ 或 rust-api/ worktree 已超前 outer pin，要不要 `git add <dir> && git commit` 更新 pin？」
- **`-`** — 兩種情況，**先判斷 `base-web/.git` 與 `rust-api/.git` 是檔案還是目錄**：
  - **檔案（本機 worktree 模式）** → `-` 是**正常且永遠出現**，因 `.git/modules/<name>/` 不存在、submodule 內容由 worktree 提供。**不要**跑 `git submodule update --init --recursive`，會跟 worktree 的 `.git` gitlink 衝突。
  - **不存在 / 目錄為空（新 clone 機器）** → submodule 尚未 init，跑 `git submodule update --init --recursive`。

若 worktree 的 `.git` 不存在（被誤刪或在新機器）→ 提示走 §4.4 重建。

### 4.4 一次性初始化（worktree + 手寫 .gitmodules）

> **rev2 歷史記錄補充**：
> - base-web 側：fork 源倉 `fork260509-soybean-admin-base` 當時在 `example` 分支；worktree add 用 `-b rev2-admin-base-web` 從 origin/example 建新分支（source repo 仍留在 example）。
> - rust-api 側：`rev2-admin-rust-api` 分支早已建好並 push 到 remote；worktree add 不用 `-b`，跑 `git worktree add ../rust-api rev2-admin-rust-api`、Step 2 的 push 也跳過。
>
> **rev2 已完成此步驟(fee9f29 + d810aee);** 下列為 **新機器重建 / 災後恢復** 的腳本範本。

```bash
# Step 1：建立 worktree（從 fork 源倉開新分支）
cd fork260509-soybean-admin-base
git fetch origin
git worktree add -b rev2-admin-base-web ../base-web origin/example
cd ..

cd fork260509-rev2-anew-rust-api
git fetch origin
git worktree add ../rust-api rev2-admin-rust-api          # 分支已建好，無 -b
cd ..

# Step 2：把 worktree 分支推到 fork remote（submodule 必須有 url 可指）
cd base-web && git push -u origin rev2-admin-base-web && cd ..
# rust-api 已 push 過、跳過此步驟

# Step 3：手寫 .gitmodules（不能用 git submodule add，會與 worktree 衝突）
cat > .gitmodules << 'EOF'
[submodule "base-web"]
    path = base-web
    url = https://github.com/miso168net/fork260509-soybean-admin-base.git
    branch = rev2-admin-base-web
[submodule "rust-api"]
    path = rust-api
    url = https://github.com/miso168net/fork260509-rev2-anew-rust-api.git
    branch = rev2-admin-rust-api
EOF

# Step 4：把 submodule 註冊進 outer git config（讓 git submodule status 認得）
git config -f .gitmodules submodule.base-web.path base-web
git config -f .gitmodules submodule.rust-api.path rust-api
git submodule init

# Step 5：outer 第一次 add 兩個 gitlink + .gitmodules
#   小心：git 會跳 "warning: adding embedded git repository"，正常
git add .gitmodules base-web rust-api
git commit -m "init: register base-web/rust-api as submodules"
```

### 4.5 別台機器 clone 流程

```bash
git clone --recurse-submodules https://github.com/miso168net/fork260509-rev2.git rev2-admin-root
cd rev2-admin-root
git submodule update --init --recursive
# 此時 base-web/ rust-api/ 是「正常 clone」（不是 worktree），但內容相同
# 若要恢復 worktree 模式（需要源倉），手動 init fork 源倉再 worktree
```

### 4.6 升級 fork branch（拉 upstream rebase 後）

> ⚠️ **前置設定**：`fork260509-soybean-admin-*` 源倉（base + docs）需設定 upstream remote 指向 soybeanjs 官方（跑一次；rust-api 不適用、理由見本節末註）：
> ```bash
> cd fork260509-soybean-admin-base
> git remote add upstream https://github.com/soybeanjs/soybean-admin.git
> git remote set-url --push upstream no_push    # 保護：避免誤推到 upstream
> cd ../fork260509-soybean-admin-docs
> git remote add upstream https://github.com/soybeanjs/soybean-admin-docs.git
> git remote set-url --push upstream no_push    # 保護：避免誤推到 upstream
> cd ..
> ```
> （fetch 前用 `git remote -v` 確認：push 應顯示 `no_push`、fetch 應顯示 soybeanjs URL。）

```bash
# === base-web（worktree + submodule；rebase 後要同步 outer pin）===
cd base-web
git fetch upstream                    # upstream 是原 soybeanjs 的 repo
git rebase upstream/example           # 對 rev2-admin-base-web，base 是 example
git push --force-with-lease           # 推自己的 fork（會改寫 history，push 前須 user 同意）
cd ..
git add base-web                      # 同步 outer pin（base-web 是 submodule）
git commit -m "bump base-web: rebase on upstream <短 SHA>"

# === docs（純參考源倉、非 submodule；rebase 後無 outer pin 同步）===
cd fork260509-soybean-admin-docs
git fetch upstream
git rebase upstream/main              # 取 soybeanjs 官方 docs 最新到 main
git push --force-with-lease           # 推自己的 docs fork（push 前須 user 同意）
cd ..

```

> **僅 rust-api 不適用本節**：`rust-api`（`fork260509-rev2-anew-rust-api`）為 anew／自建後端、**無 soybeanjs upstream**，不做 upstream rebase。base-web（rebase `upstream/example`）與 docs（rebase `upstream/main`）兩個 `fork260509-soybean-admin-*` 源倉皆 fork 自 soybeanjs、適用本節;差別:base-web 是 submodule、rebase 後要同步 outer pin,docs 純參考源倉、無 pin 同步。

### 4.7 故障處理速查

| 症狀 | 原因 | 處理 |
|---|---|---|
| `git status` 在外層顯示 `modified: base-web (modified content)` | worktree 內有未 commit 的變動 | 進 worktree commit，再回外層更新 pin |
| `git status` 顯示 `modified: base-web (new commits)` | worktree HEAD 超前 outer pin | 回外層 `git add base-web && git commit` 更新 pin |
| `git submodule update` 想覆蓋本機改動 | outer pin SHA 與本機 worktree HEAD 不同 | **不要 submodule update**！會 reset worktree。應走「更新 pin」方向 |
| 別人 clone 後 base-web/ 是空的 | 沒跑 `--recurse-submodules` | 補跑 `git submodule update --init --recursive` |
| `warning: adding embedded git repository` | 正常警告，git 提醒這是 gitlink 行為 | 忽略，可用 `git config advice.addEmbeddedRepo false` 永久關掉 |

## 5. 不要做的事

- ❌ 不要在外層 `rev2-admin-root` repo `git add fork260509-*/`（源倉 gitignored，會變 embedded git）。`base-web/` `rust-api/` **可以** add（它們是 submodule，唯一正確方式就是 `git add base-web` 記 SHA pin）。
- ❌ 不要 `git submodule add ../<...> base-web`：這會嘗試 clone 進 base-web/、與既有 worktree 衝突。submodule 設定要**手寫 .gitmodules**（見 §4.4）。
- ❌ 不要在 worktree 裡跑 `git push` 不指定 remote/branch — `cd base-web` 預設推到 fork260509-soybean-admin-base，可能誤推到非預期分支；用 `git push origin rev2-admin-base-web` 顯式指定。
- ❌ 不要忘記第二段 commit：worktree 內改完 push 完，**一定要回外層 `git add base-web && git commit`** 更新 pin，否則外層下次 commit 才會包進去（容易混淆 SHA 對應關係）。
- ❌ 不要直接編輯 `fork260509-*` 源倉的檔案：base 與 rust 兩個應透過 `base-web/` / `rust-api/` worktree 改；docs 源倉僅作參考、不在整合範圍。rev2 不含 nestjs 源倉。
- ❌ 不要跳過 spec-kit `.specify/extensions.yml` 內 `optional: false` 的 mandatory pre-hook（如 `before_specify` → `speckit.git.feature` 為 feature 開短期 outer branch）。即使當前 outer branch 是 `rev2-admin-root`（傘狀 monorepo default），spec-kit feature branch 模式**仍是預期工作流**（見 §1 outer branch 模式）。pre-hook 只在 local 建分支、**不** push，符合「push 前須 user 同意」紀律（§4.1）。

## 6. 進度追蹤

整合進度的單一真相在 [`docs/INTEGRATION-CHECKLIST.md`](docs/INTEGRATION-CHECKLIST.md) —— Current Focus（現狀）/ Follow-up Backlog（衍生工作）/ 已完成里程碑 / Roadmap & Phase 狀態 / 跨 feature 待驗證項。由 session SOP hook（`.claude/hook-git-submodule-SOP.sh`）每次 session 開頭 cat 全檔注入（見 §4.3）。

> 下面 `<!-- SPECKIT START / END -->` marker 區為當前 feature 的 active spec/plan 快照，Claude 在 feature 啟動/收尾時手動維護（**只用簡潔描述、不擴張內容**；marker 名稱保留供 spec-kit 將來自動同步、**勿刪**）。

<!-- SPECKIT START -->
**Active Spec**: [`specs/032-obs-full/spec.md`](specs/032-obs-full/spec.md)
**Active Plan**: [`specs/032-obs-full/plan.md`](specs/032-obs-full/plan.md)
**Phase**: **032 obs-full(Phase 6 obs、metrics)✅ 完成+merged `a13f85f`**(--no-ff、保留 032 branch、已推 origin)。接續 031 obs-min log 半邊、補 metrics 半邊 + **閉 Phase 3 #5 parked 的 enforce metrics 債**。opt-in `profiles:[metrics]` 堆疊 = **prometheus**(`v3.12.0` static-scrape、retention 15d)← rust-api `/metrics`(`axum-prometheus 0.7.0` HTTP metrics + `enforce_mw` 自埋 `casbin_enforce_total{decision}` allow/deny counter)+ **postgres_exporter**(`v0.19.1`)+ **redis_exporter**(`v1.85.0-alpine`)+ **pushgateway**(`v1.11.3`、cleanup-job best-effort push)→ **grafana**(reuse `13.0.2`、prometheus datasource + 3 baseline alert rule)。**FR-011 nginx `/api/metrics` 擋塊**(in-feature 補)。**動 2 既有 crate、無新 workspace crate、無 migration/新表、無新 secret、base-web 零改、Constitution 8/8 PASS、無 amendment**。acceptance C1-C10 + SC-005 firing + 守恆全綠;subagent-driven 5 單元雙審 + final holistic = merged。詳見 [DESIGN §10 Phase 6 #2](docs/INTEGRATION-DESIGN.md) + [`specs/032-obs-full/`](specs/032-obs-full/) + brainstorm [`docs/superpowers/032-obs-full.md`](docs/superpowers/032-obs-full.md)。
**下一步**: 無 active spec-kit feature。後續候選(user 擇期啟動):dashboard provisioning / #6 受管 RBAC〔需 §11.6 fork amendment〕/ obs prod 對外暴露 + 採集端硬化〔security pass〕/ least-priv exporter·cleanup PG role。
<!-- SPECKIT END -->

## 7. 整合設計文件職責分工

rev2 整合的核心 docs 階層,內容由「研究歷史」→「設計權威」→「動態 todo」流動;**`INTEGRATION-DESIGN.md` 是核心事實**(2026-05-27 user 確認)。

### 7.1 研究歷史(大致已完結、不再擴張)

- **`docs/INTEGRATION-RESEARCH.md`** — 最早期設計研究,以 rev1 為來源、重構 rev2 方向
- **`docs/INTEGRATION-RESEARCH-FOLLOWUP.md`** — `INTEGRATION-RESEARCH.md` 深入深研要追的事項
- **`docs/MOCK-COVERAGE-AUDIT.md`** — 本地把 base-web 用 docker-compose 跑起來後,查驗 fork example 分支用到的 mock api(rev2 wire ground truth)

### 7.2 設計權威 ★ — `docs/INTEGRATION-DESIGN.md`

**此檔為核心事實**。參考 §7.1 三份檔重新設計 rev2 的架構與執行順序、Phase / feature 編排、§11 拍板項、§7 軌道定義、wire 不變式。

**回填紀律**:**所有完成的設計決策、拍板結果、軌道定義、wire 不變式、設計理由都要回填到此檔對應段落**;內容增厚、不刪減。

### 7.3 動態 todo — `docs/INTEGRATION-CHECKLIST.md`

由 `INTEGRATION-DESIGN.md` 與其它文件未完成事項、或 feature 實作階段發現新問題列到此檔。`.claude/hook-git-submodule-SOP.sh` SessionStart hook **每次 session 開頭 cat 全檔注入**(見 §4.3、§6),作為 Claude 跨 session 進度延續錨。

**引用紀律**:其他文件(DESIGN / MILESTONES / constitution / spec / superpowers 等)**不得跨檔深連結本檔的揮發章節**(`見 CHECKLIST §2.X`、指向某 follow-up)—— 本檔內容會滾動清理/歸檔、§ 錨會 rot;需 cross-ref 時改指 DESIGN(權威)/ MILESTONES(永久)/ spec。例外(結構性、非 rot):§6 與 SOP hook 把本檔當「當前進度活檔」整檔指向、本檔內部 §X↔§Y 互引。

**清理紀律**:
- **檔案不能無限膨脹**,要簡寫摘要或定期清理
- 只記:Current Focus / 待處理 todo / 已完成里程碑摘要 / Roadmap 狀態 / 跨 feature 待驗證項
- **不寫詳細設計理由 / 拍板理由 / 軌道定義**(那是 §7.2 DESIGN 的職責);如需引用、用 markdown link 指向 DESIGN 對應 anchor

### 7.4 其他相關文件

- **`.specify/memory/constitution.md`** — v1.0.0 將從 DESIGN §11 拍板 + §7 軌道清單提取凍結為**不可違反的權威**(更高層、需 amendment 流程才能改)
- **`docs/INTEGRATION-MILESTONES.md`** — 永久紀錄(append-only、不在 SOP 注入、避免 CHECKLIST 膨脹);**§1 commit 里程碑表 + §2「✅ 完成+歸檔」(從 CHECKLIST §2 搬來的已完成 follow-up 細節)**;歸檔流程見 §7.5
- **`docs/superpowers/000-base-web-docker-bootstrap.md`** — 持久記憶 base-web docker bootstrap; **操作 CDP 的參考文件**(§5 CDP 9229 登入驗證 gotchas + Appendix A 可直接跑的 CDP node scripts)
- **`docs/superpowers/<NNN>-<feature-name>.md`** — 每個 spec-kit feature 的 Phase 0 brainstorm 決策(見 §3 階段 0、DESIGN §11.12 拍板)

### 7.5 內容流向 + commit 歸檔流程

```
新發現 todo / 問題                         處理完、設計決策固化
   ↓ 列入                                       ↓ 回填
CHECKLIST(動態,SOP 注入)  ────────────→  DESIGN(權威,核心事實 ★)
                                                ↓ v1.0.0 提取凍結
                                                ↓
                                          constitution(凍結權威)

feature 啟動  →  docs/superpowers/<NNN>-<feature-name>.md(brainstorm)
              →  specs/<NNN>-<feature-name>/spec.md(spec-kit)
              →  實作完成 → 回填 DESIGN + CHECKLIST 勾掉
```

**commit 完成歸檔流程**(任何 docs / feature commit 落地後,Claude 自動執行):

1. **永久紀錄** — `docs/INTEGRATION-MILESTONES.md` 表尾 append 一行(commit hash + 日期 + 主題)
2. **動態追蹤** — CHECKLIST §1「最新進展」加一條;若超過 **2 條**、刪最舊那條(滾動)
3. **Phase 歸檔**(若該 commit 完成整個 Phase)— CHECKLIST §4 對應 Phase 改「✅ 全完成+已歸檔 (YYYY-MM-DD)」+ 拔細節 list;deliverable 詳細已在 DESIGN §10、不重複
4. **§2 follow-up 歸檔** — CHECKLIST §2 follow-up 完成後標「✅ 全完成+已歸檔 (YYYY-MM-DD)」+ 清 body;累積數節後**批次搬到 MILESTONES §2「✅ 完成+歸檔」**、CHECKLIST §2 原處留 1 行收合指標(`> ### §X ~ §Y 全完成+已歸檔(手動搬至 MILESTONES)`)。仍 open 的 follow-up 與仍 active 的索引(如 §2.1 鐵紀律)續留 CHECKLIST

**紀律**:**CHECKLIST 永遠不膨脹** — 歷史 commit 在 MILESTONES.md / `git log`;設計詳細在 DESIGN;當前狀態在 CHECKLIST。

## 8. 操作參考與工具

> 此節為 reference data（不是 principle、不是 checklist），放在 CLAUDE.md 是為了讓我每次 session 都直接看到、不用 Read 額外檔案 — 特別是 CDP 自動化登入時要立刻有密碼可用。

### 8.1 預設帳號（dev 用）

由 `rust-api/migration/src/m20260529_000002_seed_sys_user.rs` seed（建表在 `m20260529_000001_create_sys_user.rs`；feature 007 落地）：

| id | 帳號（`user_name`） | 對應角色（`sys_role.code`） | 密碼 |
|---|---|---|---|
| 1 | `Super` | 超級管理員（`R_SUPER`） | `123456` |
| 2 | `Admin` | admin（`R_ADMIN`） | 同上 |
| 3 | `User` | 一般（`R_USER_COMMON`） | 同上 |

- **rev2 權威名 = `Super`/`Admin`/`User`**（對齊 base-web mock ground truth + DESIGN §11.1 拍板）。早期此節引用的 rev1 `Soybean`/`Administrator`/`GeneralUser`（及 `migration/src/datas/m20241024_*` 路徑）**在 rev2 不存在、已淘汰,勿再用**。
- 3 個 user 共用同一個 **runtime 生成**的 argon2id 雜湊（random salt：每次重跑 migration 雜湊字串不同,但都驗得過 plaintext `123456`）— 非寫死固定 hash。
- `sys_user` 欄位現為 `id` / `user_name` / `password` / `nick_name`（013 加）/ `deleted_at`（009 soft-delete）。**「對應角色」已是實際 DB 資料**（非設計意圖）：`sys_role` / `sys_user_role` 已建表並 seed（013 migration 006/007，`1→R_SUPER`、`2→R_ADMIN`、`3→R_USER_COMMON`，role_id 以 `code` subquery 解析）；getUserInfo 即時 join 組裝 roles + `User → User01` alias（013 落地）。完整 7-entity schema 仍待 soft-delete(#2)。

### 8.2 容器 endpoint 與 port 配置

> rev2 port 配置（刻意用 2XXXX 前綴避開 fork260509-rev1 既有 port，方便兩個 workspace 並存）。**核心 5 service（front-nginx / base-web / rust-api / postgres / redis-stack）已落地，dev stack 實機運行通過**（Phase 1 #4/#5；005 T013 五 service healthy、`psql -U soybean` 連線通）。observability：obs-min（log-only）3 service（loki / alloy / grafana）已進 compose（`profiles:[obs]` opt-in、一般 `up` 不啟；031 落地、dev/prod 實機驗過）；metrics = obs-full（prometheus + postgres_exporter + redis_exporter + pushgateway + grafana datasource/alert）亦已進 compose（`profiles:[metrics]` opt-in、一般 `up` 不啟；032 落地、dev/prod 實機驗過）。

| 角色 | fork260509-rev1（舊有） | fork260509-rev2 | 備註 |
|---|---|---|---|
| front-nginx | HTTP `11080:80` / HTTPS `11443:443` | HTTP `21080:80` / HTTPS `21443:443` | prod 環境時 host 直用 `:80` / `:443` |
| base-web | internal `:80` | host 映射 `21079:21079` | dev 期間 host 直連用(避免 internal `:80` 在單 compose 啟動時撞 port);prod 由 `front-nginx` reverse proxy 至 internal `:21079` |
| rust-api | host 映射 `11081:11081` | host 映射 `21081:21081` | 僅 dev 期間 host 直連用 |
| postgres | host 映射 `15432:5432` | host 映射 `25432:5432` | 容器內仍 `:5432`（不改） |
| redis-stack | host 映射 `16379:6379` | host 映射 `26379:6379` | 容器內仍 `:6379`（不改） |
| grafana | host 映射 `13000:3000` | host 映射 `23000:3000` | obs UI（profiles:`["obs","metrics"]` opt-in〔log+metrics 共用 UI〕、loki〔031〕+ prometheus〔032〕datasource provisioning + baseline alert rule、prod internal-only） |
| loki | — | host 映射 `23100:3100` | 031 obs-min log 儲存/LogQL（profiles:[obs]、72h retention、prod internal-only） |
| alloy | — | 無 host port（內網 :12345） | 031 obs-min log 採集（docker-SD、取代 EOL promtail、讀 docker.sock） |
| prometheus | host 映射 `13090:9090` | host 映射 `23090:9090` | metrics scrape + 儲存（032 obs-full、profiles:[metrics]、retention 15d、prod internal-only） |
| pushgateway | host 映射 `19091:9091` | host 映射 `29091:9091` | short-lived job metrics push（032 obs-full、profiles:[metrics]、cleanup-job 推、prod internal-only） |
| postgres_exporter | — | 無 host port（內網 :9187） | 032 obs-full metrics（profiles:[metrics]、被 prometheus scrape、reuse postgres_password〔DATA_SOURCE_PASS_FILE〕） |
| redis_exporter | — | 無 host port（內網 :9121） | 032 obs-full metrics（profiles:[metrics]、被 prometheus scrape、reuse redis_password〔sh-wrapper〕） |
| docker compose project name | `rev1-admin` | `rev2-admin` | 透過 `COMPOSE_PROJECT_NAME` 環境變數設定 |
| docker volume name | `rev1-admin_<vol>`（auto-prefix） | `rev2-admin_<service>_<purpose>`（auto-prefix,移除顯式 name:） | 命名規則 + 正典卷清單（7 always-on + 3 obs-min + 1 metrics）見 §8.2.2 |

**啟動模式**（3 種；TLS 結構規劃如下）：
- **dev**（`-f -f dev.yml`）：127.0.0.1 loopback、HTTP `:21080` + HTTPS `:21443`（自簽 cert）+ 直連 backend port `:21081 :25432 :26379`（範例見 §8.2.1）；observability 為 profile-gated（`--profile obs` log / `--profile metrics` metrics、一般 up 不啟），啟用後 dev obs host port = grafana `:23000`（log+metrics 共用）+ loki `:23100`（obs）+ prometheus `:23090` + pushgateway `:29091`（metrics；exporter 無 host port）
- **prod baseline**（`-f -f prod.yml`、不帶 `--profile prod`）：0.0.0.0 對外、80 強制 redirect 443、acme.sh 不啟（需先 seed cert into named volume `front_nginx_certs`,實際卷名 `rev2-admin_front_nginx_certs`）
- **prod + acme**（`-f -f prod.yml --profile prod`）：同 prod baseline + acme.sh skeleton（實際 cert acquisition 留待後續、需真實 domain + DNS provider）

#### 8.2.1 dev / prod 啟動命令範例

```bash
# === 第一次：生成 dev 自簽 cert（只需跑一次、每年 renew）===
bash deploy/generate-dev-cert.sh

# === dev 啟動（映射 8 個 host port、限 127.0.0.1、HTTP + HTTPS）===
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# === host 機驗證（WSL2 mirrored networking 下從 Windows host 亦可）===
curl -fsS http://127.0.0.1:21080/health                              # HTTP front-nginx self
curl -kfsS https://127.0.0.1:21443/health                            # HTTPS front-nginx self
curl -fsS http://127.0.0.1:21081/health                              # rust-api 直連
pg_isready -h 127.0.0.1 -p 25432                                     # postgres
redis-cli -h 127.0.0.1 -p 26379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping  # redis

# TLS handshake + cert SAN 驗
openssl s_client -connect 127.0.0.1:21443 -servername localhost </dev/null 2>&1 | grep "subject="
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName

# === prod baseline 啟動（0.0.0.0 對外、80 redirect 443、無 acme）===
# 先 seed cert 進 named volume（acme 自動 issue 流程後續再做）：
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker run --rm -v rev2-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"

# 啟 prod baseline：
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait

# === prod + acme（完整 stack + acme skeleton sanity 用）===
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose exec acme acme.sh --version    # sanity check
```

> WSL2 NAT mode 不可用 `127.0.0.1` — 設 `.wslconfig` `[wsl2] networkingMode=mirrored`（Win11 22H2+ 預設）、或用 `wsl hostname -I` 拿 WSL IP。
> 實際 acme.sh cert acquisition / renew 流程留待後續（需公網 + 真實 domain + DNS provider creds）。

#### 8.2.2 named volume 命名規則

**命名規則**：
- compose key 格式：`<service>_<purpose>`（不含 project prefix、**不加**顯式 `name:`）
- 實際卷名：`rev2-admin_<service>_<purpose>`（由 compose top-level `name: rev2-admin` 自動補前綴）
- 設頂層 `name: rev2-admin` 的是 master `docker-compose.yml` 與 2 個 standalone（`docker-compose.base-web.yml` / `docker-compose.rust-api.yml`）；`docker-compose.dev.yml` / `docker-compose.prod.yml` override **不**自設、`-f` 疊加時繼承 master 的 project name，故全 stack 共用同一 prefix。
- `<service>` 對應 §1 短名（`-` 改 `_`）：`front_nginx` / `base_web` / `rust_api` / `postgres` / `redis_stack`
- `<purpose>` ∈ `data` / `certs` / `node_modules` / `pnpm_store` / `cargo_cache` / `target`
- feature 006 移除所有顯式 `name:` 欄位，project prefix 成為唯一前綴來源；US1 同時重命名 3 個 key：`redis_data` → `redis_stack_data`、`bw_node_modules` → `base_web_node_modules`、`bw_pnpm_store` → `base_web_pnpm_store`。

**正典卷清單（7 always-on + 3 obs-min opt-in）**：

| compose key | 實際卷名 | 消費 service / mount | 類型 |
|---|---|---|---|
| `postgres_data` | `rev2-admin_postgres_data` | postgres `/var/lib/postgresql/data` | data |
| `redis_stack_data` | `rev2-admin_redis_stack_data` | redis-stack `/data` | data |
| `front_nginx_certs` | `rev2-admin_front_nginx_certs` | front-nginx prod `/etc/nginx/certs`（+ acme `/acme.sh`） | certs |
| `base_web_node_modules` | `rev2-admin_base_web_node_modules` | base-web dev `/app/node_modules` | build 快取 |
| `base_web_pnpm_store` | `rev2-admin_base_web_pnpm_store` | base-web dev `/pnpm-store` | build 快取 |
| `rust_api_cargo_cache` | `rev2-admin_rust_api_cargo_cache` | rust-api dev `/usr/local/cargo` | build 快取 |
| `rust_api_target` | `rev2-admin_rust_api_target` | rust-api dev `/app/target` | build 快取 |

**obs-min 卷（031、`profiles:[obs]` opt-in、一般 up 不建）**：

| compose key | 實際卷名 | 消費 service / mount | 類型 |
|---|---|---|---|
| `loki_data` | `rev2-admin_loki_data` | loki `/loki` | data |
| `grafana_data` | `rev2-admin_grafana_data` | grafana `/var/lib/grafana` | data |
| `alloy_data` | `rev2-admin_alloy_data` | alloy `/var/lib/alloy/data` | data |

**metrics 卷（032、`profiles:[metrics]` opt-in、一般 up 不建）**：

| compose key | 實際卷名 | 消費 service / mount | 類型 |
|---|---|---|---|
| `prometheus_data` | `rev2-admin_prometheus_data` | prometheus `/prometheus`（retention 15d TSDB） | data |

> exporter（postgres_exporter / redis_exporter）與 pushgateway **無持久卷**（pushgateway in-memory、restart 失憶；exporter 即時抓取無狀態）；exporter reuse 既有 `postgres_password` / `redis_password` secret、**無新 secret**。

> feature 006（US1）已移除所有顯式 `name:` 欄位，project prefix `rev2-admin_` 為唯一前綴來源，新增卷只需依上述規則命名 compose key 即自動對齊。obs-min 3 卷同樣無顯式 `name:`，僅在 `--profile obs` 啟用時才建立；metrics 卷 `prometheus_data` 同樣無顯式 `name:`，僅在 `--profile metrics` 啟用時才建立。

### 8.3 知識圖譜（graphify）

**使用方式**：
- 查問題：在 workspace root 執行 `graphify query "你的問題"` — 走 BFS 預設、`--dfs` 改 DFS、`--budget N` 限 token
- 解釋節點：`graphify explain "節點名"`
- 找路徑：`graphify path "節點A" "節點B"`
- 增量更新：`graphify update`（會用 `manifest.json` 比對變更）

> 📖 **圖譜現況統計** 與 **已知抽取限制** 等細節 — **推論前必讀** [`docs/GRAPHIFY-NOTES.md`](docs/GRAPHIFY-NOTES.md)。

**graphify 守則**：
- 重跑前先讀 `graphify-out/cost.json` 看是否真有需要 —— 多數時候 `graphify update`（增量）即可。
- 不要改 `graphify-out/cache/` —— graphify 內部 LLM 擷取快取，手改破壞下次 update 的 diff。
- 新功能設計問題先用 `graphify query "..."` 試 —— 但 NestJS / Vue component 部分警覺圖譜盲點（見 `docs/GRAPHIFY-NOTES.md`），且 base-web 來源是 example 分支、與圖譜抓取點不一致。
