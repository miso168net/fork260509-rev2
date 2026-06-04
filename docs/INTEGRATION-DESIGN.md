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

> **§2.1.1 migration 自動套用(feature 010 已落地,2026-05-29)**:上圖「一次性 jobs:migration(sea-orm CLI, restart: no)」於 010 接成 **dev/prod stack `up` 即自動套用**機制 —— compose 一次性 `migrate` service(dev override `cargo run --bin migration up`、prod override `command [migration,up]` 經 runtime entrypoint dispatcher,皆讀既有 `database_url` secret)+ `rust-api depends_on migrate: service_completed_successfully` 完成閘門:migration 在 API 起來前套完、**失敗則 `migrate` 非 0 退出令閘門不滿足、`rust-api` 不啟動、`up` 回非 0(fail-fast)**;冪等(`seaql_migrations` 追蹤,re-`up` no-op)。守 [007 FR-009](../specs/007-db-redis-connection/spec.md)(migrate 維持獨立 process、server 不自動 migrate)。**outer-only**(3 外層 compose + `deploy/Dockerfile.rust-api.txt` builder 補 `entity` workspace member 缺口〔009 遺留、Deviation D-1〕,無兩段式 commit)。設計與三向 acceptance 見 [`specs/010-migration-auto-apply/`](../specs/010-migration-auto-apply/)。

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
| **base-web dev(對 mock)** | vite dev server `:21079` | ApiFox cloud mock | `/proxy-default/*`(vite proxy 重寫) | `https://mock.apifox.cn/m1/3109515-0-default/*` |
| **rev2 整合 dev** | vite dev server `:21079`(改 .env) | 自家 rust-api(container `:21081` 或 internal) | `/proxy-default/*` 或 `/api/*` | `http://rust-api:21081/*`(internal) |
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

### §4.6 Phase 0 對稱盤點(rev2 啟動前 baseline)

> **目的**:rev1 在 F29 cutover 前才做盤點、結果發現 R3(code namespace)+ R4(secret example)兩項漏項。rev2 應在**第一個 spec-kit feature 啟動前**就把以下 6 項 baseline 固化,供後續 `/speckit-plan` 階段 Compliance Check 對齊。權威源:[RESEARCH §7.2](INTEGRATION-RESEARCH.md)。
>
> **本節為設計基線、非實作清單** — 各 feature spec 內補實際 placeholder/seed 值與 timestamp。

#### §4.6.1 application.yaml placeholder 規劃

- **基線結構**:採 rev1 F1.1 已驗證的 `_FILE` pattern + boot-time strict validation 模式([RESEARCH §3.2.004](INTEGRATION-RESEARCH.md))
- **必要 section**(待 Phase 1/2 feature spec 內具體化):
  - `[server]` — host / port(對應 §8.2 dev 21081 / prod internal `:80`)
  - `[database]` — url placeholder(走 `APP_DATABASE_URL_FILE`、實值 `_FILE` 注入)
  - `[redis]` — url placeholder(同上,走 `_FILE`)
  - `[jwt]` — `secret` + `refresh_secret` placeholder(過 §6.1 strict validation:非空 + 不在黑名單 + 長度 ≥ 32)+ TTL 欄
  - `[casbin]` — model 路徑 + redis pub-sub channel `casbin:policy:invalidate`(§6.3)
  - `[logging]` — level + format
- **placeholder 黑名單**(boot panic 條件):沿用 rev1 6 個值(`change-me` / `secret` / `xxx` / ...,§6.1)
- **驗收**:`grep -r "<TO_BE_SET>" rust-api/server/` 應為空(無殘留 placeholder)

#### §4.6.2 .env.example + 11 個 secret 範本檔

**11 個 secret = 必須 7 + 可選 4**(權威源:§8.4 secret 清單):

| 類 | Secret | 用途 | Service |
|---|---|---|---|
| 必 | `jwt_secret` | JWT HS256 金鑰 | rust-api |
| 必 | `refresh_token_secret` | refresh JWT 金鑰(獨立 §6.1) | rust-api |
| 必 | `database_url` | DB 連線 URL(含密碼) | migration, rust-api |
| 必 | `redis_url` | Redis 連線 URL(含密碼) | rust-api |
| 必 | `postgres_password` | DB 純密碼 | postgres |
| 必 | `redis_password` | Redis 純密碼 | redis |
| 必 | `cleanup_database_url` | cleanup-job 最小權限 DB URL | cleanup |
| 選 | `acme_email` | acme.sh 註冊 email | front-nginx(prod) |
| 選 | `grafana_admin_password` | grafana admin | grafana(obs) |
| 選 | `postgres_exporter_dsn` | postgres metrics DSN | postgres_exporter(obs) |
| 選 | `redis_exporter_password` | redis metrics(JSON 格式) | redis_exporter(obs) |

- **dual-write 紀律**(§8.4 強調):`database_url.txt` 內 password 段 ≡ `postgres_password.txt` 純值;`redis_url.txt` 同理(不一致 → 連線認證失敗 → `/health` unhealthy)
- **.env.example 內容**(§8.4):`COMPOSE_PROJECT_NAME=rev2-admin` + `IMAGE_TAG=rev2-admin-rust-api` + `BASE_WEB_TAG=rev2-admin-base-web` + TZ / POSTGRES_USER / POSTGRES_DB 等非 secret 變數
- **驗收**:7 個必須範本檔在 `deploy/secrets/*.txt.example` 齊備;4 個可選範本檔在 obs 啟用前可缺

#### §4.6.3 Casbin policy seed 矩陣(3 role × 主流 endpoint)

**role 命名**(對齊 mock,[MOCK-AUDIT §4.4](MOCK-COVERAGE-AUDIT.md)):

| Role 常量 | 對應預設帳號(§11.1) | 範圍 |
|---|---|---|
| `R_SUPER` | `Super` | 全通(逐 endpoint 列、無 wildcard;§11.22) |
| `R_ADMIN` | `Admin` | 部分(逐個列) |
| `R_USER_COMMON` | `User`(displayName `User01`) | 僅自身相關 |

**seed 矩陣**(§5.1 endpoint × 3 role,認證登入 feature〔013〕落地時固化):

| Endpoint | R_SUPER | R_ADMIN | R_USER_COMMON | 備註 |
|---|---|---|---|---|
| `POST /auth/login` | (public) | (public) | (public) | 無 Casbin |
| `POST /auth/refreshToken` | (public) | (public) | (public) | 無 Casbin |
| `GET /auth/getUserInfo` | enforce-only | enforce-only | enforce-only | token-only(§5.1) |
| `GET /route/getUserRoutes` | enforce-only | enforce-only | enforce-only | token-only |
| `GET /systemManage/getRoleList` | ✓ | ✓ | ✗ | admin 級 |
| `GET /systemManage/getAllRoles` | ✓ | ✓ | ✓ | user/menu modal 共用;逐 role 列、無 `*` 主體(§11.22) |
| `GET /systemManage/getUserList` | ✓ | ✓ | ✗ | admin 級 |
| `GET /systemManage/getMenuList/v2` | ✓ | ✗ | ✗ | Super-only(019 as-built;§11.22 menu-read 拍板) |
| `GET /systemManage/getAllPages` | ✓ | ✗ | ✗ | Super-only(019 as-built;§11.22) |
| `GET /systemManage/getMenuTree` | ✓ | ✗ | ✗ | role-menu modal 用、Super-only(019 as-built;§11.22) |
| `POST /systemManage/{add,update}User` | ✓ | ✗ | ✗ | 寫操作、only super |
| `DELETE /systemManage/{delete,batchDelete}User` | ✓ | ✗ | ✗ | 寫操作、only super |

- **seed 寫法**(§6.3):**三 role 皆逐 endpoint 列、無 wildcard、無 `*` 主體** —— `R_SUPER` 亦每 gated endpoint 一條 `p, R_SUPER, <path>, <method>`(非 `p, R_SUPER, *, *`),`getAllRoles` 等共通端點逐 role 列;matcher exact-equality(`enforce.rs:41`)`*` 列永不 match,016 as-built 以來 de-facto 逐條(§11.22)
- **redis pub-sub 啟用**:v1 即啟,即使單 instance(§6.3「一致性優先、不靠環境分支」)
- **驗收**:migration 完跑後 `SELECT COUNT(*) FROM casbin_rule WHERE v0 IN ('R_SUPER','R_ADMIN','R_USER_COMMON')` ≥ 上表「✓」總數;三帳號 login 後 `/auth/getUserInfo` 都能進

#### §4.6.4 migration files 規劃(Phase 2 entity 清單 + timestamp 規則)

**timestamp 規則**:`m<YYYYMMDD_HHMMSS>_<name>` 格式;**連續、無 jump**;一個 migration 一張 table 或一組相關 schema 改動。

**Phase 2 entity 清單**(分 3 組):

1. **7 個業務 entity**(soft-delete 三重防護,§6.5):
   - `sys_user` / `sys_role` / `sys_menu` / `sys_role_user` / `sys_role_menu` / `sys_role_endpoint` / `sys_menu_button`
   - 每張表加 `deleted_at TIMESTAMPTZ`(nullable)+ partial unique index `WHERE deleted_at IS NULL`
2. **認證/安全**:
   - `sys_tokens`(refresh chain,schema 見 §6.2)
   - `casbin_rule`(sea-orm-adapter 預設 schema)
3. **觀察性**:
   - `sys_operation_log`(統一 audit,schema 見 §6.4)

**seed migration**(獨立 migration、跑在 schema migration 後):

- `sys_user` 3 帳號 seed(§11.1 拍板 `Super / Admin / User`,argon2id `123456`)
- Casbin policy seed(§4.6.3 矩陣)

**驗收**:`ls migration/src/m*.rs | sort` timestamp 嚴格遞增、無 jump;`sea-orm-cli migrate up` 從零 DB 一次跑完。

#### §4.6.5 sys_user 預設帳號命名 ✅

依 **§11.1 拍板**:**(b) `Super / Admin / User` 對齊 mock**,模仿 `User → User01` alias(§11.10 連動)。三帳號共用 argon2id hash(plaintext `123456`)。Phase 2 F1.1 migration seed 落地。

#### §4.6.6 graphify-out/ 落地時機 ✅

依 [CLAUDE.md §8.3 graphify 守則](../CLAUDE.md):**Phase 4 業務跑通後執行**(rev2 rust-api source 與 base-web wrapper 都到位後跑首版 graphify;`graphify-out/{graph.json, GRAPH_REPORT.md, graph.html, obsidian/}` 在外層 git 追蹤,見 CLAUDE.md §2)。Phase 1-3 期間不跑(source 太少、圖譜訊號弱)。

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

> **✅ 已實作**(005 secret 注入 + 007 config,非獨立 feature):`rust-api/server/src/config.rs` `AppConfig::load()` + `load_secret`/`validate_secret` + `JwtConfig`,compose/secrets 接線齊、單測齊。下列為原始設計規格(實作忠實對齊)。

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
  - `p, R_SUPER, <每個 gated endpoint 一列>`(super 全通、**逐 endpoint、無 wildcard `*` 主體**;matcher exact-equality、016 as-built 以來逐條;§11.22)
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

**✅ 011-audit-log 落地(2026-05-29、SHA pin `5a72560`)— as-built 與此設計的差異/精化**:
- **表**:如上 schema 完整落地(`id` BIGSERIAL / `operation` VARCHAR(20) / `entity_table` VARCHAR(64) / `entity_id`·`operator_id` BIGINT null / `payload_before`·`payload_after` JSONB null / `operator_ip` **INET** null / `trace_id` VARCHAR(64) null / `created_at` TIMESTAMPTZ DEFAULT now()),migration 004、經 **010 自動 migration** 套用。`operation` 設計註解的 `"LEGACY"` 值本 feature 未使用(只 wire `SOFT_DELETE`,餘 INSERT/UPDATE/RESTORE enum 先定義)。
- **單一 API 精化**:唯一寫入入口為 `audit::mutate_in_txn`(泛型 transaction wrapper、codebase 首個 transaction),實際 INSERT 由 `facade::sys_operation_log::write_in_txn` 執行(唯一構造 `entity::sys_operation_log::ActiveModel` 之處)。`audit.rs` 純資料、**不 import entity**(保 009 entity-access lint route (b) 續綠)。
- **CI lint 推遲**:設計的「grep 禁止繞過 facade 寫 audit」build-failing lint **本 feature 未建、留 follow-up**;本階段以 `mutate_in_txn` 結構強綁 + 既有 009 entity-access lint(facade 邊界)+ 文件慣例保證。可靠規則待 Phase 3+ 多寫入路徑時連同 rollout 立。
- **不可變(FR-003)**:entity 無 `deleted_at`、不 impl `SoftDeletable`、只 INSERT。
- **operator_ip INET 註記**:entity 模為 `Option<String>`、本 feature 永遠 None;`None→NotSet`(略過欄、避 PG 42804 `NULL::text` cast 錯)。真實 INET 值寫入(Phase 3 middleware)需 sea_query Expr cast 或 ipnetwork custom type。
- **活體 proof**:`facade::sys_user::soft_delete` 接 `mutate_in_txn`,軟刪 + SOFT_DELETE audit 同一 transaction 原子寫入、password redact。3 個 `#[ignore]` live-DB 測試對 dev postgres 親驗(1 筆 redact / 原子 rollback / 0-rows no-op)。

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
| redis | `redis/redis-stack:7.4.0-v3` | 官方 + `--requirepass` shell wrapper | named volume `redis_stack_data` |

### §8.2 容器編排(dev / prod 雙 compose)

> **named volume 命名(006-docker-volume-naming,2026-05-28)**:7 卷統一 `rev2-admin_<service>_<purpose>`(docker auto-prefix、移除顯式 `name:`;3 key 更名 `redis_data`→`redis_stack_data`・`bw_*`→`base_web_*`)。正典 7 卷清單與規則見 CLAUDE.md §8.2.2。

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

> **✅ 008 已立 base 型別與 pattern**(2026-05-29):`Res<T>`/`AppError` 兩個 `IntoResponse` 已就緒(`server/src/envelope.rs` + `error.rs`),`Res` 內唯一 `Json` 為 `Json(self)` 包自身、`AppError` 經 `Json(Res::<()>::err(..))` 走信封 — 本不變式的 grep(`Json<` 排除 `Json<Res`)目前全淨。Phase 3+ 各 handler 沿用 `Result<Res<T>, AppError>` 簽名即自動受此 pattern 約束。

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
> **as-built 完成紀錄(權威源 — `INTEGRATION-CHECKLIST.md §4. Roadmap & Phase 狀態` 之後會被清理,此處為準)**

### Phase 0 — 設計拍板(prerequisite,2026-05-28 ✅ 完成)

> 整個 rev2 整合的設計基礎、所有後續 Phase 的硬依賴。**不寫 code**,只產出研究 / 設計 / 凍結文件。

1. **`docs/INTEGRATION-RESEARCH.md`** — 早期設計研究,rev1 設計鏈萃取 + 30 superpowers 教訓
2. **`docs/INTEGRATION-RESEARCH-FOLLOWUP.md`** — RESEARCH 深入深研(Tier 1/2/3 八項)
3. **`docs/MOCK-COVERAGE-AUDIT.md`** — 本地 base-web docker-compose 跑後查驗 fork example 用到的 mock api(CDP 三段 capture + wire ground truth)
4. **`docs/INTEGRATION-DESIGN.md`**(本檔)— rev2 整合架構與執行順序設計(12 段 + 31 feature + 12 拍板已回填)
5. **`docs/INTEGRATION-CHECKLIST.md`** — 動態 todo + SOP hook 每次 session 注入錨(完整職責分工見 CLAUDE.md §7)
6. **§11 12 拍板 user 親決**(2026-05-27)— 鎖定兩鐵紀律(base-web 為權威 + menu Casbin enforce)與 5 軌道(2 ★ 需 constitution 顯式授權)
7. **`.specify/memory/constitution.md` v1.0.0**(2026-05-28 凍結)— 設計權威從 DESIGN §11 + §7 提取為不可違反的凍結權威

紀律:Phase 1-7 任何 feature 啟動前,需要 Phase 0 設計鏈完整、拍板凍結。spec-kit `/speckit-plan` 步將自動對照 constitution 跑 Compliance Check(§IV 8 項 yes/no)。

### Phase 1 — 部署基建(無 app 相依,可平行)— ✅ 全完成 (2026-05-28)

1. **rust-api Dockerfile feature** — multi-stage build,non-root user,/health endpoint
2. **base-web Dockerfile feature** — Vite + nginx,SPA fallback,build-arg `VITE_SERVICE_BASE_URL`
3. **TLS 憑證 skeleton feature** — `deploy/generate-dev-cert.sh` + dev/prod nginx conf
4. **容器 port 與編排 feature** — docker-compose base + dev override(2XXXX port)
5. **secret 注入機制 feature** — `_FILE` pattern + `deploy/secrets/*.txt.example` 範本

