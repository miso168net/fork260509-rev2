# Contract: Verification commands（C-V acceptance）

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — CLAUDE.md §3 紀律提醒**:本 feature 屬「docker-compose 設定 + 文件命名 refactor」,**無新純函式邏輯**。整體由本 C-V contract 覆蓋驗收;`tasks.md` / `plan.md` 明示「無單元測試,由 acceptance commands 覆蓋」及理由。

---

## §1 live compose 舊名/舊 key 清零（US1 + SC-002）

```bash
# 4 個 live compose 不應再含舊顯式 name: rev2_* 或舊 key
grep -nE "name: rev2_|redis_data:|bw_node_modules|bw_pnpm_store" \
  docker-compose.yml docker-compose.dev.yml docker-compose.base-web.yml docker-compose.rust-api.yml
# 預期: 無輸出（0 行）

# 4 檔皆設頂層 project name
grep -c "^name: rev2-admin" docker-compose.yml docker-compose.base-web.yml docker-compose.rust-api.yml
# 預期: 各 1（master 本就有;2 standalone 新增）
```

---

## §2 卷遷移 + stack healthy + 新名生效（US1 + SC-001 + SC-003）

```bash
# 前置:stack 已 down、移除 7 舊卷（孤兒）
docker volume rm rev2_postgres_data rev2_redis_data rev2_front_nginx_certs \
  rev2_bw_node_modules rev2_bw_pnpm_store rev2_rust_api_cargo_cache rev2_rust_api_target 2>/dev/null || true

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "exit: $?"
# 預期: exit 0、5 service healthy

docker volume ls --format '{{.Name}}' | grep -c '^rev2-admin_'
# 預期: 7
docker volume ls --format '{{.Name}}' | grep -c '^rev2_'    # 舊前綴
# 預期: 0
```

---

## §3 005 dual-write / 連線不變式仍成立（US1 + SC-003）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c '\conninfo'
# 預期: 連線成功（卷改名不影響 postgres init / secret file-based）
# redis requirepass 連線:
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T redis-stack \
  redis-cli -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping
# 預期: PONG
```

---

## §4 CLAUDE.md 規則文件化（US2 + SC-004）

```bash
# §8.2 表有 docker volume name 列 + §8.2.2 規則
grep -n "docker volume name" CLAUDE.md           # 預期: §8.2 表內 1 行
grep -n "8.2.2" CLAUDE.md                         # 預期: 新小節存在
grep -c "rev2-admin_postgres_data\|rev2-admin_redis_stack_data\|rev2-admin_base_web" CLAUDE.md  # 預期: ≥ 1（§8.2.2 正典清單）
# §8.2.1 live 指令無殘留舊卷名
grep -n "rev2_front_nginx_certs\|rev2_postgres_data" CLAUDE.md   # 預期: 無輸出
```

---

## §5 既有文件對齊（US3 + SC-004 + SC-005）

```bash
# 權威 DESIGN 同步
grep -n "redis_data" docs/INTEGRATION-DESIGN.md   # 預期: 已改 redis_stack_data（無裸 redis_data）
# 持久記憶 000 全面改寫
grep -nE "rev2_bw_|bw_node_modules|bw_pnpm_store" docs/superpowers/000-base-web-docker-bootstrap.md
# 預期: 無輸出（全改 base_web）

# 凍結 spec 內文保留（未改寫）+ 有 superseded cross-ref
grep -rl "rev2_bw_\|rev2_redis_data" specs/002 specs/004    # 預期: 仍有（歷史內文保留）
grep -rl "006-docker-volume-naming\|superseded" specs/004 specs/002    # 預期: 有 cross-ref 指向 006
```

---

## 驗收紀律總結

- §1 live compose 舊名清零（US1 + SC-002）
- §2 卷遷移 + stack healthy + 新名（US1 + SC-001 + SC-003）
- §3 005 dual-write / 連線不變式（US1 + SC-003）
- §4 CLAUDE.md 規則文件化（US2 + SC-004）
- §5 既有文件對齊 + 凍結 spec cross-ref（US3 + SC-004 + SC-005）

`tasks.md` 階段把 §1-§5 排程進 task、對應 spec acceptance scenario 與 SC。
