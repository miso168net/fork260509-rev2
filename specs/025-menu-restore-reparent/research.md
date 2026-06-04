# Research: menu-restore-reparent (025) — Phase 0

> grep-verify 紀律(CLAUDE.md §3、constitution §I.5「不准 grep rev1」):act on actual code。本檔由 6-agent grounding workflow(2026-06-04,讀 sys_menu facade/handler/audit/D1-lint/base-web/constitution 實際 code)逐項實證。
> **Scope**:補完 020 FR-011 OUT 的 restore + re-parent。**無新表/crate/dep/fork、無新 rust crate**。**唯一 Constitution finding = MODAL-WIRING ★ v1.5.0 amendment**(見 R7)。

## R0. 現況 CONFIRMED(grounding)

- **facade `sys_menu.rs`(977 行)**:`soft_delete`(@410)/`update_menu`(@346)/`find_active_by_id`(@268,**active-only**)/`list_active_paginated`(@68)/`count_active_children`(@448)。`find_active()`=`Self::find().filter(DeletedAt.is_null())`(soft_delete.rs:14)。**無 restore / 無 list_deleted / 無 find_deleted**(SoftDeletable trait 只有 find_active default)。
- **`AuditOperation` enum(audit.rs:14)= `{ Insert, Update, SoftDelete, Restore }`**:`Restore.as_str()="RESTORE"`(@28)**已存在但全 src/ 從未被建構(dormant)**→ restore facade 是其首個消費者、**audit.rs 零改**。
- **immutability 單測**(sys_menu.rs:788)`update_menu_query_sets_updated_at_db_side_pairs_by_and_omits_immutables`:@842 `assert!(!sql.contains("parent_id"))` 須 flip;route_name/menu_type negative 斷言(@834-841)留。
- **handler `system_manage.rs`**:`update_menu`(@1162)/`delete_menu`(@1572)/`get_menu_list`(@1740)。`is_seed_menu`(@70)= `matches!(route_name, "home"|"manage"|"manage_user"|"manage_role"|"manage_menu"|"manage_user-detail")`。`DeleteReq{id:String}`(@1379)= 單-id 寫端 body。`MenuItem`(@1689,26 欄 camelCase)+ `PageRes`(envelope.rs:77)+ `parent_id_to_wire`(None→"0")。
- **partial-unique index** `sys_menu_route_name_active_uniq ON sys_menu(route_name) WHERE deleted_at IS NULL`(migration 018:102)→ restore(deleted_at→NULL)可能撞 active 唯一性。
- **D1 endpoint_coverage_lint(023)**:3 方一致(main.rs route ↔ migration seed ↔ `ENDPOINT_REGISTRY`)+ **3 處 hardcoded count=28**(endpoint_coverage_lint.rs:602 EXPECTED_ROUTE_COUNT、endpoint_auth.rs:490 len 斷言、line 61 doc-comment)。VERBS 封閉集 = GET/POST/DELETE(無 PUT/PATCH)。

## R1 — restore 後端(facade 新增,鏡像 soft_delete 反向)

**Decision**:
- 新 private `fn find_deleted() -> Select<Entity>` = `Entity::find().filter(Column::DeletedAt.is_not_null())` + `pub async fn list_deleted_paginated(db, page_idx, size) -> Result<(Vec<Model>, u64), DbErr>`(鏡像 list_active_paginated、id ASC)。
- 新 `find_deleted_by_id(db, id) -> Result<Option<Model>, DbErr>`(restore 載入已刪目標;**不可用 find_active_by_id**,它濾掉 deleted)。
- 新 private `fn restore_query(id) -> UpdateMany<Entity>` set `DeletedAt = Expr::value(Option::<DateTimeWithTimeZone>::None)` + `DeletedBy = Expr::value(Option::<i64>::None)`(§I.6 成對清空)filter Id。
- 新 `pub async fn restore(db, id, operator) -> Result<bool, DbErr>`:mutate_in_txn 內 find_deleted 列 → None→Ok(false) / Some→ snapshot(deleted 態)→ restore_query.exec → AuditEvent{ operation: `AuditOperation::Restore`, entity_table:"sys_menu", payload_before:Some(deleted snapshot), payload_after:None }。
**Rationale**:鏡像 soft_delete(@410)結構;`Restore` variant 已備。**Alternatives**:facade 內判 route_name/parent guard(rejected:guard 在 handler、沿 delete 的種子/父 guard 分工)。

