# Feature Specification: response-envelope

**Feature Branch**: `008-response-envelope`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "用這份文檔 docs/superpowers/008-response-envelope.md"（rust-api 統一回應信封契約:成功信封 + 錯誤信封 + 完整業務 code 詞彙 + 不存在 path 回信封）

**Phase 0 brainstorm source**: [`docs/superpowers/008-response-envelope.md`](../../docs/superpowers/008-response-envelope.md)

---

## Clarifications

### Session 2026-05-29

- 全 taxonomy 掃描:**無 spec-level critical ambiguity 需正式 clarify**。Phase 0 brainstorm 已凍結全部 5 項設計決策(交付邊界＝信封型別+404 fallback / 完整業務 code 詞彙一次定義 / 錯誤類別隨 feature 長、本 feature 僅 NotFound+Internal / 內部錯誤 code＝`5000` 屬 rev2 自訂 5xxx / 不做 camelCase 轉換機制)。spec 0 [NEEDS CLARIFICATION]。
- 回應信封形狀與業務 code 集為 **mock 實機 capture 的 wire 契約事實**(權威:[DESIGN §3.2 / §3.3](../../docs/INTEGRATION-DESIGN.md) + [MOCK-COVERAGE-AUDIT §4.1](../../docs/MOCK-COVERAGE-AUDIT.md)),非本 feature 自由設計 —— 本 feature 只負責在 rust-api 側忠實實作該契約。
- `/speckit-clarify` 正式掃描(11 taxonomy 類別)結果:**全部 Clear、0 提問**。無需正式 clarify,可直接進 `/speckit-plan`。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 統一回應信封契約立定（Priority: P1）🎯 MVP

rust-api 提供一個**統一的回應信封**:每個回應(無論成功或錯誤)都是固定三欄 `{data, code, msg}`(此順序),`code` 為字串(如 `"0000"`)、**無 `success` 布林欄**。同時一次定義**完整的業務 code 詞彙**(對齊 base-web 既定集)。如此 base-web 的回應處理層能以單一、可預測的格式解析所有 rust-api 回應,Phase 3+ 每個 endpoint 都建立在這個契約上。

**Why this priority**:這是本 feature 的核心價值與 MVP —— 沒有統一信封,後續每個 endpoint 各自決定回應形狀,base-web 無法統一處理、且與 mock 契約漂移。信封契約是 Phase 3+ 所有 endpoint 的地基。

**Independent Test**:對信封序列化跑單元測試 —— 成功信封恰為 `{"data":..,"code":"0000","msg":..}`(斷言欄位順序 data→code→msg、`code` 是 JSON 字串非數字、無 `success` 鍵);完整業務 code 詞彙每一項對應正確 code 字串。即驗,不需任何業務 endpoint。

**Acceptance Scenarios**:

1. **Given** 一個成功回應的資料,**When** 包進回應信封並序列化,**Then** 輸出恰為三欄 `{data, code, msg}`(此順序)、`code` = `"0000"`(字串)、無 `success` 欄
2. **Given** 業務 code 詞彙,**When** 取任一 code(`0000`/`1000`/`2222`/`3333`/`9998`/`9999`/`7777`/`7778`/`8888`/`8889`/`4040`/`5000`),**Then** 回傳對齊 mock 契約的正確 code 字串
3. **Given** 一個空集合資料,**When** 包進信封,**Then** `data` 為 `[]`(非 `null`、非缺欄)

---

### User Story 2 — 不存在的路徑回標準信封（Priority: P2）

當 client 請求一個不存在的 API 路徑時,rust-api 回傳標準錯誤信封 `{data:null, code:"4040", msg:"接口不存在"}` 並帶 HTTP 404,而非裸的 / 空的 404。這是回應信封契約的**第一個真實 endpoint 消費者**,證明信封不只是型別、而是真的接到 HTTP 層。

