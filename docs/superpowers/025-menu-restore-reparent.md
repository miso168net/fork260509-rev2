# 025 menu-restore-reparent — Phase 0 brainstorm spec-design

> superpowers:brainstorming 產出(2026-06-04)。**交棒 `/speckit-specify` 手動執行**(CLAUDE.md §3,不走 writing-plans)。
> 來源:CHECKLIST §1 下一步 候選 C「Phase 4 餘:選單 restore + re-parent」;next-feature 分析 workflow grounding(scope/effort/amendment/bundleable §2 已評)。

## 目標

補完 **020-manage-menu-write 刻意劃出的 FR-011 OUT scope** 的兩個缺口,完成選單管理 CRUD 的最後一角:
1. **restore** — 復原誤刪(軟刪)的選單(現在誤刪只能下 SQL 救)。
2. **re-parent** — 變更既有選單的上層父選單 parentId(現在只能刪掉重建、會丟 id/audit/可見性 policy)。

**約束**(已 grounding 確認):**無新表 / 無新 crate / 無新 dep / 無 fork / 無 §11.6 amendment**;routeName 是 Casbin 可見性 policy 鍵、re-parent 不動它 → 可見性 policy 不受影響。

## 親決(brainstorm 決策)

- **S1 scope — 兩個一起做**:restore + re-parent 同一 feature(025)補完。各自小、同 sys_menu 域、改同幾個檔。
- **R1 restore 孤兒 — 擋下、要求先復原上層**:復原一筆其父已軟刪的選單 → 回 **2222「上层菜单已删除,请先复原上层」**。保樹完整、不產生看不見的選單;與 020 D5 刪除 guard(父有 active 子則擋刪)哲學對稱(刪父時它無 active 子,故子是先被單獨刪 → 復原子時父可能已不在)。
- **R2 re-parent 範圍 — 只自訂選單可搬、種子父層固定**:試移種子(系統內建)選單 → 回 **2222「不可移动系统内置菜单」**。與「種子不可刪」一致;種子是 canonical IA、搬動破壞導覽結構 + 可能影響 021 自鎖 guard 推理。自訂選單(未來新增的)可自由重組。
- **R3 回收桶 UI — 選單頁「顯示已刪除」切換**:menu/index.vue 加切換,ON → 表格切到已刪平鋪清單 + 每列「復原」鈕;OFF → 正常 active 樹。(非獨立頁面〔免新路由/導覽/可見性 policy〕、非 modal。)

## 設計

### 後端(rust-api,沿既有 soft_delete/update_menu 範式)

**facade `model/facade/sys_menu.rs`**:
- `list_deleted_paginated(db, page_idx, size)` — 鏡像 `list_active_paginated`,改 `deleted_at IS NOT NULL`、id ASC。供 getDeletedMenus。
- `restore(db, id, operator) -> Result<bool, DbErr>` — 鏡像 `soft_delete` 反向:找 deleted 列(deleted_at IS NOT NULL)→ set `deleted_at=NULL` + `deleted_by=NULL`(§I.6 成對清空、active 態兩者皆 NULL)→ mutate_in_txn 內 audit **RESTORE** event(payload_before=刪除態快照)。Ok(true)/Ok(false no-op:查無 deleted 列)/Err。**guard(route_name 唯一性、父 active)在 handler 層**(沿 facade/handler 分工:guard 在 handler、如 delete 的種子/父 guard)。
- `update_menu` 加回 **`parent_id`**:`UpdateMenuData` + `update_menu_query` 加 `col_expr(Column::ParentId, …)`。**route_name / menu_type 仍 immutable(D2)**。
- 純函式 `would_create_cycle(id: i64, new_parent_id: Option<i64>, all_menus: &[(id, parent_id)]) -> bool` — 從 new_parent 往上走父鏈到根,撞到 id ⇒ cycle。**TDD red→green 可單測**(無 DB I/O)。

**handlers `handler/system_manage.rs`**(零 entity::、Super-only、掛 enforce_mw):
- `get_deleted_menus`(GET → `PageRes<MenuItem>`,鏡像 get_menu_list 走 list_deleted)。
- `restore_menu`(POST `{id}` → `Res<()>`)— guards 依序:① 目標查無 deleted 列 → 2222「菜单不存在或未删除」;② route_name 已被某 **active** 列佔用 → 2222「路由名已被占用」(restore 後撞 active 唯一性);③ **父非空且該父非 active(已刪/不存在)→ 2222「上层菜单已删除,请先复原上层」**(R1)→ 全過 → facade `restore`。
- `update_menu` 改:已載入現列(種子 guard 用)→ 比對 `req.parent_id` vs 現 parent_id:**(a)** 改了且現列是種子 → 2222「不可移动系统内置菜单」(R2);**(b)** 改了 → `would_create_cycle` → 2222「不可移动到自己的子层」+ 新父須 active 且 menu_type=1(目錄)或頂層(null)→ 否則 2222「上层菜单无效」。未改 parent_id 的純編輯 → guard trivially pass(rev2 既有行為不變)。

