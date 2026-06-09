---
type: community
cohesion: 0.20
members: 11
---

# rust: route

**Cohesion:** 0.20 - loosely connected
**Members:** 11 nodes

## Members
- [[SoftDeletable_1]] - code - rust-api/server/src/model/soft_delete.rs
- [[filter_routes]] - code - rust-api/server/src/route/menu.rs
- [[grant]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[ids_for_route_names]] - code - rust-api/server/src/model/facade/sys_menu.rs
- [[menu-visibility Casbin policy key]] - rationale - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[roles_with_menu_visibility]] - code - rust-api/server/src/model/facade/sys_casbin_rule.rs
- [[route_exists_for_roles]] - code - rust-api/server/src/route/menu.rs
- [[route_names_for_ids]] - code - rust-api/server/src/model/facade/sys_menu.rs
- [[soft_delete]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[soft_delete_1]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[soft_delete_in_txn]] - code - rust-api/server/src/model/facade/sys_menu.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_route
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_rust update]]
- 1 edge to [[_COMMUNITY_rust dimension]]
- 1 edge to [[_COMMUNITY_rust get]]
- 1 edge to [[_COMMUNITY_rust menu]]

## Top bridge nodes
- [[filter_routes]] - degree 4, connects to 1 community
- [[grant]] - degree 3, connects to 1 community
- [[soft_delete_in_txn]] - degree 3, connects to 1 community
- [[soft_delete]] - degree 2, connects to 1 community