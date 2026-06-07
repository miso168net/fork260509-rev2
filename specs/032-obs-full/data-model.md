# Phase 1 Data Model — 032-obs-full

> 本 feature **無 DB 表、無 migration、無 wire DTO**。以下記受影響的「metrics 資料/邏輯模型」:① rust-api 暴露的 metric 形狀（HTTP + enforce）② cleanup-job push 的 job metric ③ exporter metric ④ prometheus label/scrape schema ⑤ grafana alert rule ⑥ rust-api code 改點。皆為 observability 內部資料、非業務實體。

## 1. rust-api `/metrics` 暴露的 metric（prometheus 文字格式）

### 1.1 HTTP request metrics（axum-prometheus `PrometheusMetricLayer`、全自動）

| metric | 型 | label | 來源 |
|---|---|---|---|
| `axum_http_requests_total` | counter | `method` / `endpoint`(=matched route pattern) / `status` | 每請求自動 |
| `axum_http_requests_duration_seconds` | histogram | 同上 | 每請求自動（latency 分佈）|
| `axum_http_requests_pending` | gauge | `method` / `endpoint` | in-flight |

- **`endpoint` label = matched route pattern**（如 `/auth/login`、`/systemManage/getUserList`;axum `MatchedPath`）—— **低基數**(FR-012)、非 raw path。404/unmatched fallback raw exact path(少量、可接受)。
- 涵蓋**全 route**(layer 全域裝)、含 `/health`/`/auth/*`/protected/`/metrics` 自身。

### 1.2 enforce 決策 counter（自埋、D9）

```
# TYPE casbin_enforce_total counter
casbin_enforce_total{decision="allow"}  N
casbin_enforce_total{decision="deny"}   M
```
- `metrics::counter!("casbin_enforce_total", "decision"=>"allow"|"deny").increment(1)`，在 `auth/enforce.rs` `enforce_mw` 的三 outcome:
  - **allow**(`allowed=true`、`:119`)→ `decision="allow"`。
  - **deny-policy**(`allowed=false` → 403/5003)→ `decision="deny"`。
  - **deny-DBerr**(fail-closed `:94-95`、roles 查詢失敗 → 403)→ `decision="deny"`。
- **label 基數紀律（FR-012）**:只 `decision`(2 值);**不**加 path/operator/role/trace_id 等高基數。
- 經 axum-prometheus 的 global `PrometheusRecorder` 從**同一 `/metrics`** 輸出(R1)。

### 1.3 不變式

- `/metrics` 為 **prometheus 文字格式**(非 JSON envelope、非 base-web wire);**公開、無 enforce、無認證**;僅內網 prometheus scrape 可達(nginx 不 proxy `/metrics`、prod internal-only、FR-011)。
- metric **不含** request body / password / token / operator 識別 等敏感值(只 method/route/status/decision count)。

## 2. cleanup-job push 的 job metric（pushgateway、D6）

```
# TYPE cleanup_job_last_success_timestamp gauge
cleanup_job_last_success_timestamp  <unix_epoch_seconds>
# TYPE cleanup_job_rows_deleted gauge
cleanup_job_rows_deleted  <n>
```
- `metrics-exporter-prometheus` `PrometheusBuilder::new().install_recorder()` → `metrics::gauge!(...)` 記 → `handle.render()` 取 text → **blocking HTTP PUT `http://pushgateway:9091/metrics/job/cleanup_job`**(LF 結尾、`render()` 已正確)。
- **best-effort**(FR-008):push 失敗(pushgateway 未起 / 不可達)只 `tracing::warn!` + 續行、**不破 cleanup 結果**。
- scrape 端 `honor_labels:true` 保 `job="cleanup_job"`。**stale 性質**:last-write-wins、run 間讀舊值(batch job 預期、靠 `last_success_timestamp` + `time()-` 偵測 stalled)。

## 3. exporter metric（prometheus 文字格式、各 exporter 提供）

