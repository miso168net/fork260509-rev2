# Phase 1 Data Model: 受管 RBAC Policy 治理層

> 對齊 [research.md](./research.md) 實碼 grounding。所有命名以實碼為準(見 research R2 校正)。

## 1. 資料表

### 1.1 `casbin_rule`(既有,m031 ALTER 加治理欄)

既有 8 欄(adapter 標準、m005 委派 `sea_orm_adapter::up`):`id`(BIGSERIAL PK)/ `ptype`(varchar18)/ `v0..v5`(各 varchar125 NOT NULL)+ 7-col UNIQUE `unique_key_sea_orm_adapter (ptype,v0..v5)`。

**m031 ADD COLUMN(adapter-隱形)**:

| 欄 | 型 | 約束 | 說明 |
|---|---|---|---|
| `protected` | boolean | NOT NULL default false | data-driven 受保護(seed 固定、執行期不可改) |
| `created_at` | timestamptz | NOT NULL default now() | grant 建立時間 |
| `created_by` | bigint | NULL | 授予者 user_id(seed/系統=NULL;既有 69 列 ALTER 後自動 NULL、不回填) |

> stock adapter `insert_many` 不填這 3 欄 → 吃 default(NOT NULL+default 故合法);`load_policy` 不 SELECT 這 3 欄(column-explicit entity)。

### 1.2 `sys_casbin_policy_archive`(新,m032 CREATE)

restore 緩衝(只裝「已撤未還原」列;還原即實體刪除)。§I.6 append-only 變體。

| 欄 | 型 | 約束 | 說明 |
|---|---|---|---|
| `id` | bigint | BIGSERIAL PK | |
| `ptype` | varchar(18) | NOT NULL | 撤銷列快照(永遠 'p') |
| `v0` | varchar(125) | NOT NULL | role_code |
| `v1` | varchar(125) | NOT NULL | obj(route_name/code/path) |
| `v2` | varchar(125) | NOT NULL | 維度標(menu/button/HTTP method) |
| `v3`/`v4`/`v5` | varchar(125) | NOT NULL default '' | 對齊 adapter 空欄 |
| `created_at` | timestamptz | NULL | 原 grant 建立時間(出處) |
| `created_by` | bigint | NULL | 原授予者 |
| `archived_at` | timestamptz | NOT NULL default now() | 撤銷時間(= deleted_at 對應) |
| `archived_by` | bigint | NULL | 撤銷操作者 user_id |
| `archive_reason` | varchar(32) | NOT NULL | `manual_revoke` / `role_set_replace` / `menu_soft_delete`(varchar + 應用層約束) |

> **不帶** `updated_*`(append-only 變體、還原=實體消費)。logical-only、無 FK(沿 sys_token 慣例)。index:`archived_at`(回收桶列表排序)+ 可選 `(v0,v2)`(維度/角色篩選);非 unique(同 policy 可多次撤銷各留一列)。

### 1.3 `sys_menu`(既有,m034 ALTER 加 `protected`)

既有 28 欄(無 protected)。**m034 ADD COLUMN** `protected boolean NOT NULL default false` + seed `UPDATE ... SET protected=true WHERE route_name IN (...)`(見 §4)。entity 加 `pub protected: bool`;facade `audit_json` 補入 protected 欄(否則 menu CRUD audit payload 漏新欄)。

## 2. rust-api Entity(`entity` crate,各加進 entity/src/lib.rs)

### 2.1 `entity::sys_casbin_rule`(新、治理感知)

`DeriveEntityModel`,`table_name = "casbin_rule"`,欄:`id:i64`(pk)/ `ptype:String` / `v0..v5:String` / `protected:bool` / `created_at:DateTimeWithTimeZone` / `created_by:Option<i64>`。Relation 空。

> 與 adapter 私有 `sea-orm-adapter::entity`(只 id+ptype+v0..v5)**不同 entity、不共用** —— 兩條讀路徑(adapter stock load v0..v5 / 治理 facade 讀治理欄)。

### 2.2 `entity::sys_casbin_policy_archive`(新)

`DeriveEntityModel`,欄對齊 §1.2 全 11 欄。Relation 空。

## 3. Facade(`model/facade/`,守 009 lint route b)

### 3.1 `facade/sys_casbin_rule.rs`

```rust
// 全收 &DatabaseTransaction、與 mutate_in_txn 組合;旁路 adapter auto_save
pub async fn grant(txn, role_code, obj, act, protected, op) -> Result<(), DbErr>      // INSERT live 列
pub async fn revoke(txn, role_code, obj, act, op, reason) -> Result<RevokeOutcome, DbErr>
//   ↑ DELETE casbin_rule 該列 + INSERT archive 快照;若該列 protected → 回 Rejected(handler 映 2222)
pub async fn restore(txn, archive_id, op) -> Result<RestoreOutcome, DbErr>
//   ↑ archive→casbin_rule;撞 7-col unique(live 已存在)→ NoOp(只刪 archive 列)
pub async fn list_archived(db) -> Result<Vec<ArchivedRow>, DbErr>   // 回收桶(排除 reason='menu_soft_delete')
// HARD-REPLACE(收斂 021/022/023)— per-dimension 參數化
pub async fn set_role_dimension(txn, role_code, dim: Dimension, desired, op) -> Result<Before, SetError>
```

