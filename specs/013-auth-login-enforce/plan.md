# Implementation Plan: auth-login-enforce

**Branch**: `013-auth-login-enforce` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-auth-login-enforce/spec.md`

**Brainstorm**: [`docs/superpowers/013-auth-login-enforce.md`](../../docs/superpowers/013-auth-login-enforce.md)（Phase 0，D1-D11 凍結）

---

## Summary

rev2 第 13 個 feature、**Phase 3 RBAC 起手**。把 base-web 登入流程對 rev2 rust-api 端到端接通（login / getUserInfo / refreshToken，對齊 base-web mock wire），並**首次啟用 Casbin enforce**（rev2 自家 axum middleware = §11.6「axum-casbin 重寫」第一刀 + 012 stock `SeaOrmAdapter` + RBAC model，最小機制證明：一條示範路由 allow+deny）。新增 `sys_role` / `sys_user_role` + `sys_user.nick_name`（User→User01 alias）+ casbin policy seed（經 010 自動套）；JWT HS256 簽/驗（接既有 JwtConfig + 新 dep `jsonwebtoken`）；`Res<T>` err 建構子泛型化（§2.11）。error code 對齊 mock §4.11（login `1000` / token `3333` / refresh `8888` / deny `5xxx`）。acceptance 含 **CDP browser 登入 smoke**。**動 rust-api worktree + base-web `.env`（BASE-WEB-ADAPT）→ 兩段式 commit**。

---

## Technical Context

**Language/Version**：Rust 1.86（既有 rust-api workspace）。

**Primary Dependencies**：
- **新增 workspace/server dep**：`jsonwebtoken`（現行穩定版、§6 安裝前確認 stable）。
- server crate 新增 dep：`casbin = { workspace = true }`、`sea-orm-adapter = { path = "../sea-orm-adapter" }`（enforce middleware 用；012 已引入、prod Dockerfile 已 COPY）。
- 既有：`argon2`（password verify）、`axum`、`sea-orm 1.1.20`、`JwtConfig`（005/007）、008 `Res<T>`/`BizCode`、009 SoftDeletable/facade/lint。

**Storage**：Postgres（新增 `sys_role` / `sys_user_role` + `sys_user.nick_name` + casbin_rule policy seed，經 010 stack `up` 自動套用）。

**Testing**：
- **純函式 test-first**：JWT 簽/驗（roundtrip + exp 拒絕 + access/refresh secret 分離）、argon2 verify、button 矩陣、`Res<T>` 泛型、enforce 決策。
- **活體 acceptance（C-V）**：[contracts/verification-commands.md](./contracts/verification-commands.md)（§0 既有不破/lint/prod build sanity / §1 schema seed / §2 login+getUserInfo+alias / §3 enforce allow+deny / §4 refresh / §5 **CDP 登入 smoke** / §6 scope 邊界）。沿 011 in-crate `#[ignore]`+env-gate harness。

**Target Platform**：容器（dev/prod docker stack；migration 經 010 自動套）。

**Project Type**：後端 web service（rust-api）+ 首次真接 base-web wire（CDP smoke）。

**Performance Goals**（對應 SC）：login→getUserInfo round-trip 成功（SC-001）、enforce allow+deny 正確（SC-002）、refresh 換發（SC-003）、既有不破（SC-004）。本 feature 不設延遲/吞吐目標（認證地基、最小機制）。

**Constraints**：
- 守 **007 FR-009**（server 不自動 migrate；新 migration 經 010 自動套）。
- 守 **009 entity-access lint**（新 entity `sys_role`/`sys_user_role` 經 facade 寫）。
- 守 **008 envelope**（全回 `Res<T>`）+ **§I.3 wire 不變式**（envelope / userId=string / error code / Super·Admin·User+User01 alias）。
- enforce middleware = **§11.6 重寫**（非拷貝 rev1 axum-casbin）；casbin_rule 維持 012 stock（soft-delete 留後續）。
- **無新 workspace crate**（模組進 server）→ 無 Dockerfile builder COPY 缺口；新 dep `jsonwebtoken` → prod build sanity（跨 feature 守則）。
- 兩段式 commit（動 rust-api worktree + base-web `.env`）。

