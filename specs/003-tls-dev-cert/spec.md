# Feature Specification: tls-dev-cert

**Feature Branch**: `003-tls-dev-cert`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Phase 1 #3 TLS dev cert generation skeleton — `deploy/generate-dev-cert.sh` + `deploy/dev-certs/` structure + gitignore;Hybrid CA(支援自簽 root 或外部 CA 兩條 path);全 docker 化 alpine/openssl;RSA 2048 / SAN localhost+127.0.0.1 / CA 10 年 / leaf 1 年"

**Phase 0 brainstorm source**: [`docs/superpowers/003-tls-dev-cert.md`](../../docs/superpowers/003-tls-dev-cert.md)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 純自簽路線基線 (Priority: P1)

rev2 開發者 clone repo 後,跑 `bash deploy/generate-dev-cert.sh`(無 arg),script 用 alpine/openssl container 自簽 root CA + 簽 leaf cert,在 `deploy/dev-certs/` 出 4 檔(`ca.pem` / `ca.key` / `fullchain.pem` / `privkey.pem`);script 結尾印 3 OS 的 trust `ca.pem` 教學,user 按教學把 `ca.pem` trust 進 OS root store,後續 nginx 用 `fullchain.pem` + `privkey.pem` 跑 HTTPS、browser 開 `https://localhost` 不跳 `NET::ERR_CERT_AUTHORITY_INVALID`。

**Why this priority**:沒有 cert 就無法跑 `CLAUDE.md §8.2` 規劃的 dev HTTPS `:21443`(Phase 1 #4 整套 stack 啟動的硬性前置);自簽路線是預設、無外部依賴,任何 dev clone 即跑即有,優先級 P1。本 feature MVP = 自簽路線 + 4 檔交付。

**Independent Test**:從 workspace root 跑 `bash deploy/generate-dev-cert.sh` + `ls deploy/dev-certs/` 看 4 檔出 + `openssl x509 -in fullchain.pem -noout -text` 看 SAN/Issuer 對齊,即可獨立驗證價值。

**Acceptance Scenarios**:

1. **Given** clean workspace(`deploy/dev-certs/` 內僅 `.gitkeep`),**When** 跑 `bash deploy/generate-dev-cert.sh`,**Then** `deploy/dev-certs/` 出 4 檔(`ca.pem` / `ca.key` / `fullchain.pem` / `privkey.pem`),script 印「✅ cert 生成完成,fullchain 結構:leaf only(自簽 root = ca.pem,browser trust ca.pem 即可)」,後接 3 OS trust 教學段
2. **Given** 4 檔已生成,**When** 跑 `openssl x509 -in fullchain.pem -noout -text`,**Then** Issuer = `rev2-admin-root dev CA`、Subject = `CN=localhost`、SAN 含 `DNS:localhost` + `IP Address:127.0.0.1`、Not After ~ 1 年後
3. **Given** 4 檔已生成,**When** 跑 `openssl verify -CAfile ca.pem fullchain.pem`,**Then** 回 `fullchain.pem: OK`(chain 驗證通過)
4. **Given** 4 檔已生成,**When** 再跑一次 `bash deploy/generate-dev-cert.sh`(無 `--force`),**Then** script exit 1、印「❌ fullchain.pem 已存在。要強制重生 leaf 加 --force」+ 區分自簽 / 外部 CA 兩種 `--force` 行為提示
5. **Given** 4 檔已生成,**When** 跑 `bash deploy/generate-dev-cert.sh --force`,**Then** 4 檔皆重生(自簽路線連 `ca.*` 也覆寫)

---

### User Story 2 — Hybrid 外部 CA 路線 (Priority: P2)

user 帶既有自己的 CA(例如多年使用的 myca),把 `myca.crt` rename 為 `ca.pem`、`myca.key`(已解密 plain 版本)rename 為 `ca.key` 預放進 `deploy/dev-certs/`,跑 `bash deploy/generate-dev-cert.sh`,script 偵測到外部 CA、跳過 Step 1(生 CA)、直接用外部 CA 簽 leaf;`fullchain.pem` 為 leaf + ca.pem concat(對齊 acme chain);user 已 trust 外部 CA root → browser 開 `https://localhost` 不跳 warn、亦不需 trust 新 root。

**Why this priority**:讓本 feature 對「已有 CA 工具鏈」的 user(本專案主要 user)免新增 root trust + 對齊既有 CA 生態系;對「無既有 CA」的 dev clone fallback 走自簽路線(US1)、不被卡住。優先級 P2(主軸基線 US1 已可 ship、Hybrid 是體驗強化)。

**Independent Test**:預放 `ca.pem` + `ca.key` → 跑 script → 看 script 印「📌 偵測到外部 CA」+ `fullchain.pem` 含 2 個 `BEGIN CERTIFICATE` block(leaf + ca.pem concat),即可獨立驗證。

**Acceptance Scenarios**:

1. **Given** `deploy/dev-certs/ca.pem` + `deploy/dev-certs/ca.key`(plain RSA key,無 passphrase)已預放,**When** 跑 `bash deploy/generate-dev-cert.sh`,**Then** script 印「📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key)— 跳 Step 1、直接用外部 CA 簽 leaf」,只跑 Step 2 簽 leaf,出 `fullchain.pem` + `privkey.pem` 2 檔,**不**動 `ca.pem` 與 `ca.key`
2. **Given** 外部 CA 路線完成,**When** `grep -c "BEGIN CERTIFICATE" deploy/dev-certs/fullchain.pem`,**Then** = 2(leaf cert + ca.pem concat,對齊 acme `fullchain.pem` 慣例)
3. **Given** 外部 CA 路線完成,**When** `openssl verify -CAfile ca.pem fullchain.pem`,**Then** 回 `fullchain.pem: OK`(用外部 ca.pem 驗 chain 通過)
4. **Given** 外部 CA 路線完成,**When** 再跑 `bash deploy/generate-dev-cert.sh --force`,**Then** 只重生 leaf 2 檔(`fullchain.pem` + `privkey.pem`),**不**動 `ca.pem` 與 `ca.key`;script 印「(--force 外部 CA 路線只覆寫 leaf,不動 ca.*)」

