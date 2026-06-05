---
description: "Task list — 027 refresh token rotation"
---

# Tasks: refresh token rotation

**Input**: Design documents from `specs/027-refresh-token-rotation/`(plan.md / spec.md / research.md / data-model.md / contracts/verification-commands.md / quickstart.md)

**Tests**: 含測。本 feature 是 TDD(CLAUDE.md §3 + FR-014):**純邏輯 seam**(`decide_rotation` / `sha256_hex` / `chain_head_active_model` SQL-build)**test-first(red→green)**;**wiring / 狀態形塑類**(`create_chain_head` / `rotate` / handler 串接)由 **acceptance 覆蓋**(in-crate `#[ignore]` live-DB + curl/psql),無新純函式測。

**Organization**:依 user story 分階段。**注意 027 內聚性** — `rotate`(T008)是單一狀態機函式、一次涵蓋 US1(Rotated)/ US2(Reuse)/ US3(Benign)三分支;故核心 production code 落 **US1**,**US2/US3/US4 以各自 facet 的 acceptance 為主**(每階段 Independent Test 仍可獨立跑)。

## Format: `[ID] [P?] [Story] Description`
- **[P]**:可並行(不同檔、無未完成依賴)。**[Story]**:US1-US4。所有 rust 路徑相對 `rust-api/`。
- 設計依據:[data-model.md](data-model.md)(表/entity/狀態機/facade/handler 串接)+ [contracts/verification-commands.md](contracts/verification-commands.md)(C-V:U/L/C 編號)。

---

## Phase 1: Setup(共用基建)

- [ ] T001 加 `sha2` 為 `rust-api/server/Cargo.toml` 直接 dep(`sha2 = "0.10"`,已在 Cargo.lock;`uuid` 已在、不動)。確認 `dcargo build -p server` 仍編譯。

---

## Phase 2: Foundational(阻塞所有 user story)

**⚠️ 此階段未完成前,任何 user story 不能開始。**

- [ ] T002 建 migration `rust-api/migration/src/m20260529_000026_create_sys_token.rs`:`Table::create` sys_token 9 欄(id BIGSERIAL PK / user_id BIGINT NOT NULL FK→sys_user / token_hash VARCHAR(64) NOT NULL UNIQUE / rotation_chain VARCHAR(36) NOT NULL / status VARCHAR(20) NOT NULL / issued_at·expires_at TIMESTAMPTZ NOT NULL / used_at TIMESTAMPTZ NULL / created_at TIMESTAMPTZ NOT NULL default now()),沿 migration 012 範本;**partial index `idx_sys_token_user_active (user_id) WHERE status='active'`〔非 unique〕走 raw SQL `execute_unprepared`**(沿 018:100)+ `idx_sys_token_chain (rotation_chain)`;down 反序 drop。註冊進 `rust-api/migration/src/lib.rs`(mod + Box::new,接 025 之後)。
- [ ] T003 [P] 建 entity `rust-api/entity/src/sys_token.rs`(`DeriveEntityModel`、`table_name="sys_token"`、9 欄對應 T002〔used_at `Option<DateTimeWithTimeZone>`〕、空 `Relation`、預設 `ActiveModelBehavior`),沿 `entity/src/sys_login_attempt.rs` 範本;`entity/src/lib.rs` 加 `pub mod sys_token;`。
- [ ] T004 [P] [TDD-red] 在 `rust-api/server/src/model/facade/sys_token.rs` 寫**失敗**純單測:U1 `decide_rotation` 全分支(active→Rotate / used+used_at=Some 距今<30s→Benign / used+used_at=Some≥30s→Reuse / **used+used_at=None→Reuse〔fail-closed〕** / revoked→Reuse)+ U2 `sha256_hex`(同入同出、64 hex、不同 JWT 不同 hash)。先 red(尚無實作)。
- [ ] T005 [TDD-green] 在 `rust-api/server/src/model/facade/sys_token.rs` 實作純 seam 使 T004 綠:`const GRACE_SECS: i64 = 30;` + `ACTIVE/USED/REVOKED` 常數 + `enum RotationDecision { Rotate, Benign, Reuse }`(純、**無 NotFound**)+ `enum RotationOutcome { Rotated, BenignConcurrent, Reuse, NotFound }`(facade 回傳)+ `fn sha256_hex(jwt:&str)->String`(sha2)+ `fn decide_rotation(status:&str, used_at:Option<DateTimeWithTimeZone>, now, grace:i64)->RotationDecision`(data-model §3、`(used,None)` fail-closed→Reuse);`facade/mod.rs` 加 `pub mod sys_token;`。守 009 entity-access lint(本檔在 `facade/`、豁免)。

