# REVIEW-DATABASE — 活體資料庫 vs migration 源 稽核報告

> 稽核日期:2026-06-06
> 方法:`pg_dump --schema-only`(活體 ground truth)vs `rust-api/migration/src` 逐表 reconcile(欄 / 索引 / 約束 provenance + drift)
> 結論:**全 11 表、29 migration 全套用、schema 零 drift;種子 baseline 完整(活體含全部種子,偏離皆為 runtime 業務 / 測試殘留)。**
> **本報告兩部分**:① 前半 = **schema(DDL)稽核**(表 / 欄 / 索引 / 約束);② 後半 = **「種子資料(seed data)」稽核**(各 migration 的 INSERT / UPDATE 種子 + 活體 reconcile + dev DB 測試殘留 finding)。

---

## Overview

本報告對 rev2 後端活體 PostgreSQL schema 做一次完整稽核,確認活體 DB 的每一張表、每一欄、每一個索引與約束,都能逐項對齊 `rust-api/migration/src` 內的 migration 意圖,沒有任何漂移(drift)。

- **活體 DB**:`postgres:17-alpine`,db = `soybean_admin_rust`,user = `soybean`,container = `rev2-admin-postgres-1`,host port `25432`(容器內 `:5432`)。
- **表數**:11 張 — `casbin_rule` / `seaql_migrations` / `sys_access_log` / `sys_login_attempt` / `sys_menu` / `sys_operation_log` / `sys_role` / `sys_token` / `sys_user` / `sys_user_role` / `system_settings`。
- **migration**:`seaql_migrations`(sea-orm 內部追蹤表、無對應 migration 檔)記錄 **全 29 個 migration(`m000001` ~ `m000029`)皆已套用**。
- **稽核方法**:以 `pg_dump --schema-only` 抓活體 schema 作 ground truth,對每張表逐欄 / 逐索引 / 逐約束回溯到產生它的 migration(provenance),並標 `MATCH` / `LIVE_ONLY` / `MIGRATION_ONLY` / 型不符。
- **稽核範圍**:本報告詳列其中 10 張業務 / 基礎設施表;`seaql_migrations` 為 sea-orm 框架內部表(無對應 migration 檔),僅作為「29 migration 全套用」的證據來源,不單獨展開欄位比對。

---

## 總覽表

| 表名 | 用途 | 來源 feature / migration | 欄數 | verdict | row 數 |
|---|---|---|---:|:---:|---:|
| `sys_user` | 系統使用者帳號主表(登入 / 身分 / RBAC user 端 + soft-delete + 業務欄 + 審計欄 + single-session) | 001 建表 → 003 / 008 / 014 / 027(feature 007/009/013/014/028) | 16 | MATCH | 15 |
| `sys_role` | RBAC 角色表(code/name/home/status + 審計欄) | 006 建表 → 016 / 021 | 12 | MATCH | 6 |
| `sys_menu` | 後台選單 / 路由樹主表(menu/route 元資料 + button 權限) | 018 建表(feature 018) | 27 | MATCH | 12 |
| `sys_token` | refresh token rotation chain 持久化(session/token 基礎設施) | 026 建表(feature 027) | 9 | MATCH | 72 |
| `sys_user_role` | user↔role 多對多 join 表(複合 PK、硬刪) | 007 建表(feature 013) | 2 | MATCH | 13 |
| `sys_operation_log` | append-only 操作審計日誌(CRUD before/after + 操作者 + trace) | 004 建表 | 10 | MATCH | 160 |
| `sys_access_log` | append-only 存取審計(method/path/status/ip/region/trace) | 011 建表(feature 015) | 10 | MATCH | 1401 |
| `sys_login_attempt` | append-only 登入嘗試審計(成敗 / IP / region,供 lockout) | 012 建表 | 9 | MATCH | 345 |
| `system_settings` | 系統設定 KV 地基表(setting_key/value/type + 審計欄) | 028 建表(feature 028/029) | 10 | MATCH | 1 |
| `casbin_rule` | Casbin RBAC policy storage(sea-orm-adapter 標準格式) | 005 委派 adapter DDL,009 seed | 8 | MATCH | 69 |
| `seaql_migrations` | sea-orm migration 追蹤表(框架內部) | 無對應 migration 檔 | — | — | 29 |

> **row 數為精確 `count(*)`**(2026-06-06)。初稿曾用 `pg_stat_user_tables.n_live_tup`(VACUUM 估計值)、有 4 處偏差,已校正:`casbin_rule` 70→69、`sys_role` 3→6、`sys_user_role` 4→13、`sys_operation_log` 161→160。row 數含 runtime + 測試殘留(非全為種子),詳見後半「種子資料」§活體 vs 種子 reconcile。

---

## sys_user

系統使用者帳號主表(登入 / 身分 / RBAC user 端 + soft-delete + 業務欄 + §I.6 審計欄 + single-session 政策)。

