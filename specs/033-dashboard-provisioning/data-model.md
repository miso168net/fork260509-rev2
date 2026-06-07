# Phase 1 Data Model — 033-dashboard-provisioning

> 本 feature **無 DB 表、無 migration、無 wire DTO、無 rust 改動**。以下記受影響的「dashboard 資料/config 模型」:① provisioning 物件(provider/dashboard/panel/datasource ref)② 6 張 dashboard 的 panel + query 清單(grounded 真實 metric/label)③ 改動檔清單。皆為 grafana config、非業務實體。

## 1. provisioning 物件模型（grafana config）

| 物件 | 形 | 落點 |
|---|---|---|
| **dashboard provider** | file provider yaml(`apiVersion:1`+`providers[]`、`folder:obs-full`、`options.path`) | `deploy/grafana-provisioning/dashboards/provider.yaml` |
| **dashboard** | grafana dashboard JSON(`schemaVersion:39`、`title`、`uid`、`panels[]`、`templating`) | `deploy/grafana-provisioning/dashboards/json/<name>.json` |
| **panel** | dashboard 內單一視覺化(`type`〔timeseries/stat/table〕、`gridPos`、`targets[]`〔query+datasource ref〕、`fieldConfig`) | dashboard JSON 內 |
| **datasource reference** | `{type:"prometheus"|"loki", uid:"prometheus"|"loki"}` | 每 panel target 內;**uid 穩定**(FR-007) |

- **folder**:6 板皆進 `obs-full`(reuse 032 alert folder、依名 resolve)。
- **datasource uid**:`prometheus`(032 顯式)+ **`loki`(D4 新補顯式 uid)**;community dashboard 的 `${DS_PROM}`/`$datasource` 變數 resolve 成 hardcode uid `prometheus`(R4)。

## 2. 6 張 dashboard（panel + 真實 query；★ = research 實證修正）

### 2.1 master overview（greenfield、prometheus、uid:prometheus）
| panel | type | query |
|---|---|---|
| 採集目標健康 | stat/table | `up{job=~"rust-api|postgres|redis|pushgateway"}`(★ exporter job=`postgres`/`redis`) |
| pg/redis up | stat | `pg_up` / `redis_up` |
| 總請求率 | timeseries | `sum(rate(axum_http_requests_total[5m]))` |
| deny 率 | timeseries | `sum(rate(casbin_enforce_total{decision="deny"}[5m]))` |
| cleanup 距上次成功 | stat | `time() - cleanup_job_last_success_timestamp`(★ 無 push 時 "No data") |

### 2.2 rust-api（greenfield、prometheus）
| panel | type | query |
|---|---|---|
| 請求率 by endpoint·status | timeseries | `sum by (endpoint,status) (rate(axum_http_requests_total[5m]))` |
| 延遲 p50/p95/p99 | timeseries | `histogram_quantile(0.99, sum by (le) (rate(axum_http_requests_duration_seconds_bucket[5m])))`(0.5/0.95 同形) |
| 5xx 錯誤率 | timeseries/stat | **★ `(sum(rate(axum_http_requests_total{status=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(axum_http_requests_total[5m])),1)`** |
| in-flight | timeseries | `axum_http_requests_pending` |
| enforce allow/deny 率 | timeseries | `sum by (decision) (rate(casbin_enforce_total[5m]))` |

### 2.3 postgres（community pin、prometheus）
- pin **`postgres_mixin/dashboards/postgres-overview.json @ v0.19.1`**(82% match;3 absent=PG17 移除 bgwriter 子 counter、只 1 panel 影響)。datasource 變數 `current` pin uid `prometheus`+`hide:2`。connections/db size/xact rate/blks hit/tuples/numbackends/locks 等深 panel。

### 2.4 redis（community pin、prometheus）
- pin **grafana.com 763 rev6**(100% match)。`${DS_PROM}`→`prometheus`+刪 `__inputs`。memory/clients/blocked/commands·duration/db_keys·expiring/evicted/keyspace hits·misses/net io/uptime 等深 panel。

### 2.5 audit-log（greenfield、loki、uid:loki）
| panel | type | query |
|---|---|---|
| log 量 by service | timeseries | `sum by (service) (count_over_time({compose_project="rev2-admin"}[5m]))` |
| rust-api error/warn | timeseries/stat | `sum(count_over_time({service="rust-api"} | json | level=~"ERROR|WARN" [5m]))`(★ `level` top-level) |
| rust-api by level | timeseries | `sum by (level) (count_over_time({service="rust-api"} | json [5m]))` |
| nginx access status | timeseries | **★ `sum by (status) (count_over_time({service="front-nginx"} |~ \`^{\` | json [5m]))`**(必須 `|~ \`^{\`` 過濾、否則 JSONParserErr) |
| enforce-deny log | logs/timeseries | `{service="rust-api"} | json | fields_message=~"(?i)denied|403"`(或 deny 相關;trace_id 走 `fields_trace_id`) |

### 2.6 cleanup-job（greenfield、prometheus）
| panel | type | query |
|---|---|---|
| 上次成功時間 | stat(date) | `cleanup_job_last_success_timestamp` |
| 距上次清理 age | stat(秒/staleness) | `time() - cleanup_job_last_success_timestamp` |
| 上次清理筆數 | stat | `cleanup_job_rows_deleted` |
| rows_deleted 時序 | timeseries | `cleanup_job_rows_deleted` |
| pushgateway 健康 | stat | `up{job="pushgateway"}`(★ **不**做 `up{job="cleanup_job"}` — 不存在) |

> ★ cleanup-job 板現無 fresh 樣本(上次 push 過期);acceptance 須先觸發一次 cleanup-job push(同 032 C6)再驗板有資料。

## 3. 改動檔清單（全 outer/deploy、worktree+base-web 零改）

| 檔 | 動作 |
|---|---|
| `deploy/grafana-provisioning/dashboards/provider.yaml` | 新增(file provider、folder obs-full、path json/) |
| `deploy/grafana-provisioning/dashboards/json/master-overview.json` | 新增(greenfield、schemaVersion 39) |
| `deploy/grafana-provisioning/dashboards/json/rust-api.json` | 新增(greenfield) |
| `deploy/grafana-provisioning/dashboards/json/audit-log.json` | 新增(greenfield、loki) |
| `deploy/grafana-provisioning/dashboards/json/cleanup-job.json` | 新增(greenfield) |
| `deploy/grafana-provisioning/dashboards/json/postgres.json` | 新增(community pin postgres_mixin@v0.19.1 + datasource edit) |
| `deploy/grafana-provisioning/dashboards/json/redis.json` | 新增(community pin 763 rev6 + ${DS_PROM}→prometheus) |
| `deploy/grafana-provisioning/datasources/loki.yml` | 改(加 `uid: loki`、D4) |

- **無 compose/secret/rust-api/base-web/migration 改動**;dev/prod compose 已掛整個 `grafana-provisioning/` 目錄 → 新 `dashboards/` 自動含括(無新 mount/service)。

## 4. 不涉及
- 無 DB 表 / migration / entity / wire DTO / base-web typings / casbin policy / sys_menu / rust crate / secret。
- 無新 metrics / exporter / alert rule(032 已交;本刀只「畫」現有 metric/log)。
- 無 alert 送信管道(§2.37)、無對外暴露硬化(§2.36)、無 flatten_event(D3 維持 nested)。
