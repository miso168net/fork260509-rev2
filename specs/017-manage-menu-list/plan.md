# Implementation Plan: manage-menu-list

**Branch**: `017-manage-menu-list` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-manage-menu-list/spec.md`

**Brainstorm**: [`docs/superpowers/017-manage-menu-list.md`](../../docs/superpowers/017-manage-menu-list.md)（Phase 0，D1-D14 凍結）

---

## Summary

rev2 第 17 個 feature、**Phase 4 主流業務第二刀**。落地 base-web manage/menu 頁的 **3 條 read endpoint**:`getMenuList/v2`（分頁巢狀樹）/ `getMenuTree`（輕量樹 `{id,label,pId,children}`）/ `getAllPages`（頁面名 catalog、**唯一 role-aware**:R_SUPER 真頁+demo、R_ADMIN 只真頁）。**建 `sys_menu` 表**把選單定義從 014 寫死的 in-code route tree 搬進資料表（base-web `Menu` 全欄、扁平 column + `route_ext`/`buttons` 兩 JSONB）。3 條掛 admin 級 Casbin `enforce_mw`（m..017 seed 6 policy）。**唯讀**;**不動 014 getUserRoutes**（仍讀 in-code）;**選單可見性續住 casbin**（不建 sys_role_menu）。沿用 016 立的 `PageResp`/`normalize_page`/Output DTO + facade pattern;getMenuList 走「取全 active + 記憶體組樹 + 頂層 slice 分頁」（明確偏離 016 DB 分頁、理由=menu 巢狀且有界小）。

---

## Technical Context

**Language/Version**:Rust 1.86（既有 rust-api workspace）。

**Primary Dependencies**:**無新 workspace crate、無新 dep**。重用 sea-orm 1.1.20（含 **`Json` 型 + `.json_binary()`** — 011 sys_operation_log 已先例）、**008** `Res<T>`、**009** soft-delete `find_active` + entity-access lint、**013** `enforce_mw`/jwt/`Claims.roles`、**016** `normalize_page`/`PageResp`/facade 分頁 pattern。

**Storage**:Postgres 新表 `sys_menu`（21 欄含 2 JSONB）+ casbin_rule seed（m..017、6 endpoint policy）。migration `m..016`（create+seed 6 節點）/ `m..017`（seed policy），經 010 自動套。只回 active（009）。

**Testing**:
- **純單測 test-first**:`build_menu_tree(Vec<Model>)->Vec<MenuItem>`（巢狀/排序/孤兒）+ root-slice 分頁（reuse 016 `normalize_page`）+ `pages_for_roles(roles)->Vec<String>`（Super real+demo / else real）+ `route_ext` JSONB↔wire 攤平 + facade `all_active` SQL-build（`deleted_at IS NULL` + order menu_order）。
- **活體 acceptance（C-V）**:[contracts/verification-commands.md](./contracts/verification-commands.md)（§0 守恆+prod build / §1 schema+seed / §2 getMenuList / §3 getMenuTree / §4 getAllPages role-aware〔Super vs Admin〕/ §5 enforce / §6 純測）。**無 CDP**（純後端 read）。

**Target Platform**:容器（dev/prod docker stack;migration 經 010 自動套）。

**Project Type**:後端 web service（rust-api）。**不動 base-web、無外層 deploy 改動**（與 016 同、純 rust-api worktree）。

**Performance Goals**（clarify deferred 至此解析）:分頁清單/樹/catalog read（SC-001/002/003）/ admin enforce（SC-004）/ 只回 active + 分頁契約（SC-005）/ id+enum 型對齊（SC-006）/ 既有不破（SC-007）。**admin panel 低流量、最小機制**;getMenuList **取全 active menu**（1 query）+ 記憶體組樹 + 頂層 slice 分頁 —— **menu 本質有界小**（導覽設定、非交易資料、不像 user/role 會長大）→ 取全永遠便宜、無 scale 風險。

**Constraints**:
- 守 **008 envelope** + **009 entity-access lint**（sys_menu 查詢只經 facade）+ **007 FR-009**（migration 經 010、server 不自動 migrate）+ **soft-delete**（只回 active）。
- **id wire = number**（constitution v1.1.0 §I.3/§11.10）;`route_name`=string（routing + casbin v1 對齊鍵、unique active）。
- **menu 可見性續住 casbin**（§I.2、不建 sys_role_menu）;sys_menu = 定義表。
- SQL injection 紀律（CHECKLIST §5.10、全參數化;seed parent_id 用 route_name subquery〔靜態值〕）。

**Scale/Scope**:rust-api 改動 = 1 create+seed migration（sys_menu + 6 節點）+ 1 seed policy migration + 1 entity（sys_menu）+ 1 facade（sys_menu `find_active`/`all_active`）+ `handler/system_manage.rs` 擴充（3 handler + MenuItem/MenuTreeItem DTO + 純 tree-builder/root-slice/pages_for_roles + in-code REAL_PAGES/DEMO_PAGES）+ main.rs（3 route 掛 enforce）。**無新 crate/dep、不動 base-web、不動 014、無外層 deploy 改動**。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution **v1.1.0**](../../.specify/memory/constitution.md):

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **對齊** — 落地 base-web 既呼叫的 getMenuList/v2 / getMenuTree / getAllPages 3 endpoint、wire shape 對齊 typings（Menu/MenuList/MenuTree/string[]）。**正是補齊 base-web 需求** | ✅ Pass |
| 2 | 動到 base-web inline? | **否** — 純 rust-api;base-web service 層既有、wire 對齊即可、**完全不動 base-web** | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **守** — 業務 menu **側欄可見性**仍走 014 getUserRoutes + Casbin（**本 feature 不動 014、不改可見性機制**）;017 的 getMenuList/getMenuTree 是 **admin 管理視圖**（endpoint-level enforce、回全集）、**非** menu-domain 可見性過濾;**選單可見性真相續住 casbin、不建 sys_role_menu**（§I.2 鐵紀律未違） | ✅ Pass |
| 4 | wire 對齊 §I.3 mock?(envelope/id 型/error code/enum) | **對齊** — envelope `Res<T>`、分頁 `{records,current,size,total}`、**id=number**（menu id;`MenuRoute.id`=string 屬 014 getUserRoutes、未動）、**MenuType '1'=目錄/'2'=選單**（§I.3 鎖定）、IconType '1'/'2'、enforce deny `5003`、**status 送非 null EnableStatus '1'/'2'**（`EnableStatus\|null` 子集、同 016 RoleItem/UserItem 既驗法） | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | **否** — 全新寫;**未 grep rev1**（schema 由 base-web `Menu` typing + 014 in-code 樹推導、in-code 頁名對齊 base-web elegant-router）。**016 的 §I.5 例外於 017 不需要** | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | **對齊** — §11.7 dynamic（014 已落地、不動）/ §11.10 id=number（v1.1.0、016 已 amend、本 feature 沿用不再改）;其餘拍板不撤回。**無 Amendment** | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 不動 base-web → 不觸 MODAL-WIRING ★ / BASE-WEB-BUILD-CONFIG ★;getAllPages 的 demo 過濾為 **rust-api 側**（非 base-web build pageExcludePatterns）;僅 RUSTAPI-SOURCE-ISOLATION（§III.1 非★、全新寫對齊） | ✅ Pass |

**結論**:7 項全 PASS、**無 violation、無 Amendment、無 §I.5 例外**（比 016 更乾淨）。Complexity Tracking 不需填。

---

## Project Structure

### Documentation (this feature)

```text
specs/017-manage-menu-list/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify（0 提問）
├── research.md          # Phase 0（R1-R10）
├── data-model.md        # Phase 1 — sys_menu schema + entity + DTO + facade + tree builder + 接線
├── contracts/
│   └── verification-commands.md   # Phase 1（C-V §0-§6、無 CDP）
├── quickstart.md        # Phase 1
└── checklists/
    └── requirements.md  # /speckit-specify（全 PASS）