**來源**:由 001 `create_sys_user` 建表(id/user_name/password);003 softdelete 加 `deleted_at` + 改 partial unique;008 加 `nick_name`;014 business_audit 加 4 業務欄 + 5 審計欄 + `id` BIGSERIAL(sequence + default);027 session 加 `current_session_id` / `session_policy`。對應 feature 007/009/013/014(業務審計)/028(session)。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源 | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_user_id_seq')` | 001(big_integer PK)+ 014(b) 補 sequence + SET DEFAULT | MATCH |
| `user_name` | character varying | NOT NULL | — | 001(string not_null unique;欄級 unique 後由 003 改 partial) | MATCH |
| `password` | character varying | NOT NULL | — | 001(string not_null) | MATCH |
| `deleted_at` | timestamptz | NULL | — | 003 softdelete(timestamptz null) | MATCH |
| `nick_name` | character varying | NULL | — | 008 alter_sys_user_nick_name(string null) | MATCH |
| `user_gender` | smallint | NULL | — | 014 (a)(small_integer null) | MATCH |
| `user_phone` | character varying | NULL | — | 014 (a)(string null) | MATCH |
| `user_email` | character varying | NULL | — | 014 (a)(string null) | MATCH |
| `status` | smallint | NULL | — | 014 (a)(small_integer null);(c) seed 回填 status=1 | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | 014 (a)(not_null default current_timestamp) | MATCH |
| `created_by` | bigint | NULL | — | 014 (a)(big_integer null) | MATCH |
| `updated_by` | bigint | NULL | — | 014 (a)(big_integer null) | MATCH |
| `deleted_by` | bigint | NULL | — | 014 (a)(big_integer null) | MATCH |
| `updated_at` | timestamptz | NULL | — | 014 (a)(timestamptz null) | MATCH |
| `current_session_id` | character varying(36) | NULL | — | 027 alter_sys_user_session(string_len(36) null) | MATCH |
| `session_policy` | character varying(20) | NOT NULL | `'inherit'` | 027 alter_sys_user_session(string_len(20) not_null default 'inherit') | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_user_pkey` | PK | PRIMARY KEY btree (id) | 001(`.primary_key()` on id) | MATCH |
| `sys_user_user_name_active_uniq` | UNIQUE(partial) | UNIQUE btree (user_name) WHERE deleted_at IS NULL | 003 raw SQL `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`(drop 欄級 `sys_user_user_name_key` 後建) | MATCH |

### Notes

全 16 欄 + PK + partial unique index 逐項對齊 5 個 migration 疊加意圖,零 drift。重點:

1. **§I.6 六審計欄齊全但跨 migration 落地**:`deleted_at` 由 003(soft-delete)先建,其餘 5 欄(created_at / created_by / updated_by / deleted_by / updated_at)由 014 補;014 已自註此分工(註 d)。
2. **欄序歷史**:014 add_column 順序為 created_at→created_by→updated_by→deleted_by→updated_at,故 live 中 `updated_by` / `deleted_by`(pos 12-13)排在 `updated_at`(pos 14)之前 — 純欄序,非 drift。
3. **id sequence**:001 建純 big_integer PK(無 sequence),BIGSERIAL 行為由 014(b) raw SQL 補 `sys_user_id_seq` + SET DEFAULT;live sequence START WITH 1 + `setval is_called` 在 runtime 跑(dump 不顯 setval),語意正確避開 seed 1/2/3。
4. **欄級 unique 移除**:001 原 `sys_user_user_name_key` 已被 003 drop,live 正確不存在,改為 active-only partial unique(soft-delete 友善);014 註(d)刻意不重建 user_name unique 避免冗餘。
5. **FK**:`created_by` / `updated_by` / `deleted_by` / `current_session_id` 皆無 FK,migration 也未定義 FK,一致(rev2 審計欄慣例:大整數 ref 不強制 FK)。
6. **型選擇**:`.string()` → 無長度 character varying;session 兩欄刻意用 `string_len(36/20)` 有界,皆與 live 一致。

---

## sys_role

RBAC 角色表:存系統角色(code/name/home/status + §I.6 審計欄),與 `sys_user_role` / `casbin_rule` 串接權限。

**來源**:006 create-sys-role(建表 + partial unique index + seed 3 角色 R_SUPER/R_ADMIN/R_USER_COMMON)→ 016 alter-business-audit(補 role_desc/status 業務欄 + §I.6 審計欄 5 欄)→ 021 alter-home-seed-menu-auth-policy(加 home 欄 + menu-auth 4 端點 Casbin policy seed)。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源 | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_role_id_seq')` | 006(big_integer auto_increment primary_key) | MATCH |
| `code` | character varying | NOT NULL | — | 006(string not_null) | MATCH |
| `name` | character varying | NOT NULL | — | 006(string not_null) | MATCH |
| `deleted_at` | timestamptz | NULL | — | 006(timestamptz null,§I.6 soft-delete,建表時即加) | MATCH |
| `role_desc` | character varying | NULL | — | 016 business_audit(string null) | MATCH |
| `status` | smallint | NULL | — | 016(small_integer null;up 內 UPDATE id IN(1,2,3) SET status=1 回填,非 DEFAULT) | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | 016(not_null default current_timestamp,§I.6) | MATCH |
| `created_by` | bigint | NULL | — | 016(big_integer null,§I.6,無 FK) | MATCH |
| `updated_by` | bigint | NULL | — | 016(big_integer null,§I.6,無 FK) | MATCH |
| `deleted_by` | bigint | NULL | — | 016(big_integer null,§I.6,無 FK) | MATCH |
| `updated_at` | timestamptz | NULL | — | 016(timestamptz null,§I.6) | MATCH |
| `home` | character varying | NULL | — | 021(string null;up 內 UPDATE SET home='home' 全角色回填,非 DEFAULT) | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_role_pkey` | PK | PRIMARY KEY btree (id) | 006(big_integer auto_increment primary_key) | MATCH |
| `sys_role_code_active_uniq` | UNIQUE(partial) | UNIQUE btree (code) WHERE deleted_at IS NULL | 006 raw SQL `CREATE UNIQUE INDEX sys_role_code_active_uniq ON sys_role (code) WHERE deleted_at IS NULL` | MATCH |

### Notes

逐欄 12/12 全 MATCH,索引 1/1、約束 1/1 MATCH。重點:

1. **欄序**:016 的 5 個審計欄按 add_column 呼叫序(created_by→updated_by→deleted_by→updated_at)落地,故活體 `deleted_by` 在 `updated_at` 之前 —— 與 migration 呼叫序一致、非 drift。
2. **§I.6 六審計欄完整**:`deleted_at` 在 006 建表即加(與 sys_user 等表 016 才補審計欄不同,deleted_at 提前到 006),其餘 created_at / created_by / updated_at / updated_by / deleted_by 由 016 補。
3. **FK**:created_by / updated_by / deleted_by 為 nullable bigint 且無 FK(live `\d+` 無 Foreign-key constraints 段),符合本 codebase 審計欄不掛 FK 的慣例。
4. **partial unique index** 走 raw SQL(與 006 sys_menu / 003 等 partial index 寫法一致),live WHERE 子句逐字對齊。
5. **種子值由 UPDATE 回填**:status / home 的種子值由 up migration 內 UPDATE 回填(非欄 DEFAULT),故 live default 欄為空 —— 正確、非 drift。
6. 指派路徑 `m20260529_0000006/0000016/0000021`(多一個 0)實際檔名為 `m20260529_000006/000016/000021`,內容無誤。

---

## sys_menu

後台選單 / 路由樹主表(menu/route 元資料 + 每節點 button 權限與 query 參數),驅動 getUserRoutes / getConstantRoutes 與 menu CRUD。

**來源**:由 feature 018(`m20260529_000018_create_sys_menu`)一次建立(§I.6 凍結後首張新建業務表,單一 create migration、無後續 alter)。後續 019/020/021/024/025 為 casbin policy seed,不改 schema。種子資料(home/manage + 4 children)亦於 018 內以 raw INSERT 植入。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(018 create_sys_menu) | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_menu_id_seq')` | Id big_integer auto_increment primary_key | MATCH |
| `parent_id` | bigint | NULL | — | ParentId big_integer null | MATCH |
| `route_name` | character varying | NOT NULL | — | RouteName string not_null | MATCH |
| `menu_type` | smallint | NULL | — | MenuType small_integer null | MATCH |
| `menu_name` | character varying | NOT NULL | — | MenuName string not_null | MATCH |
| `route_path` | character varying | NULL | — | RoutePath string null | MATCH |
| `component` | character varying | NULL | — | Component string null | MATCH |
| `icon` | character varying | NULL | — | Icon string null | MATCH |
| `icon_type` | smallint | NULL | — | IconType small_integer null | MATCH |
| `i18n_key` | character varying | NULL | — | I18nKey string null | MATCH |
| `order` | integer | NULL | — | Order integer null(SQL 保留字,sea-query 輸出 `"order"`) | MATCH |
| `status` | smallint | NULL | — | Status small_integer null | MATCH |
| `hide_in_menu` | boolean | NULL | — | HideInMenu boolean null | MATCH |
| `keep_alive` | boolean | NULL | — | KeepAlive boolean null | MATCH |
| `constant` | boolean | NULL | — | Constant boolean null | MATCH |
| `multi_tab` | boolean | NULL | — | MultiTab boolean null | MATCH |
| `href` | character varying | NULL | — | Href string null | MATCH |
| `active_menu` | character varying | NULL | — | ActiveMenu string null | MATCH |
| `fixed_index_in_tab` | integer | NULL | — | FixedIndexInTab integer null | MATCH |
| `query` | jsonb | NULL | — | Query json_binary null | MATCH |
| `buttons` | jsonb | NULL | — | Buttons json_binary null | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | CreatedAt not_null default current_timestamp | MATCH |
| `created_by` | bigint | NULL | — | CreatedBy big_integer null | MATCH |
| `updated_at` | timestamptz | NULL | — | UpdatedAt timestamptz null | MATCH |
| `updated_by` | bigint | NULL | — | UpdatedBy big_integer null | MATCH |
| `deleted_at` | timestamptz | NULL | — | DeletedAt timestamptz null | MATCH |
| `deleted_by` | bigint | NULL | — | DeletedBy big_integer null | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_menu_pkey` | PK | PRIMARY KEY btree (id) | 018(Id `.primary_key()`) | MATCH |
| `sys_menu_route_name_active_uniq` | UNIQUE(partial) | UNIQUE btree (route_name) WHERE deleted_at IS NULL | 018 step 2 raw `execute_unprepared` partial unique index | MATCH |

### Notes

全 27 欄活體與 migration 意圖逐欄 1:1 對齊(欄序亦完全一致),型映射全正確(`.string()`→character varying 無長度、`.small_integer()`→smallint、`.json_binary()`→jsonb、`.timestamp_with_time_zone()`→timestamptz、`.big_integer()`→bigint)。重點:

1. **§I.6 六審計欄一次到位**:created_at / created_by / updated_at / updated_by / deleted_at / deleted_by 於 018 一次建立(凍結後首張新建表、forward-only 無 retrofit),其中僅 `created_at` NOT NULL + DEFAULT CURRENT_TIMESTAMP,其餘 5 審計欄皆 nullable 無 default。
2. **FK**:migration create_table 未宣告任何 `.foreign_key()`,活體亦無 FK — parent_id / created_by / updated_by / deleted_by 皆裸 bigint(audit / 自參照欄不設 FK 之專案慣例)。
3. **partial unique index** 走 raw `execute_unprepared`(對齊 006 寫法),活體定義逐字一致。
4. 種子 6 列(home/manage + manage_user/manage_role/manage_menu/manage_user-detail)於 018 內 raw INSERT,屬資料非 schema、不影響 reconcile。
5. 指派路徑筆誤(`m20260529_0000018`,多一個 0);實際檔為 `m20260529_000018_create_sys_menu.rs`。無任何 LIVE_ONLY / MIGRATION_ONLY / 型不符。

---

## sys_token

session / token 基礎設施表 — refresh token rotation chain 的持久化儲存(token_hash + rotation_chain + status 狀態機 + 時間戳)。

**來源**:feature 027 refresh-token-rotation;僅由 migration 026(`m20260529_000026_create_sys_token.rs`)建立,無任何後續 alter_* 觸及此表。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(026 create_sys_token) | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_token_id_seq')` | Id big_integer auto_increment primary_key | MATCH |
| `user_id` | bigint | NOT NULL | — | UserId big_integer not_null | MATCH |
| `token_hash` | character varying(64) | NOT NULL | — | TokenHash string_len(64) not_null unique_key | MATCH |
| `rotation_chain` | character varying(36) | NOT NULL | — | RotationChain string_len(36) not_null | MATCH |
| `status` | character varying(20) | NOT NULL | — | Status string_len(20) not_null | MATCH |
| `issued_at` | timestamptz | NOT NULL | — | IssuedAt timestamptz not_null | MATCH |
| `expires_at` | timestamptz | NOT NULL | — | ExpiresAt timestamptz not_null | MATCH |
| `used_at` | timestamptz | NULL | — | UsedAt timestamptz null | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | CreatedAt not_null default current_timestamp | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_token_pkey` | PK | PRIMARY KEY btree (id) | 026(Id `.primary_key()`) | MATCH |
| `sys_token_token_hash_key` | UNIQUE | UNIQUE btree (token_hash) | 026(TokenHash `.unique_key()`) | MATCH |
| `idx_sys_token_user_active` | INDEX(partial) | btree (user_id) WHERE status='active'(non-unique) | 026 raw `execute_unprepared: CREATE INDEX ... WHERE status = 'active'` | MATCH |
| `idx_sys_token_chain` | INDEX | btree (rotation_chain) | 026 create_index DSL(col RotationChain) | MATCH |

### Notes

完全 reconcile,9 欄 + 4 索引 + 2 約束全 MATCH,零 drift。重點:

1. **指派路徑校正**:prompt 給的 `m20260529_0000026_...`(7 個 0)實際不存在;真實檔為 `m20260529_000026_create_sys_token.rs`(6 個 0,3910 bytes),已在 lib.rs:28/64 註冊。
2. **三索引 provenance 各走不同 API 但全對齊**:PK/UNIQUE 內聯於 ColumnDef(`.primary_key()` / `.unique_key()`);`idx_sys_token_user_active` 走 raw `execute_unprepared`(SeaORM 無 partial index DSL),活體 partial WHERE 與源碼逐字一致;`idx_sys_token_chain` 走 create_index DSL。
3. **§I.6 審計欄**:此表刻意只有 `created_at` 單欄,無 created_by/updated_at/updated_by/deleted_at/deleted_by — 非疏漏,token 列為 immutable + 狀態機(用 `used_at`/`status` 而非 soft-delete),migration 未建這些欄、活體也無,兩端一致。
4. **FK**:migration 註解明示「無 DB-level FK(慣例:logical-only 關聯)」,`user_id` 純邏輯關聯不建 FK;活體確認無 sys_token FK。
5. **型精確對齊**:string_len(64/36/20) → 活體 character varying(64/36/20),無無長度 varchar drift。`down()` 對稱(先 drop idx_chain → idx_user_active → table),可逆。

---

## sys_user_role

user↔role 多對多 join 表(複合 PK,無審計欄、硬刪),供 getUserInfo 等即時 join 組裝使用者角色清單。

**來源**:feature 013(migration 007 `create_sys_user_role`)單一 migration 建表 + seed,無後續 alter。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(007 create_sys_user_role) | status |
|---|---|:---:|---|---|:---:|
| `user_id` | bigint | NOT NULL | — | UserId `.big_integer().not_null()` | MATCH |
| `role_id` | bigint | NOT NULL | — | RoleId `.big_integer().not_null()` | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_user_role_pkey` | PK(複合) | PRIMARY KEY btree (user_id, role_id) | 007 `Index::create().col(UserId).col(RoleId)` | MATCH |

