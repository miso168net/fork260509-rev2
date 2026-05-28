# Phase 0 Research: docker-volume-naming

> 6 個 research 主題,全為既有 compose / docs ground truth grep + docker auto-prefix 行為確認。
> 本 feature 純 compose 命名 + 文件 refactor,不涉 wire / rust service / DTO。
> **§I.5 紀律遵守**:research **未** grep rev1 source;所有 grep 針對 rev2 現有產物（4 個 docker-compose / CLAUDE.md / DESIGN / 000 / 凍結 spec）。

---

## R1 — 現有 4 compose 的 volume 宣告 ground truth

**Decision**:7 卷目前皆用顯式 `name: rev2_*`;改為移除 `name:`、key 改 `<service>_<purpose>`、靠 auto-prefix。

**Ground truth**:
- `docker-compose.yml` `volumes:` 區塊:7 卷皆 `name: rev2_<x>`（`postgres_data`→`rev2_postgres_data`、`redis_data`→`rev2_redis_data`、`front_nginx_certs`、`bw_node_modules`、`bw_pnpm_store`、`rust_api_cargo_cache`、`rust_api_target`）；mount:postgres `postgres_data:/var/lib/postgresql/data`、redis-stack `redis_data:/data`。
- `docker-compose.dev.yml`:base-web mount `bw_node_modules:/app/node_modules` + `bw_pnpm_store:/pnpm-store`;rust-api mount `rust_api_cargo_cache` / `rust_api_target`（key 不變）。
- `docker-compose.base-web.yml`（DEPRECATED）:`volumes: { bw_node_modules: {name: rev2_bw_node_modules}, bw_pnpm_store: {name: rev2_bw_pnpm_store} }` + mount;L16 註解 `docker volume rm rev2_bw_node_modules`;**無頂層 `name:`**。
- `docker-compose.rust-api.yml`（DEPRECATED）:`rust_api_cargo_cache: {name: rev2_rust_api_cargo_cache}` / `rust_api_target: {name: rev2_rust_api_target}`;**無頂層 `name:`**。
- `docker-compose.yml` 頂層有 `name: rev2-admin`（L15）。

**Rationale**:顯式 `name: rev2_*` 是當初為「繞過 project 前綴」刻意加的（L13 註解）;本 feature 反轉此決定 — 改用 project 前綴,故移除 `name:`。

---

## R2 — docker compose named-volume auto-prefix 行為

**Decision**:移除顯式 `name:` 後,docker 以 `<COMPOSE_PROJECT_NAME>_<volume-key>` 命名卷;project name = `rev2-admin`（compose 頂層 `name:`）→ 卷名 `rev2-admin_<service>_<purpose>`。

**Ground truth / 佐證**:rev1 既有卷 `rev1-admin_postgres_data` 等即此行為產物（project `rev1-admin` + key `postgres_data`，無顯式 name）。分隔符為 `_`、project name 內的 `-` 保留 → `rev2-admin_redis_stack_data`。

**Rationale**:這是 docker compose 預設行為,無需顯式 `name:`;與 container（`rev2-admin-*`）前綴對齊、grep 友善（user 拍板目標）。

**Alternatives considered**:保留顯式 `name: rev2-admin_*` — 否決（等於手寫 docker 會自動產的名、冗餘且要維護;brainstorm D3 拍板移除）。

---

## R3 — standalone compose 共用卷需設 project name

**Decision**:2 個 DEPRECATED standalone（`docker-compose.{base-web,rust-api}.yml`）MUST 加頂層 `name: rev2-admin`,否則 auto-prefix 會用各自 project（預設 = 目錄名）、與 master 不共用卷。

**Ground truth**:2 個 standalone 目前**無**頂層 `name:`,靠顯式 `name: rev2_*` 與 master 共用卷。移除顯式 `name:` 後,若不補頂層 `name: rev2-admin`,standalone 將建 `<dir>_<key>` 卷、與 master 的 `rev2-admin_<key>` 分裂。

**Rationale**:加 `name: rev2-admin` 使 master 與 standalone 的 auto-prefix 前綴一致、共用同一物理卷（即使 standalone 已 DEPRECATED,維持一致避免日後 debug 用時困惑）。

