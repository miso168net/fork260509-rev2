# Contracts — Verification Commands (C-V): 018 manage-role-write

> wiring/形狀類無純函式測試者由本 C-V 覆蓋(CDP browser smoke + curl + psql),tasks/plan 明示「無單元測試」之處由此驗。dev stack 前置:`dcargo build -p server && docker compose ... restart rust-api`(WSL2 inotify 不可靠,見 project memory)。base-web 經 **front-nginx `:21080`** 真實 `/api` 路徑。

## 0. 端點與授權

4 寫端(Super-only,casbin seed `R_SUPER` 4 行):`POST /systemManage/addRole`、`POST /systemManage/updateRole`、`DELETE /systemManage/deleteRole`、`DELETE /systemManage/batchDeleteRole`。回 `Res<()>`(HTTP 200,業務碼在 envelope `code`):成功 `0000` / 業務違反 `2222` / 權限不足 `5003` / 未認證 `3333` / 內部 `5000`。

## 1. US1 — addRole(curl + psql)

```bash
# Super token(沿 000-bootstrap CDP/login 取;或 curl /auth/login Super/123456)
# 1) 新增成功 0000 + 列表 +1 + id=string + 真值(role_desc/status 非 null)
curl -s :21081/systemManage/addRole -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"roleName":"測試角色","roleCode":"R_TEST","roleDesc":"desc","status":"1"}'   # → code 0000
curl -s ':21081/systemManage/getRoleList?current=1&size=20' -H "Authorization: Bearer $SUPER"  # 含 R_TEST、roleDesc/status 真值、id 為 string
# 2) 重複 roleCode → 2222(不寫半筆)
curl -s :21081/systemManage/addRole -H "Authorization: Bearer $SUPER" -d '{"roleName":"x","roleCode":"R_TEST","roleDesc":"","status":"1"}'  # → 2222「角色代码已存在」
# 3) 同名不同碼 → 成功(name 不唯一)
curl -s :21081/systemManage/addRole -H "Authorization: Bearer $SUPER" -d '{"roleName":"測試角色","roleCode":"R_TEST2","status":"1"}'  # → 0000
# 4) Admin / User / 無 token → 5003 / 5003 / 3333
curl -s :21081/systemManage/addRole -H "Authorization: Bearer $ADMIN" -d '{...}'   # → 5003
curl -s :21081/systemManage/addRole -d '{...}'                                      # → 3333
# 5) 非法 status → 2222
curl -s :21081/systemManage/addRole -H "Authorization: Bearer $SUPER" -d '{"roleName":"y","roleCode":"R_Y","status":"9"}'  # → 2222「状态取值无效」
# psql:audit INSERT + created_by=operator + created_at 真值
psql -h127.0.0.1 -p25432 -U soybean -c "SELECT operation,entity_table,entity_id FROM sys_operation_log WHERE entity_table='sys_role' ORDER BY id DESC LIMIT 3;"  # INSERT
psql ... -c "SELECT code,status,created_by,created_at IS NOT NULL FROM sys_role WHERE code='R_TEST';"   # status=1, created_by=1(Super), created_at not null
```

## 2. US2 — updateRole(含 D5 時間源 + roleCode immutable + 種子保護)

```bash
# 1) 改 name/desc/status → 0000 + updated_at/updated_by 成對 + **DB-side**(non-null、與 audit 一致)
curl -s :21081/systemManage/updateRole -H "Authorization: Bearer $SUPER" -d '{"id":"<R_TEST id>","roleName":"改名","roleDesc":"d2","status":"1"}'  # 0000
psql ... -c "SELECT updated_at IS NOT NULL, updated_by FROM sys_role WHERE code='R_TEST';"   # 成對非 null、updated_by=1
# 2) roleCode immutable:wire 帶 roleCode 被忽略(server RoleUpdateReq 無 roleCode 欄)→ code 不變
# 3) 不存在 id → 2222「角色不存在」
curl -s :21081/systemManage/updateRole -H "Authorization: Bearer $SUPER" -d '{"id":"99999","roleName":"x"}'  # 2222
# 4) 種子保護:停用種子 → 2222;改種子 name/desc → 0000
curl -s :21081/systemManage/updateRole -H "Authorization: Bearer $SUPER" -d '{"id":"1","roleName":"超管","status":"2"}'  # → 2222「不可停用系统内置角色」
curl -s :21081/systemManage/updateRole -H "Authorization: Bearer $SUPER" -d '{"id":"1","roleName":"超级管理员X","roleDesc":"d"}'  # → 0000(放行 name/desc)
# 5) Admin → 5003
```

## 3. US3 — delete / batchDelete(軟刪 + 種子保護整批拒 + no-op)