### Notes

逐項全對齊,無任何 drift。重點:

1. **欄與 PK**:兩欄 user_id / role_id 皆 bigint NOT NULL、無 default;複合 PK 欄序 (user_id, role_id) 與 migration `col(UserId).col(RoleId)` 順序一致。
2. **§I.6 六審計欄正確全缺** —— 此為 join 表硬刪設計、§I.6 例外;對照緊鄰的 `system_settings`(帶滿 6 審計欄),證明本表是刻意不帶。
3. **FK**:migration 與 live 皆「無 FK」—— 表未對 sys_user(id) / sys_role(id) 建任何外鍵(grep FOREIGN KEY/REFERENCES user_role 零命中),兩端一致故 MATCH;但這意味 user_role 指派無 DB 層 referential integrity(僅靠 007 seed 用 sys_role code subquery 邏輯解析)。
4. **無 sequence / UNIQUE / 二級 index**(join 表不需);全表僅 007 一個 migration 觸碰,無 alter 疊加。
5. seed INSERT 3 筆指派(1→R_SUPER / 2→R_ADMIN / 3→R_USER_COMMON)屬資料非 schema、不列入 DDL reconcile。

---

## sys_operation_log

append-only 操作審計日誌表 — 記錄每次 CRUD 變更的 operation / 實體 / payload before-after / 操作者 IP / trace_id,供事後審計追溯。

**來源**:由 migration 004(`m20260529_000004_create_sys_operation_log`)單一 create 建立,無後續 alter_*。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(004 create_sys_operation_log) | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_operation_log_id_seq')` | Id big_integer auto_increment primary_key | MATCH |
| `operation` | character varying(20) | NOT NULL | — | Operation string_len(20) not_null | MATCH |
| `entity_table` | character varying(64) | NOT NULL | — | EntityTable string_len(64) not_null | MATCH |
| `entity_id` | bigint | NULL | — | EntityId big_integer null | MATCH |
| `payload_before` | jsonb | NULL | — | PayloadBefore json_binary null | MATCH |
| `payload_after` | jsonb | NULL | — | PayloadAfter json_binary null | MATCH |
| `operator_id` | bigint | NULL | — | OperatorId big_integer null | MATCH |
| `operator_ip` | inet | NULL | — | OperatorIp `.custom(Alias::new("INET"))` null | MATCH |
| `trace_id` | character varying(64) | NULL | — | TraceId string_len(64) null | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | CreatedAt not_null default current_timestamp | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_operation_log_pkey` | PK | PRIMARY KEY btree (id) | 004(Id `.primary_key()`,SeaORM 隱式生成 PK 索引) | MATCH |

### Notes

活體(pg_dump + psql `\d+`)與 migration 004 逐欄 1:1 全對齊,10 欄全 MATCH。重點:

1. **約束只有 PK**:無 FK、無 UNIQUE、無 secondary index(grep 活體 schema 內 sys_operation_log 僅出現 CREATE TABLE / sequence / DEFAULT nextval / PK,無任何 CREATE INDEX,migration 也未用 execute_unprepared)。
2. **§I.6 六審計欄例外**:此為 append-only 審計表,刻意只帶 `created_at`,不帶 created_by/updated_at/updated_by/deleted_at/deleted_by;變更操作者 / IP / trace 改由 domain 欄 operator_id / operator_ip / trace_id + payload_before/after 承載,符合不可變語意。
3. **FK**:`operator_id` 設計上指向 sys_user.id 但刻意不建 FK(審計表保留即使 user 被刪 / soft-delete 的歷史紀錄),屬合理設計而非 drift。
4. **型**:`operator_ip` 用 PG 原生 INET 型(經 `.custom(Alias::new("INET"))` 直注),活體確為 inet,MATCH。

---

## sys_access_log

append-only 審計表:已認證請求的存取紀錄(method/path/status/client_ip/region/trace),無 update/delete 審計欄、只有 created_at + operator_id。

**來源**:由 011(`m20260529_000011_create_sys_access_log`)單一 create migration 建立,無任何後續 alter 改欄 / 加索引。對應 feature 015(audit-middleware)系列。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(011 create_sys_access_log) | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_access_log_id_seq')` | Id big_integer auto_increment primary_key | MATCH |
| `operator_id` | bigint | NOT NULL | — | OperatorId big_integer not_null | MATCH |
| `method` | text | NOT NULL | — | Method text not_null | MATCH |
| `path` | text | NOT NULL | — | Path text not_null | MATCH |
| `http_status` | integer | NOT NULL | — | HttpStatus integer not_null | MATCH |
| `client_ip` | inet | NOT NULL | — | ClientIp `.custom(Alias::new("INET"))` not_null | MATCH |
| `x_forwarded_for` | text | NULL | — | XForwardedFor text null | MATCH |
| `region` | text | NULL | — | Region text null | MATCH |
| `trace_id` | text | NULL | — | TraceId text null | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | CreatedAt not_null default current_timestamp | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_access_log_pkey` | PK | PRIMARY KEY btree (id) | 011(Id `.primary_key()`) | MATCH |

### Notes

活體 10 欄與 migration 011 意圖逐欄 1:1 對齊(型 / nullable / default 全一致)。重點:

1. **唯一索引 / 約束為自動 PK**(`sys_access_log_pkey` on id),經 `id .primary_key()` 建立。指派提示「2 index」與實際不符:migration 011 source 與活體 schema 皆無任何非-PK 二級索引(無 client_ip/created_at/operator_id 的 access-pattern index),兩端一致 → 非 drift,僅提示不準。
2. **FK**:`operator_id` 為純 bigint,live 與 migration 皆無 FK 約束(符合 append-only 審計表設計,刻意不綁 sys_user 以免影響寫入)。
3. **§I.6 六審計欄**:此表刻意僅有 `created_at` + `operator_id`,無 updated_*/deleted_*/created_by/updated_by(migration 第 24-25 行註解明示「append-only…無 updated_*/deleted_*」),屬設計意圖、非缺漏。
4. 檔名實際為 `m20260529_000011`(指派路徑誤植為 0000011,多一個 0)。

---

## sys_login_attempt

append-only 審計表:記錄每次登入嘗試的成敗、來源 IP、xff、region、trace_id 等 metadata,供 lockout / 安全稽核查詢。

**來源**:由 migration 012(`m20260529_000012_create_sys_login_attempt`)單一建立;grep 全 migration 目錄無任何後續 alter_* 觸及此表,schema 自建表後未演進。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(012 create_sys_login_attempt) | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('sys_login_attempt_id_seq')` | Id big_integer auto_increment primary_key | MATCH |
| `attempted_user_name` | text | NOT NULL | — | AttemptedUserName text not_null | MATCH |
| `success` | boolean | NOT NULL | — | Success boolean not_null | MATCH |
| `operator_id` | bigint | NULL | — | OperatorId big_integer null | MATCH |
| `client_ip` | inet | NOT NULL | — | ClientIp `.custom(Alias::new("INET"))` not_null | MATCH |
| `x_forwarded_for` | text | NULL | — | XForwardedFor text null | MATCH |
| `region` | text | NULL | — | Region text null | MATCH |
| `trace_id` | text | NULL | — | TraceId text null | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | CreatedAt not_null default current_timestamp | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `sys_login_attempt_pkey` | PK | PRIMARY KEY btree (id) | 012(Id `.primary_key()`) | MATCH |
| `idx_login_attempt_user_time` | INDEX | btree (attempted_user_name, created_at) | 012 create_index(cols AttemptedUserName, CreatedAt) | MATCH |
| `idx_login_attempt_ip_time` | INDEX | btree (client_ip, created_at) | 012 create_index(cols ClientIp, CreatedAt) | MATCH |

