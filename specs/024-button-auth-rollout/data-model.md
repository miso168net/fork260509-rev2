# Data Model: ButtonAuth Rollout (024) — Phase 1

> 拍定 research.md。file:line 以 actual code 為準（grep 實證）。**不建表、不加欄、無新 crate/dep、無新 rust code（除 1 seed migration）**;sys_menu.buttons / casbin button policy 沿 022。

## 1. 按鈕碼 registry（seed 進 sys_menu.buttons）

| sys_menu route_name | menu_type | seed buttons（JSON、本波新增） |
|---|---|---|
| `manage_role`（現 buttons=NULL） | 2 | `[{"code":"role:add","desc":"新增角色"},{"code":"role:edit","desc":"编辑角色"},{"code":"role:delete","desc":"删除角色"}]` |
| `manage_menu`（現 buttons=NULL） | 2 | `[{"code":"menu:add","desc":"新增菜单"},{"code":"menu:edit","desc":"编辑菜单"},{"code":"menu:delete","desc":"删除菜单"}]` |

- 命名 convention 對齊 022 `user:add/edit/delete`（`<page>:<action>`、小寫 colon-分隔）。desc 簡體中文（registry 顯示用，同 022）。
- 「加子選單」**不另設 code**:沿用 `menu:add`（加子=add 操作的變體;前端疊加 `menuType==='1'` 資料條件）。
- 這些碼經 `getAllButtons`（`aggregate_active_buttons` 聚合全 active sys_menu.buttons、dedup 字典序）自動進「按鈕權限」modal registry —— **零後端改動**（R1）。

## 2. migration 024（極小:2 UPDATE + 6 casbin INSERT + 對稱 down）

`m20260529_000024_seed_role_menu_button_auth.rs`（註冊 `migration/src/lib.rs`，鏡像 022 結構、`execute_unprepared`）:
- **up (a) registry**:2 條 `UPDATE sys_menu SET buttons = '<上表 JSON>'::jsonb WHERE route_name='manage_role'|'manage_menu' AND deleted_at IS NULL`。
- **up (b) 初始 casbin button policy**（只 R_SUPER 6 列、K4）:
  ```
  INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES
   ('p','R_SUPER','role:add','button','','',''), ('p','R_SUPER','role:edit','button','','',''), ('p','R_SUPER','role:delete','button','','',''),
   ('p','R_SUPER','menu:add','button','','',''), ('p','R_SUPER','menu:edit','button','','',''), ('p','R_SUPER','menu:delete','button','','','')
   ON CONFLICT DO NOTHING
  ```
- **down 精準可逆**:`DELETE FROM casbin_rule WHERE ptype='p' AND v2='button' AND v1 IN ('role:add','role:edit','role:delete','menu:add','menu:edit','menu:delete')`（by code、**不踩** 022 user:*/B_CODE*）+ `UPDATE sys_menu SET buttons=NULL WHERE route_name IN ('manage_role','manage_menu')`（還原 NULL，grep 實證 pre-024 即 NULL）。
- up→down→up throwaway DB 可逆;既有 022 button policy（10 列）+ menu policy 不變。**不建表**（§I.6 N/A）。

## 3. base-web（MODAL-WIRING ★ v1.3.0 (b) 既有邊界內、無新 fetch fn）

| 檔 | 改動 |
|---|---|
| `views/manage/role/index.vue` | toolbar `<TableHeaderOperation :show-add="hasAuth('role:add')">`;row 編輯 `hasAuth('role:edit')`、刪除 `hasAuth('role:delete')`（鏡像 user/index.vue operate column）;reactive-columns（R4） |
| `views/manage/menu/index.vue` | toolbar `:show-add="hasAuth('menu:add')"`;row 加子選單 `row.menuType === '1' && hasAuth('menu:add')`、編輯 `hasAuth('menu:edit')`、刪除 `hasAuth('menu:delete')`;reactive-columns（R4） |
| `views/manage/user/index.vue` | **僅** reactive-columns 修正（§2.26 retrofit;gating code/邏輯不變、結果與 022 逐項一致） |

- `hasAuth`（`useAuth`，022 既有）= `authStore.userInfo.buttons.includes(code)`;**不加 fetch fn / 不改 button-auth-modal / 不改 rev2-system-manage.ts**（編輯迴路沿 022）。
- **reactive-columns**（R4）:row-操作 column 可見性納入隨 `userInfo.buttons` 重算的 reactive 來源;實作期對齊 base-web `useNaivePaginatedTable` columns 反應性實際形（plan research 再 grep）。

## 4. 編輯迴路（沿 022、零改動，列此供 acceptance 對照）

`/systemManage/getAllButtons`（registry,聚合後含新 role:*/menu:* 碼）/ `getRoleButton?roleId`（預載該角色 grants）/ `updateRoleButton{roleId,codes}`（HARD REPLACE → casbin + redis）—— 皆 022 既有、Super-only enforce_mw。本波**不動** wire/handler/DTO。

## 5. 測試（無單元測試、明示理由）

- **無新純函式**:gating=既有 `hasAuth`、後端=seed migration（無邏輯）、迴路=022 已測（022 有 button_auth.rs #[cfg(test)] 覆蓋 HARD REPLACE/正交/字典序）→ 本波無新可單測純函式。
- 覆蓋靠 **C-V acceptance**（contracts）:CDP（三角色 × role/menu 頁 × 寫按鈕,經 modal 勾選後顯隱）+ psql（migration seed 列 + casbin grant）+ migration up→down→up 可逆。
- **明示於 plan/tasks**「無單元測試」及理由（同 022 wiring 類範式）。

## 6. decoupled 已知債（R5、文件記錄、不解）

按鈕碼授權（v2='button'）與 023 端點權限（v2=method）兩套獨立維度 → 勾 role:edit 顯鈕但端點 Super-only → 5003。本波刻意（K1、FR-008）;visible=clickable 自動對齊留「完整版」未來 feature。
