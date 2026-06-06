# 030-cleanup-job — spec-design（階段 0 brainstorm 完成）

> **狀態**:**brainstorm 已完成**（2026-06-06）。下方 §2 四個決策全數拍板、§4 設計定案，
> 事實以 grep 過的 `file:line` 為準（grounding workflow 2026-06-06 五面向覆驗）。
> **下一步：user 手動 `/speckit-specify`**（觸發 `speckit.git.feature` pre-hook 建 030 分支；見 CLAUDE.md §3 + memory `speckit-specify-user-runs`）。
> 此檔即 `/speckit-specify` 的輸入；feature 名以 specify 階段定案為準（`030-cleanup-job` 為暫名）。

## 1. 決策：做 cleanup-job（+ jti 修），**窄範圍**

2026-06-06 user 親選。經 alova-stub ⊘moot 收口後，cleanup-job 是 Phase 5 唯一剩 feature（027✅/028✅/029✅/stub⊘moot）。

價值：① sys_token 列累積（027 FR-011 OUT）的維運清理 —— 用「純過期」規則把表封頂在 ~7 天 TTL 窗、非無限累積；② 順帶修 same-second `token_hash` 撞鍵（027 latent、028 C4 實證觸發、CHECKLIST §2.32/§2.33）。

**範圍 = 窄**：只清 `sys_token` + 修 `jti`。**不**碰跨表 soft-delete 物理清理 / casbin entry 清理 —— 那條被 #6 受管 RBAC 的 §11.6 fork amendment 卡住（DESIGN §1130：casbin_rule soft-delete 屬 Phase 3 #6 RBAC policy 層），且 027 FR-011 當初延後的就是 sys_token 這塊。

## 2. 拍板結果（4 決策）

| # | 決策 | 結論 | 理由 |
|---|---|---|---|
| 1 | **清理範圍** | **窄：只清 sys_token + 修 jti** | 跨表/casbin 廣範圍被 #6 RBAC §11.6 fork amendment 卡住、現在做不完整；窄範圍無外部依賴、正是 027 FR-011 延後項。 |
| 2 | **刪除規則** | **純過期 + 安全邊際：`DELETE WHERE expires_at < now() - 60s`** | sys_token 列只被 `rotate()` 以 token_hash 讀，而 rotate 只在 `jwt::verify()`（檢 exp）通過後才到 → 一旦 `expires_at` 過了該列永遠不可能再被查到、任何 status 皆可安全刪；未過期的 used/revoked 列仍可達、保留以維持 reuse 偵測。60s margin 吸收 §2.32 的 `expires_at`↔JWT `exp` 時鐘偏移，保證絕不刪到「JWT 還驗得過」的列。表大小被 7 天 refresh TTL 自然封頂。 |
| 3 | **DB 權限** | **先沿用 soybean superuser**；low-priv role defer 為 follow-up | YAGNI（個人研究 workspace 風險低）；cleanup-job 仍透過既有 `cleanup_database_url` secret 連線（目前 == database_url，indirection 已備好，未來換 low-priv role 不動 cleanup-job）。 |
| 4 | **清理索引** | **加普通 btree `idx_sys_token_expires_at`** | 現有 2 索引都不是 `expires_at` → 純過期 `DELETE` 否則掃全表。述詞跨所有 status 故非 partial。每次發 token 多維護一個 btree、成本可忽略。 |

**已隨拍板定案、無另案**：
- **jti 納入**（決策 1 的「+ jti」）—— 乾淨 additive、零 wire 影響、正好解同秒撞鍵。
- **排程**沿用 DESIGN §8.6/§10 意圖：`profile:["jobs"]` + `restart:"no"` + **dry-run 預設**、`--execute` 才實刪、host cron 外觸（無 in-stack scheduler）。

## 3. 已 ground 的事實（grep 驗證、`file:line` 為準）

> 路徑相對 workspace root；rust-api 內路徑省略 `rust-api/` 前綴時以該 crate 為根。

