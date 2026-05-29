# 014-dynamic-routes — Phase 0 brainstorm（spec-design）

> **feature**：dynamic mode 路由 — `/route/getConstantRoutes` + `/route/getUserRoutes` + `/route/isRouteExist`（Phase 3 #2）。
> **狀態**：brainstorm 凍結（2026-05-30 user 親決 D1-D8）。本檔為 `/speckit-specify` 的輸入；忠實落地、非自由設計。
> **⚠️ 2026-05-30 re-scope（Constitution §I.2 對齊）**：`/speckit-plan` Constitution Check 抓到原 D1「程式內 `role→route` map 過濾」**違反 §I.2**（業務 menu 必走 Casbin enforce 過濾）。user 拍板改:**menu 可見性 seed 成 Casbin policy（`p,role,route_name,menu`）+ getUserRoutes/isRouteExist 用 013 enforcer 過濾**;route 定義仍程式內寫死、D2/D3 可見範圍不變。下方 D1/D4/§1/§3/§6/§7 已更新反映此。
> **對齊**：DESIGN §10 Phase 3 #2（dynamic mode 路由）；鐵紀律②「menu 權限」的方向落地（**登入後 menu 由 rev2 後端依角色供應**）。承接 013（login/getUserInfo/JWT 已通，觸發鏈前三段就緒）。

---

## 1. 目標與範圍

把 base-web 翻到 **dynamic auth route mode**，由 rev2 rust-api 供應 menu/route，**依角色過濾**，證明「後端控 menu」端到端跑通（最小機制證明、對齊 013 哲學）。

- base-web wire 權威（鐵紀律①）：3 endpoint 形狀對齊 `base-web/src/typings/api/route.d.ts` + `service/api/route.ts` + mock（[MOCK §4.13](../MOCK-COVERAGE-AUDIT.md)）。
- dynamic mode 觸發鏈：`getConstantRoutes`（每次 SPA reload）→ `login` → `getUserInfo` → `getUserRoutes`（登入後）；前三段 013 已通，本 feature 補 route 三 endpoint + 翻 `.env` switch。
- route 定義 **程式內寫死**(D2)；menu 可見性過濾 **走 Casbin enforce**(§I.2 核心原則):「誰能看哪條 menu」seed 成 casbin policy(`p,role,route_name,menu`)、getUserRoutes/isRouteExist 用 **013 已建的 enforcer** 過濾(**非** sys_menu DB 表、**非** 程式內寫死 map)。

## 2. 凍結決策（D1-D8，2026-05-30 user 親決）

