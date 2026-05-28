# Phase 1 Data Model: tls-dev-cert

> 本 feature 為部署基建工具、無 DB entity / 業務 model。本檔列 6 個 key entity 與其驗證規則、Hybrid 偵測 state transition。

---

## Entity 1: `deploy/generate-dev-cert.sh`(script)

**意義**:本 feature 唯一 implementation 檔;rev2 開發者執行入口。

**Properties**:

| Field | Value |
|---|---|
| Shebang | `#!/usr/bin/env bash` |
| Mode | executable(chmod +x by script committer)|
| Arg signature | `[--force]`(zero arg = default / `--force` = 覆寫模式)|
| Exit codes | `0` = 成功 / `1` = `fullchain.pem` 已存在且無 `--force`(冪等性 block)|
| External deps | `docker`(host)+ `alpine/openssl:latest`(pull on demand)|
| `set` flags | `set -euo pipefail`(任何命令 fail → 整 script 停;未定義變數 → 停;pipe 任一段 fail → 整 pipe fail)|
| anchor 解析 | `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` → 絕對路徑、不依賴 cwd |

**Validation**:
- `bash -n deploy/generate-dev-cert.sh` 語法檢查通過
- `head -1 deploy/generate-dev-cert.sh` 為 `#!/usr/bin/env bash`
- `[ -x deploy/generate-dev-cert.sh ]` 為 true(executable)

---

## Entity 2: `deploy/dev-certs/` 目錄

**意義**:cert 落地點;Hybrid 偵測 / 4 cert 檔輸出 / `.gitkeep` 保留目錄存在。

**Properties**:

| Field | Value |
|---|---|
| Path | `deploy/dev-certs/`(workspace root 相對)|
| Tracked file | `.gitkeep`(空檔,git track,確保目錄在 fresh clone 後存在)|
| Ignored content | 所有其他檔(`ca.pem` / `ca.key` / `fullchain.pem` / `privkey.pem` 等)|
| Ownership | `script user`(host bash 跑者)或 `root`(docker container 寫入 host bind mount;WSL2 / Linux 慣例)|

**Validation**:
- `[ -d deploy/dev-certs ]` true
- `git ls-files deploy/dev-certs/` 結果 = `deploy/dev-certs/.gitkeep`(僅 `.gitkeep` tracked,SC-005)
- `git status --short deploy/dev-certs/` 結果為空(無 untracked,SC-005)

---

## Entity 3: `ca.pem`(CA Certificate)

**意義**:leaf cert 的 signer;自簽路線 = self-signed root CA / 外部 CA 路線 = user 預放(可為 root 或 intermediate)。

**Properties**:

| Field | Value(自簽路線)| Value(外部 CA 路線)|
|---|---|---|
| Source | script 自生 | user 預放(`myca.crt` rename)|
| Format | PEM X.509 certificate | PEM X.509 certificate |
| Key type | RSA 2048(對應 `ca.key`)| 由 user 決定(常見 RSA 2048 / 4096)|
| Subject | `CN=rev2-admin-root dev CA` | 由 user 決定(常見 `CN=My CA`)|
| validity | 3650 天(10 年)| 由 user 決定 |
| Extensions | `basicConstraints=critical,CA:TRUE` + `keyUsage=critical,keyCertSign,cRLSign` | 由 user 決定(intermediate 或 root)|
| Role in chain | self-signed root | root 或 intermediate(若為 intermediate,真 root 由 user 另在 OS trust)|

**Validation**:
- 自簽:`openssl x509 -in ca.pem -noout -subject` → `subject=CN = rev2-admin-root dev CA`
- 任何路線:`openssl x509 -in ca.pem -noout -ext basicConstraints` 含 `CA:TRUE`
- gitignored(FR-020,雖非 SECRET 但對齊 dev-certs/ 全 ignore 紀律)

---

## Entity 4: `ca.key`(CA Private Key)

**意義**:`ca.pem` 對應的私鑰;leaf cert sign 操作的 `-CAkey` input。

**Properties**:

