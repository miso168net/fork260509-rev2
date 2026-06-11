# rev3 管理系統開發設計書 — 骨架目錄 (v1)

> **狀態**：**脊椎章（§3 資料模型 / §4 行為島 / §5 面矩陣）已展開到可實作深度**（grounded on rev2 完整 DDL + 行為驗證）；§0–§2、§6–§11 仍為骨架種子，待脊椎 review 後續推。**⚠️ = 工程決策的「資深建議預設」、待 user 覆核**。新能力（儀表板 / 報表匯出 / AES 靜態加密）的 v1 取捨見 §3.6。
> **本書關鍵設計決策**：① **§0 預設範式宣告**（data-centric 明示）；② §3 命名為「資料模型脊椎」（避開 DDD 的 *domain model* 混淆）；③ 行為島獨立成 **§4**（state-machine 鏡頭）；④ 整合 Google「management system design」5 主題的**覆蓋**——**§1 功能需求**、**§6 前端 UI/UX**、**§10 安全與合規** 三章 + **附錄 E「Google-5 覆蓋 gate」**；⑤ 全章編號 §0–§11。
> **方法論四原則**：① 資料模型脊椎 ② 面矩陣 ③ 三序分離 ④ 縱切交付。
> **兩條軸的整合**：本書骨架 = **結構脊椎**；Google-5 = **覆蓋檢查閘**（附錄 E），文件寫完逐項勾、確保不漏主題，但**只借它的主題、不借它的順序**（它把 DB 排第 3、本書把資料脊椎排在 §3 的脊椎位）。
> **素材來源**：真實命名由 rev2 三權威文件 ground —— `REVIEW-DATABASE.md`(12-table)、`constitution.md` v1.6.0、`INTEGRATION-DESIGN.md` §1/§4/§5/§6/§7 + 35 specs 實機核對。

---

## §0 — 前言與方法論

【目的】告訴讀者「這本書怎麼讀、為什麼這樣排」，並一次定死預設範式。

- **§0.1 預設範式宣告**：本系統為 **data-centric / Information Engineering / Forms-over-Data**（admin/RBAC 後台的教科書主幹）。**脊椎 = 資料模型**；endpoint / enforce / menu 皆為其投影。**例外（行為島）明列於 §4**，那幾塊改用行為為中心（state-machine）鏡頭。**不主張 DDD**（本系統領域模型 ≈ 資料模型，CRUD/RBAC 使然）。
- **§0.2 四原則**：① 資料模型脊椎（§3 先凍結）② 面矩陣（§5 設計一次每 entity 繼承）③ 三序分離（§8 依賴/交付/風險分開）④ 縱切交付（§9 一 entity 端到端）。
- **§0.3 完整性的五判準**：① 明示預設範式 ② 明示例外（行為島）③ 每部分用對鏡頭 ④ 凍結不變式 ⑤ as-built 誠實。（rev2 有 ④⑤、缺 ①②③ → 這是它「能跑但設計書失準」的全部原因。）
- **§0.4 文件衛生紀律**：本書是**前瞻設計（薄、穩定）**；as-built 實錄走 append-only 的 `MILESTONES`。**設計書不因實作而膨脹**（rev2 DESIGN 膨脹到 247KB = 計畫與實錄混寫）。
- **§0.5 名詞定義**：entity / aspect(面) / island(行為島) / layer(層) / slice(縱切) / track(受管軌道)。

---

## §1 — 功能需求與範圍

【目的】先讓讀者知道「這系統要做什麼」（Google#1）。對 rev3 而言 FR 高度壓縮 = 「對齊 base-web 既有功能」+ constitution。

- **§1.1 範圍宣告**：base-web 為權威（§I.1），rust-api 提供對應 endpoint；「v1 從簡」只是排程、非範圍縮減。
- **§1.2 能力清單**（對映 Google#1，逐項標 rev2 現況/rev3 取捨）：
  - 認證 + RBAC（→ 行為島 §4、面 §5.3）
  - CRUD（user/role/menu/…→ 縱切 §9）
  - **Search / Filter / Pagination**（列為橫切能力 → §5.x；rev2 有 list filter + `{records,total}` pagination）
  - **Dashboard / 即時指標**（rev2 = ops 觀察性 §11；**user-facing dashboard** 是否做 → 待決）
  - **Reporting / 匯出 PDF/CSV**（rev2 **無** → rev3 待決，覆蓋閘會點名）
- **§1.3 非功能需求**：效能/規模/可用性目標（簡述；admin 後台低並發）。
- **§1.4 明確不做**（防 scope creep）：列出 mock-only 行為（§3.6 等）rev3 不模仿者。

---

## §2 — 凍結基盤 (Frozen Substrate)

【目的】carry from `constitution.md` v1.6.0；不可違反基線，改它走 amendment。

- **§2.1 兩條鐵紀律**：① base-web 為權威 ② menu 權限 Casbin enforce。
- **§2.2 §I 核心原則（6 條）**：§I.1 base-web 為權威 / §I.2 menu Casbin enforce / §I.3 wire 對齊 mock（envelope `{data,code,msg}`、code=string、id=string、business `2222`、`Super/Admin/User`）/ §I.4 SDD+TDD 工作流（push/merge 不早於 finishing）/ §I.5 rust-api 全新寫（例外 copy `sea-orm-adapter`+`xdb`、rewrite `axum-casbin`）/ §I.6 業務表審計欄標準。
- **§2.3 §II 12 拍板**（不變式摘要表）。
- **§2.4 base-web 受管例外軌道（§III）**：L1/L2 ADAPT、L3 WRAPPER（`rev2-*` 新檔）、★L4 BUILD-CONFIG（隱藏 demo，已授）、★L4 MODAL-WIRING（views inline 5 用途，已授 v1.3→v1.6）、RUSTAPI-SOURCE-ISOLATION。
- **§2.5 amendment 流程 + 版本規則**：MAJOR/MINOR/PATCH 定義；提案 → user 親決 → 凍結 → 獨立 commit。

