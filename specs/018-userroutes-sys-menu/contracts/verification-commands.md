# Verification Commands (C-V 合約): 018-userroutes-sys-menu

> dev 直連驗證(host 無 cargo → 走 dev docker rust-api 容器;§project_rustapi_build_test_env)。
> port:rust-api `:21081` / postgres `:25432`(§8.2)。JWT 由 login 取。

## §0 — 單元測試(純函式 + filter 重構)

```bash
# 在 dev rust-api 容器內跑(快取卷)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec rust-api \
  cargo test -p server route::menu
```
**預期**:
- `build_route_tree`:Model→MenuRoute 對映(id/name←route_name、title←menu_name、props←route_ext)、parent_id 巢狀、menu_order 升冪 null-last、葉 children=None、null component→"" — 全綠。
- `filter_routes_for_roles`(改吃 fixture 樹):Super 全 / Admin 部分 / User 只 home / route_exists allow+deny / unknown false / multi-role union — 6 條沿用斷言全綠。
- server 整體單測數 ≥ 112(017 基線)、不破既有。lint 17 續綠(handler/route 不碰 `entity::`)。

## §1 — migration 套用 + seed 修正(psql)

```bash
# dev stack up 自動套 m..018(010 機制)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 驗 manage_user-detail 已修正
PGPASSWORD=... psql -h 127.0.0.1 -p 25432 -U soybean -d soybean -c \
  "SELECT route_name, component, route_ext FROM sys_menu WHERE route_name='manage_user-detail';"
```
**預期**:`component = view.manage_user-detail`、`route_ext = {"props": true}`(此前 component=NULL/route_ext=NULL)。

## §2 — getUserRoutes 三角色 wire(curl,US1+US2)

```bash
# 取 token(Super/Admin/User 各一)
TOK=$(curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | jq -r '.data.token')
curl -s http://127.0.0.1:21081/route/getUserRoutes -H "Authorization: Bearer $TOK" | jq .
```
**預期(對「修 seed 後」baseline = 014 現況、逐項相同)**:
- **Super**:`data.routes` = `[home, manage{children:[manage_user, manage_role, manage_menu, manage_user-detail]}]`、`data.home="home"`。
- **Admin**:`[home, manage{children:[manage_user, manage_user-detail]}]`(無 role/menu)。
- **User**:`[home]`(manage tree-prune omit)。
- **US2 關鍵斷言**:Super/Admin 回的 `manage_user-detail` 節點帶 `"component":"view.manage_user-detail"` **且** `"props":true`。
- envelope `{data,code:"0000",msg}` 不變;token 缺/壞 → `code:"3333"`。
- **wire diff**:對 014 merge 點(`8965c8a`)的 getUserRoutes 輸出做 diff → **零差異**(含 user-detail component/props,因 014 in-code 本就有)。

## §3 — 重跑 014 CDP smoke(無回歸,無新 harness)

```bash
# 重用 014 harness(dev vite proxy)
node tests/014-dynamic-routes/<smoke script>   # Super 側欄含「系统管理」全 / User 側欄只「首页」
```
**預期**:Super 側欄全 menu、User 側欄只 home(menu deny 端到端)— 與 014 一致。

## §4 — 回歸:constant + isRouteExist 不變 + 業務唯讀(FR-006/007/008)

```bash
curl -s http://127.0.0.1:21081/route/getConstantRoutes | jq 'length'   # = 5(403/404/500/login/iframe-page)
curl -s "http://127.0.0.1:21081/route/isRouteExist?routeName=manage_role" -H "Authorization: Bearer $TOK_USER" | jq .data  # false(User deny)
# FR-008 唯讀斷言:無新增業務寫入路由 + getUserRoutes 路徑無 operator/*_by 寫入
grep -nE "\.(post|put|delete|patch)\(" rust-api/server/src/main.rs              # 應僅既有 /auth/login + /auth/refreshToken,無新增
grep -rnE "created_by|updated_by|deleted_by|operator_id" rust-api/server/src/route/ rust-api/server/src/handler/route.rs  # 0 命中
```
**預期**:getConstantRoutes 5 條不變;isRouteExist 行為不變;**main.rs 無新增 post/put/delete 業務路由、getUserRoutes 路徑 0 處 operator/`*_by` 寫入(FR-008)**。

## §5 — prod build(非強制 sanity;無新 crate)

> [CLAUDE.md §3 紀律] 新 workspace crate ⇒ 強制 prod image build。**本 feature 無新 crate**(只改 server + 加一條 migration 到既有 migration crate)→ **不強制**。可選 sanity:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # optional
```

---

## Acceptance Gate(全綠才 merge)

- [ ] §0 單元測試全綠、server 測數不退、lint 17
- [ ] §1 psql 驗 seed 修正
- [ ] §2 curl 三角色 wire = baseline + user-detail 帶 component/props + 對 014 輸出零 diff
- [ ] §3 014 CDP smoke 重跑無回歸
- [ ] §4 constant/isRouteExist 不變 + FR-008 業務唯讀(無新寫入路由 / 無 operator 寫入)
- [ ] `business_routes()` 已移除、無 dead code 殘留
