# Verification Commands (C-V Contract): 015-audit-middleware

**Date**: 2026-06-01 | **Branch**: `015-audit-middleware`
純後端 feature(brainstorm D10:**無 CDP**)→ 驗收 = **純單測 + dev stack curl + psql 活體 + prod image build**。指令對齊 memory `project_rustapi_build_test_env`(host 無 cargo、走 dev docker image + 快取卷;DB 名 `soybean_admin_rust`)。

> ⚠️ implementer **act on actual code**:下方型別/路徑/欄名為 plan 設計值,執行時以實際編譯與 `psql \d` 為準。

---

## §0. 測試 harness(memory `project_rustapi_build_test_env`)

- **純單測**(no-DB、常規 `cargo test`):region 薄封裝、IP/XFF 擷取、兩表 ActiveModel SQL-build。
- **live-DB 整合**:`server` bin-only(無 lib.rs)→ in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`,放 `facade/`(lint 豁免)。
- **dev 容器編譯/測試前 force-touch**(WSL2 /mnt/d stale-cache 坑):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T rust-api \
    sh -c "cd /app && find server/src entity/src -name '*.rs' -exec touch {} + && cargo build -p server"
  ```
- **⚠️ 跑整合 binary 用 `--test <name>`**,勿 bare filter(會「0 passed / N filtered out」假綠)。

## §1. 純單測(test-first,red→green)

```bash
# dev 容器內(掛快取卷)
docker run --rm -v "$PWD/rust-api":/app \
  -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target \
  -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server          # region/IP-XFF 擷取 + 兩表 SQL-build(IpNetwork 真值綁 inet、欄齊)
# 守恆:entity_access_lint 全綠(新 facade 在 facade/ 目錄、middleware/login 不碰 entity::)
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server --test entity_access_lint
docker run --rm ... --entrypoint cargo rev2-admin-rust-api:dev test -p xdb   # 既有 9 測不破
```

## §2. dev stack 起 + migration 自動套

```bash
bash deploy/generate-dev-cert.sh   # 首次
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# migrate service 自動套 011/012 兩表(010 機制);驗表建好:
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "\d sys_access_log"      # client_ip 為 inet、無 deleted_at/updated_*
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_login_attempt"
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust \
  -c "\di+ idx_login_attempt_user_time idx_login_attempt_ip_time"   # FR-008 index 在
```

## §3. US1 — 已認證請求 access-log(curl + psql)

```bash
RA=http://127.0.0.1:21081
# 登入取 access token
TOKEN=$(curl -s $RA/auth/login -H 'Content-Type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | jq -r '.data.token')

# (a) 已認證請求 → sys_access_log 多 1 筆
curl -s $RA/auth/getUserInfo -H "Authorization: Bearer $TOKEN" >/dev/null
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
 "SELECT operator_id, method, path, http_status, client_ip, region IS NOT NULL AS has_region, trace_id IS NOT NULL AS has_trace
  FROM sys_access_log ORDER BY id DESC LIMIT 1;"
# 期望:operator_id=1、method=GET、path 含 getUserInfo、http_status=200、client_ip 為真實 INET(非 NULL/無 42804)、has_region=t(dev 私有 IP→内网IP)、has_trace=t

# (b) 公開 / health → 不寫 access-log
before=$(docker compose ... psql ... -tAc "SELECT count(*) FROM sys_access_log;")
curl -s $RA/route/getConstantRoutes >/dev/null ; curl -s $RA/health >/dev/null
after=$(docker compose ... psql ... -tAc "SELECT count(*) FROM sys_access_log;")
[ "$before" = "$after" ] && echo "PASS: 公開/health 不寫 access-log" || echo "FAIL"

# (c) INET 真值正確(SC-005):client_ip 可當 IP 過濾、無寫入錯
docker compose ... psql ... -c "SELECT client_ip FROM sys_access_log WHERE client_ip << '0.0.0.0/0' ORDER BY id DESC LIMIT 1;"
```