### 3.1 sys_token deletion safety
- 欄：`id / user_id / token_hash(UNIQUE, string_len 64) / rotation_chain(uuid 字串,≤36) / status / issued_at / expires_at / used_at(nullable, 預設 NULL) / created_at`（`entity/src/sys_token.rs:5-16`；UNIQUE 在 `migration/src/m20260529_000026_create_sys_token.rs:42-45`）。
- status：`ACTIVE → USED`（rotate 時）`→ REVOKED`（reuse 偵測撤整鏈）。常數在 `model/facade/sys_token.rs:25-30`；`GRACE_SECS = 30`（公開常數）在 `:23`。
- **live 讀唯一管道**：`rotate()`（`model/facade/sys_token.rs:147-150`）以 token_hash 查列，且在 `jwt::verify()` 通過後才呼叫；`decide_rotation`（`:76`）是純函式、不查 DB。
- 整鏈撤銷以 `UPDATE … WHERE rotation_chain = X`（`:192-196`），chain 由相同 uuid 字串值認定（非 id linkage）。
- **無 FK**：`sys_token.id` 不被任何表參照（`m...026:24` 註明 logical-only），刪除無 cascade 顧慮。
- **現有索引只有 2 個**（`m...026:82-100`）：`idx_sys_token_user_active`（partial：`user_id` WHERE `status='active'`）、`idx_sys_token_chain`（`rotation_chain`）。**`expires_at / status / used_at` 皆無索引** → 純過期 DELETE 需 §4.D 新增 `idx_sys_token_expires_at`。
- 目前**無任何 cleanup/purge/delete-expired facade fn**（facade 只有 sha256_hex / decide_rotation / chain_head_active_model / create_chain_head / rotate / revoke_other_chains）。

### 3.2 jti（same-second token_hash 撞鍵）
- `Claims` 現有 `sub/user_id/roles/exp/iat/iss/aud/sid`、**無 jti**（`auth/jwt.rs:29-47`）。
- `sid` 範式：`handler/auth.rs:100` `uuid::Uuid::new_v4().to_string()` → `issue_tokens` → `jwt::sign(session_id)` 嵌 Claims（`jwt.rs:88`）。jti **完全鏡像此範式**，但語意不同：**jti 每 token 一個 fresh uuid**（sid 是 per-session/per-chain、會跨 refresh 鏈延續）。
- `token_hash = sha256_hex(整個 JWT)`（`model/facade/sys_token.rs:56-66`）；`iat/exp` 由 `sign()` 內單次 `now_secs()` 算（`jwt.rs:78-79`）→ 同一秒兩 token 的 claims 全同 → JWT byte 相同 → sha256 相同 → 撞 `token_hash` UNIQUE。加 jti（每 token 異）→ JWT body byte-distinct → 不撞。
- `uuid` v4 已是 server dep；base-web 把 token 當 opaque（`jwt.rs:9-10` 註）→ **additive-internal、零 wire 影響**（同 028 sid）。修好可拔 028 C4「≥1s gap」caveat。
- **Claims 建構點共 4 處**（jti 須串過，避免漏）：`jwt.rs:80`（**production** `sign()`）、`jwt.rs:157`（`sign_with_past_exp` test helper）、`bearer.rs:128`（`sign_expired` test helper）、`session.rs:342`（live-test `claims()` helper）。
- `verify()` 用 `decode::<Claims>`（`jwt.rs:112-119`）**要求所有欄位存在**（缺 sid 即 `JwtError::Verify`，test `:213-273` 證）→ jti 為新內部欄、無 wire 相容問題（base-web 不 decode），但任何手鑄 Claims 都須帶 jti。

### 3.3 prod build（cleanup-job binary 已接好）
- `cleanup-job` 已是 workspace member（`rust-api/Cargo.toml:2`）；prod Dockerfile builder `cargo build --release --bins`（`deploy/Dockerfile.rust-api.txt:54`）+ runtime `COPY … /usr/local/bin/`（`:100`）；entrypoint dispatcher 已有 case（`deploy/entrypoint.rust-api.sh:12-14`：`cleanup-job) shift; exec /usr/local/bin/cleanup-job "$@"`）。
- `cleanup-job/src/main.rs` 現為 stub；`cleanup-job/Cargo.toml` **現無任何依賴**（本 feature 需加 `entity` / `sea-orm` / `tokio` / `anyhow` workspace deps）。
- **不需改 Dockerfile**，但**因新實作 binary、acceptance 仍須跑一次 prod image build**（CLAUDE.md §3 紀律；dev bind-mount 會遮 Dockerfile COPY）。

