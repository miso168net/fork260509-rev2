# Data Model: 009-soft-delete-infra

> soft-delete 基礎設施型別/schema（非新業務 entity）。3 個 entity:① `sys_user` schema 變更 + entity model / ② `SoftDeletable` trait / ③ facade。命名對齊 [research.md](./research.md) grep 事實與 [DESIGN §6.5](../../docs/INTEGRATION-DESIGN.md)。

---

## Entity 1: `sys_user` schema 變更 + sea-orm model

### schema 變更（migration `m20260529_000003_softdelete_sys_user`）

| 動作 | 內容 |
|---|---|
| add column | `deleted_at TIMESTAMPTZ` **nullable**（`NULL` = active；非 `NULL` = 已於該時刻軟刪除） |
| drop | 既有 column-level unique `sys_user_user_name_key`（raw SQL `DROP CONSTRAINT IF EXISTS`） |
| create | partial unique index `sys_user_user_name_active_uniq` = `UNIQUE (user_name) WHERE deleted_at IS NULL` |

- up/down 對稱（down 還原:drop partial index → re-add unique constraint → drop column）。
- **不碰** `id`（auto_increment 留 §2.10）、不碰 `password`。

### sea-orm model（`entity/src/sys_user.rs`）

```rust
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "sys_user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i64,
    pub user_name: String,
    pub password: String,
    pub deleted_at: Option<DateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
```

| 欄位 | 型 | 說明 |
|---|---|---|
| `id` | `i64` | `primary_key`、`auto_increment = false`（對齊現況 §2.10;本 feature 不改) |
| `user_name` | `String` | **不**標 `#[sea_orm(unique)]`（真實唯一性=partial index、migration 管;model-level unique 會誤導) |
| `password` | `String` | 不變 |
| `deleted_at` | `Option<DateTimeWithTimeZone>` | 軟刪除標記;`None` = active |

---

## Entity 2: `SoftDeletable` trait（可重用機制，`server/src/model/soft_delete.rs`）

```rust
use sea_orm::{entity::prelude::*, Select};

pub trait SoftDeletable: EntityTrait {
    /// 指出本 entity 的軟刪除標記欄
    fn deleted_at_column() -> Self::Column;

    /// active(未刪除)base query:WHERE deleted_at IS NULL
    fn find_active() -> Select<Self> {
        Self::find().filter(Self::deleted_at_column().is_null())
    }
}
```

- `find_active` 為 **default method**（pattern 可重用;後續 entity `impl SoftDeletable` 只需給 `deleted_at_column`)。
- 不變式:`find_active` 產生 SQL **必含** `"deleted_at" IS NULL`（FR-002 / SC-004,單測鎖)。
- `restore` / `update_active` **不在 trait**（D5 YAGNI,Phase 3+ 擴)。

---

## Entity 3: facade（唯一受管管道，`server/src/model/facade/sys_user.rs`）

- `impl SoftDeletable for entity::sys_user::Entity { fn deleted_at_column() -> Column { Column::DeletedAt } }`（facade 內;facade 是**唯一**允許 `use entity::…` 的層）
- 對外暴露 active-aware 操作、**不 re-export `entity::sys_user::Entity`**:
  - `find_active() -> Select<Entity>`（委派 trait)
  - `async fn soft_delete(db, id: i64) -> Result<UpdateResult, DbErr>`:`Entity::update_many().col_expr(Column::DeletedAt, Expr::current_timestamp().into()).filter(Column::Id.eq(id)).exec(db)`(設標記、不物理刪 — FR-001)
- `server/src/model/mod.rs`:`pub mod soft_delete; pub mod facade;`（facade 內再 `mod sys_user;`)

### 繞過防護不變式（FR-005/FR-006）

- **唯一允許 `use entity::…` 的目錄** = `server/src/model/facade/`。
- 其餘 `server/src/**` 出現 `use entity::` / `entity::…::Entity` → lint test `panic!`（build-failing,R5)。

---

## 不變式 / 邊界（MUST NOT）

- `deleted_at` 為 internal 欄,**不**經 wire 暴露(無 DTO;§I.3 wire 不變式不適用)。
- 不加其餘 6 entity model(各自被建時沿用)。
- 不改 `sys_user.id` 主鍵策略(§2.10)。
- facade **不** re-export raw Entity;trait **不**含 `restore`/`update_active`。
- partial unique index 只作用 active row(deleted row 同名可並存、可重用)。
