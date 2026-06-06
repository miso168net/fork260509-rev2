# Quickstart — 030 cleanup-job

> 給 implementer / reviewer 的最短路徑：改哪、怎麼測、怎麼驗收。詳設計見 [plan.md](plan.md) / [research.md](research.md) / [data-model.md](data-model.md)。

## 改動清單（5 處）

1. **`rust-api/Cargo.toml`** — workspace.dependencies 加 `chrono`（pin 對齊 sea-orm 鏈，`cargo tree -i chrono` 後寫值）。
2. **`rust-api/cleanup-job/`** — Cargo.toml 加 deps（entity/sea-orm/tokio/anyhow/chrono `workspace=true`）；`src/main.rs` 實作 CLI（env→connect→ dry-run count / `--execute` delete_many）+ 純 `purge_cutoff` fn + `#[cfg(test)]` 單元；`tests/cleanup_live.rs` 加 `#[ignore]` live 整合。
3. **`rust-api/migration/`** — 新 `m20260529_000030_index_sys_token_expires_at.rs`（up CREATE INDEX / down DROP）+ `lib.rs` 註冊。
4. **`rust-api/server/src/auth/jwt.rs`** — `Claims` 加 `jti`；`sign()`（:80）鑄 uuid jti；單元測同秒互異。連帶**4 個手鑄 Claims test 站點**補 jti：`jwt.rs:157`(sign_with_past_exp) / `jwt.rs:243`(with_sid) / `bearer.rs:128`(sign_expired) / `session.rs:342`(claims)。⚠️ `jwt.rs:201/226` 的 `LegacyClaims` 是另一刻意無 sid 的 struct、**不**加 jti。
5. **`docker-compose.yml` + `.dev.yml` + `.prod.yml`** — 加 `cleanup-job` one-shot service（`profiles:[jobs]` + `restart:no` + `cleanup_database_url` secret），鏡像 `migrate`。

## 本機跑（dev stack）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
# 起 dev stack（含 postgres）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 套 migration（含 m030 索引）— 依專案慣例（migrate service / dcargo）
# 驗索引：psql ... -c "\di idx_sys_token_expires_at"
```

## 測試順序（TDD）

1. **純單元先行**（red→green）：`purge_cutoff(now,60)` 算術；jti 同秒兩簽互異 + verify round-trip。
2. **migration 可逆**：up→down→up（throwaway DB）。
3. **in-crate `#[ignore]` live**（cleanup-job bin-only）：seed 各態列 → dry-run 0 改變 → execute 只刪過期超 margin。
4. **acceptance C-V**：見 [contracts/verification-commands.md](contracts/verification-commands.md) — C1 prod build、C2 索引、C3 cleanup 對帳、C4 jti 同秒登入。

## 驗收要點（對 SC）

| 驗 | SC | 命令 |
|---|---|---|
| dry-run 不改 DB | SC-003 | C3 dry-run + count |
| 只刪過期超 margin、保留有效列 | SC-001/004 | C3 execute + 對帳 |
| clock-skew 防護（30s 過期者存活）| FR-002 | C3 `cv_just_expired` 存活 |
| 同秒登入不撞鍵 | SC-005 | C4 平行 curl |
| 任務做完即退出、可重跑 | SC-006 | C3 重跑 0 改變 |
| prod 產物可跑 | FR-012 | C1 |

## 紀律提醒

- jti 改 code 後 **重建+重啟 rust-api**（inotify 不可靠）。
- cleanup-job **不 publish watcher** → 不污染 running server in-memory（不同於 029 settings_watcher）。
- entity 直接存取**僅 cleanup-job**（009 lint 只掃 server/src）；server/jwt 改動不碰 entity。
- 收尾走 `superpowers:finishing-a-development-branch`；**push/merge 不得早於收尾**（constitution §I.4）。
