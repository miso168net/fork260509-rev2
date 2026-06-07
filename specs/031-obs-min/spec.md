# Feature Specification: Observability — Minimal (Log-Only)

**Feature Branch**: `031-obs-min`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "@docs/superpowers/031-obs-min.md" — Phase 6 觀察性第一刀:**純 log 觀察**（集中式結構化 log 查詢 + 跨服務 request 關聯識別碼、對接審計記錄）。opt-in 維運堆疊、不隨一般服務啟動、不改任何應用行為。metrics / dashboards / alerting 明確排除為後續 feature。設計來源見 brainstorm spec-design（5 決策已拍板）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 維運者從單一入口查全 stack 結構化 log (Priority: P1) 🎯 MVP

身為維護此部署的維運者（人類或自動化），當任一服務出現請求異常或 bug 時，我需要從**單一查詢入口**查到部署中所有服務的結構化 log，而不必逐一登入各容器用 `docker logs` 比對時間戳。

**Why this priority**: log 是觀察性的最低共識基礎;對日常 debug、incident response、audit forensic 都是第一入口。先把「所有服務的 log 集中且可查」這層做起來，後續的關聯（US2）與 metrics（後續 feature）才有基礎。即使只有這一層、也已比逐容器 `docker logs` 有實質價值 → 可獨立交付的 MVP。

**Independent Test**: 啟用此觀察性堆疊後，對部署打一個請求 → 在集中查詢入口依「服務」過濾、查過去數分鐘 → 看到該服務的結構化 log 記錄（含時間、層級、來源服務、訊息），且涵蓋部署中各服務（後端應用 / 反向代理 / 資料庫 / 快取 / 前端）。

**Acceptance Scenarios**:

1. **Given** 觀察性堆疊已啟用且各元件就緒，**When** 維運者對後端應用打一個請求、再到集中入口查該服務過去 1 分鐘的 log，**Then** 看到 ≥1 筆該請求相關的**結構化**（機器可解析）log 記錄，含時間 / 層級 / 來源服務 / 訊息。
2. **Given** 同上，**When** 維運者依「來源服務」過濾，**Then** 能分別查到部署中各服務的 log（後端應用 / 反向代理 / 資料庫 / 快取 / 前端），無需登入個別容器。

---

### User Story 2 - log 與審計記錄用 request 識別碼對接 (Priority: P2)

身為維運者，當我在 log 看到某次請求的異常時，我需要用一個**跨來源一致的 per-request 識別碼**，把該筆 log 直接對接到這次請求所寫入的審計記錄 —— 不必靠時間戳猜測對應關係。

**Why this priority**: 這是集中 log 真正比「逐容器 `docker logs`」強的核心價值 —— 從一筆 log 一步跳到對應的審計列（誰、何時、做了什麼、結果）。建立在 US1 之上、可獨立驗。

**Independent Test**: 在 log 流動的前提下，對部署打一個**已認證的寫入請求** → 在集中入口找到該請求的 log 記錄、讀出其 request 識別碼 → 用同一識別碼在審計記錄中查到對應列（兩者識別碼相同）。

**Acceptance Scenarios**:

1. **Given** 觀察性堆疊已啟用，**When** 維運者對後端應用打一個已認證的寫入請求、查該請求的 log，**Then** 該 log 記錄含一個 per-request 識別碼，且其值等於該請求寫入審計記錄所用的識別碼。
2. **Given** 請求經反向代理進入，**When** 維運者查該請求在「反向代理」與「後端應用」兩個來源的 log，**Then** 兩者帶**相同**的 per-request 識別碼（跨服務一致）。

---

### User Story 3 - 觀察性堆疊為 opt-in、不干擾正常服務 (Priority: P3)

身為維運者，我需要這套觀察性堆疊是**明確啟用才運行**的維運元件 —— 一般啟動應用服務時它不應隨之啟動，且啟用與否都**不改變**應用對最終使用者的任何可觀察行為。

**Why this priority**: 觀察性是輔助維運能力、非業務功能;它必須能被獨立啟停、且零侵入正常服務（不增加對外行為風險）。確保它不會在不需要時佔資源、也不會意外改變應用行為。

**Independent Test**: 以一般方式啟動應用服務（未啟用觀察性）→ 確認觀察性元件**未**運行;再啟用觀察性 → 確認應用對外行為（回應碼 / 回應形狀）與啟用前**完全相同**。

**Acceptance Scenarios**:

1. **Given** 一份部署，**When** 以一般方式啟動應用服務（未明確啟用觀察性），**Then** 觀察性元件**不**隨之啟動。
2. **Given** 觀察性堆疊已啟用，**When** 比對啟用前後同一組請求的回應，**Then** 回應碼與回應形狀 0 變化（應用行為零侵入）。

---

### Edge Cases

