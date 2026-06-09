---
type: community
cohesion: 0.10
members: 26
---

# rust: bearer

**Cohesion:** 0.10 - loosely connected
**Members:** 26 nodes

## Members
- [[RequestContext]] - code - rust-api/server/src/audit_ctx.rs
- [[audit_ctx.rs]] - code - rust-api/server/src/audit_ctx.rs
- [[bearer.rs]] - code - rust-api/server/src/auth/bearer.rs
- [[bearer_headers()]] - code - rust-api/server/src/auth/bearer.rs
- [[bearer_token()]] - code - rust-api/server/src/auth/bearer.rs
- [[bearer_token_extracts_trimmed_token()]] - code - rust-api/server/src/auth/bearer.rs
- [[bearer_token_none_when_empty_after_prefix()]] - code - rust-api/server/src/auth/bearer.rs
- [[bearer_token_none_when_missing()]] - code - rust-api/server/src/auth/bearer.rs
- [[bearer_token_none_without_bearer_prefix()]] - code - rust-api/server/src/auth/bearer.rs
- [[ctx_mw()]] - code - rust-api/server/src/audit_ctx.rs
- [[extract_trace_id()]] - code - rust-api/server/src/audit_ctx.rs
- [[extract_trace_id_honors_request_id_header()]] - code - rust-api/server/src/audit_ctx.rs
- [[extract_trace_id_mints_uuid_when_absent()]] - code - rust-api/server/src/audit_ctx.rs
- [[extract_xff()]] - code - rust-api/server/src/audit_ctx.rs
- [[extract_xff_none_when_absent()]] - code - rust-api/server/src/audit_ctx.rs
- [[extract_xff_returns_raw_chain_verbatim()]] - code - rust-api/server/src/audit_ctx.rs
- [[resolve_region()]] - code - rust-api/server/src/audit_ctx.rs
- [[resolve_region_ipv6_is_none()]] - code - rust-api/server/src/audit_ctx.rs
- [[resolve_region_known_ipv4_is_pipe_segmented()]] - code - rust-api/server/src/audit_ctx.rs
- [[sign_expired()]] - code - rust-api/server/src/auth/bearer.rs
- [[verify_bearer()]] - code - rust-api/server/src/auth/bearer.rs
- [[verify_bearer_none_on_bad_signature()]] - code - rust-api/server/src/auth/bearer.rs
- [[verify_bearer_none_on_expired_token()]] - code - rust-api/server/src/auth/bearer.rs
- [[verify_bearer_none_on_wrong_aud()]] - code - rust-api/server/src/auth/bearer.rs
- [[verify_bearer_none_when_no_header()]] - code - rust-api/server/src/auth/bearer.rs
- [[verify_bearer_valid_token_returns_claims()]] - code - rust-api/server/src/auth/bearer.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/rust_bearer
SORT file.name ASC
```
