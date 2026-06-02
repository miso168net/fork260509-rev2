# Implementation Plan: Menu Management List (DB-driven menu source)

**Branch**: `019-manage-menu-list` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-manage-menu-list/spec.md`

## Summary

menu 改 **DB-driven**:建 `sys_menu` 業務表為選單定義單一真相,**runtime 導覽(getUserRoutes)與選單管理頁(getMenuList)共讀同源**;可見性仍走既有 Casbin enforce(§I.2 不變)。本波 = **讀端 + runtime 來源遷移**(寫端 CRUD → 020,D2)。**server-only**:base-web 的 `fetchGetMenuList/Tree/AllPages` 已存在 upstream(URL 已對)、getUserRoutes wire 逐字不變 → **不動 base-web**(R0)。技術途徑:① `sys_menu`(~26 欄,jsonb buttons/query + §I.6 6 審計欄,seed 6 筆**逐字重現 014 `business_routes()` 樹**)② facade `sys_menu` 讀端 + **純函式 `assemble_menu_tree`**(parent_id→nested)③ **getUserRoutes 由 in-code 改讀 sys_menu**(樹組裝 → 映射 MenuRoute → `filter_routes_for_roles` Casbin 過濾,**輸出逐字不變**=回歸鐵律 D5)④ 3 讀端 handler(getMenuList/v2 flat 分頁 / getMenuTree / getAllPages)+ Super-only casbin seed。

## Technical Context

**Language/Version**: Rust(rust-api,sea-orm 1.1.20 / axum / casbin 2.20,MSRV 1.86)。base-web **不動**(server-only)。

**Primary Dependencies**: **無新增**(sea-orm 內建 `Json`〔無 `with-json` feature 亦可〕、`serde_json` 既有、013 enforce/jwt、014 menu filter、casbin、011 audit〔020 寫端才用〕— 全既有)。

**Storage**: PostgreSQL(`sys_menu` 新建業務表 + seed 6 rows;`casbin_rule` seed 3 行讀端 policy;migration 010 menu 可見性 policy **不動**)

**Testing**: `cargo test -p server`(純函式單測:`assemble_menu_tree` 樹組裝 / `find_active` SQL / enum 映射 / MenuItem·MenuTreeNode 序列化)+ entity_access_lint + xdb;wiring/形狀類由 `contracts/verification-commands.md` C-V(curl + psql + CDP `:21080`)覆蓋

**Target Platform**: Linux docker(dev/prod compose);base-web 經 front-nginx `/api`

**Project Type**: web(rust-api backend;base-web frontend **本波不動**)

**Performance Goals**: 小型 admin RBAC、無特定吞吐目標;getUserRoutes 每請求多一次 sys_menu 全量讀(小表、廉價;沿 014 每請求 build 樹)

**Constraints**: 無新 crate/dep;handler 零 `entity::` token(009 lint);**getUserRoutes 輸出逐字不變**(D5 回歸鐵律);可見性 Casbin 不變(§I.2);讀端 Super-only(clarify Q1);constantRoutes/isRouteExist 不動;migration up→down→up 可逆

**Scale/Scope**: 1 create migration(sys_menu + seed)+ 1 seed-policy migration + entity 1 + facade(find_active/list_*/assemble_menu_tree)+ getUserRoutes 改讀 DB + 3 讀端 handler + router 3 route。跨 feature ripple:014(getUserRoutes 源遷移 — 回歸核心)。

## Constitution Check

*GATE:Phase 0 前必過、Phase 1 後 re-check。對照 `.specify/memory/constitution.md` **v1.2.1**。*

| # | 檢查 | 結論 |
|---|---|---|
| 1 | §I.1 base-web 為權威:rust 是否提供 base-web 用到的對應 endpoint? | **PASS** — getMenuList/v2·getAllPages·getMenuTree(base-web upstream fns 已用)+ getUserRoutes(DB-driven、wire 不變)全對齊 |
| 2 | 動 base-web inline?屬哪條 ★ 軌道、邊界內? | **N/A** — 019 **server-only**(base-web menu fns 已存在 upstream、URL 已對、getUserRoutes 透明 → 不改任何 base-web 檔,R0)。★ 軌道未觸發 |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **PASS(核心紀律守住)** — getUserRoutes 遷 sys_menu 後**仍經 `filter_routes_for_roles` Casbin enforce 過濾**(機制不變、policy 010 不動);DB 只供定義、可見性續由 Casbin 判 |
| 4 | wire 對齊 §I.3 mock? | **PASS** — envelope `{data,code,msg}`、Menu.id=string(CommonRecord type-lie 同 Role、§I.3 v1.2.1 決定不修)、MenuRoute.id=string、MenuTree.id=**number**(對齊 typing 獨立型)、MenuType/IconType 字串列舉 1/2、status nullable、getUserRoutes 逐字不變 |
| 5 | 從 rev1 拷貝 code?(§I.5) | **PASS** — 全新寫 / 沿 016 read + 014 menu pattern,未拷 rev1 |
| 6 | 凍結到 §II 12 拍板?任一拍板需改→先 Amendment | **PASS(無需 amendment)** — menu 改 DB-driven 源**不違任一拍板**:§11.7 凍的是 auth route **mode=dynamic**(維持)、非「menu source」;**DESIGN §5.1 原即註 getUserRoutes「從 sys_menu 過濾」→ 本波是 align 設計意圖、非偏離**;§11.6 axum-casbin 不動。見 Complexity Tracking |
| 7 | 觸 §III ★ 軌道?邊界內? | **N/A** — server-only、不動 base-web → MODAL-WIRING/BUILD-CONFIG 未觸發 |
| 8 | 新建業務表(create migration)含 §I.6 6 審計欄? | **PASS** — sys_menu = **§I.6 凍結後第一張新建業務表** → create migration **當下即帶 6 審計欄**(forward-only 乾淨示範、0 retrofit 債)。join/append-only N-A |

**結論:§IV 8/8 PASS,無需 Amendment**(getUserRoutes 源遷移記入 Complexity Tracking)。

## Project Structure

### Documentation (this feature)
```text
specs/019-manage-menu-list/
├── plan.md              # 本檔
├── research.md          # Phase 0(R0 server-only + R1-R7)
├── data-model.md        # Phase 1(sys_menu schema/seed/樹組裝/wire 三端/casbin/id 型)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V acceptance
└── checklists/requirements.md     # spec 品質 checklist
```

### Source Code(實際觸及檔,server-only)
```text
rust-api/                                   (worktree rev2-admin-rust-api)
├── entity/src/
│   ├── sys_menu.rs                         # 新(~26 欄 + jsonb buttons/query + §I.6 6 審計欄;order 保留字處理)
│   └── lib.rs                              # +pub mod sys_menu
├── migration/src/
│   ├── m20260529_000018_create_sys_menu.rs # 新(create + partial unique route_name + seed 6 筆逐字重現 014 樹)
│   ├── m20260529_000019_seed_menu_read_policy.rs # 新(casbin R_SUPER 3 行 getMenuList/getAllPages/getMenuTree=GET)
│   └── lib.rs                              # 兩處 append(create 在 seed 前)
└── server/src/
    ├── model/facade/sys_menu.rs            # 新(SoftDeletable find_active / list_active_paginated / list_active_all / assemble_menu_tree 純函式 + AuditSerialize)
    ├── handler/route.rs                    # ★ get_user_routes 改讀 sys_menu(樹組裝→映射→filter_routes_for_roles);constant/isRouteExist 不動
    ├── handler/system_manage.rs            # +get_menu_list / get_menu_tree / get_all_pages(+ MenuItem/MenuTreeNode DTO、lint-safe 映射)
    ├── route/menu.rs                       # business_routes() 可保留供對照/測試基準(或標 deprecated;filter_routes_for_roles 留用)
    └── main.rs                             # +3 route(getMenuList/v2·getAllPages·getMenuTree,enforce_mw)

