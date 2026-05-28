# Feature Specification: docker-volume-naming

**Feature Branch**: `006-docker-volume-naming`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "統一 rev2 named volume 命名為 `rev2-admin_<service>_<purpose>`(移除顯式 `name:` 靠 docker auto-prefix;3 key 更名 redis_data→redis_stack_data / bw_node_modules→base_web_node_modules / bw_pnpm_store→base_web_pnpm_store;4 compose 檔設 `name: rev2-admin`)"

**Phase 0 brainstorm source**: [`docs/superpowers/006-docker-volume-naming.md`](../../docs/superpowers/006-docker-volume-naming.md)

---

## Clarifications

### Session 2026-05-28

- 全 taxonomy 掃描結果:**無 spec-level critical ambiguity 需正式 clarify**。Phase 0 brainstorm 已拍板全部 5 項設計決策(key+name 同改 / `rev2-admin_` auto-prefix 移除顯式 `name:` / 凍結 spec 加 superseded 註記 / `docs/superpowers/000` 全面改寫 / 全 7 卷),spec checklist 16/16 PASS、0 [NEEDS CLARIFICATION]。
- Deferred 到 `/speckit-plan`:具體實作細節(各 compose 檔逐行編輯點 / 各 doc cross-ref 落點 / 卷遷移指令序)屬 plan-level,不影響 spec 的 WHAT 與驗收。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — named volume 命名統一、grep 友善 (Priority: P1) 🎯 MVP

維運者啟動 rev2 dev stack 後,所有 docker named volume 都以一致前綴 `rev2-admin_<service>_<purpose>` 命名(與 container `rev2-admin-*`、project name `rev2-admin` 對齊),`docker volume ls | grep rev2-admin` 一次抓出全部 7 個,不再混用 `rev2_` 前綴或 `bw`/`redis` 縮寫。

**Why this priority**:這是本 feature 的核心價值與 MVP —— 目前 7 個卷用顯式 `name: rev2_*` 繞過 project 前綴,且 service 段縮寫不一致(`bw`/`redis` vs `front_nginx`/`rust_api`),難以一致 grep、與 container/network 命名脫節。統一後 `rev2-admin` 一個關鍵字涵蓋容器 / 卷 / 網路,維運可預測。優先級 P1。

**Independent Test**:改 4 個 compose 檔(移除顯式 `name:` + 3 個 key/service 段更名 + 2 standalone 加 `name: rev2-admin`)→ 移除舊卷 → `up -d --wait` → `docker volume ls | grep '^rev2-admin_' | wc -l` = 7 且 `grep '^rev2_'`(舊前綴)= 0,即驗。

**Acceptance Scenarios**:

