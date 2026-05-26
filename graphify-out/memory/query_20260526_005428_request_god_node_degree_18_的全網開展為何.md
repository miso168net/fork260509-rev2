---
type: "explain"
date: "2026-05-26T00:54:28.727791+00:00"
question: "request god node（degree 18）的全網開展為何？"
contributor: "graphify"
source_nodes: ["request", "fetchLogin", "fetchGetUserInfo", "fetchGetUserRoutes", "fetchGetRoleList", "fetchGetMenuList", "createHookRequest"]
---

# Q: request god node（degree 18）的全網開展為何？

## Answer

request (request_index_request) = the axios factory output in src/service/request/index.ts L13. Pure leaf, 17 inbound + 1 self-contain, zero outbound. Three categories of callers: (a) 3 file-level imports: api/system-manage.ts, api/auth.ts, api/route.ts; (b) 13 fetch* function calls — fetchLogin, fetchGetUserInfo, fetchRefreshToken, fetchCustomBackendError, fetchGetConstantRoutes, fetchGetUserRoutes, fetchIsRouteExist, fetchGetRoleList, fetchGetAllRoles, fetchGetUserList, fetchGetMenuList, fetchGetAllPages, fetchGetMenuTree; (c) 1 INFERRED createHookRequest call from packages/hooks/src/use-request.ts (cross-layer: packages/ reaches into src/). Pattern: single global axios instance, all API endpoints wrap around it. The 13 fetch* signatures are the complete inventory of base-web's runtime API surface — rev2 integration must align rust-api endpoint contracts with exactly these 13 fetches.

## Source Nodes

- request
- fetchLogin
- fetchGetUserInfo
- fetchGetUserRoutes
- fetchGetRoleList
- fetchGetMenuList
- createHookRequest