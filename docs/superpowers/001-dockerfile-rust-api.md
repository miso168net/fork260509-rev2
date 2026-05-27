# 001 · dockerfile-rust-api

> rev2 第一個 spec-kit feature 的 Phase 0 brainstorm spec-design。
> 對應 rev1 W-F1(dockerfile-rust-api)+ DESIGN §10 Phase 1 #1。
>
> 編號 `001` = 對齊 CLAUDE.md §3 階段 0「`docs/superpowers/<NNN>-<feature-name>.md`」命名。
> 本檔是 spec-kit `/speckit-specify` 的 input 來源(階段 0 → 階段 1 的交棒物件)。

---

## 1. 目的與紀律

### 1.1 為什麼是第一個 feature

- rev2 rust-api worktree 是空白 anew repo(`fork260509-rev2-anew-rust-api`)— 任何後續 feature(JWT 機密管理 / soft-delete / 業務 endpoint)都需要先有「能 build 成 image 跑起來」的 baseline
- rev1 W-F1 把這個 feature 列為部署起點(`[CARRY]`,RESEARCH §3.4.006);rev2 從 0 重寫但設計直接沿用(image 基底 / multi-stage / BuildKit cache mount / 3 binary / non-root)
- 本 feature 落地後,Phase 1 #2-#5 才能在這個骨架上加 TLS / port 編排 / 完整 secret 範本檔等

### 1.2 軌道對齊

- 屬 `RUSTAPI-SOURCE-ISOLATION` 軌道(DESIGN §7.6)— rust-api 全新寫、不從 rev1 source 拷貝 code
- 設計繼承 rev1 W-F1(006)、JWT secret strict validation(004)的踩雷紀錄,但**不 grep rev1 source**(§7.5 源碼隔離)

### 1.3 與後續 feature 的邊界

| feature | 本 feature 交 | 留給後續 |
|---|---|---|
| Phase 1 #1 dockerfile-rust-api(**本**) | 3 crate workspace 骨架 + axum 啟動骨架 + `/health` + 完整 `_FILE` secret loader + multi-stage Dockerfile + standalone compose | — |
| Phase 1 #2 dockerfile-base-web | base-web Dockerfile(已 bootstrap,000) | 整合到 §8.2 整套 compose |
| Phase 1 #3 TLS 憑證 skeleton | — | `deploy/generate-dev-cert.sh` + dev/prod nginx conf |
| Phase 1 #4 容器 port 與編排 | standalone compose 已對齊 §8.2 規劃 port 21081 | `docker-compose.yml` + `.dev.yml` + `.prod.yml` 整套 + obs-min / obs-full override |
| **Phase 1 #5 secret 注入機制(scope 變動)** | secret loader logic + 2 個 JWT 範本檔 | **變動後**:9 個其他 secret 範本檔(database_url / redis_url / postgres_password / redis_password / cleanup_database_url + 4 obs 可選)+ `deploy/generate-secrets.sh` 生成腳本 + dual-write 紀律 docs |
| Phase 2 #5 sub-crate setup | — | 拷貝 `sea-orm-adapter` + `xdb`、重寫 `axum-casbin` + model crate |
| Phase 2 migration feature | migration crate 骨架(stub bin) | 真實 sea-orm-migration logic + 10+ entity migration + sys_user seed |
| Phase 5 cleanup-job feature | cleanup-job crate 骨架(stub bin) | 真實 soft-delete 物理清理 + dry-run + cron |

---

## 2. Scope 凍結摘要

