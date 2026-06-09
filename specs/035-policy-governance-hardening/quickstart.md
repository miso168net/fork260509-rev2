# Quickstart: 035 治理層收尾硬化（本地驗收）

> 前提:dev stack 已起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`);Super/Admin/User 密碼 `123456`(CLAUDE.md §8.1)。**rust-api 改後必 `dcargo build` + restart**(cargo-watch /mnt/d 不可靠)。**無 migration**(不需套表)。

## 1. build / lint 守恆

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
dcargo build -p server
dcargo test -p server                                   # 純測(+ PolicyMutated 真值表 + restore payload)全綠
dcargo test -p server --test entity_access_lint         # 17
dcargo test -p server --test endpoint_coverage_lint      # 5 @ 35
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
```

## 2. live-DB `#[ignore]`（沿 034 隔離範式)

```bash
docker run --rm --network rev2-admin_rev2_net -e DATABASE_URL="$(cat deploy/secrets/database_url.txt)" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev test -p server -- --ignored --test-threads=1 sys_casbin_rule
# 含新增:restore 後審計 payload={role,target,dimension};既有 034 live 測不退
```

## 3. US1 審計豐富化（curl 端到端）

```bash
SUPER=$(curl -fsS http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
# 造 archive:updateRoleButton(R_ADMIN 去掉一個按鈕)→ getArchivedPolicies 取 archiveId → restorePolicy
# 驗 sys_operation_log 最新 RESTORE 列 payload_after:
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -tAc \
  "select payload_after from sys_operation_log where operation='RESTORE' and entity_table='casbin_rule' order by id desc limit 1;"
# 期望:{"role":"R_ADMIN","target":"<button code>","dimension":"button"}(非 {"archive_id":..})
```

## 4. US2 no-op 行為不變（curl)

```bash
# Rejected(撤 R_SUPER 治理列被拒)/ restore 撞 live(0000 no-op)/ restore 不存在(2222 归档记录不存在)
# 回應與 034 逐字相同;casbin live 集不變(reload 跳過為內部、不可由 wire 觀察)
docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -tAc "select count(*) from casbin_rule;"  # 72 不變
```

## 5. 守恆

```bash
# 讀決策零變:Super/Admin/User getUserRoutes + endpoint allow/deny 逐項同 034(FR-014/SC-003)
# base-web 零改(無 typecheck)
```

## 6. commit（動 rust-api worktree）

US1+US2 只動 rust-api worktree → worktree commit + push fork,外層 bump SHA pin(CLAUDE.md §4.1);**base-web 零改、無第二 worktree**。
