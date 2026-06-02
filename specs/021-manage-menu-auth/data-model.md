# Data Model: 021 manage-menu-auth (Phase 1)

> 命名/型以 grep 實證為準([research.md](./research.md))。**actual code 命名優先於 spec 推測**。**無新建表**:ALTER sys_role +home(business 欄、§I.6 審計欄 018 已備);casbin_rule menu policy runtime 編輯(不改 schema)。

## 1. sys_role(ALTER +home,不建表)

`entity/src/sys_role.rs::Model` 加 1 欄(其餘不改):

| 欄 | 型 | 說明 |
|---|---|---|
| `home` | `Option<String>` | 角色登入後落地頁的 **route name**(LastLevelRouteKey、如 `"home"`)。**非 page key**(R6 修正)、**非 menu id**。nullable;seed 回填 `'home'` |

- migration `m20260529_000021`:`ALTER TABLE sys_role ADD COLUMN home varchar NULL`(鏡像 016 `add_column(ColumnDef::new(SysRole::Home).string().null())`)+ `UPDATE sys_role SET home='home'`(回填、保未編輯逐字基線)+ down `DROP COLUMN home`。
- 審計:home 編輯走 sys_role update §I.6 成對(updated_at·by);**不需** §I.6 新欄(018 已備)。

## 2. casbin_rule menu-visibility policy(runtime 編輯,不改 schema)

menu policy 列 = `(ptype='p', v0=role_code, v1=route_name, v2='menu')`(010 既有 9 行 seed)。**021 改為 runtime 增刪**(非 migration):

```text
# 寫(updateRoleMenu):enforcer.write() 鎖內
before = read_role_menu_route_names(enforcer, role)          # audit 快照(get_filtered_policy(0,[role,"","menu"]) 或 get_policy 過濾;impl 確認簽名)
remove_filtered_policy(0, [role, "", "menu"])                # 空字串=wildcard、adapter skip-empty → 只刪該 role 的 v2='menu' 列、不碰 endpoint policy
add_policies( route_names.map(|rn| [role, rn, "menu"]) )      # stock adapter auto_save 同步 memory+DB
# 讀(getRoleMenuIds):read_role_menu_route_names(enforcer, role) → route_names → ids_for_route_names → id[]
```

- **menu id ↔ route_name**:modal 用 menu id(number、NTree key-field=id);policy 用 route_name → 對映必經 sys_menu(active-only)。
- **add_policies 非單 txn**(adapter loop、部分失敗罕);remove+add 中途失敗 → 該角色暫態不完整、下次編輯 + redis reload 修正(acceptance 記)。
- **不動**:010 既有 9 行為起始 seed;endpoint policy(v2=method)、009/013/017/019/020 write/read policy 不碰。

## 3. facade / 寫路徑

- **facade `sys_menu`**(擴,純對映、active-only、不 re-export Entity):
  - `route_names_for_ids(db, ids: &[i64]) -> Result<Vec<String>, DbErr>`(updateRoleMenu:id[]→route_name 寫 policy;濾 active、未知/軟刪 id 略過)。
  - `ids_for_route_names(db, rns: &[String]) -> Result<Vec<i64>, DbErr>`(getRoleMenuIds:policy route_name→id[] 預載;濾 active)。
- **facade `sys_role`**(擴):`update_role_home_query(id, home, operator) -> UpdateMany`(col_expr `Home` + `UpdatedAt=current_timestamp` + `UpdatedBy(operator)`、§I.6 成對、純 seam 可測)+ `update_role_home(db, id, home, operator) -> Result<bool, DbErr>`(load active→Ok(false) + exec + 重查 + audit Update);`find_active_by_id` 既有(Model 含 home)。home 讀直接由 find_active_by_id。
- **facade `sys_user_role`**(改):`roles_for_user` **加 `ORDER BY sys_role.id ASC`**(或新 `roles_for_user_ordered(db, user_id)->Vec<(i64 id, String code)>`)→ 供 getUserRoutes per-role home 取「第一 active 角色」確定序;enforce_mw 用的 roles_for_user 取序不影響 union 結果(冪等)。
- **menu-auth policy 寫路徑**(handler 或 `auth/menu_auth.rs` 小模組,走 enforcer + 011 audit + publish):
  - `set_role_menu(state, role_code, route_names, operator)`:`enforcer.write()` → before 快照 → remove_filtered + add_policies → 011 AuditEvent(operation=Update、entity_table="casbin_rule"、entity_id=role 對映 i64?或 None、payload_before/after=route_name 集、operator)→ PUBLISH `casbin:policy:invalidate`。
  - `get_role_menu_route_names(enforcer, role_code) -> Vec<String>`(讀該 role v2='menu' 列;impl 確認 get_filtered_policy 簽名)。
