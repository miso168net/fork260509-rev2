# Phase 0 Research: tls-dev-cert

**Status**:6 個 research 主題,全為 best-practice / 行為確認,無 critical 發現偏離 brainstorm。本檔為 brainstorm 8 拍板 + 技術 detail 的 Decision / Rationale / Alternatives consolidation。

---

## 1. `alpine/openssl` docker image 行為

**Decision**:用 `alpine/openssl:latest` 作為 openssl 執行容器;entrypoint = `openssl`(直接傳 subcommand 不需 `openssl` 前綴);bind mount `deploy/dev-certs` → `/certs` 並 `-w /certs` 設 cwd。

**Rationale**:

`alpine/openssl` 是 Docker Hub 上 alpine 基底 + openssl pre-install 的 image,maintainer = openssl 官方周邊。檢驗:
- entrypoint = `openssl`(per image metadata),所以 `docker run alpine/openssl genrsa -out ca.key 2048` 實際執行的是 `openssl genrsa -out ca.key 2048`
- alpine base + openssl 3.x;multi-arch manifest list 支援 amd64 / arm64(WSL2 x86_64 主環境 + Apple Silicon M1/M2 mac 都能跑)
- image size ~ 9 MB(alpine + openssl bin),首次 pull < 5s on broadband
- 與 `nginx:alpine`(002 用)+ `node:20.19-alpine`(000 / 002 用)同生態系,host 已有 cache 可能共用 alpine base layer

