# MOCK-COVERAGE-AUDIT.md

> **檔名暫定**(user 之後改名)。對應 `docs/INTEGRATION-RESEARCH.md` §10.5 的 CDP 驗證任務報告。
>
> **目的**:三方對照 — (1) base-web `src/service/api/*.ts` 自宣告的 endpoint /(2) base-web dev UI 實際觸發的 endpoint /(3) ApiFox `soybean-admin-mock` 提供的 endpoint;判定 §10.4「A 路徑可行性」與 Q1+Q3 衝突的最新解法。
>
> **驗證日期**:2026-05-26
> **環境**:`rev2-base-web-dev` container(`docker-compose.base-web.yml --profile dev` 啟動)+ CDP `127.0.0.1:9229` + Chrome DevTools Network capture
> **執行者**:Claude(Opus 4.7 1M context, /effort max)

---

## TL;DR(三句話結論)

1. **mock 涵蓋率 = 92.3%(read endpoint)+ 100%(若 rev2 採用 REST 風格 CRUD endpoint)**:base example 12/13 endpoint 在 ApiFox mock 有對應;ApiFox 另有 33 個 REST 風格 endpoint(POST/PUT/DELETE 完整 CRUD)base 未包裝。
2. **Q3 (a) 完整 CRUD UI ≠ A 路徑單獨可達**:base example 的 modal/drawer/delete button 都只有 `// request` placeholder + `console.log`,**沒呼叫任何 wrapper**;要 submit 動作 work,必須**改既有 .vue 內 inline 程式碼**接到 wrapper —— 這違反 user §10.3 Q1 的「不動 inline」紀律。
3. **Wire ground truth 與 rev1 DESIGN-B 設定不一致**:envelope 是 `{data, code, msg}` **無 `success` bool**;`code` 是 string `"0000"`;userId 是 string `"1"`;super role 是 `R_SUPER`(rev1 用 `ROLE_SUPER`)— **rev2 rust-api 從 0 設計時這些必須對齊 mock**,§10.4 第 3 點(F4 / F22 / F24 / 030 對應變化)需要再次校準。

---

## §1 CDP 任務執行流程

### 1.1 環境

| 項目 | 值 |
|---|---|
| CDP host | `127.0.0.1:9229` |
| Browser | Edg/148.0.3967.83(Chromium 148) |
| base-web tab id | `1EB0A290B8759A34237ADB6CAA4A5806`(`http://127.0.0.1:9527/...`) |
| ApiFox tab id | `BC1D15D21828E3F2BD55F6FA6437E67F`(`https://s.apifox.cn/35c8727a-d3ab-47e9-8863-ef8e37df6887`) |
| base-web container | `rev2-base-web-dev`(`docker-compose.base-web.yml --profile dev`)|
| mock 後端 | `https://mock.apifox.cn/m1/3109515-0-default`(.env.test / .env.prod) |
| vite proxy 規則 | `/proxy-default/*` → 重寫掉 prefix → forward 到 `VITE_SERVICE_BASE_URL` |

### 1.2 自動化腳本

已從 `/tmp/cdp-rev2/` 搬到 [`tests/mock-coverage-audit/`](../tests/mock-coverage-audit/),含 README 說明執行流程:

- `cdp.mjs` — CDP 控制工具(Node 22+ native WebSocket、tabs/eval/navigate/capture/cookies/screenshot)
- `flow.mjs` — orchestrator(連 WS,Network 事件即時抓 body,依序執行 step actions)
- `steps/login.json` — 登入流程(click 超級管理員 → 確認)
- `steps/tour.json` — menu 遍歷(/manage/user, /manage/role, /manage/menu, /user-center, /home + raw fetch 11 endpoint)
- `steps/raw-fetch.json` — 帶 `apifoxToken` 的 raw fetch 13 endpoint

### 1.3 三段 capture 結果

| capture | records | 用途 |
|---|---|---|
| `cap-login.json` | 10 | login + getUserInfo wire shape |
| `cap-tour.json` | 20 | UI 自然觸發 5 distinct endpoint(9 個 200 record,含多次 getUserInfo) + raw fetch 11 endpoint(全 500,**未帶 apifoxToken**) |
| `cap-raw.json` | 13 | raw fetch 13 endpoint(12 成功 200、1 失敗 502) |

### 1.4 一個 debug 過程的重要發現

第二段 capture 全 500 — 原因:**ApiFox 雲端 Mock 開了 Token 鉴权**,request 必須帶 header `apifoxToken: XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2`。

axios 在 base-web 內被設定為自動加上這個 header(從 `cap-tour.json` 的成功 200 request headers 對比 raw fetch 失敗 401 reveal),raw fetch 未帶 → ApiFox 回:
```json
{"apifoxError":{"code":401,"message":"该项目云端 Mock 功能开启了 Token 鉴权,请求参数需带上该 Token..."}}
```

第三段 capture 加上 `apifoxToken` header 後,12/13 成功。

> **rev2 啟示**:base-web 程式碼或某設定檔內必定有 `apifoxToken` 注入點(可能在 `src/service/request/` 內 axios interceptor 或 vite proxy `configure` hook)。rev2 切到自家 rust-api 時要找出並改掉這個 header 注入(改成不必加 apifoxToken,或加上自家 token 機制)。

---

## §2 base-web 自宣告的 endpoint(13 個)

從 `base-web/src/service/api/{auth,route,system-manage}.ts` 全 grep 出來,**全部是 read endpoint**(POST 只有 login/refreshToken,屬 auth)。

| # | service/api 檔案 | function | method | path | base example 是否用? |
|---|---|---|---|---|---|
| 1 | auth.ts | fetchLogin | POST | /auth/login | ✓ login 頁觸發 |
| 2 | auth.ts | fetchGetUserInfo | GET | /auth/getUserInfo | ✓ 登入後 + 每次 navigate 觸發 |
| 3 | auth.ts | fetchRefreshToken | POST | /auth/refreshToken | ✓ token 過期才觸發 |
| 4 | auth.ts | fetchCustomBackendError | GET | /auth/error?code=&msg= | △ 工具 endpoint(測試 logout/expired code 行為) |
| 5 | route.ts | fetchGetConstantRoutes | GET | /route/getConstantRoutes | ✗ static mode 不觸發 |
| 6 | route.ts | fetchGetUserRoutes | GET | /route/getUserRoutes | ✗ static mode 不觸發 |
| 7 | route.ts | fetchIsRouteExist | GET | /route/isRouteExist?routeName= | △ 動態 menu 才用 |
| 8 | system-manage.ts | fetchGetRoleList | GET | /systemManage/getRoleList(分頁) | ✓ /manage/role 頁觸發 |
| 9 | system-manage.ts | fetchGetAllRoles | GET | /systemManage/getAllRoles | ✓ user/menu 操作 modal 觸發 |
| 10 | system-manage.ts | fetchGetUserList | GET | /systemManage/getUserList(分頁) | ✓ /manage/user 頁觸發(navigate 載入較慢、需 sleep 5s+) |
| 11 | system-manage.ts | fetchGetMenuList | GET | /systemManage/getMenuList/v2 | ✓ /manage/menu 頁觸發 |
| 12 | system-manage.ts | fetchGetAllPages | GET | /systemManage/getAllPages | ✓ /manage/menu 頁觸發 |
| 13 | system-manage.ts | fetchGetMenuTree | GET | /systemManage/getMenuTree | △ menu auth modal 才觸發 |

**沒有任何 write endpoint(create/update/delete)** —— base example 的 service/api 層完全沒包裝。

---

## §3 ApiFox `soybean-admin-mock` 完整 endpoint 清單(45 個)

ApiFox doc 顯示 mock 有兩套並存的 endpoint 風格:

### 3.1 「soybean-admin」風格(對應 base example 的 wrapper,21 個)

