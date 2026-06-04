# C-V Contract: menu-restore-reparent (025)

> wiring/形狀類無純函式者由本 C-V 覆蓋(curl + psql + CDP + migration 可逆)。本波**新純單測 = would_create_cycle + immutability 重寫**;restore/re-parent guards 為 handler wiring + DB,由 C-V 覆蓋(data-model §7)。
> **dev 前置**:`dcargo build -p server`(加 2 handler/route + MenuUpdateReq/UpdateMenuData + cycle fn + lint count)+ `docker compose ... restart rust-api`(WSL2 inotify、project memory)+ 套 migration 025(`run --rm migrate up`)。base-web 改後 `restart base-web`。**dev DB = `soybean_admin_rust`**;rust-api 直連 `http://127.0.0.1:21081`(curl 用顯式、不支援 :port 短語法);front-nginx :21080 `/api`;帳號 `123456`(Super/Admin/User)。
> **狀態污染**:測試會軟刪/復原/搬移 dev sys_menu 列(驗後還原或 throwaway DB)。**無新 crate → prod image build 非強制**。

預備:
```bash
H=http://127.0.0.1:21081; J='Content-Type: application/json'
SUPER=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
ADMIN=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -t -A"
addmenu(){ curl -s $H/systemManage/addMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "$1"; }   # 回 0000 + 動態 id
```

## 1. restore round-trip(US1:刪→getDeletedMenus 顯→復原→回 active + audit RESTORE)
```bash
# 建一筆自訂葉選單 cdp_restore(menu_type=2、parent 頂層),取 id
addmenu '{"menuName":"复原测试","routeName":"cdp_restore","menuType":"2","routePath":"/cdp-restore","component":"view.cdp-restore","parentId":0,"status":"1","order":99}'
RID=$($PSQL -c "SELECT id FROM sys_menu WHERE route_name='cdp_restore' AND deleted_at IS NULL;")
# 軟刪
curl -s $H/systemManage/deleteMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$RID\"}" | python3 -c "import sys,json;print('delete:',json.load(sys.stdin)['code'])"  # 0000
# getDeletedMenus 應含 cdp_restore
curl -s "$H/systemManage/getDeletedMenus?current=1&size=50" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;r=json.load(sys.stdin)['data']['records'];print('已刪含 cdp_restore=', any(m['routeName']=='cdp_restore' for m in r))"  # True
# getMenuList(active)不含
curl -s "$H/systemManage/getMenuList/v2?current=1&size=100" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;r=json.load(sys.stdin)['data']['records'];print('active 不含 cdp_restore=', all(m['routeName']!='cdp_restore' for m in r))"  # True
# restore
curl -s $H/systemManage/restoreMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$RID\"}" | python3 -c "import sys,json;print('restore:',json.load(sys.stdin)['code'])"  # 0000
# 回 active + deleted_* 皆 NULL
$PSQL -c "SELECT 'deleted_at_null='||(deleted_at IS NULL)::text||' deleted_by_null='||(deleted_by IS NULL)::text FROM sys_menu WHERE id=$RID;"  # both t
# audit RESTORE
$PSQL -c "SELECT operation FROM sys_operation_log WHERE entity_table='sys_menu' AND entity_id=$RID ORDER BY id DESC LIMIT 1;"  # RESTORE
```

## 2. restore guards(R4:孤兒父 / route_name 佔用 / 非 deleted)
```bash
# ③ 孤兒父:建父 cdp_dir(目錄)+ 子 cdp_child,刪子→刪父,restore 子應 2222「上层菜单已删除」
addmenu '{"menuName":"目录","routeName":"cdp_dir","menuType":"1","routePath":"/cdp-dir","component":"layout.base","parentId":0,"status":"1","order":98}'
PID=$($PSQL -c "SELECT id FROM sys_menu WHERE route_name='cdp_dir' AND deleted_at IS NULL;")
addmenu "{\"menuName\":\"子\",\"routeName\":\"cdp_child\",\"menuType\":\"2\",\"routePath\":\"/cdp-dir/child\",\"component\":\"view.cdp-child\",\"parentId\":$PID,\"status\":\"1\",\"order\":1}"
CID=$($PSQL -c "SELECT id FROM sys_menu WHERE route_name='cdp_child' AND deleted_at IS NULL;")
curl -s $H/systemManage/deleteMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$CID\"}" >/dev/null   # 刪子
curl -s $H/systemManage/deleteMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$PID\"}" >/dev/null   # 刪父(此時無 active 子、可刪)
curl -s $H/systemManage/restoreMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$CID\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('孤兒 restore code=',d['code'],'msg=',d['msg'])"  # 2222 上层菜单已删除
# 先復原父,再復原子 → 兩者皆 0000
curl -s $H/systemManage/restoreMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$PID\"}" | python3 -c "import sys,json;print('restore 父:',json.load(sys.stdin)['code'])"  # 0000
curl -s $H/systemManage/restoreMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$CID\"}" | python3 -c "import sys,json;print('restore 子:',json.load(sys.stdin)['code'])"  # 0000
# ② route_name 佔用:刪 cdp_restore、建新 active 同 route_name、restore 原 → 2222「路由名已被占用」(驗後清)
# ① 非 deleted:restore 一個 active id → 2222「菜单不存在或未删除」
curl -s $H/systemManage/restoreMenu -H "Authorization: Bearer $SUPER" -H "$J" -d "{\"id\":\"$RID\"}" | python3 -c "import sys,json;print('restore active code=',json.load(sys.stdin)['code'])"  # 2222
```

