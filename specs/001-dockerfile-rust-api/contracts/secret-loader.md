# Contract: Secret loader(`server/src/config.rs::load_secret`)

**Type**: Rust pub function;server bin 內部 boot path

## Function signature

```rust
fn load_secret(key: &str) -> anyhow::Result<String>
```

`key` 為 envvar 主名(無 `_FILE` 後綴),例如 `"APP_JWT_JWT_SECRET"`。回傳合法 secret value,失敗 `anyhow::Error`(被 caller `expect()` 變 panic)。

## Precedence

```
let file_key = format!("{key}_FILE");

if std::env::var(&file_key).is_ok():
    value = fs::read_to_string(env::var(&file_key)?)?.trim().to_string()
elif std::env::var(key).is_ok():
    value = env::var(key)?
else:
    bail!("neither {key} nor {file_key} set")

validate_secret(key, &value)?;
Ok(value)
```

## Validation rules(`validate_secret`)

對讀進來的 `value` 跑以下檢查,任一失敗 `bail!`:

| Rule | 失敗訊息 |
|---|---|
| `value.is_empty()` | `"{key} is empty"` |
| `PLACEHOLDER_SECRETS.iter().any(\|p\| value.eq_ignore_ascii_case(p))` | `"{key} is a placeholder value"` |
| `value.len() < 32` | `"{key} length {n} < 32"` |

**Placeholder 黑名單**(`const PLACEHOLDER_SECRETS: &[&str]`):
```rust
const PLACEHOLDER_SECRETS: &[&str] = &[
    "change-me", "changeme", "secret", "xxx",
    "<TO_BE_SET>", "TODO",
];
```

## Caller contract

`AppConfig::load()` 內呼叫:
```rust
let jwt_secret = load_secret("APP_JWT_JWT_SECRET")?;
let refresh_token_secret = load_secret("APP_JWT_REFRESH_TOKEN_SECRET")?;
```

`main.rs` 用 `expect()` 把 `Err` 變 panic:
```rust
let cfg = config::AppConfig::load()
    .expect("config load failed (boot panic by design)");
```

## Test contract(unit test, server bin tests)

`server/src/config.rs` 內 `#[cfg(test)] mod tests`:

```rust
#[test]
fn load_secret_panics_when_neither_set() { /* unset both, expect Err 含 "neither" */ }

#[test]
fn load_secret_reads_from_file_when_FILE_set() { /* write /tmp/x, set _FILE, expect Ok 含 file content */ }

#[test]
fn load_secret_falls_back_to_envvar_when_FILE_not_set() { /* set bare envvar, expect Ok */ }

#[test]
fn load_secret_FILE_takes_precedence_over_envvar() { /* set both, FILE 合法 envvar 黑名單, expect Ok */ }

#[test]
fn validate_secret_rejects_empty() { /* expect Err 含 "empty" */ }

#[test]
fn validate_secret_rejects_placeholders() { /* loop 6 black list values + case variations, expect Err 含 "placeholder" */ }

#[test]
fn validate_secret_rejects_short() { /* 31-char value, expect Err 含 "length" */ }

#[test]
fn validate_secret_accepts_32_or_longer_non_blacklist() { /* expect Ok */ }
```

**TDD red→green**:test-first 寫 8 條測試（all red）→ 寫 `load_secret` + `validate_secret`（all green）→ refactor。

## Examples

```rust
// 成功
std::env::set_var("APP_JWT_JWT_SECRET", "a_proper_32_char_or_longer_secret_xxx");
let v = load_secret("APP_JWT_JWT_SECRET").unwrap();
assert_eq!(v, "a_proper_32_char_or_longer_secret_xxx");

// 失敗:黑名單
std::env::set_var("APP_JWT_JWT_SECRET", "change-me");
let e = load_secret("APP_JWT_JWT_SECRET").unwrap_err();
assert!(e.to_string().contains("placeholder"));
```

## 驗收

對應 spec FR-006~FR-011 + User Story 3 全 4 acceptance scenarios + SC-003(三條 boot panic 路徑 5 秒內 panic)。