### Phase 2 — 後端基礎設施(無 app 相依,但為 Phase 3 的起點)— ✅ 全完成 (2026-05-29)

> **Phase 2 餘**(非獨立 feature、隨各 entity / 寫入路徑建立時沿用 pattern):**✅ 已隨各寫端增量完成**(2026-06-04 校正)—— `soft-delete rollout`:rev2 三個可軟刪業務 entity(`sys_user`/`sys_role`/`sys_menu`)已全覆 SoftDeletable + §I.6 審計欄(009/018/019),其餘(`sys_user_role` join + `sys_operation_log`/`sys_access_log`/`sys_login_attempt` append-only)依 §I.6 例外、本就不軟刪;**原「6-entity rollout」係 rev1-era schema 想像**(rev2 role×menu/button/endpoint 走 `casbin_rule` 政策、button 走 `sys_menu.buttons` jsonb,無對應 join 表)、不適用 rev2。`audit 其他 operation 接線`亦已隨各寫端完成(Insert/Update 017-020、SoftDelete 011、Restore 025)。**殘留僅**:`sys_user.audit_json()` 漏 `nick_name`(§2.16,~1 行、非敏感、隨任何 `sys_user` 寫端 / #5 cleanup 順手補)+ `casbin_rule` soft-delete(= [Phase 3 #6 受管 RBAC policy 層](#phase-3--認證--動態選單),需 §11.6 fork amendment)。**下一主軸 = [Phase 3 RBAC](#phase-3--認證--動態選單)**(axum-casbin enforce 重寫 + 受管 RBAC policy 層)。

1. **JWT 機密管理 feature** — strict validation + `_FILE` + refresh secret 分離（**✅ 已由 005 secret 注入 + 007 config 吸收,非獨立 feature**:`config.rs` `AppConfig::load()` 已載 `APP_JWT_JWT_SECRET`/`APP_JWT_REFRESH_TOKEN_SECRET`〔`load_secret` `_FILE`>envvar>panic + `validate_secret` 空/placeholder/≥32〕、`JwtConfig` 含 access/refresh TTL + 兩 secret、compose dev env 預設 + master `*_FILE`→`/run/secrets/` + docker secret `jwt_secret`/`refresh_token_secret` + `deploy/secrets/*.example` + `load_secret`×4/`validate_secret`×3 單測。實際 JWT 簽發/驗證留 Phase 3 login、`sys_tokens` rotation 留 Phase 5,見 §6.1/§6.2）
2. **soft-delete 基礎設施 feature** — 7 entity + facade + CI lint(三重防護)（**✅ 009 已交,2026-05-29 merge `88312b6`**:立**三重防護機制**〔`SoftDeletable` trait〔`deleted_at` 欄語意〕/ facade 為唯一寫入管道 / **build-failing entity-access lint**〔擋 `server/src` 直碰 `entity::` 繞過 facade〕〕+ 套 `sys_user` proof〔`deleted_at` 欄 + partial unique index `WHERE deleted_at IS NULL`〕;**新增 workspace member `entity` crate**〔加 workspace crate 後 `deploy/Dockerfile.rust-api.txt` builder 須同步 COPY,此缺口 010 prod build 才抓到、010 plan Deviation D-1 修;立為跨 feature 守則:加 crate 的 feature acceptance 須含 prod runtime image build〕。**scope:只立機制 + sys_user proof;6-entity rollout 延後**〔各 entity 被建時沿用 pattern,含 `sys_user.id` 無 auto_increment〔007 顯式 seed id〕日後建 user path 須補 `BIGSERIAL`〕。`soft_delete` 0-rows 靜默〔infra scope acceptable,Phase 3+ caller 定語意〕。3 unit subagent-driven、各 spec+quality 雙審 + final review）
3. **envelope 對齊 feature** — `Res<T>` + 業務 code 矩陣（**✅ 008 已交,2026-05-29 merge `7bdf5bb` / SHA pin `e1b0a6c` / rust-api `fac12f6`**:`Res<T>{data,code,msg}`〔`code`=string、無 `success` 欄、`data:None`→`null`、欄位序 data→code→msg〕+ `impl IntoResponse`〔回 HTTP200,業務錯誤未來也走 200〕;`BizCode` 完整 12-variant 矩陣〔`0000/1000/2222/3333/9998/9999/7777/7778/8888/8889/4040/5000`,`code()`+`default_msg()`,本 feature 只 wire `0000`/`4040`/`5000`,餘 9 variant 定義待 Phase 3+〕;`AppError`〔thiserror,最小 variant `NotFound`→404、`Internal(String)`→500;client msg 走 `BizCode::default_msg()`、thiserror Display 僅 log〕+ axum `.fallback()`〔不存在 path 回 `{data:null,code:"4040",msg:"接口不存在"}` live curl 驗〕;`/health` 維持純 `ok`。**拍板:camelCase rename 機制移出本 feature scope、留 Phase 4 各 DTO 自帶**〔信封欄名 data/code/msg 本就小寫無需轉換〕。21 單測鎖契約形狀；3 unit/13 task subagent-driven TDD,各 spec+quality 雙審 + final holistic review）
4. **audit log 基礎設施 feature** — schema + `AuditEvent` + redact(依 soft-delete)（**✅ 011 已交,2026-05-29 merge `--no-ff` 回 `rev2-admin-root` / SHA pin `5a72560`**:`sys_operation_log` 表〔migration 004,經 010 自動 migration 套用、非 server boot〕+ entity〔append-only、**無 `deleted_at`、不 impl SoftDeletable**、FR-003〕;`server/src/model/audit.rs` 純資料層〔`AuditOperation`〔Insert/Update/SoftDelete/Restore + `as_str()`,本 feature 只實際構造 `SoftDelete`〕/ `AuditEvent` / `AuditOperator` / `AuditSerialize` trait + **`mutate_in_txn`**〔codebase **首個 transaction pattern**、唯一寫入入口,把資料變動 closure + audit 寫入綁進同一 `DatabaseTransaction`、both-or-neither;**audit.rs 不含任何 `entity::` 路徑**〕〕;`facade/sys_operation_log.rs::write_in_txn`〔唯一能構造 `entity::sys_operation_log::ActiveModel` 之處、保 009 entity-access lint route (b)〕;`sys_user::soft_delete` 改接 `mutate_in_txn`〔同 txn 內 SELECT active row → redact `audit_json()`〔password→`"<redacted>"`〕→ UPDATE deleted_at → 寫 SOFT_DELETE audit〕,**回傳 `Result<bool,DbErr>`**〔true=軟刪+audit、false=0-rows no-op 不寫 audit〕。**operator_ip INET**:entity 模為 `Option<String>`、本 feature 永遠 None → `None→NotSet`〔略過欄、避 sea-orm `NULL::text` 對 INET 的 PG 42804 cast 錯〕;`Some(ip)→Set(text)` 真值寫入留 **Phase 3 middleware**〔需 sea_query Expr cast 或 ipnetwork custom type〕。**scope 邊界**:只 SOFT_DELETE 真實接線〔其餘 operation enum 先定義〕;無 HTTP 請求層 audit middleware;無其他 entity rollout;**「facade 內漏配 audit」build-failing lint 留 follow-up**〔本階段以 `mutate_in_txn` 結構強綁 + 文件慣例保證〕。守 **007 FR-009**〔server 不自動 migrate,grep regression 0 命中〕+ **009 facade 邊界**〔entity-access lint 續綠〕。測試:redact 純函式 + `write_in_txn` SQL-build〔`operator_ip` NotSet 缺欄斷言〕純單測 + **3 個 `#[ignore]` live-DB 驗收**〔對 dev postgres:軟刪→恰 1 筆 redact audit + user 已軟刪 / 注入 audit INSERT 失敗→UPDATE 與 audit 同 rollback / 0-rows no-op 不寫 audit〕。**兩段式 commit**〔動 rust-api worktree:7 worktree commits + 外層 bump SHA pin〕;subagent-driven 4 unit、各 spec+quality 雙審 + opus final holistic review = Ready;Constitution 7+7=14 ✅）
5. **sub-crate setup feature(012)** — **只拷貝 `sea-orm-adapter` + `xdb`** + casbin_rule 建表 migration + 兩 crate 活體 smoke（**✅ 012 已交,2026-05-29 merge `774f7b3` / SHA pin `e193c47`**:`sea-orm-adapter`〔Casbin↔Postgres policy 儲存〕+ `xdb`〔IP→地區〕拷貝 rev1`@0b64a57`〔**§11.6 / constitution §I.5 授權例外、007 以來首個拷貝 rev1 feature、各 Cargo.toml 標出處**〕。**runtime 非 async-std→tokio**〔brainstorm 誤判,research R2 修正:adapter 既有 `runtime-tokio-rustls` default features、直接對齊 rev2 sea-orm 1.1.20〕;**casbin bump 2.10→2.20.0**〔user 拍板、§6 surface、stable〕— **編譯閘門 `cargo build -p sea-orm-adapter -p xdb` 一次過、adapter `Adapter` trait 零 drift**〔最高風險點清除、adapter.rs 未動〕。**casbin_rule 經 `migration 005`**〔委派 `sea_orm_adapter::up/down` 為**單一 schema 來源**、不手寫 DDL;adapter `migration.rs` 的 `if_not_exists` 使 `SeaOrmAdapter::new()` 自動建表為無害 no-op、**FR-005 調和**〕、經 010 自動套、server 不自動 migrate〔守 007 FR-009、grep 0 命中〕。**活體 smoke 親驗(D2)**:adapter 對 live postgres policy round-trip〔env-gate `DATABASE_URL` `#[ignore]`:清表→Enforcer add_policy `alice/data1/read`→auto-save 寫穿→新 conn 新 adapter 第二 Enforcer auto load→`has_policy` 斷言;psql 確認 `casbin_rule` 有 `p,alice,data1,read`;FR-005 idempotency 顯性驗、`pg_class` count=1〕綠;xdb 解析 `1.2.4.8`→`中国|0|北京|北京市|0`〔非空、`|` 分段、非硬編固定值〕。**附帶修 rev1 潛伏 bug**:`action.rs` `remove_filtered_policy` 對已從 index 0 裝填的 `rule.values` 又切 `[index..]` 致 `field_index>=1` 錯位〔與 casbin 2.20 升版無關、rev1 test 需 live DB 未真跑故潛伏〕→ 單行修正、user 拍板現修、**plan Deviation D-1**;修後 rev1 自帶 `test_adapter`〔改 env-gate〕+ `round_trip_live` 全綠。**scope 邊界**:未接 enforce / 未加 axum-casbin / casbin_rule 無 `deleted_at`〔皆 Phase 3〕;守 009 entity-access lint〔新 crate 不在 `server/src` 掃描〕。**prod runtime image build follow-up**:dev bind-mount 遮住 Dockerfile builder 漏 COPY 兩 crate、merge 後補修+驗綠〔加-crate 須含 prod runtime image build 守則,見 CLAUDE.md §3「Phase 1 verification-commands.md 紀律」〕。subagent-driven 5 unit/10 task、各 spec+quality 雙審 + opus final review;兩段式 commit。**`axum-casbin` 重寫 + 受管 RBAC policy 層改列 [Phase 3](#phase-3--認證--動態選單) #5/#6**〔2026-05-29 012 brainstorm 重定位:中介層需真實受保護路由 + enforce 點才驗得了〕）

### Phase 3 — 認證 + 動態選單

1. **登入 + getUserInfo feature** — `/auth/login` + `/auth/getUserInfo`,Casbin enforce 首次啟用（**✅ 013-auth-login-enforce 已交,2026-05-30 merge `--no-ff` 回 `rev2-admin-root` / SHA pin `bbabdbc`**:`/auth/login`〔argon2 verify → 失敗統一 `1000` 不細分〔FR-002 無 user 列舉〕→ 簽 access+refresh〕+ `/auth/getUserInfo`〔驗 access JWT → facade 查 user + roles〔**DB 為權威源、非 token claims**〕+ buttons〔程式內 `role→[B_CODE]` 矩陣、對齊 mock §4.4〕→ `{userId:string,userName,roles,buttons}`,**`userName=nick_name`〔User→User01 alias〕**;token 無效/過期/缺 `3333`〕+ `/auth/refreshToken`〔驗 refresh JWT → 簽新 access/refresh,**最小無狀態**〔D4,reuse claims、不持久化〕,失敗 `8888`、**絕不 3333/9999/9998**〕。**JWT**:HS256〔新 dep `jsonwebtoken` 9.3.1,**MSRV 1.86 故非 10.x**〕、access/refresh secret 分離、**驗 exp + alg pinning**〔防 alg 降級〕、`Claims{sub,user_id,roles,exp,iat,iss,aud}`、`iss/aud="rev2-admin"`〔base-web token opaque、iss 不驗〕。**首個 Casbin enforce 點**〔§11.6「axum-casbin 重寫」**第一刀**〕:`auth/enforce.rs` = **rev2 自家 axum middleware**〔`from_fn_with_state`:驗 access JWT → 取 roles → 對每 role `enforce((role,path,method))` → 任一 allow 放行、全 deny → **HTTP 403 + `Res::err(5003)`**〕+ casbin RBAC model〔`r=sub,obj,act`/`p=sub,obj,act`/`m=` 三段相等〕+ `Enforcer`〔model + **012 stock `SeaOrmAdapter::new(db)`**〕,`AppState{db,redis,jwt,enforcer:Arc<RwLock<Enforcer>>}`〔boot fail-fast 建好;**+ jwt:JwtConfig 為 data-model §6 未列的必要 deviation D-001**〕;示範路由 `GET /systemManage/getUserList`〔最小 stub,僅掛 `route_layer(enforce_mw)`、`/health`+`/auth/*` 不掛〕,seed `p,R_SUPER,…` + `p,R_ADMIN,…`〔**不給 R_USER_COMMON** → deny 證明〕。**RBAC schema**:`sys_role`〔009 soft-delete + partial unique `code WHERE deleted_at IS NULL`〕/ `sys_user_role`〔join 硬刪〕/ `sys_user.nick_name`〔alias〕+ migration 006-009〔經 010 自動套〕+ facade〔`sys_role`/`sys_user_role` + `sys_user::find_active_by_name/by_id`、守 009 entity-access lint〕。**`Res<T>` err 泛型化**〔§2.11、`err`/`err_msg` 移 `impl<T>`,§2.11 follow-up 收口〕+ **`BizCode` 新增 `5003`「权限不足」**〔5001-5999 業務區、base-web 對非列舉碼 fallback toast 不登出〕。**error code 對齊 mock §4.11**:`0000`/`1000`/`3333`/`8888`/`5003`。**acceptance 三 US 全綠**:curl 活體〔login/getUserInfo/alias/1000/3333、enforce allow〔Super/Admin 200〕+ deny〔User 403+5003〕、refresh〔8888 非 3333/9999/9998〕〕+ **首條真 base-web↔rev2 CDP 瀏覽器登入 smoke**〔base-web `.env.test` `VITE_SERVICE_BASE_URL`→`rust-api:21081`〔BASE-WEB-ADAPT、dev vite proxy `/proxy-default`〕,Super 登入→`/home`、Network 確認 login+getUserInfo 打 rust-api、LS `SOY_token` decode `iss=rev2-admin`、§I.1 里程碑〕。守 007 FR-009〔server 不自動 migrate〕+ 009 lint〔17 passed〕+ 008 envelope;prod runtime image build 驗綠;既有不破〔server 50+3 ignored〕。**兩段式 commit**〔rust-api worktree 13 commits `60e675e..bbabdbc` push fork + base-web `.env.test` push fork + 外層 SHA pin〕;subagent-driven 16 task、各 spec+quality 雙審 + opus final holistic review = Ready to merge;Constitution 7+7=14 ✅ + Deviation Log D-001〔AppState.jwt〕/D-002〔argon2 server dep〕/D-003〔user-enum timing defer〕。**設計細節見 [`specs/013-auth-login-enforce/`](../specs/013-auth-login-enforce/)**〔spec/plan/research/data-model/contracts〕。**scope 外〔皆後續〕**:完整 policy 矩陣 / 全路由 enforce〔#4〕、dynamic routes〔#2〕、login audit〔audit-middleware〕、casbin_rule soft-delete〔#6〕、refresh rotation 持久化〔Phase 5〕。**follow-up nits 見本檔 §10 Phase 3「登入+getUserInfo feature」as-built 段 + §6.1 JWT secret**〔token 簽發 DRY / audit_json nick_name / timing / prod `/api` wire〕）
2. **dynamic mode 路由 feature** — `/route/getConstantRoutes` + `/route/getUserRoutes`(含 `home` 欄)+ `/route/isRouteExist`（**✅ 014-dynamic-routes 已交,2026-05-30 merge `--no-ff` 回 `rev2-admin-root` / merge `9d06347` / SHA pin `8965c8a`**:base-web 翻 **dynamic auth route mode**(`.env` `VITE_AUTH_ROUTE_MODE=static→dynamic`、BASE-WEB-ADAPT)、由 rust-api 供應 3 route endpoint,**業務 menu 可見性走 Casbin enforce 過濾**(§I.2 核心原則落地、重用 013 enforcer)。**3 endpoint**:`GET /route/getConstantRoutes`〔**公開、無認證、無 middleware**、回程式內 constant 5 條、SPA reload 即取〕/ `GET /route/getUserRoutes`〔JWT、**不掛 enforce middleware、過濾在 handler 內**:`bearer→jwt::verify〔access secret+JWT_AUD〕→roles_for_user〔DB 權威〕→menu::filter_routes_for_roles〔enforcer read lock〕→{routes,home:"home"}`;token/roles 錯→`3333`〕/ `GET /route/isRouteExist?routeName=`〔JWT、`menu::route_exists_for_roles`、依角色 allow+deny〕。**route 定義程式內寫死**(`server/src/route/menu.rs`:`MenuRoute{id:string=name,name,path,component,meta:RouteMeta,children?,props?}`/`RouteMeta`/`UserRoute{routes,home}`,**serde camelCase + skip_serializing_if + 省 meta.roles**〔dynamic mode server 已過濾〕;`constant_routes()`〔403/404/500/login/iframe-page,component `layout.blank$view.*`/`layout.base$view.iframe-page`、meta.constant=true〕+ `business_routes()`〔home 葉 + manage 父〔`layout.base`〕含 4 children manage_user/role/menu/user-detail〕,**component 精確對齊 base-web `elegant/routes.ts` 的 elegant-router `$` 複合格式、§I.5 未 grep rev1**〔最高風險點、CDP smoke 抓〕)。**menu 可見性走授權引擎**(D-001 re-scope:初版 brainstorm 程式內 `role→route` map 被 plan Constitution Check item 3 抓違反 §I.2 → user 拍板改):migration `m20260529_000010_seed_menu_policy` seed menu-visibility policy `p,<role>,<route_name>,menu` 進 `casbin_rule`〔**9 rows** = D3 矩陣 Super5+Admin3+User1、`ON CONFLICT DO NOTHING`、沿 009 寫法、經 010 自動套、**父層 manage 不 seed**;`act="menu"` 與 013 endpoint policy `act=method` 共存於同表同 RBAC model、**model 不改**〕+ `filter_routes_for_roles`/`route_exists_for_roles` 用 013 enforcer `enforce((role,route_name,"menu"))`〔任一 role allow 即可見〕+ **tree-prune**〔父層 manage:子項任一可見則保留、children 只留 visible、否則整個 omit;home 葉直接判〕。**D3 三階梯**:Super 全〔home + manage〔user/role/menu/user-detail〕〕/ Admin home + manage〔僅 user + user-detail〕/ User 只 home〔manage tree-prune omit〕。**測試**:enforce 決策 + tree-prune **test-first 6 新單測**〔`MemoryAdapter` seed 同 9 條 menu policy + inline 同份 production RBAC model:Super 全集/Admin 部分/User 只 home/route_exists allow+deny/unknown false/multi-role union〕;wiring 由活體 acceptance 覆蓋。**acceptance 全綠**:三 endpoint curl 活體〔getConstantRoutes 5 條公開、getUserRoutes 三角色不同 + `home="home"` + token 缺/壞 `3333`、isRouteExist Super manage_role→true·**User manage_role→false〔deny〕**·home→true、psql `v2='menu'` 9 rows + `v2='GET'` 2 不受影響〕+ **CDP dynamic-mode 瀏覽器 smoke**〔9229 自建 tab、reload→getConstantRoutes 觸發→登入 Super〔側欄含「系统管理」〕vs User〔側欄**只「首页」**= menu deny 端到端證明〕、getUserRoutes 200 + 兩角色側欄不同〕。**dynamic mode 正面副作用:getUserRoutes 只送業務 route → demo menu(function/plugin/alova/document/multi-menu)根本不送 → §11.5/BASE-WEB-BUILD-CONFIG ★〔隱藏 demo〕在此模式 moot、本 feature 不需動**。守 007 FR-009〔server 不自動 migrate、grep 0 命中〕+ 009 entity-access lint〔route 模組/handler 不碰 `entity::`、roles 經 facade、17 passed〕+ 008 envelope〔全 `Res<T>`〕+ §I.2/§I.3。**無新 dep/表/crate**〔重用 013 enforcer/jwt/bearer/roles_for_user + 008〕;prod runtime image build sanity 驗綠;既有不破〔server 50+3→**56+3**〔+6 filter 測試〕+ xdb 9 + lint 17〕。**兩段式 commit**〔rust-api worktree 7 commits `f65105e..c4b1d7e` push fork〔含收尾移除 mod route 過時 `#[allow(dead_code)]`〕+ base-web `.env` dynamic `41f44b18` push fork + 外層 SHA pin〕;subagent-driven-development 13 task、各 unit spec+quality 雙審 + opus final holistic review = Ready to merge;Constitution 7+7=14 ✅ + Deviation Log **D-001**〔§I.2 re-scope:in-code map→Casbin policy seed+enforce〕/**D-002**〔menu policy row 文件計數 8→9 修正、D3 矩陣權威〕。**設計細節見 [`specs/014-dynamic-routes/`](../specs/014-dynamic-routes/)**;CDP harness `tests/014-dynamic-routes/`。**scope 外〔皆後續〕**:sys_menu 表/menu CRUD、全路由 endpoint enforce 矩陣〔#4〕、policy 治理〔#6〕、redis pub-sub 失效通知〔#3〕、demo menu）
3. **Casbin redis pub-sub 啟用 feature** — `casbin:policy:invalidate` channel(即使單 instance,v1 啟用)（**✅ 021-manage-menu-auth 順帶交付,2026-06-03 本地 READY TO MERGE〔待 push/merge user 同意〕**:MenuAuth 的 `set_role_menu` runtime 改 casbin menu policy 後 PUBLISH `casbin:policy:invalidate`〔消費此前 dead_code 的 `AppState.redis` ConnectionManager、消 `field redis is never read` warning〕;boot `spawn_policy_watcher` 以 `client.get_async_pubsub()` **獨立 pubsub 連線** SUBSCRIBE → 收訊取 enforcer write lock `load_policy()` reload〔error-log 不靜默、5s backoff 重連、不 panic〕。**+1 direct dep `tokio-stream`**〔redis 1.2.1 async pubsub 僅給 `Stream`、逐則收訊須 `StreamExt::next()`;tokio-stream 已是 Cargo.lock transitive `0.1.18`、宣告 direct 僅暴露既有 crate、實作期親決〕。單 instance 自收冪等〔in-place 改 + 自收 reload 讀同態 DB,前提 auto_save 同步〕;publish 失敗 warn-only 不擋請求〔local 改已生效〕;**home 編輯不 publish**〔sys_role 欄、每次 getUserRoutes 從 DB 讀新值、無 enforcer cache〕。多 instance 真實 reload 留 follow-up。實現 §6.3「一致性優先、v1 即啟用」)
4. **policy seed feature** — 三 role × 主流 endpoint 的 Casbin policy migration seed（**013 已做第一刀**:migration 009 seed 示範路由 `/systemManage/getUserList` × {R_SUPER,R_ADMIN}〔不給 R_USER_COMMON 作 deny 證明〕、casbin_rule 維持 stock;**完整 3 role × 主流 endpoint 矩陣留此 feature**）（**✅ 023-manage-endpoint-auth 交付此 #4,2026-06-04 本地 READY TO MERGE〔待 push/merge user 同意〕**:grounding 對抗驗證揭露「**全路由 enforce 字面早已完成**」〔25/25 enforce_mw route 皆有 ≥1 seed policy、零破口〕→ 本波**重定義交付 = runtime 可編輯 + 治理 + 防呆守衛**,非「補未把關端點」。**① runtime 可編輯**:新 `auth/endpoint_auth.rs`〔1:1 鏡像 022 button_auth,唯一 divergence = endpoint 列 keyed on `v2=HTTP method`〔變值,非常數 'button'〕故 HARD REPLACE **逐 method `remove_filtered_policy(0,[role,"",m])` for m∈{GET,POST,DELETE}**、**絕不裸空-v2**〔否則誤刪 v2='menu'(021)/v2='button'(022)列、破正交〕→ `add_policies` 每 endpoint 一列 `[role,path,method]`、空集 Ok(false);6 純單測證 multi-method HARD REPLACE 對 menu/button **正交** + 空集清除 + (path,method) 排序穩定〕+ 3 Super-only handler 入既有 `handler/system_manage.rs`〔`getAllEndpoints` 回 `ENDPOINT_REGISTRY` const〔**28 = 25 既有 + 3 治理**〕**infallible**〔無 DB/無 Err arm,結構差異 vs get_all_buttons〕、`getRoleEndpoints` 預載〔**R_SUPER→全 registry**、root 全通〕、`updateRoleEndpoints` HARD REPLACE + 011 audit〔casbin_rule、operator + before/after endpoint 集〕+ 共用 021 redis pub-sub watcher 即時跨實例〕。**② root-mode**〔自鎖歸零〕:`update_role_endpoints` 拒編輯 R_SUPER〔bare literal `code=="R_SUPER"`、**非** `is_seed_role_code`〔會誤擋 R_ADMIN/R_USER〕〕→ 2222「不可编辑超级管理员」、非法 endpoint〔(method,path)∉ registry〕→ 2222「接口不存在」。**③ D1 build-time 靜態守衛**〔`server/tests/endpoint_coverage_lint.rs`、model on entity_access_lint、重用 strip_comments_and_strings;server bin-only 故 **text-parse** main.rs/migration/endpoint_auth.rs〕:斷言 main.rs enforce_mw routes ↔ migration seed policy ↔ ENDPOINT_REGISTRY **三方一致**〔每 enforce_mw (path,method) 有 ≥1 seed → 關 path-typo/漏 seed 靜默死路由破口〕+ negative fixtures 證咬合〔含 009-form down-statement `v0 IN(…) AND v2='GET'` 不 false-seed 的 regression pin〕;**靜態不發請求 → 繞過 enforce token-vs-policy 陷阱**〔R5:匿名請求先吃 3333、誤 pass〕。**④ 接口权限 modal**:新 `endpoint-auth-modal.vue`〔鏡像 button-auth-modal、NTree key=composite `"method path"`、checks:string[]、`watch(visible)` 重載、root-mode 對 R_SUPER 全勾+NTree/confirm disabled〕+ role-operate-drawer trigger〔**MODAL-WIRING ★ v1.4.0 (c) 子句授權**、§11.21〕+ 3 fetch fn〔BASE-WEB-WRAPPER〕+ i18n `endpointAuth`。**migration 023 只 seed 3 治理端點 R_SUPER 列、無新 crate/dep/fork/表**〔§I.6 gate N/A〕;up→down→up throwaway DB 可逆〔menu 15/button 10/既有 endpoint 存活、僅 3 列精準增刪〕。**⑤ 矩陣 reconcile**〔§11.22〕:DESIGN §4.6.3/§6.3 過時 `p,R_SUPER,*,*` wildcard 文字校正為**逐 endpoint**〔matcher exact-equality `enforce.rs:41`、wildcard 從未實作、016 as-built 以來 de-facto〕+ menu-read 三列〔getMenuList/v2·getAllPages·getMenuTree〕R_ADMIN ✓→✗ 對齊 **Super-only 實作**〔FR-007 單一真相;Admin 可 runtime 經 modal 獲授〕。**acceptance 全綠**:contracts §1–7 curl/psql/redis/audit〔getAllEndpoints 28+Super-only〔Admin 5003/none 3333〕·getRoleEndpoints 預載+root 全通〔Super 28〕·updateRoleEndpoints round-trip **即時**〔grant getMenuTree→Admin 200→還原 403、無重啟〕·root-mode 2222·非法〔含合法 path 錯 method〕2222·roleId number|string·Admin 5003·011 audit operator_id+before/after〕+ **CDP isolated-context smoke**〔① 非-Super modal 可編輯+endpoint tree·② root-mode Super 全勾+disabled,`tests/023-manage-endpoint-auth/`、未擾 user tab〕+ migration 可逆 + 守恆〔server **195 unit**〔含 endpoint_auth 6〕+ **D1 lint 5** + entity_access_lint 17 全綠、零 `entity::` token、`Migrator::up`=0〕+ **回歸 013/016/019/021/022**〔enforce 階梯·menu(021)·button(022) policy 不破、既有 endpoint 矩陣不變 FR-010〕。**Constitution v1.4.0 §IV 8/8 PASS**〔MODAL-WIRING ★ amendment `d700434` + §11.21〕。**兩段式 commit**〔rust-api worktree:migration 023 / endpoint_auth+單測 / 3 handler+route / D1 lint;base-web worktree:wire / modal+drawer;outer:tests/023 CDP harness + SHA pin〕;subagent-driven-development 各單元 fresh implementer + **spec compliance + code quality 雙審**。**設計細節見 [`specs/023-manage-endpoint-auth/`](../specs/023-manage-endpoint-auth/)**。**scope 外〔後續 feature〕**:endpoint 授權的復原/版本管理/受保護標記「完整受管層」、授權把關機制重寫〔萬用/前綴比對〕、in-handler-jwt 端點把關方式統一）
5. **axum-casbin 重寫 feature** — Casbin Axum enforce 中介層,rev2 自家 metrics / error / observability(**2026-05-29 012 brainstorm 從 Phase 2 §11.6 重定位至此**:中介層需真實受保護路由 + enforce 點 + observability 目標〔Phase 6〕才驗得了、整合得了,在 Phase 2 做會「無消費者、無法驗」)（**013 已做第一刀**:`auth/enforce.rs` rev2 自家 axum middleware〔最小機制、驗 JWT→per-role enforce→403+5003、單示範路由〕+ `Arc<RwLock<Enforcer>>` 並發無問題〔未用 CachedEnforcer〕;**本 feature = fuller rewrite**:全路由 rollout + metrics/error/observability 整合〔Phase 6〕）
6. **受管 RBAC policy 層 feature** — 在 casbin policy 上加 rev2 治理:**(a)** soft-delete 可復原 **(b)** 不可刪 protected policy(remove 守衛 + 受保護標記)**(c)** policy 變更走 [011 audit](#§64-sys_operation_log統一-audit)(`mutate_in_txn`,記 operator/何時/加或移除哪條)**(d)** 統一 CRUD facade。**需 fork 拷貝進來的 `sea-orm-adapter`**(改 `load_policy` 過濾 `deleted_at IS NULL`、改 `remove_*` 設標記)+ casbin_rule 屆時加 `deleted_at` + partial unique index + protected 標記。**動到 §11.6「adapter=拷貝」前提** → specced 時須評估 constitution Amendment。(**2026-05-29 012 brainstorm 衍生**:user 要 recoverability + protected + 變更軌跡 + 一致 CRUD;但 soft-delete 的「刪掉不再 enforce」、audit 的「誰改的」皆依賴 Phase 3 的 enforce/operator/policy 入口才驗得了,故與 axum-casbin 重寫同期)

### Phase 4 — 主流業務

1. **manage list endpoints feature** — `getRoleList` / `getAllRoles` / `getUserList` / `getMenuList/v2` / `getAllPages` / `getMenuTree`(全 read,對齊 mock)（**✅ 第一刀 016-manage-role-user-list 已交,2026-06-01**:落地 **user/role 三條**〔`getUserList` 分頁取代 013 stub / `getRoleList` 分頁 / `getAllRoles` 全量〕,**menu 三條〔getMenuList/v2、getAllPages、getMenuTree〕→ ✅ 019 補齊**〔見下方「menu DB-driven feature(019)」〕。**不動業務表**:base-web 想顯示但 entity 無的欄(status/email/phone/gender/roleDesc/時間/operator)一律 DTO 回 `null`〔D2〕、真正補欄綁 #5 審計欄 retrofit + write 那一波。**realized wire 決策**:① 對外 **id=string**〔i64 於 DTO 邊界 `.to_string()`,**採 constitution §I.3 凍結 string,凌駕本檔 §1.5/§3.6/§5.1/L88 殘留的「`Role.id:number`」舊敘述** — 那些屬待掃清矛盾、未走 amendment〕;② pagination 外殼 `PageRes<T>{current,size,total,records}` 放 `envelope.rs` 與 `Res<T>` 同層〔4 欄、**無 pages/success**、current/size/total 為 JSON number〕;③ roles **批次** `roles_for_users(&[i64])→HashMap`〔避 N+1,整頁固定 count1+page1+roles1=3 query,SC-006〕;④ size clamp `[1,100]`、`current` 0-based 轉換**只**在 handler `normalize_page` 一次〔facade 收 page_idx 直接 `fetch_page`,不雙重 -1〕;⑤ 排序 `id DESC`〔entity 無 created_at〕。**授權**:三條各掛 013 `enforce_mw` + 新 seed migration `m..013_seed_manage_policy`〔getRoleList×{SUPER,ADMIN}、getAllRoles×{SUPER,ADMIN,USER_COMMON}、getUserList 009 已有;**逐條 seed 無 wildcard**〔沿 009 先例,**凌駕本檔 §5.1/§6.3 規劃的「R_SUPER wildcard `p,R_SUPER,*,*` + getAllRoles 用 `*` 主體」**〕;路徑無 /api〕。**lint-safe 映射**:DTO mapping fn 收原始欄位〔非 Model 型〕→ handler/system_manage.rs 零 `entity::` token、守 009 lint。**無新 crate/dep**〔用既有 sea-orm `PaginatorTrait` + 008 + 013〕。**acceptance**:server 96 單測 + entity_access_lint 17 + xdb 9 全綠、47/47 活體 curl/psql〔三 endpoint 分頁/搜尋/超範圍/授權〔Super·Admin 200、User list 403+5003、無 token 3333、getAllRoles 含 User 200〕/無 password/id=string/null 欄〕+ **CDP 經 front-nginx 真實 `/api` 路徑** 端到端〔/manage/user 顯 3 user、/manage/role 顯 3 role、null 欄不 crash R5;順帶 de-risk prod-stack CDP(prod base-web /api 路徑見 §11.11)〕+ 6-lens 對抗審查 confirmed=0。**兩段式 commit**〔rust-api worktree 5 commits `7e5ce0b..81c56ef` push fork〕;subagent-driven-development 各單元 spec+quality 雙審。**設計細節見 [`specs/016-manage-role-user-list/`](../specs/016-manage-role-user-list/)**;follow-up 見本檔 §11.10 wire 細節決策(id 型 accepted)+ §10 Phase 4(menu 3 read endpoint,需 sys_menu)）

   - **★ user 寫端 CRUD（017-manage-user-write,2026-06-02 merge `617136d` / SHA-pin `7bfb353` / rust-api worktree 18 commits `910a6a2..deb6abee` / base-web `4c33895`;本地 merge --no-ff、017 branch 保留、未推）** — 把 016 唯讀管理頁閉成**完整 CRUD**:落地 **4 條 Super-only systemManage 寫 endpoint** `addUser`/`updateUser`（POST）+ `deleteUser`/`batchDeleteUser`（DELETE 帶 Json body）。
     - **schema 完補（sys_user）**:migration `m20260529_000014_alter_sys_user_business_audit` 給 sys_user **+9 欄** — 業務欄 `user_gender`/`user_phone`/`user_email`/`status`（small_integer）+ §I.6 審計欄 `created_at`/`created_by`/`updated_at`/`updated_by`/`deleted_by`（`deleted_at` 009 已有）;**`id` 補 `BIGSERIAL`**〔**R2 最高 risk**:用 raw SQL `CREATE SEQUENCE` + `ALTER … SET DEFAULT nextval(...)` + `setval` 對齊既有 seed 1/2/3 → 下一個 `id=4`,修補 007 的「顯式 seed id、無 sequence」缺口;migration `up→down→up` 可逆性對 throwaway DB 親驗〕;seed `status=1` 回填既有 3 row（D6）。`user_name` partial unique 由 003 既有 → C2 條件式跳過、不重複建索引。**entity** sys_user 對應 +9 欄 + `id` `auto_increment=true`（R2 成對改,免 sea-orm insert 仍送 id）;`audit_json()` 補 `nick_name`+9 欄（`password` 持續 redact）。migration `m..015_seed_write_policy` seed casbin **4 行逐條 `p,R_SUPER,<path>,<method>`**〔無 wildcard、沿 009/016 先例〕。
     - **facade 寫 pattern（皆走 011 `mutate_in_txn`、原子 + audit operator 由 015 ctx 帶入）**:`create_user`〔同 txn insert + **預設密碼** `hash_password("123456")`〔新 fn、argon2 random salt、**無新 crate**〕+ `replace_roles_in_txn` + audit `Insert`〔`created_by`=operator〕;`CreateUserError::DuplicateUserName→2222`〕/ `update_user`〔先 load active row→不存在回 `Ok(false)`〔not-found〕;否則更業務欄 + **`updated_at`+`updated_by` 成對顯式 `Set`**〔§I.6、app-side `now()`〕 + role replace + audit `Update`;**不動 `user_name`/`password`**〔**Q1=A：userName 編輯不可改**,UpdateReq 省 `user_name` 由 server 端強制 immutability〕〕/ `soft_delete` 擴 operator 參數〔**`deleted_at`+`deleted_by` 成對** + audit operator,§I.6;承 011 `mutate_in_txn`〕。`sys_user_role::replace_roles_in_txn`〔role `code`→active id、delete+insert **整批替換**（R4 replace-all）、未知/軟刪 `code` 略過（US2-AS-2）〕。
     - **登入 gate（停用拒登,Q2=B / R6 / 親決 A）**:`auth.rs` `login_attempt_inner` 在 argon2 `verify_password` 通過後加 `status == Some(2) → Err(LoginFailed)` = **回 `1000` 統一**,守 013 no-enumeration（停用與帳密錯誤同碼、不洩漏帳號存在）;**僅 login 入口**（FR-013,**不改** `enforce_mw`/getUserInfo — 已登入 session 不受停用即時擋）。
     - **wire / 業務規則**:enum `status`/`user_gender` `i16↔string` 純對映 fn（D5,handler 層);**`id` wire=String**〔寫端收 `String` parse `i64`,R7、承 §I.3 凍結〕;**D7 不可刪自己**〔單筆 + 批次皆刪前檢查 operator_id ∈ targets → **整批拒、無部分執行**〕;**D8 業務錯誤一律 `2222`**〔用戶名重複 / 刪自己 / 不存在 / 非法 id·enum,**非 5xxx**;`2222`=BizError、mock §4.11-grounded〕。**016 `user_item` 改吃 sys_user 真實欄（R10,跨 feature）**:`user_gender`/`status` i16→string、時間 rfc3339、operator i64→string,**缺值仍序列化 `null`**（沿 016 D2,不再全 null）。
     - **base-web 接線（MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER,純接線無 form/typing 改動）**:新檔 `src/service/api/rev2-system-manage.ts`〔BASE-WEB-WRAPPER:`fetchAddUser`/`fetchUpdateUser`/`fetchDeleteUser`/`fetchBatchDeleteUser`、`request<null>`〕+ `index.ts` export;**MODAL-WIRING ★** 接 3 placeholder〔`*-operate-drawer.vue` `handleSubmit` 的 add/edit 分支 + `index.vue` `handleDelete`/`handleBatchDelete`〕,僅改 `// request` 一行、`!error` 才執行成功動作（list refresh / toast）。
     - **acceptance（全綠）**:US1 addUser 10/10（curl+psql:0000、list+1 顯真值無 password、預設密碼登入 OK、重複名 2222、Admin/User 403、無 token 3333、audit INSERT）/ US2 updateUser 9/9（暱稱·角色更新、**userName 不變 SC-009**、updated_at/by 成對、無效+有效 role 只採有效 US2-AS-2、Admin 403、不存在 2222）/ US3 delete 10/10（軟刪出列表、SOFT_DELETE audit `deleted_by`、刪自己 2222 整批拒、Admin 403）/ 登入 gate 6/6（停用拒登 1000 無 token、SC-009）/ 守恆 11/11（server 119 純測 + entity_access_lint 17 + xdb 9 + 無 `Migrator::up` + **migration up→down→up 可逆** + 013/016 不破）/ **真 CDP 7/7**〔經 front-nginx `:21080` 整合路徑:登入→新增→編輯〔userName 不可改〕→刪除→null 不 crash→停用帳號登入顯失敗〕/ **prod image build 綠**。**§I.6 retrofit:sys_user 6 審計欄落地完成**（見下方「審計欄 retrofit feature」項）。**無新 crate/dep**（argon2/sea-orm `small_integer` 既有）。subagent-driven-development 28 task/3 US + 登入 gate,各兩階段 review（spec compliance 對 spec.md + code quality）+ opus final holistic review = Ready to merge（FR-001..013 + SC-001..009 全可追溯、跨任務一致〔audit operator / 2222-vs-5000 / wire-string id / enum / §I.6 成對〕、無 Critical/Important issue）。Constitution v1.2.0 §IV 8/8 PASS（#2 menu N/A、#8 §I.6 N/A create-time + retrofit 落地）。**兩段式 commit**〔rust-api worktree push fork `rev2-admin-rust-api` + base-web push fork `rev2-admin-base-web` + 外層 SHA-pin `7bfb353`〕。**設計細節見 [`specs/017-manage-user-write/`](../specs/017-manage-user-write/)**;follow-up 見本檔 §10 Phase 4「user 寫端 CRUD feature(017)」as-built 段 + §11.15 MODAL-WIRING 邊界擴展。

   - **★ menu DB-driven（019-manage-menu-list,2026-06-02 merge `a07ff13` 回 rev2-admin-root〔--no-ff、保留 019 branch〕+ 已推 origin / SHA-pin `239dcfd` / rust-api worktree `20022fb..3ef3369` 5 commit push fork;server-only、base-web 未動）** — 把 014 in-code route 常數遷成 `sys_menu` 業務表(選單定義單一真相),讓 runtime `getUserRoutes` 與管理頁 `getMenuList` **共讀同源**,完成 feature 1 的「menu 三讀端」。**D1-D5 親決(brainstorm)**:D1 DB-driven 統一源 / D2 讀端+runtime 遷移(寫端 CRUD→020)/ D3 buttons 存 sys_menu JSONB / D4 可見性 Casbin policy(010)不變·MenuAuth 編輯→後續 / D5 getUserRoutes 輸出逐字不變(回歸鐵律)。
     - **schema(`sys_menu`,§I.6 凍結後首張新建業務表)**:migration `m20260529_000018_create_sys_menu` —— ~26 欄〔jsonb `buttons`/`query` + 路由 meta(menu_type/icon_type/status i16、order/fixed_index_in_tab i32、hide_in_menu/keep_alive/constant/multi_tab bool、route_name/route_path/component/icon/i18n_key/href/active_menu varchar),**`order` 保留字** entity `#[sea_orm(column_name="order")] order_no`〕**+ §I.6 6 審計欄一次帶齊**〔forward-only、**0 retrofit 債**、SC-007;對比 sys_user(017)/sys_role(018)的 retrofit〕 + partial unique `sys_menu_route_name_active_uniq`(route_name WHERE deleted_at IS NULL)+ **seed 6 筆逐字重現 014 `business_routes()` 樹**〔home/manage top + manage_user/role/menu/user-detail 子、parent_id subquery、ON CONFLICT DO NOTHING〕;entity `sys_menu`(27 欄 DeriveEntityModel)。migration `m..019_seed_menu_read_policy` casbin **3 行 R_SUPER**(getMenuList/v2·getAllPages·getMenuTree=GET、down 精準 by v1、不踩 010 menu policy)。
     - **facade + 純函式樹組裝**:`sys_menu` 讀端 facade(SoftDeletable `find_active`/`list_active_paginated`/`list_active_all`/`impl AuditSerialize`)+ **`assemble_menu_tree(Vec<Model>)→Vec<MenuNode>`** 純函式 seam〔parent_id 分組、依 `order` **stable sort(None 末)**、孤節點(parent 不存在/軟刪)略過掛接;`MenuNode` 中介型供 US1(MenuRoute)/US2(MenuTree)兩消費者、單測〕。
     - **US1 `getUserRoutes` 改讀 sys_menu(★ 最高風險、D5)**:`get_user_routes` 骨架(bearer→jwt verify→`roles_for_user` DB-fresh→3333 收斂)不變,route 來源由 in-code `business_routes()` 改 `list_active_all`→`assemble_menu_tree`→`menu_node_to_route`〔map MenuNode→MenuRoute、**`props` 由 `route_path.contains(':')` 衍生 `Some(true)`/`None`**、**reuse 既有 `MenuRoute`/`RouteMeta` struct** 保 wire key 序 + skip-none〕→`filter_routes`〔由 `filter_routes_for_roles` 抽出參數化版、tree-prune Casbin enforce 語意**逐字不變**〕→`UserRoute{routes,home:"home"}`。**輸出逐字不變**:三角色 live curl diff=0 + unit test `assert_eq!(to_value(map(seed-tree)) == to_value(business_routes()))`〔C 單元 reviewer 跑 mutation test 證測試咬合〕;`business_routes()` 保留為 014 regression baseline(`#[allow(dead_code)]`);**`constant_routes`/`get_constant_routes`/`is_route_exist`/`menu_visible` 不動**(R6:constant routes 前端專屬、isRouteExist 純 enforce-based);migration 010 menu policy(9 rows)不動。
     - **US2 三讀端**:`get_menu_list`(/v2 flat 分頁 `Res<PageRes<MenuItem>>`,records 平鋪每筆帶 parentId、前端表格非 tree;**id/parentId=string**〔**top-level parentId="0"**,base-web `Menu.parentId:number` 非 nullable、root 慣例 0,analyze I1〕、menuType/iconType/status i16→"1"/"2"、order/fixedIndexInTab=**number**、buttons/query jsonb、createTime rfc3339、children:null)/ `get_menu_tree`(`Res<Vec<MenuTreeNode>>` 非分頁、**id/pId=number**〔root pId=0、對齊 typing tree-select key、**不套 string type-lie**〕、label=menu_name、children skip-if-none、由 assemble_menu_tree 建)/ `get_all_pages`(`Res<Vec<String>>` **48 靜態頁集 = base-web example `src/router/elegant/imports.ts` 的 `views` keys**,analyze A1 釘:取 example 分支實際可路由頁、非任意值;020 寫端 create menu 選 component 沿此集)。三端掛 013 `enforce_mw`、Super-only(clarify Q1:對齊 `manage_menu` 選單僅 Super 可見、端點授權與頁面可見性一致)。
     - **id 型分流**(各對齊自身 base-web typing、非偶然):`MenuRoute.id`=string(route_name、§I.3)/ `MenuItem.id`·`parentId`=string(CommonRecord type-lie 同 RoleItem、§I.3 v1.2.1 決定不修)/ `MenuTree.id`·`pId`=number(獨立型、typing 明寫 number)。
     - **紀律**:**無新 crate/dep**(sea-orm `Json` 內建、serde_json 既有);handler/route 零 `entity::`(009 lint、走 facade + `MenuNode` crate path);**server-only**(base-web `fetchGetMenuList/Tree/AllPages` 已存在 upstream、URL 已對、getUserRoutes wire 透明 → R0 不動 base-web、§III ★ 軌道未觸發)。
     - **acceptance(全綠)**:getUserRoutes 三角色逐字 diff=0(Super=[home,manage(4子)]/Admin=[home,manage(user,user-detail)]/User=[home])+ getConstantRoutes 不變 + 三讀端形狀 + Super-only(Admin→5003·none→3333 三端)+ psql sys_menu 6 筆真值 + **真 CDP `/manage/menu` 顯 6 筆**〔父級ID top=0·隱藏=是·icon·排序·側欄 nav Super 階梯〕 + migration 018+019 up→down→up 可逆(010 menu policy 9 不動)+ **prod image build 綠** + 守恆(server 150 單測 + entity_access_lint 17 + handler 零 `entity::` + `Migrator::up` 0)+ 回歸 013 enforce/014 menu 逐字/016 list/017·018。subagent-driven-development 4 單元(A entity+migration018 / B facade+assemble_menu_tree / C getUserRoutes 逐字 / D 三讀端+policy019),各兩階段 review(spec+quality)+ opus final holistic = READY TO MERGE(FR-001..010 + SC-001..008 全可追溯)。Constitution v1.2.1 §IV 8/8 PASS(無 amendment;§II §11.7 凍的是 auth route **mode=dynamic** 非「menu source」、本檔 §5.1 原即註 getUserRoutes「從 sys_menu 過濾」→ 本波 align 設計意圖、非偏離;getUserRoutes 源遷移記 plan Complexity Tracking)。**設計細節見 [`specs/019-manage-menu-list/`](../specs/019-manage-menu-list/)**;follow-up CHECKLIST §2.23。
   - **★ menu 寫端 CRUD（020-manage-menu-write,2026-06-02 merge `0c73e3b` 回 rev2-admin-root〔--no-ff、保留 020 branch〕+ 已推 origin / SHA-pin `a9bc8e1` / rust-api worktree `80afdaf..dfa68c1` push fork + base-web `0d07e9f` push fork;rust-api + base-web 兩倉）** — 把 019 唯讀選單管理頁閉成**完整 CRUD**:4 條 Super-only 寫端(`addMenu`/`updateMenu` POST、`deleteMenu`/`batchDeleteMenu` DELETE)寫 019 `sys_menu`,接 base-web 選單管理頁 5 個 `// request` placeholder。**D1 統一源 payoff 實證**:`get_user_routes` **code 不動**,因 runtime 導覽與管理頁共讀 sys_menu → 編輯既有可見選單(種子 manage_user 的 order)即時反映於 getUserRoutes(curl diff 證:該欄變、其餘逐字)。**D1-D5 親決(brainstorm)全落地**:D1 範圍=menu 定義 CRUD〔MenuAuth 可見性編輯=獨立後續〕/ D2 **routeName·menuType editable 時 immutable** / D3 **020 不碰 casbin**〔runtime 零 casbin_rule 寫入、migration 010 menu policy 不動;新選單在 MenuAuth 指派可見性前 absent from nav、present in getMenuList=SC-006〕/ D4 **6 種子保護**〔不可刪/停用、可改其他欄〕/ D5 **父有 active 子擋刪 + batch 兩段原子拒**。
     - **schema:不建表/不 alter**(用 019 `sys_menu`、§I.6 6 審計欄 create-time 已備、0 retrofit 債)。唯一 migration `m20260529_000020_seed_menu_write_policy` casbin **4 行 R_SUPER**(ON CONFLICT DO NOTHING、down 精準 by v1 IN 4 path、不踩 010 v2='menu' 9 / 019 read 3)。
     - **facade 寫端**(`model/facade/sys_menu.rs` 擴、鏡像 018 sys_role、走 011 `mutate_in_txn`):`create_menu`〔route_name active 唯一前檢→`DuplicateRouteName`→2222 + insert + audit Insert + `created_by`〕/ `update_menu`〔load active→Ok(false) + `update_menu_query` col_expr 業務欄 + **`updated_at`+`updated_by` 成對 DB-side `current_timestamp`** + 重查 + audit Update;**SQL 不含 route_name/menu_type/parent_id**=D2+FR-011〕/ `soft_delete`〔`deleted_at`+`deleted_by` 成對 + audit SoftDelete〕/ `count_active_children`(D5 父刪 guard、active-only)/ `find_active_by_id`。3 SQL-build seam(`build_create_menu_active`/`update_menu_query`/`soft_delete_query`)純函式單測(欄 Set/NotSet 狀態 + immutable 排除 + §I.6 成對 + JSON 欄 `Expr::value(Value::Json)`)。
     - **handler 寫端**(`handler/system_manage.rs` 擴、鏡像 017/018、零 `entity::`):`add_menu`/`update_menu`(POST)+ `delete_menu`/`batch_delete_menus`(DELETE、沿用 `DeleteReq`/`BatchDeleteReq`);`MenuCreateReq`(parentId 用 `de_parent_id`)/ `MenuUpdateReq`(**省 routeName/menuType/parentId**=serde 靜默丟=**immutable 雙鎖**之 DTO 鎖、與 SQL col_expr 不含並用);純函式 `is_seed_menu`(6 seed route_name code-based、鏡像 `is_seed_role_code`)+ **`de_parent_id`**(parentId 混型 number\|string\|null→Option<i64>、0/"0"/null/空→None、非數字 string→serde err;untagged enum 吸收、float/overflow 自然 fall-through 成 error;單測 8 case=Complexity Tracking 項);種子 guard(刪/停用 status==Some(2)→2222)+ 父刪 guard(count_active_children>0→2222)+ **batch 兩段原子拒**(pass1 任一種子 OR 具 active 子→整批拒、pass2 逐筆寬鬆 Ok(false) 跳過、DB Err→5000;業務層零部分執行)。operator 由 015 ctx(None→5000);業務錯誤一律 2222、`order` wire key(非 orderNo)。
     - **base-web 接線**(MODAL-WIRING ★ v1.2.0 + BASE-WEB-WRAPPER、鏡像 017/018):`rev2-system-manage.ts` +4 fetch fn(`request<null>`、`MenuWriteModel` Pick)+ `menu-operate-modal.vue` handleSubmit(operateType `edit`→update、`add`/`addChild`→add、`getSubmitParams()` 送全 Model)+ `index.vue` handleDelete/handleBatchDelete(只改 `// request`、`!error` 才成功);typecheck 乾淨(`vue-tsc --noEmit` exit 0)。
     - **acceptance(全綠)**:US1-3 curl/psql(addMenu parentId number `0`·string `"2"` 皆吃/dup 2222/Admin 5003·none 3333/buttons jsonb round-trip/created_by/audit INSERT;updateMenu 業務欄更新/**送 HACK routeName·menuType 被忽略**〔DB 仍 report/menu_type=2〕/updated_at·by 成對/不存在 2222;delete·batch 軟刪 deleted_by/**種子刪 2222**/**父有子 2222**/種子停用 2222/批次含種子整批拒 0 部分執行/批次含不存在寬鬆跳過 0000)+ **D1 payoff**(編輯種子 manage_user order 1→5→getUserRoutes 即時反映、還原後業務欄 byte-identical)+ **SC-006**(新選單 absent from getUserRoutes〔grep 0〕、present in getMenuList〔grep 1〕)+ 三角色 getUserRoutes 逐字 == 014/019 基線 + getConstantRoutes 不變 + 019 三讀端不破 + migration 020 up→down→up 可逆 + **prod image build 綠** + **front-nginx :21080 `/api` proxy 4 寫端驗**(base-web fetch 實際路徑)+ 守恆(server 170 單測 + entity_access_lint 17 + handler 零 `entity::` + `Migrator::up` 0)。subagent-driven-development 兩倉 ~11 unit(migration / 純函式 guards / facade create·update·delete / handler add·update·delete·batch / base-web wrapper+wiring),各兩階段 review(spec compliance + code quality)+ opus final holistic = READY TO MERGE(FR-001..012 + SC-001..008 全 trace、7 cross-cutting 一致)。**CDP browser smoke defer**(headless 無 `:9229` browser;curl-direct + front-nginx `/api` proxy + 逐字鏡像 CDP-proven 017/018 覆蓋)。Constitution v1.2.1 §IV 8/8 PASS(#8 N/A 不建表;無 amendment;**parentId 彈性反序列化** + **getUserRoutes code 不動、D1 靠編輯既有可見選單驗** 記 plan Complexity Tracking)。**無新 crate/dep**。**設計細節見 [`specs/020-manage-menu-write/`](../specs/020-manage-menu-write/)**;commit 里程碑見 [MILESTONES](INTEGRATION-MILESTONES.md) `0c73e3b` row。
   - **★ MenuAuth — 角色×選單可見性 runtime 編輯 + per-role home（021-manage-menu-auth,2026-06-03 本地 READY TO MERGE〔待 push/merge user 同意〕;rust-api worktree `dfa68c1..bbdadcb`〔T002-T008 + T016 doc〕+ base-web `0d07e9f..cbbf1ea`〔T009-T010〕,皆 local 未 push;rust-api + base-web 兩倉)** — 把選單由「建置期硬編」推進到「**維運期可編輯**」:Super 在角色管理頁 `menu-auth-modal` runtime 設定「哪角色看哪選單」(改既有 Casbin menu-visibility policy `(p, role_code, route_name, 'menu')`)+ 設「角色落地頁 home」。**閉合 menu arc**(019 讀 → 020 寫 → **021 可見性指派**)、解 020「新選單在指派可見性前不顯 nav」缺口(D1 完整 payoff)。接 020 留的 `menu-auth-modal` 4 placeholder;**ButtonAuth 機制不同(登入資訊程式內對映、不走可見性把關引擎)→ 獨立後續 feature**。M1-M5 親決(brainstorm `903e5a2`)。
     - **schema:不建表**(ALTER `sys_role` +`home varchar null` 鏡像 016、seed 回填 `'home'` 保未編輯逐字基線;§I.6 6 審計欄 016/018 已備)。migration `m20260529_000021` = ALTER +home + casbin **4 行 R_SUPER** write policy(getRoleMenu·getRoleHome GET / updateRoleMenu·updateRoleHome POST、ON CONFLICT DO NOTHING、down 精準 by v1 IN 4 path、不踩 010 menu 9 / 017 role 4 / 019 read 3 / 020 write 4);up→down→up throwaway DB 可逆驗。**010 menu policy 9 行為 runtime 增刪起點**(非 migration 改)。
     - **facade**:`sys_menu` 加 `route_names_for_ids`/`ids_for_route_names`(active-only id↔route_name 對映、empty fast-path、SQL-build 單測)/ `sys_role` 加 `update_role_home`(§I.6 成對 col_expr `Home`+`UpdatedAt current_timestamp`+`UpdatedBy`、audit Update;`audit_json` 補 `home` 欄)/ `sys_user_role` 加 `roles_for_user_ordered`(回 `(id,code)`、**`ORDER BY sys_role.id ASC`**、同 `find_active_enabled` 角色集 → per-role home 取「第一 active 角色」確定序)。
     - **menu-auth 寫路徑**(`auth/menu_auth.rs`、走 enforcer + 011 audit + publish):`set_role_menu`(enforcer write lock 內 before 快照 → `remove_filtered_policy(0,[role_code,"","menu"])`〔**空字串=wildcard、stock adapter skip-empty 只清該 role 的 v2='menu' 列、不碰 endpoint policy**,in-memory enforcer 測試實證〕→ `add_policies`〔HARD REPLACE〕→ 釋鎖 → 011 AuditEvent〔casbin_rule、before/after route_name 集 snake_case、operator〕→ `publish_policy_invalidate`〔best-effort〕;**stock adapter MgmtApi、不 fork**=守 §11.6 拍板、無 amendment)+ `get_role_menu_route_names`(`get_filtered_policy(0,[role,"","menu"])`)+ 純函式自鎖 guard `menu_set_locks_out_super`(R_SUPER 且新集不含 `manage_menu`→true、**leaf-only**:父 `manage` 無 policy〔010 不 seed、靠 020 種子保護 + FR-011 no-reparent 存活〕故只 pin leaf、單測)。`auth/policy_watcher.rs` redis 訂閱見 §10 Phase 3 #3。
     - **handler 4 端**(`handler/system_manage.rs` 擴、零 `entity::`、鏡像 020):`get_role_menu`(GET→`Res<Vec<i64>>`)/ `update_role_menu`(POST、**FR-003 對映數<distinct menu_ids→2222「菜单不存在或已删除」**、自鎖 guard→2222、`set_role_menu`)/ `get_role_home`(GET→`Res<String>`、None→'home')/ `update_role_home`(POST、`Ok(false)`→2222);**roleId 彈性 `de_role_id`**(number\|string→i64、沿 020 de_parent_id);operator 由 015 ctx(None→5000);**policy v0 用 role code 非 id**(roleId→`find_active_by_id.code`);業務錯誤一律 2222、授權 5003/3333 由 enforce_mw;4 route 掛 enforce_mw。**getUserRoutes home**(`handler/route.rs`):由寫死 `"home"` 改 `roles_for_user_ordered` 第一 active 角色 → `find_active_by_id.home`(None/查無/Err→'home' 非致命);**menu 過濾邏輯不動**(roles 取序換 ordered 變體、union 序無關 → 輸出逐字不變=回歸鐵律)。
     - **base-web**(MODAL-WIRING ★ + BASE-WEB-WRAPPER):`rev2-system-manage.ts` +4 fetch fn(`fetchGetRoleMenu` `request<number[]>` / `fetchUpdateRoleMenu` `request<null>` / `fetchGetRoleHome` `request<string>` / `fetchUpdateRoleHome` `request<null>`)+ `menu-auth-modal.vue` 接 getChecks/handleSubmit/getHome/updateHome 4 placeholder(只改 `// request`、`!error` 才成功);typecheck 乾淨。**home select 選項來自 getAllPages〔page key〕、與 route-name 語意落差登記 follow-up**(R6、現種子 'home' 同為合法 route name 故可運作)。
     - **+1 direct dep `tokio-stream`**(消費 redis pubsub Stream、已在 Cargo.lock transitive `0.1.18`、實作期親決;**偏離原規劃「無新 dep」、記 plan Complexity Tracking + §10 Phase 3 #3**)。
     - **acceptance(全綠)**:**★ 即時反映**(指派 manage_role 給 R_ADMIN→Admin getUserRoutes 立即含、無重啟;移除→立即不含)+ getRoleMenu 預載 id[] + **redis reload**(log「invalidate received, enforcer policy reloaded」)+ **自鎖 guard**(Super 移 manage_menu→2222、policy 不變)+ **正向實證**(Super 含 manage_menu→getUserRoutes 仍渲染 `manage > manage_menu`,tree-prune 父隨子存活)+ Super-only(Admin 5003·none 3333)+ psql casbin_rule v0=role·v2='menu' 真值 + audit〔operator+前後集〕+ **完成後還原 R_ADMIN 010 原始可見性**;US2 home set→Admin getUserRoutes.home 反映 + §I.6 成對 + getRoleHome 真值 + **多角色取第一 active(id ASC)**〔暫加雙角色驗取較小 id home、還原〕+ 未設→'home';**三角色 getUserRoutes 逐字 == 014/019 基線**(回歸鐵律、mutate+restore 後再驗 IDENTICAL)+ getConstantRoutes 不變 + 019 三讀端/020 寫端/013 enforce 階梯不破 + migration 021 up→down→up 可逆 + **prod image build 綠**(195MB runtime、含 tokio-stream + 021 migration、無 COPY 缺口)+ **front-nginx :21080 `/api` proxy 4 端點驗** + 守恆(server 189 單測 + entity_access_lint 17 + handler/route 零 `entity::` + `Migrator::up` 0)。subagent-driven-development 16 task〔T002-T016〕逐單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality)+ opus final holistic = READY TO MERGE(FR-001..010 + SC-001..007 全 trace)。**CDP browser click-through defer**(curl 雙路徑〔:21081 直連 + :21080 /api proxy〕已證 4 端點 e2e、base-web wiring typecheck-verified + 鏡像 getPages/getTree pattern;沿 016-020 慣例 + C-V §7、登記 follow-up)。Constitution v1.2.2 §IV 8/8 PASS(#8 N/A 不建表、不 fork、無 amendment;runtime policy 編輯 + redis 啟用 + per-role home + roles 加序 + tokio-stream dep 記 plan Complexity Tracking)。**設計細節見 [`specs/021-manage-menu-auth/`](../specs/021-manage-menu-auth/)**;follow-up CHECKLIST §2.25;merge 後補 MILESTONES row(用 merge SHA)。
   - **★ ButtonAuth — 角色×按鈕權限 runtime 編輯 + per-menu 按鈕來源 + pilot 用戶頁生效 + toggle-auth 救活（022-manage-button-auth,2026-06-03 merge `e103de0` 回 rev2-admin-root〔--no-ff、保留 022 branch〕+ 已推 origin;rust-api worktree `bbdadcb..22aa0b5` push fork〔T002-T014〕+ base-web `cbbf1ea..bd210d2` push fork〔T006/T007/T009/T010〕;rust-api + base-web 兩倉）** — 鏡像 021 MenuAuth,把僅存的程式內硬編按鈕權限（`auth/buttons.rs` role→button 矩陣)推進到**維運期可編輯**,並補上「指派了按鈕卻無消費者」缺口（grounding 揭露業務頁零 `hasAuth`)。K1-K4/C1-C3 親決（brainstorm `fafa3af`)。
     - **schema:不建表/不加欄**;單一 migration `m20260529_000022_seed_button_auth` 只 seed:(a) sys_menu +2 row `function`(menu_type=1 父)+`function_toggle-auth`(menu_type=2 子、buttons jsonb B_CODE1/2/3、route_path/component/i18n_key/icon/order **逐字對齊 base-web elegant route** 否則 SPA resolve 不到)、(b) UPDATE `manage_user.buttons`=user:add/edit/delete、(c) casbin **button policy 10 列**〔v2='button';R_SUPER 6〔B_CODE1/2/3+user:add/edit/delete〕/R_ADMIN 3〔B_CODE2/3+user:edit〕/R_USER_COMMON 1〔B_CODE3〕;**tasks.md 誤記「9 列」,實為 10——以 per-role grant + contracts §3 baseline 為準〕、(d) casbin menu policy 6 列〔function+toggle-auth × 三角色,v2='menu'〕、**(e) casbin endpoint policy 3 列**〔R_SUPER:getAllButtons GET / getRoleButton GET / updateRoleButton POST;**FINDING A——tasks.md/data-model §3 字面漏列,但 Super-only enforce_mw 逐 endpoint 比對 `(role,path,method)`,無此 3 列連 Super 都被擋 5003;鏡像 021 endpoint policy seed 補上、implementer + spec reviewer 確認〕。**down 精準可逆**:button by v2='button'〔022 唯一引入者〕/ menu **by `v2='menu' AND v1 IN ('function','function_toggle-auth')`**〔★不可用裸 v2='menu',否則誤刪 010 的 9 列〕/ endpoint by v1 IN 3 path / DELETE 2 sys_menu row / manage_user.buttons=NULL;up→down→up throwaway DB 親驗、010 menu 9 列存活。
     - **button_auth.rs（鏡像 `auth/menu_auth.rs`、無自鎖 guard**——button 非 nav access,移除按鈕只隱業務鈕、不鎖頁面可達性**)**:`get_role_button_codes`〔`get_filtered_policy(0,[role,"","button"])`、**BTreeSet 字典序**〕/ `replace_role_button_policies`〔remove_filtered + add_policies HARD REPLACE、空集 Ok(false)〕/ `set_role_button`〔write-lock 最小化 + 011 audit〔casbin_rule、before/after button codes、operator〕+ `publish_policy_invalidate` best-effort,**共用 021 redis pub-sub watcher、零新增**〕/ **`buttons_for_roles_via_casbin`**〔union over roles、BTreeSet dedup+字典序,供 getUserInfo〕。7 in-memory-enforcer 單測〔HARD REPLACE 對 v2='menu'/endpoint 正交、空集、union dedup 字典序、B_CODE 子序保留、B_*<user:*〕。
     - **getUserInfo.buttons 改源 + buttons.rs 退場**:`handler/auth.rs` getUserInfo 由 `buttons::buttons_for_roles` 改 `button_auth::buttons_for_roles_via_casbin`〔enforcer read lock〕、`UserInfo` struct 不變〔仍 `Vec<String>`〕;`auth/buttons.rs`〔硬編矩陣 + 7 單測〕**整檔退場**〔T004 後零 caller、矩陣回歸由 button_auth 單測 + live 基線覆蓋〕。
     - **handler 3 端**（`handler/system_manage.rs` 擴、零 `entity::`、鏡像 021):`get_role_button`(GET→`Res<Vec<String>>` 字典序)/ `update_role_button`(POST、**F1 非法 code→2222**〔valid set 由私有 `aggregate_active_buttons`〔`sys_menu::list_active_all` flatten buttons JSON〕**facade-direct、不呼叫 getAllButtons handler → US1 不依賴 US2**〕、`set_role_button` HARD REPLACE)/ `get_all_buttons`(Super-only、`aggregate_active_buttons`→`Vec<ButtonItem{code,desc}>` **dedup-by-code + 字典序**〔BTreeMap〕);roleId 彈性 `de_role_id`(沿 021)、operator 由 015 ctx(None→5000)、業務錯誤 2222、授權 5003/3333 由 enforce_mw;3 route 掛 enforce_mw。`update_role_button` 與 `get_all_buttons` **共用 `aggregate_active_buttons`**〔消 dual-registry drift、F1 仍 facade-direct〕。
     - **base-web（MODAL-WIRING ★ v1.3.0 + BASE-WEB-WRAPPER)**:`rev2-system-manage.ts` +3 fetch fn〔`fetchGetRoleButton` `request<string[]>` / `fetchUpdateRoleButton` `request<null>` / `fetchGetAllButtons` `request<MenuButton[]>`〕+ **`button-auth-modal.vue` 接 3 placeholder**〔getAllButtons/getChecks/handleSubmit、**`ButtonConfig→{code,label}`、`checks:string[]`、NTree `key-field="code"`〔C1 key-on-code〕、`init()`→`watch(visible)`〔修 placeholder setup-once bug、鏡像 menu-auth-modal、每次開以當前 roleId 重載〕、`!error` 才 toast〕 + **pilot 用戶頁 gating**〔`user/index.vue` row 编辑 `hasAuth('user:edit')`/删除 `hasAuth('user:delete')`〔JSX 條件渲染〕+ toolbar `:show-add="hasAuth('user:add')"`;`components/advanced/table-header-operation.vue` 加附加 `showAdd?:boolean` prop〔`v-if="showAdd !== false"` **default-true、role/menu 頁不傳→行為不變**,共用元件 backward-compat〕〕;typecheck 乾淨。
     - **新基線（回歸鐵律 + 唯一 intended 例外)**:getUserInfo.buttons 三角色逐字 = Super`[B_CODE1,B_CODE2,B_CODE3,user:add,user:delete,user:edit]`/Admin`[B_CODE2,B_CODE3,user:edit]`/User`[B_CODE3]`〔B_CODE 子序逐字保留、user:* 新增,字典序 B<u〕;**getUserRoutes 逐字基線 re-base**〔三角色各 +function>function_toggle-auth 節點,**FR-010 唯一 intended 例外**,救活 toggle-auth 的已知代價;per-role home 不受影響、getConstantRoutes 5 條不變〕。
     - **acceptance（全綠)**:curl round-trip〔getRoleButton 預載字典序 + updateRoleButton HARD REPLACE **即時反映**〔Admin 加 user:add→getUserInfo 立即含、無重啟〕+ 非法 code 2222 + 空集 Ok + roleId number|string + Super-only〔Admin 5003·none 3333〕+ getAllButtons 6 碼字典序〕+ getUserInfo/getUserRoutes 三角色逐字新基線 + **CDP 4/4**〔isolated browser context、不擾 user tab:toggle-auth 三角色各見 **3/2/1** B_CODE 鈕 + 用戶頁 gating〔Admin 見編輯·不見刪除/新增·Super 全〕+ button-auth-modal 顯 6 筆 registry〔B_CODE3 對 R_USER_COMMON 預勾、live Casbin 反映〕+ **順補 021 menu-auth-modal click-through**〔同 /manage/role harness、tree 9 節點、清 021 CDP defer〕〕+ migration up→down→up 可逆〔010 不踩〕+ **prod image build 非強制**〔無新 crate,只加 module 到既有 server crate〕+ 守恆〔server **189** 單測 + entity_access_lint 17 + handler/auth/button_auth 零 `entity::` + `Migrator::up` 0〕+ 回歸 013/019/020/021 不破。subagent-driven-development T002-T014 逐單元 fresh implementer + 兩階段 review〔spec compliance 對 spec.md + code quality〕+ CDP 視覺驗收。**無新 crate/dep**。**順清**:3 處 stale `#[allow(dead_code)]`〔normalize_page/roles_for_user/find_active 已 wire〕移除。Constitution **v1.3.0** §IV 8/8 PASS〔2 amendment `7a3ebd1`+MILESTONES `27410bf`:§III.2 MODAL-WIRING ★ 邊界 +button gating〔§11.19〕+ §I.2 function/toggle-auth demo→真實 Casbin 選單例外〔§11.20〕〕。**設計細節見 [`specs/022-manage-button-auth/`](../specs/022-manage-button-auth/)**;MILESTONES row `e103de0`(見 [INTEGRATION-MILESTONES.md](INTEGRATION-MILESTONES.md))。**cosmetic 觀察**:toggle-auth 頁 B_CODE3 鈕 caption「管理员和用户可见」(頁面 i18n) vs registry desc「管理员或普通用户可见」(data-model §1.2 指定),兩者皆指 B_CODE3、gating 走 code 不受影響、非缺陷(follow-up §2.26)。
   - **★ ButtonAuth Rollout — 022「按鈕權限可編輯迴路」rollout 到角色頁/選單頁 + 三頁 reactive 修正（024-button-auth-rollout,2026-06-04 本地 READY TO MERGE〔待 push/merge user 同意〕;rust-api worktree `f7cd042`〔1 commit〕+ base-web `03e20e4..be3e54a`〔3 commit〕,皆 local 未 push;rust-api + base-web 兩倉 + 外層 `tests/024-button-auth-rollout/` CDP harness)** — 把 022 僅覆蓋用戶頁的「按鈕權限可編輯迴路」(modal 勾選→`set_role_button` HARD REPLACE 同步 casbin→頁面 `hasAuth` gating) **rollout 到角色管理頁/選單管理頁**:為 `manage_role`/`manage_menu` seed `role:*`/`menu:*` 按鈕碼進 registry→自動進「按鈕權限」modal 可指派→沿 022 迴路即時生效→role/menu 頁寫按鈕依 `hasAuth(code)` 顯/隱。K1-K4 親決(brainstorm `9e59f09`)。**輕量、decoupled 刻意**:唯一 rust = 1 seed migration(後端機制/modal/wire 零改)。
     - **schema:不建表/不加欄**;單一 migration `m20260529_000024_seed_role_menu_button_auth`(鏡像 022 section (2)+(3)結構):(a) **registry** UPDATE `manage_role`.buttons=`[role:add 新增角色, role:edit 编辑角色, role:delete 删除角色]`、`manage_menu`.buttons=`[menu:add 新增菜单, menu:edit 编辑菜单, menu:delete 删除菜单]`(命名對齊 022 `user:*`、desc 簡中)、(b) casbin **button policy 6 列只 R_SUPER**(`role:add/edit/delete + menu:add/edit/delete × R_SUPER`、`ON CONFLICT DO NOTHING`、K4:其餘角色預設無、由運維經 modal 指派)。**down 精準可逆**:button **by `v2='button' AND v1 IN (6 codes)`**〔★不可裸 v2='button',否則誤刪 022 的 10 列;024 是唯一引入 role:*/menu:* button 碼者〕+ `UPDATE sys_menu SET buttons=NULL WHERE route_name IN ('manage_role','manage_menu')`〔建表 018 即 NULL,grep 實證〕;up→down→up throwaway DB 親驗 **16→10→16**、022 button 10 列 + menu policy 15 列存活、NULL 還原。
     - **後端零 rust code 改動**(除 seed migration):`role:*`/`menu:*` 碼**只要 seed 進 `sys_menu.buttons`**,即被 `get_all_buttons`→`aggregate_active_buttons`→`sys_menu::list_active_all`(聚合**全** active sys_menu.buttons、dedup-by-code BTreeMap 字典序)自動納入 registry → modal 列得出可勾;`updateRoleButton`→`set_role_button` HARD REPLACE **對任意 code 通用**(非寫死 user:*)→ 勾選即同步 casbin;`getUserInfo.buttons`(`buttons_for_roles_via_casbin` union over roles)自動含 R_SUPER 新碼。`getAllButtons` 套後回 **12 碼**(6 既有 + 6 新)。R1/R2 grounding 實證機制本就 code-agnostic。
     - **base-web 三頁 gating + reactive-columns 修正**(MODAL-WIRING ★ v1.3.0 (b) button gating、無新 fetch fn / 不改 modal / 不改 wrapper):`role/index.vue`(toolbar `:show-add="hasAuth('role:add')"` + operate column row 編輯 `hasAuth('role:edit')`/刪除 `hasAuth('role:delete')`,鏡像 022 user/index.vue)、`menu/index.vue`(toolbar `hasAuth('menu:add')` + 加子選單 **`row.menuType === '1' && hasAuth('menu:add')`**〔★保留既有「僅目錄可加子」資料條件、疊加 hasAuth 不取代;加子=add 操作變體、沿用 `menu:add` 不另設碼〕+ 編輯/刪除)、`user/index.vue`(§2.26 reactive retrofit、gating code/邏輯不變、結果與 022 逐項一致)。**reactive-columns 修法**(§2.26 閉合):三頁 row 鈕 gating 在 `columns` JSX `render` 閉包內呼叫 `hasAuth`,而 `@sa/hooks` `useTable` 的 `$columns=computed(()=>getColumns(columns(),columnChecks.value))` 不追蹤 `userInfo.buttons`(factory 不在呼叫時讀 buttons)→ 頁內授權變動不重繪;修法 = 鏡像既有 `watch(()=>appStore.locale,()=>reloadColumns())` 加 **`watch(()=>authStore.userInfo.buttons,()=>reloadColumns())`**(shallow watch 正確:auth store `getUserInfo` 走 `Object.assign(userInfo,info)` 替換 buttons 為新陣列;`reloadColumns` 重設 columnChecks→觸發 $columns 重算→新 render 閉包→naive-ui 重繪→hasAuth 重評,且保留 user 的 column toggle)。三頁 watch 行 + §2.26 註解 byte-consistent。toolbar `:show-add` 在 template 本就 reactive。
     - **decoupled 已知債(FR-008、K1、刻意)**:按鈕碼授權(casbin v2='button')與 023 端點權限(v2=HTTP method)為**兩套獨立可指派維度**,本波**不自動對齊**。對抗式 + CDP 實證:assign `role:edit` 按鈕給 R_ADMIN → Admin 可見「編輯」鈕、但 `updateRole` 端點仍 Super-only → 點擊 enforce_mw 回 5003。visible=clickable 自動對齊留「完整版」未來 feature(brainstorm K2)。**另一跨維度發現(as-built)**:dev seed 預設**只有 R_SUPER 有 `manage_role`/`manage_menu` 選單可見性**(021 menu policy `v2='menu'`),R_ADMIN/R_USER_COMMON 無 → 非-Super 導向該頁得 not-found(只「返回首页」鈕)。故 role/menu 頁的 024 button gating **只在能檢視該頁的角色身上可觀察**(預設僅 Super);literal「指派按鈕給某角色→該角色檢視該頁見鈕」(spec US1)須**先**經 021 `updateRoleMenu` 授該角色選單可見性、**再**經 024 授按鈕碼(三維度 button≠menu≠endpoint 刻意正交)。
     - **acceptance(全綠、holistic C-V workflow + CDP)**:**確定性 7 維度**(getAllButtons 12 碼含 role:*/menu:* / getRoleButton〔Super 含新碼·Admin 初始 0〕+ getUserInfo 三角色〔Super 含 role:*/menu:*·Admin 僅 022 user:edit·User 僅 B_CODE3〕/ psql registry 3+3 碼 + 16 button 列 + **022 矩陣 10 列不變 FR-007** / migration 可逆 16→10→16 menu 15 不動 / 守恆 server **195** 單測 + entity_access_lint 17 + `Migrator::up` 0 + base-web typecheck 0 / 三頁 reactive watch byte-consistent + 各頁 gating 碼 + menu 疊加條件 + user 022 gating 不破)+ **D3 updateRoleButton round-trip 即時**(assign role:edit→Admin getRoleButton+getUserInfo 立即反映、redis pub-sub reload 無重啟 → 乾淨還原)+ **3 對抗式 skeptic 全 refuted**(可逆性實證 57→63→57·022 零回歸〔純 additive、gating byte-identical〕·decoupled 保留〔實證 button 可見但端點 5003〕)+ **CDP 5/5 isolated-context**(`tests/024-button-auth-rollout/`、不擾 user tab:① Super /manage/role 三寫鈕全顯 ② Super /manage/menu 全顯〔含加子選單〕 ③ button-auth-modal registry 含 6 新碼可勾〔NTree virtual-scroll 滾動聯集〕 ④ **逐碼隱藏**:撤 Super `role:delete`→「删除」消失·编辑/新增仍顯·還原 ⑤ **literal US1 跨維度**:授 Admin manage_role 選單〔021〕+role:edit 按鈕〔024〕→Admin 檢視角色頁見「编辑」〔不見删除/新增〕·還原 menu+button)+ dev DB 乾淨還原。**migration 直寫 casbin_rule 繞過 redis-invalidate → getRoleButton/getUserInfo 讀 in-memory enforcer 須 restart rust-api 才反映**(getAllButtons 讀 DB 直查不用;updateRoleButton 路徑自帶 invalidate 無需重啟)。**無新單元測試**(gating=既有 hasAuth、後端=seed migration 無邏輯、迴路=022 已測〔button_auth.rs #[cfg(test)]〕)→ 由 C-V 覆蓋、plan/tasks 明示理由。**無新 crate/dep/fork/表/endpoint**;prod image build 非強制(無新 crate)。Constitution **v1.4.0** §IV 8/8 PASS(MODAL-WIRING ★ v1.3.0 (b) button gating 既有邊界內、**無 amendment、無 finding**)。subagent-driven-development T002-T005 逐單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality)+ holistic acceptance workflow + CDP 視覺驗收。**設計細節見 [`specs/024-button-auth-rollout/`](../specs/024-button-auth-rollout/)**;merge 後補 MILESTONES row(用 merge SHA)。
   - **★ 選單 restore + re-parent — 補完 020 FR-011 OUT scope(025-menu-restore-reparent,2026-06-04 已 merge `6225bd8` 回 rev2-admin-root〔--no-ff、保留 025 branch〕+ 已推 origin;rust-api worktree `f7cd042..95771ff`〔T002/T003/T004/T006 共 4 commit、push fork〕+ base-web `be3e54a..4ad502b`〔T005/T007 共 2 commit、push fork;4ad502b = T007 含 components.d.ts NTreeSelect 自動註冊〕;rust-api + base-web 兩倉 + 外層 `tests/025-menu-restore-reparent/` CDP harness)** — 補上 020 刻意劃出的兩種狀態轉移:**(US1) restore** 軟刪選單(回收桶 = 選單頁「顯示已刪除」toggle + 復原鈕)+ **(US2) re-parent** 自訂選單上層父(編輯 modal 的 parentId NTreeSelect)。親決 brainstorm `4403425`(S1/R1-R3)。**無新表/欄/crate/dep/fork**(用 019 sys_menu + 011 audit + 023 D1 lint pattern)。
     - **restore(US1)後端**:facade(`model/facade/sys_menu.rs`)鏡像 `soft_delete`**反向**:`find_deleted()`(`DeletedAt.is_not_null()`)+ `list_deleted_paginated`(鏡像 list_active_paginated)+ `find_deleted_by_id`(載已刪、**不可用 find_active_by_id**)+ `restore_query`(§I.6 **成對** set `deleted_at`/`deleted_by` → NULL)+ `restore(db,id,operator)`(`mutate_in_txn`:find_deleted→None→Ok(false)/Some→snapshot→restore_query→`AuditEvent{operation:AuditOperation::Restore}`;**`Restore` variant 011 已存在 dormant、本波首消費、audit.rs 零改**)。handler:`get_deleted_menus`(**逐字 copy `get_menu_list` 換 list_deleted_paginated**、reuse MenuItem/PageRes/parent_id_to_wire)+ `restore_menu`(reuse `DeleteReq`、Super-only、**guards 固定序** ①`find_deleted_by_id`==None→2222「菜单不存在或未删除」 ②route_name 被 active 列佔用〔reuse `ids_for_route_names`、非空→佔用〕→2222「路由名已被占用」 ③`parent_id==Some(p)`且 `find_active_by_id(p)`==None→2222「上层菜单已删除,请先复原上层」〔頂層 None 跳過〕)。
     - **re-parent(US2)後端**:`MenuUpdateReq` **+`parent_id`**(`#[serde(default, deserialize_with="de_parent_id")]`,鏡像 MenuCreateReq;**brainstorm「de_parent_id 已 absorb」更正** —— de_parent_id 原只接 MenuCreateReq,故 re-parent 須加此欄)。`UpdateMenuData` **+`parent_id`** + `update_menu_query` **+`col_expr(ParentId)`**(route_name/menu_type 仍 D2 immutable 不入 SET);**immutability 單測重寫**(parent_id 由「不得在 SQL」翻為「須在 SQL」、route_name/menu_type negative 留)。新純函式 **`would_create_cycle(id, new_parent, &[(id,parent_id)])`**(走 new_parent 父鏈撞 id⇒true、bounded loop 防腐;**TDD red→green** 4 case)。`update_menu` 在「載入現列」arm 加 re-parent guards(`changed = req.parent_id != model.parent_id`,僅變更時查):**(a)** `is_seed_menu`→2222「不可移动系统内置菜单」(R2 種子父固定)**(b)** `would_create_cycle`→2222「不可移动到自己的子层」**(c)** 新父非 active 目錄(`find_active_by_id(p)`==None 或 `menu_type!=Some(1)`)→2222「上层菜单无效」(頂層 None 合法)。**re-parent 騎既有 updateMenu endpoint、無新 endpoint**。
     - **endpoint 3-way + base-web**:+2 Super-only endpoint(`getDeletedMenus` GET / `restoreMenu` POST)→ **D1 lint 4-site 連動 count 28→30**(main.rs route↔ENDPOINT_REGISTRY↔endpoint_coverage_lint↔migration seed,path byte-identical 三處)+ migration `m20260529_000025`(2 R_SUPER endpoint policy、**down by-v1** 精準、ON CONFLICT 冪等、up→down→up 可逆)。base-web(**MODAL-WIRING ★ (d) v1.5.0 邊界內**):(d-2)`menu/index.vue` 「显示已删除」NSwitch〔ON 切資料源 `fetchGetDeletedMenus` + operate 欄 render 復原鈕、`reloadColumns`+`getData` 同步〕;(d-1)`menu-operate-modal.vue` edit 模式 parentId `NTreeSelect`〔menu tree 選項、**種子選單 disabled**〔front SEED_MENU_ROUTE_NAMES 鏡像後端 is_seed_menu〕、clear→0 頂層〕;`rev2-system-manage.ts` +`fetchGetDeletedMenus`/`fetchRestoreMenu`(BASE-WEB-WRAPPER)+ `page.manage.menu.*` i18n。
     - **D1 統一源 payoff(即時反映)+ 零 casbin(R6)**:restore/re-parent **零 casbin/enforcer 觸碰**(純 sys_menu row + audit)→ getUserRoutes 讀 `list_active_all`→`assemble_menu_tree` DB-direct、**即時反映無重啟**(CDP/curl 親驗 rust-api 全程不重啟);restore 因 **route_name 不變(D2)→ 舊 menu-visibility policy 自動套回**(intended payoff、無需 re-seed)。021 自鎖 guard(`menu_set_locks_out_super`、route_name-keyed)+ 可見性 policy key 完全不觸(re-parent 只改 parent_id)→ **021 非回歸 CONFIRMED**。
     - **MODAL-WIRING ★ (d) v1.5.0 amendment(`2b05a5e`、user 親決 + ratified)**:base-web 新 form 控件(parentId NTreeSelect)+ 回收桶 toggle/restore 鈕 literally 在 (a)(b)(c) 之外 → §III.2 (d) 子句授權 `views/manage/menu/**` 選單復原/re-parent 維運 UI(R1/R2/R3 約束嵌入);MINOR(§V.3 軌道授權邊界擴展、非新軌道、§11.9 計數不變)。理由見 §11.23。
     - **已知債(follow-up)**:(1)**孤兒 casbin 列** —— 軟刪選單留 `[role,route_name,'menu']` 孤兒 policy(無害:讀路徑略過不在 active 樹的孤兒);但新建同 route_name 選單會**繼承舊可見性 grant**,restore/create 唯一性 guard 只擋 **active** 撞、不擋 deleted 撞;(2)**restore route_name TOCTOU** —— handler pre-check active 唯一性 + DB partial-unique 為最終防線,race 撞→DbErr→5000(同 create_menu、可接受);(3)**re-parent 跨頂層邊界 component**(T007 review 抓)—— `getSubmitParams` 依「最終是否頂層或目錄」決定 layout 前綴(`effectiveLayout = parentId===0 || menuType==='1' ? layout : ''`),修掉「頂層葉搬 nested 殘留 `layout.X$` 汙染 component」;**殘留**:nested-directory re-parent 保守不動其 component、nested→top-level 須 user 在浮現的 layout 欄補選;(4)**SEED_MENU_ROUTE_NAMES 前後端 duplication**(UI disable hint、後端 guard 權威)、(5)**getMenuItem inline-map** 與 get_menu_list 重複(第 3 消費者出現再抽 `to_menu_item`)、(6)**contracts §1/§2 deleteMenu curl 用 `-d`(POST)** 但 deleteMenu 是 DELETE → 須 `-X DELETE`(spec-doc as-built 註)。
     - **acceptance(全綠、holistic C-V + CDP)**:contracts §1 restore round-trip(刪→getDeletedMenus 顯→restore→active+**audit RESTORE**+deleted_* 成對 NULL)+ §2 restore guards(孤兒父/route_name 佔用/非 deleted 三 2222)+ §3 re-parent round-trip(parent_id 改、getUserRoutes 即時)+ §4 re-parent guards(種子/cycle/非目錄/缺父 四 2222)+ §5 Super-only(Admin 5003/none 3333)+ envelope PageRes + §6 D1 lint 30 三方 + 2 casbin row + §7 **migration 025 可逆 2→0→2**(throwaway DB、down 恰 −2、其餘不動)+ **守恆**(server **200** 純測〔含 `would_create_cycle`×4 + immutability 重寫 + `restore_query`〕+ entity_access_lint **17** + endpoint_coverage_lint **30** + `Migrator::up` **0** + base-web typecheck **0**)+ §8 **CDP 4/4 isolated-context**(`tests/025-menu-restore-reparent/`、不擾 user tab:① 显示已删除 toggle + 恢复鈕〔restore→toast+DB deleted_at NULL〕 ② parentId NTreeSelect 樹選項 + re-parent〔parent_id 移動〕 ③ 種子 disabled / 自訂 enabled ④ cycle guard toast「不可移动到自己的子层」)+ **回歸 019/020/021**(020 CRUD〔addMenu/updateMenu 未改 parent 純編輯 0000/deleteMenu/種子刪 2222/父刪 guard〕、019 三讀端 + getUserRoutes 逐字、021 自鎖 + 零 casbin)。**純單測 = `would_create_cycle`(TDD)+ immutability 重寫 + `restore_query`**;restore/re-parent guards = handler wiring + DB → C-V 覆蓋(同 020 範式、plan/tasks 明示理由)。Constitution **v1.5.0** §IV 8/8 PASS(MODAL-WIRING ★ (d) amendment `2b05a5e` ratified)。subagent-driven-development T002-T010 逐單元 fresh implementer + 兩階段 review(spec compliance 對 spec.md + code quality)+ final holistic = READY TO MERGE + CDP 視覺驗收。**設計細節見 [`specs/025-menu-restore-reparent/`](../specs/025-menu-restore-reparent/)**;MILESTONES row 已補(merge `6225bd8`)。
2. **wire shape mapping feature** — output DTO + `From<Entity>` impl + pagination wrapper
3. **alova-only endpoint 處理 feature** — 依 §11.2 拍板實作 / stub / 不實作
4. **菜單樹建構 feature** — tree builder(parent_id → nested children)（**✅ 019**:純函式 `assemble_menu_tree(Vec<Model>)→Vec<MenuNode>`,依 order stable sort〔None 末〕+ 孤節點略過,供 getUserRoutes + getMenuTree 共用、可單測)
5. **審計欄 retrofit feature** — 既有業務表補 [constitution §I.6](../.specify/memory/constitution.md) 6 審計欄(尤其 `*_by` 缺口);forward-only 標準對新建表即時生效,本 feature 收攏既有表缺口(需寫入路徑帶入 operator 才填得了)。（**部分落地**:**`sys_user` 6 審計欄 retrofit ✅ 由 017-manage-user-write 完成**〔2026-06-02 merge `617136d`〕 — migration 014 補 `created_at`/`created_by`/`updated_at`/`updated_by`/`deleted_by`〔`deleted_at` 009 已有〕,寫入路徑落實:`created_by` on insert / `updated_at`+`updated_by` **成對** on update / `deleted_at`+`deleted_by` **成對** on soft-delete,**`*_by`=operator `i64` 由 015 request-context ctx 帶入**〔對齊 §I.6「`*_by`=operator user_id 非 user_name」〕。**`sys_role` 6 審計欄 retrofit ✅ 由 018-manage-role-write 完成**〔2026-06-02 已 merge `8844105`+已推 origin,SHA-pin `77c1fd6`〕 — migration 016 補 `role_desc`/`status`/`created_at`/`created_by`/`updated_at`/`updated_by`/`deleted_by`〔`deleted_at` 006 已有;**無 BIGSERIAL retrofit**——006 已 auto_increment〕,寫入路徑落實:`created_by` on insert / `updated_at`+`updated_by` **成對** col_expr DB-side on update / `deleted_at`+`deleted_by` **成對** on soft-delete,`*_by`=operator i64 由 015 ctx。兩張業務主表(sys_user/sys_role)審計欄 retrofit 皆完成。`sys_user_role`（join）+ append-only 三表 + vendored `casbin_rule` 依 §I.6 例外免。標準見 [constitution §I.6](../.specify/memory/constitution.md) + 本檔 §11.14;retrofit 編排見 §10 Phase 4「審計欄 retrofit feature」。）

