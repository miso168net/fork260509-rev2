# 011-audit-log — Phase 0 brainstorm（spec-design）

> **Feature**：統一資料變動 audit 基礎設施（`sys_operation_log` 表 + 原子寫入 API + redact），並以 009 的 `sys_user` soft_delete 作活體 proof
> **Phase**：Phase 2 P1 後端基礎設施（[DESIGN §10 Phase 2 #4](../INTEGRATION-DESIGN.md)；[§1.4 三方資料變動紀律](../INTEGRATION-DESIGN.md) 第 2 支柱）
> **Date**：2026-05-29
> **狀態**：brainstorm 完成、待 階段 1 `/speckit-specify`（手動觸發）
> **權威**：本檔為 Phase 0 設計凍結。對齊 [DESIGN §6.4 sys_operation_log](../INTEGRATION-DESIGN.md) schema 與 [§1.4](../INTEGRATION-DESIGN.md) audit 紀律；沿用 009 的「立機制 + sys_user proof、defer rollout」做法與 facade/trait/lint 模板。

---

## 1. 緣起與現況

**緣起**：DESIGN §1.4 的資料變動鐵三角 = soft-delete（009 ✅）+ **audit log（本 feature）** + Casbin RBAC。soft-delete（009）與自動 migration（010）兩個前置已就緒，audit log 是 Phase 2 後端基礎設施剩下、且當下最無阻力的一項（另一項 sub-crate setup 卡 §11.6 拍板）。做完 audit，Phase 3 業務寫入路徑才有完整的 audit 落點。

**現況**（grep 確認，2026-05-29，rust-api worktree `rev2-admin-rust-api`）：
- **entity crate**：僅 `entity/src/sys_user.rs`（009 建，首個 sea-orm model）。
- **soft-delete 三重防護**（009）：`server/src/model/soft_delete.rs`（`SoftDeletable` trait）+ `server/src/model/facade/`（唯一管道、不 re-export Entity）+ `server/tests/entity_access_lint.rs`（兩階段 lexer build-failing lint：facade 外 `use entity::` → cargo test fail）。
- **唯一寫入路徑**：`facade::sys_user::soft_delete(db, id)` —— 目前以單一 `update_many().exec(db)` 設 `deleted_at`，**無 transaction、無 audit**。
- **無任何 audit / operation_log 檔**（grep 0 命中）。
- migration：001 create_sys_user / 002 seed / 003 softdelete_sys_user；經 010 於 stack `up` 時自動套用。

**關鍵洞察（影響 enforcement 設計）**：009 的 entity-access lint 已讓「facade 外連 `entity::` 都 import 不到 → 根本寫不了 DB」，故「繞過 facade 寫 DB」**早被擋住**。audit 真正要守的是「facade 內的寫入函式忘了配一筆 audit」，而這個用 grep 守遠比 009「entity:: 出現在 facade 外」那種乾淨規則脆弱（brace-scope 誤判）。

---

## 2. 設計決策（brainstorm 凍結，user 親決 2026-05-29）

- **D1 範圍 = 機制 + sys_user 活體 proof（沿用 009 做法）**：建 `sys_operation_log` 表（§6.4 schema、經 010 自動套）+ 統一寫入 API `audit_log::write_in_txn(AuditEvent)` + redact + 結構強綁的唯一寫入入口，並接到目前唯一寫入路徑 `sys_user soft_delete` 當活體示範。其他 entity / HTTP 中介層的全面接線 defer（各業務 endpoint 建立時 rollout）。否決：只建機制不接真實路徑（無法證明 transaction 原子性在真實寫入路徑成立）；連 HTTP audit middleware 一起做（無業務 endpoint、價值低，留 Phase 3/4）。
- **D2 原子性 = audit 與資料變動同一 transaction（both-or-neither）**：`soft_delete` 改成在一個 transaction 內「設 `deleted_at` + 插入 SOFT_DELETE audit 一起 commit」；任一失敗整筆 rollback。符 §6.4「write_in_txn」+ §4.4「audit 在 transaction 內寫」。否決 best-effort 事後寫（audit 會與實際變動不同步）。
- **D3 enforcement = 結構強綁 + lint 留 follow-up**：提供唯一順手寫入入口 `audit_log::mutate_in_txn(db, event, |txn| 改資料)`，把「改資料 + 寫 audit」綁同一 transaction；facade 寫入函式一律走它。文件寫死慣例。因目前只有一條寫入路徑、可靠 grep 規則不易立，把「facade 內寫入漏 audit」的 build-failing lint **誠實登記為 follow-up**，等 Phase 3+ 多條寫入路徑時連同 rollout 一起立。結構面已是強保證（009 已鎖死 facade 邊界 + `mutate_in_txn` 為唯一寫入入口）。

---

## 3. 架構 / 元件

| 元件 | 位置 | 職責 |
|---|---|---|
| **migration** | `migration/src/m20260529_000004_create_sys_operation_log.rs` | §6.4 schema 建表（靜態 DDL，經 010 自動套用）。audit 為**不可變 append-only 紀錄、非 soft-deletable** |
| **entity** | `entity/src/sys_operation_log.rs` | raw sea-orm model（+ `entity/src/lib.rs` 加 `mod sys_operation_log`） |
| **audit 模組** | `server/src/model/audit.rs` | `AuditEvent` 型 + `AuditOperation` enum（Insert/Update/SoftDelete/Restore → VARCHAR(20)）+ `write_in_txn(txn, event)`（在給定 txn 插一筆 audit）+ **`mutate_in_txn(...)`（唯一寫入入口：開 txn → 跑資料變動 closure → 寫 audit → commit；任一步失敗 rollback）** + `AuditSerialize` trait（產 redacted JSON、純函式） |
| **redact 實作** | sys_user 的 `AuditSerialize` | top-level 敏感欄 → `"<redacted>"`；sys_user redact `password`（純、test-first） |
| **facade 接線（proof）** | `facade::sys_user::soft_delete` 改寫 | 在 `mutate_in_txn` 內：SELECT 該 active row（取 `payload_before`、redact）→ set `deleted_at` → 寫 SOFT_DELETE audit → commit（原子） |

### AuditEvent 形狀（對齊 §6.4 schema）

`operation`（AuditOperation）/ `entity_table: String` / `entity_id: Option<i64>` / `payload_before: Option<JsonValue>` / `payload_after: Option<JsonValue>` / `operator: Option<{ id: i64, ip: Option<IpAddr> }>` / `trace_id: Option<String>`。

`sys_operation_log` 欄：`id BIGSERIAL PK` / `operation VARCHAR(20)` / `entity_table VARCHAR(64)` / `entity_id BIGINT?` / `payload_before JSONB?` / `payload_after JSONB?` / `operator_id BIGINT?` / `operator_ip INET?` / `trace_id VARCHAR(64)?` / `created_at TIMESTAMPTZ DEFAULT now()`。

---

## 4. 資料流（proof 路徑）

```
caller → facade::sys_user::soft_delete(db, id)
   → mutate_in_txn 開 txn
      → SELECT active row by id（capture payload_before、password redact）
      → UPDATE deleted_at = now()
      → write_in_txn(SOFT_DELETE audit: entity_table=sys_user, entity_id=id,
                     before=redacted row, after=null, operator=None, trace_id=當前 span)
   → COMMIT（任一步失敗 → ROLLBACK：無孤兒 audit、無未 audit 的刪除）
```

---

## 5. 預設子決策（brainstorm 一併凍結）

- **SOFT_DELETE 的 payload**：`payload_before` = 刪除前的 row（redact），`payload_after` = `null`（軟刪無「新值」）。
- **0-rows 行為**：只在 `rows_affected > 0`（真的刪到 active row）才寫 audit；id 不存在/已刪則不寫。順帶把 [CHECKLIST §2.12 soft_delete 0-rows 靜默](../INTEGRATION-CHECKLIST.md) 收斂一點（caller 可據此判斷）。
- **operator / trace 現皆 null**：尚無 auth / middleware（Phase 3 才有），proof 寫 system action（operator=None）。欄位設 `Option` 供日後填。

---

## 6. 錯誤處理

txn 內任一步失敗 → 整筆 rollback → `soft_delete` 回 `DbErr`。audit 與資料變動同生共死（D2）。

---

## 7. 測試（[CLAUDE.md §3](../../CLAUDE.md) 紀律）

- **單元 test-first（純函式）**：`AuditSerialize` redact —— password → `"<redacted>"`、其餘欄保留、JSON 形狀正確。
- **單元（純 SQL-build）**：`write_in_txn` 的 insert statement 欄位形狀（仿 009 `soft_delete_query` 的 `QueryTrait::build` 斷言）。
- **Acceptance（C-V、010 自動套表後 live stack）**：
  - 軟刪一個 seed user → 恰 1 筆 `sys_operation_log`（operation=SOFT_DELETE、entity_table=sys_user、entity_id 對、`payload_before.password="<redacted>"`、payload_after null）。
  - **原子性**：mid-txn 強制失敗 → 無 audit 列 **且** user 未被刪（一起 rollback）。

---

## 8. scope 邊界（本 feature 不做）

- HTTP 請求/回應 audit middleware（`audit_http.rs`）—— defer Phase 3/4（有真實流量再做）。
- INSERT / UPDATE / RESTORE 真實接線 —— 無業務 endpoint，只跑 SOFT_DELETE proof（enum variant 先定義齊）。
- build-failing「facade 內寫入漏 audit」lint —— **follow-up**（Phase 3+ 多寫入路徑時連 rollout 立）。
- 其他 6 entity 的 audit —— 各 entity 建立時 rollout。
- Casbin / operator 真值 —— Phase 3。

---

## 9. commit 模式

**動 rust-api worktree（`entity/` migration / `server/` audit 模組 / facade）→ 兩段式 commit**（同 007/008/009：worktree commit + push fork，再回外層 bump SHA pin）。**與 010 outer-only 不同**。

---

## 10. 下一步

- 本檔（Phase 0 brainstorm）完成 → **手動執行 `/speckit-specify`**（input = 本檔）；`before_specify` pre-hook 會建 `011-audit-log` feature branch。
- 接著 `/speckit-clarify`（optional）→ `/speckit-plan`（含 Constitution Check + research grep：對 §3 的 `data-model.md` 須 grep sys_operation_log 真實欄、`server/src/model/` 既有 facade/trait 命名）→ `/speckit-tasks` →（`/speckit-analyze`）→ `superpowers:executing-plans`。
- ⚠️ 不要把 `/speckit-specify` 排進 brainstorm 流程觸發（會導致 `speckit.git.feature` 沒被執行）。
