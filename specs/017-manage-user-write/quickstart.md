# Quickstart: 017-manage-user-write

**使用者管理頁的寫端 CRUD** — 讓管理員真的能新增/編輯/(軟)刪除使用者(016 唯讀 list 之後的閉環)。

## 一句話
`addUser`/`updateUser`/`deleteUser`/`batchDeleteUser`(4 條,**Super-only**)+ 補完 `sys_user` schema(業務欄 + §I.6 審計欄 + id BIGSERIAL)+ 接 base-web modal/list placeholder;預設密碼(D2)、id wire=string、enum smallint↔string、停用 enforce 擋登入(1000)、不可刪自己(2222)、role replace-all、走 011 audit。

## 改動範圍
**rust-api worktree**:
- `migration/`:`m..014_alter_sys_user_business_audit`(業務欄+審計欄+id BIGSERIAL+seed status 回填)+ `m..015_seed_write_policy`(casbin 4 行 R_SUPER)+ lib.rs 註冊
- `entity/src/sys_user.rs`:加 9 欄 + id `auto_increment=true`
- `server/src/auth/password.rs`:新增 `hash_password`(argon2,無新 crate)
- `server/src/handler/auth.rs`:login 加 `status=disabled→1000` gate(僅登入入口)
- `server/src/handler/system_manage.rs`:write DTO + 4 handler(operator 由 ctx、自刪 guard、2222)+ 016 `user_item` 改吃真值
- `server/src/model/facade/sys_user.rs`:create_user/update_user(mutate_in_txn)+ soft_delete 擴 operator + audit_json 補欄 + test 補欄
- `server/src/model/facade/sys_user_role.rs`:`replace_roles_in_txn`(code→active id + delete+insert)
- `server/src/main.rs`:4 route(post/delete + enforce_mw)+ import delete

**base-web worktree**(MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER):
- `src/service/api/rev2-system-manage.ts`(新)+ index.ts export
- `user-operate-drawer.vue` / `user/index.vue` 各接 `// request` placeholder 一行

**不動**:其他 entity、role 寫端(018)、改密 flow、menu、base-web 表單結構/typings。**無新 crate/dep**。

## 驗收(見 contracts/verification-commands.md)
純單測(hash/enum/role-SQL/guard/DTO/audit_json)→ migration 014/015 自動套 + psql(schema/BIGSERIAL/status 回填/policy)→ curl(4 endpoint × Super 成功 + Admin/User 403 + 重複 2222 + 自刪 2222 + soft-delete 不現於 list + 審計)→ 停用登入 1000 → CDP(管理頁新增/編輯/刪除端到端)→ 守恆(server/lint/xdb + migration up→down→up)。

## 關鍵不變式 / 親決
id wire=string(R7)/ envelope code=string、寫回 null / enum wire string `'1'\|'2'`(DTO i16↔string,D5)/ userName 編輯不可改(Q1=A)/ 停用拒登 **1000 守 no-enum**(Q2=B/親決 A,僅登入入口)/ 不可刪自己整批拒(D7)/ 業務錯誤 2222(D8)/ 預設密碼 argon2 123456(D2)/ §I.6 retrofit:sys_user 5 審計欄、`*_by`=operator i64 成對寫。

## 下一步
`/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`(階段 2 實作)。
