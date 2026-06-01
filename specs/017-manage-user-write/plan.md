# Implementation Plan: 017-manage-user-write

**Branch**: `017-manage-user-write` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-manage-user-write/spec.md`(源自凍結 brainstorm [`docs/superpowers/017-manage-user-write.md`](../../docs/superpowers/017-manage-user-write.md) D1–D9 + clarify Q1=A/Q2=B)

## Summary

落地 base-web 使用者管理頁的**寫端 CRUD** —— `addUser`/`updateUser`/`deleteUser`/`batchDeleteUser`(4 條,**Super-only**),讓管理員真的能新增/編輯/(軟)刪除使用者。為支撐寫入,**補完 `sys_user` schema**:業務欄(`user_gender`/`user_phone`/`user_email`/`status`,enum 存 smallint、DTO i16→wire string,D5)+ §I.6 6 審計欄(`created_at/by`·`updated_at/by`·`deleted_at`〔009 已有〕`/by`,`*_by`=operator user_id,§I.6 retrofit 紀律落地)+ **`sys_user.id` 改 BIGSERIAL**(現無 sequence,addUser 需 DB 自動產 id,R2 ★最高 risk)。addUser 由 server 指派**預設密碼** argon2(`123456` 慣例,新增 `hash_password` fn,D2);寫入走 011 `mutate_in_txn`(CREATE/UPDATE/SOFT_DELETE audit、operator 由 015 `ctx.operator_id`)+ role **replace-all**(R4);**Q1=A** userName 編輯不可改;**Q2=B** `status=disabled` 於 **login 入口** enforce 擋登入、**回 1000 統一守 013 no-enumeration**(user 親決 A,R6);**D7** 不可刪自己、**D8** 業務錯誤重用 2222。三條掛 013 `enforce_mw` + 新 policy seed(Super-only);接 base-web 既有 modal/list `// request` placeholder(MODAL-WIRING ★ v1.2.0 邊界含 index.vue delete + BASE-WEB-WRAPPER 新檔 `rev2-system-manage.ts`)。016 讀端 DTO 同步改吃真實欄值(R10)。技術決策見 [research.md](research.md);schema/facade/DTO/migration 見 [data-model.md](data-model.md);驗收見 [contracts/verification-commands.md](contracts/verification-commands.md)。

## Technical Context

**Language/Version**: Rust **1.86**(MSRV `rust-toolchain.toml`)

**Primary Dependencies**: axum 0.7 + sea-orm 1.1.20(**首次用 `small_integer()` builder**,R1,須 dev docker `cargo build -p migration` 實證)+ `argon2`(**已在 server**,新增 production `hash_password` fn、R5)+ tokio + Postgres。**無新外部 dep / 無新 workspace crate**。承接:008 `Res<T>`/`BizCode`(2222 現成)、009 `find_active`/facade/entity-access lint、011 `mutate_in_txn`/`AuditOperation`(Insert/Update/SoftDelete 皆已定義)/`AuditSerialize`、013 login/enforce/jwt/argon2 verify、015 `ctx_mw` operator_id、016 systemManage read + `UserItem` placeholder。

**Storage**: PostgreSQL。**2 個 migration**(經 010 自動套、server 不自動 migrate):`m..014_alter_sys_user_business_audit`(業務欄 + §I.6 審計欄〔builder add_column〕+ **id BIGSERIAL**〔raw SQL CREATE SEQUENCE+SET DEFAULT+setval,R2〕+ seed status=1 回填)/ `m..015_seed_write_policy`(casbin policy 4 行 R_SUPER,非業務表)。

**Testing**: 純單測(`hash_password`→verify round-trip / enum string↔i16 / role replace-all SQL-build〔delete+insert IN〕/ self-delete guard 判定 / write DTO 解析 / `audit_json` redact 補欄)+ in-crate `#[cfg(test)] #[ignore]` live-DB(facade create/update/soft_delete round-trip + audit 寫入,放 facade/)+ dev stack curl/psql + **CDP**(管理頁新增/編輯/刪除 user 端到端 + 停用使用者無法登入)。

**Target Platform**: Linux container(`rust-api` service)

**Project Type**: backend web-service(rust-api)+ base-web 受管軌道接線(MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER)

