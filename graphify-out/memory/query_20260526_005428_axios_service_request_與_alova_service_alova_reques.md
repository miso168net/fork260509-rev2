---
type: "path_query"
date: "2026-05-26T00:54:28.635007+00:00"
question: "axios service/request 與 alova service-alova/request 之間最短路徑共通結構是什麼？"
contributor: "graphify"
source_nodes: ["service/request/index.ts", "service-alova/request/index.ts", "src/locales/index.ts", "src/store/modules/auth/index.ts", "src/utils/service.ts", "getServiceBaseURL"]
---

# Q: axios service/request 與 alova service-alova/request 之間最短路徑共通結構是什麼？

## Answer

6 shortest paths of length 2. Three structural bridges: (1) src/locales/index.ts — both wires import $t for error message i18n; (2) src/store/modules/auth/index.ts + useAuthStore — both wires read token state & trigger logout on 401; (3) src/utils/service.ts + getServiceBaseURL() — both wires share .env-driven endpoint URL helper. Symmetric mirror design: the axios path (C0) and alova path (C41) are structurally identical, sharing exactly 3 dependencies (i18n, auth store, base-URL helper) while duplicating implementation. For rev2 rust-api integration: pick ONE wire to commit to (most likely axios, alova is showcase); the dual-wire design adds maintenance cost without integration value.

## Source Nodes

- service/request/index.ts
- service-alova/request/index.ts
- src/locales/index.ts
- src/store/modules/auth/index.ts
- src/utils/service.ts
- getServiceBaseURL