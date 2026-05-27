# INTEGRATION-RESEARCH.md — rev2 整合研究

> **本文件目的**:把 rev1(`fork260509-rev1`)累積的整合研究、設計沉澱與 30 個 superpowers feature 的持久記憶,萃取成 rev2(`fork260509-rev2`,本工作區)能直接繼承的研究基底。
> rev2 已決定**不含 NestJS**(只有 base-web + rust-api 兩個 worktree),走 rev1 的 **DESIGN-B(Rust-only)** 設計權威。本文件對 rev1 每份產物逐一給出「rev2 是否繼承」的判斷與依據。
>
> **研究範圍**:
> - `fork260509-rev1/docs/*.md`(整合研究、設計文件、checklist、graphify notes)
> - `fork260509-rev1/docs/superpowers/*.md`(30 份 feature 持久記憶)
> - `fork260509-rev1/base-web/` git diff `28807d40` → `64af823b`(21 個 commit 演化)
> - `fork260509-rev1/rust-api/` Rust 技術棧與 workspace 結構
> - `fork260509-rev1/deploy/*` + `docker-compose.{,dev,prod,observability}.yml` 容器拓撲
>
> **方法**:5 個並行 Explore subagent 分頭研究 + 1 個補完 subagent + 主 context 整合。
> **研究日期**:2026-05-26。

---

## 目錄

