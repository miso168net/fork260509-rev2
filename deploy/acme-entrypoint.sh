#!/usr/bin/env sh
# acme skeleton entrypoint — 本 feature 不真實 issue cert
#
# 啟用步驟(Phase 3+):
#   1. 設定 DNS provider 環境變數(e.g. CF_Token / CF_Email for Cloudflare)
#   2. 在 docker-compose.prod.yml acme service 加入 DNS provider env
#   3. 把 --issue 命令寫入此 script 或用 docker compose exec acme acme.sh --issue ...
#   4. 設定 --renew-hook 把 cert 更新到 rev2_front_nginx_certs volume
#
# 現在:idle(tail -f /dev/null),不 crash-loop
# sanity check:docker compose --profile prod exec acme acme.sh --version

echo "acme skeleton ready — set DNS provider creds + domain then enable acme.sh --issue"
exec tail -f /dev/null
