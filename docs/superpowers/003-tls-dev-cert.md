# 003 · tls-dev-cert

> rev2 第三個 spec-kit feature 的 Phase 0 brainstorm spec-design。
> 對應 DESIGN §10 Phase 1 #3(TLS 憑證 skeleton feature)+ [CLAUDE.md §8.2](../../CLAUDE.md) dev 自簽 cert 規劃。
> Phase 1 部署基建的第三片拼圖 — `front-nginx` HTTPS 服務的 cert 來源,留 #4 容器 port 與編排 feature wire 進 master compose。

---

## 1. Intro

**問題**:`CLAUDE.md §8.2` 規劃 dev 啟動模式為 HTTP `:21080` + HTTPS `:21443`(自簽 cert),但 `deploy/generate-dev-cert.sh` 與 `deploy/dev-certs/` 結構**尚未落地** ⏳(CHECKLIST §2.3 標記)。本 feature 補這片:`deploy/generate-dev-cert.sh` zero-arg script + `deploy/dev-certs/` 目錄 + gitignore 紀律,讓 dev 開發者跑一次 `bash deploy/generate-dev-cert.sh` 即可拿到 nginx 可用的 4 檔 cert/key。

**scope 邊界**(brainstorm §2 拍板):**只交 cert 生成腳本 + 目錄結構**;**不**含 nginx TLS conf、**不**含 front-nginx service、**不**含實機 HTTPS 驗證 — 全留 #4 容器 port 與編排 feature。

**design 主軸**:全 docker 化(host 只需 docker、無 openssl dep)+ Hybrid CA(支援自簽 root 或外部 CA 兩條 path)+ RSA 2048 + 4 檔輸出對齊 acme/let's encrypt 命名慣例。

---

## 2. brainstorm 5 拍板項(收斂順序)

| # | 維度 | 拍板 | 理由 |
|---|---|---|---|
| 1 | scope 邊界 | **A. 最小** — cert script + 目錄 + gitignore | 對齊 §1 「skeleton」字義 + #4 整套 stack 是 nginx conf 的天然落點(避重複) |
| 2 | cert 工具執行 | **B. alpine/openssl container** | host 只 docker dep、對齊 000/001/002「全 docker 化、host 不裝額外工具」哲學;成本 ~5s pull image / 決定性高 |
| 3 | cert SAN | **A. localhost + 127.0.0.1** | 對齊 §8.2.1 引用的 `curl https://127.0.0.1:21443` + browser `https://localhost`;Win11 22H2+ mirrored networking 預設 127.0.0.1 可用、WSL IP / wildcard 為 YAGNI |
| 4 | cert 結構 | **B. CA + leaf chain** | daily dev 體驗 — trust 一次 CA 後 browser 不 warn;對齊 mkcert / let's encrypt chain 形式 |
| 5 | cert 有效期 | **A. CA 10 年 + leaf 1 年** | CA 久(避免每年 trust 新 root)+ leaf 短(對齊 §8.2.1 「每年 renew」註解 + Apple Safari ≤ 397 天上限) |

**追加拍板**:
- **6. CA source 模式**:**C. Hybrid**(偵測 `dev-certs/ca.pem` + `ca.key` 存在 → 用外部 CA 簽 leaf;否則自簽)— user 帶 myca 用免 trust 新 root;其他 dev clone 仍 portable
- **7. key algorithm**:**RSA 2048**(user 偏好 / 跨平台廣相容;EC P-256 雖更 modern 但 user 既有工具鏈走 RSA)
- **8. fullchain 結構**:外部 CA 路線 = leaf + ca.pem concat(對齊 acme chain);自簽路線 = leaf only(root = ca.pem,browser trust ca.pem 即驗)

---

## 3. 凍結摘要(spec/plan 階段 input)

本 feature 落地後:
- **新增**:`deploy/generate-dev-cert.sh`(zero-arg + `--force` flag)+ `deploy/dev-certs/.gitkeep`
- **新增 gitignore**:`.gitignore` 加 `deploy/dev-certs/*` + `!deploy/dev-certs/.gitkeep`
- **不動**:`base-web/`、`rust-api/`、`docker-compose.base-web.yml`、`docker-compose.rust-api.yml`、`deploy/Dockerfile.*.txt`、`deploy/secrets/`、CLAUDE.md
- **無 unit test**(全 shell + cert gen 配置)— acceptance 由 6 個 C-V command 覆蓋(本檔 §6)
- **單一檔案 Dockerfile/compose 變動**:0(本 feature 純新增 + gitignore)

