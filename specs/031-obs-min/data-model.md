# Phase 1 Data Model — 031-obs-min

> 本 feature **無 DB 表、無 migration、無 wire DTO**。以下記四個受影響的「資料/邏輯模型」:① 結構化 log 記錄形狀 ② request_id（trace_id）關聯流 ③ loki label schema ④ rust-api span 注入的欄位。皆為 observability 內部資料、非業務實體。

## 1. 結構化 log 記錄（log entry）— 各來源的 JSON 形狀

### 1.1 rust-api（`fmt().json()`、`main.rs:506`）

每筆 event 為 JSON;**boundary event**（D5、`ctx_mw` 加）帶 `trace_id`,**但 `tracing-subscriber` 的 `fmt().json()` 把所有 event 欄位巢狀在 `"fields"` 物件下**(這是 rust-api 全體 log 的既有慣例 — 如 sqlx log 的 `fields.summary`/`fields.db.statement`),as-built 實際形狀:
```json
{"timestamp":"2026-06-07T12:52:58.614059Z","level":"INFO",
 "fields":{"message":"request complete","trace_id":"<uuid>","method":"GET","path":"/auth/getUserInfo","status":200,"operator_id":"Some(1)"},
 "target":"server::audit_ctx",
 "span":{"method":"GET","operator_id":"Some(1)","path":"/auth/getUserInfo","trace_id":"<uuid>","name":"request"},
 "spans":[{"method":"GET","operator_id":"Some(1)","path":"/auth/getUserInfo","trace_id":"<uuid>","name":"request"}]}
```
- 巢狀事件（handler 內既有 `tracing::info!/warn!`）同時帶 span context（`"span":{...}`/`"spans":[...]`、巢狀)— ambient 關聯用。
- **LogQL 查詢鍵 = `fields_trace_id`**:boundary event 的 `trace_id` 在 `fields` 物件下(與 app 既有 tracing-subscriber 慣例一致、**非** top-level)→ loki `| json` flatten 巢狀物件以 `_` 連接後落 `fields_trace_id`(查詢見 §3)。`fields_trace_id` 是穩定、非 array-index-fragile 的 path(避開 `spans_0_trace_id` array 路徑)。
- 既有 best-effort warn（`audit_ctx.rs:140`）等不變。

### 1.2 front-nginx（D3、JSON `log_format json_combined escape=json`）

```json
{"time":"<iso8601>","service":"front-nginx","request_id":"<32-hex>","remote_addr":"…",
 "method":"GET","uri":"/api/...","status":"200","body_bytes_sent":"…","request_time":"…",
 "upstream_response_time":"…","http_referer":"…","http_user_agent":"…"}
```
- genuinely **flat**(top-level `request_id`/`service`/`uri`/`status`/…、無巢狀)。
- **數值欄 `status`/`body_bytes_sent`/`request_time` as-built 為 quoted string**(`"status":"200"`)— robustness vs nginx HTTP-000 aborted-connection 空值會破 unquoted JSON(nginx trac #2221);loki `| json` 仍可比對(string 值)。
- `request_id` = nginx 內建 `$request_id`(per-request 32-hex)、即傳給 rust-api 的 `X-Request-Id`。

### 1.3 postgres / redis-stack / base-web

容器原生 stdout（postgres/redis 半結構化、base-web dev=vite/prod=nginx）。alloy 原樣轉發、loki 收為 log line。`| json` 對非-JSON 行不解析欄、但仍可 `{service="postgres"}` 全文查（FR-001 涵蓋全服務）。

**不變式**:log 內容**不含** request body / password / bearer token（R9 grep 證);D5 span **不得**加 authorization/token/password 欄。

## 2. request_id（trace_id）關聯流

```
client ──[X-Request-Id? 有則沿用]──> front-nginx
   front-nginx: $request_id (無則自生 32-hex) ──proxy_set_header X-Request-Id──> rust-api
      rust-api ctx_mw extract_trace_id (X-Request-Id header 或 mint uuid v4、audit_ctx.rs:74-80)
         → RequestContext.trace_id (:116)
            ├──> sys_access_log.trace_id (DB 審計、:136) ── 既有
            └──> tracing span + boundary event "trace_id" 欄 (D5、新) ── log
```
- **同源同值**:nginx access log `request_id` == rust-api log `trace_id` == `sys_access_log.trace_id`（FR-003/FR-004;前提 nginx `proxy_set_header X-Request-Id $request_id`、R7）。
- **未認證請求**:有 log（含 trace_id）但**無**對應 `sys_access_log` 列（審計只記 `operator_id.is_some()`、`audit_ctx.rs:127`）→ log↔審計對接僅適用已認證請求（spec edge case）。
- **未帶外部 id**:nginx/rust-api 各自自生（FR-011;`extract_trace_id_mints_uuid_when_absent` 測 `audit_ctx.rs:204`）。

## 3. loki label schema（alloy relabel 產生）

| label | 來源 | 用途 |
|---|---|---|
| `service` | `__meta_docker_container_label_com_docker_compose_service` | **主過濾鍵**（FR-005;`{service="rust-api"}`)= §1 短名 front-nginx/base-web/rust-api/postgres/redis-stack |
| `compose_project` | `…_com_docker_compose_project`(=`rev2-admin`) | 隔離並存 rev1/他 stack（`keep` action 只收 rev2-admin） |
| `container` | `__meta_docker_container_name`(`/(.*)`) | 容器實例去歧義 |

- **label cardinality 紀律**:`trace_id` **不**設為 loki label（高基數會炸 index）;它是 log line 內欄、用 `| json | fields_trace_id="X"` query-time 抽（非 label）。
- **LogQL 查詢契約**:`{service="rust-api"} | json | fields_trace_id="<uuid>"`(log↔audit 對接;rust-api 的 trace_id 巢狀在 `fields` 下、`| json` flatten 後為 `fields_trace_id`、見 §1.1 — 或顯式抽取形 `| json trace_id="fields.trace_id" | trace_id="<uuid>"`);`{service="front-nginx"} | json | request_id="<32-hex>"`(nginx JSON flat、top-level `request_id`);`{service="front-nginx"} | json | status="500"`(錯誤查、nginx 數值欄為 quoted string) 等。

## 4. rust-api span 注入（`audit_ctx.rs` ctx_mw、唯一 code 改動）

| 欄 | 現況 | 變更 |
|---|---|---|
| `trace_id` | 只寫 `sys_access_log`(:136) | **新**:span field + boundary event field → log（`fmt().json()` 巢狀於 `"fields"` 下 → loki `fields_trace_id`、見 §1.1）|
| `method`/`path` | 寫 `sys_access_log`(:130-131、String) | **新**:span/event field（`%` Display by-ref、不 move、既有寫入不破）|
| `operator_id` | 寫 `sys_access_log`(:134-137、Option<i64>) | **新**:span/event field（`?` Debug、Copy）|

- **寫**:唯一在 `ctx_mw`（`next.run` 外包 span + scope 內一條 `info!("request complete")`）。**零新 dep**（tracing 既有）、零 wire/DTO/endpoint 改、`sys_access_log` schema 不變。
- **讀/查**:grafana Explore LogQL（人類維運者);無程式消費端。

## 5. 不涉及

- 無 DB 表 / migration / entity / wire DTO / base-web typings / casbin policy / sys_menu。
- grafana dashboards（obs-full / dashboard-provisioning feature）。
- metrics / prometheus / exporters / `/metrics` endpoint（obs-full）。
