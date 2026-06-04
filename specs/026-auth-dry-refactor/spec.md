# Feature Specification: auth DRY refactor(verify_bearer + issue_tokens helper)

**Feature Branch**: `026-auth-dry-refactor`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "auth DRY refactor — 抽 verify_bearer 與 issue_tokens helper、純 refactor 行為零變(承 Phase 3 #5 縮水後實質剩餘)。設計來源:[`docs/superpowers/026-auth-dry-refactor.md`](../../docs/superpowers/026-auth-dry-refactor.md)(Phase 0 brainstorm,Approach A 親決)。"

> **性質**:這是一個**內部重構(refactor)**feature —— 受益者是維護者(降低後續修改 auth 邏輯時的多處 drift 風險),**對最終使用者與 wire 行為零影響**。故下列 user story 以「維護者視角」表述,核心驗收為**既有行為逐字不變**。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 請求驗證前導單一真相(verify_bearer) (Priority: P1)

身為維護 auth 層的開發者,我希望 5 個受 JWT 保護的進入點(權限 enforce 中介層、getUserInfo、getUserRoutes、isRouteExist、請求稽核中介層)**共用同一段「取 bearer token → 驗 access JWT → 得 claims」邏輯**,而不是各自複製一份;這樣日後若要調整驗證行為(新增 claim 檢查、token 版本檢查、二次驗證),只改一處,不會漏改某處而產生授權判斷的不一致。

**Why this priority**: 這是 auth 層**最高頻、最危險**的重複 —— 同一段驗證邏輯散落 5 處,任一處被升級而其他未同步,就是潛在的授權破口。單獨交付即降低此 drift 風險,是 MVP。

**Independent Test**: 把 `verify_bearer` helper 抽出、5 處改呼叫它後,(a) helper 自身單測(有效 token→得 claims、缺 header→無、壞簽名/過期/錯 aud→無)綠;(b) 既有 auth 驗收(login→getUserInfo→getUserRoutes 三角色、enforce allow/deny、refresh)**回應與錯誤碼逐字不變**。

**Acceptance Scenarios**:

1. **Given** 一個有效的 access token, **When** 對任一受保護進入點發請求, **Then** 行為與重構前**完全相同**(同樣放行/回應,claims 正確解出)。
2. **Given** 一個缺失/格式錯誤/過期/簽名錯誤/aud 錯的 token, **When** 對任一進入點發請求, **Then** 各進入點回**與重構前相同**的結果(route/getUserInfo→3333、enforce→3333、ctx 稽核→不記錄但請求照常)。
3. **Given** 重構完成, **When** 檢視 auth 程式碼, **Then** 「bearer→verify→claims」邏輯**只存在於 verify_bearer 一處**,5 個進入點皆呼叫它。

---

### User Story 2 - Token 簽發單一真相(issue_tokens) (Priority: P2)

身為維護 auth 層的開發者,我希望「簽發一對 access + refresh token」的邏輯**只存在一處**,讓 login 與 refreshToken 兩條路徑共用;這樣 token 的 secret/TTL/claims 構造若要調整,只改一處,兩條簽發路徑不會 drift。

**Why this priority**: token 簽發在 login 與 refresh 各複製一份(各約 28 行),屬便利性/一致性收斂;比 US1 次要,因其影響面較小(兩處而非五處)。

**Independent Test**: 抽出 `issue_tokens` helper、login 與 refresh 改呼叫它後,(a) helper 單測(回的 access 可用 access secret 驗、refresh 可用 refresh secret 驗、user_id/roles round-trip)綠;(b) 既有 login round-trip 與 refresh 驗收**回應與碼逐字不變**(成功回 token 對、簽發失敗仍回 5000)。

**Acceptance Scenarios**:

1. **Given** 合法登入或合法 refresh, **When** 簽發 token, **Then** 回的 access+refresh 對與重構前**結構/可驗性相同**,wire 回應不變。
2. **Given** 簽發過程發生內部錯誤, **When** login 或 refresh 觸發, **Then** 仍回**與重構前相同**的內部錯誤碼(5000),不洩漏其他碼。

---

### User Story 3 - 驗證失敗策略文件化(fail-closed vs advisory) (Priority: P3)

身為維護 auth 層的開發者,我希望「不同進入點對驗證/角色查詢失敗採用不同策略」這個**刻意的設計**被明文記錄,讓未來新增進入點時能選對策略,不會誤用。

**Why this priority**: 一致性/可維護性保障(知識留存),不改行為,優先序最低但有助避免未來誤用。

**Independent Test**: 文件(spec + helper doc-comment)清楚記載三種策略及其適用情境;無行為變更需驗。

**Acceptance Scenarios**:

