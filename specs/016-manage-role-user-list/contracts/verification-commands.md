# Verification Commands (C-V Contract): 016-manage-role-user-list

**Date**: 2026-06-01 | **Branch**: `016-manage-role-user-list`
唯讀 manage list feature → 驗收 = **純單測 + dev stack curl + psql 活體 + CDP 列表顯示**。無新 crate/dep → prod image build 非強制(可選 sanity)。指令對齊 memory `project_rustapi_build_test_env`(host 無 cargo、走 dev docker image + 快取卷;DB 名 `soybean_admin_rust`、user `soybean`)。

> ⚠️ implementer **act on actual code**:型別/路徑/欄名以實際編譯與 `psql \d` 為準。

---

## §0. 測試 harness
- **純單測**(no-DB、`cargo test`):DTO 映射(id→string / 缺欄→null / role code 陣列 / 無 password)、分頁參數正規化(current-1 / size 預設 10 / clamp 100)、filter SQL-build(contains LIKE / eq / 空略過 / id DESC / count)。
- **live-DB**:`server` bin-only → in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`,放 `facade/`(lint 豁免)。
- **dev 容器編譯前 force-touch**(WSL2 /mnt/d stale-cache):`find server/src entity/src -name '*.rs' -exec touch {} +` 後再 `cargo build -p server`。
- **跑整合 binary 用 `--test <name>`**,勿 bare filter(假綠)。

## §1. 純單測(test-first,red→green)
```bash
docker run --rm -v "$PWD/rust-api":/app \
  -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target \
  -w /app --entrypoint cargo rev2-admin-rust-api:dev test -p server
# 含:DTO 映射 + 分頁正規化 + filter SQL-build 純單測
# 守恆:entity_access_lint 全綠(新 facade 在 facade/、handler/system_manage 不碰 entity::)
docker run --rm ... --entrypoint cargo rev2-admin-rust-api:dev test -p server --test entity_access_lint
docker run --rm ... --entrypoint cargo rev2-admin-rust-api:dev test -p xdb   # 既有 9 不破
```

## §2. dev stack 起 + migration 自動套
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# migrate service 自動套 013 seed_manage_policy;驗 policy 已 seed:
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
 "SELECT v0,v1,v2 FROM casbin_rule WHERE ptype='p' AND v1 LIKE '/systemManage/%' ORDER BY v1,v0;"
# 期望含:getRoleList×{R_SUPER,R_ADMIN}、getAllRoles×{R_SUPER,R_ADMIN,R_USER_COMMON}、getUserList×{R_SUPER,R_ADMIN}(009 既有)
```

## §3. US1 — getUserList 分頁 + 授權(curl + psql)
```bash
RA=http://127.0.0.1:21081
TOKEN_SUPER=$(curl -s $RA/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | jq -r '.data.token')
TOKEN_USER=$(curl -s $RA/auth/login  -H 'Content-Type: application/json' -d '{"userName":"User","password":"123456"}'  | jq -r '.data.token')

# (a) Super 打 getUserList → 分頁形 + 真實資料(3 seed user)+ id=string + userRoles code 陣列 + 無 password
curl -s "$RA/systemManage/getUserList?current=1&size=10" -H "Authorization: Bearer $TOKEN_SUPER" | jq '.data | {current,size,total, sample: .records[0]}'
# 期望:data.{current:1,size:10,total:3,records:[...]};無 pages/success;records[0].id 為 "1"(string)、userName、userRoles=["R_SUPER"]、無 password 欄;status/userGender/... = null
curl -s "$RA/systemManage/getUserList" -H "Authorization: Bearer $TOKEN_SUPER" | jq -e '.data.records[] | select(has("password"))' && echo "FAIL: password 洩漏" || echo "PASS: 無 password"

# (b) 搜尋 userName 過濾
curl -s "$RA/systemManage/getUserList?userName=Admin" -H "Authorization: Bearer $TOKEN_SUPER" | jq '.data.total, .data.records[].userName'
# 期望:只回 userName 含 'Admin' 者

# (c) 授權:User 打 → 403 + 5003;無 token → 3333
curl -s -o /dev/null -w '%{http_code}\n' "$RA/systemManage/getUserList" -H "Authorization: Bearer $TOKEN_USER"   # 期望 403
curl -s "$RA/systemManage/getUserList" -H "Authorization: Bearer $TOKEN_USER" | jq -r '.code'                    # 期望 "5003"
curl -s "$RA/systemManage/getUserList" | jq -r '.code'                                                          # 無 token → "3333"

# (d) 頁碼超範圍 → 空 records + 正確 total + 成功
curl -s "$RA/systemManage/getUserList?current=99&size=10" -H "Authorization: Bearer $TOKEN_SUPER" | jq '.code, (.data | {total, n: (.records|length)})'
# 期望:code "0000"、total 3、records 長度 0
```

