# 016-manage-role-user-list — Phase 0 brainstorm spec-design

> **狀態**:brainstorm 完成、決策凍結(D1-D14)。本檔為 `/speckit-specify` 的 input,忠實落地、非自由設計。
> **產出日期**:2026-05-30
> **工作流**:CLAUDE.md §3 — 本檔(階段 0)→ `/speckit-specify`(階段 1,user 手動執行)→ plan/tasks → `superpowers:executing-plans`(階段 2)。
> **參照源隔離**:本 feature schema 補欄經 **user 授權**參照 rev1 rust-api(rust-only 最終形),以**隔離 subagent 抽純欄位事實**完成、未污染 context;屬 constitution §I.5「不准 grep rev1」的 **user 授權破例**(見 D11)。base-web typings 仍是 wire 權威、rev2 自身 pattern 是建表權威。

---

## 1. 一句話

rev2 第 16 個 feature、**Phase 4 主流業務第一刀**:落地 base-web manage 頁真正在呼叫的 **3 條 read endpoint**(`getRoleList` 分頁 / `getUserList` 分頁 / `getAllRoles`),補齊 `sys_role`/`sys_user` 的 manage 顯示欄位,並順勢做 **Phase 3 #5「真實受保護路由」首批**(3 條掛 Casbin enforce + seed policy)。menu 三件(`getMenuList`/`getMenuTree`/`getAllPages`、需建 sys_menu 表)**留 017**;資料變動補 operator(createBy/updateBy)**留 Phase 4 A**。

---

## 2. Scope(切法 = role + user)

### 2.1 In scope — 3 endpoint

| # | endpoint | method/path | 輸入 | 輸出 | enforce |
|---|---|---|---|---|---|
| 1 | getRoleList | GET `/systemManage/getRoleList` | `RoleSearchParams`(query) | `RoleList`(分頁 wrapper) | ✅ |
| 2 | getUserList | GET `/systemManage/getUserList` | `UserSearchParams`(query) | `UserList`(分頁 wrapper) | ✅(取代 013 stub) |
| 3 | getAllRoles | GET `/systemManage/getAllRoles` | — | `AllRole[]`(不分頁) | ✅ |

### 2.2 Out of scope(明確排除)

- **menu 三件**(`getMenuList/v2` / `getMenuTree` / `getAllPages`)+ **建 sys_menu 表** → **017**(最複雜、卡最多設計決策)。
- **資料變動 audit 補 operator**(createBy/updateBy 真值)→ **Phase 4 A**(與 sys_operation_log INET retrofit 同期)。
- **寫入 endpoint**(addUser/updateUser/deleteUser/addRole…、alova-only 7 endpoint)→ 後續。
- **base-web 改動** — read endpoint、base-web service 層既有(`service/api/system-manage.ts`),只對齊 wire shape、**不動 base-web**。
- **menu-auth / role-menu 關聯**(menu-auth-modal 的勾選樹)→ 隨 menu/role-menu feature。
- **enforce 全路由 rollout**(完整矩陣 + observability)→ Phase 3 #5 本體;016 只做這 3 條首批。

---

## 3. 凍結決策(D1-D14)

### D1 — 切法:role + user 兩 list(menu 留 017)
6 個 manage read endpoint 跨 role/user/menu 三域、menu 缺表 schema 缺欄,一個 spec 太大。016 只做 role + user(共 3 endpoint:getRoleList/getUserList/getAllRoles),立「分頁 facade + Output DTO + From<Entity> + enforce 掛路由」這套 pattern,017 menu 直接沿用。

### D2 — 缺欄策略:migration 補齊真實欄位
base-web manage 頁要顯示的欄(roleDesc/status/userGender/phone/email/時間欄)rust-api 現表都沒有 → 用 migration 補齊真實欄位,read endpoint 回真實資料(非 null 空殼)。

### D3 — 補欄哲學:base-web wire 驅動
只補 base-web manage 頁真正顯示/搜尋要的欄(§I.1 base-web 權威 + YAGNI)。**rev1 rust-api 當型/命名交叉參照**(D11)、非照抄。**不補** rev1 有但 base-web 不需要的:`domain`(單租戶)、`display_id`、`pid`(role 階層)、`home_route_name`、`built_in`。

