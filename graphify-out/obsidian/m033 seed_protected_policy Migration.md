---
source_file: "rust-api/migration/src/m20260529_000033_seed_protected_policy.rs"
type: "code"
community: "Casbin Adapter Actions (rust)"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Casbin_Adapter_Actions_rust
---

# m033 seed_protected_policy Migration

## Connections
- [[casbin_rule table_1]] - `references` [INFERRED]
- [[m031 alter_casbin_rule_governance Migration]] - `references` [EXTRACTED]
- [[m035 seed_policy_archive_page Migration]] - `references` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Casbin_Adapter_Actions_rust