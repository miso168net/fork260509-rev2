# Research: 016-manage-role-user-list（Phase 0）

> **§I.5 紀律 + user 授權破例**:本 feature 多數 grep 對象為 **rev2 自身**（rust-api entity/facade/migration/main + base-web typings）。**rev1 rust-api schema 經 2026-05-30 user 授權交叉參照**（破 §I.5「不准 grep rev1」、見 R9）—— 以**隔離 subagent 抽純欄位事實**完成、未讀 rev1 設計文件、未污染 context。日期 2026-05-30。**0 NEEDS CLARIFICATION**。

## grep 事實基準（rev2，2026-05-30）

- **base-web typings**（`base-web/src/typings/api/`）:
  - `common.d.ts`:`EnableStatus = '1'|'2'`；`CommonRecord<T>` = `{id:number, createBy:string, createTime:string, updateBy:string, updateTime:string, status:EnableStatus|null} & T`；`PaginatingCommonParams = {current:number, size:number, total:number}`；`PaginatingQueryRecord<T>` = 前者 + `records:T[]`。
  - `system-manage.d.ts`:`Role = CommonRecord<{roleName,roleCode,roleDesc}>`；`AllRole = Pick<Role,'id'|'roleName'|'roleCode'>`；`RoleSearchParams = Nullable<Pick<Role,'roleName'|'roleCode'|'status'> & {current,size}>`；`UserGender='1'|'2'`；`User = CommonRecord<{userName, userGender:UserGender|null, nickName, userPhone, userEmail, userRoles:string[]}>`；`UserSearchParams = Nullable<Pick<User,'userName'|'userGender'|'nickName'|'userPhone'|'userEmail'|'status'> & {current,size}>`。
  - `service/api/system-manage.ts`:`fetchGetRoleList(GET /systemManage/getRoleList, RoleSearchParams → RoleList)`、`fetchGetAllRoles(GET /systemManage/getAllRoles → AllRole[])`、`fetchGetUserList(GET /systemManage/getUserList, UserSearchParams → UserList)`。
- **rust-api entity**（`rust-api/entity/src/`）:
  - `sys_role`:`id:i64`(auto_increment) / `code:String` / `name:String` / `deleted_at:Option<DateTimeWithTimeZone>`。**缺** description/status/時間欄。
  - `sys_user`:`id:i64`(**非** auto_increment) / `user_name:String` / `password:String` / `nick_name:Option<String>` / `deleted_at:Option<...>`。**缺** status/gender/email/phone/時間欄。
  - `sys_user_role`:`user_id:i64` + `role_id:i64`（複合 PK、純 join、無 soft-delete）。
- **migration**（`rust-api/migration/src/`）:最後一個 = `m20260529_000012`（create_sys_login_attempt）→ **016 新 migration 從 `m20260529_000013` 起**（同步 `lib.rs` 的 mod + migrations() vec）。sys_user id `big_integer().not_null().primary_key()`（無 auto_increment、CHECKLIST §2.10 已記）；sys_role id `big_integer().auto_increment().primary_key()`。
- **facade**（`rust-api/server/src/model/facade/`）:`sys_role::find_active()->Select<Entity>`；`sys_user::find_active()` / `find_active_by_name` / `find_active_by_id` / `soft_delete`；`sys_user_role::roles_for_user(db,user_id)->Vec<String>`（兩步:user_role 取 role_id 集 → sys_role active 過濾 id IN、只取 code）。**全 codebase 無 `.paginate(`/`.like(`/`.contains(`**（016 首次引入 sea-orm 分頁 + LIKE）。
- **enforce**（`auth/enforce.rs`）:`enforce_mw(State<AppState>, Request, Next)->Response`；對每 claims.role enforce `(role,path,method)`、任一 allow→pass、全 deny→403+5003、token 壞→3333。
- **既有 policy seed**:`m..009_seed_casbin_policy` 只 seed `('p',R_SUPER,/systemManage/getUserList,GET,...)` + `('p',R_ADMIN,...)`（R_USER_COMMON 不放）。`m..010_seed_menu_policy` seed v2='menu' domain（與 endpoint policy v2=method 區隔）。→ **getUserList 的 (R_SUPER/R_ADMIN,GET) 已 seed、016 不重 seed；getRoleList/getAllRoles 未 seed、016 補**。
- **013 stub**（`handler/auth.rs:311-330`）:`UserListStub{list:Vec<()>, total:u64}`、`get_user_list()->Res<UserListStub>` 永回 `{list:[],total:0}`。main.rs:92 `/systemManage/getUserList` route_layer enforce_mw。**016 取代:DTO 換成分頁形、handler 搬到 system_manage.rs、移除 stub**。
- **008 envelope**:`Res<T>{data,code,msg}`、`Res::ok(data)`、分頁 wrapper 當 T 包入。**009 entity-access lint**:facade 目錄外任何 `use entity::` root path → build fail（016 所有 entity 存取必落 `src/model/facade/`）。**serde camelCase**:DTO `#[serde(rename_all="camelCase")]`。**Query extractor**:route.rs:95 既有 `Query<T>` pattern。

