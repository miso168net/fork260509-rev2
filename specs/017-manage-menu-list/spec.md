# Feature Specification: manage-menu-list

**Feature Branch**: `017-manage-menu-list`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "@docs/superpowers/017-manage-menu-list.md — Phase 4 第二刀:base-web manage/menu 頁的 3 條 read endpoint(getMenuList/v2 分頁樹 / getMenuTree 輕量樹 / getAllPages role-aware 頁面 catalog),補建 sys_menu 選單表。menu CRUD、role-menu 授權寫入、demo 頁 seed 成 menu、getUserRoutes 改讀 sys_menu 為明確 out-of-scope。"

**Phase 0 brainstorm source**: [`docs/superpowers/017-manage-menu-list.md`](../../docs/superpowers/017-manage-menu-list.md)

---

## Clarifications

### Session 2026-05-30

- Phase 0 brainstorm 已凍結全部設計決策(D1-D14),見 [`docs/superpowers/017-manage-menu-list.md`](../../docs/superpowers/017-manage-menu-list.md)。本 feature 忠實落地、非自由設計。
- **D1 切法**:前序 016 已做 role+user(3 endpoint);本 feature 做 **menu 三件**(getMenuList/v2、getMenuTree、getAllPages),建 sys_menu 表把選單定義從既有寫死的 in-code 路由樹搬進資料表。**唯讀**;menu CRUD / role-menu 授權寫入留後續。
- **D2/D3 schema**:sys_menu 照前端 `Menu` 型別**全欄落地**(含進階 route meta);儲存細節為 plan 階段對象。
- **D5 清單分頁**:getMenuList/v2 回分頁巢狀樹(頂層分頁、children 隨 root);**無搜尋參數**(前端不送)。
- **D7/D8 getAllPages role-aware**:超管見真頁 + 範例(demo)頁、一般 admin 只見真頁;範例頁**只進 getAllPages catalog、不 seed 成 menu**(故 getMenuList 永遠只真選單)。
- **D9 授權**:3 條 endpoint 都受授權保護(超管/admin allow、一般角色 deny);沿既有授權中介層。
- **D10 對齊**:選單可見性續住既有授權引擎,靠路由名稱對齊;本 feature 不重造可見性關聯表。
- **既有不動**:側欄動態路由(getUserRoutes,014)維持讀程式內定義、不改讀新表(單一真相源統一留後續)。
- `/speckit-clarify` 正式掃描(2026-05-30,11 taxonomy 類):**結果 0 提問**。brainstorm D1-D14 已凍結全部高影響決策(切法 D1、schema D2/D3、識別碼/對齊鍵 D4、清單分頁 D5、選單樹 D6、getAllPages role-aware D7/D8、授權 D9、casbin 對齊 D10、scope D11)。Functional/Domain/Interaction/Integration/Edge/Constraints/Terminology/Completion/Security 全 Clear;唯 Non-Functional(perf/scale)為 Partial 但**低影響**(admin panel 低流量、menu 本質有界小〔導覽設定、非交易資料〕、單頁筆數上限已設〔FR-008〕、無需 latency 數字),deferred to plan。技術手段(儲存型別、tree builder、JSONB、migration、分頁實作策略)為 plan 階段對象、非 spec-level 歧義。可直接進 `/speckit-plan`。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 瀏覽選單清單(分頁樹)(Priority: P1)🎯 MVP

系統管理者需要在「選單管理」頁看到所有選單(選單名稱、類型〔目錄/選單〕、路由名稱、路由路徑、對應頁面元件、圖示、排序、是否快取/隱藏、狀態、建立時間等),以**樹狀**(父選單含子選單)+ 分頁呈現,以管理系統導覽選單。

**Why this priority**:選單清單是「選單管理」頁的核心內容 — 頁面要渲染就靠它;且選單資料是後台導覽的權威定義來源,US2(選單樹)與 US3(可用頁面)都圍繞它。立「選單定義資料表 + 分頁樹清單 + 授權」這套 pattern。

