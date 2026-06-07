# 031-obs-min — spec-design（階段 0 brainstorm）

> 本檔為 feature 031-obs-min 的 Phase 0 brainstorm spec-design（CLAUDE.md §3 階段 0）。
> 定案後由 **user 手動 `/speckit-specify`**（讓 `speckit.git.feature` pre-hook 建 `031-obs-min` branch）→ `/speckit-plan` → `/speckit-tasks` → `superpowers:executing-plans`。
> 本檔不是 spec.md;它是餵給 `/speckit-specify` 的設計輸入。

**Feature**: observability — minimal, **log-only**（Phase 6 obs 第一刀;obs-full〔metrics/prometheus〕後做）
**Created**: 2026-06-07
**前序**: Phase 5 全完成（027/028/029/030）。obs 為 DESIGN §11.8 拍板「Phase 5+ 啟 obs-min（loki+promtail+grafana、log-only）」、一直被 027-030 後端 feature 推後的 roadmap 項。

---

## 1. 目標（purpose / success criteria）

維運者（人類或 AI）面對任一 service 的請求異常或 bug 時，從**單一 grafana Loki 入口**查全 stack 的結構化 log，並用 **`request_id` 把 rust-api log 與 `sys_operation_log` / `sys_access_log` 審計列對接** —— 不必逐容器 `docker logs` 比對 timestamp。

**Success criteria**:
- dev stack `--profile obs` 起，打一個 admin write（POST /api/...）→ grafana Loki query `{service="rust-api"} | json` 看到該 request 的 JSON log 帶 `request_id`，且與 psql `SELECT trace_id FROM sys_access_log WHERE ...` 對得起來。
- front-nginx access log 也以 JSON 進 loki。
- 一般 `up`（無 `--profile obs`）**不**啟 obs 三 service（opt-in）。
- **base-web 零改、無 wire 端點、無 migration、無新 crate**。

---

## 2. 決策拍板（brainstorm 2026-06-07）

| # | 決策 | 拍板 | 理由 |
|---|---|---|---|
| **D1** | 配置來源:參照 rev1 obs vs greenfield | **greenfield**（從零寫標準 loki/promtail/grafana 設定） | user 親選。不動 §I.5、不碰 rev1 source;rev1 spec 044 僅作「問題理解」概念參考（讀 spec≠拷貝 source）。配置對齊 rev2 慣例。 |
| **D2** | 範圍 | **完整 log-only**:loki+promtail+grafana pipeline + **rust-api request_id 注入 log** + front-nginx JSON access log;**無 dashboard**（grafana Explore ad-hoc 查） | user 親選。request_id 對接是 obs-min 真正比 `docker logs` 強的核心價值、且 rev2 已有 trace_id plumbing、改動小。 |
| **D3** | nginx log 進 loki 機制 | **nginx 改 stdout JSON**（`access_log /dev/stdout` JSON `log_format` + `error_log /dev/stderr`）→ promtail docker-SD 一致採集 | user 親選。docker 標準做法、與其他容器 stdout 採法一致、無需 file-scrape volume。 |
| **D4** | compose 接線範式 | **`profiles: ["obs"]` inline 在 master `docker-compose.yml`** | user 親選。對齊 rev2 既有慣例（acme `profiles:[prod]`、cleanup-job `profiles:[jobs]`);一般 up 不啟、`--profile obs` 才帶起。 |
| **D5** | rust-api request_id 注入做法 | **沿用既有 `ctx_mw` + tracing span**（非 tower-http TraceLayer） | rev2 `audit_ctx.rs` 已算好 `trace_id`;包一個 span 即可、**零新 dep**。比引入 tower-http TraceLayer 更貼 rev2。 |

