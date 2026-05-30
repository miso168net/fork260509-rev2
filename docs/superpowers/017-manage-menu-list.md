# 017-manage-menu-list — Phase 0 brainstorm（spec-design）

**Feature**: `017-manage-menu-list`
**Created**: 2026-05-30
**前序**: [016-manage-role-user-list](../../specs/016-manage-role-user-list/spec.md)（Phase 4 第一刀:role+user 3 read endpoint）
**性質**: Phase 4 主流業務第二刀 —— base-web manage/menu 頁的 **menu 三件 read endpoint** + 建 `sys_menu` 表。

> 本檔為 Phase 0 brainstorm 凍結的 spec-design，交棒 `/speckit-specify`。所有 D 決策已與 user 逐項拍板（2026-05-30）。

---

## Summary

落地 base-web manage/menu 頁的 **3 條 read endpoint**:`getMenuList/v2`(分頁樹) / `getMenuTree`(輕量樹) / `getAllPages`(頁面名 catalog)，並**建 `sys_menu` 表**（把 menu 定義從 014 寫死的 in-code route tree 搬進資料表）。沿用 016 立的「Output DTO + enforce 掛路由 + facade」pattern；3 條掛 admin 級 Casbin `enforce_mw`。**唯讀**（menu CRUD / role-menu 授權寫入 = scope 外）。**不動 014 getUserRoutes**（仍讀 in-code）。`getAllPages` 是唯一 **role-aware** 端點（R_SUPER 看真頁+demo 頁、R_ADMIN 只真頁）。

---

## 現況事實基準（grep ground truth，2026-05-30）

**現有 8 表**（無 sys_menu）：`sys_user`──`sys_user_role`──`sys_role`（RBAC 核心、無 FK、user→role 走 join 表非 casbin g）/ `casbin_rule`（p 政策:`v2='GET'` 6 條 endpoint enforce + `v2='menu'` 9 條 menu 可見性）/ 3 審計表（sys_operation_log/sys_access_log/sys_login_attempt）/ seaql_migrations。

**menu 目前散在兩處**（無表）：
- **定義** → 寫死在 `server/src/route/menu.rs::business_routes()`（014）—— `home` + `manage`(父) + 4 children（manage_user/role/menu/user-detail）共 6 節點。
- **可見性** → `casbin_rule` `v2='menu'` 9 條（`p,<role>,<route_name>,menu`），引用 route_name: home/manage_user/manage_role/manage_menu/manage_user-detail（`manage` 父層不 seed、靠 tree-prune）。

**base-web wire 權威**（`typings/api/system-manage.d.ts` + `router.d.ts`）：
- `MenuType='1'|'2'`(1=目錄/2=選單)、`IconType='1'|'2'`(1=iconify/2=local)、`MenuButton={code,desc}`
- `Menu = CommonRecord<{parentId, menuType, menuName, routeName, routePath, component?, icon, iconType, buttons?, children?}> & MenuPropsOfRoute`
  - `CommonRecord` 補:`id:number, createBy, createTime, updateBy, updateTime, status:EnableStatus|null`
  - `MenuPropsOfRoute` = `Pick<RouteMeta,'i18nKey'|'keepAlive'|'constant'|'order'|'href'|'hideInMenu'|'activeMenu'|'multiTab'|'fixedIndexInTab'|'query'>`
  - `href`=外链 URL（scalar）;`query`=`{key,value}[]`內部路由固定 query
- `MenuList = PaginatingQueryRecord<Menu>` = `{records:Menu[],current,size,total}`;`MenuTree = {id:number,label,pId:number,children?}`;`getAllPages → string[]`
- service:`fetchGetMenuList()`→`GET /systemManage/getMenuList/v2`（**無 params**）/ `fetchGetAllPages()`→`GET /systemManage/getAllPages` / `fetchGetMenuTree()`→`GET /systemManage/getMenuTree`
- 三條皆 admin 級（DESIGN §6:Super/Admin ✓、User ✗）

