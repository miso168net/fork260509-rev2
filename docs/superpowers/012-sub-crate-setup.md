# 012-sub-crate-setup — Phase 0 brainstorm（spec-design）

> 本檔為 spec-kit feature `012-sub-crate-setup` 的階段 0 brainstorm 產物（CLAUDE.md §3 階段 0）。
> 交棒物件：手動 `/speckit-specify`（階段 1 SDD 設計鏈起點）。
> brainstorm 對話日期：2026-05-29。

---

## 1. 緣起與現況

Phase 2「後端基礎設施」最後一個 P1 feature（007 連線 / 008 envelope / 009 soft-delete / 010 自動 migration / 011 audit 皆已交）。本 feature 鋪 Casbin RBAC 的**工具層地基**，為 Phase 3（登入 + 動態選單 + Casbin enforce）做前置。

DESIGN [§11.6 拍板](../INTEGRATION-DESIGN.md) 原把 sub-crate 視為一個 feature（拷貝 `sea-orm-adapter` + `xdb`、重寫 `axum-casbin`）。**本次 brainstorm 重定位**：012 只做兩個「拷貝」crate，`axum-casbin` 重寫移 Phase 3（理由見 §2 D1）。

**現況事實（brainstorm 探索確認）**：
- rev1 source 本機可得：`/mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api/{sea-orm-adapter,xdb}`、`ip2region.xdb` 在 `server/resources/`。
- 現有 workspace members：`server / migration / cleanup-job / entity`（`rust-api/Cargo.toml`）。
- rev2 全棧 sea-orm 為 **`runtime-tokio-rustls`**（007 起）；但 rev1 的 `sea-orm-adapter` 用 **`runtime-async-std`** → 拷貝**非 verbatim**，須對齊 runtime。
- 治理：§7.6 / constitution §I.5「rust-api 全新寫、不繼承 rev1 code、phase-0 不准 grep rev1 source」；**例外**：§11.6 明文授權 `sea-orm-adapter` / `xdb` **拷貝 rev1**（拷貝授權 crate ≠ 為 rev2 新設計 grep rev1）。

## 2. 設計決策（brainstorm 凍結，user 親決 2026-05-29）

- **D1 範圍 = 只拷貝 2 crate**：本 feature 只做 `sea-orm-adapter` + `xdb`；`axum-casbin` 重寫**移 Phase 3**。理由：axum-casbin 是 enforce 中介層，其「統一 rev2 metrics/error/observability」目標依賴 observability stack（Phase 6）、且 middleware 無受保護路由（Phase 3）就無消費者、無法驗。
- **D2 驗收 = 兩 crate 活體 smoke**：不只「能編譯」。adapter 對 dev live postgres 真的 round-trip 一筆 casbin policy；xdb 真的解析一個已知 IP→地區。理由：rev1 adapter 是 async-std runtime，移植到 tokio 是「編得過、跑才爆」高風險區（呼應 011 INET 42804 教訓）。
- **D3 casbin_rule 走 rev2 migration**：新增 migration 005 建表（**stock schema**，欄位對齊 casbin sea-orm adapter 預期），經 010 自動套。**不**套 soft-delete / audit（policy 儲存、非業務 entity，如 sys_operation_log 之豁免）。

### 衍生決策 → Phase 3「受管 RBAC policy 層 feature」（本 feature out-of-scope，已登記 [DESIGN §10 Phase 3](../INTEGRATION-DESIGN.md)）

user 另提 casbin policy 要有 soft-delete 可復原 / 不可刪 protected policy / 變更軌跡 / 一致 CRUD。brainstorm 確認此 4 項：
- 需 **fork** 拷貝進來的 adapter（stock adapter 物理 DELETE + load 全表，會繞過 soft-delete）；
- 皆依賴 Phase 3 才有的 enforce 點 / operator 身分 / policy 變更入口才驗得了；
- 動到 §11.6「adapter=拷貝」前提 → specced 時須評估 constitution Amendment。

故**整批移 Phase 3「受管 RBAC policy 層 feature」**（與 axum-casbin 重寫同期），012 不碰。

## 3. 架構 / 元件

```
rust-api/
├── Cargo.toml                  ← workspace members 加 sea-orm-adapter / xdb
├── sea-orm-adapter/            ← 拷貝 rev1 + runtime 對齊 tokio
│   ├── Cargo.toml              ← casbin/sea-orm features 改 runtime-tokio-rustls；標 rev1 出處 commit
│   └── src/                    ← Casbin SeaORM Adapter(postgres)
├── xdb/                        ← 拷貝 rev1
│   ├── Cargo.toml              ← 標 rev1 出處 commit
│   ├── src/                    ← IP2Region Rust 綁定
│   └── resources/ip2region.xdb ← 從 rev1 server/resources 拷入(default 路徑調整)
└── migration/src/
    └── m20260529_000005_create_casbin_rule.rs   ← stock schema(id, ptype, v0..v5)、無 deleted_at
```