---

## R1. 三 endpoint wire 形（對齊 base-web typings 權威）

**Decision**:`getRoleList`/`getUserList` 回分頁 wrapper `{records:[...], current, size, total}`（包在 `Res::ok`）；`getAllRoles` 回 `AllRole[]`（純陣列、不分頁）。query 走 GET query string（`Query<SearchParams>`、camelCase）。

**Rationale**:base-web `PaginatingQueryRecord` = `{records,current,size,total}`（無 pages）；`fetchGetAllRoles` 無 params 回純陣列。對齊 §I.1 base-web 權威 + §I.3 envelope。

## R2. status / gender 儲存型 = VARCHAR '1'/'2'（brainstorm D4）

**Decision**:`status`/`gender` 存 `VARCHAR`、值為 base-web 列舉字串 `'1'/'2'`。entity 型 `String`（status NOT NULL）/ `Option<String>`（gender nullable）。

**Rationale**:base-web `EnableStatus='1'|'2'`、`UserGender='1'|'2'`、`CommonRecord.status:EnableStatus|null`。VARCHAR 直存免轉換層、避 rev1 PG enum（`enabled/disabled/banned`）與 base-web 不一致 + sea-orm enum 接線重。代價:DB 不擋非法值（靠 migration default + app；折 Phase 4 A 的 DB 約束）。

**Alternatives**:SMALLINT（否決、需 int↔string 轉換）；PG enum（否決、rev1 值域與 base-web 不一致）。

## R3. 補欄清單（migration alter + entity）

**Decision**:兩個 alter migration（沿 m..008 nick_name alter 慣例），entity 同步加欄。

- **`m..013_alter_sys_role`**:`+description VARCHAR null`、`+status VARCHAR not null default '1'`、`+created_at TIMESTAMPTZ not null default now()`、`+updated_at TIMESTAMPTZ null`。
- **`m..014_alter_sys_user`**:`+status VARCHAR not null default '1'`、`+gender VARCHAR null`、`+phone VARCHAR null`、`+email VARCHAR null`、`+created_at TIMESTAMPTZ not null default now()`、`+updated_at TIMESTAMPTZ null`。

**status default '1'**:既有 3 seed user/role 在加 NOT NULL status 欄時靠 column DEFAULT `'1'` 自動補（否則 ALTER 炸）。created_at default now() 同理。

**不補**（brainstorm D3/D12/D13 + rev1 偏離）:`domain`/`built_in`/`avatar`/`display_id`/`pid`/`home_route_name`（rev1 有、base-web 不需）、`created_by`/`updated_by`（operator 折 Phase 4 A、wire 回 null）。

**updated_at nullable vs not-null**:rev1 updated_at nullable。016 取 **nullable**（未更新時為 null、對齊 rev1 + 語意正確）；但 base-web `updateTime:string` 非 nullable → wire 序列化時 null 轉空字串或回 null（data-model 定）。

## R4. 分頁 + filter 查詢（facade、首次引入 sea-orm 分頁/LIKE）

**Decision**:facade 新增分頁查詢 fn（沿 find_active soft-delete base query）:
- `sys_role`:list fn（filter roleName/roleCode LIKE + status eq + 分頁 + count）、all-active fn（getAllRoles 用）。
- `sys_user`:list fn（filter userName/nickName/phone/email LIKE + gender/status eq + 分頁 + count）。
- 用 sea-orm `PaginatorTrait::paginate(db, size).fetch_page(current-1)` + `.num_items()` 取 total，或手動 `.limit/.offset` + 另查 count。抽 SQL-build seam 供純單測（沿 011/015 `*_active_model` 模式）。
- filter 全 `.filter(Col.contains(x))`（LIKE %x%）/ `.eq(x)`（CHECKLIST §5.10 參數化、絕不字串內插）。空參數略過該 filter（brainstorm D8）。size clamp max 100（D9）、預設 current=1/size=10。

**Rationale**:無既有分頁可抄、016 立 pattern（017 menu 沿用）。sea-orm paginate/like 內建、無新 dep。

## R5. userRoles join（getUserList 每列）

**Decision**:getUserList 每列的 `userRoles:string[]` = `sys_user_role::roles_for_user(db, user.id)`（既有 fn、回 role code 陣列）。

