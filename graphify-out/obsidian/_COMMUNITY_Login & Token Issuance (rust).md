---
type: community
cohesion: 0.08
members: 33
---

# Login & Token Issuance (rust)

**Cohesion:** 0.08 - loosely connected
**Members:** 33 nodes

## Members
- [[AccessLogEntry]] - code - rust-api/server/src/model/facade/sys_access_log.rs
- [[Api.SystemManage.ArchivedPolicy]] - code - base-web/src/typings/api/system-manage.d.ts
- [[Api.SystemManage.Endpoint]] - code - base-web/src/typings/api/system-manage.d.ts
- [[Claims_1]] - code - rust-api/server/src/auth/jwt.rs
- [[ENDPOINT_REGISTRY]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[LoginReq_1]] - code - rust-api/server/src/handler/auth.rs
- [[LoginToken_2]] - code - rust-api/server/src/handler/auth.rs
- [[UserInfo_2]] - code - rust-api/server/src/handler/auth.rs
- [[access_log_active_model()]] - code - rust-api/server/src/model/facade/sys_access_log.rs
- [[access_log_active_model_builds_correct_insert_sql()]] - code - rust-api/server/src/model/facade/sys_access_log.rs
- [[buttons union via casbin]] - rationale - rust-api/server/src/handler/system_manage.rs
- [[connect_redis]] - code - rust-api/server/src/infra/redis.rs
- [[enforce_mw]] - code - rust-api/server/src/auth/enforce.rs
- [[get_all_endpoints]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_role_endpoints]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[get_role_endpoints_1]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_role_menu]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_role_menu_route_names]] - code - rust-api/server/src/auth/menu_auth.rs
- [[get_user_info]] - code - rust-api/server/src/handler/auth.rs
- [[get_user_routes]] - code - rust-api/server/src/handler/route.rs
- [[is_current]] - code - rust-api/server/src/auth/session.rs
- [[is_route_exist]] - code - rust-api/server/src/handler/route.rs
- [[issue_tokens]] - code - rust-api/server/src/handler/auth.rs
- [[login]] - code - rust-api/server/src/handler/auth.rs
- [[login_attempt_inner]] - code - rust-api/server/src/handler/auth.rs
- [[refresh_token]] - code - rust-api/server/src/handler/auth.rs
- [[resolve_policy]] - code - rust-api/server/src/auth/session.rs
- [[set_pointer]] - code - rust-api/server/src/auth/session.rs
- [[sign]] - code - rust-api/server/src/auth/jwt.rs
- [[sys_access_log.rs_1]] - code - rust-api/server/src/model/facade/sys_access_log.rs
- [[update_role_endpoints]] - code - rust-api/server/src/handler/system_manage.rs
- [[verify]] - code - rust-api/server/src/auth/jwt.rs
- [[write()]] - code - rust-api/server/src/model/facade/sys_access_log.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Login__Token_Issuance_rust
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_rust menu]]

## Top bridge nodes
- [[update_role_endpoints]] - degree 3, connects to 1 community