## §4. US2 — getRoleList 分頁 + 授權
```bash
curl -s "$RA/systemManage/getRoleList?current=1&size=10" -H "Authorization: Bearer $TOKEN_SUPER" | jq '.data | {current,size,total, sample: .records[0]}'
# 期望:total 3(R_SUPER/R_ADMIN/R_USER_COMMON)、records[0].{id:string, roleName, roleCode}; roleDesc/status=null
curl -s "$RA/systemManage/getRoleList?roleCode=ADMIN" -H "Authorization: Bearer $TOKEN_SUPER" | jq '.data.records[].roleCode'  # 過濾
curl -s -o /dev/null -w '%{http_code}\n' "$RA/systemManage/getRoleList" -H "Authorization: Bearer $TOKEN_USER"  # 期望 403
```

## §5. US3 — getAllRoles(全量、含 User 授權)
```bash
# Super/Admin/User 皆可
for t in "$TOKEN_SUPER" "$TOKEN_USER"; do
  curl -s "$RA/systemManage/getAllRoles" -H "Authorization: Bearer $t" | jq '.code, (.data | length), .data[0]'
done
# 期望:兩者 code "0000"、data 為非分頁陣列、每筆 {id:string, roleName, roleCode}、只 active role
curl -s "$RA/systemManage/getAllRoles" | jq -r '.code'   # 無 token → "3333"
```

## §6. CDP — 管理頁列表顯示(端到端價值驗收,dev vite proxy)
- 沿 013/014 CDP 模式(`docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A scripts):
  - base-web `.env`(dynamic mode、`VITE_SERVICE_BASE_URL` 指 dev proxy)登入 Super → 進 `/manage/user`:**表格顯示 3 筆 user**(帳號 Super/Admin/User01、角色欄顯 code)、分頁列正常。
  - 進 `/manage/role`:**表格顯示 3 筆 role**。
  - 確認 null 欄(status/email/性別)render 不 crash(R5;若 crash 該欄改空字串)。
- 這是「admin panel 第一次看到真資料」的證明(SC-001)。

## §7. 守恆(既有不破)
```bash
# server 既有測試全綠;/health ok;migration grep 0(007 FR-009)
docker run --rm ... --entrypoint cargo rev2-admin-rust-api:dev test -p server
docker compose ... exec -T rust-api sh -c "grep -rn 'Migrator::up' server/src || echo 'server 不自動 migrate ✅'"
# 013 getUserList enforce 仍正常(被 016 取代後 Super/Admin 200、User 403)— 已含於 §3(c)
```

## §8. prod image build(可選 sanity,非強制)
016 **無新 crate/dep**(用既有 sea-orm PaginatorTrait + axum + 013 enforce)→ 不觸發「新 crate ⇒ prod build」硬規則。可選跑一次 sanity:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # 可選
```

---

## CDP 風險自覺
本 feature 有一條 CDP 列表顯示驗收(端到端價值);curl 直送 ≠ 經 front-nginx 真實路徑(prod `/api` proxy)。完整 prod-stack 經 front-nginx 的端到端列表 wire 留 prod-stack CDP cluster(CHECKLIST §2.8 連動);本 feature dev vite proxy CDP 已足證列表可見價值。