## R2 — re-parent 後端(updateMenu 併入,**brainstorm「de_parent_id 已 absorb」更正**)

**Decision**:
- **MenuUpdateReq(@1131)新增** `#[serde(default, deserialize_with = "de_parent_id")] pub parent_id: Option<i64>`(鏡像 MenuCreateReq:562)。route_name/menu_type **仍不加**(D2 immutable、serde silently drop 機制不變、**不加 deny_unknown_fields**)。
- **UpdateMenuData(@276)新增** `pub parent_id: Option<i64>`;`update_menu_query(@302)`加 `.col_expr(Column::ParentId, Expr::value(data.parent_id))`。
- 純函式 `fn would_create_cycle(id: i64, new_parent_id: Option<i64>, all_menus: &[(i64, Option<i64>)]) -> bool`(從 new_parent 走父鏈,撞 id ⇒ true;無 DB、TDD 可測:self/descendant/legal/top)。
**★ 更正(grounding G5)**:spec-design 與 tasks 草稿說「de_parent_id 已 absorb parentId server-side(020)」**為誤** —— `de_parent_id` 只 wire 到 `MenuCreateReq`,**不在** MenuUpdateReq;update 路徑的 parentId 是因 **MenuUpdateReq 無此欄** 被 serde 丟棄。故 re-parent **須加** parent_id 欄+SET+guard(非零 rust 改);wire **契約** 已帶 parentId(base-web `MenuWriteModel` 含、modal submit 帶、doc-comment「ignored server-side」),故 **base-web wire 零改**、只加 UI 控件。
**Rationale**:CreateMenuData 已有 parent_id、updateMenu 補齊對等。

## R3 — re-parent guards(handler,鏡像 delete 的種子/父 guard)

**Decision**:update_menu handler 在既有「載入現列」arm(@1187,已為 seed-disable guard 載 model)後,比對 `req.parent_id` vs `model.parent_id`:
- (a) 改了 && `is_seed_menu(&model.route_name)` → 2222「不可移动系统内置菜单」(R2 親決:種子父固定)。
- (b) 改了 && `would_create_cycle(id, req.parent_id, all_menus)` → 2222「不可移动到自己的子层」(all_menus 由 `list_active_all` 取)。
- (c) 改了 && `req.parent_id == Some(p)` && (find_active_by_id(p)==None || 其 `menu_type != Some(1)`) → 2222「上层菜单无效」(FR-007:新父須 active 目錄;top-level None 合法、不擋)。
- 未改 parent_id → guard trivially pass(rev2 既有編輯行為不變)。
**Rationale**:`is_seed_menu` 既有(delete/update 共用);menu_type=1=目錄(018 seed)。**Alternatives**:facade 內 guard(rejected:沿 handler-layer guard 分工)。

## R4 — restore guards(handler,順序固定)

**Decision**:restore_menu handler(`Json(DeleteReq)`、`post`、Super-only):parse id(2222「菜单ID无效」)→ 依序:
- ① `find_deleted_by_id(id)`==None → 2222「菜单不存在或未删除」。
- ② route_name 已被某 active 列佔用(find_active by route_name)→ 2222「路由名已被占用」(FR-004;restore 撞 partial-unique active index)。
- ③ `model.parent_id == Some(p)` && `find_active_by_id(p)`==None → 2222「上层菜单已删除,请先复原上层」(R1 親決孤兒擋下;頂層 None 跳過)。
- 全過 → facade `restore`。Ok(false)→2222、Err→5000+log。
**Rationale**:② 是 TOCTOU pre-check(同 create_menu 唯一性、§2.24);DB partial-unique 為最終防線。

## R5 — wire 3 端對齊(grounding G5、CLAUDE.md §3)

**Decision**:
- **getDeletedMenus**:reuse `MenuItem`/`PageRes` **逐字**;base-web `fetchGetDeletedMenus` 用 `request<Api.SystemManage.MenuList>`(= `PaginatingQueryRecord<Menu>` = PageRes 形,common.d.ts:19)**零新 typing**;FE 第二資料源 reuse `Menu` row 型。
- **restoreMenu**:`Res<()>`→`data:null` 對 `request<null>`;body `{id:String}` reuse `DeleteReq` + `fetchDeleteMenu` 的 `data:{id}` 範式。
- **re-parent updateMenu**:wire 契約已帶 parentId(零 base-web wire 改);只加 parentId UI 控件 + 上述 rust 反序列化/SET/guard。
**3 端對齊 CONFIRMED**。

