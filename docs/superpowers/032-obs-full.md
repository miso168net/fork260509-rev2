# 032-obs-full — spec-design（階段 0 brainstorm）

> 本檔為 feature 032-obs-full 的 Phase 0 brainstorm spec-design（CLAUDE.md §3 階段 0）。
> 定案後由 **user 手動 `/speckit-specify`**（讓 `speckit.git.feature` pre-hook 建 `032-obs-full` branch）→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`。
> 本檔不是 spec.md;它是餵給 `/speckit-specify` 的設計輸入。

**Feature**: observability — **full（metrics）**（Phase 6 obs 第二刀;接續 031 obs-min 的 log 半邊、補 metrics 半邊）
**Created**: 2026-06-07
**前序**: **031-obs-min ✅ merged `3383828`**（loki+alloy+grafana log-only opt-in 堆疊已就位）。obs-full 為 DESIGN §8.5「Phase 6 obs-full（+ prometheus + 3 exporter + pushgateway + grafana alerting）」、觸發時機=「性能監控 / alerting 需求」。**同時閉掉自 Phase 3 #5 起就明文 parked 的「enforce metrics 埋點」債**（「無 prometheus/grafana 消費者前做＝重工」——031 已把 grafana 立起、消費者到位）。

---

## 1. 目標（purpose / success criteria）

維運者（人類或 AI）面對效能/容量/錯誤率問題時，從 **grafana 的 prometheus datasource** 查全 stack 的 metrics（rust-api HTTP 請求量/延遲/錯誤、enforce allow/deny、DB/redis 基礎設施狀態），並對關鍵失效有 **baseline 告警規則** —— 把 031 的 log 觀察補成「log + metrics」完整觀察性。

**Success criteria**:
- dev stack `--profile metrics`（與 031 `--profile obs` 可組合）起，打一批 rust-api 請求 → grafana prometheus datasource 查到 HTTP request count/latency by route/status，且 **enforce allow/deny counter 隨 200/403 增長**（閉 Phase 3 #5 債）。
- postgres_exporter / redis_exporter 的 metrics 進 prometheus、grafana 可查 DB/redis 狀態。
- pushgateway 可接 one-shot job（cleanup-job）推的 metric。
- baseline alert rules（rust-api down / 高 5xx / DB·redis down）provisioned。
- 一般 `up`（無 `--profile metrics`）**不**啟 metrics service（opt-in，鏡像 031）。
- **base-web 零改、無 wire 端點（/metrics 是 ops 非 wire）、無 migration、無新 workspace crate（deps only）**。

---

## 2. 決策拍板（brainstorm 2026-06-07）

| # | 決策 | 拍板 | 理由 |
|---|---|---|---|
| **D1** | scope / 拆分 | **一刀做完整 obs-full**：app metrics + 2 exporter + prometheus + pushgateway + baseline alerting（**dashboard 另開、見 D5**） | user 親選。不拆增量、一個 feature 交付完整 metrics pipeline。 |
| **D2** | 配置來源：參照 rev1 vs greenfield | **純 greenfield**（upstream 標準 prometheus/exporter config、app 埋點自訂） | user 親選。與 031 D1 一致、守 §I.5、不碰 rev1 source;§11.6 明示「axum-casbin 重寫可不繼承 rev1 metrics 客製包袱」。rev1 obs-full 前例存在但不採用（見 §3）。 |
| **D3** | rust-api metrics 出法 | **`axum-prometheus` crate**（HTTP metrics + `/metrics` handler）+ **enforce metrics 自埋**（`enforce_mw` 內 `metrics::counter!` allow/deny） | user 親選。少自寫 code;底層 `metrics` + `metrics-exporter-prometheus`、自埋的 enforce counter 經同一 recorder 從 `/metrics` 一起輸出。MSRV 1.75 ≤ 1.86 ✅、0.5.0+ 支援 axum 0.7。 |
| **D4** | compose profile | **開新 `profiles: ["metrics"]`**（031 維持 `obs`=log-only;**grafana 加入 `["obs","metrics"]` 兩 profile** 當共用 UI;完整觀察性 = `--profile obs --profile metrics`） | user 親選。log 與 metrics 可獨立 opt-in;grafana 須在兩 profile 皆可起（否則 metrics-only 無 UI）。 |
| **D5** | grafana dashboard 是否本刀 | **另開（dashboard-provisioning = Phase 6 #3）**;032 只交 metrics pipeline（prometheus + datasource + Explore 可查 + alert rules） | user 親選。鏡像 031 obs-min 為 Explore-only;dashboard JSON 設計另立 feature、焦點清楚。 |
| **D6** | pushgateway 是否本刀 | **含**：加 pushgateway service + **cleanup-job 埋 push**（推 last-run / rows-deleted gauge） | user 親選（完整 obs-full）。migrate 等其他 one-shot job 推 metric 視需要、最小化。 |
| **D7** | alerting 深度 | **baseline alert rules provisioned（grafana unified alerting）**：rust-api down / 高 5xx 比率 / postgres·redis exporter down;**notification channel（SMTP/webhook）defer follow-up**（需真實 creds、鏡像 acme 需真實 domain 的延後） | Claude 推薦、user 未反對。alert rule 可重現 provision;channel 需環境 creds、留部署期。 |
| **D8** | `/metrics` 安全擺法 | **公開 ops route 掛 :21081**（像 `/health`、**無 enforce**）;prometheus 內網 scrape;**nginx 不對外 proxy `/metrics`** → prod 仍 internal-only 不暴露 | user 親選（題幹）。prometheus 需無認證 scrape;prod 不經 front-nginx 暴露故安全。對外暴露/scrape auth 硬化留 security pass。 |
| **D9** | enforce metrics 位置 | **`auth/enforce.rs` `enforce_mw` 內埋**（allow/deny counter） | Claude 推薦。Phase 3 #5 點名的「enforce 埋點」自然落點;RUSTAPI-SOURCE-ISOLATION 預設可動軌道、非 ★。 |

---

## 3. Grounding 驗證事實（grep-backed，不信抽象假設）

- **rust-api 零 metrics 基建**：`rust-api/Cargo.toml` 只有 `axum=0.7` / `tracing=0.1` / `tracing-subscriber=0.3`,**無 `metrics` / `metrics-exporter-prometheus` / `axum-prometheus` / `tower-http` / `prometheus`**（grep 全空）→ D3 全新 deps。
- **router 組裝點**：`server/src/main.rs:117` `Router::new()`;`/health`（`:118`）= 公開無 middleware、無 enforce → **`/metrics` 同樣擺法**（公開 ops route）。protected route 用 `.route_layer(enforce_mw)`、`ctx_mw` 是全域 `from_fn_with_state`（031 已在 `audit_ctx.rs` 加 span）。
- **enforce middleware**：`server/src/auth/enforce.rs` `enforce_mw`（`:47`/`:55`+）= bearer→JWT verify→per-role `enforce((role,path,method))`→任一 allow 放行 / 全 deny → **HTTP 403 + envelope `5003`** → D9 allow/deny counter 埋此。`auth/` 另有 `session`/`button_auth`/`endpoint_auth`/`menu_auth`/`policy_watcher`/`settings_watcher`（後續 metrics 可擴）。
- **compose profile 範式**：master `docker-compose.yml` `profiles:["obs"]`（loki `:162`/alloy `:172`/grafana）、`profiles:["jobs"]`（cleanup-job `:95`）、`profiles:[prod]`（acme `:151`);named volume 無顯式 `name:`（`name: rev2-admin` auto-prefix）、secret `file:` 範式 → D4 沿用、grafana 改 `["obs","metrics"]`。
- **port 保留**（CLAUDE §8.2）：**prometheus `23090`**、**pushgateway `29091`** 已保留（dev 127.0.0.1）;exporter 內網無 host port。
- **secret 預登**（`deploy/secrets/README.md` ⏳ 選用表）：**`postgres_exporter_dsn`**、**`redis_exporter_password`** 已預登 Phase 5/6 → 本刀轉 active（鏡像 031 grafana_admin_password ⏳→active）。
- **031 既有 obs infra 可沿用**：grafana datasource file-provisioning（`deploy/grafana-provisioning/datasources/loki.yml`）→ 加 `prometheus.yml`;secret/profile/dev-prod-override/pin 範式皆 031 已立。
- **axum-prometheus 可行**（WebSearch 2026-06）：0.5.0+ 支援 axum 0.7、MSRV **1.75**（≤ 1.86 ✅）、底層 `metrics`+`metrics-exporter-prometheus`(0.7.0 bump metrics→0.23/exporter→0.15);**最新 0.10.0 可能已上 axum 0.8 → plan 須 pin axum-0.7-相容版**。
- **rev1 obs-full 前例存在但不採用**（D2 greenfield）：`/mnt/d/AnewSpaces/x_Project/fork260509-rev1` 有 `specs/044-observability-and-cleanup-pass` + `docker-compose.observability.yml`（8-service obs-full）+ `deploy/{loki,promtail}-config.yml` + grafana provisioning;僅作「問題理解」概念參考（讀 spec≠拷貝 source、§I.5 守住）。

---

## 4. 完整設計

### 4.1 架構（擴 031 obs stack 加 metrics 維度）

031 給了 **loki ← alloy → grafana**（log 半邊）。032 補 **metrics 半邊**：

```
  rust-api :21081/metrics ─┐
  postgres_exporter ───────┤
  redis_exporter ──────────┼──scrape──> prometheus ──datasource──> grafana
  pushgateway ─────────────┘            (儲存/PromQL)              (Explore + alert rules)
     ↑ push
  cleanup-job (one-shot)
