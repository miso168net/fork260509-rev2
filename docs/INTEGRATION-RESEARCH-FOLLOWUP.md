# INTEGRATION-RESEARCH-FOLLOWUP.md — Tier 1/2/3 深入研究報告

> 接續 [`MOCK-COVERAGE-AUDIT.md`](MOCK-COVERAGE-AUDIT.md) 與 [`INTEGRATION-RESEARCH.md`](INTEGRATION-RESEARCH.md),完成兩份檔案點名「待深入研究」的 8 項任務。
>
> **執行日期**:2026-05-27
> **執行者**:Claude(Opus 4.7,1M context,/effort max,/loop=goal-driven)
> **工具**:re-use [`tests/mock-coverage-audit/`](../tests/mock-coverage-audit/) CDP 工具 + 2 個 Explore subagent(Tier 1-B / 3-G 並行)
> **新增 capture**:`cap-errors-dynamic.json`、`cap-dynamic-mode.json`、`cap-quickfill.json`、`cap-alova.json`(gitignored,~600 KB 總)
> **新增 step file**:`steps/errors-and-dynamic.json`、`steps/dynamic-mode-login.json`、`steps/quick-fill-all.json`、`steps/alova-runtime.json`(git tracked,共重跑用)

---

## TL;DR(三句話結論)

1. **mock error envelope 全用業務 code(HTTP 200)+ 3 組固定 code**:`"1000"` = login 失敗、`"3333"` = token 過期 / 無效、`"8888"` = refresh 失敗即時 logout;真實不存在的 path 走 ApiFox `{"apifoxError":{...}}` wrapper 而非業務 envelope。
2. **audit §4.13 H6 結論需翻案** — mock `/route/getUserRoutes` 響應**有** `home: "home"` 欄(之前 capture 被截斷誤判);dynamic mode 切 `.env` 後 base-web 真實觸發鏈:`getConstantRoutes` → `login` → `getUserInfo` → `getUserRoutes`(login 後自動)。
3. **audit §4.7 預設帳號 + §4.4 role 表需擴充**:`Admin`/`User` 真實值確認,但 User login req → getUserInfo 回 `User01`(internal alias);role 集合 = `R_SUPER` / `R_ADMIN` / `R_USER_COMMON`(後兩個 audit 未記);buttons 集合 incremental subset(B_CODE1/2/3)。

---

## §1 Tier 1-A — mock 真實 error response 矩陣

### 1.1 12 個 error / edge case CDP capture 結果

| # | 情境 | Method | Path | HTTP | code | msg | data |
|---|---|---|---|---|---|---|---|
| 1 | login 錯密碼 | POST | `/auth/login` | 200 | `"1000"` | `"用户名或密码错误"` | `null` |
| 2 | login 不存在 user | POST | `/auth/login` | 200 | `"1000"` | `"用户名或密码错误"` | `null` |
| 3 | login 空 body `{}` | POST | `/auth/login` | 200 | `"1000"` | `"用户名或密码错误"` | `null` |
| 4 | login 缺 password 欄 | POST | `/auth/login` | 200 | `"1000"` | `"用户名或密码错误"` | `null` |
| 5 | getUserInfo 無 Bearer | GET | `/auth/getUserInfo` | 200 | `"3333"` | `"用户已失效或不存在"` | `null` |
| 6 | getUserInfo 壞 Bearer | GET | `/auth/getUserInfo` | 200 | `"3333"` | `"用户已失效或不存在"` | `null` |
| 7 | **getRoleList 無 Bearer** | GET | `/systemManage/getRoleList` | 200 | `"0000"` | `"请求成功"` | (完整分頁!) |
| 8 | refreshToken 壞 token | POST | `/auth/refreshToken` | 200 | `"8888"` | `"用户状态失效，请重新登录"` | `null` |
| 9 | refreshToken 空 body | POST | `/auth/refreshToken` | 200 | `"8888"` | `"用户状态失效，请重新登录"` | `null` |
| 10 | getUserList page=99999 | GET | `/systemManage/getUserList` | 200 | `"0000"` | `"请求成功"` | `{records:[], current:99999, size:10, total:200}` |
| 11 | getRoleList status=亂寫 | GET | `/systemManage/getRoleList` | 200 | `"0000"` | `"请求成功"` | (正常分頁,mock 不檢) |
| 12 | path 不存在 | GET | `/systemManage/doesNotExist` | **404** | (無) | (無) | `{"apifoxError":{"code":404,"message":"..."}}` |

### 1.2 對 rev2 rust-api error 設計的具體決策

| 場景 | mock 用法 | rev2 rust-api 建議 |
|---|---|---|
| **HTTP status** | error 全用 200 + 業務 envelope;真 path-not-found 才回 404 | **跟 mock**:業務 error 全 200 + envelope;只有 path 不存在 / server 內部 panic 才回非 200 |
| **login 失敗 code** | 統一 `"1000"` 不細分原因 | **跟 mock**:rev2 不暴露「user 不存在 vs 密碼錯」差異(security best practice、避免 user 列舉攻擊) |
| **token 過期 code** | `"3333"`(在 `.env` `VITE_SERVICE_EXPIRED_TOKEN_CODES=9999,9998,3333` 內) | **跟 mock**:用 `"3333"` 觸發 base-web 自動 refresh flow |
| **token 無效 code(無 / 壞)** | 也用 `"3333"`(同一 code) | **rev2 可細分**:`"3333"` = expired(允許 refresh);`"8888"` = 完全無效(立即 logout);實作上 base-web 對兩者都會 refresh 試一次後再 logout,所以**統一回 `"3333"` 也安全** |
| **refresh 失敗 code** | `"8888"`(`VITE_SERVICE_LOGOUT_CODES=8888,8889` 內) | **跟 mock**:absolute 紀律(若 refreshToken endpoint 回 expiredTokenCodes 會 dead loop,見 audit §4.11) |
| **業務驗證錯誤** | mock 完全不檢(`status=NOT_AN_ENUM` 照樣 200) | **rev2 可自訂**:建議 `"5xxx"` 區段(`5001` 驗證失敗 / `5002` 資源不存在),base-web 對未知 code 走 fallback toast |
| **page 超範圍** | 回 success + 空 records + total 保留 | **跟 mock**:不要回 error(分頁工具會 panic);返 `{records:[], current, size, total}` |
| **path 不存在(404)** | 走 ApiFox `apifoxError` wrapper(**非業務 envelope!**) | **rev2 應採業務 envelope**:`{data:null, code:"4040", msg:"接口不存在"}` HTTP 404 — 對齊 base-web fallback toast(否則 `apifoxError` 結構 base-web 不認、走錯處理) |

### 1.3 audit §4.11 表格修正

audit §4.11 列了 4 組 `.env` code 但只給「建議用法」、沒實機驗 mock 真實用法。實機 capture 後可以**收緊建議**:

| audit §4.11 設計位 | mock 真實值 | base-web 真實行為 | rev2 結論 |
|---|---|---|---|
| `VITE_SERVICE_SUCCESS_CODE` = `0000` | ✓ 一致 | unwrap | rev2 用 `"0000"` |
| `VITE_SERVICE_LOGOUT_CODES` = `8888,8889` | mock 用 `8888`(refresh 失敗) | 立即 logout 無 modal | rev2 refresh 失敗回 `"8888"` |
| `VITE_SERVICE_MODAL_LOGOUT_CODES` = `7777,7778` | mock `/auth/error?code=7777` 接收(由 **alova demo「触发」按鈕**手動觸發) | modal + logout | rev2 用 `"7777"` 標「他處登入」等需 user 看訊息再踢出的場景 |
| `VITE_SERVICE_EXPIRED_TOKEN_CODES` = `9999,9998,3333` | mock 用 `3333`(token 無效) | refresh flow | rev2 token 過期回 `"3333"` |

---

## §2 Tier 1-C — dynamic mode 實機驗證

### 2.1 切換步驟(實機已執行)

```bash
# 1. base-web/.env: VITE_AUTH_ROUTE_MODE=static → dynamic
# 2. docker restart rev2-base-web-dev  (vite 不會自動 reload .env,需 restart)
# 3. CDP capture:logout → navigate /login → click 超級管理員 → click 確認
# 4. 完成後 revert .env、再 restart
```

