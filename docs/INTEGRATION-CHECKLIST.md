# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:rev2 重建中、骨幹搭建完成、設計拍板進行中(spec-kit 第一個 feature **尚未啟動**)。

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- 2026-05-28 constitution v1.0.0 + Phase 0 歸檔 + CHECKLIST §2.1 拍板項歸檔(commit `b0ec406` + `35b8861`)
- **2026-05-28 DESIGN §4.6 Phase 0 對稱盤點 baseline 固化**(本次 commit)— 6 項規格(application.yaml / 11 secret / Casbin seed / migration / sys_user / graphify)回填、CHECKLIST §2.2 歸檔

**下一步**(優先序):
1. **啟動 P0 第一個 spec-kit feature**(dockerfile-rust-api,對應 rev1 W-F1)— 走 CLAUDE.md §3 階段 0 brainstorm(`docs/superpowers/001-dockerfile-rust-api.md`)→ 階段 1 `/speckit-specify`(自動建 `001-dockerfile-rust-api` feature branch)
2. `/speckit-plan` 步將自動對照 [constitution v1.0.0](../.specify/memory/constitution.md) 跑 Compliance Check(§IV 7 項 yes/no)+ 引用 [DESIGN §4.6](INTEGRATION-DESIGN.md) baseline

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

---

## 3. 已完成里程碑

完整 commit 里程碑歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)(append-only、不在 SOP 注入,避免本檔膨脹)。

§1「最新進展」滾動最近 2 條;歷史在 MILESTONES.md 永久保留。歸檔流程見 [CLAUDE.md §7.5](../CLAUDE.md)。

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + [`INTEGRATION-DESIGN.md` §10 各 Phase](INTEGRATION-DESIGN.md)。本節為動態 status 追蹤;feature 詳細描述見 DESIGN §10。

### Phase 0 — 設計拍板 ✅ 全完成+已歸檔 (2026-05-28)

### Phase 1 — P0 部署基建(對齊 [DESIGN §10 Phase 1](INTEGRATION-DESIGN.md);尚未啟動)

- [ ] rust-api Dockerfile feature
- [ ] base-web Dockerfile feature
- [ ] TLS 憑證 skeleton feature
- [ ] 容器 port 與編排 feature(2XXXX port)
- [ ] secret 注入機制 feature(`_FILE` pattern)

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
