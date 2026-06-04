---
description: "Task list — 026 auth-dry-refactor"
---

# Tasks: auth DRY refactor (026)

**Input**: Design documents from `/specs/026-auth-dry-refactor/`
**Prerequisites**: plan.md ✅(§IV 8/8 PASS、無 amendment)/ spec.md ✅(0 NEEDS CLARIFICATION)/ research.md ✅ / data-model.md ✅ / contracts/ ✅
**Tests**: **新純單測 = `verify_bearer`(TDD red→green)+ `issue_tokens`(TDD red→green)**(FR-006);**7 callsite 遷移 = 純 refactor wiring → 無新測試,由既有 auth 測試前後逐字不變驗證**(refactor 紀律,plan/contracts 明示)。
**Organization**: 依 spec user story(US1 P1 MVP verify_bearer / US2 P2 issue_tokens / US3 P3 fail-closed 文件)。**純 rust-api 單倉、不動 base-web**。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:不同檔、無未完成依賴 → 可平行
- **[Story]**:US1/US2/US3(Setup/Polish 無 story label)

## 機制鏡像來源(實作對照,勿盲信本檔命名,grep actual code)
- helper 基:`auth/bearer.rs`(`bearer_token`@14、4 單測)/ `auth/jwt.rs`(`jwt::verify(token,secret,aud)→Result<Claims>`、`jwt::sign(uid,roles,secret,ttl,iss,aud)`、`JWT_AUD`/`JWT_ISS`、`Claims{user_id,roles}`)
- 5 verify callsites:`enforce_mw`(`auth/enforce.rs:60`,bearer/verify→3333、**roles-DB→403/5003 fail-closed**)/ `get_user_info`(`handler/auth.rs:209`,全→3333、+user-load nick_name)/ `get_user_routes`(`handler/route.rs:39`,`roles_for_user_ordered`+home)/ `is_route_exist`(`handler/route.rs:125`)/ `ctx_mw`(`audit_ctx.rs:110`,best-effort→None)
- 2 sign callsites:`login_attempt_inner`(`handler/auth.rs:152-187`)/ `refresh_token`(`handler/auth.rs:298-327`);`JwtConfig` 欄 `jwt_secret`/`refresh_token_secret`/`access_token_ttl_secs`/`refresh_token_ttl_secs`;`LoginToken{token,refresh_token}`
- 守恆:`entity_access_lint`(17)/ `endpoint_coverage_lint`(30,**不動**)/ `Migrator::up`=0

---

## Phase 1: Setup

- [ ] T001 確認前置:`rust-api/` worktree 在 `rev2-admin-rust-api`;dev stack up。**記錄重構前 baseline** 供等價對照:`dcargo test -p server` 現綠(含既有 auth 單測 + live-DB `#[ignore]`)、curl smoke 各碼 baseline(login 0000/1000、getUserInfo 0000/3333、getUserRoutes 0000、enforce Admin 5003·no-token 3333、refresh 0000/8888)、`entity_access_lint` 17、`endpoint_coverage_lint` 30。Constitution v1.5.0 §IV 8/8 PASS(plan 確認)。

---

## Phase 2: Foundational (Blocking Prerequisites)

> **無共用阻塞前置** —— US1(`verify_bearer`)與 US2(`issue_tokens`)各建於既有 code、相互獨立(不同 helper);US3 為 US1 的文件。直接進 US1。**同檔注意**:US1 的 `get_user_info` 遷移與 US2 的 `issue_tokens`+login/refresh 同在 `handler/auth.rs` → worktree 內順序 commit(避 git index 衝突)、US1 先(MVP)。

---

## Phase 3: US1 (P1 MVP) — verify_bearer(5 callsites bearer→verify 收斂)

**Goal**:把 5 處 `bearer_token→jwt::verify→claims` 前導收斂成 `verify_bearer`,各 callsite 保留失敗映射;行為零變。
**Independent Test**:`verify_bearer` 單測綠 + 既有 auth 測試前後不變 + curl getUserInfo/getUserRoutes/enforce/no-token 各碼 == baseline。(contracts §1、§2 c/d/e/f)