- **觀察性查詢入口暫時不可達**：應用服務照常運作、不受影響（觀察性為旁路、非請求路徑的依賴）。
- **某服務短時間無 log 產出**：查詢回空集、不報錯（正常）。
- **log 採集落後/堆積**：屬盡力而為的旁路採集;不得反壓或拖慢應用請求。
- **請求未帶外部識別碼**：系統自行產生一個 per-request 識別碼（不依賴呼叫端提供）。
- **未認證 / 公開請求**：仍可有 log，但無對應審計列（審計只記已認證請求）—— log↔審計對接僅適用已認證請求。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 提供一個**集中式結構化 log 查詢入口**，涵蓋部署中所有服務（後端應用 / 反向代理 / 資料庫 / 快取 / 前端）的 log。
- **FR-002**: 進入該入口的 log MUST 為**結構化（機器可解析）**格式，至少含時間、層級、來源服務、訊息。
- **FR-003**: 後端應用在每個請求期間產出的 log MUST 帶一個 **per-request 關聯識別碼**，其值與該請求寫入審計記錄所用的識別碼**相同**。
- **FR-004**: 反向代理的 access log MUST 以結構化格式進入該入口，並帶與後端應用**同源、同值**的 per-request 識別碼。
- **FR-005**: 該查詢入口 MUST 支援依**來源服務 / 時間 / per-request 識別碼**過濾查詢。
- **FR-006**: 此觀察性堆疊 MUST NOT 隨一般應用服務啟動;它是 **opt-in 維運元件**、僅在被明確啟用時運行。
- **FR-007**: 啟用此堆疊 MUST NOT 改變任何**應用對外可觀察行為**（回應碼 / 回應形狀 / 業務邏輯 / wire 契約零變）。
- **FR-008**: log 採集 MUST 為**盡力而為的旁路**:採集落後或入口不可達 MUST NOT 反壓、拖慢或中斷應用請求。
- **FR-009**: 此觀察性堆疊 MUST 能在**正式部署產物**中運行（不只開發環境），且此可運行性須經正式產物驗證。
- **FR-010**: log 保留 MUST **有界**（不無限成長）;預設短期保留即可（保留長度可為部署層設定）。
- **FR-011**: 請求未帶外部 per-request 識別碼時，系統 MUST 自行產生一個（不依賴呼叫端提供）。

### Key Entities *(include if feature involves data)*

- **結構化 log 記錄（log entry）**：一筆機器可解析的 log;關鍵屬性 = 時間、層級、**來源服務**、**per-request 識別碼**、訊息。彼此可依來源服務 / 時間 / 識別碼分群查詢。
- **per-request 關聯識別碼（request id）**：每個請求一個;由後端應用與反向代理**共用同值**，並等於該請求審計記錄的識別碼。請求未帶時系統自生。它是 log 之間、以及 log 與審計記錄之間的對接鍵。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 維運者能從**單一入口**查到部署中任一服務過去數分鐘的結構化 log，**不需**登入個別容器（覆蓋部署的全部常駐服務）。
- **SC-002**: 對一個已認證的寫入請求，維運者能用 log 中的 per-request 識別碼，在 **≤ 2 步**內對接到該請求的審計記錄（兩者識別碼相同）。
- **SC-003**: 一般啟動（未明確啟用觀察性）時，觀察性元件**100% 不運行**。
- **SC-004**: 啟用觀察性前後，應用對外行為（回應碼 / 回應形狀）**0 變化**。
- **SC-005**: 觀察性查詢入口在**正式部署產物**中可運行（經正式產物啟動驗證）。
- **SC-006**: 觀察性入口不可達時，應用請求成功率與延遲**不受影響**（旁路、非請求路徑依賴）。

## Assumptions

- 觀察性堆疊由維運者**明確啟用**（opt-in）;部署**不含**自動啟動的觀察性元件、也**不含** in-stack 排程或常駐 metrics（純 log）。
- 範圍**僅限 log 觀察**;**metrics / 儀表板（dashboards）/ alerting / 各服務 exporter 明確排除**為後續 feature（obs-full / dashboard provisioning）。
- 後端應用**已輸出結構化 log**、且**已有 per-request 識別碼**的內部 plumbing（複用既有、不新建識別碼機制）。
- log 保留為**短期**（開發 / 個人 workspace 無長期歸檔需求);長期歸檔屬後續。
- 觀察性查詢入口是**獨立的維運 UI**（非整合進既有前端應用）;不改動前端應用。
- **dev 為主要查詢入口**（loopback host port）;**prod 環境的查詢入口對外暴露延後**:obs 元件在 prod 為 internal-only（無對外 host port），prod 維運者經 `docker compose exec` / port-forward 達查詢入口,「對外暴露（經反向代理 + TLS）」留後續 obs-full / security pass。故 SC-001「單一入口查」主要於 dev 入口驗收;prod 以「stack 可運行」（SC-005）為界。
- 不新增需編譯的後端模組單元（複用既有 log 機制）;對既有反向代理設定的調整僅限 log 輸出格式 / 去向。
