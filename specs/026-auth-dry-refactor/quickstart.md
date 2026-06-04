# Quickstart: auth DRY refactor (026)

> dev 跑通 + 驗收最短路徑。完整 acceptance 見 [contracts/verification-commands.md](contracts/verification-commands.md)。**純 refactor、無 migration、不動 base-web**。

## 1. 前置(dev stack)

```bash
cd <workspace-root>
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# rust 改後(verify_bearer + issue_tokens + 7 callsite):
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
```

`dcargo`(host 無 cargo,throwaway dev 容器):
```bash
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
```

## 2. 核心驗(60 秒)

```bash
# refactor 主驗:全套件綠(既有前後不變 + 2 新 helper 單測)
dcargo test -p server
dcargo test -p server verify_bearer
dcargo test -p server issue_tokens
# 等價 smoke(行為不變):login→token / getUserInfo 有效·缺/壞→3333 / enforce Admin→5003 / refresh→token·壞→8888
H=http://127.0.0.1:21081; J='Content-Type: application/json'
SUPER=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s $H/auth/getUserInfo -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print('getUserInfo',json.load(sys.stdin)['code'])"  # 0000
curl -s $H/auth/getUserInfo | python3 -c "import sys,json;print('no-token',json.load(sys.stdin)['code'])"  # 3333
```

## 3. 實作順序(純 refactor、每步既有測試前後不變)

1. **`verify_bearer`**(`auth/bearer.rs`)+ 單測 → 5 callsite(enforce_mw / get_user_info / get_user_routes / is_route_exist / ctx_mw)逐一改呼叫,**各保留失敗映射**;`dcargo test` 前後不變。
2. **`issue_tokens`**(`handler/auth.rs`)+ 單測 → 2 callsite(login_attempt_inner / refresh_token)改呼叫,保留 5000 映射;`dcargo test` 前後不變。
3. **§2.18 文件**:verify_bearer doc-comment 記三策略(fail-closed / advisory / best-effort)。
4. **守恆 + 等價 smoke**:entity_access_lint 17 / endpoint_coverage_lint 30 / Migrator::up 0 / curl §2 每碼 == baseline。

## 4. 關鍵 gotcha(grounding)

- `verify_bearer` 回 `Option<Claims>` **不決定** HTTP/業務碼 —— 映射(403 enforce / 3333 route·info / None ctx)留各 callsite,§2.18 分歧刻意保留。
- **roles 段不抽**(ordered/變體/錯誤策略差);get_user_info 的 user-load、get_user_routes 的 home 不動。
- `issue_tokens` 用 `JwtConfig` 欄 `jwt_secret`/`refresh_token_secret`/`access_token_ttl_secs`/`refresh_token_ttl_secs`;回既有 `LoginToken`。
- **唯一可觀察差異** = 4 條 verify-failed debug log 合併為 1 條(response/code 零變)。
- **無 migration / 不動 base-web / 不動 casbin** → 無 base-web restart、無 prod image build 強制。
