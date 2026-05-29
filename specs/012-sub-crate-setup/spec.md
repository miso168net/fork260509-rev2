# Feature Specification: sub-crate-setup

**Feature Branch**: `012-sub-crate-setup`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "@docs/superpowers/012-sub-crate-setup.md"（鋪 Casbin RBAC 的工具層地基：把授權政策儲存元件與 IP→地區解析元件從授權參考來源引入本系統、對齊本系統執行環境、並以真實基礎設施證明其能運作；授權政策表經系統既有自動 schema 機制建立）

**Phase 0 brainstorm source**: [`docs/superpowers/012-sub-crate-setup.md`](../../docs/superpowers/012-sub-crate-setup.md)

---

## Clarifications

### Session 2026-05-29

- Phase 0 brainstorm 已凍結全部設計決策（D1 範圍＝只引入 2 個工具元件〔授權政策儲存 adapter、IP→地區解析〕、enforcement 中介層重寫移後續階段 / D2 驗收＝兩元件皆對真實基礎設施做活體 smoke、非僅編譯 / D3 授權政策表走系統既有自動 schema 機制建立、本階段採原生語意不套軟刪/稽核），見 [`docs/superpowers/012-sub-crate-setup.md`](../../docs/superpowers/012-sub-crate-setup.md)。本 feature 忠實落地，非自由設計。spec 0 [NEEDS CLARIFICATION]。
- 對齊 [DESIGN §11.6 sub-crate 拍板](../../docs/INTEGRATION-DESIGN.md)（本次 brainstorm 重定位：enforcement 中介層重寫 + 受管政策層〔軟刪可復原 / 不可刪保護政策 / 變更稽核 / 統一 CRUD〕整批移後續階段，本 feature 只引入兩個工具元件）。
- 不變更 007 既有約束（系統啟動不自行套 schema）、不變更 009 資料存取邊界、不引入 enforcement 接線。
- 兩個工具元件源自授權參考來源（治理例外、明文授權引入），其出處須被記錄；本 feature 不為系統的新設計掃描參考來源。
- `/speckit-clarify` 正式掃描（11 taxonomy 類別）結果：**全部 Clear / N-A、0 提問**。Interaction&UX 為 N/A（後端 infra、無 UI）；Non-Functional 的 observability 屬後續階段（enforcement 中介層）、明確 out-of-scope，無延遲/吞吐目標屬 infra proof reasonable-default；Domain（casbin_rule stock schema 欄位）與 Constraints（執行環境/版本對齊）為**刻意延 plan/research 階段**的決策（非 spec-level 歧義），版本對齊依 [CLAUDE.md §6](../../CLAUDE.md) 於 plan surface 選項。無需正式 clarify，可直接進 `/speckit-plan`。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 授權政策可被可靠地儲存與重載（活體證明）（Priority: P1）🎯 MVP

系統具備一個以主要關聯式資料庫為後端的「授權政策儲存」能力：可寫入一筆授權政策、之後能完整重載回來。此能力在**真實資料庫**上被證明真的能運作（不只是「能編譯」）。

**Why this priority**：這是本 feature 的核心價值與後續階段（認證 + 權限管控）的地基。授權政策儲存若不能在本系統的執行環境下對真實資料庫正確讀寫，後續所有 RBAC 功能都無從建立。「活體證明」是必要的，因為此元件引入時需對齊本系統的執行環境，這類對齊常「編得過、跑才爆」。

**Independent Test**：從乾淨環境拉起系統（schema 經自動機制套好），透過此政策儲存寫入一筆政策、再重新載入，即可看到該政策仍在、且資料庫對應表確有該列。即驗。

**Acceptance Scenarios**：

1. **Given** 授權政策表已備（經自動 schema 機制建立），**When** 透過政策儲存寫入一筆政策並儲存、再重新載入，**Then** 該政策出現在重載結果中、且資料庫對應表存在該列
2. **Given** 政策儲存元件源自授權參考來源、需對齊本系統執行環境，**When** 在本系統執行環境下執行上述讀寫，**Then** 不因執行環境/版本不一致而失敗（活體證明對齊成功）

---

### User Story 2 — 由 IP 解析地理地區（Priority: P2）

系統具備一個「由 IP 位址解析地理地區」的能力，供後續階段（如登入來源地、稽核來源位址）使用。此能力以實際資料檔解析一個已知 IP、回傳對應地區。

**Why this priority**：此為工具性能力、後續階段才有真正消費者；但與政策儲存同屬本次引入的工具層地基，一併備齊並證明可用。

**Independent Test**：以引入的資料檔解析一個已知 IP（如 `1.2.4.8`），確認回傳的地區字串非空、格式合理。即驗。

**Acceptance Scenarios**：

1. **Given** IP→地區解析能力與其資料檔已引入，**When** 解析一個已知 IP，**Then** 回傳非空、格式合理的地區字串

---

### User Story 3 — 授權政策表經系統標準 schema 機制建立（Priority: P3）

授權政策表由系統**既有的自動 schema 套用機制**建立（與所有其他資料表一致、在 schema 歷史中可見），而非由元件臨時自建於系統 schema 機制之外。

**Why this priority**：維持「全系統 schema 一致經自動機制管理」的紀律（與既有資料表同軌），並守住「系統啟動不自行套 schema」的既有約束。屬正確性/一致性收尾。

**Independent Test**：從乾淨環境拉起系統，確認授權政策表已存在（無需手動步驟）、且系統啟動本身未自行套用 schema。即驗。

**Acceptance Scenarios**：

1. **Given** 一個乾淨環境，**When** 依標準方式拉起系統，**Then** 授權政策表已由自動 schema 機制建立、可供政策儲存讀寫
2. **Given** 本 feature 已套用，**When** 檢視系統啟動行為，**Then** 系統啟動未自行套用 schema（既有約束未被破壞）

