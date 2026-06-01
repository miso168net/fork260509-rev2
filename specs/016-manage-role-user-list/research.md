# Phase 0 Research: 016-manage-role-user-list

**Date**: 2026-06-01 | **Branch**: `016-manage-role-user-list`
**研究對象**: `rust-api` worktree @ `cff9785`(= 015 state)+ `base-web` worktree。**未 grep rev1 source**(守 constitution §I.5;本 feature 採「不動表、缺欄回 null」故無 schema 設計需求、不需 rev1 交叉參照)。

承接:008(`Res<T>` envelope)/ 009(soft-delete `find_active` + entity-access lint)/ 011(facade 唯一 entity 管道)/ 013(`enforce_mw` + jwt/bearer + casbin seed)/ 014(route handler 模式)/ 010(migration 自動套)/ 015(全域 ctx_mw,不動)。

---

## R1. sea-orm 1.1.20 分頁 API(★ 016 首次引入)

**現況事實**(Cargo.lock 確認 sea-orm `1.1.20`;grep `server/`/`migration/` 全無 `.paginate` 用例 → 016 首次):
- `use sea_orm::PaginatorTrait;` → 任何 `Select<Entity>` 可 `.paginate(db, page_size: u64) -> Paginator`。
- `paginator.num_items().await? -> u64`(套 filter 後、分頁前總筆數,發 1 次 COUNT query)。
- `paginator.fetch_page(page_idx: u64).await? -> Vec<Model>`(**0-based** index,發 1 次 SELECT query)。

- **Decision**:list facade fn 用 `find_active().filter(...).paginate(db, size)`,先 `num_items()` 拿 total、再 `fetch_page(current - 1)` 拿該頁 rows。`current` 1-based(wire)→ `fetch_page` 0-based(減 1)。
- **Rationale**:固定 2 query(count + page),非 N+1;sea-orm 原生、無手寫 LIMIT/OFFSET。
- **N+1 防護**:roles 另以批次(R7)取,故整頁 = count(1)+ page(1)+ roles 批次(1)= 固定 3 query,不隨頁筆數增長(SC-006)。

## R2. filter builder(LIKE 模糊 + eq,參數化)

**現況事實**:`ColumnTrait::contains(s)` → `LIKE '%s%'`(sea-orm 自動 bind `$1` + escape LIKE 特殊字元);`.eq(v)` → `= $1`。皆參數化(守 CHECKLIST §5.10、絕不字串內插)。

- **Decision**:
  - getUserList filter:`user_name` `.contains(kw)` / `nick_name` `.contains(kw)`(entity 有對應欄者)。
  - getRoleList filter:`name` `.contains(kw)`(=roleName)/ `code` `.contains(kw)`(=roleCode)。
  - 空字串 / `None` → 不加該 `.filter()`(D6/D8)。base-web 送的其餘 search 欄(userGender/userPhone/userEmail/status/roleDesc)**entity 無對應欄 → 忽略**(不報錯,一致於缺欄策略 D2)。
- **多條件**:鏈式 `.filter().filter()`(AND);抽純 fn `*_list_query(filter) -> Select<Entity>` 作 no-DB SQL-build 單測 seam(沿 011/015 模式)。

## R3. route path 無 `/api` 前綴 + 009 policy 一致(★ 親讀駁回 research 幻覺)

**現況事實**(親讀 `server/src/main.rs` @ cff9785 + grep 證實):
- main.rs route path **全部無 `/api` 前綴**:`/auth/login` / `/auth/getUserInfo` / `/route/*` / `/systemManage/getUserList`(line 86)。`grep -c '"/api/' main.rs` = **0**。
- getUserList 已掛 per-route `enforce_mw`(`route_layer(from_fn_with_state(state.clone(), enforce::enforce_mw))`,line 86-93)= 016 三條 endpoint 照抄的 pattern。
- 015 全域 ctx_mw layer + `into_make_service_with_connect_info` 在 fallback 之後(grep 證實在,不動)。
- migration 009 seed `('p','R_SUPER','/systemManage/getUserList','GET',...)` + R_ADMIN 同 → **path 與 route 一致(皆無 /api)、無 mismatch**。`enforce_mw` 取 `req.uri().path()` = `/systemManage/getUserList` 正好 match seed v1。

