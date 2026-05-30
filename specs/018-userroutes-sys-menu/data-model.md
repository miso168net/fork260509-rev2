# Data Model: getUserRoutes 改讀 sys_menu(Phase 1)

**Feature**: 018-userroutes-sys-menu | **Date**: 2026-05-31

> 本 feature 唯讀(讀 sys_menu)+ 一條 seed 修正 migration。無建表、無加欄。

---

## 1. sys_menu(既有實體,本 feature 只讀 + 一筆 seed 修正)

`entity/src/sys_menu.rs::Model`(017 落地、21 欄)。本 feature **讀** 的欄位 + 對映目標:

| sys_menu 欄 | 型 | → MenuRoute |
|---|---|---|
| `route_name` | `String` | `id` **與** `name`(MenuRoute.id = route 名字串、§I.3) |
| `route_path` | `String` | `path` |
| `component` | `Option<String>` | `component`(String;None→`""`,修 seed 後 6 節點全非 null) |
| `menu_name` | `String` | `meta.title`(017 seed = route 名、對齊 014/base-web) |
| `i18n_key` | `Option<String>` | `meta.i18nKey` |
| `icon` | `Option<String>` | `meta.icon` |
| `menu_order` | `Option<i32>` | `meta.order` + 同層排序鍵(升冪 null-last) |
| `keep_alive` | `Option<bool>` | `meta.keepAlive` |
| `constant` | `Option<bool>` | `meta.constant`(業務節點皆 null→None) |
| `hide_in_menu` | `Option<bool>` | `meta.hideInMenu` |
| `active_menu` | `Option<String>` | `meta.activeMenu` |
| `route_ext` | `Option<Json>` | 抽 `route_ext->>'props'`→ `props: Option<bool>` |
| `parent_id` | `i64` | 巢狀依據(0=頂層;非 0 = 父 sys_menu.id) |
| **不取** | — | `menu_type`/`icon_type`/`status`/`buttons`(admin 表用、route 不需) |

**讀取管道**:`facade::sys_menu::all_active(db)->Result<Vec<Model>,DbErr>`(soft-delete 過濾 + `ORDER BY menu_order ASC`;**facade 不改**)。

## 2. seed 修正(本 feature 唯一資料變更;系統級、非 user 寫入)

migration `m20260529_000018_fix_user_detail_seed`(UPDATE,forward-only):

```sql
-- up
UPDATE sys_menu
   SET component = 'view.manage_user-detail',
       route_ext = '{"props": true}'::jsonb
 WHERE route_name = 'manage_user-detail';
-- down
UPDATE sys_menu
   SET component = NULL,
       route_ext = NULL
 WHERE route_name = 'manage_user-detail';
```

**理由**:m..016 seed 漏 component/props(R2);base-web 權威 = component `'view.manage_user-detail'` + props true(R1)。經 010 機制 dev/prod stack `up` 自動套。

> **§I.6 不觸發**:此為既有表的 UPDATE 資料修正、非 `create migration`;不新增業務主表 → constitution §IV #8 N/A。operator 歸屬(審計欄)已擱置 Phase 4 A。

## 3. 輸出 DTO(既有,014 落地、不改型)

`route/menu.rs`(序列化形狀 = getUserRoutes wire,**本 feature 不改 DTO 定義**):

```
MenuRoute { id:String, name:String, path:String, component:String,
            meta:RouteMeta, children:Option<Vec<MenuRoute>>, props:Option<bool> }   // serde camelCase + skip_serializing_if None
RouteMeta { title:String, i18nKey:String, icon:Option<String>, order:Option<i32>,
            hideInMenu:Option<bool>, keepAlive:Option<bool>, constant:Option<bool>,
            activeMenu:Option<String> }                                            // 省 roles(dynamic mode)
UserRoute { routes:Vec<MenuRoute>, home:String }
```

對齊 base-web `typings/api/route.d.ts`(`UserRoute{routes:MenuRoute[],home}`、`MenuRoute extends ElegantConstRoute`)+ `typings/router.d.ts RouteMeta`(全 optional/nullable)。

## 4. 新純函式 build_route_tree(本 feature 新增)

```
build_route_tree(models: Vec<sys_menu::Model>) -> Vec<MenuRoute>
```

**契約**:
- 每個 Model 依 §1 對映表 → MenuRoute(`id`/`name`←route_name;`meta.title`←menu_name;`props`←route_ext->>'props')。
- parent_id 巢狀:`parent_id=0`→頂層;否則掛到 `id==parent_id` 的父 `children`。
- 同層排序:`menu_order` 升冪、**null-last**(對齊 014:home/manage 頂層;manage 子 user(1)/role(2)/menu(3)/user-detail(null→末))。
- 葉節點(無子)`children=None`(skip_serializing);父節點 `children=Some(vec)`。
- `component` None→`""`(修 seed 後 6 節點不觸發;防禦性)。

**不抽共用**:與 017 `build_menu_tree`(產 MenuItem)巢狀邏輯近似但輸出型不同 → 各寫一份小的(brainstorm Deviation、避過早抽象)。

## 5. 6 節點預期 MenuRoute 樹(acceptance baseline = 修 seed 後 = 014 現況)

```
[ home{ id/name:home, path:/home, component:layout.base$view.home,
        meta{title:home,i18nKey:route.home,icon:mdi:monitor-dashboard,order:1} },
  manage{ id/name:manage, path:/manage, component:layout.base,
          meta{title:manage,i18nKey:route.manage,icon:carbon:cloud-service-management,order:9},
          children:[
            manage_user{ component:view.manage_user, meta{...,icon:ic:round-manage-accounts,order:1} },
            manage_role{ component:view.manage_role, meta{...,icon:carbon:user-role,order:2} },
            manage_menu{ component:view.manage_menu, meta{...,icon:material-symbols:route,order:3,keepAlive:true} },
            manage_user-detail{ component:view.manage_user-detail, props:true,
                                meta{...,hideInMenu:true,activeMenu:manage_user} } ] } ]
```

角色過濾後(Casbin、不變):Super = 全;Admin = home + manage{user,user-detail};User = home(manage tree-prune)。