base-web/                                   不動(server-only,R0)
```

**Structure Decision**: 既有 web 雙倉 worktree;**本波僅 rust-api 單倉**(base-web 不動)→ 收尾僅 rust-api 兩段式 commit + 外層 SHA pin。server-first(本即 server-only)。

## Complexity Tracking

> Constitution Check 無「違反」,但 getUserRoutes 源遷移對既有 014 是顯著架構動作,記錄理由。

| 偏離 | 為何需要 | 較簡替代被否原因 |
|---|---|---|
| **getUserRoutes 來源:in-code `business_routes()` → 每請求讀 sys_menu + 樹組裝(D1/D2)** | D1 DB-driven 統一源(管理頁編輯〔020〕須能反映於 runtime nav);DESIGN §5.1 原設計意圖即「從 sys_menu 過濾」 | **management-only sys_menu**(runtime 維持 in-code):user 否決(半功能、雙源 divergence、違 §I.1 即時性)。**分兩 feature(runtime 先/管理後)**:user 親決 019 一起做(同源即時) |
| **回歸鐵律:getUserRoutes 輸出逐字不變(D5)** | wire 對 base-web 透明、menu ladder 不可變;最高風險(動已上線 014) | 不設逐字鐵律:菜單階梯漂移風險、base-web nav 破。故 seed 須精準重現 014 樹(research R1 已抓全樹)+ CDP/curl diff 驗 |
| **getUserRoutes 每請求 +1 次 sys_menu 全量讀**(DB-driven 副作用) | DB-driven 必要成本(小表、廉價);沿 014 每請求 build 樹的既有開銷模型 | cache sys_menu 樹:增複雜度 + staleness(menu 020 可改後失效通知未建);小型 admin 不值,defer |
