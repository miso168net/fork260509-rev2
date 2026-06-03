# Research: Endpoint Permission Authorization (023) — Phase 0

> grep-verify 紀律(CLAUDE.md §3):不信 brainstorm 命名假設、act on actual code。本檔由 grounding workflow(4-agent map + synthesize,2026-06-04)逐項 grep 實證,file:line 為準。
> **Scope**:role × endpoint(HTTP method + path)Casbin policy **runtime-editable**(鏡像 021 menu-auth / 022 button-auth)+ 3 自我治理端點 + **D1 coverage-guard** + reconcile 過時 `R_SUPER` wildcard 設計文字。**無 fork、無新 crate、無新 dep、單一 migration 023 seed**。

## R0. grounding 對抗驗證(現況 CONFIRMED)
- **25 enforce_mw 路由**(全 `/systemManage/*`、`main.rs` L107-347)+ 3 in-handler-jwt + 4 public;endpoint policy 列 v2 ∈ {GET,POST,DELETE}(grep `put(`/`patch(` → NONE;`'PUT'`/`'PATCH'` → NONE → method set **closed**)。
- enforce matcher `enforce.rs:41` = **exact-equality** `m = r.sub==p.sub && r.obj==p.obj && r.act==p.act`(tests L184-195 證無 wildcard/keyMatch/prefix)→ `*` policy 列**永不 match** 具體請求。
- **無 broken route**(25 路由全有 ≥1 policy);治理破口 = migration `v1` 字串與 `main.rs` route 字串無綁定。

## R1 — `endpoint_auth.rs` 機制(multi-method HARD REPLACE)
**Decision**:新 `server/src/auth/endpoint_auth.rs` **1:1 鏡像 `button_auth.rs`**(`SetRoleEndpointError` / `get_role_endpoints` / `replace_role_endpoint_policies` / `set_role_endpoint` / `#[cfg(test)]`),`pub mod endpoint_auth;` 加進 `auth/mod.rs`(現列 button_auth/enforce/menu_auth @ L8-13)。**唯一 divergence** = replace 步:endpoint 列 keyed on `v2 = HTTP method`(變值、非常數 `"button"`/`"menu"`),故 HARD REPLACE **逐 method `remove_filtered_policy(0,[role,"",m])` for m∈{GET,POST,DELETE}**,**絕不** `remove_filtered_policy(0,[role,"",""])`。
**Rationale**:空字串=wildcard 語意已 verbatim 記於 `button_auth.rs:109-110`(「空字串=wildcard:刪 v0=role 且 v2='button' 的列…不影響 menu/endpoint 列」);裸 `[role,"",""]`(空 v2)**會誤刪該 role 的 v2='menu'(021)+ v2='button'(022)列** —— CONFIRMED hazard。逐 method pin 保留 menu_auth/button_auth 單-v2 wildcard 所靠的正交性(orthogonality test:`button_auth.rs:303-316` / `menu_auth.rs:298-310`)。method set 已 closed(只 GET/POST/DELETE)→ 迭代不漏。其餘逐字鏡像(write-lock 最小化 / audit 獨立 txn `entity_table:"casbin_rule"` / best-effort publish / imports 同 `button_auth.rs:29-39`)。**無新 crate/dep**。
**Alternatives**:裸 `[role,"",""]` 再 re-add menu+button+endpoint(rejected:clobber 021/022、擴 blast radius、違正交 test);v0-filter 後 post-filter v2∈methods 再 `remove_policies`(viable 但比 per-method loop 多 code、無增益);fork adapter 加 v2-set filter(rejected:破 no-fork)。

## R2 — `ENDPOINT_REGISTRY` 內容 + 單一真相形
**Decision**:registry = **compile-time `const`** 列 25 條 enforce_mw 路由(MAP-1 表:getUserList…getAllButtons),每元素 `(HTTP method, exact path string)`。`get_all_endpoints` **直接回此 const — 無 DB、無 error path**(結構性 divergence vs 022 `get_all_buttons` 讀 DB aggregate)。3 新自我治理端點(`getAllEndpoints` GET / `getRoleEndpoints` GET / `updateRoleEndpoints` POST,皆 `/systemManage/`)亦加進 registry + 掛 enforce_mw → 計 **28**。
**Rationale**:routes 編譯期固定於 `main.rs`、無 `sys_endpoint` 表(R8 不建)→ const 回傳避免發明無失敗模式的 DB read;3 新端點命名逐字鏡像 022(getAllButtons/getRoleButton/updateRoleButton L347/327/337)+ 同 `.route_layer(enforce_mw)` wrapper → Super-only 自我治理;其 `(R_SUPER,path,method)` 列由 023 seed、D1 guard(R5)驗證閉環。
**Alternatives**:runtime DB aggregate(rejected:無 endpoint 表、發明不存在的 state);build script parse main.rs(rejected:Phase 0 over-eng;const + R5 drift-guard 更簡)。

