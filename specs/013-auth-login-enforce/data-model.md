# Data Model: 013-auth-login-enforce（Phase 1）

> 新增 2 表（`sys_role` / `sys_user_role`）+ 1 欄（`sys_user.nick_name`）+ casbin policy seed（casbin_rule 維持 012 stock）。命名/型以 [research.md](./research.md) grep 的 base-web typing（wire）+ 009 soft-delete pattern 為準。

## 1. DB 實體

### `sys_role`（角色、SoftDeletable）

| 欄 | 型（postgres） | sea-orm DSL | 說明 |
|---|---|---|---|
| `id` | BIGSERIAL PK | `big_integer().auto_increment().primary_key()` | |
| `code` | VARCHAR NOT NULL | `string().not_null()` | 角色碼（`R_SUPER`/`R_ADMIN`/`R_USER_COMMON`） |
| `name` | VARCHAR NOT NULL | `string().not_null()` | 顯示名 |
| `deleted_at` | TIMESTAMPTZ NULL | `timestamp_with_time_zone().null()` | **009 SoftDeletable**；NULL=active |

- **partial unique index**：`code WHERE deleted_at IS NULL`（沿 009 sys_user pattern；active 角色碼唯一）。
- impl `SoftDeletable`（009 trait）；寫入經 facade（守 009 entity-access lint）。

### `sys_user_role`（使用者-角色指派、join、硬刪）

| 欄 | 型 | sea-orm DSL | 說明 |
|---|---|---|---|
| `user_id` | BIGINT NOT NULL | `big_integer().not_null()` | → sys_user.id |
| `role_id` | BIGINT NOT NULL | `big_integer().not_null()` | → sys_role.id |

- 複合 PK `(user_id, role_id)`（或 unique index）；join 表、**不 soft-delete**（硬刪、非業務 entity）。

### `sys_user` 新增欄

| 欄 | 型 | 說明 |
|---|---|---|
| `nick_name` | VARCHAR NULL（或 NOT NULL default） | 顯示名；getUserInfo `userName` 來源（**User→User01 alias**）。Super→`Super`、Admin→`Admin`、User→`User01` |

### `casbin_rule`（012 stock、本 feature 僅 seed）

- 維持 012 stock schema（`id/ptype/v0..v5` + unique index）、**無 deleted_at**（soft-delete 留後續受管 policy 層 feature）。
- 本 feature seed policy rows（`p` ptype）：見 §3 seed。

## 2. seed（migration、經 010 自動套）

| 表 | seed 內容 |
|---|---|
| `sys_role` | `(R_SUPER,超级管理员)` / `(R_ADMIN,管理员)` / `(R_USER_COMMON,普通用户)` |
| `sys_user_role` | user 1→R_SUPER、2→R_ADMIN、3→R_USER_COMMON（對齊既有 sys_user seed id） |
| `sys_user.nick_name` | id1→`Super`、id2→`Admin`、id3→`User01` |
| `casbin_rule` | `p,R_SUPER,/systemManage/getUserList,GET` + `p,R_ADMIN,/systemManage/getUserList,GET`（**不含 R_USER_COMMON**） |

> casbin_rule 的 v0=role、v1=path、v2=act（對齊 enforce model `p=sub,obj,act`）；v3..v5 空字串（stock 6 欄）。

## 3. wire DTO（序列化、camelCase、wrap 在 008 `Res<T>`）

| DTO | 欄 | 對應 base-web typing |
|---|---|---|
| **`LoginToken`**（login/refresh response data） | `token: String` / `refreshToken: String` | `Api.Auth.LoginToken`（serde `rename_all="camelCase"`） |
| **`UserInfo`**（getUserInfo response data） | `userId: String` / `userName: String` / `roles: Vec<String>` / `buttons: Vec<String>` | `Api.Auth.UserInfo`（`userId` **string**、camelCase） |
| **`LoginReq`**（request body） | `userName: String` / `password: String` | login `{userName,password}` |
| **`RefreshReq`**（request body） | `refreshToken: String` | refresh `{refreshToken}` |

- 全 wrap：成功 `Res::ok(dto)`（code `0000`）；錯誤 `Res::<DTO>::err(BizCode)`（§2.11 泛型化後可在 `Res<DTO>` 回 `data:null`）。
- **error code（[research R6](./research.md) / mock §4.11）**：login 失敗 `1000`、token 無效/過期/缺 `3333`、refresh 失敗 `8888`（絕不 `3333/9999/9998`）—— 皆 008 既有 `BizCode` variant;**enforce deny `5003`「權限不足」= 新增 variant**（analyze C2 釘、`5001-5999` 業務區、不撞 `5000` sentinel）。

## 4. JWT Claims（內部、base-web 不 decode）

```
Claims { sub: String, user_id: i64, roles: Vec<String>, exp: usize, iat: usize, iss: String, aud: String }
```
- access：`jwt_secret` 簽、TTL `access_token_ttl_secs`；refresh：`refresh_token_secret` 簽、TTL `refresh_token_ttl_secs`。
- **驗 exp**（即使 mock 不驗、production 標準）。HS256。

## 5. casbin RBAC model（enforce）

```
[request_definition] r = sub, obj, act
[policy_definition]  p = sub, obj, act
[role_definition]    g = _, _        # 本 feature 未用 g（role 直接當 sub）；保留供 Phase 3 群組
[policy_effect]      e = some(where (p.eft == allow))
[matchers]           m = r.sub == p.sub && r.obj == p.obj && r.act == p.act
```
- subject = role code；middleware 對 user 的每個 role 試 `enforce((role, path, method))`、任一 allow 即放行。

## 6. AppState 變更（enforce 整合點）

```
AppState { db, redis, enforcer }   // 新增 enforcer
```
- `enforcer: Arc<RwLock<casbin::Enforcer>>`（或 `CachedEnforcer`）—— boot 時用 RBAC model + 012 `SeaOrmAdapter::new(db)` 建好 + `load_policy`。Clone 廉價（Arc）。

## 7. buttons 矩陣（程式內常量、非表）

| role | buttons |
|---|---|
| `R_SUPER` | `[B_CODE1, B_CODE2, B_CODE3]` |
| `R_ADMIN` | `[B_CODE2, B_CODE3]` |
| `R_USER_COMMON` | `[B_CODE3]` |

（對齊 mock §4.4 incremental subset；getUserInfo 依 user 的 roles 取聯集 — 本 feature 三帳號各單一 role、直接映射。）

## 8. 與既有實體關係

- `sys_user_role` 連 `sys_user`（007）↔ `sys_role`（新）。
- `casbin_rule`（012）seed 的 policy subject = `sys_role.code`（邏輯關聯、非 FK）。
- getUserInfo 組裝：`sys_user`(nick_name) + `sys_user_role` join `sys_role`(code→roles) + buttons 矩陣。
- enforce：JWT.roles（登入時由 sys_user_role 快照）→ casbin_rule policy 比對。
