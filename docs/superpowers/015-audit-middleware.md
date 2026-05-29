# 015-audit-middleware — Phase 0 brainstorm（spec-design）

> **feature**：request-context middleware + access-log（請求層審計，Phase 3 audit-middleware 的前半）。
> **狀態**：brainstorm 凍結（2026-05-30 user 親決 D1-D10）。本檔為 `/speckit-specify` 的輸入；忠實落地、非自由設計。
> **拆分決策（2026-05-30）**：roadmap 的 `audit-middleware(請求層 operator_ip/xdb)` 拆兩個 feature。**015 = 本檔**（request-context middleware + access-log 兩表 + 登入嘗試記錄，現在就能端到端 demo）。**A（資料變動 audit 補 operator 屬性）留 Phase 4**（待有真實變動 endpoint 才 demo 得出來，連同 [CHECKLIST §2.16](../INTEGRATION-CHECKLIST.md) audit_json nick_name）。**登入失敗 lockout（N 分鐘鎖）留之後獨立 feature**，015 只提供 `sys_login_attempt` 資料給它用。
> **對齊**：DESIGN §10 Phase 3 audit-middleware；承接 011（audit 哲學）/ 012（xdb crate，本 feature 首個消費者）/ 013（JWT/bearer，取 operator_id）。解 [CHECKLIST §2.14](../INTEGRATION-CHECKLIST.md)（operator_ip INET 42804）+ [§2.15](../INTEGRATION-CHECKLIST.md)（xdb runtime path/打包）。

---

## 1. 目標與範圍

在 HTTP 請求層建立審計：**(B) 每已認證請求記 access log**（誰、何時、哪個 IP/來源地、打哪個 API、結果）+ **登入嘗試記錄**（成功/失敗，供未來 lockout）。建立一個 **request-context middleware** 抽取請求脈絡（operator_id / client_ip / X-Forwarded-For / xdb 來源地 / trace_id），供 access-log 與（未來）資料變動 audit 共用。

- **觀察性、非交易**：access-log 是事後觀察記錄，寫失敗**不得**讓業務請求失敗（與 011 `mutate_in_txn` 的原子 audit 相反）。
- **首個 xdb 消費者**：012 只拷貝 `xdb` crate、從未 wire；015 真正消費它做 IP→來源地，故須解 §2.15 runtime path + prod 打包。
- **解既有債**：§2.14 operator_ip/client_ip INET 真值寫入（011 留的 `Some(ip)→42804`）。

## 2. 凍結決策（D1-D10，2026-05-30 user 親決）

- **D1 範圍 = B（access-log）+ context middleware；A 留 Phase 4**（user 選「拆兩個」）：015 做 request-context middleware + 兩張 access-log 表 + 已認證請求記錄 + 登入嘗試記錄。**不**做資料變動 audit 補 operator（A，→ Phase 4）、**不**做登入 lockout 本身（→ 之後 feature，015 只供資料）、**不**做 async/batched 寫入（→ 未來優化）。
- **D2 兩張表**（user 選「拆兩表」）：`sys_access_log`（一般已認證請求）+ `sys_login_attempt`（登入嘗試專表、為 lockout 建 index）。概念乾淨、lockout 查專屬 indexed 表。
- **D3 記錄範圍 = 只記已認證請求 + 登入嘗試**（user 親決）：
  - 已認證請求（有效 JWT → `operator_id` 已知）：middleware 寫 `sys_access_log`。
  - 登入嘗試（成功 + **失敗**）：login handler 寫 `sys_login_attempt`。
  - **公開端點**（`getConstantRoutes`、login 本身對 access-log 而言）→ middleware **不**寫 access-log；`/health` → 不寫。
  - 非 login 端點的失敗認證（過期 token → 3333）**不**記（只記成功認證 + 登入嘗試）。
