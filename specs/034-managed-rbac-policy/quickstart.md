# Quickstart: 034 受管 RBAC Policy 治理層(本地驗收)

> 前提:dev stack 已起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`);預設帳號 Super/Admin/User 密碼 `123456`(CLAUDE.md §8.1)。**rust-api 改後必 `dcargo build` + restart**(cargo-watch /mnt/d 不可靠)。

## 1. 套 migration + 重啟(US1 schema 後)

```bash
# migration 經 010 自動套(server boot 不自動 migrate);手動驗:
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
# 確認 m031-m034 已套
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -tAc \
  "select version from seaql_migrations order by version desc limit 4;"
# 確認治理欄 + archive 表
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -c "\d casbin_rule"   # 應見 protected/created_at/created_by
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -c "\d sys_casbin_policy_archive"
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -c "\d sys_menu" | grep protected
```

## 2. build / lint 守恆

```bash
dcargo build
dcargo test --test entity_access_lint
dcargo test --test endpoint_coverage_lint          # US5 後 EXPECTED_ROUTE_COUNT=35
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
```

## 3. 取 token(curl 驗用)

```bash
SUPER=$(curl -fsS http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
```

## 4. US 驗收(逐 US、細節見 contracts/verification-commands.md)

```bash
# US1/US3 寫側 + 讀回(以 endpoint 維度為例)
curl -fsS "http://127.0.0.1:21081/systemManage/getRoleEndpoints?roleId=2" -H "Authorization: Bearer $SUPER"
# US2 protected 拒(撤 R_SUPER 治理列應被擋)
# US5 回收桶
curl -fsS "http://127.0.0.1:21081/systemManage/getArchivedPolicies" -H "Authorization: Bearer $SUPER"
curl -fsS "http://127.0.0.1:21081/systemManage/restorePolicy" -H "Authorization: Bearer $SUPER" \
  -H 'Content-Type: application/json' -d '{"archiveId":1}'
# psql 守恆:live policy 列 vs archive
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -tAc \
  "select count(*) from casbin_rule; select count(*) from sys_casbin_policy_archive;"
```

> **PUBLISH 污染**:跑會 publish 的 live `#[ignore]` 測試後,running rust-api 的 in-memory enforcer 可能被污染 → curl/CDP 前 `restart rust-api` 或 RCLI re-sync(MEMORY)。

## 5. CDP browser smoke(US5,base-web↔rust-api)

沿 022 CDP harness(`tests/<NNN>/`,參 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A):Super 登入 → 側欄見「回收桶」→ 列 archived → 還原 → 驗權限回復;User 側欄無此頁。

## 6. 兩段式 commit(動 rust-api + base-web worktree)

US1-US4 動 rust-api worktree、US5 加動 base-web worktree → 各自 worktree commit + push fork,外層 bump SHA pin(CLAUDE.md §4.1)。base-web 新 view 後 elegant-router 重生的 `routes.ts/imports.ts/elegant-router.d.ts` 須一起 commit(orphan 風險)。
