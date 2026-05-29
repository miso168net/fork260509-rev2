# Data Model: 012-sub-crate-setup（Phase 1）

> 本 feature 新增 1 個資料表 `casbin_rule`（**由 sea-orm-adapter 擁有其 schema**、stock、無 soft-delete）。命名/欄型以 [research.md](./research.md) grep 的 rev1 adapter `migration.rs` 真實定義為準。

## 實體：`casbin_rule`（授權政策儲存、adapter 擁有、stock 語意）

**性質**：Casbin policy 儲存表，由 `sea-orm-adapter` 的 `Adapter` 讀寫。**本 feature 採其原生語意**：非 soft-deletable（無 `deleted_at`、不 impl `SoftDeletable`）、不套 011 audit。受管治理（soft-delete 可復原 / 不可刪 protected / 變更稽核 / 統一 CRUD）= **Phase 3「受管 RBAC policy 層 feature」**，本 feature 不碰。

### 欄位（stock schema、對齊 adapter `migration.rs`）

| 欄 | 型（postgres） | sea-orm DSL（adapter 定義） | 說明 |
|---|---|---|---|
| `id` | BIGSERIAL PK | `big_integer().auto_increment().primary_key()` | 自動序號 |
| `ptype` | VARCHAR(18) NOT NULL | `string_len(18).not_null()` | policy 類型（`p` / `g` / `g2`…） |
| `v0` | VARCHAR(125) NOT NULL | `string_len(125).not_null()` | 規則值 0（如 sub） |
| `v1` | VARCHAR(125) NOT NULL | `string_len(125).not_null()` | 規則值 1（如 obj） |
| `v2` | VARCHAR(125) NOT NULL | `string_len(125).not_null()` | 規則值 2（如 act） |
| `v3` | VARCHAR(125) NOT NULL | `string_len(125).not_null()` | 規則值 3 |
| `v4` | VARCHAR(125) NOT NULL | `string_len(125).not_null()` | 規則值 4 |
| `v5` | VARCHAR(125) NOT NULL | `string_len(125).not_null()` | 規則值 5 |

- **unique index**：`(ptype, v0, v1, v2, v3, v4, v5)`（adapter 定義；防重複 policy）。
- **schema 來源唯一性**：由 `migration 005` 呼叫 `sea_orm_adapter::up(conn)` 建立（**不**在 rev2 手寫複製一份 DDL，避免 drift）;adapter `new()` 的自動建表經 `.if_not_exists()` 成無害 no-op（[research R3](./research.md)）。
- entity Model 由 `sea-orm-adapter` crate 自帶（`adapter/src/entity.rs`）;**rev2 `entity/` crate 不為 casbin_rule 加 model**（adapter 擁有）。

### 不變式（本 feature）

- **stock 語意**：只經 adapter 的 `Adapter` trait（load/save/add/remove）讀寫;本 feature 不改其 load/remove 語意。
- **非 soft-deletable**：無 `deleted_at`、不 impl `SoftDeletable`（Phase 3 受管 policy 層才加）。
- **經 rev2 migration 建立**：005 經 010 自動套、server boot 不自動 migrate（守 007 FR-009）。

---

## 引入的工具元件（非 DB 實體）

### `sea-orm-adapter`（crate）

casbin-rs `Adapter` trait 的 SeaORM/postgres 後端。對外：`Adapter::new(conn)`（建表 if_not_exists + 回 adapter）、`pub use {up, down}`（供 migration 005 呼叫）、casbin `Adapter` trait（load/save/add/remove policy）。features：`default = ["postgres","runtime-tokio-rustls"]`（對齊 rev2）。deps：casbin 2.20 + sea-orm 1.1.20 + async-trait。

### `xdb`（crate）

IP2Region 純算法綁定。對外：searcher（載 `ip2region.xdb` 資料檔 → IP→地區字串）。deps：once_cell + tracing。資料檔 `ip2region.xdb` 隨 crate 引入、default 路徑對齊 rev2。

---

## 與既有實體關係

- 與 `sys_user` / `sys_operation_log`（009/011）**無直接關聯**（casbin_rule 是獨立 policy 儲存）。
- Phase 3 enforce 時，policy 的 sub 會對應 role 常量（`R_SUPER` 等）、obj/act 對應 endpoint — 但那是 Phase 3 policy seed + enforce 的事，本 feature 只備儲存層。
