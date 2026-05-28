# Contract: cert files(`deploy/dev-certs/` 4 PEM 檔)

**Type**: PEM-formatted X.509 certificates + RSA private keys output to `deploy/dev-certs/`

## Output files(本 feature 生成)

| File | Format | Path | Track? | Source |
|---|---|---|---|---|
| `ca.pem` | PEM X.509 cert | `deploy/dev-certs/ca.pem` | gitignored | 自簽:script 自生 / 外部 CA:user 預放 |
| `ca.key` | PEM RSA private key(plain)| `deploy/dev-certs/ca.key` | gitignored(SECRET)| 自簽:script 自生 / 外部 CA:user 預放(必須 plain)|
| `fullchain.pem` | PEM X.509 cert chain | `deploy/dev-certs/fullchain.pem` | gitignored | script 出(自簽 = leaf only / 外部 = leaf+intermediate cat)|
| `privkey.pem` | PEM RSA private key(plain)| `deploy/dev-certs/privkey.pem` | gitignored(SECRET)| script 自生(genrsa 2048)|

## 額外 tracked file

| File | Format | Purpose |
|---|---|---|
| `.gitkeep` | empty | git track,保留目錄存在 |

## 額外 script-managed marker file

| File | Format | Path | Track? | Purpose |
|---|---|---|---|---|
| `self-signed-marker` | empty | `deploy/dev-certs/self-signed-marker` | gitignored(line 136 wildcard 覆蓋) | Step 1 自簽生 CA 後 `touch` 寫入;script 偵測時若 `ca.* + marker` 同時在 → 視為自簽路線(`--force` 可一併重生 ca.*);若 `ca.* + 無 marker` → 視為外部 CA 路線。implementation 加,解 FR-004 純看 ca.* 存在 vs FR-013 自簽 `--force` 重生 4 檔的 spec 內部矛盾。切換外部 CA 時 user 須手動 `rm self-signed-marker`(quickstart.md Path C / troubleshooting 已涵蓋)|

## `ca.pem` 規格(自簽路線)

```text
Subject:    CN = rev2-admin-root dev CA
Issuer:     CN = rev2-admin-root dev CA  (self-signed)
Validity:   3650 days (10 years)
Key:        RSA 2048
Extensions:
  basicConstraints  = critical, CA:TRUE
  keyUsage          = critical, keyCertSign, cRLSign
```

外部 CA 路線:由 user 預放,Subject / Issuer / validity / 演算法皆由 user 自家 CA 決定;script 不驗證 ca.pem 內容合規性(信任 user 提供的是有效 CA cert)。

## `ca.key` 規格

```text
Format: PEM RSA private key (PKCS#1 or PKCS#8, plain — no AES256 encryption)
Size:   RSA 2048 (自簽路線);user-decided (外部 CA 路線,常見 2048 / 4096)
Pairs:  ca.pem 的公鑰
```

★ **外部 CA 路線約束**:user 必須提供 plain RSA key(未加密);若 user CA key 是 AES256 加密(如 `myca.enc`),須手動先解出:
```bash
openssl rsa -in myca.enc -out deploy/dev-certs/ca.key -passin env:SSL_MYCA_PASS
```

## `fullchain.pem` 規格

```text
Subject:    CN = localhost
Issuer:     CN = rev2-admin-root dev CA  (自簽路線) / user CA Subject (外部 CA 路線)
Validity:   365 days (1 year)
Key:        RSA 2048 (對應 privkey.pem)
Extensions:
  subjectAltName        = DNS:localhost, IP:127.0.0.1
  basicConstraints      = critical, CA:FALSE
  keyUsage              = critical, digitalSignature, keyEncipherment
  extendedKeyUsage      = serverAuth

Structure:
  自簽路線:   1 個 BEGIN CERTIFICATE block (leaf only)
  外部 CA 路線: 2 個 BEGIN CERTIFICATE block (leaf + intermediate ca.pem concat)
```

對齊 let's encrypt / acme `fullchain.pem` 慣例(leaf + intermediate;**不**含 root)。

## `privkey.pem` 規格

```text
Format: PEM RSA private key (PKCS#1 or PKCS#8, plain)
Size:   RSA 2048
Pairs:  fullchain.pem 的 leaf cert 公鑰
```

對齊 let's encrypt / acme `privkey.pem` 慣例。

## 驗收

對應 spec FR-006 / FR-007 / FR-009 / FR-010 + SC-002 / SC-003 / SC-004。
