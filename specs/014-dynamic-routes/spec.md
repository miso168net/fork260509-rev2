# Feature Specification: dynamic-routes

**Feature Branch**: `014-dynamic-routes`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "@docs/superpowers/014-dynamic-routes.md"（dynamic mode 路由：`/route/getConstantRoutes` + `/route/getUserRoutes` + `/route/isRouteExist`，把 base-web 翻到 dynamic auth route mode，由 rev2 後端依角色供應 menu/route〔最小機制證明、Phase 3 #2〕）

**Phase 0 brainstorm source**: [`docs/superpowers/014-dynamic-routes.md`](../../docs/superpowers/014-dynamic-routes.md)

---

## Clarifications

### Session 2026-05-30

- Phase 0 brainstorm 已凍結全部設計決策（D1-D8），見 [`docs/superpowers/014-dynamic-routes.md`](../../docs/superpowers/014-dynamic-routes.md)。本 feature 忠實落地、非自由設計。
- **D1 範圍＝最小 wire 證明**：實作 3 個路由 endpoint + 把 base-web 翻 dynamic mode；route 定義程式內寫死、角色過濾用程式內 `role→[route]` map。**不**建選單資料表、**不**做選單 CRUD、**不**走授權政策（Casbin）驅動路由、**不**做政策失效通知（redis pub-sub）——皆後續階段。
- **D2 route 涵蓋＝真實業務 menu**：鏡像 base-web 真實「系统管理」整棵（user/role/menu/user-detail）+ 首页；**不**含 demo menu。常數路由＝登入頁 + 403/404/500（對齊 mock）。
- **D3 角色↔menu 可見範圍**：Super＝全部；Admin＝首页 + 系统管理（僅用户管理 + 使用者明細）；User＝**只有首页**。父層「系统管理」若某角色無任何可見子項則整個不回。
- **D4 角色來源＝即時查權威資料源**：getUserRoutes 的角色由後端即時查使用者-角色關聯（與 getUserInfo 一致），非僅讀憑證內快照。撤權即時性（憑證快照 vs 即時查）之完整取捨留完整授權 rollout 階段。
- **D5 endpoint 認證**：getConstantRoutes **公開**（無需憑證、應用啟動即觸發）；getUserRoutes / isRouteExist 需有效存取憑證（無效/過期/缺失回 `3333`）；三 endpoint 皆**不**做角色攔截（人人可呼叫拿「自己的」menu，過濾在端點內以角色 map 完成）。
- **D6 isRouteExist＝依角色過濾**：回「該路由名是否存在於**該使用者可見的**路由集合」；不可見即回否（讓前端導向擋掉越權路由）。
- **D7 home 欄＝固定首页路由鍵**；路由識別碼為字串型（對齊前端 typings）。
- **D8 acceptance 含瀏覽器端到端驗證**：base-web 切 dynamic mode 後，於真實瀏覽器登入不同角色，側邊欄 menu 依角色不同（User 只首页、Super 完整系统管理）。
- `/speckit-clarify` 正式掃描（11 taxonomy 類別）結果：**全部 Clear / N-A / 刻意延 plan，0 提問**。brainstorm D1-D8 已凍結全部高影響決策；Non-Functional 的 perf/scale/reliability 為最小機制證明 reasonable-default、observability（請求層 audit）明確 out-of-scope（後續 audit-middleware）；Constraints 的「角色來源 claims vs 即時查 DB」之撤權即時性完整取捨刻意延完整 enforce rollout（D4）；唯一延後項 = route 物件精確 shape（component key / meta 欄）為 plan 階段 Phase 0 research（grep base-web 真實路由定義）、非 spec-level 歧義（原則已定、形狀對齊由 plan 鎖）。無需正式 clarify、可直接進 `/speckit-plan`。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 登入後依角色取得選單（Priority: P1）🎯 MVP

使用者登入後，系統依其角色供應一份「可見選單/路由」清單；高權角色看到完整選單，低權角色只看到被允許的項目。這份清單於 dynamic 模式下被前端用來建構側邊欄選單與可導向路由。

**Why this priority**：這是「後端控制選單權限」（核心鐵紀律②）的最小落地證明，也是 dynamic 模式下登入後第一條決定畫面的 wire。沒有它，後端就無法控制使用者看到哪些功能。

