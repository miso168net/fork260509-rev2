# Data Model: 018 manage-role-write (Phase 1)

> 命名/型以 grep 實證為準(research.md)。**actual code 命名優先於 spec 推測**。

## 1. sys_role entity(現況 + 018 補欄)

`entity/src/sys_role.rs`(現 4 欄)→ 018 後(對齊 `sys_user::Model` 形):

| 欄 | 型(Rust / PG) | 現況 | 018 | 說明 |
|---|---|---|---|---|
| `id` | `i64` / `bigint` PK **auto_increment(BIGSERIAL)** | ✅ 已有 | 不動 | migration 006 已 auto_increment → **無 017 那種 sequence retrofit** |
| `code` | `String` / `varchar NOT NULL` | ✅ | 不動 | 唯一鍵(partial unique active);D2 immutable |
| `name` | `String` / `varchar NOT NULL` | ✅ | 不動 | roleName;可改、不唯一 |
| `deleted_at` | `Option<DateTimeWithTimeZone>` / `timestamptz null` | ✅(009) | 不動 | soft-delete flag |
| `role_desc` | `Option<String>` / `varchar null` | ❌ | **+業務欄** | roleDesc;可改 |
| `status` | `Option<i16>` / `smallint null` | ❌ | **+業務欄** | 1=啟用 / 2=停用;回填既有 3 列=1 |
| `created_at` | `DateTimeWithTimeZone` / `timestamptz NOT NULL default current_timestamp` | ❌ | **+§I.6** | DB default + insert RETURNING(DB-side) |
| `created_by` | `Option<i64>` / `bigint null` | ❌ | **+§I.6** | operator id;create 時 Set |
| `updated_at` | `Option<DateTimeWithTimeZone>` / `timestamptz null`(**無 DB default**) | ❌ | **+§I.6** | D5:col_expr `current_timestamp` 寫(DB-side) |
| `updated_by` | `Option<i64>` / `bigint null` | ❌ | **+§I.6** | 與 updated_at 成對 |
| `deleted_by` | `Option<i64>` / `bigint null` | ❌ | **+§I.6** | 與 deleted_at 成對 |

