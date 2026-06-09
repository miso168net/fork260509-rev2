---
source_file: "rust-api/migration/src/m20260529_000018_create_sys_menu.rs"
type: "code"
community: "rust: casbin"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_casbin
---

# sys_menu table

## Connections
- [[seed button-auth (sys_menu + casbin buttonmenuendpoint)]] - `shares_data_with` [EXTRACTED]
- [[seed menu-visibility casbin policy]] - `semantically_similar_to` [INFERRED]
- [[seed rolemenu manage-page button-auth]] - `shares_data_with` [EXTRACTED]
- [[soft-delete-aware partial unique index pattern]] - `implements` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/rust_casbin