# Tasks: 015-audit-middleware

**Branch**: `015-audit-middleware` | **Date**: 2026-06-01
**Input**: [plan.md](plan.md) / [spec.md](spec.md) / [research.md](research.md) / [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md)

> **實作交棒對象**:本檔。用 `superpowers:executing-plans`(**非** `/speckit-implement`)起手。
> **TDD 紀律**(CLAUDE.md §3 / §I.4):純函式(region 解析 / IP·XFF 擷取 / 兩表 SQL-build)**test-first(red→green)**;wiring/形狀類(ctx_mw 接線、login handler 寫入、ConnectInfo、Dockerfile)**無新純函式單測 → 由 acceptance 覆蓋**(已於各 task 明示)。
> **★ 鐵紀律**:本檔**不含**任何 `git push` / `git merge` / 外層 bump SHA pin —— 那些只在 `superpowers:finishing-a-development-branch` 階段執行(§3)。實作期間的 worktree `git commit` 可,push/merge 不可。
> **環境**:host 無 cargo → dev docker 編譯(memory `project_rustapi_build_test_env`);**act on actual code**(型/API 以實際編譯為準)。

---

## Phase 1:Setup(依賴 + 部署配置)

- [ ] T001 [P] 加依賴:`rust-api/server/Cargo.toml` += `uuid = { version="1", features=["v4"] }` + `xdb = { path="../xdb" }`;`rust-api/Cargo.toml`(workspace)sea-orm features += `with-ipnetwork`、加 `ipnetwork` dep。**驗 Rust 1.86 可編**(R1/R2/R6;pin 具體版本)。
- [ ] T002 [P] 部署配置:`deploy/Dockerfile.rust-api.txt` runtime stage COPY `xdb/resources/ip2region.xdb`(11MB)進 image;`docker-compose.dev.yml` / `docker-compose.prod.yml` 設 `XDB_FILEPATH` env(dev=bind-mount path / prod=image COPY path)。**無單測**(部署配置;由 T019 prod build acceptance 覆蓋)。

## Phase 2:Foundational(US1+US2 的 blocking 前置)

- [ ] T003 [P] migration `rust-api/migration/src/m20260529_000011_create_sys_access_log.rs`:append-only 表(`client_ip` INET via `.custom(Alias::new("INET"))`、`created_at` default `now()`、**無 `deleted_at`/`updated_*`**;欄見 data-model §1)。
- [ ] T004 [P] migration `rust-api/migration/src/m20260529_000012_create_sys_login_attempt.rs`:append-only 表 + 2 index `idx_login_attempt_user_time(attempted_user_name,created_at)` / `idx_login_attempt_ip_time(client_ip,created_at)`(FR-008;data-model §2)。
- [ ] T005 註冊 migration:`rust-api/migration/src/lib.rs` 加 011/012 的 `mod` + `migrations()` vec(經 010 自動套、server 不自動 migrate)。依賴 T003,T004。
- [ ] T006 [P] entity `rust-api/entity/src/sys_access_log.rs`(沿 `sys_operation_log` append-only 範本:auto-inc id、created_at、無 deleted_at、不 impl SoftDeletable、空 Relation;`client_ip: IpNetwork`)+ `entity/src/lib.rs` `pub mod`。
- [ ] T007 [P] entity `rust-api/entity/src/sys_login_attempt.rs`(同範本)+ `entity/src/lib.rs` `pub mod`。
- [ ] T008 ConnectInfo + xdb 啟動:`rust-api/server/src/main.rs` `axum::serve(listener, app)` → `serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())`;boot 時 `xdb::searcher_init(Some(env XDB_FILEPATH))`。依賴 T001。**無單測**(boot wiring;由 T013/T019 acceptance 覆蓋)。
- [ ] T009 region 解析薄封裝 + **純單測(test-first)**:`rust-api/server/src/audit_ctx.rs` 內 `resolve_region(ip) -> Option<String>`(呼 `xdb::search_by_ip`、`Err→None`);單測斷言私有/已知 IP → 非空 `|` 分段字串、IPv6/壞輸入 → None(沿 012 xdb 測試模式)。依賴 T001。
- [ ] T010 RequestContext + request-context middleware + **純單測(IP/XFF 擷取,test-first)**:`rust-api/server/src/audit_ctx.rs` 定義 `RequestContext`(client_ip/x_forwarded_for/region/trace_id/operator_id)+ `ctx_mw`(before-next 擷取:`ConnectInfo` client_ip、raw `X-Forwarded-For`、`resolve_region`、`trace_id`=`X-Request-Id`∨`Uuid::new_v4()`、`bearer_token→jwt::verify→claims.user_id`→operator_id;塞 request extension);`main.rs` 全域 `.layer(from_fn_with_state(state, ctx_mw))`。單測:有 XFF→raw 保存、無 XFF→None。依賴 T008,T009。