---

## §3 — 資料模型脊椎 (Data-Model Spine) ★第一設計章、先凍結

【目的】**全書脊椎**。誠實命名「資料模型」（IE/data-centric，非 DDD domain model）。先設計、先凍結；endpoint / enforce / menu / dashboard / report **皆為其投影**。

### §3.0 設計原則
- **脊椎先行**：12 表 schema 在任何 endpoint 之前定稿、凍結（變更走 §2.5 amendment）。
- **rev3 鐵紀律：§I.6 審計欄 + 治理欄 + BIGSERIAL 序列在「建表當下」就帶齊**——杜絕 rev2 的 014/016/031 事後 ALTER（見 §3.5 retrofit 教訓）。
- 命名一致 `sys_*` 單數（唯一外掛 `system_settings`，沿用 rev2 不改）；IP 用 PG `inet`、payload/buttons/query 用 `jsonb`。

### §3.1 ER 總圖 + 關係
**entity 群組**（依 archetype §3.3 分群；純表格、無字元對齊依賴）：

| 群組（archetype §3.3） | entities（括號 = 欄數） |
|---|---|
| **業務核心** · A：soft-delete + 6 審計欄 | `sys_user`(16) · `sys_role`(12) · `sys_menu`(28) · `system_settings`(10) |
| **關聯** · join | `sys_user_role`(2)：複合 PK · 硬刪 · 零審計 |
| **Session / Token** · C：狀態機 | `sys_token`(9) → §4.1 |
| **審計日誌** · B：append-only · 不可竄改 | `sys_operation_log`(10) · `sys_access_log`(10) · `sys_login_attempt`(9) |
| **RBAC 治理** · D | `casbin_rule`(11) ⇄(revoke / restore) `sys_casbin_policy_archive`(13) → §4.2 |
| 框架 | `seaql_migrations`（sea-orm 內部、35 applied） |

**關係表**（純文字環境看這張即可；CJK 對齊安全、含 FK 決策）：

| from | → to | via / 語意 | FK |
|---|---|---|:---:|
| `sys_user_role.user_id` | `sys_user.id` | M:N join（user 端） | ✅ |
| `sys_user_role.role_id` | `sys_role.id` | M:N join（role 端） | ✅ |
| `casbin_rule.v0` | `sys_role.code` | policy 主體 = role **code 字串** | ❌ 型別不符 |
| `casbin_rule.v1` (v2=`'menu'`) | `sys_menu.route_name` | menu 可見性 policy | ❌ |
| `casbin_rule.v1` (v2=`'button'`) | `sys_menu.buttons[]` code | button 權限 policy | ❌ |
| `casbin_rule` | `sys_casbin_policy_archive` | revoke→移入 / restore←移回（§4.2） | ❌ 同形移動 |
| `sys_menu.parent_id` | `sys_menu.id` | 自參考選單樹 | ❌ |
| `sys_token.user_id` | `sys_user.id` | logical（高 churn） | ❌ |
| `{3 audit log}.operator_id` | `sys_user.id` | logical（容忍歷史 actor） | ❌ |
| `sys_user.current_session_id` | （JWT `sid`，非 DB 列） | session pointer（§4.3） | — |

**其他關鍵事實（表外、rev3 不變）**：① **無 `ptype='g'` 列**（user→role 只走 `sys_user_role`、不入 casbin）② casbin `v3/v4/v5` 由 stock adapter 填 `''`。

**⚠️ FK 決策（建議待覆核；對應開放問題④）**：rev2 全表**零 FK**、RI 全靠 application。rev3 建議改**選擇性 FK**：
- ✅ **加 FK**：`sys_user_role.user_id → sys_user.id`、`sys_user_role.role_id → sys_role.id`——硬刪 join 表、懸空 ref = 真 bug；且兩端皆 soft-delete（列永存）故 FK **永不會擋刪**。
- ❌ **維持零 FK**：(a) audit/log 的 `operator_id`（append-only 熱寫路徑、要容忍任意歷史 actor、FK 增寫負擔）；(b) `sys_token.user_id`（高 churn）；(c) `casbin_rule.v0`（是 role **code 字串**、型別上無法 FK 到 `sys_role.id`）；(d) `sys_menu.parent_id` 自參考樹（自參考 FK 對 reparent/批刪礙事）。
- 未加 FK 處的 application-RI 義務逐條列於 §3.4。

### §3.2 完整資料字典（審計欄走 §3.3 archetype、此處只列「身分 + 業務 + 索引」）
> 全表零 drift（rev2 live-audit 2026-06-09）。`*` = rev3 v1 沿用 rev2、無新增表（見 §3.6）。