1. **Given** 4 個 compose 檔已改、舊卷已移除,**When** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`,**Then** exit 0、5 service 全 healthy,且 7 個 named volume 皆以 `rev2-admin_<service>_<purpose>` 命名
2. **Given** dev stack running,**When** `docker volume ls | grep '^rev2-admin_'`,**Then** 列出 7 個:`postgres_data` / `redis_stack_data` / `front_nginx_certs` / `base_web_node_modules` / `base_web_pnpm_store` / `rust_api_cargo_cache` / `rust_api_target`
3. **Given** 改名落地,**When** `docker volume ls | grep '^rev2_'`(舊前綴),**Then** 無輸出(舊命名卷已不存在)
4. **Given** stack running,**When** `psql -U soybean -d soybean_admin_rust -c '\conninfo'` 與 redis requirepass 連線,**Then** 皆成功(005 dual-write 與資料持久化不受改名影響)

---

### User Story 2 — 命名規則文件化為操作權威 (Priority: P2)

維運者 / 新進開發者打開 `CLAUDE.md` §8.2,在容器 endpoint 表看到新增的「docker volume name」列,並有獨立 §8.2.2 小節寫明命名規則(`rev2-admin_<service>_<purpose>`、移除顯式 `name:` 靠 auto-prefix)與正典 7 卷清單;§8.2.1 的 live 指令也用新卷名。日後新增卷有單一可遵循的規則。

**Why this priority**:規則文件化是「自說明」介面 —— 讓任何人不需讀 compose 就知道卷命名規則、未來新卷自動合規。P2(P1 卷名統一後,規則落為權威是第二層價值,也是團隊協作依據)。

**Independent Test**:`grep -A` 檢查 `CLAUDE.md` §8.2 表含「docker volume name」列、§8.2.2 存在且列出 7 正典卷名、§8.2.1 無殘留舊卷名,即驗。

**Acceptance Scenarios**:

1. **Given** 本 feature 落地,**When** 開 `CLAUDE.md` §8.2,**Then** 表格有「docker volume name」列(rev1 auto-prefix vs rev2 `rev2-admin_<service>_<purpose>`)
2. **Given** 本 feature 落地,**When** 看 §8.2.2,**Then** 寫明命名規則 + 正典 7 卷清單(新名)
3. **Given** 本 feature 落地,**When** `grep 'rev2_front_nginx_certs\|rev2_postgres_data' CLAUDE.md` §8.2.1 區,**Then** 無殘留(已改新名)

---

### User Story 3 — 既有文件對齊(權威同步 + 持久記憶改寫 + 凍結 spec 註記) (Priority: P3)

設計權威 `INTEGRATION-DESIGN.md` 的卷名引用同步為新名;持久記憶 `docs/superpowers/000-base-web-docker-bootstrap.md` 全面改寫舊卷名/key 為新名(它是 living 參考、應反映 current);已凍結的 feature spec(002/004/005 + 002 brainstorm + INTEGRATION-RESEARCH)**不改寫內文**(保留該 feature 當時 as-built),僅於各受影響 feature 最 load-bearing 處加 1 行 superseded cross-ref 指向 006。

**Why this priority**:文件對齊確保「權威 + living 參考」反映 current、「凍結歷史」維持 audit 軌跡。P3(整合收尾,讓整個 doc 體系一致而不破壞歷史紀錄 doctrine)。

**Independent Test**:`grep` DESIGN/000 無舊卷名(已改)、凍結 spec 內文舊名仍在(未改寫)+ 各受影響 feature 有 cross-ref 指向 006,即驗。

**Acceptance Scenarios**:

1. **Given** 本 feature 落地,**When** `grep 'redis_data' INTEGRATION-DESIGN.md`,**Then** 已改為 `redis_stack_data`(權威同步)
2. **Given** 本 feature 落地,**When** `grep 'rev2_bw_\|bw_node_modules' docs/superpowers/000-base-web-docker-bootstrap.md`,**Then** 無殘留(全面改寫為 `base_web`)
3. **Given** 本 feature 落地,**When** 檢查 `specs/004/**`、`specs/002/**`,**Then** 內文舊卷名保留(歷史)、且有 1 行 superseded cross-ref 指向 006

---

### Edge Cases

- **舊卷未移除直接 up**:改 key/移除 `name:` 後 `up`,docker 會以新名建空卷,舊 `rev2_*` 卷變孤兒殘留 → 落地文件須明示先 `docker volume rm` 舊 7 卷(或接受孤兒、之後手動清)
- **standalone compose 未加 `name: rev2-admin`**:standalone 會以自身 project 前綴建卷、與 master 不共用 → 須為 2 個 standalone 檔加 `name: rev2-admin` 保持一致(即使 standalone 已 DEPRECATED)
- **postgres/redis 資料卷重建**:dev 無真實資料(對齊 005 R9),重建零損失;若日後 prod 有真實資料,改名需資料遷移(本 feature dev-only,不涉)
- **凍結 spec 被誤改寫**:若把 002/004/005 內文卷名改新,會破壞「spec = 該 feature 凍結紀錄」doctrine 與 004→005 先例 → 明確 MUST NOT 改寫內文,只加 cross-ref

---

## Requirements *(mandatory)*

### Functional Requirements

**命名規則與 compose 改動**

- **FR-001**:所有 named volume 的實際卷名 MUST 為 `rev2-admin_<service>_<purpose>`,經 docker 以 `COMPOSE_PROJECT_NAME`(`rev2-admin`)auto-prefix 產生(不用顯式 `name:`)
- **FR-002**:4 個 compose 檔(`docker-compose.yml` + `docker-compose.dev.yml` 引用 + `docker-compose.base-web.yml` + `docker-compose.rust-api.yml`)MUST 移除所有顯式 volume `name:`
- **FR-003**:2 個 standalone compose 檔(`docker-compose.base-web.yml` / `docker-compose.rust-api.yml`)MUST 設頂層 `name: rev2-admin`,使 auto-prefix 與 master 一致、共用同一物理卷
- **FR-004**:compose volume key MUST 為 `<service>_<purpose>`;3 個 key 更名:`redis_data`→`redis_stack_data`、`bw_node_modules`→`base_web_node_modules`、`bw_pnpm_store`→`base_web_pnpm_store`(其餘 4 key 不變)
- **FR-005**:所有引用該 3 個 key 的 service mount(`redis_data:/data`、`bw_node_modules:/app/node_modules`、`bw_pnpm_store:/pnpm-store`)MUST 同步更名
- **FR-006**:`<service>` MUST 用 CLAUDE.md §1 短名、`-`→`_`(`front_nginx` / `base_web` / `rust_api` / `postgres` / `redis_stack`);`<purpose>` ∈ `data` / `certs` / `node_modules` / `pnpm_store` / `cargo_cache` / `target`

**文件**

- **FR-007**:`CLAUDE.md` §8.2 表 MUST 新增「docker volume name」列;MUST 新增 §8.2.2 命名規則 + 正典 7 卷清單;§8.2.1 live 指令的舊卷名 MUST 更新為新名
- **FR-008**:`docs/INTEGRATION-DESIGN.md`(權威)對舊卷名的引用 MUST 同步為新名(如 `redis_data`→`redis_stack_data`)
- **FR-009**:`docs/superpowers/000-base-web-docker-bootstrap.md`(持久記憶)MUST 全面改寫所有舊卷名/key(`rev2_bw_*` / `bw_*`)為新名(`rev2-admin_base_web_*` / `base_web_*`)
- **FR-010**:已凍結 spec(`specs/002/**`、`specs/004/**`、`specs/005/**`、`docs/superpowers/002-dockerfile-base-web.md`、`docs/INTEGRATION-RESEARCH.md`)MUST NOT 改寫內文舊卷名;MUST 於**以該卷為交付物的受影響 feature(002 範本定義 / 004 compose 卷宣告)**最 load-bearing 處加 1 行 superseded cross-ref 指向 006。005 對 `bw_node_modules` 僅 plan deviation 內 incidental 歷史提及(非卷交付宣告)→ 不加 cross-ref、內文保留

**驗證不變式**

- **FR-011**:改名 + 卷遷移後,dev stack `up -d --wait` MUST 5 service 全 healthy;005 dual-write 不變式(`psql -U soybean` 連線、redis requirepass)MUST 仍成立

**scope 邊界 / 不做的事**

- **FR-012**:MUST NOT 改 network 命名(`rev2_net`);MUST NOT 處理 `INTEGRATION-DESIGN.md` redis image-tag 偏離(`7.4.0-v3` vs `latest`);MUST NOT 改動 `base-web/` `rust-api/` worktree source

### Key Entities *(include if feature involves data)*

- **named volume(7)**:4 個 service 持久/快取卷 —— `postgres_data`(data)、`redis_stack_data`(data)、`front_nginx_certs`(certs)+ build 快取 `base_web_node_modules` / `base_web_pnpm_store` / `rust_api_cargo_cache` / `rust_api_target`;實際卷名皆 `rev2-admin_` 前綴
- **compose 檔(4)**:master `docker-compose.yml`(+ dev/prod override 引用)+ 2 個 DEPRECATED standalone;皆設 `name: rev2-admin`、無顯式 volume `name:`
- **命名規則**:`key = <service>_<purpose>`、`實際名 = rev2-admin_<service>_<purpose>`(auto-prefix);`<service>` 用 §1 短名 `-`→`_`

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**:改名 + 卷遷移後,`docker volume ls | grep '^rev2-admin_' | wc -l` = 7,且 `docker volume ls | grep '^rev2_'`(舊前綴)= 0
- **SC-002**:4 個 live compose 檔 `grep` 舊 key / 舊顯式 `name: rev2_*` = 0
- **SC-003**:dev stack `up -d --wait` 5 service 全 healthy,`psql -U soybean -d soybean_admin_rust` 連線成功(005 dual-write 不破)
- **SC-004**:`CLAUDE.md` §8.2.2 命名規則 + 正典 7 卷清單存在;`INTEGRATION-DESIGN.md` / `docs/superpowers/000` 已改為新卷名(grep 舊名 = 0)
- **SC-005**:凍結 spec 內文舊卷名保留(grep 仍在,未改寫)+ 以卷為交付物的受影響 feature(**002 / 004**)有 superseded cross-ref 指向 006(005 為 incidental 歷史提及,不需 cross-ref)

---

## Assumptions

- **stack 目前已 down**:無 container 占用舊卷,可安全 `docker volume rm` 重建。
- **dev 無真實資料**:postgres / redis 資料卷只有 dev init,重建零損失(對齊 005 R9);build 快取重建(pnpm install / cargo build 重跑一次)成本可接受。
- **`COMPOSE_PROJECT_NAME` = `rev2-admin`**:已設於 `docker-compose.yml` 頂層 `name:`,auto-prefix 前綴穩定。
- **無單元測試**:本 feature 為 compose 設定 + 文件更名,無新純函式邏輯;驗收由 C-V acceptance command 覆蓋(對齊 CLAUDE.md §3 + 003/004/005 慣例)。
- **凍結 spec doctrine**:spec-kit feature 文件為該 feature 凍結 audit 紀錄,不因後續改名而改寫(沿用 004→005 postgres rename 先例)。

### 不在 scope

network 命名(`rev2_net`,本 feature 只動 volume);`INTEGRATION-DESIGN.md` redis image-tag 偏離(屬另一既存 doc 偏離);base-web / rust-api worktree source 改動;prod 真實資料卷遷移(本 feature dev-only)。
