# Data Model: 016-manage-role-user-list

**Date**: 2026-06-01 | **Branch**: `016-manage-role-user-list`
依據 [research.md](research.md) grep 的 rev2 既有 entity/facade + base-web typings 權威。**不建新表、不 alter 業務表**(D2 缺欄回 null);唯一 migration = casbin policy seed。id wire = **string**(R6)。

> **命名鐵則**(CLAUDE.md §3):下方型/簽名為 plan 設計值;implementer 須 **act on actual code**,Rust 型 / sea-orm API 以實際編譯為準。

---

## 1. 既有 entity(不動 — D2)

| entity | 欄位(act on actual,不變) |
|---|---|
| `sys_user` | `id: i64` / `user_name: String` / `password: String` / `nick_name: Option<String>` / `deleted_at: Option<DateTimeWithTimeZone>` |
| `sys_role` | `id: i64` / `code: String` / `name: String` / `deleted_at: Option<DateTimeWithTimeZone>` |
| `sys_user_role` | `user_id: i64` / `role_id: i64`(複合 PK,join) |

**缺欄**(base-web 想顯示但 entity 無)→ DTO 回 `null`,**不補欄**:user 缺 status/gender/phone/email/created_at/updated_at;role 缺 description/status/created_at/updated_at;兩者 createBy/updateBy 亦缺。(§I.6 審計欄 retrofit + 業務顯示欄補欄留 Phase 4 write 那一波;見 CHECKLIST §2.18/§2.19。)

## 2. migration(唯一一個:casbin policy seed,非業務表)

### `m20260529_000013_seed_manage_policy`(接 012 後、經 010 自動套)

sea-orm raw SQL(沿 009/010 pattern,R4):
```
up():
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES
  ('p','R_SUPER','/systemManage/getRoleList','GET','','',''),
  ('p','R_ADMIN','/systemManage/getRoleList','GET','','',''),
  ('p','R_SUPER','/systemManage/getAllRoles','GET','','',''),
  ('p','R_ADMIN','/systemManage/getAllRoles','GET','','',''),
  ('p','R_USER_COMMON','/systemManage/getAllRoles','GET','','','')
ON CONFLICT DO NOTHING

down():
DELETE FROM casbin_rule WHERE ptype='p' AND v2='GET'
  AND v1 IN ('/systemManage/getRoleList','/systemManage/getAllRoles')
```
- **getUserList 不 seed**(009 已 seed R_SUPER+R_ADMIN;path 無 /api、與 route 一致,R3)。
- path **無 `/api` 前綴**(R3:rust route 無 /api)。act=`GET`。R_SUPER 逐條(無 wildcard)。
- getAllRoles 含 R_USER_COMMON(§4.6.3:三 role 共用,供一般使用者可進入的操作介面用)。
- 註冊 `migration/src/lib.rs`:`mod m20260529_000013_seed_manage_policy;` + push 至 `migrations()` vec 尾(接 012)。
- **§I.6 N/A**:只 seed policy 表、不建/alter 業務表。

## 3. facade 擴充(`server/src/model/facade/`,守 009 entity-access lint)

```
// sys_user.rs(新增)
pub struct UserListFilter { pub user_name: Option<String>, pub nick_name: Option<String> }
pub async fn list_active_paginated(db, filter: UserListFilter, current: u64, size: u64)
    -> Result<(Vec<sys_user::Model>, u64 /*total*/), DbErr>
//   find_active() + 條件 .filter(contains) + .order_by_desc(Id) + .paginate(db,size)
//   → (fetch_page(current-1), num_items())   ── R1/R2/R9

// sys_role.rs(新增)
pub struct RoleListFilter { pub name: Option<String>, pub code: Option<String> }
pub async fn list_active_paginated(db, filter: RoleListFilter, current: u64, size: u64)
    -> Result<(Vec<sys_role::Model>, u64), DbErr>
pub async fn list_active_all(db) -> Result<Vec<sys_role::Model>, DbErr>   // getAllRoles,只 active、不分頁

// sys_user_role.rs(新增,R7 批次避 N+1)
pub async fn roles_for_users(db, user_ids: &[i64]) -> Result<HashMap<i64, Vec<String>>, DbErr>
//   sys_user_role WHERE user_id IN (ids) → role_id pairs
//   → sys_role::find_active filter id IN (role_ids) 取 (id, code)
//   → 組 user_id → [code...](2 query 固定)
```
- **SQL-build seam**:`user_list_query(filter) -> Select<Entity>` / `role_list_query(filter) -> Select<Entity>` 抽純 fn(no-DB 單測:contains/eq/空略過/id DESC)。
- **既有不動**:`find_active` / `find_active_by_*` / `soft_delete` / `roles_for_user`(單筆,login/getUserInfo 續用)。
- 全落 facade、handler 不碰 `entity::`(009 lint)。

