---
type: community
cohesion: 0.30
members: 14
---

# rust: token

**Cohesion:** 0.30 - loosely connected
**Members:** 14 nodes

## Members
- [[Claims]] - code - rust-api/server/src/auth/jwt.rs
- [[JwtError]] - code - rust-api/server/src/auth/jwt.rs
- [[LegacyClaims]] - code - rust-api/server/src/auth/jwt.rs
- [[access_and_refresh_secrets_are_not_interchangeable()]] - code - rust-api/server/src/auth/jwt.rs
- [[expired_token_is_rejected()]] - code - rust-api/server/src/auth/jwt.rs
- [[jwt.rs]] - code - rust-api/server/src/auth/jwt.rs
- [[malformed_token_is_rejected()]] - code - rust-api/server/src/auth/jwt.rs
- [[now_secs()]] - code - rust-api/server/src/auth/jwt.rs
- [[pre_028_token_without_sid_fails_verify()]] - code - rust-api/server/src/auth/jwt.rs
- [[roundtrip_sign_then_verify_returns_claims()]] - code - rust-api/server/src/auth/jwt.rs
- [[same_second_signs_are_byte_distinct_via_jti()]] - code - rust-api/server/src/auth/jwt.rs
- [[sign()]] - code - rust-api/server/src/auth/jwt.rs
- [[sign_with_past_exp()]] - code - rust-api/server/src/auth/jwt.rs
- [[verify()]] - code - rust-api/server/src/auth/jwt.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_token
SORT file.name ASC
```
