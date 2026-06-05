---
description: "Task list — 028 single-session enforcement"
---

# Tasks: single-session enforcement

**Input**: Design documents from `specs/028-single-session-enforcement/`(plan.md / spec.md / research.md / data-model.md / contracts/verification-commands.md / quickstart.md)

**Tests**: 含測。**純邏輯 seam** `resolve_policy`(三態 × 系統預設 → bool)**test-first(red→green)**(spec FR-015);**wiring / stateful 類**(`session.rs`〔set_pointer/is_current〕/ `revoke_other_chains` / login·refresh·4-gate 串接)由 **acceptance 覆蓋**(in-crate `#[ignore]` live-DB〔Postgres + **Redis**〕+ curl/psql + CDP),無新純函式測。

**Organization**:依 user story 分階段。**注意 028 內聚性** — 單一-session 引擎(Claims `sid` / pointer / `is_current` / gate 檢查)**跨 US 共享**;故核心 production code 落 **Foundational + US1**,**US2/US3/US4/US5 多為各 facet 的獨立 acceptance**(production 邏輯已在 Foundational/US1;每階段 Independent Test 仍可獨立跑)。**028 = 後端引擎 + policy 儲存**(base-web 零改、無新對外端點;管理 UI = 029)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:可並行(不同檔、無未完成依賴)。**[Story]**:US1-US5。所有 rust 路徑相對 `rust-api/`。
- 設計依據:[data-model.md](data-model.md)(schema/config/Claims/pointer/狀態機/facade/handler)+ [contracts/verification-commands.md](contracts/verification-commands.md)(C-V:U/L/C 編號)。

---

## Phase 1: Setup(共用基建)

- [ ] T001 確認 028 **無新 workspace crate / 無新 dep**(`redis`/`uuid`/`chrono` 皆 `rust-api/server/Cargo.toml` 既有);`dcargo build -p server` baseline 綠(218 單測基準)。**無 dep 變更**。

---

## Phase 2: Foundational(阻塞所有 user story)

**⚠️ 此階段未完成前,任何 user story 不能開始。**

- [ ] T002 建 migration `rust-api/migration/src/m20260529_000027_alter_sys_user_session.rs`:`Table::alter().table(SysUser::Table)` **add_column** `current_session_id VARCHAR(36) NULL`(`.string_len(36).null()`)+ `session_policy VARCHAR(20) NOT NULL DEFAULT 'inherit'`(`.string_len(20).not_null().default("inherit")`);`SysUser` `DeriveIden` enum +2 variant(`CurrentSessionId`/`SessionPolicy`);`down` 反序 `drop_column`。沿 008/014 alter 範本。註冊 `rust-api/migration/src/lib.rs`(mod + Box::new,**接 026 之後**)。
- [ ] T003 [P] 改 entity `rust-api/entity/src/sys_user.rs`:Model +2 欄 `current_session_id: Option<String>` / `session_policy: String`(置於 §I.6 審計欄外、語義分組);其餘不動。
- [ ] T004 [P] 改 `rust-api/server/src/config.rs`:加 `enum SessionMode { On, Off }` + 系統預設 `single_session_default: SessionMode`(**028 預設 `Off`**;沿 JwtConfig 載入範式,從 env/設定載)。AppState/AppConfig 持有(供 `is_current` 讀)。
- [ ] T005 [P] [TDD-red] 在 `rust-api/server/src/auth/session.rs` 寫**失敗**純單測 U1:`resolve_policy` 全分支(`"on"`→true / `"off"`→false / `"inherit"`+`On`→true / `"inherit"`+`Off`→false / 未知字串→沿 system_default)。先 red(尚無實作)。
- [ ] T006 [TDD-green] 在 `rust-api/server/src/auth/session.rs` 實作 `pub fn resolve_policy(session_policy: &str, system_default: SessionMode) -> bool`(回「是否 enforce」;data-model §5)使 T005 綠;`auth/mod.rs` 加 `pub mod session;`。
- [ ] T007 **thread sid**(編譯綠、尚無 enforcement):`rust-api/server/src/auth/jwt.rs` `Claims` +`pub sid: String`(**required**)+ `sign(...session_id: &str)` 寫入 `sid`;`rust-api/server/src/handler/auth.rs` `issue_tokens(...session_id: &str)` 兩 token 都帶;`login_attempt_inner` **+`sid: &str` 參**(傳 issue_tokens)**+ 回傳 `session_policy`**(簽章 `Result<(LoginToken, i64, String), BizCode>`,data-model I1)、outer `login` 鑄 `sid`(`Uuid::new_v4()`)傳入 + 解構 `Ok((token, uid, policy))`;`refresh_token` 傳 `claims.sid` 給 issue_tokens(繼承)。+ U2(jwt sign→verify round-trip 帶 sid 斷言)。**此步只 thread sid + 回 policy**:login 暫不 set_pointer/revoke、refresh 暫不 is_current → 編譯綠、行為仍 = 027 + sid 多帶。

