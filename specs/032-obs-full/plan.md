# Implementation Plan: Observability — Full (Metrics)

**Branch**: `032-obs-full` | **Date**: 2026-06-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/032-obs-full/spec.md`

## Summary

把 DESIGN §8.5「Phase 6 obs-full（+ prometheus + 3 exporter + pushgateway + grafana alerting）」落地、補完 031 obs-min（log）的 metrics 半邊,並閉掉自 Phase 3 #5 起 parked 的「enforce metrics 埋點」債。**opt-in `profiles:[metrics]` metrics 堆疊** —— **prometheus**(`v3.12.0` 單機 static-scrape 儲存/PromQL、retention 15d) ← scrape 自 **rust-api `/metrics`**(`axum-prometheus 0.7.0` HTTP metrics + `enforce_mw` 自埋 allow/deny counter)、**postgres_exporter**(`v0.19.1`)、**redis_exporter**(`v1.85.0`)、**pushgateway**(`v1.11.3`、cleanup-job 推 job metric)→ **grafana**(reuse `13.0.2`、加 prometheus datasource + baseline alert rule provisioning)。**純後端/infra**:無 base-web、無 wire 端點(`/metrics`=ops 非 wire)、無 migration/新表、**無新 workspace crate**(deps 加在既有 server + cleanup-job 兩 crate)。greenfield(不參照 rev1)。設計來源見 [spec-design](../../docs/superpowers/032-obs-full.md)(9 決策 D1-D9)。

## Technical Context

**Language/Version**: Rust edition 2021 toolchain 1.86(rust-api `server` + `cleanup-job` crate;走 dev docker `dcargo`);其餘為 YAML/prometheus/grafana config（無語言 runtime）

**Primary Dependencies**: **新 deps**:`axum-prometheus 0.7.0`(最後 axum-0.7 相容版、MSRV 1.70)+ `metrics 0.23`(enforce counter、major 對齊 axum-prometheus transitive)在 server crate;`metrics-exporter-prometheus 0.15` + blocking HTTP client(`ureq` 或 `reqwest` blocking)在 cleanup-job crate。obs images(pinned §6、R1-R6):`prom/prometheus:v3.12.0` / `prometheuscommunity/postgres-exporter:v0.19.1` / `oliver006/redis_exporter:v1.85.0` / `prom/pushgateway:v1.11.3` / `grafana/grafana:13.0.2`(reuse 031)

**Storage**: 無 DB 改動(無 migration/表)。prometheus TSDB 於 named volume `prometheus_data`(retention 15d、單機 filesystem);grafana state `grafana_data`(reuse 031);pushgateway in-memory(無持久卷);exporter 無狀態

**Testing**: **無新單元測試**(metrics 為 instrumentation wiring;§3 明示「由 C-V 覆蓋」);若 cleanup-job push body 組裝有可抽純函式則 test-first。既有測試不變。acceptance = 活體 C-V(C1-C10、見 contracts/verification-commands.md):rust-api `/metrics` + enforce counter + prometheus scrape targets up + 2 exporter + pushgateway job metric + grafana prometheus datasource + baseline alert rule provisioned + profile gating + 行為零侵入 + 旁路 + prod `--profile metrics` 起。**無 CDP**(prometheus/grafana 獨立 ops UI、非 base-web)

**Target Platform**: Linux server(docker-compose;metrics 4 service + grafana profile 擴為 `profiles:[metrics]` opt-in、常駐 sidecar;cleanup-job 推 metric 為 one-shot)

**Project Type**: observability infra(compose service ×4 + config 檔)+ 後端 metrics 埋點(server `/metrics` + `enforce_mw` counter)+ cleanup-job push + deploy config(prometheus/grafana provisioning)

**Performance Goals**: metrics 採集為盡力而為旁路、無 SLA(FR-008);prometheus scrape 不在請求路徑、不得反壓 app(SC-008);axum-prometheus layer 為輕量 tower middleware(每請求記 count/latency/in-flight)

**Constraints**: metrics-only(dashboards/notification channel/tracing OUT → dashboard-provisioning / security pass);opt-in `profiles:[metrics]`(一般 up 不啟、FR-006、**與 obs log 堆疊獨立**);零 wire/行為侵入(FR-007);`/metrics` 不對外暴露(FR-011、nginx 不 proxy + prod internal-only);bounded retention(FR-010、15d deploy-settable);bounded label cardinality(FR-012、MatchedPath + decision-only);greenfield(§I.5);image+crate pinned(§6/R1-R6)

**Scale/Scope**: 4 scrape source(rust-api / postgres / redis / pushgateway);個人/dev workspace 規模;改動 ≈ server `/metrics`+layer+enforce counter + cleanup-job push + 4 obs service + 1 prometheus config + 2 grafana provisioning 檔 + compose 3 檔 + grafana profile 擴

## Constitution Check

*GATE: 對照 `.specify/memory/constitution.md` v1.6.0 §IV 八問,Phase 0 前必過、Phase 1 後複查。*

| # | Compliance 問項 | 結論 | 依據 |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **PASS（N/A）** | obs-full **無 wire 端點**、base-web 完全零改;`/metrics` 是 prometheus scrape ops 端點、base-web 不消費。 |
| 2 | 動到 base-web inline?屬哪條 ★ 軌道? | **PASS（N/A）** | **零 base-web 檔案改動** → 不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG。 |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **N/A** | 不涉 menu。 |
| 4 | wire 設計對齊 §I.3 mock?(envelope/id/error/enum) | **PASS（N/A）** | **無 wire 改動**;`/metrics` = prometheus 文字格式(非 base-web wire envelope);enforce counter / exporter metric = internal prometheus 格式;不改任何回應序列化/DTO/端點(FR-007/SC-007)。 |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | **PASS** | **greenfield**(D2);config 全新寫、Phase 0 research 全程未讀/grep rev1 source(rev1 obs-full `specs/044` 僅概念參考、守 §I.5 process 紀律)。 |
| 6 | 凍結到 §II 拍板?需改任一拍板? | **PASS** | §8.5「obs-full = +prometheus + 3 exporter + pushgateway + grafana alerting」—— 032 逐字對齊(prometheus + postgres/redis exporter + pushgateway + baseline grafana alert);採集/出 metrics 元件選擇(axum-prometheus/各 exporter 版本)為**實作層**、非拍板凍結值 → **不構成撤回/修改、無 amendment**。 |
| 7 | 觸及 §III ★ 軌道?邊界內? | **PASS（N/A）** | rust-api `/metrics` route + `enforce_mw` counter + cleanup-job push = **RUSTAPI-SOURCE-ISOLATION**(§III.1 預設可動軌道、無需額外授權、**非 ★**);`deploy/`+compose = deploy infra、非 ★ 軌道(MODAL-WIRING/BASE-WEB-BUILD-CONFIG 皆 base-web)。 |
| 8 | 新建業務表(create migration)?含 §I.6 六審計欄? | **PASS（N/A）** | **無 migration / 無新表**(metrics 在 prometheus、非 DB);least-priv exporter PG role defer follow-up(reuse soybean DSN)、**不在本 feature**。 |

**結論：8/8 PASS**（純 infra/後端、Constitution 表面極小）。**無 Complexity Tracking 項。** 無 amendment。

**§3 紀律檢查**:
- **「新 workspace crate ⇒ acceptance 必含 prod image build」**:**嚴格不觸發**(無新 workspace member;`axum-prometheus`/`metrics`/`metrics-exporter-prometheus`/http-client 是 server + cleanup-job 兩既有 crate 的 dep);但 acceptance **仍含 C10 prod `--profile metrics` build+起**(新 deps 進 runtime image、鏡像 027 sha2/chrono dep 的 prod build 驗;FR-009/SC-009)。
- **「CDP smoke defer 風險」**:**N/A**(obs-full 無 base-web modal/UI);不適用。
- **「無新純函式測試 ⇒ 由 acceptance C-V 覆蓋」**:已於 plan/contracts **明示**(metrics 埋點 = wiring、C1-C10 活體覆蓋);tasks 階段續明示。

## Project Structure

### Documentation (this feature)

```text
specs/032-obs-full/
├── plan.md                       # 本檔（/speckit-plan）
├── research.md                   # Phase 0（R1-R8、grep-backed + WebSearch 版本）
├── data-model.md                 # Phase 1（metric 模型/label schema/code 改點/cleanup-job push）
├── quickstart.md                 # Phase 1（改動清單 + 跑 + 驗收）
├── contracts/
│   ├── config-contract.md        # config/compose/secret/叫用/接點契約
│   └── verification-commands.md  # C-V 驗收 C1-C10 + 無新單元測試明示
├── checklists/requirements.md    # /speckit-specify 產（已全綠 16/16）
└── tasks.md                      # Phase 2（/speckit-tasks，非本步）
```

### Source Code (repository root)

```text
rust-api/server/src/                # ★ worktree crate 1
├── main.rs                        # 改：PrometheusMetricLayer::pair() + /metrics route + .layer()（OnceLock guard）
└── auth/enforce.rs                # 改：enforce_mw allow/deny 分支 metrics::counter!("casbin_enforce_total","decision")
rust-api/server/Cargo.toml          # 改：+ axum-prometheus 0.7.0 + metrics 0.23
rust-api/cleanup-job/src/main.rs    # ★ worktree crate 2 改：install_recorder()+gauge!+render()+blocking PUT pushgateway（best-effort）
rust-api/cleanup-job/Cargo.toml     # 改：+ metrics-exporter-prometheus 0.15 + ureq/reqwest(blocking)

