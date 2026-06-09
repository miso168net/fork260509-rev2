---
source_file: "docker-compose.yml"
type: "code"
community: "Docker Compose Stack"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Docker_Compose_Stack
---

# grafana service (obs+metrics profiles)

## Connections
- [[loki log store (obs profile)]] - `shares_data_with` [EXTRACTED]
- [[prometheus (metrics profile)]] - `shares_data_with` [INFERRED]

#graphify/code #graphify/EXTRACTED #community/Docker_Compose_Stack