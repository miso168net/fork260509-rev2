# Data Model: 017-manage-user-write

**Date**: 2026-06-01 | **Branch**: `017-manage-user-write`
依據 [research.md](research.md) 5-lens grep 的 rev2 既有 entity/facade/migration + base-web typings 權威。**ALTER 既有 sys_user(補業務欄 + §I.6 審計欄 + id BIGSERIAL)**;不建新業務表;casbin policy seed 為非業務表。id wire=**string**(R7)。

> **命名鐵則**(CLAUDE.md §3):下方型/簽名為 plan 設計值;implementer 須 **act on actual code**,Rust 型 / sea-orm API(`small_integer()`/`mutate_in_txn`/`insert_many`)以實際編譯為準。

---

## 1. entity 變更:`entity/src/sys_user.rs`(加 9 欄 + id auto_increment)

| 欄 | Rust 型 | DB | 備註 |
|---|---|---|---|
| `id` | `i64` | bigint(改 BIGSERIAL,§3 migration)| `#[sea_orm(primary_key, auto_increment = true)]`(**從 false 改 true**,R2 成對改)|
| `user_name` | `String` | varchar | 既有;唯一(active);**editable=false**(Q1=A,update 不改)|
| `password` | `String` | varchar | 既有;addUser 寫 `hash_password("123456")`(D2)、update 不動 |
| `nick_name` | `Option<String>` | varchar null | 既有(008)|
| `user_gender` | `Option<i16>` | smallint null | **新**;wire `'1'\|'2'\|null`(D5 i16↔string)|
| `user_phone` | `Option<String>` | varchar null | **新** |
| `user_email` | `Option<String>` | varchar null | **新** |
| `status` | `Option<i16>` | smallint null | **新**;1=啟用/2=停用(對齊 base-web EnableStatus)|
| `created_at` | `DateTimeWithTimeZone` | timestamptz NOT NULL default now() | **新**(非 Option)|
| `created_by` | `Option<i64>` | bigint null | **新**;operator user_id(§I.6 非 user_name)|
| `updated_at` | `Option<DateTimeWithTimeZone>` | timestamptz null | **新** |
| `updated_by` | `Option<i64>` | bigint null | **新**;成對 updated_at |
| `deleted_at` | `Option<DateTimeWithTimeZone>` | timestamptz null | 既有(009)|
| `deleted_by` | `Option<i64>` | bigint null | **新**;成對 deleted_at(§I.6)|

> 型對應已被 `entity/src/sys_operation_log.rs` 實證(i64/Option<i64>/Option<String>/DateTimeWithTimeZone)。`created_at` NOT NULL 故非 Option。

## 2. migration(2 個,接 013、經 010 自動套)

### 2.1 `m20260529_000014_alter_sys_user_business_audit`

**up()**:
- **builder add_column ×9**(沿 008/003 pattern,除 created_at 外皆 nullable):
  - `user_gender .small_integer().null()` / `user_phone .string().null()` / `user_email .string().null()` / `status .small_integer().null()`
  - `created_at .timestamp_with_time_zone().not_null().default(Expr::current_timestamp())`(既有 3 row 加欄自動回填,對齊 004)/ `created_by .big_integer().null()` / `updated_at .timestamp_with_time_zone().null()` / `updated_by .big_integer().null()` / `deleted_by .big_integer().null()`
- **raw `execute_unprepared`(id BIGSERIAL,R2 ★)**:
  ```sql
  CREATE SEQUENCE IF NOT EXISTS sys_user_id_seq OWNED BY sys_user.id;
  ALTER TABLE sys_user ALTER COLUMN id SET DEFAULT nextval('sys_user_id_seq');
  SELECT setval('sys_user_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM sys_user), 1));
  ```
