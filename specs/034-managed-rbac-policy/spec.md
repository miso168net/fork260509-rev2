# Feature Specification: 受管 RBAC Policy 治理層（Managed RBAC Policy Governance）

**Feature Branch**: `034-managed-rbac-policy`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "@docs/superpowers/034-managed-rbac-policy.md — 受管 RBAC policy 治理層:soft-delete 可復原 / 受保護不可刪 / 變更走 011 audit / 統一 CRUD facade + menu↔casbin 漂移修復 + base-web policy 回收桶 UI"

> 設計輸入(brainstorm spec-design):[`docs/superpowers/034-managed-rbac-policy.md`](../../docs/superpowers/034-managed-rbac-policy.md)。本 spec 聚焦 **WHAT / WHY**(可驗收行為);實作機制(archive-vs-fork 架構、migration、facade 結構)留 `plan.md`。

## Clarifications

### Session 2026-06-09

- Q: 受保護(protected)標記能否在執行期由超級管理員切換,還是只能 seed/部署變更? → A: **Seed/部署固定、執行期不可改** —— 無 un-protect 路徑,任何角色(含 Super)都不能關掉保護再移除;self-lockout 為硬保證。
- Q: 選單軟刪連帶歸檔的可見性權限,要不要也列入 policy 回收桶可單獨還原? → A: **排除** —— policy 回收桶只含「權限編輯」造成的移除(撤銷 / 整批替換拿掉);選單軟刪連帶的可見性權限只由「選單回收桶」還原選單時一起帶回(避免單獨還原一條指向已刪選單的權限 cruft)。

## User Scenarios & Testing *(mandatory)*

> 「使用者」= 後台運維者(operator);治理動作絕大多數限超級管理員(Super)。本 feature 在既有 RBAC 系統(Casbin policy + 角色 + 選單 + 操作審計日誌)上加「治理層」。User Story 依優先序 P1→P5 排列,每個 story 對應 brainstorm 的一個 US、且可獨立驗收。

### User Story 1 - 權限變更可追溯且可復原（Priority: P1，brainstorm US1）

身為運維者,當我變更任一角色的權限(授予 / 撤銷一條 policy),這個變更要**原子地**記進操作審計日誌(誰、何時、原因、前後快照),而且**被撤銷的權限可以救回**。今天 policy 變更與審計是兩條獨立寫入,變更可能已生效卻沒留下審計;撤銷則是實體刪除、無法復原。

**Why this priority**: 這是整個治理層的地基(原子性 + 審計軌跡 + 可復原緩衝)。沒有它,protected / 收斂 / menu 同步 / 回收桶都無所附麗。單獨交付即是一個可用 MVP:policy 變更從此都有審計、且可救回。

**Independent Test**: 對 dev DB 授予一條 policy、確認恰好一筆對應審計;撤銷它、確認 policy 不再 enforce 且進入「可還原」集;還原它、確認 policy 重新 enforce;注入審計寫入失敗、確認 policy 變更一併回滾(無半寫)。

**Acceptance Scenarios**:

1. **Given** 一條 live policy,**When** 運維者撤銷它,**Then** 該 policy 立即不再被 enforce、且出現在「可還原」集合,並寫入一筆「撤銷」審計(operator/時間/原因/前後快照)。
2. **Given** 一條已撤銷(可還原)的 policy,**When** 運維者還原它,**Then** 該 policy 重新被 enforce、離開可還原集,並寫入一筆「還原」審計。
3. **Given** 一次 policy 變更,**When** 對應的審計寫入失敗,**Then** 整個變更回滾 —— policy 不變、審計不留(both-or-neither)。

---

### User Story 2 - 關鍵治理權限不可誤刪（Priority: P2，brainstorm US2）

身為運維者,我**不能**(經由任何編輯路徑)把關鍵治理權限移除掉 —— 例如超級管理員對「角色管理 / 選單管理 / 系統設定」頁的可見性、以及超級管理員的治理端點權限。系統必須在我嘗試移除時**拒絕**。今天這靠幾個散落、不一致的臨時硬寫守衛,且有漏洞(角色管理頁、系統設定頁未被保護)。

**Why this priority**: 防運維者把自己鎖在治理門外(self-lockout)是安全要務,且要補掉現存漏洞。data-driven 的「受保護」標記取代散落守衛、行為一致可驗。

