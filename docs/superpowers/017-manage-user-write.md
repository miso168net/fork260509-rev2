# 017-manage-user-write — Phase 0 Brainstorm spec-design

**Date**: 2026-06-01 | **Feature**: `017-manage-user-write` | **Status**: brainstorm 完成、待 `/speckit-specify`
**前置**: 016-manage-role-user-list ✅(user/role 唯讀 list,merge `5969d08` / SHA pin `81c56ef`)
**來源**: 本檔由 `superpowers:brainstorming` 階段 0 產出;D1–D9 為 user 親決。CLAUDE.md §3 階段 0 產物路徑。

---

## 一句話

落地 base-web 系統管理「使用者管理」頁的**寫端 CRUD** —— `addUser`/`updateUser`/`deleteUser`/`batchDeleteUser`,讓 admin 真的能新增/編輯/(軟)刪除使用者。順帶補完 `sys_user` 業務欄 + §I.6 審計欄、`sys_user.id` 改 BIGSERIAL,並接 base-web 既有 modal/list placeholder。**Super-only 寫**。延續 016(唯讀)→ 完整 user 管理閉環。

---

## D1–D9 親決(brainstorm 拍板)

| # | 決策 | 拍板 |
|---|---|---|
| **D1** | Scope 拆分 | **017 = user CRUD only**;role CRUD 留 **018**(reuse 017 pattern)。先在 user 端攻克新難點(密碼/角色指派/業務欄補完),role 端照模板。 |
| **D2** | addUser 密碼 | **伺服器端預設密碼**:寫入固定預設(argon2id of `123456`,對齊現有 seed 帳號慣例),**user-operate-drawer 不加 password 欄**(守 MODAL-WIRING ★ 邊界、對齊 soybean example 本無密碼欄)。「設定/修改密碼」flow 獨立留未來 feature。 |
| **D3** | delete 授權邊界 | **擴 MODAL-WIRING ★ 邊界 + constitution amendment(v1.1.0 → v1.2.0,MINOR)**:delete/batchDelete 的 `// request` 在 `views/manage/*/index.vue`(原 ★ 只授權 `modules/*-operate-{modal,drawer}.vue`)→ 擴成「`views/manage/**` 內的 `// request` placeholder」,紀律不變(只改 `// request` 一行接 wrapper call)。 |
| **D4** | schema 補欄來源 | **純從 base-web typings 推導(clean-room、不參照 rev1)**;同 016 ethos。gender/status = wire enum(`'1'\|'2'`)、phone/email = nullable text。**不破 §I.5**。 |
| **D5** | enum 欄 DB 型 | gender/status 存 **`smallint`(1/2)**,DTO `i16 → string` 對 wire(較正規;讀端 016 DTO 改吃真值、寫端 string→i16 解析)。 |
| **D6** | status seed 回填 | 3 個 seed user 的 `status` 補 **`1`(enabled)**;`created_at` 取 `now()`、`created_by` 留 **null**(系統建立無 operator,誠實)。 |
| **D7** | 刪除防呆 | **加最小「不可刪自己」guard**:deleteUser/batchDeleteUser 若目標含 operator 本人 user_id → 拒(回 2222「不能删除自己」),防 admin 自我登出鎖死。更廣的 protected-user(不可刪 seed Super id 1 / 其他 super)留 follow-up。 |
| **D8** | 寫驗證錯誤碼 | **重用既有 `BizCode::BizError`(2222「业务错误」)+ 自訂 msg**(`err_msg`):userName 重複 → 2222「用户名已存在」;self-delete 拒絕(D7)亦回 2222。**不新增 5xxx**(2222 是 mock-grounded 既有碼、base-web 對非登出碼 fallback toast)。⚠️ 與 §I.3「業務驗證 = 5xxx」有輕微張力 → `/speckit-plan` Constitution Check 須確認「2222 用於寫驗證/業務規則錯誤」可接受(框定為 generic biz-error、非 §I.3 5xxx validation),否則屆時改 5xxx。 |
| **D9** | (承 016 凍結,複述供 implementer) | id 對外 **string**(§I.3,**絕不**重蹈 rebase260531-016 備份把 id amend 成 number);envelope `{data,code,msg}` code=string;寫 endpoint 回 `Res<()>`(data=null,對齊 base-web `Post<null>`);只動 rust-api + base-web 授權軌道、不動其他。 |

---

## §1 Scope