---

### User Story 3 — gitignore 紀律驗證 (Priority: P3)

開發者 / CI 跑 `git status` 永遠看不到 `deploy/dev-certs/` 內的 cert / key 檔案(無論自簽或外部 CA 路線),目錄本身存在(由 `.gitkeep` 追蹤),私鑰絕不被 accident commit 進 git history。

**Why this priority**:cert 私鑰(`ca.key` / `privkey.pem`)是嚴格 secret,leak 進 git 等同公開私鑰;但本 feature 主軸 P1 / P2 已交,P3 是 cross-cutting 紀律驗證 — 任何時間點都該滿足。優先級 P3(基線可運轉、紀律須穩)。

**Independent Test**:跑完 script 後 `git status --short deploy/dev-certs/` 結果應為空(無 untracked),`git ls-files deploy/dev-certs/` 結果只 `deploy/dev-certs/.gitkeep`。

**Acceptance Scenarios**:

1. **Given** clean workspace + 跑完 US1 happy path,**When** `git status --short deploy/dev-certs/`,**Then** 空輸出(4 個 cert/key 全被 `.gitignore` 排除、不顯示為 untracked)
2. **Given** clean workspace + 跑完 US2 外部 CA 路線,**When** `git ls-files deploy/dev-certs/`,**Then** 結果只 `deploy/dev-certs/.gitkeep`(預放的 `ca.pem` / `ca.key` 不被 track、script 出的 leaf 2 檔不被 track)
3. **Given** workspace 不 clean(`deploy/dev-certs/` 內有 4 檔 + `.gitkeep`),**When** 開發者跑 `git add -A`,**Then** 4 個 cert/key 仍被 ignored、不被 stage(只 `.gitkeep` 已 tracked、無新 stage)

---

### Edge Cases

