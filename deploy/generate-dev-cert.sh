#!/usr/bin/env bash
# rev2 dev TLS 自簽 cert 生成 — feature 003-tls-dev-cert
# 用法:bash deploy/generate-dev-cert.sh [--force]
#
# Hybrid 模式:
#   - 若 deploy/dev-certs/ca.pem + ca.key 已存在 → 跳 Step 1、用外部 CA 簽 leaf
#   - 否則 → 自簽 root CA(Step 1)+ 簽 leaf(Step 2)
#
# 設計:
# - 全跑 alpine/openssl docker container,host 只需 docker
# - RSA 2048 / SAN localhost+127.0.0.1
# - 外部 CA 路線:fullchain.pem = leaf + intermediate(對齊 acme chain)
# - 自簽路線:fullchain.pem = leaf only(root 已是 ca.pem)
#
# ★ 外部 CA 規則:
#   - ca.key 必須 plain(未加密)— 若你 CA key 是 AES256 加密,先解出 plain:
#     openssl rsa -in myca.enc -out deploy/dev-certs/ca.key -passin env:SSL_MYCA_PASS
#   - ca.pem 可為 root 或 intermediate(intermediate 情況 fullchain 會 cat 進去,
#     但 root 不會 — 你自己另在 OS 把 root trust)

set -euo pipefail

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/dev-certs"
mkdir -p "$CERT_DIR"

# 偵測外部 CA(ca.* 同時存在 AND 無 self-signed-marker → 外部 CA;否則自簽)
# marker 機制:Step 1 自簽生 CA 後寫入 marker,讓未來 --force 知道 ca.* 是 script 自己生的、要一併重生
# 切換到外部 CA 時須手動 `rm deploy/dev-certs/self-signed-marker` 後再放外部 ca.*
EXTERNAL_CA=0
if [ -f "$CERT_DIR/ca.pem" ] && [ -f "$CERT_DIR/ca.key" ] && [ ! -f "$CERT_DIR/self-signed-marker" ]; then
    EXTERNAL_CA=1
    echo "📌 偵測到外部 CA(deploy/dev-certs/ca.pem + ca.key,無 self-signed-marker)— 跳 Step 1、直接用外部 CA 簽 leaf"
fi

# 已有 leaf?
if [ -f "$CERT_DIR/fullchain.pem" ] && [ "$FORCE" -eq 0 ]; then
    echo "❌ $CERT_DIR/fullchain.pem 已存在。要強制重生 leaf 加 --force"
    [ "$EXTERNAL_CA" -eq 0 ] && echo "   (--force 純自簽路線會一併覆寫 ca.pem + ca.key)"
    [ "$EXTERNAL_CA" -eq 1 ] && echo "   (--force 外部 CA 路線只覆寫 leaf,不動 ca.*)"
    exit 1
fi

OPENSSL_IMG="alpine/openssl:latest"
docker pull -q "$OPENSSL_IMG" >/dev/null

run_openssl() {
    # -i:讓 heredoc stdin 進得了 container(否則 -extfile /dev/stdin 讀到空 input、SAN/BasicConstraints/KeyUsage extension 全沒 embed)
    docker run --rm -i -v "$CERT_DIR:/certs" -w /certs "$OPENSSL_IMG" "$@"
}

# Step 1: 生 CA (僅自簽路線)
if [ "$EXTERNAL_CA" -eq 0 ]; then
    echo "=== Step 1/2: 生 CA (RSA 2048, 10 年) ==="
    run_openssl genrsa -out ca.key 2048
    run_openssl req -new -x509 -key ca.key -days 3650 -out ca.pem \
        -subj "/CN=rev2-admin-root dev CA" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,cRLSign"
    # 標記自簽:讓下次 --force 知道 ca.* 是 script 自己生的、可一併重生
    touch "$CERT_DIR/self-signed-marker"
fi

# Step 2: 用 CA 簽 leaf (always)
echo "=== Step 2: 生 leaf cert (RSA 2048, 1 年, SAN localhost+127.0.0.1) ==="
run_openssl genrsa -out privkey.pem 2048
run_openssl req -new -key privkey.pem -out leaf.csr \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
run_openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
    -days 365 -out leaf-only.pem -extfile /dev/stdin <<EXT
subjectAltName=DNS:localhost,IP:127.0.0.1
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EXT

# fullchain.pem 組合
if [ "$EXTERNAL_CA" -eq 1 ]; then
    cat "$CERT_DIR/leaf-only.pem" "$CERT_DIR/ca.pem" > "$CERT_DIR/fullchain.pem"
    CHAIN_MSG="leaf + intermediate(外部 CA,對齊 acme chain)"
else
    cp "$CERT_DIR/leaf-only.pem" "$CERT_DIR/fullchain.pem"
    CHAIN_MSG="leaf only(自簽 root = ca.pem,browser trust ca.pem 即可)"
fi
rm -f "$CERT_DIR/leaf.csr" "$CERT_DIR/ca.srl" "$CERT_DIR/leaf-only.pem"

# 收尾 + 教學
cat <<EOF

✅ cert 生成完成,fullchain 結構:$CHAIN_MSG
   $CERT_DIR/ca.pem        ($([ "$EXTERNAL_CA" -eq 1 ] && echo "外部 CA、未動" || echo "自簽 root、要 trust"))
   $CERT_DIR/ca.key        (SECRET,別洩漏)
   $CERT_DIR/fullchain.pem (nginx 用 / $CHAIN_MSG)
   $CERT_DIR/privkey.pem   (SECRET,別洩漏)

EOF

if [ "$EXTERNAL_CA" -eq 0 ]; then
    cat <<TRUST

★ 把 ca.pem trust 進 OS / browser 才不會跳 NET::ERR_CERT_AUTHORITY_INVALID:

[Windows 11 (Edge/Chrome 共用 OS root store)]
  certutil -addstore -user Root deploy/dev-certs/ca.pem

[macOS]
  sudo security add-trusted-cert -d -r trustRoot \\
      -k /Library/Keychains/System.keychain deploy/dev-certs/ca.pem

[Linux (Debian/Ubuntu)]
  sudo cp deploy/dev-certs/ca.pem /usr/local/share/ca-certificates/rev2-dev-ca.crt
  sudo update-ca-certificates

cert 有效期:CA 10 年 / leaf 1 年。renew 跑 \`--force\`。
TRUST
else
    cat <<TRUST_EXT

★ 你用了外部 CA(deploy/dev-certs/ca.pem),本 script 假設你已 trust 該 CA 的 root。
  若 ca.pem 是 intermediate(非 root),fullchain.pem 已含 intermediate,
  browser 仍需從 OS trust store 找到 root 才驗 chain;確認 root 已 trust。

cert 有效期:leaf 1 年(ca.pem 由你維護)。renew leaf 跑 \`--force\`。
TRUST_EXT
fi
