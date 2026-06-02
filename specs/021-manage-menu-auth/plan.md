# Implementation Plan: Menu Auth (per-role menu visibility + landing home)

**Branch**: `021-manage-menu-auth` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-manage-menu-auth/spec.md`

## Summary

角色管理頁 `menu-auth-modal` 的 **MenuAuth**:維運者(Super)runtime 編輯「**哪角色看哪選單**」(改既有 Casbin menu-visibility policy `(p, role_code, route_name, 'menu')`)+ 設「**角色落地頁 home**」(per-role)。變更**即時反映**於該角色 getUserRoutes/nav(無重啟、getUserRoutes 過濾邏輯不改)、**跨實例一致**(redis pub-sub `casbin:policy:invalidate`,實現 DESIGN §6.3 / Phase 3 #3)。閉合 menu arc(019 讀→020 寫→**021 可見性指派**)、解 020「新選單指派可見性前不顯 nav」缺口(D1 完整 payoff)。技術途徑:① migration `m..021`(ALTER sys_role **+home** varchar null·seed 回填 `'home'` + casbin write-policy seed 4 行 R_SUPER)② facade `sys_menu` 擴 id↔route_name 對映(`route_names_for_ids`/`ids_for_route_names`,active-only)+ `sys_role` 擴 `update_role_home`(§I.6 成對)+ `sys_user_role.roles_for_user` **加 `ORDER BY role_id ASC`**(現無序→per-role home 取第一 active 角色確定序)③ menu-auth policy 寫路徑(`enforcer.write()` + before 快照 + `remove_filtered_policy(0,[role,"","menu"])`〔空=wildcard、只清 menu 列〕+ `add_policies` + 011 audit + PUBLISH;stock adapter MgmtApi、**不 fork**)④ redis subscriber(boot tokio::spawn、獨立 pubsub 連線、SUBSCRIBE→`load_policy`)⑤ handler 4 寫/讀端(roleId 彈性→i64 查 sys_role.**code**、menuIds id[]↔route_name、自鎖 guard〔R_SUPER 須留 manage_menu〕、業務錯誤 2222)⑥ getUserRoutes home 由寫死 `"home"` 改取角色 home ⑦ base-web `rev2-system-manage.ts` +4 fetch fn + MODAL-WIRING 接 menu-auth-modal 4 placeholder。**無新建表**(ALTER sys_role +home,審計欄 018 已備);**+1 direct dep `tokio-stream`**(消費 redis pubsub Stream、已在 Cargo.lock transitive、實作期親決;見 Complexity Tracking);**不 fork sea-orm-adapter**(§11.6 → 無 amendment)。

## Technical Context

**Language/Version**: Rust(rust-api,sea-orm 1.1.20 / axum / casbin 2.20 / redis 1.2.1,MSRV 1.86)+ base-web(Vue 3,接線 only)。

**Primary Dependencies**: **+1 direct dep `tokio-stream`**(其餘全既有)。redis 1.2.1 async pubsub 僅給 `Stream` 介面(`PubSub::on_message()`),逐則收訊須 `StreamExt::next()`,而 `StreamExt` 來自 `tokio-stream`/`futures-util` —— 兩者已在 Cargo.lock transitive(`tokio-stream 0.1.18`)但非 server 直接相依。**實作期親決(2026-06-03)**:宣告 `tokio-stream` 為 direct dep(僅暴露既有 transitive crate、Cargo.lock 僅 +1 edge、無新編譯物),用標準全 async `on_message().next()` 迴圈(較 sync-pubsub+mpsc 橋接簡潔)。故原研究/規劃假設的「無新 crate/dep」**修正為 +1 dep(見 Complexity Tracking)**。其餘既有:casbin 2.20 MgmtApi `remove_filtered_policy`/`add_policies`/`get_filtered_policy` + auto_save、redis 1.2.1 ConnectionManager〔consuming 現 dead_code AppState.redis〕+ pubsub、011 mutate/audit、013 enforce、015 ctx operator、016 sys_role +home pattern、019/020 sys_menu。

**Storage**: PostgreSQL(`sys_role` **ALTER +home varchar null**〔不建表〕;`casbin_rule` menu 列 runtime 增刪〔010 既有 9 行起始 seed〕+ seed 4 行 write policy;migration 010 menu policy / 019 read / 020 write policy **不動**)+ Redis(pub-sub channel `casbin:policy:invalidate`)。

**Testing**: `cargo test -p server`(純函式單測:id↔route_name 對映 / `roles_for_user_ordered` 取序〔role id ASC〕/ 自鎖 guard 判定〔R_SUPER 須留 manage_menu〕/ `update_role_home_query` SQL-build〔Home + current_timestamp + updated_by §I.6 成對〕)+ entity_access_lint + xdb;wiring/形狀/policy 即時反映/redis reload 類由 `contracts/verification-commands.md` C-V(curl + psql + CDP `:21080`)覆蓋。

**Target Platform**: Linux docker(dev/prod compose);base-web 經 front-nginx `/api`。

**Project Type**: web(rust-api backend **policy 寫路徑 + redis subscriber + getUserRoutes home** + base-web frontend **menu-auth-modal 接線**)— 兩倉(鏡像 020)。

**Performance Goals**: 小型 admin RBAC、無特定吞吐目標;policy 編輯低頻(維運操作);redis reload 為輕量 load_policy。

**Constraints**: 無新 crate/dep;handler/route 零 `entity::`(009 lint);**policy v0 用 role code 非 id**(roleId→查 sys_role.code);**`remove_filtered_policy` 空字串=wildcard、只清 role 的 v2='menu' 列**(impl 跑一次確認、不碰 endpoint policy);**home = route name(LastLevelRouteKey)非 page key**(R6);**roles_for_user 須加 ORDER BY role_id ASC**(現無序);**自鎖防護**(R_SUPER updateRoleMenu 須留 manage_menu→否則 2222);getUserRoutes menu 過濾邏輯不改;§I.6 成對審計(home update);migration 021 up→down→up 可逆。

**Scale/Scope**: 1 migration(021:ALTER +home + seed 4 write policy)+ facade(sys_menu 2 對映 fn + sys_role update_role_home + sys_user_role 加 ORDER BY)+ menu-auth policy 寫路徑(set_role_menu/get_role_menu_route_names)+ redis policy_watcher + 4 handler + 3 DTO + getUserRoutes home 改 1 處 + 4 route + base-web wrapper 4 fn + menu-auth-modal 4 placeholder。跨 feature ripple:010 menu policy(加 runtime 增刪)+ getUserRoutes(home per-role)+ AppState.redis(啟用)+ MODAL-WIRING ★(base-web)。

## Constitution Check

*GATE:Phase 0 前必過、Phase 1 後 re-check。對照 `.specify/memory/constitution.md` **v1.2.2**。*

| # | 檢查 | 結論 |
|---|---|---|
| 1 | §I.1 base-web 為權威:rust 是否提供 base-web 用到的對應 endpoint? | **PASS** — getRoleMenu/updateRoleMenu/getRoleHome/updateRoleHome 全對齊 `menu-auth-modal` 4 placeholder(getChecks/handleSubmit/getHome/updateHome) |
| 2 | 動 base-web inline?屬哪條 ★ 軌道、邊界內? | **PASS** — MODAL-WIRING ★(`menu-auth-modal.vue` getChecks/handleSubmit/getHome/updateHome,只改 `// request` 行)+ BASE-WEB-WRAPPER(`rev2-system-manage.ts` +4 fn,新檔)。v1.2.0 邊界含 `views/manage/role/**` modal → **授權內** |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **PASS(本 feature 即落實此條)** — 021 = runtime 編輯該 menu-visibility policy;getUserRoutes 仍 Casbin enforce 過濾、**過濾邏輯不改**(只改 home 來源) |
| 4 | wire 對齊 §I.3 mock? | **PASS** — roleId 彈性(number\|string→i64,沿 020 de_parent_id)、menuIds=number[](對齊 MenuTree.id number)、home=string(route name)、業務碼 **2222**(業務驗證、非 5xxx 授權)、envelope `{data,code,msg}` |
| 5 | 從 rev1 拷貝 code?(§I.5) | **PASS** — 全新寫 / 沿 016 sys_role +home + 011 audit + 013 enforce + casbin stock MgmtApi,未拷 rev1 |
| 6 | 凍結到 §II 拍板?任一拍板需改→先 Amendment | **PASS(無需 amendment)** — **§11.6 sea-orm-adapter=copy 守住**:方案 1 用 **stock adapter** 的 `remove_filtered_policy`/`add_policies`(MgmtApi)runtime 改 policy,**不 fork、不改 adapter source** → 無 §11.6 amendment;§11.3 MODAL-WIRING 啟用(menu-auth-modal)、§11.7 dynamic route mode 不變、§11.10 wire(id string)不變 |
| 7 | 觸 §III ★ 軌道?邊界內? | **PASS** — MODAL-WIRING ★(只改 `// request` placeholder、每處 spec 記)+ BASE-WEB-WRAPPER(rev2- 前綴新檔)→ 皆授權邊界內 |
| 8 | 新建業務表(create migration)含 §I.6 6 審計欄? | **N/A** — 021 **不建表**(ALTER sys_role **+home** business 欄,sys_role 6 審計欄 016/018 create-time 已備);home 編輯成對寫 §I.6(`updated_at`+`updated_by`,operator 由 015 ctx) |

