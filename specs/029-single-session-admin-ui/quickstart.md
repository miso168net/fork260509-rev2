# Quickstart: single-session admin UI(029)

**Feature**: 029-single-session-admin-ui | **Date**: 2026-06-06

> 實作完成後的最短驗證路徑。完整 C-V 見 [contracts/verification-commands.md](contracts/verification-commands.md)。**029 = rust-api + base-web 雙倉**;在 028 引擎之上加管理面(系統預設 runtime 可調 + per-account policy UI + `system_settings` KV 基座)。**不改 028 enforcement 邏輯**(resolve_policy/is_current/gate/refresh 行為不變、僅系統預設來源由 immutable config 改為 runtime store)。

## 0. 前置(dcargo + dev stack)
```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait     # postgres + redis + rust-api ...
```

## 1. build + 套 migration + 重啟（載入 029 碼）
```bash
dcargo build -p server -p migration -p entity
# migration m..028(create_system_settings) + m..029(seed_settings_admin) 由 migrate service 於 up 時自動套
# （或手動 docker compose run --rm migrate up）
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
# 確認 system_settings 表 + seed row
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT setting_key,setting_value,value_type FROM system_settings WHERE setting_key='single_session_default'"
# → single_session_default|off|enum:on,off
```

## 2. 純單測（no-DB）
```bash
dcargo test -p server session_default        # U1 typed accessor value_type='enum:on,off' parse→SessionMode（含 invalid）
dcargo test -p server                         # 全套件綠（028 基線 + 新測）
```

## 3. live-DB #[ignore]（Postgres + Redis）
```bash
PWPG=$(cat deploy/secrets/postgres_password.txt); RPW=$(cat deploy/secrets/redis_password.txt); NET=rev2-admin_rev2_net
docker run --rm --network "$NET" \
  -e DATABASE_URL="postgres://soybean:$PWPG@postgres:5432/soybean_admin_rust" \
  -e REDIS_URL="redis://:$RPW@redis-stack:6379" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server -- --ignored --test-threads=1 system_settings::live_tests
# L1 facade get/update + 011 audit row（sys_operation_log）/ L2 update_session_policy 只動 session_policy + DEL sess:{uid}
# L3 settings-watcher PUBLISH "settings:invalidate" → in-memory session_mode reload / L4 boot load DB→session_mode
```

## 4. curl 端到端（核心驗收）
```bash
PW='123456'; BASE=http://127.0.0.1:21081
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
pj(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
SUP=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}" | pj "d['data']['token']")

# (a) Super 讀/寫 systemSetting 0000；Admin/User 5003（Casbin enforce）
curl -s $BASE/systemManage/getSystemSettings -H "Authorization: Bearer $SUP" | pj "d['code']"   # 0000
ADM=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/systemManage/updateSystemSetting -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' \
  -d '{"key":"single_session_default","value":"on"}' | pj "d['code']"                            # 5003

# (b) updateSystemSetting('single_session_default','on') → 之前 off 的帳號舊 session 下個請求被踢 7777（END-TO-END）
U1=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"User\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/systemManage/updateSystemSetting -H "Authorization: Bearer $SUP" -H 'Content-Type: application/json' \
  -d '{"key":"single_session_default","value":"on"}' | pj "d['code']"                            # 0000（watcher reload）
U2=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"User\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $U1" | pj "d['code']"                   # 7777（舊被踢）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $U2" | pj "d['code']"                   # 0000

# (c) updateUserSessionPolicy 設單一帳號 on（DEL sess:{uid} 使 028 is_current 即時重灌新 policy）；他帳號不受影響
UID_USER=$($PSQL "SELECT id FROM sys_user WHERE user_name='User'")
curl -s $BASE/systemManage/updateUserSessionPolicy -H "Authorization: Bearer $SUP" -H 'Content-Type: application/json' \
  -d "{\"userId\":$UID_USER,\"policy\":\"on\"}" | pj "d['code']"                                 # 0000

# (d) getUserList 回應含 sessionPolicy（additive 欄）
curl -s $BASE/systemManage/getUserList -H "Authorization: Bearer $SUP" | pj "d['data']['records'][0].get('sessionPolicy')"   # on/off/inherit

# 還原
curl -s $BASE/systemManage/updateSystemSetting -H "Authorization: Bearer $SUP" -H 'Content-Type: application/json' \
  -d '{"key":"single_session_default","value":"off"}' >/dev/null
$PSQL "UPDATE sys_user SET session_policy='inherit', current_session_id=NULL WHERE user_name='User'"
```

## 5. base-web（typecheck + 新設定頁 + user 頁 action via CDP）
```bash
cd base-web && pnpm typecheck     # 0 error（User += sessionPolicy + SystemSetting types）
```
CDP isolated context（見 `docs/superpowers/000-base-web-docker-bootstrap.md`）：
- **設定頁**：Super 登入 →「系統設定」選單可見(`manage_system-settings` 經 §I.2 Casbin)、非-Super 不可見;進頁切「single-session 系統預設」on/off switch → `fetchUpdateSystemSetting`。
- **user 頁 action**：user 列「設定單一-session」(NModal/NSelect inherit/on/off)→ `fetchUpdateUserSessionPolicy`;sessionPolicy 欄(status 後、operate 前)顯示。
- **收斂觀察**：系統預設切 on 或單帳號設 on → 該帳號另一 isolated tab 下個操作彈「账号在他处登录」→ 登出;他帳號不受影響。

## 6. 守恆 + migration 可逆
```bash
dcargo test -p server --test entity_access_lint        # 17（system_settings 寫入唯一管道 facade、守 009）
dcargo test -p server --test endpoint_coverage_lint    # 33（30→33：getSystemSettings/updateSystemSetting/updateUserSessionPolicy）
# migration 可逆（throwaway DB）：m..029 up → down -n 2 → up
#   （m..028 system_settings 表+seed row 加/減/回；m..029 casbin_rule 3 p-rule + sys_menu row + menu policy 加/減/回）
# prod image build：無新 workspace crate → optional（base-web typecheck + build 為必要驗收）
```

> **收尾**(實作完成):`superpowers:finishing-a-development-branch` → **兩段式 commit 雙 worktree**(rust-api worktree push fork + base-web worktree push fork + 外層各記 SHA pin)→ merge --no-ff 回 rev2-admin-root、**保留 029 branch**。constitution **v1.6.0 已 ratified**(`3bd3eda`，MODAL-WIRING ★ (e) 解 gate 7);回填 DESIGN(§6/§10 + 029 落地)/ CHECKLIST / MILESTONES。
