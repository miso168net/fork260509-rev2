# Phase 0 Research: 015-audit-middleware

**Date**: 2026-06-01 | **Branch**: `015-audit-middleware`
**研究對象**: `rust-api` worktree @ `c4b1d7e`(= 014 state)。**未 grep rev1 source**(守 constitution §I.5)。

承接:011(audit/`mutate_in_txn`)/ 012(`xdb` crate)/ 013(`jwt`/`bearer`/`enforce`)。

---

## R1. INET 真值寫入手段(★ 最高風險、brainstorm D8 留 plan 決)

**現況事實**:
- `entity/src/sys_operation_log.rs:14` `operator_ip: Option<String>`;DB 欄由 `migration ...004:62-64` `.custom(Alias::new("INET"))` 建為 raw INET。
- workspace `Cargo.toml:17` sea-orm features = `["sqlx-postgres","runtime-tokio-rustls","macros"]` —— **無 `with-ipnetwork`**;`ipnetwork` crate **非依賴**。
- `facade/sys_operation_log.rs:27-44` 的 `Some(ip)→Set(Some(ip))` 分支**從未被執行**(011 永遠寫 None→NotSet),且 inline 註解明示此 text-binding 對 INET 欄會觸 **PG 42804**。**015 是第一個寫真值 client_ip 的 feature**,沿用現況會爆 42804。

- **Decision**:採 **sea-orm `with-ipnetwork` feature + `ipnetwork::IpNetwork` 欄型**(僅用於 015 兩張新表的 `client_ip` 欄)。新表 entity `client_ip: IpNetwork`(host IP 存為 `/32`),`ActiveModel` `Set(ipnet)` 由 sea-orm 原生綁為 inet、無手動 cast。
- **Rationale**:sea-orm 原生 inet 對映、ActiveModel insert 一致、可單測(SQL-build)+ 活體驗。`with-ipnetwork` 為 workspace sea-orm **additive** feature,不改既有 `sys_operation_log.operator_ip: Option<String>`(它仍寫 None→NotSet)。`ipnetwork` 須驗 Rust **1.86** 可編(plan 階段 pin 版本)。
- **Alternatives rejected**:(a) **sea_query `Expr` cast**(`$1::inet`)—— 須繞過 ActiveModel 用自訂 insert、較脆、與 facade ActiveModel 慣例不一致;(b) 改 `sys_operation_log.operator_ip` 也轉 `IpNetwork` —— scope creep(011 的真值寫入屬 Phase 4「operator 歸屬 retrofit」、不在 015)。

> `x_forwarded_for` / `region` / `trace_id` 為文字欄(`Option<String>`),無 INET 議題。

## R2. xdb 來源地解析接線(brainstorm D7、解 §2.15)

**現況事實**:
- `xdb/src/lib.rs` 公開 `search_by_ip<T: ToUIntIP + Display>(ip: T) -> Result<String, Box<dyn Error>>`(回 `国|区|省|市|ISP` `|` 分段字串)+ `searcher_init(Option<String>)`。**僅 IPv4**(`ToUIntIP` 無 IPv6 impl;IPv6 字串→`Err`)。
- 檔案偵測 `default_detect_xdb_file()` 找相對 cwd `resources/ip2region.xdb`(僅 cwd=`xdb/` 時有效);env 名 `XDB_FILEPATH`。實體檔在 `rust-api/xdb/resources/ip2region.xdb`(**11 MB**)。
- **`xdb` 非 `server` 依賴**(僅 workspace member);`server/Cargo.toml` 無 `xdb` 行。

- **Decision**:`server/Cargo.toml` 加 `xdb = { path = "../xdb" }`;boot 時 `searcher_init(Some(env XDB_FILEPATH))` 顯式指路;compose(dev+prod)設 `XDB_FILEPATH` env;**prod runtime Dockerfile COPY `ip2region.xdb` 進 image**。middleware 呼 `xdb::search_by_ip(client_ip)`(直連 IPv4)。
- **Rationale**:server cwd ≠ `xdb/`,cwd-relative 偵測必失敗 → 必須顯式 env/路徑。11 MB 資料檔不在現 prod runtime stage(只 COPY binaries+yaml)→ 必補 COPY,否則 prod 起來解析不到(§2.15)。
- **Alternatives rejected**:把 `.xdb` 嵌進 binary(`include_bytes!` 11 MB)→ image/binary 肥、編譯慢,YAGNI。
- **best-effort**:解析 `Err`(IPv6/壞輸入)→ `region=None`、不阻斷寫入(spec Edge Case + FR-003)。

## R3. client_ip / x_forwarded_for 擷取 + ConnectInfo(brainstorm D5)

