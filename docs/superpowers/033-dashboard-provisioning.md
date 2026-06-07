# 033-dashboard-provisioning — spec-design（階段 0 brainstorm）

> 本檔為 feature 033-dashboard-provisioning 的 Phase 0 brainstorm spec-design（CLAUDE.md §3 階段 0）。
> 定案後由 **user 手動 `/speckit-specify`**（讓 `speckit.git.feature` pre-hook 建 `033-dashboard-provisioning` branch）→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`。
> 本檔不是 spec.md;它是餵給 `/speckit-specify` 的設計輸入。

**Feature**: observability — **dashboard provisioning**（Phase 6 obs 第三刀;接續 031 obs-min log + 032 obs-full metrics,把 obs 從 Explore + alert-only 變成現成維運面板）
**Created**: 2026-06-08
**前序**: **031-obs-min ✅ merged `3383828`**（loki+alloy+grafana log）+ **032-obs-full ✅ merged `a13f85f`**（prometheus + 2 exporter + pushgateway + grafana datasource/baseline alert）。033 為 DESIGN §10 Phase 6 #3「dashboard provisioning」、§2.37「grafana dashboard(metrics)留 dashboard-provisioning feature」的落點。

---

## 1. 目標（purpose / success criteria）

維運者（人類或 AI）開 grafana 即見**現成面板**（非每次 Explore 手打 PromQL/LogQL）,一眼掌握全 stack 健康 + app 細節 + infra 深度 + 維運 job 狀態 + log pipeline —— 把 031 log + 032 metrics 補成「可用維運 surface」。

**Success criteria**:
- grafana（`--profile obs --profile metrics`）起 → 6 張 dashboard 隨部署 **provision 就緒**（非空、無「datasource not found」、provisioning log 乾淨）。
- 每張代表 panel 經 datasource proxy 查得真實資料（rust-api 請求率/延遲分位 / pg·redis 深度 metric / cleanup_job 上次成功 / log 量 by service）。
- **純 infra/config**:**base-web + rust-api 零改**、無 migration/新 crate/新 secret、無新 compose service。
- prod `--profile obs --profile metrics` → dashboards provision、internal-only（無對外 host port，沿 031/032）。

---

## 2. 決策拍板（brainstorm 2026-06-08）

| # | 決策 | 拍板 | 理由 |
|---|---|---|---|
| **D1** | 範圍 / 深度 | **完整 6 張 + 深 panel**:master overview / rust-api / postgres / redis / audit-log / **cleanup-job**（③ user 親加專板） | user 親選「全面深入」+ cleanup-job 專板。一刀補齊觀察面板(鏡像 032「一刀做完整」)。 |
| **D2** | dashboard JSON 來源 | **hybrid**:**postgres/redis 用官方 exporter dashboard**(postgres_exporter/redis_exporter 專案/grafana.com 提供、pin revision)provision 進來;**master/rust-api/audit-log/cleanup-job greenfield 自寫**(貼 rev2 自家 metric/label) | user 親選。深 pg(348)/redis(182) 面板自寫工程大且重造 exporter 專案已有的輪子;官方 exporter dashboard = upstream 工具(同用 exporter image 本身)、非拷 rev1 source → **不破 §I.5**。 |
| **D3** | trace_id 處理(audit-log dashboard) | **純 config、零 rust-api 改**:LogQL `\| json \| fields_trace_id`(nested 路徑、現已穩定可查);trace_id 逐筆細查走 Explore drill-down | user 親選。維持純 infra/config(同 031/032、base-web+rust-api 零改、不動 worktree);flatten_event 是全域改 rust-api log 形狀、需重驗所有 log 消費者(§2.36)、過度。 |
| **D4** | loki datasource uid | **補 031 `loki.yml` 顯式 `uid: loki`** | 現 loki uid auto-gen(`P8E80F9AEF21F6940`、grounding probe 證);log dashboard 靠 uid 引用 loki、無顯式 uid 會 rot(換環境/重 provision 斷)。prometheus 已顯式 `uid:prometheus`(032)。一行 deploy config 改、user 核可。 |
| **D5** | provisioning 機制 | 新 `deploy/grafana-provisioning/dashboards/`:provider yaml(`apiVersion:1`+`providers:`)+ dashboard JSON 檔;dev/prod compose 已掛整個 `grafana-provisioning/` 目錄 → 自動含括(無新 mount) | 沿 031/032 既有 provisioning 範式(datasources/ + alerting/ + 新 dashboards/)。dashboards 進一個 grafana folder(鏡像 032 alert 進 `obs-full` folder)。 |
| **D6** | profile / runtime | **無新 compose service**;dashboards 隨 grafana 起就 provision;panel 有資料 = 對應 datasource stack 在跑(loki 板需 `--profile obs`、prometheus 板需 `--profile metrics`、完整=兩個) | grafana 已雙 profile(032 `["obs","metrics"]`)。dashboard 只是 grafana config、不需 service。 |
| **D7** | acceptance 取徑 | **活體 curl C-V**(鏡像 031/032):provision 就緒 + datasource 解析 + panel query 回資料 + log 乾淨 + prod internal-only;**無新單元測試、無 CDP**(grafana 是 ops UI、非 base-web) | 純 config、無純函式;grafana 非 base-web → 不適用 CDP(同 031/032 N/A)。 |
| **D8** | greenfield 紀律(§I.5) | app dashboard(master/rust-api/audit-log/cleanup-job)greenfield 自寫;**infra(pg/redis)用官方 exporter dashboard = upstream 工具、非 rev1 source** | 守 §I.5:不讀/拷 rev1 obs dashboard;官方 exporter dashboard 是 exporter 專案 deliverable(同 image)、與 rev1 無關。rev1 obs-full 若有 dashboard 僅作「問題理解」概念參考、不拷。 |

---

## 3. Grounding 驗證事實（live probe 2026-06-08,不信抽象假設）

- **prometheus 實際 metric 598 個**(`/api/v1/label/__name__/values`):`axum_*` 5(`axum_http_requests_total`/`..._duration_seconds_bucket`·`_count`·`_sum`/`axum_http_requests_pending`)、`casbin_enforce_total` 1、`pg_*` **348**、`redis_*` **182**、`cleanup_job_*` 2(`cleanup_job_last_success_timestamp`/`cleanup_job_rows_deleted`)、`up` 1。
- **loki 實際 label**:`service`(12 值:alloy/front-nginx/grafana/loki/migrate/postgres/postgres_exporter/prometheus/pushgateway/redis-stack/redis_exporter/rust-api)、`compose_project`/`container`/`service_name`。rust-api log trace_id 在 `fields_trace_id`(nested、§2.36)、nginx `request_id`(top-level)。
- **★ datasource uid**:`prometheus` 顯式(032 `datasources/prometheus.yml:8`)、**`loki` auto-gen `P8E80F9AEF21F6940`**(031 `loki.yml` 無 uid 欄)→ **D4 必補**。
- **provisioning 結構**:`deploy/grafana-provisioning/` 現有 `datasources/`(loki.yml/prometheus.yml)+ `alerting/`(rules.yml)、**無 `dashboards/`**。dev/prod compose 掛整個目錄(`./deploy/grafana-provisioning:/etc/grafana/provisioning:ro`)。
- **grafana 13.0.2**(reuse 031/032)、`["obs","metrics"]` 雙 profile。WSL2:改 provisioning 後 grafana 須 `--force-recreate`(非 restart、drvfs bind-mount shadow-path 衝突、§DESIGN §10 Phase 6 #2 gotcha)。

---

## 4. 完整設計

### 4.1 6 張 dashboard

| # | dashboard | datasource | 來源 | 關鍵 panel(grounded 真實 metric/label) |
|---|---|---|---|---|
| 1 | **master overview** | prometheus | greenfield | 全 target `up{job}`(rust-api/postgres/redis/pushgateway + 酌 obs)/ rust-api 請求率·5xx 錯誤率 / enforce deny 率 / `pg_up`·`redis_up` / `cleanup_job` 距上次成功 age |
| 2 | **rust-api** | prometheus | greenfield | `axum_http_requests_total` rate by endpoint·status / 延遲 p50·p95·p99(`histogram_quantile` on `axum_http_requests_duration_seconds_bucket`)/ 5xx·4xx 率 / `axum_http_requests_pending` in-flight / `casbin_enforce_total{decision}` allow·deny 率 |
| 3 | **postgres** | prometheus | **官方 postgres_exporter dashboard**(pin) | connections / db size / tx(commit·rollback)rate / cache hit / locks / replication …(吃 348 pg_*) |
| 4 | **redis** | prometheus | **官方 redis_exporter dashboard**(grafana.com 763 或 repo、pin) | memory used / clients / hit rate / commands/s / keyspace keys / persistence …(吃 182 redis_*) |
| 5 | **audit-log** | loki | greenfield | log 量 by `service`(12 服務)/ error·warn 率 / nginx access 率·狀態碼 / rust-api enforce-deny log / trace_id 走 `\| json \| fields_trace_id`(D3 nested) |
| 6 | **cleanup-job** | prometheus | greenfield | 上次成功時間(`cleanup_job_last_success_timestamp` 轉日期)/ 距上次清理 age(`time()-cleanup_job_last_success_timestamp`、staleness 訊號)/ 上次清理筆數(`cleanup_job_rows_deleted`)/ rows_deleted 時序 / pushgateway·cleanup_job target `up` |

### 4.2 provisioning 機制
- 新 `deploy/grafana-provisioning/dashboards/`:**1 個 provider yaml**(`apiVersion:1` + `providers:` 含 `name`/`folder`/`type:file`/`options.path`/`foldersFromFilesStructure`)+ **6 個 dashboard JSON 檔**。dev/prod compose 已掛整個 `grafana-provisioning/` → 新子目錄自動含括(**無新 mount**)。
- dashboard 靠 datasource **uid** 引用:`prometheus`(✓ 032 顯式)+ **`loki`(D4 補顯式 uid)**。
- 社群 dashboard(pg/redis):下載官方 JSON + commit + datasource 引用調成 `prometheus` uid(處理 grafana.com `${DS_PROMETHEUS}` `__inputs`)、**pin revision**(對應 postgres-exporter v0.19.1 / redis_exporter v1.85.0 的 metric 命名)。
- grafana folder:6 板進一個 folder(鏡像 032 alert `obs-full` folder)。

### 4.3 改動清單(全 outer/deploy、worktree 零改)
- 新 `deploy/grafana-provisioning/dashboards/<provider>.yaml` + 6 個 dashboard JSON(3 greenfield + 2 community + 1 cleanup-job greenfield)。
- 改 `deploy/grafana-provisioning/datasources/loki.yml`(031 檔)— 加 `uid: loki`(D4)。
- 無 compose/secret/rust-api/base-web 改動。

---

## 5. 範圍外（OUT — 明確不做）
- **alert 送信管道**(SMTP/webhook、§2.37)→ 需真實 creds、security pass。
- **obs/metrics 對外暴露 + TLS + 採集端 auth**(§2.36)→ security pass。
- **flatten_event**(D3 維持 nested `fields_trace_id`)→ 全域 rust-api log 改、本刀不碰。
- **新 metrics / exporter / alert rule**(032 已做;本刀只「畫」現有 metric)。
- **dashboard 內嵌 alert / annotation 自動化**(超出 baseline、未來)。
- **rev1 obs dashboard 拷貝**(§I.5 greenfield、D8)。

---

## 6. Constitution pre-check（v1.6.0 §IV 8 問、待 plan Constitution Check 複核）

| # | 問項 | 預判 |
|---|---|---|
| 1 | §I.1 base-web 權威/缺 endpoint? | **PASS（N/A）**:無 wire 端點、base-web 零改;dashboard 是 grafana ops config。 |
| 2 | 動 base-web inline / ★ 軌道? | **PASS（N/A）**:base-web 零改。 |
| 3 | §I.2 menu Casbin? | **N/A**:不涉 menu。 |
| 4 | §I.3 wire 對齊 mock? | **PASS（N/A）**:無 wire;dashboard JSON = grafana config、非 base-web wire。 |
| 5 | §I.5 rev1 拷貝? | **PASS**:app dashboard greenfield;infra 用官方 exporter dashboard(upstream 工具、非 rev1 source、D8);不讀/拷 rev1 obs dashboard。 |
| 6 | §II 拍板(§8.5/§11.8 obs)? | **PASS**:§8.5 obs 漸進堆疊;dashboard 是 obs 觀察面、§2.37 已列為 dashboard-provisioning feature;無拍板撤回。 |
| 7 | §III ★ 軌道? | **PASS（N/A）**:`deploy/grafana-provisioning/` = infra config、非 ★ 軌道(MODAL-WIRING/BASE-WEB-BUILD-CONFIG 皆 base-web)。 |
| 8 | 新建業務表 §I.6 審計欄? | **PASS（N/A）**:無 migration/表(dashboard 在 grafana、非 DB)。 |

**預判:8/8 PASS、無 amendment、無新 crate/表/migration/secret、base-web+rust-api 零改。**

---

## 7. plan 階段待 grounding（/speckit-plan research.md 必補）

1. **grafana 13.0.2 dashboard provisioning 格式**:provider yaml schema(`apiVersion:1` + `providers[].options.path` + `foldersFromFilesStructure` + `folder`/`folderUid`)+ dashboard JSON `schemaVersion`(pin 13.0.2 相容版、避免太新被拒或太舊 deprecated panel);dashboard JSON 檔在容器內掛載路徑(provider path 指向、現有目錄 mount 下的子路徑)。WebSearch + 對 live grafana 驗。
2. **官方 exporter dashboard pin**:postgres_exporter 官方 dashboard(prometheus-community repo 的 `postgres-exporter.json` 或 grafana.com ID)+ redis_exporter dashboard(grafana.com **763** 或 oliver006 repo `contrib/grafana_prometheus_redis_dashboard.json`);**pin 明確 revision**、且**對實際 metric 命名驗**(本 stack postgres-exporter v0.19.1 / redis_exporter v1.85.0 暴露的 `pg_*`/`redis_*`,確認 dashboard 的 query 對得上、非 stale 命名)。
3. **社群 dashboard datasource 接法**:grafana.com export 帶 `__inputs`/`${DS_PROMETHEUS}` template var;file-provisioning 須把 datasource 引用 resolve 成 `prometheus` uid(改 JSON 或設 grafana env default)。
4. **greenfield dashboard JSON 製法**:hand-write vs 在 live grafana(HTTP API / UI)建好再 export JSON commit。export-from-live 較可靠(schema 正確、同 032 alert rule 對 live 迭代);hand-write 全控但 fiddly。plan/implementer 拍板(建議 export-from-live + 對 live grafana 迭代驗,如 032 Unit E)。
5. **loki uid 補丁不破 031**:`loki.yml` 加 `uid: loki` 後重 provision、確認既有 loki Explore/datasource 不破(by-name 引用或新 uid 皆可解);grafana force-recreate 套用。
6. **grafana folder 經 provider 建**:provider yaml `folder:` 自動建 folder(鏡像 032 alert `obs-full`);pin folder 名。
7. **panel query 精確 grounding**:每 greenfield panel 的 PromQL/LogQL 對 §3 實際 metric/label 名寫(histogram p99 = `histogram_quantile(0.99, sum by(le)(rate(axum_http_requests_duration_seconds_bucket[5m])))` 等)。

---

## 8. acceptance 取徑（待 contracts/verification-commands.md）

- **無新單元測試**(dashboard 全 config);**無 CDP**(grafana ops UI、非 base-web、同 031/032 N/A)。
- 活體 C-V(鏡像 031/032、curl + grafana API):
  - C1 6 張 dashboard provisioned:grafana `/api/search?type=dash-db` 列 6 張(master/rust-api/postgres/redis/audit-log/cleanup-job)、在指定 folder。
  - C2 datasource 解析:每張開啟無「datasource not found」(驗 D4 loki-uid 修、prometheus uid)。
  - C3 panel query 回資料:經 datasource proxy 查代表 query(rust-api 請求率·延遲分位 / pg_up·pg connections / redis memory / cleanup_job_last_success_timestamp / log 量 by service)回非空。
  - C4 provisioning log 乾淨:`docker logs grafana | grep -i 'dashboard\|provision'` 無 load error(忽略無關 plugins/missing-dir 警告)。
  - C5 prod:`-f docker-compose.prod.yml --profile obs --profile metrics` → dashboards provision、internal-only(grafana 無對外 host port)。
  - 守恆:compose 多模 config parse + grafana 乾淨 boot + **031/032 不破**(loki/prometheus datasource + alert rule 仍在、loki uid 改後 Explore 不破)。

---

> **交棒**:本 spec-design 定案後 → **user 手動 `/speckit-specify`**(input=本檔、pre-hook 建 `033-dashboard-provisioning` branch)。Claude 不替你觸發(避免漏 `speckit.git.feature`)。
