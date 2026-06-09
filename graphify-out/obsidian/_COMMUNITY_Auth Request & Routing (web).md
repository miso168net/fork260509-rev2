---
type: community
cohesion: 0.05
members: 48
---

# Auth Request & Routing (web)

**Cohesion:** 0.05 - loosely connected
**Members:** 48 nodes

## Members
- [[IsRouteExistQuery]] - code - rust-api/server/src/handler/route.rs
- [[LoginReq]] - code - rust-api/server/src/handler/auth.rs
- [[LoginToken_1]] - code - rust-api/server/src/handler/auth.rs
- [[ROOT_ROUTE_1]] - code - base-web/src/router/routes/builtin.ts
- [[RefreshReq]] - code - rust-api/server/src/handler/auth.rs
- [[UserInfo_1]] - code - rust-api/server/src/handler/auth.rs
- [[alova (request instance)]] - code - base-web/src/service-alova/request.ts
- [[auth.rs]] - code - rust-api/server/src/handler/auth.rs
- [[createBuiltinVueRoutes]] - code - base-web/src/router/routes/builtin.ts
- [[createDocumentTitleGuard]] - code - base-web/src/router/guard/title.ts
- [[createProgressGuard]] - code - base-web/src/router/guard/progress.ts
- [[createRouteGuard]] - code - base-web/src/router/guard/route.ts
- [[createRouterGuard]] - code - base-web/src/router/guard/index.ts
- [[createStaticRoutes]] - code - base-web/src/router/routes/index.ts
- [[dynamic route authorization gate]] - rationale - base-web/src/router/guard/route.ts
- [[fetchGetConstantRoutes]] - code - base-web/src/service-alova/api/route.ts
- [[fetchGetUserInfo]] - code - base-web/src/service-alova/api/auth.ts
- [[fetchGetUserList]] - code - base-web/src/service-alova/api/system-manage.ts
- [[fetchGetUserRoutes]] - code - base-web/src/service-alova/api/route.ts
- [[fetchIsRouteExist]] - code - base-web/src/service-alova/api/route.ts
- [[fetchLogin]] - code - base-web/src/service-alova/api/auth.ts
- [[fetchRefreshToken]] - code - base-web/src/service-alova/api/auth.ts
- [[generatedRoutes_1]] - code - base-web/src/router/elegant/routes.ts
- [[getAuthVueRoutes]] - code - base-web/src/router/routes/index.ts
- [[getRouteName]] - code - base-web/src/router/elegant/transform.ts
- [[getRoutePath]] - code - base-web/src/router/elegant/transform.ts
- [[get_constant_routes()]] - code - rust-api/server/src/handler/route.rs
- [[get_user_info()]] - code - rust-api/server/src/handler/auth.rs
- [[get_user_routes()]] - code - rust-api/server/src/handler/route.rs
- [[initRoute]] - code - base-web/src/router/guard/route.ts
- [[is_route_exist()]] - code - rust-api/server/src/handler/route.rs
- [[issue_tokens()]] - code - rust-api/server/src/handler/auth.rs
- [[issue_tokens_signs_access_and_refresh_with_their_own_secrets()]] - code - rust-api/server/src/handler/auth.rs
- [[layouts_1]] - code - base-web/src/router/elegant/imports.ts
- [[login()]] - code - rust-api/server/src/handler/auth.rs
- [[login_attempt_inner()]] - code - rust-api/server/src/handler/auth.rs
- [[refresh_token()]] - code - rust-api/server/src/handler/auth.rs
- [[route.rs]] - code - rust-api/server/src/handler/route.rs
- [[routeMap_1]] - code - base-web/src/router/elegant/transform.ts
- [[router_1]] - code - base-web/src/router/index.ts
- [[setupNProgress]] - code - base-web/src/plugins/nprogress.ts
- [[setupRouter]] - code - base-web/src/router/index.ts
- [[transformElegantRoutesToVueRoutes]] - code - base-web/src/router/elegant/transform.ts
- [[ttl_window()]] - code - rust-api/server/src/handler/auth.rs
- [[ttl_window_delta_equals_ttl_secs()]] - code - rust-api/server/src/handler/auth.rs
- [[useAuthStore_2]] - code - base-web/src/store/modules/auth/index.ts
- [[useRouteStore_2]] - code - base-web/src/store/modules/route/index.ts
- [[views_1]] - code - base-web/src/router/elegant/imports.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Auth_Request__Routing_web
SORT file.name ASC
```