---

## 4. 檔案結構

```text
deploy/
├── generate-dev-cert.sh   ← 本 feature 新增(zero-arg / --force / Hybrid 偵測)
└── dev-certs/             ← 本 feature 新增(.gitkeep + 內容 gitignored)
    ├── .gitkeep           ← 追蹤目錄存在
    │
    │ -- 純自簽路線(無前置)後產出 4 檔 --
    ├── ca.pem             ← script 自生 / gitignored(自簽 root)
    ├── ca.key             ← script 自生 / gitignored(SECRET)
    │
    │ -- 外部 CA 路線(user 預放 2 檔)+ script 補 leaf 2 檔 --
    ├── ca.pem             ← user 預放(myca.crt rename;intermediate 或 root 皆可)/ gitignored
    ├── ca.key             ← user 預放(myca.key plain rename)/ gitignored(SECRET)
    │
    │ -- 兩路線都產 --
    ├── fullchain.pem      ← script 出 / gitignored(對齊 acme/let's encrypt 命名)
    └── privkey.pem        ← script 出 / gitignored(SECRET,對齊 §8.2.1 引用)
```

**`.gitignore` 加(workspace root 既有檔)**:
```
# dev TLS cert(feature 003-tls-dev-cert,內容全 ignore、保留 .gitkeep)
deploy/dev-certs/*
!deploy/dev-certs/.gitkeep
```

---

## 5. `generate-dev-cert.sh` 邏輯