**Alternatives considered**:
- **host openssl**(WSL2 預裝)— 拒絕:違反「全 docker 化、host 不裝額外工具」哲學(brainstorm §2 #2 拍板 B);跨 OS 不一致(macOS 默認 LibreSSL 與 OpenSSL CLI 有微差)
- **`smallstep/step-ca` image**(專業 CA 工具)— 拒絕:over-engineer,本 feature 是 dev 自簽 cert、不是企業 CA infrastructure;step-ca 工具鏈複雜度遠超本 feature scope
- **mkcert image**(自動 trust install)— 拒絕:跨 OS trust 自動化會撞 sudo / OS API 邊界,brainstorm 拍板「教學 print only」(FR-024)

**驗證對應**:FR-002(全 docker 化 alpine/openssl)+ SC-001(< 30s 首次)

---

## 2. openssl CLI:CA + leaf chain sign 慣例

**Decision**:3 步 CSR pattern:① `genrsa` 出 leaf 私鑰 → ② `req -new -key ... -out leaf.csr` 出 CSR → ③ `x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out fullchain.pem` 由 CA 簽。CA 本身用 `req -new -x509 -key ca.key` 一步出 self-signed root cert。

**Rationale**:

對齊 user 既有 myca script pattern + OpenSSL Cookbook canonical:
- `genrsa -out X.key 2048` 出 RSA 2048 plain private key(PEM PKCS#1 / PKCS#8 兼容)
- `req -new` 出 Certificate Signing Request(`-subj` 一行帶 Subject DN、`-addext` 帶擴充欄如 SAN)
- `x509 -req -CAcreateserial` 自動生成 `.srl` serial number 檔(本 feature 跑完 rm `ca.srl` 清理 FR-018)
- `-extfile /dev/stdin <<EOF ... EOF` heredoc 傳擴充欄(避免另存 .conf 檔);BuildKit / busybox sh 都支援
- 對齊 user 的 myca script L37:`openssl x509 -req -in 2/myca.csr -CA 1/root.crt -CAkey 1/root.enc ... -extfile 2/myca.conf_ext -out 2/myca.crt`(本 feature 把 `.conf_ext` 換成 heredoc inline)

**SAN extension 寫法**:`subjectAltName=DNS:localhost,IP:127.0.0.1` 直接寫進 `-addext`(req)或 `-extfile`(x509 sign);openssl 解析時若 ext 名稱 / 語法錯會 error,需確保拼寫正確(`subjectAltName` 駝峰 + `DNS:` / `IP:` prefix)。

**Alternatives considered**:
- **`req -x509` 一步出 self-signed leaf**(不走 CSR)— 拒絕:這樣 leaf 是 self-signed、不是被 CA 簽,違反 brainstorm §2 #4 CA + leaf chain
- **`ca` subcommand**(完整 openssl `ca` 配 `openssl.cnf`)— 拒絕:`openssl ca` 需 `openssl.cnf` 完整 CA config + serial database,複雜度高、本 feature 用 `x509 -req` 簡化版即足
- **`-config` 配 `openssl.cnf`** 取代 `-subj` + `-addext`— 拒絕:多一個 config 檔不必要,inline `-subj` + `-addext` 簡單清楚

**驗證對應**:FR-006 / FR-007 / FR-008 + SC-002(cert content)+ SC-003(chain verify OK)

---

## 3. `fullchain.pem` 結構慣例(acme / let's encrypt)

**Decision**:
- 外部 CA 路線:`cat leaf-only.pem ca.pem > fullchain.pem`(leaf + intermediate)
- 自簽路線:`cp leaf-only.pem fullchain.pem`(leaf only;root = ca.pem,browser trust ca.pem 即驗)

**Rationale**:

Let's Encrypt / acme.sh 慣例:
- `cert.pem` = leaf only
- `chain.pem` = intermediate(s)
- `fullchain.pem` = leaf + intermediate(s) concat(server 用,給 client 完整 chain)
- `privkey.pem` = leaf private key

對齊 §8.2.1 已引用 `fullchain.pem` / `privkey.pem` 命名(預示用 acme/let's encrypt convention)。

對自簽 root CA:沒有 intermediate,`fullchain.pem` = leaf only 就夠 — client 已 trust root(ca.pem)即驗 chain。理論上 cat root 進 fullchain 也 work(self-signed root sign itself,額外 trust path),但 acme 慣例 fullchain **不**包含 root,本 feature 對齊。

對外部 CA(user myca 是 intermediate):root 在外部、不在 deploy/dev-certs/;script 把 leaf + ca.pem(intermediate)concat 給 nginx serve,client 從 OS trust store 找到 root 才驗完整 chain。

**Alternatives considered**:
- **fullchain 永遠 = leaf 單獨**(不 cat intermediate)— 拒絕:外部 CA 為 intermediate 場景 browser 可能驗不出 chain(若 OS 沒 intermediate cache)
- **fullchain 永遠 cat ca.pem 進去**(無論 root or intermediate)— 拒絕:對自簽 root 多餘(root 在 client trust store 即可);對 acme 場景不對齊慣例

**驗證對應**:FR-009 / FR-010 + SC-004(外部 CA fullchain 2 個 cert block)

---

## 4. `gitignore` wildcard + negation(`!`)行為

**Decision**:`.gitignore` 加 2 行:`deploy/dev-certs/*`(排除目錄內所有檔案)+ `!deploy/dev-certs/.gitkeep`(豁免 `.gitkeep` 仍 tracked)。**順序重要**:排除 pattern 在前、negation 在後。

**Rationale**:

Git gitignore 規則(per [git-scm.com/docs/gitignore](https://git-scm.com/docs/gitignore)):
- pattern 後面的 negation `!` 會 re-include 之前 exclude 的 file
- 但 negation 對「已被 exclude 的 directory」內檔案無效 — 故須 wildcard `deploy/dev-certs/*` 而非 `deploy/dev-certs/`,才能讓 `!deploy/dev-certs/.gitkeep` 生效
- 順序重要:`!deploy/dev-certs/.gitkeep` 必須在 `deploy/dev-certs/*` 之後,否則先 negation 後又 wildcard 排除、negation 失效

對應 spec FR-020/021/022 + SC-005。

**git 已 tracked file 行為**:gitignore 只對 **untracked** file 生效 — 若有人不小心 commit `ca.key` 進 git,gitignore 不會回溯刪除;須手動 `git rm --cached deploy/dev-certs/ca.key`(本 feature scope 內無歷史污染,新 feature 落地不會碰到此 case)。

**驗證對應**:FR-020 / FR-021 / FR-022 + SC-005 + verification-commands.md §4(gitignore 紀律驗)

---

## 5. docker bind mount on WSL2 / cross-OS 行為

**Decision**:`docker run --rm -v "$CERT_DIR:/certs" -w /certs alpine/openssl ...`,`$CERT_DIR` 用 absolute path(`SCRIPT_DIR/dev-certs` 解析後)。

**Rationale**:

bind mount 行為跨 OS:
- **WSL2**:`-v /mnt/d/...:/certs` 或 `-v /home/anew/...:/certs` 都 work;WSL2 mirrored networking + docker desktop 共享路徑透明
- **macOS**:`-v /Users/...:/certs` work;Docker Desktop 自動 share `/Users` / `/Volumes` 等
- **Linux**:`-v /home/...:/certs` work(原生 docker daemon、無 path translation)
- **Windows native(無 WSL)**:`-v "C:\path\...":/certs` 須轉義 / 用 forward slash;本 feature 假設 WSL bash 環境,Windows native bash 罕(brainstorm 假設 user 用 WSL)

`$SCRIPT_DIR` 解析:`SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` 出 absolute path,WSL 環境會是 `/home/anew/x_Project/fork260509-rev2/deploy`(WSL native)或 `/mnt/d/AnewSpaces/x_Project/fork260509-rev2/deploy`(WSL on Windows mount);docker daemon 兩種都認。

**容器內輸出檔 ownership**:`alpine/openssl` 容器內 default user = root,寫進 mount dir 的 file 在 host 上 owner = root(WSL2 / Linux);某些情況 user 想 chown:本 feature 不處理(local dev,user 自家 access)。

**Alternatives considered**:
- **named volume + post-copy**(`docker run -v cert_vol:/certs ... && docker run --rm -v cert_vol:/v -v host:/h alpine cp -r /v/. /h/`)— 拒絕:多一層 volume + copy 步驟,bind mount 直接 + 簡單
- **`docker cp` 從 container 提檔**— 拒絕:需先 run 容器後 cp、清理 dangling container,多步

**驗證對應**:FR-002(全 docker 化 alpine/openssl)+ FR-003(SCRIPT_DIR 解析)

---

## 6. `set -euo pipefail` 中途失敗的 partial cleanup 策略

**Decision**:**不**加 `trap ... EXIT` cleanup;若 script 中途失敗,partial cert files 留在 `deploy/dev-certs/`,下次跑時:
- 若 `fullchain.pem` 未生成(失敗發生在 Step 2 之前)→ 下次 zero-arg 跑可繼續(無 idempotency block)
- 若 `fullchain.pem` 已生成但其他檔(如 leaf.csr)殘留 → 下次 zero-arg block,加 `--force` 重跑會清

**Rationale**:

`set -euo pipefail` 模式:
- `-e` 任何命令 exit non-zero 就停
- `-u` 用未定義變數就停
- `-o pipefail` pipe 中任一段 fail 整個 pipe fail

partial fail 場景:
- `docker pull` fail → script 第一段就停,`dev-certs/` 內檔無變動
- `genrsa` 或 `req` fail → 已生的部分 file 殘留(如 `ca.key` 生了但 `ca.pem` fail)
- `x509 -req` fail → leaf 私鑰已生但 leaf cert 沒簽

不加 trap 的理由:
- complexity 不值:partial fail 罕見、user 看 docker / openssl 錯誤訊息能 debug
- trap 加 cleanup 反而隱藏錯誤(user 看 dev-certs/ 空了不知出啥)
- 下次 `--force` 重跑會清舊狀態(自簽路線覆寫全部 4 檔)

**Alternatives considered**:
- **`trap 'rm -f $CERT_DIR/leaf.csr $CERT_DIR/ca.srl $CERT_DIR/leaf-only.pem' EXIT`** 只清暫存— 邊際有用(避免 leaf.csr 殘留)但複雜度 +1;本 feature 已在成功路徑 rm 暫存,fail 路徑殘留可接受
- **`trap 'rm -rf $CERT_DIR/*' ERR`** 失敗清整個 dir — 拒絕:過度激進,可能誤刪外部 CA user 預放的 ca.pem / ca.key

**驗證對應**:Edge Cases 已列「partial cleanup」項;非 SC、Acceptance 不涵蓋

---

## 7. 風險與緩解(對齊 brainstorm §9)

| 風險 | 緩解 |
|---|---|
| `alpine/openssl:latest` 浮動版本未來破壞 reproducibility | 本 feature 暫用 latest;若日後出問題在 follow-up backlog 改 pin 具體 tag(如 `alpine/openssl:3.5`) |
| user 既有 myca key 是 AES256 加密(`.enc`) | spec Edge Cases + script comment 明示「手動先 `openssl rsa -in myca.enc -out ca.key -passin env:SSL_MYCA_PASS` 解出 plain」;script 不接 `-passin`(避免 env var 雜訊) |
| 外部 CA 路線 user `ca.pem` 是 intermediate 但忘 trust root → browser 仍 warn | script 第二段 print 明示「假設你已 trust 該 CA 的 root」;若 user 弄錯,看 `NET::ERR_CERT_AUTHORITY_INVALID` debug |
| `dev-certs/` 內容 leak 進 git(私鑰外洩) | `.gitignore` 嚴格 `deploy/dev-certs/*` + `!deploy/dev-certs/.gitkeep`;FR-020/021/022 + SC-005 acceptance 驗 |
| 跨 OS trust 教學命令本身錯 | 3 OS 命令對齊 standard convention(certutil / security / update-ca-certificates),已驗證;user 跑出問題視為 follow-up |
| `docker pull alpine/openssl` 首次慢 / 無網路 fail | script 第一行 `docker pull -q` 不 ignore 失敗;有 cache 後立即返回;user 看 docker error 直接 debug |
| partial cleanup on `set -euo pipefail` 中途 fail | 不加 trap(complexity 不值);下次 `--force` 重跑會清舊狀態 |

---

## 8. 後續 feature 邊界(來自 spec Assumptions)

本 feature 留給後續 Phase 的 contract:

| Phase / Feature | 留給後續的 contract |
|---|---|
| **Phase 1 #4 容器 port 與編排** | wire `deploy/dev-certs/` mount 進 front-nginx container(`-v ./deploy/dev-certs:/etc/nginx/certs:ro`)+ nginx TLS server block(`listen 21443 ssl;` + `ssl_certificate /etc/nginx/certs/fullchain.pem;` + `ssl_certificate_key /etc/nginx/certs/privkey.pem;`)+ HTTP 21080 → HTTPS 21443 redirect |
| **Phase 1 prod baseline seed** | `docker run --rm -v rev2-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine cp /src/fullchain.pem /src/privkey.pem /certs/`(seed 進 named volume)— 操作歸 #4 / prod 啟動 doc;本 feature **不**寫死 seed script |
| **Phase 1 prod + acme** | `deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh` + compose `--profile prod` skeleton — 全留 #4 / Phase 1 後續 |
| **長期 maintenance** | cert renew 由 user 手動 `bash deploy/generate-dev-cert.sh --force`;CA 10 年內無 reset 壓力,leaf 1 年到期前 user 自跑 renew |
