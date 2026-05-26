---
type: "explain"
date: "2026-05-26T00:54:28.818679+00:00"
question: "localStg（localStorage wrapper, degree 15）為何也是 god node、橋接 auth/theme/tab？"
contributor: "graphify"
source_nodes: ["localStg", "sessionStg", "store/modules/auth/index.ts", "store/modules/theme/index.ts", "store/modules/tab/index.ts", "service/request/index.ts", "service-alova/request/shared.ts"]
---

# Q: localStg（localStorage wrapper, degree 15）為何也是 god node、橋接 auth/theme/tab？

## Answer

localStg (utils_storage_localstg, src/utils/storage.ts L5) = universal state persistence layer. 15 callers across 7 communities: C18 Auth Storage & Locale Boot (6: dayjs/i18n/app/auth + shared + self), C0 HTTP Request Layer (2: service/request + shared), C42 (2: theme store + shared), C90 (1: plugins/loading.ts), C77 (1: router/guard/route.ts), C66 (1: service-alova/request/shared.ts — alova mirror), C24 Route Helpers & Tab Filters (1: tab store). Outbound: semantically_similar_to → sessionStg (graph caught the wrapper pair). Pattern: anything that needs to survive page reload sits here — auth tokens, theme settings, dayjs locale, i18n lang, open tabs, loading state. Implications: (1) clearAuthStorage / clearAll APIs must coordinate across 7 modules; (2) localStg key naming collisions across modules is a real risk — grep usage to audit key namespace; (3) for rev2, rust-api session timeout behavior must trigger localStg.clear() on the front to evict stale tokens across all 7 modules atomically.

## Source Nodes

- localStg
- sessionStg
- store/modules/auth/index.ts
- store/modules/theme/index.ts
- store/modules/tab/index.ts
- service/request/index.ts
- service-alova/request/shared.ts