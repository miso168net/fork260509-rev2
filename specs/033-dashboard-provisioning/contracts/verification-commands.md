# Contract — C-V 驗收命令（033-dashboard-provisioning）

> 本 feature **無新純函式**（dashboard 全 grafana config）→ **無新單元測試、全由 acceptance C-V 覆蓋**（§3 紀律；同 031/032）。**無 CDP browser smoke**：grafana 是維運 ops UI（非 base-web）→ 不適用（同 027/030/031/032 N/A）。
> **§3「新 workspace crate ⇒ prod image build」嚴格不觸發**（無 rust 改動、純 grafana config）；但 **C5 仍驗 prod `--profile obs --profile metrics` 起 + dashboards internal-only**（FR-010/SC-005）。
> 活體前置：改 provisioning 後 grafana 須 **`up -d --force-recreate grafana`**（★ 非 restart、WSL2 drvfs bind-mount shadow-path 衝突、031/032 gotcha）。
> 連線常數（CLAUDE §8.2）：grafana dev `:23000`（admin / `cat deploy/secrets/grafana_admin_password.txt`）、prometheus `:23090`、loki `:23100`、pushgateway `:29091`。

## C0 — 前置：起完整觀察性 + 觸發一次 cleanup-job push（給 cleanup-job 板資料）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
bash deploy/generate-secrets.sh    # 確保 grafana_admin_password 等在
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --force-recreate grafana   # 載入新 dashboards/ + loki uid
# 觸發一次 cleanup-job push(同 032 C6)→ cleanup-job 板有 fresh 資料(否則顯 No data、研究 R6)
PW=$(cat deploy/secrets/postgres_password.txt); NET=rev2-admin_rev2_net
docker run --rm --network "$NET" -e DATABASE_URL="postgres://soybean:$PW@postgres:5432/soybean_admin_rust" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo -v rev2-admin_rust_api_target:/app/target \
  -w /app --entrypoint cargo rev2-admin-rust-api:dev run --bin cleanup-job