- **外部 CA 路線:user 只放 `ca.pem`、忘了 `ca.key`**:script 偵測邏輯 `if [ -f ca.pem ] && [ -f ca.key ]`,有一個就走自簽路線、自簽 ca.pem 會覆寫 user 預放的 — 設計接受(user 預放兩檔才走 Hybrid;只放一檔語意不明、不嘗試 partial Hybrid)
- **外部 CA 路線:`ca.key` 是 AES256 加密**:script 不接 `-passin`,openssl 跑 `genrsa` 或 `x509 -req -CAkey` 時會 prompt passphrase 但 non-interactive container 沒 stdin → fail;user 須先手動 `openssl rsa -in myca.enc -out ca.key -passin env:SSL_MYCA_PASS` 解出 plain 再放(文件明示)
- **`docker pull alpine/openssl` 首次無網路或 fail**:script 第一行 `docker pull -q "$OPENSSL_IMG" >/dev/null` 不 ignore 失敗 → 後續 `docker run` 也 fail,user 看 docker error 直接 debug(script 不嘗試 graceful fallback)
- **script 在 worktree / 非 workspace root 跑**:script 用 `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` 鎖 `deploy/` 作為 anchor,在何處 cwd 都能正確找到 `dev-certs/`
- **`alpine/openssl:latest` 浮動版本未來破壞 reproducibility**:本 feature 暫用 latest、若日後出問題 follow-up 改 pin 具體 tag(本 spec 不寫死 tag)
- **跨 OS trust 命令命令失敗**:script 只**印**教學、**不**執行 trust install;user 在自家 OS 上跑教學命令出錯需自查(避免 OS 偵測 + sudo + trust store API 跨 OS 複雜化)
- **外部 CA 為 intermediate(非 root)**:fullchain.pem 含 leaf + intermediate(ca.pem)concat,但 root 不在 chain 內;browser 仍需從 OS trust store 找到 root 才驗 chain — script 教學第二段明示「假設你已 trust 該 CA 的 root」
- **`--force` 與外部 CA 混用語意**:外部 CA 路線 `--force` 只覆寫 leaf 2 檔、不動 `ca.*`(避免破壞 user 預放的外部 CA);自簽路線 `--force` 覆寫全部 4 檔。script 第二段 print 已明示

---

## Requirements *(mandatory)*

### Functional Requirements

**Script 入口**

- **FR-001**:系統 MUST 提供 `deploy/generate-dev-cert.sh` 可執行 shell script,zero-arg(預設行為)+ 接受 `--force` 單一 flag
- **FR-002**:script MUST 走 alpine/openssl docker container(`docker run --rm -v <dev-certs>:/certs -w /certs alpine/openssl ...`)執行所有 openssl 命令,host **不需**裝 openssl(僅需 docker)
- **FR-003**:script MUST 用 `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` 解析 `deploy/dev-certs/` 路徑、不依賴 cwd,允許在 workspace 任何子目錄跑

**Hybrid CA 偵測**

- **FR-004**:script MUST 在開始時偵測 `deploy/dev-certs/ca.pem` 與 `deploy/dev-certs/ca.key` 是否**同時**存在;兩檔皆存在 → 走外部 CA 路線(EXTERNAL_CA=1)、跳 Step 1;否則 → 走自簽路線(EXTERNAL_CA=0)
- **FR-005**:外部 CA 路線 MUST 不動 `ca.pem` 與 `ca.key`;只簽 leaf cert
- **FR-006**:自簽路線 MUST 自生 `ca.pem`(RSA 2048,Subject `CN=rev2-admin-root dev CA`,validity 3650 天,basicConstraints CA:TRUE,keyUsage keyCertSign+cRLSign)與 `ca.key`(RSA 2048 plain PEM)

**Leaf cert 生成**

- **FR-007**:script MUST 在任何路線都簽 leaf cert(`fullchain.pem` + `privkey.pem`),RSA 2048,Subject `CN=localhost`,SAN `DNS:localhost,IP:127.0.0.1`,validity 365 天,basicConstraints CA:FALSE,keyUsage digitalSignature+keyEncipherment,extendedKeyUsage serverAuth
- **FR-008**:leaf cert MUST 由 `ca.pem` + `ca.key` 簽(無論外部或自簽),`-CA` 與 `-CAkey` 從 `deploy/dev-certs/` 同目錄讀取

**`fullchain.pem` 組合**