**Independent Test**:以具管理權的帳號取選單清單 → 查驗回分頁結果、每筆含完整管理顯示欄位、父選單含巢狀子選單、只含未刪除選單、識別碼為數值型。

**Acceptance Scenarios**:

1. **Given** 系統有選單(含父子層級),**When** 管理者以預設分頁取選單清單,**Then** 回第一頁的頂層選單(父選單含其巢狀子選單)+ 總筆數,每筆含名稱/類型/路由名/路徑/元件/圖示/排序/狀態/建立時間等顯示欄位
2. **Given** 選單清單,**When** 取得任一父選單(如「系統管理」),**Then** 其子選單(使用者管理/角色管理/選單管理/使用者詳情)以巢狀 children 隨父選單一併回傳
3. **Given** 一般(無管理權)使用者,**When** 嘗試取選單清單,**Then** 被拒絕(權限不足回應)、不回資料
4. **Given** 有選單已被刪除,**When** 取選單清單,**Then** 已刪除選單不出現於結果

---

### User Story 2 — 取得選單樹供授權選用(Priority: P2)

管理者在設定「角色的選單可見範圍」時,需要一份**輕量選單樹**(識別碼 + 顯示標籤 + 父識別碼 + 子節點)填入樹狀選擇器,不需完整欄位、不分頁。

**Why this priority**:輔助未來「角色-選單授權」設定;為輕量唯讀樹、獨立可驗。建立在 US1 的選單定義之上(同一份選單、不同呈現)。

**Independent Test**:以具管理權的帳號取選單樹 → 查驗回所有未刪除選單組成的完整巢狀樹,每節點僅含識別碼/標籤/父識別碼/子節點。

**Acceptance Scenarios**:

1. **Given** 系統有選單,**When** 管理者取選單樹,**Then** 回所有未刪除選單的完整巢狀樹(每節點:識別碼/標籤/父識別碼/子節點)、不分頁
2. **Given** 一般(無管理權)使用者,**When** 嘗試取選單樹,**Then** 被拒絕(權限不足回應)

---

### User Story 3 — 取得可用頁面清單供掛載選單(Priority: P3)

管理者在建立/編輯選單、要指定「這個選單指向哪個前端頁面」時,需要一份**可用頁面清單**(頁面識別名)填入下拉。**超級管理者**額外能看到範例(demo)頁面、**一般管理者只看到正式頁面**。

**Why this priority**:輔助未來選單建立流程的「頁面」欄;為輕量唯讀清單。是本 feature **唯一依角色回不同內容**的端點。

**Independent Test**:以超管取可用頁面 → 含正式頁 + 範例頁;以一般 admin 取 → 只含正式頁;一般使用者 → 被拒絕。

**Acceptance Scenarios**:

1. **Given** 系統有可掛載的前端頁面,**When** **超級管理者**取可用頁面清單,**Then** 回正式頁面 + 範例(demo)頁面
2. **Given** 同上,**When** **一般管理者**取可用頁面清單,**Then** **只回正式頁面**(不含範例頁)
3. **Given** 一般(無管理權)使用者,**When** 嘗試取可用頁面,**Then** 被拒絕(權限不足回應)

---

### Edge Cases

- **無權存取**:不具管理權的角色存取這 3 條 → 一律拒絕(權限不足回應)、不洩漏資料。
- **無效/缺憑證**:無憑證或憑證失效 → 視為未認證(要求重新登入)、不回資料。
- **單頁筆數過大**:選單清單請求單頁筆數超過上限 → 夾到上限值。
- **空/缺值顯示欄**:選填欄位(圖示/排序/快取/隱藏/啟用選單/外链/query 等)無值 → 回空值,不阻斷清單。
- **頂層 vs 子選單**:頂層選單(無父)與子選單(有父)皆正確歸位;父選單於清單以巢狀 children 呈現。
- **操作者欄**:建立者/修改者於本 feature 暫為空(操作者歸屬折後續 Phase)。
- **按鈕定義**:選單的按鈕定義欄於本 feature 暫為空(按鈕權限折後續 feature)。

## Requirements *(mandatory)*

### Functional Requirements

**選單清單(US1)**