### Phase 5 — 補位 + 抽離項

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
>
> **🔄 2026-05-29 012 brainstorm 重定位(不改本拍板的 crate 處置、只改時機與範圍)**:
> - **`axum-casbin` 重寫 → 移至 [Phase 3](#phase-3--認證--動態選單)#5**:中介層需真實受保護路由 + enforce 點 + observability 目標(Phase 6)才驗得了/整合得了,Phase 2 做會無消費者、無法驗。**012(Phase 2 最後 feature)只做 sea-orm-adapter + xdb 兩個「拷貝」crate**(本拍板的拷貝處置不變)。
> - **`sea-orm-adapter` 的「拷貝」前提可能被後續鬆動**:Phase 3 新增「受管 RBAC policy 層 feature」([Phase 3](#phase-3--認證--動態選單)#6)要為 casbin policy 加 soft-delete(可復原)+ 不可刪 protected policy + 變更走 011 audit + 統一 CRUD。soft-delete 需 **fork adapter 的 `load_policy`/`remove_*`**(stock adapter 物理 DELETE + load 全表、會繞過 soft-delete)→ adapter 從「拷貝」變「拷貝+客製」≈ 半重寫。**該 feature specced 時須評估 §11.6 Amendment**(本拍板現狀仍為「拷貝」、012 不觸此客製)。
> - **rev1 缺陷不繼承**:stock casbin adapter 的 policy 增刪不經 app 層 audit/soft-delete(rev1 很可能未 audit policy 變更);rev2 經此 Phase 3 feature 修正(§1.5 精神)。
>
> **✅ 2026-05-29 012-sub-crate-setup 實作完成(本拍板的「拷貝」處置落地)**:`sea-orm-adapter` + `xdb` 已拷貝自 rev1 `@ 0b64a57`(§11.6 / constitution §I.5 授權例外、首個拷貝 feature、標出處)進 rust-api workspace;casbin **bump 2.10→2.20.0**(user 拍板、§6 surface、stable)— **編譯閘門一次過、adapter `Adapter` trait 零 drift**(最高風險點清除)。casbin_rule 經 `migration 005`(委派 `sea_orm_adapter::up/down` 單一 schema 來源、`if_not_exists` 使 adapter `new()` 自動建表為無害 no-op、FR-005 調和)、經 010 自動套。活體 smoke 親驗:adapter 對 live postgres policy round-trip(寫入→重載仍在 + casbin_rule 有列)綠、xdb 解析 `1.2.4.8`→`中国|0|北京|北京市|0`。**附帶修一個 rev1 潛伏 bug**:`action.rs` `remove_filtered_policy` 索引重複偏移(field_index≥1 錯位、與 casbin 2.20 無關)— 單行修正、user 拍板現修、plan Deviation D-1 記錄。**未接 enforce / 未加 axum-casbin / casbin_rule 無 soft-delete**(皆 Phase 3,見下 #5/#6)。守 007 FR-009 + 009 lint。

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
> - `Role.id` 型:**string**(對齊 mock `getAllRoles`);base-web TS 宣告 `number` 與之不符但 **runtime 安全、決定不修**(`CommonRecord` 為 `type` alias、rev2-extra.d.ts override 不可行;id 型凍結見 [constitution §I.3](../.specify/memory/constitution.md))
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

### §11.14 業務表審計欄標準(SCHEMA-AUDIT-COLUMNS)

> **✅ 凍結:[constitution §I.6](../.specify/memory/constitution.md)(amend v1.1.0,2026-06-01)** — 業務主表建表 MUST 含 6 審計欄(`created_at`/`created_by`/`updated_at`/`updated_by`/`deleted_at`/`deleted_by`);`*_by`=operator user_id `Option<i64>`(非 user_name);append-only 審計表(如 `sys_operation_log`)+ join 表(如 `sys_user_role`)為例外;**forward-only**。完整規範以 constitution §I.6 為準,本節不重述。
>
> **理由**:統一「誰建/改/刪 + 何時」可問責性、對齊 §6.4 audit 精神;新建表即合規、免日後逐表 retrofit 債。
> **影響**:§IV Compliance Check 第 8 條;§10 Phase 4「審計欄 retrofit feature」;Phase 4+ 所有 create migration。
>
> **🔄 2026-06-01 amend 提案紀錄(依新 §V.2 step1:提案落 DESIGN §11)**:本條即 v1.0.0→v1.1.0 amendment 的設計依據。**bootstrap 過渡**:本批同時把 §V.2 step1 提案位置由 CHECKLIST 改為 DESIGN §11,故此提案紀錄與 constitution 凍結同輪 backfill(commit `e1fa3db` 為 interim 提案 of record);此後 amendment 先落本節再凍 constitution。
>
> **🔄 2026-06-02 as-built(018 D5,審計時間源 convention)**:018 brainstorm D5 親決 **審計時間源 = DB `current_timestamp()`(非 trigger)** —— `created_at` 用 DB default、`updated_at`/`deleted_at` 經 `col_expr(Expr::current_timestamp())` + UPDATE 後重查讀回 Model(因 `update_many` 無 RETURNING),一律 **DB-side**,不用 app-side `SystemTime::now()`、不用 DB trigger(保 §I.6 explicit 成對可見性 + 可審)。018 順帶校正 017 `update_user`(原 app-side `now()` → col_expr+重查)。constitution §I.6 是否補述「時間源=DB now()」留後續評估、本 feature 不開 amendment(brainstorm 已預告)。

### §11.15 MODAL-WIRING ★ 邊界擴展(`views/manage/**`,含 list-page delete)

> **改哪節**:constitution §III.2 MODAL-WIRING「邊界」(`base-web/src/views/manage/*/modules/*-operate-{modal,drawer}.vue` → **`base-web/src/views/manage/**`**,含 `index.vue` 的 `handleDelete`/`handleBatchDelete`);「紀律」影響行保留 manage-crud-alignment 6-10 檔 baseline、擴註「§10 Phase 4 中所涉及 CRUD 功能、擴大至 CRUD 所需改動」(上限由「只改 `// request` 一行」紀律約束、非固定數字);version 1.1.0 → 1.2.0。
>
> **為何**:Phase 4 CRUD 的 delete/batchDelete `// request` placeholder 落在 `views/manage/*/index.vue`(`handleDelete`/`handleBatchDelete`),不在原邊界 `modules/*-operate-{modal,drawer}.vue`;同屬「`// request` 一行接 wrapper call」紀律、僅 file 位置不同。**017-manage-user-write 為觸發 feature**(user CRUD 的 delete)。原 §11.3 拍板(啟用 MODAL-WIRING)未變,僅軌道 file 邊界放寬。
>
> **改後影響**:Phase 4 各 CRUD feature 可在授權內接 `index.vue` delete;紀律不變(只改 `// request` 一行、每處 spec 記 file:line + upstream 衝突風險);§IV Compliance Check #2/#7 連動(觸 ★ 軌道、須在授權邊界內)。§II §11.3 拍板摘要不變(精確邊界於 §III)。§V.3「軌道授權邊界擴展」= **MINOR**(v1.1.0 → v1.2.0)。
>
> **🔄 2026-06-01 amend(v1.1.0→v1.2.0,依 §V.2 step1 提案落 DESIGN §11)**:本節為提案 of record;constitution §III.2 + version 同輪凍結(user 親改),CHECKLIST §6 軌道快查 + MILESTONES §1 同步 backfill。

### §11.16 v1.2.1 amend — §I.3 id 型機制句校正(2026-06-02)

> **改哪節**:constitution §I.3 鎖定不變式「`Role.id`/`MenuRoute.id`=string」的機制子句,由「由 BASE-WEB-ADAPT 軌道用 `rev2-extra.d.ts` 補正」改為「與此不符但 runtime 安全、決定不修」。
>
> **為何**:原機制句屬規劃錯誤假設、從未實作 —— `Api.Common.CommonRecord<T>` 是 `type` alias(`base-web/src/typings/api/common.d.ts`,`id: number`),TS declaration merging 只能擴 interface、**不能 override `type` alias 的 member 型**,故 `rev2-extra.d.ts` 補 `id: number→string` 不可行。真修需動 upstream `common.d.ts` + ripple ~6 個 view 簽名(跨 BASE-WEB-ADAPT / MODAL-WIRING 邊界 + upstream rebase 風險);而宣告層不一致 **runtime 早已安全**(016/017 經 front-nginx CDP 證 list/CRUD 正常)→ 取 Option B「決定不修、接受 type-lie」。
>
> **改後影響**:`Role.id`=string 拍板(§11.10)**不變**,僅校正達成機制的描述;BASE-WEB-ADAPT 軌道仍可加新檔。純文字校正/釐清 = **PATCH**(§V.3),version 1.2.0 → 1.2.1。
>
> **觸發**:017 收尾 + role 寫端 brainstorm 時發現 override `type` alias 不可行。

### §11.17 enforce_mw 取角色源 claims→DB-fresh(B 決策,018,跨 013)

> **決策(user 親決,2026-06-02,018-manage-role-write)**:`enforce_mw` 由讀 JWT `claims.roles`(login 簽入的快照)改為**每請求查 DB 有效角色** `roles_for_user(db, claims.user_id)`(= `find_active_enabled`:`deleted_at IS NULL AND status=1`),使停用/軟刪角色於**下次授權檢查即時失效**(舊 token 不重登)。realizes 018 D3+D4「有效角色集一處 filter、處處生效」—— enforce 現亦 governed by effective-set,與 getUserInfo/menu(014)/getAllRoles/replace_roles 同源。
>
> **不需 amendment**:§II/§11 凍結拍板無「enforce 取角色源=claims」項(§11.6 只定 axum-casbin 中介層存在、§11.7 dynamic route mode);013 D4「stateless refresh」屬 feature-level deviation —— 本 feature 將 enforce 部分改 DB-fresh,refresh 仍可 stateless(因 `claims.roles` 對 enforce 已 **vestigial**)。**G1 驗證**:舊 refresh 換新 access、新 access 的 `claims.roles` 仍含已停用角色(refresh 不回 DB),但新 access 打受保護端點 enforce 仍 **403+5003** —— 證 enforce 吃 DB 有效角色、claims.roles 不被 refresh 復活。記入 [018 plan Complexity Tracking](../specs/018-manage-role-write/plan.md)。
>
> **代價**:每受保護請求 +1 次角色查詢(2 個 indexed query:`sys_user_role` by user_id + `sys_role` by id IN);棄 013 D4 stateless-enforce 優化。小型 admin RBAC 廉價可接受;高流量優化(短 TTL per-user 角色 cache)會重引入 staleness、與即時性目標衝突 → 不做。DB 查詢失敗 **fail-closed**(deny 403+5003、log,對齊既有 casbin-error fail-closed,非 5000——enforce 是硬授權閘、不誤導 client re-auth)。**回歸驗 013 enforce allow/deny 不破**(SC-011,acceptance 全綠)。
>
> **觸發**:018 plan research grep 發現 `enforce_mw` 讀 token 快照(非 DB)→ clarify Q1/Q3「停用/刪角色即時不授權」改 B(user 親決)。

### §11.18 v1.2.3 amend — §I.3 業務碼文字校正(5xxx→2222,2026-06-03)

> **改哪節**:constitution §I.3 鎖定不變式 line 41「業務驗證 error code 區段 = `5xxx`」+ §II §11.10 摘要列「business error `5xxx`」,改為「業務驗證 = `2222`(`BizError`);`5xxx` 段為授權(`5003`)/基建(`5000`)、非業務」。
>
> **為何**:原「5xxx=業務驗證」句源自 `MOCK-COVERAGE-AUDIT §4.11` 的**設計建議**(mock 根本不驗業務、建議 rev2 自訂 5xxx 區段),從未成為實作真相 —— 自 008 `envelope.rs` BizCode 矩陣起、016-020 handler 一致用 **`2222`=`BizError`** 表業務驗證(重複/不存在/自鎖/種子保護/非法 id·enum),`5xxx` 實為授權(`5003` 403)/基建(`5000` 500)。此分流早於本檔 D8(line 1110「業務錯誤一律 2222...非 5xxx;2222=BizError、mock §4.11-grounded」)拍板記錄,但 constitution 文字未同步、stale。§I.3 後半「9999/9998/3333 絕不用在業務驗證」續有效(那些是 auth-only)。
>
> **改後影響**:純文字對齊已出貨 `envelope.rs` 13-variant BizCode 矩陣,**零規則變動、零 code 改動**;業務碼用 2222 拍板(早記於 D8)不變,僅校正 §I.3/§11.10 達成描述。文字校正/釐清 = **PATCH**(§V.3),version 1.2.2 → 1.2.3。
>
> **觸發**:021 `/speckit-analyze` 跨檔 consistency(C1)+ workflow 查證(`envelope.rs` 矩陣 + MOCK-AUDIT §4.11 出處 + 對抗驗證 claim 不被 refute)。

### §11.19 v1.3.0 amend — MODAL-WIRING ★ 邊界擴展加 button 可見性 gating(2026-06-03,022)

> **改哪節**:constitution §III.2 MODAL-WIRING ★ 區塊「邊界 / 授權內容 / 紀律」—— 在原「`// request` placeholder 接線」外,**加(b)業務頁操作按鈕的 `hasAuth(<button_code>)` 可見性 gating**(`views/manage/**/index.vue` 操作鈕 `v-if` + 共用元件 `table-header-operation.vue` 附加顯隱 prop)。
>
> **為何**:ButtonAuth(022)本質是「按鈕權限要有消費者」—— grounding workflow 對抗驗證確認 base-web 業務頁(manage/user·role·menu)現況**完全不 gate 按鈕**(唯一消費者是 demo toggle-auth)。022 K2 親決 pilot = 用戶管理頁端到端生效,必須在業務頁加 `hasAuth` gating;此屬 base-web inline 改動,原 MODAL-WIRING 只授權 `// request` placeholder、不涵蓋 → plan Constitution Check §IV.2/IV.7 抓到。**擴展既有 view-inline ★ 軌道(非新增軌道)**涵蓋此用途、§11.9「5 軌道/2★」計數不變。
>
> **改後影響**:022 pilot 得在 `manage/user/index.vue` + `table-header-operation.vue` 加按鈕 gating(每處 spec 紀錄 file:line + upstream 風險);共用元件用附加 prop + 安全預設不變既有呼叫端。軌道授權邊界擴展 = **MINOR**(§V.3),version 1.2.3 → 1.3.0。
>
> **觸發**:022 `/speckit-plan` Constitution Check(FINDING 1)。

### §11.20 v1.3.0 amend — §I.2 demo-menu 處理開 toggle-auth 例外(2026-06-03,022)

> **改哪節**:constitution §I.2「含義」demo-menu bullet 加 sub-bullet 例外 + §II §11.5 摘要列加註 —— `function` / `function_toggle-auth` demo 選單由 022 提升為**真實 Casbin-enforced 選單**(seed 入 sys_menu + menu policy),其餘 demo menu 仍守「pageExcludePatterns 隱藏」原則。
>
> **為何**:022 K3/K4 親決保留 B_CODE1/2/3 並**救活 toggle-auth demo**(CDP 實測現況不可達 = not-found,因不在 sys_menu/Casbin)。§I.2 原則是 demo menu → 隱藏、不進 enforce;救活 toggle-auth 與此相反 → plan Constitution Check §IV.3/§IV.6(§11.5)抓到。**開窄例外**:僅 toggle-auth(+父 function)一個 demo 群提升為真實選單,作為 button 權限端到端 demo 載體(B_CODE1/2/3 三角色各見對應鈕),不動其餘 demo。此提升其實**更貼 §I.2 核心「menu Casbin enforce」**,僅例外其「demo 改用隱藏」子句。
>
> **改後影響**:022 migration seed 加 function / function_toggle-auth 入 sys_menu + 三角色 menu policy → **getUserRoutes 逐字基線 re-base**(含該 demo 選單,022 spec FR-010 已記為唯一 intended 回歸例外);per-role home 與既有業務選單可見性不受影響。原則例外 = **MINOR**(§V.3,非鐵紀律反轉),version 1.2.3 → 1.3.0。
>
> **觸發**:022 `/speckit-plan` Constitution Check(FINDING 2)。

### §11.21 v1.4.0 amend — MODAL-WIRING ★ 邊界 +同模式新權限 modal+trigger(2026-06-04,023)

> **改哪節**:constitution §III.2 MODAL-WIRING ★ 邊界加 **(c)** 子句 —— 允許於 `views/manage/role/modules/role-operate-drawer.vue` 的 `v-if="isEdit"` 授權編輯區,新增**同模式的角色權限 auth-modal 元件**(新 `*-auth-modal.vue` 鏡像既有 `menu-auth-modal`/`button-auth-modal`)+ 其觸發 NButton + `page.manage.role.*Auth` i18n key;紀律「兩用途」→「三用途」。
>
> **為何**:023 EndpointAuth 的「接口权限」編輯介面**無既有 placeholder**(021 menu / 022 button 是接 base-web 既有的 menu-auth-modal/button-auth-modal stub;endpoint〔API path×method〕權限 base-web 無對應 UI)。新增 modal 元件 + drawer trigger NButton **literally 既非 (a)「`// request` 接線」、亦非 (b)「hasAuth gating」** → plan Constitution Check §IV.2/§IV.7 抓到(FINDING)。**開窄例外**:僅允許「角色 × 某權限維度」的 runtime 編輯介面、嚴格對齊既有 MenuAuthModal/ButtonAuthModal 範式(NTree + 3 fetch fn + `watch(visible)`),不擴張到任意新 UI。
>
> **改後影響**:023 新增 `endpoint-auth-modal.vue` + `role-operate-drawer.vue` 第 3 顆「接口权限」NButton + `page.manage.role.endpointAuth` i18n(zh-cn/en-us)。日後同維度權限 modal(若有)沿此授權。**軌道授權邊界擴展 = MINOR**(§V.3,非鐵紀律反轉、**非新軌道**〔§11.9「5 軌道/2★」計數不變、僅擴 MODAL-WIRING 既有 ★ 邊界〕),version 1.3.0 → 1.4.0。
>
> **觸發**:023 `/speckit-plan` Constitution Check(FINDING #2/#7)。

### §11.22 doc-reconcile — 過時 R_SUPER wildcard 文字校正為逐 endpoint + menu-read 分歧拍板(2026-06-04,023)

> **改哪節**:本檔 §4.6.3 —— (1) role 範圍列(「全通(wildcard)」)、(2) `getAllRoles` 备注(「seed 用 `p, *, ..., GET`」)、(3) seed 寫法(「`R_SUPER` 用 wildcard `p, R_SUPER, *, *`」+「`*` 主體」)、(4) 驗收 SQL(`v0 IN (...,'*')`),及 §6.3 body(「`p, R_SUPER, *, *`(super 全通)」)→ 皆改「逐 endpoint 列、無 wildcard、無 `*` 主體」。**另**:§4.6.3 menu-read 三列(getMenuList/v2·getAllPages·getMenuTree)R_ADMIN 欄 ✓ → ✗、對齊實作。
>
> **為何**:(a) wildcard `p, R_SUPER, *, *` 計畫從未實作 —— enforce matcher exact-equality(`enforce.rs:41`)`*` 列永不 match 具體請求;016 as-built(§10 Phase 4「manage list endpoints」)已 de-facto 逐條 seed,但 §4.6.3/§6.3 in-place 文字漏校正。023 EndpointAuth 使 R_SUPER endpoint 集成 runtime-editable(root-mode guard 拒編輯),literal wildcard 列在 per-endpoint modal 不可勾選 → 文字必須 reconcile 成單一真相。(b) menu-read 分歧(spec 唯一 intended 文件變更):matrix 標 Admin 可讀,實作(019 seed 3 行 R_SUPER;023 contracts §3a Admin getMenuTree→5003)為 Super-only → 以實作為單一真相(FR-007),Admin 可於執行期經接口权限 modal 獲授(runtime grantable、非預設硬塞)。
>
> **改後影響**:純文件校正、**casbin seed 不變**(R_SUPER/R_ADMIN/R_USER_COMMON 本就 per-endpoint 列;023 migration 只 seed 3 新治理端點);授權矩陣描述與實作 100% 一致(SC-005)。**非 constitution amendment**(無版本 bump —— §11.19/§11.20/§11.21 為 constitution 修訂,本條為 DESIGN 內部 reconcile-of-record)。
>
> **觸發**:023 spec FR-007 + research R7 + tasks T010(矩陣單一真相);於 /speckit-analyze remediation pass 一併套用(2026-06-04)。

---

### §11.23 v1.5.0 amend — MODAL-WIRING ★ 邊界 +選單復原/re-parent 維運控制(2026-06-04,025)

> **改哪節**:constitution §III.2 MODAL-WIRING ★「邊界」加 (d) 子句(`views/manage/menu/**` 選單復原/re-parent UI:parentId selector + 已刪 toggle + restore 鈕)+「紀律」三用途→四用途 + rationale +§11.23 + version 1.4.0→1.5.0。
>
> **為何**:025 menu-restore-reparent 的 re-parent 需在 `menu-operate-modal.vue` edit 加 parentId selector(**新 form 控件**;現 parentId 純內部 data 欄、`showLayout=parentId===0` 唯一消費、無控件可 un-disable),restore 需在 `index.vue` 加「顯示已刪除」toggle + 已刪列 restore 鈕(**全新 inline UI**;menu 頁無 toggle/search/recycle pattern)。二者 literally 既非 (a)`// request` 接線、亦非 (b)`hasAuth` gating、亦非 (c)role-page auth-modal → `/speckit-plan` Constitution Check §IV.2/§IV.7 抓到(與 023 觸 (c) 同 gap-pattern)。**開窄例外**:僅 `views/manage/menu/**` 的選單復原/re-parent 維運控制;R1(孤兒父已刪擋下)/R2(種子父固定、僅自訂可搬)/R3(已刪 toggle)為設計約束、嵌入子句使邊界自我記錄、不擴張到任意新 menu 頁 UI。+2 fetch fn(`rev2-system-manage.ts`)走 BASE-WEB-WRAPPER、免本子句。
>
> **改後影響**:025 得在 `menu/index.vue` + `menu-operate-modal.vue` 加 restore/re-parent UI(每處 spec 記 file:line + upstream 衝突風險;共用元件附加 prop + 安全預設)。**軌道授權邊界擴展、非新軌道**(§11.9「5 軌道/2★」計數不變、僅擴 MODAL-WIRING 既有 ★ 邊界)= **MINOR**(§V.3),version 1.4.0 → 1.5.0。分流四檔:規範→constitution §III.2;提案 of record→本節;1 行→CHECKLIST §1;row→MILESTONES(獨立 follow-up commit 指 amend SHA、避 self-ref)。
>
> **觸發**:025 `/speckit-plan` Constitution Check FINDING #2/#7。落 025 feature branch(隨 025 merge 回 default)。

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