**In**:
- `sys_user` schema 補完(業務欄 + §I.6 審計欄 + `id` BIGSERIAL + seed 回填)—— 新 ALTER migration,**不改 001/006**(immutable)。
- 4 個寫 endpoint:`POST /systemManage/addUser`、`POST /systemManage/updateUser`、`DELETE /systemManage/deleteUser`、`DELETE /systemManage/batchDeleteUser`。
- seed policy migration 補 4 條 × R_SUPER(Super-only 寫)。
- base-web 接線:`rev2-system-manage.ts` 寫 wrapper(新檔)+ MODAL-WIRING(drawer create/update)+ index.vue(delete/batchDelete,擴邊界後)。
- constitution amendment v1.2.0(D3)。

**Out**(明確不在 017):
- role CRUD(→ 018)、改密 flow、menu(getMenuList/getMenuTree、需 sys_menu)、其餘 entity、alova 變體寫端(§11.2 stub flag 另議)。

---

## §2 `sys_user` schema 補完(新 ALTER migration,沿 008 模式)

> 不改 001(create_sys_user)/ 003 / 008;加**新** migration(號接 013 後、由實作定;經 010 自動套)。

**業務欄**(D4 從 base-web typings 推導):
| 欄 | DB 型 | wire(base-web typing) | 備註 |
|---|---|---|---|
| `user_gender` | `smallint NULL` | `UserGender \| null`(`'1'\|'2'`) | D5:smallint↔string |
| `user_phone` | `varchar NULL` | `userPhone: string` | nullable |
| `user_email` | `varchar NULL` | `userEmail: string` | nullable |
| `status` | `smallint NULL` | `EnableStatus \| null`(`'1'\|'2'`) | D5;addUser 表單必填、新列必有值 |

**§I.6 六審計欄**(business main table 強制):
- `created_at timestamptz NOT NULL default now()`、`created_by bigint NULL`
- `updated_at timestamptz NULL`、`updated_by bigint NULL`
- `deleted_at timestamptz NULL`(**009 已有**)、`deleted_by bigint NULL`(新增)
- `*_by` = operator 的 `user_id`(`Option<i64>`,非 user_name);成對寫(deleted_at+deleted_by / updated_at+updated_by)。

**`sys_user.id` → BIGSERIAL / sequence**(§2.10、D 必需):007 用顯式 seed id 1/2/3、無 sequence;addUser 動態建列須有 auto-increment。新 migration 設 sequence 並對齊現值(避免與 seed id 1/2/3 撞號;sequence start ≥ 4)。

**seed 回填**(D6):`UPDATE sys_user SET status=1, created_at=now() WHERE id IN (1,2,3)`(冪等;`created_by` 留 null)。

**entity / facade 同步**:`entity/src/sys_user.rs` 加欄;`facade/sys_user.rs` 新增寫入 facade(create/update + role 指派協作),走 011 `mutate_in_txn`、守 009 entity-access lint。016 的讀 DTO(`UserItem`)改吃真實 gender/phone/email/status/created_*(不再一律 null;缺值仍 null)。

---

## §3 endpoints + wire

四條皆掛 013 `enforce_mw`、**Super-only**(DESIGN §6.3 寫操作 only super);新 seed policy migration 補 `p,R_SUPER,/systemManage/{addUser,updateUser,deleteUser,batchDeleteUser},{POST,POST,DELETE,DELETE}`(逐條、無 wildcard、路徑無 /api,沿 009/016)。Admin/User 寫一律 403+5003。

| endpoint | method | request(camelCase) | 行為 |
|---|---|---|---|
| addUser | POST | `{userName,userGender,nickName,userPhone,userEmail,userRoles[],status}`(無 password/id) | 寫 sys_user(password=預設 argon2 `123456`、business 欄解析 string→i16、`created_by`=operator)+ 寫 sys_user_role(roles 指派)。同 txn + CREATE audit。userName 重複 → **2222「用户名已存在」(D8)**。 |
| updateUser | POST | 同上 + `id` | 更新 business 欄 + `updated_by`=operator;**replace-all** 重置 sys_user_role(刪該 user 舊列 + 插新,同 txn);**不動 password**。UPDATE audit。 |
| deleteUser | DELETE | `{id}` | **self-guard(D7):id == operator → 拒 2222「不能删除自己」**;否則 **soft-delete**(重用 009/011 `soft_delete`,帶 `deleted_by`=operator)。SOFT_DELETE audit(011 已有路徑)。 |
| batchDeleteUser | DELETE | `{ids[]}` | **self-guard(D7):ids 含 operator → 整批拒 2222**;否則逐筆 soft-delete(同一 txn)。各寫 SOFT_DELETE audit。 |

