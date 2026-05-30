---
description: "Task list for 016-manage-role-user-list implementation"
---

# Tasks: manage-role-user-list

**Input**: Design documents from `/specs/016-manage-role-user-list/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **純邏輯 → test-first（red→green）**：role/user filter SQL-build（LIKE/eq/limit/offset/count、沿 011/015 `*_active_model` SQL-build 模式）、size clamp（>100→100）、空參數略過 filter、`Entity→DTO` 映射（id=number / status·gender 字串 / createBy·updateBy null）、**UserItem 序列化不含 password**。
- **wiring / 形狀對映**（handler 接線 / enforce route_layer / Query extractor / paginate fetch）→ **由活體 acceptance（curl + psql）覆蓋**,明示「無新純函式單元測試」處。
- **無 CDP**（純後端 read;base-web 端到端留 prod-stack 巡檢 [CHECKLIST §2.8](../../docs/INTEGRATION-CHECKLIST.md)）。

**Organization**：6 phase；3 個 user story phase 對應 spec US1（角色清單,MVP）/ US2（使用者清單含角色）/ US3（全部角色）+ Polish。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔、無未完依賴）
- **[Story]**：US phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 **rust-api worktree 內相對路徑**（`rust-api/` 為 worktree root）

> **★ commit 提醒**：本 feature **純動 rust-api worktree**（3 migration + 2 entity + 3 facade + handler/system_manage.rs + main.rs + 刪 013 stub）→ **兩段式 commit**（worktree commit + push fork、外層 commit〔spec docs + **constitution amend v1.1.0 已先 commit 9f1452d / ace455f**〕+ bump rust-api SHA pin）。**不動 base-web、無外層 deploy 改動**（plan Structure Decision:與 015 不同、無 Dockerfile/compose 變動）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）;commit/push/merge 於 `executing-plans`/`finishing` 階段處理。

> **★ id wire = number 紀律**（constitution **v1.1.0** amend、D-1）：Output DTO 的 `id: i64` **直序列化成 JSON number**（**不** `to_string()`）。例外:`getUserInfo.userId` 維持 string（013 既有、本 feature 不碰）。

> **★ password 不洩漏紀律**（D-2 風險）：`sys_user` list facade 回 raw `Model` 含 password → **UserItem DTO 無 password 欄**;facade list fn 用 `select_only()` 投影排除 password（從源頭杜絕）、單測驗序列化無 "password"。

> **★ §I.5 破例**：schema 補欄型/命名經 **user 授權**交叉參照 rev1 rust-api（隔離抽純欄位事實、見 [research R9](./research.md)、plan D-2）;base-web typings 為 wire 權威、rev2 pattern 為建表權威。

---

## Phase 1: Setup (Pre-flight)

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`;外層在 `016-manage-role-user-list`;`docker run ... rev2-admin-rust-api:dev test` 既有基線綠（015 後 server 69+3 ignored + 17 lint〔`--test entity_access_lint`〕+ xdb 9）;確認**尚無** 016 產物（`ls rust-api/server/src/handler/system_manage.rs rust-api/migration/src/m20260529_000013*` 皆不存在）;確認 dev image + `deploy/secrets/database_url.txt` 可得;確認承接點存在（`grep -n "pub async fn enforce_mw" rust-api/server/src/auth/enforce.rs` / `grep -n "pub async fn roles_for_user" rust-api/server/src/model/facade/sys_user_role.rs` / `grep -n "get_user_list\|UserListStub" rust-api/server/src/handler/auth.rs`〔013 stub 待取代〕 / `grep -n "getUserList" rust-api/server/src/main.rs`〔enforce route_layer 範本〕 / 009 `m..009_seed_casbin_policy` 已 seed getUserList policy）。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：storage 補欄（兩表 alter + entity）+ policy seed + handler 模組骨架。**必須先完成才進 user story**（三 US 皆依賴 sys_role/sys_user 補欄 + handler 模組）。

