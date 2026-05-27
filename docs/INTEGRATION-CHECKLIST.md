# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:rev2 重建中、骨幹搭建完成、設計拍板進行中(spec-kit 第一個 feature **尚未啟動**)。

**最新進展**(2026-05-27):
- rev1 編號標示與 rev2 軌道命名統一(commit `79d4725`,4 檔 258+/258-)。
- INTEGRATION-DESIGN.md 初版落地(12 段含 31 feature + 12 待拍板,commit `a9921eb`)。
- INTEGRATION-CHECKLIST.md 本檔落地(commit `8250629`)。
- **§11 12 待拍板全部完成**(本次 commit)— 4 輪 user 決策,鎖定「base-web 為權威 + menu Casbin enforce」兩條鐵紀律;軌道授權清單見 §6。

**下一步**(優先序):
1. **`.specify/memory/constitution.md` v1.0.0 撰寫**(目前 50 行空殼)— 凍結 §11 12 拍板項 + 5 軌道授權清單(§6)+ 兩條鐵紀律。
2. **啟動 P0 第一個 spec-kit feature**(dockerfile-rust-api,對應 rev1 W-F1)— 走 CLAUDE.md §3 階段 0 brainstorm(`docs/superpowers/001-dockerfile-rust-api.md`)→ 階段 1 `/speckit-specify`。
3. spec phase 0 對稱盤點(§2.2 6 項)在第一個 feature spec 前跑過一遍。

---

## 2. Follow-up Backlog

### 2.1 §11 設計拍板項索引(2026-05-27 完成、權威源:[DESIGN §11](INTEGRATION-DESIGN.md))

> **兩條鐵紀律**(constitution v1.0.0 將凍結):
> 1. **base-web 為權威** — base-web 有的功能、rust-api 都要實作(設計範圍嚴格)
> 2. **menu 權限 Casbin enforce** — rev2 核心突破,即使動 base-web 也要做

