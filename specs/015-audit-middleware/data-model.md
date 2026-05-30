# Data Model: 015-audit-middleware（Phase 1）

> 命名/型以 [research.md](./research.md) grep 的 rev2 既有（`m..004` INET 範本、entity 慣例、xdb API）為準。**兩張新表**（經 010 自動套）+ 純 event 型 + 請求脈絡 + facade。**不重用** `sys_operation_log`（不同關注點/shape）；**不 retrofit 011**（R5）。

## 1. 新表 schema（migration `m20260529_000011` / `m20260529_000012`，沿 `m..004` 寫法；append-only、無 `deleted_at`、非 SoftDeletable）

### `sys_access_log`（`m..011`）— 已認證請求 access log

| 欄 | 型 | 約束 | 說明 |
|---|---|---|---|
| `id` | BIGSERIAL | PK auto_increment | |
| `operator_id` | BIGINT | NOT NULL | 操作者 user_id（只記已認證 → 必有） |
| `method` | VARCHAR(10) | NOT NULL | HTTP method |
| `path` | VARCHAR(512) | NOT NULL | 請求路徑 |
| `http_status` | INTEGER | NOT NULL | 回應 HTTP status |
| `client_ip` | **INET** | NOT NULL | 直連對端 IP（`.custom(Alias::new("INET")).not_null()`） |
| `x_forwarded_for` | TEXT | NULL | 原始 XFF 鏈逐字（無→NULL） |
| `region` | VARCHAR(128) | NULL | xdb raw 字串（解析失敗→NULL） |
| `trace_id` | VARCHAR(64) | NOT NULL | 關聯碼（uuid v4 或截斷的 X-Request-Id） |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

### `sys_login_attempt`（`m..012`）— 登入嘗試（為未來 lockout）

| 欄 | 型 | 約束 | 說明 |
|---|---|---|---|
| `id` | BIGSERIAL | PK auto_increment | |
| `attempted_user_name` | VARCHAR(64) | NOT NULL | 嘗試帳號名（handler 截斷 ≤64） |
| `success` | BOOLEAN | NOT NULL | 成敗 |
| `operator_id` | BIGINT | NULL | 成功→user_id；失敗→NULL |
| `client_ip` | **INET** | NOT NULL | 直連對端 IP |
| `x_forwarded_for` | TEXT | NULL | 原始 XFF 鏈 |
| `region` | VARCHAR(128) | NULL | xdb raw |
| `trace_id` | VARCHAR(64) | NOT NULL | 關聯碼 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**index**（lockout：「N 分鐘內某帳號/IP 失敗次數」）：
- `idx_sys_login_attempt_user_created` ON `(attempted_user_name, created_at)`
- `idx_sys_login_attempt_ip_created` ON `(client_ip, created_at)`

> migration 沿 `m..004`：`Table::create().if_not_exists()` + INET 欄 `.custom(Alias::new("INET"))`（**`.not_null()`**，與 011 的 `.null()` 不同）；index 用 `manager.create_index(Index::create()...)`。`down` = drop index + drop table。lib.rs 註冊 011/012（接 010 後）。

## 2. entity（`entity/src/sys_access_log.rs` / `sys_login_attempt.rs`，沿 `DeriveEntityModel` 慣例）

```
// sys_access_log
id: i64 (pk, auto_increment) / operator_id: i64 / method: String / path: String /
http_status: i32 / client_ip: IpNetwork / x_forwarded_for: Option<String> /
region: Option<String> / trace_id: String / created_at: DateTimeWithTimeZone

// sys_login_attempt
id: i64 (pk) / attempted_user_name: String / success: bool / operator_id: Option<i64> /
client_ip: IpNetwork / x_forwarded_for: Option<String> / region: Option<String> /
trace_id: String / created_at: DateTimeWithTimeZone
```

- **`client_ip: IpNetwork`**（`ipnetwork::IpNetwork`；sea-orm `with-ipnetwork` re-export 或加 `ipnetwork` dep，implementer 確認精確 import path）→ 解 §2.14（sea-orm 自動 `::inet` cast）。
- `Relation {}` 空、`ActiveModelBehavior` 預設（沿 `sys_operation_log` entity）。
- `Json`/serde 非必要（這兩表不對外 wire、不序列化給 base-web）。

