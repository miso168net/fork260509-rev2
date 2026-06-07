# Feature Specification: Observability — Full (Metrics)

**Feature Branch**: `032-obs-full`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "@docs/superpowers/032-obs-full.md" — Phase 6 觀察性第二刀：**metrics 觀察**（集中式 metrics 查詢入口 + 後端應用請求/授權 metrics + 基礎設施 metrics + 短命 job metrics + 關鍵失效 baseline 告警規則）。接續 031 obs-min 的 log 半邊、補 metrics 半邊，把觀察性補成「log + metrics」完整。opt-in 維運堆疊、不隨一般服務啟動、不改任何應用行為。儀表板（dashboards）/ 告警通知管道（送信）明確排除為後續 feature。設計來源見 brainstorm spec-design（9 決策已拍板）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 維運者從單一入口查後端應用 metrics（Priority: P1）🎯 MVP

身為維護此部署的維運者（人類或自動化），當後端應用出現效能下降、錯誤率升高或授權異常時，我需要從**單一查詢入口**查到後端應用的請求量、延遲、錯誤率，以及**授權決策（放行 / 拒絕）**的計量，而不必逐一登入容器翻 log 或自行統計。

**Why this priority**: 後端應用的請求/錯誤/延遲是效能與健康度觀察的核心；授權 allow/deny 計量更是安全可觀察性的關鍵（這層自設計初期就被列為「待觀察堆疊就位才做」的 parked 項）。即使只有這一層、也已能回答「應用慢不慢、錯不錯、誰被擋」這類第一線問題 → 可獨立交付的 MVP。

**Independent Test**: 啟用 metrics 堆疊後，對後端應用打一批請求（含會被放行與會被拒絕的）→ 在集中查詢入口查過去數分鐘 → 看到依**路由 / 狀態**分群的請求量與延遲，且**授權放行與拒絕的計量分別隨對應請求增長**。

**Acceptance Scenarios**:

1. **Given** metrics 堆疊已啟用，**When** 維運者對後端應用打數個請求、再到查詢入口查該應用過去 1 分鐘的請求計量，**Then** 看到依路由與回應狀態分群的請求數與延遲分佈。
2. **Given** 同上，**When** 維運者打一個會被授權放行的請求與一個會被拒絕的請求、再查授權決策計量，**Then** 放行與拒絕兩個計量分別增長且可區分。

---

### User Story 2 - 維運者查基礎設施與維運 job 的 metrics（Priority: P2）

身為維運者，當我懷疑問題出在資料庫或快取，或想確認週期性維運 job（如過期資料清理）是否正常跑，我需要從同一查詢入口查到**基礎設施（資料庫 / 快取）的狀態與效能 metrics**，以及**短命維運 job 推送的 metrics**（job 結束後仍可查）。

**Why this priority**: 後端應用的指標（US1）常需對照基礎設施狀態才能定位根因（如延遲高是 DB 慢還是 app 慢）；維運 job 的可觀察性確保「清理有跑、清了多少」可查證。建立在 US1 的查詢入口之上、可獨立驗。

**Independent Test**: 啟用 metrics 堆疊 → 查詢入口查到資料庫 / 快取的狀態 metric；手動觸發一次清理 job → job 結束後其推送的 metric（如最後成功時間 / 清理筆數）在查詢入口仍可見。

**Acceptance Scenarios**:

1. **Given** metrics 堆疊已啟用，**When** 維運者查資料庫 / 快取的 metric，**Then** 看到該基礎設施的連線 / 狀態 / 基本效能 metric。
2. **Given** metrics 堆疊已啟用，**When** 維運者觸發一次短命維運 job、待其結束後查該 job 的 metric，**Then** 看到該次執行推送的 metric（即使 job 已退出）。

---

### User Story 3 - 維運者對關鍵失效有 baseline 自動告警規則（Priority: P3）

身為維運者，我需要對**關鍵失效**（後端應用不可用、錯誤率過高、基礎設施採集不可達）有一組**隨部署自動就緒的 baseline 告警規則** —— 不必每次部署手動在 UI 建規則 —— 讓問題在我主動查詢前就被標記為觸發狀態。

**Why this priority**: 告警把觀察性從「被動查」推進到「主動知」。建立在 US1/US2 的 metrics 之上;規則的「可重現 provision」是維運可信度的基礎。通知管道（送信）本 feature 不做（見 Assumptions）。

