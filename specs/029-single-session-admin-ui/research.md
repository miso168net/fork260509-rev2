# Phase 0 Research: single-session admin UI

**Feature**: 029-single-session-admin-ui | **Date**: 2026-06-06
**Input**: [spec.md](spec.md) + [brainstorm](../../docs/superpowers/029-single-session-admin-ui.md)(7-拍板全決)

> CLAUDE.md §3 Phase 0 research 紀律:不信 brainstorm 命名,實 grep facade/entity/handler 真實型 + wire 3 端對齊 + struct/fn 命名。下列每項皆引現行 code(`rust-api/...` 相對 `rust-api/`、`base-web/...` 相對 `base-web/`)。029 **建 ON 028**(28 落地之 `sid`/`resolve_policy`/`is_current`/4-gate/refresh 行為**不改**;只把「系統預設 = immutable config」換成「runtime store」)。**§I.5:未 grep rev1 source。**

## 0. Grounding grep 結果(現行 code 實證)

| 對象 | 實證 | 結論 |
|---|---|---|
| is_current 系統預設讀點 | `auth/session.rs:156` `is_current(state,&claims)`;`:190` `resolve_policy(&rec.session_policy, state.jwt.single_session_default)` | `state.jwt.single_session_default`(immutable)→ 換 `*state.session_mode.read().await`(runtime);邏輯不變(D3) |
| login 系統預設讀點 | `handler/auth.rs:150` `session::resolve_policy(&session_policy, state.jwt.single_session_default)` | 同上 → `*state.session_mode.read().await`(D3) |
| AppState 欄位 | `state.rs:14-28` `db / redis: ConnectionManager / jwt: JwtConfig / enforcer: Arc<RwLock<Enforcer>>` | 加 **`session_mode: Arc<RwLock<SessionMode>>`**(獨立欄、非掛 jwt);仿 enforcer 的 `Arc<RwLock<>>` 形(D3) |
| policy_watcher 範本 | `auth/policy_watcher.rs:36` `spawn_policy_watcher(client: redis::Client, enforcer: Arc<RwLock<Enforcer>>)`;`:25` `CHANNEL="casbin:policy:invalidate"`;`:66 run_once`→`:71 pubsub.subscribe(CHANNEL)` | `spawn_settings_watcher(client, Arc<RwLock<SessionMode>>)` + `run_once` 訂閱 `"settings:invalidate"`;on-message 重讀 DB → write-lock 更新(D3) |
| publish 範本 | `auth/policy_watcher.rs` `publish_policy_invalidate` → `redis::cmd("PUBLISH").arg(CHANNEL).arg(1).query_async` | `publish_settings_invalidate(&mut redis)` 同形、channel `"settings:invalidate"`(D3) |
| UserItem struct | `handler/system_manage.rs:151` `pub struct UserItem {`(serde camelCase) | += `session_policy: String` → wire `"sessionPolicy"`(D5) |
| user_item() ctor | `handler/system_manage.rs:171-184` `fn user_item(...) -> UserItem`;body `:185` `UserItem {` 由 `list_active_paginated` Model rows 填 | += param、`m.session_policy` 直傳(D5) |
| AuditOperation | `model/audit.rs:15-19` `enum {Insert,Update,SoftDelete,Restore}`;`:25-28` str「UPDATE」 | 兩寫端(settings / policy)皆 **`Update`**(D8) |
| audit 寫鏈 | `model/audit.rs:35 AuditOperator{id,ip}`;`:42 AuditEvent{operation,entity_table,entity_id,payload_before/after,operator,trace_id}`;`:76 mutate_in_txn(db,f)` closure 回 `Ok((txn,result,Some(event)))` | facade 經 `mutate_in_txn` + `audit_json()` payload + operator=admin user_id、`ip:None`(D6/D8) |
| ENDPOINT_REGISTRY | `auth/endpoint_auth.rs:61` 註「30 entries」;`:73 const ENDPOINT_REGISTRY` | += 3 `(method,path)` tuple → **33**(D4) |
| route count lint | `tests/endpoint_coverage_lint.rs`;`auth/endpoint_auth.rs:493` `assert_eq!(ENDPOINT_REGISTRY.len(), 30)` | 30→33(D4) |
| casbin endpoint seed 範本 | `migration/.../000023_seed_endpoint_auth_policy.rs:19-23` `INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES ('p','R_SUPER','/systemManage/getAllEndpoints','GET','','','') ... ON CONFLICT DO NOTHING`;down `:36 DELETE WHERE ptype='p' AND v1 IN(...)` | 3 新 path 同形(空字串 v3-5、`ON CONFLICT DO NOTHING`、down by `v1 IN`)(D4) |
| casbin menu policy 範本 | `migration/.../000020_seed_menu_write_policy.rs:17` `INSERT INTO casbin_rule ... VALUES ('p','R_SUPER','...','...','','','')` | menu policy `('p','R_SUPER','manage_system-settings','menu','','','')`(D4 menu) |
| sys_menu manage 子列範本 | `migration/.../000018_create_sys_menu.rs:126-130` 欄序 `(parent_id, route_name, menu_type, menu_name, route_path, component, icon, icon_type, i18n_key, "order", status, hide_in_menu, keep_alive, active_menu)`;manage_user 列 `:127`=`((SELECT id ... route_name='manage'...), 'manage_user', 2, 'manage_user', '/manage/user', 'view.manage_user', 'ic:round-manage-accounts', 1, 'route.manage_user', 1, 1, NULL, NULL, NULL)` | system-settings 列照此欄序;`component` 用 `view.manage_system-settings`(同 manage_user 形)、`menu_type=2`、`order~4`、`icon='mdi:cog'`、`status=1`、餘 NULL(D4 menu) |
| §I.6 審計欄範本 | `m018_create_sys_menu`(create)+ `m026_create_sys_token`(create)含六審計欄;`migration/src/lib.rs:62-63` 最末 `000026 / 000027` | `system_settings` create 仿 m026、含 §I.6 六欄(create_*/update_*/deleted_*);next = `m20260529_000028_create_system_settings`、seed admin = `m20260529_000029_seed_settings_admin`(D1) |
| base-web User type | `typings/api/system-manage.d.ts:40-53` `type User = Common.CommonRecord<{...userName/nickName/status...}>` | block 內 += `sessionPolicy: string`(ADAPT、additive superset)(D5) |
| base-web service 層 | `views/manage/user/index.vue:5` `from '@/service/api'`(request 層、**非 service-alova**);`service/api/rev2-system-manage.ts` 已存(BASE-WEB-WRAPPER、`request<null>({url,method,data})` 形);`service/api/system-manage.ts:25 fetchGetUserList` | 新 wrapper 加 **`service/api/rev2-system-manage.ts`**(user 頁吃 request 層)、**不**改 `system-manage.ts`(D2/D6) |
| 既有 settings 頁 | `views/manage/{menu,role,user,user-detail}` — **無 settings 頁**(grep 確認、僅 theme-drawer) | `views/manage/system-settings/index.vue` 全新(D2) |