### D4 — status/gender 儲存型:VARCHAR 存 base-web 的 `'1'/'2'`
status('1'啟用/'2'停用)、gender('1'男/'2'女)用 `VARCHAR(2)` 直存 base-web wire 字串值。**不用** rev1 的 PG enum type(`enabled/disabled/banned` 與 base-web '1'/'2' 不一致、改值要 migration、sea-orm enum 接線重)。**不用** SMALLINT(避免 int↔string 轉換層、對齊 008 字串慣例)。代價:DB 層不擋非法值,靠 migration column DEFAULT + app 保證。

### D5 — id wire 型:number(i64 直序列化)
rev2 `sys_role/sys_user.id` 是 i64 → 直接序列化成 JSON number,對齊 base-web typings(`CommonRecord.id: number`)。**覆寫 DESIGN §11.10「Role.id = string」拍板**(見 Deviation D-1):理由 = base-web TS typing(number)為權威、mock getAllRoles 的 string id 是 mock quirk、subagent 實測 base-web 無任何處硬依賴 string id(rowKey/edit/delete 吃 number、getAllRoles 消費的是 roleCode 非 id)。**例外**:`/auth/getUserInfo` 的 `userId` 維持 string(013 既有約定、與 016 無關、不動)。

### D6 — enforce:3 條都掛 + seed policy(Phase 3 #5 首批)
3 條 endpoint 都掛 013 的 `enforce_mw`(`route_layer` per-route),migration seed casbin policy `(role, path, GET)`:R_SUPER + R_ADMIN 可讀、R_USER_COMMON 不給 → deny(HTTP 403 + envelope 5003)。沿 013 migration 009 的 `p,role,path,method` 寫法 + `ON CONFLICT DO NOTHING` + 經 010 自動套;act=GET 與 014 menu-visibility 的 act=menu 共存於 casbin_rule。這是 Phase 3 #5「真實受保護路由」首批落地。
> **plan-research note**:013 已把 `/systemManage/getUserList` 掛 enforce_mw,migration 009 **可能已 seed 該路由的 (R_SUPER/R_ADMIN, GET) policy**。`/speckit-plan` Phase 0 須 grep 確認 013 既 seed 哪些 policy → m..015 只補尚缺者(getRoleList/getAllRoles,+ 視情況 getUserList);`ON CONFLICT DO NOTHING` 保證重 seed 冪等、不出錯。

### D7 — 查詢能力:分頁 + 全搜尋參數
- **分頁**:`current`/`size`(預設 current=1, size=10),回 `{records, current, size, total}`(DESIGN §3.4、無 pages 欄)。
- **getRoleList filter**:`roleName` 模糊(`name LIKE %x%`)、`roleCode` 模糊、`status` 等值。
- **getUserList filter**:`userName`/`nickName`/`userPhone`/`userEmail` 模糊、`userGender`/`status` 等值。
- 全走 sea-orm 參數化 builder(`.filter(Col.contains(x))`/`.eq(x)`、CHECKLIST §5.10 SQL injection 紀律、絕不字串內插)。
- 排序:`created_at DESC`(穩定排序)。`total` = 套 filter 後、分頁前 count。

### D8 — 空查詢參數:略過該 filter
base-web 搜尋框留空送 `null`/空字串 → 該 filter 不加 WHERE(回全部)。

### D9 — size 上限防護:max 100
`size > 100` 夾到 100(避免一次撈爆)。

### D10 — 只回 active(soft-delete 對齊 009)
list / getAllRoles 只回 `deleted_at IS NULL` 的列(沿 009 facade `find_active_*` 邊界)。

