# Contracts / Verification Commands: single-session enforcement

**Feature**: 028-single-session-enforcement | **Date**: 2026-06-05

> C-V 合約。server 為 bin-only crate → live 驗收用 **in-crate `#[cfg(test)] #[ignore]` + env-gate**(沿 sys_login_attempt/sys_token 範本)。**028 的 `is_current`/`set_pointer` 觸及 Redis + Postgres** → live `#[ignore]` 測試 env-gate 需 **`DATABASE_URL` + `REDIS_URL`**,且 dcargo 跑時須掛 compose 網路(見 §2;沿 project memory「dcargo-with-network 跑 #[ignore]」)。活體前 `dcargo build` + `docker compose restart rust-api`(WSL2 cargo-watch 不可靠)。
>
> **prod image build 非強制**(research D11:無新 workspace crate;redis/uuid/chrono 皆 server 既有 dep)。

## §0 環境
```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# dev stack（若未起）：docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
dcargo build -p server -p migration -p entity
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
PW='123456'; BASE=http://127.0.0.1:21081
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
# host 無 jq → JSON 用 python3
pj(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
```

## §1 純單元測試(常規 `dcargo test -p server`,no-DB)

- **U1 `resolve_policy` 全分支**(TDD red→green,純函式 — spec FR-015):
  - `("on",  _)        → true`
  - `("off", _)        → false`
  - `("inherit", On)   → true`
  - `("inherit", Off)  → false`
  - `(未知/空, On|Off) → 沿 system_default`(fail-safe)
- **U2 `Claims` 序列化含 `sid`**(sign→verify round-trip 帶 sid;沿既有 jwt round-trip 測加 sid 斷言)。

## §2 活體 in-crate `#[ignore]` 測試（**需 Postgres + Redis**）

dcargo-with-network(掛 compose 網路 + 雙 env;sys_user/Redis 真相):
```bash
PWPG=$(cat deploy/secrets/postgres_password.txt); NET=rev2-admin_rev2_net
RPW=$(cat deploy/secrets/redis_password.txt)
docker run --rm --network "$NET" \
  -e DATABASE_URL="postgres://soybean:$PWPG@postgres:5432/soybean_admin_rust" \
  -e REDIS_URL="redis://:$RPW@redis-stack:6379" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server -- --ignored --test-threads=1 session::live_tests
```
- **L1 policy=on 踢舊**:set sys_user.session_policy='on';`set_pointer(u, sidA, "on")` → `is_current(claims{sid:sidA})`==true;`set_pointer(u, sidB, "on")`(模擬 B 登入)→ `is_current(claims{sid:sidA})`==**false**(被踢)、`is_current(claims{sid:sidB})`==true;psql `current_session_id`==sidB。
- **L2 policy=off 不踢**:session_policy='off'(或 inherit + 系統 off)→ `is_current(任意 sid)`==**true**(不踢)。
- **L3 hybrid rehydration**:`set_pointer(u, sidX, "on")` → Redis `DEL sess:{u}`(模擬 cache miss/重啟)→ `is_current(claims{sid:sidX})` 仍 **true**(自 sys_user 回填、不誤踢);`is_current(claims{sid:其他})`==false。
- **L4 revoke_other_chains**:user 建 3 條 active chain(沿 027 create_chain_head)→ `revoke_other_chains(u, keep=chainB)` → psql:chainB 仍 active、其餘 revoked;回傳 affected==(非 keep 的 active 數)。
- **L5 resolve fail-open(I/O 故障,必驗)**:注入 Redis + sys_user 皆不可達(指向壞 URL / mock 錯)→ `is_current` 回 **true**(fail-open、log warn;非主授權閘,data-model §6)。**此為 fail-open 契約的唯一活體驗證,不可略**(否則 implementer 易反射性 fail-closed、與 enforce_mw 主閘混淆)。

## §3 curl/psql 端到端(經 rust-api :21081,需跑 028 碼)

```bash
# 設定一個 policy=on 帳號（028 後端設定 = DB；管理 UI 屬 029）
$PSQL "UPDATE sys_user SET session_policy='on' WHERE user_name='Super'"      # Super 啟用單一-session
$PSQL "UPDATE sys_user SET session_policy='off' WHERE user_name='Admin'"     # Admin 多裝置（或留 inherit + 系統 off）

# C1 policy=on：兩處登入 → 第一處被踢 7777
L1=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}")
A1=$(echo "$L1" | pj "d['data']['token']")
L2=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}")   # 第二處登入
A2=$(echo "$L2" | pj "d['data']['token']")
# 第一處 access 打受保護端點 → 7777（被踢）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $A1" | pj "d['code']"     # 7777
# 第二處正常
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $A2" | pj "d['code']"     # 0000
# psql：current_session_id = 第二次登入的 sid（A2 的 sid）
$PSQL "SELECT current_session_id IS NOT NULL FROM sys_user WHERE user_name='Super'"  # t

# C2 policy=off（Admin）：兩處登入並存（027 多裝置行為）
B1=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")
B2=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Admin\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $B1" | pj "d['code']"     # 0000（不踢）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $B2" | pj "d['code']"     # 0000

# C3 失敗碼紀律：被踢回應 = 7777,grep 無 3333/9999/9998
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $A1" | grep -E '3333|9999|9998' && echo "❌ 禁用碼" || echo "✓ 無禁用碼"
# 4 gate 全覆蓋（被踢 A1 對 enforce / getUserRoutes / isRouteExist 亦 7777）
curl -s $BASE/auth/getUserRoutes -H "Authorization: Bearer $A1" | pj "d['code']"   # 7777
curl -s -X POST $BASE/systemManage/getUserList -H "Authorization: Bearer $A1" | pj "d['code']"  # 7777（enforce gate；路徑依實際受保護端點調整）

# C4 refresh：policy=on 被踢 session refresh → 7777；正常單一 refresh → 0000 + sid 繼承
RT1=$(echo "$L1" | pj "d['data']['refreshToken']")
curl -s $BASE/auth/refreshToken -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT1\"}" | pj "d['code']"   # 7777（A1 已被 A2 取代；027 鏈亦被 revoke_other_chains → 8888 亦可能，視檢查順序，皆非 3333/9999/9998）
RT2=$(echo "$L2" | pj "d['data']['refreshToken']")
curl -s $BASE/auth/refreshToken -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT2\"}" | pj "d['code']"   # 0000（當前 session、sid 繼承）

# 還原 dev DB（避免污染後續）
$PSQL "UPDATE sys_user SET session_policy='inherit', current_session_id=NULL WHERE user_name IN ('Super','Admin')"
```
> **C4 註**:被踢 session 的 refresh 有雙重擋 —— D7 `revoke_other_chains` 已使其 027 鏈 `revoked`(rotate→Reuse→`8888`),且 D8 pointer 檢查 `sid≠pointer`→`7777`。兩者皆**非** `3333/9999/9998`、皆乾淨登出;檢查順序(先 pointer 或先 rotate)決定回 `7777` 或 `8888`,spec FR-010 只要求非禁用碼 → 二者皆合規(tasks 釘定順序、預期先 pointer→`7777` 與 gate 一致)。
> **部署過渡(C-外、邏輯論證)**:pre-028 token 無 `sid` → `jwt::verify` deserialize 失敗 → `3333`(getUserInfo)/`8888`(refresh deserialize 失敗)→ 一次性重登;028 簽的新 token 含 sid、正常。curl 難造「合法簽章但無 sid」的舊 token,以 028 新 token 正常 + 等價論證覆蓋(deserialize required 欄缺失即失敗)。

## §4 守恆 + migration 可逆
```bash
dcargo test -p server                       # 既有 218 + 新測(U1/U2 + L1-L5) 全綠
dcargo test -p server --test entity_access_lint        # 17（新 session.rs 用 entity? 經 facade、不破;若 session.rs 純讀 facade 回傳 → 守）
dcargo test -p server --test endpoint_coverage_lint    # 30（**無新對外端點、不變**）
grep -rn "Migrator::up" rust-api/server/src/           # 0（守 007）
# migration up→down→up 可逆（throwaway DB；sys_user 加/減 2 欄、既有資料不動）：
#   throwaway DB 跑 m..027 up → 查 sys_user 有 current_session_id/session_policy 欄
#   down -n 1 → 兩欄消失
#   up → 兩欄回來
```

## §5 CDP（建議、isolated browser context,project memory）
- **policy=on 帳號**:tab1 登入 → tab2(同帳號)登入 → 回 tab1 操作 → 彈「账号在他处登录」modal → 確認 → 導回 /login。
- **policy=off 帳號**:tab1 + tab2 同帳號並存操作皆正常(不踢)。
- isolated context(browser-level WS + Target.createBrowserContext)、不擾 user 既有 tab。

## §6 prod image build（可選）
無新 workspace crate(D11)→ 非強制;若要絕對保險:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
```
