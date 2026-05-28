---
description: "Task list for 008-response-envelope implementation"
---

# Tasks: response-envelope

**Input**: Design documents from `/specs/008-response-envelope/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests strategy**(對齊 [CLAUDE.md §3](../../CLAUDE.md) + [verification-commands.md](./contracts/verification-commands.md) §0):
- **本 feature 有可單測純邏輯單元**(信封序列化 + BizCode 映射 + AppError→信封 映射)→ **test-first**(red → green)。
- 404 fallback 為 wiring → 由 live curl acceptance 覆蓋(另 AppError::NotFound 的 IntoResponse 亦可單測)。

**Organization**: 6 phase;3 個 user story phase 各對應 spec US1/US2/US3 + acceptance。

## Format: `[ID] [P?] [Story] Description`

- **[P]**:可並行(不同檔、無未完依賴)
- **[Story]**:User Story phase 內必加(US1/US2/US3);Setup/Foundational/Polish 無 story label
- 全 file path 為 absolute-from-workspace-root(repo root = `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/`,後續用 `rev2-root/` 簡稱)

> **★ 兩段式 commit 提醒**:本 feature **動 rust-api worktree**(`rust-api/Cargo.toml` / `server/`)。實作對 `rust-api/` 內檔走 [CLAUDE.md §4.1 兩段式 commit](../../CLAUDE.md)(worktree commit+push fork → 外層 `git add rust-api` bump SHA pin)。spec docs 為外層單段。**本 tasks.md 不排 git push/merge 任務**(§3 紀律);commit/push 機制於 `executing-plans`/`finishing` 階段處理。

---

## Phase 1: Setup (Pre-flight)

**Purpose**:確認前置就緒。

- [ ] T001 Pre-flight:外層 `git branch --show-current` = `008-response-envelope`;`rust-api/` worktree 在 `rev2-admin-rust-api` 分支且 `git -C rust-api status --short` 空;dev image 可 build/cargo(`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo --version`);確認現況無 envelope/error 模組(`grep -rc 'envelope\|AppError' rev2-root/rust-api/server/src/main.rs` 評估、`ls rev2-root/rust-api/server/src/envelope.rs rev2-root/rust-api/server/src/error.rs` 應不存在)。任一不符 → 停下回報

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:新增 `serde_json` dep —— US1 單測 assert 序列化字串的前提。**必須先完成才進 user story**。

- [ ] T002 Edit `rev2-root/rust-api/Cargo.toml`(workspace `[workspace.dependencies]` 加 `serde_json = "1"`)+ `rev2-root/rust-api/server/Cargo.toml`(`[dependencies]` 加 `serde_json.workspace = true`)(對齊 [research R3](./research.md);Cargo.lock 已解析 1.0.150 transitive、stable 無 prerelease)

---

## Phase 3: User Story 1 — 統一回應信封契約立定 (Priority: P1) 🎯 MVP

**Goal**:`Res<T>` 成功信封(`{data,code,msg}`、code=string、無 success、欄位序 data→code→msg)+ 完整 `BizCode` 矩陣 enum;序列化形狀以單測鎖定。

**Independent Test**:`cargo test -p server envelope` PASS —— Res::ok 序列化形狀正確、空集合 `data:[]`、BizCode 全矩陣 code() 對應正確字串,即驗(不需任何 endpoint)。

- [ ] T003 [US1] 新增 `rev2-root/rust-api/server/src/envelope.rs`:`#[derive(Debug, Serialize)] struct Res<T> { data: Option<T>, code: String, msg: String }`(欄位序 data→code→msg、`data:None`→`null` 不 skip)+ 建構子 `Res::ok(data)`/`Res::ok_msg(data,msg)`/`Res::<()>::err(BizCode)`/`Res::<()>::err_msg(BizCode,msg)` + `impl<T: Serialize> IntoResponse for Res<T>`(→ `(StatusCode::OK, axum::Json(self))`)+ `enum BizCode` **完整矩陣**(`code()->&'static str` + `default_msg()`,對齊 [data-model Entity 2](./data-model.md) 全表)(對齊 [research R1/R2/R3](./research.md))
- [ ] T004 [US1] `envelope.rs` `#[cfg(test)] mod tests`(**test-first**:先寫測試 red → T003 green):`serde_json::to_string(&Res::ok(...))` 斷言輸出 = `{"data":..,"code":"0000","msg":..}`(欄位順序 data→code→msg、`code` 為 JSON string 非 number、**無 `success` key**)、`Res::ok(Vec::<i32>::new())` → `"data":[]`、`BizCode` 全 12 variant `code()` table-driven 對應正確字串(對應 spec US1 + SC-002/SC-003)
- [ ] T005 [US1] Acceptance:`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server envelope` exit 0、上述單測全 PASS([verification-commands §1](./contracts/verification-commands.md))

