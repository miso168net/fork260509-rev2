# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:**Phase 1 P0 部署基建全數完成(#1~#5)**;**Phase 2 P1 進行中 — 007-db-redis-connection(DB/Redis 連線層 + migration proof)、008-response-envelope(統一回應信封 `Res<T>` + `BizCode` 矩陣 + `AppError` + 404 fallback)皆完整實作+驗收+merge 回 `rev2-admin-root`**。Phase 2 餘:soft-delete 7-entity / audit log(依 soft-delete)/ sub-crate(需 §11.6 拍板);**JWT 機密管理已由 005/007 吸收 ✅**(見 [§4 Phase 2](#phase-2--p1-基礎設施對齊-design-§10-phase-2integration-designmd已啟動))。

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- **2026-05-29 008-response-envelope 完整實作 + 驗收 + merge**(outer merge `7bdf5bb` / SHA pin `e1b0a6c` / rust-api worktree `fac12f6` 已 push fork)— subagent-driven-development(3 unit / 13 task,各 spec+quality 雙審 + final holistic review = Ready)/ 統一回應信封 `Res<T>{data,code,msg}`(code=string、無 success、欄位序 data→code→msg)+ `IntoResponse`(HTTP200)/ `BizCode` 完整 12-variant 矩陣(只 wire `0000`/`4040`/`5000`,餘 9 variant 定義待 Phase 3+)/ `AppError`(thiserror;NotFound→404、Internal(String)→500/`5000`)+ axum `.fallback()`(404 live curl `{"data":null,"code":"4040","msg":"接口不存在"}`)/ `/health` 純 ok 不動 / 21 單測 PASS / 2 拍板(Internal=`5000` rev2 自訂 5xxx sentinel、不做 camelCase 機制留 Phase 4 DTO)/ Constitution 7+7=14 ✅ / 兩段式 commit / 008 branch 保留
- **2026-05-29 007-db-redis-connection 完整實作 + 驗收 + merge**(outer merge `928949d` / rust-api worktree `091fe6a` 已 push fork)— subagent-driven-development(5 unit / 18 task,各 spec+quality 雙審 + final review)/ rust-api boot fail-fast 建 Postgres(sea-orm 1.1.20)+ Redis(redis 1.2 `ConnectionManager`)連線、握 `AppState`;migration runner + proof migration(`sys_user` id/user_name/password + seed Super/Admin/User、argon2id of `123456`、冪等)/ docker-compose 接 005 secret(`_FILE`)/ config 12 單測 PASS、dev stack 5 service healthy / 2 偏離回填 plan.md(Cargo.lock pin time0.3.37・home0.5.9 配 toolchain1.86 / migration `DATABASE_URL` bridge)/ **兩段式 commit**(worktree→fork `44d20fb..091fe6a` + 外層 SHA pin `39eb43d`)/ Constitution 7+7=14 ✅ / 007 branch 保留

**下一步**: **Phase 2 P1 續推** — 連線層 + envelope + JWT 機密(005/007 吸收 ✅)已就緒;餘 soft-delete 7-entity 基礎設施(含 sys_user 完整欄 + `id` auto_increment,見 §2.10)/ audit log(依 soft-delete)/ sub-crate(需 §11.6 拍板)等 [DESIGN §10 Phase 2](INTEGRATION-DESIGN.md) feature

---

## 2. Follow-up Backlog

### 2.1 §11 設計拍板項索引 ✅ 全完成+已歸檔 (2026-05-27)

> **兩條鐵紀律**(已凍結於 [constitution v1.0.0](../.specify/memory/constitution.md) §I):
> 1. **base-web 為權威** — base-web 有的功能、rust-api 都要實作(設計範圍嚴格)
> 2. **menu 權限 Casbin enforce** — rev2 核心突破,即使動 base-web 也要做

完整 12 拍板項與軌道授權細節見 [DESIGN §11](INTEGRATION-DESIGN.md);spec-kit `/speckit-plan` 將自動對照 constitution v1.0.0 跑 Compliance Check。

> ### 2.2 ~ 2.7 全完成+已歸檔 (手動搬至 INTEGRATION-MILESTONES.md)

### 2.8 feature 004-compose-port-orchestration follow-up

