# Feature Specification: audit-log

**Feature Branch**: `011-audit-log`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "@docs/superpowers/011-audit-log.md"（統一資料變動 audit 基礎設施：每筆受管資料變動自動留下不可變、與變動同生共死的稽核紀錄，敏感欄位遮蔽；以軟刪 user 作活體示範）

**Phase 0 brainstorm source**: [`docs/superpowers/011-audit-log.md`](../../docs/superpowers/011-audit-log.md)

---

## Clarifications

### Session 2026-05-29

- Phase 0 brainstorm 已凍結全部設計決策（D1 範圍＝機制 + sys_user 活體 proof、沿用 009 / D2 原子性＝audit 與資料變動同一交易 / D3 enforcement＝結構強綁唯一寫入入口、build-failing lint 留 follow-up）＋子決策（SOFT_DELETE payload_before=遮蔽後 row、payload_after=null / 0-rows 不寫 audit / operator·trace 現為空），見 [`docs/superpowers/011-audit-log.md`](../../docs/superpowers/011-audit-log.md)。本 feature 忠實落地，非自由設計。spec 0 [NEEDS CLARIFICATION]。
- 對齊 [DESIGN §6.4 sys_operation_log](../../docs/INTEGRATION-DESIGN.md) schema 與 [§1.4 三方資料變動紀律](../../docs/INTEGRATION-DESIGN.md) 第 2 支柱；不變更 007 FR-009（server 不自動 migrate）、不變更 009 soft-delete facade 邊界。
- `/speckit-clarify` 正式掃描（11 taxonomy 類別）結果：**全部 Clear / N-A、0 提問**。Interaction&UX / Integration 為 N-A（後端 infra、無 UI、無新外部依賴）；低影響項（audit data volume/scale、performance 目標、稽核保留期、同列並發軟刪 race）屬 ops/Phase 6 或 plan 階段細節，採 reasonable-default、非 spec-level critical ambiguity。無需正式 clarify，可直接進 `/speckit-plan`。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 受管資料變動自動留下不可變稽核紀錄（原子）（Priority: P1）🎯 MVP

當一筆受管的資料變動發生（本 feature 以「軟刪一個 user」作示範），系統**自動**寫入一筆稽核紀錄，記下「對哪張表的哪一筆、做了什麼操作、變動前內容、變動後內容、操作者、發生時間」。這筆稽核紀錄與該資料變動在**同一筆交易**內成立 —— 一起成功，或一起取消。

**Why this priority**：這是本 feature 的核心價值與 MVP。沒有它，後續每個會改資料的業務功能（Phase 3 起）都缺少統一、可信、與變動同步的稽核軌跡；而「同生共死」是稽核可信度的根本 —— 否則會出現「改了卻沒記」或「記了卻沒改」的不一致。

**Independent Test**：從乾淨 DB 拉起 stack（schema 經自動 migration 套好），對一個既有 user 執行軟刪；不做其他操作，即可看到恰一筆稽核紀錄，且其操作類型、資料表、紀錄識別、變動前內容皆正確。即驗。

**Acceptance Scenarios**：

1. **Given** 一個既有（未刪）的 user，**When** 對它執行受管軟刪，**Then** 系統恰產生 1 筆稽核紀錄（操作類型＝軟刪、資料表＝該 user 表、紀錄識別＝該 user、含變動前內容），且該 user 被標記為已刪
2. **Given** 受管軟刪進行中，**When** 過程中任一步失敗，**Then** 該變動與其稽核紀錄一起取消（既無稽核紀錄、該 user 也未被刪）
3. **Given** 一筆已寫入的稽核紀錄，**When** 後續任何操作發生，**Then** 該稽核紀錄不被覆蓋或刪除（不可變、append-only）

---

### User Story 2 — 稽核紀錄不外洩敏感欄位（遮蔽）（Priority: P2）

稽核紀錄中的「變動前/後內容」對敏感欄位（如密碼）以固定遮蔽值取代，不以明文留存。

