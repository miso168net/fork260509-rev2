# Verification Commands (C-V Contract): 017-manage-user-write

**Date**: 2026-06-01 | **Branch**: `017-manage-user-write`
寫端 CRUD + schema 補完 + 停用登入 enforce → 驗收 = **純單測 + dev stack curl + psql 活體 + CDP + 守恆(含 migration up→down→up)**。**無新 crate/dep → prod image build 非強制**(建議 sanity,schema+login 改動範圍較大)。指令對齊 memory `project_rustapi_build_test_env`(host 無 cargo、dev docker image + 快取卷;DB `soybean_admin_rust`、user `soybean`)。

> ⚠️ implementer **act on actual code**:型/路徑/欄名/`small_integer()` 以實際編譯與 `psql \d sys_user` 為準。dev 容器編譯前 force-touch(WSL2 /mnt/d stale)。

---

## §0. 測試 harness
- **純單測**(no-DB,`cargo test -p server`):`hash_password`→verify round-trip / enum string↔i16(gender·status)/ role replace-all SQL-build(delete WHERE user_id + insert_many IN)/ self-delete guard 判定 / write DTO 解析(id String→i64、enum string)/ `audit_json` redact(password)+ 補欄斷言。
- **live-DB**:`server` bin-only → in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`,放 `facade/`(lint 豁免):create_user/update_user/soft_delete round-trip + sys_user_role replace + audit 寫入。
- 跑整合 binary 用 `--test <name>`,勿 bare filter(假綠)。

## §1. 純單測 + 守恆 lint(test-first,red→green)
```bash
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
dcargo build -p migration    # ★ 實證 .small_integer() 能編譯(R1/N-12)
dcargo test -p server        # 含 hash/enum/role-SQL/guard/DTO/audit_json 新純測
dcargo test -p server --test entity_access_lint   # 17 全綠(新寫 facade 在 facade/、handler/system_manage 不碰 entity::)
dcargo test -p xdb           # 既有 9 不破
```

## §2. dev stack 起 + migration 014/015 自動套 + schema/policy 驗
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust"
# (a) schema 補欄(9 新欄)
$PSQL -c "\d sys_user"   # 期望含 user_gender smallint / user_phone varchar / user_email varchar / status smallint / created_at timestamptz not null / created_by bigint / updated_at / updated_by / deleted_by bigint
# (b) id BIGSERIAL(R2):有 default nextval + sequence
$PSQL -c "SELECT column_default FROM information_schema.columns WHERE table_name='sys_user' AND column_name='id';"  # 期望 nextval('sys_user_id_seq'...)
$PSQL -c "SELECT last_value FROM sys_user_id_seq;"   # 期望 >=3(setval 對齊 MAX(id))
# (c) seed status 回填 = 1(D6)
$PSQL -c "SELECT id,status,created_at IS NOT NULL FROM sys_user ORDER BY id;"  # id 1/2/3 status=1、created_at 非 null
# (d) casbin write policy(015,Super-only)
$PSQL -c "SELECT v0,v1,v2 FROM casbin_rule WHERE ptype='p' AND v2 IN ('POST','DELETE') ORDER BY v1;"
# 期望:R_SUPER × {addUser POST, updateUser POST, deleteUser DELETE, batchDeleteUser DELETE};無 R_ADMIN/R_USER_COMMON
```