## R3 — root-mode guard(拒編輯 `R_SUPER`)
**Decision**:`update_role_endpoints` **拒絕編輯 R_SUPER 角色的 endpoint policy** —— role-code 解析後、enforcer mutation 前,`role_code == "R_SUPER"` 直接 literal 比對 → `Res::err_msg(BizCode::BizError, ...)`(=**2222**)。is-super 偵測用 `menu_auth.rs:63` 既有的同一 literal `role_code == "R_SUPER"`,**非** `is_seed_role_code`(`system_manage.rs:63-65` 匹配三 seed role、會誤擋 R_ADMIN/R_USER_COMMON 編輯)。
**Rationale**:codebase 無單一 `is_super` helper;唯一 R_SUPER-specific guard = `menu_auth.rs:62-64` 用 bare literal → 沿用保單一 idiom。`is_seed_role_code` 是 3-role 刪/停用 blocker、非 is-super;用它會擋掉該可編的兩 role。此 guard 是 R7 reconcile 的 runtime 執行(R_SUPER 有 per-endpoint 列「可表達」、guard 使其「不可經 modal 編輯」)。
**Alternatives**:無 guard(純 022 鏡像、rejected:移除 R_SUPER 的 updateRoleEndpoints grant 會永久鎖死 endpoint 管理);reuse `is_seed_role_code`(rejected:over-broad);per-endpoint self-lock(deferred:blanket `role==R_SUPER` reject 更簡更安全;若要細粒度是 clarify-question 非 Phase 0 default)。

## R4 — handlers(`getAllEndpoints` / `getRoleEndpoints` / `updateRoleEndpoints`)
**Decision**:3 handler 加進**既有** `handler/system_manage.rs`(非新檔 —— handler/ 在 entity_access_lint scope、不得含 `entity::` token),`use crate::auth::endpoint_auth;`。`de_role_id`(`system_manage.rs:123-143`)逐字重用(GET query + POST body)。

| handler | mirror | role-resolve | error codes |
|---|---|---|---|
| `get_all_endpoints` | `get_all_buttons`(L872-880)但**直接回 R2 const**、無 DB/無 Err arm | — | none(infallible) |
| `get_role_endpoints` | `get_role_button`(L888-907)、`Query<RoleIdReq>`(L652-657) | `find_active_by_id`→`model.code` | `Ok(None)`→**2222**「角色不存在」;`Err`→**5000**+log |
| `update_role_endpoints` | `update_role_button`(L921-962)、`Json<RoleEndpointReq>` | 同 | `ctx.operator_id None`→**5000**;`Ok(None)`→**2222**;R3 R_SUPER reject→**2222**;未知 endpoint key→**2222**「接口不存在」;delegate `Err`→**5000**+log |

POST DTO `RoleEndpointReq` 鏡像 `RoleButtonReq`(L686-692)但 granted set 元素**比 `Vec<String>` richer** —— 每 key 是 `(path, method)` pair(wire repr 見 R6)。F1 validity:valid key-set 由 **R2 registry const**(非 DB aggregate)、未知 key→2222;空集 passes(clear-all)。delegate `endpoint_auth::set_role_endpoint(&state, &code, &keys, operator)`。
**Rationale**:error 碼逐字 from MAP-1(5000=Internal、2222=BizError);**3333/5003 非 handler 發** —— 3333=`enforce_mw` token-presence(`enforce.rs:62-74`)、5003=`enforce_mw` all-denied(`enforce.rs:118-128`),皆 handler 之前,implementer 勿在 handler hand-roll。`get_all_endpoints` infallible(回 const)= 結構性 divergence vs `get_all_buttons`。
**Alternatives**:flat `Vec<String>` body(rejected:endpoint 是 (path,method) 非單 code、強迫 "METHOD path" 編碼);新 handler 檔(rejected:022 handlers 在 system_manage.rs、co-locate 保 lint scope)。