**Independent Test**: 標記關鍵治理 policy 為受保護;嘗試「直接撤銷」與「整批替換時省略它」兩種路徑移除它,確認皆被拒;確認超級管理員無論如何都保有對角色 / 選單 / 系統設定管理頁的可見性。

**Acceptance Scenarios**:

1. **Given** 一條受保護的治理 policy,**When** 運維者直接撤銷它,**Then** 系統拒絕(回業務錯誤碼),policy 不變。
2. **Given** 一個角色的整批權限替換編輯**省略了**某條受保護 policy,**When** 提交,**Then** 整筆編輯被拒(不靜默丟棄該條)。
3. **Given** 超級管理員,**When** 任何運維操作完成後,**Then** 超級管理員對「角色管理」「選單管理」「系統設定」三頁的可見性都仍在(補掉今天角色 / 系統設定頁未受保護的漏洞)。

---

### User Story 3 - 選單刪除/還原與其可見性權限同步（Priority: P3，brainstorm US4）

身為運維者,當我軟刪一個選單,該選單的可見性權限要**同步被清理**(不留孤兒);當我還原該選單,它的可見性權限要**同步被還原**。而且,若我用一個被刪選單的同名 route 重建新選單,新選單**不該**靜默繼承舊權限。今天選單 CRUD 完全不碰權限 → 留孤兒、同名重建靜默繼承(權限驚奇)。

**Why this priority**: 同名重建靜默繼承是「沒人授權卻可見」的授權驚奇(安全),且孤兒權限累積。修這條把選單與其可見性權限變成一致的生命週期。

**Independent Test**: 軟刪一個有可見性權限的選單,確認其可見性權限離開 live 集(進可還原集)、且 enforce 拒該選單;還原該選單,確認可見性權限回來;軟刪選單後以同名 route 建新選單,確認新選單對所有角色起始皆不可見。

**Acceptance Scenarios**:

1. **Given** 一個對某些角色可見的選單,**When** 運維者軟刪它,**Then** 該選單跨所有角色的可見性權限同步進入可還原集、不再 enforce,且此權限變更有審計。
2. **Given** 一個先前被軟刪、其可見性權限已歸檔的選單,**When** 運維者還原它,**Then** 它的可見性權限同步還原。
3. **Given** 一個被軟刪的選單,**When** 運維者以**同名 route** 建立新選單,**Then** 新選單對所有角色起始**皆不可見**(無靜默繼承),需另行授予。

---

### User Story 4 - 三個權限編輯介面行為一致（Priority: P4，brainstorm US3）

身為運維者,我用的三個權限編輯介面(選單可見性 / 按鈕 / 接口授權)行為要一致:都產生相同形式的審計、都遵守相同的「受保護」守衛。對我而言這三個編輯介面的操作方式與結果**完全不變**;改善的是它們背後不再各說各話。

**Why this priority**: 收斂三個近乎逐字重複的編輯路徑為單一機制,消除重複與不一致(可維護性);使 US1(審計)與 US2(受保護)一致套用到全部三維度。對外行為不變、屬內部一致化,故優先序在安全項之後。

**Independent Test**: 對三個編輯介面各跑既有驗收(curl + 瀏覽器),確認對外請求 / 回應與行為逐位元組不變;確認三者的權限變更現在都產生相同形式的審計、都被受保護守衛攔截。

**Acceptance Scenarios**:

1. **Given** 三個權限編輯介面各自的既有驗收情境,**When** 重跑,**Then** 對外行為與回應全數不變(無 regression)。
2. **Given** 任一編輯介面的一次權限變更,**When** 提交成功,**Then** 產生與其他兩介面相同形式的審計(operator/原因/前後快照)。
3. **Given** 任一編輯介面的整批替換省略了受保護 policy,**When** 提交,**Then** 被同一套受保護守衛攔截(三介面行為一致)。

---

### User Story 5 - 已移除權限的回收桶（Priority: P5，brainstorm US5）

身為運維者(超級管理員),我可以在一個「回收桶」頁看到所有**被移除但可還原**的權限(角色 / 對象 / 維度 / 移除原因 / 時間 / 操作者),並對任一條**一鍵還原**。