### Notes

9 欄全 MATCH、3 index/PK 全 MATCH、零 drift。重點:

1. **§I.6 六審計欄**:刻意只取 `created_at` + `operator_id`,無 updated_*/deleted_*/created_by/updated_by/deleted_by — append-only 表設計,migration 註解 line 23-24 明文記載「只有 created_at + operator_id 作審計 metadata」。
2. **lockout 兩 index**(user_time + ip_time)皆 plain btree、非 partial(無 WHERE 子句),活體與 migration 一致 — 提示說「lockout 2 index」即此兩條。
3. **型**:`client_ip` 用 `.custom(Alias::new("INET"))` 而非 SeaORM 內建型,活體正確落為 PG inet 型。
4. **FK**:`operator_id` 為 nullable bigint,migration 與活體皆無 FK 到 sys_user(append-only 審計表常見:不綁 FK 以免刪 user 時受阻或記錄缺失)。
5. PK 名 `sys_login_attempt_pkey` 為 SeaORM 由 `.primary_key()` 自動生成的慣例名,非手寫約束名、非 drift。指派路徑 `m20260529_0000012`(多一個 0)有誤,實際檔名 `m20260529_000012`。

---

## system_settings

通用「系統設定」KV 地基表(setting_key/value/type),全站單一-session 等系統參數的持久化來源。

**來源**:028/029 feature。單一 migration `m20260529_000028_create_system_settings.rs` 一次到位建表(forward-only,無後續 alter_*)。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(028 create_system_settings) | status |
|---|---|:---:|---|---|:---:|
| `setting_key` | character varying(64) | NOT NULL | — | SettingKey string_len(64) not_null primary_key | MATCH |
| `setting_value` | character varying | NOT NULL | — | SettingValue string not_null | MATCH |
| `value_type` | character varying | NOT NULL | — | ValueType string not_null | MATCH |
| `description` | character varying | NULL | — | Description string null | MATCH |
| `created_at` | timestamptz | NOT NULL | CURRENT_TIMESTAMP | CreatedAt not_null default current_timestamp | MATCH |
| `created_by` | bigint | NULL | — | CreatedBy big_integer null | MATCH |
| `updated_at` | timestamptz | NULL | — | UpdatedAt timestamptz null | MATCH |
| `updated_by` | bigint | NULL | — | UpdatedBy big_integer null | MATCH |
| `deleted_at` | timestamptz | NULL | — | DeletedAt timestamptz null | MATCH |
| `deleted_by` | bigint | NULL | — | DeletedBy big_integer null | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `system_settings_pkey` | PK | PRIMARY KEY btree (setting_key) | 028(inline `.primary_key()` on SettingKey) | MATCH |

### Notes

全 10 欄 + PK 全 MATCH,零 drift。重點:

1. **PK 為 VARCHAR(64) setting_key**、非 auto-increment id,故無 `*_id_seq` sequence。表為單檔 create、無 alter 疊加。
2. **§I.6 六審計欄全數齊備**且 nullable/default 與 migration 逐欄一致:`created_at` NOT NULL + CURRENT_TIMESTAMP default,其餘 created_by / updated_at / updated_by / deleted_at / deleted_by 皆 NULL 無 default。
3. **FK**:created_by / updated_by / deleted_by 為裸 bigint、無 FK 指向 sys_user(migration 與活體一致,非 drift)。無任何 secondary index。
4. migration up 內含 seed `('single_session_default','off','enum:on,off',...)` INSERT,屬資料非 schema、不影響 reconcile。
5. 指派路徑提示檔名 `m20260529_0000028_`(7 位數),實際 `m20260529_000028_`(6 位數);內容相符,僅路徑筆誤。

---

## casbin_rule

Casbin RBAC policy storage table(sea-orm-adapter 標準格式),存放 enforcer 的 p/g policy rules。

**來源**:由 migration 005(`m20260529_000005_create_casbin_rule.rs`)建立,但 DDL **委派給 sea-orm-adapter crate** 的 `up()`(`rust-api/sea-orm-adapter/src/migration.rs`),為單一 schema 來源避免手寫 drift。資料層面由 009(`m20260529_000009_seed_casbin_policy.rs`)seed,021 feature 後續可動 data(非 schema)。

### 欄位比對

| 欄名 | 活體型 | NULL | default | migration 源(adapter migration.rs up(),經 005 委派) | status |
|---|---|:---:|---|---|:---:|
| `id` | bigint | NOT NULL | `nextval('casbin_rule_id_seq')` | L24-29 big_integer not_null auto_increment primary_key | MATCH |
| `ptype` | character varying(18) | NOT NULL | — | L32 string_len(18) not_null | MATCH |
| `v0` | character varying(125) | NOT NULL | — | L33 string_len(125) not_null | MATCH |
| `v1` | character varying(125) | NOT NULL | — | L34 string_len(125) not_null | MATCH |
| `v2` | character varying(125) | NOT NULL | — | L35 string_len(125) not_null | MATCH |
| `v3` | character varying(125) | NOT NULL | — | L36 string_len(125) not_null | MATCH |
| `v4` | character varying(125) | NOT NULL | — | L37 string_len(125) not_null | MATCH |
| `v5` | character varying(125) | NOT NULL | — | L38 string_len(125) not_null | MATCH |

### 索引 / 約束比對