- **D1 範圍 = 最小 wire 證明 + menu 走 Casbin enforce**（user 選 A;2026-05-30 re-scope 對齊 §I.2）：實作 3 個 `/route/*` endpoint + 翻 base-web dynamic mode;route 定義**程式內寫死**,但 menu 可見性**走 Casbin enforce 過濾**(§I.2):seed menu-visibility policy 進 casbin_rule(`p,role,route_name,menu`、經 010 自動套)+ getUserRoutes/isRouteExist 用 013 enforcer 過濾。**不**建 `sys_menu` 表、**不**做 menu CRUD（Phase 4）、**不**做受管 policy 層〔soft-delete/CRUD〕(#6)、**不**做 redis pub-sub（#3）、**不**做全路由 endpoint-access enforce 矩陣(#4、本 feature 只做 menu-visibility policy)。
- **D2 route 涵蓋 = 真實業務 menu**（user 選 A2）：鏡像 base-web 真實「系统管理」整棵（`manage`: user/role/menu/user-detail）+ `home`；**不**含 8 個 demo menu（function/plugin/alova/document 等）。constant routes = `login` + `403`/`404`/`500` **+ `iframe-page`**（共 **5 條**;**2026-05-30 analyze C1 refine**:plan 階段 research grep 確認 base-web `meta.constant:true` 集合含 `iframe-page`,原寫「4 條」補為 5、以免前端缺 route）。
- **D3 role→route map**（user 確認此三階梯）：

  | route（menu） | Super | Admin | User |
  |---|---|---|---|
  | `home` 首页 | ✓ | ✓ | ✓ |
  | `manage`（系统管理 parent） | ✓ | ✓ | ✗ |
  | └ `manage_user` 用户管理 | ✓ | ✓ | — |
  | └ `manage_role` 角色管理 | ✓ | ✗ | — |
  | └ `manage_menu` 菜单管理 | ✓ | ✗ | — |
  | └ `manage_user-detail`（hideInMenu、隨 user 列表點入） | ✓ | ✓ | — |

  效果:**User 側邊欄只有「首页」**(最清楚 deny)、**Admin = 首页 + 系统管理〔只用户管理〕**、**Super 全有**。**父層 `manage` 若該角色無任何 child → 整個 omit**(User 看不到「系统管理」群組)。
- **D4 getUserRoutes 角色來源 = 即時查 DB**(`roles_for_user`,與 013 getUserInfo 一致、權威源;非只讀 JWT claims)→ 對每條候選 route 以該 user 的 roles 跑 `enforce((role, route_name, "menu"))`,任一 allow 即收(父層無可見 child 則 omit)。撤權即時性取捨(claims vs DB)在完整 enforce rollout 時拍板([REVIEW-006-013 §4 #6](../REVIEW-006-013.md));本 feature 查 DB。
- **D5 endpoint 認證**:`getConstantRoutes` **公開**(無需 JWT、SPA reload 前就觸發);`getUserRoutes` / `isRouteExist` 需有效 access JWT(同 getUserInfo,token 無效/過期/缺 → `3333`)。**3 endpoint 皆不掛 enforce middleware**(getUserRoutes 人人可呼叫拿「自己的」menu、過濾在 handler 內以 role map 做)。
- **D6 isRouteExist = role-filtered**(user 明確確認):`isRouteExist(routeName)` 回「該名是否存在於**該使用者可見的** route 集合」;不可見 → `false`(讓前端導向擋掉越權路由),非單純「名稱存在與否」。
- **D7 home = `"home"`**(對齊 `.env VITE_ROUTE_HOME=home`);**`MenuRoute.id` = string**(指派穩定 id、對齊 typings `id: string`)。
- **D8 acceptance 含 CDP browser smoke**:base-web `.env` 翻 `VITE_AUTH_ROUTE_MODE=dynamic`(BASE-WEB-ADAPT 軌道、兩段式 commit)→ 登入 Super vs User → **側邊欄 menu 依角色不同**(User 只「首页」、Super 完整「系统管理」)。⚠️ 翻 dynamic 前 3 endpoint 都要能動(getConstantRoutes 每次 reload 觸發、沒做好 base-web reload 會壞)。

## 3. 元件分解（單一職責、可獨立測）

| 元件 | 職責 | 依賴 |
|---|---|---|
| `server/src/route/menu.rs`（新） | **程式內 route 定義**(constant + business 樹,精確對齊 base-web shape)+ **enforce-based filter**:`filter_routes_for_roles(roles, &enforcer) -> Vec<MenuRoute>`(對每條 business route 跑 `enforce((role,route_name,"menu"))`、任一 allow 即收、omit 空父層)+ `route_exists_for_roles(name, roles, &enforcer) -> bool` | route DTO / 013 `Enforcer`(`casbin`) |
| `server/src/handler/route.rs`(新) | `get_constant_routes`(公開、回 constant 樹不過濾)/ `get_user_routes`(JWT→DB roles→enforce filter→`{routes,home}`)/ `is_route_exist`(JWT→DB roles→enforce 查名) | menu.rs / jwt(013)/ bearer(013)/ facade roles_for_user(013)/ `state.enforcer`(013)/ envelope |
| route DTO | `MenuRoute` / `UserRoute`(serde camelCase、對齊 `Api.Route.*`) | serde |
| **menu-visibility policy seed migration**(新) | seed `p,role,route_name,menu` 進 casbin_rule(經 010 自動套):home→全角色;manage_user/user-detail→R_SUPER+R_ADMIN;manage_role/manage_menu→R_SUPER(對齊 D3) | migration / casbin_rule(012 stock) |
| `main.rs` | 接 3 route(getConstantRoutes 公開 / getUserRoutes·isRouteExist JWT;**皆不掛 enforce *middleware*** — 過濾在 handler 內以 enforcer 做、非路由攔截) | handler/route |

## 4. wire DTO（對齊 base-web typings）

```
MenuRoute { id: String, name: String, path: String, component: String,
            meta: RouteMeta, children: Option<Vec<MenuRoute>>, props: Option<...> }   // serde camelCase
RouteMeta { title, i18nKey, icon, order?, roles?, hideInMenu?, activeMenu?, ... }      // 對齊 base-web meta
UserRoute { routes: Vec<MenuRoute>, home: String }                                    // home = "home"
```
- 全 wrap 008 `Res<T>`：`getConstantRoutes` → `Res<Vec<MenuRoute>>`、`getUserRoutes` → `Res<UserRoute>`、`isRouteExist` → `Res<bool>`。
- **route 物件 component key 須精確對齊 base-web elegant-router**（`view.home`/`view.manage_user`/`view.manage_role`/`view.manage_menu`/`view.manage_user-detail`/`layout.base`/`view.login`/`view.403`…）+ meta(i18nKey/icon/order)。

## 5. 測試 / acceptance（CLAUDE.md §3 TDD）

**enforce 決策 + tree-prune test-first（red→green;沿 013 enforce 決策測試模式,用 `MemoryAdapter` seed 同 D3 的 menu policy）**：
- `filter_routes_for_roles`(enforcer 注入)：Super→全集 / Admin→home+manage(user,user-detail) / User→只 home（依 D3 policy）；**父層無可見 child → omit**；多 role 取聯集。
- `route_exists_for_roles`：enforce-filtered true/false（User 對 `manage_role` → false、對 `home` → true）。

**wiring/形狀（無新純邏輯）→ acceptance 覆蓋**：3 handler + router。

**活體 acceptance（C-V、對 dev stack）**：
- `getConstantRoutes`（公開、無 Bearer）→ login/403/404/500 shape。
- `getUserRoutes` Super/Admin/User Bearer → 三角色不同 routes + `home:"home"`（curl + jq 斷言 menu 差異 + 父層 omit）。
- `isRouteExist?routeName=manage_role`:Super→true、User→false;`?routeName=home`:皆 true。
- token 無效/缺 → `3333`。

**CDP browser smoke（D8）**：base-web `.env` `VITE_AUTH_ROUTE_MODE=dynamic` → 登入 Super → 側邊欄含「系统管理」完整;登入 User → 側邊欄只「首页」;沿用 013 `tests/` CDP harness(9229)。

## 6. scope 邊界（不做、留後續）

- `sys_menu` DB 表 + menu 樹建構 + manage/menu CRUD → Phase 4。
- **全路由 endpoint-access enforce 矩陣**(對每個 HTTP 路徑×method 掛 enforce middleware、三 role × 全 endpoint)→ Phase 3 #4。**本 feature 只做 menu-visibility policy**(`obj=route_name, act=menu`)、route endpoint 本身**不**掛 access enforce middleware(getConstantRoutes 公開、getUserRoutes/isRouteExist 只驗 JWT + 內部 enforce 過濾 menu)。
- 受管 RBAC policy 層(menu policy 的 soft-delete/CRUD/治理)→ #6;本 feature menu policy 為 migration seed 的 stock rows、無治理。
- redis pub-sub policy/route invalidate → Phase 3 #3。
- demo menu(function/plugin/alova/document…)→ 不做(只業務 home + manage);§11.5 `pageExcludePatterns` 隱藏 demo 為另議。
- 撤權即時性(claims vs DB)完整拍板 → 完整 enforce rollout(#4/#5)。

## 7. 工程紀律

- **無新 workspace crate**(route 模組進既有 `server` crate)→ 無 Dockerfile builder COPY 缺口(守 [CHECKLIST §2.13](../INTEGRATION-CHECKLIST.md) 跨 feature 守則;惟新 dep 無 → 仍順手 prod build sanity)。
- **兩段式 commit**:rust-api worktree(route handler/defs)+ base-web `.env`(`VITE_AUTH_ROUTE_MODE=dynamic`、BASE-WEB-ADAPT)。
- **守 constitution §I.2**(menu 走 Casbin enforce 過濾)+ 008 envelope(全 `Res<T>`)+ 009 entity-access lint(route 模組不碰 `entity::`、roles 經 013 facade `roles_for_user`)+ 013 JWT/bearer/enforcer 既有。menu-visibility policy 經 migration seed、casbin_rule 維持 012 stock(無 deleted_at)。
- **Phase 0 research 紀律(plan 階段必做)**:grep `base-web/src/router/elegant/routes.ts` + `src/router/routes/index.ts` customRoutes 拿 `home` + `manage_*` + constant(login/403/404/500)的**真實 route 物件 shape**(name/path/component/meta);3 端對齊(rust DTO ↔ base-web typings ↔ 渲染消費)。**最高風險 = route shape 不對 base-web 渲染不出 menu**(CDP smoke 抓)。

## 8. 對 013 的依賴與承接

| 項 | 來源 |
|---|---|
| JWT 驗證 + Claims | 013 `auth/jwt.rs::verify` + `JWT_AUD` |
| Bearer 解析 | 013 `auth/bearer.rs::bearer_token` |
| roles 查詢(權威源) | 013 `facade/sys_user_role::roles_for_user` |
| **Casbin enforcer**(menu 過濾) | 013 `AppState.enforcer`(`Arc<RwLock<Enforcer>>`)+ RBAC model(`sub,obj,act`)+ 012 SeaOrmAdapter;本 feature seed menu-visibility policy(`obj=route_name,act=menu`) |
| envelope + 3333 | 008 `Res<T>` + `BizCode::TokenExpired` |
| base-web 指向 rev2 | 013 `.env.test`→rust-api(本 feature 加 `VITE_AUTH_ROUTE_MODE=dynamic`) |
