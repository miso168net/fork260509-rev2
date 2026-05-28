# Quickstart: tls-dev-cert

> 「dev TLS cert 生成 skeleton」單頁指南。
> 詳細設計見 [plan.md](./plan.md);驗收細節見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

---

## 前置

- WSL2 / macOS / Linux + bash 4+
- docker 23+(host)
- 從 `rev2-admin-root` repo clone(本 feature 修 `deploy/` + `.gitignore`)
- 當前在 feature branch `003-tls-dev-cert`
- 001 dockerfile-rust-api + 002 dockerfile-base-web 已落地(`deploy/Dockerfile.*.txt` + `deploy/secrets/` 不動)

---

## Path A — 自簽路線 happy path(預設,4 檔生)

```bash
# 從 workspace root,clean slate
rm -rf deploy/dev-certs/*
touch deploy/dev-certs/.gitkeep

# 跑 script(zero arg)
bash deploy/generate-dev-cert.sh

# 預期:
# - 印「=== Step 1/2: 生 CA (RSA 2048, 10 年) ===」
# - 印「=== Step 2: 生 leaf cert (RSA 2048, 1 年, SAN localhost+127.0.0.1) ===」
# - 印「✅ cert 生成完成,fullchain 結構:leaf only(自簽 root = ca.pem,browser trust ca.pem 即可)」
# - 印 3 OS trust 教學(Windows 11 / macOS / Linux)
# - 4 檔在 deploy/dev-certs/: ca.pem / ca.key / fullchain.pem / privkey.pem
```

驗證:

```bash
# 4 檔存在
ls -la deploy/dev-certs/

# cert content(SAN + Issuer + validity)
docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl \
    x509 -in fullchain.pem -noout -text | \
    grep -E "Issuer:|Subject:|DNS:localhost|IP Address:127.0.0.1|Not After"
# 預期:
#   Issuer: CN = rev2-admin-root dev CA
#   Subject: CN = localhost
#   DNS:localhost, IP Address:127.0.0.1
#   Not After: 一年後日期

# chain verify
docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl \
    verify -CAfile ca.pem fullchain.pem
# 預期: fullchain.pem: OK
```

OS trust(按 script 印的教學跑):

```bash
# Windows 11
certutil -addstore -user Root deploy/dev-certs/ca.pem

# macOS
sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain deploy/dev-certs/ca.pem

# Linux (Debian/Ubuntu)
sudo cp deploy/dev-certs/ca.pem /usr/local/share/ca-certificates/rev2-dev-ca.crt
sudo update-ca-certificates
```

---

## Path B — 冪等性 + `--force` renew

```bash
# 第二次跑(無 --force)— 預期 exit 1
bash deploy/generate-dev-cert.sh
# 預期:
#   ❌ /path/to/deploy/dev-certs/fullchain.pem 已存在。要強制重生 leaf 加 --force
#      (--force 純自簽路線會一併覆寫 ca.pem + ca.key)
#   exit 1

# --force 跑(自簽路線 — 4 檔全覆寫)
bash deploy/generate-dev-cert.sh --force
# 預期: 4 檔重生
```

---

## Path C — Hybrid 外部 CA 路線(user 帶既有 myca)

```bash
# 預先把外部 CA cert + plain key 放進 deploy/dev-certs/
# 命名規則:必須叫 ca.pem 與 ca.key
# 若你 CA key 是 AES256 加密(如 myca.enc),先解出 plain:
#   openssl rsa -in myca.enc -out deploy/dev-certs/ca.key -passin env:SSL_MYCA_PASS

cp /path/to/myca.crt deploy/dev-certs/ca.pem
cp /path/to/myca.key deploy/dev-certs/ca.key  # plain version

# clean leaf + self-signed-marker(否則 script 仍視 ca.* 為自簽生、不會走外部 CA 路線)
rm -f deploy/dev-certs/{fullchain.pem,privkey.pem,self-signed-marker}

# 跑 script(會偵測外部 CA)
bash deploy/generate-dev-cert.sh

# 預期:
# - 印「📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key,無 self-signed-marker)— 跳 Step 1、直接用外部 CA 簽 leaf」
# - 印「=== Step 2: 生 leaf cert ... ===」(無 Step 1)
# - 印「✅ cert 生成完成,fullchain 結構:leaf + intermediate(外部 CA,對齊 acme chain)」
# - 印「★ 你用了外部 CA,本 script 假設你已 trust 該 CA 的 root」提醒段(不印 3 OS trust 教學)
# - ca.pem / ca.key bytes 不變(SC-007),新生 fullchain.pem + privkey.pem
```

