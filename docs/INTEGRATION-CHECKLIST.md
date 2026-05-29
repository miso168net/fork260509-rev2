# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:**Phase 1 P0 部署基建全數完成(#1~#5)**;**Phase 2 P1 進行中 — 007-db-redis-connection(DB/Redis 連線層 + migration proof)、008-response-envelope(統一回應信封 `Res<T>` + `BizCode` 矩陣 + `AppError` + 404 fallback)、009-soft-delete-infra(soft-delete 三重防護:trait / facade / build-time lint + `sys_user` proof)、010-migration-auto-apply(dev/prod stack `up` 自動套 migration + `service_completed_successfully` fail-fast 閘門)、011-audit-log(統一 audit 基礎設施:`sys_operation_log` 表 + `mutate_in_txn` 唯一原子寫入入口 + redact,以 `sys_user soft_delete` 作活體 proof)皆完整實作+驗收+merge 回 `rev2-admin-root`**。Phase 2 餘:soft-delete 6-entity rollout(各自被建時沿用 pattern)/ audit 其他 operation·entity 接線(沿用 011 `mutate_in_txn` pattern)/ sub-crate(需 §11.6 拍板);**JWT 機密管理已由 005/007 吸收 ✅**(見 [§4 Phase 2](#phase-2--p1-基礎設施對齊-design-§10-phase-2integration-designmd已啟動))。

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- **2026-05-29 011-audit-log 完整實作 + 驗收 + merge**(SHA pin `5a72560` / rust-api worktree 7 commits `8838579..5a72560` 已 push fork;**兩段式 commit**)— subagent-driven-development(4 unit / 15 task,各 spec+quality 雙審 + opus final holistic review = READY TO MERGE)/ 統一 audit 基礎設施:`sys_operation_log` 表(migration 004、經 010 自動套、append-only 非 SoftDeletable)+ `audit.rs` 純資料層(`AuditEvent`/`AuditOperation`/`AuditSerialize` + **`mutate_in_txn` codebase 首個 transaction、唯一原子寫入入口**、不含 `entity::`)+ `facade/sys_operation_log::write_in_txn`(唯一 entity 寫入管道、保 009 lint route b)/ 活體 proof:`sys_user::soft_delete` 接 `mutate_in_txn` 同 txn 原子寫 SOFT_DELETE + redact password→`"<redacted>"` + 回傳 `Result<bool>`(false=0-rows no-op)/ **live-DB 抓修真實 bug**:`operator_ip` INET 欄 `Set(None)` 觸 PG 42804 → 改 `None→NotSet`(Some-path Phase3 defer)/ 測試:redact + write_in_txn SQL-build 純單測 + 3 `#[ignore]` live 驗收(1筆redact / 原子rollback / 0-rows no-op)親驗 / 守 007 FR-009 + 009 facade 邊界(lint 續綠) / scope:只 SOFT_DELETE 接線、無 HTTP middleware、無其他 entity rollout、漏-audit build-lint defer follow-up / Constitution 7+7=14 ✅ / 011 branch 保留
- **2026-05-29 010-migration-auto-apply 完整實作 + 驗收 + merge**(outer merge `e4ff2b2`;**outer-only**、無兩段式 commit)— subagent-driven-development(5 unit / 9 task,各 spec+quality 雙審 + final holistic review = Ready)/ dev/prod stack `up` 自動套 sea-orm migration、API 起來前完成、失敗 fail-fast:一次性 `migrate` service(dev 覆寫 entrypoint→`cargo run --bin migration up`;prod `command [migration,up]` 經 entrypoint dispatcher)+ `rust-api depends_on migrate: service_completed_successfully` 閘門 / 守 007 FR-009(server 不自動 migrate、grep 0 命中)/ dev US1(自動套+冪等 no-op)、prod US2(對齊、001/002/003 與 dev 一致)、fail-fast US3(migrate Exited 非0→rust-api 未起、up 非0)三向 acceptance 親驗 / 附帶修 `deploy/Dockerfile.rust-api.txt`(009 加 entity workspace member 後 builder 漏 COPY、擋 runtime build;Deviation D-1、user 授權、仍 outer-only)/ Constitution 7+7=14 ✅ / 010 branch 保留 / 補掉 §2.10 prod migration path + §2.12 dev 自動套 gap
**下一步**: **Phase 2 P1 續推** — 連線層 + envelope + JWT 機密(005/007 吸收 ✅)+ soft-delete 機制(009 立 trait/facade/lint + sys_user proof ✅)+ audit 基礎設施(011 立 `mutate_in_txn` 唯一原子寫入入口 + redact + sys_user soft_delete proof ✅)已就緒;餘 soft-delete 6-entity rollout(各 entity 建立時沿用 pattern,含 sys_user 完整欄 + `id` auto_increment,見 §2.10)/ **audit 其他 operation·entity 接線(沿用 011 `mutate_in_txn` pattern,各業務寫入路徑建立時 rollout)** / 「facade 內漏配 audit」build-failing lint(011 defer 的 follow-up,待多寫入路徑時立)/ sub-crate(需 §11.6 拍板)等 [DESIGN §10 Phase 2](INTEGRATION-DESIGN.md) feature

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
- [x] **migration invocation prod path** ✅ (2026-05-29,010 補掉):dev migrate override `cargo run --bin migration up`、prod migrate override `command [migration,up]` 經 entrypoint dispatcher,兩路徑皆於 010 stack up 時自動套用、prod acceptance 親驗(Phase 5 cleanup-job / CI migration step 沿用 prod path)
- [ ] **URL secret 驗證邊界**(`validate_secret` 為 opaque token 設計、套用到連線 URL 的已知 gap;research R4 知情、決定不另造 URL validator):(a) `.example` 的 `CHANGE_ME` 內嵌於 URL,而 `validate_secret` 是 case-insensitive **全等**比對(非 substring)+ URL >32 → 誤用 `.example` 會過 boot、拖到 connect 才以隱晦 auth error 失敗(⚠️ Unit 1 review「加 `CHANGE_ME` 進 `PLACEHOLDER_SECRETS`」**無效**,全等語意擋不住內嵌 substring);(b) 未來若用無密碼 redis(短 URL <32)會以 `length<32` 失敗、訊息與 URL 無關;(c) migration `main.rs` 讀 URL 為 raw(不過 validate),與 server `load_secret` 有意分流。日後若要強化:URL 專屬 validator 或 substring placeholder 偵測

