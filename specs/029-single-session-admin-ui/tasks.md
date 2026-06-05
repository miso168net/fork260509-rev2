---
description: "Task list — 029 single-session admin UI"
---

# Tasks: single-session admin UI

**Input**: Design documents from `specs/029-single-session-admin-ui/`(plan.md / spec.md / research.md / data-model.md / contracts/verification-commands.md / quickstart.md)

**Tests**: 含測。**純邏輯 seam** = typed accessor(`value_type="enum:on,off"` → `SessionMode`)**test-first(red→green)**;**wiring / stateful 類**(facade / watcher / AppState session_mode / endpoints / base-web)由 **acceptance 覆蓋**(in-crate `#[ignore]` live-DB〔Postgres + Redis〕+ curl/psql + CDP + base-web typecheck),無新純函式測。

**Organization**:依 user story 分階段。**注意 029 內聚性** — 控制面引擎(system_settings 表 / facade / `settings_watcher` / `AppState.session_mode` / 3 端點 / casbin+menu seed)**跨 US 共享**;故核心 production code 落 **Foundational**,**US1/US2** 加各自 base-web + acceptance,**US3/US4/US5** 多為 facet acceptance。**雙倉**(rust-api + base-web worktree;base-web 改走兩段式 commit〔§4.1〕)。**不改 028 enforcement 邏輯**。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:可並行(不同檔、無未完成依賴)。**[Story]**:US1-US5。rust 路徑相對 `rust-api/`、base-web 路徑相對 `base-web/`。
- 設計依據:[data-model.md](data-model.md)(schema/AppState/watcher/facade/endpoints/casbin+menu/wire/base-web)+ [contracts/verification-commands.md](contracts/verification-commands.md)(C-V:U/L/C 編號)。constitution **v1.6.0**(MODAL-WIRING ★ (e) ratified `3bd3eda`)。

---

## Phase 1: Setup(共用基建)

- [ ] T001 確認 029 **無新 workspace crate / 無新 dep**(`redis`/`sea-orm`/`serde_json`/`chrono` 皆既有);`dcargo build -p server` baseline 綠(221 單測基準)+ base-web `pnpm typecheck` baseline 0。**無 dep 變更**。下一 migration = `m20260529_000028`(接 027)。

---

## Phase 2: Foundational(阻塞所有 user story)

**⚠️ 此階段未完成前,任何 user story 不能開始。**

