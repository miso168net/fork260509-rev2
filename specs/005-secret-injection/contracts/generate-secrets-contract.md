# Contract: generate-secrets.sh 行為

**Type**: shell 腳本行為合約。沿用 003 `generate-dev-cert.sh` 風格([research R3/R6](../research.md))。

---

## 介面

```bash
bash deploy/generate-secrets.sh           # zero-arg:缺哪個生哪個(idempotent skip)
bash deploy/generate-secrets.sh --force   # 全部重生(覆寫既有 .txt)
```

---

## 執行序

```text
set -euo pipefail;FORCE 偵測(--force);SCRIPT_DIR/secrets 定位
OPENSSL_IMG=alpine/openssl;docker pull -q
gen_leaf(name, bytes):
    若 <name>.txt 缺 OR FORCE → docker run --rm alpine/openssl rand -base64 <bytes> > <name>.txt
1. gen_leaf jwt_secret 48
   gen_leaf refresh_token_secret 48
   gen_leaf postgres_password 24
   gen_leaf redis_password 24
2. 組 URL(缺 OR FORCE 時;讀既有/剛生的葉子):
   database_url.txt         = postgres://soybean:$(cat postgres_password.txt)@postgres:5432/soybean_admin_rust
   redis_url.txt            = redis://:$(cat redis_password.txt)@redis-stack:6379
   cleanup_database_url.txt = (同 database_url)
3. chmod 600 deploy/secrets/*.txt
4. 印生成摘要(每 secret:GENERATED / SKIPPED;不印值本體)
```

---

## 不變式(MUST)

- **dual-write**:URL `.txt` 內嵌 password ≡ 對應葉子 `.txt`(同次同源組出;R6)
- **idempotent**:zero-arg 不覆寫既有 `.txt`;葉子已存在但 URL 缺 → 用既有葉子組 URL(維持 dual-write)
- **--force**:全重生,URL 連帶用新葉子重組
- **不洩漏**:stdout 不含任何 secret 值本體(只印 GENERATED/SKIPPED 摘要)
- **權限**:`.txt` chmod 600
- **host-independent**:openssl 走 docker(host 只需 docker)

---

## 邊界(MUST NOT)

- 不生 4 可選 obs secret(Phase 5/6)
- 不掛 secret 進 compose / 不設 `APP_*_FILE` env(Phase 2)
- 不改 `.gitignore`(既有 L68-69 已涵蓋)/ `config.rs` / base-web / rust-api worktree

---

## 驗收

對應 spec FR-001~FR-006 + FR-015 + SC-001/SC-002/SC-003。
