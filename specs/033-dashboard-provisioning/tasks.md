---
description: "Task list — 033 dashboard provisioning"
---

# Tasks: Observability — Dashboard Provisioning

**Input**: Design documents from `/specs/033-dashboard-provisioning/`

**Prerequisites**: [plan.md](plan.md) ✅、[spec.md](spec.md) ✅、[research.md](research.md)（R1-R8 live-grounded）、[data-model.md](data-model.md)、[contracts/](contracts/)（config-contract + verification-commands C0-C5）

**Tests**: **無新單元測試** —— §3 紀律明示「dashboard 全 grafana config → 無新純函式、由 acceptance C-V 覆蓋」;**無 CDP**（grafana 獨立 ops UI、非 base-web）。各 US 的「acceptance」task = 活體 C-V（C0-C5 + 守恆）。

**Organization**: 依 user story 分組（US1 rust-api 板 / US2 infra db+redis / US3 master+cleanup / US4 audit-log / US5 可重現+opt-in+零侵入）。**repo 分工**：**全 outer/deploy**（`deploy/grafana-provisioning/`）;**base-web + rust-api 零改、無 worktree 改動**（收尾無兩段式 commit、純 outer commit）。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：可平行（不同檔、無未完依賴）
- **[Story]**：US1 / US2 / US3 / US4 / US5
- 路徑為 workspace root 相對

---

## Phase 1: Setup

**⚠️ 無共享 setup 任務。** 無新 image/secret/compose service（grafana `13.0.2` 既有、雙 profile `["obs","metrics"]`、provisioning 目錄已整 bind-mount）。dashboard JSON `schemaVersion: 39`、datasource uid `prometheus`（032 顯式）。

---

## Phase 2: Foundational（Blocking Prerequisites）

**⚠️ 所有 dashboard 都需 provider 才能被 provision;audit-log 板需 loki 顯式 uid。** 此二 task 為阻塞前置。

- [x] T001 [P] `deploy/grafana-provisioning/datasources/loki.yml`：加 `uid: loki`（D4;現 auto-gen `P8E80F9AEF21F6940`、audit-log 板穩定引用;`isDefault:true`/`editable:false` 保留;research R8 證 patch SAFE — 無引用 auto-gen uid、0 dashboard、alert 綁 prometheus、Explore by-name）per [research R8](research.md)
- [x] T002 [P] 建 `deploy/grafana-provisioning/dashboards/provider.yaml`：file provider（`apiVersion:1` + `providers:[{name:'obs-full-dashboards', orgId:1, folder:obs-full, type:file, disableDeletion:true, updateIntervalSeconds:30, allowUiUpdates:false, options:{path:/etc/grafana/provisioning/dashboards/json, foldersFromFilesStructure:false}}]`）。**★ provider yaml 放 `dashboards/`、JSON 放 `dashboards/json/`（路徑分工、不混）** per [research R1](research.md) / [config-contract §2](contracts/config-contract.md)

**Checkpoint**：foundational 完成後 grafana 可 provision dashboards（`up -d --force-recreate grafana`）、空 `json/` 不報錯。

---

## Phase 3: User Story 1 — 維運者開觀察入口即見後端應用面板（Priority: P1）🎯 MVP

**Goal**: rust-api 監控面板（請求率/延遲分位/錯誤率/enforce allow-deny）provisioned、開即見真實資料。

**Independent Test**: `--force-recreate grafana` → grafana `/api/search?type=dash-db` 含 "rust-api" 板（folder obs-full）→ 其 panel query 經 datasource proxy 回真實資料。

- [x] T003 [US1] 建 `deploy/grafana-provisioning/dashboards/json/rust-api.json`（greenfield、`schemaVersion:39`、uid:prometheus）：panel = 請求率 `sum by (endpoint,status) (rate(axum_http_requests_total[5m]))` / 延遲 p50·p95·p99 `histogram_quantile(0.99, sum by (le) (rate(axum_http_requests_duration_seconds_bucket[5m])))` / **5xx `(sum(rate(axum_http_requests_total{status=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(axum_http_requests_total[5m])),1)`** / in-flight `axum_http_requests_pending` / enforce `sum by (decision) (rate(casbin_enforce_total[5m]))`。**製法建議：在 live grafana 建好 export JSON commit**（schema 正確、同 032 alert rule 對 live 迭代）per [research R5](research.md) / [data-model §2.2](data-model.md)（依賴 T002）
- [x] T004 [US1] Acceptance（C1-slice + C3-rust-api）：`up -d --force-recreate grafana` → `/api/search?type=dash-db` 含 rust-api 板（folder obs-full）+ 經 datasource proxy 查 rust-api 板代表 query（req-rate / p99 / enforce）status:success 回資料 per [verification-commands C1/C3](contracts/verification-commands.md)（前置：C0 打請求 + deny 產 axum/enforce 資料）（依賴 T003）