`Dimension`:`Menu`(item route_name:String,v2 const "menu")/ `Button`(item code:String,v2 const "button")/ `Endpoint`(item (path,method):(String,String),v2=method、per-method remove)。`set_role_dimension` diff current-live vs desired → 新增 grant / 移除 revoke;移除含 protected → 整筆 `SetError::ProtectedRemoval`(handler 映 2222)。

**讀回(收斂後維持 3 種排序、wire 契約)**:menu 不排序(by sys_menu)/ button BTreeSet 字典序 / endpoint (path,method) sort。

**錯誤型**:`PolicyWriteError { Casbin(casbin::Error), Db(DbErr), ProtectedRemoval(..) }`(收斂 3 個 byte-identical enum;handler match 臂 system_manage.rs:806/984/1118 同改)。

### 3.2 reload + publish(薄 service,facade 外、commit 後)

```rust
{ let mut g = state.enforcer.write().await; g.load_policy().await?; }   // 本機重載
let mut c = state.redis.clone(); let _ = publish_policy_invalidate(&mut c).await;  // best-effort 他副本
```

### 3.3 menu facade txn-aware 重構(US4)

`sys_menu.rs::soft_delete`/`restore`(現收 `&DatabaseConnection`、自開 txn)→ 抽 in-txn core 收 `&DatabaseTransaction`,讓 menu 軟刪/還原與 policy revoke/restore 同 `mutate_in_txn`。batch_delete_menus 逐 menu both-or-neither。

## 4. protected seed 集(m033 casbin / m034 sys_menu)

### 4.1 `casbin_rule.protected=true`(m033、policy 自鎖)

- menu-visibility:`(R_SUPER, manage_menu, menu)` / `(R_SUPER, manage_role, menu)` / `(R_SUPER, manage_system-settings, menu)` ← **修 D13**(後二者今天 menu_set_locks_out_super 未 pin)。
- R_SUPER 治理 endpoint 列:021/022/023/025/029 種的 R_SUPER-only 治理 verb(getRoleMenu/updateRoleMenu/getAllButtons/getRoleButton/updateRoleButton/getAllEndpoints/getRoleEndpoints/updateRoleEndpoints/getDeletedMenus/restoreMenu/getSystemSettings/updateSystemSetting/updateUserSessionPolicy + **US5 getArchivedPolicies/restorePolicy**)。

### 4.2 `sys_menu.protected=true`(m034、結構列)

`home`/`manage`/`manage_user`/`manage_role`/`manage_menu`/`manage_user-detail`(= is_seed_menu 6)+ `manage_system-settings`(治理頁)+ **US5 `manage_policy-archive`**(回收桶頁自身、治理頁應不可刪)。

## 5. 狀態轉移

### 5.1 policy 生命週期

```
(不存在) ──grant──▶ [live in casbin_rule] ──revoke──▶ [in archive] ──restore──▶ [live]
                          │                                  │
                    protected=true                     reason∈{manual_revoke,
                    ⇒ revoke 被拒                        role_set_replace,menu_soft_delete}
                                                              │
                                              restore 撞 live 同列 ⇒ NoOp(只刪 archive 列)
```

### 5.2 menu↔policy 連動(同 txn)

```
menu 軟刪 ──┐ 同 mutate_in_txn
            ├─ sys_menu.deleted_at=now
            ├─ 該 route_name 跨所有 role 的 (role,route_name,menu) policy revoke(reason=menu_soft_delete)→ archive
            └─ audit(sys_menu SoftDelete + casbin_rule SoftDelete)
menu 還原 ──┐ 同 txn(route_name active-only unique 守衛擋名被佔)
            ├─ sys_menu.deleted_at=NULL
            ├─ 還原該 route_name 的 archived menu-policy(reason=menu_soft_delete 那批)
            └─ audit(Restore ×2)
```

> reason=`menu_soft_delete` 的 archive 列**排除於 policy 回收桶**(`list_archived` 過濾),只由還原選單帶回(spec Clarification Q2)。

## 6. wire DTO(US5 新增;3 modal 既有不變)

```
ArchivedPolicy { id:String, dimension:String, roleCode:String, target:String,
                 reason:String, archivedAt:String, archivedBy:Option<i64> }   // Api.SystemManage 新增
RestorePolicyReq { archiveId:i64 }                                            // POST body
Api.SystemManage.Menu += { protected:boolean }                                // D10、3 端對齊
```

既有 3 modal wire(逐位元組不變、R8 證):getRoleMenu`Res<Vec<i64>>`/updateRoleMenu`{roleId,menuIds}`→`Res<()>`;getAllButtons`Res<Vec<ButtonItem{code,desc}>>`/getRoleButton`Res<Vec<String>>`/updateRoleButton`{roleId,codes}`;getAllEndpoints·getRoleEndpoints`Res<Vec<Endpoint{method,path}>>`/updateRoleEndpoints`{roleId,endpoints}`。
