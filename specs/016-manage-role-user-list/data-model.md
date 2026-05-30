# Data Model: 016-manage-role-user-list（Phase 1）

> 命名/型以 [research.md](./research.md) grep 的 rev2 既有 + base-web typings 權威為準。**兩個 alter migration 補欄 + 1 seed policy migration + entity 同步 + facade 分頁查詢 + Output DTO**。不建新表（role/user/user_role 已存在）。id wire = number（constitution v1.1.0）。

## 1. schema 變更（migration `m20260529_000013` / `m..014` / `m..015`，接 012 後、經 010 自動套）

### `m..013_alter_sys_role` — sys_role 補欄

| 欄 | sea-orm builder | 約束 | 對應 base-web | 備註 |
|---|---|---|---|---|
| `description` | `.string().null()` | NULL | `roleDesc` | rev1 也叫 description |
| `status` | `.string().not_null().default("1")` | NOT NULL default '1' | `status` | VARCHAR '1'啟用/'2'停用;default 護既有 3 seed |
| `created_at` | `.timestamp_with_time_zone().not_null().default(Expr::current_timestamp())` | NOT NULL default now() | `createTime` | |
| `updated_at` | `.timestamp_with_time_zone().null()` | NULL | `updateTime` | 未更新→null |

既有不動:`id`(i64 auto_increment)/`code`/`name`/`deleted_at` + partial unique index。`down` = drop 上 4 欄。

### `m..014_alter_sys_user` — sys_user 補欄

| 欄 | sea-orm builder | 約束 | 對應 base-web |
|---|---|---|---|
| `status` | `.string().not_null().default("1")` | NOT NULL default '1' | `status` |
| `gender` | `.string().null()` | NULL | `userGender`('1'男/'2'女) |
| `phone` | `.string().null()` | NULL | `userPhone` |
| `email` | `.string().null()` | NULL | `userEmail` |
| `created_at` | `.timestamp_with_time_zone().not_null().default(Expr::current_timestamp())` | NOT NULL default now() | `createTime` |
| `updated_at` | `.timestamp_with_time_zone().null()` | NULL | `updateTime` |

既有不動:`id`(i64)/`user_name`(unique)/`password`/`nick_name`/`deleted_at`。`down` = drop 上 6 欄。**不補** domain/built_in/avatar/display_id/created_by/updated_by。

### `m..015_seed_manage_policy` — casbin endpoint policy（補 009 缺者）

seed（沿 m..009 寫法、`ON CONFLICT DO NOTHING`）:
```
('p','R_SUPER','/systemManage/getRoleList','GET','','',''),
('p','R_ADMIN','/systemManage/getRoleList','GET','','',''),
('p','R_SUPER','/systemManage/getAllRoles','GET','','',''),
('p','R_ADMIN','/systemManage/getAllRoles','GET','','','')
```
getUserList 不 seed（m..009 已有）。R_USER_COMMON 不放（deny）。`down` = DELETE 本 migration 的 4 條（v1 IN getRoleList/getAllRoles AND v2='GET' AND v0 IN R_SUPER/R_ADMIN）。

> **lib.rs**:註冊 013/014/015（接 012 後，mod + migrations() vec）。

## 2. entity 同步（`entity/src/sys_role.rs` / `sys_user.rs`，加 `Model` 欄位）

```
// sys_role::Model 加:
description: Option<String> / status: String / created_at: DateTimeWithTimeZone / updated_at: Option<DateTimeWithTimeZone>
// sys_user::Model 加:
status: String / gender: Option<String> / phone: Option<String> / email: Option<String> /
created_at: DateTimeWithTimeZone / updated_at: Option<DateTimeWithTimeZone>
```
- `Relation {}` / `ActiveModelBehavior` 既有不動。`sys_user::Model.password` 仍在（內部用）、**不入 wire DTO**（§6）。
- `audit_json`（sys_user 既有 redact）:nick_name 未納入屬 013 §2.16 follow-up、016 不擴（status/gender 等新欄也暫不入 audit_json,非本 feature scope）。

## 3. Output DTO（`server/src/handler/system_manage.rs`，serde camelCase、id=number）