**Checkpoint**:schema/entity/config/resolve_policy(綠)/sid 已 thread,user story 可開始。

---

## Phase 3: User Story 1 — 啟用帳號新登入即時踢舊(Priority: P1) 🎯 MVP

**Goal**:policy=開的帳號,新登入即時使舊登入失效(舊 session 下個請求 → `7777`「账号在他处登录」→ 登出);舊 session 的 027 鏈被 revoke、refresh 亦被擋。

**Independent Test**:set 某帳號 `session_policy='on'`;A 處登入可操作;B 處同帳號登入;A 處 getUserInfo → `7777`、B 處 `0000`;psql `current_session_id` = B 的 sid(contracts L1 + C1)。

- [ ] T008 [US1] 在 `rust-api/server/src/auth/session.rs` 加 Redis GET/SET helper(`redis::cmd("GET"/"SET").arg(...).query_async`,沿 policy_watcher PUBLISH 範式)+ `pub async fn set_pointer(state, user_id, sid, session_policy)`:**先** `sys_user_facade::set_current_session(db,...)`(must-succeed)**再** Redis SET `sess:{uid}`={session_policy,sid}(best-effort)。+ `rust-api/server/src/model/facade/sys_user.rs` 加 `set_current_session(db, user_id, sid:&str)->Result<(),DbErr>`(update_many col_expr,唯一寫入管道、守 009)。
- [ ] T009 [US1] 在 `rust-api/server/src/auth/session.rs` 加 `pub async fn is_current(state, &Claims) -> bool`:Redis GET `sess:{uid}` → **miss 讀 `sys_user_facade::find_active_by_id` + 回填 Redis**(lazy rehydration)→ `resolve_policy(policy, config.single_session_default)`:false→**回 true**(不踢)、true→`claims.sid == current_session_id`。**I/O 失敗 → fail-open(回 true + `tracing::warn!`)**(data-model §6;非主授權閘)。
- [ ] T010 [US1] [P] 在 `rust-api/server/src/model/facade/sys_token.rs` 加 `pub async fn revoke_other_chains(db, user_id:i64, keep_chain:&str) -> Result<u64,DbErr>`(`update_many().col_expr(Status,REVOKED).filter(user_id == AND status==ACTIVE AND rotation_chain != keep_chain)`;沿 Reuse 整鏈 revoke 範式)。
- [ ] T011 [US1] 串 `rust-api/server/src/handler/auth.rs` `login` outer(承 T007 的 sid + policy):成功 + 015 審計後 → `create_chain_head`(027 沿用、chain 獨立 uuid)→ `if resolve_policy(&policy, default) { revoke_other_chains(db, uid, &chain)? }` → **一律** `session::set_pointer(state, uid, &sid, &policy)`(DB 失敗→`Internal(5000)`)。
- [ ] T012 [US1] 串 4 認證 gate 注入 `session::is_current`:`rust-api/server/src/auth/enforce.rs`(enforce_mw)+ `rust-api/server/src/handler/auth.rs`(get_user_info)+ `rust-api/server/src/handler/route.rs`(get_user_routes·is_route_exist);各 `verify_bearer` 成功後、role-lookup 前:`if !session::is_current(&state,&claims).await { return Res::err(BizCode::ModalLogout7777)/(...).into_response() }`。**ctx_mw 不加**。
- [ ] T013 [US1] 串 `rust-api/server/src/handler/auth.rs` `refresh_token`:`jwt::verify` 後、**`issue_tokens` 之前**(pointer-first,data-model I2)`if !session::is_current(&state,&claims).await { return Res::err(ModalLogout7777) }`;`issue_tokens(...,&claims.sid)` 繼承 sid → 027 rotate 不變。
- [ ] T014 [US1] 在 `rust-api/server/src/auth/session.rs` 加 in-crate `#[ignore]` env-gate(`DATABASE_URL`+`REDIS_URL`)live-DB:L1(set_pointer A→B:is_current(A)→false/(B)→true、psql current_session_id=B)+ L3(Redis DEL→is_current 自 sys_user 回填、不誤踢)+ L4(revoke_other_chains keep 不動、其餘 revoked)+ L5(Redis+sys_user 不可達→is_current **fail-open=true**)。
- [ ] T015 [US1] 跑 contracts §3 C1(`UPDATE sys_user SET session_policy='on'`;兩登入→第一 getUserInfo `7777`、第二 `0000`)+ 4 gate 覆蓋(getUserRoutes/enforce 端點被踢亦 `7777`)。活體前 `dcargo build` + `restart rust-api`。