**Why this priority**:給信封一個可實機驗證(curl)的消費者,確保「信封 → HTTP 回應」這條路是通的;且 `4040`「接口不存在」本就在業務 code 詞彙內、有明確歸屬。P2(契約立定是 P1、第一個 live 消費者是緊接的驗證)。

**Independent Test**:`curl -i` 打一個不存在的路徑 → 收到 HTTP 404 + body `{"data":null,"code":"4040","msg":"接口不存在"}`。即驗。

**Acceptance Scenarios**:

1. **Given** rust-api 運行中,**When** 請求一個未註冊的路徑(如 `/nonexistent`),**Then** 回 HTTP 404 + 標準信封 `{data:null, code:"4040", msg:"接口不存在"}`
2. **Given** rust-api 運行中,**When** 請求既有的 `/health`,**Then** 仍回純文字 `ok`(不受信封影響、不被包裝)

---

### User Story 3 — 非預期內部錯誤也回標準信封（Priority: P3）

當 rust-api 發生非預期內部錯誤時,回傳標準錯誤信封 `{data:null, code:"5000", msg:"服务器内部错误"}` 並帶 HTTP 500,而非洩漏堆疊或裸 500。`5000` 落在 rev2 自訂 `5xxx` 空間,作為 infra/server-error sentinel(與 `5001-5999` 業務驗證錯誤區隔)。

**Why this priority**:確保錯誤路徑也走信封、不漏接;但本 feature 尚無會失敗的業務 handler,故此為「先備好內部錯誤映射」的收尾正確性。P3。

**Independent Test**:對內部錯誤映射跑單元測試 → 產生 HTTP 500 + body `{data:null, code:"5000", msg:"服务器内部错误"}`。即驗。

**Acceptance Scenarios**:

1. **Given** 一個內部錯誤,**When** 映射為回應,**Then** 回 HTTP 500 + 標準信封 `{data:null, code:"5000", msg}`

---

### Edge Cases

- **空集合 vs null**:集合型 `data` 用空 `[]` 表達「無資料」,不用 `null`、不省略欄位(統一,base-web 不需區分 null/undefined)。
- **`code` 型別**:必為字串 `"0000"`,**絕不可**序列化為數字 `0`(base-web 以字串比對 code)。
- **業務錯誤 vs 非 200**:業務錯誤(Phase 3+)HTTP 仍 200、以信封內 `code` 標示;只有 path 不存在(404)/ 非預期內部錯誤(500)才非 200。
- **refresh critical 紀律(未來)**:業務 code 詞彙含 `3333/9998/9999`(token 過期無效);`/auth/refreshToken`(Phase 5)實作時絕不可回這三者(否則 base-web 進 dead loop)。本 feature 只定義詞彙、無此 endpoint。

---

## Requirements *(mandatory)*

### Functional Requirements

**回應信封契約**

- **FR-001**:每個經信封的回應 MUST 為固定三欄 `{data, code, msg}`,序列化順序為 `data` → `code` → `msg`,且 MUST NOT 含 `success` 布林欄
- **FR-002**:`code` MUST 序列化為字串(如 `"0000"`),MUST NOT 為數字
- **FR-003**:成功回應 MUST 帶 `code = "0000"`、`data` 攜帶 payload;集合型空資料 MUST 為 `[]`(非 `null`、非缺欄)
- **FR-004**:系統 MUST 定義**完整業務 code 詞彙**對齊 mock 既定集(`0000` success / `1000` login 失敗 / `2222` 業務 error 範本 / `3333`·`9998`·`9999` token 過期無效 / `7777`·`7778` modal logout / `8888`·`8889` 即時 logout / `4040` path 不存在),外加 rev2 自訂 `5000`(內部錯誤 sentinel);每個 code 對應正確字串值

**錯誤回應**

