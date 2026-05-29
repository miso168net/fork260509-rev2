# Contract: Verification commands（C-V acceptance）

**Type**：`cargo test`（純邏輯單測 + 既有不破）+ 對 dev stack live postgres 的活體 smoke（curl + psql、沿 011 in-crate `#[ignore]`+env-gate）+ **CDP browser 登入 smoke**（D10）。對應 spec User Stories + SC-001..004。

> **§0 — [CLAUDE.md §3](../../../CLAUDE.md) 紀律**：
> - **純函式邏輯 test-first**（JWT 簽/驗、argon2 verify、button 矩陣、`Res<T>` 泛型、enforce 決策）。
> - **wiring/形狀**（handler + middleware）→ 活體 acceptance 覆蓋。
> - dev stack：rust-api `127.0.0.1:21081`、postgres `127.0.0.1:25432`（compose 內 `postgres:5432`、010 自動套表）、front-nginx `:21080`/`:21443`、base-web。
> - **§0.1 harness**：live-DB 測試 in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`（沿 011）；docker `--network rev2-admin_rev2_net -e DATABASE_URL=...` 跑 `-- --ignored`。

---

## §0 既有不破 + 編譯（守恆）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 既有 + 新單測全綠(server 既有 25+3 ignored + 17 lint + xdb 9 + 新增 013 純邏輯單測)
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test
# 009 entity-access lint 續綠(新 entity sys_role/sys_user_role 走 facade)
docker run ... rev2-admin-rust-api:dev test -p server entity_access_lint   # 預期: 綠
# prod runtime image build sanity(新增 jsonwebtoken dep;無新 workspace crate、但跨 feature 守則保險)
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify .
# FR-009 regression: server 不自動 migrate
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"   # 預期: 無命中
```

