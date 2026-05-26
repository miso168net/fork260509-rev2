---
type: "query"
date: "2026-05-26T00:48:46.116201+00:00"
question: "為什麼 $t (i18n global translator) 是跨 9 個社群（HTTP / Form / Theme / Bootstrap / Auth / Icon / Route）的最強橋接點？"
contributor: "graphify"
source_nodes: ["$t (i18n global translator)", "service/request/index.ts", "service-alova/request/index.ts", "form.ts", "table.ts", "captcha.ts", "title.ts", "applyPreset"]
---

# Q: 為什麼 $t (i18n global translator) 是跨 9 個社群（HTTP / Form / Theme / Bootstrap / Auth / Icon / Route）的最強橋接點？

## Answer

Expanded from original query via vocab: [translator, translate, lang, locale, locales, naive, provider, global, setup, bootstrap, app, hook]. Then traversed via graphify explain on locales_index_t (the actual god-node ID). $t (locales_index_t, src/locales/index.ts) is a pure leaf with 17 inbound edges (15 imports + 3 calls), zero outbound edges. The 17 callers fan across 10 communities: C4 Form & Table Hooks (3: captcha.ts, form.ts, table.ts), C55 (3: router/guard/title.ts + theme-preset.vue applyPreset), C10 App Bootstrap & Providers (2: plugins/app.ts setupAppVersionNotification), C90 (2: plugins/loading.ts setupLoading), C18 Auth Storage & Locale Boot (2: store/app/index.ts, store/auth/index.ts), C0 HTTP Request Layer (1: service/request/index.ts), C41 (1: service-alova/request/index.ts — alova mirror of axios path), C23 SVG Icon System (1: store/route/shared.ts), C24 Route Helpers & Tab Filters (1: store/tab/shared.ts), C7 Theme Constants & Maps (1: utils/common.ts). Pattern: single global utility scattered everywhere — bridging happens because every user-facing string in network errors, route titles, tab labels, theme preset names, captcha messages, form validation, version notifications, and loading spinners passes through this one function. For rev2 integration: rust-api error codes must align with the i18n keys imported by service/request and service-alova/request, otherwise localized error display breaks.

## Source Nodes

- $t (i18n global translator)
- service/request/index.ts
- service-alova/request/index.ts
- form.ts
- table.ts
- captcha.ts
- title.ts
- applyPreset