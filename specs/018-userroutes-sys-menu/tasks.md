---

description: "Task list for 018-userroutes-sys-menu"
---

# Tasks: getUserRoutes 改讀 sys_menu(單一真相源)

**Input**: Design documents from `specs/018-userroutes-sys-menu/`
**Prerequisites**: [plan.md](./plan.md) / [spec.md](./spec.md) / [research.md](./research.md) / [data-model.md](./data-model.md) / [contracts/verification-commands.md](./contracts/verification-commands.md)
**Tests**: 純函式(`build_route_tree` / `filter_routes_for_roles`)走 **TDD test-first**(spec D8 / CLAUDE.md §3);wiring(handler / migration)由 acceptance 覆蓋。

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 可平行(不同檔、無未完依賴)
- **[Story]**: US1 / US2(對映 spec user stories)
- 路徑均為 rust-api worktree 內(短名 `rust-api/`)

---

## Phase 1: Setup

**Purpose**: 確認起點乾淨,改動前快照。

- [x] T001 確認 on branch `018-userroutes-sys-menu` + 改動前 baseline 綠:dev rust-api 容器跑 `cargo test -p server`(記錄 server 測數 ~112 基線)+ entity-access lint 17 綠

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 本 feature 建於既有 infra(sys_menu 表 / 013 enforcer / 014 menu policy / facade all_active 皆已存在),**無共享 scaffolding 任務**。

**Checkpoint**: 無 foundational 任務,直接進 user story。

---

## Phase 3: User Story 2 - 修 manage_user-detail seed 缺漏 (Priority: P2)

**Goal**: `sys_menu` 的 `manage_user-detail` 補 `component='view.manage_user-detail'` + `props:true`(route_ext),對齊 base-web 權威(R1/R2)。

**Independent Test**: 套 migration 後 `psql` 查 `manage_user-detail` → `component='view.manage_user-detail'` 且 `route_ext={"props": true}`(此前 component=NULL/route_ext=NULL)。

> **排序說明**:US2 雖 P2,但它是 **US1 live-acceptance 的硬前置**(US1 改讀 sys_menu;未修 seed 則 user-detail wire 會回歸)→ 故先做。US2 本身與 US1 的單元工作互不依賴。

### Implementation for User Story 2

- [x] T002 [US2] 寫 seed 修正 migration `rust-api/migration/src/m20260529_000018_fix_user_detail_seed.rs`:`up` = `UPDATE sys_menu SET component='view.manage_user-detail', route_ext='{"props": true}'::jsonb WHERE route_name='manage_user-detail'`;`down` = 還原 `component=NULL, route_ext=NULL`(data-model §2)
- [x] T003 [US2] 註冊 `m20260529_000018_fix_user_detail_seed` 進 `rust-api/migration/src/lib.rs`(`Migrator::migrations()` 尾端)
- [x] T004 [US2] dev stack `up` 自動套 m..018(010 機制),`psql` 驗 `manage_user-detail` component+route_ext 已修正(verification §1)

**Checkpoint**: seed 對齊 base-web,US1 live-acceptance 前置就緒。

---

## Phase 4: User Story 1 - getUserRoutes 改讀 sys_menu (Priority: P1) 🎯 MVP

**Goal**: `GET /route/getUserRoutes` 業務路由樹來源由 in-code `business_routes()` 改為讀 `sys_menu` 表(單一真相源);Casbin 角色過濾與 wire 形狀**逐項不變**。

**Independent Test**: curl 三角色 getUserRoutes,輸出對 014 merge baseline(`8965c8a`)**逐項相同 + 零 diff**(含 user-detail component/props,因 014 in-code 本就有)。

### Tests for User Story 1 (TDD — 先寫、確認 FAIL 再實作) ⚠️

- [x] T005 [US1] 寫 `build_route_tree` 純測(red)於 `rust-api/server/src/route/menu.rs` `#[cfg(test)]`:Model→MenuRoute 對映(`id`/`name`←route_name、`meta.title`←menu_name、`props`←route_ext->>'props')+ parent_id 巢狀 + menu_order 升冪 null-last + 葉 `children=None` + null component→`""`(data-model §4 契約)

### Implementation for User Story 1

