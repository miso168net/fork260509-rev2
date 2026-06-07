# Phase 0 Research — 031-obs-min

> 所有決策以 grep 過的 rev2 `file:line` 或 upstream 來源為據（4 平行 grounding agent + WebSearch 確認版本）。**§I.5 紀律：未讀任何 rev1 source，全 greenfield + rev2 repo + upstream 標準知識**。NEEDS CLARIFICATION：無（spec 0 markers）。
> /speckit-clarify 的 3 個 deferred-low 項在此收口：log retention（R10）、log 敏感資料（R9）、image tag pin（R2）。

---

## R1 — rust-api request_id 注入 log（D5）

- **Decision**: 在既有 `ctx_mw`（`server/src/audit_ctx.rs`）內把 `next.run(req)` 包進 per-request `tracing` span（`tracing::info_span!("request", trace_id, method, path, operator_id)` + `tracing::Instrument`），**並在 span scope 內補一條 flat boundary event** `tracing::info!(trace_id=%…, status=…, "request complete")`。**零新 dep、不引 tower-http TraceLayer、零 wire/DTO/endpoint 改動。**
- **Rationale**: `ctx_mw` 已算好 `trace_id`（`extract_trace_id`、X-Request-Id header 或 mint uuid v4、`audit_ctx.rs:74-80`、`:109`）並寫進 `sys_access_log.trace_id`（`:136`）→ 同一 id 同時落 log 與審計 DB → log↔審計對接（FR-003）。production log = `fmt().json()`（`application.yaml:11` `format:"json"` → `main.rs:506` `_ =>` arm）。boundary event 保證 `trace_id` 為**top-level flat JSON 欄**、不依賴 json formatter 的 span 巢狀行為 → 穩定 LogQL。
- **CRITICAL open question 解決（JSON span-field path）**: tracing-subscriber 0.3 `fmt().json()` 預設 `with_current_span=true`/`with_span_list=true` → span 欄位**巢狀**在 `"span"`/`"spans"` 物件下（`| json` 後變 `span_trace_id`、array 變 `spans_0_trace_id` index-fragile）。**故設計用 boundary event 把 `trace_id` 當 event 欄位** → JSON top-level → LogQL 穩定為 **`{service="rust-api"} | json | trace_id="X"`**。span 提供巢狀事件的 ambient 關聯、boundary event 提供保證-flat 的查詢鍵。
- **Exact change（diff against `audit_ctx.rs`）**: import `use tracing::Instrument;`;把 `:124` 的 `let response = next.run(req).await;` 換成:
  ```rust
  let span = tracing::info_span!(
      "request",
      trace_id = %ctx_for_write.trace_id,
      method = %method, path = %path,
      operator_id = ?ctx_for_write.operator_id,
  );
  let response = next.run(req).instrument(span.clone()).await;
  let _enter = span.enter();
  tracing::info!(
      trace_id = %ctx_for_write.trace_id, method = %method, path = %path,
      status = response.status().as_u16(), operator_id = ?ctx_for_write.operator_id,
      "request complete"
  );
  drop(_enter);
  ```
  `method`/`path`（`String`, `:102-103`）用 `%`（Display by-ref、不 move）→ 既有 access-log write（`:127-142`）仍編譯;span 從 `ctx_for_write`（已 clone、`:121`）取、避開 `:116` move 的 borrow。
- **Grounding**: deps 已在 — `rust-api/Cargo.toml:11-12`（`tracing="0.1"` / `tracing-subscriber={version="0.3",features=["env-filter","json"]}`）、`server/Cargo.toml:17-18`（`.workspace=true`）;Cargo.lock 解析 `tracing 0.1.44` / `tracing-subscriber 0.3.23`。`init_tracing` `main.rs:499-508`、import `:30`。
- **Alternatives**: tower-http TraceLayer → rejected（D5、新 dep + 第二個 middleware 重算 ctx_mw 已有的 metadata；RUST_LOG `tower_http=debug` 僅 filter directive、非 Cargo dep）;span-only 無 boundary event → rejected（依賴脆弱的巢狀 path、且乾淨請求無任何帶 trace_id 的 log 行〔handler 不發 per-request info!〕）。

## R2 — obs stack 版本 pin（loki / grafana / alloy）+ ★ promtail→alloy（supersede D3）

