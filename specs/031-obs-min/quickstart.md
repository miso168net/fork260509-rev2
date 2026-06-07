# Quickstart — 031-obs-min

> 給 implementer / reviewer 的最短路徑:改哪、怎麼跑、怎麼驗收。詳設計見 [plan.md](plan.md) / [research.md](research.md) / [data-model.md](data-model.md) / [contracts/](contracts/)。

## 改動清單（12 處;唯一 rust-api worktree = audit_ctx.rs）

1. **`rust-api/server/src/audit_ctx.rs`**（worktree）— `ctx_mw` 把 `next.run(req)` 包進 `tracing::info_span!("request", trace_id=…, method=…, path=…, operator_id=…)`（`use tracing::Instrument`）+ span scope 內補 boundary event `tracing::info!(trace_id=%…, status=…, "request complete")`。零新 dep。
2. **`deploy/loki-config.yml`**（新）— 單機 loki、filesystem、TSDB v13、retention 72h。
3. **`deploy/alloy-config.alloy`**（新、River）— docker-SD + relabel(`service` label + keep `compose_project=rev2-admin`) + `loki.source.docker` + `loki.write`(loki:3100)。
4. **`deploy/grafana-provisioning/datasources/loki.yml`**（新）— loki datasource。
5. **`deploy/secrets/grafana_admin_password.txt(.example)`**（新）+ **`deploy/generate-secrets.sh`**（加 gen_leaf）。
6. **`deploy/nginx/nginx.conf`**（改 `:15-16`）— JSON `log_format` + `access_log /dev/stdout` + `error_log /dev/stderr`。
7. **`deploy/nginx/conf.d/_locations.inc`**（改 `/api/`）— `proxy_set_header X-Request-Id $request_id`。
8. **`docker-compose.yml`**（改）— +3 service(loki/alloy/grafana `profiles:[obs]`) + 3 volume(loki_data/grafana_data/alloy_data) + 1 secret(grafana_admin_password)。
9. **`docker-compose.dev.yml`** / **`docker-compose.prod.yml`**（改）— obs override(dev host port + config bind-mount;prod internal + config bind-mount)。
10. **`deploy/secrets/README.md`**（doc）— grafana_admin_password ⏳→active。

## image pins（§6、不浮動）

`grafana/loki:3.7.2` · `grafana/alloy:v1.16.1`（**取代 promtail、EOL**） · `grafana/grafana:13.0.2`。

## 本機跑（dev stack + obs）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
bash deploy/generate-secrets.sh                                    # 含新 grafana_admin_password
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api  # D5 span(inotify 不可靠、須重啟)
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart front-nginx                          # nginx JSON log
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs up -d --wait                   # 起 obs 三 service
# grafana: http://127.0.0.1:23000 (admin / cat deploy/secrets/grafana_admin_password.txt) → Explore → Loki
#   LogQL: {service="rust-api"} | json | fields_trace_id="<uuid>"  (rust-api trace_id 巢狀於 fmt().json() 的 "fields" → fields_trace_id;或 | json trace_id="fields.trace_id" | trace_id="<uuid>")
```

## 驗收要點（對 SC）

| 驗 | SC | 命令（見 contracts/verification-commands.md） |
|---|---|---|
| log pipeline 活體、rust-api log 帶 trace_id | SC-001 | C1 |
| log↔審計 trace_id 同源對接 | SC-002 | C2 |
| nginx JSON log + 跨服務同 id | FR-004 | C3 |
| 一般 up 不啟 obs | SC-003 | C4 |
| prod `--profile obs` 起 | SC-005 | C5 |
| 全服務 log 涵蓋 | SC-001 | C6 |
| 行為零侵入 + 旁路不反壓 | SC-004/006 | C7 |

## 紀律提醒

- **無新單元測試**:request_id 注入是 span wiring、由 C-V 活體覆蓋(§3 明示);`extract_trace_id` 既有單測不變。
- **無 CDP**:obs 無 base-web UI(grafana 獨立 ops UI)。
- **無新 crate**:tracing 既有 → §3「新 crate ⇒ prod build」不觸發;但 C5 仍驗 prod `--profile obs` 起。
- **§I.5 greenfield**:config 全新寫、不參照 rev1。
- **收尾**:rust-api(audit_ctx.rs)走 §4.1 兩段式 commit(worktree → 外層 SHA pin);compose/deploy/docs 為 outer 改動。push/merge 不早於 `superpowers:finishing-a-development-branch`。
- alloy 讀 `docker.sock` 權限(run as root 或 docker group)在 C1 起 stack 時實證。
