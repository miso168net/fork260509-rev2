# 029 — single-session admin UI（system-settings 框架 + per-account policy UI）(Phase 0 brainstorm / spec-design)

> 階段 0 brainstorm **已收斂**(2026-06-06,與 user 逐軸拍板)。承 028 收尾拆出([DESIGN §10 Phase 5 item 3](../INTEGRATION-DESIGN.md) + CHECKLIST §2.32)。把 028 的「policy 由後端/seed/DB 設、系統預設用 config 值(改要重部署)」升級為 **admin UI 可調**:系統預設 runtime 可改 + 每帳號 policy 由介面設定。
>
> **029 = admin 控制面 + 通用「系統設定」地基**(疊在 028 的 policy 儲存之上;後端先、UI 後,對齊 019→020→021 遞進)。**028 動的是引擎、零 base-web、零 amendment;029 動的是控制面 + base-web 頁,且需 constitution amendment。**
>
> **2026-06-06 拍板(全決)**:① 打**通用「系統設定」框架**(非單一-session 專用、single-session 是第一個設定);② settings = **KV 表 `system_settings`**(`setting_key`/`setting_value`/`value_type` + §I.6 六審計欄)、**per-setting UI**(非動態 metadata-driven settings engine);③ 系統預設熱路徑傳播 = **DB 真相 + in-memory cache + pub-sub watcher**(鏡像 casbin `policy_watcher`、DESIGN §6.3「v1 即啟、一致性優先、不靠環境分支」慣例);④ 新端點 **Super-only**;⑤ `getUserList` **加回傳 `session_policy`**(029 唯一動到既有 wire);⑥ 每帳號 policy 編輯 = 使用者管理頁**列上獨立 action**(「設定單一-session」,非混進 user-edit modal、非整欄替換 updateUser);⑦ **新設定頁超出現有 base-web ★ 軌道 → 需 constitution amendment**(user 親決 ok)。

## 1. 目標與性質

把 028 的「單一-session 由後端控制」升級為「admin 經 UI 控制」:**(a)** 系統預設(028 的 `single_session_default`,目前 config/env、改要重部署)變成 **runtime 可調**;**(b)** 每帳號 policy(`sys_user.session_policy` 三態,028 只能 DB/seed 設)變成**使用者管理頁可設**。順帶把「系統設定」做成可擴充地基(KV 表 + typed accessor),日後加全站設定不用大動。

**雙倉**:rust-api(新表 + facade + in-memory cache + settings-watcher + 3 端點 + casbin seed + sys_menu seed)+ base-web(設定頁 + 使用者頁 policy 欄/action + typings)。**需 constitution amendment**(新 base-web 頁)。**不改 028 enforcement 邏輯**——029 只在引擎上加控制面。

## 2. Grounding(實際 code,2026-06-06 親驗)

