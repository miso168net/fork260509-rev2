# Phase 0 Research: 017-manage-user-write

**Date**: 2026-06-01 | **Branch**: `017-manage-user-write`
**研究對象**: `rust-api` worktree @ `81c56ef`(=016)+ `base-web` worktree。**未 grep rev1 source**(守 constitution §I.5;D4 clean-room 從 base-web typings 推導 schema)。研究以 5-lens 平行 grep 實際碼產出(非 brainstorm 假設);所有條目附 file:line 證據。

承接:008(`Res<T>`/`BizCode`)/ 009(soft-delete `find_active`+facade+entity-access lint)/ 011(audit `mutate_in_txn`/`AuditOperation`/`AuditSerialize`)/ 013(login/enforce/jwt/argon2 verify)/ 015(`ctx_mw` operator_id 入 request extension)/ 016(systemManage read endpoints + `UserItem` DTO placeholder)。

---

## R1. `sys_user` schema 補完(業務欄 + §I.6 審計欄,D4 clean-room)

**現況事實**:`entity/src/sys_user.rs` Model 僅 5 欄 `id/user_name/password/nick_name/deleted_at`;create migration 001 只 Id/UserName/Password,008 加 nick_name,003 加 deleted_at。`sea-orm 1.1.20` builder helper 實證:`.string()`(varchar,006/008)/`.string_len(N)`(004)/`.timestamp_with_time_zone()`(003/004/011)/`.big_integer()`(001/006)/`.boolean()`(012)。**`.small_integer()` API 存在但 repo migration 從未用過**(RISK,須 dev docker `cargo build -p migration` 實證)。

- **Decision**:新 migration **`m20260529_000014_alter_sys_user_business_audit`** 用 sea-query builder `alter_table().add_column()`(沿 008/003 pattern,nullable 欄不需 raw SQL),加:
  - 業務欄:`user_gender smallint NULL`、`user_phone varchar NULL`、`user_email varchar NULL`、`status smallint NULL`(D5 enum 存 smallint、DTO i16→wire string)。
  - §I.6 審計欄:`created_at timestamptz NOT NULL DEFAULT now()`(`.timestamp_with_time_zone().not_null().default(Expr::current_timestamp())`,既有 3 row 加欄即自動回填當下時間,對齊 004 範本)、`created_by bigint NULL`、`updated_at timestamptz NULL`、`updated_by bigint NULL`、`deleted_by bigint NULL`(`deleted_at` 009 已有)。
- entity Model 加 9 欄:`user_gender: Option<i16>` / `user_phone,user_email: Option<String>` / `status: Option<i16>` / `created_at: DateTimeWithTimeZone`(NOT NULL,非 Option)/ `created_by,updated_by,deleted_by: Option<i64>` / `updated_at: Option<DateTimeWithTimeZone>`。
- **Evidence**:`entity/src/sys_user.rs:5-12`;`migration/src/m20260529_000008_alter_sys_user_nick_name.rs:16-33`;`migration/src/m20260529_000004_create_sys_operation_log.rs:71-76`;`entity/src/sys_operation_log.rs:7-16`(型對應全範例)。

## R2. `sys_user.id` 無 sequence → BIGSERIAL(★ 最高 RISK)

**現況事實**:001 `id = big_integer().not_null().primary_key()` **無 auto_increment**;entity `#[sea_orm(primary_key, auto_increment = false)]`;002 seed 顯式寫 id 1/2/3。→ DB 上 id **既無 sequence 也無 DEFAULT**,addUser 走 ActiveModel insert 不給 id 會 NOT NULL violation。對照:sys_role/sys_operation_log 等都是 `big_integer().auto_increment()`(有 BIGSERIAL),唯 sys_user 手寫。

