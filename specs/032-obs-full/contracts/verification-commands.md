# Contract — C-V 驗收命令（032-obs-full）

> 本 feature **無新純函式**(metrics 埋點是 layer/counter wiring、prometheus/grafana 是 config) → **無新單元測試、全由 acceptance C-V 覆蓋**(§3 紀律;若 cleanup-job push body 組裝有可抽純邏輯則 test-first、否則 C-V)。既有測試不破。
> **無 CDP browser smoke**:obs-full 是維運 infra、prometheus/grafana 為獨立 ops UI(非 base-web) → 不適用 base-web CDP（同 027/030/031 的 N/A）。
> **§3「新 workspace crate ⇒ prod image build」嚴格不觸發**(無新 workspace member、deps 加在既有 server+cleanup-job);但 **C10 仍須驗 prod `--profile metrics` stack 起 + rust-api prod build**(新 deps 進 runtime image、FR-009/SC-009)。
> 活體前置:rust-api `server`/`cleanup-job` 改 code 後須**重建+重啟 rust-api**(WSL2 /mnt/d inotify 不可靠、memory `devstack-acceptance-restart`):`dcargo build -p server && docker compose ... restart rust-api`;改 nginx/單檔 bind-mount 用 `--force-recreate`(memory)。metrics 首次起會 pull image。
> 連線常數(CLAUDE §8.2):rust-api dev `:21081`、prometheus `:23090`、pushgateway `:29091`、grafana `:23000`、postgres `:25432`(user soybean / db soybean_admin_rust)。