**Rationale**:base-web `User.userRoles:string[]` 是 role **code** 集合（非 id）、getAllRoles 下拉也用 code。沿 013 getUserInfo 既有 join pattern。**注意 N+1**:每 user 兩 query → 大量 user 時可優化成批次 join，但既有 pattern 逐 user、016 admin 低流量先沿用（plan 標 follow-up:批次優化）。

## R6. password 洩漏防護（關鍵）

**Decision**:`sys_user::find_active()` 回 raw `Model`（含 password）。getUserList wire DTO **絕不含 password** → facade 層 list fn 用 `select_only()` 投影只取需要欄，或組 DTO 時顯式排除 password。

**Rationale**:list 大量回傳、password 外洩風險高於單筆。沿 009 redact 精神（但這裡是 list 投影、非 audit redact）。data-model 明訂 UserItem DTO 無 password 欄。

## R7. enforce 接線 + policy seed（brainstorm D6、Phase 3 #5 首批）

**Decision**:3 條 endpoint 都在 main.rs 比照 getUserList 用 `.route_layer(from_fn_with_state(state.clone(), enforce_mw))` 掛 per-route enforce。`m..015_seed_manage_policy` 補 seed（009 已有 getUserList、只補缺者）:
```
('p','R_SUPER','/systemManage/getRoleList','GET','','',''),
('p','R_ADMIN','/systemManage/getRoleList','GET','','',''),
('p','R_SUPER','/systemManage/getAllRoles','GET','','',''),
('p','R_ADMIN','/systemManage/getAllRoles','GET','','','')
```
`ON CONFLICT DO NOTHING`（沿 m..009）、R_USER_COMMON 不放（deny）、經 010 自動套。getUserList 不重 seed（009 已有）。

**Rationale**:授權決策走 Casbin（不在 handler 內判角色）、與 013 一致。Phase 3 #5「真實受保護路由」首批。

## R8. id wire 型 = number（constitution v1.1.0 amend）

**Decision**:Role/User id 序列化成 JSON **number**（i64 直序列化）。**已 amend constitution §I.3/§11.10 string→number（v1.1.0、commit e2da9c3）**。

**Rationale**:base-web TS typing `CommonRecord.id:number` 為 §I.1 權威；mock getAllRoles 的 string id 是 mock 自身與 typing 打架的 quirk；subagent 實測 base-web 無處硬依賴 string（rowKey/edit(id)/delete(id) 吃 number、getAllRoles 下拉用 roleCode 非 id）。改 number 更忠於 §I.1、免動 base-web。**例外** getUserInfo.userId 維持 string（auth.d.ts typing 即 string、013 既有）。

## R9. rev1 schema 交叉參照（user 授權破 §I.5、隔離抽取）

**Decision**:補欄型/命名經 **user 授權**交叉參照 rev1 rust-api（`fork260509-rev1`、rust-only 最終形）。隔離 subagent 只抽純欄位事實（rev1 role 有 description/status/created_at/...;user 有 gender/phone_number/email/avatar/...;均 TEXT id + deleted_at + 審計欄;user↔role join 表）。**未讀 rev1 設計文件、未污染設計**。

**rev2 偏離 rev1**:id 維持 i64（非 TEXT）、status/gender VARCHAR '1'/'2'（非 PG enum）、不補 domain/display_id/pid/built_in/avatar/operator 欄。

**Rationale**:base-web typings 為 wire 權威、rev1 為 schema 落地交叉參照（非照抄）、rev2 自身 pattern（009/011 命名慣例）為建表權威。spec/plan 記 Deviation D-2。

## R10. 既有契約守恆 + 無新 dep

**Decision**:守 **008 envelope**（Res<T>）+ **009 entity-access lint**（所有 sys_role/sys_user/sys_user_role 查詢落 facade）+ **007 FR-009**（migration 經 010 自動套、server 不自動 migrate）+ **soft-delete**（只回 active）。**無新 workspace crate、無新 dep**（sea-orm paginate/like 內建）→ 依 CLAUDE.md §3 不觸發「必含 prod image build」鐵律；但 acceptance 仍對 live postgres 跑 migration + 三 endpoint。

---

## Research 結論

10 項全解析、**0 NEEDS CLARIFICATION**。**§I.5 破例**（R9、user 授權、隔離抽取）。**無新 crate/dep**。**最高風險點**:(a) password 洩漏（R6、list 投影排除）；(b) 首次引入 sea-orm 分頁 + LIKE（R4、無既有可抄、立 pattern）；(c) status NOT NULL 加欄須 default 護既有 seed（R3）；(d) userRoles N+1 join（R5、低流量先沿用、標 follow-up）；(e) id 型 amend（R8、constitution v1.1.0 已改）。
