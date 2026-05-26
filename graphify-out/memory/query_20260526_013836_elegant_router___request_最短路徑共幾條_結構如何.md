---
type: "path_query"
date: "2026-05-26T01:38:36.679844+00:00"
question: "Elegant Router → request 最短路徑共幾條、結構如何？"
contributor: "graphify"
source_nodes: ["Elegant Router", "generatedRoutes", "store/modules/route/index.ts", "service/api/index.ts", "request"]
---

# Q: Elegant Router → request 最短路徑共幾條、結構如何？

## Answer

15 shortest paths, all length 6. Common spine: Elegant Router (C19 README concept) → generatedRoutes/customRoutes (C24 Router DSL) → router/routes/index.ts (C24) → store/modules/route/index.ts (C15) [KEY HUB] → service/api/index.ts (C10 api barrel) → auth.ts | route.ts | system-manage.ts (C38) → request (C38 axios endpoint). 15 paths arise from branching at hop 1 (generatedRoutes vs customRoutes) × hop 2 (imports vs references chain via createStaticRoutes) × hop 5 (which api file fans out: auth/route/system-manage). KEY HUB at hop 3 = store/modules/route/index.ts — single chokepoint between route layer and api layer. For rev2 integration: if rust-api permission route contract changes, the affected radius starts at store/modules/route/index.ts and fans both upstream (router DSL, route types) and downstream (api fetch* functions). 6 hops also implies route → wire is INDIRECT — there is no direct 'route concept calls axios' edge; all routing-driven HTTP must go through the store/route intermediary.

## Source Nodes

- Elegant Router
- generatedRoutes
- store/modules/route/index.ts
- service/api/index.ts
- request