## 4. Output DTO(`server/src/handler/system_manage.rs`,serde camelCase、id=string、無 password)

```
// 分頁 wrapper(泛型,4 欄)
struct PageRes<T> { current: u64, size: u64, total: u64, records: Vec<T> }   // 無 pages/success

// UserItem(getUserList records;無 password)
struct UserItem {
  id: String,                  // ← i64.to_string()(R6)
  user_name: String,           // ← user_name
  nick_name: Option<String>,   // ← nick_name(有值)
  user_gender: Option<String>, // null(entity 無欄,符 base-web UserGender|null)
  user_phone: Option<String>,  // null
  user_email: Option<String>,  // null
  user_roles: Vec<String>,     // ← roles_for_users 批次(role code 陣列)
  status: Option<String>,      // null(符 base-web EnableStatus|null)
  create_by: Option<String>,   // null
  create_time: Option<String>, // null
  update_by: Option<String>,   // null
  update_time: Option<String>, // null
}

// RoleItem(getRoleList records)
struct RoleItem {
  id: String, role_name: String /*←name*/, role_code: String /*←code*/,
  role_desc: Option<String>,   // null
  status: Option<String>,      // null
  create_by: Option<String>, create_time: Option<String>,
  update_by: Option<String>, update_time: Option<String>,   // 皆 null
}

// AllRoleItem(getAllRoles,Role 子集)
struct AllRoleItem { id: String, role_name: String, role_code: String }
```
- 各 struct `#[serde(rename_all = "camelCase")]`;nullable 欄 `Option<String>` → `None` 序列化為顯式 `null`(不 skip)。
- **無 password 欄**(D9)— UserItem 不含、facade 查回 Model 後 handler 組 DTO 時不取(或 facade 投影排除;plan 傾向 handler 不取,單測斷言序列化無 `"password"`)。
- `From<sys_user::Model> + roles` / `From<sys_role::Model>` 映射(純函式、test-first)。

## 5. Query extractor(camelCase、皆 optional)

```
struct UserSearchParams {   // axum Query;serde camelCase
  user_name: Option<String>, nick_name: Option<String>,
  user_gender: Option<String>, user_phone: Option<String>, user_email: Option<String>, status: Option<String>,  // 接收但忽略(entity 無欄)
  current: Option<u64>, size: Option<u64>,
}
struct RoleSearchParams { role_name: Option<String>, role_code: Option<String>, status: Option<String>/*忽略*/, current: Option<u64>, size: Option<u64> }
```
- 正規化:`current` 預設 1、`size` 預設 10、`size` clamp max 100(D5)。空字串 → 視同 None、略過 filter(D6/D8)。
- 只 `user_name`/`nick_name`(user)、`role_name`/`role_code`(role)真正生效;其餘安全忽略。

## 6. handler / route 接線(`handler/system_manage.rs` 新 + handler/mod.rs + main.rs)

```
handler/system_manage.rs(新):
  get_user_list(State, Query<UserSearchParams>) -> Res<PageRes<UserItem>>
  get_role_list(State, Query<RoleSearchParams>) -> Res<PageRes<RoleItem>>
  get_all_roles(State) -> Res<Vec<AllRoleItem>>
handler/mod.rs:+ pub mod system_manage;
main.rs:
  - getUserList route 改指 system_manage::get_user_list(保留 enforce_mw route_layer)
  - 新增 .route("/systemManage/getRoleList", get(system_manage::get_role_list).route_layer(enforce_mw))
  - 新增 .route("/systemManage/getAllRoles", get(system_manage::get_all_roles).route_layer(enforce_mw))
  - 移除 handler::auth::get_user_list + UserListStub(orphan)
```
- enforce 在 middleware 判(handler 不判);三 route 照抄 getUserList 的 `route_layer(from_fn_with_state(state.clone(), enforce::enforce_mw))`(R3)。
- 015 全域 ctx_mw layer 仍包所有 route(不動)。

## 7. 與既有關係 / 不變式

- **不建表、不 alter 業務表、無新 crate/dep**;唯一 migration = casbin policy seed(非業務表 → §I.6 N/A)。
- 013 getUserList stub(`auth.rs::get_user_list` + `UserListStub`)取代並刪除。
- 009 soft-delete:只回 active(`find_active`)。011 audit:read-only、不寫 audit。008 envelope:`Res<T>` 包 `PageRes`。010:seed migration 自動套。013 enforce:3 route 掛 `enforce_mw`。015 ctx_mw:不動。
- wire 不變式(§I.3):envelope `{data,code,msg}` code=string / pagination 4 欄無 pages / id=string / status nullable / camelCase。
