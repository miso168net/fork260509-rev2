# Implementation Plan: Menu Management Write (CRUD on DB-driven menu)

**Branch**: `020-manage-menu-write` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-manage-menu-write/spec.md`

## Summary

把 019 唯讀選單管理頁閉成**完整 CRUD**:4 條 Super-only 寫端(`addMenu`/`updateMenu`/`deleteMenu`/`batchDeleteMenu`)寫 019 的 `sys_menu` 業務表,接 base-web 選單管理頁 5 個 `// request` placeholder。**D1 payoff**:runtime 導覽(getUserRoutes)與管理頁共讀同源 → 編輯既有可見選單即時反映於導覽(`get_user_routes` code **不動**)。技術途徑:① facade `sys_menu` 擴寫端(`create_menu`〔route_name 唯一前檢→DuplicateRouteName + mutate_in_txn + audit〕/ `update_menu`〔col_expr 業務欄 + updated_at·by 成對 + **不動 route_name/menu_type/parent_id**〕/ `soft_delete`〔deleted_at·by 成對〕/ `find_active_by_id` / `count_active_children`,鏡像 018)② handler 4 寫端(`is_seed_menu` 種子 guard〔不可刪/停用〕+ 父刪 guard〔有 active 子→2222〕+ batch 兩段原子拒 + parentId 彈性反序列化 + 業務錯誤 2222)③ migration `m..020_seed_menu_write_policy`(casbin 4 行 R_SUPER)+ 4 route enforce_mw ④ base-web `rev2-system-manage.ts` +4 fetch fn + MODAL-WIRING 接 5 placeholder。**無新建表/欄**(用 019 sys_menu);**020 不碰 casbin 可見性**(D3,migration 010 不動)。

## Technical Context

**Language/Version**: Rust(rust-api,sea-orm 1.1.20 / axum / casbin 2.20,MSRV 1.86)+ base-web(Vue 3,接線 only)。

**Primary Dependencies**: **無新增**(sea-orm `Json`/serde_json 既有、011 `mutate_in_txn`/audit、013 enforce/jwt、015 ctx operator、019 sys_menu entity+read facade — 全既有)。

**Storage**: PostgreSQL(`sys_menu` 寫入〔不建表/不 alter,用 019〕;`casbin_rule` seed 4 行 write policy;migration 010 menu 可見性 policy + 019 read policy **不動**)。

**Testing**: `cargo test -p server`(純函式單測:guard `is_seed_menu` / parentId `de_parent_id` / `create_menu`·`update_menu`·`soft_delete` SQL-build〔§I.6 成對、update 不含 route_name/menu_type/parent_id〕/ DTO 序列化)+ entity_access_lint + xdb;wiring/形狀類由 `contracts/verification-commands.md` C-V(curl + psql + CDP `:21080`)覆蓋。

**Target Platform**: Linux docker(dev/prod compose);base-web 經 front-nginx `/api`。

**Project Type**: web(rust-api backend **寫路徑** + base-web frontend **寫端接線**)— **非 server-only**(對比 019)。

**Performance Goals**: 小型 admin RBAC、無特定吞吐目標;寫端低頻(維運操作)。

**Constraints**: 無新 crate/dep;handler 零 `entity::`(009 lint);**routeName/menuType immutable on edit**(D2);**020 runtime 零 casbin_rule 寫入**(D3,010 不動);種子保護(D4)+ 父刪擋(D5);id=string parse i64(R7);parentId 彈性反序列化(number|string|null→Option<i64>);§I.6 成對審計;migration 020 up→down→up 可逆。

**Scale/Scope**: 1 seed-policy migration(020)+ facade 寫端(create/update/soft_delete/find_active_by_id/count_active_children + 3 SQL-build seam)+ 4 handler + 2 DTO + 2 guard 純函式 + 4 route + base-web wrapper 4 fn + 5 placeholder wiring。跨 feature ripple:019 sys_menu(加寫路徑)+ getUserRoutes(D1 payoff、code 不動)+ MODAL-WIRING ★/WRAPPER(base-web)。

## Constitution Check

*GATE:Phase 0 前必過、Phase 1 後 re-check。對照 `.specify/memory/constitution.md` **v1.2.1**。*

