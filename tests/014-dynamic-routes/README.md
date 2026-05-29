# 014-dynamic-routes — CDP dynamic-mode browser smoke

feature 014 的 US1 瀏覽器端到端驗收腳本(D8 / SC-001):base-web 翻 dynamic auth route mode 後,用 CDP 9229 驅動真實 base-web,對 rev2 rust-api 跑 reload → 登入,並斷言**選單依角色不同**(Super 見「系统管理」、User 只「首页」= menu enforce deny 端到端證明)。

## 前置

1. **rev2 dev stack 起來**(postgres + migrate〔001..010,含 014 menu policy〕+ rust-api):
   ```bash
   cd <workspace-root>
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
   docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
   ```
2. **base-web `.env` 翻 dynamic**(BASE-WEB-ADAPT、已隨 014 提交):`VITE_AUTH_ROUTE_MODE=dynamic`;base-web 跑在主 dev stack(vite dev proxy `/proxy-default` → `rust-api:21081`):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d base-web
   ```
   ⚠️ 翻 dynamic 前先 curl 驗 getConstantRoutes/getUserRoutes/isRouteExist 三 endpoint 全綠(getConstantRoutes 每次 reload 觸發、沒做好 reload 會壞)。
3. **Edge/Chrome 開 remote debugging 9229**:需有一個帶 `--remote-debugging-port=9229` 的瀏覽器在跑(腳本會自建 tab)。

## 跑

```bash
node tests/014-dynamic-routes/cdp-dynamic-routes-smoke.mjs
```

斷言:getConstantRoutes 觸發 / Super 側欄含「首页」+「系统管理」/ User 側欄只「首页」(無「系统管理」= menu deny)/ getUserRoutes 200 / 兩角色側欄不同(role-filtered)。screenshots/ 存登入頁 + Super/User dashboard(gitignored)。
