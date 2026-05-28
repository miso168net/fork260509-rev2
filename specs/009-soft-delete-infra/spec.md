# Feature Specification: soft-delete-infra

**Feature Branch**: `009-soft-delete-infra`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "@docs/superpowers/009-soft-delete-infra.md"（soft-delete 基礎設施:立機制 + 套 `sys_user` 為 proof —— 軟刪除標記 + active-only 查詢 + active 唯一性可重用 + 繞過防護 build-time 強制）

**Phase 0 brainstorm source**: [`docs/superpowers/009-soft-delete-infra.md`](../../docs/superpowers/009-soft-delete-infra.md)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 軟刪除機制立定（Priority: P1）🎯 MVP

系統提供一套**軟刪除機制**:業務 entity 的記錄被「刪除」時,只標記為已刪除(記下刪除時刻)、**不物理移除**;一般(active)查詢預設**只看得到未刪除的記錄**。本 feature 把此機制套用在既有 `sys_user` 上作為 proof,後續每個 entity 被建立時都沿用同一 pattern。如此 rev2 全域有一致、可預測的「刪除即標記、查詢即過濾」資料生命週期,且資料保留(可供日後還原 / 稽核 / cleanup)。

**Why this priority**:這是本 feature 的核心價值與 MVP —— 沒有統一的軟刪除機制,後續每個 entity 各自決定刪除語意、查詢各自決定要不要濾掉已刪除,資料生命週期失控且與 audit(下個 feature,依本 feature)無法對齊。軟刪除機制是 Phase 2+ 所有資料 entity 的地基。

**Independent Test**:對軟刪除機制跑單元測試 —— active 查詢產生的條件含「排除已刪除」語意;軟刪除操作產生的是「設定刪除標記」而非「移除 row」。即驗,不需任何業務 endpoint。

**Acceptance Scenarios**:

1. **Given** 一個受管 entity 的 active 查詢,**When** 取得查詢條件,**Then** 該查詢只涵蓋未刪除(刪除標記為空)的記錄
2. **Given** 一筆既有記錄,**When** 對它執行軟刪除,**Then** 該記錄仍存在於儲存層(可查得)、僅刪除標記被設為刪除時刻,而非被物理移除
3. **Given** 一筆已軟刪除的記錄,**When** 執行 active 查詢,**Then** 該記錄不出現在結果中

---

### User Story 2 — active 唯一性與刪除後可重用（Priority: P2）

唯一性約束**只作用於未刪除的記錄**:同一個唯一鍵值,在「至多一筆 active + 任意數量已刪除」並存時不衝突。亦即軟刪除一筆記錄後,可以用**同一個唯一鍵值**再建立一筆新的 active 記錄。以 `sys_user.user_name` 為例:刪除帳號「Alice」後,仍可重新建立帳號「Alice」。

**Why this priority**:若唯一性仍作用於已刪除記錄,軟刪除會永久「卡住」該鍵值(刪掉的 user_name 再也不能用),這在實務上不可接受。P2(機制立定是 P1、唯一性語意是緊接的正確性要求)。

**Independent Test**:對同一唯一鍵值,先軟刪除既有記錄、再以同值新建 active 記錄應成功(不被唯一性擋);兩筆 active 記錄用同值才應被擋。即驗。

**Acceptance Scenarios**:

1. **Given** 一筆 active 記錄持有某唯一鍵值,**When** 將其軟刪除後、以同一鍵值新建 active 記錄,**Then** 新建成功(不被唯一性約束阻擋)
2. **Given** 一筆 active 記錄持有某唯一鍵值,**When** 嘗試新建另一筆**同值的 active** 記錄,**Then** 被唯一性約束阻擋

---

### User Story 3 — 繞過防護（build-time 強制）（Priority: P3）

對受管 entity 的 active-aware 存取**只能透過單一受管管道**;程式碼**不得繞過該管道**直接存取底層 raw entity。此禁令在**建置 / 測試時自動強制** —— 一旦出現繞過,建置 / 測試即失敗。這確保「active 查詢自動過濾已刪除」這個不變式不會因某處直接碰 raw entity 而被悄悄破壞。

**Why this priority**:三重防護的「最後一道」—— 沒有它,任何開發者(或未來的 AI implementer)一個直接 query 就繞過 active 過濾、讓已刪除記錄外洩。但它防的是「未來的繞過」,本 feature 自身無業務 query,故為收尾正確性。P3。

**Independent Test**:正向 —— 受管管道內部存取 raw entity 不被誤判;反向 —— 在受管管道以外植入一段直接存取 raw entity 的程式碼,建置 / 測試應失敗。即驗。

**Acceptance Scenarios**:

1. **Given** 受管管道以外的程式碼,**When** 它直接 import / 存取底層 raw entity,**Then** 建置 / 測試失敗並指出違規位置
2. **Given** 受管管道內部的程式碼,**When** 它合法存取 raw entity,**Then** 建置 / 測試通過(不誤殺)

---

### Edge Cases

