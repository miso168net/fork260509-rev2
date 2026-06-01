# Quickstart: 016-manage-role-user-list

**3 條唯讀 systemManage endpoint** — 讓 base-web 系統管理頁第一次看到真實 user/role。

## 一句話
`getUserList`(分頁)/ `getRoleList`(分頁)/ `getAllRoles`(全量)→ 對齊 base-web mock wire,不動資料表(缺欄回 null),id wire=string,roles 批次避 N+1,三條掛 Casbin enforce + policy seed。

## 改動範圍(rust-api worktree)
- `server/src/handler/system_manage.rs`(新):3 handler + DTO(`PageRes`/`UserItem`/`RoleItem`/`AllRoleItem`)+ `From<Model>` 映射
- `server/src/handler/mod.rs`:`pub mod system_manage`
- `server/src/model/facade/sys_user.rs`:`list_active_paginated` + `UserListFilter`
- `server/src/model/facade/sys_role.rs`:`list_active_paginated` + `list_active_all` + `RoleListFilter`
- `server/src/model/facade/sys_user_role.rs`:`roles_for_users`(批次)
- `server/src/main.rs`:getUserList 改指 system_manage + 加 getRoleList/getAllRoles route(各掛 enforce_mw);移除 auth.rs::get_user_list + UserListStub
- `migration/src/m20260529_000013_seed_manage_policy.rs`(新)+ `migration/src/lib.rs` 註冊
- **不動 base-web、不建/alter 業務表、無新 crate/dep**

## 驗收(見 contracts/verification-commands.md)
純單測(DTO/分頁/filter)→ dev stack curl(3 endpoint × Super/User 授權 + 分頁/搜尋/超範圍 + 無 password)→ psql(policy seed)→ CDP(管理頁列表顯示)→ 守恆。

## 關鍵不變式
envelope `{data,code,msg}` code=string / pagination `{current,size,total,records}` 無 pages / **id=string** / status nullable / 無 password / 只回 active / Super+Admin 可 list、User deny、getAllRoles 含 User。

## 下一步
`/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`(階段 2 實作)。
