# Phase 0 Research: 受管 RBAC Policy 治理層

> 方法:2026-06-09 對**實際 code** 平行 grep grounding(6 cluster:policy-write-paths / menu-crud-guards / audit-txn-enforce / wire-3end / baseweb-manage-pattern / migration-adapter-schema)。所有 file:line 為當下實碼;brainstorm/survey 的 file:line 會 rot,本檔以實碼為準。**每條 Decision 標 Rationale + Alternatives**。

---

## R1 — 架構 B(archive、免 fork)合法性 + 原子性釐清 ★

**Decision**:治理寫側走 **DB-first**:facade 用 sea-orm **直寫 `casbin_rule`(經新建的 rust-api 側治理 entity)+ archive + 011 audit,全在同一 `mutate_in_txn`**;commit 後再取 enforcer 寫鎖 `load_policy()` reload + best-effort publish。**不 fork adapter、不觸 §11.6**。

**Rationale(grep 實證)**:
- stock adapter 嚴格 column-scoped:`entity::Model` 只 `id+ptype+v0..v5`(sea-orm-adapter/src/entity.rs:7-17);`load_policy = Entity::find().all()` 只 SELECT 那 8 欄(action.rs:98-103);`create_active_model` 只 Set 那 8 欄(action.rs:166-177)。→ 加治理欄到 casbin_rule **對 adapter 完全隱形、不需 fork**。
- **原子性關鍵釐清**:今天 021/022/023 走 `enforcer.add_policies/remove_filtered_policy`(adapter auto_save 用 pool-handle),**casbin 變更不是 sea-orm txn 參與者** → 與 011 audit 是兩條獨立寫入(menu_auth.rs:149-153 明文「policy 變更已生效且不會被 rollback…與 mutate_in_txn pattern 不同」)= **D2 債實證存在**。**034 的修法**:把寫側從 `enforcer.MgmtApi` 改成 **facade sea-orm 直寫 `casbin_rule` 這張普通表**,它**就是** sea-orm txn 參與者 → 與 audit 同 `mutate_in_txn` 即 both-or-neither **原子**。enforcer 只在 commit 後 `load_policy()` 重載成投影。

**Alternatives rejected**:
- A(fork adapter `load_policy` 濾 `deleted_at`):觸 §11.6 amendment + 永久維護 fork + 「忘濾鏡」隱患。archive 路線免之。
- 沿用 enforcer.MgmtApi + 獨立 audit txn(現狀):非原子(D2)、正是要修的。

**對 implementer 的關鍵分辨(grep risk)**:**兩條讀路徑、兩個 entity** —— enforcer reload 仍走 adapter stock `load_policy()` 只讀 `v0..v5`;治理 facade 用**新建** rust-api 側 entity 讀治理欄。**不可**想用一個 entity 同時餵 adapter 與治理 facade(adapter entity 是 `pub(crate)` column-explicit、欄不同)。

---

## R2 — 命名校正(brainstorm/survey rot → 實碼)

| brainstorm/survey 用 | 實碼(act 須用) | evidence |
|---|---|---|
| `set_role_endpoints`(複數) | **`set_role_endpoint`**(單數) | endpoint_auth.rs:223 |
| `reload_policy()` | **`load_policy()`**(codebase 無 reload_policy) | policy_watcher.rs:78 `guard.load_policy()` |
| 新檔 `rev2-*.ts`(per-feature) | 加進**單一** `service/api/rev2-system-manage.ts` | service/api/ 只有此一 rev2-* |
| 新 `rev2-extra.d.ts` | 型加進 `typings/api/system-manage.d.ts` 的 `Api.SystemManage` namespace(029 SystemSetting 先例) | rev2-extra* 不存在 |
| migration `m000031.rs` | **`m20260529_000031_<name>.rs`**(timestamp 前綴) | lib.rs:38-70 全 m20260529_ |
| route 註冊在 route.rs | 註冊在 **main.rs:333-431**(route.rs 無這些) | main.rs |
| menu_auth.rs:63 | menu_set_locks_out_super 在 :62-64 | menu_auth.rs:62 |