**Independent Test**: 啟用 metrics 堆疊 → 查詢入口的告警規則清單**非空**且含 baseline 規則；製造一個關鍵失效（如停掉後端應用）→ 對應告警規則進入觸發 / 異常狀態。

**Acceptance Scenarios**:

1. **Given** metrics 堆疊已啟用，**When** 維運者查告警規則清單，**Then** 看到隨部署 provision 的 baseline 規則（後端應用不可用 / 高錯誤率 / 基礎設施採集不可達）。
2. **Given** baseline 規則已就緒，**When** 後端應用變為不可用，**Then** 對應的「應用不可用」告警規則進入觸發狀態。

---

### User Story 4 - metrics 堆疊為 opt-in、不干擾正常服務（Priority: P3）

身為維運者，我需要這套 metrics 堆疊是**明確啟用才運行**的維運元件 —— 一般啟動應用服務時它不應隨之啟動，且啟用與否都**不改變**應用對最終使用者的任何可觀察行為，採集落後或入口不可達也不得拖慢應用。

**Why this priority**: metrics 是輔助維運能力、非業務功能;必須能獨立啟停、零侵入正常服務、且為盡力而為旁路（不在請求關鍵路徑上反壓）。與 031 obs-min 的 opt-in / 零侵入紀律一致。

**Independent Test**: 以一般方式啟動應用服務（未啟用 metrics）→ 確認 metrics 元件**未**運行;再啟用 metrics → 確認應用對外行為（回應碼 / 回應形狀）與啟用前**完全相同**;停掉 metrics 採集入口 → 應用請求仍成功。

**Acceptance Scenarios**:

1. **Given** 一份部署，**When** 以一般方式啟動應用服務（未明確啟用 metrics），**Then** metrics 元件**不**隨之啟動。
2. **Given** metrics 堆疊已啟用，**When** 比對啟用前後同一組請求的回應，**Then** 回應碼與回應形狀 0 變化（應用行為零侵入）。
3. **Given** metrics 堆疊已啟用，**When** metrics 採集入口暫時不可達，**Then** 應用請求照常成功、延遲不受影響。

---

### Edge Cases

- **metrics 查詢入口暫時不可達**：應用服務照常運作、不受影響（metrics 為旁路、非請求路徑依賴）。
- **某採集目標短時間無資料**：查詢回空集 / 該目標標記為 down，不報錯、不影響其他目標。
- **採集落後 / 目標暫時抓不到**：屬盡力而為旁路採集;不得反壓或拖慢應用請求。
- **短命 job 已退出**：其執行期間推送的 metric 仍可查（不因 job 容器消失而遺失該次數據）。
- **後端應用 metrics 入口被外部存取嘗試**：該入口不對外暴露（僅內部採集可達）;不提供未授權的外部讀取面。
- **高基數風險**：metrics 的分群維度（label）須有界（避免以請求唯一識別碼等高基數值分群導致儲存爆量）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 提供一個**集中式 metrics 查詢入口**，涵蓋後端應用的**請求量、延遲、錯誤率**（可依路由 / 回應狀態分群）。
- **FR-002**: 後端應用 MUST 暴露**授權決策（放行 / 拒絕）**的計量，且可依決策結果分群查詢。
- **FR-003**: 系統 MUST 提供**基礎設施（資料庫 / 快取）**的狀態與基本效能 metrics，進入同一查詢入口。
- **FR-004**: 系統 MUST 能接收**短命維運 job** 推送的 metrics，且該 metrics 在 job 結束後仍可查詢。
- **FR-005**: 系統 MUST 對**關鍵失效**（後端應用不可用 / 錯誤率過高 / 基礎設施採集不可達）提供一組 **baseline 告警規則**，且規則 MUST 隨部署**可重現地 provision**（不依賴手動 UI 設定）。
- **FR-006**: 此 metrics 堆疊 MUST NOT 隨一般應用服務啟動;它是 **opt-in 維運元件**、僅在被明確啟用時運行，且**與既有 log 觀察堆疊可獨立啟用**。
- **FR-007**: 啟用此堆疊 MUST NOT 改變任何**應用對外可觀察行為**（回應碼 / 回應形狀 / 業務邏輯 / wire 契約零變）。
- **FR-008**: metrics 採集 MUST 為**盡力而為的旁路**:採集落後或採集 / 查詢入口不可達 MUST NOT 反壓、拖慢或中斷應用請求。
- **FR-009**: 此 metrics 堆疊 MUST 能在**正式部署產物**中運行（不只開發環境），且此可運行性須經正式產物驗證。
- **FR-010**: metrics 儲存保留 MUST **有界**（不無限成長）;預設短期保留即可（保留長度可為部署層設定）。
- **FR-011**: 後端應用的 metrics 暴露入口 MUST NOT **對外暴露**（僅供部署內部採集可達、不經對外反向代理）。
- **FR-012**: metrics 分群維度 MUST **有界基數**（不得以請求唯一識別碼 / 操作者 / 完整路徑等無界值作為分群維度）。

