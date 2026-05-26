# tests/mock-coverage-audit/

> CDP-driven 工具,給 [`docs/MOCK-COVERAGE-AUDIT.md`](../../docs/MOCK-COVERAGE-AUDIT.md) 取材用。
>
> 對應 [`docs/INTEGRATION-RESEARCH.md` §10.5](../../docs/INTEGRATION-RESEARCH.md) 的 CDP 驗證任務。
>
> **建立日期**:2026-05-26 / **作者**:Claude(Opus 4.7,1M context) + miso168net

---

## 1. 目錄結構

```
mock-coverage-audit/
├── README.md                ← 本檔
├── cdp.mjs                  ← CDP control helper(tabs / eval / navigate / capture / cookies / screenshot)
├── flow.mjs                 ← Orchestrator — 啟用 Network 監聽,依 steps file 序列執行動作,即時抓 response body
├── steps/                   ← 動作腳本(JSON)
│   ├── login.json           ← 登入流程(click 超級管理員 → 確認)
│   ├── tour.json            ← Menu 遍歷 + raw fetch 13 endpoint(未帶 apifoxToken,500/200 混合)
│   └── raw-fetch.json       ← Raw fetch 13 endpoint(帶 apifoxToken,12 個 200 + 1 個 502)
├── captures/                ← 上次 capture 結果(JSON,~300KB)*
│   ├── cap-login.json
│   ├── cap-tour.json
│   └── cap-raw.json
└── screenshots/             ← 上次截圖(PNG,~1.1MB)*
    └── shot-*.png

* captures/ 與 screenshots/ 為一次性產物。建議 gitignore(本 README §5 提供建議)。
```

## 2. 環境要求

- **Node.js ≥ 22**(用 native global `WebSocket`,Node 22 開始 stable)
- **Edge / Chrome / Chromium** 啟動時加 `--remote-debugging-port=9229`(或對應 user data dir 跑 dev session)
- **base-web dev container** 跑著(`docker compose -f docker-compose.base-web.yml --profile dev up -d`)
- Browser 內有兩個 tab:
  1. `http://127.0.0.1:9527/` — base-web dev SPA
  2. `https://s.apifox.cn/35c8727a-d3ab-47e9-8863-ef8e37df6887` — ApiFox `soybean-admin-mock` doc

## 3. 怎麼跑

### 3.1 列出當前 page tabs(取 tab id)

```bash
cd tests/mock-coverage-audit
node cdp.mjs tabs
```

輸出範例:
```json
[
  { "id": "1EB0A290B8759A34237ADB6CAA4A5806", "title": "首页", "url": "http://127.0.0.1:9527/home" },
  { "id": "BC1D15D21828E3F2BD55F6FA6437E67F", "title": "...soybean-admin-mock", "url": "https://s.apifox.cn/..." }
]
```

> 每次 Chrome 重啟 tab id 都會變 — 跑前先 list 一次。下面用 `$BASE_TAB` / `$APIFOX_TAB` 代稱。

### 3.2 base-web login + tour + raw-fetch 三段

```bash
BASE_TAB=<從 tabs 取得>
# Phase 1 — 登入
node flow.mjs $BASE_TAB captures/cap-login.json steps/login.json "proxy-default|apifox|127\\.0\\.0\\.1:9527/api"

# Phase 2 — Menu 遍歷 + raw fetch(未帶 apifoxToken,raw fetch 會 500)
node flow.mjs $BASE_TAB captures/cap-tour.json steps/tour.json "proxy-default"

# Phase 3 — Raw fetch 帶 apifoxToken(12 個 200,1 個 502)
node flow.mjs $BASE_TAB captures/cap-raw.json steps/raw-fetch.json "proxy-default"
```

### 3.3 一次性 eval(快速 probe)

```bash
node cdp.mjs eval $BASE_TAB "document.title"
node cdp.mjs eval $BASE_TAB "Object.keys(localStorage)"
node cdp.mjs screenshot $BASE_TAB screenshots/now.png
```

### 3.4 解讀 capture JSON

