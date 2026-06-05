# Implementation Plan: single-session admin UI

**Branch**: `029-single-session-admin-ui` | **Date**: 2026-06-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-single-session-admin-ui/spec.md`

## Summary

把 028 的單一-session policy 從「後端/seed/DB 設、系統預設用 config 值(改要重部署)」升級為 **admin 經 UI 控制**:系統預設 **runtime 可調** + 每帳號 policy 由使用者管理頁設定;順帶把「系統設定」做成可擴充的 **KV 框架**(single-session 是第一個設定)。技術途徑:新 `system_settings` KV 表(+ §I.6 審計欄)+ entity + facade + typed accessor;**AppState 加 `session_mode: Arc<RwLock<SessionMode>>` + `settings_watcher`(pub-sub `settings:invalidate`、鏡像 `policy_watcher`)** 使 `is_current` 讀 runtime 系統預設;3 個 **Super-only** 端點(`getSystemSettings`/`updateSystemSetting`/`updateUserSessionPolicy`)+ `getUserList` 加 `sessionPolicy`;sys_menu + casbin seed 讓設定頁選單對 Super 可見;**base-web 新設定頁**(MODAL-WIRING ★ (e)、constitution v1.6.0)+ 使用者頁 policy 欄/列 action。**不改 028 enforcement 邏輯**(`resolve_policy`/`is_current`/gate/refresh 行為不變、只換系統預設來源)。grounding 見 [research.md](research.md);schema/介面見 [data-model.md](data-model.md)。

> **scope 邊界**:029 = admin 控制面 + 通用「系統設定」地基(KV 表 + endpoint + 設定頁)。**動態 metadata-driven settings engine OUT**(per-setting UI);**單一-session 以外的設定 OUT**(框架通用、029 只放 `single_session_default` 一個實際設定);**per-device session OUT**(028 FR-013);**多實例調校 OUT**(pub-sub 給一致性、spec Assumptions 單實例為主)。**雙倉**(rust-api + base-web worktree)。

## Technical Context

**Language/Version**: Rust(workspace、sea-orm 1.1.20 鏈、dev image cargo 1.86)+ base-web(Vue 3 / TS、vite、naive-ui、alova)

**Primary Dependencies**: axum / sea-orm / `redis` `ConnectionManager`(server 既有;**加 `settings:invalidate` PUBLISH/subscribe**,沿 027 PUBLISH + casbin policy_watcher subscribe 用法)/ `serde_json`(audit payload、既有);base-web naive-ui + elegant-router(既有)。**無新 crate、無新 workspace member、無新 dep。**

**Storage**: PostgreSQL(新 `system_settings` 表〔migration m20260529_000028〕+ 既有 `sys_user.session_policy`〔028〕)+ Redis(`settings:invalidate` pub-sub 熱路徑傳播 + 既有 `sess:{uid}` 028 pointer cache)

**Testing**: `cargo test`(純單測 typed accessor + in-crate `#[cfg(test)] #[ignore]` env-gate `DATABASE_URL`+`REDIS_URL` live-DB)+ curl/psql 端到端 + CDP isolated-context + base-web typecheck

**Target Platform**: Linux server(docker dev/prod stack,host 直連 :21081 / base-web :21079 / front-nginx :21080)

**Project Type**: web-service 後端(rust-api)+ 前端(base-web)— **雙倉**(兩 worktree 皆動)

**Performance Goals**: `is_current` 熱路徑改讀 in-memory `Arc<RwLock<SessionMode>>`(RwLock 偏讀、零 per-request DB/Redis 額外);設定變更稀少(寫鎖 + 一次 PUBLISH);per-account 變更 +1 sys_user UPDATE + 1 Redis DEL(非熱路徑)。admin panel 低流量。

**Constraints**: **029 不改 028 enforcement 邏輯**(`resolve_policy` 純函式不動、`is_current`/4-gate/refresh 行為不變、只換系統預設值的**來源**:不可變 config → runtime `Arc<RwLock>`)、**wire additive-only**(`getUserList` 加 `sessionPolicy` = 超集、既有欄不動;新端點 rev2-additive)、**Super-only**、**§I.6 六審計欄真正適用**(`system_settings` 人類 admin 編輯)、**即時性**(系統預設 watcher reload + per-account `DEL sess:{uid}`)、**constitution v1.6.0**(MODAL-WIRING ★ (e) 新管理頁、ratified `3bd3eda`)、既有 server 單測前後綠 + `endpoint_coverage_lint` **30→33** + `entity_access_lint` 守 + migration 可逆 + base-web typecheck 0、**單實例為主**(pub-sub 給多實例一致性、正交)

