---
description: "Task list — 023 Endpoint Permission Authorization"
---

# Tasks: Endpoint Permission Authorization (023)

**Input**: Design documents from `/specs/023-manage-endpoint-auth/`
**Prerequisites**: plan.md ✅ / spec.md ✅ / research.md ✅ / data-model.md ✅ / contracts/ ✅
**Tests**: 純函式單元測試(`endpoint_auth.rs` 機制:multi-method HARD REPLACE 對 v2='menu'/'button' 正交 / get 排序 / 空集清除)+ **D1 build-time 靜態 lint**(`server/tests/` coverage guard、含 negative fixture)—— plan 明示;wiring / 形狀類無純函式者由 contracts/verification-commands.md C-V 覆蓋(curl + psql + CDP)。
**Organization**: 依 spec user story(US1 P1 / US2 P2 / US3 P3)。**雙倉**:`rust-api/`(worktree `rev2-admin-rust-api`)+ `base-web/`(worktree `rev2-admin-base-web`)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:不同檔、無未完成依賴 → 可平行
- **[Story]**:US1 / US2 / US3(Setup / Foundational / Polish 無 story label)

## 機制鏡像來源(實作時對照,勿盲信本檔命名,grep actual code)
- `rust-api/server/src/auth/button_auth.rs`(022)→ 鏡像成 `endpoint_auth.rs`(`'button'` 常數 v2 → **變值 v2=HTTP method**、**逐 method HARD REPLACE**;orthogonality test `button_auth.rs:303-316`)
- `rust-api/server/src/auth/menu_auth.rs:63`(R_SUPER literal guard 唯一 idiom;**非** `is_seed_role_code`〔system_manage.rs:63-65,會誤擋 R_ADMIN/R_USER_COMMON〕)
- `rust-api/server/src/auth/policy_watcher.rs`(redis `casbin:policy:invalidate`,共用、零新增)
- `rust-api/server/src/handler/system_manage.rs`(022 getRoleButton/updateRoleButton/getAllButtons + `de_role_id` L123-143 + `RoleIdReq` L652-657)
- `rust-api/server/src/main.rs`(L107-347:25 條 `.route(...).route_layer(enforce_mw)`,新 3 route 鏡像)
- `rust-api/server/tests/entity_access_lint.rs`(`strip_comments_and_strings` L58 重用於 D1 lint)
- `base-web/src/views/manage/role/modules/button-auth-modal.vue`(022 modal,**watch visible**、NTree key-field、checks:string[])

---

## Phase 1: Setup

