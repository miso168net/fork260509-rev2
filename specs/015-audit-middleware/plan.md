# Implementation Plan: 015-audit-middleware

**Branch**: `015-audit-middleware` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-audit-middleware/spec.md`(源自凍結 brainstorm [`docs/superpowers/015-audit-middleware.md`](../../docs/superpowers/015-audit-middleware.md) D1–D10)

## Summary

在 HTTP 請求層建立審計:全域 **request-context middleware** 擷取每筆請求脈絡(`client_ip` 直連 / `x_forwarded_for` 原始 / `region` xdb / `trace_id` uuid / `operator_id` JWT),對**已認證**請求 best-effort 寫 `sys_access_log`;`login` handler 對每次登入嘗試(成敗)寫 `sys_login_attempt`。兩張 **append-only** 表(沿 011 `sys_operation_log` 範本)。**首個 xdb 消費者**(解 §2.15 runtime path/打包)+ **首個寫真值 INET**(解 §2.14,採 `with-ipnetwork`)。技術決策見 [research.md](research.md);schema 見 [data-model.md](data-model.md);驗收見 [contracts/verification-commands.md](contracts/verification-commands.md)。

## Technical Context

**Language/Version**: Rust **1.86**(MSRV `rust-toolchain.toml`;新 dep 須驗 1.86 可編)

**Primary Dependencies**: axum + sea-orm 1.1.20 + tokio + Postgres。**新增**:`uuid`(v4,trace_id)、`ipnetwork` + sea-orm `with-ipnetwork` feature(client_ip 真值 INET)、`xdb = {path="../xdb"}`(server 首次消費 012 已拷貝的 xdb)。承接:013 `jwt`/`bearer`、011 audit 範本。

**Storage**: PostgreSQL。2 張新 **append-only** 表 `sys_access_log`(migration `m20260529_000011`)/ `sys_login_attempt`(`m20260529_000012`),經 010 自動套、server 不自動 migrate(007 FR-009)。

**Testing**: 純單測(no-DB `cargo test`:region/IP-XFF 擷取、兩表 SQL-build)+ in-crate `#[ignore]` live-DB(env-gate `DATABASE_URL`,放 `facade/`)+ dev stack curl/psql 活體 + **prod image build**。**無 CDP**(D10 純後端)。

**Target Platform**: Linux container(`rust-api` service)

**Project Type**: backend web-service(rust-api,單一 worktree;不動 base-web)

**Performance Goals**: best-effort 同步寫(admin panel 低流量,無 audit 寫入延遲 SLA);稽核寫入 **MUST NOT** 阻斷/失敗業務請求(FR-003)。

**Constraints**: INET 真值寫入(R1 `with-ipnetwork`);xdb 僅 IPv4(IPv6→region None);server cwd ≠ `xdb/` → `XDB_FILEPATH` env;11 MB `ip2region.xdb` 須進 prod image;新 dep 須 1.86 可編。

**Scale/Scope**: 2 表 + 1 global middleware + login handler 改 + main.rs ConnectInfo;**無新 workspace crate**。

## Constitution Check

*GATE：Phase 0 前必過;Phase 1 後 re-check。對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.1.0 §IV 8 項**。*

| # | 檢查 | 結果 |
|---|---|---|
| 1 | **§I.1 base-web 為權威**:rust-api 是否未提供 base-web 用到的對應 endpoint? | ✅ PASS — 015 為觀察性基建,**不新增 base-web-facing wire**;access-log/login-attempt 為內部表、base-web 不消費。無 endpoint 缺口。 |
| 2 | **§I.2 menu 顯示走 Casbin enforce?** | ✅ N/A — 015 不觸 menu/route 可見性。 |
| 3 | **§I.3 wire 對齊 mock ground truth?** | ✅ PASS — 不新增 base-web 消費的 wire DTO;`login`/`getUserInfo` 回應形狀**不變**(015 只加 side-effect 寫入)。 |
| 4 | **§I.4 SDD+TDD 工作流?** | ✅ PASS — 走設計鏈;純函式(region/IP-XFF/SQL-build)test-first,wiring 由 acceptance 覆蓋。 |
| 5 | **§I.5 從 rev1 拷貝 code?屬例外?** | ✅ PASS — 015 全新寫;**消費** 012 已拷貝的 `xdb`(§11.6/§I.5 授權例外、首個消費者、非新拷貝);research **未 grep rev1**。新 dep(uuid/ipnetwork)為 crates.io、非 rev1。 |
| 6 | **§II 12 拍板凍結?** | ✅ PASS — 不改任何 §II 拍板。 |
| 7 | **§III ★ 軌道?在授權邊界?** | ✅ PASS — 純後端、**不動 base-web inline**(BASE-WEB-ADAPT/MODAL-WIRING ★/BUILD-CONFIG ★ 皆未觸)。 |
| 8 | **§I.6 新建業務表含 6 審計欄?append-only/join 表依例外?** | ✅ PASS — 015 建 2 張新表 `sys_access_log`/`sys_login_attempt`,**皆 append-only 審計表** → 走 **§I.6 append-only 例外**:只 `created_at` + operator 欄(`operator_id`),**MUST NOT** 加 `updated_*`/`deleted_*`(schema 已遵守、見 data-model)。operator 欄用 `operator_id`(語意、非 `created_by`,例外允許)。`attempted_user_name` 為業務欄、非 `*_by` → 不受「operator 非 user_name」約束。 |