- [x] T006 [US1] 實作 `build_route_tree(models: Vec<entity::sys_menu::Model>) -> Vec<MenuRoute>`(green)於 `rust-api/server/src/route/menu.rs`(T005 轉綠;handler 不碰 `entity::`、型由 facade 餵)
- [x] T007 [US1] 重構 `filter_routes_for_roles` 簽名為 `(routes: Vec<MenuRoute>, roles, enforcer)`(移除內部 `business_routes()` 呼叫,tree-prune/enforce 邏輯零變更)+ 6 個既有純測改餵 **fixture 樹**(同 6 節點 const)於 `rust-api/server/src/route/menu.rs`
- [x] T008 [US1] 移除孤兒 `business_routes()` 及其專屬 import 於 `rust-api/server/src/route/menu.rs`(`constant_routes()` 保留)
- [x] T009 [US1] rewire `get_user_routes` 於 `rust-api/server/src/handler/route.rs`:`sys_menu::all_active(&state.db)` → `menu::build_route_tree(models)` → `menu::filter_routes_for_roles(tree, &roles, &enforcer)`;`{routes, home:"home"}` 不變;`all_active` DbErr → 收斂 3333(同既有 role-lookup 失敗語意)
- [x] T010 [US1] acceptance(verification §2/§3):curl Super/Admin/User getUserRoutes wire = baseline + 對 014 輸出零 diff + Super/Admin 的 user-detail 帶 `component`/`props:true`;重跑 014 CDP smoke(Super 側欄全 / User 只首頁)

**Checkpoint**: getUserRoutes 單一真相源、三角色零回歸。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 回歸驗證、dead-code 清理、docs 回填。

- [x] T011 [P] 回歸驗證(verification §4):`getConstantRoutes` 回 5 條不變 + `isRouteExist` 行為不變(User deny manage_role)+ **FR-008 唯讀斷言**(`main.rs` 路由表無新增業務寫入路由〔grep 無新 post/put/delete〕、getUserRoutes 路徑未寫入任何 `*_by`/operator 欄)+ server 整體測數不退(≥112)+ entity-access lint 17 綠
- [x] T012 [P] dead-code 確認:grep 確 `business_routes` 全樹無殘留引用;(optional sanity)`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`(§3 無新 crate、非強制)
- [x] T013 docs 回填 + 收尾:CHECKLIST §2.20 標 **D-D 解**(getUserRoutes↔sys_menu 統一單一真相源)、DESIGN §10 Phase 4 補 018 as-built;走 §4.1 兩段式 commit(rust-api worktree push `rev2-admin-rust-api` → 外層 SHA pin),收尾 `superpowers:finishing-a-development-branch` → merge `--no-ff` 回 `rev2-admin-root`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup(P1）**:無依賴,先跑。
- **Foundational(P2)**:無任務。
- **US2(Phase 3)**:Setup 後即可;**排在 US1 前**(US1 live-acceptance 前置)。
- **US1(Phase 4)**:單元工作(T005-T009)與 US2 互不依賴;**但 T010 live-acceptance 依賴 T004(seed 已套)**。
- **Polish(Phase 5)**:US1 完成後。

### User Story Dependencies
- **US2(P2)**:獨立可測(psql 驗 seed),無依賴他 story。
- **US1(P1)**:單元 TDD 獨立;**live-acceptance(T010)硬依賴 US2(T004)**。

### Within US1
- T005(test, red)→ T006(build_route_tree, green)→ T007(filter 重構 + fixture 測)→ T008(移除 business_routes)→ T009(handler rewire)→ T010(acceptance)。皆動 `menu.rs`/`route.rs` 同檔鄰近 → **序列、非平行**。

### Parallel Opportunities
- Phase 5 的 T011 / T012 [P](不同驗證面、互不依賴)。
- 其餘多為同檔序列(小 feature),平行機會少。

---

## Implementation Strategy

### MVP
本 feature MVP = **US2(seed)+ US1(read swap)合起來** —— US1 單獨上線會讓 user-detail 回歸(缺 component/props),故 seed 修正(US2)是 MVP 不可分割的前置。順序:Setup → US2 → US1 → Polish。

### 收尾
全 acceptance gate(verification §0-§4)綠 + `business_routes()` 移除無殘留 → `superpowers:finishing-a-development-branch`:§4.1 兩段式 commit、merge `--no-ff` 回 `rev2-admin-root`、保留 `018-userroutes-sys-menu` branch 供 audit。

## Notes
- 實作一律 `superpowers:executing-plans`(偵測 subagent → subagent-driven-development),**非** `/speckit-implement`(CLAUDE.md §3 / constitution §I.4)。
- `git push` / `git merge` 不得出現於 `finishing-a-development-branch` 之前(§I.4)。
- 每 task 或邏輯群組完成後 commit;reviewer 派工前須拿 implementer 回報的真實 SHA(memory `feedback_reviewer_needs_real_sha`)。
