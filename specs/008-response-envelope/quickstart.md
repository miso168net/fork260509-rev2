# Quickstart: 008-response-envelope

> 回應信封基礎型別 + 404 fallback 的落地 + 驗證路徑。確切命令見 [contracts/verification-commands.md](./contracts/verification-commands.md)。

## 前置

- 007 已合（rust-api server crate 可編譯、dev stack 可起）。
- 無 host cargo → 經 dev image cargo。

## Path A — 編譯 + 信封/code/error 單測

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server envelope error
# Res 序列化形狀 / BizCode 全矩陣 / AppError→信封 映射 PASS
```

## Path B — 404 fallback live

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
curl -i -s http://127.0.0.1:21081/nonexistent     # 404 + {"data":null,"code":"4040","msg":"接口不存在"}
curl -fsS http://127.0.0.1:21081/health           # ok（不變）
```

## 落地檔案範圍（plan）

| 檔 | 動作 |
|---|---|
| `rust-api/Cargo.toml`（workspace）| 加 `serde_json = "1"` |
| `rust-api/server/Cargo.toml` | 加 `serde_json.workspace = true` |
| `rust-api/server/src/envelope.rs`（新）| `Res<T>` + 建構子 + `IntoResponse` + `BizCode` 完整矩陣 enum |
| `rust-api/server/src/error.rs`（新）| `AppError`（thiserror;NotFound/Internal）+ `IntoResponse` |
| `rust-api/server/src/main.rs` | `mod envelope; mod error;` + `.fallback(|| async { AppError::NotFound })`;`/health` 不動 |

> rust-api 為 worktree + submodule → 改 `rust-api/` 內檔走**兩段式 commit**（§4.1)。spec docs 為外層檔（落 008 feature branch）。