- **Decision**:016 三 endpoint route path 用 `/systemManage/getRoleList`、`/systemManage/getAllRoles`、`/systemManage/getUserList`(**無 /api**);seed policy v1 同樣無 /api。getUserList route 從 `handler::auth::get_user_list`(013 stub)改指 `handler::system_manage::get_user_list`,enforce_mw 保留。
- **駁回紀錄**:plan Phase 0 research subagent 曾宣稱「main.rs route 帶 /api 前綴 → 009 policy 對不上 → Super/Admin 也 403(既存 bug)」。**經親讀 main.rs + `grep -c '"/api/'`=0 雙重證實為幻覺**(subagent 把 base-web `VITE_SERVICE_BASE_URL=/api` 概念誤植進 rust route)。rust route 無 /api、009 policy 正確、**無 bug**。`/api` 是 base-web→front-nginx→rust 的 nginx-strip 層概念,rust 內部 route 不帶。(act on actual code 駁回二手 subagent 假 bug。)

## R4. casbin policy seed 手段(沿 009/010)

**現況事實**(親讀 009/010):統一 `manager.get_connection().execute_unprepared("INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES (...) ON CONFLICT DO NOTHING")`。casbin_rule(012 stock adapter schema)欄 `id`(PK)+`ptype`+`v0..v5` **全 NOT NULL 無預設** → 未用欄填 `''`。unique 索引 (ptype,v0..v5);`ON CONFLICT DO NOTHING` 冪等。`down()` = `DELETE ... WHERE` 對應條件。

- **Decision**:016 新 seed migration `m20260529_000013_seed_manage_policy`(接 015 的 012 後),沿此 raw SQL pattern 補:
  - getRoleList × {R_SUPER, R_ADMIN}(2 rows)
  - getAllRoles × {R_SUPER, R_ADMIN, R_USER_COMMON}(3 rows)
  - **getUserList 不補**(009 已 seed R_SUPER+R_ADMIN)。`ON CONFLICT DO NOTHING` 保險即使重列亦冪等。
  - act=`GET`(與 014 menu policy act=`menu` 共存同表、RBAC model 不改)。R_SUPER **無 wildcard**(009 是逐條,016 沿逐條)。
  - `down()`:`DELETE WHERE ptype='p' AND v1 IN ('/systemManage/getRoleList','/systemManage/getAllRoles') AND v2='GET'`(只反轉本 migration、不碰 009 getUserList)。
- 註冊 `migration/src/lib.rs`(接 012 後,mod + migrations() vec)、經 010 自動套、server 不自動 migrate(007 FR-009)。
- **§I.6 對齊**:本 migration 只 seed casbin_rule(policy 表、非業務表)→ **不觸發 §I.6 業務表 6 審計欄要求**(不建/不 alter 業務表)。

## R5. 缺欄回 null + base-web render 安全(D2 風險驗證)

**現況事實**(base-web typings + render 慣例 grep):
- `CommonRecord.status: EnableStatus | null`、`User.userGender: UserGender | null` → **base-web typing 本就允許 null** → status/gender 回 `null` **零型別風險**。
- 純文字欄(`userEmail`/`userPhone`/`nickName`/`roleDesc`)→ naive `{{ row.x }}` null 顯示空字串,不 crash。
- enum 標籤欄(status/gender)用 NTag + record map;`map[null]=undefined` → NTag type=undefined render 成 default/空白 tag,**不 crash**(soybean example 慣例)。
- **id 消費**:NDataTable `rowKey: row => row.id`(吃 string|number,Vue key 轉 string)、edit 傳整 row、delete 傳 id-as-是;**grep 無對 id 做 `Number()`/算術** → **id 回 string 安全**(runtime 不壞;TS 宣告 number 僅型不符 → BASE-WEB-ADAPT 型補正列 follow-up)。

- **Decision**:DTO nullable 欄回 `Option::None`(顯式 `null`)。status/gender 回 null(符 base-web `| null` 型,零風險)。CDP 驗收確認列表 render 正常;**若**某欄令 base-web crash(預期不會),該欄 implementer 改回 `""`(空字串)。
- **Rationale**:回 null 最誠實(seed 帳號本無這些資料)、符 base-web 型;不動表(D2)→ 零 migration、零 schema 風險。

## R6. id wire 型 = string(對齊當前凍結值,DTO 邊界轉)

