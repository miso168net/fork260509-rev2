# Data Model: Endpoint Permission Authorization (023) — Phase 1

> 拍定 research.md deferred 決策。file:line 以 actual code 為準(research grep 實證)。**不建表、不加欄、無新 crate/dep**;單一 migration 023 只 seed 3 列。

## 1. ENDPOINT_REGISTRY(單一真相、compile-time const)

`server/src/auth/endpoint_auth.rs` 內 `const ENDPOINT_REGISTRY: &[(&str /*method*/, &str /*path*/)]` —— **28 條** = 25 既有 enforce_mw 路由(main.rs L107-347 verbatim)+ 3 新治理端點。`get_all_endpoints` 直接回此 const(無 DB、infallible)。

**25 既有**(method, path):GET getUserList / GET getRoleList / GET getAllRoles / POST addUser / POST addRole / POST updateRole / POST updateUser / DELETE deleteUser / DELETE batchDeleteUser / DELETE deleteRole / DELETE batchDeleteRole / GET getMenuList/v2 / GET getAllPages / GET getMenuTree / POST addMenu / POST updateMenu / DELETE deleteMenu / DELETE batchDeleteMenu / GET getRoleMenu / POST updateRoleMenu / GET getRoleHome / POST updateRoleHome / GET getRoleButton / POST updateRoleButton / GET getAllButtons(全 `/systemManage/` 前綴)。
**3 新**:`GET /systemManage/getAllEndpoints` / `GET /systemManage/getRoleEndpoints` / `POST /systemManage/updateRoleEndpoints`。

> path 字串須與 `main.rs` route literal **byte-identical**(D1 guard §7 強制);method ∈ {GET,POST,DELETE}(closed set)。

## 2. migration 023 seed(極小:3 列 + 對稱 down)

**現況**:R_SUPER **已是** per-endpoint seed(25 列、009-022)—— wildcard `p,R_SUPER,*,*` **只存在於過時 DESIGN 文字、從未實作**(R7)。Admin/User 既有授權(getUserList/getRoleList +Admin、getAllRoles +Admin+User)**不變**(FR-010;runtime 由 modal 增減)。

故 `m20260529_000023_seed_endpoint_auth_policy.rs` 只 seed **3 列**(新治理端點、R_SUPER、7-col 格式同 021/022):
```
('p','R_SUPER','/systemManage/getAllEndpoints','GET','','',''),
('p','R_SUPER','/systemManage/getRoleEndpoints','GET','','',''),
('p','R_SUPER','/systemManage/updateRoleEndpoints','POST','','','')
```
**down**:`DELETE FROM casbin_rule WHERE ptype='p' AND v1 IN ('/systemManage/getAllEndpoints','/systemManage/getRoleEndpoints','/systemManage/updateRoleEndpoints')`(by v1、不踩既有 26 endpoint policy / menu / button 列)。up→down→up throwaway DB 可逆。**不建表**(§I.6 gate N/A)。

## 3. `auth/endpoint_auth.rs`(鏡像 button_auth、multi-method HARD REPLACE、無自鎖)
- `SetRoleEndpointError { Casbin(casbin::Error), Db(DbErr) }` + From impls(鏡像 SetRoleButtonError)。
- `get_role_endpoints(enforcer, role_code) -> Vec<(String,String)>`:對 m∈{GET,POST,DELETE} 各 `get_filtered_policy(0,[role,"",m])` → 收 (v1=path, v2=method);依 (path,method) 排序穩定。
- `replace_role_endpoint_policies(enforcer, role_code, endpoints) -> Result<Vec<(String,String)>, casbin::Error>`:before 快照;**逐 method `remove_filtered_policy(0,[role,"",m])` for m∈{GET,POST,DELETE}**(★ 不可裸空-v2、否則誤刪 menu/button 列);`add_policies`(每 endpoint 一列 `[role, path, method]`;空集 Ok(false))。
- `set_role_endpoint(state, role_code, endpoints, operator) -> Result<(), SetRoleEndpointError>`:write-lock 最小化 + 011 audit(`casbin_rule`、before/after endpoint 集、operator)+ `publish_policy_invalidate`(共用 021 watcher)。**無自鎖 guard**(root-mode 在 handler 擋、見 §4)。
- `#[cfg(test)]`:multi-method HARD REPLACE 對 v2='menu'/'button' **正交**(seed menu+button+endpoint 列、replace endpoint 後 menu/button 存活);空集清該 role endpoint 列;get 排序;鏡像 button_auth orthogonality test。

