# Research: 017-manage-menu-list（Phase 0）

> **§I.5 紀律**:本 feature **未 grep rev1 source**。所有 grep 對象為 **rev2 自身**（rust-api entity/facade/migration/handler/jwt + base-web typings/routes.ts）。schema 由 base-web `Menu` typing + 014 in-code 樹推導,in-code 頁名對齊 base-web elegant-router。日期 2026-05-30。**0 NEEDS CLARIFICATION**。

## grep 事實基準（rev2，2026-05-30）

### base-web typings（`base-web/src/typings/`，wire 權威）
- `api/system-manage.d.ts`:`MenuType='1'|'2'`、`IconType='1'|'2'`、`MenuButton={code,desc}`;`Menu = CommonRecord<{parentId:number, menuType:MenuType, menuName, routeName, routePath, component?, icon, iconType:IconType, buttons?:MenuButton[]|null, children?:Menu[]|null}> & MenuPropsOfRoute`;`MenuList = PaginatingQueryRecord<Menu>`（`{records,current,size,total}`）;`MenuTree = {id:number, label, pId:number, children?:MenuTree[]}`。
- `api/common.d.ts`:`CommonRecord` 補 `{id:number, createBy:string, createTime:string, updateBy:string, updateTime:string, status:EnableStatus|null}`;`PaginatingQueryRecord` = `{current,size,total,records[]}`。
- `router.d.ts` `RouteMeta`（`MenuPropsOfRoute` Pick 來源）:`i18nKey?` / `keepAlive?:bool|null` / `constant?:bool|null` / `order?:number|null` / `href?:string|null`〔**外链 URL**〕 / `hideInMenu?:bool|null` / `activeMenu?:string|null` / `multiTab?:bool|null` / `fixedIndexInTab?:number|null` / `query?:{key:string;value:string}[]|null`〔**內部路由固定 query**〕。
- `service/api/system-manage.ts`:`fetchGetMenuList()`→`GET /systemManage/getMenuList/v2`（**無 params**、回 `MenuList`）/ `fetchGetAllPages()`→`GET /systemManage/getAllPages`（回 `string[]`）/ `fetchGetMenuTree()`→`GET /systemManage/getMenuTree`（回 `MenuTree[]`）。
- `router/elegant/routes.ts` route key（getAllPages 頁名源）:403/404/500/about/alova(+request/scenes)/function(+hide-child(+one/two/three)/multi-tab/request/super-page/tab/toggle-auth)/home/iframe-page/login/manage(+menu/role/user/user-detail)/multi-menu(+first(+child)/second(+child(+home)))/plugin(+barcode/charts(+antv/echarts/vchart)/copy/editor(+markdown/quill)/excel/gantt(+dhtmlx/vtable)/icon/map/pdf/pinyin/print/swiper/tables(+vtable)/typeit/video)/pro-naive(+form(+basic/query/step)/table(+remote/row-edit))/user-center。