1. **Given** 文件已更新, **When** 開發者檢視, **Then** 能讀到:enforce=**fail-closed**(角色查詢失敗→拒絕)、route handlers=**advisory**(token/角色問題→請客戶端重新驗證)、稽核中介層=**best-effort**(失敗→不記錄、不擾請求)三種策略的定義與理由。

### Edge Cases

- **驗證失敗訊息合併**:重構前 4 處各有一行帶 handler 名前綴的 debug 記錄;重構後合併為 helper 內一條通用記錄(保留錯誤明細)。此為**可觀察的記錄差異、但非 wire/回應行為變更**,屬刻意收斂(親決)。
- **角色查詢段不收斂**:4 個進入點的角色查詢有 3 種變體 + 2 種錯誤策略,刻意**保留各自 inline**,不在本波抽取(避免引入低效益的抽象)。
- **getUserInfo 額外載入 user**:取顯示名(nick_name)的 user 載入仍留在 getUserInfo,不進共用 helper。
- **getUserRoutes 的 ordered 角色 + per-role home**:仍留 inline,不變。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 把「取 bearer token → 驗 access JWT → 得 claims」的請求前導收斂為**單一共用單元**,供全部 5 個受保護進入點消費。
- **FR-002**: 系統 MUST 把「簽發一對 access + refresh token」收斂為**單一共用單元**,供 login 與 refreshToken 兩條路徑消費。
- **FR-003**: 重構 MUST NOT 改變任何 wire 回應、業務碼、HTTP 狀態 —— login / getUserInfo / getUserRoutes / isRouteExist / enforce / refreshToken 的可觀察行為**逐字不變**(由既有測試前後不變驗證)。
- **FR-004**: 每個進入點 MUST 保留其既有的失敗策略:enforce 對角色查詢失敗 **fail-closed**(403/權限不足);route handlers 對 token/角色問題回 advisory(重新驗證);稽核中介層 best-effort(不擾請求);簽發失敗回內部錯誤。共用單元 MUST NOT 自行決定這些映射(只回中性結果、由各進入點映射)。
- **FR-005**: 上述失敗策略的刻意分歧 MUST 被文件化(spec + 程式碼註解)。
- **FR-006**: 新共用單元 MUST 各有單元測試覆蓋其正反案例(驗證成功/各類失敗;簽發後可驗)。
- **FR-007**: 本波 MUST NOT 引入新對外端點、資料表、外部相依、資料庫遷移,MUST NOT 變更 base-web、MUST NOT 變更權限政策(casbin)。
- **FR-008**: 角色查詢段(含 ordered 變體與 getUserInfo 的 user 載入)MUST 維持各自 inline、不在本波收斂(明示 scope 外)。
- **FR-009**: metrics / observability / tracing 標準化 MUST 留待後續(明示 scope 外,避免與後續觀察性堆疊重工)。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 重構後,「bearer→verify→claims」前導在程式碼中**只出現於 1 個共用單元**,被 5 個進入點消費(重構前 5 份 → 後 1 份)。
- **SC-002**: 重構後,「access+refresh 簽發」在程式碼中**只出現於 1 個共用單元**,被 2 條路徑消費(重構前 2 份 → 後 1 份)。
- **SC-003**: 既有 auth 測試(單元 + live-DB 驗收)**100% 前後不變即綠**;login / getUserInfo / getUserRoutes 三角色 / enforce allow·deny / refreshToken 的回應與碼**0 差異**。
- **SC-004**: 新增的共用單元測試 100% 覆蓋正反案例且全綠。
- **SC-005**: 守恆不破:既有 entity-access lint(17)、endpoint coverage(30,本波不動端點)、`Migrator::up`=0 維持。

## Assumptions

- **既有測試是回歸防護網**:既有的 auth 單元測試 + live-DB 驗收足以驗證「行為逐字不變」;本波不新增 wire-level 驗收(無行為變更)。
- **純重構,無行為意圖**:唯一可接受的可觀察差異是 log 訊息收斂(皆親決、wire/碼/狀態零變):① verify-failed debug log 由 4 條 per-handler 訊息合併為 helper 內 1 條通用訊息(`verify_bearer`,debug 級);② `ctx_mw` 原 silent verify-fail 現亦經 `verify_bearer` 共用該 1 條 debug log;③ `refresh_token` 兩條 sign-error 訊息(access / refresh)合併為 1 條通用訊息(error 級)。
- **角色查詢段刻意不抽**:其變體與錯誤策略差異使收斂效益低於成本(Approach A 親決)。
- **token rotation / stale token 屬獨立後續(Phase 5)**,不在本波。
- **rust-api 單倉**:全部變動在 rust-api worktree,base-web 不動。