**Independent Test**：以不同預設帳號登入取得憑證 → 取回各自的選單清單 → 確認 `Super` 取得完整（首页 + 系统管理全部）、`Admin` 取得部分（首页 + 系统管理〔僅用户管理〕）、`User` **只取得首页**；且回應含首页路由鍵（home）。即驗。

**Acceptance Scenarios**：

1. **Given** `Super` 已登入，**When** 取回使用者選單，**Then** 回完整選單（首页 + 系统管理：用户管理/角色管理/菜单管理/使用者明細）+ 首页鍵
2. **Given** `Admin` 已登入，**When** 取回使用者選單，**Then** 回首页 + 系统管理（**僅**用户管理 + 使用者明細；**不含**角色管理/菜单管理）
3. **Given** `User` 已登入，**When** 取回使用者選單，**Then** **只回首页**（不含「系统管理」群組——父層無可見子項即整個略過）
4. **Given** 存取憑證無效/過期/缺失，**When** 取回使用者選單，**Then** 回 `3333`

---

### User Story 2 — 應用啟動取得常數路由（Priority: P2）

未登入時，應用啟動即需取得一組「常數路由」（登入頁、錯誤頁），讓登入前的畫面（登入頁、403/404/500）可運作。此為 dynamic 模式啟動的前置。

**Why this priority**：dynamic 模式下應用每次重載都會先取常數路由；沒有它，前端在 dynamic 模式下連登入頁都建不出來。為 US1 的瀏覽器端到端流程之前置。

**Independent Test**：不帶憑證呼叫常數路由端點 → 取得常數路由清單（含登入頁 + 403/404/500）。即驗。

**Acceptance Scenarios**：

1. **Given** 未登入（無憑證），**When** 取得常數路由，**Then** 回常數路由清單（登入頁 + 403/404/500），且**不需**任何憑證
2. **Given** dynamic 模式，**When** 應用於瀏覽器重載，**Then** 常數路由被取得、登入頁正常顯示

---

### User Story 3 — 路由存在性依角色查驗（Priority: P3）

前端導向某路由前可查詢「該路由是否為當前使用者可存取」，以擋掉使用者導向其無權的路由。

**Why this priority**：支援前端導向防呆；為支援性能力，非主流程必需，但能讓越權導向被一致地擋下。

**Independent Test**：以 `User` 憑證查詢一條僅高權可見的路由（如角色管理）→ 回否；查詢首页 → 回是。以 `Super` 查同一路由 → 回是。即驗。

**Acceptance Scenarios**：

1. **Given** `User` 已登入，**When** 查詢「角色管理」是否存在，**Then** 回否（該使用者不可見）
2. **Given** `Super` 已登入，**When** 查詢「角色管理」是否存在，**Then** 回是
3. **Given** 任一已登入角色，**When** 查詢「首页」是否存在，**Then** 回是

---

### Edge Cases

- **父層無可見子項**：某角色對「系统管理」下所有子項皆不可見時，父層群組整個不回（不可出現空群組）。
- **未登入取使用者選單**：getUserRoutes / isRouteExist 缺憑證視為憑證不可用 → 回 `3333`（讓前端走換發流程）。
- **常數路由與登入解耦**：常數路由端點公開、不依賴登入狀態（應用啟動先於登入）。
- **路由形狀對齊**：供應的路由物件之識別/路徑/元件/中繼資料須與前端既有路由定義一致，否則前端無法渲染選單（端到端瀏覽器驗證攔截）。

## Requirements *(mandatory)*

### Functional Requirements

**依角色供應選單（核心）**

- **FR-001**：系統 MUST 提供「取回當前使用者選單/路由」能力（需有效存取憑證），回一份依該使用者角色過濾的路由清單 + 首页鍵；角色 MUST 由系統權威資料源（使用者-角色關聯）即時導出。
- **FR-002**：選單可見範圍 MUST 依角色為：`Super`＝全部（首页 + 系统管理：用户管理/角色管理/菜单管理/使用者明細）；`Admin`＝首页 + 系统管理（僅用户管理 + 使用者明細）；`User`＝**只有首页**。父層群組若該角色無任何可見子項 MUST 整個略過。
- **FR-003**：取使用者選單時存取憑證無效/過期/缺失 MUST 回 `3333`。