**Checkpoint**: US1 可獨立驗（後端應用面板開即見 = MVP）。

---

## Phase 4: User Story 2 — 維運者見基礎設施（db/cache）深度面板（Priority: P2）

**Goal**: postgres + redis 深度監控面板（官方 exporter dashboard）provisioned、開即見深 panel。

**Independent Test**: grafana 含 "Postgres Overview" + "Redis" 板 → 其 panel 查 `pg_*`/`redis_*` 回真實資料、datasource 解析無 dangling。

- [x] T005 [P] [US2] 建 `deploy/grafana-provisioning/dashboards/json/postgres.json`：**pin community `postgres_mixin/dashboards/postgres-overview.json @ tag v0.19.1`**（`https://raw.githubusercontent.com/prometheus-community/postgres_exporter/v0.19.1/postgres_mixin/dashboards/postgres-overview.json`、82% live-match）→ 下載 commit + **datasource resolution**：`templating.list` 的 `datasource` 變數 `current` pin `{text:prometheus,value:prometheus}`+`hide:2`（或 `$datasource`→`prometheus`）。**★ 否決 9628（k8s-coupled templating 在 static-scrape 壞）** per [research R2](research.md) / [config-contract §4](contracts/config-contract.md)（依賴 T002）
- [x] T006 [P] [US2] 建 `deploy/grafana-provisioning/dashboards/json/redis.json`：**pin community grafana.com `763 revision 6`**（`https://grafana.com/api/dashboards/763/revisions/6/download`、= oliver006 repo `@v1.85.0`、100% live-match）→ 下載 commit + **datasource resolution**：string-replace `${DS_PROM}`→`prometheus` + 刪 top-level `__inputs` array per [research R3](research.md)（依賴 T002）
- [x] T007 [US2] Acceptance（C1-slice + C2 + C3-infra）：grafana 含 Postgres + Redis 板 + datasource 引用 resolve 成 uid:prometheus（無 `${DS_*}`/dangling 殘留）+ proxy 查 `pg_stat_activity_count`·`redis_memory_used_bytes` 回資料 per [verification-commands C1/C2/C3](contracts/verification-commands.md)（依賴 T005/T006）

**Checkpoint**: US1 + US2 = app + infra 深度面板齊。

---

## Phase 5: User Story 3 — 維運者見全域總覽 + 維運 job 面板（Priority: P2）

**Goal**: master overview（全 target 健康 + 關鍵率）+ cleanup-job（上次成功/staleness/筆數）板 provisioned。

**Independent Test**: grafana 含 "master overview" + "cleanup-job" 板 → 總覽查 `up{job=~...}`/`pg_up`/`redis_up` 回資料;cleanup 板查 `cleanup_job_*`（C0 觸發 push 後）回資料。

- [x] T008 [P] [US3] 建 `deploy/grafana-provisioning/dashboards/json/master-overview.json`（greenfield、uid:prometheus）：`up{job=~"rust-api|postgres|redis|pushgateway"}`（★ exporter job=`postgres`/`redis` 非 `_exporter`）/ `pg_up`·`redis_up` / 總請求率 `sum(rate(axum_http_requests_total[5m]))` / deny 率 / cleanup age `time()-cleanup_job_last_success_timestamp` per [research R5](research.md) / [data-model §2.1](data-model.md)（依賴 T002）
- [x] T009 [P] [US3] 建 `deploy/grafana-provisioning/dashboards/json/cleanup-job.json`（greenfield、uid:prometheus）：last-success 時間（`cleanup_job_last_success_timestamp` stat→date）/ age（`time()-cleanup_job_last_success_timestamp` staleness）/ rows（`cleanup_job_rows_deleted` stat+時序）/ `up{job="pushgateway"}`。**★ 不做 `up{job="cleanup_job"}`（不存在、pushgateway honor_labels group 非 scrape target）** per [research R6](research.md) / [data-model §2.6](data-model.md)（依賴 T002）
- [x] T010 [US3] Acceptance（C1-slice + C3-master/cleanup）：先 **C0 觸發一次 cleanup-job push**（同 032 C6、否則 cleanup 板 No data）→ grafana 含 master + cleanup 板 + proxy 查 `up{job=~...}`·`cleanup_job_last_success_timestamp` 回資料 per [verification-commands C0/C1/C3](contracts/verification-commands.md)（依賴 T008/T009）

