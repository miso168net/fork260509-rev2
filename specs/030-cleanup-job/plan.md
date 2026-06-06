# Implementation Plan: Refresh-Token Cleanup Job + Same-Second Login Fix

**Branch**: `030-cleanup-job` | **Date**: 2026-06-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/030-cleanup-job/spec.md`

## Summary

把 027 FR-011 延後的「sys_token 過期記錄實體清理」落地成一個 on-demand 維運 binary（`cleanup-job`），用**純過期規則**（`expires_at < now()-60s`、任何 status）安全刪除「JWT 已必定失效、永不可能再被 `rotate()` 查到」的列，dry-run 預設、`--execute` 才實刪；外加修 027 latent 的 same-second `token_hash` 撞鍵（`Claims` 加 per-token `jti`）。**純後端**：無 base-web、無 wire 端點、無新表（僅加一個 `expires_at` 索引）、不改 027 enforcement。設計來源見 [brainstorm spec-design](../../docs/superpowers/030-cleanup-job.md)（4 決策已拍板）。

## Technical Context

**Language/Version**: Rust edition 2021，toolchain 1.86（`rust-toolchain.toml`，host 無 cargo → 走 dev docker image / `dcargo`）

**Primary Dependencies**: `sea-orm 1.1.20`（`Entity::delete_many().filter().exec()` + `find().count()`）、`tokio`、`anyhow`、`chrono`（新增至 workspace.dependencies；算 `now()-margin` cutoff）、`entity`（path crate）；jti 側：`jsonwebtoken 9`（既有 `Claims`）+ `uuid`（server 既有 dep）

**Storage**: PostgreSQL — `sys_token` 表（`expires_at: DateTimeWithTimeZone`，`entity/src/sys_token.rs:13`）；本 feature 加 `idx_sys_token_expires_at`、無新表、無新欄

**Testing**: `cargo test`（dev docker image，host 無 cargo）；① 純單元（`purge_cutoff(now,margin)` 算術；jti 同秒互異）② in-crate `#[ignore]` live postgres 整合（seed 各態列、dry-run/execute 對帳；bin-only crate 故用 in-crate `#[ignore]`）③ acceptance：docker prod build + 活體 cleanup + curl jti + psql

**Target Platform**: Linux server（docker-compose；`cleanup-job` 為 one-shot profile job）

**Project Type**: CLI 維運 binary（`cleanup-job`）+ 後端 lib 改動（`server` 的 `jwt.rs` Claims/sign）+ migration（加索引）

**Performance Goals**: 批次任務、無 SLA；清理查詢走新 `idx_sys_token_expires_at`（避免全表掃）

**Constraints**: 純過期 + 60s 安全邊際（吸收 `expires_at`↔JWT `exp` 偏移）；dry-run 預設、`--execute` 才刪；無 in-stack scheduler（host cron 外觸）；連線用 `cleanup_database_url` secret（目前 == `database_url`，soybean superuser，least-priv role defer）

**Scale/Scope**: `sys_token` 規模被 7 天 refresh TTL（`refresh_token_ttl_secs: 604800`，`application.yaml:7`）自然封頂；改動 ≈ 1 新 binary impl + 1 migration + Claims/sign 1 欄 + 3 compose 檔 service

## Constitution Check

*GATE: 對照 `.specify/memory/constitution.md` v1.6.0 §IV 八問，Phase 0 前必過、Phase 1 後複查。*

