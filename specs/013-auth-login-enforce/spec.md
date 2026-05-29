# Feature Specification: auth-login-enforce

**Feature Branch**: `013-auth-login-enforce`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "@docs/superpowers/013-auth-login-enforce.md"（登入 + getUserInfo + JWT + 第一個 Casbin enforce 點〔Phase 3 起手〕：把 base-web 登入流程對 rev2 後端端到端接通，並首次啟用以角色為基礎的授權攔截〔最小機制證明〕）

**Phase 0 brainstorm source**: [`docs/superpowers/013-auth-login-enforce.md`](../../docs/superpowers/013-auth-login-enforce.md)

---

## Clarifications

### Session 2026-05-29

- Phase 0 brainstorm 已凍結全部設計決策（D1-D11），見 [`docs/superpowers/013-auth-login-enforce.md`](../../docs/superpowers/013-auth-login-enforce.md)。本 feature 忠實落地、非自由設計。
- **D1 範圍**：login + getUserInfo + 憑證簽發/驗證 + **第一個 Casbin enforce 點**（含 enforce、非純認證）。
- **D2 enforce 深度＝最小機制證明**：建好授權攔截機制 + 授權判斷引擎 + seed 剛好夠的政策 + 挑**一條**代表性受保護資源示範「不同角色不同准駁」、含一個 deny 案例；完整政策矩陣 / 全資源 rollout 留後續階段。
- **D3 不做 login audit**：登入/請求層 audit（來源 IP 真值、來源地解析）留後續「audit middleware」feature（牽動 CHECKLIST §2.14 / §2.15、不在本 feature）。
- **D4 換發憑證＝最小無狀態版**：登入核發存取+換發兩憑證；換發端驗章+到期 → 簽新存取憑證、**不持久化**；完整 rotation + 憑證表留後續階段。
- **D5 RBAC schema＝最小關聯 + buttons 寫死矩陣**：角色表（沿用既有 soft-delete 機制）+ 使用者-角色指派表 + seed 三帳號；按鈕碼集合依角色於程式內矩陣決定（對齊 mock）；顯示別名（User→User01）以使用者顯示名欄表達。
- **D6 授權政策表維持原生語意**：本 feature 用既有 stock 政策儲存 seed/讀政策；政策軟刪除（可復原）= 後續「受管 RBAC policy 層」feature（不在本 feature）。
- **D7 error code 對齊 base-web mock 實機值**（[MOCK §4.11](../../docs/MOCK-COVERAGE-AUDIT.md)）：成功 `0000`；登入失敗統一 `1000`；存取憑證過期/無效/缺失 `3333`；換發失敗 `8888`（**絕不回 3333/9999/9998**）；授權拒絕為 rev2 自訂業務碼（toast、不登出）。
- **D8-D11**：回應信封錯誤建構子泛型化（沿用 008 envelope）；示範受保護資源用前向相容的真實資源名；acceptance 含瀏覽器端到端登入驗證；授權攔截為 rev2 自家實作（非沿用參考來源中介層）。
- 不變更既有約束：系統啟動不自行套 schema（守 007）、資料存取邊界（守 009）、回應信封（守 008）、健康檢查不破。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 登入取得憑證並取回自己的使用者資料（Priority: P1）🎯 MVP

使用者以帳號密碼登入，成功後取得一組身分憑證；之後可憑此憑證取回自己的使用者資料（識別碼、顯示名、角色、按鈕權限）。這條流程在**真實瀏覽器**中對前端（base-web）端到端跑通。

**Why this priority**：這是 Phase 3 認證/授權的地基,也是 base-web 啟動後第一條真實 wire（登入→getUserInfo）。沒有「已驗證身分」,後續授權攔截、動態選單都無從建立。

**Independent Test**：用預設帳號（如 `Super`/`123456`）登入 → 取得憑證 → 以憑證取回使用者資料 → 看到正確的識別碼/顯示名/角色/按鈕,且具別名的帳號回別名（`User`→`User01`）。瀏覽器內登入按鈕亦能完成同流程並渲染。即驗。

**Acceptance Scenarios**：