## 3. 純 event 型（不含 `entity::` path；放 `server/src/` 新模組如 `audit_log.rs` 或併 `audit.rs`）

```
struct AccessLogEvent { operator_id: i64, method: String, path: String, http_status: i32,
                        client_ip: IpAddr, x_forwarded_for: Option<String>,
                        region: Option<String>, trace_id: String }
struct LoginAttemptEvent { attempted_user_name: String, success: bool, operator_id: Option<i64>,
                           client_ip: IpAddr, x_forwarded_for: Option<String>,
                           region: Option<String>, trace_id: String }
```
- `client_ip: IpAddr`（std）→ facade 轉 `IpNetwork`（`IpNetwork::from(ip_addr)`）。pure 型不碰 entity（守 009）。

## 4. 請求脈絡（`RequestContext`，middleware 建、入 request extensions）

```
struct RequestContext { operator_id: Option<i64>, client_ip: IpAddr,
                        x_forwarded_for: Option<String>, region: Option<String>, trace_id: String }
```
- 全域 middleware 對**每請求**建（含公開/login）；login handler 經 `Extension<RequestContext>` 取 ip/region/trace_id。
- `operator_id`：middleware 試 bearer→`jwt::verify`→`claims.user_id`；失敗→None。
- `client_ip`：`ConnectInfo<SocketAddr>` peer → `IpAddr`。
- `x_forwarded_for`：`X-Forwarded-For` header raw（`HeaderMap`，UTF-8 lossy/或無則 None）。
- `region`：`xdb::search_by_ip(client_ip.to_string())` Ok→Some(raw)、Err→None。
- `trace_id`：`X-Request-Id` header（截斷 ≤64）else `Uuid::new_v4()`。

## 5. facade（`server/src/model/facade/sys_access_log.rs` / `sys_login_attempt.rs`，**唯一**構造對應 `entity::*::ActiveModel` 之處、009 lint 豁免）

```
sys_access_log::write(db, AccessLogEvent) -> Result<(), DbErr>     // INSERT 1 row;client_ip: IpNetwork::from(ev.client_ip)
sys_login_attempt::write(db, LoginAttemptEvent) -> Result<(), DbErr>
```
- 純映射 `Event → ActiveModel`（抽 `*_active_model(ev)` fn 作 SQL-build 純單測 seam、沿 011 `audit_active_model` 模式）。
- **best-effort 由呼叫端處理**：middleware/login-handler 拿 `Result`、`Err` 只 `tracing::warn!`、不傳播失敗業務請求（FR-007；**非** `mutate_in_txn` 原子）。

## 6. middleware → 行為（`server/src/` 新模組，全域 `.layer(from_fn(audit_mw))`）

| 階段 | 行為 |
|---|---|
| 前 | 建 `RequestContext`（§4）入 `req.extensions_mut()` |
| 跑 | `next.run(req)` → 得 `Response`（含 status） |
| 後 | iff `operator_id` Some（已認證）→ best-effort `sys_access_log::write`（operator_id/method/path/http_status/ctx 來源/trace_id）；否則 skip（R2 閘門） |

- `main.rs`：`.layer(from_fn(audit_mw))` 掛全 Router；serve 改 `into_make_service_with_connect_info::<SocketAddr>()`；boot `xdb::searcher_init(None)`（XDB_FILEPATH env 驅動）。
- login handler：決成敗後 `sys_login_attempt::write`（讀 `Extension<RequestContext>`）。

## 7. 與既有關係

- `sys_operation_log`（011）/ `casbin_rule` 不動；本 feature 新增兩獨立表。
- xdb（012）：本 feature 首個消費者（searcher_init + search_by_ip）；解 §2.15 runtime path（XDB_FILEPATH + prod COPY）。
- jwt/bearer（013）：middleware 取 operator_id（自驗一次；§2.17 DRY defer）。
- 008 envelope：handler 不變、middleware 旁路。009 lint：新表只經新 facade。010：兩 migration 自動套。
