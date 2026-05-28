# Quickstart: docker-volume-naming

> named volume 命名統一單頁指南。設計見 [plan.md](./plan.md);驗收見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

---

## 前置

- docker（auto-prefix 行為）
- 在 feature branch `006-docker-volume-naming`
- dev stack 已 down（005 收尾已 `down`;無 container 占用舊卷）

---

## Path A — compose 改名（4 檔）

```bash
# docker-compose.yml: 移除 7 個 name:、3 key 更名、redis mount 更名
# docker-compose.dev.yml: 2 個 bw_* mount → base_web_*
# docker-compose.base-web.yml: 加 name: rev2-admin、移除 name:、key/mount/註解更名
# docker-compose.rust-api.yml: 加 name: rev2-admin、移除 name: rust_api_*

# 改完驗語法 + 舊名清零:
docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q && echo "config OK"
grep -nE "name: rev2_|redis_data:|bw_node_modules|bw_pnpm_store" docker-compose*.yml   # 預期: 0 行
```

---

## Path B — 卷遷移（dev 零損失）

```bash
# 移除 7 舊卷孤兒（dev postgres/redis 無真資料、快取重建）
docker volume rm rev2_postgres_data rev2_redis_data rev2_front_nginx_certs \
  rev2_bw_node_modules rev2_bw_pnpm_store rev2_rust_api_cargo_cache rev2_rust_api_target 2>/dev/null || true

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait   # 5 service healthy
docker volume ls | grep rev2-admin    # 預期: 7 個 rev2-admin_<service>_<purpose>
docker volume ls | grep '^rev2_'      # 預期: 無（舊前綴清零）
```

> ⚠️ 不先 rm 舊卷直接 up:docker 建新名空卷、舊 `rev2_*` 卷殘留為孤兒（不致命,但佔空間且混淆）。

---

## Path C — 連線驗證（005 不變式不破）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c '\conninfo'    # 連線成功
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T redis-stack \
  redis-cli -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping    # PONG
```

---

## Path D — 文件對齊

```bash
# CLAUDE.md: §8.2 表加 docker volume name 列 + §8.2.2 規則 + §8.2.1 live 指令舊名更新
# DESIGN.md: redis_data → redis_stack_data
# 000: 全面改寫 bw_* / rev2_bw_* → base_web / rev2-admin_base_web
# 凍結 spec(002/004/005): 不改寫內文、加 1 行 superseded cross-ref → 006
grep -nE "rev2_bw_|bw_node_modules" docs/superpowers/000-base-web-docker-bootstrap.md   # 預期: 0（已改）
grep -rl "006-docker-volume-naming" specs/004 specs/002    # 預期: 有 cross-ref
```

---

## 下一步

- 跑完 Path A-D → 本 feature 完成（7 卷統一 `rev2-admin_` + 規則文件化 + 文件對齊）
- 實作走 `superpowers:executing-plans`（**不**用 `/speckit-implement`,對齊 CLAUDE.md §3）
- 收尾 `superpowers:finishing-a-development-branch` → merge `--no-ff` 回 `rev2-admin-root`
