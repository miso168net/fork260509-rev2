# Contract — obs-full config + compose + 叫用

> obs-full 無 HTTP/wire 介面;它對外的「契約」是 ① 新/改 config 檔形狀 ② compose service / profile / port / volume / secret ③ 維運叫用命令 ④ rust-api/cleanup-job 內部接點。對應 spec FR-001..012。

## 1. 新增 / 改動檔案 manifest

| 檔 | 動作 | repo |
|---|---|---|
| `deploy/prometheus/prometheus.yml` | 新增（static scrape config） | outer |
| `deploy/grafana-provisioning/datasources/prometheus.yml` | 新增（prometheus datasource、isDefault:false、uid:prometheus） | outer |
| `deploy/grafana-provisioning/alerting/rules.yml` | 新增（unified alerting rule group） | outer |
| `docker-compose.yml` | 改（+4 metrics service `profiles:[metrics]` + prometheus_data volume + grafana profile→["obs","metrics"]） | outer |
| `docker-compose.dev.yml` | 改（metrics host port 23090/29091 + prometheus/grafana config bind-mount override） | outer |
| `docker-compose.prod.yml` | 改（metrics internal override + config bind-mount） | outer |
| `rust-api/server/Cargo.toml` | 改（+ axum-prometheus 0.7.0 + metrics 0.23） | **rust-api worktree** |
| `rust-api/server/src/main.rs` | 改（PrometheusMetricLayer + /metrics route + layer） | **rust-api worktree** |
| `rust-api/server/src/auth/enforce.rs` | 改（enforce_mw allow/deny counter） | **rust-api worktree** |
| `rust-api/cleanup-job/Cargo.toml` | 改（+ metrics-exporter-prometheus 0.15 + ureq/reqwest blocking） | **rust-api worktree** |
| `rust-api/cleanup-job/src/main.rs` | 改（install_recorder + gauge + render + blocking PUT pushgateway best-effort） | **rust-api worktree** |

**rust-api worktree 改動 = `server`(metrics)+ `cleanup-job`(push)兩既有 crate**（收尾走 §4.1 兩段式 commit）。**無新 workspace crate、無 migration、無 base-web 改動、無新 secret**（reuse postgres_password + redis_password）。

## 2. compose service 契約（`profiles: ["metrics"]`、master + dev/prod override）

| service | image（pinned §6/R） | profile | host port(dev) | volume | secret |
|---|---|---|---|---|---|
| `prometheus` | `prom/prometheus:v3.12.0` | metrics | `127.0.0.1:23090:9090` | `prometheus_data:/prometheus` | — |
| `postgres_exporter` | `prometheuscommunity/postgres-exporter:v0.19.1` | metrics | 無 | — | `postgres_password`（DATA_SOURCE_PASS_FILE）|
| `redis_exporter` | `oliver006/redis_exporter:v1.85.0` | metrics | 無 | — | `redis_password`（sh-wrapper）|
| `pushgateway` | `prom/pushgateway:v1.11.3` | metrics | `127.0.0.1:29091:9091` | — | — |
| `grafana`（既有、改 profile） | `grafana/grafana:13.0.2` | **["obs","metrics"]** | `127.0.0.1:23000:3000` | `grafana_data` | `grafana_admin_password` |

- 四 metrics service `restart: unless-stopped` + `networks:[rev2_net]`;`depends_on:[prometheus]`（grafana 對 prometheus 非必、grafana datasource graceful）。
- 頂層 `volumes:` += `prometheus_data`（無 `name:`、auto-prefix `rev2-admin_prometheus_data`）。**頂層 `secrets:` 不新增**（reuse 既有 postgres_password / redis_password）。
- **base 層無 host port + 無 config bind-mount**（鐵律 `docker-compose.yml:9`）→ 在 dev/prod override 提供:
  - dev：prometheus `127.0.0.1:23090:9090`、pushgateway `127.0.0.1:29091:9091` + prometheus config bind-mount（`./deploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro`）+ grafana provisioning bind-mount（031 已掛整個 `./deploy/grafana-provisioning:/etc/grafana/provisioning:ro` → prometheus datasource + alerting/ 自動覆蓋）。
  - prod：internal-only（無 host port、FR-009/FR-011/SC-009）+ 同 config bind-mount。
