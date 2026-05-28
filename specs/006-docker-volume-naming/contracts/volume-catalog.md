# Contract: volume catalog（7 正典 named volume + 命名規則）

**Type**: named volume 清單 + 命名規則合約。權威源 [DESIGN §8.2](../../../docs/INTEGRATION-DESIGN.md)（將回填 CLAUDE.md §8.2.2）+ [research R1-R3](../research.md)。

---

## 命名規則

```
compose key:  <service>_<purpose>          （無前綴;mount 與 volumes anchor 用）
顯式 name:    （無 — 移除）
實際卷名:     rev2-admin_<service>_<purpose>   （docker auto-prefix,project name rev2-admin）
```

- `<service>`:§1 短名、`-`→`_` — `front_nginx` / `base_web` / `rust_api` / `postgres` / `redis_stack`
- `<purpose>`:`data` / `certs` / `node_modules` / `pnpm_store` / `cargo_cache` / `target`
- 4 compose 檔（master + 2 standalone）皆設頂層 `name: rev2-admin` → auto-prefix 一致、共用同卷

---

## 7 正典 named volume

| compose key | 實際卷名 | 消費 service / mount | 類型 |
|---|---|---|---|
| `postgres_data` | `rev2-admin_postgres_data` | postgres `:/var/lib/postgresql/data` | data |
| `redis_stack_data` | `rev2-admin_redis_stack_data` | redis-stack `:/data` | data |
| `front_nginx_certs` | `rev2-admin_front_nginx_certs` | front-nginx prod `:/etc/nginx/certs`（+ acme `:/acme.sh`）| certs |
| `base_web_node_modules` | `rev2-admin_base_web_node_modules` | base-web dev `:/app/node_modules` | build 快取 |
| `base_web_pnpm_store` | `rev2-admin_base_web_pnpm_store` | base-web dev `:/pnpm-store` | build 快取 |
| `rust_api_cargo_cache` | `rev2-admin_rust_api_cargo_cache` | rust-api dev `:/usr/local/cargo` | build 快取 |
| `rust_api_target` | `rev2-admin_rust_api_target` | rust-api dev `:/app/target` | build 快取 |

> 3 個 key 由舊更名:`redis_data`→`redis_stack_data`、`bw_node_modules`→`base_web_node_modules`、`bw_pnpm_store`→`base_web_pnpm_store`;其餘 4 key 不變、僅前綴隨 auto-prefix 由 `rev2_` → `rev2-admin_`。

---

## 不變式（MUST）

- **前綴**:所有 named volume 實際名 MUST 以 `rev2-admin_` 開頭（auto-prefix,無顯式 `name:`）
- **無顯式 name:**:4 compose 檔的 `volumes:` 區塊 MUST NOT 含 `name:` 行
- **project name**:4 compose 檔 MUST 設頂層 `name: rev2-admin`
- **key 一致**:同一卷的 anchor key 與所有 mount 引用 MUST 一致（含 master ↔ override ↔ standalone）

---

## 邊界（MUST NOT）

- 不改 network 命名（`rev2_net`）
- 不處理 DESIGN redis image-tag 偏離（`7.4.0-v3` vs `latest`）
- 不改 base-web / rust-api worktree source / config.rs
- 不改寫凍結 spec 內文（只加 cross-ref）

---

## 驗收

對應 spec FR-001~FR-006 + FR-012 + SC-001/SC-002。
