---

description: "Task list — 034 受管 RBAC Policy 治理層"
---

# Tasks: 受管 RBAC Policy 治理層（Managed RBAC Policy Governance）

**Input**: `specs/034-managed-rbac-policy/`(plan.md / spec.md / research.md / data-model.md / contracts/)

**Tests**: 含測試任務(spec/plan §10 紀律:純函式 test-first、wiring 走 live-DB `#[ignore]` + acceptance)。

**Organization**: 依 spec User Story 優先序 P1→P5 分 phase;US 標籤對齊 spec.md(US1 原子 facade / US2 protected / US3 menu↔policy 同步 / US4 收斂三胞胎 / US5 回收桶 UI)。

> **命名鐵則(research R2 校正、act 前再 grep)**:`set_role_endpoint`(單數)/ `load_policy()`(非 reload_policy)/ migration `m20260529_000NN_*`(timestamp)/ 型放 `typings/api/system-manage.d.ts`(無 rev2-extra)/ service 加進單一 `rev2-system-manage.ts`。**寫側兩條讀路徑、兩個 entity**(adapter stock load v0..v5 / 治理 facade 讀治理欄)。
>
> **跑活體前**:`dcargo build` + `restart rust-api`(cargo-watch /mnt/d 不可靠);PUBLISH 測試污染 running watcher → 先 restart/re-sync(MEMORY)。**兩段式 commit**:動 rust-api/base-web worktree → worktree commit+push fork + 外層 bump SHA pin(§4.1)。

---

## Phase 1: Setup

