location / {
    proxy_pass http://base-web:21079;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# 032 FR-011: rust-api /metrics 不得對外暴露。location /api/ 會剝前綴把 /api/metrics 轉到
# rust-api /metrics;用 exact-match 擋塊回 404(優先於 prefix /api/)。內網 prometheus 仍直接
# scrape rust-api:21081/metrics、不經 nginx、不受此擋塊影響。
location = /api/metrics {
    return 404;
}

location /api/ {
    proxy_pass http://rust-api:21081/;   # ★ 末尾 / 必要:strip /api 前綴
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
}

location = /health {
    add_header Content-Type text/plain;
    return 200 "ok\n";
}
