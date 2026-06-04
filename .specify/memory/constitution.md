# rev2-admin (fork260509-rev2) Constitution

> 整合 rev2 設計凍結權威。內容自 [`docs/INTEGRATION-DESIGN.md`](../../docs/INTEGRATION-DESIGN.md) §11 拍板項 + §7 軌道清單提取,2026-05-28 凍結 v1.0.0。
> **本檔為凍結權威**:與 DESIGN.md 衝突時以本檔為準;改動需經 Amendment 流程(見 §V Governance)。
> spec-kit `/speckit-plan` 步必須對照本檔做 Constitution Check(見 §IV)。

---

## I. Core Principles

### I.1 base-web 為權威(NON-NEGOTIABLE)

**規則**:base-web example 有的功能、rust-api 都要提供對應 endpoint。設計範圍嚴格、不縮減。

**含義**:
- base-web 的 wire / type / endpoint / route shape,rust-api 必須對齊
- 「v1 從簡」只能是 phase 實作排程、不能簡化設計範圍
- 不動 base-web inline(例外見 §III 軌道授權)
- upstream rebase 友善 — 不留 upstream 衝突風險高的改動

**例外與升級路徑**:見 §III 軌道授權邊界(MODAL-WIRING ★ / BASE-WEB-BUILD-CONFIG ★)

### I.2 menu 權限 Casbin enforce(rev2 核心突破)

**規則**:menu 由 Casbin RBAC enforce、有權才顯示。rev1 未實現、rev2 必實現。

**含義**:
- 業務 menu 走 `/route/getUserRoutes` → 後端 Casbin enforce 過濾 → 前端顯示
- demo menu(`document` / `exception` / `multi-menu` / `iframe` 等 8 個 customRoutes)不在 Casbin enforce 範圍 → 由 BASE-WEB-BUILD-CONFIG ★ 軌道用 `pageExcludePatterns` 隱藏
  - **例外(v1.3.0 amend,022)**:`function` / `function_toggle-auth` demo 選單由 022 ButtonAuth 提升為**真實 Casbin-enforced 選單**(seed 入 sys_menu + menu policy),作為「角色×按鈕權限」端到端 demo 載體;其餘 demo menu 仍守隱藏原則。此例外使導覽逐字基線重訂(含該 demo 選單)。理由+影響見 DESIGN §11.20。
- constantRoutes(login / 404 / 403)前端寫死、與 menu 無關 → 不動

**核心 feature**:Phase 3 的認證登入(enforce 起手)+ 動態選單路由守衛(menu Casbin enforce 過濾)+ Casbin policy 失效通知(redis pub-sub);各 feature 排程與 rev2 編號見 [DESIGN §10 Phase 3](../../docs/INTEGRATION-DESIGN.md)。

### I.3 wire ground truth 對齊 mock(NON-NEGOTIABLE)

**規則**:`docs/MOCK-COVERAGE-AUDIT.md` 萃出的 wire shape 為權威。rust-api 序列化 / base-web typing 兩端衝突時以 mock 為準。

**鎖定不變式**:
- envelope `{data, code, msg}`(無 `success` bool);`code` = string `"0000"` not number
- `Role.id` / `MenuRoute.id` = **string**(對齊 mock;base-web TS 顯式宣告 number 與此不符但 runtime 安全、**決定不修** —— `Api.Common.CommonRecord` 為 `type` alias、TS declaration merging 無法 override member 型,`rev2-extra.d.ts` 補正不可行)
- 業務驗證 error code = **`2222`**(`BizError`;重複/不存在/自鎖/種子保護/非法 id·enum 等);**`5xxx` 段為授權/基建、非業務**(`5003` 權限不足〔403〕、`5000` 服務器內部〔500〕);refresh 類 critical code(`9999/9998/3333`)絕不用在業務驗證
- `MenuType` enum:1 = directory / 2 = menu(非舊推測「1 = group / 2 = page」)
- `Status` nullable:`CommonRecord.status: EnableStatus | null` rust-api 須支援
- 預設帳號:`Super / Admin / User`(login req)+ User → User01 alias(getUserInfo response)

### I.4 SDD + TDD 混合工作流(NON-NEGOTIABLE)