| # | 檢查 | 結論 |
|---|---|---|
| 1 | §I.1 base-web 為權威:rust 是否提供 base-web 用到的對應 endpoint? | **PASS** — addMenu/updateMenu/deleteMenu/batchDeleteMenu(base-web 選單管理頁寫端 placeholder 已存、待接)全對齊 |
| 2 | 動 base-web inline?屬哪條 ★ 軌道、邊界內? | **PASS** — MODAL-WIRING ★(`menu-operate-modal.vue:259` handleSubmit + `index.vue:184/191` delete/batchDelete,只改 `// request` 行)+ BASE-WEB-WRAPPER(`rev2-system-manage.ts` +4 fn,新檔)。v1.2.0 邊界含 `views/manage/**` 的 index.vue delete/batchDelete → **授權內** |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **PASS(核心紀律守住)** — 020 **不改可見性機制**:getUserRoutes 仍 Casbin 過濾(D3、010 policy 不動);新選單可見性等 MenuAuth(獨立 feature) |
| 4 | wire 對齊 §I.3 mock? | **PASS** — id=string(parse i64)、parentId 彈性(number\|string\|null→Option,read wire 為 string、寫端混型已 grep R1)、enum 字串 `'1'`/`'2'`、業務碼 **2222**(業務驗證、非 5xxx 授權)、envelope `{data,code,msg}` |
| 5 | 從 rev1 拷貝 code?(§I.5) | **PASS** — 全新寫 / 沿 018 write + 019 sys_menu pattern,未拷 rev1 |
| 6 | 凍結到 §II 12 拍板?任一拍板需改→先 Amendment | **PASS(無需 amendment)** — menu 寫端 CRUD **不違任一拍板**:§11.3 MODAL-WIRING 啟用(本波接 menu 寫端 placeholder)、§11.7 dynamic route mode 不變、§11.10 wire(id string)不變 |
| 7 | 觸 §III ★ 軌道?邊界內? | **PASS** — MODAL-WIRING ★(只改 `// request` placeholder、每處 spec 記 file:line)+ BASE-WEB-WRAPPER(rev2- 前綴新檔、不改既有 system-manage.ts)→ 皆授權邊界內 |
| 8 | 新建業務表(create migration)含 §I.6 6 審計欄? | **N/A** — 020 **不建表/不 alter**(用 019 sys_menu,審計欄 019 create-time 已備);寫路徑成對寫 §I.6 審計欄(create `created_by` / update `updated_at`+`updated_by` / soft_delete `deleted_at`+`deleted_by`,operator 由 015 ctx) |

**結論:§IV 8/8 PASS,無需 Amendment**(parentId 彈性反序列化 + getUserRoutes code-不動 記入 Complexity Tracking)。

## Project Structure

### Documentation (this feature)
```text
specs/020-manage-menu-write/
├── plan.md              # 本檔
├── research.md          # Phase 0(R0 兩倉 + R1-R7 grep 實證)
├── data-model.md        # Phase 1(寫端 facade/DTO/parentId/casbin/種子集)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V acceptance
└── checklists/requirements.md     # spec 品質 checklist
```

### Source Code(實際觸及檔,rust-api + base-web 兩倉)
```text
rust-api/                                   (worktree rev2-admin-rust-api)
├── migration/src/
│   ├── m20260529_000020_seed_menu_write_policy.rs  # 新(casbin R_SUPER 4 行:addMenu/updateMenu POST、deleteMenu/batchDeleteMenu DELETE)
│   └── lib.rs                              # append(000019 之後)
└── server/src/
    ├── model/facade/sys_menu.rs            # 擴寫端(CreateMenuData/UpdateMenuData + create_menu/update_menu/soft_delete/find_active_by_id/count_active_children + 3 SQL-build seam + 單測)
    ├── handler/system_manage.rs            # +add_menu/update_menu/delete_menu/batch_delete_menus + MenuCreateReq/MenuUpdateReq + is_seed_menu + de_parent_id + 單測(沿用 DeleteReq/BatchDeleteReq)
    └── main.rs                             # +4 route(enforce_mw)

base-web/                                   (worktree rev2-admin-base-web)
├── src/service/api/
│   ├── rev2-system-manage.ts               # +fetchAddMenu/UpdateMenu/DeleteMenu/BatchDeleteMenu(request<null>)
│   └── index.ts                            # export *(既有,確認涵蓋)
└── src/views/manage/menu/
    ├── modules/menu-operate-modal.vue      # handleSubmit:259 接 add/edit(MODAL-WIRING ★)
    └── index.vue                           # handleDelete:191 / handleBatchDelete:184 接 delete/batchDelete(MODAL-WIRING ★)
```

**Structure Decision**: 既有 web 雙倉 worktree;**本波 rust-api + base-web 兩倉皆動**(對比 019 server-only)→ 收尾**兩段式 commit ×2 worktree**(rust-api + base-web push fork)+ 外層 SHA pin(鏡像 017)。

## Complexity Tracking

> Constitution Check 無「違反」,記錄兩處需理由的設計動作。

| 偏離 | 為何需要 | 較簡替代被否原因 |
|---|---|---|
| **parentId 彈性反序列化(number\|string\|null→Option<i64>)** | base-web 寫端 parentId 混型(grep R1 證:fresh top=number `0`、addChild/edit 從 read item 衍生=string)→ 單一固定型反序列化會對某半數情境失敗 | **固定 number**:edit/addChild(從 read wire string)送來會 deserialize error。**固定 string**:fresh add 的 number 0 會失敗。**改 base-web 統一送 string**:動 inline form 邏輯、超出 MODAL-WIRING「只改 `// request`」邊界、且 upstream 衝突風險。故 server 端彈性吸收最小擾動 |
| **getUserRoutes code 不動,D1 payoff 靠「編輯既有可見選單」驗** | getUserRoutes 已讀 sys_menu(019);編輯即時反映無需改 code。新選單因 D3(不碰 casbin)在 MenuAuth 前不可見 → 用「編輯既有可見選單(種子顯示欄)」證統一源 | **新增選單看 nav 出現**:需 020 寫 casbin 可見性(違 D3 + §I.2 分離 + Q1 MenuAuth 另開)。**改 getUserRoutes 邏輯**:無必要(已 DB-driven) |
