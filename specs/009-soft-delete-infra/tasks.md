---
description: "Task list for 009-soft-delete-infra implementation"
---

# Tasks: soft-delete-infra

**Input**: Design documents from `/specs/009-soft-delete-infra/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0):
- **本 feature 有可單測純邏輯單元**(`find_active`/`soft_delete` 的 SQL-build 斷言 + lint 掃描純 fn)→ **test-first**(red → green)。
- migration partial unique 行為為 DDL → 由 dev stack 套用 acceptance 覆蓋。
- **無 HTTP endpoint / 無 base-web modal → 無 CDP/curl 業務消費者**。

**Organization**: 6 phase;3 個 user story phase 各對應 spec US1/US2/US3 + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**:可並行(不同檔、無未完依賴)
- **[Story]**:User Story phase 內必加(US1/US2/US3);Setup/Foundational/Polish 無 story label
- 全 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

> **★ 兩段式 commit 提醒**:本 feature **動 rust-api worktree**(`rust-api/` 內新 `entity` crate + migration + `server/src/model` + tests + Cargo.toml)。實作對 `rust-api/` 內檔走 [CLAUDE.md §4.1 兩段式 commit](../../CLAUDE.md)(worktree commit+push fork → 外層 `git add rust-api` bump SHA pin)。spec docs 為外層單段。**本 tasks.md 不排 git push/merge 任務**(§3 紀律);commit/push 機制於 `executing-plans`/`finishing` 階段處理。

---

## Phase 1: Setup (Pre-flight)

**Purpose**:確認前置就緒。

- [ ] T001 Pre-flight:外層 `git branch --show-current` = `009-soft-delete-infra`;`rust-api/` worktree 在 `rev2-admin-rust-api` 分支且 `git -C rust-api status --short` 空;dev image 可 build/cargo(`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo --version`);確認現況無 entity crate/model 模組(`ls rev2-root/rust-api/entity rev2-root/rust-api/server/src/model` 應不存在、`grep -c 'entity' rev2-root/rust-api/Cargo.toml` workspace members 評估)。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:新增 `entity` crate + `sys_user` model —— US1 trait/facade 與 US3 lint 的前提。**必須先完成才進 user story**。

- [ ] T002 新增 `entity` crate skeleton:`rev2-root/rust-api/entity/Cargo.toml`(`[package] name="entity"` + `sea-orm.workspace = true`)+ `rev2-root/rust-api/entity/src/lib.rs`(`pub mod sys_user;`);`rev2-root/rust-api/Cargo.toml` `[workspace] members` 加 `"entity"`;`rev2-root/rust-api/server/Cargo.toml` `[dependencies]` 加 `entity.workspace = true`(對齊 [research R1](./research.md);無新外部 dep、用既有 sea-orm 1.1.20)
- [ ] T003 新增 `rev2-root/rust-api/entity/src/sys_user.rs`:`#[derive(Clone, Debug, PartialEq, DeriveEntityModel)] #[sea_orm(table_name = "sys_user")] struct Model { #[sea_orm(primary_key, auto_increment = false)] id: i64, user_name: String, password: String, deleted_at: Option<DateTimeWithTimeZone> }` + 空 `Relation` + `ActiveModelBehavior`(對齊 [data-model Entity 1](./data-model.md);`user_name` **不**標 `#[sea_orm(unique)]` —— 真實唯一性為 partial index、migration 管)

---

## Phase 3: User Story 1 — 軟刪除機制立定 (Priority: P1) 🎯 MVP

**Goal**:`SoftDeletable` trait(`find_active` 過濾 `deleted_at IS NULL`)+ facade(`soft_delete` 設標記、不 re-export Entity);以 SQL-build 純單測鎖定。

**Independent Test**:`cargo test -p server` 中 facade 單測 PASS —— `find_active` 產生 SQL 含 `"deleted_at" IS NULL`、`soft_delete` statement 含 `SET "deleted_at"`,即驗(不需 live DB、不需 migration 套用)。

