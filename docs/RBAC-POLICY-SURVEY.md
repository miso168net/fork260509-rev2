# RBAC Policy 編輯架構 Survey（現況地圖）

> **來源**：2026-06-08 兩次平行 survey workflow —— ① 4 軸 RBAC 架構（casbin infra / 角色管理 3 維 / 菜单管理↔casbin / seed+protected+債）② 2 軸 Redis/快取（用途分類 / DB 讀壓力）。
> **驗證**：2026-06-08 第三個 workflow（3 軸）對**實際 code** 對抗式抽驗本檔承載性宣稱（重新 grep、不信本檔行號）—— 全部 confirmed、含 D13 NEW finding；僅少數非承載性行號 off-by-one（不影響論斷）。
> **用途**：**「受管 RBAC policy 層」治理 feature 的「現況」grounding**（DESIGN §10 Phase 3 #6 / §11.6）。攤清為何此 feature 雖列 Phase 3 卻刻意拖到現在——**這塊散在 021/022/023/024 + 019/020/025 + adapter/enforcer infra，太亂**。
> **紀律**：此檔是 **survey 時點的現況快照**；所有 `file:line` 對 branch `rev2-admin-root`、會隨 code 演進 **rot** —— act（改 code）前務必重新 grep 確認，勿盲信本檔行號。內容權威歸 [DESIGN](INTEGRATION-DESIGN.md)；本檔僅現況地圖。

---

## §0 TL;DR（一頁總結）

1. **一張 `casbin_rule` 表、四種意義靠 `v2` 區分**：`v2=HTTP method`(endpoint authz、`enforce_mw` 真正 gate) / `v2='menu'`(選單可見性) / `v2='button'`(按鈕)。model 是 **exact-equality、零 wildcard**；`g`(角色繼承)**宣告但完全沒用**(角色在 `sys_user_role` 表)。
2. **三維寫入(021/022/023)是近乎逐字三胞胎**：共用 HARD-REPLACE 骨架(寫鎖→remove_filtered+add_policies→放鎖→**另開** audit txn→best-effort publish)、3 套複製的 error enum、3 種 read 排序、3 種 self-lock 故事。
3. **menu↔casbin 零同步**：`sys_menu`(存在性、019/020/025)與 casbin menu-visibility(可見性、021)只靠 `route_name` 字串相連；**菜单 CRUD 完全不碰 casbin** → orphan policy + 重用 route_name 靜默繼承(DRIFT)。
4. **Redis 幾乎不是讀快取、是協調匯流排**：只有 `sess:{uid}`(028 session pointer)一個讀快取；其餘是 `casbin:policy:invalidate`/`settings:invalidate` 兩個 pub-sub 廣播。**RBAC 讀的卸壓靠 in-memory enforcer，不是 Redis**。
5. **多用戶 DB 讀壓力**落在 3 張**未快取**表：`sys_user_role`+`sys_role`(每受保護請求 2 query、刻意 DB-fresh §2.22)、`sys_menu`(每次 getUserRoutes 全表掃、**NEW 未登記債**)。
6. **原子性死結**：casbin auto_save 走 adapter pool handle、**無法 enlist 進 sea-orm txn** → policy 變更與 011 audit 是兩條獨立寫入路徑(**D2 audit-fail-after-change**)。要原子就必須 **DB-first**(facade 直寫 casbin_rule 列 + audit 同 txn、再 reload enforcer)。
7. **治理 feature = 純寫側**(soft-delete/protected/audit/原子性/統一 facade)、**不碰讀熱路徑**(讀仍由 in-memory enforcer 服務)；要 fork sea-orm-adapter → **觸 §11.6 amendment**。

---

## §1 地基：casbin model + 儲存

### §1.1 production model（`enforce.rs:31-42`）

```
r = sub, obj, act
p = sub, obj, act
g = _, _                ← 宣告但「完全未使用」(forward-compat only)
m = r.sub == p.sub && r.obj == p.obj && r.act == p.act   ← exact equality、無 wildcard/prefix/keyMatch
```

