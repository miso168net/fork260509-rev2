---
source_file: "rust-api/migration/src/m20260529_000005_create_casbin_rule.rs"
type: "code"
community: "rust: casbin"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_casbin
---

# casbin_rule table

## Connections
- [[Casbin RBAC model (p=sub,obj,act)]] - `implements` [INFERRED]
- [[seed button-auth (sys_menu + casbin buttonmenuendpoint)]] - `shares_data_with` [EXTRACTED]
- [[seed casbin getUserList endpoint policy]] - `shares_data_with` [EXTRACTED]
- [[seed endpoint-governance casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed getRoleListgetAllRoles casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed menu write-endpoint casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed menu-list read-endpoint casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed menu-restore casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed menu-visibility casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed role write-endpoint casbin policy]] - `shares_data_with` [EXTRACTED]
- [[seed rolemenu manage-page button-auth]] - `shares_data_with` [EXTRACTED]
- [[seed user write-endpoint casbin policy]] - `shares_data_with` [EXTRACTED]
- [[sys_role add home + menu-auth casbin policy]] - `shares_data_with` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/rust_casbin