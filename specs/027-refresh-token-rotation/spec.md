# Feature Specification: refresh token rotation(持久化 rotation chain + 盜用偵測 + grace)

**Feature Branch**: `027-refresh-token-rotation`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "refresh token rotation — 把 013 最小無狀態 refresh 升級為 DB 持久化 rotation chain + 盜用偵測(reuse detection)+ grace 寬限窗口 + SHA-256 雜湊儲存。設計來源:[`docs/superpowers/027-refresh-token-rotation.md`](../../docs/superpowers/027-refresh-token-rotation.md)(Phase 0 brainstorm,3 軸親決:① 完整 rotation+盜用偵測 ② grace 寬限窗口 ③ SHA-256 雜湊儲存)。"

> **性質**:這是一個**後端安全強化** feature —— 補齊 auth 路徑唯一仍「無狀態、無洩漏偵測」的一塊(refresh)。**對最終使用者的正常體驗零影響**(登入/換新照常、wire 不變),價值在「看不見的安全網」:被竊的 refresh 憑證再用會被偵測並使該登入族系失效。**rust-api 單倉、base-web 零改**。下列 user story 兼採「使用者體驗」與「安全姿態」兩視角。

## Clarifications

### Session 2026-06-05

- Q: 偵測到盜用重放時的作廢範圍? → A: 只作廢**受影響的單一登入族系**(被重放憑證所屬的 rotation chain,token family revocation),不牽連該使用者其他族系/裝置的合法 session。
- Q: 是否在 027 納入「一帳號同時只能一個登入 + 每請求即時踢舊 session」(access 端 stateful)? → A: **不納入 027,拆為獨立後續 feature 028-single-session-enforcement**(027 落地後做、機制已評估為 current-session pointer)。027 **維持多裝置/多族系合法並存**(FR-003 只作廢單一族系)、**access 端維持 stateless 短 TTL**(FR-008/FR-012 不碰 access 簽發/驗證)。理由:即時踢是 access 端的不同軸(觸及 enforce_mw + 三個非-enforce 認證端點的 verify_bearer 線 + Claims schema 變更),scope ≈ 翻倍且會打破 027「wire 中性、getUserInfo 行為逐字不變、206 單測逐字」的乾淨基線;且 sys_tokens 為 refresh-keyed rotation(非 access session store)、partial index 刻意非-unique(容忍多裝置),與「單一 session」語義對立。此邊界刻意保留,避免單一-session 混入 027。
- Q: refresh 憑證的存活模型?(sliding vs 絕對上限) → A: **sliding**(每次換新的新憑證取得全新完整存活期,對齊現行重簽行為);v1 **不引入族系絕對上限**(YAGNI,日後要再加)。
- Q: 偵測到盜用重放時是否留存安全審計紀錄? → A: 本 feature 以**運行日誌(warn 級)**記錄盜用偵測事件(可觀察);**持久化安全審計紀錄 / 指標**留待觀察性堆疊(Phase 6),不在本 feature 新增持久化審計路徑(對齊 brainstorm「metrics/observability → Phase 6」OUT)。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 換新即輪替,任何時刻只有最新一張 refresh 憑證有效 (Priority: P1)

身為 admin panel 使用者,我長時間操作時短命的 access 憑證會過期,前端自動拿 refresh 憑證換一對新的;我希望這個換新流程**把剛用掉的舊 refresh 憑證作廢、發一張新的**,並由後端持久化追蹤目前哪一張有效。這樣每次換新都「往前走一步」,舊憑證不再能無限次重複換新。

**Why this priority**: 這是本 feature 的地基 —— 沒有持久化的輪替紀錄,就無從偵測盜用。單獨交付即把 refresh 從「無狀態、可無限重簽」升級為「有狀態、單張有效」,是 MVP,也是 US2/US3 的前提。

**Independent Test**: 登入後查後端紀錄存在一張「有效」憑證;以該 refresh 憑證換新一次,查舊憑證被標為「已用」、同族系出現一張新的「有效」憑證,且回應的新 token 對可正常使用。

**Acceptance Scenarios**:

1. **Given** 使用者成功登入, **When** 後端簽發 token 對, **Then** 後端持久化一筆「有效」refresh 紀錄(屬一條新建立的登入族系),且 wire 回應的 `{token, refreshToken}` 結構與升級前**逐字不變**。
2. **Given** 一張有效的 refresh 憑證, **When** 用它換新, **Then** 回一對全新 token、舊憑證被標為「已用」、同族系新增一張「有效」憑證。
3. **Given** 同一張 refresh 憑證已被換新過(且超過寬限窗口), **When** 再次用它換新, **Then** 不再成功(進入 US2 的盜用偵測路徑)。