## R5 — D1 coverage guard 機制(**plan 精煉:build-time 靜態 lint**)
**Decision**:D1 guard = **build-time 靜態 lint**(Cargo integration test in `server/tests/`、model on `entity_access_lint.rs`),**非** live-DB `#[ignore]` test。test 讀 `src/main.rs` 為文字、抽每條 `.route("<path>", get|post|delete(...))` + 其 `.route_layer(...)` span 是否含 `enforce_mw` token,並讀 `../migration/src/*.rs` 的 seeded `('p','R_x','/path','METHOD',…)` SQL literals;斷言 **每條 enforce_mw `(path,method)` 有 ≥1 matching seeded `(v1,v2)` 列**。重用 `strip_comments_and_strings`(`entity_access_lint.rs:58`)whiten 註解。thin live-DB `#[ignore]` HTTP smoke **optional、明示非 D1 guard**。
**Rationale**:drift 是**靜態文字屬性**(「每條受保護 route 有 seed?」無需 DB/token/server,全在 source text);跑在普通 `cargo test -p server`(每次 CI/dev gate、fail fast in-loop),vs live-DB `#[ignore]` 只在記得 `--ignored` 時跑、drift 會溜過。**無新 dep**:`server/Cargo.toml` 無 `[dev-dependencies]`、無 HTTP client;live-DB variant 需加 `reqwest`(+tls)= 新 dep + CLAUDE.md §3 overhead。**完全繞過 token-vs-policy 陷阱**:enforce_mw 是 token-check **先於** policy-check → 匿名請求 →3333/200(`enforce.rs:62-74`)、只有有效 token 才到 `enforce`→all-denied→403/5003 → live「unauthorized-denied」對匿名請求會**誤 pass**(測到 token-presence 非 policy coverage);靜態 lint 不發請求、無此陷阱。
**Tradeoff(明示)**:靜態 lint 驗 *coverage*(policy 列存在)非 *runtime semantics*(enforce 拒對角色);parse-fragility(配對 `.route(...)` 與多行 `.route_layer(...enforce_mw)` span)—— mitigated:pattern 28 路由 byte-identical。
**Alternatives**:live-DB `#[ignore]` 當 guard(rejected:需 reqwest 新 dep、只 `--ignored` 跑、**不偵測 drift**;可當*獨立 optional semantics smoke*、須用「有效但無權 token」非匿名);hand-maintained const registry 給 guard parse(rejected:const 是*第三個*會 drift 的東西、guard 應 parse main.rs 真相);both(acceptable、但靜態 lint 獨力即達 drift-guard 全值)。

## R6 — base-web `endpoint-auth-modal.vue`
**Decision**:新 `views/manage/role/modules/endpoint-auth-modal.vue` 1:1 鏡像 `button-auth-modal.vue`(99 行):`defineOptions({name:'EndpointAuthModal'})`、title `$t('common.edit')+$t('page.manage.role.endpointAuth')`(新 i18n key)、NTree + 3 fetch fn(`fetchGetAllEndpoints` registry / `fetchGetRoleEndpoints` 預載 / `fetchUpdateRoleEndpoints` hard-replace)。**wire repr(3-端 align grep 實證)**:rust registry item = 2-field `{ method, path }`(richer than `MenuButton{code,desc}`)→ 加新型 `Api.SystemManage.Endpoint` 至 `typings/api/system-manage.d.ts`(MenuButton @ L72-81 後);**NTree `key-field` 須單一 string identity** → tree key = composite `"METHOD path"`(如 `"GET /systemManage/getUserList"`),`checks: string[]`,wire 攜結構化 `{method,path}[]`、composite string 僅 NTree 內部 key。**root-mode:Endpoint 按鈕/modal 對 Super disabled**(drawer roleId 解析為 R_SUPER 時),與 R3 server reject 對齊(UI 不提供 server 會 2222 的編輯)。
**Rationale**:MenuButton 是 `{code,desc}`、endpoint 無單 code、天然 identity 是 (method,path);3 fetch fn 鏡像 022 trio(`rev2-system-manage.ts` L108-121)、入既有 `rev2-system-manage.ts`(BASE-WEB-WRAPPER 軌道);3-端 align 滿足(rust const `{method,path}` ↔ base-web `Endpoint{method,path}` ↔ modal `checks:string[]` composite)。disabled-for-Super = R3 server guard 的 UI 互補(defense-in-depth)。
**i18n**:`zh-cn.ts:535`(buttonAuth 後加 `endpointAuth:'接口权限'`)+ `en-us.ts:539`(加 `endpointAuth:'Endpoint Auth'`)。
**Alternatives**:reuse `{code,desc}`(rejected:endpoint 無 code、丟 method/path 語意);flat `"METHOD path"` wire(viable 但結構化 `{method,path}` 更 robust);跳過 disabled-for-Super(rejected:總 error 的按鈕爛 UX)。

