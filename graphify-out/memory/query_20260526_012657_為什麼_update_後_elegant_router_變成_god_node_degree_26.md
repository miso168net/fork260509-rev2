---
type: "explain"
date: "2026-05-26T01:26:57.110582+00:00"
question: "為什麼 update 後 Elegant Router 變成 god node（degree 26）？"
contributor: "graphify"
source_nodes: ["Elegant Router", "LastLevelRouteKey", "ElegantConstRoute", "generatedRoutes", "customRoutes", "src/guide/intro.md"]
---

# Q: 為什麼 update 後 Elegant Router 變成 god node（degree 26）？

## Answer

concept_elegant_router (base-web README.md, concept type, community 19). Degree 26 across 5 communities: C19 Route Type Hierarchy (20 'contains' edges to route key/path types: LastLevelRouteKey, ElegantConstRoute, RouteLayout, RouteMap, RouteKey, CenterLevelRoute, MultiLevelRoute, CustomRouteKey, FirstLevelRouteKey + variants — 20 type definitions); C24 Elegant Router DSL (2 contains: generatedRoutes router/elegant/routes.ts + customRoutes router/routes/index.ts); C40 (2 references back from base-web README.md and README.en_US.md); C14 Dev Dependencies (1 contains from package.json); C37 Router Guard Flow (1 references from docs/src/guide/intro.md — NEW this update, the marginal edge that pushed it past 'request' to god status). Not a code god, a concept-aggregator node: README organized 22 route types under it. For rev2 integration: rust-api permission route contracts must align with these 22 ElegantConstRoute schema types when returning UserRoutes/MenuList from backend.

## Source Nodes

- Elegant Router
- LastLevelRouteKey
- ElegantConstRoute
- generatedRoutes
- customRoutes
- src/guide/intro.md