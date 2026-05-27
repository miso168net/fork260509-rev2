# Phase 0 Research: dockerfile-rust-api

**Status**: 無 NEEDS CLARIFICATION 待解(spec `/speckit-clarify` 階段已判 no critical ambiguity);本檔為 brainstorm 5 題拍板 + 技術選型的 Decision/Rationale/Alternatives consolidation。

---

## 1. Cargo workspace 結構

**Decision**:3 crate workspace(`server/` + `migration/` + `cleanup-job/`),migration / cleanup-job 為 stub bin。

**Rationale**:
- 對齊 sea-orm 慣例 — `sea-orm-cli migrate` 預設假設 migration 是獨立 crate(不同 dep tree)
- 對齊 DESIGN §4.2 已決(3 個 binary crate 在 workspace root 同層)
- 對齊 §8.1「同一 image 三 binary」設計、entrypoint 區分

**Alternatives considered**:
- 1 crate 多 bin entry(`src/bin/{server,migration,cleanup}.rs`)— 拒絕:dep tree 共享導致每個 binary 都拉全集 deps(image 變大、build 變慢);未來真實 migration / cleanup-job logic 加 sea-orm-cli / cron client 等也會污染 server crate
- 先只做 server bin、migration / cleanup-job 後設 — 拒絕:違反 §8.1 「同一 image 三 binary」設計、後續 Dockerfile 還要回頭改

**驗證對應**:spec FR-001(三入口)、SC-005(migration / cleanup-job entrypoint 各 exit 0)

---

## 2. Multi-stage Dockerfile 結構

**Decision**:3 stage(`builder` + `dev` + `runtime`)。

**Rationale**:
- `builder`(`rust:1.86-slim-bookworm`):full toolchain + apt deps(`pkg-config libssl-dev`)+ release build 3 binary
- `dev`:直接用 `rust:1.86-slim-bookworm` + `cargo install cargo-watch --locked`;無 multi-stage runtime、source bind mount 進來
- `runtime`(`debian:bookworm-slim`):僅含 runtime libs(`libssl3 ca-certificates curl tzdata`)+ non-root user uid 10001 + COPY 3 binary + entrypoint dispatcher

**Rationale 細節**:
- dev / prod 分 stage 避免「dev 跑 prod image 還要 cargo」與「prod runtime 帶 toolchain 太肥」的取捨
- 沒包 `cargo-chef` 預處理 — 對 ~10 deps 的 minimal workspace,BuildKit cache mount(`/usr/local/cargo/registry` + `/git` + `/app/target`)已足夠;cargo-chef 是後續優化選項(workspace 超過 50 deps 才考慮)

**Alternatives considered**:
- 2 stage(builder + runtime,dev 跑 host)— 拒絕:user 拍板 dev 走 in-container(host 沒裝 cargo)
- 4 stage(分 builder-deps + builder-build + dev + runtime)— 拒絕:對 minimal workspace 過度設計,維護成本增

**驗證對應**:spec FR-015(multi-stage)、FR-016(cache 跨 build 共享)、SC-001(< 15 min)、SC-004(< 200MB runtime)

---

## 3. dev profile cargo-watch in-container

**Decision**:dev profile target `dev` stage,內含 `cargo install cargo-watch --locked`,`ENTRYPOINT ["cargo", "watch", "-x", "run --bin server"]`。

**Rationale**:
- 對齊 000 base-web bootstrap 路線(dev 走 container 熱重載、user host 不裝 toolchain)
- bind mount `./rust-api:/app` 讓改 source 進 container 即時可見
- named volume `rust_api_target:/app/target` 避 WSL2 9P 慢與 host worktree 污染

**Rationale 細節**:
- cargo-watch 偵測 inotify;WSL2 9P 上 inotify 不可靠 → 可能需 `--poll` flag。本 feature 先用預設,跑起來不靈再 `cargo watch --poll`(brainstorm §9.1 Open Question)
- Incremental rebuild 30-60s(spec SC-002 < 60s)

**Alternatives considered**:
- 跟 prod 共用 runtime image + entrypoint 改 `cargo run` — 拒絕:runtime image 沒 cargo,要把 cargo 進 runtime image 又違反 minimal runtime
- host 跑 cargo + container 跑 runtime image — 拒絕:user 拍板 dev 走 in-container
- watchexec 替 cargo-watch — 拒絕:cargo-watch 是 cargo 生態標準工具、語意對齊 Rust workflow

