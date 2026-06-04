# Quickstart: ButtonAuth Rollout (024)

## 這是什麼
把 022 用戶頁的「按鈕權限可編輯迴路」rollout 到**角色頁/選單頁**:
- 為 `manage_role` / `manage_menu` seed `role:*` / `menu:*` 按鈕碼進 `sys_menu.buttons`（registry）→ 自動進「按鈕權限」modal 可勾選 → 沿 022 `updateRoleButton`→`set_role_button` HARD REPLACE 同步 casbin（即時、redis 廣播）。
- 角色/選單頁寫按鈕依 `hasAuth(code)` 顯/隱;初始授權 **R_SUPER-only**、非-Super 由運維經 modal 指派。
- **§2.26 reactive-columns 修正**（user/role/menu 三頁）。
**無 fork、無新 crate/dep、無新 rust code（除 1 seed migration）、無新 endpoint、不建表。decoupled 刻意**（按鈕可見性 ≠ 端點可呼叫、留「完整版」未來）。

## 跑起來（dev）
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart base-web   # vite stale;rust 無 server code 改、不需 restart rust-api
# 驗（詳見 contracts/verification-commands.md;dev DB = soybean_admin_rust）
H=http://127.0.0.1:21081
SUPER=$(curl -s $H/auth/login -H 'Content-Type: application/json' -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s $H/systemManage/getAllButtons -H "Authorization: Bearer $SUPER" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']),'button codes')"  # 12
```

## 端到端（CDP,經 :21080）
- Super → /manage/role:見 新增/編輯/刪除;Admin → 初始全不顯。
- Super → /manage/role 編某角色「按鈕權限」→ 勾 role:edit → 該角色重登後 /manage/role 出現「編輯」鈕（端到端編輯迴路生效）→ 還原。

## 關鍵檔
- rust:`migration/...024_seed_role_menu_button_auth.rs`（新、2 UPDATE sys_menu.buttons + 6 R_SUPER casbin button 列）。**後端機制/modal/wire 零改動**（沿 022）。
- base-web:`views/manage/role/index.vue`、`views/manage/menu/index.vue`（加 hasAuth gating）、`views/manage/user/index.vue`（reactive-columns retrofit）。
- 文件:`docs/INTEGRATION-DESIGN.md` §10 Phase 4 ButtonAuth as-built 補 rollout 段（收尾）。

## 設計權威
spec.md / plan.md / research.md / data-model.md / contracts/。Constitution v1.4.0（MODAL-WIRING ★ v1.3.0 (b) button gating 既有邊界內;§IV 8/8 PASS、**無 amendment**）。brainstorm K1–K4:[`docs/superpowers/024-button-auth-rollout.md`](../../docs/superpowers/024-button-auth-rollout.md)。