| 對象 | 實證 | 結論 |
|---|---|---|
| is_current 讀系統預設 | `auth/session.rs:190` `resolve_policy(&rec.session_policy, state.jwt.single_session_default)`(開機 config、不可變) | 改讀 **runtime in-memory cache**(`Arc<RwLock<SessionMode>>`);熱路徑成本不變(仍 in-memory) |
| 系統預設來源 | `config.rs` `JwtConfig.single_session_default`(env `APP_JWT_SESSION_DEFAULT`、028 預設 Off) | 持久真相移到 `system_settings` 表;config 值降為**開機 fallback** |
| runtime 傳播範式 | `auth/policy_watcher.rs`:`casbin:policy:invalidate` channel + `spawn_policy_watcher`(subscribe→reload in-memory Enforcer;§6.3「v1 即啟 pub-sub」) | **`spawn_settings_watcher` 鏡像之**:`settings:invalidate` channel、收到 reload in-memory 系統預設 |
| 每帳號 policy 欄 | `sys_user.session_policy`(028 已建、三態 `inherit/on/off`)+ data-model §7 預留 `update_session_policy(db,user_id,policy,operator)` facade(守 009 + 011 audit) | 029 補寫入 facade + 端點(欄不動) |
| Redis sess cache 含 policy | 028 `PointerRec{session_policy,sid}` 存 `sess:{uid}`(login/rehydration 時填) | ⚠️ admin 改 `sys_user.session_policy` 後,**sess cache 的 policy 是舊的** → `updateUserSessionPolicy` **必須 DEL `sess:{uid}`**(下個請求 lazy rehydration 取新 policy);否則改 on 不即時生效 |
| getUserList DTO | `handler/system_manage.rs` getUserList 回的 DTO 不含 `session_policy` | 加欄(wire 變更、base-web typings 同步) |
| menu 可見性 | 走 Casbin enforce(019 sys_menu + 021 role-menu auth seed) | 設定頁新選單項 = sys_menu 一列 + role-menu auth seed(Super 可見) |
| 端點 casbin | 013/016 pattern:每 gated endpoint 逐 role seed `p,R_SUPER,<path>,<method>`(無 wildcard、§11.22) | 3 新端點各 seed Super-only;endpoint_coverage_lint **30→33** 四方同步(main.rs↔registry↔lint↔migration) |
| 011 audit | `AuditOperation`(011、025 Restore 首消費) | settings update + per-account policy change 寫 operation-log(operator=admin) |
| base-web 頁 | `views/manage/{user,role,menu}` 存在;**無 settings 頁** | 029 新增 `views/manage/system-settings/`(新 view + route + menu)→ 超出現有 base-web ★ 軌道 |
| system-settings 表 | migration 目錄無 setting/config 表 | **029 首張**(rev2 第一張 §I.6 六審計欄**真正適用**的設定表:人類 admin 編輯) |

## 3. Scope

**IN**:`system_settings` KV 表 + migration + entity + facade(get_all/get/update,守 009 + 011 audit)+ typed accessor 層;**runtime 系統預設**(in-memory `Arc<RwLock<SessionMode>>` + 開機從表載入 + `spawn_settings_watcher`/`settings:invalidate` pub-sub;`is_current` 改讀 in-memory);**`sys_user::update_session_policy` facade**(+ `updateUserSessionPolicy` 後 **DEL `sess:{uid}`** 使即時生效);**3 新端點 Super-only**(`getSystemSettings`/`updateSystemSetting`/`updateUserSessionPolicy`)+ casbin seed;**`getUserList` 加 `session_policy`**;**sys_menu 設定頁選單 + role-menu auth seed**;**base-web 設定頁**(per-setting UI、目前一個 single-session section)+ **使用者頁 `session_policy` 欄 + 列上「設定單一-session」action**;typings 同步。

**OUT**:❌ 動態 metadata-driven settings engine(每設定各自 UI、不讀 metadata 長頁);❌ 其他系統設定(框架通用、029 只放 `single_session_default` 一個實際設定);❌ 多實例調校(pub-sub 給一致性、多實例本就 spec Assumptions OUT);❌ per-device「每裝置一個 session」(028 FR-013、仍 OUT);❌ 改 028 enforcement 邏輯(is_current/gate/refresh 行為不動,只換系統預設來源);❌ per-column `*_by`(每帳號 policy 變更走 011 audit、非列級操作者欄)。

## 4. 設計

### 4.1 `system_settings` KV 表(新表、migration `m20260529_000028`、接 027 之後)
```sql
CREATE TABLE system_settings (
  setting_key   VARCHAR(64)  PRIMARY KEY,    -- e.g. 'single_session_default'
  setting_value VARCHAR(255) NOT NULL,       -- 字串值,型別在應用層
  value_type    VARCHAR(32)  NOT NULL,       -- 'enum:on,off' / 'bool' / 'int' ...(typed accessor 用)
  description   VARCHAR(255) NULL,
  -- §I.6 六審計欄(本表人類 admin 編輯 → 真正適用、非 PASS-by-scope):
  created_at, created_by, updated_at, updated_by, deleted_at, deleted_by
);
-- seed:INSERT ('single_session_default','off','enum:on,off','全站單一-session 預設')
```
- entity + facade(唯一寫入管道、守 009)。`value_type` 給 typed accessor(`get_enum`/`get_bool`)+ update 端驗值。

