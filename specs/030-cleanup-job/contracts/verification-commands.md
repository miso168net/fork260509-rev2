# Contract — C-V 驗收命令（030 cleanup-job）

> 本 feature 無新純函式以外的可單元測邏輯為主體 → 主要由 acceptance（C-V）覆蓋，輔以純單元（cutoff / jti 互異）。
> **無 CDP browser smoke**（無 base-web UI，research D9）。對應 SC-001..006、FR-001..012。
> 活體前置：jti 改 code 後須**重建 + 重啟 rust-api**（WSL2 /mnt/d inotify 不可靠，memory `devstack-acceptance-restart`）。cleanup-job **不 publish watcher**、不污染 running server（memory `live-tests-pollute-running-watcher`）。
> 連線常數（CLAUDE.md §8.2）：rust-api dev `:21081`、postgres `:25432`（user `soybean` / db `soybean_admin_rust`）。

## C1 — prod image build（§3 紀律：新實作 workspace binary 必驗）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 建 prod target image（dev bind-mount 會遮 Dockerfile 逐 crate COPY，故必須真 build prod）
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
# 驗 cleanup-job binary 真的在 runtime stage
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm \
  --entrypoint /bin/sh rust-api -c 'ls -l /usr/local/bin/cleanup-job && /usr/local/bin/cleanup-job --help 2>/dev/null; echo "exit=$?"'
# 期望：binary 存在且可執行（--help/未知 arg → usage、非 0 exit 亦可接受）
```

## C2 — migration 加索引 + 可逆（throwaway DB）

```bash
# up：套用全部 migration（含 m030）後，索引應存在
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait postgres
# （dev 慣例經 migrate service / dcargo 套 migration；此處示意直查）
psql "postgresql://soybean@127.0.0.1:25432/soybean_admin_rust" -c "\di idx_sys_token_expires_at"
# 期望：列出 idx_sys_token_expires_at（btree on sys_token.expires_at）

# up→down→up 可逆（throwaway DB；勿對主 dev DB 跑 down）：
#   dcargo run -p migration -- down -n 1   → 索引消失（\di 無此列）
#   dcargo run -p migration -- up           → 索引復現
```

## C3 — cleanup 活體對帳（SC-001/003/004 + FR-002/003/004/005/008）

```bash
PSQL="psql postgresql://soybean@127.0.0.1:25432/soybean_admin_rust -At"
# seed 各態列（過期 vs 未過期 × active/used/revoked）。expires_at 用相對 now：
$PSQL <<'SQL'
INSERT INTO sys_token (user_id, token_hash, rotation_chain, status, issued_at, expires_at, used_at, created_at) VALUES
 (1,'cv_expired_active',  'cvc1','active', now()-interval '8 day', now()-interval '1 day', NULL,             now()-interval '8 day'),
 (1,'cv_expired_used',    'cvc2','used',   now()-interval '8 day', now()-interval '1 day', now()-interval '8 day', now()-interval '8 day'),
 (1,'cv_expired_revoked', 'cvc3','revoked',now()-interval '8 day', now()-interval '1 day', NULL,             now()-interval '8 day'),
 (1,'cv_live_active',     'cvc4','active', now(),                  now()+interval '6 day', NULL,             now()),
 (1,'cv_live_used',       'cvc5','used',   now()-interval '1 min', now()+interval '6 day', now()-interval '1 min', now()-interval '1 min'),
 (1,'cv_just_expired',    'cvc6','active', now()-interval '7 day', now()-interval '30 sec', NULL,            now()-interval '7 day');
SQL

# dry-run：應回報 3（三個 cv_expired_*），且 DB 不變
docker compose --profile jobs run --rm cleanup-job
$PSQL -c "SELECT count(*) FROM sys_token WHERE token_hash LIKE 'cv_%';"   # 期望 6（未動）

# execute：只刪三個過期列
docker compose --profile jobs run --rm --entrypoint /usr/local/bin/cleanup-job cleanup-job --execute
# 對帳：三個 cv_expired_* 應消失；cv_live_* + cv_just_expired（過期僅 30s < 60s margin）應存活
$PSQL -c "SELECT token_hash FROM sys_token WHERE token_hash LIKE 'cv_%' ORDER BY 1;"
# 期望存活：cv_just_expired, cv_live_active, cv_live_used（3 列）
# 期望消失：cv_expired_active, cv_expired_used, cv_expired_revoked