- **raw `execute_unprepared`(seed 回填,D6)**:`UPDATE sys_user SET status = 1 WHERE id IN (1,2,3);`(created_at 由 column default 自動填;created_by/updated_*/deleted_by 對 seed 維持 NULL)
- **raw `execute_unprepared`(C2:user_name 唯一性 DB 兜底)**:**先 `\d sys_user` 確認無既有 user_name unique index**,若無則 `CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_user_name_active ON sys_user (user_name) WHERE deleted_at IS NULL;`(沿 009 `sys_role.code` partial unique 先例;FR-006 並發 race 兜底,app 層 `find_active_by_name` 仍給友善 2222)
  - **as-built(回填,§2.21)**:`\d sys_user` 確認 migration 003 已建**同義** partial unique `sys_user_user_name_active_uniq`(`user_name WHERE deleted_at IS NULL`)→ 本條件式『若無則建』條件為假 → `uq_sys_user_user_name_active` **實際未建**(避重複索引);FR-006 DB race 兜底由 003 既有索引提供、語意等價,`down()` 的 `DROP INDEX ... uq_...`(「若本 migration 建」)亦無對象。

**down()**(對稱、可逆):`DROP INDEX IF EXISTS uq_sys_user_user_name_active;`(若本 migration 建)+ `ALTER TABLE sys_user ALTER COLUMN id DROP DEFAULT; DROP SEQUENCE IF EXISTS sys_user_id_seq;` + drop_column ×9。

### 2.2 `m20260529_000015_seed_write_policy`(casbin、沿 009/013/016 raw SQL)

**up()**:`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES`(逐條無 wildcard、path 無 /api、v3-5='')`ON CONFLICT DO NOTHING`:
```
('p','R_SUPER','/systemManage/addUser','POST','','',''),
('p','R_SUPER','/systemManage/updateUser','POST','','',''),
('p','R_SUPER','/systemManage/deleteUser','DELETE','','',''),
('p','R_SUPER','/systemManage/batchDeleteUser','DELETE','','','')
```
**down()**:`DELETE … WHERE ptype='p' AND v1 IN ('/systemManage/addUser','/systemManage/updateUser','/systemManage/deleteUser','/systemManage/batchDeleteUser')`。**R_ADMIN/R_USER_COMMON 不 seed → 非 Super 寫 403+5003**。

**lib.rs**:`mod m..014; mod m..015;` + migrations() vec 尾接 014、015。

## 3. facade(`server/src/model/facade/`,守 009 entity-access lint;全走 011 `mutate_in_txn`)

```
// sys_user.rs(新增/改)
pub async fn create_user(db, req: CreateUserData, operator: i64) -> Result<i64 /*new id*/, DbErr>
//   先 find_active_by_name 檢唯一(存在→特定 Err 供 handler 映 2222);
//   mutate_in_txn:insert ActiveModel{ id: NotSet, user_name, password: Set(hash_password("123456")),
//     nick_name, user_gender, user_phone, user_email, status, created_by: Set(Some(operator)),
//     created_at: NotSet(DB default) } → 取 new id → sys_user_role::replace_roles_in_txn(&txn, id, role_codes)
//     → audit Insert(entity_id=Some(id), payload_before=None, payload_after=Some(model.audit_json()),
//       operator=Some(AuditOperator{id:operator, ip:None}))
pub async fn update_user(db, id: i64, req: UpdateUserData, operator: i64) -> Result<bool, DbErr>
//   mutate_in_txn:load active by id(無→Ok(false));payload_before=audit_json;
//     update business 欄 + updated_at=Set(now()) 與 updated_by=Set(Some(operator)) **成對**(§I.6;updated_at 無 DB default/trigger→須顯式 set,**非『或 DB』**;**不動 user_name/password**)
//     → replace_roles_in_txn → audit Update(before+after 皆 Some, operator)
pub async fn soft_delete(db, id: i64, operator: i64) -> Result<bool, DbErr>  // 擴簽名加 operator
//   soft_delete_query(id) 同設 deleted_by=operator;AuditEvent operator=Some(...)(取代現 None)

// sys_user_role.rs(新增 txn-aware write)
pub async fn replace_roles_in_txn(txn: &DatabaseTransaction, user_id: i64, role_codes: &[String]) -> Result<(), DbErr>
//   role code→active id:sys_role::find_active filter Code IN(codes)取 (id) → 未知/軟刪 code 略過(R4/US2-2)
//   delete_many WHERE user_id → insert_many 新 (user_id, role_id) pairs
```

