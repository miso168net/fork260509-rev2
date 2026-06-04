# Research: ButtonAuth Rollout (024) — Phase 0

> grep-verify 紀律（CLAUDE.md §3）:不信 brainstorm 命名假設、act on actual code。本檔由 grounding（base-web Explore map + dev DB psql + 022 migration 實讀，2026-06-04）逐項實證。
> **Scope**:把 022 button gating + 可編輯迴路 rollout 到 role/menu 頁。**無 fork、無新 crate/dep、無新 rust code（除 1 seed migration）、無新 endpoint**。

## R0. 現況 CONFIRMED（grounding）

- **sys_menu manage 列**（psql 實證）:`manage_role`（menu_type=2、buttons=**NULL**）、`manage_menu`（menu_type=2、buttons=**NULL**）皆存在可 UPDATE;`manage_user.buttons` = 022 seed 的 `[user:add/edit/delete]`;`manage`（menu_type=1 父、NULL）、`manage_user-detail`（NULL）。
- **現有 casbin button policy**（v2='button'，psql 實證）:R_SUPER{B_CODE1/2/3,user:add,user:delete,user:edit}、R_ADMIN{B_CODE2,B_CODE3,**user:edit**}、R_USER_COMMON{B_CODE3} = 10 列。→ **R_ADMIN 有 user:edit**（022 decoupled demo grant）= 本波**不動**（FR-007）。
- **編輯迴路（022）**:button-auth-modal → `fetchGetAllButtons`（`getAllButtons` handler → `aggregate_active_buttons`:聚合**全** active sys_menu.buttons、dedup-by-code 字典序）→ registry;`fetchGetRoleButton`（預載該角色 grants）;`fetchUpdateRoleButton(roleId,codes)` → `set_role_button` HARD REPLACE casbin `(role,code,'button')` + 011 audit + redis publish。
- **前端 gating（022 用戶頁）**:`hasAuth(code)`（`useAuth`,讀 `authStore.userInfo.buttons.includes(code)`);toolbar `<TableHeaderOperation :show-add="hasAuth('user:add')">`（reactive template）;row 編輯/刪除在 `columns` JSX `render` factory 內 `hasAuth('user:edit'/'user:delete')`。
- **getUserInfo.buttons**:後端聚合該使用者各角色的 casbin button grants → `userInfo.buttons:string[]`;base-web `authStore` reactive 存。

## R1 — 編輯迴路覆蓋新碼:零後端改動

**Decision**:`role:*` / `menu:*` 按鈕碼**只要 seed 進 `sys_menu.buttons`**（manage_role/manage_menu 列），即自動被 `getAllButtons`（`aggregate_active_buttons` 聚合全 active sys_menu.buttons）納入 registry → 「按鈕權限」modal 列得出、可勾選;`updateRoleButton`→`set_role_button` HARD REPLACE 對**任意 code 通用**（非寫死 user:*）→ 勾選提交即同步 casbin。**後端除 seed migration 外零改動**（getAllButtons/getRoleButton/updateRoleButton/set_role_button/button-auth-modal 全不動）。
**Rationale**:022 機制本就 code-agnostic（registry 來源=sys_menu.buttons 聚合、HARD REPLACE 不限 code 集）。grep 實證 `aggregate_active_buttons` 聚合全 active 列、非 manage_user 專屬。
**Alternatives**:改 getAllButtons 加 role/menu 專屬邏輯（rejected:既有聚合已涵蓋、零改動更安全）。

## R2 — migration 024（極小:2 UPDATE + 6 casbin INSERT，鏡像 022 結構）

**Decision**:`m20260529_000024_seed_role_menu_button_auth.rs`（註冊 lib.rs）:
- **registry**:`UPDATE sys_menu SET buttons = '[{code:role:add,desc:新增角色},{role:edit,编辑角色},{role:delete,删除角色}]'::jsonb WHERE route_name='manage_role' AND deleted_at IS NULL`;同式 `manage_menu` → `[menu:add 新增菜单, menu:edit 编辑菜单, menu:delete 删除菜单]`。
- **初始 casbin button policy**:`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES ('p','R_SUPER','role:add','button','','',''), …6 列…(role:add/edit/delete + menu:add/edit/delete) ON CONFLICT DO NOTHING`。**只 R_SUPER**（K4）。
- **down 精準可逆**:`DELETE FROM casbin_rule WHERE ptype='p' AND v2='button' AND v1 IN ('role:add','role:edit','role:delete','menu:add','menu:edit','menu:delete')`（by code、**不踩** 022 user:*/B_CODE*）+ `UPDATE sys_menu SET buttons=NULL WHERE route_name IN ('manage_role','manage_menu')`（建表/010 時即 NULL，grep 實證）。up→down→up throwaway DB 可逆。
- 7-col 格式同 021/022（v3/v4/v5=''）;`execute_unprepared`、`manager.get_connection()`。
**Rationale**:鏡像 022 section (2)+(3) 結構;manage_role/manage_menu 列存在且 buttons=NULL（grep）→ UPDATE 安全、down 還原 NULL 正確。
**Alternatives**:seed 非-Super 初始 grant（rejected:K4 R_SUPER-only、其餘由 modal 指派、避免造「看得到但 5003」壞鈕）。