# 冪等 re-run：再 execute 一次，應刪 0 列（SC-006 / FR-008）
docker compose --profile jobs run --rm --entrypoint /usr/local/bin/cleanup-job cleanup-job --execute
# 期望：deleted 0 rows（前次已清乾淨、無新符合列）

# 收尾清測資料
$PSQL -c "DELETE FROM sys_token WHERE token_hash LIKE 'cv_%';"
```

> 重點驗證：① dry-run 0 改變（SC-003）② execute 只刪過期超 margin（SC-001/004 + FR-002/003）③ `cv_just_expired`（過期 30s，仍在 60s margin 內）**存活** = clock-skew 防護（FR-002 edge）④ `cv_live_used`（used 但未過期）**存活** = reuse 偵測保留（FR-003）⑤ 冪等 re-run 刪 0（SC-006 / FR-008）。
> **interrupt 安全（spec edge「中斷」）**：execute 是**單一 `DELETE … WHERE` 原子語句**（一個 txn）→ 中途中斷整體 rollback、無部分損毀;下次 re-run 補清。故由「原子性 + 冪等 re-run」涵蓋，**無需獨立 kill-test**。

## C4 — jti 同秒登入不撞鍵（SC-005 + FR-009/010）

```bash
# 前置：jti code 落地後重建+重啟 rust-api（inotify 不可靠）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait rust-api

# 同一秒連兩次 login（背景平行送，逼同秒 iat）
LOGIN='{"userName":"Super","password":"123456"}'
for i in 1 2; do
  curl -s -X POST http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' -d "$LOGIN" &
done
wait
# 期望：兩次都 code "0000"（200），無 5000 / token_hash 撞鍵錯誤（此前同秒會其一失敗）

# 對帳：兩次登入產生的 refresh token_hash 互異（jti 使 JWT byte-distinct）
psql postgresql://soybean@127.0.0.1:25432/soybean_admin_rust -At \
  -c "SELECT count(DISTINCT token_hash) FROM sys_token WHERE user_id=1 AND status='active';"
# 期望 ≥2 distinct（同秒兩 active chain head 各自唯一 hash）
```

> 此即 028 C4 場景：此前需刻意製造 ≥1s gap 才不撞;jti 落地後同秒亦過 → 028 C4「≥1s gap」caveat 可拔。

## C5 — jti 相容性 transition（記載、非阻擋）

部署 jti 後，「變更前已發出」的 access/refresh token（無 jti claim）`verify` 失敗 → 持有者一次性重登。與 028 sid rollout 行為一致、spec edge case 已載、可接受。驗證（可選）：用 pre-jti 簽發的 token 打受保護端點 → 預期 3333/8888（非 panic）。

## C6 — cleanup-job 不隨一般 up 啟動（FR-007）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps --services --filter status=running | grep -qx cleanup-job \
  && echo "FAIL: cleanup-job 不該隨一般 up 啟動" \
  || echo "OK: cleanup-job 未啟動（profile:[jobs] gated）"
# 期望 OK：cleanup-job 為 profile:[jobs] one-shot、一般 up 不啟（FR-007：非常駐、on-demand）
```

## SC-002（store 有上界）— 設計性質、不獨立測

SC-002「token 儲存被 ~7 天 refresh TTL 窗封頂、非無限累積」是**純過期規則的數學必然**（任一列其 JWT 過期後即被下次 cleanup 移除）—— 無法在驗收期內用單一命令實測（需等 ≥7 天或操弄系統時鐘）。由 **FR-002 規則 + C3（execute 確實移除過期列）+ 週期性 cleanup（host cron）**共同保證，**刻意不另立獨立測項**（/speckit-analyze E1 接受）。

## 純單元（非 C-V、由 cargo test 覆蓋）

- `purge_cutoff(fixed_now, 60)` == `fixed_now - 60s`（red→green，固化安全規則）。
- jti：同一 `sign()` 路徑連呼兩次（即使 mock 同秒）→ 兩 JWT 字串互異、`sha256_hex` 互異;`verify` 仍成功 round-trip（含新 jti 欄）。
