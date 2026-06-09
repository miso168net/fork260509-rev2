---
source_file: "rust-api/server/src/config.rs"
type: "code"
community: "rust: secret"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/rust_secret
---

# config.rs

## Connections
- [[AppConfig]] - `contains` [EXTRACTED]
- [[AppConfigYaml]] - `contains` [EXTRACTED]
- [[DatabaseConfig]] - `contains` [EXTRACTED]
- [[DatabaseYaml]] - `contains` [EXTRACTED]
- [[JwtConfig]] - `contains` [EXTRACTED]
- [[JwtYaml]] - `contains` [EXTRACTED]
- [[LoggingConfig]] - `contains` [EXTRACTED]
- [[RedisConfig]] - `contains` [EXTRACTED]
- [[ServerConfig]] - `contains` [EXTRACTED]
- [[SessionMode]] - `contains` [EXTRACTED]
- [[app_config_yaml_deserializes_database_section()]] - `contains` [EXTRACTED]
- [[clear_env()]] - `contains` [EXTRACTED]
- [[load_secret()]] - `contains` [EXTRACTED]
- [[load_secret_FILE_takes_precedence_for_url_key()]] - `contains` [EXTRACTED]
- [[load_secret_FILE_takes_precedence_over_envvar()]] - `contains` [EXTRACTED]
- [[load_secret_db_url_via_file()]] - `contains` [EXTRACTED]
- [[load_secret_falls_back_to_envvar_when_FILE_not_set()]] - `contains` [EXTRACTED]
- [[load_secret_panics_when_neither_set()]] - `contains` [EXTRACTED]
- [[load_secret_reads_from_file_when_FILE_set()]] - `contains` [EXTRACTED]
- [[load_secret_redis_url_via_file_passes_length_boundary()]] - `contains` [EXTRACTED]
- [[parse_session_default()]] - `contains` [EXTRACTED]
- [[parse_session_default_tolerant()]] - `contains` [EXTRACTED]
- [[temp_secret_path()]] - `contains` [EXTRACTED]
- [[validate_secret()]] - `contains` [EXTRACTED]
- [[validate_secret_accepts_32_or_longer_non_blacklist()]] - `contains` [EXTRACTED]
- [[validate_secret_rejects_empty()]] - `contains` [EXTRACTED]
- [[validate_secret_rejects_placeholders()]] - `contains` [EXTRACTED]
- [[validate_secret_rejects_short()]] - `contains` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/rust_secret