**Why this priority**: 這是 US1 後端可復原能力的使用者介面收口 —— 讓運維者前端可視、可一鍵救回。倚賴 US1(可還原緩衝 + 還原能力)與 US3(選單同步);故排最後。

**Independent Test**: 在後端造出若干被移除的權限後,開回收桶頁確認列出且欄位正確(角色/對象/維度/原因/時間/操作者);對一條按「還原」,確認該權限重新生效、且自回收桶消失。

**Acceptance Scenarios**:

1. **Given** 若干被「權限編輯」移除但可還原的權限(選單軟刪連帶項不列入),**When** 超級管理員開回收桶頁,**Then** 逐條列出含角色、對象、維度、移除原因、時間、操作者。
2. **Given** 回收桶中一條權限,**When** 超級管理員點「還原」,**Then** 該權限重新生效、自回收桶消失,並寫入「還原」審計。
3. **Given** 非超級管理員,**When** 嘗試存取回收桶頁或還原端點,**Then** 被拒(選單不可見 + 端點 enforce 拒)。

---

### Edge Cases

- **整批替換省略受保護**:hard-replace 編輯省略某受保護 policy → 整筆編輯被拒(非靜默丟棄)。
- **還原已存在**:還原一條其相同 live 授予已存在的權限 → 視為成功 no-op(不產生重複)。
- **同名 route 競態(TOCTOU)**:選單還原時 route 名已被另一 live 選單佔用 → 選單層唯一性守衛擋下,連帶其權限不會被誤還原到新選單上。
- **審計寫入失敗**:policy 變更途中審計寫入失敗 → 整個變更回滾(無半寫、無「已生效卻無審計」)。
- **懸空可還原項**:被刪選單的權限,因其 route 名已被新選單重用而永不可還原 → 容忍為死 cruft,自動清理屬後續(out-of-scope)。
- **跨維度誤刪保護**:撤銷單條權限必須精確匹配該條,不得誤刪同角色其他維度(選單 / 按鈕 / 接口)的權限。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 把每次 policy 變更(授予 / 撤銷 / 還原)**原子地**與操作審計記錄一同持久化 —— 變更與其審計記錄 both-or-neither(消滅「policy 已生效卻無審計」)。
- **FR-002**: 審計記錄 MUST 含 operator(誰)、時間、變更類型、原因、以及受影響 policy 的前後快照。
- **FR-003**: 系統 MUST 讓被撤銷的 policy 可被還原回其撤銷前的生效狀態。
- **FR-004**: 系統 MUST 提供「受保護」標記,標記為受保護的 policy / 選單在任何移除路徑(直接撤銷、或整批替換省略)下 MUST 被拒絕移除。受保護標記 MUST 為 **seed / 部署固定、執行期不可變更**(無 un-protect 路徑;任何角色含超級管理員皆不能於執行期關閉保護再移除)。
- **FR-005**: 受保護集合 MUST 至少涵蓋:超級管理員對「角色管理」「選單管理」「系統設定」三頁的可見性,以及超級管理員的治理端點權限(補掉今天角色管理頁、系統設定頁未受保護的漏洞)。
- **FR-006**: 系統 MUST 以單一統一變更路徑承載三個權限維度(選單可見性 / 按鈕 / 接口)的編輯,使三者產生相同形式審計、遵守相同受保護守衛;三個既有編輯介面的對外請求 / 回應契約 MUST 維持不變。
- **FR-007**: 撤銷單條 policy MUST 精確匹配該 (角色, 對象, 維度) 列,不得誤刪同角色其他維度的權限。
- **FR-008**: 選單被軟刪時,系統 MUST 原子地把該選單跨所有角色的可見性權限一併撤銷(歸檔),不留孤兒可見性權限。
- **FR-009**: 選單被還原時,系統 MUST 原子地還原該選單先前歸檔的可見性權限。
- **FR-010**: 以被刪選單的同名 route 重建的新選單 MUST 起始對所有角色皆不可見(無靜默繼承)。
- **FR-011**: 系統 MUST 提供運維者(超級管理員)一個檢視「被移除但可還原」權限的介面(回收桶),逐條含角色、對象、維度、移除原因、時間、操作者,並提供一鍵還原。回收桶 MUST 只含「權限編輯」造成的移除(單條撤銷 / 整批替換拿掉);**選單軟刪連帶歸檔的可見性權限 MUST 排除於 policy 回收桶之外**(由 FR-009 還原選單帶回,不在 policy 回收桶單獨還原)。
- **FR-012**: 還原一條其相同 live 授予已存在的權限 MUST 為成功 no-op(不產生重複)。
- **FR-013**: 回收桶檢視與還原能力 MUST 限超級管理員(選單可見性走既有 Casbin enforce、端點走 enforce)。
- **FR-014**: 系統 MUST NOT 改變任何權限**讀**決策(誰看得到哪個選單、誰能存取哪個端點)相對於現行行為 —— 本 feature 為純寫側治理。
- **FR-015**: 資料遷移(m031–m034)後,系統 MUST 保留既有 seed policy baseline —— policy 列數不因新增治理欄 / archive 機制而改變,且 protected 標記集 = 預期治理集、既有種子列可 reconcile(資料層保留;與 FR-014「讀決策不變」的行為層互補)。
- **FR-016**: 錯誤回應 MUST 沿用既有業務錯誤碼慣例(受保護不可移除沿用既有「業務錯誤」碼、找不到沿用「不存在」碼、競態沿用既有碼);MUST NOT 新增錯誤碼。

