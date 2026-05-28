# 006-docker-volume-naming — Phase 0 brainstorm（spec-design）

**Feature**：`006-docker-volume-naming`（rev2 named volume 命名統一）
**日期**：2026-05-28
**狀態**：Phase 0 brainstorm 定案；待手動 `/speckit-specify` 起 SDD 設計鏈
**來源**：CLAUDE.md §8.2 容器 endpoint 與 port 配置討論衍生；user 要求以 `rev2-admin_` 前綴統一所有 named volume 命名，方便日後 grep。

---

## 1. 問題陳述

rev2 目前 7 個 named volume 用顯式 `name: rev2_*` 繞過 `COMPOSE_PROJECT_NAME`（`rev2-admin`）前綴，存在兩層不一致：

1. **前綴不一致**：project name 是 `rev2-admin`、container 是 `rev2-admin-*`，但卷名前綴卻是 `rev2_`，不對齊。
2. **service 段不一致**：`bw_node_modules` / `bw_pnpm_store`（縮寫 `bw`）、`redis_data`（縮寫；service 實為 `redis-stack`）vs `front_nginx_*` / `rust_api_*`（短名全寫）混用。

**目標**：統一為單一可預測、grep 友善的命名規則，讓 `docker volume ls | grep rev2-admin` 一網打盡，且與 container / network 前綴一致。

---

## 2. 設計決策（brainstorm 拍板）

| # | 決策點 | 選擇 | 理由 |
|---|---|---|---|
| D1 | compose key 改不改 | **key + name 一起改** | 讀 compose 的人看到的 key 與實際卷名一致、無新困惑 |
| D2 | 前綴 | **`rev2-admin_`**（＝ project name auto-prefix） | 與 container / network 對齊、grep 友善（user 拍板） |
| D3 | name 實作 | **移除顯式 `name:`、靠 docker auto-prefix** | docker-native、未來新卷自動合規、project name 為唯一前綴源；2 個 standalone 檔加 `name: rev2-admin` 保持一致 |
| D4 | 凍結 spec 處理（002/004/005 + 002 brainstorm + INTEGRATION-RESEARCH） | **不改寫內文、加 superseded cross-ref** | 守「spec ＝ 該 feature 凍結紀錄」doctrine + 004→005 postgres rename 先例 |
| D5 | `docs/superpowers/000`（持久記憶） | **全面逐行改寫** | living reference、應反映 current；其 standalone bootstrap 手法已被 002 master compose 取代 |

---

## 3. 命名規則

```
compose key:  <service>_<purpose>          （無前綴；service mount 與 volumes anchor 用）
顯式 name:    （無 — 移除）                 → docker 以 COMPOSE_PROJECT_NAME 自動前綴
實際卷名:     rev2-admin_<service>_<purpose>
```

- **`<service>`**：CLAUDE.md §1 短名、`-`→`_`：`front_nginx` / `base_web` / `rust_api` / `postgres` / `redis_stack`
- **`<purpose>`**：用途：`data` / `certs` / `node_modules` / `pnpm_store` / `cargo_cache` / `target`
- **4 個 compose 檔**（master `docker-compose.yml` + 2 個 standalone `docker-compose.{base-web,rust-api}.yml`）皆設頂層 `name: rev2-admin`，使 auto-prefix 前綴一致、master 與 standalone 共用同一物理卷。

---

## 4. 正典 7 卷對照

| compose key（新） | 實際卷名（新，auto-prefix） | 舊卷名 | key 變動 |
|---|---|---|---|
| `postgres_data` | `rev2-admin_postgres_data` | `rev2_postgres_data` | 不變 |
| `redis_stack_data` | `rev2-admin_redis_stack_data` | `rev2_redis_data` | `redis_data` → `redis_stack_data` |
| `front_nginx_certs` | `rev2-admin_front_nginx_certs` | `rev2_front_nginx_certs` | 不變 |
| `base_web_node_modules` | `rev2-admin_base_web_node_modules` | `rev2_bw_node_modules` | `bw_` → `base_web_` |
| `base_web_pnpm_store` | `rev2-admin_base_web_pnpm_store` | `rev2_bw_pnpm_store` | `bw_` → `base_web_` |
| `rust_api_cargo_cache` | `rev2-admin_rust_api_cargo_cache` | `rev2_rust_api_cargo_cache` | 不變 |
| `rust_api_target` | `rev2-admin_rust_api_target` | `rev2_rust_api_target` | 不變 |

> 7 個卷的「實際卷名」全部因前綴 `rev2_` → `rev2-admin_` 改變；其中 3 個的 key 另有 service 段更名。

---

## 5. 變更面（依決策分類）

