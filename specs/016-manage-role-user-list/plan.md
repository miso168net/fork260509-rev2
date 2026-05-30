# Implementation Plan: manage-role-user-list

**Branch**: `016-manage-role-user-list` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-manage-role-user-list/spec.md`

**Brainstorm**: [`docs/superpowers/016-manage-role-user-list.md`](../../docs/superpowers/016-manage-role-user-list.md)（Phase 0，D1-D14 凍結）

---

## Summary

rev2 第 16 個 feature、**Phase 4 主流業務第一刀**。落地 base-web manage 頁的 **3 條 read endpoint**:`getRoleList`（分頁 + 搜尋）/ `getUserList`（分頁 + 搜尋 + userRoles join、取代 013 stub）/ `getAllRoles`（不分頁輕量）。補齊 `sys_role`/`sys_user` 的 manage 顯示欄位（role:description/status/時間;user:status/gender/phone/email/時間,**status/gender = VARCHAR '1'/'2'** 對齊 base-web）。3 條都掛 Casbin `enforce_mw`（Phase 3 #5「真實受保護路由」首批,m..015 seed getRoleList/getAllRoles policy)。**id wire = number**（constitution v1.1.0 amend、base-web typing 權威）。立「分頁 facade + Output DTO + From<Entity> + enforce 掛路由」pattern 供 017 menu 沿用。**menu 三件 / 寫入 / operator 歸屬 / avatar / domain = scope 外**。

---

## Technical Context

**Language/Version**:Rust 1.86（既有 rust-api workspace）。

**Primary Dependencies**:**無新 workspace crate、無新 dep**。重用 sea-orm 1.1.20（`PaginatorTrait` 分頁 + `ColumnTrait::contains/eq` LIKE/等值,皆內建)、**008** `Res<T>`、**009** soft-delete `find_active` + entity-access lint、**013** `enforce_mw`/jwt/bearer、`sys_user_role::roles_for_user`（userRoles join）。

**Storage**:Postgres `sys_role`/`sys_user` alter 補欄（VARCHAR status/gender + 時間欄）+ casbin_rule seed（m..015）。**無新表**。migration `m..013`/`m..014`/`m..015`,經 010 自動套。只回 active（009）。

**Testing**:
- **純單測 test-first**:filter SQL-build（LIKE/eq/limit/offset/count、沿 011/015 模式）、size clamp、空參數略過、DTO 映射（id=number/status 字串/operator null）、**UserItem 不含 password**。
- **活體 acceptance（C-V）**:[contracts/verification-commands.md](./contracts/verification-commands.md)（§0 守恆+prod build / §1 補欄+seed / §2 getRoleList / §3 getUserList+no-password / §4 getAllRoles / §5 enforce / §6 size clamp）。**無 CDP**（純後端 read）。

**Target Platform**:容器（dev/prod docker stack;migration 經 010 自動套）。

**Project Type**:後端 web service（rust-api）。**不動 base-web、無外層 deploy 改動**（與 015 不同、純 rust-api worktree）。

**Performance Goals**（對應 SC）:分頁清單 + 搜尋（SC-001/002/003）/ enforce 授權（SC-004）/ 只回 active + 分頁契約（SC-005）/ id+enum 型對齊（SC-006）/ 既有不破（SC-007）。**admin panel 低流量、最小機制**;userRoles N+1 join 先沿用（標 follow-up 批次優化）。

**Constraints**:
- 守 **008 envelope** + **009 entity-access lint**（role/user 查詢只經 facade）+ **007 FR-009**（migration 經 010、server 不自動 migrate）+ **soft-delete**（只回 active）。
- **password 不洩漏**（list DTO 無 password、facade 投影排除）。
- **id wire = number**（constitution v1.1.0 §I.3/§11.10）。
- SQL injection 紀律（CHECKLIST §5.10、全參數化)。

**Scale/Scope**:rust-api 改動 = 2 alter migration + 1 seed migration + 2 entity 補欄 + 3 facade 擴充（sys_role/sys_user list+all、sys_user_role 重用）+ `handler/system_manage.rs`（新、3 handler + DTO）+ main.rs（3 route 掛 enforce、移 013 stub）+ 刪 auth.rs stub。**無新 crate/dep、不動 base-web、無外層 deploy 改動**。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution **v1.1.0**](../../.specify/memory/constitution.md)（本 feature 觸發 amend、見下 §6）:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **對齊** — 落地 base-web 既呼叫的 getRoleList/getUserList/getAllRoles 3 endpoint、wire shape 對齊 typings（分頁/欄位/型）。**正是補齊 base-web 需求** | ✅ Pass |
| 2 | 動到 base-web inline? | **否** — 純 rust-api;base-web service 層既有、wire 對齊即可、**完全不動 base-web** | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **N/A**（本 feature 無 menu;3 endpoint 走 endpoint-level enforce〔v2=method〕、非 menu domain） | ✅ Pass |
| 4 | wire 對齊 §I.3 mock?(envelope/id 型/error code/enum) | **對齊** — envelope `Res<T>`、分頁 `{records,current,size,total}`、status/gender `'1'/'2'`、enforce deny `5003`、**id=number（§I.3 v1.1.0 amend、base-web typing 權威）** | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | **否** — facade/handler/migration **全新寫**;rev1 rust-api schema 僅**型/命名交叉參照**（**user 授權破 §I.5**、隔離抽純欄位事實、未拷 code、未讀 rev1 設計、見 Deviation D-2） | ⚠️ Pass（user 授權例外） |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | **§11.10 已 amend**（id string→number、v1.1.0、user 拍板 + 獨立 commit e2da9c3）;其餘拍板不撤回 | ✅ Pass（amend 完成） |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 不動 base-web → 不觸 MODAL-WIRING ★ / BASE-WEB-BUILD-CONFIG ★;僅 RUSTAPI-SOURCE-ISOLATION（§III.1 非★、全新寫對齊） | ✅ Pass |

**結論**:7 項全 PASS（#5 為 user 授權 §I.5 例外、#6 amend 已完成）。Complexity Tracking 不需填。

---

## Project Structure

### Documentation (this feature)

```text
specs/016-manage-role-user-list/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify（0 提問）
├── research.md          # Phase 0（R1-R10）
├── data-model.md        # Phase 1 — 補欄 + entity + DTO + facade + 接線
├── contracts/
│   └── verification-commands.md   # Phase 1（C-V §0-§6、無 CDP）
├── quickstart.md        # Phase 1
└── checklists/
    └── requirements.md  # /speckit-specify（全 PASS）
