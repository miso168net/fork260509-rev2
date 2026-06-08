# 034-managed-rbac-policy — spec-design（階段 0 brainstorm）

> 本檔為 feature 034-managed-rbac-policy 的 Phase 0 brainstorm spec-design（CLAUDE.md §3 階段 0）。
> 定案後由 **user 手動 `/speckit-specify`**（讓 `speckit.git.feature` pre-hook 建 `034-managed-rbac-policy` branch）→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`。
> 本檔不是 spec.md;它是餵給 `/speckit-specify` 的設計輸入。

**Feature**: 受管 RBAC policy 治理層 —— 在 casbin policy 上加 rev2 治理:**(a)** soft-delete 可復原 **(b)** 受保護不可刪 **(c)** 變更走 011 audit **(d)** 統一 CRUD facade;外加 menu↔casbin 漂移修復 + base-web policy 回收桶 UI。
**Created**: 2026-06-09
**前序 / grounding**:
- **設計權威**:DESIGN §10 Phase 3 #6「受管 RBAC policy 層 feature」(deferred 獨立治理軌道) + §11.6 sub-crate 拍板。
- **現況地圖**:`docs/RBAC-POLICY-SURVEY.md`(2026-06-08 三 workflow 對抗式驗過的現況快照;**其 `file:line` 會 rot、act 前重新 grep**)。
- **schema 事實**:`docs/REVIEW-DATABASE.md`(活體 schema/seed 稽核、casbin 69-row baseline)。
- **constitution**:§I.5(RUSTAPI-SOURCE-ISOLATION)/§I.6(審計欄)/§II §11.6(adapter=拷貝)/§III MODAL-WIRING/§V Amendment。

---

## 1. 目標（purpose / success criteria）

把 casbin policy 從「散在 021/022/023 + 019/020/025 + adapter/enforcer infra、無治理」變成**受管治理層**:policy 變更可復原、關鍵 policy 不可刪、每次變更有 audit 軌跡、統一單一 CRUD facade,並修掉 menu↔casbin 的漂移。

**Success criteria**:
- 撤銷一條 policy 後可**一鍵還原**(回收桶);關鍵治理 policy(R_SUPER 治理頁可見性 + 治理端點)**任何路徑都刪不掉**(data-driven protected)。
- 每次 grant/revoke/restore 都在**同一 sea-orm txn** 寫進 011 audit(operator/reason/前後快照),both-or-neither —— 消滅「policy 已 live 卻無 audit」(D2)。
- 021/022/023 三胞胎收斂成**一個**參數化 facade,wire(3 個 base-web auth-modal)**逐位元組不變**。
- menu 軟刪/還原與其可見性 policy **同 txn 連動** —— 無孤兒 policy(D2)、同名重建零繼承(DRIFT-3)。
- **讀熱路徑零改**:enforce_mw / getUserRoutes 仍讀 in-memory enforcer;治理純寫側、不增 per-request 讀壓。
- **後端不 fork adapter、不需 §11.6 amendment**;唯 base-web 回收桶頁 → MODAL-WIRING amendment(user 親決)。

---

## 2. 決策拍板（brainstorm 2026-06-09）

| # | 決策 | 拍板 | 理由 |
|---|---|---|---|
| **D1** | 第一刀範圍 | **完整 4 能力 + menu↔casbin 漂移修復 + base-web 回收桶 UI**(user 親選最大刀) | user 要 recoverability + protected + 變更軌跡 + 一致 CRUD + 治漂移 + 前端可救回。 |
| **D2** | 核心架構 | **B = archive 表(免 fork)**:`casbin_rule` 永遠只裝 live policy、軟刪列搬 `sys_casbin_policy_archive` | **核心發現**(§3):stock adapter 只認 `ptype,v0..v5`、忽略額外欄 → soft-delete **不需** fork adapter `load_policy`。B 給更乾淨不變式、避開讓本 feature 被 defer 的 §11.6 amendment + 永久 fork 維護。 |
| **D3** | 形態 | **一個 feature、5 US**(不拆 sub-feature) | user 親選。同架構下單份 spec 多 US。 |
| **D4** | 可還原介面 | **base-web policy 回收桶 UI**(非僅後端) | user 親選。raw policy(接口/按鈕/可見性 grant)前端可看可一鍵還原。 |
| **D5** | protected 覆蓋面 | **casbin_rule 列 + sys_menu 列都納入**(`is_seed_menu` 一併 data-driven 化) | user 親選納入。一個 `protected` 機制取代 §4 全部臨時守衛、開出修 D10 的路。 |
| **D6** | 原子性 | **DB-first**:facade 用 sea-orm 直寫 casbin_rule(旁路 adapter auto_save)+ 011 audit 同 txn → commit → enforcer `reload_policy` → publish | survey §1.4/§9.2:adapter pool handle 無法 enlist txn,DB-first 是原子化唯一解。 |
| **D7** | 多副本 fan-out(D3 債) | 單機自收驗(policy_watcher),**真 2-instance fan-out 驗 defer**(非當前部署目標) | rev2 compose 單一 rust-api service;多副本非現役部署。 |
| **D8** | archive 保留 | 留到還原或顯式 purge;**retention/purge 任務 out-of-scope**、列 follow-up | policy 撤銷是罕見 admin 動作、archive 表很小;purge 可比照 030 cleanup-job。 |

---

## 3. Grounding 驗證事實（親驗 adapter 源 2026-06-09）

**🔑 核心發現:soft-delete 不需 fork vendored adapter。** survey §9.2/§9.3 假設「soft-delete ⇒ 必 fork adapter `load_policy` 濾 `deleted_at`」⇒ 觸 §11.6 amendment。但讀 `rust-api/sea-orm-adapter/src/{entity,action}.rs` 證明:

- `entity::Model`(entity.rs:5-17)= **只有** `id + ptype + v0..v5`。
- `load_policy`(action.rs:98-103)= `Entity::find().all()` → 只 `SELECT` entity 定義的那 6 欄(非 `SELECT *`)。
- `create_active_model`(action.rs:166-177)/`add_policies` `insert_many` → 只填那 6 欄。
- `remove_*` / `load_filtered_policy` 只 filter `ptype + v0..v5`。

⟹ **stock adapter 嚴格 column-scoped 到 `ptype,v0..v5`,對 `casbin_rule` 的任何額外欄(`protected`/`created_at`/...)完全隱形**。所以:
1. 加治理欄到 casbin_rule **不需 fork、§11.6 不動**。
2. 只要維持「casbin_rule 永遠只裝 live policy」(軟刪列搬 archive),stock `load_policy` 天生只看到 live 集 → 不需 `deleted_at` 濾鏡 → **不需 fork**。

> 對照 A(fork)路線隱患:任一 load 路徑忘加 `deleted_at` 濾鏡 → 已刪 policy 靜默復活(DRIFT-3 近親)。B 的不變式杜絕此風險。

**其他 grounding(survey、act 前重新 grep 確認)**:
- casbin model = exact triple equality、**無 wildcard**;`g`(角色繼承)宣告但零用(角色在 `sys_user_role`)。protected **不能**靠 catch-all wildcard,必須 per-row。
- 一張 casbin_rule、靠 `v2` 區分三 domain:`v2=HTTP method`(endpoint)/ `v2='menu'` / `v2='button'`;`v3/v4/v5` 永遠 `''`。
- 裸空-v2 `remove_filtered_policy(0,[role,"",""])` 是跨 domain 刪除 footgun(D4)。
- 021/022/023 = 近乎逐字三胞胎(共用 HARD-REPLACE 骨架 + 3 套複製 error enum)。
- menu CRUD **完全不碰 casbin**(survey §3.1)→ 孤兒 policy(DRIFT-2)+ 同名重用靜默繼承(DRIFT-3)+ menu-CRUD policy staleness 不被 audit(DRIFT-4)。
- §4 三個臨時守衛:`is_seed_menu`(6 硬寫名單、sys_menu)/ `menu_set_locks_out_super`(leaf-only、只 pin manage_menu)/ 接口 root-mode(`code=="R_SUPER"` bare literal);按鈕無守衛。**D13**:self-lock 漏 pin `manage_role` + `manage_system-settings`。
- casbin live 69 列 == seed baseline(REVIEW-DATABASE)、零 runtime 編輯殘留。

---

## 4. 架構設計 — schema 與核心不變式

**核心不變式(地基)**:`casbin_rule` 永遠 == 正在被 enforce 的 live policy 集。軟刪 policy 不留表內、搬 archive。stock `load_policy` 天生只看 live 集、零濾鏡。

### 4.1 `casbin_rule` 加治理欄（adapter-隱形,migration `m000031`）

| 欄 | 型 | 用途 |
|---|---|---|
| `protected` | `boolean NOT NULL default false` | data-driven 受保護(取代 §4 守衛、修 D13) |
| `created_at` | `timestamptz NOT NULL default now()` | grant 建立時間 |
| `created_by` | `bigint NULL` | 誰授予(seed/系統=NULL) |

> 三欄 stock adapter 看不到(§3 證);NOT NULL+default 使 stock `insert_many` 不填亦合法(吃 default)。

### 4.2 新表 `sys_casbin_policy_archive`（restore 緩衝,migration `m000032`）

`id` PK / `ptype` / `v0..v5`(快照)/ `created_at`+`created_by`(原 grant 出處)/ `archived_at`(撤銷時間)/ `archived_by`(操作者)/ `archive_reason`(`manual_revoke`/`role_set_replace`/`menu_soft_delete`)。還原時此列**實體刪除**(回 casbin_rule,`protected` 取 default false —— protected 列撤不掉故永不進 archive)。

### 4.3 職責切分（重要）

- **`sys_operation_log`(011)= 永久不可變軌跡**:每次 grant/revoke/restore 都記(capability c 的真正 audit trail)。
- **`sys_casbin_policy_archive` = 暫存還原緩衝**:只裝「當前可還原」撤銷列,還原即離開。回收桶 UI 讀 archive、歷史軌跡讀 011、兩者不重疊。

### 4.4 §I.6 處置

- `casbin_rule`:既是 adapter 標準表(§I.6 非業務例外),加的是治理欄非審計欄。
- `sys_casbin_policy_archive`:非標準業務表,帶 `archived_at`/`archived_by`(= deleted_at/by 對應)+ grant 出處欄,**不帶完整 6 審計欄**(archive 列不可再軟刪、還原=實體消費)→ §I.6 例外(類 append-only 變體),plan Constitution Check #8 顯式註明理由。

---

## 5. 統一治理 facade + 原子寫入/reload 流程

**位置**:rust-api `model/facade/`(沿 facade pattern;唯一構造 casbin_rule / archive `ActiveModel` 之處 → 守 009 entity-access lint route b)。新增 rust-api 側 `sys_casbin_rule` entity(治理感知:`id,ptype,v0..v5,protected,created_at,created_by`)+ `sys_casbin_policy_archive` entity,各配 facade。

**4 操作（全收 `&DatabaseTransaction`、與 011 `mutate_in_txn` 組合）**:

| 操作 | 行為 | protected |
|---|---|---|
| `grant(role,obj,act,protected,op)` | INSERT live 列進 casbin_rule | — |
| `revoke(role,obj,act,op,reason)` | 軟刪:casbin_rule DELETE + archive INSERT 快照 | 目標 protected → **拒** |
| `restore(archive_id,op)` | archive→casbin_rule;撞 live 同列(unique)→ no-op 成功(只刪 archive 列) | — |
| `set_role_dimension(role,dim,desired,op)` | **HARD-REPLACE**(收斂 021/022/023):diff current-live vs desired,新增→grant、移除→revoke | 移除含 protected → 整筆拒 |

**寫入/reload/publish 流程（薄 governance service 統籌、集中今天 3× 複製的 reload+publish）**:

```
1. mutate_in_txn 開 sea-orm txn:
     facade 改 casbin_rule + archive  ──┐ 同一 txn
     寫 011 AuditEvent(operator/reason/前後 policy 快照)──┘ → commit(both-or-neither)
