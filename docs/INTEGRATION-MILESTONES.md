# INTEGRATION-MILESTONES.md — rev2 整合 commit 里程碑歷史

> rev2 整合的 commit milestone 永久 append-only 紀錄。**不在 SOP hook 注入範圍**(避免 CHECKLIST 膨脹)。
> CHECKLIST §3 不再記;CHECKLIST §1「最新進展」滾動最近 2 條、本檔保留完整歷史。
>
> **編輯紀律**:append-only、按 commit 時間順序(舊 → 新)、不刪除已記項目。
> **更新時機**:任何 docs / feature commit 落地後立即追加(見 CLAUDE.md §7.5 歸檔流程)。

---

## 1. 全部 milestone(舊 → 新)

> 來源於 INTEGRATION-CHECKLIST.md 的 §1. Current Focus

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
| `22e08da` | 2026-05-29 | docs(spec): 007-db-redis-connection spec.md + quality checklist(階段 1 /speckit-specify,16/16 PASS) |
| `d3bad48` | 2026-05-29 | docs(clarify): 007-db-redis-connection 補 §Clarifications(階段 1 /speckit-clarify,0 提問全 Clear) |
| `d24ddaa` | 2026-05-29 | docs(plan): 007-db-redis-connection Phase 0/1 design artifacts(階段 1 /speckit-plan,Constitution 7+7=14 ✅、research R1-R4 + 5 entity + C-V contract + quickstart) |
| `d3bea3f` | 2026-05-29 | docs(tasks): 007-db-redis-connection tasks.md(階段 1 /speckit-tasks,18 task / 6 phase,有 config 單測) |
| `3c8ffe4` | 2026-05-29 | docs(spec): 007 對齊 /speckit-analyze 3 LOW remediation |
| `6b88cec` | 2026-05-29 | chore(deploy): docker-compose 接 database_url/redis_url secret 至 rust-api(007 階段 2 Foundational,外層單段) |
| `f9829d7` | 2026-05-29 | docs(plan): 007 補 Implementation Notes/Deviations(Cargo.lock MSRV pin + migration DATABASE_URL bridge) |
| `39eb43d` | 2026-05-29 | chore(submodule): bump rust-api 到 091fe6a(007 階段 2 兩段式第二段;worktree `44d20fb..091fe6a` 已 push fork:deps+config / 連線層+AppState+boot / migration proof / config 單測 4 commit) |
| `928949d` | 2026-05-29 | Merge feature 007-db-redis-connection 回 rev2-admin-root(--no-ff,feature branch 保留)— rust-api Postgres+Redis 連線層+AppState+fail-fast boot + migration pipeline proof(sys_user seed Super/Admin/User、argon2id、冪等)+ config 12 單測;5 unit/18 task subagent-driven TDD,各 spec+quality 雙審 + final holistic review = Ready;dev stack 5 svc healthy / Constitution 7+7=14 ✅ / 2 偏離回填 plan.md |
| `ea6ca9f` | 2026-05-29 | docs(brainstorm): 008-response-envelope Phase 0 spec-design(envelope 對齊 — Res<T>+AppError+完整 BizCode 矩陣+404 fallback;Internal=5000、不做 camelCase 機制) |
| `227387f` | 2026-05-29 | docs(spec): 008-response-envelope spec.md + quality checklist(階段 1 /speckit-specify,16/16 PASS,0 NEEDS CLARIFICATION) |
| `13de898` | 2026-05-29 | docs(clarify): 008-response-envelope §Clarifications 補 /speckit-clarify 掃描結果(11 類全 Clear、0 提問) |
| `41bf8a8` | 2026-05-29 | docs(plan): 008-response-envelope Phase 0/1 design artifacts(階段 1 /speckit-plan,Constitution 7+7=14 ✅;research R1-R4 + 3 entity + C-V contract + quickstart;dep +serde_json) |
| `1294bee` | 2026-05-29 | docs(tasks): 008-response-envelope tasks.md(階段 1 /speckit-tasks,13 task / 6 phase,test-first 純邏輯單測) |
| `e1b0a6c` | 2026-05-29 | chore(submodule): bump rust-api 到 fac12f6(008 階段 2 兩段式第二段;worktree `091fe6a..fac12f6` 已 push fork:信封 Res<T>+BizCode 12-variant / AppError::NotFound+404 fallback / AppError::Internal+500/5000 三 commit) |
| `7bdf5bb` | 2026-05-29 | Merge feature 008-response-envelope 回 rev2-admin-root(--no-ff,feature branch 保留)— rust-api 統一回應信封契約:Res<T>{data,code,msg}(code=string、無 success、欄位序 data→code→msg)+ IntoResponse;BizCode 完整 12-variant 矩陣(只 wire 0000/4040/5000);AppError(NotFound→404、Internal→500/5000)+ axum .fallback()(404 live curl 驗);/health 不動。3 unit/13 task subagent-driven TDD,各 spec+quality 雙審 + final holistic review = Ready;21 單測 PASS / 2 拍板(Internal=5000 rev2 自訂 5xxx、不做 camelCase 機制)/ Constitution 7+7=14 ✅ |
| `4a1f9f9` | 2026-05-29 | docs(brainstorm): 009-soft-delete-infra Phase 0 spec-design(soft-delete 三重防護:類型 trait / facade / build-time lint;6 決策 D1-D6) |
| `32a5a42` | 2026-05-29 | docs(spec): 009-soft-delete-infra spec.md + quality checklist(階段 1 /speckit-specify,16/16 PASS,0 NEEDS CLARIFICATION) |
| `e0b81cc` | 2026-05-29 | docs(clarify): 009-soft-delete-infra §Clarifications 補 /speckit-clarify 掃描結果(11 類全 Clear/N-A、0 提問) |
| `565d08b` | 2026-05-29 | docs(plan): 009-soft-delete-infra Phase 0/1 design artifacts(階段 1 /speckit-plan,Constitution 7+7=14 ✅;research R1-R5 + 3 entity data-model + C-V contract + quickstart;新增 workspace member entity crate) |
| `03f8c12` | 2026-05-29 | docs(tasks): 009-soft-delete-infra tasks.md(階段 1 /speckit-tasks,13 task / 6 phase,test-first 純邏輯 + lint test + migration 套用驗收) |
| `7fce19f` | 2026-05-29 | chore(submodule): bump rust-api 到 88ed11e(009 階段 2 兩段式第二段;worktree `fac12f6..88ed11e` 已 push fork:entity crate + sys_user model / SoftDeletable trait + facade / partial unique migration / build-failing lint test 四 commit) |
| `88312b6` | 2026-05-29 | Merge feature 009-soft-delete-infra 回 rev2-admin-root(--no-ff,feature branch 保留)— soft-delete 三重防護立機制 + sys_user proof:①SoftDeletable trait(find_active 過濾 deleted_at IS NULL)②facade(server/src/model/facade/,唯一管道、soft_delete 設標記、不 re-export Entity)③build-failing lint test(facade 外 use entity:: → cargo test fail,兩階段 lexer 防註解/字串 false-negative);schema 加 deleted_at + partial unique index WHERE deleted_at IS NULL;新增 workspace member entity crate(首個 sea-orm model、無新外部 dep)。5 unit/13 task subagent-driven TDD,各 spec+quality 雙審 + final holistic review = Ready;40 tests + migration build clean / Constitution 7+7=14 ✅ / 6 entity rollout 延後 |
| `4543aaf` | 2026-05-29 | docs(brainstorm): 010-migration-auto-apply Phase 0 spec-design(dev/prod 啟動即自動套 migration、fail-fast;5 決策 D1-D5) |
| `6906f9c` | 2026-05-29 | docs(spec): 010-migration-auto-apply spec.md + quality checklist(階段 1 /speckit-specify,16/16 PASS,0 NEEDS CLARIFICATION) |
| `8962f50` | 2026-05-29 | docs(clarify): 010-migration-auto-apply §Clarifications 補 /speckit-clarify 掃描結果(11 類全 Clear/N-A、0 提問) |
| `eb2f27e` | 2026-05-29 | docs(plan): 010-migration-auto-apply Phase 0/1 design artifacts(階段 1 /speckit-plan,Constitution 7+7=14 ✅;research R1-R5;無 data-model〔不引入新資料實體〕;C-V contract §1-§4 + quickstart) |
| `60fda79` | 2026-05-29 | docs(tasks): 010-migration-auto-apply tasks.md(階段 1 /speckit-tasks,9 task / 6 phase,outer-only 無單元測試、C-V acceptance) |
| `6d5da7f` | 2026-05-29 | docs(tasks): 010 analyze 後 remediation 3 LOW(end-state 權威 / entrypoint 澄清 / 失敗注入) |
| `a7aa457` | 2026-05-29 | feat(deploy): docker-compose 新增 migrate service 骨架 + rust-api service_completed_successfully 閘門 |
| `8afc584` | 2026-05-29 | feat(deploy): docker-compose.dev 新增 migrate override(覆寫 entrypoint→cargo run --bin migration、command up) |
| `4f14dcd` | 2026-05-29 | feat(deploy): docker-compose.prod 新增 migrate override(command [migration,up] 經 entrypoint dispatcher) |
| `99356a4` | 2026-05-29 | fix(deploy): Dockerfile builder 補 entity crate + Cargo.lock COPY(009 加 entity workspace member 後遺漏、擋住 runtime release build;Deviation D-1、user 授權) |
| `b9293db` | 2026-05-29 | docs(checklist): §5.10 新增 SQL injection 跨 feature 紀律(Phase 3+ 業務 query) |
| `3cf3c12` | 2026-05-29 | docs(deploy): 清理 Unit3 review 指出的兩處過時/錯字註解(Dockerfile Cargo.lock 註解 + prod migrate paren) |
| `4e4312c` | 2026-05-29 | docs(plan): 010 補 Deviation Log D-1(Dockerfile entity 缺口修補、FR-007 調和) |
| `e4ff2b2` | 2026-05-29 | Merge feature 010-migration-auto-apply 回 rev2-admin-root(--no-ff,feature branch 保留)— dev/prod stack up 自動套 sea-orm migration、API 起來前完成、失敗 fail-fast:一次性 migrate service(dev cargo run --bin migration up / prod entrypoint dispatcher migration up)+ rust-api depends_on migrate: service_completed_successfully 閘門;守 007 FR-009(server 不自動 migrate)。附帶修 deploy/Dockerfile.rust-api.txt(009 entity 缺口、Deviation D-1、user 授權)。outer-only(3 compose + Dockerfile,無兩段式 commit)。dev US1(自動套+冪等)/ prod US2(對齊 001/002/003)/ fail-fast US3 三向 acceptance 親驗通過 / FR-009 regression 0 命中;subagent-driven 5 unit、各 spec+quality 雙審 + final review = Ready;Constitution 7+7=14 ✅ |
| `2be489f` | 2026-05-29 | Merge feature 011-audit-log 回 rev2-admin-root(--no-ff,feature branch 保留)— 統一資料變動 audit 基礎設施。sys_operation_log 表(migration 004、經 010 自動套、append-only 無 deleted_at·非 SoftDeletable、FR-003)+ server/src/model/audit.rs 純資料層(AuditOperation/AuditEvent/AuditOperator/AuditSerialize + mutate_in_txn:codebase 首個 transaction pattern、唯一原子寫入入口、不含 entity:: 路徑)+ facade/sys_operation_log::write_in_txn(唯一構造 entity::sys_operation_log::ActiveModel 之處、保 009 entity-access lint route b 續綠)。活體 proof:facade/sys_user::soft_delete 改接 mutate_in_txn,同一 DatabaseTransaction 內 SELECT active→redact audit_json(password→"<redacted>")→UPDATE deleted_at→寫 SOFT_DELETE audit,原子 both-or-neither,回傳 Result<bool>(false=0-rows no-op 不寫 audit)。live-DB 驗收抓修真實 bug:operator_ip INET 欄 Set(None) 觸 sea-orm NULL::text vs INET 的 PG 42804 cast 錯→改 None→NotSet(略過欄、DB native NULL);Some(ip) text-binding 真值寫入留 Phase 3。守 007 FR-009(server 不自動 migrate、grep regression 0 命中)+ 009 facade 邊界(entity-access lint 續綠)。scope:只 SOFT_DELETE 真實接線(餘 INSERT/UPDATE/RESTORE enum 先定義)、無 HTTP 請求層 audit middleware、無其他 entity rollout、「facade 內漏配 audit」build-failing lint defer follow-up。測試:redact 純函式 + write_in_txn SQL-build(operator_ip NotSet 缺欄斷言)純單測 + 3 個 #[ignore] live-DB 驗收(軟刪恰 1 筆 redact audit+user 已刪 / 注入 audit INSERT 失敗→UPDATE+audit 同 rollback / 0-rows no-op)對 dev postgres 親驗通過;no-DB 25+3 ignored + entity_access_lint 17 全綠。兩段式 commit(rust-api worktree 7 commits 8838579..5a72560 push fork rev2-admin-rust-api、外層 SHA pin 5a72560);4 unit/15 task subagent-driven、各 spec+quality 雙審 + opus final holistic review = READY TO MERGE;Constitution 7+7=14 ✅;011 branch 保留 |
| `774f7b3` | 2026-05-29 | Merge feature 012-sub-crate-setup 回 rev2-admin-root(--no-ff,feature branch 保留)— Casbin RBAC 工具層地基。Phase 2 P1 最後一個 feature、Phase 2 P1 全數完成(007~012)。sea-orm-adapter(Casbin↔Postgres policy 儲存)+ xdb(IP→地區)自 rev1@0b64a57 授權拷貝(§11.6 / constitution §I.5 例外、007 以來首個拷貝 rev1 feature、各 Cargo.toml 標出處)進 rust-api workspace。casbin bump 2.10→2.20.0(user 拍板、§6 surface、stable):cargo build -p sea-orm-adapter -p xdb 編譯閘門一次過、adapter Adapter trait 零 drift(最高風險點清除、未動 adapter.rs)。casbin_rule 經 migration 005(委派 sea_orm_adapter::up/down 為單一 schema 來源、不手寫 DDL;adapter migration.rs 的 if_not_exists 使 SeaOrmAdapter::new() 自動建表為無害 no-op、FR-005 調和)、經 010 自動套、server 不自動 migrate(守 007 FR-009、grep 0 命中)。活體 smoke 親驗(D2):adapter 對 live postgres policy round-trip(env-gate DATABASE_URL #[ignore]:清表→Enforcer add_policy alice/data1/read→auto-save 寫穿→新 conn 新 adapter 第二 Enforcer auto load→has_policy 斷言;psql 確認 casbin_rule 有 p,alice,data1,read;new() 二度於表已存在後成功=FR-005 no-op、pg_class count=1)綠;xdb 解析 1.2.4.8→中国|0|北京|北京市|0(非空、| 分段、非硬編固定值)。附帶修 rev1 潛伏 bug:action.rs remove_filtered_policy 對已從 index 0 裝填的 rule.values 又切 [index..] 致 field_index>=1 錯位(與 casbin 2.20 升版無關)→ 單行修正 rule.values[index..]→rule.values、user 拍板現修、plan Deviation D-1;修後 rev1 自帶 test_adapter(改 env-gate DATABASE_URL)+ round_trip_live 全綠(2 passed)。scope 邊界:未接 enforce / 未加 axum-casbin / casbin_rule 無 deleted_at(皆 Phase 3);axum-casbin enforce 中介層重寫 + 受管 RBAC policy 層(soft-delete/protected/audit/CRUD)brainstorm 重定位至 Phase 3。守 009 entity-access lint(新 crate 不在 server/src 掃描)。既有不破:25+3 ignored server + 17 lint + xdb 9 全綠、/health ok、seed >=3。兩段式 commit(rust-api worktree 5 commits 30e007e..e193c47 push fork rev2-admin-rust-api、外層 SHA pin e193c47);subagent-driven 5 unit/10 task、各 spec+quality 雙審 + opus final holistic review = READY TO MERGE;Constitution 7+7=14 ✅;012 branch 保留 |
| `ade723d` | 2026-05-30 | Merge feature 013-auth-login-enforce 回 rev2-admin-root(--no-ff,feature branch 保留)— **Phase 3 RBAC 起手 + 首個 Casbin enforce 點 + 首條真 base-web↔rev2 wire**。login(/auth/login:facade 查 active user→argon2 verify→失敗統一 1000〔FR-002 無 user 列舉〕→簽 access+refresh)+ getUserInfo(/auth/getUserInfo:驗 access JWT→facade 查 user+roles〔**DB 權威源、非 token claims**〕+ buttons〔程式內 role→[B_CODE] 矩陣對齊 mock §4.4〕→{userId:string,userName,roles,buttons}、**userName=nick_name〔User→User01 alias〕**、token 壞 3333)+ refreshToken(/auth/refreshToken:驗 refresh JWT〔refresh secret〕→簽新 access/refresh、**最小無狀態 D4**、失敗 8888 **絕不 3333/9999/9998**)。**JWT auth/jwt.rs**:HS256〔新 workspace dep jsonwebtoken 9.3.1,**MSRV 1.86 故非 max_stable 10.x**〕、access/refresh secret 分離、**驗 exp + alg pinning〔防降級〕**、Claims{sub,user_id,roles,exp,iat,iss,aud}、iss/aud=rev2-admin〔base-web token opaque、iss 不驗〕、bearer 解析抽 auth/bearer.rs 共用。**首個 Casbin enforce 點 auth/enforce.rs**〔§11.6「axum-casbin 重寫」第一刀、**rev2 自家 axum from_fn_with_state middleware**、非拷貝〕:驗 access JWT→取 roles→對每 role enforce((role,path,method))→任一 allow 放行、全 deny→**HTTP 403 + Res::err(5003)**〔tuple override Res 強制 200〕;casbin RBAC model〔r/p=sub,obj,act、m 三段相等〕+ Enforcer〔model + **012 stock SeaOrmAdapter::new(db)**〕、AppState{db,redis,jwt,enforcer:Arc<RwLock<Enforcer>>}〔boot fail-fast〕;示範路由 GET /systemManage/getUserList〔最小 stub、route_layer(enforce_mw) 僅此路由、/health+/auth/* 不掛〕。RBAC schema:sys_role〔009 soft-delete + partial unique code WHERE deleted_at IS NULL〕/ sys_user_role〔join 硬刪〕/ sys_user.nick_name + migration 006-009〔role/user_role seed/nick_name User01/casbin policy seed p,R_SUPER+p,R_ADMIN〔不給 R_USER_COMMON〕,經 010 自動套〕+ facade〔sys_role/sys_user_role + sys_user::find_active_by_name/by_id、守 009 entity-access lint〕。Res<T> err/err_msg 泛型化〔§2.11 移 impl<T>〕+ BizCode 新增 5003「权限不足」〔5001-5999 業務區、base-web 對非列舉碼 fallback toast 不登出〕。error code 對齊 mock §4.11:0000/1000/3333/8888/5003。**acceptance 三 US 全綠**:curl 活體〔login/getUserInfo/User01 alias/1000/3333、enforce Super·Admin 200 + **User 403+5003 deny**、refresh 8888 非 3333/9999/9998〕+ **首條真 base-web↔rev2 CDP 瀏覽器登入 smoke**〔base-web .env.test VITE_SERVICE_BASE_URL→rust-api:21081〔BASE-WEB-ADAPT、dev vite proxy /proxy-default〕、Super 登入→/home、Network 確認 login+getUserInfo 打 rust-api、LS SOY_token decode iss=rev2-admin、§I.1 里程碑〕。守 007 FR-009〔server 不自動 migrate、grep 0 命中〕+ 009 lint〔17 passed〕+ 008 envelope;prod runtime image build sanity 驗綠〔新 dep jsonwebtoken〕;既有不破〔server 50+3 ignored + xdb 9〕。**期間修 009 lint regression**〔T007/T008 handler 直 use entity::sys_user 違 facade 邊界、改走 find_active_by_name/by_id〕。**兩段式 commit**〔rust-api worktree 13 commits 60e675e..bbabdbc push fork rev2-admin-rust-api + base-web .env.test 5df2384 push fork rev2-admin-base-web + 外層 SHA pin b0a8eb9〕;subagent-driven-development 16 task、各 unit spec+quality 雙審 + opus final holistic review = READY TO MERGE;Constitution 7+7=14 ✅ + Deviation Log D-001〔AppState.jwt 必要延伸〕/D-002〔argon2 server crate dep〕/D-003〔user-enum timing side-channel defer〕;013 branch 保留;follow-up nits 見 CHECKLIST §2.16 |
| `9d06347` | 2026-05-30 | Merge feature 014-dynamic-routes 回 rev2-admin-root(--no-ff,feature branch 保留)— **Phase 3 #2:base-web 翻 dynamic auth route mode + 業務 menu 可見性走 Casbin enforce 過濾(§I.2 核心原則落地、重用 013 enforcer)**。3 route endpoint:GET /route/getConstantRoutes(**公開、無認證、無 middleware**、回程式內 constant 5 條〔403/404/500/login/iframe-page,component `layout.blank$view.*`/`layout.base$view.iframe-page`、meta.constant=true〕、SPA reload 即取)/ GET /route/getUserRoutes(JWT、**不掛 enforce middleware**、過濾在 handler 內:bearer→jwt::verify〔access secret+JWT_AUD〕→roles_for_user〔DB 權威〕→`menu::filter_routes_for_roles`〔enforcer read lock〕→{routes,home:"home"};token/roles 錯→3333)/ GET /route/isRouteExist?routeName=(JWT、`menu::route_exists_for_roles`、依角色 allow+deny)。**route 定義程式內寫死**(`server/src/route/menu.rs`:MenuRoute/RouteMeta/UserRoute DTO〔serde camelCase、id=string=name、省 meta.roles、skip_serializing_if〕+ constant_routes()/business_routes()〔home + manage 父含 4 children,component 精確對齊 base-web elegant-router `$` 複合格式、§I.5 未 grep rev1〕)。**menu 可見性走授權引擎**:migration 010 seed menu-visibility policy `p,<role>,<route_name>,menu` 進 casbin_rule(**9 rows** = D3 矩陣 Super5+Admin3+User1、`ON CONFLICT DO NOTHING`、沿 009 寫法、經 010 自動套、父層 manage **不** seed)+ `filter_routes_for_roles`/`route_exists_for_roles` 用 013 enforcer `enforce((role,route_name,"menu"))`〔RBAC model 不改、共 casbin_rule 表;act="menu" 與 013 endpoint policy act=method 共存〕+ **tree-prune**(父層 manage 子項任一可見則保留、children 只留 visible、否則整個 omit;home 葉直接判)。D3 三階梯:Super 全 / Admin home+manage〔user,user-detail〕/ User 只 home。enforce 決策 + tree-prune **test-first 單測**(MemoryAdapter seed 同 9 條 menu policy + inline 同份 RBAC model:Super 全集/Admin 部分/User 只 home/route_exists allow+deny/unknown false/multi-role union,6 新測)。**acceptance 全綠**:三 endpoint curl 活體(getConstantRoutes 5 條公開、getUserRoutes 三角色不同 + home="home" + token 缺/壞 3333、isRouteExist Super manage_role→true·**User manage_role→false〔deny〕**·home→true、psql menu policy 9 rows + GET 2 不受影響)+ **CDP dynamic-mode 瀏覽器 smoke**(base-web .env 翻 VITE_AUTH_ROUTE_MODE=dynamic、9229 自建 tab、reload→getConstantRoutes 觸發→登入 Super〔側欄含「系统管理」〕vs User〔側欄**只「首页」**= menu deny 端到端證明〕、getUserRoutes 200 + 兩角色側欄不同)。**dynamic mode 正面副作用:getUserRoutes 只送業務 route → demo menu 不送 → §11.5/BASE-WEB-BUILD-CONFIG ★ 在此模式 moot、不需動**。守 007 FR-009(server 不自動 migrate、grep 0 命中)+ 009 entity-access lint(route 模組/handler 不碰 entity::、roles 經 facade、17 passed)+ 008 envelope(全 Res<T>)+ §I.2/§I.3。**無新 dep/表/crate**(重用 013 enforcer/jwt/bearer/roles_for_user + 008);prod runtime image build sanity 驗綠。既有不破(server 50+3→**56+3**〔+6 新 filter 測試〕+ xdb 9 + lint 17)。**兩段式 commit**(rust-api worktree 7 commits `f65105e..c4b1d7e` push fork rev2-admin-rust-api〔含收尾移除 mod route 過時 #[allow(dead_code)]〕+ base-web `.env` dynamic `41f44b18` push fork rev2-admin-base-web + 外層 SHA pin `8965c8a`);subagent-driven-development 13 task、各 unit spec+quality 雙審 + opus final holistic review = READY TO MERGE;Constitution 7+7=14 ✅ + Deviation Log D-001(§I.2 re-scope:in-code map→Casbin policy seed+enforce)/ D-002(menu policy row 文件計數 8→9 修正、D3 矩陣權威、9 處 spec doc 校正);014 branch 保留 |
| `e1fa3db` | 2026-06-01 | docs(constitution): amend v1.1.0 — 新增 §I.6 SCHEMA-AUDIT-COLUMNS(業務主表建表 MUST 含 6 審計欄 created_at/created_by/updated_at/updated_by/deleted_at/deleted_by;append-only〔如 sys_operation_log〕/ join〔如 sys_user_role〕表例外;*_by=operator user_id Option<i64> 非 user_name;forward-only)+ §V.2 step1 提案位置 CHECKLIST→DESIGN §11 設計拍板項 + §IV 第 8 條 Compliance Check(新建業務表強制查 6 欄)。constitution-only 單檔單段、未動 docs/(先前 CHECKLIST/DESIGN 改動保持 unstaged);bootstrap 過渡 — 本批同時裝新 §V.2 規則,自身 DESIGN §11.14 提案紀錄 / §10 Phase4 審計欄 retrofit feature / CHECKLIST §2.18 / 本 MILESTONES 行 同輪 backfill,commit e1fa3db 為 interim 提案 of record。 |
| `cff9785` | 2026-06-01 | **Merge 015-audit-middleware `589a553`**(rust-api worktree 9 commits `a736072..cff9785` push fork + 外層 deploy/compose + SHA-pin)— request-context middleware(client_ip 直連/XFF 原始/region xdb/trace_id uuid/operator_id JWT)+ 2 append-only 審計表 sys_access_log(已認證請求、operator 閘門=FR-001/FR-002)/sys_login_attempt(登入成敗、2 index FR-008)+ **首個 xdb 消費者**(XDB_FILEPATH + prod Dockerfile COPY ip2region.xdb)+ **首個真值 INET client_ip**(sea-orm with-ipnetwork / ipnetwork 0.20)+ best-effort 不破業務(FR-003)。subagent-driven 19 task/3 US,各 spec+quality 雙審 + opus final holistic review;server 65 + entity_access_lint 17 + xdb 9 全綠 + dev/prod acceptance 全綠(US1/US2/US3 + SC-004 + prod image build region 非 NULL);Constitution v1.1.0 §IV 8/8 ✅;015 branch 保留 |
| `292c94f` | 2026-06-01 | **Merge 016-manage-role-user-list `5969d08`**(rust-api worktree 5 commits `7e5ce0b..81c56ef` push fork + 外層 docs 回填 `8fe6e52` + SHA-pin `292c94f`;**兩段式 commit**)— **Phase 4 主流業務第一刀:3 條唯讀 systemManage endpoint**(getUserList 分頁取代 013 stub / getRoleList 分頁 / getAllRoles 全量),管理頁第一次看到真實 user/role。**不動業務表、缺欄回 null**(D2)+ **id wire=string**(i64→to_string、§I.3 凍結、凌駕本檔殘留 number 敘述)+ **`PageRes<T>{current,size,total,records}`** 放 envelope.rs(4 欄無 pages/success、current/size/total 為 JSON number)+ **roles 批次 `roles_for_users(&[i64])→HashMap`** 避 N+1(整頁固定 count1+page1+roles1=3 query、SC-006、軟刪 role 經 find_active 丟棄)+ size clamp[1,100] + page_idx 0-based 轉換只在 handler `normalize_page`(不雙重 -1)+ 排序 id DESC。**授權**:三條各掛 013 `enforce_mw` + seed migration `m20260529_000013_seed_manage_policy`(**逐條無 wildcard 沿 009**;getRoleList×{R_SUPER,R_ADMIN}/getAllRoles×{R_SUPER,R_ADMIN,R_USER_COMMON}、getUserList 009 已有、路徑無 /api、`down` 只刪本 migration 兩路徑不碰 009)。**lint-safe 映射**:DTO mapping fn 收原始欄位〔非 Model 型〕→ `handler/system_manage.rs` 零 `entity::` token、守 009 lint。**無新 crate/dep**(用既有 sea-orm `PaginatorTrait` + 008 + 013)。**測試** test-first 純單測(PageRes 序列化無 pages/success+number / normalize_page clamp / filter SQL-build LIKE+id DESC / roles 批次 IN+組裝+軟刪 role 丟棄邊界 / DTO id→string·缺欄 null·無 password·camelCase):server 96 + entity_access_lint 17 + xdb 9 全綠、`Migrator::up` grep 0(守 007 FR-009)。**acceptance 47/47 活體**:§2 psql(7 GET policy 行、getUserList/getRoleList 無 R_USER_COMMON=deny 正確)+ §3 getUserList(分頁 total=3 / userName 過濾 / 超範圍空+total 3+0000 / **User 403+5003** / 無 token 3333 / 無 password / id string / null 欄)+ §4 getRoleList(total=3 / roleName·roleCode / roleDesc null / roleCode 過濾 / User 403)+ §5 getAllRoles(**Super+User 皆 0000**+非分頁陣列+嚴格{id,roleName,roleCode}+只 active / 無 token 3333)。**CDP 經 front-nginx 真實 `/api` 路徑**(:21080→nginx strip→rust):/manage/user 顯 3 user(Super/Admin/User01+角色欄)、/manage/role 顯 3 role(普通用户/管理员/超级管理员 × R_USER_COMMON/R_ADMIN/R_SUPER),null 欄(性別/郵箱/狀態)render 不 crash(R5);順帶 de-risk CHECKLIST §2.8 read-list CDP。**6-lens 全 diff 對抗審查 confirmed=0**(wire 契約 / authz-casbin / seaorm-pagination / lint-arch-constitution / security-exposure / spec-completeness,各 finding 對抗驗證)。subagent-driven-development(`executing-plans`→`subagent-driven`,T001~T019),各單元 spec compliance + code quality 雙審(US1 補軟刪 role 丟棄邊界測);Constitution v1.1.0 §IV 8/8 PASS(#2 menu N/A、#8 §I.6 N/A 不建/alter 業務表)。**不參照 rev1**(§I.5,不重蹈 rebase260531-016 備份補欄+number+破例)。016 branch 保留;follow-up 見 CHECKLIST §2.20 |
| `fb9a652` | 2026-06-01 | docs(constitution): amend v1.2.0 — MODAL-WIRING ★ 邊界擴 `views/manage/**`(含 `index.vue` delete/batchDelete placeholder `handleDelete`/`handleBatchDelete`),供 Phase 4 CRUD(017 user CRUD 起)接 list-page delete;紀律不變(只改 `// request` 一行、每處 spec 記 file:line + upstream 風險);§V.3 軌道授權邊界擴展 = MINOR(1.1.0→1.2.0);§II §11.3 拍板不變。三檔同輪:constitution §III.2 邊界+影響行+version(user 親改)/ DESIGN §11.15 提案 of record(§V.2 step1)/ CHECKLIST §6 軌道快查同步。觸發 feature 017-manage-user-write(user CRUD delete placeholder 在 index.vue,超出原 modules/*-operate-* 邊界)。 |
| `617136d` | 2026-06-02 | **Merge 017-manage-user-write `617136d`**(SHA-pin `7bfb353` / rust-api worktree 18 commits `910a6a2..deb6abee` push fork / base-web worktree `4c33895` push fork;**本地 merge --no-ff 回 rev2-admin-root,保留 017 branch,未推**)— **Phase 4 user 寫端 CRUD:4 條 Super-only systemManage 寫 endpoint**(addUser/updateUser POST + deleteUser/batchDeleteUser DELETE),把 016 唯讀管理頁閉成完整 CRUD。**schema 完補**:migration 014 `alter_sys_user_business_audit` 給 sys_user +9 欄(user_gender/user_phone/user_email/status 業務欄 + §I.6 審計欄 created_at/created_by/updated_at/updated_by/deleted_by;deleted_at 009 已有)+ **`id` BIGSERIAL**(raw SQL CREATE SEQUENCE+SET DEFAULT+setval、避撞 seed 1/2/3→next=4,R2 最高 risk)+ seed status=1 回填(D6);user_name partial unique 由 003 既有(C2 條件式跳過、無重複索引);entity sys_user +9 欄 + id auto_increment=true(R2 成對)、audit_json 補 nick_name+9 欄(password 持續 redact)。migration 015 `seed_write_policy` casbin **4 行逐條 R_SUPER**(無 wildcard)。**facade 寫 pattern**:create_user(mutate_in_txn insert + 預設密碼 hash_password("123456") argon2 random salt + replace_roles_in_txn + audit Insert、重複名→2222)/ update_user(load active→not-found Ok(false) / 更業務欄 + **updated_at+updated_by 成對顯式 Set** + role replace + audit Update、不動 user_name/password〔Q1=A immutable〕)/ soft_delete 擴 operator(**deleted_at+deleted_by 成對** + audit operator)、皆 §I.6;sys_user_role replace_roles_in_txn(code→active id、delete+insert 整批替換 R4、未知/軟刪 code 略過 US2-AS-2)。**login gate**(auth.rs login_attempt_inner、Q2=B/R6/親決 A):verify 通過後 `status==Some(2)→Err(LoginFailed)`=回 1000 統一守 013 no-enumeration、**僅 login 入口**(FR-013,不改 enforce_mw/getUserInfo)。enum i16↔string 純 fn(D5)、**id wire=String** parse i64(R7)、**D7 不可刪自己**單筆+批次整批拒(刪前檢查、無部分執行)、**D8 業務錯誤 2222**(用戶名重複/刪自己/不存在/非法 id·enum);016 user_item 改吃 sys_user 真實欄(R10:gender/status i16→string、時間 rfc3339、operator i64→string、缺值仍 null)。**base-web MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER**:新檔 `src/service/api/rev2-system-manage.ts`(fetchAddUser/Update/Delete/BatchDelete、request<null>)+ index.ts export + 接 3 placeholder(operate-drawer add/edit、index.vue handleDelete/handleBatchDelete,只改 `// request` 行、!error 才成功)、純接線無 form/typing 改動。**無新 crate/dep**(argon2/sea-orm small_integer 既有)。subagent-driven-development 28 task/3 US + 登入 gate,各兩階段 review(spec compliance + code quality)+ opus final holistic review = Ready to merge(FR-001..013 + SC-001..009 全可追溯、跨任務一致、無 Critical/Important)。**acceptance 全綠**:US1 addUser 10/10 / US2 updateUser 9/9(userName 不變 SC-009、updated_at/by 成對、無效 role 只採有效) / US3 delete 10/10(軟刪出列、deleted_by audit、刪自己 2222 整批拒) / 登入 gate 6/6(停用拒登 1000 無 token) / 守恆 11/11(server 119 + lint 17 + xdb 9 + 無 Migrator::up + **migration up→down→up 可逆**〔R2 throwaway DB〕 + 013/016 不破) / **真 CDP 7/7**(經 front-nginx :21080 登入→新增→編輯〔userName 不可改〕→刪除→null 不 crash→停用帳號登入失敗) / prod image build 綠。**§I.6 retrofit:sys_user 6 審計欄落地完成**(created_by on insert / updated_at·by 成對 on update / deleted_at·by 成對 on delete、*_by=operator i64 由 015 ctx)、**sys_role retrofit 仍 pending**(留 role 寫端那一波)。Constitution v1.2.0 §IV 8/8 PASS(#2 menu N/A、#8 §I.6 N/A create-time + retrofit 落地)。**設計細節見 `specs/017-manage-user-write/`**;follow-up 見 CHECKLIST §2.21;017 branch 保留 |


## 2. ✅ 完成+歸檔

> 來源於 INTEGRATION-CHECKLIST.md 的 §2. Follow-up Backlog - 已完成 (手動搬)

### 2.2 spec phase 0 對稱盤點 ✅ baseline 已固化 (2026-05-28)

baseline 規格回填於 [DESIGN §4.6](INTEGRATION-DESIGN.md);6 項實作驗收(grep `<TO_BE_SET>` 殘留 / 範本檔齊備 / `SELECT casbin_rule` / `ls migration/src/m*.rs` 等)由對應 Phase 1-4 feature spec 跑。

- §4.6.1 application.yaml placeholder 規劃 ✅
- §4.6.2 11 個 secret 清單(必 7 + 選 4)✅
- §4.6.3 Casbin policy seed 矩陣(3 role × 12 endpoint)✅
- §4.6.4 migration entity 清單(7 業務 + sys_tokens + casbin_rule + sys_operation_log)+ timestamp 規則 ✅
- §4.6.5 sys_user 預設帳號(§11.1 拍板 `Super/Admin/User`)✅
- §4.6.6 `graphify-out/` 落地時機(Phase 4 後)✅

### 2.3 workspace-level 落地 ✅ 全完成+已歸檔 (2026-05-28)

### 2.4 feature 001-dockerfile-rust-api spec doc follow-up ✅ 全完成+已歸檔 (2026-05-28)

### 2.5 feature 002-dockerfile-base-web spec doc follow-up ✅ 全完成+已歸檔 (2026-05-28)

### 2.6 superpowers 000-base-web-docker-bootstrap.md §3.2 corepack 範例同步 ✅ 全完成+已歸檔 (2026-05-28)

### 2.7 feature 003-tls-dev-cert spec doc follow-up ✅ 全完成+已歸檔 (2026-05-28)
