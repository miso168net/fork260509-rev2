# Feature Specification: audit-middleware

**Feature Branch**: `015-audit-middleware`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "@docs/superpowers/015-audit-middleware.md — request-context middleware + access-log 兩表（sys_access_log 已認證請求 / sys_login_attempt 登入嘗試）。Phase 3 audit-middleware 前半；A（資料變動補 operator）與 lockout 為明確 out-of-scope。"

**Phase 0 brainstorm source**: [`docs/superpowers/015-audit-middleware.md`](../../docs/superpowers/015-audit-middleware.md)

---

## Clarifications

### Session 2026-05-30

- Phase 0 brainstorm 已凍結全部設計決策（D1-D10），見 [`docs/superpowers/015-audit-middleware.md`](../../docs/superpowers/015-audit-middleware.md)。本 feature 忠實落地、非自由設計。
- **拆分決策**：roadmap 的 `audit-middleware(請求層 operator_ip/xdb)` 拆兩個 feature。**015 = 請求層 access-log + request-context 擷取**（現可端到端 demo）；**資料變動 audit 補 operator 屬性（A）留 Phase 4**（待真實資料變動 endpoint）；**登入失敗 lockout 留之後獨立 feature**，015 只提供登入嘗試資料給它用。
- **D1/D2 範圍 + 雙表**：建立 request-context 擷取（誰/哪個來源/關聯碼）+ 兩個獨立記錄表：一般已認證請求的 access log、登入嘗試專用記錄（為未來 lockout 建索引存取）。
- **D3 記錄範圍**：只記**已認證**請求（具備有效憑證、操作者身分已知）+ **登入嘗試**（成功與失敗皆記）。公開端點（常數路由）與健康檢查**不**記；非登入端點的失敗認證（過期憑證）**不**記。
- **D4 登入記錄歸屬**：登入嘗試由登入處理本身記錄（它知道嘗試的帳號名與成敗）——因為請求層攔截只看得到傳輸層成功（HTTP 200），看不到業務層的「帳密錯誤」結果。
- **D5 來源擷取 = 直連 IP + 原始轉發鏈並存**：同時保存（a）直連對端 IP、（b）原始 `X-Forwarded-For` 轉發鏈逐字字串。015 **不**做「哪一跳才是真實客戶端」的信任代理解析（留未來 feature），只忠實保存兩個事實。
- **D6 best-effort**：審計記錄為觀察性、非業務交易；寫入失敗**不得**讓底層業務請求失敗（與既有「資料變動審計與變動原子綁定」相反）。
- **D7 來源地 = 原始字串**：以 IP→地理來源解析庫產出的原始字串保存，不解析成結構欄。
- **D9 關聯碼**：每請求帶一關聯碼（生成，或沿用入站的請求識別 header），記於其審計記錄。
- **D10 驗收**：純後端、無新前端行為 → 不需瀏覽器端到端；以對 dev stack 的活體 smoke（curl + 資料查驗）+ 純單元測試驗收。
- `/speckit-clarify` 預判：brainstorm D1-D10 已凍結全部高影響決策；記錄範圍（D3）、登入歸屬（D4）、來源雙欄（D5）、best-effort（D6）皆已親決。技術手段（來源 IP 寫入型別、地理解析庫執行期路徑、關聯碼生成、攔截疊加順序）為 plan 階段 research grep 對象、非 spec-level 歧義。預期 0 提問。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 記錄登入嘗試（成功與失敗）（Priority: P1）🎯 MVP

安全稽核者需要一份「登入嘗試」記錄：每次有人嘗試登入（不論成功或失敗），系統記下嘗試的帳號名、成敗、發生時間、來源（IP/轉發鏈/地理來源）。失敗的登入尤其重要——它是「同一帳號或來源在短時間內反覆失敗」的偵測基礎（供未來「失敗過多即暫鎖」能力使用）。

**Why this priority**：失敗登入記錄是帳號安全的最小防線資料，也是未來 lockout 能力的唯一資料來源；且登入端點現已存在、可立即端到端驗證。

**Independent Test**：對登入端點分別送出正確與錯誤的帳密 → 查驗系統各產生一筆登入嘗試記錄：成功筆標記成功且歸屬該使用者、失敗筆標記失敗且帶嘗試的帳號名；兩筆皆含來源 IP 與地理來源。

**Acceptance Scenarios**：

1. **Given** 以正確帳密登入，**When** 登入成功，**Then** 產生一筆登入嘗試記錄（成功、歸屬該使用者、含來源 IP/地理來源/關聯碼）
2. **Given** 以錯誤密碼登入，**When** 登入失敗，**Then** 產生一筆登入嘗試記錄（失敗、帶嘗試的帳號名、無使用者歸屬、含來源 IP）
3. **Given** 多次失敗登入，**When** 稽核者依帳號名或來源 IP 查近 N 分鐘內記錄，**Then** 能有效率地取得失敗次數（效能足以支撐即時鎖定判定）