2. commit 後:取 enforcer 寫鎖 → enforcer.load_policy()(全量重載、casbin_rule 即新 live 集)→ 放鎖
3. best-effort PUBLISH casbin:policy:invalidate(他副本 reload、失敗只 warn)
```

**修掉的債**:
- **D2(audit-fail-after-change)+ D1(partial-write)**:policy 變更與 011 audit 同 txn、both-or-neither。
- **D4(空-v2-wildcard 跨 domain 刪)**:`revoke` 永遠按完整 `(ptype,v0..v5)` 精確匹配單列、`set_role_dimension` 用 diff 算確切撤的列 → 結構消滅裸 wildcard 路徑。
- **原子性死結根因**:facade sea-orm 直寫 casbin_rule(不走 enforcer auto_save 的 adapter pool handle)→ DB 權威、enforcer 是 commit 後重載投影。

**刻意保留**:
- 讀熱路徑(enforce_mw / getUserRoutes filter)**零改**,仍讀 in-memory enforcer(read lock)→ 純寫側、不增讀壓。
- reload 用全量 `load_policy()`(= 既有 watcher 行為);讀側快取是另一 perf feature、out-of-scope。
- commit→reload 間 ~ms in-memory 舊態窗(revoke 晚 ~ms 生效、fail-safe 無新權限提早出現)→ 已知假設。

---

## 6. data-driven `protected` + 收斂三胞胎

### 6.1 `protected` 取代 §4 守衛（capability b、US2）

`protected` 是 casbin_rule / sys_menu 列屬性。seed migration 標治理關鍵列 `protected=true`;facade(及 menu CRUD)遇 protected 即拒:

| 今天的臨時守衛(§4) | 改成 |
|---|---|
| `menu_set_locks_out_super`(leaf-only、只 pin manage_menu)| protected on `(R_SUPER, manage_menu, menu)` |
| **D13 漏 pin** manage_role / manage_system-settings | protected on `(R_SUPER, manage_role, menu)` + `(R_SUPER, manage_system-settings, menu)` ← **修 D13** |
| 接口 root-mode(`code=="R_SUPER"` bare literal)| protected on R_SUPER 治理 endpoint 列(021/022/023/025/029 種的 R_SUPER-only 治理 verb)|
| `is_seed_menu`(6 硬寫名單、sys_menu)| **sys_menu.protected**(D5 納入) |

### 6.2 sys_menu.protected（migration `m000034`）

`sys_menu` 加 `protected boolean NOT NULL default false`;seed 把現行 `is_seed_menu` 護的種子選單(`home`/`manage`/`manage_user`/`manage_role`/`manage_menu`/`manage_user-detail`)標 `protected=true`。menu CRUD facade 的 delete/disable/re-parent 改讀 `sys_menu.protected`(退役 handler 硬寫 6-名單)。
- **D10 payoff**:menu list 回應帶 `isSeed`/`protected`(BASE-WEB-ADAPT 新型)→ base-web 讀它、退役前端鏡像硬寫名單(歸 US5)。

### 6.3 收斂 021/022/023（capability d、US3）

3 個近乎逐字 `set_role_{menu,button,endpoint}` → 一個參數化 `set_role_dimension(role, dim, desired, op)`:
- `dim ∈ {Menu,Button,Endpoint}` 決定 v 對映:Menu`(v1=route_name,v2='menu')`/Button`(v1=code,v2='button')`/Endpoint`(v1=path,v2=method,多 method→多列)`。
- **1 套 error enum**(取代 3 套複製)。
- diff(current-live vs desired)算 add/remove → grant/revoke;移除含 protected → 整筆拒(取代 3 種 self-lock 故事)。
- dimension-specific 保留為插件:驗證器(menu_id 存在 / button ∈ active 聚合 / endpoint ∈ `ENDPOINT_REGISTRY` 33-const + build-lint)、讀回排序(3 種既有排序是 wire 契約、參數化保留)、endpoint R_SUPER 短路回 registry。

**風險與防護**:改寫 3 條正在運作的 code path;base-web 3 auth-modal wire(endpoint/形狀)**完全不動**、只收斂 rust-api 內部 → TDD + 既有 021/022/023 acceptance(curl+CDP)續綠。

---

## 7. menu↔policy 同步（修 D2/D3/D4、US4）

今天 menu CRUD 完全不碰 casbin → 孤兒 + 靜默繼承。改成 menu facade 在**同一 `mutate_in_txn`** 內連動 policy facade:

- **menu 軟刪(020)**:① 軟刪 sys_menu 列(現有)② **新增**:`revoke` 該 route_name 跨所有 role 的可見性 policy(reason=`menu_soft_delete`)→ archive ③ 011 audit。→ **修 DRIFT-2**(無孤兒)+ **DRIFT-4**(menu-CRUD policy 變更有 audit)。protected 種子選單本就被 6.2 擋下、到不了 revoke。
- **menu 還原(025)**:① 還原 sys_menu 列(現有、帶 active-only unique route_name 重用守衛)② **新增**:還原該 route_name 軟刪時 archive 的可見性 policy → 回 casbin_rule ③ audit。→ **修 DRIFT-3(利刃)**:同名**重建**起始零可見性(舊 grant 已 archive、非自動繼承);只有還原**同一選單**才把 archived policy 帶回。**D6 TOCTOU**:menu 還原本就被 active-only unique 擋(名被佔則拒)→ policy 還原不會在名被新選單佔用時觸發,**menu 層守衛保護 policy 層**、無 5000 競態。
- **懸空 archive**:舊選單 archive 了 policy、新選單重用 route_name → 舊選單永不可還原、其 archived policy 成死 cruft → purge follow-up(D8)。

---

## 8. base-web 回收桶 UI + amendment + error code（US5）

### 8.1 rust-api 新增 2 治理端點（R_SUPER only、§I.3 envelope）

- `GET /systemManage/getArchivedPolicies` → `ArchivedPolicy{id:string, dimension(由 v2 推), roleCode, target(v1), reason, archivedAt, archivedBy?}`。
- `POST /systemManage/restorePolicy` → body `{archiveId}` → 還原(撞 live 同列 no-op 成功)。
- 兩端點 seed R_SUPER-only casbin policy,且本身標 `protected`(還原治理 verb 不可自鎖)。

### 8.2 base-web 回收桶頁

- 新 view `base-web/src/views/manage/policy-archive/index.vue`,鏡像 manage 頁範式:archived 表 + 每列「還原」鈕 + 維度/角色篩選。
- BASE-WEB-WRAPPER 新檔 `rev2-*.ts`(service)+ BASE-WEB-ADAPT `rev2-extra.d.ts`(型)+ `route.manage_policy-archive` + `page.manage.policyArchive.*` i18n;選單可見性走 §I.2(seed sys_menu 列 + R_SUPER role-menu policy)。
- 同批處理 D10:menu list `isSeed` 消費、退役前端硬寫 SEED_MENU_ROUTE_NAMES。

### 8.3 amendment 評估（依 §V.2、user 親決）

回收桶「還原」是新 UI 用途(precedent:menu 回收桶是 v1.5.0 專門授權 use d)。`/speckit-plan` Constitution Check 判它落既有 MODAL-WIRING (e)「同 manage 範式新管理頁」內、或需 **v1.7.0** 新增 use (f)「policy 還原維運 UI」。傾向後者(MINOR、軌道授權邊界擴展)。**Claude 不主動 amend**;spec 標記、做到 US5 時於 DESIGN §11 提案、user 親決。

### 8.4 error code（§I.3、盡量重用 008 矩陣）

| 情境 | code |
|---|---|
| protected 不可移除 / R_SUPER 自鎖 | **2222**(沿用今天 menu_set_locks_out_super) |
| restore archiveId 不存在 | **4040** |
| restore 撞 live 同列 | **0000**(no-op 成功) |
| route_name 重用競態(D6) | **5000** |

→ 不新增 BizCode。

---

## 9. User Story 切分

| US | 內容 | 層 | 依賴 |
|---|---|---|---|
| **US1** | schema(casbin_rule 治理欄 m031 + archive 表 m032)+ 統一 DB-first facade(grant/revoke/restore + 011 audit、原子)| 後端地基 | — |
| **US2** | data-driven protected(casbin_rule + sys_menu m034 + protected seed m033)+ facade 拒移除 + 退役 §4 三守衛 + 修 D13 | 後端 | US1 |
| **US3** | 收斂 021/022/023 → `set_role_dimension`、3 error enum 併 1、wire 零改 | 後端 | US1, US2 |
| **US4** | menu↔policy 同步(軟刪/還原同 txn)、修 DRIFT-2/3/4 | 後端 | US1, US2 |
| **US5** | 回收桶 2 端點 + base-web UI + D10 wire-isSeed + MODAL-WIRING v1.7.0 amend | 全端 | US1, US4 |

migration:`m000031`(casbin_rule 治理欄)/`m000032`(archive 表)/`m000033`(casbin protected seed)/`m000034`(sys_menu.protected 欄+seed)。

---

## 10. testing / acceptance + 守恆

**純函式單測（test-first red→green）**:`set_role_dimension` diff、protected-拒、dimension→`(ptype,v0..v5)` 對映、menu↔policy「該 archive/restore 哪些 route_name 列」;enforcer 決策測沿 014 `MemoryAdapter` + production RBAC model 範式。

**live-DB `#[ignore]` 整合測（本機無 cargo、走 dev docker image + 快取卷）**:原子寫(grant+audit 同 txn、注入 audit 失敗→雙 rollback,沿 011 範式)/ revoke→列 casbin_rule→archive + reload 後 enforce 拒 / restore→回來 enforce 允 / protected revoke→拒且列不動 / menu 軟刪→其 policy archive + enforce 拒可見 / **DRIFT-3**:軟刪 foo→新建 foo→新 foo 零可見性。

