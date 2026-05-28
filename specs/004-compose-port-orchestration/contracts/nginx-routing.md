# Contract: nginx reverse proxy routing + TLS

**Type**: nginx conf 行為合約 — 路由分流 + strip 前綴 + TLS 三來源。

---

## 路由分流(`_locations.inc`,dev/prod 共用)

```nginx
location / {
    proxy_pass http://base-web:21079;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://rust-api:21081/;   # ★ 末尾 / 必要:strip /api 前綴
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /health {
    add_header Content-Type text/plain;
    return 200 "ok\n";
}
```

**strip 規則**(R2):`location /api/` + `proxy_pass http://rust-api:21081/`(末尾 `/`)→ `/api/auth/login` 經 nginx 替換 `/api/` 為 `/` → rust-api 收 `/auth/login`(對齊 mock ground truth、§11.11 拍板)。**末尾 `/` 漏掉 = 不 strip = rust-api 404**。

---

## dev.conf(雙開,不 redirect)

```nginx
server {
    listen 21080;
    server_name localhost;
    include /etc/nginx/conf.d/_locations.inc;
}
server {
    listen 21443 ssl;
    server_name localhost;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    include /etc/nginx/conf.d/_locations.inc;
}
```

---

## prod.conf(80→443 強制 redirect)

```nginx
server {
    listen 80;
    server_name _;
    # /health 走 HTTP 200(front-nginx healthcheck 在 prod 打 :80/health);其餘才 redirect。
    # ★ 不可用 server-level `return 301`:nginx server-level return 在 rewrite phase
    #   早於 location match 觸發,會把 /health 也 301 吃掉 → healthcheck 永久 fail(as-built 修正)。
    location = /health {
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
server {
    listen 443 ssl;
    server_name _;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    include /etc/nginx/conf.d/_locations.inc;
}
```

---

## TLS cert 三來源(路徑統一 `/etc/nginx/certs/`)

| 模式 | mount 機制 | cert 來源 |
|---|---|---|
| dev | bind mount `./deploy/dev-certs:/etc/nginx/certs:ro` | 003 `generate-dev-cert.sh` 生的 fullchain.pem + privkey.pem |
| prod baseline | named volume `rev2_front_nginx_certs:/etc/nginx/certs` | 手動 seed(§8.2.1 範例)|
| prod + acme | 同 prod baseline + acme service 寫 cert 進同 volume | acme.sh(skeleton,本 feature 不真實 issue)|

> conf 用 `fullchain.pem` + `privkey.pem`(003 cert 命名);dev/prod 來源差異吸收在 compose override mount,nginx conf 不區分。

---

## base-web build-arg wire

base-web prod image build 帶 `VITE_SERVICE_BASE_URL=/api`(002 build-arg override 機制);axios 打 `/api/auth/login` → nginx strip → rust-api `/auth/login`。同 origin、無 CORS。

> dev profile base-web(vite dev server)的 `VITE_SERVICE_BASE_URL` 由 `base-web/.env.*` 控(本 feature dev 驗 nginx 路由用 curl 直送,base-web SPA 端到端 wire 留 Phase 4 CDP)。

---

## 驗收

對應 spec FR-004/FR-005/FR-006/FR-007/FR-015/FR-016/FR-017/FR-020 + SC-002/SC-003/SC-004/SC-005。