- **FR-001**:系統 MUST 提供選單清單查詢,支援分頁,以**樹狀**回傳(頂層選單分頁、每筆含其巢狀子選單);每筆回選單的完整管理顯示欄位 —— 選單名稱、選單類型(目錄/選單)、路由名稱、路由路徑、對應頁面元件、圖示與圖示類型、國際化鍵、排序、是否快取、是否常駐、是否隱藏於選單、啟用選單、外链與固定 query 等進階路由屬性、按鈕定義、狀態、建立/更新時間。
- **FR-002**:選單清單 MUST 以父選單巢狀子選單的方式呈現層級(子選單隨其父選單一併回傳,不因分頁而與父選單分離)。

**選單樹(US2)**

- **FR-003**:系統 MUST 提供輕量選單樹查詢(不分頁),每節點僅含識別碼、顯示標籤、父識別碼、子節點,組成所有未刪除選單的完整巢狀樹。

**可用頁面(US3)**

- **FR-004**:系統 MUST 提供「可用頁面」清單查詢(頁面識別名),且**依呼叫者角色回不同內容** —— 超級管理者回正式頁面 + 範例(demo)頁面;一般管理者只回正式頁面。

**授權(US1/US2/US3 共用)**

- **FR-005**:這 3 條查詢 MUST 受角色授權保護 —— 具管理權的角色(超管/admin)可存取;不具權的角色 MUST 被拒絕(權限不足回應);無/失效憑證 MUST 視為未認證。

**選單定義儲存**

- **FR-006**:系統 MUST 建立選單定義的持久儲存,並以既有導覽路由定義(現行可導航的正式選單)為基準 seed;既有 seed 資料須有合理預設(狀態預設為「啟用」)。範例(demo)頁面 MUST NOT 被 seed 為實際選單(僅出現在 FR-004 的可用頁面清單)。

**查詢契約 / 範圍**

- **FR-007**:選單清單與選單樹查詢 MUST 只回未刪除(active)的選單。
- **FR-008**:選單清單分頁 MUST 回「資料列 + 當前頁碼 + 單頁筆數 + 總筆數」契約(對齊前端既有分頁型);未指定時用合理預設;單頁筆數 MUST 設上限保護。選單清單**不提供搜尋條件**(前端不送)。
- **FR-009**:回應 MUST 沿用既有統一回應信封;識別碼 MUST 以數值型呈現(對齊前端型別宣告);選單類型/圖示類型/狀態等 MUST 以前端列舉值(字串)呈現。選單可見性 MUST 續用既有授權引擎(以路由名稱對齊),本 feature MUST NOT 另建選單可見性關聯表。

**契約守恆 / 範圍**

- **FR-010**:本 feature MUST NOT 破壞既有行為(既有測試、回應信封、登入/認證、資料存取邊界、**既有側欄動態路由〔getUserRoutes〕仍讀程式內定義且行為不變**、健康檢查、系統啟動不自行套用結構變更)。
- **FR-011**:本 feature MUST NOT 引入:選單寫入操作(新增/修改/刪除選單)、角色-選單授權寫入、範例頁面作為實際選單、操作者歸屬(誰建立/修改)、按鈕權限授予/強制、側欄動態路由改讀新選單表(單一真相源統一)。

### Key Entities

