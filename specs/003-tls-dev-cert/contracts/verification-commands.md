# Contract: Verification commands(C-V acceptance)

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **CLAUDE.md §3 紀律提醒**:本 feature 屬「shell script + cert generation 配置 + gitignore」,**無新純函式邏輯**(全 wiring + 配置)。整體 feature 由本 C-V contract 覆蓋驗收;`tasks.md` 與 `plan.md` 明示「無單元測試,由 acceptance commands 覆蓋」及理由。

---

## §1 自簽路線 happy path(US1 Acceptance 1-3 + SC-001/SC-002/SC-003)

```bash
# clean slate
rm -rf deploy/dev-certs/*
touch deploy/dev-certs/.gitkeep

# 第一次跑(預期 < 30s 首次 / < 10s cache)
time bash deploy/generate-dev-cert.sh
# 預期: 印「✅ cert 生成完成,fullchain 結構:leaf only(自簽 root = ca.pem,browser trust ca.pem 即可)」
#       + 3 OS trust 教學段
#       + 4 檔 ls 顯示

# (a) 4 檔存在驗
ls -la deploy/dev-certs/
# 預期: .gitkeep + ca.pem + ca.key + fullchain.pem + privkey.pem

# (b) cert content 驗(SAN / Issuer / Subject / validity,SC-002)
docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl \
    x509 -in fullchain.pem -noout -text | \
    grep -E "Issuer:|Subject:|DNS:localhost|IP Address:127.0.0.1|Not After"
# 預期:
#   Issuer: CN = rev2-admin-root dev CA
#   Subject: CN = localhost
#   DNS:localhost, IP Address:127.0.0.1
#   Not After : <1 年後日期>

# (c) chain verify(SC-003)
docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl \
    verify -CAfile ca.pem fullchain.pem
# 預期: fullchain.pem: OK
```

---

## §2 `--force` idempotency(US1 Acceptance 4-5 + SC-006)

```bash
# 第二次無 --force 跑(預期 exit 1)
bash deploy/generate-dev-cert.sh
echo "exit: $?"
# 預期: 印「❌ fullchain.pem 已存在。要強制重生 leaf 加 --force」
#       + 區分自簽/外部 CA 兩種 --force 行為提示
#       exit: 1

# --force 跑(自簽路線覆寫全 4 檔)
bash deploy/generate-dev-cert.sh --force
echo "exit: $?"
# 預期: 4 檔重生,exit: 0

# 驗 mtime 全 4 檔都更新
ls -la --time=modify deploy/dev-certs/{ca.pem,ca.key,fullchain.pem,privkey.pem}
# 預期: 4 檔 mtime 都是「剛剛」
```

---

## §3 Hybrid 外部 CA 路線(US2 Acceptance 1-4 + SC-004 + SC-007)

```bash
# 借自簽生的 CA 模擬「外部 CA」(真實 wire user 自帶 myca)
cp deploy/dev-certs/ca.pem /tmp/ext-ca.pem
cp deploy/dev-certs/ca.key /tmp/ext-ca.key
md5sum /tmp/ext-ca.pem /tmp/ext-ca.key

# clean slate + 預放外部 CA
rm -rf deploy/dev-certs/*
touch deploy/dev-certs/.gitkeep
cp /tmp/ext-ca.pem deploy/dev-certs/ca.pem
cp /tmp/ext-ca.key deploy/dev-certs/ca.key

# 跑 script(預期偵測外部 CA、跳 Step 1)
bash deploy/generate-dev-cert.sh
# 預期: 印「📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key)— 跳 Step 1、直接用外部 CA 簽 leaf」
#       + 只跑 Step 2
#       + 印外部 CA 提醒段(不印 3 OS trust 教學)

# (a) 4 檔存在驗,但 ca.* bytes 不變(SC-007)
ls -la deploy/dev-certs/
md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key
# 預期 md5sum 與 /tmp/ext-ca.* 一致(bytes 不變)

# (b) fullchain.pem 含 2 個 BEGIN CERTIFICATE block(SC-004)
grep -c "BEGIN CERTIFICATE" deploy/dev-certs/fullchain.pem
# 預期: 2

# (c) chain verify(SC-003,外部 CA 路線亦適用)
docker run --rm -v "$PWD/deploy/dev-certs:/c" -w /c alpine/openssl \
    verify -CAfile ca.pem fullchain.pem
# 預期: fullchain.pem: OK

# (d) --force 外部 CA 路線只覆寫 leaf 2 檔(SC-007)
md5_ca_before=$(md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key)
bash deploy/generate-dev-cert.sh --force
md5_ca_after=$(md5sum deploy/dev-certs/ca.pem deploy/dev-certs/ca.key)
[ "$md5_ca_before" = "$md5_ca_after" ] && echo "PASS: ca.* bytes 不變" || echo "FAIL"
# 預期: PASS
```

