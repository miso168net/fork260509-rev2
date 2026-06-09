# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:**Phase 1(001-006)+ Phase 2(007-012)全完成+已歸檔**。**Phase 3 RBAC 核心完成(行政收口)+ Phase 4 主流業務大部完成(013-026)**:認證地基(013 login/enforce·014 dynamic routes+menu 可見性·015 audit)、user/role/menu CRUD(016 list·017 user·018 role·020 menu·025 restore/re-parent)、menu DB-driven(019 sys_menu)、**menu/button/endpoint 三維權限 runtime 編輯**(021/022/023 + 024 rollout)、enforce_mw DB-fresh 角色(018)、**026 auth DRY refactor**,皆已 merge+推 origin。**Phase 3 兩條尾**:#5 axum-casbin 核心已被 013-026 吸收〔metrics 埋點 ✅ 032 obs-full、Phase 3 #5 完全收〕、**#6 受管 RBAC policy 治理層 ✅ 034 merge `8e95fa1`+推 origin(Phase 3 全收)**〔架構 B archive 表免 fork、§11.6 後端不觸、無 backend amendment〕。**Phase 5(補位 + 抽離項)全完成**:**027-refresh-token-rotation ✅** + **028-single-session-enforcement ✅**(per-account 可控 access 端單一-session:policy=開新登入即時踢舊〔`7777`「账号在他处登录」〕、關維持 027 多裝置、028 全站預設 off dormant;`Claims` +sid / pointer Redis+sys_user 混合 fail-open / 4 認證 gate + refresh pointer-first / policy 三態 + config;wire 中性、base-web 零改、無新端點/crate/amendment) + **029-single-session-admin-ui ✅**(系統預設 runtime 可調〔rev2 首張 `system_settings` KV + `settings_watcher` pub-sub〕+ 每帳號 policy UI + 設定頁〔MODAL-WIRING ★ (e) v1.6.0〕;不改 028 enforcement、雙倉、無新 crate) + **030-cleanup-job ✅**(on-demand `cleanup-job` binary 清過期 sys_token〔純過期 `expires_at<now-60s`、與 status 無關、dry-run 預設/`--execute`、`profile:[jobs]` + m030 索引 + host cron〕+ per-token `jti` 修同秒輪替 `token_hash` 撞鍵;純後端、base-web 零改、無新 crate、Constitution 8/8 PASS)。**Phase 6(觀察性)首刀 obs-min ✅**(031、log-only opt-in 堆疊 loki+alloy+grafana + request_id↔audit 對接、merge `3383828`)+ **第二刀 obs-full ✅**(032、metrics opt-in 堆疊 prometheus+2 exporter+pushgateway+grafana alert、rust-api `/metrics`+enforce allow/deny counter **閉 Phase 3 #5 enforce metrics 債**、merge `a13f85f`)+ **第三刀 dashboard-provisioning ✅**(033、6 張 grafana dashboard〔4 greenfield + 2 community pin〕provisioning、obs 從 Explore+alert-only 補成開 grafana 即見 6 板、merge `3d27cd5`)。**逐 feature deliverable/as-built 見 [§4 Roadmap](#4-roadmap--phase-狀態) + [DESIGN §10](INTEGRATION-DESIGN.md);merge 史見 [MILESTONES §1](INTEGRATION-MILESTONES.md)。**

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- **2026-06-08 033-dashboard-provisioning ✅ merge `3d27cd5`(--no-ff、保留 033 branch;13 commit〔4 spec-doc + 9 實作〕、base-web+rust-api 零改、無 worktree;全 outer deploy/grafana-provisioning + docs/specs)** — Phase 6 觀察性第三刀(dashboards):補完 031 log + 032 metrics 的「可看」面 —— obs 從 Explore + alert-only 變成開 grafana 即見 6 張現成監控板。6 板 = 4 greenfield(master-overview/rust-api/cleanup-job/audit-log、schemaVersion 39、貼真實 metric/log)+ 2 community pin(postgres postgres_mixin@v0.19.1 82% / redis grafana.com 763 rev6 100%);新 `deploy/grafana-provisioning/dashboards/`(provider yaml folder obs-full + 6 JSON in json/)+ loki.yml 補 uid:loki。**as-built live 修正**:R8 loki uid 需 `deleteDatasources`(直接改顯式 uid 會 crash-loop、persisted auto-gen uid;部署地雷)、R7 rust-api `| json` 需 `|~ \`^{\`` guard(cleanup-job docker-run 經 alloy image 污染 service=rust-api)。**純 grafana config、base-web+rust-api 零改、無 migration/crate/secret/compose service、Constitution 8/8 PASS、無 amendment**。acceptance C0-C5 + 守恆全綠、final review 0 issue;subagent-driven 6 板逐單元 spec+quality 雙審 + final holistic = merged(本機、未 push)。詳見 MILESTONES §1 / [DESIGN §10 Phase 6 #3](INTEGRATION-DESIGN.md)。
- **2026-06-09 034-managed-rbac-policy ✅ merge `8e95fa1`+推 origin(--no-ff、保留 034 branch;rust-api worktree `87e3d8a..a2a52fb` push fork + base-web `75f2a20..a5783df` push fork + 外層 SHA pin `9742878`;5 US/5 migration m031-m035)** — Phase 3 #6 受管 RBAC policy 治理層落地、**架構 B(archive 表、免 fork adapter、§11.6 後端不觸、無 backend amendment)**:US1 原子治理 facade(grant/revoke=soft-delete/restore + 011 audit 同 txn both-or-neither)/ US2 data-driven `protected`(退役 is_seed_menu、修 D13)/ US3 menu↔policy 同步(修 DRIFT-2/3/4、同名重建零繼承)/ US4 收斂三胞胎為 `set_role_dimension`(wire 逐位元組不變)/ US5 回收桶(2 端點 + base-web 頁 + D10)。server 245/0 failed + lint 17/5 + live governance 17 + prod image build GREEN + FR-014 讀決策不變 + CDP smoke 過。**Constitution US1-US4 全 PASS、US5 回收桶頁經 user 親決落 MODAL-WIRING use (e) v1.6.0 既有界、不需 v1.7.0 amendment**(DESIGN §11.25)。詳見 [DESIGN §10 Phase 3 #6](INTEGRATION-DESIGN.md) + [REVIEW-DATABASE](REVIEW-DATABASE.md)。

> 以下為預計`下一步` (不要再被合到`最新進展`了)

**下一步**: **035-policy-governance-hardening brainstorm spec-design 定案**(`5fc2cfb`、推 origin;034 follow-up 第一刀 = US1 restore audit 豐富化〔`RestoreOutcome::Restored` 帶 `{v0,v1,v2}`〕 + US2 no-op reload 跳過〔trait `PolicyMutated`、只跳明確 no-op〕,純 rust-api、無 migration/端點、base-web 零改)→ **待 user 手動 `/speckit-specify`** 從 rev2-admin-root 建 035 feature branch。其餘候選(擇期):obs prod 對外暴露+採集端硬化(§2.36)/ least-priv exporter+cleanup PG role(§2.35+§2.37)/ casbin archive 懸空 GC(D8、§2.39)。

---

## 2. Follow-up Backlog

### 2.1 §11 設計拍板項索引 ✅ 全完成+已歸檔 (2026-05-27)

> **兩條鐵紀律**(已凍結於 [constitution v1.0.0](../.specify/memory/constitution.md) §I):
> 1. **base-web 為權威** — base-web 有的功能、rust-api 都要實作(設計範圍嚴格)
> 2. **menu 權限 Casbin enforce** — rev2 核心突破,即使動 base-web 也要做

完整 12 拍板項與軌道授權細節見 [DESIGN §11](INTEGRATION-DESIGN.md);spec-kit `/speckit-plan` 將自動對照 constitution 跑 Compliance Check。

> ### 2.2 ~ 2.12 全完成+已歸檔 (手動搬至 INTEGRATION-MILESTONES.md)

### 2.13 feature 010-migration-auto-apply follow-up

- [ ] **standalone `docker-compose.rust-api.yml` 無自動套 migration**:010 只在 master dev/prod stack 加 `migrate` service + 閘門;standalone 單服務 stack(niche dev aid)未加 → 拉起時 schema 不自動套。010 明確列 scope 外(spec「不在 scope」/ research R1)。優先級低,日後若常用 standalone 再補同款 migrate gate
- [x] **full prod stack first-boot ✅ (2026-06-02)**:prod baseline `up --wait` 全 5 service(postgres/redis-stack/rust-api/base-web/front-nginx)healthy + **migrate Exited(0)**〔gate + `depends_on service_completed_successfully` chain 一次跑通〕+ :443 HTTPS 200(seeded 自簽 cert)+ :80→301 redirect→https
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

- [x] **token 簽發 DRY**(final review nit #2)✅ (2026-06-04,026 US2):已抽私有 `issue_tokens(user_id,roles,&JwtConfig)->Result<LoginToken,jwt::JwtError>`(`handler/auth.rs`、近 `LoginToken`),`login_attempt_inner`+`refresh_token` 兩處簽發收斂、各保留 `Err→Internal(5000)` 映射;純 refactor 行為零變(curl 等價 + round-trip 單測)。
- [x] **`sys_user` facade `audit_json()` 未含 `nick_name`** ✅ **早已解(2026-06-04 落地確認)**:`audit_json()`(facade `sys_user.rs:24-39`)**已含 `nick_name`**(@28)+ 全業務欄 + §I.6 審計欄 —— 應是 017 §I.6 retrofit 時 audit_json 重寫一併補,backlog 漏勾。此項 stale、無殘留(連同「6-entity rollout」幻影一併校正)。
- [ ] **user-enumeration timing side-channel**(Deviation D-003):login 的 user-not-found 路徑跳過 argon2 verify(快)、wrong-password 走 argon2(慢)= username 列舉 timing oracle。此威脅模型(admin panel、固定 3 帳號 seed、無公開註冊)下 note-and-defer;未來真用戶註冊流程落地時,標準緩解 = not-found 路徑對固定 dummy hash 做一次 argon2 verify 等化時序。
- [x] **prod `/api` wire ✅ (2026-06-02 prod-stack CDP)**:prod CDP via :443 攔截 17 API request 全走 `/api`(0 vite proxy)→ §11.11 prod 主流 front-nginx `/api/*` reverse proxy 端到端證實(login/getUserInfo/getUserRoutes/list/menu);Super dynamic-mode 側欄完整。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [x] **`bearer_token` 重複**(final review nit #1)✅ (2026-05-30):已抽到 `server/src/auth/bearer.rs` 共用(handler/auth.rs + enforce.rs 共用、4 單測移轉),消除 auth 解析碼 drift 風險。
- [x] **JWT `iss` 未驗證註解**(final review nit #3)✅ (2026-05-30):`jwt.rs` verify 已加註解說明 iss 為 informational、不驗(base-web token opaque、僅 secret+aud 須一致、`JWT_ISS==JWT_AUD`);未加冗餘 set_issuer。

### 2.17 feature 014-dynamic-routes follow-up

- [x] **auth handler 前導 DRY**(T010 quality review)✅ (2026-06-04,026 US1):已抽 `verify_bearer(headers,secret,aud)->Option<Claims>`(`auth/bearer.rs`),`get_user_info`/`get_user_routes`/`is_route_exist`/`enforce_mw`(+`ctx_mw`=[§2.19](#219-feature-015-audit-middleware-follow-up))五處 bearer→verify 前導收斂、各 callsite 保留失敗映射(fail-closed/advisory/best-effort 三策略已文件化於 `verify_bearer` doc-comment)。**roles 查詢段刻意留 inline**(3 變體+2 錯誤策略 CP 值低,Approach A 親決 → 落地為窄 `verify_bearer`、**非**設想的較寬 `verify_and_load_*`)。
- [ ] **tree-prune 父層偵測為結構性**(T004 quality review):`manage` 父層永不自身 enforce 判定、可見性純由子項衍生(現正確:manage 無自身 menu policy)。未來若 sys_menu 化 / 巢狀 menu 需「父層有自身可見性閘、獨立於子項」則須改寫(連動 [§4 Phase 3](#4-roadmap--phase-狀態) #4 全路由矩陣 / #6 受管 policy / Phase 4 菜單樹建構)。
- [~] **dynamic-mode prod /api + Super 側欄 ✅;Admin 中階 prod-CDP 仍輕 (2026-06-02)**:prod CDP via :443 證 dynamic-mode 走 front-nginx `/api`、Super 側欄完整階梯;**Admin 中階瀏覽器斷言未在 prod 單獨跑**(Super-vs-User 由 dev 014 CDP、Admin 部分集由單測覆蓋)。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)

### 2.18 constitution §I.6 SCHEMA-AUDIT-COLUMNS retrofit

- [x] 既有**業務主表** retrofit 6 審計欄缺口 — 對象 `sys_user` / `sys_role` 兩張(**✅ 皆 DONE**:sys_user 017 / sys_role 018)。**`sys_user` ✅ DONE(017,2026-06-02)**:migration 014 補 5 欄(`created_at`/`created_by`/`updated_at`/`updated_by`/`deleted_by`,`deleted_at` 009 已有),寫入路徑落實(`created_by` on insert / `updated_at`+`updated_by` 成對 on update / `deleted_at`+`deleted_by` 成對 on soft-delete、`*_by`=operator `i64` 由 015 ctx)。**`sys_role` ✅ DONE(018,2026-06-02)**:migration 016 補 7 欄(role_desc/status 業務 + §I.6 created_at/created_by/updated_at/updated_by/deleted_by;deleted_at 006 已有;**無 BIGSERIAL retrofit**——006 已 auto_increment),寫入路徑落實(create_role `created_by` on insert / update_role `updated_at`+`updated_by` 成對 col_expr DB-side / soft_delete `deleted_at`+`deleted_by` 成對、`*_by`=operator i64 由 015 ctx)。**`sys_user_role` 為 join 表、依 [§I.6 例外](../.specify/memory/constitution.md) 免**(append-only 三表 `sys_operation_log`/`sys_access_log`/`sys_login_attempt` + vendored `casbin_rule` 亦免)。標準已凍結 constitution §I.6(v1.1.0、forward-only);詳見 [DESIGN §10 Phase 4「審計欄 retrofit feature」](INTEGRATION-DESIGN.md);replay 015+ 新建表直接帶 6 欄、免 retrofit。

### 2.19 feature 015-audit-middleware follow-up

- [x] **經 front-nginx XFF/client_ip 端到端 ✅ (2026-06-02 prod-stack CDP)**:經 :443 login(含注入假 XFF `8.8.8.8`)→ `sys_access_log` 記 client_ip=front-nginx 容器 IP `172.22.0.6/32`、region=内网IP;**注入的 8.8.8.8 筆數=0** → 證 FR-006 region/client_ip 取直連 peer、非 XFF(代理後才顯現的價值、端到端證實)
- [x] **`ctx_mw` = 第 5 處 bearer→`jwt::verify`→operator 重複**(承 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up) 同主題)✅ (2026-06-04,026 US1):`ctx_mw` 改 `verify_bearer(headers,...).map(|c| c.user_id)`,第 5 處 bearer→verify 收斂、best-effort `operator_id=None` 語意不變。
- [ ] **`sys_access_log` 無 index**(data-model §1 conscious deferral):「某 operator 何時存取什麼」查詢現走 seq-scan(append-only 低流量 admin panel 可接受)。日後 access-log 查詢 feature(Phase 4+)或觀察性(Phase 6)需要時加 `(operator_id, created_at)` index(對照 `sys_login_attempt` 已有 2 lockout index)

### 2.20 feature 016-manage-role-user-list follow-up

- [x] **base-web id 型 number vs wire string:決定不修(accepted)** ✅ (2026-06-02):typings `Api.Common.CommonRecord.id: number` 與凍結 wire string 不符,但 **runtime 安全**(R5 grep 無 `Number()`/算術、NDataTable rowKey 容 string|number、016/017 CDP 證)。**乾淨 override 不可行** —— `CommonRecord` 是 `type` alias,TS declaration merging 只合併 `interface`/`namespace`、**不能 override `type` member 型**;真正修需動 upstream `common.d.ts`(`id:number→string`)+ ripple ~6 處 view 簽名(`handleDelete`/`edit`/auth-modal prop,user/role/menu)= 跨 BASE-WEB-ADAPT(改既有 typings)/ MODAL-WIRING(改 inline 簽名)邊界 + rebase 風險。→ **決定接受此宣告層 cosmetic 不一致、不修**;rev2 wrapper 沿對齊 call-site 實型(016/017 已證、零 runtime 影響)。(constitution §I.3 / DESIGN §11.10 殘留「rev2-extra.d.ts 補正」機制句屬同議題、見群 D:constitution 需 PATCH amendment 才改、本批不動。)
- [x] **`sys_user.id` 補 BIGSERIAL** ✅ (2026-06-02,017):migration 014 raw SQL `CREATE SEQUENCE`+`SET DEFAULT nextval`+`setval` 對齊既有 seed 1/2/3→next=4、entity `auto_increment=true` 成對,addUser 動態建列已可用、up→down→up 可逆驗(R2);**`sys_role.id` auto_increment=true 早已成立**,Phase 4 role 寫端(addRole)沿同 sequence 策略即可(此前 016 R10 標的 sys_user.id 缺 sequence 已解,解 [§2.10](#210-feature-007-db-redis-connection-follow-up))。
- [ ] **manage 另 3 read endpoint 留 Phase 4 續做**:getMenuList/v2 · getAllPages · getMenuTree 需先建 sys_menu 表(menu 目前走 014 程式內 route + Casbin menu policy、無 sys_menu 業務表);見 [§4 Phase 4](#4-roadmap--phase-狀態)。
- [x] **list 顯示經 front-nginx :21080 dev 入口 CDP 已驗**(部分解 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)):016 CDP 經 front-nginx :21080(dev stack)瀏覽器顯 3 user/3 role + null 欄不 crash(R5),**§2.8「base-web SPA 經 nginx 端到端 CDP」的 dev read-list 已證**。⚠️ **未逐一 network-inspect** 確認 API 子路徑走 `/api`(nginx `_locations.inc` strip → rust:21081)抑或 `location /`→base-web vite dev-proxy→rust(兩條 conf 皆通、結果都成功);prod base-web build(`VITE_SERVICE_BASE_URL=/api`)+ prod nginx `/api` strip 端到端 + 寫端/modal-wiring 仍待(§2.8 餘項續留)。

### 2.21 feature 017-manage-user-write follow-up

- [x] **base-web id 型 number vs wire string:決定不修(accepted)** ✅ (2026-06-02):見 [§2.20](#220-feature-016-manage-role-user-list-follow-up) 完整理由 —— 乾淨 override 不可行(CommonRecord 為 `type` alias)、runtime 安全;017 wrapper 已沿對齊 call-site 實型。
- [ ] **edit drawer `userName` 欄未在 DOM disabled**:immutability 由 server 端強制(UpdateReq 省 `user_name`、不動該欄)+ CDP 確認 userName 從不變;Q1 clarification 明示「前端唯讀屬 plan 接線細節」可選 + MODAL-WIRING ★ 不得改 form 結構 → **不 disabled 為正確**(非缺陷)。日後若做 base-web form 微調可順帶加 readonly UI 提示。
- [ ] **`batchDeleteUser` 空 `ids` → `0000` no-op**:UI 不可達(disabled-delete gate、無勾選時按鈕禁用)、benign;日後若新增可達路徑須補空陣列守衛。
- [x] **`sys_role` §I.6 審計欄 retrofit + role 寫端 CRUD** ✅ (2026-06-02,018):sys_role 7 欄 retrofit(migration 016)+ 4 Super-only 寫端(addRole/updateRole/deleteRole/batchDeleteRole)+ 種子保護(code-based)+ **status enforce 即時(B:enforce_mw 改 DB-fresh)**;見 [§2.22](#222-feature-018-manage-role-write-follow-up)。
- [x] **prod /api strip ✅ (2026-06-02)**:prod CDP via :443 /manage/user 經 `/api/systemManage/getUserList` 載入(走 front-nginx strip);user 寫端走同 `/api` strip(路徑無關),per-feature 寫端 modal CDP 未單獨 replay(017 dev CDP 已驗 + 020 menu 寫端 CDP 為逐字鏡像、已證)。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [x] **§I.6 審計時間源不一致** ✅ RESOLVED (2026-06-02,018 D5):`update_user` 的 `updated_at` 由 app-side `SystemTime::now()` 改 `update_user_query` col_expr `Expr::current_timestamp()` + UPDATE 後重查讀回 Model(餵 audit payload_after),審計時間源全 **DB-side**(對齊 created_at/deleted_at)。orphaned `DateTimeUtc`/`DateTimeWithTimeZone` import 移除;017 US1-3 live 回歸不破(updated_at/by 成對非 null)。
- [x] **017 spec doc as-built 回填債(user_name unique index)** ✅ (2026-06-05):`specs/017-manage-user-write/data-model.md §2.1` 已補 as-built 註(migration 003 同義 `sys_user_user_name_active_uniq` 既存 → `uq_sys_user_user_name_active` 未建、語意等價、`down()` 的 DROP 亦無對象)。
- [ ] **用戶名重複的並發 race 回 5000 非 2222**:app 層 `find_active_by_name` pre-check 擋**順序**重複→2222「用户名已存在」;但兩請求**並發**時 DB partial unique 擋下者回 `DbErr`→handler 映 **5000(Internal)**(罕見、資料完整性保住、research C2 已知接受)。日後若要 race 也回 2222,可在 `create_user` 偵測 PG 23505 unique-violation 映 `DuplicateUserName`。
- [ ] **`sys_user` live_tests `audit_rows`/`hard_clean_by_name` 只濾 `entity_id`(跨表 id 撞 latent,018 發現)**:查 `sys_operation_log` 只用 `entity_id`、不含 `entity_table` → 與並存 `sys_role` 同 id 的 audit row 會撞。**018 已修 sys_role 版**(加 `entity_table='sys_role'` 過濾、U6 I1);**017 sys_user 版仍只濾 entity_id**,現靠 test user id 與並存 sys_role id 不撞而過(8 live test 乾淨 dev DB 全綠),但 dev DB 累積 + sys_role 低 id(018 起可建)後有 latent 撞 → 誤算 audit 筆數。harden:比照 018 加 `entity_table='sys_user'` 過濾(+ `hard_clean_by_name` 的 audit delete 同步)

### 2.22 feature 018-manage-role-write follow-up

- [~] **role 寫端 CDP(T028):prod /api ✅、role-modal CDP 由 020 鏡像覆蓋 (2026-06-02)**:server 全 curl 驗 + base-web 逐字鏡像 017;prod CDP /manage/role 經 `/api/systemManage/getRoleList` 載入;**role add/edit/delete modal CDP 未單獨 replay**,但 **020 menu 寫端 modal CDP 全 CRUD 已證**(add/edit/delete/種子 guard、verbatim 同 pattern)→ 寫端 wiring 風險已退
- [ ] **update full-replace `status:None`→NULL 語意(非 UI 可達)**:`update_role`/`update_user` 對省略的業務欄(尤其 `status`)做 full-replace 設 NULL(鏡像 017);base-web edit form `status` 為 required 必送 → UI 不可達。**種子角色已防護**(update guard `status != Some(1)` 擋 None→NULL-brick);**非種子自訂角色**若被非 UI caller 送 `status:None` 會被 NULL 化(離開有效集=等同停用)— benign(罕見、可 updateRole status=1 復原)。日後若要嚴格 partial-update 語意,可改 facade「None 時保留現值」(同改 017、屬更廣決策)
- [x] **prod /api strip ✅ (2026-06-02)**:prod CDP via :443 /manage/role 經 `/api/systemManage/getRoleList` 載入(走 front-nginx strip)。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [ ] **`batch_delete_roles` 空 `ids`→`0000` no-op**(同 [§2.21](#221-feature-017-manage-user-write-follow-up) user 版):UI 不可達(disabled-delete gate),benign;日後若新增可達路徑須補空陣列守衛(現已有顯式 `if ids.is_empty()` early-return)
- [ ] **seed guard 雙查 + TOCTOU(benign)**:delete_role/update_role 種子 guard 各自 `find_active_by_id`(handler)+ facade 內 `find_active`(soft_delete/update_role)= 雙查;guard 讀在 txn 外、與 facade 寫間有微 TOCTOU 窗,但 code immutable(D2)→ 種子身分不變、若中途軟刪 facade 回 Ok(false)→2222「角色不存在」安全收斂。final review 認可、非缺陷;日後若抽 `verify_and_load_*` helper(承 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up))可順帶收斂
- [ ] **enforce 每受保護請求 +1 角色查詢(B 副作用)**:enforce_mw 改 DB-fresh 後每請求多 2 個 indexed query(`sys_user_role` by user_id + `sys_role` by id IN);小型 admin RBAC 廉價可接受(plan Complexity Tracking 記)。日後若高流量需優化,可加短 TTL per-user 角色 cache(但會重引入 staleness、與即時性目標衝突,需權衡)
- [ ] **`role_item` 參數序與 `user_item` mirror 不一致(cosmetic,U8b review M2)**:`role_item(…created_by, created_at, updated_by, updated_at)` vs `user_item(…created_at, created_by, updated_at, updated_by)`(timestamp/actor 配對序相反);**非 bug**(各 call-site 對齊自身簽名、單測覆蓋),為避 12 處 call-site churn 而 deferred。日後若抽 `*_item` 共用 helper 或 cleanup pass 時順帶對齊
- [ ] **`update_*` live test 未鎖 DB-side 時間源(U4 M2/U8a)**:`live_update_role`/`live_update_user` 只斷言 `updated_at.is_some()`+`updated_by`==operator,未斷言 updated_at == DB 時鐘(D5 的 app-side→DB-side 差異未被 live test 鎖);D5 behavior 已由 curl/psql acceptance(SQL render `= CURRENT_TIMESTAMP` + 活體 row)驗。日後若要 lock-in 可加「updated_at 落在請求前後時窗內」斷言

### 2.23 feature 019-manage-menu-list follow-up

- [ ] **`props` 由路徑啟發式衍生(analyze U1)**:getUserRoutes 的 `props` 由 `route_path.contains(':')` 衍生(對當前 seed 正確 —— 僅 `manage_user-detail` `/manage/user-detail/:id`→props=true,餘省略,逐字對齊 014)。**020 menu 寫端**若出現「有 `:` 路徑但非 props」或「props=true 但路徑無 `:`」之 menu,heuristic 會破 → 評估 sys_menu 加顯式 `props` bool 欄。
- [ ] **逐字回歸單測 hand-code seed 值(final review Minor)**:`menu_node_to_route_matches_business_routes_verbatim` 手寫 assembled node 值斷言 == `business_routes()`、**不讀 migration 018 seed literal** → 未來改 018 seed 不被 `cargo test` 抓,僅由 live 三角色 byte-diff(C-V §1)守。020 若要 seed-driven DB 測可加(沿 §2.10 in-crate #[ignore] live-DB pattern)。
- [ ] **getAllPages 48 靜態頁集 sync(analyze A1)**:取自 base-web example `src/router/elegant/imports.ts` 的 `views` keys(逐字對齊、非任意值)。**020 menu 寫端**(create menu 選 component)須與此集對齊;base-web 頁集變動時須同步此 server 端硬編集。
- [ ] **getMenuList 無搜尋過濾**:base-web `fetchGetMenuList` 無參數、handler 僅分頁(current/size 預設 1/10);020 若管理頁加搜尋條件再補 facade filter(沿 016 `RoleListFilter` pattern)。
- [ ] **停用/軟刪 menu 顯示語意 → 020**:本波三讀端 + getUserRoutes 皆讀 active(deleted_at IS NULL)、seed 全 status=1;停用(status=2)menu 是否顯/隱於管理頁 vs runtime、軟刪復原 → 020 寫端定。
- [x] **prod /api strip ✅ (2026-06-02)**:prod CDP via :443 menu 讀端 `/api/systemManage/getMenuList/v2`·`getAllPages` 全走 front-nginx strip。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [ ] **code-hygiene nits(reviewer Minor、皆 deferred、非正確性)**:(a) `handler/system_manage.rs` `normalize_page` 的 `#[allow(dead_code)]` + 註解「wired by US1/US2(T008/T012)in later units」已過時(現 3 個 live handler 呼叫、含 019 `get_menu_list`)—— pre-existing、build 無警告,動該檔時順手清;(b) `route/menu.rs` `menu_node_to_route` 的 `route_path.as_deref().map_or(false, |p| p.contains(':'))` 可改 `is_some_and`(`clippy::unnecessary_map_or`;repo 無 clippy gate、現編譯乾淨)。
- [x] **`icon_type` seed as-built(data-model §2 未列、實際 seed=1)** ✅ (2026-06-05):`specs/019-manage-menu-list/data-model.md §2` 已補 as-built 註(5 iconify 列 seed `icon_type=1`、manage_user-detail→NULL;getUserRoutes 不受影響、getMenuList `iconType="1"` 正確)。

### 2.24 feature 020-manage-menu-write follow-up

- [x] **CDP browser smoke ✅ (2026-06-02 dev + prod)**:dev :21080 020 menu **全 CRUD 端到端**(登入 Super→/manage/menu→新增 cdp_test〔列表出現 + psql created_by=1〕→新增子菜單→編輯〔menuType radio disabled=D2、改名、DB menu_type 不變、updated_at·by 成對〕→刪自訂〔删除成功出列〕→**刪種子 manage_menu→2222「不可删除系统内置菜单」**→**純父刪 cdp_dir〔非種子+有子〕→2222「请先删除子菜单」**);**prod :443 寫端 smoke**:DELETE `/api/systemManage/deleteMenu`(種子)→2222 toast、走 front-nginx /api strip
- [ ] **addMenu `component` 未驗證對齊 getAllPages 48 頁集**(承 [§2.23](#223-feature-019-manage-menu-list-follow-up) analyze A1):020 addMenu 收 `component` 字串原樣寫入、未對齊 server 端 48 靜態頁集(base-web form 由 getAllPages 下拉提供、UI 不可達非法值)。日後若要 server 端硬擋非法 component,加 facade 驗證(對齊 getAllPages 集)。
- [ ] **`normalize_page` 過時 `#[allow(dead_code)]` 仍在**(承 [§2.23](#223-feature-019-manage-menu-list-follow-up) code-hygiene):019 留的 nit;020 holistic review 已順手清 `de_parent_id` 同類 stale allow(tidy-up `dfa68c1`),但 `normalize_page` 的過時 allow/註解仍在(pre-existing、build 無警告);動 `handler/system_manage.rs` 時順手清。
- [ ] **停用(status=2)menu 顯示語意 as-built**(解 [§2.23](#223-feature-019-manage-menu-list-follow-up)「停用/軟刪 menu 顯示語意 → 020」):020 軟刪(deleted_at)menu 離開三讀端 + getUserRoutes;**停用(status=2)menu 仍顯於 getMenuList**(list 只濾 deleted_at、不濾 status),runtime getUserRoutes 由 Casbin 可見性過濾(非 status)→ 種子全 status=1、自訂停用 menu 無可見性 policy 故 nav 本就不顯。種子不可停用(guard)。日後若要「停用 menu 隱於 nav」需在 getUserRoutes 加 status 過濾(屬可見性語意擴充)。
- [x] **MenuAuth/ButtonAuth 編輯 + 選單 restore + re-parent → 後續 feature ✅ 全落地**(FR-011 out 已補齊):MenuAuth ✅ **021**、ButtonAuth ✅ **022**、**選單 restore + re-parent ✅ 025**(回收桶 toggle/復原 + parentId NTreeSelect re-parent、孤兒/cycle/種子/有效父 guard、即時反映零 casbin);025 自身 follow-up 見 [§2.29](#229-feature-025-menu-restore-reparent-follow-up)。
- [x] **prod /api strip ✅ (2026-06-02)**:prod CDP via :443 020 寫端 DELETE `/api/systemManage/deleteMenu` 走 front-nginx strip(種子→2222)。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [ ] **`batch_delete_menus` 空 `ids`→`0000` no-op**(同 [§2.21](#221-feature-017-manage-user-write-follow-up)/[§2.22](#222-feature-018-manage-role-write-follow-up) user/role 版):handler 已有顯式 `if ids.is_empty()` early-return;UI 不可達(無勾選時 disabled-delete gate),benign。日後若新增可達路徑須補空陣列守衛。
- [ ] **update_menu 整欄替換:省略業務欄→NULL(非 UI 可達)**(同 [§2.22](#222-feature-018-manage-role-write-follow-up) role 版):`update_menu_query` col_expr 對**所有 17 業務欄**整欄替換,非 UI caller 送部分 payload 會把未送欄 NULL 化;**種子停用 guard 只擋 `status==Some(2)`**(顯式停用)、`status` **省略(None)→NULL** 不被擋 → 種子被非 UI caller 送省 status 的 payload 會 status NULL-brick。base-web edit form 送全 Model(`getSubmitParams()`)→ **UI 不可達**。**curl acceptance 注意**:編輯「要保留原狀的列」(尤其 seed)須從 getMenuList 取完整欄位再改目標欄(D1 payoff 即如此驗、否則汙染列)。日後若要嚴格 partial-update(None 保留現值)須改 facade(同改 017/018、屬更廣決策)。
- [ ] **create_menu 唯一前檢 TOCTOU(race→5000)+ seed/parent guard 雙查(benign)**(同 [§2.21](#221-feature-017-manage-user-write-follow-up)/[§2.22](#222-feature-018-manage-role-write-follow-up)):create_menu 的 route_name 唯一前檢在 txn 外,並發同名兩請求→後者撞 partial unique `sys_menu_route_name_active_uniq`→`DbErr`→handler 映 **5000(非 2222)**(罕見、資料完整性保住);delete/update 種子+父刪 guard 各自 `find_active_by_id`/`count_active_children`(handler)+ facade 內再 load = 雙查 + 微 TOCTOU 窗,但 route_name immutable(D2)→ 種子身分不變、中途軟刪 facade 回 Ok(false)→2222「菜单不存在」安全收斂。日後抽 `verify_and_load_*` helper(承 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up))可順帶收斂;若要 race 也回 2222 可偵測 PG 23505 映 DuplicateRouteName。

### 2.25 feature 021-manage-menu-auth follow-up

- [ ] **home select 選項 page-key vs route-name 語意落差**(R6、MODAL-WIRING 劃出):menu-auth-modal 的 home `<NSelect>` 選項來自 `getAllPages`(**page key**),但 rev2 `home` 存的是 **route name**(LastLevelRouteKey);二者可不一致。現種子 `'home'` 同時是合法 route name + getAllPages 項故可運作;選非-route-name page 時 redis redirect 行為受 upstream 限制。修法:對齊 select 選項來源為 route names(屬 upstream form 結構、MODAL-WIRING ★ 軌道外)。
- [x] **CDP browser click-through ✅ 022 補(2026-06-03)**:022 收尾 CDP pass(isolated browser context)順補 021 menu-auth-modal 端到端點擊(同 /manage/role harness、編輯角色→菜单权限→tree 載入 9 節點),清此 defer。(原 curl 雙路徑〔:21081 直連 + :21080 /api proxy〕已證 4 端點 e2e;CDP 補視覺。)
- [x] **stale `#[allow(dead_code)]` ✅ 022 T014 清(2026-06-03)**:移除 `find_active`(sys_role.rs)/ `roles_for_user`(sys_user_role.rs)/ `normalize_page`(system_manage.rs、§2.24)3 處 stale allow(三者皆有 live 呼叫端);build warning-clean、189 單測 + lint 17 不破。
- [x] **`set_role_menu` 兩個非原子窗口(R1 + T005 review)✅ RESOLVED (2026-06-09,034 US1+US4)**:① **`add_policies` 非單 txn** + ② **audit-fail-after-change**(casbin 非 sea-orm txn 參與者、policy 變更已 auto_save 持久化但 audit txn 失敗→handler 回 5000 卻不回滾)二窗口,皆由 034 改 **DB-first `set_role_dimension`**(sea-orm 直寫 casbin_rule + 011 audit 同 `mutate_in_txn` both-or-neither → commit → enforcer `load_policy()` → publish)消除:旁路 adapter auto_save 的 pool-handle(原子性死結根因)→ 變更與審計同 txn 原子。三維度(menu/button/endpoint)經 US4 收斂為單一 `set_role_dimension` 一致套用。詳見 [DESIGN §10 Phase 3 #6](INTEGRATION-DESIGN.md)。
- [ ] **redis pub-sub 多 instance 真實 reload 未驗(單 instance only)**:021 失效通知僅在**單 instance** 驗(updateRoleMenu 後自收 PUBLISH→自身 subscriber `load_policy()` reload、log 證;旁證:psql 手改 menu policy + 手動 PUBLISH→同 instance reload 後 getUserRoutes 反映)。**多 instance 真實 fan-out(A 改→B reload)未驗**(現部署單 instance)。日後多 instance 部署時補跨實例 reload acceptance。
- [x] **ButtonAuth 編輯 ✅ 022 落地(2026-06-03,merge `e103de0`)**:角色×按鈕權限 runtime 編輯(鏡像 021 MenuAuth、Casbin `(role,code,'button')` HARD REPLACE 不 fork、無自鎖)+ per-menu 按鈕來源 + pilot 用戶頁 hasAuth gating + 救活 toggle-auth;getUserInfo.buttons 改讀 Casbin、buttons.rs 退場。詳見 [DESIGN §10 Phase 4 ButtonAuth as-built](INTEGRATION-DESIGN.md) + `specs/022-manage-button-auth/`;022 自身 follow-up 見 §2.26。

### 2.26 feature 022-manage-button-auth follow-up

- [ ] **cosmetic:toggle-auth B_CODE3 鈕 caption vs registry desc 用字異**:頁面 i18n `adminOrUserVisible`→「管理员和用户可见」 vs migration seed registry desc(data-model §1.2)「管理员或普通用户可见」;皆指 B_CODE3、gating 走 **code** 不受影響、非缺陷。若要求字面一致可對齊 seed desc 與頁面 i18n(後續、非 gating 範圍)。
- [~] **其餘業務頁 button gating(FR-009 out)— 角色/選單頁 ✅ 024 rollout 完成**:022 pilot 僅用戶管理頁;**024 已 rollout 到角色/選單管理頁**(三頁 hasAuth gating 完整);其他業務頁(若未來新增)操作鈕 gating 仍沿三頁 reactive pattern。
- [ ] **prod image build 非強制未跑**:022 無新 crate(只加 module 到既有 server crate)→ 不適用「加 crate 須 prod image build」守則;final review 確認 Dockerfile 無新 COPY 缺口風險。若要絕對保險可選跑一次 prod target build。
- [~] **`set_role_button` 非原子窗口 ✅ 034 RESOLVED;多 instance redis reload 仍未驗**:① 非原子(`add_policies` 逐 rule loop 非單 txn + audit-fail-after-change)**✅ 034 US4 解**(button 經 DB-first `set_role_dimension`、變更+audit 同 `mutate_in_txn` 原子,見 [§2.25](#225-feature-021-manage-menu-auth-follow-up));② **多 instance 真實 fan-out 仍未驗**(034 沿單 instance publish、D7 out-of-scope)。
- [x] **用戶頁 row 操作鈕 reactive ✅ 機制閉合 (2026-06-04,024)**:024 三頁(user/role/menu)reactive-columns retrofit —— 加 `watch(()=>authStore.userInfo.buttons,()=>reloadColumns())`(鏡像既有 `watch(appStore.locale)→reloadColumns`、shallow watch 正確:store `Object.assign` 替換 buttons 新陣列)、三頁 byte-consistent。**gating 結果正確性** CDP 5/5 驗(撤碼後 fresh login 即隱);**in-session 即時重繪路徑機制經 code review 驗證、行為測試仍缺**(CDP 全用 fresh mount)→ 見 [§2.28](#228-feature-024-button-auth-rollout-follow-up)。

### 2.27 feature 023-manage-endpoint-auth follow-up

- [~] **`set_role_endpoint` 非原子窗口 ✅ 034 RESOLVED;多 instance redis reload 仍未驗**:① 非原子 **✅ 034 US4 解**(endpoint 經 `set_role_dimension` per-(path,method) diff〔結構消滅裸空-v2 wildcard footgun〕、DB-first + audit 同 txn,見 [§2.25](#225-feature-021-manage-menu-auth-follow-up));② **多 instance 真實 fan-out 仍未驗**(D7 out-of-scope)。
- [ ] **D1 coverage lint parser hardening(code review M1/M2、理論性、非現行缺陷)**:(a) `read_string_literal` 接受空字串 → `("GET","")` 理論可過(但 28-count + registry==routes 對稱差會抓、空 path 不 match 真 route);(b) `detect_verb` 取 span 內首個 verb、未斷言屬該 route handler(現每 route 恰一 verb、span 由下個 `.route(` 界定 → 不可達)。皆「收緊網、非修 bug」;adversarial 真注入無 seed route 已證守衛咬合。動該 test 時可順手加 fixture pin。
- [ ] **`get_all_endpoints` unused state param(cosmetic、deliberate)**:`State(_state)` 僅為對齊 `enforce_mw` layer 的 state-extractor 型,handler 本身 infallible 不用 state;編譯無警告、刻意保留。
- [x] **spec doc 行號 off-by-one(cosmetic)** ✅ (2026-06-05):`specs/023-manage-endpoint-auth/research.md` R7 補 as-built 行號漂移注記 —— DESIGN 已多次編輯(至 026)行號位移 → 改指 §4.6.3/§6.3/§11.22 **section anchor**(勿信字面行號);reconcile 內容已落地、不受漂移影響。
- [ ] **接口权限 modal 無顯式「超管唯讀」文字提示(deliberate、scope tightness)**:root-mode 對 R_SUPER 以「全勾 + NTree/confirm disabled」表達唯讀、**未加文字 hint**(避免新增 i18n key、嚴守 MODAL-WIRING 範式);disabled 視覺已足、server 2222 為權威。日後若要更明確 UX 可加一新 i18n key(同 [§2.21](#221-feature-017-manage-user-write-follow-up) userName 唯讀提示 pattern)。`Endpoint.method` 型用 `String`(非 `'GET'|'POST'|'DELETE'` literal union)亦為 deliberate(對齊 backend raw method string + 022 `MenuButton.code:String` 先例、對未來 method 集 forward-safe);如要更嚴型別可窄化、非缺陷。

### 2.28 feature 024-button-auth-rollout follow-up

- [ ] **ButtonAuth「完整版」aligned visible=clickable(FR-008 decoupled 債、刻意)**:024 按鈕碼授權(v2='button')與 023 端點權限(v2=method)為兩套獨立可指派維度 → 可勾 role:edit 顯鈕但端點 Super-only→5003(CDP/對抗式實證)。brainstorm K1 親決 decoupled(user 要可獨立指派);visible=clickable 自動對齊(derive 自端點、零漂移)留「完整版」未來 feature(需動 getUserInfo + 兩套機制,K2)。
- [ ] **跨維度:非-Super 預設無 manage_role/manage_menu 選單可見性(021)**:role/menu 頁 024 button gating 只在能檢視該頁的角色可觀察(預設僅 Super);非-Super 須先經 021 `updateRoleMenu` 授選單可見性才看得到頁(進而觀察 button gating)。三維度 button≠menu≠endpoint 刻意正交;CDP check 5 以「先授 Admin manage_role 選單 + role:edit 按鈕」證 literal US1。文件記錄(DESIGN §10)、非缺陷。
- [ ] **cosmetic:既有 022 down() 註解 stale**:`m20260529_000022:104` 註「022 是唯一引入 v2='button' 的 migration」在 024 落地後不再為真;reverse-order rolldown(024.down 先於 022.down)+ 024.down by-code 精準避此 → 無害、不修(越界改既有 migration);若要註解保真可一行更正。
- [~] **set_role_button 非原子 ✅ 034 RESOLVED;多 instance redis reload 仍未驗**(承 [§2.25](#225-feature-021-manage-menu-auth-follow-up)/[§2.26](#226-feature-022-manage-button-auth-follow-up)/[§2.27](#227-feature-023-manage-endpoint-auth-follow-up)):024 沿 022 `set_role_button`、034 US4 收斂後一併解非原子;多 instance fan-out 仍 D7 out-of-scope。
- [ ] **§2.26 reactive watch 的 in-session 即時重繪路徑未經行為測試(僅機制驗證)**:CDP 5/5 全用 fresh login/navigate 驗 gating 結果(fresh mount 的 columns factory 已含正確 buttons、**不經 watch**);reactive watch(`userInfo.buttons` 變→`reloadColumns`→`$columns` 重算→render 重評 hasAuth)的 in-session 即時重繪**機制經 code review 驗證**、但**無測試 trigger 一次「停留頁面時 buttons 變動」**。現實 app 中 `userInfo.buttons` 停留頁面時罕變(modal 改 target 角色、不 re-fetch 當前 user)→ 屬防禦性;日後若加「刷新本人權限」流程,補 CDP 驗(操控 pinia store 或觸 getUserInfo re-fetch 後驗 row 鈕**不重登即時**重繪)。

### 2.29 feature 025-menu-restore-reparent follow-up

- [x] **孤兒 casbin menu-visibility 列已知債 ✅ 034 US3 RESOLVED (2026-06-09)**:軟刪選單留 `[role,route_name,'menu']` 孤兒 policy + 同 route_name 新建/restore 繼承舊可見性 grant —— **034 US3 menu↔policy 同 txn 連動解**:軟刪 cascade revoke 該 route_name 跨 role 的 menu-visibility→archive(reason=`menu_soft_delete`)、還原 cascade restore(**限同代 archive**:`archived_at = sys_menu.deleted_at` 同 txn transaction_timestamp 不變式、不誤復活舊代)、同名重建零繼承(DRIFT-3)。無孤兒。詳見 [DESIGN §10 Phase 3 #6](INTEGRATION-DESIGN.md)。
- [ ] **restore route_name TOCTOU(race→5000)**(同 [§2.24](#224-feature-020-manage-menu-write-follow-up) create_menu):restore handler active 唯一前檢在 txn 外 + DB partial-unique `sys_menu_route_name_active_uniq` 最終防線;並發撞→`DbErr`→5000(罕見、資料完整性保住)。若要 race 也回 2222 可偵測 PG 23505。
- [ ] **re-parent 跨頂層邊界 component 殘留**(T007 code review 抓、已部分修):`getSubmitParams` 以 `effectiveLayout = parentId===0 || menuType==='1' ? layout : ''` 修掉「頂層葉搬 nested 殘留 `layout.X$` 汙染 component」;**殘留** = nested-directory re-parent 保守不重算其 component、nested→頂層須 user 在浮現的 layout 欄補選(與既有頂層建立行為一致)。日後若要全自動重算 component 須懂 soybean 多層 layout 模型。
- [x] **SEED_MENU_ROUTE_NAMES 前後端 duplication ✅ 034 US5 D10 RESOLVED (2026-06-09)**:根治法「後端 wire 加 isSeed/protected 欄」已落 —— 034 D10 給 menu list wire 加 `protected` 欄、base-web `menu-operate-modal.vue` 改讀 `row.protected`(退役硬編 6 名單)、後端 `is_seed_menu` 亦退役改 data-driven `sys_menu.protected`(US2)。三端對齊、無前後端 dup。
- [ ] **getMenuItem inline-map 與 get_menu_list 重複**(T003 review):`get_deleted_menus` 逐字 copy `get_menu_list` 的 26-欄 MenuItem map(沿 codebase inline-per-handler 慣例、刻意)。若出現第 3 消費者再抽 `to_menu_item(Model)->MenuItem` 共用 helper(屆時須一併動 get_menu_list)。
- [x] **contracts §1/§2 deleteMenu curl `-d`(POST)應為 `-X DELETE`** ✅ (2026-06-05):`specs/025-menu-restore-reparent/contracts/verification-commands.md` 的 3 條 deleteMenu 命令已加 `-X DELETE` + §1 註一行(restoreMenu 為 POST、`-d` 正確不變)。
- [ ] **CDP ④ 僅 cycle 路徑 UI-driven**:T009 CDP ④ 用 cycle reject(move-self)觸 2222 toast;`上层菜单已删除,请先复原上层`(孤兒父 restore)與 `路由名已被占用`(restore route_name 佔用)兩 guard 已 **code + curl 驗**(T008/手動 acceptance)、未單獨 UI-driven。日後 CDP 巡檢可補。
- [ ] **endpoint_auth.rs bucket-header count drift**(pre-existing、023 引入、非 025):`ENDPOINT_REGISTRY` 的 per-verb header(`── N GET ──` 等)隨 023/025 端點 append 在 DELETE bucket 之後而未併入對應 verb bucket、header count 略 stale;top-level「30 entries」正確、lint 解析 tuple 非 comment → 不影響。日後加端點時順手把新端點併入 method bucket 並更新 header count。

### 2.30 feature 026-auth-dry-refactor follow-up

- [ ] **`ctx_mw` verify-fail debug log 微調(accepted、wire 中性、final review 抓)**:026 把 `ctx_mw`(原 `bearer_token(...).and_then(|t| jwt::verify(...).ok())` 靜默吞 verify 錯、**無 log**)改走 `verify_bearer` 後,present-but-invalid token 會觸發 helper 內 `debug!("auth: bearer JWT verify failed")` → ① ctx_mw 多一條 debug 線(原 silent);② protected route 帶壞 token 時 ctx_mw + enforce_mw 各記 = 2 線(原 enforce 1 線);③ 4 處 per-handler verify-fail 訊息(`enforce/get_user_info/...: token verify failed`)併為 1 條通用訊息 → **per-callsite 屬性從 log message 消失**(改靠 request span / trace_id 歸因)。皆 **debug 級、wire/碼/狀態零變、親決接受**([DESIGN §10 Phase 3 #5](INTEGRATION-DESIGN.md) as-built 已記)。日後 Phase 6 observability 若需 per-callsite verify-fail 歸因,於 metrics/tracing 層補(非回退 per-handler log 訊息)。

### 2.31 014-026 spec-review 衍生 follow-up

> 完整分項與理由見 [REVIEW-014-026.md](REVIEW-014-026.md);本節僅記可行動項。整體 11/13 Ready、0 Critical、0 confirmed specGap。

- [x] **025-I1 頂層葉選單編輯吃掉 component layout 前綴** ✅ (2026-06-05):`menu-operate-modal.vue handleInitModel` 把 wire string `parentId` 正規化為 `Number()`(同修 M1 NTreeSelect 預選態);live CDP 驗綠(home 布局選擇器顯示+值 base、manage_user 巢狀隱藏)。type-lie 消費端鐵律固化 [DESIGN §9.1](INTEGRATION-DESIGN.md)。
- [x] **doc-debt 批次回填** ✅ (2026-06-05,as-built 驗證後 surgical 修、未碰 code;詳見 commit):018-M1(種子編輯範例補 `status:"1"`+guard 註)·M2(data-model 回填整欄替換 NULL 語意);019-M1(contracts 補 getUserRoutes 5000 錯誤面);020(spec FR-011 + data-model §7 加 025 supersede cross-ref、不改原 OUT 陳述);023-M2(contracts 加 28→30 drift 註、保 023 歷史不回改);025-M2(tasks T001-T010 勾 merged)·M3(data-model 補 SEED list duplication known-debt)·M4(data-model 補 guard② `ids_for_route_names` as-built);026-M1(6 處 `jwt::Error`→`jwt::JwtError`)·M2(spec 唯一差異措辭補 ctx_mw+refresh log)。
- [x] **021-M2 menu policy 編輯 audit 非原子 ✅ 034 RESOLVED (2026-06-09)**:`set_role_menu` casbin mutation 與 011 audit 非同 txn(audit 失敗時 policy 已上線無稽核)—— 034 US1+US4 改 DB-first `set_role_dimension`、變更+audit 同 `mutate_in_txn` both-or-neither 解(三維度一致,見 [§2.25](#225-feature-021-manage-menu-auth-follow-up))。

### 2.32 feature 027-refresh-token-rotation follow-up

- [x] **028-single-session-enforcement ✅ 落地(2026-06-06)** — 見 §2.33 / [DESIGN §6.6](INTEGRATION-DESIGN.md)
- [x] **029-single-session-admin-ui ✅ 落地(2026-06-06、merge `1ce835a`)**:028 policy 的 admin 管理 UI(系統預設 runtime store rev2 首張 `system_settings` KV + 每帳號 policy UI + 3 Super-only 端點 + base-web 雙頁)已交付;follow-up 見 §2.34 / as-built [DESIGN §6.7](INTEGRATION-DESIGN.md)
- [x] **sys_token 實體清理 / 過期淘汰** ✅ **030 落地(2026-06-06、merge `d3bc391`)**:027 FR-011 OUT 的過期 sys_token 實體清理已交付 —— on-demand `cleanup-job` binary 純過期清理(`expires_at<now-60s`、與 status 無關、dry-run 預設/`--execute`、`profile:[jobs]` + m030 索引 + host cron);見 [DESIGN §10 Phase 5 #5](INTEGRATION-DESIGN.md) + `specs/030-cleanup-job/`
- [ ] **盜用偵測事件持久化審計 / 指標**:027 clarify ④ 以 **warn 級運行日誌**記錄(`tracing::warn!(user_id,rotation_chain)`、可觀察);持久化安全審計 / metrics 留 **Phase 6** 觀察性堆疊
- [x] **CDP smoke deferred-with-rationale** ✅:027 對 base-web **零改**(wire 中性)、refresh 為背景 token 流程(無 base-web modal),curl C1-C5 已端到端證明 wire 契約保持 → CDP「curl ≠ base-web modal 對齊」gotcha 在無 base-web 改動的 feature 不適用(plan/contracts 標可選);未補測無債
- [x] **token_hash 撞鍵殘餘風險** ✅ **030 jti 修(2026-06-06、merge `d3bc391`)**:`Claims` 加 per-token `jti`(每 `sign()` 鑄 fresh uuid)→ 同秒輪替兩 token JWT byte-distinct → `token_hash=sha256(JWT)` 不撞 UNIQUE。**真正觸發路徑 = login→同秒 refresh**(refresh 沿用 login lineage 的 sid + 同秒 iat/exp → 無 jti 時 byte-identical),**非並發 login×2**(每 login 新 sid 本就不撞)。零 wire 影響(base-web token opaque);pre-jti 舊 token 缺 jti → verify 失敗 → 一次性重登。028 C4「≥1s iat gap」workaround 已可拔(C4 活體 login→同秒 refresh×6 皆 0000)。見 [DESIGN §10 Phase 5 #5](INTEGRATION-DESIGN.md);memory `same-second-refresh-token-hash-collision`
- [ ] **`expires_at` vs JWT `exp` 微小時鐘偏移(latent、accepted、final review 抓)**:`sys_token.expires_at`(`ttl_window` 的 `chrono::Utc::now()`)與 JWT `exp`(`jwt::sign` 的 `now_secs()`)是**兩次獨立時鐘讀取** → DB `expires_at` 比 JWT 真正 exp 晚數毫秒。**027 無害**:`expires_at` 純 lifecycle metadata、`rotate`/`decide_rotation` 從不讀它、過期由 `jwt::verify` 把關。**但未來若有 feature 拿 `sys_token.expires_at` 當 enforcement gate 須警覺此偏移**(屆時讓 `ttl_window` 先算、把 `issued` 餵進 jwt sign 統一單一時鐘源)。
- [ ] **`rotate` 整鏈 revoke 原子性殘餘競態(SC-002、accepted、單實例 OK)**:`rotate` 只 `lock_exclusive` 命中**單列**、不鎖整鏈 → 極端並發下合法 Rotate 的新 active 與另一持同鏈 stale token 的整鏈 Reuse 鎖不同列、互不阻塞 → Reuse 的 chain UPDATE snapshot 可能不含尚未 insert 的新 active → 殘留一張 active(該 user **下次任一 rotate 觸發偵測時收斂**)。單實例 + admin 低並發 + 需攻擊者與真實 user 同毫秒並發、殘餘風險小(多實例本就 OUT、spec Assumptions);**未來若需嚴格化整鏈作廢**(多實例/高並發):Reuse 先 `SELECT ... WHERE rotation_chain=C FOR UPDATE` 鎖全鏈或對 chain 取 advisory lock。詳見 [DESIGN §6.2](INTEGRATION-DESIGN.md) 殘餘競態註。

### 2.33 feature 028-single-session-enforcement follow-up

- [x] **same-second token_hash collision** ✅ **030 jti 修(2026-06-06)**:同根因已解 —— 見 [§2.32 token_hash 撞鍵殘餘風險](#232-feature-027-refresh-token-rotation-follow-up)(`Claims` 加 per-token `jti`、真正路徑=login→同秒 refresh)/ [DESIGN §10 Phase 5 #5](INTEGRATION-DESIGN.md);028 C4「≥1s gap」已可拔。
- [ ] **base-web 踢人 modal(7777)HARD-reload boot race**:HARD page reload 時 `window.$dialog?.error` 在 `AppProvider` 掛 `$dialog` 前被 boot-time getUserInfo 觸發 → 靜默 no-op(7777 仍正確回傳);in-app SPA 導航穩定彈窗。非 028 後端缺陷、base-web init timing;若要「被踢分頁 hard-refresh 也彈窗」屬 base-web 改、與 029 相關。
- [x] **CDP isolated-context modal smoke ✅(2026-06-06)**:028 US3 親驗「账号在他处登录」彈窗 + 確認→/login + dialogCount=1 + off 不踢(不擾 user tab)。

### 2.34 feature 029-single-session-admin-ui follow-up

- [ ] **FR-013 value_type 驗證在 handler、不在 facade(latent、為「第 2 個 system setting」警覺)**:`system_settings::update` facade 直接寫入給定字串、**不**自驗 value_type;FR-013 值域驗證(`value_in_value_type`)只在 `update_system_setting` handler。029 為唯一寫入路徑、安全;但 `system_settings` KV 表刻意設計為**可擴充框架**([DESIGN §6.7](INTEGRATION-DESIGN.md):日後系統級開關共用)→ 未來新增第 2 個 setting 若另闢經 facade 的寫入路徑,會繞過驗證。加第 2 個 setting 時:把 value_type 驗證下推 facade `update`(對所有 caller 生效)或在 facade doc 明訂 caller 責任。(final review Minor)
- [ ] **`value_in_value_type` 不 trim enum 成員空白(minor、未來 value_type 含空白才中)**:`enum:on,off` 以 `split(',')` 比對、不去空白 → 假設未來定義 `enum:on, off` 會把 ` off` 當字面值。029 唯一 value_type `enum:on,off` 無空白、不中;日後若有含空白的 value_type 須 trim。
- [ ] **設定頁載入失敗靜默顯示「關」(minor UX)**:`fetchGetSystemSettings` 失敗/空時設定頁靜默 return、switch 停在 false → 真載入失敗時頁面顯示「關」可能誤表實際狀態(request 層已 toast 錯誤 + seed 保證該列存在 → 殘餘極小)。要硬化:switch 以 `loaded` ref 守(首次成功載入前顯 placeholder、不把 false 當已確認真相)。
- [x] **CDP isolated-context 雙頁 smoke ✅(2026-06-06)**:設定頁 switch off→on→「设置已更新」+ DB 翻轉(browser→backend end-to-end)/ 使用者頁 sessionPolicy 欄 + 設定單一會話 action + modal 3 態 prefilled;不擾 user tab。**非 deferred、無 CDP 債**。(過程踩 base-web dev-server /mnt/d inotify stale module → restart 即解,記 memory `live-tests-pollute-running-watcher` + `project-devstack-acceptance-restart`,非 029 code 缺陷。)

### 2.35 feature 030-cleanup-job follow-up

- [ ] **least-priv cleanup PG role(決策 3 defer)**:cleanup-job 現用 `cleanup_database_url` secret(值 == `database_url`、soybean superuser)。indirection 已備 —— 日後建專用最小權限 PG role(僅 `sys_token` SELECT/DELETE)後只換此 secret 值、不動 cleanup-job。全專案無 `CREATE ROLE`/`GRANT` 先例,故 defer。
- [ ] **實際 host 排程(cron/systemd timer)未建立(operational、prod deploy 時)**:feature 交付 binary + compose one-shot service 的「可被觸發」能力,但週期性觸發的 host 排程未設(spec assumption:外部排程器、部署**刻意**不含 in-stack scheduler)。**SC-002「store 有上界」在 prod 實際成立取決於排程真的週期跑**。建立時注意(acceptance 實證的兩個觸發陷阱):① 用與運行中 stack **相同的 `-f` compose flags** —— bare `docker compose --profile jobs run` 會因 postgres config drift(base 無 ports vs 運行中 stack 有)想**重建 postgres 容器、擾動運行 stack**(C3 acceptance 改走 `docker run --network rev2-admin_rev2_net … --entrypoint /usr/local/bin/cleanup-job` 直跑 runtime binary 避開);② execute 因 dispatcher arg trap 須 `--entrypoint /usr/local/bin/cleanup-job … --execute`(append arg 否則被當 `$1` → usage;見 [research D7](../specs/030-cleanup-job/research.md))。
- [ ] **(trivial)canonical `dcargo`(specs/017 verification-commands 定義)touch-list 不含 `cleanup-job/src`**:WSL2 /mnt/d mtime-stale → 未來改 cleanup-job 用該 dcargo 可能不觸發重建(本次實作已在 dcargo 的 `find … touch` 清單補上 `cleanup-job/src`);動 cleanup-job 時沿用補丁版或更新 017 定義。

### 2.36 feature 031-obs-min follow-up

- [ ] **alloy `user: root` 讀 docker.sock(R11 prod 硬化 defer)**:obs-min 為可攜性讓 alloy run-as-root 讀 `/var/run/docker.sock`(root:docker 660)。prod 非-root 硬化(`group_add` host docker gid 或 rootless docker-SD)留 **security pass**(032 obs-full 已落地但未含 alloy 硬化);dev/個人 workspace 可接受。
- [ ] **obs/metrics prod 查詢入口對外暴露(grafana/loki/prometheus 經 front-nginx reverse proxy + TLS + 採集端 auth)**:031/032 prod obs+metrics 全 = internal-only(無對外 host port),維運者經 `docker compose exec` / port-forward 達 grafana/prometheus;「對外暴露」spec Assumptions 明列**延後 security pass**(032 obs-full 已落地、metrics service〔prometheus/grafana/pushgateway〕同 internal-only、對外暴露 + scrape auth 仍未做)。
- [ ] **obs(loki/alloy/grafana)+ metrics(prometheus/exporter/pushgateway)全 service 無 healthcheck → `up --wait` 視 running 即 ready(非 queryable)**:pipeline self-heal(alloy 重試 push、grafana 重試 datasource、prometheus 重試 scrape)故功能可接受,但 `--wait` 回傳不代表 loki 已可查 / prometheus 已 scrape(031 C1 改輪詢 loki `/ready`、032 acceptance 改輪詢 prometheus `/api/v1/targets` + pg_up/redis_up)。加 loki `/ready` + grafana `/api/health` + prometheus `/-/ready` healthcheck 可給真 readiness signal(minor operational、未來自動化起 stack 時有用)。
- [x] **(dashboard-provisioning feature 考量)rust-api log trace_id 在 loki `fields_trace_id`(nested)非 top-level** ✅ 已決 (2026-06-08、033):033 audit-log 板沿用 nested `fields_trace_id`(enforce-deny logs panel、`enableLogDetails` 展開可見 trace_id)、**刻意不**做 `flatten_event(true)`(全域改 log 形狀、超 033 純-config 範圍);trace_id 查詢沿既有穩定路徑。原 note 保留供日後若做全域 flatten 參考。
- [~] **enforce metrics 埋點**:**✅ 032 obs-full** 落地基礎 enforce allow/deny counter(`casbin_enforce_total{decision}`、`enforce_mw` 3 outcome、閉 Phase 3 #5 債、經 prometheus 消費);**仍待**:027 盜用偵測 metrics(reuse/8888 counter)/ 026 per-callsite verify-fail 歸因(per-route label),留後續 dashboard/metrics 擴充 feature 補(守低基數紀律)。

### 2.37 feature 032-obs-full follow-up

- [ ] **least-priv exporter PG role**:postgres_exporter 現 reuse soybean superuser DSN(internal-only 可接受);專用唯讀 role(`CREATE USER ...; GRANT pg_monitor`、零寫/DDL)需 migration、合 030 §2.35 least-priv PG role 軌道一起做。
- [ ] **alert notification channel(SMTP/webhook 送信)**:3 baseline alert rule 已 provision + grafana 內建 default backstop 下可 Firing,但 contact point/notification policy defer(需真實 creds、鏡像 acme 需真實 domain;notification 產生但 SMTP 未設→silently drop)。
- [x] **grafana dashboard(metrics)** ✅ (2026-06-08、033 merge `3d27cd5`):dashboard-provisioning 交付 6 板(master-overview/rust-api/postgres/redis/cleanup-job/audit-log)provisioned in obs-full;見 [DESIGN §10 Phase 6 #3](INTEGRATION-DESIGN.md) + §2.38。
- [ ] **`rust-api-high-5xx-rate` alert rule `noDataState:Alerting` 零流量理論誤報**(final review M2):5xx-rate 表達式在「完全無流量」系統 = empty/empty → grafana NoData → `noDataState:Alerting` 會誤 firing。**本部署不可達**(prometheus 每 15s scrape rust-api `/metrics`、被 axum 計數 → `axum_http_requests_total` 恆有近期樣本 → 永不 NoData),且為 plan 刻意 fail-loud 設計;若未來要嚴格消除此理論 edge,把表達式包 `... or vector(0)` 強制有值。低優先、自我修正。

### 2.38 feature 033-dashboard-provisioning follow-up

- [ ] **cleanup-job 經 `docker run` 跑時 log 被 alloy 依 image 標成 `service=rust-api`(污染 rust-api loki 串流)**:033 acceptance C0 用 `docker run rev2-admin-rust-api:dev` 跑 cleanup-job、alloy docker-SD 依 image 派 service label → 其純文字 stdout("would delete 0 rows" 等)灌進 `service=rust-api` → 無 guard 的 `| json` 板回 400 JSONParserErr(已在 audit-log 板補 `|~ \`^{\`` guard 化解、commit `5fa6a1c`)。**症狀已解、log 歸屬根因未除**:改經 compose `--profile jobs` cleanup-job service 跑(alloy relabel compose-service→service、得乾淨 `service=cleanup-job` label)、或精修 alloy labeling 規則。dashboards 已 guard、不阻塞;屬 obs log 歸屬 hygiene、合 §2.36 alloy 硬化軌道。
- [ ] **(minor)postgres 板 PG17 bgwriter gap(82% match、1 panel No data)**:pin `postgres_mixin@v0.19.1` 的 bgwriter buffers panel 用 PG17 移除的 `pg_stat_bgwriter_buffers_{backend,checkpoint}_total`(折進 `pg_stat_checkpointer`)→ 該 1 panel 永 No data。upstream/PG17 gap、非 bug;日後 postgres_mixin 出 PG17 對齊版可重 pin 升級。

### 2.39 feature 034-managed-rbac-policy follow-up

- [x] **restore audit payload 過簡(只記 `{archive_id}`、還原後即懸空)→ ✅ 035 US1**:`RestoreOutcome::Restored` 改帶 `{v0,v1,v2}`、`restore_policy` 審計 `payload_after` 改記 `{role, target, dimension}`(新增 `restore_audit_payload` 純函式 + 既有 `dimension_from_v2`、零額外 query、FR-002 還原後仍可解析);menu cascade match 臂同步、summary 審計不改。詳見 [DESIGN §10 Phase 3 #6](INTEGRATION-DESIGN.md)。
- [x] **no-op 仍 reload+publish → ✅ 035 US2**:新 trait `PolicyMutated`(3 impl)、`mutate_and_reload` 改條件化 `if result.mutated()`、只跳結構性零變更(Rejected / restore NoOp·NotFound / menu 查無);空-diff Applied 與 menu-found-無-policy 仍 reload(刻意、FR-006);`batch_delete_menus` `any_mutated` 追蹤。6 caller 零改、對外逐字不變。詳見 [DESIGN §10 Phase 3 #6](INTEGRATION-DESIGN.md)。
- [ ] **archive 懸空 cruft GC(D8)**:被刪選單 archive 的 menu-visibility policy 因 route_name 被新選單重用而永不可還原(034 同代隔離後正確不誤復活、但舊代 archive 留為死 cruft)。retention/purge out-of-scope(spec Assumptions);policy 撤銷罕見、archive 小,日後可比照 030 cleanup-job 加 purge。
- [ ] **REVIEW-DATABASE 12-table live 重稽核**:034 在 REVIEW-DATABASE 記為 worktree as-migrated intent(casbin_rule +3 治理欄 / 新 sys_casbin_policy_archive / sys_menu +protected / m031-m035),既有 11-table 總覽稽核採樣早於 034;12-table live-vs-migration 全重稽核留後續 doc pass。
- [ ] **dev DB 3 個 `cdp*` 測試殘留 soft-deleted menu**:`sys_menu` 有 3 列 cdp 前綴 epoch-ms 名(`cdpm1_*`/`cdpm2_*`/`cdpx_m_*`、2026-06-02 CDP smoke 殘留、`deleted_at` 非 NULL、`protected=f`),非 production menu、不影響任何守恆計數;dev DB hygiene、可 hard-delete 清。
- [ ] **(非債、認知)`manual_revoke` reason 永不產生**:034 無單條撤銷端點,所有權限編輯走 `set_role_dimension`(reason=`role_set_replace`)→ 回收桶只見 `role_set_replace`(menu cascade 的 `menu_soft_delete` 被排除)。spec「單條撤銷」語意現無對應 code path(US4 收斂的正確結果);日後若加單條撤銷端點再產生 `manual_revoke`。

## 3. 已完成里程碑

完整 commit 里程碑歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)(append-only、不在 SOP 注入,避免本檔膨脹)。

§1「最新進展」滾動最近 2 條;歷史在 MILESTONES.md 永久保留。歸檔流程見 [CLAUDE.md §7.5](../CLAUDE.md)。

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + [`INTEGRATION-DESIGN.md` §10 各 Phase](INTEGRATION-DESIGN.md)。本節為動態 status 追蹤;feature 詳細描述見 DESIGN §10。

### Phase 0 — 設計拍板 ✅ 全完成+已歸檔 (2026-05-28)

> 設計鏈 7 件(RESEARCH / RESEARCH-FOLLOWUP / MOCK-COVERAGE-AUDIT / DESIGN / CHECKLIST / §11 12 拍板〔user 親決〕/ constitution v1.0.0 凍結);非 code、無 merge SHA。詳見 [DESIGN §10 Phase 0](INTEGRATION-DESIGN.md)。

### Phase 1 — 部署基建 ✅ 全完成+已歸檔 (2026-05-28)

> 5 feature 全交(001 rust-api Dockerfile `a21e932` / 002 base-web Dockerfile `a70fa5f` / 003 TLS cert `cb5e1a1` / 004 compose 編排 `b4294c7` / 005 secret 注入 `068b2a8`),各 feature branch 保留供 audit;詳細 deliverable 見 [DESIGN §10 Phase 1](INTEGRATION-DESIGN.md) + [MILESTONES](INTEGRATION-MILESTONES.md)。

### Phase 2 — 後端基礎設施 ✅ 全完成+已歸檔 (2026-05-29)

> 後端基礎設施 6 feature 全交(007 連線層+config+JWT secret 吸收 `928949d` / 008 envelope Res<T>+12-code 矩陣 `7bdf5bb` / 009 soft-delete 三重防護+entity crate `88312b6` / 010 migration 自動套+migrate gate `e4ff2b2` / 011 audit-log+mutate_in_txn `2be489f` / 012 sub-crate sea-orm-adapter+xdb+casbin 2.20 `774f7b3`),各 feature branch 保留供 audit;詳細 deliverable 見 [DESIGN §10 Phase 2](INTEGRATION-DESIGN.md) + [MILESTONES](INTEGRATION-MILESTONES.md)。

### Phase 3 — 認證 + 動態選單 ✅ 全完成+已歸檔 (2026-06-05;#6 受管 RBAC policy 治理層 ✅ 034 merge `8e95fa1`+推 origin 2026-06-09 → Phase 3 全收)

> **#6 受管 RBAC policy 治理層 ✅ 034-managed-rbac-policy(2026-06-09、merge `8e95fa1` --no-ff 回 rev2-admin-root + 推 origin、保留 034 branch)** — 架構 B(archive 表、免 fork adapter、§11.6 後端不觸、無 backend amendment)、5 US/5 migration m031-m035。各單元 spec+code-quality 雙審 + 最終整體 review(16 FR/7 SC 全 MET);US5 回收桶頁 user 親決落 MODAL-WIRING use (e) v1.6.0、不需 amendment。deliverable 詳見 [DESIGN §10 Phase 3 #6](INTEGRATION-DESIGN.md);merge 史見 [MILESTONES §1](INTEGRATION-MILESTONES.md)。

### Phase 4 — 主流業務 ✅ 全完成+已歸檔 (2026-06-06)

### Phase 5 — 補位 + 抽離項 ✅ 全完成+已歸檔 (2026-06-06)

### Phase 6 — 觀察性(可選,生產 ready) ✅ 全完成+已歸檔 (2026-06-08)

### Phase 7 — 維護(持續性)

- [ ] wire 細節對齊 feature(status / gender 等,走 CDP 全功能巡檢)
- [ ] upstream rebase feature(定期 `git rebase upstream/example`(base-web)+ `upstream/main`(rust-api))
- [ ] graphify 圖譜更新 feature(P4 完跑 `graphify update`,refresh manifest + GRAPH_REPORT)
- [ ] 依需求啟用觀察性 alert / 升 acme.sh 真實 cert / 等

---

## 5. 跨 feature 待驗證項

實作 Phase 1-5 各 feature 時必須對齊的不變式(權威源:`MOCK-COVERAGE-AUDIT.md` §4)。

### 5.1 wire envelope 與型一致性

- [x] **envelope**:`{data, code, msg}`(無 `success`);`code` string `"0000"`(§4.1)— ✅ 008(rust-api 21 單測 + 404 curl)+ 013 CDP 端到端(base-web unwrap + code 分流);其餘 endpoint 隨接線續驗
- [x] **paginated**:`{current, size, total, records}`(無 `pages` 欄)(§4.9 已驗)
- [x] **Role.id 型 = string**(§I.3 凍結、§11.10)— ✅ 016(DTO i64→`.to_string()`;base-web typings `number` 不符但 runtime 安全、決定不修,§2.20)
- [x] **MenuType enum**:1=directory / 2=menu(§4.2.1)— ✅ 019(sys_menu menu_type;wire `"1"`/`"2"` 字串、CDP 顯「目錄/菜单」)
- [x] **Status nullable**:`status: EnableStatus | null`(§4.2.2)— ✅ 016(`Option<String>` None→`null`、缺欄回 null、CDP render 不 crash)
- [x] **MenuRoute.id** 型:string;`getUserRoutes` 供應時帶 string id(§4.13.1)— ✅ 014(`MenuRoute.id:String`=route name、serde camelCase、curl + CDP 驗)
- [~] **wire string id/parentId type-lie 消費端鐵律**(2026-06-05 [014-026 review](REVIEW-014-026.md) §4.1):§I.3 凍結 id/parentId 為 string、typings 宣告 number、`defaultTransform` 不轉型;「只當 rowKey 無害」假設在 **025-I1 破**(前端 `=== 0` 嚴格比較 + `NTreeSelect` number key → data-corruption)。鐵律:消費端對 wire id/parentId 做數值比較/餵 number-keyed 元件**一律先 `Number()`**(落消費邊界、不改 wire 契約),固化 [DESIGN §9.1](INTEGRATION-DESIGN.md);025-I1 已修+CDP 驗綠。

### 5.2 role / 帳號 / token

- [x] **role 常量**:`R_SUPER` / `R_ADMIN` / `R_USER_COMMON`(非 rev1 `ROLE_SUPER`)(§4.4)— ✅ 013 sys_role seed + getUserInfo 回 + enforce 用
- [x] **預設帳號**:依 §11.1 拍板(含 User → User01 alias 機制)— ✅ 013 sys_user_role seed(1→SUPER/2→ADMIN/3→USER_COMMON)+ getUserInfo `nick_name` alias(User→User01)
- [ ] **JWT payload**:mock `data` 是 array `[{userName}]`;rev2 可自訂或保持(待 §11.10 決)(§4.5)
- [ ] **apifoxToken**:寫死於 `src/service/request/index.ts:17` + `src/service-alova/request/index.ts:37`;依 §11.4 拍板處理(§4.8)

### 5.3 auth flow

- [x] **login**:`{userName, password}` request、response envelope wrap `{token, refreshToken}`(§4.12.1)— ✅ 013(camelCase、curl + CDP 驗)
- [x] **refresh rotation**:每次同時換新 token + 新 refreshToken(§4.12.2)— ✅ 013 最小無狀態;**✅ 027 升級為 DB 持久化 rotation chain + 盜用偵測(reuse→整族系 revoke + 8888)+ grace 寬限窗 + SHA-256 雜湊**(`sys_token`;wire 中性、`{token,refreshToken}` 逐字不變)
- [x] **stale token**:`/auth/getUserInfo` 須支援 stale 但未 expired token(page reload restore session)(§4.12.3)— ✅ **027 US4/FR-009/SC-008 正式驗收**(027 不改 getUserInfo/verify_bearer;curl C5:15s 舊 access→`0000`+userName;族系雖被盜用 revoke,access stateless 仍有效)— **✅ 028 升級為 per-account 可控**:policy=開時 access 端可被 session pointer 即時撤銷(舊 session 下個請求 4 認證 gate 回 `7777`),policy=關仍維持此 stateless 多裝置並存;§11.17(018 enforce DB-fresh stateful)同軸延伸,見 [DESIGN §6.6](INTEGRATION-DESIGN.md)
- [x] **logout 無 endpoint**:rust-api 不實作 `/auth/logout`,業務只走 frontend `resetStore()`(§4.12.4 已驗)
- [x] **refresh critical 紀律**:`/auth/refreshToken` 絕對不回 `9999/9998/3333`(§4.11)— ✅ 013 失敗一律 `8888`(curl grep 驗無 3333/9999/9998)

### 5.4 dynamic mode(§11.7 已選 dynamic;✅ 014 落地)

- [x] **3 route endpoint(getConstantRoutes/getUserRoutes/isRouteExist)完整實作** — ✅ 014(menu 走 Casbin enforce);**019 getUserRoutes 改 DB-driven 讀 sys_menu、輸出逐字不變**;**025 restore/re-parent 即時反映 getUserRoutes(零 casbin、無重啟)**
- [x] **getUserRoutes 必含 `home` 欄**(§4.13)— ✅ 014(`home="home"`);**021 改 per-role**(第一 active 角色 by id ASC 的 home、None→'home';未編輯三角色逐字==基線)
- [x] `VITE_AUTH_ROUTE_MODE` 切換機制(預設 `static`)— ✅ 014 翻 `dynamic`(base-web `.env`、BASE-WEB-ADAPT、兩段式 commit)

### 5.5 base-web 環境配置

- [~] `VITE_SERVICE_BASE_URL` 切到自家 rust-api(非 ApiFox);`.env` / `.env.test` / `.env.prod` 三檔(FOLLOWUP §3.3 / MOCK §6.2)— **dev(`.env.test`,`pnpm dev` 走 --mode test)✅ 013 切 `http://rust-api:21081`**(vite proxy);**prod `.env.prod`→`/api` 仍待**(front-nginx reverse proxy + base-web rebuild,見 [§2.16](#216-feature-013-auth-login-enforce-follow-up) / [§2.8](#28-feature-004-compose-port-orchestration-follow-up))
- [ ] `pageExcludePatterns`(若 §11.5 選 b'-narrow):隱藏 alova / demo menu

### 5.6 業務驗證 error code

- [~] **rev2 業務驗證錯誤碼** — 008 釘 `5000`=infra、`5001-5999` enforce/權限(013 `5003`=enforce deny);**寫端業務驗證一律 `2222`(BizError)**:017 user / 018 role / 020 menu / 021 MenuAuth / 022 ButtonAuth / 023 endpoint(root-mode + 非法端點)/ 025 restore·re-parent 各 guard 皆 2222、非 5xxx;授權 5003 / 未認證 3333 / refresh 8888(絕不 9999/9998/3333)。詳見 DESIGN §10/§11 + 各 follow-up

### 5.7 base-web wrapper 軌道(若 §11.3 拍板 (B))

- [x] **`BASE-WEB-WRAPPER`** ✅ (017+018+020+022+023):`src/service/api/rev2-system-manage.ts` 累加 user/role/menu 各 4 fn + button 3 fn + endpoint 3 fn,`request<null|T>`、index.ts `export *`;詳見各 feature DESIGN §10
- [x] **`MODAL-WIRING` ★ (v1.2.0 邊界)** ✅ (017+018+020):接 user/role/menu `*-operate-modal`/`index.vue` placeholder(只改 `// request`、`!error` 才成功);017 CDP 驗、018/020 逐字鏡像;詳見 §2.24 / DESIGN §7.4
- [x] **`MODAL-WIRING` ★ (v1.4.0 (c) 同模式新權限 modal+trigger)** ✅ (023):新 `endpoint-auth-modal.vue` + role-operate-drawer trigger;constitution v1.4.0 §III.2 (c)(amendment `d700434`、DESIGN §11.21);CDP 雙證
- [x] **`MODAL-WIRING` ★ (v1.5.0 (d) 選單復原/re-parent 控制)** ✅ (025):menu-operate-modal parentId NTreeSelect + index.vue 顯示已刪除 toggle/復原鈕 + i18n;constitution v1.5.0 §III.2 (d)(amendment `2b05a5e`、DESIGN §11.23);CDP 四證
- [~] `BASE-WEB-BUILD-CONFIG`(若 §11.5 b'-narrow):動 `build/plugins/router.ts` 加 `pageExcludePatterns` — **014 dynamic mode 下 moot**(getUserRoutes 只送業務 route、demo menu 根本不送 → 不需隱藏;此 ★ 軌道在 dynamic 維持下不需動,見 [DESIGN §10 Phase 3 #2](INTEGRATION-DESIGN.md))

### 5.8 alova 7 endpoint(若 §11.2 選實作)

- [x] `sendCaptcha` / `verifyCaptcha` / `addUser` / `updateUser` / `deleteUser` / `batchDeleteUser` / `getLastTime` — **4 寫端 ✅ 017**(`addUser`/`updateUser`/`deleteUser`/`batchDeleteUser`,經 BASE-WEB-WRAPPER `rev2-system-manage.ts`、Super-only、curl+CDP 驗);**餘 3(`sendCaptcha`/`verifyCaptcha`/`getLastTime`)+ `/auth/error` = ⊘ moot、rust-api 不實作**(2026-06-06 grounding:三者僅服務 base-web `views/alova/scenes/` framework demo 頁〔captcha 在 demo 頁、非 `pwd-login` 登入流;getLastTime 僅 mock;`/auth/error` orphan〕,且 **dynamic 路由模式(014)`getUserRoutes` 根本不送 alova demo menu → demo 頁不可達**、又走 `service-alova`/ApiFox mock 層而非 rust-api → rust-api stub 零產品價值。§11.2「stub」拍板 predate dynamic 不可達之認知;正式收掉、不列 Phase 5)

### 5.9 mock 驗證 follow-up(優先級低)

- [x] §3.1 `getMenuList` v1/v2 差異 — ✅ 019(base example 只用 v2、rev2 只實作 v2,research R3)
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
- **MODAL-WIRING ★**(DESIGN §7.4;**邊界 v1.5.0 擴**):允許動 `views/manage/**` 內 `// request` 一行(含 `modules/*-operate-{modal,drawer}.vue` create/update **+** `index.vue` 的 delete/batchDelete handler)+ **(v1.3.0)業務頁操作鈕 `hasAuth(<button_code>)` 可見性 gating**(`index.vue` v-if/JSX 條件渲染 + 共用元件如 `table-header-operation.vue` 附加 prop、安全 default;DESIGN §11.19)+ **(v1.4.0 (c))同模式新權限 modal + drawer trigger**(嚴格對齊既有 MenuAuth/ButtonAuth 範式〔NTree + 3 fetch fn + `watch(visible)`〕的「角色×某權限維度」runtime 編輯介面,不擴張到任意新 UI;DESIGN §11.21、amendment `d700434`)+ **(v1.5.0 (d))`views/manage/menu/**` 選單復原/re-parent 維運控制**(d-1 menu-operate-modal parentId selector〔種子父固定、僅自訂可搬 R2〕/ d-2 index.vue「顯示已刪除」toggle〔R3〕+ 已刪列 restore 觸發鈕〔孤兒父擋下 R1〕+ `page.manage.menu.*` i18n,嚴格限選單樹復原/父層級調整、不擴張任意新 UI;DESIGN §11.23、amendment `2b05a5e`),僅限「接 wrapper call / button gating / 同模式權限 modal / 選單復原·re-parent 控制」邊界(017 user CRUD 起用、022 用戶頁 + **024 角色/選單/用戶三頁 button gating**、023 endpoint-auth modal、**025 menu restore/re-parent UI**)

★ 兩條軌道**必須在 constitution v1.0.0 顯式授權**並寫明邊界、理由。其他 3 條軌道(BASE-WEB-ADAPT / BASE-WEB-WRAPPER / RUSTAPI-SOURCE-ISOLATION)為新增或全新寫、不違反直覺紀律。