**規則**:每個 feature 走 CLAUDE.md §3 的 SDD + TDD 混合工作流。

**鎖定**:
- **階段 0 brainstorm**:`docs/superpowers/<NNN>-<feature-name>.md`(由 `superpowers:brainstorming` 產出 spec-design)
- **階段 1 SDD 設計鏈**:`/speckit-specify` → `/speckit-clarify` → `/speckit-plan`(對照本 constitution!)→ `/speckit-tasks` → `/speckit-analyze`
- **階段 2 TDD 實作**:**`superpowers:executing-plans`**(**不是 `/speckit-implement`**)
- **收尾**:`superpowers:finishing-a-development-branch` → 多段式 commit → `git merge --no-ff` 回 `rev2-admin-root`
- `git push` / `git merge` 不得出現於 `finishing-a-development-branch` 之前

**詳細操作**:CLAUDE.md §3 / §4(本檔不重複)

### I.5 rust-api 全新寫,不繼承 rev1 code(RUSTAPI-SOURCE-ISOLATION)

**規則**:rev2 rust-api 整棵樹全新寫;設計繼承 rev1(從 RESEARCH.md / FOLLOWUP.md 萃取教訓),但 **code 不拷貝**。

**例外**(§11.6 拍板):
- `sea-orm-adapter`:拷貝 rev1(0 人日,工具性 crate)
- `xdb`:拷貝 rev1(0.5 人日,工具性 crate)
- `axum-casbin`:**必須重寫**(~3-5 人日)— 統一 rev2 metrics / error / observability 策略

**process 紀律**:spec phase 0 research **不准 grep rev1 source**(避免「答案污染」;DESIGN §7.5)

### I.6 業務表審計欄標準(SCHEMA-AUDIT-COLUMNS)

**規則**:業務主表建表(create migration)時 MUST 含 6 審計欄 —
`created_at` / `created_by` / `updated_at` / `updated_by` / `deleted_at` / `deleted_by`。

**型與約束**:
- `*_at`:`timestamptz`。`created_at` NOT NULL default `now()`;`updated_at` / `deleted_at` nullable。
- `*_by`:operator 的 `user_id`(`bigint` nullable / `Option<i64>`,**非 `user_name` 字串**);
  system seed / migration 建立 / 未認證情境無 operator → `null`。
- **成對**:`deleted_at`(何時刪)必與 `deleted_by`(誰刪)同寫;`updated_at`+`updated_by` 同理,不可只寫其一。

**例外**:
- **append-only 審計表**(整列即一筆不可改不可刪的操作事件,如 `sys_operation_log`):
  只 `created_at` + operator 欄,MUST NOT 加 `updated_*` / `deleted_*`。
- **join / 關聯表**(多對多關係列,如 `sys_user_role`):依刪除策略;硬刪則免審計欄。

**retrofit 紀律**:本標準 **forward-only**(對新建表即時生效)。既有表的審計欄缺口由獨立的
「審計欄 retrofit」feature 補齊(需有寫入路徑帶入 operator 才填得了),不在本條即時要求 —
排程與範圍見 DESIGN §10。

---

## II. 設計拍板凍結

12 項拍板**摘要**(2026-05-27 親決,詳細理由 + 影響軌道見 [DESIGN §11](../../docs/INTEGRATION-DESIGN.md)):