**acceptance（C-V:curl + CDP + psql）**:**既有 021/022/023 三 modal acceptance 必續綠**(US3 收斂 regression、curl+CDP)/ 新回收桶端點 curl / US5 CDP 回收桶頁列+還原 / **跑活體前 dcargo build + restart rust-api**(cargo-watch /mnt/d 不可靠)+ **PUBLISH 測試污染 running watcher → 先 restart/re-sync**。

**不變式守恆(專案「守恆全綠」慣例)**:
- 核心:`casbin_rule(live) == enforcer policy 集`、`archive == 已撤未還原集`,任何 op 後成立。
- casbin 69-row seed baseline + protected 旗標 migration 後 reconcile。
- **讀決策零變**:013/014 enforce 結果(Super/Admin/User 選單可見 + endpoint allow/deny)feature 前後逐項相同(純寫側)。

---

## 11. Constitution Check 預覽

- **§I.5(RUSTAPI-SOURCE-ISOLATION)**:新 rust-api 碼全綠地;**adapter 完全不動**(B archive)→ **§11.6 後端不觸、無 amendment**。
- **§I.6(審計欄)**:archive 表 §I.6 例外(governance restore-buffer、archived_at/by、plan 顯式註明);casbin_rule/sys_menu 加的是 protected/治理欄、非新業務表。
- **§I.2(menu Casbin enforce)**:回收桶頁可見性走 Casbin seed。
- **§I.3(wire ground truth)**:envelope/id 型/error code 對齊 mock;3 auth-modal wire 零改。
- **§II §11.6**:後端不觸。
- **§III MODAL-WIRING ★**:**唯 US5 base-web 回收桶 UI** → 評估落 (e) 內或需 **v1.7.0 amend(use f)**、user 親決(§8.3)。

