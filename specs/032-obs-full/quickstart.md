# Quickstart — 032-obs-full

> 給 implementer / reviewer 的最短路徑:改哪、怎麼跑、怎麼驗收。詳設計見 [plan.md](plan.md) / [research.md](research.md) / [data-model.md](data-model.md) / [contracts/](contracts/)。

## 改動清單（rust-api worktree = server + cleanup-job 兩 crate）

1. **`rust-api/server/Cargo.toml`** + **`server/src/main.rs`**（worktree）— `axum-prometheus 0.7.0` + `metrics 0.23`;`PrometheusMetricLayer::pair()`（as-built 無 init guard — `main()` 唯一呼叫者、bin-only crate）→ `/metrics` route + `.layer()` 全域。
2. **`rust-api/server/src/auth/enforce.rs`**（worktree）— `enforce_mw` allow/deny 三 outcome 加 `metrics::counter!("casbin_enforce_total","decision"=>…).increment(1)`（閉 Phase 3 #5 enforce metrics 債）。
3. **`rust-api/cleanup-job/Cargo.toml`** + **`cleanup-job/src/main.rs`**（worktree）— `metrics-exporter-prometheus 0.15`（`default-features = false`）+ `ureq 2`（`default-features = false`、非 reqwest::blocking）;`install_recorder()` + `gauge!` + `render()` + blocking PUT `pushgateway:9091/metrics/job/cleanup_job`（best-effort warn-on-fail）。
4. **`deploy/prometheus/prometheus.yml`**（新）— static scrape（rust-api/postgres_exporter/redis_exporter/pushgateway、`honor_labels:true`）。
5. **`deploy/grafana-provisioning/datasources/prometheus.yml`**（新）— prometheus datasource（`isDefault:false`、`uid:prometheus`）。
6. **`deploy/grafana-provisioning/alerting/rules.yml`**（新）— baseline alert rule（rust-api target down …）。
7. **`docker-compose.yml`**（改）— +4 service(prometheus/postgres_exporter/redis_exporter/pushgateway `profiles:[metrics]`) + `prometheus_data` volume + grafana profile→`["obs","metrics"]`。
8. **`docker-compose.dev.yml`** / **`docker-compose.prod.yml`**（改）— metrics override(dev host port 23090/29091 + prometheus config bind-mount;prod internal + bind-mount)。

## image / crate pins（§6/R、不浮動）

- **crate**：`axum-prometheus 0.7.0`（最後 axum-0.7 相容、MSRV 1.70）· `metrics 0.23`（對齊 transitive）· `metrics-exporter-prometheus 0.15`（**`default-features = false`** — 去 push-gateway/http-listener 預設 features 帶的 hyper-rustls/aws-lc-rs/cmake 重 stack；只用 install_recorder/render）· `ureq 2`（`default-features = false`、**非 `reqwest::blocking`**：tokio runtime 內建構會 panic）。
- **image**：`prom/prometheus:v3.12.0`（前導 v）· `prometheuscommunity/postgres-exporter:v0.19.1` · `oliver006/redis_exporter:v1.85.0-alpine`（**`-alpine` 必要** — bare tag 是 scratch 無 `/bin/sh`、sh-wrapper 起不來）· `prom/pushgateway:v1.11.3` · `grafana/grafana:13.0.2`（reuse 031）。

## 本機跑（dev stack + 完整觀察性）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
bash deploy/generate-secrets.sh                                    # exporter reuse postgres_password/redis_password（已備）
dcargo build -p server && dcargo build -p cleanup-job              # 編 metrics 埋點 + push
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api   # 載入 axum-prometheus layer（inotify 不可靠、須重啟）
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --wait   # 完整觀察性（log+metrics）
# prometheus:  http://127.0.0.1:23090 （Status→Targets / Graph PromQL）
# grafana:     http://127.0.0.1:23000 （admin / cat deploy/secrets/grafana_admin_password.txt）→ Explore → Prometheus
# rust-api /metrics: curl http://127.0.0.1:21081/metrics | grep -E 'axum_http|casbin_enforce'
```

## 驗收要點（對 SC）

| 驗 | SC | 命令（見 contracts/verification-commands.md） |
|---|---|---|
| rust-api /metrics 活體（HTTP metric） | SC-001 | C1 |
| enforce allow/deny counter | SC-002 | C2 |
| prometheus scrape targets up | SC-001/003 | C3 |
| 2 exporter metric | SC-003 | C4 |
| grafana prometheus datasource 端到端 | SC-001 | C5 |
| pushgateway + cleanup-job push | SC-004 | C6 |
| baseline alert rule provisioned | SC-005 | C7 |
| 一般 up 不啟 metrics（metrics⊥log） | SC-006 | C8 |
| 行為零侵入 + 旁路 | SC-007/008 | C9 |
| prod `--profile metrics` 起 | SC-009 | C10 |

## 紀律提醒

- **無新單元測試**:metrics 為 layer/counter wiring、由 C-V 活體覆蓋（§3 明示）;cleanup-job push body 若有可抽純函式則 test-first。
- **無 CDP**:obs-full 無 base-web UI（prometheus/grafana 獨立 ops UI）。
- **無新 workspace crate**:deps 加在既有 server + cleanup-job 兩 crate → §3「新 crate ⇒ prod build」**嚴格不觸發**;但 **C10 仍驗 prod `--profile metrics` 起 + rust-api prod build**（新 deps 進 runtime）。
- **無新 secret**:postgres_exporter reuse `postgres_password`（`DATA_SOURCE_PASS_FILE`）;redis_exporter sh-wrapper reuse `redis_password`。
- **least-priv exporter PG role**:本 feature reuse soybean（internal-only）、least-priv role defer follow-up（合 030 least-priv 軌道）。
- **§I.5 greenfield**:config 全新寫、不參照 rev1（rev1 obs-full `specs/044` 僅概念參考）。
- **收尾**:rust-api（server + cleanup-job）走 §4.1 兩段式 commit（worktree → 外層 SHA pin）;compose/deploy 為 outer 改動。push/merge 不早於 `superpowers:finishing-a-development-branch`。
- **axum-prometheus 陷阱**:`set_global_recorder` 一次/process（as-built 無 guard — `main()` 唯一呼叫者、無測試在程序內建 router;若未來有則須 OnceLock guard）;`metrics` crate major 須 0.23（對齊、否則 custom counter 靜默掉）;0.7.0 鎖 axum 0.7（**勿升 ≥0.8、需整 migrate axum 0.8**）。