**migration `m20260529_000025`**:seed 2 條 Super-only endpoint policy(`getDeletedMenus` GET / `restoreMenu` POST),`ON CONFLICT DO NOTHING`、down by-code(v1 IN 2 path)精準刪、**不建表**。**D1 build-time endpoint-coverage lint(023)** 強制 main.rs route ↔ migration seed ↔ `ENDPOINT_REGISTRY` 三方一致(漏 seed/registry → build fail);須加 2 registry entries。up→down→up throwaway DB 可逆。

**audit**:加 `AuditOperation::Restore` variant(或復用 Update + 註)— plan 定。

### 前端(base-web)

- **`views/manage/menu/index.vue`**:加「顯示已刪除」NSwitch。ON → 資料源切 `fetchGetDeletedMenus`、operate 欄條件渲染「復原」鈕(取代 編輯/刪除/加子);OFF → 正常 active 樹。復原鈕 → `fetchRestoreMenu(id)` → `!error` 才 refresh。
- **`views/manage/menu/modules/menu-operate-modal.vue`**:加 **parentId 的 `NTreeSelect`**(選單樹為選項)。**種子選單(編輯)→ disabled**(沿 menuType 已 disabled 範式);自訂選單 → 可編。submit 帶 parentId(流過既有 updateMenu wire)。
- **wrapper `service/api/rev2-system-manage.ts`**:+2 fn(`fetchGetDeletedMenus` / `fetchRestoreMenu`)。updateMenu 既有不動(modal 多送 parentId 即流過)。

### wire 決策(brainstorm 拍板)
- **getDeletedMenus = 獨立端點**(非擴 getMenuList 加 deleted flag):per-capability 端點 + D1 lint 強制一致,符合專案範式;getMenuList 維持「active-only」契約不被汙染。
- **re-parent 併進 updateMenu**(非獨立 moveMenu 端點):re-parent 在「編輯」modal 的 tree-select 改父、submit 走 updateMenu;免新端點/seed/registry。代價:update_menu 多 parent_id 比對 guard、那條 immutability 單測要重寫。

## ⚠️ Constitution 風險(plan 階段處理)

base-web 加 **parentId NTreeSelect(新 form 控件)+ 已刪切換/復原鈕** 屬 `views/manage/menu/**` 新 inline 結構,**可能超出 MODAL-WIRING ★ 現邊界**(現邊界:`// request` 接線 + button gating + 同模式 auth modal)→ `/speckit-plan` Constitution Check 會判定是否需 amendment(**先例:022 加 button gating、023 加新 modal 都走過 amendment**)。可能要 user 簽核(amendment-workflow:逐行列 edit 過目、分流四檔)。

## 測試
- **純函式單測(TDD red→green)**:`would_create_cycle`(自移/移到子層/合法移/移頂層);restore guard 若可純抽。**重寫** `update_menu_query_sets_..._omits_immutables` 單測(parent_id 從「不得在 SQL」改「可在 SQL,route_name/menu_type 仍不得」)。
- **C-V acceptance**(contracts):restore round-trip(刪→getDeletedMenus 顯該列→restore→回 active+audit RESTORE+deleted_* 皆 NULL)、restore guards(父刪 2222 / route_name 佔用 2222 / 非 deleted 2222)、re-parent round-trip(搬自訂選單→getUserRoutes 即時反映新位置〔D1 payoff〕→ cycle 2222 → 種子 2222 → 新父非目錄 2222)、種子不可刪/不可移回歸、migration 025 up→down→up 可逆(menu/button/既有 endpoint 存活、僅 2 列增刪)、守恆(server 單測 + D1 lint + entity_access_lint + Migrator::up=0 + typecheck)、**CDP**(切換顯已刪+復原 / 編輯 modal re-parent 自訂 + 種子 disabled)。沿 023 isolated-context harness、建 `tests/025-menu-restore-reparent/`。

## 可順帶清的 §2 follow-up(bundleable)
- **§2.24**:update_menu 整欄替換省略欄→NULL 語意 + 種子停用 guard 只擋 status==Some(2)(re-parent 動 UpdateMenuData/update_menu_query 同窗順帶複查)；create_menu/restore 的 route_name 唯一性 TOCTOU + 父 guard 雙查(restore 同形)。
- **§2.23**:`normalize_page` stale `#[allow(dead_code)]`(restore 動 handler/system_manage.rs 同檔順手清)；停用(status=2)menu 顯示語意(restore/已刪視圖觸及讀層)。

## Out of scope（後續 feature / 不做）
- 角色—選單可見性編輯(021 已做)、ButtonAuth 編輯(022 已做)。
- 軟刪選單的**級聯復原**(復原父不自動復原其已刪子;逐列 restore、R1 要求由上而下)。
- 自訂選單以外的種子重組(R2 固定種子父層)。
- restore 後的 order 重排 / 衝突自動解(沿現 order 值,衝突由 order 顯示語意處理)。