**Gate 結果**:**8/8 PASS,無 violation、無需 Amendment、無 Complexity Tracking。** §I.6 item 8 即本 amendment(v1.1.0)的首個受檢 feature,結論=append-only 例外、不加 6 欄。

## Project Structure

### Documentation (this feature)

```text
specs/015-audit-middleware/
├── plan.md              # 本檔
├── research.md          # Phase 0(R1-R8 決策)
├── data-model.md        # Phase 1(兩表 schema + facade + RequestContext)
├── quickstart.md        # Phase 1
├── contracts/
│   └── verification-commands.md   # C-V 合約(curl+psql+prod build,無 CDP)
└── tasks.md             # Phase 2(/speckit-tasks 產,本指令不建)
```

### Source Code (rust-api worktree;不動 base-web)

```text
rust-api/
├── migration/src/
│   ├── m20260529_000011_create_sys_access_log.rs      # 新
│   ├── m20260529_000012_create_sys_login_attempt.rs   # 新
│   └── lib.rs                                          # 改:mod + migrations() 加 2
├── entity/src/
│   ├── sys_access_log.rs        # 新(append-only,client_ip: IpNetwork)
│   ├── sys_login_attempt.rs     # 新
│   └── lib.rs                   # 改:pub mod 加 2
├── server/
│   ├── Cargo.toml               # 改:加 uuid / ipnetwork / xdb path-dep
│   └── src/
│       ├── main.rs              # 改:into_make_service_with_connect_info + 掛 global ctx layer + searcher_init
│       ├── audit_ctx.rs        # 新:RequestContext + ctx_mw(request-context middleware)+ region resolver
│       ├── handler/auth.rs      # 改:login 寫 sys_login_attempt(讀 extension)
│       └── model/facade/
│           ├── sys_access_log.rs       # 新(active_model + write + SQL-build 單測)
│           ├── sys_login_attempt.rs    # 新
│           └── mod.rs                  # 改:pub mod 加 2
├── Cargo.toml                   # 改:sea-orm features 加 with-ipnetwork + ipnetwork dep
deploy/
├── Dockerfile.rust-api.txt      # 改:runtime stage COPY xdb/resources/ip2region.xdb
docker-compose.{yml,dev,prod}.yml  # 改:XDB_FILEPATH env(dev bind-mount path / prod image path)
```

**Structure Decision**:單一 rust-api worktree、無新 crate。request-context middleware 進 `server`(`server/src/audit_ctx.rs`,對齊原 015 慣例,tasks 已定);兩表進既有 `entity`/`migration` crate。**兩段式 commit**(動 rust-api worktree → worktree commit+push fork + 外層 bump rust-api SHA pin;§4.1;不動 base-web、外層只 bump 一個 gitlink)。

## Design Notes(非 violation、供 implementer / review 對焦)

- **N-1 INET 真值(R1)**:採 `with-ipnetwork` + `client_ip: IpNetwork`(僅新表)。**不**改既有 `sys_operation_log.operator_ip: Option<String>`(仍 None→NotSet;其真值寫入屬 Phase 4 retrofit)。`with-ipnetwork` 為 workspace sea-orm additive feature。
- **N-2 axum::serve 簽名改**:`main.rs:104` `serve(listener, app)` → `serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())`(ConnectInfo 前置)。為既有最小必要改動。
- **N-3 middleware 順序**:global `.layer()`(ctx_mw)跑 outermost → 先擷取脈絡、後拿 final status(含 enforce 403);access-log 寫入閘門 = `operator_id.is_some()`(同時實現 FR-001/FR-002)。acceptance §3 驗 enforce 後 final status 正確入 log。
- **N-4 xdb runtime path(R2)**:server cwd ≠ `xdb/` → `searcher_init(Some(XDB_FILEPATH))` 顯式;prod image COPY 11 MB `.xdb`。dev/prod compose 設 `XDB_FILEPATH`。
- **N-5 auth 前導 DRY**:ctx_mw 為第 5 處重複 bearer→verify(§2.17),續 defer、不在 015 抽 helper。
- **N-6 CDP defer**:純後端無 CDP;curl≠經 nginx 真實 XFF → §7 prod stack 補一條經 front-nginx 的 client_ip/XFF 活體驗(緩解)。

## Complexity Tracking

> 無 Constitution violation → 本節空。
