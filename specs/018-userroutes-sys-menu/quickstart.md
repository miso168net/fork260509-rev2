# Quickstart: getUserRoutes 改讀 sys_menu

**Feature**: 018-userroutes-sys-menu

## 這個 feature 做什麼

`GET /route/getUserRoutes` 的業務路由樹,從讀「寫死的 in-code `business_routes()`」改成讀「`sys_menu` 表」,使選單有單一真相源(拆 D-D)。順手修 017 seed 漏的 `manage_user-detail` component+props(回 base-web 真相)。角色 Casbin 過濾與 wire 形狀**不變**。

## 改哪裡(3 檔 + 1 migration)

| 檔 | 動作 |
|---|---|
| `rust-api/server/src/route/menu.rs` | + `build_route_tree(Vec<Model>)->Vec<MenuRoute>`(純);`filter_routes_for_roles` 改吃 `routes` 參數;**移除 `business_routes()`**;6 純測改 fixture 樹 |
| `rust-api/server/src/handler/route.rs` | `get_user_routes`:`sys_menu::all_active` → `build_route_tree` → `filter_routes_for_roles(tree, roles, enforcer)` |
| `rust-api/server/src/model/facade/sys_menu.rs` | 不改(重用 `all_active`) |
| `rust-api/migration/src/m20260529_000018_fix_user_detail_seed.rs` | UPDATE manage_user-detail component+route_ext props;註冊 `lib.rs` |

## 怎麼驗(摘要,詳見 contracts/verification-commands.md)

```bash
# 1. 單測
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec rust-api cargo test -p server route::menu
# 2. 起 stack 自動套 migration + 驗 seed
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
psql -h 127.0.0.1 -p 25432 -U soybean -c "SELECT component, route_ext FROM sys_menu WHERE route_name='manage_user-detail';"
# 3. curl getUserRoutes(Super/Admin/User)對 014 baseline 零 diff + user-detail 帶 component/props
# 4. 重跑 014 CDP smoke(Super 側欄全 / User 只首頁)
```

## 完成定義

getUserRoutes 三角色輸出 = 014 baseline 逐項相同(零回歸)、`manage_user-detail` 帶 component+props、`business_routes()` 移除、constant/isRouteExist 不變、單測全綠 + lint 17。