**Checkpoint**:表/entity/純判定 seam 就緒,user story 可開始。

---

## Phase 3: User Story 1 — 換新即輪替 + 持久化(Priority: P1) 🎯 MVP

**Goal**:login 持久化 refresh 憑證(雜湊)成 rotation chain head;refresh 換新時舊憑證標 used、同族系發新 active,回新 pair。wire 中性。

**Independent Test**:login 後 psql 查 1 筆 active 列(token_hash 64-hex 非原文);以該 refreshToken 換新一次 → 回 200 新 pair、psql 舊列 used + 同 chain 新 active(contracts L1/L2 + C1/C2)。

- [ ] T006 [P] [US1] [TDD-red] 在 `rust-api/server/src/model/facade/sys_token.rs` 寫**失敗** U3:`chain_head_active_model` SQL-build 純測(`INSERT INTO "sys_token"`、含 token_hash/rotation_chain/status/user_id 欄、status 字面 `active`、**token_hash 為雜湊非原文 JWT**),鏡像 `sys_login_attempt` build_tests。
- [ ] T007 [US1] [TDD-green] 在 `facade/sys_token.rs` 實作 `chain_head_active_model(...)->sys_token::ActiveModel` 純 seam 使 T006 綠 + `pub async fn create_chain_head(db, user_id:i64, refresh_jwt:&str, rotation_chain:&str, issued_at, expires_at)->Result<(),DbErr>`(insert active row、token_hash=sha256_hex)。
- [ ] T008 [US1] 在 `facade/sys_token.rs` 實作 `pub async fn rotate(db, presented_jwt:&str, new_refresh_jwt:&str, issued_at, expires_at)->Result<RotationOutcome,DbErr>`(data-model §4 完整狀態機):`db.begin()` **純 txn**(非 mutate_in_txn)→ `find().filter(token_hash=h).lock_exclusive()`(FOR UPDATE)→ row=None→`NotFound`;否則 `match decide_rotation(...)`:Rotate=條件 UPDATE active→used+used_at + insert 新 active(同 chain)→`Rotated`;Benign=insert 新 active(不動舊)→`BenignConcurrent`;Reuse=`UPDATE status=revoked WHERE rotation_chain=` + `tracing::warn!` → `Reuse`;commit。**含 US2 Reuse 分支與 US3 Benign 分支**(match 必須窮盡)。
- [ ] T009 [US1] 串 `rust-api/server/src/handler/auth.rs` `login`(outer):新 `ttl_window(ttl_secs)->(issued,expires)` helper;在 `login_attempt_inner` 回成功 **+ login-attempt 審計寫入之後**(★ data-model §5、保 015 success=純憑證成敗)呼 `create_chain_head(db,user_id,&token.refresh_token,&Uuid::new_v4().to_string(),issued,expires)`,DbErr→`Internal(5000)`。
- [ ] T010 [US1] 串 `rust-api/server/src/handler/auth.rs` `refresh_token`:`jwt::verify@257` 成功後 `issue_tokens(claims.user_id,claims.roles,&state.jwt)`(**unchanged 預簽**)→ `rotate(db,&req.refresh_token,&new.refresh_token,issued,expires)` → `Rotated|BenignConcurrent`→`Res::ok(new)` / `Reuse|NotFound`→`Res::err(Logout8888)` / `Err`→`Res::err(Internal)`。**Claims/issue_tokens/LoginToken 不改**(wire 中性)。
- [ ] T011 [US1] 在 `facade/sys_token.rs` 加 in-crate `#[ignore]` env-gate live-DB:L1(create_chain_head→1 active 列、token_hash 64-hex 非原文、used_at NULL)+ L2(rotate active→`Rotated`、psql 舊列 used+used_at、同 chain 新 active)。