| 名稱 | 類型 | 活體定義 | migration 源 | status |
|---|---|---|---|:---:|
| `casbin_rule_pkey` | PK | PRIMARY KEY btree (id) | adapter up() L28 `.primary_key()` on Id | MATCH |
| `unique_key_sea_orm_adapter` | UNIQUE | UNIQUE btree (ptype, v0, v1, v2, v3, v4, v5) | adapter up() L39-51 `Index::create().name("unique_key_sea_orm_adapter").unique()` | MATCH |

### Notes

活體與 adapter DDL 逐欄 / 索引 / 約束完全一致,零 drift。重點:

1. **DDL 委派**:005 migration 檔本身不含 DDL,僅委派 `sea_orm_adapter::up()/down()`(註解明示「單一 schema 來源 = sea-orm-adapter;不在此手寫 DDL,避免與 adapter drift」)— 真正 DDL provenance 在 `rust-api/sea-orm-adapter/src/migration.rs`。
2. **欄寬設計理由**(原始註解):MySQL utf8mb4 max key length 3072 bytes → 3072/4=768 chars,18 + 125×6 = 768。
3. **UNIQUE 渲染**:adapter 用 `Index::create().unique()` 宣告,PG live 渲染成 UNIQUE CONSTRAINT(背後 btree index),功能等價、非 drift。
4. **FK**:無 FK(adapter 表獨立、不參照 sys_* 表),符合預期。
5. **§I.6 審計欄**:無 —— 正確,此為 casbin adapter 自有標準表,非 rev2 業務 sys_* 表,不應有 audit columns。
6. 021 feature 對此表只動 data(seed/policy 變更)、不動 schema。

---

## Drift / 發現彙整(跨表)

> 按 severity 收攏全 10 表的 `drift_findings`。

**結論:活體 schema 與 migration 源完全一致、零 drift。**

- **HIGH / 結構性 drift**:無。10 張表逐欄、逐索引、逐約束全 `MATCH`,無任何 `LIVE_ONLY`(活體有、migration 沒有)、`MIGRATION_ONLY`(migration 有、活體沒有)、或型不符。
- **MEDIUM / 行為差異**:無。
- **LOW / 非-drift 提示性事項**(僅記錄,均屬設計意圖或稽核輸入的小瑕疵,皆非真實 drift):
  - **指派路徑檔名筆誤(多一個 0)**:`sys_role`(006/016/021)、`sys_menu`(018)、`sys_token`(026)、`sys_access_log`(011)、`sys_login_attempt`(012)、`system_settings`(028)的指派路徑寫成 7 位數 `m20260529_0000NN`,實際檔名為 6 位數 `m20260529_000NN`;內容均相符,僅路徑字串瑕疵。
  - **index 數量提示不準**:`sys_access_log` 指派提示「2 index」,實際 migration 與活體皆只有 PK、無二級索引;兩端一致 → 非 drift,僅提示不準。
  - **種子值非 DEFAULT**:`sys_role` 的 status/home、`sys_user` 的 status 由 up migration 內 UPDATE 回填(非欄 DEFAULT),故活體 default 欄為空 — 正確、非 drift。

---

## 重點觀察

1. **§I.6 審計欄落地分三類(business vs append-only vs join)**:
   - **business 表(帶滿 6 審計欄)**:`sys_user`、`sys_role`、`sys_menu`、`system_settings`。其中 `sys_user` / `sys_role` 的審計欄是**跨 migration 疊加**(deleted_at 先於建表 / soft-delete 階段加,其餘 5 欄由後續 business_audit alter 補),而 `sys_menu` / `system_settings` 是**單檔一次到位**(§I.6 凍結後 forward-only,無 retrofit)。
   - **append-only 審計表(只帶 created_at,有的加 operator_id)**:`sys_operation_log`(僅 created_at)、`sys_access_log`(created_at + operator_id)、`sys_login_attempt`(created_at + operator_id)。不設 updated_*/deleted_*,符合不可變語意。
   - **join / 狀態機表(刻意不帶或只帶 created_at)**:`sys_user_role`(複合 PK join 表,硬刪、零審計欄)、`sys_token`(immutable + 狀態機,只帶 created_at,用 used_at/status 取代 soft-delete)。
   - **非業務表(不該有審計欄)**:`casbin_rule`(adapter 標準表)。

2. **`sys_token` 對齊 027**:由 feature 027 refresh-token-rotation 引入,單一 migration 026 建表,token_hash(64) + rotation_chain(36) + status(20) 狀態機 + issued/expires/used 時間戳,4 個索引物件(PK / token_hash unique / user-active partial / chain)。

3. **`sys_user` session 欄來自 028(027 migration)**:`current_session_id`(varchar 36)+ `session_policy`(varchar 20, NOT NULL default `'inherit'`)由 027 migration(feature 028 single-session)加,有界長度刻意對齊。

4. **`system_settings` 審計欄**:雖只有 1 row,仍是帶滿 §I.6 六審計欄的 business KV 表;PK 為 varchar(64) `setting_key`(非 auto-increment),故無 sequence。

5. **欄序歷史(ALTER 疊加痕跡)**:`sys_user` 與 `sys_role` 的活體欄序保留了 014 / 016 `add_column` 的呼叫順序,造成 `updated_by` / `deleted_by` 排在 `updated_at` 之前 — 是 ALTER TABLE ADD COLUMN 逐次 append 的自然結果,非 drift。

6. **FK 一律「無」**:全 11 表沒有任何外鍵約束。審計欄(created_by/updated_by/deleted_by)、join 欄(sys_user_role 的 user_id/role_id)、邏輯關聯(sys_token.user_id、各 log.operator_id)皆裸 bigint 無 FK —— 這是貫穿整個 codebase 的一致慣例(審計表保留歷史、join 表靠 seed 邏輯解析、token 邏輯關聯),migration 與活體兩端一致。

7. **`casbin_rule` DDL 委派 sea-orm-adapter**:005 migration 不含 DDL,委派給 `sea-orm-adapter/src/migration.rs` 的 `up()/down()`,刻意以 adapter 作單一 schema 來源,避免手寫 DDL 與 adapter 版本 drift;欄寬 18 + 125×6 = 768 源自 MySQL utf8mb4 key length 上限換算。

8. **`partial unique index` 模式一致**:`sys_user` / `sys_role` / `sys_menu` 的 active-only unique(`WHERE deleted_at IS NULL`)皆走 raw `execute_unprepared`(SeaORM 無 partial index DSL),活體 WHERE 子句逐字對齊 — soft-delete 友善的 unique 慣例。

---

## 稽核結論

**rev2 後端 schema 健康度:優。** 11 張表、全 29 個 migration 已套用,活體 DB 與 migration 源逐表、逐欄、逐索引、逐約束 100% `MATCH`,零 drift、零 LIVE_ONLY / MIGRATION_ONLY / 型不符;所有「看似偏離」項目(指派路徑筆誤、種子值非 DEFAULT、審計欄取捨、無 FK、欄序疊加)經逐一回溯,皆屬稽核輸入瑕疵或明確設計意圖,非真實漂移。migration 即活體的可信單一真相,schema 完全受控。
---

## 種子資料(seed data)

> 種子稽核日期:2026-06-06
> 範圍:`rust-api/migration/src` 內各 `up()` 的**種子操作** —— `INSERT`(植入 baseline 列)+ `UPDATE` 回填(backfill 既有列欄值)。**排除 schema 操作**(`CREATE TABLE` / `ALTER` 加欄 / index / 約束,那是本報告前半的職責)。
> 方法:逐 migration 抽取 seed SQL(`execute_unprepared` raw SQL / sea-orm Insert DSL),對齊 2026-06-06 活體 DB 取樣,標每張表的活體列是「==種子(靜態)」還是「種子 + runtime 累積」,並隔離出**非種子、非 runtime-業務的測試殘留**。

本節補上前半 schema 稽核未涵蓋的**資料層**。前半結論是「schema 零 drift」;本節證明「種子完整、且活體仍含全部種子 baseline」,並把活體相對種子的偏離歸因到三類來源,確認沒有任何「該有卻消失的種子」。

### 關鍵框架:種子 vs 活體

