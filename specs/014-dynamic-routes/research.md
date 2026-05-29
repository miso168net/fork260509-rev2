# Research: 014-dynamic-routes（Phase 0）

> **§I.5 紀律**：route 定義 act on **base-web `src/router/elegant/routes.ts` + `routes/index.ts` 真實 shape**(base-web 為權威、§I.1);**未 grep rev1**。enforce 重用 013(非新拷貝)。
> 日期：2026-05-30。grep 對象 = base-web worktree（授權權威）+ rev2 現有產物。

## grep 事實基準（base-web 權威 + rev2 現有，2026-05-30）

- **base-web `src/service/api/route.ts`**：`fetchGetConstantRoutes()` → `GET /route/getConstantRoutes` 回 `Api.Route.MenuRoute[]`；`fetchGetUserRoutes()` → `GET /route/getUserRoutes` 回 `Api.Route.UserRoute`；`fetchIsRouteExist(routeName)` → `GET /route/isRouteExist?routeName=` 回 `boolean`。
- **base-web `src/typings/api/route.d.ts`**：`MenuRoute extends ElegantConstRoute { id: string }`；`UserRoute { routes: MenuRoute[]; home: LastLevelRouteKey }`。
- **base-web `store/modules/route` dynamic 流程**：`initDynamicAuthRoute()` → `fetchGetUserRoutes()` → 解 `{routes, home}` → `addAuthRoutes(routes)` + `setRouteHome(home)`;失敗 → `resetStore()`(logout)。dynamic mode 下 **server 已過濾、前端直接渲染收到的 routes**(不再以 meta.roles 重 filter)。
- **rev2 013 既有**:`AppState.enforcer: Arc<RwLock<casbin::Enforcer>>`(RBAC model `r=sub,obj,act`/`p=sub,obj,act`/`m=三段相等`)+ 012 `SeaOrmAdapter`;`jwt::verify`/`JWT_AUD`、`auth::bearer::bearer_token`、`facade/sys_user_role::roles_for_user`、008 `Res<T>`/`BizCode::TokenExpired(3333)`。casbin_rule 現有 013 seed 2 rows(`p,R_SUPER/R_ADMIN,/systemManage/getUserList,GET`)。

---

## R1. base-web 真實 route shape（grep `elegant/routes.ts`，最高風險對齊點）

**Decision**：route 物件精確鏡像 base-web(component 用 elegant-router `$` 複合格式)：

- **home**：`{ name:"home", path:"/home", component:"layout.base$view.home", meta:{ title:"home", i18nKey:"route.home", icon:"mdi:monitor-dashboard", order:1 } }`
- **manage**(父、layout)：`{ name:"manage", path:"/manage", component:"layout.base", meta:{ title:"manage", i18nKey:"route.manage", icon:"carbon:cloud-service-management", order:9 }, children:[...] }`
  - **manage_user**：`path:"/manage/user", component:"view.manage_user", meta:{ i18nKey:"route.manage_user", icon:"ic:round-manage-accounts", order:1 }`
  - **manage_role**：`path:"/manage/role", component:"view.manage_role", meta:{ icon:"carbon:user-role", order:2 }`
  - **manage_menu**：`path:"/manage/menu", component:"view.manage_menu", meta:{ icon:"material-symbols:route", order:3, keepAlive:true }`
  - **manage_user-detail**：`path:"/manage/user-detail/:id", component:"view.manage_user-detail", props:true, meta:{ hideInMenu:true, activeMenu:"manage_user" }`

**Rationale**：§I.1 base-web 權威;component `$` 複合格式 = elegant-router 約定(`layout$view` 單層 / 父 `layout.base` + 子 `view.xxx`),不對齊則 base-web `transformElegantRoutesToVueRoutes` 建不出 route → menu 渲染失敗。**最高風險點**(CDP smoke 抓)。

**Note**：base-web 自帶的 `meta.roles`(manage parent `['R_ADMIN']`、manage_role `['R_SUPER']` 等)是 **static mode** 客端過濾用;dynamic mode server 已過濾 → rev2 回應**省略 meta.roles**(見 R6)。

## R2. constant routes（getConstantRoutes）

**Decision**：getConstantRoutes 回 **meta.constant:true 的 5 條**(grep 確認):`403`/`404`/`500`(`layout.blank$view.{403,404,500}`)+ `login`(`layout.blank$view.login`,path 含 `:module(...)?`)+ `iframe-page`(`layout.base$view.iframe-page`)。皆 `meta:{ constant:true, hideInMenu:true }`。**公開、不過濾**(§I.2:constantRoutes 與 menu 權限無關)。

**Rationale**：brainstorm D2 寫「login + 403/404/500」(4 條),grep 發現 base-web constant set 實含 `iframe-page`(亦 constant:true)→ **refine 為 5 條**(含 iframe-page),對齊 base-web 完整 constant set 以免前端缺 route。

## R3. menu 走 Casbin enforce（§I.2 核心、2026-05-30 re-scope）

