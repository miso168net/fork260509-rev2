# Implementation Plan: getUserRoutes 改讀 sys_menu(單一真相源)

**Branch**: `018-userroutes-sys-menu` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-userroutes-sys-menu/spec.md` + Phase 0 brainstorm `docs/superpowers/018-userroutes-sys-menu.md`

## Summary

把 `GET /route/getUserRoutes` 的業務路由樹來源,從 014 寫死的 in-code `business_routes()` 改成讀 017 建的 `sys_menu` 表(單一真相源、拆 D-D)。新增純函式 `build_route_tree(Vec<Model>)->Vec<MenuRoute>` 做 Model→MenuRoute 對映 + parent_id 巢狀;`filter_routes_for_roles` 純化重構成吃「樹」參數(Casbin 過濾邏輯零變更);移除孤兒 `business_routes()`。並以一條 forward-only seed 修正 migration 補 017 漏的 `manage_user-detail` component+props(回 base-web 真相,R1/R2)。唯讀、無新 crate/dep、不動 base-web。

## Technical Context

**Language/Version**: Rust(rust-api workspace、edition 2021、MSRV 1.86)
**Primary Dependencies**: axum / sea-orm / casbin / serde —— **全既有,無新 dep**
**Storage**: PostgreSQL(`sys_menu` 表既有;一條 UPDATE seed 修正 migration)
**Testing**: cargo test(`route::menu` 純函式單測 + filter 重構)+ acceptance(curl 三角色 + psql + 重跑 014 CDP);host 無 cargo → dev docker 容器跑(§project_rustapi_build_test_env)
**Target Platform**: Linux 容器(docker compose dev/prod)
**Project Type**: web-service(rust-api 後端);無 base-web 改動
**Performance Goals**: 非考量(讀 ≤6 列 + 記憶體組樹、O(n));沿用既有
**Constraints**: getUserRoutes 三角色輸出對 014 baseline(`8965c8a`)**逐項相同**(零回歸);唯讀(無 user 寫入/operator);migration forward-only
**Scale/Scope**: 6 業務選單節點(有界小);3 檔 + 1 migration

## Constitution Check

*GATE: 對照 [constitution v1.2.0](../../.specify/memory/constitution.md) §IV 8 項逐項。*

| # | 檢查 | 結果 |
|---|---|---|
| 1 | §I.1 base-web 為權威?未提供對應 endpoint? | ✅ getUserRoutes 既有;本 feature 把來源對齊 base-web routes.ts 權威(R1)、修 seed 回真相 |
| 2 | 動到 base-web inline? | ✅ **否**(不動 base-web、無檔案改動) |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | ✅ 重用 013 enforcer + 014 menu-visibility policy(9 rows)、`menu_visible((role,route_name,"menu"))` 不變(R6) |
| 4 | wire 對齊 §I.3 mock ground truth? | ✅ `MenuRoute.id`=string(route 名)、envelope 不變、reproduces 既有 wire(R2 三端對齊) |
| 5 | 從 rev1 source 拷貝 code? | ✅ **否**(全在 rev2 既有 server crate 改 + 新純函式) |
| 6 | 凍結到 §II 12 拍板? | ✅ §11.7 dynamic mode / §I.2 Casbin menu 不變、無拍板變動 |
| 7 | 觸及 §III ★ 軌道? | ✅ **否**(不動 build config / modal inline) |
| 8 | 新建業務主表含 §I.6 6 審計欄? | ✅ **N/A 不觸發**——本 feature 無 `create migration`(只 UPDATE 既有 sys_menu seed + 讀);operator/審計欄已擱置 Phase 4 A |

**Gate 結果**:**8/8 PASS、零 violation、無 Amendment、無 §I.5 例外**(無 grep rev1)。Complexity Tracking 不需填。

## Project Structure

### Documentation (this feature)

```text
specs/018-userroutes-sys-menu/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify
├── research.md          # Phase 0(3 端對齊 grep + 決策)
├── data-model.md        # Phase 1(sys_menu 讀欄位 + seed 修正 + DTO + build_route_tree 契約)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V 合約(cargo test + psql + curl 3 角色 + 014 CDP)
└── tasks.md             # /speckit-tasks 產(本指令不產)
```

### Source Code (rust-api worktree)

```text
rust-api/
├── server/src/
│   ├── route/menu.rs           # + build_route_tree(純);filter_routes_for_roles 改吃 tree;移除 business_routes();6 純測改 fixture
│   ├── handler/route.rs        # get_user_routes:all_active → build_route_tree → filter(tree,...)
│   └── model/facade/sys_menu.rs # 不改(重用 all_active)
└── migration/src/
    ├── m20260529_000018_fix_user_detail_seed.rs   # 新:UPDATE manage_user-detail component+route_ext props
    └── lib.rs                  # 註冊 m..018
```

**Structure Decision**:單一既有 server crate 內改 + 一條 migration 到既有 migration crate。無新 crate、無新 workspace member → [CLAUDE.md §3] 「新 crate ⇒ 強制 prod image build」**不觸發**(verification §5 標 optional)。

## Complexity Tracking

> 無 Constitution violation,免填。

## Phase 0 / Phase 1 產出

- **Phase 0**:[research.md](./research.md) — R1 base-web 6 節點權威 / R2 三端對齊(唯一缺口 user-detail seed)/ R3 facade 返回型 / R4 props 存 route_ext / R5 filter 純化 / R6 Casbin 不變 / R7 重用 014 CDP / R8 無新 crate。**0 NEEDS CLARIFICATION**。
- **Phase 1**:[data-model.md](./data-model.md)(對映表 + seed 修正 SQL + DTO + build_route_tree 契約 + 6 節點 baseline 樹)/ [contracts/verification-commands.md](./contracts/verification-commands.md)(§0-§5 C-V 合約 + Acceptance Gate)/ [quickstart.md](./quickstart.md)。

## Deviation Log

*(implement 時若偏離記此;目前無)*
- D-A(brainstorm 帶入):`build_route_tree` 與 017 `build_menu_tree` 巢狀邏輯近似但輸出型不同 → **刻意各寫一份小的、不抽共用泛型**(避過早抽象)。
