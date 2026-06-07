# Contract — C-V 驗收命令（031-obs-min）

> 本 feature **無新純函式**(request_id 注入是 span wiring、nginx/compose 是 config) → **無新單元測試、全由 acceptance C-V 覆蓋**(§3 紀律;`extract_trace_id` 既有單測 `audit_ctx.rs:197-210` 不變、不破)。
> **無 CDP browser smoke**:obs 是維運 infra、無 base-web UI 改動(grafana 是獨立 ops UI、非 base-web) → 不適用 base-web CDP（同 027/030 的 N/A 性質）。
> **§3「新 workspace crate ⇒ prod image build」不觸發**(無新 crate、tracing 既有);但 **C5 仍須驗 prod `--profile obs` stack 起**(FR-009/SC-005、「在正式產物驗、非只 dev bind-mount」精神)。
> 活體前置:rust-api `audit_ctx.rs` 改 code 後須**重建+重啟 rust-api**(WSL2 /mnt/d inotify 不可靠、memory `devstack-acceptance-restart`):`dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api`;nginx conf 改後 restart front-nginx;obs 首次起會 pull/build image。
> 連線常數(CLAUDE §8.2):rust-api dev `:21081`、front-nginx dev `:21080`、postgres `:25432`(user soybean / db soybean_admin_rust)、grafana `:23000`、loki `:23100`。

## C1 — log pipeline 活體（SC-001 + FR-001/002）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 前置:seed grafana secret(若未) + rust-api 帶 D5 span 已重啟
bash deploy/generate-secrets.sh    # 含新 grafana_admin_password
# 起 dev stack + obs（三 obs service healthy）
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs up -d --wait
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs ps --format '{{.Service}} {{.Status}}' | grep -E 'loki|alloy|grafana'
# 期望:loki / alloy / grafana 皆 Up(healthy/running)

# 打一個 rust-api 請求(直連 21081 或經 front-nginx 21080)
curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' >/dev/null
sleep 5   # 給 alloy 採集 + push loki 的時間

# 經 loki HTTP API 查 rust-api log（過去 5 分鐘）
END=$(date +%s)000000000; START=$(( $(date +%s) - 300 ))000000000
curl -G -s "http://127.0.0.1:23100/loki/api/v1/query_range" \
  --data-urlencode 'query={service="rust-api"} | json' \
  --data-urlencode "start=$START" --data-urlencode "end=$END" --data-urlencode 'limit=20' \
  | head -c 1500
# 期望:回 streams 含 rust-api 的 JSON log 行;至少一行含 "message":"request complete" + "trace_id":"<uuid>"
```

## C2 — log↔audit 對接（SC-002 + FR-003）

```bash
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -At"
# 打一個已認證寫入(取得 token 後打受保護端點 或 直接 login 也會寫 sys_access_log? login 未認證不寫;改用已認證請求)
TOKEN=$(curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s http://127.0.0.1:21081/auth/getUserInfo -H "Authorization: Bearer $TOKEN" >/dev/null
sleep 5
# 取最新 sys_access_log 的 trace_id
TID=$($PSQL -c "SELECT trace_id FROM sys_access_log ORDER BY id DESC LIMIT 1;")
echo "audit trace_id = $TID"
# 用同 trace_id 在 loki 查 rust-api log → 應對得上(同值)
# 注意:rust-api 的 trace_id 巢狀於 fmt().json() 的 "fields" 物件 → loki | json flatten 後為 fields_trace_id(見 data-model §1.1)
curl -G -s "http://127.0.0.1:23100/loki/api/v1/query_range" \
  --data-urlencode "query={service=\"rust-api\"} | json | fields_trace_id=\"$TID\"" \
  --data-urlencode "start=$(( $(date +%s) - 300 ))000000000" --data-urlencode "end=$(date +%s)000000000" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); n=sum(len(s["values"]) for s in d.get("data",{}).get("result",[])); print(f"loki rows for trace_id: {n}")'