## 3. re-parent round-trip(US2:搬自訂選單 → getUserRoutes 即時反映新位置)
```bash
# 把 cdp_restore(頂層)搬到 cdp_dir 下 → updateMenu 帶 parentId=PID + 全業務欄(整欄替換、須帶全集,§2.24/project memory)
curl -s "$H/systemManage/getMenuList/v2?current=1&size=100" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;[print(json.dumps(m)) for m in json.load(sys.stdin)['data']['records'] if m['routeName']=='cdp_restore']" > /tmp/m.json
# ★ 完整欄 payload(project memory `wholecolumn_update_acceptance`):updateMenu 整欄替換、省略欄會被 NULL 化汙染列 → 須先從上方 getMenuList 讀 cdp_restore 現列**完整欄**(/tmp/m.json)、**只改 parentId**、再 **POST**(下方 `...其餘業務欄...` = 用該完整欄填滿;executing 階段 implementer 產此 payload helper);驗:
curl -s $H/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H "$J" -d '{"id":"'$RID'","parentId":'$PID',"menuName":"复原测试","menuType":"2","routeName":"cdp_restore","routePath":"/cdp-restore","component":"view.cdp-restore","status":"1","order":99,...其餘業務欄...}' | python3 -c "import sys,json;print('reparent:',json.load(sys.stdin)['code'])"  # 0000
$PSQL -c "SELECT 'parent_id='||parent_id FROM sys_menu WHERE id=$RID;"  # = PID
# Super getUserRoutes 即時反映 cdp_restore 在 cdp_dir 下(D1 payoff、無重啟;cdp_dir/cdp_restore 須有 Super menu 可見性 policy 才顯,否則用 psql 證 parent_id)
```

## 4. re-parent guards(R3:種子 / cycle / 無效父)
```bash
# (a) 種子:搬 manage_user(種子)→ 2222「不可移动系统内置菜单」
MU=$($PSQL -c "SELECT id FROM sys_menu WHERE route_name='manage_user' AND deleted_at IS NULL;")
curl -s $H/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H "$J" -d '{"id":"'$MU'","parentId":'$PID',...完整 manage_user 欄...}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('種子 reparent=',d['code'],d['msg'])"  # 2222 不可移动系统内置菜单
# (b) cycle:把 cdp_dir 搬到自己子 cdp_restore 下(cdp_restore 現是 cdp_dir 的子)→ 2222「不可移动到自己的子层」
curl -s $H/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H "$J" -d '{"id":"'$PID'","parentId":'$RID',...完整 cdp_dir 欄...}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('cycle=',d['code'],d['msg'])"  # 2222 不可移动到自己的子层
# (c) 無效父(非目錄):把 cdp_child($CID)搬到 cdp_restore($RID,menu_type=2 葉、非目錄)下 → 2222「上层菜单无效」
curl -s $H/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H "$J" -d '{"id":"'$CID'","parentId":'$RID',...完整 cdp_child 欄(從 getMenuList 取)...}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('無效父(非目錄)=',d['code'],d['msg'])"  # 2222 上层菜单无效
# (c') 不存在父:parentId=999999 → 2222「上层菜单无效」
curl -s $H/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H "$J" -d '{"id":"'$RID'","parentId":999999,...完整 cdp_restore 欄...}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('不存在父=',d['code'],d['msg'])"  # 2222 上层菜单无效
```