**現況事實**:
- `server/src/main.rs:104` `axum::serve(listener, app)` —— **無 `into_make_service_with_connect_info`**;全 `server/src/` 無 `ConnectInfo`/`SocketAddr`。
- `deploy/nginx/conf.d/_locations.inc:9-15`(dev.conf + prod.conf 皆 `include`)設 `X-Forwarded-For = $proxy_add_x_forwarded_for` + `X-Real-IP = $remote_addr`;**無 `set_real_ip_from`/`real_ip_header`**(nginx 不改寫 `$remote_addr`)。

- **Decision**:
  - `main.rs` 改 `axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())`。
  - `client_ip` = `ConnectInfo<SocketAddr>` peer 的 IP(**直連對端、永遠有值、忠實**);存為 `IpNetwork /32`。
  - `x_forwarded_for` = 入站 `X-Forwarded-For` header **原始字串逐字保存**(無 header→`None`);**不**解析「真實 client」。
  - `region` 由 **`client_ip`(直連 peer)** 解析,**非**由 XFF。
- **Rationale**:忠實 D5 —— 015 只存兩個事實(直連 IP + 原始 XFF 鏈),信任代理逐跳推算留未來 feature(FR-006)。經 front-nginx 時 ConnectInfo=nginx 私有 IP(region→`内网IP`,memory `xdb_region_dev_private_ip`),真實 client 在 XFF —— 此為 D5 刻意取捨。
- **Alternatives rejected**:用 XFF leftmost 當 client_ip → 需信任邊界設定(`set_real_ip_from`),015 明確 out-of-scope。

## R4. middleware 接線與疊加順序(brainstorm §3、§7 research)

**現況事實**:`main.rs:60-95` 單一 `Router` + 末端 `.with_state(state)`;**無 global `.layer()`**;唯一 middleware 為 `/systemManage/getUserList` 的 per-route `.route_layer(from_fn_with_state(state, enforce::enforce_mw))`(main.rs:85-93)。fallback 在 :94。

- **Decision**:新增**全域** request-context middleware,以 `Router::layer(from_fn_with_state(state, ctx_mw))` 掛在整個 router(outermost)。`ctx_mw` 流程:
  1. **before**`next`:擷取 `client_ip`(ConnectInfo)+ `x_forwarded_for`(raw header)+ `region`(xdb)+ `trace_id`(入站 `X-Request-Id` 沿用、否則 `uuid::v4`);試 `bearer_token→jwt::verify`→ `operator_id = claims.user_id`(失敗→ operator 未知);全部塞 request extension。
  2. **after**`next`:取最終 response status;**若 operator_id 已解析**(= 已認證請求)→ best-effort 寫 `sys_access_log`;否則不寫(自然實現 FR-002:公開/health/認證失敗不寫)。
- **Rationale**:global `.layer()` 在 axum 跑 outermost(early research 確認)→ 比 per-route `enforce_mw` 先看到 request、後看到 final response(含 enforce 403)→ access-log 拿得到最終 status。「只有 operator_id 解析成功才寫」一條規則同時實現 D3 + FR-002(login/getConstantRoutes/health 無有效 JWT operator → 不寫)。
- **Alternatives rejected**:per-route 逐一掛 → 易漏、與「全請求觀察」相違。
- **best-effort 寫入**:寫失敗只 `tracing::warn!`、回應不變(FR-003);middleware 不改 `Res<T>` 信封(008、只旁路寫 log)。

## R5. operator_id 取得(承接 013)

**現況事實**:`Claims{ sub, user_id:i64, roles, exp, iat, iss, aud }`(jwt.rs:28-40);`verify(token,secret,aud)->Result<Claims,JwtError>`(jwt.rs:93,`JWT_AUD="rev2-admin"`);`bearer_token(headers)->Option<&str>`(bearer.rs:14);canonical 序列 `get_user_info`(auth.rs:144-186):`bearer_token→verify→claims.user_id`。

- **Decision**:`ctx_mw` 與 `login` handler 皆以 `bearer_token→jwt::verify(access secret, JWT_AUD)→claims.user_id` 取 `operator_id`(`Option<i64>`)。`sys_access_log.operator_id` = 已認證 user_id(必有);`sys_login_attempt.operator_id` = 成功時 user_id、失敗 None。
- **Rationale**:重用 013 既有 `jwt`/`bearer`,零新增認證碼。auth 前導 DRY(`get_user_routes`/`is_route_exist`/`get_user_info`/`enforce_mw`/ 本 `ctx_mw` 多處重複 bearer→verify)續 defer(CHECKLIST §2.17)、不在 015 抽。
- **登入記錄機制(D4)**:`login` handler 自記 `sys_login_attempt`(唯它知業務成敗 1000;middleware 只看得到 HTTP 200)。沿 011「handler 擁有 audit 寫入」。