## Phase 3:User Story 1 — 已認證請求存取軌跡(P1)🎯 MVP

**Goal**:每筆已認證請求 best-effort 留一筆 `sys_access_log`;公開/health/認證失敗不留。
**Independent Test**:已認證打 `getUserInfo` → `sys_access_log` 多 1 筆(operator/method/path/status/INET client_ip/region);打 `getConstantRoutes`/`health` → 不增。

- [ ] T011 [P] [US1] facade `rust-api/server/src/model/facade/sys_access_log.rs`:private `access_log_active_model(entry) -> entity::sys_access_log::ActiveModel` + `pub async fn write(db, entry) -> Result<(),DbErr>`;註冊 `facade/mod.rs`。**純單測(test-first)**:SQL-build 斷言 `client_ip` IpNetwork 真值正確綁 inet、欄齊(沿 011 `audit_active_model` 模式)。守 009 lint(唯一構造 `entity::sys_access_log::ActiveModel` 之處、在 facade/)。
- [ ] T012 [US1] access-log 寫入:`audit_ctx.rs` `ctx_mw` 的 after-`next` 段 —— 讀最終 response status,`operator_id.is_some()` 閘門(=已認證)→ best-effort `facade::sys_access_log::write`(`Err` 只 `tracing::warn!`、不破回應,FR-003)。依賴 T010,T011。**無新純函式單測**(middleware wiring → 由 T013 acceptance 覆蓋)。
- [ ] T013 [US1] **acceptance**(contracts §3,in-crate `#[ignore]` live-DB + dev stack curl/psql):已認證 getUserInfo → 1 筆(operator_id/method/path/http_status/INET client_ip 真值無 42804/has_region=t/has_trace=t);getConstantRoutes+health → 不增;`client_ip << '0.0.0.0/0'` 可過濾(SC-005)。依賴 T012。

## Phase 4:User Story 2 — 登入嘗試成敗皆留證(P2)

**Goal**:每次登入成敗各留一筆 `sys_login_attempt`。
**Independent Test**:正確密碼登入→success=true+operator;錯誤密碼→success=false+attempted_user_name+operator NULL。

- [ ] T014 [P] [US2] facade `rust-api/server/src/model/facade/sys_login_attempt.rs`:private `login_attempt_active_model` + `pub async fn write(db, attempt)`;註冊 `facade/mod.rs`。**純單測(test-first)**:SQL-build 斷言欄齊、`operator_id` None(失敗)/Some(成功)、`client_ip` 真值。守 009 lint。
- [ ] T015 [US2] login handler 寫入:`rust-api/server/src/handler/auth.rs` `login` —— 從 request extension 讀 `RequestContext`(client_ip/region/xff/trace_id),成功與失敗各組 `sys_login_attempt`(成功帶 operator_id=user_id、失敗 attempted_user_name + operator_id None)best-effort `write`。依賴 T010,T014。**無新純函式單測**(handler wiring → T016 acceptance 覆蓋)。
- [ ] T016 [US2] **acceptance**(contracts §4,curl/psql):成功登入→success=t/operator_id=user_id;錯誤密碼→success=f/operator_id NULL/attempted_user_name 正確。依賴 T015。

## Phase 5:User Story 3 — 紀錄帶可信來源脈絡(P3)

