# Tasks: 016-manage-role-user-list

**Branch**: `016-manage-role-user-list` | **Date**: 2026-06-01
**Input**: [plan.md](plan.md) / [spec.md](spec.md) / [research.md](research.md) / [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md)

> **實作交棒對象**:本檔。用 `superpowers:executing-plans`(**非** `/speckit-implement`)起手 → 轉 `superpowers:subagent-driven-development` + TDD。
> **TDD 紀律**(CLAUDE.md §3 / §I.4):純函式(DTO 映射 / 分頁參數正規化 / filter SQL-build / roles 批次 SQL-build)**test-first(red→green)**;wiring(handler/route/main.rs)**無新純函式單測 → 由 curl/psql/CDP acceptance 覆蓋**(各 task 已明示)。
> **★ 鐵紀律**:本檔**不含**任何 `git push` / `git merge` / 外層 bump SHA pin —— 那些只在 `superpowers:finishing-a-development-branch` 階段執行(§3)。實作期間的 worktree `git commit` 可,push/merge 不可。
> **環境**:host 無 cargo → dev docker 編譯(memory `project_rustapi_build_test_env`);**act on actual code**(sea-orm `PaginatorTrait`/`.contains()` 簽名、`From<Model>` 型以實際編譯為準)。
> **不變式速查**:envelope `{data,code,msg}` code=string(008)/ pagination `{current,size,total,records}` 無 pages/success / **id=string**(i64→to_string)/ status nullable→`Option<String>`=null / 無 password 入 wire / 只回 active / camelCase。

---

## Phase 1:Setup(無新 dep,僅建置基線)

- [ ] T001 dev docker build 基線綠:`find server/src entity/src -name '*.rs' -exec touch {} + && cargo build -p server`(WSL2 stale-cache force-touch;確認 016 起手前既有碼可編)。**無新 crate/dep**(用既有 sea-orm `PaginatorTrait` + axum + 013 enforce + 008 envelope;R8)→ 不觸發「新 crate ⇒ prod build」硬規則。**無單測**(建置基線)。

## Phase 2:Foundational(US1+US2+US3 共同 blocking 前置)

- [ ] T002 [P] `rust-api/server/src/envelope.rs`:加泛型分頁外殼 `PageRes<T> { current: u64, size: u64, total: u64, records: Vec<T> }`(`#[derive(Serialize)]` + `#[serde(rename_all="camelCase")]`,**4 欄、無 pages/success**;放 envelope.rs 與 `Res<T>` 同層、**非** system_manage.rs〔data-model §4.0〕)。**純單測(test-first)**:`Res::ok(PageRes{...})` 序列化斷言 ① 含 `"current"/"size"/"total"/"records"` 欄、② **無 `"pages"`/`"success"`**、③ 欄序 data→code→msg、④ **`current`/`size`/`total` 為 JSON number 非 string**(如 `"current":1` 不帶引號;釘住 id=string 與分頁數值=number 的混合契約,review minor)。供 US1/US2 共用。
- [ ] T003 [P] `rust-api/server/src/handler/system_manage.rs`(新檔骨架)+ `rust-api/server/src/handler/mod.rs` 加 `pub mod system_manage;`。檔內定義共用分頁參數正規化純 fn `normalize_page(current: Option<u64>, size: Option<u64>) -> (u64 /*page_idx 0-based*/, u64 /*size*/)`:`current` 預設 1、`size` 預設 10、**`size` clamp `[1,100]`**(下限 1 防 sea-orm `paginate` size=0 panic、上限 100 防撈爆;R9/D5)、回 `(current.max(1).saturating_sub(1), size_clamped)`。**純單測(test-first)**:預設(None→(0,10))、clamp(size 0→1、size 999→100)、current 1→page_idx 0、current 0→0(saturating)。供 US1/US2 共用。
- [ ] T004 [P] migration `rust-api/migration/src/m20260529_000013_seed_manage_policy.rs`:沿 009/010 `execute_unprepared` raw SQL + `ON CONFLICT DO NOTHING`,seed casbin policy(act=`GET`、path **無 /api**、R3):getRoleList×{R_SUPER,R_ADMIN}(2)+ getAllRoles×{R_SUPER,R_ADMIN,R_USER_COMMON}(3);**getUserList 不 seed**(009 已有 R_SUPER+R_ADMIN)。`down()` = `DELETE WHERE ptype='p' AND v2='GET' AND v1 IN ('/systemManage/getRoleList','/systemManage/getAllRoles')`。註冊 `rust-api/migration/src/lib.rs`(mod + migrations() vec 尾,接 012)。**無單測**(seed migration;由 acceptance §2 psql 覆蓋)。**§I.6 N/A**(只 seed policy 表、非業務表)。covers US2+US3 授權。