**wire 3 端對齊**:`getUserList` 唯一 wire 漂移面 = **additive** `sessionPolicy`。(a) rust:`UserItem` += `session_policy: String`(serde camelCase → `"sessionPolicy"`);(b) base-web typings:`User` += `sessionPolicy: string`;(c) service:`fetchGetUserList` 經 `Api.SystemManage.UserList` → 自動套(無 inline 改)。3 端對齊、§I.3 PASS via BASE-WEB-ADAPT。3 新端點為 rev2-additive(base-web mock 無對應、不撞凍結 wire)。

## 1. 決策(Decision / Rationale / Alternatives)

### D1 — system_settings = 通用 KV 表(非單一用途 / 非 typed-single-row)
- **Decision**:新 `system_settings` KV:`setting_key VARCHAR(64) PRIMARY KEY` / `setting_value VARCHAR` / `value_type VARCHAR` / `description VARCHAR NULL` + §I.6 六審計欄(create_at/by、updated_at/by、deleted_at/by)。同 migration seed 第一筆 `('single_session_default','off','enum:on,off','全站單一-session 預設')`。typed accessor 由 `value_type`("enum:on,off")映 `SessionMode`。migration `m20260529_000028_create_system_settings`(register `migration/src/lib.rs`)、entity `entity/src/system_settings.rs`。
- **Rationale**:`single_session_default` 是**第一個** setting,日後系統級開關共用此表(無需每旗標一張表/一條 migration)。KV + `value_type` 自描述 → typed accessor 解析;§I.6 審計欄因「**真人 admin 編輯**」必含(對比 028 sys_user 系統欄 PASS-by-scope 不含)。建表仿 `m026_create_sys_token`、審計欄仿 `m018_create_sys_menu`。
- **Alternatives**:單一用途表(`single_session_config` 一欄一列)→ 每新旗標一張表、不可擴;typed-single-row(固定 schema 每 setting 一欄)→ 加 setting 須 alter table、破「runtime 可加 setting」。皆否決取通用 KV。