**Checkpoint**:US1 達成(信封契約 + 完整 code 詞彙,單測鎖定)= MVP 型別基礎

---

## Phase 4: User Story 2 — 不存在的路徑回標準信封 (Priority: P2)

**Goal**:`AppError`(thiserror)含 `NotFound` + `IntoResponse`;axum `.fallback()` 接 404 → 回 `{data:null,code:"4040",msg:"接口不存在"}`/HTTP404,作信封第一個 live 消費者。`/health` 不動。

**Independent Test**:dev stack up → `curl -i :21081/nonexistent` 回 HTTP 404 + 標準信封;`curl :21081/health` 仍 `ok`,即驗。

> 依 US1(error.rs 用 `Res`/`BizCode`)。

- [ ] T006 [US2] 新增 `rev2-root/rust-api/server/src/error.rs`:`#[derive(Debug, thiserror::Error)] enum AppError`(本步含 `NotFound` variant)+ `impl IntoResponse for AppError`(`NotFound` → `(404, axum::Json(Res::<()>::err(BizCode::NotFound)))` = `{data:null,code:"4040",msg:"接口不存在"}`)(對齊 [data-model Entity 3](./data-model.md) + [research R4](./research.md))
- [ ] T007 [US2] `error.rs` `#[cfg(test)] mod tests`(**test-first**):`AppError::NotFound.into_response()` → status 404 + body `{data:null,code:"4040",msg:"接口不存在"}`(對應 spec US2 + SC-001)
- [ ] T008 [US2] Edit `rev2-root/rust-api/server/src/main.rs`:加 `mod envelope; mod error;`;router 加 `.fallback(|| async { error::AppError::NotFound })`;`/health` handler **不動**(維持純 `"ok"`)
- [ ] T009 [US2] Acceptance:dev stack `up -d --wait`(rust-api healthy)→ `curl -i :21081/nonexistent` = HTTP 404 + `{"data":null,"code":"4040","msg":"接口不存在"}`、`curl -fsS :21081/health` = `ok`(對應 spec US2 + SC-001/SC-005;[verification-commands §2](./contracts/verification-commands.md))

**Checkpoint**:US1+US2 各自 functional(信封型別 + 404 live)

---

## Phase 5: User Story 3 — 非預期內部錯誤也回標準信封 (Priority: P3)

**Goal**:`AppError` 加 `Internal(String)` variant + `IntoResponse`(→ 500 + `{data:null,code:"5000",msg:"服务器内部错误"}`)。

**Independent Test**:`cargo test -p server error` PASS —— `AppError::Internal(..)` → 500 + code `5000`,即驗。

> 依 US2(同 `error.rs` 檔,擴 variant)。

- [ ] T010 [US3] Edit `rev2-root/rust-api/server/src/error.rs`:`AppError` 加 `Internal(String)` variant + `IntoResponse` 映射 `Internal(_)` → `(500, axum::Json(Res::<()>::err(BizCode::Internal)))` = `{data:null,code:"5000",msg:"服务器内部错误"}`(對齊 [data-model Entity 3](./data-model.md);`5000` = rev2 自訂 5xxx sentinel)
- [ ] T011 [US3] `error.rs` `#[cfg(test)]` 補(**test-first**):`AppError::Internal("x".into()).into_response()` → status 500 + body code `"5000"`、msg `服务器内部错误`(對應 spec US3 + SC-004)
- [ ] T012 [US3] Acceptance:`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server error` exit 0(含 NotFound + Internal 單測全 PASS;[verification-commands §1](./contracts/verification-commands.md))

**Checkpoint**:三 user story 全 functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:Constitution Compliance 自我覆查 + scope 邊界 + envelope 不漏前瞻。