- [ ] T002 [US1] (TDD) 改 `rust-api/server/src/auth/bearer.rs` —— 依 [data-model §1、R1]:新 `pub fn verify_bearer(headers: &HeaderMap, secret: &str, aud: &str) -> Option<Claims>`(`bearer_token(headers)? → jwt::verify(token,secret,aud)`:`Ok→Some`、`Err→{ tracing::debug!(error=%e, "auth: bearer JWT verify failed"); None }`、bearer 缺→靜默 None)。**單測先寫(red→green)**:valid 簽發 token→`Some`(claims 對)/ 無 header→`None` / 壞簽名→`None` / 過期→`None` / 錯 aud→`None`(沿 `jwt` sign/verify fixture + `bearer_token` header fixture)。import `Claims`/`jwt`/`HeaderMap`。
- [ ] T003 [US1] 改 5 callsite 呼叫 `verify_bearer`(依 [data-model §3.1],**各保留失敗映射、不動 roles/user-load/home/casbin**):① `auth/enforce.rs` `enforce_mw`(@60:兩段→`let Some(claims)=verify_bearer(req.headers(),&state.jwt.jwt_secret,JWT_AUD) else { return Res::<()>::err(BizCode::TokenExpired).into_response(); };`;roles+403 fail-closed 段不動)② `handler/auth.rs` `get_user_info`(@209:→`let Some(claims)=verify_bearer(&headers,&state.jwt.jwt_secret,JWT_AUD) else { return Res::err(BizCode::TokenExpired); };`;user-load+roles+buttons 不動)③ `handler/route.rs` `get_user_routes`(@39,同式;ordered+home 不動)④ `handler/route.rs` `is_route_exist`(@125,同式)⑤ `audit_ctx.rs` `ctx_mw`(@110:→`verify_bearer(headers,&state.jwt.jwt_secret,JWT_AUD).map(|c| c.user_id)`)。清掉因此產生的 orphan import(若有)。依賴 T002。

**Checkpoint US1**:`dcargo build -p server` 綠 + `dcargo test -p server verify_bearer`(5 case)+ `dcargo test -p server` 既有 auth 測試**前後不變**全綠 + curl §2(c)getUserInfo 0000 /(d)no·bad token 3333 /(e)getUserRoutes 0000 /(f)enforce Admin 5003·no-token 3333 == baseline。

---

## Phase 4: US2 (P2) — issue_tokens(2 callsites 簽發收斂)

**Goal**:把 login 與 refresh 的 access+refresh 簽發對收斂成 `issue_tokens`,保留 5000 失敗映射;行為零變。
**Independent Test**:`issue_tokens` 單測綠 + 既有 login/refresh 測試前後不變 + curl login/refresh 各碼 == baseline。(contracts §1、§2 a/b/g)

- [ ] T004 [US2] (TDD) 改 `rust-api/server/src/handler/auth.rs` —— 依 [data-model §2、R2]:新私有 `fn issue_tokens(user_id: i64, roles: Vec<String>, jwt: &JwtConfig) -> Result<LoginToken, jwt::JwtError>`(簽 access〔`jwt_secret`/`access_token_ttl_secs`〕+ refresh〔`refresh_token_secret`/`refresh_token_ttl_secs`〕、`JWT_ISS`/`JWT_AUD`、`?` 傳播、回 `LoginToken{token,refresh_token}`)。**單測先寫(red→green)**:給 user_id+roles → 回 `LoginToken`;`token` 用 `jwt_secret`+JWT_AUD verify 得回 user_id/roles;`refresh_token` 用 `refresh_token_secret`+JWT_AUD verify 得回 user_id/roles(需 test 用 `JwtConfig` fixture)。
- [ ] T005 [US2] 改 2 callsite 呼叫 `issue_tokens`(依 [data-model §3.2],保留 `Err→Internal(5000)` 映射):① `login_attempt_inner`(@152-187:`let token = match issue_tokens(user.id, roles, &state.jwt) { Ok(t)=>t, Err(e)=>{ tracing::error!(error=%e,"login: token signing failed"); return Err(BizCode::Internal); } }; Ok((token, user.id))`)② `refresh_token`(@298-327:`let token = match issue_tokens(claims.user_id, claims.roles, &state.jwt) { Ok(t)=>t, Err(e)=>{ tracing::error!(error=%e,"refresh_token: token signing failed"); return Res::err(BizCode::Internal); } }; Res::ok(token)`)。回型不變。依賴 T004。**同檔 T003-②(get_user_info)→ 順序 commit**。

**Checkpoint US2**:`dcargo test -p server issue_tokens`(round-trip)+ 既有 login/refresh 測試前後不變 + curl §2(a)login 0000+token 對 /(b)login bad 1000 /(g)refresh 0000+新 token·bad 8888 == baseline。

---