每個 record 包含:
- `method`、`url`、`type`(Document/XHR/Fetch/Script/...)
- `requestHeaders`(完整 — 含 axios 自動加的 `apifoxToken`)
- `requestBody`(POST/PUT 才有)
- `response.{status, statusText, mimeType, headers, remoteIP}`
- `responseBody.{body, base64Encoded, error}` — `loadingFinished` 事件當下即時抓(CDP 已知:延後抓會 lose body)

過濾範例:
```bash
node -e "const c=JSON.parse(require('fs').readFileSync('captures/cap-raw.json'));for(const r of c.records){console.log(r.response?.status, r.method, r.url)}"
```

## 4. 關鍵注意事項

### 4.1 ApiFox token

base-web 的 axios interceptor 自動帶 header `apifoxToken: XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2`(這個 token 是 mock 公開的、不是 secret)。raw `fetch()` 沒這個 header 會被 ApiFox 401 擋 —— `steps/raw-fetch.json` 已硬編碼帶上。

rev2 切到自家 rust-api 後,要找出並改掉這個注入點(可能在 `base-web/src/service/request/` 或 vite proxy `configure` hook)。

### 4.2 vite dev proxy

`/proxy-default/*` → 重寫掉 prefix → forward 到 `VITE_SERVICE_BASE_URL`(.env.test / .env.prod 設為 `https://mock.apifox.cn/m1/3109515-0-default`)。

切到本地 rust-api 時改 `base-web/.env.*` 的 `VITE_SERVICE_BASE_URL` 即可,**不必動 vite.config.ts**。

### 4.3 預設帳號

base example mock 的 quick-fill 對應(非 rev1 的 `Soybean/Administrator/GeneralUser`):

| 按鈕 | userName | password |
|---|---|---|
| 超級管理員 | `Super` | `123456` |
| 管理員 | `Admin`(推測) | `123456` |
| 普通用戶 | `User`(推測) | `123456` |

### 4.4 wire ground truth(摘要,完整見 docs/MOCK-COVERAGE-AUDIT.md §4)

- envelope:`{data, code, msg}` —— **無 `success` bool**
- `code`:string `"0000"`(success)/ string 其他(error,例 `"8888"`)
- super role:`R_SUPER`
- Authorization:`Bearer <jwt>`
- id 型在不同 endpoint **不一致**(string vs number 並存)

### 4.5 已知限制

- `Network.getResponseBody` 必須在 `loadingFinished` 事件當下抓,延後就失效 → `flow.mjs` 已改寫即時抓
- WebSocket 在 Node 24 是 native global,無需 `ws` 套件
- ApiFox cloud mock 對 rate-limit 不明,操作間 sleep 1.5~2 秒安全
- screenshot path 在 step file 內為相對路徑(`./screenshots/shot-*.png`),從 `tests/mock-coverage-audit/` 目錄執行才會正確解析

## 5. 建議的 .gitignore(若要 commit 本目錄)

`tests/mock-coverage-audit/.gitignore`:
```
captures/
screenshots/
```

→ 只追蹤程式碼(`*.mjs` + `steps/*.json` + `README.md`),capture 與 screenshot 是一次性產物(重跑會覆寫)。

若想留一份「基準 capture」供日後對照,可改為:
```
captures/*.json
!captures/baseline-*.json
screenshots/*.png
!screenshots/baseline-*.png
```
(然後手動 rename 想留的檔為 `baseline-*`。)

## 6. 後續延伸驗證 TODO(對應 docs/MOCK-COVERAGE-AUDIT.md §7.3)

- [ ] 完整截到 paginated wrapper 結構(`total` / `current` / `size` / `pages`)— 重做 raw fetch capture 並把 body slice 加長到 4000 字
- [ ] grep base-web 程式碼找 `apifoxToken` 注入點
- [ ] 切 `.env.test` `VITE_AUTH_ROUTE_MODE=dynamic` 重 capture,確認 `/route/getUserRoutes` 是否在 navigate 階段自動觸發 + 看 dynamic 流程的完整 endpoint 順序
- [ ] 探 ApiFox 上「项目配置 / REST 風格」endpoint 的具體 path 與 schema
- [ ] 確認 `getMenuList` v1 與 v2 差異(mock 上兩個都有,base example 只用 v2)