**Scale/Scope**: 3 seed user + 低並發;`system_settings` 行數小(現 1 列)。base-web 1 新頁 + 使用者頁 1 欄/action。

## Constitution Check

*GATE: 對照 [constitution v1.6.0](../../.specify/memory/constitution.md) §IV 8 項。amendment 已 ratify(`3bd3eda`)→ gate 7 PASS-with-amendment。*

| # | 檢查 | 結果 | 理由 |
|---|---|---|---|
| 1 | §I.1 base-web 權威 — rust-api 缺 base-web 用的 endpoint? | ✅ PASS | rust-api 提供 3 新端點供 base-web 新頁消費;新端點 rev2-additive(mock 無、自家設計)|
| 2 | 動 base-web inline?屬哪條 ★ 軌道?在界? | ✅ PASS | typings `sessionPolicy`+設定型(BASE-WEB-ADAPT 新增)/ 3 service wrapper(BASE-WEB-WRAPPER `rev2-*.ts` 新檔)/ 使用者頁欄+action(MODAL-WIRING (a)/(b))/ **新設定頁(MODAL-WIRING (e)、v1.6.0 ratified)**;皆在界 |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | ✅ PASS | 設定頁選單 = sys_menu `manage_system-settings` 列 + casbin `('p','R_SUPER','manage_system-settings','menu')`;runtime `filter_routes` enforce |
| 4 | wire 對齊 §I.3 mock? | ✅ PASS | `getUserList` 加 `sessionPolicy` = **additive 超集**(既有欄逐字不變、camelCase、ADAPT 加 typing);新端點 rev2-additive(mock 無) |
| 5 | 拷貝 rev1 source? | ✅ PASS | 否;rev2 自家碼,沿既有 facade/handler/migration/watcher/casbin-seed pattern(§I.5)|
| 6 | 凍結到 §II 12 拍板? | ✅ PASS | 不改任一拍板 |
| 7 | 觸及 §III ★ 軌道、在界? | ✅ PASS(amendment) | 新設定頁超出 MODAL-WIRING 原 4 clause → **v1.6.0 amend 加 (e) 同 manage 範式新管理頁**(MINOR、軌道授權邊界擴展、非新軌道;user 親決 ok、ratified `3bd3eda`、DESIGN §11.24);其餘 base-web touch 在既有界 |
| 8 | 新建業務表含 §I.6? | ✅ PASS | `system_settings`(人類 admin 編輯)**含 §I.6 六審計欄**(真正適用、非 028 sys_user 系統欄 PASS-by-scope)|

**結論:8/8 PASS(gate 7 = MODAL-WIRING ★ (e) amendment v1.6.0、ratified `3bd3eda`)。**

**Constitution Note(gate 7,amendment of record)**:029 新增 `views/manage/system-settings/index.vue`(新 view + route + 選單)超出 MODAL-WIRING ★ 原 4 clause(a 接線 / b 按鈕 gating / c 角色權限 modal / d 選單復原-re-parent,皆「改既有 manage 頁」、不含「新增 manage 頁」)。**開窄例外 (e)**:嚴格限「同既有 manage/ 範式(index.vue + 可選 modules、鏡像 user/role/menu)、消費 rev2 端點、route 由 elegant-router 自動生成、選單走 §I.2 Casbin」,不擴張任意新 UI / 非-manage 頁 / 自訂佈局。**MINOR**(§V.3 軌道授權邊界擴展、§11.9「5 軌道/2★」計數不變)、v1.5.0→v1.6.0、user 親決 ok。提案 of record:DESIGN §11.24。

## Project Structure

### Documentation (this feature)
```text
specs/029-single-session-admin-ui/
├── plan.md              # 本檔
├── research.md          # Phase 0(decisions D1-D8 + grounding grep)
├── data-model.md        # Phase 1(system_settings / AppState session_mode / settings_watcher / facade / endpoints / casbin+menu seed / getUserList wire / base-web)
├── contracts/
│   └── verification-commands.md   # Phase 1(C-V 合約)
├── quickstart.md        # Phase 1
└── tasks.md             # Phase 2(/speckit-tasks 產、非本步)
```