**migration 尾號** = `m..015` → 017 從 `m..016` 起。

---

## 凍結設計決策（D1–D14）

### D1 — scope:menu 三件 read + 建 sys_menu、唯讀、014 不動
017 = `getMenuList/v2` + `getMenuTree` + `getAllPages` 三 read endpoint + 建 `sys_menu` 表。**唯讀**:menu CRUD（新增/改/刪）、role-menu 授權寫入 = **scope 外**（留後續）。**014 getUserRoutes/isRouteExist 不動**（仍讀 in-code `business_routes()`、不回頭 rewire）。sys_menu 成為「menu 定義」表;「sys_menu 單一真相源 + getUserRoutes 改讀它」= 未來 feature。

### D2 — sys_menu = base-web `Menu` 全欄落地（含進階 route meta）
不做 YAGNI 裁欄;Menu 全部欄位都落地（user 拍板:表一次到位、未來 CRUD 不用再 alter）。

### D3 — 儲存策略:扁平 column + 2 個 JSONB
純量欄走扁平 column（與 016 sys_role/sys_user 一致、typed）;只有兩個本質巢狀欄走 JSONB:
- `route_ext` JSONB = `{href, query:[{key,value}], multiTab, fixedIndexInTab}`（罕用進階 route-meta,6 個 seed 節點皆 null）
- `buttons` JSONB = `[{code,desc}]`（按鈕定義目錄）
`children` **不存**（query 時由 `parent_id` 組樹）。

### D4 — id=number、route_name=string 雙身分
`id`(number、BIGSERIAL PK) = base-web wire 身分（getMenuList records.id、CRUD/edit 身分）;`route_name`(string、unique active) = **routing + casbin `v1` 對齊鍵**。兩者並存各司其職。（id=number 承 constitution v1.1.0、016 已開）

### D5 — getMenuList/v2:分頁樹、取全 active + 記憶體組樹 + 頂層 slice 分頁
回 `{records,current,size,total}`（套 016 `normalize_page`:current/size、clamp 100、**無 search 參數**）。records = 頂層 menu（`parent_id=0`、依 `menu_order`）分頁，每筆 `children` 遞迴巢狀。
**實作策略（明確偏離 016 DB 分頁）**:facade 取**全部 active menu（1 query）** → handler **記憶體組 `parent_id→children` 樹** → **頂層 slice 分頁**、`total`=頂層數。
理由:menu 是巢狀樹（children 必須隨 root）+ 任意深度 + **menu 本質有界小**（導覽設定、非交易資料、不像 user/role 會長大）→ 取全+記憶體組樹比 DB 分頁簡單且 fit;DB 分頁需 recursive CTE（raw SQL、破 facade seam）。**role-agnostic**（admin 都看同一份真菜單）。

### D6 — getMenuTree:bare 輕量樹、role-agnostic
回 `Vec<MenuTreeItem>`（bare array、非分頁,同 getAllRoles）。`MenuTreeItem = {id:number, label, pId:number, children?}`,`label`=`menu_name`、`pId`=`parent_id`。全 active menu 組完整巢狀樹（給「role 選單授權 modal」用、該 modal 的 save 流程 out-of-017）。共用 D5 的 tree builder。

### D7 — getAllPages:role-AWARE、in-code 頁名 catalog
回 `Vec<String>`（bare array）。**唯一 role-aware 端點**:
- **R_SUPER** → 真頁(home/manage_user/manage_role/manage_menu/manage_user-detail) **+ demo 頁**(about/function_*/alova_*/multi-menu_*/user-center …)
- **R_ADMIN** → **只真頁**
來源 = **in-code 靜態清單**（§I.5、對齊 base-web `src/router/elegant/routes.ts` route key、**不從 sys_menu 取** —— catalog 是「可掛 menu 的頁面」、含未指派的）。排除 layout 父（manage）+ 系統頁（403/404/500/login/iframe-page）。
role 讀取:handler 內 `bearer→jwt::verify→claims.roles`（角色在 JWT claims、不查 DB）判 R_SUPER。

