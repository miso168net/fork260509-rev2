---
type: "query"
date: "2026-05-26T01:38:36.864166+00:00"
question: "docs↔code 跨倉覆蓋率如何？哪些是 extraction gap、哪些是真實 docs 缺口？"
contributor: "graphify"
source_nodes: ["系统路由总览", "路由结构", "主题配置", "INTEGRATION-CHECKLIST.md", "Color Palette Engine", "SVG Icon System"]
---

# Q: docs↔code 跨倉覆蓋率如何？哪些是 extraction gap、哪些是真實 docs 缺口？

## Answer

Coverage numbers: DOCS perspective: 17/121 docs nodes (14%) link to BASE code within 2 hops; 104 orphan. BASE perspective: only 112/1712 BASE code nodes (6.5%) reached by any doc within 2 hops; 1600 undocumented. BUT split matters: orphan docs = 77 infrastructure (tsconfig/package.json/vitepress/vscode — expected orphans) + 27 CONTENT orphans (markdown that SHOULD link). The 27 content orphans are mostly Chinese-language guides about real base-web features: 8 routing docs (路由结构/路由缓存/路由组件命名/路由文件创建/路由守卫流程图/动态静态路由/useRouterPush/系统路由总览), 3 theme+icon docs (主题配置/主题系统原理/图标使用四式), 2 CLI docs (sa CLI 命令/概述), intro & quickstart, devops (Vite 代理/Git Hooks/同步上游). ROOT CAUSE = extraction gap, not real docs gap: subagents processed docs in isolation, couldn't cross-language match Chinese '路由' to English 'route' / 主题 to theme etc. Real docs gap (smaller): workspace docs/INTEGRATION-CHECKLIST.md + INTEGRATION-RESEARCH.md are empty placeholders we created earlier. Real CODE-side undocumented (no Chinese or English doc): Color Palette Engine, Build Scripts, Admin Layout package, SVG Icon system, Chart Plugin, Layout Geometry, Global Search Module, Route Helpers — all 100% undocumented even when Chinese docs exist. Recommendation for next graphify run: pre-extract base-web vocabulary, feed to docs subagents as 'concept dictionary' to enforce cross-language matching when Chinese terms match English code symbols.

## Source Nodes

- 系统路由总览
- 路由结构
- 主题配置
- INTEGRATION-CHECKLIST.md
- Color Palette Engine
- SVG Icon System