### Source Code(雙倉)
```text
rust-api/
├── migration/src/
│   ├── m20260529_000028_create_system_settings.rs   # 新:system_settings 表(+§I.6)+ seed default row
│   ├── m20260529_000029_seed_settings_admin.rs       # 新:3 endpoint casbin + sys_menu 'manage_system-settings' + menu casbin
│   └── lib.rs                                         # 改:註冊 028/029 migration
├── entity/src/
│   └── system_settings.rs                            # 新:system_settings Model
├── server/
│   └── src/
│       ├── state.rs                                  # 改:AppState +session_mode: Arc<RwLock<SessionMode>>
│       ├── main.rs                                   # 改:boot 載 session_mode + spawn_settings_watcher + 3 .route + AppState 構造
│       ├── config.rs                                 # (沿用 parse_session_default 為 boot fallback)
│       ├── auth/
│       │   ├── session.rs                            # 改:is_current 讀 *state.session_mode.read()(替 state.jwt.single_session_default)
│       │   └── settings_watcher.rs                   # 新:spawn_settings_watcher(settings:invalidate,鏡像 policy_watcher)
│       ├── model/facade/
│       │   ├── system_settings.rs                    # 新:get_all/get/update(+011 audit)+ typed accessor
│       │   └── sys_user.rs                           # 改:+update_session_policy(+011 audit)
│       ├── auth/endpoint_auth.rs                     # 改:ENDPOINT_REGISTRY +3 tuple(30→33)
│       └── handler/
│           ├── system_manage.rs                      # 改:+get_system_settings/update_system_setting/update_user_session_policy + UserItem +session_policy
│           └── auth.rs                                # 改:login 讀 *state.session_mode.read()
└── server/tests/endpoint_coverage_lint.rs            # 改:EXPECTED_ROUTE_COUNT 30→33

base-web/
├── src/views/manage/
│   ├── system-settings/index.vue                     # 新:設定頁(MODAL-WIRING (e))
│   └── user/index.vue                                # 改:+sessionPolicy 欄 + 列「設定單一-session」action(MODAL-WIRING (a)/(b))
├── src/service/api/rev2-system-manage.ts             # 新/改:+3 fetch fn(BASE-WEB-WRAPPER)
├── src/typings/api/system-manage.d.ts                # 改:User +sessionPolicy + SystemSetting 型(BASE-WEB-ADAPT)
└── src/locales/langs/{en-us,zh-cn}.ts                # 改:route.manage_system-settings + page.manage.systemSettings + page.manage.user.sessionPolicy
# routes.ts / imports.ts 由 elegant-router 自動生成(無手改)
```
**Structure Decision**:雙倉、沿既有分層(migration/entity/state/config/auth/facade/handler/lint;base-web views/service/typings/i18n);新 `auth/settings_watcher.rs` 鏡像 `policy_watcher.rs`、新 `model/facade/system_settings.rs`、新 `views/manage/system-settings/`;`is_current`/login 只改系統預設讀取來源。

## Complexity Tracking

唯一需 justify 的 Constitution 動作 = **gate 7 MODAL-WIRING ★ (e) amendment**(新設定頁超出原軌道界)。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 新增 base-web 管理頁(超 MODAL-WIRING 原 4 clause)| 029 系統預設 runtime 設定需一個 admin 設定面;base-web 無既有 settings 頁 | 「塞進既有頁」無自然落點(設定面 ≠ user/role/menu CRUD);「不開頁、只 DB 設」就是 028 現狀、029 存在理由即消除它 → 開窄例外 (e)、嚴格限同 manage 範式 |

## Phase 進度

- ✅ **Phase 0**(research.md):decisions D1-D8 + grounding grep(承 029 brainstorm 7 拍板 + plan workflow 7-reader grounding);0 NEEDS CLARIFICATION。
- ✅ **Phase 1**(data-model.md / contracts/ / quickstart.md):schema/AppState/watcher/facade/endpoints/casbin+menu/wire/base-web + C-V 合約 + agent context(CLAUDE.md §6 marker)更新。
- ⏭ **Phase 2**(tasks.md):`/speckit-tasks` 產(非本步)。

## Post-Design Constitution re-check

Phase 1 設計未引入新破口:`system_settings` 含 §I.6;`getUserList` additive;新端點 rev2-additive + Super-only casbin;設定頁選單走 §I.2 Casbin;is_current 只換系統預設來源(028 enforcement 邏輯不變);新設定頁由已 ratify 的 MODAL-WIRING (e) 涵蓋;無新 crate/dep、不動 §II 拍板 → **8/8 PASS 維持**(v1.6.0)。