- **種子(seed baseline)** = migration 在 `up()` 內**定義**的 baseline 資料。它是**靜態、可重產、idempotent**(全部走 `ON CONFLICT DO NOTHING` 或對固定 id 的 `UPDATE`),重跑 migration 不增不爆。種子是「乾淨初始狀態」的單一真相。
- **活體(live)** = 取樣當下 DB 的實際列,可能 = 種子 + **runtime 累積**(經 API / CDP / 整合測試新增、編輯的列)。
- **動態表偏離種子是正常的,不是 drift。** `sys_user` / `sys_role` / `sys_menu` / `sys_user_role` 這類「可經後台 CRUD 編輯」的表,活體比種子多列是 runtime 自然累積(新增帳號、新增角色、CDP 測試列),屬預期行為。**drift 專指 schema 結構偏離**(前半已證零 drift);**種子偏離專指資料**,兩者是不同維度,本節只談後者。
- 對照之下,**`casbin_rule` 是「半靜態」例外** —— 它**唯一**的合法 runtime 變更是經 modal(`updateRoleButton` / `updateRoleEndpoints` / `updateRoleMenu`)的政策編輯;本次取樣發現活體 casbin 恰好 **== 種子 baseline、零 runtime 編輯殘留**(見 §活體 vs 種子 reconcile)。

### 種子總覽表

| migration | 目標表 | 種子內容摘要 | 列數 |
|---|---|---|---:|
| 002 `seed_sys_user` | `sys_user` | 3 預設帳號 Super/Admin/User(共用 runtime 生成 argon2id hash) | 3 |
| 006 `create_sys_role` | `sys_role` | 3 角色 R_SUPER / R_ADMIN / R_USER_COMMON | 3 |
| 007 `create_sys_user_role` | `sys_user_role` | 3 指派(user→role,role_id 走 code subquery) | 3 |
| 009 `seed_casbin_policy` | `casbin_rule` | endpoint policy:getUserList(SUPER+ADMIN) | 2 |
| 010 `seed_menu_policy` | `casbin_rule` | menu 可見度三階梯(home/manage_user/...) | 9 |
| 013 `seed_manage_policy` | `casbin_rule` | manage 讀端:getRoleList / getAllRoles | 5 |
| 014 `alter_sys_user_business_audit` | `sys_user` | **UPDATE** 回填 status=1(id 1/2/3) | 3 |
| 015 `seed_write_policy` | `casbin_rule` | user 寫端 4 端點(SUPER only) | 4 |
| 016 `alter_sys_role_business_audit` | `sys_role` | **UPDATE** 回填 status=1(id 1/2/3) | 3 |
| 017 `seed_write_role_policy` | `casbin_rule` | role 寫端 4 端點(SUPER only) | 4 |
| 018 `create_sys_menu` | `sys_menu` | seed 6 選單(home + manage 樹) | 6 |
| 019 `seed_menu_read_policy` | `casbin_rule` | menu 讀端 3 端點(SUPER only) | 3 |
| 020 `seed_menu_write_policy` | `casbin_rule` | menu 寫端 4 端點(SUPER only) | 4 |
| 021 `alter_sys_role_home_seed_menu_auth_policy` | `sys_role` | **UPDATE** 全表回填 home='home' | (全表) |
| 021 同上 | `casbin_rule` | menu-auth 讀寫 4 端點(SUPER only) | 4 |
| 022 `seed_button_auth` | `sys_menu` | INSERT function/function_toggle-auth 2 列 + **UPDATE** manage_user.buttons | 2 + 1U |
| 022 同上 | `casbin_rule` | button 10 + menu 6 + endpoint 3 | 19 |
| 023 `seed_endpoint_auth_policy` | `casbin_rule` | endpoint-auth 治理 3 端點(SUPER only) | 3 |
| 024 `seed_role_menu_button_auth` | `sys_menu` | **UPDATE** manage_role.buttons + manage_menu.buttons(各 3 碼) | 2U |
| 024 同上 | `casbin_rule` | button 6(role:* / menu:*,SUPER only) | 6 |
| 025 `seed_menu_restore_policy` | `casbin_rule` | menu restore 2 端點(SUPER only) | 2 |
| 028 `create_system_settings` | `system_settings` | single_session_default = off | 1 |
| 029 `seed_settings_admin` | `casbin_rule` | endpoint 3(settings 治理,SUPER only) | 3 |
| 029 同上 | `sys_menu` | INSERT manage_system-settings 列 | 1 |
| 029 同上 | `casbin_rule` | menu policy manage_system-settings(SUPER) | 1 |

> **casbin 種子總計**:2+9+5+4+4+4+19+3+6+2+3+1 = **69 列**(全 ptype='p',無 'g')。詳細矩陣見 §casbin_rule policy 種子矩陣。

### sys_user(002 seed,3 帳號)

| id | 帳號(`user_name`) | 暱稱(`nick_name`) | 密碼(`password`) | 角色(經 007 指派) |
|---:|---|---|---|---|
| 1 | `Super` | (007 起無 seed;013 起 getUserInfo join 組裝) | runtime 生成 argon2id PHC(plaintext `123456`) | R_SUPER |
| 2 | `Admin` | 同上 | 同一 hash(plaintext `123456`) | R_ADMIN |
| 3 | `User` | 同上 | 同一 hash(plaintext `123456`) | R_USER_COMMON |

- **密碼非寫死固定 hash**:002 `up()` 在 runtime 以 `Argon2::default()` + `OsRng` random salt 為 plaintext `b"123456"` 生成**單一 PHC 字串**,3 個 user **共用同一 hash**;每次重跑 migration hash 字串不同,但都驗得過 `123456`。argon2 PHC 字串只含 `[A-Za-z0-9+/.$,=]`(無單引號),故可安全 interpolate 進此靜態 seed 的 SQL literal(user 輸入仍須 parameterized binding)。
- **冪等**:`ON CONFLICT (user_name) DO NOTHING`(指定 `user_name` 衝突欄)。
- **權威名**:`Super` / `Admin` / `User` 對齊 base-web mock ground truth + DESIGN §11.1;rev1 的 `Soybean`/`Administrator`/`GeneralUser` 已淘汰、勿用。
- **down 對稱**:`DELETE FROM sys_user WHERE user_name IN ('Super','Admin','User')`(純資料刪除,不 drop schema)。
- **status=1 不在 002**:由 014 UPDATE 回填(見 §UPDATE 回填)。

### sys_role(006 seed,3 角色)

| id(BIGSERIAL) | `code` | `name` | `home` | `status` |
|---:|---|---|---|:---:|
| 1 | `R_SUPER` | 超级管理员 | `home`(021 回填) | 1(016 回填) |
| 2 | `R_ADMIN` | 管理员 | `home`(021 回填) | 1(016 回填) |
| 3 | `R_USER_COMMON` | 普通用户 | `home`(021 回填) | 1(016 回填) |

- **id 未顯式給**:`BIGSERIAL` auto-increment;故 007 指派用 `code` subquery 而非寫死 id。
- **冪等**:`ON CONFLICT DO NOTHING`(無指定欄)。
- **`home` / `status` 不在 006**:`status=1` 由 016 回填、`home='home'` 由 021 全表回填(見 §UPDATE 回填)。
- **down 對稱**:DROP INDEX + drop_table sys_role(連種子一併移除)。

### sys_user_role(007 seed,3 指派)

| `user_id` | `role_id`(解析方式) |
|---:|---|
| 1 | `(SELECT id FROM sys_role WHERE code='R_SUPER' AND deleted_at IS NULL)` |
| 2 | `(SELECT id FROM sys_role WHERE code='R_ADMIN' AND deleted_at IS NULL)` |
| 3 | `(SELECT id FROM sys_role WHERE code='R_USER_COMMON' AND deleted_at IS NULL)` |

- **role_id 不寫死**:用 `code` subquery 動態解析,且帶 `deleted_at IS NULL` 守衛(只指派 active role),對齊 soft-delete 語意。
- **冪等**:`ON CONFLICT DO NOTHING`;複合 PK `(user_id, role_id)`。
- **角色不走 casbin `g`**:rev2 user→role 由本 join 表承載,**casbin 無任何 ptype='g' 列**(活體確認 0 個 'g')。
- **down 對稱**:drop_table sys_user_role(連表帶種子一併移除)。

### sys_menu(seed 選單樹)

種子分兩批落地:018 種 home + manage 樹(6 列)、022 種 function 樹(2 列)、029 種 manage_system-settings(1 列),共 **9 列 seed 選單**;另有 022/024 對既有列的 `buttons` 回填(見 §UPDATE 回填)。

| migration | route_name | menu_type | parent | route_path | 備註 |
|---|---|:---:|---|---|---|
| 018 | `home` | 2 | (top) | `/home` | order=1 |
| 018 | `manage` | 1 | (top) | `/manage` | order=9,目錄容器 |
| 018 | `manage_user` | 2 | manage | `/manage/user` | order=1 |
| 018 | `manage_role` | 2 | manage | `/manage/role` | order=2 |
| 018 | `manage_menu` | 2 | manage | `/manage/menu` | order=3,**keep_alive=true** |
| 018 | `manage_user-detail` | 2 | manage | `/manage/user-detail/:id` | **hide_in_menu=true**,active_menu='manage_user' |
| 022 | `function` | 1 | (top) | `/function` | order=6,目錄容器 |
| 022 | `function_toggle-auth` | 2 | function | `/function/toggle-auth` | order=4,buttons=三碼 demo registry |
| 029 | `manage_system-settings` | 2 | manage | `/manage/system-settings` | order=4,icon='mdi:cog' |

