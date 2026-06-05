# Contracts / Verification Commands: refresh token rotation

**Feature**: 027-refresh-token-rotation | **Date**: 2026-06-05

> C-V 合約。server 為 bin-only crate → live-DB 驗收用 **in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`**(沿 §2.10 / sys_login_attempt 範本),非 `server/tests/`。活體前須 `dcargo build` + `docker compose restart rust-api`(WSL2 cargo-watch 不可靠,project memory)。
>
> **prod image build 非強制**(research D8:無新 workspace crate、只加 sha2 dep 到 server);列為可選。

## §0 環境
```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# dev stack(若未起):docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 重建 + 重啟(改 rust 碼後):
dcargo build -p server -p migration -p entity
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
PW='123456'; BASE=http://127.0.0.1:21081
PSQL="docker compose exec -T postgres psql -U soybean -d soybean -tAc"
```

## §1 純單元測試(常規 `dcargo test -p server`,no-DB)

- **U1 `decide_rotation` 全分支**(TDD red→green,純函式):
  - `active` → `Rotate`
  - `used` + `used_at=Some` 距今 < 30s(grace 內) → `Benign`
  - `used` + `used_at=Some` 距今 ≥ 30s → `Reuse`
  - `used` + `used_at=None` → `Reuse`(fail-closed,data-model §3)
  - `revoked` → `Reuse`
  > **FR-014 五分支覆蓋分工**:`decide_rotation` 是純邏輯 seam、**無 NotFound**(D4:NotFound 是 DB row=None 的 I/O 結果、由 facade 直判)。FR-014「全部分支」= U1 純單測覆蓋 Rotate/Benign/Reuse 系 + **§2 L6 live-DB 覆蓋 NotFound**(unit + live-DB 合計);此為刻意分工、非缺測。
- **U2 `sha256_hex`**:同輸入同輸出、64 hex 字元、不同 JWT 不同 hash。
- **U3 `chain_head_active_model` SQL-build**(鏡像 sys_login_attempt build_tests):INSERT 目標表 `sys_token`、含 `token_hash`/`rotation_chain`/`status`/`user_id` 欄、`status` 字面 `active`、token_hash 為雜湊(**非**原文 JWT,SQL 內不含明文 refresh token)。

## §2 活體 in-crate `#[ignore]` 測試(`DATABASE_URL=... dcargo test -p server -- --ignored`)

放 `facade/sys_token.rs`(lint 豁免目錄)。throwaway/dev DB:
- **L1 create_chain_head**:login facade 寫一筆 → psql 查 1 列 `status='active'`、`token_hash` 為 64-hex(非原文)、`rotation_chain` 非空、`used_at IS NULL`。
- **L2 rotate 正常輪替**:對 active token rotate → 回 `Rotated`;psql 舊列 `status='used'`+`used_at` 非空、同 chain 出現新 `active` 列。
- **L3 reuse 超 grace**:把某 used 列 `used_at` 改 `now()-interval '60s'`,以該 token rotate → 回 `Reuse`;psql 該 `rotation_chain` 全列 `status='revoked'`。
- **L4 benign 並發(grace 內)**:active token rotate(→used,used_at=now)後,**立即**再以同 token rotate → 回 `BenignConcurrent`(非 Reuse);psql 該 chain 仍有 `active` 列、無 `revoked`。
- **L5 revoked 再用**:對已 revoked chain 的 token rotate → 回 `Reuse`(no-op、不報錯)。
- **L6 not-found**:對隨機(無對應列)JWT rotate → 回 `NotFound`。

## §3 curl/psql 端到端(經 rust-api :21081 直連)

```bash
# 登入 → 取 token + refreshToken
LOGIN=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' -d "{\"userName\":\"Super\",\"password\":\"$PW\"}")
RT=$(echo "$LOGIN" | jq -r .data.refreshToken)
# C1 login 建 chain head:DB 有 active 列、token_hash 非原文
$PSQL "SELECT status, length(token_hash)=64, token_hash <> '$RT' FROM sys_token ORDER BY id DESC LIMIT 1"   # active|t|t
# C2 refresh 輪替:換新 + 回 200 envelope
R1=$(curl -s $BASE/auth/refreshToken -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}")
echo "$R1" | jq -e '.code=="0000" and (.data.token|length>0) and (.data.refreshToken|length>0)'           # true
RT2=$(echo "$R1" | jq -r .data.refreshToken)
# 舊 RT 標 used、新 RT2 active 同 chain
$PSQL "SELECT status FROM sys_token WHERE token_hash=encode(sha256('$RT'::bytea),'hex')"                    # used
# C3 reuse 偵測(舊 RT 超 grace 後重放 → 8888 + 整鏈 revoked)
$PSQL "UPDATE sys_token SET used_at=now()-interval '60 seconds' WHERE token_hash=encode(sha256('$RT'::bytea),'hex')"
R2=$(curl -s $BASE/auth/refreshToken -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}")
echo "$R2" | jq -e '.code=="8888"'                                                                          # true
# 同 chain 全 revoked(含 RT2)
$PSQL "SELECT bool_and(status='revoked') FROM sys_token WHERE rotation_chain=(SELECT rotation_chain FROM sys_token WHERE token_hash=encode(sha256('$RT'::bytea),'hex'))"  # t
# C4 失敗碼紀律:亂 token refresh → 8888,grep 無 3333/9999/9998
curl -s $BASE/auth/refreshToken -H 'Content-Type: application/json' -d '{"refreshToken":"garbage"}' | jq -e '.code=="8888"'  # true
# C5 stale-but-unexpired access 還原 getUserInfo(US4/FR-009/SC-008 不變式)
# access_token_ttl_secs 預設 3600 → sleep 模擬「較早簽發但尚未過期」(US4 刻意點名維度)
AT=$(echo "$LOGIN" | jq -r .data.token)
sleep 15
curl -s $BASE/auth/getUserInfo -H "Authorization: Bearer $AT" | jq -e '.code=="0000" and (.data.userName|length>0)'  # true
# 等價論證:027 **不改 getUserInfo / verify_bearer**(只查 exp、與簽發時間早晚無關)→ stale-but-unexpired
# 與 fresh access 走逐字相同路徑;sleep 後仍 200 即證 027 未誤傷此既有不變式。
```

## §4 守恆 + migration 可逆
```bash
dcargo test -p server                       # 既有 206 + 新測 全綠
dcargo test -p server -- entity_access      # entity_access_lint 17(新 facade 守)
dcargo test -p server -- endpoint_coverage  # endpoint_coverage_lint 30(無新端點、不變)
# migration up→down→up 可逆(throwaway DB):
dcargo run -p migration -- up && dcargo run -p migration -- down -n 1 && dcargo run -p migration -- up
```

## §5 CDP(建議、沿紀律)
dev :21080 或 prod :443 經 base-web 真實 refresh 一次:登入 → 觸發/等 access 過期 → Network 確認 `refreshToken` 換新成功、**未被登出**(同一 session 連續操作正常)。isolated browser context(project memory)。

## §6 prod image build(可選)
無新 workspace crate(D8)→ 非強制;若要絕對保險:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
```