```

### Source Code（rust-api worktree;**不動 base-web、不動 014、無外層改動**）

```text
rust-api/                                   ← worktree（code）
├── server/src/
│   ├── handler/system_manage.rs            ← 擴充:get_menu_list_v2 / get_menu_tree / get_all_pages + MenuItem(含 children + route_ext 攤平 + buttons + createBy/updateBy null) / MenuTreeItem{id,label,pId,children} + 純 build_menu_tree / root-slice / pages_for_roles + in-code REAL_PAGES/DEMO_PAGES
│   ├── handler/mod.rs                       ← (system_manage 已 pub mod、016 既有)
│   ├── model/facade/sys_menu.rs            ← 新:find_active + all_active(依 menu_order) + SoftDeletable + SQL-build 單測
│   └── main.rs                             ← 3 route 掛 enforce_mw（route_layer;注意 /getMenuList/v2 nested path）
├── entity/src/
│   └── sys_menu.rs                         ← 新:Model 21 欄（route_ext/buttons 用 sea-orm Json、同 011 sys_operation_log）
└── migration/src/
    ├── m20260529_000016_create_sys_menu.rs       ← 建表 + seed 6 節點（parent_id route_name subquery）
    ├── m20260529_000017_seed_menu_endpoint_policy.rs  ← seed 6 casbin endpoint policy
    └── lib.rs                              ← 註冊 016/017