**Scale/Scope**：rust-api 改動 = `server/src/auth/{jwt,enforce}.rs` + `server/src/handler/auth.rs` + `server/src/model/facade/{sys_role,sys_user_role}.rs` + `envelope.rs`(Res<T> 泛型) + `state.rs`(enforcer) + `main.rs`(router/middleware) + `entity/src/{sys_role,sys_user_role}.rs` + `sys_user.rs`(nick_name) + migration 006-009 + casbin model + 純邏輯單測 + base-web `.env`(BASE-WEB-ADAPT)。**完整 policy 矩陣 / 全路由 enforce / login audit / casbin_rule soft-delete / refresh rotation 持久化 / dynamic routes = scope 外（後續階段）**。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項：

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **對齊** — 提供 base-web `auth.ts` 用到的 `/auth/login`·`/auth/getUserInfo`·`/auth/refreshToken`,DTO 對齊 `auth.d.ts`(LoginToken/UserInfo);示範 `/systemManage/getUserList` 用 Phase 4 真實名 | ✅ Pass |
| 2 | 動到 base-web inline? | 僅動 `.env`(`VITE_SERVICE_BASE_URL`→rev2,for CDP smoke)= **BASE-WEB-ADAPT 軌道(§III.1 預設可動、`.env` 非 inline)**;不動 inline | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **本 feature 首次啟用 Casbin enforce 機制**(示範路由 allow/deny);menu 過濾(getUserRoutes)為 Phase 3 #2、013 是其 enforce 機制前置、對齊 §I.2 方向 | ✅ Pass |
| 4 | wire 對齊 §I.3 mock?(envelope/id 型/error code/enum) | envelope `Res<T>`(008);`userId`=string;error code 1000/3333/8888(mock §4.11)+ deny `5xxx`(業務、非 9999/9998/3333);refresh 絕不回 critical code;Super/Admin/User+User01 alias | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | **否** — login/getUserInfo/enforce middleware 全新寫;enforce = §11.6「axum-casbin 重寫」(非拷貝);用 012 已引入的 sea-orm-adapter(012 的 §I.5 例外、非 013 新拷貝)。**research 未 grep rev1**(§I.5) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | **對齊** §11.1(Super/Admin/User+User01)·§11.6(axum-casbin 重寫首刀)·§11.7(dynamic 後端控 menu、enforce 機制)·§11.10(id string、business `5xxx`)·§11.11(`/api` 主流);**不撤回任何拍板、不需 Amendment**(casbin_rule soft-delete 動 §11.6 前提 → 後續 feature、013 維持 stock 不觸) | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — 僅 BASE-WEB-ADAPT(§III.1 預設可動、非 ★);未觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG ★(不碰 base-web inline/build);enforce middleware 屬 RUSTAPI-SOURCE-ISOLATION(§III.1、全新寫) | ✅ Pass |

**結論**：7 項全 PASS、無 violations、無 Complexity Tracking 需填。可進 Phase 0 research。

> 註：013 為 Phase 3 起手、首次啟用 Casbin enforce(§I.2 核心突破的機制落地)+ 首次真接 base-web wire(§I.1)。enforce 為 §11.6「axum-casbin 重寫」第一刀(非拷貝);用 012 引入的 sea-orm-adapter(stock、非 013 新拷貝)。

---

## Project Structure

### Documentation (this feature)

```text
specs/013-auth-login-enforce/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交(16/16、0 提問)
├── research.md          # Phase 0(本次,R1-R8;§I.5 未 grep rev1、wire 權威=base-web)
├── data-model.md        # Phase 1(本次)—— sys_role/sys_user_role/nick_name/casbin seed + DTO + JWT claims + AppState
├── contracts/
│   └── verification-commands.md   # Phase 1(本次,C-V §0-§6 + CDP smoke)
├── quickstart.md        # Phase 1(本次,Path A-D)
└── checklists/
    └── requirements.md  # /speckit-specify 已交(16/16 PASS)
```

### Source Code (rust-api worktree + base-web)

