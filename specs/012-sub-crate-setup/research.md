# Research: 012-sub-crate-setup（Phase 0）

> 紀律：rust-api 全新寫、不為 rev2 新設計 grep rev1（§7.6 / constitution §I.5）。**例外**：§11.6 明文授權 `sea-orm-adapter` / `xdb` **拷貝 rev1** → 讀取「被授權拷貝的這兩個 crate」之 deps/結構/schema **屬執行授權拷貝的範圍**（非為 rev2 新設計衍生 grep）。本檔據此讀 rev1 `rust-api/{sea-orm-adapter,xdb}`（2026-05-29）。
> 無 wire endpoint / DTO / base-web 消費者 → 「wire 3 端對齊 grep」「CDP smoke」N/A。

## grep 事實基準（rev1 授權拷貝來源 + rev2 現有產物，2026-05-29）

- **rev1 版本**（`fork260509-rev1/rust-api/Cargo.toml` workspace）：`casbin = "2.10"`、`sea-orm = "1.1"`（features `runtime-tokio-native-tls, macros`）、`async-std = "1.13"`（**未實際用於 adapter runtime**）。
- **rev2 現有**（`rust-api/Cargo.toml` workspace）：`sea-orm = "1.1.20"`（features `sqlx-postgres, runtime-tokio-rustls, macros`）、`async-trait = "0.1"`、`tracing` / `tracing-subscriber` 已備；**無 casbin、無 once_cell**。
- **rev1 sea-orm-adapter `Cargo.toml`**：deps = `async-trait`(workspace) + `casbin`(workspace,default-features=false) + `sea-orm`(workspace,default-features=false,features=["macros"])；**`[features] default = ["postgres", "runtime-tokio-rustls"]`**，且 `runtime-tokio-rustls = ["casbin/runtime-tokio", "sea-orm/runtime-tokio-rustls"]`。`*.workspace`（authors/publish/version/edition）需對齊 rev2。
- **rev1 sea-orm-adapter src**：`lib.rs`(`pub use migration::{down, up}`) / `adapter.rs`(`pub async fn new(conn)` → **內部呼 `migration::up(&conn)` 自動建表**) / `entity.rs`(CasbinRule Model) / `action.rs` / `migration.rs`(建表 DDL)。
- **casbin_rule stock schema**（`migration.rs`）：`id` `big_integer().auto_increment().primary_key()`（BIGSERIAL）/ `ptype` `string_len(18).not_null()` / `v0..v5` `string_len(125).not_null()` / unique index `(ptype, v0, v1, v2, v3, v4, v5)`。**無 deleted_at**（stock）。建表 DDL 是否 `if_not_exists` → 見 R3 處置。
- **rev1 xdb `Cargo.toml`**：deps = `once_cell` + `tracing` + `tracing-subscriber`(皆 workspace)；dev-dep `criterion`/`rand` + `[[bench]] search`。src = `lib.rs` / `searcher.rs` / `ip_value.rs`。資料檔 `ip2region.xdb` 在 rev1 `server/resources/`。
- **rev2 smoke harness 先例**（011）：`server` 為 bin-only crate;live-DB 測試用 in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`，docker `--network rev2-admin_rev2_net` 跑 `cargo test -- --ignored`。

---

## R1. 兩 crate 引入為 workspace member

**Decision**：`rust-api/sea-orm-adapter/` + `rust-api/xdb/` 拷貝自 rev1，加入 `rust-api/Cargo.toml` `members`（與 server/migration/entity/cleanup-job 同層）。`*.workspace`（authors/publish/version/edition）→ 改為 concrete 值（rev2 workspace 無 `[workspace.package]`，不能 `.workspace`）。各 crate 加註 rev1 來源 commit（`Cargo.toml` 註解 / README）。

**Rationale**：§11.6 授權拷貝;workspace member 落點對齊 DESIGN §6 結構。

## R2. runtime / 版本對齊（修正 brainstorm 假設）

**Decision**：
- **runtime**：**非** async-std→tokio（brainstorm 誤判）。adapter `default = ["postgres","runtime-tokio-rustls"]` 正是 rev2 所需 → 直接用其 default features。rev2 workspace 既有 sea-orm 1.1.20 + `runtime-tokio-rustls` 對齊。
- **casbin 版本（user 拍板 2026-05-29，§6 surface）**：**bump rev1 2.10 → 現行最新穩定 `2.20.0`**（crates.io max_stable，非 pre-release）。rev2 workspace 新增 `casbin = { version = "2.20", default-features = false }`。
- **新增 workspace deps**：`casbin = "2.20"`、`once_cell`（xdb 需）。`async-trait`/`tracing`/`tracing-subscriber`/`sea-orm 1.1.20` 已備。

**⚠️ 風險（user 知情接受）**：adapter 的 `casbin::Adapter` trait impl 是針對 2.10 寫的;2.10→2.20.0 若 trait 簽名/型有 drift → adapter 原碼需小幅調整（超出純拷貝、屬「拷貝+相容性修補」）。

**Rationale + 第一道閘門**：implementation **先** `cargo build -p sea-orm-adapter`（casbin 2.20.0）驗相容;若編譯失敗 → 依 casbin 2.20 Adapter trait 修 adapter（記 plan Deviation）。**這是本 feature 最高風險點**，活體 smoke（R5）再證 runtime 真接通。

**Alternatives**：match casbin 2.10（user 否決，選 bump）。

## R3. casbin_rule 建表（走 rev2 migration + adapter new() 自動建表的協調）

**Decision**：新增 `migration/src/m20260529_000005_create_casbin_rule.rs`，**其 `up()` 直接呼叫 adapter 匯出的 `sea_orm_adapter::up(conn)`**（單一 schema 來源、避免手寫 DDL 與 adapter drift）;`down()` 呼 `sea_orm_adapter::down(conn)`。`lib.rs` 註冊 005。經 010 自動套。

**adapter new() 自動建表協調**：adapter `new()` 內部 `migration::up`。**給拷貝進來的 adapter `migration.rs` 的 `create_table` 補 `.if_not_exists()`**（若原碼未帶）→ migration 005 先建好後，Phase 3 adapter `new()` 再呼 up() 為無害 no-op。此為小幅 idempotency 調整、**非 soft-delete fork**（soft-delete 客製仍是 Phase 3）。

**Rationale**：滿足 D3（casbin_rule 經 rev2 migration、010 自動套、schema 歷史可見）+ 守 007 FR-009（server 不自動 migrate）+ 不與 adapter 自動建表打架。單一 schema 定義（adapter up()）避免 migration 手寫 DDL 與 adapter 預期 drift。

**Alternatives**：(a) migration 手寫 stock DDL 複製一份 — 否決（與 adapter schema drift 風險）;(b) 純靠 adapter new() 自建 — 否決（schema 不在 migration 系統、違 D3）。

## R4. xdb 引入 + 資料檔路徑

**Decision**：拷貝 `xdb/src` + `Cargo.toml`（`*.workspace` 對齊、deps once_cell/tracing）。`ip2region.xdb` 從 rev1 `server/resources/` 拷入 rev2 `rust-api/xdb/resources/`（或 `server/resources/`，implementer 依 xdb default 路徑決定、plan 註明）。`searcher` default 路徑調成 rev2 對應位置。`[[bench]]`（criterion）可保留或移除（dev-only、不影響主功能;implementer 定）。

**Rationale**：xdb 純算法 lib、deps 輕、無 runtime 牽動。

## R5. 活體 smoke harness（沿用 011）

**Decision**：
- **adapter smoke**（live postgres、`#[ignore]`）：建最小 RBAC casbin model（`r=sub,obj,act` / `p=sub,obj,act` / `e = some(where (p.eft == allow))` 之類最小 model 字串）+ 此 adapter 的 `Enforcer` → `add_policy(["alice","data1","read"])` → `save_policy` → 重建 Enforcer 重載 → 斷言 policy 存在 + `casbin_rule` 表有對應列。放 server crate `#[cfg(test)] #[ignore]`（或 adapter crate 自身 test，連 DATABASE_URL）。
- **xdb smoke**（無需 DB）：解析已知 IP（`1.2.4.8`）→ 斷言回非空、格式合理地區字串。可一般 `#[test]`（純檔案、不需 `#[ignore]`，若資料檔隨 crate）或 `#[ignore]`（若路徑依環境）。
- 跑法：`docker run --network rev2-admin_rev2_net -e DATABASE_URL=... ... cargo test -- --ignored`（adapter）;no-DB run 跳過 `#[ignore]`、CI 綠。

