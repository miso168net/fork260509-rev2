# 028 — single-session enforcement(Phase 0 brainstorm / spec-design)

> 階段 0 brainstorm **起點草稿**。承 027 收尾拆出（[DESIGN §10 Phase 5 item 2](../INTEGRATION-DESIGN.md) + CHECKLIST §2.32）。把 027 刻意維持的「access stateless、多裝置/多族系並存」**反轉**成 **access 端 stateful 單一-session**：一帳號同時只能一個有效登入,新登入即時踢掉所有舊 session(每請求驗證)。
>
> **2026-06-05 grounding 三大 de-risk(workflow 4-reader 實 grep 證實,使 scope 遠小於 027 spec 原估「翻倍」)**：
> ① 踢的 wire 碼 = **現成 `7777`**（`ModalLogout7777`、msg「账号在他处登录」;base-web request 層已處理〔modal→確認→登出〕、排在 refresh 之前、**無死迴圈、無新碼**）;
> ② **預期不需 constitution amendment**（§11.17 018 先例:enforce_mw 早已 per-request DB-fresh〔stateful〕、明文「不需 amend」;「access stateless」從非凍結拍板、僅 013 feature-level deviation）;
> ③ **base-web 零改**（7777 handler 已在、token 對前端 opaque、mock 無 session 語義）。
>
> **待 user 拍板**（本 brainstorm 未決,見 §8）:session_id 來源、pointer 存儲、Claims 過渡策略。

## 1. 目標與性質

把「一帳號單一登入 + 每請求即時踢舊 session」從 027 的 OUT scope 落地:

- **登入 = 鑄新 session 身分 + bump pointer**:每次成功登入產生新 session 身分(`session_id`),記為該 user 的「當前 session」;舊 session 即時作廢。
- **每請求驗 session**:access 端 4 個認證 gate(`enforce_mw` + `getUserInfo` + `getUserRoutes` + `isRouteExist`)在 JWT verify 通過後,再驗「此 token 的 session == 該 user 當前 pointer」;不符 → 回 **`7777`** → base-web 顯示「账号在他处登录」modal → 乾淨登出。
- **refresh 也驗 pointer**:舊 session 的 refresh token 換新 → 回 `7777`/`8888`,避免被踢的 session 靠 027 rotation refresh 復活。

**功能性質**:rust-api 單倉、`Claims` 加 1 欄 + pointer 存儲 + `issue_tokens` 加參 + 改 4 gate + 2 handler(login/refresh)。**wire 中性**(`LoginToken{token,refreshToken}` 逐字不變、JWT 內部 base-web opaque、踢用現成 7777)。**base-web 零改**。**無新 wire endpoint、不動 casbin policy、無 fork**。**預期無 constitution amendment**(§11.17 先例,plan 正式確認)。

## 2. Grounding(實際 code,2026-06-05 親驗 — workflow 4-reader 掃描)

**rust auth surface（028 要改的面）**

| 點 | 位置 | 現行 / 對 028 的意義 |
|---|---|---|
| `Claims` | `jwt.rs:28-42` | `{sub,user_id,roles,exp,iat,iss,aud}` 全 required;doc 明寫 **"never read by base-web"** → 加 `sid` 是 **internal 改、非 wire 改**。non-Option 新欄會破 pre-028 舊 token deserialize(部署過渡,§4.7) |
| `issue_tokens` | `auth.rs:63-67` | `(user_id, roles, &JwtConfig)→簽 access+refresh`(026 抽、027 重用)→ 028 加 `session_id` 參 |
| login 順序 | `auth.rs:88-137` | `issue_tokens`(在 `login_attempt_inner`)**先**、`rotation_chain` mint + `create_chain_head`(outer Ok arm)**後** → 要把 sid 嵌進 Claims **須重排**(先 mint sid 再簽) |
| `refresh_token` | `auth.rs:275-318` | 027 後:verify→預簽 `issue_tokens`→`rotate`→Rotated/Benign→ok·Reuse/NotFound→8888 → 028 加 pointer 檢查 |
| `verify_bearer` 5 callsite | `bearer.rs:40-64` | `enforce_mw`(fail-closed 3333/5003)/ `getUserInfo`·`getUserRoutes`·`isRouteExist`(advisory 3333)/ `ctx_mw`(best-effort None)。⚠️ **3 advisory 端點不走 enforce_mw、各自呼 verify_bearer** → session 檢查若只加 enforce_mw 會漏 |
| `enforce_mw` | `enforce.rs:60-121` | verify_bearer→None→3333;**已 per-request DB-fresh roles(018)** + casbin enforce → 028 再加 1 次 pointer 比對 |

