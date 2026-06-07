# Phase 1 Data Model — 031-obs-min

> 本 feature **無 DB 表、無 migration、無 wire DTO**。以下記四個受影響的「資料/邏輯模型」:① 結構化 log 記錄形狀 ② request_id（trace_id）關聯流 ③ loki label schema ④ rust-api span 注入的欄位。皆為 observability 內部資料、非業務實體。

## 1. 結構化 log 記錄（log entry）— 各來源的 JSON 形狀

### 1.1 rust-api（`fmt().json()`、`main.rs:506`）

每筆 event 為 JSON;**boundary event**（D5、`ctx_mw` 加）保證 `trace_id` 在 top-level:
```json
{"timestamp":"…","level":"INFO","message":"request complete",
 "trace_id":"<uuid>","method":"GET","path":"/api/...","status":200,"operator_id":"Some(1)"}
```
- 巢狀事件（handler 內既有 `tracing::info!/warn!`）同時帶 span context（`"span":{...}`/`"spans":[...]`、巢狀)— ambient 關聯用;**LogQL 查詢鍵以 boundary event 的 flat `trace_id` 為準**。
- 既有 best-effort warn（`audit_ctx.rs:140`）等不變。

### 1.2 front-nginx（D3、JSON `log_format json_combined escape=json`）

```json
{"time":"<iso8601>","service":"front-nginx","request_id":"<32-hex>","remote_addr":"…",
 "method":"GET","uri":"/api/...","status":200,"body_bytes_sent":…,"request_time":…,
 "upstream_response_time":"…","http_referer":"…","http_user_agent":"…"}
```
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

- **label cardinality 紀律**:`trace_id` **不**設為 loki label（高基數會炸 index）;它是 log line 內欄、用 `| json | trace_id="X"` query-time 抽（非 label）。
- **LogQL 查詢契約**:`{service="rust-api"} | json | trace_id="<uuid>"`（log↔audit 對接）;`{service="front-nginx"} | json | status>=500`(錯誤查) 等。

## 4. rust-api span 注入（`audit_ctx.rs` ctx_mw、唯一 code 改動）

| 欄 | 現況 | 變更 |
|---|---|---|
| `trace_id` | 只寫 `sys_access_log`(:136) | **新**:span field + boundary event flat field → log |
| `method`/`path` | 寫 `sys_access_log`(:130-131、String) | **新**:span/event field（`%` Display by-ref、不 move、既有寫入不破）|
| `operator_id` | 寫 `sys_access_log`(:134-137、Option<i64>) | **新**:span/event field（`?` Debug、Copy）|

- **寫**:唯一在 `ctx_mw`（`next.run` 外包 span + scope 內一條 `info!("request complete")`）。**零新 dep**（tracing 既有）、零 wire/DTO/endpoint 改、`sys_access_log` schema 不變。
- **讀/查**:grafana Explore LogQL（人類維運者);無程式消費端。

## 5. 不涉及

- 無 DB 表 / migration / entity / wire DTO / base-web typings / casbin policy / sys_menu。
- grafana dashboards（obs-full / dashboard-provisioning feature）。
- metrics / prometheus / exporters / `/metrics` endpoint（obs-full）。
