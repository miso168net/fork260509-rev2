# Implementation Plan: dynamic-routes

**Branch**: `014-dynamic-routes` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-dynamic-routes/spec.md`

**Brainstorm**: [`docs/superpowers/014-dynamic-routes.md`](../../docs/superpowers/014-dynamic-routes.md)（Phase 0，D1-D8 凍結;2026-05-30 §I.2 re-scope）

---

## Summary

rev2 第 14 個 feature、**Phase 3 #2**。把 base-web 翻到 **dynamic auth route mode**,由 rust-api 供應 3 個路由 endpoint(`/route/getConstantRoutes` 公開 / `/route/getUserRoutes` JWT / `/route/isRouteExist` JWT),**業務 menu 可見性走 Casbin enforce 過濾**(§I.2 核心原則落地、重用 013 enforcer)。route 物件**程式內寫死**(精確對齊 base-web elegant-router shape);menu-visibility policy(`p,role,route_name,menu`)經 migration seed(經 010 自動套);依角色三階梯(Super 全 / Admin home+manage〔user,user-detail〕/ User 只 home,D3)。承接 013(login/getUserInfo/JWT/bearer/enforcer/roles_for_user)。**動 rust-api worktree + base-web `.env`(`VITE_AUTH_ROUTE_MODE=dynamic`、BASE-WEB-ADAPT)→ 兩段式 commit**。

---

## Technical Context

**Language/Version**：Rust 1.86（既有 rust-api workspace）。

**Primary Dependencies**：**無新增 dep** — 重用 013 的 `jsonwebtoken`/`casbin`/`sea-orm-adapter`、`argon2`、`serde`、`axum`。`AppState.enforcer`(013 `Arc<RwLock<casbin::Enforcer>>`)+ RBAC model(`sub,obj,act`)直接重用。

**Storage**：Postgres `casbin_rule`(012 stock)新增 menu-visibility policy seed rows(`p,role,route_name,menu`),經 010 stack `up` 自動套;**無新表**(route 物件程式內、非 sys_menu)。

**Testing**：
- **enforce 決策 + tree-prune test-first**：`filter_routes_for_roles`(用 `MemoryAdapter` seed 同 D3 menu policy:Super→全 / Admin→home+manage〔user,user-detail〕/ User→只 home;父層無可見 child omit)、`route_exists_for_roles`(enforce-filtered true/false)。沿 013 enforce 決策測試模式。
- **活體 acceptance(C-V)**：[contracts/verification-commands.md](./contracts/verification-commands.md)(§0 既有不破 / §1 policy seed / §2 getConstantRoutes 公開 / §3 getUserRoutes 三角色 + home / §4 isRouteExist allow+deny / §5 **CDP dynamic-mode browser smoke**)。

**Target Platform**：容器(dev/prod docker stack;migration 經 010 自動套)。

**Project Type**：後端 web service(rust-api)+ base-web dynamic-mode wire(CDP smoke)。

**Performance Goals**（對應 SC）：dynamic-mode 端到端 menu 依角色呈現(SC-001)、constant routes 啟動可取(SC-002)、isRouteExist allow+deny(SC-003)、既有不破(SC-004)。本 feature 不設延遲/吞吐目標(最小機制)。

**Constraints**：
- 守 **§I.2**(業務 menu 走 Casbin enforce 過濾)— 本 feature 落地此核心原則。
- 守 **007 FR-009**(server 不自動 migrate;menu policy seed 經 010 自動套)+ **009 entity-access lint**(route 模組不碰 `entity::`、roles 經 facade)+ **008 envelope**(全 `Res<T>`)+ **§I.3 wire 不變式**(MenuRoute/UserRoute 對齊 typings、id=string、home="home")。
- **無新 workspace crate**(route 模組進 server)→ 無 Dockerfile builder COPY 缺口;**無新 dep** → prod build sanity 順手。
- 兩段式 commit(動 rust-api worktree + base-web `.env`)。

**Scale/Scope**：rust-api 改動 = `server/src/route/menu.rs`(route 定義 + enforce filter)+ `server/src/handler/route.rs`(3 handler)+ `main.rs`(3 route)+ 1 migration(menu policy seed)+ enforce 決策單測 + base-web `.env`。**完整 endpoint-access enforce 矩陣 / sys_menu 表 / menu CRUD / 受管 policy 治理 / redis pub-sub / demo menu = scope 外(後續)**。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項：

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **對齊** — 提供 base-web `route.ts` 用到的 `/route/getConstantRoutes`·`/route/getUserRoutes`·`/route/isRouteExist`,DTO 對齊 `route.d.ts`(MenuRoute/UserRoute) | ✅ Pass |
| 2 | 動到 base-web inline? | 僅動 `.env`(`VITE_AUTH_ROUTE_MODE=dynamic`)= **BASE-WEB-ADAPT 軌道(§III.1 預設可動、`.env` 非 inline)**;不動 inline | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **是 ✅**(2026-05-30 re-scope 修正):getUserRoutes/isRouteExist 的業務 menu 可見性**走 Casbin enforce 過濾**(menu-visibility policy `p,role,route_name,menu` + 013 enforcer);constantRoutes(login/404/403)前端無關、不過濾(§I.2 明示)。**原 in-code map 已改正** | ✅ Pass |
| 4 | wire 對齊 §I.3 mock?(envelope/id 型/error code/enum) | envelope `Res<T>`(008);**MenuRoute.id=string**(§11.10);UserRoute.home="home";token 失效 `3333`(mock §4.11);MenuRoute/UserRoute 對齊 `route.d.ts` | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | **否** — route 定義 act on base-web `elegant/routes.ts` 真實 shape(base-web 權威、非 rev1);enforce 重用 013(非新拷貝)。**未 grep rev1**(§I.5) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | **對齊** §11.7(dynamic、後端控 menu)·§11.10(MenuRoute.id string);**不撤回任何拍板、不需 Amendment** | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 僅 BASE-WEB-ADAPT(§III.1 非★);**dynamic mode 下 getUserRoutes 只送業務 route → demo menu 不送 → BASE-WEB-BUILD-CONFIG ★(§11.5 隱藏 demo)在此模式 moot、不需動** | ✅ Pass |

**結論**：7 項全 PASS、無 violations、無 Complexity Tracking 需填。

> **設計鏈軌跡**：初版 brainstorm D1 選「程式內 map 過濾」,plan Constitution Check item 3 抓到違反 §I.2(menu 必走 Casbin enforce)→ user 拍板 re-scope:menu 可見性改 Casbin policy seed + 013 enforcer 過濾(route 定義仍程式內寫死、D3 不變)→ 重跑 Check 7 項全 PASS。詳見 [Deviation Log](#deviation-log)。

---

## Project Structure

### Documentation (this feature)

```text
specs/014-dynamic-routes/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交(16/16、0 提問;§I.2 re-scope 已併)
├── research.md          # Phase 0(本次;R1-R7,grep base-web 真實 route shape)
├── data-model.md        # Phase 1(本次)—— route DTO + 程式內 route 樹 + menu-visibility policy seed
├── contracts/
│   └── verification-commands.md   # Phase 1(本次,C-V §0-§5 + CDP dynamic-mode smoke)
├── quickstart.md        # Phase 1(本次)
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16/16 PASS)
```

### Source Code (rust-api worktree + base-web)

```text
rust-api/
├── server/src/
│   ├── route/
│   │   └── menu.rs           ← 程式內 route 定義(constant + business 樹)+ enforce-based filter(filter_routes_for_roles / route_exists_for_roles,用 013 enforcer)
│   ├── handler/
│   │   └── route.rs          ← get_constant_routes(公開)/ get_user_routes(JWT→DB roles→enforce filter→{routes,home})/ is_route_exist(JWT→enforce 查名)
│   └── main.rs               ← 接 /route/getConstantRoutes(GET 公開)+ /route/getUserRoutes(GET JWT)+ /route/isRouteExist(GET JWT);mod route 掛載
└── migration/src/
    └── m20260529_000010_seed_menu_policy.rs   ← seed menu-visibility policy(p,role,route_name,menu)進 casbin_rule + lib.rs 註冊

