# Tasks: 017-manage-user-write

**Branch**: `017-manage-user-write` | **Date**: 2026-06-01
**Input**: [plan.md](plan.md) / [spec.md](spec.md) / [research.md](research.md) / [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md)

> **實作交棒對象**:本檔。用 `superpowers:executing-plans`(**非** `/speckit-implement`)起手 → 轉 `superpowers:subagent-driven-development` + TDD。
> **TDD 紀律**(CLAUDE.md §3 / §I.4):純函式(hash round-trip / enum string↔i16 / role replace-all SQL-build / self-delete guard 判定 / write DTO 解析 / audit_json redact)**test-first(red→green)**;wiring(handler/route/migration/login gate/base-web 接線)**無新純函式單測 → 由 curl/psql/CDP acceptance 覆蓋**(各 task 已明示)。
> **★ 鐵紀律**:本檔**不含**任何 `git push` / `git merge` / 外層 bump SHA pin —— 那些只在 `superpowers:finishing-a-development-branch` 階段執行(§3)。實作期間的 worktree `git commit` 可,push/merge 不可。**兩段式 commit**:本 feature 動 rust-api **與** base-web 兩 worktree,各自 worktree commit;外層 bump 2 個 SHA pin 留收尾。
> **環境**:host 無 cargo → dev docker 編譯(memory `project_rustapi_build_test_env`);**act on actual code**(`small_integer()`/`mutate_in_txn`/`insert_many`/argon2 hash 簽名以實際編譯為準)。
> **不變式速查**:envelope `{data,code,msg}` code=string(008)/ 寫回 `Res<()>`(data=null)/ **id wire=string**(寫端收 String parse i64,R7)/ enum wire string `'1'\|'2'`(DTO i16↔string,D5)/ 預設密碼 argon2 `123456`(D2)/ 停用拒登 **1000**(Q2=B/親決 A、僅登入入口)/ 不可刪自己整批拒(D7)/ 業務錯誤 **2222**(D8)/ §I.6 `*_by`=operator i64 成對寫 / 無 password 入 wire / camelCase。

---

## Phase 1:Setup

- [ ] T001 dev docker build 基線綠:`find rust-api/server/src rust-api/entity/src rust-api/migration/src -name '*.rs' -exec touch {} + && cargo build -p server && cargo build -p migration`(WSL2 force-touch;確認 016 起手前既有碼可編)。**無單測**(建置基線)。

## Phase 2:Foundational(US1+US2+US3+登入 gate 共同 blocking 前置)

**⚠️ CRITICAL**:schema/entity/audit_json 未完成前,任何 US 無法編譯。