## 5. 授權 + envelope(Super-only)
```bash
# Admin 對 2 新端點 → 5003(無 endpoint policy)/ 無 token → 3333
curl -s "$H/systemManage/getDeletedMenus?current=1&size=10" -H "Authorization: Bearer $ADMIN" | python3 -c "import sys,json;print('Admin getDeleted code=',json.load(sys.stdin)['code'])"  # 5003
curl -s $H/systemManage/restoreMenu -H "$J" -d '{"id":"1"}' | python3 -c "import sys,json;print('no-token restore=',json.load(sys.stdin)['code'])"  # 3333
# getDeletedMenus envelope = PageRes{current,size,total,records}、id/parentId string
curl -s "$H/systemManage/getDeletedMenus?current=1&size=10" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('keys=',sorted(d.keys()))"  # current,records,size,total
```

## 6. psql seed + D1 lint(migration 025 + endpoint 3-way)
```bash
# 2 新 endpoint policy R_SUPER
$PSQL -c "SELECT v0,v1,v2 FROM casbin_rule WHERE ptype='p' AND v1 IN ('/systemManage/getDeletedMenus','/systemManage/restoreMenu') ORDER BY v1;"  # 2 列 R_SUPER GET/POST
# D1 build-time lint(三方一致 + count 30)
dcargo test -p server --test endpoint_coverage_lint   # 全綠(EXPECTED_ROUTE_COUNT=30、registry==routes、無 uncovered)
```

## 7. migration 025 可逆 + 守恆
```bash
# up→down→up throwaway DB:endpoint policy 2 列增刪、不踩既有(menu 15/button 16/023 endpoint 存活)
# 守恆
dcargo test -p server                              # 新 would_create_cycle + 重寫 immutability 全綠;既有不破
dcargo test -p server --test entity_access_lint    # 17 不破(facade 新 fn 在 facade/、handler 不碰 entity::)
dcargo test -p server --test endpoint_coverage_lint   # D1 30
grep -rn "Migrator::up" rust-api/server/src/       # 0(守 007 FR-009)
docker compose ... exec -T base-web pnpm typecheck # exit 0
# 回歸:020 menu CRUD 逐項不破(addMenu/updateMenu〔未改 parentId 的純編輯不變〕/deleteMenu/種子刪 2222/父刪 guard);019 三讀端 + getUserRoutes 逐字(未 reparent 時 == 基線);021 自鎖 guard 不破(R6)
```

## 8. CDP browser(經 front-nginx :21080;沿 022/023 isolated-context harness,建 `tests/025-menu-restore-reparent/`)
```text
① Super /manage/menu → 切「顯示已刪除」toggle → 列已刪選單 + 「復原」鈕 → 復原一筆 → 切回 active 樹見它回來。
② Super /manage/menu → 編輯一筆自訂選單 → parentId NTreeSelect 改父 → 提交 → 新位置反映(getUserRoutes/樹)。
③ 編輯種子選單(如 manage_user)→ parentId 控件 disabled(R2);自訂選單 → 可改。
④ restore 孤兒父已刪 → toast 2222「上层菜单已删除」;cycle/種子 reparent → toast 2222。
```
> CDP headless 不可用:curl §1-4 + base-web typecheck fallback;UI 視覺(toggle/NTreeSelect disabled)唯 CDP 能證。

## Acceptance Gate(全綠才 READY TO MERGE)
- restore round-trip + audit RESTORE + deleted_* 成對 NULL ✅
- restore guards(孤兒父 2222 / route_name 佔用 2222 / 非 deleted 2222)✅
- re-parent round-trip(parent_id 改、getUserRoutes 反映)+ guards(種子 2222 / cycle 2222 / 無效父 2222)✅
- 純單測:would_create_cycle + immutability 重寫綠 ✅
- Super-only(Admin 5003 / none 3333);envelope PageRes;id/parentId string ✅
- migration 025 up→down→up 可逆;D1 lint 30 三方一致 ✅
- 守恆(server 單測 + entity_access_lint 17 + Migrator::up=0 + typecheck)+ 回歸 019/020/021 不破 ✅
- CDP:① restore toggle ② reparent NTreeSelect ③ 種子 disabled ④ guard toast ✅
- **Constitution v1.5.0 §IV 8/8 PASS(MODAL-WIRING (d) amendment 已 user 親決 + ratify)** ✅
