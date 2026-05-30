# Contract: Verification commands（C-V acceptance）

**Type**:`cargo test`（filter SQL-build / 分頁 / DTO 映射 / size clamp / password 排除 純單測）+ 對 dev stack live 的活體 smoke（curl + psql）。**無 CDP**（純後端 read、無新前端行為;base-web 端到端留 prod-stack 巡檢 CHECKLIST §2.8）。對應 spec US1/US2/US3 + SC-001..007。

> **§0 紀律**:
> - **test-first 純單測**:role/user filter SQL-build（LIKE/eq/limit/offset/count、沿 011/015 `*_active_model` 模式）、size clamp（>100→100）、空參數略過、DTO 映射（id=number、status/gender 字串、createBy/updateBy null）、**UserItem 序列化不含 password**。
> - **wiring/形狀**（handler 接線 / enforce route_layer / Query extractor / paginate）→ 活體 acceptance 覆蓋。
> - dev stack:rust-api `127.0.0.1:21081`、postgres `127.0.0.1:25432`（010 自動套含 013/014/015 三 migration）。
> - **無新 crate/dep** → 依 CLAUDE.md §3 不觸發「必含 prod image build」鐵律;但 §0 仍跑一次 prod build sanity（保守、確認 alter migration + 新 handler 不破 release build）。

---

## §0 既有不破 + 編譯 + prod build（守恆）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 既有 + 新單測全綠（server 69+3 ignored〔015 後〕+ 新增 016 filter/分頁/DTO/clamp/no-password 單測）
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test
# 009 entity-access lint 續綠（role/user 查詢只經 facade;handler 不碰 entity::;用 --test）
docker run ... rev2-admin-rust-api:dev test -p server --test entity_access_lint   # 17 passed
# prod runtime image build sanity（無新 dep,但 alter migration + 新 handler/facade 須過 release build）
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-016 .
# FR-009 regression：server 不自動 migrate
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"   # 無命中
# scope 邊界:sys_operation_log/casbin_rule entity 未動、無新表
git -C rust-api diff c4b1d7e..HEAD --stat | grep -E "sys_menu|create_sys" ; echo "(不應有新建表 migration、只 alter)"
```

## §1 dev stack up + schema 補欄 + policy seed（前置）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套 001..015
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
# sys_role 補欄存在
$PSQL "SELECT count(*) FROM information_schema.columns WHERE table_name='sys_role' AND column_name IN ('description','status','created_at','updated_at');"  # 4
# sys_user 補欄存在
$PSQL "SELECT count(*) FROM information_schema.columns WHERE table_name='sys_user' AND column_name IN ('status','gender','phone','email','created_at','updated_at');"  # 6
# 既有 3 seed role/user 的 status 有 default '1'（NOT NULL 加欄不破）
$PSQL "SELECT count(*) FROM sys_role WHERE status='1';"   # 3（R_SUPER/R_ADMIN/R_USER_COMMON）
$PSQL "SELECT count(*) FROM sys_user WHERE status='1';"   # 3（Super/Admin/User）
# m..015 policy seed（getRoleList/getAllRoles 各 2 role;getUserList 仍是 009 的 2）
$PSQL "SELECT count(*) FROM casbin_rule WHERE ptype='p' AND v2='GET' AND v1 LIKE '/systemManage/%';"  # 6（getUserList 2 + getRoleList 2 + getAllRoles 2）
# rust-api up
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
curl -fsS http://127.0.0.1:21081/health   # ok
```

## §2 US1 getRoleList（分頁 + 搜尋、SC-001 / SC-005）

```bash
B=http://127.0.0.1:21081
TOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
# 預設分頁 → {records,current,size,total};id 為 number、status '1'/'2'
curl -fsS "$B/systemManage/getRoleList" -H "Authorization: Bearer $TOK" | python3 -m json.tool
# 預期 data:{records:[{id:<number>,roleName,roleCode,roleDesc,status,createTime,...}], current:1, size:10, total:3}
# 搜尋 roleName 模糊（注意:seed role.name 為中文「超级管理员/管理员/普通用户」,LIKE 對 `name` 欄;
# 英文 `roleName=admin` 不命中中文名〔回 0,正確行為〕。用中文詞驗 LIKE,如 `roleName=管理` 命中 2〔超级管理员+管理员〕;
# 或用 `roleCode=R_ADMIN` 驗 code 欄〔活體實證 2026-05-30〕。)
curl -fsS "$B/systemManage/getRoleList?roleName=%E7%AE%A1%E7%90%86" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("records",len(d["records"]),"total",d["total"])'
# status 篩選
curl -fsS "$B/systemManage/getRoleList?status=1" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["total"])'
# id 確認為 JSON number（非 "1" string）
curl -fsS "$B/systemManage/getRoleList" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;r=json.load(sys.stdin)["data"]["records"][0];assert isinstance(r["id"],int),"id 應為 number";print("id is number OK:",r["id"])'
```