## §1 dev stack up + migration 自動套（前置）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套 001..009(含新 sys_role/sys_user_role/nick_name/casbin seed)
# schema + seed 確認
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
$PSQL "SELECT to_regclass('public.sys_role'), to_regclass('public.sys_user_role');"   # 非 null
$PSQL "SELECT code FROM sys_role WHERE deleted_at IS NULL ORDER BY id;"                # R_SUPER/R_ADMIN/R_USER_COMMON
$PSQL "SELECT nick_name FROM sys_user WHERE id=3;"                                     # User01
$PSQL "SELECT ptype,v0,v1,v2 FROM casbin_rule ORDER BY id;"                            # p,R_SUPER,/systemManage/getUserList,GET + R_ADMIN
```

## §2 login + getUserInfo 活體（US1 / SC-001）

```bash
docker compose ... up -d rust-api   # 帶起 rust-api(depends_on migrate 完成)
# login Super → token
TOK=$(curl -fsS -X POST http://127.0.0.1:21081/auth/login \
  -H 'content-type: application/json' -d '{"userName":"Super","password":"123456"}' \
  | tee /dev/stderr | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d["code"]=="0000";print(d["data"]["token"])')
# getUserInfo Bearer → {userId:"1",userName:"Super",roles:["R_SUPER"],buttons:[...]}
curl -fsS http://127.0.0.1:21081/auth/getUserInfo -H "Authorization: Bearer $TOK"
# 預期: code 0000、data.userId="1"、userName="Super"、roles=["R_SUPER"]、buttons 含 B_CODE1/2/3
# User → User01 alias 驗
TOKU=$(curl -fsS -X POST http://127.0.0.1:21081/auth/login -H 'content-type: application/json' \
  -d '{"userName":"User","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -fsS http://127.0.0.1:21081/auth/getUserInfo -H "Authorization: Bearer $TOKU"
# 預期: data.userName="User01"(alias!)、roles=["R_USER_COMMON"]、buttons=["B_CODE3"]
# login 帳密錯 → 1000
curl -fsS -X POST http://127.0.0.1:21081/auth/login -H 'content-type: application/json' \
  -d '{"userName":"Super","password":"wrong"}'   # 預期: code "1000"、data null
# token 缺/壞 → 3333
curl -fsS http://127.0.0.1:21081/auth/getUserInfo                          # 無 Bearer → code "3333"
curl -fsS http://127.0.0.1:21081/auth/getUserInfo -H "Authorization: Bearer bad.token"  # code "3333"
```

## §3 enforce allow + deny（US2 / SC-002）

```bash
# Super(R_SUPER allow) → 200
curl -fsS http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOK"     # 200 + stub body
# Admin(R_ADMIN allow) → 200
TOKA=$(curl -fsS -X POST http://127.0.0.1:21081/auth/login -H 'content-type: application/json' \
  -d '{"userName":"Admin","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -fsS http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKA"    # 200
# User(R_USER_COMMON NOT seeded) → 403 deny
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKU"   # 預期: 403
curl -sS http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKU"     # envelope code=5003(權限不足、analyze C2 釘)
```

## §4 refresh（US3 / SC-003）

```bash
RT=$(curl -fsS -X POST http://127.0.0.1:21081/auth/login -H 'content-type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["refreshToken"])')
# 有效 refresh → 新 token
curl -fsS -X POST http://127.0.0.1:21081/auth/refreshToken -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$RT\"}"   # 預期: code 0000、data.token 新值
# 壞 refresh → 8888(絕不 3333/9999/9998)
curl -fsS -X POST http://127.0.0.1:21081/auth/refreshToken -H 'content-type: application/json' \
  -d '{"refreshToken":"bad.refresh.token"}'   # 預期: code "8888"(非 3333/9999/9998)
```

## §5 CDP browser 登入 smoke（US1 / SC-001、D10）

```text
前置: base-web 指向 rev2 rust-api(BASE-WEB-ADAPT .env: VITE_SERVICE_BASE_URL → dev 直連 :21081 或 front-nginx /api;
      vite build-time env → dev server 讀新 .env 或重 build;連動 CHECKLIST §2.8/§5.5)。
步驟(CDP):
  1. 開 base-web 登入頁(dev: http://127.0.0.1:<base-web port> 或 front-nginx)
  2. 點「超级管理员」quick-fill(或填 Super/123456)→ 送出
  3. 斷言: 登入成功跳轉(非停在 login)、無錯誤 toast/modal
  4. 斷言: getUserInfo 已觸發、使用者資料渲染(userName/roles 對齊;envelope unwrap/code 分流/LS SOY_token 寫入正確)
  5. (deny 驗、可選) User 登入後訪問需 R_ADMIN+ 的功能 → 前端收 403/5xxx toast
預期: base-web 登入流程對 rev2 端到端跑通(curl 直送 ≠ browser 內 wire、本 smoke 證 envelope/code/token 真對齊)。
⚠️ 若 base-web build/設定阻礙致 CDP 臨時 defer → spec 已明示風險、Follow-up 登記補測(CLAUDE.md §3)。
```

## §6 scope 邊界（FR-011 / 守恆）

```bash
# 未做完整 policy 矩陣/全路由 enforce(只 1 條示範路由 seed)
$PSQL "SELECT count(*) FROM casbin_rule;"   # 預期: 2(僅示範路由 × 2 role)
# casbin_rule 無 deleted_at(soft-delete 留後續)
$PSQL "SELECT count(*) FROM information_schema.columns WHERE table_name='casbin_rule' AND column_name='deleted_at';"  # 0
# 未做 login audit(無新 sys_operation_log 寫入路徑接 login)
grep -rn "mutate_in_txn\|AuditEvent" rust-api/server/src/handler/ 2>/dev/null ; echo "exit:$?"   # 預期: handler 不寫 audit
# /health 不破
curl -fsS http://127.0.0.1:21081/health   # ok
```

---

## 驗收紀律總結

- §0 既有不破 + lint 續綠 + prod build sanity + FR-009 regression
- §1 schema/seed 經 010 自動套（sys_role/sys_user_role/nick_name/casbin seed）
- §2 login + getUserInfo（US1/SC-001）+ User→User01 alias + 1000/3333 code
- §3 enforce allow(Super/Admin) + **deny(User 403)**（US2/SC-002）
- §4 refresh（US3/SC-003）+ 8888（絕不 3333/9999/9998）
- §5 **CDP browser 登入 smoke**（D10、第一條真 base-web wire、curl ≠ browser）
- §6 scope 邊界（無完整矩陣 / casbin_rule 無 deleted_at / 無 login audit）
- 純邏輯單測（JWT/argon2/button 矩陣/Res<T>/enforce 決策）test-first；wiring 由活體覆蓋
