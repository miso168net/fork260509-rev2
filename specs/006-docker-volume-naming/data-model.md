# Phase 1 Data Model: docker-volume-naming

> 本 feature 無傳統 DB entity;此處 model 的是 **named volume 命名 entity**（卷 / 命名規則 / compose 檔角色）及其關係。

---

## Entity 1: 7 個 named volume（舊 → 新對照）

| compose key（新） | service | purpose | 實際卷名（新,auto-prefix） | 舊卷名 | key 變動 |
|---|---|---|---|---|---|
| `postgres_data` | postgres | data | `rev2-admin_postgres_data` | `rev2_postgres_data` | 不變 |
| `redis_stack_data` | redis-stack | data | `rev2-admin_redis_stack_data` | `rev2_redis_data` | `redis_data`→`redis_stack_data` |
| `front_nginx_certs` | front-nginx | certs | `rev2-admin_front_nginx_certs` | `rev2_front_nginx_certs` | 不變 |
| `base_web_node_modules` | base-web | node_modules | `rev2-admin_base_web_node_modules` | `rev2_bw_node_modules` | `bw_`→`base_web_` |
| `base_web_pnpm_store` | base-web | pnpm_store | `rev2-admin_base_web_pnpm_store` | `rev2_bw_pnpm_store` | `bw_`→`base_web_` |
| `rust_api_cargo_cache` | rust-api | cargo_cache | `rev2-admin_rust_api_cargo_cache` | `rev2_rust_api_cargo_cache` | 不變 |
| `rust_api_target` | rust-api | target | `rev2-admin_rust_api_target` | `rev2_rust_api_target` | 不變 |

**前綴**:全 7 卷實際名由 `rev2_` → `rev2-admin_`（auto-prefix）;3 個 key 另有 service 段更名。
**用途分類**:`data`（postgres/redis 持久）、`certs`（prod cert）、`node_modules`/`pnpm_store`/`cargo_cache`/`target`（build 快取）。

---

## Entity 2: 命名規則

| 屬性 | 值 |
|---|---|
| compose key | `<service>_<purpose>`（無前綴;service mount 與 volumes anchor 用） |
| 顯式 `name:` | 無（移除 — 靠 auto-prefix） |
| 實際卷名 | `rev2-admin_<service>_<purpose>`（docker 以 `COMPOSE_PROJECT_NAME` 自動前綴） |
| `<service>` | §1 短名、`-`→`_`:`front_nginx` / `base_web` / `rust_api` / `postgres` / `redis_stack` |
| `<purpose>` | `data` / `certs` / `node_modules` / `pnpm_store` / `cargo_cache` / `target` |
| 前綴源 | `COMPOSE_PROJECT_NAME = rev2-admin`（4 compose 檔頂層 `name: rev2-admin`） |

**未來新卷**:依此規則加 `<service>_<purpose>` key、不加 `name:`,自動得 `rev2-admin_` 前綴。

---

## Entity 3: 4 compose 檔角色

| compose 檔 | 角色 | 本 feature 改動 |
|---|---|---|
| `docker-compose.yml` | master base（5 service 共通 + 7 volumes anchor + secrets）| 移除 7 `name:`;3 key 更名;redis mount `redis_data:/data`→`redis_stack_data:/data`;頂層 `name: rev2-admin` 已存在（不動）|
| `docker-compose.dev.yml` | dev override（base-web/rust-api dev mount + host port）| base-web 2 mount `bw_*`→`base_web_*`;rust-api mount key 不變 |
| `docker-compose.base-web.yml` | DEPRECATED standalone | 加頂層 `name: rev2-admin`;移除 `name:`;key/mount `bw_*`→`base_web_*`;L16 註解卷名更新 |
| `docker-compose.rust-api.yml` | DEPRECATED standalone | 加頂層 `name: rev2-admin`;移除 `name: rust_api_*`（key 不變）|

> `docker-compose.prod.yml`（prod override）:grep 確認無 volume `name:` 宣告（卷定義在 base）→ 本 feature **不需動**。實作時須複查。

---

## 關係圖

```text
COMPOSE_PROJECT_NAME = rev2-admin（4 compose 頂層 name:）
        │ auto-prefix
        ▼
compose key <service>_<purpose>  ──→  實際卷名 rev2-admin_<service>_<purpose>
        │（無顯式 name:）
        ├─ postgres_data        → rev2-admin_postgres_data
        ├─ redis_stack_data     → rev2-admin_redis_stack_data
        ├─ front_nginx_certs    → rev2-admin_front_nginx_certs
        ├─ base_web_node_modules→ rev2-admin_base_web_node_modules
        ├─ base_web_pnpm_store  → rev2-admin_base_web_pnpm_store
        ├─ rust_api_cargo_cache → rev2-admin_rust_api_cargo_cache
        └─ rust_api_target      → rev2-admin_rust_api_target

master + 2 standalone 共用同 project name → 共用同物理卷
```

**不變式**:005 dual-write（database_url/redis_url 嵌 password ≡ leaf）與卷命名無關、改名後仍成立（secret 為 file-based,非 named volume）。
