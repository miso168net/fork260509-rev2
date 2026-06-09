---
source_file: "rust-api/migration/src/m20260529_000029_seed_settings_admin.rs"
type: "code"
community: "Casbin Adapter Actions (rust)"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Casbin_Adapter_Actions_rust
---

# m029 seed_settings_admin Migration

## Connections
- [[casbin_rule table_1]] - `references` [INFERRED]
- [[m028 create_system_settings Migration]] - `references` [INFERRED]
- [[m034 alter_sys_menu_protected Migration]] - `references` [INFERRED]
- [[m035 seed_policy_archive_page Migration]] - `references` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/Casbin_Adapter_Actions_rust