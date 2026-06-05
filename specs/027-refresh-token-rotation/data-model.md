# Phase 1 Data Model: refresh token rotation

**Feature**: 027-refresh-token-rotation | **Date**: 2026-06-05

## 1. 表 `sys_token`(migration `m20260529_000026_create_sys_token`)

機器管理的 refresh 憑證生命週期表(非業務主表、無 §I.6 六審計欄 — research D7)。

> **命名**:表名 `sys_token`(**單數**)、entity/facade 檔名 `sys_token.rs`、index `idx_sys_token_*` —— 對齊 codebase 既有 7 entity 全 `filename == table_name` 1:1 慣例(皆單數名詞)。DESIGN §6.2 草圖用複數 `sys_tokens`,**as-built 改單數對齊慣例**(收尾回填 DESIGN §6.2)。

| 欄 | PG 型 | 約束 | 說明 |
|---|---|---|---|
| `id` | BIGSERIAL | PK, auto_increment | |
| `user_id` | BIGINT | NOT NULL, FK→`sys_user(id)` | 所屬使用者 |
| `token_hash` | VARCHAR(64) | NOT NULL, **UNIQUE** | refresh JWT 的 SHA-256 hex(D1);防雙重 insert |
| `rotation_chain` | VARCHAR(36) | NOT NULL | 登入族系標識(uuid v4 字串,D2) |
| `status` | VARCHAR(20) | NOT NULL | `active` / `used` / `revoked` |
| `issued_at` | TIMESTAMPTZ | NOT NULL | 簽發時間 |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 到期(驗證時排除過期) |
| `used_at` | TIMESTAMPTZ | NULL | `active→used` 時設;grace 判定用 |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | DB 端 |

**索引**(沿 migration 012 + 018 raw-SQL partial 寫法):
- `idx_sys_token_user_active`:`(user_id) WHERE status = 'active'` — **partial、非 unique**(容忍 benign 並發短暫 multi-active,spec §4.3);raw SQL `execute_unprepared`。
- `idx_sys_token_chain`:`(rotation_chain)` — 整族系 revoke 用;sea-orm `Index::create` 或 raw SQL。
- `token_hash` UNIQUE 由 col 約束提供。

**up/down 可逆**(沿 012 範本):down 反序 drop index + drop table。

## 2. Entity `entity/src/sys_token.rs`(`DeriveEntityModel`,鏡像 sys_login_attempt)

```rust
#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "sys_token")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,
    pub user_id: i64,
    pub token_hash: String,
    pub rotation_chain: String,
    pub status: String,
    pub issued_at: DateTimeWithTimeZone,
    pub expires_at: DateTimeWithTimeZone,
    pub used_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
}
// Relation{} 空、ActiveModelBehavior 預設(同 sys_login_attempt)
```
`entity/src/lib.rs` 加 `pub mod sys_token;`。無新 entity dep(uuid 生成在 server、entity 只存 String)。

## 3. 狀態機(rotate)

**status 三態**:`active`(當前有效)→ `used`(已被換新)→ `revoked`(盜用偵測作廢)。

**兩個不同型別**(勿合併):
- **純判定 seam**:`decide_rotation(status, used_at, now, grace) -> RotationDecision { Rotate, Benign, Reuse }`(**無 NotFound** —— 純邏輯、不碰 DB)。
- **facade rotate 回傳**:`RotationOutcome { Rotated, BenignConcurrent, Reuse, NotFound }`(NotFound 由 facade 在 row=None 直接構造、**不進** `decide_rotation`,D4)。

```
decide_rotation(status, used_at, now, grace) -> RotationDecision:
  active                                -> Rotate          (active→used + insert 新 active)
  used  && used_at=Some && now-used_at <  grace  -> Benign  (insert 新 active、不 revoke)
  used  && used_at=Some && now-used_at >= grace  -> Reuse   (整族系 revoke)
  used  && used_at=None                 -> Reuse           (★ fail-closed:無法證明在 grace 內 → 當盜用)
  revoked                               -> Reuse           (already dead、no-op revoke)
```
`(used, used_at=None)` 正常流程不出現(active→used 必成對設 used_at),但 entity 欄 nullable → 純函式對此 **fail-closed → Reuse**(防 cleanup-job / 手動 SQL 留下半態 row 致 panic/誤判);U1 須含此 case(FR-014)。

## 4. Facade `server/src/model/facade/sys_token.rs`(唯一寫入管道、守 009 entity-access lint)

> 常數:`const GRACE_SECS: i64 = 30;`(D6)。`const ACTIVE/USED/REVOKED: &str`。雜湊:`fn sha256_hex(jwt: &str) -> String`(sha2)。

- **`create_chain_head(db, user_id: i64, refresh_jwt: &str, rotation_chain: &str, issued_at, expires_at) -> Result<(), DbErr>`**
  login 用:insert active row `{token_hash: sha256_hex(refresh_jwt), user_id, rotation_chain, status:ACTIVE, issued_at, expires_at, used_at:None}`。純映射 seam `chain_head_active_model(...)` 供 SQL-build 測。