> **★ plan 階段更新（2026-06-07 supersede）**:D2/本檔多處的「**promtail**」採集 agent，因 `/speckit-plan` research（WebSearch）查得 **promtail 已 EOL/deprecated**（後繼 = **Grafana Alloy**），經 §6 紀律 surface 後 **user 親決改用 `grafana/alloy`**（同 docker service-discovery + loki push 能力、config 改用 River 語法、非設計改動）。**實作以 [`specs/031-obs-min/research.md` R2/R4](../../specs/031-obs-min/research.md) + [plan.md](../../specs/031-obs-min/plan.md) 為權威**（含 pin:loki `3.7.2`/alloy `v1.16.1`/grafana `13.0.2`、Constitution 8/8 PASS、§11.8 promtail→alloy 判定為 EOL fix-forward 實作替換、無需 amendment）。本 brainstorm 檔的 promtail 字樣保留為歷史記錄、不逐處改寫。

---

## 3. Grounding 驗證事實（grep-backed，不信抽象假設）

- **rust-api 已 JSON-structured log 到 stdout**:`server/src/main.rs:500-507` `init_tracing` = `fmt().with_env_filter(filter)`,`cfg.format` 預設走 `builder.json().init()`（`"pretty"` 才非 JSON）。→ loki 友善、無需大改 log 格式。
- **但目前 log records 不帶 request_id**:`init_tracing` 無 span layer;`audit_ctx.rs` 的 `trace_id` 只寫進**審計 DB**（`sys_access_log.trace_id`、`audit_ctx.rs:136`），未注入 tracing。→ D5 補這個 gap。
- **`ctx_mw` 已有 trace_id plumbing**:`audit_ctx.rs:95-145` global middleware,`extract_trace_id`（`:74`,X-Request-Id header 或 mint uuid v4）→ `RequestContext.trace_id`（`:48`）→ 寫 `sys_access_log`。span 注入點就在 `next.run(req)`（`:124`）外。
- **`tracing` 已是 server dep**（workspace.dependencies `tracing`/`tracing-subscriber{json}`,`rust-api/Cargo.toml:11-12`）→ D5 零新 dep。
- **nginx 現況**:`deploy/nginx/nginx.conf:15-16` `access_log /var/log/nginx/access.log` + `error_log /var/log/nginx/error.log warn`（容器內 file、非 stdout、非 JSON）→ D3 改 stdout JSON。
- **compose 範式**:master `docker-compose.yml` 用 `profiles:` gate（acme `profiles:[prod]` `:131`、cleanup-job `profiles:[jobs]`）、named volume 無顯式 `name:`（靠 `name: rev2-admin` auto-prefix）、secret `file:` 範式（`:152-165`）→ D4 沿用。
- **port 保留**:grafana `23000` 已在 CLAUDE §8.2 保留（observability 3 service「⏳ 尚未進 compose」);loki/promtail **未分配**。
- **rev1 obs 前例存在但不採用**（D1 greenfield）:`/mnt/d/AnewSpaces/x_Project/fork260509-rev1` 有 `specs/044-observability-and-cleanup-pass` + `docker-compose.observability.yml`（8 service obs-full）+ `deploy/{loki,promtail}-config.yml` + `grafana-provisioning/datasources/loki.yml`;僅作概念參考。

---

## 4. 完整設計

### 4.1 架構

```
                      ┌──────────────────────── rev2_net ────────────────────────┐
  全容器 stdout(JSON) │  rust-api / postgres / redis-stack / base-web / front-nginx │
        │             └──────────────────────────────┬─────────────────────────────┘
        │  (docker json-file)                         │
        ▼                                             │ rust-api ctx_mw 注入
  promtail (docker-SD, mount docker.sock) ──push──> loki ◄── tracing span: trace_id/method/path/operator_id
                                                      │
                                              datasource(loki.yml)
                                                      ▼
                                                  grafana (Explore 查;:23000)
```

