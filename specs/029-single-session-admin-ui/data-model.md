# Phase 1 Data Model: single-session admin UI

**Feature**: 029-single-session-admin-ui | **Date**: 2026-06-06

> 建立在 028 之上;**不改 028 enforcement 邏輯**(`resolve_policy`/`is_current`/4 gate/refresh 行為全不動)—— 唯一改變是「系統預設值的來源」從 immutable config 變成 runtime store(`system_settings` 表 + hot-path `Arc<RwLock<SessionMode>>`)。所有 rust 路徑相對 `rust-api/`、base-web 相對 `base-web/`。**無新 workspace crate、無新 dep**(redis/sea-orm/serde/chrono 既有)。

## 1. schema:新建 `system_settings` KV 表(migration `m20260529_000028_create_system_settings`)

**新建表**(接現有最後 migration `m20260529_000027` 之後)。通用「系統設定」基礎(KV);`single_session_default` 是**第一個** setting。

| 欄 | PG 型 | 約束 | 說明 |
|---|---|---|---|
| `setting_key` | VARCHAR(64) | **PRIMARY KEY** | 設定鍵(如 `single_session_default`) |
| `setting_value` | VARCHAR | NOT NULL | 設定值(字串;由 `value_type` 詮釋) |
| `value_type` | VARCHAR | NOT NULL | 值域詮釋(如 `enum:on,off`) |
| `description` | VARCHAR | NULL | 人類可讀說明 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | §I.6 審計 |
| `created_by` | bigint | NULL | §I.6 審計 |
| `updated_at` | timestamptz | NULL | §I.6 審計 |
| `updated_by` | bigint | NULL | §I.6 審計 |
| `deleted_at` | timestamptz | NULL | §I.6 審計(soft-delete) |
| `deleted_by` | bigint | NULL | §I.6 審計 |

**§I.6 適用(real audit、非 PASS-by-scope)**:`system_settings` 是**人類 admin 編輯**的設定列 → 六審計欄為**真實審計**(對比 028 的 `current_session_id`/`session_policy` 系統欄走 §I.6 PASS-by-scope)。

**migration(create 範本沿 `m20260529_000026_create_sys_token`、§I.6 審計欄沿 `m20260529_000018_create_sys_menu` lines 75-92)**:
- `#[derive(Iden)] enum SystemSettings { Table, SettingKey, SettingValue, ValueType, Description, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, DeletedAt, DeletedBy }`。
- `up`:`create_table(... .col(ColumnDef::new(SystemSettings::SettingKey).string_len(64).not_null().primary_key()).col(SettingValue.string().not_null()).col(ValueType.string().not_null()).col(Description.string().null())` + 六審計欄(`CreatedAt.timestamp_with_time_zone().not_null().default(Expr::current_timestamp())`、`CreatedBy.big_integer().null()`、`UpdatedAt.timestamp_with_time_zone().null()`、`UpdatedBy.big_integer().null()`、`DeletedAt.timestamp_with_time_zone().null()`、`DeletedBy.big_integer().null()`)。
- **同一 migration seed 第一列**(`up` 內接 `INSERT` 或 `exec_stmt`):`('single_session_default', 'off', 'enum:on,off', '全站單一-session 預設')`(`created_by`=NULL 系統種子;審計欄其餘 NULL/now())。
- `down`:`drop_table(SystemSettings::Table)`。
- 註冊 `migration/src/lib.rs`(mod + `Box::new`,接 027 之後)。
- up→down→up 可逆(throwaway DB;表整建/整拆)。

## 2. entity `entity/src/system_settings.rs`(新)

```rust
// SeaORM Model(對齊上表 10 欄):
#[sea_orm(primary_key, auto_increment = false)]
pub setting_key: String,            // PK、非自增
pub setting_value: String,          // NOT NULL
pub value_type: String,             // NOT NULL,如 "enum:on,off"
pub description: Option<String>,    // NULL
pub created_at: DateTimeWithTimeZone,        // NOT NULL
pub created_by: Option<i64>,
pub updated_at: Option<DateTimeWithTimeZone>,
pub updated_by: Option<i64>,
pub deleted_at: Option<DateTimeWithTimeZone>,
pub deleted_by: Option<i64>,
```
沿既有 entity 範式(`Relation` empty / `ActiveModelBehavior` default)。

## 3. hot-path runtime 預設:`AppState.session_mode: Arc<RwLock<SessionMode>>`

028 的 `is_current`(`auth/session.rs:190`)與 `login`(`handler/auth.rs:150`)現讀 **immutable** `state.jwt.single_session_default`。029 改為 runtime store:

