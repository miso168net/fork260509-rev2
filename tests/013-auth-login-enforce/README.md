# 013-auth-login-enforce — CDP browser login smoke

feature 013 的 US1 瀏覽器端到端登入驗收腳本(D10 / SC-001):用 CDP 9229 驅動真實 base-web 登入頁,對 rev2 rust-api 跑完整 login → getUserInfo,並斷言 envelope/code/token/跳轉。

## 前置

1. **rev2 dev stack 起來**(postgres + migrate + rust-api,migration 001..009 已套):
   ```bash
   cd <workspace-root>
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
   docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
   ```
2. **base-web 指向 rev2**(BASE-WEB-ADAPT):`base-web/.env.test` 的 `VITE_SERVICE_BASE_URL=http://rust-api:21081`(已隨 013 提交),base-web 跑在主 dev stack(rev2_net,vite dev proxy `/proxy-default` → `rust-api:21081`):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d base-web   # 首次 pnpm install 較久
   ```
3. **Edge/Chrome 開遠端除錯 9229** 並開一個 `http://127.0.0.1:21079` 的分頁(login 頁)。CDP 細節見 `docs/superpowers/000-base-web-docker-bootstrap.md` §5。

## 跑

```bash
node tests/013-auth-login-enforce/cdp-login-smoke.mjs Super 123456
```

- 用 node v24 內建 `globalThis.WebSocket`(免 npm install),自寫 minimal CDP client。
- 自動:清 auth storage → navigate `/login` → 填帳密 → 點「确认」→ 等跳轉 → 攔 `/auth/login` + `/auth/getUserInfo` 的 Network 請求/回應 → decode `SOY_token` 的 `iss` → 截圖到 `screenshots/`(git-ignored)。
- **通過指標**:`POST_LOGIN_URL` = `/home`、login/getUserInfo 回 `code 0000`、`TOKEN.iss = "rev2-admin"`(證明打到 rev2 rust-api 而非 ApiFox mock)。

> `screenshots/` 為 run 產物、git-ignored(對齊 `tests/mock-coverage-audit/` 慣例)。
