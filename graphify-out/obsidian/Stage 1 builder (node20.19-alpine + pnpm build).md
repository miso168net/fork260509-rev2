---
source_file: "deploy/Dockerfile.base-web.txt"
type: "code"
community: "Form Validation & Bootstrap"
location: "10-40"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Form_Validation__Bootstrap
---

# Stage 1 builder (node:20.19-alpine + pnpm build)

## Connections
- [[Dockerfile.base-web.txt (multi-stage builder+nginx runtime)]] - `conceptually_related_to` [EXTRACTED]
- [[Stage 2 runtime (nginxalpine serve usrsharenginxhtml)]] - `shares_data_with` [EXTRACTED]
- [[nginx default.conf (SPA fallback try_files index.html)]] - `conceptually_related_to` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Form_Validation__Bootstrap