- **`AppState`(`server/src/state.rs:14`)新增欄**(獨立於 `jwt: JwtConfig`,後者在 `:22`):
  ```rust
  /// 029:系統單一-session 預設的 runtime store(settings_watcher 寫、is_current/login 讀)。
  pub session_mode: Arc<RwLock<SessionMode>>,   // 既有 Arc/RwLock import(state.rs:7/9)
  ```
- **`main.rs` boot**:啟動時 `system_settings::get(&db, "single_session_default")` →
  - 有列 → typed accessor 解析(§4)→ `SessionMode`;
  - 無列(理論不會、seed 已建)→ fallback `config::parse_session_default()`(028 既有 config 解析,預設 `Off`);
  - `let session_mode = Arc::new(RwLock::new(initial)); ` → clone 進 `AppState`。
- **改 2 個讀點**(028 行為不變、只換來源):
  - `is_current`(`auth/session.rs:190`):`state.jwt.single_session_default` → `*state.session_mode.read().await`。
  - `login`(`handler/auth.rs:150`):同樣 `state.jwt.single_session_default` → `*state.session_mode.read().await`。

> `SessionMode { On, Off }` 沿 028 既有 enum(`config.rs` / `auth/session.rs`);029 不重定義。

## 4. `settings_watcher`(`auth/settings_watcher.rs`,新;MIRROR `auth/policy_watcher.rs`)

逐一鏡射 `policy_watcher.rs`(channel `"casbin:policy:invalidate"` → 改 `"settings:invalidate"`;reload enforcer policy → 改 reload `single_session_default` 寫進 `session_mode`):

- **`spawn_settings_watcher(client: redis::Client, session_mode: Arc<RwLock<SessionMode>>)`**(對 `spawn_policy_watcher` `policy_watcher.rs:36`):重連/重訂閱韌性 loop。
- **`run_once(...)`**(對 `policy_watcher.rs:66`):`pubsub.subscribe("settings:invalidate")` → 收訊 → `system_settings::get(&db, "single_session_default")` 重讀 → typed accessor 解析 → `*session_mode.write().await = new`。
  > watcher 需 DB handle:`spawn_settings_watcher` 簽章另帶 `db: DatabaseConnection`(或 reload closure 內持有),沿 policy_watcher 取得 reload 來源的方式。
- **`publish_settings_invalidate(redis) `**(對 `publish_policy_invalidate` `policy_watcher.rs:103`):`redis::cmd("PUBLISH").arg("settings:invalidate").arg(1)`,reply(subscriber count)丟棄。
- **wire 點**:`updateSystemSetting` handler 在 **DB write 成功之後** call `publish_settings_invalidate(&mut redis)`(同進程亦由 watcher 收訊重載 → 跨副本一致)。
- `main.rs` 啟動時 `spawn_settings_watcher(client.clone(), session_mode.clone(), db.clone())`(緊鄰既有 `spawn_policy_watcher` 呼叫)。

## 5. facade `model/facade/system_settings.rs`(新,唯一寫入管道、守 009 lint)

