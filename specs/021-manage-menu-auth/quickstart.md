# Quickstart: 021 manage-menu-auth

## 這個 feature 做什麼
角色管理頁 `menu-auth-modal` 的 **MenuAuth**:維運者(Super)runtime 編輯「**哪角色看哪選單**」(改既有 Casbin menu-visibility policy)+ 設「**角色落地頁 home**」(per-role)。變更**即時反映**於該角色 getUserRoutes/nav(無重啟)、**跨實例一致**(redis pub-sub `casbin:policy:invalidate`)。閉合 menu arc(019 讀→020 寫→021 可見性指派)、解 020「新選單指派可見性前不顯 nav」缺口。**不建表**(ALTER sys_role +home);**不 fork adapter、無 §11.6 amendment**(方案 1)。

## 實作順序(鏡像 020 + 用 casbin MgmtApi/redis 既有)
1. **migration `m20260529_000021`**:ALTER sys_role +`home` varchar null(seed 回填 'home')+ casbin write-policy seed 4 行 R_SUPER(getRoleMenu/updateRoleMenu/getRoleHome/updateRoleHome)+ lib.rs 註冊。
2. **facade**:sys_menu `route_names_for_ids`/`ids_for_route_names`(active 對映、單測)+ sys_role `update_role_home_query`/`update_role_home`(§I.6 成對、單測)+ sys_user_role `roles_for_user` 加 `ORDER BY role_id ASC`(或 `roles_for_user_ordered`、單測取序)。
3. **menu-auth policy 寫路徑**(`auth/menu_auth.rs` 或 handler):`set_role_menu`(enforcer.write() + before 快照 + `remove_filtered_policy(0,[role,"","menu"])` + `add_policies` + 011 audit + PUBLISH)+ `get_role_menu_route_names`(讀 role v2='menu' 列;確認 get_filtered_policy 簽名)。
4. **redis subscriber**:boot `tokio::spawn` policy_watcher(`client.get_async_pubsub()` 獨立連線、SUBSCRIBE → `enforcer.write()+load_policy()`、error-log)。
5. **handler**(system_manage.rs):get_role_menu/update_role_menu/get_role_home/update_role_home(operator 由 ctx、roleId 彈性→i64 查 role code、menuIds id[]→route_name、自鎖 guard〔R_SUPER 須留 manage_menu〕、業務錯誤 2222)。
6. **getUserRoutes**(route/menu.rs):home 由寫死 `"home"` 改取 roles_for_user_ordered 第一 active 角色 sys_role.home(None→'home');menu 過濾不改。
7. **routes**(main.rs):4 route + enforce_mw。
8. **base-web**(MODAL-WIRING ★ + WRAPPER):rev2-system-manage.ts +4 fetch fn + menu-auth-modal 接 getHome/updateHome/getChecks/handleSubmit(只改 `// request`)。

## 跑與驗(dev stack)
```bash
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up   # 套 021
# 驗收:contracts/verification-commands.md(指派 menu→getUserRoutes 即時反映 + 移除消失 + redis reload + home + 自鎖 guard + Super-only + 逐字回歸 + migration 可逆 + CDP)
cargo test -p server   # 單元:id↔route_name 對映 / roles 取序 / 自鎖 guard / home update SQL
```

## 關鍵紀律
- **menu 走 Casbin enforce**(§I.2):本 feature = runtime 編輯該 policy;getUserRoutes 過濾邏輯**不改**。
- **policy 用 role code**(v0=R_SUPER 等)**非 id** → roleId(i64)須查 sys_role.code。
- **`remove_filtered_policy(0,[role,"","menu"])`**:空字串=wildcard(adapter skip-empty)→ 只清該 role 的 menu 列、**不碰 endpoint policy**(impl 跑一次確認)。
- **home = route name(LastLevelRouteKey)非 page key**(R6);sys_role.home varchar、未編輯 'home' 保逐字基線。
- **roles_for_user 須加 ORDER BY role_id ASC**(現無序)→ per-role home 取第一 active 角色確定序。
- **自鎖防護**(M5):updateRoleMenu(R_SUPER) 須留 manage_menu 可見性、否則 2222。
- **redis 方案 B**:publish + subscriber reload(消費閒置 AppState.redis、實現 Phase 3 #3)。
- §I.6 成對審計(home update);handler/route 零 `entity::`(009 lint);業務錯誤一律 2222。
- **無新 crate/dep**;**不建表**(ALTER sys_role +home);**不 fork adapter、無 §11.6 amendment**;收尾兩段式 commit ×2 worktree(rust-api + base-web)+ 外層 SHA pin。