### 2.11 feature 008-response-envelope follow-up

- [ ] **`Res` err 建構子綁 `()` 型**:`Res::<()>::err`/`err_msg` 掛 `impl Res<()>`;Phase 3+ handler 若要在 `-> Res<SomeDto>` 成功型內提早回業務錯誤(`data:null` 但 `T≠()`)會型別對不上 → 屆時改 `impl<T> Res<T>`(回 `data:None`)。現無 caller、不改(final review Minor 標記)

### 2.12 feature 009-soft-delete-infra follow-up

- [x] **dev stack 不自動套 migration** ✅ (2026-05-29,010 補掉):010 新增一次性 `migrate` service + `rust-api depends_on migrate: service_completed_successfully` 閘門,dev/prod `up` 時自動套 migration、API 起來前完成、失敗 fail-fast;009 發現的手動 migration gap 已解(守 007 FR-009、server 仍不自動 migrate)
- [ ] **`soft_delete` 0-rows 靜默**:`soft_delete(db,id)` 回 `UpdateResult` 但不檢 `rows_affected` → 軟刪不存在/已刪 id 靜默成功(0 rows)。infra 層 scope 內 acceptable;Phase 3+ 接業務 delete endpoint 時由 caller 決定語意(final review Minor 標記)

### 2.13 feature 010-migration-auto-apply follow-up

- [ ] **standalone `docker-compose.rust-api.yml` 無自動套 migration**:010 只在 master dev/prod stack 加 `migrate` service + 閘門;standalone 單服務 stack(niche dev aid)未加 → 拉起時 schema 不自動套。010 明確列 scope 外(spec「不在 scope」/ research R1)。優先級低,日後若常用 standalone 再補同款 migrate gate
- [ ] **full prod stack 端到端 first-boot 未一起驗**:010 prod acceptance 用 subset(`up rust-api` 帶起 postgres/redis-stack/migrate,未起 base-web/front-nginx — prod base-web build 慢且與 migrate gate 無關)。migrate gate + prod migrate path 已親驗;但含 front-nginx(depends_on base-web+rust-api healthy)的完整 prod stack 首啟 + migrate 未一次跑通 → 與 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)(prod base-web rebuild + CDP smoke)連動、屆時一併驗
- [ ] **(跨 feature 守則)加 rust workspace member(新 crate)的 feature,acceptance 須含 runtime image build**:009 加 `entity` crate 只用 dev bind-mount 驗、漏 `deploy/Dockerfile.rust-api.txt` builder COPY,缺口拖到 010 prod build 才抓到(已修,plan Deviation D-1)。日後再加 crate 須同步 Dockerfile builder COPY + 把 runtime build 納入該 feature acceptance(僅加 entity 模組到既有 crate 不受影響)

