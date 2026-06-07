# Contract — obs-min config + compose + 叫用

> obs-min 無 HTTP/wire 介面;它對外的「契約」是 ① 新 config 檔形狀 ② compose service / profile / port / volume / secret ③ 維運叫用命令 ④ rust-api/nginx 的內部接點。對應 spec FR-001..011。

## 1. 新增 / 改動檔案 manifest

| 檔 | 動作 | repo |
|---|---|---|
| `deploy/loki-config.yml` | 新增 | outer |
| `deploy/alloy-config.alloy` | 新增（River、取代原 promtail YAML 規劃） | outer |
| `deploy/grafana-provisioning/datasources/loki.yml` | 新增 | outer |
| `deploy/secrets/grafana_admin_password.txt(.example)` | 新增（`.txt` gitignored、`.example` tracked） | outer |
| `deploy/generate-secrets.sh` | 改（加 `gen_leaf grafana_admin_password -base64 24` + summary） | outer |
| `deploy/nginx/nginx.conf` | 改（`http{}` JSON `log_format` + `access_log /dev/stdout` + `error_log /dev/stderr`、取代 `:15-16`） | outer |
| `deploy/nginx/conf.d/_locations.inc` | 改（`/api/` 加 `proxy_set_header X-Request-Id $request_id`） | outer |
| `docker-compose.yml` | 改（+3 obs service `profiles:[obs]` + 3 volume + 1 secret） | outer |
| `docker-compose.dev.yml` | 改（obs host port + config bind-mount override） | outer |
| `docker-compose.prod.yml` | 改（obs internal override + config bind-mount） | outer |
| `rust-api/server/src/audit_ctx.rs` | 改（ctx_mw 包 tracing span + boundary event；`use tracing::Instrument`） | **rust-api worktree** |
| `deploy/secrets/README.md` | 改（grafana_admin_password ⏳→active） | outer（doc） |

**唯一 rust-api worktree 改動 = `audit_ctx.rs`**（其餘全 outer）。**無新 crate、無 migration、無 base-web 改動。**

## 2. compose service 契約（`profiles: ["obs"]`、master + dev/prod override）

| service | image（pinned §6） | profile | host port(dev) | volume | secret | depends_on |
|---|---|---|---|---|---|---|
| `loki` | `grafana/loki:3.7.2` | obs | `127.0.0.1:23100:3100` | `loki_data:/loki` | — | — |
| `alloy` | `grafana/alloy:v1.16.1` | obs | 無 | `alloy_data:/var/lib/alloy/data` + `docker.sock:ro` | — | loki |
| `grafana` | `grafana/grafana:13.0.2` | obs | `127.0.0.1:23000:3000` | `grafana_data:/var/lib/grafana` | `grafana_admin_password` | loki |

- 三 service `restart: unless-stopped` + `networks:[rev2_net]`。
- 頂層 `volumes:` += `loki_data` / `grafana_data` / `alloy_data`（無 `name:`、auto-prefix `rev2-admin_*`）。頂層 `secrets:` += `grafana_admin_password`（`file: ./deploy/secrets/grafana_admin_password.txt`）。
- **base 層無 host port + 無 config bind-mount**（鐵律 `docker-compose.yml:9`）→ 在 dev/prod override 提供:
  - dev：grafana `127.0.0.1:23000:3000`、loki `127.0.0.1:23100:3100` + 三 config bind-mount（`./deploy/loki-config.yml:/etc/loki/config.yml:ro`、`./deploy/alloy-config.alloy:/etc/alloy/config.alloy:ro`、`./deploy/grafana-provisioning:/etc/grafana/provisioning:ro`）。
  - prod：internal-only（無 host port、FR-009/SC-005）+ 同三 config bind-mount。
- command:loki `-config.file=/etc/loki/config.yml`;alloy `run --storage.path=/var/lib/alloy/data --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy`;grafana 預設 entrypoint + `GF_*` env。
- grafana env：`GF_SECURITY_ADMIN_PASSWORD__FILE=/run/secrets/grafana_admin_password`、`GF_AUTH_ANONYMOUS_ENABLED=false`、`GF_ANALYTICS_REPORTING_ENABLED=false`。

## 3. config 檔形狀契約（核心鍵;完整見 research R3/R4/R5）

- **loki**（`deploy/loki-config.yml`）：`auth_enabled:false` / `server.http_listen_port:3100` / `common`(path_prefix `/loki`、inmemory ring、filesystem storage) / `schema_config`(tsdb/filesystem/v13/24h) / `limits_config.retention_period:72h` / `compactor`(retention_enabled:true、delete_request_store:filesystem) / `analytics.reporting_enabled:false`。
- **alloy**（`deploy/alloy-config.alloy`、River）：`discovery.docker`(docker.sock) → `discovery.relabel`(service/compose_project/container label + `keep compose_project=rev2-admin`) → `loki.source.docker` → `loki.write`(`http://loki:3100/loki/api/v1/push`)。
- **grafana datasource**（`deploy/grafana-provisioning/datasources/loki.yml`）：`apiVersion:1` + `datasources:[{name:Loki, type:loki, access:proxy, url:http://loki:3100, isDefault:true, editable:false}]`。

## 4. 維運叫用契約

| 操作 | 命令 |
|---|---|
| dev 起 obs（含全 stack） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs up -d --wait` |
| dev 一般起（**不**含 obs） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`（FR-006:loki/alloy/grafana 不啟） |
| grafana Explore 入口（dev） | `http://127.0.0.1:23000`（admin / `cat deploy/secrets/grafana_admin_password.txt`）→ Explore → Loki datasource |
| LogQL 查 + trace 對接 | `{service="rust-api"} | json | fields_trace_id="<uuid>"`(rust-api trace_id 巢狀於 `fields`、見 §5) |
| prod 起 obs | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs up -d --wait`（internal、無 host port） |
| seed grafana secret | `bash deploy/generate-secrets.sh`（含新 `grafana_admin_password`） |

## 5. rust-api / nginx 內部接點契約（log↔audit 同源）

- nginx `/api/` location:`proxy_set_header X-Request-Id $request_id;` → rust-api `ctx_mw extract_trace_id` 收 `x-request-id`（`audit_ctx.rs:31,74-76`）。
- rust-api `ctx_mw`:`next.run` 包 span + 一條 boundary event `tracing::info!(trace_id=…, status=…, "request complete")`。`fmt().json()` 把 event 欄位巢狀於 `"fields"` 物件(rust-api 全體 log 既有慣例)→ loki `| json` flatten 後查詢鍵為 **`fields_trace_id`**(`{service="rust-api"} | json | fields_trace_id="<uuid>"`、見 data-model §1.1/§3);穩定、非 array-index-fragile。
- **不變式**:log 不含 body/password/token;span 不加 authorization/token/password 欄（R9 guard）。
