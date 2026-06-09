---
type: community
cohesion: 0.40
members: 6
---

# rust: endpoint

**Cohesion:** 0.40 - moderately connected
**Members:** 6 nodes

## Members
- [[endpoint_auth.rs]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[endpoint_registry_is_well_formed()]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[get_role_endpoints()]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[get_role_endpoints_reads_only_endpoint_rows_sorted()]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[get_role_endpoints_sort_is_stable_by_path_then_method()]] - code - rust-api/server/src/auth/endpoint_auth.rs
- [[seeded_enforcer()_1]] - code - rust-api/server/src/auth/endpoint_auth.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_endpoint
SORT file.name ASC
```