### D11 — schema 參照 rev1 rust-api(user 授權破 §I.5、隔離抽取)
**參照源** = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api`(實際在 fork repo `fork260509-soybean-admin-rust`、rev1-admin-rust-api 分支;rev1 已走完 DESIGN-A→DESIGN-B 遷移、nestjs 退場、後端職責全收進此 rust-only rust-api)。經 **2026-05-30 user 親授權**參照其 sys_user/sys_role schema 當型/命名交叉參照。
- **隔離方式**:用隔離 subagent 只抽**純欄位事實表**(表→欄名/型/null/約束/index),不讀 rev1 DESIGN/docs、不回設計理由、不貼整檔 → 主 context 未吸入 rev1 設計敘事(防「答案污染」+「污染 context」)。
- **權威分工**:base-web typings(§I.1)=wire 要什麼欄;rev1 rust-api=schema 落地交叉參照(非照抄);rev2 自身 pattern(009 soft-delete / 011 audit / 命名慣例)=怎麼建 migration。
- **rev1 交叉參照結果**(供型/命名對齊):role 有 `description`/`status`/`created_at`/`updated_at`;user 有 `gender`/`phone_number`/`email`/`avatar`/`nick_name`/`status`/時間欄;兩表 id 為 TEXT(UUID)、有 deleted_at + partial unique index;user↔role 為 join 表(複合 PK)。**rev2 偏離**:id 維持 i64(非 rev1 TEXT)、status/gender 用 VARCHAR '1'/'2'(非 rev1 enum)、不補 domain/display_id/pid/built_in/operator 欄。
- spec/plan 階段須記 Deviation(D-2)+ 評估 constitution §I.5 是否需 amendment 加此「rev1 rust-api schema 參照」carve-out。

### D12 — operator 欄(createBy/updateBy)折 Phase 4 A
base-web `CommonRecord` 有 `createBy`/`updateBy`(操作者顯示名、string)。016 **不補** `created_by`/`updated_by` 欄;wire 回 `null`。manage 頁這兩欄顯示空。理由:operator 歸屬與資料變動 audit(Phase 4 A、sys_operation_log operator)同性質、一起做才不重工。

### D13 — avatar 不補
base-web `User` typing 無 avatar 欄(rev1 有)→ YAGNI 不補。

### D14 — 驗收:活體 curl+psql + 純單測,無 CDP
純後端 read、無新前端行為 → 不需瀏覽器端到端;base-web SPA 端到端留 prod-stack CDP cluster(CHECKLIST §2.8)。新 dep/crate 無(純用既有 sea-orm/axum/013 enforce);仍跑一次 prod runtime image build sanity(守 §2.13 精神)。

---

## 4. 架構分層(承接既有 pattern)

```
handler/system_manage.rs(新)
  - get_role_list(State, Extension<jwt claims 經 enforce>, Query<RoleSearchParams>) -> Res<RoleList>
  - get_user_list(State, Query<UserSearchParams>) -> Res<UserList>   ← 取代 013 auth.rs::get_user_list stub
  - get_all_roles(State) -> Res<Vec<AllRole>>
  - Output DTO(serde camelCase) + From<Entity> 映射 + 分頁 wrapper 組裝
    ↓
facade/sys_role.rs · sys_user.rs(擴充)
  - 分頁查詢 fn(filter + current/size + count、只回 active、sea-orm 參數化)
  - getUserList 的 userRoles:join sys_user_role + sys_role 取 role code 陣列
  - 守 009 entity-access lint(只在 facade 碰 entity::)
    ↓
entity sys_role · sys_user(補欄、Option<T> for nullable)+ sys_user_role(既有 join)
    ↑ schema
migration:
  - m..013_alter_sys_role(+description/status/created_at/updated_at)
  - m..014_alter_sys_user(+status/gender/phone/email/created_at/updated_at)
  - m..015_seed_manage_policy(seed 3 endpoint × {R_SUPER,R_ADMIN} 的 (role,path,GET) policy)
  - lib.rs 註冊 013/014/015(接 012 後)、經 010 自動套