1. **Given** 預設帳號已備,**When** 以正確帳密登入,**Then** 回成功碼 `0000` + 一組存取憑證與換發憑證
2. **Given** 已登入取得存取憑證,**When** 以該憑證取回使用者資料,**Then** 回 `{userId, userName, roles, buttons}`,且 `User` 帳號的 `userName` 為別名 `User01`、`roles`/`buttons` 對齊該角色
3. **Given** 帳密錯誤 / 帳號不存在 / 缺欄,**When** 登入,**Then** 統一回 `1000`（不細分原因）
4. **Given** 取使用者資料時憑證無效/過期/缺失,**When** 請求,**Then** 回 `3333`（觸發前端換發流程）
5. **Given** base-web 登入頁,**When** 於瀏覽器填預設帳密送出,**Then** 登入成功 + 使用者資料正確渲染（信封解封/碼分流/憑證儲存皆對齊）

---

### User Story 2 — 受保護資源依角色授權放行或拒絕（Priority: P2）

系統對受保護資源做「以角色為基礎」的授權判斷：具足夠角色者放行、不足者被明確拒絕。此為本系統**首次啟用授權攔截**的證明。

**Why this priority**：「以角色控制存取」是本系統核心價值（鐵紀律②）。需先證明攔截機制真的能放行**且能擋**,後續才能把政策矩陣與受保護資源逐步 rollout。

**Independent Test**：對同一條受保護資源,用具足夠角色的憑證請求 → 放行（200）；用角色不足的憑證請求 → 拒絕（403 + 權限不足業務碼）。即驗。

**Acceptance Scenarios**：

1. **Given** 已 seed 一條資源的授權政策（某些角色允許）,**When** 具被允許角色的使用者請求該資源,**Then** 放行
2. **Given** 同上,**When** 角色不在允許清單的使用者請求,**Then** 回 403 + 權限不足業務碼（不登出、不換發）

---

### User Story 3 — 存取憑證過期時換發新憑證（Priority: P3）

持有換發憑證者,可在存取憑證過期時換得新存取憑證,維持登入狀態,而不必重新輸入帳密。

**Why this priority**：支援前端在憑證過期時的自動續期,避免使用者頻繁重登;為支援性能力。

**Independent Test**：以有效換發憑證換取新存取憑證 → 成功；以無效/過期換發憑證 → 回立即登出碼 `8888`、且**不**回換發碼（不致前端無限換發）。即驗。

**Acceptance Scenarios**：

1. **Given** 持有有效換發憑證,**When** 請求換發,**Then** 回新存取憑證（+可選新換發憑證）、成功碼
2. **Given** 換發憑證無效/過期,**When** 請求換發,**Then** 回 `8888`（立即登出）,**且絕不**回 `3333/9999/9998`

---

### Edge Cases

- **憑證缺失 vs 過期 vs 竄改**：取使用者資料 / 受保護資源時,三者一律視為憑證不可用 → 回 `3333`（讓前端走換發流程）。
- **換發端的死迴圈防護**：換發失敗若誤回換發碼（`3333/9999/9998`）會使前端無限換發 → 換發失敗一律回 `8888`/登出類碼。
- **顯示別名**：`User` 登入但使用者資料顯示 `User01` — 別名僅影響顯示名,不影響登入識別與授權。
- **授權拒絕的前端表現**：授權拒絕為業務錯誤（toast 提示）,非登入失效,故不走登出/換發流程。

## Requirements *(mandatory)*

### Functional Requirements

**認證（登入 + 取使用者資料）**

- **FR-001**：系統 MUST 提供帳密登入；驗證成功 MUST 核發一組「存取憑證 + 換發憑證」並回成功碼 `0000`。
- **FR-002**：登入失敗（帳密錯誤 / 帳號不存在 / 缺欄 / 空 body）MUST 統一回 `1000`,不細分原因（對齊 mock）。
- **FR-003**：系統 MUST 提供「取回當前使用者資料」能力（需有效存取憑證）,回 `{userId, userName, roles, buttons}`；具顯示別名的帳號 MUST 回其別名（`User`→`User01`）。
- **FR-004**：取使用者資料時存取憑證無效/過期/缺失 MUST 回 `3333`。

**授權攔截（第一個 enforce 點）**

- **FR-005**：系統 MUST 對至少一條受保護資源依請求者角色做授權判斷；放行條件不滿足 MUST 回 403 + 權限不足業務碼。
- **FR-006**：授權政策 MUST 由系統既有自動 schema 機制 seed（採政策儲存原生語意）；MUST 至少證明一個角色被允許、一個角色被拒絕（同一資源）。

**換發憑證（最小）**

