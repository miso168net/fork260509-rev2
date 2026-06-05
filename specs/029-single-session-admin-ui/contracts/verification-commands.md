# Contracts / Verification Commands: single-session admin UI

**Feature**: 029-single-session-admin-ui | **Date**: 2026-06-06

> C-V 合約。029 建在 028 之上，**不改 028 enforcement 邏輯**（`resolve_policy`/`is_current`/gate/refresh 行為不變）——只把「系統預設」來源從不可變 config 換成 runtime store（`system_settings` KV + `AppState.session_mode: Arc<RwLock<SessionMode>>`），再加 per-account policy 管理 UI。server 為 bin-only crate → live 驗收用 **in-crate `#[cfg(test)] #[ignore]` + env-gate**（沿 sys_login_attempt/sys_token/028 範本）。029 觸及 **Redis（`settings:invalidate` pub/sub + `DEL sess:{uid}`）+ Postgres（`system_settings` / `sys_user`）** → live `#[ignore]` env-gate 需 **`DATABASE_URL` + `REDIS_URL`**，dcargo 跑時須掛 compose 網路（見 §2；沿 project memory「dcargo-with-network 跑 #[ignore]」）。活體前 `dcargo build` + `docker compose restart rust-api`（WSL2 cargo-watch 不可靠）。
>
> **prod image build 非強制**（無新 workspace crate；redis/sea-orm/serde/chrono 皆 server 既有 dep）。**base-web typecheck + build 必跑**（新 view + service wrapper + typings）。
>
> **028 same-second-refresh caveat 在 029 不適用**：029 的 end-to-end 踢人路徑走 **access `getUserInfo`**（非 refresh），不涉及同秒 refresh 競態。

## §0 環境
```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# dev stack（若未起）：docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
dcargo build -p server -p migration -p entity
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
PW='123456'; BASE=http://127.0.0.1:21081
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
RCLI(){ docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T redis-stack redis-cli -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning "$@"; }
# host 無 jq → JSON 用 python3
pj(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
```

## §1 純單元測試（常規 `dcargo test -p server`，no-DB）

- **U1 typed accessor `value_type` 解析**（TDD red→green，純函式）：`system_settings` 的 `value_type="enum:on,off"` → 對 `setting_value` 解析成 `SessionMode`（`get_session_default` helper 或 handler 內 parse seam）：
  - `"on"  → SessionMode::On`
  - `"off" → SessionMode::Off`
  - `"inherit" / 未知 / 空 / value_type 非 enum:on,off → fallback`（沿 `config::parse_session_default()` 之 fail-safe；spec 不得讓 invalid 值 panic）
- **U2 `SystemSetting` wire 序列化**（serde camelCase round-trip：`setting_key`→`settingKey`、`setting_value`→`settingValue`、`value_type`→`valueType`；確認 getSystemSettings 回應欄位名與 base-web typings 對齊）。

## §2 活體 in-crate `#[ignore]` 測試（**需 Postgres + Redis**）

dcargo-with-network（掛 compose 網路 + 雙 env；`system_settings`/`sys_user`/Redis 真相）：
```bash
PWPG=$(cat deploy/secrets/postgres_password.txt); NET=rev2-admin_rev2_net
RPW=$(cat deploy/secrets/redis_password.txt)
docker run --rm --network "$NET" \
  -e DATABASE_URL="postgres://soybean:$PWPG@postgres:5432/soybean_admin_rust" \
  -e REDIS_URL="redis://:$RPW@redis-stack:6379" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server -- --ignored --test-threads=1 system_settings::live_tests
```
- **L1 settings facade get/update + 011 audit row**：`system_settings::get(db,"single_session_default")` → seed `('single_session_default','off',...)`；`update(db,"single_session_default","on",operator{id:1,ip:None})`==`Ok(true)`；psql `setting_value`=='on'、`updated_by`==1、`updated_at` 非 NULL（§I.6 updated_at/by pair col_expr）；`sys_operation_log` 新增一列 `operation_type=Update`、`entity_table='system_settings'`、`payload_before/after` 含 off→on（011 `mutate_in_txn` + `audit_json()`）。
- **L2 `sys_user::update_session_policy` + `DEL sess:{uid}`**：`update_session_policy(db, 3, "on", operator)`==`Ok(true)`；psql：`sys_user(id=3).session_policy`=='on'、**`current_session_id` 不被觸及**（只動 session_policy 欄、data-model 028 §7 預留）、`sys_operation_log` 新增 `entity_table='sys_user'` Update 列；handler 路徑驗 `DEL sess:3` 後 `RCLI EXISTS sess:3`==0（028 `is_current` 下次請求 lazy-rehydrate 新 policy；**無 DEL 則被 028 PointerRec cache 遮住** —— 此為 brainstorm 關鍵點，不可略）。
- **L3 settings-watcher reload**：起 `spawn_settings_watcher(client, session_mode.clone())`（mirror `spawn_policy_watcher`）→ psql 直改 `system_settings.single_session_default`='on' → `PUBLISH settings:invalidate 1`（或 `publish_settings_invalidate`）→ 等 reload → `*session_mode.read().await`==`SessionMode::On`（watcher run_once subscribe loop 自 DB reload 並 write-lock 更新；對照 `auth/policy_watcher.rs`）。
- **L4 boot load**：throwaway DB seed `single_session_default='on'` → 跑 main.rs boot 等價路徑（load `system_settings.single_session_default` → present 則 parse 成 `SessionMode::On`）→ `session_mode` 初值==On；seed 改為「無此列」→ fallback `config::parse_session_default()`（驗 present/absent 兩分支）。