讀回 fn 名(實碼):`get_role_menu_route_names` / `get_role_button_codes` / `get_role_endpoints`(皆同步 `pub fn`)。publish helper:`publish_policy_invalidate(&mut redis::aio::ConnectionManager)`、channel `"casbin:policy:invalidate"`、payload 固定 `1`(policy_watcher.rs:103-112)。

---

## R3 — 統一治理 facade + 寫/reload/publish 流程(US1)

**Decision**:新建 `model/facade/sys_casbin_rule.rs` + `sys_casbin_policy_archive.rs`(唯一構造對應 `entity::ActiveModel` 之處、守 009 lint route b);薄 service 統籌:

```
mutate_in_txn(db, |txn| async {
    // facade sea-orm 直寫(旁路 adapter auto_save):
    //   grant   → casbin_rule INSERT
    //   revoke  → casbin_rule DELETE + archive INSERT(快照 + archived_at/by + reason)
    //   restore → archive DELETE + casbin_rule INSERT(撞 7-col unique → no-op)
    Ok((txn, result, Some(AuditEvent{ entity_table:"casbin_rule", entity_id:None,
        payload_before/after = policy 快照 json, operation, operator, .. })))
}).await?;                                  // ← commit:policy 變更 + audit both-or-neither(原子)
{ let mut g = state.enforcer.write().await; g.load_policy().await?; }   // 重載成投影(commit 後)
let mut c = state.redis.clone(); let _ = publish_policy_invalidate(&mut c).await;  // best-effort 他副本
```

**Rationale**:`mutate_in_txn<R,F,Fut>`(audit.rs:76-88)閉包 by-value 收 txn、回 `(txn, R, Option<AuditEvent>)`,audit 在同 txn 寫(facade::sys_operation_log::write_in_txn)。本機 commit 後**直接** `load_policy()`(不靠自己 publish 繞 watcher 一圈,避 MEMORY「live-tests-pollute-watcher」自觸發競態);publish 只給他副本。

**Open→Resolved**:
- **enforcer 寫鎖 vs DB I/O**:沿既有範式,寫鎖只在 `load_policy()` 期間持有(reload 從 adapter 重讀 DB),不在 sea-orm txn 期間持鎖。
- **commit→reload 窗**:~ms in-memory 舊態(revoke 晚 ~ms 生效、fail-safe)→ 已知假設(spec edge case)。

---

## R4 — AuditOperation 復用既有 4 variant(不改 011 共享 enum)

**Decision**:`AuditOperation` 只有 `Insert/Update/SoftDelete/Restore`(audit.rs:14-31、**無** Grant/Revoke)。034 **復用**、不新增 variant:

| 治理動作 | AuditOperation | entity_table | entity_id | payload |
|---|---|---|---|---|
| grant(單條授予) | `Insert` | `"casbin_rule"` | `None` | after = policy 三元組 |
| revoke(軟刪/整批拿掉) | `SoftDelete` | `"casbin_rule"` | `None` | before = 被撤列 + reason |
| restore | `Restore` | `"casbin_rule"` | `None` | after = 還原列 |
| `set_role_dimension`(HARD-REPLACE) | `Update` | `"casbin_rule"` | `None` | before/after = role+該維集快照(沿 menu_auth.rs:156 先例) |

**Rationale**:新增 Grant/Revoke variant 會改 011 共享 `audit.rs` enum、blast radius 觸全 audit 消費者;復用語意吻合(revoke=軟刪、restore=還原)。`entity_id:None`(casbin policy 無語意 i64 PK,沿 menu_auth 先例)。`operator_ip` 一律 `None`(INET 42804 gotcha 未解、全路徑寫 None,sys_operation_log.rs:24-26)。

**Alternatives rejected**:新增 Grant/Revoke variant — 改共享基建、不值。

---

## R5 — protected:兩個機制、覆蓋邊界、4 個 is_seed_menu 改點

**Decision**:兩個**獨立** protected 機制(grep 釐清):

1. **`sys_menu.protected`(menu 結構列)** ← 退役 `is_seed_menu`。改 **4 個** caller(brainstorm 漏 batch):
   - update_menu 停用 guard(system_manage.rs:1207)/ re-parent guard(:1213)/ delete_menu(:1642)/ **batch_delete_menus pass-1(:1767)**。
   - seed:m034 標 is_seed_menu 的 **6** route_name(`home/manage/manage_user/manage_role/manage_menu/manage_user-detail`,逐字相符 :71)`protected=true`,**外加 `manage_system-settings`**(m029 seed 的治理頁列、應不可刪、一致性)。`function`/`function_toggle-auth`(demo)留非保護。