```
// 分頁 wrapper（泛型或各自）
struct PageResp<T> { records: Vec<T>, current: u64, size: u64, total: u64 }   // {records,current,size,total}

// RoleItem（getRoleList records;getAllRoles 回子集）
struct RoleItem {
  id: i64,                    // → JSON number
  role_name: String,          // ← name
  role_code: String,          // ← code
  role_desc: Option<String>,  // ← description
  status: String,             // '1'/'2'
  create_time: String,        // created_at → RFC3339/ISO
  update_time: Option<String>,// updated_at（null→None 或空字串、見下）
  create_by: Option<String>,  // null（operator 折 Phase 4 A）
  update_by: Option<String>,  // null
}
// AllRole 子集:{id, roleName, roleCode}（getAllRoles 用 RoleItem 投影 or 獨立 AllRoleItem）

// UserItem（getUserList records;**無 password**）
struct UserItem {
  id: i64,                       // number
  user_name: String,
  nick_name: Option<String>,
  user_gender: Option<String>,   // ← gender '1'/'2'|null
  user_phone: Option<String>,    // ← phone
  user_email: Option<String>,    // ← email
  user_roles: Vec<String>,       // ← roles_for_user(role code 陣列)
  status: String,                // '1'/'2'
  create_time: String,
  update_time: Option<String>,
  create_by: Option<String>,     // null
  update_by: Option<String>,     // null
}
```
- **id: i64 → serde 直序列化 number**（constitution v1.1.0、不 to_string）。
- `update_time`/`createBy`/`updateBy`:base-web typing 是 `string`（非 nullable）但 016 無值 → **wire 回 null**（base-web 顯示空、可接受;若 base-web 嚴格需 string 再於 BASE-WEB-ADAPT 補、但實測表格 render 容 null）。實作用 `Option<String>` + `skip_serializing_if` 或顯式 null,plan 階段二擇一（傾向回 null 明確）。
- **無 password 欄**（§6 防護）。

## 4. 純 query 條件型（Query extractor，camelCase、皆 optional）

```
struct RoleSearchParams { role_name: Option<String>, role_code: Option<String>, status: Option<String>, current: Option<u64>, size: Option<u64> }
struct UserSearchParams { user_name: Option<String>, nick_name: Option<String>, user_phone: Option<String>, user_email: Option<String>, user_gender: Option<String>, status: Option<String>, current: Option<u64>, size: Option<u64> }
```
- 空字串/None → 略過該 filter（D8）。`current` 預設 1、`size` 預設 10、`size` clamp max 100（D9）。

## 5. facade 擴充（`model/facade/sys_role.rs` / `sys_user.rs` / `sys_user_role.rs`）

```
// sys_role.rs（擴充）
list_paged(db, RoleFilter, current, size) -> Result<(Vec<Model>, u64/*total*/), DbErr>   // active + LIKE/eq filter + 分頁 + count
all_active(db) -> Result<Vec<Model>, DbErr>   // getAllRoles 用（不分頁、只 active）

// sys_user.rs（擴充)
list_paged(db, UserFilter, current, size) -> Result<(Vec<Model>, u64), DbErr>   // 注意:回 Model 含 password,handler 組 DTO 時排除（§6）
// 或更安全:回投影 tuple/struct（不含 password）— plan 階段定（傾向投影排除 password）

// sys_user_role.rs（既有 roles_for_user 重用,getUserList 每列呼叫)
```
- **SQL-build seam**:filter 組裝抽純 fn（如 `role_list_query(filter)->Select<Entity>`）供 no-DB 單測（沿 011/015 模式、驗 LIKE/eq/limit/offset/count）。
- **009 lint**:全落 facade、handler 不碰 `entity::`。
- filter 參數化（`.contains`/`.eq`、CHECKLIST §5.10）。

## 6. password 洩漏防護（關鍵不變式）

- `sys_user::find_active()`/`list_paged` 底層回 raw `Model`（含 password）。
- **UserItem DTO 無 password 欄**;handler 組 DTO 時不取 password,或 facade `list_paged` 用 `select_only()` 投影排除 password（傾向後者、從源頭杜絕）。
- 單測:UserItem 序列化 JSON **不含** "password" key。

## 7. handler / route 接線（`handler/system_manage.rs` 新 + main.rs）

```
handler/system_manage.rs（新）:
  get_role_list(State, Query<RoleSearchParams>) -> Res<PageResp<RoleItem>>
  get_all_roles(State) -> Res<Vec<AllRoleItem>>   // 或 Vec<RoleItem> 子集
  get_user_list(State, Query<UserSearchParams>) -> Res<PageResp<UserItem>>
handler/mod.rs:+ pub mod system_manage;
main.rs:
  - 移除 handler::auth::get_user_list stub route（+ 刪 auth.rs 的 UserListStub/get_user_list）
  - 3 route 各 .route_layer(from_fn_with_state(state.clone(), enforce_mw))（沿 getUserList demo）
  - .route("/systemManage/getRoleList", get(system_manage::get_role_list).route_layer(...))
  - .route("/systemManage/getAllRoles", get(system_manage::get_all_roles).route_layer(...))
  - .route("/systemManage/getUserList", get(system_manage::get_user_list).route_layer(...))
```
- enforce 在 middleware 判角色（handler 不判）;handler 純查詢 + 組 DTO。
- 全域 015 audit_mw layer 仍包所有 route（不動）。

## 8. 與既有關係

- sys_role/sys_user/sys_user_role 既有表 alter 補欄（不重建）;seed user/role 靠 default 補新欄值。
- 013 getUserList stub 取代（DTO 分頁形 + 真實資料 + 搬 handler）。
- 009 soft-delete:只回 active。011 audit:本 feature read-only、不寫 audit（無資料變動)。008 envelope:Res<T> 包分頁。010:三 migration 自動套。013 enforce:3 route 掛 enforce_mw。
- **無新表、無新 crate、無新 dep**。