**Performance Goals**: admin panel 低流量;寫入固定 query(單一 `mutate_in_txn`:user insert/update + role delete+insert + audit insert,原子)。

**Constraints**: 預設密碼(D2)/ id wire=string(R7,寫端收 String parse i64)/ enum smallint↔wire string(D5)/ **停用拒登 1000 守 no-enum**(R6/親決 A)/ userName 編輯不可改(Q1=A)/ 不可刪自己(D7)/ 業務錯誤 2222(D8)/ **無新 crate/dep**。

**Scale/Scope**: 4 write endpoint + 1 login 改(status gate)+ 3 facade write fn(create/update/擴 soft_delete)+ 1 role replace-all txn-aware fn + 1 `hash_password` fn + 2 migration + entity 9 欄 + 016 `user_item` 改吃真值 + base-web `rev2-system-manage.ts`(4 fn)+ 3 placeholder 接線。

## Constitution Check

*GATE:Phase 0 前必過;Phase 1 後 re-check。對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.2.0 §IV 8 項**。*

| # | 檢查 | 結果 |
|---|---|---|
| 1 | **§I.1 base-web 為權威**:rust-api 是否未提供 base-web 用到的對應 endpoint? | ✅ PASS — 落地 base-web user 管理頁既有寫功能(drawer 新增/編輯 + list 刪除/批次刪除按鈕 + `// request` placeholder 已存在)→ 補對應 4 rust-api endpoint,填補既有缺口。 |
| 2 | **§I.2 menu 顯示走 Casbin enforce?** | ✅ N/A — 017 不觸 menu。寫端授權走 013 `enforce_mw`(act=POST/DELETE)。 |
| 3 | **§I.3 wire 對齊 mock ground truth?** | ✅ PASS — envelope `{data,code,msg}` code=string、寫回 `Res<()>`(data=null,對齊 alova `Delete/Post<null>`)、**id=string**(寫端收 String parse i64,R7)、enum wire string `'1'\|'2'`(DTO i16↔string,D5)、camelCase、userRoles=role code 陣列。**2222 框定為 generic biz-error**(userName 重複 / 不可刪自己;§I.3 只禁 `9999/9998/3333` 用於業務驗證,2222 與 5xxx 同走 base-web fallback toast、不在禁列)。**停用拒登=1000**(守 §I.3 no-enum 精神 + 013 FR-002)。 |
| 4 | **§I.4 SDD+TDD 工作流?** | ✅ PASS — 走設計鏈;純函式(hash/enum 轉換/role SQL-build/guard/DTO/audit_json)test-first,wiring(handler/route/migration/login gate)由 curl+psql+CDP acceptance 覆蓋。 |
| 5 | **§I.5 從 rev1 拷貝 code?屬例外?** | ✅ PASS — **D4 clean-room**:schema 補欄純從 base-web typings 推導、零 rev1 參照(§I.5 process 紀律:research 不 grep rev1 source)。 |
| 6 | **§II 12 拍板凍結?** | ✅ PASS — 不改任何 §II 拍板。**id=string(§11.10)維持**(R7、不重蹈 rebase260531 number 破例)。**Q2=B 在 login 加 `status=disabled` gate = 行為新增**(用既有 `LoginFailed 1000` 碼)、**非撤回任何拍板**;§11.13(login 替代入口)指替代登入流程、與主 login status gate 無關。 |
| 7 | **§III ★ 軌道?在授權邊界?** | ✅ PASS — 觸 **MODAL-WIRING ★**:drawer handleSubmit + **index.vue delete/batchDelete 的 `// request` 一行**;constitution **v1.2.0**(已 ratify `fb9a652`)邊界已含 `views/manage/**` 的 index.vue delete handler → **在授權內**。**BASE-WEB-WRAPPER**(`rev2-system-manage.ts` 新檔、`rev2-` 前綴、不改既有 system-manage.ts)為預設可動軌道。紀律:只改 `// request` 行接 wrapper call、每處 spec 記 file:line + upstream 風險。不觸 BASE-WEB-BUILD-CONFIG ★。 |
| 8 | **§I.6 新建業務表含 6 審計欄?append-only/join 表依例外?** | ✅ N/A(create-time)+ **retrofit 紀律落地** — 017 **不建新業務表**(只 ALTER sys_user + 1 個 casbin policy-seed migration〔非業務表〕)→ Check #8「新建業務表」**N/A**。但本 feature **即 §I.6 retrofit 紀律所指的 `sys_user` 審計欄補齊**:加 `created_at/created_by/updated_at/updated_by/deleted_by`(`deleted_at` 009 已有),**`*_by`=operator user_id(`Option<i64>`)非 user_name**、**成對寫**(deleted_at+deleted_by / updated_at+updated_by);`*_by` 由本 feature 新增的寫路徑帶 operator(015 `ctx.operator_id`)填。`sys_role` 審計欄 retrofit 留 018。 |