| § | 主題 | 拍板凍結 |
|---|---|---|
| §11.1 | 預設帳號命名 | (b) `Super/Admin/User` 對齊 mock + 模仿 User → User01 alias |
| §11.2 | alova 7 endpoint | (a) 全實作 + 個別 disabled / stub flag |
| §11.3 ★ | modal CRUD 衝突 | (B) 升 L4 改 modal placeholder(MODAL-WIRING 啟用) |
| §11.4 | apifoxToken 移除 | (c) rust-api 忽略 unknown header(base-web 不動) |
| §11.5 ★ | alova menu 處理 | (b'-narrow) `pageExcludePatterns` 隱藏 demo;**v1.3.0 amend**:`function_toggle-auth` 例外提升為真實選單(§I.2 / DESIGN §11.20) |
| §11.6 | sub-crate | axum-casbin 重寫;sea-orm-adapter / xdb 拷貝 |
| §11.7 | auth route mode | (b) dynamic(後端控 menu) |
| §11.8 | obs stack | (a) 漸進 — Phase 5 obs-min / Phase 6 obs-full |
| §11.9 | 軌道清單 | 5 軌道全啟用(2 ★ 詳見 §III) |
| §11.10 | wire 細節 | Role.id / MenuRoute.id = string、User alias 模仿、business error `2222`(`5xxx`=授權/基建) |
| §11.11 | prod 路徑前綴 | (a) `/api/*` 主流 |
| §11.12 | brainstorm 位置 | (a) `docs/superpowers/<NNN>-<feature-name>.md` |
| §11.13 | login 替代入口 | (c) 全實作雙模 + v1 啟 stub mode |

★ = 違反「不動 inline / build 配置」直覺紀律的拍板項,影響 §III 對應 ★ 軌道。

---

## III. 軌道授權邊界

5 軌道完整定義見 [DESIGN §7](../../docs/INTEGRATION-DESIGN.md);本節**只列授權邊界與紀律**。

### III.1 預設可動軌道(無需額外授權)

| 軌道 | 範圍 | 紀律 |
|---|---|---|
| **BASE-WEB-ADAPT**(§7.1) | `.env` + `src/typings/api/rev2-extra.d.ts` 等新檔 | 新增為主、不改 inline;禁止刪除既有 type / field |
| **BASE-WEB-WRAPPER**(§7.2) | `src/service/api/rev2-*.ts` 新檔 | 一律新檔(`rev2-` 前綴);不改既有 `auth.ts` / `system-manage.ts` / `route.ts` |
| **RUSTAPI-SOURCE-ISOLATION**(§7.6) | rust-api 整棵樹 | 全新寫;設計繼承 rev1、code 不繼承(I.5) |

### III.2 ★ 需 constitution 顯式授權軌道(本檔已授權)

#### MODAL-WIRING ★(§7.4)— **本檔授權**(v1.3.0 amend:加 button 可見性 gating;v1.4.0 amend:加同模式新權限 modal+trigger;v1.5.0 amend:加選單復原/re-parent 維運控制)

**邊界**:`base-web/src/views/manage/**` 內的(a)`// request` placeholder 一行 —— 含 `modules/*-operate-{modal,drawer}.vue`(create/update)**與** `index.vue` 的 delete/batchDelete handler(如 `handleDelete`/`handleBatchDelete`);**以及(b,v1.3.0 amend)**業務頁操作按鈕的 `hasAuth(<button_code>)` 可見性 gating —— 含 `index.vue` 操作鈕 `v-if` 與其共用元件 `src/components/advanced/table-header-operation.vue` 的附加顯隱 prop;**以及(c,v1.4.0 amend)**於 `views/manage/role/modules/role-operate-drawer.vue` 的 `v-if="isEdit"` 授權編輯區,新增**同模式的角色權限 auth-modal 元件**(新 `*-auth-modal.vue` 鏡像既有 `menu-auth-modal`/`button-auth-modal`)+ 其觸發 NButton + 對應 `page.manage.role.*Auth` i18n key —— 嚴格限「角色 × 某權限維度」runtime 編輯介面(對齊 MenuAuthModal/ButtonAuthModal 範式)。**以及(d,v1.5.0 amend)**於 `base-web/src/views/manage/menu/**` 的選單管理頁,新增選單復原 / re-parent 的維運 UI 控制:(d-1) `modules/menu-operate-modal.vue` edit 模式的 parentId 父選單 selector(NTreeSelect/NSelect,**種子選單父固定不可改、僅自訂選單可搬**,R2);(d-2) `index.vue` 的「顯示已刪除」回收桶 toggle(R3,切換清單含/不含 soft-deleted)+ 已刪除列的 restore 觸發 NButton(R1,**孤兒父已刪則擋下**)+ 對應 `page.manage.menu.*` i18n key —— **嚴格限「選單樹的復原 / 父層級調整」runtime 維運介面,不擴張到任意新 UI**。

**授權內容**:(a)把 `// request; console.log(...)` 改為 `await fetchCreateXxx(formData)`;(b)為操作按鈕加 `v-if="hasAuth('<code>')"` 或等效 prop,依使用者被授予 button code 顯隱。

**紀律**:
- **嚴格限「`// request` 接線 + 按鈕可見性 gating + 同模式新權限 modal+trigger + 選單復原/re-parent 維運控制」四用途**,絕不擴張到其他 inline 邏輯
- 每改一處在 spec 內紀錄(file:line + 改動內容 + upstream 衝突風險評估)
- 共用元件改動 MUST 用附加 prop + 安全預設(不變既有呼叫端行為)
- 影響 §10 Phase 4 中所涉及 CRUD 功能(原 manage-crud-alignment 範圍 6-10 檔、每檔 1-3 行, 擴大至 CRUD 所需改動)+ 022 起 ButtonAuth 消費 feature + 023 起 EndpointAuth(新權限 modal)
- 理由見 DESIGN §11.19 / §11.21(v1.4.0)/ §11.23(v1.5.0)

#### BASE-WEB-BUILD-CONFIG ★(§7.3)— **本檔授權**

**邊界**:`base-web/build/plugins/router.ts` 加 `pageExcludePatterns`。

**授權內容**:`pageExcludePatterns: ['**/alova/**', ...]` 隱藏 demo menu(對齊 I.2 紀律)。

**紀律**:
- **嚴格限「隱藏 demo menu」用途**,不擴張到其他 build 改動
- 每改在 spec 內紀錄 build 配置原 vs 改
- 影響 feature:Phase 4-5

---

## IV. Compliance Check(spec-kit `/speckit-plan` 用)

`/speckit-plan` 步必須對照本 constitution 跑 Constitution Check,逐項 yes/no:

1. **此 plan 是否違反 §I.1 base-web 為權威紀律?** rust-api 是否未提供 base-web 用到的對應 endpoint?
2. **此 plan 是否動到 base-web inline?** 若是、屬哪條 ★ 軌道?授權邊界內?
3. **此 plan 涉及 menu 顯示是否走 Casbin enforce?**(§I.2)
4. **此 plan 的 wire 設計是否對齊 §I.3 mock ground truth?**(envelope / id 型 / error code / enum)
5. **此 plan 是否從 rev1 source 拷貝 code?** 若是、屬 §I.5 例外清單嗎?
6. **此 plan 是否凍結到 §II 12 拍板項?** 任一拍板需改變、必先走 Amendment 流程
7. **此 plan 是否觸及 §III ★ 軌道?** 若是、在授權邊界內?
8. **此 plan 是否新建業務表(create migration)?** 若是,是否含 §I.6 六審計欄?append-only / join 表是否依 §I.6 例外處理?

任一檢查不通過 → plan 須回 brainstorm 或申請 Amendment(§V.2)。

---

## V. Governance

### V.1 凍結權威性

本 constitution 為 rev2 整合的**凍結權威**;與 [`docs/INTEGRATION-DESIGN.md`](../../docs/INTEGRATION-DESIGN.md) / [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) 衝突時**以本檔為準**。

DESIGN 仍為「核心事實」(設計研究歷史 + 拍板理由 + 詳細軌道定義),但設計**結論**以本檔 §II 為凍結值。

### V.2 Amendment 流程

任何改動本檔內容需走以下流程:

1. **提案**:在 `docs/INTEGRATION-DESIGN.md` 的 §11 設計拍板項 開新項,註明改哪一節 / 為何改 / 改後影響
2. **討論**:user 親決(本檔內容皆為 user 拍板項,Claude 不主動 amend)
3. **凍結**:更新本檔對應段、bump version(規則見 §V.3)、回填 DESIGN §11
4. **commit**:獨立 commit `docs(constitution): amend <條目>...`

### V.3 Version 規則

- **MAJOR**(2.0.0):鐵紀律(§I)改變、§II 拍板項撤回、★ 軌道授權撤銷
- **MINOR**(1.1.0):新拍板項固化(§II 加項)、軌道授權邊界擴展、新增 ★ 軌道
- **PATCH**(1.0.1):文字校正、釐清、reference 更新、Compliance Check 增補

---

**Version**: 1.5.0 | **Ratified**: 2026-05-28 | **Last Amended**: 2026-06-04