- **D4 登入記錄機制 = login handler 自己記**（user 選；middleware 只看得到 HTTP 200、看不到業務碼 1000）：login handler 知道 attempted `userName` + 成功/失敗 + ip，由它寫 `sys_login_attempt`（`success` 旗標）。middleware 不碰 login（公開、不重複）。沿 011「handler 擁有 audit 寫入」模式。
- **D5 IP 記錄 = `client_ip` + `x_forwarded_for` 並存**（user 親決，2026-05-30 補）：
  - `client_ip`（INET）= **直連對端 IP**（axum `ConnectInfo` peer）；prod 走 front-nginx 時這會是 nginx 的 IP，誠實、永遠有值。
  - `x_forwarded_for`（TEXT，nullable）= **原始 XFF header 字串逐字保存**（`client, proxy1, ...` 整條鏈；dev 直連無此 header → null）。
  - 015 **不**做「哪一跳才是真實 client」的 trust 解析（需指定信任的 reverse proxy、往前一跳推算真實 client IP）→ **留未來 feature**，015 只忠實保存直連 IP + 原始 XFF 鏈兩個事實。
- **D6 write 策略 = best-effort 同步寫**（user 確認）：access-log 寫失敗只 `tracing::warn!`、**不**失敗業務請求（觀察性、非交易）。admin panel 低流量、同步寫夠用；async/batched 留未來優化。
- **D7 region = xdb raw 字串**：存 xdb 解析的原始字串（如 `中国|0|北京|北京市|0`），**不**解析成 province/city 欄（YAGNI）。解 §2.15：設 `XDB_FILEPATH` env 或絕對路徑 + **prod runtime stage COPY `ip2region.xdb`**（現只 COPY binaries + application.yaml、無 11MB 資料檔）。
- **D8 INET 真值寫入（§2.14）**：`client_ip` INET 欄寫真值需 sea_query `Expr` cast 或 sea-orm ipnetwork custom type（解 011 留的 `Some(ip)→Set(text)→PG 42804`）。具體手段 plan 階段 grep 驗。
- **D9 trace_id = 每請求 uuid v4**（user 確認，可加新 dep `uuid`）+ 尊重入站 `X-Request-Id` header（有則沿用、無則生成）。trace_id 存兩表，供未來請求關聯。
- **D10 acceptance = 純單測 + live curl+psql、無 CDP**：本 feature 純後端、無新前端行為 → 不需 CDP；以對 dev stack 的 curl + psql 活體驗收 + 純單測。

## 3. 元件分解（單一職責、可獨立測）

| 元件 | 職責 | 依賴 |
|---|---|---|
| request-context middleware（新，`server/src/` 內，依現有結構放 `auth/` 或新 `middleware/`） | 全域 `.layer()`：抽 `client_ip`（ConnectInfo）+ `x_forwarded_for`（raw header）+ `region`（xdb）+ `trace_id`（uuid/X-Request-Id）入 request extension；試 bearer→`jwt::verify`→`operator_id` 入 extension；handler 跑完後 **best-effort** 寫 `sys_access_log`（僅已認證） | xdb / jwt(013) / bearer(013) / facade sys_access_log / envelope（不改） |
| xdb region resolver（薄封裝，重用 012 `xdb` crate） | IP 字串 → 來源地 raw 字串；集中 `XDB_FILEPATH`/路徑解析（§2.15） | 012 `xdb` |
| `sys_access_log` 表 + entity + facade（新） | 已認證請求列寫入；INET `client_ip` 真值（§2.14） | migration / entity / 009 facade 邊界 |
| `sys_login_attempt` 表 + entity + facade（新） | 登入嘗試列；INET + lockout 用 index | 同上 |
| login handler 改（`handler/auth.rs::login`） | 成功/失敗各寫一筆 `sys_login_attempt`（讀 extension 的 ip/region/trace_id） | sys_login_attempt facade / request extension |
| `main.rs` | 全域掛 context middleware `.layer()`（非 route_layer；注意與 013 `enforce_mw` 疊加順序）；`axum::serve` 改 `into_make_service_with_connect_info::<SocketAddr>()`（ConnectInfo 前置） | middleware |
| `deploy/Dockerfile.rust-api.txt`（runtime stage） | COPY `ip2region.xdb` 進 runtime image（§2.15） | — |