- [ ] T004 [US1] 新增 `rev2-root/rust-api/server/src/model/soft_delete.rs`:`pub trait SoftDeletable: EntityTrait { fn deleted_at_column() -> Self::Column; fn find_active() -> Select<Self> { Self::find().filter(Self::deleted_at_column().is_null()) } }`(`find_active` 為 default method;對齊 [data-model Entity 2](./data-model.md) + [research R3](./research.md))
- [ ] T005 [US1] 新增 facade:`rev2-root/rust-api/server/src/model/facade/mod.rs`(`pub mod sys_user;`)+ `rev2-root/rust-api/server/src/model/facade/sys_user.rs`(`use entity::sys_user::{Entity, Column}`;`impl SoftDeletable for Entity { fn deleted_at_column() -> Column { Column::DeletedAt } }` + `pub fn find_active() -> Select<Entity>` 委派 + `pub async fn soft_delete(db: &DatabaseConnection, id: i64) -> Result<UpdateResult, DbErr>`〔`Entity::update_many().col_expr(Column::DeletedAt, Expr::current_timestamp().into()).filter(Column::Id.eq(id)).exec(db)`〕;**不 re-export Entity**)+ `rev2-root/rust-api/server/src/model/mod.rs`(`pub mod soft_delete; pub mod facade;`)+ `rev2-root/rust-api/server/src/main.rs` 加 `mod model;`(對齊 [data-model Entity 3](./data-model.md) + [research R4](./research.md))
- [ ] T006 [US1] `facade/sys_user.rs` `#[cfg(test)] mod tests`(**test-first**:先寫測試 red → T004/T005 green):`<Entity as SoftDeletable>::find_active().build(DbBackend::Postgres).to_string()` 斷言含 `"deleted_at" IS NULL`;soft_delete 的 update statement `.build(DbBackend::Postgres).to_string()` 斷言含 `SET "deleted_at"`(對應 spec US1 + SC-004 / FR-001·FR-002)
- [ ] T007 [US1] Acceptance:`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server -p entity` exit 0、上述 SQL-build 單測全 PASS([verification-commands §1](./contracts/verification-commands.md))

**Checkpoint**:US1 達成(軟刪除機制 + SQL-build 鎖定)= MVP 型別基礎

---

## Phase 4: User Story 2 — active 唯一性與刪除後可重用 (Priority: P2)

**Goal**:migration 加 `deleted_at` 欄 + 把 `user_name` column unique 改 partial unique index `WHERE deleted_at IS NULL`(active 唯一、deleted 同名可重用)。

**Independent Test**:dev stack up → `\d sys_user` 見 `deleted_at` 欄 + `sys_user_user_name_active_uniq` partial unique index;active 同名 INSERT 被擋、軟刪除後同名 INSERT 放行,即驗。

> 與 US1 獨立(migration 為 raw SQL/Iden,不依 US1 trait code);但同改 `sys_user` 故排於 US1 後。

- [ ] T008 [US2] 新增 `rev2-root/rust-api/migration/src/m20260529_000003_softdelete_sys_user.rs`:`up` —— ① `alter_table` add `deleted_at` `timestamp_with_time_zone().null()`;② `execute_unprepared("ALTER TABLE sys_user DROP CONSTRAINT IF EXISTS sys_user_user_name_key")`;③ `execute_unprepared("CREATE UNIQUE INDEX sys_user_user_name_active_uniq ON sys_user (user_name) WHERE deleted_at IS NULL")`;`down` 對稱還原(drop index → re-add unique → drop column)。`rev2-root/rust-api/migration/src/lib.rs` 註冊 `Box::new(m20260529_000003_softdelete_sys_user::Migration)`(對齊 [data-model Entity 1](./data-model.md) + [research R2](./research.md))
- [ ] T009 [US2] Acceptance:dev stack `up -d --wait`(migration 套用)→ `psql \d sys_user` 見 `deleted_at` 欄 + partial unique index;`INSERT` 同名 active 被擋(duplicate key)、`UPDATE ... SET deleted_at=now()` 後同名 `INSERT` 放行(count=2);`/health`=ok、active seed user ≥3 不破(對應 spec US2 + SC-001/SC-002/SC-005;[verification-commands §3](./contracts/verification-commands.md))

