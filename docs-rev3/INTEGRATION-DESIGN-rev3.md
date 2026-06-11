# rev3 管理系統開發設計書（INTEGRATION-DESIGN-rev3）

> **狀態**：本檔 = rev3 設計書的**唯一迭代本**（檔名不帶版本號），歸宿 = rev3 repo 的 `docs/INTEGRATION-DESIGN-rev3.md`（初稿於 rev2 workspace 作成、2026-06-11 完成機器驗證：45 修正＋15 抽查）。**⚠️ = 工程決策的「資深建議預設」、待 user 覆核**；開放問題與全部 ⚠️ 的**唯一清單＝附錄 G**（含最晚決策點）。
> **結構**：Part I 總綱（§0～§2，10 分鐘懂全貌）／ Part II 設計契約（§3～§7，凍結度高）／ Part III 交付計畫（§8，明示可變）／ Part IV 基線與附錄（§9～§11 + 附錄 A～G）。
> **rev2 編號慣例**：文中凡 `（rev2 NNN）` 指 rev2 的 feature 編號（rev2 repo `specs/<NNN>-*`，001–035）；`rev2 mNNN` 為 rev2 migration `m20260529_000NNN` 縮寫。rev3 自身的 feature／migration 編號日後不帶此前綴，兩者不可混讀。
> **rev2 史料引用慣例**：本書事實由 rev2 史料 ground（12 表 live DDL 稽核、constitution v1.6.0、rev2 設計文件與 35 specs、實碼實機核對），並已於 2026-06-11 機器驗證、**結論自含於本書**。文中殘留的 rev2 文件名（REVIEW-DATABASE／MILESTONES／MOCK-COVERAGE-AUDIT 等）僅為出處紀錄、**非可解析連結**——該等檔案存於 rev2 repo、不隨本書移植；對照總表與移植策略見附錄 D。

---

# Part I · 總綱

## §0 — 前言與方法論

【目的】告訴讀者「這本書怎麼讀、為什麼這樣排」，並一次定死預設範式。本章 ≤1 頁；方法論的由來與證據在附錄 B、Google-5 覆蓋檢查只在附錄 E 出現一次。

- **§0.1 預設範式與雙脊椎宣告**：本系統為 **data-centric / Information Engineering / Forms-over-Data**（admin/RBAC 後台的教科書主幹）。**對內脊椎 = 資料模型（§3）**——facade / endpoint / enforce / menu 皆為其投影；**對外凍結 = wire contract（§7）**——由 base-web/mock 期望定義（constitution §I.1/§I.3）。兩者平時同構；**衝突時 wire 優先**（schema 服務 wire、不反向），裁決紀錄走 §9.5 amendment 軌。**例外（行為島）明列於 §4**——那 3 台狀態機改用行為為中心（state-machine）鏡頭。**不主張 DDD**（本系統領域模型 ≈ 資料模型，CRUD/RBAC 使然）。
- **§0.2 方法論四原則**：① **資料模型脊椎**（§3 先設計、先凍結）② **面矩陣**（§5 設計一次、每 entity 逐格繼承）③ **三序分離**（依賴序 §1.5 凍結；交付序／風險序 §8 分開畫、分開命名）④ **縱切交付**（§8 一 entity 端到端、所有面一次碰頭）。
- **§0.3 文件衛生紀律**：本書是**前瞻設計（薄、穩定）**；as-built 實錄走 rev3 自己的 append-only 里程碑檔（沿用 rev2 的 MILESTONES 慣例、於 rev3 repo 另立）。**設計書不因實作而膨脹**——rev2 的 `INTEGRATION-DESIGN.md` 膨脹到 247KB（實測 246,803 bytes）＝計畫與實錄混寫的代價。本書各章只寫設計結論與不變式；實作細節留 `specs/` 與 MILESTONES。

### §0.4 名詞定義

全書反覆使用的六個結構名詞，定義一次、各章繼承：

| 名詞 | 定義 | 主要出處 |
|---|---|---|
| **entity** | 資料模型脊椎的基本單位：一張表（自命名表一律 `sys_*` 單數、唯一外掛 `system_settings`；`casbin_rule`／`seaql_migrations` 為 adapter／框架定名、不在此命名紀律內）＋其全部投影（migration、facade、endpoint、wire type）。12 張全列於附錄 F 資料字典。 | §3 |
| **aspect（面）** | 橫切正交維度（soft-delete／op-log 審計／enforce／envelope／search…），**設計一次、每 entity 逐格繼承**（§5.0 矩陣打勾）；是 entity 設計的一部分、不是「之後再加」的 Phase 交付物。 | §5 |
| **island（行為島）** | 「行為 > 資料」的少數模組：先設計 states + transitions + invariants，表只是該狀態機的持久化。rev3 共 3 台（token rotation §4.1／policy governance §4.2／single-session §4.3）；與之相對，預設範式下的一般 entity 群在 §5／§8 稱 **data island**。 | §4 |
| **layer（層）** | 依賴序 DAG 的節點（L0 INFRA-STATIC ～ L9 OBSERVABILITY）：**架構層級、非 feature、非排程**；凍結，與交付序／風險序嚴格分離（§0.2 原則③）。 | §1.5 |
| **slice（縱切）** | 交付單位：一 entity（或一行為島）端到端——migration → facade → handler → router → policy(enforce) → wire → test → frontend，逐面套 §5.0，在最便宜時暴露整合。 | §8 |
| **track（受管軌道）** | base-web「不動 inline」鐵紀律下的受控改動授權邊界（constitution §III）：**預設可動** = L1/L2 BASE-WEB-ADAPT（`.env` + typings 新檔）、L3 BASE-WEB-WRAPPER（代號前綴新檔：rev3 = `rev3-*`、rev2 期 = `rev2-*`）、RUSTAPI-SOURCE-ISOLATION（rust-api 全新寫）；**★ 需 constitution 顯式授權** = L4 BASE-WEB-BUILD-CONFIG（`pageExcludePatterns` 隱藏 demo）、L4 MODAL-WIRING（views inline 5 用途）。**軌道等級 L1–L4 與 §1.5 依賴層 L0–L9 編號互不相干**。 | §9.4・constitution §III |

> **標記慣例**：⚠️ = 工程決策的「資深建議預設」、待 user 覆核；「待決①～⑥」= 開放問題（⑥ 細分 ⑥a~⑥d）——兩者**唯一清單與最晚決策點見附錄 G**，user 親決前不入凍結集。**rev3 v1** = rev3 系統的首個交付版本（DoD＝§8.8）——本書一律寫全稱、不裸寫 v1（引文與 §9 快照中的裸 v1 同義、非任何文件版本號；wire 路徑 `getMenuList/v2` 的 `v2` 為 API 路徑版本段、不在此慣例內）。系統專名（base-web / rust-api / mock / constitution）定義於 §1.0。

---

## §1 — 範圍與系統大圖

【目的】先讓讀者知道「這系統要做什麼」與「系統長什麼樣」。對 rev3 而言 FR 高度壓縮 = 「對齊 base-web 既有功能」+ constitution；架構大圖（§1.5 依賴序 DAG + §1.6 技術棧）前置於此、不再埋在交付章。

### §1.0 系統敘述與 rev3 目標（先讀這個）
- **這是什麼**：一套自架的後台管理系統（admin console）。前端 **base-web** = fork 自開源 Vue 3 模板 **soybean-admin** 的 example 分支（naive-ui + 動態路由；fork 身分是「不動 inline、保 upstream rebase」鐵紀律之源）；後端 **rust-api** = axum + SeaORM + Casbin **全新自寫**；PostgreSQL + Redis；nginx 單一入口；docker compose 部署。
- **給誰用**：系統管理者。三種預設角色（`Super`/`Admin`/`User`）登入後管理使用者、角色、選單與三維權限（endpoint／menu／button，RBAC），維護系統設定，全程留審計軌。
- **專名錨**：**mock** = soybean-admin 官方 ApiFox mock（wire 形狀的 ground truth，§I.3）；**constitution** = 凍結權威文件（rev2 版快照見 §9；rev3 於波 -1 重鑄自己的一份，§8.4）；**rev1** = rev2 之前的首輪整合（無任何材料隨書，僅作歷史對照名）。
- **rev3 為什麼存在**：rev2（前一輪整合，35 個 work item、功能可跑）證明了設計、也付清了方法論學費——schema retrofit 債、行為島誤排程、文件膨脹（實證＝附錄 B）。rev3 = **同 wire、同 12 表的 clean-slate 重建**：用 §0.2 四原則第一輪就做對，外加待決⑥ 的新能力選配。**rev3 v1（首版）成功的定義 = §8.8 DoD**。

### §1.1 範圍宣告
- **base-web 為權威**（constitution §I.1，NON-NEGOTIABLE）：base-web example 有的功能、rust-api 都要提供對應 endpoint；**「v1 從簡」只能是 phase 實作排程、不能簡化設計範圍**（§I.1 原文；引文裸 v1 = 系統首版，§0.4）。
- 功能全集的兩層錨：**wire ground truth** = mock 實機 capture（rev2 史料 MOCK-COVERAGE-AUDIT，附錄 D）→ rev2 早期期望 API 全集（20 端點）→ rev2 as-built 已長成 **41 條業務 route**（auth 3 + route 3 + systemManage 35，`rust-api/server/src/main.rs`）+ `/health` `/metrics`。**rev3 FR 基線 = 這 41 條 as-built 全集**，不是早期 20 端點表。
- 超出 base-web 既有功能的擴張候選 = user-facing dashboard / reporting / 靜態加密 / 合規升級——**四項集中於 §2 新能力決策包（皆待決⑥）**、不入 rev3 v1 凍結集。

### §1.2 能力清單
| 能力 | rev2 現況（實證） | rev3 取捨 | 對映 |
|---|---|---|---|
| 認證（login / refresh 輪替 / 單一 session） | ✅ `/auth/login`+`getUserInfo`+`refreshToken`（rev2 013/026）；rotation chain + reuse 偵測（rev2 027/030）、單一 session 踢人 7777/8888（rev2 028/029）；argon2id、JWT HS256、`Super/Admin/User` + User→User01 alias（`server/src/handler/auth.rs`） | 沿用 | §4.1 §4.3 |
| RBAC 三維 enforce | ✅ `casbin_rule` 單表三維（endpoint / menu / button）；per-route `enforce_mw`、menu 走 getUserRoutes 後端 enforce 過濾（rev2 013/014/021–024；constitution §I.2） | 沿用 | §5.3 §9.1 |
| User / Role CRUD + 授權 modal | ✅ list + 寫全套（rev2 016/017/018）；getRoleMenu/Button/Endpoints/Home 授權 modal 系列（rev2 021–024）；`views/manage/{user,role}` | 沿用、縱切重排 | §8.2 |
| Menu CRUD + 回收桶復原 / re-parent | ✅ `getMenuList/v2` + 寫全套 + `getDeletedMenus`/`restoreMenu`（rev2 019/020/025）；`views/manage/menu` | 沿用 | §5.1 §8.2 |
| system_settings 熱 KV（讀+改、無增刪） | ✅ `getSystemSettings`/`updateSystemSetting` + `updateUserSessionPolicy`（rev2 029）；`views/manage/system-settings` | 沿用 | §5.6 |
| Search / Filter / Pagination | ✅ `User/Role/MenuSearchParams` + `PageRes{current,size,total,records}`；超範圍頁回空 `records` + 真實 `total`（`server/src/handler/system_manage.rs`） | 收編為橫切面 | §5.8 |
| 審計**寫入**軌 | ✅ 三 sink：op-log 同 txn before/after（rev2 011）、access-log + xdb region（rev2 015）、login_attempt（rev2 015） | 沿用 | §5.2 §5.9 |
| 審計**查詢**（讀端 + UI） | ❌ **零讀端**：rust-api 無任何 log 讀 route、base-web 無審計頁（`views/manage/` 僅 6 頁）→ 查審計現只能 psql | ⚠️ 建議補：讀端已列 §5.0 矩陣（Super）；UI 走 §9.4 MODAL-WIRING use (e) 新 manage 頁 | §5.0 §6.1 |
| policy 治理（回收桶 / restore） | ✅ `getArchivedPolicies`/`restorePolicy`（rev2 034/035）+ `views/manage/policy-archive` | 沿用、**第一輪就用 §4 鏡頭設計** | §4.2 §8.2 |
| user-facing dashboard | ❌ 無：home 頁 = 純靜態 demo 模組（card-data/line-chart 等、零 API 呼叫）；grafana（rev2 031–033）是 ops 內網、非業務 UI | **待決⑥**；取捨見 §2 | §2 §6.5 |
| Reporting / 匯出 PDF/CSV | ❌ 無：無任何匯出端點；唯一沾邊 = `views/plugin/excel` demo 頁（前端 demo、不在業務選單） | **待決⑥**；取捨見 §2 | §2 §4.4 |

**拍板了、rev2 卻未排程落地的尾巴**（屬 §1.1「排程」非「範圍縮減」；rev3 排程須補列或重議——重議走 §9.5 amendment）：
- 替代 login 入口 4 流程（reset-pwd / code-login / register / bind-wechat）：constitution §II §11.13 拍板 (c) 全實作雙模 + rev3 v1 stub mode；as-built `main.rs` **無**任何對應 route（35 features 未排入）。
- alova-only 7 端點（§II §11.2 拍板全實作）：user write 4 個已落地（rev2 017）；`sendCaptcha`/`verifyCaptcha`/`/mock/getLastTime` 未落地。

### §1.3 非功能需求
- **低並發 admin 後台**：設計假設 ≤ 50 同時在線管理者（典型 < 10）；user/role/menu 列數 10³~10⁴ 級；不設吞吐 SLA。
- **單實例（rev3 v1）**（對齊 §5.6）：無 HA / failover 承諾；redis pub-sub 失效通知 rev3 v1 即啟用、為未來多實例預留收斂路。
- ⚠️ **效能目標（保守預設、待覆核）**：list 讀 p95 < 300ms；寫（含同 txn 審計）p95 < 500ms；login p95 < 1s（argon2id 驗證成本為主）。
- ⚠️ **可用性（待覆核）**：99.5%/月、容許計畫性維護；恢復 = 重啟容器（server 無狀態、狀態在 postgres/redis 卷）。
- **資料成長**：三 log 表 append-only、DB 端無保留策略（as-built；`cleanup-job` 僅清 `sys_token` 過期列）→ ⚠️ rev3 v1 僅容量監控、retention 政策 defer（與 §10.4 不可竄改互看；多租戶情境見 §2 第 4 項）。

### §1.4 明確不做（防 scope creep）
mock / demo 有、rev3 延續 rev2 刻意不做（實證：rev2 mock-only 稽核清單 + as-built `main.rs` route 全集）：
- **mock 不檢 Authorization**（無 Bearer 也回 success）→ 不模仿；全業務端點 Casbin enforce（§5.3）。
- **mock `getConstantRoutes` 偶發 502** → 不模仿；100% 回 200。
- **ApiFox 平台鑑權 header `apifoxToken`**（mock 平台層行為）→ 不模仿；rust-api 忽略 unknown header（§II §11.4）。
- **`/auth/error` echo 工具端點**（消費者僅 demo 頁）：rev2 as-built 未提供 → ⚠️ rev3 維持不做（demo 頁不顯示、無呼叫者）。
- **`/mock/getLastTime`**（alova demo 專用）→ 不做。
- **demo menu 不入 `sys_menu` seed**：8 組 demo customRoutes（document/exception/multi-menu/iframe 等，constitution §I.2）在 dynamic mode 無 menu 列即不顯示；唯一例外 `function`/`function_toggle-auth` 已升真實 Casbin-enforced 選單（rev2 022、§I.2 v1.3.0 amend）；BUILD-CONFIG ★ 授權的 `pageExcludePatterns` **截至 2026-06-11（rev2 期實況）未動用**（as-built `base-web/build/plugins/router.ts` 無此欄位）。
- **真實 SMS / wechat OAuth 流程**：（§9.3 拍板 §11.13）雙模的「真實 mode」明列為 rev3 v1 之後的後續版本 → rev3 v1 不做（stub 尾巴見 §1.2 註）。

### §1.5 系統架構 — 依賴序層級 DAG（真 DAG、凍結）

按**層**畫、非 feature。as-built 校正版（採真實命名；`rust-api/server/src` 模組樹 + workspace 6 crate〔server/migration/cleanup-job/entity/sea-orm-adapter/xdb〕實機核對）：

```
L0 INFRA-STATIC        (config.rs + docker/deploy/secrets)
L1 RUNTIME-INFRA       (infra/db.rs · infra/redis.rs · state.rs〔AppState: db/redis/jwt/enforcer/session_mode〕
                        · envelope.rs/error.rs〔L1 側軌、僅依 serde + axum IntoResponse〕)
L2 DATA                (entity/ crate 11 entity 模組〔12 表中的 `seaql_migrations` 為 sea-orm 框架內部表、無 entity 模組〕
                        · migration/ crate 35 migrations)
L3 PLATFORM SUB-CRATES (sea-orm-adapter · xdb)
L4 FACADE              (model/facade/* 11 檔 — 唯一 entity 存取閘、rev2 009 lint;同層基建 = model/soft_delete.rs
                        〔SoftDeletable trait〕+ model/audit.rs〔mutate_in_txn 泛型 wrapper〕,兩者皆不碰 entity::)
L5 AUTH/DOMAIN PRIMITIVES (auth/{jwt,password,session,button_auth,endpoint_auth,menu_auth,policy_governance}
                        · route/menu.rs〔選單樹 builder + MenuRoute DTO〕
                        · model/menu_policy_sync.rs〔（rev2 034）menu↔policy 同 txn compose、只呼 facade〕)
L6 HANDLER             (handler/{auth,route,system_manage})
L7 ROUTER+MIDDLEWARE   (flat in main.rs · per-route route_layer〔`auth/enforce.rs::enforce_mw`,內部先呼 `auth/bearer.rs::verify_bearer` 再 enforce〕· audit_ctx.rs global layer)
L8 BACKGROUND          (auth/policy_watcher.rs · auth/settings_watcher.rs〔main.rs boot spawn〕· cleanup-job workspace crate binary)
L9 OBSERVABILITY       (tracing JSON · public /metrics route · obs/metrics compose profiles)
```