**base-web token-failure flow（確認 7777 路徑）**

| 事實 | 位置 |
|---|---|
| `LOGOUT_CODES=8888,8889`(立即登出) / **`MODAL_LOGOUT_CODES=7777,7778`**(modal→登出) / `EXPIRED_TOKEN_CODES=9999,9998,3333`(refresh retry) | `.env:35-41` |
| **碼處理順序:logout → modalLogout → expiredToken** → `7777` 永走 modal、**永不觸發 refresh** | `request/index.ts:54-97` |
| 7777 分支:`$dialog.error({content: response.data.msg, onPositiveClick: logoutAndCleanup, onClose: logoutAndCleanup})`;`errMsgStack` 去重(多請求同時被踢只彈一次) | `request/index.ts:61-84` |
| `resetStore()` = `clearAuthStorage()` + `$reset()` + `toLogin()`(清 token、跳 /login) | `store/modules/auth/index.ts:42-55` |
| alova 層同有 modalLogoutCodes 分支 | `service-alova/request/index.ts:88-90` |

**stores / codes / constitution**

| 事實 | 位置 |
|---|---|
| `BizCode` 13 碼凍結;**`ModalLogout7777 => "7777"`、msg「账号在他处登录」已存在** | `envelope.rs:93-125` |
| `AppState.redis = ConnectionManager`(cloneable、auto-reconnect)**但目前只用 PUBLISH、無 GET/SET helper** | `state.rs:14-29`、`policy_watcher.rs:103-112` |
| `sys_user` = 業務主表 + §I.6 六審計欄(created/updated/deleted ×_at/_by) | `entity/src/sys_user.rs`、migration 014 |
| 027 `sys_token`:`rotation_chain VARCHAR(36)`、**partial index `(user_id) WHERE status='active'` 刻意非-unique(多裝置容忍)** → 與 single-session 語義對立、不可直接當 pointer | `sys_token.rs`、migration 026 |
| **§11.17(018 先例)**:enforce 改 per-request DB-fresh stateful「**不需 amendment**:§II/§11 凍結拍板無『enforce 取角色源=claims』項;013 D4 stateless refresh = **feature-level deviation**」 | `DESIGN:1502` |
| mock:JWT 僅 `{token,refreshToken}`、**無 session_id**、無 logout endpoint、無 single-session 語義;token 對前端 opaque | `MOCK-COVERAGE-AUDIT §4.5` |

**baseline**:server **218** 單測 + `entity_access_lint` 17 + `endpoint_coverage_lint` 30(route 數,028 無新端點 → 不變)。

## 3. Scope

**IN**:
1. **`Claims` 加 `sid`**(session 身分)+ `issue_tokens` 加 `session_id` 參 + **login 重排**(先 mint sid 再簽,使 sid 入 Claims)。
2. **pointer 存儲**(該 user「當前 session_id」)+ login 寫入 + refresh re-check（存儲選項見 §4.2,待拍板）。
3. **session 檢查**:`enforce_mw` + `getUserInfo` + `getUserRoutes` + `isRouteExist` 在 verify 後比對 `claims.sid == pointer`;不符 → **`7777`**。(**不含 `ctx_mw`** — best-effort 審計、不 gate。)
4. **refresh 路徑驗 pointer**:舊 session refresh → `7777`/`8888`(防復活)。
5. **session 換新貫穿 refresh**:refreshed token 繼承同 `sid`(同 session 存活過 refresh)。
6. acceptance:多 tab/裝置登入同帳號 → 舊被踢、新存活;user 間互不踢。

