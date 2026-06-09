---
source_file: "rust-api/server/src/model/facade/sys_menu.rs"
type: "code"
community: "Menu Tree Assembly (rust)"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Menu_Tree_Assembly_rust
---

# sys_menu.rs

## Connections
- [[CreateMenuData]] - `contains` [EXTRACTED]
- [[CreateMenuError]] - `contains` [EXTRACTED]
- [[MenuNode]] - `contains` [EXTRACTED]
- [[UpdateMenuData]] - `contains` [EXTRACTED]
- [[active_children_query()]] - `contains` [EXTRACTED]
- [[active_children_query_filters_parent_id_and_active_only()]] - `contains` [EXTRACTED]
- [[assemble_menu_tree()]] - `contains` [EXTRACTED]
- [[assemble_menu_tree_empty_input()]] - `contains` [EXTRACTED]
- [[assemble_menu_tree_nests_and_orders_none_last()]] - `contains` [EXTRACTED]
- [[assemble_menu_tree_none_order_sorts_after_some()]] - `contains` [EXTRACTED]
- [[assemble_menu_tree_skips_orphan()]] - `contains` [EXTRACTED]
- [[audit_json_preserves_fields_times_and_jsonb()]] - `contains` [EXTRACTED]
- [[build_children()]] - `contains` [EXTRACTED]
- [[build_create_menu_active()]] - `contains` [EXTRACTED]
- [[build_create_menu_active_sets_audit_fields_correctly()]] - `contains` [EXTRACTED]
- [[child_names()]] - `contains` [EXTRACTED]
- [[count_active_children()]] - `contains` [EXTRACTED]
- [[create_menu()]] - `contains` [EXTRACTED]
- [[cycle_fixture()]] - `contains` [EXTRACTED]
- [[find_active()_1]] - `contains` [EXTRACTED]
- [[find_active_by_id()]] - `contains` [EXTRACTED]
- [[find_active_sql_filters_deleted_at_is_null()]] - `contains` [EXTRACTED]
- [[find_deleted()]] - `contains` [EXTRACTED]
- [[find_deleted_by_id()]] - `contains` [EXTRACTED]
- [[id_route_name_mapping_empty_input_short_circuits()]] - `contains` [EXTRACTED]
- [[ids_for_route_names()]] - `contains` [EXTRACTED]
- [[ids_for_route_names_query()]] - `contains` [EXTRACTED]
- [[ids_for_route_names_query_active_only_in_filter_selects_id()]] - `contains` [EXTRACTED]
- [[list_active_all()]] - `contains` [EXTRACTED]
- [[list_active_paginated()]] - `contains` [EXTRACTED]
- [[list_deleted_paginated()]] - `contains` [EXTRACTED]
- [[mk()]] - `contains` [EXTRACTED]
- [[restore_in_txn()]] - `contains` [EXTRACTED]
- [[restore_query()]] - `contains` [EXTRACTED]
- [[restore_query_clears_deleted_at_pairs_deleted_by()]] - `contains` [EXTRACTED]
- [[route_names_for_ids()]] - `contains` [EXTRACTED]
- [[route_names_for_ids_query()]] - `contains` [EXTRACTED]
- [[route_names_for_ids_query_active_only_in_filter_selects_route_name()]] - `contains` [EXTRACTED]
- [[soft_delete_in_txn()]] - `contains` [EXTRACTED]
- [[soft_delete_query()]] - `contains` [EXTRACTED]
- [[soft_delete_query_sets_deleted_at_pairs_deleted_by()]] - `contains` [EXTRACTED]
- [[update_menu()_1]] - `contains` [EXTRACTED]
- [[update_menu_query()]] - `contains` [EXTRACTED]
- [[update_menu_query_sets_updated_at_db_side_pairs_by_and_omits_immutables()]] - `contains` [EXTRACTED]
- [[would_create_cycle()]] - `contains` [EXTRACTED]
- [[would_create_cycle_legal_move()]] - `contains` [EXTRACTED]
- [[would_create_cycle_move_to_descendant()]] - `contains` [EXTRACTED]
- [[would_create_cycle_move_to_top()]] - `contains` [EXTRACTED]
- [[would_create_cycle_self_move()]] - `contains` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Menu_Tree_Assembly_rust