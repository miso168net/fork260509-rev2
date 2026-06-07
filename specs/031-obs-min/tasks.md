---
description: "Task list — 031 observability minimal (log-only)"
---

# Tasks: Observability — Minimal (Log-Only)

**Input**: Design documents from `/specs/031-obs-min/`

**Prerequisites**: [plan.md](plan.md) ✅、[spec.md](spec.md) ✅、[research.md](research.md)（R1-R13）、[data-model.md](data-model.md)、[contracts/](contracts/)（config-contract + verification-commands C1-C7）

**Tests**: **無新單元測試** —— §3 紀律明示「request_id 注入是 span wiring、nginx/compose 是 config → 無新純函式、由 acceptance C-V 覆蓋」;`extract_trace_id` 既有單測（`audit_ctx.rs:197-210`）不變。**無 CDP**（obs 無 base-web UI、grafana 獨立 ops UI）。各 phase 的「acceptance」task = 活體 C-V（C1-C7）。

**Organization**: 依 user story 分組（US1 pipeline / US2 request_id 對接 / US3 opt-in 非侵入）。**repo 分工**：US2 的 `audit_ctx.rs` 在 **rust-api worktree**（收尾走 §4.1 兩段式 commit）;其餘全 **outer**（deploy/ + compose + docs）。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：可平行（不同檔、無未完依賴）
- **[Story]**：US1 / US2 / US3
- 路徑為 workspace root 相對

---

## Phase 1: Setup（grafana secret）

**Purpose**: obs 共用 secret 前置（grafana admin 密碼）

- [ ] T001 [P] 建 `deploy/secrets/grafana_admin_password.txt.example`（tracked 範本、佔位值如 `change-me-grafana-admin-password`）;`.gitignore:68-69` 已自動覆蓋 `deploy/secrets/*.txt`（gitignored）/ `*.txt.example`（tracked）→ **無需改 .gitignore**（research R8 grep 證）
- [ ] T002 [P] `deploy/generate-secrets.sh` 加一條 `gen_leaf "grafana_admin_password" -base64 24`（base64 可接受、非嵌入 URL）+ summary list + header 註解 7→8 secret（research R8;`gen_leaf` 範式 `:46-63`）

---

## Phase 2: Foundational（Blocking Prerequisites）

**⚠️ 無共享 foundational 任務。** US1（pipeline）是 obs 基座;US2（request_id 對接）與 US1 **impl 檔互斥（parallel-safe）**:US1 = `deploy/{loki,alloy,grafana}` config + compose;US2 = `rust-api audit_ctx.rs` + `deploy/nginx/*`。但 **US2/US3 的 acceptance 需 US1 pipeline 已起**（C2/C3/C4/C7 查 loki/驗 gating）。**Checkpoint**：US1 impl 與 US2 impl 可平行起手;驗收序 US1 → US2 → US3。

---

## Phase 3: User Story 1 — 維運者從單一入口查全 stack 結構化 log（Priority: P1）🎯 MVP

**Goal**: opt-in（`--profile obs`）log 堆疊把全容器 stdout 集中進 grafana Loki 單一查詢入口（loki ← alloy docker-SD → grafana）。

**Independent Test**: `--profile obs up --wait` → loki/alloy/grafana healthy → 打請求 → grafana Explore / loki API `{service="rust-api"} | json` 見該服務結構化 log;各來源服務（rust-api/front-nginx/postgres/redis-stack/base-web）皆有 stream。

### Implementation for User Story 1