- **逐字重現後端路由樹**:018 的 6 選單逐字重現 `server/src/route/menu.rs::business_routes()`(D5 回歸鐵律);029 鏡像 018 `manage_user` 列形。
- **parent 用 subquery 解析**:children 用 `(SELECT id FROM sys_menu WHERE route_name='manage'/'function' AND deleted_at IS NULL)` 動態解析 parent_id,故 INSERT 順序刻意「先父後子」。
- **審計欄**:系統種子的 `created_by` 一律 NULL;`status=1` 全部直接給(非後續回填)。
- **冪等**:全部 `ON CONFLICT DO NOTHING`。
- **down**:018 `DROP TABLE`(連 6 列 seed)、022/029 精準刪本 migration 引入的列。

### system_settings(028 seed,1 列)

| `setting_key` (PK) | `setting_value` | `value_type` | `description` | `created_by` |
|---|---|---|---|---|
| `single_session_default` | `off` | `enum:on,off` | 全站單一-session 預設 | NULL(系統種子) |

- **PK 非 auto-id**:`setting_key` 為 VARCHAR PK;`created_at` 走 col default `current_timestamp`。
- **冪等**:`ON CONFLICT DO NOTHING`;**down 對稱 = drop_table**(整表移除,非逐列刪)。

### casbin_rule policy 種子矩陣

這是本節重點。casbin_rule 用同一張表承載**三個維度**的 policy,以 `v2` 欄區分語意:

- **v2 = HTTP method(`GET`/`POST`/`DELETE`)** → **endpoint policy**(`enforce_mw` 端點級 RBAC)
- **v2 = `'menu'`** → **menu 可見度 policy**(`getUserRoutes` 選單過濾)
- **v2 = `'button'`** → **button 級權限**(`getUserInfo.buttons` 由這些列聚合)

共通形式:`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES (...) ON CONFLICT DO NOTHING`;`ptype` 一律 `'p'`、`v0`=role code、`v1`=obj(path 或 route_name 或 button code)、`v2`=維度標記;**`v3`/`v4`/`v5` 全填空字串 `''`**(stock sea-orm-adapter 空欄慣例,v0..v5 NOT NULL 無預設);**path 一律無 `/api` 前綴**;種子值全部 hard-coded literal、無 subquery。

#### 維度一:endpoint policy(v2 = HTTP method)

| role | 端點(path) | method | 種者 migration |
|---|---|:---:|:---:|
| R_SUPER, R_ADMIN | `/systemManage/getUserList` | GET | 009 |
| R_SUPER, R_ADMIN | `/systemManage/getRoleList` | GET | 013 |
| R_SUPER, R_ADMIN, R_USER_COMMON | `/systemManage/getAllRoles` | GET | 013 |
| R_SUPER | `/systemManage/addUser`,`/updateUser` | POST | 015 |
| R_SUPER | `/systemManage/deleteUser`,`/batchDeleteUser` | DELETE | 015 |
| R_SUPER | `/systemManage/addRole`,`/updateRole` | POST | 017 |
| R_SUPER | `/systemManage/deleteRole`,`/batchDeleteRole` | DELETE | 017 |
| R_SUPER | `/systemManage/getMenuList/v2`,`/getAllPages`,`/getMenuTree` | GET | 019 |
| R_SUPER | `/systemManage/addMenu`,`/updateMenu` | POST | 020 |
| R_SUPER | `/systemManage/deleteMenu`,`/batchDeleteMenu` | DELETE | 020 |
| R_SUPER | `/systemManage/getRoleMenu`,`/getRoleHome` | GET | 021 |
| R_SUPER | `/systemManage/updateRoleMenu`,`/updateRoleHome` | POST | 021 |
| R_SUPER | `/systemManage/getAllButtons`,`/getRoleButton` | GET | 022 |
| R_SUPER | `/systemManage/updateRoleButton` | POST | 022 |
| R_SUPER | `/systemManage/getAllEndpoints`,`/getRoleEndpoints` | GET | 023 |
| R_SUPER | `/systemManage/updateRoleEndpoints` | POST | 023 |
| R_SUPER | `/systemManage/getDeletedMenus` | GET | 025 |
| R_SUPER | `/systemManage/restoreMenu` | POST | 025 |
| R_SUPER | `/systemManage/getSystemSettings` | GET | 029 |
| R_SUPER | `/systemManage/updateSystemSetting`,`/updateUserSessionPolicy` | POST | 029 |

> endpoint 維度小計:**GET 18 + POST 13 + DELETE 6 = 37 列**。

#### 維度二:menu 可見度 policy(v2 = 'menu')

| route_name | R_SUPER | R_ADMIN | R_USER_COMMON | 種者 migration |
|---|:---:|:---:|:---:|:---:|
| `home` | ✓ | ✓ | ✓ | 010 |
| `manage_user` | ✓ | ✓ | — | 010 |
| `manage_user-detail` | ✓ | ✓ | — | 010 |
| `manage_role` | ✓ | — | — | 010 |
| `manage_menu` | ✓ | — | — | 010 |
| `function` | ✓ | ✓ | ✓ | 022 |
| `function_toggle-auth` | ✓ | ✓ | ✓ | 022 |
| `manage_system-settings` | ✓ | — | — | 029 |

> menu 維度小計:010 種 9 列 + 022 種 6 列 + 029 種 1 列 = **16 列**。父層 `manage` 不 seed menu policy(容器目錄,可見性由子節點決定)。

#### 維度三:button 級權限(v2 = 'button')

| button code | R_SUPER | R_ADMIN | R_USER_COMMON | 種者 migration |
|---|:---:|:---:|:---:|:---:|
| `B_CODE1` | ✓ | — | — | 022 |
| `B_CODE2` | ✓ | ✓ | — | 022 |
| `B_CODE3` | ✓ | ✓ | ✓ | 022 |
| `user:add` | ✓ | — | — | 022 |
| `user:edit` | ✓ | ✓ | — | 022 |
| `user:delete` | ✓ | — | — | 022 |
| `role:add` | ✓ | — | — | 024 |
| `role:edit` | ✓ | — | — | 024 |
| `role:delete` | ✓ | — | — | 024 |
| `menu:add` | ✓ | — | — | 024 |
| `menu:edit` | ✓ | — | — | 024 |
| `menu:delete` | ✓ | — | — | 024 |

> button 維度小計:022 種 10 列(R_SUPER 6 + R_ADMIN 3 + R_USER_COMMON 1)+ 024 種 6 列(全 R_SUPER)= **16 列**。

#### casbin 三維度合計

| 維度 | 種子列數 | 種者 migration |
|---|---:|---|
| endpoint(GET 18 / POST 13 / DELETE 6) | 37 | 009/013/015/017/019/020/021/022/023/025/029 |
| menu(v2='menu') | 16 | 010/022/029 |
| button(v2='button') | 16 | 022/024 |
| **合計** | **69** | — |

**權限設計重點**:R_SUPER 涵蓋幾乎全部治理端點與權限;R_ADMIN 只有讀端(getUserList/getRoleList/getAllRoles)+ 部分 menu(home/manage_user/manage_user-detail/function/function_toggle-auth)+ 3 個 button(B_CODE2/B_CODE3/user:edit),**無任何寫端 endpoint**;R_USER_COMMON 最小集(home/function/function_toggle-auth menu + getAllRoles role-picker + B_CODE3)。**所有寫端 endpoint(add/update/delete/batchDelete)與所有治理端點(getAll*/getRole*/updateRole*)皆 R_SUPER only**,非 Super 經 `enforce_mw` 拒 403。其餘角色的進階授權刻意**不 seed**,由運維經 modal(updateRoleButton / updateRoleEndpoints / updateRoleMenu)runtime 指派。

**冪等與 down 紀律**:全 12 個 casbin seed migration 皆 `ON CONFLICT DO NOTHING`;各 `down()` 嚴格只反轉自己(by `v1 IN(...)` 精確刪,**不裸刪維度**)—— 例如 022 down 刪 button 必須帶 `v1 IN(B_CODE*/user:*)` 避免誤刪;024 down 刪 button 必須帶 `v1 IN(role:*/menu:*)` 避免誤刪 022 的 10 列;010 的 9 列 menu 也靠 022 down 的 `v1 IN('function','function_toggle-auth')` 守衛避開。

