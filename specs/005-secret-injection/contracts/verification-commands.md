# Contract: Verification commands(C-V acceptance)

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — CLAUDE.md §3 紀律提醒**:本 feature 屬「shell 腳本 + secret 範本 + docs」,**無新純函式邏輯**。整體由本 C-V contract 覆蓋驗收;`tasks.md` / `plan.md` 明示「無單元測試,由 acceptance commands 覆蓋」及理由。

---

## §1 一鍵生成 + 數量(US1 + SC-001)

```bash
rm -f deploy/secrets/*.txt
bash deploy/generate-secrets.sh ; echo "exit: $?"
# 預期: exit 0、印生成摘要(7 GENERATED、不含 secret 值)
ls deploy/secrets/*.txt | wc -l
# 預期: 7(jwt_secret refresh_token_secret postgres_password redis_password database_url redis_url cleanup_database_url)
```

---

## §2 dual-write 不變式(US1 + SC-002)

```bash
PG=$(cat deploy/secrets/postgres_password.txt)
RD=$(cat deploy/secrets/redis_password.txt)
grep -qF "$PG" deploy/secrets/database_url.txt          && echo "database_url dual-write OK"
grep -qF "$PG" deploy/secrets/cleanup_database_url.txt  && echo "cleanup_database_url dual-write OK"
grep -qF "$RD" deploy/secrets/redis_url.txt             && echo "redis_url dual-write OK"
# 預期: 三行皆 OK
cat deploy/secrets/database_url.txt
# 預期: postgres://soybean:<PG>@postgres:5432/soybean_admin_rust
cat deploy/secrets/redis_url.txt
# 預期: redis://:<RD>@redis-stack:6379
```

---

## §3 idempotent + --force(US1 + SC-003)

```bash
PG1=$(cat deploy/secrets/postgres_password.txt)
bash deploy/generate-secrets.sh
[ "$PG1" = "$(cat deploy/secrets/postgres_password.txt)" ] && echo "idempotent skip OK"
# 預期: idempotent skip OK(zero-arg 不覆寫)

bash deploy/generate-secrets.sh --force
[ "$PG1" != "$(cat deploy/secrets/postgres_password.txt)" ] && echo "--force regen OK"
# 預期: --force regen OK(值改變)
# 且 --force 後 dual-write 仍成立(重跑 §2 驗)
```

---

## §4 gitignore(US2 + SC-004)

```bash
git check-ignore deploy/secrets/database_url.txt
# 預期: 回路徑(ignored)
git check-ignore deploy/secrets/database_url.txt.example; [ $? -ne 0 ] && echo "example tracked OK"
# 預期: example tracked OK(.example 不被 ignore)
```

---

## §5 範本 + README 齊備(US2 + SC-005)

```bash
ls deploy/secrets/*.txt.example | wc -l
# 預期: 7(含新增 database_url/redis_url/cleanup_database_url)
for f in database_url redis_url cleanup_database_url postgres_password redis_password; do
  head -1 "deploy/secrets/$f.txt.example" | grep -q "^#" && echo "$f rich-format OK"
done
# 預期: 5 行 OK(新增 3 + retrofit 2 首行皆為註解)
[ -f deploy/secrets/README.md ] && grep -c "database_url\|redis_url\|cleanup_database_url\|jwt_secret\|refresh_token_secret\|postgres_password\|redis_password" deploy/secrets/README.md
# 預期: README 存在、列出 7 secret(grep count ≥ 7)
```

---

## §6 jwt/refresh 過 001 loader 驗證(US1 + SC-007)

```bash
[ "$(wc -c < deploy/secrets/jwt_secret.txt)" -ge 32 ] && echo "jwt len>=32 OK"
[ "$(wc -c < deploy/secrets/refresh_token_secret.txt)" -ge 32 ] && echo "refresh len>=32 OK"
# 預期: 兩行 OK(rand -base64 48 = 64 字元;非黑名單)
```

---

## §7 004 soybean 命名 + 連線通(US3 + SC-006)

```bash
# 改 docker-compose.yml postgres POSTGRES_USER=soybean / POSTGRES_DB=soybean_admin_rust 後:
grep -E "POSTGRES_USER:|POSTGRES_DB:|pg_isready -U" docker-compose.yml
# 預期: soybean / soybean_admin_rust / pg_isready -U soybean

docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "exit: $?"
# 預期: exit 0、5 service healthy(postgres 以新 user/db 重 init)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c '\conninfo'
# 預期: 連線成功(You are connected to database "soybean_admin_rust" as user "soybean")
```

---

## 驗收紀律總結

- §1 一鍵生成 + 數量(US1 + SC-001)
- §2 dual-write 不變式(US1 + SC-002)
- §3 idempotent + --force(US1 + SC-003)
- §4 gitignore(US2 + SC-004)
- §5 範本 + README 齊備(US2 + SC-005)
- §6 jwt/refresh 過 001 loader(US1 + SC-007)
- §7 004 soybean 命名 + 連線通(US3 + SC-006）

`tasks.md` 階段把 §1-§7 排程進 task、對應 spec acceptance scenario 與 SC。