- production model 是 **inline 字串常數**，非 `.conf` 檔（兩個 `.conf` 僅 adapter 單元測試 fixture）。
- **`g` 角色繼承零 seed、零使用**：角色→使用者在 `sys_user_role` 表（`m20260529_000007`），`enforce.rs` 直接拿 role code 當 subject（`enforce.rs:12-13,28`）；`roles_for_user` 用 SQL 解析（`enforce.rs:85`）→ casbin 從不做 grouping。
- **matcher 是 exact triple equality**（`enforce.rs:41`）：無 `p,R_SUPER,*,*` wildcard，**每個 (role,obj,act) 都是顯式一列**（DESIGN §11.22 已校正舊 wildcard 文字錯誤）。protected-flag 設計**不能靠 catch-all wildcard**。

### §1.2 一張表、四種 `v2` 意義（核心 footgun）

`casbin_rule` 全 `ptype='p'`，靠 `v2` 區分三個正交 domain（+ endpoint）：

| domain | v0 | v1 | v2 | 誰讀 |
|---|---|---|---|---|
| **endpoint** authz | role_code | path | **HTTP method**（GET/POST/DELETE，變數）| `enforce_mw`（真正 gate）|
| **menu** 可見性 | role_code | route_name | 常數 `'menu'` | `getUserRoutes` tree-prune |
| **button** 可見性 | role_code | button_code | 常數 `'button'` | base-web `hasAuth` |

`v3/v4/v5` 永遠 `''`（stock adapter NOT NULL、無 default、seed 填空字串）。**正交性「只」靠每個讀/寫都過濾具體 `v2` 值**——`remove_filtered_policy(0,[role,"",""])`（裸空 v2）是 wildcard、會**跨 domain 刪光該 role 的 menu+button+endpoint**（`endpoint_auth.rs:25-29` ⚠ 明文警告）。

### §1.3 casbin_rule schema（stock、無治理欄）

- `entity.rs:5-17`：`id:i64`(PK auto-inc) + `ptype` + `v0..v5`，全 `String`。**無 `deleted_at`、無 protected、無 FK、無 timestamps**。
- 建表委派 adapter：`m20260529_000005_create_casbin_rule.rs` 的 up/down 只呼 `sea_orm_adapter::up()/down()`（單一 schema 來源、不在此手寫 DDL）；真正 DDL 在 `sea-orm-adapter/src/migration.rs:19-56`，含 **UNIQUE 複合索引** `unique_key_sea_orm_adapter (ptype,v0..v5)`。

### §1.4 adapter（pool handle、無法 enlist txn）

- `adapter.rs:10-13`：`SeaOrmAdapter<C> { conn: C, is_filtered }`，production 是 `SeaOrmAdapter<DatabaseConnection>`（`enforce.rs:47-49`）。
- **`conn` 是 pool handle，非 pinned 連線**：每次操作抓任意 pooled 連線 → **外部 sea-orm txn 無法 enlist casbin 寫入**（原子性死結根因）。
- `action.rs` 每個 fn 對傳入 `conn: &C: ConnectionTrait` 執行、**自己不開 txn**：

| fn | 行為 | 原子性 |
|---|---|---|
| `load_policy` (`:98`) | SELECT 全表 | — |
| `load_filtered_policy` (`:105`) | SELECT(g/p 條件) | — |
| `add_policies` (`:154`) | 單一 `insert_many` | **單語句** |
| `remove_policies` (`:61`) | **per-rule 迴圈** N 個 DELETE | **非單 txn**（partial-write） |
| `remove_filtered_policy` (`:71`) | 單一 `delete_many`(offset 條件) | 單語句 |
| `save_policies` (`:133`) | clear(DELETE *)+add，**兩語句未包 txn** | 危險（無 production caller）|

- `remove_filtered_policy` 帶 rev2 修正（`action.rs:78-81`：offset 只套 `COLUMNS` 不套 `rule.values`，rev1 double-offset bug；勿 rebase-revert）。

### §1.5 auto_save + enforcer + watcher