| 維度 | 拍板結果 |
|---|---|
| **Rust workspace 結構** | 3 crate workspace(`server/` + `migration/` + `cleanup-job/`),migration/cleanup-job 為 stub bin |
| **server bin 內容** | axum 啟動骨架 + `/health` 真實 endpoint + `application.yaml` 載入 + JWT secret strict validation + logging init(`tracing` + `tracing-subscriber`),**不接 DB / Redis / Casbin** |
| **migration/cleanup-job bin** | `println!` stub 訊息 + 正常 exit |
| **Secret loading** | 完整 `_FILE` pattern 一次到位:`APP_JWT_JWT_SECRET_FILE` 優先 → `APP_JWT_JWT_SECRET` fallback → 不存在 panic;strict validation 含 6 黑名單 + 長度 ≥ 32;同樣機制 reuse 給 `APP_JWT_REFRESH_TOKEN_SECRET` |
| **Dockerfile** | multi-stage(builder / dev / runtime):`rust:1.86-slim-bookworm`(builder)+ `debian:bookworm-slim`(runtime);BuildKit cache mount(`/usr/local/cargo/registry` + `/git` + `/app/target`);release build 3 binary 全進 runtime;non-root uid 10001;runtime deps:`libssl3` + `curl` + `tzdata` + `ca-certificates` |
| **dev profile** | `cargo-watch -x 'run --bin server'` in-container(builder image 直接跑、無 multi-stage)+ bind mount source + named volume mask `target/` + `cargo` cache |
| **prod profile** | multi-stage runtime image;entrypoint 區分 server / migration / cleanup-job |
| **standalone compose** | `docker-compose.rust-api.yml`(workspace root)+ `deploy/Dockerfile.rust-api.txt`(對齊 000 base-web 路線);port `127.0.0.1:21081:21081`(對齊 §8.2 規劃,未來整合直接抄) |
| **Phase 1 #5 scope 變動** | secret loader logic 本 feature 已交,Phase 1 #5 變成「9 個其他 secret 範本檔 + generate-secrets.sh + dual-write docs + DB/Redis 整合」 |

---

## 3. Cargo Workspace 結構

### 3.1 檔案結構

```
rust-api/                                   ← workspace root(rust-api/.git 為 worktree gitlink)
├── Cargo.toml                              workspace 設定(members + workspace.dependencies 集中版本)
├── Cargo.lock                              提交(binary workspace 紀律,確保 reproducible build)
├── rust-toolchain.toml                     pin `channel = "1.86"`(對齊 §8.1 image base)
├── .dockerignore                           排除 target/ / *.md / .git / 等
├── application.yaml                        config(結構 + non-secret default,server bin 讀)
├── server/                                 axum HTTP server bin
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                         entry: tracing → config → router → serve
│       └── config.rs                       _FILE pattern loader + strict validation
├── migration/                              sea-orm migration stub
│   ├── Cargo.toml
│   └── src/main.rs                         println! stub
└── cleanup-job/                            cleanup stub
    ├── Cargo.toml
    └── src/main.rs                         println! stub
```

### 3.2 對齊 / 偏離 DESIGN §4.2