## 4. Schema（兩表，經 010 自動套；append-only、無 `deleted_at`、非 SoftDeletable，同 011 `sys_operation_log` 性質）

**`sys_access_log`**（migration `m20260529_000011`）：
`id` BIGSERIAL / `operator_id` BIGINT（已認證 → user_id）/ `method` / `path` / `http_status` INT / `client_ip` INET / `x_forwarded_for` TEXT? / `region` TEXT? / `trace_id` TEXT? / `created_at` TIMESTAMPTZ

**`sys_login_attempt`**（migration `m20260529_000012`）：
`id` BIGSERIAL / `attempted_user_name` / `success` BOOL / `operator_id` BIGINT?（成功時 = user_id）/ `client_ip` INET / `x_forwarded_for` TEXT? / `region` TEXT? / `trace_id` TEXT? / `created_at` TIMESTAMPTZ
**index**：`(attempted_user_name, created_at)` + `(client_ip, created_at)`（未來 lockout：「N 分鐘內某帳號/IP 失敗次數」）

> casbin_rule / sys_operation_log 不動；本 feature **新增兩張獨立表**（access-log 與資料變動 audit 是不同關注點、不同 shape）。

## 5. 測試 / acceptance（CLAUDE.md §3 TDD）

**純單測（test-first，no-DB、常規 `cargo test`）**：
- `region` 解析薄封裝：IP → raw 字串（非空、`|` 分段；沿 012 xdb 測試模式）。
- `client_ip` / `x_forwarded_for` 抽取：有 XFF header → `x_forwarded_for` = raw 鏈、`client_ip` = ConnectInfo peer；無 XFF → `x_forwarded_for` = None。
- `sys_access_log` / `sys_login_attempt` 的 ActiveModel SQL-build：INET 欄正確寫真值（**不再** 42804）、欄位齊全（沿 011 `audit_active_model` SQL-build 測試模式）。

**wiring/形狀（無新純邏輯）→ acceptance 覆蓋**：middleware 接線、login handler 寫入、ConnectInfo 前置。

**活體 acceptance（C-V、對 dev stack curl + psql）**：
- login **成功**（Super）→ `sys_login_attempt` 寫 1 筆（`success=true`、`operator_id`=user_id、真實 `client_ip` INET、`region`）。
- login **失敗**（壞密碼）→ `sys_login_attempt` 寫 1 筆（`success=false`、`attempted_user_name`、`operator_id` NULL）。
- `getUserInfo`（已認證 Bearer）→ `sys_access_log` 寫 1 筆（`operator_id` + `method/path/http_status` + INET `client_ip` + `region`）。
- `getConstantRoutes`（公開）→ **不**寫 `sys_access_log`；`/health` → 不寫。
- psql 驗：INET 欄為真實 IP（非 NULL、無 42804 錯）；`x_forwarded_for` 在帶 XFF 時有值。

**守恆**：既有測試不破（server 56+3 + xdb 9 + lint 17）、009 entity-access lint（新表只經新 facade）、008 envelope、007 FR-009（migration 經 010 自動套、server 不自動 migrate）、**prod runtime image build sanity**（新 dep `uuid` + runtime COPY `ip2region.xdb` + 驗 server 在 prod 容器找得到 xdb 檔）。

## 6. scope 邊界（不做、留後續）

- **A：資料變動 audit 補 operator 屬性** → Phase 4（待真實變動 endpoint；連同 §2.16 audit_json nick_name）。015 的 context middleware 已備好 operator context 供 A 將來消費。
- **登入失敗 lockout（N 分鐘鎖）** → 之後獨立 feature；015 只提供 `sys_login_attempt` + index。
- **「真實 client IP」從 XFF trust 解析**（指定信任 reverse proxy、前一跳）→ 未來 feature；015 只存原始 XFF。
- **async/batched access-log 寫入** → 未來優化；015 同步 best-effort。
- **access-log 治理**（soft-delete/CRUD/保留期清理）→ 不做（append-only；保留期清理可併 Phase 5 cleanup-job）。
- **region 解析成結構欄**（province/city）→ 不做（存 raw 字串）。