- [ ] T002 [P] migration `rust-api/migration/src/m20260529_000014_alter_sys_user_business_audit.rs`(接 013):**(a)** sea-query builder `add_column` ×9 —— `user_gender .small_integer().null()` / `user_phone .string().null()` / `user_email .string().null()` / `status .small_integer().null()` / `created_at .timestamp_with_time_zone().not_null().default(Expr::current_timestamp())` / `created_by·updated_by·deleted_by .big_integer().null()` / `updated_at .timestamp_with_time_zone().null()`(沿 008/004 pattern,data-model §2.1);**(b)** raw `execute_unprepared` **id BIGSERIAL**(R2 ★):`CREATE SEQUENCE IF NOT EXISTS sys_user_id_seq OWNED BY sys_user.id; ALTER TABLE sys_user ALTER COLUMN id SET DEFAULT nextval('sys_user_id_seq'); SELECT setval('sys_user_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM sys_user),1));`;**(c)** raw `UPDATE sys_user SET status=1 WHERE id IN (1,2,3)`(seed 回填,D6)。`down()` 對稱(drop default + drop sequence + drop_column ×9)。註冊 lib.rs(mod + migrations() 尾)。**無單測**(由 §2 psql + §8 up→down→up 覆蓋)。**★ dev docker `cargo build -p migration` 實證 `.small_integer()` 能編譯**(R1/N-12)。
- [ ] T003 entity `rust-api/entity/src/sys_user.rs`:加 9 欄(`user_gender: Option<i16>` / `user_phone,user_email: Option<String>` / `status: Option<i16>` / `created_at: DateTimeWithTimeZone` / `created_by,updated_by,deleted_by: Option<i64>` / `updated_at: Option<DateTimeWithTimeZone>`,data-model §1)+ **id `#[sea_orm(primary_key, auto_increment = true)]`**(從 false 改,R2 與 T002 成對)。依賴 T002(schema 對齊)。**無單測**(型對齊,cargo build 驗)。
- [ ] T004 `rust-api/server/src/model/facade/sys_user.rs` audit_json + test fixture 同步(R11、breaking):`audit_json` 補 `nick_name`(§2.16#2)+ 9 新欄(`password` 持續 `<redacted>`;email/phone 保留為審計快照);`#[cfg(test)]` Model struct literal 補 9 欄(否則 cargo build 紅)。**純單測(test-first)**:擴既有 redact 測 —— ① password=`<redacted>`、② nick_name/user_email/status 等新欄入 json、③ created_at 入 json。依賴 T003。
- [ ] T005 [P] migration `rust-api/migration/src/m20260529_000015_seed_write_policy.rs`(接 014):raw `execute_unprepared` INSERT casbin_rule 4 行**逐條 R_SUPER**(無 wildcard,path 無 /api、v3-5=''):addUser/updateUser `POST`、deleteUser/batchDeleteUser `DELETE`,`ON CONFLICT DO NOTHING`(data-model §2.2)。`down()` DELETE 這 4 行。註冊 lib.rs。**無單測**(由 §2 psql + §3-§5 授權 curl 覆蓋)。
- [ ] T006 [P] `rust-api/server/src/auth/password.rs` 加 production `pub fn hash_password(plain: &str) -> String`(argon2 `SaltString::generate(&mut OsRng)`+`Argon2::default().hash_password(...).to_string()`,與 seed 同演算法;import 從 `#[cfg(test)]` 提 module 頂層;R5、**無新 crate**)。**純單測(test-first)**:`verify_password(p, &hash_password(p))==true`、`verify_password("x", &hash_password("y"))==false`。
- [ ] T007 [P] `rust-api/server/src/handler/system_manage.rs` 加 enum 轉換純 fn(`gender_str_to_i16`/`status_str_to_i16`:`"1"→1`/`"2"→2`/其餘→Err 或 None;`i16_to_wire_str`:`1→"1"`,D5/R7)。**純單測(test-first)**:`"1"→1`、`"2"→2`、非法→Err/None、`1→"1"` round-trip。供 US1/US2 DTO + T011 user_item 共用。
- [ ] T008 [P] `rust-api/server/src/model/facade/sys_user_role.rs` 加 `pub async fn replace_roles_in_txn(txn: &DatabaseTransaction, user_id: i64, role_codes: &[String]) -> Result<(), DbErr>`(R4:`sys_role::find_active filter Code IN(codes)` 解析 code→active id〔未知/軟刪略過〕→ `delete_many WHERE user_id` → `insert_many` 新 pairs;沿 `sys_operation_log::write_in_txn` txn-aware 範本)。既有 `roles_for_user`/`roles_for_users` 不動。**純單測(test-first)**:code→id 解析 SQL-build 含 `IN`、delete SQL-build 含 `WHERE "user_id"`、空 codes→只 delete 不 insert。守 009 lint。
- [ ] **Checkpoint**:`dcargo build -p server && dcargo build -p migration` 綠、`--test entity_access_lint` 17 綠 → US 可開工。

## Phase 3:User Story 1 — 新增使用者(P1)🎯 MVP

**Goal**:Super 打 addUser 建一個 user(profile + 角色 + 預設密碼),列表多一筆並顯真值;Admin/User deny。
**Independent Test**:Super addUser → getUserList 多一筆(id=string、userRoles、gender/email 真值、無 password)+ 新 user 用 `123456` 登入 OK;帳號重複→2222;Admin/User→403、無 token→3333。

- [ ] T009 [US1] facade `rust-api/server/src/model/facade/sys_user.rs` 加 `pub async fn create_user(db, data: CreateUserData, operator: i64) -> Result<i64, DbErr>`(data-model §3:先 `find_active_by_name` 檢唯一〔存在→特定 Err 供 handler 映 2222〕;`mutate_in_txn`:insert ActiveModel{ `id: NotSet`、`password: Set(hash_password("123456"))`、business 欄、`created_by: Set(Some(operator))` } → 取 new id → `sys_user_role::replace_roles_in_txn(&txn, id, &role_codes)` → audit `Insert`〔payload_after=audit_json、operator=`AuditOperator{id:operator, ip:None}`〕)。依賴 T003/T004/T006/T008。**live-DB `#[ignore]`**(create round-trip + audit 一筆 + role 指派,放 facade/);純邏輯(唯一檢查分支)test-first 可。守 009 lint。**同檔 sys_user.rs 與 T014/T018 序列**。
- [ ] T010 [US1] DTO + handler `rust-api/server/src/handler/system_manage.rs`:`UserCreateReq`(serde camelCase:user_name/nick_name/user_gender/user_phone/user_email/user_roles[]/status,**無 id/password**,enum 收 `Option<String>`)+ `pub async fn add_user(State, Extension<RequestContext>, Json<UserCreateReq>) -> Res<()>`(operator=`ctx.operator_id`〔None→Internal 防禦〕;`gender/status_str_to_i16`〔T007〕parse 失敗→2222;`create_user`;用戶名重複 Err→`Res::err_msg(BizError,"用户名已存在")` 2222;成功→`Res::ok(())`)。依賴 T007/T009。**無新純函式單測**(→ T013)。同檔序列。
- [ ] T011 [US1] `rust-api/server/src/handler/system_manage.rs` `user_item` 改吃真實欄(R10、跨 016):user_gender/status `i16→string`(T007 `i16_to_wire_str`)、user_phone/user_email 直填、create_time=`created_at.to_rfc3339()`、update_time=`updated_at.map(rfc3339)`、create_by/update_by=`i64→string`;缺值仍 None;id 維持 string。**純單測(test-first)**:given Model 真值 → UserItem 對應欄非 null + i16→string + 缺值 None。依賴 T003/T007。同檔序列。
- [ ] T012 [US1] route `rust-api/server/src/main.rs`:加 `.route("/systemManage/addUser", post(handler::system_manage::add_user).route_layer(from_fn_with_state(state.clone(), enforce::enforce_mw)))`(照抄 016 enforce pattern,R9;post 已 import)。依賴 T010/T005(policy)。**無新純函式單測**(→ T013)。
- [ ] T013 [US1] **acceptance**(contracts §3,dev stack curl + psql):Super addUser→0000 + getUserList 多一筆(id string/userRoles/gender·email 真值/無 password)+ 新 user `123456` 登入 OK + 審計 INSERT;重複帳號→2222;Admin/User→403、無 token→3333。依賴 T012。

## Phase 4:User Story 2 — 編輯使用者(P2)

**Goal**:Super 打 updateUser 改既有 user 的 profile + 角色(整批替換);userName/password 不動;Admin deny。
**Independent Test**:Super updateUser(帶 id)→ 該筆暱稱/角色更新、userName 不變、審計 UPDATE;Admin→403。

- [ ] T014 [US2] facade `rust-api/server/src/model/facade/sys_user.rs` 加 `pub async fn update_user(db, id: i64, data: UpdateUserData, operator: i64) -> Result<bool, DbErr>`(data-model §3:`mutate_in_txn`:load active by id〔無→Ok(false)、payload_before=audit_json〕→ update business 欄 + `updated_by=Some(operator)`〔**不動 user_name/password**,Q1=A〕→ `replace_roles_in_txn` → audit `Update`〔before+after〕)。依賴 T003/T004/T008。**live-DB `#[ignore]`**(update + role replace + audit)。守 009 lint。**同檔序列(接 T009)**。
- [ ] T015 [US2] DTO + handler `system_manage.rs`:`UserUpdateReq`(= UserCreateReq 業務欄 + `id: String`;user_name 收但忽略)+ `pub async fn update_user(State, Extension, Json<UserUpdateReq>) -> Res<()>`(`id.parse::<i64>()` 失敗→2222;`update_user`;Ok(false)→`Res::err_msg(BizError,"用户不存在")`)。依賴 T007/T014。同檔序列。
- [ ] T016 [US2] route `main.rs`:加 `.route("/systemManage/updateUser", post(...update_user).route_layer(...enforce_mw))`。依賴 T015/T005。**無新純函式單測**(→ T017)。
- [ ] T017 [US2] **acceptance**(contracts §4,curl):Super updateUser(帶 id)→ 0000 + 暱稱/角色更新、userName 仍舊、審計 UPDATE;Admin→403。依賴 T016。

## Phase 5:User Story 3 — 刪除使用者(含批次,P3)

**Goal**:Super 軟刪單一/多個 user;不可刪自己(整批拒);Admin deny。
**Independent Test**:Super deleteUser→該筆軟刪不現於 list + 審計 SOFT_DELETE + deleted_by;刪自己/批次含自己→2222 不刪;Admin→403。

- [ ] T018 [US3] facade `rust-api/server/src/model/facade/sys_user.rs` `soft_delete` **擴簽名加 `operator: i64`**(data-model §3:`soft_delete_query` 同設 `deleted_by=operator`〔§I.6 成對〕;AuditEvent `operator=Some(AuditOperator{id:operator, ip:None})`〔取代現 None〕)。既有呼叫端(若有)同步改簽名。**純單測(test-first)**:`soft_delete_query` SQL-build 含 `SET "deleted_at"` **與 `"deleted_by"`**(擴既有測)。**同檔序列(接 T014)**。
- [ ] T019 [US3] handler `system_manage.rs`:`DeleteReq{id:String}` / `BatchDeleteReq{ids:Vec<String>}` + `delete_user(State,Extension,Json<DeleteReq>) -> Res<()>`(id.parse;**D7:id==`ctx.operator_id`→`Res::err_msg(BizError,"不能删除自己")`**;否則 `soft_delete(db,id,operator)`)+ `batch_delete_users(...Json<BatchDeleteReq>)`(**D7:任一 id==operator→整批拒 2222 不執行**;否則迴圈 `soft_delete` 各筆 audit)。依賴 T018。**純單測(test-first)**:self-delete guard 判定(ids 含 operator → reject)純邏輯。同檔序列。
- [ ] T020 [US3] route `main.rs`:`use axum::routing` **加 `delete`**;加 `.route("/systemManage/deleteUser", delete(...delete_user).route_layer(...))` + `.route("/systemManage/batchDeleteUser", delete(...batch_delete_users).route_layer(...))`(DELETE 帶 Json body,R9)。依賴 T019/T005。**無新純函式單測**(→ T021)。
- [ ] T021 [US3] **acceptance**(contracts §5,curl + psql):Super deleteUser→軟刪不現於 list + 審計 SOFT_DELETE + psql deleted_at/deleted_by 非 null;刪自己(id=1)→2222 且 Super 仍在;batchDelete 含自己→2222 無人被刪;Admin→403。依賴 T020。

## Phase 6:Q2=B 停用 status enforce 擋登入(親決 A:回 1000)

**Goal**:`status=disabled` 的 user 無法登入(僅登入入口、回 1000 統一守 no-enum)。
**Independent Test**:把一 user 設停用 → 該帳號登入回 1000 不發 token;啟用帳號登入 0000。

- [ ] T022 login gate `rust-api/server/src/handler/auth.rs`:`login_attempt_inner` 於 `verify_password` 通過後、`roles` 前加 `if user.status == Some(2) { return Err(BizCode::LoginFailed); }`(R6/親決 A:1000 統一;**僅 login 入口、不改 enforce_mw/getUserInfo**;login_attempt 審計沿 success=false/None 不擴回傳型)。依賴 T003(status 欄)。**無新純函式單測**(login 流程 → T023 acceptance;狀態判定極簡)。
- [ ] T023 [US?] **acceptance**(contracts §6,curl):建一 user→啟用時登入 OK→updateUser 設 status=2→該帳號登入回 **1000 + 無 token**;對照啟用帳號(Admin)登入 0000。依賴 T022 + T015(updateUser 設停用)。

## Phase 7:base-web 接線(MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER;base-web worktree)

- [ ] T024 [P] 新檔 `base-web/src/service/api/rev2-system-manage.ts`(BASE-WEB-WRAPPER ✓,`rev2-` 前綴、不改既有 system-manage.ts):`fetchAddUser(data)`/`fetchUpdateUser(data)` `request<null>({url,method:'post',data})`、`fetchDeleteUser(id)`/`fetchBatchDeleteUser(ids)` `method:'delete' data:{id}/{ids}`(對齊既有 `request` 風格,data-model §8)+ `service/api/index.ts` `export * from './rev2-system-manage'`。**無單測**(→ T027 CDP)。
- [ ] T025 MODAL-WIRING ★ 接線(只改 `// request` 一行、**每處 spec 內記 file:line + upstream 風險**):`base-web/src/views/manage/user/modules/user-operate-drawer.vue` handleSubmit(~:107)→ 依 `operateType` `fetchAddUser(model)` / `fetchUpdateUser({...model, id: rowData.id})`、!error 才 message+close+emit;`base-web/src/views/manage/user/index.vue` handleDelete(~:155)→ `fetchDeleteUser(id)`、handleBatchDelete(~:148)→ `fetchBatchDeleteUser(checkedRowKeys.value)`,!error 才 onDeleted/onBatchDeleted。依賴 T024。**act on actual code**(符號定位)。**無單測**(→ T027)。

## Phase 8:Polish & 守恆

- [ ] T026 守恆 + 純單測全綠(contracts §1/§8):`dcargo test -p server`(含 T004/T006/T007/T008/T011/T018 新純測)+ `--test entity_access_lint`(17、handler/system_manage 不碰 entity::)+ `dcargo test -p xdb`(9 不破)+ `grep -rn 'Migrator::up' server/src`=0(守 007 FR-009)+ **migration up→down→up 可逆**(R2 BIGSERIAL down 對稱)+ 013 login 既有(啟用帳號 0000、錯密碼 1000)/016/getRoleList/getAllRoles 不受影響。
- [ ] T027 **CDP 端到端**(contracts §7,dev stack front-nginx :21080):登入 Super → `/manage/user` 新增 user(列表多一筆+角色欄)→ 編輯(改暱稱/角色反映、帳號名不可改)→ 刪除(列表少一筆);null 欄 render 不 crash;把某 user 編輯為停用 → 該帳號登入頁登入顯示失敗(1000、非靜默)。依賴 T013/T017/T021/T023/T025。
- [ ] T028 [P] prod image build sanity(contracts §9,**可選非強制** — 017 無新 crate/dep):`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`。

---

## Dependencies(US 完成順序)

```
Setup(T001)
   └─ Foundational(T002 migration14 ∥ T005 migration15 ∥ T006 hash ∥ T007 enum ∥ T008 replace_roles;T003 entity〔依 T002〕→ T004 audit_json/test〔依 T003〕)
        ├─ US1(T009 create_user → T010 handler → T011 user_item 真值 → T012 route → T013 acceptance)🎯 MVP
        ├─ US2(T014 update_user → T015 handler → T016 route → T017 acceptance)
        ├─ US3(T018 soft_delete+operator → T019 handler → T020 route → T021 acceptance)
        ├─ 登入 gate(T022 → T023 acceptance〔+依 T015 設停用〕)
        └─ base-web(T024 wrapper → T025 MODAL-WIRING)
   └─ Polish(T026 守恆 / T027 CDP〔依全 US+T025〕/ T028 prod sanity)
```

> **同檔序列(重要)**:`facade/sys_user.rs` 被 T004/T009/T014/T018 觸 → **序列**(T004→T009→T014→T018);`handler/system_manage.rs` 被 T007/T010/T011/T015/T019 觸 → **序列**;`main.rs` 被 T012/T016/T020 觸 → 序列。**跨檔可平行**:T002(migration14)∥ T005(migration15)∥ T006(password.rs)∥ T008(sys_user_role.rs)∥ T024(base-web)。
> **US ⟂**:US1/US2/US3 邏輯獨立(不同 facade fn/handler/route),皆建於 Foundational;但同檔 sys_user.rs/system_manage.rs/main.rs 故實作序列化避併寫。**MVP = Setup + Foundational + US1**(addUser 端到端 demo:管理頁第一次能新增 user)。
> **登入 gate(T022/T023)** ⟂ CRUD,但 T023 需 T015(updateUser 設停用)才能端到端驗。

## Parallel 範例
- Foundational:`T002`(migration14)∥ `T005`(migration15)∥ `T006`(password.rs)∥ `T008`(sys_user_role.rs)—— 四不同檔(T003/T004 entity→audit_json 序列)。

## Implementation Strategy(MVP first)
1. **MVP**:Setup → Foundational → US1(T001–T013)→ addUser 端到端(管理頁第一次能新增 user + 顯真值)。
2. **增量**:US2(T014–T017)編輯 → US3(T018–T021)刪除 → 登入 gate(T022–T023)→ base-web 接線(T024–T025)→ Polish(T026 守恆 / T027 CDP / T028 prod sanity)。
3. 全 task 完成 → `superpowers:requesting-code-review` final review → `superpowers:finishing-a-development-branch`(此時才 worktree push fork〔rust-api + base-web 兩個〕+ 外層 bump 2 SHA pin + `merge --no-ff` 回 `rev2-admin-root`,保留 017 branch)。

## 測試策略註記(§I.4 / §3)
- **有純函式單測(test-first)**:T004(audit_json redact 補欄)、T006(hash round-trip)、T007(enum string↔i16)、T008(role replace-all SQL-build)、T011(user_item 真值映射)、T018(soft_delete_query 含 deleted_by)、T019(self-delete guard 判定)。
- **live-DB `#[ignore]`**:T009(create_user)、T014(update_user)round-trip + audit。
- **無單測、acceptance 覆蓋**:T001(基線)、T002/T005(migration→§2 psql + §8 up→down→up)、T010/T012/T015/T016/T020(handler/route wiring→§3/§4/§5 curl)、T022(login gate→§6)、T024/T025(base-web→§7 CDP)、T013/T017/T021/T023(acceptance 本身)、T027(CDP)、T028(prod sanity)。
- **D 端到端價值**:T027 一條 CDP(SC-001~009「管理員真的能管理使用者」+ 停用擋登入)。
