# README

## base-web 容器化 quick reference

```bash
# Dev 熱重載 (http://localhost:21079)
docker compose -f docker-compose.base-web.yml --profile dev up
# 改 base-web/ 內檔即時 reload;Ctrl-C 終止

# Prod build + serve (http://localhost:21079)
docker compose -f docker-compose.base-web.yml --profile prod up --build
# 改 code 要 --build 重 build image

# 停掉 + 移除容器
docker compose -f docker-compose.base-web.yml --profile dev down
docker compose -f docker-compose.base-web.yml --profile prod down

# 清掉 dev mode 的 node_modules cache(強制下次重 install)
docker volume rm rev2_bw_node_modules
```

> workspace 整體指引見 [CLAUDE.md](CLAUDE.md)。