### D8 — demo 頁:只進 getAllPages catalog、不 seed 成 menu（Path A）
demo 頁**只**出現在 getAllPages(Super) 的 catalog;**不** seed 成 sys_menu 真菜單、**不**加 casbin demo 可見性政策。→ getMenuList/getMenuTree 永遠只那 6 真菜單、**role-agnostic、無 014 側欄分裂**。
理由:017 唯讀,「demo seed 成 menu」在此階段是 inert（Super 看得到但不能 CRUD、也不能導航〔014 不動〕）—— 價值全在未來（menu CRUD + 014 改讀 sys_menu）。demos-as-menus 折給未來 menu-CRUD feature。語意:getAllPages = 「Super 可拿來掛 menu 的頁面目錄」、sys_menu = 「目前存在的真菜單」。

### D9 — enforce:3 條 admin 級、m..017 seed 6 casbin 條
3 route 皆 `route_layer(enforce_mw)`（admin 級:Super+Admin allow、User deny）。`m..017` seed 6 條 endpoint policy（`ON CONFLICT DO NOTHING`、沿 m..009/m..015、注意 `/getMenuList/v2` path）:
```
p, R_SUPER, /systemManage/getMenuList/v2, GET
p, R_ADMIN, /systemManage/getMenuList/v2, GET
p, R_SUPER, /systemManage/getAllPages,    GET
p, R_ADMIN, /systemManage/getAllPages,    GET
p, R_SUPER, /systemManage/getMenuTree,    GET
p, R_ADMIN, /systemManage/getMenuTree,    GET
```
getAllPages 額外在 handler 讀 claims.roles 做 demo 過濾 → enforce_mw + handler 各 parse 一次 JWT = 已知 [§2.17 auth handler 前導 DRY](../INTEGRATION-CHECKLIST.md) debt、**defer**（同 013/014 現況）。

### D10 — casbin menu 政策 ↔ sys_menu 對齊鍵 = route_name
casbin `v2='menu'` 政策 obj(`v1`) = route_name;sys_menu 有 route_name(unique)。**對齊鍵 = route_name 字串**。017 seed sys_menu 的 5 個 route_name（home/manage_user/manage_role/manage_menu/manage_user-detail）對齊既有 9 條 casbin menu 政策（`manage` 父層不在 casbin、tree-prune）。017 唯讀、兩者皆 seed-only → **無漂移**。未來 menu CRUD + role-menu 授權寫入時須保 sys_menu.route_name ↔ casbin.v1 同步（受管 policy 層、Phase 3 #6）。

### D11 — 不建 sys_role_menu、不建 sys_menu_button
- menu **可見性**真相在 **casbin**（§I.2 鐵紀律、014 已落地）→ **不建 sys_role_menu** join 表。
- **buttons** 用 sys_menu 的 JSONB 欄存 → **不建 sys_menu_button** 表（read-only 不需正規化）。

### D12 — buttons = 定義目錄、operator 折期
`buttons` JSONB 存「這個 menu 有哪些按鈕」的定義目錄（`[{code,desc}]`）、**非權限授予**;017 seed null（6 節點無按鈕資料）。未來「按鈕權限」feature 才填 + 接 casbin（`p,role,<button_code>,'button'`、靠 button code 對齊,同 menu 靠 route_name）或沿用 013 getUserInfo.buttons。`created_by`/`updated_by`(operator) = **不建欄、wire 回 null**（折 Phase 4 A、同 016）。

