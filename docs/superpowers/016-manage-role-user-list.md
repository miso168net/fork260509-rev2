# 016-manage-role-user-list — Phase 0 brainstorm spec-design

> **狀態**:brainstorm 完成、決策凍結(D1–D12)。本檔為 `/speckit-specify` 的 input,忠實落地、非自由設計。
> **產出日期**:2026-06-01
> **工作流**:CLAUDE.md §3 — 本檔(階段 0)→ `/speckit-specify`(階段 1,**user 手動執行**,勿排進 brainstorm 觸發、否則 `speckit.git.feature` pre-hook 不跑)→ `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →(`/speckit-analyze`)→ `superpowers:executing-plans`(階段 2)。
> **參照源紀律**:本 feature **不參照 rev1**(§I.5 完整遵守)—— 因採「不動表、缺欄回 null」(D2),不需設計新 schema,故無 rev1 schema 交叉參照需求。base-web typings 為 wire 權威、rev2 自身 pattern(008/009/013/014)為實作權威。
> **與舊備份無關**:本檔為 2026-06-01 全新 brainstorm 產出,**不採用** `rebase260531-*` 備份分支的任何 spec/實作/決策(user 2026-06-01 明示)。關鍵差異:舊備份走「migration 補欄 + id=number + 破 §I.5 參照 rev1」,本設計走「不動表回 null + id=string(當前凍結值)+ 不碰 rev1」。

---

## 1. 一句話

rev2 第 16 個 feature、**Phase 4 主流業務第一刀**:落地 base-web 系統管理頁真正在呼叫的 **3 條 read endpoint**(`getUserList` 分頁 / `getRoleList` 分頁 / `getAllRoles` 全量),讓 admin panel **第一次從「能登入但看空頁」變成「真的列得出 user/role」**。立起「分頁 facade + Output DTO(`From<Model>`)+ enforce 掛路由」這套 pattern 供後續 manage feature(menu / CRUD)沿用。

---

## 2. Scope(切法 = user + role,read-only)

### 2.1 In scope — 3 endpoint(全 GET、唯讀)

| # | endpoint | method/path | 輸入 | 輸出 | 分頁 | enforce |
|---|---|---|---|---|---|---|
| 1 | getUserList | GET `/systemManage/getUserList` | `UserSearchParams`(query) | `PageRes<UserItem>` | ✅ | ✅(取代 013 stub) |
| 2 | getRoleList | GET `/systemManage/getRoleList` | `RoleSearchParams`(query) | `PageRes<RoleItem>` | ✅ | ✅ |
| 3 | getAllRoles | GET `/systemManage/getAllRoles` | — | `Vec<AllRoleItem>` | ❌ 全量 | ✅ |

### 2.2 Out of scope(明確排除)

- **menu 三件**(`getMenuList/v2` / `getMenuTree` / `getAllPages`)+ **建 sys_menu 表** → **Phase 4 #4 菜單樹建構 feature**(最複雜、需先建 sys_menu schema;現有 `route/menu.rs` 是 in-code 唯讀路由可見性樹,語意不同、不能重用為 CRUD menu)。
- **寫端 CRUD**(addUser/updateUser/deleteUser/batchDeleteUser)+ alova endpoint → **Phase 4 #3**(才啟用 MODAL-WIRING ★ / BASE-WEB-WRAPPER ★ 軌道)。
- **§I.6 審計欄 retrofit**(sys_user/sys_role 補 created_by/updated_by/deleted_by 等)+ **業務顯示欄補欄**(status/email/phone/gender/roleDesc 真值寫入)→ **綁 Phase 4 write 那一波**(需 operator 寫入路徑才填得了 `*_by`;見 D2 + CHECKLIST §2.18/§2.19)。
- **base-web 改動** — read endpoint、base-web service 層既有(`src/service/api/system-manage.ts` 的 `fetchGetUserList`/`fetchGetRoleList`/`fetchGetAllRoles`),只對齊 wire shape、**不動 base-web**。base-web TS 型補正(`rev2-extra.d.ts`)列 follow-up、非本 feature。
- **enforce 全路由 rollout**(完整矩陣 + observability + verify_and_load helper 抽取)→ Phase 3 #4/#5;016 只做這 3 條 + 對應 policy seed。

---

## 3. 凍結決策(D1–D12)

### D1 — 切法:user + role 三 endpoint(menu 留 Phase 4 #4)
6 個 manage read endpoint 跨 user/role/menu 三域;menu 三件**缺整套 sys_menu 表**(無 entity/migration/facade),需獨立 feature 先建 schema。016 只做有 DB 地基的 user + role(getUserList/getRoleList/getAllRoles),立 pattern,menu 留 Phase 4 #4 沿用。

### D2 — 缺欄策略:★ 不動資料表、缺欄 DTO 回 null/空(零 business-table migration)
base-web `User`/`Role` DTO 想顯示的欄,rust entity 多半沒有:
- **entity 有的** → 真值:user `userName`←`user_name` / `nickName`←`nick_name`;role `roleName`←`name` / `roleCode`←`code`。
- **entity 無的 nullable 欄** → wire 回 `null`:`userGender` / `userPhone` / `userEmail` / `status` / `roleDesc` / `createBy` / `createTime` / `updateBy` / `updateTime`。
- **collection** → 空陣列(非 null):`userRoles`(實際有值、見 D4)。

**理由**:(1) 這是 **read-only** feature,seed 的 Super/Admin/User 本來就沒有 email/gender/status 等資料,回 null 是**誠實的**(沒這資料就是沒有)。(2) 真正要儲存這些業務欄 + 審計欄,是日後 **addUser/updateUser(write)** 的事——到時一次加齊「業務顯示欄 + §I.6 六審計欄」並接 operator 寫入路徑,**避免反覆動表**(動 schema 一次到位)。(3) 零 migration = 零 schema 風險、dev DB 不需重置。
**代價**:manage 頁 status/email/gender/phone/roleDesc/時間欄顯示空白——已知並接受(seed 資料本就無這些;CDP 驗證時若某 null 欄令 base-web 表格 render 壞,該欄 implementer 改回 `""`)。
> ⚠️ 與舊備份 rebase260531-016 相反(它選 migration 補欄)。本設計刻意走零 schema 的精簡路。

### D3 — id wire 型:string(DTO 層 i64 → to_string,對齊**當前**凍結值)
DB / entity / facade 全程 `id: i64` 不變;**wire 邊界(DTO 層)** 做 `id.to_string()` 後才序列化吐出。對齊 **當前 rev2-admin-root** constitution §I.3 凍結值「`Role.id` / `MenuRoute.id` = **string**」。沿用 013 `getUserInfo.userId = claims.user_id.to_string()` 的既有 pattern(codebase 已有先例)。
- **base-web TS 宣告 `id:number`**:runtime JS 不會壞(只 TS 型不準);型補正交 BASE-WEB-ADAPT `rev2-extra.d.ts`,**列 follow-up、非本 feature**(CDP 驗證不需型補正)。
- **DESIGN §1.5/§3.6 殘留「id=number」表述** = 已知文件矛盾(凍結權威是 string);本 feature act on 凍結值 string,spec 階段標記 DESIGN 待掃清、**不為此走 amendment**(舊備份的 number amendment 留在備份分支、未進 rev2-admin-root,當前凍結值仍 string)。

### D4 — userRoles:批次查避 N+1
`getUserList` 每列要 `userRoles: Vec<String>`(角色 code 陣列)。現有 `roles_for_user` 是 per-user 單查 → 列表 N 列 = N+1 query。**新增批次 facade fn** `sys_user_role::roles_for_users(db, &[i64]) -> HashMap<i64, Vec<String>>`:一次 `WHERE user_id IN (...)` join sys_role 取 code,整頁一次組裝(固定 2 query:user 一次 + roles 一次)。與既有單筆 `roles_for_user`(login/getUserInfo 用)並存。

### D5 — 分頁:current/size + clamp,回 `{current,size,total,records}`
- 預設 `current=1`、`size=10`;`size` clamp max 100(避免一次撈爆)。
- wrapper `PageRes<T> { current, size, total, records }` —— 4 欄、**無 `pages`、無 `success`**(對齊 base-web `PaginatingQueryRecord` + constitution §I.3)。
- `total` = 套 filter 後、分頁前的 count;`current` 1-based → sea-orm `fetch_page` 0-based 減 1。
- 排序 `created_at DESC`?—— **entity 無 created_at(D2 不補)→ 改用 `id DESC` 穩定排序**(seed id 1/2/3,新→舊)。

### D6 — search filter:只濾 entity 有對應欄的,空參數略過
- **getUserList**:`userName`(`user_name` LIKE)、`nickName`(`nick_name` LIKE)。
- **getRoleList**:`roleName`(`name` LIKE)、`roleCode`(`code` LIKE)。
- base-web 還會送 `userGender`/`userPhone`/`userEmail`/`status`/`roleDesc` 等 → **entity 無對應欄、傳了忽略**(一致於 D2 缺欄策略;不報錯)。
- 空字串 / None → 該 filter 不加 WHERE(回全部)。全走 sea-orm 參數化 builder(`.contains()` / `.eq()`,CHECKLIST §5.10 SQL injection 紀律,絕不字串內插)。

### D7 — enforce:3 條都掛 + seed policy(本 feature 唯一 migration)
3 條 endpoint 都掛 013 的 `enforce_mw`(`route_layer` per-route)。**新增一個 seed migration**(只 seed casbin policy、**不動任何業務表**)補對應 policy:

| endpoint | R_SUPER | R_ADMIN | R_USER_COMMON |
|---|---|---|---|
| getUserList | ✓(013 migration 009 已 seed) | ✓(013 已 seed) | ✗ |
| getRoleList | ✓(補) | ✓(補) | ✗ |
| getAllRoles | ✓(補) | ✓(補) | ✓(`p, *, /systemManage/getAllRoles, GET`) |

- 沿 013 migration 009 寫法:`p,role,path,method` + `ON CONFLICT DO NOTHING`(冪等)+ 經 010 自動套;`act=GET` 與 014 menu-visibility 的 `act=menu` 共存於 casbin_rule(RBAC model 不改)。R_SUPER 視 013 是否已有 wildcard 決定補法(plan Phase 0 grep 確認)。
- **policy seed 歸屬**:本 feature「endpoint 落地才有 path 可 seed」→ 隨 endpoint 補對應 policy 最自洽;Phase 3 #4 退為「全路由 rollout + 矩陣治理」(spec/CHECKLIST 標分工,避免與 #4 重複 seed;`ON CONFLICT` 保證重 seed 安全)。
- 這是本 feature **唯一 migration**(policy seed、非業務表 alter)——符合 D2「不動業務表」(casbin_rule 是 policy 表)。

### D8 — 只回 active(soft-delete 對齊 009)
list / getAllRoles 只回 `deleted_at IS NULL` 的列(沿 009 facade `find_active` 邊界)。

### D9 — password 不入 wire(關鍵不變式)
`sys_user::Model` 含 `password`。**UserItem DTO 無 password 欄**;handler 組 DTO 時不取(或 facade 查詢用 `select_only()` 投影排除 password,從源頭杜絕——plan 階段定,傾向投影)。純單測斷言 UserItem 序列化 JSON **不含** `"password"` key。

### D10 — 不動 base-web
read endpoint、base-web service 層既有 axios call(`system-manage.ts`)已存在,wire shape 對齊即直接通。**只動 rust-api**(RUSTAPI-SOURCE-ISOLATION 軌道),不碰任何 ★ 軌道(MODAL-WIRING/WRAPPER/BUILD-CONFIG 都是寫端/menu 的事)。base-web `id:number` 型補正 d.ts 列 follow-up。

### D11 — 測試:純函式 test-first + live-DB + curl/psql + CDP
- **純單測 test-first**:(a) DTO 映射(`From<Model>`:id stringify、缺欄→null、enum)、(b) 分頁參數正規化(current-1、size 預設 10 / clamp 100)、(c) filter SQL-build(userName→LIKE、空略過、`id DESC`、count query)——沿 011/015 `*_active_model` SQL-build 模式。
- **live-DB `#[ignore]`**(放 facade/,env-gate DATABASE_URL):分頁查 + total + `roles_for_users` 批次正確、只回 active。
- **curl + psql acceptance**:3 endpoint × 3 角色 allow/deny(Super/Admin 200、**User 403+5003**、無/壞 token 3333);回應 shape(envelope `{data,code,msg}` / pagination 4 欄 / **id=string** / userRoles 陣列 / 無 password);分頁 current/size/total 正確;filter 命中。
- **CDP(端到端價值驗收)**:base-web `/manage/user`、`/manage/role` 頁登入後**顯示 seed 的 user/role 列表** —— 這是「admin panel 第一次看到真資料」的證明(dev vite proxy,沿 013/014 CDP 模式)。
- **守恆**:server 既有測試 + entity_access_lint(新 facade fn 在 facade/、handler 不碰 entity::)+ xdb 全綠;`grep Migrator::up`=0。
- **無新 crate/dep**(純用既有 sea-orm/axum/013 enforce/008 envelope)→ prod runtime image build **非強制**(可選 sanity)。**無 CDP 以外**:純後端 read 行為 + 一條瀏覽器列表顯示驗收。