## R6 — restore-visibility 保留 + 021 自鎖不回歸(grounding G5)

**Decision/實證**:
- `soft_delete`/`restore`/`update_menu` **零 casbin/enforcer 觸碰**(純 sys_menu row + audit)。casbin menu-visibility 列 `[role, route_name, 'menu']`(keyed on route_name)軟刪後**孤兒持存、無害**(讀路徑 `get_user_routes`→`list_active_all`〔deleted_at IS NULL〕→`assemble_menu_tree` 略過孤兒 → 才 enforce;軟刪選單根本不在 active 樹)。**restore:route_name 不變(D2)→ 舊可見性自動套回**(intended payoff、無需 re-seed)。
- **021 `menu_set_locks_out_super`**(menu_auth.rs:62,`role=="R_SUPER" && !route_names.contains("manage_menu")`)route_name-keyed、僅 updateRoleMenu 路徑。re-parent 只改 parent_id(route_name immutable)→ **guard 完全不觸、可見性 key 不變**;R2(種子父固定)更強化 guard 文件依賴的「FR-011 no-reparent」前提。**非回歸 CONFIRMED**。
**已知債(留 plan Complexity / follow-up)**:孤兒 casbin 列 = 新建同 route_name 選單會繼承舊可見性 grant;restore/create 唯一性 guard 只擋 active 撞、不擋 deleted 撞(§2.24 同類)。

## R7 — ★ MODAL-WIRING Constitution finding(§IV.2/§IV.7 → v1.5.0 amendment)

**Decision(grounding G4/G6,Constitution Check)**:025 三個 base-web 改動逐一判定 vs §III.2 MODAL-WIRING ★(a)(b)(c):
- **parentId NTreeSelect(menu-operate-modal edit)= 超出邊界**:net-new form 控件(現 parentId 純 data 欄〔@100/191〕、`showLayout=parentId===0` 唯一消費、**無控件可 un-disable**),非(a)`// request` 接線、非(b)gating、非(c)role-page auth-modal。
- **「顯示已刪除」toggle + restore 鈕(index.vue)= 超出邊界**:全新 inline UI(menu 頁無 toggle/search/recycle pattern)。
- **+2 wrapper fetch fn(rev2-system-manage.ts)= 不受管轄**:service/api wrapper 非 views/manage(017-023 自由加)。
→ **需 §III.2 (d) 子句 v1.5.0 amendment**(MINOR、§V.3 軌道授權邊界擴展、**非新軌道**、§11.9「5 軌道/2★」計數不變)。**§V.2:user 親決,Claude 不主動 amend** → plan 階段逐行列給 user、okok 才動。先例 022(§11.19/v1.3.0)/023(§11.21/v1.4.0);025 = §11.23/v1.5.0。
**Rationale**:re-parent/restore 的維運 UI literally 是 (a)(b)(c) 之外的第四類用途(同 023 觸發 (c) 的 gap-pattern)。

## R8 — endpoint 帳(restore+list only;re-parent 騎 updateMenu)

**Decision**:+2 endpoint(getDeletedMenus GET / restoreMenu POST)→ 4-site 連動:main.rs +2 route(enforce_mw)、migration `m20260529_000025` +2 Super-only casbin seed(ON CONFLICT、down by v1 IN 2)、`ENDPOINT_REGISTRY` +2、**3 處 count 28→30**。re-parent **無新 endpoint**(updateMenu 既有 policy 涵蓋)。prod image build **非強制**(無新 crate;migration 為既有 crate 內新 seed 檔)。

## 未決(交 data-model / contracts 拍板)
- restore facade route_name-collision DbErr 是否映友善碼(R4 ② 已 handler pre-check;facade 仍可遇 race→DB unique violation,plan 定是否 facade 加 RestoreError 或保 plain DbErr+handler 已 pre-check)。
- would_create_cycle 落點(facade pure-fn 旁 assemble_menu_tree vs handler)→ data-model §3 定(傾向 facade、lint-test 覆蓋一致)。