## R7 — 矩陣 reconcile + 過時 wildcard 文字校正
**Decision**:023 migration seed **per-endpoint R_SUPER 列(無 wildcard)** —— R_SUPER 每 gated endpoint 一條 `(R_SUPER,path,method)`,如 009/016 以來 de-facto。**in-place 校正** `docs/INTEGRATION-DESIGN.md` 三處過時 `p,R_SUPER,*,*` 文字,並記為 **§11.22 amendment-of-record**(鏡像 §11.19/§11.20/§11.21 blockquote 格式;★ §11.21 已由 `d700434` MODAL-WIRING amendment 佔用、故 endpoint reconcile 用次一序號 **§11.22**)。三處:**L500**(§4.6.3 矩陣列「全通(wildcard)」)/ **L521**(§4.6.3 seed 寫法「R_SUPER 用 wildcard `p,R_SUPER,*,*`」)/ **L749-752**(§6.3「`p,R_SUPER,*,*`(super 全通)」)→ 皆改「逐 endpoint 列、無 wildcard、無 `*` 主體」。
**Rationale**:wildcard 已 de-facto superseded(`INTEGRATION-DESIGN.md:1104` 016 as-built「逐條 seed 無 wildcard…凌駕 §5.1/§6.3」);L500/521/750 是 stale forward-plan 從未 in-place 改。023 是天然修正點:literal `R_SUPER` wildcard 列在 per-endpoint modal **不可勾選**、且 matcher exact-equality(`enforce.rs:41`)`*` 列**永不 match** → 文字必須 reconcile 成「無 wildcard、R_SUPER 亦 per-endpoint 列」,正是 R3 guard 有意義之所在。
**Alternatives**:留 wildcard 在 modal special-case(rejected:matcher 不支援、`*` 不可 render);留 DESIGN 文字 stale 只 seed 對(rejected:DESIGN §7.2 是設計權威、stale 三行違回填紀律)。

## R8 — scope 確認
**Decision**:023 **無 fork、無新 crate、無新 dep**、**單一 migration 023 seed**。CLAUDE.md §3「新 workspace crate ⇒ acceptance 必含 prod image build」**不適用**(無新 crate)。
**Rationale**:`endpoint_auth.rs` 是**既有 server crate 內新 module**(declared `auth/mod.rs:8-13`)、非 workspace member(§3 明示「僅加模組到既有 crate 不受影響」);無新 dep(imports 同 `button_auth.rs:29-39`;handlers 重用 de_role_id/idioms;D1 guard 純 `std` string scan、無 reqwest);無 fork(multi-method HARD REPLACE 用 stock SeaOrmAdapter MgmtApi per-method remove_filtered);單 migration(per-endpoint R_SUPER + R_ADMIN/R_USER_COMMON + 3 新端點 `(R_SUPER,path,method)` 列;**不建表 → §I.6 六審計欄 gate N/A**)。

## 未決(交 data-model.md / contracts 拍板)
- `Endpoint` wire 型確切欄(`{method, path}`;getAllEndpoints/getRoleEndpoints 回 full item vs key)→ data-model §wire。
- 三角色 endpoint 授權**初始 seed 分布**(per-endpoint reconcile;menu-read 維持 Super-only、Admin runtime grantable)→ data-model §seed。
- D1 靜態 lint 的 main.rs route↔migration policy 配對精確 parse 規則 + 故意-漏 negative test → contracts。
- **MODAL-WIRING ★ amendment**(新 modal+trigger 超出現邊界、MINOR 1.3.0→1.4.0)→ plan Constitution Check + 逐行列 user 過目。
</content>
