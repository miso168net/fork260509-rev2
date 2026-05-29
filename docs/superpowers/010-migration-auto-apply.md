# 010-migration-auto-apply — Phase 0 brainstorm（spec-design）

> **Feature**：dev/prod stack `up` 時自動套用 sea-orm migration（專用一次性 `migrate` service + 閘門）
> **Phase**：Phase 2 P1 基礎設施（補位 [CHECKLIST §2.12 / §2.10](../INTEGRATION-CHECKLIST.md) migration 套用 gap；audit log feature 前置）
> **Date**：2026-05-29
> **狀態**：brainstorm 完成、待 階段 1 `/speckit-specify`（手動觸發）
> **權威**：本檔為 Phase 0 設計凍結；不變更 007 已凍結的 migration runner 契約（FR-009 server 不自動跑 migration）。

---

## 1. 緣起與現況

**緣起**：009-soft-delete-infra 驗收時發現（[CHECKLIST §2.12](../INTEGRATION-CHECKLIST.md)）—— dev stack `docker compose … up -d --wait` **不會**自動套用 migration，001/002/003 都靠手動 `cargo run --bin migration up`。`verification-commands.md` 講的「007 pipeline 自動套用」是誤述。每個帶 migration 的 feature（audit log 起）驗收都得記得手動套，易漏。本 feature 在 audit log 開工前把這個 gap 補掉。

**現況**（grep 確認，2026-05-29）：
- **dev target**（`deploy/Dockerfile.rust-api.txt`）：`ENTRYPOINT ["cargo","watch","--poll","-x","run --bin server"]` —— 只跑 server，從不碰 migration binary。
- **runtime/prod target**：`ENTRYPOINT entrypoint.sh` + `CMD ["server"]`；`entrypoint.rust-api.sh` 已是 dispatcher（`server`/`migration`/`cleanup-job`），**能**跑 `migration up`，但預設只起 server。
- **server boot**（`server/src/main.rs`）：不呼叫 Migrator（grep 0 命中）。
- **migration binary**（`migration/src/main.rs`）：sea-orm `cli::run_cli`（支援 `up`/`down`/`status`），讀 `APP_DATABASE_URL_FILE`/`APP_DATABASE_URL`/`DATABASE_URL`。
- **007 FR-009 凍結**：「server 與 migration MUST 維持獨立 binary（server 不自動跑 migration）」→「server 開機 auto-migrate」被排除（要 amendment 才能改）。

**結論**：dev 與 prod 都沒有任何 migration 自動觸發點。需在「migration 維持獨立 process」前提下，把 invoke 自動化。

---

## 2. 設計決策（brainstorm 凍結，user 親決 2026-05-29）

- **D1 範圍 = dev + prod 對齊**：dev stack 與 prod stack `up` 都在 server 起來前自動套好 migration（同時補 §2.12 dev 痛點 + §2.10 prod path）。
- **D2 機制 = 專用一次性 `migrate` service + `service_completed_successfully` 閘門**（docker-compose 正典 migration 模式）。否決：server-boot auto-migrate（撞 007 FR-009 + 多 replica 重跑/race）；entrypoint 包一層（與 FR-009 精神牴觸、會 race）；Makefile/script wrapper（達不到「`up` 就自動套」）。
- **D3 fail-fast**：migrate 非 0 退出 → server 閘門不滿足 → server 不啟動 → `up --wait` 回非 0。
- **D4 冪等、每次 `up` 都跑**：migration runner 已冪等（`seaql_migrations` + seed conflict-safe），不做「只跑一次」機制。
- **D5 outer-only、無兩段式 commit**：只動三個外層 compose 檔，完全不碰 rust-api worktree（不改 server/migration code、不改 Dockerfile/entrypoint）。

---

## 3. 架構 / 元件

**新增 `migrate` service（一次性、跑完即退）**：

`docker-compose.yml`（base，共用骨架）：
```yaml
  migrate:
    build:
      context: ./
      dockerfile: deploy/Dockerfile.rust-api.txt
      # target 由 dev/prod override 指定
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      APP_DATABASE_URL_FILE: /run/secrets/database_url
    secrets:
      - database_url
    restart: "no"
    networks: [rev2_net]
    # image / command 由 override 指定
```