- **auto_save 是 ON 但從沒顯式設定**：grep 零 `enable_auto_save`，靠 casbin 2.20 預設（Cargo.lock pin 2.20.0）。6 處註解 *聲稱* 它 on 但無碼強制 → **latent footgun**（若有人設 `false`，所有 runtime 編輯靜默只改記憶體不落 DB）。
- auto_save on → 每次 `add_policies`/`remove_filtered_policy` **同時**改 in-memory **與**立刻寫 DB（adapter pool conn）。
- enforcer = `state.rs:28` `Arc<RwLock<casbin::Enforcer>>`（全 process 一份）；boot `build_enforcer` fail-fast（`main.rs:51-54`）。`state.rs:25-27` 註解「runtime 不改 policy」**已 stale**（021/022/023 確實取 write lock）。
- **multi-instance reload**：`policy_watcher.rs` 訂 `casbin:policy:invalidate`、**任何訊息都 `load_policy()` 全表 reload**（payload 忽略、無粒度）；reload 失敗保留舊 policy（`:83-87`）。獨立 pub-sub 連線（subscribe mode 不能共用 ConnectionManager）。

---

## §2 三維寫入（021 菜单 / 022 按钮 / 023 接口 / 024 rollout）= 近乎逐字三胞胎

### §2.1 共用 HARD-REPLACE 骨架

```
1. 取 enforcer 寫鎖 → replace_role_*_policies(remove_filtered + add_policies) → 取 before snapshot → 放鎖
2. 另開 SEPARATE sea-orm txn → 寫 011 audit(entity_table="casbin_rule") → commit
3. best-effort PUBLISH "casbin:policy:invalidate" → 失敗只 warn、不讓請求失敗
```

| | 菜单(021) | 按钮(022) | 接口(023) |
|---|---|---|---|
| fn | `menu_auth.rs:97` | `button_auth.rs:102` | `endpoint_auth.rs:181` |
| remove | **單次** `remove_filtered(0,[role,"","menu"])` | **單次** `[role,"","button"]` | **per-method loop** `for m in ["GET","POST","DELETE"]`（v2 是變數）|
| add | `[role,route_name,"menu"]` | `[role,code,"button"]` | `[role,path,method]` |
| error enum | `SetRoleMenuError` | `SetRoleButtonError` | `SetRoleEndpointError` ← **三者逐字相同、僅型名異** |

### §2.2 讀回（3 種不同排序）

| | 菜单 | 按钮 | 接口 |
|---|---|---|---|
| fn | `get_role_menu_route_names`(`menu_auth.rs:72`) | `get_role_button_codes`(`button_auth.rs:75`) | `get_role_endpoints`(`endpoint_auth.rs:147`) |
| 排序 | **不排序**（依 sys_menu 順序）| BTreeSet **字典序** | **(path,method) 排序** |

- `ENDPOINT_REGISTRY`（`endpoint_auth.rs:74-114`，**33 entries**）= endpoint 編輯的唯一真相、hand-maintained const，須與 `main.rs` enforce_mw route literals byte-identical（build-time lint + `len()==33` 單測守）。
- `Endpoint` DTO wire 是 `{method,path}` 但 casbin 列永遠 `[role,path,method]`、registry tuple 又是 `(method,path)` → **同一對 (path,method) 有三種排列**（`endpoint_auth.rs:67-69` 自己標）。

### §2.3 每維不一致（誠實債清單）

- **self-lock 守衛三種故事**：菜单有 `menu_set_locks_out_super`（leaf-only、只 pin `manage_menu`）；按钮**無**（刻意，按鈕只藏操作不鎖頁）；接口用 handler root-mode（**拒編 R_SUPER**、bare literal `code=="R_SUPER"`）。
- **R_SUPER read 特例只在接口**：`get_role_endpoints` 對 R_SUPER 短路回整個 registry（root-all），菜单/按钮無此特例 → UI 對「Super 能做什麼」每維算法不同。
- **驗證來源各異**：菜单驗 menu_ids 存在、按钮驗 ∈ active buttons 聚合、接口驗 ∈ ENDPOINT_REGISTRY(compile-time const)。

---

## §3 menu ↔ casbin 耦合（最棘手）

### §3.1 兩個 store、只靠 `route_name` 相連、零同步碼

| 概念 | store | 擁有 feature | key |
|---|---|---|---|
| 菜单**存在性** | `sys_menu` 表 | 019(讀)/020(寫 CRUD)/025(restore+re-parent) | `id` PK / `route_name`(穩定業務 key、**immutable** D2) |
| 菜单**可見性** | `casbin_rule` `(role,route_name,'menu')` | 021(`updateRoleMenu`)+ seed m010 | `(role,route_name)` |

