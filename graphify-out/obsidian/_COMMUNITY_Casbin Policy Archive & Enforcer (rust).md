---
type: community
cohesion: 0.05
members: 100
---

# Casbin Policy Archive & Enforcer (rust)

**Cohesion:** 0.05 - loosely connected
**Members:** 100 nodes

## Members
- [[.as_str()]] - code - rust-api/server/src/model/audit.rs
- [[.matches_v2()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[AuditEvent]] - code - rust-api/server/src/model/audit.rs
- [[AuditOperation]] - code - rust-api/server/src/model/audit.rs
- [[AuditOperator]] - code - rust-api/server/src/model/audit.rs
- [[AuditSerialize]] - code - rust-api/server/src/model/audit.rs
- [[DiffPlan]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[Dimension]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[RestoreOutcome_1]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[RevokeOutcome]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[SetRoleOutcome_1]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[archive_count_for_role()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[archive_rows()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[archive_rows_us2()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[archive_snapshot_active_model_builds_correct_insert_sql()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[archives_for_route()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[audit.rs]] - code - rust-api/server/src/model/audit.rs
- [[audit_active_model()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[audit_active_model_builds_correct_insert_sql()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[audit_rows()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[audit_rows()_1]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[batch_delete_menus()]] - code - rust-api/server/src/handler/system_manage.rs
- [[build_enforcer()]] - code - rust-api/server/src/auth/enforce.rs
- [[clean()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[clean_audit()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[clean_regen()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[clean_us2()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[connect()_1]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[connect()_2]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[current()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[delete_menu()]] - code - rust-api/server/src/handler/system_manage.rs
- [[delete_menu_cascade_in_txn()]] - code - rust-api/server/src/model/menu_policy_sync.rs
- [[desired()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_dedups_duplicate_desired()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_empty_desired_no_protected_clears_cleanly()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_empty_desired_removes_all_and_flags_protected()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_endpoint_pair_dimension()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_keeping_protected_row_is_fine()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_noop_when_current_equals_desired()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_omitting_protected_row_flags_rejection()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_same_path_different_method_are_distinct()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[diff_plan_string_dimension_basic()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[enforce()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[enforce_menu()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[find_user_raw()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[grant()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[grant_active_model_builds_correct_insert_sql()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[grant_event()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[grant_menu_vis()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[grant_regen()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[hard_clean()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[insert_active_user()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[live_all()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_audit_failure_rolls_back_grant()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_audit_insert_failure_rolls_back_soft_delete()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[live_drift3_rebuild_same_name_zero_inheritance()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_for_role()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_grant_round_trip_and_audit()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_menu_restore_brings_policy_back()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_menu_soft_delete_cascades_policy()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_menu_vis_count()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_noop_soft_delete_writes_no_audit()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[live_protected_kept_applies_normally()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_protected_removal_rejects_whole_batch()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_protected_seed_is_correct()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_regen_restore_only_own_generation()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_replace_one_dimension_leaves_others_untouched()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_restore_audit_records_role_target_dimension()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_restore_brings_back_and_allows()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_restore_noop_when_already_live()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_revoke_archives_and_denies()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_revoke_protected_is_rejected()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_row()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_row_us2()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_set()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_set_button_hard_replace()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_set_endpoint_hard_replace_multi_method()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_set_menu_hard_replace()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[live_soft_delete_writes_exactly_one_redacted_audit()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[menu_deleted_at_set()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[menu_policy_sync.rs]] - code - rust-api/server/src/model/menu_policy_sync.rs
- [[mutate_in_txn()]] - code - rust-api/server/src/model/audit.rs
- [[pairs()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[replace()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[restore()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[restore_event()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[restore_menu()]] - code - rust-api/server/src/handler/system_manage.rs
- [[restore_menu_cascade_in_txn()]] - code - rust-api/server/src/model/menu_policy_sync.rs
- [[revoke()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[revoke_event()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[roles_with_menu_visibility()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[seed_grant()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[seed_menu()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[set_role_dimension()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[sorted()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[sys_casbin_rule.rs_1]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[sys_operation_log.rs_1]] - code - rust-api/server/src/model/facade/sys_operation_log.rs
- [[test_enforce()]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[write_in_txn()]] - code - rust-api/server/src/model/facade/sys_operation_log.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Casbin_Policy_Archive__Enforcer_rust
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_Role Creation & Audit (rust)]]
- 4 edges to [[_COMMUNITY_User Creation & Audit (rust)]]
- 3 edges to [[_COMMUNITY_Menu Mgmt HandlersDTOs (rust)]]
- 2 edges to [[_COMMUNITY_Menu Tree Assembly (rust)]]
- 1 edge to [[_COMMUNITY_rust seeded]]
- 1 edge to [[_COMMUNITY_rust policy]]
- 1 edge to [[_COMMUNITY_rust settings]]

## Top bridge nodes
- [[mutate_in_txn()]] - degree 30, connects to 5 communities
- [[build_enforcer()]] - degree 4, connects to 1 community
- [[batch_delete_menus()]] - degree 3, connects to 1 community
- [[delete_menu()]] - degree 2, connects to 1 community
- [[restore_menu()]] - degree 2, connects to 1 community