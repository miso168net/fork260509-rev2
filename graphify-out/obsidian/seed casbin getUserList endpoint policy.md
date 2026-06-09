---
source_file: "rust-api/migration/src/m20260529_000009_seed_casbin_policy.rs"
type: "code"
community: "rust: casbin"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_casbin
---

# seed casbin getUserList endpoint policy

## Connections
- [[systemManage wire endpoint namespace]] - `references` [EXTRACTED]
- [[Casbin RBAC model (p=sub,obj,act)]] - `implements` [EXTRACTED]
- [[casbin_rule table]] - `shares_data_with` [EXTRACTED]
- [[enforce_mw endpoint authorization middleware]] - `conceptually_related_to` [INFERRED]
- [[seed getRoleListgetAllRoles casbin policy]] - `references` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/rust_casbin