**Checkpoint**:login 持久化 + refresh 正常輪替可獨立驗(MVP)。

---

## Phase 4: User Story 2 — 盜用偵測整族系作廢(Priority: P1)

**Goal**:重放已換掉且超 grace 的舊憑證、或已作廢族系的憑證 → 整族系 revoke + 回 8888;真實 user 下次換新被乾淨登出。**production code 已在 T008 的 rotate Reuse 分支 + warn log**;本階段為盜用偵測 acceptance。

**Independent Test**:換新後把舊列 used_at 改 `now()-60s` 重放 → 回 8888 + psql 該 chain 全 revoked;對已 revoked chain 的 token 換新 → 仍 8888(contracts L3/L5/L6 + C3/C4)。

- [ ] T012 [US2] 在 `facade/sys_token.rs` 加 live-DB `#[ignore]`:L3(used 超 grace 重放→`Reuse`、psql chain 全 revoked)+ L5(revoked token→`Reuse` no-op 不報錯)+ L6(隨機無對應 JWT→`NotFound`)。確認 T008 Reuse 分支 `tracing::warn!(user_id,rotation_chain,...)` 觸發。
- [ ] T013 [US2] 跑 contracts §3 curl/psql C3(舊 token 超 grace 重放→`8888` + 同 chain 全 revoked)+ C4(亂 token→`8888`、grep 回應**無 3333/9999/9998**)。確認失敗碼紀律(FR-005/006)。

**Checkpoint**:盜用 replay 偵測 + 整族系作廢 + 8888 紀律可獨立驗。

---

## Phase 5: User Story 3 — grace 防誤登出(Priority: P2)

**Goal**:良性並發(同憑證在 grace 窗內重複換新)不誤判作廢、不登出。**production code 已在 T008 的 rotate Benign 分支 + FOR UPDATE 序列化**;本階段為 grace acceptance。

**Independent Test**:active token 換新(→used,used_at=now)後**立即**再以同 token 換新 → 回 `BenignConcurrent`(非 Reuse)、psql chain 仍有 active、無 revoked(contracts L4)。

- [ ] T014 [US3] 在 `facade/sys_token.rs` 加 live-DB `#[ignore]` L4:active token rotate 後立即同 token 再 rotate → `BenignConcurrent`、chain 仍 active 無 revoked、使用者不登出。驗 grace(GRACE_SECS=30)+ FOR UPDATE 序列化杜絕誤 revoke。

**Checkpoint**:grace 良性並發不誤登出可獨立驗。

---

## Phase 6: User Story 4 — stale token 還原(Priority: P3)

**Goal**:既有「以尚未過期 access 還原 session」行為不受 027 影響。**無 production code**(getUserInfo / verify_bearer 不動);純 acceptance。

**Independent Test**:持較早簽發但未過期的 access → getUserInfo 仍 200 與正確 user(contracts C5)。

- [ ] T015 [US4] 跑 contracts §3 C5:登入取 access → `sleep 15`(模擬「較早簽發但未過期」、access TTL 預設 3600)→ 同 access 打 getUserInfo 斷言 `0000` + userName 非空。確認 027 未誤傷此既有不變式(等價論證:027 不改 getUserInfo)。

**Checkpoint**:stale-but-unexpired access 還原不變式成立。

---

## Phase 7: Polish & Cross-Cutting