### Key Entities *(include if feature involves data)*

- **metrics 樣本（metric sample）**：一筆隨時間記錄的量測;關鍵屬性 = 名稱、**分群維度（label，有界基數）**、值、時間。
- **授權決策計量（authorization decision metric）**：後端應用每次授權判定後遞增的計量;依**決策結果（放行 / 拒絕）**分群。
- **基礎設施 metric**：資料庫 / 快取的狀態與效能量測（由各自的採集元件提供）。
- **短命 job 推送 metric**：維運 job 執行時推送、job 退出後仍可查的量測（如最後成功時間 / 處理筆數）。
- **告警規則（alert rule）**：一條對 metric 條件的判定 + 嚴重度;隨部署可重現 provision。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 維運者能從**單一入口**查到後端應用過去數分鐘的請求量 / 延遲 / 錯誤率（依路由 / 狀態分群），**不需**登入個別容器。
- **SC-002**: 對一批已知會被放行與會被拒絕的請求，維運者能在查詢入口看到**放行與拒絕計量分別增長**且可區分。
- **SC-003**: 維運者能查到**資料庫與快取**的狀態 metric（各自採集目標為 up）。
- **SC-004**: 一次短命維運 job 跑完後，其執行推送的 metric 在查詢入口**仍可見**（job 已退出）。
- **SC-005**: baseline 告警規則隨部署**自動就緒**（規則清單非空）;關鍵失效發生時對應規則進入觸發狀態。
- **SC-006**: 一般啟動（未明確啟用 metrics）時，metrics 元件**100% 不運行**;且啟用 metrics **不需**同時啟用 log 觀察堆疊（兩者獨立）。
- **SC-007**: 啟用 metrics 前後，應用對外行為（回應碼 / 回應形狀）**0 變化**。
- **SC-008**: metrics 採集 / 查詢入口不可達時，應用請求成功率與延遲**不受影響**（旁路、非請求路徑依賴）。
- **SC-009**: metrics 堆疊在**正式部署產物**中可運行（經正式產物啟動驗證）;後端應用 metrics 入口在正式部署中**不對外暴露**。

## Assumptions

- metrics 堆疊由維運者**明確啟用**（opt-in）;部署**不含**自動啟動的 metrics 元件、也**不含**改變應用行為的埋點（埋點僅新增唯讀計量、不改業務邏輯 / wire）。
- 範圍**僅限 metrics pipeline + baseline 告警規則**;**儀表板（dashboards）/ 告警通知管道（送信，如 email / webhook）/ 分散式追蹤（tracing）明確排除**為後續 feature。
- 後端應用**已有授權 enforce 機制**（複用既有放行 / 拒絕判定點，新增唯讀計量）;**已有短命維運 job**（複用既有 job，新增推送其執行 metric）。
- metrics 保留為**短期**（dev / 個人 workspace 無長期歸檔需求）;長期歸檔屬後續。
- metrics 查詢入口**複用既有觀察 UI**（031 obs-min 已建的維運 UI，新增 metrics 資料源）;不改動前端應用。
- **dev 為主要查詢入口**（loopback host port）;**prod 環境 metrics 元件 internal-only**（無對外 host port），prod 維運者經部署內部存取（exec / port-forward）;「對外暴露（經反向代理 + TLS）」與「採集端認證硬化」留後續 security pass。
- 不新增需編譯的後端**模組單元**（複用既有後端應用、僅新增 metrics 暴露與計量;不新增可獨立部署的後端服務單元）。
