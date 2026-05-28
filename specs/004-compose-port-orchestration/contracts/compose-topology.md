# Contract: compose topology(三檔分層 + profile + port)

**Type**: docker-compose 結構合約 — base + dev/prod override merge 行為。

---

## 三檔 + 啟動命令

```bash
# dev(hot-reload + loopback + 雙開 HTTP/HTTPS)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# prod baseline(built image + 0.0.0.0 + 80→443 redirect;先 seed cert)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait

# prod + acme(+ acme skeleton)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
```

---

## base 層紀律(`docker-compose.yml`)

- 定義 5 service 的 `image`(prod 預設)/ `build` / `depends_on`(service_healthy)/ `healthcheck` / network `rev2_net`
- **禁止**放 host `ports`(R1:list append → dev/prod 疊加衝突)
- **禁止**放 dev/prod 專屬 volume(source bind mount / cert mount)
- 設 `name:` 顯式 named volume(rev2_ 前綴)
- `acme` service 定義 `profiles: [prod]`

---

## override 紀律

| 欄位 | merge 行為 | 落點 |
|---|---|---|
| `image` / `command` / `build` | 覆寫 | dev override base-web→node:20、rust-api→dev target |
| `environment` | merge | secret env 在 base 或 override |
| `ports` / `volumes`(list)| **append** | host port binding **只**在 override(base 不放)|

---

## port 配置(對齊 §8.2)

| service | dev override | prod override |
|---|---|---|
| front-nginx | `127.0.0.1:21080:21080` + `127.0.0.1:21443:21443` | `0.0.0.0:80:80` + `0.0.0.0:443:443` |
| base-web | `127.0.0.1:21079:21079` | (internal only)|
| rust-api | `127.0.0.1:21081:21081` | (internal only)|
| postgres | `127.0.0.1:25432:5432` | `127.0.0.1:25432:5432` |
| redis-stack | `127.0.0.1:26379:6379` | `127.0.0.1:26379:6379` |

> container 內 port:postgres `5432` / redis `6379`(不改);front-nginx dev listen 21080/21443、prod listen 80/443;base-web `21079`、rust-api `21081`(internal)。

---

## COMPOSE_PROJECT_NAME

- 設 `rev2-admin`(`.env` 或 compose `name:` 頂層欄位);影響 container name(`rev2-admin-<service>`)+ default network 名
- named volume 用顯式 `name: rev2_*`(bypass project prefix)

---

## 驗收

對應 spec FR-001/FR-002/FR-003/FR-008/FR-009/FR-010 + SC-001。