```rust
pub async fn get_all(db) -> Result<Vec<Model>, DbErr>                          // 列全部(未 soft-delete)
pub async fn get(db, key: &str) -> Result<Option<Model>, DbErr>               // 取單列(filter deleted_at IS NULL)
pub async fn update(db, key: &str, value: &str, operator) -> Result<bool, DbErr>  // 改 setting_value + 011 audit
```
- **`update`** 經 `crate::model::audit::mutate_in_txn`(`audit.rs:76`)closure 回 `Ok((txn, result, Some(event)))`:
  - `AuditOperation::Update`(`audit.rs:17`)、`entity_table = "system_settings"`、`entity_id: None`(KV PK 非 i64)、`payload_before/after` 經 `audit_json()`(`audit.rs:55`)、`operator: Some(AuditOperator{ id: <admin user_id>, ip: None })`(`audit.rs:35`)、`trace_id`。
  - 寫 `setting_value` 同時 col_expr **`updated_at` = now()**/**`updated_by` = operator.id**(§I.6 pair)。
- **typed accessor**(`value_type == "enum:on,off"` → `SessionMode`):純函式 seam(TDD red→green):`"on" -> On`、`"off" -> Off`、其他/未知 → **read-side fail-safe `Off`**(防 DB 髒值致 panic)。可為 `get_session_default(db) -> SessionMode` helper 或 handler 內聯;boot(§3)與 watcher reload(§4)共用。
- **FR-013 write-side 驗證(與 read-side fallback 分職)**:`update_system_setting` handler 在寫入**之前**依該 setting 的 `value_type` 驗 `value`(`enum:on,off` → 僅收 `on`/`off`),**非法值回 `Res::err`、不持久、原值不變**(spec FR-013);typed accessor 的 fail-safe fallback **只**作 read-side 防禦(讀到既有髒值不 panic),**不**作為接受非法寫入的藉口 —— 二者語意不同、缺一不可。

## 6. facade `sys_user::update_session_policy`(`model/facade/sys_user.rs`,新)

028 `data-model §7` 已預留此 fn(故意不提前宣告避免 dead code)。029 落地:
```rust
pub async fn update_session_policy(db, user_id: i64, policy: &str, operator) -> Result<bool, DbErr>
```
- `update_many().col_expr(Column::SessionPolicy, Expr::value(policy)).filter(Id.eq(user_id))` —— **只動 `session_policy` 欄、絕不碰 `current_session_id`**(沿 028 `set_current_session` `sys_user.rs:152` 範式)。
- 011 audit:`mutate_in_txn` + `AuditOperation::Update`、`entity_table = "sys_user"`、`entity_id: Some(user_id)`、payload before/after、`operator{id, ip:None}`。
- **handler 端配套(brainstorm 關鍵點)**:`updateUserSessionPolicy` handler 在 DB write 成功後 **`redis::cmd("DEL").arg(format!("sess:{user_id}"))`** —— 刪 028 的 `sess:{uid}` PointerRec cache,使 028 `is_current` 在該 user **下一個請求**時 lazy-rehydrate 新 policy。**沒有這一步、policy 改動會被 028 PointerRec cache 遮住**(028 `is_current` 先讀 Redis cache,不會看到 DB 新值直到 cache 失效)。

## 7. endpoints(3 新,Super-only,count 30→33)

| Method | Path | body | handler(`handler/system_manage.rs`) |
|---|---|---|---|
| GET | `/systemManage/getSystemSettings` | — | 回 `get_all()` 映射(camelCase) |
| POST | `/systemManage/updateSystemSetting` | `{key, value}` | `system_settings::update` → `publish_settings_invalidate` |
| POST | `/systemManage/updateUserSessionPolicy` | `{userId, policy}` | `sys_user::update_session_policy` → DEL `sess:{userId}` |

**4-site 註冊(path byte-identical、與 028 endpoint 註冊紀律一致)**:
1. **`main.rs`**:各 `.route(path, get/post(handler).route_layer(from_fn_with_state(state.clone(), crate::auth::enforce::enforce_mw)))`(沿 `main.rs:107` getUserList 範式)。
2. **`ENDPOINT_REGISTRY`**(`auth/endpoint_auth.rs:73`)`+= 3` `(method, path)` tuple(`"GET","/systemManage/getSystemSettings"` / `"POST","/systemManage/updateSystemSetting"` / `"POST","/systemManage/updateUserSessionPolicy"`)。doc-comment「30 entries」(`endpoint_auth.rs:61`)→ 33;內聯 self-test `assert_eq!(... 30)`(`endpoint_auth.rs:493`)→ 33。
3. **`server/tests/endpoint_coverage_lint.rs`** `EXPECTED_ROUTE_COUNT`(`:602`)`30` → `33`。
4. **casbin seed migration** `m20260529_000029_seed_settings_admin`(§8)。

## 8. casbin + sys_menu seed migration(`m20260529_000029_seed_settings_admin`)

接 028-create migration(`m...028`)之後。**up 三段**:

- **casbin endpoint policy**(`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5)`,沿 `m...023` 範式,`ON CONFLICT DO NOTHING`):
  ```
  ('p','R_SUPER','/systemManage/getSystemSettings','GET','','',''),
  ('p','R_SUPER','/systemManage/updateSystemSetting','POST','','',''),
  ('p','R_SUPER','/systemManage/updateUserSessionPolicy','POST','','','')
  ```
- **sys_menu 列**(設定頁、Super 經 §I.2 Casbin 可見;mirror `m018` `manage_user` 列 `m20260529_000018_create_sys_menu.rs:127` 的欄值):
  ```
  parent_id = (SELECT id FROM sys_menu WHERE route_name='manage' AND deleted_at IS NULL),
  route_name   = 'manage_system-settings',  menu_type = 2,  menu_name = 'manage_system-settings',
  route_path   = '/manage/system-settings', component = 'view.manage_system-settings',
  icon = 'mdi:cog',  icon_type = 1,  i18n_key = 'route.manage_system-settings',
  order ~4,  status = 1,  其餘(buttons/query/multi_tab/href/fixed_index_in_tab/created_by …)= NULL
  ```
  > 實作時對齊 `manage_user` 列確切欄序/值(`m018:127`);component 取與 `manage_user` 同形式(`view.manage_*`)。
- **casbin menu policy**(沿 `m...010` menu 範式):`('p','R_SUPER','manage_system-settings','menu','','','')`。
- runtime `getUserRoutes`(`handler/route.rs`)`filter_routes` 經 `enforcer.enforce((role, 'manage_system-settings', 'menu'))` 保留給 Super、非-Super 濾除。

**down 三段(反序)**:`DELETE FROM casbin_rule WHERE ptype='p' AND v1 IN (3 endpoint paths)` + `DELETE casbin_rule WHERE v1='manage_system-settings' AND v2='menu'` + `DELETE FROM sys_menu WHERE route_name='manage_system-settings'`。

## 9. getUserList wire(additive,§I.3 PASS via BASE-WEB-ADAPT)

- **rust**:`UserItem` struct(`handler/system_manage.rs:151-164`)`+= pub session_policy: String`;`user_item()` ctor(`:171-199`)`+=` 對應參數 + `UserItem` 賦值;list handler(`:309` `list_active_paginated`)從 Model rows 傳 `m.session_policy`。serde `rename_all="camelCase"`(`:150`)→ wire 欄 `"sessionPolicy"`。
- **base-web**:`typings/api/system-manage.d.ts` `User` type(`40-53`,以 `userRoles: string[]` 收尾)`+= sessionPolicy: string;`。service 層 `service/api/system-manage.ts` `fetchGetUserList` 已 typed via `Api.SystemManage.UserList` → 自動套用、**不需改 service**。

## 10. base-web footprint

| 區 | 動作 | 細節 |
|---|---|---|
| **新設定頁** | `views/manage/system-settings/index.vue`(新) | per-setting UI:「single-session 系統預設」section + on/off `NSwitch` → `fetchUpdateSystemSetting`。**[MODAL-WIRING ★ (e)、constitution v1.6.0 ratified `3bd3eda`]** |
| **service wrappers** | `service/api/rev2-system-manage.ts`(既有檔、append) | **新 fn** `fetchGetSystemSettings` / `fetchUpdateSystemSetting` / `fetchUpdateUserSessionPolicy`(沿既有 `request<T>({url,method,data})` 範式);**不編輯 `system-manage.ts`**。已 `export * from './rev2-system-manage'`(`service/api/index.ts:4`)→ 自動匯出。**層別已確認**:`views/manage/user/index.vue:5` import 自 `@/service/api`(request 層、非 service-alova),新頁同走 `service/api/*`。 |
| **typings** | `typings/api/system-manage.d.ts`(BASE-WEB-ADAPT) | `User += sessionPolicy: string`(§9)+ 新 `SystemSetting` type(`settingKey/settingValue/valueType/description`)+ 列表型。 |
| **user 頁** | `views/manage/user/index.vue`(改) | 加 `sessionPolicy` 欄(status 欄後、operate 欄前)+ 列動作「設定單一-session」(小 `NModal`/`NSelect` inherit/on/off → `fetchUpdateUserSessionPolicy`)。**[MODAL-WIRING ★ (a)/(b) existing]** |
| **i18n** | `locales/langs/en-us.ts` + `zh-cn.ts` | `route.manage_system-settings` + `page.manage.systemSettings.*` + `page.manage.user.sessionPolicy`。 |
| **路由** | `routes.ts` / `imports.ts` | **elegant-router AUTO-GENERATED、不手改**。 |

> grep 確認:現無設定頁(只有 theme-drawer)→ `views/manage/system-settings/` 為**真正新頁**(`ls` 確認不存在)。

## 11. 不變式

- **029 不改 028 enforcement 邏輯**:`resolve_policy` / `is_current` / 4 gate / refresh 行為**逐字不變**;唯一改動是系統預設來源(immutable config → runtime store `Arc<RwLock<SessionMode>>` + `system_settings` 表)。
- **wire additive-only**:登入/換新回應結構不變;`getUserList` 只**加** `sessionPolicy` 欄(§I.3 ADAPT);3 個新端點皆 rev2-additive(§I.1/§I.3 PASS)、無移除/改名既有端點。
- **即時收斂雙機制**:(a) **系統預設**改動 → `settings:invalidate` PUBLISH → `settings_watcher` 寫 `session_mode` → 下一請求即新預設;(b) **per-account policy** 改動 → **DEL `sess:{uid}`** → 028 `is_current` 在該 user 下一請求 lazy-rehydrate 新 policy(否則被 028 PointerRec cache 遮)。
- **Super-only**:3 端點 + 設定頁選單皆 `R_SUPER` casbin policy(endpoint 經 `enforce_mw`、menu 經 `getUserRoutes` filter);非-Super 端點得 `5003`、選單不可見。
- **§I.6 real audit**:`system_settings` 六審計欄為**真實審計**(人類 admin 編輯;對比 028 系統欄 PASS-by-scope);`update` / `update_session_policy` 皆經 011 `mutate_in_txn` 寫 `sys_operation_log`。
- **無新 crate / 無新 dep**:redis/sea-orm/serde/chrono 既有;prod image build acceptance **optional**(無新 workspace member)。