## R3 — frontend gating（鏡像 022 用戶頁、role/menu index.vue）

**Decision**:
- **角色頁** `views/manage/role/index.vue`:toolbar `<TableHeaderOperation :show-add="hasAuth('role:add')">`;row（operate column render）編輯 `hasAuth('role:edit')`、刪除 `hasAuth('role:delete')`（鏡像 user/index.vue:113-138 結構）。
- **選單頁** `views/manage/menu/index.vue`:toolbar `:show-add="hasAuth('menu:add')"`;row 加子選單 `row.menuType === '1' && hasAuth('menu:add')`（**保留既有 menuType 資料條件、疊加**、不取代）、編輯 `hasAuth('menu:edit')`、刪除 `hasAuth('menu:delete')`。
**Rationale**:`hasAuth` 既有（022）、code-string 比對;role/menu index.vue 現無 gating（grep:操作鈕無條件全顯）→ 加 hasAuth 即生效;batch-delete toolbar 沿 022 由 `disabled-delete`（選取數）控制、不另加 code。
**Alternatives**:gate by 角色而非 button code（rejected:破 decoupled 可獨立指派模型、不一致 022）。

## R4 — §2.26 reactive-columns 修正（user/role/menu 三頁）

**Decision**:row 按鈕 gating 現於 `columns` 的 JSX `render` factory 內呼叫 `hasAuth()`;columns 陣列若**建構一次、ref 不隨 `userInfo.buttons` 變**,則頁內授權變動不即時重繪。修法:把 row-操作 column 的可見性納入**會隨 `authStore.userInfo.buttons` 重算的 reactive 來源**（如 `computed` columns 或在 render 內讀 reactive store —— 依 base-web 既有 table hook `useNaivePaginatedTable` 的 columns 反應性實際形拍）。**套 user（retrofit §2.26）+ role + menu 三頁、行為一致**。
**Rationale**:§2.26（022 T007 review 觀察）:user 頁 row 鈕 gating 在 columns JSX、`:show-add` template 是 reactive 但 row 非;實務上角色切換=重登 fresh mount 故現無 bug,但頁內 in-place buttons 變動不重繪。本波三頁一致修。
**Tradeoff（明示）**:reactive 重算為輕量（admin 低頻、in-memory 查找）;須確保不破 022 用戶頁既有 gating 結果（編輯/刪除顯隱與既有逐項一致）。
**Alternatives**:不修 reactive、僅靠重登（rejected:§2.26 既登記、本波順手閉、且 rollout 後三頁應一致）。

## R5 — decoupled 已知債（按鈕可見性 ≠ 端點可呼叫）

**Decision**:按鈕碼授權（casbin v2='button'）與 023 端點權限（v2=HTTP method）為**兩套獨立可指派維度**;本波**不自動對齊**。可勾 `role:edit`（按鈕顯示）但該角色 updateRole 端點仍 Super-only（023 矩陣）→ 點擊 enforce_mw 回 5003。
**Rationale**:brainstorm K1 親決 decoupled（user 核心需求=按鈕可見性可經 modal **獨立指派**）;FR-008 明示 OUT「自動 visible=clickable / env 開關 / getUserInfo callableEndpoints」。022 用戶頁本就此模型（user:edit→Admin 可見但 updateUser Super-only）。
**Alternatives**:aligned（derive 自端點、零漂移）—— 需動 getUserInfo + 兩套機制 = 「完整版」未來 feature（brainstorm K2、留 DESIGN 候選）。

## R6 — scope 確認

**Decision**:024 **無 fork、無新 crate/dep、無新 rust code（除 1 seed migration）、無新 endpoint、不建表**。CLAUDE.md §3「新 workspace crate ⇒ prod image build」**不適用**（無新 crate、無 Dockerfile COPY 影響）→ prod image build 非強制。
**Rationale**:migration 為既有 migration crate 內新 seed 檔;前端為 base-web 既有頁 inline gating（MODAL-WIRING ★ v1.3.0 (b)）;迴路沿 022。

## 未決（交 data-model.md / contracts 拍板）

- 按鈕碼確切命名（`role:add/edit/delete` / `menu:add/edit/delete`，對齊 022 `user:*` 命名 convention）→ data-model §1 定稿。
- desc 中文字串（registry 顯示用）→ data-model §1。
- reactive-columns 修法在 base-web 既有 table hook 的確切落點 → data-model §3 / 實作期 grep `useNaivePaginatedTable` columns 反應性。
