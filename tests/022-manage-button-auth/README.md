# 022-manage-button-auth — CDP ButtonAuth browser smoke

feature 022 的瀏覽器端到端驗收腳本(contracts §5)。用 CDP 9229 驅動真實 base-web(經 front-nginx `:21080`),**每角色開一個 isolated browser context(類無痕、獨立 localStorage)**,所以不會擾動你正在用的 tab / 登入態。斷言 4 項:

- **A · toggle-auth 救活**:三角色登入 → `/function/toggle-auth` 可達 → 各見對應 B_CODE 鈕數 **Super=3 / Admin=2 / User=1**(以 `hasAuth` gating)。
- **B · 用戶頁 gating**:`/manage/user` 操作鈕依授權顯隱 —— **Super** 見 编辑+删除+新增;**Admin** 只見 编辑(無 删除/新增、僅 `user:edit`)。
- **C · button-auth-modal registry**:Super → /manage/role → 編輯角色 → 「按钮权限」→ modal 顯 6 筆可用按鈕 registry(B_CODE1/2/3 + 新增/编辑/删除用户),granted 預勾。
- **D · menu-auth-modal(021 回歸)**:同 drawer →「菜单权限」→ modal tree 載入(021 接線無退化)。

## 前置

1. **rev2 dev stack 起來**(postgres + redis + migrate〔001..022,含 022 button/menu/endpoint policy〕+ rust-api + base-web,經 front-nginx):
   ```bash
   cd <workspace-root>
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
   docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up
   # 改動 rust-api/base-web 後須 rebuild + restart(WSL2 inotify 不可靠):
   docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api base-web
   ```
   ⚠️ 跑前先 curl 驗 getUserInfo.buttons 三角色逐字基線 + getAllButtons 6 碼(contracts §1/§3),確認 enforcer 已 reload 022 policy(migration 直寫 casbin_rule 後**須 restart rust-api** 才生效)。
2. **Edge/Chrome 開 remote debugging 9229**:需有一個帶 `--remote-debugging-port=9229` 的瀏覽器在跑(腳本走 browser-level WS 自建 isolated context、不碰你既有 tab)。dev DB 名為 `soybean_admin_rust`(非 `soybean`)。

## 跑

```bash
node tests/022-manage-button-auth/cdp-button-auth-smoke.mjs
```

從 workspace root 或任何 CWD 跑皆可(截圖路徑相對 script 解析)。輸出末尾印 `RESULTS JSON`(A/B/C/D 各 PASS/FAIL/PARTIAL)。截圖存 `screenshots/`(gitignored):`toggle-auth-{Super,Admin,User}.png` / `manage-user-{Super,Admin}.png` / `button-auth-modal.png` / `menu-auth-modal.png`。

## 結構

- `cdp.mjs` — 可重用 CDP client(node v24 內建 WebSocket、無 npm install):browser-level WS + `Target.createBrowserContext`/`createTarget`/`attachToTarget{flatten:true}` 開 isolated context、quick-login、navigate、evalExpr、screenshot(相對路徑解析 + auto-mkdir)、cleanup(必清所有 context)。
- `cdp-button-auth-smoke.mjs` — 4 項斷言 runner(import `./cdp.mjs`)。
