# C-V Contract: Endpoint Permission Authorization (023)

> wiring/形狀類無純函式者由本 C-V 覆蓋(curl + psql + CDP);純函式(multi-method HARD REPLACE 正交 / get 排序 / root-mode guard / D1 靜態 lint)走單元測試。
> **dev stack 前置**:`dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api`(WSL2 inotify 不可靠)+ **base-web 改後 restart base-web**;套 migration 023(`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up`)。**dev DB = `soybean_admin_rust`**(非 `soybean`;psql 用 `-d soybean_admin_rust`)。base-web 經 front-nginx :21080 `/api`;rust-api 直連 :21081。帳號密碼 `123456`(Super/Admin/User)。
> **狀態污染**:編輯 Admin/User endpoint 改 dev casbin_rule(驗後還原或 throwaway DB);**migration 023 只 seed 3 R_SUPER 列、不動既有矩陣**。**無新 crate → prod image build 非強制**。

預備:
```bash
SUPER=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
ADMIN=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
USERT=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
```

## 1. getAllEndpoints(registry、Super-only)
```bash
# (a) 28 條 registry(25 既有 + 3 新)、字典序
curl -s :21081/systemManage/getAllEndpoints -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('count=',len(d));print([f\"{e['method']} {e['path']}\" for e in d][:6])"
# 期 count=28;含 'GET /systemManage/getAllEndpoints' 等 3 新治理端點
# (b) Super-only:Admin 5003 / 無 token 3333
curl -s -o /dev/null -w "%{http_code}\n" :21081/systemManage/getAllEndpoints -H "Authorization: Bearer $ADMIN"   # 403、body code 5003
curl -s :21081/systemManage/getAllEndpoints | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"      # 3333
```

## 2. getRoleEndpoints 預載 + root 全通
```bash
# (a) Admin(roleId=2)目前 granted(as-built:getUserList/getRoleList/getAllRoles)
curl -s ":21081/systemManage/getRoleEndpoints?roleId=2" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print(sorted(f\"{e['method']} {e['path']}\" for e in json.load(sys.stdin)['data']))"
# 期 ['GET /systemManage/getAllRoles','GET /systemManage/getRoleList','GET /systemManage/getUserList']
# (b) root 全通:roleId=1(Super)→ 回全 28
curl -s ":21081/systemManage/getRoleEndpoints?roleId=1" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print('super count=',len(json.load(sys.stdin)['data']))"   # 28
```

## 3. updateRoleEndpoints round-trip(HARD REPLACE、即時反映)
```bash
# (a) 給 Admin 加 getMenuTree(原 Admin 不可呼叫 → 應 5003)
curl -s -o /dev/null -w "before grant Admin getMenuTree: %{http_code}\n" ":21081/systemManage/getMenuTree" -H "Authorization: Bearer $ADMIN"   # 403
curl -s :21081/systemManage/updateRoleEndpoints -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"roleId":2,"endpoints":[{"method":"GET","path":"/systemManage/getUserList"},{"method":"GET","path":"/systemManage/getRoleList"},{"method":"GET","path":"/systemManage/getAllRoles"},{"method":"GET","path":"/systemManage/getMenuTree"}]}' | python3 -c "import sys,json;print('update code:',json.load(sys.stdin)['code'])"   # 0000
# ★ 即時反映(無重啟):Admin 現可呼叫 getMenuTree
curl -s -o /dev/null -w "after grant Admin getMenuTree: %{http_code}\n" ":21081/systemManage/getMenuTree" -H "Authorization: Bearer $ADMIN"   # 200
# (b) 還原(移除 getMenuTree)→ Admin 立即不可呼叫
curl -s :21081/systemManage/updateRoleEndpoints -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"roleId":2,"endpoints":[{"method":"GET","path":"/systemManage/getUserList"},{"method":"GET","path":"/systemManage/getRoleList"},{"method":"GET","path":"/systemManage/getAllRoles"}]}'
curl -s -o /dev/null -w "after restore: %{http_code}\n" ":21081/systemManage/getMenuTree" -H "Authorization: Bearer $ADMIN"   # 403(還原基線)
```