- [x] T001 確認前置:`rust-api/` worktree 在 `rev2-admin-rust-api`、`base-web/` 在 `rev2-admin-base-web`;dev stack up(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`);migration 已套至 022 baseline(`docker compose ... run --rm migrate up`);**記錄改源前 baseline** 供 US1/US3 回歸對照:`getRoleEndpoints?roleId=2`(Admin)現 granted 集 = `[GET getUserList, GET getRoleList, GET getAllRoles]`、`roleId=3`(User)= `[GET getAllRoles]`(contracts §2 as-built;FR-010 既有矩陣不變)。

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**:US1/US2/US3 皆依賴本階段;完成前不得開 user story 工作。

- [x] T002 [P] 建 migration `rust-api/migration/src/m20260529_000023_seed_endpoint_auth_policy.rs`(並註冊 `migration/src/lib.rs`):依 [data-model §2] —— seed **僅 3 列**新治理端點 R_SUPER endpoint policy(7-col 格式同 021/022):`('p','R_SUPER','/systemManage/getAllEndpoints','GET','','','')` / `(...,'/systemManage/getRoleEndpoints','GET',...)` / `(...,'/systemManage/updateRoleEndpoints','POST',...)`;ON CONFLICT DO NOTHING。**down 精準 by v1**:`DELETE FROM casbin_rule WHERE ptype='p' AND v1 IN ('/systemManage/getAllEndpoints','/systemManage/getRoleEndpoints','/systemManage/updateRoleEndpoints')`(★不踩既有 26 endpoint policy / menu / button 列)。up→down→up throwaway DB 可逆。**不 seed Admin/User**(既有矩陣不變,runtime 由 modal 增減)。**不建表**(§I.6 gate N/A)。
- [x] T003 [P] 建 `rust-api/server/src/auth/endpoint_auth.rs`(鏡像 `button_auth.rs`、`pub mod endpoint_auth;` 註冊 `auth/mod.rs`):依 [research R1, data-model §3] —— (a) `const ENDPOINT_REGISTRY: &[(&str /*method*/, &str /*path*/)]` = **28 條**〔25 既有 enforce_mw route,**path 須與 main.rs L107-347 route literal byte-identical** + 3 新治理端點〕;(b) `SetRoleEndpointError { Casbin, Db }` + From impls;(c) `get_role_endpoints(enforcer, role_code) -> Vec<(String,String)>`(對 m∈{GET,POST,DELETE} 各 `get_filtered_policy(0,[role,"",m])` 收 (path,method)、依 (path,method) 排序);(d) `replace_role_endpoint_policies(...)`(before 快照 → **逐 method `remove_filtered_policy(0,[role,"",m])` for m∈{GET,POST,DELETE}** ★絕不裸空-v2〔否則誤刪 menu/button 列〕 → `add_policies` 每 endpoint 一列 `[role,path,method]`、空集 Ok(false));(e) `set_role_endpoint(state, role_code, endpoints, operator)`(write-lock 最小化 + 011 audit〔casbin_rule、before/after endpoint 集、operator〕+ `publish_policy_invalidate` 共用 021 watcher)。**無自鎖 guard**(root-mode 在 handler 擋、見 T004)。imports 同 `button_auth.rs:29-39`、無新 crate/dep。
- [x] T003a [P] 純函式單元測試(`endpoint_auth.rs` #[cfg(test)],in-memory enforcer 鏡像 `button_auth.rs:303-316`):依 [data-model §3 末] —— (a) **multi-method HARD REPLACE 正交**:seed 同 role 的 v2='menu'(021)+ v2='button'(022)+ endpoint(多 method)列 → `replace_role_endpoint_policies` 後 menu/button 列**存活**、僅 endpoint 列被替;(b) 空集 `replace` → 清該 role 全 endpoint 列(`add_policies` 空 Ok(false));(c) `get_role_endpoints` (path,method) 排序穩定;(d) 多 method 混合(GET+POST+DELETE)replace 後逐 method 正確。

**Checkpoint**:`dcargo build -p server` 綠 + T003a 測試綠 + migration 023 up→down→up 可逆(throwaway DB、既有 26 endpoint + menu + button 列存活)。

---

## Phase 3: US1 (P1) — 角色×endpoint runtime 編輯 + root-mode + 即時生效

**Goal**:Super 設定某非-Super 角色可呼叫的 API endpoint 集(硬替換、即時、跨實例),Super 永遠全通且不可編輯。
**Independent Test**:curl `updateRoleEndpoints(roleId=2, [...+getMenuTree])` → Admin 即時可呼叫 getMenuTree(無重啟)、還原後即時被拒;編輯 Super(roleId=1)→ 2222;非法 endpoint → 2222;Admin 呼叫 update → 5003。(contracts §1–§4)

- [x] T004 [US1] 加 3 handler 至 `rust-api/server/src/handler/system_manage.rs`(`use crate::auth::endpoint_auth;`、零 `entity::` token、Super-only enforce_mw)依 [data-model §4, research R4, contracts §1–4] —— (a) `get_all_endpoints(State) -> Res<Vec<Endpoint>>`:直接回 `ENDPOINT_REGISTRY` const map 成 `Endpoint{method,path}`、字典序,**infallible**(無 DB/無 Err arm);(b) `get_role_endpoints(State, Query<RoleIdReq>) -> Res<Vec<Endpoint>>`:`de_role_id` → `find_active_by_id`→code〔None→**2222**「角色不存在」/Err→**5000**+log〕、**code=="R_SUPER" → 回全 registry**(root 全通)、否則 `endpoint_auth::get_role_endpoints`;(c) `update_role_endpoints(State, Extension<ctx>, Json<RoleEndpointReq>) -> Res<()>`:operator〔None→**5000**〕、find_active_by_id→code〔None→2222/Err→5000〕、**root-mode guard:code=="R_SUPER" → 2222「不可编辑超级管理员」**〔用 `menu_auth.rs:63` 同 literal、**非** `is_seed_role_code`〕、**非法 endpoint:任一 (method,path) ∉ ENDPOINT_REGISTRY → 2222「接口不存在」**、`endpoint_auth::set_role_endpoint` HARD REPLACE〔Err→5000+log〕。DTO `RoleEndpointReq { #[serde(deserialize_with="de_role_id")] role_id: i64, endpoints: Vec<Endpoint> }` + `Endpoint { method: String, path: String }`(serialize/deserialize)。**3333/5003 非 handler 發**(enforce_mw 層、勿 hand-roll)。依賴 T003。
- [x] T005 [US1] 改 `rust-api/server/src/main.rs`:鏡像 L107-347 既有 pattern,加 **3 route + `.route_layer(enforce_mw)`** —— `GET /systemManage/getAllEndpoints` / `GET /systemManage/getRoleEndpoints` / `POST /systemManage/updateRoleEndpoints`(casbin endpoint policy 已於 T002 seed)。依賴 T004。

**Checkpoint US1**:contracts §1 getAllEndpoints(28 字典序、Admin 5003/none 3333)+ §2 getRoleEndpoints(Admin 預載 3、Super 回 28)+ §3 updateRoleEndpoints round-trip(grant getMenuTree→Admin 即時 200→還原 403、無重啟)+ §4 root-mode(編輯 Super 2222)+ 非法 endpoint 2222 + roleId number|string + Admin update 5003 + psql 3 列 + redis reload。

---

## Phase 4: US2 (P2) — 角色管理頁「接口权限」編輯介面(modal)

**Goal**:角色管理頁新增「接口权限」介面(對齊選單/按鈕權限範式),列 28 endpoint registry、預載授權、勾選提交;對 Super 全勾唯讀(root-mode)。
**Independent Test**:Super 開啟 admin 角色「接口权限」→ modal 顯 28 endpoint tree、granted 預勾、勾選提交即時生效;開啟超管角色 → 全勾且 disabled。(contracts §6①②③)

- [x] T006 [P] [US2] base-web 接線層(BASE-WEB-WRAPPER 軌道)依 [data-model §5/§6, research R6] —— (a) `base-web/src/typings/api/system-manage.d.ts` +`Endpoint = { method: string; path: string }`(MenuButton @ L72-81 後);(b) `base-web/src/service/api/rev2-system-manage.ts` +3 fetch fn(鏡像 022 trio):`fetchGetAllEndpoints()`→`Endpoint[]` / `fetchGetRoleEndpoints(roleId)`→`Endpoint[]` / `fetchUpdateRoleEndpoints(roleId, endpoints)`→`null`;(c) `base-web/src/locales/langs/zh-cn.ts`(buttonAuth 後 `endpointAuth:'接口权限'`)+ `en-us.ts`(`endpointAuth:'Endpoint Auth'`)。declarative wire,runtime 驗證在 T007/curl。
- [x] T007 [US2] 建 `base-web/src/views/manage/role/modules/endpoint-auth-modal.vue` **新檔**(鏡像 `button-auth-modal.vue`、MODAL-WIRING ★)依 [research R6, data-model §6] —— `defineOptions({name:'EndpointAuthModal'})`、title `$t('common.edit')+$t('page.manage.role.endpointAuth')`;NTree **key-field = composite `"${method} ${path}"`**(如 `"GET /systemManage/getUserList"`)、`checks: string[]`;`fetchGetAllEndpoints`(registry tree)+ `fetchGetRoleEndpoints(roleId)`(預勾,map `{method,path}`→composite key)+ `handleSubmit`→`fetchUpdateRoleEndpoints(roleId, checks.map(→{method,path}))`(composite string 僅 NTree 內部 key、wire 攜結構化 `{method,path}[]`);`init()` 改 `watch(visible)`(每次開以當前 roleId 重載);`!error` 才成功 toast;**root-mode:drawer roleId 解析為 R_SUPER 時 全勾 + disabled**(與 T004 server reject 對齊、defense-in-depth)。依賴 T006 + backend(T004/T005)。
- [x] T008 [US2] 改 `base-web/src/views/manage/role/modules/role-operate-drawer.vue`(MODAL-WIRING ★ **v1.4.0 (c) 子句授權**:同模式新權限 modal+trigger):v-if=isEdit 區 +「接口权限」NButton(鏡像既有「菜单权限/按钮权限」trigger)+ `<EndpointAuthModal :role-id="roleId">` mount。依賴 T007。

**Checkpoint US2**:contracts §6 CDP ① 接口权限 modal 顯 28 registry + 編輯非-Super 角色預勾/提交 + ② root-mode disabled-for-Super + ③ 端到端生效(對齊 §3 curl)。

---

## Phase 5: US3 (P3) — 全路由治理:D1 防呆守衛 + 矩陣單一真相

**Goal**:build-time 守衛斷言「每 enforce_mw route 有 ≥1 seed policy + ENDPOINT_REGISTRY 一致」(關 path typo/漏 seed 靜默死路由破口);DESIGN 過時 wildcard 文字校正成單一真相。
**Independent Test**:coverage lint 綠(無 drift);故意漏 seed 的 negative fixture → lint 失敗(咬合);DESIGN 授權矩陣描述與實作一致(0 處「規劃 X 實作 Y」)。

- [x] T009 [US3] 建 `rust-api/server/tests/endpoint_coverage_lint.rs`(D1 build-time 靜態 lint、model on `entity_access_lint.rs`、重用 `strip_comments_and_strings` L58)依 [research R5, data-model §7, contracts §5] —— (a) 讀 `src/main.rs` 文字 → 抽每條 `.route("<path>", get|post|delete(...))` + 判其 `.route_layer(...)` span 是否含 `enforce_mw` token;(b) 讀 `../migration/src/*.rs` seeded `('p','R_x','/path','METHOD',…)` literals;(c) **斷言每條 enforce_mw `(path,method)` 有 ≥1 matching seeded `(v1,v2)` 列**(無 drift/死路由/漏 seed)+ 斷言 `ENDPOINT_REGISTRY` const 與 enforce_mw routes 一致;(d) **negative fixture**(in-test「一條 enforce_mw route 無 seed」的合成輸入 → lint 邏輯回報失敗,**非真改 main.rs**)證咬合。靜態 lint 不發請求 → 無 3333 遮蔽問題(R5 token-vs-policy 繞過)。
- [x] T010 [US3] 矩陣 reconcile **verify**(★ 文件 reconcile 已於 2026-06-04 /speckit-analyze remediation pass 套用,本任務降為驗證)依 [research R7, data-model §8, FR-007] —— 確認 `docs/INTEGRATION-DESIGN.md` 已校正:§4.6.3 R_SUPER 範圍「全通(wildcard)」→ 逐 endpoint(L500)、getAllRoles 备注去 `*` 主體(L513)、**menu-read 三列(getMenuList/v2·getAllPages·getMenuTree)R_ADMIN ✓→✗ 對齊 Super-only**(L515-517;spec 唯一 intended 文件變更)、seed 寫法去 wildcard(L521)、驗收 SQL 去 `'*'`(L523)、§6.3 body 去 `p,R_SUPER,*,*`(L750);**§11.22** doc-reconcile-of-record blockquote 已插入;research R7 / data-model §8 的「§11.21」已校正為「§11.22」。**verify**:① L500 矩陣列 = 「全通(逐 endpoint 列、無 wildcard」、② §6.3 body(L750)無「`p, R_SUPER, *, *`(super 全通)」assertional 形、③ menu-read 三列(L515-517)R_ADMIN 欄 = ✗、④ §11.22 blockquote 存在。**注意**:§11.22 reconcile 說明 + §6.3 seed-寫法註 + L1104 016 史料會「引用」舊 wildcard 字串以解釋之 → naive `grep "p, R_SUPER, \*, \*"` 約 4 explanatory 命中、**屬預期非殘留**(只需確認上述 ①–④ assertional 形已校正)。casbin seed 不變(R_SUPER 本就 per-endpoint)。

**Checkpoint US3**:D1 lint positive+negative 全綠 + DESIGN 三處 wildcard 已校正 + §11.22 record 落地。

---

## Phase 6: Polish & Cross-Cutting

- [x] T011 holistic C-V acceptance:跑 contracts/verification-commands.md 全節(§1 getAllEndpoints / §2 getRoleEndpoints / §3 updateRoleEndpoints round-trip / §4 root-mode+非法+Super-only+psql+redis / §5 D1 lint / §6 CDP / §7 migration up→down→up 可逆 + 守恆)+ **回歸 013/019/020/021/022**(enforce 階梯 / menu(021) / button(022) policy 不破、既有 endpoint 矩陣不變 FR-010)+ 守恆(`dcargo test -p server` 含新 endpoint_auth+D1 lint;`--test entity_access_lint` handler/auth/endpoint_auth 零 `entity::` token;`Migrator::up` 0)。CDP 沿 022 isolated-context harness(`tests/022-manage-button-auth/` cdp.mjs)。
- [x] T012 文件回填:`docs/INTEGRATION-DESIGN.md` §10 Phase 3 #4「全路由 enforce rollout + 完整 policy 矩陣治理」as-built 段(內容增厚:runtime-editable + D1 guard + 矩陣 reconcile)+ plan Complexity Tracking 對齊實作(若偏離);CHECKLIST/spec/plan 收尾標記留待 finishing 階段。

> **★ 紀律**:本 tasks.md **不含 `git push` / `git merge`**(constitution §I.4 / CLAUDE.md §3:凍結至 `superpowers:finishing-a-development-branch`)。subagent-driven-development 各單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality);worktree 內 commit OK、push/merge 收尾才做。

---

## Dependencies

```
Setup(T001)
  └─ Foundational(T002 migration ∥ T003+T003a endpoint_auth)
       ├─ US1(T004 3 handler+DTO+root-mode+illegal guard → T005 main.rs 3 route)   ← P1 MVP(curl round-trip)
       ├─ US2(T006 wire ∥ → T007 modal〔需 T006+backend〕 → T008 drawer〔需 T007〕)
       └─ US3(T009 D1 lint〔需 T002 seed + T005 routes〕 ∥ T010 DESIGN reconcile〔純文件〕)
  └─ Polish(T011 holistic C-V〔需全部〕 ; T012 docs)
```

- **US1 ⟂ US2 ⟂ US3**:三者皆建於 Foundational;**US1 curl-testable、不依賴 US2 modal**;US2 為 modal UI(依 US1 backend 才能 runtime 驗,但檔可先建);US3 = D1 lint(依 T002 seed + T005 routes 存在才能驗閉環)+ DESIGN reconcile(純文件、可獨立)。
- 跨故事 file 共用:`system_manage.rs`(T004)、`main.rs`(T005)、`rev2-system-manage.ts`(T006)→ 各單一故事內、無跨故事同檔衝突。

## Parallel 範例

- Foundational:`T002`(migration)∥ `T003+T003a`(endpoint_auth)—— 不同檔。
- US2:`T006`(wire:typings/service/locales)可先於 modal;T007→T008 序列(drawer 需 modal 存在)。
- US3:`T009`(D1 lint,rust)∥ `T010`(DESIGN reconcile,純文件)—— 不同倉/檔。

## MVP 範圍

**US1(P1)** = MVP:Foundational(T002–T003a)+ T004/T005 → curl updateRoleEndpoints 硬替換即時反映(grant/remove getMenuTree 無重啟)+ root-mode reject + 非法 endpoint 2222 + Super-only。modal UI(US2)、D1 守衛 + 矩陣 reconcile(US3)為增量。

## 實作策略

1. Foundational 先(T002–T003a)→ build/單測/migration 可逆 checkpoint。
2. US1 → MVP checkpoint(contracts §1–§4 curl round-trip)。
3. US2 → modal UI checkpoint(contracts §6 CDP)。
4. US3 → D1 守衛 + 矩陣單一真相 checkpoint。
5. Polish → holistic C-V + 回歸 → `superpowers:finishing-a-development-branch`(多段式 commit + merge --no-ff,**此階段才 push/merge**)。