- [ ] T001 確認 feature branch `034-managed-rbac-policy` + dev stack 已起(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`)、baseline 既有測試綠(`dcargo test`、`dcargo test --test entity_access_lint`、`dcargo test --test endpoint_coverage_lint`)作為 regression 基準
- [ ] T002 確認 migration baseline = m000030(`docker exec rev2-admin-postgres-1 psql -U soybean -d soybean_admin_rust -tAc "select version from seaql_migrations order by version desc limit 1;"`)、casbin live 集與 enforce 決策快照(供 §6 守恆對照)

---

## Phase 2: Foundational（阻塞所有 US — schema + entity + facade 骨架）

**⚠️ CRITICAL**: US1 之前必須完成

- [ ] T003 migration `rust-api/migration/src/m20260529_000031_alter_casbin_rule_governance.rs`:`ALTER TABLE casbin_rule ADD COLUMN protected boolean NOT NULL default false`、`created_at timestamptz NOT NULL default now()`、`created_by bigint NULL`;down 對稱 drop。lib.rs 註冊(mod + Box::new)。**不改 m005 / 不動 adapter**
- [ ] T004 migration `rust-api/migration/src/m20260529_000032_create_casbin_policy_archive.rs`:create `sys_casbin_policy_archive`(欄見 data-model §1.2:id/ptype/v0..v5/created_at/created_by/archived_at/archived_by/archive_reason〔varchar32〕)+ index(`archived_at`、`(v0,v2)`);§I.6 append-only 變體(無 updated_*);lib.rs 註冊
- [ ] T005 [P] entity `rust-api/entity/src/sys_casbin_rule.rs`:治理感知 `DeriveEntityModel`(table_name="casbin_rule";id/ptype/v0..v5/protected/created_at/created_by;Relation 空、logical-only);加進 `entity/src/lib.rs`
- [ ] T006 [P] entity `rust-api/entity/src/sys_casbin_policy_archive.rs`:`DeriveEntityModel`(11 欄對齊 T004);加進 `entity/src/lib.rs`
- [ ] T007 facade 骨架 `rust-api/server/src/model/facade/sys_casbin_rule.rs` + `sys_casbin_policy_archive.rs`(空殼 + 加進 `model/facade/mod.rs`;唯一構造對應 `entity::ActiveModel` 之處、守 009 lint route b)
- [ ] T008 套 m031/m032 + 驗 schema(`migrate` service + psql `\d casbin_rule` 見治理欄、`\d sys_casbin_policy_archive`);`dcargo build` 綠

**Checkpoint**: schema + entity + facade 骨架就緒,US1 可開工

---

## Phase 3: User Story 1 — 權限變更可追溯且可復原 (P1) 🎯 MVP

**Goal**: DB-first 原子 facade(grant/revoke=軟刪/restore)+ 011 audit 同 txn + commit 後 reload/publish。**消滅 D2 非原子**。

**Independent Test**: 對 dev DB 直呼 facade:grant→恰一筆 Insert audit;revoke→列入 archive + reload 後 enforce 拒;restore→回來 enforce 允;注入 audit 失敗→雙 rollback。

### Tests for US1 ⚠️(test-first)

- [ ] T009 [P] [US1] 純函式單測:dimension→`(ptype,v0,v1,v2)` 對映 + revoke 撞 live → NoOp 判定,in `rust-api/server/src/model/facade/sys_casbin_rule.rs`(`#[cfg(test)]`)
- [ ] T010 [P] [US1] live-DB `#[ignore]` 整合測:grant/revoke/restore round-trip + 原子(注入 audit 失敗雙 rollback)+ revoke 後 `load_policy()` enforce 拒,in `rust-api/server/tests/`(env-gate `DATABASE_URL`)

### Implementation for US1

- [ ] T011 [US1] facade `sys_casbin_rule::grant(txn, role, obj, act, protected, op)`(INSERT live 列)+ `revoke(txn, role, obj, act, op, reason) -> RevokeOutcome`(DELETE casbin_rule + INSERT archive 快照;protected 列回 Rejected)— 全收 `&DatabaseTransaction`、旁路 adapter auto_save
- [ ] T012 [US1] facade `restore(txn, archive_id, op) -> RestoreOutcome`(archive→casbin_rule;撞 7-col unique → NoOp 只刪 archive 列)
- [ ] T013 [US1] AuditEvent 構造(復用 `AuditOperation` 4 variant:grant=Insert/revoke=SoftDelete/restore=Restore;entity_table="casbin_rule"、entity_id=None、payload before/after = policy 快照、operator_ip=None)— 經既有 `facade::sys_operation_log::write_in_txn`、組進 `model::audit::mutate_in_txn`
- [ ] T014 [US1] 薄 governance service `rust-api/server/src/auth/policy_governance.rs`:`mutate_in_txn(...)` commit 後 `{ let mut g=state.enforcer.write().await; g.load_policy().await? }` + best-effort `publish_policy_invalidate(&mut state.redis.clone())`(集中今天 3× 複製的 reload/publish;**本機直接 load_policy、不靠自己 publish 繞 watcher**)
- [ ] T015 [US1] 跑 T009/T010 綠(`dcargo build` + restart + `dcargo test` + live-DB `#[ignore]`);psql 守恆:`casbin_rule live == enforcer policy 數`、`archive == 已撤未還原集`

**Checkpoint**: US1 facade 可獨立 live 驗(尚未接既有端點;那是 US4)

---

## Phase 4: User Story 2 — 關鍵治理權限不可誤刪 (P2)

**Goal**: data-driven `protected`(casbin_rule + sys_menu、seed 固定執行期不可改)→ 取代 §4 散落守衛、**修 D13**。

**Independent Test**: 撤 protected policy 被拒;整批替換省略 protected 整筆拒;delete/disable/re-parent/batch 一個 protected sys_menu 被拒;Super 對角色/選單/系統設定頁可見性恆在。

### Tests for US2 ⚠️

- [ ] T016 [P] [US2] 純函式單測:`set_role_dimension` diff 中「移除含 protected → 整筆拒」邏輯,in facade `#[cfg(test)]`
- [ ] T017 [P] [US2] live-DB `#[ignore]`:revoke protected policy→Rejected 列不動;m033/m034 後 psql 查 protected 集 = data-model §4 預期

### Implementation for US2

- [ ] T018 [US2] migration `m20260529_000033_seed_protected_policy.rs`:`UPDATE casbin_rule SET protected=true WHERE` 精確 (ptype,v0,v1,v2) — menu-visibility `(R_SUPER, manage_menu/manage_role/manage_system-settings, menu)`〔**修 D13**〕+ R_SUPER 治理 endpoint 列(data-model §4.1);down 對稱;lib.rs 註冊
- [ ] T019 [US2] migration `m20260529_000034_alter_sys_menu_protected.rs`:`ALTER TABLE sys_menu ADD COLUMN protected boolean NOT NULL default false` + seed `UPDATE ... SET protected=true WHERE route_name IN (is_seed_menu 6 + manage_system-settings)`;lib.rs 註冊
- [ ] T020 [P] [US2] entity `rust-api/entity/src/sys_menu.rs` 加 `pub protected: bool`;facade `sys_menu::audit_json` 補入 protected 欄(避免 menu CRUD audit payload 漏新欄)
- [ ] T021 [US2] facade `set_role_dimension` 與 `revoke` 加 protected 守衛:目標列 protected → 回 `PolicyWriteError::ProtectedRemoval`(handler 映 2222)
- [ ] T022 [US2] 退役 `is_seed_menu`:`rust-api/server/src/handler/system_manage.rs` **4 處** caller(update_menu 停用 ~:1207 / re-parent ~:1213 / delete_menu ~:1642 / batch_delete_menus ~:1767)改讀 `sys_menu.protected`(act 前 grep 校正行號)
- [ ] T023 [US2] 退役 `menu_set_locks_out_super`(menu_auth.rs ~:62)+ 接口 root-mode bare literal(system_manage.rs ~:1097)寫端守衛 → 改由 facade protected 守衛(T021)承載;**保留** get_role_endpoints R_SUPER 讀端短路回全 registry(~:1041)
- [ ] T024 [US2] 套 m033/m034 + 跑 T016/T017 綠;驗 4 個 menu guard + policy protected 拒;Super 治理頁可見性恆在

**Checkpoint**: US1 + US2 獨立可驗;protected 機制統一、D13 修

---

## Phase 5: User Story 3 — 選單刪除/還原與其可見性權限同步 (P3)

**Goal**: menu CRUD 與其 menu-visibility policy 同 txn 連動(修 DRIFT-2/3/4);同名重建零繼承。

**Independent Test**: 軟刪 menu→其 policy 進 archive(reason=menu_soft_delete)+ enforce 拒可見、無孤兒;還原 menu→policy 回來;軟刪後同名重建→零可見性。

### Tests for US3 ⚠️

- [ ] T025 [P] [US3] 純函式單測:「軟刪/還原該 route_name 要 archive/restore 哪些 (role,route_name,menu) 列」選取邏輯
- [ ] T026 [P] [US3] live-DB `#[ignore]`:menu 軟刪→policy archive + enforce 拒;還原→回來;**DRIFT-3** 軟刪 foo→建新 foo→新 foo 零可見性

### Implementation for US3

- [ ] T027 [US3] menu facade txn-aware 重構 `rust-api/server/src/model/facade/sys_menu.rs`:`soft_delete`/`restore`(現收 `&DatabaseConnection` 自開 txn)抽出收 `&DatabaseTransaction` 的 in-txn core,讓 menu 變動與 policy 同 `mutate_in_txn`(保既有 020/025 對外行為)
- [ ] T028 [US3] menu 軟刪連動:同 txn 內 `sys_casbin_rule::revoke` 該 route_name 跨所有 role 的 `(role,route_name,menu)` policy(reason=`menu_soft_delete`)→ archive + audit(entity_table=casbin_rule);commit 後 reload/publish(T014 service)
- [ ] T029 [US3] menu 還原連動:同 txn 還原該 route_name reason=menu_soft_delete 的 archived menu-policy(route_name active-only unique 守衛擋名被佔 → 無 5000);batch_delete_menus 逐 menu both-or-neither
- [ ] T030 [US3] 跑 T025/T026 綠;psql 驗無孤兒 (role,route_name,menu) live 列;getUserRoutes 同名重建後零可見

**Checkpoint**: US1-US3 獨立可驗;menu↔policy 漂移修

---

## Phase 6: User Story 4 — 三個權限編輯介面行為一致 (P4)

**Goal**: 收斂 `set_role_menu`/`set_role_button`/`set_role_endpoint`(單數)為 `set_role_dimension`、3 error enum 併 1;**wire 逐位元組不變**。

**Independent Test**: 既有 021/022/023 curl + CDP acceptance 全綠(三維 return 型/3 種排序/endpoint R_SUPER 短路+拒編 不變);三維變更產生一致 Update audit。

### Tests for US4 ⚠️

- [ ] T031 [P] [US4] 純函式單測:`set_role_dimension` 三維 diff(current-live vs desired→add/remove)+ 三維 v 對映 + endpoint per-method;沿 014 `MemoryAdapter` + production RBAC model
- [ ] T032 [P] [US4] regression:既有 021/022/023 的單測 + acceptance 視為不可破基準(T001 baseline)

### Implementation for US4

- [ ] T033 [US4] facade `set_role_dimension(txn, role, dim:Dimension, desired, op)`:per-dimension 插件(Menu route_name/v2'menu' 單次 remove;Button code/v2'button' 單次;Endpoint (path,method)/v2=method **per-method remove 迴圈**)+ diff→grant/revoke(經 T011/T021,protected 整筆拒);**保留空-v2-wildcard 禁忌**(per-method remove、不裸空 v2)
- [ ] T034 [US4] 收斂讀回:menu 不排序 / button BTreeSet 字典序 / endpoint (path,method) sort(三種既有 wire 排序逐維保留);收斂 3 error enum 為單一 `PolicyWriteError`
- [ ] T035 [US4] 改寫 `rust-api/server/src/auth/{menu_auth,button_auth,endpoint_auth}.rs` 的 set_role_* 為呼叫 facade `set_role_dimension`(走 DB-first + T014 reload/publish、棄 enforcer auto_save 寫路徑);改 3 個 handler match 臂(system_manage.rs ~:806/984/1118)對應 `PolicyWriteError`;**保留** endpoint R_SUPER 讀端短路 + 寫端拒編(現由 T021 protected 承載)
- [ ] T036 [US4] 跑 T031/T032 綠 + **既有 021/022/023 curl + CDP acceptance regression 全綠**(wire 零改證);三維各一筆 Update audit(entity_table=casbin_rule)

**Checkpoint**: US1-US4 獨立可驗;三胞胎收斂、既有 wire 不破

---

## Phase 7: User Story 5 — 已移除權限的回收桶 (P5)

**Goal**: 2 個 R_SUPER 治理端點 + base-web 回收桶頁 + D10(menu list protected)。

**Independent Test**: getArchivedPolicies 列已撤(排除 menu_soft_delete)、restorePolicy 救回;CDP:Super 見回收桶頁+還原、User 不可見;menu 頁種子選單 parentId 鎖定改讀 protected。

### Tests for US5 ⚠️

- [ ] T037 [P] [US5] curl acceptance:getArchivedPolicies(排除 menu_soft_delete、欄齊)/ restorePolicy(0000;不存在→2222「归档记录不存在」;撞 live→0000 no-op)/ 非 Super→5003
- [ ] T038 [P] [US5] CDP browser smoke(沿 022 harness `tests/034-managed-rbac-policy/`):Super 見「回收桶」頁→列→還原→權限回復;User 側欄無此頁、直打 5003;D10 menu 頁 parentId 鎖定讀 protected

### Implementation for US5（rust-api）

- [ ] T039 [US5] handler `getArchivedPolicies`(`Res<Vec<ArchivedPolicy>>`、`list_archived` 排除 reason=menu_soft_delete、id `.to_string()`、dimension 由 v2 推)+ `restorePolicy`(body `{archiveId}`、`Res<()>`、不存在→2222 自訂訊息)in `rust-api/server/src/handler/system_manage.rs`
- [ ] T040 [US5] main.rs 註冊 2 route(`GET/POST /systemManage/...` + `route_layer(enforce_mw)`)+ `ENDPOINT_REGISTRY`(endpoint_auth.rs)+2 + `EXPECTED_ROUTE_COUNT` 33→**35**(`server/tests/endpoint_coverage_lint.rs` + in-module 單測)+ m033 seed R_SUPER policy(2 端點)且本身標 protected
- [ ] T041 [US5] menu list handler 回 `protected` 欄(D10、3 端對齊起點);跑 `dcargo test --test endpoint_coverage_lint` 綠(三源一致)

### Implementation for US5（base-web、BASE-WEB-ADAPT/WRAPPER）

- [ ] T042 [P] [US5] 型:`typings/api/system-manage.d.ts` 的 `Api.SystemManage` 加 `ArchivedPolicy` + `Menu += { protected:boolean }`(沿 029 SystemSetting 範式、**非** rev2-extra.d.ts)
- [ ] T043 [P] [US5] service:`service/api/rev2-system-manage.ts` 加 `fetchGetArchivedPolicies()` + `fetchRestorePolicy({archiveId})`(加進**既有**檔)
- [ ] T044 [US5] view `base-web/src/views/manage/policy-archive/index.vue`:**單一 archive-list 頁**(無 toggle)+ 每列還原鈕(NPopconfirm 沿 menu/index.vue 範式)+ 維度/角色篩選;elegant-router 重生 `routes.ts/imports.ts/elegant-router.d.ts` 一起 commit
- [ ] T045 [US5] i18n:`route.'manage_policy-archive'`(含 `-` 加引號)+ `page.manage.policyArchive.*`(camelCase),`en-us.ts` + `zh-cn.ts` 兩檔
- [ ] T046 [US5] D10:`base-web/src/views/manage/menu/modules/menu-operate-modal.vue` 讀 `row.protected` 退役硬寫 `SEED_MENU_ROUTE_NAMES`(~:26)
- [ ] T047 [US5] 回收桶頁可見性 §I.2:m033/m034 seed `manage_policy-archive` sys_menu 列 + R_SUPER role-menu policy + 該 sys_menu 列標 protected;跑 T037/T038 綠

**Checkpoint**: 全 5 US 獨立可驗

---

## Phase 8: Polish & 守恆 & 收尾

- [ ] T048 [P] 守恆:`dcargo test --test entity_access_lint`(治理 entity 只在 facade)+ `dcargo test --test endpoint_coverage_lint`(35 三源一致)綠
- [ ] T049 [P] 讀決策零變:013/014 enforce acceptance(Super/Admin/User 選單可見 + endpoint allow/deny)逐項相同(純寫側證);casbin seed baseline reconcile
- [ ] T050 prod runtime image build sanity(`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`、無新 crate 但驗 Dockerfile COPY 不破)
- [ ] T051 跑 `quickstart.md` 全流程驗收;更新 REVIEW-DATABASE.md(新 casbin_rule 治理欄 + archive 表 + m031-m034)
- [ ] T052 回填 DESIGN §10 Phase 3 #6 + §11.6(註明 archive 路線**免 fork、無 backend amendment**、推翻原 defer 主因);CHECKLIST 勾 #6
- [ ] T053 **US5 MODAL-WIRING v1.7.0 amendment**(§V.2):於 DESIGN §11 提案「policy 還原維運 UI」use (f)、逐行列 constitution edit 給 user 過目、user 親決後才動 constitution.md
- [ ] T054 兩段式 commit(rust-api worktree push fork + base-web worktree push fork + 外層 bump SHA pin);`superpowers:finishing-a-development-branch` → merge --no-ff 回 rev2-admin-root(保留 034 branch)

---

## Dependencies & Execution Order

- **Phase 1 Setup** → **Phase 2 Foundational**(schema/entity/facade 骨架,阻塞全 US)→ **US1**(facade 地基)。
- **US2** 依 US1(facade reject 加在 set_role_dimension/revoke);**US3**(menu 同步)依 US1(revoke/restore)+ US2(protected 語意);**US4**(收斂)依 US1+US2;**US5**(UI/端點)依 US1(archive/restore)+ US2(sys_menu.protected for D10)+ US3(menu_soft_delete reason 排除)。
- 優先序 P1→P5 = US1→US2→US3→US4→US5;US3 與 US4 互不依賴(都依 US1+US2)、可平行。
- **Phase 8** 依所有目標 US 完成。

### Parallel Opportunities

- T005/T006(兩 entity)[P];T009/T010、T016/T017、T025/T026、T031/T032(各 US 測試)[P];T042/T043(base-web 型/service)[P];T048/T049(守恆)[P]。
- US3 與 US4 可由不同 implementer 平行(都建在 US1+US2 上)。

## Implementation Strategy

**MVP = US1**(原子 facade + audit + 可復原後端):Setup → Foundational → US1 → STOP 驗(live-DB 整合測:原子寫 + revoke→archive→restore + enforce 即時)。之後 US2→US3/US4→US5 逐刀增量、各自獨立驗、不破前序(既有 021/022/023 acceptance 為 US4 regression 鐵閘)。

## Notes

- [P] = 不同檔、無未完依賴;[US#] 對齊 spec.md(US1 原子 / US2 protected / US3 menu 同步 / US4 收斂 / US5 UI)。
- 每個 implementer subagent 走 TDD:純函式 test-first(red→green);wiring/形狀對映由 live-DB `#[ignore]` + acceptance 覆蓋,並在本檔/plan 明示「無單元測試」理由。
- 避免:set_role_endpoint**s**(複數)/ reload_policy(命名漂移)/ 裸空-v2 wildcard(跨維誤刪)/ wire 欄序對調(Endpoint {method,path} vs casbin [path,method])。
