# Implementation Plan: audit-middleware

**Branch**: `015-audit-middleware` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-audit-middleware/spec.md`

**Brainstorm**: [`docs/superpowers/015-audit-middleware.md`](../../docs/superpowers/015-audit-middleware.md)（Phase 0，D1-D10 凍結）

---

## Summary

rev2 第 15 個 feature、**Phase 3 audit-middleware 前半**。在 HTTP 請求層建立審計：全域 **request-context middleware**（抽 operator_id〔JWT〕/ client_ip〔ConnectInfo 直連〕/ x_forwarded_for〔原始鏈〕/ region〔xdb〕/ trace_id〔uuid 或 X-Request-Id〕）+ 兩張審計表（`sys_access_log` 記已認證請求、`sys_login_attempt` 記登入嘗試成敗供未來 lockout）。**只記已認證請求**（middleware iff JWT verify Ok 才寫 access-log）+ **登入嘗試由 login handler 自記**（成敗、attempted userName）。**best-effort 同步寫**（審計失敗不影響業務請求）。順手解 **§2.14**（INET 真值寫入：sea-orm `with-ipnetwork` + `IpNetwork`）+ **§2.15**（xdb runtime：`XDB_FILEPATH` + prod COPY `ip2region.xdb`、本 feature 為 xdb 首個消費者）。**A（資料變動補 operator）/ lockout / XFF-trust 解析 = scope 外**。

---

## Technical Context

**Language/Version**：Rust 1.86（既有 rust-api workspace）。

**Primary Dependencies**：**無新 workspace crate**。新 dep **`uuid`**（server direct、已 transitive 於 Cargo.lock、`features=["v4"]`）+ sea-orm **`with-ipnetwork`** feature（拉入 `ipnetwork`，供 INET 真值寫入）。重用 **axum 0.7.9**（`from_fn` middleware + `ConnectInfo` via `into_make_service_with_connect_info`）、**013** `jwt::verify`/`bearer`/`JWT_AUD`、**012** `xdb`（`searcher_init`/`search_by_ip`、首個消費者）、**008** `Res<T>`。

**Storage**：Postgres 兩新表（`sys_access_log` / `sys_login_attempt`、`client_ip` **INET**、`sys_login_attempt` 兩 index〔`(attempted_user_name,created_at)`、`(client_ip,created_at)`〕），經 010 stack `up` 自動套（migration `m20260529_000011`/`m20260529_000012`）。append-only、無 `deleted_at`（同 011 性質）。**不動** `sys_operation_log`/`casbin_rule`。

**Testing**：
- **純單測 test-first**：client_ip/x_forwarded_for 抽取、trace_id（X-Request-Id else uuid）、`*_active_model` SQL-build（INET 寫真值、不再 42804）。沿 011 `audit_active_model` SQL-build 模式。
- **活體 acceptance（C-V）**：[contracts/verification-commands.md](./contracts/verification-commands.md)（§0 既有不破 + prod build + xdb 打包驗 / §1 兩表+index+boot / §2 登入嘗試 / §3 access-log + 公開/health 不寫 / §4 來源 client_ip+XFF+region / §5 best-effort 純單測）。**無 CDP**（D10、純後端）。

**Target Platform**：容器（dev/prod docker stack；migration 經 010 自動套；server 須 `XDB_FILEPATH`）。

**Project Type**：後端 web service（rust-api）+ 部署設定（Dockerfile runtime COPY xdb + compose `XDB_FILEPATH`）。

**Performance Goals**（對應 SC）：每已認證請求 1 筆 access-log（SC-001）/ 登入嘗試成敗各 1 筆（SC-002）/ 來源忠實（SC-003）/ best-effort 不影響業務（SC-004）/ 公開不寫（SC-005）/ 既有不破（SC-006）。**最小機制 + best-effort 同步寫；無 latency/throughput 目標**（admin panel 低流量；async/batched 留未來）。

**Constraints**：
- 守 **008 envelope**（handler 仍 `Res<T>`、middleware 旁路寫 log、不改回應）+ **009 entity-access lint**（新表只經新 facade）+ **007 FR-009**（migration 經 010 自動套、server 不自動 migrate）+ **011 audit 哲學**（facade 唯一 entity 寫入管道、append-only）。
- **§2.14 機制解**（INET 真值：with-ipnetwork + IpNetwork）；**§2.15 解**（xdb runtime path/打包）。
- **best-effort**（FR-007、與 011 原子 audit 對比）。

**Scale/Scope**：rust-api 改動 = request-context middleware + pure event 型 + 2 entity + 2 migration + 2 facade + `handler/auth.rs::login` 改（login-attempt 寫入）+ `main.rs`（`.layer` + serve `into_make_service_with_connect_info` + `searcher_init`）+ Cargo（uuid + with-ipnetwork）。**外層**：`deploy/Dockerfile.rust-api.txt`（runtime COPY `ip2region.xdb`）+ `docker-compose.{dev,prod}.yml`（`XDB_FILEPATH` env）。**完整 A（資料變動補 operator）/ login lockout / XFF-trust 解析 / async 寫入 / 審計治理 = scope 外（後續）**。

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md)：

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 權威?未提供 base-web 用到的 endpoint? | **N/A** — 015 純後端審計、**不新增任何 base-web-facing endpoint**、不改 login wire（login 回應不變、login-attempt 為旁路 side-effect） | ✅ Pass |
| 2 | 動到 base-web inline? | **否** — 015 **完全不動 base-web**（連 `.env` 都不動；與 013/014 不同） | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **N/A** — 非 menu/route 範疇（審計）；不觸 enforce 過濾 | ✅ Pass |
| 4 | wire 對齊 §I.3 mock?(envelope/id 型/error code/enum) | **對齊** — 無新對外 wire；envelope `Res<T>` 不變（middleware 旁路、不改回應）；login wire 不變 | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code? | **否** — middleware/facade/entity/migration **全新寫**；`xdb` 為 012 已授權拷貝（§11.6/§I.5 例外）、015 為**消費者**非新拷貝。**research 未 grep rev1**（§I.5、grep 對象皆 rev2 自身） | ✅ Pass |
| 6 | 凍結到 §II 12 拍板?需 Amendment? | **對齊** §11.8（obs/audit 漸進、Phase 3 audit-middleware）；**不撤回任何拍板**。`uuid`/`with-ipnetwork` 為 dep（非拍板）、不需 Amendment | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 否 ★ — **不動 base-web** → 不觸 MODAL-WIRING ★ / BASE-WEB-BUILD-CONFIG ★;僅 RUSTAPI-SOURCE-ISOLATION（§III.1 非★、全新寫對齊） | ✅ Pass |

**結論**：7 項全 PASS、無 violations、無 Complexity Tracking 需填。

---

## Project Structure

### Documentation (this feature)

```text
specs/015-audit-middleware/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify + /speckit-clarify 已交（17/17、0 提問）
├── research.md          # Phase 0（本次;R1-R8）
├── data-model.md        # Phase 1（本次）—— 2 表 + entity + 純 event 型 + RequestContext + facade
├── contracts/
│   └── verification-commands.md   # Phase 1（本次,C-V §0-§5、無 CDP）
├── quickstart.md        # Phase 1（本次）
└── checklists/
    └── requirements.md  # /speckit-specify 已交（17/17 PASS）
