---
type: "query"
date: "2026-06-09T16:49:24.857225+00:00"
question: "token rotation(027) + 單一 session(028) 在 rev2 rust-api 的端到端機制?"
contributor: "graphify"
source_nodes: ["issue_tokens", "create_chain_head", "rotate", "decide_rotation", "revoke_other_chains", "is_current", "resolve_policy", "set_pointer", "refresh_token"]
---

# Q: token rotation(027) + 單一 session(028) 在 rev2 rust-api 的端到端機制?

## Answer

VERIFIED against source. ISSUE+027: issue_tokens auth.rs:64 access(jwt_secret 1h)+refresh(refresh_token_secret 7d) both carry sid(028)+jti(030 per-token uuid) HS256. rotation_chain=fresh uuid PER login auth.rs:135 (distinct from sid). create_chain_head sys_token.rs:97 token_hash=sha256_hex(refresh JWT, plaintext NOT stored), inserts active row; token_hash UNIQUE (migration string_len64 unique_key). 027 same-second collision FIXED by 030 jti (fresh uuid per sign() makes JWT byte-distinct so sha256 differs); unit test same_second_signs_are_byte_distinct_via_jti jwt.rs:162 — the prior 028-followup latent edge is RESOLVED in 030. REFRESH /auth/refreshToken main.rs:147 OPEN, handler auth.rs:323 MUST NEVER return 3333/9999/9998: verify refresh JWT first (fail=>8888) auth.rs:329, is_current gate (superseded=>7777) auth.rs:345, issue new pair inheriting claims.sid, sys_token::rotate sys_token.rs:145 = sha256(presented) find FOR UPDATE single txn. decide_rotation sys_token.rs:76: active=>Rotate(mark old used + insert new active SAME rotation_chain)=>200; used&<30s grace=>Benign(insert new, dont touch old, no revoke)=>200 (FR-004 double-click no logout); used&>=grace OR used_at None OR REVOKED=>Reuse(revoke ENTIRE rotation_chain + warn)=>8888 (theft clean logout, NOT 5000); NotFound=>8888; DbErr=>5000. 028 SINGLE-SESSION: pointer = sys_user.current_session_id column (NOT sys_session table; Redis sess:{uid} hot-cache only). set_pointer session.rs:117 persist-then-cache. resolve_policy session.rs:23 on=>true off=>false else=>system_default(On). is_current session.rs:156 FAIL-OPEN, reads 029 runtime store state.session_mode (NOT jwt config), policy-off=>true, on=>rec.sid==claims.sid. 7777 gate in 4 places: get_user_info auth.rs:267, get_user_routes route.rs:50+139, enforce_mw enforce.rs:73. revoke_other_chains sys_token.rs:217 on login when resolve_policy true (8888-on-next-refresh channel, distinct from 7777 access-gate kick). session_mode reload via settings_watcher subscribing settings:invalidate (mirrors policy_watcher).

## Source Nodes

- issue_tokens
- create_chain_head
- rotate
- decide_rotation
- revoke_other_chains
- is_current
- resolve_policy
- set_pointer
- refresh_token