---

### User Story 2 - 被竊的 refresh 憑證重放會被偵測、整族系失效 (Priority: P1)

身為系統的安全守護者,我希望若有人竊得某張 refresh 憑證並重放(拿一張**已被換掉的舊憑證**、或一張**已失效族系的憑證**再來換新),系統能偵測到這是盜用訊號,**把整條登入族系作廢**;真實使用者下次換新時被乾淨登出、必須重新登入。如此一來,憑證外洩的影響被遏制在「一次重新登入」,而非「攻擊者長期無聲佔用」。

**Why this priority**: 這是本 feature 的**核心安全價值**,也是當初從多個候選中選它的理由。與 US1 同列 P1:輪替(US1)若無盜用偵測(US2),安全提升有限。

**Independent Test**: 換新一次取得新憑證後,拿**舊的(已用、且超寬限窗口)**憑證再換新 → 失敗並回「登出」碼;查該族系所有憑證已全部標為「已作廢」;再以新憑證換新 → 亦失敗(整族系已死)→ 等同強制真實使用者重新登入。

**Acceptance Scenarios**:

1. **Given** 一張已被換掉、且距上次使用超過寬限窗口的舊 refresh 憑證, **When** 用它換新, **Then** 換新失敗、回**登出碼**,且該族系所有憑證被標為「已作廢」。
2. **Given** 一張屬已作廢族系的 refresh 憑證, **When** 用它換新, **Then** 換新失敗、回登出碼(族系已死,無需重複作廢)。
3. **Given** 盜用偵測已使某族系作廢, **When** 真實使用者用其(現已作廢的)憑證換新, **Then** 亦被乾淨登出,需重新登入(影響遏制在一次重認證)。

---

### User Story 3 - 良性並發換新不會把真實使用者誤登出 (Priority: P2)

身為同時開多分頁的使用者,我可能在 access 憑證過期的瞬間從兩個分頁幾乎同時觸發換新(兩者拿同一張 refresh 憑證)。我**不希望**這種良性並發被誤判成盜用而把我整個登出。系統應以「這張憑證是不是剛剛才被換掉」來區分良性並發與惡意重放。

**Why this priority**: 直接決定 US2 的安全機制可不可用 —— 沒有寬限窗口,盜用偵測會在正常多分頁使用下偶發誤登出,變成不可接受的體驗回歸。P2(US2 的必要配套,但本身不引入新能力)。

**Independent Test**: 用同一張有效 refresh 憑證,在寬限窗口內連續(模擬並發)換新兩次 → 兩次皆不觸發族系作廢、使用者不被登出,該族系仍有「有效」憑證可繼續換新。

**Acceptance Scenarios**:

1. **Given** 一張剛被換掉、仍在寬限窗口內的 refresh 憑證, **When** 它(被良性並發地)再次用於換新, **Then** 不作廢族系、不登出使用者;以「比照一次正常換新」處理(發新憑證進同族系)。
2. **Given** 同一張有效憑證的兩個幾乎同時的換新請求, **When** 兩者皆送達, **Then** 至多一個被當作正常輪替的「贏家」、另一個被當良性並發,**最終使用者保持登入**(0 次誤登出)。

---

### User Story 4 - 重整頁面仍能用未過期憑證還原 session (Priority: P3)

身為使用者,我重新整理頁面時,前端會用尚未過期的 access 憑證向 getUserInfo 還原我的登入狀態。我希望這個既有行為**不受本次升級影響**仍正常運作。

**Why this priority**: 既有不變式的正式驗收(§5.3 stale token),非新能力;本 feature 不改 getUserInfo,只確保升級未誤傷此路徑。優先序最低。

**Independent Test**: 持一張較早簽發但**尚未過期**的 access 憑證呼叫 getUserInfo → 仍回 200 與正確使用者資訊。

**Acceptance Scenarios**:

1. **Given** 一張尚未過期的 access 憑證(無論簽發多久前), **When** 呼叫 getUserInfo, **Then** 回 200 與正確的使用者資訊(行為與升級前相同)。

### Edge Cases