- [ ] T016 [P] 跑 contracts §3 全套 curl/psql C1-C5 端到端(經 rust-api :21081;活體前 `dcargo build` + `docker compose ... restart rust-api`)。
- [ ] T017 守恆(contracts §4):`dcargo test -p server` 全綠(既有 **206** + 新測 U1/U2/U3 + L1-L6)+ `entity_access_lint` 17(新 facade 守)+ `endpoint_coverage_lint` 30(**無新端點、不變**)+ migration `up→down→up` 可逆(throwaway DB)。
- [ ] T018 [P] CDP §5(建議、isolated browser context):dev :21080 或 prod :443 經 base-web 真實 refresh 一次,Network 確認 refreshToken 換新成功、**未被登出**。
- [ ] T019 [P] (可選)prod image build(contracts §6,非強制 — 無新 workspace crate):`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api`。
- [ ] T020 收尾:`superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree push fork `rev2-admin-rust-api` + 外層 SHA pin)→ `git merge --no-ff` 回 `rev2-admin-root`、保留 027 branch。**base-web 不動**。收尾回填:DESIGN §6.2(sys_token 單數命名 + hash 儲存 + logout=放棄 chain as-built)+ §10 Phase 5 + 登記 **028-single-session-enforcement**(Follow-up Backlog)。

---

## Dependencies & Execution Order

- **Setup(T001)**:無依賴、先行。
- **Foundational(T002-T005)**:依賴 Setup;**阻塞所有 user story**。T003/T004 可 [P](不同檔);T005 依 T004(同檔、green)。
- **US1(T006-T011)**:依賴 Foundational。T006[P] 可與 T007 前並寫;T007→T008(同檔 facade,序);T008→T009/T010(handler 依 facade);T011 依 T008-T010。**MVP**。
- **US2(T012-T013)**:依賴 US1 T008(rotate Reuse 分支已含);本階段 acceptance-only。
- **US3(T014)**:依賴 US1 T008(rotate Benign 分支已含);acceptance-only。
- **US4(T015)**:依賴 dev stack 運行;無 code 依賴(getUserInfo 不動)。
- **Polish(T016-T020)**:依賴所有 user story。

> **027 內聚性註記**:US2/US3 的 production 邏輯已隨 US1 的 `rotate`(T008,單一窮盡 match)落地 → US2/US3 為各 facet 的獨立 acceptance,**非**獨立可單獨交付(典型小內聚 feature;每階段 Independent Test 仍可獨立跑)。US1 = 真正 MVP。

## Parallel Opportunities
- Foundational:T003(entity)∥ T004(純單測 red)—— 不同檔。
- Polish:T016 ∥ T018 ∥ T019 —— 獨立驗收動作。

## Implementation Strategy
1. **Setup + Foundational**(T001-T005)→ 表/entity/純 seam(decide_rotation TDD 綠)。
2. **US1**(T006-T011)→ create_chain_head + rotate + 兩 handler 串接 → **STOP & VALIDATE**(L1/L2 + C1/C2,MVP:登入持久化 + 正常輪替)。
3. **US2 → US3 → US4**(T012-T015)→ 依序驗盜用偵測 / grace / stale token。
4. **Polish**(T016-T020)→ 守恆 + CDP + 收尾(兩段式 commit + merge + 回填)。

## Notes
- TDD:T004/T006 先 red、T005/T007 後 green(純邏輯);其餘 wiring 由 L/C acceptance 覆蓋(CLAUDE.md §3)。
- **實作一律 `superpowers:executing-plans` 起手、不用 `/speckit-implement`**(CLAUDE.md §3 核心紀律)。
- `git push`/`git merge` **不得**早於 T020 `finishing-a-development-branch`(constitution §I.4)。
- 每完成一單元 commit;rust-api worktree 內改、收尾走兩段式(§4.1)。
- 關鍵設計提醒(data-model):rotate 用純 txn + FOR UPDATE(非 mutate_in_txn)/ create_chain_head 在 login outer(保 015 審計)/ `(used,None)` fail-closed / expires_at 不進 rotate(JWT exp 把關)/ rotation_chain 存字串。