# 期望:≥1 row → log 的 trace_id == sys_access_log.trace_id == 同一請求(SC-002 ≤2 步對接)
```

## C3 — nginx JSON access log 進 loki + 同源 request_id（FR-004）

```bash
# 經 front-nginx(:21080)打請求 → nginx 生 $request_id 傳給 rust-api
curl -s http://127.0.0.1:21080/api/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' >/dev/null
sleep 5
# loki 查 front-nginx 的 JSON access log
curl -G -s "http://127.0.0.1:23100/loki/api/v1/query_range" \
  --data-urlencode 'query={service="front-nginx"} | json' \
  --data-urlencode "start=$(( $(date +%s) - 120 ))000000000" --data-urlencode "end=$(date +%s)000000000" --data-urlencode 'limit=10' \
  | head -c 1200
# 期望:回 front-nginx 的 JSON 行、含 "request_id":"<32-hex>" / "service":"front-nginx" / "uri":"/api/..." / "status"
# 進階對接:取該 nginx request_id → 查 {service="rust-api"} | json | fields_trace_id="<同 request_id>" → 應對得上(FR-004 跨服務同值;rust-api trace_id 在 fields 下 → fields_trace_id)
```

## C4 — profile gating:一般 up 不啟 obs（SC-003 + FR-006）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
if docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --services --filter status=running | grep -qE '^(loki|alloy|grafana)$'; then
  echo "FAIL: obs service 不該隨一般 up 啟動"
else
  echo "OK(C4): loki/alloy/grafana 未啟(profile:[obs] gated)"
fi
# 期望 OK
```

## C5 — prod `--profile obs` stack 起（FR-009 / SC-005;§3 prod 產物驗精神）

```bash
# prod target image build + 起 obs(internal、無 host port)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs build 2>&1 | tail -3
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs up -d --wait
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile obs ps --format '{{.Service}} {{.Status}}' | grep -E 'loki|alloy|grafana'
# 期望:三 obs service Up;無對外 host port(internal only);grafana/loki 可由 stack 內部 service 達
# 收尾:docker compose -f ... -f prod.yml --profile obs down
```

## C6 — 全服務 log 可查（SC-001 涵蓋全 stack）

```bash
# 各來源服務都應有 log stream(rust-api / front-nginx / postgres / redis-stack / base-web)
for svc in rust-api front-nginx postgres redis-stack base-web; do
  n=$(curl -G -s "http://127.0.0.1:23100/loki/api/v1/query_range" \
    --data-urlencode "query={service=\"$svc\"}" \
    --data-urlencode "start=$(( $(date +%s) - 600 ))000000000" --data-urlencode "end=$(date +%s)000000000" --data-urlencode 'limit=1' \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(len(d.get("data",{}).get("result",[])))' 2>/dev/null)
  echo "$svc: $n stream(s)"
done
# 期望:各 service ≥0(活躍者 ≥1);至少 rust-api / front-nginx 有 stream → 證 alloy docker-SD service label 正確
```

## C7 — FR-008 旁路不反壓 / FR-007 行為零侵入（SC-004/SC-006）

```bash
# obs 啟用前後同一組請求回應碼/形狀不變(取樣比對)
# 啟用前(無 obs):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
A=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}')
# 啟用 obs 後:
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs up -d --wait
B=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}')
echo "before=$A after=$B"   # 期望 200==200、回應 envelope 不變(SC-004 行為零侵入)
# FR-008:停掉 loki(模擬入口不可達)→ rust-api 請求仍成功(alloy 旁路、不反壓 app)
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs stop loki
C=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:21081/health)
echo "loki down, app health=$C"   # 期望 200(SC-006 旁路、app 不受 obs 影響)
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile obs start loki
```

## 守恆 / 無回歸

```bash
# rust-api 改 audit_ctx.rs 後:既有測試不破(extract_trace_id 等)
dcargo test -p server 2>&1 | tail -3   # 期望全綠(無新測、既有不破)
# lint 不破
dcargo test -p server --test entity_access_lint 2>&1 | tail -2   # 17 不變(audit_ctx 不碰 entity)
# compose 三模 config 仍 parse
for f in dev prod; do docker compose -f docker-compose.yml -f docker-compose.$f.yml --profile obs config >/dev/null && echo "$f OK"; done
```

> **acceptance 重點**:C1 pipeline 活體 / C2 log↔audit trace_id 同源對接(核心價值) / C3 nginx JSON + 跨服務同 id / C4 profile gating / C5 prod 起 / C6 全服務涵蓋 / C7 行為零侵入 + 旁路不反壓。**全由活體 C-V 覆蓋、無新單元測試**(§3 已明示)。docker.sock 權限(alloy 讀)在 C1 起 stack 時實證。
