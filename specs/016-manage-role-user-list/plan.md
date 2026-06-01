# Implementation Plan: 016-manage-role-user-list

**Branch**: `016-manage-role-user-list` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-manage-role-user-list/spec.md`(源自凍結 brainstorm [`docs/superpowers/016-manage-role-user-list.md`](../../docs/superpowers/016-manage-role-user-list.md) D1–D12)

## Summary

落地 base-web 系統管理頁實際呼叫的 **3 條唯讀 systemManage endpoint** —— `getUserList`(分頁)/ `getRoleList`(分頁)/ `getAllRoles`(全量),對齊 base-web mock wire(§I.1/§I.3)。**不動業務資料表**:base-web 想顯示但 entity 無的欄(status/email/phone/gender/roleDesc/時間/operator)一律 DTO 回 `null`(D2);真正儲存這些 + §I.6 審計欄屬 Phase 4 write 那一波。對外識別碼 wire=**string**(i64 於 DTO 邊界轉,對齊凍結 §I.3);每頁 user 的 roles 以**批次** `roles_for_users` 取得(避 N+1,SC-006);三 endpoint 各掛 013 `enforce_mw` + 新 seed migration 補 Casbin policy(Super/Admin 可 list、User deny、getAllRoles 含 User)。技術決策見 [research.md](research.md);DTO/facade/migration 見 [data-model.md](data-model.md);驗收見 [contracts/verification-commands.md](contracts/verification-commands.md)。

## Technical Context

**Language/Version**: Rust **1.86**(MSRV `rust-toolchain.toml`)

**Primary Dependencies**: axum 0.7 + sea-orm 1.1.20(**首次用 `PaginatorTrait` 分頁**,R1)+ tokio + Postgres。**無新外部 dep / 無新 workspace crate**。承接:008 `Res<T>`、013 `enforce_mw`/jwt/bearer、009 `find_active`/entity-access lint、011 facade 唯一管道、010 migration 自動套、015 ctx_mw(不動)。

**Storage**: PostgreSQL。**不建/不 alter 業務表**;唯一 migration = `m20260529_000013_seed_manage_policy`(只 seed casbin_rule policy、經 010 自動套、server 不自動 migrate)。

**Testing**: 純單測(no-DB:DTO 映射 / 分頁正規化 / filter SQL-build)+ in-crate `#[ignore]` live-DB(env-gate `DATABASE_URL`,放 `facade/`)+ dev stack curl/psql 活體 + **一條 CDP 列表顯示**(端到端價值,dev vite proxy)。**無新 crate/dep → prod image build 非強制**(可選 sanity)。

**Target Platform**: Linux container(`rust-api` service)

**Project Type**: backend web-service(rust-api 單一 worktree;**不動 base-web**)

**Performance Goals**: admin panel 低流量;列表查詢固定 query 數(count 1 + page 1 + roles 批次 1 = 3,不隨頁筆數增長,SC-006)。

**Constraints**: 缺欄回 null(D2、不動表);id wire=string(R6);size clamp max 100(D5);只回 active(D8);無 password 入 wire(D9);無新 crate/dep。

**Scale/Scope**: 3 GET endpoint + 4 facade fn(2 分頁 + 1 全量 + 1 批次 roles)+ 1 handler 檔 + 1 seed migration + main.rs route 改;移除 013 getUserList stub。

## Constitution Check

*GATE:Phase 0 前必過;Phase 1 後 re-check。對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.1.0 §IV 8 項**。*

| # | 檢查 | 結果 |
|---|---|---|
| 1 | **§I.1 base-web 為權威**:rust-api 是否未提供 base-web 用到的對應 endpoint? | ✅ PASS — 016 落地 base-web `system-manage.ts` 既有的 getUserList/getRoleList/getAllRoles 三條 read endpoint,**填補既有缺口**(getUserList 從 013 stub 換真實);wire shape 對齊 base-web typings(§I.3)。 |
| 2 | **§I.2 menu 顯示走 Casbin enforce?** | ✅ N/A — 016 不觸 menu 可見性(014 已做)。本 feature 的 endpoint 授權走 013 `enforce_mw`(act=GET),與 menu 可見度(act=menu)是不同 domain、共表共存。 |
| 3 | **§I.3 wire 對齊 mock ground truth?** | ✅ PASS — envelope `{data,code,msg}` code=string(008)、pagination `{current,size,total,records}` 無 pages/success、**id=string**(R6)、status `Option`(nullable,符 base-web `EnableStatus\|null`)、camelCase、userRoles=role code 陣列。皆對齊 base-web typings + MOCK-COVERAGE-AUDIT(R5)。 |
| 4 | **§I.4 SDD+TDD 工作流?** | ✅ PASS — 走設計鏈;純函式(DTO 映射 / 分頁正規化 / filter SQL-build)test-first,wiring(handler/route)由 curl+psql+CDP acceptance 覆蓋。 |
| 5 | **§I.5 從 rev1 拷貝 code?屬例外?** | ✅ PASS — **零 rev1 參照**:採「不動表、缺欄回 null」(D2)故無 schema 設計需求、不需 rev1 schema 交叉參照;research 全 grep rev2 既有 + base-web。(明確不重蹈舊備份 rebase260531-016 破 §I.5 參照 rev1 補欄的路。) |
| 6 | **§II 12 拍板凍結?** | ✅ PASS — 不改任何 §II 拍板。**§11.10 id=string** 採凍結值 string(R6),**不偏離**(舊備份 rebase260531-016 曾 amend 成 number、留在備份分支未進 rev2-admin-root;本設計回歸當前凍結 string)。 |
| 7 | **§III ★ 軌道?在授權邊界?** | ✅ PASS — **只動 rust-api**(RUSTAPI-SOURCE-ISOLATION);**不動 base-web inline**(read endpoint、既有 service call 對齊即通)。不觸 MODAL-WIRING ★ / BASE-WEB-WRAPPER ★ / BASE-WEB-BUILD-CONFIG ★(皆寫端/menu 的事)。base-web `id:number` 型補正(BASE-WEB-ADAPT rev2-extra.d.ts)列 follow-up、非本 feature。 |
| 8 | **§I.6 新建業務表含 6 審計欄?append-only/join 表依例外?** | ✅ N/A — 016 **不建、不 alter 任何業務表**(D2 缺欄回 null)。唯一 migration `m..013_seed_manage_policy` 只 seed `casbin_rule`(policy 表、非業務主表)→ **不在 §I.6 業務表審計欄管轄範圍**。sys_user/sys_role 的審計欄 retrofit 留 Phase 4 write 那一波(CHECKLIST §2.18)。 |

