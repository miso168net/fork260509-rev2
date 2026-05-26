---
type: "explain"
date: "2026-05-26T01:51:33.836632+00:00"
question: "C15 「SVG Icon System」社群標籤是否準確？"
contributor: "graphify"
source_nodes: ["C15", "store/modules/route/index.ts", "useSvgIcon"]
---

# Q: C15 「SVG Icon System」社群標籤是否準確？

## Answer

Label C15 'SVG Icon System' is misleading. Originally derived from first 5 visible members (useSvgIcon, svg-icon.vue, icon.ts) which gave SVG impression. But C15 also contains the HIGHEST-degree node in that cluster: the AST file node for src/store/modules/route/index.ts (degree 32). Louvain grouped them because both groups (SVG icon utilities AND route store) heavily import index.ts barrel files. More accurate label: 'Route Store + SVG Icon Module Barrels' or 'Index.ts Barrel Cluster'. Demonstrates a labeling-from-top-5-members weakness: if a community has a high-degree node late in the member list, top-5 sampling misses it. For future relabels, sort members by degree before sampling.

## Source Nodes

- C15
- store/modules/route/index.ts
- useSvgIcon