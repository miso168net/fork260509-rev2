---
description: "Task list — 032 observability full (metrics)"
---

# Tasks: Observability — Full (Metrics)

**Input**: Design documents from `/specs/032-obs-full/`

**Prerequisites**: [plan.md](plan.md) ✅、[spec.md](spec.md) ✅、[research.md](research.md)（R1-R8）、[data-model.md](data-model.md)、[contracts/](contracts/)（config-contract + verification-commands C1-C10）

**Tests**: **無新單元測試** —— §3 紀律明示「metrics 埋點是 layer/counter wiring、prometheus/grafana 是 config → 無新純函式、由 acceptance C-V 覆蓋」;既有 server/cleanup-job 測試不變。**無 CDP**（obs-full 無 base-web UI、prometheus/grafana 獨立 ops UI）。各 phase 的「acceptance」task = 活體 C-V（C1-C10）。若 cleanup-job push body 組裝抽出純函式則 test-first（否則 C-V）。

**Organization**: 依 user story 分組（US1 app metrics / US2 infra+job metrics / US3 alerting / US4 opt-in 非侵入）。**repo 分工**：US1 的 `server/`（metrics layer/route + enforce counter）與 US2 的 `cleanup-job/`（push）在 **rust-api worktree**（收尾走 §4.1 兩段式 commit）;其餘全 **outer**（deploy/ + compose + grafana config + docs）。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：可平行（不同檔、無未完依賴）
- **[Story]**：US1 / US2 / US3 / US4
- 路徑為 workspace root 相對

---

## Phase 1: Setup

**⚠️ 無共享 setup 任務。** obs-full **無新 secret**（postgres_exporter reuse `postgres_password` via `DATA_SOURCE_PASS_FILE`、redis_exporter sh-wrapper reuse `redis_password`、R3/R4）;crate deps 在各 US impl task 加。`generate-secrets.sh` 既有 secret 已備。

---

## Phase 2: Foundational（Blocking Prerequisites）

**⚠️ 無共享 foundational 任務。** US1（app metrics pipeline = rust-api `/metrics` + prometheus + grafana datasource）是 metrics 基座;US2（infra+job）/US3（alerting）的 **impl 檔與 US1 互斥（parallel-safe）**:US1 = `server/` + prometheus.yml + grafana datasource + compose(prometheus);US2 = `cleanup-job/` + compose(exporters/pushgateway);US3 = grafana alerting rules。但 **US2/US3/US4 的 acceptance 需 US1 prometheus/grafana 已起**（C4/C6/C7 查 prometheus、C8 驗 gating）。**Checkpoint**：驗收序 US1 → US2 → US3 → US4。

---

## Phase 3: User Story 1 — 維運者從單一入口查後端應用 metrics（Priority: P1）🎯 MVP

**Goal**: rust-api 暴露 HTTP request metrics + enforce allow/deny counter 於 `/metrics`，prometheus scrape、grafana prometheus datasource 可查。閉 Phase 3 #5 enforce metrics 債。

**Independent Test**: `--profile metrics up --wait` → 打請求（含 allow + deny）→ prometheus `up{job="rust-api"}=1` + `/metrics` 見 `axum_http_requests_total{endpoint="/auth/login"}` + `casbin_enforce_total{decision="allow"|"deny"}`;grafana prometheus datasource proxy 查得。

### Implementation for User Story 1