```bash
#!/usr/bin/env bash
# rev2 dev TLS 自簽 cert 生成 — feature 003-tls-dev-cert
# 用法:bash deploy/generate-dev-cert.sh [--force]
#
# Hybrid 模式:
#   - 若 deploy/dev-certs/ca.pem + ca.key 已存在 → 跳 Step 1、用外部 CA 簽 leaf
#   - 否則 → 自簽 root CA(Step 1)+ 簽 leaf(Step 2)
#
# 設計:
# - 全跑 alpine/openssl docker container,host 只需 docker
# - RSA 2048 / SAN localhost+127.0.0.1
# - 外部 CA 路線:fullchain.pem = leaf + intermediate(對齊 acme chain)
# - 自簽路線:fullchain.pem = leaf only(root 已是 ca.pem)
#
# ★ 外部 CA 規則:
#   - ca.key 必須 plain(未加密)— 若你 CA key 是 AES256 加密,先解出 plain:
#     openssl rsa -in myca.enc -out deploy/dev-certs/ca.key -passin env:SSL_MYCA_PASS
#   - ca.pem 可為 root 或 intermediate(intermediate 情況 fullchain 會 cat 進去,
#     但 root 不會 — 你自己另在 OS 把 root trust)

set -euo pipefail

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/dev-certs"
mkdir -p "$CERT_DIR"

# 偵測外部 CA
EXTERNAL_CA=0
if [ -f "$CERT_DIR/ca.pem" ] && [ -f "$CERT_DIR/ca.key" ]; then
    EXTERNAL_CA=1
    echo "📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key)— 跳 Step 1、直接用外部 CA 簽 leaf"
fi

# 已有 leaf?
if [ -f "$CERT_DIR/fullchain.pem" ] && [ "$FORCE" -eq 0 ]; then
    echo "❌ $CERT_DIR/fullchain.pem 已存在。要強制重生 leaf 加 --force"
    [ "$EXTERNAL_CA" -eq 0 ] && echo "   (--force 純自簽路線會一併覆寫 ca.pem + ca.key)"
    [ "$EXTERNAL_CA" -eq 1 ] && echo "   (--force 外部 CA 路線只覆寫 leaf,不動 ca.*)"
    exit 1
fi

OPENSSL_IMG="alpine/openssl:latest"
docker pull -q "$OPENSSL_IMG" >/dev/null

run_openssl() {
    docker run --rm -v "$CERT_DIR:/certs" -w /certs "$OPENSSL_IMG" "$@"
}

# Step 1: 生 CA (僅自簽路線)
if [ "$EXTERNAL_CA" -eq 0 ]; then
    echo "=== Step 1/2: 生 CA (RSA 2048, 10 年) ==="
    run_openssl genrsa -out ca.key 2048
    run_openssl req -new -x509 -key ca.key -days 3650 -out ca.pem \
        -subj "/CN=rev2-admin-root dev CA" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,cRLSign"
fi

# Step 2: 用 CA 簽 leaf (always)
echo "=== Step 2: 生 leaf cert (RSA 2048, 1 年, SAN localhost+127.0.0.1) ==="
run_openssl genrsa -out privkey.pem 2048
run_openssl req -new -key privkey.pem -out leaf.csr \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
run_openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
    -days 365 -out leaf-only.pem -extfile /dev/stdin <<EXT
subjectAltName=DNS:localhost,IP:127.0.0.1
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EXT

# fullchain.pem 組合
if [ "$EXTERNAL_CA" -eq 1 ]; then
    cat "$CERT_DIR/leaf-only.pem" "$CERT_DIR/ca.pem" > "$CERT_DIR/fullchain.pem"
    CHAIN_MSG="leaf + intermediate(外部 CA,對齊 acme chain)"
else
    cp "$CERT_DIR/leaf-only.pem" "$CERT_DIR/fullchain.pem"
    CHAIN_MSG="leaf only(自簽 root = ca.pem,browser trust ca.pem 即可)"
fi
rm -f "$CERT_DIR/leaf.csr" "$CERT_DIR/ca.srl" "$CERT_DIR/leaf-only.pem"

# 收尾 + 教學
cat <<EOF

✅ cert 生成完成,fullchain 結構:$CHAIN_MSG
   $CERT_DIR/ca.pem        ($([ "$EXTERNAL_CA" -eq 1 ] && echo "外部 CA、未動" || echo "自簽 root、要 trust"))
   $CERT_DIR/ca.key        (SECRET,別洩漏)
   $CERT_DIR/fullchain.pem (nginx 用 / $CHAIN_MSG)
   $CERT_DIR/privkey.pem   (SECRET,別洩漏)

EOF

if [ "$EXTERNAL_CA" -eq 0 ]; then
    cat <<TRUST

★ 把 ca.pem trust 進 OS / browser 才不會跳 NET::ERR_CERT_AUTHORITY_INVALID:

[Windows 11 (Edge/Chrome 共用 OS root store)]
  certutil -addstore -user Root deploy/dev-certs/ca.pem

[macOS]
  sudo security add-trusted-cert -d -r trustRoot \\
      -k /Library/Keychains/System.keychain deploy/dev-certs/ca.pem

[Linux (Debian/Ubuntu)]
  sudo cp deploy/dev-certs/ca.pem /usr/local/share/ca-certificates/rev2-dev-ca.crt
  sudo update-ca-certificates

cert 有效期:CA 10 年 / leaf 1 年。renew 跑 \`--force\`。
TRUST
else
    cat <<TRUST_EXT

★ 你用了外部 CA(deploy/dev-certs/ca.pem),本 script 假設你已 trust 該 CA 的 root。
  若 ca.pem 是 intermediate(非 root),fullchain.pem 已含 intermediate,
  browser 仍需從 OS trust store 找到 root 才驗 chain;確認 root 已 trust。

cert 有效期:leaf 1 年(ca.pem 由你維護)。renew leaf 跑 \`--force\`。
TRUST_EXT
fi
```

---

## 6. Acceptance / verification(C-V contract)

本 feature **無 unit test**(全 shell + cert gen 配置)— acceptance 由 6 個 C-V command 覆蓋(對齊 CLAUDE.md §3 紀律 + 002 verification-commands.md 範本):