| 分組 | API 名稱 | method | 推測 path | base 包裝? |
|---|---|---|---|---|
| Auth | 用户名+密码登录 | POST | /auth/login | ✓ |
| Auth | 获取用户信息 | GET | /auth/getUserInfo | ✓ |
| Auth | 刷新 token | POST | /auth/refreshToken | ✓ |
| Auth | 自定义后端错误 | GET | /auth/error | ✓ |
| 前端路由 | 获取用户路由数据 | GET | /route/getUserRoutes | ✓ |
| 前端路由 | 路由是否存在 | GET | /route/isRouteExist | ✓ |
| 前端路由 | 获取固定的路由数据(不需要权限) | GET | /route/getConstantRoutes | ✓(但 mock 502) |
| 前端路由 | 获取 react 用户路由 | GET | (react 專用)| ✗ |
| 调试 | debug | GET | /debug | ✗(僅 ApiFox 內測) |
| 调试 | debug post | POST | /debug | ✗ |
| 系统管理 | 获取角色列表 | GET | /systemManage/getRoleList | ✓ |
| 系统管理 | 获取用户列表(新) | GET | /systemManage/getUserList | ✓ |
| 系统管理 | 获取用户列表(废弃) | GET | (v1 已廢) | ✗ |
| 系统管理 | 获取所有角色 | GET | /systemManage/getAllRoles | ✓ |
| 系统管理 | 获取菜单列表 | GET | (v1?) | △ |
| 系统管理 | 获取菜单列表 v2 | GET | /systemManage/getMenuList/v2 | ✓ |
| 系统管理 | 获取所有页面组件 | GET | /systemManage/getAllPages | ✓ |
| 系统管理 | 获取菜单树 | GET | /systemManage/getMenuTree | ✓ |
| 项目配置 | 获取用户配置 | GET | (未驗證 path) | ✗ |
| 项目配置 | 保存用户配置 | POST | (未驗證 path) | ✗ |

### 3.2 「REST API」風格(REST CRUD,24 個 — base **完全沒包裝**)

| 分組 | 操作 | method | 推測 path |
|---|---|---|---|
| 用户 | login | POST | /api/users/login |
| 用户 | register | POST | /api/users/register |
| 用户 | profile | GET | /api/users/profile |
| 用户 | password | PUT | /api/users/password |
| 用户 | logout | POST | /api/users/logout |
| 角色 | list | GET | /api/roles |
| 角色 | create | POST | /api/roles |
| 角色 | get by id | GET | /api/roles/:id |
| 角色 | update | PUT | /api/roles/:id |
| 角色 | delete | DELETE | /api/roles/:id |
| 权限 | list | GET | /api/permissions |
| 权限 | create | POST | /api/permissions |
| 权限 | get by id | GET | /api/permissions/:id |
| 权限 | update | PUT | /api/permissions/:id |
| 权限 | delete | DELETE | /api/permissions/:id |
| 菜单 | user menu | GET | /api/menus/user |
| 菜单 | list | GET | /api/menus |
| 菜单 | create | POST | /api/menus |
| 菜单 | get by id | GET | /api/menus/:id |
| 菜单 | update | PUT | /api/menus/:id |
| 菜单 | delete | DELETE | /api/menus/:id |
| 文件 | upload | POST | /api/files/upload |
| 文件 | get by id | GET | /api/files/:id |
| 文件 | delete | DELETE | /api/files/:id |
| 文件 | user files | GET | /api/files/user |

> 兩套 endpoint 用同一 mock host(`https://mock.apifox.cn/m1/3109515-0-default`),只是 path 結構不同。

---

## §4 Wire shape ground truth(rev2 rust-api 從 0 設計的對齊基準)

### 4.1 Envelope(對 rev1 DESIGN-B §4.1 的關鍵修正)

```json
// success 例(getUserInfo / getMenuTree / refreshToken / login / ...)
{
  "data": <T>,
  "code": "0000",
  "msg": "请求成功"
}

// error 例(/auth/error?code=8888&msg=test 回傳)
{
  "data": null,
  "code": "8888",
  "msg": "test"
}
```

**修正點**:
- **沒有 `success` boolean!**(rev1 DESIGN-B 設計含 `success`,需要拿掉)
- `code` 是 **string**(`"0000"`),不是 number(rev1 DESIGN-B §4.1 B1+B2 拍板「VITE_SERVICE_SUCCESS_CODE 改 0 為 number」**需要回退** — base example .env 就是 `"0000"` string)
- 順序:`data` 先,`code` 後,`msg` 最後

**axios unwrap 行為(2026-05-27 H5 補)**:`src/service/request/index.ts` 的 `createFlatRequest` 設定:
```ts
transform(response: AxiosResponse<App.Service.Response<any>>) {
  return response.data.data;  // unwrap envelope,只回 data 給 caller
}
isBackendSuccess(response) {
  return String(response.data.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE;  // "0000"
}
```

- 業務 code(views / store)拿到的是 `{ data, error }` tuple,**`data` 已經是 `<T>` 本身**(envelope 內的 data field unwrap 出來)
- `code` / `msg` 由 request layer 內部處理(logoutCodes / modalLogoutCodes / expiredTokenCodes 分流,詳見 §4.11)
- `String(response.data.code)` 顯示 base-web 強制把 code 轉 string 比對,即使 rust-api 不小心回 number 也會通過 — **rev2 安全做法仍應回 string `"0000"`**

### 4.2 ID 型 — mock vs typings vs 期望(2026-05-27 H3 大幅補充)

**三方對照**:

| Endpoint | mock 實際值 | base-web TS 型(`src/typings/api/*.d.ts`) | rev2 應對齊 |
|---|---|---|---|
| getUserInfo `userId` | string `"1"` | `Api.Auth.UserInfo.userId: string` | **string ✓** |
| getAllRoles `id` | string `"1"` | `AllRole = Pick<Role,'id'>` → `Role.id: number`(從 `CommonRecord`) | **number**(對齊 TS,mock 給錯) |
| getMenuTree `id` | number `1` | `MenuTree.id: number` | **number ✓** |
| getRoleList records `id` | number `1` | `Role.id: number`(CommonRecord) | **number ✓** |
| getUserList records `id` | number `1` | `User.id: number`(CommonRecord) | **number ✓** |
| MenuRoute(route.d.ts)`id` | (route 走 elegant 自動生,mock 沒這個結構) | **`MenuRoute.id: string`!** | **string** |

**重大發現**:
- base-web 用 `Api.Common.CommonRecord<T>` 統一所有業務實體基底,**`id: number`** 是強型別宣告
- 但 mock `getAllRoles` 回 id string,**這是 mock 自己的 inconsistency**(不嚴格隨機 data)
- TS 編譯期不檢查 runtime,所以跑得通,但 base-web 真正的「contract」是 TS 型
- **rev2 rust-api 應該對齊 TS 型(number 為主),而不是對齊 mock 實際值**(更穩定 contract)
- 唯一例外:`userId` 在 `Api.Auth.UserInfo` 顯式宣告為 `string`(脫離 CommonRecord)— rev2 必須回 string
- 唯一例外 2:`MenuRoute.id` 顯式為 `string`(elegant-router 自己用 string 命名)— rev2 動態 menu 回的 id 必須對齊

**Enum 確認(對齊 mock + TS)**:`Common.EnableStatus = '1' | '2'`、`SystemManage.UserGender = '1' | '2'`、`SystemManage.MenuType = '1' | '2'`(`'1'` = directory / `'2'` = menu)、`SystemManage.IconType = '1' | '2'`(`'1'` = iconify / `'2'` = local)— **MenuType 1/2 對應 audit §4.3 之前推測「1=group/2=page」反了**,正確是 1=directory, 2=menu

**Status nullable**:`CommonRecord.status: EnableStatus | null` — **rev2 rust-api 對應欄要支援 null**(Rust `Option<String>` 或 `Option<EnableStatus>`)

### 4.3 Enum 型(全 string)

