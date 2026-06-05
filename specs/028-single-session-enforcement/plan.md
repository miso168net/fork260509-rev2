# Implementation Plan: single-session enforcement

**Branch**: `028-single-session-enforcement` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/028-single-session-enforcement/spec.md`

## Summary

把 027 刻意維持的「access stateless、多裝置並存」升級為 **per-account 可控的 access 端單一-session**:政策解析=開的帳號,一次只能一個有效登入、新登入即時踢舊(舊 session 下個請求回 `7777`「账号在他处登录」→ 乾淨登出);解析=關維持 027 多裝置。**028 = 後端引擎 + policy 儲存**(base-web 零改、無新對外端點);管理 UI 拆 029。技術途徑:`Claims` 加 `sid`(獨立 uuid、required)、pointer = **Redis(讀)+ sys_user(持久真相)混合**、session 檢查注入 **4 認證 gate**(+ refresh)、登入 revoke 舊鏈、policy = sys_user 三態 + config 系統預設(**028=off、dormant 上線**)。grounding 見 [research.md](research.md);schema/狀態機/介面見 [data-model.md](data-model.md)。

> **scope 邊界**:028 純後端引擎 + policy 儲存(policy 後端/DB/seed 設);**圖形管理 UI**(系統預設 runtime 可調 + 使用者管理頁逐帳號設定 + endpoint + casbin + base-web 頁)= **獨立 feature 029**(疊在 028 儲存之上)。**真正 per-device「每裝置一個 session」OUT**(乙 解讀:policy=關 即多裝置;見 spec FR-013)。

## Technical Context

**Language/Version**: Rust(workspace,sea-orm 1.1.20 鏈,dev image cargo 1.86)

**Primary Dependencies**: axum / sea-orm 1.1.20 / jsonwebtoken / `uuid` v4(server 既有)/ `chrono`(027 已加 server dep)/ `redis` `ConnectionManager`(server 既有、**加 GET/SET 用法**,現只用 PUBLISH)。**無新 crate、無新 workspace member。**

**Storage**: PostgreSQL(`sys_user` 加 2 系統欄,migration 027)+ Redis(pointer 熱路徑 cache,持久真相在 sys_user)

**Testing**: `cargo test`(純單測:`resolve_policy` 三態)+ in-crate `#[cfg(test)] #[ignore]` env-gate `DATABASE_URL` live-DB(server bin-only)+ curl/psql 端到端 + CDP(isolated context)

**Target Platform**: Linux server(docker dev/prod stack,host 直連 :21081)

**Project Type**: web-service 後端(rust-api 單倉;**base-web 不動**)

**Performance Goals**: 受保護請求 +1 pointer 讀(Redis GET 熱路徑;miss→1 次 sys_user read + 回填);login +1 sys_user UPDATE + Redis SET(非熱路徑)。admin panel 低流量、廉。

**Constraints**: **wire 中性**(`LoginToken{token,refreshToken}` / 登入·換新成功回應結構逐字不變、`Claims` 加 `sid` 為 internal)、踢碼 **`7777`**(失敗類 **絕不** `3333/9999/9998`)、access 端由 stateless → 可被 session 撤銷(§11.17 018 先例同軸延伸)、**`is_current` I/O 失敗 fail-open**(放行 + log warn;與 enforce_mw 主授權閘 fail-closed 為**不同層** — session 檢查是附加收斂、非主閘,見 data-model §6)、既有 **218** server 單測前後綠 + lint 17/30、migration up→down→up 可逆、**base-web 零改**、**無新對外端點**

**Scale/Scope**: 3 seed user + 低並發;**單實例為主**(混合 store 持久層=真相、cache=熱路徑;多實例下持久層保證一致性、正交);`sys_user` 行數小

## Constitution Check

*GATE: 對照 [constitution v1.5.0](../../.specify/memory/constitution.md) §IV 8 項。*

| # | 檢查 | 結果 | 理由 |
|---|---|---|---|
| 1 | §I.1 base-web 權威 — 未提供 base-web 用的 endpoint? | ✅ PASS(N/A) | 028 不缺 endpoint;踢用既有 `7777`(base-web modalLogoutCodes 分支已處理)、無缺 |
| 2 | 動 base-web inline?屬哪條 ★ 軌道? | ✅ PASS(N/A) | **base-web 零改**(wire 中性、`7777` 現成、`Claims` internal);無 MODAL-WIRING/BUILD-CONFIG |
| 3 | menu 顯示走 Casbin enforce? | ✅ PASS(N/A) | 028 為 auth/session,不涉 menu |
| 4 | wire 對齊 §I.3 mock? | ✅ PASS | 登入/換新成功回應逐字不變;踢用既有 `7777`(ModalLogout「账号在他处登录」、mock/前端既有碼);**絕不** `3333/9999/9998`;`Claims` 加 `sid` = **internal**(base-web opaque、mock JWT 無 session_id → 非 wire 面) |
| 5 | 從 rev1 source 拷貝 code? | ✅ PASS | 否;rev2 自家碼,沿既有 facade/handler/migration/enforce pattern(Phase 0 未 grep rev1、§I.5) |
| 6 | 凍結到 §II 12 拍板? | ✅ PASS | 不改任一拍板;**access stateless 非凍結拍板**(§11.17:013 D4 為 feature-level deviation、018 已將 enforce 改 stateful 且明文「不需 amendment」)→ 028 同軸延伸、無 amendment |
| 7 | 觸及 §III ★ 軌道? | ✅ PASS(N/A) | base-web 零改 |
| 8 | 新建業務表含 §I.6 六審計欄? | ✅ PASS(scope) | **不新建表**;`sys_user` **加 2 系統欄**(`current_session_id`/`session_policy`)= 機器管理(login/policy 機制設、非 human operator)→ §I.6 六審計欄(追 human operator 的 `*_by`)規則前提不成立、PASS-by-scope。**見下方 Constitution Note** |

