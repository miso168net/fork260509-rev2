# MEMORY — rev2 工作區知識庫(供 rev3 提取)

> **來源**:rev2 auto-memory(`~/.claude/projects/…/memory/`,35 條)。2026-06-16 匯出、展開為此單一 git-tracked 檔。
> **為什麼有這檔**:auto-memory 綁在 rev2 專案路徑、跟著機器走;rev3 是新 repo 新路徑,不會自動帶過去。此檔可複製到 rev3 repo(建議放 `docs/`)供提取。
> **rev3 相關性標記**(我的初判、full body 全保留未刪任何記憶,你可自行重判):
> - 🟢 **直接沿用**:同系統(同 12 表/同 wire)、同環境(WSL2+docker)、同 stack(axum+SeaORM+Casbin+PG+Redis / Vue+naive-ui / nginx)→ 幾乎照搬。
> - 🟡 **原則沿用、需調整**:核心原則可用,但綁 rev2 命名/文件結構,或已內化進 `docs-rev3/INTEGRATION-DESIGN-rev3.md`(搬「原則」段、丟 rev2 專屬細節)。
> - 🔴 **rev2 專屬、歷史參考**:綁 rev2 特定文件格式/commit 史,rev3 多半不需(除非考古)。
> **提取建議**:🟢 區優先搬 → rev3 的 CLAUDE.md / 對應 memory;🟡 區搬原則;🔴 區可略過。body 內 `[[…]]` 為原始跨記憶連結,單檔內以搜尋定位(slug 見各條標題尾的 `code`)。

---

## 🟢 直接沿用(23 條)

> 同系統/同環境/同 stack 的硬知識——rev3 踩同樣的坑。建議整段搬進 rev3 的 CLAUDE.md 或 memory。

### [project] rust-api build/test 環境:host 無 cargo、走 dev docker image + 快取卷(含多個陷阱)  `project_rustapi_build_test_env`

rev2 host (WSL2) **沒有安裝 cargo/rust toolchain** — rust-api 一律在 docker 內編譯。

**build/test 指令**(從 outer root `/mnt/d/AnewSpaces/x_Project/fork260509-rev2` 跑,掛 source bind-mount + 兩個快取卷以重用 toolchain/編譯產物):
```bash
docker run --rm \
  -v "$PWD/rust-api":/app \
  -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target \
  -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev <test|build ...>
```
不掛 cargo_cache 卷會觸發 rustup 重新同步 toolchain(慢)。dev image = `rev2-admin-rust-api:dev`。

**⚠️ WSL2 /mnt/d mount stale-cache 陷阱**(018 多次踩):Windows 掛載的 mtime fingerprint 會讓 cargo 跑**舊 binary**、回報假綠(改了 code 但測試沒重編、甚至 handler 簽名不符仍「通過」)。在 dev 容器內編譯/測試前**一律 force-touch**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T rust-api sh -c "cd /app && find server/src -name '*.rs' -exec touch {} + && cargo build -p server"`。容器 bind-mount 解析到 `/home/anew/x_Project/...`(與 `/mnt/d/...` 同 inode)。psql 走 container:`exec -T postgres psql -U soybean -d soybean_admin_rust`(DB 名 `soybean_admin_rust`、**非** `soybean`)。

**live-DB 整合測試**:先 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres` + 跑 `migrate` service(自動套 migration),再以上指令加 `--network rev2-admin_rev2_net -e DATABASE_URL="$(cat deploy/secrets/database_url.txt)"`(secret 已是 `postgres://soybean:..@postgres:5432/..` 全 URL、主機名 `postgres` 在 compose 網路內可解析),跑 `cargo test -p server -- --ignored --test-threads=1`。

**`server` 是 bin-only crate(無 lib.rs)** → `server/tests/` 整合測試**無法** `use server::...`(既有 `entity_access_lint.rs` 只讀檔不用 crate API)。故需呼叫 crate 內部 API 的整合測試,放 **in-crate `#[cfg(test)]` + `#[ignore]` + env-gate**(011 放在 `facade/sys_operation_log.rs`,因 facade/ 是 entity-access lint 豁免目錄、可直接用 `entity::`)。預設 `cargo test` 跳過 ignored、CI/無 DB 仍綠。相關:[[project-rustapi-entity-access-lint]]

**⚠️ 跑整合測試 binary 一定要用 `--test <name>`**:`entity_access_lint`(009 守恆 gate)的 test functions 叫 `no_raw_entity_outside_facade` 等,**不**叫 `entity_access_lint`。`cargo test -p server entity_access_lint`(bare filter)會把 `entity_access_lint` 當成 **test-function 名稱 filter** → matches 0 個 fn → 顯示「test result: ok. 0 passed; ... N filtered out」= **假綠**(根本沒跑 lint)。必須 `cargo test -p server --test entity_access_lint`(跑整個 binary、17 tests)才真正執行。013 期間 T007/T008 多個 implementer/reviewer 用 bare filter 回報「lint passed」,實則 lint 一直 fail(handler 直 `use entity::sys_user` 繞 facade)、regression 潛伏到 T011 才抓到。**任何 `cargo test ... <something>` 看到「0 passed / N filtered out」要立刻警覺 filter 沒命中、不是綠。**

---

### [project] dev stack 跑 acceptance 前須 build+restart(WSL2 inotify 不可靠;vite/nginx/live-test 多陷阱)  `project_devstack_acceptance_restart`

dev rust-api 容器的 entrypoint 是 **cargo-watch**（`docker-compose.dev.yml`），理論上 bind-mount `./rust-api:/app` 改檔即 hot-reload。但 **WSL2 /mnt/d 是 9p 掛載、inotify 不可靠 → cargo-watch 常偵測不到 worktree 改動**，running 容器仍跑舊 binary。

**How to apply:** feature 實作改完 rust-api code、**跑活體 acceptance（curl/psql/CDP）前**，先讓容器載入新碼：
```bash
cd <workspace-root>
dcargo build -p server                 # force-touch + 編譯當前碼到共享 target volume(產出當前 binary)
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
# poll /health 直到 healthy；新 endpoint 回 200(非 404)即證跑新碼
```
（`dcargo` helper 定義見 [[project_rustapi_build_test_env]]；force-touch 是因同樣的 /mnt/d stale-mtime 問題、否則 cargo 不重編。）base-web 同理：改 wrapper/view 後 `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart base-web` 讓 vite 重讀 source 再跑 CDP。

**stale vite 的具體症狀簽名**（2026-06-03 CDP 驗 021 踩到，base-web 容器 Up 12h 沒重啟）：vite dev server in-memory module graph 沒熱載新加的 service fn → barrel `src/service/api/index.ts` 的 `export * from './rev2-system-manage'` 不含該 fn → 瀏覽器丟 **`SyntaxError: The requested module '/src/service/api/index.ts' does not provide an export named 'fetchXxx'`** → 該頁路由 lazy-import reject → `router.push` throw、頁面掛不起來、對應 list API 完全不發。診斷法：`curl http://127.0.0.1:21080/src/service/api/<file>.ts` 看 vite 實際吐的 transform 有沒有該 export（對照磁碟 git source）；缺 = stale，restart 即解（pnpm install 走 named-volume 快取 fast-path、秒級就緒）。另：dev HMR ws 經 nginx 被擋（`@vite/client` ws handshake 回 200 而非 101），所以即使 inotify 偵測到也推不動更新 → 只能靠 restart。