```

### Source Code（rust-api worktree;**不動 base-web、無外層改動**）

```text
rust-api/                                   ← worktree（code）
├── server/src/
│   ├── handler/system_manage.rs            ← 新:get_role_list/get_user_list/get_all_roles + Output DTO（id=number、camelCase、無 password）+ Query<SearchParams>
│   ├── handler/auth.rs                      ← 移除 UserListStub + get_user_list stub
│   ├── handler/mod.rs                       ← + pub mod system_manage
│   ├── model/facade/sys_role.rs            ← + list_paged（filter+分頁+count）+ all_active
│   ├── model/facade/sys_user.rs            ← + list_paged（filter+分頁+count、投影排除 password）
│   ├── model/facade/sys_user_role.rs       ← 重用 roles_for_user（getUserList 每列）
│   └── main.rs                             ← 3 route 掛 enforce_mw（route_layer）、移 013 getUserList stub route
├── entity/src/
│   ├── sys_role.rs                         ← + description/status/created_at/updated_at
│   └── sys_user.rs                         ← + status/gender/phone/email/created_at/updated_at
└── migration/src/
    ├── m20260529_000013_alter_sys_role.rs       ← 補欄
    ├── m20260529_000014_alter_sys_user.rs       ← 補欄
    ├── m20260529_000015_seed_manage_policy.rs   ← seed getRoleList/getAllRoles endpoint policy
    └── lib.rs                              ← 註冊 013/014/015