- [ ] T001 [P] [US1] `rust-api/server/Cargo.toml`（**worktree**）：加 `axum-prometheus = "0.7.0"`（最後 axum-0.7 相容版、MSRV 1.70）+ `metrics = "0.23"`（enforce counter、major 對齊 axum-prometheus transitive、R1）
- [ ] T002 [US1] `rust-api/server/src/main.rs`（**worktree**）：`let (prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();`（**`OnceLock`/`OnceCell` guard** —— `set_global_recorder` 一次/process、避測試 flake、R1）→ 加公開 `/metrics` route（`get(move || async move { metric_handle.render() })`、**掛 auth/enforce 外、像 `/health`**）+ `.layer(prometheus_layer)` 全域（取 axum `MatchedPath` 低基數 endpoint label）per [research R1](research.md) / [data-model §1.1/§6](data-model.md)（依賴 T001）
- [ ] T003 [US1] `rust-api/server/src/auth/enforce.rs`（**worktree**）：`enforce_mw` 三 outcome（allow `:119` / deny-policy 403 / deny-DBerr fail-closed `:94`）加 `metrics::counter!("casbin_enforce_total", "decision"=>"allow"|"deny").increment(1)`（metrics 0.23 macro 形）。**label 基數紀律：只 `decision`（2 值）、不加 path/operator/role/trace_id**（FR-012、R1/data-model §1.2）（依賴 T001）
- [ ] T004 [P] [US1] 建 `deploy/prometheus/prometheus.yml`：`global.scrape_interval:15s` + **完整 scrape_configs**（`rust-api`→`rust-api:21081`/metrics、`postgres`→`postgres_exporter:9187`、`redis`→`redis_exporter:9121`、`pushgateway`→`pushgateway:9091`〔**`honor_labels:true`**〕）—— exporter/pushgateway job 在 US2 service 起前顯 DOWN（正常）per [research R2](research.md)（**一次寫全、避 US2 再編此檔**）
- [ ] T005 [P] [US1] 建 `deploy/grafana-provisioning/datasources/prometheus.yml`：`apiVersion:1` + `datasources:[{name:Prometheus, type:prometheus, access:proxy, url:http://prometheus:9090, **uid:prometheus**, **isDefault:false**〔loki 已 default〕, editable:false, jsonData:{httpMethod:POST, timeInterval:15s}}]` per [research R6](research.md)
- [ ] T006 [US1] `docker-compose.yml`：加 `prometheus`（`prom/prometheus:v3.12.0` `profiles:["metrics"]` + command `--config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus --storage.tsdb.retention.time=15d` + volume `prometheus_data:/prometheus` + `restart:unless-stopped` + `networks:[rev2_net]`）+ 頂層 `volumes:` 加 `prometheus_data`（無 `name:`）+ **`grafana` service profile 改 `["obs","metrics"]`**（兩 profile 共用 UI、R6/R7）per [config-contract §2](contracts/config-contract.md)（依賴 T004/T005）
- [ ] T007 [US1] `docker-compose.dev.yml` metrics override：prometheus `ports:["127.0.0.1:23090:9090"]` + bind `./deploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro`（grafana provisioning 整目錄 031 已掛 → prometheus datasource 自動覆蓋;host port 綁 127.0.0.1 鐵律）（依賴 T006）
- [ ] T008 [US1] `docker-compose.prod.yml` metrics override：prometheus internal-only（**無 host port**、FR-009/FR-011/SC-009）+ 同 config bind-mount（依賴 T006）
- [ ] T009 [US1] Acceptance **C1**（`/metrics` 活體：dcargo build -p server + restart rust-api → 打請求 → `/metrics` 見 `axum_http_requests_total`）+ **C2**（enforce counter：allow〔Super 200〕+ deny〔User 403〕→ `casbin_enforce_total{decision}` 各增）+ **C3-rust-api**（prometheus `up{job="rust-api"}=1`）+ **C5**（grafana prometheus datasource proxy 查得）per [verification-commands](contracts/verification-commands.md)（前置：`bash deploy/generate-secrets.sh`;首次起 pull prometheus/grafana image;`dcargo build -p server` + restart rust-api 載 layer）（依賴 T001-T008）

**Checkpoint**: US1 可獨立驗（app metrics 單一入口可查 = MVP、閉 enforce metrics 債）。

---

## Phase 4: User Story 2 — 維運者查基礎設施與維運 job 的 metrics（Priority: P2）

**Goal**: postgres/redis exporter 的 infra metrics 進 prometheus、grafana 可查;cleanup-job 推 job metric 進 pushgateway、prometheus scrape 得。

**Independent Test**: `--profile metrics up` → prometheus `pg_up=1`/`redis_up=1`;跑 cleanup-job + pushgateway 起 → pushgateway 見 `cleanup_job_*`、prometheus 查得（`job="cleanup_job"`）。

### Implementation for User Story 2