## Phase 3:User Story 1 — 使用者列表分頁查詢(P1)🎯 MVP

**Goal**:Super/Admin 打 getUserList 得真實 user 分頁(取代 013 stub),每筆含帳號/暱稱/角色清單、無 password;User deny。
**Independent Test**:Super 打 `getUserList?current=1&size=10` → 分頁形(current/size/total/records)、records[0] id=string、userRoles 陣列、無 password;`?userName=Admin` 過濾;User→403+5003;超範圍頁→空 records+正確 total。

- [ ] T005 [P] [US1] facade `rust-api/server/src/model/facade/sys_user.rs` 加 `UserListFilter { user_name: Option<String>, nick_name: Option<String> }` + `pub async fn list_active_paginated(db, filter, page_idx: u64, size: u64) -> Result<(Vec<Model>, u64), DbErr>`(`find_active()` + `Some(kw)→.filter(Column::UserName.contains(kw))`/`nick_name`〔`None`→不加該 filter,D6/D8〕+ `.order_by_desc(Column::Id)`〔R9〕+ `.paginate(db, size)` → `(fetch_page(page_idx), num_items())`;**`page_idx` 已 0-based,直接 `fetch_page(page_idx)`、facade 不再 -1**〔避雙重減一,data-model §3〕)。抽 SQL-build seam `user_list_query(filter) -> Select<Entity>`。**純單測(test-first)**:① `user_name=Some("x")` → SQL **含** `LIKE`;② `filter` 全 `None` → SQL **不含** `LIKE`(空略過分支顯式斷言);③ 含 `ORDER BY "id" DESC`(沿 011/015 SQL-build 模式)。守 009 lint(facade 內碰 entity::)。
- [ ] T006 [P] [US1] facade `rust-api/server/src/model/facade/sys_user_role.rs` 加 `pub async fn roles_for_users(db, user_ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<String>>, DbErr>`(R7 批次避 N+1:`sys_user_role WHERE user_id IN (ids)` 取 (user_id,role_id) → `sys_role::find_active filter id IN (role_ids)` 取 (id,code) → 記憶體組 `user_id→[code...]`;`ids` 空 → 回空 map)。既有單筆 `roles_for_user` **保留不動**。**純單測(test-first)**:SQL-build 斷言 `IN` query;空 ids 早返空 map。守 009 lint。
- [ ] T007 [US1] DTO `rust-api/server/src/handler/system_manage.rs`:`UserItem`(`#[serde(rename_all="camelCase")]`,欄見 data-model §4:`id: String`〔i64.to_string,R6〕/ `user_name` / `nick_name: Option<String>` / `user_gender`·`user_phone`·`user_email`·`status`·`create_by`·`create_time`·`update_by`·`update_time` 皆 `Option<String>`=**None**〔缺欄回 null,D2〕/ `user_roles: Vec<String>`)+ 組裝 fn `user_item(model: sys_user::Model, roles: Vec<String>) -> UserItem`(純映射 seam,**無 password 欄**,D9)。**純單測(test-first)**:① id→string、② 缺欄 None(序列化為 `null`)、③ `user_roles` 帶入、④ **無角色** `user_item(model, vec![])` 序列化 `"userRoles":[]`(空陣列、**非 null**,釘住 Edge Case「無角色」)、⑤ **序列化 JSON 不含 `"password"`**、⑥ camelCase(`userName`/`userRoles`/`createTime`)。依賴 T002(PageRes)。
- [ ] T008 [US1] handler + route wiring:`system_manage.rs` `pub async fn get_user_list(State, Query<UserSearchParams>) -> Res<PageRes<UserItem>>`(`UserSearchParams` 見 data-model §5:camelCase、皆 optional、僅 user_name/nick_name 生效、餘忽略;`normalize_page` → `list_active_paginated` → 取該頁 user_ids → `roles_for_users` 批次 → 組 `Vec<UserItem>` → `Res::ok(PageRes{current,size,total,records})`)。`rust-api/server/src/main.rs`:getUserList route(現約 line 97-105 的 `.route("/systemManage/getUserList", ...)`)handler 從 `handler::auth::get_user_list` 改指 `handler::system_manage::get_user_list`(**保留 `route_layer(enforce_mw)`**);**移除** `handler/auth.rs` 中的 `get_user_list` fn + `UserListStub` struct(**用符號定位,勿綁行號** — 行號為 cff9785 當下參考、實際以函式/struct 名為準;**勿動** `Deserialize/Serialize`/`Res` import — 其他 handler 仍用)。依賴 T003/T005/T006/T007。**無新純函式單測**(handler/route wiring → T009 acceptance 覆蓋)。
- [ ] T009 [US1] **acceptance**(contracts §3,dev stack curl + psql):Super getUserList → 分頁形(current/size/total=3/records)+ records[0].id=string + userRoles 陣列 + **無 password**;`?userName=Admin` 過濾;User→HTTP 403 + code 5003;無 token→3333;`?current=99`→空 records + total 3 + code 0000。依賴 T008。

