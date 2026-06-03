# C-V Contract: Button Permission Authorization (022)

> wiring/形狀類無純函式者由本 C-V 覆蓋(curl + psql + CDP);純函式(code↔grant 對映 / union 字典序 / HARD REPLACE 冪等 / de_role_id)走單元測試。
> **dev stack 前置**:`dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api`(WSL2 inotify 不可靠,project memory)+ **base-web 改後 `docker compose ... restart base-web`**(vite stale,同 project memory);套 migration 022(`docker compose run --rm migrate up`)。base-web 經 **front-nginx :21080** `/api`;rust-api 直連 :21081。
> **狀態污染**:本波 seed function/toggle-auth + manage_user.buttons + casbin button/menu policy;編輯角色按鈕**改 dev casbin_rule button 列**(驗後還原或用 throwaway DB 驗逐字基線)。**無新 crate → prod image build 非強制**(只動既有 server/migration crate);可選跑一次確認。

預備:
```bash
SUPER=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
ADMIN=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
USERT=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
```

## 1. US2 — getAllButtons 聚合(registry)

```bash
# (a) 可用按鈕 = 6 碼(manage_user 3 + toggle-auth 3),字典序、dedup
curl -s :21081/systemManage/getAllButtons -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([b['code'] for b in d])"
# 期 ['B_CODE1','B_CODE2','B_CODE3','user:add','user:delete','user:edit']

# (b) Super-only:Admin 5003 / 無 token 3333
curl -s -o /dev/null -w "%{http_code}\n" :21081/systemManage/getAllButtons -H "Authorization: Bearer $ADMIN"   # body code 5003
curl -s :21081/systemManage/getAllButtons | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"      # 3333
```

## 2. US1 — getRoleButton / updateRoleButton round-trip(HARD REPLACE,即時 + 跨實例)

```bash
# (a) 預載:R_ADMIN(roleId=2)目前 granted
curl -s ":21081/systemManage/getRoleButton?roleId=2" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print(json.load(sys.stdin)['data'])"
# 期 ['B_CODE2','B_CODE3','user:edit']

# (b) 指派:給 R_ADMIN 加 user:add(HARD REPLACE 整集送回)
curl -s :21081/systemManage/updateRoleButton -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"roleId":2,"codes":["B_CODE2","B_CODE3","user:edit","user:add"]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"   # 0000

# (c) ★ 即時反映:Admin 重取 getUserInfo.buttons 立即含 user:add(無重啟)
curl -s :21081/auth/getUserInfo -H "Authorization: Bearer $ADMIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['buttons'])"
# 期 ['B_CODE2','B_CODE3','user:add','user:edit']（字典序）

# (d) 移除 user:add(送不含它的集)→ Admin getUserInfo 立即不含
curl -s :21081/systemManage/updateRoleButton -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"roleId":2,"codes":["B_CODE2","B_CODE3","user:edit"]}'
curl -s :21081/auth/getUserInfo -H "Authorization: Bearer $ADMIN" | python3 -c "import sys,json;print('user:add' in json.load(sys.stdin)['data']['buttons'])"   # False（還原基線）

# (e) 非法 code → 2222;空集 HARD REPLACE Ok;roleId number|string 皆吃
curl -s :21081/systemManage/updateRoleButton -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d '{"roleId":2,"codes":["nope:x"]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"   # 2222
curl -s :21081/systemManage/updateRoleButton -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d '{"roleId":"2","codes":["B_CODE2","B_CODE3","user:edit"]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"   # 0000（string id + 還原）

# (f) Super-only:Admin updateRoleButton → 5003
curl -s :21081/systemManage/updateRoleButton -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"roleId":2,"codes":[]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"   # 5003

# (g) psql:casbin_rule button 列 + redis reload log
docker compose exec -T postgres psql -U soybean -d soybean -c "SELECT v0,v1,v2 FROM casbin_rule WHERE v2='button' ORDER BY v0,v1;"
docker compose logs rust-api | grep -i "invalidate received\|policy reloaded" | tail -2
# 旁證跨實例:psql 直改一行 button policy + redis PUBLISH casbin:policy:invalidate → 同 instance reload 後 getUserInfo 反映
```

## 3. US3 回歸 — getUserInfo.buttons 逐字基線(未編輯時)

```bash
# 三角色逐字基線(B_CODE 子序保留 + user:* 新增)
for T in "$SUPER" "$ADMIN" "$USERT"; do curl -s :21081/auth/getUserInfo -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['buttons'])"; done
# 期 Super ['B_CODE1','B_CODE2','B_CODE3','user:add','user:delete','user:edit']
#    Admin ['B_CODE2','B_CODE3','user:edit']
#    User  ['B_CODE3']
```

## 4. US3 demo 救活 — toggle-auth 可達 + getUserRoutes re-base

