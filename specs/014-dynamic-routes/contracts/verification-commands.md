# Contract: Verification commands（C-V acceptance）

**Type**：`cargo test`（enforce 決策 + tree-prune 單測 + 既有不破）+ 對 dev stack live 的活體 smoke（curl + psql）+ **CDP dynamic-mode browser smoke**（D8）。對應 spec User Stories + SC-001..004。

> **§0 — [CLAUDE.md §3](../../../CLAUDE.md) 紀律**：
> - **enforce 決策 + tree-prune test-first**（`filter_routes_for_roles` / `route_exists_for_roles`,用 `MemoryAdapter` seed 同 D3 menu policy）。
> - **wiring/形狀**（3 handler + router）→ 活體 acceptance 覆蓋。
> - dev stack：rust-api `127.0.0.1:21081`、base-web `127.0.0.1:21079`、postgres `127.0.0.1:25432`（010 自動套含 014 menu policy）。
> - **lint 紀律**：`cargo test -p server --test entity_access_lint`(用 `--test`、bare filter 跑 0 tests 假綠)。

---

## §0 既有不破 + 編譯（守恆）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 既有 + 新單測全綠(server 50+3 ignored〔013〕+ 17 lint + xdb 9 + 新增 014 enforce 決策/tree-prune 單測)
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test
# 009 entity-access lint 續綠(route 模組不碰 entity::;用 --test、非 bare filter)
docker run ... rev2-admin-rust-api:dev test -p server --test entity_access_lint   # 17 passed
# prod runtime image build sanity(無新 dep、跨 feature 守則保險)
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-014 .
# FR-009 regression: server 不自動 migrate
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"   # 無命中
```

## §1 dev stack up + menu policy seed（前置）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套 001..010(含 014 menu policy seed)
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
# 014 menu-visibility policy(act=menu)= 9 rows
$PSQL "SELECT v0,v1 FROM casbin_rule WHERE v2='menu' ORDER BY v0,v1;"   # R_ADMIN:home/manage_user/manage_user-detail;R_SUPER:home/manage_*;R_USER_COMMON:home
$PSQL "SELECT count(*) FROM casbin_rule WHERE v2='menu';"               # 9
$PSQL "SELECT count(*) FROM casbin_rule WHERE v2='GET';"                # 2(013 endpoint policy 不受影響)
```

## §2 getConstantRoutes 公開（US2 / SC-002）

```bash
docker compose ... up -d rust-api
# 公開(無 Bearer)→ 5 條 constant route
curl -fsS http://127.0.0.1:21081/route/getConstantRoutes | python3 -m json.tool
# 預期: code "0000"、data 含 403/404/500/login/iframe-page,component 為 layout.blank$view.* / layout.base$view.iframe-page,meta.constant=true
```

## §3 getUserRoutes 依角色（US1 / SC-001）

```bash
TOK=$(curl -fsS -X POST :21081/auth/login -H 'content-type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
TOKA=$(curl -fsS -X POST :21081/auth/login -H 'content-type: application/json' -d '{"userName":"Admin","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
TOKU=$(curl -fsS -X POST :21081/auth/login -H 'content-type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
# Super → home + manage(user/role/menu/user-detail) + home:"home"
curl -fsS :21081/route/getUserRoutes -H "Authorization: Bearer $TOK" | python3 -m json.tool
# 預期: data.home="home"、data.routes 含 home + manage〔4 children〕
# Admin → home + manage(僅 user + user-detail;無 role/menu)
curl -fsS :21081/route/getUserRoutes -H "Authorization: Bearer $TOKA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("home:",d["home"]);print("top:",[r["name"] for r in d["routes"]]);print("manage children:",[c["name"] for r in d["routes"] if r["name"]=="manage" for c in r.get("children",[])])'
# 預期: top=[home,manage]、manage children=[manage_user,manage_user-detail]
# User → 只 home(無 manage 父層、tree-prune omit)
curl -fsS :21081/route/getUserRoutes -H "Authorization: Bearer $TOKU" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("top:",[r["name"] for r in d["routes"]])'
# 預期: top=[home](無 manage)
# token 缺/壞 → 3333
curl -fsS :21081/route/getUserRoutes ; echo                                   # code "3333"
curl -fsS :21081/route/getUserRoutes -H "Authorization: Bearer bad.token"     # code "3333"
```

## §4 isRouteExist allow + deny（US3 / SC-003）

```bash
# Super:manage_role → true;User:manage_role → false;皆 home → true
curl -fsS ":21081/route/isRouteExist?routeName=manage_role" -H "Authorization: Bearer $TOK"   # data true
curl -fsS ":21081/route/isRouteExist?routeName=manage_role" -H "Authorization: Bearer $TOKU"  # data false(deny)
curl -fsS ":21081/route/isRouteExist?routeName=home" -H "Authorization: Bearer $TOKU"         # data true
```

## §5 CDP dynamic-mode browser smoke（US1 / SC-001、D8）

```text
前置: base-web `.env` `VITE_AUTH_ROUTE_MODE=dynamic`(BASE-WEB-ADAPT,兩段式 commit)+ base-web 重啟讀新 env;
      ⚠️ 翻 dynamic 前先 curl 驗 §2/§3 三 endpoint 全綠(getConstantRoutes 每次 reload 觸發、沒做好 reload 會壞)。
步驟(CDP 9229,沿 013 tests/ harness):
  1. base-web reload → getConstantRoutes 觸發、登入頁正常顯示
  2. 登入 Super → getUserRoutes → 側邊欄含「首页」+「系统管理」(用户/角色/菜单管理)
  3. 登出 → 登入 User → getUserRoutes → 側邊欄**只「首页」**(無「系统管理」群組 = menu deny 證明)
  4. 斷言: 兩角色側邊欄 menu 項不同(role-filtered);Network 確認 getUserRoutes 打 rust-api、回不同 routes
預期: dynamic mode 後端控 menu 端到端跑通、依角色不同(curl ≠ browser 內 wire,本 smoke 證 base-web 真消費 + 渲染 menu 樹)。
⚠️ 若 route shape 不對 base-web 渲染不出 menu → 對照 §3 curl 的 component/meta 與 base-web elegant/routes.ts 逐欄校。
```

---

## 驗收紀律總結

- §0 既有不破 + lint(--test)續綠 + prod build sanity + FR-009 regression
- §1 menu policy seed 經 010 自動套(9 rows、act=menu)
- §2 getConstantRoutes 公開 5 條(US2/SC-002)
- §3 getUserRoutes 三角色不同 + home(US1/SC-001)+ 3333
- §4 isRouteExist allow(Super manage_role)+ **deny(User manage_role false)**(US3/SC-003)
- §5 **CDP dynamic-mode browser smoke**(D8、menu 依角色端到端、User 只首页 = deny)
- enforce 決策 + tree-prune 純單測 test-first;wiring 由活體覆蓋