**共通**:
- 回應 `Res<()>`(data=null;成功 0000)。
- **operator 來源**:015 `ctx_mw` 已把 `operator_id` 塞 request extension(JWT claims `user_id`);寫 handler 從 `Extension<RequestContext>` 取 operator → 帶入 audit `*_by` + `operator`。
- **role 指派**:`userRoles` = role **code** 陣列 → 解析成 active `role_id`(`sys_role::find_active` filter code IN)→ 寫 sys_user_role;未知/軟刪 code 略過(或回錯,實作定;傾向略過 + 至少留有效者)。
- **audit**:add/update/delete 皆走 011 `mutate_in_txn`(唯一原子寫入入口),補 CREATE/UPDATE enum(011 已定義、SOFT_DELETE 已接線;CREATE/UPDATE 此 feature 首次真接)。redact password。
- **SQL injection**:user input 全走 sea-orm parameterized(§5.10);絕不 `execute_unprepared(format!)`。

---

## §4 base-web 接線(只動授權軌道)

- **新檔 `base-web/src/service/api/rev2-system-manage.ts`**(BASE-WEB-WRAPPER ✓,`rev2-` 前綴、不改既有 `system-manage.ts`):`fetchAddUser`/`fetchUpdateUser`/`fetchDeleteUser`/`fetchBatchDeleteUser`(走 soybean `request`,型對齊 wire)。
- **MODAL-WIRING ★**:`user-operate-drawer.vue` `handleSubmit` 的 `// request`(現 line ~107)→ 依 `operateType` `await fetchAddUser/fetchUpdateUser(model)`。**只改該行 + import wrapper**,不加表單欄(D2)。
- **(擴邊界後,D3)`user/index.vue`**:`handleDelete`(~155)/`handleBatchDelete`(~148)的 `// request` → `await fetchDeleteUser(id)` / `fetchBatchDeleteUser(ids)`。
- **不動**:`system-manage.ts`(讀)、drawer 表單結構、列表欄定義、typings(id:number 型補正屬 §2.20 BASE-WEB-ADAPT 另案)。
- **act on actual code**:行號為參考,實作以符號(`handleSubmit`/`handleDelete`/`handleBatchDelete` + `// request`)定位。

---

## §5 Constitution Amendment(v1.1.0 → v1.2.0,MINOR)

**為何**:D3 —— delete/batchDelete placeholder 在 index.vue,超出 MODAL-WIRING ★ 原邊界(`modules/*-operate-{modal,drawer}.vue`)。