### 4.2 系統預設熱路徑傳播(pub-sub,鏡像 policy_watcher)
- **AppState**:`single_session_default` 從 `JwtConfig` 不可變值 → 改為 `Arc<RwLock<SessionMode>>`(或 atomic);`is_current` 改讀它。
- **開機**:從 `system_settings` 載 `single_session_default` 填 in-memory(空/缺 → config fallback)。
- **`spawn_settings_watcher`**(鏡像 `spawn_policy_watcher`):subscribe `settings:invalidate` → reload in-memory(從表重讀);resilient(Redis 抖動退避重連、reload 失敗 log 不 panic)。
- **`updateSystemSetting` handler**:facade 寫 DB(+ 011 audit)→ `PUBLISH settings:invalidate`。

### 4.3 facade(守 009 + 011 audit)
- `model/facade/system_settings.rs`:`get_all() / get(key) -> Option<Model> / update(db,key,value,operator)`(update 走 `mutate_in_txn` + 011 audit、§I.6 `updated_at/by` 成對)。
- `model/facade/sys_user.rs` +`update_session_policy(db,user_id,policy,operator)`(data-model §7 預留;update_many col_expr + 011 audit;**只動 `session_policy` 欄、不碰 current_session_id**)。

### 4.4 端點 + casbin(3 新、Super-only;+ getUserList 加欄)
- `GET  /systemManage/getSystemSettings` — 列設定。
- `POST /systemManage/updateSystemSetting`(`{key,value}`)— set + invalidate。
- `POST /systemManage/updateUserSessionPolicy`(`{userId,policy}`)— set sys_user.session_policy(+ 011 audit)**+ DEL `sess:{userId}`**(使下個請求即時讀新 policy)。
- `getUserList` 回的 DTO 加 `session_policy`(wire 變更)。
- casbin:3 端點各 seed `p,R_SUPER,<path>,<method>`(無 R_ADMIN/R_USER);endpoint_coverage_lint **30→33** 四方同步。

### 4.5 base-web
- **設定頁**:`views/manage/system-settings/index.vue`(per-setting:一個「單一-session 系統預設 on/off」section、switch/select → `updateSystemSetting`)+ service api + route + **sys_menu 選單項**(Casbin role-menu auth seed → Super 可見)。
- **使用者管理頁**:`getUserList` 的 `session_policy` 加一欄顯示;列上「設定單一-session」**action**(開小 modal/popover 選 inherit/on/off → `updateUserSessionPolicy`);typings 同步(`session_policy` 入 user list DTO)。

## 5. 既有設計張力的解法(即時性 + 一致性)

- **系統預設切換即時**:admin off→on → settings-watcher reload in-memory → 下個請求 `is_current` 即讀新預設(零重啟)。**inherit 帳號的多裝置在下個請求收斂為單一**(028 「政策切換即時性」edge:最新登入 sid==pointer 不被踢、舊裝置 sid≠pointer 被踢)= **028 既有行為、非 029 新邏輯**(is_current 本就動態讀預設)。UI 提示「開啟會把多裝置帳號收斂為單一登入」。
- **每帳號 policy 切換即時(關鍵)**:Redis `sess:{uid}` cache 存舊 policy → `updateUserSessionPolicy` **必 DEL `sess:{uid}`** → 下個請求 lazy rehydration(028 既有 path)從 sys_user 取新 policy。⚠️ 漏掉 DEL = 改 on 不生效到 cache 過期。
- **pointer 不誤踢當前**:028 login **一律 set_pointer**(連 off)→ 切 on 時 current_session_id 已是最新登入 → 當前 session 不被誤踢。
- **fail-open 不變**:is_current I/O 失敗仍 fail-open(029 不改)。