**Checkpoint**: US1+US2+US3 = app + infra + 總覽 + job 面板齊。

---

## Phase 6: User Story 4 — 維運者見 log pipeline 面板（Priority: P3）

**Goal**: audit-log 板（log 量/錯誤率/access 狀態、loki datasource）provisioned。

**Independent Test**: grafana 含 "audit-log" 板（loki uid 解析）→ 其 LogQL panel 經 loki proxy 回資料。

- [x] T011 [US4] 建 `deploy/grafana-provisioning/dashboards/json/audit-log.json`（greenfield、**uid:loki**、`schemaVersion:39`）：log 量 `sum by (service) (count_over_time({compose_project="rev2-admin"}[5m]))` / rust-api error·warn `sum(count_over_time({service="rust-api"} | json | level=~"ERROR|WARN" [5m]))`（★ `level` top-level）/ **nginx status `sum by (status) (count_over_time({service="front-nginx"} |~ \`^{\` | json [5m]))`（★ 必 `|~ \`^{\`` 否則 JSONParserErr 400）** / trace_id `{service="rust-api"} | json | fields_trace_id`（★ nested）per [research R7](research.md) / [data-model §2.5](data-model.md)（依賴 T001 loki-uid + T002）
- [x] T012 [US4] Acceptance（C1-slice + C3-log）：grafana 含 audit-log 板（datasource uid:loki 解析）+ 經 loki proxy 查 log-volume-by-service·nginx-status 回資料 per [verification-commands C1/C3](contracts/verification-commands.md)（前置：C0 有 log 流量）（依賴 T011）

**Checkpoint**: US1-US4 = 6 板齊（4 greenfield + 2 community）。

---

## Phase 7: User Story 5 — 面板可重現就緒、opt-in、零侵入（Priority: P3）

**Goal**: 6 板隨部署可重現 provision（folder obs-full、無 dangling、log 乾淨）、opt-in（隨 grafana/觀察堆疊）、零侵入（base-web+rust-api 零改、app 行為不變）。

**Independent Test**: 全新 force-recreate → 6 板自動現;一般 up（無觀察堆疊）grafana 不啟 → 無板;啟用前後 `/auth/login` 回應碼/形狀不變。

**注**：opt-in 由 grafana 既有 profile gating 提供、零侵入由「純 config 無 rust 改」本質提供;本 phase = 驗證該性質（無 net-new impl）。

- [x] T013 [US5] Acceptance（C1 全 + C2 + C4 + opt-in + 零侵入 + 守恆）：C1 6 板全 provisioned 在 folder obs-full / C2 各板 datasource uid ∈ {prometheus,loki} 無 dangling（loki-uid 修驗）/ C4 grafana provisioning log 無 dashboard load error / **opt-in**：一般 `up`（無 `--profile obs/metrics`）grafana 不啟、無板 / **零侵入**：啟用前後 `/auth/login` 回應碼+envelope 0 變化（純 config 無 rust 改）/ **守恆**：031/032 datasource（Loki+Prometheus）+ 3 alert rule 仍在、loki Explore 經 uid:loki 仍可查 per [verification-commands C1/C2/C4 + 守恆](contracts/verification-commands.md)（依賴 T003-T012）

**Checkpoint**: US1/US2/US3/US4/US5 各自獨立可驗。

---

## Phase 8: Polish & Acceptance（Cross-Cutting）

- [x] T014 Acceptance **C5**（prod `--profile obs --profile metrics`）：`docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs --profile metrics up -d --force-recreate --no-deps grafana` → 6 板 provisioned、**grafana 無對外 published port（internal-only）** per [verification-commands C5](contracts/verification-commands.md)（FR-010/SC-005、§3 prod 產物驗精神）（依賴 T002-T012)
- [x] T015 守恆：compose 多模 `--profile obs --profile metrics config` parse（dev+prod）+ grafana 乾淨 boot + **031/032 不破**（datasource Loki/Prometheus + 3 alert rule + loki Explore via uid:loki）per [verification-commands 守恆](contracts/verification-commands.md)（依賴 T001-T012）
- [x] T016 [P] 回填 `docs/INTEGRATION-DESIGN.md` §10 Phase 6 #3 dashboard-provisioning as-built（6 板〔4 greenfield + 2 community pin postgres_mixin@v0.19.1·763 rev6〕/ provider yaml folder obs-full / loki 補 uid / live-grounded 修正〔job postgres·redis、5xx or vector(0)、nginx |~ ^{、cleanup 無 up{job}〕/ §I.5 greenfield+upstream / Constitution 8/8）+ 對齊微調 research/quickstart（若實作中發現偏差）

