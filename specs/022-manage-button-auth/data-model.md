# Data Model: Button Permission Authorization (022) — Phase 1

> 拍定 research.md 留給本檔的 deferred 決策。所有 file:line 命名以 actual code 為準(research.md grep 實證)。**不建表、不加欄、無新 crate**;單一 migration 022 只 seed。

## 1. 可用按鈕 registry(sys_menu.buttons,K1 per-menu 來源)

按鈕定義存於既有 `sys_menu.buttons: Option<Json>`(`Vec<MenuButton{code,desc}>`,base-web `MenuButton={code,desc}` 對齊)。本波 seed 兩處:

### 1.1 pilot — `manage_user.buttons`(UPDATE 既有 seed row)

| code | desc |
|---|---|
| `user:add` | 新增用户 |
| `user:edit` | 编辑用户 |
| `user:delete` | 删除用户 |

> 對齊用戶管理頁操作鈕(`views/manage/user/index.vue` row 编辑/删除 + toolbar 新增)。批量删除本波不定義/不 gate(FR-009 後續)。

### 1.2 demo 救活 — `function_toggle-auth.buttons`(新 seed row 帶)

| code | desc |
|---|---|
| `B_CODE1` | 超级管理员可见 |
| `B_CODE2` | 管理员可见 |
| `B_CODE3` | 管理员或普通用户可见 |

> 逐字保留既有 B_CODE(R0 回歸基線);desc 對齊 toggle-auth i18n(superAdminVisible/adminVisible)。

### 1.3 可用按鈕清單(getAllButtons 聚合)

`sys_menu::list_active_all` → 各 row `buttons` JSON flatten → **dedup by code** → `Vec<ButtonItem{code,desc}>`。本波 active 選單按鈕全集 = 上述 6 碼(manage_role/manage_menu/home 等 buttons 仍 NULL)。**canonical 順序 = code 字典序**(見 §4)。

## 2. sys_menu seed(救活 toggle-auth;migration 022)

| 欄 | `function`(父) | `function_toggle-auth`(子) |
|---|---|---|
| parent_id | NULL(top-level) | `(SELECT id FROM sys_menu WHERE route_name='function' AND deleted_at IS NULL)` |
| route_name | `function` | `function_toggle-auth` |
| menu_type | 1(directory) | 2(menu) |
| menu_name | `function` | `function_toggle-auth` |
| route_path | `/function` | `/function/toggle-auth` |
| component | `layout.base` | `view.function_toggle-auth` |
| icon | `icon-park-outline:all-application` | `ic:round-construction` |
| icon_type | 1 | 1 |
| i18n_key | `route.function` | `route.function_toggle-auth` |
| order | 6 | 4 |
| status | 1 | 1 |
| hide_in_menu / keep_alive / active_menu | NULL | NULL |
| buttons | NULL | JSON(§1.2 三碼) |
| §I.6 審計欄 | created_at=now / created_by=NULL(system seed) | 同左 |

> **route_path / component / i18n_key 逐字對齊 base-web elegant route**(`router/elegant/routes.ts`),否則 SPA resolve 不到頁面。`order` 對齊 elegant(function=6 / toggle-auth=4)。

## 3. Casbin policy seed(migration 022)

### 3.1 menu policy(toggle-auth 可達,C2 三角色)— `(p, role, route_name, 'menu')`

```
('p','R_SUPER','function','menu'), ('p','R_ADMIN','function','menu'), ('p','R_USER_COMMON','function','menu'),
('p','R_SUPER','function_toggle-auth','menu'), ('p','R_ADMIN','function_toggle-auth','menu'), ('p','R_USER_COMMON','function_toggle-auth','menu')
```
> 父 `function` 也須給 policy(getUserRoutes tree-prune:父無自身 enforce、但需存在於 active 選單樹 + 至少一子可見才渲染;為穩妥三角色父子皆 seed)。

### 3.2 button policy(grant)— `(p, role, button_code, 'button')`

| role | granted button codes |
|---|---|
| `R_SUPER` | B_CODE1, B_CODE2, B_CODE3, user:add, user:edit, user:delete |
| `R_ADMIN` | B_CODE2, B_CODE3, user:edit |
| `R_USER_COMMON` | B_CODE3 |

> **B_CODE 部分逐字重現 `buttons.rs` matrix**(R0 回歸基線);**user:\* 分布刻意製造可見差異**:Super 全給(用戶頁見 新增/编辑/删除)、Admin 只 user:edit(只見 编辑)、User 無(且本不可達 manage_user)。

### 3.3 down(migration 022 revert)

精準刪上述 6 menu policy(by v1 IN ('function','function_toggle-auth') AND v2='menu')+ button policy(by v2='button' AND v1 IN 上述 9 碼)+ DELETE sys_menu 2 row + UPDATE manage_user.buttons=NULL。**不踩** 010 menu(9)/ 017 role(4)/ 019 read(3)/ 020 write(4)/ 021(4)policy。

## 4. getUserInfo.buttons 新逐字基線(回歸鐵律)

`handler/auth.rs` getUserInfo 改:`buttons = button_auth::buttons_for_roles_via_casbin(&enforcer, &roles)` —— union over user's active roles 的 `(role,*,'button')` codes,**依 code 字典序**輸出(deterministic;`B_*` < `user:*`,保 B_CODE1<2<3)。`UserInfo` struct 不改(`Vec<String>` camelCase)。