```

**Structure Decision**:純 **rust-api worktree source**（migration×3 + entity×2 + facade×3 + handler 新 + main + 刪 stub）。**無外層 deploy 改動**（與 015 不同;本 feature 無 Dockerfile/compose 變動）。故 commit = **worktree（code）push fork + 外層（spec docs + constitution amend + rust-api SHA pin）**（兩段式、**不動 base-web**）。**無新 workspace crate**（無 builder COPY 缺口）;沿用既有 sea-orm 分頁/LIKE。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 三 endpoint wire 形〔分頁 {records,current,size,total} / getAllRoles 純陣列〕/ R2 status·gender VARCHAR '1'/'2' / R3 補欄清單〔status default 護 seed〕/ R4 分頁+filter〔首次引入 sea-orm paginate/LIKE、立 pattern〕/ R5 userRoles join〔roles_for_user 重用、N+1 標 follow-up〕/ R6 password 洩漏防護〔list 投影排除〕/ R7 enforce 接線 + policy seed〔009 已 seed getUserList、m..015 補 getRoleList/getAllRoles〕/ R8 id=number〔constitution v1.1.0 amend〕/ R9 rev1 schema 交叉參照〔user 授權破 §I.5、隔離抽取〕/ R10 守恆 + 無新 dep）。

**結論**:10 項全解析、**0 NEEDS CLARIFICATION**。**§I.5 user 授權破例**（R9）。**無新 crate/dep**。**最高風險點**:(a) password 洩漏（list 投影排除）;(b) 首次 sea-orm 分頁+LIKE（立 pattern、無既有可抄）;(c) status NOT NULL 加欄 default 護既有 seed;(d) userRoles N+1（低流量先沿用、標 follow-up）;(e) id 型 amend（constitution v1.1.0 已改）。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— 3 migration（2 alter 補欄 + 1 seed policy）+ entity 補欄 + Output DTO（id=number、camelCase、無 password、operator null）+ Query 條件型 + facade 分頁查詢（SQL-build seam）+ handler/main 接線。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V §0-§6（守恆+prod build / 補欄+seed / getRoleList / getUserList+no-password / getAllRoles / enforce / size clamp）。
- [`quickstart.md`](./quickstart.md)—— Path A 純單測 / B 活體 / C prod build。

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑（對照 v1.1.0）:

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 對齊 — 落地 base-web 3 endpoint、wire 對齊 typings | ✅ Pass |
| 2 | 不動 base-web | ✅ Pass |
| 3 | N/A（endpoint enforce、非 menu domain） | ✅ Pass |
| 4 | envelope/分頁/status enum/5003/id=number 對齊 §I.3(v1.1.0) | ✅ Pass |
| 5 | 全新寫;rev1 schema 僅交叉參照（user 授權、隔離） | ✅ Pass |
| 6 | §11.10 amend 完成（v1.1.0）、其餘拍板不變 | ✅ Pass |
| 7 | 不動 base-web → 不觸 ★ 軌道 | ✅ Pass |

**結果**:7 項仍全 PASS。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

> **已知風險（非 violation、implement 時若觸發記 Deviation Log）**:
> - **password 洩漏**:`sys_user::find_active`/`list_paged` 回 raw Model 含 password;list DTO 必排除（facade `select_only` 投影或 handler 組 DTO 不取）。單測驗序列化無 "password"。
> - **status NOT NULL 加欄**:既有 3 seed user/role 須靠 column DEFAULT '1' 補（否則 ALTER 炸);acceptance §1 驗 seed status='1'。
> - **首次 sea-orm 分頁/LIKE**:無既有可抄、立 pattern;SQL-build 單測鎖 limit/offset/count/LIKE。
> - **userRoles N+1**:每 user 兩 query;admin 低流量先沿用、標 follow-up（批次 join 優化）。
> - **updated_at/createBy/updateBy wire null**:base-web typing 是非 nullable string、016 無值回 null;若 base-web 嚴格需 string 再走 BASE-WEB-ADAPT 補（實測表格容 null）。

---

## Deviation Log（Constitution §V — implement/plan 階段實際偏離處）

- **D-1（id wire 型 string→number、constitution amend v1.1.0）**:brainstorm D5 拍 number,與 constitution §I.3/§11.10 凍結 string 衝突。**處置**:依 §V.2 user 親決 + 獨立 amendment commit `e2da9c3`（§I.3 + §11.10 改 number、bump v1.1.0、回填 DESIGN §11.10）。理由:base-web TS typing（number）為 §I.1 權威、mock string 是 quirk、實測無硬依賴 string、改 number 更忠於 §I.1 且免動 base-web。`MenuRoute.id` 維持 string、`getUserInfo.userId` 維持 string（不受影響）。
- **D-2（schema 補欄參照 rev1 rust-api、破 §I.5）**:constitution §I.5「spec phase 0 research 不准 grep rev1 source」。**處置**:2026-05-30 user 親授權參照 rev1 rust-api（rust-only 最終形）的 sys_role/sys_user schema 當型/命名交叉參照;以**隔離 subagent 抽純欄位事實**（未讀 rev1 設計文件、未拷 code、未污染 context）。base-web typings 仍為 wire 權威、rev2 自身 pattern 為建表權威、rev2 偏離 rev1（id i64 非 TEXT、status/gender VARCHAR 非 enum、不補 domain/operator 欄）。spec/plan 評估 §I.5 是否需 amendment 加「rev1 rust-api schema 交叉參照」carve-out（暫以 Deviation 記、未動 §I.5）。
- **D-3（operator 欄 + status/gender DB 值域約束折 Phase 4 A）**:016 不補 `created_by`/`updated_by`（wire `createBy`/`updateBy` 回 null）、status/gender 用 VARCHAR 無 DB CHECK 約束（靠 default + app 保證）。**處置**:operator 歸屬與資料變動 audit（Phase 4 A、sys_operation_log operator）同期做;status/gender 的 DB 層 CHECK/enum 約束亦折該期（016 維持最小、對齊 wire 字串值）。