2. **`casbin_rule.protected`(policy 列)** ← 取代 self-lock 守衛 + 修 **D13**。`set_role_dimension`/`revoke` 遇 protected policy 即拒(2222):
   - 取代 `menu_set_locks_out_super`(只 pin `manage_menu`、menu_auth.rs:62-64)→ protected on `(R_SUPER,manage_menu,menu)`、**補 pin** `(R_SUPER,manage_role,menu)` + `(R_SUPER,manage_system-settings,menu)`(**修 D13** 漏 pin)。
   - 取代接口 root-mode 寫端守衛(`code=="R_SUPER"` bare literal、system_manage.rs:1097)→ protected on R_SUPER 治理 endpoint 列。
   - **保留** get_role_endpoints 的 R_SUPER **讀端短路回全 registry**(system_manage.rs:1041)—— 是讀端語意、非守衛,收斂後須保留(否則 getRoleEndpoints modal 預勾破)。

**Rationale**:protected 不能靠 wildcard(model exact-equality、enforce.rs:31-42)→ 必須**逐列 UPDATE**(m033 精確 `WHERE ptype,v0,v1,v2`)。menu 結構保護(sys_menu)與 policy 自鎖保護(casbin_rule)是兩維、不可混。protected = seed/部署固定、執行期不可改(spec Clarification Q1)→ 無 un-protect 路徑。

**Open→Resolved**:`manage_system-settings` 確為 sys_menu 列(m029 seed),故 sys_menu.protected 可覆蓋。

---

## R6 — US3 收斂三胞胎:per-dimension 參數化(非單一型)

**Decision**:收斂 `set_role_menu`/`set_role_button`/`set_role_endpoint` 為 `set_role_dimension(role, dim, desired, op)`,但**保留 per-dimension 插件**:

| 維度 | item 型 | v 對映 | remove 法 | 讀回排序 | 全集來源 |
|---|---|---|---|---|---|
| Menu | `&[String]`(route_name)| `[role,route_name,"menu"]` | 單次 `remove_filtered(0,[role,"","menu"])` | **不排序**(by sys_menu) | sys_menu |
| Button | `&[String]`(code)| `[role,code,"button"]` | 單次 `[role,"","button"]` | **BTreeSet 字典序** | getAllButtons 聚合 |
| Endpoint | `&[(String,String)]`(path,method)| `[role,path,method]` | **逐 method 迴圈** `for m in [GET,POST,DELETE]` | **(path,method) sort** | `ENDPOINT_REGISTRY`(33) |

**Rationale / 關鍵不變式(grep risk)**:
- **空-v2-wildcard footgun**:`remove_filtered_policy(0,[role,"",""])` 裸空 v2 會跨維刪光(endpoint_auth.rs:25-29 ⚠)→ 收斂骨架**必須**保留 endpoint 的 per-method remove、**不能**天真用 single remove 統一三維。
- 三維 **return 型不同**(menu=Vec<i64> wire / button=Vec<String>+Vec<ButtonItem> / endpoint=Vec<Endpoint>)→ `set_role_dimension` 須 per-dim 投影、非共用單型。讀回 **3 種排序是 wire 契約**(base-web 依賴),逐維保留。
- error enum:`SetRole{Menu,Button,Endpoint}Error` 三者 byte-identical `{Casbin(casbin::Error), Db(DbErr)}` → 收斂為單一 `PolicyWriteError`,須同改 3 個 handler match 臂(system_manage.rs:806/984/1118)。handler 全映射 5000。
- **endpoint item 型不對稱**(`&[(String,String)]` vs menu/button `&[String]`)+ wire DTO `{method,path}` 與 casbin row `[path,method]` **順序相反**(handler `.map(|e|(e.path,e.method))` system_manage.rs:1115)→ data-model 須明示避免對調(exact-equality 下對調 = 靜默 dead route)。

**防護**:既有 021/022/023 acceptance(curl + CDP)續綠 = wire 零改驗證;3 端型已證對齊(R8)。

---

## R7 — menu↔policy 同步(US4):txn-aware 重構 + batch 粒度

