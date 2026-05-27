# Contract: `/health.html` static asset

**Type**: HTTP static resource(nginx 直接 serve,不走 SPA fallback)

## Source

`base-web/public/health.html`(本 feature 新增,4 行)

```html
<!-- ops health probe target;feature 002-dockerfile-base-web 新增 -->
<!-- 不被 SPA 渲染;nginx try_files $uri 直接命中、不走 SPA fallback -->
ok
```

## Build pipeline

```
base-web/public/health.html
   ↓ (vite build copy public/* → dist/,vite 預設 publicDir 行為)
base-web/dist/health.html
   ↓ (Dockerfile builder COPY dist/ → runtime stage)
/usr/share/nginx/html/health.html
   ↓ (nginx try_files $uri 命中)
GET /health.html → HTTP 200 + body "ok\n"
```

## Request

| 屬性 | 值 |
|---|---|
| Method | `GET` |
| Path | `/health.html` |
| Headers | 無要求(無 auth) |
| Body | 無 |

## Response

| 屬性 | 值 |
|---|---|
| Status | `200 OK` |
| Content-Type | `text/html`(nginx 預設由副檔名推) |
| Body | `ok\n`(plus 2 HTML 註解行) |

## nginx config 紀律

既有 nginx config(本 feature 不改 nginx config 結構):

```nginx
server {
    listen 21079;                          # ← 本 feature 從 80 改
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;  # SPA fallback;health.html 在 $uri 第一段命中、不 fallback
    }
}
```

**try_files 行為**:
- `$uri` = `/health.html` → nginx 在 root `/usr/share/nginx/html/health.html` 找實體檔
- 檔存在(vite copy from public/)→ 直接 serve,不再試 `$uri/` 或 `/index.html`
- 若 dist/ 內 health.html 缺失 → fallback 到 `/index.html`(SPA bundle bytes,~622 bytes 不含 "ok")→ HEALTHCHECK grep "ok" fail → container unhealthy(自我守護)

## Examples

```bash
# 正常 — nginx 直接 serve
curl -fsS http://127.0.0.1:21079/health.html
# stdout: ok
# Content-Type: text/html

# 故障驗證 — 刪掉 image 內檔
docker exec rev2-admin-base-web rm /usr/share/nginx/html/health.html
sleep 30
docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期: unhealthy
```

## 不在 contract 內

- Deep health check(SPA bundle integrity / backend reachability)— 本 feature 只驗 nginx + dist/ 完整;backend health 由 Phase 3 rust-api 接入時加 `/api/health` proxy 處理
- JSON response(`{"status":"ok"}`)— 過度設計,plain text 足夠
- Authentication(`/health.html` 需 token)— 違反 ops health probe 慣例,反模式

## 驗收

對應 spec FR-011/012/013 + User Story 1 Acceptance Scenario 1/2/3 + SC-002(HEALTHCHECK probe 對象)。