### D2 — per-setting UI(非 dynamic metadata engine)
- **Decision**:每 setting 寫**專屬** UI section。029 只 ship「single-session 系統預設」一段(on/off switch → `fetchUpdateSystemSetting`),於全新 `views/manage/system-settings/index.vue`;rev2 service wrapper 於 `service/api/rev2-system-manage.ts`(user 頁吃 request 層、見 grounding;若未來頁吃 alova 再於對應層加)。
- **Rationale**:當前僅一 setting,per-setting 手寫 UI 最簡(YAGNI);「由 `value_type` 自動渲染表單」是投機抽象(單一 use-case 不值)。後端 KV 通用 ≠ 前端須通用 —— 前端按需逐 setting 加段即可。
- **Alternatives**:dynamic metadata engine(讀 schema 自動生 form 控件)→ 為 1 個 setting 建通用渲染器、過度工程(CLAUDE.md §2),否決。

### D3 — runtime 熱路徑 = in-memory `Arc<RwLock<SessionMode>>` + pub-sub `settings_watcher`(仿 `policy_watcher`)
- **Decision**:AppState(`state.rs`)加 `session_mode: Arc<RwLock<SessionMode>>`(獨立欄、非掛 `jwt`)。`main.rs` boot:讀 `system_settings.single_session_default` → 有則 parse `SessionMode`、無則 fallback `config::parse_session_default()` → `Arc::new(RwLock::new(initial))` clone 進 AppState。`is_current`(`auth/session.rs:190`)+ login(`handler/auth.rs:150`)由 `state.jwt.single_session_default` → `*state.session_mode.read().await`。新 `spawn_settings_watcher`(`auth/settings_watcher.rs`,仿 `auth/policy_watcher.rs` 的 `spawn_policy_watcher(client, Arc<RwLock<...>>)` + `run_once` 訂閱迴圈),channel const `"settings:invalidate"`:on-message 重讀 DB `single_session_default` → write-lock 更新。`updateSystemSetting` handler DB 寫後 `publish_settings_invalidate(&mut redis)` = `redis::cmd("PUBLISH").arg("settings:invalidate").arg(1)`(仿 `publish_policy_invalidate`)。
- **Rationale**:028 每請求 4-gate 讀系統預設 → 熱路徑;in-memory read-lock 近零成本、**不**每請求打 Redis/DB。pub-sub 讓多實例同步失效(仿已驗證的 027/casbin policy_watcher 範式)。boot 從 DB 載 → 重啟存活真相。
- **Alternatives**:**Redis-per-request**(每 gate GET → 熱路徑網路 I/O)、**DB-per-request**(每 gate DB 讀 → 更慢)、**direct-update**(updateSystemSetting 直寫 in-memory、跳 pub-sub → 單實例可、多實例失同步)。皆否決取 in-memory + pub-sub(對齊既有 policy_watcher 模式)。