```text
rust-api/
├── Cargo.toml                                  ← [workspace.dependencies] 加 jsonwebtoken
├── server/
│   ├── Cargo.toml                              ← 加 jsonwebtoken / casbin(workspace) / sea-orm-adapter(path)
│   └── src/
│       ├── auth/
│       │   ├── jwt.rs                          ← HS256 簽/驗(claims + exp;access/refresh secret 分離)
│       │   └── enforce.rs                      ← rev2 自家 axum middleware + Enforcer(RBAC model + 012 adapter)
│       ├── handler/
│       │   └── auth.rs                         ← login / getUserInfo / refreshToken + 示範 protected stub
│       ├── model/facade/
│       │   ├── sys_role.rs                     ← 角色讀取(facade、守 009 lint)
│       │   └── sys_user_role.rs
│       ├── envelope.rs                         ← Res<T> err/err_msg → impl<T>(§2.11)
│       ├── state.rs                            ← AppState 加 enforcer: Arc<RwLock<Enforcer>>
│       └── main.rs                             ← router /auth/* + 受保護路由 + enforce middleware layer
├── entity/src/
│   ├── sys_role.rs / sys_user_role.rs          ← 新 entity
│   └── sys_user.rs                             ← 加 nick_name
└── migration/src/
    ├── m20260529_000006_create_sys_role.rs
    ├── m20260529_000007_create_sys_user_role.rs   (+ seed role 指派)
    ├── m20260529_000008_alter_sys_user_nick_name.rs (+ seed nick_name)
    └── m20260529_000009_seed_casbin_policy.rs       (示範路由 policy)

base-web/
└── .env*                                       ← VITE_SERVICE_BASE_URL → rev2(BASE-WEB-ADAPT;for CDP smoke)
```

**Structure Decision**：**動 rust-api worktree source**（新增 auth/handler/facade 模組 + 4 migration + entity + Res<T> 泛型 + enforcer）+ base-web `.env`（BASE-WEB-ADAPT 軌道）→ **兩段式 commit**（rust-api worktree commit + push fork、再回外層 bump SHA pin;base-web 若改 .env 亦 worktree commit）。**無新 workspace crate**（模組進 server crate）。沿用 011 in-crate `#[ignore]` 活體 smoke harness + 首次 CDP browser smoke。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 wire 3-端對齊〔base-web typing 權威、camelCase、userId string〕/ R2 JWT〔HS256、claims、jsonwebtoken dep〕/ R3 enforce〔rev2 自家 axum middleware、§11.6 重寫首刀、Enforcer+012 stock adapter〕/ R4 RBAC schema+seed〔sys_role 009 soft-delete / sys_user_role join / nick_name alias / casbin seed / button 矩陣〕/ R5 Res<T> 泛型〔err 移 impl<T>、data 已 Option〕/ R6 error code〔mock §4.11:1000/3333/8888 + deny 5xxx〕/ R7 守恆〔007/008/009 + 無新 crate + prod build sanity〕/ R8 CDP base-web 設定相依〔BASE-WEB-ADAPT .env→rev2〕）。

**結論**：8 項全解析、0 NEEDS CLARIFICATION。**§I.5 遵守**：未 grep rev1（rev2 全新寫、依 base-web 權威設計）。**新增 dep `jsonwebtoken`**（§6 安裝前確認 stable）。**最高風險點**：(a) wire DTO camelCase 對齊 base-web typing（3 端一致）;(b) CDP smoke 的 base-web `.env`→rev2 設定/build 相依。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— sys_role(SoftDeletable)/ sys_user_role(join)/ sys_user.nick_name + casbin policy seed(stock)+ 4 wire DTO(camelCase)+ JWT Claims + casbin RBAC model + AppState.enforcer + button 矩陣。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V §0-§6（既有不破/schema seed/login+getUserInfo+alias/enforce allow+deny/refresh/CDP smoke/scope 邊界）。
- [`quickstart.md`](./quickstart.md)—— Path A 單測 / B login+getUserInfo / C enforce allow+deny / D CDP smoke。

