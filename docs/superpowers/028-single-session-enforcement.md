# 028 — single-session enforcement（engine + policy storage）(Phase 0 brainstorm / spec-design)

> 階段 0 brainstorm **已收斂**(2026-06-05,與 user 逐軸拍板)。承 027 收尾拆出（[DESIGN §10 Phase 5 item 2](../INTEGRATION-DESIGN.md) + CHECKLIST §2.32）。把 027 刻意維持的「access stateless、多裝置並存」升級為 **per-account 可控的 access 端單一-session**:policy 解析=開的帳號,一帳號同時只能一個有效登入、新登入即時踢舊;解析=關維持 027 多裝置。
>
> **028 = 後端安全引擎 + policy 儲存**（base-web 零改、無新對外端點、系統預設用 config 值);**admin 設定 UI 拆 [029](#9-交棒)**（系統預設 runtime 可調 + 每帳號 UI 設定 + endpoint + casbin + base-web 頁）。
>
> **2026-06-05 拍板(全決)**:① session 識別 = **獨立新 sid**(uuid、與 027 rotation_chain 正交);② pointer = **Redis(讀)+ sys_user(持久真相)混合**;③ Claims `sid` = **required**(接受上線全站一次性重登);④ 登入順手 **revoke 舊 session 的 027 chain**(僅解析=開);⑤ 踢碼 = **7777**「账号在他处登录」;⑥ session 檢查放 **4 認證 gate**(不含 ctx_mw);⑦ refresh 也驗 pointer、**繼承同 sid**;⑧ policy = **sys_user 三態**(`inherit`/`on`/`off`)+ **系統預設 = config 值、028 預設 `off`(關)**(dormant 上線);⑨ **不需 constitution amendment**(§11.17 018 先例);⑩ 真正 per-device「每裝置一個 session」**OUT**(乙 解讀:policy=關 即多裝置並存)。

## 1. 目標與性質

把「可 per-account 設定的單一-session」落地(policy=開時):

- **policy 解析**:`sys_user.session_policy ∈ {inherit, on, off}`(default `inherit`)+ 系統預設(028=config `single_session_default`,預設 `off`)。`resolved = policy==inherit ? system_default : policy`。**enforcement(gate/login/refresh)只在 `resolved==on` 時作用**;`off` 全程不檢查 → 維持 027 多裝置並存。
- **登入(resolved=on)**:鑄新 `sid` → token 帶 sid → 寫 pointer(該 user 當前 sid)→ **revoke 該 user 其他 active 027 chain**。舊 session 即時失效。
- **每請求(4 認證 gate:`enforce_mw`/`getUserInfo`/`getUserRoutes`/`isRouteExist`)**:JWT verify 通過後,若 resolved=on 且 `claims.sid != pointer` → **`7777`** → base-web「账号在他处登录」modal → 乾淨登出。
- **refresh**:resolved=on 且 `claims.sid != pointer` → `7777`(與 gate 踢碼統一,被踢 session 不能 refresh 復活);refreshed token **繼承同 sid**(session 存活過 refresh)。
- **resolved=off**:全程不檢查、不踢、不 revoke、pointer 仍維護(供日後切 on 即時生效)→ 完全維持 027 行為。

**功能性質**:rust-api 單倉。sys_user 加 2 系統欄(`current_session_id`/`session_policy`)+ config 加系統預設 + Claims 加 `sid`(required)+ `issue_tokens` 加參 + Redis pointer helper(新 GET/SET)+ 027 facade 加 `revoke_other_chains` + 改 4 gate + 2 handler(login/refresh)。**wire 中性、base-web 零改、無新對外端點、不動 casbin policy、無 fork、預期無 amendment**。**系統預設 runtime 可調 + admin UI + 每帳號 UI 設定 → [029](#9-交棒)**。

## 2. Grounding(實際 code,2026-06-05 親驗 — workflow 4-reader + 3 確認 grep)

**rust auth surface**

| 點 | 位置 | 對 028 的意義 |
|---|---|---|
| `Claims{sub,user_id,roles,exp,iat,iss,aud}` 全 required;doc「never read by base-web」 | `jwt.rs:28-42` | 加 `sid: String`(required)= **internal 改、非 wire 改**;舊 token deserialize 失敗 → 上線一次性重登(§4.7) |
| `issue_tokens(user_id, roles, &JwtConfig)` | `auth.rs:63-67` | 加 `session_id: &str` 參、兩 token 都帶 |
| login 順序:`issue_tokens`(inner)先、027 `create_chain_head`(outer)後 | `auth.rs:88-137` | 要把 sid 入 Claims **須重排**(先鑄 sid 再簽) |
| `refresh_token`(027:verify→預簽→rotate) | `auth.rs:275-318` | 加 pointer 檢查 + 繼承 sid |
| `verify_bearer` 5 callsite | `bearer.rs:40-64` | `enforce_mw`(fail-closed 3333/5003)/ `getUserInfo`·`getUserRoutes`·`isRouteExist`(advisory 3333)/ `ctx_mw`(best-effort)。**3 advisory 不走 enforce_mw、各自呼 verify_bearer** → 檢查須覆蓋 4 gate |
| `enforce_mw` | `enforce.rs:60-121` | 已 per-request DB-fresh roles(018,**stateful 先例**)+ casbin → 加 1 次 policy+pointer 比對 |

**base-web token-failure flow(7777 路徑已確認)**

| 事實 | 位置 |
|---|---|
| 碼處理順序 **logout(8888,8889) → modalLogout(7777,7778) → expiredToken(9999,9998,3333)** → `7777` 永走 modal、**永不觸發 refresh** | `request/index.ts:54-97` |
| 7777 分支 `$dialog.error({content: response.data.msg, onPositiveClick: logoutAndCleanup, onClose: logoutAndCleanup})`;`errMsgStack` 去重 | `request/index.ts:61-84` |
| `BizCode::ModalLogout7777 => "7777"`、msg「账号在他处登录」**已存在** | `envelope.rs:93-125` |
| alova 層同有 modalLogoutCodes 分支 | `service-alova/request/index.ts:88-90` |

**stores / constitution**

| 事實 | 位置 |
|---|---|
| `AppState.redis = ConnectionManager`(cloneable、auto-reconnect)**目前只 PUBLISH、無 GET/SET** → 028 加 helper | `state.rs:14-29`、`policy_watcher.rs:103-112` |
| `sys_user` = 業務主表 + §I.6 六審計欄;加系統欄(非 operator-tracked)走 PASS-by-scope | `entity/src/sys_user.rs`、migration 014 |
| 027 `sys_token`:`rotation_chain VARCHAR(36)`、Reuse 分支 `UPDATE revoked WHERE rotation_chain=` 已有整鏈 revoke 範式 → `revoke_other_chains` 沿用 | `sys_token.rs:138-208` |
| **§11.17(018 先例)**:enforce 改 per-request DB-fresh stateful「**不需 amendment**;013 D4 stateless refresh = feature-level deviation」 | `DESIGN:1502` |
| constitution **無** stateless/session/撤銷 凍結拍板(grep 零命中);mock JWT 無 session_id、無 logout endpoint、無 single-session 語義 | `constitution.md`、`MOCK-COVERAGE-AUDIT §4.5` |

**baseline**:server **218** 單測 + `entity_access_lint` 17 + `endpoint_coverage_lint` 30(route 數,028 無新對外端點 → 不變)。

## 3. Scope

**IN(028 — 引擎 + policy 儲存)**:
1. **migration:sys_user 加 2 系統欄** — `current_session_id VARCHAR(36) NULL`(pointer 持久真相)+ `session_policy VARCHAR(20) NOT NULL DEFAULT 'inherit'`(三態)。
2. **config 加 `single_session_default`**(系統層級預設,028 = `off`)。
3. **Claims 加 `sid: String`(required)** + `issue_tokens` 加 `session_id` 參 + **login 重排**(先鑄 sid 再簽)。
4. **Redis pointer helper**(GET/SET):set 雙寫 sys_user+Redis、get Redis→miss 回 sys_user+回填(lazy rehydration)。
5. **027 facade 加 `revoke_other_chains(user_id, keep_chain)`**(沿 Reuse 分支整鏈 revoke 範式)。
6. **login 串**(resolved=on):鑄 sid、寫 pointer、revoke 其他 chain、create_chain_head(027 沿用)。
7. **4 gate session 檢查**(enforce_mw + getUserInfo/getUserRoutes/isRouteExist):resolved=on 且 sid≠pointer → `7777`。**不含 ctx_mw**。
8. **refresh 驗 pointer**(resolved=on)+ 繼承 sid。
9. acceptance:policy 開/關各驗、多 tab 踢、user 隔離、部署過渡、hybrid store rehydration。

**OUT(明示)**:
- **admin 設定 UI + 系統預設 runtime store + 每帳號 UI 設定 → [029](#9-交棒)**(028 policy 靠 config/DB/seed 控)。028 上線時 single-session **不可由介面開**、只能 DB/seed 個別開或改 config 重部署。
- **真正 per-device「每裝置一個 session」**(甲:device-id + sys_session 表 + base-web 改)→ 不在範圍;乙 解讀 = policy=關 即多裝置並存。
- **`/auth/logout` endpoint** → 維持「無 logout endpoint」(M3 pointer 不需要;登出=前端清 token、pointer 等下次登入 bump;沿 013/027 設計,mock 亦無 logout endpoint)。
- **metrics / 踢事件指標** → Phase 6。

## 4. 設計

### 4.1 policy 模型 + 解析
- `sys_user.session_policy ∈ {inherit, on, off}`(VARCHAR(20),default `inherit`)。
- 系統預設(028)= config `single_session_default ∈ {on, off}`,**028 = `off`**(in-memory,如 JwtConfig 旁)。
- `resolve(policy, system_default) = policy==inherit ? system_default : policy`。
- enforcement(gate/login/refresh)**僅 `resolved==on` 作用**;`off` 完全略過 → 027 多裝置行為。
- 028 預設 `off` + 帳號預設 `inherit` → **上線後預設全員 resolved=off**(dormant);要 single-session 的帳號 DB/seed 設 `session_policy='on'`,或改 config 全域開(重部署),或等 029 UI。

### 4.2 session 身分(sid)+ Claims + login 重排
- `sid = Uuid::new_v4().to_string()`(獨立、與 027 rotation_chain **正交**:027 chain=refresh 血統、028 sid=session 身分)。
- Claims 加 `pub sid: String`(**required**);`issue_tokens(user_id, roles, session_id: &str, jwt)` 兩 token 都帶。
- **login 重排**:現為 `issue_tokens`(inner)→ create_chain_head(outer);改為 **先鑄 sid → `issue_tokens(uid, roles, &sid, ...)` → create_chain_head → (resolved=on) revoke 其他 chain + set pointer**。
- **refresh 繼承**:`issue_tokens(claims.user_id, claims.roles, &claims.sid, ...)`(同 sid 過 refresh、session 存活)。

### 4.3 pointer 混合儲存(Redis + sys_user)
- **`sys_user.current_session_id` = 持久真相**(must-succeed);**Redis `sess:{uid}` = 熱路徑 cache**(best-effort)。
- **SET(成功登入時)**:先 `UPDATE sys_user.current_session_id=sid`(失敗 → login 回 `5000`),再 Redis SET(失敗忽略,靠 lazy rehydration 自癒)。**每次成功登入一律 set pointer**(即使 resolved=off,供日後切 on 即時生效;失敗登入不寫;login 非熱路徑、廉)。
- **GET(每 gate)**:Redis GET → **miss → 讀 sys_user + 回填 Redis**。sys_user 是真相 → cache miss **不誤踢**。
- cache 值 = `{session_policy, current_session_id}` 一筆(**一次 GET 同取 policy + pointer**,供 §4.4 helper 單次查);序列化格式(JSON record vs Redis hash)為 plan 級實作細節。

### 4.4 session 檢查注入點(4 gate,不含 ctx_mw)
- 新 helper `session::is_current(state, &claims).await -> bool`:讀 `{policy, pointer}`(Redis→miss sys_user)→ `resolve(policy, config.single_session_default)` → `off` 直接 `true`(不踢)、`on` 比 `claims.sid == pointer`。
- `enforce_mw` + `getUserInfo` + `getUserRoutes` + `isRouteExist`:`verify_bearer` 成功後呼,`false` → **`Res::err(BizCode::ModalLogout7777)`**。
- **`ctx_mw` 不加**(best-effort 審計、不 gate;被踢請求已由上述 4 gate 擋下)。
- **不放 `verify_bearer`**:其 026 契約是中性 `Option<Claims>`、不決定狀態;且會逼 ctx_mw 每請求多 I/O。

### 4.5 踢碼 `7777` + base-web 級聯(grounding 確認)
`Res::err(BizCode::ModalLogout7777)`(msg「账号在他处登录」)→ base-web modalLogoutCodes 分支顯示 modal(content=rust msg)→ 確認 → `resetStore()` 登出。**排在 refresh 之前、永不觸發 refresh、無迴圈、無新碼、base-web 零改**。

### 4.6 refresh 驗 pointer + login revoke 舊鏈
- **refresh**(resolved=on):`claims.sid != pointer` → `7777`(與 gate 踢碼**統一**,非 8888)→ 被踢 session 不能靠 027 rotation 復活;refreshed token 繼承 sid。`resolved=off` → 不檢查(027 行為)。
- **login revoke 舊鏈**(resolved=on):新登入後 `revoke_other_chains(uid, keep=this_chain)` 把該 user **其他 active 027 chain** 標 revoked → 舊 session 的 refresh 立刻死(不必等 pointer 比對)。pointer 移動讓 access 被踢;revoke 舊鏈讓 refresh 立刻無效 + DB 整潔。`resolved=off` → 不 revoke(多裝置並存)。

### 4.7 部署過渡(required sid → 一次性全站重登,user 親決接受)
Claims 加 **required** `sid` → 所有 pre-028 token(無 sid)deserialize 失敗 → `3333`→base-web refresh→舊 refresh 也無 sid→deserialize 失敗→`8888`→乾淨登出重登。**與 policy 開關無關**(即使系統預設=off,Claims schema 變更仍觸發此一次性重登);admin 小用戶量、資料無損、沿 027 D9。**此路徑走 Claims 反序列化失敗(等同過期/壞 token、非 session 邏輯)、與 `7777` session-superseded 路徑正交、不經 policy 判斷** —— 兩條登出觸發互不交叉。

## 5. 既有設計張力的解法

- **access stateless 反轉(§11.17 018 先例)**:constitution 無「access stateless / refresh-only 撤銷」凍結拍板(grep 證實);018 已把 enforce 改 per-request DB-fresh stateful、明文「不需 amendment」;013 stateless refresh = feature-level deviation。028 加 session pointer = 同軸延伸 → **預期無 amendment**。**差異**:018 是「valid token 但 fresh authz deny」、028 是「valid token 但被 superseded 拒收」——更進一步、仍非違反凍結規則。可選:DESIGN §11 記「access 可被 session 撤銷」新公理(非 amend 既有)。
- **logout 無 endpoint 維持**:M3 pointer 不需 logout endpoint;登出後 token 仍簽章有效直到 expiry/下次登入 bump — 與 013/027 一致、不新增風險。
- **與 027 的關係**:027 容忍多裝置(partial index 非-unique);028 在 policy=on 時反之(刻意語義反轉);policy=off 完全是 027 行為。被踢 session 的 027 chain 由 §4.6 revoke(立刻死)。
- **028/029 拆分**:028 = 後端引擎 + policy 儲存(base-web 零改、無對外端點);029 = admin UI(系統預設 runtime store + 每帳號 UI + endpoint + casbin + base-web 頁)。對齊本專案「後端先、UI 後」遞進(019→020→021)。
- **per-device 拆出**:「每裝置一個 session」(甲)需 device-id + sys_session 表 + base-web 改,不同軸、若要再開獨立 feature。

## 6. 測試(CLAUDE.md §3/§4)

- **純邏輯 seam(TDD)**:`resolve(policy, default)` 三態解析(inherit→default / on / off)— 純函式 red→green。
- **live-DB/curl 活體**(沿 §2.10 in-crate `#[ignore]` + env-gate `DATABASE_URL`):
  - **policy=on**:登入 A → pointer=sidA;同 user 登入 B → pointer=sidB + A 的 chain revoked。A 的 access 打 4 gate → **`7777`**;A 的 refresh → `7777`(被擋、chain 已 revoked);B 正常 `0000`。
  - **policy=off**(或 inherit+系統 off):A、B 並存,A 打 gate → `0000`(不踢)、A refresh → `0000`(027 行為);驗 028 dormant。
  - **hybrid store**:清空 Redis key 後請求 → 仍正確(lazy 回填 sys_user)、不誤踢。
  - **user 隔離**:登入 B(userX)不影響 userY。
  - **部署過渡**:pre-028 token(無 sid)→ 一次性重登級聯(`3333→refresh→8888`)。
  - migration up→down→up 可逆(sys_user 加/減 2 欄,throwaway DB)。
- **CDP**(isolated context):policy=on 帳號兩 tab → 舊 tab 下個請求彈「账号在他处登录」→ 登出;policy=off 帳號兩 tab 並存不踢。
- **守恆**:`dcargo test -p server` 全綠(218 + 新測)、`entity_access_lint` 17、`endpoint_coverage_lint` **30 不變**(無新對外端點)、`Migrator::up` 0。base-web typecheck N/A(零改)。
- **prod build**:加 migration(sys_user alter)、無新 crate → 守則不強制(可選跑一次)。

## 7. Constitution / size

- rust-api only、**base-web 零改**(無 MODAL-WIRING)、**無新對外端點**、不動 casbin policy、無 fork。
- **Claims 加 `sid`** = internal(base-web opaque、mock 無 session)→ 非 §I.3 wire 變;**踢用現成 `7777`**(13 碼不變、無新碼)。
- **sys_user 加 2 系統欄**(`current_session_id`/`session_policy`)= 機器管理(login/policy 機制設,非 human operator UI;029 admin 改 policy 時走 011 audit、非 per-column `*_by`)→ §I.6 六審計欄前提不成立 → **PASS-by-scope**(plan Constitution Check 明示、沿 027/§2.18 先例)。
- **access stateful**:§11.17 018 先例「不需 amendment」;access stateless 非凍結拍板 → **預期無 amendment**(plan 正式確認 §I.3 碼 / §I.6 欄 / §5.3 logout-無-endpoint 保持)。可選:DESIGN §11 記新公理。
- 預估 §IV 8 項:#1 base-web N/A、#2/#3 menu N/A、#4 wire 不變(7777 現成、Claims internal)、#5 rev2 自家碼、#6 §II 不動、#7 ★ 軌道 N/A、#8 sys_user 系統欄 PASS-by-scope → 預期 **8/8 PASS、無 amendment**。
- 規模:~4 人日(migration 2 欄 + config / Claims+issue_tokens+login 重排 / Redis pointer helper + sys_user 雙寫 / revoke_other_chains / 4 gate 檢查 + refresh 檢查 / policy 解析純測 + live-DB)。rust-api worktree 單倉、兩段式 commit。

## 8. 拍板紀錄(brainstorm,全決)

1. **session 識別 = 獨立新 sid**(uuid、與 027 rotation_chain 正交)。
2. **pointer = Redis(讀)+ sys_user(持久真相)混合**(login 雙寫 sys_user must-succeed + Redis best-effort;get Redis→miss 回 sys_user 回填)。
3. **Claims `sid` = required**(接受上線全站一次性重登,user 親決)。
4. **登入 revoke 舊 session 的 027 chain**(僅 resolved=on)。
5. **踢碼 = `7777`**(gate 與 refresh **統一**用 7777、非 8888;現成 modal「账号在他处登录」、無迴圈、無新碼)。
6. **session 檢查放 4 認證 gate**(enforce_mw + getUserInfo/getUserRoutes/isRouteExist),**不含 ctx_mw**。
7. **refresh 也驗 pointer + 繼承同 sid**。
8. **policy = sys_user 三態**(inherit/on/off)+ **系統預設 = config、028 = `off`(關)**(dormant 上線)。
9. **028 = 引擎 + policy 儲存**(base-web 零改、無對外端點、policy 後端控);**admin UI 拆 029**。
10. **不需 constitution amendment**(§11.17 018 先例)。
11. **per-device「每裝置一個 session」OUT**(乙 解讀:policy=off = 多裝置)。

## 9. 交棒

- **本 doc 為 brainstorm 收斂結果**(§8 全決)。
- **登記後續 029-single-session-admin-ui**(DESIGN §10 Phase 5 + CHECKLIST):系統預設 runtime store(rev2 首張 system-settings 表)+ admin 設定頁 + 每帳號 policy UI(使用者管理頁)+ get/set endpoint + casbin + base-web。疊在 028 儲存之上。
- 階段 1 `/speckit-specify`(**手動執行**,`before_specify` pre-hook 建 `028-single-session-enforcement` feature branch)。input = 本 doc。
- Phase 0 research 紀律(research.md 須含):4 gate / verify_bearer callsite / sys_user schema / Redis API / Claims 序列化 / 027 facade revoke 範式 最終 grep 對齊(本 doc §2 已大致涵蓋,specify/plan 複核)。