**結論:§IV 8/8 PASS,無需 Amendment**(casbin runtime policy 編輯〔stock adapter〕+ redis pub-sub 啟用 + getUserRoutes home per-role + roles_for_user 加序 記入 Complexity Tracking)。

## Project Structure

### Documentation (this feature)
```text
specs/021-manage-menu-auth/
├── plan.md              # 本檔
├── research.md          # Phase 0(7-cluster grep 實證:home 寫死/roles 無序/wildcard/auto_save/redis/migration 號/policy 形)
├── data-model.md        # Phase 1(sys_role +home/casbin runtime/facade 對映/handler/wire 三端/role_code↔id)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V acceptance(即時反映 + redis reload + 自鎖 + home + 回歸 + migration 可逆 + CDP)
└── checklists/requirements.md     # spec 品質 checklist
```

### Source Code(實際觸及檔,rust-api + base-web 兩倉)
```text
rust-api/                                   (worktree rev2-admin-rust-api)
├── migration/src/
│   ├── m20260529_000021_*.rs               # 新(ALTER sys_role +home·seed 'home' + casbin R_SUPER 4 行 write policy;down drop home + 精準刪 4 行)
│   └── lib.rs                              # append(000020 之後)
└── server/src/
    ├── model/facade/sys_menu.rs            # 擴 route_names_for_ids/ids_for_route_names(active-only 對映 + 單測)
    ├── model/facade/sys_role.rs            # 擴 update_role_home_query/update_role_home(§I.6 成對 + 單測);find_active_by_id Model 含 home
    ├── model/facade/sys_user_role.rs       # roles_for_user 加 ORDER BY role_id ASC(或 roles_for_user_ordered + 取序單測)
    ├── auth/menu_auth.rs (或 handler 內)    # set_role_menu(write+快照+remove_filtered+add_policies+audit+publish) / get_role_menu_route_names + 自鎖 guard + 單測
    ├── auth/policy_watcher.rs (或 infra)    # spawn_policy_watcher(獨立 pubsub 連線 SUBSCRIBE→load_policy)+ publish_policy_invalidate
    ├── handler/system_manage.rs            # +get_role_menu/update_role_menu/get_role_home/update_role_home + RoleIdReq/RoleMenuReq/RoleHomeReq + 自鎖 guard
    ├── handler/route.rs                    # getUserRoutes home:寫死 "home"→取 roles_for_user_ordered 第一 active 角色 sys_role.home(None→'home');menu 過濾不改
    └── main.rs                             # +4 route(enforce_mw)+ boot spawn policy_watcher

base-web/                                   (worktree rev2-admin-base-web)
├── src/service/api/
│   └── rev2-system-manage.ts               # +fetchGetRoleMenu/UpdateRoleMenu/GetRoleHome/UpdateRoleHome
└── src/views/manage/role/modules/
    └── menu-auth-modal.vue                 # getChecks/handleSubmit/getHome/updateHome 接 4 placeholder(MODAL-WIRING ★,只改 `// request`)
