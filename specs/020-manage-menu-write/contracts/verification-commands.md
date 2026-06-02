# Contracts — Verification Commands (C-V): 020 manage-menu-write

> wiring/形狀類無純函式測試者由本 C-V 覆蓋(curl + psql + CDP),tasks/plan 明示「無單元測試」之處由此驗。dev stack 前置:`dcargo build -p server && docker compose ... restart rust-api`(WSL2 inotify 不可靠,見 project memory);套 migration 020(`docker compose run --rm migrate up`)。base-web 經 **front-nginx `:21080`** 真實 `/api`;rust-api 直連 `:21081`。**寫端會改 dev DB sys_menu**(US1-3 累積狀態;D1 payoff 編輯種子後**須還原**或用 throwaway 驗逐字基線)。

## 0. 端點與授權
- **4 寫端**(Super-only,casbin seed 020 R_SUPER 4 行,掛 `enforce_mw`):`POST /systemManage/addMenu` · `POST /systemManage/updateMenu` · `DELETE /systemManage/deleteMenu` · `DELETE /systemManage/batchDeleteMenu`。回 `Res<()>`(HTTP 200,業務碼在 envelope `code`):成功 `0000` / 業務錯誤 `2222` / 權限不足 `5003` / 未認證 `3333` / infra `5000`。
- **不掛/不動**:getUserRoutes(讀 sys_menu、code 不動)、019 三讀端、constant routes、migration 010 menu policy。

## 1. US1 — addMenu

```bash
SUPER=$(login Super); ADMIN=$(login Admin)
# (a) 新增頂層自訂選單(parentId=0 number)→ 0000;getMenuList 多 1 筆真值、id=string、parentId="0"
curl -s :21081/systemManage/addMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"parentId":0,"menuType":"2","menuName":"報表","routeName":"report","routePath":"/report","component":"view.report","icon":"mdi:chart-bar","iconType":"1","i18nKey":"route.report","order":20,"status":"1","keepAlive":false,"constant":false,"hideInMenu":false,"multiTab":false,"buttons":[{"code":"R_EXPORT","desc":"匯出"}],"query":[]}' | grep -o '"code":"[0-9]*"'   # 0000
# (b) 新增子選單(parentId 衍生自既有 → 可能 string;驗彈性反序列化):parentId="2"(manage)
curl -s :21081/systemManage/addMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"parentId":"2","menuType":"2","menuName":"報表子","routeName":"report_sub","routePath":"/manage/report-sub","component":"view.report_sub","iconType":"1","i18nKey":"route.report_sub","order":21,"status":"1"}' | grep -o '"code":"[0-9]*"'   # 0000(parentId string 也吃)
# (c) route_name 重複 → 2222「路由名称已存在」
curl -s :21081/systemManage/addMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d '{"parentId":0,"menuType":"2","menuName":"重複","routeName":"home","routePath":"/x","component":"view.x","status":"1"}' | grep -o '"code":"[0-9]*"'   # 2222
# (d) Admin → 5003 / 無 token → 3333
curl -s :21081/systemManage/addMenu -H "Authorization: Bearer $ADMIN" -d '{}' | grep -o '"code":"[0-9]*"'   # 5003
curl -s :21081/systemManage/addMenu -d '{}' | grep -o '"code":"[0-9]*"'   # 3333
# (e) ★ SC-006(D3 不碰 casbin):新增選單後對所有角色不顯於 runtime 導覽(無可見性 policy)
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $SUPER" | grep -c '"report"' || true   # 期 0(新選單 report 不在 getUserRoutes,須等 MenuAuth 指派可見性)
```
psql:`SELECT route_name,parent_id,menu_type,menu_name,"order",buttons,created_by FROM sys_menu WHERE route_name IN('report','report_sub');`(真值 + created_by=1〔Super〕+ buttons jsonb round-trip);audit:`SELECT operation FROM sys_operation_log WHERE entity_table='sys_menu' AND operation='INSERT';`

## 2. US2 — updateMenu(routeName/menuType immutable)

```bash
# (a) 編輯自訂選單業務欄(改 menuName/order/icon)→ 0000;getMenuList 反映新值
RID=$(psql ... -tAc "SELECT id FROM sys_menu WHERE route_name='report' AND deleted_at IS NULL")
curl -s :21081/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$RID\",\"routeName\":\"HACK\",\"menuType\":\"1\",\"menuName\":\"報表改\",\"order\":99,\"icon\":\"mdi:chart-line\",\"iconType\":\"1\",\"status\":\"1\"}" | grep -o '"code":"[0-9]*"'   # 0000
# (b) ★ routeName/menuType 不變(送了 HACK/1 也忽略)
psql ... -tAc "SELECT route_name,menu_type,menu_name,\"order\" FROM sys_menu WHERE id=$RID;"   # route_name 仍 report、menu_type 仍 2、menu_name=報表改、order=99
# (c) updated_at/by 成對非空
psql ... -tAc "SELECT updated_at IS NOT NULL, updated_by FROM sys_menu WHERE id=$RID;"   # t | 1
# (d) 不存在 id → 2222「菜单不存在」
curl -s :21081/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d '{"id":"999999","menuName":"x","status":"1"}' | grep -o '"code":"[0-9]*"'   # 2222
```

## 3. US3 — deleteMenu / batchDeleteMenu(種子保護 + 父子守則 + 批次原子)

