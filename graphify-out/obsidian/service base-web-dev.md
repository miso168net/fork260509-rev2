---
source_file: "docker-compose.base-web.yml"
type: "code"
community: "Form Validation & Bootstrap"
location: "L21-L40"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Form_Validation__Bootstrap
---

# service: base-web-dev

## Connections
- [[Dockerfile.base-web.txt (multi-stage builder+nginx runtime)]] - `references` [EXTRACTED]
- [[command npm install -g pnpm@10 && pnpm install && pnpm dev]] - `references` [EXTRACTED]
- [[compose profile dev]] - `references` [EXTRACTED]
- [[dev port mapping 95279527]] - `references` [EXTRACTED]
- [[docker-compose.base-web.yml]] - `references` [EXTRACTED]
- [[env COREPACK_ENABLE_DOWNLOAD_PROMPT=0]] - `references` [EXTRACTED]
- [[follow-up prod profile 沒實機驗]] - `references` [EXTRACTED]
- [[image node20.19-alpine]] - `references` [EXTRACTED]
- [[named volume rev2_bw_node_modules]] - `shares_data_with` [EXTRACTED]
- [[prod port mapping 952880]] - `references` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Form_Validation__Bootstrap