- [ ] T013 Constitution Compliance 自我覆查 + 邊界驗證:
    * (a)`git -C base-web status --short` 空(§I.1 未碰 base-web);diff 不含 `base-web/`
    * (b)`git diff --name-only <base>..HEAD` 改動範圍 = `rust-api/`(worktree:Cargo.toml/lock + server/src)+ specs/CLAUDE.md;**未拷 rev1 code**(§I.5)
    * (c)`grep -c "✅ Pass" specs/008-response-envelope/plan.md` ≥ 14(Constitution 7+7)
    * (d)scope 邊界:無業務 endpoint / 無 DTO / 無 `convert_case` dep(`grep -c convert_case rust-api/Cargo.toml` = 0)/ `/health` 仍純 `ok`(`grep -A2 'async fn health' rust-api/server/src/main.rs` 無 State/envelope);`AppError` 僅 `NotFound`+`Internal`(無業務 variant)
    * (e)envelope 不漏前瞻(DESIGN §9.3):`grep -rnE 'Json<' rust-api/server/src/ | grep -v 'Json<Res'` 僅 envelope/error 內 `Json(self)`/`Json(Res::..)` 合法用法、無繞過信封的裸 `Json<T>`
    * (f)`code` 為 string、無 `success` 欄、`data:None`→`null`(由 T004 單測覆蓋,複查通過)

**Checkpoint**:feature 完整、可進 `superpowers:executing-plans`(★ rust-api 改動走兩段式 commit)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**:無依賴
- **Foundational(Phase 2)**:依 Setup;**阻斷所有 user story**(serde_json dep)
- **US1(Phase 3,P1)**:依 Foundational;MVP;純單測
- **US2(Phase 4,P2)**:依 US1(error.rs 用 `Res`/`BizCode`);需 dev stack(404 live)
- **US3(Phase 5,P3)**:依 US2(同 `error.rs`,擴 `Internal` variant)
- **Polish(Phase 6)**:依所有 user story

### Within Phases

- Phase 3:T003(types)→ T004(test-first,實作上先寫測試 red)→ T005 acceptance
- Phase 4:T006(error.rs NotFound)→ T007(test)→ T008(main.rs fallback)→ T009 acceptance
- Phase 5:T010(Internal variant)→ T011(test)→ T012 acceptance

### Parallel Opportunities

- 本 feature 檔案少且線性相依(envelope → error → main),**並行機會有限**;US1 完成後 US2/US3 因共用 `error.rs` 採順序(非並行)。

---

## Implementation Strategy

### MVP First (US1)

1. Setup(T001)→ Foundational(T002)→ US1(T003-T005)
2. **STOP and VALIDATE**:`cargo test -p server envelope` PASS、信封形狀/code 詞彙鎖定
3. 達 MVP:信封契約型別基礎

### Incremental Delivery

1. Setup → Foundational → US1(MVP:信封 + 完整 code 詞彙)
2. + US2(404 fallback live 消費者 + /health 不變)
3. + US3(內部錯誤 5000)
4. Polish(Constitution self-check + scope 邊界 + envelope 不漏)
5. `superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree)+ 外層 SHA pin + merge --no-ff 回 `rev2-admin-root` + 更新 CHECKLIST/MILESTONES/§6 marker

### Subagent Strategy(executing-plans 階段)

- Foundational(T002):dep(可併入 US1 implementer 起手)
- US1(T003-T005):一個 implementer(envelope.rs + 單測,TDD)
- US2(T006-T009):一個 implementer(error.rs NotFound + main.rs fallback + 404 live acceptance)
- US3(T010-T012):同/另一 implementer(error.rs Internal + 單測)
- Polish(T013):查核
- **★ commit 紀律**:rust-api worktree 改動走 §4.1 兩段式;各 unit spec+quality 雙審

---

## Notes

- **新增 dep `serde_json = "1"`**(stable;CLAUDE.md §6);不加 `convert_case`(本 feature 不做 camelCase 機制)。
- **信封形狀與 code 集為 mock 契約事實**(DESIGN §3.2/§3.3);implementer 對 `BizCode` 全表逐一對照 [data-model](./data-model.md) / [research R1](./research.md),勿憑記憶。
- **scope 邊界**:無業務 endpoint / DTO / camelCase 機制 / pagination wrapper / middleware;`AppError` 僅 `NotFound`+`Internal`;`/health` 不改。
- **critical 詞彙紀律**:`BizCode` 含 `3333/9998/9999`,Phase 5 `/auth/refreshToken` 實作時絕不可回(本 feature 僅定義)。
- 任何偏離 [plan.md](./plan.md) 的實作決策、須在對應 task 註明 + 更新 plan.md(Constitution v1.0.0 §V)。
- `superpowers:executing-plans` 階段把這 13 個 task 編成 execution unit + 派 fresh implementer subagent。
