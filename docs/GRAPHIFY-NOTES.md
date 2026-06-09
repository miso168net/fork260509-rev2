# graphify 知識圖譜 — 現況與限制

> CLAUDE.md §8.3 的詳細補充:圖譜統計、抽取機制限制(caveats)的權威清單。
> 主要操作方式列在 CLAUDE.md §8.3;本文是「**推論前必讀**」的細節。

---

## 現況

圖譜已建好(**3,555 nodes / 4,468 edges / 550 communities**),2026-06-10 完成 **rev2 全量重建**(commit `db29cba`):換掉舊的 example 分支 mock 圖、改索引 rev2 真實整合碼。

- **Extraction 品質**:91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS(5 條);INFERRED 407 edges 平均 confidence 0.82
- **node 來源分佈**:`base-web/`(rev2 worktree)2,076 + `rust-api/`(rev2 worktree)1,178 + `fork260509-soybean-admin-docs/`(docs 源倉)283 + `docker-compose.yml` 18;共 618 distinct source files
- **node 型別**:code 3,306 · concept 124 · rationale 49 · document 45 · image 31(語意抽取產出 concept/rationale 節點承載設計意圖)
- **抓取範圍**:Rust axum+Casbin 後端(`rust-api/server/`、`entity/`、`migration/` 等)+ Vue3 前端(`base-web/` .ts/.vue)+ soybean-admin 框架文件。**Rust 後端已全覆蓋**(舊圖完全沒有)。
- **跨棧 wire 鏈已捕捉**:語意層抓到 base-web `fetch*` 前端 wire client ↔ rust-api `facade::find_active` 等後端的 `semantically_similar_to` / `shares_data_with` 邊 — 整合專案核心關係。

---

## 已知圖譜限制(推論前要記得)

### 抓取盲點(graphify 工具屬性、跨專案通用)

- **Vue component composition 破碎**:AST extractor 抓不到 `<template>` 標籤對應到 `import` 元件的關係。`.vue` 元件(本圖 159 檔)常呈現孤立或低 degree;問 Vue SFC 之間 wiring 要直接讀 SFC,別只信圖。
- **TypeScript module 間 import 關係可能破碎**:類似 Vue,部分 `import` 關係未被抽取,community 結構可參考但具體 call edges 仍要校驗。
- **AST EXTRACTED 邊方向不全可信**:**同 file 內 fn 互調**可能方向反。引用 EXTRACTED 邊前若涉及同 file fn 互調,仍要掃一眼 source 確認方向。
- **INFERRED edges 方向偶有反向**:LLM 推測邊偶見 caller ↔ callee 倒置。引用 INFERRED edges(9% / 407 條,平均 confidence 0.82)前最好掃一眼 source 確認方向。

### Community label 信任度(本次重建特別注意)

- **550 社群中僅 28 個手標、522 個自動命名**:自動名是「主要來源目錄 + 最高頻 token」啟發式(如 `web: xxx`、`rust: xxx`),**不是語意摘要**。引用 `graphify query` 返回的 Suggested Questions「bridge to <community label>」時,小社群(size ≤ 8 佔多數、302 個是 size 1-2)的 label 尤其不可當社群純度保證,要回頭核對實際 membership。
- 手標的前 28 大社群(size ≥ 31、涵蓋約 73% 節點的核心)label 可信:涵蓋 Casbin 政策歸檔/Enforcer、Menu 樹組裝、登入發 token、Role/User 建立稽核(rust)、Auth Store/路由、System-Manage API、主題 i18n(web)等。

### LLM 抽取行為偏差

- **同質條目可能標籤不一致**:同一文件內並列的同類條目,LLM 可能用不同 relation / confidence 標籤(`references` + EXTRACTED vs `semantically_similar_to` + INFERRED 混用)。引用 INFERRED semantic-similarity 邊時,若同段有 EXTRACTED `references` 的同類兄弟,多半 INFERRED 那條內容也屬實,只是 confidence 標籤偏差。

### Suggested Questions 假信號(graphify 自評演算法的盲點)

- **「weakly-connected = doc gap」是假信號**:Suggested Questions 演算法看到 weakly-connected nodes 會推斷「documentation gap / missing edges」,但這假設對 graphify 自己抓不到的 ecosystem 不成立(Vue component composition / TypeScript 部分 import 等盲點)。看到「weakly-connected nodes found」先核對該 ecosystem 是否在上述盲點清單內。
- **Community cohesion score 低(< 0.1)對盲點 ecosystem 也是假信號**,**不該據此判斷「該不該拆 module」**。

---

## rev2 特殊狀況

- **抓的是 worktree、不是 fork 源倉**(2026-06-10 起政策反轉):graphify 現索引 `base-web/`(分支 `rev2-admin-base-web`)+ `rust-api/`(分支 `rev2-admin-rust-api`)兩個 worktree = **rev2 真實整合碼**。對應源倉 `fork260509-soybean-admin-base/`(example 分支)+ `fork260509-rev2-anew-rust-api/` 已加入 `.graphifyignore` 排除(worktree 與源倉共用 `.git`、內容高度重疊、101/102 .ts 同相對路徑會撞 node ID)。**問 base-web/rust-api 程式結構直接信圖即可對齊 rev2 最新**(worktree 累積新 commit 後重跑 `graphify update` 同步)。
- **rust-api 已全覆蓋**:Rust 後端設計問題現可用 `graphify query` 查(舊圖零覆蓋、需直接讀 source 的限制已解除)。
- **docs 源倉仍索引但屬參考**:`fork260509-soybean-admin-docs/`(283 節點)是 soybean-admin 上游框架文件站(中/日/英),非 worktree、與 rev2 整合僅鬆散相關;node 數不低但整合相關性低,query 結果含大量 docs 節點時注意過濾。
- **`.graphifyignore` 排除清單**(現行):源倉 `fork260509-soybean-admin-base/` + `fork260509-rev2-anew-rust-api/`、`graphify-out/`(自輸出)、`specs/`、`docs/`、`target/`、`.specify/`、`.claude/`、`CLAUDE.md`、`README.md`、`deploy/*`、`docker-compose.*.yml`、`tests/`、lock files。worktree `base-web/` `rust-api/` **不再排除**。
- **runs 歷史**(`graphify-out/cost.json`):前 5 次(2026-05-26)是舊 example-分支 圖的 initial build + update + 2 prune;第 6 次(2026-06-10、commit `db29cba`)是本次 rev2 全量重建,31 個語意 subagent 並行、638 檔、合計 ~2.77M token。

---

> 圖譜現以 rev2 worktree 為來源、與整合分支同步。worktree 累積新 commit 後,大規模設計問題前先跑 `graphify update` 看 diff;`.graphifyignore` 已排除對應源倉,不會再雙倍索引。