## 4. handlers(`system_manage.rs` 擴、Super-only enforce_mw、零 entity::)
- `get_all_endpoints(State) -> Res<Vec<Endpoint>>`:回 ENDPOINT_REGISTRY const(map 成 Endpoint{method,path}、字典序)。infallible。
- `get_role_endpoints(State, Query<RoleIdReq>) -> Res<Vec<Endpoint>>`:de_role_id;find_active_by_id→code(None→2222「角色不存在」/Err→5000);**roleId=R_SUPER → 回全 registry**(root 全通);否則 enforcer.read → endpoint_auth::get_role_endpoints。
- `update_role_endpoints(State, Extension<ctx>, Json<RoleEndpointReq>) -> Res<()>`:operator(None→5000);find_active_by_id→code(None→2222/Err→5000);**root-mode guard:code=="R_SUPER" → 2222「不可编辑超级管理员」**;**非法 endpoint:任一送入 (method,path) ∉ ENDPOINT_REGISTRY → 2222「接口不存在」**;set_role_endpoint HARD REPLACE → Ok→Res::ok(())/Err→5000。
- DTO `RoleEndpointReq { #[serde(deserialize_with="de_role_id")] role_id: i64, endpoints: Vec<Endpoint> }`(camelCase)。
- 3 route 掛 enforce_mw(endpoint policy 由 §2 seed)。

## 5. wire DTO(envelope `{data,code:"0000",msg}`)

| endpoint | method | req | res `data` |
|---|---|---|---|
| `/systemManage/getAllEndpoints` | GET | — | `[{method,path}]`(registry、字典序) |
| `/systemManage/getRoleEndpoints` | GET | `?roleId`(number\|string) | `[{method,path}]`(該角色 granted;Super→全 registry) |
| `/systemManage/updateRoleEndpoints` | POST | `{roleId, endpoints:[{method,path}]}` | `null`(HARD REPLACE) |

- rust `Endpoint { method: String, path: String }`(serialize、camelCase 不需 —— method/path 已小寫)。3 端對齊:rust `Endpoint` ↔ base-web `Api.SystemManage.Endpoint{method,path}` ↔ modal `checks: string[]`(composite `"${method} ${path}"` 為 NTree key、提交時 map 回 `{method,path}[]`)。

## 6. base-web(MODAL-WIRING ★、需 amendment 見 plan)
| 檔 | 改動 |
|---|---|
| `typings/api/system-manage.d.ts` | +`Endpoint = { method: string; path: string }`(MenuButton 後) |
| `service/api/rev2-system-manage.ts` | +3 fetch fn:`fetchGetAllEndpoints()`→`Endpoint[]` / `fetchGetRoleEndpoints(roleId)`→`Endpoint[]` / `fetchUpdateRoleEndpoints(roleId, endpoints)`→`null` |
| `views/manage/role/modules/endpoint-auth-modal.vue` | **新檔**(鏡像 button-auth-modal):NTree key-field=composite `"${method} ${path}"`、checks:string[]、init→watch(visible)、!error toast;**root-mode:roleId=Super → 全勾+disabled** |
| `role-operate-drawer.vue` | v-if=isEdit 區 +「接口权限」NButton + `<EndpointAuthModal :role-id=roleId>`(鏡像 MenuAuth/ButtonAuth) |
| `locales/langs/{zh-cn,en-us}.ts` | +`page.manage.role.endpointAuth`(接口权限 / Endpoint Auth) |

## 7. D1 coverage guard(build-time 靜態 lint、`server/tests/`)
- model on `entity_access_lint.rs`:讀 `src/main.rs` 文字 → 抽每 `.route("<path>", get|post|delete(...))` + 其 `.route_layer` span 是否含 `enforce_mw`;讀 `../migration/src/*.rs` seeded `('p','R_x','/path','METHOD',…)` literals;斷言**每條 enforce_mw (path,method) 有 ≥1 matching (v1,v2) policy 列**(無 drift/死路由/漏 seed);亦斷言 ENDPOINT_REGISTRY const 與 enforce_mw routes 一致。重用 `strip_comments_and_strings`(L58)。
- negative unit test:故意「receive 一條 enforce_mw 但無 seed」的 fixture → lint 失敗(證 guard 咬合)。
- **token-vs-policy 繞過**:靜態 lint 不發請求 → 無 3333 遮蔽問題(R5)。

## 8. 矩陣 reconcile(R7、文件、實作不變)
in-place 校正 `docs/INTEGRATION-DESIGN.md` 三處過時 wildcard → 「逐 endpoint、無 wildcard」:**L500**(§4.6.3 矩陣列)/ **L521**(§4.6.3 seed 寫法)/ **L749-752**(§6.3 body)。+ §11.21 amendment-of-record(blockquote)。menu-read 分歧(getMenuList/v2·getAllPages·getMenuTree:Super-only)以實作為準、文件對齊;Admin runtime grantable(modal)。**casbin seed 不變**(R_SUPER 本就 per-endpoint)。
</content>
