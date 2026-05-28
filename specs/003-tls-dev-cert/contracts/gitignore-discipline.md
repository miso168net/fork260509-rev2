# Contract: gitignore discipline

**Type**: gitignore pattern + git track invariant

## `.gitignore` entries 加(workspace root,append 到既有 `.gitignore`)

```gitignore
# dev TLS cert(feature 003-tls-dev-cert,內容全 ignore、保留 .gitkeep)
deploy/dev-certs/*
!deploy/dev-certs/.gitkeep
```

**順序紀律**:wildcard exclude `deploy/dev-certs/*` 必須在 negation `!deploy/dev-certs/.gitkeep` **之前**;若顛倒、negation 失效(後面又 wildcard 排除全部)。

## Pattern 行為

`deploy/dev-certs/*` 解釋:
- 對目錄內**所有**檔案 / 子目錄都 ignore
- 不影響目錄本身(`deploy/dev-certs/` 仍可被 git 「看到」,只是內容空)

`!deploy/dev-certs/.gitkeep` 解釋:
- 對 `.gitkeep` 檔案豁免 ignore、允許被 track
- 必須在前面 `deploy/dev-certs/*` 之後(順序錯則無效)
- 對「已被 directory exclude」內檔案無效 — 故須前面 wildcard 寫成 `*` 而非裸 `deploy/dev-certs/`(裸 dir exclude 後 negation 無法 re-include)

## Invariant

| 時間點 | `git status --short deploy/dev-certs/` | `git ls-files deploy/dev-certs/` |
|---|---|---|
| Fresh clone(只 `.gitkeep` 在 dir 內)| 空 | `deploy/dev-certs/.gitkeep` |
| script 跑完(自簽 4 檔在 dir 內)| 空(4 個 cert/key 全 ignored)| `deploy/dev-certs/.gitkeep` |
| script 跑完(外部 CA 4 檔在 dir 內)| 空 | `deploy/dev-certs/.gitkeep` |
| `git add -A`(任何 dirty state)| 空(無新 stage)| `deploy/dev-certs/.gitkeep`(僅原 tracked)|

## 違反 invariant 的情況

- 若有人**已** commit `ca.key` 進 git 歷史(本 feature 落地前不會出現),gitignore 對已 tracked file 無效 — 須手動 `git rm --cached deploy/dev-certs/ca.key`(本 feature scope 外、follow-up 不會碰到)
- 若有人手動 `git add -f deploy/dev-certs/ca.key`(force add 繞 gitignore),會 stage — 違反 FR-022 但 git 允許;規範靠 user 紀律 + acceptance §4 驗

## `.gitkeep` 用途

`.gitkeep` 不是 git 官方功能,是 convention:
- 空檔(0 bytes)
- 作為「目錄內唯一 tracked 檔」確保 git 不省略空目錄
- alternative:`.keep` / `README.md` 之類 — `.gitkeep` 較通用、不 noise

## 驗收

對應 spec FR-019 / FR-020 / FR-021 / FR-022 + SC-005。