- **選單(menu)**:一個後台導覽選單的管理視圖 —— 識別碼(數值)、路由名稱(唯一、為可見性對齊鍵)、父識別碼、類型(目錄/選單)、選單名稱、路由路徑、頁面元件、圖示與圖示類型、國際化鍵、排序、是否快取/常駐/隱藏、啟用選單、外链與固定 query 等進階路由屬性、按鈕定義(目錄)、狀態、建立/更新時間。可有子選單(巢狀)。
- **選單樹節點(menu tree node)**:選單的輕量視圖 —— 識別碼、顯示標籤、父識別碼、子節點。
- **可用頁面(available page)**:一個可被選單掛載的前端頁面識別名(正式頁面;範例頁面僅超管可見)。
- **分頁結果(paginated result)**:資料列 + 當前頁碼 + 單頁筆數 + 總筆數。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:管理者能取得分頁的選單清單,每筆含完整管理顯示欄位,且父選單含巢狀子選單(可驗:取清單查驗欄位齊全 + 層級正確)。
- **SC-002**:管理者能取得完整的輕量選單樹(識別碼/標籤/父識別碼/子節點),供角色-選單授權選用(可驗)。
- **SC-003**:超級管理者取可用頁面清單含正式 + 範例頁;一般管理者只含正式頁(可驗:兩角色各取一次比對差異)。
- **SC-004**:不具管理權的角色存取這 3 條被拒絕(權限不足回應);無/失效憑證視為未認證(可驗:一般角色 + 缺憑證各驗)。
- **SC-005**:選單清單與選單樹只含未刪除選單;清單分頁契約正確(資料列/頁碼/筆數/總數),單頁筆數超過上限時被夾到上限(可驗)。
- **SC-006**:識別碼以數值型呈現,選單類型/圖示類型/狀態以前端列舉值呈現,與前端型別宣告一致(可驗:對照前端 typing)。
- **SC-007**:套用本 feature 後,既有系統行為(既有測試、回應信封、登入/認證、資料存取邊界、**既有側欄動態路由不變**、健康檢查)不被破壞(可驗)。

## Assumptions

- **設計決策已凍結**:brainstorm D1-D14(2026-05-30 user 親決),見 [`docs/superpowers/017-manage-menu-list.md`](../../docs/superpowers/017-manage-menu-list.md);本 feature 忠實落地。
- **承接既有**:統一回應信封、軟刪除(只回 active)、授權中介層(具管理權角色 allow、無權 deny)、結構變更經既有自動套用機制、選單可見性走既有授權引擎(以路由名稱對齊)—— 皆承自前序 feature(008/009/010/013/014);本 feature 重用、不重造。
- **前端型別宣告為對外契約權威**:選單欄位、分頁契約、識別碼型(數值)、類型/圖示類型/狀態列舉值皆以 base-web 既有型別宣告為準。
- **選單定義 seed 來源**:以既有導覽路由定義(014 程式內定義的正式選單:首頁 + 系統管理父含 4 子)為 seed 基準,路由名稱與既有授權引擎的選單可見性政策對齊。
- **側欄動態路由不動**:既有 getUserRoutes(014)仍讀程式內路由定義、行為不變;「改讀新選單表以統一真相源」為後續 feature。
- **範例頁面 catalog-only**:範例(demo)頁面僅出現在可用頁面清單(且僅超管可見),不作為實際選單存在(故選單清單/樹永遠只含正式選單)。
- **操作者與按鈕欄折後續**:建立者/修改者、按鈕權限授予折後續 Phase;本 feature 對應欄位回空。

### 不在 scope

選單寫入(新增/修改/刪除選單、批次);角色-選單授權寫入(授權 modal 的儲存);範例頁面 seed 成實際選單;側欄動態路由(getUserRoutes)改讀選單表(單一真相源統一);按鈕權限授予/強制;操作者歸屬(後續 Phase A);選單可見性關聯表 / 按鈕關聯表(可見性續住授權引擎、按鈕定義併入選單)。

## Dependencies

- **008 統一回應信封**:清單/樹回應沿用既有信封型。
- **009 軟刪除基礎設施**:選單清單/樹只回 active(未刪除)資料。
- **010 結構變更自動套用**:選單表與授權種子經既有自動套用機制生效。
- **013 認證 + 授權中介層**:3 條 endpoint 掛授權保護(具管理權角色 allow、無權 deny);承既有 RBAC 種子角色。
- **014 動態路由 + 選單可見性政策**:選單定義 seed 以 014 程式內路由定義為基準;路由名稱與 014 既有的選單可見性授權政策對齊;getUserRoutes 不動。
- **016 manage-role-user-list**:沿用其分頁回應契約與 Output DTO + facade 查詢 pattern。
- **base-web 既有 service 層**:這 3 條 endpoint base-web 既已宣告呼叫,本 feature 對齊其型別、不動 base-web。
