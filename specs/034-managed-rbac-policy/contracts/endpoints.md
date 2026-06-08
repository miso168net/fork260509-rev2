# Contracts: 端點 wire 契約

> envelope = `Res<T> = {data, code, msg}`(code 為 string、業務錯誤仍 HTTP 200)。base-web `request<T>` 的 T = inner data(request/index.ts:26 抽 `response.data.data`)。

## A. US5 新端點(2 條、R_SUPER only)

### A.1 `GET /systemManage/getArchivedPolicies`

- params:無
- 200 `Res<Vec<ArchivedPolicy>>`,`ArchivedPolicy = { id:string, dimension:string, roleCode:string, target:string, reason:string, archivedAt:string, archivedBy:number|null }`
  - `dimension` ∈ `"menu" | "button" | "GET" | "POST" | "DELETE"`(由 v2 推:menu/button 常數、endpoint 為 HTTP method)
  - `target` = v1(route_name / button code / path)
  - **排除** `reason="menu_soft_delete"` 列(spec Clarification Q2)
  - `id` = archive.id 經 `.to_string()`(沿既有 id 慣例)
- 非 R_SUPER → enforce_mw 403 + 5003(route_layer 擋,不進 handler)

### A.2 `POST /systemManage/restorePolicy`

- body:`{ archiveId:number }`
- 200 成功:`Res<()>`(code 0000)
- 撞 live 同列(7-col unique 已存在)→ **0000 no-op 成功**(視為已授)
- archiveId 不存在 → **2222** + `msg="归档记录不存在"`(沿既有「X不存在」慣例、**非** 4040,research R9)
- DB/casbin 錯 → 5000
- 還原的 archive 列若 reason=`menu_soft_delete` → handler 拒(2222「请改用还原选单」)或不暴露於列表故不可達(list 已過濾)

> **registry/lint 同步(必)**:2 端點進 `ENDPOINT_REGISTRY`(endpoint_auth.rs:74)+ `EXPECTED_ROUTE_COUNT` 33→**35**(endpoint_coverage_lint.rs:602 + endpoint_auth.rs:498 in-module 單測)+ main.rs route + m033 seed(R_SUPER GET getArchivedPolicies / POST restorePolicy)+ 兩列標 protected。

## B. US3 收斂後 — 3 modal wire(逐位元組不變、契約凍結)

| 端點 | method | request | response T | 錯誤 |
|---|---|---|---|---|
| getRoleMenu | GET | `?roleId` | `Vec<i64>`(menu ids)| roleId 查無 active role → 2222「角色不存在」 |
| updateRoleMenu | POST | `{roleId, menuIds:number[]}` | `()` | 自鎖(protected)→ 2222;menu 不存在 → 2222;DB/casbin → 5000 |
| getAllButtons | GET | — | `Vec<ButtonItem{code,desc}>`(小寫、無 rename)| — |
| getRoleButton | GET | `?roleId` | `Vec<String>`(code 集、字典序)| — |
| updateRoleButton | POST | `{roleId, codes:string[]}` | `()` | 非法 code → 2222「按钮不存在」 |
| getAllEndpoints | GET | — | `Vec<Endpoint{method,path}>`(camelCase)| — |
| getRoleEndpoints | GET | `?roleId` | `Vec<Endpoint>`((path,method) 序;**R_SUPER 短路回全 registry**)| — |
| updateRoleEndpoints | POST | `{roleId, endpoints:Endpoint[]}` | `()` | **R_SUPER 拒編** → 2222「不可编辑超级管理员」;非法 → 2222「接口不存在」 |

> 收斂只改 handler 內部呼叫 `set_role_dimension(role, dim, desired, op)`,**route 註冊 / enforce_mw / request·response 形狀 / 錯碼 / 三種排序**全保留。空集 = 清光該維(合法、Res::ok)。

## C. D10 — menu list 加 `protected`(US5、3 端對齊)

`Api.SystemManage.Menu += { protected:boolean }`;rust menu list handler(getMenuList/v2 等)回 `protected`;`menu-operate-modal.vue:26` 讀 `row.protected` 退役硬寫 `SEED_MENU_ROUTE_NAMES`。

## D. 錯誤碼(全重用 008 矩陣、不新增)

| 情境 | code | msg |
|---|---|---|
| protected 不可移除 / R_SUPER 自鎖 | 2222 | 自訂(如「不可移除受保护权限」) |
| restore archiveId 不存在 | 2222 | 「归档记录不存在」 |
| restore 撞 live 同列 | 0000 | no-op 成功 |
| route_name 重用競態 | 5000 | — |
| 非 R_SUPER 存取治理端點 | 5003 | enforce_mw 拒 |
