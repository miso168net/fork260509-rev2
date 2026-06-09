---
type: community
cohesion: 0.02
members: 88
---

# Menu Mgmt Handlers/DTOs (rust)

**Cohesion:** 0.02 - loosely connected
**Members:** 88 nodes

## Members
- [[AllRoleItem]] - code - rust-api/server/src/handler/system_manage.rs
- [[ArchivedPolicy_1]] - code - rust-api/server/src/handler/system_manage.rs
- [[BatchDeleteReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[ButtonItem]] - code - rust-api/server/src/handler/system_manage.rs
- [[DeleteReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[Endpoint_1]] - code - rust-api/server/src/handler/system_manage.rs
- [[MenuCreateReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[MenuItem]] - code - rust-api/server/src/handler/system_manage.rs
- [[MenuSearchParams]] - code - rust-api/server/src/handler/system_manage.rs
- [[MenuTreeNode]] - code - rust-api/server/src/handler/system_manage.rs
- [[MenuUpdateReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[ParentProbe]] - code - rust-api/server/src/handler/system_manage.rs
- [[RestorePolicyReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleButtonReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleCreateReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleEndpointReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleHomeReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleIdReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleItem]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleMenuReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleSearchParams_1]] - code - rust-api/server/src/handler/system_manage.rs
- [[RoleUpdateReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[SystemSettingItem]] - code - rust-api/server/src/handler/system_manage.rs
- [[UpdateSettingReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[UpdateUserPolicyReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[UserCreateReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[UserItem]] - code - rust-api/server/src/handler/system_manage.rs
- [[UserSearchParams_1]] - code - rust-api/server/src/handler/system_manage.rs
- [[UserUpdateReq]] - code - rust-api/server/src/handler/system_manage.rs
- [[add_menu()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_absent_is_none()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_empty_string_is_none()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_non_numeric_string_is_err()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_null_is_none()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_number_nonzero_is_some()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_number_zero_is_none()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_string_num_is_some()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_parent_id_string_zero_is_none()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_role_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[de_user_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[dimension_from_v2_maps_act_to_dimension()]] - code - rust-api/server/src/handler/system_manage.rs
- [[enum_round_trip()]] - code - rust-api/server/src/handler/system_manage.rs
- [[gender_str_invalid_is_err()]] - code - rust-api/server/src/handler/system_manage.rs
- [[gender_str_valid()]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_all_pages()]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_menu_tree()]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_role_button()]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_role_home()]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_role_menu()]] - code - rust-api/server/src/handler/system_manage.rs
- [[get_system_settings()]] - code - rust-api/server/src/handler/system_manage.rs
- [[i16_to_wire_str()]] - code - rust-api/server/src/handler/system_manage.rs
- [[i16_to_wire_str_maps()]] - code - rust-api/server/src/handler/system_manage.rs
- [[is_seed_role_code_detects_three_seed_codes()]] - code - rust-api/server/src/handler/system_manage.rs
- [[menu_create_req_full_camel_case_payload()]] - code - rust-api/server/src/handler/system_manage.rs
- [[menu_create_req_order_wire_key_maps()]] - code - rust-api/server/src/handler/system_manage.rs
- [[menu_create_req_parent_id_string_is_some()]] - code - rust-api/server/src/handler/system_manage.rs
- [[menu_create_req_parent_id_zero_is_none()]] - code - rust-api/server/src/handler/system_manage.rs
- [[menu_update_req_immutable_keys_dropped()]] - code - rust-api/server/src/handler/system_manage.rs
- [[normalize_page_current_one_is_idx_zero()]] - code - rust-api/server/src/handler/system_manage.rs
- [[normalize_page_current_zero_saturates_to_zero()]] - code - rust-api/server/src/handler/system_manage.rs
- [[normalize_page_defaults()]] - code - rust-api/server/src/handler/system_manage.rs
- [[normalize_page_size_clamped()]] - code - rust-api/server/src/handler/system_manage.rs
- [[parent_id_to_wire_none_is_zero_some_is_string()]] - code - rust-api/server/src/handler/system_manage.rs
- [[probe()]] - code - rust-api/server/src/handler/system_manage.rs
- [[restore_audit_payload_carries_role_target_dimension()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_home_req_accepts_number_role_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_home_req_accepts_string_role_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_id_req_accepts_number()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_id_req_accepts_string()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_id_req_rejects_non_numeric_string()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_menu_req_accepts_number_role_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[role_menu_req_accepts_string_role_id()]] - code - rust-api/server/src/handler/system_manage.rs
- [[status_str_invalid_is_err()]] - code - rust-api/server/src/handler/system_manage.rs
- [[status_str_valid()]] - code - rust-api/server/src/handler/system_manage.rs
- [[system_manage.rs]] - code - rust-api/server/src/handler/system_manage.rs
- [[system_setting_item_serializes_camel_case()]] - code - rust-api/server/src/handler/system_manage.rs
- [[update_menu()]] - code - rust-api/server/src/handler/system_manage.rs
- [[update_role_endpoints()]] - code - rust-api/server/src/handler/system_manage.rs
- [[update_role_home()]] - code - rust-api/server/src/handler/system_manage.rs
- [[update_role_menu()]] - code - rust-api/server/src/handler/system_manage.rs
- [[update_user_session_policy()]] - code - rust-api/server/src/handler/system_manage.rs
- [[value_in_value_type_enum_membership()]] - code - rust-api/server/src/handler/system_manage.rs
- [[would_delete_self_batch_all_others_is_false()]] - code - rust-api/server/src/handler/system_manage.rs
- [[would_delete_self_batch_contains_operator_is_true()]] - code - rust-api/server/src/handler/system_manage.rs
- [[would_delete_self_empty_is_false()]] - code - rust-api/server/src/handler/system_manage.rs
- [[would_delete_self_single_other_is_false()]] - code - rust-api/server/src/handler/system_manage.rs
- [[would_delete_self_single_self_is_true()]] - code - rust-api/server/src/handler/system_manage.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Menu_Mgmt_Handlers/DTOs_rust
SORT file.name ASC
```

## Connections to other communities
- 24 edges to [[_COMMUNITY_rust item]]
- 10 edges to [[_COMMUNITY_rust role]]
- 9 edges to [[_COMMUNITY_rust menu]]
- 6 edges to [[_COMMUNITY_rust get]]
- 5 edges to [[_COMMUNITY_rust all]]
- 3 edges to [[_COMMUNITY_rust buttons]]
- 3 edges to [[_COMMUNITY_rust endpoints]]
- 3 edges to [[_COMMUNITY_rust delete]]
- 3 edges to [[_COMMUNITY_Casbin Policy Archive & Enforcer (rust)]]
- 3 edges to [[_COMMUNITY_rust menu]]
- 2 edges to [[_COMMUNITY_rust dimension]]
- 2 edges to [[_COMMUNITY_rust restore]]
- 2 edges to [[_COMMUNITY_rust value]]

## Top bridge nodes
- [[system_manage.rs]] - degree 162, connects to 13 communities