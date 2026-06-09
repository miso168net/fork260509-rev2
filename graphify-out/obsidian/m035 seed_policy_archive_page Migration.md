---
source_file: "rust-api/migration/src/m20260529_000035_seed_policy_archive_page.rs"
type: "code"
community: "Casbin Adapter Actions (rust)"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Casbin_Adapter_Actions_rust
---

# m035 seed_policy_archive_page Migration

## Connections
- [[casbin_rule table_1]] - `references` [INFERRED]
- [[m029 seed_settings_admin Migration]] - `references` [EXTRACTED]
- [[m033 seed_protected_policy Migration]] - `references` [EXTRACTED]
- [[policy recycle-bin (archiverestore)]] - `conceptually_related_to` [INFERRED]

#graphify/code #graphify/EXTRACTED #community/Casbin_Adapter_Actions_rust