- [ ] T003 [P] [US1] 建 `deploy/loki-config.yml`：單機 loki（`auth_enabled:false` / `server.http_listen_port:3100` / `common`〔path_prefix `/loki`、inmemory ring、filesystem storage〕/ `schema_config`〔tsdb/filesystem/v13/24h〕/ `limits_config.retention_period:72h` / `compactor`〔retention_enabled:true、delete_request_store:filesystem〕/ `analytics.reporting_enabled:false`）per [research R3](research.md)
- [ ] T004 [P] [US1] 建 `deploy/alloy-config.alloy`（River）：`discovery.docker`（`unix:///var/run/docker.sock`、refresh 15s）→ `discovery.relabel`（map `__meta_docker_container_label_com_docker_compose_service`→`service`;…_project→`compose_project`;container name→`container`;**`keep` action `compose_project=rev2-admin`**）→ `loki.source.docker` → `loki.write`（`http://loki:3100/loki/api/v1/push`）per [research R4](research.md)
- [ ] T005 [P] [US1] 建 `deploy/grafana-provisioning/datasources/loki.yml`：`apiVersion:1` + `datasources:[{name:Loki, type:loki, access:proxy, url:http://loki:3100, isDefault:true, editable:false, jsonData.maxLines:1000}]` per [research R5](research.md)
- [ ] T006 [US1] `docker-compose.yml` 加 3 obs service（`loki` `grafana/loki:3.7.2` / `alloy` `grafana/alloy:v1.16.1` / `grafana` `grafana/grafana:13.0.2`，皆 `profiles:["obs"]` + `restart:unless-stopped` + `networks:[rev2_net]`;alloy/grafana `depends_on:[loki]`;alloy command `run --storage.path=/var/lib/alloy/data --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy` + mount `docker.sock:ro`;grafana env `GF_SECURITY_ADMIN_PASSWORD__FILE` + `GF_AUTH_ANONYMOUS_ENABLED:false` + `secrets:[grafana_admin_password]`)+ 頂層 `volumes:` 加 `loki_data`/`grafana_data`/`alloy_data`（無 `name:`）+ 頂層 `secrets:` 加 `grafana_admin_password`（`file: ./deploy/secrets/grafana_admin_password.txt`）per [config-contract §2](contracts/config-contract.md)（依賴 T001/T002）
- [ ] T007 [US1] `docker-compose.dev.yml` obs override：loki `ports:["127.0.0.1:23100:3100"]` + bind `./deploy/loki-config.yml:/etc/loki/config.yml:ro`;alloy bind `./deploy/alloy-config.alloy:/etc/alloy/config.alloy:ro`;grafana `ports:["127.0.0.1:23000:3000"]` + bind `./deploy/grafana-provisioning:/etc/grafana/provisioning:ro`（host port 綁 127.0.0.1、`docker-compose.dev.yml:7` 鐵律）（依賴 T006）
- [ ] T008 [US1] `docker-compose.prod.yml` obs override：internal-only（**無 host port**、FR-009/SC-005）+ 同三 config bind-mount + `restart:unless-stopped`（依賴 T006）
- [ ] T009 [US1] Acceptance **C1**（pipeline 活體：`--profile obs up --wait` → loki/alloy/grafana healthy → 打請求 → loki API `{service="rust-api"} | json` 見 log）+ **C6**（全服務 log stream 涵蓋、證 alloy docker-SD service label 正確）per [verification-commands](contracts/verification-commands.md)（前置：`bash deploy/generate-secrets.sh` seed grafana secret;首次起 pull image;alloy docker.sock 權限實證）（依賴 T003-T008）

**Checkpoint**: US1 可獨立驗（全 stack log 集中可查 = MVP）。

---

## Phase 4: User Story 2 — log 與審計記錄用 request 識別碼對接（Priority: P2）

**Goal**: rust-api log 帶 `trace_id`、front-nginx access log 帶同源 `request_id`、皆與 `sys_access_log.trace_id` 對接（一步從 log 跳審計列）。

**Independent Test**: 已認證寫入請求 → grafana log 的 `trace_id` == psql `sys_access_log.trace_id`（≤2 步）;經 front-nginx 的請求兩端（nginx + rust-api）log 帶**相同** request id。

### Implementation for User Story 2