- [ ] `redis/redis-stack-server:latest` 未 pin tag(spec FR-012 明訂 latest;reproducibility 風險,日後可 pin 具體 semver)
- [ ] base-web SPA 經 nginx 打 rust-api 端到端 CDP browser smoke(本 feature curl 直送驗 nginx 路由 ≠ browser 內 wire)— 已涵蓋於 Phase 4 wire feature + [§5.5](#55-base-web-環境配置)
- [ ] prod base-web 真打 `/api` 前須重 build:現存 `rev2-admin-base-web:latest` 是 002 default build-arg(ApiFox mock),prod profile 雖宣告 `VITE_SERVICE_BASE_URL=/api` 但 `up` 不自動 rebuild 既有 image → 需 `docker compose -f docker-compose.yml -f docker-compose.prod.yml build base-web`(或 `up --build`)(與上一條 CDP smoke 連動)

### 2.9 feature 006-docker-volume-naming follow-up ✅ 全完成+已歸檔 (2026-05-29)

### 2.10 feature 007-db-redis-connection follow-up

- [ ] **`sys_user.id` 無 auto_increment**:007 proof migration 用顯式 seed id 1/2/3,column 為 `big_integer().primary_key()` 無 sequence。Phase 3 login 唯讀不受影響,但 soft-delete(#2)做完整 7-entity schema 或任何「建 user」path 時須改 `auto_increment`/`BIGSERIAL`(final review 標記)
- [x] **CLAUDE.md §8.1 帳號名 stale** ✅ (2026-05-29):§8.1 已改為 rev2 權威 `Super/Admin/User`(id 1/2/3、runtime argon2id of `123456`)+ 修正 stale `m20241024_*` 路徑 → 真實 `m20260529_*` seed 檔 + 標明 role 為 Phase 3、sys_user 現僅 id/user_name/password
- [ ] **migration invocation prod path**:dev 用 cargo-watch image `cargo run --bin migration`;prod 須走 image entrypoint dispatch `migration`(Phase 5 cleanup-job / CI migration step 沿用 prod path、非 dev cargo path)
- [ ] **URL secret 驗證邊界**(`validate_secret` 為 opaque token 設計、套用到連線 URL 的已知 gap;research R4 知情、決定不另造 URL validator):(a) `.example` 的 `CHANGE_ME` 內嵌於 URL,而 `validate_secret` 是 case-insensitive **全等**比對(非 substring)+ URL >32 → 誤用 `.example` 會過 boot、拖到 connect 才以隱晦 auth error 失敗(⚠️ Unit 1 review「加 `CHANGE_ME` 進 `PLACEHOLDER_SECRETS`」**無效**,全等語意擋不住內嵌 substring);(b) 未來若用無密碼 redis(短 URL <32)會以 `length<32` 失敗、訊息與 URL 無關;(c) migration `main.rs` 讀 URL 為 raw(不過 validate),與 server `load_secret` 有意分流。日後若要強化:URL 專屬 validator 或 substring placeholder 偵測

### 2.11 feature 008-response-envelope follow-up

- [ ] **`Res` err 建構子綁 `()` 型**:`Res::<()>::err`/`err_msg` 掛 `impl Res<()>`;Phase 3+ handler 若要在 `-> Res<SomeDto>` 成功型內提早回業務錯誤(`data:null` 但 `T≠()`)會型別對不上 → 屆時改 `impl<T> Res<T>`(回 `data:None`)。現無 caller、不改(final review Minor 標記)

---

## 3. 已完成里程碑

完整 commit 里程碑歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)(append-only、不在 SOP 注入,避免本檔膨脹)。

§1「最新進展」滾動最近 2 條;歷史在 MILESTONES.md 永久保留。歸檔流程見 [CLAUDE.md §7.5](../CLAUDE.md)。

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + [`INTEGRATION-DESIGN.md` §10 各 Phase](INTEGRATION-DESIGN.md)。本節為動態 status 追蹤;feature 詳細描述見 DESIGN §10。

### Phase 0 — 設計拍板 ✅ 全完成+已歸檔 (2026-05-28)

### Phase 1 — P0 部署基建 ✅ 全完成+已歸檔 (2026-05-28)

> 5 feature 全交(001 rust-api Dockerfile `a21e932` / 002 base-web Dockerfile `a70fa5f` / 003 TLS cert `cb5e1a1` / 004 compose 編排 `b4294c7` / 005 secret 注入 `068b2a8`),各 feature branch 保留供 audit;詳細 deliverable 見 [DESIGN §10 Phase 1](INTEGRATION-DESIGN.md) + [MILESTONES](INTEGRATION-MILESTONES.md)。

### Phase 2 — P1 基礎設施(對齊 [DESIGN §10 Phase 2](INTEGRATION-DESIGN.md);已啟動)

- [x] **DB/Redis 連線層 + migration pipeline proof feature(007)** ✅ (2026-05-29 merge `928949d`)— rust-api boot 連 Postgres+Redis(fail-fast)+ AppState + migration runner + sys_user proof seed
- [x] **envelope 對齊 feature(008)** ✅ (2026-05-29 merge `7bdf5bb`)— `Res<T>{data,code,msg}` + `IntoResponse` + `BizCode` 12-variant 矩陣 + `AppError`(NotFound→404/Internal→500)+ axum 404 `.fallback()`;camelCase 留 Phase 4 DTO
- [x] **JWT 機密管理** ✅ (已由 005 secret 注入 + 007 config 吸收,非獨立 feature)— `AppConfig::load()` 載 `APP_JWT_JWT_SECRET`/`APP_JWT_REFRESH_TOKEN_SECRET`(`_FILE` precedence + `validate_secret` 空/placeholder/≥32)+ `JwtConfig`(含 TTL)+ compose dev/prod 接線 + secrets `.example` + 單測(見 [DESIGN §6.1](INTEGRATION-DESIGN.md))
- [ ] soft-delete 基礎設施 feature(7 entity + 三重防護)
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

- [ ] **envelope**:`{data, code, msg}`(無 `success` bool);`code` 是 string `"0000"` not number(§4.1)— rust-api 側 ✅ 008 已實作(21 單測 + 404 curl 鎖形狀),end-to-end base-web 回應層消費待 Phase 3+ endpoint
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

- [ ] rev2 業務驗證錯誤自訂 `5xxx`(refresh 絕不回 9999/9998/3333);具體區段待 §11.10 拍板 — 008 已釘 `5000`=infra sentinel、`5001-5999` 留業務

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
