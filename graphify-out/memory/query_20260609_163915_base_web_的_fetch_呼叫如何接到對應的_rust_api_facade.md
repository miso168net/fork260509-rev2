---
type: "query"
date: "2026-06-09T16:39:15.397348+00:00"
question: "base-web 的 fetch 呼叫如何接到對應的 rust-api facade?"
contributor: "graphify"
source_nodes: ["fetchLogin", "login()", "find_active_by_name", "fetchGetUserInfo", "get_user_info", "fetchGetUserList", "list_active_paginated", "get_user_list", "request", "createFlatRequest()"]
---

# Q: base-web 的 fetch 呼叫如何接到對應的 rust-api facade?

## Answer

Expanded from graph vocab: [fetch service api request handler find route login user menu role auth]. The connection is NOT a code call edge — base-web and rust-api connect over HTTP via URL-path matching, a 6-hop chain (VERIFIED against source, not graph INFERRED edges): (1) base-web fetchX() in service/api/*.ts issues {url,method} via the shared axios 'request' instance (service/request/index.ts:10, createFlatRequest packages/axios/src/index.ts:142, baseURL from utils/service.ts:49 getServiceBaseURL); (2) HTTP /api/<path>; (3) front-nginx 'location /api/' strips the /api prefix (deploy/nginx/conf.d/_locations.inc:16, trailing-slash proxy_pass to rust-api:21081/); (4) rust-api Router::new() registers ~40 root-relative routes (main.rs:122, NO /api nest — that is why nginx strips); (5) handler/*.rs; (6) facade::sys_*::fn(&state.db) (model/facade, the ONLY entity-access path in rev2). Verified chains: fetchLogin POST /auth/login (auth.ts:9) -> main.rs:130 -> handler/auth.rs:89 login() [OPEN, no enforce] -> facades sys_user::find_active_by_name, sys_user_role::roles_for_user, sys_login_attempt::write, sys_token::create_chain_head+revoke_other_chains. fetchGetUserInfo GET /auth/getUserInfo (auth.ts:21) + fetchGetUserRoutes GET /route/getUserRoutes (route.ts:9) -> auth.rs:255 get_user_info / route.rs:39 get_user_routes [verify_bearer + 028 is_current gate inside handler] -> sys_user::find_active_by_id, sys_user_role::roles_for_user(_ordered), sys_menu::list_active_all+assemble_menu_tree, sys_role::find_active_by_id; menu/route visibility via Casbin enforce on (role,name,'menu') tuple (route/menu.rs:336). fetchGetUserList GET /systemManage/getUserList (system-manage.ts:25) -> main.rs:153 [enforce_mw Casbin middleware] -> handler/system_manage.rs:298 get_user_list -> sys_user::list_active_paginated (sys_user.rs:95). KEY: facade returns RAW Model incl password (only soft-delete row-filtered via find_active); handler sanitizes by mapping to UserItem DTO that drops password (system_manage.rs:146 'NO password field D9'). KEY: /api prefix only exists in prod/nginx flow (docker-compose.prod.yml:33 build-arg VITE_SERVICE_BASE_URL=/api); dev uses vite proxy /proxy-default with no nginx hop. /auth/* are open endpoints, /systemManage/* go through enforce_mw.

## Source Nodes

- fetchLogin
- login()
- find_active_by_name
- fetchGetUserInfo
- get_user_info
- fetchGetUserList
- list_active_paginated
- get_user_list
- request
- createFlatRequest()