## 6. 測試(CLAUDE.md §3/§4)

- **純單測**:typed accessor(`value_type` parse / get_enum / 非法值)。
- **live-DB `#[ignore]`**:settings get/update + 011 audit row;`update_session_policy` + **sess cache DEL 驗即時**;settings-watcher reload(PUBLISH→in-memory 變);開機 load。
- **curl**:Super getSystemSettings/updateSystemSetting `0000`、Admin/User `5003`;`updateSystemSetting('single_session_default','on')` 後**先前 off 帳號的舊 session 下個請求被踢 `7777`**(端到端證 runtime 生效);`updateUserSessionPolicy` 設某帳號 on → 該帳號被踢、別帳號不受影響;`getUserList` 回應含 `session_policy`。
- **CDP isolated-context**:設定頁 toggle 系統預設 + 使用者頁列 action 設每帳號 policy + 觀察收斂;Super 可見設定選單、非-Super 不可見。
- **守恆**:`dcargo test -p server` 綠 + entity_access_lint(新 facade 經 entity、新 handler 守)+ endpoint_coverage_lint **33** + migration up→down→up 可逆 + base-web typecheck 0。

## 7. Constitution / size

- **⚠️ 需 amendment(029 與 028 最大差異)**:新設定頁(新 view + 新 route + 新選單)**超出現有 base-web ★ 軌道**(§7.1 ADAPT=env/typings、§7.2 WRAPPER=request、MODAL-WIRING=manage 頁內 modal/按鈕,皆「改既有結構」、不含「開新 admin 頁」)→ 需一條 amendment(新軌道「BASE-WEB-NEW-PAGE」或擴 MODAL-WIRING 涵蓋「同模式新 admin 頁」)。提案走 DESIGN §11、`/speckit-plan` Constitution Check 正式判、**user 親決**(已 ok)。使用者頁 policy 欄/action 屬 MODAL-WIRING 邊界內。
- **§I.6**:`system_settings` 是業務設定表、人類 admin 編輯 → **六審計欄真正適用**(rev2 首張、非 028 PASS-by-scope)。
- **size**:新表 ×1、新 facade ×2(system_settings + sys_user.update_session_policy)、新端點 ×3 + getUserList 加欄、新 in-memory cache + watcher、casbin seed + sys_menu seed、base-web 1 新頁 + 使用者頁 1 欄/action。**無新 workspace crate、無新 dep**(redis/sea-orm 既有)。**雙倉**(rust-api + base-web worktree)。

## 8. 拍板紀錄(brainstorm,全決)

① 通用「系統設定」框架(非單一-session 專用);② KV 表 `system_settings` + per-setting UI(非動態 engine);③ 熱路徑 = in-memory cache + pub-sub `settings:invalidate` watcher(鏡像 policy_watcher);④ 端點 Super-only;⑤ getUserList 加 `session_policy`(唯一動既有 wire);⑥ 每帳號 policy 編輯 = 使用者頁列上獨立 action;⑦ 需 constitution amendment(新 base-web 頁,user 親決 ok)。

**衍生關鍵設計點**(brainstorm 補抓):updateUserSessionPolicy 後 **DEL `sess:{uid}`** 使每帳號 policy 變更即時生效(否則卡在 Redis cache)。

## 9. 交棒

brainstorm 收斂、本 doc 為輸入。**下一步 = user 手動跑 `/speckit-specify`**(input = 本 doc;`speckit.git.feature` pre-hook 建 `029-single-session-admin-ui` feature branch)→ `/speckit-clarify`(optional)→ `/speckit-plan`(**含 Constitution Check + amendment 提案**)→ `/speckit-tasks` → `superpowers:executing-plans` 實作。**不走 `writing-plans`**(CLAUDE.md §3 覆寫 brainstorm 預設 terminal)。