## §3. US1 addUser(curl + psql + 預設密碼登入)
```bash
RA=http://127.0.0.1:21081
TOK(){ curl -s $RA/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"$1\",\"password\":\"123456\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])"; }
TS=$(TOK Super); TA=$(TOK Admin); TU=$(TOK User)
# (a) Super 新增 → 0000;list +1;角色指派;審計一筆 INSERT
curl -s "$RA/systemManage/addUser" -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' \
 -d '{"userName":"alice","nickName":"Alice","userGender":"2","userPhone":"0900","userEmail":"a@x.co","userRoles":["R_USER_COMMON"],"status":"1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 0000
curl -s "$RA/systemManage/getUserList?userName=alice" -H "Authorization: Bearer $TS"  # records 含 alice、userRoles=["R_USER_COMMON"]、id=string、gender/email 真值(非 null)
$PSQL -c "SELECT operation,entity_table FROM sys_operation_log WHERE entity_table='sys_user' ORDER BY id DESC LIMIT 1;"  # INSERT
# (b) 新使用者用預設密碼 123456 登入 OK
TOK alice >/dev/null && echo "alice 預設密碼登入 OK"
# (c) 帳號重複 → 2222
curl -s "$RA/systemManage/addUser" -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' \
 -d '{"userName":"alice","userRoles":[],"status":"1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 2222
# (d) 授權:Admin/User 寫 → 403;無 token → 3333
for t in "$TA" "$TU"; do curl -s -o /dev/null -w '%{http_code}\n' "$RA/systemManage/addUser" -H "Authorization: Bearer $t" -H 'Content-Type: application/json' -d '{"userName":"x","userRoles":[],"status":"1"}'; done  # 403 403
curl -s "$RA/systemManage/addUser" -H 'Content-Type: application/json' -d '{"userName":"x","userRoles":[],"status":"1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 3333
```

## §4. US2 updateUser(curl)
```bash
AID=$(curl -s "$RA/systemManage/getUserList?userName=alice" -H "Authorization: Bearer $TS" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['records'][0]['id'])")
# Super 編輯(改 nick/roles/email,id=string 帶入)→ 0000;反映;user_name 不變(Q1=A)
curl -s "$RA/systemManage/updateUser" -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' \
 -d "{\"id\":\"$AID\",\"userName\":\"alice\",\"nickName\":\"Alice2\",\"userGender\":\"1\",\"userPhone\":\"0911\",\"userEmail\":\"a2@x.co\",\"userRoles\":[\"R_ADMIN\",\"R_USER_COMMON\"],\"status\":\"1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 0000
curl -s "$RA/systemManage/getUserList?userName=alice" -H "Authorization: Bearer $TS"  # nickName=Alice2、userRoles 兩碼、userName 仍 alice
$PSQL -c "SELECT operation, updated_by FROM sys_operation_log WHERE entity_table='sys_user' ORDER BY id DESC LIMIT 1;"  # UPDATE
$PSQL -c "SELECT updated_at IS NOT NULL, updated_by FROM sys_user WHERE id=$AID;"  # t, <Super id>(C1:updated_at/by 成對)
# (C3 / US2 AS-2)含無效 + 有效 roleCode → 只採有效、不崩潰(0000)
curl -s "$RA/systemManage/updateUser" -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' \
 -d "{\"id\":\"$AID\",\"userName\":\"alice\",\"userRoles\":[\"R_NOSUCH\",\"R_USER_COMMON\"],\"status\":\"1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 0000(不崩潰)
curl -s "$RA/systemManage/getUserList?userName=alice" -H "Authorization: Bearer $TS" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['records'][0]['userRoles'])"  # ['R_USER_COMMON'](無效 R_NOSUCH 被略過)
curl -s -o /dev/null -w '%{http_code}\n' "$RA/systemManage/updateUser" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"id\":\"$AID\",\"userName\":\"alice\",\"userRoles\":[],\"status\":\"1\"}"  # 403
```

## §5. US3 deleteUser / batchDeleteUser(soft-delete + 自刪 guard)
```bash
# (a) Super 軟刪 alice → 0000;getUserList 不再含 alice;審計 SOFT_DELETE;psql deleted_at/deleted_by 非 null
curl -s "$RA/systemManage/deleteUser" -X DELETE -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' -d "{\"id\":\"$AID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 0000
curl -s "$RA/systemManage/getUserList?userName=alice" -H "Authorization: Bearer $TS" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['records']))"  # 0
$PSQL -c "SELECT deleted_at IS NOT NULL, deleted_by FROM sys_user WHERE id=$AID;"  # t, 1(Super operator)
# (b) D7 不可刪自己:Super 刪自己(id=1)→ 2222「不能删除自己」、Super 仍在
curl -s "$RA/systemManage/deleteUser" -X DELETE -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' -d '{"id":"1"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 2222
curl -s "$RA/systemManage/getUserList" -H "Authorization: Bearer $TS" | python3 -c "import sys,json;print(any(r['userName']=='Super' for r in json.load(sys.stdin)['data']['records']))"  # True
# (c) batchDelete 含自己 → 整批拒 2222、無人被刪
curl -s "$RA/systemManage/batchDeleteUser" -X DELETE -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' -d '{"ids":["2","1"]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 2222(含自己 id=1)
curl -s "$RA/systemManage/getUserList" -H "Authorization: Bearer $TS" | python3 -c "import sys,json;print(any(r['userName']=='Admin' for r in json.load(sys.stdin)['data']['records']))"  # True(Admin 未被刪)
# (d) Admin 刪 → 403
curl -s -o /dev/null -w '%{http_code}\n' "$RA/systemManage/deleteUser" -X DELETE -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"id":"3"}'  # 403
```