- **`rotate(db, presented_jwt: &str, new_refresh_jwt: &str, issued_at, expires_at) -> Result<RotationOutcome, DbErr>`**
  ```
  let h = sha256_hex(presented_jwt);
  let txn = db.begin().await?;
  let row = sys_token::Entity::find()
              .filter(token_hash = h)
              .lock_exclusive()           // SELECT ... FOR UPDATE(序列化並發,D3)
              .one(&txn).await?;
  match row {
    None => { txn.commit(); NotFound }
    Some(r) => match decide_rotation(&r.status, r.used_at, now, GRACE_SECS) {
      Rotate => { UPDATE r.status=used, used_at=now (條件 WHERE status=active);
                  insert 新 active(同 r.rotation_chain、new hash); txn.commit; Rotated }
      Benign => { insert 新 active(同 chain、new hash、不動 r); txn.commit; BenignConcurrent }
      Reuse  => { UPDATE status=revoked WHERE rotation_chain=r.rotation_chain;
                  txn.commit; Reuse }
    }
  }
  ```
  `Reuse` 路徑 facade 內 `tracing::warn!(user_id, rotation_chain, "refresh token reuse detected — chain revoked")`(clarify ④)。

**鎖粒度 + Reuse 競態(明文風險自覺)**:`lock_exclusive` 只鎖 SELECT 命中的**單一 row**(token_hash=h),**不鎖整鏈**。同 token 並發由此序列化(第二筆阻塞至第一筆 commit 後重讀 → 讀到 `used`+grace → Benign,杜絕誤 revoke,核心正確)。但**極端交錯**下 SC-002「整鏈全作廢」非絕對保證:合法 Rotate(insert 新 active `h_new`)與另一持同鏈 stale token 的 Reuse(整鏈 UPDATE)鎖不同 row、互不阻塞 → 若 Reuse 的 chain UPDATE snapshot 不含尚未 insert 的 `h_new`,commit 後 `h_new` 殘留 active。**接受度**:單實例 + admin 低並發 + 需攻擊者與真實 user 同毫秒並發,殘餘風險小;且殘留 active 會在該 user **下次任一 rotate** 再觸發 Reuse 時被掃掉(收斂)。**故 SC-002 偽碼語意不應讀作「整鏈 revoke 必定涵蓋全部 row」**。日後若要嚴格化:Reuse 先 `SELECT ... WHERE rotation_chain=C FOR UPDATE`(鎖全鏈)或對 chain 取 advisory lock 序列化同鏈寫入。

**expires_at 不進 rotate**:refresh 過期由 handler step 1 `jwt::verify(refresh_secret, leeway=0)` 的 `exp` 強制(過期 token 進 rotate 前即回 8888);`sys_token.expires_at` 在 027 純為 lifecycle metadata(供未來 cleanup-job 查詢淘汰),`decide_rotation`/rotate **不讀** expires_at(避免與 grace 狀態機重複把關)。

**token_hash 撞鍵(極低機率)**:現行 `Claims` 無 `jti`、`iat` 秒精度 → 同秒同 user 同 roles 的兩 refresh JWT 理論可逐字相同 → SHA-256 撞 `token_hash` UNIQUE → benign 並發其一 insert 回 DbErr → handler 映 `Internal(5000)`(SC-003「0 誤登出」不破、僅偶發 5000)。admin 低並發下可接受;**理想**:rotate 對 insert 的 unique-violation DbErr 特判為 `BenignConcurrent`(視為另一並發已 insert 等價 token)。

## 5. Handler 串接(`handler/auth.rs`)

- **`login`**(outer,**`login_attempt_inner` 回成功 + login-attempt 審計寫入之後**才建 chain head):
  `let chain = Uuid::new_v4().to_string();`
  `let (issued, expires) = ttl_window(&state.jwt.refresh_token_ttl_secs);`
  `create_chain_head(db, user_id, &token.refresh_token, &chain, issued, expires).await.map_err(|_| Internal)?;`
  **★ 置於 `login_attempt_inner` 之外**:`login_attempt_inner` 任何 `Err` 都被 `login` 記為 `success=false`/`operator_id=None`(auth.rs:90-93)。create_chain_head 是 token 簽發**之後**的持久化,憑證已驗成功 → 必須在 015 login-attempt 記 `success=true` **之後**才做,否則「憑證正確但 chain-head DB 故障」會被誤記為 `success=false`,汙染 015 lockout 查詢語意(015 success flag = 純憑證成敗)。chain-head DB 失敗 → wire 覆寫 `Internal(5000)`(登入整體確失敗、但審計已正確記憑證成功)。
- **`refresh_token`**(`jwt::verify@257` 成功後):
  `let new = issue_tokens(claims.user_id, claims.roles, &state.jwt).map_err(|_| Internal)?;`(預簽,unchanged)
  `let (issued, expires) = ttl_window(...);`
  `match rotate(db, &req.refresh_token, &new.refresh_token, issued, expires).await {`
  `  Ok(Rotated|BenignConcurrent) => Res::ok(new),`
  `  Ok(Reuse|NotFound) => Res::err(Logout8888),`
  `  Err(_) => Res::err(Internal) }`

## 6. 不變式

- 健康族系恆有 ≥1 個 `active`(benign 並發可短暫 >1、自癒,spec §4.3)。
- `token_hash` 全域唯一(UNIQUE)→ 同一 JWT 不重複入表。
- access token / Claims / `issue_tokens` / `LoginToken` 形狀**逐字不變**(wire 中性,FR-008)。
- 單一-session(每使用者單 active 族系)**不在本表語義內** —— partial index 刻意非 unique;單一-session = 028(spec Clarifications)。