### D12 — 收尾:兩段式 commit、不動 base-web
- **rust-api worktree**:seed migration ×1 + facade 擴充(sys_user/sys_role list 查詢 + sys_user_role 批次)+ handler/system_manage.rs(新)+ main.rs(getUserList 換掉 013 stub + 加 2 route,各掛 enforce_mw)+ 移除 013 `auth::get_user_list` stub + `UserListStub`(我的改動造成的 orphan)→ push fork `rev2-admin-rust-api`。
- **外層**:spec docs(`specs/016-manage-role-user-list/`)+ 本 brainstorm doc + rust-api SHA pin + docs 回填 → feature branch `016-manage-role-user-list`(`/speckit-specify` pre-hook 建;與備份 `rebase260531-016-*` 是不同分支)。
- **不動 base-web**。

---

## 4. 架構分層(承接既有 pattern)

```
handler/system_manage.rs(新)
  - get_user_list(State, Query<UserSearchParams>) -> Res<PageRes<UserItem>>   ← 取代 013 auth.rs::get_user_list stub
  - get_role_list(State, Query<RoleSearchParams>) -> Res<PageRes<RoleItem>>
  - get_all_roles(State) -> Res<Vec<AllRoleItem>>
  - Output DTO(serde camelCase)+ From<Model> 映射(id i64→string、缺欄→null)+ 分頁 wrapper 組裝
    ↓
facade/sys_user.rs · sys_role.rs · sys_user_role.rs(擴充,守 009 lint)
  - sys_user::list_active_paginated(db, filter, current, size) -> (Vec<Model>, u64 total)
  - sys_role::list_active_paginated(db, filter, current, size) -> (Vec<Model>, u64 total)
  - sys_role::list_active_all(db) -> Vec<Model>                 ← getAllRoles 用
  - sys_user_role::roles_for_users(db, &[i64]) -> HashMap<i64, Vec<String>>   ← D4 批次避 N+1
  - SQL-build seam:filter 組裝抽純 fn(供 no-DB 單測)
    ↓
entity sys_user · sys_role · sys_user_role(既有、不動 — D2 零 business migration)
    ↑
migration:m20260529_000013_seed_manage_policy(接 015 的 011/012 後;只 seed casbin policy、不動業務表;lib.rs 註冊、經 010 自動套)
main.rs:getUserList route 換指 system_manage::get_user_list + 加 getRoleList/getAllRoles 2 route,各 .route_layer(enforce_mw);移除 013 stub
```