**Decision**:menu facade `soft_delete`/`restore`(sys_menu.rs:439/492)現收 `&DatabaseConnection` 且**自開 txn**(內含 `mutate_in_txn`)→ 無法外部組合。US4 須**抽出 in-txn core**(收 `&DatabaseTransaction` 的變體),讓 menu 軟刪/還原與 policy revoke/restore + audit **同一 txn**:
- menu 軟刪 → 同 txn:sys_menu soft_delete + 該 route_name 跨所有 role 的 menu-visibility policy `revoke`(reason=`menu_soft_delete`)→ archive + audit。
- menu 還原 → 同 txn:sys_menu restore + 還原該 route_name archived menu-policy。
- **batch_delete_menus**(逐筆 soft_delete)粒度:**逐 menu both-or-neither**(每筆 menu 軟刪 + 其 policy 同 txn;批次內逐筆獨立)。

**Rationale / grep 事實**:確認今天 menu CRUD **完全不碰 casbin**(soft_delete/restore body grep casbin/enforcer/policy = NONE)= DRIFT-2/3/4 實證。`AuditOperation::Restore` 已存在(零改)。route_name active-only unique index(m018:99-105 `sys_menu_route_name_active_uniq WHERE deleted_at IS NULL`)= menu 層守衛保護 policy 還原不撞名(D6 無 5000 競態)。menu 軟刪連帶的 policy archive 列 reason=`menu_soft_delete`,**排除於 policy 回收桶**(spec Clarification Q2),只由還原選單帶回。

**Open→Resolved**:menu CRUD facade audit `entity_table="sys_menu"`;連帶的 policy 變更 audit `entity_table="casbin_rule"`(兩筆 audit、語意清楚)。

---

## R8 — US5 端點 + base-web 慣例(校正 brainstorm §8.2)

**Decision**:
- **2 新端點**(R_SUPER only、main.rs 註冊 + `route_layer(enforce_mw)`、進 `Res<T>`):
  - `GET /systemManage/getArchivedPolicies` → `Res<Vec<ArchivedPolicy>>`(`ArchivedPolicy{id:String, dimension:String, roleCode:String, target:String, reason:String, archivedAt:String, archivedBy:Option<i64>}`;id 走 `i64.to_string()` 沿既有慣例)。
  - `POST /systemManage/restorePolicy` → `Res<()>`、body `{archiveId:i64}`。
  - **同步 4 處**(否則 build-time lint 掛):`ENDPOINT_REGISTRY`(+2)→ `endpoint_auth.rs:74`;`EXPECTED_ROUTE_COUNT` 33→**35**(`server/tests/endpoint_coverage_lint.rs:602` + in-module 單測 endpoint_auth.rs:498)；main.rs route；migration seed(R_SUPER policy + 本身標 protected)。
- **base-web(校正)**:
  - service:加 `fetchGetArchivedPolicies()` + `fetchRestorePolicy({archiveId})` 進**既有** `service/api/rev2-system-manage.ts`(**非**新建 rev2-*.ts)。
  - 型:`ArchivedPolicy` 加進 `typings/api/system-manage.d.ts` 的 `Api.SystemManage` namespace(**非** rev2-extra.d.ts)。
  - view:**單一 archive-list 頁** `views/manage/policy-archive/index.vue`(整頁就是回收桶、**無** live/deleted toggle —— archive 表無 live 對應側,menu 的 toggle 範式套不上);restore 鈕沿 menu/index.vue:166-182 NPopconfirm 範式。
  - i18n:`route.'manage_policy-archive'`(含 `-` 加引號、對照 `'manage_system-settings'`)+ `page.manage.policyArchive.*`(camelCase),en-us.ts + zh-cn.ts **兩檔**。
  - elegant-router:建 view 後自動重生 `router/elegant/{routes.ts,imports.ts}` + `typings/elegant-router.d.ts` 3 個 tracked 檔 → **收尾一起 commit**(orphan 風險、MEMORY components.d.ts 範式)。可見性走 §I.2 Casbin seed(seed `manage_policy-archive` sys_menu 列 + R_SUPER role-menu policy,且該 sys_menu 列標 protected)。
