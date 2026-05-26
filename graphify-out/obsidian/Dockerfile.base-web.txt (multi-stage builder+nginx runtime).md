---
source_file: "deploy/Dockerfile.base-web.txt"
type: "code"
community: "Form Validation & Bootstrap"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Form_Validation__Bootstrap
---

# Dockerfile.base-web.txt (multi-stage builder+nginx runtime)

## Connections
- [[000 · base-web docker bootstrap brainstorm]] - `references` [EXTRACTED]
- [[Stage 1 builder (node20.19-alpine + pnpm build)]] - `conceptually_related_to` [EXTRACTED]
- [[Stage 2 runtime (nginxalpine serve usrsharenginxhtml)]] - `conceptually_related_to` [EXTRACTED]
- [[base-web-prod (compose service, profile=prod)]] - `references` [EXTRACTED]
- [[design decision explicit COPY 列舉 取代 .dockerignore]] - `rationale_for` [EXTRACTED]
- [[service base-web-dev]] - `references` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Form_Validation__Bootstrap