**承接**:008 `Res<T>` envelope、013 `enforce_mw`/jwt/bearer、009 soft-delete `find_active` 邊界 + entity-access lint、011 facade 唯一 entity 管道、010 migration 自動套、015 全域 ctx_mw(不動,仍包所有 route)。**不動 base-web**。

---

## 5. Wire DTO(對齊 base-web typings,id=string、缺欄 null)

**分頁 wrapper**(各 `#[serde(rename_all="camelCase")]`):
```
PageRes<T> { current: u64, size: u64, total: u64, records: Vec<T> }   // 4 欄,無 pages/success
```

**UserItem**(getUserList records;**無 password**):
```
id: String(i64→to_string), userName(user_name), nickName(nick_name|null),
userGender: null, userPhone: null, userEmail: null,       ← entity 無欄、回 null(D2)
userRoles: Vec<String>(批次 join、D4), status: null,
createBy: null, createTime: null, updateBy: null, updateTime: null
```

**RoleItem**(getRoleList records):
```
id: String, roleName(name), roleCode(code),
roleDesc: null, status: null,                              ← entity 無欄、回 null
createBy: null, createTime: null, updateBy: null, updateTime: null
```

**AllRoleItem**(getAllRoles,Role 子集):`{ id: String, roleName, roleCode }`