**現況事實**:entity `sys_user.id` / `sys_role.id` = `i64`;constitution §I.3 凍結「`Role.id` / `MenuRoute.id` = **string**」;013 `getUserInfo.userId = claims.user_id.to_string()`(既有 i64→string 先例)。

- **Decision**:DB/entity/facade 全程 `i64`;**DTO 層** `id.to_string()` 後序列化(`UserItem.id: String` / `RoleItem.id: String` / `AllRoleItem.id: String`)。
- **Rationale**:對齊當前凍結值 string + 沿 013 先例。DESIGN §1.5/§3.6 殘留「number」表述 = 已知文件矛盾(凍結權威 string);本 feature act on string、**不走 amendment**(舊備份的 number amendment 留在 rebase260531 備份分支、未進 rev2-admin-root)。spec Deviation D-1 標記 DESIGN 待掃清。

## R7. roles 批次取得(避 N+1)

**現況事實**:`sys_user_role::roles_for_user(db, user_id) -> Result<Vec<String>, DbErr>`(per-user 單查,2 步:sys_user_role 取 role_ids → sys_role::find_active filter id IN 取 code)。login/getUserInfo 用。

- **Decision**:新增 `sys_user_role::roles_for_users(db, &[i64]) -> Result<HashMap<i64, Vec<String>>, DbErr>`:一次 `sys_user_role WHERE user_id IN (ids)` 取 (user_id, role_id) pairs → 一次 `sys_role::find_active filter id IN (role_ids)` 取 (id, code) → 在記憶體組 `user_id → [code...]`。整頁固定 2 query(非 N+1)。既有單筆 `roles_for_user` 保留(login/getUserInfo 用)。
- **Rationale**:列表場景 N 列不可 N+1(SC-006);批次 IN 是標準解。回 role **code** 陣列(對齊 base-web `userRoles: string[]` = code 陣列 + roles_for_user 既有投影,R5/userRolesConsumption 證實)。

## R8. 既有不破 / 無新 crate dep / 測試策略

- **無新 workspace crate、無新外部 dep**(用既有 sea-orm `PaginatorTrait` + axum + 013 enforce + 008 envelope)→ **不觸發** CLAUDE.md §3「新 crate ⇒ prod build」硬規則;prod runtime image build **非強制**(可選一條 sanity;dev docker 編譯 + acceptance 已足)。
- **`server` bin-only**(無 lib.rs)→ live-DB 整合測試用 in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`,放 `facade/`(009 lint 豁免目錄;memory `project_rustapi_build_test_env`)。
- **純單測(test-first)**:DTO 映射(id→string / 缺欄→null / role code 陣列)、分頁參數正規化(current-1 / size 預設 10 / clamp max 100)、filter SQL-build(contains LIKE / eq / 空略過 / id DESC / count)。
- **無 sea-orm relation**:三 entity Relation 皆空 → roles 批次自己兩步查(非靠 relation),沿 roles_for_user 模式。
- **D 無 CDP-only**:純後端 read,但本 feature 的價值是「管理頁第一次看到資料」→ acceptance 含一條 CDP 列表顯示驗收(dev vite proxy,沿 013/014)+ curl/psql + 純單測。

## R9. 排序

**現況事實**:entity **無 `created_at` 欄**(D2 不補)→ 無法 `created_at DESC`。

- **Decision**:list 排序用 `id DESC`(seed id 1/2/3,穩定、新→舊)。`.order_by_desc(Column::Id)`。
- **Rationale**:無時間欄下 id DESC 是穩定且語意合理的預設(後建者 id 較大);日後補 created_at(write 那一波)可改。

---

## Constitution Check 對齊(詳見 plan.md §Constitution Check;此處列 research 佐證)
- §I.1 base-web 權威:對齊既有 3 endpoint wire,無 endpoint 缺口。
- §I.3 wire 不變式:envelope(008)/ pagination {current,size,total,records} 無 pages / id=string / status nullable — 全對齊(R5/R6)。
- §I.5 不拷貝 rev1:本 feature 零 schema 設計、零 rev1 參照(R 開頭已聲明)。
- §I.6 業務表審計欄:**N/A** — 不建/不 alter 業務表(唯一 migration 為 casbin policy seed,非業務表)(R4)。
- §II §11.10 id=string:採凍結值 string(R6),不偏離。