## C1 — rust-api `/metrics` 活體（SC-001 + FR-001/002）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 前置:dcargo build -p server + restart rust-api（載入 axum-prometheus layer）
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
# 打幾個請求產生 HTTP metric
curl -s -o /dev/null http://127.0.0.1:21081/health
curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' >/dev/null
# 查 /metrics（prometheus 文字格式）
curl -s http://127.0.0.1:21081/metrics | grep -E 'axum_http_requests_total|axum_http_requests_duration_seconds' | head
# 期望:見 axum_http_requests_total{method=...,endpoint="/auth/login",status="200"} 等;endpoint=matched route（低基數）
```

## C2 — enforce allow/deny counter（SC-002 + FR-002）

```bash
# allow:Super 打受保護端點（200）;deny:User 打（403/5003）
TOKEN_S=$(curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
TOKEN_U=$(curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s -o /dev/null http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKEN_S"   # allow
curl -s -o /dev/null http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKEN_U"   # deny
curl -s http://127.0.0.1:21081/metrics | grep 'casbin_enforce_total'
# 期望:casbin_enforce_total{decision="allow"} ≥1 + casbin_enforce_total{decision="deny"} ≥1（隨對應請求增長）
```

## C3 — prometheus scrape targets up（SC-001/003 + FR-001/003）

```bash
bash deploy/generate-secrets.sh    # 確保 postgres_password/redis_password 在（exporter reuse）
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile metrics up -d --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile metrics ps --format '{{.Service}} {{.Status}}' | grep -E 'prometheus|exporter|pushgateway'
sleep 20   # 給 prometheus 首輪 scrape
# prometheus targets 健康（rust-api/postgres/redis/pushgateway）
curl -s 'http://127.0.0.1:23090/api/v1/targets' | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(t["labels"]["job"],t["health"]) for t in d["data"]["activeTargets"]]'
# 期望:rust-api/postgres/redis 至少 up;pushgateway up（無 push 也 up、只是無 series）
# PromQL 查 up
curl -s 'http://127.0.0.1:23090/api/v1/query?query=up' | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(r["metric"].get("job"),r["value"][1]) for r in d["data"]["result"]]'
```

## C4 — exporter metric 進 prometheus（SC-003 + FR-003）

```bash
# postgres / redis exporter 的代表 metric 可查
curl -s 'http://127.0.0.1:23090/api/v1/query?query=pg_up' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("pg_up samples:",len(d["data"]["result"]),d["data"]["result"][:1])'
curl -s 'http://127.0.0.1:23090/api/v1/query?query=redis_up' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("redis_up samples:",len(d["data"]["result"]),d["data"]["result"][:1])'
# 期望:pg_up=1 / redis_up=1（exporter 連得上 DB/redis）
```

## C5 — grafana prometheus datasource（SC-001 + FR-001）

```bash
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
# datasource 已 provision（Prometheus + Loki〔031〕）
curl -s -u "admin:$GF_PASS" http://127.0.0.1:23000/api/datasources | python3 -c 'import sys,json;[print(x["name"],x["type"],x["uid"],"default="+str(x["isDefault"])) for x in json.load(sys.stdin)]'
# 期望:Prometheus(uid=prometheus, isDefault=false) + Loki(isDefault=true)
# 經 grafana proxy 查 prometheus（端到端）
DS=$(curl -s -u "admin:$GF_PASS" http://127.0.0.1:23000/api/datasources/uid/prometheus | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -u "admin:$GF_PASS" "http://127.0.0.1:23000/api/datasources/proxy/uid/prometheus/api/v1/query?query=up" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("grafana→prometheus:",d.get("status"),"series:",len(d.get("data",{}).get("result",[])))'
# 期望:status=success、series≥1
```

## C6 — pushgateway + cleanup-job push（SC-004 + FR-004）

```bash
# dcargo build cleanup-job + 跑（須 pushgateway 已起、上面 --profile metrics）
dcargo build -p cleanup-job
# 跑 cleanup-job dry-run（推 metric）— 用 dcargo-with-network 變體連 compose 網路 + pushgateway
PW=$(cat deploy/secrets/postgres_password.txt); NET=rev2-admin_rev2_net
docker run --rm --network "$NET" -e DATABASE_URL="postgres://soybean:$PW@postgres:5432/soybean_admin_rust" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo -v rev2-admin_rust_api_target:/app/target \
  -w /app --entrypoint cargo rev2-admin-rust-api:dev run --bin cleanup-job
sleep 3
# pushgateway 有 cleanup_job_* + prometheus scrape 得（honor_labels job=cleanup_job）
curl -s http://127.0.0.1:29091/metrics | grep 'cleanup_job_'
curl -s 'http://127.0.0.1:23090/api/v1/query?query=cleanup_job_last_success_timestamp' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("cleanup_job metric in prometheus:",len(d["data"]["result"]),d["data"]["result"][:1])'
# 期望:pushgateway 見 cleanup_job_last_success_timestamp/rows_deleted;prometheus 查得（job="cleanup_job"）
```

## C7 — grafana baseline alert rule provisioned（SC-005 + FR-005）

```bash
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
curl -s -u "admin:$GF_PASS" http://127.0.0.1:23000/api/v1/provisioning/alert-rules | python3 -c 'import sys,json;d=json.load(sys.stdin);print("provisioned alert rules:",len(d));[print(" -",r.get("title")) for r in d]'
# 期望:≥1（含 "rust-api target down"）
# 觸發驗（可選）:停 rust-api → up{job="rust-api"}==0 → 該 rule 進 Alerting
# docker compose ... stop rust-api; sleep 150; 查 rule state；再 start
```

## C8 — profile gating（SC-006 + FR-006）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait   # 無 --profile metrics
if docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --services --filter status=running | grep -qE '^(prometheus|postgres_exporter|redis_exporter|pushgateway)$'; then
  echo "FAIL: metrics service 不該隨一般 up 啟動"
else
  echo "OK(C8): metrics 4 service 未啟（profile:[metrics] gated、FR-006/SC-006）"
fi
# 且 metrics 與 log 獨立:--profile obs（log）不啟 metrics service、--profile metrics 不啟 loki/alloy
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile metrics config --services | grep -E '^(loki|alloy)$' && echo "FAIL: metrics 牽起 log" || echo "OK: metrics 不含 loki/alloy（獨立 profile）"
```

## C9 — 行為零侵入 + 旁路（SC-007/008 + FR-007/008）

```bash
# /metrics layer 加入前後 /auth/login 回應碼/envelope 不變
A=$(curl -s -w '\n%{http_code}' -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}')
echo "login code: $(echo "$A" | tail -1)"; echo "$A" | head -1 | python3 -c 'import sys,json;o=json.load(sys.stdin);print("envelope keys:",sorted(o.keys()),"code:",o.get("code"))'
# 期望:200 + {code:"0000",data,msg}（與 metrics 前一致、FR-007/SC-007）
# FR-008 旁路:停 prometheus（採集入口不可達）→ rust-api 請求仍成功
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile metrics stop prometheus
H=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:21081/health)
L=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}')
echo "prometheus down → /health=$H /login=$L"   # 期望 200/200（旁路、app 不受影響、SC-008）
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile metrics start prometheus
# pushgateway 不可達時 cleanup-job 仍成功（best-effort）:停 pushgateway → 跑 cleanup-job → exit 0 + warn
```

## C10 — prod `--profile metrics` stack 起（FR-009/SC-009;§3 prod 產物驗精神）

```bash
# prod target image build（新 deps 進 runtime image）+ 起 metrics（internal、無 host port）
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile metrics build 2>&1 | tail -3
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile metrics up -d --force-recreate --no-deps prometheus postgres_exporter redis_exporter pushgateway 2>&1 | tail
docker inspect -f '{{range $p,$c := .NetworkSettings.Ports}}{{if $c}}{{$p}} published{{end}}{{end}}' rev2-admin-prometheus-1   # 期望空（internal-only）
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile metrics ps --format '{{.Service}} {{.Status}}' | grep -E 'prometheus|exporter|pushgateway'
# 期望:4 metrics service Up、無對外 host port(internal only);rust-api prod build 含 axum-prometheus deps 綠
# 收尾:還原 dev config
```

## 守恆 / 無回歸

```bash
# rust-api 改後:既有測試不破（server + cleanup-job）
dcargo test -p server 2>&1 | tail -3       # 期望全綠（無新測、既有不破;metrics layer/counter wiring）
dcargo test -p cleanup-job 2>&1 | tail -3  # 期望全綠（push wiring）
dcargo test -p server --test entity_access_lint 2>&1 | tail -2   # 17 不變（metrics 不碰 entity）
# compose 多模 config parse
for f in dev prod; do docker compose -f docker-compose.yml -f docker-compose.$f.yml --profile metrics config >/dev/null && echo "$f metrics OK"; done
```

> **acceptance 重點**:C1 `/metrics` 活體 / C2 enforce counter(閉 Phase 3 #5 債核心) / C3 prometheus scrape targets / C4 exporter / C5 grafana prometheus datasource 端到端 / C6 pushgateway+cleanup-job push / C7 alert rule provisioned / C8 profile gating(metrics⊥log) / C9 零侵入+旁路 / C10 prod 起。**全由活體 C-V 覆蓋、無新單元測試**(§3 已明示)。
