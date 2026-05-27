# Contract: nginx HEALTHCHECK probe

**Type**: Docker HEALTHCHECK directive(Dockerfile runtime stage)

## Dockerfile directive

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok" || exit 1
```

## Timing parameters(對齊 001 rust-api)

| Parameter | Value | 含義 |
|---|---|---|
| `--interval` | `10s` | 每 10 秒 probe 一次 |
| `--timeout` | `3s` | 單次 probe 超過 3 秒視為 fail |
| `--start-period` | `5s` | container 啟動後 5 秒內 probe fail 不算 unhealthy(grace period) |
| `--retries` | `3` | 連續 3 次 fail 才標 unhealthy |

**對齊 001 理由**:跨 service consistency,operator 看 `docker ps` 各 service healthcheck 表現一致;未來 §8.2 整合套 stack 時 front-nginx 對下 service healthcheck 也共用此 timing baseline。

## Probe 命令拆解

```sh
wget -qO- http://127.0.0.1:21079/health.html | grep -q "ok" || exit 1
```

| 段 | 行為 |
|---|---|
| `wget -q` | quiet mode,不寫 progress 到 stderr |
| `wget -O-` | body 寫 stdout(否則預設寫檔) |
| `http://127.0.0.1:21079/health.html` | probe 自身 container 內 nginx + static |
| `| grep -q "ok"` | grep -q:match 找到回 0(success),沒找到回 1(fail);輸出抑制 |
| `\|\| exit 1` | 任一段 fail 整體 exit 1(讓 HEALTHCHECK 標 unhealthy) |

**為何 wget 不用 curl**:
- runtime base image `nginx:alpine` 含 wget(busybox)、不含 curl
- 不加 `apk add curl`(image size 多 ~3 MB、無必要)
- 001 rust-api 用 curl 是因 base `debian:bookworm-slim` 已 apt install curl(application 需用)

**為何 grep -q body 而非僅 wget exit code**:
- `wget -qO-` 對 404 / network fail,exit 非 0 + stdout 空 → grep -q "ok" 仍 fail(空 input no match)→ HEALTHCHECK fail。OK
- 但若 nginx 回 200 + 錯誤 body(例:`/health.html` 被誤改成 `dead`、或 fallback 到 SPA index)→ wget exit 0、stdout 非空但不含 "ok" → grep -q fail → HEALTHCHECK fail
- 純靠 wget exit code 看不出第二種「200 + 內容錯」場景

**busybox wget 邊界 case**:
- 404:stdout 空 + stderr 寫 "wget: server returned error: HTTP/1.0 404 Not Found" + exit 非 0 → grep -q on empty → fail
- 連線拒絕:stdout 空 + stderr 寫 error + exit 非 0 → grep fail
- timeout(>3s):docker 殺進程 + 視為 fail → 不到 grep 階段
- redirect:`wget -qO-` 預設不 follow redirect(`--max-redirect 0` 行為);本 feature 無 redirect 場景

## Health status transition

| State | 條件 |
|---|---|
| `starting` | container 啟動後 5s 內(start-period grace) |
| `healthy` | 5s 後 至少 1 次 probe 成功(預期 30 秒內達到,SC-002) |
| `unhealthy` | 連續 3 次 probe fail(`retries=3` × `interval=10s` = ~30s 故障到標) |

## Examples

```bash
# 正常 healthy(SC-002)
docker compose -f docker-compose.base-web.yml --profile prod up -d --wait
sleep 30
docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期: healthy

# 故障模擬 unhealthy(spec User Story 2 Acceptance 2)
docker exec rev2-admin-base-web rm /usr/share/nginx/html/health.html
sleep 60  # ~30s × 2 倍 safety margin
docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期: unhealthy
```

## 驗收

對應 spec FR-008/009/010 + User Story 2 Acceptance 1/2 + SC-002(< 30s healthy)。