| 欄位 | 值 | 出現處 |
|---|---|---|
| status | `"1"` / `"2"` | getRoleList / getUserList / getMenuList |
| userGender | `"1"` / `"2"` | getUserList |
| menuType | `"1"` / `"2"` | getMenuList(`"1"`=group / `"2"`=page,推測) |
| iconType | `"1"` | getMenuList |

### 4.4 Role / button code

- super role: **`R_SUPER`**(對應 .env `VITE_STATIC_SUPER_ROLE=R_SUPER`)
- 一般 role: `R_QMSVN_MBN`、`R_LMLJZ_CFLC` 等隨機字串
- button code: `B_CODE1`、`B_CODE2`、`B_CODE3`(getUserInfo 內)

> rev1 DESIGN-B / superpowers 028 用 `ROLE_SUPER`,**rev2 必須改用 `R_SUPER`** 對齊 base .env。

### 4.5 JWT(login response)

```json
{
  "data": {
    "token": "eyJ...",
    "refreshToken": "eyJ..."
  },
  "code": "0000",
  "msg": "请求成功"
}
```

JWT payload(decoded):
- `alg: HS256`, `typ: JWT`
- `data: [{userName: "Super"}]` — note: data 是 **array**
- `aud: "soybean-admin"`, `iss: "Soybean"`
- `sub: "Super"`(login)/ `sub: "RefreshToken"`(refresh response 內的 refreshToken)
- exp 約 2025-10-27 與 2055-01-19 之間(mock 固定 timestamp)— **mock 不驗 exp,token 過期仍 accept**

**重大發現(2026-05-27 H6 補):base-web 完全不解析 JWT payload**
- `src/store/modules/auth/index.ts` 與 `shared.ts`:token 只當 opaque string 存 localStorage + 送 Authorization header
- `userInfo`(userId/userName/roles/buttons)全來自 `/auth/getUserInfo` response,**不從 JWT decode**
- 也就是說 mock 的 `data: [{userName: "Super"}]` array 格式是 mock 自己愛怎麼簽就怎麼簽,**base-web 不在乎**

**對 rev2 含義**:
- rev2 rust-api 的 JWT Claims struct **可以自由設計**(無需對齊 mock 的 data array)
- 標準 Claims(sub / exp / iat / aud / iss + 自家 user_id / role 等)即可
- 仍應**驗 exp**(production 標準,即使 mock 不驗)
- HS256 vs RS256 自選(rev1 用 HS256,rev2 沿用即可,符合 rev1 F1.1 jwt-secrets 紀律)

### 4.6 Authorization header 格式

```
Authorization: Bearer eyJhbGciOiJIUzI1NiI...
```

**注意**:axios 內 token 從 localStorage `SOY_token` 讀出時要先 `JSON.parse`(localStorage 內存 JSON-stringified `"eyJ..."`,有外層雙引號)。raw fetch 直接 `Bearer ${localStorage.getItem('SOY_token')}` 會傳 `Bearer "eyJ..."`(帶引號)— ApiFox 也認(因為 401 是 apifoxToken 缺失,不是 Bearer token 格式)。

### 4.7 預設帳號(quick-fill button)

| 按鈕文字 | userName | password |
|---|---|---|
| 超级管理员 | `Super` | `123456` |
| 管理员 | `Admin`(推測) | `123456` |
| 普通用户 | `User`(推測) | `123456` |

**注意**:rev1 superpowers/CLAUDE.md §8.1 寫 `Soybean / Administrator / GeneralUser` — 這是 rev1 自己的 migration seed,**不是 mock 預設**。rev2 rust-api 從 0 寫時要選擇:對齊 mock(`Super`/`Admin`/`User`)還是延用 rev1 命名。建議**對齊 mock**(因為 quick-fill button 已固定)。

### 4.8 ApiFox 鉴权 header(rev2 切走時必拿掉)

base-web 內某處(axios interceptor 或 vite proxy `configure` hook)會自動加:
```
apifoxToken: XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2
```

> **rev2 啟示**:切到自家 rust-api 後,這個 header 應改成 rev2 自家 token 機制(或乾脆拿掉)。rev1 應該也有處理(但沒在 INTEGRATION-CHECKLIST 看到提及 — 可能是在 .env 切 base URL 那刻自然不加)。
>
> **grep 結果(2026-05-27 補)**:`apifoxToken` 寫死在 base-web 兩個 request lib 內:
> - `src/service/request/index.ts:17` — axios 預設 headers:`apifoxToken: 'XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2'`
> - `src/service-alova/request/index.ts:37` — alova interceptor:`config.headers.apifoxToken = 'XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2'`
>
> 都是 inline 寫死、非 envvar。**rev2 移除策略候選**:
> - (a)直接動這兩處 inline 一行(屬 L4 inline 改動,但極窄,只 1 行 × 2 檔)
> - (b)用 vite proxy `configure` hook 反向 `proxyReq.removeHeader('apifoxToken')`(L1 base-web src/ 不動,但要動 `build/config/proxy.ts` 或新增獨立檔)
> - (c)接受該 header 仍送(自家 rust-api 直接忽略 unknown header,無害)— 最低工
>
> 三選由 rev2 spec-kit feature 時拍板。

### 4.9 paginated wrapper 結構(✅ 2026-05-27 H3 從 TS 型確認)

從 `src/typings/api/common.d.ts` 確認:

```ts
interface PaginatingCommonParams {
  current: number;  // current page number
  size: number;     // page size
  total: number;    // total count
}

interface PaginatingQueryRecord<T = any> extends PaginatingCommonParams {
  records: T[];
}
```

對應 envelope wrap:
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

**rev2 對齊清單**:
- 4 個 fields(`current`, `size`, `total`, `records`)— **無 `pages`** 欄(audit 之前的「`pages`?」推測錯誤)
- 全 number 型(`current` / `size` / `total`)+ `records: T[]`
- `RoleList = PaginatingQueryRecord<Role>`,`UserList = PaginatingQueryRecord<User>`,`MenuList = PaginatingQueryRecord<Menu>` — 三個 list endpoint 都同 wrap

**search params 對應**(`CommonSearchParams`):`Pick<PaginatingCommonParams, 'current' | 'size'>` + 業務欄(`RecordNullable` 包,所有欄可 null)
- e.g. `RoleSearchParams = RecordNullable<{ roleName, roleCode, status, current, size }>`
- 所有 search field 可傳 `null` / 空字串(rev2 rust-api 需處理)

### 4.10 base example 同時有兩套 request lib(axios + alova)

**事實**:base example 的 `src/` 內有兩個 service 目錄並存。本 audit 主要在驗 axios 那套(因為 service/api 是 manage/ 業務真實使用的);alova 是 demo 教學套件,但對 rev2 設計有幾個值得注意的點。

| 維度 | `src/service/` (axios) | `src/service-alova/` (alova) |
|---|---|---|
| **被哪些 view 用** | 10+ 處 `from '@/service/api'`(manage/user, manage/role, manage/menu, login 流程等業務 view) | 5 處 `from '@/service-alova/*'`,**全在 `src/views/alova/*` demo 頁**(共 7 個 .vue) |
| **api 宣告數** | 13 endpoint(read 為主 + auth 的 POST) | 含 axios 那 13 + **額外 write endpoint**(如 `addUser` POST /systemManage/addUser)+ 抽離項(`sendCaptcha` POST、`verifyCaptcha` POST) |
| **apifoxToken header** | `src/service/request/index.ts:17` 寫死(axios `defaults.headers.common`) | `src/service-alova/request/index.ts:37` 寫死(alova request interceptor) |
| **mock 策略** | 全走 vite proxy `/proxy-default/*` → ApiFox cloud mock | 含**本地 mock adapter**(`createAlovaMockAdapter([featureUsers20241014], {enable: true, delay: 1000, matchMode: 'methodurl'})`),命中走本地、未命中 fallback `adapterFetch()` 出去 |
| **底層 HTTP API** | axios | alova(`@sa/alova`)+ native fetch adapter |
| **rev2 影響** | **主要對齊目標**(manage/ 業務 + auth/ 都走這套,動機二 rust-api 從 0 對齊的就是這 13 endpoint) | demo 性質;rev2 若不教 alova,可選「保留不動」或「整目錄移除」 |