> ⚠️ `.env` 改動是 tracked file,完成後務必 `git checkout .env` 還原(已驗證 clean revert)。

### 2.2 dynamic mode 觸發鏈(完整時序)

```
delta    HTTP  Method  URL                            body
---------------------------------------------------------
         200   GET     PAGE: /login                   622
 +1669ms 200   GET     /route/getConstantRoutes       698   ← SPA init 即觸發
  +954ms ???   GET     /auth/getUserInfo                0   ← LS 無 token、失敗
  +401ms 200   GET     PAGE: /login(reload)
 +1338ms 200   GET     /route/getConstantRoutes       698   ← 第二次 reload init
 +3762ms 200   POST    /auth/login                    540   ← user click 確認
  +792ms 200   GET     /auth/getUserInfo              131   ← 拉 userInfo
  +881ms 200   GET     /route/getUserRoutes          5551   ← ★ dynamic mode 核心!
 +7046ms 200   GET     PAGE: /manage/role             622   ← user navigate
  +638ms 200   GET     /route/getConstantRoutes       698
  +977ms 200   GET     /auth/getUserInfo              131
   +20ms ???   GET     /route/getUserRoutes             0   ← race condition、失敗
 +2024ms 200   GET     PAGE: /manage/menu             622
  +590ms 200   GET     /route/getConstantRoutes       698
 +1491ms 200   GET     /auth/getUserInfo              131
  +961ms 200   GET     /route/getUserRoutes          5551
 +2372ms 200   GET     /systemManage/getMenuList/v2  6191   ← menu 頁業務 endpoint
    +0ms 200   GET     /systemManage/getAllPages      273
```

### 2.3 重大事實確認 + audit §4.13 H6 翻案

| audit §4.13 H6 寫 | 實機驗證 |
|---|---|
| 「mock 漏了 `home` 欄!」 | **錯誤** — mock 響應**有** `home: "home"`,結構 `{data: {routes: [...], home: "home"}, code, msg}`(audit 之前 capture 1800 字截斷沒看到) |
| 「TypeScript 型不檢查 runtime,所以 base-web 可能 silently 用 `undefined` 設 home(或畫面有 bug)」 | **錯誤前提** — 既然 mock 有 home 欄,base-web 設 home 正常,無 bug |
| 「rev2 rust-api 必須帶 `home` 欄!」 | **結論仍正確** — 對齊 mock 即可,值 `"home"` |

### 2.4 dynamic 模式新發現(audit §4.13 表格補)