- [ ] T010 [US2] `docker-compose.yml`：加 `postgres_exporter`（`prometheuscommunity/postgres-exporter:v0.19.1` `profiles:["metrics"]` + env `DATA_SOURCE_USER=soybean` + `DATA_SOURCE_URI=postgres:5432/soybean_admin_rust?sslmode=disable` + **`DATA_SOURCE_PASS_FILE=/run/secrets/postgres_password`** + `secrets:[postgres_password]`）+ `redis_exporter`（`oliver006/redis_exporter:v1.85.0` `profiles:["metrics"]` + env `REDIS_ADDR=redis://redis-stack:6379` + **`entrypoint:["/bin/sh","-c"]`** command `export REDIS_PASSWORD="$(cat /run/secrets/redis_password)"; exec /redis_exporter` + `secrets:[redis_password]`）+ `pushgateway`（`prom/pushgateway:v1.11.3` `profiles:["metrics"]`）;三者 `restart:unless-stopped` + `networks:[rev2_net]`。**reuse 既有 secret、無新 secret**（R3/R4）per [config-contract §2](contracts/config-contract.md)（依賴 T006 同檔)
- [ ] T011 [US2] `docker-compose.dev.yml` metrics override：pushgateway `ports:["127.0.0.1:29091:9091"]`（exporter 無 host port、內網被 scrape）（依賴 T007/T010）
- [ ] T012 [US2] `docker-compose.prod.yml` metrics override：exporters/pushgateway internal-only（無 host port）（依賴 T008/T010）
- [ ] T013 [P] [US2] `rust-api/cleanup-job/Cargo.toml`（**worktree**）：加 `metrics-exporter-prometheus = "0.15"` + `ureq`（或 `reqwest` blocking）;**impl 時 Cargo.lock 確認 metrics-exporter-prometheus MSRV ≤ 1.86**（R5）
- [ ] T014 [US2] `rust-api/cleanup-job/src/main.rs`（**worktree**）：清理跑完後 `PrometheusBuilder::new().install_recorder()` → `metrics::gauge!("cleanup_job_last_success_timestamp", …)` + `gauge!("cleanup_job_rows_deleted", …)` → `handle.render()` → **blocking HTTP PUT `http://pushgateway:9091/metrics/job/cleanup_job`**（`ureq::put(...).send_string(body)` 或 reqwest blocking）。**best-effort：push 失敗只 `tracing::warn!` + 續行、exit 0、不破 cleanup**（FR-008、R5/data-model §2）（依賴 T013）
- [ ] T015 [US2] Acceptance **C4**（exporter：prometheus `pg_up=1`/`redis_up=1`）+ **C6**（pushgateway：dcargo build -p cleanup-job + dcargo-with-network 跑 cleanup-job → pushgateway `:29091` 見 `cleanup_job_*` + prometheus 查得 `job="cleanup_job"`）per [verification-commands](contracts/verification-commands.md)（依賴 T010-T014 + US1 T009 prometheus 已起）

**Checkpoint**: US1 + US2 = app + infra + job metrics 全進 prometheus（核心 metrics 觀察齊全）。

---

## Phase 5: User Story 3 — 維運者對關鍵失效有 baseline 告警規則（Priority: P3）

**Goal**: grafana unified alerting provision baseline alert rule（rust-api target down 等）、隨部署自動就緒。

**Independent Test**: `--profile metrics up` → grafana `/api/v1/provisioning/alert-rules` 非空（含 "rust-api target down"）;停 rust-api → 該 rule 進 Alerting。

### Implementation for User Story 3

- [ ] T016 [P] [US3] 建 `deploy/grafana-provisioning/alerting/rules.yml`：`apiVersion:1` + rule group `obs-full-baseline`（folder `obs-full`、interval 1m），**3 條 baseline rule 覆蓋 FR-005 三失效型**（皆 grafana-managed：query A + `__expr__` C、`datasourceUid:prometheus`〔對 T005 datasource uid〕、`noDataState:Alerting`/`execErrState:Alerting`）：**(a) `rust-api-target-down`**〔後端應用不可用〕A=`up{job="rust-api"}` instant、C=threshold `lt 1`、`for:2m`、`severity:critical`;**(b) `infra-exporter-down`**〔基礎設施採集不可達〕A=`up{job=~"postgres|redis"}` instant、C=threshold `lt 1`、`for:2m`、`severity:critical`;**(c) `rust-api-high-5xx-rate`**〔錯誤率過高〕A=`sum(rate(axum_http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(axum_http_requests_total[5m])),1)`、C=threshold `gt 0.05`〔>5%〕、`for:5m`、`severity:warning`。**datasourceUid 用顯式 `prometheus`**;**不** provision notification-policies/contactpoints（內建 default backstop = channel deferred、避 dangling-receiver boot error、R6/D7）per [research R6](research.md) / [data-model §5](data-model.md)
- [ ] T017 [US3] Acceptance **C7**（grafana `/api/v1/provisioning/alert-rules` 含 **3 條 baseline rule**〔`rust-api-target-down` / `infra-exporter-down` / `rust-api-high-5xx-rate`、對 FR-005 三失效型〕;可選：停 rust-api → `rust-api-target-down` 進 Alerting）per [verification-commands](contracts/verification-commands.md)（依賴 T016 + US1 T006 grafana profile/datasource + T009 pipeline）