驗證:

```bash
# fullchain.pem 含 2 個 BEGIN CERTIFICATE block(leaf + intermediate)
grep -c "BEGIN CERTIFICATE" deploy/dev-certs/fullchain.pem
# 預期: 2

# chain verify(用外部 ca.pem)
docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl \
    verify -CAfile ca.pem fullchain.pem
# 預期: fullchain.pem: OK

# --force 只覆寫 leaf 2 檔
md5_ca=$(md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key)
bash deploy/generate-dev-cert.sh --force
md5_ca_after=$(md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key)
[ "$md5_ca" = "$md5_ca_after" ] && echo "PASS: ca.* bytes 不變"
```

---

## Path D — gitignore 紀律驗

```bash
# 跑完任何路線後
git status --short deploy/dev-certs/
# 預期: 空(4 個 cert/key 全 ignored)

git ls-files deploy/dev-certs/
# 預期: deploy/dev-certs/.gitkeep(只 .gitkeep tracked)

# 嘗試 git add 私鑰、確認 gitignore 阻擋
git add deploy/dev-certs/ca.key 2>&1 | head -1
# 預期: 印 hint「The following paths are ignored by one of your .gitignore files」
```

---

## Troubleshooting

| 症狀 | 處置 |
|---|---|
| `docker pull alpine/openssl` 卡住 | 檢查網路;script 第一行 `docker pull -q` 不 ignore 失敗 |
| 跑完 `openssl x509 -in fullchain.pem -noout -text` 找不到 SAN | 檢查 Dockerfile heredoc `subjectAltName=DNS:localhost,IP:127.0.0.1` 拼寫;openssl 對 ext 名稱拼寫嚴格 |
| `openssl verify -CAfile ca.pem fullchain.pem` 回 `unable to get local issuer certificate` | 外部 CA 路線下,`ca.pem` 須是 leaf 的 direct Issuer;若 user 把 root 放當 ca.pem 但 myca chain 中間還有 intermediate → verify fail。確認 ca.pem 即 leaf 的 signer |
| `bash deploy/generate-dev-cert.sh --force` 後 ca.* 還是被覆蓋(外部 CA 路線預期不動) | 確認 `deploy/dev-certs/ca.pem` + `deploy/dev-certs/ca.key` 都存在(只放一檔會走自簽、覆蓋)+ **`deploy/dev-certs/self-signed-marker` 不存在**(marker 存在 → script 視 ca.* 為自簽生、--force 一併重生);切外部 CA 前 `rm -f deploy/dev-certs/self-signed-marker` |
| `git add -A` 之後 cert/key 被 stage | 檢查 `.gitignore` 是否真有 `deploy/dev-certs/*` + `!deploy/dev-certs/.gitkeep` 兩行,順序對 |
| `ca.key` 是 AES256 加密、Hybrid 路線 fail | 先手動解出 plain:`openssl rsa -in myca.enc -out deploy/dev-certs/ca.key -passin env:SSL_MYCA_PASS` |
| Edge browser 開 `https://localhost` 仍 NET::ERR_CERT_AUTHORITY_INVALID | 確認 ca.pem 已 trust(Win11: `certutil -addstore -user Root deploy/dev-certs/ca.pem`);Chrome / Edge 共用 OS root store |

---

## 下一步

- 跑完上述 Path A-D → 本 feature MVP 達成
- Phase 1 #4 容器 port 與編排 feature 啟動時:wire `deploy/dev-certs/` mount 進 front-nginx container + nginx TLS server block(listen 21443 ssl + ssl_certificate /etc/nginx/certs/fullchain.pem)+ HTTP 21080 → HTTPS 21443 redirect。詳見 [research.md §8](./research.md)
- 實作走 `superpowers:executing-plans`(**不**用 `/speckit-implement`,對齊 CLAUDE.md §3 紀律)