### rust-api 現況（grep）
- **無 sys_menu 表/entity/facade**（8 表:sys_user/sys_role/sys_user_role/casbin_rule/sys_operation_log/sys_access_log/sys_login_attempt + seaql_migrations）。
- **menu 散兩處**:定義在 `server/src/route/menu.rs::business_routes()`（014、6 節點:home + manage 父 + 4 children）;可見性在 `casbin_rule` `v2='menu'` 9 條（`p,<role>,<route_name>,menu`）。
- **JSONB 先例**（R4 關鍵）:`entity/src/sys_operation_log.rs:11-12` `pub payload_before/after: Option<Json>`;`migration/.../m..004:48,53` `ColumnDef::new(...).json_binary()`。→ sea-orm JSONB pattern = entity `Option<Json>` + migration `.json_binary()`。
- **`Claims.roles`**（R6 關鍵）:`auth/jwt.rs:33` `pub roles: Vec<String>`（getAllPages handler `jwt::verify(bearer)→claims.roles` 可判 R_SUPER、不查 DB）。
- **migration 尾號** = `m..015` → 017 從 `m..016` 起;`lib.rs` 註冊 mod + migrations() vec。
- **016 facade/handler return 型對照**（model after）:`facade/sys_user.rs` `find_active()->Select<Entity>`、`list_paged(...)->Result<(Vec<UserListRow>,u64),DbErr>`〔`_filtered`+`_list_select` split、乾淨版〕;`facade/sys_role.rs` `all_active()->Result<Vec<Model>,DbErr>`〔raw Model、getAllRoles 用〕;`handler/system_manage.rs` `PageResp<T>{records,current,size,total}`(serde camelCase)、`normalize_page(Option<u64>,Option<u64>)->(u64,u64)`(clamp 100)、`RoleItem`/`UserItem`(id:i64→number、createBy/updateBy null、camelCase、inline map 不 `use entity::`)。
- **enforce/seed**:`auth/enforce.rs::enforce_mw`（每 role enforce `(role,path,method)`、allow→pass / deny→403+5003 / token 壞→3333）;`m..009`/`m..015` seed casbin `INSERT ... ON CONFLICT DO NOTHING`。
- **009 entity-access lint**:`server/src` 內 facade 目錄外 `use entity::` → build fail（handler 必 inline map）。

---

## R1. 三 endpoint wire 形（對齊 base-web typings 權威）
**Decision**:`getMenuList/v2` 回 `Res<PageResp<MenuItem>>`（`{records,current,size,total}`、records=頂層 menu 分頁 + children 巢狀）;`getMenuTree` 回 `Res<Vec<MenuTreeItem>>`（bare array、`{id,label,pId,children}`）;`getAllPages` 回 `Res<Vec<String>>`（bare array、頁名）。query 走 GET（getMenuList **無 search 參數**、僅 current/size;另兩條無 params）。
**Rationale**:對齊 `MenuList`/`MenuTree[]`/`string[]` typing + §I.3 envelope。

## R2. MenuType / IconType / status enum（§I.3 鎖定）
**Decision**:`menu_type` VARCHAR '1'(目錄)/'2'(選單)、`icon_type` VARCHAR '1'(iconify)/'2'(local)、`status` VARCHAR NOT NULL default '1'。entity 型 String / Option<String>。
**Rationale**:§I.3「MenuType 1=directory/2=menu」鎖定;VARCHAR 直存（同 016 status/gender、避 PG enum）。**status 送非 null** = `EnableStatus|null` 子集（§I.3「rust-api 須支援 nullable」以送非 null EnableStatus 滿足、同 016 RoleItem/UserItem 既驗法;menu 永有 status）。

## R3. sys_menu 全欄 schema（base-web `Menu` 全落地、D2）
**Decision**:21 欄（身分 id/route_name/parent_id/menu_type + 顯示 menu_name/route_path/component/icon/icon_type + meta 扁平 i18n_key/menu_order/keep_alive/constant/hide_in_menu/active_menu + 2 JSONB route_ext/buttons + status + created_at/updated_at + deleted_at）;`createBy`/`updateBy` 不建欄→wire null;`children` 不存→組樹。詳見 [data-model §1](./data-model.md)。
**Rationale**:user 拍板全欄（表一次到位、未來 CRUD 不 alter）。`order` 保留字→欄名 `menu_order`。

## R4. JSONB pattern（route_ext + buttons）
**Decision**:`route_ext`/`buttons` 用 sea-orm **`Option<Json>`**（entity）+ migration **`.json_binary()`**（同 011 sys_operation_log payload）。`route_ext`={href,query,multiTab,fixedIndexInTab}（handler 攤平成 wire 頂層欄）;`buttons`=[{code,desc}]（直序列化 wire `buttons`、017 seed null）。
**Rationale**:rev2 既有 JSONB 先例（011）→ 零新 dep、pattern 確定。route_ext 攤平由 handler 手動 map（明確 > serde flatten 的隱晦）。

