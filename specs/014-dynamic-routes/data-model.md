# Data Model: 014-dynamic-routes（Phase 1）

> 無新 DB 表(route 物件程式內)。新增:menu-visibility policy seed 進 `casbin_rule`(012 stock)+ 程式內 route 定義 + wire DTO。命名/shape 以 [research.md](./research.md) grep 的 base-web `elegant/routes.ts` 為準。

## 1. wire DTO（serde camelCase、wrap 008 `Res<T>`）

| DTO | 欄 | 對應 base-web typing |
|---|---|---|
| **`MenuRoute`** | `id: String` / `name: String` / `path: String` / `component: String` / `meta: RouteMeta` / `children: Option<Vec<MenuRoute>>` / `props: Option<bool>` | `Api.Route.MenuRoute`(`id: string`、§11.10) |
| **`RouteMeta`** | `title: String` / `i18n_key: String` / `icon: Option<String>` / `order: Option<i32>` / `hide_in_menu: Option<bool>` / `keep_alive: Option<bool>` / `constant: Option<bool>` / `active_menu: Option<String>` | base-web route meta(`rename_all="camelCase"` → `i18nKey`/`hideInMenu`/`keepAlive`/`activeMenu`) |
| **`UserRoute`** | `routes: Vec<MenuRoute>` / `home: String` | `Api.Route.UserRoute`(`home="home"`) |

- `id`:string,指派 = route name(`id:"home"`、`id:"manage_user"`…穩定簡單)。
- **省略 `meta.roles`**(dynamic mode server 已過濾、前端不重 filter)。
- `Option` 欄 serde `skip_serializing_if="Option::is_none"`(避免空欄污染、對齊 base-web 可選 meta)。
- wrap:`getConstantRoutes`→`Res<Vec<MenuRoute>>`、`getUserRoutes`→`Res<UserRoute>`、`isRouteExist`→`Res<bool>`。

## 2. 程式內 route 定義（`server/src/route/menu.rs`,精確對齊 base-web）

### constant routes（getConstantRoutes、公開不過濾、meta.constant:true）

| name | path | component | meta |
|---|---|---|---|
| `403` | `/403` | `layout.blank$view.403` | title/i18nKey `route.403`、constant:true、hideInMenu:true |
| `404` | `/404` | `layout.blank$view.404` | …`route.404`、constant、hideInMenu |
| `500` | `/500` | `layout.blank$view.500` | …`route.500`、constant、hideInMenu |
| `login` | `/login/:module(pwd-login\|code-login\|register\|reset-pwd\|bind-wechat)?` | `layout.blank$view.login` | …`route.login`、constant、hideInMenu;props:true |
| `iframe-page` | `/iframe-page/:url` | `layout.base$view.iframe-page` | …`route.iframe-page`、constant、hideInMenu、keepAlive;props:true |

### business routes（getUserRoutes、enforce 過濾）

| name | path | component | meta（節錄） | parent |
|---|---|---|---|---|
| `home` | `/home` | `layout.base$view.home` | title `home`、i18nKey `route.home`、icon `mdi:monitor-dashboard`、order 1 | — |
| `manage` | `/manage` | `layout.base` | i18nKey `route.manage`、icon `carbon:cloud-service-management`、order 9 | —（layout 父） |
| `manage_user` | `/manage/user` | `view.manage_user` | icon `ic:round-manage-accounts`、order 1 | manage |
| `manage_role` | `/manage/role` | `view.manage_role` | icon `carbon:user-role`、order 2 | manage |
| `manage_menu` | `/manage/menu` | `view.manage_menu` | icon `material-symbols:route`、order 3、keepAlive | manage |
| `manage_user-detail` | `/manage/user-detail/:id` | `view.manage_user-detail` | hideInMenu、activeMenu `manage_user`;props:true | manage |

> `home`(`UserRoute.home`)= `"home"`。`manage` 為 layout 父、本身無 view component。

## 3. menu-visibility policy seed（migration `m20260529_000010_seed_menu_policy`、casbin_rule 012 stock、經 010 自動套）

`p, <role>, <route_name>, menu`(v0=role、v1=route_name、v2=`menu`、v3-5='';共 8 rows):

| route_name | R_SUPER | R_ADMIN | R_USER_COMMON |
|---|---|---|---|
| `home` | ✓ | ✓ | ✓ |
| `manage_user` | ✓ | ✓ | — |
| `manage_user-detail` | ✓ | ✓ | — |
| `manage_role` | ✓ | — | — |
| `manage_menu` | ✓ | — | — |

- **父層 `manage` 不 seed policy** → 可見性由 tree-prune 計算(子項任一可見則保留)。
- INSERT `ON CONFLICT DO NOTHING`(冪等);沿 013 migration 009 的 casbin seed 寫法。
- 註:013 已 seed 2 條 endpoint policy(`obj=/systemManage/getUserList,act=GET`);014 menu policy `act=menu` 不同域、共存於同表同 model。

## 4. enforce 約定（重用 013 enforcer、model 不改）

```
filter_routes_for_roles(roles: &[String], enforcer) -> Vec<MenuRoute>:
  for each business route R(葉):
     visible = roles.any(|role| enforcer.enforce((role, R.name, "menu")) == Ok(true))
  父層 manage:保留 iff 任一 child visible(tree-prune);children 只留 visible 的
  home:葉、直接判 visible

route_exists_for_roles(name, roles, enforcer) -> bool:
  roles.any(|role| enforcer.enforce((role, name, "menu")) == Ok(true))
```
- RBAC model 沿 013(`m = r.sub==p.sub && r.obj==p.obj && r.act==p.act`);`enforce((role, route_name, "menu"))` 對 `p,role,route_name,menu` 命中。
- `Arc<RwLock<Enforcer>>` `.read().await.enforce(...)`(enforce 取 &self、read lock 足夠)。

## 5. endpoint → 行為

| endpoint | 認證 | 行為 |
|---|---|---|
| `GET /route/getConstantRoutes` | 公開 | `Res::ok(constant 5 條)`(不過濾) |
| `GET /route/getUserRoutes` | JWT | 驗 JWT → `roles_for_user(db, user_id)` → `filter_routes_for_roles(roles, enforcer)` → `Res::ok(UserRoute{routes, home:"home"})`;token 壞 → `Res::<UserRoute>::err(3333)` |
| `GET /route/isRouteExist?routeName=X` | JWT | 驗 JWT → roles → `route_exists_for_roles(X, roles, enforcer)` → `Res::ok(bool)`;token 壞 → `Res::<bool>::err(3333)` |

## 6. 與既有關係

- `casbin_rule`(012)+ 013 endpoint policy 共表;014 加 menu policy(act=menu)。
- enforcer = 013 `AppState.enforcer`(boot load_policy 已含 014 seed 的 menu rows、因經 010 自動套在 boot 前)。
- roles 來源 = 013 `facade/sys_user_role::roles_for_user`(權威 DB)。
- route 定義程式內(`server/src/route/menu.rs`)、非 entity → 不觸 009 lint。