- **Decision（pinned tags、§6 不浮動）**:
  - **loki**: `grafana/loki:3.7.2`
  - **grafana**: `grafana/grafana:13.0.2`
  - **log 採集 agent**: **`grafana/alloy:v1.16.1`** — **取代 brainstorm D3 的 promtail**（user 2026-06-07 plan 階段親決）。
- **★ promtail→alloy supersede 理由**: WebSearch 查得 **promtail 已被 Grafana 標記 EOL/deprecated**、後繼為 **Grafana Alloy**（`discovery.docker` + `loki.source.docker` + `loki.write` 等價 docker-SD + loki push 能力）。brainstorm D3 鎖定 promtail 時未知此 EOL 事實。依 CLAUDE §6（版本/元件選擇不可 silently 決定、要 surface user pick）surface 後 user 選 alloy:**2026 新建 greenfield stack 不選 EOL 元件**;成本僅 config 改用 River 語法（非設計改動、能力等價）。**spec-design D3「promtail」已 superseded 為 alloy**（docs/superpowers/031-obs-min.md D3 加註）。
- **Rationale（版本）**: loki 3.7.2 = current stable（2026-05-13、含 CVE 修;3.x 用 TSDB+schema v13）;grafana 13.0.2 = current stable OSS（2026-06-02、含 Explore + Loki datasource）;alloy v1.16.1 = current stable（2026-05-05）。對齊 rev2 既有 pin 風格（`nginx:1.31.0-alpine` `docker-compose.yml:19`、`postgres:17-alpine` `:113`）;**不**抄 `redis/redis-stack-server:latest`（`:132`）的浮動 anti-pattern。
- **Grounding**: WebSearch — [loki releases](https://github.com/grafana/loki/releases)（3.7.2）/ [grafana docker tags](https://hub.docker.com/r/grafana/grafana/tags)（13.0.2）/ [alloy releases](https://github.com/grafana/alloy/releases)（v1.16.1、2026-05-05）/ promtail EOL（Docker Hub + Grafana community + [alloy docs](https://grafana.com/docs/alloy/latest/)）。
- **Alternatives**: 維持 promtail:3.6.11 → rejected by user（EOL）;`latest`/`main` 浮動 → rejected（§6）;grafana-enterprise → rejected（需 license、log-only 無益）。

## R3 — loki 設定（單機、filesystem、bounded retention）

- **Decision**: 單機 Loki（image 預設 `-target=all`）、filesystem 儲存於 named volume `loki_data`、TSDB schema v13、inmemory ring、`auth_enabled: false`（內網）。HTTP port 3100。**retention 預設 72h（3 天）** via `limits_config.retention_period` + `compactor.retention_enabled`（FR-010 bounded、dev 短期、單一 deploy 可調鍵）。
- **Config（`deploy/loki-config.yml`）核心**: `auth_enabled:false` / `server.http_listen_port:3100` / `common{path_prefix:/loki, replication_factor:1, ring.kvstore.store:inmemory, storage.filesystem{chunks_directory:/loki/chunks, rules_directory:/loki/rules}}` / `schema_config`（`from:2024-01-01, store:tsdb, object_store:filesystem, schema:v13, index{prefix:index_, period:24h}`）/ `limits_config{retention_period:72h, reject_old_samples:true}` / `compactor{working_directory:/loki/compactor, retention_enabled:true, delete_request_store:filesystem, compaction_interval:10m}` / `analytics.reporting_enabled:false`。mount `loki_data:/loki` + `./deploy/loki-config.yml:/etc/loki/config.yml:ro`、command `-config.file=/etc/loki/config.yml`。
- **Rationale**: 單機是個人/dev workspace 正確拓撲（無 cluster/object-store）;v13+TSDB 為 loki 3.x 必須;compactor retention 滿足 FR-010、避免 `loki_data` 無界成長。
- **Alternatives**: boltdb-shipper/舊 schema → rejected（3.x deprecated）;S3/GCS → rejected（無雲 bucket）;無 retention → rejected（破 FR-010）。
- **Grounding**: [Loki config examples](https://grafana.com/docs/loki/latest/configure/examples/configuration-examples/);`path_prefix:/loki` 對齊 named volume（vs doc 的 `/tmp/loki`）。

## R4 — alloy 設定（River:docker discovery + loki push + service label）

- **Decision**: alloy River config（`deploy/alloy-config.alloy`）:`discovery.docker`（`unix:///var/run/docker.sock`）→ `discovery.relabel`（map `__meta_docker_container_label_com_docker_compose_service`→`service` label;`__meta_docker_container_label_com_docker_compose_project`→`compose_project`;container name→`container`;**`keep` action `compose_project=rev2-admin`** 濾掉並存 rev1/他 stack）→ `loki.source.docker`（讀容器 log）→ `loki.write`（`http://loki:3100/loki/api/v1/push`）。
- **River config 核心**:
  ```alloy
  discovery.docker "containers" { host = "unix:///var/run/docker.sock"  refresh_interval = "15s" }
  discovery.relabel "containers" {
    targets = discovery.docker.containers.targets
    rule { source_labels = ["__meta_docker_container_label_com_docker_compose_service"]  target_label = "service" }
    rule { source_labels = ["__meta_docker_container_label_com_docker_compose_project"]  target_label = "compose_project" }
    rule { source_labels = ["__meta_docker_container_name"]  regex = "/(.*)"  target_label = "container" }
    rule { source_labels = ["__meta_docker_container_label_com_docker_compose_project"]  regex = "rev2-admin"  action = "keep" }
  }
  loki.source.docker "containers" {
    host = "unix:///var/run/docker.sock"
    targets = discovery.relabel.containers.output
    forward_to = [loki.write.default.receiver]
    refresh_interval = "15s"
  }
  loki.write "default" { endpoint { url = "http://loki:3100/loki/api/v1/push" } }
  ```
  compose: `image: grafana/alloy:v1.16.1`、command `["run","--storage.path=/var/lib/alloy/data","--server.http.listen-addr=0.0.0.0:12345","/etc/alloy/config.alloy"]`、mounts `/var/run/docker.sock:/var/run/docker.sock:ro` + `./deploy/alloy-config.alloy:/etc/alloy/config.alloy:ro` + `alloy_data:/var/lib/alloy/data`、`profiles:["obs"]`、`networks:[rev2_net]`、`restart:unless-stopped`、**無 host port**（alloy UI :12345 內網)。
- **docker.sock 權限注意（impl）**: alloy 容器讀 `docker.sock` 需適當權限（run as root 或加 host docker group gid;promtail 亦然）。impl 階段確認;dev/WSL2 上 docker.sock 屬性需驗。
- **Rationale**: docker-SD 是 D3 統一採集機制（nginx 改 stdout JSON 後全容器同質）;relabel compose-service→`service` 給 FR-001/005 的「依來源服務過濾」;`compose_project=rev2-admin` keep 濾掉並存 rev1（CLAUDE §8.2 並存 workspace、共用 docker.sock）;無 pipeline 解析（rust-api/nginx 已 JSON、loki `| json` query-time 解析、FR-002 verbatim 通過）→ agent 最小、FR-008 旁路無反壓。`alloy_data` 持久化讀取 position、避免 restart 重讀。
- **Alternatives**: promtail（D3 原命名）→ superseded（R2 EOL）;file-scrape nginx log volume → rejected（D3、破統一 docker-SD）;docker loki logging plugin driver → rejected（daemon-level coupling、FR-008 反壓風險、非 sidecar 模型）;label on container name → rejected（`rev2-admin-<svc>-1` 噪音、compose-service label 才乾淨）。
- **Grounding**: rev2 `name: rev2-admin`（`docker-compose.yml:15`）→ 每容器帶 `com.docker.compose.project=rev2-admin` + `com.docker.compose.service=<§1 短名>`（front-nginx/base-web/rust-api/postgres/redis-stack）。[alloy discovery.docker docs](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.docker/)。

## R5 — grafana 設定（loki datasource provisioning + admin secret）

- **Decision**: file-based datasource provisioning（`deploy/grafana-provisioning/datasources/loki.yml` 指 `http://loki:3100`、`isDefault:true`、`editable:false`）;admin 密碼走 docker secret `GF_SECURITY_ADMIN_PASSWORD__FILE=/run/secrets/grafana_admin_password`;`GF_AUTH_ANONYMOUS_ENABLED:"false"`（預設、明示）;`GF_ANALYTICS_*:false`。port 3000（dev host `127.0.0.1:23000:3000`）。**無 dashboard**（Explore-only、D2/§4.7）;volume `grafana_data:/var/lib/grafana`。
- **Rationale**: provisioning 使 grafana boot 即接好 loki（SC-001 入口 ready）;`__FILE` 是 grafana 原生 docker-secret 範式、對齊 rev2 既有 `*_FILE` secret 慣例;無 dashboard 嚴守 log-only（dashboard → dashboard-provisioning feature）。
- **Alternatives**: 明文 `GF_SECURITY_ADMIN_PASSWORD` → rejected（破 secret 紀律）;UI 手建 datasource → rejected（非可重現）;anonymous enabled → rejected（obs 入口為獨立 ops UI、保 auth）。
- **Grounding**: rev2 secret 範式 `*_FILE` env + `secrets:` list + top-level `file:` — `docker-compose.yml:58`（jwt_secret）/`:172-186`（7 secret `file:`）;`deploy/secrets/` 已有 `*.txt`+`*.txt.example` pair + `generate-secrets.sh`;`deploy/secrets/README.md:75` 已預登 `grafana_admin_password` 為 ⏳ Phase 5 optional secret。

## R6 — compose 接線（3 service profiles:[obs] + dev/prod override）

- **Decision**: master `docker-compose.yml` 加 `loki`/`alloy`/`grafana` 三 service（`profiles:["obs"]` + `restart:unless-stopped` + `networks:[rev2_net]`;alloy `depends_on:[loki]`、grafana `depends_on:[loki]`）;頂層 `volumes:` 加 `loki_data`/`grafana_data`/`alloy_data`;`secrets:` 加 `grafana_admin_password`（`file: ./deploy/secrets/grafana_admin_password.txt`）。host port + config bind-mount 只在 override（**base 層禁 host port**、`docker-compose.yml:9`）:dev override host `127.0.0.1:23000:3000`(grafana)/`127.0.0.1:23100:3100`(loki) + 三 config bind-mount;prod override internal-only（無 host port、FR-009/SC-005 C5）+ config bind-mount。
- **Rationale**: 逐字鏡像既有 profile-gated 範式 — `acme`（`profiles:[prod]` `:150-158`）、`cleanup-job`（`profiles:["jobs"]` `:92-110`）;一般 `up`（無 `--profile obs`）不啟（FR-006/SC-003/C4）。base/dev/prod 分工守「base 不放 host port」鐵律。
- **Alternatives**: 獨立 `docker-compose.obs.yml`（rev1 風格）→ rejected by D4（user 鎖 inline profiles、且獨立檔需自 re-declare name/networks/secrets、不享 `-f` 疊加）。
- **Grounding**: `docker-compose.yml:15`(name) / `:92-110`(cleanup-job profile 範式) / `:150-158`(acme) / `:160-161`(rev2_net) / `:163-170`(volumes 無 name:) / `:172-186`(secrets file:);`docker-compose.dev.yml:7`(host port 綁 127.0.0.1) / `:18-22`(nginx config bind-mount 在 dev override 範式);`docker-compose.prod.yml:12-13`(prod internal-only)。

## R7 — nginx stdout JSON + X-Request-Id 傳遞（D3）

- **Decision**: `deploy/nginx/nginx.conf` `http{}` 加 JSON `log_format json_combined escape=json`（含 `request_id`/`service:"front-nginx"`/`status`/`method`/`uri`/`remote_addr`/`request_time` 等）+ `access_log /dev/stdout json_combined` + `error_log /dev/stderr warn`（取代現 `:15-16` 容器內 file plain log）。`deploy/nginx/conf.d/_locations.inc` 的 `/api/` location 加 `proxy_set_header X-Request-Id $request_id;`（nginx 內建 `$request_id` → rust-api `extract_trace_id` 收 → log/audit 同源 trace_id、FR-003/FR-004）。
- **Rationale**: D3 統一 stdout → alloy docker-SD 一致採;nginx `$request_id`（per-request 32-hex）為 id 源、rust-api 為承接 → 兩端 log + 審計列同 id。rust-api 收 `x-request-id`（`audit_ctx.rs:31` `HeaderName::from_static("x-request-id")`、HTTP header 大小寫不敏感、`X-Request-Id` 對齊）。
- **wire/★ 軌道注意**: nginx 改動 = deploy infra（log 格式 + 一個 proxy header）、**非** base-web ★ 軌道、**不改任何 wire 契約/回應形狀**（FR-007/SC-004）— 只加一個 backend 已容忍的 request header + 改 nginx 自己 log 去向/格式。
- **Grounding**: `deploy/nginx/nginx.conf:15-16`（現 plain file log）/ `:18`（include conf.d/*.conf）;`deploy/nginx/conf.d/_locations.inc:9-15`（`/api/` proxy block、現設 Host/X-Real-IP/X-Forwarded-For/Proto、無 X-Request-Id;被 dev.conf+prod.conf `include` 共用 → 單一 edit 覆蓋雙模）;`audit_ctx.rs:31,74-76`（收 header → trace_id → sys_access_log）;nginx 1.31.0-alpine base 已 symlink access.log→/dev/stdout，但顯式 `/dev/stdout` + 自訂格式為必要。

## R8 — secret 佈局（grafana_admin_password）

- **Decision**: 加 `deploy/secrets/grafana_admin_password.txt`（gitignored 真值）+ `.txt.example`（tracked 範本);`deploy/generate-secrets.sh` 加一條 `gen_leaf "grafana_admin_password" -base64 24`（base64 可接受、非嵌入 URL）+ summary list;`deploy/secrets/README.md` 從 ⏳ 選用表移到 active 表（記 consumer `grafana GF_SECURITY_ADMIN_PASSWORD__FILE`、type leaf）。
- **Grounding**: `.gitignore:68-69`（`deploy/secrets/*.txt` ignored、`*.txt.example` tracked → **無需改 .gitignore**）;README `:75` 已預登;`generate-secrets.sh:46-63` `gen_leaf` 範式（leaf secret hex/base64）。**plan 決策**:把 grafana_admin_password 加入 default set（idempotent、obs 未啟亦無害、保「一鍵備齊」）— 7→8 secret、更新 script header 註解。
- **Alternatives**: 明文密碼 / grafana 預設 admin/admin → rejected（破 no-secrets-in-VCS 不變式 `.gitignore:66-71` + README 紀律）。

## R9 — 敏感資料不外洩（deferred clarify 項;FR-002 安全面）

- **Decision**: **無需 redaction**。把既有容器 stdout 聚合進 loki **不新增 secret 外洩面**（vs `docker logs` 已暴露的）— pipeline 是 transport+storage 改、非內容改。**guard**:D5 的 request span **MUST NOT** 加 `authorization`/token/password 欄（§4.2 只加 trace_id/method/path/operator_id、皆 safe metadata）。
- **Grounding（grep-backed）**:
  - rust-api **不 log request body**:全樹唯一 `axum::body::to_bytes` 在 `server/src/error.rs:50,64`（`#[cfg(test)]` 內、讀 response envelope 非 request input);無 body-logging middleware。
  - `ctx_mw`（`:95-145`）只記 metadata（method/path/http_status/client_ip/trace_id/operator_id `:128-137`）;唯一 request-path log 行是 best-effort 失敗 warn `:140`。
  - 107 個 `tracing::*!` 無一內插密鑰值:`handler/auth.rs:229`(token signing failed、`error=%e` 非 token)/`:333,:358,:376`(refresh 失敗 error only)/`auth/bearer.rs:60`(verify failed error only)。
  - login password 在 request **body**（`handler/auth.rs:40` `password:String` → `:200` `verify_password`）、無 tracing 行引用 `req.password`。
  - nginx 記 request **line**（method+path+status）非 body。
- **Conclusion**: 無 redaction layer 需求。plan 記一行 guard:request span 不得加 authorization/token/password 欄。

## R10 — retention（deferred clarify 項;FR-010）

- **Decision**: loki retention 預設 **bounded、短（72h/3 天）**、設於 deploy 層（`loki-config.yml` `limits_config.retention_period` + `compactor.retention_enabled`）、非 app code。
- **Rationale**: FR-010 要 bounded + 短預設;dev/個人 workspace 無歸檔需求（spec Assumptions）;72h 覆蓋多日 debug session 不致 `loki_data` 無界。長期歸檔明確 OUT。記為單一 tunable + CLAUDE §8.2 旁註。

## R11 — auth posture（grafana 密碼 / loki+alloy 無 auth 內網）

- **Decision**: 個人/dev workspace **可接受**。grafana 在 admin 密碼後（secret）;loki+alloy **無 auth 但僅內網** `rev2_net`（loki dev host port 綁 127.0.0.1、prod 無 host port）。
- **Grounding**: dev host port 全 loopback（`docker-compose.dev.yml:16,17,40,65,...` `127.0.0.1:<host>:<container>`);單一內網 `rev2_net`（`:160-161`)。
- **prod hardening（defer obs-full / security pass）**: grafana 改走 front-nginx reverse proxy + TLS（而非直 host port）;loki 若需跨主機暴露再加 basic-auth/gateway。**皆 031 OUT**。

## R12 — Constitution §IV 8 問 pre-check facts（v1.6.0）

| §IV Q | 結論 | 依據 |
|---|---|---|
| 1 §I.1 base-web 權威/缺 endpoint? | **PASS（N/A）** | obs 無 wire 端點、base-web 零改（FR-007、spec-design §1） |
| 2 §I.2 menu Casbin? | **PASS（N/A）** | 不涉 menu;grafana 是獨立 ops UI、非 base-web menu |
| 3 §I.3 wire 對齊 mock? | **PASS（N/A）** | 無 wire 改;rust-api span = internal log enrichment;nginx JSON log_format = observability 非 wire 契約 |
| 4 §I.5 rev1 拷貝? | **PASS** | greenfield（D1）、未讀/拷 rev1 source（research 全程在 rev2） |
| 5 §II §11.8 obs 拍板對齊? | **PASS（無 amendment）** | DESIGN §10 Phase 5 = obs-min（loki+promtail+grafana 純 log、`INTEGRATION-DESIGN.md:1046`）;031 = 此 triple log-only（採集 agent promtail→alloy 為**實作元件替換、非拍板改**:§11.8 拍板是「obs-min loki+promtail+grafana 漸進」的**範圍/時機**、未把 promtail 凍結為不可換的元件;EOL 後選同能力後繼 = 紀律性 fix-forward、不需 amendment）|
| 6 §I.6 新業務表/migration? | **PASS（不觸發）** | 無 migration（最新仍 m030）;spec-design §1「無 migration」 |
| 7 §III ★ 軌道? | **PASS（N/A）** | ★ 軌道 = MODAL-WIRING(`base-web/src/views/manage/**`)/BASE-WEB-BUILD-CONFIG(`base-web/build/...`);`deploy/nginx/nginx.conf` = deploy infra **非** ★ 軌道;rust-api ctx_mw span = internal、非 ★ |
| 8 新建業務表 §I.6 審計欄? | **PASS（N/A）** | 無 create migration（見 Q6）|

**§3「新 workspace crate ⇒ prod image build」**:**不觸發**（無新 crate、tracing 既有）;但 acceptance 仍須驗 prod `--profile obs` stack 起（FR-009/SC-005、C5）。**結論:8/8 PASS、無 amendment、無 Complexity Tracking。**

> **§11.8 拍板措辭注記（給 /speckit-analyze + plan Constitution gate 透明化）**:§11.8 凍結值為「(a) 漸進 — Phase 5 obs-min(loki+promtail+grafana,log-only) / Phase 6 obs-full」。promtail→alloy 是**採集元件的 EOL fix-forward 替換**（能力等價、log-only 範圍與時機不變），判定**不構成拍板撤回/修改**故無 amendment。若 user/analyze 認為「promtail」字面屬凍結元件,則需走 §V.2 PATCH amendment(措辭釐清「採集 agent 為可替換實作」)— 已 surface、留 plan review 確認。

## R13 — port / volume / secret 清單（CLAUDE §8.2 backfill）

| service | host port(dev,127.0.0.1) | container | host port(prod) | volume | secret |
|---|---|---|---|---|---|
| grafana | 23000 | 3000 | 無(internal) | `grafana_data`→`rev2-admin_grafana_data` | `grafana_admin_password` |
| loki | 23100 | 3100 | 無(internal) | `loki_data`→`rev2-admin_loki_data` | — |
| alloy | 無 | (12345 internal) | 無 | `alloy_data`→`rev2-admin_alloy_data` | — (mount docker.sock:ro) |

grafana `23000` CLAUDE §8.2 已保留;loki `23100` 本 feature 新認領;alloy 無 host port。**CLAUDE §8.2 backfill**（impl/finish 階段）:grafana 改「已進 compose」、加 loki `23100` 列 + 3 volume + grafana_admin_password secret。