**Checkpoint**:單一-session 踢舊引擎可獨立驗(MVP)。

---

## Phase 4: User Story 2 — per-account 可控 + 系統預設(Priority: P1)

**Goal**:policy 三態(inherit/on/off)+ 系統預設可控;028 預設 off → dormant(未啟用帳號零行為變化)。**production 已在 Foundational(resolve_policy/config/sys_user 欄)+ US1(is_current/login)**;本階段為 policy 各態 acceptance。

**Independent Test**:系統預設 off + 帳號 inherit → 不踢(027 行為);帳號設 on → 踢;帳號設 off(覆寫)→ 不踢(contracts L2 + C2)。

- [ ] T016 [US2] 在 `rust-api/server/src/auth/session.rs` 加 live-DB `#[ignore]` L2:`session_policy='off'`(或 'inherit' + 系統預設 Off)→ `is_current(任意 sid)` 回 **true**(不踢);多 active chain 並存不被 revoke。
- [ ] T017 [US2] 跑 contracts §3 C2:Admin `session_policy='off'` 兩登入並存(皆 `0000`)+ Super `session_policy='on'` 踢(交叉驗 per-account 隔離);驗 **dormant**(預設未動的 inherit 帳號、系統預設 off → 不踢)。

**Checkpoint**:per-account policy 開/關 + dormant 預設可獨立驗。

---

## Phase 5: User Story 3 — 被踢乾淨登出 + 提示(Priority: P2)

**Goal**:被取代 session 收 `7777` →base-web「账号在他处登录」modal→確認→登出,不卡死/不迴圈。**production = 7777 回傳(US1 T012/T013)+ base-web 既有 modalLogoutCodes 處理(零改)**;本階段為 UX acceptance。

**Independent Test**:policy=on 兩 tab 登入,舊 tab 操作 → 彈「账号在他处登录」modal + 導回 /login,無重複彈窗/無迴圈(contracts §5 CDP + C3)。

