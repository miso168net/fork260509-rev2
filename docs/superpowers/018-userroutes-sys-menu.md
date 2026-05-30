# 018-userroutes-sys-menu — Phase 0 brainstorm（spec-design）

**Feature**: `018-userroutes-sys-menu`
**Created**: 2026-05-31
**前序**: [017-manage-menu-list](../../specs/017-manage-menu-list/spec.md)（建 `sys_menu` 表）+ [014-dynamic-routes](../../specs/014-dynamic-routes/spec.md)（getUserRoutes in-code 來源）
**性質**: Phase 4 —— `getUserRoutes` 改讀 `sys_menu`，拆 [CHECKLIST §2.20 D-D 雙源並存](../INTEGRATION-CHECKLIST.md) + 順手修 017 seed fidelity bug。

> 本檔為 Phase 0 brainstorm 凍結的 spec-design，交棒 `/speckit-specify`。所有 D 決策已與 user 逐項拍板（2026-05-31）。

---

## Summary

把 `getUserRoutes` 的業務路由樹來源，從 014 寫死的 in-code `business_routes()` **改讀 017 建的 `sys_menu` 表**，使 `sys_menu` 成為業務路由的**單一真相源**（拆 D-D 雙源並存）。Casbin enforce 過濾與 wire 形狀**不變**。

過程 grep base-web 權威（`routes.ts:291-297`）發現 **017 的 seed 有 fidelity bug**：`manage_user-detail` 的 `component` 被 seed 成 `NULL`、`props:true` 整個漏掉。雙源並存時這 bug 被遮住（getUserRoutes 仍讀正確的 in-code 樹）；改讀 sys_menu 就會浮出來 → 本 feature **順手修正 seed 回 base-web 真相**。

**唯讀 + 一條 seed 修正 migration**，不碰寫入/operator（readiness 與「審計欄 retrofit 擱置」決定一致）。`getConstantRoutes` + `isRouteExist` **完全不動**。

---

## 現況事實基準（grep ground truth，2026-05-31）

- **getUserRoutes 現況**：`handler/route.rs::get_user_routes` → `route::menu::filter_routes_for_roles(roles, enforcer)`，**內部呼 `business_routes()`**（`route/menu.rs:171-283`，6 節點 in-code：`home` + `manage`(父) + 4 children `manage_user/role/menu/user-detail`）。
- **sys_menu 現況**：017 建表 + seed 6 節點對齊 014（migration `m..016`）。entity 21 欄（含 `route_ext`/`buttons` 兩 JSONB）。facade `all_active`（`order by menu_order asc`、soft-delete 過濾）已存在。
- **isRouteExist 現況**：`route_exists_for_roles` → 只 `menu_visible`（Casbin enforce）、**不碰 `business_routes()`** → 本 feature 不影響。
- **getConstantRoutes 現況**：`constant_routes()` 5 條 in-code（`403`/`404`/`500`/`login`/`iframe-page`、全 `hideInMenu`+`constant`、公開無 enforce）、**不在 sys_menu**（017 只 seed 6 業務節點）→ 不動。
- **base-web 權威**（`base-web/src/router/elegant/routes.ts`）：`manage_user-detail` = `component:'view.manage_user-detail'` + `props:true`（`:291-297`、`:294`）。
- **seed 分歧（待修）**：`sys_menu` 的 `manage_user-detail` `component=NULL` + 無 `props`（`m..016:141-144`）≠ base-web ≠ 014。其餘 5 節點 seed 對齊 014（= base-web）。

---

## 凍結設計決策（D1–D10）

### D1 — scope：只動 getUserRoutes
只動 `getUserRoutes`。`getConstantRoutes`（constant 不在 sys_menu）+ `isRouteExist`（只查 enforce、不碰樹）**不動**。唯讀 + 一條 seed 修正 migration。

### D2 — 機制：來源換手，filter 不變
```
get_user_routes:
  bearer→jwt::verify→roles_for_user(DB 權威)         ← 不變
  models = sys_menu::all_active(db)                    ← 新（取代 business_routes()）
  tree   = build_route_tree(models)                    ← 新純函式（Model→MenuRoute + parent_id 巢狀 + menu_order 升冪 null-last）
  routes = filter_routes_for_roles(tree, roles, enforcer)  ← 重構：吃「樹」參數
  Res::ok(UserRoute{ routes, home:"home" })            ← 不變
```

### D3 — Model → MenuRoute 對映
見下方對映表。要點：**`MenuRoute.id` = `route_name` 字串**（§I.3，非 `sys_menu.id` i64）；`meta.title` ← `menu_name`（017 已 seed = route 名、對齊 014）；`props` ← `route_ext->>'props'`；`menu_type`/`icon_type`/`status`/`buttons` 是 admin 表的事、route 對映**不取**。

### D4 — base-web 保真：修 017 seed bug
新 migration（`m..018`）：`UPDATE sys_menu SET component='view.manage_user-detail', route_ext='{"props":true}' WHERE route_name='manage_user-detail'`。forward-only（不能改已套用的 `m..016`）。down() 還原為 `component=NULL, route_ext=NULL`。

### D5 — props 存 route_ext JSONB
`manage_user-detail.route_ext = {"props": true}`（route_ext 本就是 sys_menu 的「額外 route 欄位袋」、017 已用來裝 href/query/multiTab/fixedIndexInTab）。**不加 `props` 專欄**（免 schema churn、免動 MenuItem/MenuTreeItem DTO）。

