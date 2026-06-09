---
type: community
cohesion: 0.06
members: 43
---

# Casbin Adapter Actions (rust)

**Cohesion:** 0.06 - loosely connected
**Members:** 43 nodes

## Members
- [[AppConfig_1]] - code - rust-api/server/src/config.rs
- [[AppState_1]] - code - rust-api/server/src/state.rs
- [[RequestContext_1]] - code - rust-api/server/src/audit_ctx.rs
- [[SeaOrmAdapter_1]] - code - rust-api/sea-orm-adapter/src/adapter.rs
- [[SeaOrmAdapterload_policy]] - code - rust-api/sea-orm-adapter/src/adapter.rs
- [[SeaOrmAdapternormalize_policy]] - code - rust-api/sea-orm-adapter/src/adapter.rs
- [[SeaOrmAdaptersave_policy]] - code - rust-api/sea-orm-adapter/src/adapter.rs
- [[actionadd_policies]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[actionadd_policy]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[actionclear_policy]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[actioncreate_active_model]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[actionload_filtered_policy]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[actionload_policy]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[actionsave_policies]] - code - rust-api/sea-orm-adapter/src/action.rs
- [[adapter migrationup]] - code - rust-api/sea-orm-adapter/src/migration.rs
- [[audit_ctxctx_mw]] - code - rust-api/server/src/audit_ctx.rs
- [[audit_ctxextract_trace_id]] - code - rust-api/server/src/audit_ctx.rs
- [[audit_ctxextract_xff]] - code - rust-api/server/src/audit_ctx.rs
- [[audit_ctxresolve_region]] - code - rust-api/server/src/audit_ctx.rs
- [[authbearerbearer_token]] - code - rust-api/server/src/auth/bearer.rs
- [[authbearerverify_bearer]] - code - rust-api/server/src/auth/bearer.rs
- [[button_authbuttons_for_roles_via_casbin]] - code - rust-api/server/src/auth/button_auth.rs
- [[button_authget_role_button_codes]] - code - rust-api/server/src/auth/button_auth.rs
- [[casbin_rule entityModel]] - code - rust-api/sea-orm-adapter/src/entity.rs
- [[casbin_rule table_1]] - concept - rust-api/sea-orm-adapter/src/entity.rs
- [[configSessionMode]] - code - rust-api/server/src/config.rs
- [[configload_secret]] - code - rust-api/server/src/config.rs
- [[configparse_session_default]] - code - rust-api/server/src/config.rs
- [[configvalidate_secret]] - code - rust-api/server/src/config.rs
- [[m027 alter_sys_user_session Migration]] - code - rust-api/migration/src/m20260529_000027_alter_sys_user_session.rs
- [[m028 create_system_settings Migration]] - code - rust-api/migration/src/m20260529_000028_create_system_settings.rs
- [[m029 seed_settings_admin Migration]] - code - rust-api/migration/src/m20260529_000029_seed_settings_admin.rs
- [[m031 alter_casbin_rule_governance Migration]] - code - rust-api/migration/src/m20260529_000031_alter_casbin_rule_governance.rs
- [[m032 create_casbin_policy_archive Migration]] - code - rust-api/migration/src/m20260529_000032_create_casbin_policy_archive.rs
- [[m033 seed_protected_policy Migration]] - code - rust-api/migration/src/m20260529_000033_seed_protected_policy.rs
- [[m034 alter_sys_menu_protected Migration]] - code - rust-api/migration/src/m20260529_000034_alter_sys_menu_protected.rs
- [[m035 seed_policy_archive_page Migration]] - code - rust-api/migration/src/m20260529_000035_seed_policy_archive_page.rs
- [[migration CLI main (Migrator)]] - code - rust-api/migration/src/main.rs
- [[policy recycle-bin (archiverestore)]] - concept - rust-api/migration/src/m20260529_000032_create_casbin_policy_archive.rs
- [[sea-orm-adapter lib (re-exports)]] - code - rust-api/sea-orm-adapter/src/lib.rs
- [[server main init_tracing]] - code - rust-api/server/src/main.rs
- [[server main()]] - code - rust-api/server/src/main.rs
- [[single_session_default settings flow]] - concept - rust-api/migration/src/m20260529_000028_create_system_settings.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Casbin_Adapter_Actions_rust
SORT file.name ASC
```