---

## §4 gitignore 紀律驗證(US3 Acceptance 1-3 + SC-005)

```bash
# 跑完任何路線後,deploy/dev-certs/ 4 檔在內
git status --short deploy/dev-certs/
# 預期: 空(4 個 cert/key 全被 ignored、不顯示為 untracked)

git ls-files deploy/dev-certs/
# 預期: deploy/dev-certs/.gitkeep(只 .gitkeep tracked)

# 嘗試 git add -A、驗證仍只 .gitkeep
git add -A
git diff --cached --stat deploy/dev-certs/
# 預期: 空(無新 stage;.gitkeep 已 tracked、無 diff)
git restore --staged deploy/dev-certs/ 2>/dev/null

# 嘗試 git add 單檔顯式(預期 gitignore 阻擋)
git add deploy/dev-certs/ca.key 2>&1 | head -1
# 預期: 印 hint「The following paths are ignored by one of your .gitignore files: deploy/dev-certs/ca.key」+ exit 1
```

---

## §5 trust 教學印驗證(FR-015 / FR-016)

```bash
# 自簽路線:預期印 3 OS trust 教學
rm -rf deploy/dev-certs/* && touch deploy/dev-certs/.gitkeep
bash deploy/generate-dev-cert.sh 2>&1 | grep -c "Windows 11\|macOS\|Linux (Debian/Ubuntu)"
# 預期: ≥ 3

# 外部 CA 路線:預期印「假設你已 trust」提醒、不印 3 OS trust 教學
cp /tmp/ext-ca.pem deploy/dev-certs/ca.pem
cp /tmp/ext-ca.key deploy/dev-certs/ca.key
rm -f deploy/dev-certs/{fullchain.pem,privkey.pem}
bash deploy/generate-dev-cert.sh 2>&1 | grep -c "假設你已 trust 該 CA 的 root"
# 預期: ≥ 1
bash deploy/generate-dev-cert.sh 2>&1 | grep -c "certutil -addstore"
# 預期: 0(外部 CA 路線不印 Windows 教學)
```

---

## §6 Constitution Compliance 自我覆查(對應 plan Constitution Re-Check)

```bash
# (1) rust-api 完全不動(本 feature scope 不含)
git -C rust-api status --short
# 預期: 空

# (2) base-web 完全不動(本 feature scope 不含)
git -C base-web status --short
# 預期: 空

# (3) workspace deploy/ 改動:本 feature 限新增 script + dir + .gitignore append
git diff --name-only HEAD
# 預期: 含 deploy/generate-dev-cert.sh + deploy/dev-certs/.gitkeep + .gitignore;**不**含 docker-compose.*.yml / deploy/Dockerfile.*.txt / CLAUDE.md

# (4) plan Constitution Check 7 項對照
grep -c "✅ Pass" specs/003-tls-dev-cert/plan.md
# 預期: ≥ 14(7 in Constitution Check + 7 in Constitution Re-Check)
```

---

## 驗收紀律總結

- §1 自簽路線 happy path(US1 Acceptance 1-3 + SC-001/002/003)
- §2 `--force` idempotency(US1 Acceptance 4-5 + SC-006)
- §3 Hybrid 外部 CA 路線(US2 Acceptance 1-4 + SC-004 + SC-007)
- §4 gitignore 紀律驗證(US3 Acceptance 1-3 + SC-005)
- §5 trust 教學印驗證(FR-015 / FR-016)
- §6 Constitution Compliance 自我覆查(plan Re-Check)

`tasks.md` 階段需把以上 §1-§6 排程進 task 內、對應到 spec 各 acceptance scenario 與 SC。
