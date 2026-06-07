# Phase 0 Research — 032-obs-full

> 所有決策以 grep 過的 rev2 `file:line` 或 WebSearch 驗證版本為據（6 平行 research agent + inline grep）。**§I.5 紀律：全 greenfield、未讀任何 rev1 source**（rev1 obs-full `specs/044` + `docker-compose.observability.yml` 僅概念參考）。NEEDS CLARIFICATION：無（spec 0 markers、brainstorm D1-D9 拍板）。
> 月份基準 2026-06;版本皆 WebSearch 驗 current stable、無 rc/beta/floating。

---

## R1 — rust-api metrics 出法（axum-prometheus + enforce 自埋、D3/D9）

- **Decision**: server crate 加 **`axum-prometheus = "0.7.0"`**（HTTP request metrics + `/metrics` render handle）+ **`metrics = "0.23"`**（自埋 enforce counter）。`PrometheusMetricLayer::pair()` → `(layer, handle)`,`/metrics` route render handle、`.layer(layer)` 全域裝在 router;enforce_mw 用 `metrics::counter!("casbin_enforce_total", "decision"=>"allow"|"deny").increment(1)`。
- **★ 版本 pin 理由（MSRV 關鍵、避 013 jsonwebtoken 覆轍）**: axum-prometheus **0.7.0 是最後相容 axum 0.7 的版**（0.8.0 起 bump axum 0.8 + matchit 0.8、route param `/:id`→`/{id}` breaking;0.10.0 為 axum 0.8 線）。0.7.0 帶 transitive **`metrics 0.23.0`** + **`metrics-exporter-prometheus 0.15.0`**;MSRV：axum-prometheus 1.70 / metrics stack 1.71.1，**皆 ≤ 1.86、無 MSRV bite**。
- **custom counter 機制**: `PrometheusMetricLayer::pair()` 內部 `metrics::set_global_recorder(...)`(0.7.0 lib.rs 證) → 全 process 任何 `metrics::counter!`/`gauge!` 都進同 recorder、從同 `handle.render()` 出。**故 enforce counter 零額外 wiring**;但自埋的 `metrics` crate **major 須對齊 0.23**(Cargo.lock 不一致則 custom metric 靜默掉)。
- **cardinality（FR-012）**: axum-prometheus 預設 `EndpointLabel::MatchedPath` = **matched route pattern**(`/users/:id`、低基數),非 raw path。built-in metric:`axum_http_requests_total`/`axum_http_requests_duration_seconds`/`axum_http_requests_pending`,label = method/endpoint(matched)/status。`.layer()` 裝在 router 上才取得 axum `MatchedPath` extension(404/unmatched fallback raw path、可接受)。
- **Grounding**: `rust-api/Cargo.toml` 無任何 metrics/tower-http/prometheus(全空 grep);`server/src/main.rs:117` `Router::new()`、`:118 /health` 公開無 middleware → `/metrics` 同擺法;`server/src/auth/enforce.rs:102 allowed=false` → `:105-119` per-role enforce loop → `:119 if allowed{pass}else{403+5003}` + `:94` fail-closed deny = D9 三 outcome 落點。
- **caveats**: `set_global_recorder` 一次/process — `pair()` 多呼或另裝 PrometheusBuilder 會 panic「Failed to set global recorder」;測試反覆起 app 會 flake → **用 `OnceCell`/`OnceLock` guard** 或 init 一次。`/metrics` 為 unauth plaintext、掛在 auth 外、**僅內網**(prod internal-only + nginx 不 proxy `/metrics`、R7)。tower 0.4/tower-http 0.5 為 0.7.0 pinned middleware、與既有 axum 0.7 stack 無衝突。
- **Alternatives**: 自寫 metrics layer(D3 已選現成、reject)/ 0.10.0(axum 0.8、reject 不相容)。

## R2 — prometheus server（pin / retention / scrape config）