### D13 — 測試:純函式 tree-builder/paginator/role-filter + 活體 acceptance、無 CDP
純單測（no-DB、test-first 純邏輯）:`build_menu_tree(Vec<Model>)→Vec<MenuItem>`（巢狀/排序/孤兒）+ root-slice 分頁（reuse 016 `normalize_page`）+ `pages_for_roles(roles)→Vec<String>`（Super real+demo / else real）+ `route_ext` JSONB↔wire 攤平 + facade `all_active` SQL-build（`deleted_at IS NULL` + order menu_order）。wiring（handler 接線/enforce/tree fetch/getAllPages role 讀取）→ 活體 curl+psql。**無 CDP**（純後端 read、同 016;base-web 端到端留 prod-stack 巡檢 [§2.8](../INTEGRATION-CHECKLIST.md)）。

### D14 — migration/crate 邊界
`m..016_create_sys_menu`（建表 21 欄 + unique(route_name active) + 同檔 seed 6 節點,parent_id 用 `(SELECT id FROM sys_menu WHERE route_name='manage')` subquery 解、同 013 套路）+ `m..017_seed_menu_endpoint_policy`（6 casbin 條）。**無新 workspace crate**（不觸發 prod-build 鐵律、但仍跑 prod build sanity）。**不動 base-web、不動 014**。

---

## sys_menu 表（完整 21 欄 + 2 wire-only）

| group | column | 型 / 約束 | wire (`Menu`) |
|---|---|---|---|
| 身分 | `id` | BIGSERIAL PK | `id`(number) |
| | `route_name` | VARCHAR NOT NULL · unique(active) | `routeName`（+ casbin v1 鍵） |
| | `parent_id` | BIGINT NOT NULL default 0 | `parentId`（0=頂層） |
| | `menu_type` | VARCHAR NOT NULL ('1'/'2') | `menuType` |
| 顯示 | `menu_name` | VARCHAR NOT NULL | `menuName` |
| | `route_path` | VARCHAR NOT NULL | `routePath` |
| | `component` | VARCHAR null | `component` |
| | `icon` | VARCHAR null | `icon` |
| | `icon_type` | VARCHAR null ('1'/'2') | `iconType` |
| meta(扁平) | `i18n_key` | VARCHAR null | `i18nKey` |
| | `menu_order` | INT null | `order`（保留字→欄名 menu_order） |
| | `keep_alive` | BOOL null | `keepAlive` |
| | `constant` | BOOL null | `constant` |
| | `hide_in_menu` | BOOL null | `hideInMenu` |
| | `active_menu` | VARCHAR null | `activeMenu` |
| JSONB | `route_ext` | JSONB null | 攤平→`href`/`query`/`multiTab`/`fixedIndexInTab` |
| | `buttons` | JSONB null | `buttons`(`[{code,desc}]`) |
| status/審計 | `status` | VARCHAR NOT NULL default '1' | `status` |
| | `created_at` | TIMESTAMPTZ NOT NULL default now() | `createTime` |
| | `updated_at` | TIMESTAMPTZ null | `updateTime` |
| soft-delete | `deleted_at` | TIMESTAMPTZ null | —（只回 active） |

**wire-only（不建欄）**:`createBy`/`updateBy`→null（operator 折 Phase 4 A）;`children`→不存（handler 由 parent_id 組樹）。

### seed 6 節點（對齊 014 in-code 樹）
| route_name | parent | type | menu_name | route_path | component | icon | i18n_key | order | keep_alive | hide_in_menu | active_menu |
|---|---|---|---|---|---|---|---|---|---|---|---|
| home | 0 | 2 | home | /home | layout.base$view.home | mdi:monitor-dashboard | route.home | 1 | | | |
| manage | 0 | 1 | manage | /manage | layout.base | carbon:cloud-service-management | route.manage | 9 | | | |
| manage_user | manage | 2 | manage_user | /manage/user | view.manage_user | ic:round-manage-accounts | route.manage_user | 1 | | | |
| manage_role | manage | 2 | manage_role | /manage/role | view.manage_role | carbon:user-role | route.manage_role | 2 | | | |
| manage_menu | manage | 2 | manage_menu | /manage/menu | view.manage_menu | material-symbols:route | route.manage_menu | 3 | true | | |
| manage_user-detail | manage | 2 | manage_user-detail | /manage/user-detail/:id | view.manage_user-detail | | route.manage_user-detail | | | true | manage_user |