```bash
# (1) 純自簽路線 happy path
rm -rf deploy/dev-certs/* && touch deploy/dev-certs/.gitkeep  # clean slate
bash deploy/generate-dev-cert.sh
ls -la deploy/dev-certs/
# 預期: .gitkeep + ca.pem + ca.key + fullchain.pem + privkey.pem

# (2) cert 內容驗(SAN / Issuer / validity)
docker run --rm -v ./deploy/dev-certs:/c -w /c alpine/openssl x509 -in fullchain.pem -noout -text | \
    grep -E "Issuer:|Subject:|DNS:localhost|IP Address:127.0.0.1|Not After"
# 預期: Issuer "rev2-admin-root dev CA" / Subject CN=localhost /
#       SAN 含 DNS:localhost + IP:127.0.0.1 / 1 年後到期

# (3) CA → leaf chain 驗證
docker run --rm -v ./deploy/dev-certs:/c -w /c alpine/openssl verify -CAfile ca.pem fullchain.pem
# 預期: fullchain.pem: OK

# (4) --force idempotency
bash deploy/generate-dev-cert.sh           # 應 exit 1、印「已存在」
bash deploy/generate-dev-cert.sh --force   # 應重生 4 檔成功

# (5) 外部 CA 路線(借自簽 CA 模擬;真實 wire user 自帶 myca)
cp deploy/dev-certs/ca.pem /tmp/ext-ca.pem
cp deploy/dev-certs/ca.key /tmp/ext-ca.key
rm -rf deploy/dev-certs/* && touch deploy/dev-certs/.gitkeep
cp /tmp/ext-ca.pem deploy/dev-certs/ca.pem
cp /tmp/ext-ca.key deploy/dev-certs/ca.key
bash deploy/generate-dev-cert.sh
# 預期: 輸出「📌 偵測到外部 CA」+ 跳 Step 1 + leaf 2 檔出
grep -c "BEGIN CERTIFICATE" deploy/dev-certs/fullchain.pem
# 預期: 2(leaf + ca.pem concat)

# (6) gitignore 紀律驗
git status --short deploy/dev-certs/
# 預期: 空(僅 .gitkeep tracked,4 個 cert/key 全 ignored)
```

---

## 7. 與 §8.2 + 未來 #4 整套 stack 的介面對齊

| 對象 | 本 feature 交什麼 | 留給對方 |
|---|---|---|
| **dev profile**(§8.2 `-f -f dev.yml`) | `deploy/dev-certs/fullchain.pem` + `privkey.pem` 4 檔 | #4 在 master `docker-compose.dev.yml` front-nginx service mount `-v ./deploy/dev-certs:/etc/nginx/certs:ro` + nginx TLS conf `ssl_certificate /etc/nginx/certs/fullchain.pem` |
| **prod baseline**(§8.2 `-f -f prod.yml` 不帶 `--profile prod`) | 同上 4 檔(可手動跑 `docker run alpine cp /src/*.pem /certs/` seed 進 named volume `front_nginx_certs`) | seed 操作歸 #4 / prod 啟動工作流;本 feature **不**處理 named volume seed |
| **prod + acme**(§8.2 `--profile prod`) | 完全不涉(本 feature 純 dev cert) | acme.sh skeleton + `Dockerfile.acme.txt` + DNS provider creds wire 全留 #4 / Phase 1 後續 |

