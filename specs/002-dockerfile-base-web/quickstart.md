# Quickstart: dockerfile-base-web

> 「base-web 部署基建對齊」單頁指南。
> 詳細設計見 [plan.md](./plan.md);驗收細節見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

---

## 前置

- WSL2 + docker 23+(BuildKit 自動)
- 從 `rev2-admin-root` repo clone(含 `base-web` worktree)
- 當前在 feature branch `002-dockerfile-base-web`
- 001 dockerfile-rust-api 已落地(設計範本參照、不依賴運行)

---

## Path A — 跑 dev profile(熱重載開發)

```bash
# 從 workspace root
docker compose -f docker-compose.base-web.yml --profile dev up -d

# 等 30-60s for pnpm install + vite ready(首次更久 ~5 分鐘)
# 進度觀察:
docker compose -f docker-compose.base-web.yml logs -f base-web-dev | head -50
```

開另一 terminal:
```bash
curl -fsS http://127.0.0.1:21079/health.html
# 預期: ok

curl -fsS http://127.0.0.1:21079/
# 預期: SPA index.html (HTTP 200)
```

改 `base-web/src/` 任意 vue 檔,vite HMR 應自動 reload(行為 = 000 既有,本 feature 不變動)。

---

## Path B — 跑 prod profile(near-prod 驗收)

第一次:
```bash
# 預設 build(走 ApiFox Mock URL)
DOCKER_BUILDKIT=1 docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait
```

驗證:
```bash
curl -fsS http://127.0.0.1:21079/health.html
# 預期: ok

curl -fsS http://127.0.0.1:21079/some/random/route
# 預期: SPA index.html (SPA fallback)

docker inspect rev2-admin-base-web --format='{{.State.Health.Status}}'
# 預期: healthy (30 秒內)

docker image inspect rev2-admin-base-web:latest --format='{{.Size}}' | numfmt --to=iec
# 預期: < 80 MB
```

---

## Path C — Build-arg override

切換到別的 backend URL(如 rust-api internal name):

```bash
docker compose -f docker-compose.base-web.yml --profile prod down

VITE_SERVICE_BASE_URL=http://rust-api:21081 \
  docker compose -f docker-compose.base-web.yml --profile prod up -d --build --wait

# 驗 URL 確實 inline 進 bundle
docker run --rm rev2-admin-base-web:latest sh -c "grep -c 'rust-api:21081' /usr/share/nginx/html/assets/*.js"
# 預期: > 0
```

不動 base-web inline:
```bash
git -C base-web diff --name-only HEAD
# 預期: 只有 public/health.html
```

---

## Path D — Image tag 獨立 run

```bash
docker run --rm -p 127.0.0.1:21079:21079 rev2-admin-base-web:latest
# 另一 terminal:
curl -fsS http://127.0.0.1:21079/health.html
# 預期: ok
```

驗證 image tag `rev2-admin-base-web:latest` 可獨立於 compose 使用。

---

## Troubleshooting

| 症狀 | 處置 |
|---|---|
| `curl /health.html` 回 SPA bundle 而非 `ok` | nginx config 寫錯或 dist/ 內 health.html 缺;`docker exec rev2-admin-base-web ls /usr/share/nginx/html/health.html` 檢查;若缺 → 重 build |
| HEALTHCHECK 一直 `starting` 不變 healthy | 等滿 30s 才會切;若超過 60s 仍 starting → `docker compose logs base-web-prod` 看 nginx 是否起來 |
| build-arg override 後 grep `<URL>` 仍是 0 | research §1:vite `loadEnv` 不讀 process.env;builder stage `RUN echo "... > .env.prod.local"` 必須在 `RUN pnpm build` 前。檢查 Dockerfile 順序 |
| dev profile 啟動很慢(>3 分鐘) | 首次 pnpm install 1077 packages + npm install -g pnpm@10 約 3-5 分鐘;named volume `rev2_bw_pnpm_store` 後續複用,第二次快 |
| `127.0.0.1:21079` connection refused | 確認 port 沒撞:沒有 dev + prod 同時 up;`docker compose ps` 看 container running |
| Windows host 從 `127.0.0.1` 連不到 WSL2 內 port | `.wslconfig` 加 `[wsl2] networkingMode=mirrored`(Win11 22H2+);或從 `wsl hostname -I` 拿 WSL IP |
| `target/` 或 `.pnpm-store/` 被寫回 host base-web/ 污染 | 000 §2.7 已解(named volume mask + env redirect);若仍出現,檢查 `docker-compose.base-web.yml` 內 3 個 volume mount 是否完整 |

---

## 下一步

- 跑完上述 Path A-D → `/speckit-tasks` 產 dependency-ordered task 清單
- `/speckit-analyze` 跨檔 consistency 報告(spec / plan / tasks)
- 實作走 `superpowers:executing-plans`(**不**用 `/speckit-implement`,對齊 CLAUDE.md §3 紀律)
