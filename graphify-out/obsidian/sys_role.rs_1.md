---
source_file: "rust-api/server/src/model/facade/sys_role.rs"
type: "code"
community: "Role Creation & Audit (rust)"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Role_Creation__Audit_rust
---

# sys_role.rs

## Connections
- [[CreateRoleData]] - `contains` [EXTRACTED]
- [[CreateRoleError]] - `contains` [EXTRACTED]
- [[RoleListFilter]] - `contains` [EXTRACTED]
- [[UpdateRoleData]] - `contains` [EXTRACTED]
- [[audit_json_preserves_fields_no_redaction()]] - `contains` [EXTRACTED]
- [[audit_rows()_2]] - `contains` [EXTRACTED]
- [[build_create_role_active()]] - `contains` [EXTRACTED]
- [[build_create_role_active_sets_audit_fields_correctly()]] - `contains` [EXTRACTED]
- [[connect()_3]] - `contains` [EXTRACTED]
- [[create_role()]] - `contains` [EXTRACTED]
- [[find_active()_2]] - `contains` [EXTRACTED]
- [[find_active_by_id()_1]] - `contains` [EXTRACTED]
- [[find_active_enabled()]] - `contains` [EXTRACTED]
- [[find_active_enabled_sql_filters_deleted_at_and_status()]] - `contains` [EXTRACTED]
- [[find_active_sql_filters_deleted_at_is_null()_1]] - `contains` [EXTRACTED]
- [[hard_clean_by_code()]] - `contains` [EXTRACTED]
- [[list_active_all()_1]] - `contains` [EXTRACTED]
- [[list_active_all_query_shape_excludes_disabled_and_orders_id_desc()]] - `contains` [EXTRACTED]
- [[list_active_paginated()_1]] - `contains` [EXTRACTED]
- [[live_create_role_inserts_role_writes_one_insert_audit_then_dup()]] - `contains` [EXTRACTED]
- [[live_soft_delete_marks_deleted_writes_one_audit_then_noop()]] - `contains` [EXTRACTED]
- [[live_update_role_changes_fields_pairs_audit_keeps_code()]] - `contains` [EXTRACTED]
- [[role_list_query()]] - `contains` [EXTRACTED]
- [[role_list_query_all_none_has_no_like()]] - `contains` [EXTRACTED]
- [[role_list_query_default_filters_deleted_at_is_null()]] - `contains` [EXTRACTED]
- [[role_list_query_default_has_no_like()]] - `contains` [EXTRACTED]
- [[role_list_query_default_orders_by_id_desc()]] - `contains` [EXTRACTED]
- [[role_list_query_orders_by_id_desc()]] - `contains` [EXTRACTED]
- [[role_list_query_with_name_filter_has_like()]] - `contains` [EXTRACTED]
- [[soft_delete()]] - `contains` [EXTRACTED]
- [[soft_delete_query()_1]] - `contains` [EXTRACTED]
- [[soft_delete_query_sets_deleted_at_pairs_deleted_by()_1]] - `contains` [EXTRACTED]
- [[update_role()_1]] - `contains` [EXTRACTED]
- [[update_role_home()_1]] - `contains` [EXTRACTED]
- [[update_role_home_query()]] - `contains` [EXTRACTED]
- [[update_role_home_query_sets_home_pairs_by_and_omits_other_cols()]] - `contains` [EXTRACTED]
- [[update_role_query()]] - `contains` [EXTRACTED]
- [[update_role_query_sets_updated_at_db_side_pairs_by_and_omits_code()]] - `contains` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Role_Creation__Audit_rust