- ✅ **對齊命名**:`server/` + `migration/` + `cleanup-job/`(DESIGN §4.2 三個 binary crate)
- ⏭ **本 feature 不建**:`model/` / `sea-orm-adapter/` / `xdb/` / `axum-casbin/`(Phase 2 #5 sub-crate setup feature scope)
- ⏭ **server bin 本 feature 不建**:`api/` / `service/` / `middleware/` / `router/` / `error.rs` / `envelope.rs` / `state.rs`(Phase 2/3 feature 自然增長)
- ✅ **對齊 `config.rs` 設計**:`_FILE` pattern,DESIGN §4.2 L351

### 3.3 workspace.dependencies(集中版本)

```toml
# rust-api/Cargo.toml
[workspace]
members = ["server", "migration", "cleanup-job"]
resolver = "2"

[workspace.dependencies]
# axum + runtime
axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
# config + secret
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"
# logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
# error
anyhow = "1"
thiserror = "1"
```

> 注:config crate(YAML loader)本 feature 不用 — 因 application.yaml 結構簡單、secret 走獨立 loader,直接用 `serde_yaml::from_str` 即可。Phase 2 起若 config 結構變複雜再引 `config` crate。

---

## 4. server bin 內容

### 4.1 `application.yaml` 結構

```yaml
# rust-api/application.yaml
# 提供結構與 non-secret default;secret 一律走 _FILE / envvar 注入
server:
  host: "0.0.0.0"
  port: 21081

jwt:
  # 本 feature 只載入 + validate;後續 Phase 3 JWT signing feature 才用 ttl
  access_token_ttl_secs: 3600        # 1h
  refresh_token_ttl_secs: 604800     # 7d

logging:
  level: "info"     # trace / debug / info / warn / error
  format: "json"    # json / pretty
```

**紀律**:application.yaml 內**不含任何 secret placeholder**(不寫 `jwt_secret: "<TO_BE_SET>"`)— secret 完全走 envvar / `_FILE` 路徑、yaml 不接觸 secret,避免「placeholder 漏到 image / git history」風險。`grep -r "<TO_BE_SET>" rust-api/` 應為空(對應 DESIGN §4.6.1 驗收)。

### 4.2 `server/src/config.rs` — `_FILE` pattern + strict validation

```rust
// rust-api/server/src/config.rs
use std::fs;
use anyhow::Context;
use serde::Deserialize;

const PLACEHOLDER_SECRETS: &[&str] = &[
    "change-me", "changeme", "secret", "xxx",
    "<TO_BE_SET>", "TODO",
];

#[derive(Debug, Deserialize)]
pub struct AppConfigYaml {
    pub server: ServerConfig,
    pub jwt: JwtYaml,
    pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
pub struct JwtYaml {
    pub access_token_ttl_secs: u64,
    pub refresh_token_ttl_secs: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
}

#[derive(Debug)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub jwt: JwtConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug)]
pub struct JwtConfig {
    pub access_token_ttl_secs: u64,
    pub refresh_token_ttl_secs: u64,
    pub jwt_secret: String,            // loaded via load_secret()
    pub refresh_token_secret: String,  // loaded via load_secret()
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        // 1. 讀 application.yaml(non-secret 結構)
        let raw = fs::read_to_string("application.yaml")
            .context("application.yaml read failed")?;
        let yaml: AppConfigYaml = serde_yaml::from_str(&raw)
            .context("application.yaml parse failed")?;

        // 2. secret 走 _FILE / envvar(獨立、不經 yaml)
        let jwt_secret = load_secret("APP_JWT_JWT_SECRET")?;
        let refresh_token_secret = load_secret("APP_JWT_REFRESH_TOKEN_SECRET")?;

        Ok(AppConfig {
            server: yaml.server,
            jwt: JwtConfig {
                access_token_ttl_secs: yaml.jwt.access_token_ttl_secs,
                refresh_token_ttl_secs: yaml.jwt.refresh_token_ttl_secs,
                jwt_secret,
                refresh_token_secret,
            },
            logging: yaml.logging,
        })
    }
}

/// `_FILE` precedence over bare envvar; strict validation always applied.
/// Reads `<key>_FILE` → file content; falls back to `<key>` envvar; else panic.
/// Validates: non-empty, not in PLACEHOLDER_SECRETS, len >= 32.
fn load_secret(key: &str) -> anyhow::Result<String> {
    let file_key = format!("{key}_FILE");
    let value = if let Ok(path) = std::env::var(&file_key) {
        fs::read_to_string(&path)
            .with_context(|| format!("{file_key}={path} read failed"))?
            .trim()
            .to_string()
    } else if let Ok(v) = std::env::var(key) {
        v
    } else {
        anyhow::bail!("neither {key} nor {file_key} set");
    };

    validate_secret(key, &value)?;
    Ok(value)
}

fn validate_secret(key: &str, v: &str) -> anyhow::Result<()> {
    if v.is_empty() {
        anyhow::bail!("{key} is empty");
    }
    if PLACEHOLDER_SECRETS.iter().any(|p| v.eq_ignore_ascii_case(p)) {
        anyhow::bail!("{key} is a placeholder value");
    }
    if v.len() < 32 {
        anyhow::bail!("{key} length {} < 32", v.len());
    }
    Ok(())
}
```

### 4.3 `server/src/main.rs` — entry

```rust
// rust-api/server/src/main.rs
mod config;

use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. config load(_FILE pattern + strict validation;失敗 boot panic)
    let cfg = config::AppConfig::load()
        .expect("config load failed (boot panic by design)");

    // 2. tracing init(用 cfg.logging.level + format)
    init_tracing(&cfg.logging);

    // 3. minimal router — 只 /health,本 feature 不接 router/api/middleware/state
    let app = Router::new().route("/health", get(health));

    let addr: SocketAddr = format!("{}:{}", cfg.server.host, cfg.server.port).parse()?;
    tracing::info!(?addr, "rust-api server listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "ok"
}

fn init_tracing(cfg: &config::LoggingConfig) {
    use tracing_subscriber::{EnvFilter, fmt};
    let filter = EnvFilter::try_new(&cfg.level)
        .unwrap_or_else(|_| EnvFilter::new("info"));
    match cfg.format.as_str() {
        "pretty" => fmt().with_env_filter(filter).pretty().init(),
        _ => fmt().with_env_filter(filter).json().init(),
    }
}
```

### 4.4 `migration` + `cleanup-job` stub

```rust
// rust-api/migration/src/main.rs
fn main() {
    println!("migration stub — will be implemented in Phase 2 migration feature");
}

// rust-api/cleanup-job/src/main.rs
fn main() {
    println!("cleanup-job stub — will be implemented in Phase 5 cleanup-job feature");
}
```

### 4.5 紀律重點

- **yaml ≠ secret 通道**:application.yaml 從不含 secret placeholder,純結構 + non-secret default
- **secret 二重驗證**:`_FILE` 路徑讀出來的值也必過 `validate_secret`(避免「secret 寫範本檔變 placeholder 內容」漏到 prod)
- **boot panic 紀律**:`AppConfig::load()` 失敗 → `expect()` panic;**無 dev/prod 分支**,跟 DESIGN §6.1 一致
- **stub 命名規律**:Phase 2/5 真實 feature 落地時,只改 stub 的 `main.rs` 內容,不動 Cargo.toml / crate 結構

---

## 5. Dockerfile + entrypoint

### 5.1 檔案位置(對齊 000 base-web)

| 檔 | 位置 | 備註 |
|---|---|---|
| `deploy/Dockerfile.rust-api.txt` | workspace root `deploy/` | `.txt` 副檔名隨 000 base-web 慣例;build context = workspace root |
| `deploy/entrypoint.rust-api.sh` | workspace root `deploy/` | binary dispatcher;COPY 進 image `/usr/local/bin/entrypoint.sh` |
| `rust-api/.dockerignore` | rust-api worktree 內 | rust-api 是新建 worktree、可以放,與 000 base-web 不同(那個是 upstream 不能改) |

### 5.2 Multi-stage Dockerfile(3 stage)

```dockerfile
# deploy/Dockerfile.rust-api.txt
# syntax=docker/dockerfile:1.7  # BuildKit cache mount 需要

# ───── Stage: builder ─────────────────────────────────────────
FROM rust:1.86-slim-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
 && rm -rf /var/lib/apt/lists/*

COPY rust-api/Cargo.toml rust-api/Cargo.lock rust-api/rust-toolchain.toml ./
COPY rust-api/server ./server
COPY rust-api/migration ./migration
COPY rust-api/cleanup-job ./cleanup-job

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release --bins \
 && mkdir -p /out \
 && cp target/release/server target/release/migration target/release/cleanup-job /out/

# ───── Stage: dev ────────────────────────────────────────────
# dev profile target — 直接用 builder image + cargo-watch,無 multi-stage runtime
FROM rust:1.86-slim-bookworm AS dev
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
 && rm -rf /var/lib/apt/lists/* \
 && cargo install cargo-watch --locked
# source 由 compose bind mount 進來,不 COPY
ENTRYPOINT ["cargo", "watch", "-x", "run --bin server"]

# ───── Stage: runtime ────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 ca-certificates curl tzdata \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 10001 rustapi && useradd -u 10001 -g rustapi -s /sbin/nologin rustapi

COPY --from=builder /out/server /out/migration /out/cleanup-job /usr/local/bin/
COPY deploy/entrypoint.rust-api.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
            /usr/local/bin/server \
            /usr/local/bin/migration \
            /usr/local/bin/cleanup-job

COPY --chown=rustapi:rustapi rust-api/application.yaml /app/application.yaml
WORKDIR /app

USER rustapi
EXPOSE 21081

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1:21081/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["server"]
```

### 5.3 `entrypoint.rust-api.sh` — binary dispatcher

```sh
#!/bin/sh
# deploy/entrypoint.rust-api.sh — dispatch to one of 3 binaries
set -e

case "$1" in
  server)
    exec /usr/local/bin/server
    ;;
  migration)
    shift
    exec /usr/local/bin/migration "$@"
    ;;
  cleanup-job)
    shift
    exec /usr/local/bin/cleanup-job "$@"
    ;;
  *)
    echo "usage: entrypoint.sh {server|migration|cleanup-job}" >&2
    exit 64
    ;;
esac
```

**為何走 wrapper script 而非直接 binary entrypoint**:
- 統一 3 binary 入口、compose service 只需 `command: ["server"]` / `["migration", "up"]` / `["cleanup-job", "--execute"]`
- 未來 DESIGN §8.4「shell expand wrapper(migration / redis / cleanup,用 `$(cat /run/secrets/...)` 包 entrypoint)」需求容易加(case 內 expand 後 exec)
- 對齊 DESIGN §8.1「entrypoint 區分」描述

### 5.4 BuildKit cache mount 紀律

- 預設啟用 BuildKit(`DOCKER_BUILDKIT=1` 或 docker 23+ 自動)
- cache mount 三段:`/usr/local/cargo/registry` + `/usr/local/cargo/git` + `/app/target`
- **不**用 cargo-chef(對 ~10 deps 的 minimal workspace,cache mount 足夠;cargo-chef 是後續優化選項)
- first build ~5-10 min;incremental rebuild(只改 server source)~30s-1min

### 5.5 image tag 命名

| Tag | 對應 stage | 用途 |
|---|---|---|
| `rev2-admin-rust-api:dev` | `target: dev` | dev profile,cargo-watch in-container |
| `rev2-admin-rust-api:latest` | `target: runtime` | prod profile,multi-stage runtime |

對齊 DESIGN §8.4 `.env` 的 `IMAGE_TAG=rev2-admin-rust-api` 變數。

---

## 6. Standalone compose

### 6.1 檔案位置

| 檔 | 位置 |
|---|---|
| `docker-compose.rust-api.yml` | workspace root(對齊 000 base-web 模式) |
| `deploy/secrets/jwt_secret.txt.example` | 範本檔(prod profile 用) |
| `deploy/secrets/refresh_token_secret.txt.example` | 範本檔 |

### 6.2 compose 內容

```yaml
# docker-compose.rust-api.yml
# 標準用法:
#   dev:  docker compose -f docker-compose.rust-api.yml --profile dev up
#   prod: docker compose -f docker-compose.rust-api.yml --profile prod up --build

services:
  rust-api-dev:
    profiles: ["dev"]
    build:
      context: ./
      dockerfile: deploy/Dockerfile.rust-api.txt
      target: dev
    container_name: rev2-admin-rust-api-dev
    volumes:
      - ./rust-api:/app                      # source bind mount(熱重載)
      - rust_api_cargo_cache:/usr/local/cargo
      - rust_api_target:/app/target          # named volume mask,避 WSL2 9P 慢
    ports:
      - "127.0.0.1:21081:21081"
    environment:
      # dev 用 bare envvar(避手動建 secret 檔);default 值長度 ≥ 32 + 不在黑名單
      APP_JWT_JWT_SECRET: "${APP_JWT_JWT_SECRET:-dev_jwt_secret_for_local_only_x32xxxxxx}"
      APP_JWT_REFRESH_TOKEN_SECRET: "${APP_JWT_REFRESH_TOKEN_SECRET:-dev_refresh_secret_for_local_only_x32xx}"
      RUST_LOG: "info,tower_http=debug"

  rust-api:
    profiles: ["prod"]
    build:
      context: ./
      dockerfile: deploy/Dockerfile.rust-api.txt
      target: runtime
    container_name: rev2-admin-rust-api
    ports:
      - "127.0.0.1:21081:21081"  # standalone 期暴露;整合 §8.2 後 internal-only
    environment:
      APP_JWT_JWT_SECRET_FILE: /run/secrets/jwt_secret
      APP_JWT_REFRESH_TOKEN_SECRET_FILE: /run/secrets/refresh_token_secret
      RUST_LOG: "info"
    secrets:
      - jwt_secret
      - refresh_token_secret

secrets:
  jwt_secret:
    file: ./deploy/secrets/jwt_secret.txt
  refresh_token_secret:
    file: ./deploy/secrets/refresh_token_secret.txt

volumes:
  rust_api_cargo_cache:
  rust_api_target:
```

### 6.3 secret 範本檔 + 生成提示

`deploy/secrets/jwt_secret.txt.example`(範本範例):
```
# 範例值,實際請用 openssl rand -base64 48 > deploy/secrets/jwt_secret.txt
# (要點:長度 ≥ 32 + 不在 PLACEHOLDER_SECRETS 黑名單)
example_only_replace_with_openssl_rand_base64_48_xxxxxxxx
```

`deploy/secrets/refresh_token_secret.txt.example`(同樣範本)。

**user 第一次跑 prod profile 前手動 copy + 生成實值**:
```bash
openssl rand -base64 48 > deploy/secrets/jwt_secret.txt
openssl rand -base64 48 > deploy/secrets/refresh_token_secret.txt
```

> Phase 1 #5 會交 `deploy/generate-secrets.sh` 統一生成所有 11 個 secret,本 feature 只交 2 個 JWT 範本 + 提示。

---

## 7. 驗收清單

每項驗收都列出對應命令、預期輸出。

### 7.1 Build 驗收

```bash
# 從 workspace root
DOCKER_BUILDKIT=1 docker compose -f docker-compose.rust-api.yml --profile prod build
```

**預期**:
- 三 stage(builder / dev / runtime)build 成功
- builder stage `cargo build --release --bins` 三 binary 全產出
- runtime stage 進 image 的 `/usr/local/bin/` 含 server / migration / cleanup-job + entrypoint.sh

```bash
docker run --rm --entrypoint=ls rev2-admin-rust-api:latest /usr/local/bin/
```

**預期輸出含**:`server  migration  cleanup-job  entrypoint.sh`

### 7.2 Dev 熱重載驗收

```bash
docker compose -f docker-compose.rust-api.yml --profile dev up

# (另一 terminal)
curl -fsS http://127.0.0.1:21081/health
```

**預期**:`ok`(plain text、HTTP 200)

```bash
# 改 rust-api/server/src/main.rs(例:health() 回 "ok-updated"),compose log 應顯示 cargo-watch rebuild + restart
curl -fsS http://127.0.0.1:21081/health
```

**預期**:`ok-updated`(rebuild ~30s 後)

### 7.3 Strict validation panic 驗收

```bash
# 黑名單值 panic
APP_JWT_JWT_SECRET="change-me" docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:server bin boot panic,log 含 `APP_JWT_JWT_SECRET is a placeholder value`

```bash
# 長度 < 32 panic
APP_JWT_JWT_SECRET="too_short" docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:boot panic,log 含 `APP_JWT_JWT_SECRET length 9 < 32`

```bash
# 不設 panic
unset APP_JWT_JWT_SECRET APP_JWT_JWT_SECRET_FILE
docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:boot panic,log 含 `neither APP_JWT_JWT_SECRET nor APP_JWT_JWT_SECRET_FILE set`

### 7.4 `_FILE` precedence 驗收

```bash
# 同時設 envvar(黑名單)+ _FILE(合法值)→ _FILE 優先,boot 成功
echo "valid_secret_loaded_from_file_xxxxxxxxxxxx" > /tmp/jwt.txt
APP_JWT_JWT_SECRET="change-me" \
APP_JWT_JWT_SECRET_FILE="/tmp/jwt.txt" \
docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:boot 成功(`_FILE` 優先讀檔、envvar 被無視)+ `/health` 回 `ok`

### 7.5 Migration / cleanup-job stub 驗收

```bash
docker run --rm rev2-admin-rust-api:latest migration
# 預期輸出: migration stub — will be implemented in Phase 2 migration feature

docker run --rm rev2-admin-rust-api:latest cleanup-job
# 預期輸出: cleanup-job stub — will be implemented in Phase 5 cleanup feature
```

### 7.6 Phase 0 baseline DESIGN §4.6 對應驗收

| §4.6 子節 | 本 feature 落實 |
|---|---|
| §4.6.1 application.yaml placeholder | ✅ application.yaml 落地、`grep -r "<TO_BE_SET>" rust-api/` 空 |
| §4.6.2 11 個 secret | ⏳ 本 feature 只交 2 個(JWT)範本檔;其餘 9 個 Phase 1 #5 補 |
| §4.6.3 Casbin seed 矩陣 | ⏳ Phase 3 #4 落實 |
| §4.6.4 migration entity | ⏳ Phase 2 migration feature 落實(本 feature 只交 migration crate 骨架) |
| §4.6.5 sys_user 預設帳號 | ⏳ Phase 2 migration seed 落實 |
| §4.6.6 graphify 落地時機 | ⏳ Phase 4 後 |

---

## 8. Constitution Compliance 對齊預檢(constitution v1.0.0 §IV)

`/speckit-plan` 步將自動跑 Compliance Check;本檔預估 7 項評估如下供 plan 階段參考:

| § | 項 | 本 feature 立場 |
|---|---|---|
| §I | base-web 為權威 | ✅ N/A(本 feature 只動 rust-api + workspace deploy/,不動 base-web) |
| §I | menu 權限 Casbin enforce | ✅ N/A(本 feature 不接 Casbin) |
| §II | RUSTAPI-SOURCE-ISOLATION 軌道 | ✅ 對齊(rust-api 全新寫;不 grep rev1 source) |
| §III | spec phase 0 三端對齊 grep 紀律 | ✅ N/A(本 feature 不寫 handler / DTO / state) |
| §IV | wire envelope 紀律 | ✅ N/A(本 feature `/health` 是 plain text、不走 envelope) |
| §V | 兩條鐵紀律(base-web 為權威 / Casbin enforce) | ✅ N/A(本 feature 純基建) |
| §V | 5 軌道授權邊界 | ✅ 對齊 RUSTAPI-SOURCE-ISOLATION |

---

## 9. Open Questions / Follow-up

### 9.1 留給 spec-kit `/speckit-clarify` 補的細節

- `cargo-watch --poll` 是否需要(WSL2 inotify 在 bind mount 內可能不觸發)— dev 跑起來再驗
- application.yaml 是否需要支援 envvar override(yaml 內 placeholder + envvar substitution)— 本 feature 不做,以 secret 走獨立 loader 為主;若 Phase 2 需求出現再加 config crate
- BuildKit cache mount 在 CI 環境(無 cache persistence)的退化策略 — 本 feature 不關注 CI、僅關注本機 dev

### 9.2 留給後續 feature 的明確 contract

- **Phase 1 #5 secret 注入機制 feature**:scope 已變動(見 §1.3 表)— 接著 9 個其他 secret 範本檔 + `generate-secrets.sh` + dual-write docs
- **Phase 2 #5 sub-crate setup feature**:Cargo workspace `[workspace.members]` 加入 `model`, `sea-orm-adapter`, `xdb`, `axum-casbin` 4 個 crate;`server/src/` 加 `state.rs` + `error.rs` + `envelope.rs`
- **Phase 2 migration feature**:把 `migration/src/main.rs` stub 換成真實 sea-orm-migration logic;加 10+ entity migration(對齊 DESIGN §4.6.4)
- **Phase 3 登入 + getUserInfo feature**:`server/src/` 加 `api/auth.rs` + `service/auth.rs` + `router/auth.rs`;Casbin middleware 首次啟用
- **Phase 5 cleanup-job feature**:把 `cleanup-job/src/main.rs` stub 換成真實 soft-delete 物理清理 + dry-run + cron 觸發

### 9.3 與 000 base-web 共用 deploy/ 紀律對齊

000 base-web 已在 `deploy/Dockerfile.base-web.txt`;本 feature 新增 `deploy/Dockerfile.rust-api.txt` + `deploy/entrypoint.rust-api.sh` + `deploy/secrets/*.example`。後續 Phase 1 #2-#5 continued accumulation,Phase 1 #4 整合到 `docker-compose.yml` 後可能再調整位置(目前各 standalone compose 為 transition 階段)。

---

## 10. 交棒給 `/speckit-specify`(階段 1)

本檔(spec-design)完成,user 審核後 **手動執行** `/speckit-specify`(CLAUDE.md §3 紀律:不可在 brainstorm 流程內自動觸發 `/speckit-specify`,會跳過 `speckit.git.feature` pre-hook、不會自動建 `001-dockerfile-rust-api` feature branch)。

`/speckit-specify` 階段會:
1. `before_specify` pre-hook(`speckit.git.feature`)自動建 `001-dockerfile-rust-api` feature branch
2. 從本檔 input 產出 `specs/001-dockerfile-rust-api/spec.md`(formal spec)
3. 後續 `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `superpowers:executing-plans`

`/speckit-plan` 階段會對照 `.specify/memory/constitution.md` v1.0.0 跑 Compliance Check(§8 預檢結果)。

---

**生效**:本檔成立後即為 `001-dockerfile-rust-api` feature 的 Phase 0 brainstorm 權威;後續 spec / plan / tasks / implementation 任何決策若偏離本檔,需在對應 spec doc 明示理由 + 更新本檔。
