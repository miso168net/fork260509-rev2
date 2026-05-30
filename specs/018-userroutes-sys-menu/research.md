# Research: getUserRoutes 改讀 sys_menu(Phase 0)

**Feature**: 018-userroutes-sys-menu | **Date**: 2026-05-31

> §3 Phase 0 紀律:grep 真實 code、不信 brainstorm 命名假設。本檔記 3 端 wire 對齊 grep 結果 + 設計決策。

---

## R1 — base-web 6 業務節點逐欄 ground truth(權威源,§I.1/§I.3)

grep `base-web/src/router/elegant/routes.ts`(home `:206`、manage `:242` + 4 children)。權威欄位:

| node | path | component | props | meta(title=route 名;另列非預設) |
|---|---|---|---|---|
| `home` | `/home` | `layout.base$view.home` | — | i18nKey route.home、icon mdi:monitor-dashboard、order 1 |
| `manage` | `/manage` | `layout.base` | — | i18nKey route.manage、icon carbon:cloud-service-management、order 9 |
| `manage_user` | `/manage/user` | `view.manage_user` | — | icon ic:round-manage-accounts、order 1 |
| `manage_role` | `/manage/role` | `view.manage_role` | — | icon carbon:user-role、order 2 |
| `manage_menu` | `/manage/menu` | `view.manage_menu` | — | icon material-symbols:route、order 3、keepAlive true |
| `manage_user-detail` | `/manage/user-detail/:id` | `view.manage_user-detail` | **true** | hideInMenu true、activeMenu manage_user(**無 icon/order**) |

**Decision**: 以上為 getUserRoutes 須重現的 wire 真相。
**Rationale**: §I.1 base-web 為權威。
**Note**: routes.ts 的 `meta.roles`(static-mode hint)**dynamic mode 不送**(014 既定:server 已過濾、前端不再 filter);可見性由 Casbin menu-visibility policy 治理、非 static meta.roles。本 feature 不碰。

## R2 — 3 端對齊:base-web ↔ 014 in-code ↔ sys_menu seed

| 端 | 來源 | 結論 |
|---|---|---|
| (a) rust 輸出 DTO | `route/menu.rs` `MenuRoute{id,name,path,component:String,meta,children?,props?}` + `RouteMeta{title,i18nKey,icon?,order?,hideInMenu?,keepAlive?,constant?,activeMenu?}`(serde camelCase、省 meta.roles) | 014 既有、對齊 base-web |
| (b) base-web service+typing | `service/api/route.ts` `fetchGetUserRoutes()→Api.Route.UserRoute`;`typings/api/route.d.ts` `UserRoute{routes:MenuRoute[],home}`、`MenuRoute extends ElegantConstRoute`;`typings/router.d.ts RouteMeta` 全 optional/nullable | 對齊 (a) |
| (c) 014 in-code `business_routes()` | 6 節點逐欄 = base-web(R1) | ✅ 全對齊 |
| sys_menu seed(m..016) | 5 節點對齊;**`manage_user-detail` component=NULL + 無 props** | ⚠️ **2 處缺口** |

**Decision**:sys_menu seed 的 `manage_user-detail` 須補 `component='view.manage_user-detail'` + `props:true`(回 base-web 真相);其餘 5 節點 seed 已對齊、不動。
**Rationale**:雙源並存時 getUserRoutes 讀 014 in-code(正確)遮住 seed 缺口;改讀 sys_menu 即暴露 → 必修。
**Alternatives rejected**:(i) getUserRoutes 對 user-detail 特例硬編 component/props → 破單一真相、否定本 feature 目的;(ii) 不修、接受 wire 退化 → 違 §I.1、user-detail 頁拿不到 id。

## R3 — sys_menu facade 真實返回型

grep `model/facade/sys_menu.rs`:`all_active(db)->Result<Vec<Model>,DbErr>`(`find_active().order_by_asc(MenuOrder).all(db)`、soft-delete 過濾、menu_order 升冪)。entity `sys_menu::Model` 21 欄(`route_name/parent_id/menu_type/menu_name/route_path/component:Option<String>/icon:Option/icon_type:Option/i18n_key:Option/menu_order:Option<i32>/keep_alive:Option<bool>/constant:Option<bool>/hide_in_menu:Option<bool>/active_menu:Option<String>/route_ext:Option<Json>/buttons:Option<Json>/status/...`)。