**OUT(明示)**:
- **`/auth/logout` endpoint** → 維持 §4.12.4/§5.3「logout 無 endpoint」。M3 pointer **不需要**:登出=前端清 token,pointer 等下次登入才 bump(被放棄 session 靠 token 自然過期,與 013/027 現狀一致、不新增風險)。若 user 要「登出即殺 server session」→ 需 logout endpoint(碰 §5.3)→ 列可選 follow-up。
- **每裝置一 session（multi-session-per-device）** → 028 = **一帳號一 session**;per-device 需 session_id 帶裝置維度(不同 feature)。
- **被踢 session 的 027 rotation_chain 主動 revoke** → M3 pointer 不需(舊 chain 仍 active 但 refresh 被 pointer 擋死);可選整潔化(§5)。
- **metrics / observability**（踢事件指標)→ Phase 6。
- **多 instance pointer fan-out 一致性** → 視 pointer 存儲選項(Redis 天然多實例一致)、現單實例。

## 4. 設計

> ⚠️ §4.1/§4.2/§4.3 含**待 user 拍板**的選項(見 §8);以下列選項 + 傾向 + 取捨,brainstorm 收斂或 /speckit-clarify 釘定。

### 4.1 session 身分（`session_id`）— 來源【待拍板】

| 選項 | 做法 | 利 | 弊 |
|---|---|---|---|
| **(A) 獨立新 sid**〔傾向〕 | login 鑄 `Uuid::new_v4()` 為 sid、與 027 rotation_chain 正交 | 語義乾淨(027 chain=refresh 血統、028 sid=session 身分,兩軸分離);不碰 027 非-unique index | 多一個 id |
| (B) 重用 rotation_chain | session_id = 027 的 rotation_chain | 一個 id、refresh 自然保留 chain=保留 sid | 耦合 027 chain 生命週期;若要 single-chain-per-user 會與 027 partial index 非-unique(多裝置容忍)**衝突** |

兩者皆需:sid 嵌進 Claims、**refresh 時繼承同 sid**(session 存活過 refresh)。傾向 **(A)** — 正交、低耦合。

### 4.2 pointer 存儲（user → 當前 session_id）【待拍板】

| 選項 | 做法 | 利 | 弊 |
|---|---|---|---|
| (A) Redis key | `sess:{user_id} -> session_id`(每認證請求 GET) | hot-path 快、**多實例天然一致**;不動 schema | **需新增 GET/SET helper**(現只用 PUBLISH);**易失**(Redis restart → 全員重登) |
| (B) sys_user 欄〔傾向〕 | `current_session_id VARCHAR(36)`(login UPDATE、gate 讀) | **持久**;`getUserInfo` 已查 sys_user(讀免費);與既有 enforce DB 讀同源可合併 | enforce_mw/getUserRoutes/isRouteExist 多 1 query(可 fold);§I.6 系統欄論證(見 §7) |

傾向 **(B) sys_user 欄** — 持久 + 與既有 per-request DB 讀(018)同源,hot-path 邊際成本小;但若未來要多實例 + 免重登,Redis 較佳。plan 階段量測。

### 4.3 Claims 加 `sid` + 部署過渡【待拍板】

| 選項 | 做法 | 過渡行為 |
|---|---|---|
| (A) `sid: Option<String>` | 寬容 | 舊 token deserialize sid=None → 須決 None 視為「legacy 放行一次」或「一律踢」 |
| (B) `sid: String`（required） | 嚴格 | 舊 access deserialize 失敗→3333→base-web refresh→舊 refresh 也缺 sid→deserialize 失敗→**8888→乾淨登出**(一次性重登,級聯自然收斂、027 D9 先例) |

傾向 **(B) required** — 級聯乾淨(3333→refresh→8888→登出)、簡單、有 027 一次性重登先例;admin 小用戶量可接受。

### 4.4 session 檢查注入點

**不放 `verify_bearer`**：bearer.rs:40-54 明定 verify_bearer 回中性 `Option<Claims>`、不決定狀態;且若加 DB/Redis 讀會逼 `ctx_mw`(best-effort 審計)每請求多一次 I/O。

