# Quickstart: refresh token rotation

**Feature**: 027-refresh-token-rotation

## 改什麼(rust-api 單倉)
1. `migration/src/m20260529_000026_create_sys_token.rs` + 註冊進 `migration/src/lib.rs`。
2. `entity/src/sys_token.rs`(+ `lib.rs` `pub mod`)。
3. `server/src/model/facade/sys_token.rs`(+ `facade/mod.rs`):`decide_rotation`(純)+ `create_chain_head` + `rotate` + `sha256_hex`。
4. `server/src/handler/auth.rs`:`login_attempt_inner`(建 chain head)、`refresh_token`(走 rotate)。
5. `server/Cargo.toml`:加 `sha2`(uuid 已在)。

## 跑起來驗(dev stack)
```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
dcargo build -p server -p migration -p entity
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api   # migrate 自動套 026
```
驗收命令見 [contracts/verification-commands.md](contracts/verification-commands.md)(§1 單測 → §2 live-DB → §3 curl/psql → §4 守恆/可逆 → §5 CDP)。

## TDD 起手
先 §1-U1 `decide_rotation` 純函式 red→green(狀態機是唯一純邏輯);其餘輪替/偵測/grace 由 §2 live-DB + §3 curl 覆蓋。

## 收尾
`superpowers:finishing-a-development-branch` → 兩段式 commit(rust-api worktree push fork `rev2-admin-rust-api` + 外層 SHA pin)→ `git merge --no-ff` 回 `rev2-admin-root`、保留 027 branch。base-web **不動**。