- [ ] T010 [P] [US2] `rust-api/server/src/audit_ctx.rs`（**worktree**）：`use tracing::Instrument;`;`ctx_mw` 把 `:124` `next.run(req).await` 改為包 `tracing::info_span!("request", trace_id=%ctx_for_write.trace_id, method=%method, path=%path, operator_id=?ctx_for_write.operator_id)` + `.instrument(span.clone()).await` + span scope 內補 flat boundary event `tracing::info!(trace_id=%…, method=%…, path=%…, status=response.status().as_u16(), operator_id=?…, "request complete")`。**guard：span/event 不得加 authorization/token/password 欄**（research R9）。零新 dep（tracing 既有）per [research R1](research.md) / [data-model §4](data-model.md)
- [ ] T011 [P] [US2] `deploy/nginx/nginx.conf`：`http{}` 加 JSON `log_format json_combined escape=json`（`time`/`service:"front-nginx"`/`request_id:$request_id`/`remote_addr`/`method`/`uri`/`status`/`body_bytes_sent`/`request_time`/`upstream_response_time`/`http_referer`/`http_user_agent`）+ 取代 `:15-16` 為 `access_log /dev/stdout json_combined` + `error_log /dev/stderr warn` per [research R7](research.md)
- [ ] T012 [P] [US2] `deploy/nginx/conf.d/_locations.inc`：`/api/` location 加 `proxy_set_header X-Request-Id $request_id;`（nginx 內建 `$request_id` → rust-api `extract_trace_id` 收 `x-request-id`、`audit_ctx.rs:31`;`_locations.inc` 被 dev.conf+prod.conf `include` 共用 → 單一 edit 覆蓋雙模）per [research R7](research.md)
- [ ] T013 [US2] Acceptance **C2**（log↔audit：已認證請求 → loki `{service="rust-api"} | json | trace_id="<…>"` 對上 psql `sys_access_log.trace_id`）+ **C3**（經 front-nginx 請求 → `{service="front-nginx"} | json` 見 JSON access log 含 `request_id`、與 rust-api 同值）。**前置**：`dcargo build -p server && docker compose ... restart rust-api`（WSL2 inotify、memory `devstack-acceptance-restart`）+ `restart front-nginx`（依賴 T010/T011/T012 + US1 T009 pipeline 已起）

**Checkpoint**: US1 + US2 = 集中 log + request_id 對接（核心價值齊全）。

---

## Phase 5: User Story 3 — 觀察性堆疊為 opt-in、不干擾正常服務（Priority: P3）

**Goal**: obs 為 `profiles:[obs]` opt-in（一般 up 不啟）、啟用前後應用行為零侵入、obs 入口不可達時 app 不受影響（旁路）。

**Independent Test**: 一般 `up`（無 `--profile obs`）→ obs 三 service 不運行;obs 啟用前後同組請求回應碼/形狀不變;停掉 loki 後 app 請求仍成功。

**注**：opt-in 的 `profiles:[obs]` gating 已在 **US1 T006** 實作;本 phase = 驗證該性質（無 net-new impl）。

### Implementation for User Story 3

- [ ] T014 [US3] Acceptance **C4**（一般 `up`〔無 `--profile obs`〕→ `docker compose ps` 不含 loki/alloy/grafana = profile gating、FR-006/SC-003）+ **C7**（obs 啟用前後 `/auth/login` 回應碼/envelope 不變 = FR-007/SC-004 行為零侵入;`--profile obs stop loki` 後 `/health` 仍 200 = FR-008/SC-006 旁路不反壓）per [verification-commands](contracts/verification-commands.md)（依賴 T006 gating + T009 pipeline）

**Checkpoint**: US1/US2/US3 各自獨立可驗。

---

## Phase 6: Polish & Acceptance（Cross-Cutting）

- [ ] T015 Acceptance **C5**（prod `--profile obs`：`docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs build` + `up -d --wait` → 三 obs service healthy、internal-only 無對外 host port;§3「正式產物驗」精神、FR-009/SC-005）（依賴 T006-T012）
- [ ] T016 守恆：`dcargo test -p server`（audit_ctx 改後既有全綠、無新測）+ `--test entity_access_lint`（17 不變、audit_ctx 不碰 entity）+ compose 三模 `--profile obs config` parse（依賴 T010）
- [ ] T017 [P] backfill：CLAUDE §8.2（grafana `23000`「已進 compose」+ 加 loki `23100` 列 + 3 volume〔`rev2-admin_loki_data`/`grafana_data`/`alloy_data`〕+ `grafana_admin_password` secret）+ `deploy/secrets/README.md`（grafana_admin_password ⏳→active）
- [ ] T018 [P] 回填 `docs/INTEGRATION-DESIGN.md` §10 Phase 6 obs-min as-built（loki+alloy+grafana log-only / **promtail→alloy EOL fix-forward** / request_id 對接 / profile:[obs]）+ 對齊實作微調 research/quickstart（若實作中發現偏差）