**Why this priority**：稽核軌跡會長期保存且可能被廣泛存取；若明文保留密碼等敏感欄位，稽核本身就成了資料外洩來源。緊接 P1 核心之後的安全收尾。

**Independent Test**：對一個 user 執行受管軟刪後，檢視該筆稽核紀錄的變動前內容，確認密碼欄位呈現為遮蔽值、而非明文。即驗。

**Acceptance Scenarios**：

1. **Given** 一個含密碼欄位的 user，**When** 對它執行受管軟刪，**Then** 稽核紀錄的變動前內容中密碼欄位呈現為固定遮蔽值（非明文），其餘非敏感欄位照常保留

---

### User Story 3 — 無效操作不產生雜訊稽核（Priority: P3）

當一筆操作實際未改動任何紀錄（例如刪除一個不存在或已刪除的目標）時，系統不寫入稽核紀錄。

**Why this priority**：避免稽核軌跡被「沒有實際發生變動」的操作灌入雜訊紀錄，保持稽核軌跡與真實變動一一對應。防的是邊界情況，正常路徑由 US1/US2 覆蓋，故為收尾正確性。P3。

**Independent Test**：對一個不存在 / 已軟刪的 user 識別執行軟刪；確認不產生任何稽核紀錄。即驗。

**Acceptance Scenarios**：

1. **Given** 一個不存在或已軟刪的目標識別，**When** 對它執行受管軟刪，**Then** 不產生稽核紀錄（無實際變動）
2. **Given** 一個既有未刪的目標，**When** 對它執行受管軟刪，**Then** 產生恰一筆稽核紀錄（US1 已涵蓋的正向對照）

---

### Edge Cases

- **變動成功但稽核寫入失敗**：兩者同交易 → 一起 rollback，該變動不留存（US1 #2）。
- **重複軟刪 / 刪不存在目標**：無實際變動 → 不寫稽核（US3）。
- **敏感欄位**：變動前/後內容一律先遮蔽再入稽核（US2）。
- **操作者未知**：本階段尚無認證 / 請求中介層，操作者與追蹤情境欄位可為空（系統動作）。
- **稽核紀錄不可變**：稽核自身不採軟刪、不被更新覆蓋（append-only）。

## Requirements *(mandatory)*

### Functional Requirements

**自動稽核 + 原子性**

- **FR-001**：每筆受管資料變動成立時，系統 MUST 自動寫入一筆稽核紀錄，內容包含：操作類型、受影響資料表、紀錄識別、變動前內容、變動後內容、操作者（可為空＝系統/匿名）、操作者來源位址（可為空）、追蹤識別（可為空）、發生時間
- **FR-002**：稽核紀錄與其對應的資料變動 MUST 在同一筆交易內成立 —— 一起成功或一起取消；不得出現「有變動無紀錄」或「有紀錄無變動」
- **FR-003**：稽核紀錄 MUST 為不可變（append-only）—— 一旦寫入即不被後續軟刪或更新覆蓋（稽核自身不採軟刪）

**敏感欄位保護**

- **FR-004**：稽核紀錄的變動前/後內容 MUST 對敏感欄位（如密碼）以固定遮蔽值取代，不得以明文留存；非敏感欄位照常保留

**無效操作**

- **FR-005**：當一筆操作實際未改動任何紀錄（如刪除不存在/已刪除目標）時，系統 MUST NOT 寫入稽核紀錄

**統一寫入入口 + 活體示範**

- **FR-006**：系統 MUST 提供單一、統一的受管寫入入口，使資料變動與稽核寫入綁定於同一交易；本 feature MUST 以既有唯一寫入路徑（軟刪 user）接上此入口作為活體示範

**範圍邊界（不做）/ 既有契約守恆**

- **FR-007**：本 feature MUST NOT 修改 API server boot 行為使其自行套 migration（守 007 FR-009；新稽核表經既有自動 migration 機制套用）；MUST NOT 加入 HTTP 請求層稽核中介層；MUST NOT 破壞既有 schema/seed/`/health` 行為；MUST NOT 變更 009 soft-delete facade 邊界（資料存取仍只經 facade）
- **FR-008**：本 feature MUST NOT 對其他資料實體、或對 新增/更新/還原 等操作做真實接線（僅定義操作類型、只以軟刪 user 作示範）；亦 MUST NOT 在本階段建立防「漏配稽核」的建置期 lint（留 follow-up，本階段以統一寫入入口的結構綁定 + 文件慣例保證）

