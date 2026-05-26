---
type: "explain"
date: "2026-05-26T00:54:28.915252+00:00"
question: "為什麼 8 個 sub-package 都複製 compilerOptions（tsconfig duplication, refactor 機會）？"
contributor: "graphify"
source_nodes: ["compilerOptions", "tsconfig.json", "alova_tsconfig_compileroptions", "axios_tsconfig_compileroptions", "color_tsconfig_compileroptions", "hooks_tsconfig_compileroptions"]
---

# Q: 為什麼 8 個 sub-package 都複製 compilerOptions（tsconfig duplication, refactor 機會）？

## Answer

Graph found 9 compilerOptions nodes total: 1 root (workspace tsconfig.json, community 16, degree 17) + 8 sub-packages — alova/axios/color/hooks/materials/scripts/uno-preset/utils (communities 29-37, each degree 14 — identical neighbor count). The identical degree-14 fingerprint across all 8 sub-packages strongly suggests they duplicate the same set of compiler flags (allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution, noUnusedLocals, resolveJsonModule, strict, strictNullChecks, target — 14 options each). Refactor: introduce tsconfig.base.json at workspace root with shared options, each sub-package tsconfig becomes minimal '{ "extends": "../../tsconfig.base.json", ...package-specific overrides }'. Risk: pnpm workspace tsconfig extends paths need accuracy (use absolute via @sa alias or relative); some packages may legitimately need different jsx/lib settings — diff each before consolidation.

## Source Nodes

- compilerOptions
- tsconfig.json
- alova_tsconfig_compileroptions
- axios_tsconfig_compileroptions
- color_tsconfig_compileroptions
- hooks_tsconfig_compileroptions