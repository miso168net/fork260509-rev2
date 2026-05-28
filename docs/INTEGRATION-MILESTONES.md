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
| `1825d5d` | 2026-05-28 | docs: 003-tls-dev-cert merge 收尾(CHECKLIST §1+§4+§2.3+§2.7 / MILESTONES) |
| `78b7e75` | 2026-05-28 | docs(spec): 001+002+003 spec doc follow-up 小修(§2.4+§2.5+§2.7 全歸檔) |
| `f2318d8` | 2026-05-28 | docs(spec): 004-compose-port-orchestration spec.md + quality checklist(階段 1 /speckit-specify) |
| `8a576b4` | 2026-05-28 | docs(clarify): 004-compose-port-orchestration 補 §Clarifications(階段 1 /speckit-clarify) |
| `0ced332` | 2026-05-28 | docs(plan): 004-compose-port-orchestration Phase 0/1 design artifacts(階段 1 /speckit-plan) |
| `4b3bcfc` | 2026-05-28 | docs(tasks): 004-compose-port-orchestration tasks.md(階段 1 /speckit-tasks) |
| `e882eb1` | 2026-05-28 | docs(analyze): 004 H1+M1 remediation(base-web base 層不放 build/image + build-arg location 明示) |
| `21508a4` | 2026-05-28 | feat(deploy): 004-compose-port-orchestration 落地 master compose stack(3 檔分層 + nginx 反代 + postgres/redis + acme skeleton + 2 standalone DEPRECATED) |
| `ecce4b8` | 2026-05-28 | fix(deploy): dev front-nginx healthcheck 改打 21080(dev 無 port 80 listener) |
| `7d8c7f1` | 2026-05-28 | fix(deploy): dev rust-api healthcheck 改 bash /dev/tcp(dev image 無 http client)+ prod.conf /health 改 location-based(不被 server-level 301 吃掉) |
| `e1fc88f` | 2026-05-28 | fix(deploy): healthcheck localhost → 127.0.0.1(alpine localhost 先解 ::1 IPv6、nginx/vite 只綁 IPv4) |
| `b8edfa0` | 2026-05-28 | docs(spec): 004 polish — §8.2.1 named volume 微修 + 回填 3 處 as-built healthcheck/nginx 偏離 |
| `b4294c7` | 2026-05-28 | Merge feature 004-compose-port-orchestration 回 rev2-admin-root(--no-ff,feature branch 保留)— dev/prod/acme 三模式 up --wait exit 0、SC-001~008 全 PASS |
| `ccd322e` | 2026-05-28 | docs(spec): 005-secret-injection spec.md + checklist(階段 1 /speckit-specify) |
| `d1c3496` | 2026-05-28 | docs(clarify): 005-secret-injection §Clarifications(階段 1 /speckit-clarify,0 提問全 Clear) |
| `8f27e53` | 2026-05-28 | docs(plan): 005-secret-injection Phase 0/1 design artifacts(階段 1 /speckit-plan,Constitution 7+7=14 ✅) |
| `689fb02` | 2026-05-28 | docs(tasks): 005-secret-injection tasks.md(階段 1 /speckit-tasks,14 task / 6 phase) |
| `2453ba5` | 2026-05-28 | docs(analyze): 005-secret-injection 跨檔 consistency 報告(階段 1 /speckit-analyze) |
| `493c045` | 2026-05-28 | feat(deploy): generate-secrets.sh 一鍵生成 7 必 secret(4 leaf + 3 URL,腳本同次同源保證 dual-write、idempotent + --force、docker openssl,階段 2) |
| `38df9ae` | 2026-05-28 | fix(deploy): postgres/redis 密碼 base64→rand -hex 24(URL-safe,避免 +// 破壞連線 URL;user 拍板偏離,同步 spec docs) |
| `5643be7` | 2026-05-28 | docs(deploy): 3 URL secret 範本 + retrofit postgres/redis 範本 + secrets/README.md |
| `ddd3ddc` | 2026-05-28 | fix(deploy): URL 範本手動 fallback 改讀既有 leaf(cat/cp)避免 dual-write drift |
| `d54107d` | 2026-05-28 | fix(deploy): docker-compose postgres 命名對齊 soybean/soybean_admin_rust(取代 004 暫用 rev2admin/rev2) |
| `74819d0` | 2026-05-28 | docs(spec): T013 只清 postgres 卷偏離(避免 down -v 冷重建假性失敗)全面同步 spec/tasks/quickstart/data-model/research |
| `068b2a8` | 2026-05-28 | Merge feature 005-secret-injection 回 rev2-admin-root(--no-ff,feature branch 保留)— Phase 1 #5 完成、**Phase 1 P0 部署基建全數收尾**;dev stack 5 service healthy、psql -U soybean 連線通、2 處 user 拍板偏離(hex / 只清 pg 卷) |
| `cd86dd7` | 2026-05-28 | chore: 001~005 spec-compliance audit(5 feature 對 spec.md 全 PASS、偏離皆有書面紀錄)+ 3 minor 修正(002 standalone compose port 綁 127.0.0.1 / 003 .gitignore 冗餘行 / 005 README chmod drvfs 說明) |
| `f506c66` | 2026-05-28 | docs: CLAUDE.md ⏳ 標記清理 + CHECKLIST §2.3 workspace-level 歸檔(Phase 1 完成後狀態同步) |
| `cfa9707` | 2026-05-28 | docs(superpowers): 006-docker-volume-naming Phase 0 brainstorm spec-design(volume 命名統一 rev2_→rev2-admin_ auto-prefix、bw→base_web、redis→redis_stack) |
| `c814cec` | 2026-05-28 | docs(spec): 006-docker-volume-naming spec.md + quality checklist(階段 1 /speckit-specify,16/16 PASS) |
| `62ac7ee` | 2026-05-28 | docs(clarify): 006-docker-volume-naming 補 §Clarifications(階段 1 /speckit-clarify,0 提問全 Clear) |
| `0872789` | 2026-05-28 | docs(plan): 006-docker-volume-naming Phase 0/1 design artifacts(階段 1 /speckit-plan,Constitution 7+7=14 ✅、6 research + 3 entity + 2 contract + quickstart) |
| `cd65d0f` | 2026-05-28 | docs(tasks): 006-docker-volume-naming tasks.md(階段 1 /speckit-tasks,17 task / 6 phase、無單元測試) |
| `6981378` | 2026-05-28 | docs(spec): 006 F1 remediation — SC-005/FR-010 cross-ref 範圍對齊 tasks(002/004,005 incidental) |
| `1033d90` | 2026-05-28 | feat(deploy): 統一 named volume 命名為 rev2-admin_ auto-prefix(US1,4 compose 移除顯式 name: + 3 key/mount 更名 + 2 standalone 加 name: rev2-admin;+ afff69e 偏離澄清 + prod.yml L4 註解) |
| `a2fefe9` | 2026-05-28 | docs(deploy): CLAUDE.md §8.2 文件化 named volume 命名規則 + §8.2.2 正典 7 卷(US2;+ c8db9ab 修正設 name: 檔列舉) |
| `f0d2fd2` | 2026-05-28 | docs: US3 既有文件對齊 — DESIGN/000 改新卷名 + 002/004 superseded cross-ref(+ a5ee96e 連結深度修 + 7a7f659 §3.1 schema 移除 name:) |
| `a12fd18` | 2026-05-28 | Merge feature 006-docker-volume-naming 回 rev2-admin-root(--no-ff,feature branch 保留)— named volume 命名統一精修;US1/US2/US3 各 spec+quality 雙審 + final holistic review、SC-001~005 全 PASS、2 處 user 拍板偏離(dev 6 卷 / prod.yml L4) |
