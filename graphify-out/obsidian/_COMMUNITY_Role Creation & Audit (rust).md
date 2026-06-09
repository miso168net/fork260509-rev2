---
type: community
cohesion: 0.10
members: 42
---

# Role Creation & Audit (rust)

**Cohesion:** 0.10 - loosely connected
**Members:** 42 nodes

## Members
- [[.audit_json()_2]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[.from()_2]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[CreateRoleData]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[CreateRoleError]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[Model_13]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[RoleListFilter]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[UpdateRoleData]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[audit_json_preserves_fields_no_redaction()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[audit_rows()_2]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[build_create_role_active()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[build_create_role_active_sets_audit_fields_correctly()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[connect()_3]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[create_role()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[find_active()_2]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[find_active_by_id()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[find_active_enabled()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[find_active_enabled_sql_filters_deleted_at_and_status()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[find_active_sql_filters_deleted_at_is_null()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[hard_clean_by_code()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[list_active_all()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[list_active_all_query_shape_excludes_disabled_and_orders_id_desc()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[list_active_paginated()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[live_create_role_inserts_role_writes_one_insert_audit_then_dup()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[live_soft_delete_marks_deleted_writes_one_audit_then_noop()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[live_update_role_changes_fields_pairs_audit_keeps_code()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query_all_none_has_no_like()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query_default_filters_deleted_at_is_null()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query_default_has_no_like()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query_default_orders_by_id_desc()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query_orders_by_id_desc()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[role_list_query_with_name_filter_has_like()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[soft_delete()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[soft_delete_query()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[soft_delete_query_sets_deleted_at_pairs_deleted_by()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[sys_role.rs_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role_home()_1]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role_home_query()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role_home_query_sets_home_pairs_by_and_omits_other_cols()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role_query()]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role_query_sets_updated_at_db_side_pairs_by_and_omits_code()]] - code - rust-api/server/src/model/facade/sys_role.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Role_Creation__Audit_rust
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_Casbin Policy Archive & Enforcer (rust)]]
- 1 edge to [[_COMMUNITY_RequestResponse Layer (docs)]]

## Top bridge nodes
- [[find_active()_2]] - degree 10, connects to 1 community
- [[create_role()]] - degree 8, connects to 1 community
- [[soft_delete()]] - degree 6, connects to 1 community
- [[update_role()_1]] - degree 6, connects to 1 community
- [[update_role_home()_1]] - degree 5, connects to 1 community