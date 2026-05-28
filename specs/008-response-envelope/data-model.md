# Data Model: 008-response-envelope

> 回應契約基礎型別（非 DB schema）。3 個 entity:成功信封 `Res<T>` / 業務 code 詞彙 `BizCode` / 錯誤類別 `AppError`。命名對齊 [DESIGN §3.2/§3.3](../../docs/INTEGRATION-DESIGN.md) 與 [research.md](./research.md);無 DB 表、無 DTO（Phase 4）。

---

## Entity 1: `Res<T>`（成功回應信封）

`rust-api/server/src/envelope.rs`

```rust
#[derive(Debug, Serialize)]
pub struct Res<T> {
    pub data: Option<T>,   // 成功 Some(payload);錯誤 None → "data":null
    pub code: String,      // 業務 code 字串(非數字)
    pub msg: String,
}
```

| 欄位 | 型 | 序列化 | 說明 |
|---|---|---|---|
| `data` | `Option<T>` | `Some`→payload / `None`→`null`(不 skip) | 成功攜 payload;集合空值由 `T = Vec<_>` 的空 `[]` 表達 |
| `code` | `String` | JSON **字串** `"0000"` | 業務 code(取自 `BizCode::code()`) |
| `msg` | `String` | JSON 字串 | 訊息 |

- **欄位順序不變式**:宣告序 `data` → `code` → `msg`,serde 依序輸出(FR-001)。
- **無 `success` 欄**(FR-001)。
- 建構子:`Res::ok(data: T)`(code `"0000"` + `BizCode::Success.default_msg()`)、`Res::ok_msg(data, msg)`、`Res::<()>::err(code: BizCode)`、`Res::<()>::err_msg(code, msg)`(`data: None`)。
- `impl<T: Serialize> IntoResponse for Res<T>` → `(StatusCode::OK, axum::Json(self))`(HTTP 200;業務錯誤未來也走 200,DESIGN §3.2)。

## Entity 2: `BizCode`（業務 code 詞彙,完整矩陣）

`rust-api/server/src/envelope.rs`

```rust
pub enum BizCode { Success, LoginFailed, BizError, TokenExpired, TokenInvalid9998,
    TokenExpiredAlt9999, ModalLogout7777, ModalLogout7778, Logout8888, Logout8889,
    NotFound, Internal }
```

`fn code(&self) -> &'static str` + `fn default_msg(&self) -> &'static str`:

| variant | `code()` | `default_msg()`(建議) | wire? |
|---|---|---|---|
| `Success` | `"0000"` | `请求成功` | ✅ |
| `LoginFailed` | `"1000"` | `用户名或密码错误` | — |
| `BizError` | `"2222"` | `业务错误` | — |
| `TokenExpired` | `"3333"` | `登录已过期` | — |
| `TokenInvalid9998` | `"9998"` | `登录信息无效` | — |
| `TokenExpiredAlt9999` | `"9999"` | `登录已过期` | — |
| `ModalLogout7777` | `"7777"` | `账号在他处登录` | — |
| `ModalLogout7778` | `"7778"` | `账号状态变更` | — |
| `Logout8888` | `"8888"` | `请重新登录` | — |
| `Logout8889` | `"8889"` | `账号已被禁用` | — |
| `NotFound` | `"4040"` | `接口不存在` | ✅ |
| `Internal` | `"5000"` | `服务器内部错误` | ✅ |

- code 字串為**契約事實**(對齊 mock + base-web `.env`);implementer 逐一對照 [research R1](./research.md)。
- 本 feature 只有 `Success`/`NotFound`/`Internal` 有實際呼叫點;其餘定義但未 wire(Phase 3+ 各 feature 用)。
- `default_msg` 中文(對齊 mock);實際訊息可由 caller 用 `err_msg` 覆寫。

## Entity 3: `AppError`（錯誤類別,最小 variant）

`rust-api/server/src/error.rs`

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("接口不存在")]
    NotFound,
    #[error("服务器内部错误: {0}")]
    Internal(String),
}
```

- `impl IntoResponse for AppError`:
  | variant | HTTP | BizCode | body |
  |---|---|---|---|
  | `NotFound` | 404 | `NotFound`(`"4040"`) | `{data:null, code:"4040", msg:"接口不存在"}` |
  | `Internal(_)` | 500 | `Internal`(`"5000"`) | `{data:null, code:"5000", msg:"服务器内部错误"}` |
- 業務 error variant（login/token/logout 等)**不在本 feature**(隨 Phase 3+ 增長)。
- 未來 handler 簽名:`Result<Res<T>, AppError>`(DESIGN §9.3 CI lint pattern)。

---

## 不變式 / 邊界（MUST NOT）

- 不加 `success` 欄;`code` 不可為數字;`data: None` 不可被 skip（須輸出 `null`）。
- `AppError` 不加業務 variant（Phase 3+);不建 DTO、不做 camelCase 轉換機制（Phase 4)。
- `/health` 不套信封(維持純 `"ok"`)。
- `BizCode` 不可少 / 改任一 code 字串(契約事實);新增僅限 rev2 自訂 5xxx。