**驗證對應**:spec FR-012(自動 rebuild + restart)、FR-013(bind mount)、FR-014(target 不寫回 host)、SC-002

---

## 4. Secret loader: `_FILE` pattern + strict validation

**Decision**:`server/src/config.rs::load_secret(key)`:`<KEY>_FILE` envvar 優先 → bare `<KEY>` envvar fallback → 不存在 panic;讀到值後過 `validate_secret`(非空 + 不在 6 個 placeholder 黑名單 case-insensitive + 長度 ≥ 32)、不通過 panic。

**Rationale**:
- 對齊 DESIGN §6.1 + rev1 004 教訓([CARRY] [RESEARCH §3.2.004](../../../docs/INTEGRATION-RESEARCH.md))
- 完整 `_FILE` pattern 一次到位(user 拍板),避免後續 Phase 1 #5 還要回頭加 loader logic
- 二重驗證紀律(rev1 教訓):`_FILE` 路徑讀出來的值仍過 validation(避免「secret 範本檔內容就是 placeholder 字串」漏到 prod)
- boot panic 無 dev/prod 分支(rev1 教訓:`validate_jwt_secret()` boot-time panic、無 dev/prod 分支)

**6 個 placeholder 黑名單**(case-insensitive):
- `change-me` / `changeme` / `secret` / `xxx` / `<TO_BE_SET>` / `TODO`

**長度紀律**:≥ 32 字元(對齊 rev1 已驗 HS256 安全閾值)

**Alternatives considered**:
- 只接 bare envvar,_FILE 留給 Phase 1 #5 — 拒絕:user 拍板「完整 `_FILE` pattern 一次到位」,Phase 1 #5 scope 變動為「範本檔 + 生成腳本」
- placeholder 黑名單 case-sensitive — 拒絕:operator 易打錯(`Change-Me` / `CHANGE-ME`)、case-insensitive 守護更穩
- 長度 ≥ 64 — 拒絕:rev1 已驗 32 足夠 + 32 字元 base64-encoded random 24 bytes 是 ops 友善長度

**驗證對應**:spec FR-006~FR-011、SC-003(三條 boot panic 路徑 5 秒內 panic)

---

## 5. application.yaml 不含 secret placeholder

**Decision**:`application.yaml` 純結構 + non-secret default(`server.host/port` + `jwt.access_token_ttl_secs/refresh_token_ttl_secs` + `logging.level/format`);**不含**任何 `jwt_secret: "<TO_BE_SET>"` 等 placeholder。Secret 完全走 envvar / `_FILE` 路徑、application.yaml 不接觸 secret。

**Rationale**:
- 避免「placeholder 漏到 image / git history」風險(rev1 R4 教訓:secret_example 漏項)
- 對齊 DESIGN §4.6.1 驗收:`grep -r "<TO_BE_SET>" rust-api/` 應為空
- yaml ≠ secret 通道,結構分離更穩

**Alternatives considered**:
- yaml 內含 `jwt_secret: "${APP_JWT_JWT_SECRET}"` envvar substitution — 拒絕:仍是 placeholder leak 風險,且 serde_yaml 不原生支援 envvar substitution
- yaml 內含 `jwt_secret: "<TO_BE_SET>"` boot-time validate panic — 拒絕:placeholder 出現在 image 內仍是審計風險,且邏輯散布(yaml + loader 各自驗)

**驗證對應**:spec FR-018(yaml 結構)、FR-019(無 placeholder)、SC-006(grep 空)

---

## 6. Entrypoint dispatcher(shell wrapper)

**Decision**:`deploy/entrypoint.rust-api.sh` 為 wrapper script、`ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]` + `CMD ["server"]`;case 內 dispatch 到 `server` / `migration` / `cleanup-job` 三 binary。

**Rationale**:
- 統一 3 binary 入口、compose service 只需 `command: ["server"]` / `["migration", "up"]` / `["cleanup-job", "--execute"]`
- 未來 DESIGN §8.4「shell expand wrapper(migration / redis / cleanup,用 `$(cat /run/secrets/...)` 包 entrypoint)」需求易加(case 內 expand 後 exec)
- 對齊 DESIGN §8.1「entrypoint 區分」描述