---

## 12. scope 邊界 / out-of-scope / follow-up

**in-scope**:4 治理能力 + menu↔policy 同步(D2/D3/D4) + base-web 回收桶 UI + protected(casbin_rule + sys_menu)+ 收斂三胞胎 + 修 D13/D4/D1/D2/D10。

**out-of-scope（列 follow-up / 鄰近獨立 feature）**:
- **讀側快取**(短 TTL 角色快取 §2.22 + sys_menu 樹快取 NEW + D3 多副本 fan-out 驗)= 獨立「多用戶讀效能」feature(survey §9.4、perf 非治理)。
- **archive retention/purge** 任務(D8、比照 030 cleanup-job)。
- **真 2-instance fan-out 驗**(D7、非當前部署目標)。
- **懸空 archive GC**(§7、name 被佔用後的死 cruft)。
- D7(visible≠clickable)/ D8(三維正交)/ D9(前端 reactive 重繪)— survey 標範圍外。

---

## 13. 下一步

依 CLAUDE.md §3 / §11.12:本 brainstorm spec-design 定案 → **user 手動 `/speckit-specify`**(input = 本檔;讓 `speckit.git.feature` pre-hook 建 `034-managed-rbac-policy` feature branch)→ `/speckit-clarify`(optional)→ `/speckit-plan`(跑 Constitution Check、§8.3 amendment 評估、§11)→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`(subagent-driven、逐 US 雙審)。

**Phase 0 research 紀律(plan 階段必守、見 CLAUDE.md §3)**:rust facade 真實返回型 grep / wire 鏈條 3 端對齊 grep / struct/function 命名對照 grep(survey 的 file:line 會 rot、act 前重新 grep)。