### 2.14 feature 011-audit-log follow-up

- [ ] **「facade 內漏配 audit」build-failing lint defer**:011 D3/FR-008 明確延後 — audit 寫入正確性現靠 `mutate_in_txn`(唯一原子寫入入口)結構強綁 + 文件慣例,**無**像 009 entity-access 那樣的 build-failing lint 擋「facade 寫入路徑漏寫 audit」。Phase 3+ 多寫入路徑(其他 operation·entity 接線)時連同 rollout 立可靠 grep 規則(research R6 / [DESIGN §6.4](INTEGRATION-DESIGN.md))
- [ ] **`operator_ip` 真實 INET 值寫入的 PG 42804 gap**:live-DB 抓到 `Set(None)` 對 INET 欄觸 42804(`NULL::text`),已改 `None→NotSet`;但 `Some(ip)→Set(text)` 分支**仍會**對 INET 觸 42804(text binding)。本 feature 永遠寫 None、不觸;Phase 3 middleware 帶入真實 `operator_ip` 時須改 sea_query `Expr` cast 或 sea-orm ipnetwork custom type(`facade/sys_operation_log.rs` 內已註;DESIGN §6.4 as-built)
- [ ] **整合測試 harness 偏離 [verification §0.1](../specs/011-audit-log/contracts/verification-commands.md) route (a)**:`server` 為 bin-only crate(無 lib.rs)→ `server/tests/` 無法 `use server::...`,故 011 live-DB 驗收改用 **in-crate `#[cfg(test)] #[ignore]` + env-gate DATABASE_URL** 測試(放 `facade/sys_operation_log.rs`、lint 豁免目錄),非合約原訂 `server/tests/` harness。日後若要真正的 `tests/` 整合 harness 驅動 crate API,需給 server 加 lib target(lib.rs)— 屬更廣架構決策、未在 011 副帶引入(final review 認可此偏離)

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
- [x] **soft-delete 基礎設施 feature(009)** ✅ (2026-05-29 merge `88312b6`)— 立三重防護機制(SoftDeletable trait / facade 唯一管道 / build-failing lint)+ 套 `sys_user` proof(`deleted_at` + partial unique index);新增 workspace member `entity` crate。6 entity rollout 延後(各自被建時沿用 pattern)
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

### 5.10 SQL injection 紀律(Phase 3+ 業務 query 用)

- [ ] **user input 一律走 sea-orm parameterized builder**(`.filter(Col.eq(x))` / `.col_expr` / `ActiveModel` → 自動 `$1` 綁定);**絕不** `execute_unprepared(format!("… {user_input} …"))`
- [ ] **DDL / 識別字(表/欄/index 名)無法 bind param** → 若需動態名須自驗 / quote-identifier(現有 009/010 DDL 全靜態、無此風險)
- 現況零注入面:009 facade `soft_delete` 已參數化(`WHERE "id"=$1`)、009/010 migration 全靜態 DDL;唯一內插 = 002 seed `{hash}`(靜態值 + argon2 字元集無單引號 + 已註解警告,安全例外)。注意:009 facade/lint 守的是 soft-delete 過濾不變式、**非** injection 防護(injection 防護靠參數化、非走 facade)

---

## 6. 軌道授權快查(SOP 注入用)

> **完整 5 軌道定義**:[DESIGN §7 軌道](INTEGRATION-DESIGN.md#§7-base-web-受管例外軌道) + [§11.9 拍板表](INTEGRATION-DESIGN.md#§119-軌道清單最終確認)
> **本節只列關鍵警示**,SOP hook 每次 session 注入時 Claude / user 快查用:

- **BASE-WEB-BUILD-CONFIG ★**(DESIGN §7.3):允許動 `build/plugins/router.ts` 加 `pageExcludePatterns`,僅限「隱藏 demo menu」邊界
- **MODAL-WIRING ★**(DESIGN §7.4):允許動 `views/manage/*/modules/*-operate-{modal,drawer}.vue` 內 `// request` 一行,僅限「接 wrapper call」邊界

★ 兩條軌道**必須在 constitution v1.0.0 顯式授權**並寫明邊界、理由。其他 3 條軌道(BASE-WEB-ADAPT / BASE-WEB-WRAPPER / RUSTAPI-SOURCE-ISOLATION)為新增或全新寫、不違反直覺紀律。