## §3 curl/psql 端到端（經 rust-api :21081，需跑 028+029 碼）

```bash
# 前置：取 Super / Admin / User 三 token（Super 為 R_SUPER、有 3 新端點權；Admin/User 無）
ST=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}" | pj "d['data']['token']")
AT=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")
UT=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"User\",\"password\":\"$PW\"}"  | pj "d['data']['token']")

# C1 Super getSystemSettings → 0000、含 single_session_default 列
curl -s $BASE/systemManage/getSystemSettings -H "Authorization: Bearer $ST" | pj "d['code']"                      # 0000
curl -s $BASE/systemManage/getSystemSettings -H "Authorization: Bearer $ST" | grep -q single_session_default && echo "✓ 有預設列"

# C2 Admin / User 打 3 新端點 → 5003（enforce gate 拒，非 R_SUPER）
curl -s $BASE/systemManage/getSystemSettings -H "Authorization: Bearer $AT" | pj "d['code']"                       # 5003
curl -s -X POST $BASE/systemManage/updateSystemSetting   -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"key":"single_session_default","value":"on"}' | pj "d['code']"   # 5003
curl -s -X POST $BASE/systemManage/updateUserSessionPolicy -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"userId":3,"policy":"on"}' | pj "d['code']"                      # 5003

# C3 ★ END-TO-END runtime toggle（system default off→on，舊 session 即時被踢 7777）
#   前置：確保 Admin 的 per-account = inherit（吃系統預設），且系統預設目前為 off
$PSQL "UPDATE sys_user SET session_policy='inherit', current_session_id=NULL WHERE user_name='Admin'"
$PSQL "UPDATE system_settings SET setting_value='off' WHERE setting_key='single_session_default'"
RCLI DEL sess:2 >/dev/null    # 清 Admin(id=2) pointer cache，確保乾淨起點
# Admin 兩處登入（系統 off + inherit → 多裝置並存、皆 0000）
AO1=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")
AO2=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $AO1" | pj "d['code']"   # 0000（off 不踢）
# Super 透過管理端把系統預設切 on（updateSystemSetting → DB write + PUBLISH settings:invalidate）
curl -s -X POST $BASE/systemManage/updateSystemSetting -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"key":"single_session_default","value":"on"}' | pj "d['code']"   # 0000
$PSQL "SELECT setting_value FROM system_settings WHERE setting_key='single_session_default'"   # on
# watcher reload 後 session_mode==On；inherit 帳號即吃 on → 舊 session 下個 access 請求被踢
RCLI DEL sess:2 >/dev/null    # 模擬 cache 失效 / 確保 is_current 重新解析（pointer 尚未 set → 首個 set 即定 current）
AO3=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")  # on 後新登入 → set pointer=AO3 的 sid
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $AO1" | pj "d['code']"   # 7777（舊 session 被 runtime-toggled 系統預設踢出 — access 路徑）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $AO3" | pj "d['code']"   # 0000（當前 session）

# C4 per-account policy（updateUserSessionPolicy account=on → 被踢 + DEL sess 驗；others 不受影響）
$PSQL "UPDATE system_settings SET setting_value='off' WHERE setting_key='single_session_default'"   # 還原系統 off，隔離 per-account 行為
curl -s -X POST $BASE/systemManage/updateSystemSetting -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"key":"single_session_default","value":"off"}' >/dev/null
# User(id=3) 先以 off 兩處登入
UO1=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"User\",\"password\":\"$PW\"}" | pj "d['data']['token']")
UO2=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"User\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $UO1" | pj "d['code']"   # 0000（off 並存）
# Super 把 User per-account 設 on（handler DB write + DEL sess:3）
curl -s -X POST $BASE/systemManage/updateUserSessionPolicy -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"userId":3,"policy":"on"}' | pj "d['code']"   # 0000
$PSQL "SELECT session_policy FROM sys_user WHERE id=3"     # on
RCLI EXISTS sess:3                                          # 0（handler 已 DEL → 028 下次請求 lazy-rehydrate on）
UO3=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"User\",\"password\":\"$PW\"}" | pj "d['data']['token']")  # on 後新登入 → set pointer
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $UO1" | pj "d['code']"   # 7777（per-account on 踢舊）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $UO3" | pj "d['code']"   # 0000
# others 不受影響：Admin（inherit + 系統 off）並存仍 0000
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $AO3" | pj "d['code']"   # 0000（未被波及）

# C5 失敗碼紀律：被踢回應 = 7777，grep 無 3333/9999/9998（沿 028 wire 中性）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $UO1" | grep -E '3333|9999|9998' && echo "❌ 禁用碼" || echo "✓ 無禁用碼"

# C6 getUserList wire 含 sessionPolicy（additive 欄，§I.3 ADAPT）
curl -s -X POST $BASE/systemManage/getUserList -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"current":1,"size":10}' | grep -q sessionPolicy && echo "✓ wire 有 sessionPolicy" || echo "❌ 缺欄"

# 還原 dev DB（避免污染後續）
$PSQL "UPDATE sys_user SET session_policy='inherit', current_session_id=NULL WHERE user_name IN ('Super','Admin','User')"
$PSQL "UPDATE system_settings SET setting_value='off' WHERE setting_key='single_session_default'"
RCLI DEL sess:1 sess:2 sess:3 >/dev/null
```
> **C3 註（END-TO-END runtime toggle）**：028 把系統預設視為**不可變 config**；029 將其改為 runtime store + `settings:invalidate` watcher。C3 即在驗「Super 從管理端把系統預設 off→on，inherit 帳號的舊 access session 立刻被踢」這條完整鏈（DB write → PUBLISH → watcher reload `session_mode` → 新登入 set pointer → 舊 session `is_current`==false → `getUserInfo` 7777）。**踢人走 access getUserInfo、不走 refresh**，故 028 的同秒 refresh caveat 在此無關。
> **錯誤碼**：管理端權限拒 = `5003`（enforce_mw / Casbin，非 R_SUPER）；單一-session 踢出 = `7777`（沿用 028 既有碼，絕不 `3333/9999/9998`）。

