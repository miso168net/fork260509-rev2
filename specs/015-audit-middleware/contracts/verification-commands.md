# Contract: Verification commands（C-V acceptance）

**Type**：`cargo test`（client_ip/xff 抽取 + trace_id + access-log/login-attempt ActiveModel SQL-build〔INET 真值〕純單測）+ 對 dev stack live 的活體 smoke（curl + psql）。**無 CDP**（D10、純後端）。對應 spec US1/US2/US3 + SC-001..006。

> **§0 紀律**：
> - **test-first 純單測**：client_ip/x_forwarded_for 抽取、trace_id（X-Request-Id else uuid）、`*_active_model` SQL-build（INET 欄寫真值、不再 42804）。
> - **wiring/形狀**（middleware 接線 / login handler 寫入 / ConnectInfo / xdb searcher_init）→ 活體 acceptance 覆蓋。
> - dev stack：rust-api `127.0.0.1:21081`、postgres `127.0.0.1:25432`（010 自動套含 011/012 兩表）。
> - **新 dep `uuid` + sea-orm `with-ipnetwork` + runtime COPY `ip2region.xdb` + `XDB_FILEPATH`** → §0 必含 prod runtime image build + 驗容器內 xdb 可解析。

---

## §0 既有不破 + 編譯 + prod build（守恆）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 既有 + 新單測全綠（server 56+3 ignored〔014〕+ 新增 015 client_ip/xff/trace_id/SQL-build 單測）
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test
# 009 entity-access lint 續綠（新表只經新 facade;用 --test）
docker run ... rev2-admin-rust-api:dev test -p server --test entity_access_lint   # 17 passed
# prod runtime image build sanity（新 dep uuid + with-ipnetwork〔拉 ipnetwork〕+ runtime COPY ip2region.xdb）
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-015 .
# 驗 prod image 內有 xdb 資料檔（§2.15）
docker run --rm --entrypoint sh rev2-admin-rust-api:prod-verify-015 -c 'ls -la /app/resources/ip2region.xdb'   # 存在、~11MB
# FR-009 regression：server 不自動 migrate
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"   # 無命中
```

## §1 dev stack up + 兩表 schema（前置）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套 001..012
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
# 兩表存在
$PSQL "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('sys_access_log','sys_login_attempt');"  # 2
# client_ip 為 INET 型（§2.14）
$PSQL "SELECT data_type FROM information_schema.columns WHERE table_name='sys_access_log' AND column_name='client_ip';"  # inet
# login_attempt 兩 index 存在
$PSQL "SELECT indexname FROM pg_indexes WHERE tablename='sys_login_attempt' ORDER BY indexname;"  # idx_..._user_created / idx_..._ip_created
# rust-api up（需 XDB_FILEPATH env、dev compose 已設 /app/xdb/resources/ip2region.xdb）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
curl -fsS http://127.0.0.1:21081/health   # ok（searcher_init 找到 xdb 檔、未 panic = §2.15 dev path 通）
```

## §2 US1 登入嘗試（成功+失敗、SC-002）

```bash
B=http://127.0.0.1:21081
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
# 成功登入
curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Super","password":"123456"}' >/dev/null
# 失敗登入（壞密碼）
curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Super","password":"WRONG"}' >/dev/null
# 各 1 筆;成功筆 success=t + operator_id 非空;失敗筆 success=f + attempted_user_name='Super' + operator_id NULL
$PSQL "SELECT attempted_user_name, success, operator_id IS NOT NULL AS has_op, client_ip, region IS NOT NULL AS has_region FROM sys_login_attempt ORDER BY id DESC LIMIT 2;"
# 預期(最新2筆): Super|f|f|<inet>|... 與 Super|t|t|<inet>|...
```

## §3 US2 已認證請求 access log（SC-001 / SC-005）

```bash
TOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
# 已認證請求 → 1 筆 access log
curl -fsS $B/auth/getUserInfo -H "Authorization: Bearer $TOK" >/dev/null
$PSQL "SELECT operator_id IS NOT NULL AS has_op, method, path, http_status, client_ip FROM sys_access_log ORDER BY id DESC LIMIT 1;"
# 預期: t|GET|/auth/getUserInfo|200|<inet>
# 公開端點 → 不寫 access log
BEFORE=$($PSQL "SELECT count(*) FROM sys_access_log;")
curl -fsS $B/route/getConstantRoutes >/dev/null    # 公開（014）
curl -fsS $B/health >/dev/null                      # health
AFTER=$($PSQL "SELECT count(*) FROM sys_access_log;")
echo "before=$BEFORE after=$AFTER（應相等 = 公開/health 不寫）"
# 過期/缺 token 的 authed 端點 → 不寫（operator_id 閘門）
curl -fsS $B/auth/getUserInfo >/dev/null            # 無 Bearer → 3333、不記
```

## §4 US3 來源忠實擷取（SC-003）

```bash
# 帶 X-Forwarded-For → x_forwarded_for 存原始鏈 + client_ip(直連) + region
curl -fsS $B/auth/getUserInfo -H "Authorization: Bearer $TOK" -H "X-Forwarded-For: 1.2.4.8, 10.0.0.1" >/dev/null
$PSQL "SELECT client_ip, x_forwarded_for, region IS NOT NULL AS has_region FROM sys_access_log ORDER BY id DESC LIMIT 1;"
# 預期: <直連inet> | '1.2.4.8, 10.0.0.1' | t（x_forwarded_for 逐字保存;client_ip 仍是直連 peer、非 XFF 解析）
# 不帶 XFF → x_forwarded_for NULL
curl -fsS $B/auth/getUserInfo -H "Authorization: Bearer $TOK" >/dev/null
$PSQL "SELECT x_forwarded_for IS NULL AS xff_null, client_ip FROM sys_access_log ORDER BY id DESC LIMIT 1;"  # t | <inet>
```

## §5 best-effort（SC-004）

```text
best-effort（審計寫失敗不影響業務請求）以**純單測**覆蓋較穩（live 難穩定觸發寫失敗）：
單測驗 audit-write 路徑回 Err 時 middleware/login-handler 不傳播（業務回應仍正常、僅 warn）。
〔可選 live：暫令 sys_access_log 不可寫〔權限/rename〕→ getUserInfo 仍回 200 正常 body;還原。非必跑。〕
```

---

## 驗收紀律總結

- §0 既有不破 + lint(--test) + **prod build sanity + 驗容器內 xdb 檔（§2.15）** + FR-009 regression
- §1 兩表 + INET 型 + 兩 index 經 010 自動套;rust-api boot 找到 xdb（searcher_init）
- §2 登入成敗各 1 筆 sys_login_attempt（attempted_user_name + success + operator_id + INET）（US1/SC-002）
- §3 已認證 1 筆 sys_access_log + **公開/health 不寫**（US2/SC-001/SC-005）
- §4 x_forwarded_for 原始鏈 + client_ip 直連 + region（US3/SC-003）
- §5 best-effort（SC-004，純單測）
- client_ip/xff 抽取 + trace_id + INET SQL-build 純單測 test-first;wiring 由活體覆蓋;**無 CDP**
