# C-V Contract: ButtonAuth Rollout (024)

> wiring/形狀類無純函式者由本 C-V 覆蓋（curl + psql + CDP）;本波**無新單元測試**（gating=既有 hasAuth、後端=seed migration、迴路=022 已測，見 data-model §5）。
> **dev stack 前置**:套 migration 024（`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up`）+ **base-web 改後 `docker compose ... restart base-web`**（vite stale，project memory）。**rust 僅 migration、無 server code 改 → 不需 dcargo build/restart rust-api**。**dev DB = `soybean_admin_rust`**;base-web 經 front-nginx :21080 `/api`;rust-api 直連 :21081;帳號密碼 `123456`（Super/Admin/User）。**curl 用顯式 `http://127.0.0.1:21081`**（此環境 curl 不支援 `:port` 短語法）。
> **狀態污染**:測試會經 modal/updateRoleButton 改 dev casbin button 列（驗後還原或 throwaway DB）;migration 024 只 seed R_SUPER 6 列 + 2 sys_menu.buttons、不動既有 022 矩陣。**無新 crate → prod image build 非強制**。

預備:
```bash
H=http://127.0.0.1:21081; J='Content-Type: application/json'
SUPER=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
ADMIN=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
```

## 1. getAllButtons registry 含新碼（Super-only）
```bash
# 聚合全 active sys_menu.buttons:B_CODE1/2/3 + user:* + role:* + menu:* = 12 distinct codes
curl -s $H/systemManage/getAllButtons -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];c=[b['code'] for b in d];print('count=',len(c));print('role/menu 都在=', all(x in c for x in ['role:add','role:edit','role:delete','menu:add','menu:edit','menu:delete']))"
# 期 count=12;role/menu 都在=True
```

## 2. getRoleButton 預載 — R_SUPER 含 role/menu 碼（migration 初始授權）
```bash
# Super(roleId=1)應含 6 新碼(migration seed R_SUPER)
curl -s "$H/systemManage/getRoleButton?roleId=1" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;c=json.load(sys.stdin)['data'];print('super 含 role:edit/menu:add=', 'role:edit' in c and 'menu:add' in c)"  # True
# Admin(roleId=2)初始無 role/menu 碼(僅 022 的 user:edit)
curl -s "$H/systemManage/getRoleButton?roleId=2" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;c=json.load(sys.stdin)['data'];print('admin role/menu 碼數(期0)=', len([x for x in c if x.startswith('role:') or x.startswith('menu:')]))"  # 0
```

## 3. updateRoleButton round-trip — 指派 role:edit 給 Admin → casbin 同步即時（沿 022 機制）
```bash
# 給 Admin 加 role:edit(保留其既有 user:edit + B_CODE2/3,HARD REPLACE 須帶全集)
curl -s $H/systemManage/updateRoleButton -H "Authorization: Bearer $SUPER" -H "$J" -d '{"roleId":2,"codes":["B_CODE2","B_CODE3","user:edit","role:edit"]}' | python3 -c "import sys,json;print('update code:',json.load(sys.stdin)['code'])"  # 0000
# 驗:Admin getRoleButton 現含 role:edit
curl -s "$H/systemManage/getRoleButton?roleId=2" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print('admin 現含 role:edit=', 'role:edit' in json.load(sys.stdin)['data'])"  # True
# 還原 Admin 基線(去 role:edit)
curl -s $H/systemManage/updateRoleButton -H "Authorization: Bearer $SUPER" -H "$J" -d '{"roleId":2,"codes":["B_CODE2","B_CODE3","user:edit"]}' >/dev/null
curl -s "$H/systemManage/getRoleButton?roleId=2" -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print('還原後 admin role:edit=', 'role:edit' in json.load(sys.stdin)['data'])"  # False
```