```bash
# 1) 軟刪自訂角色 → 0000 + 不現於 getRoleList(active+disabled 列表)+ SOFT_DELETE audit deleted_by
curl -s :21081/systemManage/deleteRole -X DELETE -H "Authorization: Bearer $SUPER" -d '{"id":"<R_TEST2 id>"}'  # 0000
psql ... -c "SELECT deleted_at IS NOT NULL, deleted_by FROM sys_role WHERE code='R_TEST2';"  # 成對
psql ... -c "SELECT operation FROM sys_operation_log WHERE entity_table='sys_role' AND operation='SOFT_DELETE' ORDER BY id DESC LIMIT 1;"
# 2) 刪種子(單筆/批次含種子)→ 2222 整批拒、無人被刪
curl -s :21081/systemManage/deleteRole -X DELETE -H "Authorization: Bearer $SUPER" -d '{"id":"1"}'  # 2222「不可删除系统内置角色」
curl -s :21081/systemManage/batchDeleteRole -X DELETE -H "Authorization: Bearer $SUPER" -d '{"ids":["<custom>","1"]}'  # 2222、custom 仍在
# 3) 空 ids → no-op 0000、不變動
curl -s :21081/systemManage/batchDeleteRole -X DELETE -H "Authorization: Bearer $SUPER" -d '{"ids":[]}'  # 0000 no-op
# 4) Admin → 5003
# 5) 軟刪 code 可重用:刪 R_TEST 後再 addRole roleCode=R_TEST → 0000
```

## 4. ★ status enforce 即時(B 核心 — 改 enforce_mw DB-fresh)

```bash
# 前置:給某 user 指派一個自訂角色 R_X(R_X seed 一條 menu/endpoint policy 供驗),user 登入取 token $U
# (a) R_X active:該 user 打 R_X 可達的受保護端點 → 200/允許;getUserRoutes 含 R_X menu
# (b) Super 把 R_X 停用(updateRole status=2)
# (c) 該 user 【用同一張舊 token $U、不重新登入】再打同端點 → **403 + 5003(即時失效,B 生效)**
#     getUserRoutes(同 token) → R_X menu 消失;getUserInfo → roles 不含 R_X
# (d) Super 重新啟用 R_X(status=1)→ 同 token 再打 → 恢復 200
# (e) ★ refresh-then-enforce(G1):停用 R_X → 待/強制 access 過期 → 用舊 refresh 換新 access
#     (refresh 不回 DB、新 token 的 claims.roles 仍含 R_X)→ 新 access 打 R_X 端點 → 仍 403+5003
#     (證 enforce_mw 吃 DB 有效角色、claims.roles 對 enforce vestigial、即時性不被 refresh 重簽復活)
# 對照(回歸):若改前(claims),(c)/(e) 會錯誤地仍 200 → 本條證明 enforce_mw 已改 DB-fresh
```

> 此條是 B 決策的關鍵驗收:**舊 token 不換、停用即時於 enforce 失效**。若 CDP 端到端較難構造,至少 curl 直送證明 enforce_mw 已 DB-fresh(curl≠modal 風險低,因 enforce 是 server 層)。

## 5. 不可指派(停用/軟刪角色)

```bash
# getAllRoles(指派下拉)不含停用/軟刪角色
curl -s :21081/systemManage/getAllRoles -H "Authorization: Bearer $SUPER"  # 不含已停用 R_X / 已軟刪 R_TEST2
# addUser/updateUser 指派含停用角色 code → 只採有效、靜默略過(017 路徑回歸)
curl -s :21081/systemManage/updateUser -H "Authorization: Bearer $SUPER" -d '{"id":"3","userRoles":["R_USER_COMMON","R_X(停用)"]}'  # 只指派 R_USER_COMMON
psql ... -c "SELECT role_id FROM sys_user_role WHERE user_id=3;"  # 無 R_X 的 role_id
```

## 6. 回歸(SC-011)

- **013 enforce**:Super/Admin 既有受保護端點 allow、User deny(5003)—— B 改 enforce_mw 後 allow/deny 不破。
- **014 menu**:三角色 getUserRoutes 階梯不破(Super 全/Admin 部分/User 只 home)。
- **016 list**:getUserList/getRoleList/getAllRoles 不破;getRoleList **roleDesc/status/audit 改吃真值**(R10,非全 null);分頁/搜尋/授權同 016。
- **017 sys_user 寫端**:US1-3 全綠 + **update_user 的 updated_at 改 DB-side col_expr 後**:updated_at/updated_by 成對非 null、與 audit payload_after 一致、US2 不破。
- **守恆**:server 單測全綠(新增:`is_seed_role_code` / `find_active_enabled` SQL 含 status / enum / facade SQL-build)+ entity_access_lint(handler 零 `entity::`)+ xdb;`Migrator::up` grep 0(server 不自動 migrate)。

## 7. migration 可逆 + prod image build

```bash
# migration up→down→up 對 throwaway DB 親驗可逆(alter_sys_role + seed_write_role_policy)
# prod target image build(無新 crate 故非 §3 強制,沿 016/017 de-risk 列入)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # 綠
```

## 8. CDP 端到端(front-nginx :21080)

登入 Super → /manage/role:新增角色 → 編輯(name/desc/status;roleCode 欄唯讀)→ 停用 → 列表仍見(狀態停用)→ 刪除自訂 → 出列表 → 種子刪/停用被拒(toast 2222)→ null 欄不 crash。harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A CDP scripts。