> **收尾（非 task，executing-plans 完成全 task 後走 `superpowers:finishing-a-development-branch`）**：rust-api worktree（`audit_ctx.rs`）兩段式 commit（§4.1）→ 外層 SHA pin → outer（deploy/compose/docs）commit → `git merge --no-ff` 回 `rev2-admin-root` → CHECKLIST/MILESTONES 歸檔。**push / merge 嚴禁出現在收尾之前**（constitution §I.4 / CLAUDE §3）—— 故不列為 task。

---

## Dependencies & Execution Order

### Phase 依賴
- **Setup（P1）**：T001 ∥ T002（不同檔）。US1 T006 用其 secret。
- **Foundational（P2）**：無。
- **US1（P3）**：{T003 ∥ T004 ∥ T005}（configs、不同檔）→ T006（compose、需 secret）→ {T007 ∥ T008}（dev/prod override）→ T009（acceptance）。
- **US2（P4）**：{T010 ∥ T011 ∥ T012}（不同檔/repo）→ T013（acceptance、需 US1 T009 pipeline 起 + rebuild/restart）。
- **US3（P5）**：T014（需 T006 gating + T009 pipeline）。
- **Polish（P6）**：T015 需 US1+US2 impl;T016 需 T010;T017 ∥ T018 可平行。

### User Story 獨立性
- **US1**：obs pipeline（config + compose）;不碰 rust-api/nginx。
- **US2**：rust-api span + nginx;不碰 obs config/compose。**impl 與 US1 檔互斥、parallel-safe**;但 acceptance 需 US1 pipeline。
- **US3**：純驗證（gating 由 US1 T006 提供）。

### Parallel Opportunities
- T001 ∥ T002（setup）。
- T003 ∥ T004 ∥ T005（US1 configs）。
- T010 ∥ T011 ∥ T012（US2 impl、不同檔/repo）。
- **US1 impl ∥ US2 impl**（檔互斥）—— 但 US2 acceptance（T013）等 US1 pipeline（T009）。
- T017 ∥ T018（polish docs）。

---

## Implementation Strategy

### MVP First（US1 only）
1. Phase 1 Setup（T001-T002）
2. US1（T003-T009）→ **STOP & VALIDATE**：`--profile obs up` → grafana 查全 stack log（spec US1 Independent Test）
3. = 可交付 MVP（集中 log 觀察上線）

### Incremental
1. Setup → US1（pipeline MVP）→ 驗
2. US2（request_id 對接）→ 驗 log↔audit + nginx 同源 id
3. US3（opt-in 非侵入）→ 驗 gating + 零侵入 + 旁路
4. Polish：prod `--profile obs`（C5）+ 守恆 + doc backfill

---

## Notes

- **無新單元測試 / 無 CDP**：§3 紀律已於 plan/contracts/本檔明示;由活體 C-V（C1-C7）覆蓋。
- **唯一 rust-api 改動 = `audit_ctx.rs`**（worktree、§4.1 兩段式 commit);其餘全 outer（deploy/compose/docs）。
- **無新 crate**（tracing 既有）→ §3「新 crate ⇒ prod build」不觸發;但 C5 仍驗 prod `--profile obs` 起。
- **WSL2**：T010（rust-api span）改 code 後 live 驗前須 `dcargo build -p server` + restart rust-api（inotify 不可靠）;T011/T012（nginx）改後 restart front-nginx。
- **image pin（§6）**：loki `3.7.2` / alloy `v1.16.1`（取代 EOL promtail）/ grafana `13.0.2`;不用浮動 tag。
- **alloy docker.sock 權限**：T009 起 stack 時實證（run as root 或 host docker group;WSL2 docker.sock 屬性需驗）。
- **§11.8 promtail→alloy**：判定 EOL fix-forward 實作替換、無需 amendment（已 surface、留 /speckit-analyze 確認;見 plan Constitution #6 / research R12）。
