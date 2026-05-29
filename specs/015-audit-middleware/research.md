# Research: 015-audit-middleware（Phase 0）

> **§I.5 紀律**：本 feature **未 grep rev1 source**；所有 grep 對象為 **rev2 自身**（xdb crate / sea-orm 版本 / nginx conf / Dockerfile / main.rs / 011 audit 既有）。日期 2026-05-30。
> 解析 spec 的技術未知 + brainstorm §7 標記的 plan-階段 research grep。**0 NEEDS CLARIFICATION**。

## grep 事實基準（rev2，2026-05-30）

- **axum**：`rust-api/Cargo.toml:6` `axum = "0.7"`；Cargo.lock = **0.7.9**。`main.rs:104` 現為 `axum::serve(listener, app)`（無 connect_info）。`from_fn_with_state` 已用於 `auth/enforce.rs`（per-route）。
- **sea-orm / sea-query**：`rust-api/Cargo.toml:17` sea-orm `1.1.20` features `["sqlx-postgres","runtime-tokio-rustls","macros"]`；sea-query `0.32.7`（transitive）。**ipnetwork 不在 lock**；**uuid 在 lock**（`Cargo.lock:4006`，transitive）。
- **xdb**（012 拷貝、本 feature 首個消費者）：`xdb/src/lib.rs:4` 公開 `searcher_init(Option<String>)` + `search_by_ip<T>(ip) -> Result<String, Box<dyn Error>>`；資料檔 `rust-api/xdb/resources/ip2region.xdb`（11MB）。
- **nginx**：`deploy/nginx/conf.d/_locations.inc:5,13` 已設 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` + `X-Real-IP $remote_addr`。
- **011 audit**：`sys_operation_log` 表（`m..004`）有 `operator_ip` INET 欄（`.custom(Alias::new("INET")).null()`，`m..004:61-65`）；entity 映 `Option<String>`（`entity/src/sys_operation_log.rs:14`）；facade `None→NotSet` 規避 42804（`facade/sys_operation_log.rs:19-31`）。

---

## R1. 請求脈絡 middleware + axum ConnectInfo（接線）

**Decision**：新增全域 `from_fn` middleware（`.layer()` 掛全 Router）；`main.rs` 的 serve 改 `axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())` 以啟用 `ConnectInfo`。middleware 簽名取 `ConnectInfo<SocketAddr>` extractor + `Request` + `Next`：抽 client_ip（peer）/ X-Forwarded-For（raw header）/ region（xdb）/ trace_id → 建 `RequestContext` 入 `req.extensions_mut()`；試 bearer→`jwt::verify`→operator_id；`next.run` 後 best-effort 寫 access-log。

**Rationale**：axum 0.7.9 支援 `into_make_service_with_connect_info`；ConnectInfo 由 make_service 注入 extensions、middleware/handler 皆可取。全域 `.layer()` 確保所有路由（含 login）都建 `RequestContext`；access-log 寫入則由「operator_id 是否存在」閘控（見 R5）。

**Alternatives**：per-route layer（否決、需逐路由掛、漏網）；tower::Layer 自訂（否決、from_fn 已足且與 enforce.rs 一致）。

## R2. access-log 寫入閘門（「只記已認證」優雅實作）

**Decision**：middleware `next.run` 後，**iff JWT verify 成功（operator_id 已知）** 才寫 `sys_access_log`（帶 response status）。無/壞 token → operator_id None → **skip**（不寫）。

**Rationale**：此單一閘門天然涵蓋 spec D3：
- `getUserInfo`/`getUserRoutes`/`isRouteExist`（帶有效 JWT）→ operator_id Some → 記。
- `login`/`getConstantRoutes`（公開、無 token）→ None → middleware skip（login 由 handler 另記 login-attempt、見 R6）。
- `/health`（無 token）→ None → skip。
- authed 端點帶過期 token（3333）→ verify 失敗 → None → skip（對齊 D3「非 login 端點失敗認證不記」）。

**Alternatives**：維護公開路由白名單（否決、易漏；operator_id 閘門更穩）。

## R3. 來源擷取 = client_ip（直連）+ x_forwarded_for（原始鏈）

**Decision**：`client_ip` = `ConnectInfo<SocketAddr>` 的 peer IP（**永遠有值**、NOT NULL）；`x_forwarded_for` = 原始 `X-Forwarded-For` header 逐字字串（nullable，無 header→None）。**不**做信任代理「真實 client」解析（留未來 feature）。

**Rationale**：nginx 已設 XFF（`_locations.inc:5,13`），prod 轉發鏈可得；dev 直連無 nginx→無 XFF→`x_forwarded_for=None`、`client_ip`=直連。忠實保存兩事實，未來 trust-proxy feature 可從 raw XFF 推算。

## R4. region = xdb raw 字串（§2.15 runtime path/打包）

**Decision**：middleware 呼 `xdb::search_by_ip(client_ip_string)` → 存 raw 字串（`country|0|province|city|isp`，如 `中国|0|北京|北京市|0`）於 `region` 欄（nullable，解析失敗→None、不阻斷）。boot 時 `xdb::searcher_init(None)`（11MB 載一次、OnceCell、thread-safe、無需 Arc）。

**§2.15 解法**（xdb path detection 走 cwd 相對 `resources/ip2region.xdb`、但 server cwd=`/app` 兩環境都不在 xdb/ 下 → 必須設 `XDB_FILEPATH` 絕對路徑）：
- **dev compose**：`XDB_FILEPATH=/app/xdb/resources/ip2region.xdb`（bind-mount 已含）。
- **prod runtime image**：Dockerfile runtime stage 新增 `COPY rust-api/xdb/resources/ip2region.xdb ./resources/ip2region.xdb`（WORKDIR `/app`）+ env `XDB_FILEPATH=/app/resources/ip2region.xdb`。`m..004`/builder 不需此檔（runtime 資料、非編譯；Dockerfile:43 註解已預告本 feature 處理）。

**Rationale**：xdb 全檔記憶體快取、per-call O(1)、`test_multi_thread_only_load_xdb_once` 證 thread-safe → 可直接於 middleware 每請求呼叫。region 不解析成結構欄（D7、YAGNI）。

## R5. INET 真值寫入（§2.14 機制解決）

**Decision**：啟 sea-orm **`with-ipnetwork`** feature（`rust-api/Cargo.toml` sea-orm features += `"with-ipnetwork"`）；新表 `client_ip` 欄 entity 型用 **`ipnetwork::IpNetwork`**（NOT NULL）、migration `.custom(Alias::new("INET")).not_null()`。facade 由 `IpAddr`/字串 → `IpNetwork` → `Set(...)`，sea-orm 自動 emit `::inet` cast（解 42804）。

**sys_operation_log（011）不在 015 retrofit**：015 **不寫** `sys_operation_log`（其 `operator_ip` 由 Phase 4「A:資料變動補 operator」真正寫入時才需 INET 真值）。故保持 011 現狀（`Option<String>` + `None→NotSet`、永遠寫 None、不觸 42804）；§2.14 的**機制**由 015 新表證明，sys_operation_log 欄 retrofit 為 Phase 4 A 的 trivial follow-on（套同一 IpNetwork pattern）。→ **015 不碰 011 entity/facade/tests**，scope 維持最小。

**Rationale**：`col_expr` 不支援 Insert（sea-orm 1.1.20 僅 update_many、`facade/sys_user.rs:61` 證）；`with-ipnetwork` 為 idiomatic 解、ActiveModel 路徑不變。entity 引 `IpNetwork`（經 sea-orm with-ipnetwork re-export 或加 `ipnetwork` dep，implementer 確認精確 import）。

**Alternatives**：raw `Statement` + `$n::inet`（否決、失 ActiveModel ergonomics）；retrofit 011（否決-於 015、避免碰 011 未寫路徑、scope creep）。

## R6. 登入嘗試記錄（login handler 自記）

**Decision**：`handler/auth.rs::login` 加 `Extension<RequestContext>` extractor，決定成敗後讀 ctx（client_ip/xff/region/trace_id）寫一筆 `sys_login_attempt`（`attempted_user_name`=req.user_name〔截斷 ≤64〕、`success`、`operator_id`=成功時 Some(user.id) 否則 None）。best-effort（寫失敗 warn、不影響 login 回應）。

**Rationale**：middleware 只見 HTTP 200（envelope）、不見業務碼 1000（D4）；login handler 知 attempted userName + 成敗 → 由它記。middleware 對 login（無 token）skip access-log、不重複。`RequestContext` 由全域 middleware 先建、login handler 經 Extension 取。

## R7. trace_id（每請求關聯碼）

**Decision**：middleware 生成 trace_id：有入站 `X-Request-Id` header → 沿用（截斷 ≤64）；否則 `uuid::Uuid::new_v4()`。存兩表 `trace_id`（NOT NULL、`string_len(64)`）。加 `uuid` direct dep（`features=["v4"]`；已 transitive 存在於 lock、成本低）。

**Rationale**：D9；uuid 已在 Cargo.lock（transitive）→ direct dep 便宜。

## R8. 既有契約守恆 + 工程紀律

**Decision**：守 **008 envelope**（handler 仍 `Res<T>`；middleware best-effort 旁路寫 log、**不改回應**）+ **009 entity-access lint**（`sys_access_log`/`sys_login_attempt` 只經新 facade 構造 ActiveModel；middleware/login-handler 不直碰 `entity::`；pure event 型不含 entity path）+ **007 FR-009**（兩 migration `m..011`/`m..012` 經 010 自動套、server 不自動 migrate）+ **011 audit 哲學**（facade 唯一 entity 寫入管道、append-only 無 deleted_at）。

**新 dep / 打包 → prod build sanity**：新 dep `uuid`（direct）+ sea-orm `with-ipnetwork`（拉入 `ipnetwork`）+ runtime COPY `ip2region.xdb` + 設 `XDB_FILEPATH` → **acceptance 必含 prod runtime image build + 驗 server 容器內找得到 xdb 檔**（守 [CHECKLIST §2.13](../../docs/INTEGRATION-CHECKLIST.md) 精神：動 Dockerfile/dep 須驗 prod build）。**無新 workspace crate** → 無 builder COPY *crate* 缺口。

**Rationale**：§I 紀律 + 跨 feature 守則。best-effort 寫（FR-007）與 011 原子 audit 對比明確。

---

## Research 結論

8 項全解析、**0 NEEDS CLARIFICATION**。**§I.5 遵守**（未 grep rev1）。**無新 workspace crate**；新 dep `uuid`(direct，已 transitive) + sea-orm `with-ipnetwork`(拉入 ipnetwork)。**最高風險點**：(a) ConnectInfo 接線（serve 改 make_service、middleware 取 peer）；(b) INET 真值寫入（with-ipnetwork + IpNetwork、需驗實際 `::inet` cast 不再 42804）；(c) xdb runtime path（XDB_FILEPATH + prod COPY 11MB 檔、驗容器內可解析）；(d) middleware 全域 layer vs 013 per-route enforce_mw 疊加順序（access-log 須拿到最終 status）。
