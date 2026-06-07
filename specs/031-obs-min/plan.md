# Implementation Plan: Observability — Minimal (Log-Only)

**Branch**: `031-obs-min` | **Date**: 2026-06-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/031-obs-min/spec.md`

## Summary

把 DESIGN §11.8 拍板「Phase 5+ 啟 obs-min（log-only）」落地:一個 **opt-in（`profiles:[obs]`）log 觀察堆疊** —— **loki**(集中儲存/LogQL) ← **alloy**(docker service-discovery 採集全容器 stdout、取代 EOL 的 promtail) → **grafana**(Explore 查詢 UI、loki datasource provisioning)。rust-api `ctx_mw` 把既有 `trace_id` 注入 tracing log(span + flat boundary event) → grafana log 可用 `request_id` 對接 `sys_access_log` 審計列;front-nginx 改 stdout JSON access log + 傳 `X-Request-Id` 給 rust-api(跨服務同源 id)。**純後端/infra**:無 base-web、無 wire 端點、無 migration、無新 crate、無 dashboard/metrics(留 obs-full)。greenfield(不參照 rev1)。設計來源見 [spec-design](../../docs/superpowers/031-obs-min.md)(5 決策;D3 promtail 於 plan 階段因 EOL superseded 為 alloy)。

## Technical Context

**Language/Version**: Rust edition 2021 toolchain 1.86(rust-api `audit_ctx.rs` 唯一 code 改、走 dev docker `dcargo`);其餘為 YAML/River/nginx config（無語言 runtime）

**Primary Dependencies**: `tracing 0.1.44` + `tracing-subscriber 0.3.23`(既有 server dep、`Instrument`/`info_span!`、**零新 dep**);obs images(pinned §6):`grafana/loki:3.7.2` / `grafana/alloy:v1.16.1` / `grafana/grafana:13.0.2`

**Storage**: 無 DB 改動(無 migration/表)。loki filesystem 儲存於 named volume `loki_data`(TSDB schema v13、retention 72h);grafana state `grafana_data`;alloy position `alloy_data`

**Testing**: **無新單元測試**(request_id 注入是 span wiring;§3 明示「由 C-V 覆蓋」);既有 `extract_trace_id` 單測(`audit_ctx.rs:197-210`)不變。acceptance = 活體 C-V(C1-C7、見 contracts/verification-commands.md):loki HTTP API query + psql trace_id 對帳 + profile gating + prod `--profile obs` 起 + 旁路不反壓。**無 CDP**(obs 無 base-web UI、grafana 獨立 ops UI)

**Target Platform**: Linux server(docker-compose;obs 三 service 為 `profiles:[obs]` opt-in、常駐 sidecar)

**Project Type**: observability infra(compose service ×3 + config 檔)+ 後端 log 注入(server `audit_ctx.rs` 1 處 span)+ deploy config(nginx JSON log)

**Performance Goals**: log 採集為盡力而為旁路、無 SLA(FR-008);loki/alloy 不在請求路徑、不得反壓 app(SC-006)

**Constraints**: log-only(metrics/dashboards/alerting OUT → obs-full);opt-in `profiles:[obs]`(一般 up 不啟、FR-006);零 wire/行為侵入(FR-007);bounded retention(FR-010、72h deploy-settable);greenfield(§I.5、不參照 rev1);image pinned(§6、不浮動)

**Scale/Scope**: 5 來源服務 log(rust-api/front-nginx/postgres/redis-stack/base-web);個人/dev workspace 規模;改動 ≈ 1 處 rust-api span + 3 obs service + 4 新 config 檔 + nginx conf 2 處 + compose 3 檔 + 1 secret

## Constitution Check

*GATE: 對照 `.specify/memory/constitution.md` v1.6.0 §IV 八問,Phase 0 前必過、Phase 1 後複查。*

| # | Compliance 問項 | 結論 | 依據 |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **PASS（N/A）** | obs **無 wire 端點**、base-web 完全零改;grafana 是獨立 ops UI、非 base-web。 |
| 2 | 動到 base-web inline?屬哪條 ★ 軌道? | **PASS（N/A）** | **零 base-web 檔案改動** → 不觸 MODAL-WIRING / BASE-WEB-BUILD-CONFIG。 |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **N/A** | 不涉 menu。 |
| 4 | wire 設計對齊 §I.3 mock?(envelope/id/error/enum) | **PASS（N/A）** | **無 wire 改動**;rust-api span = internal log enrichment(不改序列化/DTO/端點);nginx JSON `log_format` = observability 非 wire 契約;`X-Request-Id` proxy header 為 backend 已容忍的既有 header(`audit_ctx.rs:31`)、不改回應形狀(FR-007/SC-004)。 |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | **PASS** | **greenfield**(D1);config 全新寫、Phase 0 research 全程未讀/grep rev1 source(守 §I.5 process 紀律 `constitution.md:69`)。 |
| 6 | 凍結到 §II 13 拍板?需改任一拍板? | **PASS（透明化注記、判定無需 amendment）** | §11.8「(a) 漸進 — Phase 5 obs-min(loki+promtail+grafana,log-only)」—— 031 = 此 log-only triple、範圍/時機逐字對齊。**採集 agent promtail→alloy 是 EOL fix-forward 的實作元件替換**(能力等價:docker-SD + loki push;§6 紀律性);判定 §11.8 凍結的是「obs-min 漸進範圍」非「promtail 此特定元件不可換」→ **不構成拍板撤回/修改、無需 amendment**。⚠️ **已 surface user(2026-06-07 親決 alloy)**;若 analyze/user 認為「promtail」字面屬凍結元件,則走 §V.2 **PATCH** amendment 釐清措辭(「採集 agent 為可替換實作」)— 見 research R12。 |
| 7 | 觸及 §III ★ 軌道?邊界內? | **PASS（N/A）** | ★ 軌道 = base-web `src/views/manage/**`(MODAL-WIRING)/ `build/plugins/router.ts`(BASE-WEB-BUILD-CONFIG);`deploy/nginx/nginx.conf` 是 **deploy infra、非** ★ 軌道;rust-api `ctx_mw` span 是 internal(RUSTAPI-SOURCE-ISOLATION 為預設可動軌道、非 ★)。 |
| 8 | 新建業務表(create migration)?含 §I.6 六審計欄? | **PASS（N/A）** | **無 migration / 無新表**(最新仍 m030);§I.6 不觸發。 |

**結論：8/8 PASS**（純 infra/後端、Constitution 表面極小）。**無 Complexity Tracking 項。** 唯一注記 = #6 promtail→alloy 的 §11.8 措辭透明化(判定無需 amendment、已 surface user;留 /speckit-analyze + user plan review 最終確認)。

**§3 紀律檢查**:
- **「新 workspace crate ⇒ acceptance 必含 prod image build」**:**不觸發**(無新 crate、tracing 既有);但 acceptance **仍含 C5 prod `--profile obs` build+起**(FR-009/SC-005、「正式產物驗」精神)。
- **「CDP smoke defer 風險」**:**N/A**(obs 無 base-web modal/UI);不適用。
- **「無新純函式測試 ⇒ 由 acceptance C-V 覆蓋」**:已於 plan/contracts **明示**(request_id 注入 = span wiring、C1/C2 活體覆蓋);tasks 階段須續明示。

## Project Structure

### Documentation (this feature)

```text
specs/031-obs-min/
├── plan.md                       # 本檔（/speckit-plan）
├── research.md                   # Phase 0（R1-R13、grep-backed + WebSearch 版本）
├── data-model.md                 # Phase 1（log 記錄/label schema/request_id flow/span 注入）
├── quickstart.md                 # Phase 1（改動清單 + 跑 + 驗收）
├── contracts/
│   ├── config-contract.md        # config/compose/叫用/接點契約
│   └── verification-commands.md  # C-V 驗收 C1-C7 + 無新單元測試明示
├── checklists/requirements.md    # /speckit-specify 產（已全綠）
└── tasks.md                      # Phase 2（/speckit-tasks，非本步）
```

### Source Code (repository root)

```text
rust-api/server/src/
└── audit_ctx.rs                  # ctx_mw 包 tracing span + boundary event 注入 trace_id（唯一 code 改、worktree）

deploy/
├── loki-config.yml               # 新：單機 loki、filesystem、TSDB v13、retention 72h
├── alloy-config.alloy            # 新：River — docker-SD + relabel(service label) + loki.source.docker + loki.write
├── grafana-provisioning/
│   └── datasources/loki.yml      # 新：grafana loki datasource
├── nginx/
│   ├── nginx.conf                # 改：JSON log_format + access_log /dev/stdout + error_log /dev/stderr
│   └── conf.d/_locations.inc     # 改：/api/ 加 proxy_set_header X-Request-Id $request_id
├── secrets/
│   ├── grafana_admin_password.txt(.example)  # 新（.txt gitignored、.example tracked）
│   └── README.md                 # 改：grafana_admin_password ⏳→active（doc）
└── generate-secrets.sh           # 改：+ gen_leaf grafana_admin_password

docker-compose.yml                # 改：+loki/alloy/grafana(profiles:[obs]) + 3 volume + grafana_admin_password secret
docker-compose.dev.yml            # 改：obs host port(23000/23100) + config bind-mount override
docker-compose.prod.yml           # 改：obs internal override + config bind-mount
```

**Structure Decision**: 沿用 rev2 既有 compose 分層(master + dev/prod override、`profiles:` opt-in、named volume auto-prefix、`*_FILE` secret)。obs 三 service inline 在 master(D4、鏡像 acme/cleanup-job profile 範式)、**非**獨立 compose 檔。唯一 rust-api 改動侷限 `server/src/audit_ctx.rs`(既有 middleware 內加 span、無新模組/crate)。config 檔集中 `deploy/`。

## Complexity Tracking

> Constitution Check 8/8 PASS、無違反項 → 本節留空（無需 justification）。
