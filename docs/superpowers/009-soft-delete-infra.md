# 009-soft-delete-infra — Phase 0 brainstorm（spec-design）

> **Feature**：soft-delete 基礎設施（立機制，套 `sys_user` 為 proof）
> **Phase**：Phase 2 P1 基礎設施（[DESIGN §6.5](../INTEGRATION-DESIGN.md) soft delete infrastructure / [§10 Phase 2](../INTEGRATION-DESIGN.md) #2）
> **Date**：2026-05-29
> **狀態**：brainstorm 完成、待 階段 1 `/speckit-specify`（手動觸發）
> **權威**：本檔為 Phase 0 設計凍結；wire/schema 細節以 [DESIGN §6.5 / §1.4](../INTEGRATION-DESIGN.md) 為準。

---

## 1. 緣起與現況

Phase 2 P1 剩餘 feature 中，soft-delete 是唯一**獨立**且為 audit log（§6.4，依 soft-delete）解鎖的前置。本 feature 不做完整 7-entity schema，而是**先把 soft-delete「機制」立起來、套用既有 `sys_user` 當 proof**，其餘 6 entity 日後被建時各自沿用此 pattern。

**現況**（grep 確認，2026-05-29）：
- rust-api 只有 `sys_user` 一張表（migration `m20260529_000001`：`id` big_integer primary_key〔**無** auto_increment〕、`user_name` string **column-level `.unique_key()`**、`password` string）。
- **完全沒有任何 sea-orm Entity model**（007 只建 raw migration table + 連線層，無 `DeriveEntityModel`）。
- workspace members = `["server", "migration", "cleanup-job"]`。
- JWT 機密管理（原 Phase 2 #1）已由 005/007 吸收，非待辦。

---

## 2. 設計決策（brainstorm 凍結，user 親決 2026-05-29）

| # | 決策 | 選定 |
|---|---|---|
| D1 | 範圍邊界 | **立機制 + 只套 `sys_user` 為 proof**；其餘 6 entity 延後（各自被建時沿用 pattern） |
| D2 | entity model + facade 結構 | **新建共用 `entity` crate**（raw sea-orm model）；facade 在 `server/src/model/facade/`（**不 re-export Entity**）；CI lint 守「facade 外禁 `use entity::`」邊界。理由：Phase 5 cleanup-job + migration 可共用同一 entity crate、避免重複 model（sea-orm 慣例） |
| D3 | CI lint（三重防護第三層）機制 | **build 時會 fail 的 `#[test]`**（掃 source grep，違規 `cargo test` 擋下）。理由：本專案無 CI pipeline，build-failing test 最強保證且自包含 |
| D4 | `sys_user.id` auto_increment（§2.10） | **不修、留 §2.10**。理由：auto_increment 是「建 user」議題、與 soft-delete 正交，留待完整 7-entity schema 一起處理（surgical） |
| D5 | `SoftDeletable` trait 面 | **最小面 `find_active` + `soft_delete`**；`restore`/`update_active` 延後（YAGNI，無 consumer） |
| D6 | proof 測試法 | **SQL-build 純單測**（sea-orm `build(DbBackend::Postgres)` 斷言 SQL），不連 DB；migration up/down 由 dev stack 套用驗證 |

---

## 3. 架構 / 元件

| 元件 | 位置 | 職責 |
|---|---|---|
| **新 `entity` crate** | `entity/`（workspace member） | raw sea-orm `DeriveEntityModel`；首個 model = `sys_user`（含 `deleted_at`）。migration / server / 未來 cleanup-job 共用 |
| **migration（新檔）** | `migration/src/m2026053x_softdelete_sys_user.rs` | ① 加 `deleted_at TIMESTAMPTZ` nullable；② drop 現有 `user_name` column-level unique；③ 建 partial unique index `user_name WHERE deleted_at IS NULL` |
| **`SoftDeletable` trait + facade** | `server/src/model/facade/`（+ `model/mod.rs`） | 唯一允許碰 entity 的層；對外只暴露 active-aware 操作、**不暴露 raw Entity** |
| **lint test** | workspace `#[test]`（位置見 §6） | grep source，facade 外出現 `use entity::…` / `entity::…::Entity` 即 `panic!` |

依賴：`entity` crate 加 `sea-orm`（workspace dep）；`server` 加 `entity.workspace = true` + migration 已有 sea-orm-migration。

---

## 4. Data model — `sys_user` 變更

