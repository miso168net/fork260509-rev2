# Implementation Plan: refresh token rotation

**Branch**: `027-refresh-token-rotation` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/027-refresh-token-rotation/spec.md`

## Summary

把 013 的最小無狀態 refresh 升級為 **DB 持久化 rotation chain + 盜用偵測 + grace 寬限窗口 + SHA-256 雜湊儲存**。新建 `sys_token` 表 + entity + 唯一寫入 facade(`create_chain_head` + `rotate` 狀態機)+ 改 `login`/`refresh_token` 兩 handler 串接。**wire 中性**(`LoginToken`/access token/Claims 逐字不變、失敗碼維持 `8888`)、**base-web 零改**、**無新 workspace crate / 無 amendment / 無 fork**。技術途徑與 grounding 見 [research.md](research.md);表/狀態機/facade 介面見 [data-model.md](data-model.md)。

> **scope 邊界**:「一帳號單一登入 + 即時踢」(access-side stateful)經機制 workflow 評估**拆為獨立 feature 028-single-session-enforcement**(027 落地後做);本 plan 維持 027 純 refresh-side scope(spec Clarifications)。

## Technical Context

**Language/Version**: Rust(workspace MSRV 1.88,sea-orm 1.1.20 鏈)

**Primary Dependencies**: axum / sea-orm 1.1.20(`with-ipnetwork`,**無 `with-uuid`**)/ jsonwebtoken / `uuid` v1(server 既有)/ **`sha2`(新增 server 直接 dep,已在 Cargo.lock)**

**Storage**: PostgreSQL(新表 `sys_token`);Redis 不涉

**Testing**: `cargo test`(純單測:`decide_rotation`/`sha256_hex`/SQL-build seam)+ in-crate `#[cfg(test)] #[ignore]` env-gate `DATABASE_URL` live-DB(server bin-only)+ curl/psql 端到端 + CDP(建議)

**Target Platform**: Linux server(docker dev/prod stack,host 直連 :21081)

**Project Type**: web-service 後端(rust-api 單倉;base-web 不動)

**Performance Goals**: refresh hot-path +1 indexed 交易(FOR UPDATE 鎖命中 row);login +1 insert。皆 admin panel 低流量、廉。

**Constraints**: wire 中性(`LoginToken`/access/Claims 逐字不變)、失敗碼 `8888`/`5000` 絕不 `3333/9999/9998`、stale-but-unexpired access 還原(getUserInfo)不破、migration up→down→up 可逆、既有 206 單測前後綠 + lint 17/30

**Scale/Scope**: 3 seed user + 低並發;`sys_token` row 持續累積(實體清理 = 後續 cleanup-job feature)

## Constitution Check

*GATE: 對照 [constitution v1.5.0](../../.specify/memory/constitution.md) §IV 8 項。*

| # | 檢查 | 結果 | 理由 |
|---|---|---|---|
| 1 | §I.1 base-web 權威 — 未提供 base-web 用的 endpoint? | ✅ PASS | refresh 端點已存在;027 補後端狀態、未缺 endpoint |
| 2 | 動 base-web inline?屬哪條 ★ 軌道? | ✅ PASS(N/A) | **base-web 零改**(wire 中性);無 MODAL-WIRING/BUILD-CONFIG |
| 3 | menu 顯示走 Casbin enforce? | ✅ PASS(N/A) | 027 為 auth/token,不涉 menu |
| 4 | wire 對齊 §I.3 mock? | ✅ PASS | `LoginToken{token,refreshToken}` 不變;refresh 失敗 `8888`(refresh critical 碼、非業務 2222);DbErr `5000`(基建);**絕不** `3333/9999/9998` |
| 5 | 從 rev1 source 拷貝 code? | ✅ PASS | 否;rev2 自家碼,沿既有 migration/facade/entity pattern(Phase 0 未 grep rev1) |
| 6 | 凍結到 §II 12 拍板? | ✅ PASS | 不改任一拍板;無 amendment |
| 7 | 觸及 §III ★ 軌道? | ✅ PASS(N/A) | base-web 零改 |
| 8 | 新建業務表含 §I.6 六審計欄? | ✅ PASS(scope) | `sys_token` = **session/token 基礎設施表、非業務主表** → §I.6 六審計欄規則前提不成立;帶自身 lifecycle 欄(issued/expires/used/created)。平行 `sys_login_attempt`/`sys_access_log` infra 表。**見下方 Constitution Note** |

**結論:8/8 PASS,無 amendment 必需。**

**Constitution Note(#8,提呈 user)**:§I.6 例外清單字面列「append-only 審計表」「join 表」,`sys_token` 是**可變狀態 session infra**(status active→used→revoked,非 append-only、非 join),不字面落任一既列例外。但 §I.6 規則本身只約束「**業務主表**」(追 human operator 的 *_by 欄),sys_token 無 human operator(機器代認證使用者建立/輪替)→ 非業務主表、規則不適用(PASS by scope)。**可選**:§I.6 PATCH amendment 把「session/token lifecycle infra 表」explicit 列為非業務主表示例(釐清、不改規則語義;依 §V.2 須 user 親決)。**推薦接受 scope 解讀、不 amend**;若 user 要 explicit 化再走 amendment 流程。

## Project Structure

### Documentation (this feature)
```text
specs/027-refresh-token-rotation/
├── plan.md              # 本檔
├── research.md          # Phase 0(decisions + grounding grep)
├── data-model.md        # Phase 1(sys_token 表/entity/狀態機/facade)
├── contracts/
│   └── verification-commands.md   # Phase 1(C-V 合約)
├── quickstart.md        # Phase 1
└── tasks.md             # Phase 2(/speckit-tasks 產、非本步)
```

### Source Code (rust-api worktree)
```text
rust-api/
├── migration/src/
│   ├── m20260529_000026_create_sys_token.rs   # 新:建表 + 2 index(partial 走 raw SQL)
│   └── lib.rs                                   # 改:註冊 026
├── entity/src/
│   ├── sys_token.rs                             # 新:DeriveEntityModel(鏡像 sys_login_attempt)
│   └── lib.rs                                   # 改:pub mod sys_token
├── server/
│   ├── Cargo.toml                               # 改:加 sha2 dep
│   └── src/
│       ├── model/facade/
│       │   ├── sys_token.rs                     # 新:decide_rotation(純)+ create_chain_head + rotate + sha256_hex
│       │   └── mod.rs                           # 改:pub mod sys_token
│       └── handler/auth.rs                      # 改:login_attempt_inner(建 chain head)+ refresh_token(走 rotate)
```
**Structure Decision**:rust-api 單倉、沿既有分層(migration/entity/facade/handler);base-web 不動。

## Complexity Tracking

無 Constitution 違規需 justify(8/8 PASS)。唯一需 user 知會 = #8 的 §I.6 scope 解讀(見 Constitution Note,推薦不 amend)。

## Phase 進度

- ✅ **Phase 0**(research.md):decisions D1-D10 + grounding grep 全落地;0 NEEDS CLARIFICATION。
- ✅ **Phase 1**(data-model.md / contracts/ / quickstart.md):表/entity/狀態機/facade 介面 + C-V 合約 + agent context 更新。
- ⏭ **Phase 2**(tasks.md):`/speckit-tasks` 產(非本步)。

## Post-Design Constitution re-check
Phase 1 設計未引入新 base-web/casbin/wire 變更、未加 workspace crate、未動 12 拍板 → **8/8 PASS 維持**(#8 scope 解讀不變)。
