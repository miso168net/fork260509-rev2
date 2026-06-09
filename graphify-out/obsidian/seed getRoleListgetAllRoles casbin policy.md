---
source_file: "rust-api/migration/src/m20260529_000013_seed_manage_policy.rs"
type: "code"
community: "rust: casbin"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_casbin
---

# seed getRoleList/getAllRoles casbin policy

## Connections
- [[systemManage wire endpoint namespace]] - `references` [EXTRACTED]
- [[casbin_rule table]] - `shares_data_with` [EXTRACTED]
- [[seed casbin getUserList endpoint policy]] - `references` [EXTRACTED]
- [[seed user write-endpoint casbin policy]] - `references` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/rust_casbin