### 5.1 LIVE — 必改（決定實際行為）
- **`docker-compose.yml`（master）**：移除 7 個 `name:` 行；3 個 key 更名（`redis_data`→`redis_stack_data`、`bw_node_modules`→`base_web_node_modules`、`bw_pnpm_store`→`base_web_pnpm_store`）+ 對應 mount 引用。
- **`docker-compose.dev.yml`**：2 個 `bw_*` mount → `base_web_*`。
- **`docker-compose.base-web.yml`（DEPRECATED）**：加頂層 `name: rev2-admin`；移除顯式 `name:`；key + mount 更名；L16 註解 `docker volume rm rev2_bw_node_modules` 更新。
- **`docker-compose.rust-api.yml`（DEPRECATED）**：加頂層 `name: rev2-admin`；移除顯式 `name: rev2_rust_api_*`（key 不變、靠 auto-prefix）。

### 5.2 權威 — 同步
- **`docs/INTEGRATION-DESIGN.md:891`**：`redis_data` → `redis_stack_data`。

### 5.3 操作參考 — 更新（目標所在）
- **`CLAUDE.md` §8.2 表**：新增「docker volume name」列。
- **`CLAUDE.md` §8.2.1 live 指令**：`rev2_front_nginx_certs`（seed cert）等 → `rev2-admin_*`。
- **`CLAUDE.md` 新增 §8.2.2**：命名規則 + 正典 7 卷清單。

### 5.4 持久記憶 — 全面改寫
- **`docs/superpowers/000-base-web-docker-bootstrap.md`**：~14 處 `rev2_bw_*` / `bw_*` → `rev2-admin_base_web_*` / `base_web_*`。

### 5.5 凍結歷史 — 不改寫、加 superseded cross-ref
- **`specs/002/**`、`specs/004/**`、`specs/005/**`、`docs/superpowers/002-dockerfile-base-web.md`、`docs/INTEGRATION-RESEARCH.md`**：內文保留歷史卷名；於各受影響 feature 最 load-bearing 處（如 `004/data-model.md` 卷表、`002/contracts/compose-profiles.md`）加 1 行 cross-ref 指向 006 + 本規則。

### 5.6 不動
- `rev2_postgres_data` / `rev2_front_nginx_certs` / `rev2_rust_api_*` 的 **key** 不變（只前綴隨 auto-prefix 改）。

---

## 6. 驗收（C-V contract，無單元測試）

本 feature 為 compose 設定 + 文件更名，**無新純函式邏輯 → 不寫單元測試**（對齊 CLAUDE.md §3 + 003/004/005 慣例；須在 spec/plan/tasks 明示）。由 C-V acceptance command 覆蓋：

1. **舊名清零**：4 個 live compose `grep -E 'rev2_(postgres|redis|front_nginx|bw|rust_api)|bw_node_modules|bw_pnpm_store|redis_data:'` ＝ 0。
2. **stack 健康**：`down --remove-orphans` + 移除舊卷 + `up -d --wait` → 5 service healthy。
3. **新名生效**：`docker volume ls | grep rev2-admin` 出現 7 個 `rev2-admin_*`；`grep '^rev2_'`（舊前綴）＝ 0。
4. **dual-write 不變式仍成立**（005）：`psql -U soybean` 連線通、redis requirepass 可連。
5. **文件一致**：DESIGN / 000 已改新名；凍結 spec 已加 cross-ref；CLAUDE.md §8.2.2 規則就位。

---

## 7. 遷移（低成本）

stack 目前已 down、無 container 占用：

```bash
# 改完 4 個 compose 檔後：
docker volume rm rev2_postgres_data rev2_redis_data rev2_front_nginx_certs \
  rev2_bw_node_modules rev2_bw_pnpm_store rev2_rust_api_cargo_cache rev2_rust_api_target
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker volume ls | grep rev2-admin   # 應見 7 個新名
```

- postgres / redis dev 無真實資料（同 005 R9 前提），重建零損失。
- front_nginx_certs（prod cert）可由 `deploy/dev-certs` 重 seed。
- base_web / rust_api 快取重建（pnpm install / cargo build 重跑一次）。

---

## 8. 範圍外（不做）

- **network 命名**（`rev2_net` key → auto-prefix `rev2-admin_rev2_net`）：本 feature 只動 volume，不改 network。
- **DESIGN.md:891 的 redis image tag 偏離**（`redis/redis-stack:7.4.0-v3` vs as-built `redis/redis-stack-server:latest`）：屬另一既存 doc 偏離，不在 006 範圍。

---

## 9. 交棒

手動執行 `/speckit-specify`（輸入＝本檔）→ `before_specify` pre-hook 自動建 `006-docker-volume-naming` feature branch → SDD 設計鏈（specify / clarify / plan / tasks / analyze）→ TDD 實作（`superpowers:executing-plans`）。
