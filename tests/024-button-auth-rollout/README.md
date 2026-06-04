# 024-button-auth-rollout — CDP ButtonAuth Rollout browser smoke

feature 024 的瀏覽器端到端驗收腳本(contracts §5)。把 022「按鈕權限可編輯迴路」rollout 到**角色頁/選單頁**:用 CDP 9229 驅動真實 base-web(經 front-nginx `:21080`),**每角色開一個 isolated browser context(類無痕、獨立 localStorage)**,不擾動你正在用的 tab / 登入態。斷言 4 項:

- **1 · 角色頁 gating**:`/manage/role` 寫按鈕依授權顯隱 —— **Super** 見 新增+编辑+删除;**Admin**(初始未授 `role:*`)三者**全不顯**。
- **2 · 選單頁 gating**:`/manage/menu` —— **Super** 見 新增+新增子菜单(僅可加子的目錄列)+编辑+删除;**Admin** 全不顯(含目錄列也無 新增子菜单)。
- **3 · button-auth-modal registry 含新碼**:Super → /manage/role → 編輯角色 drawer →「按钮权限」→ modal(NTree、virtual-scroll)經滾動聯集後含 6 筆新碼 registry(新增角色/编辑角色/删除角色/新增菜单/编辑菜单/删除菜单),可勾選(FR-004)。
- **4 · 端到端 assign→reflect→restore**(hybrid curl + CDP):curl 指派 `role:edit` 給 Admin 角色 → 全新 Admin context 登入 → `/manage/role` **現見 编辑**(因 `role:edit` 已授)、**仍不見 删除/新增**(`role:delete`/`role:add` 未授,decoupled per-code)→ curl 還原 Admin 至 022 baseline。證明 modal→`set_role_button` HARD REPLACE→casbin→`getUserInfo` gating 迴路涵蓋新碼、且即時(redis invalidate reload,無需 restart)。

> **decoupled 已知債**(FR-008、刻意):按鈕**可見**(`role:edit` 授予)≠ 端點**可呼叫**(updateRole 端點仍 Super-only、點擊執行回 5003)。本 smoke 只驗按鈕**可見性** gating,不驗端點可執行性。

## 前置

1. **rev2 dev stack 起來**(postgres + redis + migrate〔001..024〕+ rust-api + base-web,經 front-nginx):
   ```bash
   cd <workspace-root>
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
   docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up
   # 改動 base-web 後須 restart(WSL2 inotify 不可靠);**剛套 024 seed migration 後須 restart rust-api**
   # 才能讓 in-memory enforcer reload(getRoleButton/getUserInfo 讀 enforcer;migration 直寫
   # casbin_rule 繞過 redis invalidate)——updateRoleButton 路徑則會自動 publish invalidate、無需 restart:
   docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api base-web
   ```
   ⚠️ 跑前先 curl 驗 getAllButtons **12 碼**(含 role:*/menu:*)+ getUserInfo 三角色(Super 含 role:*/menu:*、Admin 不含、僅 022 user:edit),確認 enforcer 已 reload 024 policy。
2. **Edge/Chrome 開 remote debugging 9229**:需有一個帶 `--remote-debugging-port=9229` 的瀏覽器在跑(腳本走 browser-level WS 自建 isolated context、不碰你既有 tab)。dev DB 名為 `soybean_admin_rust`。

## 跑

```bash
node tests/024-button-auth-rollout/cdp-button-auth-rollout-smoke.mjs
```

從 workspace root 或任何 CWD 跑皆可(截圖路徑相對 script 解析)。輸出末尾印 `RESULTS JSON`(check1~4 各 PASS/FAIL/PARTIAL)。截圖存 `screenshots/`(gitignored):`role-{Super,Admin}.png` / `menu-{Super,Admin}.png` / `button-auth-modal.png` / `role-Admin-after-assign.png`。

> check 4 會經 curl 暫時改 dev casbin(指派 `role:edit` 給 Admin)再還原;`finally` 保證還原至 022 baseline(`B_CODE2,B_CODE3,user:edit`),即使中途出錯。

## 結構

- `cdp.mjs` — 可重用 CDP client(node v24 內建 WebSocket、無 npm install):browser-level WS + `Target.createBrowserContext`/`createTarget`/`attachToTarget{flatten:true}` 開 isolated context、quick-login、navigate、evalExpr、screenshot(相對路徑解析 + auto-mkdir)、cleanup(必清所有 context)。沿用 022/023 harness 逐字。
- `cdp-button-auth-rollout-smoke.mjs` — 4 項斷言 runner(import `./cdp.mjs`;check 4 用 `execSync` curl 做 assign/restore)。
