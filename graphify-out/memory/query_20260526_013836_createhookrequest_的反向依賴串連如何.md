---
type: "explain"
date: "2026-05-26T01:38:36.773457+00:00"
question: "createHookRequest 的反向依賴串連如何？"
contributor: "graphify"
source_nodes: ["createHookRequest", "request", "useLoading", "createFlatRequest", "packages/hooks/use-request.ts", "src/service/request/index.ts"]
---

# Q: createHookRequest 的反向依賴串連如何？

## Answer

createHookRequest (packages/hooks/src/use-request.ts) has 1 inbound (containing file) and 3 outbound. Outbound: (1) calls useLoading() within packages/hooks (within-package, OK); (2) calls request in src/service/request/index.ts (THE REVERSE DEPENDENCY: packages/hooks reaches into src/service, against expected 'packages are self-contained' invariant); (3) calls 'createFlatRequest 实例创建实战' from docs/src/zh/guide/request/usage.md — this is the docs-side EXTRACTED edge from the Chinese docs that documents how this hook works. The reverse dependency (packages → src) confirms what we flagged earlier as Surprising Connection 3: packages/hooks/use-request.ts is NOT self-contained, it transitively depends on src/service/request/index.ts. ALSO: graph has DUPLICATE node for the same symbol — src_use_request_createhookrequest (AST, degree 4, community 4) and hooks_use_request_createhookrequest (semantic subagent, degree 3, community 95) — a ghost-duplicate from AST-vs-semantic ID format mismatch. graphify ID scheme expects {parent_dir}_{stem}_{entity}; semantic subagent went with the package directory (hooks) prefix while AST used the immediate parent (src or use_request). Fix would require re-extract with --force.

## Source Nodes

- createHookRequest
- request
- useLoading
- createFlatRequest
- packages/hooks/use-request.ts
- src/service/request/index.ts