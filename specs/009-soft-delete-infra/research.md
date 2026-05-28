# Research: 009-soft-delete-infra（Phase 0）

> 遵守 [CLAUDE.md §3](../../CLAUDE.md) research 紀律:grep rev2 真實 source、**不 grep rev1**（Constitution §I.5；避免答案污染）。
> 本 feature 無 service trait / wire endpoint / DTO → 「rust service trait 返回型 grep」「wire 3 端對齊 grep」「CDP smoke」**N/A**;soft-delete pattern 權威 = [DESIGN §6.5](../../docs/INTEGRATION-DESIGN.md)（已讀）。

## grep 事實基準（rev2 現有產物，2026-05-29）

- **sea-orm `1.1.20`**（`rust-api/Cargo.toml:17` workspace dep,features `sqlx-postgres` / `runtime-tokio-rustls` / `macros`）;`sea-orm-migration 1.1.20`（`:18`）。toolchain `1.86`（`rust-toolchain.toml`;Cargo.lock 已 pin time0.3.37・home0.5.9 配 1.86)。
- migration 既有 pattern:`use sea_orm_migration::prelude::*` + `impl MigrationTrait` + `SchemaManager`（`migration/src/m20260529_000001_create_sys_user.rs`)。`sys_user` Iden enum = `{Table, Id, UserName, Password}`;`user_name` 用 **column-level `.unique_key()`**（→ Postgres auto-name constraint `sys_user_user_name_key`)。
- 連線型別 `sea_orm::DatabaseConnection`（`server/src/infra/db.rs:8`、`server/src/state.rs:9` `AppState.db`)。server 已 `sea-orm.workspace = true`（`server/Cargo.toml:21`)。
- **無任何 sea-orm Entity model**（grep 全樹 0 `DeriveEntityModel`)。

---

## R1. `entity` crate + sea-orm Entity model pattern

**Decision**:新增 workspace member `entity` crate（`entity/`），`Cargo.toml` `sea-orm.workspace = true`（macros feature 供 `DeriveEntityModel`)。首個 model `entity/src/sys_user.rs`:標準 `DeriveEntityModel`,`Model { id: i64, user_name: String, password: String, deleted_at: Option<DateTimeWithTimeZone> }`,空 `Relation`、`ActiveModelBehavior` 預設。`entity/src/lib.rs` `pub mod sys_user;`。

**Rationale**:D2 拍板 —— 共用 crate 讓 migration / server / 未來 cleanup-job 都能引同一 model（避免重複）。沿用既有 sea-orm 1.1.20，不新增版本、Cargo.lock 不受 1.88 transitive 影響。

**關鍵**:model **不**標 `#[sea_orm(unique)]` 於 `user_name` —— 真實唯一性是 **partial unique index**（migration 管,R2)，model-level `unique` 僅 schema-gen metadata、會誤導,故省略。`deleted_at` 用 `Option<DateTimeWithTimeZone>`（sea-orm prelude 型,對 `TIMESTAMPTZ`)。

**Alternatives**:model 放 server crate —— 否決(D2;cleanup-job 重用需要)。

---

## R2. partial unique index migration（drop 既有 unique + 建 partial）

**Decision**:新 migration `migration/src/m20260529_000003_softdelete_sys_user.rs`:
- **up**:
  1. `alter_table` add column `deleted_at` `timestamp_with_time_zone().null()`
  2. drop 既有 column unique:`execute_unprepared("ALTER TABLE sys_user DROP CONSTRAINT IF EXISTS sys_user_user_name_key")`
  3. 建 partial unique index:`execute_unprepared("CREATE UNIQUE INDEX sys_user_user_name_active_uniq ON sys_user (user_name) WHERE deleted_at IS NULL")`
- **down**:reverse —— drop index `sys_user_user_name_active_uniq`、re-add unique constraint、drop column `deleted_at`。
- 註冊進 `migration/src/lib.rs`（`Box::new(m20260529_000003_softdelete_sys_user::Migration)`)。

**Rationale**:sea-query `Index` 在 1.1.20 **不支援 partial（`WHERE`)index**,故 partial 用 raw SQL（`manager.get_connection().execute_unprepared`)。drop 既有 unique 用 `DROP CONSTRAINT IF EXISTS sys_user_user_name_key`（Postgres 對 column-level UNIQUE 自動命名 `<table>_<column>_key`)。`deleted_at` 加欄、index 建立則可混用 SchemaManager（add column)+ raw SQL（partial index)。

