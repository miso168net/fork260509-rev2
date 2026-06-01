# Implementation Plan: Manage Role Write (CRUD)

**Branch**: `018-manage-role-write` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-manage-role-write/spec.md`

## Summary

角色管理頁寫端 CRUD(addRole/updateRole/deleteRole/batchDeleteRole,Super-only),把 016 唯讀 list 閉成完整 CRUD。鏡像 017 user 寫端骨架(facade `mutate_in_txn` + audit、handler Res、casbin Super-only seed、base-web MODAL-WIRING 接線)。**新增 / 偏離 017 之處**:① sys_role schema retrofit(業務欄 role_desc/status + §I.6 審計 5 欄,無 BIGSERIAL retrofit)② 種子角色保護(id 1-3 不可刪/停用、可改 name·desc)③ **status enforce 即時** —— 經 plan research 發現 `enforce_mw` 讀 token `claims.roles`(非 DB),為達 clarify Q1/Q3「即時不授權」,**改 enforce_mw 走 `roles_for_user` DB-fresh 有效角色(B 決策)**,realizes「有效角色集一處 filter 處處生效」④ D5 審計時間源全 DB-side(`update_*` 改 col_expr + 重查,順帶校正 017 `update_user`)。技術途徑:roles 取用共同來源新增 `find_active_enabled`(deleted_at IS NULL AND status=1),enforce/getUserInfo/menu/getAllRoles/replace_roles 改吃之;getRoleList 維持 find_active(顯停用)。

## Technical Context

**Language/Version**: Rust(rust-api,sea-orm 1.1.20 / axum / casbin 2.20 / argon2,MSRV 1.86)+ TypeScript/Vue 3(base-web)

**Primary Dependencies**: **無新增**(sea-orm `Expr`·`small_integer`、argon2、011 audit `mutate_in_txn`、015 request-context、013 enforce/jwt、casbin — 全既有)

**Storage**: PostgreSQL(`sys_role` ALTER +7 欄;`casbin_rule` seed 4 行;`sys_operation_log` 審計)

**Testing**: `cargo test -p server`(純函式單測:`is_seed_role_id` / `find_active_enabled` SQL / enum / facade SQL-build)+ entity_access_lint + xdb;wiring/形狀類由 `contracts/verification-commands.md` C-V(CDP `:21080` + curl + psql)覆蓋

**Target Platform**: Linux docker(dev/prod compose);base-web 經 front-nginx `/api`

**Project Type**: web(rust-api backend + base-web frontend,worktree+submodule 雙倉)

**Performance Goals**: 小型 admin RBAC、無特定吞吐目標;**B 後 enforce 每受保護請求 +1 次角色查詢**(2 個 indexed query,廉價、可接受)

**Constraints**: 無新 crate/dep;handler 零 `entity::` token(009 lint);roleCode immutable;業務違反一律 2222;server-first(rust-api 先、base-web 後);migration up→down→up 可逆

**Scale/Scope**: 4 寫端 + 1 alter migration + 1 seed migration + facade 5 fn + enforce_mw 改 + D5 校正 017 + base-web 接線(4 fetch fn + 3 placeholder)。跨 feature ripple:013/014/015/016/017。

## Constitution Check

*GATE:Phase 0 前必過、Phase 1 後 re-check。對照 `.specify/memory/constitution.md` **v1.2.1**。*

| # | 檢查 | 結論 |
|---|---|---|
| 1 | §I.1 base-web 為權威:rust 是否提供 base-web 用到的對應 endpoint? | **PASS** — addRole/updateRole/deleteRole/batchDeleteRole 對齊 base-web role 管理頁既有控制項 |
| 2 | 動 base-web inline?屬哪條 ★ 軌道、邊界內? | **PASS** — MODAL-WIRING ★(§III.2 v1.2.0 含 `views/manage/**` + index.vue delete)接 3 placeholder + BASE-WEB-WRAPPER(`rev2-system-manage.ts` 新檔 4 fn)。僅改 `// request` 一行、不改 form/typing |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **PASS/N-A** — role 寫端非 menu;且 B 改 enforce_mw 走 DB 有效角色,menu(014)過濾仍 Casbin enforce、即時性提升、不破 §I.2 |
| 4 | wire 對齊 §I.3 mock? | **PASS** — envelope `{data,code,msg}`、`code` string、**id=string**(§I.3 v1.2.1,number↔string type-lie 決定不修)、業務錯誤 2222、enum status 1/2 |
| 5 | 從 rev1 拷貝 code?(§I.5) | **PASS** — 全新寫 / mirror 017,未拷 rev1 |
| 6 | 凍結到 §II 12 拍板?任一拍板需改→先 Amendment | **PASS(無需 amendment)** — **B 改 enforce_mw 取角色源(claims→DB)不在 12 拍板內**(§11.6 只定 axum-casbin 中介層存在、§11.7 dynamic route mode、§11.10 wire;無「enforce 取角色=claims」凍結項)。013 D4「stateless refresh」屬 feature-level deviation、非 constitution。見 Complexity Tracking |
| 7 | 觸 §III ★ 軌道?邊界內? | **PASS** — MODAL-WIRING ★(v1.2.0 含 index.vue delete,授權內)+ BASE-WEB-WRAPPER(新檔);每處 spec 記 file:line(見 research R6) |
| 8 | 新建業務表(create migration)含 §I.6 6 審計欄? | **PASS** — 018 **非建新表**,是 ALTER sys_role 補 §I.6 審計欄(retrofit,§I.6「既有表缺口由 retrofit feature 補」forward-only 紀律)。補齊 created_at/created_by/updated_at/updated_by/deleted_by(deleted_at 009 已有)→ 對齊 §I.6 成對寫入。join/append-only N-A |

**結論:§IV 8/8 PASS,無需 Amendment**(B 的 013 enforce 改動記入 Complexity Tracking)。

## Project Structure

### Documentation (this feature)
```text
specs/018-manage-role-write/
├── plan.md              # 本檔
├── research.md          # Phase 0(R0 B 決策 + R1-R6)
├── data-model.md        # Phase 1(entity/effective-set/casbin/wire 三端)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V acceptance
└── checklists/requirements.md     # spec 品質 checklist
```

### Source Code(實際觸及檔)
```text
rust-api/                                   (worktree rev2-admin-rust-api)
├── entity/src/sys_role.rs                  # +7 欄(role_desc/status/§I.6 5)
├── migration/src/
│   ├── m20260529_0000XX_alter_sys_role_business_audit.rs   # 新(無 BIGSERIAL retrofit)
│   ├── m20260529_0000YY_seed_write_role_policy.rs          # 新(casbin 4 行 R_SUPER)
│   └── lib.rs                              # 兩處 append(alter 在 seed 前)
└── server/src/
    ├── model/facade/sys_role.rs            # +find_active_by_id/find_active_enabled/create_role/update_role/soft_delete + AuditSerialize
    ├── model/facade/sys_user_role.rs       # roles_for_user(s)/roles_by_codes_query → find_active_enabled
    ├── model/facade/sys_user.rs            # update_user updated_at/by 改 col_expr+重查(D5)
    ├── auth/enforce.rs                      # ★ enforce_mw:claims.roles → roles_for_user DB-fresh(B)
    ├── handler/system_manage.rs            # +4 role handler + is_seed_role_id;role_item 吃真值
    └── main.rs                              # +4 route(enforce_mw)

base-web/                                   (worktree rev2-admin-base-web)
├── src/service/api/rev2-system-manage.ts   # +fetchAddRole/UpdateRole/DeleteRole/BatchDeleteRole
└── src/views/manage/role/
    ├── index.vue                           # handleDelete/handleBatchDelete 接線(+import)
    └── modules/role-operate-drawer.vue     # handleSubmit add/edit 接線(+import)
```

**Structure Decision**: 既有 web(rust-api + base-web)雙倉 worktree;兩段式 commit(worktree push fork → 外層 SHA pin)。server-first。

## Complexity Tracking

> 填:Constitution Check 無「違反」,但 B 決策對既有 013 是顯著架構偏離,記錄理由。

| 偏離 | 為何需要 | 較簡替代被否原因 |
|---|---|---|
| **改 enforce_mw:JWT claims.roles → 每請求 DB `roles_for_user`(B)** | clarify Q1/Q3 要「停用/刪角色即時不授權」;research 證實 enforce_mw 讀 token 快照(陳舊窗最壞 refresh 7d),不改則「即時」不可達 | **A**(對齊現 token 模型、等下次登入清):user 否決,達不到即時。**C**(status 純顯示不 enforce):user 否決,丟 D3。**token role-version**:更複雜、仍非每請求即時 |
| **校正 017 `update_user` 時間源(app-side now() → DB col_expr,D5)** | spec FR-007/SC-011 要稽核時間源一致;017 現 created=DB / updated=app 混用 | 維持 017 現狀:不一致未解(spec 目標未達);僅修 018 不修 017:整碼仍不一致 |
| **enforce 每請求 +1 DB 查詢**(B 副作用) | 真即時授權必要成本 | 小型 admin、查詢 indexed 廉價;cache/版本機制複雜度不值 |
