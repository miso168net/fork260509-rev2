---
type: "query"
date: "2026-05-26T01:26:57.198561+00:00"
question: "Surprising Connection 5 (theme store → CustomLayout) 是真是假？"
contributor: "graphify"
source_nodes: ["store/modules/theme/index.ts", "CustomLayout.vue", "theme_index", "vscode_settings_editor_codeactionsonsave", "request_usage"]
---

# Q: Surprising Connection 5 (theme store → CustomLayout) 是真是假？

## Answer

FALSE POSITIVE caused by ID collision in cross-repo graph merge. Real situation: docs-site's .vitepress/theme/index.ts imports CustomLayout.vue (true edge). But graphify's ID scheme {parent_dir}_{stem}_{entity} produced 'theme_index' for both (a) base-web src/store/modules/theme/index.ts and (b) docs-site .vitepress/theme/index.ts. Fuzzy dedup collapsed them into one node, so the docs-site's references edge appears to originate from base-web's theme store. Survey of all 2648 edges found only 4 such cross-repo ID-collision edges (0.2%): vscode_settings_editor_codeactionsonsave (2 collisions, both .vscode/settings.json), request_usage (1), theme_index (1 — this case). Impact is small now but will grow if rust-api with common stems like mod.rs / lib.rs / utils/mod.rs is merged. Workarounds: (a) use graphify merge-graphs CLI which adds 'repo' attribute per node, (b) future graphify version should prefix IDs with repo. Not a graphify reliability issue, just a known limitation of cross-repo merging via simple union.

## Source Nodes

- store/modules/theme/index.ts
- CustomLayout.vue
- theme_index
- vscode_settings_editor_codeactionsonsave
- request_usage