## §4 守恆 + migration 可逆
```bash
dcargo test -p server                       # 既有測試 + 新測（U1/U2 + L1-L4）全綠
dcargo test -p server --test entity_access_lint        # 守（system_settings facade 為唯一寫通道、handler 不直碰 entity::；009 不破）
dcargo test -p server --test endpoint_coverage_lint    # **33**（30→33；新增 getSystemSettings/updateSystemSetting/updateUserSessionPolicy 三端點，EXPECTED_ROUTE_COUNT 同步 33）
grep -rn "Migrator::up" rust-api/server/src/           # 0（守 007）
# migration up→down→up 可逆（throwaway DB；m028 建 system_settings + seed、m029 seed casbin/menu policy）：
#   throwaway DB 跑 m..029 up → 查 system_settings 表存在 + single_session_default seed 列 + casbin_rule 3 條 p R_SUPER 新端點 + sys_menu manage_system-settings 列 + casbin menu policy
#   down -n 1（m029）→ casbin/menu seed 三組消失（DELETE WHERE ptype='p' AND v1 IN(3 paths)/menu）
#   down -n 1（m028）→ system_settings 表消失
#   up → 全部回來
# base-web typecheck（新 view + service wrapper + typings User.sessionPolicy + SystemSetting）：
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T base-web pnpm typecheck   # 0 error
```

## §5 CDP（建議、isolated browser context，project memory）
- **系統預設 toggle**：Super 登入 → 進 `/manage/system-settings`（新 view `views/manage/system-settings/index.vue`）→「single-session 系統預設」section 切 on/off switch（`fetchUpdateSystemSetting`）→ 預期 toast 成功；另開一 inherit 帳號舊 tab，切 on 後該 tab 下個受保護請求彈「账号在他处登录」modal → 導回 /login（runtime toggle 收斂）。
- **per-account policy action**：Super 進 `/manage/user`（`views/manage/user/index.vue` 新增 sessionPolicy 欄〔status 後、operate 前〕+ 行內「設定單一-session」action）→ 開 NModal/NSelect（inherit/on/off）對某帳號設 on（`fetchUpdateUserSessionPolicy`）→ 該帳號另一 tab 舊 session 下個請求彈 modal → 登出收斂；其餘帳號不受影響。
- **menu 可見性（§I.2 Casbin）**：Super 側欄可見「系統設定」選單（`manage_system-settings`，`getUserRoutes` 經 `enforce((role,'manage_system-settings','menu'))` 通過）；以 non-Super（Admin/User）登入 → 側欄**無**此選單、直打 `/manage/system-settings` 404/無權。
- isolated context（browser-level WS + `Target.createBrowserContext` + `attachToTarget` flatten）、不擾 user 既有 tab/登入態（project memory「CDP isolated context verify」）。

## §6 prod image build（可選）
無新 workspace crate → rust 端非強制；若要絕對保險：
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
```
base-web 端（新 view + service + typings）**建議跑 prod build** 確認無打包破口：
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build base-web
```
