# Quickstart: Endpoint Permission Authorization (023)

## 這是什麼
把「角色 × API endpoint 權限」從建置期硬編(migration seed)變**維運期可編輯**,鏡像 021 menu / 022 button auth:
- Casbin `(role, path, METHOD)` endpoint policy 改 **runtime 可編輯**(stock adapter HARD REPLACE、**逐 method** remove_filtered 避免誤刪 menu/button 列、redis invalidate)。
- **root-mode**:超管(R_SUPER)永遠全通、不可編輯 → 整站自鎖歸零。
- **D1 build-time 靜態 lint**:每條 enforce_mw route 必有 seed policy + ENDPOINT_REGISTRY 一致 → 關掉「path typo / 漏 seed 靜默死路由」破口。
- **角色頁「接口权限」modal**(新、鏡像 button-auth-modal、root-mode disabled-for-Super)。
- reconcile 過時 `R_SUPER,*,*` wildcard 設計文字(matcher 本就 exact-equality、wildcard 從未實作)。
**無 fork、無新 crate/dep**;單一 migration 023 只 seed 3 治理端點列。

## 跑起來(dev)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api base-web
# 驗(詳見 contracts/verification-commands.md;dev DB = soybean_admin_rust)
SUPER=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s :21081/systemManage/getAllEndpoints -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']),'endpoints')"  # 28
```

## 端到端(CDP,經 :21080)
- Super → /manage/role → 編輯 admin 角色 →「接口权限」→ 勾選 endpoint 提交 → admin 重登即可呼叫;編輯超管角色 → modal disabled(全通)。

## 關鍵檔
- rust:`auth/endpoint_auth.rs`(新、鏡像 button_auth、multi-method HARD REPLACE)、`handler/system_manage.rs`(+3 handler、root-mode guard)、`migration/...023_seed_endpoint_auth_policy.rs`(3 列)、`server/tests/endpoint_coverage_lint.rs`(新、D1 靜態守衛)。
- base-web:`service/api/rev2-system-manage.ts`(+3 fn)、`role/modules/endpoint-auth-modal.vue`(新)、`role-operate-drawer.vue`(+按鈕)、`typings/api/system-manage.d.ts`(+Endpoint)、`locales/langs/{zh-cn,en-us}.ts`(+endpointAuth)。
- 文件:`docs/INTEGRATION-DESIGN.md` §4.6.3/§6.3 過時 wildcard 校正 + §11.21;`.specify/memory/constitution.md` MODAL-WIRING amendment(v1.4.0)。

## 設計權威
spec.md / plan.md / research.md / data-model.md / contracts/。Constitution v1.4.0(MODAL-WIRING ★ 擴允許新權限 modal+trigger;§IV 8/8 PASS)。
</content>