| § | 主題 | 拍板 |
|---|---|---|
| §11.1 | 預設帳號命名 | (b) `Super/Admin/User` 對齊 mock + 模仿 User→User01 alias |
| §11.2 | alova 7 endpoint | (a) 全實作 + 個別可 disabled flag |
| §11.3 ★ | modal CRUD 衝突 | (B) 升 L4 改 modal placeholder(MODAL-WIRING 啟用) |
| §11.4 | apifoxToken | (c) rust-api 寬容 unknown header |
| §11.5 ★ | alova menu | (b'-narrow) `pageExcludePatterns` 隱藏 demo(BASE-WEB-BUILD-CONFIG 啟用) |
| §11.6 | sub-crate | axum-casbin 重寫 + sea-orm-adapter / xdb 拷貝 |
| §11.7 | auth route mode | (b) dynamic(後端控 menu) |
| §11.8 | obs stack | (a) Phase 5 obs-min + Phase 6 obs-full |
| §11.9 | 軌道清單 | 5 軌道全啟用(BASE-WEB-ADAPT / WRAPPER / BUILD-CONFIG ★ / MODAL-WIRING ★ / RUSTAPI-SOURCE-ISOLATION) |
| §11.10 | wire 細節 | Role.id / MenuRoute.id = **string**、User alias 模仿、business error `5xxx` |
| §11.11 | prod path | (a) `/api/*` 主流 |
| §11.12 | brainstorm 位置 | (a) `docs/superpowers/<NNN>-<feature-name>.md` |
| §11.13 | login 替代入口 | (c) 全實作雙模 + v1 啟 stub mode |

★ = 違反「不動 inline / build 配置」直覺紀律、需 constitution v1.0.0 顯式授權。詳細理由 + 影響軌道見 DESIGN §11.X 對應 callout。

### 2.2 spec phase 0 對稱盤點(權威源:`INTEGRATION-RESEARCH.md` §7.2 L1263-1271)

- [ ] `application.yaml` placeholder 完整性(無 `<TO_BE_SET>` 殘留)
- [ ] `.env.example` + 11 個 secret 範本檔齊備(database_url / redis_url / jwt_secret / refresh_token_secret / cleanup_database_url 等)
- [ ] Casbin policy seed:3 role × 主流 endpoint 完整覆蓋
- [ ] migration files timestamp 連續、無 jump 或亂序
- [ ] `sys_user` 預設帳號命名(依 §11.1 拍板結果)
- [ ] `graphify-out/` 落地(依 §11.X 拍板時機,建議 Phase 4 完後)

### 2.3 workspace-level ⏳ 落地

- [ ] `.specify/memory/constitution.md` v1.0.0(目前 50 行空殼;凍結 §11 拍板項)
- [ ] `docker-compose.yml` + `docker-compose.{dev,prod}.yml` + `deploy/`(CLAUDE.md §8.2)
- [ ] `deploy/generate-dev-cert.sh`(self-signed TLS for dev)
- [ ] `deploy/secrets/`(env-file pattern,本機 dev 用)
- [ ] fork 源倉設 upstream remote(CLAUDE.md §4.6,目前未設、無法 `git fetch upstream`)
- [ ] `docs/GRAPHIFY-NOTES.md`(graphify 抽取限制與盲點筆記,圖譜跑完後)
- [ ] `specs/` 第一個 feature 目錄(P0 dockerfile-rust-api,§11 拍板後啟動)

---

## 3. 已完成里程碑

按 commit 倒序。

| commit | 日期 | 主題 |
|---|---|---|
| `79d4725` | 2026-05-27 | docs: 統一 rev1 編號標示與 rev2 軌道命名(4 檔 258+/258-) |
| `fbd8e3e` | 2026-05-27 | docs: INTEGRATION-DESIGN.md 補 followup §13.6 新事實 |
| `727cdd8` | 2026-05-27 | docs+test: A+B follow-up — alova 5 按鈕 code 矩陣 + bind-wechat 頁面驗證 |
| `8dad8ae` | 2026-05-27 | docs+test: followup §10.3 四項(logout / login / alova / framework) |
| `a9921eb` | 2026-05-27 | docs: INTEGRATION-DESIGN.md 初版(12 段 + 31 feature + 12 待拍板) |
| `522011e` | 2026-05-27 | docs: 同步 audit / research / followup 三檔 cross-ref(§10 列 16 處) |
| `855df4f` | 2026-05-26 | docs: INTEGRATION-RESEARCH-FOLLOWUP.md(Tier 1/2/3 八項深入研究) |
| `9d94bdb` | 2026-05-26 | docs: MOCK-COVERAGE-AUDIT.md(CDP 三段 capture + wire ground truth) |
| `4920323` | 2026-05-26 | test: tests/mock-coverage-audit/ CDP 工具與 step 規格 |
| `b983017` | 2026-05-26 | docs: INTEGRATION-RESEARCH.md(rev1 設計鏈萃取 + 30 superpowers 教訓) |
| `773d29f` | 2026-05-26 | docs: 000-base-web-docker-bootstrap(設計理由 + 4 輪 debug + CDP 登入驗證) |
| `24ed26d` | 2026-05-26 | feat(deploy): base-web docker-compose dev/prod profile + multi-stage Dockerfile |
| `d810aee` | 2026-05-25 | chore(submodule): 註冊 base-web + rust-api gitlink(首次 add) |
| `fee9f29` | 2026-05-25 | chore(submodule): .gitmodules 定義 base-web / rust-api |
| `428100f` | 2026-05-25 | chore(hook): SessionStart hook + SOP 腳本 |
| `8cb5d6b` | 2026-05-25 | docs: workspace 指引 CLAUDE.md(rev1 重建至 rev2) |
| `681df32` | 2026-05-25 | Add Spec-Kit presets / extensions / skills |

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + `INTEGRATION-DESIGN.md` §7.1 P0-P4 17 feature。

### Phase 0 — 設計拍板(進行中,blocker:§11 12 項待 user 決策)

- [x] INTEGRATION-RESEARCH.md(rev1 設計鏈萃取)
- [x] INTEGRATION-RESEARCH-FOLLOWUP.md(Tier 1/2/3 深入)
- [x] MOCK-COVERAGE-AUDIT.md(CDP wire ground truth)
- [x] INTEGRATION-DESIGN.md(12 段 + 31 feature + 12 待拍板)
- [x] INTEGRATION-CHECKLIST.md(本檔)
- [ ] §11 12 待拍板 user 決策(blocker)
- [ ] `.specify/memory/constitution.md` v1.0.0

### Phase 1 — P0 部署基建(尚未啟動)

- [ ] **W-F1** dockerfile-rust-api(Rust 1.86 multi-stage builder + cargo cache + libssl3 runtime + non-root uid 10001)
- [ ] **W-F2** dockerfile-base-web(Node 22 builder + nginx runtime + pnpm corepack + Vite BUILD_ARG + SPA fallback)
- [ ] **W-F6** TLS dev/prod cert skeleton(`generate-dev-cert.sh` + self-signed SAN + acme.sh daemon mode 預留)
- [ ] **W-F7** port-mapping 改 2XXXX(21080/21443/21081/25432/26379/23000/23090/29091,綁 127.0.0.1)

### Phase 2 — P1 基礎設施(尚未啟動)

- [ ] **F1.1** jwt-secrets(boot-time strict validation + `_FILE` 讀檔 + 6 placeholder 黑名單)
- [ ] **F2** audit-log-infrastructure(4 新欄 + operation enum + JSONB before/after + redaction + `DEFAULT 'LEGACY'`)
- [ ] **F3** soft-delete-infrastructure(7 entity + `deleted_at` + partial unique index + facade module + CI grep lint)
- [ ] **F4** response-shape-alignment(`{data, code, msg}` + `code` string `"0000"` + camelCase rename_all)

### Phase 3 — P2 認證 + 動態 menu(尚未啟動)

- [ ] **F5.1** auth-login + getUserInfo + getUserRoutes(含 Casbin enforce + TreeBuilder)
- [ ] **F6** route-guard(`/route/isRouteExist` 全域存在性檢查,無 role 依賴)
- [ ] **W-F11** Casbin redis pub-sub channel(`casbin:policy:invalidate`,v1 即啟用)

### Phase 4 — P3 主流業務(尚未啟動)

- [ ] **F7** manage-crud-alignment(5 讀 endpoint + Output DTO + camelCase + ROLE_ADMIN policy seed)
- [ ] **F8** assign-users(`/authorization/assign-users`,join table 為權威源 + set-semantics + soft-delete restore)
- [ ] **F9** systemManage-alias-router(10 alias + batchDeleteUser + 20 row policy seed)

### Phase 5 — P4 補位 + 抽離項(尚未啟動)

- [ ] **F11** extracted-stubs(`sendCaptcha` / `verifyCaptcha` / `error` / `getLastTime` 4 stub + 8 row policy seed)
- [ ] **F12** cleanup-job(dry-run 預設 + cron 觸發 + 最小權 credential + migration 文件化 psql role)
- [ ] **F13** rust-refresh-token-impl(`/auth/refreshToken` + JWT 驗 + rotation_chain + 舊 token 標 `used`)

### Phase 6 — graphify 圖譜建立(P4 完才跑)

- [ ] `graphify-out/` 首次落地(GRAPH_REPORT.md + graph.json + graph.html + obsidian/ vault + `docs/GRAPHIFY-NOTES.md`)

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
