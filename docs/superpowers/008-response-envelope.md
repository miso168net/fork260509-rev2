# 008-response-envelope — Phase 0 brainstorm（spec-design）

> rev2 第 8 個 spec-kit feature、**Phase 2 P1 基礎設施**（DESIGN §10 Phase 2 #3「envelope 對齊」）。
> 選為「最小可獨立完成」的 Phase 2 feature：純回應契約型別,不依賴其它 Phase 2 feature。
> 權威源:[DESIGN §3.2 Envelope 規範 / §3.3 業務 code 矩陣 / §9.3 envelope 不漏](../INTEGRATION-DESIGN.md) + [MOCK-COVERAGE-AUDIT §4.1](../MOCK-COVERAGE-AUDIT.md)。

## 1. 問題陳述

rust-api 目前 handler 直接回純值（`/health` 回 `"ok"` text）,**沒有統一回應契約**。base-web 期望所有業務 response 走固定 envelope `{data, code, msg}`（`code` 為 string、無 `success` bool）。Phase 3+ 所有 endpoint 都要套這個殼。本 feature 把**回應契約基礎設施**先立起來:成功用 `Res<T>`、錯誤用 `AppError`、完整 `BizCode` 矩陣 enum,並接 404 fallback 當第一個真實消費者。本 feature **無業務 endpoint、無 DTO**（Phase 4 才有）;`/health` 維持純 text、不套 envelope。

## 2. 設計決策（brainstorm 拍板）

1. **交付邊界 = 型別 + 404 fallback**（非純型別）:做 `Res<T>` + `AppError` + `BizCode` 完整矩陣 + 把「path 不存在 → 4040」接上 axum `.fallback()`,讓 envelope 有一個可 curl 驗的真實消費者,不只靠單測。
2. **`BizCode` = 完整矩陣 enum**:一次定義 mock 釘死的全部 code（DESIGN §3.3）,但只 wire 有消費者的（`0000`/`4040`/`5000`）。理由:code 集是 wire 契約事實（base-web `.env` 也列死）,單一 enum = single source of truth,後續 feature 只「用」變體、不再改 enum。
3. **`BizCode` ≠ `AppError`**:`BizCode` 是完整 code 詞彙表;`AppError` 是錯誤處理機制,**隨 feature 長**。本 feature `AppError` 只給有 home 的 variant（`NotFound` + `Internal`),業務 error variant（login 失敗/token 過期/logout…）隨 Phase 3 各 feature 帶。
4. **`Internal` → code `"5000"` + HTTP 500**:DESIGN §3.3 矩陣無通用 500 code,`5xxx` 為 rev2「自訂」空間。`5000` = infra/server-error sentinel、`5001-5999` 留業務驗證。base-web 對未知 code 走 fallback toast。在 5xxx 自訂授權內,非擴充矩陣。
5. **camelCase 本 feature 不做機制**:`Res<T>` 欄位 `data`/`code`/`msg` 本就全小寫無需 rename;本 feature 無 DTO → **不加 `convert_case` dep、不加任何 camelCase 機制**,只記錄「未來每個 DTO 各自掛 `#[serde(rename_all="camelCase")]`」的約定（Phase 4 實際用）。

## 3. 元件 / 架構（各有單一職責,全在 `rust-api/server/src/`,worktree）

- **`envelope.rs`** — 成功回應契約
  - `struct Res<T> { data: Option<T>, code: String, msg: String }`（欄位宣告序 = data→code→msg,serde 依序輸出;`data: None` → `"data":null` 不 skip）
  - 建構子 `Res::ok(data)`（code `0000` + 預設 msg「请求成功」）、`Res::ok_msg(data, msg)`
  - `impl<T: Serialize> IntoResponse for Res<T>` → HTTP **200** + `Json(self)`
  - `enum BizCode`（完整矩陣;`code() -> &'static str` + `default_msg()`）— 見 §下表
- **`error.rs`** — 錯誤回應契約
  - `enum AppError`（thiserror;最小 variant `NotFound` / `Internal(String)`）
  - `impl IntoResponse for AppError` → `(StatusCode, Json<Res<()>>)`,body `{data:null, code, msg}`
- **`main.rs`**（改）— 加 `mod envelope; mod error;`;加 `.fallback(|| async { AppError::NotFound })`;`/health` 不動（純 `"ok"`）

**`BizCode` 完整矩陣**（variant → code → 何時用;本 feature 只 wire ✅ 三個）:

| variant | code | 本 feature wire? | 用途（對齊 DESIGN §3.3） |
|---|---|---|---|
| `Success` | `"0000"` | ✅ | 每個成功響應 |
| `LoginFailed` | `"1000"` | — | Phase 3 登入失敗（統一） |
| `BizError` | `"2222"` | — | 業務 error 範本 |
| `TokenExpired` | `"3333"` | — | Phase 3 getUserInfo expired |
| `TokenExpiredAlt9998` | `"9998"` | — | expired 三選一（mock） |
| `TokenExpiredAlt9999` | `"9999"` | — | expired 三選一（alova demo） |
| `ModalLogout7777` | `"7777"` | — | Phase 3 modal logout |
| `ModalLogout7778` | `"7778"` | — | 同上 |
| `Logout8888` | `"8888"` | — | Phase 3 即時 logout |
| `Logout8889` | `"8889"` | — | 同上 |
| `NotFound` | `"4040"` | ✅ | 404 fallback（本 feature） |
| `Internal` | `"5000"` | ✅ | 500 catch-all（本 feature;rev2 自訂 5xxx sentinel） |

> ⚠️ **critical 紀律**（DESIGN §3.3）:`/auth/refreshToken`（Phase 5）絕不可回 `3333/9998/9999`（base-web `handleExpiredRequest` dead loop）。本 feature 無此 endpoint,但 enum 既已定義全 code,Phase 5 實作時須遵守。

## 4. 資料流

- **成功**（未來 handler）:`Ok(Res::ok(data))` → `200` + `{"data":<T>,"code":"0000","msg":"请求成功"}`
- **404**（本 feature):打不存在 path → axum fallback → `AppError::NotFound` → `IntoResponse` → `404` + `{"data":null,"code":"4040","msg":"接口不存在"}`
- **內部錯誤**（未來 handler `?`):`AppError::Internal(..)` → `500` + `{"data":null,"code":"5000","msg":"服务器内部错误"}`

## 5. 錯誤處理

- `AppError` 採 thiserror;`IntoResponse` 逐 variant 映射 (HTTP status, BizCode, msg)。
- **business error 全 HTTP 200**（DESIGN §3.2）原則於本 feature 尚無 200-error variant（皆 Phase 3 帶）;本 feature 兩個 variant 都是非 200（404 / 500），符合「path 不存在 / panic 才非 200」。
- 對齊 DESIGN §9.3:Phase 3+ handler 一律 `Result<Res<T>, AppError>`,CI lint `grep "Json<" | grep -v "Json<Res<"` 應為空（本 feature 立 pattern,lint 規則待後續 feature 有 handler 時啟用）。

## 6. ⚠️ 已知 research 項（留給 /speckit-plan Phase 0）

- **axum 0.7 `Router::fallback` + `IntoResponse` API 真實簽名**:確認 fallback handler 回 `impl IntoResponse`（`AppError`）的寫法;確認 `Json` 在非 200 status 下用 `(StatusCode, Json<_>)` tuple 回傳。
- **`BizCode` 完整 code 字串逐一對齊 DESIGN §3.3**（grep 真實表,勿憑記憶）。
- **serde 欄位順序 / `Option<T>` → `null` 行為驗證**:確認 `serde_json::to_string` 依 struct 宣告序輸出、`None` 序列化為 `null`（非省略）。

## 7. 驗收（C-V contract）

- **單測（test-first,純序列化邏輯）**:
  - `Res::ok(data)` 序列化 = `{"data":..,"code":"0000","msg":..}`:斷言**欄位順序** data→code→msg、`code` 為 JSON **string** 非 number、**無 `success` key**。
  - `BizCode` 各 variant `code()` → 正確字串（table-driven,全矩陣）。
  - `AppError::NotFound` → 404 + body `{data:null,code:"4040",msg:"接口不存在"}`;`AppError::Internal` → 500 + code `"5000"`。
- **acceptance（live）**:`curl -i http://127.0.0.1:21081/nonexistent` → HTTP 404 + envelope JSON;`curl -fsS :21081/health` 仍純 `ok`。

## 8. 範圍外（不做）

- 無任何業務 endpoint / DTO（Phase 4）;不加 `convert_case` dep、不做 camelCase 機制（§2.5）;不建 `model/` crate。
- `AppError` 不加業務 variant（`1000/3333/8888/7777…` 的 error 行為屬 Phase 3 各 feature）。
- `/health` 不改（維持純 `"ok"` liveness,DESIGN 明訂不套 envelope）。
- 無 middleware、無 auth、無 pagination wrapper（pagination `{current,size,total,records}` DESIGN §3.4 留 Phase 4 wire）。

## 9. 交棒

- **動 `rust-api/server/src/`（worktree）→ 兩段式 commit**（worktree commit+push fork → 外層 SHA pin）+ 外層 feature branch `008-response-envelope`（走 RUSTAPI-SOURCE-ISOLATION 軌道,同 007）。
- **下一步 = 階段 1 手動 `/speckit-specify`**（input = 本檔）;`before_specify` pre-hook 會建 `008-response-envelope` feature branch。**勿**從 brainstorm 流程自動觸發 specify（會跳過 pre-hook）。