### 3.4 連線 / 排程 / credential 範式
- **DB 連線**：cleanup-job 鏡像 `migration` bin 極簡法 —— 讀 `APP_DATABASE_URL_FILE`（fallback `APP_DATABASE_URL`）、`Database::connect()`（`migration/src/main.rs:6-14`）。**不**重用 server 的 `infra/db.rs::connect_postgres` 或 `config`（皆 server-internal，且 server 是 **bin-only 無 lib target**、無法 depend）。
- **one-shot 範式**：`migrate` service（`docker-compose.yml:75-90`，`restart:"no"` + `APP_DATABASE_URL_FILE:/run/secrets/database_url`）。**stack 內無 cron / scheduler**；唯一既有 profile 是 `acme`（`profiles:[prod]`，`:131`），**無 `profile:jobs`** → 本 feature 新增。
- **secret-file 慣例**：env 變數 `<X>_FILE` → 讀 `/run/secrets/<name>` 內容（如 `APP_DATABASE_URL_FILE`、`POSTGRES_PASSWORD_FILE`、`APP_JWT_JWT_SECRET_FILE`）。
- **credential**：`deploy/secrets/cleanup_database_url.txt`(+`.example`) **已存在**（暫 == `database_url`，`.example` 註「Phase 5 暫與 database_url 同值」「least-priv cleanup role 留 Phase 5」）；postgres superuser = `soybean`（`docker-compose.yml:96`）。**全專案無任何 migration 做過 `CREATE ROLE`/`GRANT`** → low-priv role 會是首例（本 feature 依決策 3 defer）。
- **refresh TTL = 604800s（7 天）**（`config.rs:47/93/185/346`、`application.yaml:7`）→ 純過期規則把 sys_token 封頂在「最近 ~7 天發出的 token」。

### 3.5 設計意圖 / follow-up 對照
- DESIGN §10「Phase 5」`:1052` 框 cleanup-job；`:1053-1056` = `profile:["jobs"]` + `restart:"no"` + `docker compose run --rm cleanup --execute` + host cron；`:1231` = dry-run 預設 + `--execute` + host cron + 獨立最小權限 credential（過期/作廢 sys_token 實體清理屬此 feature、027 FR-011 OUT）。
- 廣範圍阻擋：DESIGN `:1130` casbin_rule soft-delete 需 §11.6 fork amendment（Phase 3 #6 受管 RBAC）；soft-delete 表共 4：`sys_user / sys_role / sys_menu / system_settings`（皆 #6 領域、本 feature 不碰）。
- CHECKLIST §2.32 綁 5 顧慮：(1) sys_token 清理（**= 本 feature**）、(2) token_hash 同秒撞鍵（**= jti 修**）、(3) `expires_at`↔`exp` 時鐘偏移（**= 60s margin 順手吸收**）、(4) rotate 整鏈撤銷原子性（**範圍外**）、(5) abuse-detection metrics（Phase 6）。§2.33 = 同秒撞鍵（併入 §2.32）。
- 027 spec `:106` FR-011：refresh 憑證實體清理/過期淘汰屬範圍外、交後續 cleanup-job —— **= 本 feature**。

## 4. 設計定案

### A. cleanup-job crate（自足、鏡像 migration bin）
- deps 加：`entity`、`sea-orm`、`tokio`、`anyhow`（皆走 workspace.dependencies）。
- 連線：讀 `APP_DATABASE_URL_FILE` → fallback `APP_DATABASE_URL` → `Database::connect()`。
- entity 存取：**直接用 `entity::sys_token`** 做 count/delete。**不違 009 lint** —— `entity_access_lint.rs:348` 以 server crate 的 `CARGO_MANIFEST_DIR` 為根、只掃 `server/src`，不掃 cleanup-job；且 cleanup-job 是「物理清理工具」、本就該繞 soft-delete facade。

### B. 刪除規則（核心）
- `cutoff = now() - SKEW_MARGIN_SECS`（`SKEW_MARGIN_SECS` 常數 = 60；purpose = 吸收 `expires_at`↔JWT `exp` 偏移，保證只刪「JWT 必定已失效」的列）。
- **dry-run（預設）**：`SELECT count(*) FROM sys_token WHERE expires_at < cutoff`，印「將刪 N 列」、**不動 DB**。
- **`--execute`**：`sys_token::Entity::delete_many().filter(Column::ExpiresAt.lt(cutoff)).exec()`，印實刪列數。
- **不**依賴 GRACE_SECS / status / used_at —— 純過期已涵蓋所有「不可達」列，且嚴格比三態規則安全（保留未過期 used/revoked 的 reuse 偵測直到自然過期）。

### C. jti 修（server crate，獨立可先行）
- `Claims` 加 `jti: String`（`jwt.rs`）。
- `sign()` 內、建 Claims 前 `let jti = uuid::Uuid::new_v4().to_string();` 設入。
- 串過 §3.2 列的 4 個建構點（1 production + 3 test helper）；`decode` 自動驗存在、永不檢視值。
- 驗證：同一秒兩次 `sign()` → JWT / `sha256_hex` 互異；既有 verify/rotate 行為不變。

