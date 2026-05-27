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
| `(本次)` | 2026-05-28 | docs: constitution v1.0.0 凍結 + Phase 0 歸檔 + MILESTONES.md 落地 + CHECKLIST 結構整理 |