**Goal**:紀錄的脈絡欄忠實正確(INET 真值、XFF 逐字、region 由直連 IP、trace_id 可關聯)。
**Independent Test**:對任一筆紀錄 psql 驗 XFF 逐字、client_ip=直連 peer(非 XFF leftmost)、region 非空、trace_id 沿用 X-Request-Id。

- [ ] T017 [US3] **acceptance**(contracts §5,curl/psql):帶 `X-Forwarded-For: 1.2.4.8, 10.0.0.1` → `x_forwarded_for` 逐字保存且 `client_ip`=直連 peer(**非** XFF leftmost,FR-006);帶 `X-Request-Id: req-abc-123` → `trace_id` 沿用;dev 私有 IP → `region` 非空(`内网IP`,SC-003)。依賴 T013(任一 access_log 筆)。*(脈絡擷取機制本體於 T009/T010 已 test-first;US3 = 忠實度驗收。)*

## Phase 6:Polish & Cross-Cutting

- [ ] T018 SC-004 best-effort 不破業務:in-crate `#[ignore]` live-DB 或 acceptance —— 模擬 `sys_access_log` 寫入失敗(注入 facade `write` Err 或暫 `REVOKE INSERT`)→ 打已認證請求,業務回應仍 `Res<T>` status 200(稽核失敗只 warn)。
- [ ] T019 守恆 + **prod runtime image build**(contracts §7/§8,★ 必跑):server 既有測試 + `entity_access_lint`(`--test entity_access_lint`,新 facade 不破)+ xdb 9 全綠;`grep Migrator::up server/src` = 0(守 007 FR-009);`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`(編進 uuid/ipnetwork、runtime 含 `ip2region.xdb`)+ prod 容器內已認證請求 region 非 NULL(xdb 解析得到)。

---

## Dependencies(US 完成順序)

```
Setup(T001,T002)
   └─ Foundational(T003–T010)            ← US1+US2 共同 blocking
        ├─ US1(T011→T012→T013)🎯 MVP
        ├─ US2(T014→T015→T016)            ← 與 US1 獨立(不同表/觸發);皆依 Foundational
        └─ US3(T017)                      ← 依 US1 有 access_log 筆可驗
   └─ Polish(T018,T019)                   ← 全 US 後
```

- **US1 ⟂ US2**:不同表(access_log vs login_attempt)、不同觸發(middleware vs login handler),可並行(皆建於 Foundational ctx_mw 之上)。
- **MVP = Setup + Foundational + US1**:已認證請求存取軌跡可用即交付。

## Parallel 範例

- Setup:`T001`(deps)∥ `T002`(deploy)。
- Foundational:`T003`∥`T004`(兩 migration)、`T006`∥`T007`(兩 entity)可並行;`T005` 待 migration、`T008/T010` 待 deps/前置。
- 跨 US facade:`T011`(access_log facade)∥ `T014`(login_attempt facade)—— 不同檔、皆只依 entity。

## Implementation Strategy(MVP first)

1. **MVP**:Setup → Foundational → US1(T001–T013)→ 已認證請求 access-log 可端到端 demo。
2. **增量**:US2(T014–T016)登入嘗試 → US3(T017)脈絡忠實驗收 → Polish(T018 best-effort / T019 prod build)。
3. 全 task 完成 → `superpowers:requesting-code-review` final review → `superpowers:finishing-a-development-branch`(此時才 worktree push fork + 外層 bump SHA pin + `merge --no-ff` 回 `rev2-admin-root`,保留 015 branch)。

## 測試策略註記(§I.4 / §3)

- **有純函式單測(test-first)**:T009(region 解析)、T010(IP/XFF 擷取)、T011(access_log SQL-build)、T014(login_attempt SQL-build)。
- **無單元測試、acceptance 覆蓋**:T002(部署)、T008(ConnectInfo/boot wiring)、T012(ctx_mw access-log 寫入 wiring)、T015(login handler wiring)—— 皆形狀/接線類、無新純邏輯,由 T013/T016/T017/T018 的 curl+psql 活體 acceptance 覆蓋(D10 無 CDP)。