- `+ deleted_at TIMESTAMPTZ`（nullable；`NULL` = active row）
- **drop** column-level `user_name` unique → 改 `CREATE UNIQUE INDEX … ON sys_user(user_name) WHERE deleted_at IS NULL`（active 唯一、soft-deleted 可重用同名）
- **不碰** `id`（auto_increment 留 §2.10）
- entity model `entity/src/sys_user.rs`：`Model { id, user_name, password, deleted_at: Option<DateTimeWithTimeZone> }` + `Entity` / `Column` / `PrimaryKey` / `Relation`（空）/ `ActiveModelBehavior`

> 注意：sea-orm migration drop column-level `.unique_key()` 產生的 constraint 名為 auto-generated；實作時可能需 raw SQL `ALTER TABLE sys_user DROP CONSTRAINT <name>` + `CREATE UNIQUE INDEX … WHERE deleted_at IS NULL`（Postgres-specific）。屬 plan 階段細節。

---

## 5. `SoftDeletable` trait + facade

- **trait 最小面**（D5）：
  - `find_active() -> Select<Entity>`：回已過濾 `deleted_at IS NULL` 的 base query
  - `soft_delete(db, id)`：set `deleted_at = now()`（不物理刪）
- `restore` / `update_active` **先不做**（YAGNI；Phase 3+ 有 consumer 再擴 trait）
- facade `server/src/model/facade/sys_user.rs`：對外暴露 active-aware 操作，**不 re-export `entity::sys_user::Entity`**；呼叫者只能透過 facade
- **Casbin orphan**（DESIGN §6.5 前瞻，本 feature 不實作）：soft-delete user 後 `casbin_rule` 內 `g, user, role` 不動，靠 `find_active` 自然掩蔽；物理清理留 cleanup-job

---

## 6. CI lint（build-failing test，D3）

- 一個 `#[test]`（建議置於 `server`，掃 `server/src/` 樹）：`std::fs` 遞迴讀 `.rs`，正則找 facade 目錄（`server/src/model/facade/`）**以外**的 `use entity::` / `entity::…::Entity` 直接用法，命中即 `panic!` 列出檔案。
- 自包含、`cargo test` 隨驗收即擋；無外部 CI 依賴。
- 與 [DESIGN §9.3 envelope 不漏](../INTEGRATION-DESIGN.md) grep pattern 同精神，但本條升級為 build-enforced。

---

## 7. 測試 / proof（無 consumer、無需 live DB，D6）

- **trait/facade（純單測）**：sea-orm `QueryTrait::build(DbBackend::Postgres)` 斷言產生 SQL —— `find_active` 含 `"deleted_at" IS NULL`；soft_delete statement 含 `SET "deleted_at"`。deterministic、不連 DB。
- **lint test**：正向（facade 內 import 合法、不誤殺）+ 反向（植入假違規字串應被抓）。
- **migration up/down**：由 dev stack（007 已可跑）套用驗證 —— `deleted_at` 欄存在、partial unique index 生效（active 同名擋、deleted 同名放行）。
- **無 HTTP endpoint**（delete 業務路徑 Phase 3+）→ 無 CDP / curl 消費者；acceptance 以 `cargo test`（單測 + lint test）+ migration 套用為主。

---

## 8. Scope 邊界

### MUST NOT（不做）
- 不建其餘 6 entity（sys_role / sys_menu / sys_role_user / sys_role_menu / sys_role_endpoint / sys_menu_button）— 各自被建時沿用本 pattern
- 不碰 `sys_user.id` auto_increment（§2.10）
- 不做 `restore` / `update_active`（無 consumer）
- 無業務 endpoint / 無 DTO / 無 audit log（audit 是下個 feature、依本 feature）
- 不實作 Casbin orphan 物理清理（cleanup-job，Phase 5）

### 不在 scope（留後續）
- 完整 7-entity soft-delete rollout（各 entity 建立時）
- audit log 基礎設施（§6.4，Phase 2 next，依本 feature）

---

## 9. 交棒

- **下一步**：階段 1 `/speckit-specify`（**手動觸發**，CLAUDE.md §3；`before_specify` pre-hook 會建 `009-soft-delete-infra` feature branch）
- 本 feature **動 rust-api worktree**（新 `entity` crate + migration + server facade + Cargo.toml）→ 收尾走 [§4.1 兩段式 commit](../../CLAUDE.md)；走 **RUSTAPI-SOURCE-ISOLATION** 軌道（§III.1，非 ★）
- spec docs 落 `009-soft-delete-infra` feature branch