- [ ] T002 migrations + register：`migration/src/m20260529_000013_alter_sys_role.rs`（alter add `description` string null / `status` string not_null default '1' / `created_at` timestamptz not_null default now() / `updated_at` timestamptz null;`down` drop 4 欄）+ `m20260529_000014_alter_sys_user.rs`（alter add `status` not_null default '1' / `gender` null / `phone` null / `email` null / `created_at` not_null default now() / `updated_at` null;`down` drop 6 欄）+ `m20260529_000015_seed_manage_policy.rs`（沿 `m..009` 寫法 `INSERT INTO casbin_rule ... ON CONFLICT DO NOTHING`:seed getRoleList + getAllRoles 各 R_SUPER/R_ADMIN〔getUserList **不**重 seed、009 已有〕;`down` DELETE 本 migration 4 條）+ `migration/src/lib.rs` 註冊 013/014/015（接 012 後、mod + migrations() vec）。`docker run ... build -p migration` 過。（[data-model §1](./data-model.md) / [research R3·R7](./research.md)）
- [ ] T003 entities 補欄：`entity/src/sys_role.rs`（+`description: Option<String>` / `status: String` / `created_at: DateTimeWithTimeZone` / `updated_at: Option<DateTimeWithTimeZone>`）+ `entity/src/sys_user.rs`（+`status: String` / `gender: Option<String>` / `phone: Option<String>` / `email: Option<String>` / `created_at: DateTimeWithTimeZone` / `updated_at: Option<DateTimeWithTimeZone>`;`password` 欄保留、**不入 wire DTO**）。`build -p entity` 過。（[data-model §2](./data-model.md)）
- [ ] T004 handler 模組骨架 + 分頁 wrapper 型：`server/src/handler/system_manage.rs`（新、空 handler 待 US 填）定義共用 `PageResp<T>{records:Vec<T>, current:u64, size:u64, total:u64}`（serde camelCase）+ 分頁參數正規化 helper（`current` 預設 1、`size` 預設 10、**clamp max 100**、抽純 fn 供 T013 單測）+ `server/src/handler/mod.rs` 加 `pub mod system_manage;`。`build -p server` 過。（[data-model §3·§4](./data-model.md)）

**Checkpoint**：兩表補欄（經 010）+ entity 同步 + policy seed + handler 模組骨架 + PageResp/分頁正規化;entity-access lint 仍綠（handler 骨架不碰 `entity::`、查詢待 facade）

---

## Phase 3: User Story 1 — 角色清單（分頁 + 搜尋）（Priority: P1）🎯 MVP

**Goal**：`getRoleList` 回分頁角色清單（含描述/狀態/時間）+ 依 roleName/roleCode/status 搜尋;掛 enforce。

**Independent Test**：dev stack up → Super Bearer 取 getRoleList（預設分頁 + roleName 搜尋 + status 篩選）→ `{records,current,size,total}`、id 為 number、只回 active;User → 403+5003。

- [ ] T005 [US1] facade `sys_role` list + SQL-build 單測（**test-first**）：`server/src/model/facade/sys_role.rs` 加 `list_paged(db, RoleFilter, current, size) -> Result<(Vec<Model>, u64), DbErr>`（`find_active` base + `roleName`/`roleCode` `.contains()` LIKE + `status` `.eq()`、空參數略過、`PaginatorTrait::paginate` 取 page + `num_items` 取 total、排序 created_at DESC）+ `all_active(db) -> Result<Vec<Model>, DbErr>`（US3 用、先放此檔）。抽 `role_list_query(filter)->Select<Entity>` SQL-build seam。**單測**（沿 011/015）：LIKE `%x%` + eq + limit/offset 出現、空 filter 無多餘 WHERE。依 T003。（[data-model §5](./data-model.md) / [research R4](./research.md)）
- [ ] T006 [US1] handler `get_role_list` + DTO + route+enforce：`server/src/handler/system_manage.rs` 加 `RoleItem`（id:i64→number、roleName/roleCode/roleDesc/status/createTime/updateTime、createBy·updateBy null、camelCase）+ `RoleSearchParams`（`Query<>`、皆 Option、camelCase）+ `pub async fn get_role_list(State, Query<RoleSearchParams>) -> Res<PageResp<RoleItem>>`（呼 facade list_paged、組 DTO、`Res::ok`）;`main.rs` 加 `.route("/systemManage/getRoleList", get(system_manage::get_role_list).route_layer(from_fn_with_state(state.clone(), enforce_mw)))`。`build -p server` 過 + 既有測試綠。**無新純函式單元測試（wiring）→ acceptance 覆蓋**。對應 spec US1 FR-001 + SC-001。（[data-model §3·§7](./data-model.md) / [research R7·R8](./research.md)）
- [ ] T007 [US1] curl acceptance（[verification §1·§2·§5](./contracts/verification-commands.md)）：dev stack up（postgres + `run --rm migrate` 套 001..015）+ rust-api up;Super Bearer getRoleList 預設分頁 → `{records,current,size,total=3}`、records[0].id 為 JSON number、含 roleDesc/status/createTime;`?roleName=admin` 模糊命中;`?status=1` 篩選;User → 403+5003、無 token → 3333。對應 spec US1 + SC-001/SC-004/SC-005。

