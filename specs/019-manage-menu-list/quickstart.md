# Quickstart: 019 manage-menu-list

## 這個 feature 做什麼
menu 改 **DB-driven**:建 `sys_menu` 業務表為選單定義單一真相,讓 **runtime 導覽(getUserRoutes)與選單管理頁(getMenuList)共讀同源**。本波 = **讀端 + runtime 來源遷移**(寫端 CRUD → 020)。可見性仍走既有 Casbin enforce(§I.2 不變)。**server-only**(base-web menu fns 已存在 upstream、不動;getUserRoutes wire 逐字不變)。

## 實作順序(server-only,鏡像 016 讀端 + 014 menu)
1. **schema**:entity `sys_menu`(~26 欄、含 jsonb buttons/query + §I.6 6 審計欄,`order` 注意保留字)+ `m20260529_000018_create_sys_menu`(create + partial unique `route_name` + **seed 6 筆逐字重現 014 樹**)+ `AuditSerialize` + lib.rs 註冊。**無 BIGSERIAL 特例、無新 crate/dep**。
2. **facade `sys_menu`**(讀端):`find_active` / `list_active_paginated`(getMenuList)/ `list_active_all`(getMenuTree/getUserRoutes 基礎)+ **純函式 `assemble_menu_tree`**(parent_id→nested,單測)。
3. **runtime 遷移(★)**:`get_user_routes` 由 in-code `business_routes()` 改讀 sys_menu → assemble_menu_tree → 映射 MenuRoute/RouteMeta → `filter_routes_for_roles`(Casbin、不改)→ `UserRoute{routes,home:"home"}`。**輸出逐字不變**。
4. **3 讀端 handler**:getMenuList/v2(flat 分頁 MenuItem)、getMenuTree(MenuTreeNode id/pId number)、getAllPages(string[] 靜態集)+ router 3 route(enforce_mw)+ `m20260529_000019_seed_menu_read_policy`(R_SUPER 3 行)。

## 跑與驗(dev stack)
```bash
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up   # 套 018/019
# 驗收:見 contracts/verification-commands.md(getUserRoutes 逐字回歸 + 3 讀端形狀/Super-only + 013/014/016/017/018 回歸 + migration 可逆 + CDP :21080 + prod build)
cargo test -p server   # 單元:assemble_menu_tree / find_active SQL / enum / DTO 序列化
```

## 關鍵紀律
- **★ 回歸鐵律**:getUserRoutes 三角色 menu ladder 與遷移前**逐字一致**(seed 須精準重現 014 樹;`props` 衍生規則 plan 釘)。
- handler 零 `entity::`(009 lint);facade 唯一 entity 管道;sys_menu 軟刪 `find_active`。
- 可見性 Casbin(migration 010)不動;讀端 Super-only(clarify Q1);constantRoutes/isRouteExist 不動。
- id 型:MenuRoute.id=string(route_name)、Menu.id=string(type-lie 同 Role)、**MenuTree.id/pId=number**(對齊 typing)。
- **server-only**(不動 base-web);寫端 CRUD/MenuAuth 編輯 → 後續。
- 無新 crate/dep;sys_menu = 既有 entity crate 模組(Dockerfile 不動)。