3 個新 service（`profiles: ["obs"]`、greenfield）:
- **loki**（`grafana/loki`）:log 儲存 + LogQL 查詢。named volume `loki_data`。host port `23100`（dev 限 127.0.0.1）。
- **promtail**（`grafana/promtail`）:採集。mount `/var/run/docker.sock`(ro) + docker service-discovery 自動採集所有 rev2 容器 json-file stdout（label `service=<compose service>`）→ push 給 loki。無 host port。
- **grafana**（`grafana/grafana`）:查詢 UI。named volume `grafana_data`。host port `23000`。datasource provisioning 自動接 loki。secret `grafana_admin_password`。

### 4.2 rust-api request_id 注入（唯一 code 改動）

`audit_ctx.rs` `ctx_mw`:在 `next.run(req)` 外包一個 per-request tracing span:
```rust
let span = tracing::info_span!("request", trace_id = %trace_id, method = %method, path = %path, operator_id = ?operator_id);
let response = next.run(req).instrument(span).await;   // tracing::Instrument
```
- `trace_id` 在現有 `ctx_mw` 已算（注意 borrow:span 要在 `trace_id` move 進 `RequestContext` 前取、或用 clone)。
- 現有 `fmt().json()` subscriber 預設帶 current-span 欄位（`with_current_span`/`with_span_list` 預設 true）→ 每筆 request 期間的 `tracing::info!/warn!` JSON log 自動含 span context（`trace_id` 等）。
- **實作待確認細節**:JSON 內 span 欄位的確切 path（`span.trace_id` 巢狀 vs flattened）→ 決定 loki LogQL 抽法（`| json | span_trace_id="X"` 之類）;若 span-context 抽取不理想,fallback = 在 request 邊界直接 `tracing::info!(trace_id=…, "request")` 當 event 欄位。此屬 plan/impl 階段驗的實作細節、非設計分歧。
- **無新 dep**（`tracing`/`tracing-subscriber` 既有）。

### 4.3 nginx stdout JSON（D3）

`deploy/nginx/nginx.conf`:加 JSON `log_format`（含 `request_id`〔對齊 rust-api X-Request-Id〕/ `status` / `request` / `remote_addr` / `request_time` 等）+ `access_log /dev/stdout <json_fmt>` + `error_log /dev/stderr warn`。→ promtail docker-SD 一致採到 nginx access log（JSON）。front-nginx 需傳遞/生成 `X-Request-Id` 與 rust-api 對齊（nginx 端 `$request_id` 內建變數,proxy_set_header 傳給 rust-api → rust-api `extract_trace_id` 收）。

### 4.4 compose 接線（D4）

master `docker-compose.yml`:加 loki/promtail/grafana 三 service（`profiles: ["obs"]` + `restart: unless-stopped`〔obs 常駐〕 + `networks: [rev2_net]`）+ 頂層 `volumes:` 加 `loki_data`/`grafana_data` + `secrets:` 加 `grafana_admin_password`（`file: ./deploy/secrets/grafana_admin_password.txt`）。
- `docker-compose.dev.yml`:obs override host port（grafana `127.0.0.1:23000:3000`、loki `127.0.0.1:23100:3100`）。
- `docker-compose.prod.yml`:obs internal-only（或按需 loopback）、`restart: unless-stopped`。
- 配置檔:`deploy/loki-config.yml`、`deploy/promtail-config.yml`、`deploy/grafana-provisioning/datasources/loki.yml`、`deploy/secrets/grafana_admin_password.txt(.example)`。

### 4.5 port / volume / secret 清單（寫進 CLAUDE §8.2）

| 角色 | rev2 port | volume | secret |
|---|---|---|---|
| grafana | `23000:3000`（已保留） | `grafana_data`（`rev2-admin_grafana_data`） | `grafana_admin_password` |
| loki | `23100:3100`（dev 127.0.0.1） | `loki_data`（`rev2-admin_loki_data`） | — |
| promtail | 無 host port | —（mount docker.sock ro） | — |

### 4.6 驗收概念（C-V）