```

### 4.2 rust-api metrics（唯一動 code、worktree）

- **`axum-prometheus`**：`PrometheusMetricLayer`（全域 `.layer()`，產 HTTP request count/duration/in-flight by method·matched-path·status）+ `/metrics` route（render recorder）掛在 `main.rs` router（公開、無 enforce、像 `/health`）。
- **enforce metrics 自埋（D9）**：`enforce_mw` 在 allow/deny 分支 `metrics::counter!("rust_api_enforce_decisions_total", "decision"=>allow|deny).increment(1)`(label cardinality 紀律：用 decision、酌量 role;**不**用 path/操作者 等高基數)→ 經 axum-prometheus 的 `PrometheusRecorder` 同 `/metrics` 輸出。
- 新 deps：`axum-prometheus`（pin axum-0.7-相容版）+ 其帶的 `metrics`/`metrics-exporter-prometheus`（server crate dep、**非新 workspace member**）。
- **無 wire/DTO/endpoint 業務改動**：`/metrics` 是 ops 端點、base-web 不消費。

### 4.3 prometheus（新 service、`profiles:[metrics]`）

- **static scrape config**（`deploy/prometheus.yml`、greenfield、targets 固定）：`rust-api:21081/metrics`、`postgres_exporter:9187`、`redis_exporter:9121`、`pushgateway:9091`、（酌量 prometheus 自身 / grafana / loki / alloy 的 self-metrics）。
- **bounded retention**（鏡像 loki 72h 的 bounded 精神，如 `--storage.tsdb.retention.time=15d`、plan 拍最終值）、scrape_interval 15s。
- dev host `127.0.0.1:23090:9090`、**prod internal-only**（無對外 host port）、named volume `prometheus_data`。

### 4.4 exporter sidecar（新、`profiles:[metrics]`）

- **postgres_exporter**：pin 版本、secret `postgres_exporter_dsn`（plan 決：reuse soybean superuser DSN vs least-priv PG role — 牽 030 follow-up）。
- **redis_exporter**：pin 版本、連既有 redis（plan 決：reuse `redis_password` secret vs 預登的 `redis_exporter_password`）。
- 內網（無 host port、被 prometheus scrape）。

### 4.5 pushgateway（新 service、`profiles:[metrics]`）+ cleanup-job 埋 push（D6）

- pushgateway service、dev host `127.0.0.1:29091:9091`、prod internal-only。
- **cleanup-job** binary 加最小 push：跑完推 `cleanup_job_last_success_timestamp` / `cleanup_job_rows_deleted`（用 `metrics`+pushgateway client 或直接 HTTP PUT pushgateway API）→ prometheus scrape pushgateway 得 job metrics。

### 4.6 grafana（擴 031）

- 加 prometheus datasource provisioning（`deploy/grafana-provisioning/datasources/prometheus.yml`，鏡像 loki.yml）。
- 加 baseline **alert rules** provisioning（grafana unified alerting `deploy/grafana-provisioning/alerting/*.yml`）：rust-api down / 高 5xx 比率 / postgres·redis exporter down。**notification channel defer**（D7）。
- grafana service profile 改 `["obs","metrics"]`（兩 profile 共用 UI）。

### 4.7 compose / profile / port / secret

| service | image（plan pin） | profile | dev host port | volume | secret |
|---|---|---|---|---|---|
| prometheus | `prom/prometheus:<pin>` | metrics | `127.0.0.1:23090:9090` | `prometheus_data` | — |
| postgres_exporter | `<pin>` | metrics | 無 | — | `postgres_exporter_dsn` |
| redis_exporter | `<pin>` | metrics | 無 | — | redis pwd |
| pushgateway | `prom/pushgateway:<pin>` | metrics | `127.0.0.1:29091:9091` | — | — |
| grafana（既有、改 profile） | `grafana/grafana:13.0.2` | **obs+metrics** | `127.0.0.1:23000:3000` | `grafana_data` | `grafana_admin_password` |

- dev override：host port（綁 127.0.0.1）+ config bind-mount（prometheus.yml / grafana prometheus datasource + alerting）。prod override：internal-only + config bind-mount（鏡像 031）。
- 完整觀察性 = `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --wait`。

---

## 5. 範圍外（OUT — 明確不做）

- **grafana dashboard**（master/rust-api/postgres/redis/audit overview）→ dashboard-provisioning feature（Phase 6 #3、D5）。
- **alert notification channel**（SMTP/webhook 送信）→ follow-up（需真實 creds、D7）。
- **prometheus alertmanager 獨立 service** → 用 grafana unified alerting、不另起 alertmanager。
- **tracing/distributed tracing（tempo/OTel）** → 非本刀（031 已給 request_id log 關聯地基）。
- **rev1 source 拷貝** → greenfield（D2）。
- **prod /metrics 對外暴露 / scrape auth 硬化** → security pass。
- **031 §2.36 的 alloy non-root / obs healthcheck / flatten_event** → 各自 follow-up、非本刀。

---

## 6. Constitution pre-check（v1.6.0 §IV 8 問、待 plan Constitution Check 複核）

| # | 問項 | 預判 |
|---|---|---|
| 1 | §I.1 base-web 權威/缺 endpoint? | **PASS（N/A）**：`/metrics` 是 ops scrape 端點、base-web 零改、不消費。 |
| 2 | 動 base-web inline / ★ 軌道? | **PASS（N/A）**：base-web 零改。 |
| 3 | §I.2 menu Casbin? | **N/A**：不涉 menu。 |
| 4 | §I.3 wire 對齊 mock? | **PASS（N/A）**：`/metrics` = prometheus 文字格式、非 base-web wire envelope;enforce counter = internal。 |
| 5 | §I.5 rev1 拷貝? | **PASS**：greenfield（D2）、不讀/拷 rev1 source（rev1 obs-full 僅概念參考）。 |
| 6 | §II 拍板（§8.5/§11.8 obs）? | **PASS**：§8.5 列「obs-full=+prometheus+3 exporter+pushgateway+grafana alerting」、032 逐字對齊;採集/出 metrics 元件選擇為實作層、無拍板撤回。 |
| 7 | §III ★ 軌道? | **PASS（N/A）**：`/metrics` route + `enforce_mw` 埋點 = RUSTAPI-SOURCE-ISOLATION（預設可動、非 ★ MODAL-WIRING/BASE-WEB-BUILD-CONFIG）。 |
| 8 | 新建業務表 §I.6 審計欄? | **PASS（N/A）**：**無 migration/新表**（metrics 在 prometheus、非 DB）。 |

**§3 紀律**：`axum-prometheus` 等是 **server crate 的 dep、非新 workspace member** → 「新 crate ⇒ prod build」嚴格不觸發;但**新 deps 進 runtime image，acceptance 仍含 prod target build**（鏡像 027 sha2/chrono dep 的處理）。

**預判：8/8 PASS、無 amendment、無新 crate/表/migration、base-web 零改。**

---

## 7. plan 階段待 grounding（/speckit-plan research.md 必補）

1. **`axum-prometheus` 版本 pin**：查 axum-0.7-相容的最後一版（避開已上 axum 0.8 的 0.10 線）+ 其帶的 `metrics`/`metrics-exporter-prometheus` 版本能在 **Rust 1.86** 編（前車＝013 jsonwebtoken MSRV）;`Cargo.lock` 解析確認。
2. **axum-prometheus 預設 label**：HTTP metric 的 path label 是 **matched route pattern**（低基數、good）還是 raw path（高基數、炸 prometheus）→ 確認 + 必要時設定。
3. **enforce counter label 設計**：decision（allow/deny）必;role 視基數（R_SUPER/R_ADMIN/R_USER_COMMON 固定 3 個、可接受）;**禁** path/operator/trace_id 等高基數 label。
4. **exporter image pin + config**：postgres_exporter / redis_exporter 版本、scrape port、metric set;`postgres_exporter_dsn`（least-priv role vs soybean）+ redis_exporter secret（reuse `redis_password` vs `redis_exporter_password`）拍板。
5. **prometheus image pin + retention 值 + scrape config**：static targets 清單、scrape_interval、retention.time。
6. **pushgateway**：cleanup-job push 的 client 做法（`metrics` + pushgateway exporter vs 直接 HTTP PUT pushgateway `/metrics/job/<job>`）+ 要推哪些 metric。
7. **grafana**：prometheus datasource provisioning YAML + unified alerting provisioning 格式（rule group YAML）+ grafana 改 `["obs","metrics"]` profile 的相容性（datasource 指向未起的 prometheus/loki 時的 graceful 行為）。
8. **/metrics 不被 nginx proxy**：確認 `deploy/nginx/conf.d/_locations.inc` 的 `/api/` proxy 不涵蓋 `/metrics`（rust-api 直 :21081、nginx 只 proxy `/api/`）→ prod 不暴露。