### UPDATE 回填

種子除 INSERT,還有三處對既有列的欄值回填(對齊「§I.6 審計欄凍結前後」的補欄需求,以及 home 基線):

| migration | 目標表 | 回填內容 | 範圍 |
|---|---|---|---|
| 014 | `sys_user` | `status = 1`(啟用) | `WHERE id IN (1,2,3)`(Super/Admin/User) |
| 016 | `sys_role` | `status = 1`(啟用) | `WHERE id IN (1,2,3)`(三角色) |
| 021 | `sys_role` | `home = 'home'` | **無 WHERE、全表**(per-role getUserRoutes 首頁基線預設) |
| 022 | `sys_menu` | `manage_user.buttons` = `[user:add, user:edit, user:delete]` registry | `WHERE route_name='manage_user' AND deleted_at IS NULL` |
| 024 | `sys_menu` | `manage_role.buttons` = `[role:add, role:edit, role:delete]` registry | `WHERE route_name='manage_role' AND deleted_at IS NULL` |
| 024 | `sys_menu` | `manage_menu.buttons` = `[menu:add, menu:edit, menu:delete]` registry | `WHERE route_name='manage_menu' AND deleted_at IS NULL` |

- **014/016 status=1**:對固定 id 1/2/3 回填,因 `status` 欄是後加(business_audit alter)、建表時不存在,故用 UPDATE 補既有種子列。down 不還原 status(欄被 drop、值隨之消失,對稱合理)。
- **021 home='home' 全表**:刻意無 WHERE,把**全角色**(含 runtime 新增的)的 home 拉到基線 `home`;此基線值可被後續 per-role 編輯(updateRoleHome)覆寫。
- **022/024 buttons registry**:`up()` 帶 `deleted_at IS NULL` 守衛(只回填 active 選單);後端零改(getAllButtons 聚合 active `sys_menu.buttons`、set_role_button HARD REPLACE code-agnostic)。024 down 還原為 NULL 時 WHERE 不帶 `deleted_at` 守衛(小不對稱、無害)。

### 活體 vs 種子 reconcile

逐表標記 2026-06-06 活體相對種子 baseline 的關係:

| 表 | 種子列 | 活體列 | 關係 | 說明 |
|---|---:|---:|:---:|---|
| `casbin_rule` | 69 | 69(ptype='p',0 個 'g') | **== 種子(靜態)** | 詳見下方逐維度核對 |
| `system_settings` | 1 | 1 | **== 種子(靜態)** | single_session_default=off,未經 runtime 編輯 |
| `sys_role` | 3 | 6 | 種子 + runtime 累積 | seed id 1/2/3 完整在活體;多出 16/17/18 為測試殘留(見 §dev DB 測試殘留) |
| `sys_user` | 3 | 15 | 種子 + runtime 累積 | seed id 1/2/3(cby=∅)完整在活體;其餘為 runtime + 測試殘留 |
| `sys_user_role` | 3 | 13 | 種子 + runtime 累積 | seed 1→1/2→2/3→3 完整;其餘對應 runtime/測試 user |
| `sys_menu` | 9 | 12 | 種子 + runtime 累積 | seed 9 列(018×6 + 022×2 + 029×1)完整;多出 13/14/15 為 CDP 測試殘留 |

**casbin_rule 是本次最重要的 reconcile 結論**:活體 69 列與種子 69 列**逐列完全相同、零差異**(seed 集合 ∖ live = ∅,live ∖ seed = ∅)。維度核對:

- GET 18 / POST 13 / DELETE 6(= endpoint 37)、menu 16、button 16 —— **每個維度的活體計數都精確等於種子計數**。
- **task 提示中標為「可能 runtime 授權編輯」的列,經核對全部是種子 baseline**:`R_ADMIN | B_CODE2 | button`、`R_ADMIN | B_CODE3 | button`、`R_ADMIN | user:edit | button`、`R_USER_COMMON | B_CODE3 | button` 四列**均由 022 `seed_button_auth` 種入**(022 的 R_ADMIN 3 + R_USER_COMMON 1 分級正是這四列),**不是** runtime modal 授權。
- 因此本次取樣的 casbin **沒有任何 runtime 授權編輯殘留** —— 雖然 `updateRoleButton`/`updateRoleEndpoints`/`updateRoleMenu` 提供了合法 runtime 變更通道,但取樣當下活體政策恰好停在乾淨種子 baseline 上。

> **note(casbin 精確列數 = 69)**:`SELECT count(*) FROM casbin_rule` 精確值 = **69**(ptype='p' 69 + ptype='g' 0)。本報告前半總覽表初稿的 row 數取自 `pg_stat_user_tables.n_live_tup`(VACUUM 估計值)有偏差,已**同批校正為精確 count(*)**:`casbin_rule` 70→69、`sys_role` 3→6、`sys_user_role` 4→13、`sys_operation_log` 161→160(其餘表估計值與精確值相符)。兩半部現一致。

### dev DB 測試殘留 finding

活體 DB 除「種子」與「runtime-業務」兩類列外,還夾帶第三類:**測試殘留** —— CDP 自動化測試 / 整合測試建立、未清理的列。這些列**既非種子 baseline、也非真實業務 runtime**,僅是 dev DB 上累積的 test fixture,值得標記:

| 表 | 測試殘留列 | 來源 |
|---|---|---|
| `sys_role` | id 16(`CDPR1_*`)、17(`CDPR2_*`)、18(`CDPX_R_*`) | CDP role CRUD 測試 |
| `sys_user` | id 4–7(alice/bob/cdpuser/cdpdisabled)、15(test)、16–18(cdp*)、19(rv017);id **900001/900002/900003**(`audit_it_user_*`,900003 single-session on) | runtime/CDP 測試(4-19,cby=1)+ 高 id **整合測試殘留**(900001-3,cby=∅) |
| `sys_menu` | id 13(`cdpm1`)、14(`cdpm2`)、15(`cdpx_m2`)(cby=1) | CDP menu CRUD 測試 |
| `sys_user_role` | 4→3/5→3/6→2/6→3/7→3/15→2/16→3/17→3/18→3/19→3 | 對應上述測試 user 的角色指派 |

- **特別點名 900001-3**:這三列 `audit_it_user_*`(cby=∅、高 id 區段)是 **rust-api in-crate 整合測試**(`#[ignore]` live-postgres 測試)的 fixture,跑完未回滾;cby=∅ 容易被誤判為種子(種子也 cby=∅),但種子帳號只有 id 1/2/3,**900001-3 確定是測試殘留**,id 區段(900000+)即是隔離標記。
- **casbin / system_settings 無測試殘留**:這兩表活體 == 種子,測試未在其上留污染列(casbin 測試列若有也已清,或測試走 throwaway DB)。
- **建議**:這些殘留**不影響種子完整性**(種子 baseline 全在),但污染 dev DB 取樣、易混淆「種子 vs 活體」判讀。建議二選一 ——(a)以 throwaway DB 重跑 `migration up` 取得乾淨種子 baseline 快照供對照;或(b)寫一支 cleanup 腳本清掉測試 id 區段(sys_role 16-18、sys_user 4-19 + 900001-3、sys_menu 13-15 及其 sys_user_role / 任何 runtime casbin 列),讓 dev DB 回到「種子 + 真實業務」的乾淨狀態。整合測試本身宜改用 throwaway DB 或測試後 rollback,避免持續累積。

### 種子完整性結論

**migration 種子齊備,活體含全部種子 baseline。** 24 處 seed 操作(21 INSERT 批 + 3 類 UPDATE 回填)分布在 13 個 migration,涵蓋 6 張表;全部 idempotent(`ON CONFLICT DO NOTHING` / 固定-id UPDATE),down 各自精確反轉。逐表 reconcile 確認:每一條種子列都能在活體找到對應(seed ⊆ live,無「該有卻消失的種子」);`casbin_rule` 與 `system_settings` 活體**恰好 == 種子靜態 baseline**(casbin 69 列零 runtime 編輯殘留),`sys_user`/`sys_role`/`sys_menu`/`sys_user_role` 活體 = 種子 + runtime 累積 + 可清理的測試殘留。**種子層健康度:優** —— 種子定義完整、idempotent、down 對稱,活體偏離全部歸因明確(runtime 業務 / 測試殘留),無種子 drift。