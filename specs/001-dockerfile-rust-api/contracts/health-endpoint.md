# Contract: `/health` HTTP endpoint

**Type**: HTTP endpoint(server bin 暴露)

## Request

| 屬性 | 值 |
|---|---|
| Method | `GET` |
| Path | `/health` |
| Headers | 無要求(不檢查 `Authorization` / `Content-Type`) |
| Body | 無 |

## Response

| 屬性 | 值 |
|---|---|
| Status | `200 OK` |
| Content-Type | `text/plain; charset=utf-8`(axum 預設 `&'static str` handler 回此 type) |
| Body | `ok`(literal,無 trailing newline) |

## Middleware 紀律

- **不走 auth middleware**(無 token 也能訪問;對應 spec FR-005)
- **不走 Casbin enforce**(本 feature 無 Casbin、但即使 Phase 3+ 加 Casbin、`/health` 仍維持 public)
- **不走 audit log middleware**(避 audit_log 表被 health probe 灌爆)
- **不走 envelope wrapper**(對齊 DESIGN §5.1 router 表「global health (不走 envelope,plain text 'ok')」)

## Examples

```bash
# Request
curl -fsS http://127.0.0.1:21081/health
# Response (stdout): ok
# Exit code: 0

# Failure mode 1: server 沒起來
curl -fsS http://127.0.0.1:21081/health
# Exit code: 7 (Couldn't connect to server)

# Failure mode 2: server 起來但 boot panic 還沒復原
curl -fsS http://127.0.0.1:21081/health
# Exit code: 7 (連線失敗;panic 後 process exit、port 不 listen)
```

## Healthcheck integration

Dockerfile 內 `HEALTHCHECK`:
```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1:21081/health || exit 1
```

- `start-period=5s`:給 server boot 5 秒 grace(對齊 SC-003「5 秒內 panic」)
- `interval=10s`:每 10 秒 probe(不太密)
- `retries=3`:3 次失敗才標 unhealthy(避免 transient hiccup 誤判)

## 不在 contract 內

- Deep health check(DB / Redis 連線狀態)— Phase 2+ feature 加 `/health/ready` 之類分流
- 健康狀態 JSON(`{status: "ok", version: "0.1.0"}`)— Phase 6 observability 才考慮
- Authentication / authorization

## 驗收

對應 spec User Story 1 Acceptance Scenario 2 + SC-001 末段 curl 驗收。