| # | 表 (欄數) | PK / 序列 | 身分 + 業務關鍵欄（型別） | 索引 / 約束（PK 外） | 審計 archetype |
|---|---|---|---|---|---|
| 1 | `sys_user` (16) | `id` bigint BIGSERIAL | `user_name` varchar・`password` varchar(argon2id PHC)・`nick_name`・`user_gender` smallint・`user_phone`・`user_email`・`status` smallint・`current_session_id` varchar(36)・`session_policy` varchar(20) NN default `'inherit'` | **partial-uniq** `user_name WHERE deleted_at IS NULL` | A 業務 |
| 2 | `sys_role` (12) | `id` BIGSERIAL | `code` varchar・`name`・`role_desc`・`status` smallint・`home` varchar | **partial-uniq** `code WHERE deleted_at IS NULL` | A 業務 |
| 3 | `sys_menu` (28) | `id` BIGSERIAL | `parent_id` bigint・`route_name`・`menu_type` smallint(1=dir/2=menu)・`menu_name`・`route_path`・`component`・`icon`/`icon_type`・`i18n_key`・`"order"` int・`status`・`hide_in_menu`/`keep_alive`/`constant`/`multi_tab` bool・`href`・`active_menu`・`fixed_index_in_tab`・`query` **jsonb**・`buttons` **jsonb**・`protected` bool NN default false | **partial-uniq** `route_name WHERE deleted_at IS NULL` | A 業務 + D 治理(`protected`) |
| 4 | `system_settings` (10) | `setting_key` **varchar(64) PK**(無序列) | `setting_value`・`value_type`(e.g. `enum:on,off`)・`description` | 無 | A 業務 |
| 5 | `sys_user_role` (2) | **複合** `(user_id,role_id)` | — | 無（硬刪） | C-join（零審計） |
| 6 | `sys_token` (9) | `id` BIGSERIAL | `user_id`・`token_hash` varchar(64)・`rotation_chain` varchar(36)・`status` varchar(20)・`issued_at`/`expires_at`/`used_at` tstz | **uniq** `token_hash`・partial `user_id WHERE status='active'`(非uniq)・`rotation_chain`・`expires_at` | C-狀態機（僅 created_at；§4.1） |
| 7 | `sys_operation_log` (10) | `id` BIGSERIAL | `operation` varchar(20)・`entity_table` varchar(64)・`entity_id` bigint・`payload_before`/`payload_after` **jsonb**・`operator_id`・`operator_ip` **inet**・`trace_id` varchar(64) | 無 | B append-only |
| 8 | `sys_access_log` (10) | `id` BIGSERIAL | `operator_id` NN・`method`/`path` text・`http_status` int・`client_ip` **inet** NN・`x_forwarded_for`・`region`・`trace_id` text | 無 | B append-only |
| 9 | `sys_login_attempt` (9) | `id` BIGSERIAL | `attempted_user_name` text・`success` bool・`operator_id`・`client_ip` **inet** NN・`x_forwarded_for`・`region`・`trace_id` | `(user_name,created_at)`・`(client_ip,created_at)`（lockout） | B append-only |
| 10 | `casbin_rule` (11) | `id` BIGSERIAL | `ptype` varchar(18)('p')・`v0` role-code・`v1` obj・`v2` 維度・`v3..v5` varchar(125) `''`・`protected` bool・`created_at`・`created_by` | **uniq** `(ptype,v0..v5)` | D 治理（adapter-invisible 3 欄） |
| 11 | `sys_casbin_policy_archive` (13) | `id` BIGSERIAL | `ptype`・`v0..v5`(v3-5 default `''`)・`created_at`/`created_by`(原 grant)・`archived_at` NN・`archived_by`・`archive_reason` varchar(32) | `archived_at`・`(v0,v2)` | D 治理-restore-buffer |
| 12 | `seaql_migrations` | framework | (sea-orm 內部、35 applied) | — | — |

### §3.3 審計欄 archetype（定義一次、§3.2 各表繼承）
- **A 業務全 6 審計欄**：`created_at` tstz NN default now()・`created_by` bigint null・`updated_at` tstz null・`updated_by` bigint null・`deleted_at` tstz null・`deleted_by` bigint null。`*_by` = operator **user_id（bigint，非 user_name 字串）**；`*_at`/`*_by` **成對寫**；soft-delete 表配 partial-uniq `WHERE deleted_at IS NULL`。【sys_user / sys_role / sys_menu / system_settings】
- **B append-only 日誌**：只 `created_at` NN（+ `operator_id` 當 domain 欄）；**無 soft-delete、無 update、不可竄改**。【三 log】
- **C join / 狀態機**：`sys_user_role`=零審計（硬刪）；`sys_token`=僅 `created_at` + `status` 狀態機（生命週期見 §4.1）。
- **D 治理變體**：`casbin_rule`=`protected`/`created_at`/`created_by`（**對 stock adapter 隱形**：adapter 的 insert_many/load_policy 不碰這 3 欄）；`archive`=原 grant `created_at/by` + `archived_at/by` + `archive_reason`（**無 update/delete 欄**，restore = 硬刪移回）。

### §3.4 application-RI 義務（零 FK 處的守則）
> 凡 §3.1 未加 FK 的邏輯參照，由 application 在寫入點守，並在此明列（rev2 散落、rev3 集中）：
- `operator_id`（3 log + token + archive）：寫入時取自 RequestContext.user_id，可為 system/seed → null（**容忍**，不驗存在）。
- `casbin_rule.v0` / `archive.v0`：grant 前驗 `sys_role.code` 存在且 active（facade 層）。
- `sys_menu.parent_id`：reparent 時驗目標存在且非自身後代（防環）。
- `sys_user.current_session_id`：指 JWT sid、非 DB 列，**不驗**（session pointer 語意見 §4.3）。

