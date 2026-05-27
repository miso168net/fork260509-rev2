# Contract: Container entrypoint dispatcher

**Type**: container entrypoint(`deploy/entrypoint.rust-api.sh` 在 runtime image 內 `/usr/local/bin/entrypoint.sh`)

## Contract

Image `ENTRYPOINT` 固定為 `["/usr/local/bin/entrypoint.sh"]`,`CMD` 預設 `["server"]`。
透過第一個 argument 切換到 3 binary 任一個。

| Command | 對應 binary | exec 後行為 |
|---|---|---|
| `server` | `/usr/local/bin/server` | 跑 axum HTTP server(本 feature 範圍) |
| `migration` | `/usr/local/bin/migration` | 跑 sea-orm migration(本 feature stub、Phase 2 真實實作) |
| `cleanup-job` | `/usr/local/bin/cleanup-job` | 跑 soft-delete 物理清理(本 feature stub、Phase 5 真實實作) |
| 其他 | `usage: entrypoint.sh {server\|migration\|cleanup-job}` to stderr | exit code 64(EX_USAGE) |

## Wrapper script(`deploy/entrypoint.rust-api.sh`)

```sh
#!/bin/sh
set -e

case "$1" in
  server)
    exec /usr/local/bin/server
    ;;
  migration)
    shift
    exec /usr/local/bin/migration "$@"
    ;;
  cleanup-job)
    shift
    exec /usr/local/bin/cleanup-job "$@"
    ;;
  *)
    echo "usage: entrypoint.sh {server|migration|cleanup-job}" >&2
    exit 64
    ;;
esac
```

## Examples

```bash
# Default (CMD ["server"])
docker run --rm rev2-admin-rust-api:latest
# → exec server,boot 後跑到 listening 階段(若 secret 合法)

# 明示 server
docker run --rm rev2-admin-rust-api:latest server

# migration stub
docker run --rm rev2-admin-rust-api:latest migration
# stdout: migration stub — will be implemented in Phase 2 migration feature
# exit 0

# migration 帶 args(傳給 binary)
docker run --rm rev2-admin-rust-api:latest migration up
# 本 feature stub 忽略 args、直接印 stub 訊息 exit 0

# cleanup-job stub
docker run --rm rev2-admin-rust-api:latest cleanup-job
# stdout: cleanup-job stub — will be implemented in Phase 5 cleanup-job feature
# exit 0

# 未知 command
docker run --rm rev2-admin-rust-api:latest unknown
# stderr: usage: entrypoint.sh {server|migration|cleanup-job}
# exit 64
```

## 紀律

- `exec` 取代 process(不 fork wrapper script,讓 binary 直接成為 PID 1 ↔ docker stop SIGTERM 直送 binary)
- `set -e` 任何 sub-command 失敗即 wrapper exit(避免 silent failure)
- `shift` 讓 migration / cleanup-job 可帶 args(`migration up`, `cleanup-job --execute` 等);server 不帶 args(本 feature)
- 未來需要 `_FILE` shell expand(DESIGN §8.4)時,在 case 內加 `JWT_SECRET=$(cat $JWT_SECRET_FILE) exec /usr/local/bin/...`;本 feature 無此需(loader 在 application 層做)

## 驗收

對應 spec User Story 1 Acceptance Scenario 3 + SC-005。