> **收尾（非 task，executing-plans 完成全 task 後走 `superpowers:finishing-a-development-branch`）**：**純 outer/deploy 改動、無 worktree**（無兩段式 commit）→ outer（grafana provisioning + loki.yml + docs）commit → `git merge --no-ff` 回 `rev2-admin-root`（保留 033 branch）→ CHECKLIST/MILESTONES/§6 marker 歸檔。**push / merge 嚴禁出現在收尾之前**（constitution §I.4 / CLAUDE §3）—— 故不列為 task。

---

## Dependencies & Execution Order

### Phase 依賴
- **Setup（P1）**：無。
- **Foundational（P2）**：T001 ∥ T002（不同檔）→ 阻塞所有 US。
- **US1（P3）**：T003 → T004（acceptance）。
- **US2（P4）**：T005 ∥ T006 → T007（acceptance）。
- **US3（P5）**：T008 ∥ T009 → T010（acceptance、需 C0 cleanup push）。
- **US4（P6）**：T011（需 T001 loki-uid）→ T012（acceptance）。
- **US5（P7）**：T013（需 T003-T012 全板就緒）。
- **Polish（P8）**：T014 需全板;T015 守恆;T016 ∥（doc）。

### User Story 獨立性
- 6 個 dashboard JSON **皆不同檔、互不依賴**（[P] 可平行建）;全依賴 T002 provider 才能 provision、T001 loki-uid 僅 audit-log（US4）需。
- acceptance 共享一次 `force-recreate grafana`（executing-plans 控制器可批次：建多板 → 一次 force-recreate → 跑各 acceptance slice）。

### Parallel Opportunities
- T001 ∥ T002（foundational、不同檔）。
- T003 ∥ T005 ∥ T006 ∥ T008 ∥ T009 ∥ T011（6 個 dashboard JSON、不同檔、皆 P;但 acceptance 序需 provider + force-recreate）。
- T016（doc）∥ 任何 acceptance。

---

## Implementation Strategy

### MVP First（US1 only）
1. Foundational（T001-T002）→ US1（T003-T004）→ **STOP & VALIDATE**：`--force-recreate grafana` → grafana 開即見 rust-api 板真實資料（spec US1 Independent Test）
2. = 可交付 MVP（後端應用面板可看）

### Incremental
1. Foundational（loki-uid + provider）
2. US1（rust-api 板）→ 驗
3. US2（pg+redis community 板）→ 驗
4. US3（master + cleanup 板）→ 驗
5. US4（audit-log 板）→ 驗
6. US5（可重現/opt-in/零侵入）→ 驗 gating + 守恆
7. Polish：prod C5 + 守恆 + doc backfill

**效率提示**：6 板皆 config、共享一次 `force-recreate grafana`;executing-plans 控制器可一波建齊 6 板 + provider + loki-uid → 單次 force-recreate → 批跑 C0-C5（不必每板各 recreate）。US 分組是邏輯增量、非強制各自 recreate。

---

## Notes

- **無新單元測試 / 無 CDP**：§3 紀律已於 plan/contracts/本檔明示;由活體 C-V（C0-C5 + 守恆）覆蓋。
- **全 outer/deploy 改動 = `deploy/grafana-provisioning/`（provider + 6 JSON + loki.yml uid）**;**base-web + rust-api 零改、無 worktree**（收尾純 outer commit、無兩段式）。
- **無新 workspace crate / dep / image / secret / compose service** → §3「新 crate ⇒ prod build」**嚴格不觸發**;但 T014 仍驗 prod `--profile obs --profile metrics` 起 + grafana internal-only。
- **community dashboard pin（R2/R3）**：postgres_mixin `@v0.19.1`（82% match、9628 否決）/ redis grafana.com `763 rev6`（100% match）;下載 commit deterministic JSON、對 live metric 命名驗、datasource 引用 resolve uid:prometheus。
- **★ live-grounded 修正**（research，implementer 必守）：job `postgres`/`redis`（非 _exporter）/ 無 `up{job=cleanup_job}` / 5xx `or vector(0)` / nginx LogQL `|~ \`^{\``（裸 `| json` 回 400）/ rust-api `level` top-level·`fields_trace_id` nested / cleanup_job 現無 fresh push（C0 先觸發）。
- **schemaVersion 39**（grafana 13.0.2 接受、hand-author sweet spot）。
- **WSL2**：改 provisioning 後 grafana `up -d --force-recreate grafana`（非 restart、drvfs bind-mount shadow-path 衝突）。
- **loki uid patch 安全**（research R8）→ 只需 force-recreate;loki `isDefault:true` 保留。