---

### User Story 2 — 記錄已認證請求 access log（Priority: P2）

稽核者需要一份「誰在何時、從何處、對哪個 API 做了什麼、結果如何」的請求記錄，以追溯操作。系統對每個**已認證**請求記一筆 access log，歸屬到操作者身分。

**Why this priority**：一般操作追溯的核心稽核軌跡；建立在登入記錄之後、為操作問責提供完整覆蓋。

**Independent Test**：以有效憑證呼叫一個已認證端點 → 查驗產生一筆 access log（含操作者身分、請求方法/路徑、結果狀態、來源、時間）；以公開端點呼叫 → 查驗**不**產生 access log。

**Acceptance Scenarios**：

1. **Given** 以有效憑證呼叫已認證端點，**When** 請求完成，**Then** 產生一筆 access log（操作者身分 + 方法/路徑/結果狀態 + 來源 + 關聯碼）
2. **Given** 呼叫公開端點（常數路由），**When** 請求完成，**Then** **不**產生 access log
3. **Given** 呼叫健康檢查，**When** 請求完成，**Then** **不**產生 access log
4. **Given** 審計記錄寫入失敗，**When** 業務請求本身成功，**Then** 業務回應**不**受影響（best-effort、僅記警告）

---

### User Story 3 — 忠實擷取請求來源（直連 IP + 原始轉發鏈 + 地理來源）（Priority: P3）

稽核者需要可信的「來源」資料：系統忠實保存直連對端 IP 與原始轉發鏈（`X-Forwarded-For` 逐字），並附地理來源。如此即使日後要從轉發鏈推算「真實客戶端 IP」，原始事實仍完整可用。

**Why this priority**：來源擷取的忠實度是 US1/US2 記錄的共用基礎，也讓未來「信任代理前一跳」推算成為可能；獨立可驗。

**Independent Test**：送出帶 `X-Forwarded-For` 的請求 → 查驗記錄同時含直連對端 IP 與原始轉發鏈字串，且地理來源非空；送出不帶該 header 的請求 → 轉發鏈欄為空、直連 IP 仍有值。

**Acceptance Scenarios**：

1. **Given** 請求帶 `X-Forwarded-For` 鏈，**When** 記錄產生，**Then** 同時保存直連對端 IP 與原始轉發鏈逐字字串
2. **Given** 請求不帶 `X-Forwarded-For`，**When** 記錄產生，**Then** 直連對端 IP 有值、轉發鏈欄為空
3. **Given** 來源 IP 可解析地理來源，**When** 記錄產生，**Then** 地理來源欄為非空原始字串

---

### Edge Cases

- **公開/未認證請求**：除登入嘗試外，公開或認證失敗（過期憑證）的請求不產生 access log（避免雜訊、對齊 D3）。
- **審計寫入失敗**：審計記錄寫入失敗時，業務請求不受影響（best-effort，僅記警告）；不得回滾或失敗業務回應。
- **無轉發 header**：dev 直連無 `X-Forwarded-For` → 轉發鏈欄為空、直連 IP 仍記。
- **來源無法解析地理來源**：地理來源欄可為空/未知，不阻斷記錄寫入。
- **登入成敗對傳輸層不可見**：登入無論成敗皆回 HTTP 200（業務碼分流），故登入嘗試的成敗判定由登入處理本身負責，而非請求層攔截。

## Requirements *(mandatory)*

### Functional Requirements

**登入嘗試記錄（核心）**

- **FR-001**：系統 MUST 對每次登入嘗試（成功與**失敗**皆然）記錄一筆登入嘗試記錄，含：嘗試的帳號名、成敗、來源（IP/轉發鏈/地理來源）、關聯碼、時間；成功時歸屬該使用者身分、失敗時無使用者歸屬。
- **FR-002**：登入嘗試記錄 MUST 可依「嘗試的帳號名」與「來源 IP」於時間窗內有效率查詢，且查詢效能須足以支撐未來「失敗過多即暫鎖」的即時判定（具體加速手段〔索引等〕屬實作層、非本 spec 約束）。

**已認證請求 access log**

- **FR-003**：系統 MUST 對每個**已認證**請求記錄一筆 access log，含：操作者身分、請求方法、請求路徑、結果狀態、來源、關聯碼、時間。
- **FR-004**：access log MUST 只記已認證請求（操作者身分可從有效憑證導出）；公開端點與健康檢查 MUST NOT 記 access log；登入嘗試走 FR-001（不重複記 access log）。