- **FR-005**:請求未註冊的路徑時,系統 MUST 回標準信封 `{data:null, code:"4040", msg:"接口不存在"}` + HTTP 404
- **FR-006**:非預期內部錯誤時,系統 MUST 回標準信封 `{data:null, code:"5000", msg:"服务器内部错误"}` + HTTP 500
- **FR-007**:HTTP status 規則 —— 業務錯誤(Phase 3+)MUST HTTP 200 並以信封內 `code` 標示;只有 path 不存在 / 非預期內部錯誤 MUST 非 200(但 body 仍為標準信封)

**邊界與既有行為**

- **FR-008**:`/health` MUST 維持純文字 `ok` liveness,MUST NOT 被信封包裝
- **FR-009**(scope 邊界 / 不做):MUST NOT 實作任何業務 endpoint 或 DTO;MUST NOT 實作 camelCase 欄名轉換機制(留各 DTO 自帶,Phase 4);錯誤類別 MUST NOT 含業務錯誤(`1000/3333/8888/7777…` 的錯誤行為留 Phase 3+ 各 feature);MUST NOT 實作 pagination wrapper 或 middleware

### Key Entities *(include if feature involves data)*

- **回應信封**:統一回應外殼,三欄 `data`(payload,錯誤時 null)/ `code`(業務 code 字串)/ `msg`(訊息);成功與錯誤共用同一形狀
- **業務 code 詞彙**:對齊 mock 契約的完整 code 集合(見 FR-004),每個 code 有對應字串值與預設訊息;本 feature 全集定義、但只有 `0000`/`4040`/`5000` 有實際消費者
- **錯誤類別**:本 feature 僅「path 不存在」(→ 404/`4040`)與「非預期內部錯誤」(→ 500/`5000`)兩類;業務錯誤類別隨 Phase 3+ feature 增長

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:請求不存在的路徑回 HTTP 404 + body 恰為 `{"data":null,"code":"4040","msg":"接口不存在"}`(可 curl 實機驗)
- **SC-002**:成功信封序列化恰為三欄、順序 `data`→`code`→`msg`、`code` 為 JSON 字串、無 `success` 鍵(單元測試驗)
- **SC-003**:完整業務 code 詞彙全部可用且每項對應正確 code 字串(單元測試覆蓋全集)
- **SC-004**:非預期內部錯誤回 HTTP 500 + 信封 `code = "5000"`(單元測試驗)
- **SC-005**:`/health` 維持回純文字 `ok`、不受本 feature 影響

---

## Assumptions

- **信封形狀與 code 集為 mock 契約事實**:`{data, code, msg}`、`code` 為字串、無 `success`、完整 code 詞彙皆為 mock 實機 capture 的 wire 契約(DESIGN §3.2/§3.3 權威),非本 feature 自由設計;本 feature 只在 rust-api 側忠實實作。
- **無業務 endpoint 故 404 為唯一 live 消費者**:成功信封與多數 code 在本 feature 無 endpoint 觸發(Phase 3+ 才有),由單元測試覆蓋;404 fallback 為唯一可實機 curl 驗證的消費者。
- **`5000` 屬 rev2 自訂 5xxx 授權**:mock 矩陣無通用 500 code,DESIGN §3.3 將 `5xxx` 定為 rev2 自訂空間;`5000` 作 infra sentinel、`5001-5999` 留業務驗證,非擴充 mock 矩陣。
- **camelCase 留 DTO**:本 feature 信封欄名 `data`/`code`/`msg` 本就無需轉換;欄名 camelCase 對映由各 DTO 自帶(Phase 4),本 feature 不建轉換機制。
- **`/health` 不套信封**:DESIGN 明訂 `/health` 為純文字 liveness,本 feature 不改。

### 不在 scope

業務 endpoint / DTO(Phase 4);camelCase 轉換機制 / pagination wrapper(Phase 4 wire);業務錯誤類別與其 code 行為(Phase 3+ 各 feature);認證 / middleware(Phase 3);`/health` 任何改動。