- **FR-007**：系統 MUST 提供以換發憑證換取新存取憑證的能力；換發失敗 MUST 回 `8888`（立即登出）,且 MUST NOT 回 `3333/9999/9998`。

**RBAC 資料**

- **FR-008**：系統 MUST 以「角色」與「使用者-角色指派」表達使用者的角色集合；getUserInfo 的 `roles` MUST 由此導出；預設三帳號 MUST 分別具 `R_SUPER` / `R_ADMIN` / `R_USER_COMMON`。
- **FR-009**：getUserInfo 的 `buttons` MUST 依角色回對應按鈕碼集合,對齊 mock 矩陣（最高角色為全集、其餘為遞減子集）。

**契約守恆 / 範圍**

- **FR-010**：本 feature MUST NOT 破壞既有測試、資料存取邊界、健康檢查；新增資料表 MUST 經既有自動 schema 機制建立,且 MUST NOT 使系統啟動改為自行套 schema。
- **FR-011**：本 feature MUST NOT 引入：完整政策矩陣 / 全資源授權 rollout、登入事件 audit、政策軟刪除、憑證持久化 rotation、動態選單路由、政策失效通知 —— 皆屬後續階段。

### Key Entities

- **使用者（user）**：登入主體。屬性：識別碼、登入帳號、密碼雜湊、**顯示名（別名,如 User01）**。沿用既有使用者實體、新增顯示名。
- **角色（role）**：權限歸屬單位。屬性：角色碼（`R_SUPER` 等）、名稱；採既有 soft-delete 語意。
- **使用者-角色指派（user-role）**：使用者與角色的多對多關聯。
- **授權政策（authorization policy）**：以角色為主體的「資源 × 動作」准許規則；採既有政策儲存（stock、本 feature 僅 seed 示範政策、不加治理）。
- **身分憑證（access / refresh credential）**：登入核發的存取與換發憑證；本 feature 不持久化（無狀態驗證）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：以預設帳號登入可取得憑證、並以憑證取回正確使用者資料（含 `User`→`User01` 別名）；base-web 登入流程於**瀏覽器**端到端跑通（可驗）。
- **SC-002**：同一條受保護資源,具足夠角色者放行、角色不足者被拒（可驗的 allow + deny）。
- **SC-003**：以有效換發憑證可換得新存取憑證；換發失敗回立即登出碼 `8888`、不觸發前端無限換發（可驗）。
- **SC-004**：套用本 feature 後,既有系統行為（健康檢查、既有測試、資料存取邊界）不被破壞（可驗）。

## Assumptions

- **設計決策已凍結**：brainstorm D1-D11（2026-05-29 user 親決）,見 [`docs/superpowers/013-auth-login-enforce.md`](../../docs/superpowers/013-auth-login-enforce.md)；本 feature 忠實落地。
- **base-web wire 為權威**：login / getUserInfo / 換發 / error code 形狀對齊 base-web mock ground truth（[MOCK §4.5/§4.7/§4.11/§4.12](../../docs/MOCK-COVERAGE-AUDIT.md)）；前端不解析憑證內容,故憑證內部結構可自由設計（但仍驗到期）。
- **授權攔截為 rev2 自家實作**：不沿用參考來源的中介層（DESIGN §11.6「重寫」拍板）；本 feature 為其第一刀（最小機制）。
- **授權政策儲存沿用 012**：政策表為 012 引入的 stock 儲存,本 feature 僅 seed 示範政策、維持原生語意（軟刪除留後續）。
- **活體驗收對 dev stack**：對真實資料庫做活體 smoke（沿用既有 in-crate `#[ignore]` + env-gate harness）+ 瀏覽器端到端登入驗證。
- **兩段式提交**：本 feature 動到後端原始碼工作區（新增認證/授權程式 + 角色 schema + 政策 seed）,依工作區慣例走兩段式提交。
- **既有設定就緒**：憑證簽章密鑰與到期設定已由先前 feature（005/007）備妥；本 feature 接上簽發/驗證。

### 不在 scope

完整授權政策矩陣 / 全資源授權 rollout；登入事件與請求層 audit（來源 IP / 來源地）；授權政策的軟刪除可復原 / 不可刪保護 / 變更稽核 / 統一 CRUD（受管政策層,後續階段）；換發憑證的持久化 rotation chain；動態選單路由（getUserRoutes 等）；政策失效通知通道；按鈕/選單權限的表格化管理。