**Checkpoint**：US1 達成（角色清單分頁+搜尋+enforce）= MVP 核心

---

## Phase 4: User Story 2 — 使用者清單（分頁 + 搜尋 + 所屬角色）（Priority: P2）

**Goal**：`getUserList` 回分頁使用者清單（含性別/電話/信箱/狀態/所屬角色）+ 搜尋;掛 enforce;**取代 013 stub**;**password 不洩漏**。

**Independent Test**：Super Bearer getUserList → 每列含 userRoles（role code 陣列）+ 無 password;依 userName/nickName 搜尋;User → 403+5003。

- [ ] T008 [US2] facade `sys_user` list + SQL-build 單測（**test-first**）：`server/src/model/facade/sys_user.rs` 加 `list_paged(db, UserFilter, current, size) -> Result<(Vec<...>, u64), DbErr>`（`find_active` base + `userName`/`nickName`/`phone`/`email` `.contains()` + `gender`/`status` `.eq()`、空參略過、paginate + count、排序 created_at DESC、**`select_only()` 投影排除 `password`**〔回投影 struct/tuple 或不含 password 的型〕）。抽 `user_list_query(filter)->Select<Entity>` SQL-build seam。**單測**：LIKE/eq/limit/offset + **投影不含 password 欄**（SQL `SELECT` 清單無 "password"）。依 T003。（[data-model §5·§6](./data-model.md) / [research R4·R6](./research.md)）
- [ ] T009 [US2] handler `get_user_list`（取代 013 stub）+ DTO + userRoles join + route+enforce：`server/src/handler/system_manage.rs` 加 `UserItem`（id:i64→number、userName/nickName/userGender/userPhone/userEmail/userRoles:Vec<String>/status/createTime/updateTime、createBy·updateBy null、**無 password**、camelCase）+ `UserSearchParams`（Query、camelCase）+ `pub async fn get_user_list(State, Query<UserSearchParams>) -> Res<PageResp<UserItem>>`（facade list_paged → 每列 `sys_user_role::roles_for_user(db, user.id)` 取 userRoles → 組 DTO）;**移除 013**:刪 `handler/auth.rs` 的 `UserListStub` + `get_user_list` stub;`main.rs` getUserList route 改指 `system_manage::get_user_list`（保留既有 `route_layer(enforce_mw)`〔009 已 seed 該 policy〕）。`build -p server` 過 + 既有測試綠。**無新純函式單元測試（wiring）→ acceptance 覆蓋**。對應 spec US2 FR-003/FR-004 + SC-002/SC-006。（[research R5·R6](./research.md) / [data-model §3·§7](./data-model.md)）
- [ ] T010 [US2] curl acceptance（[verification §3·§5](./contracts/verification-commands.md)）：Super Bearer getUserList → `{records,...}`、每列含 userRoles（Super→["R_SUPER"]）+ id number;**整個 response 不含 "password"**（grep 驗）;`?nickName=User` 模糊;User → 403+5003。對應 spec US2 + SC-002/SC-006。

**Checkpoint**：US1+US2 = 角色清單 + 使用者清單（含角色、無 password）

