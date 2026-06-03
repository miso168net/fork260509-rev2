# INTEGRATION-CHECKLIST.md — rev2 整合進度單一真相

> 本檔由 `.claude/hook-git-submodule-SOP.sh` SessionStart hook 每次 session 開頭 cat 全檔注入,作為跨 session 的進度延續錨。
> **編輯紀律**:只更新狀態,不擴張內容;新發現的 follow-up 寫上去、處理完的勾掉(✅)或刪掉;不寫實作細節(留給 `specs/<NNN>-<feature-name>/`)。
> **與 CLAUDE.md §6 分工**:當前 active feature 的 SPECKIT 快照在 CLAUDE.md §6 marker 區(spec-kit 將來自動同步用);本檔不重複那 4 行。

---

## 1. Current Focus

**階段**:**Phase 1 部署基建 全數完成(001~006)**;**Phase 2 後端基礎設施 全數完成(007~012)**;**Phase 3 RBAC 起手(013-auth-login-enforce)✅ + 014-dynamic-routes ✅ + 015-audit-middleware ✅ 皆已落地 + merge**(013=認證地基 login/getUserInfo/JWT/refresh + 首個 Casbin enforce 點 allow+deny + 首條真 base-web↔rev2 CDP wire;014=base-web 翻 dynamic auth route mode + 3 route endpoint〔getConstantRoutes 公開/getUserRoutes·isRouteExist JWT〕+ **業務 menu 可見性走 Casbin enforce 過濾**〔menu-visibility policy 9 rows + 013 enforcer + tree-prune,§I.2〕+ CDP Super-vs-User 側欄 menu deny 端到端;015=請求層 request-context middleware + 兩 append-only 審計表〔sys_access_log/sys_login_attempt〕+ 首個 xdb 消費者 + 真值 INET client_ip);**Phase 3 續做** = enforce 全路由 rollout + 完整 policy 矩陣 / 受管 RBAC policy 層〔casbin_rule soft-delete/protected/audit/CRUD〕/ axum-casbin fuller rewrite / redis pub-sub policy 失效通知(見 §1 下一步)。**JWT 機密管理已由 005/007 吸收 ✅**(見 [§4 Roadmap Phase 2](#4-roadmap--phase-狀態))。**Phase 4 主流業務起手(016-manage-role-user-list)✅**:3 條唯讀 systemManage endpoint(getUserList/getRoleList 分頁 + getAllRoles 全量)落地 + merge,**管理頁第一次看到真實 user/role 資料**(取代 013 stub)。**Phase 4 user 寫端 CRUD(017-manage-user-write)✅**:4 條 Super-only 寫 endpoint(addUser/updateUser/deleteUser/batchDeleteUser)+ sys_user schema 完補(業務欄 + **§I.6 審計欄 retrofit DONE** + id BIGSERIAL)+ 停用拒登 1000 + base-web MODAL-WIRING,**管理頁現可完整 CRUD users**(**已 merge+已推**)。**Phase 4 role 寫端 CRUD(018-manage-role-write)✅(已 merge+已推)**:4 條 Super-only 寫 endpoint(addRole/updateRole/deleteRole/batchDeleteRole)+ sys_role §I.6 retrofit(migration 016 +7 欄)+ casbin seed 017 + **有效角色集 `find_active_enabled`(deleted_at IS NULL AND status=1)統一**(停用/軟刪角色不授權·不可指派)+ **★ enforce_mw 改讀 DB-fresh 有效角色(B 決策)→ 停用/刪角色下次授權即時失效**(舊 token 不重登;順帶 D5 校正 017 update_user 審計時間源全 DB-side)+ 種子保護(code-based、不可刪/停用、可改 name·desc)+ base-web MODAL-WIRING,**管理頁現可完整 CRUD roles + status 真正生效於授權**。manage 另 3 條(getMenuList/v2、getAllPages、getMenuTree、需 sys_menu 表)續做。**Phase 4 menu DB-driven(019-manage-menu-list)✅(已 merge `a07ff13`+已推 origin)**:建 `sys_menu` 業務表(§I.6 凍結後**首張新建業務表**、create 即帶 6 審計欄、forward-only)為選單定義單一真相,**getUserRoutes 改讀 sys_menu(輸出逐字不變=回歸鐵律 D5)+ 管理頁三讀端(getMenuList/v2·getMenuTree·getAllPages,Super-only)共讀同源**;可見性仍走 Casbin enforce(§I.2 不變、010 policy 不動)。**server-only**(base-web menu fns 已存在 upstream、getUserRoutes wire 透明 → base-web 未動)。**Phase 4 menu 寫端 CRUD(020-manage-menu-write)✅(merge `0c73e3b`、保留 020 branch、**已推 origin**)**:4 條 Super-only 寫端(addMenu/updateMenu/deleteMenu/batchDeleteMenu)寫 019 `sys_menu`、閉成完整選單管理 CRUD = **D1 統一源 payoff**(編輯既有可見選單即時反映 getUserRoutes、`get_user_routes` code 不動);routeName·menuType immutable 雙鎖 + 種子/父子 guard + batch 兩段原子拒 + §I.6 成對審計;**不建表/欄**(用 019 sys_menu)、**D3 不碰 casbin 可見性**(010 不動);**rust-api + base-web 兩倉**(facade 寫端 + 4 handler + migration write policy + MODAL-WIRING)。MenuAuth·ButtonAuth 編輯(後續、動 010 policy)+ alova stub(Phase 5)續做(見 [§4 Phase 4](#4-roadmap--phase-狀態))。**Phase 4 MenuAuth(021-manage-menu-auth)✅(已 merge `827d1e9`+已推 origin)**:角色×選單可見性 **runtime 編輯**(casbin `remove_filtered_policy`+`add_policies` stock adapter HARD REPLACE、不 fork、即時反映無重啟)+ **per-role home**(sys_role +home、getUserRoutes 取第一 active 角色 id ASC)+ **redis pub-sub 失效通知**(`casbin:policy:invalidate`、**順帶實現 Phase 3 #3**)。閉合 menu arc(019 讀→020 寫→**021 指派**)、解 020「新選單指派前不顯 nav」缺口;自鎖 guard(R_SUPER 須留 manage_menu)。**+1 dep tokio-stream**(消費 redis pubsub Stream、親決)。**Phase 4 ButtonAuth(022-manage-button-auth)✅(已 merge `e103de0`+已推 origin)**:角色×按鈕權限 **runtime 編輯**(鏡像 021、Casbin `(role,code,'button')` HARD REPLACE 不 fork、無自鎖、即時反映)+ **per-menu 按鈕來源**(sys_menu.buttons 聚合 = registry、key-on-code)+ **pilot 用戶頁 hasAuth gating**(端到端生效:Admin 見編輯·不見刪除/新增、Super 全)+ **救活 toggle-auth demo**(seed 入 sys_menu + menu policy 三角色、保 B_CODE1/2/3 可驗);getUserInfo.buttons 改讀 Casbin、buttons.rs 退場;**getUserRoutes 逐字基線 re-base**(三角色 +function/toggle-auth、唯一 intended 例外);CDP 4/4(toggle-auth 3/2/1 + 用戶頁 gating + button-modal registry + 順補 021 menu-modal click-through)+ 守恆(server 189/lint 17)全綠;單一 migration 022、**無新 crate/dep**;Constitution v1.3.0 §IV 8/8 PASS。**menu+button auth arc 完整閉合**。

**最新進展**(滾動最近 2 條;完整歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)):
- **2026-06-03 021-manage-menu-auth 完整實作 + C-V 驗收 + Merge `827d1e9` 回 rev2-admin-root(--no-ff、保留 021 branch)+ 已推 origin**(rust-api worktree `dfa68c1..bbdadcb`〔T002-T008 + T016 doc〕push fork / base-web `0d07e9f..cbbf1ea`〔T009-T010〕push fork;外層 docs `0fbedcc` + SHA pin `7d7af9f` + finalize `f1ed901`)— **MenuAuth 角色×選單可見性 runtime 編輯**(casbin `remove_filtered_policy(0,[role,"","menu"])`+`add_policies` stock adapter HARD REPLACE、不 fork)+ **per-role home**(sys_role +home、getUserRoutes 取第一 active 角色 id ASC)+ **redis pub-sub 失效通知**(消費 dead_code AppState.redis、`casbin:policy:invalidate` publish+subscriber reload、**實現 Phase 3 #3**)。閉合 menu arc(019 讀→020 寫→**021 可見性指派**)、解 020「新選單指派前不顯 nav」缺口。subagent-driven 16 task〔T002-T016〕逐單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality)+ 最終 holistic = FR-001..010 + SC-001..007 全 trace。**acceptance 全綠**:指派/移除即時反映(無重啟)+ getRoleMenu 預載 + redis reload log + 自鎖 guard(R_SUPER 缺 manage_menu→2222、policy 不變)+ 正向實證(tree-prune 父隨子存活)+ Super-only(5003/3333)+ §I.6 成對 home audit + 多角色取第一 active(id ASC)+ **三角色 getUserRoutes 逐字==014/019 基線**(回歸鐵律)+ migration 021 up→down→up 可逆 + prod image build 綠 + front-nginx :21080 /api 4 端點。**+1 dep tokio-stream**(消費 redis pubsub Stream、親決、偏離原「無新 dep」、記 [plan Complexity Tracking](../specs/021-manage-menu-auth/plan.md))。Constitution v1.2.2 §IV 8/8 PASS(不建表/不 fork/無 amendment)。follow-up 見 §2.25
- **2026-06-03 022-manage-button-auth 完整實作 + C-V/CDP 驗收 + Merge `e103de0` 回 rev2-admin-root(--no-ff、保留 022 branch)+ 已推 origin**(rust-api worktree `bbdadcb..22aa0b5a` 7 commit push fork / base-web `cbbf1eab..bd210d29` 4 commit push fork)— **ButtonAuth 角色×按鈕權限 runtime 編輯**(鏡像 021、Casbin `(role,code,'button')` HARD REPLACE stock adapter 不 fork、無自鎖)+ **per-menu 按鈕來源**(sys_menu.buttons 聚合 registry、key-on-code)+ **pilot 用戶頁 hasAuth gating**(端到端:Admin 見編輯·不見刪除/新增)+ **救活 toggle-auth**(seed sys_menu + menu policy 三角色)。getUserInfo.buttons 改讀 Casbin(buttons.rs 退場)、3 Super-only handler(getAllButtons/getRoleButton/updateRoleButton)+ **endpoint policy seed(FINDING A、tasks.md 漏列、鏡像 021 補)**、button-auth-modal 接線(key-on-code)。單一 migration 022(button 10/menu 6/endpoint 3 policy + sys_menu 2 row + manage_user.buttons)、**無新 crate/dep**。subagent-driven T002-T014 逐單元 + 兩階段 review + opus final holistic = FR-001..011 + SC-001..007 全 trace。**acceptance 全綠**:三角色 getUserInfo.buttons 逐字新基線 + getUserRoutes re-base(唯一 intended 例外)+ updateRoleButton HARD REPLACE 即時反映 + 非法 code 2222 + Super-only 5003/3333 + **CDP 4/4**(isolated context、toggle-auth 3/2/1 + 用戶頁 gating + button-modal 6 registry + 順補 021 menu-modal click-through 清 §2.25 defer)+ migration up→down→up 可逆 + 守恆(server 189/lint 17/零 entity::/Migrator::up 0)+ 回歸 013/019/020/021 不破 + 清 3 處 stale dead_code。Constitution **v1.3.0** §IV 8/8 PASS(2 amendment `7a3ebd1`:MODAL-WIRING +button gating §11.19 / §I.2 toggle-auth 例外 §11.20)。follow-up 見 §2.25(2 項由本波清掉)

> 以下為預計`下一步` (不要再被合到`最新進展`了)

**下一步**: **022 ButtonAuth ✅ 完整收尾**(merge `e103de0` 回 rev2-admin-root + 已推 origin + finalize:MILESTONES row `e103de0`/DESIGN §10 Phase 4 as-built/§6 marker/本檔歸檔;022 branch 保留供 audit)。**menu + button auth arc 完整閉合**(019 讀 → 020 寫 → 021 menu 可見性指派 → 022 button 權限編輯 + pilot 生效 + demo 救活)。**下一步候選**([DESIGN §10](INTEGRATION-DESIGN.md)):**Phase 3 RBAC 深化** = #4 完整 policy 矩陣 + 全路由 endpoint enforce rollout / #5 axum-casbin fuller rewrite(metrics/error/observability、Phase 6 連動)/ #6 受管 RBAC policy 層(casbin_rule soft-delete 可復原 / protected / 走 011 audit / CRUD;**需 fork sea-orm-adapter → 須評估 §11.6 Amendment**);**Phase 4 餘** = 其餘業務頁 button gating(022 pilot 僅用戶頁、FR-009 out)/ 選單 restore·re-parent(FR-011 out)/ alova stub(sendCaptcha/verifyCaptcha/getLastTime,Phase 5)。**Phase 2 餘**(非獨立 feature):soft-delete 6-entity rollout(餘 entity 待建,見 §2.10)/ audit 其他 operation·entity 接線(沿用 011 `mutate_in_txn` pattern)

---

## 2. Follow-up Backlog

### 2.1 §11 設計拍板項索引 ✅ 全完成+已歸檔 (2026-05-27)

> **兩條鐵紀律**(已凍結於 [constitution v1.0.0](../.specify/memory/constitution.md) §I):
> 1. **base-web 為權威** — base-web 有的功能、rust-api 都要實作(設計範圍嚴格)
> 2. **menu 權限 Casbin enforce** — rev2 核心突破,即使動 base-web 也要做

完整 12 拍板項與軌道授權細節見 [DESIGN §11](INTEGRATION-DESIGN.md);spec-kit `/speckit-plan` 將自動對照 constitution 跑 Compliance Check。

> ### 2.2 ~ 2.7 全完成+已歸檔 (手動搬至 INTEGRATION-MILESTONES.md)
> ### 2.9 全完成+已歸檔
> ### 2.11 ~ 2.12 全完成+已歸檔 (手動搬至 INTEGRATION-MILESTONES.md)

### 2.8 feature 004-compose-port-orchestration follow-up

- [ ] `redis/redis-stack-server:latest` 未 pin tag(spec FR-012 明訂 latest;reproducibility 風險,日後可 pin 具體 semver)
- [x] **base-web SPA 經 front-nginx 端到端 CDP ✅ (2026-06-02 prod-stack CDP campaign)** — dev:read-list ✅ 016 / 寫端 modal-wiring ✅ 017 / **020 menu 全 CRUD CDP**(新增/編輯〔menuType radio disabled=D2〕/刪自訂/種子刪 2222/純父刪 guard「请先删除子菜单」);**prod base-web build(`VITE_SERVICE_BASE_URL=/api`)+ front-nginx `/api` strip 端到端 ✅**:prod CDP via :443 攔截 **17 API request 全走 `https://localhost/api/...`、0 走 vite proxy-default**(login/getUserInfo/getUserRoutes/getConstantRoutes + getMenuList/getAllPages + getUserList/getRoleList + DELETE /api/systemManage/deleteMenu)→ 證 prod SPA→front-nginx `/api` strip→rust-api 全鏈;strip 路徑無關 → user/role/menu 寫端同走此 strip
- [x] **prod base-web 已重 build ✅ (2026-06-02)**:`docker compose -f docker-compose.yml -f docker-compose.prod.yml build base-web`(`VITE_SERVICE_BASE_URL=/api`)→ `rev2-admin-base-web:latest` 取代 002 ApiFox build;dev cert seed 進 named volume `rev2-admin_front_nginx_certs`

### 2.10 feature 007-db-redis-connection follow-up

- [x] **`sys_user.id` 無 auto_increment** ✅ (2026-06-02,017 補完):007 proof migration 用顯式 seed id 1/2/3、無 sequence;017 migration 014 補 `BIGSERIAL`(raw SQL `CREATE SEQUENCE`+`SET DEFAULT`+`setval` 對齊 seed→next=4)、entity `auto_increment=true` 成對,addUser 動態建列可用(R2、見 [§2.20](#220-feature-016-manage-role-user-list-follow-up))
- [x] **CLAUDE.md §8.1 帳號名 stale** ✅ (2026-05-29):§8.1 已改為 rev2 權威 `Super/Admin/User`(id 1/2/3、runtime argon2id of `123456`)+ 修正 stale `m20241024_*` 路徑 → 真實 `m20260529_*` seed 檔 + 標明 role 為 Phase 3、sys_user 現僅 id/user_name/password
- [x] **migration invocation prod path** ✅ (2026-05-29,010 補掉):dev migrate override `cargo run --bin migration up`、prod migrate override `command [migration,up]` 經 entrypoint dispatcher,兩路徑皆於 010 stack up 時自動套用、prod acceptance 親驗(Phase 5 cleanup-job / CI migration step 沿用 prod path)
- [ ] **URL secret 驗證邊界**(`validate_secret` 為 opaque token 設計、套用到連線 URL 的已知 gap;research R4 知情、決定不另造 URL validator):(a) `.example` 的 `CHANGE_ME` 內嵌於 URL,而 `validate_secret` 是 case-insensitive **全等**比對(非 substring)+ URL >32 → 誤用 `.example` 會過 boot、拖到 connect 才以隱晦 auth error 失敗(⚠️ Unit 1 review「加 `CHANGE_ME` 進 `PLACEHOLDER_SECRETS`」**無效**,全等語意擋不住內嵌 substring);(b) 未來若用無密碼 redis(短 URL <32)會以 `length<32` 失敗、訊息與 URL 無關;(c) migration `main.rs` 讀 URL 為 raw(不過 validate),與 server `load_secret` 有意分流。日後若要強化:URL 專屬 validator 或 substring placeholder 偵測

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

- [ ] **token 簽發 DRY**(final review nit #2):`login` 與 `refresh_token` 各自 inline 簽 access+refresh(兩處重複),可抽 `issue_tokens(state,user_id,roles)->LoginToken` helper。非正確性風險(divergence 會被 US1/US3 acceptance 立即抓),最小機制階段 inline 反而清楚 access/refresh secret·TTL 配對 → defer,待第 4 條簽發路徑出現再抽。
- [ ] **`sys_user` facade `audit_json()` 未含 `nick_name`**(final review minor):013 加了 nick_name 欄但 soft-delete audit snapshot 未納入(顯示名、非敏感、現無害)。屬 soft-delete feature scope → 待 soft-delete 6-entity rollout(§2.10)接續時把 nick_name 補進 audit 快照。
- [ ] **user-enumeration timing side-channel**(Deviation D-003):login 的 user-not-found 路徑跳過 argon2 verify(快)、wrong-password 走 argon2(慢)= username 列舉 timing oracle。此威脅模型(admin panel、固定 3 帳號 seed、無公開註冊)下 note-and-defer;未來真用戶註冊流程落地時,標準緩解 = not-found 路徑對固定 dummy hash 做一次 argon2 verify 等化時序。
- [x] **prod `/api` wire ✅ (2026-06-02 prod-stack CDP)**:prod CDP via :443 攔截 17 API request 全走 `/api`(0 vite proxy)→ §11.11 prod 主流 front-nginx `/api/*` reverse proxy 端到端證實(login/getUserInfo/getUserRoutes/list/menu);Super dynamic-mode 側欄完整。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [x] **`bearer_token` 重複**(final review nit #1)✅ (2026-05-30):已抽到 `server/src/auth/bearer.rs` 共用(handler/auth.rs + enforce.rs 共用、4 單測移轉),消除 auth 解析碼 drift 風險。
- [x] **JWT `iss` 未驗證註解**(final review nit #3)✅ (2026-05-30):`jwt.rs` verify 已加註解說明 iss 為 informational、不驗(base-web token opaque、僅 secret+aud 須一致、`JWT_ISS==JWT_AUD`);未加冗餘 set_issuer。

### 2.17 feature 014-dynamic-routes follow-up

- [ ] **auth handler 前導 DRY**(T010 quality review):`get_user_routes`/`is_route_exist`(014)+ `get_user_info`(013)+ `enforce_mw` 四處重複 bearer→`jwt::verify`(access+JWT_AUD)→roles 前導(+失敗收斂 3333)。非正確性風險(drift 會被 acceptance 抓),最小機制階段 inline 清楚 → defer,待 enforce 全路由 rollout(§4 #4)多 handler 出現時抽 `verify_and_load_roles(state,headers)` helper(與 [§2.16](#216-feature-013-auth-login-enforce-follow-up) token-簽發 DRY 同類)。
- [ ] **tree-prune 父層偵測為結構性**(T004 quality review):`manage` 父層永不自身 enforce 判定、可見性純由子項衍生(現正確:manage 無自身 menu policy)。未來若 sys_menu 化 / 巢狀 menu 需「父層有自身可見性閘、獨立於子項」則須改寫(連動 [§4 Phase 3](#4-roadmap--phase-狀態) #4 全路由矩陣 / #6 受管 policy / Phase 4 菜單樹建構)。
- [~] **dynamic-mode prod /api + Super 側欄 ✅;Admin 中階 prod-CDP 仍輕 (2026-06-02)**:prod CDP via :443 證 dynamic-mode 走 front-nginx `/api`、Super 側欄完整階梯;**Admin 中階瀏覽器斷言未在 prod 單獨跑**(Super-vs-User 由 dev 014 CDP、Admin 部分集由單測覆蓋)。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)

### 2.18 constitution §I.6 SCHEMA-AUDIT-COLUMNS retrofit

- [x] 既有**業務主表** retrofit 6 審計欄缺口 — 對象 `sys_user` / `sys_role` 兩張(**✅ 皆 DONE**:sys_user 017 / sys_role 018)。**`sys_user` ✅ DONE(017,2026-06-02)**:migration 014 補 5 欄(`created_at`/`created_by`/`updated_at`/`updated_by`/`deleted_by`,`deleted_at` 009 已有),寫入路徑落實(`created_by` on insert / `updated_at`+`updated_by` 成對 on update / `deleted_at`+`deleted_by` 成對 on soft-delete、`*_by`=operator `i64` 由 015 ctx)。**`sys_role` ✅ DONE(018,2026-06-02)**:migration 016 補 7 欄(role_desc/status 業務 + §I.6 created_at/created_by/updated_at/updated_by/deleted_by;deleted_at 006 已有;**無 BIGSERIAL retrofit**——006 已 auto_increment),寫入路徑落實(create_role `created_by` on insert / update_role `updated_at`+`updated_by` 成對 col_expr DB-side / soft_delete `deleted_at`+`deleted_by` 成對、`*_by`=operator i64 由 015 ctx)。**`sys_user_role` 為 join 表、依 [§I.6 例外](../.specify/memory/constitution.md) 免**(append-only 三表 `sys_operation_log`/`sys_access_log`/`sys_login_attempt` + vendored `casbin_rule` 亦免)。標準已凍結 constitution §I.6(v1.1.0、forward-only);詳見 [DESIGN §10 Phase 4「審計欄 retrofit feature」](INTEGRATION-DESIGN.md);replay 015+ 新建表直接帶 6 欄、免 retrofit。

### 2.19 feature 015-audit-middleware follow-up

- [x] **經 front-nginx XFF/client_ip 端到端 ✅ (2026-06-02 prod-stack CDP)**:經 :443 login(含注入假 XFF `8.8.8.8`)→ `sys_access_log` 記 client_ip=front-nginx 容器 IP `172.22.0.6/32`、region=内网IP;**注入的 8.8.8.8 筆數=0** → 證 FR-006 region/client_ip 取直連 peer、非 XFF(代理後才顯現的價值、端到端證實)
- [ ] **`ctx_mw` = 第 5 處 bearer→`jwt::verify`→operator 重複**(承 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up) 同主題、plan N-5 明確 defer):待 enforce 全路由 rollout([§4 Phase 3](#4-roadmap--phase-狀態) #4)抽 `verify_and_load_*(state,headers)` helper 時一併收 `ctx_mw`
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
- [ ] **017 spec doc as-built 回填債(user_name unique index)**:tasks T002(d) / data-model §2.1 描述建 `uq_sys_user_user_name_active` partial unique index,但 as-built **跳過**(migration 003 已有同義 `sys_user_user_name_active_uniq`、避重複索引、C2 條件式「若無則建」條件為假)。spec doc 可補 as-built 註(同 [§2.14](#214-feature-011-audit-log-follow-up) `operator_ip` 回填債 pattern)。
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
- [ ] **`icon_type` seed as-built(data-model §2 未列、實際 seed=1)**:migration 018 對 5 個 iconify icon 列 seed `icon_type=1`(manage_user-detail 無 icon→NULL),data-model §2 seed 表未明列此欄(§1 欄定義有)。getUserRoutes(MenuRoute 無 iconType)不受影響、getMenuList wire iconType="1" 正確;屬 spec-doc 漏列的 as-built(同 [§2.14](#214-feature-011-audit-log-follow-up)/[§2.17](#221-feature-017-manage-user-write-follow-up) 回填債 pattern),可補 data-model 註。

### 2.24 feature 020-manage-menu-write follow-up

- [x] **CDP browser smoke ✅ (2026-06-02 dev + prod)**:dev :21080 020 menu **全 CRUD 端到端**(登入 Super→/manage/menu→新增 cdp_test〔列表出現 + psql created_by=1〕→新增子菜單→編輯〔menuType radio disabled=D2、改名、DB menu_type 不變、updated_at·by 成對〕→刪自訂〔删除成功出列〕→**刪種子 manage_menu→2222「不可删除系统内置菜单」**→**純父刪 cdp_dir〔非種子+有子〕→2222「请先删除子菜单」**);**prod :443 寫端 smoke**:DELETE `/api/systemManage/deleteMenu`(種子)→2222 toast、走 front-nginx /api strip
- [ ] **addMenu `component` 未驗證對齊 getAllPages 48 頁集**(承 [§2.23](#223-feature-019-manage-menu-list-follow-up) analyze A1):020 addMenu 收 `component` 字串原樣寫入、未對齊 server 端 48 靜態頁集(base-web form 由 getAllPages 下拉提供、UI 不可達非法值)。日後若要 server 端硬擋非法 component,加 facade 驗證(對齊 getAllPages 集)。
- [ ] **`normalize_page` 過時 `#[allow(dead_code)]` 仍在**(承 [§2.23](#223-feature-019-manage-menu-list-follow-up) code-hygiene):019 留的 nit;020 holistic review 已順手清 `de_parent_id` 同類 stale allow(tidy-up `dfa68c1`),但 `normalize_page` 的過時 allow/註解仍在(pre-existing、build 無警告);動 `handler/system_manage.rs` 時順手清。
- [ ] **停用(status=2)menu 顯示語意 as-built**(解 [§2.23](#223-feature-019-manage-menu-list-follow-up)「停用/軟刪 menu 顯示語意 → 020」):020 軟刪(deleted_at)menu 離開三讀端 + getUserRoutes;**停用(status=2)menu 仍顯於 getMenuList**(list 只濾 deleted_at、不濾 status),runtime getUserRoutes 由 Casbin 可見性過濾(非 status)→ 種子全 status=1、自訂停用 menu 無可見性 policy 故 nav 本就不顯。種子不可停用(guard)。日後若要「停用 menu 隱於 nav」需在 getUserRoutes 加 status 過濾(屬可見性語意擴充)。
- [ ] **MenuAuth/ButtonAuth 編輯 + 選單 restore + re-parent → 後續 feature**(FR-011 out):角色×選單可見性編輯(動 010 casbin menu policy)、軟刪選單復原、變更 parentId 皆 020 明示劃出,留獨立 feature。
- [x] **prod /api strip ✅ (2026-06-02)**:prod CDP via :443 020 寫端 DELETE `/api/systemManage/deleteMenu` 走 front-nginx strip(種子→2222)。見 [§2.8](#28-feature-004-compose-port-orchestration-follow-up)
- [ ] **`batch_delete_menus` 空 `ids`→`0000` no-op**(同 [§2.21](#221-feature-017-manage-user-write-follow-up)/[§2.22](#222-feature-018-manage-role-write-follow-up) user/role 版):handler 已有顯式 `if ids.is_empty()` early-return;UI 不可達(無勾選時 disabled-delete gate),benign。日後若新增可達路徑須補空陣列守衛。
- [ ] **update_menu 整欄替換:省略業務欄→NULL(非 UI 可達)**(同 [§2.22](#222-feature-018-manage-role-write-follow-up) role 版):`update_menu_query` col_expr 對**所有 17 業務欄**整欄替換,非 UI caller 送部分 payload 會把未送欄 NULL 化;**種子停用 guard 只擋 `status==Some(2)`**(顯式停用)、`status` **省略(None)→NULL** 不被擋 → 種子被非 UI caller 送省 status 的 payload 會 status NULL-brick。base-web edit form 送全 Model(`getSubmitParams()`)→ **UI 不可達**。**curl acceptance 注意**:編輯「要保留原狀的列」(尤其 seed)須從 getMenuList 取完整欄位再改目標欄(D1 payoff 即如此驗、否則汙染列)。日後若要嚴格 partial-update(None 保留現值)須改 facade(同改 017/018、屬更廣決策)。
- [ ] **create_menu 唯一前檢 TOCTOU(race→5000)+ seed/parent guard 雙查(benign)**(同 [§2.21](#221-feature-017-manage-user-write-follow-up)/[§2.22](#222-feature-018-manage-role-write-follow-up)):create_menu 的 route_name 唯一前檢在 txn 外,並發同名兩請求→後者撞 partial unique `sys_menu_route_name_active_uniq`→`DbErr`→handler 映 **5000(非 2222)**(罕見、資料完整性保住);delete/update 種子+父刪 guard 各自 `find_active_by_id`/`count_active_children`(handler)+ facade 內再 load = 雙查 + 微 TOCTOU 窗,但 route_name immutable(D2)→ 種子身分不變、中途軟刪 facade 回 Ok(false)→2222「菜单不存在」安全收斂。日後抽 `verify_and_load_*` helper(承 [§2.16](#216-feature-013-auth-login-enforce-follow-up)/[§2.17](#217-feature-014-dynamic-routes-follow-up))可順帶收斂;若要 race 也回 2222 可偵測 PG 23505 映 DuplicateRouteName。

### 2.25 feature 021-manage-menu-auth follow-up

- [ ] **home select 選項 page-key vs route-name 語意落差**(R6、MODAL-WIRING 劃出):menu-auth-modal 的 home `<NSelect>` 選項來自 `getAllPages`(**page key**),但 rev2 `home` 存的是 **route name**(LastLevelRouteKey);二者可不一致。現種子 `'home'` 同時是合法 route name + getAllPages 項故可運作;選非-route-name page 時 redis redirect 行為受 upstream 限制。修法:對齊 select 選項來源為 route names(屬 upstream form 結構、MODAL-WIRING ★ 軌道外)。
- [x] **CDP browser click-through ✅ 022 補(2026-06-03)**:022 收尾 CDP pass(isolated browser context)順補 021 menu-auth-modal 端到端點擊(同 /manage/role harness、編輯角色→菜单权限→tree 載入 9 節點),清此 defer。(原 curl 雙路徑〔:21081 直連 + :21080 /api proxy〕已證 4 端點 e2e;CDP 補視覺。)
- [x] **stale `#[allow(dead_code)]` ✅ 022 T014 清(2026-06-03)**:移除 `find_active`(sys_role.rs)/ `roles_for_user`(sys_user_role.rs)/ `normalize_page`(system_manage.rs、§2.24)3 處 stale allow(三者皆有 live 呼叫端);build warning-clean、189 單測 + lint 17 不破。
- [ ] **`set_role_menu` 兩個非原子窗口(R1 + T005 review、code 已註、accepted)**:① **`add_policies` 非單 txn**——adapter `add_policies` 為逐 rule loop,`remove_filtered`+`add_policies` 中途失敗→該角色暫態不完整;② **audit-fail-after-change**——casbin 非 sea-orm txn 參與者,故 audit 自帶 txn;audit txn 失敗→handler 回 5000 但 policy 變更**已生效**(in-place + auto_save 持久化、write lock 已釋)**不回滾**(FR-007 要審計記錄故硬 error、但變更已 live;異於 facade `mutate_in_txn` 原子失敗)。二者皆 admin 低頻 + redis reload + 重編修正(已記 `menu_auth.rs` doc、acceptance 接受)。日後若要嚴格原子可評估 adapter 層 txn(觸 §11.6)。
- [ ] **redis pub-sub 多 instance 真實 reload 未驗(單 instance only)**:021 失效通知僅在**單 instance** 驗(updateRoleMenu 後自收 PUBLISH→自身 subscriber `load_policy()` reload、log 證;旁證:psql 手改 menu policy + 手動 PUBLISH→同 instance reload 後 getUserRoutes 反映)。**多 instance 真實 fan-out(A 改→B reload)未驗**(現部署單 instance)。日後多 instance 部署時補跨實例 reload acceptance。
- [x] **ButtonAuth 編輯 ✅ 022 落地(2026-06-03,merge `e103de0`)**:角色×按鈕權限 runtime 編輯(鏡像 021 MenuAuth、Casbin `(role,code,'button')` HARD REPLACE 不 fork、無自鎖)+ per-menu 按鈕來源 + pilot 用戶頁 hasAuth gating + 救活 toggle-auth;getUserInfo.buttons 改讀 Casbin、buttons.rs 退場。詳見 [DESIGN §10 Phase 4 ButtonAuth as-built](INTEGRATION-DESIGN.md) + `specs/022-manage-button-auth/`;022 自身 follow-up 見 §2.26。

### 2.26 feature 022-manage-button-auth follow-up

- [ ] **cosmetic:toggle-auth B_CODE3 鈕 caption vs registry desc 用字異**:頁面 i18n `adminOrUserVisible`→「管理员和用户可见」 vs migration seed registry desc(data-model §1.2)「管理员或普通用户可见」;皆指 B_CODE3、gating 走 **code** 不受影響、非缺陷。若要求字面一致可對齊 seed desc 與頁面 i18n(後續、非 gating 範圍)。
- [ ] **其餘業務頁 button gating(FR-009 out)**:022 pilot 僅用戶管理頁;角色/選單管理頁 + 其他業務頁的操作鈕 gating 留後續 feature(本波刻意不做、避免改更多共用元件)。
- [ ] **prod image build 非強制未跑**:022 無新 crate(只加 module 到既有 server crate)→ 不適用「加 crate 須 prod image build」守則;final review 確認 Dockerfile 無新 COPY 缺口風險。若要絕對保險可選跑一次 prod target build。
- [ ] **`set_role_button` 非原子窗口 + 多 instance redis reload 未驗**:承 [§2.25](#225-feature-021-manage-menu-auth-follow-up) 同款(button_auth 共用 021 機制:`add_policies` 逐 rule loop 非單 txn / audit-fail-after-change / 單 instance only);final review 確認與已合併 021 baseline 一致、accepted。
- [ ] **用戶頁 row 操作鈕非 live-reactive(T007 review 觀察、非缺陷)**:`user/index.vue` 的「编辑/删除」gating 在 `columns` 的 JSX `render` factory 內以 `hasAuth()` 求值 → 僅 column 建構時計算一次、**不隨 `userInfo.buttons` in-place 變動即時重渲**(toolbar `:show-add` 是 template 綁定故 reactive、有微小不對稱)。現無流程在停留 /manage/user 時 mutate buttons(角色切換走重登 fresh mount、CDP 已驗);日後若加頁內 in-place 角色切換需注意(改法:row 鈕 gating 包進 reactive computed columns 或切頁 reload)。

## 3. 已完成里程碑

完整 commit 里程碑歷史見 [`docs/INTEGRATION-MILESTONES.md`](INTEGRATION-MILESTONES.md)(append-only、不在 SOP 注入,避免本檔膨脹)。

§1「最新進展」滾動最近 2 條;歷史在 MILESTONES.md 永久保留。歸檔流程見 [CLAUDE.md §7.5](../CLAUDE.md)。

---

## 4. Roadmap & Phase 狀態

對齊 CLAUDE.md §3 SDD-TDD 工作流 + [`INTEGRATION-DESIGN.md` §10 各 Phase](INTEGRATION-DESIGN.md)。本節為動態 status 追蹤;feature 詳細描述見 DESIGN §10。

### Phase 0 — 設計拍板 ✅ 全完成+已歸檔 (2026-05-28)

### Phase 1 — 部署基建 ✅ 全完成+已歸檔 (2026-05-28)

> 5 feature 全交(001 rust-api Dockerfile `a21e932` / 002 base-web Dockerfile `a70fa5f` / 003 TLS cert `cb5e1a1` / 004 compose 編排 `b4294c7` / 005 secret 注入 `068b2a8`),各 feature branch 保留供 audit;詳細 deliverable 見 [DESIGN §10 Phase 1](INTEGRATION-DESIGN.md) + [MILESTONES](INTEGRATION-MILESTONES.md)。

### Phase 2 — 後端基礎設施 ✅ 全完成+已歸檔 (2026-05-29)

### Phase 3 — 認證 + 動態選單(進行中)

- [x] **登入 + getUserInfo feature(013)** ✅ (2026-05-30 merge `ade723d` / SHA pin `bbabdbc`)— login/getUserInfo/refresh + JWT(HS256)+ **首個 Casbin enforce 點**(rev2 自家 axum middleware、allow+deny)+ sys_role/sys_user_role/nick_name + 首條真 base-web↔rev2 CDP wire;follow-up 見 [§2.16](#216-feature-013-auth-login-enforce-follow-up)
- [x] **dynamic mode 路由 feature(014)** ✅ (2026-05-30 merge `9d06347` / SHA pin `8965c8a`)— 3 route endpoint(`getConstantRoutes` 公開 / `getUserRoutes`·`isRouteExist` JWT、過濾在 handler 內)+ base-web 翻 dynamic + **menu 走 Casbin enforce 過濾**(menu-visibility policy 9 rows + 013 enforcer + tree-prune)+ CDP menu deny 端到端;follow-up 見 [§2.17](#217-feature-014-dynamic-routes-follow-up)
- [x] **audit-middleware feature(015)** ✅ (2026-06-01 merge `589a553` / SHA pin `cff9785`)— request-context middleware + 2 append-only 審計表(sys_access_log/sys_login_attempt)+ 首個 xdb 消費者 + 真值 INET client_ip;19 task/3 US、server 65+lint 17+xdb 9 + dev/prod acceptance 全綠;follow-up 見 [§2.19](#219-feature-015-audit-middleware-follow-up)(解 [§2.14](#214-feature-011-audit-log-follow-up)/[§2.15](#215-feature-012-sub-crate-setup-follow-up))
- [x] **Casbin redis pub-sub 啟用 ✅ 021 落地(已 merge `827d1e9` + 已推 origin)** — `casbin:policy:invalidate` channel:`set_role_menu`(021)/ `set_role_button`(022)policy 變更後 PUBLISH(消費此前 dead_code `AppState.redis` ConnectionManager、**022 共用零新增**)+ boot `spawn_policy_watcher` 獨立 pubsub 連線 SUBSCRIBE→`enforcer.write()+load_policy()` reload(+1 dep `tokio-stream` 消費 Stream)。單 instance 自收冪等;**多 instance 真實 reload 未驗、留 follow-up([§2.25](#225-feature-021-manage-menu-auth-follow-up)/[§2.26](#226-feature-022-manage-button-auth-follow-up))**。實現 [DESIGN §10 Phase 3](INTEGRATION-DESIGN.md) #3 / §6.3 v1 即啟用
- [ ] policy seed feature(三 role × 主流 endpoint)(**013 第一刀** migration 009 seed 示範路由 × {R_SUPER,R_ADMIN};**016 第二刀** migration 013 隨 endpoint 補 getRoleList×{SUPER,ADMIN}+getAllRoles×{SUPER,ADMIN,USER_COMMON};**016 後 017-022 每個寫/讀/auth feature 各隨 migration 逐條 seed 自身 Super-only endpoint policy(無 wildcard)**:017 user 寫 4 / 018 role 寫 4 / 019 menu 讀 3 / 020 menu 寫 4 / 021 menu-auth 4 / **022 button-auth 3〔getAllButtons/getRoleButton/updateRoleButton〕**;本 feature 退為**全路由 rollout + wildcard/矩陣治理**)
- [ ] **axum-casbin 重寫 feature**(2026-05-29 從 Phase 2 §11.6 重定位:Casbin Axum enforce 中介層 + rev2 自家 metrics/error/observability;需真實受保護路由才驗得了)(**013 已做第一刀**:`auth/enforce.rs` 最小機制 middleware + 單示範路由;**018 再演進**:enforce_mw 取角色源由 token `claims.roles` 改 `roles_for_user` DB-fresh〔B 決策、棄 013 D4 stateless-enforce、角色停用即時生效;[DESIGN §11.17](INTEGRATION-DESIGN.md)〕;本 feature = 全路由 rollout + observability,沿此 DB-fresh 基礎)
- [ ] **受管 RBAC policy 層 feature**(012 brainstorm 衍生:casbin policy 加 (a) soft-delete 可復原 (b) 不可刪 protected policy (c) policy 變更走 011 audit 記 operator (d) 統一 CRUD facade。需 fork sea-orm-adapter 的 load/remove → 動 §11.6「adapter=拷貝」前提、specced 時評估 Amendment;與 axum-casbin 重寫同期、因皆需 enforce/operator)

### Phase 4 — 主流業務(進行中)

- [x] manage list endpoints feature(6 read endpoint,對齊 mock)— **016 第一刀**(user/role 三條:getUserList/getRoleList 分頁 + getAllRoles 全量,2026-06-01 merge `5969d08` / SHA pin `81c56ef`)+ **019 第二刀**(menu 三條:getMenuList/v2 flat 分頁 + getMenuTree id/pId number + getAllPages 48 靜態頁集,Super-only,2026-06-02 merge `a07ff13`+已推 SHA-pin `239dcfd`);**6 read endpoint 全交**
- [x] **user 寫端 CRUD feature(017)** ✅ (2026-06-02 merge `617136d` / SHA pin `7bfb353`)— 4 條 Super-only 寫 endpoint(addUser/updateUser/deleteUser/batchDeleteUser)+ sys_user schema 完補(業務欄 + §I.6 審計欄 retrofit + id BIGSERIAL)+ 預設密碼 + 停用拒登 1000 + base-web MODAL-WIRING;管理頁閉成完整 user CRUD(詳見 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md);follow-up [§2.21](#221-feature-017-manage-user-write-follow-up))
- [x] **role 寫端 CRUD feature(018)** ✅ (2026-06-02 已 merge `8844105`+已推,SHA-pin `77c1fd6`)— 4 條 Super-only 寫 endpoint(addRole/updateRole/deleteRole/batchDeleteRole)+ sys_role §I.6 retrofit(migration 016)+ casbin seed(017)+ **有效角色集 `find_active_enabled` 統一(D3+D4)** + **★ enforce_mw 改 DB-fresh(B 決策)→ 角色停用/軟刪下次授權即時不授權·不可指派** + D5 校正 017 update_user 時間源 + 種子保護(code-based、不可刪/停用、可改 name·desc)+ base-web MODAL-WIRING;管理頁閉成完整 role CRUD + status 真正生效於授權(詳見 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md);follow-up [§2.22](#222-feature-018-manage-role-write-follow-up))
- [x] **menu DB-driven feature(019)** ✅ (2026-06-02 merge `a07ff13` 回 rev2-admin-root + 已推,SHA-pin `239dcfd`)— 建 `sys_menu` 業務表(§I.6 凍結後首張新建業務表、create 即帶 6 審計欄、seed 6 筆逐字重現 014 樹)為選單定義單一真相;**getUserRoutes 改讀 sys_menu(輸出逐字不變=D5 回歸鐵律,三角色 curl diff=0)** + 三讀端(getMenuList/v2·getMenuTree·getAllPages,Super-only policy019)共讀同源 + 純函式 `assemble_menu_tree`;可見性仍 Casbin enforce(§I.2 不變、010 不動)。**server-only**(base-web 未動);真 CDP /manage/menu 顯 6 筆真值。詳見 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md);follow-up [§2.23](#223-feature-019-manage-menu-list-follow-up)
- [x] **menu 寫端 CRUD feature(020)** ✅ (2026-06-02 merge `0c73e3b` 回 rev2-admin-root、保留 020 branch、**已推 origin**;SHA-pin `a9bc8e1`)— 4 條 Super-only 寫端(addMenu/updateMenu POST + deleteMenu/batchDeleteMenu DELETE)寫 019 `sys_menu`,把唯讀選單管理頁閉成完整 CRUD = **D1 統一源 payoff**(編輯既有可見選單即時反映 getUserRoutes、`get_user_routes` code 不動);**不建表/欄**(用 019 sys_menu、§I.6 審計欄已備)、**D3 runtime 零 casbin_rule 寫入**(migration 010 menu policy 不動);facade 寫端(create_menu 唯一前檢→2222 / update_menu〔不動 route_name·menu_type·parent_id〕/ soft_delete / count_active_children + 3 SQL-build seam 單測)+ handler 4 寫端(MenuCreateReq/MenuUpdateReq〔省 routeName·menuType·parentId=immutable 雙鎖〕+ `is_seed_menu`/`de_parent_id` + 種子+父子 guard + batch 兩段原子拒)+ migration 020 casbin write policy(4 R_SUPER)+ base-web wrapper 4 fn + MODAL-WIRING;**rust-api + base-web 兩倉**。MenuAuth·ButtonAuth 編輯 / 選單 restore / re-parent 留後續(FR-011 out)。詳見 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md) + `specs/020-manage-menu-write/`;follow-up [§2.24](#224-feature-020-manage-menu-write-follow-up)
- [x] **MenuAuth feature(021)✅ 已 merge `827d1e9`(--no-ff、保留 021 branch)+ 已推 origin** — 角色×選單可見性 **runtime 編輯**(`set_role_menu`:casbin `remove_filtered_policy(0,[role,"","menu"])`+`add_policies` stock adapter HARD REPLACE、**動 010 menu policy = runtime 增刪、不 fork**、即時反映無重啟)+ **per-role home**(migration 021 ALTER sys_role +home varchar + `update_role_home` §I.6 成對;getUserRoutes 取第一 active 角色 by id ASC〔`roles_for_user_ordered`〕→ home,fallback 'home')+ **redis pub-sub 失效通知**(見 Phase 3 redis 項)+ **自鎖 guard**(`menu_set_locks_out_super`:R_SUPER 須留 manage_menu→2222、leaf-only)。閉合 menu arc(019 讀→020 寫→**021 可見性指派**)、解 020「新選單指派可見性前不顯 nav」缺口。migration 021(+home seed 'home' + 4 R_SUPER write policy)+ facade(sys_menu id↔route_name 對映 / sys_role update_role_home / sys_user_role roles_for_user_ordered)+ auth(menu_auth 寫路徑 + policy_watcher)+ handler 4 端 + getUserRoutes home + base-web wrapper 4 fn + MODAL-WIRING;**rust-api + base-web 兩倉**、**+1 dep tokio-stream**。**ButtonAuth 仍另開**。詳見 `specs/021-manage-menu-auth/`;follow-up [§2.25](#225-feature-021-manage-menu-auth-follow-up)
- [x] **ButtonAuth feature(022)✅ 已 merge `e103de0`(--no-ff、保留 022 branch)+ 已推 origin** — 角色×按鈕權限 **runtime 編輯**(鏡像 021 MenuAuth、`set_role_button`:casbin `(role,code,'button')` `remove_filtered_policy`+`add_policies` HARD REPLACE stock adapter 不 fork、**無自鎖**〔button 非 nav access〕、即時反映無重啟、共用 021 redis pub-sub watcher)+ **per-menu 按鈕來源**(`aggregate_active_buttons`:sys_menu.buttons 聚合 registry、dedup-by-code 字典序、key-on-code)+ **pilot 用戶頁 hasAuth gating**(端到端:Admin 見編輯·不見刪除/新增、Super 全;table-header-operation 附加 show-add prop default-true 守共用元件 backward-compat)+ **救活 toggle-auth demo**(seed sys_menu function/toggle-auth + menu policy 三角色、保 B_CODE1/2/3 可驗)。getUserInfo.buttons 改讀 Casbin(`buttons_for_roles_via_casbin` union 字典序)、**buttons.rs 整檔退場**;3 Super-only handler(getAllButtons/getRoleButton/updateRoleButton)+ **endpoint policy seed**(FINDING A、tasks.md 字面漏列、鏡像 021 補);單一 migration 022(button 10/menu 6/endpoint 3 policy + sys_menu 2 row + manage_user.buttons)、**無新 crate/dep**。**getUserRoutes 逐字基線 re-base**(三角色 +function/toggle-auth、FR-010 唯一 intended 例外)。**CDP 4/4**(isolated context:toggle-auth 3/2/1 + 用戶頁 gating + button-modal 6 registry + 順補 021 menu-modal click-through)+ 清 3 處 stale dead_code。Constitution v1.3.0 §IV 8/8 PASS(2 amendment:MODAL-WIRING +button gating / §I.2 toggle-auth 例外)。**menu+button auth arc 完整閉合**。詳見 [DESIGN §10 Phase 4](INTEGRATION-DESIGN.md) + `specs/022-manage-button-auth/`;follow-up [§2.26](#226-feature-022-manage-button-auth-follow-up)
- [~] wire shape mapping feature(Output DTO + `From<Entity>` + pagination wrapper)— **016 已立骨架**(PageRes<T> 分頁外殼 + UserItem/RoleItem/AllRoleItem DTO + lint-safe primitive 映射 seam);**017 user_item 改吃 sys_user 真值**(gender/status i16→string、時間 rfc3339、operator i64→string,缺值仍 null)+ **018 role_item 改吃 sys_role 真值**(role_desc/status i16→string、create/update time rfc3339、operator i64→string,缺值仍 null)+ **018 role 寫端 DTO**(RoleCreateReq / RoleUpdateReq〔省 roleCode,D2 immutable〕)+ **019 menu 讀端 DTO/mapper**(MenuItem〔flat 分頁、parentId top→"0"〕 + MenuTreeNode〔id/pId number、root pId=0〕 + MenuNode 樹中介型 + `menu_node_to_route`〔MenuNode→MenuRoute、props 由路徑衍生〕 + `parent_id_to_wire` 純 helper、reuse 既有 MenuRoute/RouteMeta struct 保 wire 序)+ **020 menu 寫端 DTO**(MenuCreateReq〔parentId 用 `de_parent_id` 彈性反序列化 number\|string\|null→Option<i64>、`order` wire key〕 / MenuUpdateReq〔含 id:String、**省 routeName/menuType/parentId**,D2+FR-011 immutable〕 + CreateMenuData/UpdateMenuData facade 型)+ **022 button DTO**(`ButtonItem{code,desc}` 讀端 registry + `RoleButtonReq{roleId,codes:string[]}` 寫端 + 私有 `aggregate_active_buttons` 聚合 helper〔sys_menu.buttons flatten→dedup-by-code 字典序、getAllButtons + updateRoleButton F1 驗證共用〕、key-on-code、getUserInfo.buttons 仍 `Vec<String>` 不變);其餘 entity 隨各 endpoint 接線
- [~] alova-only endpoint 處理 feature(依 §11.2 拍板)— **017 已實作 alova 7 中的 4 寫端**(addUser/updateUser/deleteUser/batchDeleteUser,經 BASE-WEB-WRAPPER);餘 3 stub(sendCaptcha/verifyCaptcha/getLastTime)留 Phase 5
- [x] 菜單樹建構 feature(parent_id → nested children)— **✅ 019**:純函式 `assemble_menu_tree`(parent_id→nested、依 order 排序〔None 末〕、孤節點略過),供 getUserRoutes + getMenuTree 共用、可單測
- [x] 審計欄 retrofit feature(既有業務表補 §I.6 6 審計欄,綁 write 那一波,見 [§2.18](#218-constitution-i6-schema-audit-columns-retrofit))— **sys_user ✅ 017**(5 審計欄)+ **sys_role ✅ 018**(7 欄:role_desc/status + §I.6 5 審計欄);兩張業務主表審計欄 retrofit 皆完成、寫入路徑帶 operator(015 ctx)。**019 sys_menu = §I.6 凍結後首張新建業務表**(create 即帶 6 審計欄、forward-only、0 retrofit 債)→ 驗證 forward-only 標準對新建表生效(retrofit 對象僅既有表、不含此)

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
- [x] **Role.id** 型:**rev2 對外 = string**(§I.3 凍結、§11.10)— ✅ 016 落地(RoleItem/AllRoleItem/UserItem `id` 皆 i64→`.to_string()`、curl + CDP 驗;base-web typings `number` 與之不符但 **runtime 安全、決定不修**,見 [§2.20](#220-feature-016-manage-role-user-list-follow-up))
- [x] **MenuType enum**:1=directory / 2=menu(非舊推測「1=group / 2=page」)(§4.2.1)— ✅ 019(sys_menu `menu_type` i16:manage=1 目錄 / home+manage 子=2 葉;getMenuList wire `menuType` `"1"`/`"2"` 字串列舉、CDP /manage/menu 顯「目錄/菜单」驗)
- [x] **Status nullable**:`CommonRecord.status: EnableStatus | null` rust-api 須支援(§4.2.2)— ✅ 016 落地(UserItem/RoleItem `status: Option<String>`=None → 序列化顯式 `null`、缺欄回 null D2、CDP 確認 base-web render 不 crash R5)
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

- [x] `/route/getConstantRoutes` + `/route/getUserRoutes` + `/route/isRouteExist` 三 endpoint 完整實作 — ✅ 014(curl + CDP 驗;menu 走 Casbin enforce 過濾);**019 getUserRoutes 改 DB-driven 讀 sys_menu、輸出逐字不變**(endpoint 契約 / dynamic mode / home 欄不變;constantRoutes·isRouteExist 不動)
- [x] `getUserRoutes` 必含 `home` 欄(e.g. `"home"`)(§4.13)— ✅ 014(`UserRoute.home="home"`);**021 改 per-role**(取第一 active 角色 by id ASC 的 `sys_role.home`、None/查無→'home';未編輯時三角色逐字==基線、home 仍 'home' 保回歸鐵律)
- [x] `VITE_AUTH_ROUTE_MODE` 切換機制(預設 `static`)— ✅ 014 翻 `dynamic`(base-web `.env`、BASE-WEB-ADAPT、兩段式 commit)

### 5.5 base-web 環境配置

- [~] `VITE_SERVICE_BASE_URL` 切到自家 rust-api(非 ApiFox);`.env` / `.env.test` / `.env.prod` 三檔(FOLLOWUP §3.3 / MOCK §6.2)— **dev(`.env.test`,`pnpm dev` 走 --mode test)✅ 013 切 `http://rust-api:21081`**(vite proxy);**prod `.env.prod`→`/api` 仍待**(front-nginx reverse proxy + base-web rebuild,見 [§2.16](#216-feature-013-auth-login-enforce-follow-up) / [§2.8](#28-feature-004-compose-port-orchestration-follow-up))
- [ ] `pageExcludePatterns`(若 §11.5 選 b'-narrow):隱藏 alova / demo menu

### 5.6 業務驗證 error code

- [~] rev2 業務驗證錯誤碼 — 008 已釘 `5000`=infra sentinel、`5001-5999` 留 enforce/權限類(**013 用 `5003`「权限不足」= enforce deny**;base-web 對非列舉碼 fallback toast 不登出);refresh 絕不回 9999/9998/3333。**寫端業務驗證(017/018)用 `2222`(BizError、mock §4.11-grounded)** — user 寫端(用戶名重複/刪自己/不存在/非法 id·enum)+ **role 寫端(角色代碼重複/刪或停用種子/不存在/非法 id·enum)** 皆回 2222、**非 5xxx**(D8/D10,curl 驗;5xxx 留 enforce/infra 類);**020 menu 寫端 + 021 MenuAuth + 022 ButtonAuth 延續**(021:自鎖移 Super manage_menu / 角色不存在 / 選單不存在或已刪 / 非法 roleId 皆 2222、curl 驗;**022:非法 button code / 角色不存在 / 非法 roleId 皆 2222**;授權 5003/未認證 3333 仍由 enforce_mw)

### 5.7 base-web wrapper 軌道(若 §11.3 拍板 (B))

- [x] `BASE-WEB-WRAPPER` ✅ (2026-06-02,017+018+020):`src/service/api/rev2-system-manage.ts` — 017 加 user 4 fn(fetchAddUser/Update/Delete/BatchDelete)+ **018 加 role 4 fn(fetchAddRole/UpdateRole/DeleteRole/BatchDeleteRole)** + **020 加 menu 4 fn(fetchAddMenu/UpdateMenu/DeleteMenu/BatchDeleteMenu)**、`request<null>`、index.ts `export *`
- [x] `MODAL-WIRING` ★ (v1.2.0 邊界) ✅ (2026-06-02,017+018+020):017 接 user 3 placeholder + **018 接 role 3 placeholder** + **020 接 menu 5 placeholder**(menu-operate-modal handleSubmit〔add/addChild→add、edit→update〕+ menu/index.vue handleDelete/handleBatchDelete,只改 `// request`、`!error` 才成功);017 CDP 端到端驗、**018/020 typecheck 乾淨 + 逐字鏡像 017**(020 CDP browser smoke defer 見 [§2.24](#224-feature-020-manage-menu-write-follow-up)、已含 front-nginx :21080 `/api` proxy 4 寫端驗);餘 endpoint 隨各 feature 接線
- [~] `BASE-WEB-BUILD-CONFIG`(若 §11.5 b'-narrow):動 `build/plugins/router.ts` 加 `pageExcludePatterns` — **014 dynamic mode 下 moot**(getUserRoutes 只送業務 route、demo menu 根本不送 → 不需隱藏;此 ★ 軌道在 dynamic 維持下不需動,見 [DESIGN §10 Phase 3 #2](INTEGRATION-DESIGN.md))

### 5.8 alova 7 endpoint(若 §11.2 選實作)

- [~] `sendCaptcha` / `verifyCaptcha` / `addUser` / `updateUser` / `deleteUser` / `batchDeleteUser` / `getLastTime` — **4 寫端 ✅ 017**(`addUser`/`updateUser`/`deleteUser`/`batchDeleteUser`,經 BASE-WEB-WRAPPER `rev2-system-manage.ts`、Super-only、curl+CDP 驗);**餘 3(`sendCaptcha`/`verifyCaptcha`/`getLastTime`)留 Phase 5 stub**(依 §11.2 拍板)

### 5.9 mock 驗證 follow-up(優先級低)

- [x] §3.1 `getMenuList` v1 與 v2 差異確認(base example 只用 v2)— ✅ 019(grep `fetchGetMenuList`→`/systemManage/getMenuList/v2` 唯一;rev2 只實作 v2、不實作 v1,research R3)
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
- **MODAL-WIRING ★**(DESIGN §7.4;**邊界 v1.3.0 擴**):允許動 `views/manage/**` 內 `// request` 一行(含 `modules/*-operate-{modal,drawer}.vue` create/update **+** `index.vue` 的 delete/batchDelete handler)+ **(v1.3.0)業務頁操作鈕 `hasAuth(<button_code>)` 可見性 gating**(`index.vue` v-if/JSX 條件渲染 + 共用元件如 `table-header-operation.vue` 附加 prop、安全 default;DESIGN §11.19),僅限「接 wrapper call / button gating」邊界(017 user CRUD 起用、022 button gating)

★ 兩條軌道**必須在 constitution v1.0.0 顯式授權**並寫明邊界、理由。其他 3 條軌道(BASE-WEB-ADAPT / BASE-WEB-WRAPPER / RUSTAPI-SOURCE-ISOLATION)為新增或全新寫、不違反直覺紀律。