- **寬限窗口內 vs 超窗的舊憑證**:同一張「已用」憑證,在寬限窗口內再現 = 良性並發(不作廢、發新憑證進同族系);超出寬限窗口再現 = 盜用(整族系作廢、登出)。窗口長度為可調參數,有合理預設(見 Assumptions)。
- **良性並發造成短暫多張「有效」憑證**:良性並發的「輸家」會在同族系另發一張有效憑證,故族系可短暫有 ≥2 張有效憑證。此為刻意容忍 —— 前端只保存最新一張(後寫覆蓋),另一張成為孤兒、靠到期自然失效(未來由清理 job 實體移除)。盜用偵測不因此被弱化(每張憑證各自有狀態)。
- **無對應紀錄的憑證(部署過渡)**:本 feature 落地前簽發、仍有效的 refresh 憑證在後端無對應紀錄 → 既有已登入 session 首次換新會命中「查無」→ 回登出碼 → 被迫**重新登入一次**(一次性、資料無損、可接受;不另做相容墊片)。已實體清理掉的舊憑證再現亦同此路徑。
- **換新過程中的伺服器故障(如資料庫不可用)**:屬真正的伺服器內部錯誤 → 回**內部錯誤碼(非登出碼、非重新驗證碼)**,不把基礎設施故障偽裝成登出;客戶端不被強制登出。
- **refresh 憑證本身過期/簽名錯誤/受眾錯**:回登出碼(維持既有 refresh 失敗紀律)。
- **資料庫外洩**:儲存的是 refresh 憑證的不可逆雜湊而非原文 → 單純讀取資料庫無法直接取得可用的 refresh 憑證。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 登入成功時,系統 MUST 建立一條新的登入族系,並持久化一筆「有效」狀態的 refresh 憑證紀錄(隸屬該族系)。
- **FR-002**: 以一張「有效」refresh 憑證換新時,系統 MUST 在同一個原子交易內:把該憑證標為「已用」、於同族系新增一張「有效」憑證,並回一對全新 token。換新過程 MUST NOT 留下「無任何有效憑證」的半完成族系狀態(中途失敗須可由重新登入恢復、不得使族系資料毀損)。
- **FR-003**: 系統 MUST 偵測 refresh 憑證的盜用重放:當收到一張**已被換掉且超過寬限窗口**的憑證、或一張**屬已作廢族系**的憑證時,MUST 將**該被重放憑證所屬的單一登入族系**之所有憑證標為「已作廢」並回登出碼。作廢範圍 MUST 限於該單一族系,**不**連帶作廢該使用者的其他族系(其他裝置/分頁登入不受影響)。
- **FR-004**: 系統 MUST 提供一個寬限窗口以容忍良性並發:當收到一張**剛被換掉、仍在寬限窗口內**的憑證時,MUST 比照一次正常換新處理(發新憑證進同族系)、MUST NOT 作廢族系、MUST NOT 登出使用者。
- **FR-005**: 所有 refresh 換新的**驗證類失敗**(查無紀錄 / 盜用 / 族系已作廢 / 憑證過期 / 簽名或受眾錯)MUST 回登出碼(`8888`),**絕不可**回 `3333` / `9999` / `9998`(沿既有 refresh 失敗紀律,避免登出 dead loop)。
- **FR-006**: refresh 換新過程中的**真正伺服器故障**(如資料庫錯誤)MUST 回內部錯誤碼(`5000`),不得偽裝成登出碼或重新驗證碼。
- **FR-007**: 系統 MUST 以不可逆雜湊(SHA-256)儲存 refresh 憑證,不得儲存原文;憑證比對改以雜湊進行。
- **FR-008**: 本 feature MUST 維持 wire 中性:登入/換新成功回應的 `{token, refreshToken}` 結構**逐字不變**;不新增任何對外端點。
- **FR-009**: 既有「以尚未過期的 access 憑證經 getUserInfo 還原 session」之行為 MUST 維持不變(本 feature 不改 getUserInfo,正式驗收 §5.3 不變式)。
- **FR-010**: 系統 MUST NOT 新增登出端點;登出維持僅由前端清除狀態(沿 §4.12.4)。被前端放棄的族系**不主動作廢**,靠憑證到期自然失效;**主動作廢只由盜用偵測(FR-003)觸發**。
- **FR-011**: refresh 憑證紀錄的**實體清理 / 過期淘汰**屬本 feature 範圍外(交由後續 cleanup-job feature);本 feature 僅建立與標記狀態,憑證有效性由「到期時間」於驗證時把關。
- **FR-012**: 本 feature MUST NOT 變更 base-web、MUST NOT 變更權限政策(casbin)、MUST NOT 引入分岔的第三方套件(不 fork)、MUST NOT 新增 workspace crate。
- **FR-013**: 新增的 refresh 憑證紀錄表屬**機器管理的 session 生命週期表**(無人工操作者新增/編輯列),比照既有 append-only / 基礎設施表免除標準審計欄要求;以自身的「簽發時間 / 到期時間 / 使用時間 / 建立時間」生命週期欄記錄。
- **FR-014**: 盜用偵測的核心判定(憑證狀態 × 寬限窗口 → 結果)MUST 有單元測試覆蓋全部分支(正常輪替 / 良性並發 / 盜用作廢 / 已作廢 / 查無)。

