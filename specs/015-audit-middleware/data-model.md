# Data Model: 015-audit-middleware

**Date**: 2026-06-01 | **Branch**: `015-audit-middleware`
依據 [research.md](research.md) 的 grep 事實。兩張 **append-only** 審計表(沿 `sys_operation_log` 011 範本),經 010 自動套、server 不自動 migrate(007 FR-009)。

> **命名鐵則**(memory `reviewer_needs_real_sha` 精神 + §3 命名對照):下方 `file:line` / 型別為 plan 設計值;implementer 須 **act on actual code**,Rust 型 / sea-orm API 以實際編譯為準(尤其 `IpNetwork` 的確切 import path 與建構法)。

---

## 1. `sys_access_log`(已認證請求存取紀錄)

**Migration**: `migration/src/m20260529_000011_create_sys_access_log.rs`
**Entity**: `entity/src/sys_access_log.rs` | **Facade**: `server/src/model/facade/sys_access_log.rs`

| 欄位 | DB 型 | Rust(entity) | 約束 / 說明 |
|---|---|---|---|
| `id` | BIGSERIAL | `i64`(`primary_key, auto_increment=true`) | PK |
| `operator_id` | BIGINT NOT NULL | `i64` | 已認證 user_id(`claims.user_id`);**access-log 必有 operator**(只記已認證) |
| `method` | TEXT NOT NULL | `String` | HTTP method |
| `path` | TEXT NOT NULL | `String` | 請求路徑(經 front-nginx 時為 strip `/api` 後路徑,R9) |
| `http_status` | INT NOT NULL | `i32` | 最終回應狀態碼(含 enforce 403) |
| `client_ip` | INET NOT NULL | `IpNetwork`(R1) | 直連對端 IP(ConnectInfo peer)存 `/32`;真值寫入經 `with-ipnetwork`(R1) |
| `x_forwarded_for` | TEXT NULL | `Option<String>` | 入站 XFF header 原始字串逐字;無則 NULL |
| `region` | TEXT NULL | `Option<String>` | xdb 由 `client_ip` 解析的 raw 字串(`国\|区\|省\|市\|ISP`);解析 Err→NULL(best-effort) |
| `trace_id` | TEXT NULL | `Option<String>` | 入站 `X-Request-Id` 或 `uuid v4` |
| `created_at` | TIMESTAMPTZ NOT NULL default `now()` | `DateTimeWithTimeZone` | 事件時間(append-only;§I.6 例外 operator 欄=`operator_id`) |

- **append-only**:無 `deleted_at`、不 impl `SoftDeletable`、空 `Relation{}`、`ActiveModelBehavior` 預設。**MUST NOT** 加 `updated_*`/`deleted_*`(§I.6 append-only 例外)。
- **index**:無額外(查詢由 operator_id/created_at 即可;非 lockout 熱點)。

## 2. `sys_login_attempt`(登入嘗試紀錄)

**Migration**: `migration/src/m20260529_000012_create_sys_login_attempt.rs`
**Entity**: `entity/src/sys_login_attempt.rs` | **Facade**: `server/src/model/facade/sys_login_attempt.rs`

| 欄位 | DB 型 | Rust(entity) | 約束 / 說明 |
|---|---|---|---|
| `id` | BIGSERIAL | `i64`(`primary_key, auto_increment=true`) | PK |
| `attempted_user_name` | TEXT NOT NULL | `String` | 被嘗試的帳號名(**業務欄、非 `*_by`** → 不受 §I.6「operator 非 user_name」約束) |
| `success` | BOOL NOT NULL | `bool` | 成功/失敗旗標 |
| `operator_id` | BIGINT NULL | `Option<i64>` | 成功時 = user_id;失敗時 NULL(未認證,§I.6 operator 欄) |
| `client_ip` | INET NOT NULL | `IpNetwork`(R1) | 直連對端 IP `/32` |
| `x_forwarded_for` | TEXT NULL | `Option<String>` | XFF 原始字串 |
| `region` | TEXT NULL | `Option<String>` | xdb 由 `client_ip` 解析 raw 字串;Err→NULL |
| `trace_id` | TEXT NULL | `Option<String>` | `X-Request-Id` 或 uuid v4 |
| `created_at` | TIMESTAMPTZ NOT NULL default `now()` | `DateTimeWithTimeZone` | 事件時間(append-only) |

- **append-only**:同上(無 `deleted_at`/不 SoftDeletable/§I.6 例外)。
- **index**(FR-008 未來 lockout 查詢「N 分鐘內某帳號/IP 失敗次數」):
  - `idx_login_attempt_user_time` on `(attempted_user_name, created_at)`
  - `idx_login_attempt_ip_time` on `(client_ip, created_at)`

> casbin_rule / sys_operation_log / sys_user 等既有表 **不動**(015 新增兩張獨立表;access-log 與資料變動 audit 是不同關注點)。

---

## 3. 寫入路徑(facade,沿 011 慣例)

- `facade/sys_access_log.rs`:private `access_log_active_model(entry) -> entity::sys_access_log::ActiveModel`(單測 seam)+ `pub async fn write(db, entry) -> Result<(), DbErr>`(`.insert(db).await?`)。**唯一構造 `entity::sys_access_log::ActiveModel` 之處**(守 009 entity-access lint,facade 目錄豁免)。
- `facade/sys_login_attempt.rs`:同結構,`write(db, attempt)`。
- 兩 facade 註冊 `server/src/model/facade/mod.rs`。
- **best-effort**:caller(middleware / login handler)對 `write` 的 `Err` 只 `tracing::warn!`、不傳播(不破業務請求,FR-003)。

## 4. 請求脈絡(in-memory,非 DB entity)

`RequestContext`(放 `server/src/` 內、由 ctx_mw 塞 request extension,供 access-log 與 login handler 共用):

| 欄 | 型 | 來源 |
|---|---|---|
| `client_ip` | `IpAddr`(或 `IpNetwork`) | `ConnectInfo<SocketAddr>` peer |
| `x_forwarded_for` | `Option<String>` | `X-Forwarded-For` raw header |
| `region` | `Option<String>` | `xdb::search_by_ip(client_ip)`(Err→None) |
| `trace_id` | `String` | `X-Request-Id` 或 `Uuid::new_v4()` |
| `operator_id` | `Option<i64>` | `bearer_token→jwt::verify→claims.user_id`(失敗→None) |

- `operator_id.is_some()` ⇔ 「已認證請求」⇒ access-log 寫入閘門(FR-001/FR-002 由此一條件實現)。
- login handler 從 extension 讀 `client_ip`/`region`/`x_forwarded_for`/`trace_id` 組 `sys_login_attempt`(自帶業務成敗 + attempted_user_name)。

## 5. 狀態與生命週期

- 兩表皆 **append-only 不可變事件**:INSERT-only,無 UPDATE/DELETE 路徑(應用層)。保留期清理(若需)留 Phase 5 cleanup-job、非 015。
- 無外鍵關聯到 `sys_user`(operator_id 為 user_id 數值、不設 FK;與 011 `sys_operation_log` 一致,避免 audit 寫入受 user 表約束)。