- **D10**:Api.SystemManage.Menu(system-manage.d.ts:123-145)現**無** `protected`/`isSeed` 欄、rust menu list handler 也未回 → US5 三端對齊:rust menu list handler 回 `protected` + 型加欄 + `menu-operate-modal.vue:26` 讀 `row.protected` 退役硬寫 `SEED_MENU_ROUTE_NAMES`(6 名單)。

**Rationale**:全為 grep 實證的既有慣例(單一 rev2-system-manage.ts、029 SystemSetting 放 system-manage.d.ts、menu 回收桶 precedent)。

---

## R9 — error code 校正(restore not-found)

**Decision**:restore archiveId 不存在用 **2222 + `err_msg("归档记录不存在")`**(沿既有 handler「X不存在」慣例:「角色不存在」「按钮不存在」皆 2222+自訂訊息),**不用 4040**。

**Rationale**:4040 `default_msg = "接口不存在"`(envelope.rs:140)語意是 route-not-found、非 resource-not-found;沿用會誤導前端。brainstorm §8.4 的 4040 在此校正。其餘碼不變:protected 不可移除 = 2222、restore 撞 live 同列 = 0000 no-op、route_name 競態 = 5000。**不新增 BizCode**(13-variant 矩陣凍結、envelope.rs:92-145)。

---

## R10 — migrations m031–m034(timestamp 命名、性質)

| 檔 | 性質 | 內容 |
|---|---|---|
| `m20260529_000031_alter_casbin_rule_governance.rs` | ALTER | casbin_rule += `protected bool NOT NULL default false` / `created_at timestamptz NOT NULL default now()` / `created_by bigint NULL`(既有 69 列 created_by 自動 NULL=seed 語意、**不需回填**)|
| `m20260529_000032_create_casbin_policy_archive.rs` | CREATE | archive 表(欄見 data-model);§I.6 append-only 變體 |
| `m20260529_000033_seed_protected_policy.rs` | seed(UPDATE)| `UPDATE casbin_rule SET protected=true WHERE` 精確 (ptype,v0,v1,v2);down 對稱 protected=false。**+ US5 兩新端點的 R_SUPER endpoint policy seed(若併此檔)** |
| `m20260529_000034_alter_sys_menu_protected.rs` | ALTER + seed | sys_menu += `protected bool NOT NULL default false` + `UPDATE ... SET protected=true WHERE route_name IN (6 + manage_system-settings)` |

每支:`mod` 宣告(lib.rs:3-32)+ append `Box::new(...)`(lib.rs:39-69)。seed 用 `execute_unprepared` raw SQL、ON CONFLICT/精確 WHERE(m009/m022 範式)。

---

## R11 — §I.6 / 009 lint / relations

- **§I.6**:`sys_casbin_policy_archive` = append-only 變體(帶 `archived_at`/`archived_by` = deleted_at/by 對應 + `created_at`/`created_by` grant 出處,**不帶** updated_*;還原=實體消費)→ 對照 `sys_operation_log`(m004)。Constitution Check #8 顯式註明。casbin_rule(adapter 標準表)/sys_menu 加的是治理欄、非新業務表。
- **009 lint**:是 `cargo test --test entity_access_lint`(**非** build.rs);新治理 entity 必在 rust-api `entity` crate、只在 `model/facade/` 內 import(facade 外用 `entity::` 會 panic)。**acceptance 須跑此 test**(brainstorm §10 未列、補為守恆項)。
- **relations**:新 entity 比照 sys_token 慣例 **logical-only、無 DB FK**(Relation 空 enum)。
- **archive_reason 型**:`varchar` + 應用層約束('manual_revoke'/'role_set_replace'/'menu_soft_delete'),沿 system_settings `value_type` 純字串慣例、無 DB enum/CHECK。

---

## 殘留 open items(plan 已決 / 留 tasks)

- 三維讀回排序逐維 acceptance 不變式 → tasks 每維列。
- batch_delete_menus 連動 policy 的逐筆原子粒度 → 已決(逐 menu both-or-neither);tasks 列 batch 路徑測。
- menu list `protected` 欄跨 US:schema/handler 回欄在 US2 後端、前端消費在 US5 → tasks 切分明示(避免 type lie)。
- 多副本 fan-out 真 2-instance 驗 → out-of-scope(D7、單實例自收驗)。