**跑 in-crate `#[ignore]` live-DB 測試**(facade 的 L1-Ln 整合測試):plain `dcargo` helper **跑不起來** —— 它是 `docker run --rm`(獨立容器、**不在 compose 網路**、**不傳 DATABASE_URL**),測試的 `Database::connect(env DATABASE_URL)` 會 panic / 連不到 postgres。要用 **dcargo-with-network 變體**(2026-06-05 027 實證):
```bash
PW=$(cat deploy/secrets/postgres_password.txt); NET=rev2-admin_rev2_net   # compose 網路名(project rev2-admin)
docker run --rm --network "$NET" -e DATABASE_URL="postgres://soybean:$PW@postgres:5432/soybean_admin_rust" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server -- --ignored --test-threads=1 <模組過濾,如 sys_token::live_tests>
```
重點:① `--network rev2-admin_rev2_net` 讓 hostname `postgres` 解析;② `-e DATABASE_URL=...`(plain dcargo 不傳);③ DB user `soybean` / DB `soybean_admin_rust` / 密碼在 `deploy/secrets/postgres_password.txt`(48 字元、非 "soybean");④ 過濾模組名只跑該 feature 的 live 測(其他 facade 的 #[ignore] 不被連帶跑);⑤ 直接編譯當前 worktree 碼 → **獨立於 running rust-api 容器版本**(facade 級驗證不需 restart)。host **無 jq**、JSON 用 `python3 -c`。

**改 nginx 單檔 bind-mount 後須 `--force-recreate`、不能 `restart`**（2026-06-07 031 C3 踩到）：front-nginx 在 dev/prod 是 bind-mount **單一檔** `nginx.conf`/`conf.d/_locations.inc`/`dev.conf`（非整個目錄）。在 host 編輯這些檔後跑 `docker compose ... restart front-nginx` 會炸 `OCI runtime create failed ... mount ... /etc/nginx/nginx.conf ... no such file or directory` —— Docker Desktop WSL2 的 bind-mount 快照路徑（`/run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/...`）在檔案被改寫後失效，`restart` 重掛舊快照路徑找不到。修法：`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile <profiles> up -d --force-recreate front-nginx`（重建容器取新 bind-mount，3 秒 healthy）。rust-api 不中此招（其 bind-mount 是**整個目錄** `./rust-api:/app`、非單檔）。改 nginx conf 後要重載一律用 `--force-recreate`。

017 的 US2/US3/登入-gate acceptance 各 restart 一次 rust-api 才驗到新碼。多-US feature 的活體 acceptance 是在**同一 dev DB 上累積狀態**跑（如 alice 建→編→刪、bob 停用），contracts 的 §3/§4/§5/§6 預設此順序流。migration 014/015 由 `migrate` service（`cargo run --bin migration up`）在 stack `up` 時自動套（rust-api `depends_on migrate: service_completed_successfully`）。migration up→down→up 可逆性驗證用 **throwaway DB**（`CREATE DATABASE migration_revtest` + 用 `DATABASE_URL` env 覆寫指向它跑 migration binary）不擾 dev 資料。

---

### [project] seed migration 直寫 casbin_rule 繞過 redis-invalidate、需 restart 才反映  `project_seed_migration_enforcer_reload`

casbin seed migration(如 022/024)直接 `INSERT INTO casbin_rule`,**繞過** `set_role_button` 走的 redis `casbin:policy:invalidate` 廣播路徑。執行中的 rust-api 其 in-memory enforcer 在 boot 時載入,故 migration seed 的新 button/menu/endpoint policy **不會被既有 enforcer 看到**,直到 `docker compose ... restart rust-api`(或某次 set_role_button 觸發 reload)。

**症狀分流**(024 T002 實證):
- `getAllButtons` 讀 DB 直查(`aggregate_active_buttons`→`list_active_all`)→ migration 後**立即**反映新碼,無需重啟。
- `getRoleButton` / `getUserInfo.buttons` / endpoint enforce 讀 **in-memory enforcer** → migration 後需 restart rust-api 才反映。

**How to apply**:跑會碰 enforcer-backed 路徑(getRoleButton、登入後 userInfo.buttons、enforce gating)的 live/CDP acceptance 前,若剛套了 casbin seed migration,先 `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api`。對照 [[project_devstack_acceptance_restart]](改 server code 也要 restart,理由不同:bind-mount 不 hot-reload)。

---

### [project] entity-access lint 只禁 3 個 entity:: textual needle、先 strip 註解  `project_entity_access_lint_needles`

`rust-api/server/tests/entity_access_lint.rs`（009 lint）實際掃描的 needle 只有 3 個字面字串：`"use entity::"`、`"use entity ::"`、`"entity::"`。即**只禁 `entity::` token**（facade 目錄除外）。doc comment 自述 conservative、僅簡單 textual pattern。

**不**禁：bare `sys_xxx::Model`/`Entity`/`Column`、`crate::...` re-export 繞道、`super::...::Model`。（曾有一次被截斷/混入雜訊的探查輸出謊稱有這些額外 needle，實際 grep needle 陣列證偽。）

**Phase 1 先 strip comments/strings 再偵測**（017 多次 reviewer 讀 lint 原始碼確認）：lint 兩階段 —— 先 `strip_comments_and_strings` 把所有註解（`//`/`//!`/`///`）+ 字串字面 whitewash 成空白，再掃 needle。故 **doc-comment 裡寫 `entity::` 字面（如 handler 自述「此檔不得含 `entity::` token」的 lint-constraint 註解）不會觸發 lint**。017 的 system_manage.rs 有 3 處 doc-comment `entity::` 字面、lint 17 仍全綠 = 此機制證實。

**How to apply:** handler（system_manage.rs 等非 facade 檔）只要全程不出現 `entity::` token 即過 lint。慣用法：`let rows = sys_menu::all_active(db).await?;`（型別 inference、不命名 `Model`）→ inline closure `.map(|m| MenuItem{...})`（closure 參數型推斷、不寫 `entity::`）。純樹構函式吃 handler 自定 DTO（如 `MenuItem`/`MenuTreeItem`，可命名），非 `entity::Model`。data-model 寫的 `build_menu_tree(rows: Vec<Model>)` 是 shorthand、實作要改吃 flat DTO。相關 [[project_rustapi_build_test_env]]。

---

### [project] update_* 是整欄替換、部分 payload 會 NULL 掉未送欄(UID 是 bash readonly)  `project_wholecolumn_update_acceptance`

rev2 的 `update_menu`/`update_role`/`update_user` facade 都用 **整欄替換**(`update_*_query` col_expr 把**所有**業務欄寫一次、未送欄→NULL),鏡像彼此。base-web 表單(`getSubmitParams()`)永遠送**完整 Model**,故 production 無事。

**陷阱(020 D1 payoff 差點踩)**:curl/psql acceptance 若用**部分 payload** 編輯(只送 `{id, menuName, order, status}`),`update_menu` 會把 route_path/component/icon/i18n_key 等**未送欄全設 NULL** → **汙染該列**。若那列是要保留的種子(如 D1 payoff 編輯 `manage_user` 只想改 order),會破壞 getUserRoutes 與三角色逐字回歸基線。

**How to apply**:acceptance 編輯「要保留原狀的列」時,先從讀端取完整當前欄位、只改目標欄再送回:
- menu:`GET getMenuList/v2?size=999` 取該 `routeName` 的 MenuItem(含全 camelCase 欄)→ 改一欄 → POST updateMenu(MenuUpdateReq 自動忽略 routeName/menuType/parentId/children 等多餘鍵)。
- 用 Python 組 payload(中文/jsonb 欄多,shell 引號難搞)。
- 編輯後用 psql 比對業務欄 byte-identical(忽略 updated_at/by,審計欄被更新是預期、且不影響 getUserRoutes 輸出)。

另:`UID` 是 bash readonly 變數,acceptance 腳本**不可** `UID=$(psql ...)`(會 silent 用 shell uid 1000、測到錯 id);用 `MUID` 等別名。相關 [[project_devstack_acceptance_restart]]。

---

### [project] 會 PUBLISH 的 live 測試污染 running server 的 in-memory watcher 狀態  `project_live_tests_pollute_running_watcher`

在 SHARED dev stack 上跑 in-crate `#[ignore]` live 測試時,若測試 **PUBLISH** 到 running rust-api **也訂閱**的 Redis channel,會污染 running server 的 in-memory 狀態。

**029 實證**:L3 settings_watcher 測試把 `system_settings.single_session_default` 改 'on' → `PUBLISH settings:invalidate` → **running server 自己的 settings_watcher**(訂同 channel)也收到、reload `session_mode=On`;測試結尾用 facade `update` 把 DB 還原 'off'(facade **不 publish**)→ running server 的 in-memory `session_mode` 卡在 On、DB 卻是 off → 之後 curl acceptance 一個 inherit 帳號「還沒 toggle 就被踢 7777」(假象、非 code bug)。同理 `casbin:policy:invalidate`(021/023 watcher)。

**Why:** live 測試與 running server 共用同一 Redis;watcher 是 process-global、不分測試/正式。測試的 PUBLISH 對 running server 是真實事件。

**How to apply:** 跑完「會 publish 的 watcher live 測試」後、**curl/CDP acceptance 前**,re-sync running server:① `docker compose ... restart rust-api`(重 boot、in-memory 從 DB 重載) 或 ② 設 DB 為正確值 + `RCLI PUBLISH <channel> 1`(再觸發 watcher reload 正確值)。驗證:看 rust-api log 的 `... reloaded new=Off` 或重啟後的 `single-session default loaded session_mode=Off`。與 [[project_devstack_acceptance_restart]] 同屬「shared dev stack 跑 acceptance」陷阱族。

---

### [project] nginx /api/ 剝前綴→任何 root route 對外可達;internal 須 exact-match 擋塊  `project_rustapi_root_routes_exposed_via_nginx_api`

front-nginx `deploy/nginx/conf.d/_locations.inc` 的 `location /api/ { proxy_pass http://rust-api:21081/; }`(末尾 `/` 剝 `/api` 前綴)會把 `https://對外網址/api/<anything>` 轉發到 `rust-api:21081/<anything>`。dev.conf(:21080/:21443)與 prod.conf 的 HTTPS :443 server block 都 `include _locations.inc` → **prod front-nginx(0.0.0.0:443 對外)會把 `/api/metrics` 轉到 rust-api `/metrics`**。

**Why:** rust-api 的 route 掛在 root(`/auth/login`、`/metrics`、`/health`…),nginx `/api/` strip 讓任何 root route 從對外網址都打得到。「rust-api prod internal-only(無 host port)」只擋直連 :21081、**擋不住經 nginx /api/ 的轉發**。032 obs-full 的 research R7/D8 就誤判「nginx 不 proxy /metrics 故 prod 不暴露」——只檢查了沒有 `location /metrics`、漏看 `/api/` catch-all,導致 FR-011 破口(user 2026-06-07 拍板「現在就補」)。

**How to apply:** 任何要求「rust-api 某 route 不得對外暴露」的 feature(metrics/internal-ops/debug 端點),不能只靠 rust-api internal-only;**必須在 `_locations.inc` 加 exact-match 擋塊**(如 `location = /api/metrics { return 404; }`,exact `=` 優先於 prefix `/api/`),並補一條「對外經 nginx curl 該 path 回 404/403」的 C-V。內網 prometheus/採集端仍直接 scrape `rust-api:21081/<path>`、不經 nginx、不受擋塊影響。相關:[[project_rustapi_log_fields_nested]](nginx JSON log 為 top-level flat)。

---

### [project] xdb region 從直連 client_ip 解析;dev 私有 IP→内网IP(非 NULL)  `project_xdb_region_dev_private_ip`

> *(原條目開頭有一段 2026-06-01 rebase 過時警語,匯出時已移除——015 早已 merge、欄位在工作樹。)*

015-audit-middleware 的 `region` 欄（xdb ip2region 地理來源）依凍結設計（research R3/R4）從**直連 `client_ip`（ConnectInfo peer）**解析，**不**從 `x_forwarded_for` 解析（XFF 只逐字保存、不做信任代理推算，spec D5）。

**實測事實（2026-05-30 Unit6/Unit7 live acceptance）**：dev/docker 直連 peer 是 docker bridge IP（如 `172.22.0.1`），ip2region 對私有範圍**仍回傳非空字串** `0|0|0|内网IP|内网IP`（不是 NULL、也不是 Err）。故 `sys_access_log`/`sys_login_attempt.region` 在 dev **`has_region=t`**（非 NULL）。contract `verification-commands.md §3/§4` 的 `has_region` 期望在 dev 成立。

**How to apply**：
- US3/SC-003「region 非空」在 dev 即可活體驗證（私有 IP → `内网IP`），**不需** prod 公網才驗。
- 但 region **內容**是 `内网IP`（非真實地名）——真實地名要公網 IP（xdb 單測 `resolve_known_ip` 用 `1.2.4.8` 證公網解析）。
- region 仍 best-effort：解析 Err（理論上 IPv6/壞輸入）→ None、不阻斷寫入；spec Edge Case 允許 NULL。
- 機制正確性：middleware 呼 `xdb::search_by_ip(client_ip)`（直連、非 XFF）；client_ip 寫 INET 真值（`172.22.0.1/32`）。
- 相關：[[project_rustapi_build_test_env]]。

---

### [project] 加新 naive-ui 元件會重生 tracked components.d.ts、須一併 commit  `project_baseweb_components_dts_autogen`

base-web(soybean-admin)用 `unplugin-vue-components` 自動匯入 naive-ui 元件,並把全域型宣告寫進 **tracked** 檔 `src/typings/components.d.ts`(非 gitignored)。

當 feature 在 view 裡**首次使用某 naive-ui 元件**(例:025 T007 加 `<NTreeSelect>`),**正在運行的 base-web dev container 會偵測到並自動重生 components.d.ts**(append 該元件的 `typeof import('naive-ui')['NX']` 兩處宣告)。

**陷阱**:implementer 常在 dev server 重生 components.d.ts **之前**就 commit,留下 uncommitted 的 `M src/typings/components.d.ts` orphan。`pnpm typecheck` 當下會過(重生檔在工作樹),但 **fresh checkout 該 commit(無 running dev server)的 components.d.ts 缺該元件宣告 → typecheck 可能失敗**(`<NTreeSelect>` 全域型 unknown)。

**How to apply**:base-web feature 收尾前,`cd base-web && git status` 檢查有無 `M src/typings/components.d.ts`;有就連同引入該元件的 commit 一起 `git add` + commit(025 把它 fold 進 T007 的 amend)。屬「清自己的 mess」(CLAUDE.md §3)、可重現性必要。NSwitch 等既用過的元件已在檔內、不觸發;只有**全新元件**才 append。相關 [[project_devstack_acceptance_restart]](WSL2 /mnt/d dev server 不可靠熱重載、改後須 restart)。

---

### [project] base-web 踢人 modal(7777)在 hard reload 時靜默 no-op(boot race)  `project_baseweb_modal_dialog_boot_race`

base-web's modal-logout handler (`src/service/request/index.ts`, ~line 69) does `window.$dialog?.error({ content: response.data.msg })` for `modalLogoutCodes` (7777/7778). `window.$dialog` is registered by `AppProvider` (`src/components/common/app-provider.vue`) on mount.

On a **hard browser reload** of a superseded tab, the route guard's `initAuthRoute → initUserInfo → getUserInfo` fires very early — *before* `AppProvider` mounts `$dialog`. So the optional-chained `window.$dialog?.error(...)` **silently no-ops**: the 7777 still comes back over the wire (verified) but no modal renders, and the app falls through to a refreshToken attempt. The kick modal reliably appears only when the 7777 is triggered by the **already-running** SPA (in-app navigation to a protected route), which is how the 028 T018 CDP smoke got its passing assertion.

Discovered 2026-06-05 during 028 single-session CDP acceptance. **NOT a 028 backend defect** — backend returns 7777 on every superseded protected request correctly; 028 is base-web-zero-change. This is a base-web frontend init-timing gap. Relevant to **029 (single-session admin UI)**: if "a superseded tab that gets hard-refreshed should also show the kick modal" is desired UX, base-web needs the dialog provider mounted before the boot-time getUserInfo (or the handler to defer until $dialog exists). Logged as a 028 follow-up backlog item. Related: [[same-second-refresh-token-hash-collision]] (the other 028-acceptance-surfaced latent finding).

---

### [project] rust-api JSON log 欄位巢狀在 fields → loki 用 fields_trace_id  `project_rustapi_log_fields_nested`

rust-api 用 `tracing-subscriber` `fmt().json()`（`main.rs:~502`、**無 `flatten_event(true)`**）→ 每筆 log 的 event 欄位（含 `message` 與所有自訂欄）**巢狀在 top-level `"fields"` 物件下**，span context 另在 `"span"`/`"spans"`。這是 rust-api **既有全 log 的慣例**（sqlx log 也是 `fields.summary`/`fields.db.statement`）。

→ loki `| json`（巢狀以 `_` 攤平）後：trace_id 在 **`fields_trace_id`**、message 在 `fields_message`，**非** top-level `trace_id`。正確 LogQL：`{service="rust-api"} | json | fields_trace_id="<uuid>"`（或顯式抽取 `| json trace_id="fields.trace_id" | trace_id="X"` 取乾淨 label 名）。

031-obs-min 的 `ctx_mw` boundary event「request complete」攜的 trace_id 即落在 `fields.trace_id`，與 `sys_access_log.trace_id` 對接走 `fields_trace_id`。**research R1 原假設「boundary event = top-level flat trace_id」是錯的**（已於 acceptance C2 發現並校正 data-model/research/contracts）；`fields_trace_id` 仍是穩定、非 array-fragile 路徑（避開 `spans_0_trace_id`），目標達成、**無 code 改動**（`flatten_event(true)` 刻意不採用 —— 會改全 log 形狀、超出 audit_ctx.rs-only 範圍）。

對比：**front-nginx 的 JSON access log 是 flat**（自訂 `log_format`、top-level `request_id`/`service`/`uri`...，數值欄 quote 防 nginx #2221 HTTP-000 破 JSON）。

**How to apply**: 未來 obs-full / grafana dashboard provisioning / metrics 埋點查 rust-api log 的 trace_id 一律用 `fields_trace_id`（nginx 用 top-level `request_id`）。若日後要讓 rust-api log 變 flat top-level，須在 `init_tracing` 加 `.flatten_event(true)`（全域改、會動所有 log 消費者）。見 [[project-seed-migration-enforcer-reload]] 同屬 obs/log 領域注意點。

---

### [project] loki | json 查詢須加 ^{ guard(cleanup-job docker-run 污染 rust-api 串流)  `project_loki_json_guard_rustapi_pollution`

對 loki `{service="rust-api"} | json` 的查詢/面板**必須**加 JSON guard（`|~ \`^{\`` 前置過濾，或 `| json | __error__=""`），即使 rust-api server 自身 log 全 valid JSON。否則 window 內一旦有非-JSON 行,LogQL `| json` 回 **HTTP 400 JSONParserErr**（整條 query 掛、面板顯錯非空集、違反 SC-002）。

**污染來源（live 實證）**：alloy 的 docker SD **依 image 名派 `service` label**。本專案 C0 acceptance recipe 用 `docker run rev2-admin-rust-api:dev` 跑 cleanup-job → 該容器 stdout（純文字 "would delete 0 rows" / cargo "Compiling…"）被標成 `service="rust-api"` 灌進 loki → rust-api 串流不再全 JSON。實證:`count_over_time({service="rust-api"} | json [30m])` = 400;`{service="rust-api"} |~ \`^{\` | json [30m]` = 200 success 144 series。

**Why**: research 033 R7 假設「rust-api `| json` 不需 guard（全 valid JSON）」**錯**。本專案自己的 sanctioned ops pattern（cleanup-job docker-run）就會污染,故假設不成立。033 audit-log 板 panel 2/3/5 因此補 guard（commit 5fa6a1c）。對齊 spec edge case「不信抽象假設」。
**How to apply**: 任何 obs 面板/LogQL 對任一 service 用 `| json`,預設都加 `|~ \`^{\`` guard(boot/error/混入行隨時可能非-JSON);別信「這個 service 全 JSON」。nginx 串流本就有非-JSON boot 行、早已 guard。相關 [[project_rustapi_log_fields_nested]]（rust-api log 欄位 nested 在 fields）+ [[project_grafana_datasource_uid_change_crashloop]]（同 033 obs 修正）。

---

### [project] 對既有 grafana datasource 補 uid 會 crash-loop、須加 deleteDatasources  `project_grafana_datasource_uid_change_crashloop`

把**顯式 uid 補到一個原本無 uid 首次 provision 的 grafana datasource** 會讓 grafana 13.0.2 crash-loop（`Datasource provisioning error: data source not found` → provisioning module not healthy → 整個 grafana 起不來）。原因：首次無 uid provision 時 grafana 產 auto-gen uid（如 Loki = `P8E80F9AEF21F6940`）並 persist 進 `grafana_data` 卷；之後改 provisioning yaml 加顯式 uid，provisioner 以新 uid 找既有 datasource、找不到而失敗。

**修法（033 採用、user 拍板、已實測）**：在該 datasource 的 provisioning yaml 加 top-level `deleteDatasources: [{name: <Name>, orgId: 1}]`，grafana 先按 name 刪舊 row 再以新 uid 重建。對 fresh volume 是 no-op、idempotent、純 config，dev 既有卷與任何已跑過該 datasource 的部署都自動收斂、零手動步驟。

**非對稱**：032 的 Prometheus 一出生就帶 `uid: prometheus`（無 stale row）→ 不需 deleteDatasources;只有 031 的 Loki 是無 uid 先 provision 才中招。

**Why**: research 033 R8 判「loki.yml 加 uid:loki 是 SAFE」是**錯的** —— R8 只查 config 有無引用 auto-gen uid、漏了 persisted volume 裡的 datasource row。這是真實部署地雷（任何已跑 031/032 的環境落 033 都會炸）。
**How to apply**: 之後任何 feature 要對既有 datasource 補/改 uid，先確認該 datasource 是否曾無 uid provision 過（查 `/api/datasources` 看是不是 auto-gen 樣式 uid）;若是,provisioning yaml 必須同時加 deleteDatasources，別只改 uid。相關 [[project_rustapi_log_fields_nested]]（同屬 obs 堆疊 live-grounded 修正）。

---

### [feedback] brainstorm 後停手;/speckit-specify 由 user 手動執行(pre-hook 建 branch)  `feedback_speckit_specify_user_runs`

完成階段 0 `superpowers:brainstorming`(產出 `docs/superpowers/<NNN>-<feature-name>.md`)後,**Claude 在此停手** —— 階段 1 `/speckit-specify` 是 **user 手動執行** 的,不是 Claude 的下一步動作。

**Why**:`/speckit-specify` 要走 `before_specify` mandatory pre-hook(`speckit.git.feature`)建短期 feature branch;CLAUDE.md §3 明訂「一定要手動執行,不要排進 brainstorm 流程裡觸發(會導致 `speckit.git.feature` 沒被執行)」。若 Claude 自動 invoke `speckit-specify` skill,pre-hook 可能沒正確觸發。

**How to apply**:brainstorm 收尾訊息**不要**寫「看 OK 我就交棒/執行 /speckit-specify」之類把自己當觸發者的措辭;改說「你 OK 後**由你手動執行** `/speckit-specify`」並停手等 user。superpowers:brainstorming skill 的預設 terminal 是 invoke writing-plans —— **本專案 CLAUDE.md §3 覆寫**:brainstorm → 手動 /speckit-specify(SDD 設計鏈),非 writing-plans。2026-06-04 026-auth-dry-refactor brainstorm 收尾被 user 糾正此措辭。

---

### [feedback] 派 review subagent 前先拿 implementer 真實 commit SHA、別捏造  `feedback_reviewer_needs_real_sha`

在 superpowers:subagent-driven-development 流程派 spec/code-quality review subagent 時，**reviewer prompt 內的 BASE/HEAD SHA 必須是 implementer 已回報的真實值**，不可預測或捏造。

**Why:** 017 T008 時我在 implementer 還沒回報前、就並行派了 reviewer，prompt 塞了我猜的 SHA `f217fc8`（不存在）。兩個 reviewer 都在 implementer commit→amend 的 race 中讀到中間態（HEAD 還是上一個 task），回報「route missing / test missing / commit 不存在」的假 CHANGES REQUESTED。我親自查最終 commit 才推翻。T006 那次我也猜 SHA、但碰巧猜中故沒爆。

**How to apply:**
- review subagent 一定在 implementer subagent **回報之後**才派（拿到它回報的真實 SHA），不要為了並行而提前派、塞預測 SHA。
- reviewer prompt 給「commit message 關鍵字 + `git log --oneline` 自己定位 HEAD」比給死 SHA 更穩；或明確要 reviewer 先 `git log -3` 確認 HEAD 再 review。
- reviewer 結論與預期衝突時（尤其「檔案/commit 不存在」），**先自己用乾淨 git 指令查最終狀態**再判斷，別直接信。implementer 若 amend 過，舊 SHA 會失效。
- 此環境另有間歇性 tool-result 遞送故障（回傳混入他次輸出/假 SHA）→ 關鍵 git 事實一律寫檔再 Read、或多指令交叉比對。相關 [[project_rustapi_build_test_env]]。

---

### [feedback] review subagent 只讀審查、prompt 明令不得在 repo 寫檔  `feedback_reviewer_no_write_files`

派 spec/code-quality review subagent 時，prompt 要**明令「只讀審查、不得在 repo 寫任何檔（報告寫在回傳訊息裡）」**。否則它們會留 `T010-REVIEW.md` 之類產物在 worktree。

**Why:** 017 T008/T010 review 期間，reviewer subagent 各自在 `rust-api/server/` 寫了 `T010-REVIEW.md`（其中一個自己刪了、一個沒刪殘留到收尾）。雖未進任何 commit（untracked、worktree 模式下 `git status` 顯示在 rust-api 子模組層），但會污染 `git status`、險些混進 `git add`。

**How to apply:**
- reviewer prompt 結尾加：「Report findings ONLY in your returned message. Do NOT create/write any file in the repo.」
- finishing-a-development-branch 收尾前，對 worktree + outer 都跑 `git status --porcelain` 掃 untracked，發現非預期檔先確認來源(多半 subagent 產物)再 `rm`，**勿**盲目 `git add -A`。
- 同類遞送/狀態坑見 [[feedback_reviewer_needs_real_sha]]、[[project_rustapi_build_test_env]]。

---

### [feedback] 加 Rust workspace crate 的 feature 必含 prod image build 驗收  `feedback_crate_add_needs_prod_image_build`

當一個 feature 在 `rust-api/Cargo.toml` 新增 workspace member(新 crate),它的 acceptance **必須包含 prod runtime image build**(`docker build -f deploy/Dockerfile.rust-api.txt --target runtime .`),不能只用 dev docker 驗收。

**Why:** dev image(`rev2-admin-rust-api:dev`)靠 compose **bind-mount 整個 `rust-api/`**,所以新 crate 一定在;但 prod `Dockerfile.rust-api.txt` 的 builder stage 是**逐 crate 顯式 `COPY`**(server/migration/cleanup-job/entity 的 Cargo.toml + src)。新 crate 沒補 COPY → workspace manifest 解析失敗、`cargo build --release --bins` 爆 → prod image / migrate service 起不來。dev 全綠、prod 靜默壞,單測 + subagent review 都抓不到。

**已咬兩次:** 010(entity crate 漏 COPY、Deviation D-1)、012(sea-orm-adapter + xdb 漏 COPY、§2.15)。

**已固化(2026-05-30):** 經 006-013 review 再確認為頭號系統性缺口後,此守則已寫進 **CLAUDE.md §3「Phase 1 verification-commands.md 紀律」**(workspace 指引、每 session hook 注入) —— 凡新增 workspace crate 的 feature,`/speckit-plan` 產 `contracts/verification-commands.md` 時必含一條 prod target image build,不得只靠 dev bind-mount 驗。CHECKLIST §2.13 已標「✅ 已固化進 §3」。若日後仍被咬(紀律沒擋住)= 升級成 constitution principle(/speckit-plan 主動 gate)的訊號。

**How to apply:**
- feature 加 crate 時,Phase 1 contracts / tasks 就把「prod runtime image build 驗綠」列為一條 acceptance(此即 CLAUDE.md §3 已固化的紀律)。
- builder 補 COPY:`<crate>/Cargo.toml` + `<crate>/src`;若該 crate 的 Cargo.toml 宣告 `[[bench]]`/`[[example]]` 等顯式 target,**cargo manifest parse 階段就需該檔存在**(即使 `--bins` 不編它),故也要 COPY(如 xdb 的 `benches/`)。`--release --bins` 不編 bench/example,dev-dep(criterion 等)不會被拉。
- runtime stage 若 crate 有 runtime 資料檔(如 xdb `ip2region.xdb`),server 真消費時還要 COPY 進 runtime image + 設路徑 env。

關聯 [[project_rustapi_build_test_env]]。

---

### [feedback] menu/route 可見性 feature:brainstorm 就查走 Casbin enforce(非程式內 map);buttons≠menu  `feedback_menu_route_via_casbin_enforce`

任何觸及 **menu / route 可見性 / 權限過濾**(getUserRoutes、menu filter、route guard 等)的 feature,**brainstorm 階段就要對照 constitution §I.2**(「業務 menu 走 `/route/getUserRoutes` → 後端 Casbin enforce 過濾」NON-NEGOTIABLE),**不可預設用程式內 `role→x` 寫死 map**。

**Why**:014-dynamic-routes brainstorm 初版 D1 選了「程式內 role→route map 過濾 menu」(類比 013 的 buttons 矩陣寫死模式),但 **buttons ≠ menu** —— §I.2 只管 menu、不管 buttons。直到 `/speckit-plan` 的 Constitution Check item 3 才抓到違反 §I.2(gate failure)→ user 拍板 re-scope:menu 可見性改 **Casbin policy seed(`p,role,route_name,menu`)+ 重用 enforcer 過濾**(plan Deviation D-001)。早該在 brainstorm 就抓到。

**How to apply**:
- brainstorm menu/權限類 feature 時,把 constitution §IV 各項 Compliance(尤其 **item 3 menu→Casbin enforce**、item 4 wire 對齊 §I.3;§IV 2026-06-01 起 8 項、新增 item 8 審計欄)當 checklist **先過一遍**,再凍結決策——別等 plan 階段 Constitution gate 才補救。
- 「最小機制證明」可簡化範圍,但**不能簡化掉核心原則**(§I.2 是 NON-NEGOTIABLE);過濾機制該走 enforce 就走 enforce,只是 policy 可先 seed 最小集。
- route 物件「定義」可程式內寫死(對齊 base-web shape),但「誰能看」的**過濾**必須 Casbin enforce。
- 相關:[[feedback-docs-role-separation]];constitution §I.2/§I.3/§IV。

---

### [feedback] 工程決策自己拍、別每題做成選項;只有真拍板級才問 user  `feedback_engineer_decides_dont_overask`

brainstorm / 設計時**別把每個決策都做成 AskUserQuestion 選項題**讓 user 挑。Claude 就是工程師,自己做「能讓 user 達到目的的最好選擇」即可。

**Why**: user 2026-06-01 manage-list-endpoints brainstorm 明示:「你不用提供『我推薦』的選項。你就是工程師,自己做能讓我達到目的的最好選擇就好。像是 retrofit 那種真的需要我決定的,才問我。」純工程選擇(如 N+1→加批次 fn、DTO 映射、facade 拆法、測試策略)問了是浪費 user 時間。

**How to apply**:
- **自己決定**(不問):技術實作選擇 —— N+1 優化、facade/handler 拆分、DTO 欄位映射、id stringify、測試策略、policy seed 寫法、router pattern、camelCase rename 等「怎麼做」層級。act on actual code + 既有 pattern + constitution 凍結值,直接拍。
- **才問 user**(真正拍板級):有實質產品/範圍/風險後果且非純技術的 ——「要不要動 schema(加 migration)」「feature scope 邊界(做哪些 endpoint)」「§I.6 retrofit 時機」「破紀律的例外授權」這類。
- brainstorming HARD-GATE 的 design approval 仍要做,但用**呈現完整設計 + 開放式「這樣 OK 嗎/要調整哪」**一個 gate,不要拆成一堆 A/B/C 選項題逐個追問。
- 凍結值(constitution §II 拍板 / §I.3 wire 不變式)= 已拍板,act on it、別當選項問;若文件有殘留矛盾,自己採凍結值 + spec 標記待掃清即可。

關聯:[[feedback_question_too_abstract]](選項要大白話)—— 但本則更上層:多數技術決策**根本不該變成選項**。

---

### [feedback] 對 user 提問用大白話 + 串核心目標、不用設計術語抽象列選項  `feedback_question_too_abstract`

**規則**:對 user 提出設計決策問題時(尤其 AskUserQuestion),用**大白話 + 串到 user 已表達的核心目標**,不要直接用內部設計術語抽象列選項。

**Why**:2026-05-27 session 中,Claude 進 Round 2 §11 拍板(§11.2 alova 7 endpoint / §11.5 alova menu / §11.4 apifoxToken / §11.13 login 替代入口),用內部術語直接列選項(「全實作 / 全 stub / 隱藏 menu / 混合」),user 回應「你的問題和選項我看不明白」,並澄清他的核心目標是「Casbin RBAC 動態 menu」。這 4 題本質都跟 user 核心目標關係薄(都是「base-web example 附帶的東西怎麼處理」次要決策),抽象選項使 user 無法判斷與自己核心訴求的關聯。修正:Claude 用大白話重講(「base-web 內建 8 個 demo 頁要不要做?」「base-web 寫死 ApiFox token 怎麼處理?」)、並標明每題「跟 Casbin 動態 menu 的關係」,user 才能判斷。

**How to apply**:
1. 提問前先問自己:user 是否能用他自己的話複述這題在問什麼?如果答案是「不一定」,先用大白話重述、再列選項
2. 每個選項描述要包含:**動作** + **跟 user 核心目標的關係** + **工作量 / 風險**(不只「動作 + 工作量」)
3. 如果題目跟 user 核心目標關係薄,**先明示「這題跟您核心目標無關、是 X 的次要決策」**、再給 ★推薦選項與 fallback
4. 一輪不要塞太多題(4 題已是上限),且 4 題盡量同主題(混合不同主題的題目會稀釋 user 注意力)
5. 「Claude 中性建議」與「Claude 推薦」要明確區分:中性 = 都可、推薦 = 強烈傾向
6. **選項裡的 trade-off 主張要先用實證(grep/read)落地、別憑文件臆測**:2026-05-28 session,user 對一題 binary 選項按「clarify」要求講細一點;我先 grep 實際 code 確認「DB user/db 名在 rust-api/migration 完全沒寫死 → 改名零 code 風險」,再把這事實寫進選項描述(影響面 / 代價 / 理由),user 才能判。先驗證再斷言成本/風險,比抽象列「方案 A vs B」有用得多。
7. **user 按「clarify」時**:先開放問「你想釐清什麼」、別硬塞原本的二選一;拿到方向後再重框(常常是要更詳細、實證化的選項描述)。

關聯:[[feedback-docs-role-separation]]

---

### [feedback] 改 constitution 前 show-before-edit + okok gate;內容分流四檔  `feedback_constitution_amendment_workflow`

改 `.specify/memory/constitution.md`(凍結權威)時,user 要 **show-before-edit + okok gate**:先把逐行精確編輯(old→new + 落點)列出來給 user 過目,等 user 說「okok」才動檔;動完列 diff,commit / push 仍各自等指示。

amendment 內容**嚴格分流**(上個 session 把完整提案條文丟進 CHECKLIST、害 user 很生氣):
- 規範條文本體 → constitution(凍結、self-contained、**不引用未來/未存在的 feature/表**)
- 提案紀錄 + 設計理由 → DESIGN §11(2026-06-01 起 §V.2 step1 已改:proposal 落 DESIGN §11、非 CHECKLIST)
- 1 行精簡指標 → CHECKLIST(不抄條文)
- commit 里程碑 → MILESTONES §1 表

**Why:** constitution 是最高凍結權威、改了難回退;CHECKLIST 是動態檔、不該放常駐規範。user 對 doc-role 分離極敏感。

**How to apply:** 收到「改 constitution」需求先進 §V.2 Amendment 流程、列精確 edit 等 okok;若正處 rebase checkpoint(如 reset 回舊 tag),先確認**當前版本號**(可能被回退到舊版)+ 檢查擬加條文有無**時間錯置引用**(指向已回退的 feature/表→改 self-contained)。relate [[feedback_docs_role_separation]]。

---

### [feedback] CDP 驗證用 isolated browser context、不擾 user 的 tab  `feedback_cdp_isolated_context_verify`

CDP browser 驗證若要跑「會反覆換角色登入」的端到端 click-through，而 :9229 上是 **user 正在用的瀏覽器**，**用 isolated browser context**(類無痕、獨立 localStorage)，不要驅動 user 既有 tab。2026-06-03 022 收尾時 user 經 AskUserQuestion 親選此法(其餘選項:接管現有 tab / 自己點 / 跳過)。

**Why**:base-web 的 JWT 存 localStorage、同 origin 跨 tab 共享 → 在 user 的 tab 換角色登入會把他目前的登入態洗掉(本例他停在已登入的 /manage/menu)。docs/superpowers/000 §5 的 CDP harness 只記「navigate 既有 tab」法、並在 §5.8 警告「操作的 tab 未必是 user 看的」——isolated context 直接消除這個衝突。

**How to apply**(node v24 內建 WebSocket、無 npm install):
1. browser-level WS：`curl :9229/json/version` 取 `webSocketDebuggerUrl`(`ws://.../devtools/browser/<id>`)、WS 連它。
2. `Target.createBrowserContext {disposeOnDetach:false}` → `browserContextId`(獨立 storage)。
3. `Target.createTarget {url:"about:blank", browserContextId}` → `targetId`。
4. `Target.attachToTarget {targetId, flatten:true}` → `sessionId`;之後指令帶 top-level `sessionId`。
5. 一角色一 context(login→驗證→截圖→`Target.closeTarget`+`Target.disposeBrowserContext`),免 logout。
6. **務必 cleanup 每個 context**(即使出錯)、勿碰 user 既有 target。full 32-char ids、flatten:true 避 close-1006([[project_rustapi_build_test_env]] 同環境)。

---

### [project] rev3 設計書本身的結構與編輯紀律(附錄 G 唯一清單、編號標記鐵則)  `project_rev3_design_v2_structure`

rev3 設計書權威檔 = `docs-rev3/INTEGRATION-DESIGN-rev3.md`（2026-06-11 正名；前身 DESIGN-rev3-SKELETON v1/v2，v1 留檔、v2 已 rename 不存在）。**檔名不帶版本號、之後只在這份迭代**，並將整檔複製到 rev3 新 git repo 的 `docs/`。

結構：Part I 總綱（§0 方法論＋雙脊椎宣告／§1 含 §1.0 系統敘述與 rev3 目標、§1.5 DAG、§1.6 技術棧／§2 新能力決策包）→ Part II 設計契約（§3 脊椎〔欄級字典＝附錄 F〕／§4 行為島〔3 台機器＝設計單位、2+1 合刀＝交付單位，Button/Endpoint 非島〕／§5 面矩陣／§6 前端／§7 wire）→ Part III §8 交付計畫（§8.2 含「待拍板刀位」〔constitution-rev3 重鑄=波 0 前置〕、§8.4 波次含出口條件＋量級錨、§8.8 v1 DoD）→ Part IV（§9 凍結基盤快照／§10／§11／附錄 A~G）。

**Why**：三鏡頭獨立審查（PM／設計一致性／文件工程）後 user 核可修 E（行為島計數矛盾）＋D（交付清單四洞）＋B（Part I 開場）＋C（DoD/出口條件）＋H（附錄 G 重建）；並因移植需求 user 指定：rev2 feature/migration 編號全文標 `（rev2 NNN）`/`rev2 mNNN`（卷首有編號慣例）、rev2 repo 內部文件引用最小化（深連結→自含事實；唯一對照處＝附錄 D 含移植策略欄）。

**How to apply**：後續迭代直接改本檔；附錄 G 是開放問題＋全部 ⚠️ 的唯一清單（待決①~⑤、⑥a~⑥d、⚠️a~q，各有最晚決策點；新增 ⚠️ 必同步登 G；文末「開放問題」只是一行指標、勿再展開雙簿記）。**編號標記鐵則（user 三次糾正後固化）**：任何 rev2 feature/migration 編號必為（rev2 NNN）/（rev2 mNNN）括號包覆形——驗證器=「rev2 編號叢集不得在（）/() 之外」括號深度檢查＋「裸編號必有 rev2 前綴」雙條，修訂後必跑。裸「v1」禁用、一律全稱「rev3 v1」（§0.4 詞彙表、引文與 §9 快照豁免）。rev2 史料引用僅出處紀錄（附錄 D 唯一對照處）、勿新增可解析深連結；跨文件裸 § 號（rev2 §9.1 之類）禁用。**文中已無任何 SKELETON v1/v2 血緣引用**（rev3 repo 不會有 v1，血緣只在 rev2 repo git 史）。**§8.4 有「波 -1 repo 建構」**：grounded on rev2 git 史（05-26~28、001 起跑前 3 天的 bootstrap 實序）；rev3 的研究/設計/拍板段已由本書承接，波 -1 壓縮為機械建構＋constitution-rev3 重鑄凍結 v1.0.0（**指定來源材料＝本書 §9 快照**——它是 rev3 repo 內 rev2 constitution 內容的唯一載體；重鑄後 §9 降歷史對照）。深度未做的審查遺項：拆書（DESIGN 薄本 vs REV2-REFERENCE 圖鑑）與重複敘事壓縮（治理島故事 8 處）等 user 已知、排在待決①~⑥ 拍板後。

---

## 🟡 原則沿用、需調整(10 條)

> 原則有效,但綁 rev2 命名/文件結構,或已部分內化進 rev3 設計書。搬「原則 + How to apply」、把 rev2 專屬細節(CHECKLIST §X、MILESTONES、rev1 等)替換成 rev3 對應物。

### [project] 三維度正交(button≠menu≠endpoint);測 gating 只在能看該頁的角色上  `project_nonsuper_no_role_menu_page_access`

dev seed 的 menu 可見性 policy(casbin `v2='menu'`,021/010 seed)分布:
- **R_SUPER**:home, function, function_toggle-auth, manage_user, manage_user-detail, **manage_role, manage_menu**
- **R_ADMIN**:home, function, function_toggle-auth, manage_user, manage_user-detail —— **無 manage_role / manage_menu**
- **R_USER_COMMON**:home, function, function_toggle-auth

**後果**:非-Super 角色導向 `/manage/role` 或 `/manage/menu` 會渲染 not-found 頁(只有「返回首页」鈕、`.n-data-table-tbody` 0 列),**不是**管理表。

**對 button gating 測試的影響**(024 踩過):role/menu 頁的 024 button gating(`hasAuth('role:*'/'menu:*')`)**只在能檢視該頁的角色身上可觀察** —— 預設僅 Super。
- 「非-Super 在 role/menu 頁看不到寫鈕」若用 Admin 直接測 = **假陽性**(Admin 看的是 404、非 gating 隱藏)。
- 要證 literal「指派按鈕給某角色→該角色檢視該頁見鈕」(spec US1),須**先**經 021 `updateRoleMenu` 授該角色 manage_role 選單可見性(menu id:manage_user=3/manage_role=4/manage_menu=5),**再**經 024 `updateRoleButton` 授按鈕碼。三維度刻意正交(button 可見 ≠ menu 可見 ≠ endpoint 可呼叫,見 [[project_seed_migration_enforcer_reload]] 與 024 FR-008 decoupled 債)。
- 純 button gating 的逐碼隱藏證明,可改在**能檢視頁的角色**(Super)上撤單一碼觀察(updateRoleButton 無 R_SUPER root-guard,可撤 Super 的 role:delete 等)。

**How to apply**:設計 role/menu 管理頁的 CDP gating 驗收時,別預設非-Super 角色能檢視這些頁;要測非-Super 須先授 021 選單可見性。getRoleMenu/updateRoleMenu(`{roleId,menuIds:number[]}` HARD REPLACE)是 021 端點。

---

### [project] refresh JWT 須帶 per-token jti 防 token_hash 撞鍵(rev2 已修、rev3 §4.1 已內化)  `project_same_second_refresh_token_hash_collision`

`sys_token.token_hash = sha256_hex(refresh_jwt)` has a UNIQUE constraint. A refresh JWT's identity = `{sub,user_id,roles,exp,iat,iss,aud,sid}` — all with **second-granularity** `iat`/`exp` and no nonce/jti. So if a refresh (`rotate`) runs in the **same wall-clock second** as the login that issued the presented token, `issue_tokens` re-signs a **byte-identical** JWT → same `token_hash` → `rotate`'s insert of the new active row hits `duplicate key value violates unique constraint "sys_token_token_hash_key"` → `refresh_token` returns `5000`.

**Pre-existing 027 edge, NOT a 028 regression.** 028 only *added* `sid` (inherited/constant within a session) — it did not change the same-second identity condition (027's refresh JWT had the same collision surface minus `sid`). Verified 2026-06-05 during 028 US3/US4 curl acceptance: login→immediate refresh = `5000`; login→(busy-wait until next second)→refresh = `0000`, and a consecutive refresh also `0000`. Real usage never triggers it (refresh fires near access-token expiry, ~3600s later → distinct `iat`).

**Implication for acceptance**: the 028 `contracts/verification-commands.md` C4 command does login→immediate refresh, so the literal command can hit `5000` on a fast machine. `5000` is NOT a forbidden kick code (FR-010 forbids only `3333/9999/9998`), so it doesn't break the failure-code discipline — but it is a misleading acceptance artifact. C4's real intent (current session refresh succeeds) passes with a ≥1s gap.

**Fix — RESOLVED in feature 030 (US2)**: `auth/jwt.rs` `Claims` now carries a per-token `jti` (`uuid::Uuid::new_v4()` minted on every `sign()` call), making the JWT body byte-distinct even at identical `iat`/`exp` → `token_hash = sha256(jwt)` can no longer collide. Verified 2026-06-10 against source (`jwt.rs:47-53,87`) + unit test `same_second_signs_are_byte_distinct_via_jti` (`jwt.rs:162`). No longer an open 028 follow-up. See [[crate-add-needs-prod-image-build]] for the kind of latent-gap discipline this mirrors.

---

### [project] 指向自己 commit 的 SHA:用獨立 follow-up commit、別 amend  `project_milestones_self_ref_sha`

MILESTONES §1 要 append「指向自己這個 commit 的 SHA」的 row(amendment / 純 docs commit)時:**一個 commit 無法包含自己的最終 hash**。

**別做**(buggy):commit 帶 `__SHA__` placeholder → `git rev-parse HEAD` 拿 SHA → sed 回填 → `git commit --amend`。amend 會**重算 SHA**(因內容變了)→ row 指向 amend **前**的 SHA = 已成 orphan、將被 GC。2026-06-02 v1.2.1 amendment 踩過(row 填 `14980ad`、amend 後實際是 `b90666c`)。

**正解**:先把 amendment 內容 commit(constitution + DESIGN §11.x 提案,**不含 row**)→ 拿它的真實 SHA → 用**獨立 follow-up commit** append MILESTONES row 指向那個 SHA。先例:`c6e1c7e`(append 2a34c64)、`11cf5d8`(append 6727cc7)。

**例外**:merge feature 的 MILESTONES row 天生沒這問題 —— 它由 merge **之後**的「收尾 docs commit」加入、指 merge commit 的 SHA(非自指)。既有 `e1fa3db`/`fb9a652` amendment row 經查皆 reachable、無此 bug。

---

### [feedback] 設計權威(增厚)vs 動態 todo(精簡)的文件職責分工  `feedback_docs_role_separation`

**規則**:rev2 workspace 內 docs/ 5 份核心 .md 檔的職責分工(權威定義在 CLAUDE.md §7):

1. **研究歷史**(大致已完結、**不再擴張**):
   - `docs/INTEGRATION-RESEARCH.md` — 早期設計研究、以 rev1 為來源、重構 rev2 方向
   - `docs/INTEGRATION-RESEARCH-FOLLOWUP.md` — RESEARCH 深入深研追加事項
   - `docs/MOCK-COVERAGE-AUDIT.md` — 本地 base-web docker-compose 跑後查驗 mock api(wire ground truth)
2. **設計權威 ★** — `docs/INTEGRATION-DESIGN.md`:**核心事實**;所有完成的設計決策、拍板結果、軌道定義、wire 不變式都要**回填**到此檔對應段落;內容增厚、不刪減
3. **動態 todo** — `docs/INTEGRATION-CHECKLIST.md`:SOP hook 每次 session 注入;**不能無限膨脹**、要簡寫摘要或定期清理;**只記** Current Focus / 待處理 todo / 已完成里程碑摘要 / Roadmap / 跨 feature 待驗證項;**不寫詳細設計理由 / 拍板理由 / 軌道定義**(那是 DESIGN 的職責)

內容流向:`新發現 todo → CHECKLIST(動態)→ 處理完設計決策 → 回填 DESIGN(權威)→ v1.0.0 提取 → constitution(凍結)`

**Why**:2026-05-27 session,Claude 在 user 親決 §11 12 拍板項後,把所有拍板結果的詳細註解(理由、影響軌道、選項對比)寫到 CHECKLIST §2.1,並在 CHECKLIST 新增 §6 軌道授權清單(25 行表 + 子節)。User 糾正:「DESIGN 應該是設計權威、拍板結果應回填到 DESIGN;CHECKLIST 是 SOP 注入文件、應該保留摘要、內容會被清理。」User 進一步補充 5 份 .md 的完整職責分工(研究歷史 3 份「不再擴張」、設計權威 1 份「核心事實」、動態 todo 1 份「不無限膨脹」),已寫入 CLAUDE.md §7 5 子節 + §2 目錄結構展開 docs/ 子檔。

修正方式:
- DESIGN §11 各項加 ✅ 拍板 callout(完整理由 + 影響軌道) + DESIGN §7 加軌道一覽表 + §7.6 RUSTAPI-SOURCE-ISOLATION
- CHECKLIST §2.1 改為 13 row 索引表 + 兩鐵紀律 callout;CHECKLIST §6 改為 6 行快查警示
- CLAUDE.md §7 從 7 行索引擴寫為 5 子節階層說明 + 內容流向圖
- CLAUDE.md §2 目錄結構展開 docs/ 5 份 .md 子檔

**How to apply**:
1. 任何**設計決策、拍板結果、軌道定義、wire 不變式、設計理由** → 回填到 DESIGN.md 對應段落
2. CHECKLIST.md 只能放:Current Focus / 待處理 todo / 已完成里程碑摘要 / Roadmap 狀態 / 跨 feature 待驗證項;如需引用設計細節、用 markdown link 指向 DESIGN 對應 anchor
3. **不要再擴張** RESEARCH / FOLLOWUP / MOCK-AUDIT 三份「研究歷史」檔(可派 subagent 檢查它們、別主動加新內容);新發現的事項列到 CHECKLIST → 處理完回填 DESIGN
4. 編輯前先想:「此內容會頻繁變更嗎?是 → CHECKLIST;否 → DESIGN(或 constitution.md v1.0.0 凍結後)」
5. constitution.md v1.0.0 寫定後,鐵紀律與軌道授權邊界從 DESIGN 提取凍結到 constitution(更高權威層);DESIGN 仍保留作為設計研究歷史

關聯:[[feedback-question-too-abstract]]

---

### [feedback] 別從其他文件引用動態 todo 檔(會被清理、連結會 rot)  `feedback_no_checklist_references`

**規則**:寫任何文件時,**絕不引用/連結 `docs/INTEGRATION-CHECKLIST.md`**(不寫 `[…](INTEGRATION-CHECKLIST.md)`、不寫「見 CHECKLIST §X」這種 cross-ref)。

**Why**:CHECKLIST 是**動態 todo**、內容會滾動清理/歸檔(CLAUDE.md §7.3/§7.5「永遠不膨脹」)—— 別的檔連到它的 §X,等 CHECKLIST 一清理那連結就 rot、指向不存在的章節。CHECKLIST 是**單向消費者**(它引用 DESIGN/MILESTONES/spec),不該被別人引用。

**How to apply**:其他檔要 cross-ref 時,指向**權威/永久**來源 —— `INTEGRATION-DESIGN.md`(設計權威)、`INTEGRATION-MILESTONES.md`(append-only)、`specs/<NNN>-*/`、constitution。需要描述某 follow-up 時,把事實**寫進該檔自身或 DESIGN**,不要寫「見 CHECKLIST §X」。CHECKLIST 內部的 §X↔§Y 互引可以(自身內);跨檔指向 CHECKLIST 不行。

**重複犯點**:2026-06-02 一個 session 內兩次被糾正 —— 017 收尾 + v1.2.1 amendment 都在 constitution/DESIGN/MILESTONES 寫了「見 CHECKLIST §2.20/§2.21」。注意既有 docs(DESIGN §10 條目、MILESTONES rows)也殘留大量「見 CHECKLIST §2.X」舊引用 —— 那是既有債、**至少別再新增**;要不要清既有由 user 定。相關 [[feedback_docs_role_separation]]。

---

### [feedback] 已完成項歸檔=單行 heading、body 清空(別撐大 SOP 注入檔)  `feedback_checklist_archive_format`

CHECKLIST §2 follow-up 標 ✅ 歸檔時:**改成單行 heading,body 預設清空**。

範本(2026-05-28 user 親手調整 §2.6 後示範):
```
### 2.6 superpowers 000-base-web-docker-bootstrap.md §3.2 corepack 範例同步 ✅ 全完成+已歸檔 (2026-05-28)
```

(本來我寫 `### 2.6 ✅ 標題 (2026-05-28b)` 加幾條 bullet,user 改成上面格式 + 拔掉 body。)

**Why**:對齊 §2.1 / §2.2 / Phase 0 既有 archive 格式;細節已永久落地 MILESTONES.md(commit hash + 主題)+ 本 commit message,CHECKLIST 內留 body 屬於 §7.5「**清理紀律 — 檔案不能無限膨脹**」違反。CHECKLIST 由 SessionStart hook 每次注入,body 越精簡越好。

**How to apply**:
- 標題:加上對應位置 prefix(superpowers / specs / deploy / docs 等),讓未來讀者一眼看出來源。日期只用 `YYYY-MM-DD`,不加 `a/b` 區分(MILESTONES 已有 commit 細粒度)
- Body:**預設清空**。例外是有 forward reference 才保留:§2.1 保留是因為「兩條鐵紀律」要從 constitution.md 反查;§2.2 保留是因為是 baseline 規格指標。「做了什麼」類描述一律不留(已在 MILESTONES + commit msg)
- 不寫「Bonus」「side discovery」之類擴張內容 — 這類發現由 commit message + MILESTONES 紀錄即可
- 不寫 cross-link 到 commit hash(讀者要看 commit 直接 `git log --grep`)

**第二階段歸檔 — 累積後搬出 CHECKLIST(2026-05-29 user 新增,已寫進 CLAUDE.md §7.4/§7.5 step 4)**:
單行 ✅ heading 在 CHECKLIST §2 累積數節後,**批次搬到 MILESTONES §2「✅ 完成+歸檔」**(MILESTONES 自此分 §1 commit 里程碑表 + §2 完成歸檔 follow-up 細節兩節);CHECKLIST §2 原處只留 **1 行收合指標**,如 `> ### §X ~ §Y 全完成+已歸檔(手動搬至 MILESTONES)`。仍 open 的 follow-up、與仍 active 的索引(如 §2.1 兩條鐵紀律)續留 CHECKLIST。**Why**:連單行 ✅ heading 累積多了也會撐大每次注入的 CHECKLIST;MILESTONES 不注入、可永久長,是完成歷史的歸宿(零資訊損失)。

關聯:[[docs-role-separation]](feedback_docs_role_separation.md) — DESIGN 增厚 / CHECKLIST 精簡的延伸應用。

---

### [feedback] doc backfill 在 merge 之後做;merge 用 -m 非 -F -  `feedback_finish_backfill_after_merge`

feature 收尾(finishing-a-development-branch)時,**workspace doc backfill 必須在 `git merge --no-ff <feature> → rev2-admin-root` 之後**才做,不能在 merge 前。

**Why**: CLAUDE.md §6 的 `<!-- SPECKIT -->` marker + `specs/<NNN>/` spec docs 是在 **feature branch** 上由 speckit 步驟 commit 的;`rev2-admin-root` 在 merge 前仍是**上一個 feature 的 marker/CHECKLIST 內容**。若在 merge 前 checkout rev2-admin-root 就改 marker/CHECKLIST/MILESTONES,old_string 會對不上(那是 feature-branch 才有的內容)→ Edit 全部 "String not found"。

**How to apply**(收尾正確順序,對齊 CLAUDE.md §3/§4.1):
1. 第一段:`cd rust-api && git push origin rev2-admin-rust-api`(worktree → fork)
2. 第二段(在 feature branch 上):commit 外層部署檔(Dockerfile/compose)+ `git add rust-api && git commit`(SHA-pin bump)+ push feature branch
3. `git checkout rev2-admin-root` → `git merge --no-ff <feature> -m "..."`(**用 `-m` 不要 `-F -`;`git merge -F -` 不讀 stdin、會 `could not read file '-'` 失敗**)
4. **merge 後**才做 doc backfill(此時 015 marker/CHECKLIST/MILESTONES 已隨 merge 落到 rev2-admin-root),`git add` 三檔單段 commit
5. `git push origin rev2-admin-root` + `git push origin <feature>`(保留 feature branch、不刪)

**worktree+submodule gotcha**:checkout rev2-admin-root 時 worktree HEAD 若已超前 outer pin → `git status` 顯示 ` M rust-api`(new commits),這是正常(§4.7);`git merge --no-ff <feature>` 會把 gitlink 更新成 worktree HEAD(merge 結果 == worktree state)→ 不會被 "would be overwritten" 擋,直接 merge 成功。

關聯:[[feedback_finish_checklist_full_backfill]](backfill 要掃全 §1/§2/§4/§5)。
2026-06-01 015-audit-middleware 收尾踩過(merge -F - 失敗 + pre-merge 改 doc 全 not-found)。

---

### [feedback] 收尾回填先核對 git 實際狀態、別抄 stale 進度檔  `feedback_backfill_verify_git_state`

收尾回填(MILESTONES/DESIGN/CHECKLIST/CLAUDE §6)寫某 feature 的 merge/push 狀態時,**先用 git 核對實際狀態**(`git log <root>` 找 Merge commit / `git status -b` 看 vs origin / `git submodule status` / worktree `origin/<branch>..HEAD`),**不要直接抄 CHECKLIST §1 既有敘述** —— 它常 stale。

**Why:** 019 收尾時,CHECKLIST §1 / SessionStart 注入快照把 017/018 寫成「本地 merge/未 merge 未推」,我照抄進 019 的回填(MILESTONES row + §1 下一步)。實際上 017/018 早在前次 session 就 merge(018=`8844105`)+ 已推 origin(root==origin 證)。差點把錯誤狀態寫進**永久 MILESTONES**(append-only、難改)。

**How to apply:** finish 階段 backfill 前先跑一輪 git 狀態核對(尤其 push 後要把「待 finishing/未推」改成「merge <SHA>+已推」);MILESTONES row 首欄用 **merge commit SHA**(對齊 016/017 row 慣例);發現鄰近 pre-existing feature 的 stale 狀態(factual error,git 可證)順手校正以免文件互相矛盾。延伸 [[feedback_finish_checklist_full_backfill]];MILESTONES SHA 處理見 [[project_milestones_self_ref_sha]]。

---

### [feedback] 凍結 spec 被 rename 時的 cross-ref 兩級放置慣例  `feedback_frozen_spec_crossref`

凍結 spec(specs/<NNN>/**)內文不改寫,但被後續 feature rename 的名稱(卷名/服務名/db 名等)該怎麼標 superseded,依「該名稱是否會被讀者複製貼上執行」分兩級:

- **描述性提及**(表格、敘述內的名稱):在該 feature 最 load-bearing 處加 **1 行** `> **superseded(<NNN>)**` cross-ref 指向新 feature + 現行權威(CLAUDE.md §8.2.x)。這是既有 006 FR-010 慣例。
- **可複製貼上的操作指令**(quickstart / verification-commands 內的 bash 指令,含舊名):**額外**在該指令行正上方加 1 行 inline `# ⚠️ superseded(<NNN>):...` 警語,點明新名 + 指向現行權威、註明「下行為凍結當時舊名、勿直接複製」。舊指令本體保留不改。

**Why**:2026-05-29 對 001~006 跑 spec-compliance review 時,004 quickstart.md / verification-commands.md 的 prod seed 指令(`docker run -v rev2_front_nginx_certs:...`)在 006 改名後變成複製貼上會踩雷的陷阱;當時 006 只在 004/data-model.md 加了 1 行 cross-ref(描述性表格),沒覆蓋到操作指令。user 拍板「加 cross-ref 警語」而非「只記 backlog」或「不動」。

**How to apply**:未來任一 feature rename 了早期凍結 spec 引用的名稱時,先 grep 該名稱在凍結 spec 的所有出現處,區分描述 vs 可執行指令兩類分別標註;絕不改寫凍結指令本體(doctrine:spec = 該 feature 凍結 as-built 紀錄)。相關 doctrine 見 [[docs-role-separation]]。

---

### [feedback] 跨 source-isolation 邊界參照他 repo schema:隔離 subagent 只抽純欄位事實  `feedback_rev1_rustapi_schema_reference`

當 rev2 feature 需要「sys_role/sys_user/dept 等表補欄、或新表 schema 設計」的參照時，**參照源 = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api`**（rev1 已走完 DESIGN-A→DESIGN-B 遷移，nestjs 退場、後端職責全收進這份 rust-only rust-api，故它是「已吸收 nestjs 功能的完整 rust 後端」）。**不是** nestjs 源倉本身。

**Why**：base-web typings 只說 wire 要哪些欄（roleDesc/status/userGender/...），rev1 rust-api 提供「這些欄在真實 schema 怎麼落地（型/約束/命名/index）」的交叉參照（rev1 同樣對 base-web 對齊過）。2026-05-30 user 親授權。

**這是對 constitution §I.5 / DESIGN §873「rev2 research 不准 grep rev1/nestjs source」的 user 授權破例**。

**How to apply**：
- **必用隔離 subagent**讀 rev1 rust-api 的 entity+migration，只抽**純欄位事實表**（表→欄名/型/nullable/約束/index）回報；**不讀** rev1 DESIGN 文件、**不回**設計理由、**不貼整檔** → 避免「答案污染」+「污染 context」。
- **權威分工**：base-web typings(§I.1)=wire 要什麼欄的權威；rev1 rust-api=schema 落地交叉參照(非照抄)；**rev2 自己 pattern**(009 soft-delete trait / 011 audit / 命名慣例)=怎麼建 migration 的權威。
- spec 階段須記 Deviation:本 feature 參照 rev1 rust-api、屬 §I.5 user 授權破例;評估 constitution §I.5 是否需 amendment 加此 carve-out。
- 相關:[[project_rustapi_build_test_env]]。

---

## 🔴 rev2 專屬、歷史參考(2 條)

> 綁 rev2 特定文件格式(CHECKLIST 段落結構),rev3 文件結構不同(單一設計書 + 附錄 G)。除非 rev3 也採類似動態 todo 檔,否則可略過。

### [feedback] CHECKLIST「下一步」須自成獨立段落(Edit newline 陷阱)  `feedback_checklist_nextstep_own_line`

CHECKLIST §1 結構:`**最新進展**`(滾動 2 條 bullet)→ 空行 → marker `> 以下為預計下一步...` → 空行 → `**下一步**:`。**「下一步」永遠自成獨立段落,絕不可黏到「最新進展」最後一條 bullet 的行尾。**

**Why:** 編輯/刪除「最新進展」rolling bullet(尤其刪最舊那條 + prepend 新條)時,Edit 的 newline 處理不慎會吃掉 bullet 與「下一步」之間的 `\n`,把 `**下一步**:` 黏到上一行 bullet 尾。user 說「一直被你合到上面去」(2026-06-02 019 收尾期間多次),已手動修復並在 §1 加防呆 marker 註解 `> 以下為預計下一步 (不要再被合到最新進展了)`。

**How to apply:** 動 §1「最新進展」後務必確認 `**下一步**:` 仍在獨立行(前有空行 + marker)。Edit 刪 bullet 時,old_string 含該 bullet 但**保留其後的 `\n`**(別連下一個 `\n` 一起吃)。改完 grep `)\*\*下一步\*\*` 應為空(無黏連)。沿 [[feedback_finish_checklist_full_backfill]] 的 §1 滾動紀律。

---

### [feedback] 收尾回填要掃全檔所有相關段(§1/§2/§4/§5)  `feedback_finish_checklist_full_backfill`

feature 收尾(finishing-a-development-branch 階段)回填 `docs/INTEGRATION-CHECKLIST.md` 時,必須掃**全檔所有相關段**,不能只更 §1 Current Focus + §2 follow-up + MILESTONES。具體要一起檢查:

- **§1**:Current Focus 階段句 + 最新進展(滾動最近 2 條、drop 最舊)+ 下一步
- **§2**:新 feature 的 follow-up backlog（`### 2.NN`）
- **§4 Roadmap & Phase 狀態**:該 feature 對應的 Phase heading（「尚未啟動」→「進行中」/「全完成」)+ feature checkbox(`[ ]`→`[x]`/`[~]`)+ **它順帶推進的其他 Phase 項**（如 016 是 Phase 4，但也推進了 Phase 3 的 enforce rollout / policy seed → 那兩條也要補「016 續」)
- **§5 跨 feature 待驗證項**:該 feature 解決/驗證掉的不變式 mark `[x]`（如 016 解決了 §5.1 Role.id 型 string→number、§5.10 SQL injection 紀律首個業務 query)
- **MILESTONES §1** + **CLAUDE.md §6 marker** + **DESIGN 回填**

**Why**:2026-05-30 016 收尾,我只回填了 §1/§2/MILESTONES/§6/DESIGN,**漏了 §4 Roadmap Phase 狀態 + §5 跨feature項**;user 連問兩次「§4 裡狀態有更新嗎?」「還有要注意什麼?」才補。§4/§5 是 SOP-注入的進度真相一部分,漏更會讓下次 session 誤判 Phase 狀態。

**How to apply**:收尾回填當成 checklist 逐段過一遍(§1→§2→§4→§5→MILESTONES→§6 marker→DESIGN),特別記得 §4 的「順帶推進的他 Phase 項」與 §5 的「解掉的不變式」這兩個容易漏的點。與 [[feedback_docs_role_separation]]（DESIGN 增厚/CHECKLIST 精簡）、[[feedback_checklist_archive_format]]（§2 歸檔格式）併看。

---
