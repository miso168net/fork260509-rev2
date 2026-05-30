# Contract: Verification commands（C-V acceptance）

**Type**:`cargo test`（tree-builder / root 分頁 / pages_for_roles / route_ext 攤平 / facade SQL-build 純單測）+ 對 dev stack live 的活體 smoke（curl + psql）。**無 CDP**（純後端 read、無新前端行為;base-web manage/menu tree-table 渲染 + role 選單授權 modal 留 prod-stack 巡檢 CHECKLIST §2.8/§2.16/§2.18）。對應 spec US1/US2/US3 + SC-001..007。

> **§0 紀律**:
> - **test-first 純單測**:`build_menu_tree`（巢狀/排序/孤兒）、root-slice 分頁（reuse 016 `normalize_page`、clamp 100）、`pages_for_roles`（Super real+demo / Admin real）、`route_ext` JSONB↔wire 攤平、facade `all_active` SQL-build（`deleted_at IS NULL` + `ORDER BY menu_order`）。
> - **wiring/形狀**（handler 接線 / enforce route_layer / getAllPages role 讀取 / tree fetch）→ 活體 acceptance 覆蓋。
> - dev stack:rust-api `127.0.0.1:21081`、postgres `127.0.0.1:25432`（010 自動套含 016/017 兩 migration）。
> - **無新 crate/dep**（JSONB 用 011 先例 sea-orm Json/json_binary）→ 不觸發「必含 prod image build」鐵律;但 §0 仍跑一次 prod build sanity（保守、確認新表 migration + 新 handler 不破 release build）。

---

## §0 既有不破 + 編譯 + prod build（守恆）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 既有 + 新單測全綠（016 後 server 92+3 ignored + 新增 017 tree-builder/root 分頁/pages_for_roles/route_ext/facade SQL-build 單測）
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test
# 009 entity-access lint 續綠（sys_menu 查詢只經 facade;handler 不碰 entity::;用 --test）
docker run ... rev2-admin-rust-api:dev test -p server --test entity_access_lint   # 17 passed
# prod runtime image build sanity（無新 dep,但新表 migration + 新 handler/facade + JSONB 須過 release build）
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-017 .
# FR-009 regression：server 不自動 migrate
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"   # 無命中
# scope 邊界:不動既有表/entity、不動 014 route 模組
git -C rust-api diff 97c602f..HEAD --stat | grep -E "route/menu.rs|sys_user|sys_role" ; echo "(不應動 014 menu.rs / 既有 user·role)"
```

## §1 dev stack up + sys_menu 建表 + seed + policy seed（前置）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套 001..017
PSQL="docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -tAc"
# sys_menu 表建立 + 21 欄
$PSQL "SELECT count(*) FROM information_schema.columns WHERE table_name='sys_menu';"   # 21
# seed 6 節點（只 active）
$PSQL "SELECT count(*) FROM sys_menu WHERE deleted_at IS NULL;"   # 6
# 頂層 2（home + manage）、children 4 掛在 manage 下
$PSQL "SELECT count(*) FROM sys_menu WHERE parent_id=0;"   # 2
$PSQL "SELECT route_name, parent_id FROM sys_menu ORDER BY menu_order, id;"   # manage 的 4 child parent_id = manage.id
# route_name 對齊 casbin menu 政策(5 個 leaf/home;manage 父不在 casbin)
$PSQL "SELECT count(*) FROM sys_menu m WHERE m.route_name IN (SELECT v1 FROM casbin_rule WHERE v2='menu');"   # 5
# m..017 endpoint policy（getMenuList/v2 + getAllPages + getMenuTree 各 2 role = 6;加既有 systemManage GET 6 → 12）
$PSQL "SELECT count(*) FROM casbin_rule WHERE ptype='p' AND v2='GET' AND v1 LIKE '/systemManage/%';"   # 12
$PSQL "SELECT v1, count(*) FROM casbin_rule WHERE ptype='p' AND v2='GET' AND v1 LIKE '/systemManage/getMenu%' OR (v2='GET' AND v1='/systemManage/getAllPages') GROUP BY v1;"  # getMenuList/v2=2, getMenuTree=2, getAllPages=2
# rust-api up
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
curl -fsS http://127.0.0.1:21081/health   # ok
```

## §2 US1 getMenuList/v2（分頁巢狀樹、SC-001 / SC-005）

```bash
B=http://127.0.0.1:21081
TOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
# 預設分頁 → {records,current,size,total};頂層 2(home,manage)、manage 含 4 children 巢狀
curl -fsS "$B/systemManage/getMenuList/v2" -H "Authorization: Bearer $TOK" | python3 -m json.tool
curl -fsS "$B/systemManage/getMenuList/v2" -H "Authorization: Bearer $TOK" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
assert d["total"]==2, "頂層應 2"
top={r["routeName"]:r for r in d["records"]}
assert "home" in top and "manage" in top
mg=top["manage"]
assert isinstance(mg["id"],int), "id 應 number"
assert mg["menuType"]=="1", "manage 應目錄 menuType=1"
kids=[c["routeName"] for c in mg["children"]]
assert set(kids)=={"manage_user","manage_role","manage_menu","manage_user-detail"}, ("manage children", kids)
print("getMenuList tree OK | top", list(top), "| manage children", kids)
'
# 欄位攤平驗(route_ext 攤平、createBy/updateBy null、menuType/iconType enum)
curl -fsS "$B/systemManage/getMenuList/v2" -H "Authorization: Bearer $TOK" | python3 -c '
import sys,json;r=[x for x in json.load(sys.stdin)["data"]["records"] if x["routeName"]=="home"][0]
assert r["createBy"] is None and r["updateBy"] is None
assert set(["menuType","routeName","routePath","component","icon","iconType","i18nKey","order","status","createTime"]).issubset(r.keys())
print("MenuItem 欄位 OK:", sorted(r.keys()))
'
```

