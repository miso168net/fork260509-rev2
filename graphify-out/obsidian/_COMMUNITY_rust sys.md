---
type: community
cohesion: 1.00
members: 2
---

# rust: sys

**Cohesion:** 1.00 - tightly connected
**Members:** 2 nodes

## Members
- [[sys_user add business + audit columns]] - code - rust-api/migration/src/m20260529_000014_alter_sys_user_business_audit.rs
- [[sys_user add nick_name]] - code - rust-api/migration/src/m20260529_000008_alter_sys_user_nick_name.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_sys
SORT file.name ASC
```