## §6. Q2=B 停用 status enforce 擋登入(R6 / 親決 A:回 1000)
```bash
# 先建一個 user 再停用它(或編輯既有測試 user status=2)
curl -s "$RA/systemManage/addUser" -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' -d '{"userName":"bob","userRoles":["R_USER_COMMON"],"status":"1"}' >/dev/null
TOK bob >/dev/null && echo "bob 啟用時可登入 OK"
BID=$(curl -s "$RA/systemManage/getUserList?userName=bob" -H "Authorization: Bearer $TS" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['records'][0]['id'])")
curl -s "$RA/systemManage/updateUser" -H "Authorization: Bearer $TS" -H 'Content-Type: application/json' -d "{\"id\":\"$BID\",\"userName\":\"bob\",\"userRoles\":[\"R_USER_COMMON\"],\"status\":\"2\"}" >/dev/null  # 停用
# 停用後登入 → 1000(統一守 no-enum),無 token 簽發
curl -s $RA/auth/login -H 'Content-Type: application/json' -d '{"userName":"bob","password":"123456"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['code'], 'token' in (d.get('data') or {}))"  # 1000 False
# 啟用帳號登入仍正常(對照)
curl -s $RA/auth/login -H 'Content-Type: application/json' -d '{"userName":"Admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"  # 0000
```

## §7. CDP — 管理頁寫端端到端(沿 013/014/016 CDP 模式,front-nginx :21080)
- 登入 Super → `/manage/user`:**新增**一個 user(填表單送出 → 列表多一筆、角色欄顯示)→ **編輯**(改暱稱/角色 → 反映、帳號名不可改)→ **刪除**(列表少一筆);null 欄 render 不 crash。
- 確認停用 enforce:把某 user 編輯為停用 → 該帳號登入頁登入 → 顯示登入失敗(1000「用户名或密码错误」、非靜默)。
- 沿 `docs/superpowers/000-base-web-docker-bootstrap.md` Appendix A;dev front-nginx /api 路徑(同 016)。

## §8. 守恆(既有不破 + migration 可逆)
```bash
dcargo test -p server         # server 既有 + 新純測全綠
docker compose ... exec -T rust-api sh -c "grep -rn 'Migrator::up' server/src || echo 'server 不自動 migrate ✅'"  # 0(守 007 FR-009)
# migration up→down→up reversibility(R2 id BIGSERIAL 可逆):
dcargo run --bin migration -- down -n 2 && dcargo run --bin migration -- up   # 014/015 down 後 up 無誤(在 throwaway DB 或 dev DB 驗)
# 013 login 既有行為不破:Super/Admin/User(啟用)皆登入 0000;錯密碼 1000;getUserInfo/getUserList(016)/getRoleList/getAllRoles 不受影響
```

## §9. prod image build(可選 sanity,非強制)
017 **無新 crate/dep**(用既有 sea-orm small_integer + argon2 + 011/013/016 pattern)→ 不觸發「新 crate ⇒ prod build」硬規則。建議 sanity(schema + login 改動範圍大):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api   # 可選
```

---

## CDP / wire 風險自覺
- 寫端 id 收 **String**(對齊 016 凍結 string id,R7),非盲信 alova `number` 型標 —— curl 測試 id 一律用字串。
- 停用拒登 **1000**(守 013 no-enum,親決 A);8889 已排除(base-web 吞訊息 + enum leak)。enforcement 僅 login 入口(FR-013),停用前已持有未過期 token 的 user 仍可用至 TTL(立即撤銷留後續)。