- **sea-orm-adapter**：實作 casbin-rs `Adapter` trait 的 SeaORM 後端。本 feature **不改其 load/remove 語意**（保 stock 拷貝；soft-delete 客製是 Phase 3）。僅對齊 runtime + sea-orm 版本 + features（postgres）。
- **xdb**：IP2Region 純算法綁定 lib。只調 default 資料檔路徑、對齊 rev2 edition/deps。
- **casbin_rule migration**：靜態 DDL，欄位對齊 adapter 預期。經 010 自動套（dev/prod stack up）。

## 4. 資料流 / proof 路徑

- **adapter smoke**（live postgres）：建最小 RBAC casbin model + 此 adapter 的 Enforcer → `add_policy` → `save_policy` → 重建 Enforcer 重載 → 斷言 policy 存在 + `casbin_rule` 表有對應列。**證 runtime/版本真接通**。
- **xdb smoke**：以拷入的 `ip2region.xdb` 解析已知 IP（如 `1.2.4.8`）→ 斷言回傳地區字串非空、格式合理。
- 跑法沿用 011：in-crate `#[ignore]` + docker `--network rev2-admin_rev2_net` + `-e DATABASE_URL=...`（adapter smoke 需 DB）；xdb smoke 無需 DB（純檔案）。

## 5. 版本 / runtime 對齊（核心風險點）

- **runtime**：adapter 的 `casbin` / `sea-orm` feature 從 `runtime-async-std*` → **`runtime-tokio-rustls`**，對齊 rev2 workspace `sea-orm 1.1.20`。
- **casbin 版本**：plan/research 階段定（match rev1 或 bump 現行 stable）；依 [CLAUDE.md §6](../../CLAUDE.md) 工具版本紀律 **surface 版本選項給 user**、不自選 dev/pre-release。
- **相容驗證**：research 階段先 `cargo build` 驗 casbin × sea-orm 1.1.20（其 sqlx 版本）無衝突。

## 6. 測試（[CLAUDE.md §3](../../CLAUDE.md) 紀律）

- **無新純函式邏輯**（拷貝既有 + wiring）→ 主要由 **acceptance（活體 smoke）覆蓋**，tasks/plan 須明示「無新單元測試、由 smoke 覆蓋」。
- 拷貝進來的 crate **若自帶單測** → 一併納入、確認在 rev2 tokio runtime 下綠。
- 守恆：既有 25+3 ignored server 測試 + 17 entity_access_lint 續綠；新 crate 不觸 entity-access lint（lint 只掃 `server/src`）。

## 7. scope 邊界（本 feature 不做）

- `axum-casbin` 重寫（Phase 3 #5）。
- 任何 enforce 接線 / 受保護路由 / Casbin model 正式配置（Phase 3）。
- casbin policy 的 soft-delete / 不可刪 protected / 變更 audit / 統一 CRUD facade（Phase 3「受管 RBAC policy 層 feature」#6）。
- policy seed（Phase 3 #4）、Casbin redis pub-sub（Phase 3 #3）。
- casbin_rule 加 `deleted_at` / protected 欄（留 Phase 3 受管 policy 層連同 adapter fork 一起加）。

## 8. 治理與 commit 模式

- **拷貝授權**：§11.6 / constitution §I.5 例外清單明文授權 `sea-orm-adapter` / `xdb` 拷貝 rev1；plan Constitution Check 第 5 項須載明出處。各 crate `Cargo.toml` / README 標 rev1 來源 commit。
- 守 **007 FR-009**：server boot 不自動 migrate；casbin_rule 經 010 自動套。
- 守既有測試 / lint 不破。
- **兩段式 commit**：動 rust-api worktree（新增 2 crate + migration 005）→ worktree commit + push fork + 外層 bump SHA pin（同 007/008/009/011）。

## 9. 下一步

手動 `/speckit-specify`（input = 本 brainstorm 文件）→ `/speckit-clarify` →（grep 真實 rev1 拷貝 crate 的 deps/結構作 research，**屬 §11.6 授權拷貝範圍、非 rev2 新設計 grep**，research.md 須註明）`/speckit-plan` → `/speckit-tasks` →（`/speckit-analyze`）→ `superpowers:executing-plans`。feature branch `012-sub-crate-setup`。
