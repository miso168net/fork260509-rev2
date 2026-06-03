# 023-manage-endpoint-auth — Phase 0 Brainstorm spec-design（DEFINED，待 /speckit-specify）

> **狀態**:brainstorm **已定案**（2026-06-04,接 022 收尾後 → grounding workflow〔4-agent 對抗驗證〕→ 4 keystone 親決 → 設計骨架 user 核可）。本檔為 `/speckit-specify` 的輸入 spec-design。
> 工作流見 [CLAUDE.md §3](../../CLAUDE.md);brainstorm 慣例同 [`021-manage-menu-auth.md`](021-manage-menu-auth.md) / [`022-manage-button-auth.md`](022-manage-button-auth.md)。承 [DESIGN §10 Phase 3 #4](../INTEGRATION-DESIGN.md)「全路由 enforce rollout + 矩陣治理」。

## 1. Feature 意圖

**EndpointAuth = 角色×API-endpoint 權限 runtime 編輯 + 全路由治理 + 防呆守衛** —— menu(021)/button(022) auth 的第三隻腳:把「哪個角色能打哪個 API endpoint」從建置期硬編(migration seed)推進到**維運期可編輯**,並補上「全路由 enforce 治理」缺口。

**重要 reframe(grounding 揭露)**:「全路由 enforce rollout」字面上**已完成**(25/25 systemManage 端點全在 `enforce_mw` 後、29 endpoint policy **零破口**)。本 feature 真正交付的是 3 件事:
- **(a) runtime 可編輯 endpoint policy**(取代「僅 migration-seed」;對齊 021 menu / 022 button 已 runtime 可編輯)。
- **(b) 防呆守衛**:關掉「migration `v1` path 字串與 `main.rs` route 字串無綁定 → path typo 靜默變死路由」的結構破口。
- **(c) 矩陣單一真相**:清過時 wildcard 文字 + reconcile 唯一矩陣分歧。

## 2. Grounding findings（grounding workflow 4-agent 對抗驗證 ✅ CONFIRMED;3 map 全確認準確）

### 2.1 現況(已驗證)
- **32 route**:25 `enforce_mw`(全 `/systemManage/*`)/ 3 in-handler-jwt(`getUserInfo`、`getUserRoutes`、`isRouteExist`)/ 4 public(`health`、`login`、`refreshToken`、`getConstantRoutes`)。
- **29 endpoint policy 列**(GET14/POST9/DELETE6),寫/刪端全 **R_SUPER-only**;唯讀端共享:`getUserList`(+R_ADMIN)、`getRoleList`(+R_ADMIN)、`getAllRoles`(+R_ADMIN+R_USER_COMMON)。
- **enforce matcher = exact-equality** `(role,path,method)`(`enforce.rs:41`),**不支援 wildcard/prefix**;fail-closed、allow-override、roles DB-fresh(`roles_for_user`)。
- **無 broken route**:25 enforce 路由全有 ≥1 policy(零死路由)。
- **治理破口**:migration 的 `v1` path 字串與 `main.rs` route 字串**無編譯期/測試綁定** → 任一打錯字 = 靜默死路由(build 過、只 runtime curl 才爆)。
- **token-vs-policy**:enforce 路由無 policy → **authenticated** 403/5003;但無/壞 token → **3333(HTTP200)** 在 policy 檢查之前 → D1 守衛測試**必須帶有效 token** 才測得出 missing-policy(匿名打會得 3333、遮蔽破口)。

### 2.2 矩陣分歧(唯一實質)
`getMenuList/v2`、`getAllPages`、`getMenuTree` = **Super-only as-built**(`m...019_seed_menu_read_policy.rs:9-10` 註解明寫 clarify Q1「選單管理讀端 Super-only」)vs DESIGN §4.6.3 預期矩陣寫 **Admin 也能讀** → 文件與 code 矛盾、需拍板單一真相。

### 2.3 過時 wildcard 文字
DESIGN §6.3(`:750`)/ §4.6.3(`:521`)仍計畫 `p,R_SUPER,*,*`;但每個 shipped migration 都逐條 seed「沿 009 先例」、未走 amendment;且 matcher exact-equality 根本不支援 `*` → 文件 stale-但未修。

### 2.4 base-web UI 缺口
角色抽屜**只有** `menu-auth-modal` + `button-auth-modal` placeholder;**無任何 endpoint/接口權限 UI** → runtime-edit 要 UI 得從零做新 modal(無 placeholder、不在 MODAL-WIRING ★「接既有 placeholder」邊界內)。

### 2.5 治理現況
- menu(021)/button(022) policy 已 **runtime 可編輯**(stock adapter HARD REPLACE `remove_filtered`+`add_policies` + redis `casbin:policy:invalidate`、**不 fork**);**endpoint policy 仍只能 migration seed**。
- §11.6:**完整受管層**(soft-delete/protected/restore)才需 fork adapter;**基本 HARD REPLACE 不需 fork**(021/022 已證)。

## 3. 拍板決策（4 keystone,user 親決）

| # | 決策 | 選擇 |
|---|---|---|
| **K1 範圍** | 治理+守衛 / +runtime-editable / +完整受管層 | **+ runtime-editable endpoint policy**(治理+守衛為基線含) |
| **K2 深度** | 基本 no-fork vs 完整受管 fork | **Version A 基本 no-fork**(鏡像 021/022 HARD REPLACE、stock adapter 不 fork、**無 §11.6 amendment**) |
| **K3 自鎖模型** | root-mode vs editable+protected-guard | **root-mode**:Super 永遠全通、不可編輯;只 R_ADMIN/R_USER_COMMON 可編 → **整站自鎖歸零、不需 protected-list** |
| **K4 UI scope** | E1 含UI+小amendment vs E2 rust+API先 | **E1**:含 base-web `endpoint-auth-modal` + 一條擴 MODAL-WIRING ★ 的小 amendment(一次到位、與 menu/button 一致) |

## 4. 設計（DEFINED）

### A. 機制（鏡像 021/022,stock adapter 不 fork,零新 crate/dep）
- 新 `server/src/auth/endpoint_auth.rs`:
  - `ENDPOINT_REGISTRY`:const = 全部 `enforce_mw` 端點 `[(path, method, desc)]` **單一真相**(~28 = 25 既有 + 3 新 policy-edit 端點自身)。
  - `get_role_endpoints(enforcer, role_code) -> Vec<(String,String)>`:`get_filtered_policy` 篩 v2 ∈ HTTP method 的列(排除 `'menu'`/`'button'`)。
  - `replace_role_endpoint_policies(...)`:HARD REPLACE — **逐 method `remove_filtered_policy(0,[role,"",m])` for m∈{GET,POST,DELETE}**(★ **不可用 v0-only filter**,會誤刪 `v2='menu'`/`'button'` 列)+ `add_policies`(空集 `Ok(false)` 非錯誤)。
  - `set_role_endpoints(state, role_code, endpoints, operator)`:write-lock 最小化 + 011 audit(`casbin_rule`、before/after 端點集、operator)+ `publish_policy_invalidate`(共用 021 watcher、零新增)。
  - **root-mode guard**:`role_code == "R_SUPER"` → 拒(Super 列不可變、永遠全通)。
- `getUserInfo` / `getUserRoutes` **不變**(endpoint policy 純 `enforce_mw` 消費、非廣告欄;對照 022 改 getUserInfo.buttons,本波不動)。

### B. handlers（`system_manage.rs`、Super-only `enforce_mw`、零 `entity::`）
- `getAllEndpoints` → `Res<Vec<EndpointItem{path,method,desc}>>`(registry、字典序)。
- `getRoleEndpoints(roleId)` → 該角色 granted 端點(roleId=Super → 全 registry;`de_role_id`、查無 active role → 2222)。
- `updateRoleEndpoints(roleId, endpoints)` → **root-mode guard**(roleId 解析為 R_SUPER → 2222「不可编辑超级管理员」)+ 非法 endpoint → 2222(對照 ENDPOINT_REGISTRY)+ `set_role_endpoints` HARD REPLACE → `Res<()>`。
- 3 新端點自身的 endpoint policy(R_SUPER)由本 feature migration seed + 進 ENDPOINT_REGISTRY(自我治理)。

### C. registry + D1 防呆守衛（**核心價值**）
- `ENDPOINT_REGISTRY` 單一真相:seed migration、`getAllEndpoints`、D1 測試共用。
- **D1 live-DB 測試**(`#[ignore]`、鏡像 [project rust-api build/test env 慣例](../../CLAUDE.md)):
  - 每條 `enforce_mw` 端點:有權角色**帶有效 token** → 非 5003;無權角色帶有效 token → 403/5003。
  - 斷言 **main.rs `enforce_mw` routes ⊆ ENDPOINT_REGISTRY ⊆ 已 seed policy** → 無 drift / 無死路由 / 無漏 seed。
  - **帶 token**(避免 3333 遮蔽 missing-policy,見 §2.1)。

### D. 矩陣 reconcile + 清過時文字
- **ratify「逐條 seed、無 wildcard」**:清 DESIGN §6.3/§4.6.3 的 `p,R_SUPER,*,*` 計畫文字(matcher exact-equality 不支援 `*`、實際全逐條)。
- **menu-read 分歧**:seed 預設**維持 as-built**(Super-only、019 clarify);因現在 runtime 可編輯,Admin 能否讀 = **ops 決定**(Super 執行期 grant);文件對齊 Super-only 預設 + 註明可 runtime 調。

### E. base-web UI（E1,新 modal + 小 amendment）
- 新 `views/manage/role/modules/endpoint-auth-modal.vue`(鏡像 `button-auth-modal`):顯 ENDPOINT_REGISTRY、per-role granted 預勾、**key-on-`${method} ${path}`**(path+method 無天然 id、合成 key)。**root-mode:roleId=Super → 全勾 + disabled(顯「超管全通、不可編輯」);Admin/User → 可編**。
- `role-operate-drawer.vue` 加第 3 顆按鈕「接口权限」+ `EndpointAuthModal`(`v-if="isEdit"` 區、同 menu/button)。
- `rev2-system-manage.ts` +3 fetch fn(`fetchGetAllEndpoints` / `fetchGetRoleEndpoints` / `fetchUpdateRoleEndpoints`)。
- i18n:`page.manage.role.endpointAuth`(zh-cn + en-us)。
- **constitution amendment(小、MINOR)**:擴 MODAL-WIRING ★ 邊界,允許「**同模式新增 role-permission modal**(新 `.vue` + 抽屜按鈕 + i18n key、限角色管理頁授權編輯類)」—— 因 endpoint-auth-modal 無既有 placeholder、超出現行「接既有 placeholder」邊界。plan 階段逐行列 exact text 給 user 過目(走 [constitution amendment workflow](../../CLAUDE.md))。

### F. 安全（root-mode 已解決自鎖）
root-mode 下「Super 永遠全通+不可編輯」→ **自鎖風險歸零、不需額外 protected-list**(只有 Super 能編 policy〔updateRoleEndpoints 走 Super-only enforce_mw〕、Super 又不可被編 → 無人能被鎖出編輯)。Admin/User 的編輯只影響自己、不影響 Super 與整站可達性。

## 5. Constitution implications
- **MODAL-WIRING ★ amendment(小、MINOR)**:擴允許同模式新權限 modal(§E);plan 階段定 exact text、走 amendment workflow。
- **NO §11.6 / NO fork**:stock adapter HARD REPLACE(鏡像 021/022、§11.6 拍板不破)。
- **§I.2**(menu Casbin enforce):不衝突(endpoint policy 是 `enforce_mw` 消費、與 menu visibility〔`v2='menu'`〕正交)。
- **§I.3**(wire/error):業務錯誤 2222(非法 endpoint / 編輯 Super);授權 5003 / 未認證 3333 由 enforce_mw;不涉 id 型。
- **§I.6**:不建表(用既有 `casbin_rule`;casbin_rule 非 §I.6 6-審計欄對象)。

## 6. Out of scope（明示排除）
- **soft-delete / restore / protected-DB-flag / policy-CRUD-facade** = Phase 3 **#6**「受管 RBAC policy 層」,需 fork adapter → §11.6 amendment(本波刻意不做)。
- **統一兩條 JWT 路徑**:`getUserInfo`/`getUserRoutes`/`isRouteExist` 維持 in-handler-jwt(§I.2 in-handler menu filter 是刻意設計、非破口)。
- **wildcard / keyMatch matcher**:維持 exact-equality 逐條。
- **其餘 demo menu 救活**(僅 022 已救 function/toggle-auth)。

## 7. Open for /speckit-plan（grep-verify、別信本檔命名）
- ENDPOINT_REGISTRY 確切內容(grep `main.rs` 全 `enforce_mw` routes + 3 新 policy-edit 端點自身)。
- 逐-method HARD REPLACE 對 `v2='menu'`/`'button'` 正交性(in-memory enforcer 測試、鏡像 button_auth orthogonality test)。
- D1 測試的 main.rs route 抽取方式(route 字串來源 vs registry;是否需 const 對照表 / parse main.rs)。
- `EndpointItem` wire shape(path/method/desc;`getRoleEndpoints` 回 full item vs `{path,method}`;base-web 對齊型)。
- `de_role_id` 重用;`updateRoleEndpoints` root-mode guard 錯誤碼/訊息(2222 + 訊息)。
- MODAL-WIRING amendment exact text(§V.x level、逐行列 user 過目)。
- endpoint-auth-modal `key-on-${method} ${path}` 的 NTree key 合成 + tree/flat 呈現。
- 新 3 端點的 endpoint policy seed(R_SUPER)migration + 進 registry。
- 回歸:既有 29 endpoint policy + 25 enforce route 不破;守恆同 022(server 單測 + entity_access_lint + Migrator::up 0 + migration 可逆)。

---

> **下一步**(手動、勿排進 brainstorm):`/speckit-specify`(input = 本檔)→ pre-hook `speckit.git.feature` 建 `023-manage-endpoint-auth` branch → spec.md。見 [CLAUDE.md §3](../../CLAUDE.md)。