```

**Structure Decision**:純 **rust-api worktree source**（migration×2 + entity×1〔新 sys_menu〕+ facade×1〔新 sys_menu〕+ handler 擴充 + main + 刪 0）。**無外層 deploy 改動**（與 016 同;無 Dockerfile/compose 變動）。故 commit = **worktree（code）push fork + 外層（spec docs + rust-api SHA pin）**（兩段式、**不動 base-web**）。**無新 workspace crate**（無 builder COPY 缺口、不觸發 prod-build 鐵律;但 §0 仍跑 prod build sanity〔保守、確認新表 migration + 新 handler 不破 release build〕）。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 三 endpoint wire 形 / R2 MenuType·IconType·status enum / R3 sys_menu 全欄 schema / R4 **JSONB pattern〔011 sys_operation_log `Option<Json>`+`.json_binary()` 先例〕** / R5 tree builder + 記憶體分頁 / R6 getAllPages role-aware〔`Claims.roles` + base-web routes.ts 頁名源〕 / R7 enforce 接線 + policy seed / R8 casbin route_name 對齊 / R9 facade pattern〔all_active、016 既有 return 型對照〕 / R10 守恆 + 無新 dep）。

**結論**:10 項全解析、**0 NEEDS CLARIFICATION**。**無 §I.5 破例**（未 grep rev1）。**無新 crate/dep**。**最高風險點**:(a) JSONB 欄 serde 映射（route_ext 攤平 wire / buttons）— 有 011 先例;(b) getMenuList tree+分頁正確性 — 純測鎖;(c) getAllPages role-aware double-JWT-parse（§2.17 DRY debt、defer）;(d) `order` SQL 保留字（→欄名 menu_order）;(e) seed parent_id subquery（同 013 套路）。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— sys_menu 21 欄 schema（扁平 + 2 JSONB）+ migration 2 支 + entity + Output DTO（MenuItem 含 children + route_ext 攤平 + buttons + id number + createBy/updateBy null;MenuTreeItem 輕量）+ facade（find_active/all_active）+ 純 tree-builder/root-slice/pages_for_roles + handler/main 接線。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V §0-§6（守恆+prod build / schema+seed / getMenuList / getMenuTree / getAllPages role-aware / enforce / 純測）。
- [`quickstart.md`](./quickstart.md)—— Path A 純單測 / B 活體 / C prod build。

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑（對照 v1.1.0）:

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 對齊 — 落地 base-web 3 endpoint、wire 對齊 typings | ✅ Pass |
| 2 | 不動 base-web | ✅ Pass |
| 3 | 守 §I.2 — 不動 014 可見性機制、sys_menu 純定義表、可見性續住 casbin（不建 sys_role_menu） | ✅ Pass |
| 4 | envelope/分頁/id=number/MenuType·IconType enum/status 子集/5003 對齊 §I.3 | ✅ Pass |
| 5 | 全新寫;未 grep rev1（base-web typing + 014 in-code 推導） | ✅ Pass |
| 6 | §II 拍板不變、無 Amendment | ✅ Pass |
| 7 | 不動 base-web → 不觸 ★ 軌道 | ✅ Pass |

**結果**:7 項仍全 PASS。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

> **已知風險（非 violation、implement 時若觸發記 Deviation Log）**:
> - **JSONB 欄映射**:`route_ext`（攤平成 wire `href`/`query`/`multiTab`/`fixedIndexInTab`）+ `buttons`（`[{code,desc}]`）。有 011 sys_operation_log `Option<Json>`+`.json_binary()` 先例;route_ext 攤平用 serde flatten 或 handler 手動 map（plan 傾向 handler map、明確）。
> - **getMenuList tree+分頁**:取全 active + 記憶體組樹 + 頂層 slice;規模假設 = menu 有界小。純測鎖樹結構/排序/孤兒 + root 邊界。
> - **getAllPages role-aware double-JWT-parse**:enforce_mw + handler 各 parse 一次 JWT（§2.17 DRY debt、defer、同 013/014）。
> - **`order` SQL 保留字**:欄名 `menu_order`、序列化映回 wire `order`。
> - **seed parent_id subquery**:children 用 `(SELECT id FROM sys_menu WHERE route_name='manage')`（BIGSERIAL id 插入時才定、同 013 role_id 套路）。

---

## Deviation Log（Constitution §V — implement/plan 階段實際偏離處）

> 017 **無 constitution violation、無 Amendment、無 §I.5 例外**。下列為**實作層偏離/折期**（非鐵紀律偏離）:

- **D-A（getMenuList 非 016 DB 分頁）**:取全 active + 記憶體組樹 + 頂層 slice;理由 = menu 巢狀（children 隨 root）+ 任意深度 + 本質有界小（DB 分頁需 recursive CTE 破 facade seam）。規模假設明示於 Technical Context。
- **D-B（getAllPages role-aware + double JWT parse）**:唯一 role-aware 端點;enforce_mw 閘 + handler 讀 `Claims.roles` 做 demo 過濾 → 兩次 JWT parse = §2.17 DRY debt、defer。
- **D-C（in-code 頁名/component 對齊 base-web、§I.5 友善）**:`REAL_PAGES`/`DEMO_PAGES` + seed component 名對齊 base-web elegant-router `routes.ts`、**未 grep rev1**（同 014 紀律、§I.5 不破）。
- **D-D（sys_menu vs 014 in-code 雙源、暫並存）**:017 seed sys_menu 對齊 014 6 節點、兩源皆唯讀 seed-only → 無漂移;單一真相源統一（014 getUserRoutes 改讀 sys_menu）留未來 feature。
- **D-E（operator + demos-as-menus + menu CRUD 折期）**:createBy/updateBy 回 null（Phase 4 A、同 016 D-3）;demo 頁只進 getAllPages catalog 不 seed 成 menu;menu 寫入/role-menu 授權寫入 = scope 外。