### Key Entities *(include if feature involves data)*

- **Refresh 憑證紀錄(refresh token record)**:代表一張被簽發的 refresh 憑證及其生命週期狀態。關鍵屬性:所屬使用者、憑證的不可逆雜湊(唯一)、所屬登入族系標識、狀態(有效 / 已用 / 已作廢)、簽發時間、到期時間、使用時間(由「有效→已用」時記錄,供寬限窗口判定)、建立時間。
- **登入族系(rotation chain)**:一次登入起始、經多次換新串起的一系列 refresh 憑證紀錄,共用同一族系標識。盜用偵測以「整族系」為作廢單位。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 一張 refresh 憑證被換新後,**無法**再被重複用於換新(超寬限窗口的重放 100% 進入盜用路徑、回登出碼)。
- **SC-002**: 重放一張已被換掉的舊憑證,**100%** 使該登入族系全部憑證作廢;真實使用者下次換新被乾淨登出(影響遏制在一次重新登入)。
- **SC-003**: 寬限窗口內的良性並發換新(同一憑證重複使用)造成 **0 次**誤登出 —— 並發測試中使用者保持登入、族系仍有有效憑證。
- **SC-004**: 所有 refresh 換新失敗路徑回應中,`3333` / `9999` / `9998` 出現次數為 **0**;驗證類失敗一律 `8888`、伺服器故障 `5000`。
- **SC-005**: 資料庫中的 refresh 憑證紀錄**不含**任何可直接使用的原文憑證(僅雜湊);DB dump 無法直接重放。
- **SC-006**: 登入/換新成功回應的 `{token, refreshToken}` 鍵與結構與升級前**0 差異**;既有 login round-trip 與 refresh 驗收行為保持。
- **SC-007**: 守恆不破 —— 既有 server 單元測試(206)前後全綠(加上新測)、entity-access lint(17)、endpoint coverage(30,本 feature 不新增端點)維持;新增資料表的遷移可逆(up→down→up)。
- **SC-008**: 持未過期 access 憑證呼叫 getUserInfo 100% 回 200 與正確使用者資訊(§5.3 stale token 不變式成立)。

## Assumptions

- **寬限窗口長度有合理預設**:用於區分良性並發與惡意重放的寬限窗口採短窗(預設約 30 秒、可調為常數/設定),足以涵蓋前端多分頁/重試的良性並發時序,又遠短於攻擊者延後重放的時間尺度。確切數值於 plan 階段釘定。
- **既有 refresh 端點與失敗紀律為基礎**:沿用既有 `/auth/refreshToken` 端點與「失敗一律 `8888`、絕不 `3333/9999/9998`」紀律(013 已成立),本 feature 在其上加狀態。
- **前端不需改動**:base-web 既有的 refresh 呼叫、登出碼判讀、單一換新去重機制皆已就緒,wire 契約不變故零改。
- **正常使用體驗不變**:正常登入與自動換新對使用者**無可觀察差異**;唯一新增的可觀察行為是「被竊憑證重放後的一次強制重新登入」與「部署過渡時既有 session 的一次性重新登入」。
- **實體清理為獨立後續**:過期/已作廢憑證的實體移除交由後續 cleanup-job feature;本 feature 期間憑證紀錄持續累積、靠到期時間於驗證時排除。
- **session 存活 = sliding**:每次換新的新 refresh 憑證取得全新完整存活期(對齊現行重簽);v1 無族系絕對上限。
- **單一 session 強制為獨立後續(028)**:「一帳號同時只能一個登入 + 每請求即時踢」屬 access 端 stateful 撤銷、不同軸,拆為獨立 feature 028-single-session-enforcement(027 落地後做);本 feature 刻意維持多裝置/多族系並存 + access stateless(見 Clarifications)。
- **單一服務實例**:現行部署為單實例;多實例下的憑證紀錄一致性與本 feature 正交、不在範圍。
- **rust-api 單倉**:全部變動在 rust-api worktree;不新增對外端點、不動 base-web、不動權限政策、不 fork、不新增 workspace crate。
