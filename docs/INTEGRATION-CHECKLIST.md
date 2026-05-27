# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:rev2 spec-kit 第二個 feature(002-dockerfile-base-web)已合回 `rev2-admin-root`;Phase 1 #1 ✅ #2 ✅;準備啟動 Phase 1 #3 TLS 憑證 skeleton feature。

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- **2026-05-28 002-dockerfile-base-web 完整實作 + 驗收 + merge + push**(outer merge `a70fa5f` / base-web inner `942d4e7a` / 外層 feat+SHA pin `c0b17ef`)— 20/20 task PASS / image 29 MB / dev hot reload OK / prod healthy 30s 內 + unhealthy 60s 內 / build-arg VITE_SERVICE_BASE_URL override 雙向驗 / BASE-WEB-ADAPT 軌道首次在 `public/` 應用 / Bonus 修 builder stage corepack ESM bug(改 `npm install -g pnpm@10`);push 完成(base-web 到 fork remote / outer + feature branch 到 origin)
- **2026-05-28 001-dockerfile-rust-api 完整實作 + 驗收 + merge + push**(outer merge `a21e932` / rust-api `44d20fb` / 外層 infra `a379378` + SHA pin `f64392a` / 收尾 `d20c2ae`)— 8/8 unit test + 9 acceptance scenario 全 PASS / image 35 MB / dev hot reload 2 秒(--poll fallback);push 完成(rust-api 到 fork remote / outer + feature branch 到 origin)