- [ ] T002 建 migration `migration/src/m20260529_000028_create_system_settings.rs`:CREATE TABLE `system_settings`(`setting_key VARCHAR(64)` PK / `setting_value VARCHAR` / `value_type VARCHAR` / `description VARCHAR NULL` + **§I.6 六審計欄**〔`created_at` not_null default now / `created_by` bigint null / `updated_at` null / `updated_by` null / `deleted_at` null / `deleted_by` null〕,沿 026/018 create 範本)+ seed 一列 `('single_session_default','off','enum:on,off','全站單一-session 預設')`;down drop table。`DeriveIden` enum `SystemSettings`。entity `entity/src/system_settings.rs`(Model 對齊)。註冊 `migration/src/lib.rs`(mod + Box::new、接 027 後)。
- [ ] T003 [P] [TDD] facade `server/src/model/facade/system_settings.rs`(唯一寫入管道、守 009):`get_all()->Vec<Model>` / `get(db,key)->Option<Model>` / `update(db,key,value,operator)->Result<bool,DbErr>`(`mutate_in_txn` + 011 `AuditOperation::Update`、entity_table `"system_settings"`、payload before/after via `audit_json()`、§I.6 `updated_at/by` 成對)+ typed accessor `parse_session_default(value:&str)->SessionMode`(或 `get_enum`)。**先寫失敗純單測 U1**(`"on"`→On / `"off"`→Off / 非法→Off fail-safe),red→green。`model/facade/mod.rs` 加 `pub mod system_settings;`。
- [ ] T004 [P] facade `server/src/model/facade/sys_user.rs` 加 `update_session_policy(db,user_id,policy:&str,operator)->Result<bool,DbErr>`(`update_many().col_expr(SessionPolicy,Expr::value(policy))` + 011 `AuditOperation::Update` entity_table `"sys_user"`;**只動 `session_policy` 欄、不碰 `current_session_id`**;data-model §7〔028〕預留)。
- [ ] T005 **AppState session_mode**(runtime 系統預設):`server/src/state.rs` `AppState` 加 `pub session_mode: Arc<RwLock<SessionMode>>`;`server/src/main.rs` boot 載入(`system_settings::get("single_session_default")` → parse;缺/空 → `config::parse_session_default()` fallback)→ `Arc::new(RwLock::new(initial))` 入 AppState;`server/src/auth/session.rs:190` `is_current` 與 `server/src/handler/auth.rs:150` login **改讀 `*state.session_mode.read().await`**(替 `state.jwt.single_session_default`)。**028 enforcement 邏輯不變**(`resolve_policy` 不動)。
- [ ] T006 **settings_watcher**:`server/src/auth/settings_watcher.rs`(新,鏡像 `policy_watcher.rs`):`spawn_settings_watcher(client, session_mode: Arc<RwLock<SessionMode>>, db)` + `const CHANNEL="settings:invalidate"` + `run_once` subscribe loop → 收到 reload `system_settings::get("single_session_default")` → write-lock 更新 `*session_mode` + `publish_settings_invalidate(&mut redis)`(`redis::cmd("PUBLISH").arg("settings:invalidate").arg(1)`,鏡像 `publish_policy_invalidate`)。`main.rs` boot `spawn_settings_watcher(...)`。`auth/mod.rs` 加 `pub mod settings_watcher;`。
- [ ] T007 **3 handlers + getUserList 加欄**:`server/src/handler/system_manage.rs` 加 `get_system_settings`(Res<列設定>)/ `update_system_setting`(`{key,value}` → facade update → **`publish_settings_invalidate`**)/ `update_user_session_policy`(`{userId,policy}` → `sys_user::update_session_policy` → **`DEL sess:{userId}`**〔`redis::cmd("DEL").arg(format!("sess:{user_id}"))`,使 028 is_current 下個請求 lazy-rehydrate 新 policy〕);+ `UserItem`(:149-164)加 `session_policy: String`、`user_item()`(:171-184)加參、`get_user_list` mapping 傳 `m.session_policy`(camelCase wire `sessionPolicy`)。
- [ ] T008 **endpoint 4-site 註冊(atomic、保 lint 綠)+ m029 seed**:`server/src/main.rs` 加 3 `.route`(`GET /systemManage/getSystemSettings` / `POST /systemManage/updateSystemSetting` / `POST /systemManage/updateUserSessionPolicy`,各掛 `enforce_mw` route_layer)+ `server/src/auth/endpoint_auth.rs` `ENDPOINT_REGISTRY` 加 3 `(method,path)` tuple + `server/tests/endpoint_coverage_lint.rs` `EXPECTED_ROUTE_COUNT` **30→33** + migration `migration/src/m20260529_000029_seed_settings_admin.rs`(3 casbin endpoint p-policy `('p','R_SUPER',<path>,<method>,'','','')` ON CONFLICT DO NOTHING + sys_menu 列 `route_name='manage_system-settings'`〔parent=`manage` subquery、menu_type=2、route_path `/manage/system-settings`、component 對齊 manage_user、i18n_key `route.manage_system-settings`、order ~4、status=1〕 + menu casbin `('p','R_SUPER','manage_system-settings','menu','','','')`;down DELETE by v1 + drop menu row)+ 註冊 lib.rs。**路徑 byte-identical 四方對齊**。

**Checkpoint**:backend 編譯綠、`endpoint_coverage_lint` **33**、3 端點(Super-only)存在、系統預設 runtime 可變、per-account 寫 + DEL sess 就緒、011 audit 已串、設定頁選單對 Super 可見。