deploy/
├── prometheus/prometheus.yml       # 新：static scrape（rust-api/postgres_exporter/redis_exporter/pushgateway、honor_labels）
├── grafana-provisioning/
│   ├── datasources/prometheus.yml  # 新：prometheus datasource（isDefault:false、uid:prometheus）
│   └── alerting/rules.yml          # 新：baseline alert rule group（rust-api target down …）

docker-compose.yml                  # 改：+prometheus/postgres_exporter/redis_exporter/pushgateway(profiles:[metrics]) + prometheus_data volume + grafana profile→["obs","metrics"]
docker-compose.dev.yml              # 改：metrics host port(23090/29091) + prometheus/grafana config bind-mount override
docker-compose.prod.yml             # 改：metrics internal override + config bind-mount
```

**Structure Decision**: 沿用 rev2 既有 compose 分層(master + dev/prod override、`profiles:` opt-in、named volume auto-prefix、secret reuse) + 031 obs 既有 grafana provisioning。metrics 4 service inline 在 master(profiles:[metrics])、grafana 改雙 profile。rust-api 改動侷限 `server`(metrics layer+route+enforce counter)+ `cleanup-job`(push)兩既有 crate、**無新模組/crate**。config 檔集中 `deploy/{prometheus,grafana-provisioning}/`。

## Complexity Tracking

> Constitution Check 8/8 PASS、無違反項 → 本節留空（無需 justification）。
