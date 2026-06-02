# Contracts — Verification Commands (C-V): 019 manage-menu-list

> wiring/形狀類無純函式測試者由本 C-V 覆蓋(curl + psql + CDP),tasks/plan 明示「無單元測試」之處由此驗。dev stack 前置:`dcargo build -p server && docker compose ... restart rust-api`(WSL2 inotify 不可靠,見 project memory);套 migration 018/019 到 dev DB(`docker compose run --rm migrate up`)。base-web 經 **front-nginx `:21080`** 真實 `/api`;rust-api 直連 `:21081`。

## 0. 端點與授權
- **getUserRoutes**(US1,遷 sys_menu、wire 逐字不變):`GET /route/getUserRoutes`(JWT-verified、handler 內 Casbin 過濾、**不掛 enforce_mw**,沿 014)。
- **3 讀端**(US2,Super-only,casbin seed 019 R_SUPER 3 行):`GET /systemManage/getMenuList/v2`、`GET /systemManage/getAllPages`、`GET /systemManage/getMenuTree`(掛 `enforce_mw`)。回 `Res<T>`(HTTP 200,業務碼在 envelope `code`):成功 `0000` / 權限不足 `5003` / 未認證 `3333`。

## 1. US1 — getUserRoutes 逐字回歸(★ 回歸鐵律 D5/SC-001)

```bash
# ★ 遷移前:先存 014 in-code 版三角色輸出(基準)。遷移後比對逐字一致。
# Super token(沿 000-bootstrap;或 curl /auth/login Super/123456)
# (a) 三角色 menu ladder 與遷移前逐字一致
for R in Super Admin User; do
  T=$(login $R)
  curl -s :21081/route/getUserRoutes -H "Authorization: Bearer $T" | python3 -m json.tool > after_$R.json
  # diff after_$R.json 與遷移前基準(before_$R.json)→ 必須 0 差異
done
# 預期:Super=[home,manage(manage_user,manage_role,manage_menu,manage_user-detail)] / Admin=[home,manage(manage_user,manage_user-detail)] / User=[home]
# 逐欄(id/name/path/component/meta.{title,i18nKey,icon,order,hideInMenu,keepAlive,activeMenu}/children/props)= 014 原值
# (b) home 欄 = "home";meta.roles 不出現;manage 父無自身 enforce(子全不可見才消失)
# (c) getConstantRoutes 不變
curl -s :21081/route/getConstantRoutes | python3 -m json.tool  # 403/404/500/login/iframe-page 與遷移前逐字一致
# (d) 無有效角色 user(理論)→ routes 不含需授權 menu、不崩潰
```

psql:sys_menu seed 真值
```bash
psql ... -c "SELECT route_name,parent_id,menu_type,order,component FROM sys_menu WHERE deleted_at IS NULL ORDER BY parent_id NULLS FIRST, \"order\";"
# 6 筆:home/manage(top)+ manage_user/role/menu/user-detail(parent=manage id);欄值對齊 data-model §2
```

## 2. US2 — 三讀端形狀 + Super-only 授權

```bash
SUPER=$(login Super); ADMIN=$(login Admin)
# (a) getMenuList/v2:Super → 0000 + flat 分頁 {current,size,total,records[]},每筆 id=string、menuType/iconType/status 字串列舉、buttons(jsonb)、createTime 真值
curl -s ':21081/systemManage/getMenuList/v2' -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin);print('code',d['code']);r=d['data']['records'];print('total',d['data']['total'],'sample',[(m['id'],m['routeName'],m['menuType']) for m in r])"
# (b) getMenuTree:Super → 0000 + 樹 [{id(number),label,pId(number),children?}]
curl -s :21081/systemManage/getMenuTree -H "Authorization: Bearer $SUPER" | python3 -m json.tool  # id/pId number、manage 含 children
# (c) getAllPages:Super → 0000 + string[]
curl -s :21081/systemManage/getAllPages -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['code'],d['data'])"
# (d) ★ Super-only:Admin → 5003 / 無 token → 3333(三端皆是)
curl -s ':21081/systemManage/getMenuList/v2' -H "Authorization: Bearer $ADMIN" | grep -o '"code":"[0-9]*"'   # 5003
curl -s ':21081/systemManage/getMenuTree' -H "Authorization: Bearer $ADMIN" | grep -o '"code":"[0-9]*"'      # 5003
curl -s ':21081/systemManage/getAllPages'                                    | grep -o '"code":"[0-9]*"'      # 3333
```

## 3. 回歸(SC-008)
- **013 enforce**:Super/Admin getUserList allow、User 5003、none 3333(B/D5 後不破)。
- **014 menu(★ 本波核心)**:getUserRoutes 三角色 ladder 逐字 == 遷移前(§1);getConstantRoutes 不變;isRouteExist(enforce-based、未動)三角色行為不變。
- **016/017/018**:getUserList/getRoleList/getAllRoles 不破;user/role 寫端 US1-3 不破;status enforce 即時(018)不破。
- **守恆**:server 單測全綠(新增:assemble_menu_tree 純函式 / sys_menu find_active SQL 含 deleted_at IS NULL / enum 映射 / MenuItem·MenuTreeNode 序列化〔id 型、camelCase、enum 字串、jsonb〕)+ entity_access_lint(handler 零 `entity::`)+ xdb + `Migrator::up` grep 0。

## 4. migration 可逆 + prod image build
```bash
# migration up→down→up 對 throwaway DB 親驗可逆(create_sys_menu 018 + seed_menu_read_policy 019)
#   up → sys_menu 11+ 欄表 + 6 seed rows + partial unique index + 3 read policy rows
#   down -n2 → drop(table + policy 3 行,不踩 010 menu policy / 013/015/017)
#   up → 還原
# prod target image build(sys_menu 為既有 entity crate 模組、非新 crate 故非 §3 強制,沿 016/017/018 de-risk 列入)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # 綠
```

## 5. CDP 端到端(front-nginx :21080)
登入 Super → /manage/menu:**選單管理頁顯真實 sys_menu**(列表分頁顯 6 menu、菜單樹/父選擇顯父子、頁面選項下拉有值)+ 側欄導覽 menu 階梯(getUserRoutes)與遷移前一致(Super 全/Admin 中/User 只 home)→ null 欄不 crash。harness 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A。

> **CDP defer 自覺(沿 016/017/018)**:若 CDP 端到端較難構造,至少 **curl 直送證 getUserRoutes 逐字 + 三讀端形狀/授權**(curl≠modal、但讀端 + getUserRoutes 透明、風險低);難構造則登記 follow-up(同 §2.8 prod-stack CDP)。getUserRoutes 遷移對 base-web 透明(wire 不變)、base-web menu fns 既存 upstream → 主要驗 server 端逐字 + 形狀。

## 6. 守恆細節(無單元測試的 wiring → 本 C-V 覆蓋,plan/tasks 明示)
- assemble_menu_tree(純函式)、find_active SQL、enum 映射、DTO 序列化 → **單元測試**。
- getUserRoutes 遷移逐字、3 讀端形狀/授權、CDP、回歸 → **本 C-V**(curl/psql/CDP)。