main.rs:3 route 掛 enforce_mw(route_layer、沿 getUserList demo)、移除 013 的 get_user_list stub route → 改指 system_manage::get_user_list
```

**承接**:008 `Res<T>` envelope、013 `enforce_mw`/jwt/bearer + `Extension`、009 soft-delete `find_active_*` 邊界 + entity-access lint、011 facade 唯一 entity 管道、010 migration 自動套。**不動 base-web**。

---

## 5. Wire DTO(對齊 base-web typings)

**分頁 wrapper**(`RoleList`/`UserList`):
```
{ records: [RoleItem|UserItem...], current: number, size: number, total: number }
```

**RoleItem**(getRoleList records;getAllRoles 回其子集 `{id, roleName, roleCode}`):
```
id: number(i64), roleName(name), roleCode(code), roleDesc(description),
status('1'/'2'), createTime(created_at), updateTime(updated_at),
createBy: null, updateBy: null    ← operator 折 Phase 4 A
```

**UserItem**(getUserList records):
```
id: number(i64), userName(user_name), nickName(nick_name), userGender(gender '1'/'2'|null),
userPhone(phone|null), userEmail(email|null), userRoles: [role code…](join),
status('1'/'2'), createTime, updateTime, createBy: null, updateBy: null
```

**RoleSearchParams**(query、皆 optional/nullable):`roleName`/`roleCode`/`status`/`current`/`size`
**UserSearchParams**(query、皆 optional/nullable):`userName`/`userGender`/`nickName`/`userPhone`/`userEmail`/`status`/`current`/`size`

---

## 6. 測試策略(CLAUDE.md §3)

- **純單測 test-first**:
  - filter 組裝 + 分頁 SQL-build(沿 011 `*_active_model` SQL-build / 014 `filter_routes_for_roles` 模式):驗 LIKE 模糊 + eq + LIMIT/OFFSET + count query。
  - `From<Entity>→DTO` 映射(欄位對映、status/gender 字串、id number、createBy/updateBy null)。
  - size clamp(>100→100)、空參數略過 filter、預設 current=1/size=10。
- **活體 acceptance(curl + psql)**:
  - getRoleList/getUserList 分頁(current/size/total/records)+ filter(roleName 模糊命中、status 等值)+ 只回 active。
  - getAllRoles 回 active role 子集(id/roleName/roleCode)。
  - **enforce**:Super/Admin 200、**User 403+5003**、無/壞 token 3333。
  - userRoles join 正確(Super→[R_SUPER]、User→[R_USER_COMMON]…)。
  - status/gender 回 '1'/'2' 字串、id 回 number。
- **prod runtime image build sanity**(無新 crate/dep,仍驗一次、守 §2.13 精神)。
- **無 CDP**(純後端 read)。

---

## 7. Commit(兩段式、不動 base-web)

- **rust-api worktree**:migration ×3(013/014/015)+ entity ×2 + facade ×2(sys_role/sys_user 擴充)+ handler/system_manage.rs(新)+ main.rs(route + 移 stub)→ push fork `rev2-admin-rust-api`。
- **外層**:spec docs(`specs/016-*/`)+ 本 brainstorm doc + rust-api SHA pin + docs 回填 → feature branch `016-manage-role-user-list`(`/speckit-specify` pre-hook 建)。
- **不動 base-web**(read endpoint、wire 對齊既有 typings)。

---

## 8. Deviation 預登(spec/plan 階段正式記)

- **D-1**:id wire 型 = number(覆寫 DESIGN §11.10 「Role.id = string」拍板)。理由見 D5(base-web typings number 為權威、mock string 是 quirk、實測無硬依賴)。spec 階段評估是否需更新 DESIGN §11.10 / constitution。
- **D-2**:schema 補欄參照 rev1 rust-api(user 授權破 constitution §I.5「不准 grep rev1」;隔離 subagent 抽純欄位事實、未污染 context)。spec/plan 評估 §I.5 是否需 amendment 加此 carve-out。
- **D-3**:operator 欄(createBy/updateBy)+ status/gender 的 DB 層值域約束 折 Phase 4 A(016 status/gender 用 VARCHAR、靠 default+app 保證、DB 不擋非法值)。

---

## 9. 下一步

`/speckit-specify`(**user 手動執行**,勿排進 brainstorm 流程觸發、否則 `speckit.git.feature` pre-hook 不會跑)→ input = 本檔。之後 `/speckit-clarify` →(`/speckit-plan` Phase 0 research 須隔離參照 rev1 + grep base-web typings/rust-api 真實型)→ `/speckit-tasks` →(`/speckit-analyze`)→ `superpowers:executing-plans`。
