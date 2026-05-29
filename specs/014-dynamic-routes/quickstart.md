# Quickstart: 014-dynamic-routes

> 開發/驗收最短路徑。完整驗收見 [contracts/verification-commands.md](./contracts/verification-commands.md);設計見 [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)。

## Path A — enforce 決策 + tree-prune 單測（test-first）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test -p server menu
```
驗:`filter_routes_for_roles`(Super→全 / Admin→home+manage〔user,user-detail〕/ User→只 home;父層無可見 child omit)、`route_exists_for_roles`(enforce-filtered)。用 `MemoryAdapter` seed 同 D3 menu policy。

## Path B — 3 endpoint curl（dev stack）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate      # 套 001..010(含 menu policy seed)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
# 公開 constant
curl -fsS :21081/route/getConstantRoutes | python3 -m json.tool
# 依角色 user routes(見 contracts §3 取 TOK/TOKA/TOKU)
curl -fsS :21081/route/getUserRoutes -H "Authorization: Bearer $TOK" | python3 -m json.tool
# 存在性 allow+deny
curl -fsS ":21081/route/isRouteExist?routeName=manage_role" -H "Authorization: Bearer $TOKU"   # false
```

## Path C — CDP dynamic-mode menu 差異（D8、firm acceptance）

```bash
# 1. base-web .env 翻 dynamic(兩段式 commit)
#    base-web/.env: VITE_AUTH_ROUTE_MODE=static → dynamic
# 2. base-web 重啟讀新 env(主 dev stack)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d base-web
# 3. ⚠️ 翻 dynamic 前先 curl 驗 Path B 三 endpoint 全綠(getConstantRoutes 每次 reload 觸發)
# 4. CDP(9229,沿 013 tests/ harness):reload → 登入 Super〔側邊欄含 系统管理〕vs User〔只 首页〕
```

## 關鍵事實速查

- **3 endpoint**:`/route/getConstantRoutes`(公開)/`/route/getUserRoutes`(JWT、enforce filter)/`/route/isRouteExist`(JWT、enforce)。
- **menu 走 Casbin enforce**(§I.2):menu-visibility policy `p,role,route_name,menu`(9 rows seed、經 010)+ 013 enforcer;父層 tree-prune 算。
- **route 定義程式內**(`server/src/route/menu.rs`),component 用 elegant-router `$` 複合格式(`layout.base$view.home`);**精確對齊 base-web `elegant/routes.ts`**(最高風險)。
- **無新 dep / 無新表 / 無新 crate**;重用 013 enforcer/jwt/bearer/roles_for_user + 008 envelope。
- **兩段式 commit**:rust-api worktree(route 模組 + migration 010)+ base-web `.env`。
- **dynamic mode 副作用**:demo menu 不送 → §11.5 隱藏 demo moot。