## 4. psql — migration seed 落地（registry + R_SUPER 初始授權）
```bash
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -t"
# (a) sys_menu.buttons registry
$PSQL -c "SELECT route_name, buttons FROM sys_menu WHERE route_name IN ('manage_role','manage_menu') ORDER BY route_name;"
# 期:各 3 碼 role:*/menu:*
# (b) casbin R_SUPER 6 新 button 列
$PSQL -c "SELECT v0,v1 FROM casbin_rule WHERE ptype='p' AND v2='button' AND v1 IN ('role:add','role:edit','role:delete','menu:add','menu:edit','menu:delete') ORDER BY v1;"
# 期 6 列、皆 R_SUPER
# (c) 既有 022 button 矩陣不變(10 列存活)
$PSQL -c "SELECT count(*) FROM casbin_rule WHERE ptype='p' AND v2='button' AND (v1 LIKE 'user:%' OR v1 LIKE 'B_CODE%');"  # 期 10
```

## 5. CDP browser click-through（經 front-nginx :21080;核心視覺驗證、沿 022/023 isolated-context harness）
```text
① Super 登入 → /manage/role:看得到 新增/編輯/刪除（R_SUPER 初始全授）;/manage/menu 同（含可加子選單列的「加子選單」）。
② Admin 登入 → /manage/role:寫按鈕**全不顯**（初始未授 role:*);/manage/menu 同。
③ 編輯迴路端到端:Super → /manage/role 編某角色「按鈕權限」modal → registry 顯 role:*/menu:* 可勾 → 勾 role:edit 給 admin 角色提交 → Admin 重登/刷新 → /manage/role 出現「編輯」鈕（不出現新增/刪除）→ 還原。
④ reactive(§2.26):同一 session 內授權集變動後寫按鈕顯隱即時反映（無陳舊）。
```
> CDP 若 headless 不可用:curl §1-3 雙路徑（:21081 + :21080 /api）+ base-web typecheck fallback;gating 視覺唯 CDP 能證（沿 022 `tests/022-manage-button-auth/` / 023 isolated-context harness,本波建 `tests/024-button-auth-rollout/`）。

## 6. migration 024 可逆 + 守恆
```bash
# up→down→up throwaway DB(只 2 UPDATE + 6 casbin 列、不踩既有)
# ... 022 user:*/B_CODE* button policy(10)+ menu policy 存活、manage_role/manage_menu.buttons 還原 NULL ...
# 守恆
dcargo test -p server                       # 既有不破(本波無新 server code/單測)
dcargo test -p server --test entity_access_lint   # 17 不破
grep -rn "Migrator::up" rust-api/server/src/  # 0(守 007 FR-009)
# base-web typecheck
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T base-web pnpm typecheck   # exit 0
# 回歸:022 用戶頁 button gating 逐項不破(Admin 見編輯·不見刪除/新增、Super 全)、013-023 不破、既有 button 矩陣不變(FR-007)
```

## Acceptance Gate（全綠才 READY TO MERGE）
- getAllButtons registry 含 role:*/menu:*（12 codes）✅
- getRoleButton:R_SUPER 含 6 新碼、Admin 初始 0 新碼 ✅
- updateRoleButton round-trip:指派 role:edit 給 Admin → 同步 casbin + (CDP)頁面出現編輯鈕 → 還原 ✅
- psql:sys_menu.buttons registry + R_SUPER 6 button 列 + 022 矩陣不變(10)✅
- CDP:① Super 全顯 ② Admin 初始全不顯 ③ modal 勾選端到端生效 ④ reactive 即時 ✅
- migration 024 up→down→up 可逆（不踩 022 button/menu policy、還原 NULL）✅
- 守恆:server 單測 + entity_access_lint + Migrator::up=0 + base-web typecheck;回歸 022 用戶頁 gating + 既有 button 矩陣不變 ✅
- Constitution §IV 8/8 PASS（v1.4.0、無 amendment、MODAL-WIRING v1.3.0 (b) 邊界內）✅
- decoupled 已知債（visible≠clickable）文件記錄、刻意（FR-008）✅
