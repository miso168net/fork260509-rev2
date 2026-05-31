# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:**Phase 1 部署基建 全數完成(001~006)**;**Phase 2 後端基礎設施 全數完成(007~012)**;**Phase 3 RBAC 起手(013-auth-login-enforce)✅ + 014-dynamic-routes ✅ + 015-audit-middleware ✅ 皆已落地 + merge**(013=認證地基 login/getUserInfo/JWT/refresh + 首個 Casbin enforce 點 allow+deny + 首條真 base-web↔rev2 CDP wire;014=base-web 翻 dynamic auth route mode + 3 route endpoint〔getConstantRoutes 公開/getUserRoutes·isRouteExist JWT〕+ **業務 menu 可見性走 Casbin enforce 過濾**〔menu-visibility policy 9 rows + 013 enforcer + tree-prune,§I.2〕+ CDP Super-vs-User 側欄 menu deny 端到端;015=請求層 request-context middleware + 兩 append-only 審計表〔sys_access_log/sys_login_attempt〕+ 首個 xdb 消費者 + 真值 INET client_ip);**Phase 3 續做** = enforce 全路由 rollout + 完整 policy 矩陣 / 受管 RBAC policy 層〔casbin_rule soft-delete/protected/audit/CRUD〕/ axum-casbin fuller rewrite / redis pub-sub policy 失效通知(見 §1 下一步)。**JWT 機密管理已由 005/007 吸收 ✅**(見 [§4 Roadmap Phase 2](#4-roadmap--phase-狀態))。

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- **2026-06-01 015-audit-middleware 完整實作 + 驗收 + merge**(merge `589a553` / SHA pin `cff9785` / rust-api worktree 9 commits `a736072..cff9785` push fork + 外層 deploy/compose + SHA-pin commit;**兩段式 commit**)— **請求層審計基建**。subagent-driven-development(19 task/3 US,各 spec+quality 雙審 + opus final holistic review = READY TO MERGE)/ request-context middleware(client_ip 直連 ConnectInfo / XFF 原始逐字 / region xdb / trace_id uuid / operator_id JWT,塞 request extension)+ 兩 **append-only** 審計表:sys_access_log(已認證請求、**operator 閘門一條件實現 FR-001/FR-002**)/ sys_login_attempt(登入成敗各一筆、2 index FR-008)+ **首個 xdb 消費者**(`XDB_FILEPATH` + prod Dockerfile COPY 11MB ip2region.xdb,解 [§2.15](#215-feature-012-sub-crate-setup-follow-up))+ **首個真值 INET client_ip**(sea-orm `with-ipnetwork` / `ipnetwork 0.20`、避 42804,解 [§2.14](#214-feature-011-audit-log-follow-up) 解法)+ best-effort 寫入不破業務(FR-003、warn-only)/ **acceptance 全綠**:US1 access-log(getUserInfo→1 筆、公開/health 不寫、client_ip 真 inet)+ US2 login-attempt(成功 operator_id=user_id / 失敗 attempted_user_name+NULL)+ US3 脈絡忠實(XFF verbatim / client_ip≠XFF leftmost / region 内网IP / trace reuse)+ SC-004 best-effort(CHECK(false) 注入→業務仍 200)+ **prod image build region 非 NULL** / 守 007 FR-009 + 008 + 009 lint(17,2 新 facade 在 facade/)/ 既有不破(server 65+xdb 9)/ Constitution v1.1.0 §IV 8/8 ✅ / 015 branch 保留
- **2026-05-30 014-dynamic-routes 完整實作 + 驗收 + merge**(SHA pin `8965c8a` / rust-api worktree 7 commits `f65105e..c4b1d7e` push fork + base-web `.env` dynamic `41f44b18` push fork;**兩段式 commit**)— **Phase 3 #2:base-web 翻 dynamic auth route mode + 業務 menu 走 Casbin enforce 過濾(§I.2)**。subagent-driven-development(13 task,各 spec+quality 雙審 + opus final holistic review = READY TO MERGE)/ 3 endpoint:getConstantRoutes(公開、constant 5 條)/ getUserRoutes(JWT、handler 內過濾:roles_for_user→`filter_routes_for_roles`〔enforcer + tree-prune〕→{routes,home})/ isRouteExist(JWT、依角色 allow+deny);route 定義程式內(對齊 base-web elegant-router `$` 複合格式、§I.5 未 grep rev1)/ menu-visibility policy `p,role,route_name,menu` migration 010 seed **9 rows**(D3:Super5+Admin3+User1、父層 manage tree-prune 不 seed、經 010 自動套)/ enforce 決策 + tree-prune test-first 6 新單測(MemoryAdapter)/ **acceptance 全綠**:三 endpoint curl(三角色不同 menu + 3333 + isRouteExist **User manage_role deny**)+ **CDP dynamic-mode 瀏覽器 smoke(Super 側欄「系统管理」vs User 只「首页」= menu deny 端到端)**/ dynamic mode 副作用:demo menu 不送→§11.5 moot / 守 007 FR-009 + 009 lint(17)+ 008 / 無新 dep/表/crate / prod build 驗綠 / 既有不破(server 56+3〔+6 filter 測試〕+ xdb 9)/ Constitution 7+7=14 ✅ + Deviation D-001(§I.2 re-scope)/D-002(menu row 8→9 文件修正)/ 014 branch 保留
**下一步**: **Phase 3 起手:013 + 014 + 015-audit-middleware ✅ 皆已落地 + merge** — 013 認證地基 + 首個 enforce 點;014 dynamic mode + 3 route endpoint + menu 走 enforce 過濾;015 請求層審計 middleware + 兩 append-only 審計表(解 §2.14 解法/§2.15)。**Phase 3 續做**([DESIGN §10 Phase 3](INTEGRATION-DESIGN.md)):#3 redis pub-sub(policy/route 失效通知)/ #4 完整 policy 矩陣 + 全路由 endpoint enforce rollout / #5 axum-casbin fuller rewrite(metrics/error/observability)/ #6 受管 RBAC policy 層(casbin_rule soft-delete 可復原 / protected / 走 011 audit / CRUD;**需 fork sea-orm-adapter 的 `load_policy`/`remove_*` + casbin_rule 加 deleted_at → 須評估 §11.6 Amendment**)。Phase 2 餘(非獨立 feature):soft-delete 6-entity rollout(含 sys_user 完整欄 + `id` auto_increment,見 §2.10)/ audit 其他 operation·entity 接線(沿用 011 `mutate_in_txn` pattern)

---

## 2. Follow-up Backlog

### 2.1 §11 設計拍板項索引 ✅ 全完成+已歸檔 (2026-05-27)

> **兩條鐵紀律**(已凍結於 [constitution v1.0.0](../.specify/memory/constitution.md) §I):
> 1. **base-web 為權威** — base-web 有的功能、rust-api 都要實作(設計範圍嚴格)
> 2. **menu 權限 Casbin enforce** — rev2 核心突破,即使動 base-web 也要做

完整 12 拍板項與軌道授權細節見 [DESIGN §11](INTEGRATION-DESIGN.md);spec-kit `/speckit-plan` 將自動對照 constitution 跑 Compliance Check。

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

- [x] **`Res` err 建構子綁 `()` 型** ✅ (2026-05-30,013 收口):`err`/`err_msg` 已移到 `impl<T> Res<T>`(`envelope.rs:27/47/56`),013 handler(login/getUserInfo 在 `-> Res<Dto>` 成功型內提早回業務錯誤 `data:null`)即用;envelope.rs:178 測試註解標明、§2.16 亦記「§2.11 follow-up 收口」。

### 2.12 feature 009-soft-delete-infra follow-up

- [x] **dev stack 不自動套 migration** ✅ (2026-05-29,010 補掉):010 新增一次性 `migrate` service + `rust-api depends_on migrate: service_completed_successfully` 閘門,dev/prod `up` 時自動套 migration、API 起來前完成、失敗 fail-fast;009 發現的手動 migration gap 已解(守 007 FR-009、server 仍不自動 migrate)
- [x] **`soft_delete` 0-rows 靜默** ✅ (2026-05-29,011 收口):011 把 `soft_delete` 改回 `Result<bool, DbErr>`(`facade/sys_user.rs:70`),0-rows→`Ok(false)` 顯式 surfaced(不再靜默成功、不寫 audit),caller 可據以判斷;原「回 `UpdateResult` 不檢 `rows_affected`」前提已不成立。

### 2.13 feature 010-migration-auto-apply follow-up

- [ ] **standalone `docker-compose.rust-api.yml` 無自動套 migration**:010 只在 master dev/prod stack 加 `migrate` service + 閘門;standalone 單服務 stack(niche dev aid)未加 → 拉起時 schema 不自動套。010 明確列 scope 外(spec「不在 scope」/ research R1)。優先級低,日後若常用 standalone 再補同款 migrate gate
- [ ] **full prod stack 端到端 first-boot 未一起驗**:010 prod acceptance 用 subset(`up rust-api` 帶起 postgres/redis-stack/migrate,未起 base-web/front-nginx — prod base-web build 慢且與 migrate gate 無關)。migrate gate + prod migrate path 已親驗;但含 front-nginx(depends_on base-web+rust-api healthy)的完整 prod stack 首啟 + migrate 未一次跑通 → 與 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)(prod base-web rebuild + CDP smoke)連動、屆時一併驗
- [ ] **(跨 feature 守則)加 rust workspace member(新 crate)的 feature,acceptance 須含 runtime image build**:009 加 `entity` crate 只用 dev bind-mount 驗、漏 `deploy/Dockerfile.rust-api.txt` builder COPY,缺口拖到 010 prod build 才抓到(已修,plan Deviation D-1)。日後再加 crate 須同步 Dockerfile builder COPY + 把 runtime build 納入該 feature acceptance(僅加 entity 模組到既有 crate 不受影響)。**(2026-05-30 [006-013 review](REVIEW-006-013.md#4-跨-feature-主題比單點-issue-更有價值) 再確認為頭號系統性缺口:009/012 兩度被咬)→ ✅ 已固化進 [CLAUDE.md §3「Phase 1 verification-commands.md 紀律」](../CLAUDE.md):凡新增 workspace crate 的 feature,`contracts/verification-commands.md` 必含一條 prod target image build(`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`),`/speckit-plan` 產 contracts 時即帶。守則續為常設(故不打勾)**

### 2.14 feature 011-audit-log follow-up

- [ ] **「facade 內漏配 audit」build-failing lint defer**:011 D3/FR-008 明確延後 — audit 寫入正確性現靠 `mutate_in_txn`(唯一原子寫入入口)結構強綁 + 文件慣例,**無**像 009 entity-access 那樣的 build-failing lint 擋「facade 寫入路徑漏寫 audit」。Phase 3+ 多寫入路徑(其他 operation·entity 接線)時連同 rollout 立可靠 grep 規則(research R6 / [DESIGN §6.4](INTEGRATION-DESIGN.md))
- [ ] **`operator_ip` 真實 INET 值寫入的 PG 42804 gap**:live-DB 抓到 `Set(None)` 對 INET 欄觸 42804(`NULL::text`),已改 `None→NotSet`;但 `Some(ip)→Set(text)` 分支**仍會**對 INET 觸 42804(text binding)。本 feature 永遠寫 None、不觸;Phase 3 middleware 帶入真實 `operator_ip` 時須改 sea_query `Expr` cast 或 sea-orm ipnetwork custom type(`facade/sys_operation_log.rs` 內已註;DESIGN §6.4 as-built)。**(2026-06-01:015 已驗證 `ipnetwork::IpNetwork` + sea-orm `with-ipnetwork` 為解法、落地於兩新審計表 client_ip 真值 INET;此處既有 `sys_operation_log.operator_ip` 真值 retrofit 仍 defer。)**
- [ ] **整合測試 harness 偏離 [verification §0.1](../specs/011-audit-log/contracts/verification-commands.md) route (a)**:`server` 為 bin-only crate(無 lib.rs)→ `server/tests/` 無法 `use server::...`,故 011 live-DB 驗收改用 **in-crate `#[cfg(test)] #[ignore]` + env-gate DATABASE_URL** 測試(放 `facade/sys_operation_log.rs`、lint 豁免目錄),非合約原訂 `server/tests/` harness。日後若要真正的 `tests/` 整合 harness 驅動 crate API,需給 server 加 lib target(lib.rs)— 屬更廣架構決策、未在 011 副帶引入(final review 認可此偏離)
- [x] **`data-model.md` 文件回填債(`operator_ip` `None→NotSet`)** ✅ (2026-05-30):011 為避 INET 42804 把實作改 `None→NotSet`(略過欄),`specs/011-audit-log/data-model.md:59` 已補 as-built 修正註(NotSet 非 Set(None)、INET bind `NULL::text` 觸 42804、`Some(ip)` 真值寫入仍待 Phase 3 cast)。([006-013 review §3/§4.5](REVIEW-006-013.md);CLAUDE.md §7.2 回填紀律)

### 2.15 feature 012-sub-crate-setup follow-up

- [x] **prod Dockerfile.rust-api.txt builder 漏 COPY sea-orm-adapter + xdb** ✅ (2026-05-29 發現+已修+prod build 驗綠)— builder stage 逐 crate 顯式 COPY,012 加的 2 個 workspace member 未補 → prod runtime image manifest 解析失敗(`cargo build --release --bins`)。**dev bind-mount 整個 `rust-api/` 遮住缺口、012 acceptance 只用 dev docker**,違反 [§2.13](#213-feature-010-migration-auto-apply-follow-up) 跨 feature 守則(加 crate 須驗 runtime image build)。同 010 D-1 class。修:builder 補 COPY sea-orm-adapter/{Cargo.toml,src} + xdb/{Cargo.toml,src,**benches**}(xdb `[[bench]] search` 宣告使 cargo manifest parse 階段需 `benches/search.rs` 存在、否則 parse error)、實跑 `--target runtime` build 驗綠(release 40.88s、image 生成)
- [ ] **xdb 未用 deps**:`tracing`/`tracing-subscriber` 在 xdb crate 零引用(rev1 拷貝死 dep);動 xdb 時清(或保 rev1 一致)
- [x] **xdb runtime 資料檔路徑 + 打包** ✅ (2026-06-01,015 處理):server 首個 xdb 消費者,`XDB_FILEPATH=/app/xdb/resources/ip2region.xdb`(dev bind-mount / prod image COPY 同路徑)+ prod runtime Dockerfile COPY `ip2region.xdb`;boot `searcher_init` 顯式指路;T019 prod build + 容器內已認證請求 region 非 NULL 驗證通過。
- [ ] **(trivial)** `sea-orm-adapter/src/action.rs` `remove_filtered_policy` 修正行的 `.iter()` 換行非 rustfmt-canonical(刻意保最小 diff、避免擾動 vendored 碼);動該檔時 `cargo fmt` 收
- [x] **`action.rs:78` 正確性修正 inline 註解** ✅ (2026-05-30):補了防 rebase-revert 的 inline 註解(說明 `rule.values` 不可再切 `[index..]`、只 `COLUMNS` 偏移)。**更正 review §2.15 不準確處**:012 `plan.md` 的 **Deviation Log D-1 早已存在**(plan.md:151-155,完整記了此索引偏移修正),非「未留」;缺的只是檔內 inline 註解,現已補。([006-013 review §3/§4.5](REVIEW-006-013.md))

### 2.16 feature 013-auth-login-enforce follow-up

- [ ] **token 簽發 DRY**(final review nit #2):`login` 與 `refresh_token` 各自 inline 簽 access+refresh(兩處重複),可抽 `issue_tokens(state,user_id,roles)->LoginToken` helper。非正確性風險(divergence 會被 US1/US3 acceptance 立即抓),最小機制階段 inline 反而清楚 access/refresh secret·TTL 配對 → defer,待第 4 條簽發路徑出現再抽。
- [ ] **`sys_user` facade `audit_json()` 未含 `nick_name`**(final review minor):013 加了 nick_name 欄但 soft-delete audit snapshot 未納入(顯示名、非敏感、現無害)。屬 soft-delete feature scope → 待 soft-delete 6-entity rollout(§2.10)接續時把 nick_name 補進 audit 快照。
- [ ] **user-enumeration timing side-channel**(Deviation D-003):login 的 user-not-found 路徑跳過 argon2 verify(快)、wrong-password 走 argon2(慢)= username 列舉 timing oracle。此威脅模型(admin panel、固定 3 帳號 seed、無公開註冊)下 note-and-defer;未來真用戶註冊流程落地時,標準緩解 = not-found 路徑對固定 dummy hash 做一次 argon2 verify 等化時序。
- [ ] **prod `/api` wire(§11.11)+ prod-stack CDP smoke**:013 的 CDP smoke 走 **dev 直連**(vite dev proxy `/proxy-default`→`rust-api:21081`、base-web `.env.test`)。§11.11 拍板 prod 主流為 front-nginx `/api/*` reverse proxy;prod base-web build(`VITE_SERVICE_BASE_URL=/api`)+ front-nginx 打 rust-api 的端到端 CDP 仍待驗,連動 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)(prod base-web rebuild + CDP smoke)。
- [x] **`bearer_token` 重複**(final review nit #1)✅ (2026-05-30):已抽到 `server/src/auth/bearer.rs` 共用(handler/auth.rs + enforce.rs 共用、4 單測移轉),消除 auth 解析碼 drift 風險。
- [x] **JWT `iss` 未驗證註解**(final review nit #3)✅ (2026-05-30):`jwt.rs` verify 已加註解說明 iss 為 informational、不驗(base-web token opaque、僅 secret+aud 須一致、`JWT_ISS==JWT_AUD`);未加冗餘 set_issuer。

### 2.17 feature 014-dynamic-routes follow-up

- [ ] **auth handler 前導 DRY**(T010 quality review):`get_user_routes`/`is_route_exist`(014)+ `get_user_info`(013)+ `enforce_mw` 四處重複 bearer→`jwt::verify`(access+JWT_AUD)→roles 前導(+失敗收斂 3333)。非正確性風險(drift 會被 acceptance 抓),最小機制階段 inline 清楚 → defer,待 enforce 全路由 rollout(§4 #4)多 handler 出現時抽 `verify_and_load_roles(state,headers)` helper(與 [§2.16](#216-feature-013-auth-login-enforce-follow-up) token-簽發 DRY 同類)。
- [ ] **tree-prune 父層偵測為結構性**(T004 quality review):`manage` 父層永不自身 enforce 判定、可見性純由子項衍生(現正確:manage 無自身 menu policy)。未來若 sys_menu 化 / 巢狀 menu 需「父層有自身可見性閘、獨立於子項」則須改寫(連動 [§4 Phase 3](#4-roadmap--phase-狀態) #4 全路由矩陣 / #6 受管 policy / Phase 4 菜單樹建構)。
- [ ] **dynamic-mode CDP 僅 dev proxy + Admin 中階僅單測層**(final review):014 CDP smoke 走 dev vite proxy(`/proxy-default`、同 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.8](#28-feature-004-compose-port-orchestration-follow-up)),瀏覽器只斷言 Super(全)vs User(只 home)、Admin 部分集由單測覆蓋。prod front-nginx `/api` + dynamic-mode 側欄渲染、Admin 中階瀏覽器斷言待補,連動上述 prod-stack CDP 條目。

### 2.18 constitution §I.6 SCHEMA-AUDIT-COLUMNS retrofit

- [ ] 既有表(`sys_user`/`sys_role`/`sys_user_role` …)審計欄 `*_by` 缺口 retrofit — 標準已凍結 [constitution §I.6](../.specify/memory/constitution.md)(v1.1.0、forward-only);範圍/排程見 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md)。replay 015+ 建表時直接帶 6 欄、免 retrofit。

### 2.19 feature 015-audit-middleware follow-up

- [ ] **經 front-nginx 的 XFF/client_ip 端到端未驗**(plan N-6 緩解未執行):015 acceptance 只證了 code 邏輯 —— U7 prod 用 `docker exec rust-api curl 127.0.0.1:21081` **直打容器內**(client_ip=127.0.0.1 loopback、region 内网IP)、dev US3 用 curl **手動注入假 XFF**(client_ip=docker bridge 172.x)。**真實 nginx 拓樸**(front-nginx 設 `X-Forwarded-For=$proxy_add_x_forwarded_for`、rust-api 看到 nginx 私有 IP 為 peer、真實 client 在 XFF leftmost)的端到端從未跑;FR-006「region 由直連 peer 非 XFF」的價值只在代理後才顯現 → 待補經 front-nginx 活體驗,連動 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)/[§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up) prod-stack CDP
- [ ] **`ctx_mw` = 第 5 處 bearer→`jwt::verify`→operator 重複**(承 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up) 同主題、plan N-5 明確 defer):待 enforce 全路由 rollout([§4 Phase 3](#4-roadmap--phase-狀態) #4)抽 `verify_and_load_*(state,headers)` helper 時一併收 `ctx_mw`
- [ ] **`sys_access_log` 無 index**(data-model §1 conscious deferral):「某 operator 何時存取什麼」查詢現走 seq-scan(append-only 低流量 admin panel 可接受)。日後 access-log 查詢 feature(Phase 4+)或觀察性(Phase 6)需要時加 `(operator_id, created_at)` index(對照 `sys_login_attempt` 已有 2 lockout index)

## 3. 已完成里程碑

完整 commit 里程碑歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)(append-only、不在 SOP 注入,避免本檔膨脹)。

§1「最新進展」滾動最近 2 條;歷史在 MILESTONES.md 永久保留。歸檔流程見 [CLAUDE.md §7.5](../CLAUDE.md)。

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + [`INTEGRATION-DESIGN.md` §10 各 Phase](INTEGRATION-DESIGN.md)。本節為動態 status 追蹤;feature 詳細描述見 DESIGN §10。

### Phase 0 — 設計拍板 ✅ 全完成+已歸檔 (2026-05-28)

### Phase 1 — 部署基建 ✅ 全完成+已歸檔 (2026-05-28)

> 5 feature 全交(001 rust-api Dockerfile `a21e932` / 002 base-web Dockerfile `a70fa5f` / 003 TLS cert `cb5e1a1` / 004 compose 編排 `b4294c7` / 005 secret 注入 `068b2a8`),各 feature branch 保留供 audit;詳細 deliverable 見 [DESIGN §10 Phase 1](INTEGRATION-DESIGN.md) + [MILESTONES](INTEGRATION-MILESTONES.md)。

### Phase 2 — 後端基礎設施 (**7/7 全完成**) ✅ 全完成 (2026-05-29)

- [x] **DB/Redis 連線層 + migration pipeline proof feature(007)** ✅ (2026-05-29 merge `928949d`)— rust-api boot 連 Postgres+Redis(fail-fast)+ AppState + migration runner + sys_user proof seed
- [x] **envelope 對齊 feature(008)** ✅ (2026-05-29 merge `7bdf5bb`)— `Res<T>{data,code,msg}` + `IntoResponse` + `BizCode` 12-variant 矩陣 + `AppError`(NotFound→404/Internal→500)+ axum 404 `.fallback()`;camelCase 留 Phase 4 DTO
- [x] **JWT 機密管理** ✅ (已由 005 secret 注入 + 007 config 吸收,非獨立 feature)— `AppConfig::load()` 載 `APP_JWT_JWT_SECRET`/`APP_JWT_REFRESH_TOKEN_SECRET`(`_FILE` precedence + `validate_secret` 空/placeholder/≥32)+ `JwtConfig`(含 TTL)+ compose dev/prod 接線 + secrets `.example` + 單測(見 [DESIGN §6.1](INTEGRATION-DESIGN.md))
- [x] **soft-delete 基礎設施 feature(009)** ✅ (2026-05-29 merge `88312b6`)— 立三重防護機制(SoftDeletable trait / facade 唯一管道 / build-failing lint)+ 套 `sys_user` proof(`deleted_at` + partial unique index);新增 workspace member `entity` crate。6 entity rollout 延後(各自被建時沿用 pattern)
- [x] **migration auto-apply feature(010)** ✅ (2026-05-29 merge `e4ff2b2`;outer-only)— dev/prod stack `up` 自動套 sea-orm migration:一次性 `migrate` service + `rust-api depends_on migrate: service_completed_successfully` 閘門、API 起來前完成、失敗 fail-fast;守 007 FR-009(server 不自動 migrate)。補掉手動 migration gap
- [x] **audit log 基礎設施 feature(011)** ✅ (2026-05-29 merge `2be489f` / SHA pin `5a72560`)— 統一 audit:`sys_operation_log` 表(migration 004、經 010 自動套、append-only 非 SoftDeletable)+ `mutate_in_txn` 唯一原子寫入入口 + `AuditSerialize` redact;`sys_user soft_delete` 活體 proof(同 txn 原子寫 SOFT_DELETE + redact password)。守 007 FR-009 + 009 facade 邊界(lint 續綠)。其他 operation·entity 接線 / 漏-audit lint 延後(見 [§2.14](#214-feature-011-audit-log-follow-up))
- [x] **sub-crate setup feature(012)** ✅ (2026-05-29 merge `774f7b3` / SHA pin `e193c47`)— 拷貝 `sea-orm-adapter` + `xdb`(rev1@0b64a57、§11.6/§I.5 授權例外、首個拷貝 feature)+ casbin **bump 2.10→2.20.0**(編譯閘門零 drift;research R2 修正 brainstorm 的「async-std→tokio」誤判 — adapter 既有 `runtime-tokio-rustls` default)+ casbin_rule 建表 migration 005(委派 adapter up/down 單一 schema 來源、stock schema 無 soft-delete、經 010 自動套)+ 兩 crate 活體 smoke(adapter round-trip / xdb 1.2.4.8)。附帶修 rev1 潛伏 bug `remove_filtered_policy` 索引重複偏移(Deviation D-1)。**`axum-casbin` 重寫 + 受管 policy 層重定位 Phase 3**(見 [§2.15](#215-feature-012-sub-crate-setup-follow-up) follow-up)

### Phase 3 — 認證 + 動態選單(進行中)

- [x] **登入 + getUserInfo feature(013)** ✅ (2026-05-30 merge `ade723d` / SHA pin `bbabdbc`)— login/getUserInfo/refresh + JWT(HS256)+ **首個 Casbin enforce 點**(rev2 自家 axum middleware、allow+deny)+ sys_role/sys_user_role/nick_name + 首條真 base-web↔rev2 CDP wire;follow-up 見 [§2.16](#216-feature-013-auth-login-enforce-follow-up)
- [x] **dynamic mode 路由 feature(014)** ✅ (2026-05-30 merge `9d06347` / SHA pin `8965c8a`)— 3 route endpoint(`getConstantRoutes` 公開 / `getUserRoutes`·`isRouteExist` JWT、過濾在 handler 內)+ base-web 翻 dynamic + **menu 走 Casbin enforce 過濾**(menu-visibility policy 9 rows + 013 enforcer + tree-prune)+ CDP menu deny 端到端;follow-up 見 [§2.17](#217-feature-014-dynamic-routes-follow-up)
- [x] **audit-middleware feature(015)** ✅ (2026-06-01 merge `589a553` / SHA pin `cff9785`)— request-context middleware + 2 append-only 審計表(sys_access_log/sys_login_attempt)+ 首個 xdb 消費者 + 真值 INET client_ip;19 task/3 US、server 65+lint 17+xdb 9 + dev/prod acceptance 全綠;follow-up 見 [§2.19](#219-feature-015-audit-middleware-follow-up)(解 [§2.14](#214-feature-011-audit-log-follow-up)/[§2.15](#215-feature-012-sub-crate-setup-follow-up))
- [ ] Casbin redis pub-sub 啟用 feature(v1 即啟用)
- [ ] policy seed feature(三 role × 主流 endpoint)(**013 已做第一刀**:migration 009 seed 示範路由 × {R_SUPER,R_ADMIN};本 feature = 完整矩陣)
- [ ] **axum-casbin 重寫 feature**(2026-05-29 從 Phase 2 §11.6 重定位:Casbin Axum enforce 中介層 + rev2 自家 metrics/error/observability;需真實受保護路由才驗得了)(**013 已做第一刀**:`auth/enforce.rs` 最小機制 middleware + 單示範路由;本 feature = 全路由 rollout + observability)
- [ ] **受管 RBAC policy 層 feature**(012 brainstorm 衍生:casbin policy 加 (a) soft-delete 可復原 (b) 不可刪 protected policy (c) policy 變更走 011 audit 記 operator (d) 統一 CRUD facade。需 fork sea-orm-adapter 的 load/remove → 動 §11.6「adapter=拷貝」前提、specced 時評估 Amendment;與 axum-casbin 重寫同期、因皆需 enforce/operator)

### Phase 4 — 主流業務(尚未啟動)

- [ ] manage list endpoints feature(6 read endpoint,對齊 mock)
- [ ] wire shape mapping feature(Output DTO + `From<Entity>` + pagination wrapper)
- [ ] alova-only endpoint 處理 feature(依 §11.2 拍板)
- [ ] 菜單樹建構 feature(parent_id → nested children)

### Phase 5 — 補位 + 抽離項(尚未啟動)

- [ ] refresh token 完整實作 feature(`sys_tokens` rotation_chain)
- [ ] 抽離項 stub feature(`/auth/error` / `/auth/sendCaptcha` / `/auth/verifyCaptcha`)
- [ ] cleanup-job feature(dry-run 預設 + cron + 最小權 credential)

### Phase 6 — 觀察性(可選,生產 ready)

- [ ] obs-min feature(promtail + loki + grafana,純 log)
- [ ] obs-full feature(+ prometheus + 3 exporter + pushgateway + grafana alerting)
- [ ] dashboard provisioning feature(master overview / rust-api / postgres / redis / audit pipeline)

### Phase 7 — 維護(持續性)

- [ ] wire 細節對齊 feature(status / gender 等,走 CDP 全功能巡檢)
- [ ] upstream rebase feature(定期 `git rebase upstream/example`(base-web)+ `upstream/main`(rust-api))
- [ ] graphify 圖譜更新 feature(P4 完跑 `graphify update`,refresh manifest + GRAPH_REPORT)
- [ ] 依需求啟用觀察性 alert / 升 acme.sh 真實 cert / 等

---

## 5. 跨 feature 待驗證項

實作 Phase 1-5 各 feature 時必須對齊的不變式(權威源:`MOCK-COVERAGE-AUDIT.md` §4)。

### 5.1 wire envelope 與型一致性

- [x] **envelope**:`{data, code, msg}`(無 `success` bool);`code` 是 string `"0000"` not number(§4.1)— rust-api 側 ✅ 008 已實作(21 單測 + 404 curl 鎖形狀);**end-to-end base-web 消費 ✅ 013 CDP 證**(login/getUserInfo envelope unwrap + `code` 分流 + LS `SOY_token`,auth endpoint 端到端);其餘 endpoint 隨 Phase 3+/4 接線續驗
- [x] **paginated**:`{current, size, total, records}`(無 `pages` 欄)(§4.9 已驗)
- [ ] **Role.id** 型(統一策略待 §11.10 拍板):mock string vs TS number
- [ ] **MenuType enum**:1=directory / 2=menu(非舊推測「1=group / 2=page」)(§4.2.1)
- [ ] **Status nullable**:`CommonRecord.status: EnableStatus | null` rust-api 須支援(§4.2.2)
- [x] **MenuRoute.id** 型:string;`getUserRoutes` 供應時帶 string id(§4.13.1)— ✅ 014(`MenuRoute.id:String`=route name、serde camelCase、curl + CDP 驗)

### 5.2 role / 帳號 / token

- [x] **role 常量**:`R_SUPER` / `R_ADMIN` / `R_USER_COMMON`(非 rev1 `ROLE_SUPER`)(§4.4)— ✅ 013 sys_role seed + getUserInfo 回 + enforce 用
- [x] **預設帳號**:依 §11.1 拍板(含 User → User01 alias 機制)— ✅ 013 sys_user_role seed(1→SUPER/2→ADMIN/3→USER_COMMON)+ getUserInfo `nick_name` alias(User→User01)
- [ ] **JWT payload**:mock `data` 是 array `[{userName}]`;rev2 可自訂或保持(待 §11.10 決)(§4.5)
- [ ] **apifoxToken**:寫死於 `src/service/request/index.ts:17` + `src/service-alova/request/index.ts:37`;依 §11.4 拍板處理(§4.8)

### 5.3 auth flow

- [x] **login**:`{userName, password}` request、response envelope wrap `{token, refreshToken}`(§4.12.1)— ✅ 013(camelCase、curl + CDP 驗)
- [x] **refresh rotation**:每次同時換新 token + 新 refreshToken(§4.12.2)— ✅ 013 refresh 簽新 access+refresh(**最小無狀態**;持久化 rotation_chain + `sys_tokens` 留 Phase 5)
- [ ] **stale token**:`/auth/getUserInfo` 須支援 stale 但未 expired token(page reload restore session)(§4.12.3)
- [x] **logout 無 endpoint**:rust-api 不實作 `/auth/logout`,業務只走 frontend `resetStore()`(§4.12.4 已驗)
- [x] **refresh critical 紀律**:`/auth/refreshToken` 絕對不回 `9999/9998/3333`(§4.11)— ✅ 013 失敗一律 `8888`(curl grep 驗無 3333/9999/9998)

### 5.4 dynamic mode(§11.7 已選 dynamic;✅ 014 落地)

- [x] `/route/getConstantRoutes` + `/route/getUserRoutes` + `/route/isRouteExist` 三 endpoint 完整實作 — ✅ 014(curl + CDP 驗;menu 走 Casbin enforce 過濾)
- [x] `getUserRoutes` 必含 `home` 欄(e.g. `"home"`)(§4.13)— ✅ 014(`UserRoute.home="home"`)
- [x] `VITE_AUTH_ROUTE_MODE` 切換機制(預設 `static`)— ✅ 014 翻 `dynamic`(base-web `.env`、BASE-WEB-ADAPT、兩段式 commit)

### 5.5 base-web 環境配置

- [~] `VITE_SERVICE_BASE_URL` 切到自家 rust-api(非 ApiFox);`.env` / `.env.test` / `.env.prod` 三檔(FOLLOWUP §3.3 / MOCK §6.2)— **dev(`.env.test`,`pnpm dev` 走 --mode test)✅ 013 切 `http://rust-api:21081`**(vite proxy);**prod `.env.prod`→`/api` 仍待**(front-nginx reverse proxy + base-web rebuild,見 [§2.16](#216-feature-013-auth-login-enforce-follow-up) / [§2.8](#28-feature-004-compose-port-orchestration-follow-up))
- [ ] `pageExcludePatterns`(若 §11.5 選 b'-narrow):隱藏 alova / demo menu

### 5.6 業務驗證 error code

- [ ] rev2 業務驗證錯誤自訂 `5xxx`(refresh 絕不回 9999/9998/3333);具體區段待 §11.10 拍板 — 008 已釘 `5000`=infra sentinel、`5001-5999` 留業務(**013 已用 `5003`「权限不足」= 首個 5xxx 業務碼**,enforce deny;base-web 對非列舉碼 fallback toast 不登出)

### 5.7 base-web wrapper 軌道(若 §11.3 拍板 (B))

- [ ] `BASE-WEB-WRAPPER`:新增 `src/service/api/rev2-system-manage.ts`(write wrapper)
- [ ] `MODAL-WIRING`:6-10 檔 modal/drawer 內 `// request` 一行改為 `await fetchCreateXxx()`
- [~] `BASE-WEB-BUILD-CONFIG`(若 §11.5 b'-narrow):動 `build/plugins/router.ts` 加 `pageExcludePatterns` — **014 dynamic mode 下 moot**(getUserRoutes 只送業務 route、demo menu 根本不送 → 不需隱藏;此 ★ 軌道在 dynamic 維持下不需動,見 [DESIGN §10 Phase 3 #2](INTEGRATION-DESIGN.md))

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

- **BASE-WEB-BUILD-CONFIG ★**(DESIGN §7.3):允許動 `build/plugins/router.ts` 加 `pageExcludePatterns`,僅限「隱藏 demo menu」邊界(**014 dynamic mode 下 moot:demo menu 不送、不需隱藏**;此軌道在 dynamic 維持下未觸發)
- **MODAL-WIRING ★**(DESIGN §7.4):允許動 `views/manage/*/modules/*-operate-{modal,drawer}.vue` 內 `// request` 一行,僅限「接 wrapper call」邊界

★ 兩條軌道**必須在 constitution v1.0.0 顯式授權**並寫明邊界、理由。其他 3 條軌道(BASE-WEB-ADAPT / BASE-WEB-WRAPPER / RUSTAPI-SOURCE-ISOLATION)為新增或全新寫、不違反直覺紀律。
