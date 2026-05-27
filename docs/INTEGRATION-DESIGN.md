# INTEGRATION-DESIGN.md — rev2 整合設計初版

> **本檔狀態**:**初版,不拍板**。為將來 spec-kit feature 啟動時的順序與設計依據;待拍板項統一收集在 §11。
>
> **設計骨幹**:以 base-web fork(`fork260509-soybean-admin-base@example` 分支)為核心、自家 rust-api 從 0 設計、技術棧參考 rev1 已驗版本但**架構重新**(尤其 router 直接符合 base-web 所需)。
>
> **事實來源**(已查核,以下三檔的結論視為 ground truth):
> - [`INTEGRATION-RESEARCH.md`](INTEGRATION-RESEARCH.md) — rev1 設計鏈萃取 + 30 feature 教訓
> - [`MOCK-COVERAGE-AUDIT.md`](MOCK-COVERAGE-AUDIT.md) — base-web mock wire 三段 CDP capture
> - [`INTEGRATION-RESEARCH-FOLLOWUP.md`](INTEGRATION-RESEARCH-FOLLOWUP.md) — Tier 1/2/3 八項深入研究 + audit 翻案
>
> **命名紀律**:本檔**完全不使用 rev1 編號**(F1 / F4 / F5.1 / W-F1 / W-FW1 / 040 等)。所有 feature 用語意命名(如「JWT 機密管理 feature」「動態選單 feature」);**軌道命名亦不用 `W-` 前綴**(如 `BASE-WEB-ADAPT 軌道` 而非 `W-BASE-WEB-ADAPT`)。歷史對照在 [`INTEGRATION-RESEARCH.md` §3](INTEGRATION-RESEARCH.md) 可查。
>
> **建立日期**:2026-05-27
> **建立者**:Claude(Opus 4.7,1M context,/effort max)

---

## 目錄