**重要 ground truth(alova 多宣告但 axios 沒宣告的 endpoint)**:
- POST `/systemManage/addUser`(`addUser(data)`)— alova 已宣告,**axios 沒**;ApiFox §3.1「系统管理」分組目前看也沒列出 `addUser`(REST 風格 §3.2 的 `postApiUsers` 是別套 path) — 可能 ApiFox 沒實作這個 mock,但 alova 程式碼宣告了
- POST `/auth/sendCaptcha`、POST `/auth/verifyCaptcha`— 對應 rev1 F11 抽離項;base example 的 alova 已宣告,axios 沒

**rev2 處理策略候選**:

| 選項 | 動作 | Pro | Con |
|---|---|---|---|
| (a)整目錄移除 | 刪 `src/service-alova/` + `src/views/alova/` + router 對應 alova route | 乾淨、減少混淆 | L4 大改(雖屬「刪除既有」性質,upstream 加 alova 內容時 rebase 衝突大) |
| (b)**保留不動** | rev2 不教 alova,user 不點 alova demo 頁也無影響;alova 主要走本地 mock,不會送到 rust-api;即使送過去,自家 rust-api 直接回 404 即可 | 完全 L0(零改動)、upstream pull-ability 完美 | 多餘程式碼留著、build size 較大 |
| (c)只動 apifoxToken | 同 §4.8 移除策略 (a),也動 alova 那一行(L4 inline 改動,1 行 × 1 檔) | 切到自家 rust-api 後 alova demo 也 work | 若搭 (b) 還 OK;若搭 (a) 就不必 |

**alova 確實已 auto-register 進 router + sidebar 顯示**(2026-05-27 補驗,以下 CDP 證據):

- `src/router/elegant/{imports,routes,transform}.ts` 三檔都是 **`// Generated by elegant-router`** 自動產生,內含 `alova_request` / `alova_scenes` lazy import + route entry(name=`alova`, path=`/alova`, icon=`carbon:http`, order=7)
- `src/typings/elegant-router.d.ts` 內 `RouteMap` 含 `alova` / `alova_request` / `alova_scenes`
- `http://127.0.0.1:9527/home` sidebar **實際顯示「alova示例」menu 條目**(CDP `document.querySelectorAll('.n-menu-item-content')` 證實,展開後可見「请求」「请求场景」子項)
- 直接 navigate `http://127.0.0.1:9527/alova/request` **可成功 render**(title=「alova请求」,內含「请求失败后登出用户」等 demo 按鈕),走本地 mock(`createAlovaMockAdapter` 1000ms delay)

**結論**:§4.10 (b) 「保留不動」會讓 user 在 sidebar 看到無關的「alova示例」menu — 需誠實納入評估。

### 4.10.1 elegant-router 的 exclude 機制(2026-05-27 補)

