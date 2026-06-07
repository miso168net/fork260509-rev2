# Phase 0 Research — 033-dashboard-provisioning

> 所有決策以**對 live 運行 stack 取證**（grafana 13.0.2 `:23000` / prometheus `:23090` / loki `:23100`，2026-06-08）+ WebSearch 驗證版本為據（3 平行 research agent）。**§I.5 紀律：全 greenfield app dashboard + upstream exporter dashboard（非 rev1 source）**。NEEDS CLARIFICATION：無（spec 0 markers、brainstorm D1-D8 拍板）。

---

## R1 — grafana 13.0.2 dashboard provisioning 機制（D5）

- **Decision**: 新 `deploy/grafana-provisioning/dashboards/` = **1 個 provider yaml**（`provider.yaml`）+ dashboard JSON 放 **`dashboards/json/` 子目錄**。provider yaml:
  ```yaml
  apiVersion: 1
  providers:
    - name: 'obs-full-dashboards'
      orgId: 1
      folder: obs-full
      type: file
      disableDeletion: true
      updateIntervalSeconds: 30
      allowUiUpdates: false
      options:
        path: /etc/grafana/provisioning/dashboards/json
        foldersFromFilesStructure: false
  ```
- **★ 路徑分工（易錯點）**: grafana 掃 `/etc/grafana/provisioning/dashboards/*.yaml` 找 **provider config**;每 provider 的 `options.path` 指**另一個** dashboard JSON 目錄。**provider yaml 不可放進 `options.path`**(否則 grafana 試把它當 dashboard parse、log error)。故 JSON 放 `dashboards/json/`、provider yaml 放 `dashboards/`。
- **schemaVersion 39**: grafana 13.0.2 內部 `DASHBOARD_SCHEMA_VERSION=42`(v13.0.2 source tag `DashboardMigrator.ts`、v1 dashboard API final 版);**hand-author 用 39**(避 v40-42 Scenes-schema verbose/churn、又無 deprecated 警告)。**live 驗收**:`schemaVersion:39` + prometheus timeseries panel POST 進 grafana → `status:success`、進 obs-full folder、刪除後 count 0。
- **folder `obs-full`**: reuse 032 alert 的 folder(live `GET /api/folders`→`{uid:dfofn2n1ael1cc,title:obs-full}`);provider `folder: obs-full` 依名 resolve、reuse 不重建。
- **`:ro` mount OK**: file-provisioning 唯讀設計(讀 JSON、寫 grafana 自身 DB `grafana_data`、不回寫 mount)。`disableDeletion:true`+`allowUiUpdates:false`+`:ro` 無衝突(既有 datasources/alerting 已證 `:ro` 端到端可行)。
- **WSL2**: 改 provisioning 套用須 `up -d --force-recreate grafana`(非 restart、drvfs bind-mount shadow-path 衝突、031/032 gotcha)。
- **Grounding**: 既有 mount `docker-compose.dev.yml:130`/`prod.yml:85` `./deploy/grafana-provisioning:/etc/grafana/provisioning:ro`;`GF_PATHS_PROVISIONING=/etc/grafana/provisioning`(live env);現有只 `datasources/`+`alerting/`、無 `dashboards/`。WebSearch [grafana provisioning doc](https://grafana.com/docs/grafana/latest/administration/provisioning/)。
- **Alternatives**: `foldersFromFilesStructure:true`(需 unset `folder:`、與 reuse obs-full 衝突、reject);JSON 直放 `dashboards/`(混 provider yaml、reject、用 `json/` 子目錄分離)。

## R2 — postgres dashboard（D2、官方 exporter dashboard）

- **Decision**: pin **`prometheus-community/postgres_exporter` 的 `postgres_mixin/dashboards/postgres-overview.json` @ tag `v0.19.1`**(對齊本 stack exporter 版本):
  `https://raw.githubusercontent.com/prometheus-community/postgres_exporter/v0.19.1/postgres_mixin/dashboards/postgres-overview.json`(Title "Postgres Overview"、schemaVersion 38、~35KB)。
- **metric-match 驗(live)**: **14/17=82% present**(用 modern `_total` 後綴 counter、本 v0.19.1 真暴露 `pg_stat_bgwriter_buffers_alloc_total` 等);**3 absent = PG17 移除的 bgwriter 子 counter**(`buffers_backend(_fsync)_total`/`buffers_checkpoint_total`、PG17 折進 `pg_stat_checkpointer`)→ 只影響 1 個「bgwriter buffers」panel、其餘(xact rate/tuples/blks hit/numbackends/locks…)全 work;非 stale pin、是 PG17 upstream gap。spot-check live 回資料(pg_up=1·blks_hit·activity_count=24·locks=36·max_connections)。**本 stack 真 app DB = `soybean_admin_rust`**(非 soybean)、exporter label `job="postgres"`/`datname∈{postgres,soybean_admin_rust,template0/1}`。
- **datasource 接法(file-provisioning)**: 此 mixin **不用 `__inputs`**、用 `datasource`-type **template 變數**(panel `uid:"$datasource"`)。**implementer edit**: `templating.list` 把 `datasource` 變數 `current` pin uid `prometheus` + `hide:2`(隱 picker),或 `$datasource`→literal `prometheus`。其餘 `job`/`instance`/`db` 變數查通用 label、本 exporter 有、無需改。
- **Alternatives**: grafana.com **9628 rev8**(同 82% raw match 但 **templating k8s/Helm-coupled** —— `namespace`/`release` 變數查 `kubernetes_namespace`/`release` label、本 static-scrape 無 → `pg_up{release=""}` 無 instance match → **多數 panel 空**;reject);**14114 rev1**(mixin 的 2021 snapshot、71% match、用 pre-`_total` 舊名;reject stale)。

## R3 — redis dashboard（D2、官方 exporter dashboard）

- **Decision**: pin **grafana.com dashboard ID 763 revision 6**(= oliver006/redis_exporter `contrib/grafana_prometheus_redis_dashboard.json @ v1.85.0`、byte-identical;exporter 作者維護、rev6 latest 2024-02-17):
  `https://grafana.com/api/dashboards/763/revisions/6/download`(canonical)或 repo raw `@v1.85.0`。
- **metric-match 驗(live)**: **15/15=100% present、零 absent**(redis_up/memory_used·max_bytes/connected·blocked_clients/commands_total·duration/db_keys·expiring/evicted·expired/keyspace_hits·misses/net_input·output/uptime 全在)。spot-check live 回資料(redis_up=1·memory·rate(commands_total)=13·db_keys=16)。exporter label `job="redis"`/`instance="redis_exporter:9121"`、**無 `namespace` label**。
- **datasource 接法**: 帶 `__inputs:[DS_PROM]` + `${DS_PROM}`(34 refs)。**implementer edit(已驗)**: ① string-replace `${DS_PROM}`→`prometheus`、② 刪 top-level `__inputs` array → panel 變 `{type:prometheus,uid:prometheus}`。`namespace`/`instance` 變數查 `label_values(redis_up,namespace)`(本無 namespace→列空、但 `=~"$namespace"` 空 regex 仍 match→panel render、非破;可選 drop/hide namespace 變數)。
- **Alternatives**: repo `@v1.85.0`(同 100%、等價 pin);17507 CN fork(非作者維護、reject)。

## R4 — 通用 file-provisioning datasource resolution（D2/D4）

- **Decision**: **option (c) hardcode uid**:兩 community dashboard 都把 datasource 引用 resolve 成顯式 `{type:prometheus,uid:prometheus}`(032 已 provision)+ 移 `__inputs`/datasource-picker 變數。redis 763:`${DS_PROM}`→`prometheus`+刪 `__inputs`;postgres mixin:`datasource` 變數 `current` pin uid `prometheus`+`hide:2`(或 `$datasource`→`prometheus`)。
- **Rationale**: 留 live `__inputs` block 使 grafana 視為「import-required」→ provisioning fail/prompt;靠 `GF_` default datasource 脆(第 2 datasource 即破)。hardcode uid 對 file-provisioning 最明確。greenfield dashboard 直接寫 uid `prometheus`(其他 3 板)+ `loki`(audit-log)。

## R5 — greenfield rust-api / master overview PromQL（D1、live 全驗 status:success）

- **★ job 名(live 驗、易錯)**: scrape job = `rust-api`/`postgres`/`redis`/`pushgateway`(**exporter job 是 `postgres`/`redis`、非 `postgres_exporter`**;`_exporter` 在 instance label 不在 job)。
- **rust-api 板**(全 live 驗回資料):
  - 請求率 by endpoint+status:`sum by (endpoint,status) (rate(axum_http_requests_total[5m]))`(8 series live)。
  - 延遲 p50/p95/p99:`histogram_quantile(0.99, sum by (le) (rate(axum_http_requests_duration_seconds_bucket[5m])))`(p99=0.00495 live;0.5/0.95 同形)。
  - **★ 5xx 錯誤率(修正)**:naive `sum(rate(…5xx…))/clamp_min(…)` 在無 5xx 樣本時 numerator 空 vector→**整除 0 series**(grafana "No data")→ 用 **`(sum(rate(axum_http_requests_total{status=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(axum_http_requests_total[5m])),1)`**(live 驗回 `0` 非空)。
  - in-flight:`axum_http_requests_pending`(8 series gauge)。
  - enforce allow/deny 率:`sum by (decision) (rate(casbin_enforce_total[5m]))`(live `decision=allow`;deny 首次 deny 後自動現、無需改 query)。
- **master overview 板**(live 全驗):`up{job=~"rust-api|postgres|redis|pushgateway"}`(4 series=1)/ `pg_up`(1)/ `redis_up`(1)/ `sum(rate(axum_http_requests_total[5m]))`(0.0715)/ deny 率 / cleanup age(見 R6)。

## R6 — greenfield cleanup-job PromQL（D1、★ 現無 fresh 樣本）

- **Decision**: 板用 `cleanup_job_last_success_timestamp`(stat→轉日期)/ `time()-cleanup_job_last_success_timestamp`(age 秒→staleness)/ `cleanup_job_rows_deleted`(stat+時序)/ `up{job="pushgateway"}`(pushgateway 健康)。
- **★ live 現況(重要)**: `cleanup_job_*` 在 prometheus **series index 有**(`/api/v1/series` 回 `{__name__:cleanup_job_last_success_timestamp,job:cleanup_job}`、證 metric/label 形狀真)、**但 instant query 0 series**(上次 push 已過期、pushgateway 現無 cleanup_job group)。屬短命 job 預期 —— 板顯「No data」直到 cleanup-job 再跑 push。**`up{job="cleanup_job"}` 不存在**(0 series 確認、cleanup_job 是 pushgateway honor_labels group、非 scrape target)→ **不做 cleanup_job target-up panel**、改 key off timestamp gauge age。acceptance 須先觸發一次 cleanup-job push(同 032 C6)再驗板有資料。

## R7 — greenfield audit-log LogQL（D1/D3、loki、live 驗 + 修正）

- **loki labels**: `compose_project`/`container`/`service`/`service_name`;`service` 13 值(rust-api/front-nginx/postgres/redis-stack/…)。
- **★ log 形狀(live 檢真實行)**: **rust-api**:`level` **top-level**(`"level":"INFO"`);`trace_id`/`method`/`path`/`status`/`message` **nested 在 `fields`** → `| json` 後是 `fields_trace_id`/`fields_method`/…(對齊 031 memory)。**front-nginx**:flat JSON、top-level `status`(string `"200"`)/`request_id`/`method`/`uri`(JSON key `service` 撞 stream label、loki 自動 rename `service_extracted`、無害)。
- **panel LogQL(live 驗)**:
  - log 量 by service:`sum by (service) (count_over_time({compose_project="rev2-admin"}[5m]))`(7 服務 live)。
  - rust-api error/warn:`sum(count_over_time({service="rust-api"} | json | level=~"ERROR|WARN" [5m]))`(`level` top-level、正確;live 0〔現只 INFO〕);by level:`sum by (level) (count_over_time({service="rust-api"} | json [5m]))`(`level=INFO`=20)。
  - **★ nginx access status(修正必要)**:裸 `{service="front-nginx"} | json` 回 **HTTP 400 `JSONParserErr`**(front-nginx stream 有非-JSON boot/error 行)→ **必須先 `|~ \`^{\`` 過濾 JSON 行**:`sum by (status) (count_over_time({service="front-nginx"} |~ \`^{\` | json [5m]))`(live `status="200"`=32)。`|= \`request_id\`` 為等價替代。~~**rust-api `| json` 不需此 guard**(全 valid JSON)。~~ **★ as-built 修正(Unit 8 acceptance live 推翻)**:此假設錯。本專案 C0 recipe 用 `docker run rev2-admin-rust-api:dev` 跑 cleanup-job,alloy 依 image 把其純文字 stdout 也標成 `service="rust-api"` → rust-api 串流非全 JSON → 無 guard 的 `{service="rust-api"} | json` 回 400 JSONParserErr(實證未 guard `[30m]`=400、guarded=200)。**rust-api `| json` 三 panel(error·warn/by-level/enforce-deny)同樣須 `|~ \`^{\`` guard**(commit 5fa6a1c)。教訓:任一 service 用 `| json` 預設都加 guard、不信「全 JSON」假設。
  - trace_id drill-down:`{service="rust-api"} | json | fields_trace_id="<uuid>"`(live 對真 trace_id 命中 1 行)。

## R8 — loki uid patch（D4）+ Constitution §IV pre-check

- **★ loki uid patch 風險判定:SAFE**。patch = `deploy/grafana-provisioning/datasources/loki.yml` 加 `uid: loki`(現 auto-gen `P8E80F9AEF21F6940`)。證據:① **repo 無任何 `*.yml/*.yaml/*.json` 引用該 auto-gen uid**(只 033 brainstorm doc 2 處說明性提及);② **0 dashboard 存在**(`/api/search?type=dash-db`=0);③ grafana Explore 依 **名稱**("Loki")選 datasource、不依 uid → 既有 Explore 不破;④ **3 條 032 alert rule 全綁 `prometheus`/`__expr__`、無一綁 loki**;⑤ 先例:`prometheus.yml` 已顯式 `uid:prometheus`、provision 乾淨;loki `editable:false`/`readOnly:true` 全 provisioning-owned、依名 match 原地更 uid。~~**implementer 只需 force-recreate grafana** reload loki.yml~~;loki `isDefault:true`(loki.yml 既設)force-recreate 後保留。新板:audit-log 引用 `uid:loki`、其他 3 板 `uid:prometheus`。
- **★ as-built 修正(Unit 1 實作 live 推翻、user 拍板)**:「只需 force-recreate」錯、會 **crash-loop**。R8 只查 config 引用、漏了 **persisted volume 裡的 datasource row**:Loki 在 031 是無 uid 首次 provision、auto-gen uid `P8E80F9AEF21F6940` 已 persist 進 `grafana_data` 卷,改顯式 uid 時 provisioner 以新 uid 找既有 datasource、找不到 → `data source not found` → provisioning module not healthy → grafana 起不來。**修:loki.yml 加 `deleteDatasources:[{name:Loki,orgId:1}]`** 先按名刪舊 row 再以 uid 重建(對 fresh volume no-op、idempotent、純 config、零手動步驟;**部署地雷**:已跑 031/032 的環境落 033 必經此修)。Prometheus 不中招是因 032 一出生就帶 uid(無 stale row)。實證:加 deleteDatasources 後 grafana restarts=0、Loki uid=loki、3 alert + loki Explore 守恆不破。

| §IV Q | 結論 | 依據 |
|---|---|---|
| 1 §I.1 base-web 權威/缺 endpoint? | **PASS（N/A）** | 無 wire 端點、base-web 零改;dashboard 是 grafana ops config。 |
| 2 動 base-web inline / ★ 軌道? | **PASS（N/A）** | base-web 零改。 |
| 3 §I.2 menu Casbin? | **N/A** | 不涉 menu。 |
| 4 §I.3 wire 對齊 mock? | **PASS（N/A）** | 無 wire;dashboard JSON = grafana config。 |
| 5 §I.5 rev1 拷貝? | **PASS** | app dashboard greenfield;infra 用官方 exporter dashboard(upstream 工具、版本鎖 exporter tag、非 rev1 source);未讀/拷 rev1 obs dashboard。 |
| 6 §II §8.5/§11.8 obs 拍板? | **PASS** | §8.5 obs 漸進堆疊;dashboard 是觀察面、§2.37 已列 dashboard-provisioning feature;無拍板撤回。 |
| 7 §III ★ 軌道? | **PASS（N/A）** | `deploy/grafana-provisioning/` = infra config、非 ★ 軌道。 |
| 8 新建業務表 §I.6? | **PASS（N/A）** | 無 migration/表(dashboard 在 grafana)。 |

**結論:8/8 PASS、無 amendment、無新 crate/表/migration/secret、base-web+rust-api 零改。** §3 紀律「新 workspace crate ⇒ prod build」**嚴格不觸發**(無 rust 改動、純 grafana config);C-V 仍含 prod `--profile obs --profile metrics` 起驗 dashboards internal-only(FR-010)。