---

### Edge Cases

- **執行環境/版本不一致**：引入的政策儲存元件原本對齊不同執行環境 → 必須對齊本系統執行環境，否則讀寫會在執行期失敗（US1 #2 活體證明涵蓋）。
- **政策表尚未建立即讀寫**：政策表須先經自動 schema 機制建立，政策儲存才能運作（US3 前置 US1）。
- **IP 資料檔缺失/路徑錯誤**：IP→地區解析需正確的資料檔與其存取路徑（US2 涵蓋）。
- **本階段無消費者**：enforcement 中介層與政策變更入口屬後續階段；本 feature 兩元件無正式呼叫端，故以直接 round-trip / 解析的活體 smoke 證明，而非經 enforcement 端到端。

## Requirements *(mandatory)*

### Functional Requirements

**授權政策儲存（核心地基）**

- **FR-001**：系統 MUST 提供一個以主要關聯式資料庫為後端的授權政策儲存能力，支援寫入政策並完整重載。
- **FR-002**：授權政策儲存 MUST 在本系統的執行環境下正確運作（引入時對齊本系統執行環境），不得因執行環境/版本不一致而於執行期失敗。
- **FR-003**：系統 MUST 以對真實資料庫的活體驗證證明政策儲存可運作 —— 至少 round-trip 一筆政策（寫入 → 重載 → 確認存在、對應表有列），而非僅以「能編譯」為憑。

**IP→地區解析**

- **FR-004**：系統 MUST 提供由 IP 位址解析地理地區的能力，並以解析一個已知 IP 回傳非空地區字串為活體驗證。

**授權政策表 + 既有契約守恆**

- **FR-005**：授權政策表 MUST 經系統既有的自動 schema 套用機制建立（與其他資料表一致、在 schema 歷史中可見），MUST NOT 由元件臨時自建於系統 schema 機制之外；且 MUST NOT 使系統啟動行為改為自行套用 schema（守既有約束）。
- **FR-006**：本 feature 的授權政策表 MUST 採其原生語意，本階段 MUST NOT 對其套用軟刪除/稽核機制（受管治理屬後續階段）。

**範圍邊界（不做）/ 治理**

- **FR-007**：本 feature MUST NOT 引入或重寫 enforcement 中介層、MUST NOT 接任何 enforcement 或受保護路由、MUST NOT 對授權政策加入軟刪除/不可刪保護/變更稽核/統一 CRUD（皆屬後續階段）；MUST NOT 破壞既有測試、資料存取邊界檢查、健康檢查行為。
- **FR-008**：兩個工具元件 MUST 自授權參考來源引入（治理例外、明文授權），其來源出處 MUST 被記錄；本 feature MUST NOT 為系統的新設計掃描參考來源（僅執行被授權的引入）。

### Key Entities

- **授權政策記錄（authorization policy record）**：授權政策的儲存列。屬性：政策類型 + 規則值（多欄）。由系統自動 schema 機制建立；本 feature 採原生語意（不套軟刪除/稽核）。後續階段的受管治理（軟刪可復原 / 不可刪保護 / 變更稽核）不在本 feature。
- **IP→地區解析資料檔（既有外部資料）**：IP→地區解析所依賴的資料檔；隨解析能力一併引入、設定其存取路徑。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：一筆透過政策儲存寫入的授權政策，可被重新載入且確實存在（對真實資料庫 round-trip 成功）（可驗）。
- **SC-002**：一個已知 IP 可被解析為非空、格式合理的地理地區字串（可驗）。
- **SC-003**：依標準方式拉起系統後，授權政策表已由自動 schema 機制建立（無手動步驟）、且系統啟動未自行套用 schema（可驗）。
- **SC-004**：套用本 feature 後，既有系統行為（健康檢查、既有測試、資料存取邊界檢查）不被破壞（可驗）。

## Assumptions

- **設計決策已凍結**：brainstorm 階段 user 親決 D1-D3（2026-05-29），見 [`docs/superpowers/012-sub-crate-setup.md`](../../docs/superpowers/012-sub-crate-setup.md)；本 feature 忠實落地，非自由設計。
- **授權參考來源本機可得且明文授權引入**：兩個工具元件（授權政策儲存 adapter、IP→地區解析）的參考實作本機可取，且由設計治理明文授權引入（[DESIGN §11.6](../../docs/INTEGRATION-DESIGN.md) / constitution §I.5 例外清單）；引入時記錄來源出處。
- **執行環境對齊**：引入的政策儲存元件原以不同執行環境為前提，須對齊本系統的標準執行環境（具體執行環境/版本對齊細節屬 plan 階段；本 spec 不綁技術）。
- **無消費者、以活體 smoke 證明**：本階段尚無 enforcement 中介層與政策變更入口（屬後續階段），兩元件無正式呼叫端，故以直接 round-trip（政策儲存）/ 直接解析（IP→地區）的活體 smoke 證明可用。
- **沿用既有自動 schema 機制與啟動約束**：授權政策表經既有「拉起系統時自動套用」機制建立；系統啟動本身不自行套用 schema（既有約束）。
- **兩段式提交**：本 feature 動到後端原始碼工作區（新增兩個元件 + 一個建表 schema 變更），依工作區慣例走兩段式提交。

### 不在 scope

enforcement 中介層的引入/重寫；任何 enforcement 接線、受保護路由、enforcement 模型正式配置；授權政策的軟刪除可復原 / 不可刪保護 / 變更稽核 / 統一 CRUD（受管政策層，後續階段）；政策種子資料；政策失效通知通道；授權政策表加入軟刪除/保護等欄位（後續階段連同受管政策層一起做）。