**Checkpoint**: US1 + US2 + US3 = metrics + 告警齊全。

---

## Phase 6: User Story 4 — metrics 堆疊為 opt-in、不干擾正常服務（Priority: P3）

**Goal**: metrics 為 `profiles:[metrics]` opt-in（一般 up 不啟、且與 log 堆疊獨立）、零侵入、盡力而為旁路。

**Independent Test**: 一般 `up`（無 `--profile metrics`）→ metrics 4 service 不運行;`--profile metrics`(無 obs) 不啟 loki/alloy;obs 啟用前後 `/auth/login` 回應碼/形狀不變;停 prometheus 後 app 請求仍成功。

**注**：opt-in 的 `profiles:[metrics]` gating 已在 **US1 T006 / US2 T010** 實作;本 phase = 驗證該性質（無 net-new impl）。

### Implementation for User Story 4

- [ ] T018 [US4] Acceptance **C8**（一般 `up`〔無 `--profile metrics`〕→ `ps` 不含 prometheus/exporter/pushgateway = profile gating、FR-006/SC-006;`--profile metrics` config 不含 loki/alloy = metrics⊥log 獨立）+ **C9**（metrics 前後 `/auth/login` 回應碼/envelope 不變 = FR-007/SC-007 行為零侵入;`--profile metrics stop prometheus` 後 `/health`+`/login` 仍 200 = FR-008/SC-008 旁路不反壓;停 pushgateway 跑 cleanup-job 仍 exit 0）per [verification-commands](contracts/verification-commands.md)（依賴 T006/T010 gating + T009 pipeline）

**Checkpoint**: US1/US2/US3/US4 各自獨立可驗。

---

## Phase 7: Polish & Acceptance（Cross-Cutting）

- [ ] T019 Acceptance **C10**（prod `--profile metrics`：`docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile metrics build`〔新 deps 進 runtime image〕+ up → 4 metrics service internal-only 起、無對外 host port;rust-api prod build 含 axum-prometheus deps 綠）per [verification-commands](contracts/verification-commands.md)（§3 prod 產物驗精神、FR-009/SC-009）（依賴 T001-T014）
- [ ] T020 守恆：`dcargo test -p server`（metrics 埋點後既有全綠、無新測）+ `dcargo test -p cleanup-job`（push wiring 後既有全綠）+ `--test entity_access_lint`（17 不變、metrics 不碰 entity）+ compose 多模 `--profile metrics config` parse（依賴 T002/T003/T014）
- [ ] T021 [P] backfill：CLAUDE §8.2（prometheus `23090`「已進 compose」+ pushgateway `29091`「已進 compose」+ 加 postgres_exporter/redis_exporter 列〔內網無 host port〕+ `prometheus_data` volume + grafana profile→`["obs","metrics"]`;exporter reuse postgres/redis password〔無新 secret〕註記）+ **`deploy/secrets/README.md` ⏳ 表的 `postgres_exporter_dsn`/`redis_exporter_password` 標 superseded〔exporter 改 reuse 既有 postgres/redis password、無新 secret〕**（L1）
- [ ] T022 [P] 回填 `docs/INTEGRATION-DESIGN.md` §10 Phase 6 #2 obs-full as-built（prometheus + 2 exporter + pushgateway + grafana datasource/alert / axum-prometheus enforce metrics 閉 Phase 3 #5 債 / reuse secret / least-priv role defer / profile:[metrics]）+ 對齊實作微調 research/quickstart（若實作中發現偏差）

> **收尾（非 task，executing-plans 完成全 task 後走 `superpowers:finishing-a-development-branch`）**：rust-api worktree（`server/` + `cleanup-job/`）兩段式 commit（§4.1）→ 外層 SHA pin → outer（deploy/compose/grafana config/docs）commit → `git merge --no-ff` 回 `rev2-admin-root` → CHECKLIST/MILESTONES 歸檔。**push / merge 嚴禁出現在收尾之前**（constitution §I.4 / CLAUDE §3）—— 故不列為 task。

---

## Dependencies & Execution Order