**下一步**(優先序):
1. **Phase 1 #3 TLS 憑證 skeleton feature** — `deploy/generate-dev-cert.sh`(self-signed)+ nginx TLS conf skeleton + `deploy/dev-certs/` 結構;留 prod acme.sh 給 #4 後續加;走完整 SDD-TDD
2. **Phase 1 #4 容器 port 與編排 feature** — `docker-compose.yml`(base)+ `docker-compose.{dev,prod}.yml` override + front-nginx service(21080/21443 對外、reverse proxy 至 base-web internal:21079 + rust-api internal:21081);standalone compose(`docker-compose.base-web.yml` / `docker-compose.rust-api.yml`)退場
3. **Phase 1 #5 secret 注入機制(scope 縮小)** — 001 已交 loader logic + 2 個 JWT 範本檔;#5 變為「9 個其他 secret 範本檔 + `deploy/generate-secrets.sh` 統一生成腳本 + dual-write docs」
4. 或先補本 feature spec doc 小修(見 [§2.4](#24-feature-001-dockerfile-rust-api-spec-doc-follow-up--2026-05-28))

---

## 2. Follow-up Backlog

### 2.1 §11 設計拍板項索引 ✅ 全完成+已歸檔 (2026-05-27)

> **兩條鐵紀律**(已凍結於 [constitution v1.0.0](../.specify/memory/constitution.md) §I):
> 1. **base-web 為權威** — base-web 有的功能、rust-api 都要實作(設計範圍嚴格)
> 2. **menu 權限 Casbin enforce** — rev2 核心突破,即使動 base-web 也要做

完整 12 拍板項與軌道授權細節見 [DESIGN §11](INTEGRATION-DESIGN.md);spec-kit `/speckit-plan` 將自動對照 constitution v1.0.0 跑 Compliance Check。

### 2.2 spec phase 0 對稱盤點 ✅ baseline 已固化 (2026-05-28)

baseline 規格回填於 [DESIGN §4.6](INTEGRATION-DESIGN.md);6 項實作驗收(grep `<TO_BE_SET>` 殘留 / 範本檔齊備 / `SELECT casbin_rule` / `ls migration/src/m*.rs` 等)由對應 Phase 1-4 feature spec 跑。

- §4.6.1 application.yaml placeholder 規劃 ✅
- §4.6.2 11 個 secret 清單(必 7 + 選 4)✅
- §4.6.3 Casbin policy seed 矩陣(3 role × 12 endpoint)✅
- §4.6.4 migration entity 清單(7 業務 + sys_tokens + casbin_rule + sys_operation_log)+ timestamp 規則 ✅
- §4.6.5 sys_user 預設帳號(§11.1 拍板 `Super/Admin/User`)✅
- §4.6.6 `graphify-out/` 落地時機(Phase 4 後)✅

### 2.3 workspace-level ⏳ 落地

- [x] ✅ `.specify/memory/constitution.md` v1.0.0(2026-05-28 凍結,155 行;5 sections + Compliance Check + Governance)
- [ ] `docker-compose.yml` + `docker-compose.{dev,prod}.yml` + `deploy/`(CLAUDE.md §8.2)
- [ ] `deploy/generate-dev-cert.sh`(self-signed TLS for dev)
- [ ] `deploy/secrets/`(env-file pattern,本機 dev 用)
- [ ] fork 源倉設 upstream remote(CLAUDE.md §4.6,目前未設、無法 `git fetch upstream`)
- [ ] `docs/GRAPHIFY-NOTES.md`(graphify 抽取限制與盲點筆記,圖譜跑完後)
- [ ] `specs/` 第一個 feature 目錄(P0 dockerfile-rust-api,§11 拍板後啟動)

### 2.4 feature 001-dockerfile-rust-api spec doc follow-up ⏳ (2026-05-28)

實作驗收期間發現的 spec doc 小修(只動文件、不動 code、不影響 acceptance 結果):
- [ ] `specs/001-dockerfile-rust-api/tasks.md` T030 / T031 / T032(c) grep pattern 過寬:
    * T030 `grep -rn "<TO_BE_SET>" rust-api/` 抓到 `server/src/config.rs:24` 內 `PLACEHOLDER_SECRETS` 常數(legitimately 定義黑名單、非洩漏)
    * T031 `ls rust-api/migration/src/m*.rs` 抓到 `main.rs`(應 `m_*.rs` 限 sea-orm migration entity 命名)
    * T032(c) `grep -E "secret|password|token" rust-api/application.yaml` 抓到 `access_token_ttl_secs` / `refresh_token_ttl_secs`(TTL 欄、非 secret 值)
    驗收已用 tightened grep PASS;spec 字面未同步
- [ ] `specs/001-dockerfile-rust-api/contracts/compose-profiles.md` L22 寫 refresh 預設字串長度 38、實際 39(typo,字串字面為 `dev_refresh_secret_for_local_only_x32xx` = 39 chars)
- [ ] `specs/001-dockerfile-rust-api/data-model.md` 未明確命名 merged runtime 的 `JwtConfig` struct(實作選此名、對齊 `JwtYaml` 命名邏輯;data-model 可補回填)

---

## 3. 已完成里程碑

完整 commit 里程碑歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)(append-only、不在 SOP 注入,避免本檔膨脹)。

§1「最新進展」滾動最近 2 條;歷史在 MILESTONES.md 永久保留。歸檔流程見 [CLAUDE.md §7.5](../CLAUDE.md)。

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + [`INTEGRATION-DESIGN.md` §10 各 Phase](INTEGRATION-DESIGN.md)。本節為動態 status 追蹤;feature 詳細描述見 DESIGN §10。

### Phase 0 — 設計拍板 ✅ 全完成+已歸檔 (2026-05-28)

### Phase 1 — P0 部署基建(對齊 [DESIGN §10 Phase 1](INTEGRATION-DESIGN.md);**#1 ✅ #2 ✅ 完成 2026-05-28**)

- [x] **rust-api Dockerfile feature ✅ 2026-05-28**(spec-kit 001-dockerfile-rust-api,merge `a21e932`)— 3 crate workspace + multi-stage Dockerfile + standalone compose + `_FILE` secret loader + 8/8 unit test;feature branch `001-dockerfile-rust-api` 保留供 audit
- [x] **base-web Dockerfile feature ✅ 2026-05-28**(spec-kit 002-dockerfile-base-web,merge `a70fa5f`)— port 21079 對齊 §8.2 + nginx HEALTHCHECK + build-arg `VITE_SERVICE_BASE_URL`(走 `.env.prod.local` precedence,因 vite `loadEnv` 不讀 process.env)+ `base-web/public/health.html` 新增(BASE-WEB-ADAPT 軌道首次在 `public/` 應用)+ 000-bootstrap.md surgical patch + Bonus 修 builder stage corepack ESM bug(`npm install -g pnpm@10`);feature branch `002-dockerfile-base-web` 保留供 audit
- [ ] TLS 憑證 skeleton feature
- [ ] 容器 port 與編排 feature(2XXXX port)
- [ ] secret 注入機制 feature(`_FILE` pattern)— **scope 縮小**(loader 已交、剩 9 範本檔 + 統一生成腳本 + dual-write docs)

### Phase 2 — P1 基礎設施(對齊 [DESIGN §10 Phase 2](INTEGRATION-DESIGN.md);尚未啟動)

- [ ] JWT 機密管理 feature
- [ ] soft-delete 基礎設施 feature(7 entity + 三重防護)
- [ ] envelope 對齊 feature(`{data, code, msg}` + camelCase)
- [ ] audit log 基礎設施 feature
- [ ] sub-crate setup feature(`axum-casbin` 重寫 / `sea-orm-adapter` + `xdb` 拷貝)

### Phase 3 — P2 認證 + 動態 menu(對齊 [DESIGN §10 Phase 3](INTEGRATION-DESIGN.md);尚未啟動)

- [ ] 登入 + getUserInfo feature(Casbin enforce 首次啟用)
- [ ] dynamic mode 路由 feature(3 route endpoint:`getConstantRoutes` / `getUserRoutes` / `isRouteExist`)
- [ ] Casbin redis pub-sub 啟用 feature(v1 即啟用)
- [ ] policy seed feature(三 role × 主流 endpoint)

### Phase 4 — P3 主流業務(對齊 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md);尚未啟動)

- [ ] manage list endpoints feature(6 read endpoint,對齊 mock)
- [ ] wire shape mapping feature(Output DTO + `From<Entity>` + pagination wrapper)
- [ ] alova-only endpoint 處理 feature(依 §11.2 拍板)
- [ ] 菜單樹建構 feature(parent_id → nested children)

### Phase 5 — P4 補位 + 抽離項(對齊 [DESIGN §10 Phase 5](INTEGRATION-DESIGN.md);尚未啟動)

- [ ] refresh token 完整實作 feature(`sys_tokens` rotation_chain)
- [ ] 抽離項 stub feature(`/auth/error` / `/auth/sendCaptcha` / `/auth/verifyCaptcha`)
- [ ] cleanup-job feature(dry-run 預設 + cron + 最小權 credential)

### Phase 6 — 觀察性(對齊 [DESIGN §10 Phase 6](INTEGRATION-DESIGN.md);可選,生產 ready)

- [ ] obs-min feature(promtail + loki + grafana,純 log)
- [ ] obs-full feature(+ prometheus + 3 exporter + pushgateway + grafana alerting)
- [ ] dashboard provisioning feature(master overview / rust-api / postgres / redis / audit pipeline)

### Phase 7 — 維護(對齊 [DESIGN §10 Phase 7](INTEGRATION-DESIGN.md);持續性)

- [ ] wire 細節對齊 feature(status / gender 等,走 CDP 全功能巡檢)
- [ ] upstream rebase feature(定期 `git rebase upstream/example`(base-web)+ `upstream/main`(rust-api))
- [ ] graphify 圖譜更新 feature(P4 完跑 `graphify update`,refresh manifest + GRAPH_REPORT)
- [ ] 依需求啟用觀察性 alert / 升 acme.sh 真實 cert / 等

---

## 5. 跨 feature 待驗證項

實作 Phase 1-5 各 feature 時必須對齊的不變式(權威源:`MOCK-COVERAGE-AUDIT.md` §4)。

### 5.1 wire envelope 與型一致性

- [ ] **envelope**:`{data, code, msg}`(無 `success` bool);`code` 是 string `"0000"` not number(§4.1)
- [x] **paginated**:`{current, size, total, records}`(無 `pages` 欄)(§4.9 已驗)
- [ ] **Role.id** 型(統一策略待 §11.10 拍板):mock string vs TS number
- [ ] **MenuType enum**:1=directory / 2=menu(非舊推測「1=group / 2=page」)(§4.2.1)
- [ ] **Status nullable**:`CommonRecord.status: EnableStatus | null` rust-api 須支援(§4.2.2)
- [ ] **MenuRoute.id** 型:string;`getUserRoutes` 供應時帶 string id(§4.13.1)

### 5.2 role / 帳號 / token

- [ ] **role 常量**:`R_SUPER` / `R_ADMIN` / `R_USER_COMMON`(非 rev1 `ROLE_SUPER`)(§4.4)
- [ ] **預設帳號**:依 §11.1 拍板(含 User → User01 alias 機制)
- [ ] **JWT payload**:mock `data` 是 array `[{userName}]`;rev2 可自訂或保持(待 §11.10 決)(§4.5)
- [ ] **apifoxToken**:寫死於 `src/service/request/index.ts:17` + `src/service-alova/request/index.ts:37`;依 §11.4 拍板處理(§4.8)

### 5.3 auth flow

- [ ] **login**:`{userName, password}` request、response envelope wrap `{token, refreshToken}`(§4.12.1)
- [ ] **refresh rotation**:每次同時換新 token + 新 refreshToken(§4.12.2)
- [ ] **stale token**:`/auth/getUserInfo` 須支援 stale 但未 expired token(page reload restore session)(§4.12.3)
- [x] **logout 無 endpoint**:rust-api 不實作 `/auth/logout`,業務只走 frontend `resetStore()`(§4.12.4 已驗)
- [ ] **refresh critical 紀律**:`/auth/refreshToken` 絕對不回 `9999/9998/3333`(§4.11)

### 5.4 dynamic mode(若 §11.7 選 dynamic)

- [ ] `/route/getConstantRoutes` + `/route/getUserRoutes` + `/route/isRouteExist` 三 endpoint 完整實作
- [ ] `getUserRoutes` 必含 `home` 欄(e.g. `"home"`)(§4.13)
- [ ] `VITE_AUTH_ROUTE_MODE` 切換機制(預設 `static`)

### 5.5 base-web 環境配置

- [ ] `VITE_SERVICE_BASE_URL` 切到自家 rust-api(非 ApiFox);`.env` / `.env.test` / `.env.prod` 三檔(FOLLOWUP §3.3 / MOCK §6.2)
- [ ] `pageExcludePatterns`(若 §11.5 選 b'-narrow):隱藏 alova / demo menu

### 5.6 業務驗證 error code

- [ ] rev2 業務驗證錯誤自訂 `5xxx`(refresh 絕不回 9999/9998/3333);具體區段待 §11.10 拍板

### 5.7 base-web wrapper 軌道(若 §11.3 拍板 (B))

- [ ] `BASE-WEB-WRAPPER`:新增 `src/service/api/rev2-system-manage.ts`(write wrapper)
- [ ] `MODAL-WIRING`:6-10 檔 modal/drawer 內 `// request` 一行改為 `await fetchCreateXxx()`
- [ ] `BASE-WEB-BUILD-CONFIG`(若 §11.5 b'-narrow):動 `build/plugins/router.ts` 加 `pageExcludePatterns`

### 5.8 alova 7 endpoint(若 §11.2 選實作)

- [ ] `sendCaptcha` / `verifyCaptcha` / `addUser` / `updateUser` / `deleteUser` / `batchDeleteUser` / `getLastTime`

### 5.9 mock 驗證 follow-up(優先級低)

- [ ] §3.1 `getMenuList` v1 與 v2 差異確認(base example 只用 v2)
- [ ] §10.3 #5 mock `/route/getConstantRoutes` 偶發 502 根因(ApiFox quota / rate-limit / cache invalidation)
- [ ] §7.3.M1 完整登入流程 CDP 驗證(手動填 / 驗證碼 / 註冊 / reset 密碼 / wechat 綁定)
- [ ] §7.3 「项目配置」endpoint 探索(優先級低)

---

## 6. 軌道授權快查(SOP 注入用)

> **完整 5 軌道定義**:[DESIGN §7 軌道](INTEGRATION-DESIGN.md#§7-base-web-受管例外軌道) + [§11.9 拍板表](INTEGRATION-DESIGN.md#§119-軌道清單最終確認)
> **本節只列關鍵警示**,SOP hook 每次 session 注入時 Claude / user 快查用:

- **BASE-WEB-BUILD-CONFIG ★**(DESIGN §7.3):允許動 `build/plugins/router.ts` 加 `pageExcludePatterns`,僅限「隱藏 demo menu」邊界
- **MODAL-WIRING ★**(DESIGN §7.4):允許動 `views/manage/*/modules/*-operate-{modal,drawer}.vue` 內 `// request` 一行,僅限「接 wrapper call」邊界

★ 兩條軌道**必須在 constitution v1.0.0 顯式授權**並寫明邊界、理由。其他 3 條軌道(BASE-WEB-ADAPT / BASE-WEB-WRAPPER / RUSTAPI-SOURCE-ISOLATION)為新增或全新寫、不違反直覺紀律。