- **Decision**:014 migration **raw `execute_unprepared`**(sea-query builder 無「改現有欄為 BIGSERIAL」API,沿 003/006 raw SQL 既例):
  ```sql
  CREATE SEQUENCE IF NOT EXISTS sys_user_id_seq OWNED BY sys_user.id;
  ALTER TABLE sys_user ALTER COLUMN id SET DEFAULT nextval('sys_user_id_seq');
  SELECT setval('sys_user_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM sys_user), 1));
  ```
  `setval` 預設 `is_called=true` → 下一個 `nextval`=MAX+1=4(避開 seed id 1/2/3 撞 PK);`GREATEST(...,1)` 防空表 `setval(0)` 報錯。
- **entity `sys_user.rs` 改 `auto_increment = true`**;addUser ActiveModel `id: NotSet`(交 DB sequence)。**兩者必成對改**(只改一邊壞:只改 entity→NOT NULL violation;只改 migration→entity 仍要求顯式 id)。
- down() 對稱:`ALTER TABLE sys_user ALTER COLUMN id DROP DEFAULT; DROP SEQUENCE IF EXISTS sys_user_id_seq;`。verification 須測 up→down→up reversibility。
- **Evidence**:`migration/src/m20260529_000001_create_sys_user.rs:22-27`;`migration/src/m20260529_000002_seed_sys_user.rs:23-29`;`entity/src/sys_user.rs:6-7`;對照 `entity/src/sys_operation_log.rs:6`(auto_increment=true)。

## R3. 寫端 facade + 011 audit 接線(create/update/delete)

**現況事實**:`facade/sys_user.rs` 唯一 write fn = `soft_delete(db, id) -> Result<bool, DbErr>`(無 operator 參數,`operator: None`/`trace_id: None`,`soft_delete_query` 只設 deleted_at、**不寫 deleted_by**)。`model/audit.rs`:`mutate_in_txn<R,F,Fut>(db, f) -> Result<R, DbErr>`(閉包回 `Ok((txn, R, Option<AuditEvent>))`);**`AuditOperation` 4 variant 全已定義**(Insert/Update/SoftDelete/Restore,as_str→INSERT/UPDATE/SOFT_DELETE/RESTORE),只 SoftDelete 真接線。`AuditEvent{operation, entity_table, entity_id, payload_before, payload_after, operator: Option<AuditOperator>, trace_id}`;`AuditOperator{id: i64, ip: Option<String>}`。

- **Decision**:facade 新增 3 write fn,皆走 `mutate_in_txn`:
  - `create_user(db, fields, operator: i64) -> Result<i64, DbErr>`:insert sys_user(id NotSet、password=`hash_password("123456")`、business 欄、`created_by=Some(operator)`)→ `replace_roles_in_txn` → audit `Insert`(payload_before=None、payload_after=Some(new))。
  - `update_user(db, id, fields, operator) -> Result<bool, DbErr>`:load active(payload_before)→ update business 欄 + `updated_by=Some(operator)`(**不動 user_name〔Q1=A〕、不動 password**)→ `replace_roles_in_txn` → audit `Update`(before+after 皆 Some)。
  - `soft_delete` **擴簽名加 `operator: i64`**:`soft_delete_query` 同設 `deleted_by`;AuditEvent `operator=Some(operator)`。batchDelete = handler 迴圈呼叫(各一筆 SOFT_DELETE audit)或 facade 批次(plan 取迴圈、各筆 audit 清楚)。