**Decision**：業務 menu 可見性**走 Casbin enforce 過濾**(非程式內 map):
- **約定**：menu-visibility policy = `p, <role>, <route_name>, menu`(obj = route name、act = 固定字串 `"menu"`,與 013 的 endpoint policy `obj=path,act=method` 共用同一 RBAC model、**model 不改**)。
- **filter**：getUserRoutes 對每條 business route 以 user 的 roles 跑 `enforce((role, route_name, "menu"))`,任一 role allow 即收;**父層 `manage` 可見性由 tree-prune 計算**(子項任一可見則保留、否則整個 omit)、**非** seed parent policy(避免父子不一致)。
- **重用 013 enforcer**:`state.enforcer.read().await.enforce(...)`;model/adapter 不動。

**Rationale**：constitution §I.2「業務 menu 走 getUserRoutes → 後端 Casbin enforce 過濾」NON-NEGOTIABLE。原 brainstorm in-code map 違反、re-scope 修正(plan Deviation D-001)。

**Alternatives**：程式內 `role→route` map(§I.2 否決);seed 父層 policy(否決、改 tree-prune 計算避免不一致)。

## R4. role→route policy seed（D3 三階梯）

**Decision**：新 migration seed menu-visibility policy 進 casbin_rule(經 010 自動套),對齊 D3:
- `home`：`p,R_SUPER,home,menu` + `p,R_ADMIN,home,menu` + `p,R_USER_COMMON,home,menu`(全角色)
- `manage_user` / `manage_user-detail`：`p,R_SUPER,...` + `p,R_ADMIN,...`
- `manage_role`：`p,R_SUPER,manage_role,menu`
- `manage_menu`：`p,R_SUPER,manage_menu,menu`
- (manage 父層**不** seed、tree-prune 計算;User 無任何 manage child → manage omit → User 只 home)

casbin_rule 維持 012 stock(v0=role,v1=route_name,v2="menu",v3-5='');**無 deleted_at**(治理留 #6)。

**Rationale**：D3 三階梯 → 8 條 menu policy rows。seed migration(編號接 013 的 009 後 = **010**)。

## R5. endpoint 認證

**Decision**：
- `getConstantRoutes`：**公開**(無 Bearer、SPA reload 前觸發)→ 回 constant 5 條不過濾。
- `getUserRoutes` / `isRouteExist`：需有效 access JWT(`jwt::verify` + `JWT_AUD`,同 getUserInfo);無效/過期/缺 → `Res::err(3333)`(HTTP 200,base-web 走 refresh→retry、失敗才 logout)。
- **3 endpoint 皆不掛 enforce *middleware***(過濾在 handler 內以 enforcer 做、非路由攔截;getUserRoutes 人人可呼叫拿「自己的」menu)。

**Rationale**：§I.2「constantRoutes 與 menu 無關、不動」;getUserRoutes 失敗 base-web `resetStore`,3333 先觸發 refresh(對齊 getUserInfo)。

## R6. wire DTO（對齊 base-web typings）

**Decision**：
- `MenuRoute { id: String, name, path, component, meta, children?, props? }` serde `rename_all="camelCase"`;**`id` 為 string**(§11.10、typings `id:string`)→ 指派穩定 string id(用 route name,如 `id:"home"`,簡單穩定)。
- `RouteMeta { title, i18nKey, icon?, order?, hideInMenu?, keepAlive?, constant?, activeMenu? }` camelCase;**省略 `roles`**(dynamic mode server 已過濾、前端不重 filter;留 roles 易誤導)。
- `UserRoute { routes: Vec<MenuRoute>, home: String }`,`home="home"`(`.env VITE_ROUTE_HOME=home`)。
- wrap 008 `Res<T>`:getConstantRoutes→`Res<Vec<MenuRoute>>`、getUserRoutes→`Res<UserRoute>`、isRouteExist→`Res<bool>`。

**Rationale**：§I.3 wire 不變式 + typings 權威。

## R7. 既有契約守恆 + dynamic mode 副作用

**Decision**：守 **007 FR-009**(server 不自動 migrate;menu policy seed 經 010 自動套)+ **009 entity-access lint**(route 模組不碰 `entity::`、roles 經 013 facade `roles_for_user`、menu policy 經 casbin adapter 非 entity)+ **008 envelope**。**無新 workspace crate、無新 dep** → 無 Dockerfile COPY 缺口;順手 prod build sanity。
- **dynamic mode 正面副作用**:getUserRoutes 只送業務 route(home+manage)→ **demo menu(function/plugin/alova/document/multi-menu)根本不送** → §11.5/BASE-WEB-BUILD-CONFIG ★(隱藏 demo)在 dynamic 模式 **moot、本 feature 不需動**。

**Rationale**：§I 紀律 + 跨 feature 守則;dynamic mode 後端控 menu 本質上解決 demo menu 顯示問題。

---

## Research 結論

7 項全解析、0 NEEDS CLARIFICATION。**無新 dep**。route 定義 act on base-web `elegant/routes.ts` 真實 shape(component `$` 複合格式、constant 5 條含 iframe-page)。menu 可見性走 **Casbin enforce**(menu-visibility policy `p,role,route_name,menu` + 013 enforcer,§I.2;model 不改、tree-prune 算父層)。**§I.5 遵守**:未 grep rev1。守 007/008/009 + 跨 feature 守則;dynamic mode 使 demo menu 不送 → §11.5 moot。**最高風險 = route 物件 component/meta shape 對齊 base-web**(CDP smoke 抓)。