## Phase 4:User Story 2 — 角色列表分頁查詢(P2)

**Goal**:Super/Admin 打 getRoleList 得真實 role 分頁(id/roleName/roleCode);User deny。
**Independent Test**:Super 打 getRoleList → 分頁形 total=3、records[0].{id:string,roleName,roleCode}、roleDesc/status=null;`?roleCode=ADMIN` 過濾;User→403。

- [ ] T010 [P] [US2] facade `rust-api/server/src/model/facade/sys_role.rs` 加 `RoleListFilter { name: Option<String>, code: Option<String> }` + `pub async fn list_active_paginated(db, filter, page_idx, size) -> Result<(Vec<Model>, u64), DbErr>`(同 T005 模式:`Some(kw)→name`/`code` `.contains()`〔`None`→空略過〕+ `.order_by_desc(Id)` + `.paginate(db,size)` → `fetch_page(page_idx)`〔page_idx 已 0-based、不再 -1〕;抽 `role_list_query(filter) -> Select<Entity>` seam)。**純單測(test-first)**:① `name=Some("x")`→SQL 含 `LIKE`、② filter 全 `None`→SQL 不含 `LIKE`(空略過顯式斷言)、③ 含 `ORDER BY "id" DESC`。守 009 lint。**[P] 與 T005(sys_user.rs)不同檔可平行;但與同檔 T014 須序列(見 Dependencies)。**
- [ ] T011 [US2] DTO `system_manage.rs`:`RoleItem`(camelCase:`id: String` / `role_name`〔←name〕/ `role_code`〔←code〕/ `role_desc`·`status`·`create_by`·`create_time`·`update_by`·`update_time` 皆 `Option<String>`=None〔D2〕)+ 組裝 fn `role_item(model: sys_role::Model) -> RoleItem`(`From<Model>` 純映射 seam)。**純單測(test-first)**:id→string、name→roleName、code→roleCode、缺欄 None、camelCase。依賴 T002。
- [ ] T012 [US2] handler + route:`system_manage.rs` `get_role_list(State, Query<RoleSearchParams>) -> Res<PageRes<RoleItem>>`(`RoleSearchParams`:role_name/role_code 生效、status 忽略;normalize_page → list_active_paginated → 組 RoleItem)。`main.rs` 加 `.route("/systemManage/getRoleList", get(system_manage::get_role_list).route_layer(from_fn_with_state(state.clone(), enforce::enforce_mw)))`(照抄 getUserList pattern,R3)。依賴 T003/T010/T011/T004(policy)。**無新純函式單測**(→ T013 acceptance)。
- [ ] T013 [US2] **acceptance**(contracts §4,curl):Super getRoleList → total=3 + records[0].{id:string,roleName,roleCode}、roleDesc/status null;`?roleCode=ADMIN` 過濾;User→403。依賴 T012。