### §3.5 schema 演進紀律（rev3 開局即避 rev2 的 retrofit 債）
**rev2 retrofit 教訓（實證）**：`deleted_at` 在 m003 進 `sys_user`，但其餘審計欄（created/updated/*_by）拖到 **m014** 才補（11 個 migration 的洞），還**被迫**把 `id` 事後改成 BIGSERIAL（因 seed 寫死 id=1/2/3、原 PK 無 default）。`sys_role` 重演（deleted_at m006 / 其餘 m016）。§I.6 約到 **m018** 才凍結 → 故 **m018(sys_menu)/m028(system_settings)/m032(archive) 是僅有「建表即帶全審計欄」的三張**；`sys_user`/`sys_role`/`casbin_rule` 全需晚期 ALTER（最糟 casbin_rule 的治理欄 m031 才 bolt-on、還得設計成 adapter-invisible）。
**rev3 紀律**：① 每張業務表**建表當下**即帶 archetype A 全 6 欄 + BIGSERIAL；② seed 不寫死小 id（用序列）；③ 治理欄（protected/archive）建表即含；④ forward-only：每 migration 有對稱 `down()`；⑤ partial-uniq、命名單數沿用。**目標：rev3 無 m031-035 那種事後 alter。**

### §3.6 ⚠️ 三個新能力的 schema 取捨（v1 建議；對應開放問題⑥）
> 三者在 **v1 建議預設下皆 0 新表**（多為讀投影 / infra）；deferred 形才長表。
- **⚠️ user-facing 儀表板**：v1 = 固定儀表板、純讀既有表聚合（新增 `GET /dashboard/*` read endpoint）、**0 新表**。可配置 widget/版面 → 加 `sys_dashboard_view`（archetype A）、**defer**。
- **⚠️ 報表匯出 (PDF/CSV)**：v1 = on-demand **同步**匯出（handler 內讀 list→格式化、串流回）、**0 新表、非行為島**。排程/非同步 → 加 `sys_report_job`（archetype A + status 狀態機）並**升 §4 行為島**、**defer**。
- **⚠️ AES-256 靜態加密**：v1 = **磁碟/tablespace 層**（PG data dir 落加密卷 / 雲端 at-rest）、**0 schema/code 改、不衝突索引搜尋**。欄位級應用加密 → 新 §5 面 + 金鑰管理（`_FILE` secret + 輪替）+ **加密欄無法 index/搜尋**（衝突 §5.8）、**defer**，除非特定欄非加不可。
- **結論**：**rev3 v1 資料模型 = rev2 同 12 表（一次設計對）**，三新能力 0 新表；其 deferred 形（saved_view / report_job / encrypted-col）登記為未來表、不入 v1 凍結集。

---

## §4 — 行為島模型 (Behavior Islands) ★用 state-machine 鏡頭、非資料鏡頭

【目的】系統裡「行為 > 資料」的少數模組。**先設計 states + transitions + invariants，表只是那台機器的持久化。** 判定法則：有非平凡狀態機 / 「先 X 再 Y 會怎樣」的故事 → 行為島。rev2 的痛正是把唯一真正的行為島（治理 034/035）當「又一張表」排到最後。rev3 共 **3 台狀態機**（持久化於 §3 的 sys_token / casbin_rule+archive / sys_user.session 欄），各自獨立設計。

### §4.1 token rotation chain（持久化 = `sys_token`；rev2 026/027/030）
**state（`sys_token.status`）**：`active → used → revoked`（單向、不回頭）
```
                         ┌── rotate ──> 舊列 active→used (WHERE status=active 守冪等) + 插新列 active(同 rotation_chain)
presented refresh JWT ──>│   (FOR UPDATE 鎖該列、單 txn)
  sha256→token_hash 查 ──┤── benign ──> used 列 & (now-used_at)<30s grace → 插新 active、不動舊、不撤  (雙擊容忍)
                         ├── reuse ───> used 超 grace / revoked / used_at NULL → 撤「整條 rotation_chain」+ warn
                         └── notfound ─> 查無列
```
**transitions（decision seam `decide_rotation`，純函式可測）**：active→Rotate / used&<grace→Benign / used&≥grace→Reuse / used_at=NULL→Reuse（fail-closed）/ 其他 status→Reuse。
**invariants**：① `token_hash` UNIQUE；同秒輪替靠 **per-token `jti`**(uuid，030)使 JWT body byte-distinct 不撞鍵 ② `rotation_chain` = 每次 login 一個 uuid、整鏈共用 ③ grace = `SKEW_MARGIN`/`GRACE_SECS` 常數(30s)、不開 CLI flag ④ 過期實體清理 = on-demand `cleanup-job` binary（`expires_at < now()-60s`、與 status 無關）。
**對外碼**：Rotated/Benign→200+新 pair；Reuse/NotFound→**8888**（乾淨登出、非 5000）；DbErr→5000。handler **絕不回 3333/9999/9998**（會讓前端迴圈）。

### §4.2 policy governance（持久化 = `casbin_rule` ⇄ `sys_casbin_policy_archive`；rev2 034/035）★rev2 唯一 behavior-heavy
**state（policy 列的所在）**：`live in casbin_rule` ⇄ `archived in sys_casbin_policy_archive`
```
grant ─INSERT→ casbin_rule(live)
                  │ revoke (protected? → 拒、整批 Rejected、零變更)
                  ▼ 非 protected: 快照 INSERT archive + DELETE live row   (同 txn)
            archive(buffer) ──restore──> 反向 move 回 casbin_rule(live)、archive 列刪
       set_role_dimension(role,dim,desired[]) = diff(current vs desired) → 批次 revoke + grant (單 txn)
```
**transitions / 操作**：`grant / revoke(→archive) / restore(←archive) / set_role_dimension(diff 整維度) / reload(load_policy+publish)`。
**invariants**：① **DB-first**——寫側只動 DB（casbin_rule/archive）、**不碰 in-memory enforcer**（034 改掉舊的 add/remove_policy 直寫，修非原子稽核）② `protected` 列拒刪 → 整次 `Rejected`、零變更 ③ **`PolicyMutated` gate**：commit 後**只有結構性真變更**才 `reload_and_publish`（Rejected / restore NoOp / NotFound / menu 查無 → 跳；空-diff Applied 仍 reload，035）④ revoke/restore 與審計同 txn 原子；restore 審計記 `{role,target,dimension}`（非懸空 archive_id，035）⑤ reload = 全量 `load_policy()` 重讀 casbin_rule + `PUBLISH casbin:policy:invalidate`（跨實例收斂、§5.6）。
**對外碼**：Applied→0000；Rejected/非法→2222；假 archive id→2222 無審計。
> **rev3 教訓內化**：這台機器在 rev2 被當「又一張 casbin 表」排到 Phase 3 #6、拖到全做完才落地。rev3 用 §4 state-machine 鏡頭**第一輪就設計它**（它的縱切見 §9.3），不混進 §5 CRUD 格子。

### §4.3 single-session lifecycle（持久化 = `sys_user.current_session_id`/`session_policy`；rev2 028/029）
**pointer 真相** = `sys_user.current_session_id`（DB 持久）+ Redis `sess:{uid}` 熱快取（**persist-then-cache**：先寫 DB 必成、再 best-effort 寫 Redis）。**policy 三態** `session_policy`∈{inherit,on,off} × runtime `session_mode`（029，`AppState.session_mode` + `settings:invalidate` 熱切換）。
```
login ─> set_pointer(uid, new sid) ─> (resolve_policy=on?) revoke_other_chains(撤該 user 其他 active rotation_chain)
每受保護讀請求 ─> is_current(claims.sid == pointer?)  ── 不等 & policy on ─> 踢
   resolve_policy: on→比對 / off→永遠 true(不踢、保多裝置) / inherit→隨 session_mode
   is_current FAIL-OPEN: pointer 讀不到(Redis+DB 皆掛) → 回 true (附加檢查、非主 gate)
```
**transitions**：login → `set_pointer` + （policy on 時）`revoke_other_chains`；每請求 `is_current` 收斂。
**invariants**：① pointer 真相在 DB、Redis 僅快取（可失憶、lazy rehydrate）② is_current **fail-OPEN**（不因 backing-store 抖動誤踢）③ `session_mode` 讀 029 runtime store、非靜態 config。
**兩條獨立踢人通道**：**7777** = access 端 `is_current` 失敗的即時 modal 登出（4 個 gate：getUserInfo / getUserRoutes×2 / enforce_mw）；**8888** = refresh 端鏈被撤的乾淨登出（§4.1 reuse 通道）。

### §4.4 行為島紀律
- 每行為島 = 一張 state 圖 + transition 表 + invariant 表 + 對外碼表（如上三節）；**不混進 §5 面矩陣的 CRUD 格子**。
- 縱切時**各自一刀**（§9.3：Token/Session 一刀、Policy-governance 一刀）。
- **⚠️ 潛在第 4 台島（報表非同步，建議 defer）**：若 §3.6 報表升為排程/非同步 → `sys_report_job` 帶 `queued→running→done→failed` 狀態機，屆時**升格為 §4.4 行為島**、用同款鏡頭設計；v1 同步匯出不觸發、不立此島。

---

## §5 — 面矩陣 (Aspect Matrix) ★橫切、設計一次每 data island 繼承

【目的】正交維度、貫穿每個 entity，**不是某 Phase 的交付物**。設計一個 data island 時逐面對照 §5.0 打勾——面是 entity 設計的一部分、不是「之後再加」。

### §5.0 entity × aspect 總矩陣
> ✓=套用 ・—=不套用 ・(變體) ・U=universal(每端點/每列都套，不逐格標)。審計欄欄位走 §3.3 archetype。
> **universal 面**（不入下表逐格）：**§5.4 envelope**（每個 API）、**§5.5 single-session gate**（每受保護讀端）、**§5.10 AES at-rest**（v1 磁碟層、全庫一致）。

| entity | §5.1 soft-del | §5.2 寫 op-log 審計 | §5.3 endpoint enforce | §5.8 search/filter/page | §5.9 region/xdb | 審計 archetype(§3.3) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `sys_user` | ✓ | ✓(CRUD) | ✓(`/systemManage/*User*`) | ✓(getUserList) | — | A |
| `sys_role` | ✓ | ✓ | ✓ | ✓(getRoleList) | — | A |
| `sys_menu` | ✓ | ✓ | ✓ | ✓(getMenuList) | — | A + D(protected) |
| `system_settings` | ✓ | ✓ | ✓(Super) | — | — | A |
| `sys_user_role` | —(硬刪) | ✓(隨 user/role 寫) | —(無獨立端點) | — | — | C(零) |
| `sys_token` | —(status 機) | —(內部、不入 op-log) | —(/auth/* 開放) | — | — | C(created_at) |
| `sys_operation_log` | — | —(它是 sink) | ✓(讀端 Super) | ✓(查審計) | — | B |
| `sys_access_log` | — | — | ✓(讀端) | ✓ | ✓(client_ip→region) | B |
| `sys_login_attempt` | — | — | ✓(讀端) | ✓ | ✓ | B |
| `casbin_rule` | —(revoke=move) | ✓(治理寫、§4.2) | ✓(治理端 Super) | (archive 頁查) | — | D |
| `sys_casbin_policy_archive` | —(進/全離) | ✓(restore 寫) | ✓(回收桶 Super) | ✓(getArchived) | — | D-buffer |

### §5.1 soft-delete
`deleted_at` + partial-uniq `WHERE deleted_at IS NULL` + **facade triple-guard**：`SoftDeletable` trait 封 `find_active`/`update_active`/`soft_delete` → `model/facade/` **不 re-export Entity** → CI grep lint 禁 `server/src` 內 `entity::` token。【4 業務表】

### §5.2 統一審計（mutation）
mutation → `sys_operation_log`：`audit::mutate_in_txn` 泛型 wrapper **同 txn** 寫 before/after 快照 + operator + trace；`AuditSerialize` trait 對敏感欄（password）redact 成 `"<redacted>"`；`audit.rs` 本身不 import entity（守 lint）。**HTTP/region 軌另走** `sys_access_log`（`audit_ctx` 中介層 + xdb，§5.9）——**兩 sink = 縱切兩刀（§9.3 地基）**。

### §5.3 RBAC Casbin enforce
`casbin_rule` 單表三維度（`v2`= HTTP method→endpoint / `'menu'`→可見性 / `'button'`→按鈕）；RBAC model = `r=p=sub,obj,act`、matcher **三欄精確相等**（無 glob）、`R_SUPER` **逐端點列、無 `*` subject**；cached enforcer（moka LRU keyed `(role,path,method)`）；`enforce_mw` per-route route_layer，subject = **DB-fresh role code**（非 JWT claims）。menu 走 `enforce((role,name,'menu'))`、button 走 `get_filtered_policy`（讀已載 policy、非 enforce）。詳機制與 §10 安全互引。

### §5.4 response envelope（universal）
`{data, code, msg}`（**無 success bool**、`code`=**字串** `"0000"`）；`Role.id`/`MenuRoute.id`=**字串**；business 錯 = **`2222`**、`5xxx`=auth/infra（`5003`=403/`5000`=500）、`3333/8888/7777` 為 auth 專用碼（§4）；`MenuType` 1=dir/2=menu；`Status` nullable。對齊 mock ground truth（§I.3）。

### §5.5 single-session gate（universal、機制在 §4.3）
每受保護讀端在 verify 後、業務前掛 `is_current` gate（不過 → 7777）。橫切義務：4 個 gate 點（getUserInfo / getUserRoutes×2 / enforce_mw）一致掛載；此面只規定「掛」，狀態機本體在 §4.3。

### §5.6 system-settings 熱 KV + redis pub-sub invalidation
`system_settings` 為 runtime KV（`AppState` boot 載）；兩 channel **`casbin:policy:invalidate`**（§4.2 reload）/ **`settings:invalidate`**（session_mode 熱切換）+ 對應 watcher（獨立 pub-sub 連線訂閱、共享連線發布）。**v1 單實例即啟用**（一致性優先、不分環境）。

### §5.7 審計欄標準（§I.6，定義見 §3.3）
6 欄 paired 寫、`*_by`=operator user_id（bigint，非字串）；archetype B/C 例外。**rev3：建表即帶（§3.5）**。

### §5.8 Search / Filter / Pagination（補 Google#1 橫切能力）
list 端統一 `*SearchParams` filter DTO + `{records, total}` wrapper（envelope 內）；page 正規化（page/pageSize 邊界）；**索引策略**：常查欄建 btree（如 login_attempt 的 `(user_name,created_at)`/`(client_ip,created_at)`、archive 的 `(v0,v2)`）；**注意**：若 §3.6 採欄位級 AES（§5.10），加密欄**無法**走 filter/index → 設計時標明哪些欄可查。

### §5.9 region / xdb（次要面）
`xdb` sub-crate 由直連 `client_ip` 解析地區（**非** XFF）；dev/docker 私有 IP 仍解析為「内网IP」（非 NULL）。只套用於 `sys_access_log` / `sys_login_attempt`（兩表帶 `client_ip inet` + `region`）。

### §5.10 ⚠️ AES-256 靜態加密（universal、新面；對應 §3.6）
**v1 建議 = 磁碟/tablespace 層**：PG data dir 落加密卷（或雲端 at-rest）、**全庫一致、0 schema/code 改、不衝突 §5.8 index/搜尋**。金鑰 = 平台/雲 KMS 管。
**⚠️ deferred = 欄位級應用加密**：facade 讀寫對 tagged 欄 encrypt/decrypt + 金鑰 `_FILE` secret + 輪替；**代價**：加密欄不可 index/filter（衝突 §5.8）、查詢退化。**建議 v1 不做欄位級**，除非特定欄（如 user_phone/email）有法遵要求——屆時逐欄標記、並在 §5.8 排除其 filter。

---

## §6 — 前端 UI/UX (補 Google#4)

【目的】admin 系統一半是前端。rev2 因 base-web 為權威 → 此章是「**對既有 base-web 的 screen inventory + 受管接線**」，非 from-scratch。

- **§6.1 screen inventory**：base-web 既有頁面清單（login / home / manage/{user,role,menu,role-button,…}）+ 各頁對應 endpoint。
- **§6.2 user flows**：登入→getUserInfo→動態路由→各 manage 頁；踢人 modal（7777）流程。
- **§6.3 元件與設計系統**：naive-ui（base-web 既用）；新頁鏡像既有 manage/ pattern（MODAL-WIRING use (e)）。
- **§6.4 接線軌道對照**：哪些 UI 改動落 L1/L2 ADAPT、L3 WRAPPER、★L4 MODAL-WIRING（§2.4）；「新增不改 inline」紀律。
- **§6.5 wireframe（新頁才需）**：rev3 若加 user-facing dashboard / reporting → 低保真草圖；既有頁沿用不畫。

---

## §7 — wire contract (介面契約) ★first-class 受控產物

【目的】補 rev2 §9.1 grep 人工守的痛點，升為可機器校驗的契約。base-web 為權威 → wire 由前端期望定義（§6 → §7）。

- **§7.1 endpoint 全集**：method/path/req/res 對照（對齊 mock ground truth）。
- **§7.2 三端對齊機制**：rust DTO ↔ `service/api/*.ts` inline type + `typings/api/*.d.ts` ↔ component state，**單一可生成/校驗來源**（OpenAPI 之類；待決問題②）。
- **§7.3 envelope / pagination / error-code 完整矩陣**（與 §5.4 互引）。
- **§7.4 部署層 wire 細節**：nginx `/api` strip → rust-api root routes；prod `/api/*` prefix 來源（build-arg）。

---

## §8 — 三序分離 (Three Orders) ★別把排程當架構（含 System Architecture, Google#2）

【目的】rev2 致命傷在此。三種順序分開畫、分開命名。

- **§8.1 依賴序 — 架構層級 DAG（真 DAG、凍結）**：按**層**畫、非 feature。as-built 校正版（採真實命名）：
  ```
  L0 INFRA-STATIC (config.rs + docker/deploy/secrets)
  L1 RUNTIME-INFRA (infra/db.rs · infra/redis.rs · state.rs · envelope/error〔L1 側軌、僅依 serde〕)
  L2 DATA (entity/ crate 12 表 · migration/ crate)
  L3 PLATFORM SUB-CRATES (sea-orm-adapter · xdb)
  L4 FACADE (model/facade/* — 唯一 entity 存取閘、009 lint)
  L5 AUTH/DOMAIN PRIMITIVES (auth/{jwt,password,session,button_auth,endpoint_auth,menu_auth,policy_governance} · route/menu.rs)
  L6 HANDLER (handler/{auth,route,system_manage})
  L7 ROUTER+MIDDLEWARE (flat in main.rs · per-route route_layer〔bearer→enforce〕· audit_ctx global)
  L8 BACKGROUND (policy_watcher · settings_watcher · cleanup-job binary)
  L9 OBSERVABILITY (tracing JSON · /metrics · obs/metrics compose profiles)
  ```
  - **跨層邊**：envelope/error = L1 側軌（每層回 `Res<T>`）；xdb(L3)→L7 mw；sea-orm-adapter(L3) 被 L1 boot 載 + L5/L8 mutate（policy 持久脊椎 L1→L4→L8）。
  - **as-built 校正（rev3 必須採真實命名、丟掉 rev2 §4.2/§5.2 提案）**：① **無 `axum-casbin` crate**（enforce 在 `auth/enforce.rs`）② **無 service 層**（handler 直呼 facade）③ **router flat-in-`main.rs`**（無 `router/` 樹；`route/menu.rs` 是選單樹 builder）④ `model/` 拆 `entity/` crate + `server/src/model/facade/`。
  - **§8.1a 技術棧**（Google#2）：Rust axum + SeaORM + Casbin + Postgres + Redis；Vue3 + naive-ui；nginx 單入口；docker-compose（dev/prod profile）。
- **§8.2 交付序 — roadmap / Gantt（明示可變）**：哪個 slice 先上，**標「預期會調整」、絕不叫硬依賴**。
- **§8.3 風險序 — de-risk 優先**：最不確定處先打樣——候選：policy 治理島形狀（§4.2）、wire 三端對齊、casbin adapter 行為、single-session 跨實例。
- **§8.4 三序互動**：依賴序限制交付序合法排列；風險序在合法集內挑。三者不可壓成一張圖（rev2 的錯）。

---

## §9 — 縱切交付 (Vertical-Slice Delivery)

【目的】一 entity 端到端 + 所有面一次碰頭，在最便宜時暴露整合（rev2 拖到 034 才發現治理層要重弄）。

- **§9.1 縱切原則**：一刀 = entity → migration → facade → handler → router → policy(enforce) → wire → test → frontend，逐面套 §5.0。
- **§9.2 第一刀建議**：User 縱切（或更小的 `system_settings` 打樣，待決問題③）——把 RBAC+audit+enforce+envelope 整合在 feature 1 逼出來。
- **§9.3 entity 縱切清單**（rev2 35 work item 用 entity 重切；`*`=跨切；行為島各自一刀）：
  ```
  〔跨切地基〕Infra/deploy(001-007,010,012) · Envelope(008) · Soft-delete(009) · Audit(011 op-log / 015 access-log+xdb 〔2 entity=2 刀〕)
  〔data island 縱切〕
    User    016* 017          Role  016* 018      〔016 一 feature 兩 entity → 縱切應拆兩刀〕
    Menu    014〔runtime 讀〕 019 020 021 025
  〔行為島縱切（用 §4 鏡頭）〕
    Auth/Token/Session  013 026 027 028 029 030〔cleanup-job=本縱切 L8 binary〕
    Policy-governance   034 035〔casbin_rule 治理欄 + archive〕
    Button/Endpoint     022 023 024〔純 casbin policy、無新 entity〕
  〔包覆全體〕Observability  031 032〔/metrics in-process〕 033
  ```
- **§9.4 縱切 vs rev2 Phase 對照**：同工作量、橫 phase → 縱 entity；標 016/030/032 的重切。
- **§9.5 每刀的 SDD+TDD 工作流**：Phase 0 brainstorm → specify/clarify/plan/tasks/analyze → executing-plans → finishing。

---

## §10 — 安全與合規 (Security & Compliance, 補 Google#5)

【目的】把散在各處的安全主題收一章；RBAC 機制本體在 §5.3，此處是「安全姿態」總覽。

- **§10.1 存取控制**：RBAC Casbin enforce（→ §5.3）、Super-only 治理端點、§10 預設無 R_USER_COMMON 可見性。
- **§10.2 傳輸加密**：TLS（dev 自簽 / prod acme）；nginx 80→443 redirect。
- **§10.3 靜態 / 機密**：secrets 走 `_FILE` pattern（不入 image/repo）；密碼 argon2id；JWT secret strict validation。**靜態資料加密（AES-256）= rev2 無 → rev3 待決**（覆蓋閘點名）。
- **§10.4 審計 trail**：三 audit log（op/access/login-attempt）append-only、不可竄改。
- **§10.5 合規姿態**：rev2 = 自架 admin、無 GDPR/HIPAA 義務；rev3 若對外/多租戶 → 補資料保留/刪除權/PII 標記（**待決**）。

---

## §11 — 部署與運維 (薄、多引用)

- **§11.1 拓撲 / port / secret**：單入口 nginx；2XXXX port；compose dev/prod/profile。
- **§11.2 observability 三段式**：obs-min(log) / obs-full(metrics) / dashboard，profile-gated。
- **§11.3 背景工作**：policy/settings watcher（redis pub-sub）+ cleanup-job（on-demand binary）。
- **§11.4 DB migration + 自動套**：migration crate、010 自動套、server 不自動 migrate。

---

# 附錄

- **附錄 A — rev2→rev3 命名映射**：改名觸點（`.gitmodules` / `.graphifyignore` / `CLAUDE.md` / `docker-compose*` / `deploy/*` 等 13 檔；短名/長名表）。
- **附錄 B — rev2 方法論 post-mortem**：DAG 失準（Phase 3 #6 治理拖到 Phase 4/5/6 後才落地 = 034/035）+ schema 後補（REVIEW-DATABASE 反推）—— **本書四原則的由來**。
- **附錄 C — schema smell 清單（rev3 開局即避）**：零 FK、治理欄對 adapter 隱形、`is_seed_menu` code-guard→`protected` data-driven、migration 路徑 typo、`system_settings` 命名外掛。
- **附錄 D — 與 rev2 文件對應**：本書各章 ← `INTEGRATION-DESIGN.md` / `constitution.md` / `REVIEW-DATABASE.md` / `MOCK-COVERAGE-AUDIT.md` 的來源錨。
- **附錄 E — ✓ Google-5 覆蓋 gate**：文件寫完，拿這 5 點逐項勾（確保廣度不漏；本書借主題不借順序）：
  | Google 主題 | 對映本書 | 狀態 |
  |---|---|---|
  | 1 Functional Requirements | §1（+ search/filter §5.8、reporting 待決） | 勾 |
  | 2 System Architecture | §8.1 層級 DAG + §8.1a 技術棧 + §11 | 勾 |
  | 3 Database Design | §3 資料模型脊椎（當脊椎、非 bucket#3；FK 待決④） | 勾 |
  | 4 UI/UX Design | §6（base-web 為權威 → inventory/adapt/元件） | 勾 |
  | 5 Security & Compliance | §10 + §5.3 RBAC | 勾（AES-rest / 合規 待決） |

---

## 待討論 / 開放問題（下一輪）

1. **router 結構**：維持 flat-in-main（as-built）還是復原 §5.2 nested 意圖？
2. **wire contract 引入 OpenAPI/code-gen 嗎**（§7.2）？rev2 反覆 bug 源，值不值得這層投資。
3. **縱切第一刀**：User 還是更小的 `system_settings` 打樣？
4. **領域模型引入真 FK 嗎**（§3.1）？rev2 刻意零 FK 保 audit 歷史；rev3 非 audit 表是否加 FK。
5. **§3/§5 凍結邊界**：哪些進 constitution（不可動）、哪些留設計書（可動）？
6. **新增能力取捨**（§1.2）：user-facing dashboard / reporting(PDF/CSV) / 靜態加密 / 合規——rev3 要不要做？
