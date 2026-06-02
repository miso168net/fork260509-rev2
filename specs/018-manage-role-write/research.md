# Research: 018 manage-role-write (Phase 0)

> 依 CLAUDE.md §3 紀律:grep 驗證真實 code、不信 brainstorm 命名假設。5 cluster 並行驗證(workflow `wojt72ww2`)。所有 NEEDS CLARIFICATION 已解。**No new crate/dep**(argon2 / sea-orm `Expr`·`small_integer` / 011 audit / 015 ctx 皆既有)。

---

## R0 ★ 關鍵決策:停用/刪角色「即時不授權」的 enforce 機制(plan-gate re-scope)

**Decision**: **改 `enforce_mw` 從讀 JWT `claims.roles` → 每請求查 DB 有效角色(`roles_for_user`)**,使停用/軟刪角色於下次授權檢查即時失效(clarify Q1=A / 本 feature Clarifications Q3,user 親決 B,2026-06-02)。

**Rationale(grep 證實)**:
- `auth/enforce.rs:57-94`:enforce_mw 原 `for role in &claims.roles { enforcer.enforce((role, path, method)) }` —— 讀 **token 快照**、授權路徑無 DB 查。
- `auth/jwt.rs:29-40`:`Claims{..., roles: Vec<String>, ...}` —— roles 簽入 token、一簽凍結。
- `handler/auth.rs:142`:login 簽 token 前查一次 DB 角色 snapshot 進 token;`auth.rs:294-318`:refresh 從舊 claims 重簽、**不回 DB**(stateless D4)→ 陳舊角色續命到 refresh TTL **7d**(`config.rs:321-322`:access 1h / refresh 7d)。
- 對比:getUserInfo(`auth.rs:245`)、getUserRoutes/isRouteExist(`route.rs:53/114`)都 DB-fresh(`roles_for_user`)、013 註記「DB 為權威源、非 token claims」屬實。
- ∴「只在 roles_for_user 加 status filter」改不到 enforce_mw(它不走 roles_for_user)→ 停用角色 API 授權無法即時失效(最壞陳舊窗 = refresh 7d)。

**實作**: enforce_mw 改 `verify(token) → roles = roles_for_user(db, claims.user_id)〔effective〕→ for role in roles { enforce((role, path, method)) }`。`claims.roles` 變 vestigial(不再為 enforce 權威;login 仍簽、無害)。realizes brainstorm「一處 filter、處處生效」(effective-role-set 現亦 governs enforce)。

**Cost / 影響**: enforce 每受保護請求 +1 次角色查詢(2 個 indexed query:`sys_user_role WHERE user_id` + `sys_role WHERE id IN`,廉價);棄 013 D4 stateless-enforce 優化;**修訂 013 enforce_mw(shipped)→ 回歸驗 013 enforce allow/deny(SC-011)**。Constitution:無凍結拍板涵蓋「enforce 取角色源」(§11.6 只定 axum-casbin 重寫存在、§11.7 dynamic route mode),∴ **不需 amendment**;013 D4「stateless refresh」是 feature-level deviation、本 feature 將其 enforce 部分改 DB-fresh(refresh 仍可 stateless,因 claims.roles 對 enforce 已不權威)。

**Alternatives considered**:
- **A**(對齊現 token 模型,enforce 等下次登入清):最小、與既有角色軟刪 enforce 行為一致,但 clarify Q1=A「即時」不成立。**user 否決**。
- **C**(status 純顯示、不 enforce):丟 D3 語意。**user 否決**。
- token role-version(claims 加 version、變更 bump、refresh 比對):比 B 複雜、仍非每請求即時。否決。

---

## R1 effective-role-set 設計(D3+D4 落地)

**Decision**: 新增 `sys_role::find_active_enabled()` = `find_active().filter(Status = 啟用(1))`(= `deleted_at IS NULL AND status = 1`)。**消費端分流**:

| 消費端 | 用 | 理由 |
|---|---|---|
| `getRoleList`(`list_active_paginated`) | **`find_active`(只濾 deleted_at)** | FR-012:管理列表**仍顯示停用角色**(供重啟用) |
| `getAllRoles`(`list_active_all`) | **`find_active_enabled`** | 指派下拉排除停用/軟刪(不可指派) |
| `roles_for_user(s)`(`sys_user_role.rs:27-122`) | **`find_active_enabled`** | enforce(B)/getUserInfo/menu 即時排除停用/軟刪角色 |
| `replace_roles_in_txn` 的 `roles_by_codes_query`(`sys_user_role.rs:127`) | **`find_active_enabled`** | 指派只採有效角色;未知/軟刪/**停用**碼皆靜默略過(擴 017 US2-AS-2) |

**Rationale**: `find_active`(`soft_delete.rs:9-17` default method)只濾 deleted_at;getRoleList 需顯停用故不可全域改 find_active。`roles_for_user`(`sys_user_role.rs:27-52` 兩步查 + `83-122` 批次版)現委派 `sys_role::find_active()` → 加 status filter 處即一處生效於 enforce(B)/getUserInfo/menu/getAllRoles/replace_roles。**Alternatives**: 全域改 find_active 加 status(否:破 getRoleList 顯停用)。

---

## R2 sys_role schema retrofit(§I.6 + 業務欄 + status)

**Decision**: 新 migration `m20260529_0000XX_alter_sys_role_business_audit`(序號接 017 之後),alter sys_role 加欄(鏡像 014 alter_sys_user,**但無 BIGSERIAL retrofit**):
- 業務欄:`role_desc`(string null)、`status`(small_integer null)。
- §I.6 審計欄 5 個:`created_at`(timestamptz NOT NULL default `current_timestamp`)、`created_by`(bigint null)、`updated_at`(timestamptz null,**無 DB default**)、`updated_by`(bigint null)、`deleted_by`(bigint null)。`deleted_at` 006 已有。
- 回填:`UPDATE sys_role SET status=1 WHERE id <= 3`(或 `code IN ('R_SUPER','R_ADMIN','R_USER_COMMON')`)。down 對稱 drop_column。
- entity `entity/src/sys_role.rs` 同步加 5+2 欄(對齊 `sys_user::Model` 型);新增 `impl AuditSerialize for sys_role::Model`(目前只 sys_user 有)。

**Rationale**: sys_role 現僅 `id/code/name/deleted_at`(`entity/src/sys_role.rs:5-11`、migration 006);**id 已 `.auto_increment()`(BIGSERIAL,migration 006:24)→ 不需 014 的 (b) sequence retrofit(R2 risk 不存在,異於 017 sys_user)**。`updated_at` 無 DB default(對齊 014)因 D5 用 col_expr 寫(見 R4)。

---

## R3 sys_role facade 寫端(mirror sys_user)

**Decision**: `facade/sys_role.rs` 新增(現全唯讀:`find_active`/`list_active_paginated`/`list_active_all` + `RoleListFilter`):
- `find_active_by_id(db, id) -> Result<Option<Model>, DbErr>`(現無、update/soft_delete 需先 by-id 查 active;鏡像 `sys_user.rs:67`)。
- `find_active_enabled() -> Select<Entity>`(R1;`find_active().filter(Column::Status.eq(1))`)。
- `create_role(db, CreateRoleData{code,name,role_desc,status}, operator) -> Result<i64, CreateRoleError>`:唯一性前檢 code(`find_active().filter(Code.eq).one`,對齊 partial unique `sys_role_code_active_uniq`)→ DuplicateCode;`mutate_in_txn` 內 ActiveModel{id:NotSet, created_at:NotSet(DB default), created_by:Set(operator), updated_at/updated_by/deleted_by:NotSet}→ insert RETURNING → audit Insert。`enum CreateRoleError{DuplicateCode, Db(DbErr)}` + `impl From<DbErr>`。
- `update_role(db, id, UpdateRoleData{name,role_desc,status}, operator) -> Result<bool, DbErr>`:`mutate_in_txn` → `find_active().filter(Id.eq).one` → None=Ok(false) / Some→ Set 業務欄(**不動 code**,D2)+ **D5 col_expr 改法(見 R4)** → 重查 → audit Update。
- `soft_delete(db, id, operator) -> Result<bool, DbErr>`:鏡像 `sys_user.rs:121-148` —— `soft_delete_query` = `update_many().col_expr(DeletedAt, current_timestamp).col_expr(DeletedBy, operator).filter(Id.eq)`(已 DB-side)→ `mutate_in_txn` None=Ok(false) / Some→ audit SoftDelete。

**Rationale/事實**: `mutate_in_txn`(`audit.rs:76-88`)closure 回 `(txn, R, Option<AuditEvent>)`;facade 是 entity 唯一管道(handler 零 `entity::` token,守 009 lint);operator 由 015 ctx 帶入、ip=None(避 sys_operation_log INET 路徑)。**Alternatives**: trait 預設 soft_delete(否:rev2 各 facade 自寫 soft_delete,`soft_delete.rs` 只提供讀的 find_active)。

---

## R4 D5 審計時間源全 DB-side(017 + 018,col_expr + 重查)

**Decision**:
- **update_*(017 update_user + 018 update_role)**:放棄現行 `active.updated_at = Set(SystemTime::now())`(app-side、`sys_user.rs:314-316` 確認不一致)→ 改 `update_many().col_expr(UpdatedAt, Expr::current_timestamp()).col_expr(UpdatedBy, operator).filter(Id.eq)`(兩欄同一 UPDATE 保 §I.6 成對、DB-side)+ **UPDATE 後 `find_active().filter(Id.eq).one(&txn)` 重查讀回 Model**(供 audit payload_after + wire response 反映真值,因 update_many 無 RETURNING)。
- **soft_delete**:017/018 現用/將用 `col_expr(DeletedAt, current_timestamp)` 已 DB-side(`sys_user.rs:109-114` 確認);audit payload 視粒度決定是否重查讀回 deleted_at 真值(現 017 只記 before)。
- created_at:DB default + insert RETURNING(已 DB-side,不動)。

**Rationale**: 現況 `create_at`=DB default(DB-side)、`soft_delete deleted_at`=col_expr(DB-side)、但 `update_user updated_at`=Rust `SystemTime::now()`(app-side)→ 三源不一致(brainstorm D5 / spec FR-007 要校正)。改 col_expr 統一 DB-side now()。**Cost**: update 失去 RETURNING、多一次同-txn SELECT(廉價)。**回歸驗 017 US1-3 + 守恆(SC-011)**。在 DESIGN §11.14 旁記「審計時間源 = DB now()」convention(brainstorm 已預告、本 feature 不開 amendment)。**Alternatives**: DB trigger(否:破 §I.6 explicit 成對可見性 + 難審);全 app-side(否:created_at 已 DB default、改回 app 更亂)。

---

## R5 handler + casbin seed + migration + router(mirror 017,新增種子保護)

**Decision**(`handler/system_manage.rs` 直接 mirror add_user/update_user/delete_user/batch_delete_users 骨架):
- 4 handler `add_role`/`update_role`(POST)+ `delete_role`/`batch_delete_roles`(DELETE):三 extractor(`State`/`Extension<RequestContext>`/`Json<Req>`)→ operator `ctx.operator_id`(None→`Res::err(Internal)` 5000)→ id parse(失敗 2222「无效的角色 id」)→ facade match(Ok(true)→ok / Ok(false)→2222「角色不存在」/ Err→5000+log)。`RoleCreateReq{roleName,roleCode,roleDesc?,status?}`、`RoleUpdateReq{id:String, roleName, roleDesc?, status?}`(**省 roleCode**,D2 immutable)、`DeleteReq{id:String}`、`BatchDeleteReq{ids:Vec<String>}`(camelCase serde)。status enum 用既有 `enum_str_to_i16`(1/2,非法→2222「状态取值无效」)。DuplicateCode→2222「角色代码已存在」。
- **種子保護(017 沒有的新需求,analyze I1 親決 code-based)**:純函式 `fn is_seed_role_code(code:&str)->bool { matches!(code,"R_SUPER"|"R_ADMIN"|"R_USER_COMMON") }`(以 roleCode 識別,貼 spec「code 為穩定鍵」;handler 經 `find_active_by_id` 解析 id→`row.code` 再判;單元測試覆蓋)。`delete_role`/`batch_delete_roles`:刪前 guard 解析 code 含種子 → 2222「不可删除系统内置角色」**整批拒**(批次先全載入 code 檢查;鏡像 017 D7 atomic)。`update_role`:若 `status` 解析為停用(2)且 `is_seed_role_code(&row.code)` → 2222「不可停用系统内置角色」(放行改 name/role_desc)。
- **016 `role_item` 改吃真值(R10-equiv)**:alter 後 sys_role 有 status/role_desc/audit → `role_item`(`system_manage.rs:117-146`)改吃真實欄(status i16→wire str、role_desc、create/update time rfc3339、*_by i64→str;缺值仍 null),不再恆 None。`getRoleList`/`getAllRoles` DTO 同步。
- migration:`alter_sys_role_business_audit`(R2)+ `seed_write_role_policy`(鏡像 015:raw SQL INSERT casbin_rule 4 行 `p,R_SUPER,/systemManage/{addRole,updateRole}=POST · {deleteRole,batchDeleteRole}=DELETE`,ON CONFLICT DO NOTHING;down `DELETE WHERE ptype='p' AND v1 IN (4 paths)` 精準不踩 009/013/015)。**lib.rs** 兩處(mod + migrations() vec)按序 append(alter 在 seed 之前)。
- router(`main.rs:126-165`):4 條 `.route("/systemManage/addRole", post(add_role).route_layer(enforce_mw))` 等(delete 用 `delete(...)`);ctx_mw 最外層已注入 RequestContext。

**Rationale/事實**: BizCode `BizError`=2222、`Internal`=5000(`envelope.rs`);`would_delete_self`(017)是 user 場景、role 改種子保護;enforce_mw seed 後 Super-only(非 Super 寫→403 5003)。

---

## R6 base-web 三端 mirror(server-first,接線無 form/typing 改)

**Decision**:
- `service/api/rev2-system-manage.ts` 加 4 fn(放同檔、`index.ts` 已 `export *` 無需改):`type RoleWriteModel = Pick<Api.SystemManage.Role,'roleName'|'roleCode'|'roleDesc'|'status'>`;`fetchAddRole(data)`→POST `/systemManage/addRole`、`fetchUpdateRole(data & {id})`→POST `/systemManage/updateRole`、`fetchDeleteRole(id)`→DELETE `{id}`、`fetchBatchDeleteRole(ids: string[])`→DELETE `{ids}`(全 `request<null>`,payload 走 `data`)。
- 接 3 placeholder:`views/manage/role/index.vue:117-129` handleDelete/handleBatchDelete(+ `:5` import 加 fetchDeleteRole/fetchBatchDeleteRole)、`role/modules/role-operate-drawer.vue:84-90` handleSubmit(add/edit 靠 `props.operateType`;+ import fetchAddRole/fetchUpdateRole),僅改 `// request` 行、`!error` 才成功動作。

**Rationale/事實**: `Role = CommonRecord<{roleName,roleCode,roleDesc}>`(`system-manage.d.ts:11`),CommonRecord.id=**number**、status=`EnableStatus('1'|'2')|null`(`common.d.ts`)。**id string↔number type-lie 已 constitution §I.3 v1.2.1「決定不修」**:mirror 簽名照 user 用 `Role['id']`/`string[]`(runtime 為 string)、server `DeleteReq.id:String` parse i64。**順序鐵律:server-first**(rust-api role 寫端含 schema retrofit 先做、再 mirror base-web),否則 base-web 打 `/addRole` 但 server 無路由 → 404 / wire 三端不對齊(同 017 server-first)。

---

## 待 plan/tasks 落實的明示項

- **C-V acceptance**(contracts/verification-commands.md):US1-3 + 種子保護(刪/停用拒 2222)+ roleCode immutable + **status enforce 即時**(停用角色→新請求 enforce 拒、不可指派、選單消失)+ **013 enforce 回歸**(allow/deny + B 改後)+ 014 menu + 016 list + **017 回歸(US1-3 + 時間源校正)** + migration up→down→up + 真 CDP(front-nginx :21080)+ **prod image build**(無新 crate 故非 §3 強制,但沿 016/017 de-risk 列入)。
- 單元測試:`is_seed_role_code` 純函式(三碼 true/其他 false)、enum 解析、`find_active_enabled` SQL 含 `status` filter、facade SQL-build。wiring 類由 C-V 覆蓋。
