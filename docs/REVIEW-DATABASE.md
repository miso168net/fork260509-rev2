# REVIEW-DATABASE — 活體資料庫 vs migration 源 稽核報告

> 稽核日期:2026-06-06
> 方法:`pg_dump --schema-only`(活體 ground truth)vs `rust-api/migration/src` 逐表 reconcile(欄 / 索引 / 約束 provenance + drift)
> 結論:**全 11 表、29 migration 全套用、零 drift。**

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
| `sys_role` | RBAC 角色表(code/name/home/status + 審計欄) | 006 建表 → 016 / 021 | 12 | MATCH | 3 |
| `sys_menu` | 後台選單 / 路由樹主表(menu/route 元資料 + button 權限) | 018 建表(feature 018) | 27 | MATCH | 12 |
| `sys_token` | refresh token rotation chain 持久化(session/token 基礎設施) | 026 建表(feature 027) | 9 | MATCH | 72 |
| `sys_user_role` | user↔role 多對多 join 表(複合 PK、硬刪) | 007 建表(feature 013) | 2 | MATCH | 4 |
| `sys_operation_log` | append-only 操作審計日誌(CRUD before/after + 操作者 + trace) | 004 建表 | 10 | MATCH | 161 |
| `sys_access_log` | append-only 存取審計(method/path/status/ip/region/trace) | 011 建表(feature 015) | 10 | MATCH | 1401 |
| `sys_login_attempt` | append-only 登入嘗試審計(成敗 / IP / region,供 lockout) | 012 建表 | 9 | MATCH | 345 |
| `system_settings` | 系統設定 KV 地基表(setting_key/value/type + 審計欄) | 028 建表(feature 028/029) | 10 | MATCH | 1 |
| `casbin_rule` | Casbin RBAC policy storage(sea-orm-adapter 標準格式) | 005 委派 adapter DDL,009 seed | 8 | MATCH | 70 |
| `seaql_migrations` | sea-orm migration 追蹤表(框架內部) | 無對應 migration 檔 | — | — | 29 |

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