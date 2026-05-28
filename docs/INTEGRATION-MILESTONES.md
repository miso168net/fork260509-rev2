# INTEGRATION-MILESTONES.md — rev2 整合 commit 里程碑歷史

> rev2 整合的 commit milestone 永久 append-only 紀錄。**不在 SOP hook 注入範圍**(避免 CHECKLIST 膨脹)。
> CHECKLIST §3 不再記;CHECKLIST §1「最新進展」滾動最近 5 條、本檔保留完整歷史。
>
> **編輯紀律**:append-only、按 commit 時間順序(舊 → 新)、不刪除已記項目。
> **更新時機**:任何 docs / feature commit 落地後立即追加(見 CLAUDE.md §7.5 歸檔流程)。

---

## 全部 milestone(舊 → 新)

| commit | 日期 | 主題 |
|---|---|---|
| `681df32` | 2026-05-25 | Add Spec-Kit presets / extensions / skills |
| `8cb5d6b` | 2026-05-25 | docs: workspace 指引 CLAUDE.md(rev1 重建至 rev2) |
| `428100f` | 2026-05-25 | chore(hook): SessionStart hook + SOP 腳本 |
| `fee9f29` | 2026-05-25 | chore(submodule): .gitmodules 定義 base-web / rust-api |
| `d810aee` | 2026-05-25 | chore(submodule): 註冊 base-web + rust-api gitlink(首次 add) |
| `24ed26d` | 2026-05-26 | feat(deploy): base-web docker-compose dev/prod profile + multi-stage Dockerfile |
| `773d29f` | 2026-05-26 | docs: 000-base-web-docker-bootstrap(設計理由 + 4 輪 debug + CDP 登入驗證) |
| `b983017` | 2026-05-26 | docs: INTEGRATION-RESEARCH.md(rev1 設計鏈萃取 + 30 superpowers 教訓) |
| `4920323` | 2026-05-26 | test: tests/mock-coverage-audit/ CDP 工具與 step 規格 |
| `9d94bdb` | 2026-05-26 | docs: MOCK-COVERAGE-AUDIT.md(CDP 三段 capture + wire ground truth) |
| `855df4f` | 2026-05-26 | docs: INTEGRATION-RESEARCH-FOLLOWUP.md(Tier 1/2/3 八項深入研究) |
| `522011e` | 2026-05-27 | docs: 同步 audit / research / followup 三檔 cross-ref(§10 列 16 處) |
| `a9921eb` | 2026-05-27 | docs: INTEGRATION-DESIGN.md 初版(12 段 + 31 feature + 12 待拍板) |
| `8dad8ae` | 2026-05-27 | docs+test: followup §10.3 四項(logout / login / alova / framework) |
| `727cdd8` | 2026-05-27 | docs+test: A+B follow-up — alova 5 按鈕 code 矩陣 + bind-wechat 頁面驗證 |
| `fbd8e3e` | 2026-05-27 | docs: INTEGRATION-DESIGN.md 補 followup §13.6 新事實 |
| `79d4725` | 2026-05-27 | docs: 統一 rev1 編號標示與 rev2 軌道命名(4 檔 258+/258-) |
| `8250629` | 2026-05-27 | docs: 落地 INTEGRATION-CHECKLIST.md(rev2 整合進度單一真相) |
| `ff9656d` | 2026-05-27 | docs(checklist): §11 12 待拍板全部完成 + 軌道授權清單(§6) |
| `28275ad` | 2026-05-27 | docs: 回填 §11 12 拍板到 DESIGN(設計權威)+ 精簡 CHECKLIST(動態 todo) |
| `848317c` | 2026-05-27 | docs(claude.md): §7 整合設計文件職責分工完整化 |
| `0f0daf9` | 2026-05-27 | chore(claude.md): §2 目錄結構展開 docs/ 子檔 + L216 拔過時 ⏳ |
| `788fae1` | 2026-05-28 | docs(claude.md): 整理過時 ⏳ 標示 |
| `b351820` | 2026-05-28 | docs: 落地 docs/GRAPHIFY-NOTES.md(rev2 圖譜現況與限制) |
| `b0ec406` | 2026-05-28 | docs: constitution v1.0.0 凍結 + Phase 0 歸檔 + MILESTONES.md 落地 + CHECKLIST 結構整理 |
| `35b8861` | 2026-05-28 | docs(checklist): §2.1 拍板項歸檔 + 標題格式統一 |
| `7d044a7` | 2026-05-28 | docs(design): §4.6 Phase 0 對稱盤點 baseline 固化(6 項規格回填)+ CHECKLIST §2.2 歸檔 |
| `4eceb5c` | 2026-05-28 | docs(superpowers): 001-dockerfile-rust-api Phase 0 brainstorm spec-design |
| `93088ee` | 2026-05-28 | docs(spec): 001-dockerfile-rust-api spec + quality checklist(階段 1 /speckit-specify) |
| `b1a2c9d` | 2026-05-28 | docs(plan): 001-dockerfile-rust-api Phase 0/1 design artifacts(階段 1 /speckit-plan) |
| `08c49c5` | 2026-05-28 | docs(tasks): 001-dockerfile-rust-api tasks.md(階段 1 /speckit-tasks) |
| `a379378` | 2026-05-28 | feat(deploy): rust-api multi-stage Dockerfile + standalone compose + secret 範本(階段 2) |
| `44d20fb` | 2026-05-28 | feat(rust-api): 3 crate workspace + axum /health + _FILE secret loader(階段 2,inner) |
| `f64392a` | 2026-05-28 | chore(submodule): bump rust-api 到 44d20fb(階段 2 兩段式 commit 第二段) |
| `a21e932` | 2026-05-28 | Merge feature 001-dockerfile-rust-api 回 rev2-admin-root(--no-ff,feature branch 保留) |
| `d20c2ae` | 2026-05-28 | docs: 001-dockerfile-rust-api merge 收尾(CHECKLIST §1+§4 / MILESTONES / SPECKIT marker) |
| `34a5df0` | 2026-05-28 | docs(checklist): §2.4 feature 001-dockerfile-rust-api spec doc follow-up |
| `9c5edf4` | 2026-05-28 | docs(checklist): §1 對齊 base-web Dockerfile feature scope + push 完成事實 |
| `eb1daf4` | 2026-05-28 | docs(port): base-web port 9527/9528 → 21079 跨檔對齊(Phase 1 #2 前置) |
| `e45a2e5` | 2026-05-28 | docs(superpowers): 002-dockerfile-base-web Phase 0 brainstorm spec-design |
| `b3cbf3e` | 2026-05-28 | docs(spec): 002-dockerfile-base-web spec.md + checklist(階段 1 /speckit-specify) |
| `beb8cd1` | 2026-05-28 | docs(plan): 002-dockerfile-base-web Phase 0/1 design artifacts(階段 1 /speckit-plan) |
| `c2d5cd8` | 2026-05-28 | docs(tasks): 002-dockerfile-base-web tasks.md(階段 1 /speckit-tasks) |
| `5648a6d` | 2026-05-28 | docs(spec): 對齊 /speckit-analyze 4 LOW + 1 leftover 修(spec/tasks/checklist) |
| `942d4e7a` | 2026-05-28 | feat(base-web): 新增 public/health.html(階段 2,inner — BASE-WEB-ADAPT 軌道) |
| `c0b17ef` | 2026-05-28 | feat(deploy): 002-dockerfile-base-web 完整實作 + SHA pin 942d4e7a(階段 2,outer) |
| `a70fa5f` | 2026-05-28 | Merge feature 002-dockerfile-base-web 回 rev2-admin-root(--no-ff,feature branch 保留) |
| `cd1b655` | 2026-05-28 | docs: 002-dockerfile-base-web merge 收尾(CHECKLIST §1+§4 / MILESTONES / SPECKIT marker) |
| `bc2a004` | 2026-05-28 | docs(checklist): 對齊 §7.5 歸檔規則 — 拔 §4 Phase 1 標題與 §1 階段行的子項 ✅ 標示 |
| `1651d8b` | 2026-05-28 | docs(checklist): 新增 §2.5 / §2.6 follow-up — 002 spec doc 小修 + 000 §3.2 corepack 範例不同步 |
| `2a34c64` | 2026-05-28 | docs+test: 000-bootstrap §3.2 corepack 同步(option iii)+ mock-coverage-audit 9 step files port 9527→21079 同步(33 處)+ CHECKLIST §2.6 歸檔;9 step files 全跑通(100 records / 334 steps) |
| `c6e1c7e` | 2026-05-28 | docs(milestones): append 2a34c64 — 000-bootstrap §3.2 + mock-coverage-audit step files port + CHECKLIST §2.6 歸檔 |
| `38b0ef9` | 2026-05-28 | docs(checklist+milestones): §2.6 標題對齊 §2.1/2.2 歸檔格式 + 補 3 個遺漏 MILESTONES entries |
| `e25062e` | 2026-05-28 | docs(superpowers): 003-tls-dev-cert Phase 0 brainstorm spec-design |
| `39b48c1` | 2026-05-28 | docs(spec): 003-tls-dev-cert spec.md + quality checklist(階段 1 /speckit-specify) |
| `0d2f4a6` | 2026-05-28 | docs(plan): 003-tls-dev-cert Phase 0/1 design artifacts(階段 1 /speckit-plan) |
| `23c1093` | 2026-05-28 | docs(tasks): 003-tls-dev-cert tasks.md(階段 1 /speckit-tasks) |
| `3b10841` | 2026-05-28 | docs(tasks): 對齊 /speckit-analyze 3 LOW 修(T004 註腳 + T011 macOS + T016 SC-008 字面) |
| `45b711f` | 2026-05-28 | chore(spec-kit): auto_commit 全 hook enabled 開啟(16 個 hook 全 true) |
| `82cc95a` | 2026-05-28 | feat(deploy): 003-tls-dev-cert 落地 dev TLS cert 生成 skeleton(zero-arg + --force,Hybrid CA + self-signed-marker 機制,RSA 2048 + SAN localhost+127.0.0.1,CA 10 年 / leaf 1 年,全 docker 化 alpine/openssl) |
| `cb5e1a1` | 2026-05-28 | Merge feature 003-tls-dev-cert 回 rev2-admin-root(--no-ff,feature branch 保留) |
