---
source_file: "rust-api/cleanup-job/src/main.rs"
type: "rationale"
community: "rust: cleanup"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/rust_cleanup
---

# 純過期清理謂詞 (expires_at < now - 60s margin)

## Connections
- [[cleanup-job count_purgeable]] - `rationale_for` [INFERRED]
- [[cleanup-job purge]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/INFERRED #community/rust_cleanup