### D6 — filter_routes_for_roles 重構為純函式
簽名 `filter_routes_for_roles(routes, roles, enforcer)`（吃外部餵的樹），不再內部呼 `business_routes()`。tree-prune + per-node `menu_visible` enforce 邏輯**不變**。`route/menu.rs` 那 6 個純測改餵 **fixture 樹**（同 6 節點、當測試 const）。

### D7 — 拆 dead code
`business_routes()` 變孤兒 → **移除**（單一真相）。`constant_routes()` **保留**（getConstantRoutes 還用）。

### D8 — 測試
- **純測**：`build_route_tree`（對映 + 巢狀 + menu_order null-last + props 從 route_ext 抽 + Option<component> 處理）。
- **重構純測**：`filter_routes_for_roles` 改吃 fixture 樹（6 條既有測沿用斷言）。
- **acceptance**：getUserRoutes wire 對齊（curl 三角色路由樹 + **重跑 014 CDP smoke**，無新 harness）+ 斷言 `manage_user-detail` 現帶 `component:'view.manage_user-detail'` + `props:true`（bug 修掉的活體證明）。
- wiring 類 feature → handler 由 acceptance 覆蓋、純函式單測，符合 [CLAUDE.md §3](../../CLAUDE.md)。

### D9 — Constitution 預檢
§I.1 對齊 base-web ✅ / §I.2 enforce 不變 ✅ / §I.3 `MenuRoute.id`=string ✅ / **§I.6 #8 不觸發**（無建新業務主表、只 UPDATE seed + 讀）/ 無新 crate/dep / 不動 base-web / 無外層 deploy 改動。

### D10 — 收尾
解掉 [CHECKLIST §2.20](../INTEGRATION-CHECKLIST.md) 的 **D-D 雙源並存** follow-up（getUserRoutes 與 sys_menu 統一單一真相源）。

---

## Model → MenuRoute 對映表

| `MenuRoute` 欄 | ← `sys_menu` | 備註 |
|---|---|---|
| `id` / `name` | `route_name` | **id = route 名字串**（§I.3、非 `sys_menu.id`） |
| `path` | `route_path` | |
| `component` | `component`（`Option<String>`→`String`）| 6 節點修 seed 後全非 null；映射對 null 取 `""`（現 scope 不觸發） |
| `meta.title` | `menu_name` | 017 seed = route 名、對齊 014 |
| `meta.i18nKey` | `i18n_key` | |
| `meta.icon` | `icon` | |
| `meta.order` | `menu_order` | |
| `meta.hideInMenu` | `hide_in_menu` | |
| `meta.keepAlive` | `keep_alive` | |
| `meta.constant` | `constant` | 業務節點皆 null → None |
| `meta.activeMenu` | `active_menu` | |
| `props` | `route_ext->>'props'` | 本 feature seed 補（D4/D5） |
| `children` | parent_id 巢狀 | menu_order 升冪 null-last |
| （不取）| `menu_type`/`icon_type`/`status`/`buttons` | admin 表用、route 不需 |

---

## 元件 / 落地清單

| 檔 | 動作 |
|---|---|
| `server/src/route/menu.rs` | + `build_route_tree(models)->Vec<MenuRoute>`（純）；`filter_routes_for_roles` 簽名改吃 tree；**移除 `business_routes()`**；6 純測改 fixture 樹 |
| `server/src/handler/route.rs` | `get_user_routes` 改：`all_active` → `build_route_tree` → `filter_routes_for_roles(tree,...)` |
| `server/src/model/facade/sys_menu.rs` | **無需改**（重用既有 `all_active`） |
| `migration/src/m20260529_000018_*.rs` | seed 修正 UPDATE（manage_user-detail component+props）+ 註冊進 `lib.rs` |

---

## Scope

**In**：`getUserRoutes` 改讀 sys_menu；`build_route_tree` 純函式；`filter_routes_for_roles` 純化重構；移除 `business_routes()`；seed 修正 migration；解 D-D。

**Out**：menu CRUD / role-menu 授權寫入（仍 Phase 4 後續）；`getConstantRoutes` 改造（constant 永 in-code）；`isRouteExist` 改造（enforce-only、本就不碰樹）；`route_ext` 內 `props` 以外欄位的 route 化；審計欄/operator（Phase 4 A 已擱置）。

---

## Deviation / 風險（implement 時若觸發記 Deviation Log）

- **build_route_tree vs 017 build_menu_tree**：parent_id 巢狀邏輯幾乎一樣、只差每節點對映（MenuRoute vs MenuItem）。**刻意各寫一份小的、不抽共用泛型**（輸出型差夠多、過早抽象風險）。
- **Option<component> 處理**：6 節點修 seed 後全非 null；`build_route_tree` 對 null component 取 `""`。一般 menu 若有 null-component directory 需另議（現 scope 6 節點不觸發）。
- **Phase 0 research 待補**：spec 階段須 grep base-web `routes.ts` **全 6 節點**逐欄再確認（本 brainstorm 已驗 `manage_user-detail`；其餘 5 信 014 註解「component grepped from base-web」= base-web，但 spec 階段全 grep 對齊 3 端）。
- **wire 對齊基準**：getUserRoutes 輸出對「修 seed 後」應 = 014 現況（含 `manage_user-detail` component+props 復原）。若 014 現況本身與 base-web 有別（已驗無），以 base-web 為準（§I.1/§I.3）。
