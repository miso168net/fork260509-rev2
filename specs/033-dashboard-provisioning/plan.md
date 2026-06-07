# Implementation Plan: Observability — Dashboard Provisioning

**Branch**: `033-dashboard-provisioning` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/033-dashboard-provisioning/spec.md`

## Summary

把 DESIGN §10 Phase 6 #3「dashboard provisioning」、§2.37「grafana dashboard(metrics)留 dashboard-provisioning feature」落地，補完 031 obs-min(log)+ 032 obs-full(metrics)的「可看」面：把觀察性從 Explore + alert-only 變成**開 grafana 即見的 6 張現成監控面板**。**純 grafana config**：新 `deploy/grafana-provisioning/dashboards/`(1 provider yaml + 6 dashboard JSON)+ 改 031 `loki.yml` 加顯式 `uid: loki`。**6 板** = master overview / rust-api / cleanup-job / audit-log(4 張 greenfield 自寫、貼 rev2 真實 metric/log)+ postgres / redis(2 張 pin 官方 exporter dashboard、upstream 工具)。**base-web + rust-api 零改、無 migration/新 crate/新 secret/新 compose service**。grounding 全對 live stack 取證(3 平行 research agent)。設計來源見 [spec-design](../../docs/superpowers/033-dashboard-provisioning.md)(8 決策 D1-D8)。

## Technical Context

**Language/Version**: 無 code 改動(純 grafana config:YAML provider + dashboard JSON `schemaVersion:39`);grafana `13.0.2`(reuse 031/032)。

**Primary Dependencies**: grafana `13.0.2`(既有、無新 image);prometheus datasource(032、uid:prometheus)+ loki datasource(031、本刀補 uid:loki);community dashboard pin(`postgres_mixin/postgres-overview.json @ postgres_exporter v0.19.1` + grafana.com `763 rev6` for redis_exporter v1.85.0)。**無 rust/npm dep、無新 image**。

**Storage**: 無 DB 改動;dashboard 存 grafana 自身 DB(`grafana_data` 既有卷、file-provisioning 讀 JSON 寫 grafana DB、不回寫 `:ro` mount)。無新卷。

**Testing**: **無新單元測試**(dashboard 全 config;§3「由 C-V 覆蓋」)。acceptance = 活體 C-V(C0-C5 + 守恆、見 contracts/verification-commands.md):6 板 provisioned + datasource 解析 + panel query 經 proxy 回資料 + provisioning log 乾淨 + prod internal-only + 031/032 不破。**無 CDP**(grafana 獨立 ops UI、非 base-web)。

**Target Platform**: Linux server(docker-compose;grafana 既有雙 profile `["obs","metrics"]`、dashboards 隨 grafana 起即 provision)。

**Project Type**: observability infra(grafana provisioning config:1 provider yaml + 6 dashboard JSON + 1 datasource uid 補)。

**Performance Goals**: N/A(dashboard 為唯讀觀察視圖、不在請求路徑;FR-009 零侵入)。

**Constraints**: pure config(無 rust/base-web 改、無採集/埋點新增、FR-009);datasource 引用穩定 uid(FR-007);opt-in(隨 grafana/觀察堆疊、FR-008);prod internal-only(FR-010);app 板 greenfield + infra 板 upstream exporter dashboard(非 rev1、§I.5/D8);community dashboard pin deterministic + metric-name 對 live 驗(R2/R3)。

**Scale/Scope**: 6 dashboard(4 greenfield + 2 community pin)+ 1 provider yaml + 1 datasource uid 補;個人/dev workspace 規模;改動 ≈ 7 新檔(`deploy/grafana-provisioning/dashboards/`)+ 1 改檔(`datasources/loki.yml`)。

## Constitution Check

*GATE: 對照 `.specify/memory/constitution.md` v1.6.0 §IV 八問,Phase 0 前必過、Phase 1 後複查。*

| # | Compliance 問項 | 結論 | 依據 |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **PASS（N/A）** | 無 wire 端點、base-web 完全零改;dashboard 是 grafana ops config、base-web 不消費。 |
| 2 | 動到 base-web inline?屬哪條 ★ 軌道? | **PASS（N/A）** | **零 base-web 檔案改動** → 不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG。 |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **N/A** | 不涉 menu。 |
| 4 | wire 設計對齊 §I.3 mock?(envelope/id/error/enum) | **PASS（N/A）** | **無 wire 改動**;dashboard JSON = grafana config(非 base-web wire envelope);不改任何回應序列化/DTO/端點。 |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | **PASS** | app dashboard(master/rust-api/audit-log/cleanup-job)**greenfield**;infra(pg/redis)用**官方 exporter dashboard**(prometheus-community/oliver006 專案 deliverable、版本鎖 exporter tag、upstream 工具同 image 本身、**非 rev1 source**);Phase 0 全程未讀/拷 rev1 obs dashboard(D8)。 |
| 6 | 凍結到 §II 拍板?需改任一拍板? | **PASS** | §8.5「obs 漸進堆疊」;dashboard 是觀察面、§2.37 已列為 dashboard-provisioning feature → 逐字對齊;dashboard 來源(greenfield/upstream)為**實作層**、非拍板凍結值 → 不構成撤回、無 amendment。 |
| 7 | 觸及 §III ★ 軌道?邊界內? | **PASS（N/A）** | `deploy/grafana-provisioning/` = deploy infra config、**非 ★ 軌道**(MODAL-WIRING/BASE-WEB-BUILD-CONFIG 皆 base-web)。 |
| 8 | 新建業務表(create migration)?含 §I.6 六審計欄? | **PASS（N/A）** | **無 migration / 無新表**(dashboard 在 grafana、非 DB)。 |

**結論：8/8 PASS**（純 grafana config、Constitution 表面極小）。**無 Complexity Tracking 項。** 無 amendment。

**§3 紀律檢查**：
- **「新 workspace crate ⇒ acceptance 必含 prod image build」**：**嚴格不觸發**（**無 rust 改動**、純 grafana config、無新 crate/dep）;但 acceptance **仍含 C5 prod `--profile obs --profile metrics` 起 + dashboards internal-only**（FR-010/SC-005、沿 031/032 prod 產物驗精神）。
- **「CDP smoke defer 風險」**：**N/A**（grafana 是獨立 ops UI、非 base-web modal/UI）;不適用。
- **「無新純函式測試 ⇒ 由 acceptance C-V 覆蓋」**：已於 plan/contracts **明示**（dashboard = config、C0-C5 活體覆蓋）;tasks 階段續明示。

## Project Structure

### Documentation (this feature)

```text
specs/033-dashboard-provisioning/
├── plan.md                       # 本檔（/speckit-plan）
├── research.md                   # Phase 0（R1-R8、live-grounded:grafana provisioning 格式 + exporter dashboard pin + panel query + loki-uid）
├── data-model.md                 # Phase 1（dashboard/panel/datasource 模型 + 6 板 panel/query 清單）
├── quickstart.md                 # Phase 1（改動清單 + 跑 + 驗收）
├── contracts/
│   ├── config-contract.md        # provider yaml/JSON/datasource/pin/叫用契約
│   └── verification-commands.md  # C-V 驗收 C0-C5 + 守恆 + 無新單元測試明示
├── checklists/requirements.md    # /speckit-specify 產（已全綠 16/16）
└── tasks.md                      # Phase 2（/speckit-tasks，非本步）
```

### Source Code (repository root)

```text
deploy/grafana-provisioning/
├── dashboards/                          # 新目錄
│   ├── provider.yaml                    # 新：file provider（folder obs-full、options.path json/）
│   └── json/                            # 新：dashboard JSON（schemaVersion 39）
│       ├── master-overview.json         # 新（greenfield、uid:prometheus）
│       ├── rust-api.json                # 新（greenfield、uid:prometheus；5xx or vector(0)）
│       ├── cleanup-job.json             # 新（greenfield、uid:prometheus；無 up{job=cleanup_job}）
│       ├── audit-log.json               # 新（greenfield、uid:loki；nginx |~ `^{`、level top-level、fields_trace_id）
│       ├── postgres.json                # 新（community pin postgres_mixin@v0.19.1 + datasource 變數 pin uid）
│       └── redis.json                   # 新（community pin 763 rev6 + ${DS_PROM}→prometheus、刪 __inputs）
└── datasources/
    └── loki.yml                         # 改：加 uid: loki（D4）

# 無 compose/secret/rust-api/base-web/migration 改動（grafana 已雙 profile、provisioning 目錄已整掛）
```

**Structure Decision**: 沿用 031/032 既有 grafana provisioning 範式（`datasources/` + `alerting/` + 新 `dashboards/`）。grafana 掃 `dashboards/*.yaml` 找 provider、provider `options.path` 指 `dashboards/json/` 的 dashboard JSON（路徑分工、R1）。dashboards 進既有 `obs-full` folder（reuse 032 alert folder）。datasource 引用穩定 uid（prometheus 既有顯式 + loki 本刀補顯式）。**無新 compose service / mount**（既有整目錄 bind-mount 自動含括新 `dashboards/`）。

## Complexity Tracking

> Constitution Check 8/8 PASS、無違反項 → 本節留空（無需 justification）。
