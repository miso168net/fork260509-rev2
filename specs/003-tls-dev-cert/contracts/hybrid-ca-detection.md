# Contract: Hybrid CA detection

**Type**: Script behavioral contract — `EXTERNAL_CA` state determination

## Detection logic(script first 5 lines after `CERT_DIR` resolved)

```bash
EXTERNAL_CA=0
if [ -f "$CERT_DIR/ca.pem" ] && [ -f "$CERT_DIR/ca.key" ]; then
    EXTERNAL_CA=1
    echo "📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key)— 跳 Step 1、直接用外部 CA 簽 leaf"
fi
```

**Truth table**:

| `ca.pem` 存在 | `ca.key` 存在 | `EXTERNAL_CA` 值 | 行為 |
|---|---|---|---|
| ✘ | ✘ | 0 | 走自簽路線(Step 1 + Step 2)|
| ✘ | ✓ | 0 | 走自簽路線(只放一檔語意不明,Edge Case 接受;自簽路線會覆寫 `ca.key`)|
| ✓ | ✘ | 0 | 走自簽路線(只放一檔語意不明,Edge Case 接受;自簽路線會覆寫 `ca.pem`)|
| ✓ | ✓ | 1 | 走外部 CA 路線(跳 Step 1,只跑 Step 2 簽 leaf)|

## State machine

```
┌──────────────────────────────────────────┐
│ EXTERNAL_CA = 0 (自簽路線)               │
├──────────────────────────────────────────┤
│ - 跑 Step 1:生 ca.pem (10 年) + ca.key  │
│ - 跑 Step 2:用 ca.pem 簽 leaf cert       │
│ - fullchain.pem = leaf only(cp from     │
│   leaf-only.pem)                         │
│ - print 3 OS trust 教學                  │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ EXTERNAL_CA = 1 (外部 CA 路線)           │
├──────────────────────────────────────────┤
│ - 跳 Step 1(不動 ca.pem / ca.key)      │
│ - 跑 Step 2:用 user 預放 ca.pem 簽 leaf │
│ - fullchain.pem = cat leaf-only.pem      │
│   + ca.pem(對齊 acme chain)            │
│ - print「假設你已 trust 該 CA 的 root」  │
│   提醒(不印 3 OS trust 教學)           │
└──────────────────────────────────────────┘
```

## `--force` flag 與 `EXTERNAL_CA` 交互

| `EXTERNAL_CA` | `--force` | 覆寫範圍 |
|---|---|---|
| 0(自簽)| 無 | exit 1(若 fullchain.pem 已存在) |
| 0(自簽)| 有 | 4 檔全覆寫(ca.pem / ca.key / fullchain.pem / privkey.pem)|
| 1(外部 CA)| 無 | exit 1(若 fullchain.pem 已存在) |
| 1(外部 CA)| 有 | **只**覆寫 leaf 2 檔(fullchain.pem + privkey.pem);`ca.pem` 與 `ca.key` bytes 不變(SC-007)|

## Edge cases

- **Edge 1:user 只放 `ca.pem`(忘 `ca.key`)**:走自簽路線、自簽 `ca.pem` 會覆寫 user 預放的(若無 `--force` 則 exit 1 之前 user 不會發現;若有 `--force` 則 user `ca.pem` 被覆寫)— spec Edge Cases 接受、設計如此(只放一檔語意不明)
- **Edge 2:user 預放 `ca.pem` + `ca.key`,但 `ca.key` 是 AES256 加密**:script 偵測到兩檔存在 → `EXTERNAL_CA=1`,然後跑 Step 2 時 `openssl x509 -req -CAkey ca.key` 會 prompt passphrase → non-interactive container 無 stdin → fail。Edge Case 已涵蓋,user 須手動先解出 plain `ca.key`
- **Edge 3:`ca.pem` 與 `ca.key` 不 match**(public key 不對應 private key):script 偵測不出來(只看 file 存在);Step 2 `openssl x509 -req -CA ca.pem -CAkey ca.key` 簽 leaf 時 openssl 會 error。user 看 openssl 訊息 debug

## 驗收

對應 spec FR-004 / FR-005 + Edge Cases 第 1-3 條。
