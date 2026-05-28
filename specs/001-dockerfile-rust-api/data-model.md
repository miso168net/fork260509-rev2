# Phase 1 Data Model: dockerfile-rust-api

> 本 feature 為部署基建、無 DB entity / 業務 model。本檔列 config / image / secret / compose 4 個 key entity 與其驗證規則。

---

## Entity 1: AppConfig(server bin 內部 model)

**意義**:server bin boot 時從 `application.yaml` + envvar / `_FILE` 載入的 runtime config。

**Fields**:

| Field | Type | Source | Default | Validation |
|---|---|---|---|---|
| `server.host` | `String` | yaml | `"0.0.0.0"` | 非空 string |
| `server.port` | `u16` | yaml | `21081` | 1-65535(serde u16 自然 enforce) |
| `jwt.access_token_ttl_secs` | `u64` | yaml | `3600`(1h) | 本 feature 不用、僅載入 |
| `jwt.refresh_token_ttl_secs` | `u64` | yaml | `604800`(7d) | 本 feature 不用、僅載入 |
| `jwt.jwt_secret` | `String` | envvar / `_FILE` | 無 default(必設) | `validate_secret` |
| `jwt.refresh_token_secret` | `String` | envvar / `_FILE` | 無 default(必設) | `validate_secret` |
| `logging.level` | `String` | yaml | `"info"` | `tracing_subscriber::EnvFilter::try_new` fallback `"info"` |
| `logging.format` | `String` | yaml | `"json"` | `"json"` / `"pretty"`(其餘走 json fallback) |

**Loading flow**:
1. `fs::read_to_string("application.yaml")` → `serde_yaml::from_str::<AppConfigYaml>`
2. `load_secret("APP_JWT_JWT_SECRET")` → 過 validation
3. `load_secret("APP_JWT_REFRESH_TOKEN_SECRET")` → 過 validation
4. 任一步失敗 → boot panic、`expect()` 訊息含失敗 envvar key + 原因

**State transition**:N/A(stateless config object,boot 時 build once,放進 axum `State` 或全域 `Arc`)

**Struct 命名**(實作對齊,Phase 0 brainstorm 拍板 + tasks.md T010 命名表):

| Struct | 用途 | 含 secret? |
|---|---|---|
| `AppConfigYaml` | yaml 載入結構(`serde_yaml::from_str` target) | ✘ — 只含 yaml-derivable fields |
| `AppConfig` | runtime merged 結構(yaml + secrets) | ✓ |
| `ServerConfig` | `server.*` 子段(host / port) | ✘ |
| `JwtYaml` | yaml 載入的 `jwt.*` 子段(僅 TTL 兩 field) | ✘ |
| `JwtConfig` | runtime merged 的 `jwt.*` 子段(TTL + 兩 secret) | ✓ |
| `LoggingConfig` | `logging.*` 子段(level / format) | ✘ |

`Yaml` 後綴版本對齊 serde derive snapshot,`Config` 後綴為 runtime merged;命名邏輯避免「`secret: Option<String>` 在 yaml load 時 None、後 load_secret 補上」這種 nullable 過渡狀態的歧義。

---

## Entity 2: Container Image(`rev2-admin-rust-api`)

**意義**:rev2 backend 的唯一可部署單元、含 3 binary entrypoint。

**Variants**:

| Tag | Stage | 用途 | 內容 |
|---|---|---|---|
| `rev2-admin-rust-api:dev` | `target: dev` | dev profile,cargo-watch in-container | builder image + cargo-watch + bind mount source |
| `rev2-admin-rust-api:latest` | `target: runtime` | prod profile | runtime image + 3 binary + entrypoint dispatcher + non-secret config |

**Image layers(runtime stage)**:

| Layer | 內容 |
|---|---|
| Base | `debian:bookworm-slim`(< 100 MB stripped) |
| Runtime deps | `libssl3` + `ca-certificates` + `curl` + `tzdata`(透過 apt) |
| User | non-root `rustapi:rustapi`(uid 10001 / gid 10001) |
| Binaries | `/usr/local/bin/{server,migration,cleanup-job}`(從 builder COPY) |
| Entrypoint | `/usr/local/bin/entrypoint.sh`(從 `deploy/` COPY) |
| Config | `/app/application.yaml`(從 `rust-api/` COPY,owned by `rustapi`) |
| Workdir | `/app` |
| Port | `EXPOSE 21081` |
| Healthcheck | `curl -fsS http://127.0.0.1:21081/health`,interval 10s / timeout 3s / start-period 5s / retries 3 |