# 打幾個請求 + 一個 deny 產 rust-api/enforce/log 資料
curl -s -o /dev/null http://127.0.0.1:21081/health
TOKEN_U=$(curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s -o /dev/null http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKEN_U"   # deny → casbin_enforce_total{deny}
sleep 20   # 給 prometheus scrape + loki ingest
```

## C1 — 6 張 dashboard provisioned（SC-001/003 + FR-001..006）

```bash
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
curl -s -u "admin:$GF_PASS" 'http://127.0.0.1:23000/api/search?type=dash-db' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("dashboards:",len(d));[print(" -",x["title"],"| folder:",x.get("folderTitle")) for x in d]'
# 期望:6 張(master overview / rust-api / postgres / redis / audit-log / cleanup-job)、folder=obs-full
```

## C2 — datasource 解析（無「datasource not found」）（SC-002 + FR-007）

```bash
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
# loki 已補顯式 uid:loki + prometheus uid:prometheus
curl -s -u "admin:$GF_PASS" http://127.0.0.1:23000/api/datasources | python3 -c 'import sys,json;[print(" ",x["name"],x["type"],"uid="+x["uid"]) for x in json.load(sys.stdin)]'
# 期望:Loki(uid=loki) + Prometheus(uid=prometheus)
# 逐板查其引用的 datasource uid 都存在(無 dangling)
for uid in $(curl -s -u "admin:$GF_PASS" 'http://127.0.0.1:23000/api/search?type=dash-db' | python3 -c 'import sys,json;[print(x["uid"]) for x in json.load(sys.stdin)]'); do
  curl -s -u "admin:$GF_PASS" "http://127.0.0.1:23000/api/dashboards/uid/$uid" | python3 -c 'import sys,json;d=json.load(sys.stdin);t=d["dashboard"]["title"];refs=set();
import re
for ds in re.findall(r"\"uid\":\s*\"(prometheus|loki)\"", json.dumps(d)):refs.add(ds)
print(t,"→ datasource uid refs:",sorted(refs) or "(template/community)")'
done
# 期望:每板引用 uid ∈ {prometheus, loki}、皆為已 provision 的 datasource(無 ${DS_*}/auto-gen 殘留)
```

## C3 — panel query 經 datasource proxy 回資料（SC-002 + FR-001..005）

```bash
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
PROM='http://127.0.0.1:23000/api/datasources/proxy/uid/prometheus/api/v1/query'
q(){ curl -s -u "admin:$GF_PASS" --data-urlencode "query=$1" "$PROM" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  $2:',d.get('status'),'series=',len(d.get('data',{}).get('result',[])))"; }
# rust-api 板
q 'sum by (endpoint,status) (rate(axum_http_requests_total[5m]))' 'rust-api req-rate'
q 'histogram_quantile(0.99, sum by (le) (rate(axum_http_requests_duration_seconds_bucket[5m])))' 'rust-api p99'
q 'sum by (decision) (rate(casbin_enforce_total[5m]))' 'enforce allow/deny'
# master / infra
q 'up{job=~"rust-api|postgres|redis|pushgateway"}' 'targets up'
q 'pg_up' 'pg_up'; q 'redis_up' 'redis_up'
q 'pg_stat_activity_count' 'pg activity(postgres 板)'
q 'redis_memory_used_bytes' 'redis memory(redis 板)'
# cleanup-job(C0 已 push)
q 'cleanup_job_last_success_timestamp' 'cleanup last-success'
q 'cleanup_job_rows_deleted' 'cleanup rows'
# audit-log(loki proxy)
LOKI='http://127.0.0.1:23000/api/datasources/proxy/uid/loki/loki/api/v1/query'
curl -s -u "admin:$GF_PASS" --data-urlencode 'query=sum by (service) (count_over_time({compose_project="rev2-admin"}[5m]))' "$LOKI" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  log-volume-by-service:",d.get("status"),"series=",len(d.get("data",{}).get("result",[])))'
curl -s -u "admin:$GF_PASS" --data-urlencode 'query=sum by (status) (count_over_time({service="front-nginx"} |~ `^{` | json [5m]))' "$LOKI" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  nginx-status(★|~^{):",d.get("status"),"series=",len(d.get("data",{}).get("result",[])))'
# 期望:多數 query status=success + series≥1(5xx/deny 可能 0 series=無樣本、預期;cleanup C0 push 後非空)
```

## C4 — provisioning log 乾淨（SC-003 + FR-006）

```bash
docker logs rev2-admin-grafana-1 2>&1 | grep -iE 'dashboard|provision' | grep -iE 'error|fail|invalid' | grep -ivE 'plugins|no such file|cleanup' | tail
# 期望:無 dashboard load error(忽略無關 plugins/missing-dir 警告);可選正面:grep 'finished to provision dashboards'
docker logs rev2-admin-grafana-1 2>&1 | grep -i 'provision' | grep -i dashboard | tail -3
```

## C5 — prod `--profile obs --profile metrics` dashboards internal-only（FR-010/SC-005）

```bash
# prod override 起 grafana(+obs+metrics)→ dashboards provision、grafana 無對外 host port
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs --profile metrics up -d --force-recreate --no-deps grafana 2>&1 | tail -3
sleep 5
docker inspect -f '{{range $p,$c := .NetworkSettings.Ports}}{{if $c}}{{$p}} published{{end}}{{end}}' rev2-admin-grafana-1   # 期望空(internal-only)
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T grafana wget -qO- "http://admin:$GF_PASS@127.0.0.1:3000/api/search?type=dash-db" 2>/dev/null | python3 -c 'import sys,json;print("prod dashboards:",len(json.load(sys.stdin)))' || echo "(prod grafana 內部查)"
# 期望:6 張 provisioned、grafana 無 published port(internal-only)
# 收尾:還原 dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs --profile metrics up -d --force-recreate --no-deps grafana
```

## 守恆 / 無回歸（031/032 不破）

```bash
GF_PASS=$(cat deploy/secrets/grafana_admin_password.txt)
# 031/032 datasource 仍在(loki uid 改後不破)
curl -s -u "admin:$GF_PASS" http://127.0.0.1:23000/api/datasources | python3 -c 'import sys,json;n=[x["name"] for x in json.load(sys.stdin)];print("datasources:",n);assert "Loki" in n and "Prometheus" in n,"datasource 缺!"'
# 032 alert rule 仍 provisioned(3 條)
curl -s -u "admin:$GF_PASS" http://127.0.0.1:23000/api/v1/provisioning/alert-rules | python3 -c 'import sys,json;d=json.load(sys.stdin);print("alert rules:",len(d));assert len(d)==3,"alert rule 數變!"'
# loki Explore 仍可查(by-name、uid 改不破)
curl -s -u "admin:$GF_PASS" "http://127.0.0.1:23000/api/datasources/proxy/uid/loki/loki/api/v1/labels" | python3 -c 'import sys,json;print("loki labels via uid:loki:",json.load(sys.stdin)["status"])'
# compose 多模 config parse
for f in dev prod; do docker compose -f docker-compose.yml -f docker-compose.$f.yml --profile obs --profile metrics config >/dev/null && echo "$f config OK"; done
# 純 config:無 rust 改 → 不跑 dcargo test(本 feature 不動 server/cleanup-job;但若誤動則 dcargo test -p server 守恆)
```

> **acceptance 重點**：C1 6 張 provisioned / C2 datasource 解析(loki-uid 修 + 無 dangling) / C3 panel query 經 proxy 回資料(rust-api·infra·cleanup·log) / C4 provisioning log 乾淨 / C5 prod internal-only / 守恆(031/032 datasource+alert 不破、loki Explore 不破)。**全由活體 C-V 覆蓋、無新單元測試、無 CDP**（§3 已明示）。