- **FR-009**:外部 CA 路線 `fullchain.pem` MUST 為 `leaf cert` + `ca.pem` 兩段 PEM 的 concat(對齊 let's encrypt / acme `fullchain.pem` 慣例 — leaf + intermediate)
- **FR-010**:自簽路線 `fullchain.pem` MUST 為 leaf cert 單獨(因 `ca.pem` 已是 self-signed root、browser trust ca.pem 即驗 chain;不重複 cat root 進 fullchain)

**冪等性 / 已存在偵測**

- **FR-011**:script MUST 在 `fullchain.pem` 已存在且 user **未**加 `--force` 時 exit 1、印錯誤訊息「❌ fullchain.pem 已存在。要強制重生 leaf 加 --force」,並依路線分別印「(--force 純自簽路線會一併覆寫 ca.pem + ca.key)」或「(--force 外部 CA 路線只覆寫 leaf,不動 ca.*)」
- **FR-012**:`--force` 與外部 CA 路線並用 MUST 只覆寫 leaf 2 檔(`fullchain.pem` + `privkey.pem`);不動 `ca.pem` 與 `ca.key`
- **FR-013**:`--force` 與自簽路線並用 MUST 覆寫全部 4 檔(包括 `ca.pem` + `ca.key` 重生)

**收尾 + 教學印**

- **FR-014**:script 完成後 MUST 印「✅ cert 生成完成,fullchain 結構:<MSG>」+ 4 檔列表 + 每檔狀態標記(自簽 root / 外部 CA 未動 / nginx 用 / SECRET 別洩漏)
- **FR-015**:自簽路線 MUST 印 3 OS(Windows 11 / macOS / Linux Debian/Ubuntu)的 `trust ca.pem` 教學段(certutil / security / update-ca-certificates),含「cert 有效期:CA 10 年 / leaf 1 年」+「renew 跑 `--force`」
- **FR-016**:外部 CA 路線 MUST 印「★ 你用了外部 CA,本 script 假設你已 trust 該 CA 的 root」提醒段(包括 intermediate vs root 差異說明 + 「renew leaf 跑 `--force`」),**不**印 3 OS trust 教學(因 user 帶 myca 已 trust)

**目錄結構與清理**

- **FR-017**:script MUST 在開始時 `mkdir -p "$CERT_DIR"`(確保 `deploy/dev-certs/` 存在)
- **FR-018**:script MUST 在 leaf cert 生成後刪除暫存檔 `leaf.csr` 與 `ca.srl` 與 `leaf-only.pem`(避免污染目錄;`leaf-only.pem` 已 merge 進 `fullchain.pem`)
- **FR-019**:`deploy/dev-certs/.gitkeep` MUST 在本 feature 新增、被 git tracked、保留目錄存在(避免 git 自動省略空目錄)

**gitignore 紀律**

- **FR-020**:workspace root `.gitignore` MUST 加 `deploy/dev-certs/*`(排除所有檔案)+ `!deploy/dev-certs/.gitkeep`(豁免 `.gitkeep` 仍 tracked)
- **FR-021**:任何時刻 `git status --short deploy/dev-certs/` MUST 為空(無 untracked cert/key);`git ls-files deploy/dev-certs/` MUST 僅 `deploy/dev-certs/.gitkeep`
- **FR-022**:`git add -A` MUST 不 stage 任何 cert/key 檔(由 gitignore 守護)

**Anti-patterns + 軌道紀律**

- **FR-023**:系統 MUST 不動 `base-web/`、`rust-api/`、`docker-compose.base-web.yml`、`docker-compose.rust-api.yml`、`deploy/Dockerfile.*.txt`、`deploy/secrets/`、`CLAUDE.md`(本 feature 純新增 `deploy/generate-dev-cert.sh` + `deploy/dev-certs/` + `.gitignore` 改動)
- **FR-024**:系統 MUST 不嘗試自動偵測 host OS + 自動跑 trust install(避免 OS 邊界 case + sudo 權限 + 跨 OS trust store API 複雜化);trust 教學只 print、由 user 手動執行
- **FR-025**:系統 MUST 不嘗試處理 `ca.key` AES256 解密(避免 env var passphrase 雜訊);user 須預先手動解出 plain ca.key 再放 `deploy/dev-certs/`
- **FR-026**:系統 MUST 不寫死 acme.sh / Dockerfile.acme.txt / front-nginx service / nginx TLS conf — 全留 Phase 1 #4 容器 port 與編排 feature

### Key Entities

- **`deploy/generate-dev-cert.sh`**:本 feature 唯一 implementation 檔;zero-arg + `--force` flag;Hybrid 偵測 + 兩段(可選)+ 一段(必跑)+ 印教學
- **`deploy/dev-certs/` 目錄**:cert 落地點;`.gitkeep` 是唯一 tracked 檔;其他 4 檔(ca.pem / ca.key / fullchain.pem / privkey.pem)全被 `.gitignore` 排除
- **`ca.pem`**(自簽路線 = self-signed root / 外部 CA 路線 = user 預放,可為 root 或 intermediate):leaf cert 的 signer
- **`ca.key`**(對應 `ca.pem` 的私鑰,plain PEM,SECRET):leaf cert sign 操作的 -CAkey input
- **`fullchain.pem`**(leaf cert + 可選 intermediate concat):nginx `ssl_certificate` directive 的 input;對齊 let's encrypt 命名慣例;對齊 §8.2.1 引用
- **`privkey.pem`**(leaf cert 對應私鑰,plain PEM,SECRET):nginx `ssl_certificate_key` directive 的 input;對齊 let's encrypt 命名慣例;對齊 §8.2.1 引用
- **`alpine/openssl:latest` docker image**:script 內所有 openssl 命令的執行容器;host 無 openssl dep

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:rev2 開發者從 workspace root 跑 `bash deploy/generate-dev-cert.sh` 到看見「✅ cert 生成完成」訊息的完整時間 < 30 秒(含 docker pull image 首次成本;有 cache 後 < 10 秒)
- **SC-002**:自簽路線完成後,`openssl x509 -in fullchain.pem -noout -text` 輸出 MUST 含字串 `Issuer: CN = rev2-admin-root dev CA`、`Subject: CN = localhost`、`DNS:localhost`、`IP Address:127.0.0.1`(SAN 與 CA 對齊正確)
- **SC-003**:任何路線完成後,`openssl verify -CAfile deploy/dev-certs/ca.pem deploy/dev-certs/fullchain.pem` MUST 回 `deploy/dev-certs/fullchain.pem: OK`(chain 驗證通過)
- **SC-004**:外部 CA 路線完成後,`grep -c "BEGIN CERTIFICATE" deploy/dev-certs/fullchain.pem` MUST = 2(leaf + ca.pem concat,對齊 acme chain)
- **SC-005**:任何時刻 `git status --short deploy/dev-certs/` MUST 為空、`git ls-files deploy/dev-certs/` MUST 僅 `deploy/dev-certs/.gitkeep`(私鑰絕不被 git track)
- **SC-006**:`bash deploy/generate-dev-cert.sh` 第二次無 `--force` 跑 MUST exit code = 1(冪等性 — 防止意外覆寫)
- **SC-007**:`bash deploy/generate-dev-cert.sh --force` 外部 CA 路線 MUST 保留 `ca.pem` 與 `ca.key` 內容字節完全不變(僅 mtime / leaf 2 檔變)
- **SC-008**:本 feature 完成後 `CLAUDE.md §8.2.1` 第一行 `bash deploy/generate-dev-cert.sh` 即可跑、不卡(後續 docker compose / openssl s_client 等命令仍需 #4 落地 front-nginx 才能跑、非本 feature SC)

---

## Assumptions

- **Host 環境**:rev2 開發者本機已裝 docker 23+(BuildKit 可用)+ bash(WSL2 / macOS / Linux 預設;Windows 須 git bash 或 wsl);docker 可從 internet pull `alpine/openssl:latest`(或已 cache)
- **Worktree 狀態**:`deploy/` 目錄已存在(001 / 002 已落地 Dockerfile.*.txt + secrets/);本 feature 在 `deploy/` 加 `generate-dev-cert.sh` 與 `dev-certs/` 子目錄
- **外部 CA 路線 user 行為假設**:user 預先把 CA cert + plain key 命名為 `ca.pem` + `ca.key` 放進 `deploy/dev-certs/`;若 user CA key 是加密(`.enc`),user 須手動先解出 plain(文件 + script comment 明示)
- **trust ca.pem 操作**:user 在自家 OS 上手動執行 script 印出的 trust 命令(certutil / security / update-ca-certificates);本 feature 不負責自動執行
- **後續 feature 邊界**(留給對應 Phase):
  - Phase 1 #4 容器 port 與編排:wire `deploy/dev-certs/` mount 進 front-nginx container + nginx TLS server block(`listen 21443 ssl;` + `ssl_certificate /etc/nginx/certs/fullchain.pem;`)+ HTTP `21080` → HTTPS `21443` redirect
  - Phase 1 prod baseline seed:`docker run --rm -v rev2-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine cp /src/fullchain.pem /src/privkey.pem /certs/`(seed 進 named volume)— 操作歸 #4 / prod 啟動 doc,本 feature **不**寫死 seed script
  - Phase 1 prod + acme:`deploy/Dockerfile.acme.txt` + `deploy/acme-entrypoint.sh` + compose `--profile prod` skeleton — 全留 #4 / Phase 1 後續
- **Constitution v1.0.0 對齊**:brainstorm §8 Constitution 預檢通過(7 項對 §IV)— 不涉 base-web inline / Casbin / wire envelope / 三端對齊等 §I-V 條款的 active 適用範圍
- **不在 scope**:CI/CD pipeline(GitHub Actions 等);nginx TLS conf;front-nginx service;acme.sh prod cert acquisition;cert 自動 renew daemon;OS trust install 自動化;Docker Desktop / Podman 替代 runtime 支援;EC P-256 / Ed25519 key 演算法(brainstorm §2 拍板 7 RSA 2048)