**結論:8/8 PASS,無 amendment 必需。**

**Constitution Note(#6 + #8,提呈 user)**:
- **#6 access stateful**:013 D4「stateless refresh」+ 早期 access stateless 是 **feature-level deviation、非 §II 凍結拍板**(constitution grep `stateless/session/撤銷` 零命中)。§11.17(018)已把 `enforce_mw` 改 per-request DB-fresh roles(stateful)、明文判定「不需 amendment」。028 加 session pointer = **同一條軸的延伸**(「valid token 但被 superseded 拒收」,較 018「valid token 但 fresh authz deny」更進一步、仍非違反任何凍結規則)。**預期不需 amendment**;可選:把「access 可被 session 撤銷」記為 DESIGN §11 新拍板(釐清、非 amend 既有項,鏡像 §11.17 記法)。
- **#8 sys_user 加系統欄(ALTER 非 CREATE)**:**§I.6 六審計欄規則在「業務表 CREATE」觸發 → 本 feature 是 sys_user ALTER 加欄、規則字面不觸發**;且 sys_user 本身已含六審計欄(017 retrofit)。兩新欄性質:`current_session_id` 純機器管理(login 寫、無 human operator);`session_policy` **將在 029 由 admin 經 UI 設定(確有 human operator)**,但其變更稽核走 **011 operation-log**(記誰改了誰的 policy)、**非** per-column `*_by`(per-column `*_by` 是列級操作者欄、policy flag 不適用)。故 PASS-by-scope 的立論 = **ALTER-非-CREATE + 既有六審計欄 + 029 policy 變更由 011 audit 涵蓋**(**非**以「session_policy 無 human operator」為由 — 該理由對 session_policy 不成立、僅對 current_session_id 成立)。data-model §7 已註:028 policy 由 seed/psql 設、029 加 `update_session_policy` facade(守 009 + 011 audit)。

## Project Structure

### Documentation (this feature)
```text
specs/028-single-session-enforcement/
├── plan.md              # 本檔
├── research.md          # Phase 0(decisions D1-D11 + grounding grep)
├── data-model.md        # Phase 1(sys_user +2 欄 / config / Claims / pointer / 狀態機 / facade / handler)
├── contracts/
│   └── verification-commands.md   # Phase 1(C-V 合約)
├── quickstart.md        # Phase 1
└── tasks.md             # Phase 2(/speckit-tasks 產、非本步)
```

### Source Code (rust-api worktree)
```text
rust-api/
├── migration/src/
│   ├── m20260529_000027_alter_sys_user_session.rs   # 新:sys_user +2 欄(current_session_id / session_policy)
│   └── lib.rs                                         # 改:新增 m20260529_000027 入 Migrator(接 026 之後)
├── entity/src/
│   └── sys_user.rs                                    # 改:+2 欄(current_session_id Option<String> / session_policy String)
├── server/
│   ├── src/
│   │   ├── config.rs                                  # 改:+single_session_default(系統預設、預設 off)
│   │   ├── auth/
│   │   │   ├── jwt.rs                                 # 改:Claims +sid(required)、sign 加 session_id 參
│   │   │   ├── enforce.rs                             # 改:enforce_mw verify 後加 session::is_current 檢查 → 7777
│   │   │   └── session.rs                             # 新:resolve_policy(純)+ is_current + set_pointer + get(Redis+sys_user 混合)
│   │   ├── model/facade/
│   │   │   ├── sys_token.rs                           # 改:加 revoke_other_chains(user_id, keep_chain)
│   │   │   └── sys_user.rs                            # 改:加 current_session_id 讀/寫 + session_policy 讀(唯一寫入管道)
│   │   └── handler/
│   │       ├── auth.rs                                # 改:login(鑄 sid→issue_tokens→set_pointer→revoke 舊鏈)/ refresh(繼承 sid + 驗 pointer)/ get_user_info(+is_current)
│   │       └── route.rs                               # 改:get_user_routes / is_route_exist(+is_current)
```
**Structure Decision**:rust-api 單倉、沿既有分層(migration/entity/config/auth/facade/handler);新 `auth/session.rs` 收斂 policy 解析 + pointer 混合存取 + session 檢查;base-web 不動。

## Complexity Tracking

無 Constitution 違規需 justify(8/8 PASS)。唯二需 user 知會 = #6(access stateful = §11.17 同軸延伸、不需 amend)與 #8(sys_user 系統欄 §I.6 PASS-by-scope)— 見 Constitution Note。

## Phase 進度

- ✅ **Phase 0**(research.md):decisions D1-D11 + grounding grep 全落地(承 028 brainstorm 4-reader workflow + 3 確認 + 027 實作知識);0 NEEDS CLARIFICATION。
- ✅ **Phase 1**(data-model.md / contracts/ / quickstart.md):schema/config/Claims/pointer/狀態機/facade/handler + C-V 合約 + agent context(CLAUDE.md §6 marker)更新。
- ⏭ **Phase 2**(tasks.md):`/speckit-tasks` 產(非本步)。

## Post-Design Constitution re-check

Phase 1 設計未引入新 base-web/casbin/wire endpoint 變更、未加 workspace crate、未動 12 拍板;sys_user 加系統欄(非新表、非業務欄)、踢用既有 `7777`、`Claims` 改 internal → **8/8 PASS 維持**(#6/#8 scope 解讀不變)。
