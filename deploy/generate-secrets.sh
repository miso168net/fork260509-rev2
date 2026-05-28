#!/usr/bin/env bash
# rev2 deploy 必須 secret 一鍵生成 — feature 005-secret-injection
# 用法:bash deploy/generate-secrets.sh [--force]
#
# 功能:
#   生成 7 個必須 secret 檔到 deploy/secrets/*.txt
#   - 4 個 leaf secret: jwt_secret, refresh_token_secret, postgres_password, redis_password
#   - 3 個 URL secret: database_url, redis_url, cleanup_database_url
#
# 設計:
#   - 全跑 alpine/openssl docker container,host 只需 docker
#   - jwt/refresh leaf: openssl rand -base64 48(64 chars)→ 通過 rust-api validate_secret(len ≥ 32)
#   - postgres/redis leaf: openssl rand -hex 24(48 hex chars,URL-safe;熵同 base64 24)→ 嵌入 URL 不被 + / = 破壞
#   - URL: 從 leaf cat 組合(R6 同次同源 dual-write,不重呼 gen_rand)
#   - 不含 obs/optional secret(acme_email/grafana/exporter)
#
# 冪等語義:
#   - 零參數:已存在的 .txt 直接跳過,缺失的才補生
#   - --force:強制重生全部(leaf + URL),URL 從新 leaf cat

set -euo pipefail

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_DIR="$SCRIPT_DIR/secrets"
mkdir -p "$SECRETS_DIR"

OPENSSL_IMG="alpine/openssl:latest"
docker pull -q "$OPENSSL_IMG" >/dev/null

# gen_rand <openssl-rand-args...>:回傳隨機值(如 -base64 48 或 -hex 24;command subst 已去尾換行)
gen_rand() {
    docker run --rm "$OPENSSL_IMG" rand "$@"
}

# 追蹤各 secret 狀態(GENERATED / SKIPPED)
declare -A STATUS

# ============================================================
# Step 1: 4 個 leaf secret
# ============================================================
echo "=== Step 1: 生成 leaf secret ==="

gen_leaf() {
    local name="$1"; shift
    local file="$SECRETS_DIR/${name}.txt"
    if [ ! -f "$file" ] || [ "$FORCE" -eq 1 ]; then
        local val
        val="$(gen_rand "$@")"
        printf '%s' "$val" > "$file"
        STATUS["$name"]="GENERATED"
    else
        STATUS["$name"]="SKIPPED"
    fi
}

# jwt/refresh 用 base64(不進 URL);postgres/redis 用 hex(URL-safe,避免 + / = 破壞連線 URL)
gen_leaf "jwt_secret"            -base64 48
gen_leaf "refresh_token_secret"  -base64 48
gen_leaf "postgres_password"     -hex 24
gen_leaf "redis_password"        -hex 24

# ============================================================
# Step 2: 3 個 URL secret(從 leaf cat,R6 同次同源 dual-write)
# ============================================================
echo "=== Step 2: 生成 URL secret(dual-write 從 leaf 組合)==="

gen_url() {
    local name="$1"
    local value="$2"
    local file="$SECRETS_DIR/${name}.txt"
    if [ ! -f "$file" ] || [ "$FORCE" -eq 1 ]; then
        printf '%s' "$value" > "$file"
        STATUS["$name"]="GENERATED"
    else
        STATUS["$name"]="SKIPPED"
    fi
}

PG_PASS="$(cat "$SECRETS_DIR/postgres_password.txt")"
RD_PASS="$(cat "$SECRETS_DIR/redis_password.txt")"

DATABASE_URL="postgres://soybean:${PG_PASS}@postgres:5432/soybean_admin_rust"
REDIS_URL="redis://:${RD_PASS}@redis-stack:6379"

gen_url "database_url"          "$DATABASE_URL"
gen_url "redis_url"             "$REDIS_URL"
gen_url "cleanup_database_url"  "$DATABASE_URL"

# ============================================================
# Step 3: 設定 secret 檔案權限
# ============================================================
# Windows drvfs 掛載時 chmod 為 no-op,但仍執行(不 error-handle)
chmod 600 "$SECRETS_DIR"/*.txt

# ============================================================
# Step 4: 生成摘要(只印檔名 + GENERATED/SKIPPED,不印 secret 值)
# ============================================================
echo ""
echo "=== Secret 生成摘要 ==="
for name in jwt_secret refresh_token_secret postgres_password redis_password \
            database_url redis_url cleanup_database_url; do
    printf "  %-30s %s\n" "${name}.txt" "${STATUS[$name]}"
done
echo ""
echo "✅ 完成。deploy/secrets/*.txt 已就緒(gitignored,不進 repo)"