base-web 用 `@elegant-router/vue@0.3.8`(舊版 namespace,**新版改名為 `elegant-router`**,doc 在 [legacy branch](https://github.com/soybeanjs/elegant-router/tree/legacy))。legacy README 確認**兩條 exclude 路徑**:

| 機制 | 用法 | 性質 |
|---|---|---|
| **`_` 前綴 folder convention** | rename `src/views/alova/` → `src/views/_alova/` → 整個 folder 被 ignore;子 folder(若有 .vue)會「拉到上層」自動 register | file-system 改動(L4 性質,但純 rename 既有 folder,**upstream rebase 衝突極高** — upstream 若改 alova 內任何檔 git 會找不到 path) |
| **`pageExcludePatterns` config** | 在 `build/plugins/router.ts` 的 `ElegantVueRouter({ ... })` 加 `pageExcludePatterns: ['**/alova/**', '**/components/**']`(default 只排 `**/components/**`)| **config 改動**(L4 但屬 build infra,1 array item 增加;upstream 該檔通常穩定不改) |

### 4.10.2 更新後的 rev2 處理策略候選(取代 §4.10 原本表格)

| 選項 | 動作 | Q1 紀律 | UX | upstream rebase |
|---|---|---|---|---|
| (a)整目錄移除 | 刪 `src/service-alova/` + `src/views/alova/` + router 對應 alova route | L4 ✗(改 src/ 既有結構) | 乾淨無 alova menu | upstream 加 alova 內容時必衝突 |
| (b)**保留不動**(原版) | 完全零改動 | L0 ✓ | sidebar 仍出現「alova示例」menu;user 點進去 demo 頁實際 work(走本地 mock + 帶 apifoxToken fallback) | upstream rebase 永遠 clean |
| **(b')保留 src/ 不動 + `pageExcludePatterns` 隱藏**| 動 `build/plugins/router.ts` 加 `pageExcludePatterns: ['**/alova/**', '**/components/**']`(也可加 service-alova 排除等)| **L4 但屬 build config**(非 src/ 業務邏輯;Constitution 應該允許單獨軌道) | sidebar 不顯示 alova menu;`src/views/alova/` 與 `src/service-alova/` 保留(將來想用可立刻 enable) | 衝突風險:build/plugins/router.ts upstream 通常穩定;若 upstream 自己加 pageExcludePatterns,需手解 |
| (c)只動 apifoxToken | 同 §4.8 移除策略 (a) | L4(axios + alova 兩處 inline 改) | 仍有 alova menu(同 (b)) | 仍會衝突(同 (a)/(c)) |

**Claude 建議(更新版)**:從乾淨度與 rebase 風險平衡看:
- 若 rev2 完全不想看到 alova(包括誤點 menu)→ **(b')** 最佳:建議在 Constitution 新增 **「W-BASE-WEB-BUILD-CONFIG(L4 build infra,需授權)」軌道**,專管 `base-web/build/*` 改動
- 若 rev2 不介意 sidebar 有個多餘 menu(反正不會誤點到 rust-api 業務) → **(b) 保留不動** 仍是最保守
- 不建議 (a)(rebase 風險高)與 (c)(動 inline 但沒解決 menu 問題)

### 4.10.3 額外發現:elegant-router 自動把 `views/_*/` 的子 folder 拉到上層

從 legacy README:
> `views/_error/{403,404,500}/index.vue` → 自動產生 `/403`, `/404`, `/500` route(`_error` 被 ignore,但子 folder 直接 promote 成 route name)

**對 rev2 含義**:若 rev2 想保留 alova 程式碼但放進「待 review」狀態,可以 rename 為 `_alova/` — 但這 **不會** 讓 alova 完全消失,反而會把 `request/index.vue` 與 `scenes/index.vue` promote 成 top-level route(`/request`, `/scenes`)!**這個 rename trick 在 alova 場景反而會壞** — 不能用。

所以 (b') 用 `pageExcludePatterns` 是唯一乾淨方案。

### 4.10.4 全景:sidebar 10 個 menu 中,**只 2 個是業務、8 個是 demo**

CDP 證實 base example sidebar `首页 / 文档 / 系统功能 / 异常页 / alova示例 / 插件示例 / Pro Naive UI 示例 / 多级菜单 / 系统管理 / 关于` 共 10 個 top-level menu。完整分類:

| # | menu | views/ 結構來源 | 性質 | rev2 立場 |
|---|---|---|---|---|
| 1 | 首页 | `views/home/` | **業務(必留)** | 保留 |
| 2 | 文档 | `routes/index.ts` customRoutes(`document` 含 10 個 iframe 外連:antd/naive/pro-naive/alova/project/video/unocss/vite/vue 等) | demo(iframe 文件外連) | 隱藏 |
| 3 | 系统功能 | `views/function/` 含 `hide-child/{one,two,three}` + `multi-tab` + `request` + `super-page` + `tab` + `toggle-auth` 共 8 子項 | demo(framework 功能演示) | 隱藏 |
| 4 | 异常页 | `routes/index.ts` customRoutes(`exception` 含 `exception_403/404/500`) | demo(展示異常頁樣式) | 隱藏 |
| 5 | alova示例 | `views/alova/` 含 `request/index.vue` + `scenes/index.vue` | demo(alova 使用演示) | 隱藏(本節主焦點) |
| 6 | 插件示例 | `views/plugin/` 含 **22 子項!**(barcode/charts/copy/editor/excel/gantt/icon/map/pdf/pinyin/print/swiper/tables/typeit/video 等) | demo(各種第三方插件示範) | 隱藏 |
| 7 | Pro Naive UI 示例 | `views/pro-naive/` 含 `form` + `table` 共 6 子項 | demo(Pro Naive UI 元件示範) | 隱藏 |
| 8 | 多级菜单 | `views/multi-menu/` 含 first/second 嵌套 | demo(多級 menu 演示) | 隱藏 |
| 9 | 系统管理 | `views/manage/` 含 `user / role / menu / user-detail` | **業務(必留)** | 保留 |
| 10 | 关于 | `views/about/` | demo(version / about 頁) | 可選 |

**Top-level menu 業務:demo 比例 = 2 : 8**(若加 user-center 個人中心算半業務,則 2.5 : 7.5)。

#### rev2 批次隱藏 demo menu 的策略

擴展 §4.10.2 (b'),把 alova 隱藏改為「批次隱藏所有 demo menu」:

**選項 (b'-full)**:在 `build/plugins/router.ts` 加大範圍 `pageExcludePatterns`:
```typescript
// build/plugins/router.ts
pageExcludePatterns: [
  '**/components/**',  // default
  '**/alova/**',
  '**/function/**',
  '**/multi-menu/**',
  '**/plugin/**',
  '**/pro-naive/**',
  '**/about/**',  // 可選
]
```

**但 pageExcludePatterns 對「不從 views/ 來」的 customRoutes 無效**:
- 「文档」menu 來自 `routes/index.ts` customRoutes 內 hardcode 的 `document` parent + 10 子項
- 「异常页」menu 來自同檔的 `exception` parent + 3 子項
- 要隱藏這兩個 menu,**必須動 `src/router/routes/index.ts` inline**(刪/註解 customRoutes 內對應條目)— **這屬 L4 src/ 改動**,且 routes/index.ts 是 upstream 經常更新的中央集中地(新加 iframe 文件外連時會在 document 分組內 add),**rebase 衝突風險高**

#### 三選一拍板

| 選項 | 動作 | sidebar 結果 | upstream rebase 風險 |
|---|---|---|---|
| **(b)** 完全保留不動 | 零改動 | 10 menu 全顯示(8 demo + 2 業務) | 永遠 clean |
| **(b'-narrow)** 只 build/plugins 加 pageExcludePatterns(可選擇隱藏多少) | 動 build infra L4 | views/ 來源的 demo 都可隱藏(alova/function/plugin/pro-naive/multi-menu/about);但「文档」「异常页」仍顯示 | 低(build/plugins 穩定) |
| **(b'-full)** (b'-narrow) + 動 `src/router/routes/index.ts` 刪 `document` / `exception` customRoutes | 兩處 L4(build infra + src/router inline) | 8 demo menu 全隱藏,sidebar 只剩 2 業務 menu | 中高(routes/index.ts 是 upstream 集中地)|

**Claude 建議**:
- **rev2 P0/P1 階段先採 (b) 完全保留**:這時 user 只是在驗 rust-api 對齊 mock 的基本功能,sidebar 有 demo menu 不影響;avoid 過早把 base example 改髒
- **rev2 P4/P5 階段或 production 切換時再評估 (b'-narrow)**:屆時 user 已準備正式對外,「畫面乾淨」變得有意義,選 (b'-narrow) 用 build infra 隱藏 demo
- **不建議 (b'-full)**:動 `src/router/routes/index.ts` 對換的 sidebar 乾淨度不成比例(只多隱藏「文档」「异常页」兩個 menu,但 rebase 風險顯著上升)— 寧可「文档」/「异常页」留著當「外連工具」用

**對 rev2 wire 設計的含義**:
- **axios api(用於 manage/ 業務)的 13 endpoint 是「rev2 必須對齊的」**(動機二「最大化配合 base-web」的具體 target)
- **alova api 額外的 write endpoint(addUser / sendCaptcha / verifyCaptcha)是「rev2 可選對齊」**(取決於是否要支援 alova demo 頁的 captcha verification 等場景跑通;若採選項 (b)/(b') 完全不必)

### 4.11 service error codes 完整對照(2026-05-27 H4 補)

`.env` 4 個 code list × `src/service/request/index.ts` 的 `onBackendFail` 流水線:

| .env 設定 | code(s) | base-web request layer 對應行為 | rev2 rust-api 何時回 |
|---|---|---|---|
| `VITE_SERVICE_SUCCESS_CODE` | `0000` | success path:envelope unwrap、`data` 給 caller | **每個成功響應** |
| `VITE_SERVICE_LOGOUT_CODES` | `8888,8889` | `handleLogout()` 立即 — clear localStorage + Pinia reset + 跳 `/login`,**無 modal** | rev2 用於:**token 已 revoked**(refresh 鏈斷)、**user 被禁用**、**強制重登** |
| `VITE_SERVICE_MODAL_LOGOUT_CODES` | `7777,7778` | 顯 `window.$dialog.error` modal(`msg` 為內容,可 ESC / 點關閉),user 按確認後 logout | rev2 用於:**user 看到原因再被踢出**(e.g.「您的帳號在他處登入」) |
| `VITE_SERVICE_EXPIRED_TOKEN_CODES` | `9999,9998,3333` | 觸發 `handleExpiredRequest`:呼叫 `fetchRefreshToken` 拿新 token,**成功則 retry 原 request 用新 Authorization**;refresh 失敗則 `resetStore()` logout | rev2 用於:**access token 過期**(三個 code 任選) |
| 其他 code | 任意 | fallback `showErrorMsg`:toast 顯 `msg`(`window.$message.error`),不 logout / 不 refresh | rev2 用於:**業務 error**(e.g. `5001` 驗證失敗、`5002` 資源不存在、自訂 code 等) |

**rev2 rust-api error code 矩陣設計建議**(基於上表):

| 場景 | 建議 code | base-web 行為 |
|---|---|---|
| 成功 | `"0000"` | unwrap data |
| 業務驗證失敗(輸入錯誤、規則不符) | `"5001"`(或自訂) | toast(不 logout) |
| 資源不存在 | `"5004"`(或自訂) | toast |
| token 過期(可 refresh) | `"9999"`(或 `9998` / `3333`) | 自動 refresh + retry |
| token 已 revoked(refresh chain 斷) | `"8888"` | 立即 logout(無 modal) |
| user 被禁用 / 強制重登 | `"8889"` | 立即 logout |
| user 帳號在他處登入(顯訊息再 logout) | `"7777"` | modal + logout |
| 其他需 user 確認的 logout 原因 | `"7778"` | modal + logout |

**critical 紀律**:rev2 的 `/auth/refreshToken` endpoint **絕對不能回 expiredTokenCodes**(`9999/9998/3333`),否則會無限 refresh dead loop(base-web 內 `src/service/request/index.ts` line 87 註釋警告)。refresh 失敗應回 `logoutCodes`(`8888`)或 `modalLogoutCodes`(`7777`)。

### 4.12 base-web auth flow(login + refresh + logout)完整(2026-05-27 H5+H6 補)

來源:`src/store/modules/auth/{index,shared}.ts` + `src/service/request/{index,shared}.ts`

#### 4.12.1 Login flow

```
user 點「確認」
  → useAuthStore.login(userName, password)
    → fetchLogin(userName, password)         [axios → POST /auth/login]
    → {data: loginToken, error}             [unwrap envelope]
    若無 error:
      → loginByToken(loginToken)
        → localStg.set('token', loginToken.token)            [LS key: SOY_token]
        → localStg.set('refreshToken', loginToken.refreshToken)  [LS key: SOY_refreshToken]
        → getUserInfo()
          → fetchGetUserInfo()              [axios → GET /auth/getUserInfo, Bearer header]
          → Object.assign(userInfo, {userId, userName, roles, buttons})
        → token.value = loginToken.token   [Pinia state]
      → checkTabClear()                    [若 user 變了就清 tabs]
      → redirectFromLogin(true)            [跳 home]
      → $notification.success
    若有 error:
      → resetStore()                       [clear LS + Pinia reset + 跳 /login]
```

**rev2 rust-api 對齊清單**:
- `/auth/login` request body:`{userName: string, password: string}` ✓(audit §7.2.1 驗過)
- `/auth/login` response:envelope wrap `{token, refreshToken}` ✓
- `/auth/getUserInfo` request:`Authorization: Bearer <token>` ✓
- `/auth/getUserInfo` response:envelope wrap `{userId: string, userName: string, roles: string[], buttons: string[]}` ✓

#### 4.12.2 Refresh token flow(token expired 觸發)

```
任何 request 回 code ∈ {9999, 9998, 3333}
  → request layer onBackendFail 觸發 handleExpiredRequest(state)
    → if (!state.refreshTokenPromise): state.refreshTokenPromise = handleRefreshToken()  [互斥鎖]
    → handleRefreshToken():
      → rToken = localStg.get('refreshToken')
      → fetchRefreshToken(rToken)         [axios → POST /auth/refreshToken, body: {refreshToken: rToken}]
      → if (!error): LS 更新 token + refreshToken,return true
      → else: resetStore(),return false
    → await refreshTokenPromise
    → setTimeout(() => state.refreshTokenPromise = null, 1000)  [1s 後 reset 鎖]
  
  若 success:
    → 取新 Authorization
    → response.config.headers.Authorization = 新 Bearer
    → instance.request(response.config)   [retry 原 request 用新 token]
  若 fail:
    → return null  [由 fail handler 處理,通常觸發 logout]
```

**rev2 rust-api 對齊**:
- `/auth/refreshToken` request body:`{refreshToken: string}` ✓
- `/auth/refreshToken` response:envelope wrap `{token, refreshToken}` ✓
- **rotation 紀律(rev1 028 F13 已驗)**:每次 refresh **同時換新 token + 新 refreshToken**(rev1 用 `sys_tokens` 表 rotation_chain + 舊 token 標 `used`)
- **不能回 expiredTokenCodes**(見 §4.11 紀律)

#### 4.12.3 Page reload 後 restore session(`initUserInfo`)

```
頁面 reload 後 (e.g. F5)
  → useAuthStore.initUserInfo()
    → maybeToken = getToken()  [從 LS SOY_token 讀]
    → if (maybeToken):
        token.value = maybeToken
        getUserInfo()  [用既有 token 拉 user info]
          若 fail:resetStore() [推測 token expired 且 refresh 也 fail]
```

**rev2 對齊**:rev2 rust-api 的 `/auth/getUserInfo` 需支援「用 stale 但未 expired 的 token」拉 user info(這是正常情況,LS 內 token 仍有效)。

#### 4.12.4 Logout flow(被動 + 主動)

被動(各種 logoutCodes / refresh 失敗):
```
resetStore()
  → recordUserId()                        [存 lastLoginUserId 給下次比對]
  → clearAuthStorage()                    [清 LS token + refreshToken]
  → authStore.$reset()                    [Pinia state reset]
  → if (!route.meta.constant): toLogin()  [跳 /login,但 constant route 不跳]
  → tabStore.cacheTabs()
  → routeStore.resetStore()
```

主動(user 點「登出」按鈕)— 程式碼上看也是同 `resetStore`,沒額外 endpoint 呼叫。
- **rev2 rust-api 含義**:**沒有 `/auth/logout` endpoint!**(base example 不需要)
- rev1 F11 抽離項清單也沒 logout,正確
- 但 ApiFox alova api 有宣告 `postApiUsersLogout`(REST 風格),那是 alova demo 用,業務不必

### 4.13 dynamic mode 下 `/route/getUserRoutes` 必有 `home` 欄(2026-05-27 H6 發現)

從 `src/typings/api/route.d.ts`:
```ts
interface UserRoute {
  routes: MenuRoute[];
  home: import('@elegant-router/types').LastLevelRouteKey;
}
```

從 `src/store/modules/route/index.ts:212`:
```ts
async function initDynamicAuthRoute() {
  const { data, error } = await fetchGetUserRoutes();
  if (!error) {
    const { routes, home } = data;       // 必解 home
    addAuthRoutes(routes);
    handleConstantAndAuthRoutes();
    setRouteHome(home);                  // home 設為 / 的 redirect target
    handleUpdateRootRouteRedirect(home);
    setIsInitAuthRoute(true);
  } else {
    authStore.resetStore();               // 失敗則 logout
  }
}
```

**但 mock 漏了 `home` 欄!**(audit §7.2.5 `/route/getUserRoutes` 只回 `{routes: [...]}`,沒 `home`)
- TypeScript 型不檢查 runtime,所以 base-web 可能 silently 用 `undefined` 設 home(或畫面有 bug)
- **rev2 rust-api 必須帶 `home` 欄!**(e.g. `home: "home"` — `.env` `VITE_ROUTE_HOME=home`)

**另一發現:`MenuRoute.id: string`**
- typings route.d.ts 顯式 `id: string`
- 但 mock `getUserRoutes` route 物件沒 `id` 欄(只有 name/path/component/meta/children)
- 推測:mock 對 route 結構 not strict,base-web 也未必用 id;但 rev2 rust-api 提供時應該帶 string id(對齊 TS)

**dynamic vs static mode 整體對比**:

| 行為 | static mode(預設) | dynamic mode |
|---|---|---|
| `.env` | `VITE_AUTH_ROUTE_MODE=static` | `VITE_AUTH_ROUTE_MODE=dynamic` |
| route 來源 | `src/router/routes/index.ts` 本地 `customRoutes` + `src/router/elegant/routes.ts` auto-gen | `/route/getConstantRoutes` + `/route/getUserRoutes` 兩個 endpoint |
| `/route/getConstantRoutes` 觸發? | 否 | 是(init constant 階段) |
| `/route/getUserRoutes` 觸發? | 否 | 是(init auth 階段,user 登入後) |
| `/route/isRouteExist` 觸發? | 走本地 `isRouteExistByRouteName`(用 static routes) | 走 endpoint |
| permission filter | 本地 `filterAuthRoutesByRoles(routes, userInfo.roles)`(看 `meta.roles`) | server 端 filter,client 直接收 |
| home redirect | `.env VITE_ROUTE_HOME=home` 固定 | server 提供(`UserRoute.home`)|

**對 rev2 含義**:rev2 P2 若想用 dynamic mode(動態 menu = rev1 F5.1 / F6 設計核心),**3 個 endpoint 都必須實作**(getConstantRoutes / getUserRoutes / isRouteExist),且 `/route/getUserRoutes` 響應必含 `home` 欄。若 rev2 暫採 static 模式起手(對齊 base example 預設),這 3 個 endpoint 不必實作,但失去 backend 控制 menu 的能力(menu 全由 frontend 寫死)。

---

## §5 Q1 + Q3 衝突的最新分析

### 5.1 新事實:base example modal/drawer 完全沒接 wrapper

CDP grep 證實:
- `src/views/manage/user/modules/user-operate-drawer.vue` 行 107:`// request`(submit 處)
- `src/views/manage/role/modules/role-operate-drawer.vue` 行 86:`// request`
- `src/views/manage/role/index.vue` 行 118 / 125:`async function handleBatchDelete() { // request; console.log(...) }` 與 `handleDelete()` 同
- `src/views/manage/menu/...` 同模式

**意思**:base example 的所有 mutate UI(add/edit/delete button、modal/drawer save button)按下去**只 `console.log` 不發 request**。要讓它們真的呼 endpoint,**必須改 .vue 內 inline 程式碼**(把 `// request` 換成 `await fetchCreateXxx(data)`)。

### 5.2 §10.4 「A 路徑」結論的更新

| 命題 | 原本(§10.4 寫的) | 實際(本 audit 發現) |
|---|---|---|
| A 路徑 = rust-api 完全模仿 mock,base-web L1/L2 即可 | mock 100% 涵蓋的話,純 A 走通 | **讀取 endpoint** 走純 A 可走通;**寫入 endpoint** 走不通(base example 完全沒接) |

### 5.3 路徑重排

| 路徑 | 描述 | Q1 紀律 | Q3 達成 |
|---|---|---|---|
| **A-read-only** | rust-api 模仿 mock 12 個 read endpoint;base-web 只動 `.env` | L1 ✓ | **read OK / write 不動**(modal 開、按 save 只 console.log) |
| **A + L3 wrapper 新增** | rust-api 模仿 mock 12 個 read + 提供 write endpoint;base-web 新增 `src/service/api/rev2-system-manage.ts` 包裝 write | L1 + L3 ✓(新增不改 inline) | **read OK / write 仍不動** — 因為 modal 內 `// request` 處沒人去把它換成新 wrapper 呼叫 |
| **A + L3 + L4 modal inline** | 同上 + 改 modal `// request` 處接到新 wrapper | L4 ✗(改 inline 違規) | Q3 (a) 完整達成 |
| **替代方案 X — runtime monkey-patch** | 在 entry(`src/main.ts` 或 `src/router/guard/`)注入 onMounted hook,動態替換 modal 的 submit handler | 新增獨立檔(L3)、不動 modal | Q3 (a) 達成但**極複雜**、難維護、可能 break |
| **替代方案 Y — 自做並列 view** | 升 L4 但限「新增 view file」(`src/views/rev2-manage/*`)+ 自寫 router(`src/router/routes/rev2.ts` 新增),不動既有 manage view | 嚴格說仍 L4 ✗ | Q3 (a) 達成,UI 與 example 並列(user 可選用任一) |

### 5.4 給 user 的拍板問題

§10.4 的「mock 涵蓋率 100% → 純 A」前提**不成立**,因為 base example 的 mutate UI 是 placeholder 而非真實接線。剩下選項只有以下幾種(請 user 拍板):

**Q5 — 你想走哪條?**

(A) **降低 Q3 標準**:rev2 只追求 login + 動態菜單 + read CRUD(list/search/分頁),write 動作允許「modal 開得起來、按 save 沒反應」。完全保持 L1/L2 紀律。

(B) **升 L3 + L4 inline**:接受改 modal 的 `// request` placeholder(這是 L4),其餘維持 L2/L3 紀律。可達 Q3 (a) 完整 UI,但 upstream rebase 在 `views/manage/*/modules/*-operate-{modal,drawer}.vue` 會有 conflict(雖然只是 1-2 行 change)。

(C) **替代方案 X(monkey patch)** — 嘗試零侵入動態替換 modal 行為。Pro:嚴格 L1/L2。Con:複雜、可能跑不通。

(D) **替代方案 Y(並列 view)** — `src/views/rev2-manage/*` 新增完整 CRUD 頁,自寫 router 註冊。Pro:不動既有 views,upstream rebase clean。Con:**工作量 ≈ 重寫一遍 rev1 W-FW1~9**。

(E) **混合**:read 部分走 A-read-only(L1),write 部分走 (B) 或 (D)。

### 5.5 Claude 的建議

從 rev2 設計動機(動機一 upstream pull-ability + 動機二 rust-api 從 0)綜合判斷,**(B) 是最務實平衡**:
- L4 衝擊範圍小(只動 modal/drawer 內 `// request` 一行 → `await fetchCreateXxx(formData)`,**約 6~10 個檔、每檔 1~3 行改動**)
- upstream rebase 衝突可控(soybeanjs example branch 上這些 placeholder 也很穩定、不太演進)
- 達 Q3 (a) 完整,user 體驗最好

但這要 **user 親自拍板**(因為 user 在 §10.3 Q1 拍板「L3 需授權、不動 inline」,(B) 明顯違反)。

---

## §6 rev2 落地建議(更新 §10.4 並補)

基於 audit 發現,§10.4 第 1~5 條建議微調:

1. **base-web 受管例外軌道**(視 user Q5 答案):
   - 若選 (A):W-BASE-WEB-ADAPT(L1+L2)即可 + 接受 read-only UI
   - 若選 (B):W-BASE-WEB-ADAPT(L1+L2) + W-BASE-WEB-WRAPPER(L3) + 新增 **W-MODAL-WIRING(L4 narrow)** 軌道,只授權 `views/manage/*/modules/*-operate-{modal,drawer}.vue` 內 `// request` placeholder 處改 inline、其他 inline 絕對不動
   - **(共通 — alova 隱藏)**:若選 §4.10.2 (b'),新增 **W-BASE-WEB-BUILD-CONFIG(L4 build infra,需授權)** 軌道,管 `base-web/build/*` 改動(目前只一處:`build/plugins/router.ts` 加 `pageExcludePatterns: ['**/alova/**', '**/components/**']` 隱藏 alova menu)

2. **rust-api 從 0 設計時務必對齊**:
   - envelope 拿掉 `success`,`code` 用 string `"0000"`(rev1 DESIGN-B B1+B2 的「改成 number」**回退**)
   - 預設帳號改 `Super/Admin/User`(對齊 mock quick-fill button)
   - super role 改 `R_SUPER`(對齊 .env)
   - id 型 mock 不一致 — rev2 要先決定統一還是各自對齊(優先「各自對齊」)
   - JWT data 是 array 包 user object(`[{userName: "Super"}]`)— 這對 rev2 從 0 寫的 Claims struct 是 unusual,要決定是否保持

3. **rev1 superpowers 對應 feature 變化**(取代 §10.4 第 3 點原本敘述):
   - F4 response-shape:envelope **沒有 success**;code 是 **string**;對齊調整
   - F22 / F24 / 030:仍是「rust-api 端 mapping」pattern,但對齊目標是 mock wire shape(本檔 §4)
   - F18 / F19:rev2 完全不必;refresh token JWT 自選格式即可
   - F1.1 jwt-secrets:三重防護紀律不變,但 Claims fields 對齊 mock 結構

4. **新增 rev2 啟動對稱盤點清單(§10.4 第 4 點補)**:
   - [x] **已完成**(2026-05-27):`apifoxToken` 注入點 = `src/service/request/index.ts:17`(axios)+ `src/service-alova/request/index.ts:37`(alova)— 詳見 §4.8 含 3 條移除策略候選
   - [ ] 確認 base example `.env`/`.env.test`/`.env.prod` 與 rev2 整合 stack 的 `VITE_SERVICE_BASE_URL` 切換機制
   - [ ] 確認 base example `VITE_AUTH_ROUTE_MODE`(預設 `static`),rev2 P2 是否要切 `dynamic`(若切了 `/route/getUserRoutes` 才會自動觸發)

5. **新增動機三的候選**:rev2 是否要**也對齊 mock 的「REST 風格 endpoint」**(/api/users, /api/roles, /api/permissions, /api/menus, /api/files)— 這意味 rev2 同時提供兩套 API(soybean-admin 風格 read + REST 風格 CRUD),前者讓 base example vanilla read 跑得通,後者讓 rev2-extra wrapper / rev2-views 接 write。**建議**:**不要**,過度設計;rev2 只實作 base example 用到的 12 個 read + 必要的 6~8 個 write(write 用 soybean-admin 風格命名:`/systemManage/createUser` 等,對齊 rev1 W-FW 命名)。

---

## §7 附錄

### 7.1 產物位置

已從 `/tmp/cdp-rev2/` 搬到 [`tests/mock-coverage-audit/`](../tests/mock-coverage-audit/)(2026-05-26):

- **追蹤檔**(git tracked):
  - `tests/mock-coverage-audit/{cdp.mjs, flow.mjs}`
  - `tests/mock-coverage-audit/steps/{login,tour,raw-fetch}.json`
  - `tests/mock-coverage-audit/README.md`(執行指南、wire 摘要、TODO)
  - `tests/mock-coverage-audit/.gitignore`(排除以下兩個目錄)
- **產物**(gitignored,重跑會覆寫):
  - `tests/mock-coverage-audit/captures/{cap-login.json, cap-tour.json, cap-raw.json}`(~300KB)
  - `tests/mock-coverage-audit/screenshots/shot-*.png`(login → user-list → role-list → menu-list → home → user-center → modal 開啟 + ApiFox doc 全景,共 13 張,~1.2MB)

### 7.2 raw fetch sample 響應(完整)

#### 7.2.1 `POST /auth/login`(成功)
```json
// REQ body
{"userName":"Super","password":"123456"}

// RES body
{
  "data": {
    "token": "eyJ...HS256...",
    "refreshToken": "eyJ...HS256..."
  },
  "code": "0000",
  "msg": "请求成功"
}
```

#### 7.2.2 `GET /auth/getUserInfo`
```json
{
  "data": {
    "userId": "1",
    "userName": "Super",
    "roles": ["R_SUPER"],
    "buttons": ["B_CODE1", "B_CODE2", "B_CODE3"]
  },
  "code": "0000",
  "msg": "请求成功"
}
```

#### 7.2.3 `POST /auth/refreshToken`
```json
// REQ body
{"refreshToken": "eyJ..."}

// RES body
{
  "data": {
    "token": "eyJ...sub=Soybean...",
    "refreshToken": "eyJ...sub=RefreshToken..."
  },
  "code": "0000",
  "msg": "请求成功"
}
```

#### 7.2.4 `GET /auth/error?code=8888&msg=test`(自訂錯誤)
```json
{"data": null, "code": "8888", "msg": "test"}
```

#### 7.2.5 `GET /route/getUserRoutes`(摘錄)
```json
{
  "data": {
    "routes": [
      {
        "name": "exception",
        "path": "/exception",
        "component": "layout.base",
        "meta": { "title": "exception", "i18nKey": "route.exception", "icon": "...", "order": 7 },
        "children": [
          { "name": "exception_403", "path": "/exception/403", "component": "view.403", "meta": {...} },
          { "name": "exception_404", ... },
          { "name": "exception_500", ... }
        ]
      },
      // ... about / function / multi-menu / manage / user-center 等
    ]
  }
  // code/msg 未截到(截斷在 1800 字)
}
```

#### 7.2.6 `GET /route/isRouteExist?routeName=home`
```json
{"data": true, "code": "0000", "msg": "请求成功"}
```

#### 7.2.7 `GET /systemManage/getRoleList`(無 params)
```json
{
  "data": {
    "records": [
      { "id": 1, "createBy": "Larry Moore", "createTime": "1974-03-24 05:18:47",
        "updateBy": "Robert Martin", "updateTime": "2010-11-25 21:10:01",
        "status": "2", "roleName": "xpxcdwye", "roleCode": "R_QMSVN_MBN",
        "roleDesc": "Jhbsee ccxgvev wnx." },
      // ... 共 10 筆(隨機 mock data)
    ]
    // pagination wrapper 完整結構(total/current/size)未截到
  }
}
```

#### 7.2.8 `GET /systemManage/getAllRoles`(摘錄)
```json
{
  "data": [
    {"id": "1", "roleName": "ilyzblcc", "roleCode": "R_QRCCD_NHFS"},
    {"id": "2", "roleName": "moixdf", "roleCode": "R_DQUZB_INUBB"},
    // ... 31+ 筆
  ]
}
```
> **注意 id 型是 string**(對比 getRoleList 內是 number),mock 不一致證據。

#### 7.2.9 `GET /systemManage/getUserList?current=1&size=10`(摘錄)
```json
{
  "data": {
    "records": [
      {
        "id": 1,
        "createBy": "Jeffrey Gonzalez", "createTime": "1990-02-01 22:09:33",
        "updateBy": "Brenda Davis", "updateTime": "1976-02-21 17:21:32",
        "status": "2",
        "userName": "rzZHNLhRi3O",
        "userGender": "2",
        "nickName": "Michael White",
        "userPhone": "13666189706",
        "userEmail": "m.enpffie@gthj.bi",
        "userRoles": ["R_EQYV_VFPU"]
      },
      // ... 10 筆
    ]
  }
}
```

#### 7.2.10 `GET /systemManage/getMenuList/v2`(摘錄)
```json
{
  "data": {
    "records": [
      {
        "id": 1, "createBy": "", "createTime": "", "updateBy": "", "updateTime": "",
        "status": "1", "parentId": 0,
        "menuType": "2", "menuName": "首页",
        "routeName": "home", "routePath": "/home",
        "component": "layout.base$view.home",
        "order": 1, "i18nKey": "route.home",
        "icon": "mdi:monitor-dashboard", "iconType": "1"
      },
      // ... 樹狀結構,有 children
    ]
  }
}
```

#### 7.2.11 `GET /systemManage/getMenuTree`
```json
{
  "data": [
    {"id": 1, "label": "首页", "pId": 0},
    {"id": 2, "label": "功能", "pId": 0, "children": [
      {"id": 3, "label": "多标签页", "pId": 2},
      {"id": 4, "label": "标签页", "pId": 2}
    ]},
    // ...
  ],
  "code": "0000",
  "msg": "请求成功"
}
```

#### 7.2.12 `GET /systemManage/getAllPages`
```json
{
  "data": ["home", "403", "404", "405", "function_multi-tab", "function_tab",
    "exception_403", "exception_404", "exception_500",
    "multi-menu_first_child", "multi-menu_second_child_home",
    "manage_user", "manage_role", "manage_menu", "manage_user-detail",
    "about"],
  "code": "0000",
  "msg": "请求成功"
}
```

#### 7.2.13 `GET /route/getConstantRoutes`(失敗 502)
mock 未實作或 ApiFox 內部錯誤。對 rev2 影響:**static mode 不觸發此 endpoint**,可不必實作;若 rev2 切 dynamic mode,需 rust-api 提供。

### 7.3 待後續執行的延伸驗證

- [x] **已完成**(2026-05-27 從 TS 型確認,非 capture)— paginated wrapper 結構:`{current: number, size: number, total: number, records: T[]}`(無 pages 欄),見 §4.9 完整
- [x] **已完成**(2026-05-27)— grep base-web 程式碼找 `apifoxToken` 注入點:`src/service/request/index.ts:17` + `src/service-alova/request/index.ts:37`(見 §4.8 與 §6.4)
- [x] **已完成**(2026-05-27 從 H6 store/modules/route 確認,非 CDP 重跑)— dynamic mode 流程:見 §4.13 完整對比表 + `/route/getUserRoutes` 必含 `home` 欄發現
- [ ] 切 base-web `.env.test` `VITE_AUTH_ROUTE_MODE=dynamic` **實機 CDP 驗證**(§4.13 是程式碼推導,還沒實機驗 navigate 觸發順序)
- [ ] 探 ApiFox 上 「项目配置 / REST 風格」endpoint 的具體 path 與 schema(目前只從 link text 推測,但 audit §6 第 5 條已建議 rev2 不對齊 REST 風格,優先級低)
- [ ] 確認 `getMenuList` v1 與 v2 差異(mock 上兩個都有,base example 只用 v2,優先級低)
- [ ] **新增(H7)**:測 base example 真實業務 error 響應(`/auth/login` 帶錯密碼時 mock 回什麼 envelope?)— 對 rev2 rust-api error response 設計 critical
- [ ] **新增(M1)**:base example 完整登入流程(手動填 / 驗證碼 / 註冊 / reset 密碼 / 綁定 wechat)CDP 驗證
- [ ] **新增(M2)**:`/manage/user-detail/:id` route 對應的 endpoint(base service/api 無 wrapper,推測 view 內 inline fetch)
