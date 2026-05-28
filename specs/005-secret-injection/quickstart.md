# Quickstart: secret-injection

> secret 注入機制單頁指南。設計見 [plan.md](./plan.md);驗收見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

---

## 前置

- docker(openssl 走 docker 化 `alpine/openssl`,host 無需裝 openssl)
- 在 feature branch `005-secret-injection`

---

## Path A — 一鍵生成全部必須 secret

```bash
bash deploy/generate-secrets.sh
# 預期: 7 個 secret .txt 生成於 deploy/secrets/(jwt/refresh/postgres_password/redis_password/
#       database_url/redis_url/cleanup_database_url),印 GENERATED 摘要(不印值),exit 0

ls deploy/secrets/*.txt          # 7 個
cat deploy/secrets/database_url.txt
# postgres://soybean:<亂數>@postgres:5432/soybean_admin_rust
```

重跑不覆寫(idempotent);要全部換新值:`bash deploy/generate-secrets.sh --force`。

---

## Path B — dual-write 驗證

```bash
PG=$(cat deploy/secrets/postgres_password.txt)
grep -qF "$PG" deploy/secrets/database_url.txt && echo "OK:database_url 內嵌 = postgres_password"
RD=$(cat deploy/secrets/redis_password.txt)
grep -qF "$RD" deploy/secrets/redis_url.txt && echo "OK:redis_url 內嵌 = redis_password"
```

> dual-write 由腳本同次組出保證,**勿手改葉子 password 而不更新 URL**(會造成連線認證失敗)。要改一律重跑腳本。

---

## Path C — 範本與文件

```bash
ls deploy/secrets/*.txt.example     # 7 範本(git-tracked)
cat deploy/secrets/README.md        # 7 secret 清單 + dual-write 不變式 + 手動 fallback + Phase 2 前瞻
git check-ignore deploy/secrets/postgres_password.txt   # 回路徑 = ignored(真實 secret 不進版控)
```

---

## Path D — 004 DB 命名對齊 + stack 連線

```bash
# docker-compose.yml postgres 已改 soybean/soybean_admin_rust;首次切換需清舊卷:
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 預期: 5 service healthy(postgres 以 soybean/soybean_admin_rust 重 init)

docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c '\conninfo'
# 預期: connected to "soybean_admin_rust" as user "soybean"
```

> ⚠️ 不 `down -v` 直接改 env → postgres 偵測非空 data dir 跳 init,新 user/db 不生效、`psql -U soybean` 認證失敗(見 [research R9](./research.md))。

---

## Troubleshooting

| 症狀 | 處置 |
|---|---|
| `psql -U soybean` 認證失敗 | 改命名後未 `down -v` 清舊卷;postgres 未重 init |
| dual-write grep 不符 | 有人手改葉子未更新 URL;`generate-secrets.sh --force` 重生 |
| rust-api boot panic「placeholder / length」 | jwt/refresh `.txt` 還是範本 placeholder;跑 generate-secrets.sh 生真值 |
| `docker pull alpine/openssl` 失敗 | 確認 docker 可連 registry(同 003 cert 生成前置) |

---

## 下一步

- 跑完 Path A-D → 本 feature 完成(7 必 secret 可一鍵生 + dual-write + 範本/文件齊 + 004 命名對齊)
- Phase 2:rust-api/migration 接 `database_url`/`redis_url`(掛 compose `secrets:` + `APP_*_FILE` env + `config.rs` 加 `[database]`/`[redis]`)
- Phase 5:cleanup-job 最小權限 role + `cleanup_database_url` 改用該 role
- 實作走 `superpowers:executing-plans`(**不**用 `/speckit-implement`,對齊 CLAUDE.md §3)