> 全 6 列:`route_ext`/`buttons`/`icon_type`(無 icon 者外皆 1)/`status`=1;`constant` 皆 null（constant 只屬 014 constant_routes、不進 sys_menu）。`menu_name` 暫 seed route key（base-web 顯示走 i18nKey）。

---

## 元件 / 落地清單

| 檔 | 內容 |
|---|---|
| `migration/src/m..016_create_sys_menu.rs` | 建表 + seed 6 節點 + lib.rs 註冊 |
| `migration/src/m..017_seed_menu_endpoint_policy.rs` | seed 6 casbin endpoint policy + lib.rs 註冊 |
| `entity/src/sys_menu.rs` | Model 21 欄（JSONB 欄 `serde_json::Value` 或 typed）+ SoftDeletable |
| `server/src/model/facade/sys_menu.rs` | `find_active()` + `all_active(db)->Vec<Model>`(依 menu_order) + SoftDeletable + SQL-build 單測 |
| `server/src/handler/system_manage.rs`(擴充) | `MenuItem`(含 children + route_ext 攤平 + buttons + createBy/updateBy null) / `MenuTreeItem` / 純 `build_menu_tree` / 純 root-slice / `pages_for_roles` + in-code `REAL_PAGES`/`DEMO_PAGES` / 3 handler |
| `server/src/main.rs` | 3 route + enforce route_layer（注意 /getMenuList/v2 nested path） |

**承接既有**:008 envelope(`Res<T>`)、009 soft-delete + entity-access lint、010 migration 自動套、013 enforce_mw/jwt/claims、016 `normalize_page`/`PageResp`/facade 分頁 pattern（抄 sys_user `_filtered`+`_list_select` 乾淨版、非 sys_role 重複建 WHERE）。

---

## Scope

**In**:sys_menu 表 + seed 6 節點 + 3 read endpoint（getMenuList/v2 分頁樹 / getMenuTree 輕量樹 / getAllPages role-aware catalog）+ 6 casbin endpoint policy + admin enforce。

**Out**（皆後續）:menu CRUD（新增/改/刪 menu）、role-menu 授權寫入（modal save）、demo 頁 seed 成 menu、014 getUserRoutes 改讀 sys_menu（單一真相源統一）、按鈕權限 feature（buttons↔casbin/getUserInfo）、operator 歸屬（Phase 4 A）、sys_role_menu/sys_menu_button 表。

---

## Deviation / 風險（implement 時若觸發記 Deviation Log）

- **D-A（getMenuList 非 016 DB 分頁）**:取全 active + 記憶體組樹 + 頂層 slice;規模假設 = menu 有界小（導覽設定）。spec/plan 明示理由。
- **D-B（getAllPages role-aware + double JWT parse）**:唯一 role-aware 端點;enforce_mw + handler 各 parse JWT = §2.17 DRY debt、defer。
- **D-C（in-code 頁名/component 對齊 base-web、§I.5）**:`REAL_PAGES`/`DEMO_PAGES` 與 seed component 名對齊 base-web elegant-router、未 grep rev1（同 014 紀律）。
- **D-D（sys_menu vs 014 in-code 雙源、暫並存）**:017 seed sys_menu 對齊 014 6 節點、兩源皆唯讀無漂移;單一真相源統一（014 改讀 sys_menu）留未來。
- **風險**:`order` SQL 保留字（→欄名 menu_order）;seed parent_id subquery;JSONB 欄 serde 映射;getMenuList tree+分頁正確性（純測鎖）。
