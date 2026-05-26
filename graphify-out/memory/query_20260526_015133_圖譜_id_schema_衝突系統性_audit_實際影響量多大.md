---
type: "query"
date: "2026-05-26T01:51:33.694110+00:00"
question: "圖譜 ID schema 衝突系統性 audit：實際影響量多大？"
contributor: "graphify"
source_nodes: ["createHookRequest", "getHue", "createAxiosConfig", "theme_index", "vscode_settings"]
---

# Q: 圖譜 ID schema 衝突系統性 audit：實際影響量多大？

## Answer

Fuzzy match by (source_file, normalized_label) found 17 duplicate buckets / 34 affected nodes (1.6% of 2126 total). Split: (1) 9 buckets are AST-vs-semantic prefix mismatch — AST uses {immediate_parent}_{stem}_{entity} (e.g. palette_antd_gethue), semantic subagent uses {package_path}_{stem}_{entity} (e.g. color_palette_antd_gethue). Confirmed cases in packages/color (getHue, getValue, getColorName), packages/axios (createAxiosConfig, isHttpSuccess), src/plugins/assets.ts. For docs-site: semantic uses fork260509admindocs_ prefix without underscores, AST uses fork260509_soybean_admin_docs_ — entirely different schema. (2) 4 cross-repo edge mis-attribution edges (0.15% of 2648 edges) where edge.source_file is in one repo but source-node.source_file is in another due to ID collision (theme_index, vscode_settings, request_usage). Verdict: graph is ~98% clean. ID schema inconsistency exists but is contained. Not a blocker for using the graph. Fix path: (a) graphify extract --force next time, OR (b) accept and rely on graphify's fuzzy dedup. The 3 ghost-duplicates we explicitly noted (createHookRequest, route_index, palette/antd) are representative of the 9 prefix-mismatch buckets — not isolated incidents but contained class of issue. Recommend: do not invest in fix until next major refactor; current 1.6% noise is acceptable trade-off.

## Source Nodes

- createHookRequest
- getHue
- createAxiosConfig
- theme_index
- vscode_settings