**Validation**:
- `docker run --rm --entrypoint=ls rev2-admin-rust-api:latest /usr/local/bin/` 含 `server  migration  cleanup-job  entrypoint.sh`
- `docker inspect rev2-admin-rust-api:latest --format='{{.Config.User}}'` 顯示 `rustapi` 或 `10001`
- Image size < 200MB(SC-004)

---

## Entity 3: Secret(`jwt_secret` + `refresh_token_secret`)

**意義**:從 envvar 或 file 載入、過 strict validation 的機密字串。

**Fields**:

| Field | Type | Required |
|---|---|---|
| `key` | `String`(envvar 名) | yes — `APP_JWT_JWT_SECRET` / `APP_JWT_REFRESH_TOKEN_SECRET` |
| `value` | `String` | yes — `_FILE` 優先 → bare envvar fallback |
| `source` | enum `{File, EnvVar}` | derived — log 時用 |

**Loading precedence**:
```
1. if env(<KEY>_FILE) is set:
   value = read_to_string(path).trim()
   source = File
2. elif env(<KEY>) is set:
   value = env(<KEY>)
   source = EnvVar
3. else:
   panic "neither {KEY} nor {KEY}_FILE set"
```

**Validation(`validate_secret`)**:

| Rule | 失敗訊息 | 對應 spec FR |
|---|---|---|
| `value.is_empty()` | `"{key} is empty"` | FR-009 |
| `PLACEHOLDER_SECRETS.contains(value.to_lowercase())` | `"{key} is a placeholder value"` | FR-009 |
| `value.len() < 32` | `"{key} length {n} < 32"` | FR-009 |

**Placeholder 黑名單**(case-insensitive,6 條):

| 字串 |
|---|
| `change-me` |
| `changeme` |
| `secret` |
| `xxx` |
| `<TO_BE_SET>` |
| `TODO` |

---

## Entity 4: Standalone Compose(`docker-compose.rust-api.yml`)

**意義**:獨立 compose 檔、與未來整套 stack 解耦、提供 dev / prod profile 切換。

**Services**:

### `rust-api-dev`(profile: dev)

| 屬性 | 值 |
|---|---|
| build.target | `dev` |
| build.context | `./` |
| build.dockerfile | `deploy/Dockerfile.rust-api.txt` |
| container_name | `rev2-admin-rust-api-dev` |
| volumes | `./rust-api:/app`(source bind mount)+ `rust_api_cargo_cache:/usr/local/cargo` + `rust_api_target:/app/target`(named volume mask) |
| ports | `127.0.0.1:21081:21081` |
| environment | `APP_JWT_JWT_SECRET` default `dev_jwt_secret_for_local_only_x32xxxxxx`(長度 39)+ `APP_JWT_REFRESH_TOKEN_SECRET` default `dev_refresh_secret_for_local_only_x32xx`(長度 38)+ `RUST_LOG="info,tower_http=debug"` |

### `rust-api`(profile: prod)

| 屬性 | 值 |
|---|---|
| build.target | `runtime` |
| container_name | `rev2-admin-rust-api` |
| ports | `127.0.0.1:21081:21081`(standalone 期,整合 §8.2 後 internal-only) |
| environment | `APP_JWT_JWT_SECRET_FILE=/run/secrets/jwt_secret` + `APP_JWT_REFRESH_TOKEN_SECRET_FILE=/run/secrets/refresh_token_secret` + `RUST_LOG="info"` |
| secrets | `jwt_secret` + `refresh_token_secret`(docker compose secrets section 對應到 `deploy/secrets/*.txt`) |

### Top-level

| 屬性 | 值 |
|---|---|
| secrets.jwt_secret.file | `./deploy/secrets/jwt_secret.txt` |
| secrets.refresh_token_secret.file | `./deploy/secrets/refresh_token_secret.txt` |
| volumes | `rust_api_cargo_cache` + `rust_api_target`(named) |

---

## 跨 entity 關係

```
docker-compose.rust-api.yml
  ├─ rust-api-dev (profile: dev)  ──▶  Container Image (target: dev)  ──▶  Secret (bare envvar)
  └─ rust-api (profile: prod)      ──▶  Container Image (target: runtime)  ──▶  Secret (_FILE)
                                                  │
                                                  └─▶ AppConfig (boot load)
                                                          │
                                                          └─▶ validate_secret() (panic on fail)
```
