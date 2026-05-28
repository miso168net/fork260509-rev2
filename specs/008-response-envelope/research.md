# Research: 008-response-envelope（Phase 0）

> 遵守 [CLAUDE.md §3](../../CLAUDE.md) research 紀律:grep 真實來源、不拷 rev1 code（Constitution §I.5）。
> 本 feature 無 service/DTO/wire endpoint → 「rust service trait 返回型 grep」「wire 3 端對齊 grep」**N/A**;信封形狀權威 = DESIGN §3.2/§3.3（已讀）。

---

## R1. 業務 code 矩陣確切字串（grep DESIGN §3.3,勿憑記憶）

**Decision**:`BizCode` enum 完整定義以下 code（對齊 [DESIGN §3.3](../../docs/INTEGRATION-DESIGN.md) 實機 capture 表):

| code | 語義 | 本 feature wire? |
|---|---|---|
| `"0000"` | success | ✅ |
| `"1000"` | login 失敗（統一） | — |
| `"2222"` | 業務 error 範本 | — |
| `"3333"` / `"9998"` / `"9999"` | token 過期 / 無效 | — |
| `"7777"` / `"7778"` | modal logout | — |
| `"8888"` / `"8889"` | 即時 logout | — |
| `"4040"` | path 不存在 | ✅ |
| `"5000"` | 內部錯誤 sentinel（rev2 自訂 5xxx,5001-5999 留業務） | ✅ |

**Rationale**:code 集為 base-web `.env`（`VITE_SERVICE_EXPIRED_TOKEN_CODES=9999,9998,3333` / `MODAL_LOGOUT_CODES=7777,7778` / `LOGOUT_CODES=8888,8889`）+ mock 實機 capture 釘死的封閉集;單一 enum = single source of truth。`5000` 為 rev2 在 DESIGN §3.3「5xxx 自訂」授權內新增的 infra sentinel,非擴充 mock 矩陣。

**Alternatives**:每個 code 一 variant vs 語義分組帶 code —— 採「語義 variant + `code()->&'static str` + `default_msg()`」,variant 名語義化、code 字串顯式（implementer 對照本表逐一驗）。

> ⚠️ critical:`/auth/refreshToken`（Phase 5）絕不可回 `3333/9998/9999`(base-web dead loop)。本 feature 無此 endpoint、僅定義詞彙。

---

## R2. axum 0.7 `Router::fallback` + `IntoResponse` pattern

**Decision**:
- `Res<T>` 實作 `IntoResponse` → 回 `(StatusCode::OK, axum::Json(self))`（HTTP 200）。
- `AppError` 實作 `IntoResponse` → `(status, axum::Json(Res::<()>::err(code, msg)))`,各 variant 給對應 status（`NotFound`→404、`Internal`→500）。
- 404 fallback:`Router::fallback(handler)`,handler = `async fn() -> AppError { AppError::NotFound }`（`AppError: IntoResponse` 故可直接當 handler 回傳值）。

**Rationale**:axum 0.7（已 pin,workspace dep）`Router::fallback` 收 `Handler`;`(StatusCode, Json<T>)` 與任何 `impl IntoResponse` 皆為合法 handler 回傳。`axum::Json` 內部用 serde_json 序列化。現有 `main.rs` 僅 `use axum::{routing::get, Router}` + health 回 `&'static str`,無既有 IntoResponse/fallback,本 feature 全新建。

**Alternatives**:fallback 直接回 `(StatusCode, Json<Res<()>>)` tuple（不經 AppError)—— 否決(brainstorm 拍板 Approach A:走 AppError 讓錯誤路徑與型別一次立定)。

> impl 時對真 axum 0.7 `cargo doc` 再確認 `IntoResponse for (StatusCode, Json<T>)` 與 `Handler` for `async fn() -> impl IntoResponse` 簽名。

---

## R3. serde 欄位順序 / `Option<T>` → `null` 行為 + `serde_json` dep

**Decision**:
- `Res<T> { data: Option<T>, code: String, msg: String }`,`#[derive(Serialize)]`;序列化依 **struct 宣告順序** → `data` → `code` → `msg`。
- `data: Option<T>` 的 `None` 序列化為 `null`（**不加** `skip_serializing_if`,要保留 `"data":null`）。
- `code: String`（非數字）→ 序列化為 JSON 字串 `"0000"`。
- **新增 `serde_json` 直接 dep**:`serde_json` 目前僅 Cargo.lock transitive（1.0.150,axum 帶);單測要 `serde_json::to_string(&res)` assert 序列化字串、欄位順序、`code` 為 string、無 `success` 鍵 → 須加為直接 dep。

**Rationale**:serde derive 預設依宣告序輸出欄位、`Option::None`→`null`(present);皆為 serde 穩定行為。`serde_json` 加 workspace + server dep（normal dep,非僅 dev,因 envelope/tests 皆可能直接用）。

**版本**:`serde_json = "1"`(對齊既有 `serde = "1"`;Cargo.lock 已解析 1.0.150,無 prerelease,符合 §6)。

**Alternatives**:`#[serde(rename_all=...)]` on `Res<T>` —— 否決(欄名 data/code/msg 本就小寫無需 rename;camelCase 留各 DTO,brainstorm §2.5)。

---

## R4. `AppError`（thiserror）+ `IntoResponse` 最小 variant

**Decision**:
- `AppError`（`#[derive(thiserror::Error)]`)最小 variant:`NotFound`、`Internal(String)`。
- `impl IntoResponse for AppError`:`NotFound`→`(404, Json(Res::err(BizCode::NotFound)))`;`Internal(_)`→`(500, Json(Res::err(BizCode::Internal)))`,msg 用 `BizCode::default_msg()`。
- `Res<()>::err(code: BizCode)` / `err_msg(code, msg)` 建構錯誤信封(`data: None`)。

**Rationale**:thiserror 已在 workspace dep;最小 variant 對齊 brainstorm 拍板(錯誤類別隨 feature 長,本 feature 只 `NotFound`+`Internal` 有 home)。業務 error variant（1000/3333/8888…)留 Phase 3+ 各 feature。

**Alternatives**:一次建全矩陣 error variant —— 否決(overbuild,無 caller)。

---

## Research 結論

4 項全解析、0 NEEDS CLARIFICATION。新增 1 個直接 dep（`serde_json = "1"`,stable,無 prerelease)。**遵守 §I.5**:只 grep rev2 現有產物（rust-api Cargo.toml/lock、main.rs、DESIGN/MOCK 權威),未拷 rev1。信封形狀與 code 集忠實對齊 mock 契約(DESIGN §3.2/§3.3)。
