# Quickstart: 013-auth-login-enforce

> 驗證登入+授權地基的最短路徑。完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)。前置：dev stack postgres up + migrate 套 001..009。

## Path A — 純邏輯單測 + 既有不破（無需 stack）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test
```
→ JWT 簽/驗 + argon2 verify + button 矩陣 + `Res<T>` 泛型 + enforce 決策單測綠；既有 25+3 ignored + 17 lint + xdb 9 全綠。

## Path B — login + getUserInfo + alias（US1）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
TOK=$(curl -fsS -X POST http://127.0.0.1:21081/auth/login -H 'content-type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -fsS http://127.0.0.1:21081/auth/getUserInfo -H "Authorization: Bearer $TOK"
```
→ login 回 `{token,refreshToken}` code `0000`；getUserInfo 回 `{userId:"1",userName:"Super",roles:["R_SUPER"],buttons}`；User 登入 getUserInfo `userName=User01`。

## Path C — enforce allow + deny（US2）

```bash
# Super/Admin allow → 200;User deny → 403
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOK"    # 200
# (User token TOKU 見 contracts §2)
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:21081/systemManage/getUserList -H "Authorization: Bearer $TOKU"   # 403
```
→ 證 enforce 真放行 + **真擋**（最小機制證明）。

## Path D — CDP 登入 smoke（US1、D10）

```text
base-web 指向 rev2(BASE-WEB-ADAPT .env)→ 開登入頁 → Super/123456 → 登入成功 + getUserInfo 渲染。
(詳見 contracts §5;base-web 設定相依見 research R8)
```

## 成功定義

- Path A 單測 + 既有全綠
- Path B login→getUserInfo round-trip + User→User01 alias + 1000/3333 code
- Path C enforce allow(Super/Admin) + deny(User 403)
- Path D base-web 瀏覽器登入端到端跑通
- refresh 8888（非 3333/9999/9998）；scope 邊界（casbin_rule 2 列無 deleted_at、無 login audit）