```

### Source Code（rust-api worktree + 外層部署設定）

```text
rust-api/                                   ← worktree（code）
├── server/src/
│   ├── audit_ctx.rs (或 middleware/)        ← request-context middleware（from_fn 全域）+ RequestContext + 純 event 型（AccessLogEvent/LoginAttemptEvent，不碰 entity::）
│   ├── handler/auth.rs                      ← login 改：成敗後寫 sys_login_attempt（讀 Extension<RequestContext>）
│   ├── model/facade/
│   │   ├── sys_access_log.rs                ← write(AccessLogEvent)（唯一構造 entity::sys_access_log::ActiveModel）
│   │   └── sys_login_attempt.rs             ← write(LoginAttemptEvent)
│   └── main.rs                              ← .layer(from_fn(audit_mw)) 全域 + serve into_make_service_with_connect_info::<SocketAddr> + searcher_init
├── entity/src/
│   ├── sys_access_log.rs                    ← client_ip: IpNetwork (with-ipnetwork)
│   └── sys_login_attempt.rs
├── migration/src/
│   ├── m20260529_000011_create_sys_access_log.rs
│   ├── m20260529_000012_create_sys_login_attempt.rs   ← + 2 index
│   └── lib.rs                               ← 註冊 011/012
└── Cargo.toml (workspace)                   ← sea-orm features += with-ipnetwork;server += uuid(v4)