---

## Phase 5: User Story 3 — 全部角色（不分頁輕量）（Priority: P3）

**Goal**：`getAllRoles` 回全部 active 角色輕量清單（id/roleName/roleCode）、不分頁;掛 enforce。

**Independent Test**：Super Bearer getAllRoles → `AllRole[]`（{id:number, roleName, roleCode}、不分頁、只 active）;User → 403+5003。

- [ ] T011 [US3] handler `get_all_roles` + DTO + route+enforce：`server/src/handler/system_manage.rs` 加 `AllRoleItem`（id:i64→number、roleName、roleCode、camelCase;或直接用 RoleItem 投影子集）+ `pub async fn get_all_roles(State) -> Res<Vec<AllRoleItem>>`（呼 T005 的 `sys_role::all_active` → 組 DTO、**回純陣列非分頁**）;`main.rs` 加 `.route("/systemManage/getAllRoles", get(system_manage::get_all_roles).route_layer(from_fn_with_state(state.clone(), enforce_mw)))`。`build -p server` 過。**無新純函式單元測試（wiring）→ acceptance 覆蓋**。對應 spec US3 FR-002 + SC-003。（[data-model §3·§7](./data-model.md)）
- [ ] T012 [US3] curl acceptance（[verification §4·§5](./contracts/verification-commands.md)）：Super Bearer getAllRoles → `data` 為 array（非分頁 wrapper）、每筆 {id:number, roleName, roleCode}、3 條 active role;User → 403+5003。對應 spec US3 + SC-003/SC-004。

**Checkpoint**：三 US 活體達成（角色清單 / 使用者清單含角色 / 全部角色）

---

## Phase 6: Polish + 守恆

- [ ] T013 分頁正規化 + 空參數 純單測（[verification §6](./contracts/verification-commands.md)）：純單測驗 T004 分頁正規化 helper（`size>100→100`、`size` 缺→10、`current` 缺→1、`current=0`→1〔或文件定義邊界〕）+ filter 空參數略過（role/user `*_list_query` 對空 Option 不加 WHERE）。對應 spec FR-008/FR-009 + SC-005。
- [ ] T014 既有不破 + 契約守恆 + Constitution 自查（[verification §0](./contracts/verification-commands.md)）：
    * (a) 既有 + 新單測全綠：`docker run ... rev2-admin-rust-api:dev test`（015 後 69+3 ignored + 新增 016 role/user filter SQL-build + 分頁正規化 + no-password 投影單測）
    * (b) **009 entity-access lint 續綠**：`docker run ... test -p server --test entity_access_lint`（**用 `--test`**;handler/system_manage.rs 不碰 `entity::`、role/user 查詢只經 facade）= 17 passed
    * (c) **prod runtime image build sanity**（無新 dep,但 alter migration + 新 handler/facade 須過 release build）：`DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-016 .`
    * (d) **FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中
    * (e) **scope 邊界**：psql 驗 sys_role 補 4 欄 + sys_user 補 6 欄 + 既有 3 seed role/user `status='1'` + casbin_rule `v2='GET' AND v1 LIKE '/systemManage/%'` = 6 條;`grep entity:: rust-api/server/src/handler/system_manage.rs` 無命中（只 facade）;**無新建表 migration**（只 alter、`git -C rust-api diff <base>..HEAD --stat` 不含 `create_sys_*`/`sys_menu`）;sys_operation_log/casbin_rule entity 未動
    * (f) **password 不洩漏**：getUserList 活體 + 單測雙證 response 無 "password"
    * (g) **Constitution 自查**：`grep -c "✅ Pass" specs/016-manage-role-user-list/plan.md` ≥ 14（7+7）;constitution **v1.1.0**（id=number amend 已 commit 9f1452d）;Deviation D-1（id amend）/ D-2（rev1 隔離參照破 §I.5）/ D-3（operator 折 Phase 4 A）已記
    * (h) `/health` 不破：`curl :21081/health`=ok

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit:rust-api worktree code + 外層 spec docs〔constitution amend 已先 commit〕+ SHA pin、不動 base-web）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup;**阻斷所有 user story**（兩表補欄 + entity + policy seed + handler 骨架）
- **US1(Phase 3,P1)**：依 Foundational（T002 m..013 sys_role 補欄 + m..015 getRoleList policy + T003 entity + T004 handler 骨架/PageResp）;MVP
- **US2(Phase 4,P2)**：依 Foundational（T002 m..014 sys_user 補欄 + 009 既有 getUserList policy + T003 entity + T004 骨架）;與 US1 獨立（不同表/facade/handler fn）
- **US3(Phase 5,P3)**：依 Foundational + **US1 T005**（`sys_role::all_active` 放在 T005 同檔）;經 sys_role facade → 與 US2 獨立
- **Polish(Phase 6)**：依所有 user story

