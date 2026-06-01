# Quickstart: 018 manage-role-write

## 這個 feature 做什麼
把 016 唯讀角色管理頁閉成 **完整 CRUD**:4 條 Super-only 寫端 `addRole`/`updateRole`/`deleteRole`/`batchDeleteRole`,補 sys_role 業務欄(role_desc/status)+ §I.6 審計欄,並讓角色 status(啟用/停用)**即時生效於授權**(改 enforce_mw 為 DB-fresh,B 決策)。

## 實作順序(server-first,鏡像 017)
1. **schema**:entity `sys_role` +7 欄 + `alter_sys_role_business_audit` migration(無 BIGSERIAL retrofit)+ `AuditSerialize for sys_role::Model` + lib.rs 註冊。
2. **facade `sys_role`**:`find_active_by_id` / `find_active_enabled` / `create_role` / `update_role` / `soft_delete`(走 011 `mutate_in_txn` + audit;D5 col_expr+重查)。
3. **effective-role-set ripple**:`roles_for_user(s)` + `roles_by_codes_query` → `find_active_enabled`;**`enforce_mw` 改讀 `roles_for_user`(B)**。
4. **D5 校正 017**:`update_user` 的 updated_at/updated_by 改 col_expr + 重查(DB-side)。
5. **handler**:4 role handler + `is_seed_role_id` 種子保護 + `role_item` 改吃真值;router 4 route(enforce_mw)+ `seed_write_role_policy` migration。
6. **base-web**(server 通後):`rev2-system-manage.ts` +4 fetch fn + 接 3 placeholder。

## 跑與驗(dev stack)
```bash
# build + restart(WSL2 inotify 不可靠)
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
# 驗收:見 contracts/verification-commands.md(US1-3 + status enforce 即時 + 種子保護 + 013/014/016/017 回歸 + migration up→down→up + CDP :21080 + prod image build)
cargo test -p server   # 單元:is_seed_role_id / find_active_enabled SQL / enum / facade SQL-build
```

## 關鍵紀律
- **無新 crate/dep**(argon2 / sea-orm `Expr`·`small_integer` / 011 / 015 既有)。
- handler 零 `entity::` token(守 009 lint);facade 唯一 entity 管道。
- roleCode immutable(RoleUpdateReq 省 roleCode);種子(id 1-3)不可刪/停用、可改 name/desc;業務違反一律 2222。
- **B 改 enforce_mw → 回歸驗 013 enforce + 017 寫端**(SC-011)。
```