```

**Structure Decision**: 既有 web 雙倉 worktree;**本波 rust-api + base-web 兩倉皆動**(鏡像 020)→ 收尾**兩段式 commit ×2 worktree**(rust-api + base-web push fork)+ 外層 SHA pin。

## Complexity Tracking

> Constitution Check 無「違反」,記錄四處需理由的設計動作。

| 偏離 | 為何需要 | 較簡替代被否原因 |
|---|---|---|
| **casbin runtime policy 編輯(remove_filtered + add_policies,非 migration seed)** | MenuAuth 本質 = 維運者 runtime 改「角色×選單可見性」;migration 是 build-time、無法滿足 runtime 編輯 | **migration 改 policy**:每次調整需 redeploy、違反「即時反映」核心需求。**自建 policy 表 + 旁路 enforcer**:違 §I.2(menu 走 Casbin enforce)、且與 010 既有 menu policy 機制分裂 |
| **stock adapter MgmtApi(不 fork sea-orm-adapter)** | §11.6 拍板 sea-orm-adapter=copy(fork 需 amendment);方案 1 用 stock `remove_filtered_policy`/`add_policies` 即足、避開 amendment | **fork adapter 加批次/客製 API**:觸 §11.6 amendment 流程、增維護面;stock MgmtApi 已涵蓋 remove-by-filter + batch add，無需 fork |
| **redis pub-sub policy_watcher 啟用(消費 dead_code AppState.redis)** | 多實例下單 enforcer in-place 改不通知他實例 → 需 pub-sub 廣播 invalidate→各實例 load_policy;實現 DESIGN §6.3「v1 即啟用」/ Phase 3 #3 | **不做 pub-sub**:留多實例 policy 不一致風險、AppState.redis 續 dead_code、Phase 3 #3 未閉;DESIGN §6.3 已定 v1 啟用 |
| **getUserRoutes home per-role(改寫死 "home")+ roles_for_user 加 ORDER BY** | US2 per-role home 須取「第一 active 角色」的 home;現 `roles_for_user` 無 ORDER BY(取序不定)、home 寫死 `"home"`(route.rs) | **home 全域單值**:無法 per-role(US2 否)。**不加 ORDER BY**:multi-role 用戶取哪角色 home 不定→非確定行為;ORDER BY role_id ASC 給確定優先序(M4 親決) |
| **+1 direct dep `tokio-stream`(原規劃「無新 crate/dep」之偏離)** | redis 1.2.1 async pubsub 只給 `Stream` 介面,逐則收訊須 `StreamExt::next()`;`StreamExt` 在 `tokio-stream`/`futures-util`、已是 Cargo.lock transitive(0.1.18)但非 server 直接相依。宣告為 direct 僅暴露既有 crate(Cargo.lock 僅 +1 edge、無新編譯物),換取標準全 async pubsub 迴圈 | **不加 dep、sync pubsub + tokio mpsc 橋接**:可行且零 dep,但多一背景 thread + channel 接線、較複雜;**手動 poll Stream**:仍需 `futures_core::Stream` trait import(同屬新 dep)。實作期親決(2026-06-03)取 tokio-stream 一行(程式最簡);因非新解析 crate、§3「新 crate ⇒ prod image build」未嚴格觸發,惟 T014 仍跑 prod build de-risk(綠) |
