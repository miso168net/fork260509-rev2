# Phase 1 Data Model — 030 cleanup-job

> 本 feature **不建新表、不加新欄**（僅一個索引 + 一個 JWT 內部 claim）。以下記三個受影響的資料/邏輯模型 + 一個純函式。

## 1. `sys_token`（既有表，僅加索引）

`entity/src/sys_token.rs:5-16` — **不改 schema、不加欄**：

| 欄 | 型 | 清理相關 |
|---|---|---|
| id | i64 (PK) | — |
| user_id | i64 | — |
| token_hash | String (UNIQUE, len 64) | 撞鍵主角（jti 修的對象）|
| rotation_chain | String (uuid) | — |
| status | String (active/used/revoked) | **清理不依賴**（純過期規則跨所有 status）|
| issued_at | DateTimeWithTimeZone | — |
| **expires_at** | **DateTimeWithTimeZone** | **清理唯一述詞欄** |
| used_at | Option\<DateTimeWithTimeZone\> | — |
| created_at | DateTimeWithTimeZone | — |

**新增索引（m20260529_000030）**：

- `idx_sys_token_expires_at` — btree on `(expires_at)`。
- 目的：支援 `WHERE expires_at < cutoff` 的清理查詢，避免全表掃（現有 2 索引 `idx_sys_token_user_active` / `idx_sys_token_chain` 皆不涵蓋 `expires_at`，`m...026:82-100`）。
- 可逆：`down` = `DROP INDEX idx_sys_token_expires_at`。
- **非 partial**（述詞跨所有 status，無可 partial 的條件）。
- **無 §I.6 審計欄義務**（加索引非建表）。

**狀態轉移**：本 feature **不改**任何 active/used/revoked 轉移邏輯；清理與狀態機正交 —— 只移除「`expires_at` 已過 margin」的列（其 JWT 已必驗不過、不再被 `rotate()` 觸及）。

## 2. `Claims`（JWT 內部結構，加 1 欄）

`auth/jwt.rs:29-47` — 加 `jti`：

| 欄 | 現況 | 變更 |
|---|---|---|
| sub / user_id / roles / exp / iat / iss / aud / sid | 既有 8 欄 | 不動 |
| **jti** | **無** | **新增 `pub jti: String`** — per-token fresh uuid |

**讀/寫分職**：
- **寫**：唯一在 `sign()`（`jwt.rs:69-96`）內 `uuid::Uuid::new_v4().to_string()` 鑄入（每次 `sign()` 一個新 jti）。
- **讀/驗**：`verify()` 的 `decode::<Claims>`（`jwt.rs:112-119`）**要求 jti 存在**（缺則 `JwtError::Verify`）但**永不檢視其值**。base-web 把 token 當 opaque、不 decode。
- **與 sid 對比**：sid = per-session/per-chain（跨 refresh 鏈延續，`jwt.rs:42-46`）;jti = **per-token**（同鏈每次 rotate 都不同）。正是 per-token 特性讓「同秒兩 token」byte-distinct → `token_hash = sha256(JWT)`（`facade/sys_token.rs:56-66`）不撞 UNIQUE。

**相容性**：部署後「變更前已發出」的舊 token（無 jti claim）`decode` 失敗 → 一次性重登（同 028 sid rollout transition）。

## 3. cleanup 邏輯模型（cleanup-job binary）

```
輸入:  now: DateTimeWithTimeZone（run 時 = Utc::now().fixed_offset()）
       margin_secs: i64 = SKEW_MARGIN_SECS (60)
       mode: DryRun（預設）| Execute（--execute）

純函式: purge_cutoff(now, margin_secs) -> cutoff = now - Duration::seconds(margin_secs)

DryRun:  count = sys_token::Entity::find()
                 .filter(Column::ExpiresAt.lt(cutoff)).count(&db)
         → 印 "would delete {count} rows"、不改 DB
Execute: res = sys_token::Entity::delete_many()
                 .filter(Column::ExpiresAt.lt(cutoff)).exec(&db)
         → 印 "deleted {res.rows_affected} rows"
```

- **不變式**：`expires_at < cutoff` 的列 ⟺ 其 JWT 已必過期（margin 保證）⟺ `rotate()` 永不可能再查到 → 刪除安全。
- **冪等**：重跑只清新符合條件者，否則 0 改變（無狀態殘留）。
- **正交**：不讀/寫 status、不碰 rotation_chain、不發任何 Redis watcher channel（不污染 running server in-memory 狀態）。

## 4. 不涉及

- 無新 wire DTO（cleanup-job 無 HTTP 介面、jti 不上 wire）。
- 無 base-web typings 改動。
- 無 casbin policy / sys_menu 改動。
- 無其他表（跨表 soft-delete purge 明確排除、被 #6 RBAC 阻擋）。