- **歸層注記**：`auth/` 全 11 模組分屬三層——7 個 domain primitive 在 L5、`enforce.rs` 是 L7 middleware（`bearer.rs` 為其與 audit_ctx、getUserInfo handler 共用的 bearer 驗證 helper、非獨立掛載 middleware，歸 L7 支援件）、兩個 watcher 是 L8。**檔案目錄 ≠ 依賴層**；rev3 沿用或重整目錄皆可，層歸屬不變。
- **跨層邊**：envelope/error = L1 側軌（每層回 `Res<T>`）；xdb(L3)→L7 `audit_ctx` mw（client_ip→region）；sea-orm-adapter(L3) 被 L1 boot 載（main.rs boot 經 `auth/enforce.rs::build_enforcer` 建、包成 `Arc<RwLock<casbin::Enforcer>>` 存入 `state.rs` 的 `AppState.enforcer`）+ L5 `reload_and_publish` / L8 policy_watcher 經 `load_policy()` 全量重讀——**（rev2 034）後寫側 DB-first 走 L4 facade、不經 adapter auto_save**（policy 持久脊椎 L1→L4→L8）。
- **as-built 校正（rev3 必須採真實命名、丟掉 rev2 早期設計提案）**：① **無 `axum-casbin` crate**（enforce 在 `auth/enforce.rs`）② **無 service 層**（handler 直呼 facade）③ **router flat-in-`main.rs`**（無 `router/` 樹，受管端點逐條 `.route()`、endpoint_coverage_lint 守 main.rs==ENDPOINT_REGISTRY==seed 三源一致 @ 35；維持 flat 或重整 = 待決①）④ `model/` 拆 `entity/` crate + `server/src/model/facade/`。

### §1.6 技術棧（版本 = rev2 as-built 鎖點、rev3 起點）

| 端 | 組件（版本） | 來源錨 |
|---|---|---|
| backend | Rust **1.86** toolchain・axum **0.7**・tokio **1**・sea-orm **1.1.20**・casbin **2.20**(default-features=false)・redis **1.2**・jsonwebtoken **9**・argon2 **0.5.3** | `rust-api/rust-toolchain.toml`・`rust-api/Cargo.toml` workspace deps |
| frontend | vue **3.5.34**・naive-ui **2.44.1**・vite **8.0.12**（pinia 3.0.4・vue-router 5.0.7・typescript 6.0.3） | `base-web/package.json` |
| infra | postgres **17-alpine**・redis-stack-server **latest** ⚠️・nginx **1.31.0-alpine**・node **20.19-alpine**（dev base-web） | `docker-compose.yml` / `docker-compose.dev.yml` image tags |
| obs（opt-in profile） | loki **3.7.2**・alloy **v1.16.1**・prometheus **v3.12.0**・grafana **13.0.2**（+ exporters/pushgateway） | `docker-compose.yml` profiles `obs`/`metrics` |

- ⚠️ `redis/redis-stack-server:latest` 是 as-built 核心 5 service 中唯一未 pin 的上游 image tag（base-web/rust-api 的 `rev2-admin-*:latest` 為本地 build 產物標籤、不屬 pin 範疇）；rev3 建議建 stack 當下即 pin 數字版。
- sea-orm 1.1.20 transitive 拉的 time/home patch 釋出需 Rust 1.88，rev2 以 Cargo.lock pin time 0.3.37 / home 0.5.9 配 1.86 toolchain（`rust-api/Cargo.toml` 注記）——rev3 若升 toolchain 可一併解開。

---

## §2 — 新能力決策包（rev3 新 scope；全部待決⑥）

【目的】rev3 相對 rev2 唯一真正的新 scope 集中一處：選項、成本、牽連面一表呈現、**拍板一次**；其他章只引用本章結論、不再散落重複。

| # | 能力 | rev2 現況（實證） | rev3 v1 建議形 ⚠️ | deferred 形（觸發條件） | 牽連 |
|---|---|---|---|---|---|
| 1 | **user-facing 儀表板** | ❌ home 頁純靜態 demo（零 fetch）；grafana = ops 內網（rev2 031–033）、非業務 UI | 固定儀表板、純讀既有表聚合（新增 `GET /dashboard/*` read endpoint）、**0 新表**；UI 落點建議 = 替換 `/home` 靜態卡片（§6.5） | 可配置 widget／版面 → 加 `sys_dashboard_view`（archetype A） | §6.5・§5.0（新讀端逐面打勾） |
| 2 | **報表匯出（PDF/CSV）** | ❌ 無匯出端點；唯一沾邊 `views/plugin/excel` demo 頁 | on-demand **同步**匯出（handler 內讀 list→格式化、串流回）、**0 新表、非行為島** | 排程／非同步 → 加 `sys_report_job`（archetype A + `queued→running→done→failed` 狀態機）並**升格為 §4 第 4 台行為島**（§4.4） | §4.4・§5.8 |
| 3 | **AES-256 靜態加密** | ❌ 無（secrets `_FILE` + argon2id 屬機密管理／密碼雜湊，非資料靜態加密，§10.3） | **磁碟/tablespace 層**（PG data dir 落加密卷／雲端 at-rest）、**0 schema/code 改、不衝突 §5.8 索引搜尋**；金鑰 = 平台/雲 KMS 管 | 欄位級應用加密：facade 讀寫對 tagged 欄 encrypt/decrypt + 金鑰 `_FILE` secret + 輪替；**代價：加密欄無法 index/filter（衝突 §5.8）**——僅當特定欄（`user_phone`/`user_email` 等 PII）有法遵要求才逐欄標記 | §5.10・§10.3 |
| 4 | **合規姿態升級** | 自架單租戶 admin、無對外 PII 收集 → 無 GDPR/HIPAA 義務（§10.5） | 維持現姿態 + 容量監控（§1.3） | 對外／多租戶 → 資料保留期（DB 三 log 表無 retention；ops 面僅 loki 72h／prometheus 15d）+ 刪除權（soft-delete ≠ 抹除）+ PII 欄標記（與欄位級加密同批取捨） | §10.5・§1.3 |

- **rev3 v1 統一結論 ⚠️**：四項 rev3 v1 建議形皆 **0 新表** → **rev3 v1 資料模型 = rev2 同 12 表（一次設計對，§3）**；deferred 形（`sys_dashboard_view` / `sys_report_job` / encrypted-col）登記為未來表、**不入 rev3 v1 凍結集**。
- 邊界註：審計查詢（讀端 + UI）**不在本章**——它是 rev2 既有審計寫入軌的補讀端（§1.2 ⚠️）、非新能力。

---
# Part II · 設計契約

## §3 — 資料模型脊椎 (Data-Model Spine) ★第一設計章、先凍結

【目的】**全書對內脊椎**（雙脊椎宣告見 §0.1）。誠實命名「資料模型」（IE/data-centric，非 DDD domain model）。先設計、先凍結；endpoint / enforce / menu / dashboard / report **皆為其投影**。本章正文只留四個凍結決策（ER/FK、archetype、application-RI、演進紀律）；**欄級資料字典全文在附錄 F**（12 表、live 稽核 2026-06-09 零 drift）。本章（與 §5）哪些條目進 constitution、哪些留設計書 = **待決⑤**（§9 章首注同）。

### §3.0 設計原則
- **脊椎先行**：12 表 schema 在任何 endpoint 之前定稿、凍結（變更走 §9.5 amendment）。
- **rev3 鐵紀律：§I.6 審計欄 + 治理欄 + BIGSERIAL 序列在「建表當下」就帶齊**——杜絕（rev2 m014/m016/m031/m034）事後 ALTER（見 §3.4 retrofit 教訓）。
- 命名一致 `sys_*` 單數（唯一外掛 `system_settings`，沿用 rev2 不改）；IP 用 PG `inet`、payload/buttons/query 用 `jsonb`。
- 三個新能力（dashboard / report / AES）的 schema 取捨集中於 §2：**rev3 v1 全 0 新表、資料模型 = rev2 同 12 表**。

### §3.1 ER 總圖 + 關係
**entity 群組**（依 archetype §3.2 分群；欄數詳附錄 F）：

| 群組（archetype §3.2） | entities（括號 = 欄數） |
|---|---|
| **業務核心** · A：soft-delete + 6 審計欄 | `sys_user`(16) · `sys_role`(12) · `sys_menu`(28) · `system_settings`(10) |
| **關聯** · join | `sys_user_role`(2)：複合 PK · 硬刪 · 零審計 |
| **Session / Token** · C：狀態機 | `sys_token`(9) → §4.1 |
| **審計日誌** · B：append-only · 不可竄改 | `sys_operation_log`(10) · `sys_access_log`(10) · `sys_login_attempt`(9) |
| **RBAC 治理** · D | `casbin_rule`(11) ⇄(revoke / restore) `sys_casbin_policy_archive`(13) → §4.2 |
| 框架 | `seaql_migrations`（sea-orm 內部；applied 條數＝rev2 實況 35、rev3 依自身 migration 計） |

**關係表**（純文字環境看這張即可；CJK 對齊安全）。**FK 欄判讀**：rev2 as-built **全表零 FK**（含 `sys_user_role`，rev2 live 稽核逐表確認）；下表 ✅ = **rev3 建議加 FK（⚠️ 待決④）**、❌ = 建議維持零 FK——勿把 ✅ 誤讀為現狀或已拍板：

| from | → to | via / 語意 | FK |
|---|---|---|:---:|
| `sys_user_role.user_id` | `sys_user.id` | M:N join（user 端） | ✅(建議⚠️) |
| `sys_user_role.role_id` | `sys_role.id` | M:N join（role 端） | ✅(建議⚠️) |
| `casbin_rule.v0` | `sys_role.code` | policy 主體 = role **code 字串** | ❌ 型別不符 |
| `casbin_rule.v1` (v2=`'menu'`) | `sys_menu.route_name` | menu 可見性 policy | ❌ |
| `casbin_rule.v1` (v2=`'button'`) | `sys_menu.buttons[]` code | button 權限 policy | ❌ |
| `casbin_rule` | `sys_casbin_policy_archive` | revoke→移入 / restore←移回（§4.2） | ❌ 同形移動 |
| `sys_menu.parent_id` | `sys_menu.id` | 自參考選單樹 | ❌ |
| `sys_token.user_id` | `sys_user.id` | logical（高 churn） | ❌ |
| `{3 audit log}.operator_id` | `sys_user.id` | logical（容忍歷史 actor） | ❌ |
| `sys_user.current_session_id` | （JWT `sid`，非 DB 列） | session pointer（§4.3） | — |

**其他關鍵事實（表外、rev3 不變）**：① **無 `ptype='g'` 列**（user→role 只走 `sys_user_role`、不入 casbin；model 雖宣告 `g=_,_` 但未使用，§5.3）② casbin `v3/v4/v5` 由 stock adapter 填 `''`。

**⚠️ FK 決策（建議待覆核；對應待決④）**：rev3 建議改**選擇性 FK**：
- ✅ **加 FK**：`sys_user_role.user_id → sys_user.id`、`sys_user_role.role_id → sys_role.id`——硬刪 join 表、懸空 ref = 真 bug；且兩端皆 soft-delete（列永存）故 FK **永不會擋刪**。
- ❌ **維持零 FK**：(a) audit/log 的 `operator_id`（append-only 熱寫路徑、要容忍任意歷史 actor、FK 增寫負擔）；(b) `sys_token.user_id`（高 churn）；(c) `casbin_rule.v0`（是 role **code 字串**、型別上無法 FK 到 `sys_role.id`）；(d) `sys_menu.parent_id` 自參考樹（自參考 FK 對 reparent/批刪礙事）。
- 未加 FK 處的 application-RI 義務逐條列於 §3.3。

### §3.2 審計欄 archetype（定義一次、附錄 F 各表繼承）
- **A 業務全 6 審計欄**：`created_at` tstz NN default now()・`created_by` bigint null・`updated_at` tstz null・`updated_by` bigint null・`deleted_at` tstz null・`deleted_by` bigint null。`*_by` = operator **user_id（bigint，非 user_name 字串）**；`*_at`/`*_by` **成對寫**；soft-delete 表配 partial-uniq `WHERE deleted_at IS NULL`（**sys_user / sys_role / sys_menu 三表**；**`system_settings` 例外**——PK=`setting_key` 本身即總體唯一、無 partial-uniq，soft-delete 後同 key 無法重建，且 rev2 facade 實際無 settings 刪除路徑）。【sys_user / sys_role / sys_menu / system_settings】
- **B append-only 日誌**：只 `created_at` NN（+ `operator_id` 當 domain 欄）；**無 soft-delete、無 update、不可竄改**。【三 log】
- **C join / 狀態機**：`sys_user_role`=零審計（硬刪）；`sys_token`=僅 `created_at` + `status` 狀態機（生命週期見 §4.1）。
- **D 治理變體**：`casbin_rule`=`protected`/`created_at`/`created_by`（**對 stock adapter 隱形**：adapter 的 insert_many/load_policy 不碰這 3 欄）；`archive`=原 grant `created_at/by` + `archived_at/by` + `archive_reason`（**無 update/delete 欄**，restore = 硬刪移回）。

### §3.3 application-RI 義務（零 FK 處的守則）
> 凡 §3.1 未加 FK 的邏輯參照，由 application 在寫入點守，並在此明列（rev2 散落、rev3 集中）：
- **operator/actor 參照**：寫入時取自 `RequestContext.operator_id`（`Option<i64>`，自 bearer verify 後的 `claims.user_id` 解出；無/壞 token → None）。**nullable 範圍精確化**：`sys_operation_log.operator_id` / `sys_login_attempt.operator_id` / archive 的 `created_by`·`archived_by` 可 null（容忍 system/seed actor、**不驗存在**）；但 `sys_access_log.operator_id` **NOT NULL**（未認證請求刻意不落列、單一 operator gate）、`sys_token.user_id` **NOT NULL**（login 必有 user）。
- **`casbin_rule.v0` / `archive.v0`**：grant 前在 **handler 層**驗（`updateRoleMenu`/`updateRoleButton` 先 `sys_role::find_active_by_id` 解出 code、查無→2222，再呼 `set_role_dimension`）；casbin facade `grant` 本身收 `role_code: &str`、不驗。**restore 路徑不驗** v0 role 仍存在/active——沿 archive 快照原樣搬回（只做 live 7-col 重複 pre-check）。⚠️ rev3 若要把驗證下沉 facade 層屬設計變更、須明示。
- **`sys_menu.parent_id`**：reparent 驗 **3+1 道 guard**——目標存在且 active、目標為「目录」型（`menu_type==1`，非此型→2222；`parent_id=None` 搬頂層合法）、非自身後代（防環）、`protected` 種子選單父固定不可搬移（→2222）。
- **`sys_user.current_session_id`**：指 JWT sid、非 DB 列，**不驗**（session pointer 語意見 §4.3）。