### D4 — 3 新端點 Super-only(count 30→33、4-site 對齊)
- **Decision**:`GET /systemManage/getSystemSettings` / `POST /systemManage/updateSystemSetting {key,value}` / `POST /systemManage/updateUserSessionPolicy {userId,policy}`(handler 於 `handler/system_manage.rs`)。**4-site byte-identical path 註冊**:(1) `main.rs` `.route(path, get/post(handler).route_layer(from_fn_with_state(state.clone(), enforce_mw)))`;(2) `ENDPOINT_REGISTRY`(`auth/endpoint_auth.rs`)+= 3 tuple;(3) `endpoint_coverage_lint` `ENDPOINT_REGISTRY.len()` assert 30→33;(4) casbin seed `m20260529_000029_seed_settings_admin`:`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES ('p','R_SUPER',<path>,<method>,'','','') ... ON CONFLICT DO NOTHING`、down `DELETE WHERE ptype='p' AND v1 IN (3 path)`。menu 走 §I.2 Casbin:同 migration seed `sys_menu` 一列(`route_name='manage_system-settings'`、`menu_type=2`、`route_path='/manage/system-settings'`、`component=view.manage_system-settings`、`icon='mdi:cog'`、`order~4`、`status=1`、餘 NULL;欄序仿 m018 manage 子列)+ menu policy `('p','R_SUPER','manage_system-settings','menu','','','')`;runtime `getUserRoutes`(`route.rs`)`filter_routes` 經 `enforcer.enforce((role,'manage_system-settings','menu'))` 保留給 Super。
- **Rationale**:3 端皆系統級治理 → R_SUPER only(同 m023 接口治理三端範式)。4-site 對齊是 rev2 端點鐵紀律(任一漏 → lint 紅 / enforce 漏 / casbin 拒)。menu 經 Casbin enforce 而非 in-code map(constitution §I.2、避免 menu/route 可見性繞 Casbin)。
- **Alternatives**:端點開放給 R_ADMIN(系統級設定不應 admin 可改);menu 走程式內 map(破 §I.2)。皆否決。

### D5 — getUserList additive `sessionPolicy`(ADAPT、additive superset)
- **Decision**:`UserItem`(`handler/system_manage.rs:151-164`)+= `session_policy: String`、`user_item()` ctor(`:171-184`)+= param、由 `list_active_paginated` Model rows 傳 `m.session_policy`(028 已加此欄)。serde camelCase → wire `"sessionPolicy"`。base-web `typings/api/system-manage.d.ts` `User`(`:40-53`)+= `sessionPolicy: string`;service 經 `Api.SystemManage.UserList` 自動套(`fetchGetUserList` 不改)。
- **Rationale**:user 頁要顯示/編輯 per-account policy → list 須帶 `sessionPolicy`。純 additive(舊欄不動、舊 client 忽略新欄)→ §I.3 PASS via BASE-WEB-ADAPT(additive superset、非破壞 wire 凍結)。值來源是 028 預留欄、零新查詢。
- **Alternatives**:另開 `getUserSessionPolicy` 單查端點(多一往返、列表頁仍須逐列查);user 頁不顯示 policy(無法做 per-account UI)。皆否決取 additive。

