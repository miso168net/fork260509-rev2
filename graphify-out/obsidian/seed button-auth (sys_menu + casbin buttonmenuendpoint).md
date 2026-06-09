---
source_file: "rust-api/migration/src/m20260529_000022_seed_button_auth.rs"
type: "code"
community: "rust: casbin"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_casbin
---

# seed button-auth (sys_menu + casbin button/menu/endpoint)

## Connections
- [[Casbin v2='button' permission domain]] - `implements` [EXTRACTED]
- [[Casbin v2='menu' visibility domain]] - `implements` [EXTRACTED]
- [[casbin_rule table]] - `shares_data_with` [EXTRACTED]
- [[seed endpoint-governance casbin policy]] - `references` [EXTRACTED]
- [[seed rolemenu manage-page button-auth]] - `references` [EXTRACTED]
- [[sys_menu table]] - `shares_data_with` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/rust_casbin