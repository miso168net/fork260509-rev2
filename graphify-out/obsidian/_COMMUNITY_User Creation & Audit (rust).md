---
type: community
cohesion: 0.11
members: 36
---

# User Creation & Audit (rust)

**Cohesion:** 0.11 - loosely connected
**Members:** 36 nodes

## Members
- [[.audit_json()_3]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[.from()_3]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[Api.SystemManage.SessionPolicy]] - code - base-web/src/typings/api/system-manage.d.ts
- [[Api.SystemManage.User]] - code - base-web/src/typings/api/system-manage.d.ts
- [[CreateUserData]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[CreateUserError]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[Model_14]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[UpdateUserData]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[UserListFilter]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[audit_json_redacts_password_preserves_other_fields()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[audit_rows()_3]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[connect()_4]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[create_user()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[find_active()_3]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[find_active_by_id()_2]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[find_active_by_name()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[find_active_sql_filters_deleted_at_is_null()_2]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[hard_clean_by_name()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[list_active_paginated()_2]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[live_create_user_inserts_user_assigns_role_writes_one_insert_audit()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[live_update_user_changes_fields_pairs_audit_keeps_user_name()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[roles_for_user()]] - code - rust-api/server/src/model/facade/sys_user_role.rs
- [[set_current_session()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[soft_delete()_1]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[soft_delete_query()_2]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[soft_delete_sql_sets_deleted_at()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[sys_user.rs_1]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[update_session_policy()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[update_user()_1]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[update_user_query()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[update_user_query_none_field_renders_null_some_renders_value()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[update_user_query_sets_updated_at_db_side_and_pairs_updated_by()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[user_list_query()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[user_list_query_all_none_has_no_like()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[user_list_query_orders_by_id_desc()]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[user_list_query_with_user_name_filter_has_like()]] - code - rust-api/server/src/model/facade/sys_user.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/User_Creation__Audit_rust
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_Casbin Policy Archive & Enforcer (rust)]]
- 1 edge to [[_COMMUNITY_i18n & Theme Schema (web)]]
- 1 edge to [[_COMMUNITY_RequestResponse Layer (docs)]]
- 1 edge to [[_COMMUNITY_rust user]]

## Top bridge nodes
- [[find_active()_3]] - degree 11, connects to 2 communities
- [[create_user()]] - degree 6, connects to 1 community
- [[update_user()_1]] - degree 6, connects to 1 community
- [[soft_delete()_1]] - degree 5, connects to 1 community
- [[update_session_policy()]] - degree 4, connects to 1 community