### Within / Cross Phases

- Foundational：T002（migration）→ T003（entity）→ T004（handler 骨架）。
- US1：T005（facade list+SQL-build 單測）→ T006（handler+route+enforce）→ T007（curl）。
- US2：T008（facade list+no-password 單測）→ T009（handler+userRoles+取代 stub+route）→ T010（curl）。
- US3：T011（handler all_roles+route,依 US1 T005 all_active）→ T012（curl）。
- Polish：T013（分頁/空參數單測）→ T014（守恆+Constitution）。

### Parallel Opportunities

- US1 T005（sys_role facade）/ US2 T008（sys_user facade）邏輯獨立、不同檔 → 可並行（皆依 T003）。
- handler（T006/T009/T011）共改 `system_manage.rs` + `main.rs` → 序列（同檔）。
- acceptance（T007/T010/T012）依 live stack → 序列。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T004)→ US1（T005-T007 curl）
2. **STOP and VALIDATE**：角色清單分頁+搜尋+enforce curl 綠 = manage/role 頁可用 = MVP
3. + US2（使用者清單含角色、取代 013 stub）+ US3（全部角色）→ 三 US 齊
4. + Polish（T013 分頁/空參數單測 + T014 守恆 + prod build + Constitution）
5. `superpowers:finishing-a-development-branch` → **兩段式 commit**（rust-api worktree push fork + 外層〔spec docs;constitution amend 已先 commit〕+ SHA pin;**不動 base-web**）+ merge --no-ff 回 `rev2-admin-root` + 回填 DESIGN/CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy（executing-plans 階段）

- Foundational(T002-T004)：migration（T002）、entity（T003）、handler 骨架+PageResp（T004）。
- US1(T005-T007)/ US2(T008-T010)/ US3(T011-T012)：facade+單測 → handler+route+enforce → curl,各對照 spec 驗收。
- Polish（T013 分頁/空參單測 / T014 守恆+Constitution）。
- **★ commit 紀律**：兩段式 commit（rust-api worktree + 外層 spec docs）;各 unit spec+quality 雙審。

---

## Notes

- **純 rust-api worktree feature（不動 base-web、無外層 deploy 改動）**：3 migration + 2 entity 補欄 + 3 facade（sys_role list+all / sys_user list / sys_user_role 重用）+ handler/system_manage.rs（新）+ main.rs（3 route enforce + 取代 013 getUserList stub）+ 刪 auth.rs stub。constitution amend v1.1.0（id→number）已先獨立 commit（9f1452d / DESIGN 回填 ace455f）。
- **id wire = number**（D-1、constitution v1.1.0）;**password 不洩漏**（D-2、list 投影排除）;**status/gender VARCHAR '1'/'2'**（對齊 base-web、DB 值域約束折 Phase 4 A、D-3）。
- **無新 workspace crate、無新 dep**（sea-orm paginate/LIKE 內建）;首次引入分頁/LIKE pattern（017 menu 沿用）。
- **守** 008 envelope + 009 entity-access lint + 007 FR-009 + soft-delete（只回 active）+ 013 enforce。
- **menu 三件 / 寫入 / operator 歸屬 / avatar / domain / async = scope 外**（017 + Phase 4 A）。
- `superpowers:executing-plans` 階段把這 14 個 task 編成 execution unit + 派 fresh implementer subagent。