| Field | Value(自簽路線)| Value(外部 CA 路線)|
|---|---|---|
| Source | script 自生(`genrsa -out ca.key 2048`)| user 預放(`myca.key` 或解密後的 `.enc` rename)|
| Format | PEM RSA private key(plain,未加密)| PEM RSA private key **必須 plain**(未加密)|
| Key size | 2048 bits | 由 user 決定(常見 2048 / 4096)|
| Security | **SECRET**(永不 git track) | **SECRET**(同上)|
| Constraint | 對應 `ca.pem` 的公鑰 | 對應 user `ca.pem` 的公鑰 |

**Validation**:
- `openssl rsa -in ca.key -noout -check` 回 `RSA key ok`(plain key、無 passphrase block)
- 對應驗:`openssl x509 -in ca.pem -noout -modulus | openssl md5` == `openssl rsa -in ca.key -noout -modulus | openssl md5`(public key match)
- gitignored(FR-020,SECRET)

**Constraint on Hybrid 路線**:外部 CA 路線 user 必須提供 plain `ca.key`(未加密);若加密 → openssl 在 non-interactive container 內會 prompt passphrase 但無 stdin → script fail(Edge Case 已涵蓋)

---

## Entity 5: `fullchain.pem`(Leaf Certificate Chain)

**意義**:nginx `ssl_certificate` directive input;對齊 let's encrypt / acme `fullchain.pem` 慣例。

**Properties**:

| Field | Value(自簽路線)| Value(外部 CA 路線)|
|---|---|---|
| Source | script 出(leaf cert 單獨,from `leaf-only.pem` cp)| script 出(`cat leaf-only.pem ca.pem`)|
| Format | PEM X.509 certificate(1 個 BEGIN CERTIFICATE block)| PEM X.509 certificate chain(2 個 BEGIN CERTIFICATE block:leaf + intermediate)|
| Key type | RSA 2048(對應 `privkey.pem`)| 同左 |
| Subject | `CN=localhost` | 同左(leaf 由 script 簽,Subject 與 SAN 由 script 決定)|
| SAN | `DNS:localhost,IP:127.0.0.1` | 同左 |
| validity | 365 天(1 年)| 同左 |
| Extensions | `basicConstraints=critical,CA:FALSE` + `keyUsage=critical,digitalSignature,keyEncipherment` + `extendedKeyUsage=serverAuth` | 同左 |
| Issuer | `CN=rev2-admin-root dev CA`(self-signed root)| user `ca.pem` 的 Subject(常見 `CN=My CA`)|

**Validation**:
- `openssl x509 -in fullchain.pem -noout -subject` → `subject=CN = localhost`
- `openssl x509 -in fullchain.pem -noout -ext subjectAltName` 含 `DNS:localhost, IP Address:127.0.0.1`
- `openssl verify -CAfile ca.pem fullchain.pem` → `fullchain.pem: OK`(SC-003)
- `grep -c "BEGIN CERTIFICATE" fullchain.pem`:自簽 = 1 / 外部 CA = 2(SC-004)
- gitignored(FR-020,雖非 SECRET 但對齊 dev-certs/ 全 ignore 紀律)

---

## Entity 6: `privkey.pem`(Leaf Private Key)

**意義**:`fullchain.pem` 對應的私鑰;nginx `ssl_certificate_key` directive input。

**Properties**:

| Field | Value |
|---|---|
| Source | script 自生(`genrsa -out privkey.pem 2048`)|
| Format | PEM RSA private key(plain,未加密)|
| Key size | 2048 bits |
| Security | **SECRET**(永不 git track)|

**Validation**:
- `openssl rsa -in privkey.pem -noout -check` 回 `RSA key ok`
- 對應驗:`openssl x509 -in fullchain.pem -noout -modulus | openssl md5` == `openssl rsa -in privkey.pem -noout -modulus | openssl md5`
- gitignored(FR-020,SECRET)

---

## Hybrid CA 偵測 — State Transition