deploy/Dockerfile.rust-api.txt               ← 外層：runtime stage COPY rust-api/xdb/resources/ip2region.xdb ./resources/
docker-compose.dev.yml / docker-compose.prod.yml  ← 外層：rust-api service 加 XDB_FILEPATH env
```

**Structure Decision**：動 **rust-api worktree source**（middleware + 2 entity + 2 migration + 2 facade + login handler 改 + main.rs + Cargo）+ **外層部署設定**（Dockerfile runtime COPY xdb + compose XDB_FILEPATH env）。**校正 brainstorm §7**：`deploy/Dockerfile.rust-api.txt` + `docker-compose*.yml` 為**外層追蹤檔（非 worktree）**（brainstorm 誤列為 worktree）。故 commit = **worktree（code）push fork + 外層（Dockerfile/compose/spec docs）+ rust-api SHA pin**（兩段式、**不動 base-web**）。**無新 workspace crate**（無 builder COPY *crate* 缺口）。沿用 011/012/013 既有；無 CDP。

---

## Phase 0 Status

Research → [`research.md`](./research.md)（R1 middleware + ConnectInfo 接線〔serve 改 make_service〕/ R2 access-log 寫入閘門〔operator_id Some 才寫 = 「只記已認證」優雅實作〕/ R3 client_ip 直連 + x_forwarded_for 原始鏈〔nginx 已設 XFF〕/ R4 region xdb raw + §2.15〔XDB_FILEPATH + prod COPY 11MB 檔〕/ R5 INET 真值〔with-ipnetwork + IpNetwork、sys_operation_log 不 retrofit-於 015、折 Phase 4〕/ R6 login handler 自記登入嘗試 / R7 trace_id〔uuid v4 + X-Request-Id〕/ R8 守恆 + prod build sanity）。

**結論**：8 項全解析、**0 NEEDS CLARIFICATION**。**§I.5 遵守**（未 grep rev1）。**無新 workspace crate**；新 dep `uuid`(direct、已 transitive) + sea-orm `with-ipnetwork`(拉 ipnetwork)。**最高風險點**：(a) ConnectInfo 接線（serve make_service + middleware peer）；(b) INET 真值（with-ipnetwork + IpNetwork、驗實際 `::inet` cast）；(c) xdb runtime path（XDB_FILEPATH + prod COPY、驗容器內可解析）；(d) middleware 全域 layer vs 013 per-route enforce_mw 疊加順序（access-log 須拿最終 status）。

---

## Phase 1 Status

Design:
- [`data-model.md`](./data-model.md)—— 2 表 schema（INET client_ip + login_attempt 兩 index、沿 `m..004`）+ entity（IpNetwork）+ 純 event 型（AccessLogEvent/LoginAttemptEvent、不碰 entity::）+ RequestContext（middleware 建、入 extensions）+ facade（唯一 ActiveModel 構造、best-effort 由呼叫端）。
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)—— C-V §0-§5（既有不破+prod build+xdb 打包 / 兩表+index / 登入嘗試 / access-log+公開不寫 / 來源 XFF / best-effort）。
- [`quickstart.md`](./quickstart.md)—— Path A 純單測 / B 活體 / C prod build+xdb 打包。

**Agent context update**：CLAUDE.md `<!-- SPECKIT START -->` marker 區 Active Plan 指向本 feature（本步更新）。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑：

| § | Re-Check 立場 | Pass/Fail |
|---|---|---|
| 1 | 仍 N/A — 無新 base-web-facing endpoint;login wire 不變 | ✅ Pass |
| 2 | 仍 **不動 base-web**（連 .env 都不動） | ✅ Pass |
| 3 | N/A（非 menu） | ✅ Pass |
| 4 | envelope/login wire 不變;新表不對外序列化 | ✅ Pass |
| 5 | middleware/facade/entity/migration 全新寫;xdb 消費既有授權拷貝;未 grep rev1 | ✅ Pass |
| 6 | 對齊 §11.8;uuid/with-ipnetwork 為 dep、無 Amendment | ✅ Pass |
| 7 | 不動 base-web → 不觸 ★ 軌道 | ✅ Pass |

**結果**：7 項仍全 PASS。可進 `/speckit-tasks`。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。

> **已知風險（非 violation、implement 時若觸發記 Deviation Log）**：
> - **ConnectInfo 接線**：`main.rs` serve 改 `into_make_service_with_connect_info::<SocketAddr>()`;若漏，middleware 取不到 peer（client_ip）→ 須驗 dev+prod 都拿得到。
> - **INET 真值（§2.14）**：`with-ipnetwork` + `IpNetwork` 須實際 emit `::inet` cast；acceptance §1 驗 column data_type=inet + §2/§3 寫真值不 42804。entity `IpNetwork` import path（sea_orm re-export vs `ipnetwork` direct dep）implement 時確認。
> - **xdb runtime path（§2.15）**：`XDB_FILEPATH` 須 dev（`/app/xdb/resources/...`）+ prod（`/app/resources/...` + runtime COPY）皆設對;C-V §0 驗 prod image 內有檔、§1 驗 boot searcher_init 不 panic。
> - **middleware 疊加順序**：全域 `.layer` vs 013 per-route `enforce_mw`;access-log 須在 `next.run` 後拿最終 status。

---

## Deviation Log（Constitution §V — implement/plan 階段實際偏離處）

- **D-1（plan 校正 brainstorm §7 — Dockerfile/compose 為外層非 worktree）**：brainstorm §7 把 `deploy/Dockerfile.rust-api.txt` 列入「rust-api worktree」，實則 `deploy/` + `docker-compose*.yml` 為**外層追蹤檔**。**處置**：commit 結構 = worktree（code）push fork + 外層（Dockerfile/compose/spec docs）+ rust-api SHA pin（仍兩段式、不動 base-web）。可見範圍/設計不變、純歸屬校正。
- **D-2（§2.14 sys_operation_log retrofit 不在 015）**：research R5 決定 015 只解 INET **機制**（`with-ipnetwork` + 新表 `IpNetwork`、證明真值寫入），**不 retrofit** 011 的 `sys_operation_log.operator_ip`（015 不寫該表;其真值寫入屬 Phase 4「A:資料變動補 operator」）。**處置**：保 011 現狀（`Option<String>` + `None→NotSet`、永寫 None、不觸 42804）;§2.14 sys_operation_log 欄 retrofit 折入 Phase 4 A（套同一 IpNetwork pattern、trivial）。避免 015 碰 011 未寫路徑（scope 維持最小、對齊 user「拆兩個、015 收緊」意圖）。CHECKLIST §2.14 待更新註記此分工。