- **`soft_delete_query`** 改:`.col_expr(DeletedAt, current_timestamp).col_expr(DeletedBy, operator)`(同設兩欄,§I.6 成對)。
- **`audit_json`** 改(R11):補 nick_name + user_gender/user_phone/user_email/status/created_at/created_by/updated_at/updated_by/deleted_by;**password 持續 `<redacted>`**(email/phone 為審計快照、保留)。test Model struct literal 同步補 9 欄;擴 redact 純測斷言。
- batchDelete:handler 迴圈呼叫 `soft_delete(db, id, operator)`(各筆 SOFT_DELETE audit);或 facade `soft_delete_many`(plan 取 handler 迴圈、各筆 audit 清楚 + 自刪 guard 易做)。
- **既有不動**:`find_active`/`find_active_by_name`/`find_active_by_id`/`roles_for_user`/`roles_for_users`。

## 4. password:`server/src/auth/password.rs`

```
pub fn hash_password(plain: &str) -> String
//   SaltString::generate(&mut OsRng) + Argon2::default().hash_password(plain.as_bytes(), &salt)
//     .expect(...).to_string();與 seed/test 同演算法 → verify_password 驗得過(123456)
//   import SaltString/OsRng/PasswordHasher 從 #[cfg(test)] 提到 module 頂層。無新 crate。
```
純單測:`verify_password(p, &hash_password(p))==true`、`verify_password("x", &hash_password("y"))==false`。

## 5. handler:`server/src/handler/system_manage.rs`(write DTO + handler + 016 user_item 改)

```
// write DTO(serde camelCase;id 收 String parse i64,R7)
#[derive(Deserialize)] #[serde(rename_all="camelCase")]
struct UserCreateReq { user_name: String, nick_name: Option<String>, user_gender: Option<String>,
  user_phone: Option<String>, user_email: Option<String>, user_roles: Vec<String>, status: Option<String> }  // 無 id/password
struct UserUpdateReq { id: String, /* + 同 UserCreateReq 業務欄(user_name 收但忽略, Q1=A) */ ... }
struct DeleteReq { id: String }
struct BatchDeleteReq { ids: Vec<String> }

pub async fn add_user(State, Extension<RequestContext>, Json<UserCreateReq>) -> Res<()>
//   operator = ctx.operator_id(enforce_mw 後必 Some;None→Internal 防禦);
//   enum string→i16(user_gender/status:"1"→1,"2"→2,parse 失敗→2222);
//   create_user(...);用戶名重複 Err→Res::err_msg(BizError,"用户名已存在")(2222);成功→Res::ok(())
pub async fn update_user(State, Extension, Json<UserUpdateReq>) -> Res<()>
//   id.parse::<i64>()(失敗→2222);update_user(...);Ok(false)→Res::err_msg(BizError,"用户不存在")
pub async fn delete_user(State, Extension, Json<DeleteReq>) -> Res<()>
//   id.parse;**D7:若 id==ctx.operator_id→Res::err_msg(BizError,"不能删除自己")**;否則 soft_delete(db,id,operator)
pub async fn batch_delete_users(State, Extension, Json<BatchDeleteReq>) -> Res<()>
//   ids.parse;**D7:任一 id==operator→整批拒 2222(不執行)**;否則迴圈 soft_delete(各筆 audit)

// 016 user_item 改吃真實欄(R10):
fn user_item(... m fields ...) -> UserItem  // user_gender: m.user_gender.map(|g|g.to_string())、
//   status: m.status.map(|s|s.to_string())、user_phone/user_email: m.user_phone/email、
//   create_time: Some(m.created_at.to_rfc3339())、update_time: m.updated_at.map(rfc3339)、
//   create_by/update_by: m.created_by/updated_by.map(|i|i.to_string());缺值仍 None。id 維持 string。
//   (lint-safe:handler 仍收原始欄位、不命名 entity::Model)
```
- enum 轉換抽純 fn(`gender_str_to_i16`/`status_str_to_i16`、`i16_to_wire_str`)test-first(D5、R7)。