### §3.4 schema 演進紀律（rev3 開局即避 rev2 的 retrofit 債）
**rev2 retrofit 教訓（實證、逐 migration 核對）**：
- `sys_user`：`deleted_at` 在（rev2 m003）進表，其餘審計欄（created/updated/*_by）拖到（rev2 m014）才補（11 個 migration 的洞），還**被迫**把 `id` 事後改成 BIGSERIAL（因 seed 寫死 id=1/2/3、原 PK 無 default）；`sys_role` 重演（rev2：deleted_at m006 / 其餘 m016）。
- **§I.6 凍結點可釘死**：constitution **v1.1.0 amendment（2026-06-01，`e1fa3db`）**，當時 migration 已走到（rev2 m013）——**（rev2 m014/m016）是凍結後補課的 retrofit**（兩 migration 註解皆明引 §I.6），**（rev2 m018，sys_menu）是凍結後首張新建表**、建表即帶 6 欄。
- **（rev2 m018/m028）是僅有兩張「建表即帶全 6 審計欄」的 archetype-A 表**；（rev2 m032，archive）則是建表即帶其 archetype-D 變體欄、零事後 ALTER 的乾淨案例。
- **治理欄 retrofit 共兩例**：`casbin_rule` 治理 3 欄（rev2 m031）才 bolt-on（還得設計成 adapter-invisible）；`sys_menu.protected` （rev2 m034）才 bolt-on（ALTER + UPDATE 7 個保護選單 seed）——sys_menu 審計欄雖建表帶齊、治理欄仍遲到。

**rev3 紀律**：① 每張業務表**建表當下**即帶 archetype A 全 6 欄 + BIGSERIAL；② seed 不寫死小 id（用序列）；③ 治理欄（protected/archive）建表即含；④ forward-only：每 migration 有對稱 `down()`；⑤ partial-uniq、命名單數沿用。**目標：rev3 無（rev2 m014/m016/m031/m034）這類事後 ALTER。**

---

## §4 — 行為島模型 (Behavior Islands) ★用 state-machine 鏡頭、非資料鏡頭

【目的】系統裡「行為 > 資料」的少數模組。**先設計 states + transitions + invariants，表只是那台機器的持久化。** 判定法則：有非平凡狀態機 / 「先 X 再 Y 會怎樣」的故事 → 行為島。rev2 的痛正是把唯一真正的行為島（治理）當「又一張表」排到最後（附錄 B）。rev3 共 **3 台狀態機**（持久化於 §3 的 sys_token / casbin_rule+archive / sys_user.session 欄），各自獨立設計；**交付為 2+1 合刀**——§4.1 token 與 §4.3 session 合一刀（共用 auth 鏈、login 流程與 `sys_token` 持久化），§4.2 治理獨立一刀（§8.2）。

### §4.1 token rotation chain（持久化 = `sys_token`；來源：rev2 026/027/030）
**state（`sys_token.status`）**：`active → used → revoked`（單向、不回頭）
```
                         ┌── rotate ──> 舊列 active→used (WHERE status=active 守冪等) + 插新列 active(同 rotation_chain)
presented refresh JWT ──>│   (FOR UPDATE 鎖該列、單 txn)
  sha256→token_hash 查 ──┤── benign ──> used 列 & (now-used_at)<30s grace → 插新 active、不動舊、不撤  (雙擊容忍)
                         ├── reuse ───> used 超 grace / revoked / used_at NULL → 撤「整條 rotation_chain」+ warn
                         └── notfound ─> 查無列
```
**transitions（decision seam `decide_rotation`，純函式可測）**：active→Rotate / used&<grace→Benign / used&≥grace→Reuse / used_at=NULL→Reuse（fail-closed）/ 其他 status→Reuse。
**invariants**：① `token_hash` UNIQUE；同秒輪替靠 **per-token `jti`**(uuid，rev2 030)使 JWT body byte-distinct 不撞鍵 ② `rotation_chain` = 每次 login 一個 uuid、整鏈共用 ③ grace = **`GRACE_SECS` 常數（30s，`server/src/model/facade/sys_token.rs`，硬常數、無設定面）**；cleanup 安全邊際是**另一常數 `SKEW_MARGIN_SECS`（60s，cleanup-job crate）**——名異、值異、用途異，勿混用 ④ 過期實體清理 = on-demand `cleanup-job` binary（`expires_at < now()-60s`〔SKEW_MARGIN_SECS〕、與 status 無關；**預設 dry-run 只 count、`--execute` 才物理刪、冪等、僅此一旗標**，rev2 030 拍板不開其他 CLI flag）。
**對外碼**：Rotated/Benign→200+新 pair；Reuse/NotFound→**8888**（乾淨登出、非 5000）；DbErr→5000（HTTP 200 信封，§7.3）。**前置出口**（rotate 之前）：refresh JWT verify 失敗（簽章/exp/aud）→8888；（rev2 028）pointer-first `is_current` 失敗→7777（§4.3）；簽發失敗→5000。handler **絕不回 3333/9999/9998**（會讓前端自動 refresh 迴圈）。

### §4.2 policy governance（持久化 = `casbin_rule` ⇄ `sys_casbin_policy_archive`；來源：rev2 034/035）★rev2 唯一 behavior-heavy
**state（policy 列的所在）**：`live in casbin_rule` ⇄ `archived in sys_casbin_policy_archive`
```
grant ─INSERT→ casbin_rule(live)
                  │ revoke (protected? → 拒、整批 Rejected、零變更)
                  ▼ 非 protected: 快照 INSERT archive + DELETE live row   (同 txn)
            archive(buffer) ──restore──> 反向 move 回 casbin_rule(live)、archive 列刪
       set_role_dimension(role,dim,desired[]) = diff(current vs desired) → 批次 revoke + grant (單 txn)
```
**transitions / 操作**：`grant / revoke(→archive) / restore(←archive) / set_role_dimension(diff 整維度) / reload(load_policy+publish)`。
**invariants**：① **DB-first**——寫側只動 DB（casbin_rule/archive）、**不碰 in-memory enforcer**（rev2 034 改掉舊路徑——經 enforcer MgmtApi `remove_filtered_policy`+`add_policies`、adapter auto_save 旁路寫 DB、審計另起 txn 的非原子稽核）② `protected` 列拒刪 → 整次 `Rejected`、零變更 ③ **`PolicyMutated` gate**：commit 後**只有結構性真變更**才 `reload_and_publish`（Rejected / restore NoOp / NotFound / menu 查無 → 跳；**空-diff Applied 與 menu-found-但-無-policy 仍 reload**〔刻意、不優化〕，rev2 035 FR-006）④ revoke/restore 與審計同 txn 原子；restore 審計記 `{role,target,dimension}`（非懸空 archive_id，rev2 035）⑤ reload = 全量 `load_policy()` 重讀 casbin_rule + `PUBLISH casbin:policy:invalidate`（跨實例收斂、§5.6）。
**對外碼**：Applied→0000；**restore NoOp（policy 已 live）→0000 視為成功 no-op、archive 列仍被消費、無審計**（僅 Restored 寫審計）；Rejected/非法→2222；假 archive id→2222 無審計。
> **rev3 教訓內化**：這台機器在 rev2 被當「又一張 casbin 表」排到最後（rev2 034/035）。rev3 用 §4 state-machine 鏡頭**第一輪就設計它**（它的縱切見 §8.2），不混進 §5 CRUD 格子。

### §4.3 single-session lifecycle（持久化 = `sys_user.current_session_id`/`session_policy`；來源：rev2 028/029）
**pointer 真相** = `sys_user.current_session_id`（DB 持久）+ Redis `sess:{uid}` 熱快取（**persist-then-cache**：先寫 DB 必成、再 best-effort 寫 Redis）。**policy 三態** `session_policy`∈{inherit,on,off} × runtime `session_mode`（rev2 029，`AppState.session_mode` + `settings:invalidate` 熱切換）。
```
login ─> create_chain_head(rev2 027 rotation 鏈頭)
      ─> (resolve_policy=on?) revoke_other_chains(撤該 user 其他 active rotation_chain)
      ─> set_pointer(uid, new sid)   ※永遠執行、即使 resolved=off — 供日後切 ON 即生效
每受保護讀請求 ─> is_current(claims.sid == pointer?)  ── 不等 & policy on ─> 踢
   resolve_policy: on→比對 / off→永遠 true(不踢、保多裝置) / inherit→隨 session_mode
   is_current FAIL-OPEN: pointer 讀不到(Redis+DB 皆掛) → 回 true (附加檢查、非主 gate)
```
**transitions**：login → `create_chain_head` +（policy on 時）`revoke_other_chains` + `set_pointer`（永遠）；每請求 `is_current` 收斂。
**invariants**：① pointer 真相在 DB、Redis 僅快取（可失憶、lazy rehydrate）② is_current **fail-OPEN**（不因 backing-store 抖動誤踢）③ `session_mode` 讀（rev2 029）runtime store、非靜態 config。
**兩條獨立踢人通道**：**7777** = `is_current` pointer 比對失敗——**4 個 access gate**（getUserInfo / getUserRoutes / isRouteExist / enforce_mw）**+ refresh 端第 5 掛點**（rotate 前 pointer-first 檢查，`handler/auth.rs`；belt-and-suspenders——即使通過，被 `revoke_other_chains` 撤的舊鏈仍在 rotate 撞 Reuse→8888）；**8888** = refresh rotate 端鏈被撤／驗章失敗的乾淨登出（§4.1 通道）。

### §4.4 行為島紀律
- 每行為島 = 一張 state 圖 + transition 表 + invariant 表 + 對外碼表（如上三節）；**不混進 §5 面矩陣的 CRUD 格子**。
- 縱切交付 = **2+1 合刀**（§8.2：Token＋Session 合一刀、Policy-governance 獨立一刀）——「3 台機器」是**設計**單位、「2 刀」是**交付**單位，計數不同係刻意；Button/Endpoint 授權屬純 policy 縱切、**非行為島**（無狀態機，§8.2）。
- **⚠️ 潛在第 4 台島（報表非同步，建議 defer；取捨集中 §2）**：若報表升為排程/非同步 → `sys_report_job` 帶 `queued→running→done→failed` 狀態機，屆時**升格為行為島**、用同款鏡頭設計；rev3 v1 同步匯出不觸發、不立此島。

---

## §5 — 面矩陣 (Aspect Matrix) ★橫切、設計一次每 data island 繼承

【目的】正交維度、貫穿每個 entity，**不是某 Phase 的交付物**。設計一個 data island 時逐面對照 §5.0 打勾——面是 entity 設計的一部分、不是「之後再加」。

### §5.0 entity × aspect 總矩陣
> ✓=套用 ・—=不套用 ・(變體) ・⚠️=rev3 新增（rev2 as-built 無）。審計欄欄位走 §3.2 archetype。
> **universal 面**（不入下表逐格）：**§5.4 envelope**（每個 API；例外 `/health` plain text 與 `/metrics` Prometheus exposition）、**§5.5 single-session gate**（每受保護讀端）、**§5.10 AES at-rest**（rev3 v1 磁碟層、全庫一致，§2）。

| entity | §5.1 soft-del | §5.2 寫 op-log 審計 | §5.3 endpoint enforce | §5.8 search/filter/page | §5.9 region/xdb | 審計 archetype(§3.2) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `sys_user` | ✓ | ✓(CRUD) | ✓(`/systemManage/*User*`) | ✓(getUserList) | — | A |
| `sys_role` | ✓ | ✓ | ✓ | ✓(getRoleList) | — | A |
| `sys_menu` | ✓ | ✓ | ✓ | ✓(getMenuList/v2：僅分頁、無 filter 欄) | — | A + D(protected) |
| `system_settings` | ✓(無刪除路徑) | ✓ | ✓(Super) | — | — | A(無 partial-uniq) |
| `sys_user_role` | —(硬刪) | ✓(隨 **user** 寫；role 側不觸 join 表) | —(無獨立端點) | — | — | C(零) |
| `sys_token` | —(status 機) | —(內部、不入 op-log) | —(/auth/* 開放) | — | — | C(created_at) |
| `sys_operation_log` | — | —(它是 sink) | ⚠️(rev3 補讀端,Super；rev2 無) | ⚠️(隨讀端補；需新索引) | — | B |
| `sys_access_log` | — | — | ⚠️(同上) | ⚠️(同上) | ✓(client_ip→region) | B |
| `sys_login_attempt` | — | — | ⚠️(同上) | ⚠️(隨讀端補；兩複合索引已就緒) | ✓ | B |
| `casbin_rule` | —(revoke=move) | ✓(治理寫、§4.2) | ✓(治理端 Super) | —(role-filtered 讀、無 search/分頁) | — | D |
| `sys_casbin_policy_archive` | —(進/全離) | ✓(restore 寫；審計記在 entity_table='casbin_rule') | ✓(回收桶 Super) | —(getArchived 全量讀、無 filter/分頁、archived_at DESC) | — | D-buffer |

> 三 log 表讀端為 §1.2 ⚠️ 建議項：rev2 as-built **零讀端**（43 條路由無 log 查詢端點；三表為純寫入 sink）；rev3 若拍板補做，配套 = 新 endpoint + R_SUPER policy seed + menu 頁（走 §9.4 軌道）。

### §5.1 soft-delete
`deleted_at` + partial-uniq `WHERE deleted_at IS NULL`（**sys_user/sys_role/sys_menu 三表**；system_settings 例外見 §3.2）+ **facade triple-guard**：① `SoftDeletable` trait（`model/soft_delete.rs`）只封 `deleted_at_column()` + `find_active()`（active base query；soft-delete 與 update 寫路徑為各 entity facade 自有 fn——`soft_delete`/`soft_delete_in_txn` + `update_*`、內部以 `find_active` 為基底）② `model/facade/` **不 re-export Entity** ③ lint = `server/tests/entity_access_lint.rs` 的 **build-failing cargo test**（兩階段掃描：抹白註解/字串 → 抓 token-boundary 的 path-root `entity::`；`src/model/facade/` 依路徑豁免；不誤殺 `sea_orm::entity::` 子路徑、不禁 bare Model 轉手）。【4 業務表】

### §5.2 統一審計（mutation）
mutation → `sys_operation_log`：`audit::mutate_in_txn`（`model/audit.rs`）泛型 wrapper **同 txn** 寫 before/after 快照 + operator + trace；`AuditSerialize` trait 對敏感欄（password）redact 成 `"<redacted>"`；`audit.rs` 本身不 import entity（守 lint）。**HTTP/region 軌另走** `sys_access_log`（`audit_ctx` 中介層 + xdb，§5.9）——**audit 軌三 sink（op-log／access-log／login_attempt）、縱切兩刀**（後兩 sink 同刀，§8.2 地基）。

### §5.3 RBAC Casbin enforce
`casbin_rule` 單表三維度（`v2`= HTTP method→endpoint / `'menu'`→可見性 / `'button'`→按鈕）；RBAC model = `r=p=sub,obj,act`（model 另宣告 `g=_,_` role-of-role **但未使用**——subject 直接是 role code、無角色階層，與 §3.1「無 ptype='g' 列」對應）、matcher **三欄精確相等**（無 glob）、`R_SUPER` **逐端點列、無 `*` subject**；enforcer = boot 單例 **`Arc<RwLock<casbin::Enforcer>>`（無 decision cache；moka LRU 是 rev2 DESIGN 早期提案、as-built 未採）**，每請求對每個 DB-fresh role 呼叫 `enforce((role,path,method))`、policy 變更由 watcher reload 全量換入；`enforce_mw` per-route route_layer，subject = **DB-fresh role code**（非 JWT claims）。menu 走 `enforce((role,name,'menu'))`、button 走 `get_filtered_policy`（讀已載 policy、非 enforce）。詳機制與 §10 安全互引。

### §5.4 response envelope（universal）
`{data, code, msg}`（**無 success bool**、`code`=**字串** `"0000"`）；`Role.id`/`MenuRoute.id`=**字串**；business 錯 = **`2222`**、`5xxx`=auth/infra（`5003`=HTTP 403；**`5000` 在 as-built live 路徑以 HTTP 200 信封送出**——`AppError::Internal`→HTTP 500 mapping 存在但無 handler 生產者，⚠️ rev3 須拍板一致化）、`3333/8888/7777` 為 auth 專用碼（§4）；`MenuType` 1=dir/2=menu；`Status` nullable。對齊 mock ground truth（§I.3）。**凍結碼表共 13 變體**（另含 1000 登入失敗、4040 接口不存在〔HTTP 404 fallback〕、7778/8889/9998/9999 保留碼）——完整矩陣收 §7.3。universal 例外：`/health`（plain text）與 `/metrics`（Prometheus exposition）為 infra 端點、不走 envelope。

### §5.5 single-session gate（universal、機制在 §4.3）
每受保護讀端在 verify 後、業務前掛 `is_current` gate（不過 → 7777）。橫切義務：**4 個認證 gate**（getUserInfo / getUserRoutes / isRouteExist / enforce_mw——route.rs 兩個是不同 endpoint、非「getUserRoutes×2」）一致掛載；另 refresh 端 pointer-first 檢查為第 5 掛點（§4.3）。此面只規定「掛」，狀態機本體在 §4.3。

### §5.6 system-settings 熱 KV + redis pub-sub invalidation
`system_settings` 為 runtime KV——**boot 只載 `single_session_default` 一鍵**入 `AppState.session_mode`（熱路徑；settings_watcher 收 invalidate 後亦只 re-read 該列），**其餘 key 無 in-memory cache、走 facade 即時讀 DB**（⚠️ rev3 若要多 key 熱讀，需把「單鍵 swap」推廣為 keyed map、屬設計變更）。兩 channel **`casbin:policy:invalidate`**（§4.2 reload）/ **`settings:invalidate`**（session_mode 熱切換）+ 對應 watcher（獨立 pub-sub 連線訂閱、共享連線發布）。**rev3 v1 單實例即啟用**（一致性優先、不分環境）。

### §5.7 審計欄標準（§I.6，定義見 §3.2）
6 欄 paired 寫、`*_by`=operator user_id（bigint，非字串）；archetype B/C 例外。**rev3：建表即帶（§3.4）**。

### §5.8 Search / Filter / Pagination（橫切能力）
list 端統一 `*SearchParams` filter DTO（user/role 有效 filter 欄；menu 僅分頁）+ **`PageRes{current,size,total,records}`** wrapper（envelope `data` 內；JSON number、無 pages/success、空頁 `records:[]`）；分頁參數 **`current`/`size`**（soybean wire 慣例）經 `normalize_page` 正規化（current 預設 1、size 預設 10 clamp [1,100]）；**索引策略**：常查欄建 btree——login_attempt 的 `(attempted_user_name,created_at)`/`(client_ip,created_at)`（現服務 login lockout 內部查詢）、archive 的 `archived_at` 單欄 + `(v0,v2)`；**注意**：若 §2 採欄位級 AES，加密欄**無法**走 filter/index → 設計時標明哪些欄可查。

### §5.9 region / xdb（次要面）
`xdb` sub-crate 由直連 `client_ip` 解析地區（**非** XFF）；dev/docker 私有 IP 仍解析為「内网IP」（非 NULL）。只套用於 `sys_access_log` / `sys_login_attempt`（兩表帶 `client_ip inet` + `region`）。

### §5.10 AES-256 靜態加密（universal 面；取捨集中 §2、待決⑥）
面定義：at-rest 加密全庫一致、對 schema/查詢透明。rev3 v1 建議形（磁碟/tablespace 層）與 deferred 欄位級方案的代價比較**集中於 §2 新能力決策包**；若未來採欄位級，加密欄退出 §5.8 filter/index 並逐欄標記。

---
## §6 — 前端 UI/UX

【目的】admin 系統一半是前端。rev2 因 base-web 為權威 → 此章是「**對既有 base-web 的 screen inventory + 受管接線**」，非 from-scratch。

### §6.1 screen inventory
**前提**：base-web 跑 **dynamic auth route mode**（`.env` `VITE_AUTH_ROUTE_MODE=dynamic`，rev2 014）——側欄與業務路由由 `GET /route/getUserRoutes` 下發（`sys_menu` 10 列 seed × Casbin menu-visibility 過濾，§5.3）；repo 內大量 demo view 留檔但**不下發、自然隱形**。

| route 路徑 | view 檔（`base-web/src/views/`） | 主要 endpoint | 備註 |
|---|---|---|---|
| `/login/:module?` | `_builtin/login/`（`modules/pwd-login.vue` 等 5 模組） | `POST /auth/login` | constant route；rev2 只接 pwd-login，code-login/register 等仍 demo 表單 |
| `/403` `/404` `/500`・iframe-page | `_builtin/{403,404,500,iframe-page}/` | `GET /route/getConstantRoutes`（公開、5 條） | constant routes（rev2 014） |
| `/home` | `home/index.vue` + `modules/*`（卡片/圖表） | —（純靜態 demo 數據、無 fetch） | seed；三角色皆可見 |
| `/manage/user` | `manage/user/index.vue` + `modules/{user-operate-drawer,user-search,user-session-policy-modal}.vue` | getUserList・addUser / updateUser / deleteUser / batchDeleteUser・getAllRoles・updateUserSessionPolicy | rev2 接通（rev2 016 list / 017 寫 / 029 session policy） |
| `/manage/role` | `manage/role/index.vue` + `modules/{role-operate-drawer,role-search,menu-auth-modal,button-auth-modal,endpoint-auth-modal}.vue` | getRoleList・addRole / updateRole / deleteRole / batchDeleteRole・getRoleMenu / updateRoleMenu / getRoleHome / updateRoleHome / getMenuTree / getAllPages・getRoleButton / updateRoleButton / getAllButtons・getRoleEndpoints / updateRoleEndpoints / getAllEndpoints | rev2 接通（rev2 016/018 CRUD + 021/022/023 三權限 modal） |
| `/manage/menu` | `manage/menu/index.vue` + `modules/menu-operate-modal.vue` | `getMenuList/v2`・addMenu / updateMenu / deleteMenu / batchDeleteMenu・getDeletedMenus / restoreMenu・getAllPages / getMenuTree / getAllRoles | rev2 接通（rev2 019/020 + 025 回收桶/re-parent） |
| `/manage/user-detail/:id` | `manage/user-detail/[id].vue` | — | seed（`hide_in_menu=true`）但 view 仍是 stock `<LookForward />` 佔位 |
| `/manage/system-settings` | `manage/system-settings/index.vue` | getSystemSettings / updateSystemSetting | **rev2 新頁**（rev2 029）、Super-only |
| `/manage/policy-archive` | `manage/policy-archive/index.vue` | getArchivedPolicies / restorePolicy | **rev2 新頁**（rev2 034 US5 治理回收桶 = §4.2 的 UI 面）、Super-only、seed 即 `protected=true` |
| `/function/toggle-auth` | `function/toggle-auth/index.vue` | —（讀 userInfo.buttons） |（rev2 022）button-auth demo、唯一保留下發的 demo 頁（三角色可見） |
| （不下發） | `about/` `alova/` `plugin/` `pro-naive/` `multi-menu/` `function/` 其餘、`user-center/` | — | demo / 佔位；dynamic mode 下 getUserRoutes 不含 → 不可達 |

- **L4 BUILD-CONFIG 實況**：constitution §III.2 授權 `build/plugins/router.ts` 加 `pageExcludePatterns` 隱藏 demo，但 as-built **未動用**（router.ts 無此欄位）——（rev2 014）dynamic mode 使 demo menu 根本不出現於 getUserRoutes，軌道授權成備援。⚠️ rev3 沿用 dynamic mode 即同樣免動 build 配置（待決①若動 router 結構亦不影響此層）。

### §6.2 user flows
- **登入→動態路由掛載**：`pwd-login.vue` → `authStore.login()`（`store/modules/auth/index.ts`）→ `fetchLogin`（`POST /auth/login`）→ `loginByToken`（存 token pair）→ `getUserInfo`（`fetchGetUserInfo` → `GET /auth/getUserInfo`）；route guard（`router/guard/route.ts`）→ `routeStore.initConstantRoute`（`fetchGetConstantRoutes`、公開）+ `initAuthRoute`（`fetchGetUserRoutes` → `{routes, home}`）→ vue-router 動態掛載。側欄選單 = 後端 Casbin enforce 過濾結果，**前端零過濾邏輯**（§I.2）。
- **7777 踢人 modal**（§4.3 access 通道）：後端 gate 回 `7777` → axios 攔截器 `service/request/index.ts` 比對 `VITE_SERVICE_MODAL_LOGOUT_CODES`（`.env` = `7777,7778`）→ `window.$dialog?.error` 彈 modal + `beforeunload` 擋刷新 → 確認後 `logoutAndCleanup`。已知 as-built 限制：HARD-reload boot 時 getUserInfo 早於 AppProvider 掛 `window.$dialog` → modal 靜默 no-op（in-app 導航才穩定彈；rev2 028 的已知 follow-up）。
- **8888 乾淨登出**（§4.1 refresh reuse 通道）：走 `VITE_SERVICE_LOGOUT_CODES`（= `8888,8889`）直接 `handleLogout`、無 modal；`3333/9999/9998` 走 `VITE_SERVICE_EXPIRED_TOKEN_CODES` → 自動 `fetchRefreshToken` 換新重試（後端 refresh handler 絕不回這三碼、防迴圈，§4.1）。

### §6.3 元件與設計系統
- **naive-ui**（base-web 既用）+ UnoCSS；列表頁範式 = `NDataTable` + 搜尋列 + `NDrawer`/`NModal` 編輯 + `NPopconfirm` 刪除確認；route 由 **elegant-router** 從 `views/` 檔案結構自動生成（`components.d.ts` / elegant 重生檔須隨 feature 一起 commit）。
- **新頁鏡像 manage/ pattern**（MODAL-WIRING use (e)）——rev2 實例 `manage/policy-archive/index.vue`（rev2 034 US5：單檔 NDataTable + NPopconfirm restore + 維度/角色篩選）與 `manage/system-settings/index.vue`（rev2 029：NSwitch + 後果提示）；rev3 新管理頁照此模板，選單可見性一律走後端 seed（§I.2）。
- **按鈕級顯隱**：`useAuth().hasAuth('<button_code>')`（如 `user:edit` / `role:edit` / `menu:delete`）；共用 `components/advanced/table-header-operation.vue` 用附加 prop + 安全預設（不變既有呼叫端行為）。

### §6.4 接線軌道對照（軌道定義見 §9.4）

| UI 改動類型 | 軌道 | rev2 實例檔案 |
|---|---|---|
| env / typings 增量 | L1+L2 ADAPT | `.env`（`VITE_AUTH_ROUTE_MODE=dynamic`）、`.env.test`（`VITE_SERVICE_BASE_URL=http://rust-api:21081`）；`typings/api/system-manage.d.ts` 增量 type（`SystemSetting` / `ArchivedPolicy`，註記 rev2 additive、不動既有） |
| 新 service wrapper | L3 WRAPPER | `service/api/rev2-system-manage.ts`（全部寫端 + rev2 新端點，29 個 fetch fn）+ `index.ts` 一行 re-export；既有 `auth.ts` / `route.ts` / `system-manage.ts` 不動 |
| 隱藏 demo menu | L4 BUILD-CONFIG ★ | 已授權、as-built **未動用**（§6.1：dynamic mode moot） |
| views inline | L4 MODAL-WIRING ★（5 用途、下表） | `views/manage/**` |
| 後端 | RUSTAPI-SOURCE-ISOLATION | rust-api 整棵樹（非 UI、列此補齊 5 軌道全貌） |

**MODAL-WIRING 5 個 inline 用途**（constitution §III.2 授權邊界 (a)–(e)）：

| 用途 | 授權版 | rev2 實例 |
|---|---|---|
| (a) `// request` placeholder 接線（modal/drawer create/update + `index.vue` 的 delete/batchDelete handler） | v1.0.0 | user/role/menu 三頁 operate-drawer/modal + `handleDelete`/`handleBatchDelete`（rev2 017/018/020） |
| (b) 操作鈕 `hasAuth(<button_code>)` 顯隱 gating（含 `table-header-operation.vue` 附加 prop） | v1.3.0 | `role/index.vue`・`menu/index.vue`・`user/index.vue`（rev2 022/024） |
| (c) 同模式新權限 modal + trigger（role-operate-drawer `isEdit` 區） | v1.4.0 | `role/modules/endpoint-auth-modal.vue`（rev2 023，鏡像 menu-auth / button-auth-modal） |
| (d) 選單復原 / re-parent 維運控制 | v1.5.0 | `menu-operate-modal.vue` parentId selector + `menu/index.vue` showDeleted 回收桶 toggle + restore 鈕（rev2 025） |
| (e) 同 manage 範式新管理頁 | v1.6.0 | `manage/system-settings/`（rev2 029）、`manage/policy-archive/`（rev2 034） |

- **紀律**（rev3 不變）：「**新增不改 inline**」為預設；inline 必落 (a)–(e) 邊界、每處 spec 記 file:line + upstream 衝突評估；超界 → constitution amendment（§9.5）。

### §6.5 wireframe（新頁才需）
rev3 若加 user-facing dashboard / reporting（待決⑥、§2）→ 屆時補低保真草圖；既有頁沿用 base-web、不畫。⚠️ 若 dashboard 拍板做：建議落點 = 替換 `/home` 的靜態 demo 卡片（該頁現為無 fetch 的純展示頁），新頁則沿 use (e) 同 manage 範式；wireframe 隨該 feature 的 spec 一起出、不預先入本書。

---

## §7 — wire contract (介面契約) ★first-class 受控產物、對外凍結脊椎

【目的】補 rev2 wire 三端「人工 grep 紀律」的痛點（史料見附錄 D），升為可機器校驗的契約。base-web 為權威 → wire 由前端期望定義（§6 → §7）；與資料脊椎衝突時 **wire 優先**（§0.1 雙脊椎宣告）。

### §7.1 endpoint 全集
> 盤點來源：base-web `src/service/api/{auth,route,system-manage,rev2-system-manage}.ts`（rev2 期檔名；波 -1 改名後 wrapper = `rev3-system-manage.ts`，附錄 A.2）共 **42 個 fetch 函式**，cross-check rust-api `server/src/main.rs` flat router **43 條 route**——其中 **35 條掛 `enforce_mw` route_layer**（`endpoint_coverage_lint` 鎖 `EXPECTED_ROUTE_COUNT=35`）、8 條不掛（public 或 JWT-in-handler）。對齊結果：**41 條兩端俱在；1 條 mock-only**（`/auth/error`）；`/health`/`/metrics` 為 rust-only infra、無 base-web caller。path 全集對齊 mock ground truth（rev2 史料，附錄 D）。
> 形狀欄縮寫：`Api.*` 型別宣告於 `base-web/src/typings/api/{auth,route,system-manage,common}.d.ts`；`Api.SystemManage.` 前綴以下省略。另有 alova mock 7 endpoint 不經 `service/api/*`、不入本表（alova = base-web demo 頁另用的 request 庫，與 axios 主線並存；其 mock silent-fallback 為 rev2 已知風險）。

| method | path | 用途 | req 形狀 | res `data` 形狀 | rev2 來源 |
|---|---|---|---|---|---|
| GET | `/health` · `/metrics` | liveness / Prometheus text（非 envelope、無 JWT） | — | text |（rev2 001/032）；rust-only；`/api/metrics` 對外 404（§7.4） |
| POST | `/auth/login` | 登入（所有失敗模式 collapse → 1000） | `{userName, password}` | `Api.Auth.LoginToken` |（rev2 013） |
| GET | `/auth/getUserInfo` | 當前 user + roles + buttons（JWT、無 enforce） | — | `Api.Auth.UserInfo` |（rev2 013/022） |
| POST | `/auth/refreshToken` | refresh 輪替（§4.1 狀態機） | `{refreshToken}` | `Api.Auth.LoginToken` |（rev2 013/026/027） |
| GET | `/auth/error` | demo 自訂錯誤回放 | query `{code, msg}` | — | **mock-only**：`fetchCustomBackendError` 有、rust-api 無此 route |
| GET | `/route/getConstantRoutes` | 登入前 constant routes（public） | — | `Api.Route.MenuRoute[]` |（rev2 014） |
| GET | `/route/getUserRoutes` | 角色過濾動態路由（JWT、handler 內過濾） | — | `Api.Route.UserRoute` |（rev2 014） |
| GET | `/route/isRouteExist` | 路由名存在檢查（JWT） | query `routeName` | `boolean` |（rev2 014） |
| GET | `/systemManage/getUserList` | user 分頁列表 | `UserSearchParams` | `UserList` |（rev2 013→016） |
| GET | `/systemManage/getRoleList` | role 分頁列表 | `RoleSearchParams` | `RoleList` |（rev2 016） |
| GET | `/systemManage/getAllRoles` | 啟用 role 全量（下拉用） | — | `AllRole[]` |（rev2 016） |
| GET | `/systemManage/getMenuList/v2` | menu 分頁列表 | — | `MenuList` |（rev2 019） |
| GET | `/systemManage/getAllPages` | 可路由頁面名集 | — | `string[]` |（rev2 019） |
| GET | `/systemManage/getMenuTree` | 父子選單樹 | — | `MenuTree[]` |（rev2 019） |
| POST | `/systemManage/add{User,Role,Menu}` · `update{User,Role,Menu}` | 建/改（update 多帶 `id`；userName/roleCode/routeName immutable） | write-model（wrapper 檔 inline `UserWriteModel` 等；rev2 檔名 = `rev2-system-manage.ts`、改名見附錄 A.2） | `null` |（rev2 017/018/020） |
| DELETE | `/systemManage/delete{User,Role,Menu}` · `batchDelete{User,Role,Menu}` | 單/批 soft-delete（種子保護；menu 另有父刪 guard） | `{id}` / `{ids: string[]}` | `null` |（rev2 017/018/020） |
| GET | `/systemManage/getDeletedMenus` | menu 回收桶列表 | — | `MenuList` |（rev2 025） |
| POST | `/systemManage/restoreMenu` | 還原 soft-deleted menu（孤兒父/route_name guard） | `{id}` | `null` |（rev2 025） |
| GET | `/systemManage/getRole{Menu,Button,Endpoints}` | 角色三維授權讀（§5.3；Super 查 Endpoints = full registry） | query `roleId` | `number[]` / `string[]` / `Endpoint[]` |（rev2 021/022/023） |
| POST | `/systemManage/updateRole{Menu,Button,Endpoints}` | 三維 hard-replace（menu 自鎖 guard；R_SUPER endpoints 拒編） | `{roleId, menuIds\|codes\|endpoints}` | `null` |（rev2 021/022/023） |
| GET | `/systemManage/getAll{Buttons,Endpoints}` | 可授權 registry（字典序） | — | `MenuButton[]` / `Endpoint[]` |（rev2 022/023） |
| GET/POST | `/systemManage/getRoleHome` · `updateRoleHome` | per-role landing page（default `home`） | query `roleId` / `{roleId, home}` | `string` / `null` |（rev2 021） |
| GET | `/systemManage/getSystemSettings` | settings KV 全列 | — | `SystemSetting[]` |（rev2 029） |
| POST | `/systemManage/updateSystemSetting` | 改 setting + invalidate 廣播（§5.6） | `{key, value}` | `null` |（rev2 029） |
| POST | `/systemManage/updateUserSessionPolicy` | per-account session policy（§4.3） | `{userId, policy}` | `null` |（rev2 029） |
| GET | `/systemManage/getArchivedPolicies` | policy 回收桶（§4.2） | — | `ArchivedPolicy[]` |（rev2 034） |
| POST | `/systemManage/restorePolicy` | 還原 archived policy | `{archiveId}` | `null` |（rev2 034） |

### §7.2 三端對齊機制
**三端**（rev2 真實位置）：① rust 手寫 serde DTO（`server/src/handler/{auth,route,system_manage}.rs`，`rename_all = "camelCase"`）② base-web 型別 = `typings/api/*.d.ts` 全域宣告 + `service/api/*.ts` inline write-model ③ component state（`views/manage/**`）。rev2 機制 = **人工 grep 紀律**（成文於 rev2 設計文件與其 workspace 工作流），無任何機器校驗。

**痛點實證（rev2）**：
- **id/parentId string type-lie 引爆（rev2 025-I1 事件；史料 REVIEW-014-026，附錄 D）**：rust 把 `id`/`parent_id` 序列化為**字串**（§I.3 凍結），typings 卻宣告 `number`（`Common.CommonRecord.id`/`Menu.parentId`）且 `defaultTransform` 不轉型 →（rev2 016/017）潛伏無害，（rev2 025）`menu-operate-modal.vue` 對 wire `"0" === 0` 為 false → `effectiveLayout=''` 吃掉 component 前綴 = 可觀察 data-corruption。修法落消費端 `Number()` 正規化、wire 凍結不動。
- **grep 紀律本身會 rot**：rev2 設計文件內的示例 grep 至 2026-06-11 實掃時仍指向 `server/src/api/*.rs`，而實碼在 `server/src/handler/`——人工紀律無 CI 錨、目錄改名即靜默失準。

**待決② 選項並陳**（本書不拍板）：

| 選項 | 收益 | 代價 |
|---|---|---|
| A 維持人工 grep 紀律（rev2 as-is） | 零工具投資；紀律已成文（rev2 workspace 工作流） | 無機器強制，（rev2 025-I1）類 lie 仍靠 review 抓；grep 例已實證會 rot |
| B OpenAPI/schema + codegen 單一來源 | 三端收斂為一端，型別 lie 結構性消失 | 工具鏈+維護成本最高；§I.1 base-web typings 為權威 → 生成方向必須「typings/mock → 驗 rust」、不可反向覆蓋前端 |
| C 輕量 contract test（CI 內 JSON shape assert） | 不動兩端源碼；可顯式斷言「刻意 lie」（string id）凍結事實 | 覆蓋靠人寫，新 endpoint 忘寫測試即退回 A |

⚠️ 建議（待 user 親決②）：C 起步（成本低、先鎖 §I.3 凍結形），B 視 rev3 endpoint 增速再評估；若採 B，生成方向受 §I.1 約束如上。

### §7.3 envelope / pagination / error-code 完整矩陣
> envelope 規範本體在 §5.4，此處只補 as-built 錨 + 完整碼表、不重複。as-built：`server/src/envelope.rs` —— `Res<T>` 宣告序 = 序列化序（`data`→`code`→`msg`；錯誤 `data:null` 不 skip、business error 走 HTTP 200）；`PageRes<T>` = `{current, size, total, records}`（camelCase、u64 JSON 數字、**無 `pages`/`success`**、空頁 `records:[]`）↔ base-web `Common.PaginatingQueryRecord<T>`。

**13 碼矩陣**（`envelope.rs` `BizCode`，code/msg 字串為 wire 凍結事實、msg 為簡中資料值）：

| code | variant | default_msg | HTTP | rust-api 發出點 | base-web 行為（`.env` 分組） |
|---|---|---|---|---|---|
| `0000` | Success | 请求成功 | 200 | 全 success | `VITE_SERVICE_SUCCESS_CODE` |
| `1000` | LoginFailed | 用户名或密码错误 | 200 | login 全失敗 collapse（`handler/auth.rs`） | 顯示錯誤 |
| `2222` | BizError | 业务错误 | 200 | 業務拒絕：種子保護/非法 code/治理 Rejected（`handler/system_manage.rs`） | 顯示錯誤 |
| `3333` | TokenExpired | 登录已过期 | 200 | bearer 驗失敗/user 不存在（`auth/enforce.rs`、`handler/{auth,route}.rs`） | EXPIRED_TOKEN_CODES → 自動 refresh+重送 |
| `7777` | ModalLogout7777 | 账号在他处登录 | 200 | single-session `is_current` 失敗：4 認證 gate（§4.3）+ refreshToken pointer-first（`handler/auth.rs`） | MODAL_LOGOUT_CODES → modal 登出 |
| `7778` | ModalLogout7778 | 账号状态变更 | 200 | **零發出點**（矩陣保留） | 同上 |
| `8888` | Logout8888 | 请重新登录 | 200 | refresh reuse/notfound（§4.1，`handler/auth.rs`） | LOGOUT_CODES → 乾淨登出 |
| `8889` | Logout8889 | 账号已被禁用 | 200 | **零發出點**（保留） | 同上 |
| `9998` | TokenInvalid9998 | 登录信息无效 | 200 | **零發出點**（保留；§4.1 refresh 明令不回） | EXPIRED_TOKEN_CODES |
| `9999` | TokenExpiredAlt9999 | 登录已过期 | 200 | **零發出點**（保留；同上） | 同上 |
| `4040` | NotFound | 接口不存在 | **404** | router `.fallback` → `AppError::NotFound`（`error.rs`） | — |
| `5003` | PermissionDenied | 权限不足 | **403** | `enforce_mw` deny / role-lookup DB 失敗（`auth/enforce.rs`） | 顯示錯誤 |
| `5000` | Internal | 服务器内部错误 | 200* | handler 內 `Res::err(Internal)`（DB/簽章失敗） | 顯示錯誤 |

- HTTP status 例外僅 2 條真實路徑：`4040`→404、`5003`→403；其餘全 HTTP 200 信封。*`AppError::Internal`→HTTP 500 已定義但 rev2 無 handler 生產者（`error.rs` 注記 test-only）——⚠️ rev3 須拍板 `5000` 的 HTTP status 配對並一致化、入 contract test（§7.2）。
- 4 個保留碼（7778/8889/9998/9999）rust-api 從不發出、僅前端 `.env` 分組認得。⚠️ 建議 rev3 沿用 13 碼矩陣整組凍結（含保留碼）——前端分組行為是 base-web 既有事實（§I.1），刪碼會破 `.env` 對齊；待 user 覆核。

### §7.4 部署層 wire 細節
**nginx 單入口**（`deploy/nginx/conf.d/_locations.inc`，dev/prod 兩 conf 共 include 同一份）：
- `location /api/ { proxy_pass http://rust-api:21081/; }` —— **末尾 `/` = strip `/api` 前綴** → rust-api root routes（對外 `/api/auth/login` → 容器內 `/auth/login`）。轉發 header：`X-Real-IP`/`X-Forwarded-For`/`X-Forwarded-Proto`/`X-Request-Id`（`$request_id`）。
- `location = /api/metrics { return 404; }` —— exact-match 擋塊先於 prefix match（rev2 032 FR-011：strip 規則會把任何 rust-api root route 對外暴露，「internal」端點必須逐條加擋塊）；內網 prometheus 直接 scrape `rust-api:21081/metrics`、不經 nginx。
- `location /` → `base-web:21079`；`location = /health` nginx 自答 `ok`。`dev.conf` listen `21080` + `21443 ssl`；`prod.conf` listen 80（僅 `/health` 例外、其餘 301 → https）+ 443 ssl。
**base-web API base URL 來源**：
- **dev**：`pnpm dev` = `vite --mode test` → `.env.test` 的 `VITE_SERVICE_BASE_URL=http://rust-api:21081`（rev2 013 BASE-WEB-ADAPT 由 ApiFox mock 切換）；`.env` `VITE_HTTP_PROXY=Y` → 瀏覽器實際打 vite `:21079` 的 `/proxy-default/*`、由 vite dev proxy rewrite 轉 rust-api（`build/config/proxy.ts`）。
- **prod**：`deploy/Dockerfile.base-web.txt` 的 `ARG VITE_SERVICE_BASE_URL`（default = ApiFox mock URL）→ build 時寫入 `.env.prod.local`（mode=prod precedence 最高；vite `loadEnv` 不讀 process.env，故不能用 `ENV`）；`docker-compose.prod.yml` 注入 build-arg **`VITE_SERVICE_BASE_URL: /api`** → 瀏覽器同源 `/api/*` → front-nginx strip → rust-api。standalone `docker-compose.base-web.yml` 則取 host envvar `${VITE_SERVICE_BASE_URL:-ApiFox-mock}`。

---
# Part III · 交付計畫（明示可變；依賴序 DAG 在 §1.5、凍結不動）

## §8 — 交付計畫 (Vertical-Slice Delivery Plan)

【目的】一 entity 端到端 + 所有面一次碰頭，在最便宜時暴露整合（rev2 拖到（rev2 034）才發現治理層要重弄）。本章 = 縱切工序（§8.1）＋清單（§8.2）＋第一刀（§8.3）＋交付波次（§8.4）＋風險序（§8.5）＋三序互動與 rev2 對照（§8.6）＋每刀工作流（§8.7）；**全章除 §8.1/§8.2 外皆「預期會調整」、絕不叫硬依賴**。

### §8.1 縱切原則（一刀的工序 checklist）
一刀 = 一個 entity 從 DB 到瀏覽器閉環；§5.0 矩陣該 entity 列的每個 ✓ 面**在本刀內交付**、不留「之後再加」。工序順序如下（rev2 016/017/029 實證序；test-first 寫在實作前、第 8 列是守恆驗收位）：

| # | 工序 | 內容（rev2 as-built 慣例） | §5 面打勾義務 |
|---|---|---|---|
| 1 | migration | 建表當下即帶 archetype A 全 6 審計欄 + BIGSERIAL + partial-uniq（§3.4；seed 不寫死小 id） | §5.1・§5.7 |
| 2 | entity | `entity/` crate Model（`auto_increment` 與 migration 成對；jsonb/inet 型別對齊附錄 F） | —（§3 投影） |
| 3 | facade | `model/facade/*` 唯一存取閘：`SoftDeletable`（`find_active` 濾 deleted_at）+ facade 層 `soft_delete` fn + `mutate_in_txn` 同 txn 審計 + `AuditSerialize` redact | §5.1・§5.2 |
| 4 | handler | DTO mapping 零 `entity::` token（守 lint）；id wire=string、enum i16↔string、`normalize_page` + `PageRes{current,size,total,records}` | §5.4・§5.8 |
| 5 | router 註冊 | flat-in-`main.rs`（待決①）+ per-route `route_layer`（bearer→`enforce_mw`）；受保護讀端掛 `is_current` gate | §5.3・§5.5 |
| 6 | casbin policy seed | seed migration 逐條 p-policy（無 wildcard、R_SUPER 也逐端點）；新頁的 menu 可見性 policy 同 migration 帶 | §5.3 |
| 7 | wire | base-web `service/api/rev3-*.ts` wrapper（前綴隨代號走；rev2 對應物 = `rev2-system-manage.ts`，附錄 A.2）+ `typings/api/*.d.ts`；走 §9.4 軌道（L3 WRAPPER / ★L4 MODAL-WIRING） | §7 三端對齊 |
| 8 | test | 純單測 TDD + in-crate `#[ignore]` live（postgres/redis）+ 守恆（entity_access_lint・endpoint_coverage_lint・migration up→down→up） | 全面回歸 |
| 9 | CDP 驗收（CDP = Chrome DevTools Protocol 瀏覽器自動化） | 經 front-nginx dev HTTP 入口（rev2=`:21080`；rev3 port 見 §11.1 注）真實 `/api` 路徑、isolated browser context；curl 直送 ≠ modal 對齊（C-V = spec `contracts/` 的 verification-commands 驗收契約） | §6 流程閉環 |

### §8.2 entity 縱切清單（rev2 35 work item 用 entity 重切；`*`=跨切；行為島各自一刀）
```
※ 本清單編號皆 rev2：NNN = rev2 feature（specs/<NNN>-*）、mNNN = rev2 migration（m20260529_000NNN）
〔跨切地基〕Infra/deploy（rev2 001-007,010,012）· Envelope（rev2 008）· Soft-delete（rev2 009）
            · Audit（rev2 011 op-log / 015 access-log+login-attempt+xdb〔3 entity=2 刀;015 一 feature 建兩表、
              依（rev2 016）同款「一 feature 兩 entity → 縱切應拆兩刀」紀律標跨切〕）
〔data island 縱切〕
  User（rev2 016* 017）   Role（rev2 013* 016* 018）〔（rev2 013）建 sys_role(rev2 m006)+sys_user_role(rev2 m007)+nick_name(rev2 m008)
                                                    +policy seed(rev2 m009) — Role 的 schema 起點在（rev2 013）、非（rev2 016/018）;
                                                    （rev2 016）一 feature 兩 entity → 縱切應拆兩刀〕
  Menu（rev2 014〔runtime 讀〕 019 020 021 025）
〔行為島縱切（用 §4 鏡頭；3 台機器 → 2 刀交付）〕
  Auth/Token/Session（rev2 013* 026 027 028 029 030）〔§4.1+§4.3 兩台機器合刀;cleanup-job=本縱切 L8 binary〕
  Policy-governance（rev2 034 035）〔casbin_rule 治理欄(rev2 m031)+archive 表(rev2 m032)+sys_menu.protected(rev2 m034)
                              +protected/archive-page policy seed(rev2 m033/m035);（rev2 034）跨到 Menu entity 一欄;（rev2 035）無 migration〕
〔policy 縱切（非行為島、無狀態機）〕
  Button/Endpoint（rev2 022 023 024）〔純 casbin policy、無新 entity〕
〔包覆全體〕Observability（rev2 031 032〔/metrics in-process〕 033）
```

**待拍板刀位**（拍板後掛波、未決前不排程；決策時限見附錄 G）：
- **constitution-rev3 重鑄凍結**——★**排定於波 -1**（§8.4）：§8.7 step 2 的 Constitution Check 依賴物（rev3 第一刀跑工作流前必須存在）；內容 = rev2 constitution carry（§9）+ ⚠️g／⚠️i 調整 + 附錄 A.2「rev2-* 前綴」字面重鑄 + 待決⑤ 凍結邊界結果（與 §9 章首配方一致）。
- **system_settings 刀**（條件：待決③ = A）——User 直刀不覆蓋 §5.6 熱 KV／pub-sub 面，需獨立一刀、建議掛波 2。
- **審計查詢讀端＋UI 刀**（條件：⚠️b 核可）——三 log 讀端 + R_SUPER policy seed + manage 新頁（§5.0 ⚠️ 格、§9.4 use (e)）。
- **§1.2 尾巴刀**（條件：⚠️m 拍板「補列」）——alt-login 4 流程 stub + captcha 2 端點（sendCaptcha/verifyCaptcha；`/mock/getLastTime` 依 §1.4 維持不做）；拍板「重議」則走 §9.5 amendment 撤拍板。

### §8.3 第一刀建議（待決③ 並陳、user 親決）
**共同前提**：兩案皆假設跨切地基（§8.2：infra/envelope/soft-delete/audit 兩 sink）+ Auth 島最小第一段（login + `enforce_mw`，rev2 013 對應物）先行——否則 §5.3 enforce 與 §5.2 `operator_id` 無從驗。

| | **A：User 直刀** | **B：`system_settings` 打樣** |
|---|---|---|
| 覆蓋面（逼出什麼） | §5.1+§5.2（含 password redact）+§5.3+§5.4+§5.8 全套 + M:N join（`sys_user_role` replace_roles_in_txn）+ argon2 預設密碼 + 停用登入 gate + ★L4 MODAL-WIRING 前端軌 | §5.1+§5.2（§I.6 真審計）+§5.3（Super-only）+§5.4 + **§5.6 熱 KV/pub-sub（此 entity 獨有）**；**不逼** §5.8 分頁/filter、M:N join、id=string（varchar PK 無序列） |
| 規模實證（rev2） |（rev2 016〔user 半〕+017）兩 feature 才閉環：read 3 端點 19 task（T001–T019、acceptance 47/47）+ write 4 端點 28 task/3 US、rust-api 5+18 commit、migration ×3（rev2 016 m013 讀端 policy seed；017 m014 +9 欄 retrofit + m015 寫端 policy seed）、CDP 7/7 |（rev2 029）的 system_settings 子集：migration `m20260529_000028` CREATE（10 欄）+ facade + 2 端點（getSystemSettings/updateSystemSetting）+（rev2 m029）seed + 設定頁；（rev2 029）**全 feature** 也只 22 task、rust 11 + web 5 commit（含 settings_watcher 機件） |
| 風險 | 第一刀即最重（rev2 實證需兩 feature 規模）；但 `sys_user` 是 login/`operator_id` 的根 entity，最早凍結收益最大 | 範本代表性不足（varchar PK 外掛、無 id=string 義務）；分頁/join 拖到第二刀才暴露；§5.6 watcher 入刀=pub-sub infra 拉早、不入=打樣不完整 |

⚠️ 工程預設傾向 **A（User 直刀）**：縱切的目的就是「所有面最早碰頭」（本章【目的】行），B 省下的規模換不回它漏掉的 §5.8/join/id-string 暴露；但 B 的「一週期管線排練、便宜驗 §8.1 工序」價值真實存在——**此為待決③、絕不預先拍板**。

### §8.4 交付波次 — roadmap（明示可變）
**此序預期會調整、非硬依賴**——它只是 §8.2 縱切清單在「今天的判斷」下的一種合法排列（合法性由 §1.5 依賴序限制，互動規則見 §8.6）。建議波次（每波 = 數刀縱切，每刀走 §8.1 全鏈）：

| 波 | 內容（素材 = §8.2） | 出口條件（過了才換波） |
|---|---|---|
| **-1 repo 建構** | ⚠️j＋⚠️q 拍板 → 建 rev3 outer repo＋worktree/submodule 註冊（**內容起點＝⚠️q**：預設 base-web 自 rev2 分支衍生、帶既有接線；rust-api 程式碼依 §8 波次從零重寫）＋CLAUDE.md-rev3＋SessionStart hook＋spec-kit 殼（rev2 機械建構對應物；**執行前提＝rev2 repo／源倉可存取**——外層檔〔compose／deploy／CLAUDE.md 底本／`.claude/`／`.specify/`〕自 rev2 outer repo 帶入後依附錄 A 改名，規格本書未內化、需回 rev2 取）；本書入 `docs/`；**附錄 A 改名 one-shot 執行**（若 rust-api 採從零，A.2 rust-api 列轉為 token 對照、不實際改名）；**constitution-rev3 重鑄凍結 v1.0.0**（來源材料＝§9） | 新 repo session 健檢綠（hook 跑通、submodule 狀態正確）；constitution-rev3 v1.0.0 **獨立 commit**；設定／部署層 `grep rev2` 歸零（本書編號標記與史料引用除外）；`/speckit-*` 指令可用 |
| 0 地基 | infra/deploy + envelope + soft-delete 基建 + audit 兩刀（op-log / access-log+xdb）＋ **Auth 島最小段**（login + `enforce_mw`；§8.3 共同前提、（rev2 013）對應）——（rev2 001-012 + 015）對應 | dev stack `up --wait` 全 healthy；三守恆綠（entity_access_lint・endpoint_coverage_lint・migration up→down→up）；envelope 13 碼 contract 形狀測試綠（⚠️e 拍板形）；login→getUserInfo→enforce 最小鏈 curl 通 |
| 1 第一刀 | User **或** `system_settings` 打樣（**待決③、user 親決**）：migration→facade→handler→enforce→wire→frontend 全鏈 + §5 各面一次逼出 | §8.1 工序 9 列全過；CDP 經 front-nginx 真 `/api` 路徑驗收；該 entity 的 §5.0 列逐面勾消 |
| 2 data islands | 其餘業務 entity 各一刀（User/Role/Menu；rev2 016 一 feature 兩 entity → rev3 拆兩刀；settings 刀若待決③=A 掛此波） | 各刀工序全過；§7.1 對應 endpoint 兩端俱在、contract test 綠 |
| 3 行為島＋policy | 行為島 **2 刀**（Auth/Token/Session 合刀＋Policy-governance）＋ Button/Endpoint policy 縱切（非島、純 policy，§8.2） | §4 三台機器 invariants 逐條有自動化驗證；7777/8888 兩通道 CDP 實證；protected 拒撤 live 驗證 |
| 4 observability | obs-min(log) → obs-full(metrics) → grafana dashboard（rev2 033 對應物，**非** §2 user-facing 儀表板），包覆全體 | obs/metrics profile 起停乾淨（一般 `up` 不啟）；provisioning 重建無 crash-loop；rust-api log/metrics 兩軌可查 |

- 波 3 的 Policy-governance 依風險序（§8.5）應**提前打樣**（throwaway spike ≠ 交付）；交付位置可仍在波 3，但島的形狀必須在波 1-2 期間已驗過——這正是 rev2 拖尾教訓的反向操作。
- **量級錨（rev2 實績）**：rev2 同範圍 35 個 work item 全程 ≈ **13 天**（constitution 凍結 2026-05-28 → 最後兩刀 merge 2026-06-09）；rev3 重切後總量 ≈ 地基 4-5 刀＋業務 4-6 刀＋行為島 2 刀＋policy 1 刀＋obs 1 刀 ≈ **12-15 刀**——波次節奏可依此粗估，**僅供排程參考、非承諾**。
- **波 -1 的 rev2 實序對應**（rev2 git 史，2026-05-26~28、（rev2 001）起跑前 3 天）：workspace 機械建構（CLAUDE.md／ignore／hook／worktree+submodule／spec-kit 殼）→ base-web docker bootstrap（供 mock 稽核）→ 研究三部曲＋設計書撰寫 → 12 項拍板 user 親決 → constitution v1.0.0 提取凍結 → 第一個編號 feature 起跑。**rev3 的研究／設計／拍板段已由本書承接（已內化）**，故波 -1 壓縮為「機械建構＋constitution 重鑄」兩段；base-web 跑起來的驗證歸波 0。

### §8.5 風險序 — de-risk 優先
最不確定處先打樣（spike 可拋棄、不算交付）。候選與 rev2 實證（= 為什麼它真的咬人）：

| de-risk 候選 | 為何不確定 | rev2 實證 |
|---|---|---|
| policy 治理島形狀（§4.2） | 治理欄/archive 與 adapter 的互動形狀，不打樣只能猜 | rev2 把它當「又一張 casbin 表」defer 成獨立治理軌道，拖到（rev2 034/035；35 features 的最後兩個）才落地；原 defer 主因「soft-delete ⇒ 必 fork adapter」係未驗假設、（rev2 034）親驗推翻（rev2 034 merge `8e95fa1`；其 Phase 編號 3#6 與實際時序脫鉤，附錄 B） |
| wire 三端對齊（§7.2） | rust DTO ↔ typings ↔ component state 三端靠 grep 人工守，漂移無機器閘 | id/parentId string type-lie （rev2 016/017）一路無害接受，（rev2 025-I1）在 `menu-operate-modal.vue` 的 `parentId("0") === 0` 引爆成可觀察 data-corruption（rev2 025-I1 事件紀錄）→ 是否上 OpenAPI/code-gen 層 = 待決② |
| casbin adapter 行為 | stock `sea-orm-adapter` 的 load_policy/insert 欄位範圍是文件外行為，版本升級可能變 |（rev2 034）親驗 stock adapter 嚴格 column-scoped 到 `ptype,v0..v5`（load_policy = `Entity::find().all()` 只讀 adapter entity 定義欄、insert 只填 `ptype,v0..v5`，治理 3 欄一概不可見）→（rev2 m031）治理 3 欄得以設計成 **adapter-invisible**、免 fork；rev3 升 casbin/adapter 版本須重驗此不變式 |
| single-session 跨實例（§4.3） | pointer DB+Redis 快取 + pub-sub 收斂，多副本 / watcher 失聯情境單機驗不到 | rev2 已實證「DB 直改不 publish → in-memory 狀態脫鉤」：（rev2 035）live 測試須刻意不 publish 以免污染 running watcher（rev2 035 merge `e841225`）；watcher 韌性重訂閱 + `is_current` fail-OPEN 邊界是 rev3 多實例化前必打樣處 |

### §8.6 三序互動 + 縱切 vs rev2 Phase 對照
- **依賴序（§1.5）是唯一凍結的「真 DAG」**：任何一刀縱切的內部工序都由低層到高層；它定義交付序的**合法排列集**（例：行為島一刀不能先於其 L2/L4 地基）。
- **交付序（§8.4）= 在合法集內挑的一條路徑**，隨人力/回饋滑動；調整它**不需**動 §1.5、也不構成設計變更。
- **風險序（§8.5）= 在合法集內的挑選準則**：最不確定的島先 spike（可拋棄），驗完形狀再排進交付波。
- **三者不可壓成一張圖**：rev2 把 Phase roadmap 同時當依賴圖 + 交付表用，治理島被排程綁架（「Phase 3 #6」編號上屬 Phase 3、實際在 Phase 4/5/6 全收完後的（rev2 034/035）才落地）——排程滑動被誤讀成架構依賴，正是三序分離存在的理由。

**縱切 vs rev2 Phase 對照**（同工作量、橫 phase → 縱 entity）：

| rev2 Phase 排序的問題點（rev2 實證） | rev3 縱切怎麼改 |
|---|---|
| 治理（Phase 3 #6）被當「又一張 casbin 表」掛帳，拖到 Phase 4/5/6 全完後才以（rev2 034/035）落地 | 行為島各自一刀（§4.4）：policy-governance 用 §4.2 state-machine 鏡頭**第一輪就設計**、獨立縱切 |
| **（rev2 016）一 feature 兩 entity**（getUserList + getRoleList/getAllRoles 跨 user/role） | 一刀一 entity：User-read 與 Role-read 拆兩刀（§8.2 的 `rev2 016*`） |
| **（rev2 030）cleanup-job** 排成 Phase 5 末位補位 feature，離（rev2 027）建 `sys_token` 中隔（rev2 028/029）；（rev2 027）latent 的同秒 `token_hash` 撞鍵（jti）也拖到（rev2 030）才修 | cleanup-job = token 縱切的 **L8 background binary**（§1.5）：歸 Auth/Token/Session 刀內交付，清理規則/expires 索引與 §4.1 狀態機同刀設計 |
| **（rev2 032，Phase 6 obs）回頭改 app 碼**（server `main.rs` `/metrics` + `enforce.rs` counter），順帶才閉 Phase 3 #5 掛帳的 enforce metrics 債 | observability = **包覆全體之刀**（§8.2）：in-process 埋點（`/metrics`、`casbin_enforce_total`）屬包覆刀義務、一次定，entity 刀不留 metrics 掛帳 |
| 建表與寫端隔多個 phase → 審計欄 retrofit（rev2：`sys_user` m003 `deleted_at` → m014 才補 9 欄 + BIGSERIAL；`sys_role` 重演） | 一刀內建表即帶 archetype A 全欄（§3.4）；同 entity 讀/寫同刀或緊鄰兩刀，schema 一次定稿 |

### §8.7 每刀的 SDD+TDD 工作流（沿用 rev2 workspace 既定流程；此處壓縮，rev3 於自己的 CLAUDE.md 重立同款）
1. **階段 0 brainstorm**（`superpowers:brainstorming`）→ `docs/superpowers/<NNN>-<name>.md`；`/speckit-specify` 由 **user 手動執行**（pre-hook `speckit.git.feature` 建 feature branch）。
2. **SDD 鏈**：specify → clarify（optional）→ plan（含 Constitution Check 對照 §9）→ tasks → analyze；每步 commit。
3. **plan 的 Phase 0 research 三 grep 紀律**（不信 brainstorm 命名）：① facade 真實返回型 grep（對照 entity Model 欄位）② wire 鏈 3 端對齊 grep（rust DTO ↔ `service/api/*.ts` + `typings/api/*.d.ts` ↔ component state）③ data-model `file:line` 命名對照 grep；CDP smoke 若 defer 須在 spec 明示風險 + backlog 登記。
4. **verification-commands 紀律**：新增 rust workspace crate ⇒ acceptance **必含 prod image build**（dev bind-mount 會遮 Dockerfile 逐 crate COPY 缺口；rev2 三度被咬）。
5. **實作一律 `superpowers:executing-plans`**（從不 `/speckit-implement`）→ subagent-driven：每單元 fresh implementer + 兩階段 review（spec compliance → code quality）。
6. 每 implementer 走 **TDD red→green**；無可測純函式者由 C-V contract（CDP + curl + psql）覆蓋、並在 tasks.md/plan.md 明示「無單元測試」理由。
7. **收尾 `superpowers:finishing-a-development-branch`** → 兩段式 commit → `merge --no-ff` 回 default、保留 feature branch 供 audit；**任何 push/merge 絕不早於 finishing**。

### §8.8 rev3 v1 完成定義（DoD）
全部成立才算 rev3 v1 收尾（單波出口條件見 §8.4）：
1. **wire 對等**：§7.1 的 41 條業務 endpoint 全集兩端俱在（rust route ↔ base-web fetch fn）；「明確不做」項除外（§1.4）。
2. **面矩陣勾消**：§5.0 每個 entity 列逐面交付完畢；⚠️ 格（三 log 讀端）依拍板結果定案（做→交付；不做→改「—」）。
3. **行為島驗證**：§4 三台狀態機 invariants 全數有自動化驗證（單測或 C-V contract）；7777/8888 通道 CDP 實證。
4. **契約凍結**：§7.3 13 碼矩陣 contract test 綠（⚠️e 拍板形）；§3 schema 對附錄 F 基線（含待決④ 拍板結果）零 drift。
5. **治理收斂**：constitution-rev3 凍結 v1.0.0；附錄 G 全列「✅ 已決」或明示展期。
6. **部署可用**：prod baseline compose 實機 `up` 通過 §8.4 全波出口條件回歸。

---

# Part IV · 基線與附錄

## §9 — 凍結基盤 (Frozen Substrate)

【目的】carry from `constitution.md` v1.6.0；不可違反基線，改它走 amendment。本章為參考性快照、後置於此，不打斷 Part I→II 的設計敘事。

> 來源 = rev2 constitution v1.6.0（Ratified 2026-05-28 / Last Amended 2026-06-06；原檔不隨書移植）。**本章快照是 rev3 repo 內該內容的唯一載體，也是 constitution-rev3 重鑄的指定來源材料**（§8.4 波 -1）：重鑄 = 本章 carry ＋ ⚠️g／⚠️i 調整 ＋ 附錄 A.2 `rev2-*` 前綴字面重鑄 ＋ 待決⑤ 凍結邊界結果，凍結為 constitution-rev3 **v1.0.0**——鏡像 rev2 自己的建構順序（設計書拍板 → 提取凍結 → 第一個 feature 起跑）。**重鑄前**：rev3 工作以本章為準；**重鑄後**：以 constitution-rev3 為準、本章降為歷史對照（附錄 D）。刻意偏離處（⚠️g）已登附錄 G。本章是 rev3 對 rev2 凍結權威的**承接快照**：§I 原則與 §II 拍板原則上整批 carry、僅標注 as-built 出入與 rev3 加嚴處；rev3 自己要新凍什麼（§3 schema / §5 面進不進 constitution）是「待決⑤」、本章不替 user 拍板。每個 feature 的 `/speckit-plan` 須跑 constitution §IV 的 8 題 Constitution Check（全文快照於 §9.6），任一不過 → 回 brainstorm 或申請 amendment（§9.5）。

### §9.1 兩條鐵紀律
- **① base-web 為權威**（§I.1，NON-NEGOTIABLE）：base-web example 有的功能、rust-api 都要提供對應 endpoint；wire / type / endpoint / route shape 由前端錨定；「v1 從簡」只能是排程、不能縮減設計範圍；不動 base-web inline（例外走 §9.4 ★ 軌道）。**為什麼**：base-web fork 自 upstream soybean-admin、必須保 upstream rebase 友善；且範圍若任由後端裁剪，會重演 rev1「前端期望 ≠ 後端供給」的漂移——這也是 §6 screen inventory 與 §7 wire contract 的存在前提。
- **② menu 權限 Casbin enforce**（§I.2，rev2 核心突破）：業務 menu 走 `/route/getUserRoutes` → 後端 Casbin enforce 過濾 → 前端顯示；demo menu（`document`/`exception`/`multi-menu`/`iframe` 等 8 個 customRoutes）由 BUILD-CONFIG `pageExcludePatterns` 隱藏（**as-built 注**：此軌道已授權但 rev2 從未實作——`build/plugins/router.ts` 無 `pageExcludePatterns`，rev2 022 plan Constitution Check 明記「本波不配」；§9.4 同步標注）（例外：`function`/`function_toggle-auth` 經 v1.3.0 amend 升為真實 Casbin-enforced 選單，作角色×按鈕權限 demo 載體）；constantRoutes（login/404/403）前端寫死、不動。**為什麼**：menu 可見性是資料驅動權限（policy 在 `casbin_rule`）、不是程式內 map——rev1 未實現、rev2 實現並凍結，rev3 沿用（機制本體 §5.3、治理行為 §4.2）。

### §9.2 §I 六核心原則

| 原則 | 一句話內容 | rev3 沿用備註 |
|---|---|---|
| §I.1 base-web 為權威 | 前端有的功能後端必供對應 endpoint，範圍嚴格不縮減 | 沿用；§9.1①、§6 的前提 |
| §I.2 menu Casbin enforce | menu 由 Casbin enforce、有權才顯示 | 沿用；§9.1②、機制在 §5.3 |
| §I.3 wire 對齊 mock | envelope `{data,code,msg}`（無 success bool）、`code`=string `"0000"`、`Role.id`/`MenuRoute.id`=string、business 錯=`2222`（`5xxx`=授權/基建）、`MenuType` 1=dir/2=menu、`Status` nullable、帳號 `Super/Admin/User`+User→User01 alias | 沿用；§5.4/§7.3 是其投影；契約機器化見「待決②」 |
| §I.4 SDD+TDD 工作流 | 階段 0 brainstorm → speckit 設計鏈 → `superpowers:executing-plans`；push/merge 不得早於 finishing-a-development-branch | 沿用；§8.7 每刀工作流 |
| §I.5 rust-api 全新寫（RUSTAPI-SOURCE-ISOLATION） | code 不拷貝 rev1；例外：copy `sea-orm-adapter`+`xdb`（工具性 crate）、`axum-casbin` 必須重寫；research 不准 grep rev1 source | 沿用，惟例外清單措辭需校 as-built（見下注） |
| §I.6 業務表審計欄標準 | 建表 MUST 含 6 審計欄、`*_by`=operator user_id（bigint 非字串）、`*_at`/`*_by` 成對寫；append-only / join 表例外 | 沿用且加嚴：rev3 建表即帶（§3.4），retrofit 條款應不再需要 |

**as-built 注（§I.5 `axum-casbin`）**：constitution 原文寫「`axum-casbin`：必須重寫（~3-5 人日）」；as-built rust-api workspace 6 成員（`server`/`migration`/`cleanup-job`/`entity`/`sea-orm-adapter`/`xdb`，`rust-api/Cargo.toml`）**無 `axum-casbin` crate**——「重寫」落地為 server in-tree enforce（`server/src/auth/enforce.rs`，檔頭明注 "written fresh, NOT a copy of any reference axum-casbin crate"）。紀律有守（零拷貝）、僅未成獨立 crate；⚠️ rev3 凍結文字建議改寫為「enforce 層全新寫（in-tree，無獨立 `axum-casbin` crate）」，與 §1.5 as-built 校正一致。

### §9.3 §II 12 拍板（實列 13）

> 逐列抄自 constitution §II（2026-05-27 親決；原檔 §II 標題寫「12 項拍板摘要」、表實列 §11.1~§11.13 共 **13** 列，v1.0.0 起即如此——as-built 誠實並陳）。★=違反「不動 inline / build 配置」直覺的拍板。**本表 §11.x 為 rev2 設計文件 §11 的拍板編號、與本書 §11（部署與運維）無關**；constitution-rev3 重鑄時建議改無撞號形（如拍板 #1~#13）。詳細拍板理由存 rev2 史料（附錄 D）。

| 編號 | 拍板內容一句話 |
|---|---|
| §11.1 | 預設帳號 (b) `Super/Admin/User` 對齊 mock + 模仿 User → User01 alias |
| §11.2 | alova 7 endpoint (a) 全實作 + 個別 disabled / stub flag |
| §11.3 ★ | modal CRUD 衝突 (B) 升 L4 改 modal placeholder（MODAL-WIRING 啟用） |
| §11.4 | apifoxToken (c) rust-api 忽略 unknown header（base-web 不動） |
| §11.5 ★ | alova menu (b'-narrow) `pageExcludePatterns` 隱藏 demo；v1.3.0 amend：`function_toggle-auth` 例外提升為真實選單 |
| §11.6 | sub-crate：axum-casbin 重寫；sea-orm-adapter / xdb 拷貝 |
| §11.7 | auth route mode (b) dynamic（後端控 menu） |
| §11.8 | obs stack (a) 漸進 — Phase 5 obs-min / Phase 6 obs-full |
| §11.9 | 軌道清單：5 軌道全啟用（2 ★ 詳見 §9.4） |
| §11.10 | wire 細節：Role.id / MenuRoute.id = string、User alias 模仿、business error `2222`（`5xxx`=授權/基建） |
| §11.11 | prod 路徑前綴 (a) `/api/*` 主流 |
| §11.12 | brainstorm 位置 (a) `docs/superpowers/<NNN>-<feature-name>.md` |
| §11.13 | login 替代入口 (c) 全實作雙模 + v1 啟 stub mode |

⚠️ rev3 承接建議：§11.1/§11.3/§11.5/§11.6/§11.7/§11.10/§11.11 屬 wire / 架構不變式、原樣 carry；§11.2/§11.13（alova/stub 雙模）與 §11.8（obs 分期）屬 rev2 排程性拍板、rev3 重排交付序（§8.4）時可重議——重議仍走 §9.5 amendment、不默改。

### §9.4 base-web 受管例外軌道（§III）

| 軌道 | 等級 | 授權範圍 | rev2 實例 |
|---|---|---|---|
| BASE-WEB-ADAPT | L1+L2 預設可動 | `.env*` + `src/typings/api/` 新檔（如 `rev2-extra.d.ts`——快照原文；rev3 期讀作 `rev3-extra.d.ts`，附錄 A.2）；新增為主、禁刪既有 type/field | `VITE_SERVICE_BASE_URL` 指 rust-api、dynamic route mode |
| BASE-WEB-WRAPPER | L3 預設可動（constitution §III.1） | `src/service/api/rev2-*.ts` 一律新檔（快照原文；rev3 期讀作 `rev3-*.ts`，附錄 A.2）；不改既有 `auth.ts`/`system-manage.ts`/`route.ts` | rev2 新增端點 wrapper |
| **BASE-WEB-BUILD-CONFIG ★ 已授** | L4 build infra | `build/plugins/router.ts` 加 `pageExcludePatterns`、**嚴格限隱藏 demo menu** | （已授權、as-built **未動用**——base-web 全樹無 `pageExcludePatterns`，rev2 022 plan Constitution Check 明記「本波不配」；且依 §9.3 拍板 §11.5 (b'-narrow)，`document`/`exception` 等 customRoutes 本非此機制可隱藏對象） |
| **MODAL-WIRING ★ 已授**（v1.0.0 授 (a) 初版、v1.2→v1.6 五次擴邊） | L4 view inline | `views/manage/**` **五用途**：(a)`// request` placeholder 接線（含 index.vue delete handler，v1.2.0 擴）(b)按鈕 `hasAuth()` 可見性 gating（v1.3.0）(c)同模式新權限 modal+trigger（v1.4.0）(d)選單復原/re-parent 維運控制（v1.5.0）(e)同 manage 範式新管理頁（v1.6.0）；**絕不擴張到其他 inline** | CRUD modal 接線、`*-auth-modal.vue`、menu 回收桶+restore、（rev2 029）admin 管理頁 |
| RUSTAPI-SOURCE-ISOLATION | rust-api 整棵樹 | 全新寫；設計繼承 rev1、code 不拷貝（例外清單見 §I.5）；research 不准 grep rev1 source | 整個 rust-api workspace |

- L 級語意（rev2 軌道定義）：L1=`.env` / L2=typings 新檔 / L3=service 新檔 / L4=build 配置或 view inline；★=需 constitution 顯式授權（本基線已授）。
- 注：rev2 設計文件曾標 WRAPPER「L3 需授權」、constitution §III.1 列其為**預設可動**——凍結權威為準，rev3 承接 constitution 版。
- ★ 軌道每改一處的 spec 義務：紀錄 file:line + 改動內容 + upstream 衝突風險評估；共用元件改動 MUST 用附加 prop + 安全預設（不變既有呼叫端行為）。

### §9.5 amendment 流程 + 版本規則
- **流程**（constitution §V.2，rev3 對應）：提案（在本書對應章＋附錄 G 登記：改哪節／為何／影響）→ **user 親決**（Claude 不主動 amend）→ 凍結（更新 constitution-rev3 + bump version + 回填本書）→ **獨立 commit** `docs(constitution): amend <條目>...`。
- **版本規則**（§V.3）：**MAJOR**（2.0.0）=鐵紀律（§I）改變、§II 拍板撤回、★ 軌道授權撤銷；**MINOR**（1.1.0）=新拍板項固化、軌道授權邊界擴展、新增 ★ 軌道；**PATCH**（1.0.1）=文字校正、釐清、reference 更新、Compliance Check 增補。
- **rev2 版本史一行**：v1.0.0（2026-05-28 凍結）→ v1.6.0（2026-06-06）共 **9 次 amendment** = 6 MINOR（v1.1.0 新增 §I.6 審計欄標準；v1.2.0/1.3.0/1.4.0/1.5.0/1.6.0 五次皆 MODAL-WIRING 邊界擴展）+ 3 PATCH（v1.2.1~v1.2.3 文字校正）。
- ⚠️ rev3 啟示：MINOR 的 5/6 集中在 MODAL-WIRING「窄邊界 + 逐次擴邊」——此演進模式可運作且留下完整授權軌跡，建議 rev3 沿用（先授最窄用途、需要時 amendment 擴），而非一次開大 L4 授權面。

### §9.6 §IV Compliance Check 8 題（快照全文；spec-kit `/speckit-plan` 用）
`/speckit-plan` 步必須對照 constitution 跑 Constitution Check，逐項 yes/no（原文快照；rev3 重鑄時「§II 12 拍板」指涉隨 §9.3 表同步；Q5 的「rev1」應改寫為 rev3 對 **rev2 source** 的隔離／參照立場——重鑄時 user 親決、併 ⚠️g）：
1. **此 plan 是否違反 §I.1 base-web 為權威紀律？** rust-api 是否未提供 base-web 用到的對應 endpoint？
2. **此 plan 是否動到 base-web inline？** 若是、屬哪條 ★ 軌道？授權邊界內？
3. **此 plan 涉及 menu 顯示是否走 Casbin enforce？**（§I.2）
4. **此 plan 的 wire 設計是否對齊 §I.3 mock ground truth？**（envelope / id 型 / error code / enum）
5. **此 plan 是否從 rev1 source 拷貝 code？** 若是、屬 §I.5 例外清單嗎？
6. **此 plan 是否凍結到 §II 12 拍板項？** 任一拍板需改變、必先走 Amendment 流程
7. **此 plan 是否觸及 §III ★ 軌道？** 若是、在授權邊界內？
8. **此 plan 是否新建業務表（create migration）？** 若是，是否含 §I.6 六審計欄？append-only / join 表是否依 §I.6 例外處理？

任一檢查不通過 → plan 須回 brainstorm 或申請 Amendment（§9.5）。

---
## §10 — 安全與合規

【目的】把散在各處的安全主題收一章；RBAC 機制本體在 §5.3，此處是「安全姿態」總覽。

### §10.1 存取控制
- **RBAC enforce**：機制本體見 §5.3（`casbin_rule` 單表三維度、matcher 三欄精確相等、無 glob、`R_SUPER` 逐端點列無 `*` subject）；`enforce_mw` per-route 掛載、subject = **DB-fresh role code**（非 JWT claims；`server/src/auth/enforce.rs`）。
- **JWT bearer 驗證鏈**（`auth/bearer.rs` → `auth/jwt.rs`）：`bearer_token`（case-sensitive `Bearer ` 前綴、trim、空 token=None）→ `jwt::verify`（HS256、`leeway=0` 杜絕剛過期仍過、驗 signature+exp+aud；`iss` 不驗——iss==aud==代號值（rev2=`"rev2-admin"`、rev3 改 `"rev3-admin"`，附錄 A.2）故冗餘）。5 個 callsite 三種失敗策略（bearer.rs 文件化）：**fail-closed**（`enforce_mw`：verify 失敗→3333、但 role-lookup DB 失敗→5003 而非 3333）/ **advisory**（getUserInfo / getUserRoutes / isRouteExist：一律 3333 要求重新認證）/ **best-effort**（`audit_ctx` ctx_mw：None→`operator_id=NULL`、不擋請求）。
- **Super-only 治理端點（rev2 seed 實證，共 17 個、全部不 seed R_ADMIN/R_USER_COMMON）**：（rev2 m021）menu-auth 4（getRoleMenu/updateRoleMenu/getRoleHome/updateRoleHome）・（rev2 m022）button-auth 3（getAllButtons/getRoleButton/updateRoleButton）・（rev2 m023）endpoint-auth 3（getAllEndpoints/getRoleEndpoints/updateRoleEndpoints）・（rev2 m025）選單回收桶 2（getDeletedMenus/restoreMenu）・（rev2 m029）settings 3（getSystemSettings/updateSystemSetting/updateUserSessionPolicy）・（rev2 m035）policy 回收桶 2（getArchivedPolicies/restorePolicy）。另：user/role/menu **全部寫端點** + menu 讀端點亦 R_SUPER-only seed（rev2 m015/m017/m019/m020）。
- **反鎖死（anti-lockout）**：（rev2 m033）把 16 列 R_SUPER 治理 policy 標 `protected=true`（3 menu 列 manage_menu/manage_role/manage_system-settings + 13 endpoint 列 7 GET+6 POST）——data-driven 不可撤，revoke 命中 → 整批 `Rejected` 零變更（§4.2 invariant ②）。
- **最小預設**：R_USER_COMMON seed 僅 home/function* 展示頁可見（rev2 m010/m022）+ getAllRoles 讀端（rev2 m013）+ 1 個 button 碼；**零 manage_* 治理頁可見性、零寫端點**。

### §10.2 傳輸加密
- **dev 自簽 TLS**：`deploy/generate-dev-cert.sh`（alpine/openssl container、RSA 2048、SAN localhost+127.0.0.1；hybrid 模式——`dev-certs/ca.*` 存在且無 self-signed-marker 時改用外部 CA 簽 leaf）；nginx `dev.conf` listen `21080` + `21443 ssl`。
- **prod 80→443**：`deploy/nginx/conf.d/prod.conf` listen 80 → `return 301 https://$host$request_uri`（僅 `location = /health` 在 :80 直回 200 供 healthcheck）；443 ssl 讀 `/etc/nginx/certs/{fullchain,privkey}.pem`（named volume `front_nginx_certs` 先 seed）；acme.sh skeleton 走 `--profile prod`（`deploy/Dockerfile.acme.txt`），實際簽發待真實 domain。
- 對外（0.0.0.0）僅 front-nginx 單入口、TLS 終止於此（§11.1）；其餘 service 走內網 compose network（rev2=`rev2_net`、rev3=`rev3_net`，附錄 A.3），惟 postgres / redis-stack 於 prod 仍保留 `127.0.0.1` loopback host port（`25432`/`26379`，host 管理用）、rust-api prod 無 host port；rust-api `/metrics` 對外路徑被 nginx exact-match 擋 404（`_locations.inc`）。

### §10.3 靜態 / 機密
- **secrets `_FILE` pattern**：8 個 secret 檔由 `deploy/generate-secrets.sh` 一鍵產（5 leaf：jwt_secret / refresh_token_secret / postgres_password / redis_password / grafana_admin_password + 3 URL：database_url / redis_url / cleanup_database_url）；compose 頂層 `secrets:` 區塊掛 `/run/secrets/*`、rust-api 經 `APP_*_FILE` envvar 讀；`.gitignore` 排除 `deploy/secrets/*.txt`（僅 `.example` 入 repo）——secret 不入 image、不入 repo。
- **secret strict validation**（`server/src/config.rs`）：`load_secret` 採 `<KEY>_FILE` > `<KEY>` 優先序；`validate_secret` 三段拒收：空值 → placeholder 黑名單（case-insensitive **等值**比對：change-me / changeme / secret / xxx / `<TO_BE_SET>` / TODO）→ **長度 < 32 拒**。無熵估算——強度由生成端保證（`openssl rand -base64 48`，64 chars）。
- **密碼**：argon2id PHC 字串（`auth/password.rs`，`Argon2::default()` + 每次隨機 salt；同 plaintext 每次 hash 字串不同、皆可驗）。
- **AES-256 靜態加密**：rev2 無；取捨集中 **§2 新能力決策包**（待決⑥）——rev3 v1 建議磁碟/tablespace 層、欄位級 defer；面定義見 §5.10。

### §10.4 審計 trail
- **三 log append-only**（archetype B，§3.2）：`sys_operation_log` / `sys_access_log` / `sys_login_attempt`——無 update/delete 路徑、facade 只暴露 insert（`write` / `write_in_txn`，各表僅此一個 pub fn；rev2 亦無 log 讀端點），不可竄改。
- **操作審計鏈原子性**：mutation 必經 `audit::mutate_in_txn`（`server/src/model/audit.rs`）泛型 wrapper——業務寫 + before/after 快照 + operator + trace_id **同 txn**（§5.2）；治理寫 revoke/restore 與審計同 txn（§4.2 invariant ④）；敏感欄經 `AuditSerialize` redact 成 `"<redacted>"`。
- **HTTP 軌**：`audit_ctx` 全域中介層對**已認證請求**（bearer verify 成功）寫一列 `sys_access_log`（best-effort、寫失敗不擋請求）；public 路徑 / health / 驗證失敗請求刻意不記（單一 operator gate、無 path 排除清單）；login 每個終端路徑 exactly-one 列 `sys_login_attempt`（成功或失敗皆記，`handler/auth.rs`）。

### §10.5 合規姿態
- rev2 = 自架單租戶 admin、無對外 PII 收集 → 無 GDPR/HIPAA 義務；審計 trail（§10.4）+ soft-delete 歷史保留（§5.1）已給基本可追溯性。
- rev3 若對外 / 多租戶 → 需補：資料保留期（目前僅 ops 面有 retention——loki 72h / prometheus 15d；**DB 三 log 表無 retention 機制**）、刪除權（soft-delete ≠ 抹除）、PII 欄標記（`user_phone` / `user_email`，與欄位級加密同批取捨）。**待決⑥（§2 第 4 項）**。

---

## §11 — 部署與運維 (薄、多引用)

【目的】部署 as-built 總覽；細節引用 compose / `deploy/` 檔與他章，不重複內容。

### §11.1 拓撲 / port / secret
- 單入口 front-nginx（TLS 終止 §10.2；`location /api/` 剝前綴轉 rust-api、`= /api/metrics` 擋 404，`deploy/nginx/conf.d/_locations.inc`）；其餘 service 不對外（0.0.0.0）暴露——dev 經 `127.0.0.1` loopback 直連，postgres / redis-stack 的 loopback 映射在 prod 仍保留（host 管理用）。compose project name：rev2=`rev2-admin`、rev3=`rev3-admin`（附錄 A.3；卷名 auto-prefix 規約沿用）。
- port（host 映射；rev2 用 2XXXX 前綴與 rev1 並存，**rev3 改名觸點見附錄 A**；port 號是否沿用 2XXXX 由 rev3 workspace 另定）：

| service | host port | 備註 |
|---|---|---|
| front-nginx | `21080`（HTTP）/ `21443`（HTTPS） | prod 直用 `:80`/`:443` |
| base-web | `21079` | dev 直連；prod 經 nginx 轉內網 `:21079` |
| rust-api | `21081` | dev 直連用 |
| postgres / redis-stack | `25432` / `26379` | 容器內仍 `:5432`/`:6379` |
| grafana / loki / prometheus / pushgateway | `23000` / `23100` / `23090` / `29091` | profile-gated（§11.2） |
| alloy・postgres_exporter・redis_exporter | 無 host port | 內網 `:12345`/`:9187`/`:9121` |

- 3 種啟動模式：**dev**（`-f docker-compose.yml -f docker-compose.dev.yml`，127.0.0.1 loopback、自簽 TLS、直連 backend port）/ **prod baseline**（`-f docker-compose.yml -f docker-compose.prod.yml`，0.0.0.0、80→443、acme 不啟）/ **prod+acme**（再加 `--profile prod` 啟 acme skeleton）。
- secret 注入機制見 §10.3（8 檔 `_FILE` pattern，dev/prod 同一套）。

### §11.2 observability 三段式（profile-gated、一般 `up` 不啟）
- **obs-min**（`profiles:["obs"]`，rev2 031）：loki（log 儲存、72h retention）+ alloy（docker-SD 讀 docker.sock 採集全容器 stdout）+ grafana。
- **obs-full**（`profiles:["metrics"]`，rev2 032）：prometheus（TSDB retention 15d）+ postgres_exporter + redis_exporter + pushgateway；exporter reuse 既有 postgres/redis secret、**無新 secret**。
- **dashboard**（rev2 033）：grafana provisioning as-code（`deploy/grafana-provisioning/`：datasources loki+prometheus、alerting rules、6 片 dashboard json = master-overview / rust-api / postgres / redis / audit-log / cleanup-job）；grafana 跨掛 `profiles:["obs","metrics"]`（兩段共用 UI）。

### §11.3 背景工作
- **policy_watcher / settings_watcher**（`server/src/auth/{policy_watcher,settings_watcher}.rs`）：各自 `tokio::spawn` 長駐 + **獨立 pub-sub 連線**（`get_async_pubsub`，非共享 `ConnectionManager`——subscribe 態連線不能跑普通命令）；分別訂閱 `casbin:policy:invalidate` / `settings:invalidate`（§5.6），斷線 backoff 自動重訂；publish 端走共享連線。
- **cleanup-job**（rev2 030，獨立 workspace crate `cleanup-job/`）：on-demand one-shot binary（compose `profiles:["jobs"]`、host cron / 人工觸發、一般 `up` 不啟）；物理刪 `expires_at < now()-60s` 的 `sys_token` 列（`SKEW_MARGIN_SECS=60`、與 status 無關，§4.1 invariant ④）；**預設 dry-run、`--execute` 才真刪**；完跑推 pushgateway metrics（含 `cleanup_job_last_success_timestamp`）。

### §11.4 DB migration 自動套
- **migrate service**（rev2 010；`docker-compose.yml` 內 one-shot service、`restart: "no"`）：rust-api `depends_on: migrate: service_completed_successfully` → **stack 起即套 migration；server 自身不自動 migrate**（rev2 007 FR-009）。
- override 分工：dev = `entrypoint: ["cargo","run","--bin","migration"]` + `command: ["up"]`（dev image ENTRYPOINT 是 cargo-watch、須整段換）；prod = runtime image `command: ["migration","up"]` 經 `deploy/entrypoint.rust-api.sh` dispatcher 派發。
- `migration/` crate 35 個 migration、每個有對稱 `down()`（rev2 實況）；rev3 沿用「migrate one-shot service＋每 migration 對稱 `down()`」**結構**（migration 內容重寫、條數另計，§3.4；檔名方案見 ⚠️k），目標**零事後 ALTER**（建表即帶全審計欄 + 治理欄）。

---

# 附錄

## 附錄 A — rev2→rev3 命名映射

> 實掃（`grep -rl 'rev2'`，2026-06-11；設定/部署/文件層、排除 `docs/` 歷史與 `specs/`）：外層 **16 檔**（含易漏的 `.gitignore`、`.dockerignore`〔源倉排除列〕、`README.md`〔stale 卷名〕。另 `tests/` 8 檔與 `.specify/wf-spec-review-006-013.js`〔硬寫 workspace 路徑〕含 rev2，屬測試/一次性腳本、刻意不入表）+ base-web worktree 5 檔 + rust-api worktree 7 檔 + `constitution.md`。`.claude/`（settings.json / hook-git-submodule-SOP.sh）經全目錄 grep **零觸點**、免改。

### A.1 外層 workspace（16 檔）

| 檔案 | rev2 觸點 | rev3 改法 |
|---|---|---|
| `.gitmodules` | `branch = rev2-admin-base-web` / `rev2-admin-rust-api`；base-web `url = …/fork260509-soybean-admin-base.git`（倉名無代號、可沿用）、rust-api `url = …/fork260509-rev2-anew-rust-api.git` | 分支改 `rev3-admin-*`；⚠️ rust-api 源倉名本身含 rev2 → 建議 rev3 重寫起新倉（或沿用倉、僅換分支） |
| `.gitignore` + `.graphifyignore` + `.dockerignore` | 源倉排除列 `fork260509-rev2-anew-rust-api/` + worktree 註解 | 隨源倉 / 分支命名同步 |
| `CLAUDE.md` | 68 行（branch 名、project name、port 表、其內部 §8 操作參考） | rev3 workspace 重寫此檔（非逐字替換） |
| `README.md` | `docker volume rm rev2_bw_node_modules`（卷名本就 stale — rev2 006 後實際卷名 `rev2-admin_base_web_node_modules`） | 換代號、順手校正 stale 卷名 |
| `docker-compose*.yml`（master + dev/prod override + 2 standalone，共 5 檔） | top-level `name: rev2-admin`（= project name、**volume prefix `rev2-admin_*` 唯一來源**；as-built 無 `COMPOSE_PROJECT_NAME` env，rev2 CLAUDE.md（其 §8.2）的 env-var 表述與 as-built 略異）、image `rev2-admin-rust-api:{dev,latest}`・`rev2-admin-base-web:latest`（dev base-web 跑 stock node image、無 `:dev` tag）、network `rev2_net`、container_name | `name: rev3-admin`（volume prefix 自動換）+ image / network / container 名全換 |
| `deploy/generate-dev-cert.sh` | CA CN `rev2-admin-root dev CA`、`rev2-dev-ca.crt` | 換名 + 重生 dev CA |
| `deploy/generate-secrets.sh`、`deploy/acme-entrypoint.sh` | 純註解（acme 註解寫 `rev2_front_nginx_certs`，與實際卷名 `rev2-admin_front_nginx_certs` 不符、本就 stale） | 換代號、順手校正 stale 註解 |
| `deploy/alloy-config.alloy` | relabel `regex = "rev2-admin"`（compose_project 隔離 — **runtime 行為**） | 改 `rev3-admin`，否則 alloy 一條 log 都採不到 |
| `deploy/grafana-provisioning/dashboards/json/audit-log.json` | LogQL `compose_project="rev2-admin"`（**runtime 行為**） | 同步換，否則 audit-log 板全空 |

### A.2 worktree 層（base-web 5 檔 + rust-api 7 檔）

| 檔案 | rev2 觸點 | rev3 改法 |
|---|---|---|
| base-web `src/service/api/rev2-system-manage.ts` | **L3 WRAPPER 檔名本身**（constitution §III BASE-WEB-WRAPPER 明文「一律新檔（`rev2-` 前綴）」） | 改 `rev3-*` 前綴 ⇒ **constitution 三處字面（§III `rev2-*.ts` 前綴規則、§III 與 §I.3 各一處 `rev2-extra.d.ts` 例示）須隨 rev3 constitution 重鑄改寫** — 唯一「改檔名 = 改憲法」觸點 |
| base-web `src/service/api/index.ts` | `export * from './rev2-system-manage'` | 隨檔名同步 |
| base-web `src/typings/api/system-manage.d.ts`、`.env.test` | 共 4 處註解（`rev2 additive, no mock` / BASE-WEB-ADAPT 來源說明） | 註解換代號 |
| base-web `x_fork.branch-origin.md` | 敘事性 rev2 字樣（分支來源紀錄） | 不阻塞、批次換 |
| rust-api `server/src/auth/jwt.rs` | `JWT_ISS` / `JWT_AUD` = `"rev2-admin"`（**JWT claims 驗證值、runtime 行為**） | 改 `"rev3-admin"`；既發 token 全失效（greenfield 部署無害） |
| rust-api `server/src/auth/bearer.rs` | 測試 const `AUD`/`ISS` = `"rev2-admin"` | 隨 jwt.rs 同步 |
| rust-api `sea-orm-adapter/src/adapter.rs` | `#[ignore]` 測試說明 `--network rev2-admin_rev2_net` | 隨 compose network 名同步 |
| rust-api 純註解 4 檔（`auth/enforce.rs`・`sea-orm-adapter/src/action.rs`・`xdb/src/searcher.rs`・`x_fork.branch-origin.md`） | 敘事性 rev2 字樣 | 不阻塞、批次換 |

> 註：constitution §III 例示的 `src/typings/api/rev2-extra.d.ts` **實際未建檔**（rev2 增量 type 實際 additive 落在既有 `typings/api/system-manage.d.ts`）——rev3 沿用前綴規則時只剩規則文字、無實檔包袱。

### A.3 短名 / 長名總表（沿 rev2 workspace 命名分工慣例）

| 層 | rev2 | rev3 |
|---|---|---|
| outer repo / default branch | `fork260509-rev2` / `rev2-admin-root` | ⚠️ 新倉名 / `rev3-admin-root` |
| worktree 短名（檔案層） | `base-web` / `rust-api` | 沿用 — 短名無代號、**零改** |
| 長名 branch / compose service（服務層） | `rev2-admin-base-web` / `rev2-admin-rust-api` | `rev3-admin-*` |
| compose project + volume prefix | `name: rev2-admin` → `rev2-admin_*` | `name: rev3-admin` → `rev3-admin_*` |
| image / network / JWT iss·aud | `rev2-admin-*:tag` / `rev2_net` / `"rev2-admin"` | `rev3-admin-*:tag` / `rev3_net` / `"rev3-admin"` |

## 附錄 B — rev2 方法論 post-mortem（四原則的由來）

> **完整性五判準**：① 明示預設範式 ② 明示例外（行為島）③ 每部分用對鏡頭 ④ 凍結不變式 ⑤ as-built 誠實。**rev2 有 ④⑤、缺 ①②③**——這是它「能跑但設計書失準」的全部原因；下表即缺 ①②③ 的實證清單。

| 痛點 | rev2 實證（rev2 史料可查，附錄 D） | 對應原則（§0.2） |
|---|---|---|
| **DAG 失準 — 排程被當依賴** | 治理層在 rev2 設計文件列 **Phase 3 #6**，該 Phase header 自註「#6 受管 RBAC = 獨立 deferred 治理軌道」；實際以（rev2 034/035，皆 2026-06-09 merge）落地，晚於 Phase 4 主流業務（rev2 016-025）、Phase 5（✅ 06-06）、Phase 6 觀察性（rev2 031-033）（✅ 06-08）**全部完成之後** — 「Phase 3」編號與真實依賴序 / 交付序徹底脫鉤 | ③ 三序分離（§1.5+§8）：依賴序凍結、交付序明示可變、不共用一張圖 |
| **行為島誤分類** | 治理層被當「又一張 casbin 表」混入 CRUD 排程；直到（rev2 034）落地才親驗 stock adapter column-scoped（`ptype,v0..v5`）、推翻「必 fork adapter」前提（rev2 翻案紀錄）— 行為密集模組用資料鏡頭設計，形狀最晚才定 | §0.1 行為島例外宣告 + §4 state-machine 鏡頭**第一輪**設計 + ④ 治理獨立一刀（§8.2） |
| **schema 後補（retrofit 債）** | `sys_user`：（rev2 m003）只加 `deleted_at`、其餘 5 審計欄拖到（rev2 m014，11 個 migration 的洞）+ 被迫 raw SQL 事後補 BIGSERIAL；`sys_role` 重演（rev2 m006 → **m016**）；`casbin_rule` 治理欄（rev2 m031）才 bolt-on（詳 §3.4） | ① 資料模型脊椎：§3 先設計先凍結、建表即帶 archetype 全欄 |
| **面被攤成增量 rollout** | soft-delete / audit 接線「隨各寫端增量完成」（rev2 Phase 2 掛帳紀錄）：soft-delete 分批（rev2 009/018/019）、audit Insert/Update 隨（rev2 017-020）補裝、Restore 隨（rev2 025） — 橫切面變成多 feature 的尾巴、覆蓋狀態靠事後盤點 | ② 面矩陣（§5）：設計一次、每 entity 繼承、§5.0 逐格打勾 |
| **橫 phase 切碎 entity** |（rev2 016）一 feature 改兩 entity（user+role 審計 retrofit）；menu 散落（rev2 014/019/020/021/025）五個 feature — 單 entity 端到端整合最晚才被驗證 | ④ 縱切交付（§8）：一 entity 一刀、所有面一次碰頭 |

結論：四原則非方法論偏好，每條皆由上表至少一個 rev2 實證痛點反推而來。

## 附錄 C — schema smell 清單（rev3 開局即避）

| smell | rev2 實證（file / migration） | rev3 對策 |
|---|---|---|
| **全庫零 FK** | 12 表無任何 FOREIGN KEY（rev2 live 稽核逐表確認，連 `sys_user_role` join 表亦無；RI 全靠 application） | §3.1 ⚠️ 選擇性 FK（join 表加、log/token/casbin 維持零；**待決④**）；未加處義務集中明列 §3.3 |
| **治理欄對 adapter 隱形** | `casbin_rule` 的 `protected`/`created_at`/`created_by` 於（rev2 m031，`alter_casbin_rule_governance`）事後 bolt-on；免 fork adapter 純因 stock `sea-orm-adapter` 恰好 column-scoped — 「隱形」是被迫的倖存設計 | §3.4 ③ 治理欄建表即含；§4.2 治理島第一輪用 state-machine 鏡頭設計，不靠倖存巧合 |
| **code-guard → data-driven 遲到** | 種子選單保護初版 = in-code `is_seed_menu` 純函式（rev2 020 引入）+ base-web 硬寫 `SEED_MENU_ROUTE_NAMES`；（rev2 034）才以（rev2 m033，標 16 列 casbin `protected`）+（rev2 m034，`sys_menu.protected`、標 7 列）退役 4 個 rust caller（US2）與前端硬寫清單（US5） | 保護屬性 = 資料（`protected` bool），建表即帶（附錄 F #3/#10；#11 archive 為 D-buffer 變體、無 protected 欄）；不寫 code 常數清單 |
| **migration 檔名零串易誤抄** | rev2 live 稽核時 6 表 8 條「指派路徑」多打一個 0 寫成 7 位數（如 `m20260529_0000028`），實檔為 6 位數（`m20260529_000028`）— 非 drift、純引用筆誤，但證明長零串檔名抄錄必錯 | 引用 migration 一律自 `migration/src/` 實檔名複製；⚠️ rev3 建議改短編號檔名（如 `mNNN_<name>`） |
| **`system_settings` 命名外掛** | 唯一非 `sys_*` 命名的自建業務表（rev2 m028 建；`casbin_rule` 為 adapter 標準名、`seaql_migrations` 為框架內部表，另計）；PK = `setting_key` varchar(64) 無序列 — 命名 / 形狀皆獨樹一格 | §3.0 已載：沿用 rev2 不改（wire / seed 連動成本 > 命名美觀）；rev3 **新增**表一律 `sys_*` 單數 |

## 附錄 D — rev2 史料對照（全書 rev2 文件引用的唯一對照處）

> 本書所有 rev2 文件名引用僅為出處紀錄（卷首慣例）；該等檔案存於 rev2 repo（fork260509-rev2 及其 worktree），**不隨本書移植**。事實主張已於 2026-06-11 機器驗證、結論自含於本書——在 rev3 repo 內無需回查即可使用；需重驗時回 rev2 repo 按本表索引。

| 本書章 | rev2 史料來源 | 移植策略 |
|---|---|---|
| §0 前言與方法論 | 新作（由附錄 B 反推） | — |
| §1 範圍與系統大圖 | mock 稽核（MOCK-COVERAGE-AUDIT）+ rev2 設計文件 §3；§1.5/§1.6 = as-built 校正 + Cargo.toml／package.json／compose 實機 | 已內化（結論自含） |
| §2 新能力決策包 | 新作（本書整併定稿） | — |
| §3 + 附錄 F | 12 表 live DDL 稽核（REVIEW-DATABASE，2026-06-09 零 drift）+ 35 migrations 源碼 | 已內化；重驗回 rev2 repo |
| §4 行為島模型 | rev2 specs 026-030／034-035 + 設計文件 §6／§11 | 已內化 |
| §5 面矩陣 | rev2 設計文件 §1／§6 + constitution §I.3／§I.6 | 已內化 |
| §6 前端 UI/UX | mock 稽核 + constitution §III + rev2 軌道定義 | 已內化 |
| §7 wire contract | rev2 設計文件 §3／§9 + mock 稽核 + REVIEW-014-026（025-I1 事件） | 已內化 |
| §8 交付計畫 | rev2 設計文件 §10 + MILESTONES §1（35 item 實際時序）+ rev2 workspace 工作流 | 已內化（量級錨＋工作流摘要）；**波 -1 機械建構規格〔CLAUDE.md／hook／spec-kit 殼〕仍須回 rev2 repo 取底本** |
| §9 凍結基盤 | constitution v1.6.0 全檔快照 | **快照承接**；constitution-rev3 凍結後本章降為歷史對照 |
| §10 / §11 | constitution + rev2 設計文件 §6／§8 + specs 013／022-024 + compose／deploy as-built | 已內化 |
| 附錄 A / B / C | workspace 實掃（2026-06-11）／ MILESTONES + rev2 Phase 紀錄 ／ live 稽核 + migration 源 | A = one-shot（移植執行完即退役）；B/C = 已內化 |

## 附錄 E — ✓ Google-5 覆蓋 gate

> 外部主題清單只作本附錄的一次性覆蓋檢查（借主題、不借順序），正文不再標注；「對映本書」欄已對齊本書章節結構。

| Google 主題 | 對映本書 | 狀態 |
|---|---|---|
| 1 Functional Requirements | §1 能力清單 + §5.8 search/filter/pagination（橫切）；dashboard / reporting = **待決⑥**（§2） | 勾（待決⑥拍板後復勾） |
| 2 System Architecture | §1.5 層級 DAG + §1.6 技術棧 + §11 部署與運維 | 勾 |
| 3 Database Design | §3 資料模型脊椎（當全書脊椎位、非 bucket#3）+ 附錄 F 字典；FK = **待決④** | 勾（待決④） |
| 4 UI/UX Design | §6（base-web 為權威 → inventory / flows / 軌道接線） | 勾 |
| 5 Security & Compliance | §10 安全姿態 + §5.3 RBAC enforce + AES at-rest / 合規（**待決⑥**、§2） | 勾（AES / 合規待決） |

## 附錄 F — 完整資料字典（12 表；審計欄走 §3.2 archetype、此處只列「身分 + 業務 + 索引」）
> 全表零 drift（rev2 live-audit 2026-06-09；史料對照見附錄 D）。12 表全數為 rev3 v1 沿用、無新增表（§2 結論）。

| # | 表 (欄數) | PK / 序列 | 身分 + 業務關鍵欄（型別） | 索引 / 約束（PK 外） | 審計 archetype |
|---|---|---|---|---|---|
| 1 | `sys_user` (16) | `id` bigint BIGSERIAL | `user_name` varchar・`password` varchar(argon2id PHC)・`nick_name`・`user_gender` smallint・`user_phone`・`user_email`・`status` smallint・`current_session_id` varchar(36)・`session_policy` varchar(20) NN default `'inherit'` | **partial-uniq** `user_name WHERE deleted_at IS NULL` | A 業務 |
| 2 | `sys_role` (12) | `id` BIGSERIAL | `code` varchar・`name`・`role_desc`・`status` smallint・`home` varchar | **partial-uniq** `code WHERE deleted_at IS NULL` | A 業務 |
| 3 | `sys_menu` (28) | `id` BIGSERIAL | `parent_id` bigint・`route_name`・`menu_type` smallint(1=dir/2=menu)・`menu_name`・`route_path`・`component`・`icon`/`icon_type`・`i18n_key`・`"order"` int・`status`・`hide_in_menu`/`keep_alive`/`constant`/`multi_tab` bool・`href`・`active_menu`・`fixed_index_in_tab`・`query` **jsonb**・`buttons` **jsonb**・`protected` bool NN default false | **partial-uniq** `route_name WHERE deleted_at IS NULL` | A 業務 + D 治理(`protected`) |
| 4 | `system_settings` (10) | `setting_key` **varchar(64) PK**(無序列) | `setting_value`・`value_type`(e.g. `enum:on,off`)・`description` | 無（PK 本身總體唯一；無 partial-uniq，§3.2 例外注） | A 業務 |
| 5 | `sys_user_role` (2) | **複合** `(user_id,role_id)` | — | 無（硬刪） | C-join（零審計） |
| 6 | `sys_token` (9) | `id` BIGSERIAL | `user_id`・`token_hash` varchar(64)・`rotation_chain` varchar(36)・`status` varchar(20)・`issued_at`/`expires_at`/`used_at` tstz（全欄 NOT NULL，唯 `used_at` nullable — NULL 語意進 §4.1 fail-closed 判定） | **uniq** `token_hash`・partial `user_id WHERE status='active'`(非uniq)・`rotation_chain`・`expires_at` | C-狀態機（僅 created_at；§4.1） |
| 7 | `sys_operation_log` (10) | `id` BIGSERIAL | `operation` varchar(20)・`entity_table` varchar(64)・`entity_id` bigint・`payload_before`/`payload_after` **jsonb**・`operator_id`・`operator_ip` **inet**・`trace_id` varchar(64) | 無 | B append-only |
| 8 | `sys_access_log` (10) | `id` BIGSERIAL | `operator_id` NN・`method`/`path` text・`http_status` int・`client_ip` **inet** NN・`x_forwarded_for`・`region`・`trace_id` text | 無 | B append-only |
| 9 | `sys_login_attempt` (9) | `id` BIGSERIAL | `attempted_user_name` text・`success` bool・`operator_id`・`client_ip` **inet** NN・`x_forwarded_for`・`region`・`trace_id` | `(attempted_user_name,created_at)`・`(client_ip,created_at)`（服務 login lockout 內部查詢） | B append-only |
| 10 | `casbin_rule` (11) | `id` BIGSERIAL | `ptype` varchar(18)('p')・`v0` role-code・`v1` obj・`v2` 維度・`v3..v5` varchar(125) `''`・`protected` bool・`created_at`・`created_by` | **uniq** `(ptype,v0..v5)` | D 治理（adapter-invisible 3 欄） |
| 11 | `sys_casbin_policy_archive` (13) | `id` BIGSERIAL | `ptype`・`v0..v5`(v3-5 default `''`)・`created_at`/`created_by`(原 grant)・`archived_at` NN・`archived_by`・`archive_reason` varchar(32) | `archived_at`・`(v0,v2)` | D 治理-restore-buffer |
| 12 | `seaql_migrations` | framework | (sea-orm 內部；applied 條數＝rev2 實況 35、rev3 依自身 migration 計、不入 §8.8 drift 基線) | — | — |

## 附錄 G — 全書決策紀錄表（唯一清單；user 親決前不入凍結集）

> **編輯紀律**：新增 ⚠️ 必同步登本表；拍板後該列改「✅ 已決（日期）」並回填所在章。「最晚決策點」= 再不決就 block 哪一步。文中「待決⑥」泛指 ⑥a~⑥d 四子項。

| # | 決策點 | 工程預設 ⚠️ | 所在章 | 最晚決策點 |
|---|---|---|---|---|
| 待決① | router 結構：維持 flat-in-main 還是重整 `router/` 樹 | 無強預設（as-built = flat + endpoint_coverage_lint 三源一致 @ 35，運作良好） | §1.5・§8.1 | 波 0 scaffold 前 |
| 待決② | wire contract 機器化（OpenAPI／contract test／維持 grep） | C 輕量 contract test 起步、B 視 endpoint 增速再評 | §7.2 | 波 1 收尾前（首批契約成形時） |
| 待決③ | 縱切第一刀：User 直刀 vs `system_settings` 打樣 | 傾向 A（User 直刀） | §8.3 | 波 1 開工前 |
| 待決④ | 選擇性 FK | join 表（`sys_user_role`）加 FK、其餘維持零 | §3.1 | 第一條 migration 前（波 0） |
| 待決⑤ | §3/§5 凍結邊界：哪些進 constitution、哪些留設計書 | archetype（§3.2）+ 行為島 invariants（§4）+ wire 碼表（§5.4/§7.3）入凍結；欄級字典與常數值留設計書 | §3・§9 章首注 | constitution-rev3 重鑄前（**波 -1**） |
| 待決⑥a | user-facing 儀表板 | rev3 v1 = 固定儀表板、0 新表（§2 表 #1） | §2 | 入波排程時（不 block 波 0-3） |
| 待決⑥b | 報表匯出 PDF/CSV | rev3 v1 = 同步匯出、0 新表（§2 表 #2） | §2 | 同 ⑥a |
| 待決⑥c | AES-256 靜態加密 | rev3 v1 = 磁碟/tablespace 層（§2 表 #3） | §2 | prod 部署定稿前（加密卷屬部署期決策） |
| 待決⑥d | 合規姿態升級 | 維持現姿態（§2 表 #4） | §2 | 對外／多租戶觸發時 |
| ⚠️a | 效能／可用性數字 | p95 300/500ms/1s；99.5%/月 | §1.3 | 波 1 驗收前 |
| ⚠️b | 審計查詢讀端 + UI 補做 | 補（Super-only；矩陣已預標 ⚠️） | §1.2・§5.0 | 波 2 排程前 |
| ⚠️c | `/auth/error` | 維持不做 | §1.4 | 不阻塞（預設即不做） |
| ⚠️d | redis-stack image tag | 建 stack 當下即 pin 數字版 | §1.6 | 波 0 compose 定稿前 |
| ⚠️e | `5000` 的 HTTP status 配對 | rev3 拍板（200 信封 or 啟用 500 mapping）並入 contract test | §5.4・§7.3 | 波 0 envelope 實作前 |
| ⚠️f | 13 碼矩陣整組凍結（含 4 保留碼） | 沿用整組 | §7.3 | 同 ⚠️e |
| ⚠️g | constitution 重鑄措辭（§I.5 `axum-casbin`＋§9.6 Q5 rev1 指涉） | `axum-casbin` 重鑄為「enforce 層全新寫（in-tree）」；Q5 改寫為對 rev2 source 的隔離／參照立場（user 親決） | §9.2・§9.6 | constitution-rev3 重鑄時（波 -1） |
| ⚠️h | 排程性拍板重議（§9.3 表之拍板 §11.2/§11.8/§11.13） | 重議走 amendment、不默改 | §9.3 | 重議觸發時 |
| ⚠️i | L4 授權模式 | 沿用「窄邊界 + 逐次擴邊」 | §9.5 | constitution-rev3 重鑄時（波 -1） |
| ⚠️j | rust-api 源倉 | 新倉（rev2 倉名含代號）；或沿用倉換分支 | 附錄 A | **波 -1 第一步**（建 repo／worktree 前） |
| ⚠️k | migration 檔名 | 改短編號（`mNNN_<name>`） | 附錄 C | 第一條 migration 前（波 0） |
| ⚠️l | settings 多 key 熱讀 | 需要時把單鍵 swap 推廣為 keyed map（設計變更、非預設） | §5.6 | 不阻塞（需要時） |
| ⚠️m | §1.2 尾巴（alt-login stub 4 + captcha 2）入波或重議 | 入波（§8.2 待拍板刀位）；重議則走 §9.5 amendment | §1.2・§8.2 | 波 3 排程前 |
| ⚠️n | 三 log 表 DB retention 政策 | rev3 v1 僅容量監控、retention defer | §1.3・§10.5 | 不阻塞（容量警示觸發時） |
| ⚠️o | application-RI 驗證下沉 facade 層 | 維持 rev2 handler 層驗；下沉屬設計變更須明示 | §3.3 | 波 1 facade 設計時 |
| ⚠️p | demo menu 隱藏機制 | 沿用 dynamic mode（免動 BUILD-CONFIG） | §6.1 | 波 0 route mode 定稿前 |
| ⚠️q | worktree 內容起點（base-web／rust-api 帶不帶 rev2 程式碼） | base-web 自 rev2 分支衍生（帶既有接線、A.2 改名後沿用）；rust-api 依 §8 波次從零重寫（A.2 rust-api 列轉 token 對照） | §8.4 波 -1・附錄 A | **波 -1 第一步**（與 ⚠️j 同時） |

---

## 開放問題

**唯一清單 = 附錄 G**（待決①~⑤、⑥a~⑥d 與全部 ⚠️，含工程預設、所在章、最晚決策點）。拍板後：G 列改「✅ 已決（日期）」、結論回填所在章。