---

## Phase 3: User Story 1 — 操作者經 UI 即時調整全站預設(Priority: P1)🎯 MVP

**Goal**:Super 在設定頁 toggle 全站單一-session 預設(on/off)、不重啟即生效(下個請求依新預設;繼承帳號多裝置收斂)。

**Independent Test**:Super 登入設定頁把預設改 on → 設定頁顯示新值 + 一個原本(預設 off)多裝置並存帳號下個請求收斂 7777(contracts C1 + L〔watcher reload〕)。

- [ ] T009 [US1] base-web 設定頁(**worktree base-web**):`src/typings/api/system-manage.d.ts` 加 `SystemSetting` 型(BASE-WEB-ADAPT)+ `src/service/api/rev2-system-manage.ts` 加 `fetchGetSystemSettings`/`fetchUpdateSystemSetting`(BASE-WEB-WRAPPER、`request<...>`、**不動 system-manage.ts**)+ **新 `src/views/manage/system-settings/index.vue`**(per-setting:單一-session 預設 on/off `NSwitch` → `fetchUpdateSystemSetting`;**MODAL-WIRING ★ (e)**、constitution v1.6.0)+ i18n `src/locales/langs/{en-us,zh-cn}.ts`(`route.manage_system-settings` + `page.manage.systemSettings.*`)。route/imports 由 elegant-router 自動生成。
- [ ] T010 [US1] live-DB `#[ignore]`(`system_settings.rs` 或 `settings_watcher.rs`):L1 facade get/update + 011 audit row;L2 settings-watcher `publish_settings_invalidate`→in-memory `session_mode` reload(驗值變);L3 boot load(有 row → 用 row、空 → config fallback)。
- [ ] T011 [US1] curl(contracts §3):`updateSystemSetting('single_session_default','on')`(Super)後,一個 `session_policy='inherit'` 帳號的舊 access getUserInfo → **`7777`**(端到端證 runtime toggle 生效、不重啟);Super `getSystemSettings`→`0000`。活體前 `dcargo build` + restart rust-api。
- [ ] T012 [US1] CDP isolated-context(project memory):Super 開設定頁 toggle 預設 + 確認選單可見;**不擾 user tab**。

**Checkpoint**:全站預設 runtime UI 調整可獨立驗(MVP)。

---

## Phase 4: User Story 2 — 操作者在使用者頁設定每帳號 policy(Priority: P1)

**Goal**:Super 在使用者管理頁看到每帳號 policy + 列上 action 設 inherit/on/off,立即對該帳號生效(DEL sess)。

**Independent Test**:對某帳號(多處並存)列 action 設 on → 該帳號下個請求收斂 7777、別帳號不受影響(contracts C2 + sess DEL 驗)。

- [ ] T013 [US2] base-web 使用者頁(**worktree base-web**):`src/typings/api/system-manage.d.ts` `User` 加 `sessionPolicy: string`(BASE-WEB-ADAPT)+ `rev2-system-manage.ts` 加 `fetchUpdateUserSessionPolicy({userId,policy})`(WRAPPER)+ `src/views/manage/user/index.vue` 加 `sessionPolicy` 欄(status 後、operate 前)+ 列「設定單一-session」**action**(小 `NModal`/`NSelect` inherit/on/off → `fetchUpdateUserSessionPolicy`;**MODAL-WIRING ★ (a)/(b)**)+ i18n `page.manage.user.sessionPolicy`。
- [ ] T014 [US2] live-DB `#[ignore]`(`sys_user.rs` 或 session live_tests):`update_session_policy` 寫 + 011 audit;handler 後 **`DEL sess:{uid}` 驗即時**(set policy on → sess key 消失 → is_current 下個請求依新 policy)。
- [ ] T015 [US2] curl(contracts §3):`updateUserSessionPolicy(uid,'on')`(Super)→ 該帳號舊 session getUserInfo `7777` + `redis EXISTS sess:{uid}`==0;另一帳號不受影響;`getUserList` 回應 grep `sessionPolicy`。
- [ ] T016 [US2] CDP isolated-context:使用者頁列 action 設某帳號 policy + 觀察收斂;policy 欄顯示。

