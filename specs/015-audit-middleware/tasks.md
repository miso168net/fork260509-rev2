---
description: "Task list for 015-audit-middleware implementation"
---

# Tasks: audit-middleware

**Input**: Design documents from `/specs/015-audit-middleware/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**（對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0）：
- **純邏輯 → test-first（red→green）**：`client_ip`/`x_forwarded_for` 抽取、`trace_id`（X-Request-Id else uuid）、facade `*_active_model` SQL-build（INET 寫真值、不再 42804）。沿 011 `audit_active_model` SQL-build 模式。
- **wiring / 形狀對映**（middleware 接線 / login handler 寫入 / ConnectInfo / xdb searcher_init）→ **由活體 acceptance（curl + psql）覆蓋**,明示「無新純函式單元測試」處。
- **無 CDP**（D10、純後端）。best-effort（SC-004）以純單測覆蓋。

**Organization**：6 phase；3 個 user story phase 對應 spec US1（登入嘗試成敗,MVP）/ US2（已認證請求 access log）/ US3（來源忠實擷取）+ Polish。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可並行（不同檔、無未完依賴）
- **[Story]**：US phase 內必加（US1/US2/US3）；Setup/Foundational/Polish 無 story label
- 全 file path 為 **rust-api worktree 內相對路徑**（`rust-api/` 為 worktree root）；**外層檔**（非 worktree）標明 `deploy/` 或 `docker-compose*.yml`

> **★ commit 提醒**：本 feature **動 rust-api worktree**（middleware + 2 entity + 2 migration + 2 facade + login handler + main.rs + Cargo）**＋ 外層**（`deploy/Dockerfile.rust-api.txt` runtime COPY xdb + `docker-compose.{dev,prod}.yml` `XDB_FILEPATH`）→ **兩段式 commit**（worktree commit + push fork、外層 commit〔Dockerfile/compose/spec docs〕+ bump rust-api SHA pin）。**不動 base-web**（plan D-1：Dockerfile/compose 為外層、非 worktree）。**本 tasks.md 不排 git push/merge 任務**（[CLAUDE.md §3](../../CLAUDE.md) 紀律）;commit/push/merge 於 `executing-plans`/`finishing` 階段處理。

> **★ §2.14 / §2.15 紀律**：INET 真值寫入走 **sea-orm `with-ipnetwork` + `IpNetwork`**（plan R5、§2.14 機制解;**不 retrofit 011 sys_operation_log**、折 Phase 4 A）。xdb runtime 走 **`XDB_FILEPATH` env + prod runtime COPY `ip2region.xdb`**（plan R4、§2.15;015 = 首個 xdb 消費者）。

> **★ best-effort 紀律**：access-log / login-attempt 寫入**失敗只 `tracing::warn!`、不失敗業務請求**（FR-007、**非** 011 `mutate_in_txn` 原子）。

---

## Phase 1: Setup (Pre-flight)

- [ ] T001 Pre-flight：`git -C rust-api branch --show-current` = `rev2-admin-rust-api`;外層在 `015-audit-middleware`;`docker run ... rev2-admin-rust-api:dev test` 既有基線綠（014 後 server 56+3 ignored + 17 lint〔`--test entity_access_lint`〕+ xdb 9 + adapter 2 ignored）;確認**尚無** 015 產物（`ls rust-api/server/src/audit_ctx.rs rust-api/entity/src/sys_access_log.rs rust-api/migration/src/m20260529_000011*` 皆不存在）;確認 dev image + `deploy/secrets/database_url.txt` 可得;確認承接點存在（`grep -r "pub fn search_by_ip\|pub fn searcher_init" rust-api/xdb/src` / `grep enforcer rust-api/server/src/state.rs` / `grep "pub fn verify\|pub fn bearer_token" rust-api/server/src/auth/` / 011 `mutate_in_txn` facade 模式）。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：deps + 兩審計表 + 純型 + facade + request-context middleware 骨架 + main.rs 接線 + xdb runtime 打包。**必須先完成才進 user story**。

- [ ] T002 Cargo deps：`Cargo.toml`（workspace）sea-orm features += `"with-ipnetwork"`;`server/Cargo.toml` += `uuid = { version = "<lock 既有版>", features = ["v4"] }`（uuid 已 transitive 於 `Cargo.lock`、取同版）。`docker run ... build -p server` 過（確認 with-ipnetwork 拉入 `ipnetwork` + uuid 解析）。（[research R5/R7](./research.md)）
- [ ] T003 migrations + register：`migration/src/m20260529_000011_create_sys_access_log.rs` + `m20260529_000012_create_sys_login_attempt.rs`（沿 `m..004` 寫法:`Table::create().if_not_exists()`、INET `client_ip` `.custom(Alias::new("INET")).not_null()`、append-only 無 `deleted_at`;`m..012` 另 `create_index` 兩條 `(attempted_user_name,created_at)` / `(client_ip,created_at)`）+ `migration/src/lib.rs` 註冊 011/012（接 010 後）。`build -p migration` 過。（[data-model §1](./data-model.md)）
- [ ] T004 entities：`entity/src/sys_access_log.rs` + `sys_login_attempt.rs`（`DeriveEntityModel`、`client_ip: IpNetwork`〔確認 import path:sea_orm re-export vs `ipnetwork` direct〕、欄對齊 data-model §2）+ `entity/src/lib.rs` 註冊 mod。`build -p entity` 過。（[data-model §2](./data-model.md)）
- [ ] T005 純 event 型 + RequestContext：`server/src/audit_ctx.rs`（新）定義 `AccessLogEvent` / `LoginAttemptEvent`（**不含 `entity::` path**、`client_ip: IpAddr`）+ `RequestContext{operator_id:Option<i64>, client_ip:IpAddr, x_forwarded_for:Option<String>, region:Option<String>, trace_id:String}`。`build -p server` 過。（[data-model §3/§4](./data-model.md)）
- [ ] T006 [P] facade `sys_access_log::write` + SQL-build 單測（**test-first**）：`server/src/model/facade/sys_access_log.rs`（唯一構造 `entity::sys_access_log::ActiveModel`、`AccessLogEvent→ActiveModel` 抽 `*_active_model` seam、`client_ip: IpNetwork::from(ev.client_ip)`）。單測驗 INSERT 目標表 + 欄齊 + **INET `client_ip` 寫真值（`build(DbBackend::Postgres)` 含 `::inet` cast 或欄含值、不再 42804）**。依 T004/T005。（[data-model §5](./data-model.md) / [research R5](./research.md)）
- [ ] T007 [P] facade `sys_login_attempt::write` + SQL-build 單測（**test-first**）：`server/src/model/facade/sys_login_attempt.rs`（同上模式、`LoginAttemptEvent→ActiveModel`）。單測同驗 INET + 欄齊。依 T004/T005。
- [ ] T008 request-context 抽取 pure logic + 單測（**test-first**）：`server/src/audit_ctx.rs` 加 `client_ip`（`ConnectInfo<SocketAddr>` peer→`IpAddr`）/ `x_forwarded_for`（`HeaderMap` 取 `X-Forwarded-For` raw、無→None）/ `trace_id`（`X-Request-Id` 截斷 ≤64 else `Uuid::new_v4()`）抽取 helper。**單測**：XFF 有→raw 鏈、無→None;trace_id 沿用入站 / 無則生成非空。（[data-model §4](./data-model.md) / [research R3/R7](./research.md)）
- [ ] T009 middleware 骨架 + main.rs 接線：`server/src/audit_ctx.rs` 加 `audit_mw`（`from_fn`:建 `RequestContext`〔client_ip/xff/trace_id〔T008〕+ region〔`xdb::search_by_ip`、Err→None〕+ operator_id〔bearer→`jwt::verify`→user_id、失敗→None〕〕→ `req.extensions_mut().insert(ctx)` → `next.run`;**本步不寫 access-log**〔US2 加〕）+ `main.rs`:`.layer(axum::middleware::from_fn(audit_ctx::audit_mw))` 掛全 Router、`axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())`、boot `xdb::searcher_init(None)`。`build -p server` 過 + 既有測試仍綠。**無新純函式單元測試（wiring）→ 由 acceptance 覆蓋**。（[research R1/R2/R4](./research.md)）
- [ ] T010 xdb runtime 打包（**外層檔**）：`deploy/Dockerfile.rust-api.txt` runtime stage 加 `COPY rust-api/xdb/resources/ip2region.xdb ./resources/ip2region.xdb`（WORKDIR `/app`）;`docker-compose.dev.yml` rust-api 加 `XDB_FILEPATH=/app/xdb/resources/ip2region.xdb`、`docker-compose.prod.yml`（若 rust-api service 在）加 `XDB_FILEPATH=/app/resources/ip2region.xdb`。（[research R4](./research.md)、§2.15）

**Checkpoint**：deps + 兩表（經 010）+ facade（SQL-build 單測綠、INET 真值）+ request-context middleware 骨架（ctx 建、未寫 log）+ main 接線 + xdb runtime;entity-access lint 仍綠（audit_ctx/middleware 不碰 `entity::`、facade 為唯一管道）

---

## Phase 3: User Story 1 — 記錄登入嘗試（成功與失敗）（Priority: P1）🎯 MVP

**Goal**：login handler 對每次登入嘗試（成敗）寫一筆 `sys_login_attempt`，供未來 lockout。

**Independent Test**：dev stack up → 正確/錯誤帳密各登入一次 → psql 查 `sys_login_attempt` 各 1 筆（成功筆 success=t + operator_id、失敗筆 success=f + attempted_user_name + operator_id NULL）+ 含 INET client_ip + region。

- [ ] T011 [US1] login handler 寫登入嘗試：`server/src/handler/auth.rs::login` 加 `Extension<RequestContext>` extractor;決成敗後 **best-effort** `sys_login_attempt::write`（`success`、`attempted_user_name`=req.user_name〔截斷 ≤64〕、`operator_id`=成功時 Some(user.id) 否則 None、ctx 來源/trace_id;`Err` 只 `tracing::warn!`、不影響 login 回應）。`build -p server` 過。**無新純函式單元測試（wiring）→ acceptance 覆蓋**。對應 spec US1 FR-001 + SC-002。（[research R6](./research.md) / [data-model §6](./data-model.md)）
- [ ] T012 [US1] curl acceptance（[verification §1/§2](./contracts/verification-commands.md)）：dev stack up（postgres + `run --rm migrate` 套 001..012）+ rust-api up（`XDB_FILEPATH` 已設、`/health` ok = searcher_init 找到 xdb）;login 成功（Super）/失敗（壞密碼）各一次 → psql `sys_login_attempt` 最新 2 筆:成功 success=t + operator_id 非空、失敗 success=f + attempted_user_name='Super' + operator_id NULL;兩筆皆 INET `client_ip` 真值 + region。對應 spec US1 + SC-002。

**Checkpoint**：US1 達成（登入嘗試成敗記錄）= MVP 核心（lockout 資料源就緒）

---

## Phase 4: User Story 2 — 記錄已認證請求 access log（Priority: P2）

**Goal**：middleware 對每個已認證請求寫一筆 `sys_access_log`；公開/health 不寫。

**Independent Test**：getUserInfo（Bearer）→ `sys_access_log` 1 筆（operator_id + method/path/status + INET + region）;getConstantRoutes（公開）/ `/health` → 不寫;過期 token → 不寫。

- [ ] T013 [US2] middleware access-log 寫入：`server/src/audit_ctx.rs::audit_mw` 在 `next.run` 後加 **iff `operator_id` Some**（已認證）→ **best-effort** `sys_access_log::write`（operator_id/method/path/`http_status`〔取 response status〕/ctx 來源/trace_id;`Err` 只 warn）。無/壞 token → operator_id None → skip（R2 閘門:天然涵蓋 public/health/login 不寫）。`build -p server` 過。對應 spec US2 FR-003/FR-004 + SC-001/SC-005。（[research R2](./research.md)）
- [ ] T014 [US2] curl acceptance（[verification §3](./contracts/verification-commands.md)）：`getUserInfo` Bearer → `sys_access_log` 1 筆（operator_id 非空、method=GET、path=/auth/getUserInfo、http_status=200、INET client_ip、region）;`getConstantRoutes`（公開）+ `/health` → access-log 筆數不變（不寫）;無 Bearer 的 getUserInfo（3333）→ 不寫。對應 spec US2 + SC-001/SC-005。

**Checkpoint**：US1+US2 = 登入嘗試 + 已認證請求 access log（公開/health 不寫）

---

## Phase 5: User Story 3 — 忠實擷取請求來源（Priority: P3）

**Goal**：來源同時保存直連 client_ip（INET）+ 原始 x_forwarded_for 鏈 + region;實作於 Foundational（T008/T009）已備、此 phase 端到端驗。

**Independent Test**：帶 `X-Forwarded-For` 的請求 → `x_forwarded_for` 存原始鏈、`client_ip` 仍直連、region 非空;不帶 → `x_forwarded_for` NULL、client_ip 仍有值。

- [ ] T015 [US3] curl acceptance（[verification §4](./contracts/verification-commands.md)）：`getUserInfo` Bearer + `-H "X-Forwarded-For: 1.2.4.8, 10.0.0.1"` → psql 最新 `sys_access_log`:`x_forwarded_for`='1.2.4.8, 10.0.0.1'（逐字）、`client_ip`=直連 peer INET（**非** XFF 解析）、region 非空;不帶 XFF → `x_forwarded_for` NULL、client_ip 仍 INET 真值。對應 spec US3 + SC-003。

**Checkpoint**：三 US 活體達成（登入嘗試 / access-log / 來源忠實 client_ip+XFF+region）

---

## Phase 6: Polish + 守恆

- [ ] T016 best-effort 單測（[verification §5](./contracts/verification-commands.md)、SC-004）：純單測驗 audit-write 路徑回 `Err` 時 middleware（T013）/ login handler（T011）**不傳播**（業務回應仍正常、僅 warn）。可用 facade write 注入失敗 seam 或對 best-effort wrapper 直接測。對應 spec SC-004 / FR-007。
- [ ] T017 既有不破 + 契約守恆 + Constitution 自查（[verification §0](./contracts/verification-commands.md)）：
    * (a) 既有 + 新單測全綠：`docker run ... rev2-admin-rust-api:dev test`（014 後 56+3 ignored + 新增 015 client_ip/xff/trace_id/SQL-build/best-effort 單測 + 17 lint + xdb 9）
    * (b) **009 entity-access lint 續綠**：`docker run ... test -p server --test entity_access_lint`（**用 `--test`**;`audit_ctx`/middleware/login-handler 不碰 `entity::`、新表只經新 facade）= 17 passed
    * (c) **prod runtime image build + xdb 打包驗（§2.15）**：`DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-015 .`（新 dep uuid + with-ipnetwork〔拉 ipnetwork〕+ runtime COPY）;`docker run --rm --entrypoint sh ...:prod-verify-015 -c 'ls -la /app/resources/ip2region.xdb'` 存在 ~11MB
    * (d) **FR-009 regression**：`grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/` 無命中
    * (e) **scope 邊界**：psql 兩表存在 + `client_ip` data_type=`inet` + `sys_login_attempt` 兩 index;`audit_ctx`/middleware/login-handler `grep entity::` 無命中（只 facade）;`sys_operation_log`/`casbin_rule` 未動（`git diff` 不含其 migration/entity）
    * (f) **Constitution 自查**：`grep -c "✅ Pass" specs/015-audit-middleware/plan.md` ≥ 14（7+7）;Deviation D-1（Dockerfile/compose 外層）/ D-2（§2.14 sys_operation_log 折 Phase 4）已記
    * (g) `/health` 不破：`curl :21081/health`=ok

**Checkpoint**：feature 完整、可進 `superpowers:finishing-a-development-branch`（★ 兩段式 commit:rust-api worktree code + 外層 Dockerfile/compose/spec docs + SHA pin、不動 base-web）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**：無依賴
- **Foundational(Phase 2)**：依 Setup;**阻斷所有 user story**（deps + 表 + facade + middleware 骨架 + main 接線 + xdb runtime）
- **US1(Phase 3,P1)**：依 Foundational（T005 RequestContext + T007 facade + T009 middleware 建 ctx + T010 xdb runtime）;MVP
- **US2(Phase 4,P2)**：依 Foundational（T006 facade + T009 middleware 骨架）;與 US1 獨立（不同寫入路徑:US1=login handler、US2=middleware）
- **US3(Phase 5,P3)**：依 Foundational（T008/T009 來源擷取）+ 任一寫入路徑（驗 access-log 的來源欄、實務上接 US2 後驗最直接）
- **Polish(Phase 6)**：依所有 user story

### Within / Cross Phases

- Foundational：T002（deps）先 → T003（migration）/ T004（entity）/ T005（純型）→ T006/T007（facade,[P] 不同檔)→ T008（抽取 pure)→ T009（middleware+main,依 T005/T008)→ T010（xdb runtime,外層)。
- US1：T011（login handler）→ T012（curl)。
- US2：T013（middleware 寫入）→ T014（curl)。
- US3：T015（curl,接 US2 後)。
- Polish：T016（best-effort 單測)→ T017（守恆+Constitution)。

### Parallel Opportunities

- T006（facade sys_access_log）/ T007（facade sys_login_attempt）邏輯獨立、不同檔 → 可並行（皆依 T004/T005）。
- 其餘多為序列（middleware/main 共改、acceptance 依 live stack）。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002-T010)→ US1（T011-T012 curl）
2. **STOP and VALIDATE**：登入嘗試成敗記錄 curl 綠 = lockout 資料源就緒 = MVP
3. + US2（access-log）+ US3（來源忠實）→ 三 US 齊
4. + Polish（T016 best-effort 單測 + T017 守恆 + prod build + xdb 打包 + Constitution）
5. `superpowers:finishing-a-development-branch` → **兩段式 commit**（rust-api worktree push fork + 外層〔Dockerfile/compose/spec docs〕+ SHA pin;**不動 base-web**）+ merge --no-ff 回 `rev2-admin-root` + 回填 DESIGN/CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy（executing-plans 階段）

- Foundational(T002-T010)：deps（T002）、storage（T003/T004）、純型（T005）、facade+SQL-build 單測（T006/T007、[P]）、抽取 pure+單測（T008）、middleware+main 接線（T009）、xdb runtime（T010 外層）。
- US1(T011-T012)/ US2(T013-T014)/ US3(T015)：寫入 + curl,各對照 spec 驗收。
- Polish（T016 best-effort 單測 / T017 守恆+Constitution）。
- **★ commit 紀律**：兩段式 commit（rust-api worktree + 外層 Dockerfile/compose）;各 unit spec+quality 雙審。

---

## Notes

- **兩段式 commit feature（不動 base-web）**：動 rust-api worktree（middleware/表/handler/Cargo）+ **外層** `deploy/Dockerfile.rust-api.txt` + `docker-compose.{dev,prod}.yml`（plan D-1:Dockerfile/compose 為外層、非 worktree）。
- **§2.14 機制解**（with-ipnetwork + IpNetwork）+ **§2.15 解**（XDB_FILEPATH + prod COPY、首個 xdb 消費者）;**sys_operation_log 不 retrofit**（plan D-2、折 Phase 4 A）。
- **無新 workspace crate**;新 dep `uuid`（已 transitive）+ sea-orm `with-ipnetwork`（拉 ipnetwork）→ acceptance 含 prod build。
- **best-effort**（FR-007、非 011 原子）;守 007 FR-009 + 008 envelope + 009 entity-access lint + 011 facade 邊界。
- **A（資料變動補 operator）/ login lockout / XFF-trust 解析 / async 寫入 = scope 外**。
- `superpowers:executing-plans` 階段把這 17 個 task 編成 execution unit + 派 fresh implementer subagent。