**Alternatives**:純 SchemaManager `create_index` —— 否決(無 partial 支援);整段全 raw SQL —— 可,但 add column 用 SchemaManager 較對齊既有風格。

> ⚠️ implementer 套用後用 `psql \d sys_user` 確認 constraint 實際名(若非 `sys_user_user_name_key` 則調整 DROP 語句)。

---

## R3. `SoftDeletable` trait + `find_active` SQL-build 單測（D5/D6）

**Decision**:
- `server/src/model/soft_delete.rs`:`pub trait SoftDeletable: EntityTrait { fn deleted_at_column() -> Self::Column; fn find_active() -> Select<Self> { Self::find().filter(Self::deleted_at_column().is_null()) } }`（`find_active` 為 default method)。
- `entity::sys_user::Entity` 在 facade 內 `impl SoftDeletable`（回 `Column::DeletedAt`)。
- **單測**:`<Entity as SoftDeletable>::find_active().build(DbBackend::Postgres).to_string()` 斷言含 `"deleted_at" IS NULL`（sea-orm `QueryTrait::build`,純單測、不連 DB)。

**Rationale**:generic default method = 可重用 pattern（D1「立機制」);`is_null()` 對映 `WHERE deleted_at IS NULL`。SQL-build 斷言 deterministic、無需 live DB（D6)。

**Alternatives**:`find_active` 寫死在 facade（非 trait)—— 否決(D1 要的是可重用 trait pattern);`deleted_at_column` 用 associated const —— sea-orm Column 非 const-friendly,用 fn。

---

## R4. `soft_delete` statement + SQL-build 單測

**Decision**:facade `server/src/model/facade/sys_user.rs` 提供 `soft_delete(db, id)`:`Entity::update_many().col_expr(Column::DeletedAt, Expr::current_timestamp().into()).filter(Column::Id.eq(id))`,`.exec(db)` 執行。**單測**:同一 statement `.build(DbBackend::Postgres).to_string()` 斷言含 `SET "deleted_at"`（不連 DB)。

**Rationale**:`update_many` + `col_expr(now())` + filter id = 「設刪除標記、不物理刪」(FR-001)。SQL-build 可純單測（D6);實際執行(連 DB)留 dev stack migration 套用後的整合驗(可選、非 proof 必需)。

**Alternatives**:`ActiveModel` load-modify-save —— 否決(需先 SELECT、兩段;update_many 一段 + 易 SQL-build 測)。`restore`/`update_active` —— D5 延後,不做。

---

## R5. build-failing lint test（繞過防護,D3）

**Decision**:`server/tests/entity_access_lint.rs`（integration test):
- 純掃描 fn `scan(content: &str, path: &str) -> Vec<String>`(回違規行描述),正則找 `use entity::` / `entity::<...>::Entity` 等直接用法。
- `#[test] fn no_raw_entity_outside_facade()`:`std::fs` 從 `env!("CARGO_MANIFEST_DIR")/src` 遞迴讀 `.rs`,對 **不在 `src/model/facade/`** 的檔跑 `scan`,有違規 → `panic!` 列檔案+行。
- `#[test]` 正反向覆蓋純 fn:clean 字串 → 0 違規;植入 `use entity::sys_user;` 字串 → 偵測到（FR-006 不誤殺 + FR-005 抓得到)。

**Rationale**:D3 build-failing test;把掃描邏輯抽純 fn 才能正反向單測(否則無法在不放真違規檔的前提下測反向)。integration test 用 `CARGO_MANIFEST_DIR` 定位 source,`cargo test` 隨驗收即跑。

**Alternatives**:clippy custom lint / proc-macro —— 否決(overkill、需額外工具鏈);shell grep in verification-commands —— 否決(D3 要 build-enforced,非人工)。

---

## Research 結論

5 項全解析、0 NEEDS CLARIFICATION。新增 1 個 workspace member（`entity` crate,用既有 sea-orm 1.1.20,無新版本 / 無新外部 dep)。**遵守 §I.5**:只 grep rev2 現有產物(Cargo.toml/migration/db.rs/state.rs)+ DESIGN §6.5 權威,未 grep / 未拷 rev1。soft-delete 三重防護(trait / facade / build-time lint)忠實對齊 DESIGN §6.5。