**Decision**:重用既有 `all_active`,**facade 不需改**。`build_route_tree(Vec<Model>)->Vec<MenuRoute>` 新純函式做 Model→MenuRoute 對映 + parent_id 巢狀。
**Rationale**:`all_active` 已是 soft-delete-safe 唯一管道(009 lint)、已 menu_order 排序。

## R4 — `props` 存法(route_ext JSONB)

017 `route_ext` 已是「額外 route 欄位袋」(getMenuList 的 `flatten_route_ext` 攤 href/query/multiTab/fixedIndexInTab)。`props` 非扁平欄、非那 4 個 extra。

**Decision**:`props` 存 `route_ext` JSONB(`{"props": true}`);build_route_tree 從 `route_ext->>'props'` 抽 bool。**不加 props 專欄**。
**Rationale**:免 schema churn、免動 017 MenuItem/MenuTreeItem DTO;route_ext 語意相符。
**Alternatives rejected**:加 `sys_menu.props` 欄 → alter table + 動 017 DTO + 多一次 schema churn(menu CRUD 未落地、YAGNI)。

## R5 — filter_routes_for_roles 純函式化

現 `filter_routes_for_roles(roles, enforcer)` 內部呼 `business_routes()`。改讀 DB 後 source 來自 handler。

**Decision**:簽名改 `filter_routes_for_roles(routes: Vec<MenuRoute>, roles, enforcer)`(吃外部樹);tree-prune + `menu_visible` enforce 邏輯**零變更**。6 個既有純測改餵 fixture 樹(同 6 節點 const)。
**Rationale**:保持 filter 純函式可測(餵 fixture)、與 DB 解耦;`build_route_tree` 另測。`business_routes()` 移除(單一真相)。

## R6 — Casbin menu-visibility(可見性不變)

014 seed `casbin_rule` `v2='menu'` 9 rows(`p,<role>,<route_name>,menu`):Super 5(home/manage_user/manage_role/manage_menu/manage_user-detail)、Admin 3(home/manage_user/manage_user-detail)、User 1(home);`manage` 父不 seed、靠 tree-prune。

**Decision**:**完全不動**。`menu_visible((role,route_name,"menu"))` 用 013 enforcer、route_name 為對齊鍵(sys_menu.route_name = casbin v2 鍵 = MenuRoute.name)。
**Rationale**:可見性續住 Casbin(§I.2);本 feature 只換「樹來源」、不換「過濾引擎」。

## R7 — CDP smoke:重用 014、不新建

014 已有 dynamic-mode CDP harness(`tests/014-dynamic-routes/`):Super 側欄全 / User 只首頁。本 feature wire 對「修 seed 後」應 = 014 現況 → **重跑 014 CDP** 即驗無回歸。

**Decision**:acceptance = curl 三角色 getUserRoutes(wire diff vs 014 baseline)+ psql 驗 seed 修正 + 重跑 014 CDP smoke。**無新 CDP harness**。
**CDP defer 風險**:無(重用既有 harness、非 defer)。

## R8 — migration 邊界(無新 crate)

seed 修正 = 新 migration `m20260529_000018`(UPDATE manage_user-detail)+ 註冊 `migration/lib.rs`。**無新 workspace crate / 無新 dep**。

**Decision**:依 [CLAUDE.md §3 verification 紀律],**新 crate ⇒ prod image build** 規則**不觸發**(本 feature 不加 crate)。dev stack `up` 自動套 m..018(010 機制)即驗 migration;prod build 非強制(可選 sanity)。
**Rationale**:只改既有 server crate + 加一條 migration 到既有 migration crate;Dockerfile 逐 crate COPY 無新增缺口。

---

## 未解 NEEDS CLARIFICATION

**無**。spec 0 個、Phase 0 grep 全對齊、設計決策皆有真實 code 佐證。