**Checkpoint**:每帳號 policy UI 設定 + 即時生效可獨立驗。

---

## Phase 5: User Story 3 — 只有 Super 能檢視/變更(Priority: P2)

**Goal**:設定面 + 每帳號 policy 變更僅 Super;非-Super 看不到設定選單、變更被擋。

**Independent Test**:Admin/User 呼 3 端點 → `5003`;非-Super getUserRoutes 無 `manage_system-settings`(contracts C3)。

- [ ] T017 [US3] acceptance:curl Admin/User 對 `getSystemSettings`/`updateSystemSetting`/`updateUserSessionPolicy` → **`5003`**(enforce_mw、casbin Super-only);`getUserRoutes`(User token)grep **無** `manage_system-settings`(menu 走 §I.2 Casbin);CDP 非-Super 不見設定選單、Super 見。

---

## Phase 6: User Story 4 — 變更立即且正確、不誤踢(Priority: P2)

**Goal**:全站/帳號變更下個請求即生效;啟用帳號正常單一使用(含換新)不誤踢。

**Independent Test**:toggle 預設 → 下個請求即新判定(watcher);per-account 改 → 下個請求即生效(DEL sess);正常單一使用不誤踢(contracts C4)。

- [ ] T018 [US4] acceptance:curl `updateSystemSetting` on→下個請求即收斂(watcher,非重啟)、off→恢復;`updateUserSessionPolicy` 改→下個請求即生效(DEL sess,不被舊 cache 遮蔽);一個 on 帳號正常單一使用(含 ≥1s gap refresh)始終 `0000` 不誤踢(沿 028;**避同秒 refresh collision** §2.33)。

---

## Phase 7: User Story 5 — 變更可稽核(Priority: P3)

**Goal**:每次設定/policy 變更寫 011 操作稽核(操作者歸因)。

**Independent Test**:變更後 psql `sys_operation_log` 有對應 UPDATE 事件(operator)(contracts §2 audit)。

- [ ] T019 [US5] acceptance:psql `sys_operation_log` — `updateSystemSetting` 後有 `operation='UPDATE'` entity_table 對 `system_settings` 的 row(operator=Super);`updateUserSessionPolicy` 後有 `UPDATE` 對 `sys_user` 的 row(operator、含 session_policy before/after)。

---

## Phase 8: Polish & Cross-Cutting

- [ ] T020 [P] 守恆(contracts §4):`dcargo test -p server` 全綠(既有 **221** + 新 U1 typed accessor + 新 live `#[ignore]`)+ `entity_access_lint`(新 facade 經 entity、新 handler 守 009)+ `endpoint_coverage_lint` **33**(四方對齊)+ `Migrator::up` 0 + migration `m028`/`m029` `up→down→up` 可逆(throwaway DB:system_settings 表 + casbin/sys_menu seed 加/減/回、既有資料不動)+ **base-web `pnpm typecheck` 0**。
- [ ] T021 [P] (可選)prod image build(contracts §6,非強制 — 無新 workspace crate):`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api` + base-web `pnpm build`。
- [ ] T022 收尾:`superpowers:finishing-a-development-branch` → **雙倉兩段式 commit**(rust-api worktree push fork `rev2-admin-rust-api` + **base-web worktree push fork `rev2-admin-base-web`** + 外層各 SHA pin)→ `git merge --no-ff` 回 `rev2-admin-root`、保留 029 branch。收尾回填:DESIGN §6.x/§10 Phase 5(029 as-built)+ CHECKLIST(§1/§2/§4)+ MILESTONES(029 merge row、**內記 constitution v1.6.0 MODAL-WIRING (e) amendment `3bd3eda` ratified**、鏡像 025 (d))。push/merge 須 user 同意。

