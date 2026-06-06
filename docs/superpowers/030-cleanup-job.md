# 030-cleanup-job — Phase 0 grounding 存底（pre-brainstorm）

> **狀態**:**階段 0 brainstorm 尚未跑**。此檔為 2026-06-06 預先收集的 Phase 0 grounding + 待拍板決策,
> 目的是讓計畫在 context compact 後仍存活、下次 session 的 brainstorm 有 fact-based 起點。
> brainstorm(`superpowers:brainstorming`)應**讀此檔 → 與 user 敲定下方 3 決策 → 擴充成完整 spec-design**,
> 之後 **user 手動 `/speckit-specify`**(觸發 `speckit.git.feature` pre-hook 建 030 分支;見 CLAUDE.md §3 + memory `speckit-specify-user-runs`)。
> feature 名以 specify 階段定案為準(`030-cleanup-job` 為暫名)。

## 決策:做 cleanup-job(+ jti 修)

2026-06-06 user 親選。經 alova-stub ⊘moot 收口後,**cleanup-job 是 Phase 5 唯一剩 feature**(027✅/028✅/029✅/stub⊘moot)。
價值:① sys_token 列無限累積(027 FR-011 OUT)的維運清理;② 順帶修 same-second `token_hash` 撞鍵(027 latent、028 C4 實證觸發、§2.32/§2.33)。

## 已 ground 的事實(實 grep 過 code/infra,非假設)

### A. sys_token 刪除安全規則
- 欄:`id/user_id/token_hash(UNIQUE)/rotation_chain/status/issued_at/expires_at/used_at(null)/created_at`(`entity/src/sys_token.rs`)。
- status 生命週期:`active`→`used`(rotate 時)→`revoked`(reuse 偵測整鏈)（`model/facade/sys_token.rs`）。
- live 讀:只有 `rotate()` 以 `token_hash` 查列(JWT verify 之後);`decide_rotation` 純函式不查 DB。
- **可安全刪**:`revoked`(整鏈已死)/ `used` 且過 grace(`used_at < now-30s`)/ `active` 且 `expires_at < now`(JWT 本身已死)。
- **不可刪**:`active` 未過期 + `used` 在 grace 內(live refresh 靠 token_hash 查它,刪了→誤 NotFound→誤登出)。

### B. jti 修(same-second 撞鍵)
- `Claims` 現有 `sub/user_id/roles/exp/iat/iss/aud/sid`,**無 `jti`**(`auth/jwt.rs`)。
- `sid` 範式:`handler/auth.rs:100` `uuid::Uuid::new_v4().to_string()` 鑄 → `issue_tokens` 串 → `jwt::sign(session_id)` 嵌 Claims。**`jti` 完全鏡像此範式**(每 token 一個 fresh uuid)。
- `token_hash` = `sha256_hex(整個 JWT)`(`facade/sys_token.rs`);加 `jti` → 同秒兩 token byte-distinct → hash 不同 → 不撞 UNIQUE。
- `uuid v4` 已是 server dep;base-web 把 token 當 opaque → **additive-internal、零 wire 影響**(同 028 sid)。修好可拔 028 C4 的「≥1s gap」caveat。

### C. prod-image build(CLAUDE.md §3 acceptance)
- `cleanup-job` binary **已接進** `deploy/Dockerfile.rust-api.txt`(builder `cargo build --release --bins` + runtime COPY)、已是 `rust-api/Cargo.toml` workspace member、`cleanup-job/src/main.rs` 現為 stub。→ **不需改 Dockerfile**,但 acceptance 仍須跑一次 prod image build(新 binary 實作)。

### D. CLI / 排程 / credential 範式
- CLI 先例:`migration/src/main.rs` 用 sea-orm-migration CLI(`up`/`down -n`)+ env-from-secret-file fallback、手寫 arg(非 clap)。→ cleanup-job 用 `--dry-run`(預設)/`--execute`。
- 排程先例:`docker-compose.yml` `migrate` one-shot(`restart: no` + `APP_DATABASE_URL_FILE` secret);**無 cron**。DESIGN §8.3/§10 Phase 5 既有意圖 = `docker compose run --rm cleanup --execute` + `profile: jobs`。
- credential:`deploy/secrets/cleanup_database_url.txt`(+`.example`)**已存在**(暫 == `database_url`、最小權限 role 待此 feature 建);`soybean` 為 superuser、migration 可 `CREATE ROLE`。

## 待 brainstorm 拍板的 3 決策(deployment context、非可 grep)

1. **範圍** —— 窄(sys_token 過期/作廢清理 + jti,= §2.32/已選)**[建議]** vs 廣(DESIGN §10 §1052 框的「soft-delete 物理清理 + 對應 casbin entry」跨表 purge,會碰 #6 受管 RBAC 領域)。
2. **排程機制** —— `docker compose run --rm cleanup --execute`(host cron 外觸,照 DESIGN 意圖)vs in-stack scheduler?
3. **最小權限角色** —— migration 建 `cleanup` PG role(只 SELECT/DELETE on sys_token)vs 先 defer 用 `soybean`?

## 指標(權威 / 相關)
- 設計:DESIGN §10 Phase 5 #5 + §6.2(027 sys_token)。
- follow-up:CHECKLIST §2.32(sys_token 清理 / token_hash 撞鍵 / expires_at 時鐘偏移 / rotate 整鏈競態)+ §2.33(same-second collision)。
- 前序 spec:`specs/027-refresh-token-rotation/`(FR-011 OUT 即此 feature 範圍)。