## §3 US2 getMenuTree（輕量樹、SC-002）

```bash
# bare array、每節點 {id,label,pId,children}、完整樹(不分頁)
curl -fsS "$B/systemManage/getMenuTree" -H "Authorization: Bearer $TOK" | python3 -m json.tool
curl -fsS "$B/systemManage/getMenuTree" -H "Authorization: Bearer $TOK" | python3 -c '
import sys,json
d=json.load(sys.stdin)["data"]
assert isinstance(d,list), "應 bare array"
n=[x for x in d if x["label"]=="manage" or x["id"]]  # 頂層
m=[x for x in d if x.get("children")]
assert all(set(x.keys())<= {"id","label","pId","children"} for x in d), "MenuTreeItem 僅 id/label/pId/children"
assert isinstance(d[0]["id"],int) and isinstance(d[0]["pId"],int)
print("getMenuTree OK, 頂層", len(d), "keys", sorted(d[0].keys()))
'
```

## §4 US3 getAllPages（role-aware、SC-003）★ 關鍵:Super vs Admin 內容差異

```bash
# Super → 真頁 + demo 頁
curl -fsS "$B/systemManage/getAllPages" -H "Authorization: Bearer $TOK" | python3 -c '
import sys,json;d=json.load(sys.stdin)["data"]
assert isinstance(d,list)
real={"home","manage_user","manage_role","manage_menu","manage_user-detail"}
assert real.issubset(set(d)), "Super 應含真頁"
assert len(set(d)-real)>0, "Super 應額外含 demo 頁"
print("Super getAllPages OK: real⊆ + demo 共", len(d))
'
# Admin → 只真頁(無 demo)
ATOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"Admin","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -fsS "$B/systemManage/getAllPages" -H "Authorization: Bearer $ATOK" | python3 -c '
import sys,json;d=set(json.load(sys.stdin)["data"])
real={"home","manage_user","manage_role","manage_menu","manage_user-detail"}
assert d==real or d<=real, ("Admin 應只真頁、無 demo", d-real)
print("Admin getAllPages OK: 只真頁", sorted(d))
'
# 比對:Super ⊋ Admin
echo "→ Super 清單應嚴格大於 Admin 清單(差集 = demo 頁)"
```

## §5 enforce 授權（SC-004）

```bash
# User(R_USER_COMMON、未 seed policy)→ 403 + 5003（3 條各驗一）
UTOK=$(curl -fsS -X POST $B/auth/login -H 'content-type: application/json' -d '{"userName":"User","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
for ep in getMenuList/v2 getMenuTree getAllPages; do
  echo -n "$ep User: "; curl -s -o /dev/null -w "%{http_code} " "$B/systemManage/$ep" -H "Authorization: Bearer $UTOK"
  curl -s "$B/systemManage/$ep" -H "Authorization: Bearer $UTOK" | python3 -c 'import sys,json;print("code",json.load(sys.stdin)["code"])'
done   # 各 403 / 5003
# Admin → 200(3 條)
for ep in getMenuList/v2 getMenuTree getAllPages; do echo -n "$ep Admin: "; curl -s -o /dev/null -w "%{http_code}\n" "$B/systemManage/$ep" -H "Authorization: Bearer $ATOK"; done   # 200
# 無 token → 3333
curl -s "$B/systemManage/getMenuTree" | python3 -c 'import sys,json;print("no-token code",json.load(sys.stdin)["code"])'  # 3333
```

## §6 純單測（test-first、no-DB）

```text
- build_menu_tree:flat Vec<Model> → 巢狀;斷言 manage 含 4 children、依 menu_order 排序、頂層=parent_id 0;孤兒(parent 不存在)處理(略過或掛頂層,定義於 plan)。
- root 分頁:頂層 slice + total;reuse 016 normalize_page(size>100→100、current/size 預設)。
- pages_for_roles:["R_SUPER"]→real+demo;["R_ADMIN"]→real;["R_USER_COMMON"]→real(或空,定義);multi-role 含 R_SUPER→real+demo。
- route_ext 攤平:{href,query,multiTab,fixedIndexInTab} JSONB ↔ wire 頂層欄;null route_ext → 四欄 null。
- facade all_active SQL-build:含 `deleted_at IS NULL` + `ORDER BY "menu_order"`。
```

---

## 驗收紀律總結
- §0 既有不破(server 92+N) + lint(--test 17) + prod build sanity + FR-009 regression + 不動 014/既有表
- §1 sys_menu 21 欄 + 6 節點 seed + route_name 對齊 casbin + endpoint policy 6 條 + boot health
- §2 getMenuList/v2 分頁巢狀樹{records,current,size,total} + manage 含 4 children + id number + 欄位攤平(US1/SC-001/SC-005)
- §3 getMenuTree bare 輕量樹{id,label,pId,children}(US2/SC-002)
- §4 **getAllPages role-aware:Super real+demo / Admin 只 real**(US3/SC-003)★
- §5 enforce:User 403+5003 / Admin 200 / 無 token 3333(SC-004、3 endpoint)
- §6 tree-builder + root 分頁 + pages_for_roles + route_ext + facade SQL-build 純測 test-first;wiring 活體覆蓋;**無 CDP**
