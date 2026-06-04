# Implementation Plan: auth DRY refactor(verify_bearer + issue_tokens)

**Branch**: `026-auth-dry-refactor` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/026-auth-dry-refactor/spec.md` + Phase 0 brainstorm [`docs/superpowers/026-auth-dry-refactor.md`](../../docs/superpowers/026-auth-dry-refactor.md)

## Summary

**純內部重構(refactor),wire/response/code 行為零變**。收斂 auth 層兩處系統性重複:**(1)** 5 處 `bearer_token → jwt::verify(access_secret, JWT_AUD) → claims` 前導抽成 `verify_bearer` helper(`enforce_mw` / `get_user_info` / `get_user_routes` / `is_route_exist` / `ctx_mw`);**(2)** 2 處 access+refresh 簽發對抽成 `issue_tokens` helper(`login_attempt_inner` / `refresh_token`)。各 callsite **保留自身失敗策略映射**(enforce fail-closed 403 / route advisory 3333 / ctx best-effort None / 簽發 5000),`verify_bearer` 只回中性 `Option<Claims>`、不決定映射 → §2.18 fail-closed/open 分歧自然保留並文件化。**roles 查詢段刻意留 inline**(3 變體 + 2 錯誤策略,強抽 CP 值低,Approach A 親決)。唯一可觀察差異:4 條 verify-failed debug log 合併為 helper 內 1 條(response/code 零變,親決)。**無新端點/表/crate/dep/migration、不動 base-web/casbin policy、無 amendment**。

## Technical Context

**Language/Version**: Rust 1.x(rust-api `server` crate;axum middleware/handler + `jsonwebtoken` JWT + casbin enforce + `tracing`)

**Primary Dependencies**: 既有 —— axum、`jsonwebtoken`(`jwt::sign`/`verify`)、casbin(`enforce_mw`,**不動**)、`tracing`。**無新 crate / 無新 dep**。

**Storage**: N/A —— 本波**不碰 schema / 無 migration / 不碰 casbin_rule**。

**Testing**: `dcargo test -p server`(host 無 cargo,dev docker image)—— **既有 auth 測試前後逐字不變為主驗**(`auth.rs`/`route.rs`/`enforce.rs`/`bearer.rs`/`jwt.rs` 單測 + live-DB `#[ignore]` 驗收)+ **2 個新 helper 單測**(`verify_bearer` / `issue_tokens`)。

**Target Platform**: Linux docker dev stack(rust 改 `dcargo build -p server` + `restart rust-api`;本波無 migration、無 base-web restart)。

**Project Type**: Web(rust-api + base-web 兩 worktree),但**本波純 rust-api 單倉**(base-web 不動)。

**Performance Goals**: N/A(refactor、無熱路徑變更;`verify_bearer` 為 inline 等價的兩段呼叫合成)。

**Constraints**: **零行為變更**(既有測試前後不變);各 callsite 失敗策略保留(403/3333/None/5000);`verify_bearer` 簽名鏡像 `jwt::verify(token, secret, aud)`、回 `Option<Claims>`(不耦合 `JwtConfig`)。

**Scale/Scope**: rust-api `server`:+`verify_bearer`(bearer.rs)、+`issue_tokens`(handler/auth.rs)、改 7 callsite(5 verify + 2 sign)、+2 helper 單測。**0 新檔**(helper 入既有檔)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* 對照 **constitution v1.5.0**(§IV 8 項),逐項 yes/no:

1. **§I.1 base-web 權威 / rust 未提供對應 endpoint?** ✅ **N/A** —— 本波**無新 endpoint、不動既有 endpoint 契約**(純內部重構);base-web 不消費任何新東西。
2. **動 base-web inline?屬哪 ★ 軌道?邊界內?** ✅ **N/A** —— **完全不動 base-web**(rust-api 單倉)。
3. **menu 顯示走 Casbin enforce?(§I.2)** ✅ **N/A** —— 不碰 menu 可見性 / casbin policy;`enforce_mw` 被重構但**行為逐字不變**(同樣 (role,path,method) enforce、同樣 403/3333)。
4. **wire 對齊 §I.3 mock?** ✅ **PASS** —— **wire/envelope/id 型/error code/enum 全不變**(refactor、零行為變更);login/getUserInfo/getUserRoutes/refresh 回應逐字一致。
5. **從 rev1 拷貝 code?** ✅ **PASS** —— 否;重構的是 **rev2 自家 auth 碼**(013/014/015/018 寫的),非拷貝。
6. **凍結到 §II 12 拍板?** ✅ **PASS** —— 無 §II 拍板變動;helper 為**機械式抽取**,不改任何業務決策(token TTL/secret/claims/失敗碼皆不變)。
7. **觸及 ★ 軌道?邊界內?** ✅ **N/A** —— 不動 base-web,**MODAL-WIRING ★ / BASE-WEB-BUILD-CONFIG ★ 皆未觸及**;`RUSTAPI-SOURCE-ISOLATION`(rust-api 自家碼演進)為非-★ 自由軌道。
8. **新建業務表 + §I.6?** ✅ **N/A** —— 不建表、不加欄、無 migration。