## R6. uuid trace_id(brainstorm D9)

**現況事實**:`uuid` **非任何依賴**;MSRV `rust-toolchain.toml:2` = **1.86**(sea-orm 1.1.20 transitively 想 1.88、已用 `time=0.3.37`/`home=0.5.9` pin 規避)。

- **Decision**:`server/Cargo.toml` 加 `uuid = { version = "1", features = ["v4"] }`(plan 階段 pin 具體 1.x、驗 1.86 可編)。`trace_id` = 入站 `X-Request-Id`(有則沿用)否則 `Uuid::new_v4()`,存兩表 `trace_id: Option<String>`。
- **Rationale**:D9 凍結;uuid v1.x default 支援 1.86。
- **Alternatives rejected**:自手搓 random id → reinvent;`uuid` 為業界標準。

## R7. 兩表 schema / facade / entity-access lint(009)

**現況事實**:
- migration 最高 `m20260529_000010` → 015 用 **`m20260529_000011_create_sys_access_log`** + **`m20260529_000012_create_sys_login_attempt`**(各 `DeriveMigrationName`、`mod` 進 `lib.rs`、入 `migrations()` vec)。經 010 自動套、server 不自動 migrate(007 FR-009)。
- entity-access lint(`server/tests/entity_access_lint.rs`)禁 `entity::` path-root;**`src/model/facade/` 目錄豁免**(:367-369)→ 015 新 facade **必須**放 `facade/`。
- append-only 範本 = `sys_operation_log` entity:auto-inc `id`、`created_at` default-now、**無 `deleted_at`、不 impl `SoftDeletable`**、空 `Relation{}`。INET 欄用 `.custom(Alias::new("INET"))`。
- facade 慣例:private 純 `x_active_model(...) -> entity::X::ActiveModel`(單測 seam)+ thin `pub async fn write_*(...) -> Result<(),DbErr>` 做 `.insert().await?`。

- **Decision**:兩表沿 `sys_operation_log` append-only 範本(+ R1 的 `IpNetwork client_ip`);facade `facade/sys_access_log.rs` / `facade/sys_login_attempt.rs`(註冊 `facade/mod.rs`),各 private active-model fn + thin write fn。`sys_login_attempt` 加 index `(attempted_user_name, created_at)` + `(client_ip, created_at)`(FR-008 lockout 查詢)。
- **§I.6 對齊**:兩表 **append-only** → constitution **§I.6 append-only 例外**:`created_at` + operator 欄(`operator_id`),**MUST NOT** 加 `updated_*`/`deleted_*`(見 plan Constitution Check item 8)。operator 欄名用 `operator_id`(語意、非 `created_by`,例外允許)。

## R8. 既有不破 / prod 打包 / 測試策略

- **無新 workspace crate**(middleware 進 `server`、表進既有 `entity`/`migration`)→ **不**觸發「新 crate ⇒ prod build」硬規則(CHECKLIST §2.13);**但**新增 dep(`uuid`/`ipnetwork`/`xdb` path-dep)+ runtime 須 COPY 11 MB `ip2region.xdb` + `with-ipnetwork` feature → **acceptance 仍須含 prod runtime image build**(dev bind-mount 會遮 COPY 缺口 + dep 缺口;brainstorm §7)。
- **`server` 為 bin-only**(無 lib.rs)→ live-DB 整合測試用 in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`,放 `facade/`(lint 豁免目錄;memory `project_rustapi_build_test_env`)。
- **純單測(test-first)**:region 薄封裝(IP→raw 字串,非空/`|` 分段)、IP/XFF 擷取(有 XFF→raw、無→None)、兩表 ActiveModel SQL-build(`client_ip` IpNetwork 真值正確 inet 綁定、欄齊)。
- **D10 無 CDP**:純後端、無新前端行為 → curl + psql 活體 + 純單測,無瀏覽器驗收(contracts 明示)。

---

## 待 plan/tasks 鎖定的具體版本(implementer act-on-actual-code)
- `uuid` 具體 1.x patch(驗 1.86)、`ipnetwork` 版本(sea-orm 1.1.20 `with-ipnetwork` 對應的 ipnetwork major,驗 1.86)。
- `XDB_FILEPATH` 在 dev(bind-mount path)vs prod(image COPY path)的確切值 → compose env。
- `ctx_mw` 與 `enforce_mw` 在 `/systemManage/getUserList` 的疊加實測順序(global layer vs route_layer)→ acceptance 驗 access-log 拿到 enforce 後 final status。
