---
type: community
cohesion: 0.19
members: 13
---

# docs: vitepress

**Cohesion:** 0.19 - loosely connected
**Members:** 13 nodes

## Members
- [[.vscodelaunch.json (Vue debugger on 9527 + TS debugger)]] - code - fork260509-soybean-admin-docs/.vscode/launch.json
- [[CustomLayout.vue (wraps DefaultTheme Layout with NoticeBar at layout-top)]] - code - fork260509-soybean-admin-docs/.vitepress/theme/CustomLayout.vue
- [[NoticeBar.vue (reactive notice from locale via useData)]] - code - fork260509-soybean-admin-docs/.vitepress/theme/NoticeBar.vue
- [[VitePress config (locales enzhjp, sidebar, algolia)]] - code - fork260509-soybean-admin-docs/.vitepress/config.ts
- [[eslint.config.js (@soybeanjseslint-config + markdown formatter)]] - code - fork260509-soybean-admin-docs/eslint.config.js
- [[icon.ts (qqSvg export for socialLinks)]] - code - fork260509-soybean-admin-docs/.vitepress/icon.ts
- [[jp.ts (Japanese VitePress locale)]] - code - fork260509-soybean-admin-docs/.vitepress/locales/jp.ts
- [[soybean-admin-docs package.json (VitePress 1.6.4 site)]] - code - fork260509-soybean-admin-docs/package.json
- [[themeindex.ts (extends DefaultTheme, sets CustomLayout)]] - code - fork260509-soybean-admin-docs/.vitepress/theme/index.ts
- [[tsconfig.json (strict ESNext, includes .vitepress + src)]] - code - fork260509-soybean-admin-docs/tsconfig.json
- [[types.d.ts (augments vitepress LocaleSpecificConfig with notice)]] - code - fork260509-soybean-admin-docs/.vitepress/types.d.ts
- [[useTable hook (sidebar Hooks Function entry)]] - concept - fork260509-soybean-admin-docs/.vitepress/config.ts
- [[zh.ts (Simplified Chinese VitePress locale)]] - code - fork260509-soybean-admin-docs/.vitepress/locales/zh.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/docs_vitepress
SORT file.name ASC
```