**Rationale**：D2 活體驗收;adapter smoke 證 casbin 2.20 + runtime-tokio-rustls 對齊真接通（編譯過 ≠ 跑得過）。

## R6. 既有契約守恆

**Decision**：守 007 FR-009（casbin_rule 經 010 自動套、server boot 不自動 migrate;migration 005 註冊於 Migrator）。守 009 entity-access lint（lint 只掃 `server/src`;新 crate `sea-orm-adapter`/`xdb` 不在掃描範圍、不觸 lint;adapter 用自己的 entity 是其 crate 內部、非 `server/src` 的 `entity::`）。既有 25+3 ignored server 測試 + 17 lint 續綠。

**Rationale**：本 feature 不碰 `server/src` 既有結構（只加 workspace member + migration + 可能的 smoke test）。

---

## Research 結論

6 項全解析、0 NEEDS CLARIFICATION。**新增外部 dep**：`casbin 2.20`（user 拍板 bump、§6 surface、stable）+ `once_cell`（xdb）。**最高風險 = casbin 2.10→2.20 的 adapter Adapter-trait 相容**（user 知情;第一道閘門 = `cargo build -p sea-orm-adapter`）。守 007 FR-009 + 009 lint + §11.6 拷貝授權（兩 crate 標 rev1 出處）。runtime 對齊經 adapter 既有 `runtime-tokio-rustls` default features 解決（brainstorm「async-std→tokio」假設已修正）。