| exporter | 代表 metric（示例）| scrape |
|---|---|---|
| postgres_exporter `v0.19.1` | `pg_up` / `pg_stat_database_*` / `pg_stat_activity_count` … | `postgres_exporter:9187/metrics` |
| redis_exporter `v1.85.0` | `redis_up` / `redis_connected_clients` / `redis_memory_used_bytes` … | `redis_exporter:9121/metrics` |

- exporter 連 DB/redis 取狀態 → 轉 prometheus 格式(rust-api 不碰、純 sidecar);baseline INFO/stat metric 開箱即得。

## 4. prometheus label / scrape schema

| job_name | target | 特別 |
|---|---|---|
| `rust-api` | `rust-api:21081`（metrics_path `/metrics`）| axum_* + casbin_enforce_total |
| `postgres` | `postgres_exporter:9187` | pg_* |
| `redis` | `redis_exporter:9121` | redis_* |
| `pushgateway` | `pushgateway:9091` | **`honor_labels:true`**（保 pushed label）|

- **target = compose service name + 容器內 port**(prometheus 走 compose 網路 scrape、非 host-mapped)。`global.scrape_interval:15s`。
- **`up{job="..."}`** = prometheus 自動產的 per-target 探活 metric(0=down/1=up)→ baseline alert 用。
- **bounded**:retention 15d(FR-010);label 低基數(FR-012、matched-route + decision-only)。

## 5. grafana alert rule（unified alerting、provisioning、D7）

| 欄 | 值（baseline `rust-api target down`）|
|---|---|
| group / folder | `rust-api-availability` / `obs-full`(auto-create)、interval 1m |
| query A | `up{job="rust-api"}` instant、datasourceUid=`prometheus` |
| expr C | threshold `lt 1`、`condition:C` |
| for / state | `for:2m`、`noDataState:Alerting`/`execErrState:Alerting` |
| label | `severity:critical` |

- **datasource 設顯式 `uid:prometheus`** → alert rule `datasourceUid` 對得上(否則 auto-random UID resolve 失敗、#1 footgun)。
- **notification channel = OUT**(D7):rule 在內建 default contact point backstop 下可 provision + Firing(notification 產生但 SMTP 未設→drop = 「channel deferred」正中);**不** provision notification-policies 檔(避 dangling-receiver boot error)。可擴 5xx 比率 / exporter down rule(plan/tasks)。

## 6. rust-api code 改點（worktree、兩既有 crate）

| 檔 | 改 |
|---|---|
| `server/Cargo.toml` | + `axum-prometheus = "0.7.0"` + `metrics = "0.23"` |
| `server/src/main.rs` | `PrometheusMetricLayer::pair()`(OnceLock guard、`set_global_recorder` 一次/process)→ `/metrics` route render handle + `.layer(prometheus_layer)` 全域 |
| `server/src/auth/enforce.rs` | `enforce_mw` allow/deny 三 outcome 加 `metrics::counter!("casbin_enforce_total","decision"=>…).increment(1)` |
| `cleanup-job/Cargo.toml` | + `metrics-exporter-prometheus = "0.15"` + `ureq`(或 `reqwest` blocking) |
| `cleanup-job/src/main.rs` | install_recorder + gauge!(last_success_ts / rows_deleted)+ render + blocking PUT pushgateway(best-effort warn-on-fail) |

- **零 wire/DTO/endpoint 業務改動**;`sys_*` schema 不變;base-web 不消費。
- **讀/查**:grafana Explore PromQL / alert rule(人類維運者);無程式消費端。

## 7. 不涉及

- 無 DB 表 / migration / entity / wire DTO / base-web typings / casbin policy / sys_menu。
- grafana **dashboards**(dashboard-provisioning feature / Phase 6 #3)。
- alert **notification channel**(SMTP/webhook、security pass)。
- **least-priv exporter PG role**(reuse soybean、defer follow-up、合 030 least-priv 軌道)。
- distributed tracing（tempo/OTel）。