---

## 8. acceptance 取徑（待 contracts/verification-commands.md）

- **無新單元測試**（metrics 為 instrumentation wiring;若 enforce counter 有可抽純邏輯則 test-first，否則由 C-V 覆蓋、plan/tasks 明示理由）。**無 CDP**（prometheus/grafana 是 ops UI、非 base-web）。
- 活體 C-V（鏡像 031 C1-C7 風格）：
  - C1 `/metrics` 活體：rust-api `/metrics` 回 prometheus 文字格式、含 HTTP request metric。
  - C2 enforce counter：打 allow（Super 200）+ deny（User 403/5003）→ `/metrics` 的 enforce allow/deny counter 各增。
  - C3 prometheus scrape：prometheus targets up（rust-api/2 exporter/pushgateway）、PromQL 查得 metric。
  - C4 exporter：postgres/redis exporter metric 進 prometheus。
  - C5 grafana prometheus datasource：grafana proxy 查 prometheus 成功。
  - C6 pushgateway：cleanup-job 跑後 pushgateway 有 job metric、prometheus scrape 得。
  - C7 alert rules：grafana alert rules provisioned（rule list 非空）。
  - C8 profile gating：一般 up（無 `--profile metrics`）不啟 metrics service;`--profile obs` 仍只 log。
  - C9 行為零侵入 + 旁路：`/metrics` 加 layer 前後 `/auth/login` 回應碼/envelope 不變;停 prometheus 後 app 請求仍成功（FR-008 旁路）。
  - **C10 prod**：`-f docker-compose.prod.yml --profile metrics build + up` → metrics service internal-only 起（§3 prod 產物驗）。
  - 守恆：`dcargo test -p server`（埋點不破既有）+ entity_access_lint + compose 多模 config parse。

---

> **交棒**：本 spec-design 定案後 → **user 手動 `/speckit-specify`**（input=本檔、pre-hook 建 `032-obs-full` branch）。Claude 不替你觸發（避免漏 `speckit.git.feature`）。