**Alternatives considered**:standalone 不補 project name、接受分裂 — 否決（DEPRECATED 但仍應一致;成本僅 1 行）。

---

## R4 — 凍結 spec doctrine（不改寫、加 cross-ref）

**Decision**:已凍結 feature spec（002/004/005 + 002 brainstorm + INTEGRATION-RESEARCH）內文舊卷名**不改寫**;於各受影響 feature load-bearing 處加 1 行 superseded cross-ref 指向 006。

**Ground truth / 先例**:005 改 postgres 命名（`rev2admin`→`soybean`）取代 004 時,**未改寫** 004 spec.md,只在 `004/contracts/service-secrets.md` 加 superseded 註記（本 session 落地）。CLAUDE.md §7 + §3 亦定 spec-kit 文件為「該 feature 凍結 audit 紀錄」。

**Rationale**:凍結 spec 記錄該 feature 當時 as-built;後續改名屬新 feature（006）、不屬舊 feature。改寫凍結內文破壞 audit 軌跡。

**Alternatives considered**:全面改寫舊 spec 卷名 — 否決（破 doctrine + churn 大;brainstorm D4 拍板）。

---

## R5 — 文件引用範圍 grep（全 repo,僅 rev2）

**Decision**:舊卷名 / 舊 key 引用分布於 LIVE（4 compose）/ 權威（DESIGN）/ 持久記憶（000）/ 操作參考（CLAUDE.md §8.2）/ 凍結（002/004/005 specs + 002 brainstorm + RESEARCH）。

**Ground truth**（grep `rev2_(redis|bw|postgres|front_nginx|rust_api)` / `bw_node_modules` / `redis_data:` 等）:
- LIVE:`docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.base-web.yml`、`docker-compose.rust-api.yml`。
- 權威:`docs/INTEGRATION-DESIGN.md:891`（裸 key `redis_data`）。
- 持久記憶:`docs/superpowers/000-base-web-docker-bootstrap.md`（~14 處 `rev2_bw_*` / `bw_*`）。
- 操作參考:`CLAUDE.md` §8.2.1（`rev2_front_nginx_certs` 等 live 指令）。
- 凍結:`specs/002/**`（data-model/quickstart/compose-profiles）、`specs/004/**`（spec/plan/data-model/research/tasks）、`specs/005/plan.md`（deviation 內提 `bw_node_modules`）、`docs/superpowers/002-dockerfile-base-web.md`、`docs/INTEGRATION-RESEARCH.md:1008`。

**Rationale**:依 brainstorm 5 決策分類處置（LIVE/權威/持久記憶 = 改;凍結 = 不改寫加 cross-ref）。

---

## R6 — 卷遷移成本（dev 無真實資料）

**Decision**:改 key/移除 `name:` 後須 `docker volume rm` 全 7 個舊 `rev2_*` 卷（孤兒）,`up --wait` 重建 7 個 `rev2-admin_*`。

**Rationale**:docker 不就地 rename 卷;改 key/name 等於指向新卷、舊卷成孤兒。dev postgres/redis 無真實資料（對齊 005 R9）、build 快取重建（pnpm install / cargo build 重跑一次）、front_nginx_certs 可重 seed → 重建零資料損失。stack 目前已 down、無 container 占用,可安全 rm。

**Ground truth**:`docker volume ls | grep rev2` 現有 7 個 `rev2_*`;`docker ps` 無 rev2 container（005 收尾已 `down`）。

**Alternatives considered**:`docker volume create` 新名 + 手動 copy 舊卷資料 — 否決（dev 無真資料、徒增複雜;直接重建即可）。

---

## 總結

6 主題全 confirmed,無 NEEDS CLARIFICATION 遺留。關鍵 implementation 注意點:
1. **移除顯式 `name:`、靠 auto-prefix**（R1/R2）— project name `rev2-admin` 為唯一前綴源
2. **2 standalone 補 `name: rev2-admin`**（R3）— 否則卷分裂
3. **3 key 更名 + mount 同步**（R1）:redis_data→redis_stack_data、bw_*→base_web_*
4. **凍結 spec 不改寫、加 cross-ref**（R4，沿用 004→005 先例）
5. **遷移先 rm 7 舊卷再 up**（R6,dev 零損失）
6. **不改 network / base-web / rust-api / config.rs**（R5/FR-012）