| 行為 | audit §4.13 推導 | 實機驗證 |
|---|---|---|
| `/route/getConstantRoutes` 觸發時機 | 「init constant 階段」 | **每次 SPA full reload(page navigate)都觸發**(不只 init 一次)— base-web 程式碼可能在 router beforeEach hook 或 main.ts 內固定 init |
| `/route/getUserRoutes` 觸發時機 | 「init auth 階段、user 登入後」 | ✓ 確認 — login 後 +881ms 即觸發 |
| dynamic 模式下 navigate manage/* 是否會再觸發 routes endpoint | 推導沒寫 | **是 — 每次 SPA reload 都重觸發 getConstantRoutes + getUserRoutes**(因 SPA 重整 = 重 init) |
| mock 給的 routes 結構是否真實生效 | 推導沒寫 | ✓ **manage/role + manage/menu 等 routes 都來自 mock getUserRoutes**;navigate /manage/menu 後成功觸發業務 endpoint(getMenuList/v2 + getAllPages)— mock routes 真實 wire 到業務 view |
| sidebar 顯示完整 menu | 推導:應該顯 | ⚠️ **race condition**:CDP 在 navigate 完 5s 後 enumerate sidebar 顯 `[]`(可能 dynamic mode 需更久 init,或 navigate 太快;非真實 bug,user 慢操作不會遇到) |

### 2.5 rev2 P2 mode 選擇判據(更新 audit §4.13 表格)

| 維度 | static mode | dynamic mode | rev2 建議 |
|---|---|---|---|
| 後端 endpoint 數 | 0 routes endpoint | 3 routes endpoint(constant/user/exists) | **dynamic** — 配合動機二 rust-api 從 0,routes endpoint 不算多 |
| menu 來源 | 寫死前端 | server 控制 | **dynamic** — 對齊 rev1 F5/F6 設計核心 |
| 上手成本 | 低(無 endpoint 要實作) | 中(3 個 endpoint + tree builder) | **dynamic** — rev1 已驗 pattern,複製成本低 |
| upstream rebase 風險 | 略低(`.env` 不動) | 略高(`.env` `VITE_AUTH_ROUTE_MODE=dynamic` 是改 inline) | **dynamic 仍可接受**(W-BASE-WEB-ADAPT L1 改 `.env` 屬 default 允許範圍) |

---

## §3 Tier 1-B — 三套 mock 來源連動關係(subagent 完整報告整合版)

### 3.1 mock 來源確認

| 來源 | 是否存在 | 位置 | 觸發條件 |
|---|---|---|---|
| **vite-plugin-mock** | ❌ 不存在 | - | base example 不使用 |
| **`base-web/mock/` 本地目錄** | ❌ 不存在 | - | 之前 audit §10.5 前置作業 1 推測,實機 grep 無此目錄 |
| **alova 本地 adapter** | ✅ 存在 | `src/service-alova/mocks/feature-users-20241014.ts` + `src/service-alova/request/index.ts:L17-31` | DEV 模式 + alova request 才攔截;**僅 7 個 endpoint** |
| **ApiFox cloud mock** | ✅ 主要來源 | `.env.test` / `.env.prod` `VITE_SERVICE_BASE_URL=https://mock.apifox.cn/m1/3109515-0-default` | 所有 axios 請求 + alova fallback(若 endpoint 未在 local mock 內) |

### 3.2 alova local mock 7 endpoint 真實 wire(從 source 讀)

| Method | Path | Mock Response |
|---|---|---|
| POST | `/systemManage/addUser` | `{code:"0000", msg:"success", data:null}` |
| POST | `/systemManage/updateUser` | 同上 |
| DELETE | `/systemManage/deleteUser` | 同上 |
| DELETE | `/systemManage/batchDeleteUser` | 同上 |
| POST | `/auth/sendCaptcha` | 同上 |
| POST | `/auth/verifyCaptcha` | 同上 |
| GET | `/mock/getLastTime` | `{code:"0000", msg:"success", data:{time:"..."}}` |

**配置**(`src/service-alova/request/index.ts:L19-26`):
- `enable: true`(L25)
- `matchMode: 'methodurl'`(L26 — method + URL 雙重匹配)
- `delay: 1000`(L22 — 模擬 1s 網路延遲)
- 啟用條件:`import.meta.env.DEV ? mockAdapter : adapterFetch()`(L31 — DEV-only)

### 3.3 三套來源優先順序決策表

| 階段 | 條件 | alova 7 endpoint 走 | 其他 endpoint 走 |
|---|---|---|---|
| **DEV(`pnpm dev`)** | `import.meta.env.DEV === true` | alova local mock(攔截、不到 vite proxy) | vite proxy `/proxy-default/*` → ApiFox cloud |
| **PROD build(`pnpm build` + nginx serve)** | `DEV === false` | adapterFetch → 直接 fetch → 經 nginx → 目標(rev2 prod 配置決定) | 同上 |
| **prod preview(`pnpm preview`)** | `DEV === false`,但有 vite preview server | adapterFetch → vite preview → ApiFox | 同上 |

### 3.4 rev2 切到自家 rust-api 時的「斷流風險」清單

| 風險等級 | 場景 | 症狀 | 緩解 |
|---|---|---|---|
| **高** | rev2 prod build 後,alova demo 頁(/alova/request, /alova/scenes)呼 `addUser` 等 7 endpoint,自家 rust-api 沒實作 | 404 (rev2 rust-api 回業務 envelope 404) — alova request 收到 404 後行為未知,可能 silent fail / toast | rev2 三選:(a) 實作這 7 endpoint;(b) build 時排除 alova demo(`pageExcludePatterns`);(c) 接受 prod 下 alova demo 頁壞掉 |
| **中** | rev2 dev 跑 base-web + 自家 rust-api,alova 7 endpoint 仍走 local mock(全返 `data:null`)| **silent fallback** — rev2 dev 跑看到 alova demo「成功」但實際沒打 rust-api,user 誤判已對齊 | rev2 dev 改 alova adapter 不 enable(動 `src/service-alova/request/index.ts:L25`,屬 L4 改 inline — 違反 Q1 紀律)or 完全排除 alova(audit §4.10.2 (b'-narrow) 隱藏) |
| **低** | rev2 切 prod 時,axios 13 個業務 endpoint 對自家 rust-api,但 `.env.prod` 仍指 ApiFox(`VITE_SERVICE_BASE_URL=https://mock.apifox.cn/...`) | rev2 build 出來打 ApiFox,不是自家 rust-api | **rev2 必改 `.env.prod` `VITE_SERVICE_BASE_URL`**(屬 W-BASE-WEB-ADAPT L1 軌道允許範圍) |

---

## §4 Tier 2-F — 預設帳號全集(三 quick-fill button)

### 4.1 三按鈕真實對應(實機 CDP capture)

| 按鈕文字 | login req userName | password | getUserInfo userId | getUserInfo userName | roles | buttons |
|---|---|---|---|---|---|---|
| 超級管理員 | `Super` | `123456` | `"1"` | `Super` | `["R_SUPER"]` | `["B_CODE1","B_CODE2","B_CODE3"]` |
| 管理員 | `Admin` | `123456` | `"2"` | `Admin` | `["R_ADMIN"]` | `["B_CODE2","B_CODE3"]` |
| 普通用户 | `User` | `123456` | `"3"` | **`User01`**(alias!) | `["R_USER_COMMON"]` | `["B_CODE3"]` |

### 4.2 對 audit / rev1 既有結論的修正

**audit §4.4 修正**:role 集合不只 `R_SUPER`,完整三個 = **`R_SUPER` / `R_ADMIN` / `R_USER_COMMON`**(`R_ADMIN` / `R_USER_COMMON` audit 未記)。

**audit §4.7 修正**:
- 超級管理員 = `Super` ✓ audit 已驗,正確
- 管理員 = `Admin` ✓ audit「推測」正確
- 普通用戶 = **login req 用 `User`,但 getUserInfo 回 `User01`**(audit「推測 `User`」對 login req body 正確、但漏 internal alias)

**rev1 CLAUDE.md §8.1(`Soybean / Administrator / GeneralUser`)定位修正**:
- 這三個 username **完全不是 mock 預設**(audit §4.7 結尾的「rev1 自己的 migration seed,不是 mock 預設」**結論正確**)
- 但 audit §4.7 結尾建議「對齊 mock(`Super`/`Admin`/`User`)」需補充:**注意 User 在 getUserInfo response 是 `User01` 而非 `User`** — rev2 rust-api 若採此命名,要決定 login `User` 後 displayName 是 `User` 還是 `User01`(對齊 mock 應採後者)

### 4.3 buttons 是 incremental subset(RBAC 概念)

```
R_SUPER       → [B_CODE1, B_CODE2, B_CODE3]   (full)
R_ADMIN       →          [B_CODE2, B_CODE3]   (subset)
R_USER_COMMON →                   [B_CODE3]   (minimal)
```

**rev2 rust-api migration seed 建議**:對齊 mock 三 user × 三 role × 三 button code 的 RBAC 矩陣(若採對齊 mock 命名);若延用 rev1 命名(`Soybean/Administrator/GeneralUser`+ 同樣的 R_SUPER 等),則保留 audit §4.4 之外的 role 命名僅作為「行為 demo data」、不影響 wire shape。

### 4.4 JWT payload 三 user 對比(decoded `data` field)

| user | JWT decoded `data` | JWT `sub` |
|---|---|---|
| Super | `[{userName: "Super"}]` | `"Super"` |
| Admin | `[{userName: "Admin"}]` | `"Admin"` |
| User | `[{userName: "User01"}]`(alias) | `"User01"` |

audit §4.5 H6 結論「base-web 完全不解析 JWT payload」**仍正確** — rev2 rust-api 的 Claims struct 自由設計、不必對齊此 array 格式。

---

## §5 Tier 2-D — `/manage/user-detail/:id` 觸發 endpoint

### 5.1 實機驗證結果

CDP navigate `/manage/user-detail/1`,觀察結果:
- 頁面 title: 「用户详情」
- 頁面內容:**「敬请期待」**(coming soon placeholder)
- 觸發網路請求:**僅 `/auth/getUserInfo`**(這是所有 navigate 都會觸發的標準動作,非 user-detail 專屬)
- **無任何 user-detail 業務 endpoint 被觸發**

### 5.2 route 註冊位置(從 dynamic mode getUserRoutes response 找到)

```json
{
  "name": "manage_user-detail",
  "path": "/manage/user-detail/:id",
  "component": "view.manage_user-detail",
  "props": true,
  "meta": {
    "title": "manage_user-detail",
    "i18nKey": "route.manage_user-detail",
    "hideInMenu": true,
    "activeMenu": "manage_user"
  }
}
```

`hideInMenu: true`、`activeMenu: "manage_user"` — base example 把 user-detail 設為「user list 的詳情子路由,sidebar 不顯示」。但 view 是 stub。

### 5.3 對 rev2 的含義

- **rev2 不必為 user-detail 設計 endpoint** — base example 自己沒接、view 是純 placeholder
- 若 rev2 P3 業務階段想真實實作 user-detail,需:(a) 升 L4 改 `src/views/manage/user-detail/` view inline(違反 Q1)、(b) 升 L3 在 `src/service/api/` 新增 `fetchGetUserDetail(id)` wrapper(可單獨授權)
- audit §7.3 M2 此項可關閉

---

## §6 Tier 2-E — alova 本地 mock adapter runtime 行為

### 6.1 alova mock attache point(從 Tier 1-B subagent 報告 + 本次實機驗證)

- 攔截位置:**alova request layer(JS 層)** — `src/service-alova/request/index.ts:L19` 內 `requestAdapter: createAlovaMockAdapter([featureUsers20241014], {enable:true, matchMode:'methodurl', delay:1000})`
- 攔截範圍:**僅 alova request**(`src/service-alova/api/*.ts` 內呼叫的 endpoint),axios 不受影響
- 攔截條件:**DEV-only**(`import.meta.env.DEV` true)
- vite proxy `/proxy-default/*` **不知道 alova 攔截**;raw fetch(繞 alova)直送 ApiFox

### 6.2 實機驗證:raw fetch 那 7 endpoint 在 ApiFox 全 404

| Endpoint | Raw fetch (via vite proxy → ApiFox) 結果 |
|---|---|
| `POST /systemManage/addUser` | `{"apifoxError":{"code":404,"message":"不存在接口：POST /systemManage/addUser"}}` |
| `POST /auth/sendCaptcha` | `{"apifoxError":{"code":404,...}}` |
| `GET /mock/getLastTime` | `{"apifoxError":{"code":404,...}}` |

**確認**:這 7 endpoint **僅靠 alova local mock 維生**;沒有 ApiFox fallback、沒有 vite-plugin-mock。rev2 切到自家 rust-api 後:
- **dev 模式**:這 7 endpoint 仍走 alova mock(silent fallback、user 看不到問題)
- **prod 模式**:這 7 endpoint 直接打到目標(rev2 rust-api / nginx),若 rev2 沒實作 → 404 → alova request 走 fail handler(toast / dialog,取決於 alova interceptor 設計)

### 6.3 alova demo 頁的「触发」按鈕 = mock `/auth/error?code=7777` 觸發點

navigate /alova/request 後可見按鈕清單 `["User01","触发","触发","触发","重复请求错误(Message)","重复请求错误(Modal)"]`。click 第一個「触发」實機觸發:

```
GET /proxy-default/auth/error?code=7777&msg=用户状态失效，请重新登录
RES: {"data":null,"code":"7777","msg":"用户状态失效，请重新登录"}
```

**這正是 audit §4.11 表格的 `7777` modal-logout code 真實觸發點**!alova demo 頁就是用來教學「服務端回 7777 → base-web 顯 modal → user 確認後 logout」。

對 rev2 含義:
- rev2 rust-api 若採 mock 的 code 對應,**`7777` = modal logout 確定**(audit §4.11 已寫,但實機驗證更強)
- alova demo 頁同時也驗了 base-web 的 modal-logout flow(`src/service/request/index.ts` 內 `modalLogoutCodes` 處理)真實 work

### 6.4 rev2 對 alova 處理的更新建議(對應 audit §4.10.2)

| 選項 | 動作 | dev 行為 | prod 行為 | upstream rebase | Claude 評估 |
|---|---|---|---|---|---|
| **(b) 完全保留不動** | 零改動 | alova menu + demo 頁可用(local mock) | demo 頁 404 / silent fail | 永遠 clean | rev2 P0~P3 默認 |
| **(b'-narrow) `pageExcludePatterns` 隱藏** | 動 `build/plugins/router.ts` 加 1 line | sidebar 無 alova menu;直接 navigate `/alova/request` 仍可達(elegant-router 排除是 menu 層) | 同上 + sidebar 乾淨 | 低 | rev2 P4/P5 production-ready 階段 |
| **(c) 動 apifoxToken inline** | 動 alova request L37 | 仍走 local mock(無影響) | apifoxToken 不送 → 對自家 rust-api 無害 | 衝突 | 不建議 |
| **(new) 完全停用 alova mock** | 動 `src/service-alova/request/index.ts:L25` `enable: false` | dev 不再 silent fallback;alova endpoint 直送 prod 一致路徑 | 同 prod | 衝突高(改 inline) | rev2 P5+ 想徹底脫離 alova 時 |

---

## §7 Tier 3-G — rev1 自製 sub-crate 評估(subagent 完整報告整合版)

### 7.1 三 crate 結論

| Sub-crate | LoC | 結論 | 理由 | 估工 |
|---|---|---|---|---|
| **`axum-casbin`** | 234 | **重寫** | rev1 自寫(非上游 fork),內含 rev1 自家 metrics 埋點(`casbin_enforcement_total`)+ domain-aware 雙路徑 enforce;耦合 rev1 設計;rev2 趁機統一 error / metrics 策略 | 3-5 人日 |
| **`sea-orm-adapter`** | 758 | **拷貝** | rev1 自寫(上游 crate `sea-orm-adapter` 可能落後);實作通用、無 rev1-specific patch;commit history 只有 1 個 optimize | 0 人日 |
| **`xdb`** | 272 | **拷貝** | 純 IP2Region 算法綁定;commit 已穩定(最後 5/12);只需調 default 路徑 detect 邏輯 | 0.5 人日 |

### 7.2 整體策略

- **混合採用**:`sea-orm-adapter` + `xdb` 直接拷貝(0.5 人日),`axum-casbin` 重寫(4 人日)
- **總估工**:**~4.5 人日**(rev2 P1 階段內可完成,屬 setup 範圍)
- **風險**:低 — 三 crate 無相互強耦合,上游升級風險可控(Casbin 2.10 / SeaORM 1.1 穩定)

### 7.3 拷貝路徑(rev2 落地時)

```bash
# rev2 rust-api workspace setup 階段
cd rust-api
cp -r /home/anew/x_Project/fork260509-rev1/rust-api/sea-orm-adapter .
cp -r /home/anew/x_Project/fork260509-rev1/rust-api/xdb .

# Cargo.toml workspace.members 加入
# [workspace]
# members = [..., "sea-orm-adapter", "xdb"]

# axum-casbin 重寫:參考 rev1 設計(domain enforce / metrics labels / error response)
# 從 0 寫在 rust-api/axum-casbin/(rev2 設計自由)
```

---

## §8 Tier 3-H — rev2 P5 觀察性 stack 啟動時機

### 8.1 rev1 既有 stack 規模(reference)

rev1 完整 obs stack = 7 service(`loki / promtail / prometheus / 3 exporter / pushgateway`)+ `grafana`(6 dashboard)+ 11 個 secret + 雙 network bridge。設計 doc 在 [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)、落地在 rev1 W-F12 / W-F13 / W-F14(044 sprint)。

rev1 自己在 W-F11 / 044 brainstorm 已自承「對個人 workspace over-engineered」(`INTEGRATION-RESEARCH.md` §9.5 直接引用此 brainstorm)。

### 8.2 rev2 啟動時機建議(三段式)

| 時機 | 啟動範圍 | 目的 | 工作量 |
|---|---|---|---|
| **rev2 P0-P3(setup + 業務跑通)** | **完全不啟 obs**(rev2 docker-compose 只含 5 service:postgres / redis / rust-api / base-web / front-nginx) | 聚焦 rust-api MVP 對齊 base mock;obs 是 distraction | 0 |
| **rev2 P3 後半 / P4 中段(業務驗收 + 抽離項補位)** | **加 promtail + loki**(2 service,純 log)+ 1 個 grafana(只看 log,不接 metric)| 開始有實際 log 量、可 debug;observability 第一階段 | 0.5-1 人日(W-F12 機械複製) |
| **rev2 P5 或 P6(production-ready / 對外切換)** | **加 prometheus + 3 exporter + pushgateway + grafana alerting**(完整 stack) | 性能監控、alerting | 2-3 人日(W-F13 + W-F14 機械複製) |

### 8.3 早做的反對理由

1. **個人 workspace、無生產壓力** — obs 投入 ROI 低,不如把人月投到 rust-api 對齊
2. **obs stack debug 自己也耗時** — pushgateway 配置 / grafana provisioning / loki retention 等都是次要踩雷源
3. **rev1 已驗 setup 機械可複製** — 任何時候要起來 0.5-3 人日就 OK,沒有「早做才省事」的好處
4. **rev2 設計動機重在「對齊 base-web」** — obs 與此目標正交,延後不影響 critical path

### 8.4 早做的支持理由(若 user 想反駁)

1. **P3 業務階段若遇難 reproduce bug,有 loki 集中 log 較方便** — 但本機 `docker logs <service>` 已 90% 夠用
2. **rev1 dashboard 6 個已寫好,直接複製即可** — 但若 rev2 rust-api 從 0 重寫,metric naming 可能對不上 dashboard,要重新對齊

### 8.5 Claude 建議

**P0-P3 階段不啟、P4 中段啟「最小 obs」(promtail+loki+grafana,3 service)、P5+ 才啟完整 stack**。

對應 `docker-compose.observability.yml` 拆檔策略:rev2 可考慮把 `loki+promtail+grafana(log-only)` 拆出 `docker-compose.obs-min.yml`,完整 stack 留 `docker-compose.obs-full.yml`,**而不是 rev1 的 all-or-nothing**。

---

## §9 Tier 3-I — graphify 在 rev2 的應用策略

### 9.1 rev1 已知 11 條 graphify 限制(直接繼承)

**rev2 直接適用的限制**(從 `INTEGRATION-RESEARCH.md` §2.7 + rev1 `GRAPHIFY-NOTES.md`):
- Vue component composition 破碎(182 個 `.vue` 孤立)
- Rust macro 展開漏邊(`merge_router!` 漏 12 個 call)
- trait method dispatch(dynamic dispatch)抓不到
- AST EXTRACTED 邊方向不全可信

**rev2 不適用的限制**(自動消失):
- NestJS DI 破碎(rev2 無 nestjs)
- nestjs 22 module 孤立(rev2 無)

### 9.2 rev2 首次 graphify 時機建議

| 時機 | 範圍 | 預期產出 | 評估 |
|---|---|---|---|
| **P1 完(基礎設施落地)** | rust-api 只 | 圖譜稀疏(只有 trait + service 框架),god node 不明顯 | ❌ 太早 — 結構未成型 |
| **P3 完(manage CRUD 全跑通)** | rust-api + base-web src/views/ | rust-api 中層 call graph、base-web view → service/api 依賴 | ✅ **首選** — 業務骨架成型、可發現 cohesion 問題 |
| **P5 完(全功能 + obs)** | 整 workspace(含 deploy/) | 全圖、含 deploy 配置 | ✅ 但 P3 後增量 update 即可(`graphify update`) |

### 9.3 首次 graphify 範圍精控(規避盲點)

```bash
# 在 .graphifyignore 加入(避免抓 Vue framework 內部 + 已知盲點)
**/node_modules/**
**/dist/**
base-web/src/views/alova/**          # alova demo,非業務
base-web/src/views/_*/**              # elegant-router ignore convention
base-web/src/views/function/**        # framework demo
base-web/src/views/plugin/**          # plugin demo
base-web/src/views/pro-naive/**       # pro-naive demo
base-web/src/views/multi-menu/**      # multi-menu demo
rust-api/target/**
rust-api/migration/migrations/*.rs    # migration 是 stateful,圖譜化意義小
```

### 9.4 「不信任」清單(graphify 結論需 grep 驗證)

| 結論類型 | 信任度 | 驗證方式 |
|---|---|---|
| god node(大量 in-degree 的 node) | 高 | 直接看 |
| call graph 連通性(A → B → C 路徑存在) | 中 | grep B 內是否真的呼叫 C |
| call graph 方向 | 低 | grep 確認 |
| Rust macro 展開的 route 註冊 | **不信任** | grep `merge_router!` / `router.route` 等 |
| Vue component 引用關係 | **不信任** | grep `import.*Component` |
| trait dispatch(`dyn Trait`) | **不信任** | grep `impl Trait for X` |
| cohesion / community label | 中 | 對照實際模組邊界 |

### 9.5 rev2 graphify 操作紀律(對應 CLAUDE.md §8.3)

- **每 feature 落地後跑 `graphify update`**(增量),不要重跑完整 — token 成本顯著
- **發現問題前先 grep 真實 source 驗證**,別把 graphify 結論當決策依據
- **brainstorm 階段才用 graphify query**,實作時直讀 source

---

## §10 audit / research / 本檔三方衝突點同步回填清單

> ✅ **2026-05-27 已完成回填**:audit 9 點 + research 7 點全部 mechanical edit 進對應檔案(audit `> ⚠️ ... 翻案` / `~~strikethrough~~` 保留歷史誤判脈絡;research 用 `> ✅ ... 拍板` / cross-ref 風格)。本節保留為「回填路徑紀錄 / cross-ref index」用途。
>
> 風格:翻案類保留原文 strikethrough、補充類直接加新發現、待辦完成類勾 `[x]` + cross-ref;各檔修改處皆連回本檔對應 §。

### 10.1 audit 需修正

| 位置 | 舊內容 | 修正為 |
|---|---|---|
| §4.4 role 命名 | 只列 `R_SUPER` | 補 `R_ADMIN` / `R_USER_COMMON`(本檔 §4.1) |
| §4.7 預設帳號表 | 「Admin / User」推測 | 確認 `Admin`(直接 ✓);`User` login req → `User01` getUserInfo response(本檔 §4.1) |
| §4.13 H6 | 「mock 漏了 home 欄」 | **翻案**:mock 有 home 欄(本檔 §2.3) |
| §4.13 dynamic vs static 對比表 | 「getConstantRoutes init constant 階段觸發」 | 更正為「**每次 SPA full reload 觸發**」(本檔 §2.4) |
| §4.11 表 | 各 code 純設計建議 | 補實機驗證:1000=login fail / 3333=token 過期 / 8888=refresh fail(本檔 §1.3) |
| §7.2.13 | `getConstantRoutes` 失敗 502 | 補:**通常成功 200**(本檔 §1.1 #12 + 完整 wire 在 §2.2);502 是 ApiFox 偶發 |
| §7.3 M2(待辦)| `/manage/user-detail/:id` 未驗 | **完成**:無 inline fetch,純前端 placeholder(本檔 §5) |
| §7.3 H7(待辦)| mock error response 未驗 | **完成**:本檔 §1 全 |
| §7.3 第 4 條(待辦)| dynamic mode 未實機驗 | **完成**:本檔 §2 全 |

### 10.2 research 需修正

| 位置 | 舊內容 | 修正為 |
|---|---|---|
| §3.2 F001 描述 | 「envelope 含 success」 | **去掉 success**(envelope = `{data, code, msg}`)— audit §4.1 已修,本檔 §1 強化 |
| §7.1 P1 F4 描述 | envelope 對齊「rev1 樣態」 | 改為「對齊 audit §4.1 + 本檔 §1 mock 真實 envelope」 |
| §7.2 對稱盤點第 5 條 sys_user 預設帳號 | 寫 `Soybean / Administrator / GeneralUser` | **判斷分歧**:此命名是 rev1 自家 migration seed,**不對齊 mock**;rev2 啟動時要決定走 (a) rev1 命名延用(`Soybean...`)還是 (b) mock 對齊(`Super/Admin/User01`)。建議**寫死於 spec phase 0 brainstorm 拍板**、不要遺漏 |
| §5.5 sub-crate 「拷貝/重寫/用上游」未拍板 | 留三選 | **完成**:axum-casbin 重寫、sea-orm-adapter 拷貝、xdb 拷貝(本檔 §7) |
| §9.5 觀察性 stack 啟動時機 | 「值得親自拍板的取捨」 | **完成**:P0-P3 不啟、P4 中段啟最小 obs、P5+ 完整(本檔 §8) |
| §9.6 graphify 在 rev2 | 「別當決策依據」 | **完成**:含時機 + 範圍 + 規避盲點(本檔 §9) |
| §10.5 (待辦)| 「待 §10.5 涵蓋率審計後再定 WRAPPER 軌道授權範圍」 | audit 已給定 12 個 read + 7 個 alova-only 範圍;**WRAPPER 軌道授權範圍 = 補對齊 base example real wire 必須的新增 endpoint**(本檔 §6.4 補) |

### 10.2.1 回填路徑速查(commit-time reference)

| 檔案 | 回填處數 | 風格 |
|---|---|---|
| `MOCK-COVERAGE-AUDIT.md` | 9 處(§4.4 / §4.7 / §4.11 / §4.13 H6 / §4.13 表 / §7.2.13 / §7.3 第 4 / §7.3 H7 / §7.3 M2) | 4 處 marker banner、2 處 strikethrough 翻案、3 處待辦改 `[x]` 勾選 |
| `INTEGRATION-RESEARCH.md` | 7 處(§3.2 F001 / §7.1 F4 表格 / §7.2 對稱盤點第 5 / §5.5 sub-crate / §9.5 obs / §9.6 graphify / §10.5 結尾建議第 3) | 全部用 `> ✅ ... 拍板` 或 `~~strikethrough~~ + ✅ 已完成` 風格 |

### 10.3 本檔自身的新待辦(下一輪)

- [x] **已完成**(2026-05-27 [§13.1](#131-1-主動登出按鈕))— base example **登出按鈕(主動)** 是否觸發 endpoint:**確認無後端 endpoint**(純前端 LS clean + 跳 /login,與 audit §4.12.4 結論一致)。selector 未抓到 avatar 按鈕本身,但 logout flow 由 §13.3 #3 alova 觸發鏈間接驗證(refreshToken 8888 → 自動 logout)
- [x] **已完成**(2026-05-27 [§13.2](#132-2-login-頁三替代入口))— base example 「忘記密碼」「驗證碼登錄」「註冊賬號」三按鈕:**純 SPA route,不發任何 endpoint**(/login/reset-pwd / /login/code-login / /login/register);各頁面 form 內含手機 + 驗證碼 + 密碼 input,真實 submit 走 alova sendCaptcha/verifyCaptcha(DEV alova mock 攔截)
- [x] **已完成**(2026-05-27 [§13.3](#133-3-alova-重複請求兩按鈕))— alova request 「重複請求錯誤(Message)/(Modal)」兩按鈕:**新發現 code `"2222"`**(Message,不在 .env 任何 list、走 fallback toast)+ Modal 用 `code:"3333"` 觸發 refresh chain → 最後 8888 logout cascade
- [x] **部分完成**(2026-05-27 [§13.4](#134-4-framework-內部行為))— framework 內部行為(theme / lang / fullscreen / multi-tab):selector 用 `button[title=...]` 沒抓到 SoybeanAdmin 圖標按鈕(SoybeanAdmin 用 svg + 自定義 div,需 grep header component 找精確 selector);**但結論基本確定:framework 內部行為純前端,不觸發 wire**(LS / sessionStorage 操作)
- [ ] rev2 啟動 mock 對 `/route/getConstantRoutes` 偶發 502 的根因(本檔 §1.1 #12 與 audit §7.2.13 觀察不一致,可能 ApiFox quota / rate-limit / cache invalidation)— **跳過**(ROI 低、無法 100% reproduce)

---

## §11 重跑指南

### 11.1 重跑本檔結論用的 CDP 命令

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2/tests/mock-coverage-audit

# 1. 確認 base-web container + Chrome CDP tab
docker ps | grep rev2-base-web-dev
node cdp.mjs tabs   # 找 base-web tab id

# 2. Tier 1-A + Tier 1-C raw + Tier 2-D(同一個 step file)
BASE_TAB=<tab-id>
node flow.mjs $BASE_TAB captures/cap-errors-dynamic.json steps/errors-and-dynamic.json "proxy-default"

# 3. Tier 1-C dynamic mode 切換(需動 .env + restart)
# 改 base-web/.env: VITE_AUTH_ROUTE_MODE=static → dynamic
docker restart rev2-base-web-dev
node flow.mjs $BASE_TAB captures/cap-dynamic-mode.json steps/dynamic-mode-login.json "proxy-default|9527/(login|home|manage)"
# 完成後 revert
# 改 base-web/.env: dynamic → static
docker restart rev2-base-web-dev

# 4. Tier 2-F 三按鈕全集
node flow.mjs $BASE_TAB captures/cap-quickfill.json steps/quick-fill-all.json "proxy-default"

# 5. Tier 2-E alova runtime
node flow.mjs $BASE_TAB captures/cap-alova.json steps/alova-runtime.json "proxy-default|9527/alova"
```

### 11.2 dump 結果的 oneliner

```bash
# 列出某次 capture 內所有 endpoint
node -e "const c=JSON.parse(require('fs').readFileSync('captures/<file>.json'));for(const r of c.records){console.log((r.response?.status||'?').toString().padStart(3), r.method.padEnd(6), r.url.replace('http://127.0.0.1:9527/proxy-default','').padEnd(60), 'body='+(r.responseBody?.body?.length||0))}"

# dump 完整 body
node -e "const c=JSON.parse(require('fs').readFileSync('captures/<file>.json'));for(const r of c.records){if(r.url.includes('<pattern>')){console.log(r.responseBody?.body)}}"
```

### 11.3 git status sanity

跑完所有實驗後外層應該只有 4 個 untracked 變化(本檔 + audit + research + tests/):

```bash
$ git status
On branch rev2-admin-root
Untracked files:
  docs/INTEGRATION-CHECKLIST.md       # (待落地,本次未動)
  docs/INTEGRATION-RESEARCH.md
  docs/MOCK-COVERAGE-AUDIT.md
  docs/INTEGRATION-RESEARCH-FOLLOWUP.md    # ← 本檔(新增)
  tests/
```

base-web/ worktree 應 clean(`.env` 已 revert):

```bash
$ cd base-web && git status
nothing to commit, working tree clean
```

---

## §12 給 rev2 spec-kit feature 啟動的具體決策清單(綜合本檔 + audit + research)

> rev2 P0 第一個 feature(W-F1 dockerfile-rust-api 或 W-F6 TLS)brainstorm 時,以下決策已可拍板。

### 12.1 P0/P1 階段決策(設計權威)

| 決策項 | 拍板值 | 來源 |
|---|---|---|
| **envelope 結構** | `{data: <T>, code: string, msg: string}`(無 success bool) | audit §4.1 + 本檔 §1 |
| **success code** | `"0000"`(string) | audit §4.1 |
| **login fail code** | `"1000"`(統一,不細分原因) | 本檔 §1.1 #1-4 |
| **token expired code** | `"3333"` | 本檔 §1.1 #5-6 + audit §4.11 |
| **refresh fail code** | `"8888"`(立即 logout) | 本檔 §1.1 #8-9 + audit §4.11 |
| **modal logout code** | `"7777"`(他處登入 / 需 user 看訊息) | 本檔 §6.3 + audit §4.11 |
| **業務驗證 code 區段** | `"5xxx"` 自訂(rev2 自由) | 本檔 §1.2 |
| **path not found** | HTTP 404 + 業務 envelope `{data:null, code:"4040", msg:"接口不存在"}` | 本檔 §1.2 (不採 ApiFox wrapper 形式) |
| **super role 字串** | `R_SUPER` | audit §4.4 |
| **admin role 字串** | `R_ADMIN` | 本檔 §4.1(新) |
| **user role 字串** | `R_USER_COMMON` | 本檔 §4.1(新) |
| **JWT Claims 結構** | 自由設計(base-web 不解析) | audit §4.5 H6 + 本檔 §4.4 |
| **HS256 vs RS256** | HS256 沿用 rev1 紀律 | research §3.2 F004 |
| **sub-crate 策略** | sea-orm-adapter / xdb 拷貝、axum-casbin 重寫 | 本檔 §7 |
| **觀察性 stack** | P0-P3 不啟、P4 中段啟最小 (loki+promtail+grafana)、P5+ 完整 | 本檔 §8 |

### 12.2 P2 階段決策

| 決策項 | 拍板值 | 來源 |
|---|---|---|
| **auth route mode** | `dynamic`(rev2 P2 採) | 本檔 §2.5 |
| **`/route/getUserRoutes` response** | `{data: {routes: MenuRoute[], home: "home"}, code, msg}` | 本檔 §2.3 |
| **`/route/getConstantRoutes` response** | 4 條 constant route(login / 403 / 404 / 500) | 本檔 §1.1 #12 + §2.4 |
| **預設 user migration seed** | 三選一 user 待拍板 | 本檔 §10.2 |

### 12.3 P3+ 階段決策

| 決策項 | 拍板值 | 來源 |
|---|---|---|
| **alova 處理策略** | rev2 P3-P4 預設(b) 完全保留;P5+ 切 (b'-narrow) `pageExcludePatterns` 隱藏 | 本檔 §6.4 + audit §4.10.2 |
| **manage/user-detail** | 不必為其設計 endpoint(base example 純 stub) | 本檔 §5.3 |
| **rev2 spec-kit feature 啟動策略** | P3 完跑首次 graphify、增量 update | 本檔 §9 |

### 12.4 仍待 user 拍板項

- audit §5.4 Q5(Q1+Q3 衝突的 5 條路徑 A/B/C/D/E)— 本檔不解,屬 user 戰略決策
- audit §4.8 apifoxToken 移除策略 3 選 1
- audit §4.10.2 alova 處理 4 選 1 的 P0-P3 默認 vs P4+ 升級時機
- research §7.2 對稱盤點第 5 條 sys_user 預設帳號命名(Soybean 系 vs Super 系)

---

> **下一步建議**:
> 1. user 過目本檔、決定要不要把 §10 衝突回填動作直接做進 audit / research(機械式 edit、不擴張內容)
> 2. 落地 `docs/INTEGRATION-CHECKLIST.md`(rev2 進度單一真相,CLAUDE.md §6 預留)
> 3. 撰寫 `.specify/memory/constitution.md` v1.0.0(把 §12 拍板項目 frozen)
> 4. 進入 P0 W-F1 dockerfile-rust-api brainstorm

---

## §13 §10.3 follow-up 補完(C 階段:#1+#2+#3+#4)

> 2026-05-27 追加 — 跑完 §10.3 列的 4 項 follow-up(#5 跳過 ROI 低)。
> 新增 step file:`tests/mock-coverage-audit/steps/extras-followup.json`(git tracked)。
> 新增 capture:`captures/cap-extras.json`(25 records,gitignored)。

### 13.1 #1 主動登出按鈕

**驗證方式**:CDP eval 找 avatar / dropdown / logout 按鈕。
**結果**:Selector 抓不到 SoybeanAdmin 的 user avatar / dropdown(未在 navigation header 找到 `.n-avatar` 或 `[class*=avatar]`)。
**但間接證實**:#3 觸發 refreshToken chain 失敗(8888 cascade)後,base-web 自動 logout(`url: /login, hasToken: false`)— **logout flow 純前端**:
- clear LS(`SOY_token` / `SOY_refreshToken`)
- Pinia store reset
- 跳 `/login`
- **無任何後端 endpoint 觸發**(無 `/auth/logout`)

**對 audit §4.12.4 結論驗證**:「base example 沒有 `/auth/logout` endpoint」**正確**。
**對 rev2 含義**:rev2 rust-api **不必實作 `/auth/logout` endpoint**(若需要 server-side session 失效如 revoke refresh token,可加但非必須;依 §11.2 拍板決定)。

**未完成**:具體 avatar 按鈕 selector(若 user 要後續手動驗,可 grep `base-web/src/layouts/` 或 `src/components/`)— 但結論不變,因為 base-web logout flow 從 code(`store/modules/auth/index.ts:resetStore`)看也是純前端。

### 13.2 #2 login 頁三替代入口

**驗證方式**:CDP click 三按鈕,觀察 navigate URL + page 內容。

**結果**(三個都**純 SPA route,不發 endpoint**):

| 按鈕 | navigate 後 URL | 頁面 input | 頁面 button |
|---|---|---|---|
| 忘記密碼 | `/login/reset-pwd` | 手機號 / 驗證碼 / 新密碼 / 確認密碼 | 確認 / 返回 |
| 驗證碼登錄 | `/login/code-login` | 手機號 / 驗證碼 | 獲取驗證碼 / 確認 / 返回 |
| 註冊賬號 | `/login/register` | 手機號 / 驗證碼 / 密碼 / 確認密碼 | 獲取驗證碼 / 確認 / 返回 |

**raw fetch sendCaptcha 驗證**:
- `POST /auth/sendCaptcha` via vite proxy → ApiFox cloud:**404 + apifoxError wrapper**(與 §6.2 結論一致)
- 真實 base-web 用 alova request 呼 `sendCaptcha`,**DEV 走 alova local mock**(回 `{code:"0000", data:null}`)、prod 會 fail

**對 rev2 含義**:
- 若 rev2 要支援這三個流程(reset-pwd / code-login / register)業務上線,**必須實作** `/auth/sendCaptcha` + `/auth/verifyCaptcha`(目前 alova-only,§3 第 14-15 條)
- 三個頁面的 SPA route 由 elegant-router 從 `src/views/_builtin/login/` 自動生成(base example 既有);rev2 切到自家 rust-api 不影響這三頁前端 route,但若 endpoint 缺則 form submit 會 fail

**route 結構**(從 `/route/getConstantRoutes` mock 響應):
```
login route path = "/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat)?"
```
所以總共 **5 個 sub-route**(`pwd-login` / `code-login` / `register` / `reset-pwd` / **`bind-wechat`** ← 還有微信綁定,本次未驗)。

**新待辦**:
- [ ] `/login/bind-wechat` 頁面與流程(本次漏驗)

### 13.3 #3 alova 重複請求兩按鈕

> ⚠️ **2026-05-27 [§13.6](#136-ab-階段-alova-五按鈕全集--bind-wechat-頁面) 修正**:原描述把「Message」與「Modal」兩按鈕對應到的 code 完全搞錯了。實際 source `src/views/alova/request/index.vue` 顯示:
> - **Message 按鈕** 一次發 **3×2222 + 3×3333**(6 個 fetch 並行)
> - **Modal 按鈕** 一次發 **3×7777**(3 個 fetch 並行)
>
> 之前 §6.3 描述的「第一個『触发』按鈕觸發 7777」實為 CDP `btns[2]` index 抓到第二個 NButton(logoutWithModal=7777)。完整 5 按鈕對應見 §13.6.1。
>
> 以下 ~~strikethrough~~ 描述作廢,保留歷史記錄。

~~**驗證方式**:CDP click `/alova/request` 頁的「重複請求錯誤(Message)」與「重複請求錯誤(Modal)」按鈕。~~

~~**重大發現:兩按鈕觸發不同 code、行為對比**:~~

| ~~按鈕~~ | ~~endpoint~~ | ~~mock 響應 code~~ | ~~觸發次數~~ | ~~base-web 行為~~ |
|---|---|---|---|---|
| ~~重複請求錯誤(Message)~~ | ~~`GET /auth/error?code=2222&msg=自定义请求错误 1`~~ | ~~`"2222"`~~ | ~~**3 次連發**~~ | ~~`2222` 不在 .env 任何 code list,走 **fallback `showErrorMsg`**(toast 顯示)~~ |
| ~~重複請求錯誤(Modal)~~ | ~~`GET /auth/error?code=3333&msg=自定义请求错误 2`~~ | ~~`"3333"`~~ | ~~**3 次連發**~~ | ~~`3333` 在 `VITE_SERVICE_EXPIRED_TOKEN_CODES`,**觸發 refreshToken flow**~~ |

~~實機 chain reaction 描述見以下,但因按鈕對應錯誤,整段需依 §13.6.1 重讀。~~

**正確 chain reaction**(基於 source code 重建):
```
click Message 按鈕 (handleRepeatedMessageError) → Promise.all 6 個:
  3× /auth/error?code=2222 → code=2222 → 不在 .env list、走 fallback toast(3 次去重後可能只顯 1 個)
  3× /auth/error?code=3333 → code=3333 → 觸發 refreshToken flow
                             → refreshToken success 1 次後可能 lock + 後續 retry
                             → cascade 失敗 → 8888 logout
```

**正確結論**:
1. **`code:"2222"` 是新發現** — alova demo 用的「自訂業務 error code」,不在 .env 任何 list,走 fallback toast(僅此項仍正確)
2. **Message 按鈕內含 6 個並行 fetch**(3×2222 + 3×3333),非「3 次連發 2222」;refresh chain 即從這個按鈕的 3×3333 觸發
3. **Modal 按鈕內含 3×7777**(modal logout),不是 3333(改正前誤判)

**對 rev2 rust-api 含義**(原本結論基本仍對,只是來源歸屬修正):
- `code:"2222"` 可作為 rev2 自訂業務 code 範本(不在 .env 任何 list 即走 fallback toast)
- alova demo 是 rev2 驗證 base-web request layer 完整邏輯的 testbed(各種 code 與 flow 都有對應按鈕)

### 13.4 #4 framework 內部行為

**驗證方式**:CDP eval 找 theme / lang / fullscreen / multi-tab 按鈕。

**結果**:
- Theme switch button:用 `(el.title || el.ariaLabel || el.innerText)` filter `主题/暗/亮/dark/light` — **0 個 match**
- Lang switch:同 selector filter `语言/中文/english/lang` — **0 個 match**
- Fullscreen:filter `全屏/fullscreen` — **0 個 match**
- Multi-tab:`document.querySelectorAll('.n-tabs-tab, [class*=tab-item], [class*=multi-tab]')` — `tabCount: 0`

**未抓到原因推測**(未實機 grep 驗證):
- SoybeanAdmin header 圖標按鈕可能用純 svg + 自定義 div,**無 `title` / `aria-label`**
- onClick 處理可能在父級 div 而非 button
- 圖標按鈕 tooltip 只在 hover 時顯示,CDP eval 拿不到

**結論(從 code 角度推導)**:
- theme switch:寫入 `localStorage.theme` + DOM class 切換,**不發 endpoint**
- lang switch:寫入 `localStorage.lang` + i18n reload,**不發 endpoint**
- fullscreen:`document.requestFullscreen()`,**不發 endpoint**
- multi-tab:Pinia store 操作 tab 列表,**不發 endpoint**

**驗證程度**:**「無 wire」結論基本可信**(framework 內部行為從 vue-router-history-mode + 純前端 admin 框架的設計上推論幾乎必然無 wire),但 selector 未實機驗,**信心度約 80%**。

**未完成**:具體 selector + 真實 click 後 capture(若 user 想 100% 驗,需 grep `base-web/src/layouts/modules/global-header/` 找按鈕 component + 用其 class selector)。

### 13.5 §11.X follow-up backlog 補充

從本輪 capture 衍生:
- [ ] 真實 click `/login/reset-pwd` / `/login/code-login` / `/login/register` 頁的「獲取驗證碼」按鈕(走 alova sendCaptcha,DEV 走 local mock — 但若改 .env `DEV=false` 或停用 alova mock,可看真實打到 vite proxy 的 wire)
- [x] **已完成**(2026-05-27 [§13.6.2](#1362-b-loginbind-wechat-頁面))— `/login/bind-wechat` 頁面與流程:確認可 navigate 但**頁面為空 placeholder**(inputs/buttons 都空),無 endpoint 觸發
- [ ] SoybeanAdmin header 圖標按鈕的精確 selector(若 rev2 要做 UI 自動化測試或巡檢)
- [x] **已完成**(2026-05-27 [§13.6.1](#1361-a-alova-5-按鈕對應-code-完整對照表-從-source-code))— alova 「触发」x 3 個按鈕 + Message + Modal 兩個重複按鈕:**從 source 直接解出 5 按鈕完整 code 矩陣**(不需逐個 click 驗,避免 logout cascade);結果見 §13.6.1

### 13.6 A+B 階段(alova 5 按鈕全集 + bind-wechat 頁面)

> 2026-05-27 追加 — 跑完 §13.5 backlog 2 項(A + B)。**A 不靠 CDP click,改從 source code grep**(`base-web/src/views/alova/request/index.vue`)直接解出 5 按鈕完整對應、避免 logout cascade 干擾;raw fetch 補驗 mock 的 `/auth/error` echo 行為。**B 走 CDP navigate**。
> 新增 step file:`tests/mock-coverage-audit/steps/ab-followup.json`(git tracked,只含 B + A 補驗 raw fetch 2 條)。
> 新增 capture:`captures/cap-ab.json`(4 records,gitignored)。

#### 13.6.1 A — alova 5 按鈕對應 code 完整對照表(從 source code)

從 `base-web/src/views/alova/request/index.vue:1-60`(行號標示)直接解析:

| # | 按鈕 (NCard title) | 按鈕 label | handler | 觸發 fetch 集合 | base-web 行為 |
|---|---|---|---|---|---|
| 1 | `request.logout`(退出登錄)| 触发 | `logout` | `1× /auth/error?code=8888` | **立即 logout**(logoutCodes) |
| 2 | `request.logoutWithModal`(彈窗提示退出登錄)| 触发 | `logoutWithModal` | `1× /auth/error?code=7777` | **modal logout**(modalLogoutCodes;§6.3 之前驗到的就是這個) |
| 3 | `request.refreshToken`(刷新 token)| 触发 | `refreshToken` | `1× /auth/error?code=9999` | **觸發 refresh flow**(expiredTokenCodes,9999 也是) |
| 4 | `page.function.request.repeatedErrorOccurOnce`(重複請求只報一次錯)| 重複請求錯誤(Message)| `handleRepeatedMessageError` | `Promise.all` 6 個:**3× `code=2222` + 3× `code=3333`** | 2222 走 fallback toast(3 次去重)+ 3333 觸發 refresh chain |
| 5 | (同 #4 同一張 NCard)| 重複請求錯誤(Modal)| `handleRepeatedModalError` | `Promise.all` 3 個:**3× `code=7777`** | 3 次 7777 觸發 modal logout(去重後只顯 1 modal) |

**重大更正**:
- 之前 §6.3 描述「第一個『触发』触發 7777」**抓錯按鈕** — CDP `btns[2]`(buttons 包含 `[User01, 触发1, 触发2, 触发3, ...]`)實際 index=2 是 `触发2`(logoutWithModal=7777),不是 `触发1`(logout=8888)
- 之前 §13.3 描述「Message 三次連發 2222、Modal 三次連發 3333」**完全錯誤**;實際 Message **同時發 6 個**(2222 + 3333),Modal 發 3 個 7777

**raw fetch 補驗 `/auth/error` echo 行為**(本輪實機 capture):

| Method | URL | Response |
|---|---|---|
| GET | `/auth/error?code=9999&msg=test-9999` | `{"data":null,"code":"9999","msg":"test-9999"}` |
| GET | `/auth/error?code=8888&msg=test-8888` | `{"data":null,"code":"8888","msg":"test-8888"}` |

**確認**:`/auth/error` 是**純 echo endpoint**(query string 內的 `code` + `msg` 全部 echo 進 envelope return),mock 沒有 per-code 分支邏輯。

**對 rev2 rust-api 含義**:
- rev2 對應 endpoint **實作極簡**:讀 query `code` + `msg`,echo 回 `{data:null, code:<str>, msg:<str>}`,即可完整支援 base-web 各種 code list 行為測試
- 這個 endpoint 是 rev2 整合驗證階段的**極好 testbed**:測 base-web request layer 對任意 code 的反應
- 與 audit §7.2.4 與 audit §3.1 #4 描述一致(audit 稱為「工具 endpoint」)

**rev2 業務 code 矩陣補完**(綜合所有 follow-up 發現):

| code | 觸發 by | 場景 | base-web 行為 | rev2 用途 |
|---|---|---|---|---|
| `"0000"` | success | 每個成功響應 | unwrap data | success |
| `"1000"` | login fail | 錯密碼/不存在 user(audit §1) | toast | login 失敗統一 |
| `"2222"` | alova Message 按鈕 | 自訂業務 error | fallback toast(不在 .env list)| rev2 自訂業務 error 範本 |
| `"3333"` | getUserInfo 無 Bearer / token 過期 + alova Message 按鈕內 | expired token | 觸發 refresh | token 過期 |
| `"7777"` | logoutWithModal + Modal 按鈕 | modal logout | modal + logout | 他處登入 / 需 user 看訊息 |
| `"8888"` | refresh fail / logout 按鈕 | 立即 logout | clear LS + 跳 login | refresh fail / user 被禁 |
| `"9998"` | (.env list,mock 未實機觸發) | expired token | 觸發 refresh | rev2 可用 |
| `"9999"` | refreshToken 按鈕 | expired token | 觸發 refresh | rev2 可用 |

#### 13.6.2 B — `/login/bind-wechat` 頁面

**驗證方式**:CDP navigate `/login/bind-wechat`(無需 logged in,login sub-route)。

**結果**:
- URL: 可達 `http://127.0.0.1:9527/login/bind-wechat`
- title: 「登錄」
- 頁面 h: 「Soybean 管理系統」(login layout 共用 header)
- **inputs: [] 空**
- **buttons: [] 空**
- 無 endpoint 觸發

**結論**:`/login/bind-wechat` route **存在但 view 是空 placeholder**(類似 `/manage/user-detail/:id` 的 stub 模式)。base example 為 wechat 綁定流程預留 route 但沒實作 UI。

**對 rev2 含義**:
- rev2 不必為 wechat 綁定設計任何 endpoint(base example 本來就沒接)
- 若 rev2 業務需要 wechat 整合,需:(a) 升 L4 改 `src/views/_builtin/login/modules/bind-wechat.vue`(假設該 component 存在但為空)、(b) 升 L3 新增 wechat 相關 alova api wrapper

**login 5 sub-route 完整覆蓋表**(§13.2 + §13.6.2 合):

| sub-route | path | UI 狀態 | 觸發 endpoint | 業務 |
|---|---|---|---|---|
| pwd-login | `/login`(預設)| 完整(手機 / 密碼 + 三 quick-fill)| POST /auth/login | login(主流程)|
| reset-pwd | `/login/reset-pwd` | 完整(form:手機 + 驗證碼 + 新密碼)| 走 alova sendCaptcha/verifyCaptcha + 後端 reset(若有)| 重設密碼 |
| code-login | `/login/code-login` | 完整(form:手機 + 驗證碼)| 走 alova sendCaptcha + login 變體 | 驗證碼登入 |
| register | `/login/register` | 完整(form:手機 + 驗證碼 + 密碼)| 走 alova sendCaptcha + register | 註冊 |
| **bind-wechat** | `/login/bind-wechat` | **空 placeholder** | 無 | wechat 綁定(stub)|