**結論:§IV 8/8 PASS**(7 項 N/A + 2 項 PASS,**無 finding、無 amendment**)。**Constitution v1.5.0 §IV 8/8 PASS。**

**Post-Phase-1 re-check**:design 未引入任何違規 —— 不建表(#8 N/A)、不動 base-web(#1/#2/#7 N/A)、wire 不變(#4 PASS)、非拷貝(#5 PASS)、§II 不動(#6 PASS)→ **維持 8/8 PASS**。

## Project Structure

### Documentation (this feature)

```text
specs/026-auth-dry-refactor/
├── plan.md              # 本檔
├── research.md          # Phase 0:grounded 5 callsites + 2 sign sites + JwtConfig/Claims 型 + nick_name 已解
├── data-model.md        # Phase 1:2 helper 介面 + callsite 改法表(無實際資料 model)
├── quickstart.md        # Phase 1:dev 跑通 + 核心驗(dcargo test)
├── contracts/
│   └── verification-commands.md   # Phase 1:refactor C-V(既有測試前後不變 + helper 單測 + 守恆 + curl 等價 smoke)
├── checklists/requirements.md     # specify 階段產
└── tasks.md             # Phase 2(/speckit-tasks 產、非本步)
```

### Source Code(repository root)

```text
rust-api/  (worktree, submodule)
└── server/src/
    ├── auth/bearer.rs          # 改:+`verify_bearer(headers, secret, aud) -> Option<Claims>`(與既有 bearer_token 同檔)+ 單測
    ├── auth/enforce.rs         # 改:enforce_mw 改呼叫 verify_bearer(roles/fail-closed 不動)
    ├── handler/auth.rs         # 改:+`issue_tokens(user_id, roles, &JwtConfig) -> Result<LoginToken, jwt::Error>` + 單測;login_attempt_inner/refresh_token 改呼叫;get_user_info 改呼叫 verify_bearer(user-load/roles 不動)
    ├── handler/route.rs        # 改:get_user_routes/is_route_exist 改呼叫 verify_bearer(ordered/roles/home 不動)
    └── audit_ctx.rs            # 改:ctx_mw 改 verify_bearer(...).map(|c| c.user_id)
```

**Structure Decision**:Web(rust-api + base-web 兩 worktree),**本波純 rust-api `server` crate 內重構**;`verify_bearer` 入既有 `auth/bearer.rs`(與 `bearer_token` 同檔、cohesive)、`issue_tokens` 入既有 `handler/auth.rs`(近 `LoginToken` wire DTO);**0 新檔、0 新 crate**。base-web worktree 不動。

## Complexity Tracking

> Constitution Check **8/8 PASS、無 violation** → 本表無需填(無需 justify)。

| 項 | 說明 | 處置 |
|---|---|---|
| (無) | §IV 8/8 PASS、純 refactor、無新表/crate/dep/fork/amendment | — |

**唯一設計取捨記錄**(非 violation):
| 取捨 | 決策 | 理由 |
|---|---|---|
| roles 段是否抽 | **不抽、留 inline** | 4 callsites 3 變體(`roles_for_user`/`_ordered`/+user-load)+ 2 錯誤策略(403/3333)→ 強抽需 typed-error 抽象、收益 < 成本(Approach A 親決) |
| debug log | **合併** verify-failed 4 條 → helper 1 條 | response/code 零變;收斂重複 log(親決) |
| metrics/observability | **defer Phase 6** | 避免與 obs-stack(loki/prometheus)設計返工(research §5) |