**Checkpoint**:US1+US2 各自 functional(機制型別 + partial unique live)

---

## Phase 5: User Story 3 — 繞過防護(build-time 強制)(Priority: P3)

**Goal**:build-failing lint test —— facade 外出現 `use entity::`/`entity::…::Entity` 使 `cargo test` fail;掃描邏輯抽純 fn 以正反向單測。

**Independent Test**:`cargo test -p server --test entity_access_lint` exit 0(目前 facade 外無 raw entity 用法);純掃描 fn 對 clean 字串回 0 違規、對植入 `use entity::sys_user` 字串偵測到,即驗。

> 依 US1(facade 已存在才有「合法 import 區」可區分)。

- [ ] T010 [US3] 新增 `rev2-root/rust-api/server/tests/entity_access_lint.rs`:純掃描 fn `scan(content: &str, path: &str) -> Vec<String>`(正則找 `use entity::`/`entity::…::Entity`)+ `#[test] fn no_raw_entity_outside_facade()`(`std::fs` 從 `env!("CARGO_MANIFEST_DIR")/src` 遞迴讀 `.rs`,對**不在 `src/model/facade/`** 的檔跑 `scan`,有違規 → `panic!` 列檔案+行)(對齊 [research R5](./research.md) + [data-model Entity 3](./data-model.md))
- [ ] T011 [US3] `entity_access_lint.rs` 補純 fn **test-first** 單測(先寫紅再實作 `scan` 綠):clean 字串(facade 內合法 import 樣本)→ `scan` 回 0 違規(FR-006 不誤殺);植入 `"use entity::sys_user;"` 字串 → `scan` 偵測到(FR-005 抓得到)(對應 spec US3 + SC-003 正反向)
- [ ] T012 [US3] Acceptance:`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server --test entity_access_lint` exit 0(facade 外無違規);純 fn 正反向單測 PASS([verification-commands §2](./contracts/verification-commands.md))

**Checkpoint**:三 user story 全 functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + scope 邊界 + 三重防護完整。

- [ ] T013 Constitution Compliance 自我覆查 + 邊界驗證:
    * (a)`git -C base-web status --short` 空(§I.1 未碰 base-web);diff 不含 `base-web/`
    * (b)`git -C rust-api diff --name-only <base>..HEAD` 改動範圍 = `entity/`(新 crate)+ `migration/`(新 migration + lib.rs)+ `server/src/model/` + `server/tests/` + Cargo.toml/lock;**未拷 rev1 code**(§I.5)
    * (c)`grep -c "✅ Pass" specs/009-soft-delete-infra/plan.md` ≥ 14(Constitution 7+7)
    * (d)scope 邊界:無業務 endpoint / 無 DTO / 無 audit;`AppError`/envelope 等他 feature 不動;`sys_user.id` 仍 `auto_increment = false`(§2.10 未碰);trait 僅 `find_active`+`deleted_at_column`(無 `restore`/`update_active`);僅 `sys_user` 一個 entity model(無其餘 6 entity)
    * (e)三重防護完整:`grep -rn 'use entity::' rust-api/server/src/ | grep -v 'model/facade/'` 應為空(facade 是唯一 raw entity 消費者);facade `sys_user.rs` 不 re-export Entity(`grep -n 'pub use entity' rust-api/server/src/model/facade/` 應空)
    * (f)無新外部 dep:`entity` crate 用既有 sea-orm 1.1.20(`grep -A2 dependencies rust-api/entity/Cargo.toml` 僅 `sea-orm.workspace`);Cargo.toml 無新增 crates.io dep
    * (g)`deleted_at` 為 internal 欄、不經 wire(無 serde wire 暴露;本 feature 無 DTO)