```bash
# (a) 三角色 getUserRoutes 各含 function>function_toggle-auth（新基線）
for T in "$SUPER" "$ADMIN" "$USERT"; do curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $T" | grep -c '"function_toggle-auth"'; done   # 各 1

# (b) getConstantRoutes 不變;per-role home 不受影響（Super home 仍 'home' 或既設）
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['home'])"

# (c) psql sys_menu 2 新 row + buttons jsonb
docker compose exec -T postgres psql -U soybean -d soybean -c "SELECT route_name,menu_type,parent_id,buttons FROM sys_menu WHERE route_name IN ('function','function_toggle-auth');"
docker compose exec -T postgres psql -U soybean -d soybean -c "SELECT route_name,buttons FROM sys_menu WHERE route_name='manage_user';"
```

## 5. CDP browser click-through(經 front-nginx :21080,docs/superpowers/000 §5)

```text
① 用戶管理頁 pilot gating（真實業務頁端到端）：
   - Super 登入 → /manage/user → row 见 编辑+删除、toolbar 见 新增（granted user:add/edit/delete）
   - updateRoleButton 收回 R_USER... 不適用（User 不可達 manage_user）→ 改驗 Admin：
     Admin 登入 → /manage/user → row 见 编辑（user:edit）、不见 删除（無 user:delete）、toolbar 不见 新增（無 user:add）
   - Super updateRoleButton 給 Admin 加 user:delete → Admin 重登 → row 出现 删除 → 還原
② toggle-auth demo（救活）：
   - 三角色分別登入 → 导航至 /function/toggle-auth（nav 出现「切换权限」）→ 各见对应 B_CODE 钮
     （Super 见 B_CODE1/2/3 三钮、Admin 见 B_CODE2/3、User 见 B_CODE3）
③ 一併補 021 menu-auth-modal CDP click-through（同 /manage/role 頁、同 harness、清 021 §2.25 defer）：
   编辑角色 → 菜单权限 → 4 GET + 冪等提交 updateRoleMenu
```
> CDP 若 headless 不可用:curl 雙路徑(:21081 + :21080 /api)+ typecheck fallback;但 **gating 視覺效果唯 CDP 能證** → 本波優先實跑(user 瀏覽器 :9229 可用)。

## 6. migration 022 可逆 + 守恆

```bash
# up→down→up 用 throwaway DB（不擾 dev）
docker compose exec -T postgres psql -U soybean -d postgres -c "CREATE DATABASE migration_revtest_022;"
DATABASE_URL=postgres://soybean:soybean@postgres:5432/migration_revtest_022 docker compose run --rm migrate up
DATABASE_URL=...migration_revtest_022 docker compose run --rm migrate down   # 022 down：刪 2 sys_menu row + manage_user.buttons=NULL + 6 menu policy + 9 button policy；不踩 010/017/019/020/021
DATABASE_URL=...migration_revtest_022 docker compose run --rm migrate up
docker compose exec -T postgres psql -U soybean -d postgres -c "DROP DATABASE migration_revtest_022;"

# 守恆:既有單測 + lint + 無 Migrator::up + handler 零 entity::（009 lint）
dcargo test -p server
dcargo test -p entity_access_lint    # 17（handler/auth.rs/system_manage.rs/button_auth.rs 零 entity:: token）
# 回歸:013 enforce 階梯 / 019 三讀端 / 020 寫端 / 021 menu-auth（getRoleMenu/updateRoleMenu/home）不破
```

## 7. (可選)prod image build

```bash
# 無新 crate（只加 module 到既有 server crate）→ 非強制；可選確認 Dockerfile 無 COPY 缺口
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
```

## Acceptance Gate(全綠才 READY TO MERGE)

- US2 getAllButtons 聚合 6 碼字典序 + Super-only ✅
- US1 getRoleButton 預載 + updateRoleButton HARD REPLACE 即時反映(指派/移除)+ 非法 code 2222 + 空集 Ok + roleId number|string + Super-only + redis reload + 跨實例 ✅
- US3 getUserInfo.buttons 三角色逐字新基線(B_CODE 子序保留)✅
- US3 toggle-auth 三角色可達 + getUserRoutes re-base(各 +function/toggle-auth)+ getConstantRoutes 不變 + per-role home 不受影響 ✅
- CDP:用戶頁 gating 視覺(Admin 缺 删除/新增、Super 全)+ toggle-auth 三角色按鈕 + 順補 021 menu-auth click-through ✅
- migration 022 up→down→up 可逆(不踩既有 policy)✅
- 守恆:server 單測 + entity_access_lint 17 + 零 entity:: + Migrator::up 0 + 回歸 013/019/020/021 ✅
- Constitution v1.3.0 §IV 8/8 PASS ✅