**Alternatives considered**:
- 直接用 binary path 做 ENTRYPOINT(每 compose service 寫 `entrypoint: ["/usr/local/bin/server"]`)— 拒絕:compose service 配置散、未來 shell expand 需求得回頭改
- 三個 image tag 各包一個 binary — 拒絕:image 數 ×3、CI build pipeline 拆,違反 §8.1「同一 image 三 binary」

**驗證對應**:spec FR-002(entrypoint dispatcher)、SC-005

---

## 7. Standalone compose + dev/prod profile + port 21081

**Decision**:`docker-compose.rust-api.yml`(workspace root),dev / prod 兩 profile;dev 對外 `127.0.0.1:21081:21081`、prod 同(standalone 期),未來整合 §8.2 後 prod internal-only。

**Rationale**:
- 對齊 000 base-web 模式(standalone 跟未來整套 stack 解耦)
- port 對齊 §8.2 規劃 21081 — 未來整合直接抄 service、不改 port
- 不用 `docker-compose.override.yml` auto-load(rev1 W-F7 教訓:會在 prod 誤暴露 dev port)

**Alternatives considered**:
- standalone 用 quick port(如 9530 避撞)— 拒絕:user 拍板「對齊 §8.2 規劃 21081」,未來整合更順
- 直接交 §8.2 整套 docker-compose.yml + .dev.yml + .prod.yml — 拒絕:overlap Phase 1 #4「容器 port 與編排 feature」,違反 §10 phase 拆分

**驗證對應**:spec FR-017(standalone compose + dev/prod profile)、FR-020(不用 override auto-load)

---

## 8. 風險與緩解

| 風險 | 緩解 |
|---|---|
| WSL2 9P inotify 不可靠導致 cargo-watch 不觸發 | 跑起來不靈即加 `--poll` flag,brainstorm §9.1 已登記為 Open Question |
| 首次 build 因 cargo deps 大量下載超 15 分鐘 | spec SC-001 < 15 min 是 happy path 預期;網路慢可手動 retry,cache mount 確保第二次快 |
| dev profile bare envvar default 漏到 prod | dev profile default 值(`dev_jwt_secret_for_local_only_x32xxxxxx`)長度 ≥ 32 但語意上是 placeholder;mitigation:prod profile **不**走 envvar default、強制走 `_FILE` + 範本檔內容 |
| BuildKit cache mount 在 CI 無 persistence | brainstorm §9.1 已標明 CI 不在本 feature scope;後續 CI feature 處理 |
| secret 範本檔被 operator 誤當實值用 | 範本檔註解明示「example_only_replace_with_openssl_rand_base64_48_xxxxxxxx」+ 包含黑名單字串 → boot panic 自動防護 |

---

## 9. 後續 feature 邊界(來自 spec Assumptions)

本 feature 留給後續 Phase 的 contract:

| Phase / Feature | 留給後續的 contract |
|---|---|
| Phase 1 #4 容器 port 與編排 | 整套 `docker-compose.yml` + `.dev.yml` + `.prod.yml` + obs override;本 feature standalone compose 為過渡 |
| Phase 1 #5 secret 注入機制(scope 變動) | 9 個其他 secret 範本檔(`database_url` / `redis_url` / `postgres_password` / `redis_password` / `cleanup_database_url` + 4 obs 可選)+ `deploy/generate-secrets.sh` + dual-write docs |
| Phase 2 #5 sub-crate setup | 拷貝 `sea-orm-adapter` + `xdb`、重寫 `axum-casbin` + model crate;workspace `members` 加 4 個 crate |
| Phase 2 migration feature | `migration/src/main.rs` stub → 真實 sea-orm-migration logic + 10+ entity migration + sys_user seed |
| Phase 3 登入 + getUserInfo | `server/src/` 加 `api/` + `service/` + `router/` + `middleware/`;Casbin enforce 首次啟用 |
| Phase 5 cleanup-job feature | `cleanup-job/src/main.rs` stub → 真實 soft-delete 物理清理 + dry-run + cron |
