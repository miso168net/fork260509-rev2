---
type: community
cohesion: 0.32
members: 8
---

# rust: user

**Cohesion:** 0.32 - loosely connected
**Members:** 8 nodes

## Members
- [[create_user]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[find_active_enabled]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[list_active_all]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[replace_roles_in_txn]] - code - rust-api/server/src/model/facade/sys_user_role.rs
- [[roles_for_user]] - code - rust-api/server/src/model/facade/sys_user_role.rs
- [[roles_for_user_ordered]] - code - rust-api/server/src/model/facade/sys_user_role.rs
- [[roles_for_users]] - code - rust-api/server/src/model/facade/sys_user_role.rs
- [[update_user]] - code - rust-api/server/src/model/facade/sys_user.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_user
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_rust update]]

## Top bridge nodes
- [[create_user]] - degree 2, connects to 1 community