**新基線(未編輯任何角色按鈕時,三 seed 帳號 getUserInfo.buttons 逐字)**:

| 帳號(角色) | buttons(字典序) |
|---|---|
| Super(R_SUPER) | `["B_CODE1","B_CODE2","B_CODE3","user:add","user:delete","user:edit"]` |
| Admin(R_ADMIN) | `["B_CODE2","B_CODE3","user:edit"]` |
| User(R_USER_COMMON) | `["B_CODE3"]` |

> **B_CODE 子序逐字保留**(R0 baseline 不破);user:* 為新增(字典序 `B`<`u` → 附於後)。`buttons.rs` 7 單元測試:改為斷言此新基線 OR 退場改由 button_auth 純函式測試(implementer 對齊)。

## 5. getUserRoutes 逐字基線 re-base(唯一 intended 回歸例外,FR-010)

救活 function/toggle-auth → 三角色 getUserRoutes 各新增 `function`(含子 `function_toggle-auth`)節點:

| 角色 | 021 基線 | **022 新基線(+function)** |
|---|---|---|
| Super | home, manage(user/role/menu/user-detail) | + **function(toggle-auth)** |
| Admin | home, manage(user/user-detail) | + **function(toggle-auth)** |
| User | home | + **function(toggle-auth)** |

> per-role home 不受影響(toggle-auth 非 home);getConstantRoutes 不變。contracts/verification-commands.md 以**新基線**驗。

## 6. 新 wire endpoint DTO(envelope `{data,code:"0000",msg}`)

| endpoint | method | req | res `data` |
|---|---|---|---|
| `/systemManage/getAllButtons` | GET | — | `[{code:string, desc:string}]`(registry,字典序) |
| `/systemManage/getRoleButton` | GET | `?roleId`(number\|string,`de_role_id`) | `string[]`(該角色 granted codes,字典序) |
| `/systemManage/updateRoleButton` | POST | `{roleId, codes:string[]}` | `null`(HARD REPLACE) |

base-web `service/api/rev2-system-manage.ts` 新增(BASE-WEB-WRAPPER):
- `fetchGetAllButtons()` → `request<ButtonItem[]>({url:'/systemManage/getAllButtons',method:'get'})`
- `fetchGetRoleButton(roleId)` → `request<string[]>({url:'/systemManage/getRoleButton',method:'get',params:{roleId}})`
- `fetchUpdateRoleButton(roleId, codes)` → `request<null>({url:'/systemManage/updateRoleButton',method:'post',data:{roleId, codes}})`

> 3 端對齊:rust res 型 ↔ base-web fetch 型 ↔ modal state(`tree: ButtonItem[]` / `checks: string[]`)。modal `getChecks` 用 `fetchGetRoleButton`、`getAllButtons` 用 `fetchGetAllButtons`、`handleSubmit` 用 `fetchUpdateRoleButton(roleId, checks)`。

## 7. base-web 元件改動(MODAL-WIRING ★ v1.3.0,逐處記 file:line)

| 檔 | 改動 | 軌道 |
|---|---|---|
| `role/modules/button-auth-modal.vue` | 3 placeholder 接線 + `ButtonConfig→{code,label,code}`〔key=code〕+ `checks:string[]` + NTree `key-field="code"` + `init()` 改 `watch(visible)` | MODAL-WIRING (a) |
| `user/index.vue` | row `编辑` `v-if="hasAuth('user:edit')"` / `删除` `hasAuth('user:delete')` | MODAL-WIRING (b) gating |
| `components/advanced/table-header-operation.vue` | 加 `show-add?: boolean`(預設 true)包 `新增` 鈕 `v-if` | MODAL-WIRING (b) gating |
| `user/index.vue`(toolbar) | 傳 `:show-add="hasAuth('user:add')"` 給 table-header-operation | MODAL-WIRING (b) gating |
| `service/api/rev2-system-manage.ts` | +3 fetch fn(§6) | BASE-WEB-WRAPPER |

> 共用元件 `table-header-operation.vue` 改動 MUST 附加 prop + 安全預設 true(role/menu 頁不傳 → 行為不變)。每處實作時於 tasks/spec 記確切 file:line + upstream 衝突風險(MODAL-WIRING 紀律)。

## 8. rust 結構(鏡像 021)

- `auth/button_auth.rs`(新):`get_role_button_codes(enforcer, role_code) -> Vec<String>`(get_filtered_policy 0,[role,"","button"])/ `replace_role_button_policies(...)`( remove_filtered + add_policies)/ `set_role_button(state, role_code, codes, operator)`(write-lock + 011 audit + publish_policy_invalidate)/ `buttons_for_roles_via_casbin(enforcer, &roles) -> Vec<String>`(union 字典序,供 getUserInfo)。**無自鎖 guard**。
- `handler/system_manage.rs`(改):+ `get_all_buttons` / `get_role_button` / `update_role_button`(Super-only enforce_mw、`de_role_id`、operator 由 015 ctx、業務錯誤 2222、非法 code 2222)。
- `handler/auth.rs`(改):getUserInfo.buttons 改讀 `buttons_for_roles_via_casbin`。
- `migration/src/m20260529_000022_seed_button_auth.rs`(新):§2 sys_menu + §1.1 manage_user.buttons UPDATE + §3 casbin seed;up/down 對稱可逆。
- `auth/buttons.rs`:matrix 退場 / 改為回歸對照(implementer 決定保留為 baseline 測試 or 移除)。