### D. migration `m20260529_000030`
- `up`：`CREATE INDEX idx_sys_token_expires_at ON sys_token (expires_at)`。
- `down`：`DROP INDEX idx_sys_token_expires_at`（可逆，須驗 up→down→up）。
- 註冊進 `migration/src/lib.rs` 的 `migrations()` 清單末。
- **不建** DB role（決策 3 defer）。

### E. 排程 / compose
- 在 master `docker-compose.yml` 加 `cleanup-job` service：`profiles:["jobs"]` + `restart:"no"` + `APP_DATABASE_URL_FILE:/run/secrets/cleanup_database_url` + `secrets:[cleanup_database_url]` + `command:["cleanup-job"]`（經 entrypoint dispatcher 路由、預設 dry-run）。
- 一般 `docker compose up` **不啟**（profile-gated）；host cron 觸發：
  - dry-run：`docker compose --profile jobs run --rm cleanup-job`（無附加 arg → 用 service `command` → dispatcher → binary 無 arg → dry-run）。
  - 實刪：`docker compose --profile jobs run --rm --entrypoint /usr/local/bin/cleanup-job cleanup-job --execute`。
  - **dispatcher arg 陷阱**：`docker compose run` 附加的 arg 會**取代** service `command`；若直接 `run … cleanup-job --execute`，`--execute` 會被 entrypoint dispatcher 當 `$1`（selector）→ routing 失敗。故實刪用 `--entrypoint` 直指 binary、讓 `--execute` 直達（或退而求其次 `run … cleanup-job cleanup-job --execute` 重複 selector）。
- dev/prod override 沿用 master 定義（同 migrate 模式）。

### F. 測試策略（§3 TDD + acceptance 紀律）
- **單元（純）**：`purge_cutoff(now, margin_secs) -> cutoff` 等純算術 / filter 述詞建構 —— 雖簡單，固化並守「只刪 cutoff 前」安全規則。
- **in-crate `#[ignore]` live postgres 整合**（cleanup-job 為 bin-only、需 live DB；同 `rustapi_build_test_env` 範式）：seed 各態列〔active-未過期 / active-已過期 / used-grace內 / used-已過期 / revoked-未過期 / revoked-已過期〕→ ① dry-run 驗回報 count、**0 列被刪** → ② `--execute` 驗**只 `expires_at<cutoff` 列消失、未過期(含 used/revoked)與 active 全保留**。
  - 註：cleanup-job **不 PUBLISH 任何 watcher channel**，不污染 running server in-memory 狀態（不同於 029 settings_watcher 陷阱，memory `live-tests-pollute-running-watcher`）；但仍動 live DB，acceptance 前照 `devstack-acceptance-restart` 紀律確認 stack 狀態。
- **jti 單元**（server）：同秒兩 `sign()` → token_hash 互異 + decode 仍過。

### G. acceptance（contracts C-V）
- **prod image build**（§3 紀律，cleanup-job 新實作 binary）：`docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api` + 驗 binary 在 runtime stage（`docker run … ls -l /usr/local/bin/cleanup-job`）。
- **live**：`docker compose --profile jobs run --rm cleanup-job`（dry-run 印 N、psql 驗未動）→ `docker compose --profile jobs run --rm --entrypoint /usr/local/bin/cleanup-job cleanup-job --execute`（psql 對帳：過期列消失、未過期/active 保留；invocation 細節見 §4.E dispatcher arg 陷阱）。
- **jti**：curl **同一秒**連兩次 login → 兩次都成功、**不再 5000 token_hash 撞鍵**（即 028 C4 場景現無需 ≥1s gap 即過）。

## 5. 登記 follow-up（本 feature 不做）
- **least-priv cleanup PG role**（決策 3 defer）：日後 migration 建只有 `sys_token` SELECT/DELETE 的 PG role，並把 `cleanup_database_url.txt` 從 == database_url 換成該 role 連線字串（cleanup-job 不需改、已走該 secret）。
- §2.32 殘餘：rotate 整鏈撤銷原子性（範圍外）、abuse-detection 持久化 / metrics（Phase 6 observability）。

## 6. 指標（權威 / 相關）
- 設計：DESIGN §10 Phase 5（`:1052-1056`、`:1231`）+ §6.2（027 sys_token）。
- follow-up：CHECKLIST §2.32（sys_token 清理 / token_hash 撞鍵 / 時鐘偏移 / 整鏈競態）+ §2.33（same-second collision）。
- 前序 spec：`specs/027-refresh-token-rotation/`（FR-011 OUT 即此 feature 範圍）。
