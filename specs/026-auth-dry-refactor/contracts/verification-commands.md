# C-V Contract: auth DRY refactor (026)

> **純 refactor → 主驗 = 既有測試前後逐字不變 + 2 新 helper 單測 + curl 等價 smoke(對抗式佐證行為不變)**。無新 wire/endpoint/table → 無新 wire 驗收。
> **dev 前置**:`dcargo build -p server`(加 verify_bearer/issue_tokens + 改 7 callsite)+ `docker compose ... restart rust-api`(WSL2 inotify、project memory)。**無 migration、不動 base-web**。dev DB = `soybean_admin_rust`;rust-api 直連 `http://127.0.0.1:21081`;front-nginx :21080 `/api`;帳號 `123456`(Super/Admin/User)。
> **無新 crate → prod image build 非強制**(本波純 server crate 內重構,無新 workspace member、無 Dockerfile COPY 缺口)。

`dcargo`(host 無 cargo,throwaway dev 容器):
```bash
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
```

## 1. 守恆(refactor 主驗 — 既有測試前後不變 + 新 helper 單測)
```bash
# 全套件綠:既有 auth 單測 + live-DB #[ignore] 前後不變 + 2 新 helper 單測
dcargo test -p server                                  # all green;含 verify_bearer + issue_tokens 新測
dcargo test -p server verify_bearer                    # 新單測:Some/None(缺/壞簽/過期/錯 aud)
dcargo test -p server issue_tokens                     # 新單測:access/refresh round-trip 可驗
dcargo test -p server --test entity_access_lint        # 17 不破(本波不碰 entity:: 邊界)
dcargo test -p server --test endpoint_coverage_lint    # 30 不破(本波不動 endpoint/route 數)
grep -rn "Migrator::up" rust-api/server/src/           # 0(守 007 FR-009)
# live-DB auth 驗收(若已預先以 dev DB 設定環境跑 #[ignore]):login/getUserInfo/getUserRoutes 三角色/enforce/refresh 前後逐字一致
```

## 2. curl 等價 smoke(對抗式:證 7 callsite 行為與 baseline 一致)
```bash
H=http://127.0.0.1:21081; J='Content-Type: application/json'
# (a) login 成功 → 0000 + token 對(issue_tokens callsite #1)
SUPER_RESP=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Super","password":"123456"}')
echo "$SUPER_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('login code=',d['code'],'has token=',bool(d['data'].get('token')),'has refresh=',bool(d['data'].get('refreshToken')))"  # 0000 True True
SUPER=$(echo "$SUPER_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
RTOKEN=$(echo "$SUPER_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['refreshToken'])")
# (b) login 失敗 → 1000(不變)
curl -s $H/auth/login -H "$J" -d '{"userName":"Super","password":"wrong"}' | python3 -c "import sys,json;print('login bad code=',json.load(sys.stdin)['code'])"  # 1000
# (c) getUserInfo 有效 token → 0000 + payload(verify_bearer callsite #2)
curl -s $H/auth/getUserInfo -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin);print('getUserInfo code=',d['code'],'userName=',d['data'].get('userName'))"  # 0000
# (d) getUserInfo 缺 token / 壞 token → 3333(verify_bearer None 分支)
curl -s $H/auth/getUserInfo | python3 -c "import sys,json;print('no-token code=',json.load(sys.stdin)['code'])"  # 3333
curl -s $H/auth/getUserInfo -H "Authorization: Bearer bad.token.xxx" | python3 -c "import sys,json;print('bad-token code=',json.load(sys.stdin)['code'])"  # 3333
# (e) getUserRoutes 有效 → 0000(verify_bearer callsite #3);缺 token → 3333
curl -s $H/route/getUserRoutes -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;d=json.load(sys.stdin);print('getUserRoutes code=',d['code'],'home=',d['data'].get('home'))"  # 0000 home
# (f) enforce:Admin 對 Super-only endpoint → 5003(enforce_mw callsite #1,verify 通過但 enforce deny)
ADMIN=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s "$H/systemManage/getDeletedMenus?current=1&size=10" -H "Authorization: Bearer $ADMIN" | python3 -c "import sys,json;print('Admin enforce deny code=',json.load(sys.stdin)['code'])"  # 5003
# enforce:無 token → 3333(verify_bearer None);Super 同 endpoint → 0000
curl -s "$H/systemManage/getDeletedMenus?current=1&size=10" | python3 -c "import sys,json;print('enforce no-token=',json.load(sys.stdin)['code'])"  # 3333
# (g) refresh 有效 → 0000 + 新 token 對(issue_tokens callsite #2);壞 refresh → 8888
curl -s $H/auth/refreshToken -H "$J" -d "{\"refreshToken\":\"$RTOKEN\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('refresh code=',d['code'],'has token=',bool(d['data'].get('token')))"  # 0000 True
curl -s $H/auth/refreshToken -H "$J" -d '{"refreshToken":"bad.refresh.xxx"}' | python3 -c "import sys,json;print('refresh bad code=',json.load(sys.stdin)['code'])"  # 8888
```
> 上述每碼皆須與 **baseline(重構前)逐字一致**;refactor 不得改任一碼/回應。

## 3. §2.18 fail-closed/open 文件化檢查
```bash
# verify_bearer doc-comment + spec 記三策略(enforce fail-closed / route advisory / ctx best-effort)
grep -n "fail-closed\|advisory\|best-effort" rust-api/server/src/auth/bearer.rs specs/026-auth-dry-refactor/spec.md | head
```

## 4. 回歸(本波不應觸及)
- 013 login/getUserInfo/refresh、014 getUserRoutes/isRouteExist、015 ctx_mw 稽核、018 enforce DB-fresh roles、021 per-role home —— 行為全不變(由 §1 既有測試 + §2 smoke 覆蓋)。
- base-web 不動(無 typecheck 需跑);casbin policy 不動(enforce 結果不變)。

## Acceptance Gate(全綠才 READY TO MERGE)
- `dcargo test -p server` 全綠(既有前後不變 + verify_bearer + issue_tokens 新測)✅
- entity_access_lint 17 / endpoint_coverage_lint 30 / `Migrator::up` 0 守恆 ✅
- curl 等價 smoke §2 (a)-(g) 每碼與 baseline 一致(login 0000/1000、getUserInfo 0000/3333、getUserRoutes 0000、enforce 5003/3333、refresh 0000/8888)✅
- §2.18 三策略文件化 ✅
- **Constitution v1.5.0 §IV 8/8 PASS(無 amendment)** ✅