`rust-api` service 加閘門：
```yaml
    depends_on:
      postgres: { condition: service_healthy }
      redis-stack: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }   # ← 新增
```

`docker-compose.dev.yml`（dev image、bind-mount source、跑 cargo）：
```yaml
  migrate:
    build: { target: dev }
    image: rev2-admin-rust-api:dev
    volumes:
      - ./rust-api:/app
      - rust_api_cargo_cache:/usr/local/cargo
      - rust_api_target:/app/target
    entrypoint: ["cargo", "run", "--bin", "migration"]   # 覆寫 dev cargo-watch ENTRYPOINT
    command: ["up"]
```

`docker-compose.prod.yml`（runtime image、走 entrypoint dispatcher）：
```yaml
  migrate:
    build: { target: runtime }
    image: rev2-admin-rust-api:latest
    command: ["migration", "up"]    # entrypoint.sh 派發 → migration up
```

**資料流**：postgres healthy → migrate（`up`，跑 001/002/003…）完成 exit 0 → rust-api(server) 啟動 → front-nginx（依 rust-api healthy）。dev/prod 只差 `target`/`image`/`volumes`/`command`，共用骨架在 base。DATABASE_URL 走既有 `database_url` secret（內部 host `postgres:5432`）。

**為何乾淨**：migrate 是獨立 service/process（守 007 FR-009）；dev 的 migrate 跑完才換 server build，共用 `rust_api_target` volume 因閘門序列化、不衝突。

---

## 4. 失敗 / 冪等 / 邊界行為

- **fail-fast**（D3）：migrate 失敗 → server 不啟動 → `up --wait` 非 0。
- **冪等**（D4）：已套用則 no-op；每次 `up` 都安全跑。
- **既有 DB volume**：migration 追蹤表跳過已套用，no-op，server 直接起；**fresh volume**：migrate 建 schema + seed。
- **`up --wait` 與一次性 service 的退出語意**：需在 plan/acceptance 確認 compose 對 `service_completed_successfully` 依賴的 `--wait` 行為（migrate exit 0 視為滿足；exit≠0 令 `up` abort）。

---

## 5. Scope 邊界

### MUST NOT（不做）
- 不改 `server/src/main.rs` boot（server 仍不呼叫 Migrator — 守 007 FR-009；加 grep regression guard）。
- 不改 migration crate code（binary 已有 `up`）、不改 `Dockerfile.rust-api.txt` / `entrypoint.rust-api.sh`（dispatcher 已支援 `migration`）。
- 只 `up`，無 auto-`down`/rollback。
- 不動 `/health`、不動其他 service。

### 不在 scope（留後續）
- standalone `docker-compose.rust-api.yml` 的 migrate（niche dev aid；列 follow-up，本 feature 聚焦 master dev/prod stack）。
- prod 真實 migration invocation 的 CI/部署編排細節（Phase 5 部署時細化；本 feature 只保證 `prod.yml up` 自動套）。

---

## 6. 測試 / proof

本 feature 為 **compose wiring**、**無新純邏輯單元 → 無單元測試**，由 stack up acceptance 覆蓋（C-V contract；理由寫進 plan/tasks，對齊 CLAUDE.md §3）：
- **dev**：`down -v` → `up -d --wait` exit 0 → psql 見 `sys_user` + seed(Super/Admin/User) + 009 `deleted_at`/partial unique index（3 migration 一次到位）→ server healthy。
- **dev 失敗路徑**：migrate 失敗時 server 不啟動、`up --wait` 非 0（閘門生效）。
- **prod**：`prod.yml up -d --wait`（需先 seed cert，§8.2.1）→ migrate 經 entrypoint dispatcher 套用 → server healthy。
- **FR-009 regression**：grep server 仍不呼叫 Migrator。

---

## 7. 交棒

brainstorm 凍結 D1-D5。下一步 `superpowers:writing-plans` 產出 implementation plan，再走 階段 1 `/speckit-specify`（pre-hook 建 `010-migration-auto-apply` feature branch）→ `/speckit-plan` → `/speckit-tasks` → 階段 2 `superpowers:executing-plans`。**本 feature outer-only、無兩段式 commit**（不動 rust-api worktree）。