## §4. US2 — 登入嘗試成敗(curl + psql)

```bash
# 成功登入 → success=true + operator_id
curl -s $RA/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' >/dev/null
# 失敗登入 → success=false + attempted_user_name + operator_id NULL
curl -s $RA/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"wrong"}' >/dev/null
docker compose ... psql -U soybean -d soybean_admin_rust -c \
 "SELECT attempted_user_name, success, operator_id, client_ip, region IS NOT NULL AS has_region
  FROM sys_login_attempt ORDER BY id DESC LIMIT 2;"
# 期望:一筆 success=f/operator_id NULL/attempted_user_name='Super';一筆 success=t/operator_id=1
```

## §5. US3 — 脈絡忠實(psql 斷言)

```bash
# 帶 XFF header → x_forwarded_for 逐字保存
curl -s $RA/auth/getUserInfo -H "Authorization: Bearer $TOKEN" -H 'X-Forwarded-For: 1.2.4.8, 10.0.0.1' >/dev/null
docker compose ... psql ... -c "SELECT x_forwarded_for, client_ip FROM sys_access_log ORDER BY id DESC LIMIT 1;"
# 期望:x_forwarded_for='1.2.4.8, 10.0.0.1'(逐字)、client_ip=直連 peer(非 XFF leftmost,FR-006)
# 帶 X-Request-Id → trace_id 沿用
curl -s $RA/auth/getUserInfo -H "Authorization: Bearer $TOKEN" -H 'X-Request-Id: req-abc-123' >/dev/null
docker compose ... psql ... -c "SELECT trace_id FROM sys_access_log ORDER BY id DESC LIMIT 1;"  # 期望 trace_id='req-abc-123'
```

## §6. SC-004 — best-effort:稽核寫入失敗不破業務

- 以 in-crate `#[ignore]` live-DB 測模擬寫入失敗(注入 facade write Err 或對不存在欄)→ 斷言業務 handler 仍回正常 `Res<T>`、status 200。
- 或 acceptance:暫時 `REVOKE INSERT ON sys_access_log` → 打已認證請求 → 業務回應仍 200(access-log 寫失敗只 warn)。

## §7. prod runtime image build(★ 必含,brainstorm §7 / CHECKLIST §2.13 精神)

015 雖**無新 workspace crate**,但加 dep(`uuid`/`ipnetwork`/`xdb` path-dep)+ `with-ipnetwork` feature + runtime 須 COPY 11 MB `ip2region.xdb` → dev bind-mount 會遮這些缺口,**必驗 prod build**:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
# 須含:builder stage 編進新 dep(uuid/ipnetwork)、runtime stage COPY ip2region.xdb
# 驗 server 在 prod 容器找得到 xdb 檔(XDB_FILEPATH 指 image 內 COPY 位置):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d rust-api postgres redis-stack migrate --wait
# 打一個已認證請求 → psql 查 region 非 NULL(xdb 在 prod 解析得到)
```

## §8. 守恆(既有不破)

```bash
# server 既有測試 + xdb 9 + entity_access_lint 17 全綠;/health 仍 ok;migration grep 0(007 FR-009)
docker run --rm ... --entrypoint cargo rev2-admin-rust-api:dev test -p server
docker compose ... exec -T rust-api sh -c "grep -rn 'Migrator::up' server/src || echo 'server 不自動 migrate ✅'"
```

---

## CDP defer 風險自覺(brainstorm D10)
015 純後端、無新前端行為 → **無 CDP 瀏覽器驗收**。風險:curl 直送 ≠ 經 front-nginx 的真實 XFF/ConnectInfo 行為。**緩解**:§7 prod stack(經 front-nginx)補一條「經 nginx 的請求其 client_ip=nginx 私有 IP + XFF 帶真實 client」活體驗(對齊 R3/memory `xdb_region_dev_private_ip`);完整經前端的端到端留 Phase 4 wire feature。
