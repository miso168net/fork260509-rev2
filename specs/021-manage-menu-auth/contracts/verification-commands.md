# Contracts — Verification Commands (C-V): 021 manage-menu-auth

> wiring/形狀類無純函式測試者由本 C-V 覆蓋(curl + psql + CDP);純函式(id↔route_name 對映 / roles 取序 / 自鎖 guard / home update SQL-build)走單元測試。dev stack 前置:`dcargo build -p server && docker compose ... restart rust-api`(WSL2 inotify 不可靠,project memory);套 migration 021(`docker compose run --rm migrate up`)。base-web 經 **front-nginx :21080** `/api`;rust-api 直連 :21081。**會改 dev DB casbin_rule menu 列 + sys_role.home**(編輯後須還原或用 throwaway 驗逐字基線)。

## 0. 端點與授權
- **4 端點**(Super-only,casbin write policy 021 seed 4 行 R_SUPER,掛 `enforce_mw`):`GET /systemManage/getRoleMenu` · `POST /systemManage/updateRoleMenu` · `GET /systemManage/getRoleHome` · `POST /systemManage/updateRoleHome`〔URL 命名與 base-web wrapper 對齊〕。回 envelope `code`:成功 `0000` / 業務 `2222` / 權限 `5003` / 未認證 `3333` / infra `5000`。
- **不掛/不動**:010 menu policy(9 行起始)、getUserRoutes(讀同 enforcer、過濾邏輯不改)、019 三讀端、020 寫端、constant routes。

## 1. US1 — updateRoleMenu / getRoleMenuIds(可見性編輯即時反映)

```bash
SUPER=$(login Super); ADMIN=$(login Admin)
# 前置:取一自訂測試角色(或用 R_ADMIN)+ 取 manage_role 的 menu id
RID=$(psql ... -tAc "SELECT id FROM sys_role WHERE code='R_ADMIN'")
MR_ID=$(psql ... -tAc "SELECT id FROM sys_menu WHERE route_name='manage_role' AND deleted_at IS NULL")
# (a) 指派一組 menu(含 manage_role)給 R_ADMIN → 0000
curl -s :21081/systemManage/updateRoleMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"roleId\":\"$RID\",\"menuIds\":[<home id>,<manage_user id>,$MR_ID]}" | grep -o '"code":"[0-9]*"'   # 0000
# (b) ★ 即時反映:R_ADMIN 用戶(Admin)getUserRoutes 立即含 manage_role(無重啟)
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $ADMIN" | grep -c '"manage_role"'   # 期 1(新指派即時可見)
# (c) getRoleMenuIds 預載:回 R_ADMIN 目前可見 menu id[]
curl -s ":21081/systemManage/getRoleMenu?roleId=$RID" -H "Authorization: Bearer $SUPER" | python3 -m json.tool   # data=[id...] 含上面指派集
# (d) 移除 manage_role(重送不含它的集)→ Admin getUserRoutes 立即不含
curl -s :21081/systemManage/updateRoleMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"roleId\":\"$RID\",\"menuIds\":[<home id>,<manage_user id>]}" | grep -o '"code":"[0-9]*"'   # 0000
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $ADMIN" | grep -c '"manage_role"'   # 期 0(移除即時生效)
# (e) Admin→5003 / none→3333
curl -s :21081/systemManage/updateRoleMenu -H "Authorization: Bearer $ADMIN" -d '{}' | grep -o '"code":"[0-9]*"'   # 5003
curl -s :21081/systemManage/updateRoleMenu -d '{}' | grep -o '"code":"[0-9]*"'   # 3333
```
psql:`SELECT v0,v1,v2 FROM casbin_rule WHERE ptype='p' AND v0='R_ADMIN' AND v2='menu' ORDER BY v1;`(真值 = 指派的 route_name 集);audit:`SELECT operation,payload_before,payload_after FROM sys_operation_log WHERE entity_table='casbin_rule' ORDER BY created_at DESC LIMIT 1;`(operator + 前後集)。
> **完成後還原** R_ADMIN 的 010 原始可見性(home/manage_user/manage_user-detail)以免污染基線。

## 2. ★ redis pub-sub policy 失效通知
```bash
# 單 instance:updateRoleMenu 後 enforcer in-place + 自收 PUBLISH → load_policy reload(同態);log 應見 subscriber 收到 casbin:policy:invalidate + reload
docker compose ... logs rust-api | grep -iE "policy.*invalidate|policy.*reload|casbin.*reload"   # 期見 subscriber 收訊 + reload
# 旁證:直接 psql 改一行 menu policy + PUBLISH(模擬他 instance)→ 同 instance reload 後 getUserRoutes 反映(驗 subscriber→load_policy 鏈)
# 多 instance 真實 reload 留 follow-up(現 1 instance)
```

