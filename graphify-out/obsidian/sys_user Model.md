---
source_file: "rust-api/entity/src/sys_user.rs"
type: "code"
community: "Docker Compose Stack"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/Docker_Compose_Stack
---

# sys_user Model

## Connections
- [[create_sys_user Migration (建 sys_user 基表)]] - `shares_data_with` [INFERRED]
- [[entity crate 模組導出 (11 SeaORM entity)]] - `references` [EXTRACTED]
- [[softdelete_sys_user Migration (deleted_at + 部分唯一索引)]] - `shares_data_with` [INFERRED]
- [[sys_user_role Model (複合主鍵關聯表)]] - `shares_data_with` [INFERRED]

#graphify/code #graphify/INFERRED #community/Docker_Compose_Stack