### Phase 依賴
- **Setup（P1）/ Foundational（P2）**：無。
- **US1（P3）**：T001 →（T002 ∥ T003）;（T004 ∥ T005）→ T006 →（T007 ∥ T008）→ T009（acceptance）。
- **US2（P4）**：T010（compose、同 T006 檔故序於 T006 後）→（T011 ∥ T012）;T013 → T014;→ T015（acceptance、需 US1 T009 prometheus 起）。
- **US3（P5）**：T016 → T017（需 US1 grafana/datasource + pipeline）。
- **US4（P6）**：T018（需 T006/T010 gating + T009 pipeline）。
- **Polish（P7）**：T019 需 US1+US2 impl;T020 需 T002/T003/T014;T021 ∥ T022 可平行。

### User Story 獨立性
- **US1**：app metrics（server + prometheus + grafana datasource）;不碰 cleanup-job/exporters/alerting。
- **US2**：infra+job（exporters/pushgateway compose + cleanup-job）;**impl 與 US1 互斥(server vs cleanup-job、compose 不同 service)**;acceptance 需 US1 prometheus。
- **US3**：alerting rules（grafana config 單檔）;impl 獨立;acceptance 需 US1 grafana。
- **US4**：純驗證（gating 由 US1/US2 提供）。

### Parallel Opportunities
- T001 後 T002 ∥ T003（server 不同函式區、但同 crate 建議序;標 T002 為主、T003 可緊接）。
- T004 ∥ T005（prometheus.yml ∥ grafana datasource、不同檔）。
- T013 → T014（cleanup-job）可與 US1 server impl **跨 worktree crate 平行**（server vs cleanup-job 不同檔）。
- T016（alerting）可與 US1/US2 impl 平行（grafana config 單檔）。
- T021 ∥ T022（polish docs）。

---

## Implementation Strategy

### MVP First（US1 only）
1. US1（T001-T009）→ **STOP & VALIDATE**：`--profile metrics up` → grafana 查 rust-api HTTP + enforce metrics（spec US1 Independent Test、閉 Phase 3 #5 債）
2. = 可交付 MVP（app metrics 觀察上線）

### Incremental
1. US1（app metrics pipeline）→ 驗
2. US2（infra exporter + job push）→ 驗
3. US3（baseline alerting）→ 驗
4. US4（opt-in 非侵入）→ 驗 gating + 零侵入 + 旁路
5. Polish：prod `--profile metrics`（C10）+ 守恆 + doc backfill

---

## Notes

- **無新單元測試 / 無 CDP**：§3 紀律已於 plan/contracts/本檔明示;由活體 C-V（C1-C10）覆蓋。cleanup-job push body 若抽純函式則 test-first。
- **rust-api 改動 = `server`（US1 metrics）+ `cleanup-job`（US2 push）兩既有 crate**（worktree、§4.1 兩段式 commit）;其餘全 outer。
- **無新 workspace crate**（deps 加既有 crate）→ §3「新 crate ⇒ prod build」**嚴格不觸發**;但 C10 仍驗 prod `--profile metrics` 起 + rust-api prod build（新 deps 進 runtime）。
- **無新 secret**：postgres_exporter reuse `postgres_password`（`DATA_SOURCE_PASS_FILE`）、redis_exporter sh-wrapper reuse `redis_password`（R3/R4）;**least-priv exporter PG role defer follow-up**（reuse soybean、合 030 least-priv 軌道）。
- **WSL2**：T002/T003（server）+ T014（cleanup-job）改 code 後 live 驗前須 `dcargo build` + restart rust-api（inotify 不可靠）;改 compose/單檔 bind-mount 用 `--force-recreate`（memory `devstack-acceptance-restart`、031 C3 踩過）。
- **image/crate pin（§6/R）**：axum-prometheus `0.7.0`（**勿升 ≥0.8、需整 migrate axum 0.8**）/ metrics `0.23`（對齊）/ prometheus `v3.12.0`（前導 v）/ postgres-exporter `v0.19.1` / redis_exporter `v1.85.0` / pushgateway `v1.11.3` / grafana `13.0.2`（reuse）;不用浮動 tag。
- **axum-prometheus 陷阱**：`set_global_recorder` 一次/process（T002 OnceLock guard、測試 flake）;`metrics` crate major 須 0.23（否則 custom enforce counter 靜默掉）。
- **prometheus image 跑 user nobody（uid 65534）**：`prometheus_data` named volume 可寫（R2）。
