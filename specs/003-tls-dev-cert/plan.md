# Implementation Plan: tls-dev-cert

**Branch**: `003-tls-dev-cert` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-tls-dev-cert/spec.md`

**Brainstorm**: [`docs/superpowers/003-tls-dev-cert.md`](../../docs/superpowers/003-tls-dev-cert.md)(Phase 0 brainstorm spec-design,8 拍板凍結)

---

## Summary

rev2 第三個 spec-kit feature:dev TLS cert 生成 skeleton — `deploy/generate-dev-cert.sh` zero-arg bash script + `deploy/dev-certs/` 目錄結構 + workspace `.gitignore` 排除規則。全跑 alpine/openssl docker container(host 無 openssl dep),Hybrid CA(偵測外部 `ca.pem` + `ca.key` 兩檔同存 → 跳自簽、用外部簽 leaf;否則自簽 root CA + 簽 leaf),RSA 2048 + SAN `localhost`+`127.0.0.1` + CA 10 年 / leaf 1 年。`fullchain.pem` 結構:外部 CA 路線 = leaf+intermediate concat / 自簽 = leaf only。`--force` flag 控制覆寫(自簽路線覆寫 4 檔 / 外部 CA 路線只覆寫 leaf 2 檔)。對應 DESIGN §10 Phase 1 #3,留 Phase 1 #4 wire nginx TLS conf + front-nginx service。

---

## Technical Context

**Language/Version**:
- Bash(POSIX 子集,WSL2 / macOS / Linux 預設)+ openssl (alpine `alpine/openssl:latest` image 內)
- 本 feature **沒寫** TypeScript / Rust / Vue / Python source — 單一 shell script + 1 個 `.gitkeep` 空檔

**Primary Dependencies**:
- Host:bash 4+、docker 23+(BuildKit 隱含、本 feature 用 plain `docker run` 不需 BuildKit features)
- Container:`alpine/openssl:latest`(busybox + openssl 3.x)
- 無 lockfile / 無 package.json / 無 Cargo.toml

**Storage**: N/A(只生 PEM cert files 到 `deploy/dev-certs/` 目錄)

**Testing**:
- 本 feature 無新純函式邏輯(全 shell + cert gen 配置)→ **不寫單元測試**(對齊 CLAUDE.md §3 + [verification-commands.md](./contracts/verification-commands.md) §0 紀律)
- Acceptance:走 C-V contract `verification-commands.md`(自簽 happy path 4 檔 + cert content grep + chain verify + `--force` idempotency + Hybrid 外部 CA + gitignore 紀律驗)

**Target Platform**:
- Runtime:host shell(WSL2 / macOS / Linux);docker engine on host(WSL2 docker desktop / linux docker daemon / macOS docker desktop)
- 本 feature 不部署 long-running service、不是 daemon — 是「一次性 cert 生成腳本」

**Project Type**: Workspace-level deployment tooling(deploy/ scope,對齊 001 / 002 `deploy/Dockerfile.*.txt` + `deploy/secrets/` 屬性)

**Performance Goals**(對應 spec SC):
- SC-001:bash script 跑完(自簽 happy path)< 30s 首次(含 `docker pull alpine/openssl` ~5s)/ < 10s cache hit
- SC-002:cert content 含正確 Issuer + Subject + SAN
- SC-003:`openssl verify` 通過 chain
- SC-004:外部 CA 路線 `fullchain.pem` 含 2 個 BEGIN CERTIFICATE block
- SC-005:`git status` 任何時刻空(只 `.gitkeep` tracked)
- SC-006:第二次 zero-arg exit 1
- SC-007:`--force` 外部 CA 路線保留 `ca.*` bytes 不變
- SC-008:本 feature 完成後 §8.2.1 第一行立可跑

**Constraints**:
- host 不裝 openssl(全 docker 化,對齊 000/001/002 哲學)
- cert 私鑰絕不 git track(gitignore 嚴守)
- 不自動 OS trust install(教學 print only,避免 sudo + OS 邊界)
- 不處理 AES256 加密 ca.key(user 預先解密 — 避免 env var passphrase 雜訊)
- 不寫死 acme.sh / nginx TLS conf / front-nginx service(留 Phase 1 #4)

**Scale/Scope**:
- 1 個 shell script(~80 行) + 1 個 `.gitkeep` 空檔 + 1 個 `.gitignore` 改動(2 行)
- 5 個 contract artifact + 1 個 research.md + 1 個 data-model.md + 1 個 quickstart.md
- 8 個 acceptance verification command(C-V contract)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [constitution v1.0.0](../../.specify/memory/constitution.md) §IV 7 項 Compliance Check:

| § | 檢查項 | 本 plan 立場 | Pass/Fail |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?rust-api 是否未提供 base-web 用到的對應 endpoint? | N/A — 本 feature 不涉 wire endpoint(純 deploy cert 生成) | ✅ Pass |
| 2 | 此 plan 是否動到 base-web inline? | 否 — 完全不動 `base-web/` 任何檔 | ✅ Pass |
| 3 | 此 plan 涉及 menu 顯示是否走 Casbin enforce?(§I.2) | N/A — 本 feature 不接 menu / 不涉 auth | ✅ Pass |
| 4 | wire 設計對齊 §I.3 mock ground truth?(envelope / id 型 / error code / enum) | N/A — 本 feature 無 wire endpoint(cert 是 deploy artifact、非 HTTP API) | ✅ Pass |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外清單嗎? | 否 — 純新增 + 借鏡 user 既有 myca generation pattern(非 rev1 source) | ✅ Pass |
| 6 | 凍結到 §II 12 拍板項?任一拍板需改變需 Amendment? | 全凍結 — 本 feature 不改任何拍板 | ✅ Pass |
| 7 | 觸及 §III ★ 軌道?授權邊界內? | 不觸及 ★ 軌道(MODAL-WIRING / BASE-WEB-BUILD-CONFIG 都不在本 feature scope);本 feature 為 workspace-level `deploy/` 改動(對齊 001 `deploy/Dockerfile.rust-api.txt + deploy/secrets/` / 002 `deploy/Dockerfile.base-web.txt` 屬性、不觸 base-web/rust-api 內部) | ✅ Pass |

**結論**:7 項全 PASS、無 violations、無 Complexity Tracking 需填。可直接進 Phase 0 research。

---

## Project Structure

### Documentation (this feature)

```text
specs/003-tls-dev-cert/
├── plan.md              # 本檔(/speckit-plan 輸出)
├── spec.md              # /speckit-specify 已交
├── research.md          # Phase 0 輸出(本次)
├── data-model.md        # Phase 1 輸出(本次)
├── quickstart.md        # Phase 1 輸出(本次)
├── contracts/           # Phase 1 輸出(本次)
│   ├── cert-files.md
│   ├── script-cli.md
│   ├── hybrid-ca-detection.md
│   ├── gitignore-discipline.md
│   └── verification-commands.md
└── checklists/
    └── requirements.md  # /speckit-specify 階段 1 已交(14 項全 PASS)