**改動**(§V.2 流程:**先列改動行給 user 過目 → okok 才動 constitution + 回填 DESIGN §11 / CHECKLIST 1 行 / MILESTONES**):
- constitution §III MODAL-WIRING ★「邊界」:`modules/*-operate-{modal,drawer}.vue` 內 `// request` → **`views/manage/**` 內 `// request` placeholder(含 index.vue 的 delete/batchDelete handler)**。
- 紀律不變:**只改 `// request` 那一行接 wrapper call**,絕不擴張到其他 inline;每改一處 spec 內記(file:line + 改動 + upstream 衝突風險)。
- §II §11.3 摘要同步;version → **1.2.0**(§V.3「軌道授權邊界擴展」= MINOR)。
- 提案紀錄進 DESIGN §11(非 CHECKLIST);CHECKLIST 留 1 行指標;MILESTONES append。
- **時機**:在 `/speckit-plan` 前 ratify(否則 Constitution Check #7 ★ 軌道會卡,如 014 menu re-scope)。

---

## §6 測試策略(§I.4 / CLAUDE.md §3)

- **純單測 test-first**:write DTO 解析(camelCase 收 + 必填驗)/ gender·status `string↔i16` 轉換 / role 指派 SQL-build(code→id IN、replace-all delete+insert)/ batchDelete ids 正規化 / userName 重複偵測 / **self-delete guard(`id == operator` 判定,純邏輯)**。
- **live-DB**(in-crate `#[ignore]` + `DATABASE_URL`,放 facade/):addUser 寫穿(sys_user + sys_user_role + audit 各 1)/ updateUser replace-all / soft_delete 帶 deleted_by。
- **活體 curl/psql**:4 endpoint × Super 成功 + Admin/User 403+5003 + 無 token 3333;soft-delete 後該 user 不現於 016 getUserList;audit 寫入(psql 查 sys_operation_log CREATE/UPDATE/SOFT_DELETE + operator);role 指派生效(getUserInfo/getUserList userRoles 反映);userName 重複 → 2222;**self-delete 拒絕(deleteUser/batchDelete 含 operator 自己 → 2222、且該 user 仍在)**;seed status 回填 = enabled。
- **CDP**:登入 Super → 管理頁 新增一個 user(填表 → 列表多一筆,密碼預設)→ 編輯(改 nick/roles → 反映)→ 刪除(soft,列表少一筆)端到端;Admin 登入確認寫按鈕打 403(或前端 enforce 後行為)。
- **守恆**:server 既有測 + entity_access_lint + xdb 不破;`Migrator::up` grep 0。
- **prod build**:無新 crate(用既有 argon2〔013 已引〕+ sea-orm + 011/013/016 pattern)→ prod image build 非強制(可選 sanity);**若**引入新 dep 則依 CLAUDE.md §3 必含 prod build。

---

## §7 Constitution Check 預覽(/speckit-plan 會正式跑)

| # | 檢查 | 預期 |
|---|---|---|
| 1 | §I.1 base-web 權威 | ✅ 落地 base-web user 管理頁既有寫功能(按鈕+placeholder 存在 → 補對應 endpoint) |
| 2 | §I.2 menu 走 enforce | ✅ N/A(不觸 menu) |
| 3 | §I.3 wire 對齊 mock | ✅ id=string、envelope、寫回 null、camelCase、enum 對齊;**寫驗證/業務規則錯誤用 2222(D8,reuse mock-grounded 碼)** — ⚠️ §I.3 另述「業務驗證 = 5xxx」,Check 須確認 2222 框定可接受(generic biz-error,非 §I.3 5xxx validation),否則改 5xxx |
| 4 | §I.4 SDD+TDD | ✅ 走設計鏈;純函式 test-first、wiring 由 acceptance 覆蓋 |
| 5 | §I.5 不拷貝 rev1 | ✅ D4 clean-room、零 rev1 參照 |
| 6 | §II 12 拍板凍結 | ✅ 不改;id 維持 string(D9)、route /api 前綴等不動 |
| 7 | §III ★ 軌道 | ⚠️→✅ **觸 MODAL-WIRING ★**:create/update 在原邊界內;**delete 需 v1.2.0 amendment 擴邊界(D3)**——ratify 後在授權內。BASE-WEB-WRAPPER(rev2- 新檔)在預設可動軌道。 |
| 8 | §I.6 業務表審計欄 | ✅ N/A(create-time 條款)+ retrofit 紀律落地:017 **不建新業務表**(只 ALTER sys_user + 一個 policy-seed migration)→ Check #8「新建業務表」**N/A**;但本 feature **即 §I.6 retrofit 紀律(forward-only、既有表缺口由獨立 retrofit feature 補)所指的 sys_user 審計欄補齊** —— 加 created_at/by、updated_at/by、deleted_by(deleted_at 009 已有),`*_by` 由寫路徑帶 operator 填。policy-seed migration 為 casbin_rule(非業務表、亦免)。 |

---

## §8 對既有 feature 的連動 / follow-up 收口

- **§2.10 + §2.20#2**:`sys_user.id` BIGSERIAL —— 本 feature 處理(017 動 sys_user.id;`sys_role.id` 留 018)。
- **§2.18 §I.6 retrofit**:本 feature 補 **sys_user**(sys_role 留 018);兩張補完後 §2.18 收斂。
- **§2.16#2**:sys_user `audit_json` 補 nick_name —— 動 sys_user audit 快照時順手補。
- **§2.14#1**:「facade 漏配 audit」build-failing lint —— 寫路徑首次變多(CREATE/UPDATE),為加 lint 的好時機(可納入或記 follow-up)。
- **§2.14#2**:`sys_operation_log.operator_ip` 真值 INET —— 寫端帶 operator 時可套 015 已驗的 `ipnetwork` 解法(可選)。
- **§2.20#1**:base-web `id:number` 型補正(BASE-WEB-ADAPT)—— 仍另案、非 017。
- **新 follow-up**:更廣刪除防呆 —— 017 已做最小「不可刪自己」(D7);protected-user(不可刪 seed Super id 1 / 其他 super / 最後一個 super)留後續。

---

## §9 下一步(階段 1 SDD,手動)

1. **(prereq)** ratify constitution v1.2.0 amendment(D3、§5;先列改動行 → user okok → commit + 回填)。
2. **手動** `/speckit-specify`(input = 本檔)→ `speckit.git.feature` pre-hook 建 `017-manage-user-write` feature branch。
3. `/speckit-clarify` → `/speckit-plan`(對照 constitution v1.2.0,§7 預覽)→ `/speckit-tasks` → `/speckit-analyze`。
4. `superpowers:executing-plans` → `subagent-driven-development` 實作。