- migration `m20260529_0000XX_alter_sys_role_business_audit`(序號接 017 之後;lib.rs mod + migrations() vec 兩處 append、在 seed_write_role_policy 之前):`Table::alter().add_column ×7`;**無 BIGSERIAL retrofit**;`UPDATE sys_role SET status=1 WHERE id <= 3`;down 對稱 drop_column。
- 新增 `impl AuditSerialize for sys_role::Model`(audit_json:id/code/name/role_desc/status/created_at.rfc3339/updated_at.map(rfc3339)/deleted_at.map(rfc3339)/*_by;無敏感欄、不 redact)。

## 2. 狀態與「有效角色集」

角色三態:**active(`deleted_at IS NULL AND status=1`)** / **disabled(`deleted_at IS NULL AND status=2`)** / **soft-deleted(`deleted_at` 有值)**。

**有效角色 ≝ `deleted_at IS NULL AND status = 1`** → 新 facade `find_active_enabled() = find_active().filter(Column::Status.eq(1))`。消費端分流(research R1):

| 查詢 | 用 | 顯/濾 停用 |
|---|---|---|
| getRoleList(`list_active_paginated`) | `find_active`(只 deleted_at) | **顯示**停用(FR-012) |
| getAllRoles(`list_active_all`) | `find_active_enabled` | 濾掉(不可指派) |
| `roles_for_user(s)` → enforce(B)/getUserInfo/menu | `find_active_enabled` | 濾掉(不授權、選單消失) |
| `replace_roles_in_txn`(`roles_by_codes_query`) | `find_active_enabled` | 濾掉(指派只採有效;未知/軟刪/停用碼靜默略過) |

> ★ 不可全域改 `find_active` 加 status —— getRoleList 需顯停用。

## 3. 狀態轉移

- create → active(status=1 預設;或依輸入)。
- update status 1↔2(種子角色 →2 拒)。
- soft_delete:任態 → soft-deleted(種子拒)。
- 復原(deleted_at→NULL):**不在本 feature**(無 restore 入口)。
- 軟刪角色的 code 可被新角色重用(partial unique 僅約束 active)。

## 4. casbin policy(寫端授權,seed migration)

`seed_write_role_policy`(鏡像 015,raw SQL,ON CONFLICT DO NOTHING):

| ptype | v0(role) | v1(path) | v2(method) |
|---|---|---|---|
| p | R_SUPER | /systemManage/addRole | POST |
| p | R_SUPER | /systemManage/updateRole | POST |
| p | R_SUPER | /systemManage/deleteRole | DELETE |
| p | R_SUPER | /systemManage/batchDeleteRole | DELETE |

Super-only(無 wildcard、不 seed R_ADMIN/R_USER_COMMON)→ 非 Super 寫操作 enforce_mw 拒 **403 + 5003**。down `DELETE WHERE ptype='p' AND v1 IN (4 paths)`(精準、不踩 009/013/015)。

## 5. 種子保護資料

seed 3 角色(migration 006:`id` 1/2/3):`R_SUPER`/超级管理员、`R_ADMIN`/管理员、`R_USER_COMMON`/普通用户。**判定以 roleCode ∈ {R_SUPER,R_ADMIN,R_USER_COMMON}**(`fn is_seed_role_code(code:&str)`,純函式單測;handler 經 `find_active_by_id` 解析 id→`row.code` 再判 —— analyze I1 親決 code-based,貼 spec「code 為穩定鍵」、避 id 脆弱;id 1/2/3 僅 fresh-seed 對照、非判準);種子**不可刪、不可停用(status→2)**,可改 name/role_desc。

## 6. Wire DTO(三端對齊)

### 6.1 讀(016 owns,018 改吃真值 R10-equiv)
`RoleItem`(`handler/system_manage.rs:117-146`,`#[serde camelCase]`):`id:String`(i64.to_string)、`roleName`、`roleCode`、`roleDesc:Option<String>`、`status:Option<String>`(i16→wire str)、`createBy/createTime/updateBy/updateTime:Option<String>`。**018 後**:status/role_desc/create*/update* 改吃 sys_role 真欄(缺值仍 null),不再恆 None。

### 6.2 寫(018 新)
- `RoleCreateReq{roleName:String, roleCode:String, roleDesc:Option<String>, status:Option<String>}`(camelCase)。
- `RoleUpdateReq{id:String, roleName:String, roleDesc:Option<String>, status:Option<String>}` —— **無 roleCode**(D2 immutable,server 強制)。
- `DeleteReq{id:String}` / `BatchDeleteReq{ids:Vec<String>}`(沿 017)。
- 回應 `Res<()>`(成功 0000 / 業務違反 2222 / 權限 5003 / 內部 5000),HTTP 恆 200。

### 6.3 三端對齊表

| 概念 | rust wire | base-web typing | runtime |
|---|---|---|---|
| id | `String`(i64→str) | `Role.id: number`(CommonRecord) | string(**type-lie,constitution §I.3 v1.2.1 決定不修**) |
| roleName/Code/Desc | String | `roleName/roleCode/roleDesc: string` | ✓ |
| status | `Option<String>` "1"/"2" | `status: EnableStatus('1'\|'2') \| null` | ✓ |
| 寫 model | RoleCreateReq/UpdateReq | `RoleWriteModel = Pick<Role,'roleName'\|'roleCode'\|'roleDesc'\|'status'>` | ✓ |
| delete payload | `{id}` / `{ids:[]}` body | `fetchDeleteRole(id)` / `fetchBatchDeleteRole(ids:string[])` | string ids ✓ |

## 7. 跨 feature 改動點(B + ripple,research R0/R1/R4)

| 檔 | 改動 | 回歸 |
|---|---|---|
| `auth/enforce.rs` | enforce_mw:`claims.roles` → `roles_for_user(db,user_id)` 有效角色(B) | 013 enforce allow/deny |
| `model/facade/sys_user_role.rs` | `roles_for_user(s)` + `roles_by_codes_query` → `find_active_enabled` | 013/014/016/017 角色取用 |
| `model/facade/sys_role.rs` | +`find_active_by_id`/`find_active_enabled`/`create_role`/`update_role`/`soft_delete` | — |
| `model/facade/sys_user.rs` | `update_user`:updated_at/by 改 col_expr + 重查(D5) | **017 US1-3 + 守恆** |
| `handler/system_manage.rs` | +4 role handler + `is_seed_role_code`(經 find_active_by_id 解析 id→code);`role_item` 吃真值 | 016 list |
| entity/migration/lib.rs/main.rs | sys_role entity +7 欄 / alter migration / seed_write_role_policy / 4 route | migration up→down→up |