## Phase 5:User Story 3 — 取得全部角色(P3)

**Goal**:含一般使用者皆可取全量 active role 精簡清單(id/roleName/roleCode,非分頁)。
**Independent Test**:Super 與 User 皆 getAllRoles → 非分頁陣列、每筆 {id:string,roleName,roleCode}、只 active;無 token→3333。

- [ ] T014 [US3] facade `rust-api/server/src/model/facade/sys_role.rs` 加 `pub async fn list_active_all(db) -> Result<Vec<Model>, DbErr>`(**重用 T010 的 `role_list_query(RoleListFilter::default())`〔全 None〕** + `.all(db)`,只 active、id DESC、不分頁)。**純單測(test-first)**:`role_list_query(default)` SQL-build 斷言 ① 含 `"deleted_at" IS NULL`、② 含 `ORDER BY "id" DESC`、③ **不含** `LIKE`(無 filter)。守 009 lint。**⚠ 同檔 `sys_role.rs`、依賴 T010(`role_list_query` seam):T010 → T014 序列、不可與 T010 同時併寫(故 T014 無 [P])。**
- [ ] T015 [US3] DTO `system_manage.rs`:`AllRoleItem`(camelCase:`id: String` / `role_name` / `role_code`,Role 子集)+ 組裝 fn(`From<sys_role::Model>` 子集映射)。**純單測(test-first)**:id→string、name→roleName、code→roleCode、camelCase。
- [ ] T016 [US3] handler + route:`system_manage.rs` `get_all_roles(State) -> Res<Vec<AllRoleItem>>`(list_active_all → 組 Vec<AllRoleItem> → `Res::ok`)。`main.rs` 加 `.route("/systemManage/getAllRoles", get(system_manage::get_all_roles).route_layer(from_fn_with_state(state.clone(), enforce::enforce_mw)))`。依賴 T014/T015/T004(policy 含 R_USER_COMMON)。**無新純函式單測**(→ T017)。
- [ ] T017 [US3] **acceptance**(contracts §5,curl):Super 與 **User** 皆 code 0000 + 非分頁陣列 + 每筆 {id:string,roleName,roleCode} + 只 active;無 token→3333。依賴 T016。

## Phase 6:Polish & Cross-Cutting