### Key Entities *(include if feature involves data)*

- **Policy(授予)**:單條授權規則 = (角色, 對象, 維度);維度 ∈ {接口存取, 選單可見性, 按鈕}。存於既有 policy 儲存。新增屬性:**受保護**(布林)、建立時間 / 建立者。
- **Archived Policy(回收桶項)**:被移除但可還原的 policy 快照 + 移除中繼資料(原因、時間、操作者、原授予出處)。還原後即離開此集合。
- **Audit Record(審計記錄)**:既有操作審計日誌中的一筆永久不可變記錄,記錄一次 policy 變更(授予 / 撤銷 / 還原)。為永久軌跡;與「可還原緩衝」職責不同、不重疊。
- **Menu(選單)**:既有實體;新增**受保護**屬性;其生命週期(軟刪 / 還原)現與其可見性權限同步。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% 的 policy 變更(授予 / 撤銷 / 還原)都產生對應審計記錄;零變更在無審計下落地(消滅現存「變更已生效卻無審計」缺口)。
- **SC-002**: 任一被移除的權限可在**單一**運維動作內還原回其撤銷前狀態。
- **SC-003**: 移除任一受保護治理權限的嘗試,在所有編輯路徑(直接撤銷 + 整批替換)下 100% 被拒。
- **SC-004**: 軟刪後以同名 route 重建的選單,對**零**個角色可見,直到被明確授予。
- **SC-005**: 既有所有權限讀決策(Super/Admin/User 的選單可見性 + 端點存取)在 feature 前後**逐項相同**。
- **SC-006**: 三個既有權限編輯介面在 feature 後對外行為與回應**逐位元組不變**(既有驗收全綠)。
- **SC-007**: 運維者能在單一介面看到全部「被移除但可還原」權限,並對任一條一鍵還原成功。

## Assumptions

- **部署目標 = 單一後端實例**:多副本的 policy 重載 fan-out 驗證 **out-of-scope**(非當前部署目標);單實例自收驗即可。
- **後端不 fork 既有 policy 儲存 adapter、不需 constitution amendment**:後端治理(US1–US4)以不修改 vendored adapter 的方式達成;**唯** US5 的回收桶 UI 可能需要 MODAL-WIRING constitution amendment(實作到 US5 時於 plan 評估、user 親決)。
- **讀側快取 / 多用戶讀效能屬獨立 feature、out-of-scope**(本 feature 純寫側治理、不碰讀熱路徑、不增 per-request 讀壓)。
- **可還原緩衝的保留 / 自動清理(retention / purge)out-of-scope**(列 follow-up;policy 撤銷罕見、緩衝小)。
- **回收桶與還原限超級管理員**;一般角色不可見、端點 enforce 拒。
- 既有三個權限編輯介面(選單可見性 / 按鈕 / 接口授權)與選單 CRUD、操作審計日誌、Casbin enforce 機制皆已存在並沿用。
