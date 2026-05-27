# graphify 知識圖譜 — 現況與限制

> CLAUDE.md §8.3 的詳細補充:圖譜統計、抽取機制限制(caveats)的權威清單。
> 主要操作方式列在 CLAUDE.md §8.3;本文是「**推論前必讀**」的細節。

---

## 現況

圖譜已建好(**2,099 nodes / 2,578 edges / 355 communities**,236 shown / 119 thin omitted),2026-05-26 完成 initial build + update + 2 次 prune-only。

- **Extraction 品質**:93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS;INFERRED 179 edges 平均 confidence 0.86
- **Token 用量累計**:1,699,624 input · 188,835 output(5 次 runs 含 prune)
- **抓取範圍**:`fork260509-soybean-admin-base/`(378 files)+ `fork260509-soybean-admin-docs/`(174 files);共 552 files
- **未涵蓋**:`fork260509-rev2-anew-rust-api/`(Rust 源倉**完全沒抓**)— 問 rust-api 後端設計時要直接讀 source,圖譜目前對 rust-api 零覆蓋

---

## 已知圖譜限制(推論前要記得)

### 抓取盲點(graphify 工具屬性、跨專案通用)

- **Vue component composition 破碎**:AST extractor 抓不到 `<template>` 標籤對應到 `import` 元件的關係。`.vue` 元件常呈現孤立或低 degree;問 Vue SFC 之間 wiring 要直接讀 SFC,別只信圖。
- **TypeScript module 間 import 關係可能破碎**:類似 Vue,部分 `import` 關係未被抽取,community 結構可參考但具體 call edges 仍要校驗。
- **AST EXTRACTED 邊方向不全可信**:原本以為 AST 抓的 EXTRACTED 邊 100% 正確,但**同 file 內 fn 互調**可能方向反。引用 EXTRACTED 邊前若涉及同 file fn 互調,仍要掃一眼 source 確認方向。
- **INFERRED edges 方向偶有反向**:LLM 推測邊偶見 caller ↔ callee 倒置。引用 INFERRED edges(7% / 179 條,平均 confidence 0.86)前最好掃一眼 source 確認方向。

### 重跑後的 community 結構變化

- **Community label 在 prune / update 後可能失準**:rev2 跑了 5 次 runs(initial build + update + update-tiny + 2 次 prune-only),社群結構重組過幾次;部分繼承 label 不再準確。引用 `graphify query` 返回的 Suggested Questions 時,「bridge to <community label>」要回頭核對社群實際 membership,**不要把 label 當社群純度的保證**。

### LLM 抽取行為偏差

- **同質條目可能標籤不一致**:同一文件內並列的同類條目(如 README 列出 N 個 variants),LLM 可能用不同 relation / confidence 標籤(`references` + EXTRACTED vs `semantically_similar_to` + INFERRED 混用)。引用 INFERRED semantic-similarity 邊時,若同段文字有 EXTRACTED `references` 的同類兄弟,多半 INFERRED 那條內容也屬實,只是 confidence 標籤偏差。

### Suggested Questions 假信號(graphify 自評演算法的盲點)

- **「weakly-connected = doc gap」是假信號**:`GRAPH_REPORT.md` Suggested Questions 演算法看到 weakly-connected nodes 會推斷「documentation gap / missing edges」,但這假設對 graphify 自己抓不到的 ecosystem 不成立(Vue component composition / TypeScript 部分 import 等盲點)。看到「weakly-connected nodes found」建議先核對該 ecosystem 是否在上述盲點清單內。
- **Community cohesion score 低(< 0.1)對盲點 ecosystem 也是假信號**,**不該據此判斷「該不該拆 module」**。

---

## rev2 特殊狀況

- **抓的是 fork 源倉、不是 worktree**:graphify 跑於 `fork260509-soybean-admin-base/` + `fork260509-soybean-admin-docs/`,**不是** worktree(`base-web/`)。fork 源倉分支 `example`(base)+ `main`(docs)。若 worktree(`rev2-admin-base-web`)已有 rev2 自家 commit、圖譜會落後於 worktree;**問 base-web 程式碼結構時、若要對齊 rev2 最新版本,要直接讀 `base-web/` 或重跑 graphify**。
- **rust-api 完全未抓**:rust-api 源倉設計問題不能用 graphify 查,要直接讀 `rust-api/server/` 或 grep。將來若要納入,跑 `graphify update`(`.graphifyignore` 沒排 rust-api 源倉,但歷次 runs 沒包含、可能因 .graphifyignore 早期內容或當時 source dir 設定排除)。
- **`.graphifyignore` 排除清單**:`base-web/` / `rust-api/`(worktree,避免與 fork 源倉雙倍索引)、`graphify-out/`(自輸出)、`specs/`、`docs/`、`target/`、`.specify/`、`.claude/`、`CLAUDE.md`。
- **5 次 runs 歷史**(`graphify-out/cost.json`):
  1. 2026-05-26 00:31 — initial build,378 files,999K + 111K tokens
  2. 2026-05-26 01:14 — update,178 files,652K + 72K tokens
  3. 2026-05-26 02:13 — update-tiny,2 files,49K + 5K tokens
  4. 2026-05-26 02:20 — prune-only(3 files 新排除 → 30 nodes pruned)
  5. 2026-05-26 03:36 — prune-only(`.graphifyignore` 加 `docs/` + `specs/` → 12 nodes pruned;INTEGRATION-CHECKLIST / RESEARCH + superpowers 000 退出圖譜)

---

> base-web 源倉分支是 `example`(不是 `main`),與 rev2 worktree(`rev2-admin-base-web`)目前同源、但後續若 worktree 累積 rev2 自家 commit、graphify 圖譜不會自動同步。建議在大規模設計問題前先跑 `graphify update`、看是否 diff。