- [§1 全景:rev1 設計骨幹與 rev2 繼承策略](#1-全景rev1-設計骨幹與-rev2-繼承策略)
- [§2 rev1 docs 整合設計研究](#2-rev1-docs-整合設計研究)
- [§3 rev1 30 個 superpowers feature 教訓萃取](#3-rev1-30-個-superpowers-feature-教訓萃取)
- [§4 base-web SHA 演化(28807d40 → 64af823b)](#4-base-web-sha-演化28807d40--64af823b)
- [§5 rust-api 技術棧與 workspace 結構](#5-rust-api-技術棧與-workspace-結構)
- [§6 部署拓撲(deploy/ + docker-compose.*.yml)](#6-部署拓撲deploy--docker-composeyml)
- [§7 rev2 起點行動建議](#7-rev2-起點行動建議)
- [§8 附錄:研究方法與 agent 派遣紀錄](#8-附錄研究方法與-agent-派遣紀錄)

---

## §1 全景:rev1 設計骨幹與 rev2 繼承策略

### 1.1 rev1 三層設計骨幹

rev1 的設計分為三層,彼此服務同一個目標 —— 「base-web(Vue example 分支)+ rust-api(Axum/SeaORM)」的完整整合,期間以 NestJS 作為過渡 bridge:

1. **RESEARCH 層**(`INTEGRATION-RESEARCH.md`):盤點三方 API 表面、endpoint 對齊度、response shape 差異,確立關鍵 GAP:
   - base 期望 `code: "0000"` 字串成功碼,rust 用 `code: u16` HTTP status
   - base 需要 `/systemManage/*` 虛擬前綴,rust/nestjs 都沒原生
   - rust 缺 refresh token endpoint(由 nestjs 補位 → 後來 rust 自實作)
   - 雙方都缺 SMS captcha / batch delete 等功能

2. **DESIGN 層**(雙軌並行):
   - **rev1 DESIGN-A**(`INTEGRATION-DESIGN-A-RUST-NESTJS.md`):過渡期 — rust 主後端 + nestjs 補特定 endpoint,共享 postgres/redis
   - **rev1 DESIGN-B**(`INTEGRATION-DESIGN-B-RUST-ONLY.md`):最終形態 = **rev2 直接起點** — rust 單獨後端,nestjs 退場,redis pub-sub 升為必要(Casbin policy 跨 instance 同步)
   - **rev1 DESIGN-W-BASE-WEB**(`INTEGRATION-DESIGN-W-BASE-WEB.md`):base-web 改動的受管例外框架(三條軌道:rev1 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene)
   - **rev1 DESIGN-W-DEPLOYMENT**(`INTEGRATION-DESIGN-W-DEPLOYMENT.md`):統一容器化部署設計,支援 dev/staging/prod + DESIGN-A/B 軌道切換

3. **執行層**(`INTEGRATION-CHECKLIST.md` + 30 份 `superpowers/*.md`):每個 feature 從 brainstorm → spec → plan → tasks → implement → review 的紀錄,以及每次 acceptance 階段 surface 的 friction / decision 沉澱。

### 1.2 rev2 繼承策略總結

| rev1 產物 | rev2 立場 | 原因 |
|---|---|---|
| rev1 DESIGN-A(NestJS bridge) | **完全捨棄** | rev2 無 nestjs worktree |
| rev1 DESIGN-B(Rust-only) | **設計權威,直接採納** | rev2 起點即 B |
| rev1 DESIGN-W-BASE-WEB(受管例外三軌) | **直接繼承** | base-web 動 UI 需走軌道申請(W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene) |
| DESIGN-W-DEPLOYMENT(部署設計) | **直接繼承,port 改 2XXXX** | rev2 並存於同一台機器,需避開 rev1 1XXXX port 系列 |
| INTEGRATION-RESEARCH(GAP 盤點) | **結論直接採納** | response shape 路線 II、alias router、抽離項 stub 等已拍板,不必重新評估 |
| INTEGRATION-CHECKLIST(進度) | **參考已驗證體例** | rev1 F1–F14 + W-F1–W-F14 + 040–052 已交付,每個 feature 都可查 spec 與實作 |
| GRAPHIFY-NOTES(11 條限制) | **直接繼承** | rev2 跑 graphify 時要同樣警惕 NestJS / Vue / macro 盲點 |
| superpowers/*.md(30 份) | **22 CARRY / 4 REFERENCE / 4 REV1-ONLY** | 詳見 §3 |

### 1.3 rev2 相比 rev1 省掉的工作量

rev2 起點即 rev1 DESIGN-B,可直接跳過:
- NestJS 過渡期所有複雜度(跨服務 JWT 共識、雙重 RBAC enforcement、entrypoint wrapper bridge)
- NestJS service 在 docker-compose 中的 profile gating(rev1 F14 cutover 步驟)
- `nginx TRANSITIONAL` block(rev1 F15 → F29 整個 marker block 機制)
- rev1 F10 / F10.1 / F10.2 三輪 friction surface(對 nestjs verify 邏輯的 alignment)
- rev1 F29 cutover(rev2 不需做)

但**仍需建立**(rust-only 的硬前提):
- redis pub-sub channel `casbin:policy:invalidate`(rev1 F5 起即需,即使 v1 單 instance)
- `sys_tokens` rotation_chain + 舊 token 標 `used`(rev1 F13 rust 自簽 refresh JWT)
- Casbin 動態 policy reload + cached enforcer

---

## §2 rev1 docs 整合設計研究

### 2.1 `INTEGRATION-RESEARCH.md`(rev1 版)

**TL;DR**:研究期最大成果是「三方 GAP 盤點 + 7 個候選方案對比」,確立後端分工策略(rust-only vs rust+nestjs 並用)與 NestJS 補位點清單,為 rev1 DESIGN-A/B 奠定事實基礎。

**rev2 直接採納的研究結論**:

1. **response shape 路線 II**:HTTP 永遠 200,body 內 `code` 為 business code(`0`/`5001` 等 number),`success` bool 標誌成功/失敗。rust struct 全加 `#[serde(rename_all = "camelCase")]` 對齊 base 期望。
2. **多碼成功 / 登出 / expired code 系統**(VITE_SERVICE_SUCCESS_CODE 與相關 code list)由 `.env` 驅動,rev2 直接沿用 rev1 的 code 約定。
3. **`/systemManage/*` alias router 10 條**:thin wrapper 重用 user/role/menu service。特殊約定 — `updateUser` 用 POST(非 PUT)、`batchDeleteUser` DELETE body 傳 id 列表(非 URL param)。
4. **抽離項清單**(`sendCaptcha` / `verifyCaptcha` / `batchDeleteUser` / `/auth/error` 等):以 stub + Casbin gate(多數 role deny / test role allow)處理,慣例為「未實作項也進 menu 表」。
5. **Casbin RBAC 為必要中樞**:不符權限不顯示;runtime 動態 menu + Menu CRUD 並重;menu/role/endpoint Casbin policy 全在 DB(sea-orm-adapter)。

**rev2 捨棄的研究內容**(NestJS 相關):
- nestjs 的 CQRS 模式(rust 直接 service method,無此複雜性)
- nestjs 的 `PrismaAdapter`(rust 用 `sea-orm-adapter`)
- 跨服務 JWT 共識設計(rev1 DESIGN-B 單後端、JWT 自簽自驗)
- nestjs 的 refresh token 實作細節(rust 自實作,見 §3 rev1 F18/F19/F28)

### 2.2 rev1 `INTEGRATION-DESIGN-B-RUST-ONLY.md`(**rev2 的直接權威**)

**TL;DR**:rev2 設計權威。繼承 rev1 DESIGN-A 的原則框架(RBAC 中心、base 不改、soft delete + audit),但「nestjs 過渡補位」簡化為「rust 全部自實作」。redis pub-sub 升格為 P1 必要基礎設施(F5 起點即支援多 replica 水平擴展)。

**rev2 的實作指南**:

```
§2.1 架構圖:nginx 單一入口 → rust-api 唯一後端 → postgres/redis;無跨服務轉發

§3.1 endpoint 分工
  既有對齊:/auth/login, /auth/getUserInfo, /route/*, /user/*, /role/* 等
  rust 自實作(rev1 DESIGN-B v1 新增):/auth/refreshToken
  alias router(10 條):/systemManage/* thin wrapper(重用既有 service)
  抽離項 stub(rev1 F11):sendCaptcha / verifyCaptcha / batchDeleteUser / /auth/error / /mock/getLastTime

§3.2 資源管理(rev1 DESIGN-B 簡化版)
  JWT secret:單一 envvar,rust 內部管理
  sys_tokens 表:rust 主寫主讀,refresh 時 rotation_chain 記錄、舊 token 標 used
  Casbin policy:rust 主寫主讀 + redis pub-sub channel "casbin:policy:invalidate" 必要(rev1 DESIGN-B v1 即支援水平擴展,非可選延遲)
  sys_operation_log:全域 audit,rust 同 transaction 寫

§4.1 GAP 拍板
  B1+B2:改 base .env VITE_SERVICE_SUCCESS_CODE=0(number,路線 II)
  B3:rust camelCase rename_all + 軟刪 + audit
  B4:rust 自實作 refresh token rotation(取代 nestjs 補位)

§6.1 feature 優先序
  P1 基礎設施(rev1 F1–F4):JWT / audit / soft-delete / response-shape(任一順序)
  P2 認證 + 動態 menu(rev1 F5–F6):login / getUserInfo / route + redis pub-sub channel
  P3 主流業務(rev1 F7–F9):manage CRUD + assign-users + alias router
  P4 補位(rev1 F10–F12):rust-refresh-token / stubs / cleanup-job

§7 全功能驗證:rev1 DESIGN-B 已於 2026-05-22 落地並完整驗證(D-1 ~ D-16 16 項測試案全 PASS)
```

### 2.3 `INTEGRATION-DESIGN-W-BASE-WEB.md`(受管例外三軌)

**TL;DR**:base-web 改動的統一權威框架(v1.6.0)。三條互斥軌道把「base 不改」原則的例外明文化、邊界化。

**對 rev2 的指導**:

1. **§1.2 軌道辨識義務**:rev2 新 feature 若改 base-web,必須在 spec-kit `plan.md` 明示屬哪條軌道,否則違 Constitution。

2. **rev1 W-WEBUI 軌道**(`src/views/manage/*`, `src/service/api/system-manage.ts` 的 CRUD 接線 + 授權 modal):
   - 不准動:`src/typings/`、表格 render、router、store、i18n、`.env` 設定
   - 修改授權:W-FW1–W-FW9 共 9 個 feature(rev1 編號 031–038 + 040),已於 2026-05-23 全部交付
   - v1.2.0 amendment 授權「為接通既有後端能力所必需的最小 UI 新增」(如密碼欄),但仍禁版面重構

3. **TS-Typing-Sync 軌道**:`src/typings/api/*.d.ts` 對齊 rust wire 序列化型(如 id: ULID string → i64 number)。rev1 於 048 落地完成。

4. **TS-DepGraph-Hygiene 軌道**:build/dep config(Dockerfile / package.json / pnpm-workspace.yaml)清潔。rev1 於 049 落地完成(直接 devDeps 提升、nodeLinker strict isolation、packageManager pin)。

### 2.4 rev1 `INTEGRATION-DESIGN-A-RUST-NESTJS.md`(歷史脈絡)

**TL;DR**:rev1 過渡期設計,rev2 不採用。仍保留設計理由作為歷史脈絡:

- nestjs 補位 `POST /api/auth/refreshToken`(rev1 F10),前提是「不動 nestjs source」
- 跨服務 JWT 共識:rust 簽 refresh JWT(HS256 + refresh_secret 獨立),nestjs `jwtService.verifyAsync` 驗證
- TokenStatus enum 字串對齊:rust SCREAMING_SNAKE → snake_case 對齊 nestjs(rev1 F10.2)
- 完成於 rev1 F14 cutover 退場

**rev2 應觀察的**:rev1 DESIGN-A 的 nestjs friction 證明「跨服務協作」會 surface 至少 2 輪 alignment(F10.1 + F10.2),rev2 走 rust-only 直接省掉這層 friction。

### 2.5 rev1 `INTEGRATION-DESIGN-W-DEPLOYMENT.md`(部署設計)

**TL;DR**:容器化部署的具體設計方案,統合 rev1 DESIGN-A/B 兩軌與 dev/staging/prod 三環境。rev2 主要繼承 §1.x(部署原則)與 §2(Dockerfile)。

**rev2 直接繼承**:

- docker 容器內編譯(multi-stage Dockerfile)
- docker-compose 運行(單機形態)
- 環境分層(dev/staging/prod 用 base + override 模型)
- rust-api:multi-stage(builder + runtime),同一 image 供 server / migration / cleanup-job 用,entrypoint 區分
- base-web:node builder + nginx runtime,SPA fallback + `/api/*` proxy

詳見 §6 容器拓撲全面研究。

### 2.6 `INTEGRATION-CHECKLIST.md`(58KB)

**TL;DR**:從研究到完成實裝的進度追蹤單一真相。rev1 全部交付(F1 ~ F14 + W-F1 ~ W-F14 + W-WEBUI 031–040 + follow-up 041–052)。DESIGN-B 形態自 F14(2026-05-21)生效。

**對 rev2 的參考價值**:

1. **已完成里程碑清單**:每個 feature 的 outer/rust-api commit SHA、完成日期、spec 位置都有記錄。rev2 若延續 rev1 設計,可直查 rev1 commit 與 spec。

2. **Follow-up Backlog**:
   - 條件觸發 4 條(042-N4 audit latency / 042-N5 dev multi-replica / 048-N1(d) pnpm upgrade / 050-N1 cleanup-binary `SECRET_FILE` pattern)
   - 長期 3 段(rev1 F1.2 JWT key versioning、W-F6b acme.sh 真實 cert、W-F15/16 backup+DR)
   - rev1 W-WEBUI-INIT-DEFENSE(base-web refresh token stale localStorage 防御)

3. **測試規範 C-V(contract-verification)**:編號與驗收方法(curl + psql + CDP browser)已設立,rev2 可沿用。

4. **Constitution 進化歷史**:v1.0.0 → v1.6.0 的 6 次 amendment,每次對應一個新的受管例外。

### 2.7 `GRAPHIFY-NOTES.md`(11 條限制)

**對 rev2 的警示**(graphify 推論前必讀):

1. **NestJS DI 破碎**:22 個 module + ~1900 個 file 孤立 —— rev2 無 nestjs,此限制自動消失。
2. **Vue component composition 破碎**:182 個 `.vue` 孤立,component import 關係無邊。
3. **Rust macro/trait dispatch 漏邊**:
   - `merge_router!` macro 展開的 12 個 call 全漏(initialize_admin_router 只抓 16/28+ 條真實 edges)
   - trait method dispatch(dynamic dispatch)完全抓不到(validator / event payload trait 常漏)
4. **AST EXTRACTED 邊方向不全可信**:同 file fn 互調可能方向反。
5. **Community label 可能失準**:新增 600 nodes 後社群重組,引用時要核對實際成員。

**rev2 指導原則**:graphify 適合 Rust 中層到上層宏觀(call graph、god nodes、cohesion),微觀細節(方向、trait dispatch、macro)與 Vue 部分要直接讀 source 補完。

---

## §3 rev1 30 個 superpowers feature 教訓萃取

### 3.1 分類總覽

rev1 累積 30 份 feature 持久記憶,rev2 繼承分類:

| 分類 | 數量 | feature 編號 |
|---|---|---|
| `[CARRY]` 直接適用 rev2 | 21 | rev1 001, 002, 003, 004, 005, 006, 007, 011, 012, 013, 020, 021, 022, 025, 026, 027, 028, 030 + 延伸 |
| `[REFERENCE]` 概念適用、細節不同 | 4 | rev1 018, 019, 023, 024 |
| `[REV1-ONLY]` NestJS / cutover 專屬 | 5 | rev1 014, 015, 016, 017, 029 |

### 3.2 feature 紀要(P1 基礎設施 — rev1 F001~F004)

#### 001 — response-shape-alignment `[CARRY]`
- **描述**:rust admin endpoint 全 response shape(code / data / msg / ~~success~~)+ camelCase 序列化(`refresh_token` → `refreshToken`)對齊 base 期望
- **教訓**:① DTO 層級 `rename_all = "camelCase"` 優於 per-field rename;② rev1 F4 envelope 是後續所有 API 層的基礎;③ nested struct 各自需 rename_all(**不遞迴**);④ collection 欄位用 `Vec<T>` 不用 `Option<Vec<T>>`(統一空 `[]`)
- **對 rev2**:回應形狀設計直接沿用、無 nestjs layer 故不需 bridge 相容
  - ⚠️ **2026-05-27 修正(audit §4.1 + [followup §1.2](INTEGRATION-RESEARCH-FOLLOWUP.md))**:rev1 envelope 含 `success` bool,但 mock 實機 capture 確認 **無 `success`**,envelope = `{data, code, msg}`;`code` 是 string `"0000"`(非 number)。rev2 對齊 mock,**拿掉 `success`** + `code` 用 string。
- **踩雷**:「rename_all 不遞迴」是常見誤解,多個 nested struct 需逐層檢查

#### rev1 002 — soft-delete-infrastructure `[CARRY]`
- **描述**:7 個業務 entity(user/role/menu 等)從物理刪除改軟刪,加 `deleted_at` column + partial unique index
- **教訓**:① `soft_delete` trait + facade module 必須 **atomic 交付**(單獨改 schema 沒 facade 仍可硬刪);② CI lint 守護 entity 直接 import(`grep` 禁 `use entities::sys_user`);③ Casbin orphan 不動 join row、靠 `find_active` 自然掩蔽
- **對 rev2**:軟刪設計完全適用,facade 模式 best practice
- **踩雷**:`ActiveModel.delete()` API 仍可繞過 facade,需**三重防護**(類型系統 + facade + CI lint)

#### rev1 003 — audit-log-infrastructure `[CARRY]`
- **描述**:INSERT / UPDATE / SOFT_DELETE / RESTORE 路徑統一走 single audit context、`AuditEvent` + `AuditSerialize` trait、敏感欄位 redact(password)
- **教訓**:① schema 升級 4 欄(operation enum / entity_id / payload_before / payload_after JSONB)必須與 service migration 同期;② redaction shallow-only(top-level 替換 `"<redacted>"`);③ HTTP middleware 與 service-level audit 可雙寫、無需去重;④ migration 用 `DEFAULT 'LEGACY'` 相容既有行
- **對 rev2**:audit 紀律是 Principle II 核心,全套直接繼承
- **踩雷**:payload JSONB 對 flat admin entity 足夠,nested 敏感結構需遞迴 redact(未來課題)

#### rev1 004 — jwt-secrets `[CARRY]`
- **描述**:rev1 F1.1 — strict validation(fail-fast empty/placeholder/length<32)+ `_FILE` pattern + `application.yaml` placeholder
- **教訓**:① `validate_jwt_secret()` boot-time panic、無 dev/prod 分支;② `_FILE` precedence over bare envvar;③ `PLACEHOLDER_SECRETS` 黑名單 6 個值;④ `Claims` 11 fields 不改(forward compat 留給 rev1 F1.2 / F10 加字段)
- **對 rev2**:secret 載入機制直接適用,Docker `_FILE` 模式對 rev2 至關重要
- **踩雷**:「`_FILE` 讀失敗仍需驗證 placeholder」,二重驗證缺一不可

### 3.3 feature 紀要(P2 認證 + 動態 menu — rev1 F005~F006)

#### 005 — auth-login-and-dynamic-menu `[CARRY]`
- **描述**:rev1 F5.1 P2 解鎖 — `/auth/login` + `/auth/getUserInfo` + `/route/getUserRoutes` 4 endpoint 整合 e2e
- **教訓**:① endpoint path align(`/auth/getUserRoutes` → `/route/getUserRoutes`);② Casbin enforce 首次啟用、policy seed 必完整;③ login flow 跨 rev1 F1.1 / F2.1 / F3 / F4 四基建;④ TreeBuilder 邏輯 + UserRoute nested 結構需深測
- **對 rev2**:auth 整套流程是 rev2 MVP 必須路徑,無 nestjs 簡化了 bridge 邏輯
- **踩雷**:「Casbin enforce enable 無 policy seed」會整個 flow reject,acceptance test 必須包含 seed 完整驗證

#### 013 — route-guard `[CARRY]`
- **描述**:rev1 F6 P2 — `GET /route/isRouteExist?routeName=<name>` endpoint、全域存在性(sys_menu active+enabled),與 user role 無關
- **教訓**:① 全域存在性 vs user-specific 可訪問性(getUserRoutes)必須區分;② protected endpoint(token-required)但無 Casbin policy(所有 role 可查避免 overengineer);③ handle soft-delete + status filter 必須同時檢查;④ base-web 零改動(既有 wiring 已對齊)
- **對 rev2**:guard 邏輯適用
- **踩雷**:「Casbin policy 的有無」會影響 UX(無 policy 避免退化 403 → 404)

### 3.4 feature 紀要(部署 — rev1 F006/F007/F011/F012/W-F11)

#### rev1 006 — dockerfile-rust-api `[CARRY]`
- **描述**:rev1 W-F1 部署起點 — `rust:1.86-slim-bookworm` builder + `debian:bookworm-slim` runtime、2 binary(server + migration)、加 `/health` endpoint
- **教訓**:① multi-stage build 必須考慮 runtime deps(libssl3 / curl / tzdata);② BuildKit cache mount(`/usr/local/cargo/*` + `/app/target`)加速增量 build;③ non-root user 統一(uid 10001 rust-api);④ `/health` 不走 auth middleware,plain text `"ok"` 回
- **對 rev2**:image 構建流程直接沿用
- **踩雷**:「musl → glibc 切換」需重驗,某些 crate 可能相容性問題(但 rev1 已驗)

#### rev1 007 — dockerfile-base-web `[CARRY]`
- **描述**:rev1 W-F2 — `node:22-slim` builder(pnpm corepack) + `nginx:1.27-alpine` runtime、Vite build with `ARG` override、`/health` location
- **教訓**:① deps-first COPY layer + BuildKit cache mount(`/root/.local/share/pnpm/store`)→ 第二次 build < 30s;② `VITE_SERVICE_BASE_URL` build-arg 注入(避免動 `.env.prod`);③ nginx config 為 SPA fallback(`try_files $uri $uri/ /index.html`);④ assets 30d cache + index.html no-cache
- **對 rev2**:SPA 部署完全沿用
- **踩雷**:「pnpm install 在 builder 慢」是已知代價,接受 5–10 min first build

#### rev1 011 — port-mapping `[CARRY]`
- **描述**:rev1 W-F7 dev 環境 — `docker-compose.dev.yml` 拆檔、host port 4 個全綁 `127.0.0.1`(dev/prod 顯式切換)
- **教訓**:① 拆檔模式(主 compose 不動,`-f -f` 手動加載)是「prod safe by default」紀律;② `127.0.0.1` loopback binding 避 LAN 暴露(prod 切 `0.0.0.0`);③ 1XXXX prefix 避開 fork260509 port
- **對 rev2**:dev/prod 配置切換模式完全適用(rev2 改 2XXXX prefix)
- **踩雷**:「`docker-compose.override.yml` auto-load」危險(會誤暴露 prod),必須手動 `-f` 選擇

#### rev1 012 — tls-cert-management `[CARRY]`
- **描述**:rev1 W-F6 TLS 終止 — dev 自簽 openssl + prod acme.sh skeleton、nginx 443 server block、80 redirect-only(prod)vs serve(dev)
- **教訓**:① dev/prod 兩份 nginx config(`default.conf` + `default.conf.prod`),443 段完全相同避 DRY;② dev cert SAN 需同時含 `DNS:localhost + IP:127.0.0.1`;③ acme service `profile=prod` 預設不啟;④ 主 compose 加對外 port(`0.0.0.0:11080/11443`)
- **對 rev2**:TLS 策略直接沿用,`generate-dev-cert.sh` 指令碼複製即可
- **踩雷**:「volume mount 衝突」需驗證(同 path 兩個 source 的 merge 行為)

#### 026 — rust-horizontal-scaling `[CARRY]`
- **描述**:rev1 W-F11 補 rust 水平擴展 — Casbin redis pub-sub channel(`casbin:policy:invalidate`) + docker-compose replicas + nginx upstream resolve
- **教訓**:① Q2 拍板「一次包到底」(pub-sub + replica + nginx)而非分拆,因 pub-sub 是「硬前提」;② Q5 拍板「pub-sub 永遠啟用、不靠環境分支」為一致性優先;③ roadmap doc 矛盾(rev1 W-F11 mislabel observability)於 brainstorm 階段 catch
- **對 rev2**:Casbin redis pub-sub 機制完整可沿用;**v1 即啟用 pub-sub channel**,即使只單 instance,亦不留環境分支
- **踩雷**:roadmap inconsistency 發現為 doc 維護優先度提示

#### 027 — cleanup-job `[CARRY]`
- **描述**:rev1 F12 一次性 cron job 物理刪除過期軟刪 row(`deleted_at < retention`)、dry-run 預設、`--execute` 才真刪、獨立最小權限 credential
- **教訓**:① Q1 拍板「local shell script + host cron」為個人 workspace 簡約選擇;② Q4 拍板「文件化 psql setup」避開 migration 無法建 role 的雞生蛋;③ rev1 F12 pattern「dry-run 為預設」為風險管理防呆設計
- **對 rev2**:soft-delete 生命週期清理機制直接沿用(per-row txn + audit 同 txn);獨立 credential 最小權限模式參考
- **踩雷**:Q2「不碰 casbin_rule orphan cleanup」為 spec drift 對稱(rev1 F12 明寫無 casbin、則不碰)

### 3.5 feature 紀要(NestJS bridge 系列 — rev1 F014~F017,**rev2 不採用**)

#### 014 — compose-nestjs-service `[REV1-ONLY]`
- **描述**:把 nestjs service 加進 rev1 docker-compose stack(`profile=track-a`),共享 postgres + redis,JWT secret 透過 `_FILE` pattern 共享
- **教訓**:Q2-4 拍板「不動 nestjs fork source + 不跑 prisma migrate + entrypoint wrapper bridge `_FILE` secret」為跨版本約束設計典範
- **對 rev2**:rev1 W-FA1 整套無用,但「沿用 fork 既有 Dockerfile + 不動 fork source」的約束思維 rev2 仍適用
- **踩雷**:OQ-1 nestjs prisma lazy-init 與 sys_tokens schema 對齊的 stack-不可見問題,留 rev1 F10 debug

#### 015 — nginx-track-a-transitional-block `[REV1-ONLY]`
- **描述**:補 `POST /api/auth/refreshToken` nginx 反代到 nestjs upstream,用 inline `TRANSITIONAL` marker block + variable proxy_pass + resolver 讓 rev1 DESIGN-B 退場時可機械整段刪
- **教訓**:Q2 拍板「variable proxy_pass + lazy DNS」而非「upstream block + profile-aware volume」大幅簡化 operator UX;marker convention `>>>>> TRANSITIONAL BEGIN/END` 直接服務 rev1 F14 cutover 的 `sed` 刪除
- **對 rev2**:無用
- **踩雷**:DESIGN-W §4.3 草稿漏 `/v1` prefix 與錯誤 port 3000,實作對齊現實(port 11081 + `/v1/auth/refreshToken`)

#### 016 — cicd-nestjs-build-job `[REV1-ONLY]`
- **描述**:抽象 rev1 W-FA1 nestjs image build cmd 成 local shell script,內建 `NODE_VERSION` build-arg + image size feedback
- **教訓**:Q1 拍板「local script 無 CI 平台」為個人 workspace v1 務實選擇;NFR-001「≤ 30 行」確保簡潔
- **對 rev2**:無用
- **踩雷**:實際 image 870MB 超 NFR-001 SHOULD ≤500MB,但未來退場故不投資優化

#### 017 — refresh-token-nestjs-bridge `[REV1-ONLY]`
- **描述**:rev1 F10 端點驗證 e2e refreshToken flow(rust login → nestjs `/api/auth/refreshToken` → 新 token pair),DB 準據(sys_tokens 雙端讀寫對齊)
- **教訓**:Q2「不動 nestjs source」延伸 rev1 DESIGN-A §3.2;Q3「friction 只改 rust 遷就 nestjs」為跨服務協作的關鍵取捨;R-8 / R-7 為 F10.1 / F10.2 拆分根據
- **對 rev2**:無用
- **踩雷**:R-8 / R-7 friction 明確於 brainstorm 階段預判,為後續拆分 feature 奠基

### 3.6 feature 紀要(refresh token + 對齊 — rev1 F018~F019)

#### 018 — rust-jwt-refresh-token-signing `[REFERENCE]`
- **描述**:rev1 F10.1 修 R-8 — rust 改簽 `refresh_token` 為 HS256 JWT(`RefreshClaims`)以通過 nestjs `jwtService.verifyAsync`
- **教訓**:N-1 拍板「refresh_secret 獨立分離」為 JWT security best practice;兩段式 commit(rust worktree + outer spec)規模適中;R-7 surface 證實「acceptance 階段 catch new friction」模式
- **對 rev2**:rust JWT 簽署基礎設施可參考(secret 分離、`generate_refresh_token` 函式),但「對齊 nestjs」工作 rev2 無對象
- **踩雷**:N-7「R-7 仍 surface」預言自驗實現,為 rev1 F10.2 準備

#### 019 — rust-tokenstatus-string-align `[REFERENCE]`
- **描述**:rev1 F10.2 修 R-7 — rust `TokenStatus` enum serialize 從 SCREAMING_SNAKE 改 snake_case(`Active → "unused"` / `Refreshed → "used"`)以對齊 nestjs
- **教訓**:Q2 拍板「`strum serialize_all="snake_case"` + per-variant override」極簡;Q3 拍板「不動既有 migration、acceptance 重 login」為軟體化債對稱邏輯;rev1 F10.2 precedent「純函式 mapping + 1 個 unit test」為日後 F7.2 模板
- **對 rev2**:enum string 對齊機制可參考(per-variant override),但具體 TokenStatus 對 rev2 無意義(rev2 自訂 status enum,不需對齊 nestjs)
- **踩雷**:R-2「未涵蓋的 consumer」grep 驗證,R-5「is_valid / can_refresh 邏輯維持」自驗確認

### 3.7 feature 紀要(systemManage 系列 — rev1 F020~F022)

#### 020 — extracted-stubs `[CARRY]`
- **描述**:rev1 F11 補 4 條抽離項 stub endpoint(`/auth/sendCaptcha` / `/auth/verifyCaptcha` / `/auth/error` / `/mock/getLastTime`)+ 8 row Casbin policy seed(ROLE_SUPER / ADMIN allow)
- **教訓**:Q1「sendCaptcha 完整、auth_error / getLastTime stub」為最小可用;Q4「3 role × 4 endpoint = 5 curl」為緊湊 acceptance;rev1 F11 pattern「純 wiring、無 unit test、curl + psql」為後續標配
- **對 rev2**:抽離項機制概念適用(stub → real 漸進演進),具體 4 條 endpoint 在 rust-only 下可留或升
- **踩雷**:Q3「handler 進階設計(validation / audit)不加」為 stub 定義的 v1 約束

#### 021 — systemManage-alias-router `[CARRY]`
- **描述**:rev1 F9 補最後 1 條 `batchDeleteUser` stub + 9 條 alias router(重用或變形既有 user / role / menu handler)+ 20 row Casbin policy seed
- **教訓**:Q1 拍板「getAllRoles 完整、getAllPages 簡 SQL」為「最簡實作」哲學(非全 stub);Q4「wrapper handler 加 api、route 集中新檔」為文件組織平衡;R-Q5 / R-Q6(v4='' baseline + deny envelope wrap)來自 rev1 F11 implement-time finding 沿用
- **對 rev2**:10 條 systemManage alias 的業務邏輯適用,實作細節涉及 nest 層級可簡化
- **踩雷**:rev1 F9 R-Q3「batchDeleteUser 永遠 200 + `{deletedCount: N}`」為 partial-success pragmatism

#### 022 — manage-crud-alignment `[CARRY]`
- **描述**:rev1 F7 對齊 base-web 表列的 5 條讀 endpoint,加 shape mapping Output DTO + camelCase rename,補 ROLE_ADMIN 的 Casbin policy(15 row)
- **教訓**:Q1「read-only path + endpoint shape 對齊」為 Constitution IV 下的可行邊界;Q2「最小 mapping、缺 column hardcode」為「後端適應 base」策略;rev1 F7 shape mapping pattern(`Output DTO` + `From` impl)為 DESIGN-B form-shaping 基礎
- **對 rev2**:Output DTO shape mapping 機制直接適用(camelCase + missing field hardcode);Casbin 補 ROLE_ADMIN allow 邏輯沿用
- **踩雷**:rev1 F7 R-Q4「base-web view-load CDP smoke test」選項提升為 mandatory verification 層級

### 3.8 feature 紀要(後續修正 + assign — rev1 F023~F025)

#### 023 — fix-route-getuserroutes-wiring `[REFERENCE]`
- **描述**:rev1 F7.1 follow-up — 修 F5.1 wiring bug(缺 `SysAuthService` extension) + F7 menu paginated wrapper shape 對齊
- **教訓**:Q1「2 fix bundle」共用 commit/acceptance;Q3「3 fix 全包 vs 只 rev1 F5.1 vs 拆」中選「最窄」為設計風規;「acceptance 階段 catch + spec 收為新 feature」的 modal pattern 確立
- **對 rev2**:rev1 F5.1 wiring fix 機制(manual layer pattern adding `Arc<SysAuthService>`)在 rust-only 版仍適用;menu paginated wrapper 概念參考
- **踩雷**:rev1 F7.1 R-Q-AT1「SPA static mode 無 null-guard」基於誤查,後續 CDP 驗證時發現 null-guard 存在,促發 F7.2 scope 精化

#### 024 — role-code-alignment `[REFERENCE]`
- **描述**:rev1 F7.2 應對 F7.1 發現的 `R_SUPER` vs `ROLE_SUPER` 字串不符,加 getUserInfo response 層 role code 映射 helper
- **教訓**:Approach A「rust response-layer mapping」為「後端適應 base 預期」純粹實踐;role code 映射為純函式(3-entry match、未知 pass-through)為 explicit contract;與 rev1 F10.2 同級「minimal + 1 unit test」precedent
- **對 rev2**:role 字串展示映射在 response 邊界為整體 shape-adaption 策略一部分,直接參考
- **踩雷**:Q1「不動 base-web `.env`」確保 Constitution IV,縮小 scope

#### 025 — assign-users `[CARRY]`
- **描述**:rev1 F8 交付 `/authorization/assign-users` 後端 endpoint,接 `AssignUserDto` + 既有 service method,新 Casbin seed(ROLE_SUPER-only)
- **教訓**:Q2「寫 join table、不寫 Casbin g rule」因「login `get_user_roles` 讀 join」的實作現況;Q3「rev1 ROLE_SUPER-only」為 assign-permission / assign-routes 家族一致性;set-semantics(整組覆蓋)的 capture → assign → verify → restore pattern 為 soft-delete-then-restore 紀律的演伸
- **對 rev2**:user-role 關聯機制(join table 為權威源)沿用;Casbin seed pattern 參考
- **踩雷**:Q2「寫 join table vs Casbin g rule」為跨服務 schema 選擇的原則分析

### 3.9 feature 紀要(rust refresh token + cutover + status — rev1 F028~F030)

#### 028 — rust-refresh-token-impl `[CARRY]`
- **描述**:rev1 F13 rust 補實作 `/auth/refreshToken` endpoint(驗 refresh JWT + DB 查詢 + 輪替核發新 token + 舊 token 標 `used`)
- **教訓**:Q1「完整輪替、舊 token 標 used」對齊 nestjs(非 rev1 DESIGN-A 文字的 `revoked`);Q3「refresh 時重查 user 當下狀態」為身份準時性原則;「複用 login 既有 building block」為程式複用最小化模式
- **對 rev2**:rust refresh token 端點實作為 core 功能,直接沿用(rev1 F13 已是 DESIGN-B 形態)
- **踩雷**:Q2「不額外寫 audit log」因 rust 既有 login 也無(sys_tokens 本身即紀錄)

#### 029 — design-a-to-b-cutover `[REV1-ONLY]`
- **描述**:rev1 F14 nestjs 退場、DESIGN-B 正式生效 — 刪 nginx `TRANSITIONAL` block、移除 docker-compose nestjs、刪 build script、清理文件
- **教訓**:Q1「R3+R4 都納入」於 cutover 時順手清掉盤點漏項;Q2「R3 最小 — 登記進 namespace」避免 behavioral change(runtime 值不變);marker convention「sed 機械刪除」實現驗證
- **對 rev2**:無用(rev2 起點即 rev1 DESIGN-B)
- **rev2 啟示**:pre-cutover 盤點捉 2 項(R3 code namespace / R4 secret example)為 maintenance discipline 示範。**rev2 啟動時應做對稱盤點**:檢視 `application.yaml` placeholder 完整性、`.env.example` 與 `deploy/secrets/*.txt.example` 是否齊備、Casbin policy seed 是否完整覆蓋預期 role × endpoint 矩陣

#### 030 — systemmanage-status-gender-alignment `[CARRY]`
- **描述**:rev1 F14 後 follow-up — 補 systemManage 列表的 `status`(bug fix、enum 對齊到 `"1"/"2"`) + `gender`(功能新增、rust 補欄位 + 映射)
- **教訓**:CDP 全功能巡檢發現的既有瑕疵;Part A 純粹 output 層 mapping(`map_status` helper);Part B「domain-typed 方案」(PG enum Gender)為未來 migration 設計參考;「拆分 base-web CRUD 接線為獨立 feature」確保 Constitution IV
- **對 rev2**:status 對齊映射機制(enum → string)直接適用;gender 作為可選欄的建模(nullable)為 DB 設計參考
- **踩雷**:Q2 更正「base-web render 有 null-guard」發現,精化 scope 為「status 修正 + gender 功能」(非「gender bug 修」)

### 3.10 meta 觀察:rev1 累積的共通教訓主題

跨 30 個 feature,以下 8 個主題反覆出現,**rev2 應全套繼承為紀律**:

1. **「Atomic increment」紀律**:每個 feature 的多個片段(schema + code + test + doc)必須原子交付。單一片段交付會讓 codebase 陷入「部分狀態」(rev1 F2 schema + facade 必須同 commit)。

2. **「Wire DTO 三端對齊」**:rev1 F4 response shape、F2 AuditEvent、F1.1 JWT Claims 都需 client / server / audit 三層完全對齊。rev2 CLAUDE.md §3「Phase 0 research 紀律」已明文化(rust handler return type ↔ base-web inline type ↔ component state 對齊 grep)。

3. **「CI lint 守護紀律」**:rev1 F2 entity import 禁令、F3 audit-coverage lint —— 編譯時檢查無法保證的「約定」,用 CI 執行。

4. **「三重防護」(類型 + facade + grep)**:F2 軟刪三重防護(類型系統 trait 封閉 + facade module 不 re-export Entity + CI grep 禁直接 import)是 rev1 最成熟的紀律,rev2 直接照辦。

5. **「Build-arg + env override」**:rev1 F7 deploy `VITE_*`、F1.1 `_FILE` pattern —— 「source 不改、layer 選擇」哲學。

6. **「Dev/prod 顯式切換」**:rev1 W-F7 / W-F6 拆檔 + 手動 `-f`,**不**用 `override.yml` auto-load(prod safe by default)。

7. **「單一 audit context API」**:rev1 F2 統一所有 write path(INSERT / UPDATE / SOFT_DELETE)走 `audit_log::write_in_txn(AuditEvent)`。

8. **「acceptance 階段 catch → spec 收為新 feature」modal pattern**:rev1 F7.1 / F7.2 / F10.1 / F10.2 / 030 都是此模式 — implement / acceptance 時 surface friction,當下不擴張 scope,而是登記為下一個 feature。**rev2 follow-up backlog 維護紀律的根據**。

### 3.11 rev2 第一個 feature 優先級建議

基於 rev1 累積,rev2 建議按以下順序開展:

**P0 部署基建**(可與 P1 並行,無 app 相依):
- rev1 W-F1 dockerfile-rust-api(image build)
- rev1 W-F2 dockerfile-base-web(image build)
- rev1 W-F6 tls-cert-management(`generate-dev-cert.sh` + dev-certs)
- rev1 W-F7 port-mapping(改 2XXXX)

**P1 基礎設施**(無此不能動 app):
- rev1 F1.1 jwt-secrets(strict validation + `_FILE`)
- rev1 F3 soft-delete-infrastructure(全 entity 軟刪 + facade + CI lint)
- rev1 F4 response-shape-alignment(envelope + camelCase)
- rev1 F2 audit-log-infrastructure(schema 升級 + AuditEvent,依 F3)

**P2 認證 + 動態 menu**(P1 完):
- rev1 F5.1 auth-login + getUserInfo + getUserRoutes(依 F1.1+F2+F3+F4)
- rev1 F6 route-guard(`/route/isRouteExist`)
- **同步啟用 Casbin redis pub-sub channel `casbin:policy:invalidate`**(rev1 W-F11 026,即使 v1 單 instance)

**P3 主流業務**(P2 完):
- rev1 F7 manage-crud-alignment(Output DTO + shape mapping)
- rev1 F8 assign-users(`/authorization/assign-users`)
- rev1 F9 systemManage-alias-router(10 條 thin wrapper)

**P4 補位 + 抽離項**(P3 完):
- rev1 F13 rust-refresh-token-impl(自實作,跳過 F10/F10.1/F10.2 對齊步驟)
- rev1 F11 extracted-stubs(4 條抽離 stub + Casbin seed)
- rev1 F12 cleanup-job(dry-run 預設、cron 觸發)

**P5 觀察性**(可選,生產必備):
- rev1 W-F12 promtail + loki(log)
- rev1 W-F13 prometheus + 3 exporter + pushgateway(metrics)
- rev1 W-F14 grafana + alerting(dashboard)

---

## §4 base-web SHA 演化(28807d40 → 64af823b)

> rev1 的 `base-web/` 在分支 `rev1-admin-base-web` 上累積 21 個 commit,跨度 14 天。本節彙整這段演化讓 rev2 理解「base-web 在 rev1 經歷了什麼」、以及哪些改動 rev2 應直接 cherry-pick / 參考 / 跳過。

### 4.1 時間線總覽

- **起點 SHA**:`28807d405ab9fba2612db0144772cbb59e2a0d7e`(2026-05-12 03:23:40,分支建立註記 commit)
- **終點 SHA**:`64af823bf762d5e75df17f2aee4ea7db8279c84c`(2026-05-26 01:18:07,049 sprint polish commit)
- **commit 數**:21 個
- **累積變動**:`695 insertions(+) / 191 deletions(-)`,涉及 24 個檔案

### 4.2 21 個 commit(按時序)

```
bbedf2c2 chore(base-web): rev1 F4 將 VITE_SERVICE_SUCCESS_CODE 改 0000 → 0
cb897e9c feat(base-web): rev1 W-F2 dockerfile-base-web 落地(multi-stage Vite + nginx + /health endpoint)
d56b9f85 fix(base-web): rev1 W-F2 follow-up — nginx cache temp subdirs 預先 mkdir + chown
1793b361 feat(base-web): rev1 W-FW1 user CRUD 接線 — drawer/list submit 接 systemManage
b43634c0 feat(base-web): rev1 W-FW2 menu CRUD 接線 — modal/list submit 接 systemManage
ceafe62a feat(base-web): rev1 role 管理頁 CRUD 接線 — W-FW3
c9e12e7a feat(base-web): rev1 接線 menu-auth-modal 角色菜單授權讀寫 — W-FW4
7325b091 fix(base-web): rev1 menu-auth-modal 成功訊息移除多餘 optional chaining — W-FW4 code review 修正
ff227c9e feat(base-web): rev1 W-FW5 user 抽屜加選填密碼欄
9a6ec60c feat(base-web): rev1 W-FW5 帳號中心補修改密碼面板
003de689 fix(base-web): rev1 W-FW5 移除 user 抽屜角色欄 mock scaffolding 殘留
bfa1494d feat(base-web): rev1 W-FW6 N2 角色首頁 menu-auth-modal 接通真 API
08bbe315 feat(base-web): rev1 W-FW8 button-auth-modal 接通 systemManage endpoint alias
2989c2eb feat(base-web): rev1 040 T002-T005 W-FW9 修 modal body roleId String→number cascade(039 critical bug 修)
496f301b fix(base-web): 040 fix #3 fetchGetRoleEndpointIds 真實 wire 為 string[]、checks 對齊
d521c819 fix(base-web): pnpm-workspace.yaml 加 nodeLinker: hoisted (048 env-repair adjacent)
4e05d478 feat(base-web): typings/api 對齊 rust wire 真實序列化型 (048 US1+US2)
b4453385 fix(base-web): Dockerfile pnpm 10.18.0→11.0.8 + --ignore-scripts (048-N1 follow-up)
94c15832 feat(base-web): 049 dep-hygiene — strict isolation + explicit devDeps + packageManager pin + Dockerfile 簡化
f6efe906 style(base-web): Dockerfile line 9 註解 outdated cleanup (049 polish)
64af823b style(base-web): Dockerfile line 35-42 strict isolation 紀律 comment polish (049-R1)
```

### 4.3 主題分群

| 主題 | Commit | 數量 |
|---|---|---|
| 部署基建(rev1 W-F2) | `cb897e9c`, `d56b9f85` | 2 |
| 使用者 CRUD(rev1 W-FW1) | `1793b361` | 1 |
| 菜單 CRUD(rev1 W-FW2) | `b43634c0` | 1 |
| 角色 CRUD(rev1 W-FW3) | `ceafe62a` | 1 |
| 角色菜單授權(rev1 W-FW4) | `c9e12e7a`, `7325b091` | 2 |
| 帳號中心(rev1 W-FW5) | `ff227c9e`, `9a6ec60c`, `003de689` | 3 |
| 角色首頁(rev1 W-FW6) | `bfa1494d` | 1 |
| 端點授權(rev1 W-FW8) | `08bbe315` | 1 |
| 型別對齊 & Bug 修(rev1 W-FW9+040) | `2989c2eb`, `496f301b` | 2 |
| 型別序列化同步(048 US1+US2) | `4e05d478` | 1 |
| 依賴清潔 & pnpm 升級(048-049) | `d521c819`, `b4453385`, `94c15832`, `f6efe906`, `64af823b` | 5 |
| 雜務(rev1 F4 config) | `bbedf2c2` | 1 |

### 4.4 檔案範圍

| 目錄 / 檔案 | 改動類型 | 影響範圍 |
|---|---|---|
| `Dockerfile` | 新建 + 多次迭代 | 大(部署基建) |
| `.dockerignore` | 新建 | 輔助 |
| `deploy/nginx.conf` | 新建 | 部署配置 |
| `pnpm-workspace.yaml` | 配置改動 | 中(環境修復) |
| `.npmrc` | 移除 | 小(古蹟清理) |
| `package.json` | 新增 `packageManager` 欄位 + explicit devDeps | 中 |
| `packages/uno-preset/package.json` | 新增 devDeps | 小 |
| `.env` | config 改動 | 小 |
| `pnpm-lock.yaml` | 自動更新 | 大(檔案量)、無邏輯改動 |
| `src/service/api/system-manage.ts` | 新增 9+ service function | 中(Web UI CRUD 全串) |
| `src/service/api/auth.ts` | 新增 `fetchChangePassword` | 小 |
| `src/typings/api/` | 型別對齊(route / system-manage / auth / common) | 中 |
| `src/views/manage/user/` | CRUD + 密碼欄 | 中 |
| `src/views/manage/menu/` | CRUD 接線 | 小 |
| `src/views/manage/role/` | CRUD + 菜單授權 + 端點授權 | 大 |
| `src/views/user-center/` | 密碼修改面板 | 小 |
| `build/plugins/unocss.ts` | 型別修正 | 小(審計順手) |

### 4.5 對 rev2 的影響評估

#### 4.5.1 直接可重用的改動

- **部署基建(rev1 W-F2, Dockerfile + nginx.conf,`cb897e9c` + `d56b9f85`)**:純新檔案、0 現有代碼侵入;rev2 可直接 cherry-pick(含 nginx cache mkdir 修復)。
- **型別序列化對齊(`4e05d478`)**:`MenuRoute.id` `string → number`、`MenuTree.pid` 型別修正,對齊 rust wire 真實形狀;若 rev2 base-web 源碼尚未對齊,建議同步 cherry-pick(無業務邏輯牽連)。
- **依賴清潔(`94c15832` 049 sprint)**:pnpm 11 strict isolation、explicit devDeps、`packageManager` field SoT 統一;**rev2 應整套採用**(避免重蹈 rev1 044/045/046 環境修復 sprint 的覆轍)。

#### 4.5.2 需評估的改動

**rev1 Web UI CRUD 全鏈路(W-FW1 ~ W-FW9,10+ 個 commit)**:涉及:
- `src/service/api/system-manage.ts` 新增 9+ endpoint wrapper(user / menu / role / endpoint CRUD + 授權)
- `src/views/manage/{user,menu,role}/` 視圖層接線
- 型別修正(`roleId` `string → number` cascade、`fetchGetRoleEndpointIds` return `string[]`)
- 帳號中心密碼修改面板補完

**建議**:rev2 若自行實作 Web UI CRUD,此段 commit 歷史可作**參考設計**而非直接 cherry-pick — 因為 rev2 可能有不同 service 架構、不同 API endpoint 設計、不同型別定義約定。逐個審視 commit 訊息中的 acceptance criteria + design rationale 後決定是否整合。

#### 4.5.3 環境相依的修復

- **`pnpm-workspace.yaml` `nodeLinker: hoisted`(`d521c819`)**:pnpm 11 環境修復;rev2 若採用 pnpm 預設 strict isolation,可跳過(049 已直接走 strict)。
- **Dockerfile pnpm 升級(`b4453385`, `94c15832`)**:連鎖修改 — pnpm `10.18.0 → 11.0.8`、移除 `ARG PNPM_VERSION`、改吃 `packageManager` field。rev2 Dockerfile 若全新建立,**直接採納完整後態**(049 終態)。

#### 4.5.4 可能的 follow-up backlog

- **pnpm hoisting 策略長期檢視**:049 選 `nodeLinker: hoisted`,但建議未來進行「pnpm 預設 strict isolation vs hoisted」長期 review。
- **rev1 W-WEBUI Constitution 邊界紀律**:21 個 commit 多次強調 Constitution v1.2 ~ v1.6.0 的「受管例外」行使;rev2 設計紀律應確認已更新至相同 Constitution 版本。
- **Rust wire type 持續對齊**:`4e05d478` comment 指出「phase 0 型別對齊完成、phase 1 consumer cascade 待做」;rev2 若涉及 Rust 端型別演進應複查 TS 端對齊。
- **後端 API endpoint 契約穩定性**:CRUD 全鏈路涉及 systemManage / auth / endpoint 9+ endpoint;若 rev2 backend 改動此層契約,Web UI 層應重新測試。

### 4.6 演化節奏

整體節奏為:**部署先行 → 功能集中 → 型別整理 → 清潔收尾**。

- **第 0–1 週(5/14–15)**:部署基建兩個 commit(rev1 W-F2 Dockerfile + nginx 修復)
- **第 1–2 週(5/22)**:Web UI CRUD 全鏈路集中登陸(7 個 commit rev1 W-FW1 ~ W-FW5)
- **第 2 週末(5/23–24)**:CRUD 功能補完(rev1 W-FW6 / W-FW8 + 039 critical bug 型別修正)
- **第 3 週(5/24–25)**:型別同步 + 依賴清潔 sprint(4 個 commit 048-049)
- **5/26**:最終 polish(Dockerfile comment 清理)

**rev2 啟示**:同樣以「部署先行(P0)→ 基建(P1)→ 認證(P2)→ 業務(P3)→ 清潔(P4/P5)」的節奏推進。

---

## §5 rust-api 技術棧與 workspace 結構

> rev1 的 `rust-api/` 是同源 fork 的 worktree,rev2 的 `rust-api/` 同源但分支不同(`rev2-admin-rust-api`,從 main 衍生)。技術棧預期幾乎相同,本節以 rev1 已驗證版本為 rev2 起點。

### 5.1 技術棧分類表

| 類別 | Crate | 版本 | 用途 |
|---|---|---|---|
| **Web Framework** | axum | 0.8.4 | 主 async web 框架(hyper 基礎) |
| | axum-extra | 0.10 | 類型化 header、extractor 擴展 |
| | tower | 0.5.2 | 中間件 / service 架構底層 |
| | tower-http | 0.6 | HTTP 中間件(trace / normalize-path) |
| | tower-layer | 0.3 | tower layer interface |
| | tower-service | 0.3 | tower service interface |
| **HTTP / Serialization** | http | 1.3.1 | HTTP req/resp 底層 |
| | http-body | 1.0 | HTTP body trait |
| | http-body-util | 0.1 | HTTP body 工具 |
| | bytes | 1.10 | 字節緩衝 |
| | serde | 1.0 | 序列化框架 |
| | serde_json | 1.0 | JSON 序列化 |
| | serde_yaml | 0.9 | YAML 配置序列化 |
| **Async Runtime** | tokio | 1.x | 主 async 運行時(multi-thread + macros + sync) |
| | async-trait | 0.1 | async trait 支援 |
| | async-std | 1.13 | 備用 async runtime(選配) |
| | futures | 0.3 | future 組合子 |
| **ORM / DB** | sea-orm | 1.1 | 主 ORM(SQLx backend) |
| | sea-orm-migration | 1.0 | DB migration(PostgreSQL) |
| | redis | 0.32 | Redis 驅動(`cluster-async` / `connection-manager`) |
| | mongodb | 3.2 | MongoDB 驅動 |
| | bson | 2.15 | BSON 序列化 |
| **Auth / JWT** | jsonwebtoken | 9.3 | JWT token 生成 / 驗證 |
| | argon2 | 0.5 | Argon2 密碼雜湊 |
| | bcrypt | 0.17 | Bcrypt 密碼雜湊 |
| **Authorization** | casbin | 2.10 | RBAC 引擎(`incremental` / `cached`) |
| | sea-orm-adapter | 1.0 | Casbin SeaORM adapter(自製 sub-crate) |
| | axum-casbin | 0.1 | Casbin Axum middleware(自製 sub-crate) |
| **Validation** | validator | 0.20 | 數據驗證(derive macro) |
| **Observability** | tracing | 0.1 | 分布式追踪 |
| | tracing-subscriber | 0.3 | tracing 訂閱者(env-filter / fmt / json) |
| | tracing-error | 0.2 | 錯誤追踪擴展 |
| | tracing-log | 0.2 | log → tracing 適配器 |
| | metrics | 0.23 | Metrics facade |
| | metrics-exporter-prometheus | 0.15 | Prometheus 導出 |
| | log | 0.4 | 標準日誌 facade |
| | env_logger | 0.11 | 環境變數控制日誌 |
| | simplelog | 0.12 | 簡單日誌實現 |
| | simple_logger | 5.0 | 輕量日誌實現 |
| **Cryptography** | ring | 0.17 | 加密基礎 |
| | hex | 0.4 | hex 編碼 |
| | md-5 | 0.10 | MD5 雜湊 |
| **Config / CLI** | config | 0.15 | 多源配置管理 |
| | toml | 0.9 | TOML 序列化 |
| | envy | 0.4 | 環境變數載入 |
| **Error Handling** | thiserror | 2.0 | 自定義錯誤 derive |
| | anyhow | 1.0 | 通用錯誤處理 |
| **Caching** | moka | 0.12 | LRU 記憶體快取 |
| **Time / Date** | chrono | 0.4 | 時間 / 日期 |
| | ulid | 1.2 | ULID 生成 |
| **Utilities** | once_cell | 1.21 | 延遲初始化、全局狀態 |
| | parking_lot | 0.12 | 高效線程同步 |
| | lazy_static | 1.5 | 延遲靜態初始化 |
| | derive-new | 0.7 | 自動 new() 方法派生 |
| | urlencoding | 2.1.3 | URL 編碼 |
| | form_urlencoded | 1.2 | 表單 URL 編碼 |
| | strum | 0.27 | enum 工具(string 轉換) |
| | strum_macros | 0.27 | strum derive |
| | rayon | 1.10 | 數據並行化 |
| **HTTP / MIME** | headers | 0.4 | 類型化 HTTP headers |
| | mime | 0.3 | MIME 類型 |
| **Cloud / Storage** | aws-config | 1.8 | AWS SDK 配置 |
| | aws-sdk-config | 1.0 | AWS 配置服務 |
| | aws-sdk-s3 | 1.x | AWS S3 |
| **Templating** | askama | 0.14 | 編譯時模板引擎 |
| | askama_derive | 0.14 | askama derive |
| **String** | convert_case | 0.8 | snake_case ↔ camelCase |
| **Testing** | axum-test-helpers | 0.8 | axum 測試助手(注:對 axum 0.8.x 部分相容) |

### 5.2 Workspace 結構

```
rust-api (workspace root)
├── server/
│   ├── bin/               [entry point] → depends: initialize
│   │                      main.rs、啟動順序 orchestration
│   ├── api/               [handler layer] → depends: core, global, model, service, axum-casbin, xdb
│   │                      HTTP handler(SysAuthenticationApi::login_handler 等)
│   ├── core/              [core / trait layer] → depends: config, constant, global
│   │                      核心 trait(web / db / sign / validation)
│   ├── service/           [business logic] → depends: config, constant, core, global, model, utils, axum-casbin
│   │                      Service trait + impl(TAuthService 等,async-trait)
│   ├── router/            [routing] → depends: api, global, core
│   │                      Axum Router 組裝、路由註冊
│   ├── model/             [SeaORM entities] → depends: core, global
│   │                      Sea-ORM Entity / ActiveModel + DTO
│   ├── initialize/        [init orchestration] → depends: core, config, constant, global, middleware, model, router, service, axum-casbin, sea-orm-adapter, xdb
│   │                      系統初始化(DB / Redis / Mongo / Casbin)
│   ├── middleware/        [middleware] → depends: core, model, global, axum-casbin
│   │                      自定義 middleware(auth / audit)
│   ├── config/            [config mgmt] → depends: global
│   │                      配置加載(YAML / env var / 多實例)
│   ├── global/            [global state] → depends: (無)
│   │                      全局狀態(DatabaseConnection / Redis / Mongo / S3 once_cell)
│   ├── constant/          [enum / const] → depends: (無)
│   │                      常數定義、枚舉
│   ├── shared/            [empty] → depends: (無)
│   │                      預留 crate
│   ├── utils/             [utilities] → depends: (無)
│   │                      工具函數(argon2 hash / 樹構建 / 並行化)
│   ├── resource/          [build resource] → depends: (askama 模板編譯)
│   │                      模板 / 資源編譯
│   └── cleanup/           [cleanup binary] → depends: model, core
│                          清理任務 binary(metrics push-gateway)
├── axum-casbin/           [middleware crate] → depends: casbin, tower, http, bytes, metrics
│                          自製 Casbin Axum middleware
├── sea-orm-adapter/       [ORM adapter] → depends: async-trait, casbin, sea-orm
│                          自製 Casbin SeaORM adapter(postgres / mysql / sqlite)
├── xdb/                   [IP lookup] → depends: once_cell, tracing, tracing-subscriber
│                          IP2Region Rust 綁定
└── migration/             [DB migration] → depends: async-std, sea-orm-adapter, server-global
                           SeaORM migration CLI(sqlx-postgres / runtime-tokio-rustls)
```

### 5.3 依賴流向 ASCII 圖

```
┌─────────────────────────────────────────────────────────────┐
│  server/bin (entry point)                                   │
│  main() → initialize_log_tracing()                          │
│        → initialize_config()                                │
│        → init_primary_connection() [PostgreSQL]             │
│        → init_db_pools()                                    │
│        → init_primary_redis(), init_redis_pools()           │
│        → init_primary_mongo(), init_mongo_pools()           │
│        → init_primary_s3()                                  │
│        → initialize_admin_router() [axum]                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  ┌──────────────────┐      ┌────────────────────┐
  │ server/api       │      │ server/router      │
  │ (HTTP Handlers)  │      │ (Axum Router)      │
  └────────┬─────────┘      └──────────┬─────────┘
           │                           │
           └────────────┬──────────────┘
                        ▼
            ┌───────────────────────┐
            │  server/service       │
            │  (Business Logic)     │
            │  +─────────────────+  │
            │  │ TAuthService    │  │
            │  │ TUserService    │  │
            │  │ TRoleService    │  │
            │  │ TEndpointService│  │
            │  └─────────────────┘  │
            └───────────┬───────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌────────┐
   │ server/ │    │  axum-   │    │  xdb   │
   │ model   │    │  casbin  │    │ (IP    │
   │ (SeaORM │    │ (RBAC    │    │ lookup)│
   │ Entity) │    │ Middlewr)│    │        │
   └────┬────┘    └────┬─────┘    └────────┘
        │              │
        └──────┬───────┘
               ▼
        ┌─────────────────────────────────┐
        │  server/core (Traits & Utils)   │
        │  +────────────────────────────+ │
        │  │ web::auth (JWT validation) │ │
        │  │ web::error (AppError)      │ │
        │  │ db::<Database trait>       │ │
        │  │ sign::<signature traits>   │ │
        │  +────────────────────────────+ │
        └──────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   ┌─────────────┐     ┌───────────────────┐
   │server/config│     │ server/global     │
   │(YAML / env) │     │ (global state)    │
   │             │     │ once_cell::{db,   │
   │             │     │  redis, mongo}    │
   └─────────────┘     └───────────────────┘
                              │
                              ▼
              ┌──────────────────────────┐
              │ sea-orm-adapter          │
              │ (Casbin ↔ PostgreSQL)    │
              └──────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────┐
              │ migration (SeaORM CLI)   │
              │ sqlx-postgres driver     │
              └──────────────────────────┘
```

### 5.4 設計模式觀察

1. **分層架構(Layered Architecture)**:
   - Handler Layer(`server/api`):Axum handler + extractor 解析
   - Service Layer(`server/service`):業務邏輯、複雜狀態管理
   - Model / Entity Layer(`server/model`):SeaORM entities + DTO
   - Core / Trait Layer(`server/core`):通用 trait(`TAuthService`、web utils)
   - Global State(`server/global`):全局連接池、初始化狀態

2. **Dependency Injection via Extension**:典型 handler 簽名
   ```rust
   pub async fn login_handler(
       ConnectInfo(addr): ConnectInfo<SocketAddr>,
       Extension(service): Extension<Arc<SysAuthService>>,  // DI
       ValidatedForm(input): ValidatedForm<LoginInput>,      // 驗證
   ) -> Result<Res<AuthOutput>, AppError>
   ```

3. **Service Layer + Trait Objects**:
   ```rust
   pub trait TAuthService: Send + Sync {
       async fn pwd_login(...) -> Result<AuthOutput, AppError>;
   }
   ```
   Repository Pattern 的變體。

4. **Request Validation + Custom Extractors**:`ValidatedForm<T>` + `validator` crate(struct-level 驗證)在 handler 入口層完成。

5. **Error Handling**:`AppError` 自訂錯誤(`thiserror` derive),統一響應 `Res<T>`。

6. **Observability-First Design**:
   - Tracing 自動 span 追踪(`#[instrument]`)
   - Metrics(per handler counter / histogram)
   - Audit Log 事件驅動(`sys_operation_log_service`)
   - Structured Logging(`tracing-subscriber json`)

7. **RBAC with Casbin**:`axum-casbin` middleware 在 middleware 層檢查端點權限;`sea-orm-adapter` 將規則存於 PostgreSQL `casbin_rule` 表。

8. **Database Abstraction**:Primary connection(`once_cell`)+ connection pools(多實例)+ Soft Deletes(`SoftDeletable` trait)+ Transactions(`DbTransaction` API)。

9. **Multi-Database Support**:PostgreSQL(主)+ Redis + MongoDB + AWS S3(SDK)。

10. **Configuration Management**:YAML + env var override + 多實例模式(per domain / tenant)。

### 5.5 對 rev2 的繼承重點

> **重要修正(2026-05-26 user 拍板)**:rev2 的 `rust-api` **從 0 搭建**(repo 名 `fork260509-rev2-anew-rust-api`、branch `rev2-admin-rust-api`),不是 rev1 rust-api 的 fork 演化。也就是說:
> - rev2 不繼承 rev1 rust-api 的**程式碼**
> - rev2 仍繼承 rev1 累積的**設計**與**踩雷紀錄**(本文 §2/§3 為核心)
> - 必須技術棧:**axum + sea-orm + casbin + jwt**(user 拍板,其他自由)
> - rev1 完整技術棧清單(§5.1)可作為「crate 選擇參考、版本鎖定起點、避免重複踩升級雷」,但 rev2 不必照搬所有 crate(可精簡 — 例如 rev1 的 mongodb / aws-sdk-s3 / askama 等若 rev2 不用就拿掉)

**rev2 從 0 搭建時的起點建議**:

| 項目 | rev1 版本(參考) | rev2 起點建議 | 備註 |
|---|---|---|---|
| Rust Edition | 2021 | 同 | 無異議 |
| Axum | 0.8.4 | **採用** | 必須技術棧 |
| Sea-ORM | 1.1 | **採用** | 必須技術棧(SQLx backend) |
| Casbin | 2.10 | **採用** | 必須技術棧(`incremental` + `cached`) |
| jsonwebtoken | 9.3 | **採用** | 必須技術棧 |
| Tokio | 1.x | 同 | multi-thread + macros |
| serde / serde_json | 1.0 | 同 | 必需 |
| tracing / tracing-subscriber | 0.1 / 0.3 | 同 | JSON exporter + env-filter |
| argon2 | 0.5 | 同 | 密碼雜湊;rev1 同時用 bcrypt 0.17,rev2 可只用 argon2 |
| validator | 0.20 | 同 | request validation derive |
| thiserror / anyhow | 2.0 / 1.0 | 同 | error handling |
| metrics / metrics-exporter-prometheus | 0.23 / 0.15 | **延後** | rev2 P5 觀察性才需(見 §9.5) |
| ulid | 1.2 | **評估** | rev1 用 ULID;rev2 看後端是否要為 base-web 適應改 i64(動機一 §10.1 含義) |
| moka | 0.12 | 同 | LRU 記憶體快取 |
| mongodb / bson | 3.2 / 2.15 | **拿掉** | rev2 用 PostgreSQL,無 MongoDB 需求 |
| aws-config / aws-sdk-s3 | 1.8 / 1.x | **拿掉** | rev2 v1 無 S3 需求,future 再加 |
| askama / askama_derive | 0.14 | **評估** | rev1 用做模板;rev2 若無 server-side render 需求可拿掉 |
| xdb | (local crate) | **評估** | rev1 用做 IP2Region;rev2 若無此需求可拿掉 |
| convert_case | 0.8 | 同 | snake_case ↔ camelCase 對齊 base 必用 |

**rev2 從 0 搭建時應留意(同樣參考 rev1 體例)**:
- workspace 子 crate 結構:可採 rev1 的 `server/{bin,api,core,service,router,model,initialize,middleware,config,global,constant,utils}` 分層,也可更精簡(例如 v1 合併 `constant` 進 `core`)
- `workspace.dependencies` 集中版本管理(rev1 已驗證的做法)
- migration crate 需獨立運行(`sea-orm-migration` 模式)
- `application.yaml` 路徑與 envvar 注入機制(rev1 F1.1 已驗證的 `_FILE` pattern)
- **rev1 自製的 sub-crate**(`axum-casbin`、`sea-orm-adapter`、`xdb`):
  - ✅ **2026-05-27 [followup §7](INTEGRATION-RESEARCH-FOLLOWUP.md) 拍板**:
    - `sea-orm-adapter`(758 LoC):**拷貝**(0 人日)— rev1 自寫、上游可能落後、實作通用無 rev1-specific patch
    - `xdb`(272 LoC):**拷貝**(0.5 人日)— 純 IP2Region 算法綁定、commit 穩定、只需調 default 路徑 detect
    - `axum-casbin`(234 LoC):**重寫**(3-5 人日)— 高度客製化(rev1 自家 metrics 埋點 + domain-aware enforce),趁機統一 rev2 error / metrics 策略
  - **總估工 ~4.5 人日**(rev2 P1 setup 階段可完成);上游升級風險可控(Casbin 2.10 / SeaORM 1.1 穩定)

**rev2 不繼承 rev1 程式碼的好處**:
- 沒有歷史包袱、可以一開始就採用所有 rev1 已驗證的紀律(三重防護、原子交付、wire DTO 三端對齊)
- 可以針對 base-web example 分支 wire 形狀做最徹底的 mapping(§10.1.A 動機一 user 拍板:**rust-api 最大化配合 base-web**)
- 對 rev1 superpowers 30 個 feature 紀錄:當作「設計藍圖 + 踩雷紀錄」而非「source 參考」,每個 feature 在 rev2 都是重寫實作

---

## §6 部署拓撲(`deploy/` + `docker-compose.*.yml`)

> rev1 容器化部署已完成主體框架(app stack 8 service + observability stack 7 service)。rev2 直接以 rev1 為藍本,僅改 port(2XXXX)與 project name(`rev2-admin`)。

### 6.1 容器拓撲總覽

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          rev1-admin Docker Stack                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────── internal bridge network ────────────┐                     │
│  │                                                   │                     │
│  │  ┌─────────────┐  ┌──────────────┐               │                     │
│  │  │  postgres   │  │  redis-stack │               │                     │
│  │  │  :5432      │  │  :6379       │               │                     │
│  │  └─────────────┘  └──────────────┘               │                     │
│  │         ▲                 ▲                       │                     │
│  │  ┌──────┴────────────────┴──────┐               │                     │
│  │  │    migration (one-shot)       │ <── 初始化 DB schema              │
│  │  │    sea-orm-cli up             │               │                     │
│  │  └────────────────────────────┘               │                     │
│  │         ▲                                        │                     │
│  │  ┌──────┴────────────────────────────────────┐  │                     │
│  │  │        rust-api (Axum server)             │  │                     │
│  │  │        :11081 /health /metrics /api/*     │  │                     │
│  │  │        (2 replicas in prod)               │  │                     │
│  │  └──────┬──────────────────────────────────┘  │                     │
│  │         │                                      │                     │
│  │  ┌──────┴──────────────────────────────────┐  │                     │
│  │  │     base-web (Vite SPA + nginx)         │  │                     │
│  │  │     :8080 /health /api (SPA fallback)   │  │                     │
│  │  └──────┬────────────────────────────────┘  │                     │
│  │         │                                    │                     │
│  │  ┌──────┴──────────────────────────────────┐  │                     │
│  │  │  front-nginx (reverse proxy gateway)    │  │                     │
│  │  │  :80/:443 health /api/ / location 3     │  │                     │
│  │  │  ↓ dev-certs (self-signed)              │  │                     │
│  │  │  ↓ front_nginx_certs (prod acme)        │  │                     │
│  │  └──────────────────────────────────────┘  │                     │
│  │         │                                    │                     │
│  │  ┌──────┴──────────────────────────────┐  │                     │
│  │  │  acme.sh (TLS cert manager)         │  │                     │
│  │  │  profile: ["prod"] — opt-in         │  │                     │
│  │  └──────────────────────────────────┘  │                     │
│  │                                          │                     │
│  │  ┌──────────────────────────────────┐  │                     │
│  │  │  cleanup (one-shot job)          │  │ (rev1 F12)           │
│  │  │  profile: ["jobs"]               │  │ cron-triggered       │
│  │  └──────────────────────────────────┘  │                     │
│  └──────────────────────────────────────────┘                     │
│                       ↓ observability bridge network               │
│  ┌────────────── observability bridge ─────────────────────────┐  │
│  │                                                             │  │
│  │  ┌──────────────┐  ┌────────────┐  ┌─────────────┐        │  │
│  │  │    loki      │  │  promtail  │  │  prometheus │        │  │
│  │  │    :3100     │  │   :9080    │  │    :9090    │        │  │
│  │  └──────────────┘  └────────────┘  └─────────────┘        │  │
│  │                                                             │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────┐         │  │
│  │  │  postgres_ │  │  redis_      │  │   nginx-   │         │  │
│  │  │  exporter  │  │  exporter    │  │ exporter   │         │  │
│  │  │   :9187    │  │   :9121      │  │  :9113     │         │  │
│  │  └──────┬─────┘  └───────┬──────┘  └──────┬─────┘         │  │
│  │  ┌──────┴────────────────┴────────────────┴──────┐         │  │
│  │  │         pushgateway (:9091)                   │         │  │
│  │  └─────────────────────────────────────────────┘         │  │
│  │         │                                                 │  │
│  │         ▼                                                 │  │
│  │  ┌──────────────────────────────────┐                     │  │
│  │  │      grafana (:3000)             │                     │  │
│  │  │  dashboards + alerting + UI      │                     │  │
│  │  └──────────────────────────────────┘                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 服務清單

| # | 服務 | Image | 用途 | 環境 | Dockerfile | 備註 |
|---|---|---|---|---|---|---|
| 1 | postgres | `postgres:17.4` | DB | 全 | 官方 | 外部 image |
| 2 | redis | `redis/redis-stack:7.4.0-v3` | Cache / Session | 全 | 官方 | 外部 image |
| 3 | migration | `rust-api:${IMAGE_TAG}` | DB migration | 全 | 源倉 `rust-api/` | one-shot、restart: no |
| 4 | rust-api | `rust-api:${IMAGE_TAG}` | Backend server | 全 | 源倉 `rust-api/` | port 11081、healthcheck、prod 2 replicas |
| 5 | base-web | `base-web:${BASE_WEB_TAG}` | Frontend SPA | 全 | 源倉 `base-web/` | Vite + nginx、port 8080 |
| 6 | front-nginx | `nginx:1.27-alpine` | Reverse Proxy | 全 | 官方 | mount `deploy/front-nginx/conf.d` |
| 7 | acme | `neilpang/acme.sh:latest` | TLS cert mgr | prod | 官方 | `profile: ["prod"]`、daemon |
| 8 | cleanup | `rust-api:${IMAGE_TAG}` | Job(log cleanup) | 全 | 源倉 `rust-api/` | `profile: ["jobs"]`、`run --rm` 觸發 |
| 9 | loki | `grafana/loki:3.4` | Log storage | 全 | 官方 | 7d retention |
| 10 | promtail | `grafana/promtail:3.4` | Log collector | 全 | 官方 | mount `docker.sock` |
| 11 | prometheus | `prom/prometheus:v2.55.1` | Metrics TSDB | 全 | 官方 | 7d retention |
| 12 | grafana | `grafana/grafana:11.3.0` | Dashboards | 全 | 官方 | provisioning |
| 13 | postgres_exporter | `prometheuscommunity/postgres-exporter:v0.16.0` | Metrics | 全 | 官方 | DSN_FILE secret |
| 14 | redis_exporter | `oliver006/redis_exporter:v1.66.0` | Metrics | 全 | 官方 | JSON 格式 secret |
| 15 | nginx-exporter | `nginx/nginx-prometheus-exporter:1.3.0` | Metrics | 全 | 官方 | scrape `:8081/stub_status` |

### 6.3 Port 配置矩陣(rev1 1XXXX → rev2 2XXXX)

| 服務 | rev1 dev | rev1 prod | rev2 dev | rev2 prod | 容器內 | 綁定 | 備註 |
|---|---|---|---|---|---|---|---|
| front-nginx HTTP | `127.0.0.1:11080:80` | `0.0.0.0:11080:80` | `127.0.0.1:21080:80` | `0.0.0.0:21080:80` | `:80` | host | SPA + `/api/` proxy |
| front-nginx HTTPS | `127.0.0.1:11443:443` | `0.0.0.0:11443:443` | `127.0.0.1:21443:443` | `0.0.0.0:21443:443` | `:443` | host | TLS |
| rust-api 直連 | `127.0.0.1:11081:11081` | 無 | `127.0.0.1:21081:21081` | 無 | `:11081` | localhost | dev debug |
| postgres | `127.0.0.1:15432:5432` | 無 | `127.0.0.1:25432:5432` | 無 | `:5432` | localhost | psql dev |
| redis | `127.0.0.1:16379:6379` | 無 | `127.0.0.1:26379:6379` | 無 | `:6379` | localhost | redis-cli dev |
| grafana | `127.0.0.1:13000:3000` | (obs 關) | `127.0.0.1:23000:3000` | (obs 關) | `:3000` | localhost | UI |
| prometheus | `127.0.0.1:13090:9090` | (obs 關) | `127.0.0.1:23090:9090` | (obs 關) | `:9090` | localhost | scrape UI |
| pushgateway | `127.0.0.1:19091:9091` | (obs 關) | `127.0.0.1:29091:9091` | (obs 關) | `:9091` | localhost | cleanup push |
| 其他 obs(loki/promtail/exporter) | 無 host 映射 | 無 | 無 | 無 | 各自 | internal | 容器間 |

**關鍵 insight**:
- rev1 用 1XXXX 前綴,rev2 規劃 2XXXX(±1000 差距),兩個 workspace 可並存於同台機器
- dev 全綁 `127.0.0.1`(loopback only);prod 綁 `0.0.0.0`
- prod 不暴露 rust-api / postgres / redis(容器內部通訊);dev 為便於調試全暴露

### 6.4 Network 拓撲

| Network | Driver | 範圍 | 服務 |
|---|---|---|---|
| `internal` | bridge | 全 app + obs scrape | postgres, redis, migration, rust-api, base-web, front-nginx, acme, cleanup + 所有 obs service |
| `observability` | bridge | obs 內部 | loki, promtail, prometheus, grafana, postgres_exporter, redis_exporter, nginx-exporter, pushgateway |

關鍵機制:
- `observability.yml` 引入時,`internal` 作為 `external: true`(不重複定義)
- obs service 透過 `internal` 訪問 app service(如 prometheus scrape `rust-api:11081/metrics`)
- obs service 透過 `observability` bridge 互相通訊(如 promtail → loki)

### 6.5 Volume 配置

**named volumes**:

| Volume | Service | Mount | 類型 |
|---|---|---|---|
| `postgres_data` | postgres | `/var/lib/postgresql/data` | 持久化 |
| `redis_data` | redis | `/data` | 持久化 |
| `front_nginx_certs` | front-nginx(RO) + acme(RW) | `/etc/nginx/certs` | TLS cert |
| `loki_data` | loki(RW) | `/loki` | 持久化 |
| `prometheus_data` | prometheus(RW) | `/prometheus` | 持久化 |
| `grafana_data` | grafana(RW) | `/var/lib/grafana` | 持久化 |

**bind mounts(readonly)**:

| Host Path | Container Path | Service |
|---|---|---|
| `./deploy/front-nginx/conf.d` | `/etc/nginx/conf.d:ro` | front-nginx |
| `./deploy/front-nginx/snippets` | `/etc/nginx/snippets:ro` | front-nginx |
| `./deploy/dev-certs` | `/etc/nginx/certs:ro` | front-nginx(dev only) |
| `./deploy/loki-config.yml` | `/etc/loki/local-config.yaml:ro` | loki |
| `./deploy/promtail-config.yml` | `/etc/promtail/config.yml:ro` | promtail |
| `./deploy/prometheus.yml` | `/etc/prometheus/prometheus.yml:ro` | prometheus |
| `./deploy/prometheus-rules` | `/etc/prometheus/rules:ro` | prometheus |
| `./deploy/grafana-provisioning` | `/etc/grafana/provisioning:ro` | grafana |
| `/var/run/docker.sock` | `/var/run/docker.sock:ro` | promtail |

### 6.6 Profile 機制

```yaml
services:
  acme:
    profiles: ["prod"]          # prod baseline 不啟、--profile prod 才啟
  cleanup:
    profiles: ["jobs"]          # docker compose run --rm cleanup 或 --profile jobs

# observability.yml + prod override:
  loki / promtail / prometheus / grafana / *_exporter:
    profiles: ["observability"] # prod 必須 --profile observability 啟動;dev 無此 profile(always-on)
```

| 模式 | 命令 | acme | cleanup | obs |
|---|---|---|---|---|
| dev default | `compose -f docker-compose.yml -f docker-compose.dev.yml up -d` | ❌ | ❌ | ✅ always-on |
| prod baseline | `compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | ❌ | ❌ | ❌ gated |
| prod + acme | 同上 + `--profile prod` | ✅ | ❌ | gated |
| prod + obs | 同 baseline + `--profile observability` | ❌ | ❌ | ✅ |
| cleanup 觸發 | `compose run --rm cleanup --execute` | ❌ | ✅ one-shot | ❌ |

### 6.7 環境變數與 Secrets

**`.env`(非機密)**:
```ini
COMPOSE_PROJECT_NAME=rev1-admin       # (rev2: rev2-admin)
TZ=Asia/Shanghai
POSTGRES_USER=soybean
POSTGRES_DB=soybean_admin_rust
IMAGE_TAG=rev1-admin-rust-api          # (rev2: rev2-admin-rust-api)
BASE_WEB_TAG=rev1-admin-base-web       # (rev2: rev2-admin-base-web)
```

**Secrets(11 個)**:

| Secret | 用途 | Service |
|---|---|---|
| `jwt_secret` | JWT HS256 金鑰 | rust-api |
| `database_url` | DB 連線 URL(含密碼) | migration, rust-api |
| `redis_url` | Redis 連線 URL | rust-api |
| `postgres_password` | DB 純密碼 | postgres |
| `redis_password` | Redis 純密碼 | redis |
| `refresh_token_secret` | refresh JWT 金鑰 | rust-api |
| `cleanup_database_url` | cleanup 專用 DB URL | cleanup |
| `acme_email` | Let's Encrypt 聯絡 email | acme |
| `grafana_admin_password` | Grafana admin 密碼 | grafana |
| `postgres_exporter_dsn` | exporter DSN | postgres_exporter |
| `redis_exporter_password` | JSON 格式 `{"redis://addr":"pwd"}` | redis_exporter |

**Secret 注入機制**:

1. **`_FILE` pattern**:service env var 指 `/run/secrets/<name>` 路徑,application 讀檔
   ```yaml
   environment:
     APP_JWT_JWT_SECRET_FILE: /run/secrets/jwt_secret
     POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
   ```

2. **Shell expand wrapper**(migration / redis / cleanup):
   ```yaml
   entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]
   command: ["sh", "-c", "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]
   ```
   `$$` 為 docker-compose YAML → shell 的轉義。

3. **Dual-write 紀律(critical)**:
   - `database_url.txt` 內 password 段 ≡ `postgres_password.txt` 內純值
   - `redis_url.txt` 內 password 段 ≡ `redis_password.txt` 內純值
   - `postgres_exporter_dsn.txt` 內 password 段 ≡ `postgres_password.txt` 內純值

### 6.8 `deploy/` 目錄結構

```
deploy/
├── README.md
├── generate-dev-cert.sh               ★ rev1 W-F6: 生成 dev 自簽 cert
├── cleanup/
│   └── setup-role.sql                 ★ rev1 F12: Postgres cleanup_job 角色初始化
├── dev-certs/                         ★ rev1 W-F6
│   ├── README.md
│   ├── fullchain.pem                  (self-signed cert,年度 renew)
│   └── privkey.pem                    (private key,勿 commit)
├── front-nginx/
│   ├── README.md
│   ├── conf.d/
│   │   ├── default.conf               (dev HTTP + HTTPS server block)
│   │   ├── default.conf.prod          (prod HTTP → HTTPS redirect + resolver)
│   │   └── stub_status.conf           (metrics endpoint :8081)
│   └── snippets/
│       └── proxy_headers.inc          (X-Forwarded-* + Host header)
├── prometheus.yml                     (rev1 044 W-F13: 7 scrape_configs + pushgateway)
├── prometheus-rules/                  (Phase 5 填 alert rules)
├── loki-config.yml                    (rev1 044 W-F12)
├── promtail-config.yml                (rev1 044 W-F12)
├── grafana-provisioning/
│   ├── datasources/
│   │   ├── prometheus.yml
│   │   └── loki.yml
│   ├── dashboards/
│   │   ├── dashboards.yml             (provider)
│   │   ├── master-overview.json
│   │   ├── rust-api-detail.json
│   │   ├── postgres-detail.json
│   │   ├── redis-detail.json
│   │   ├── observability-self.json
│   │   └── audit-pipeline-detail.json
│   └── alerting/
│       └── alert-rules.yml            (rev1 044 W-F14)
└── secrets/
    ├── README.md                      (詳細說明、雙寫紀律)
    ├── *.example                      (範本檔)
    └── [實際 .txt gitignored]
```

### 6.9 設計理由摘錄(來自 yaml comment)

1. **Secret 雙層機制(rev1 W-F4)**:secrets 為 tmpfs read-only + mode 0444;service 透過 `_FILE` 或 shell wrapper 讀取。**理由**:env var 易洩漏到 `/proc/self/environ`,secrets 更安全且支援 swarm / k8s。

2. **Observability 預設 always-on(dev)vs opt-in(prod)**:base 無 profiles → dev include 即得 7 service;prod 加 `profiles: ["observability"]` → opt-in。**理由**:Compose 不支援 override 移除既有 profiles,gating 統一由 prod 加。

3. **front-nginx conf.d 雙版本(dev vs prod)**:
   - dev `default.conf`:純 HTTP:80 + HTTPS:443,**無** HTTP → HTTPS redirect
   - prod `default.conf.prod`:HTTP:80 走 ACME challenge + redirect 443;HTTPS:443 加 `resolver`(支援 docker DNS 動態變化、replica scaling)
   - **理由**:dev 開發者不想被強制 HTTPS(自簽 cert 瀏覽器 warning 煩);prod 需 HTTPS + ACME challenge 在 80 port。

4. **nginx upstream `keepalive` / `resolve`**:
   - dev:`server rust-api:11081;` + `keepalive 32;`(固定單點)
   - prod:`zone rust_api 64k;` + `server rust-api:11081 resolve;` + `keepalive 32;`(動態解析、replica scaling)
   - **理由**:rev1 W-F11 prod 2 replica,nginx 需能偵測 DNS 變化自動加入新 replica。

5. **postgres / redis 密碼 dual-write**:`database_url.txt` 內 password 段 ≡ `postgres_password.txt` 純值。**理由**:容器 postgres / redis 分別從 secret 讀密碼,app 又從另一 secret 讀 URL;不一致 → 連線認證失敗 → `/health` unhealthy。

6. **cleanup service one-shot 設計(rev1 F12)**:`profile: ["jobs"]` + `restart: "no"` + `docker compose run --rm cleanup --execute` 觸發。**理由**:cleanup 只需定期執行,不需常駐;cron 呼叫比 container timer 更 robust。

7. **acme.sh daemon 模式(rev1 W-F6)**:`profile: ["prod"]` + `command: ["daemon"]`(不退出、持續監聽 cert 過期)。實際 cert acquisition 留後續(需公網 + DNS)。**理由**:daemon 模式週期檢查 cert 有效期、自動 renew。

8. **redis-exporter JSON secret(044)**:`REDIS_PASSWORD_FILE` 期望 JSON 格式(非 plain text),image distroless 無 sh。**理由**:image entrypoint 固化、無 sh 無法 shell 展開;故另建 JSON 格式 secret。

### 6.10 對 rev2 的繼承重點與調整項

#### 直接照搬

- **網路拓撲**:internal + observability 雙 bridge
- **Volume 持久化策略**:named volume 為主、bind mount 配置檔為輔
- **Secret 注入 `_FILE` pattern**:全面採用
- **observability dual-layer**:base always-on + prod gating
- **Grafana 自動配置**:`provisioning/` 目錄手工編輯
- **nginx upstream resolve**:prod 加 resolve 支援 replica
- **cleanup 角色分離**:Postgres role 最小權限(rev1 F12)
- **Loki 7d retention**:dev BoltDB + filesystem(prod 需 cloud storage 為 future)

#### 必須調整

- **Port 前綴**:1XXXX → 2XXXX(rev2 CLAUDE.md §8.2 已明文)
- **`COMPOSE_PROJECT_NAME`**:`rev1-admin` → `rev2-admin`
- **image tag**:`rev1-admin-rust-api` / `rev1-admin-base-web` → `rev2-admin-*`
- **rust-api 源倉**:`fork260509-soybean-admin-rust` → `fork260509-rev2-anew-rust-api`(rev2 分支)

#### rev2 前置工作清單

1. 複製 `deploy/` 目錄結構(改 project name / tag)
2. 複製 `docker-compose.yml` 基礎(改 project name + image tag)
3. 複製 `docker-compose.dev.yml`(改 port 前綴 2XXXX)
4. 複製 `docker-compose.prod.yml`(改 nginx conf.d 路徑 + replica 設定)
5. 複製 `docker-compose.observability.yml`(無改動,全量複製)
6. 編輯 `.env.example`(`COMPOSE_PROJECT_NAME=rev2-admin` + image tag)
7. 保留 `deploy/secrets/*.txt.example`(內容無改動)
8. 執行 `bash deploy/generate-dev-cert.sh` 生成 rev2 dev 自簽 cert
9. `deploy/front-nginx/conf.d/default.conf*` 通常無改動(`server_name _` 已通用)
10. Sanity check:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up`

#### rev2 `docker-compose.dev.yml` port 落地清單

```yaml
services:
  front-nginx:
    ports:
      - "127.0.0.1:21080:80"
      - "127.0.0.1:21443:443"
  rust-api:
    ports:
      - "127.0.0.1:21081:11081"
  postgres:
    ports:
      - "127.0.0.1:25432:5432"
  redis:
    ports:
      - "127.0.0.1:26379:6379"
  prometheus:
    ports:
      - "127.0.0.1:23090:9090"
  grafana:
    ports:
      - "127.0.0.1:23000:3000"
  pushgateway:
    ports:
      - "127.0.0.1:29091:9091"
```

---

## §7 rev2 起點行動建議

### 7.1 落地優先序(綜合 §2/§3/§6 結論)

| Phase | feature | 依賴 | rev1 對應 |
|---|---|---|---|
| **Setup** | 創 `docs/INTEGRATION-CHECKLIST.md`(進度單一真相)+ Constitution v1.0.0(`.specify/memory/constitution.md`) | 無 | rev1 既有 |
| **P0 部署基建** | rev1 W-F1 dockerfile-rust-api | 無 | 006 |
| | rev1 W-F2 dockerfile-base-web | 無 | 007 |
| | rev1 W-F6 TLS dev/prod cert skeleton | 無 | 012 |
| | rev1 W-F7 port-mapping(2XXXX) | W-F1/W-F2/W-F6 | 011 |
| **P1 基礎設施** | rev1 F1.1 jwt-secrets(strict + `_FILE`) | 無 | 004 |
| | rev1 F3 soft-delete-infrastructure(7 entity + facade + CI lint) | 無 | 002 |
| | rev1 F4 response-shape-alignment(envelope `{data, code, msg}` 無 success + camelCase,對齊 audit §4.1 + [followup §1.2](INTEGRATION-RESEARCH-FOLLOWUP.md) mock 真實 shape) | 無 | 001 |
| | rev1 F2 audit-log-infrastructure(schema + AuditEvent) | F3 | 003 |
| **P2 認證 + 動態 menu** | rev1 F5.1 auth-login + getUserInfo + getUserRoutes + Casbin enforce | F1.1+F2+F3+F4 | 005 |
| | rev1 F6 route-guard(`/route/isRouteExist`) | F5.1 | 013 |
| | **rev1 W-F11(併入 P2)** Casbin redis pub-sub channel(v1 即啟用) | F5.1 | 026 |
| **P3 主流業務** | rev1 F7 manage-crud-alignment(Output DTO + shape mapping) | F5.1 | 022 |
| | rev1 F8 assign-users(`/authorization/assign-users`) | F5.1+F7 | 025 |
| | rev1 F9 systemManage-alias-router(10 條 thin wrapper) | F7+F8 | 021 |
| **P4 補位 + 抽離項** | rev1 F13 rust-refresh-token-impl | F5.1 | 028 |
| | rev1 F11 extracted-stubs(4 條 stub + Casbin seed) | F9 | 020 |
| | rev1 F12 cleanup-job(dry-run 預設、cron) | F2+F3 | 027 |
| **P5 觀察性(可選)** | rev1 W-F12 promtail + loki | P0 完 | (044) |
| | rev1 W-F13 prometheus + 3 exporter + pushgateway | W-F12 | (044) |
| | rev1 W-F14 grafana + alerting | W-F13 | (044) |
| **P6 維護** | status / gender alignment + base-web CDP 全功能巡檢 | 全 P 完 | 030 |

### 7.2 rev2 啟動對稱盤點(借鑑 rev1 F29 pre-cutover 紀律)

rev1 在 F29 cutover 前做了盤點,捉到 R3(code namespace)+ R4(secret example)兩項漏項。rev2 起點即 B,**應做對稱盤點**確認以下完整性:

- [ ] `application.yaml` placeholder 完整(無 `<TO_BE_SET>` 殘留)
- [ ] `.env.example` 與 `deploy/secrets/*.txt.example` 是否齊備(11 個 secret 範本檔)
- [ ] Casbin policy seed 是否完整覆蓋預期 role × endpoint 矩陣(3 role × 主流 endpoint)
- [ ] migration files 順序正確(`m20241024_*` 等 timestamp 連續、無 jump)
- [ ] `sys_user` 預設帳號命名待 rev2 spec phase 0 brainstorm 拍板(plaintext = `123456`,argon2id)
  - **選項 (a)** 延用 rev1 命名:`Soybean / Administrator / GeneralUser`(rev1 自家 migration seed)
  - **選項 (b)** 對齊 base mock([followup §4.1](INTEGRATION-RESEARCH-FOLLOWUP.md)):`Super / Admin / User`(login req userName);但注意 `User` 在 getUserInfo response 顯示為 `User01`(mock 內部 alias),rev2 需決定 displayName 是 `User` 還是 `User01`
  - role 命名 mock 完整三組為 `R_SUPER / R_ADMIN / R_USER_COMMON`(audit §4.4 後補,見 followup §4.1)
- [ ] graphify-out/ 是否落地(rev2 CLAUDE.md §2 中 ⏳ 標示)

### 7.3 rev2 與 rev1 已知 follow-up 對應

下表列出 rev1 follow-up backlog 對 rev2 的影響:

| rev1 follow-up | rev2 立場 |
|---|---|
| 042-N4 audit latency 可選優化 | 條件觸發,rev2 觀察 |
| 042-N5 dev-compose multi-replica setup | dev stack 限制,rev2 prod 才需 |
| 048-N1(d) pnpm upgrade trigger | 已於 049 處理,rev2 直接採用 pnpm 11 終態 |
| rev1 050-N1 cleanup-binary `SECRET_FILE` pattern | rev2 落地 F12 時直接採 `_FILE` pattern |
| rev1 F1.2 JWT key versioning | 長期 backlog,rev2 v1 暫不做 |
| rev1 W-F6b acme.sh 真實 cert | 長期,需公網 + domain + DNS provider |
| rev1 W-F15/16 backup + DR | 長期,生產上線後 |
| rev1 W-WEBUI-INIT-DEFENSE base-web refresh token stale localStorage | rev2 若採 W-WEBUI 軌道改 UI 需注意 |

### 7.4 rev2 設計紀律(從 rev1 共通教訓提煉)

rev2 應以下列紀律啟動 spec-kit feature 工作流(對應 CLAUDE.md §3):

1. **「Atomic increment」**:每個 feature 的 schema + code + test + doc 必須原子交付,單一片段交付禁止 commit。
2. **「Wire DTO 三端對齊」grep**:Phase 0 research 強制 grep rust handler return type + base-web inline type + component state(CLAUDE.md §3 已明文)。
3. **「三重防護」**:類型系統 + facade module + CI grep,所有 sensitive operation(軟刪、audit、JWT secret)都需此三層。
4. **「acceptance 階段 catch → spec 收為新 feature」modal pattern**:當下不擴張 scope,登記為下一個 feature。
5. **「dev/prod 顯式切換」**:絕不用 `docker-compose.override.yml` auto-load,所有環境切換用 `-f -f` 顯式。
6. **「CDP smoke 不可省」**:base-web 改動的 acceptance 必須含 CDP browser smoke test,不可用 curl 直送替代(curl ≠ base-web modal 對齊)。
7. **「pub-sub 永遠啟用、不靠環境分支」**(rev1 W-F11 教訓):Casbin redis pub-sub 從 v1 即啟用,即使單 instance。

---

## §8 附錄:研究方法與 agent 派遣紀錄

本研究由主 context 派遣 6 個 Explore subagent 分頭執行,並在主 context 整合:

| Agent | 任務 | 輸出量 |
|---|---|---|
| 1 | rev1 docs(7 份 INTEGRATION-* + GRAPHIFY-NOTES) | ~3000 字 |
| 2 | rev1 superpowers 001–013(13 份 feature) | ~2500 字 + meta |
| 3 | base-web git diff `28807d40..64af823b`(21 commit) | ~1800 字 |
| 4 | rust-api 技術棧 + workspace 結構 | ~2500 字 |
| 5 | deploy/ + docker-compose.*.yml 容器拓撲 | ~4500 字 |
| 6 | rev1 superpowers 014–030(17 份,補完) | ~2200 字 + meta |

**參考來源**:
- `/home/anew/x_Project/fork260509-rev1/docs/`
- `/home/anew/x_Project/fork260509-rev1/docs/superpowers/`
- `/home/anew/x_Project/fork260509-rev1/base-web/` git history
- `/home/anew/x_Project/fork260509-rev1/rust-api/` workspace Cargo.toml + sub-crate
- `/home/anew/x_Project/fork260509-rev1/deploy/` + `docker-compose.{,dev,prod,observability}.yml`

**研究日期**:2026-05-26
**研究者**:Claude(Opus 4.7 1M context, /effort max)
**本檔狀態**:rev2 整合研究單一真相,後續 spec-kit feature 啟動時應引用本檔結論

---

## §9 研究心得(2026-05-26)

研究完一輪 rev1 後最深的幾點觀察,留作 rev2 規劃時的反思參照。

### 9.1 rev1 是個極高密度的設計實驗田

14 天累積 30 個 feature(rev1 F1~F14 + W-F1~W-F14 + 040~052 follow-up),每個都走完整 brainstorm → spec → plan → tasks → implement → review 流程,還在 `superpowers/` 沉澱 acceptance 階段的 friction。這個密度在「個人 workspace」是罕見水準,基本上是「**Claude Code + spec-kit + superpowers + 持久記憶**」這套工作流組合的可行性證明。

### 9.2 rev1 DESIGN-A 的存在價值不只是「過渡」

rev2 起點即 B 看起來省事,但實際是**繼承了 A 已經繳過的學費** —
- `>>>>> TRANSITIONAL` marker 機制
- 跨服務 `_FILE` secret pattern
- `TokenStatus` enum 字串對齊的純函式 mapping
- rev1 F10 / F10.1 / F10.2 三輪 friction modal pattern

這些都流回 DESIGN-B 成為更好的設計。rev2 不會踩這些雷,但也不會發明這些 pattern;**rev1 在 NestJS 過渡期付出的真實成本,是 rev2 直接拿到的設計資產**。

### 9.3 最珍貴的紀律不是「不犯錯」,而是「錯了能擋住」

F2 軟刪三重防護(類型 trait 封閉 + facade module + CI grep lint)是 rev1 紀律的縮影 — rev1 顯然知道「`ActiveModel.delete()` 仍能繞過 facade」,所以用三層機制擋。這比「教條地堅持紀律」更務實。

**rev2 應該把這個「三重防護」模板套用到 audit、JWT secret、cleanup credential 等所有 sensitive 操作上**。

### 9.4 Constitution v1.0.0 → v1.6.0 六次 amendment 揭示「原則演化的健康節奏」

每次 amendment 都是「base 不改」撞上現實需求(密碼欄、型別對齊、依賴清潔),最後把 exception 明文化為新軌道(rev1 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene)。

這比「碰到例外就棄守」或「死守原則」都健康 —— 原則本身有版本化、有 amendment trail。

### 9.5 對 rev2 的關鍵提醒:觀察性 stack 是不是要早做?

rev1 的部署設計(15 service + dual network + 11 個 secret + profile gating + 6 個 dashboard)對「個人 workspace」是 over-engineered 的。rev1 自己在 W-F11 / 044 brainstorm 也有過「是不是太早做」的對話。

**rev2 可以考慮**:P5 觀察性 stack(rev1 W-F12/13/14)真的要早早建嗎?還是等 P3 業務跑起來、有實際量產壓力或調試需求再建?這是值得親自拍板的取捨,不該照搬。

> ✅ **2026-05-27 [followup §8](INTEGRATION-RESEARCH-FOLLOWUP.md) 拍板三段式啟動**:
> - **P0-P3(setup + 業務跑通)**:**完全不啟 obs**,rev2 docker-compose 只含 5 service(postgres / redis / rust-api / base-web / front-nginx)
> - **P3 後半 / P4 中段(業務驗收 + 抽離項補位)**:啟 promtail + loki + grafana 三件套(純 log,0.5-1 人日)— 拆出 `docker-compose.obs-min.yml`
> - **P5 或 P6(production-ready)**:加 prometheus + 3 exporter + pushgateway + grafana alerting(完整 stack,2-3 人日)— `docker-compose.obs-full.yml`
>
> 對應 rev1 all-or-nothing 的 `docker-compose.observability.yml` 改為 rev2 拆檔的 min/full 雙軌策略。

### 9.6 graphify 的盲點要慎重

11 條已知限制裡,Rust macro 展開(`merge_router!` 漏 12 個 call)+ trait dispatch 漏邊,代表「graphify 給的 call graph」對 Rust 中下層其實是 partial truth。

**對 rev2**:別把 graphify 結論當決策依據,當啟發即可,微觀細節一律直接讀 source。

> ✅ **2026-05-27 [followup §9](INTEGRATION-RESEARCH-FOLLOWUP.md) 拍板 rev2 graphify 應用策略**:
> - **首次跑時機**:**P3 完**(manage CRUD 全跑通)— 業務骨架成型、cohesion 問題可發現;P1 太早(結構未成型)、P5 後增量 `update` 即可
> - **範圍精控**:`.graphifyignore` 排除 alova / function / plugin / pro-naive / multi-menu 等 demo 目錄 + `_*/` elegant-router ignore convention + `node_modules` / `target` / `migration/migrations`
> - **不信任清單**:Rust macro 展開的 route 註冊 / Vue component 引用 / trait dispatch — 全靠 grep 真實 source 驗證
> - **rev2 自動消失的盲點**:NestJS DI 破碎 + 22 module 孤立(因 rev2 無 nestjs)
> - **紀律**:每 feature 落地後跑增量 `graphify update`,brainstorm 階段才用 graphify query,實作時直讀 source

### 9.7 結語

> rev1 留給 rev2 的最大資產**不是「設計藍圖」,而是「30 個 feature 的踩雷紀錄」**。
> 藍圖會過期,踩過的雷不會。

---

## §10 rev2 重開的設計動機(2026-05-26 記錄)

> 本節記錄 user 在研究階段同步給出的 rev2 重開動機,作為後續 spec-kit feature 啟動時的判據根源。
> 動機尚未完整、§10.2+ 待 user 補完;§10.3 設計含義整合留待動機齊全後寫入。

### 10.1 動機一:rev1 base-web 改動幅度過大,影響 upstream pull-ability

**現況**:
- base-web 是 fork 自 `soybeanjs/soybean-admin` 的 `example` branch
- rev1 在 `rev1-admin-base-web` 分支累積 21 個 commit(W-F2 部署 + W-FW1~W-FW9 CRUD 接線 + 048 typings 對齊 + 049 dep hygiene)
- 改動範圍涵蓋:
  - `Dockerfile`(新增,部署用)
  - `deploy/nginx.conf`(新增,部署用)
  - `src/views/manage/{user,menu,role}/`(視圖層 CRUD 接線)
  - `src/service/api/system-manage.ts`(9+ 個新 endpoint wrapper)
  - `src/typings/api/`(型別對齊到 rust wire 真實序列化型)
  - `pnpm-workspace.yaml` / `package.json`(依賴清潔)

**rev1 的實做結果**:雖然每個整合進 base-web UI 的功能最終都能正常操作(CRUD / login / 動態菜單 / 授權 modal 皆通),但**改動幅度對 upstream rebase 不友善** — 特別是 `src/views/manage/` 與 `src/service/api/` 是 soybeanjs 持續演進的目錄,衝突機率高。

**rev2 目標**:
保留 base-web 對 upstream `soybeanjs/soybean-admin example` 分支的 **pull-ability** — 上游有更新時,rev2 能順利 `git rebase upstream/example`(或對等操作)而不陷入大量手工解 conflict。

**rev1 對應的 21 個 commit 中,對 upstream 友善度大致排序**(差 → 好):

| 風險級 | commit 類別 | rev1 commit |
|---|---|---|
| 高(改 upstream 演進目錄) | rev1 W-FW1~W-FW9 視圖層 CRUD 接線 | 10 個 commit(`1793b361` 起到 `496f301b`) |
| 中(改 upstream 演進目錄,但偏接線層) | service/api/system-manage.ts 新增 wrapper | (隨 W-FW 系列一併) |
| 中(改 build / dep config) | 048-049 dep hygiene + pnpm 升級 | 5 個 commit |
| 低(只動 typings) | 048 typings/api 對齊 rust wire | 1 個 commit(`4e05d478`) |
| 低(新增獨立檔,無 upstream 衝突) | rev1 W-F2 Dockerfile + deploy/nginx.conf | 2 個 commit |
| 雜務(改 .env 設定) | rev1 F4 VITE_SERVICE_SUCCESS_CODE config | 1 個 commit |

### 10.2 動機二:rev1 雙後端研究結論 — nestjs 沒特別好接、最終都用 rust-api

**rev1 的起點研究目的**:評估 `soybeanjs/soybean-admin-rust` + `soybeanjs/soybean-admin-nestjs` 兩個後端能否與 base-web 對接,作為整合練習的雙軌參考。

**rev1 的實做結論(user 感受,2026-05-26)**:
- rev1 DESIGN-A(rust + nestjs bridge)→ DESIGN-B(rust-only)的整個演化過程中,**nestjs 沒有提供特別好的對接方式**
- 最終 base-web 都是直接呼叫 rust-api、nestjs 退場(rev1 F29 cutover)
- user 不能完全確認過程中是否「**不知不覺借了 nestjs 程式碼作為實作參考**」(例如 prisma schema 命名、CQRS module 結構、refresh token rotation 邏輯細節等可能在 brainstorm 階段隱性流入 rust-api 設計)

**rev2 的設計回應**:
- **rust-api 從 0 重構**(同 §10.3 Q2)
- **rev2 工作區不含 nestjs 源倉**(已驗證:CLAUDE.md §2 列出的源倉只有 base / docs / rev2-anew-rust-api 三個)
- 結果:rev2 強制「base-web 期望什麼,rust-api 就提供什麼」,**沒有 nestjs 作為「偷看答案」的可能**
- rev2 成為**「純粹的 base-web 適配練習」**

**對 rev1 設計沉澱的再評估**(動機二後修正 §3 的分類):
- rev1 superpowers/014~017(nestjs bridge 系列)+ 029(cutover):已標 `[REV1-ONLY]`,正確
- rev1 superpowers/018~019(rust-jwt + tokenstatus align):rev1 為 nestjs 做的 alignment 工作標 `[REFERENCE]`,但 rev2 在動機二下 **可以更激進地拋棄這些 alignment** — 不必對齊 nestjs 的 snake_case enum、不必 HS256 簽 refresh、可全用 base mock 的型作為唯一真理
- rev1 superpowers/028(rust-refresh-token-impl,F13 自實作):rev2 從 0 寫時,refresh token 邏輯**直接針對 base mock 的 `/auth/refreshToken` wire shape 設計**,不必對齊 nestjs 的 status string

**動機二對 §3.10 共通教訓主題的補充**:
- 新增第 9 條紀律:**「源碼隔離」**— rev2 每個 feature 的 spec phase 0 research,只允許 grep `rust-api/`(rev2 自己)+ `base-web/`(wire 真理);**不准 grep rev1 程式碼、不准 grep nestjs 程式碼**,避免「答案污染」。rev1 文件可讀,但 rev1 / nestjs 的 source 不讀。

### 10.3 rev2 整合策略 Q&A(2026-05-26 拍板)

> 研究階段 Claude 對 user 提出 3 個關鍵問題,user 拍板答案如下。本節為**設計判據快照**,後續所有 spec-kit feature 啟動時皆應引用本節結論。

#### Q1:base-web 改動的可接受邊界 → **L2 為主,需授權才能升 L3,且兩級都「以新增程式碼為原則,不動 inline」**

**L2 邊界(預設可動)**:`src/typings/api/*.d.ts`(對齊 rust wire 型)
**L3 邊界(需另外授權)**:`src/service/api/`(新增 endpoint wrapper)
**禁區(原則不動)**:`src/views/`、`src/router/`、`src/store/`、`src/locales/` 等 upstream 持續演進的目錄

**「新增 vs 改 inline」紀律**(L2 / L3 共通):
- 優先做法:新增獨立檔(如 `src/typings/api/rev2-systemManage.d.ts`、`src/service/api/rev2-system-manage.ts`)
- 退路:在既有檔內**只新增 type / function**,不改既有 type / function 的 inline 程式碼
- 禁:rewrite 既有檔的既有程式碼(=會直接 conflict upstream)

**對比 rev1**:rev1 走 L4(改 `src/views/manage/`),rev2 直接退兩級到 L2/L3 + 加「新增不改 inline」紀律。

#### Q2:rust-api 是否從 0 搭建 → **是,整個重構**

- repo:`fork260509-rev2-anew-rust-api`(repo 名含「anew」即「全新」)
- branch:`rev2-admin-rust-api`(從 main 衍生,但 main 即為新起點)
- **不**繼承 rev1 rust-api 的程式碼
- **必須技術棧**:`axum` + `sea-orm` + `casbin` + `jsonwebtoken`(其他自由)
- **核心目的**:讓 rust-api 最大化配合 base-web example 既有 wire 形狀(對齊方向反轉 — 後端適應 base,而非 base 適應後端)

**含義**:
- §5 修正:rev2 不繼承 rev1 程式碼,只繼承設計+踩雷紀錄(本文 §2/§3 為核心)
- rev2 技術棧可比 rev1 精簡(拿掉 mongodb / aws-sdk-s3 / 雙密碼雜湊 / 等非必需 crate,詳見 §5.5 修正表)
- rev1 superpowers 30 個 feature 是「藍圖」而非「源碼參考」— 每個 feature 在 rev2 都是**重寫實作**,但繼承 design decision

#### Q3:rev2 的成功標準 → **(a) 同 rev1:login + 動態菜單 + 完整 CRUD + 授權 modal 都跑得通**

rev2 要追求「完整管理後台 UI 跑得通」,**不**接受「退一步到 read-only」或「只跑 backend curl」。

#### Q1+Q3 的潛在衝突(待第二點動機或追問解開)

rev1 的 W-FW1~W-FW9 改了 `src/views/manage/` 把 mock 換成真 endpoint,才達成 Q3 (a) 的「完整 CRUD UI」。**rev2 限 L2/L3 + 不動 inline,如何達成 Q3 (a)?**

**已知 3 條可能路徑**(待 user 第二點或追問確認):

**路徑 A — rust-api 完全模仿 base example 的 mock wire shape**
- base example 分支的 demo CRUD UI 本來就連到 vite mock(`mock/` 目錄或 vite proxy)
- rust-api 提供與 mock 完全一致的 endpoint path + wire shape
- base-web 只需動 `.env`(改 `VITE_HTTP_PROXY` / `VITE_SERVICE_BASE_URL`)就能切到 rust-api
- 適用前提:base example 既有 mock 已涵蓋 user / role / menu / 授權 modal 等全部 endpoint
- 限制:若 mock 不全(例如沒有 menu-auth-modal 端點),則無法走純 A,需走 B 或 C

**路徑 B — base-web 升 L3 新增 service/api wrapper 補缺**
- 對 mock 沒涵蓋的 endpoint,在 `src/service/api/` 新增獨立檔(如 `rev2-extra.ts`)
- views/ 仍不動(也就不能用這些新 wrapper 在既有 views/ 內呼叫... 矛盾)
- 此路徑單獨走不通,必須搭配 A

**路徑 C — 升 L4 但限「新增 view file」**
- 允許新增 `src/views/rev2-manage/*` 並列於既有 `src/views/manage/*`,router 額外註冊
- 上游若沒改 router 入口檔,衝突低;但若 base-web router 是 unplugin auto-route 模式,可能仍有 conflict 風險
- 等同「rev2 自己寫一套並列的管理後台 UI」— 對 upstream 友善、但工作量大

**Claude 建議**:Q1+Q3 的解法很可能藏在 user 的第二點動機裡,或藏在「rust-api 從 0 搭建 → 最大化模仿 mock」的具體實踐策略中。等第二點補完再判斷。

### 10.4 設計含義整理(動機一 + 二綜合,2026-05-26 完整版)

> 動機一 + 動機二齊全後,本節整合出 rev2 的核心命題與對 spec-kit feature 啟動的具體影響。
> 但仍有一個關鍵前提需 CDP 驗證,參見 §10.5。

#### 核心命題

> **rev2 = 以 base-web example 分支既有 wire 為唯一真理,從 0 設計 rust-api 來服務它。**

兩個動機合在一起就是這句話:
- 動機一(base-web 不准大改)→ base-web wire 為「輸入」,不為「輸出」
- 動機二(rust-api 從 0 寫 + 不含 nestjs)→ rust-api 為「輸出」,只服務 base-web

#### 必然路徑:A 路徑(rust-api 模仿 base mock wire shape)

§10.3 列的 3 條路徑(A/B/C)中,A **不是「可能性」而是必然性** — 因為動機一禁止改 views/,動機二禁止用 nestjs 當參考答案。**剩下唯一邏輯路徑就是「rust-api 完全模仿 base example mock 的 wire shape」**。

#### A 路徑可行性的 3 種結果(待 §10.5 CDP 驗證後確認)

| mock 涵蓋率 | 對應策略 | base-web 改動級 |
|---|---|---|
| 100% 涵蓋 | 純 A:rust-api 完全模仿 mock | L1(只動 `.env` 切 proxy) |
| 部分涵蓋(80~95%) | A + 部分 L3 wrapper 補缺(需 user 授權) | L1 + L3(獨立檔) |
| 嚴重不足(<80%) | A + L3 + 可能需 Q3 退一步;或回頭重新討論策略 | L1 + L3 + 重新討論 |

#### 對 rev2 spec-kit feature 啟動的具體影響

**1. base-web 受管例外軌道重設**(2026-05-27 audit §4.10 alova 發現後更新):
- W-WEBUI(rev1 的軌道,改 `src/views/manage/`)在 rev2 **完全捨棄**(views/ 永遠不在軌道內)
- 改設新軌道清單(視 §10.5 mock 涵蓋率定 + audit §4.10 alova 處理選擇 + audit §5.4 Q5 Q3 達成度選擇):
  - **BASE-WEB-ADAPT 軌道**(L1+L2,預設可動):只動 `.env` + `src/typings/api/`(新增為主、不改 inline)
  - **BASE-WEB-WRAPPER 軌道**(L3,需 user 授權):允許在 `src/service/api/` 新增獨立 wrapper 檔(不動既有檔)
  - **BASE-WEB-BUILD-CONFIG 軌道**(L4 build infra,需 user 授權):管 `base-web/build/*` 改動 — 目前已知一處:若採 audit §4.10.2 (b'),需在 `build/plugins/router.ts` 加 `pageExcludePatterns: ['**/alova/**', '**/components/**']` 隱藏 alova menu;未來若需動 `package.json` / `pnpm-workspace.yaml` 等 dep config 也歸這軌
  - **MODAL-WIRING 軌道**(L4 view inline,需 user 授權,僅 audit §5.4 Q5 (B) 才需):極窄,只授權 `views/manage/*/modules/*-operate-{modal,drawer}.vue` 內 `// request` placeholder 處改 inline、其他 inline 絕對不動
- TS-Typing-Sync(rev1 既有,L2 範圍)→ 併入 BASE-WEB-ADAPT 軌道
- TS-DepGraph-Hygiene(rev1 既有,改 build/dep config)→ 併入 BASE-WEB-BUILD-CONFIG 軌道

**2. 後端適應方向反轉(對比 rev1)**:
- rev1 的 048 sprint:「base typings 對齊 rust 真實序列化型」(rust 主、base 跟)
- rev2:**「rust-api 對齊 base mock wire 形狀」**(base 主、rust 跟)
- 凡 base mock 用 ULID string,rust 就用 string;凡 base mock 用 number id,rust 就用 i64;**全以 mock 為準**
- **2026-05-27 audit §4.1 驗到實際 envelope = `{data, code, msg}`,無 `success` bool**;`code` 是 string `"0000"`(不是 number);super role 是 `R_SUPER`(不是 rev1 `ROLE_SUPER`);id 在不同 endpoint 不一致(string vs number 並存)— 詳見 audit §4 全

**3. rev1 30 個 feature 在 rev2 的對應變化**(§3 sub-table 補充):
- **W-FW1~W-FW9**(rev1 動 views/manage/):rev2 對應改為「rust-api 端模仿 mock + 不動 views/」— W-FW 系列在 rev2 不再是「base-web feature」,而是「rust-api 對齊 feature」
- **rev1 F22 / F24 / 030**(response-layer mapping 在 rust-api 端做)的 pattern,在 rev2 強化為**唯一允許的 mapping 位置**
- **rev1 F18 / F19**(rust 為對齊 nestjs 做的工作):rev2 **完全不必做**;改為對齊 base mock 的 wire shape(自由設計、無 nestjs 約束)
- **rev1 F4 response-shape-alignment**:仍是 P1 必做,但**對齊目標換成 base mock 的真實 envelope 格式**(不一定就是 `code: "0000"` — 看 mock 怎麼回)
- **rev1 F1.1 jwt-secrets**(strict + `_FILE`):紀律不變(三重防護仍要),但 `Claims` 11 fields **不必對齊 nestjs**,以 base 預期為準

**4. Constitution v1.0.0 起手條款**(rev2 自起點即適用):
- **Principle I — upstream pull-ability 為首要紀律**(對比 rev1 此原則只到 Constitution IV 等級,rev2 升頂)
- 受管例外只兩條:BASE-WEB-ADAPT / BASE-WEB-WRAPPER 軌道(rev1 W-WEBUI 不在內)
- **「新增不改 inline」**紀律明文化:任何 base-web 改動必須以新增檔案 / 新增 export 為主,改既有 inline 程式碼需走 amendment
- **「源碼隔離」**紀律(§10.2 新增第 9 條):rev2 spec phase 0 research 只 grep rust-api(rev2 自己) + base-web,不 grep rev1 / nestjs source

**5. 部署設計微調**:
- rev2 CLAUDE.md §8.2 的 port 規劃(2XXXX)維持
- 但 `docker-compose.base-web.yml`(user 剛貼出,已存在於 workspace 根)的 dev 21079 / prod 21079 是 **standalone base-web 容器化**,與整合 stack 共存:
  - **dev 21079**:user 直接看 base example UI(連 ApiFox Mock 或本地 mock,**§10.5 CDP 驗證用此 port**)
  - **prod 21079**:build + nginx serve 驗證
  - **整合 stack 21080/21443**:front-nginx 當 reverse proxy 統整入口
  - 三者無 port 衝突
- 注意:預設 `base-web/.env.prod` 指向 **ApiFox Mock API**(cloud-hosted),不是 base-web 自帶的 `mock/` 目錄 — §10.5 驗證時需確認真實 mock 來源

### 10.5 rev2 起點待辦(CDP 驗證 mock 涵蓋率)

> ✅ **已執行**(2026-05-26 ~ 2026-05-27):產出 [`docs/MOCK-COVERAGE-AUDIT.md`](MOCK-COVERAGE-AUDIT.md) + [`tests/mock-coverage-audit/`](../tests/mock-coverage-audit/)(可重跑工具)。
>
> 本節保留為「重跑指南 / 任務 spec 紀錄」。下方任務清單仍是有效執行步驟,將來 user 想對 rev2 自家 rust-api 重做驗證時可直接套用。
>
> 主要發現綜述:
> - mock 涵蓋率:base 用的 13 read endpoint 內 12 個 mock 有(`/route/getConstantRoutes` 502)
> - 新發現「兩套 request lib(axios + alova)」+ 「base example 還有 8 個 demo menu / 只 2 個業務 menu」+ 「elegant-router `pageExcludePatterns` 是隱藏 demo menu 的乾淨機制」
> - Q1+Q3 衝突 → audit §5.4 列出 5 條路徑(A/B/C/D/E)請 user 拍板
> - audit §6 第 1 條更新軌道清單,sync 至本文 §10.4 第 1 條

**驗證目的**:確認 base example 分支 mock 涵蓋率,作為 §10.4「A 路徑可行性」的決定性事實。

**環境**:
- container:`rev2-base-web-dev`(由 `docker compose -f docker-compose.base-web.yml --profile dev up -d` 啟動)
- 應用 URL:`http://127.0.0.1:21079/`
- CDP endpoint:`127.0.0.1:9229`(node debug port;實際 web request 看 chrome devtools network)

**前置作業**:
1. grep `base-web/.env*` 找 mock API base URL(預設應為 ApiFox cloud URL)
2. 檢查 `base-web/mock/` 目錄是否有本機 mock(若有為 fallback / dev mode 真實來源)
3. 啟動 dev container,確認 `http://127.0.0.1:21079/` 可訪問

**驗證步驟**:
1. CDP 連 `127.0.0.1:9229` + chrome devtools network 全程記錄
2. 開 `http://127.0.0.1:21079/`,**把左側所有功能逐一點開**:
   - 首頁 / dashboard
   - 系統管理:用戶 / 角色 / 菜單 / 端點 / etc.
   - 授權:菜單授權 modal / 按鈕授權 modal / endpoint 授權 modal
   - 帳號中心:user-center 所有面板
   - 其他 base example 自帶的 demo 頁
3. 對每個 endpoint 記錄:
   - method + path(完整 URL)
   - request body shape
   - response body shape(含 `code`、`data`、`msg`、`success` 是否有 envelope)
   - 真實 mock 來源(ApiFox cloud / `base-web/mock/` / 其他)
4. 對照 `base-web/src/service/api/*.ts` 既有 wrapper 列表:
   - wrapper 對應 mock endpoint 的覆蓋情況
   - 哪些 wrapper 定義了但 UI 沒呼叫
   - 哪些 UI 動作沒有對應 wrapper(=mock 沒覆蓋 → 若 Q3 要這功能就必須升 L3)
5. 若 ApiFox Mock 有 OpenAPI / Swagger / ApiFox doc UI,記下 link

**輸出**(待執行後產出):
- mock endpoint 清單(完整)
- mock wire shape 範例(每個 endpoint 至少一個 request + response)
- mock 涵蓋率分級(100% / 部分 / 不足)
- A 路徑可行性結論
- 若需升 L3,具體哪些 endpoint 需要新增 wrapper(列清單供 user 一次性授權)

---

> **下一步建議(2026-05-26 更新)**:
> 1. **執行 §10.5 CDP 驗證任務**(user 等等下令)→ 產出 mock-coverage-audit
> 2. 落地 `docs/INTEGRATION-CHECKLIST.md`(進度單一真相,rev2 CLAUDE.md §6 已預留)
> 3. 撰寫 `.specify/memory/constitution.md` v1.0.0(含 Principle I upstream pull-ability + BASE-WEB-ADAPT/WRAPPER 兩軌道 + 「新增不改 inline」+ 「源碼隔離」紀律;~~**等 §10.5 涵蓋率審計完後再定 WRAPPER 軌道授權範圍**~~ — ✅ **2026-05-27 已完成**:audit 確認 12 個 read 全覆蓋、alova 7 個 endpoint 在 ApiFox 全 404 純依賴 local mock;**WRAPPER 軌道授權範圍** = (a) 補 rev2 自家 rust-api 新增業務 endpoint 的 wrapper、(b) alova 7 個 endpoint 若 rev2 想對齊則新增,詳見 [`MOCK-COVERAGE-AUDIT.md` §6](MOCK-COVERAGE-AUDIT.md) 與 [`INTEGRATION-RESEARCH-FOLLOWUP.md` §6.4](INTEGRATION-RESEARCH-FOLLOWUP.md))
> 4. 進入 P0 部署基建第一個 feature(dockerfile-rust-api,對應 rev1 W-F1)的 brainstorm — 注意 rev2 從 0 寫、不繼承 rev1 程式碼