```
┌─────────────────────────────────────────┐
│ script 啟動                              │
│ SCRIPT_DIR / CERT_DIR 解析              │
│ mkdir -p $CERT_DIR                       │
└─────────────────┬───────────────────────┘
                  │
                  ▼
        ┌─────────────────────────┐
        │ 偵測:ca.pem + ca.key   │
        │ 兩檔 同時 存在?         │
        └──────┬──────────┬───────┘
           YES │          │ NO
               ▼          ▼
       ┌──────────────┐  ┌──────────────────┐
       │ EXTERNAL_CA  │  │ EXTERNAL_CA      │
       │ = 1          │  │ = 0              │
       │              │  │                  │
       │ 印「📌 偵測  │  │ (不印偵測訊息)  │
       │ 到外部 CA」  │  │                  │
       └──────┬───────┘  └────────┬─────────┘
              │                   │
              └─────────┬─────────┘
                        ▼
              ┌─────────────────────────┐
              │ 偵測:fullchain.pem 已存?│
              │ AND FORCE = 0?          │
              └──────┬──────────┬───────┘
                YES  │          │ NO
                     ▼          ▼
            ┌─────────────┐  ┌─────────────────┐
            │ exit 1      │  │ (繼續)         │
            │ 印錯誤訊息  │  │                 │
            └─────────────┘  └────────┬────────┘
                                      │
                              ┌───────┴────────┐
                          EXT │              SELF
                              │                │
                              ▼                ▼
                       ┌──────────┐    ┌─────────────────┐
                       │ 跳 Step 1│    │ Step 1: 生 CA   │
                       │          │    │ - ca.key (RSA   │
                       │          │    │   2048)          │
                       │          │    │ - ca.pem (x509  │
                       │          │    │   self-signed,  │
                       │          │    │   10 年, CA:TRUE)│
                       └────┬─────┘    └───────┬─────────┘
                            │                  │
                            └────────┬─────────┘
                                     ▼
                       ┌────────────────────────────┐
                       │ Step 2: 生 leaf cert       │
                       │ - privkey.pem (RSA 2048)   │
                       │ - leaf.csr (CSR)           │
                       │ - leaf-only.pem (x509,     │
                       │   1 年, CA:FALSE, SAN     │
                       │   localhost+127.0.0.1)    │
                       └────────────┬───────────────┘
                                    │
                            ┌───────┴────────┐
                        EXT │              SELF
                            ▼                ▼
                ┌────────────────────┐  ┌────────────────────┐
                │ fullchain.pem =    │  │ fullchain.pem =    │
                │   leaf+ca concat   │  │   leaf only (cp)   │
                └─────────┬──────────┘  └─────────┬──────────┘
                          │                       │
                          └───────────┬───────────┘
                                      ▼
                          ┌──────────────────────────┐
                          │ rm leaf.csr / ca.srl /   │
                          │    leaf-only.pem (暫存)  │
                          └────────────┬─────────────┘
                                       ▼
                          ┌──────────────────────────┐
                          │ print:                   │
                          │ - ✅ cert 生成完成        │
                          │ - 4 檔 list + 標記        │
                          │ - 外部:print trust 提醒  │
                          │ - 自簽:print 3 OS 教學  │
                          └──────────────────────────┘
```

---

## 跨 entity 關係

```
deploy/generate-dev-cert.sh
  └─ uses docker run alpine/openssl
      └─ writes to deploy/dev-certs/ (bind mount)
          ├─ ca.pem ── signs ──┐
          ├─ ca.key ── used in ┤
          │                     ▼
          ├─ fullchain.pem  ◄── (cat leaf-only.pem + maybe ca.pem)
          ├─ privkey.pem    ◄── (genrsa, paired with fullchain.pem)
          └─ .gitkeep (tracked, others ignored)

deploy/dev-certs/{fullchain,privkey}.pem
  └─ consumed by (out of scope, Phase 1 #4):
      └─ front-nginx container (mount as /etc/nginx/certs/)
          └─ nginx TLS server block
              └─ listen 21443 ssl (HTTPS)
                  └─ HTTP 21080 → HTTPS 21443 redirect

.gitignore
  └─ entries:
      ├─ deploy/dev-certs/*       (排除全部內容)
      └─ !deploy/dev-certs/.gitkeep  (豁免 .gitkeep tracked)
```