- 唯一連結 = `route_name` 字串；**無 FK、無 menu_id in policy、無同步邏輯**。
- **casbin menu-visibility 只由 021 寫**（`set_role_menu` HARD-REPLACE、keyed by **v0=role**、清一個 *role* 的 menu 列、非一個 *menu* 跨 role 的列）。
- **菜单 CRUD 完全不碰 casbin**（grep 證：`add_polic*`/`remove_filtered` 只在 3 個 `set_role_*`）：
  - `create_menu`：只寫 sys_menu + audit、**零 policy** → 新菜单誰都看不到，要再跑 021。
  - `delete_menu`(soft)：設 `deleted_at`、**casbin 列原封不動 → 變 orphan**。
  - `restore_menu`：清 `deleted_at`、**零 casbin 互動** → 靜默重新繼承還掛著 route_name 的 orphan 列。

### §3.2 讀側：可見性 derive 自 casbin、existence 自 sys_menu

`getUserRoutes`(`route.rs:39`)：① `sys_menu::list_active_all` 建全樹（existence）② `menu::filter_routes` 用 enforcer prune（每葉 `enforce((role,route_name,"menu"))`、父 `manage` 不自身判定、≥1 子可見才留）。→ **菜单要顯示須「sys_menu 有 active 列」AND「有對應 menu policy」**，每請求靠 route_name 即時 join、無一致性強制。

### §3.3 DRIFT（每處都標）

- **DRIFT-1**：新建菜单零可見性（benign、fail-closed、但建菜单其實是兩步、code 不強制/不提示）。
- **DRIFT-2**：軟刪留 orphan menu-visibility 列（讀路徑略過、暫無害）—— **§2.29 債**。
- **DRIFT-3（利刃）**：`sys_menu_route_name_active_uniq` 是 **active-only** 部分唯一索引 → route_name 被軟刪後可重用；**重建/restore 同名菜单會靜默繼承舊 grant** = 沒人授權卻可見（**authz 驚奇**）。restore 同機制（R6「restore 自動還原可見性」算 payoff，但與意外 DRIFT-3 同一未受控機制）。
- **DRIFT-4**：policy 可指向已無 live 菜单的 route_name（psql 手改/seed/grant 後軟刪）；讀路徑容忍但累積 cruft；menu-CRUD 造成的 policy staleness **不被 audit**（菜单 CRUD audit `sys_menu`、非 orphan policy）。

---

## §4 守衛（臨時、不一致、handler 層）

- **`is_seed_menu`**（`handler/system_manage.rs:71`）：6 個硬寫 route name（`home`/`manage`/`manage_user`/`manage_role`/`manage_menu`/`manage_user-detail`）、case-sensitive exact match。擋 seed 的 delete/disable/re-parent。facade 不知 seed（由 handler 擋）。**前後端重複債**（base-web modal 硬寫同 6 名鏡像、§2.29 D10）。
- **`menu_set_locks_out_super`**（`menu_auth.rs:62`）：R_SUPER 新集若無 `manage_menu` → 拒（2222）。**leaf-only**：只 pin `manage_menu`、靠 seed/no-reparent 守衛保父路徑。
- **接口 root-mode**：`update_role_endpoints` 拒編 R_SUPER（`system_manage.rs:1094-1098`、bare literal、刻意非 `is_seed_role_code` 以免擋 R_ADMIN）。
- **按钮**：**無守衛**（刻意）。
- ★ **NEW 發現（不在 CHECKLIST、本 survey 抓）= D13**：self-lock 守衛**漏 pin `manage_role` 與 `manage_system-settings`**（皆 host policy 編輯抽屜/admin 頁）。R_SUPER 若把 `manage_role` 可見性移掉，會**藏掉所有 policy 編輯抽屜卻不觸發任何守衛**（`menu_auth.rs:63` 只查 `manage_menu`）。

---

## §5 seed policy 清單 + protected 候選

### §5.1 seed 概覽（role × policy；全 `p`-policy、無 `g` seed）