## Phase 5: US3 (P3) — fail-closed/open 策略文件化

**Goal**:把三種驗證失敗策略(刻意分歧)明文記錄,供未來新 callsite 選對策略。
**Independent Test**:文件(verify_bearer doc-comment + spec)清楚記三策略;無行為驗。

- [ ] T006 [US3] 文件化 §2.18(依 [contracts §3]):`auth/bearer.rs` `verify_bearer` doc-comment 補註三策略 —— `enforce_mw`=**fail-closed**(roles-DB 失敗→403/5003、不誤導重驗)、route handlers+`get_user_info`=**advisory**(token/roles→3333 叫重驗)、`ctx_mw`=**best-effort**(失敗→operator_id None、不擾請求);並註「`verify_bearer` 只回 `Option`、不決定映射」。確認 spec.md US3/FR-004/005 已載(specify 階段已寫)。**無 code 邏輯改**。

---

## Phase 6: Polish & Cross-Cutting

- [ ] T007 holistic C-V acceptance:跑 contracts/verification-commands.md 全節 —— §1 守恆(`dcargo test -p server` 全綠〔含 verify_bearer + issue_tokens 新測 + 既有前後不變〕+ `--test entity_access_lint` 17 + `--test endpoint_coverage_lint` 30 + `grep Migrator::up server/src`=0)+ §2 curl 等價 smoke(a)-(g) 每碼 == baseline(login 0000/1000·getUserInfo 0000/3333·getUserRoutes 0000·enforce 5003/3333·refresh 0000/8888)+ §3 doc check。**無新 crate → prod image build 非強制**。base-web 不動(無 typecheck)。
- [ ] T008 文件回填:`docs/INTEGRATION-DESIGN.md` 補「auth DRY refactor as-built」精簡段(§6 auth 層 或 §10 Phase 3 餘:verify_bearer 5 callsites / issue_tokens 2 callsites / fail-closed 三策略 / 行為零變)+ CHECKLIST §1 最新進展·下一步 + §2 標 **§2.16✅(早解)/ §2.17✅(verify_bearer 收斂 5 處)/ §2.18✅(文件化)/ §2.19✅(ctx_mw 收斂)** 解 + §1 marker;spec/plan 收尾標記留 finishing 階段。

> **★ 紀律**:本 tasks.md **不含 `git push` / `git merge`**(constitution §I.4 / CLAUDE.md §3:凍結至 `superpowers:finishing-a-development-branch`)。subagent-driven-development 各單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality);worktree 內 commit OK、push/merge 收尾才做。**純 rust-api 單倉、base-web 不動**。

---

## Dependencies

```
Setup(T001 baseline)
  └─ US1(T002 verify_bearer + TDD → T003 5 callsite 遷移)   ← P1 MVP
  └─ US2(T004 issue_tokens + TDD → T005 2 callsite 遷移)
       └─ T003-②(get_user_info)與 T004/T005 同 handler/auth.rs → 順序 commit
  └─ US3(T006 文件、需 T002 verify_bearer 存在)
  └─ Polish(T007 holistic C-V〔需 US1+US2〕; T008 docs)
```

- **US1 ⟂ US2**:不同 helper、可獨立交付驗證;**但同 `handler/auth.rs`**(US1 的 get_user_info + US2 的 issue_tokens/login/refresh)→ worktree 內順序 commit;US1 先(MVP)。
- T003 依 T002;T005 依 T004;T006 依 T002;T007 依 US1+US2;T008 收尾。

## Parallel 範例
- T002(bearer.rs)與 T004(auth.rs)技術上不同檔可平行,但 T003 遷移會動 auth.rs(get_user_info)、與 T004/T005 同檔 → 實質以 dependency 順序為主(單檔密集)。

## MVP 範圍
**US1(P1)= MVP**:T002 verify_bearer + T003 5 callsite → auth 層最高頻重複(bearer→verify)收斂、行為零變。US2 issue_tokens + US3 文件為增量。

## 實作策略
1. Setup baseline(T001)→ 記重構前綠 + 各碼。
2. US1(T002 TDD + T003)→ verify_bearer checkpoint(單測 + 既有不變 + smoke 等價)。
3. US2(T004 TDD + T005)→ issue_tokens checkpoint。
4. US3(T006)→ 三策略文件化。
5. Polish(T007 holistic C-V 等價 smoke + 守恆 / T008 docs)→ `superpowers:finishing-a-development-branch`(多段式 commit + merge --no-ff,**此階段才 push/merge**)。