- **同名並存上限**:同一唯一鍵值最多一筆 active;已刪除的同值記錄可有多筆(多次「建立→刪除」循環),彼此不衝突。
- **軟刪除既已刪除的記錄**:對已刪除記錄再軟刪除為 no-op 或保持原刪除時刻(本 feature 無此呼叫路徑,屬未來語意,不在 proof 範圍)。
- **還原(restore)**:資料保留使還原成為可能,但本 feature **不**提供還原操作(無 consumer)。
- **物理清理**:已刪除記錄的物理移除留待 cleanup-job(Phase 5);本 feature 只標記、不清理。

---

## Requirements *(mandatory)*

### Functional Requirements

**軟刪除機制**

- **FR-001**:系統 MUST 為業務 entity 提供軟刪除 —— 刪除一筆記錄時 MUST 記下「刪除時刻」標記而非物理移除該記錄;未刪除記錄的標記為空(active)
- **FR-002**:系統 MUST 提供 active 查詢,其結果 MUST 只涵蓋未刪除(標記為空)的記錄;已軟刪除記錄 MUST NOT 出現在 active 查詢結果
- **FR-003**:軟刪除後資料 MUST 被保留於儲存層(物理 row 不移除),使日後還原 / 稽核 / 清理成為可能

**唯一性**

- **FR-004**:唯一性約束 MUST 只作用於未刪除記錄 —— 同一唯一鍵值在「至多一筆 active + 任意數量已刪除」並存時 MUST NOT 衝突;兩筆 active 記錄持同一唯一鍵值 MUST 被阻擋

**繞過防護**

- **FR-005**:對受管 entity 的 active-aware 存取 MUST 只能透過單一受管管道;系統 MUST 禁止程式碼繞過該管道直接存取底層 raw entity,且此禁令 MUST 於建置 / 測試時自動強制(違規 → 建置 / 測試失敗、並指出違規位置)
- **FR-006**:繞過防護 MUST NOT 誤殺受管管道內部對 raw entity 的合法存取

**範圍(proof + 邊界)**

- **FR-007**:本 feature MUST 把 FR-001~FR-006 的機制套用於 `sys_user` 作為 proof;套用後 MUST NOT 破壞 `sys_user` 既有行為(連線 / seed)
- **FR-008**(scope 邊界 / 不做):MUST NOT 改動其餘 6 個尚未建立的 entity(各自被建時沿用本 pattern);MUST NOT 實作還原 / 更新-active 操作(無 consumer);MUST NOT 改動 `sys_user` 主鍵策略(`id` auto_increment 為正交議題);MUST NOT 實作業務 endpoint / DTO / audit log / Casbin orphan 物理清理

### Key Entities *(include if feature involves data)*

- **軟刪除標記**:每個受管 entity 一個「刪除時刻」屬性;空 = active(未刪除)、非空 = 已於該時刻刪除。是 active 查詢過濾與唯一性作用範圍的依據
- **受管 entity**(本 feature proof = `sys_user`):透過受管管道存取的業務 entity;持有軟刪除標記
- **active 唯一鍵**(本 feature 例 = `sys_user` 的帳號名):唯一性只在 active 記錄間作用;已刪除記錄不參與,故刪除後同值可重用

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:軟刪除一筆記錄後,該記錄仍可於儲存層查得、且不再出現於 active 查詢結果(可驗)
- **SC-002**:對同一唯一鍵值,先軟刪除既有記錄、再以同值新建 active 記錄成功;兩筆同值 active 則被阻擋(可驗)
- **SC-003**:受管管道以外直接存取 raw entity 的程式碼使建置 / 測試失敗;管道內部合法存取不被誤殺(可驗:正反向)
- **SC-004**:active 查詢產生的條件含「排除已刪除」語意(可驗:單元測試斷言)
- **SC-005**:機制套用於 `sys_user` 後,既有 `sys_user` 行為(007 連線 / migration seed)不被破壞(可驗)

---

## Assumptions

- **設計決策已凍結**:brainstorm 階段 user 親決 6 項(D1-D6),見 [`docs/superpowers/009-soft-delete-infra.md`](../../docs/superpowers/009-soft-delete-infra.md);本 feature 忠實落地,非自由設計。
- **soft-delete pattern 為 DESIGN §6.5 三重防護的落地**:類型層(受管 trait)+ facade(唯一管道)+ build-time lint(繞過防護);本 feature 立 pattern + 套 `sys_user` proof。
- **只套 `sys_user`**:其餘 6 entity(sys_role / sys_menu / sys_role_user / sys_role_menu / sys_role_endpoint / sys_menu_button)尚未建立,各自被建時沿用本 pattern,不在本 scope。
- **`sys_user.id` auto_increment 為正交議題**:留 CHECKLIST §2.10,不在本 feature 改動。
- **無 HTTP delete endpoint**:業務刪除路徑屬 Phase 3+;本 feature proof 以單元測試(機制 + 繞過防護)+ migration 套用驗證為主,無 curl / CDP 消費者。
- **還原 / 更新-active 延後**:YAGNI,無 consumer;受管 trait 可於 Phase 3+ 有需求時擴充。

### 不在 scope

其餘 6 entity 的 soft-delete rollout(各 entity 建立時);audit log 基礎設施(Phase 2 next,依本 feature);還原 / 更新-active 操作;`sys_user.id` 主鍵策略;業務 endpoint / DTO;Casbin orphan 物理清理(cleanup-job,Phase 5)。