**§8.2.1 命令對齊**:本 feature 完成後,§8.2.1 第一行 `bash deploy/generate-dev-cert.sh` 即可跑(後面的 `docker compose up` + `openssl s_client -connect 127.0.0.1:21443` 等仍需 #4 落地 front-nginx 才能跑)。

---

## 8. Constitution Check 預檢(對照 v1.0.0 §IV 7 項)

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?wire endpoint 不對齊? | N/A — 本 feature 不涉 wire(純 deploy cert) | ✅ Pass |
| 2 | 此 plan 動到 base-web inline? | 否 — 完全不動 base-web/ | ✅ Pass |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | N/A | ✅ Pass |
| 4 | wire 對齊 §I.3 mock ground truth? | N/A | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | 否 — 純新增 + 借鏡 user 既有 myca generation pattern(非 rev1) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項?任一改動需 Amendment? | 全凍結 — 本 feature 不改任何拍板 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 不觸 ★ 軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG 與本 feature 無關);純 workspace-level `deploy/` 改動(對齊 002 deploy/* 屬性、001 deploy/* 屬性) | ✅ Pass |

**結論**:7 項全 PASS、無 violations、Complexity Tracking 不需填。可直接進 `/speckit-specify` → Phase 0 research。

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| `alpine/openssl:latest` 浮動版本未來破壞 reproducibility | 可改 pin 具體 tag(如 `alpine/openssl:3.3`);本 feature 暫用 latest、若日後出問題在 follow-up 處理 |
| user 既有 myca key 是 AES256 加密(`.enc`),script 不接 `-passin` | 文件明示「先手動解出 plain ca.key 再放 deploy/dev-certs/」;script 內不嘗試處理 passphrase(避免 env var 雜訊) |
| 外部 CA 路線:user `ca.pem` 是 intermediate 但忘 trust root → browser 仍 warn | trust 教學第二段(外部 CA 模式)明示「假設你已 trust 該 CA 的 root」;若 user 弄錯,看 NET::ERR_CERT_AUTHORITY_INVALID 即可 debug |
| `dev-certs/` 內容 leak 進 git(私鑰外洩) | `.gitignore` 嚴格 `deploy/dev-certs/*` + `!deploy/dev-certs/.gitkeep`;acceptance §6 (6) 命令 `git status --short deploy/dev-certs/` 預期空 |
| 跨 OS trust 教學命令本身錯 | 三 OS 命令對齊 standard convention(certutil / security / update-ca-certificates),已驗證;若 user 跑出問題視為 follow-up |
| `docker pull alpine/openssl` 首次慢 / 無網路時 fail | script 第一行 `docker pull -q` 不 ignore 失敗;若無網路,user 看 docker error 即知;有 cache 後立即返回 |

---

## 10. Open Questions & 後續 contract

### 10.1 留給 `/speckit-specify` 階段釐清

- spec FR 列表(User Story 1-2)— 本 brainstorm 預列 acceptance 但未拆 FR 編號
- spec User Story 切分(P1 = 自簽路線基線 / P2 = 外部 CA Hybrid / P3 = gitignore 紀律驗)— /speckit-specify 階段定
- 是否需 `/speckit-clarify`?— 本 feature 5+3 拍板已收斂,critical ambiguity 預估無;`/speckit-clarify` 跳過或 dry-run 看

### 10.2 留給後續 feature 的明確 contract

- **Phase 1 #4 容器 port 與編排 feature**:wire `deploy/dev-certs/` mount 進 front-nginx container(`-v ./deploy/dev-certs:/etc/nginx/certs:ro`)+ nginx TLS server block(`listen 21443 ssl;` + `ssl_certificate /etc/nginx/certs/fullchain.pem;` + `ssl_certificate_key /etc/nginx/certs/privkey.pem;`)+ HTTP 21080 → HTTPS 21443 redirect
- **Phase 1 prod baseline seed 流程**:#4 / 啟動 doc 文件化 `docker run --rm -v rev2-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine cp /src/fullchain.pem /src/privkey.pem /certs/`(本 feature 不寫死 seed script)
- **Phase 1 prod + acme**:留 #4 / 後續 — `deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh` + compose `--profile prod` 拉起 acme.sh skeleton(真實 cert acquisition 需公網 + 真 domain + DNS provider creds)
- **長期 maintenance**:cert renew 由 user 手動 `bash deploy/generate-dev-cert.sh --force`;CA 10 年內無 reset 壓力,leaf 1 年到期前 user 自跑 renew

### 10.3 風險與緩解

見 §9。

---

## 11. 交棒給 `/speckit-specify`(階段 1)

本檔(spec-design)完成 + user 審核後 **手動執行** `/speckit-specify`(CLAUDE.md §3 紀律:不可在 brainstorm 內自動觸發,會跳過 `speckit.git.feature` pre-hook、不會自動建 `003-tls-dev-cert` feature branch)。

`/speckit-specify` 階段會:
1. `before_specify` pre-hook(`speckit.git.feature`)從當前 `rev2-admin-root` 自動建 `003-tls-dev-cert` feature branch
2. 從本檔 input 產出 `specs/003-tls-dev-cert/spec.md`(formal spec)
3. 後續 `/speckit-clarify`(optional)→ `/speckit-plan`(對照 `.specify/memory/constitution.md` v1.0.0 跑 Compliance Check)→ `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`

---

**生效**:本檔成立後即為 `003-tls-dev-cert` feature 的 Phase 0 brainstorm 權威;後續 spec / plan / tasks / implementation 任何決策若偏離本檔,需在對應 spec doc 明示理由 + 更新本檔。