## 6. login 改:`server/src/handler/auth.rs`(Q2=B / R6 / 親決 A)

`login_attempt_inner`:`find_active_by_name` → `verify_password` 通過後、`roles` 前插:
```
if user.status == Some(2) /* disabled */ { return Err(BizCode::LoginFailed); }  // 1000 統一守 no-enum
```
- **僅 login 入口**(FR-013);不改 enforce_mw/getUserInfo;login_attempt 審計沿 success=false/operator_id=None(不擴回傳型)。
- status 語意 1=啟用/2=停用;seed user(回填 status=1)登入正常。

## 7. route:`server/src/main.rs`

`use axum::routing::{get, post, delete}`(加 delete)。在既有 systemManage GET route 後加 4 條(各 `.route_layer(from_fn_with_state(state.clone(), enforce::enforce_mw))`):
```
.route("/systemManage/addUser", post(system_manage::add_user).route_layer(...))
.route("/systemManage/updateUser", post(system_manage::update_user).route_layer(...))
.route("/systemManage/deleteUser", delete(system_manage::delete_user).route_layer(...))
.route("/systemManage/batchDeleteUser", delete(system_manage::batch_delete_users).route_layer(...))
```
DELETE 帶 Json body(`{id}`/`{ids}`,非 URL)。015 ctx_mw outermost 不動。

## 8. base-web(MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER)

```
src/service/api/rev2-system-manage.ts(新,BASE-WEB-WRAPPER):
  fetchAddUser(data)       request<null>({url:'/systemManage/addUser', method:'post', data})
  fetchUpdateUser(data)    method:'post' url:/systemManage/updateUser(data 含 id)
  fetchDeleteUser(id)      method:'delete' url:/systemManage/deleteUser data:{id}
  fetchBatchDeleteUser(ids) method:'delete' url:/systemManage/batchDeleteUser data:{ids}
src/service/api/index.ts:export * from './rev2-system-manage'
```
- **MODAL-WIRING 接線(只改 `// request` 行,每處 spec 記)**:
  - `user-operate-drawer.vue` handleSubmit(~:107):`const { error } = props.operateType==='add' ? await fetchAddUser(model) : await fetchUpdateUser({ ...model, id: props.rowData!.id }); if (!error) { message.success; closeDrawer(); emit('submitted'); }`
  - `index.vue` handleDelete(~:155):`const { error } = await fetchDeleteUser(id); if (!error) onDeleted();`
  - `index.vue` handleBatchDelete(~:148):`const { error } = await fetchBatchDeleteUser(checkedRowKeys.value); if (!error) onBatchDeleted();`
- **act on actual code**:行號為參考,以符號(handleSubmit/handleDelete/handleBatchDelete + `// request`)定位;不改表單結構/列定義/typings(id:number 型補正屬 §2.20 另案)。

## 9. 與既有關係 / 不變式

- **§I.6 retrofit 落地**:sys_user 補 5 審計欄(`*_by`=operator i64、成對寫);sys_role retrofit 留 018。
- **016 連動**:user_item 改吃真值(R10);PageRes/UserItem 形不變。
- 008 envelope(Res<()>/2222)、009 soft-delete(deleted_at+deleted_by)、011 audit(mutate_in_txn Insert/Update/SoftDelete)、013 login(加 status gate)/enforce(4 route)、015 ctx_mw(operator_id)、010 migration 自動套。
- wire 不變式(§I.3):envelope code=string、寫回 null、**id=string**(寫端收 String parse)、enum wire string、camelCase。
- **無新 crate/dep**;唯一新 production fn = hash_password(argon2 已在)。
