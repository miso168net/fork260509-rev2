---
type: community
cohesion: 0.05
members: 49
---

# Docker Compose Stack

**Cohesion:** 0.05 - loosely connected
**Members:** 49 nodes

## Members
- [[_FILE docker secrets convention]] - rationale - docker-compose.yml
- [[Elegant Router automated file routing]] - concept - base-web/README.en_US.md
- [[Migrator (35 migration 序列)]] - code - rust-api/migration/src/lib.rs
- [[SoybeanAdmin CHANGELOG]] - document - base-web/CHANGELOG.md
- [[SoybeanAdmin README (EN)]] - document - base-web/README.en_US.md
- [[acme service (prod profile)]] - code - docker-compose.yml
- [[alloy log collector (obs profile)]] - code - docker-compose.yml
- [[base-web Lint Code workflow]] - code - base-web/.github/workflows/linter.yml
- [[base-web eslint config]] - code - base-web/eslint.config.js
- [[base-web index.html entry]] - code - base-web/index.html
- [[base-web oxfmt config]] - code - base-web/.oxfmtrc.json
- [[base-web oxlint config]] - code - base-web/.oxlintrc.json
- [[base-web pnpm-workspace.yaml]] - code - base-web/pnpm-workspace.yaml
- [[base-web service]] - code - docker-compose.yml
- [[base-web tsconfig.json]] - code - base-web/tsconfig.json
- [[base-web uno.config.ts]] - code - base-web/uno.config.ts
- [[base-web vite.config.ts]] - code - base-web/vite.config.ts
- [[cleanup-job on-demand service]] - code - docker-compose.yml
- [[create_sys_user Migration (建 sys_user 基表)]] - code - rust-api/migration/src/m20260529_000001_create_sys_user.rs
- [[entity crate 模組導出 (11 SeaORM entity)]] - code - rust-api/entity/src/lib.rs
- [[flexible permission routing (static + dynamic)]] - concept - base-web/README.en_US.md
- [[front-nginx service]] - code - docker-compose.yml
- [[grafana service (obs+metrics profiles)]] - code - docker-compose.yml
- [[loki log store (obs profile)]] - code - docker-compose.yml
- [[migrate one-shot service]] - code - docker-compose.yml
- [[postgres service]] - code - docker-compose.yml
- [[postgres_exporter (metrics profile)]] - code - docker-compose.yml
- [[profile-gated observability stack]] - rationale - docker-compose.yml
- [[prometheus (metrics profile)]] - code - docker-compose.yml
- [[pushgateway (metrics profile)]] - code - docker-compose.yml
- [[redis-stack service]] - code - docker-compose.yml
- [[redis_exporter (metrics profile)]] - code - docker-compose.yml
- [[rev2-admin master compose (base layer)]] - code - docker-compose.yml
- [[rev2-admin-base-web branch origin record]] - document - base-web/x_fork.branch-origin.md
- [[rust-api service]] - code - docker-compose.yml
- [[seed_sys_user Migration (SuperAdminUser)]] - code - rust-api/migration/src/m20260529_000002_seed_sys_user.rs
- [[softdelete_sys_user Migration (deleted_at + 部分唯一索引)]] - code - rust-api/migration/src/m20260529_000003_softdelete_sys_user.rs
- [[soybean-admin package.json (base-web)]] - code - base-web/package.json
- [[sys_access_log Model]] - code - rust-api/entity/src/sys_access_log.rs
- [[sys_casbin_policy_archive Model]] - code - rust-api/entity/src/sys_casbin_policy_archive.rs
- [[sys_casbin_rule Model (治理感知 casbin_rule)]] - code - rust-api/entity/src/sys_casbin_rule.rs
- [[sys_login_attempt Model]] - code - rust-api/entity/src/sys_login_attempt.rs
- [[sys_menu Model]] - code - rust-api/entity/src/sys_menu.rs
- [[sys_operation_log Model]] - code - rust-api/entity/src/sys_operation_log.rs
- [[sys_role Model]] - code - rust-api/entity/src/sys_role.rs
- [[sys_user Model]] - code - rust-api/entity/src/sys_user.rs
- [[sys_user_role Model (複合主鍵關聯表)]] - code - rust-api/entity/src/sys_user_role.rs
- [[system_settings Model]] - code - rust-api/entity/src/system_settings.rs
- [[預設帳號 SuperAdminUser (密碼 123456)]] - concept - rust-api/migration/src/m20260529_000002_seed_sys_user.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Docker_Compose_Stack
SORT file.name ASC
```