**Gate 結果**:**8/8 PASS(含 #2/#8 N/A),無 violation、無需 Amendment、無 Complexity Tracking。**

## Project Structure

### Documentation (this feature)

```text
specs/016-manage-role-user-list/
├── plan.md              # 本檔
├── research.md          # Phase 0(R1-R9 決策,含親讀駁回 /api 幻覺)
├── data-model.md        # Phase 1(DTO + facade + seed migration + entity 不動)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V 合約(純單測 + curl/psql + CDP + 守恆)
└── tasks.md             # Phase 2(/speckit-tasks 產,本指令不建)
```

### Source Code (rust-api worktree;不動 base-web)

```text
rust-api/
├── migration/src/
│   ├── m20260529_000013_seed_manage_policy.rs   # 新(只 seed casbin policy、非業務表)
│   └── lib.rs                                    # 改:mod + migrations() 加 013
├── server/src/
│   ├── handler/
│   │   ├── system_manage.rs   # 新:get_user_list/get_role_list/get_all_roles + DTO(PageRes/UserItem/RoleItem/AllRoleItem)+ From<Model> 映射
│   │   ├── mod.rs             # 改:pub mod system_manage
│   │   └── auth.rs            # 改:移除 get_user_list stub + UserListStub(orphan)
│   ├── model/facade/
│   │   ├── sys_user.rs        # 改:加 list_active_paginated + UserListFilter
│   │   ├── sys_role.rs        # 改:加 list_active_paginated + list_active_all + RoleListFilter
│   │   └── sys_user_role.rs   # 改:加 roles_for_users(批次 IN,避 N+1)
│   └── main.rs                # 改:getUserList 改指 system_manage + 加 getRoleList/getAllRoles route(各掛 enforce_mw)
```

**Structure Decision**:單一 rust-api worktree、無新 crate。handler 進 `server/src/handler/system_manage.rs`(對齊 DESIGN §5.3「systemManage 路徑直接由 service 提供、router 表面 1:1 對齊 base-web」)。**兩段式 commit**(動 rust-api worktree → worktree commit+push fork + 外層 bump rust-api SHA pin;§4.1;不動 base-web、外層只 bump 一個 gitlink)。

## Design Notes(非 violation、供 implementer / review 對焦)

- **N-1 route path 無 `/api`(R3,親讀 + grep 確認)**:main.rs route 全部無 `/api` 前綴(`grep -c '"/api/'`=0,research workflow 並行確認一致);三 endpoint 用 `/systemManage/getXxx`,seed policy v1 同樣無 /api,與 009 既有 getUserList policy 一致、**無 enforce mismatch**。`/api` 僅是 base-web→front-nginx reverse proxy 層前綴(§11.11、nginx strip 後到 rust),rust 內部 route 一律不帶。
- **N-2 policy seed 分工(D7)**:016 隨 endpoint 補對應 policy(getRoleList×{SUPER,ADMIN}、getAllRoles×{SUPER,ADMIN,USER_COMMON});getUserList 009 已 seed、不重複(`ON CONFLICT DO NOTHING` 冪等)。Phase 3 #4 policy seed feature 退為「全路由 rollout + 矩陣治理」。R_SUPER 逐條(無 wildcard,沿 009)。
- **N-3 缺欄回 null 的 render 風險(R5)**:status/gender base-web typing 本就 `\|null` → 回 null 零型別風險;純文字欄 null 顯空、不 crash。CDP 驗收確認;若某欄令 base-web crash(預期不會)該欄改 `""`。
- **N-4 id i64→string 在 DTO 邊界(R6)**:entity/facade 全 i64,DTO `id.to_string()`(沿 013 `getUserInfo.userId` 先例)。DESIGN §1.5/§3.6 殘留 number = 待掃清矛盾,act on 凍結 string、不走 amendment。
- **N-5 roles 批次避 N+1(R7)**:新 `roles_for_users(&[i64])` 整頁一次 IN 查;既有單筆 `roles_for_user`(login/getUserInfo)保留。
- **N-6 排序 id DESC(R9)**:entity 無 created_at(D2 不補)→ 用 `id DESC` 穩定排序;補 created_at(write 那一波)可改。
- **N-7 無 password 入 wire(D9)**:UserItem 無 password 欄,handler 組 DTO 不取;單測斷言序列化無 `"password"`。
- **N-8 CDP defer**:本 feature 有一條 dev vite proxy CDP 列表顯示驗收(端到端價值);經 front-nginx 真實 `/api` 路徑的完整 prod-stack 端到端留 prod-stack CDP cluster(CHECKLIST §2.8 連動)。

## Complexity Tracking

> 無 Constitution violation → 本節空。