## 4. root-mode guard + 非法 endpoint + Super-only(業務驗證)
```bash
# (a) root-mode:編輯 Super(roleId=1)→ 2222
curl -s :21081/systemManage/updateRoleEndpoints -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d '{"roleId":1,"endpoints":[]}' | python3 -c "import sys,json;print('edit super:',json.load(sys.stdin)['code'])"   # 2222「不可编辑超级管理员」
# (b) 非法 endpoint(不在 registry)→ 2222
curl -s :21081/systemManage/updateRoleEndpoints -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d '{"roleId":2,"endpoints":[{"method":"GET","path":"/nope"}]}' | python3 -c "import sys,json;print('illegal:',json.load(sys.stdin)['code'])"   # 2222「接口不存在」
# (c) roleId number|string 皆吃
curl -s :21081/systemManage/updateRoleEndpoints -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d '{"roleId":"2","endpoints":[{"method":"GET","path":"/systemManage/getUserList"},{"method":"GET","path":"/systemManage/getRoleList"},{"method":"GET","path":"/systemManage/getAllRoles"}]}' | python3 -c "import sys,json;print('string roleId:',json.load(sys.stdin)['code'])"   # 0000(還原 Admin 基線)
# (d) Super-only:Admin updateRoleEndpoints → 5003;無 token → 3333
curl -s :21081/systemManage/updateRoleEndpoints -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"roleId":2,"endpoints":[]}' | python3 -c "import sys,json;print('admin update:',json.load(sys.stdin)['code'])"   # 5003
# (e) psql:casbin_rule 3 新治理端點列 + redis reload log
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "SELECT v0,v1,v2 FROM casbin_rule WHERE v1 IN ('/systemManage/getAllEndpoints','/systemManage/getRoleEndpoints','/systemManage/updateRoleEndpoints') ORDER BY v1;"
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs rust-api | grep -i "invalidate received\|policy reloaded" | tail -2
# (f) 011 audit(FR-011 / SC-006「100% 記錄稽核」)—— 鏡像 021 C-V、補回 022 漏驗。前述 §3/§4 update 皆以 Super(operator_id=1)操作
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "SELECT operation, entity_table, operator_id, payload_before, payload_after FROM sys_operation_log WHERE entity_table='casbin_rule' AND operator_id=1 ORDER BY created_at DESC LIMIT 1;"
# 期:operation='UPDATE'、operator_id=1(Super)、payload_before/after 含該角色 endpoint 集(前後差反映剛 grant/remove 的端點)
```

## 5. D1 coverage guard(build-time 靜態 lint、核心價值)
```bash
# 新 coverage lint 通過(每條 enforce_mw route 有 seed policy + ENDPOINT_REGISTRY 一致)
dcargo test -p server --test endpoint_coverage_lint   # pass(實際 test 名 plan 拍)
# negative unit test:故意漏 seed 的 fixture → lint 邏輯失敗(證咬合,in-test fixture、非真改 main.rs)
dcargo test -p server endpoint_coverage   # 含 positive + negative fixture 全綠
```

## 6. CDP browser click-through(經 front-nginx :21080)
```text
① Super 登入 → /manage/role → 編輯某「非 Super」角色(如 admin)→「接口权限」→ modal 顯 28 endpoint registry tree、該角色 granted 預勾 → 勾選提交 → !error toast
② root-mode UI:編輯「超级管理员」角色 →「接口权限」→ modal 全勾且 disabled(顯「超管全通、不可編輯」)
③ 端到端生效:Super 於 modal 給 admin 加一 endpoint → 還原(對齊 §3 curl)
```
> CDP 若 headless 不可用:curl 雙路徑(:21081 + :21080 /api)+ typecheck fallback;gating 視覺唯 CDP 能證(沿 022 isolated-context harness,見 `tests/022-manage-button-auth/`)。

## 7. migration 023 可逆 + 守恆
```bash
# up→down→up throwaway DB(只 3 列、不踩既有)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d postgres -c "CREATE DATABASE migration_revtest_023;"
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm -e <DBURLVAR>=postgres://soybean:<pw>@postgres:5432/migration_revtest_023 migrate up
# ... down(回退 023 一步:刪 3 列、既有 26 endpoint + menu + button 列存活)... up
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d postgres -c "DROP DATABASE migration_revtest_023;"

# 守恆
dcargo test -p server                       # 含新 endpoint_auth 單測 + D1 lint;既有不破
dcargo test -p server --test entity_access_lint   # 17(handler/auth/endpoint_auth 零 entity:: token)
# 回歸:013 enforce 階梯 / 019-022 讀寫 / menu(021)/ button(022) policy 不破;既有 endpoint 矩陣不變(FR-010)
```

## Acceptance Gate(全綠才 READY TO MERGE)
- getAllEndpoints 28 字典序 + Super-only(Admin 5003/none 3333)✅
- getRoleEndpoints 預載 + root 全通(Super 回 28)✅
- updateRoleEndpoints HARD REPLACE 即時反映(grant/remove、無重啟)+ root-mode reject(編輯 Super 2222)+ 非法 endpoint 2222 + roleId number|string + Super-only + redis reload ✅
- **011 audit:`sys_operation_log` 記 operator_id + payload_before/after(變更前後 endpoint 集)** ✅(鏡像 021、補 022 漏驗)
- **D1 靜態 lint:每 enforce_mw route 有 seed + registry 一致;negative fixture 抓 drift** ✅
- CDP:接口权限 modal 顯 registry + 編輯非-Super 角色 + root-mode disabled-for-Super ✅
- migration 023 up→down→up 可逆(不踩既有矩陣)✅
- 守恆:server 單測(+endpoint_auth +D1 lint)+ entity_access_lint + 零 entity:: + Migrator::up 0 + 回歸 013/019/020/021/022 + 既有 endpoint 矩陣不變 ✅
- DESIGN §4.6.3/§6.3 過時 wildcard 文字已校正(L500/521/749-752)+ §11.22 record ✅
- Constitution §IV 8/8 PASS(含 MODAL-WIRING amendment v1.4.0)✅
</content>
