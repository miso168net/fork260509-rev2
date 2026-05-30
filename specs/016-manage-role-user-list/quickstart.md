# Quickstart: 016-manage-role-user-list

## Path A — 純單測（no-DB、最快）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev test -p server
```
驗:role/user filter SQL-build（LIKE/eq/limit/offset/count）、size clamp（>100→100）、空參數略過、DTO 映射（id=number、status/gender 字串、createBy/updateBy null）、**UserItem 不含 password**。

## Path B — 活體 manage 清單（curl + psql）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis-stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate            # 套 001..015（含 013/014/015）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api
```
- getRoleList（Bearer）→ `{records,current,size,total}`、id number、搜尋 roleName/status 生效。
- getUserList（Bearer）→ 每列含 userRoles（role code 陣列）、**無 password**。
- getAllRoles（Bearer）→ AllRole[]（{id,roleName,roleCode}、不分頁）。
- enforce:User → 403+5003 / Admin·Super → 200 / 無 token → 3333。
（完整指令見 [contracts/verification-commands.md](./contracts/verification-commands.md)）

## Path C — prod build sanity（無新 dep、仍驗 alter+handler 過 release）

```bash
DOCKER_BUILDKIT=1 docker build -f deploy/Dockerfile.rust-api.txt --target runtime -t rev2-admin-rust-api:prod-verify-016 .
```

## 關鍵事實速查

- **3 endpoint**:getRoleList（分頁）/ getUserList（分頁、取代 013 stub）/ getAllRoles（不分頁）。
- **切法**:role + user（menu 三件留 017）。
- **補欄**:sys_role +description/status/created_at/updated_at;sys_user +status/gender/phone/email/created_at/updated_at。**status/gender = VARCHAR '1'/'2'**（對齊 base-web、非 PG enum）。
- **id wire = number**（constitution v1.1.0 amend、commit e2da9c3;i64 直序列化）。
- **分頁**:`{records,current,size,total}`（無 pages）;size max 100、預設 current=1/size=10、空參數略過 filter。
- **userRoles**:join sys_user_role + sys_role（既有 roles_for_user、role code 陣列）。
- **enforce**:3 條掛 enforce_mw（route_layer）;m..015 seed getRoleList/getAllRoles policy（getUserList 009 已有）。Phase 3 #5 首批。
- **password 防護**:UserItem DTO 無 password 欄（facade 投影排除）。
- **只回 active**（009 soft-delete）;**無新表/crate/dep**（sea-orm paginate/like 內建）。
- **commit**:rust-api worktree（migration×3 + entity×2 + facade×3 + handler/system_manage.rs + main.rs + 刪 auth stub）push fork + 外層（spec docs + constitution amend + SHA pin）;**不動 base-web**。