- **endpoint**（v2=method）：009/013/015/017/019/020/021/022/023/025/029 各 migration seed；多數治理 verb（021-029）**僅 R_SUPER**；getUserList/getRoleList GET 給 R_SUPER+R_ADMIN；getAllRoles 三角色全有。完整 enforce 集 = `ENDPOINT_REGISTRY` 33 entries。
- **menu**（v2='menu'、m010 + m022 + m029）：`home` 三角色；`manage_user`/`manage_user-detail` R_SUPER+R_ADMIN；**`manage_role`/`manage_menu` 僅 R_SUPER**；`function`/`function_toggle-auth` 三角色（022 demo 提升）；**`manage_system-settings` 僅 R_SUPER**（029）。父 `manage` **不 seed**（tree-prune 算）。
- **button**（v2='button'、m022 + m024）：B_CODE1/2/3 階梯；`user:add/delete` R_SUPER、`user:edit` +R_ADMIN；`role/menu:add/edit/delete` 6 碼僅 R_SUPER（其餘 runtime 指派）。
- **角色/使用者 seed**（非 casbin）：`sys_role` R_SUPER/R_ADMIN/R_USER_COMMON（m006）；`sys_user_role` 1→SUPER/2→ADMIN/3→USER（m007）。

### §5.2 protected 候選（未來 `is_protected`）

- **CRITICAL**：R_SUPER 對治理頁的 menu 可見性 `manage_menu`/`manage_role`/`manage_system-settings`（m010/m029）+ R_SUPER 治理 endpoint 列（021/022/023/025/029）+ R_SUPER 角色本身。
- 今日「保護」只靠 §4 三個**臨時硬寫守衛**（非 data-driven、不統一）→ `is_protected` 旗標可一次統一替換。

---

## §6 Redis / 快取地圖

### §6.1 Redis 只有兩種用途（+ boot/test）

| 用途 | 是什麼 | 站點 |
|---|---|---|
| **pub-sub 協調**（不存資料、payload 是被忽略的 `1`）| `casbin:policy:invalidate`(021/022/023 寫後廣播→各副本 reload enforcer)+ `settings:invalidate`(029 改設定→reload session_mode) | `policy_watcher.rs:70,106` / `settings_watcher.rs:84,123` + 3 寫端 publish |
| **讀快取（卸 DB 讀）** | **只有一個**：`sess:{uid}`(028 single-session pointer) | `session.rs` cache_set/get + `system_manage.rs` DEL |

- ★ **NEW**：image 是 `redis/redis-stack-server` 但**只用 plain KV + pub-sub**（零 RedisJSON/Search/hash/list/set）→ **redis-stack 過度配置、plain `redis:7` 即足**（debt）。
- Redis client：1 個共用 `ConnectionManager`（一般 SET/GET/PUBLISH）+ 2 個專用 pub-sub client（subscribe mode 須獨立連線）。

### §6.2 唯一讀快取 `sess:{uid}`（028）完整特性

- **key**：`sess:{user_id}`（`session.rs:44-46` `sess_key()` 單一源、讀寫不漂移）。
- **value**：`PointerRec{session_policy,sid}` JSON（plain string）。
- **TTL**：**無**（plain SET、無 EX；grep 證零 EXPIRE/SETEX）→ 永存到被覆寫或 DEL。
- **pattern**：persist-then-cache 寫（`set_pointer`：先寫 `sys_user.current_session_id` 真相 MUST succeed → 再 best-effort cache_set）；read-through + rehydrate-on-miss（`is_current`：cache_get hit 用之、miss/壞/錯 → 讀 sys_user → rehydrate）。
- **真相**：`sys_user.current_session_id`/`session_policy`（Redis 純加速器、無權威狀態）。
- **失效**：`updateUserSessionPolicy` → `DEL sess:{uid}`（無 fan-out、其他副本靠下次 cache miss 回 DB 重讀；DB 同步更新故只一讀 stale 窗）。
- **fail-OPEN**（刻意、統一）：Redis 掛→讀 sys_user→都掛→`is_current` 回 `true`（放行）。理由：fail-closed 會 Redis/DB 一抖就全站登出（`session.rs:140-145`）；`is_current` 是附加收斂、非主 auth gate。

---

## §7 DB 讀壓力地圖（多用戶）