## R5. tree builder + 記憶體分頁（getMenuList/getMenuTree 共用、D5）
**Decision**:facade `all_active(db)->Vec<Model>`（全 active、依 menu_order）→ handler 純函式 `build_menu_tree(Vec<Model>)->Vec<MenuItem>`（`parent_id→children` map、遞迴巢狀、依 menu_order 排序）→ getMenuList 頂層 slice 分頁（reuse 016 `normalize_page` 算 current/size、`total`=頂層數）;getMenuTree 回完整樹（不分頁、輕量 DTO）。**拍死**:頂層=`parent_id==0`;**孤兒（parent 不在 active 集）→ promote 為頂層、不隱藏**（標準 tree-build、保資料可見、017 無孤兒此為防禦）;nesting 為**共用 pure helper**、**getMenuTree 套同一演算法**從 Model 組 MenuTreeItem（→ I1 解:US2 reuse、獨立可測）。
**Rationale**:menu 巢狀（children 隨 root）+ 任意深度 + 有界小 → 取全+記憶體組樹比 DB recursive CTE 簡單。**明確偏離 016 DB 分頁**（plan D-A）。
**Alternatives**:DB 分頁 roots + recursive CTE 撈子樹（否決:raw SQL 破 facade seam、難測）;扁平分頁不組樹（否決:tree-table 斷裂、違 `Menu.children` 契約）。

## R6. getAllPages role-aware + 頁名源（D7、唯一 role-aware）
**Decision**:`pages_for_roles(roles)->Vec<String>`:`roles 含 "R_SUPER" → REAL_PAGES + DEMO_PAGES;else → REAL_PAGES`。role 讀取:handler `bearer→jwt::verify→Claims.roles`（不查 DB）。in-code 兩清單:`REAL_PAGES`=[home, manage_user, manage_role, manage_menu, manage_user-detail];`DEMO_PAGES`=base-web routes.ts 的 demo 頁級 route key（about/alova_*/function_*/multi-menu_*_(leaf)/plugin_*(leaf)/pro-naive_*(leaf)/user-center;**排 layout 父**〔manage/alova/function/plugin/pro-naive/...〕**+ 系統頁**〔403/404/500/login/iframe-page〕）。
**Rationale**:getAllPages = 可掛 menu 的頁面 catalog（含未指派）;Super 才見 demo（user 拍板）。`Claims.roles` 足夠（cosmetic catalog 過濾、非 routing 權威）。enforce_mw 仍掛（admin 閘）→ double JWT parse（§2.17 DRY debt、defer）。**`pages_for_roles` 拍死**:含 R_SUPER→real+demo;else（R_ADMIN/R_USER_COMMON）→real。**`DEMO_PAGES` 已列定 38 條**（[data-model §5](./data-model.md);base-web routes.ts 有 `view.X` component 的頁級 key、排 REAL 5 + 系統頁〔403/404/500/login/iframe-page〕+ layout 父）。

## R7. enforce 接線 + policy seed（D9）
**Decision**:3 route 皆 `route_layer(from_fn_with_state(state.clone(), enforce_mw))`（admin 級）;`m..017_seed_menu_endpoint_policy` seed 6 條（getMenuList/v2 + getAllPages + getMenuTree 各 R_SUPER/R_ADMIN、`ON CONFLICT DO NOTHING`、沿 m..009/m..015、經 010 自動套）。R_USER_COMMON 不放（deny）。
**Rationale**:授權走 Casbin（handler 不判角色;getAllPages 的 Super-demo 過濾是內容差異、非授權閘）。

## R8. casbin menu 政策 ↔ sys_menu 對齊（D10）
**Decision**:casbin `v2='menu'` 政策 obj=route_name;sys_menu `route_name` unique。017 seed 的 5 route_name（home/manage_user/manage_role/manage_menu/manage_user-detail）對齊既有 9 條 casbin menu 政策（`manage` 父層不在 casbin、tree-prune）。**017 唯讀、兩者 seed-only → 無漂移**。
**Rationale**:可見性續住 casbin（§I.2、不建 sys_role_menu）;單一真相源統一留未來。