**Agent context update**：CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 7 項：

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍對齊 — data-model 4 DTO 對齊 base-web `auth.d.ts`;示範路由 Phase 4 真實名 | ✅ Pass |
| 2 | 仍僅 BASE-WEB-ADAPT `.env`(CDP smoke);未動 inline | ✅ Pass |
| 3 | enforce 機制(middleware + RBAC model + policy seed)首次落地;menu 過濾留 #2 | ✅ Pass |
| 4 | data-model DTO camelCase + userId string + error code 對齊 mock §4.11 + §I.3 不變式 | ✅ Pass |
| 5 | 全新寫;enforce 重寫(非拷貝);未 grep rev1 | ✅ Pass |
| 6 | 對齊 §11.1/§11.6/§11.7/§11.10/§11.11;casbin_rule stock(不觸 §11.6 adapter 前提) | ✅ Pass |
| 7 | 僅 BASE-WEB-ADAPT(非 ★);RUSTAPI-SOURCE-ISOLATION 全新寫 | ✅ Pass |

**結果**：7 項仍全 PASS。Phase 1 設計未引入未授權 base-web inline 改動 / 違反 wire 不變式 / rev1 拷貝 / ★ 軌道。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7+7=14 全 PASS、無 violations、本段不需填。

> **已知風險（非 violation、implement 時若觸發記 Deviation Log）**：
> - **wire DTO camelCase 對齊**：rust serde `rename_all="camelCase"` 須精確對齊 base-web `auth.d.ts`（`refreshToken`/`userId`/`userName`）;3 端不一致 = runtime/type bug（活體 + CDP smoke 抓）。
> - **CDP smoke 的 base-web 設定/build 相依**（R8）：vite build-time env、base-web 指向 rev2 需改 `.env` + 可能重 build（連動 §2.8/§5.5）;若阻礙致 CDP defer → 記 Deviation + Follow-up 補測（CLAUDE.md §3 風險自覺）。
> - **enforce Enforcer 可變性**：`Arc<RwLock<Enforcer>>` 在 axum middleware 的並發 load/enforce;若遇鎖競爭/型別問題 → 評估 casbin `CachedEnforcer` 或調整,記 Deviation。

---

## Deviation Log（Constitution §V — implement 階段實際偏離 plan/data-model 處）

> executing-plans（subagent-driven-development）實作期間記錄。皆非 Constitution violation,屬 data-model 未列盡的必要實作細節。

- **D-001（T007）AppState 增 `jwt: JwtConfig` 欄**：data-model §6 僅列 `AppState { db, redis, enforcer }`,但 login/getUserInfo/refresh handler 需 JWT secret + TTL 才能簽/驗,而 `JwtConfig` 原僅存在 `main()` boot 的 local `AppConfig`。故 `state.rs` 的 `AppState` 增 `jwt: JwtConfig`(Clone、boot 時 `config.jwt.clone()` 注入);純函式 `auth::jwt::{sign,verify}` 仍以 param 收 secret/ttl(保持可測純度),handler 從 `state.jwt.*` 餵入。**理由**:最小且必要,不違反任何拍板;`enforcer` 仍於 T011 另加。
- **D-002（T007）`argon2` 加入 server crate deps**：`argon2 = "0.5.3"` 原僅在 `[workspace.dependencies]` + `migration` crate 使用,`server` crate 未宣告。login 需 argon2 verify → `server/Cargo.toml` 加 `argon2.workspace = true`。**非新 lockfile dep**(argon2 已在 lock、無版本變動、無新 package),僅補 server crate 的 dep edge。
- **D-003（T007,observation/defer）user-enumeration timing side-channel**：login 的 user-not-found 路徑跳過 argon2 verify(快),found-but-wrong-password 走 argon2(慢 ~數十 ms),為 username 列舉 timing oracle。此威脅模型(admin panel、固定 3 帳號 seed、最小機制證明、無公開註冊)下 **note-and-defer**,登記 [CHECKLIST Follow-up Backlog](../../docs/INTEGRATION-CHECKLIST.md);未來真用戶註冊流程落地時,標準緩解=not-found 路徑對固定 dummy hash 做一次 argon2 verify 以等化時序。
