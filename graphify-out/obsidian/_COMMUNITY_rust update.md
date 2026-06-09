---
type: community
cohesion: 0.25
members: 9
---

# rust: update

**Cohesion:** 0.25 - loosely connected
**Members:** 9 nodes

## Members
- [[create_menu]] - code - rust-api/server/src/model/facade/sys_menu.rs
- [[create_role]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[mutate_in_txn]] - code - rust-api/server/src/model/audit.rs
- [[set_current_session]] - code - rust-api/server/src/model/facade/sys_user.rs
- [[update]] - code - rust-api/server/src/model/facade/system_settings.rs
- [[update_menu]] - code - rust-api/server/src/model/facade/sys_menu.rs
- [[update_role]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_role_home]] - code - rust-api/server/src/model/facade/sys_role.rs
- [[update_session_policy]] - code - rust-api/server/src/model/facade/sys_user.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_update
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_rust menu]]
- 1 edge to [[_COMMUNITY_rust dimension]]
- 1 edge to [[_COMMUNITY_rust route]]
- 1 edge to [[_COMMUNITY_rust user]]

## Top bridge nodes
- [[mutate_in_txn]] - degree 13, connects to 4 communities