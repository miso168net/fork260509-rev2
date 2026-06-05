# Quickstart: single-session enforcement(028)

**Feature**: 028-single-session-enforcement | **Date**: 2026-06-05

> 實作完成後的最短驗證路徑。完整 C-V 見 [contracts/verification-commands.md](contracts/verification-commands.md)。**028 = rust-api 單倉、base-web 零改**;policy 在 028 由後端(DB)設定。

## 0. 前置(dcargo + dev stack)
```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait     # postgres + redis + rust-api ...
```

## 1. build + 套 migration + 重啟（載入 028 碼）
```bash
dcargo build -p server -p migration -p entity
# migration m..027 由 migrate service 於 up 時自動套（或手動 docker compose run --rm migrate up）
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
# 確認 sys_user 兩新欄
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='sys_user' AND column_name IN ('current_session_id','session_policy')"
# → current_session_id / session_policy
```

## 2. 純單測（no-DB）
```bash
dcargo test -p server resolve_policy        # U1 三態全分支
dcargo test -p server                       # 全套件綠（218 + 新測）
```

## 3. live-DB #[ignore]（Postgres + Redis）
```bash
PWPG=$(cat deploy/secrets/postgres_password.txt); RPW=$(cat deploy/secrets/redis_password.txt); NET=rev2-admin_rev2_net
docker run --rm --network "$NET" \
  -e DATABASE_URL="postgres://soybean:$PWPG@postgres:5432/soybean_admin_rust" \
  -e REDIS_URL="redis://:$RPW@redis-stack:6379" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev \
  test -p server -- --ignored --test-threads=1 session::live_tests
# L1 policy=on 踢舊 / L2 off 不踢 / L3 hybrid rehydration / L4 revoke_other_chains / L5 fail-open
```

## 4. curl 端到端（核心驗收）
```bash
PW='123456'; BASE=http://127.0.0.1:21081
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
pj(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

$PSQL "UPDATE sys_user SET session_policy='on' WHERE user_name='Super'"
A1=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}" | pj "d['data']['token']")
A2=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}" | pj "d['data']['token']")
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $A1" | pj "d['code']"   # 7777（被踢）
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $A2" | pj "d['code']"   # 0000
$PSQL "UPDATE sys_user SET session_policy='inherit', current_session_id=NULL WHERE user_name='Super'"   # 還原
```

## 5. 守恆 + migration 可逆
```bash
dcargo test -p server --test entity_access_lint        # 17
dcargo test -p server --test endpoint_coverage_lint    # 30（無新對外端點）
# migration 可逆（throwaway DB）：m..027 up → down -n 1 → up（sys_user 2 欄 加/減/回）
```

## 6.（建議）CDP isolated context
policy=on 帳號兩 tab 登入 → 舊 tab 操作彈「账号在他处登录」→ 登出;policy=off 兩 tab 並存。

> **收尾**(實作完成):`superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree push fork + 外層 SHA pin)→ merge --no-ff 回 rev2-admin-root、保留 028 branch。回填 DESIGN §6/§10 + 登記/推進 029。**base-web 不動**。