**常數路由（公開）**

- **FR-004**：系統 MUST 提供「取得常數路由」能力且**無需憑證**，回登入前可用的常數路由（登入頁 + 403/404/500）。

**路由存在性查驗**

- **FR-005**：系統 MUST 提供「查驗某路由名是否為當前使用者可見」能力（需有效存取憑證），依該使用者角色過濾——不可見即回否。

**契約 / 形狀**

- **FR-006**：供應的路由物件 MUST 在識別碼、路徑、元件、中繼資料（標題/圖示/排序等）上對齊 base-web 既有路由定義，使前端能據以渲染選單；首页鍵 MUST 為固定首页路由鍵；路由識別碼 MUST 為字串型。
- **FR-007**：本 feature MUST 使 base-web 於 dynamic auth route 模式運作（啟動取常數路由、登入後取使用者選單），且三端點全可用後才切換（避免啟動即壞）。

**契約守恆 / 範圍**

- **FR-008**：本 feature MUST NOT 引入：選單資料表 / 選單 CRUD、授權政策（Casbin）驅動路由、政策失效通知（pub-sub）、demo 選單——皆屬後續階段。
- **FR-009**：本 feature MUST NOT 破壞既有測試、回應信封、資料存取邊界、健康檢查、憑證機制；MUST NOT 使系統啟動改為自行套用結構變更。

### Key Entities

- **路由/選單項（route/menu item）**：一條可導向路由的描述（識別碼、名稱、路徑、元件、中繼資料、子項）；本 feature 以程式內定義（非資料表）。
- **角色↔路由可見性對應（role→route map）**：以角色為主體的「可見路由名集合」；本 feature 以程式內 map 表達（非授權政策儲存）。
- **常數路由集（constant routes）**：登入前可用的固定路由（登入頁 + 錯誤頁）。
- **使用者選單（user route set）**：依當前使用者角色過濾後的路由清單 + 首页鍵。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：以預設帳號登入後，各角色取回的選單符合 D3 範圍（`Super` 完整 / `Admin` 部分 / `User` 只首页），且於**瀏覽器**側邊欄端到端呈現對應差異（可驗）。
- **SC-002**：dynamic 模式下應用啟動可取得常數路由、登入頁於瀏覽器正常顯示（可驗）。
- **SC-003**：路由存在性查驗依角色過濾——低權角色對高權路由回否、對首页回是（可驗的 allow + deny）。
- **SC-004**：套用本 feature 後，既有系統行為（健康檢查、既有測試、回應信封、資料存取邊界、登入/換發）不被破壞（可驗）。

## Assumptions

- **設計決策已凍結**：brainstorm D1-D8（2026-05-30 user 親決），見 [`docs/superpowers/014-dynamic-routes.md`](../../docs/superpowers/014-dynamic-routes.md)；本 feature 忠實落地。
- **base-web wire 為權威**：三端點形狀對齊 base-web `typings/api/route.d.ts` + `service/api/route.ts` + mock（[MOCK §4.13](../../docs/MOCK-COVERAGE-AUDIT.md)）；路由物件精確 shape（元件鍵/中繼資料欄）於 plan 階段 grep base-web 真實路由定義取得。
- **承接 013**：login/getUserInfo/JWT 驗證/bearer 解析/角色查詢（roles_for_user）皆 013 已備；base-web 已指向 rev2（013 `.env.test`），本 feature 加 dynamic 模式開關。
- **角色過濾程式內**：以程式內 `role→[route]` map（沿用 013 buttons 矩陣模式），非授權政策儲存。
- **活體驗收對 dev stack**：對真實服務做活體 smoke（curl）+ 瀏覽器端到端驗證。
- **兩段式提交**：動到後端原始碼工作區（新增路由端點 + 路由定義）+ base-web `.env`（dynamic 模式開關），依工作區慣例走兩段式提交。

### 不在 scope

選單資料表（sys_menu）/ 選單樹建構 / 選單 CRUD 表格化管理；授權政策（Casbin）驅動路由（route 也走 enforce）；政策/路由失效通知通道（redis pub-sub）；demo 選單（function/plugin/alova/document 等）；換發憑證快照 vs 即時查的撤權即時性完整拍板。
