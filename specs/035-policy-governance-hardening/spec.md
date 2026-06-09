# Feature Specification: 治理層收尾硬化（Policy Governance Hardening）

**Feature Branch**: `035-policy-governance-hardening`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "@docs/superpowers/035-policy-governance-hardening.md — 034 治理層收尾硬化:(US1) restore 審計負載豐富化(記實際 policy 身分、非懸空 archive_id)(US2) no-op reload 跳過(治理寫入無實際 mutation 時不浪費 enforcer reload + redis publish)"

> 設計輸入(brainstorm spec-design):[`docs/superpowers/035-policy-governance-hardening.md`](../../docs/superpowers/035-policy-governance-hardening.md)。本 spec 聚焦 **WHAT / WHY**(可驗收行為);實作機制(`RestoreOutcome` 帶欄、`PolicyMutated` trait、`mutate_and_reload` 條件化)留 `plan.md`。承 034（受管 RBAC policy 治理層）已落地基礎,本 feature 收兩個「正確但不夠好」的內部債,**對外行為與讀決策零變**。

## User Scenarios & Testing *(mandatory)*

> 「使用者」= 後台運維者(operator)+ 稽核/安全審查者(讀審計軌跡的人);治理動作限超級管理員(Super)。本 feature 純內部硬化、不新增任何操作或介面。User Story 依優先序 P1→P2 排列,各可獨立驗收。

### User Story 1 - 還原操作留下可追溯的審計（Priority: P1）

身為稽核/運維者,當運維者從回收桶**還原**一條先前被移除的權限時,這次還原要在操作審計日誌留下**「還原了什麼」**的可追溯紀錄 —— 該權限的**角色、對象、維度**。今天的還原審計只記一個「內部參照（歸檔列 id）」,而這個歸檔列在還原的**同一筆操作中即被刪除** → 審計事後看得到「發生過一次還原」,卻看不出「還原的是哪條權限」,對最敏感的「重新授予已撤權限」動作形同無稽核。

**Why this priority**: 整個治理層的價值就是「可稽核、可復原的權限軌跡」(034 SC-001:100% 變更有審計)。還原審計記的是還原後即懸空、解析不出實體的內部 id,使這條軌跡對 forensic 失效。補上實際身分是治理層審計完整性的收口,故 P1。

**Independent Test**: 在回收桶還原一條被移除的權限;檢視產生的「還原」審計列,確認它記下該權限的角色、對象、維度,而非一個還原後已不存在、解析不出內容的內部參照。

**Acceptance Scenarios**:

1. **Given** 一條被移除但可還原的權限(例如某角色的某按鈕權限),**When** 運維者經回收桶還原它,**Then** 恰寫一筆「還原」審計列,其負載記下該權限的**角色**、**對象**(按鈕碼 / 選單 route / 接口 path)、**維度**(選單 / 按鈕 / 接口)。
2. **Given** 還原完成(連帶的歸檔列已在同筆操作中被消費),**When** 事後審查該審計列,**Then** 其記下的權限身分仍**可解析、有意義**(不依賴任何被該還原刪掉的暫存列)。

---

### User Story 2 - 無實際變更的治理寫入不做白工（Priority: P2）

身為運維者,當我提交一個**沒有真正改到任何權限**的治理寫入時,系統不該做多餘的工作。今天每個治理寫入 commit 後都**無條件**刷新 enforce 用的權限狀態 + 廣播跨實例失效通知;但若這次寫入其實**零變更**——被「受保護」守衛拒絕、還原一條早已生效的權限、還原一個不存在的歸檔項、或對不存在的選單做生命週期操作——那次刷新與廣播純屬浪費。

**Why this priority**: 純效率改善、**結果完全相同**(回應、錯誤碼、行為不變),只是少做一次全量刷新 + 廣播。價值在於削掉無謂的刷新與跨實例擾動;因不涉正確性/稽核缺口,優先序排在 US1(審計)之後。

**Independent Test**: 逐一觸發各「零變更」治理路徑(拒絕移除受保護權限 / 還原已生效權限 / 還原不存在歸檔項 / 軟刪不存在選單),確認**回應與行為逐項不變**,且該次**不發生** enforce 狀態刷新與跨實例廣播。

**Acceptance Scenarios**:

