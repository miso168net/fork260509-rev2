# Quickstart: 017-manage-menu-list

## Path A — 純單測（no-DB、最快）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test -p server
```
驗:`build_menu_tree`（巢狀/menu_order 排序/孤兒）、root 分頁（reuse 016 `normalize_page`、size>100→100）、`pages_for_roles`（Super real+demo / Admin real）、`route_ext` JSONB↔wire 攤平（href/query/multiTab/fixedIndexInTab）、facade `all_active` SQL-build（`deleted_at IS NULL` + `ORDER BY menu_order`）。

## Path B — 活體 manage/menu 三件（curl + psql）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate            # 套 001..017（含 016/017）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
```
- getMenuList/v2（Bearer Super）→ `{records,current,size,total=2}`、頂層 home+manage、manage 含 4 children 巢狀、id number、route_ext 攤平。
- getMenuTree（Bearer）→ bare `[{id,label,pId,children}]` 完整樹。
- getAllPages（Bearer）→ **Super:real+demo / Admin:只 real**（role-aware ★）。
- enforce:User → 403+5003 / Admin·Super → 200 / 無 token → 3333（3 endpoint）。
（完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)）

## Path C — prod build sanity（無新 dep、仍驗新表 migration + JSONB + 新 handler 過 release）

```bash
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-017 .
```

## 關鍵事實速查

- **3 endpoint**:getMenuList/v2（分頁巢狀樹）/ getMenuTree（輕量樹）/ getAllPages（role-aware 頁名 catalog）。所有 admin enforce。
- **建 sys_menu 表**:base-web `Menu` 全 21 欄（扁平 column + `route_ext`/`buttons` 兩 **JSONB**〔sea-orm `Json`/`.json_binary()`、011 先例〕）;seed 6 節點對齊 014 in-code 樹。
- **id wire = number**（v1.1.0）;`route_name`=string、unique active、casbin `v2='menu'` 對齊鍵。
- **getMenuList 分頁**:取全 active + 記憶體 `build_menu_tree` + 頂層 slice（**非 016 DB 分頁**;menu 巢狀且有界小）。
- **getAllPages role-aware**:handler `Claims.roles` 判 R_SUPER → real+demo / else real;in-code `REAL_PAGES`/`DEMO_PAGES`（對齊 base-web routes.ts、§I.5 未 grep rev1）。
- **enforce**:3 條掛 enforce_mw（route_layer）;m..017 seed 6 endpoint policy（admin 級）。
- **唯讀**;**不動 014 getUserRoutes**（仍讀 in-code）;**選單可見性續住 casbin**（不建 sys_role_menu）;buttons 定義目錄 seed null（不建 sys_menu_button）。
- **只回 active**（009）;**無新表外 crate/dep**（JSONB 用 011 先例）。
- **commit**:rust-api worktree（migration×2 + entity×1 + facade×1 + handler 擴充 + main）push fork + 外層（spec docs + SHA pin）;**不動 base-web、不動 014**。
- **menu CRUD / role-menu 授權寫入 / demo 頁 seed 成 menu / 014 改讀 sys_menu / 按鈕權限 / operator = scope 外**。