### Key Entities

- **稽核紀錄（operation log）**：不可變的資料變動歷史。屬性：操作類型（新增/更新/軟刪/還原）、受影響資料表、受影響紀錄識別、變動前內容、變動後內容、操作者識別、操作者來源位址、追蹤識別、建立時間。本 feature 新增此資料實體（對齊 [DESIGN §6.4](../../docs/INTEGRATION-DESIGN.md)）。
- **受管資料實體（既有）**：變動會被稽核的資料。本 feature 以既有的 user 實體作示範（軟刪路徑）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：對一筆受管變動（軟刪一個既有 user），系統恰產生 1 筆稽核紀錄，正確記錄操作類型、資料表、紀錄識別與變動前內容（可驗）
- **SC-002**：當變動或稽核任一步失敗，變動與稽核皆不留存（可驗：反向注入失敗 → 既無稽核紀錄、目標也未被變動）
- **SC-003**：稽核紀錄的變動前/後內容中，密碼等敏感欄位以遮蔽值呈現、無明文（可驗）
- **SC-004**：對未實際改動任何紀錄的操作，不產生稽核紀錄（可驗）
- **SC-005**：套用本 feature 後，既有 API 行為（`/health`、預設帳號 seed、軟刪過濾）不被破壞（可驗）

## Assumptions

- **設計決策已凍結**：brainstorm 階段 user 親決 D1-D3 + 子決策（2026-05-29），見 [`docs/superpowers/011-audit-log.md`](../../docs/superpowers/011-audit-log.md)；本 feature 忠實落地，非自由設計。
- **沿用 009 soft-delete 基礎設施**（facade / trait / 既有 build-failing entity-access lint）作為寫入邊界與模板；既有 entity-access lint 已使資料存取只能經 facade。
- **沿用 010 自動 migration**：新稽核表經既有「stack `up` 自動套用」機制建立，無需手動 migration。
- **唯一現存寫入路徑為軟刪 user**：其餘 entity / HTTP 請求層稽核 / 新增·更新·還原 的真實接線留後續（各業務 endpoint 建立時 rollout）。
- **三 user story 共用同一寫入路徑（優先級＝價值順序、非可拆分交付順序）**：US1（原子留稽核）/ US2（redact）/ US3（0-rows）皆繞 `sys_user soft_delete` 一條路徑；US1 接線在編譯期呼叫 US2 的 redact（`audit_json`），故 US2 的 redact 實作為 US1 正確 proof 的前置。屬 cohesive infra feature 的刻意耦合（非缺陷）；實作以同一 implementer 連續處理（見 [tasks.md](./tasks.md) Dependencies），各 story 仍各有獨立可驗的性質（US1 原子性 / US2 遮蔽 / US3 no-op）。
- **操作者/追蹤情境欄位現為空**：本階段尚無認證與請求中介層（Phase 3 才有），示範以系統動作（操作者為空）寫入；欄位預留以供日後填。
- **enforcement 的建置期 lint（防 facade 內寫入漏配稽核）留 follow-up**：本階段以統一寫入入口的結構綁定 + 文件慣例保證；可靠的 grep 規則待 Phase 3+ 多寫入路徑時連同 rollout 立。
- **兩段式 commit**：本 feature 動 rust-api worktree（稽核表 / 稽核模組 / 既有軟刪路徑），依 [CLAUDE.md §4.1](../../CLAUDE.md) 走兩段式 commit（與 010 outer-only 不同）。

### 不在 scope

HTTP 請求/回應稽核中介層；新增/更新/還原 操作的真實接線（僅定義操作類型 + 軟刪 user 示範）；其他資料實體的稽核 rollout；防「漏配稽核」的建置期 lint；操作者/Casbin 真值（Phase 3）。
