# 018 manage-role-write — Phase 0 brainstorm (spec-design)

> rev2 Phase 4 主流業務 — **角色管理頁的寫端 CRUD**(新增/編輯/刪除/批次刪除角色),把 016 唯讀 role list 閉成完整 CRUD,並讓角色 `status`(啟用/停用)真正生效。
> **凍結設計來源**:本檔(D1–D5 user 親決,2026-06-02 brainstorm)。交棒 `/speckit-specify`(階段 1,**手動執行**)。
> 設計骨幹 = **鏡像 017-manage-user-write**;本檔只記 role-specific 的差異與決策,共用 pattern 不重述(見 [`docs/superpowers/017-manage-user-write.md`](017-manage-user-write.md) + [`specs/017-manage-user-write/`](../../specs/017-manage-user-write/))。

---

## 1. Scope / User Stories(鏡像 017,Super-only)

- **US1 addRole**(P1):新增角色(roleName / roleCode / roleDesc / status)。
- **US2 updateRole**(P2):編輯既有角色(roleName / roleDesc / status;**roleCode 不可改**)。
- **US3 deleteRole + batchDeleteRole**(P3):軟刪單筆/批次,可復原;**種子角色不可刪**。
- 寫端授權 = **最高權限(Super)**;一般 admin 可讀(016)不可寫;未認證一律拒。
- **前端沿用**既有 role 管理頁(僅接線既有控制項,MODAL-WIRING ★ 授權軌道),不新增/改畫面結構。

## 2. 親決(D1–D5)

### D1 — 刪除防護 = 擋種子角色(延伸到不可停用)
- **不可刪** `R_SUPER` / `R_ADMIN` / `R_USER_COMMON` 三個 seed 角色(刪了會 brick RBAC 骨幹 + casbin policy 指向落空)。
- 因 D3「停用=不授權」,**停用 seed 角色 == brick**,故種子保護**同時涵蓋不可停用**:updateRole 把 seed 角色 `status` 改停用 → 拒。
- 種子角色**只能改 roleName/roleDesc**;不可刪、不可停用。
- 其餘**自訂角色**:可軟刪(可復原)、可停用。
- 違反一律回業務錯誤 **2222**。對齊 017「最小防呆 + 可復原」精神(更廣的受保護角色留後續)。

### D2 — roleCode 編輯不可改(immutable,鏡像 017 userName)
- `roleCode` 是 casbin policy(`p,<roleCode>,path,method`)與角色指派(code→id 解析)的**穩定鍵**;改 code 會讓既有 policy/指派 silently 落空。
- `UpdateRoleReq` **省略 roleCode**,server 端強制 immutability;編輯只改 roleName/roleDesc/status。
- roleCode **唯一性僅於新增檢查**(sys_role 既有 `code` partial unique index `WHERE deleted_at IS NULL`);roleName **不檢唯一**(只 code 唯一)。

### D3 + D4 — status enforce 用「有效角色集」統一(順帶定刪除處理)
- **有效角色 ≝ `deleted_at IS NULL` AND `status = 啟用(1)`**。
- 所有「取用角色」處**只吃有效角色**:enforce(013)/ getUserInfo / menu 過濾(014)/ getAllRoles 指派下拉 / replace_roles 指派驗證 → **停用或軟刪角色自動「不授權、不可指派」**(一處 filter、處處生效)。
- `getRoleList`(管理列表)**仍顯示停用角色**(要能看到才能重新啟用);**不顯示軟刪角色**。
- **刪/停用角色不清** casbin policy 或 sys_user_role(effective-set filter 已涵蓋,policy/指派 row 留著無害、join 時被濾掉 — 沿 009/016 soft-delete 哲學)。= D4 刪除處理答案。
- 指派含**停用/軟刪角色** → 只採有效者、略過(延伸 017 US2-AS-2 對軟刪 role 的略過行為,新增涵蓋停用)。

### D5 — 審計時間源全 DB-side(018 + 順手修 017)
- 018 sys_role 審計時間全 **DB-side**:`created_at` = DB default(`current_timestamp`);`updated_at` / `deleted_at` 用 `Expr::current_timestamp()` **col_expr** 寫(與 `updated_by`/`deleted_by` 同一 UPDATE,**保 §I.6 成對**)+ **重查讀回**真值(供 audit_json + response),**非 trigger**。
- **順手修 017**:把 017 sys_user `update_user` / `soft_delete` 的 `updated_at`/`deleted_at` 從 Rust `now()` 改成 DB-side col_expr,讓整碼審計時間源一致。**回歸驗 017**。
- 在 [DESIGN §11.14](../INTEGRATION-DESIGN.md) 旁記下「審計時間源 = DB now()」convention(constitution §I.6 是否補述 source 由後續評估,本 feature 不開 amendment)。

### 衍生(不另議,鏡像 017)
- 業務錯誤一律 **2222**(roleCode 重複 / 刪或停用種子 / 不存在 / 非法 id·enum)。
- 對外 **id wire = string**(i64 邊界 `.to_string()`,寫端收 String parse i64)。
- enum `status` **i16 ↔ string**(`"1"`=啟用 / `"2"`=停用,對齊 017 EnableStatus)純對映 fn(handler 層)。
- batchDelete 含種子角色 → **整批拒、無部分執行**;空 ids → **no-op**(鏡像 017 D7)。
- facade 寫入皆走 011 `mutate_in_txn`(原子 + audit),operator 由 015 request-context ctx 帶入。
- **無新 crate/dep**(sea-orm `small_integer`/`Expr` + 011/015 既有)。