**UserSearchParams**(query、皆 optional;只 `userName`/`nickName` 真正生效,餘忽略):
`userName?` `nickName?` `userGender?` `userPhone?` `userEmail?` `status?` `current?` `size?`
**RoleSearchParams**(query、只 `roleName`/`roleCode` 生效):`roleName?` `roleCode?` `status?` `current?` `size?`

> null 欄實作用 `Option<T>`(`None` → 顯式 `null`,不 skip)。base-web typing 對這些欄宣告非 nullable string,但實測表格 render 容 null;若 CDP 發現某欄 render 壞,該欄改回 `""`(空字串)。

---

## 6. 與既有關係 / 不變式

- **不建新表、不 alter 業務表、無新 crate、無新 dep**;唯一 migration = casbin policy seed。
- 013 `getUserList` stub(`auth.rs::get_user_list` + `UserListStub`)被取代並刪除(orphan 清理)。
- 009 soft-delete:只回 active。011 audit:read-only、不寫 audit。008 envelope:`Res<T>` 包分頁。010:seed migration 自動套。013 enforce:3 route 掛 `enforce_mw`。015 ctx_mw:不動。
- **wire 不變式**(constitution §I.3):envelope `{data,code,msg}` code=string / pagination 4 欄無 pages / **id=string** / status nullable / 業務碼 5xxx(本 feature read 主要 0000,enforce deny=5003)/ 各 DTO 自帶 camelCase。