## 3. US2 — getRoleHome / updateRoleHome + getUserRoutes per-role home
```bash
# (a) 設 R_ADMIN home → 'manage_user' → 0000;sys_role.home 真值 + updated_at·by 成對
curl -s :21081/systemManage/updateRoleHome -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"roleId\":\"$RID\",\"home\":\"manage_user\"}" | grep -o '"code":"[0-9]*"'   # 0000
psql ... -tAc "SELECT home,(updated_at IS NOT NULL),updated_by FROM sys_role WHERE id=$RID;"   # manage_user | t | 1
# (b) getRoleHome 回真值
curl -s ":21081/systemManage/getRoleHome?roleId=$RID" -H "Authorization: Bearer $SUPER"   # data="manage_user"
# (c) ★ getUserRoutes per-role home 反映:Admin(R_ADMIN)getUserRoutes.home == 'manage_user'
curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $ADMIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['home'])"   # manage_user
# (d) 多角色取第一 active 角色(role id ASC):若建一 user 具兩角色、驗取 id 較小者 home
# (e) 還原 R_ADMIN home → 'home'
curl -s :21081/systemManage/updateRoleHome -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' -d "{\"roleId\":\"$RID\",\"home\":\"home\"}"
```

## 4. ★ 自鎖 guard(FR-006/M5)
```bash
# 對 R_SUPER 移除 manage_menu 可見性 → 2222「不可移除超级管理员的菜单管理可见性」、policy 不變
SUP_RID=$(psql ... -tAc "SELECT id FROM sys_role WHERE code='R_SUPER'")
curl -s :21081/systemManage/updateRoleMenu -H "Authorization: Bearer $SUPER" -H 'Content-Type: application/json' \
  -d "{\"roleId\":\"$SUP_RID\",\"menuIds\":[<home id 不含 manage_menu>]}" | grep -o '"code":"[0-9]*"'   # 2222
psql ... -tAc "SELECT count(*) FROM casbin_rule WHERE v0='R_SUPER' AND v1='manage_menu' AND v2='menu';"   # 仍 1(未被移除)
```

## 5. 回歸(SC-007)
- **★ getUserRoutes 既有逐字基線**:**未編輯任何角色**時(或 D1/US 編輯後還原),三角色 getUserRoutes 逐字 == 014/019 基線(`/tmp/020-baseline` 或重存);getConstantRoutes 不變;home 預設 'home'。
- **019 三讀端**(getMenuList/Tree/AllPages)/ **020 寫端**(addMenu/update/delete/batch)/ **013 enforce 階梯**(Super/Admin/User allow+deny)/ **016 list** 不破。
- **守恆**:server 單測全綠(新增:id↔route_name 對映 / roles_for_user_ordered 取序〔role id ASC〕/ 自鎖 guard 判定 / update_role_home_query SQL〔Home + current_timestamp + updated_by 成對〕)+ entity_access_lint(handler/route 零 `entity::`)+ xdb + `Migrator::up` grep 0。

## 6. migration 可逆 + (prod image build)
```bash
# migration 021 up→down→up 對 throwaway DB 可逆:
#   up → sys_role +home 欄(seed 'home')+ casbin_rule +4 write rows(getRoleMenu/updateRoleMenu/getRoleHome/updateRoleHome)
#   down → drop home 欄 + 精準刪該 4 write rows(不踩 010 menu 9 / 019 read 3 / 020 write 4 / 017 role-write 4)
#   up → 還原
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # 無新 crate(僅模組+migration)→ 非 §3 強制;沿 016-020 de-risk 列入
```

## 7. CDP 端到端(front-nginx :21080)
登入 Super → /manage/role → 開某角色 → menu-auth-modal:勾選選單 → 儲存(列表/該角色重登 nav 反映)+ home 下拉設定(該角色 getUserRoutes.home 反映)。harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A(沿 020 dev :21080 menu CDP)。
> **CDP defer 自覺(沿 016-020)**:若難構造,curl 直送證 4 端點 + 即時反映 + 自鎖 + redis log + home,登記 follow-up。

## 8. 守恆細節(無單元測試的 wiring → 本 C-V 覆蓋)
- 4 端點 wiring/授權、即時反映、redis reload、自鎖 guard、per-role home、CDP、回歸 → 本 C-V。
- id↔route_name 對映 / roles_for_user_ordered / 自鎖 guard 判定 / update_role_home_query SQL-build → 單元測試。
- **impl 確認(research 未在 code 驗)**:`get_filtered_policy` 簽名(讀 role menu 列)、`remove_filtered_policy(0,[role,"","menu"])` 空字串=wildcard 在 enforcer 層(adapter 已證 skip-empty,impl 跑一次驗只刪 menu 不碰 endpoint)。