- **operator IP 不帶**(RISK 規避):`AuditOperator{id: operator, ip: None}` —— `Some(ip)` 分支會踩 `sys_operation_log.rs:28` INET 42804 未解 bug(§2.14#2),017 audit 一律 `ip: None`(同 soft_delete)。
- **Evidence**:`facade/sys_user.rs:93-126`(soft_delete);`model/audit.rs:15-31,33-50,76-88`;`facade/sys_operation_log.rs:20-45,51-54`(write_in_txn txn-aware 範本)。

## R4. role 指派 replace-all(`sys_user_role` 新 write)

**現況事實**:`facade/sys_user_role.rs` 純讀(roles_for_user/roles_for_users);entity composite PK `(user_id, role_id)`、無 soft-delete。

- **Decision**:`sys_user_role` 加 txn-aware `replace_roles_in_txn(txn, user_id, role_codes: &[String]) -> Result<(), DbErr>`(沿 `sys_operation_log::write_in_txn` 吃 `&DatabaseTransaction` 範本):① 解析 role **code→id**(`sys_role::find_active filter code IN`,只取 active role;未知/軟刪 code 略過 — US2-2)→ ② `delete_many WHERE user_id` 砍舊 → ③ `insert_many` 新 pairs。由 `create_user`/`update_user` 在其 `mutate_in_txn` 閉包內呼叫(facade 互呼合法、皆 entity-access 豁免),與 sys_user 變更同 txn 原子。
- 角色變更不另寫獨立 AuditEvent;併入 user 的 Insert/Update payload(payload_after 含 user_roles)即可(audit 粒度=user 操作)。
- **Evidence**:`facade/sys_user_role.rs:1-10`;`entity/src/sys_user_role.rs:5-10`;`facade/sys_operation_log.rs:51-54`。

## R5. addUser 預設密碼 argon2 hash(server 現無 hash 能力)

**現況事實**:`auth/password.rs` 只有 `verify_password(password, phc_hash) -> bool`(doc 明言「server only ever verifies, never hashes — YAGNI」);hash 只在 migration seed 做。`argon2` crate 已是 server dep。test mod + migration seed 已示範 hash 寫法(`SaltString::generate(&mut OsRng)` + `Argon2::default().hash_password(...).to_string()`)。

- **Decision**:`auth/password.rs` 新增 production `pub fn hash_password(plain: &str) -> String`(random salt、與 seed/test 同演算法,確保 addUser 預設「123456」與 seed user 同雜湊、`verify_password` 驗得過)。把 `SaltString`/`OsRng`/`PasswordHasher` import 從 `#[cfg(test)]` 提到 module 頂層。**無新 crate/dep**(argon2 已在)。純函式測試:hash→verify round-trip。
- **Evidence**:`auth/password.rs:5-6,16-23,35-41`;`migration/src/m20260529_000002_seed_sys_user.rs:13-17`。

## R6. Q2=B 停用 status enforce 擋登入 + 拒登碼 = 1000(★ user 親決 A)

**現況事實**:`login_attempt_inner`(auth.rs:108)流程 find_active_by_name → verify_password → roles → sign,**無 status 檢查**;失敗統一 `LoginFailed 1000`(FR-002 no-enumeration:不存在/密碼錯/role 查錯皆 1000)。`find_active()` 只濾 deleted_at、不濾 status(disabled user 仍查得到 Model)。`BizCode::Logout8889`「账号已被禁用」(8889)存在但屬 logout 族;base-web `8889 ∈ VITE_SERVICE_LOGOUT_CODES` → `handleLogout()`+redirect+**`return null` 吞訊息**(不 showErrorMsg)。

- **Decision(user 親決 A,2026-06-01)**:login 在 `verify_password` 通過後、`roles` 前加 `if user.status == Some(2) /*disabled*/ { return Err(BizCode::LoginFailed) }` → **回 1000 統一**(守 013 no-enumeration:停用/密碼錯/不存在皆 1000,攻擊者無法區分)。停用照樣擋登入(無 token 簽發、SC-009 滿足);代價=停用使用者見「用户名或密码错误」(訊息不精確,no-enum 的代價,可接受)。
- **排除 8889**:base-web 對 8889 走 logout-redirect 並**吞掉錯誤訊息**→ 停用使用者在登入頁按登入看不到任何訊息(靜默,UX 更差)+ 8889 原為「已登入後被踢」語意、用於登入入口不當 + 洩漏 enumeration。1000 在 UX 與安全皆優。
- **enforcement 僅登入入口**(FR-013):**不改 enforce_mw / getUserInfo**(避免每請求多一次 DB 查 user + status);已簽發未過期 token 依效期自然失效(立即撤銷既有 session 留後續 feature)。8889 留給日後「已登入後被停用即時踢出」feature。
- login_attempt 審計:停用走 Err 路徑 → success=false/operator_id=None(與一般失敗同列,FR-008 lockout 統計合理);**不**破壞性擴 `login_attempt_inner` 回傳型。
- status 語意:**1=啟用 / 2=停用**(對齊 base-web `EnableStatus '1'|'2'`,smallint 存 1/2)。
- **Evidence**:`handler/auth.rs:108-138`(login_attempt_inner)、`78-96`(login_attempt 寫入);`envelope.rs:93-124`(BizCode 矩陣,LoginFailed 1000);`base-web/.env:35,41`;`base-web/src/service/request/index.ts:55-59`。

## R7. 寫端 wire 形(DTO + id-as-string + updateUser 定位)

**現況事實**:base-web **active service `src/service/api/system-manage.ts` 只讀、無寫 fn**;寫 fn 只在 alova variant(views 不走)。alova `UserModel = Pick<User, 'userName'|'userGender'|'nickName'|'userPhone'|'userEmail'|'userRoles'|'status'>`(7 欄、**無 id、無 password**);`userGender/status = '1'|'2'|null`、`userRoles: string[]`(role **code**)。`deleteUser(id: number)` body `{id}`、`batchDeleteUser(ids: number[])` body `{ids}`、皆 `Delete<null>`。**updateUser(data: UserModel) 不帶 id**(wire 缺口)。base-web 全端 id 型標 `number`,但 016 已凍結 **wire id=string**(§I.3/R6)→ 016 getUserList 回的 id 是 string,故 runtime `row.id` 是 string。

- **Decision**:
  - rust 寫端收 id 一律 **String**(對齊 016 凍結 string id),handler 內 `parse::<i64>()`(parse 失敗→2222);**不盲信 alova 的 `number` 型標**。
  - DTO(`handler/system_manage.rs`,camelCase、serde):`UserCreateReq{ user_name, user_gender: Option<String>, nick_name, user_phone, user_email, user_roles: Vec<String>, status: Option<String> }`(無 id/password);`UserUpdateReq` = 同上 + `id: String`;`DeleteReq{ id: String }`;`BatchDeleteReq{ ids: Vec<String> }`。enum 欄收 string `'1'|'2'`→ parse i16 存 DB(D5)。
  - **updateUser 用 id 定位**:rev2 wrapper `fetchUpdateUser` body 帶 `id`(drawer edit 模式 `handleInitModel` 已 `Object.assign(model, rowData)`→ runtime model 挾帶 `rowData.id`,wrapper 顯式帶 `{...model, id: rowData.id}`)。rust `update_user` WHERE id。(userName 不可改〔Q1=A〕,故不用 userName 當定位鍵、避免改名歧義。)
- **Evidence**:`base-web/src/service-alova/api/system-manage.ts:22-44`;`base-web/src/typings/api/system-manage.d.ts:37,40-62`;`base-web/src/typings/api/common.d.ts:32-48`;`base-web/src/service/api/system-manage.ts:1-55`(只讀);016 凍結 string id `specs/016.../spec.md` FR-010。

## R8. base-web wrapper + 3 placeholder 接線點(MODAL-WIRING v1.2.0)

**現況事實**:views import `@/service/api`(axios `request`,非 alova)。3 處 `// request` placeholder:(1) `user-operate-drawer.vue:107`(handleSubmit,`props.operateType` add/edit);(2) `index.vue:155`(handleDelete(id))、(3) `index.vue:148`(handleBatchDelete,ids=`checkedRowKeys.value`)。`request` 回 flat `{data, error}`(success=code===`0000`)。

- **Decision**:
  - 新檔 **`base-web/src/service/api/rev2-system-manage.ts`**(BASE-WEB-WRAPPER ✓,`rev2-` 前綴、不改既有 system-manage.ts)+ `service/api/index.ts` 補 `export * from './rev2-system-manage'`。4 fn 用 `request<null>({url, method, data})`:fetchAddUser(data) POST、fetchUpdateUser(data+id) POST、fetchDeleteUser(id) DELETE body{id}、fetchBatchDeleteUser(ids) DELETE body{ids}。
  - 3 placeholder 接線(MODAL-WIRING ★ v1.2.0 邊界,只改 `// request` 行):drawer handleSubmit 依 operateType 分支 `await fetchAddUser/fetchUpdateUser`(edit 帶 rowData.id)、!error 才 message+close+emit;index handleDelete→`fetchDeleteUser(id)`、!error 才 onDeleted();handleBatchDelete→`fetchBatchDeleteUser(checkedRowKeys.value)`、!error 才 onBatchDeleted()。
- **Evidence**:`base-web/src/views/manage/user/modules/user-operate-drawer.vue:105-111`、`index.vue:147-159,141,181,189`;`base-web/src/service/api/system-manage.ts:4-10`、`service/request/index.ts:13-27,37`。

## R9. Casbin policy seed(寫端 Super-only)+ route 接線

**現況事實**:enforce matcher exact `(sub,obj,act)`、act=HTTP method、obj=path(無 /api)。016 read 用 per-route `route_layer(from_fn_with_state(state, enforce_mw))`;`main.rs` 現 import `{get, post}`(無 delete)。DESIGN §6.3 seed 矩陣:寫操作 only super。

- **Decision**:新 migration **`m20260529_000015_seed_write_policy`** seed 4 行**逐條 R_SUPER**(無 wildcard,沿 009/013/016 realized 決策、凌駕 DESIGN §6.3 殘留 wildcard 文字):
  `('p','R_SUPER','/systemManage/addUser','POST',...)`、`updateUser POST`、`deleteUser DELETE`、`batchDeleteUser DELETE`,`ON CONFLICT DO NOTHING`。R_ADMIN/R_USER_COMMON 不 seed → 非 Super 寫一律 403+5003。down() 只刪這 4 行。
  - main.rs 加 4 route:`post(add_user/update_user)` + `delete(delete_user/batch_delete_users)`,各 `.route_layer(...enforce_mw)`;`use axum::routing` 加 `delete`。DELETE 帶 Json body(axum 支援;`{id}`/`{ids}` 在 body 非 URL)。
- **Evidence**:`migration/src/m20260529_000009_seed_casbin_policy.rs:16-19`、`m20260529_000013_seed_manage_policy.rs:18-24`;`main.rs:97-125,26-29`;`auth/enforce.rs:36-40,73-93`;DESIGN §6.3:518-519。

## R10. 016 讀端 DTO 改吃真實值(跨 feature 連動)

**現況事實**:016 `handler/system_manage.rs` `UserItem` 的 user_gender/user_phone/user_email/status/create_by/create_time/update_by/update_time 全 `Option<String>`、目前 `user_item` 一律填 None(D2 of 016)。

- **Decision**:017 補完 sys_user 欄後,`user_item` 改吃 Model 真實欄:`user_gender: m.user_gender.map(|g| g.to_string())`(i16→string,D5)、`user_phone/user_email: m.user_phone/...`、`status: m.status.map(|s| s.to_string())`、`create_time: m.created_at`→string(ISO)、`update_time: m.updated_at`→string、`create_by/update_by: m.created_by/updated_by`→string(i64→string)。缺值仍 None→null。**id 維持 string**。這樣新增/編輯的 user 在 getUserList 顯真值(FR-010/SC-008)。
- **Evidence**:`handler/system_manage.rs:32-44`(016 UserItem 8 placeholder 欄)。

## R11. `audit_json` 補欄 + entity 加欄 breaking(必同步)

**現況事實**:`facade/sys_user.rs:18-27` audit_json 硬編 4 欄(id/user_name/password<redacted>/deleted_at);`facade/sys_user.rs:~196` test Model struct literal 寫死 5 欄。entity 加 9 欄是 breaking change → 這兩處不同步更新會 cargo build 紅。

- **Decision**:同 commit 更新:① audit_json 補 nick_name(§2.16#2)+ user_gender/user_phone/user_email/status/created_at/created_by/updated_at/updated_by/deleted_by(**password 持續 `<redacted>`**;email/phone 為審計快照內容、非機密、保留)。② test Model struct literal 補 9 欄。③ 擴 redact 純函式測試斷言新欄。
- **Evidence**:`facade/sys_user.rs:18-27,~196-210`。

## R12. D7 不可刪自己 guard + D8 業務錯誤 2222

**現況事實**:`BizCode::BizError = 2222`「业务错误」已存在;`Res::err_msg`(impl<T>,§2.11)可帶自訂 msg。`ctx.operator_id`(015 RequestContext)= 當前 operator。

- **Decision**:**handler 層**做 D7:`delete_user`/`batch_delete_users` 若目標 id == `ctx.operator_id` → 回 `Res::err_msg(BizError, "不能删除自己")`(2222);**batchDelete 含自己 → 整批拒**(不部分執行,US3-3 明確)。D8:userName 重複(create_user 偵測)→ `Res::err_msg(BizError, "用户名已存在")`(2222)。**不新增 5xxx**(2222 mock-grounded、base-web fallback toast、不違 §I.3〔§I.3 只禁 9999/9998/3333 用於業務驗證〕)。
- **Evidence**:`envelope.rs:47-62,93-124`;`audit_ctx.rs:39-51`(RequestContext.operator_id)。

---

## 風險總表(plan/tasks 須處置)

| # | RISK | 處置 |
|---|---|---|
| 1 | sys_user.id 無 sequence(★最高)| R2:014 raw SQL CREATE SEQUENCE+SET DEFAULT+setval + entity auto_increment=true,成對改;verification 測 up→down→up |
| 2 | `.small_integer()` repo 未用過 | dev docker `cargo build -p migration` 實證 |
| 3 | entity 加 9 欄 breaking(audit_json + test literal)| R11:同 commit 更新 audit_json + test fixtures + redact 測試 |
| 4 | server 無 hash_password | R5:新增 production hash fn(argon2 已在、無新 crate)|
| 5 | updateUser wire 無 id | R7:wrapper 帶 rowData.id、rust update_user WHERE id |
| 6 | id number(alova)vs string(016 凍結)| R7:rust 寫端收 String parse i64,對齊 016 |
| 7 | 停用拒登碼 no-enum 取捨 | R6:user 親決 A=1000 統一;Deviation 不需(維持 013 no-enum)|
| 8 | DELETE 帶 body | R9:axum Json extractor,main.rs import delete |
| 9 | DESIGN §6.3 殘留 wildcard | R9:跟 actual code 逐條 R_SUPER,勿信 §6.3 文字 |
| 10 | operator_ip INET 42804 | R3:017 audit 只帶 operator.id、ip=None |
| 11 | 016 讀 DTO 仍回 null | R10:017 改 user_item 吃真值(跨 feature)|
| 12 | constitution v1.2.0 四檔回填 | plan 前確認 DESIGN §11.15/CHECKLIST §6/MILESTONES 已落地(`fb9a652`/`de4376d` 已做)|

## Constitution Check 對齊(詳見 plan.md §Constitution Check)
§I.1 對齊 base-web 4 寫 endpoint;§I.2 N/A;§I.3 id=string/2222 框定/envelope;§I.4 SDD+TDD;§I.5 D4 clean-room 零 rev1;§II 不動拍板(Q2=B 加 login status gate 屬行為新增、非撤回);§III ★ MODAL-WIRING v1.2.0 邊界已含 index.vue delete(已 ratify);§I.6 N/A(create-time)+ retrofit 紀律落地(sys_user 5 審計欄,*_by=operator i64、成對寫)。
