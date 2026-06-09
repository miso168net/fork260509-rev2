---
source_file: "rust-api/migration/src/m20260529_000001_create_sys_user.rs"
type: "code"
community: "Docker Compose Stack"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Docker_Compose_Stack
---

# create_sys_user Migration (建 sys_user 基表)

## Connections
- [[Migrator (35 migration 序列)]] - `references` [EXTRACTED]
- [[seed_sys_user Migration (SuperAdminUser)]] - `references` [INFERRED]
- [[softdelete_sys_user Migration (deleted_at + 部分唯一索引)]] - `references` [INFERRED]
- [[sys_user Model]] - `shares_data_with` [INFERRED]

#graphify/code #graphify/INFERRED #community/Docker_Compose_Stack