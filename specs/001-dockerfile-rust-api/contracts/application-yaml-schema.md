# Contract: `application.yaml` schema

**Type**: YAML config file(`rust-api/application.yaml`,server bin boot 讀)

## Schema

```yaml
server:
  host: <string>      # listening interface, e.g. "0.0.0.0" or "127.0.0.1"
  port: <u16>         # 1-65535

jwt:
  access_token_ttl_secs: <u64>      # access token 有效期(秒)
  refresh_token_ttl_secs: <u64>     # refresh token 有效期(秒)

logging:
  level: <string>     # tracing EnvFilter directive, e.g. "info" / "debug" / "trace,h2=info"
  format: <string>    # "json" | "pretty"
```

## Default values(本 feature 提交版)

```yaml
server:
  host: "0.0.0.0"
  port: 21081

jwt:
  access_token_ttl_secs: 3600        # 1h
  refresh_token_ttl_secs: 604800     # 7d

logging:
  level: "info"
  format: "json"
```

## 嚴格紀律

- **絕不包含 secret 值或 placeholder**(spec FR-019):
  - ❌ `jwt_secret: "change-me"`
  - ❌ `jwt_secret: "<TO_BE_SET>"`
  - ❌ `database_url: "postgres://..."`
- secret / connection string 一律走 envvar / `_FILE`(見 [secret-loader.md](./secret-loader.md))
- 對應驗收:`grep -r "<TO_BE_SET>" rust-api/` 為空(SC-006)

## Rust 對應 struct(`server/src/config.rs`)

```rust
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
```

## Loading flow

1. `fs::read_to_string("application.yaml")` from `WORKDIR=/app`(image 內 `/app/application.yaml`,dev profile 走 bind mount `./rust-api/application.yaml`)
2. `serde_yaml::from_str::<AppConfigYaml>(&raw)?`
3. 與 secret loader 結果合併成 `AppConfig`

任一步失敗 → boot panic、訊息含 `application.yaml read failed` / `application.yaml parse failed`。

## 後續 feature 擴展邊界

| Phase / Feature | 新增欄位 |
|---|---|
| Phase 2 #5 sub-crate setup + DB/Redis 接入 | `database:` section(connection pool size、timeout 等 non-secret)+ `redis:` section |
| Phase 3 Casbin enforce | `casbin:` section(model path、pub-sub channel name) |
| Phase 6 observability | `observability:` section(metrics endpoint port、tracing exporter) |

本 feature 不預留欄位、不過度設計(YAGNI)。

## 驗收

對應 spec FR-018(yaml 結構)+ FR-019(無 placeholder)+ SC-006(grep 空)。