- **Decision**: **`prom/prometheus:v3.12.0`**(2026-05-28 current stable、**前導 v 是 tag 一部分**)。command `--config.file=/etc/prometheus/prometheus.yml` + `--storage.tsdb.path=/prometheus` + **`--storage.tsdb.retention.time=15d`**(顯式 bounded、鏡像 loki 72h 精神;7d 可更緊)。volume `prometheus_data:/prometheus`(image 跑 user nobody uid 65534、named volume 可寫)。
- **scrape config**(`deploy/prometheus/prometheus.yml`、static、greenfield 固定 targets):`global.scrape_interval:15s`;jobs:`rust-api`(`rust-api:21081`、metrics_path `/metrics`)、`postgres`(`postgres_exporter:9187`)、`redis`(`redis_exporter:9121`)、`pushgateway`(`pushgateway:9091`、**`honor_labels:true`**)、(可選 prometheus 自身)。**target 用 compose service name + 容器內 port**(非 host-mapped、prometheus 走 compose 網路 scrape)。
- **Rationale**: v3.12.0 = current stable line head(非保守 LTS v3.5.x);static_configs 對固定 4-target 單機最簡(不需 docker-SD、不同於 loki/alloy 的動態容器 stdout 採集)。
- **caveats**: prometheus 3.x 為 major 線(vs 2.x、deprecated flag 移除/新 UI/PromQL 行為變)、greenfield 無遷移痛但別抄 2.x config;rust-api `/metrics` + 2 exporter + pushgateway 須先 expose 否則 job DOWN(本 feature 一併建);§3 紀律:新 rust deps 進 runtime → **acceptance 含 prod build**。
- **Grounding**: WebSearch [prometheus releases](https://github.com/prometheus/prometheus/releases)(v3.12.0 2026-05-28)。CLAUDE §8.2 prometheus 23090 已保留。

## R3 — postgres_exporter（pin / secret / least-priv）

- **Decision**: **`prometheuscommunity/postgres-exporter:v0.19.1`**(2026-02-25 stable、Docker Hub mirror;quay.io primary。**image 名 hyphen `postgres-exporter`、repo 名 underscore**)。port **9187**(內網、無 host port)。`profiles:[metrics]`。
- **secret（★ 修正 brainstorm 假設）**: **無 `DATA_SOURCE_NAME_FILE`**。secret-from-file 須拆 `DATA_SOURCE_URI_FILE`+`DATA_SOURCE_USER_FILE`+`DATA_SOURCE_PASS_FILE`。**本 feature 取簡:reuse 既有 `postgres_password` secret** —— `DATA_SOURCE_USER=soybean`(env)+`DATA_SOURCE_URI=postgres:5432/soybean_admin_rust?sslmode=disable`(env、無 creds)+**`DATA_SOURCE_PASS_FILE=/run/secrets/postgres_password`**(既有 secret)。**無需新 secret、無 migration**。
- **least-priv（defer follow-up）**: R3 建議專用唯讀 role(`CREATE USER postgres_exporter; GRANT pg_monitor`、PG10+、零寫/DDL),但需 migration + CREATE ROLE(全專案無先例、030 follow-up 已 defer 同類)。**本 feature reuse soybean superuser DSN(internal-only 可接受)、least-priv role 登記 follow-up**(合 030 least-priv PG role 軌道)。pg_monitor 邊角(issue #1032)亦留該時評估。
- **Grounding**: WebSearch [postgres_exporter releases](https://github.com/prometheus-community/postgres_exporter/releases)(v0.19.1)、README env(無 `DATA_SOURCE_NAME_FILE`、有 URI/USER/PASS `_FILE` trio)、CI 測 PG13-18(17 支援)。既有 `deploy/secrets/postgres_password.txt`(soybean 密碼)。
- **Alternatives**: 單一 `DATA_SOURCE_NAME`(dev 可、prod 想 file 化故用 PASS_FILE)/ 新 `postgres_exporter_dsn` secret(brainstorm 預登、本 feature 改 reuse、reject 多餘)。

## R4 — redis_exporter（pin / secret reuse）

- **Decision**: **`oliver006/redis_exporter:v1.85.0`**(2026-06-04 stable;quay.io/ghcr.io mirror)。port **9121**(內網)。`REDIS_ADDR=redis://redis-stack:6379`(service short-name、容器內 6379 非 host 26379)。`profiles:[metrics]`。
- **secret（★ 修正 brainstorm 假設）**: **`REDIS_PASSWORD_FILE` 不是純密碼檔** —— 它要 JSON map `{"redis://redis-stack:6379":"<pw>"}`(指向既有 raw-password `redis_password.txt` 會 `NOAUTH` fail、upstream #613)。**取簡:sh-wrapper reuse 既有 `redis_password` secret** —— `entrypoint:["/bin/sh","-c"]` + command `export REDIS_PASSWORD="$(cat /run/secrets/redis_password)"; exec /redis_exporter`(或 inline 進 REDIS_ADDR)。**無需新 secret、無需專用 redis_exporter_password**。
- **Rationale**: v1.85.0 newest stable;redis-stack-server 標準協定相容、baseline INFO metric 開箱即得(RedisJSON/Search module metric opt-in、不需)。sh-wrapper 讀既有 secret = 零新 secret。
- **Grounding**: WebSearch [redis_exporter releases](https://github.com/oliver006/redis_exporter/releases)(v1.85.0)、contrib/sample-pwd-file.json(JSON map 格式)、issue #613。既有 `deploy/secrets/redis_password.txt`。
- **Alternatives**: `REDIS_PASSWORD_FILE` + 專用 JSON-map secret(brainstorm 預登 `redis_exporter_password`、reject 多餘維護)。

## R5 — pushgateway + cleanup-job push（D6）

- **Decision**: **`prom/pushgateway:v1.11.3`**(2026-05-27 stable、無 v1.12)。port **9091**(host 29091 §8.2 保留、prod internal-only)。`profiles:[metrics]`。**cleanup-job(獨立 crate `rust-api/cleanup-job/src/main.rs`)加 push**:`metrics-exporter-prometheus` `PrometheusBuilder::new().install_recorder()` → `metrics::gauge!` 記 → `handle.render()` 取 text → **blocking HTTP PUT `http://pushgateway:9091/metrics/job/cleanup_job`**(用 `ureq` 或 `reqwest::blocking`、~5 行、無 tokio、deterministic exit)。
- **push 細節**: PUT = 全替換該 grouping key(per-run snapshot 正確);body = prometheus text(**LF 結尾必要**、`render()` 已正確);gauge:`cleanup_job_last_success_timestamp`/`cleanup_job_rows_deleted`。scrape 端 **`honor_labels:true`**(保 pushed job/instance label 不被改名 exported_*)。**best-effort**:push 失敗(pushgateway 未起)只 log warn、不破 cleanup(FR-008 旁路)。
- **Rationale**: **不用 `with_push_gateway`**(interval-only 背景 task、需 runtime 活著、one-shot binary 不適);`install_recorder()`+`render()`+blocking PUT 才是 one-shot 正解。stale-metric trap(last-write-wins、run 間讀舊值)對 batch job 預期、靠 `last_success_timestamp` + `time()-` 告警偵測 stalled。
- **caveats**: pushgateway in-memory(restart 失憶、不需 `--persistence.file`);metrics-exporter-prometheus 0.15 MSRV 須 Cargo.lock 確認 ≤1.86(current 在範圍內);install_recorder 一次/process(one-shot 無妨)。
- **Grounding**: WebSearch [pushgateway releases](https://github.com/prometheus/pushgateway/releases)(v1.11.3)、push API doc(PUT/POST grouping key + text format + honor_labels)。CLAUDE §8.2 pushgateway 29091 保留。cleanup-job 為 workspace member(`rust-api/cleanup-job/`、030 落地)。

## R6 — grafana provisioning（prometheus datasource + unified alerting）

- **Decision**: reuse **`grafana/grafana:13.0.2`**(031 pin、無新 image)。加 2 tracked 檔:`deploy/grafana-provisioning/datasources/prometheus.yml`(prometheus datasource、**`isDefault:false`**〔loki 已 default〕+ **顯式 `uid: prometheus`**〔alert rule datasourceUid 要對得上〕、`url:http://prometheus:9090`、`editable:false`、`jsonData.httpMethod:POST`+`timeInterval:15s`)+ `deploy/grafana-provisioning/alerting/rules.yml`(unified alerting rule group)。**031 已 bind-mount 整個 `grafana-provisioning/` → alerting/ 子目錄自動覆蓋、無需新 mount**。grafana service profile 改 `["obs","metrics"]`。
- **baseline alert rule（D7、覆蓋 FR-005 三失效型）**: rule group `obs-full-baseline`(folder `obs-full`、auto-create)含 **3 條** grafana-managed rule(皆 query A + `__expr__` C、`datasourceUid:prometheus`、`noDataState:Alerting`/`execErrState:Alerting`):**(a)** `rust-api-target-down`〔後端應用不可用〕`up{job="rust-api"}` + threshold `lt 1`、`for:2m`、severity critical;**(b)** `infra-exporter-down`〔基礎設施採集不可達〕`up{job=~"postgres|redis"}` + `lt 1`、`for:2m`、critical;**(c)** `rust-api-high-5xx-rate`〔錯誤率過高〕`sum(rate(axum_http_requests_total{status=~"5.."}[5m]))/clamp_min(sum(rate(axum_http_requests_total[5m])),1)` + threshold `gt 0.05`、`for:5m`、warning。
- **★ contact point / channel（D7 defer 證實可行）**: alert rule **可在無 contact point/notification policy 下 provision + 評估 + Firing**(grafana 內建 default contact point `grafana-default-email` + root policy backstop;notification 產生但 SMTP 未設→silently drop = 正是「channel deferred」狀態)。**不要** provision notification-policies 檔重指 root receiver(會 dangling-receiver boot error)。contact point/policy = OUT(separate 檔)。
- **★ graceful degradation 證實**: datasource provisioning **不 boot-time health-check** url → `--profile metrics` 不帶 `--profile obs`(loki 未起)grafana 仍乾淨 boot、loki datasource 只在 Explore 查時報錯。**唯一 block boot = provisioning YAML 語法錯** → 須驗 YAML。
- **caveats**: alert rule `datasourceUid` 須對上真實 UID → **datasource 設顯式 `uid:prometheus`**(否則 auto-random UID、rule resolve 失敗、#1 provisioned-alerting footgun);一 org 只一 `isDefault:true`(loki 已佔、prometheus 設 false);provisioned rule/datasource `editable:false`(改要編檔 + grafana reload)。
- **Grounding**: WebSearch grafana provisioning doc(datasource YAML + alerting rule group schema apiVersion:1)、default contact point community thread。031 `deploy/grafana-provisioning/datasources/loki.yml`(isDefault:true 範式) + `docker-compose.dev.yml` 掛 `./deploy/grafana-provisioning:/etc/grafana/provisioning:ro`(整目錄)。

## R7 — compose / profile / nginx / port 接線（inline grep）

- **profile（D4）**: 新 `profiles:["metrics"]` 加 prometheus/postgres_exporter/redis_exporter/pushgateway;**grafana 改 `["obs","metrics"]`**(兩 profile 共用 UI、否則 metrics-only 無 grafana)。完整 = `--profile obs --profile metrics`。一般 up 不啟(FR-006)。
- **port（CLAUDE §8.2 保留）**: dev host prometheus `127.0.0.1:23090:9090`、pushgateway `127.0.0.1:29091:9091`;exporter 無 host port(內網被 scrape);grafana 沿用 23000。**prod internal-only**(無對外 host port、鏡像 031、FR-009/FR-011)。
- **nginx 不 proxy `/metrics`（FR-011 證）**: `deploy/nginx/conf.d/_locations.inc` 只有 `location /`(base-web)、`location /api/`(→rust-api strip /api)、`location =/health` —— **無 `/metrics` location** → front-nginx 不對外 proxy rust-api `/metrics`;prod rust-api internal-only(無 host port)→ `/metrics` 僅內網 prometheus 可達。
- **volume**: 新 `prometheus_data`(→`rev2-admin_prometheus_data`、無顯式 name:);exporter/pushgateway 無持久卷(pushgateway in-memory)。
- **compose 範式**: 鏡像 031 — master 定 service skeleton(image/profiles/command/volume/secret/networks/depends_on/restart)、dev/prod override 提供 host port + config bind-mount(base 禁 host port/config bind-mount 鐵律 `docker-compose.yml:9`)。

## R8 — Constitution §IV 8 問 pre-check facts（v1.6.0）

| §IV Q | 結論 | 依據 |
|---|---|---|
| 1 §I.1 base-web 權威/缺 endpoint? | **PASS（N/A）** | obs-full 無 wire 端點、base-web 零改;`/metrics` 是 prometheus scrape ops 端點、base-web 不消費。 |
| 2 動 base-web inline / ★ 軌道? | **PASS（N/A）** | 零 base-web 改 → 不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG。 |
| 3 §I.2 menu Casbin? | **N/A** | 不涉 menu。 |
| 4 §I.3 wire 對齊 mock? | **PASS（N/A）** | `/metrics` = prometheus 文字格式、非 base-web wire envelope;enforce counter = internal;exporter metric = prometheus 格式。 |
| 5 §I.5 rev1 拷貝? | **PASS** | greenfield(D2)、未讀/拷 rev1 source(rev1 obs-full `specs/044` 僅概念參考)。 |
| 6 §II §8.5/§11.8 obs 拍板? | **PASS** | §8.5「obs-full = +prometheus + 3 exporter + pushgateway + grafana alerting」逐字對齊(032=prometheus+postgres/redis exporter+pushgateway+baseline alert);元件/版本選擇=實作層、無拍板撤回。 |
| 7 §III ★ 軌道? | **PASS（N/A）** | rust-api `/metrics`+`enforce_mw` counter + cleanup-job push = **RUSTAPI-SOURCE-ISOLATION**(§III.1 預設可動、無需額外授權、非 ★);deploy/compose = infra 非 ★ 軌道。 |
| 8 新建業務表 §I.6 審計欄? | **PASS（N/A）** | **無 migration / 無新表**(metrics 在 prometheus、非 DB;least-priv role defer follow-up、不在本 feature)。 |

**§3 紀律**:`axum-prometheus`/`metrics`/`metrics-exporter-prometheus`/blocking-http-client 是 **server + cleanup-job 兩既有 crate 的 dep、非新 workspace member** → 「新 crate ⇒ prod build」嚴格不觸發;但**新 deps 進 runtime image,acceptance 仍含 prod target build**(鏡像 027 sha2/chrono)。**結論:8/8 PASS、無 amendment、無新 crate/表/migration、base-web 零改。**