| # | Compliance 問項 | 結論 | 依據 |
|---|---|---|---|
| 1 | 違反 §I.1 base-web 為權威?未提供 base-web 用到的 endpoint? | **PASS** | 本 feature **不新增任何 wire 端點**、base-web 完全不參與;cleanup-job 是獨立 binary、jti 是 token 內部欄。base-web example 無對應需求。 |
| 2 | 動到 base-web inline?屬哪條 ★ 軌道、邊界內? | **PASS（N/A）** | **零 base-web 檔案改動** → 不觸及 MODAL-WIRING / BASE-WEB-BUILD-CONFIG 任一 ★ 軌道。 |
| 3 | menu 顯示走 Casbin enforce?(§I.2) | **N/A** | 不涉 menu。 |
| 4 | wire 設計對齊 §I.3 mock?(envelope/id 型/error code/enum) | **PASS（with caveat）** | §I.3 鎖定的是 **base-web 解析的 wire shape**（envelope/id 型/error code/enum）—— 全不動;jti 改的是 **JWT 內部 claim 集**（token 格式），但 base-web 把 token 當 opaque、不 decode（`jwt.rs:9-10`）→ base-web↔rust-api wire shape **零改動**（FR-010）;cleanup-job 無 wire。**caveat（已揭露、非隱藏）**:加 required jti 使「變更前已發出」舊 token decode 失敗 → 一次性重登（transition，同 028 sid 範式;spec edge case + research D5 已載、本環境可接受）。 |
| 5 | 從 rev1 source 拷貝 code?屬 §I.5 例外? | **PASS** | cleanup-job 全新寫;jti 鏡像 **rev2 既有 sid 範式**（`handler/auth.rs:100`）、非 rev1。 |
| 6 | 凍結到 §II 13 拍板項?需改任一拍板? | **PASS** | 不動任何拍板（帳號/alova/modal/sub-crate/route mode/obs/wire/...）。 |
| 7 | 觸及 §III ★ 軌道?邊界內? | **PASS（N/A）** | 無 base-web 改動 → 無 ★ 軌道。 |
| 8 | 新建業務表(create migration)?含 §I.6 六審計欄? | **PASS（N/A）** | m030 **僅 `CREATE INDEX`** 於既有 `sys_token`、**不建新表 / 不加欄** → §I.6 六審計欄義務不觸發;sys_token 為 027 建之 auth-operational 表、forward-only retrofit 不在本 feature。 |

**結論：8/8 PASS**（純後端維運、constitution 表面極小）。**無** Complexity Tracking 項。

## Project Structure

### Documentation (this feature)

```text
specs/030-cleanup-job/
├── plan.md                       # 本檔（/speckit-plan）
├── research.md                   # Phase 0（grep-backed 決策）
├── data-model.md                 # Phase 1（sys_token / Claims / purge 模型）
├── quickstart.md                 # Phase 1（build/run/verify）
├── contracts/
│   ├── cli-contract.md           # cleanup-job CLI 介面契約
│   └── verification-commands.md  # C-V 驗收契約（prod build + 活體 + jti curl + psql）
├── checklists/requirements.md    # /speckit-specify 產（已全綠）
└── tasks.md                      # Phase 2（/speckit-tasks，非本步）
```

### Source Code (repository root)

```text
rust-api/
├── Cargo.toml                                   # workspace.dependencies += chrono
├── cleanup-job/
│   ├── Cargo.toml                               # += entity, sea-orm, tokio, anyhow, chrono（workspace = true）
│   └── src/main.rs                              # CLI：env→connect→（dry-run count | --execute delete_many）；
│                                                #   含純 purge_cutoff fn + #[cfg(test)] 單元
│   └── tests/cleanup_live.rs                    # #[ignore] live postgres 整合（seed 各態列、對帳）
├── migration/src/
│   ├── lib.rs                                   # 註冊 m20260529_000030（mod + Box::new）
│   └── m20260529_000030_index_sys_token_expires_at.rs   # up: CREATE INDEX / down: DROP INDEX
└── server/src/auth/
    ├── jwt.rs                                   # Claims += jti: String；sign() 內鑄 uuid jti（:80）；補 in-file test 站點 :157(sign_with_past_exp)/:243(with_sid)；單元測同秒互異（:201/:226 LegacyClaims 不加 jti）
    ├── bearer.rs                                # test helper sign_expired() += jti（:128）
    └── session.rs                               # live-test claims() helper += jti（:342）

docker-compose.yml                               # + cleanup-job service（profiles:[jobs] + restart:no + cleanup_database_url）;
                                                 #   secrets: += cleanup_database_url（file 已存在）
docker-compose.dev.yml                           # cleanup-job dev override（target + cargo run --bin cleanup-job）
docker-compose.prod.yml                          # cleanup-job prod override（command:[cleanup-job]）
deploy/secrets/cleanup_database_url.txt(.example)# 已存在（== database_url）
```

**Structure Decision**: 沿用 rust-api workspace 既有切分。`cleanup-job` 為**自足 binary crate**（鏡像 `migration` bin 的 env-loading 極簡法、不依賴 server lib——server 為 bin-only 無 lib target）。jti 改動侷限 `server/src/auth/`。migration 加索引（非建表）。compose 3 檔加 one-shot job service（鏡像 `migrate`）。

## Complexity Tracking

> Constitution Check 8/8 PASS、無違反項 → 本節留空（無需 justification）。
