---
type: community
cohesion: 0.18
members: 23
---

# rust: casbin

**Cohesion:** 0.18 - loosely connected
**Members:** 23 nodes

## Members
- [[systemManage wire endpoint namespace]] - concept - rust-api/migration/src/m20260529_000009_seed_casbin_policy.rs
- [[Casbin RBAC model (p=sub,obj,act)]] - concept - rust-api/migration/src/m20260529_000009_seed_casbin_policy.rs
- [[Casbin v2='button' permission domain]] - concept - rust-api/migration/src/m20260529_000022_seed_button_auth.rs
- [[Casbin v2='menu' visibility domain]] - concept - rust-api/migration/src/m20260529_000010_seed_menu_policy.rs
- [[casbin_rule table]] - code - rust-api/migration/src/m20260529_000005_create_casbin_rule.rs
- [[enforce_mw endpoint authorization middleware]] - concept - rust-api/migration/src/m20260529_000015_seed_write_policy.rs
- [[seed button-auth (sys_menu + casbin buttonmenuendpoint)]] - code - rust-api/migration/src/m20260529_000022_seed_button_auth.rs
- [[seed casbin getUserList endpoint policy]] - code - rust-api/migration/src/m20260529_000009_seed_casbin_policy.rs
- [[seed endpoint-governance casbin policy]] - code - rust-api/migration/src/m20260529_000023_seed_endpoint_auth_policy.rs
- [[seed getRoleListgetAllRoles casbin policy]] - code - rust-api/migration/src/m20260529_000013_seed_manage_policy.rs
- [[seed menu write-endpoint casbin policy]] - code - rust-api/migration/src/m20260529_000020_seed_menu_write_policy.rs
- [[seed menu-list read-endpoint casbin policy]] - code - rust-api/migration/src/m20260529_000019_seed_menu_read_policy.rs
- [[seed menu-restore casbin policy]] - code - rust-api/migration/src/m20260529_000025_seed_menu_restore_policy.rs
- [[seed menu-visibility casbin policy]] - code - rust-api/migration/src/m20260529_000010_seed_menu_policy.rs
- [[seed role write-endpoint casbin policy]] - code - rust-api/migration/src/m20260529_000017_seed_write_role_policy.rs
- [[seed rolemenu manage-page button-auth]] - code - rust-api/migration/src/m20260529_000024_seed_role_menu_button_auth.rs
- [[seed user write-endpoint casbin policy]] - code - rust-api/migration/src/m20260529_000015_seed_write_policy.rs
- [[soft-delete-aware partial unique index pattern]] - rationale - rust-api/migration/src/m20260529_000006_create_sys_role.rs
- [[sys_menu table]] - code - rust-api/migration/src/m20260529_000018_create_sys_menu.rs
- [[sys_role add business + audit columns]] - code - rust-api/migration/src/m20260529_000016_alter_sys_role_business_audit.rs
- [[sys_role add home + menu-auth casbin policy]] - code - rust-api/migration/src/m20260529_000021_alter_sys_role_home_seed_menu_auth_policy.rs
- [[sys_role table]] - code - rust-api/migration/src/m20260529_000006_create_sys_role.rs
- [[sys_user_role join table]] - code - rust-api/migration/src/m20260529_000007_create_sys_user_role.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_casbin
SORT file.name ASC
```