**做法**:新增小 helper `session::is_current(state, &claims).await -> bool`(讀 pointer 比對 `claims.sid`),於 **4 個認證 gate** 在 `verify_bearer` 成功後呼叫,`false` → 回 `7777`:
- `enforce_mw`、`getUserInfo`、`getUserRoutes`、`isRouteExist`。
- **`ctx_mw` 不加**(best-effort、不 gate;被踢請求已由上述 gate 擋下)。

(精確 shape — 獨立 helper vs `verify_bearer_and_session` wrapper — plan 決定。)

### 4.5 踢的 wire 碼 = `7777`（grounding 確認）

`Res::err(BizCode::ModalLogout7777)`(msg 預設「账号在他处登录」)→ base-web modalLogoutCodes 分支:顯示 modal(content=rust msg)→ 確認 → `resetStore()` 登出。**排在 refresh 之前、永不觸發 refresh、無迴圈、無新碼**(§2 確認)。比 8888(generic「请重新登录」)更告知 user「為何被登出」。

### 4.6 refresh 路徑 pointer 檢查

`refresh_token` 在 027 `rotate` 成功後(或之前)加:`claims.sid == pointer(user_id)`? 不符 → `7777`/`8888`(防被踢 session 靠 027 rotation 復活)。refreshed token **繼承同 `sid`**(`issue_tokens(user_id, roles, claims.sid, ...)`)→ 當前 session 存活過 refresh、非當前 session 被擋死。

### 4.7 部署過渡（一次性、benign）

pre-028 token 無 `sid`。required-sid(§4.3 B)→ deserialize 失敗 → 一次性重登級聯(3333→refresh→8888→登出);Option-sid → None 視策略。沿 027 D9「一次性、資料無損、不做相容墊片」。

## 5. 既有設計張力的解法

- **access stateless 反轉(§11.17 018 先例)**:013 D4 標 refresh stateless、但 018 已把 `enforce_mw` 改 per-request DB-fresh(stateful)且明文「**不需 amendment**(§II/§11 無凍結 enforce 取角色源)」。028 加 session pointer = **同一條軸的延伸**(enforce 早就每請求讀 DB)→ 預期不需 amend。**差異**:018 是「valid token 但 fresh authz deny」;028 是「valid token 但被 superseded 拒收」——更進一步,但仍非違反任何凍結規則。可選:記「access 可被 session 撤銷」新公理為 DESIGN §11 拍板(非 amend 既有項,鏡像 §11.17)。
- **logout 無 endpoint(§4.12.4/§5.3)維持**:M3 pointer 機制不需 logout endpoint。取捨:登出後該 session token 仍簽章有效直到 expiry/下次登入 bump — 與 013/027 現狀一致、不新增風險。
- **與 027 的關係**:027 容忍多裝置(partial index 非-unique);028 single-session 反之 = **刻意語義反轉**。被踢 session 的 027 chain 仍 active、但 refresh 被 pointer 擋(§4.6)→ 死,M3 不主動 revoke chain(可選整潔化:登入時連帶 revoke 舊 session chain — 非必要)。
- **多裝置 UX**:028 後同帳號第二裝置登入 → 第一裝置下個請求彈「账号在他处登录」→ 登出。此為 single-session 的**預期行為**(非 bug);`errMsgStack` 去重確保只彈一次。

## 6. 測試（CLAUDE.md §3/§4）

- **純邏輯 seam(若有)**:`is_current(claims.sid, pointer)` 的純比對若抽得出純函式 → TDD;但多為 pointer I/O → 由 live-DB acceptance 覆蓋(wiring 類,plan/tasks 明示無純單測理由)。
- **live-DB/curl 活體**(沿 §2.10 in-crate `#[ignore]` + env-gate `DATABASE_URL`):
  - 登入 A → pointer=sidA;同 user 登入 B → pointer=sidB。
  - A 的 access 打 `enforce_mw`/`getUserInfo`/`getUserRoutes`/`isRouteExist` → **`7777`**;B 正常 `0000`。
  - A 的 refresh → `7777`/`8888`(被擋);B refresh → `0000` 且 pointer 不變(sid 繼承)。
  - 失敗碼紀律:grep response 無 `3333/9999/9998` 出現在「被踢」路徑(踢一律 7777/8888)。
  - user 隔離:登入 B(userX)不踢 userY 的 session。
  - 部署過渡:pre-028 token(無 sid)→ 一次性重登級聯。
  - (若用 sys_user 欄)migration up→down→up 可逆(throwaway DB)。