- [ ] T018 守恆 + 純單測全綠(contracts §1/§7):dev docker `cargo test -p server`(含 T002/T003/T005/T006/T007/T010/T011/T015 新純單測)+ `--test entity_access_lint`(新 facade 在 facade/、`handler/system_manage.rs` 不碰 `entity::` → 17 全綠)+ `cargo test -p xdb`(9 不破);`grep -rn 'Migrator::up' server/src` = 0(守 007 FR-009);psql 驗 casbin_rule 新 policy 已 seed(getRoleList×2 + getAllRoles×3,§2)。
- [ ] T019 **CDP 列表顯示 acceptance**(contracts §6,端到端價值 SC-001):dev stack(base-web `.env` dynamic、vite proxy)登入 Super → `/manage/user` 表格顯 3 筆 user(Super/Admin/User01 + 角色欄)+ `/manage/role` 顯 3 筆 role;確認 null 欄(status/email/gender)render **不 crash**(R5;若 crash 該欄 implementer 改回 `""`)。沿 013/014 CDP 模式(`docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A)。依賴 T009/T013。*(prod image build sanity §8 非強制、無新 crate/dep,可選跑;不列必跑 task。)*

---

## Dependencies(US 完成順序)

```
Setup(T001)
   └─ Foundational(T002 PageRes〔envelope.rs〕∥ T003 system_manage 骨架+normalize_page ∥ T004 seed migration)
        ├─ US1(T005 ∥ T006、T007〔依 T002〕→ T008 → T009)🎯 MVP
        ├─ US2(T010 → T011〔依 T002〕→ T012 → T013)        ← 與 US1 獨立(不同 facade/DTO);皆建於 Foundational
        └─ US3(T014〔依 T010,同檔 sys_role.rs〕→ T015〔依 T002〕→ T016 → T017)  ← 與 US1/US2 獨立
   └─ Polish(T018 守恆 / T019 CDP)                    ← 全 US 後
```

> **精確依賴以各 task body 為準**:T007 僅依 T002(PageRes),與 T005/T006 可平行(三者匯流到 T008);T011/T015 依 T002。**同檔序列**:T010→T014(皆 `sys_role.rs`,T014 重用 T010 的 `role_list_query`);T007/T011/T015 皆寫 `system_manage.rs`(同檔、序列化避併寫)。**跨檔可平行**:T005(sys_user.rs)∥ T006(sys_user_role.rs)∥ T010(sys_role.rs)。

- **US1 ⟂ US2 ⟂ US3**:三者不同 facade fn / 不同 DTO / 不同 route,皆建於 Foundational(PageRes〔US1/US2〕、system_manage 骨架、seed migration〔US2/US3 policy〕)之上;handler 同檔 `system_manage.rs` 故實作序列化避免併寫衝突,但邏輯獨立。
- **MVP = Setup + Foundational + US1**:getUserList 真實分頁可端到端 demo(管理頁第一次看到 user)。

## Parallel 範例

- Foundational:`T002`(PageRes)∥ `T003`(system_manage 骨架)∥ `T004`(seed migration)—— 三不同檔。
- US1 facade:`T005`(sys_user list)∥ `T006`(roles_for_users)—— 不同 facade 檔。
- 跨 US facade:`T005`(sys_user.rs)∥ `T006`(sys_user_role.rs)∥ `T010`(sys_role.rs)—— 三不同檔可平行。**`T014` 與 `T010` 同檔 sys_role.rs + 重用其 `role_list_query` → 序列(T010→T014)、不掛 [P]。**

## Implementation Strategy(MVP first)

1. **MVP**:Setup → Foundational → US1(T001–T009)→ getUserList 真實分頁端到端 demo(取代 013 stub)。
2. **增量**:US2(T010–T013)getRoleList → US3(T014–T017)getAllRoles → Polish(T018 守恆 / T019 CDP 列表顯示)。
3. 全 task 完成 → `superpowers:requesting-code-review` final review → `superpowers:finishing-a-development-branch`(此時才 worktree push fork + 外層 bump rust-api SHA pin + `merge --no-ff` 回 `rev2-admin-root`,保留 016 branch)。

## 測試策略註記(§I.4 / §3)

- **有純函式單測(test-first)**:T002(PageRes 序列化)、T003(normalize_page clamp)、T005/T010(filter SQL-build)、T006(roles 批次 SQL-build)、T007/T011/T015(DTO 映射:id→string / 缺欄 null / 無 password / camelCase)。
- **無單元測試、acceptance 覆蓋**:T001(建置基線)、T004(seed migration → §2 psql)、T008/T012/T016(handler/route wiring → §3/§4/§5 curl)、T009/T013/T017(curl/psql acceptance 本身)、T019(CDP)。
- **D 端到端價值**:T019 一條 dev vite proxy CDP 列表顯示(SC-001「管理頁第一次看到資料」);經 front-nginx 真實 `/api` 路徑留 prod-stack CDP cluster(CHECKLIST §2.8)。