- **redis**(`infra/redis.rs` 或新 `auth/policy_watcher.rs`):`spawn_policy_watcher(client, enforcer)`(boot tokio::spawn、`client.get_async_pubsub()` 獨立連線、SUBSCRIBE `casbin:policy:invalidate`、收到 `enforcer.write()+load_policy()`、error-log 不靜默)+ `publish_policy_invalidate(&mut redis_mgr)`。
- **getUserRoutes**(`handler/route.rs`):home 由 `"home".into()`(:86)改 → 取 roles_for_user_ordered 第一 active 角色 → `sys_role.home`(該角色 home)、None/查無 → `"home"` fallback。menu 過濾不改。

## 4. handler 寫/讀端(`handler/system_manage.rs` 擴,鏡像既有,零 `entity::`)

```text
get_role_menu(State, Extension<RequestContext>, Query<RoleIdReq>) -> Res<Vec<i64>>        // GET、回 menu id[](number wire、對齊 MenuTree.id number)
update_role_menu(State, Extension<RequestContext>, Json<RoleMenuReq>) -> Res<()>          // POST
get_role_home(State, Extension<RequestContext>, Query<RoleIdReq>) -> Res<String>          // GET、回 home route name
update_role_home(State, Extension<RequestContext>, Json<RoleHomeReq>) -> Res<()>          // POST
```

- **operator**:`ctx.operator_id`→None 回 `Internal(5000)`(沿既有)。
- **roleId 解析**:wire 來自 modal `roleId:number`;DTO 收 **彈性(number|string→i64)**(沿 020 `de_parent_id` 經驗、防 §I.3 id=string vs modal number 落差)或 String parse i64;非法→2222。
- **menuIds**:`Vec<i64>`(number wire、對齊 MenuTree.id number);updateRoleMenu 收 → route_names_for_ids → set_role_menu。
- **自鎖 guard(FR-006/M5,code-based、鏡像 020 is_seed)**:`update_role_menu` 對 **R_SUPER** 角色,新集 MUST 含 `manage_menu`(選單管理頁)的可見性 → 缺則 2222「不可移除超级管理员的菜单管理可见性」(防 Super 自鎖)。**範圍 = leaf `manage_menu` 單一**(非 6 種子):父層 `manage` 無可見性 policy(010 不 seed、可見度由 `route/menu.rs` filter_routes tree-prune 從「有可見子」推導)→ 021 可見性 guard **無從 pin 父層**(無 `(role,'manage','menu')` 列)、leaf-only 是唯一可行且充分。**充分性依賴兩條既有 invariant**:(i) `manage` ∈ 020 `is_seed_menu`〔禁刪禁停用、row 恆存活〕(ii) updateMenu 不更新 parent_id〔FR-011/D2、manage_menu 不被搬離 `manage`〕;二者鬆動則需重檢 guard。非 R_SUPER 角色不受此限。
- **業務錯誤**:角色不存在/非法 roleId/menuIds 含全非法 → 2222;Db→5000+log。
- **DTO**(camelCase):`RoleIdReq{role_id}`(query)、`RoleMenuReq{role_id, menu_ids:Vec<i64>}`、`RoleHomeReq{role_id, home:String}`。

## 5. casbin write policy(端點授權,migration 021)
- `m20260529_000021`(ALTER sys_role +home **同檔或分檔** + seed write-policy):casbin **4 行 R_SUPER**(`/systemManage/getRoleMenu` GET·`/systemManage/updateRoleMenu` POST·`/systemManage/getRoleHome` GET·`/systemManage/updateRoleHome` POST,ON CONFLICT DO NOTHING;down 精準 v1 IN 4 path)〔URL 命名 plan/impl 與 base-web wrapper 對齊敲定〕。lib.rs 註冊 000020 後。
- **010 menu policy(9 行)/ 009·013·017·019·020 policy 不動**;4 route 掛 `enforce_mw`(main.rs)。

## 6. wire 三端對齊

| 概念 | base-web modal 送/收 | rust DTO | facade/policy |
|---|---|---|---|
| roleId | number(rowData.id) | 彈性→i64 | role_code(由 id 查 sys_role) |
| getRoleMenuIds | checks=number[] | `Res<Vec<i64>>`(number) | policy route_name→id[] |
| updateRoleMenu | checks(number[])+roleId | RoleMenuReq | id[]→route_name→set policy |
| getRoleHome | home=string | `Res<String>` | sys_role.home(route name) |
| updateRoleHome | home string + roleId | RoleHomeReq | sys_role.home update §I.6 |
| home 值 | **route name**(LastLevelRouteKey、非 page key) | String | sys_role.home varchar |

## 7. 不動項 / 回歸
- getUserRoutes menu 過濾(menu_visible enforce union/tree-prune)不改;**未編輯時 home 仍 'home'(seed)+ 可見性仍 010 9 行 → 三角色 getUserRoutes 逐字 == 014/019 基線**(回歸鐵律)。
- 019 三讀端、020 寫端、013/018 enforce 階梯、constant routes 不動。
- **role_code↔i64 對映**:roleId(i64)→ sys_role.code(policy v0 用 code、非 id)→ 須由 roleId 查 active sys_role.code(facade find_active_by_id);policy 一律用 role **code**(R_SUPER 等),不用 id。