## 3. Schema(migration `alter_sys_role_business_audit` + entity)

- sys_role 現有:`id`(BIGSERIAL ✓ migration 006)/ `code` / `name` / `deleted_at`(009)。
- **補欄**:業務欄 `role_desc`(string null)、`status`(small_integer null);§I.6 審計欄 `created_at`(timestamptz NOT NULL default now())、`created_by`(bigint null)、`updated_at`(timestamptz null)、`updated_by`(bigint null)、`deleted_by`(bigint null)。
- seed `status = 1` 回填既有 3 role。
- **無 R2 BIGSERIAL retrofit**(sys_role id 自 migration 006 已是 BIGSERIAL,不同於 017 sys_user)。
- migration `up → down → up` 可逆,對 throwaway DB 親驗。

## 4. Facade / Handler

- **facade `sys_role`**:`create_role`(insert + audit `Insert`,`created_by`=operator;roleCode 重複→ `CreateRoleError::DuplicateCode`)/ `update_role`(load active→not-found `Ok(false)`;更 name/desc/status + `updated_at` col_expr + `updated_by` 成對 + audit `Update`;不動 code)/ `soft_delete`(operator;`deleted_at` col_expr + `deleted_by` 成對 + audit)。
- **handler `system_manage`**:`RoleCreateReq`/`RoleUpdateReq`(省 roleCode)/`DeleteReq`/`BatchDeleteReq`;`add_role`/`update_role`(POST)+`delete_role`/`batch_delete_roles`(DELETE body);種子保護檢查(code ∈ seed → 拒 2222);enum status 驗證;lint-safe DTO 映射(handler 零 `entity::` token、守 009)。
- migration `seed_write_policy`:**4 行逐條** `p,R_SUPER,/systemManage/{addRole,updateRole,deleteRole,batchDeleteRole},<method>`(無 wildcard、沿 009/016)。
- **016 `RoleItem` 改吃真值**:`role_desc`/`status`/`create_*`/`update_*` 不再恆 null,序列化真實欄(缺值仍 null)。

## 5. 跨 feature ripple(★ 本 feature 非純 018-local)

| 觸及 | 改動 | 回歸驗 |
|---|---|---|
| 013 enforce | `roles_for_user` 載入加 `status=啟用` filter | enforce allow/deny 不破 |
| 014 menu | `filter_routes_for_roles` 經 roles_for_user → 自動套有效角色 | menu 三階梯不破 |
| 015 ctx | operator 來源沿用(不改) | — |
| 016 list / getAllRoles / getUserInfo | `roles_for_users` 批次 + getAllRoles + getUserInfo 加 `status=啟用` filter;RoleItem 吃真值 | getUserList/getRoleList/getAllRoles 不破 |
| 017 sys_user | `update_user`/`soft_delete` 時間源改 DB col_expr | 017 US1-3 + 守恆不破 |

> 實作 phase 0 research 必 grep `roles_for_user(s)` 實際 SQL 確認 filter 注入點,並對齊 base-web typings(`Role` = `CommonRecord<{roleName,roleCode,roleDesc}>` + status)三端。

## 6. base-web 接線(MODAL-WIRING ★ + BASE-WEB-WRAPPER,純接線)

- 新增 `src/service/api/rev2-system-manage.ts` 內 4 fn:`fetchAddRole`/`fetchUpdateRole`(POST)、`fetchDeleteRole`/`fetchBatchDeleteRole`(DELETE body),`request<null>`,鏡像既有 user 寫端。
- 接 3 placeholder:`role-operate-drawer.vue` `handleSubmit` add/edit 分支 + `role/index.vue` `handleDelete`/`handleBatchDelete`,僅改 `// request` 一行、`!error` 才成功動作。
- 不改 form/typing 結構。

## 7. Acceptance

- US1-3 + 種子保護(刪/停用 seed 拒 2222)+ roleCode immutable(編輯不變)+ **status enforce**(停用角色:不可指派〔getAllRoles/replace_roles〕+ 不授權〔經 013 enforce / 014 menu 驗〕)+ 守恆(013/014/016/017 不破 + migration up→down→up 可逆)+ **真 CDP**(經 front-nginx :21080:登入→新增角色→編輯→停用→刪除→種子拒)+ **prod image build 綠**。
- server 單測(facade SQL-build / enum / 種子保護 / effective-set filter)+ entity_access_lint + xdb 全綠。
- 無單元測試的 wiring/形狀類由 `contracts/` C-V(CDP + curl + psql)覆蓋,於 tasks/plan 明示。

## 8. 範圍提醒 / 可瘦身選項

D3+D4(status enforce ripple)+ D5(017 時間源修正)讓 018 觸及 013/014/015/016/017,比 017 大。user 已親決**照此版全做**(2026-06-02)。若日後要瘦身,可把「status enforce ripple」或「017 時間源修正」抽成獨立 follow-up,但本 feature 預設含此兩者。