```bash
# (a) 刪自訂葉選單 → 0000;軟刪出列(getMenuList 不再見、psql deleted_at 非空 + deleted_by)
SID=$(psql ... -tAc "SELECT id FROM sys_menu WHERE route_name='report_sub' AND deleted_at IS NULL")
curl -s -X DELETE :21081/systemManage/deleteMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"id\":\"$SID\"}" | grep -o '"code":"[0-9]*"'   # 0000
psql ... -tAc "SELECT deleted_at IS NOT NULL, deleted_by FROM sys_menu WHERE id=$SID;"   # t | 1
# (b) ★ 刪種子選單 → 2222「不可删除系统内置菜单」
MMID=$(psql ... -tAc "SELECT id FROM sys_menu WHERE route_name='manage_menu' AND deleted_at IS NULL")
curl -s -X DELETE :21081/systemManage/deleteMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"id\":\"$MMID\"}" | grep -o '"code":"[0-9]*"'   # 2222
# (c) ★ 刪有 active 子的父(manage,有 4 子)→ 2222「请先删除子菜单」(亦同時種子→先命中種子或具子,皆 2222)
MID=$(psql ... -tAc "SELECT id FROM sys_menu WHERE route_name='manage' AND deleted_at IS NULL")
curl -s -X DELETE :21081/systemManage/deleteMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"id\":\"$MID\"}" | grep -o '"code":"[0-9]*"'   # 2222
# (d) ★ 種子停用 guard:update manage_user status=2 → 2222「不可停用系统内置菜单」
UID=$(psql ... -tAc "SELECT id FROM sys_menu WHERE route_name='manage_user' AND deleted_at IS NULL")
curl -s :21081/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"id\":\"$UID\",\"menuName\":\"用户管理\",\"status\":\"2\"}" | grep -o '"code":"[0-9]*"'   # 2222
# (e) ★ batchDelete 原子拒:批含種子 → 整批拒、無部分執行
curl -s -X DELETE :21081/systemManage/batchDeleteMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"ids\":[\"$MMID\",\"<某自訂 id>\"]}" | grep -o '"code":"[0-9]*"'   # 2222
psql ... -tAc "SELECT deleted_at IS NULL FROM sys_menu WHERE id IN($MMID, <自訂 id>);"   # 皆 t(無一被刪)
# (f) Admin → 5003 / none → 3333(4 端皆是)
```

## 4. ★ D1 payoff — 編輯反映於 runtime 導覽(統一源驗證)

```bash
# 編輯既有「可見」種子選單的顯示欄(order),getUserRoutes 即時反映;改完還原避免污染基線
# 取 manage_user 現 order(seed=1)→ 改 5 → getUserRoutes(Super)manage 子序變動 → 還原回 1
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $SUPER" | python3 -m json.tool > /tmp/020_before.json
curl -s :21081/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"id\":\"$UID\",\"menuName\":\"用户管理\",\"order\":5,\"status\":\"1\"}"
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $SUPER" | python3 -m json.tool > /tmp/020_after.json
diff /tmp/020_before.json /tmp/020_after.json   # 只 manage_user 的 meta.order 1→5(+ 因 order 變動造成的子序變化),其餘逐字不變 → 證 DB-driven 即時反映
curl -s :21081/systemManage/updateMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"id\":\"$UID\",\"menuName\":\"用户管理\",\"order\":1,\"status\":\"1\"}"   # 還原
```

## 5. 回歸(SC-008)

- **★ getUserRoutes 既有逐字基線**:未編輯任何選單時,三角色 getUserRoutes 逐字 == 019/014 基線(`/tmp/019-baseline/before_{Super,Admin,User}.json`;D1 payoff 測試的編輯須還原或用 throwaway DB);getConstantRoutes 不變。
- **019 三讀端**:getMenuList/v2(新增/刪除後筆數正確真值)/ getMenuTree(父子)/ getAllPages(48)不破。
- **013 enforce / 016 list / 017 user 寫端 / 018 role 寫端 + status enforce 即時**:不破。
- **守恆**:server 單測全綠(新增:guard 純函式〔is_seed_menu / parentId de_parent_id〕+ create/update/soft_delete SQL-build〔§I.6 成對、update 不含 route_name/menu_type/parent_id〕+ DTO 序列化)+ entity_access_lint(handler 零 `entity::`)+ xdb + `Migrator::up` grep 0。

## 6. migration 可逆 + prod image build
```bash
# migration 020 up→down→up 對 throwaway DB 親驗可逆(seed_menu_write_policy)
#   up → casbin_rule +4 write rows(addMenu/updateMenu POST、deleteMenu/batchDeleteMenu DELETE)
#   down → 精準刪該 4 行(不踩 010 menu policy v2='menu' / 019 read policy 3 GET)
#   up → 還原
# prod target image build(sys_menu 既有 crate 模組、非新 crate 故非 §3 強制,沿 016-018 de-risk 列入)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # 綠
```

## 7. CDP 端到端(front-nginx :21080)
登入 Super → /manage/menu:**新增選單**(填表單送出→ 列表出現新筆;**nav 需 MenuAuth、新選單暫不顯**,符合 D3)/ **編輯既有種子**(改 manage_user 顯示名/order → 列表 + nav 反映)/ **刪除自訂選單**(出列)/ **刪種子→ 2222 toast** / **刪有子父→ 2222 toast**。harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A。

> **CDP defer 自覺(沿 016/017/018)**:若 CDP 端到端較難構造,至少 **curl 直送證 4 寫端 + guard + D1 payoff**(curl≠modal、但寫端鏡像 production-proven 017/018、風險低);難構造則登記 follow-up。

## 8. 守恆細節(無單元測試的 wiring → 本 C-V 覆蓋,plan/tasks 明示)
- guard 純函式(is_seed_menu / count_active_children 判定)、parentId 彈性反序列化(de_parent_id)、create/update/soft_delete SQL-build(§I.6 成對、不動 route_name/menu_type)、DTO 序列化 → **單元測試**。
- 4 寫端 wiring/guard/授權、D1 payoff、batch 原子拒、CDP、回歸 → **本 C-V**(curl/psql/CDP)。