- [ ] T018 [US3] CDP isolated browser context(project memory):policy=on 帳號 tab1 登入 → tab2 同帳號登入 → 回 tab1 操作 → 彈「账号在他处登录」modal → 確認 → /login;同時驗 policy=off 帳號兩 tab 並存不踢(US4 共用)。不擾 user 既有 tab。
- [ ] T019 [US3] 跑 contracts §3 C3:被踢回應 grep **無 `3333/9999/9998`**、一律 `7777`(getUserInfo + 4 gate);refresh 被踢路徑亦非禁用碼(`7777` 先 / 鏈已 revoke 則 `8888`,皆合規)。確認失敗碼紀律(FR-010)。

**Checkpoint**:被踢乾淨登出 + 提示 + 失敗碼紀律可獨立驗。

---

## Phase 6: User Story 4 — 未啟用維持多裝置 + 正常使用不誤踢(Priority: P2)

**Goal**:未啟用帳號多裝置並存(=027);啟用帳號正常單一使用(含 token 自動換新)不誤踢。**production = resolve_policy off path(Foundational)+ refresh 繼承 sid(US1 T013)**;本階段為 no-regression acceptance。

**Independent Test**:off 帳號兩裝置並存皆正常;on 帳號單一處連續操作 + refresh(同 sid)始終 `0000`、不被踢(contracts C2/C4)。

- [ ] T020 [US4] 跑 contracts §3 C2-bis(policy=off 兩裝置並存不踢 = 027 行為)+ C4(policy=on 正常單一 refresh → `0000` + sid 繼承〔psql 新舊 token 同 sid 概念〕、**不誤踢**;被踢 session refresh → `7777`〔pointer-first〕或 `8888`〔鏈已 revoke〕、非禁用碼)。

**Checkpoint**:未啟用多裝置 + 啟用正常單一使用不誤踢可獨立驗。

---

## Phase 7: User Story 5 — 部署過渡一次性重登(Priority: P3)

**Goal**:pre-028 token(無 `sid`)落地後一次性乾淨重登。**production = Claims required sid(Foundational T007)**;本階段為過渡 acceptance。

**Independent Test**:持落地前簽發(無 sid)的 token → getUserInfo deserialize 失敗 → `3333`(refresh deserialize 失敗 → `8888`)→ 乾淨重登;028 新 token 含 sid 正常(contracts §3 C-外)。

- [ ] T021 [US5] 驗部署過渡:in-crate 測造「合法簽章但缺 sid」的 token payload → `jwt::verify` 因 required `sid` 缺失 **deserialize 失敗**(等價 pre-028 token)→ 證 getUserInfo/refresh 走 `3333`/`8888`(非 session 邏輯、與 7777 path 正交);028 新簽 token 含 sid → 正常。curl 以 028 新 token 正常 + 等價論證覆蓋(required 欄缺失即失敗)。

**Checkpoint**:部署過渡一次性重登不變式成立。

---

## Phase 8: Polish & Cross-Cutting