## §3 US2 getUserList（分頁 + userRoles join + 無 password、SC-002 / SC-005 / SC-006）

```bash
# 已認證 → {records:[{id:number, userName, nickName, userGender, userPhone, userEmail, userRoles:[...], status, ...}]}
curl -fsS "$B/systemManage/getUserList" -H "Authorization: Bearer $TOK" | python3 -m json.tool
# userRoles join 正確（Super → ["R_SUPER"]）
curl -fsS "$B/systemManage/getUserList?userName=Super" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;r=json.load(sys.stdin)["data"]["records"][0];print("userRoles",r["userRoles"]);assert "R_SUPER" in r["userRoles"]'
# **password 絕不外洩**（關鍵）
curl -fsS "$B/systemManage/getUserList" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;s=sys.stdin.read();assert "password" not in s.lower(),"password 洩漏!";print("no password leak OK")'
# 搜尋 nickName 模糊
curl -fsS "$B/systemManage/getUserList?nickName=User" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;print("total",json.load(sys.stdin)["data"]["total"])'
```

## §4 US3 getAllRoles（不分頁輕量、SC-003）

```bash
# 回 AllRole[]（{id:number, roleName, roleCode}）、不分頁、只 active
curl -fsS "$B/systemManage/getAllRoles" -H "Authorization: Bearer $TOK" | python3 -m json.tool
# 預期 data:[{id:<number>,roleName,roleCode}, ...]（3 條 active role、無分頁 wrapper）
curl -fsS "$B/systemManage/getAllRoles" -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];assert isinstance(d,list);assert isinstance(d[0]["id"],int);print("AllRole count",len(d),"id is number")'
```

## §5 enforce 授權（SC-004、Phase 3 #5 首批）

```bash
# User（R_USER_COMMON、未 seed policy）→ 403 + 5003
UTOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s -o /dev/null -w "%{http_code}" "$B/systemManage/getRoleList" -H "Authorization: Bearer $UTOK"   # 403
curl -s "$B/systemManage/getRoleList" -H "Authorization: Bearer $UTOK" | python3 -c 'import sys,json;print("code",json.load(sys.stdin)["code"])'  # 5003
# Admin（R_ADMIN、有 seed）→ 200
ATOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Admin","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s -o /dev/null -w "%{http_code}\n" "$B/systemManage/getUserList" -H "Authorization: Bearer $ATOK"   # 200
# 無 token → 3333（enforce token 缺）
curl -s "$B/systemManage/getRoleList" | python3 -c 'import sys,json;print("code",json.load(sys.stdin)["code"])'  # 3333
```

## §6 size clamp + 空參數（純單測為主、活體佐證）

```text
size clamp（>100→100）+ 空參數略過 filter：以**純單測**覆蓋較穩（filter SQL-build 斷言 limit=100、空參數無 WHERE）。
活體佐證:curl "?size=999" → 回 size 欄為 100（被夾）。
```

---

## 驗收紀律總結

- §0 既有不破 + lint(--test 17) + prod build sanity + FR-009 regression + 無新表（只 alter）
- §1 sys_role/sys_user 補欄 + 既有 seed status default + m..015 policy 6 條 + boot health
- §2 getRoleList 分頁{records,current,size,total} + 搜尋 + **id number**（US1/SC-001/SC-005）
- §3 getUserList 分頁 + userRoles join + **無 password 洩漏**（US2/SC-002/SC-006）
- §4 getAllRoles 不分頁輕量 + id number（US3/SC-003）
- §5 enforce:User 403+5003 / Admin·Super 200 / 無 token 3333（SC-004）
- §6 size clamp + 空參數（純單測）
- filter SQL-build + DTO 映射 + no-password 純單測 test-first;wiring 由活體覆蓋;**無 CDP**
