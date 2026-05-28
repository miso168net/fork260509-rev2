# Contract: `generate-dev-cert.sh` CLI

**Type**: Bash script CLI interface(workspace-relative `deploy/generate-dev-cert.sh`)

## Signature

```bash
bash deploy/generate-dev-cert.sh [--force]
```

## Args

| Arg | Type | Default | Effect |
|---|---|---|---|
| `--force` | flag(無值)| absent | 強制覆寫已存在的 cert 檔(自簽路線覆寫全 4 檔;外部 CA 路線只覆寫 leaf 2 檔)|

**Arg parsing**:`[ "${1:-}" = "--force" ] && FORCE=1`(僅單 flag、不支援多 flag 組合)。

## Exit codes

| Code | Condition | 後續行為 |
|---|---|---|
| `0` | success(4 檔生成或 leaf-only 重生)| script 印「✅ cert 生成完成」+ trust 教學段 |
| `1` | `fullchain.pem` 已存在 AND `--force` 未加 | script 印「❌ fullchain.pem 已存在。要強制重生 leaf 加 --force」+ 區分自簽/外部 CA 兩種 `--force` 行為提示 |
| `> 1` | docker / openssl 失敗(`set -euo pipefail` 中途 abort)| script 印 docker / openssl error stderr;user 自查 |

## stdout 輸出格式

### 自簽路線 happy path

```
=== Step 1/2: 生 CA (RSA 2048, 10 年) ===
Generating RSA private key...
=== Step 2: 生 leaf cert (RSA 2048, 1 年, SAN localhost+127.0.0.1) ===
Generating RSA private key...
Certificate request self-signature ok
subject=CN = localhost

✅ cert 生成完成,fullchain 結構:leaf only(自簽 root = ca.pem,browser trust ca.pem 即可)
   /path/to/deploy/dev-certs/ca.pem        (自簽 root、要 trust)
   /path/to/deploy/dev-certs/ca.key        (SECRET,別洩漏)
   /path/to/deploy/dev-certs/fullchain.pem (nginx 用 / leaf only(自簽 root = ca.pem,browser trust ca.pem 即可))
   /path/to/deploy/dev-certs/privkey.pem   (SECRET,別洩漏)


★ 把 ca.pem trust 進 OS / browser 才不會跳 NET::ERR_CERT_AUTHORITY_INVALID:

[Windows 11 (Edge/Chrome 共用 OS root store)]
  certutil -addstore -user Root deploy/dev-certs/ca.pem

[macOS]
  sudo security add-trusted-cert -d -r trustRoot \
      -k /Library/Keychains/System.keychain deploy/dev-certs/ca.pem

[Linux (Debian/Ubuntu)]
  sudo cp deploy/dev-certs/ca.pem /usr/local/share/ca-certificates/rev2-dev-ca.crt
  sudo update-ca-certificates

cert 有效期:CA 10 年 / leaf 1 年。renew 跑 `--force`。
```

### 外部 CA 路線 happy path

```
📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key)— 跳 Step 1、直接用外部 CA 簽 leaf
=== Step 2: 生 leaf cert (RSA 2048, 1 年, SAN localhost+127.0.0.1) ===
Generating RSA private key...
Certificate request self-signature ok
subject=CN = localhost

✅ cert 生成完成,fullchain 結構:leaf + intermediate(外部 CA,對齊 acme chain)
   /path/to/deploy/dev-certs/ca.pem        (外部 CA、未動)
   /path/to/deploy/dev-certs/ca.key        (SECRET,別洩漏)
   /path/to/deploy/dev-certs/fullchain.pem (nginx 用 / leaf + intermediate(外部 CA,對齊 acme chain))
   /path/to/deploy/dev-certs/privkey.pem   (SECRET,別洩漏)


★ 你用了外部 CA(deploy/dev-certs/ca.pem),本 script 假設你已 trust 該 CA 的 root。
  若 ca.pem 是 intermediate(非 root),fullchain.pem 已含 intermediate,
  browser 仍需從 OS trust store 找到 root 才驗 chain;確認 root 已 trust。

cert 有效期:leaf 1 年(ca.pem 由你維護)。renew leaf 跑 `--force`。
```

### `fullchain.pem` 已存在無 `--force`

```
❌ /path/to/deploy/dev-certs/fullchain.pem 已存在。要強制重生 leaf 加 --force
   (--force 純自簽路線會一併覆寫 ca.pem + ca.key)
   (或 --force 外部 CA 路線只覆寫 leaf,不動 ca.*)
```

exit 1。

## Behavioral guarantees

| Guarantee | spec ref |
|---|---|
| `SCRIPT_DIR` 解析後不依賴 cwd,允許 workspace 任何子目錄跑 | FR-003 |
| zero-arg 第二次跑(已生)exit 1、不覆寫 | FR-011 + SC-006 |
| `--force` 自簽路線覆寫 4 檔 | FR-013 |
| `--force` 外部 CA 路線只覆寫 leaf 2 檔、保留 `ca.*` bytes 不變 | FR-012 + SC-007 |
| 3 OS trust 教學:自簽路線印 / 外部 CA 路線不印 | FR-015 / FR-016 |

## 不在 contract 內

- multi-flag 組合(如 `--force --rsa-4096`)— scope 外
- non-interactive `--silent` 模式 — scope 外(教學印就是設計目的)
- `--help` / `-h` flag — script 短、看 head comment 即足、不實作
- JSON / structured output — scope 外(human-readable only)
- 自動 OS trust install — FR-024 explicit 禁止

## 驗收

對應 spec FR-001 / FR-002 / FR-003 / FR-011 / FR-012 / FR-013 / FR-014 / FR-015 / FR-016 + SC-001 / SC-006 / SC-007。