**Checkpoint**:feature 完整、可進 `superpowers:executing-plans`(★ rust-api 改動走兩段式 commit)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**:無依賴
- **Foundational(Phase 2)**:依 Setup;**阻斷所有 user story**(entity crate + model)
- **US1(Phase 3,P1)**:依 Foundational;MVP;純 SQL-build 單測
- **US2(Phase 4,P2)**:依 Foundational(同改 `sys_user`);與 US1 程式碼獨立(migration raw SQL);需 dev stack(partial unique live)
- **US3(Phase 5,P3)**:依 US1(facade 存在才有合法 import 區可區分)
- **Polish(Phase 6)**:依所有 user story

### Within Phases

- Phase 2:T002(crate skeleton + 接線)→ T003(model)
- Phase 3:T004(trait)→ T005(facade)→ T006(test-first,實作上先寫測試 red)→ T007 acceptance
- Phase 4:T008(migration)→ T009 acceptance(dev stack)
- Phase 5:T010(lint test scaffold)→ T011(test-first 純 fn 正反向)→ T012 acceptance

### Parallel Opportunities

- US1(T004-T007)與 US2(T008-T009)**程式碼獨立**(server model vs migration 檔)→ Foundational 完成後可並行;但同改 `sys_user` 領域、且 executing-plans 採順序 subagent unit,實務多走順序。
- US3 依 US1(facade 邊界)。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T003)→ US1(T004-T007)
2. **STOP and VALIDATE**:`cargo test -p server -p entity` PASS、`find_active`/`soft_delete` SQL 形狀鎖定
3. 達 MVP:軟刪除機制型別基礎

### Incremental Delivery

1. Setup → Foundational → US1(MVP:機制 + SQL-build 鎖定)
2. + US2(migration partial unique live + 既有不破)
3. + US3(繞過防護 build-failing lint)
4. Polish(Constitution self-check + scope 邊界 + 三重防護完整)
5. `superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree:新 entity crate + migration + server model + tests)+ 外層 SHA pin + merge --no-ff 回 `rev2-admin-root` + 更新 CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy(executing-plans 階段)

- Foundational(T002-T003):entity crate + model(可併入 US1 implementer 起手)
- US1(T004-T007):一個 implementer(trait + facade + SQL-build 單測,TDD)
- US2(T008-T009):一個 implementer(migration + dev stack acceptance)
- US3(T010-T012):一個 implementer(lint test,TDD 純 fn)
- Polish(T013):查核
- **★ commit 紀律**:rust-api worktree 改動走 §4.1 兩段式;各 unit spec+quality 雙審

---

## Notes

- **新增 workspace member `entity` crate**(用既有 sea-orm 1.1.20,**無新外部 dep**);facade 為唯一 raw entity 消費者。
- **三重防護為 DESIGN §6.5 事實**(類型 trait / facade / build-time lint);implementer 對照 [data-model](./data-model.md) / [research](./research.md),勿憑記憶。
- **scope 邊界**:只套 `sys_user`(6 entity 延後);trait 僅 `find_active`+`soft_delete`(無 restore/update_active);不碰 `sys_user.id`(§2.10);無業務 endpoint/DTO/audit/Casbin orphan 清理。
- **partial unique 用 raw SQL**(sea-query 1.1.20 不支援 partial index);drop 既有 `sys_user_user_name_key` 後建 `sys_user_user_name_active_uniq`;implementer 套用後用 `psql \d sys_user` 確認 constraint 名。
- **migration DDL 無單元測試**(由 dev stack 套用 acceptance §3 覆蓋);trait/facade/lint 純邏輯 test-first。
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V)。
- `superpowers:executing-plans` 階段把這 13 個 task 編成 execution unit + 派 fresh implementer subagent。
