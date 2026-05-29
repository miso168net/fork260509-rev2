# Contract: Verification commands（C-V acceptance）

**Type**: `cargo build`（相容性閘門）+ `cargo test`（既有不破）+ 對 live postgres 的活體 smoke（dev stack、010 自動套表後）+ psql 斷言 + IP 解析。對應 spec User Stories + SCs。

> **§0 — [CLAUDE.md §3](../../../CLAUDE.md) 紀律**：
> - **無新純函式邏輯**（拷貝既有 crate + wiring）→ 主要由 **acceptance（活體 smoke）覆蓋**;tasks/plan 須明示「無新單元測試、由 smoke 覆蓋」。拷貝 crate 自帶單測一併納入。
> - **adapter round-trip / casbin_rule 表存在**需**真實 DB** → 對 dev stack live postgres（`127.0.0.1:25432` host / compose 網路內 `postgres:5432`，010 自動套表後）。
> - **無 HTTP 業務 endpoint / 無 base-web 消費者**：兩 crate 為工具層、無 enforce 接線（Phase 3），smoke 直接呼叫 crate API。
> **§0.1 harness**：沿用 011 — `server` bin-only crate;adapter live smoke 用 in-crate `#[cfg(test)] #[ignore]` + env-gate `DATABASE_URL`（或於 `sea-orm-adapter` crate 自身測試連 DATABASE_URL）。docker `--network rev2-admin_rev2_net -e DATABASE_URL="$(cat deploy/secrets/database_url.txt)"` 跑 `-- --ignored`。

---

## §0 相容性閘門（最高風險、FR-002）— casbin 2.20 × adapter

```bash
# adapter 對 casbin 2.20.0 能編譯(Adapter trait 相容)— 第一道閘門、過不了先修 adapter
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev build -p sea-orm-adapter -p xdb
# 預期: 編譯成功。若失敗(casbin trait drift) → 依 casbin 2.20 修 adapter(plan Deviation)
```

## §1 adapter 活體 round-trip（US1 / SC-001·SC-002〔執行環境對齊〕）

```bash
# 前置:dev stack up(010 自動套表,casbin_rule 經 migration 005 已建)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate   # 套 001..005

# casbin_rule 表存在 + 起點空
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d casbin_rule"
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c "SELECT count(*) FROM casbin_rule;"  # 0

# 活體 smoke(in-crate #[ignore]):建 Enforcer(min RBAC model + 此 adapter)→ add_policy(["alice","data1","read"])
#   → save_policy → 重建 Enforcer 重載 → 斷言 policy 存在
docker run --rm --network rev2-admin_rev2_net -e DATABASE_URL="$(cat deploy/secrets/database_url.txt)" \
  -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev test -- --ignored --test-threads=1
# 預期: adapter round-trip 測試綠(policy 寫入→重載仍在)

# psql 確認 casbin_rule 有對應列
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT ptype,v0,v1,v2 FROM casbin_rule ORDER BY id;"   # 預期: p,alice,data1,read
```

## §2 xdb IP→地區解析（US2 / SC-002）

```bash
# xdb smoke:解析已知 IP → 非空地區字串(無需 DB、純資料檔)
docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
  -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo \
  rev2-admin-rust-api:dev test -p xdb            # 或對應 #[ignore] 若路徑依環境
# 預期: 解析 1.2.4.8 → 回非空、格式合理地區字串(如 "中国|0|..." 之類分段格式)
```

## §3 授權政策表經自動 schema 機制建立（US3 / SC-003）

```bash
# casbin_rule 由 migration 005 經 010 自動套(無手動步驟)
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT to_regclass('public.casbin_rule');"   # 預期: casbin_rule(非 null)
# migration 歷史含 005
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT version FROM seaql_migrations ORDER BY version;"   # 預期: 含 m20260529_000005_create_casbin_rule

# FR-009 regression: server boot 仍不自動 migrate
grep -rniE "Migrator|run_migration|cli::run_cli|migration::up" rust-api/server/src/ ; echo "exit:$?"
# 預期: 無命中(exit 1)。註:adapter new() 內部 migration::up 屬 adapter crate、非 server/src,且 Phase 3 才接
```

## §4 既有不破 + 契約守恆（SC-004 / FR-007 / 009 lint）

```bash
# (a) 既有測試全綠(009 soft-delete + entity-access lint + 011 audit + 008 envelope)
docker run ... rev2-admin-rust-api:dev test                  # 預期: 25+3 ignored server + 17 lint 全綠
# (b) entity-access lint 續綠(新 crate 不在 server/src 掃描範圍)
docker run ... rev2-admin-rust-api:dev test -p server entity_access_lint   # 預期: 綠
# (c) /health 不破
curl -fsS http://127.0.0.1:21081/health ; echo            # 預期 ok
# (d) seed 不破
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT count(*) FROM sys_user WHERE deleted_at IS NULL;"   # 預期 >=3(011 後 seed 完整)
# (e) scope 邊界: 未接 enforce / 未加 axum-casbin / casbin_rule 無 deleted_at
grep -rn "axum_casbin\|Enforcer" rust-api/server/src/ ; echo "exit:$?"   # 預期: 無命中(enforce 屬 Phase 3)
docker compose ... exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='casbin_rule' AND column_name='deleted_at';"  # 預期: 0 列(無 deleted_at)
```

---

## 驗收紀律總結

- §0 相容性閘門（casbin 2.20 × adapter 編譯）— **最高風險、先過**
- §1 adapter 活體 round-trip（US1/SC-001 + 執行環境對齊 SC-002）— policy 寫入→重載仍在 + casbin_rule 有列
- §2 xdb IP→地區解析（US2/SC-002）— 已知 IP → 非空地區
- §3 casbin_rule 經自動 schema 機制建（US3/SC-003）+ FR-009 regression（server 不自動 migrate）
- §4 既有不破 + entity-access lint 續綠 + scope 邊界（無 enforce / casbin_rule 無 deleted_at）（SC-004/FR-007）
- **無 CDP / curl 業務消費者**（工具層、無 enforce endpoint;Phase 3 才接）
- **無新純函式單元測試**（拷貝 + wiring）+ **活體 smoke**（adapter round-trip / xdb 解析）+ 拷貝 crate 自帶單測
