---
source_file: "rust-api/migration/src/m20260529_000021_alter_sys_role_home_seed_menu_auth_policy.rs"
type: "code"
community: "rust: casbin"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_casbin
---

# sys_role add home + menu-auth casbin policy

## Connections
- [[systemManage wire endpoint namespace]] - `references` [EXTRACTED]
- [[casbin_rule table]] - `shares_data_with` [EXTRACTED]
- [[sys_role add business + audit columns]] - `shares_data_with` [INFERRED]

#graphify/code #graphify/EXTRACTED #community/rust_casbin