- [§1 設計原則](#1-設計原則)
- [§2 整體架構](#2-整體架構)
- [§3 base-web 期望 API 全集](#3-base-web-期望-api-全集)
- [§4 rust-api 架構設計(從 0)](#4-rust-api-架構設計從-0)
- [§5 router 詳細設計(本檔重點)](#5-router-詳細設計本檔重點)
- [§6 核心基礎設施(資源管理)](#6-核心基礎設施資源管理)
- [§7 base-web 受管例外軌道](#7-base-web-受管例外軌道)
- [§8 部署拓撲](#8-部署拓撲)
- [§9 一致性與風險紀律](#9-一致性與風險紀律)
- [§10 實施階段(初版排序)](#10-實施階段初版排序)
- [§11 待拍板項清單](#11-待拍板項清單)
- [§12 文件交叉引用](#12-文件交叉引用)

---

## §1 設計原則

### §1.1 base-web 為核心(對齊方向反轉)

**前提**:base-web 是 `soybeanjs/soybean-admin` 的 fork(`example` 分支衍生),rev2 需保留對 upstream 的 pull-ability(動機一)。

**含義**:
- 後端 wire shape **以 base example mock 為唯一真理** — rev2 rust-api 「對齊 base mock」,不是「base 對齊後端」
- `{data, code, msg}` envelope、`R_SUPER/R_ADMIN/R_USER_COMMON` role、`"0000"/"1000"/"3333"/"7777"/"8888"` 業務 code,**全部從 mock 實機 capture 確認**,rev2 rust-api 直接照辦
- rev1 sprint 用「base 對齊 rust」的方向(對齊 ULID / 整數 ID / camelCase rename),rev2 **方向反轉**:遇到不一致以 mock 為準

### §1.2 upstream pull-ability 為首要紀律

對 base-web 任何改動分四級,每級需明確軌道授權(詳見 §7):

| 等級 | 範圍 | 預設權限 | 例 |
|---|---|---|---|
| **L1** | `.env` / 配置檔 | 預設可動 | 切 `VITE_SERVICE_BASE_URL` 指向 rev2 rust-api |
| **L2** | `src/typings/api/*.d.ts` | 預設可動(新增為主) | 加新 namespace,不動既有型別 inline |
| **L3** | `src/service/api/` 新增獨立檔 | 需授權 | 新增 `rev2-extra.ts` wrapper,不動既有檔 |
| **L4** | 改既有 inline(views / router / store / build config) | 需專案授權,逐項 | 隱藏 alova menu、改 modal `// request` 接線 |

L4 是「禁區」— 任何 L4 改動需登記為單獨軌道,理由與生效範圍寫入 spec。

### §1.3 rust-api 從 0 設計(技術棧參考、架構重新)

**前提**:rev2 rust-api 在新 repo `fork260509-rev2-anew-rust-api`(`anew` = 全新)、`rev2-admin-rust-api` 分支從 main 衍生。

**含義**:
- **不繼承 rev1 程式碼**(rev1 source 不參考,避免「答案污染」)
- **繼承 rev1 設計沉澱 + 踩雷紀錄**(本系列三份 doc 為據)
- **必須技術棧**:`axum` + `sea-orm` + `casbin` + `jsonwebtoken`(rev2 user 拍板,其他自由)
- **rev1 完整 crate 清單** 可作為「crate 選擇參考、版本鎖定起點、避免重複踩升級雷」,但 rev2 可精簡(拿掉 mongodb / aws-sdk-s3 / askama 等非必需)
- **架構重新**:rev1 workspace 結構(server/api, server/service, ...)可參考,但 router 等核心模組需根據 §3 base-web API 全集重新設計

### §1.4 三方資料變動紀律(soft delete + audit + RBAC 中樞)

繼承 rev1 三項基底:

1. **軟刪基礎設施**:7 個業務 entity(user / role / menu / role_user / role_menu / role_endpoint / menu_button 等)從物理刪除改軟刪(`deleted_at` column + partial unique index + facade module + CI lint 三重防護)
2. **全域 audit log**:INSERT / UPDATE / SOFT_DELETE / RESTORE 統一走 `audit_log::write_in_txn(AuditEvent)`,敏感欄位 redact(password 等)
3. **Casbin RBAC**:menu / role / endpoint policy 全在 DB(`casbin_rule` 表,`sea-orm-adapter`);**Casbin redis pub-sub channel `casbin:policy:invalidate` v1 即啟用**(即使單 instance,符合「一致性優先、不靠環境分支」)

### §1.5 mock 為對齊基準、不模仿其缺陷

**核心邏輯**:rev2 rust-api 對齊 mock **wire shape + 業務 code**,但 **不模仿 mock 的設計缺陷**:

| mock 行為 | rev2 應對 |
|---|---|
| 業務 endpoint 不檢查 `Authorization`(no-Bearer 也回 200) | rev2 **必須檢查**(Casbin enforce) |
| 業務 endpoint 不檢查 query enum(`status=NOT_AN_ENUM` 照樣 200) | rev2 可選擇:對輸入驗證走 fallback toast,或回業務 code `5xxx` |
| 真 404 path 走 `{apifoxError: {...}}` 包裝 | rev2 用業務 envelope `{data:null, code:"4040", msg:"接口不存在"}` |
| `getAllRoles` id 是 string、`getRoleList` 內 id 是 number(不一致) | rev2 對齊 TS 型(`Role.id: number`),mock 不一致不模仿 |
| `getConstantRoutes` 偶發 502 | rev2 100% 成功回 |

---

## §2 整體架構

### §2.1 部署拓撲(單一入口、單後端)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  rev2-admin Docker Stack                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   外部 (host / WAN)                                                 │
│        │                                                            │
│        ▼ (dev: 127.0.0.1:21080/21443 | prod: 0.0.0.0:80/443)      │
│   ┌─────────────────────────────────────┐                          │
│   │  front-nginx (TLS terminator)       │                          │
│   │  - SPA fallback                     │                          │
│   │  - /api/* → rust-api                │                          │
│   │  - HTTP/HTTPS                       │                          │
│   └────────┬─────────────────┬──────────┘                          │
│            │                 │                                      │
│            ▼ (internal)      ▼ (internal /api/*)                   │
│   ┌──────────────┐   ┌──────────────────┐                          │
│   │  base-web    │   │  rust-api        │ ← N replicas (prod)     │
│   │  (SPA + nginx)│   │  (axum + tokio)  │   pub-sub for           │
│   └──────────────┘   └────┬─────────────┘   Casbin invalidation   │
│                           │                                         │
│              ┌────────────┼─────────────┐                          │
│              ▼            ▼             ▼                          │
│        ┌──────────┐ ┌──────────┐  ┌──────────────┐                 │
│        │ postgres │ │  redis   │  │ (S3 / mongo) │ ← 視需求才啟    │
│        │  (DB)    │ │ (cache + │  │   未必啟用    │                 │
│        │          │ │  pub-sub)│  └──────────────┘                 │
│        └──────────┘ └──────────┘                                   │
│                                                                     │
│   一次性 jobs:                                                     │
│   - migration (sea-orm CLI, restart: no)                           │
│   - cleanup (soft-delete 物理清理, profile: jobs)                  │
│                                                                     │
│   觀察性(可選,Phase 6):                                          │
│   - loki + promtail + grafana(最小三件套)                        │
│   - prometheus + 3 exporter + pushgateway + alerting(完整)        │
└─────────────────────────────────────────────────────────────────────┘
```

### §2.2 nginx 路由分流規則

```
front-nginx 內部 location:
  /                       → base-web (SPA + try_files fallback to /index.html)
  /api/*                  → rust-api upstream (HTTP keepalive)
  /health                 → 200 "ok"(self,front-nginx 自身 health)
  /.well-known/acme-challenge/*  → acme.sh (prod only)
```

**注意**:base-web 開發時 vite proxy `/proxy-default/*` 轉去 `VITE_SERVICE_BASE_URL`;rev2 prod 改 `VITE_SERVICE_BASE_URL=/api` 或 build-arg 注入,使 base-web 在 nginx 後直接走 `/api/*`。

### §2.3 base-web 與 rust-api 的對接機制

開發/測試/prod 三種對接形態:

| 階段 | base-web 來源 | rust-api 來源 | path 前綴(base-web 看) | 真實 endpoint host |
|---|---|---|---|---|
| **base-web dev(對 mock)** | vite dev server `:9527` | ApiFox cloud mock | `/proxy-default/*`(vite proxy 重寫) | `https://mock.apifox.cn/m1/3109515-0-default/*` |
| **rev2 整合 dev** | vite dev server `:9527`(改 .env) | 自家 rust-api(container `:21081` 或 internal) | `/proxy-default/*` 或 `/api/*` | `http://rust-api:21081/*`(internal) |
| **rev2 整合 prod** | nginx serve build artifact | 自家 rust-api(internal) | `/api/*`(SPA build 時 inject) | `http://rust-api:21081/*`(internal,front-nginx proxy) |

---

## §3 base-web 期望 API 全集

> 對齊 base example mock 真實 wire(MOCK-COVERAGE-AUDIT.md §2 + INTEGRATION-RESEARCH-FOLLOWUP.md §1 確認)。
> rev2 rust-api 必須提供以下 endpoint(必須項) + 可選實作(alova-only 項)。

### §3.1 完整 endpoint 對照表(20 個)

#### 必須項:axios + alova 共有(13 個)— rev2 rust-api 必須實作

| # | 模組 | Method | Path | 輸入 | 輸出(unwrap data 後) | base-web 呼叫者 |
|---|---|---|---|---|---|---|
| 1 | auth | POST | `/auth/login` | `{userName: string, password: string}` | `LoginToken{token, refreshToken}` | login 頁 |
| 2 | auth | GET | `/auth/getUserInfo` | `Bearer <token>` header | `UserInfo{userId, userName, roles[], buttons[]}` | login 後 + 每次 navigate |
| 3 | auth | POST | `/auth/refreshToken` | `{refreshToken: string}` | `LoginToken{token, refreshToken}` | token 過期自動觸發 |
| 4 | auth | GET | `/auth/error?code=&msg=` | query params | echo `{code, msg}`(工具 endpoint,**純 echo,無 per-code 分支**;followup §13.6.1 raw fetch 驗證) | function/request demo 頁 |
| 5 | route | GET | `/route/getConstantRoutes` | - | `MenuRoute[]`(login/403/404/500 4 條) | dynamic mode SPA init |
| 6 | route | GET | `/route/getUserRoutes` | `Bearer` header | `UserRoute{routes: MenuRoute[], home: string}` | dynamic mode login 後 |
| 7 | route | GET | `/route/isRouteExist?routeName=` | query param | `boolean` | dynamic mode menu auth modal |
| 8 | systemManage | GET | `/systemManage/getRoleList?current=&size=&...` | `RoleSearchParams` | `RoleList`(分頁) | manage/role 頁 |
| 9 | systemManage | GET | `/systemManage/getAllRoles` | - | `AllRole[]` | user/menu modal |
| 10 | systemManage | GET | `/systemManage/getUserList?current=&size=&...` | `UserSearchParams` | `UserList`(分頁) | manage/user 頁 |
| 11 | systemManage | GET | `/systemManage/getMenuList/v2` | - | `MenuList`(分頁) | manage/menu 頁 |
| 12 | systemManage | GET | `/systemManage/getAllPages` | - | `string[]`(view 名稱列表) | manage/menu 頁 |
| 13 | systemManage | GET | `/systemManage/getMenuTree` | - | `MenuTree[]`(樹狀) | role menu auth modal |

#### 可選項:alova-only(7 個)— 待 §11.2 拍板是否實作

| # | 模組 | Method | Path | 輸入 | 輸出(unwrap) | mock 行為 |
|---|---|---|---|---|---|---|
| 14 | auth | POST | `/auth/sendCaptcha` | `{phone: string}` | `null` | alova local mock return success |
| 15 | auth | POST | `/auth/verifyCaptcha` | `{phone, code}` | `null` | 同上 |
| 16 | systemManage | POST | `/systemManage/addUser` | `UserModel` | `null` | 同上 |
| 17 | systemManage | POST | `/systemManage/updateUser` | `UserModel` | `null` | 同上 |
| 18 | systemManage | DELETE | `/systemManage/deleteUser` | `{id}` | `null` | 同上 |
| 19 | systemManage | DELETE | `/systemManage/batchDeleteUser` | `{ids[]}` | `null` | 同上 |
| 20 | mock | GET | `/mock/getLastTime` | - | `{time: string}` | demo 頁專用 |

> **alova-only 結論**(MOCK-COVERAGE-AUDIT.md §6 + FOLLOWUP §6):這 7 個 endpoint 在 ApiFox cloud mock 全部 404,純依賴 alova 本地 mock 適配器(DEV-only)。rev2 切到自家 rust-api 時:
> - **dev 模式**:這 7 個仍走 alova mock(silent fallback、無感)
> - **prod 模式**:打到 rust-api,若未實作 → 404
> - **待 §11.2 拍板**:是否實作 + 隱藏 alova menu

### §3.2 Envelope 規範(rust-api 所有 response 強制走)

```json
// 成功
{
  "data": <T>,
  "code": "0000",
  "msg": "请求成功"
}

// 業務 error(HTTP 仍 200,envelope 內 code 標)
{
  "data": null,
  "code": "1000",
  "msg": "用户名或密码错误"
}

// 真 404(path 不存在,rev2 仍走業務 envelope、HTTP 404)
{
  "data": null,
  "code": "4040",
  "msg": "接口不存在"
}
```

**紀律**:
- **無 `success` bool**(audit §4.1 + followup §1 確認)
- **`code` 為 string**(`"0000"` 不是 number `0`)
- 順序:`data` 先、`code` 中、`msg` 後
- nested struct **各自需 `#[serde(rename_all = "camelCase")]`**(不遞迴),`refresh_token` → `refreshToken`
- collection 欄位用 `Vec<T>` 不用 `Option<Vec<T>>`(統一空 `[]`)
- HTTP status:業務 error 全 200;path 不存在 / panic 才回非 200(但 envelope 內仍標 code)

### §3.3 業務 code 矩陣(對齊 mock 實機驗證)

| code | 場景 | base-web 行為 | rev2 rust-api 何時回 |
|---|---|---|---|
| `"0000"` | success | unwrap data | 每個成功響應 |
| `"1000"` | login 失敗(統一,不細分原因) | toast | 錯密碼 / 不存在 user / 缺欄 / 空 body 全回 |
| `"2222"` | 自訂業務 error 範本(alova demo 用) | fallback toast | rev2 自訂業務 error 範本 — `2222` 不在 .env 任何 list,任何非 success/expired/logout/modal-logout 的 code 都會走此 fallback toast(followup §13.6.1) |
| `"3333"` / `"9998"` / `"9999"` | token 過期 / 無效 | 觸發 refresh flow | 過期 / 無效 token(完整三選一,皆在 .env `VITE_SERVICE_EXPIRED_TOKEN_CODES=9999,9998,3333` 內;mock 實機觀察 3333 用於 getUserInfo expired、9999 用於 alova refreshToken demo 按鈕) |
| `"7777"` / `"7778"` | modal logout | 顯 modal,user 確認後 logout | 「他處登入」等需 user 看訊息再被踢出(`VITE_SERVICE_MODAL_LOGOUT_CODES=7777,7778`) |
| `"8888"` / `"8889"` | 即時 logout | clear LS + Pinia reset + 跳 /login | refresh 失敗 / user 被禁(`VITE_SERVICE_LOGOUT_CODES=8888,8889`) |
| `"4040"` | path 不存在 | toast(fallback) | rev2 rust-api 對 404 path 的業務 envelope |
| `"5xxx"`(自訂) | 業務驗證 / 資源不存在 / 規則衝突 | toast | rev2 自訂(建議 5001-5999 區段);與 `"2222"` 同走 fallback toast,差別僅是業務語義分區 |

**critical 紀律**:rev2 `/auth/refreshToken` **絕對不能回 expiredTokenCodes**(`3333/9999/9998`),否則 base-web `handleExpiredRequest` 進入 dead loop。refresh 失敗應回 `"8888"` 或 `"7777"`。

### §3.4 Pagination wrapper 規範

```json
{
  "data": {
    "current": 1,
    "size": 10,
    "total": 100,
    "records": [<row>...]
  },
  "code": "0000",
  "msg": "请求成功"
}
```

- 4 個 field(`current` / `size` / `total` / `records`),**無 `pages` 欄**
- 全 number 型(`current` / `size` / `total`)+ `records: T[]`
- **page 超範圍**:返 `{records: [], current: N, size: M, total: <真實總數>}` + `code: "0000"` — 不要 error
- **search params** 所有欄可傳 `null`(`CommonType.RecordNullable<T>`,rust-api 需處理 `Option<T>`)

### §3.5 JWT + Authorization header 規範

- 簽章:**HS256**(沿用 rev1 紀律,key 來源 `JWT_SECRET` envvar + `_FILE` pattern)
- Claims 結構:**自由設計**(base-web 不解析 JWT payload,token 是 opaque string;FOLLOWUP §4.4 確認)
  - 建議:標準 `sub` / `exp` / `iat` / `aud` / `iss` + 自家 `user_id` / `roles`
- request header:`Authorization: Bearer <jwt>`
- **驗 exp**(production 標準,即使 mock 不驗)
- **refresh secret 獨立**(`REFRESH_TOKEN_SECRET` envvar + `_FILE`,與 access token secret 分開)

### §3.6 mock-only 行為清單(rev2 不必模仿)

- **mock 不檢 Authorization**:`getRoleList` 無 Bearer 也回 success → rev2 必須 Casbin enforce
- **mock 不檢 query enum**:`status=NOT_AN_ENUM` 回 success → rev2 可選擇 fallback toast
- **mock `getAllRoles` id 是 string**:其他 list 是 number → rev2 對齊 TS 型(`Role.id: number`)
- **mock `User` login → getUserInfo 回 `User01` alias**:audit §4.7 + followup §4.1 → rev2 自由決定是否模仿(§11.10 待拍板)
- **mock `getConstantRoutes` 偶發 502**:rev2 100% 回 200

---

## §4 rust-api 架構設計(從 0)

### §4.1 技術棧(以 rev1 已驗版本為起點、可精簡)

**必須技術棧**(rev2 user 拍板):

| 類別 | Crate | 版本(rev1 已驗) | 用途 |
|---|---|---|---|
| Web Framework | `axum` | 0.8.4 | 主 async web 框架 |
| ORM | `sea-orm` | 1.1 | SQLx backend |
| Authorization | `casbin` | 2.10 | RBAC 引擎(`incremental` + `cached`) |
| JWT | `jsonwebtoken` | 9.3 | token 生成 / 驗證 |

**支援技術棧**(rev1 已驗、rev2 採用):

| 類別 | Crate | 版本 | 用途 |
|---|---|---|---|
| Runtime | `tokio` | 1.x | multi-thread + macros |
| 序列化 | `serde` / `serde_json` | 1.0 | JSON |
| Tracing | `tracing` / `tracing-subscriber` | 0.1 / 0.3 | JSON exporter + env-filter |
| 密碼雜湊 | `argon2` | 0.5 | 用戶密碼 hash |
| 驗證 | `validator` | 0.20 | request validation derive |
| 錯誤 | `thiserror` / `anyhow` | 2.0 / 1.0 | 自訂錯誤 / 通用錯誤 |
| Casbin Adapter | `sea-orm-adapter`(rev1 self-made) | 拷貝 rev1 | Casbin ↔ PostgreSQL |
| 時間 | `chrono` | 0.4 | 時間處理 |
| 配置 | `config` | 0.15 | 多源配置 |
| 快取 | `moka` | 0.12 | LRU 記憶體快取 |
| 字串 | `convert_case` | 0.8 | snake_case ↔ camelCase |
| Tower 中介層 | `tower` / `tower-http` | 0.5 / 0.6 | trace / normalize-path |

**rev2 拿掉的 crate**(rev1 有、rev2 不需):

| Crate | 拿掉理由 |
|---|---|
| `mongodb` / `bson` | rev2 v1 無 MongoDB 需求 |
| `aws-config` / `aws-sdk-s3` / `aws-sdk-config` | rev2 v1 無 S3 需求(後續加) |
| `askama` / `askama_derive` | rev2 無 server-side render |
| `bcrypt` | 只用 argon2(rev1 雙密碼雜湊冗餘) |
| `simplelog` / `simple_logger` / `env_logger` | 統一用 tracing |
| `async-std` | 只用 tokio runtime |
| `lazy_static` | 用 `once_cell`(更 idiomatic) |

**rev2 評估後保留**:

| Crate | 用途 | 評估 |
|---|---|---|
| `ulid` | ULID 生成 | rev1 用;rev2 對齊 mock 用 `i64`,**改 i64**(待 §11.10 拍板) |
| `xdb`(rev1 self-made) | IP2Region 綁定 | 拷貝(0.5 人日,只調 default 路徑) |
| `axum-casbin`(rev1 self-made) | Casbin Axum middleware | **重寫**(3-5 人日,趁機統一 rev2 metrics/error 策略) |
| `metrics` / `metrics-exporter-prometheus` | Prometheus metric | Phase 6 觀察性才用 |

### §4.2 workspace 結構(重新設計)

**rev2 提議結構**(對比 rev1 略精簡,可選擇是否進一步合併):

```
rust-api/                                   ← workspace root
├── Cargo.toml                              workspace 設定(集中 deps)
├── server/                                 主 binary crate
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                         entry: tracing init → config → db pool → router → serve
│   │   ├── config.rs                       YAML + envvar 載入,_FILE pattern
│   │   ├── error.rs                        AppError(thiserror)+ IntoResponse
│   │   ├── envelope.rs                     Res<T> 統一響應包裝({data, code, msg})
│   │   ├── state.rs                        AppState(connection pool + service Arc)
│   │   ├── api/                            ★ 所有 HTTP handler(對齊 §3 endpoint)
│   │   │   ├── mod.rs                      pub use 各模組
│   │   │   ├── auth.rs                     POST login / GET getUserInfo / POST refreshToken / GET error
│   │   │   ├── route.rs                    GET getConstantRoutes / getUserRoutes / isRouteExist
│   │   │   └── system_manage.rs            GET getRoleList / getAllRoles / getUserList / getMenuList/v2 / getAllPages / getMenuTree
│   │   ├── service/                        業務邏輯(無 HTTP 細節)
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs                     AuthService(login / refresh / userInfo)
│   │   │   ├── route.rs                    RouteService(constant / user / exist)
│   │   │   ├── user.rs / role.rs / menu.rs business CRUD
│   │   │   └── audit.rs                    audit log writer(unified `write_in_txn`)
│   │   ├── middleware/
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs                     JWT validation + Claims extraction
│   │   │   ├── casbin.rs                   RBAC enforce(per-endpoint)
│   │   │   └── audit_http.rs               request/response audit
│   │   ├── router/                         ★ axum Router 組裝(本檔重點,§5)
│   │   │   ├── mod.rs                      pub fn build_router(state) -> Router
│   │   │   ├── auth.rs                     /auth/* nested router
│   │   │   ├── route_admin.rs              /route/* nested router(避開 keyword `route`)
│   │   │   └── system_manage.rs            /systemManage/* nested router
│   │   └── lib.rs                          re-export 給 integration test
│   └── tests/                              integration tests
├── model/                                  Sea-ORM entities + DTO
│   ├── Cargo.toml
│   └── src/
│       ├── entities/                       sea-orm Entity / ActiveModel(per-table)
│       │   ├── sys_user.rs
│       │   ├── sys_role.rs
│       │   ├── sys_menu.rs
│       │   ├── sys_role_user.rs / sys_role_menu.rs / sys_role_endpoint.rs / sys_menu_button.rs
│       │   ├── sys_token.rs                refresh token rotation_chain
│       │   ├── sys_operation_log.rs        audit
│       │   └── casbin_rule.rs              casbin policy table
│       ├── dto/                            request / response DTO(camelCase rename)
│       │   ├── auth.rs                     LoginInput, LoginOutput, UserInfoOutput, RefreshInput
│       │   ├── route.rs                    MenuRouteOutput, UserRouteOutput(含 home 欄)
│       │   └── system_manage.rs            RoleListOutput, UserListOutput, MenuListOutput, MenuTreeOutput
│       ├── enums/                          shared enum(EnableStatus, MenuType, UserGender, IconType)
│       └── facade/                         soft-delete facade(三重防護一)
│           ├── mod.rs                      pub use facade(不 re-export Entity)
│           └── soft_delete.rs              SoftDeletable trait + find_active helper
├── migration/                              sea-orm-migration CLI
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                          migration list
│       ├── m_<timestamp>_create_sys_user.rs
│       └── ...                             所有 table + 數據 seed
├── sea-orm-adapter/                        ← 拷貝自 rev1(0 人日)
│   ├── Cargo.toml
│   └── src/                                Casbin SeaORM Adapter(postgres / mysql / sqlite)
├── xdb/                                    ← 拷貝自 rev1(0.5 人日)
│   ├── Cargo.toml
│   └── src/                                IP2Region Rust 綁定
├── axum-casbin/                            ← rev2 從 0 重寫(3-5 人日)
│   ├── Cargo.toml
│   └── src/                                Casbin Axum middleware(rev2 自家 metrics/error)
└── cleanup-job/                            一次性 job binary
    ├── Cargo.toml
    └── src/main.rs                         soft-delete 過期 row 物理清理
```

**對比 rev1 的差異**(rev1 結構參考自 [`INTEGRATION-RESEARCH.md` §5.2](INTEGRATION-RESEARCH.md)):

- rev1 把 `api / service / model / router / middleware / config / global / constant / utils` 拆 9 個子 crate;rev2 **合併 server 為單 crate**(子模組 mod),只額外抽 `model` / `migration` / sub-crate
- rev1 用 `server/global/` 放 once_cell 連線池;rev2 用 axum `State<AppState>` extension 注入(更 idiomatic、可測性更好)
- rev1 `constant/` 全併入 `model/enums/`
- rev1 `initialize/` 邏輯散入 `main.rs` + `state.rs`,移除單獨 crate

### §4.3 router 設計原則(本檔重點 §5)

router 設計**直接符合 §3 base-web 期望 API 全集**,不引入 alias / rewrite:

- 每個 endpoint 一條 `Router::new().route(path, method(handler))`
- 三大 namespace 各自 nested router(`/auth`, `/route`, `/systemManage`),最後 merge 進主 router
- 主 router 外加全域 layer:CORS / tracing / audit middleware / error handler
- protected routes 在 nested router 內加 `axum-casbin` middleware
- nested router 結構與 §3 endpoint 表一一對應(§5.2 詳述)

### §4.4 service / model / migration 分層

- **service 層**:純業務邏輯,輸入 typed DTO、輸出 typed Result;呼叫 model 與 facade;**audit 在 service 寫**(transaction 內)
- **model 層**:Sea-ORM entities + DTO 結構;**Entity 不 re-export**(三重防護),只透過 facade 提供 `find_active` / `update_active` / `soft_delete` 等 method
- **migration 層**:sea-orm-migration CLI;`m_<timestamp>_<name>` 命名;一個 migration 一張 table 或一組相關 schema 改動
- **三層紀律**:handler 只組 DTO + 呼叫 service;service 不知 HTTP;model 只認 SQL

### §4.5 自製 sub-crate 策略(總結 followup §7)

| Crate | 策略 | 估工 | 理由 |
|---|---|---|---|
| `sea-orm-adapter` | **拷貝** | 0 人日 | 通用實作、無 rev1-specific patch、上游可能落後 |
| `xdb` | **拷貝** | 0.5 人日 | 純算法綁定、commit 穩定、只調 default 路徑 |
| `axum-casbin` | **重寫** | 3-5 人日 | 高度客製化(rev1 自家 metrics / domain-aware enforce);趁機統一 rev2 設計 |

**整體** ~4.5 人日,屬 Phase 2 後端基礎設施內可完成。

---

## §5 router 詳細設計(本檔重點)

### §5.1 endpoint 完整對照表(rust-api 落地版)

> 對齊 §3 完整 endpoint 表,加 rust 端 handler 簽名 + middleware 鏈。
> Casbin 欄:`-` 不需要(public);`✓` 需要(protected,policy 在 DB);`enforce-only` 只看 token 有效,不查 policy(如 getUserInfo)。

**Public(不需 Bearer):**

| Method | Path | rust handler | Casbin | 備註 |
|---|---|---|---|---|
| POST | `/auth/login` | `auth::login(LoginInput)` | - | 驗 user/password,簽 token + refreshToken |
| POST | `/auth/refreshToken` | `auth::refresh(RefreshInput)` | - | 驗 refresh JWT + DB 查詢 sys_tokens,輪替 |
| GET | `/auth/error` | `auth::echo_error(query)` | - | 工具 endpoint;**實作極簡**(讀 query `code`+`msg` → echo 進 envelope,無 per-code 分支);base-web request layer 各 code list 行為的 testbed(followup §13.6.1 raw fetch 驗證) |
| GET | `/route/getConstantRoutes` | `route_admin::constant_routes()` | - | 回 4 條 constant route(login/403/404/500) |

**Protected token-only(需 Bearer 但不查 Casbin policy):**

| Method | Path | rust handler | Casbin | 備註 |
|---|---|---|---|---|
| GET | `/auth/getUserInfo` | `auth::user_info(Claims)` | enforce-only | 從 Claims 拉 user_id + DB 查 user + roles + buttons |
| GET | `/route/getUserRoutes` | `route_admin::user_routes(Claims)` | enforce-only | 從 sys_menu 過濾 user 可見 menu,加 `home` 欄 |
| GET | `/route/isRouteExist?routeName=` | `route_admin::route_exist(query)` | enforce-only | 全域存在性,與 user role 無關 |

**Protected Casbin enforced(需 Bearer + policy 查):**

| Method | Path | rust handler | Casbin policy(範例) | 備註 |
|---|---|---|---|---|
| GET | `/systemManage/getRoleList` | `system_manage::get_role_list(query)` | `p, R_SUPER, /systemManage/getRoleList, GET` | 分頁、search |
| GET | `/systemManage/getAllRoles` | `system_manage::get_all_roles()` | `p, *, /systemManage/getAllRoles, GET` | 非分頁、user/menu modal 用 |
| GET | `/systemManage/getUserList` | `system_manage::get_user_list(query)` | `p, R_SUPER, /systemManage/getUserList, GET` | 分頁、search |
| GET | `/systemManage/getMenuList/v2` | `system_manage::get_menu_list_v2(query)` | `p, R_SUPER, /systemManage/getMenuList/v2, GET` | 分頁、tree builder |
| GET | `/systemManage/getAllPages` | `system_manage::get_all_pages()` | `p, R_SUPER, /systemManage/getAllPages, GET` | 回 view 名稱 string[] |
| GET | `/systemManage/getMenuTree` | `system_manage::get_menu_tree()` | `p, R_SUPER, /systemManage/getMenuTree, GET` | role menu auth modal 用 |

**Alova-only(待 §11.2 拍板):**

| Method | Path | rust handler(若實作) | Casbin | 備註 |
|---|---|---|---|---|
| POST | `/auth/sendCaptcha` | `auth::send_captcha(input)` | - | 抽離 stub(rev2 v1 可只回 success) |
| POST | `/auth/verifyCaptcha` | `auth::verify_captcha(input)` | - | 同上 |
| POST | `/systemManage/addUser` | `system_manage::add_user(UserInput)` | `p, R_SUPER, ..., POST` | 寫入 + audit + Casbin policy add |
| POST | `/systemManage/updateUser` | `system_manage::update_user(id, input)` | `p, R_SUPER, ..., POST` | 注意 base 用 POST,非 PUT |
| DELETE | `/systemManage/deleteUser` | `system_manage::delete_user(id)` | `p, R_SUPER, ..., DELETE` | soft-delete |
| DELETE | `/systemManage/batchDeleteUser` | `system_manage::batch_delete_users(ids[])` | `p, R_SUPER, ..., DELETE` | body 內 ids 陣列(不是 URL param) |
| GET | `/mock/getLastTime` | `mock::get_last_time()` | - | demo only |

### §5.2 router 模組組織

```rust
// server/src/router/mod.rs
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .nest("/auth", auth::routes(state.clone()))
        .nest("/route", route_admin::routes(state.clone()))
        .nest("/systemManage", system_manage::routes(state.clone()))
        // alova-only(若 §11.2 拍板實作)
        .nest("/mock", mock::routes(state.clone()))
        // global health (不走 envelope,plain text "ok")
        .route("/health", get(health))
        // global layer
        .layer(TraceLayer::new_for_http())
        .layer(audit_http::layer())
        .layer(CorsLayer::very_permissive())  // dev only; prod tighten
        .with_state(state)
}

// server/src/router/auth.rs
pub fn routes(state: AppState) -> Router<AppState> {
    Router::new()
        // public
        .route("/login", post(api::auth::login))
        .route("/refreshToken", post(api::auth::refresh))
        .route("/error", get(api::auth::echo_error))
        // protected(token-only,no Casbin)
        .route(
            "/getUserInfo",
            get(api::auth::user_info).layer(from_fn(middleware::auth::require_token))
        )
        // alova-only stub(可選)
        .route("/sendCaptcha", post(api::auth::send_captcha))
        .route("/verifyCaptcha", post(api::auth::verify_captcha))
}

// server/src/router/route_admin.rs
pub fn routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/getConstantRoutes", get(api::route::constant_routes))
        .route(
            "/getUserRoutes",
            get(api::route::user_routes).layer(from_fn(middleware::auth::require_token))
        )
        .route(
            "/isRouteExist",
            get(api::route::route_exist).layer(from_fn(middleware::auth::require_token))
        )
}

// server/src/router/system_manage.rs
pub fn routes(state: AppState) -> Router<AppState> {
    Router::new()
        // 全部需 token + Casbin policy
        .route("/getRoleList", get(api::system_manage::get_role_list))
        .route("/getAllRoles", get(api::system_manage::get_all_roles))
        .route("/getUserList", get(api::system_manage::get_user_list))
        .route("/getMenuList/v2", get(api::system_manage::get_menu_list_v2))
        .route("/getAllPages", get(api::system_manage::get_all_pages))
        .route("/getMenuTree", get(api::system_manage::get_menu_tree))
        // alova-only writes(可選實作)
        .route("/addUser", post(api::system_manage::add_user))
        .route("/updateUser", post(api::system_manage::update_user))
        .route("/deleteUser", delete(api::system_manage::delete_user))
        .route("/batchDeleteUser", delete(api::system_manage::batch_delete_users))
        // 全 nest 加 Casbin layer
        .layer(from_fn(middleware::casbin::enforce))
        .layer(from_fn(middleware::auth::require_token))
}
```

### §5.3 不引入 alias / rewrite

rev1 設計過 `/systemManage/*` 作為 thin wrapper 重用 `/user/*` `/role/*` `/menu/*` 的 service(rev1 內部 alias)。**rev2 不採此設計**:

- rev2 rust-api 從 0 寫,可以**直接讓 service 用 `systemManage` 路徑**(沒有「既有 user/role/menu router 需要 wrap」的歷史包袱)
- router → handler → service 一條鏈,handler 名就叫 `get_role_list`、`add_user` 等,不需 alias
- 好處:**rev2 router 表面 = base-web 期望表面**,1:1 對齊,debug 時 grep `getRoleList` 直接找到 handler
- 代價:service 內 method 名也建議用 `getRoleList` / `addUser`(camelCase 與 rust 慣例 snake_case 衝突),**建議**:service method 用 `get_role_list` snake_case,handler 名也 snake_case,route 路徑用 camelCase(對齊 base-web)

### §5.4 Alova 7 endpoint 是否實作(§11.2 待拍板)

選項對比:

| 選項 | 動作 | rev2 prod 行為 | 工作量 |
|---|---|---|---|
| **(a) 全實作** | 7 endpoint 全寫 handler + service | demo 頁完整 work | ~3-5 人日(7 endpoint × 業務邏輯) |
| **(b) 全部回 stub `{code:"0000", data:null}`** | 7 endpoint 只回成功 envelope | demo 頁「看起來 OK」實際 no-op | ~0.5 人日 |
| **(c) 完全不實作** | 7 endpoint 404 | demo 頁壞掉 / silent fail | 0 人日 + 隱藏 alova menu(`pageExcludePatterns`) |
| **(d) 混合**:`addUser`/`updateUser`/`deleteUser`/`batchDeleteUser` 全實作(對齊 §11.3 Q5 解);`sendCaptcha`/`verifyCaptcha`/`getLastTime` stub | 業務 CRUD 完整 + demo 部分 work | ~2-3 人日 |

**Claude 建議**:依 §11.3 的 Q5 拍板綜合決定。若 Q5 走 (B) 升 L4 inline,則 (d) 混合最合理(addUser 等需要實作才能完成 modal CRUD UI)。

---

## §6 核心基礎設施(資源管理)

### §6.1 JWT secret 機制(strict validation + `_FILE` pattern)

- **單一 envvar** `JWT_SECRET` + `_FILE` precedence:
  ```
  if APP_JWT_JWT_SECRET_FILE set → read from file
  elif APP_JWT_JWT_SECRET set → use bare envvar
  else → panic at boot
  ```
- **strict validation**(boot-time、無 dev/prod 分支):
  - 非空
  - 不在 `PLACEHOLDER_SECRETS` 黑名單(`change-me` / `secret` / `xxx` / ...)
  - 長度 ≥ 32
- **refresh token secret** 獨立 envvar `REFRESH_TOKEN_SECRET`(同 strict validation)— 防止 access token leak 連帶 refresh chain 失守
- application.yaml 提供 placeholder 範本,實際值走 envvar/secret 注入

### §6.2 sys_tokens 表(refresh token rotation)

```sql
CREATE TABLE sys_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token VARCHAR(2048) NOT NULL UNIQUE,      -- refresh JWT
  rotation_chain UUID NOT NULL,             -- 同一鏈標識
  status VARCHAR(20) NOT NULL,              -- "active" / "used" / "revoked"
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES sys_user(id)
);

CREATE INDEX idx_sys_tokens_user_active ON sys_tokens(user_id) WHERE status = 'active';
CREATE INDEX idx_sys_tokens_chain ON sys_tokens(rotation_chain);
```

**flow**:
1. login → new rotation_chain UUID + new active token
2. refresh → 查 token + chain,簽新 token + 新 refreshToken;**舊 token 標 `used`**
3. user logout(被動)→ 整條 chain 標 `revoked`

**critical**:refresh 失敗(token 不存在 / chain revoked / expired)→ 回 `"8888"`(logoutCodes),**絕不可回 `"3333"`**(會 dead loop)

### §6.3 Casbin policy(動態 reload + redis pub-sub channel)

- **schema**:`casbin_rule` 表(sea-orm-adapter 預設)
- **model**:RBAC with domain(若 future multi-tenant)or RBAC without domain(v1)
- **policy seed**(migration):
  - `p, R_SUPER, *, *`(super 全通)
  - `p, R_ADMIN, /systemManage/getRoleList, GET`(admin 部分權限,逐個列)
  - `p, R_USER_COMMON, /auth/getUserInfo, GET`(user 只有自身)
  - role 命名對齊 mock(`R_SUPER` / `R_ADMIN` / `R_USER_COMMON`)
- **redis pub-sub channel `casbin:policy:invalidate`**:
  - 任一 instance 改 policy → publish 訊息 → 所有 instance subscribe → reload policy
  - **v1 即啟用**(即使單 instance,符合「一致性優先、不靠環境分支」)
- cached enforcer(`casbin` 0.2 `cached` feature)+ moka LRU cache key 為 `(role, path, method)`

### §6.4 sys_operation_log(統一 audit)

```sql
CREATE TABLE sys_operation_log (
  id BIGSERIAL PRIMARY KEY,
  operation VARCHAR(20) NOT NULL,           -- "INSERT" / "UPDATE" / "SOFT_DELETE" / "RESTORE" / "LEGACY"
  entity_table VARCHAR(64) NOT NULL,        -- "sys_user" / "sys_role" / ...
  entity_id BIGINT,                         -- (nullable for HTTP middleware events)
  payload_before JSONB,                     -- before state(update 時)
  payload_after JSONB,                      -- after state
  operator_id BIGINT,                       -- (nullable for system actions)
  operator_ip INET,
  trace_id VARCHAR(64),                     -- tracing span id
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- **單一 API**:`audit_log::write_in_txn(AuditEvent)`,所有 INSERT/UPDATE/SOFT_DELETE 路徑統一走
- **敏感欄位 redact**:`AuditSerialize` trait,top-level field replace `"<redacted>"`(password 等)
- **CI lint**:grep 禁止繞過 facade 寫 DB(類似 soft-delete 三重防護)

### §6.5 soft delete infrastructure

7 個業務 entity(`sys_user` / `sys_role` / `sys_menu` / `sys_role_user` / `sys_role_menu` / `sys_role_endpoint` / `sys_menu_button`)全加:
- `deleted_at TIMESTAMPTZ`(nullable)
- partial unique index `WHERE deleted_at IS NULL`(讓 active row 有唯一性、deleted row 不衝突)

**三重防護**:
1. **類型系統 trait**:`SoftDeletable` trait,封閉 `find_active` / `update_active` / `soft_delete` 方法
2. **facade module**:`model/facade/`,**不 re-export Entity**;呼叫者只能透過 facade
3. **CI lint**:`grep` 禁止 `use entities::sys_user` 等直接 entity import(允許在 facade 內部使用)

**Casbin orphan**:soft-delete user 後,`casbin_rule` 內 `g, user, role` 不動(靠 `find_active` 自然掩蔽);cleanup-job 物理清理時才一併刪 casbin entry

---

## §7 base-web 受管例外軌道

> **5 軌道一覽**(§11.9 拍板,2026-05-27):

| # | 軌道 | 等級 | 來源拍板 |
|---|---|---|---|
| §7.1 | BASE-WEB-ADAPT | L1+L2 預設可動 | §11.7 / §11.10 |
| §7.2 | BASE-WEB-WRAPPER | L3 需授權 | §11.3 (B) |
| §7.3 | **BASE-WEB-BUILD-CONFIG ★** | L4 build infra,**需 constitution v1.0.0 顯式授權** | §11.5 (b'-narrow) |
| §7.4 | **MODAL-WIRING ★** | L4 view inline,**需 constitution v1.0.0 顯式授權** | §11.3 (B) |
| §7.6 | RUSTAPI-SOURCE-ISOLATION | rust-api 全新寫 | §11.6 |

★ = 違反「base-web 為核心、不動 inline / build 配置」直覺紀律。`.specify/memory/constitution.md` v1.0.0 將凍結授權邊界與理由。

### §7.1 BASE-WEB-ADAPT 軌道(L1 + L2,預設可動)

**範圍**:
- `base-web/.env` / `.env.test` / `.env.prod`(L1)
- `base-web/src/typings/api/*.d.ts`(L2)

**典型動作**:
- 切 `VITE_SERVICE_BASE_URL` 指向 rev2 rust-api(prod build 用 `/api`,dev 用 `http://localhost:21081`)
- 切 `VITE_AUTH_ROUTE_MODE=dynamic`(若採 dynamic mode)
- 切 `VITE_HTTP_PROXY=N`(若不走 vite proxy)
- 新增 `src/typings/api/rev2-extra.d.ts`(L2 新增獨立檔)
- typings 對齊 rust 序列化型差異(只新增 type,不動既有)

**紀律**:**新增為主、不改 inline**;**禁止刪除既有 type / field**(upstream 演進時這些可能仍在用)

### §7.2 BASE-WEB-WRAPPER 軌道(L3,需授權)

**範圍**:`src/service/api/` 新增獨立檔(如 `rev2-extra.ts`)、或 `src/service-alova/api/` 新增獨立檔

**典型動作**:
- 為 alova 7 個 endpoint(若 rev2 實作)補 axios wrapper,讓非 alova-DEV 環境也能呼
- 為 rev2 新增業務 endpoint(若有)補 wrapper

**紀律**:
- 一律新檔(`rev2-xxx.ts`),不改既有 `auth.ts` / `system-manage.ts` / `route.ts`
- 命名前綴 `rev2-` 讓 upstream rebase 時不衝突
- 必須在 spec 內列「為何升 L3」(預設 L2 不夠時的證據)

### §7.3 BASE-WEB-BUILD-CONFIG 軌道(L4 build infra,需授權)

**範圍**:`base-web/build/*`、`base-web/package.json`(deps 改)、`base-web/pnpm-workspace.yaml`

**典型動作**:
- 加 `pageExcludePatterns: ['**/alova/**', ...]` 隱藏 demo menu(audit §4.10.2 (b'-narrow))
- pnpm 升級 / dep hygiene
- 加 mock plugin / build-arg

**紀律**:
- 屬 build infra 改動,upstream rebase 風險「中低」(這層 upstream 較穩定)
- 每次改動寫 spec 解釋目的,review 時對齊 upstream 演進

### §7.4 MODAL-WIRING 軌道(L4 view inline,僅在特定拍板下啟用)

**範圍**:`base-web/src/views/manage/*/modules/*-operate-{modal,drawer}.vue` 內 `// request` placeholder 處的 inline 改動

**典型動作**:
- 把 modal/drawer save button 的 `// request; console.log(...)` 改為 `await fetchCreateXxx(formData)`

**紀律**:
- **只在 §11.3 Q5 拍板走 (B) 才啟用此軌道**
- 嚴格限「只動 `// request` placeholder 處」、絕不擴張到其他 inline
- 每改一處在 spec 內紀錄(file:line + 改動內容 + upstream 衝突風險評估)

### §7.5 「新增不改 inline」紀律 + 「源碼隔離」紀律

- **新增不改 inline**:所有 base-web 改動優先「新增獨立檔 / 新增 export」,改既有 inline 需 amendment 授權
- **源碼隔離**:rev2 spec phase 0 research **只准 grep rust-api(rev2 自己) + base-web**,**不准 grep rev1 / nestjs source**(避免「答案污染」— 動機二)

### §7.6 RUSTAPI-SOURCE-ISOLATION 軌道

**範圍**:rust-api 整棵樹(`rust-api/server/`、`rust-api/migration/`、`rust-api/server/sub-crate/`)

**典型動作**:
- 全新寫 rust-api、不從 rev1 source 拷貝 code(模組 / handler / service / DTO / migration)
- 例外:工具性 sub-crate 可拷貝 rev1 — `sea-orm-adapter`(0 人日)、`xdb`(0.5 人日)(§11.6 拍板)
- `axum-casbin` 必須重寫(§11.6 拍板)— 統一 rev2 metrics / error / observability 策略

**紀律**:
- 設計上**繼承 rev1 設計沉澱**(從 RESEARCH.md / FOLLOWUP.md 萃取 30 個 superpowers 教訓)
- **不繼承 rev1 code**(避免 rev1 metrics 客製、error mapping 不統一、soft-delete / audit-log 重複實作)
- spec phase 0 research **不准 grep rev1 source**(§7.5 源碼隔離 process 紀律配合)

**對應拍板**:§11.6 sub-crate / §11.9 軌道清單

---

## §8 部署拓撲

### §8.1 容器映像

| Service | Base image | 構建方式 | 特點 |
|---|---|---|---|
| rust-api | `rust:1.86-slim-bookworm`(builder) + `debian:bookworm-slim`(runtime) | multi-stage,BuildKit cache mount(`/usr/local/cargo`, `/app/target`)+ 同一 image 三 binary(server / migration / cleanup),entrypoint 區分 | non-root uid 10001 + `/health` plain text |
| base-web | `node:22-slim`(pnpm corepack builder)+ `nginx:1.27-alpine`(runtime) | Vite build with `VITE_*` build-arg + nginx SPA fallback + 30d asset cache | `/health` location |
| front-nginx | `nginx:1.27-alpine` | mount `deploy/front-nginx/conf.d` + snippets | TLS terminator |
| postgres | `postgres:17.4` | 官方 | named volume `postgres_data` |
| redis | `redis/redis-stack:7.4.0-v3` | 官方 + `--requirepass` shell wrapper | named volume `redis_data` |

### §8.2 容器編排(dev / prod 雙 compose)

**檔案結構**:
```
docker-compose.yml                          base 設定(不含 port、不含 profile-gate service)
docker-compose.dev.yml                      dev override(127.0.0.1 loopback,host port 全暴露)
docker-compose.prod.yml                     prod override(0.0.0.0,只暴露 80/443)
docker-compose.obs-min.yml                  observability 最小(promtail + loki + grafana)
docker-compose.obs-full.yml                 observability 完整(+ prometheus + 3 exporter + pushgateway)
```

**port 規劃**(`2XXXX` 系列,避開 rev1 `1XXXX`):

| Service | 容器內 | dev host 映射 | prod host 映射 |
|---|---|---|---|
| front-nginx HTTP | 80 | `127.0.0.1:21080:80` | `0.0.0.0:80:80`(redirect 443) |
| front-nginx HTTPS | 443 | `127.0.0.1:21443:443` | `0.0.0.0:443:443` |
| rust-api | 21081 | `127.0.0.1:21081:21081` | 無暴露 |
| postgres | 5432 | `127.0.0.1:25432:5432` | 無暴露 |
| redis | 6379 | `127.0.0.1:26379:6379` | 無暴露 |
| grafana(obs-min/full) | 3000 | `127.0.0.1:23000:3000` | 無暴露 |
| prometheus(obs-full) | 9090 | `127.0.0.1:23090:9090` | 無暴露 |
| pushgateway(obs-full) | 9091 | `127.0.0.1:29091:9091` | 無暴露 |

**啟動命令**:

```bash
# dev:全 host 暴露,127.0.0.1 loopback
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# prod baseline:對外 80/443,acme 不啟,obs 不啟
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait

# prod + obs min(P3 後半 / P4 中段啟用)
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.obs-min.yml up -d --wait

# prod + obs full(Phase 6 production-ready)
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.obs-full.yml up -d --wait

# cleanup job 觸發(cron 呼叫)
docker compose run --rm cleanup --execute
```

**紀律**:
- **絕不用 `docker-compose.override.yml` auto-load**(會在 prod 誤暴露 dev port)
- dev/prod 切換 **顯式 `-f` 加載**
- COMPOSE_PROJECT_NAME=`rev2-admin`(對比 rev1 `rev1-admin`,並存於同台機器)

### §8.3 反向代理 + TLS

- **dev**:自簽憑證(`deploy/generate-dev-cert.sh` 生成,SAN 含 `DNS:localhost + IP:127.0.0.1`),HTTP:21080 + HTTPS:21443 並存
- **prod**:
  - **baseline**:先 seed cert 進 named volume `front_nginx_certs`(從 dev cert 或手動上傳真實 cert)
  - **+ acme.sh**(可選 profile):skeleton 啟動,實際 cert acquisition 需公網 domain + DNS provider
  - HTTP:80 redirect HTTPS:443 / ACME challenge

**nginx conf**:
- `default.conf`(dev,純 HTTP + HTTPS,**無** HTTP→HTTPS redirect)
- `default.conf.prod`(prod,HTTP redirect + HTTPS resolver 支援 docker DNS 動態解析 + replica scaling)

### §8.4 環境變數與 Secrets

**`.env`(非機密)**:
```ini
COMPOSE_PROJECT_NAME=rev2-admin
TZ=Asia/Shanghai
POSTGRES_USER=soybean
POSTGRES_DB=soybean_admin_rust
IMAGE_TAG=rev2-admin-rust-api
BASE_WEB_TAG=rev2-admin-base-web
```

**Secrets(待 §11.X 拍板數量;依 obs stack 啟用情況):**

| Secret(必須) | 用途 | Service |
|---|---|---|
| `jwt_secret` | JWT HS256 金鑰 | rust-api |
| `refresh_token_secret` | refresh JWT 金鑰 | rust-api |
| `database_url` | DB 連線 URL(含密碼) | migration, rust-api |
| `redis_url` | Redis 連線 URL | rust-api |
| `postgres_password` | DB 純密碼 | postgres |
| `redis_password` | Redis 純密碼 | redis |
| `cleanup_database_url` | cleanup-job 專用 DB URL(最小權限) | cleanup |

**Secrets(可選,obs 啟用才需)**:`acme_email` / `grafana_admin_password` / `postgres_exporter_dsn` / `redis_exporter_password`

**注入機制**:
- `_FILE` pattern(service env var 指 `/run/secrets/<name>` 路徑,application 讀檔)
- shell expand wrapper(migration / redis / cleanup,用 `$(cat /run/secrets/...)` 包 entrypoint)
- **dual-write 紀律**:`database_url.txt` 內 password 段 ≡ `postgres_password.txt` 內純值;`redis_url.txt` 同理

### §8.5 觀察性 stack 三段式啟動(總結 followup §8)

| 階段 | 啟動範圍 | 工作量 | 觸發時機 |
|---|---|---|---|
| **Phase 1-4(setup + 業務跑通)** | **不啟 obs**(只 5 service:postgres / redis / rust-api / base-web / front-nginx) | 0 | rev2 焦點在 rust-api 對齊 mock |
| **Phase 5(業務驗收 + 抽離項補位)** | **啟 obs-min**(promtail + loki + grafana,純 log) | 0.5-1 人日 | 業務跑起來有 log 量、debug 需求 |
| **Phase 6(production-ready)** | **啟 obs-full**(+ prometheus + 3 exporter + pushgateway + grafana alerting) | 2-3 人日 | 性能監控、alerting 需求 |

### §8.6 DB migration + 背景工作

- **migration**:`sea-orm-migration` CLI,docker-compose 一次性 service(`restart: no`),啟動順序在 rust-api 前
- **cleanup-job**:soft-delete 過期 row 物理清理 + 對應 casbin entry 清理
  - `profile: ["jobs"]` + `restart: "no"` + `docker compose run --rm cleanup --execute` 觸發
  - **dry-run 為預設**(不帶 `--execute` 只列要刪的 row、不實刪)
  - **獨立最小權限 credential**(`cleanup_database_url`,只有 `SELECT` / `DELETE` 對 soft-delete 表)
  - host cron 呼叫(個人 workspace 簡約方案)

---

## §9 一致性與風險紀律

### §9.1 wire shape 三端對齊 grep 紀律

**每個 feature 的 spec phase 0 必做**:

- **rust handler return type grep**:`grep "Result<" rust-api/server/src/api/*.rs`
- **base-web typings 對照**:`grep "interface\|type" base-web/src/typings/api/*.d.ts`
- **base-web view state 對照**:`grep "useState\|ref(" base-web/src/views/manage/*.vue`

三端不對齊 = runtime bug 或 type lie。

### §9.2 三重防護紀律(類型 + facade + CI lint)

對所有 sensitive 操作(soft-delete / audit / JWT secret / cleanup credential)套用:

1. **類型系統**:trait 封閉,不暴露危險操作(如 `delete()` 不存在,只有 `soft_delete()`)
2. **facade module**:統一入口,Entity 不 re-export
3. **CI grep lint**:檢查 import / 用法,違規 PR fail

### §9.3 envelope 不漏

所有 rust handler return type 必須 `Result<Res<T>, AppError>`,**禁止直接回 `Json<T>` 等繞過 envelope**。CI lint:`grep "Json<" rust-api/server/src/api/ | grep -v "Json<Res<"` 應為空。

### §9.4 mock 偶發 502 應對

`/route/getConstantRoutes` 在 mock 偶發 502(audit §7.2.13 + followup §1.1):rev2 rust-api **必須 100% 成功回**(實作邏輯沒理由 fail,只回 4 條 hardcoded constant route)。

### §9.5 alova 7 endpoint 的 silent fallback 風險

依 §11.2 拍板:
- 若採 (c) 不實作 + 不隱藏:dev 跑感覺 OK(走 alova mock)、prod 壞掉 → **必須在 spec 內明確標**
- 若採 (a) / (d) 實作:wire shape 必須對齊 alova mock(全 `{code:"0000", data:null}`)
- 任何選項都應**禁止 base-web 開發者誤以為 alova endpoint 已自動對齊 rust-api**

---

## §10 實施階段(初版排序)

> 不用 rev1 編號,改用語意 phase + feature 名稱。每個 phase 內順序可調整,跨 phase 順序為硬依賴。

### Phase 0 — 設計拍板(prerequisite,2026-05-28 ✅ 完成)

> 整個 rev2 整合的設計基礎、所有後續 Phase 的硬依賴。**不寫 code**,只產出研究 / 設計 / 凍結文件。

deliverables(全部完成):

1. **`docs/INTEGRATION-RESEARCH.md`** — 早期設計研究,rev1 設計鏈萃取 + 30 superpowers 教訓
2. **`docs/INTEGRATION-RESEARCH-FOLLOWUP.md`** — RESEARCH 深入深研(Tier 1/2/3 八項)
3. **`docs/MOCK-COVERAGE-AUDIT.md`** — 本地 base-web docker-compose 跑後查驗 fork example 用到的 mock api(CDP 三段 capture + wire ground truth)
4. **`docs/INTEGRATION-DESIGN.md`**(本檔)— rev2 整合架構與執行順序設計(12 段 + 31 feature + 12 拍板已回填)
5. **`docs/INTEGRATION-CHECKLIST.md`** — 動態 todo + SOP hook 每次 session 注入錨(完整職責分工見 CLAUDE.md §7)
6. **§11 12 拍板 user 親決**(2026-05-27)— 鎖定兩鐵紀律(base-web 為權威 + menu Casbin enforce)與 5 軌道(2 ★ 需 constitution 顯式授權)
7. **`.specify/memory/constitution.md` v1.0.0**(2026-05-28 凍結)— 設計權威從 DESIGN §11 + §7 提取為不可違反的凍結權威

紀律:Phase 1-7 任何 feature 啟動前,需要 Phase 0 設計鏈完整、拍板凍結。spec-kit `/speckit-plan` 步將自動對照 constitution v1.0.0 跑 Compliance Check(§IV 7 項 yes/no)。

### Phase 1 — 部署基建(無 app 相依,可平行)

1. **rust-api Dockerfile feature** — multi-stage build,non-root user,/health endpoint
2. **base-web Dockerfile feature** — Vite + nginx,SPA fallback,build-arg `VITE_SERVICE_BASE_URL`
3. **TLS 憑證 skeleton feature** — `deploy/generate-dev-cert.sh` + dev/prod nginx conf
4. **容器 port 與編排 feature** — docker-compose base + dev override(2XXXX port)
5. **secret 注入機制 feature** — `_FILE` pattern + `deploy/secrets/*.txt.example` 範本

### Phase 2 — 後端基礎設施(無 app 相依,但 Phase 3 起點)

1. **JWT 機密管理 feature** — strict validation + `_FILE` + refresh secret 分離
2. **soft-delete 基礎設施 feature** — 7 entity + facade + CI lint(三重防護)
3. **envelope 對齊 feature** — `Res<T>` + camelCase rename + 業務 code 矩陣
4. **audit log 基礎設施 feature** — schema + `AuditEvent` + redact(依 soft-delete)
5. **sub-crate setup feature** — 拷貝 `sea-orm-adapter` + `xdb`,重寫 `axum-casbin`

### Phase 3 — 認證 + 動態選單(P2 完)

1. **登入 + getUserInfo feature** — `/auth/login` + `/auth/getUserInfo`,Casbin enforce 首次啟用
2. **dynamic mode 路由 feature** — `/route/getConstantRoutes` + `/route/getUserRoutes`(含 `home` 欄)+ `/route/isRouteExist`
3. **Casbin redis pub-sub 啟用 feature** — `casbin:policy:invalidate` channel(即使單 instance,v1 啟用)
4. **policy seed feature** — 三 role × 主流 endpoint 的 Casbin policy migration seed

### Phase 4 — 主流業務(P3 完)

1. **manage list endpoints feature** — `getRoleList` / `getAllRoles` / `getUserList` / `getMenuList/v2` / `getAllPages` / `getMenuTree`(全 read,對齊 mock)
2. **wire shape mapping feature** — output DTO + `From<Entity>` impl + pagination wrapper
3. **alova-only endpoint 處理 feature** — 依 §11.2 拍板實作 / stub / 不實作
4. **菜單樹建構 feature** — tree builder(parent_id → nested children)

### Phase 5 — 補位 + 抽離項(P4 完)

1. **refresh token 完整實作 feature** — `/auth/refreshToken` + `sys_tokens` rotation_chain + 舊 token 標 `used`
2. **抽離項 stub feature** — `/auth/error` / `/auth/sendCaptcha` / `/auth/verifyCaptcha`(若 §11.2 選 stub)
3. **cleanup-job feature** — dry-run 預設 + `--execute` 才實刪 + host cron + 獨立最小權限 credential

### Phase 6 — 觀察性(可選,生產 ready)

1. **obs-min feature** — promtail + loki + grafana(純 log)
2. **obs-full feature** — + prometheus + 3 exporter + pushgateway + grafana alerting
3. **dashboard provisioning feature** — master overview / rust-api / postgres / redis / audit pipeline 等

### Phase 7 — 維護(持續性)

1. **status / gender / 其他 wire 細節對齊 feature** — 走 CDP 全功能巡檢
2. **upstream rebase feature** — 定期 `git rebase upstream/example`(base-web fork)+ `git rebase upstream/main`(rust-api fork)
3. **graphify 圖譜更新 feature**(P4 完跑 `graphify update`,refresh manifest + GRAPH_REPORT)
4. **依需求啟用觀察性 alert / 升級 acme.sh 真實 cert / 等**

### 跨 phase 硬依賴 DAG

```
Phase 0 (設計拍板) ✅
   │
   ▼
Phase 1 (部署基建) ─┐
                   ├─→ Phase 3 (認證 + menu) ──→ Phase 4 (主流業務) ──→ Phase 5 (補位 + 抽離項)
Phase 2 (後端基建) ─┘                                                                      │
                                                                                            ▼
                                                                                    Phase 6 (觀察性)
                                                                                            │
                                                                                            ▼
                                                                                    Phase 7 (維護持續)
```

Phase 0 為所有後續 Phase 的 prerequisite;Phase 1 + Phase 2 可平行;Phase 3 起依 Phase 2 完成。

---

## §11 設計拍板項(rev2 不變式)

> **✅ 2026-05-27 user 親決完成**,12 項拍板鎖定 rev2 整合的不變式;`.specify/memory/constitution.md` v1.0.0 將凍結為不可違反的設計權威。原「選項清單」與「Claude 建議」段落保留作為決策歷史紀錄。

### §11.0 兩條鐵紀律

1. **base-web 為權威** — base-web example 有的功能,rust-api 都要提供對應 endpoint(設計範圍嚴格)。「v1 從簡」只能是 phase 實作排程、不能簡化設計範圍。
2. **menu 權限 Casbin enforce** — rev2 核心突破:menu 由 Casbin RBAC enforce、有權才顯示(rev1 未實現)。即使動 base-web 也要做、必在 constitution 顯式授權。

### §11.1 預設帳號命名(rev1 命名 vs mock 對齊)

> **✅ 拍板:(b) `Super/Admin/User` 對齊 mock** + 模仿 User → User01 alias(§11.10b 連動)
> **理由**:base-web login 頁 quick-fill button click 後填入 `Super/Admin/User`、對齊「base-web 為權威」紀律 + user 體驗一致。
> **影響**:Phase 2 F1.1 migration seed;Phase 3 F5.1 auth-login 需含 alias 邏輯(`display_name` 欄或 trigger)

| 選項 | 命名 | 利 | 弊 |
|---|---|---|---|
| (a) 延用 rev1 命名 | `Soybean / Administrator / GeneralUser` | rev1 已驗,migration seed 直接拿來 | base-web quick-fill button 設「Super/Admin/User」,實機 click 後填入 `Soybean` 才是符合 mock 真實行為 |
| (b) 對齊 mock | `Super / Admin / User`(login req) | 對齊 mock quick-fill 直接 work、user 體驗一致 | rev2 自家 migration 需重寫 seed;User 在 getUserInfo response 顯示為 `User01`(alias),rev2 需決定是否模仿 |

**Claude 中性建議**:(b) 對齊 mock 更貼「base-web 為核心」原則;User → User01 alias 機制可選擇實作或不實作(mock 內部行為,rev2 自由)

### §11.2 alova 7 endpoint 是否實作(§5.4 詳對比)

> **✅ 拍板:(a) 全實作 7 endpoint** + 個別 endpoint 可加 disabled / stub flag 給 v1 啟用控制(operational 層面)
> **理由**:對齊「base-web 為權威」紀律 — base-web 用到的 7 endpoint(`addUser` / `updateUser` / `deleteUser` / `batchDeleteUser` / `getLastTime` / `sendCaptcha` / `verifyCaptcha`)都要提供。「個別 disabled / stub」是 operational flag、不是設計範圍縮減。
> **影響**:Phase 4 F9 systemManage-alias-router(4 manage CRUD);Phase 5 F11 extracted-stubs(captcha + getLastTime)

| 選項 | 動作 | 工作量 |
|---|---|---|
| (a) 全實作 | 7 endpoint 完整 handler + service | ~3-5 人日 |
| (b) 全 stub | 7 endpoint 只回 `{code:"0000", data:null}` | ~0.5 人日 |
| (c) 不實作 + 隱藏 alova menu | 0 endpoint + build/plugins 加 `pageExcludePatterns` | 0 人日 + build config 改動 |
| (d) 混合 | systemManage 4 個 CRUD 實作 + auth captcha + getLastTime stub | ~2-3 人日 |

依賴 §11.3 拍板。

### §11.3 Q1+Q3 衝突解(audit §5.4 列的 5 條路徑)

> **✅ 拍板:(B) 升 L4 改 modal placeholder** — 6-10 個 modal/drawer 的 `// request` 一行改 `await fetchCreateXxx(formData)`
> **理由**:Q3「完整 CRUD UI」需 wire 連通、純 read-only 不夠。(B) L4 衝擊範圍可控(每檔 1-3 行)、upstream rebase 衝突小、Q3 體驗最好。違反「不動 inline」直覺紀律、需 constitution v1.0.0 顯式授權。
> **影響**:Phase 4 F7 manage-crud-alignment;**啟用 MODAL-WIRING 軌道 ★**(§7.4)+ BASE-WEB-WRAPPER 軌道(§7.2 補 axios wrapper)

base-web modal/drawer/delete button 全是 `// request` placeholder,Q3 (a)「完整 CRUD UI」≠ 純 A 路徑可達。

| 選項 | 描述 | L4 inline 改動 | Q3 達成度 |
|---|---|---|---|
| (A) | 純 read-only(只實作 13 個 read endpoint,write modal 開但 save 沒反應) | 0 | 60%(read OK) |
| (B) | 升 L4 改 modal `// request` placeholder 接到 wrapper | 6-10 檔、每檔 1-3 行 | 100%(完整 CRUD) |
| (C) | runtime monkey-patch 動態替換 modal handler | 0 inline,1 新檔 | 100%(但 fragile) |
| (D) | 並列 view(`src/views/rev2-manage/*` 完整重寫) | 大 | 100%(但工作量 ≈ 重寫 9 個 rev1 W-FW) |
| (E) | 混合 read 走 (A) + write 走 (B) | 部分 | 80% |

**Claude 推薦**:**(B)** — L4 衝擊範圍小、upstream rebase 衝突可控、Q3 體驗最好,但需 user 親自拍板(違反 Q1 紀律「不動 inline」)

### §11.4 apifoxToken 移除策略(audit §4.8)

> **✅ 拍板:(c) rust-api 寬容 unknown header** — base-web 兩處硬編碼**不動**、rust-api middleware 收到 `apifoxToken` 直接忽略不報錯
> **理由**:L0 最低工、最 upstream-safe。base-web 不動符合「不動 inline」紀律。
> **影響**:無新軌道;rust-api middleware 寬容 unknown header

axios `src/service/request/index.ts:17` + alova `src/service-alova/request/index.ts:37` 兩處硬編碼 `apifoxToken`。

| 選項 | 動作 | L 等級 |
|---|---|---|
| (a) 動 inline 兩處 | 改 1 行 × 2 檔 | L4 |
| (b) vite proxy 反向 removeHeader | 動 `build/config/proxy.ts` | L4 build infra |
| (c) 接受該 header 仍送 | 自家 rust-api 直接忽略 unknown header | L0 |

**Claude 中性建議**:(c) 最低工、最 upstream-safe;(b) 中性;(a) 最髒

### §11.5 alova menu 處理策略(audit §4.10.2 + 4.10.4)

> **✅ 拍板:(b'-narrow) `pageExcludePatterns` 隱藏 demo** — `build/plugins/router.ts` 加 pattern 排 `views/demo` 目錄;`document` / `exception` customRoutes 不動
> **理由**:對齊「menu 都要 Casbin enforce」紀律 — demo menu 不在 Casbin enforce 範圍、不該對 prod user 顯示。違反「不動 build 配置」直覺紀律、需 constitution v1.0.0 顯式授權。
> **影響**:Phase 4-5;**啟用 BASE-WEB-BUILD-CONFIG 軌道 ★**(§7.3)

| 選項 | 動作 | sidebar 顯示 | upstream rebase 風險 |
|---|---|---|---|
| (b) 完全保留不動 | 0 改動 | 8 demo + 2 業務 menu | 永遠 clean |
| (b'-narrow) | `build/plugins/router.ts` 加 `pageExcludePatterns` 排 views/demo 目錄 | 約 6 demo menu 仍在(`文档` / `异常页` 從 customRoutes 來、排不掉)| 低(build/plugins 穩定) |
| (b'-full) | (b'-narrow) + 動 `src/router/routes/index.ts` 刪 `document` / `exception` customRoutes | 8 demo 全隱、剩 2 業務 | 中高(routes/index.ts upstream 集中地)|

**Claude 建議**:**Phase 1-4 採 (b)、Phase 5+ 評估 (b'-narrow)**

### §11.6 sub-crate 拍板(followup §7 已建議,需 user 同意)

> **✅ 拍板**:
> - `axum-casbin`:**重寫**(~3-5 人日)— 統一 rev2 metrics / error / observability 策略
> - `sea-orm-adapter`:**拷貝 rev1**(0 人日)
> - `xdb`:**拷貝 rev1**(0.5 人日)
>
> **理由**:axum-casbin 是 Casbin enforce 中介層、rev2 觀察性都過此層;重寫可不繼承 rev1 metrics 客製包袱。sea-orm-adapter 與 xdb 是工具性 crate、拷貝即可。
> **影響**:Phase 2 F1.1 + Phase 3 F5.1 / F6 / W-F11;**RUSTAPI-SOURCE-ISOLATION 軌道**(§7.6)

| Sub-crate | followup 建議 | 替代選項 |
|---|---|---|
| `axum-casbin` | 重寫(3-5 人日) | 用上游 crate(放棄 rev1 metrics 客製)、拷貝 rev1(帶 rev1 設計包袱) |
| `sea-orm-adapter` | 拷貝(0 人日) | 用上游 crate(可能落後 Casbin 2.10) |
| `xdb` | 拷貝(0.5 人日) | 重寫(無價值)、用上游(無對應 crate) |

### §11.7 auth route mode(static vs dynamic)

> **✅ 拍板:(b) dynamic** — `.env VITE_AUTH_ROUTE_MODE=dynamic`,後端 `/route/getUserRoutes` 控 menu
> **理由**:後端控 menu 是 admin 後台核心價值、也是 §11.0 鐵紀律②「menu 權限 Casbin enforce」的實作前提。.env 改動屬 L1 BASE-WEB-ADAPT 軌道、不違反「不動 inline」紀律。
> **影響**:Phase 3 F5.1 auth-login + F6 route-guard(3 routes endpoint 全實作);BASE-WEB-ADAPT 軌道(§7.1)

| 選項 | 對 rev2 含義 |
|---|---|
| (a) static(.env 不動) | 不必實作 3 個 routes endpoint;menu 全寫死前端;失去 server 控 menu 能力 |
| (b) dynamic(切 `.env VITE_AUTH_ROUTE_MODE=dynamic`)| 需實作 3 個 routes endpoint;menu server 端控制(rev1 後端控 menu 的設計核心)|

**Claude 建議**:**(b) dynamic** — rev2 對齊 rev1 設計核心、後端控 menu 是 admin 後台核心價值;且 .env 改動屬 L1 BASE-WEB-ADAPT 軌道範圍

### §11.8 觀察性 stack 啟動時機(followup §8 已建議,需 user 同意)

> **✅ 拍板:(a) 漸進**:
> - **Phase 1-4**:不啟
> - **Phase 5**:obs-min(loki + promtail + grafana,log-only)
> - **Phase 6**:obs-full(+ prometheus + pushgateway)
>
> **理由**:跟隨 followup §8 建議。Phase 1-4 焦點在核心 feature、不被 obs 設定干擾;Phase 5+ 業務 traffic 增加、需 log 觀察與 metric 追蹤。
> **影響**:Phase 5 + Phase 6 docker-compose 配置;無新軌道

| 階段 | followup 建議 | 替代選項 |
|---|---|---|
| Phase 1-4 | 不啟 | 早啟避免 P5 才裝設定花時間 |
| Phase 5 | 啟 obs-min(loki + promtail + grafana) | 直接 obs-full |
| Phase 6 | 啟 obs-full | 永遠 min(個人 workspace 無 alert 需求) |

### §11.9 軌道清單最終確認

> **✅ 拍板:5 軌道全啟用**(constitution v1.0.0 凍結):

| # | 軌道 | 動的位置 | 等級 | 來源拍板 |
|---|---|---|---|---|
| 1 | BASE-WEB-ADAPT | `.env` + `src/typings/api/rev2-extra.d.ts` 等新檔 | L1+L2 預設可動 | §7.1、§11.7 / §11.10 |
| 2 | BASE-WEB-WRAPPER | `src/service/api/rev2-*.ts` 新檔 | L3 需授權 | §7.2、§11.3 (B) |
| 3 | **BASE-WEB-BUILD-CONFIG ★** | `build/plugins/router.ts` `pageExcludePatterns` | L4 build infra,**需 constitution 顯式授權** | §7.3、§11.5 (b'-narrow) |
| 4 | **MODAL-WIRING ★** | 6-10 modal/drawer 的 `// request` 一行 | L4 view inline,**需 constitution 顯式授權** | §7.4、§11.3 (B) |
| 5 | RUSTAPI-SOURCE-ISOLATION | rust-api 整棵樹 | rust-api 全新寫、不繼承 rev1 code | §7.6(新增)、§11.6 |

★ = 違反「base-web 為核心、不動 inline / build 配置」直覺紀律,必須在 constitution v1.0.0 顯式授權,並寫明授權邊界與理由。

### §11.10 wire 細節決策

> **✅ 拍板**(全對齊 mock wire ground truth):
> - `Role.id` 型:**string**(對齊 mock `getAllRoles`);BASE-WEB-ADAPT 軌道補正 base-web TS typing(rev2-extra.d.ts)
> - User → User01 alias 機制:**模仿**(getUserInfo 回 `User01` alias)— 對應 §11.1 連動
> - 業務驗證錯誤 code 區段:**`5xxx`**(對齊 mock 慣例)
> - `MenuRoute.id` 型:**string**(對齊 TS 顯式宣告 + mock 行為)
>
> **理由**:全對齊 mock = wire ground truth、避免 audit §4.X 抓出的 base-web 內部不一致(typing vs mock)在 rev2 重演。
> **影響**:Phase 2 F4 response-shape-alignment + DTO 設計;Phase 3 F5.1 alias 邏輯;BASE-WEB-ADAPT 軌道(§7.1)

| 決策項 | 選項 | 來源 |
|---|---|---|
| `Role.id` 型 | (a) number(對齊 TS) / (b) string(對齊 mock `getAllRoles`) | audit §4.2 |
| User → User01 alias 機制 | (a) 模仿(getUserInfo 回 alias) / (b) 不模仿(getUserInfo 回 login userName) | followup §4.1 |
| 業務驗證錯誤 code 區段 | `5xxx` / `4xxx` / 其他 | §3.3 |
| `MenuRoute.id` 型 | string(對齊 TS 顯式宣告) | audit §4.2 |

### §11.11 prod 模式 base-web 接 rust-api 的路徑前綴

> **✅ 拍板:(a) `/api/*` 主流** — base-web build-arg `VITE_SERVICE_BASE_URL=/api`;nginx `location /api/` proxy 到 rust-api
> **理由**:主流方案、SPA 路由與 API 路由清楚分離、path 衝突風險最低。
> **影響**:Phase 1 W-F2 dockerfile-base-web build-arg 配置;Phase 1 W-F1 nginx location 配置

| 選項 | 動作 | 含義 |
|---|---|---|
| (a) `/api/*`(主流) | base-web build-arg `VITE_SERVICE_BASE_URL=/api`,nginx `location /api/` proxy 到 rust-api | 清楚分離 SPA 路由與 API 路由 |
| (b) `/proxy-default/*`(對齊 dev) | 對齊 dev 行為,nginx 也 `location /proxy-default/` proxy | base-web 程式無需切 base URL,build 一次 dev/prod 通用 |
| (c) 同源(`/*`) | 全部走 rust-api,base-web 用 nginx try_files fallback | 簡單但 path 衝突需小心 |

### §11.12 Phase 0 brainstorm 文件位置

> **✅ 拍板:(a) `docs/superpowers/<NNN>-<feature-name>.md`** — 對齊 CLAUDE.md §3 階段 0 已寫定的 rev1 慣例
> **理由**:統一管理、跨 feature 在同一目錄可掃;與 spec-kit 指令無耦合、Claude 手動同步。
> **影響**:每個新 feature 啟動前先寫 `docs/superpowers/<NNN>-<feature-name>.md` brainstorm md → 然後 `/speckit-specify` 引用

rev2 spec-kit feature 工作流前置 brainstorm 文件存哪?

| 選項 | 位置 |
|---|---|
| (a) `docs/superpowers/<NNN>-<feature-name>.md`(rev1 慣例) | 統一管理但需編號 |
| (b) `specs/<NNN>-<feature-name>/brainstorm.md`(與 spec 同目錄) | 內聚但 spec-kit 不自動讀 |
| (c) 不寫獨立檔,brainstorm 階段直接寫進 spec.md 開頭 | 最簡單 |

### §11.13 login 替代入口的後端 endpoint 是否實作

> **✅ 拍板:(c) 全實作 + 雙模設計** — base-web 5 login sub-route(`pwd-login` / `reset-pwd` / `code-login` / `register` / `bind-wechat`)rust-api 都實作對應 endpoint,但**雙模**:
> - **stub mode**(v1 啟用):不依賴外部服務、回 stub response 給 form submit 不報錯
> - **真實 mode**(v2/v3 切):接 SMS provider / wechat OAuth 真實流程
>
> **理由**:對齊「base-web 為權威」鐵紀律 — base-web 有的 form UI、rust-api 都要對應 endpoint。雙模設計讓 v1 不依賴外部服務(SMS / wechat OAuth)就能 onboard、v2/v3 業務成熟切真實 mode。
> **影響**:Phase 5 F11 extracted-stubs 範圍擴大(+ 4 endpoint);RUSTAPI-SOURCE-ISOLATION 軌道涵蓋雙模設計

**新發現的 endpoint 缺口**(followup §13.2 + §13.6.2):
- base example login 5 sub-route:`pwd-login`(主)+ `reset-pwd` / `code-login` / `register`(三個有完整 form UI)+ `bind-wechat`(空 placeholder)
- 三個有 form 的替代入口,form submit 流程推測:**alova `sendCaptcha` + `verifyCaptcha` + 某個「終局 endpoint」**(form submit 終局 endpoint 名 base example 未實機驗,以下為設計推測)
- **目前 §3 列的 alova-only 7 endpoint 只有 `sendCaptcha` + `verifyCaptcha`,完全沒有 `register` / `resetPwd` / `codeLogin` / `bindWechat` 終局 endpoint**
- 這代表:rev2 若要支援這四個流程,**還需新增 4 個後端 endpoint**(超出 §3 完整表)

候選 endpoint 規格(rev2 設計時可參考,具體 path 待確認 base-web 真實 wire):

| 流程 | Method | path 候選 | 輸入 | 輸出 |
|---|---|---|---|---|
| reset-pwd | POST | `/auth/resetPwd` | `{phone, captcha, newPassword}` | `null` 或新 token pair |
| code-login | POST | `/auth/codeLogin`(或 `/auth/login` 加 mode 欄) | `{phone, captcha}` | `LoginToken{token, refreshToken}` |
| register | POST | `/auth/register` | `{phone, captcha, password, ...}` | `null` 或自動 login 回 token |
| bind-wechat | POST | `/auth/bindWechat` | `{wechatCode}`(OAuth2 grant)| `null` |

選項:

| 選項 | 動作 | 工作量 | 含義 |
|---|---|---|---|
| (a) rev2 v1 不實作 | 只支援 pwd-login 主流程;reset-pwd / code-login / register / bind-wechat 四頁 UI 仍可進但 submit 會 fail | 0 | 簡化 v1 範圍 |
| (b) 部分實作(register + reset-pwd 兩個無外部依賴的) + sendCaptcha / verifyCaptcha 業務化(可選真實 SMS 或 stub mode) | + 2 個 endpoint + SMS 整合(或不真實發送的 stub mode) | 中(~3-4 人日) | 對齊一般 admin 後台常見功能 |
| (c) 全實作(4 個 + SMS + wechat OAuth) | + 4 個 endpoint + 第三方 SMS API + wechat OAuth | 大(~5-8 人日 + 第三方 API 整合) | 完整支援所有 login 入口 |

**Claude 中性建議**:rev2 v1 採 (a) 不實作(focus pwd-login 主流程 + manage 業務);若 rev2 後期業務需要(對外開放註冊 / 忘記密碼自助 / 微信登入),再升 (b)/(c)。

**相關 §11.5 alova 處理策略連動**:若 §11.13 選 (a) 不實作,**建議**配合 §11.5 走 `(b'-narrow)` 用 `pageExcludePatterns` 隱藏 alova menu(避免 user 點進 reset-pwd / code-login / register 頁 form submit 報錯);或保留 sidebar 但接受點進去 form submit 走 toast error(`code:"1000"` 或自訂)。

---

## §12 文件交叉引用

- **CLAUDE.md** — workspace 指引(命名 / git 操作手冊 / spec-kit 工作流 / 預設帳號 / port 配置 / 知識圖譜)
- **[INTEGRATION-RESEARCH.md](INTEGRATION-RESEARCH.md)** — rev1 設計鏈萃取 + 30 feature 教訓
- **[MOCK-COVERAGE-AUDIT.md](MOCK-COVERAGE-AUDIT.md)** — mock wire 三段 CDP capture 報告
- **[INTEGRATION-RESEARCH-FOLLOWUP.md](INTEGRATION-RESEARCH-FOLLOWUP.md)** — Tier 1/2/3 八項深入研究 + audit 翻案 + 拍板紀錄
- **[.specify/memory/constitution.md](../.specify/memory/constitution.md)** ⏳ — Constitution v1.0.0(尚未撰寫,需從本檔 §7 + §11 拍板後固化)
- **[docs/INTEGRATION-CHECKLIST.md](INTEGRATION-CHECKLIST.md)** ⏳ — 進度單一真相(尚未落地)

---

> **下一步**:user 過目本檔、決定 §11 各項拍板;然後落地 `INTEGRATION-CHECKLIST.md`(進度單一真相)+ 撰寫 Constitution v1.0.0(把 §11 拍板的項目 frozen)+ 進入 Phase 1 第一個 feature 的 brainstorm。
