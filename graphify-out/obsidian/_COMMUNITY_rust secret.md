---
type: community
cohesion: 0.13
members: 30
---

# rust: secret

**Cohesion:** 0.13 - loosely connected
**Members:** 30 nodes

## Members
- [[.load()]] - code - rust-api/server/src/config.rs
- [[AppConfig]] - code - rust-api/server/src/config.rs
- [[AppConfigYaml]] - code - rust-api/server/src/config.rs
- [[DatabaseConfig]] - code - rust-api/server/src/config.rs
- [[DatabaseYaml]] - code - rust-api/server/src/config.rs
- [[JwtConfig]] - code - rust-api/server/src/config.rs
- [[JwtYaml]] - code - rust-api/server/src/config.rs
- [[LoggingConfig]] - code - rust-api/server/src/config.rs
- [[RedisConfig]] - code - rust-api/server/src/config.rs
- [[ServerConfig]] - code - rust-api/server/src/config.rs
- [[SessionMode]] - code - rust-api/server/src/config.rs
- [[app_config_yaml_deserializes_database_section()]] - code - rust-api/server/src/config.rs
- [[clear_env()]] - code - rust-api/server/src/config.rs
- [[config.rs]] - code - rust-api/server/src/config.rs
- [[load_secret()]] - code - rust-api/server/src/config.rs
- [[load_secret_FILE_takes_precedence_for_url_key()]] - code - rust-api/server/src/config.rs
- [[load_secret_FILE_takes_precedence_over_envvar()]] - code - rust-api/server/src/config.rs
- [[load_secret_db_url_via_file()]] - code - rust-api/server/src/config.rs
- [[load_secret_falls_back_to_envvar_when_FILE_not_set()]] - code - rust-api/server/src/config.rs
- [[load_secret_panics_when_neither_set()]] - code - rust-api/server/src/config.rs
- [[load_secret_reads_from_file_when_FILE_set()]] - code - rust-api/server/src/config.rs
- [[load_secret_redis_url_via_file_passes_length_boundary()]] - code - rust-api/server/src/config.rs
- [[parse_session_default()]] - code - rust-api/server/src/config.rs
- [[parse_session_default_tolerant()]] - code - rust-api/server/src/config.rs
- [[temp_secret_path()]] - code - rust-api/server/src/config.rs
- [[validate_secret()]] - code - rust-api/server/src/config.rs
- [[validate_secret_accepts_32_or_longer_non_blacklist()]] - code - rust-api/server/src/config.rs
- [[validate_secret_rejects_empty()]] - code - rust-api/server/src/config.rs
- [[validate_secret_rejects_placeholders()]] - code - rust-api/server/src/config.rs
- [[validate_secret_rejects_short()]] - code - rust-api/server/src/config.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_secret
SORT file.name ASC
```