## 7. 工程紀律

- **無新 workspace crate**（middleware 進 `server`、表進既有 `entity`/`migration` crate）→ 無 Dockerfile builder COPY *crate* 缺口。**惟**：新 dep `uuid`（server crate）+ runtime stage 新 COPY `ip2region.xdb` → **acceptance 必含 prod runtime image build**（守 [CHECKLIST §2.13](../INTEGRATION-CHECKLIST.md) 跨 feature 守則精神：動 Dockerfile/dep 須驗 prod build），並驗 server 在 prod 容器內找得到 xdb 資料檔。
- **兩段式 commit（單一 worktree）**：本 feature 動 **rust-api worktree**（middleware/表/handler/Dockerfile）→ worktree commit+push fork + 外層 bump rust-api SHA pin（§4.1 標準兩段式）。**與 013/014 不同**：不動 base-web → 外層只 bump rust-api 一個 gitlink、無 base-web 第二個 worktree 的提交。
- **守紀律**：008 envelope（handler 仍 `Res<T>`、middleware 不改回應信封，只在回應後旁路寫 log）；009 entity-access lint（`sys_access_log`/`sys_login_attempt` 只經新 facade 構造 ActiveModel、middleware/login-handler 不直碰 `entity::`）；007 FR-009（兩 migration 經 010 自動套、server 不自動 migrate）；011 audit 哲學（facade 為唯一 entity 寫入管道）。
- **Phase 0 research 紀律（plan 階段必做 grep）**：
  - axum `ConnectInfo` 接線：`main.rs` 現用 `axum::serve(listener, app)` 無 connect_info → 須改 `into_make_service_with_connect_info::<SocketAddr>()`；grep 確認 axum 版本支援 + handler/extension 取用方式。
  - nginx conf（`deploy/nginx/conf.d/*`）是否設 `X-Forwarded-For`（prod XFF 來源）；dev 直連無 nginx。
  - 012 `xdb` API：IP→region 呼叫法、`default_detect_xdb_file`（找 `resources/ip2region.xdb` 相對 cwd）、`XDB_FILEPATH` 設法、`ip2region.xdb` 11MB 資料檔現在位置（拷貝進 image 來源）。
  - INET 寫入（§2.14）：sea-orm/sea_query 對 INET 的真值 binding（`Expr` cast vs ipnetwork custom type），grep 哪個在 rev2 sea-orm 1.1.20 可行。
  - `uuid` dep：確認未存在 + 挑穩定版（MSRV 1.86 相容）。
  - middleware 疊加順序：全域 context `.layer()` vs 013 `/systemManage/getUserList` 的 per-route `enforce_mw`（route_layer）的執行順序，確保 access-log 拿得到最終 status。

## 8. 對既有的依賴與承接

| 項 | 來源 |
|---|---|
| operator_id 取得（已認證請求）| 013 `auth/jwt.rs::verify` + `JWT_AUD` + `auth/bearer.rs::bearer_token`（middleware 自驗一次；§2.17 auth 前導 DRY 仍 defer）|
| IP→來源地 | 012 `xdb` crate（本 feature 首個消費者；解 §2.15 runtime path/打包）|
| audit 哲學 + facade 邊界 | 011（facade 唯一 entity 寫入管道、append-only 表）；惟本 feature 新表、不重用 `sys_operation_log` |
| envelope | 008 `Res<T>`（handler 不變；middleware 旁路寫 log、不改回應）|
| migration 自動套 | 010（兩 migration 經 stack `up` 自動套、server 不自動 migrate）|
| INET gap | 解 011 留的 §2.14（`Some(ip)→42804`）|