## R9. facade pattern（sys_menu 較 016 簡）
**Decision**:`facade/sys_menu.rs`:`find_active()->Select<Entity>`（委派 SoftDeletable）+ `all_active(db)->Result<Vec<Model>,DbErr>`（find_active + order_by menu_order + all）。**無 list_paged**（getMenuList 走記憶體 tree+slice、非 DB 分頁）。SQL-build 單測斷言 `deleted_at IS NULL` + `ORDER BY menu_order`（同 016 facade 測風）。
**Rationale**:對照 016 `sys_role::all_active`（raw Model）;menu 不需 filter/DB 分頁 → facade 比 sys_user 更簡。守 009 lint（查詢只經 facade）。

## R10. 既有契約守恆 + 無新 dep
**Decision**:守 **008 envelope** + **009 entity-access lint**（sys_menu 查詢落 facade、handler inline map 不 `use entity::`）+ **007 FR-009**（migration 經 010、server 不自動 migrate）+ **soft-delete**（只回 active）+ **014 不動**（getUserRoutes 仍讀 in-code、行為不變）。**無新 workspace crate、無新 dep**（sea-orm Json/json_binary 內建、011 已用）→ 依 CLAUDE.md §3 不觸發「必含 prod image build」鐵律;但 §0 仍跑一次 prod build sanity（保守、確認新表 migration + 新 handler 不破 release build）。

---

## wire 鏈條 3 端對齊（§3 紀律）
| endpoint | (a) rust handler 回型 | (b) base-web service + typing | (c) frontend 消費 |
|---|---|---|---|
| getMenuList/v2 | `Res<PageResp<MenuItem>>`（records 巢狀 + current/size/total） | `fetchGetMenuList()→MenuList=PaginatingQueryRecord<Menu>` | manage/menu 頁 tree-table（讀 records[].children） |
| getMenuTree | `Res<Vec<MenuTreeItem>>`（bare、{id,label,pId,children}） | `fetchGetMenuTree()→MenuTree[]` | role 選單授權 modal tree-select |
| getAllPages | `Res<Vec<String>>`（bare、role-aware） | `fetchGetAllPages()→string[]` | menu 建立表單「頁面」下拉 |

> 3 端一致;**id=number**（MenuItem/MenuTreeItem id:i64→number）、camelCase、status 非 null EnableStatus。frontend 端到端（manage/menu tree-table 渲染、modal）為 base-web 行為 → 留 prod-stack CDP 巡檢、非 017 acceptance（見下）。

## struct/命名對照（§3 紀律）
data-model 引用的命名以本 research grep 為準:base-web `Menu`/`MenuTree`/`MenuButton`/`RouteMeta` 欄名（camelCase）;rust 既有 `PageResp`/`normalize_page`/`enforce_mw`/`Claims.roles`/`Json`/`.json_binary()`/`find_active`/`SoftDeletable`。新命名:`MenuItem`/`MenuTreeItem`/`build_menu_tree`/`pages_for_roles`/`REAL_PAGES`/`DEMO_PAGES`/`sys_menu::all_active`/`menu_order`/`route_ext`。

## CDP smoke defer 風險自覺（§3 紀律）
017 **無 CDP**（純後端 read、同 016）。**風險**:curl 直送驗 wire shape ≠ base-web manage/menu tree-table 實際渲染 + role 選單授權 modal 對齊。**緩解**:活體 acceptance 對 wire shape（curl + psql）+ 純測鎖 tree/分頁;base-web 端到端（tree-table 渲染、Admin-vs-Super getAllPages 下拉差異）留 **prod-stack CDP 巡檢**（CHECKLIST §2.8 / §2.16 / §2.18 cluster）、017 backlog 登記。

---

## Research 結論
10 項全解析、**0 NEEDS CLARIFICATION**。**無 §I.5 破例**（未 grep rev1）。**無新 crate/dep**（JSONB 用 011 先例）。**最高風險**:(a) JSONB 映射〔有先例〕;(b) tree+分頁正確性〔純測鎖〕;(c) getAllPages role-aware double-JWT〔§2.17 defer〕;(d) `order` 保留字〔欄名 menu_order〕;(e) seed parent_id subquery〔同 013〕。