```

### Source Code (repository root)

```text
# 本 feature 落地後的 workspace deploy/ 結構(2 個新檔 + 1 個新目錄)
deploy/
├── generate-dev-cert.sh                    ← 本 feature 新增(zero-arg + --force / Hybrid 偵測)
├── dev-certs/                              ← 本 feature 新增目錄
│   └── .gitkeep                            ← 本 feature 新增(保留目錄存在;其他 4 cert/key 檔 gitignored)
├── Dockerfile.base-web.txt                 (002 已落,不動)
├── Dockerfile.rust-api.txt                 (001 已落,不動)
├── entrypoint.rust-api.sh                  (001 已落,不動)
└── secrets/                                (001 已落,不動)

# workspace root .gitignore 加 2 行
.gitignore                                  ← 本 feature 改(append 2 行)
```

**Structure Decision**:本 feature 沒有「新 source crate / module / view」— 只動 deploy/ 1 個 script + 1 個 dir + 1 個 .gitignore append。對齊 brainstorm §3 凍結摘要。FR-023 explicit 凍結不動 base-web/rust-api/compose/既有 Dockerfile/secrets/CLAUDE.md。

---

## Phase 0 Status

Research artifacts → [`research.md`](./research.md)

**結論**:6 個 research 主題、全為 best-practice 確認、無 NEEDS CLARIFICATION 待解。brainstorm 8 拍板 + spec 26 FR / 8 SC 已收斂、Phase 0 對 alpine/openssl image 行為 / openssl 命令語法 / gitignore wildcard+negation 規則 / docker bind mount cross-OS 行為 / heredoc -extfile 寫法 / SAN extension subjectAltName 寫法做確認。

---

## Phase 1 Status

Design artifacts:
- [`data-model.md`](./data-model.md)— 6 個 key entity(script / dir / 4 個 cert files / docker image)+ Hybrid 偵測 invariant + state transition
- [`contracts/`](./contracts/)— 5 個 contract 檔(cert-files / script-cli / hybrid-ca-detection / gitignore-discipline / verification-commands)
- [`quickstart.md`](./quickstart.md)— 自簽 happy path + 外部 CA 路線 + gitignore 紀律驗一鍵流程

**Agent context update**:CLAUDE.md `<!-- SPECKIT START -->` marker 區更新指向 `specs/003-tls-dev-cert/plan.md`。

---

## Constitution Re-Check (Post-Design)

Phase 1 設計完成後重跑 Compliance Check 7 項。

**結果**:7 項仍全 PASS。Phase 1 設計未引入任何 base-web inline 改動、未動 wire envelope、未從 rev1 拷貝 code、未觸 ★ 軌道。research 階段確認 alpine/openssl image + openssl CLI 行為 + gitignore wildcard+negation 規則,屬 implementation detail、不違反任何凍結紀律。

可進 `/speckit-tasks` 階段。

---

## Complexity Tracking

> Constitution Check 7 項全 PASS、無 violations、本段不需填。