### §7.1 兩層、快取特性相反（load-bearing fact）

| 層 | 答什麼 | 存哪 | 每請求成本 |
|---|---|---|---|
| **POLICY**（role→能不能/看不看得到）| in-process `Arc<RwLock<Enforcer>>` | **記憶體**（boot 載一次、pub-sub reload）| **零 DB、零 Redis** |
| **ROLE 成員**（user→roles）| **直打 DB** | sys_user_role + sys_role | **2 indexed query**、**刻意不快取**（§2.22、為角色撤銷下個請求即生效）|

→ **policy 讀已被 in-memory enforcer 卸掉**（enforce 不碰 DB/Redis）；**真正 per-request DB 壓力是角色查詢**（即時性換來的）。adapter 無 per-enforce hook、`enforce()` 純跑記憶體 model（read lock）。

### §7.2 per-request 熱路徑

| 路徑 | 頻率 | DB query | Redis |
|---|---|---|---|
| `enforce_mw`（~37 條 /systemManage/*）| 每受保護請求 | **2**（`roles_for_user`：sys_user_role + sys_role）| 1 GET（is_current）|
| `getUserInfo` | 登入/reload | **3**（sys_user + roles×2）；buttons 走 in-memory | 1 GET |
| `getUserRoutes` | 登入/reload | **4，含 `sys_menu` 全表掃**（`list_active_all` unfiltered 每次）| 1 GET |
| `is_current` | 每 gated 請求 | 0（hit）/ +1 sys_user（miss）| 1 GET |

### §7.3 多用戶壓力落點（3 張未快取表）

1. **sys_user_role** — 每 gated 請求
2. **sys_role** — 每 gated 請求
3. **sys_menu** — **每次 getUserRoutes 全表掃** ★ **NEW debt：未快取、未登記 backlog**；比角色查詢更重；menu 樹只在 set_role_menu/menu CRUD 變動（已 PUBLISH invalidate）→ 天生適合 pub-sub-invalidated in-memory 快取。

（sys_user 壓力大多被 `sess:{uid}` 吸收；getUserInfo 仍每次讀 sys_user。）

### §7.4 卸壓現況

- **已有**：policy in-memory、session pointer 快取、session_mode in-memory、批次角色讀（getUserList N+1 avoidance、2 query 不隨頁數長）、無角色 fast-path。
- **已 defer**：短 TTL per-user 角色快取（§2.22、會重引入 staleness）。
- **未做未登記**：sys_menu 樹快取（NEW）。

---

## §8 混亂清單（去重 13 項債 — 治理層要清的）

| # | 亂源 | §ref | 治理修法 |
|---|---|---|---|
| **D2** | **audit-fail-after-change**：casbin 變更不在 audit txn、失敗時 policy 已 live 卻無稽核（違 FR-007 意圖；唯一「mutation 落地卻無 audit」之處）| §2.25-28/31 | (c) audit 同 txn |
| D1 | `add_policies`/`remove_policies` partial-write（per-rule loop 非單 txn）| §2.25-28 | (d) 單 txn facade |
| D3 | 多副本 redis fan-out **未驗**（僅單實例自收）；publish best-effort 掉訊息→他副本靜默 stale | §2.25-28、DESIGN P3#3 | 寫側驗 2-instance |
| D4 | **空-v2-wildcard 跨 domain 刪除 footgun**（含 022/024 down() 同陷阱）| code ⚠ | (d) 單一安全 removal path |
| D5 | 軟刪留 orphan menu-visibility + 重用 route_name 靜默繼承 | §2.29 | (a) soft-delete + menu↔policy 同步 |
| D6 | restore route_name TOCTOU → 5000 | §2.29 | (a/d) |
| D7 | visible≠clickable（button-auth 與 endpoint-auth 獨立維度、可漂移）| §2.28 | 範圍外/未來 |
| D8 | 三維正交（一有效能力需三編輯：menu+button+endpoint）| §2.28 | 範圍外 |
| D9 | reactive in-session 重繪路徑僅 code-review 驗（前端）| §2.26/28 | 前端 follow-up |
| D10 | base-web SEED_MENU_ROUTE_NAMES 前後端硬寫重複 | §2.29 | 未來 wire `isSeed` |
| D11 | `ENDPOINT_REGISTRY` per-verb header count stale（cosmetic）| §2.29 | tidy |
| **D12** | **無 soft-delete/protected/統一 facade**（catch-all、治理 feature 本體）| DESIGN §11.6/P3#6 | (a)(b)(d) |
| **D13** | **self-lock 守衛漏 `manage_role`/`manage_system-settings`**（NEW、本 survey 抓）| 本 survey | (b) protected |

---

## §9 對「受管 RBAC policy 層」治理 feature 的意涵

### §9.1 治理 4 能力 ↔ 債對映（DESIGN §10 Phase 3 #6 (a)-(d)）

- **(a) soft-delete 可復原** → 修 D5（軟刪變 soft-delete-aware）；**需 fork adapter 的 `load_policy`/`load_filtered_policy` 濾 `deleted_at IS NULL`** + casbin_rule 加 `deleted_at` + partial unique。
- **(b) protected 不可刪** → 修 D13 + 統一 §4 三個臨時守衛為 data-driven `is_protected`。
- **(c) 變更走 011 audit（mutate_in_txn）** → 修 **D2**（原子性核心）。
- **(d) 統一 CRUD facade** → 修 D1（單 txn）、D4（單一安全 removal）、收斂三胞胎。

### §9.2 原子性必須 DB-first（survey 證實）

D2 根因 = casbin auto_save 走 adapter pool handle、**無法 enlist 進 sea-orm txn**（§1.4）→ **不能只包 casbin MgmtApi**。要 policy+audit 原子，治理 facade 須 **DB-first**：一個 sea-orm txn 內（soft-delete-aware 直寫 casbin_rule 列 + 寫 011 audit）→ commit → 取 enforcer 寫鎖 `reload_policy`（forked load 濾 deleted_at）→ PUBLISH invalidate（他副本 reload）。casbin auto_save 寫路徑於治理路徑被旁路。

### §9.3 §11.6 Constitution Amendment（先決）

fork sea-orm-adapter 的 load/remove = 把 §I.5 例外清單 + §11.6 拍板的 sea-orm-adapter「拷貝」改成「拷貝+客製」≈ 半重寫 → **必走 §V.2 Amendment**（user 親決、Claude 不主動 amend；version 等級 MINOR vs 更高待拍板）。承諾 = 長期自維護 fork（脫離 stock 升級）。

### §9.4 讀側 vs 寫側（你關心的「多用戶」維度）

- **治理 feature = 純寫側、不碰讀熱路徑**（讀仍由 in-memory enforcer 服務）→ **不增加 per-request DB 讀壓力**。
- **「多用戶讀壓力」是另一個維度**：受管 RBAC（寫側治理）≠ RBAC 讀路徑效能（讀側快取）。真要解多用戶讀壓力 = 獨立的「RBAC 讀快取」feature（短 TTL 角色快取 §2.22 + sys_menu 樹快取 NEW + 驗多副本 fan-out D3）—— 有 staleness 取捨、屬 perf 非治理，**建議切開**。
- **唯一交集的多副本點**：in-memory enforcer 跨副本新鮮度靠 `casbin:policy:invalidate` 廣播、**而此 fan-out 從沒 >1 副本驗過（D3）** → 治理 feature 在**寫側**要一併驗。反之角色查詢「直打 DB」在多副本下是**資產**（天生跨副本一致、無需失效協定）。

### §9.5 待拍板的範圍決策

1. **menu↔casbin DRIFT（D5/DRIFT-3）是否納入治理 feature**：orphan GC + 重用 route_name 繼承修正——相鄰但獨立子問題（治理層擁有 menu↔policy 同步 vs 獨立 follow-up）。
2. **讀側快取是否納入**：建議切成獨立「多用戶讀效能」feature（見 §9.4）。
3. **§11.6 amendment version 等級**：MINOR（邊界擴展）vs 更高（拍板實質變更）——user 親決。

---

> **下一步**（依 CLAUDE §3）：本 survey 作為 grounding → `superpowers:brainstorming` 收斂治理設計 → 寫 spec-design `docs/superpowers/<NNN>-<feature-name>.md` → user 手動 `/speckit-specify`。