**請求來源擷取**

- **FR-005**：系統 MUST 同時擷取並保存（a）直連對端 IP 與（b）原始 `X-Forwarded-For` 轉發鏈逐字字串（無此 header 時轉發鏈為空）；MUST 附 IP→地理來源的原始字串。系統 MUST NOT 在本 feature 推算「真實客戶端 IP」的信任代理解析（留後續）。
- **FR-006**：系統 MUST 對每請求賦予一關聯碼（系統生成，或沿用入站請求所挾帶的關聯識別），並記於其審計記錄。

**寫入語意 / 契約**

- **FR-007**：審計記錄寫入 MUST 為 best-effort——寫入失敗 MUST NOT 失敗或回滾底層業務請求（觀察性、非業務交易；僅記警告）。
- **FR-008**：access log 與登入嘗試記錄 MUST 為 append-only（正常運作下無更新/刪除）。

**契約守恆 / 範圍**

- **FR-009**：本 feature MUST NOT 破壞既有行為（回應信封、既有測試、健康檢查、登入/認證、資料存取邊界）；MUST NOT 使系統啟動改為自行套用結構變更。
- **FR-010**：本 feature MUST NOT 引入：資料變動審計的操作者歸屬（A，後續）、登入失敗暫鎖能力（後續）、轉發鏈「真實客戶端 IP」信任解析（後續）、非同步/批次寫入（後續）、審計記錄治理（軟刪/CRUD/保留期清理）。

### Key Entities

- **access log 記錄（access-log entry）**：一筆已認證請求的稽核軌跡——操作者身分、請求方法/路徑、結果狀態、來源（直連 IP/轉發鏈/地理來源）、關聯碼、時間。append-only。
- **登入嘗試記錄（login-attempt record）**：一次登入嘗試——嘗試的帳號名、成敗、使用者歸屬（成功時）、來源、關聯碼、時間。支援依「帳號名/來源 IP × 時間窗」的有效率查詢。append-only。
- **請求脈絡（request context）**：每請求擷取的「誰（操作者身分，已認證時）/ 從何處（直連 IP + 原始轉發鏈 + 地理來源）/ 關聯碼」，供上述記錄與未來資料變動審計共用。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：每個已認證業務請求恰產生一筆 access log、歸屬到操作者身分（可驗：呼叫已認證端點後查記錄）。
- **SC-002**：每次登入嘗試（成功與失敗）恰產生一筆登入嘗試記錄，含嘗試帳號名 + 成敗 + 來源（可驗：正確/錯誤帳密各驗一筆）。
- **SC-003**：記錄之來源同時含直連對端 IP 與（帶 header 時）原始轉發鏈逐字字串，且地理來源為非空原始字串（可驗：帶/不帶 `X-Forwarded-For` 各驗）。
- **SC-004**：審計記錄寫入失敗時，業務請求不受影響（可驗）。
- **SC-005**：公開請求（常數路由）與健康檢查不產生 access log（可驗）。
- **SC-006**：套用本 feature 後，既有系統行為（健康檢查、既有測試、回應信封、登入/認證、資料存取邊界）不被破壞（可驗）。

## Assumptions

- **設計決策已凍結**：brainstorm D1-D10（2026-05-30 user 親決），見 [`docs/superpowers/015-audit-middleware.md`](../../docs/superpowers/015-audit-middleware.md)；本 feature 忠實落地。
- **承接 011/012/013**：審計哲學（facade 為唯一資料寫入管道、append-only 表）承自 011；IP→地理來源解析承自 012 既有工具庫（本 feature 為其首個消費者）；操作者身分導出承自 013 既有憑證驗證/解析。
- **首個地理來源消費者**：地理來源解析庫於既有工作中僅被拷入、未被消費；本 feature 須一併解決其執行期資料檔路徑與生產映像打包。
- **既有來源 IP 寫入債**：既有審計基礎設施留有「來源 IP 真值寫入」的型別處理債，本 feature 一併解決（使真實 IP 值可寫入）。
- **活體驗收對 dev stack**：對真實服務做活體 smoke（curl + 資料查驗）；純後端、無瀏覽器端到端。
- **單一 worktree 兩段式提交**：只動後端原始碼工作區（含其部署映像設定），依工作區慣例走兩段式提交（worktree 提交 + 外層記錄變動）。

### 不在 scope

資料變動審計的操作者歸屬（A，後續 Phase）；登入失敗暫鎖能力（後續獨立 feature，本 feature 只供登入嘗試資料）；轉發鏈「真實客戶端 IP」信任代理解析（後續）；非同步/批次審計寫入（後續優化）；審計記錄治理（軟刪可復原 / CRUD / 保留期清理）；地理來源解析成結構化欄位（province/city）。