---

## 7. Deviation 預登(spec/plan 階段正式記)

- **D-1**:`id` wire 型 = **string**(act on 當前 constitution §I.3 凍結值)。DESIGN §1.5/§3.6 殘留「number」表述為已知文件矛盾 → spec 階段標記掃清,**不走 amendment**(凍結權威已是 string)。
- **D-2**:業務顯示欄(status/email/gender/phone/roleDesc/時間)+ §I.6 審計欄(created_by/updated_by/deleted_by)**本 feature 不補**、wire 回 null → 折 Phase 4 write 那一波(需 operator 寫入路徑;CHECKLIST §2.18/§2.19)。
- **D-3**:policy seed 隨本 feature 補(getRoleList/getAllRoles + 視情況 getUserList),與 Phase 3 #4 policy seed feature 分工(本 feature 自洽補對應 endpoint policy、#4 退為 rollout+治理);`ON CONFLICT DO NOTHING` 保冪等。

---

## 8. 下一步

`/speckit-specify`(**user 手動執行**,勿排進 brainstorm 觸發、否則 `speckit.git.feature` pre-hook 不跑)→ input = 本檔。之後 `/speckit-clarify` →（`/speckit-plan` Phase 0 research 須 grep `facade/sys_*.rs` 真實返回型 + entity `Model` 欄位 + base-web typings 3 端對齊,**不參照 rev1**)→ `/speckit-tasks` →（`/speckit-analyze`）→ `superpowers:executing-plans`。