**Gate 結果**:**8/8 PASS(含 #2 N/A、#8 N/A create-time + retrofit 紀律落地)。無 violation、無需 Amendment(v1.2.0 D3 amendment 已於 brainstorm 階段 ratify)、無 Complexity Tracking。**

## Project Structure

### Documentation (this feature)

```text
specs/017-manage-user-write/
├── plan.md              # 本檔
├── research.md          # Phase 0(R1-R12 + 風險總表;5-lens 平行 grep 實際碼)
├── data-model.md        # Phase 1(sys_user 補欄 entity/facade + write DTO + role replace-all + audit + 2 migration)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V 合約(純單測 + curl/psql + CDP + 守恆 + 停用登入驗)
├── checklists/requirements.md     # /speckit-specify 產(全 ✅)
└── tasks.md             # Phase 2(/speckit-tasks 產,本指令不建)
```

### Source Code (rust-api worktree + base-web 受管軌道)

```text
rust-api/
├── migration/src/
│   ├── m20260529_000014_alter_sys_user_business_audit.rs  # 新:業務欄+§I.6 審計欄(builder add_column)+ id BIGSERIAL(raw SQL CREATE SEQUENCE+SET DEFAULT+setval)+ seed status=1 回填(raw UPDATE)
│   ├── m20260529_000015_seed_write_policy.rs              # 新:casbin policy 4 行 R_SUPER(addUser/updateUser POST、deleteUser/batchDeleteUser DELETE,逐條無 wildcard)
│   └── lib.rs                                              # 改:mod + migrations() 加 014/015(接 013)
├── entity/src/
│   └── sys_user.rs        # 改:加 9 欄(user_gender Option<i16>/user_phone·user_email Option<String>/status Option<i16>/created_at DateTimeWithTimeZone/created_by·updated_by·deleted_by Option<i64>/updated_at Option<DateTimeWithTimeZone>)+ id auto_increment=true
├── server/src/
│   ├── auth/password.rs   # 改:加 production hash_password(plain)->String(argon2,import 從 cfg(test) 提頂層;無新 crate)
│   ├── handler/auth.rs    # 改:login_attempt_inner verify_password 後加 status==disabled→Err(LoginFailed 1000)(R6/親決 A)
│   ├── handler/system_manage.rs  # 改:加 write DTO(UserCreateReq/UserUpdateReq/DeleteReq/BatchDeleteReq,id=String)+ add_user/update_user/delete_user/batch_delete_users handler(operator 由 Extension<RequestContext>、D7 自刪 guard、D8 2222)+ user_item 改吃真實欄(R10)
│   ├── model/facade/sys_user.rs       # 改:create_user/update_user(mutate_in_txn Insert/Update)+ soft_delete 擴 operator(deleted_by)+ audit_json 補 9 欄(password redact)+ test Model literal 補欄
│   ├── model/facade/sys_user_role.rs  # 改:replace_roles_in_txn(txn, user_id, role_codes)(解析 code→active id + delete_many + insert_many)
│   └── main.rs            # 改:加 4 route(post add_user/update_user + delete delete_user/batch_delete_users,各掛 enforce_mw)+ use axum::routing 加 delete

base-web/  (MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER)
├── src/service/api/rev2-system-manage.ts  # 新(BASE-WEB-WRAPPER):fetchAddUser/fetchUpdateUser/fetchDeleteUser/fetchBatchDeleteUser(request<null>)
├── src/service/api/index.ts               # 改:export * from './rev2-system-manage'
├── src/views/manage/user/modules/user-operate-drawer.vue  # 改(MODAL-WIRING):handleSubmit // request 一行 → 依 operateType fetchAddUser/fetchUpdateUser(edit 帶 rowData.id)
└── src/views/manage/user/index.vue        # 改(MODAL-WIRING v1.2.0):handleDelete/handleBatchDelete // request 一行 → fetchDeleteUser(id)/fetchBatchDeleteUser(checkedRowKeys)
```

**Structure Decision**:單一 rust-api worktree、無新 crate;base-web 僅動 2 條 ★ 授權軌道(MODAL-WIRING 3 placeholder 一行接線 + BASE-WEB-WRAPPER 1 新檔)。**兩段式 commit**(動 rust-api + base-web 兩 worktree → 各自 commit+push fork + 外層 bump 2 個 SHA pin;§4.1)。

## Design Notes(非 violation,供 implementer / review 對焦)

- **N-1 id BIGSERIAL(★最高 risk,R2)**:sys_user.id 現無 sequence/DEFAULT,014 migration raw SQL `CREATE SEQUENCE … SET DEFAULT nextval … setval(GREATEST(MAX(id),1))`(下一個=4 避撞 seed 1/2/3)**+ entity `auto_increment=true` 成對改**;addUser ActiveModel `id: NotSet`。verification 測 up→down→up reversibility。
- **N-2 停用拒登=1000(R6/親決 A)**:login `verify_password` 後加 `status==Some(2)→Err(LoginFailed)`(1000 統一、守 013 no-enum);**僅 login 入口**(FR-013,不改 enforce_mw/getUserInfo);8889 排除(base-web 吞訊息 + enum leak)。status 1=啟用/2=停用。
- **N-3 updateUser 用 id 定位(R7)**:alova UserModel 無 id,但 rev2 wrapper 帶 `rowData.id`(drawer edit 已 Object.assign rowData);rust `update_user` WHERE id;userName 不可改(Q1=A)、不動 password。
- **N-4 寫端 id 收 String(R7)**:對齊 016 凍結 wire id=string(非 alova `number` 型標);handler parse i64(失敗→2222)。
- **N-5 entity 加 9 欄 breaking(R11)**:同 commit 更新 `audit_json`(補 nick_name〔§2.16#2〕+ 9 新欄、password 持續 redact)+ test Model struct literal(補 9 欄)+ redact 純測,否則 cargo build 紅。
- **N-6 016 讀 DTO 改吃真值(R10,跨 feature)**:`user_item` 由一律 null 改吃 Model 真實 gender/phone/email/status/created_*/updated_*(i16/i64→string、缺值仍 null),否則新增 user 不反映於 getUserList(FR-010/SC-008)。
- **N-7 業務錯誤 2222(D8/R12)**:userName 重複「用户名已存在」/ 自刪「不能删除自己」回 `Res::err_msg(BizError, …)`(2222);不新增 5xxx。
- **N-8 自刪 guard(D7/R12)**:handler 層比對 `ctx.operator_id` vs 目標 id;batchDelete 含自己→**整批拒**(不部分執行)。
- **N-9 role replace-all 原子(R4)**:`create_user`/`update_user` 的 `mutate_in_txn` 閉包內呼叫 `sys_user_role::replace_roles_in_txn`(code→active id + delete_many + insert_many),與 user 變更同 txn;未知/軟刪 code 略過。
- **N-10 audit 不帶 operator IP(R3)**:`AuditOperator{id: operator, ip: None}`(避 `sys_operation_log` Some(ip)→INET 42804 未解 bug,§2.14#2)。
- **N-11 無新 crate/dep → prod build 非強制**:用既有 sea-orm/argon2/008/011/013。`hash_password` 是新 production fn(非新 crate)。**建議**(非強制)跑一次 prod image build sanity(schema + login 改動範圍較大);不觸發 CLAUDE.md §3「新 crate ⇒ prod build」硬規則。
- **N-12 `.small_integer()` 首用(R1)**:dev docker `cargo build -p migration` 實證 smallint 欄能編譯,勿盲信。

## Complexity Tracking

> 無 Constitution violation → 本節空。(Q2=B 改 013 login + id BIGSERIAL 改 007 schema 屬跨 feature 行為新增/retrofit,非 constitution violation;risk 處置見 research.md 風險總表 + 上方 Design Notes。)