- command:
  - prometheus `--config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus --storage.tsdb.retention.time=15d`。
  - postgres_exporter env `DATA_SOURCE_USER=soybean` + `DATA_SOURCE_URI=postgres:5432/soybean_admin_rust?sslmode=disable` + `DATA_SOURCE_PASS_FILE=/run/secrets/postgres_password`。
  - redis_exporter env `REDIS_ADDR=redis://redis-stack:6379` + `entrypoint:["/bin/sh","-c"]` command `export REDIS_PASSWORD="$(cat /run/secrets/redis_password)"; exec /redis_exporter`。
  - pushgateway 預設 entrypoint。
  - grafana 沿用 031（reuse、加 profile + 新 provisioning 檔）。

## 3. config 檔形狀契約（核心鍵;完整見 research R2/R6）

- **prometheus**（`deploy/prometheus/prometheus.yml`）：`global.scrape_interval:15s` + `scrape_configs`〔`rust-api`→`rust-api:21081`/metrics、`postgres`→`postgres_exporter:9187`、`redis`→`redis_exporter:9121`、`pushgateway`→`pushgateway:9091`(`honor_labels:true`)〕。
- **grafana prometheus datasource**（`deploy/grafana-provisioning/datasources/prometheus.yml`）：`apiVersion:1` + `datasources:[{name:Prometheus, type:prometheus, access:proxy, url:http://prometheus:9090, **uid:prometheus**, isDefault:false, editable:false, jsonData:{httpMethod:POST, timeInterval:15s}}]`。
- **grafana alerting**（`deploy/grafana-provisioning/alerting/rules.yml`）：`apiVersion:1` + `groups:[{orgId:1, name:rust-api-availability, folder:obs-full, interval:1m, rules:[{uid, title:"rust-api target down", condition:C, data:[A=up{job="rust-api"}@uid:prometheus, C=threshold lt 1], for:2m, noDataState:Alerting, execErrState:Alerting, labels.severity:critical}]}]`。

## 4. 維運叫用契約

| 操作 | 命令 |
|---|---|
| dev 起 metrics（含全 stack） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile metrics up -d --wait` |
| dev 起完整觀察性（log+metrics） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --wait` |
| dev 一般起（**不**含 metrics） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`（FR-006:metrics 4 service 不啟） |
| prometheus 入口（dev） | `http://127.0.0.1:23090`（targets / PromQL） |
| grafana Explore prometheus（dev） | `http://127.0.0.1:23000` → Explore → Prometheus datasource |
| rust-api metrics（dev 直連） | `curl http://127.0.0.1:21081/metrics`（prometheus 文字、含 axum_* + casbin_enforce_total） |
| cleanup-job 推 metric | 跑 cleanup-job（`--profile jobs`）+ pushgateway 起（`--profile metrics`）→ pushgateway `:29091/metrics` 見 cleanup_job_* |
| prod 起 metrics | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile metrics up -d --wait`（internal、無 host port） |

## 5. rust-api / cleanup-job 內部接點契約

- server `main.rs`:`let (layer, handle) = PrometheusMetricLayer::pair();`（OnceLock guard、`set_global_recorder` 一次）→ `.route("/metrics", get(move || async move { handle.render() }))` + `.layer(layer)`(全域、取 MatchedPath)。`/metrics` **掛 auth 外**(無 enforce)。
- `enforce_mw`:allow/deny 三 outcome `metrics::counter!("casbin_enforce_total","decision"=>"allow"|"deny").increment(1)`(metrics 0.23 macro 形 `.increment(1)`)。
- cleanup-job:`install_recorder()` → `gauge!` → `render()` → blocking PUT `http://pushgateway:9091/metrics/job/cleanup_job`（best-effort、warn-on-fail）。
- **不變式**:metric 不含 body/password/token/operator;enforce counter label 只 decision;`/metrics` 不對外暴露（nginx 不 proxy + prod internal-only）。