1. **Given** 一個移除受保護權限的嘗試,**When** 它被拒絕,**Then** 拒絕回應與今天逐字相同,**且**該次不發生 enforce 刷新與跨實例廣播(零變更)。
2. **Given** 還原一條早已生效的權限,**When** 提交,**Then** 視為成功 no-op(回應不變),**且**不發生 enforce 刷新與廣播。
3. **Given** 一個**確有**改到權限的治理寫入(新增/移除權限列、成功還原、或選單生命週期連帶撤/還可見性),**When** 提交,**Then** enforce 刷新與跨實例廣播**照常發生**(無 regression、無 stale enforce)。

---

### Edge Cases

- **整批替換成同一集(空-diff)**:某角色權限編輯送出與現狀**完全相同**的集合(零淨增、零淨減)→ **不**視為「零變更」可跳路徑,刷新與廣播**照常發生**(明確劃出 US2 範圍只含「結構性零變更」路徑、不含 edit-to-identical-set)。
- **批次選單刪除全 no-op**:批次刪除送入的 id 全部不存在 → 整批零實際變更 → 該批不發生刷新與廣播。
- **菜單連帶歸檔(reason=menu_soft_delete)**:不在本 feature 的 restore 審計/回收桶範圍(由 034 既有邏輯處理),本 feature 不改其行為。
- **刷新本身失敗**:確有變更而刷新失敗時,沿既有錯誤路徑回報(本 feature 不改錯誤語意);no-op 跳過刷新不引入新錯誤路徑。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 當一條被移除的權限被還原時,系統 MUST 寫一筆審計列,以該權限的**角色、對象、維度**標識「還原了什麼」,而非僅以一個在該操作中被刪除、事後解析不出的內部參照標識。
- **FR-002**: 該還原審計列記下的權限身分 MUST 在還原完成後仍可解析、有意義(不依賴任何被該還原消費/刪除的暫存列)。
- **FR-003**: 當一個治理寫入**對任何權限零實際變更**時(移除受保護權限被拒、還原已生效權限、還原不存在的歸檔項、或選單生命週期操作之目標不存在),系統 MUST NOT 執行 commit 後的 enforce 權限狀態刷新與跨實例失效廣播。
- **FR-004**: 當一個治理寫入**確有改到至少一條權限**時(權限列增/減、成功還原、或選單變更連帶撤/還可見性),系統 MUST 照既有方式執行 enforce 刷新與跨實例廣播。
- **FR-005**: 本變更 MUST NOT 改變任何對外請求/回應契約、錯誤碼、或讀(enforce)決策 —— 為純內部硬化、對外逐項不變。
- **FR-006**: 「整批替換成同一集」(零淨增減的權限編輯)MAY 仍觸發刷新(**不**要求被當成零變更跳過)—— 明確把 US2 的跳過範圍限縮在「結構性零變更」路徑(拒絕 / 查無 / 已存在 / 目標不存在),不含 edit-to-identical-set。

### Key Entities *(include if feature involves data)*

- **操作審計記錄(Audit Record)**:既有操作審計日誌中的一筆永久不可變記錄。對「還原」操作,其負載 MUST 攜帶被還原權限的角色、對象、維度(取代僅記內部歸檔 id)。本 feature **不新增任何資料表或欄位**。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% 的還原操作產生一筆審計列,其負載記下被還原權限的**角色、對象、維度**;**零**還原審計只記一個事後不可解析的內部參照。
- **SC-002**: 零實際變更的治理寫入產生**零**次 enforce 權限狀態刷新與**零**次跨實例廣播。
- **SC-003**: 所有既有對外行為——請求/回應形狀、錯誤碼、讀(enforce)決策——在 feature 前後**逐項相同**(既有守恆/一致性檢查全綠、零 regression)。
- **SC-004**: 確有改到權限的治理寫入**仍**刷新 + 廣播(零漏刷新 → 零 stale enforce)。

## Assumptions

- **承 034 既有治理層**:原子治理 facade、回收桶、治理寫入路徑皆已存在且契約不變;本 feature 只硬化其內部,不改任何對外契約。
- **單一後端實例為部署目標**:跨實例廣播是「有變更才送」的 fan-out,零變更即不送;多副本真實 fan-out 驗證沿 034 既有 out-of-scope。
- **還原權限的身分(角色/對象/維度)可在還原當下取得**,無需額外查詢即可寫入審計。
- **「零變更」以結構性零變更層級判定**(拒絕 / 查無 / 已存在 / 目標不存在);edit-to-identical-set 不在跳過範圍。
- 既有審計日誌、enforce 機制、治理寫入/還原路徑皆沿用、不重建。