base-web/
└── .env                      ← VITE_AUTH_ROUTE_MODE: static → dynamic(BASE-WEB-ADAPT;dynamic mode 開關)
```

**Structure Decision**：**動 rust-api worktree source**(新增 route 模組 + handler + 1 migration〔menu policy seed〕)+ base-web `.env`(BASE-WEB-ADAPT)→ **兩段式 commit**。**無新 workspace crate、無新 dep**(重用 013 enforcer/jwt/bearer + 008 envelope + 009 facade)。沿用 013 CDP browser smoke harness(`tests/`、9229)。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 base-web 真實 route shape〔home/manage 樹/constant 5 條,component `$` 複合格式、meta 欄〕/ R2 constant routes〔meta.constant:true = 403/404/500/login/iframe-page,公開不過濾〕/ R3 menu 走 Casbin enforce〔menu-visibility policy `p,role,route_name,act=menu` + 013 enforcer,§I.2;model 不變〕/ R4 role→route policy seed〔D3 三階梯 → casbin_rule rows;父層 omit 由 tree-prune 計算非 policy〕/ R5 endpoint 認證〔getConstantRoutes 公開、getUserRoutes/isRouteExist JWT、3 endpoint 不掛 access middleware〕/ R6 wire DTO〔MenuRoute id=string、home="home"、meta.roles 省略〔dynamic 模式 server 已過濾〕、camelCase〕/ R7 守恆〔007/008/009 + dynamic mode 使 demo menu 不送 → §11.5 moot〕）。

**結論**：7 項全解析、0 NEEDS CLARIFICATION。**§I.5 遵守**:未 grep rev1(route 定義 act on base-web `elegant/routes.ts` 真實 shape)。**無新 dep**。**最高風險點**:(a) route 物件 component key(`layout.base$view.home` 複合格式)/ meta 不對齊 → base-web 渲染不出 menu(CDP smoke 抓);(b) menu policy 的 obj/act 約定(route_name × "menu")須與 enforce 呼叫一致。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— route DTO(MenuRoute/UserRoute/RouteMeta、camelCase)+ 程式內 route 樹(home/manage+children/constant 5 條,精確 shape)+ menu-visibility policy seed(D3 → casbin_rule rows)+ enforce 約定(obj=route_name,act="menu")。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V §0-§5(既有不破/policy seed/getConstantRoutes 公開/getUserRoutes 三角色/isRouteExist allow+deny/CDP dynamic-mode smoke)。
- [`quickstart.md`](./quickstart.md)—— Path A 單測 / B 3 endpoint curl / C CDP dynamic-mode menu 差異。

**Agent context update**：CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項：

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍對齊 — 3 endpoint DTO 對齊 base-web `route.d.ts`/`route.ts` | ✅ Pass |
| 2 | 仍僅 BASE-WEB-ADAPT `.env`(dynamic 開關);未動 inline | ✅ Pass |
| 3 | **menu 走 Casbin enforce**(data-model menu-visibility policy + enforce filter);constantRoutes 不過濾(§I.2) | ✅ Pass |
| 4 | MenuRoute.id string + home="home" + 3333 + 對齊 typings | ✅ Pass |
| 5 | route 定義 act on base-web 真實 shape(非 rev1 拷貝);enforce 重用 013 | ✅ Pass |
| 6 | 對齊 §11.7/§11.10;無 Amendment | ✅ Pass |
| 7 | 僅 BASE-WEB-ADAPT(非★);dynamic mode 使 demo menu 不送、§11.5 ★ moot | ✅ Pass |

**結果**：7 項仍全 PASS。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

> **已知風險（非 violation、implement 時若觸發記 Deviation Log）**：
> - **route 物件 shape 對齊**：rust route DTO 的 `component`(`layout.base$view.home` elegant-router 複合格式)/`path`/`meta` 須精確對齊 base-web `elegant/routes.ts`;不對齊 = base-web 渲染不出 menu(CDP smoke 抓)。
> - **menu policy obj/act 約定**:seed 的 `p,role,route_name,menu` 與 handler `enforce((role,route_name,"menu"))` 的 obj/act 字串須一致;父層 `manage` 可見性由 tree-prune(子項任一可見)計算、**非** seed policy(避免父子 policy 不一致)。
> - **dynamic mode 翻轉前置**:翻 `VITE_AUTH_ROUTE_MODE=dynamic` 前 3 endpoint 須全可用(getConstantRoutes 每次 reload 觸發);否則 base-web reload 壞。CDP smoke 前先 curl 驗 3 endpoint。

---

## Deviation Log（Constitution §V — implement/plan 階段實際偏離處）

- **D-001（plan Constitution Check、§I.2 re-scope）**：brainstorm 初版 D1 選「程式內 `role→route` map 過濾 menu」,`/speckit-plan` Constitution Check item 3 抓到**違反 §I.2**(業務 menu 必走 Casbin enforce 過濾)。**處置**:user 2026-05-30 拍板 re-scope — menu 可見性改 **Casbin policy seed(`p,role,route_name,menu`)+ 013 enforcer 過濾**;route 定義仍程式內寫死、D3 可見範圍不變。brainstorm doc + spec 已同步更新(D1/D4/FR/Entities)。重跑 Constitution Check 7 項全 PASS、無需 Amendment(對齊既有 §I.2、未撤回拍板)。