---

## Dependencies & Execution Order

- **Setup(T001)**:無依賴、先行。
- **Foundational(T002-T008)**:依賴 Setup;**阻塞所有 user story**。T002(migration+entity)先;T003/T004 可 [P](不同 facade 檔);T005(AppState session_mode,依 T003 facade get + config)→ T006(watcher,依 T005)→ T007(handlers,依 T003/T004/T005/T006)→ T008(端點註冊+m029,依 T007 handlers 存在、atomic 保 lint 33)。
- **US1(T009-T012)**:依賴 Foundational。T009(base-web,依 T007/T008 端點)→ T010/T011/T012(acceptance,依活體)。**MVP**。
- **US2(T013-T016)**:依賴 Foundational(T004/T007 update_session_policy + DEL sess + getUserList 加欄)。T013(base-web)→ T014/T015/T016(acceptance)。
- **US3(T017)** / **US4(T018)** / **US5(T019)**:依賴 Foundational + US1/US2;acceptance-only。
- **Polish(T020-T022)**:依賴所有 user story。

> **029 內聚性註記**:控制面引擎(system_settings / facade / watcher / session_mode / 端點 / casbin+menu seed)集中於 Foundational(T002-T008)→ US1/US2 加各自 base-web + acceptance、US3/US4/US5 為 facet 獨立 acceptance。US1 = 真正 MVP(全站預設 runtime UI)。

## Parallel Opportunities
- Foundational:T003(system_settings facade + TDD)∥ T004(sys_user update_session_policy)—— 不同 facade 檔。
- US1 base-web(T009)∥ US2 base-web(T013)在 Foundational 完成後可並寫(不同 base-web 檔:system-settings/ vs user/),但同 worktree、commit 需序列。
- Polish:T020 ∥ T021 —— 獨立驗收動作。

## Implementation Strategy
1. **Setup + Foundational**(T001-T008)→ system_settings 表/facade/TDD typed accessor / session_mode runtime / watcher / handlers / 端點 33 → backend 綠。
2. **US1**(T009-T012)→ 設定頁 + live/curl/CDP → **STOP & VALIDATE MVP**(C1:toggle on 端到端踢 7777)。
3. **US2 → US3 → US4 → US5**(T013-T019)→ 使用者頁 policy + Super-only + 即時性 + 稽核。
4. **Polish**(T020-T022)→ 守恆(lint 33 + migration 可逆 + base-web typecheck)+ (可選)prod build + 收尾(雙倉兩段式 + merge + 回填 + 記 v1.6.0 amendment)。

## Notes
- TDD:T003 typed accessor 唯一純函式 seam(`value_type`→SessionMode)先 red 後 green;其餘 wiring/stateful 由 live-DB(Postgres+Redis)+ curl/CDP + base-web typecheck 覆蓋(CLAUDE.md §3)。
- **實作一律 `superpowers:executing-plans` 起手、不用 `/speckit-implement`**(CLAUDE.md §3 核心紀律)。
- `git push`/`git merge` **不得**早於 T022 `finishing-a-development-branch`(constitution §I.4)。constitution v1.6.0 amendment 已於 plan 階段 ratify(`3bd3eda`、本 029 branch)。
- **雙倉**:base-web 改(T009/T013)在 base-web worktree commit + 外層 SHA pin;收尾(T022)雙倉兩段式。
- 關鍵設計提醒(data-model):`is_current`/login 只換系統預設**來源**(028 邏輯不變)/ `settings_watcher` 鏡像 `policy_watcher` / `updateUserSessionPolicy` 後 **必 DEL `sess:{uid}`**(否則被 028 PointerRec cache 遮蔽)/ 端點註冊 4-site atomic 保 lint 33 / `system_settings` §I.6 真審計欄 / `getUserList` additive `sessionPolicy`(§I.3 PASS)。