### D6 — per-account 編輯 = user 頁 row action + `update_session_policy` facade + **DEL `sess:{uid}`**
- **Decision**:facade `sys_user::update_session_policy(db, user_id, policy, operator) -> Result<bool, DbErr>`(`update_many` `col_expr(SessionPolicy, value)` + 011 `AuditOperation::Update`、`entity_table "sys_user"`;**只**動 `session_policy` 欄、**不**碰 `current_session_id` —— 028 data-model §7 已預留此分離)。`updateUserSessionPolicy` handler DB 寫後 **`redis::cmd("DEL").arg(format!("sess:{user_id}"))`** 刪 028 pointer cache,使 028 `is_current` 在該 user 下一請求 **lazy-rehydrate** 新 policy。base-web user 頁(`views/manage/user/index.vue`)加「設定單一-session」row action(小 `NModal`/`NSelect`:inherit/on/off → `fetchUpdateUserSessionPolicy`)。
- **Rationale**:**DEL `sess:{uid}` 是正確性關鍵(brainstorm-derived)**:028 `is_current` 讀 `PointerRec`(Redis cache `{session_policy, current_session_id}`);若只改 DB 不刪 cache,新 policy 被 028 PointerRec **遮住** → 改了但下一請求仍套舊 policy(masked bug)。刪 cache → 028 從 sys_user 持久層回填新值。facade 為唯一寫通道(009 guard)、走 011 audit(真人改)。只動 policy 欄保 028 pointer 機器管理不變式。
- **Alternatives**:不刪 cache(DB 改了但 028 cache 遮住 → 改動無效、最隱蔽 bug);改走整列 update_user(碰 current_session_id、汙染 028 pointer);皆否決。刪 vs 立即 SET 新值 → 刪更簡(lazy rehydrate 由 028 既有 miss-回填路徑處理、無重複 SET 邏輯)。

### D7 — constitution amendment MODAL-WIRING ★ (e)(v1.6.0、ratified 3bd3eda)
- **Decision**:029 新 settings 頁的「DB 寫 → 即時生效」UI 互動歸 MODAL-WIRING ★ **(e)**(constitution §IV gate 7 之新增涵蓋型),v1.6.0 已 ratify(commit `3bd3eda`)。Constitution Check **8/8 PASS-with-amendment**(gate 7 由 (e) 解)。
- **Rationale**:028 brainstorm 把「base-web modal 觸發 rust 狀態變更」歸 MODAL-WIRING ★ (a)–(d);029 settings 頁 toggle 系統預設(寫 KV → pub-sub → in-memory 即時生效)是新 wiring 形,需 (e) 涵蓋。constitution 修訂走 amendment 流程(逐行給 user 過目、ratify 後固化);(e) 是釐清式擴張(非 §II 拍板變更、非破舊不變式)。
- **Alternatives**:硬塞既有 (a)–(d)(語義不符、settings 非 per-account modal);不修 constitution 留 gate 7 未覆蓋(Constitution Check 卡關)。皆否決,取 ratified (e)。

### D8 — 011 `AuditOperation::Update`(settings + policy change 兩寫端)
- **Decision**:`updateSystemSetting`(`system_settings::update`)與 `updateUserSessionPolicy`(`sys_user::update_session_policy`)**皆**用 011 `AuditOperation::Update`(`model/audit.rs:17`)。經 `mutate_in_txn(db, closure)`(`:76`)、closure 回 `Ok((txn, result, Some(event)))`;`AuditEvent{operation:Update, entity_table:"system_settings"|"sys_user", entity_id, payload_before/after via audit_json(), operator: Some(AuditOperator{id: <admin user_id>, ip: None}), trace_id}`;`sys_operation_log::write_in_txn` 落審計列。§I.6 `updated_at/updated_by` pair 由 facade `col_expr` 同步寫。
- **Rationale**:兩者皆「真人 admin 修改既有列」→ 語義為 `Update`(非 Insert/SoftDelete/Restore)。011 audit 為 rev2 變更治理鐵紀律(facade 唯一寫通道 + txn 內審計、原子)。operator = 請求 ctx/claims 的 admin user_id、`ip:None`(沿 facade 寫端慣例)。
- **Alternatives**:settings 寫不過 011 audit(系統設定改動無稽核軌、破治理);用 Insert(語義錯、列已存在)。皆否決。

## 2. 無 NEEDS CLARIFICATION
spec 0 個 NEEDS CLARIFICATION;brainstorm 已逐軸全決(7 拍板)+ 建 ON 028 已落地之引擎(`sid`/`resolve_policy`/`is_current`/4-gate/refresh/sys_user 系統欄 § 全現行)。Phase 0 無殘留未決。**無新 workspace crate**(redis/sea-orm/serde/chrono 皆 server 既有)→ prod image build 非強制(列可選驗收;強制驗收 = base-web typecheck + build)。