- **CDP**(沿紀律,isolated context):兩 tab 登入同帳號 → 舊 tab 下個請求彈「账号在他处登录」modal → 確認 → /login。
- **守恆**:`dcargo test -p server` 全綠(218 + 新測)、`entity_access_lint` 17、`endpoint_coverage_lint` **30 不變**(無新端點)、`Migrator::up` 0。base-web typecheck N/A(零改)。
- **prod build**:若加 migration(sys_user 欄)→ 非新 crate,守則不強制(可選跑一次)。

## 7. Constitution / size

- rust-api only、**base-web 零改**(無 MODAL-WIRING)、**無新 wire endpoint**、不動 casbin policy、無 fork。
- **Claims 加 `sid`** = internal(base-web opaque、mock 無 session 語義)→ 非 §I.3 wire 變;**踢用現成 `7777`**(13 碼不變、無新碼)。
- **pointer 若 sys_user 欄** = 機器管理系統欄(類比 password / 027 sys_token);§I.6 六審計欄規則前提(追 human operator 的 `*_by`)不成立 → **PASS-by-scope**(plan Constitution Check 明示、沿 §2.18/027 先例)。
- **access stateful**:§11.17 018 先例「不需 amendment」;「access stateless」非凍結拍板 → **預期無 amendment**(plan 正式確認 §I.3 碼 / §I.6 欄 / §5.3 logout-無-endpoint 保持)。可選:DESIGN §11 記新公理。
- 預估 §IV 8 項:#1 base-web N/A、#2/#3 menu N/A、#4 wire 不變(7777 現成、Claims internal)、#5 rev2 自家碼、#6 §II 不動、#7 ★ 軌道 N/A、#8 sys_user 欄走 §I.6 系統欄 PASS-by-scope → 預期 **8/8 PASS、無 amendment**。
- 規模:~3–4 人日(Claims+issue_tokens+login 重排 / pointer store + login 寫 + refresh check / 4 gate 檢查 / 測試)。rust-api worktree 單倉、兩段式 commit。

## 8. 拍板紀錄（brainstorm）

**已收斂（grounding 證實,§2）**:
- **踢碼 = `7777`**(`ModalLogout7777`「账号在他处登录」,現成、modal→登出、無迴圈、無新碼)。
- **base-web 零改**(7777 handler 已在、token opaque)。
- **預期不需 constitution amendment**(§11.17 018 先例:enforce 早已 stateful per-request)。
- **session 檢查放 4 認證 gate**(enforce_mw + getUserInfo/getUserRoutes/isRouteExist),**不含 ctx_mw**。
- **refresh 也驗 pointer**(防被踢 session 復活);refreshed token 繼承同 sid。

**待 user 拍板（本 brainstorm 未決,列選項 + 傾向）**:
- **session_id 來源**:(A) 獨立新 sid〔傾向,正交〕 vs (B) 重用 027 rotation_chain。
- **pointer 存儲**:(A) Redis key(hot-path、多實例、易失) vs (B) sys_user 欄〔傾向,持久、co-located〕。
- **Claims 過渡**:(A) `Option<String>`(寬容) vs (B) `String` required〔傾向,一次性重登級聯乾淨、027 先例〕。
- **(可選)** 登入時是否連帶 revoke 舊 session 的 027 rotation_chain(整潔 vs 非必要)。

## 9. 交棒

- **本 doc 為 brainstorm 起點草稿**:§8「待拍板」3+1 項建議用 `superpowers:brainstorming` 與 user 收斂(或於階段 1 `/speckit-clarify` 釘定)。
- 階段 1 `/speckit-specify`(**手動執行**,`before_specify` pre-hook 建 `028-single-session-enforcement` feature branch)。input = 本 doc。
- Phase 0 research 紀律(research.md 須含)仍要對 4 gate / pointer 存儲 / Claims 序列化做最終 grep 對齊(本 doc §2 已大致涵蓋,specify/plan 階段複核)。