- [ ] T022 [P] 守恆(contracts §4):`dcargo test -p server` 全綠(既有 **218** + 新 U1/U2 + L1-L5)+ `entity_access_lint` **17**(新 session.rs 經 facade 讀寫、守 009)+ `endpoint_coverage_lint` **30**(**無新對外端點、不變**)+ `Migrator::up` 0 + migration `up→down→up` 可逆(throwaway DB:sys_user 2 欄 加/減/回、既有資料不動)。
- [ ] T023 [P] (可選)prod image build(contracts §6,非強制 — 無新 workspace crate):`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`。
- [ ] T024 收尾:`superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree push fork `rev2-admin-rust-api` + 外層 SHA pin)→ `git merge --no-ff` 回 `rev2-admin-root`、保留 028 branch。**base-web 不動**。收尾回填:DESIGN §6(sys_user session 欄 + pointer 混合 + per-account policy as-built)+ §10 Phase 5(028 done、**推進 029**)+ CHECKLIST(§1/§2.32/§4 + 029)+ MILESTONES。push/merge 須 user 同意。

---

## Dependencies & Execution Order

- **Setup(T001)**:無依賴、先行。
- **Foundational(T002-T007)**:依賴 Setup;**阻塞所有 user story**。T003/T004/T005 可 [P](不同檔);T006 依 T005(同檔、green);T007 依 jwt/auth(thread sid、最後做使編譯綠)。
- **US1(T008-T015)**:依賴 Foundational。T008(session set_pointer + sys_user facade)→ T009(is_current,依 T006 resolve + T008 sys_user facade)→ T010[P](sys_token facade)→ T011(login,依 T008/T010)→ T012(4 gate,依 T009)→ T013(refresh,依 T009)→ T014(live-DB,依 T008-T013)→ T015(curl,依活體)。**MVP**。
- **US2(T016-T017)**:依賴 Foundational(resolve_policy)+ US1(is_current/login);acceptance-only。
- **US3(T018-T019)**:依賴 US1(7777 回傳);acceptance-only(CDP + curl)。
- **US4(T020)**:依賴 Foundational(resolve off)+ US1(refresh 繼承);acceptance-only。
- **US5(T021)**:依賴 Foundational(required sid);acceptance-only。
- **Polish(T022-T024)**:依賴所有 user story。

> **028 內聚性註記**:單一-session 引擎(Claims sid / pointer / is_current / gate 檢查 / login set_pointer+revoke / refresh check)集中於 Foundational + US1(T002-T015)→ US2/US3/US4/US5 為各 facet 獨立 acceptance、**非**獨立可單獨交付(典型小內聚 feature;每階段 Independent Test 仍可獨立跑)。US1 = 真正 MVP。

## Parallel Opportunities
- Foundational:T003(entity)∥ T004(config)∥ T005(resolve_policy red)—— 不同檔。
- US1:T010(sys_token facade revoke_other_chains)可與 T008/T009 並寫(不同 facade 檔)。
- Polish:T022 ∥ T023 —— 獨立驗收動作。

## Implementation Strategy
1. **Setup + Foundational**(T001-T007)→ schema/config/resolve_policy(TDD 綠)/sid thread(編譯綠、無 enforcement)。
2. **US1**(T008-T015)→ session.rs(set_pointer/is_current)+ revoke_other_chains + login/refresh/4-gate 串接 → **STOP & VALIDATE**(L1/L3/L4/L5 + C1,MVP:policy=on 踢舊)。
3. **US2 → US3 → US4 → US5**(T016-T021)→ 依序驗 policy 各態 / 被踢 UX / no-regression / 部署過渡。
4. **Polish**(T022-T024)→ 守恆 + (可選)prod build + 收尾(兩段式 commit + merge + 回填 + 推進 029)。

## Notes
- TDD:T005/T006 唯一純函式 seam(resolve_policy)先 red 後 green;其餘 wiring/stateful 由 live-DB(Postgres+**Redis**)+ curl/CDP acceptance 覆蓋(CLAUDE.md §3)。
- **實作一律 `superpowers:executing-plans` 起手、不用 `/speckit-implement`**(CLAUDE.md §3 核心紀律)。
- `git push`/`git merge` **不得**早於 T024 `finishing-a-development-branch`(constitution §I.4)。
- 每完成一單元 commit;rust-api worktree 內改、收尾走兩段式(§4.1)。**base-web 零改**。
- 關鍵設計提醒(data-model):login_attempt_inner 回 `session_policy`(I1、避二次查)/ refresh pointer-first 在 issue_tokens 前(I2)/ is_current **fail-open**(I/O 失敗放行、非主閘,I3)/ sys_user 加系統欄 §I.6 PASS-by-scope(I4、029 加 update_session_policy facade)/ resolve_policy 回 **bool**(I5)/ pointer = Redis(讀)+ sys_user(持久真相)混合、miss 回填不誤踢 / 踢碼 gate 與 refresh 統一 `7777`。
