# Quickstart: Button Permission Authorization (022)

## 這是什麼

把硬編按鈕權限(`auth/buttons.rs` role→button matrix)變**維運期可編輯**,鏡像 021 MenuAuth:
- Casbin `(role, button_code, 'button')` 存 grant;`getUserInfo.buttons` 改讀 Casbin。
- 可用按鈕 = 各選單 `sys_menu.buttons` 聚合(seed 真實按鈕)。
- **pilot**:用戶管理頁操作鈕接 `hasAuth` 端到端生效。
- **救活 toggle-auth** demo(seed 入 sys_menu + menu policy)保 B_CODE1/2/3 可驗。

## 跑起來(dev)

```bash
# 1. 套 migration 022 + 重啟（WSL2 inotify 不可靠）
docker compose run --rm migrate up
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api base-web

# 2. 驗（詳見 contracts/verification-commands.md）
SUPER=$(curl -s :21081/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s :21081/systemManage/getAllButtons -H "Authorization: Bearer $SUPER"          # 6 碼 registry
curl -s ":21081/systemManage/getRoleButton?roleId=2" -H "Authorization: Bearer $SUPER"  # Admin granted
curl -s :21081/auth/getUserInfo -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['buttons'])"  # 新基線
```

## 端到端(CDP,經 :21080)

- Admin 登入 `/manage/user`:見 编辑(user:edit)、不见 删除/新增 → Super 指派 user:delete 給 Admin → Admin 重登見 删除。
- 三角色登入 `/function/toggle-auth`:各見對應 B_CODE 鈕。

## 關鍵檔

- rust:`auth/button_auth.rs`(新,鏡像 menu_auth)、`handler/system_manage.rs`(+3 端)、`handler/auth.rs`(getUserInfo 改源)、`migration/...022_seed_button_auth.rs`。
- base-web:`service/api/rev2-system-manage.ts`(+3 fn)、`role/modules/button-auth-modal.vue`(接線 key-on-code)、`user/index.vue`(gating)、`components/advanced/table-header-operation.vue`(show-add prop)。

## 設計權威

spec.md / plan.md / research.md / data-model.md / contracts/。Constitution v1.3.0(§IV 8/8 PASS;2 amendment:MODAL-WIRING 邊界 +button gating、§I.2 toggle-auth 例外)。