- **C1 log pipeline 活體**:dev `--profile obs up --wait` → 三 service healthy → 打 admin write（curl POST /api/...）→ grafana Loki API/UI query `{service="rust-api"} | json` 過去 1 分鐘 → 看到該 request JSON log 含 `request_id`。
- **C2 log↔audit 對接**:同一 request 的 grafana log `trace_id` == psql `SELECT trace_id FROM sys_access_log ORDER BY id DESC LIMIT 1`。
- **C3 nginx JSON log**:經 front-nginx 打請求 → grafana 看到 `{service="front-nginx"}` JSON access log、含 `request_id`、與 rust-api 同值（X-Request-Id 串接）。
- **C4 profile gating（FR-007-like）**:一般 `up`（無 `--profile obs`）→ `docker compose ps` 不含 loki/promtail/grafana。
- **C5 prod**:prod stack `--profile obs` 起 obs 三 service healthy（無 host port 對外、internal）。
- **無 CDP**:obs 是維運 infra、無 base-web UI 改動（grafana 是獨立 UI、非 base-web）→ 不適用 base-web CDP smoke。
- **無新純函式**:request_id 注入是 wiring（span 包裹）、由 C1/C2 活體覆蓋;`extract_trace_id` 既有單測不變。**plan/tasks 須明示「無新單元測試、由 C-V 覆蓋」**（§3 紀律）。

### 4.7 scope 邊界（明確 OUT）

**OUT（留 obs-full / dashboard-provisioning feature）**:
- prometheus / pushgateway / 3 exporters（postgres_exporter / redis_exporter / nginx-exporter）
- rust-api `/metrics` endpoint + 業務 metrics + **axum-casbin enforce metrics 埋點**（Phase 3 #5 尾）
- **grafana dashboards**（obs-min 只給 loki datasource + Explore ad-hoc;dashboard provisioning 為 §4 獨立 feature）
- grafana alerting
- 盜用偵測事件持久化審計 metrics（CHECKLIST §2.32、屬 obs-full）

---

## 5. Constitution 快評（待 `/speckit-plan` 正式 gate）

預期 **8/8 PASS**（同 030 純後端/infra）:
- §I.1/§I.2/§I.3:**無 base-web、無 wire 端點、無 menu** → N/A。
- §I.5:greenfield（D1）、不拷 rev1 → PASS。
- §I.6:**無新表/migration** → 不觸發。
- §II 13 拍板 / §III ★ 軌道:nginx.conf 改動屬 **deploy infra**、**非** base-web MODAL-WIRING / BASE-WEB-BUILD-CONFIG ★ 軌道;rust-api ctx_mw span 是 internal log → 無 wire 影響 → 無 ★ 軌道、無拍板變更。
- §3「新 workspace crate ⇒ prod image build」:**無新 crate**（tracing 既有）→ 不觸發;但 acceptance 仍應含一次 prod `--profile obs` 起 stack 驗（C5）。

**無預期 amendment**。

---

## 6. Open questions（plan/impl 階段解）

1. rust-api span 欄位在 JSON log 的確切 path（巢狀 `span.trace_id` vs flattened）→ 決定 loki LogQL 抽法;若不理想用 event-field fallback（§4.2）。
2. promtail docker-SD 的 label 設計（`service` / `container` / `level`）+ loki 保留期（retention、dev 短期即可）。
3. loki/grafana image tag pin（greenfield 選穩定 tag、依 CLAUDE §6 工具版本紀律不用 latest-floating）。
4. front-nginx `$request_id` 與 rust-api `X-Request-Id` 串接的 header 名一致性（nginx `proxy_set_header X-Request-Id $request_id`)。

---

## 7. 下一步（CLAUDE §3 階段 1 起手）

**user 手動 `/speckit-specify`**（input = 本檔）→ pre-hook 建 `031-obs-min` feature branch → `/speckit-clarify`（optional）→ `/speckit-plan`（Constitution gate + research grep 覆驗 §3 / data-model / contracts/verification-commands）→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`。
