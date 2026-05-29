# Contract: Verification commands（C-V acceptance）

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — [CLAUDE.md §3](../../../CLAUDE.md) 紀律**:本 feature 為 **compose wiring**、**無新純邏輯單元 → 無單元測試**;由 dev/prod stack up acceptance 覆蓋。無 HTTP 業務 endpoint、無 base-web modal → **無 CDP / curl 業務消費者**(只用 `/health` 與 psql 驗 stack 狀態)。
> DB user `soybean` / db `soybean_admin_rust`(以 `deploy/secrets/database_url.txt` 為準)。

---

## §1 dev stack 啟動即自動套 + 冪等（US1 / SC-001·SC-002）

```bash
# 全新 DB:清空 volume 後拉起,不跑任何手動 migration 指令
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "up exit: $?"
# 預期 up exit: 0

# migrate service 已跑完並 exit 0(一次性)
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps -a migrate
# 預期 migrate 狀態 Exited (0)

# schema + seed 自動就緒(無手動 migration):001/002/003 全套上
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "\dt" -c \
  "SELECT version FROM seaql_migrations ORDER BY version;"
# 預期: sys_user 表存在;seaql_migrations 含 m20260529_000001/000002/000003

docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "\d sys_user" -c \
  "SELECT count(*) FROM sys_user WHERE deleted_at IS NULL;"
# 預期: deleted_at 欄 + sys_user_user_name_active_uniq partial index(009 自動套上);active seed ≥3(Super/Admin/User)

# API 健康(閘門放行後才起)
curl -fsS http://127.0.0.1:21081/health ; echo   # 預期 ok

# 冪等(SC-002):再拉一次(不清 volume)→ migrate no-op、up exit 0、API 健康
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "re-up exit: $?"
# 預期 re-up exit: 0;migrate 再跑但 seaql_migrations 全跳過(無新套用)、API 仍 healthy
```

## §2 fail-fast：migration 失敗時擋下 API（US3 / SC-003）

```bash
# 反向驗(臨時、驗畢還原):令 migrate 失敗 → server 不啟動、up --wait 非 0
# 方式 A(不改 code):暫時把 database_url secret 指到不存在的 DB / 壞憑證,
#   或在 dev override 暫加一個必失敗的 migrate command(如 `["status","--bogus"]`)。
# 此處示意用壞 DATABASE_URL 觸發 migrate 連線失敗:
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
# (臨時把 deploy/secrets/database_url.txt 改成壞密碼 — 或用 override env 蓋過)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "fail up exit: $?"
# 預期: up exit ≠ 0(migrate exit≠0、service_completed_successfully 不滿足)
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps -a migrate rust-api
# 預期: migrate Exited (非0);rust-api 未啟動(Created / 未 running)
# 驗畢:還原 database_url.txt、down -v、正常 up 確認回綠

# 正向對照(SC-003 反面):migrate 全成功 → rust-api 正常起(§1 已涵蓋)
```

## §3 prod stack 啟動即自動套（US2 / SC-004）

```bash
# prod baseline(需先 seed cert into named volume,見 CLAUDE.md §8.2.1)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker run --rm -v rev2-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait ; echo "prod up exit: $?"
# 預期 prod up exit: 0;migrate(runtime image、entrypoint dispatcher migration up)Exited (0)

docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -a migrate
# 預期 migrate Exited (0)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c \
  "SELECT version FROM seaql_migrations ORDER BY version;"
# 預期: 001/002/003 已套(與 dev 行為一致 — SC-004)
# API internal 健康(prod rust-api internal only;經 front-nginx 或 exec 內部驗)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T rust-api curl -fsS http://127.0.0.1:21081/health ; echo
# 預期 ok
```

## §4 FR-009 regression（server 仍不自動 migrate / SC-005）

```bash
# server boot 不呼叫 Migrator(007 FR-009 維持):grep 仍 0 命中
grep -rni "Migrator\|run_migration\|migration::up\|cli::run_cli" rust-api/server/src/ ; echo "exit: $?"
# 預期: 無命中(server 不含 migration 觸發);exit 1(grep 無命中)

# rust-api worktree 未被本 feature 改動(outer-only):
git -C rust-api status --short
# 預期: 空(本 feature 不碰 rust-api worktree)

# 既有 /health 行為不破(SC-005):§1/§3 已驗 ok
```

---

## 驗收紀律總結

- §1 dev stack up 自動套 + 冪等(US1;SC-001/SC-002)— stack up + psql
- §2 fail-fast 閘門(US3;SC-003)— 反向注入失敗 + 還原
- §3 prod stack up 自動套(US2;SC-004)— prod stack up + psql
- §4 FR-009 regression + outer-only(SC-005)— grep + git status
- **無 CDP / curl 業務消費者**(無 HTTP 業務 endpoint;只 `/health` + psql 驗 stack)
- **無單元測試**(compose wiring,無新純邏輯函式)
