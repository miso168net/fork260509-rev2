# Contract: Verification commands(C-V acceptance)

**Type**: Shell command sequence;對應 brainstorm 001 §7 6 段驗收清單。

> **CLAUDE.md §3 紀律提醒**:本 feature 屬「wiring / 形狀對映 + 基建類」,無新純函式邏輯(secret loader 例外、已列 unit test in [secret-loader.md](./secret-loader.md))。整體 feature 由本 C-V contract 覆蓋驗收;`tasks.md` 與 `plan.md` 須明示「無單元測試以外的 component-level 測試,由 acceptance commands 覆蓋」及理由。

---

## §1 Build 驗收(對應 spec SC-001 + SC-004)

```bash
# 從 workspace root
DOCKER_BUILDKIT=1 docker compose -f docker-compose.rust-api.yml --profile prod build
```

**預期**:
- 三 stage(builder / dev / runtime)build 成功、無 error
- builder stage `cargo build --release --bins` 三 binary 全產出
- 完整時間 < 15 分鐘(首次)

```bash
docker run --rm --entrypoint=ls rev2-admin-rust-api:latest /usr/local/bin/
```

**預期輸出含**:`server  migration  cleanup-job  entrypoint.sh`

```bash
docker image inspect rev2-admin-rust-api:latest --format='{{.Size}}' | numfmt --to=iec
```

**預期**:< 200 MB(對應 SC-004)

---

## §2 Dev 熱重載驗收(對應 spec SC-002)

**Terminal A** — 啟 dev compose:
```bash
docker compose -f docker-compose.rust-api.yml --profile dev up
```

**Terminal B** — initial health check:
```bash
curl -fsS http://127.0.0.1:21081/health
# 預期: ok
```

**Terminal C** — 改 source:
```bash
# 改 rust-api/server/src/main.rs 內 health() 函式回 "ok-v2"
sed -i 's/"ok"/"ok-v2"/' rust-api/server/src/main.rs
```

**Terminal B(60 秒後)**:
```bash
curl -fsS http://127.0.0.1:21081/health
# 預期: ok-v2
```

**還原**:
```bash
sed -i 's/"ok-v2"/"ok"/' rust-api/server/src/main.rs
```

---

## §3 Strict validation panic 驗收(對應 spec SC-003 + User Story 3 全 acceptance)

### §3.1 黑名單值 panic

```bash
APP_JWT_JWT_SECRET="change-me" docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:server boot panic,log 含字串 `APP_JWT_JWT_SECRET is a placeholder value`(5 秒內)

### §3.2 長度 < 32 panic

```bash
APP_JWT_JWT_SECRET="too_short" docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:boot panic,log 含 `APP_JWT_JWT_SECRET length 9 < 32`

### §3.3 不設 panic

```bash
unset APP_JWT_JWT_SECRET APP_JWT_JWT_SECRET_FILE
docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:boot panic,log 含 `neither APP_JWT_JWT_SECRET nor APP_JWT_JWT_SECRET_FILE set`

### §3.4 `_FILE` precedence

```bash
# 同時設 envvar(黑名單)+ _FILE(合法值)→ _FILE 優先,boot 成功
echo "valid_secret_loaded_from_file_xxxxxxxxxxxx" > /tmp/jwt.txt
APP_JWT_JWT_SECRET="change-me" \
APP_JWT_JWT_SECRET_FILE="/tmp/jwt.txt" \
docker compose -f docker-compose.rust-api.yml --profile dev up
```

**預期**:boot 成功(`_FILE` 優先讀檔、envvar 被無視)+ `/health` 回 `ok`

---

## §4 Migration / cleanup-job stub 驗收(對應 spec SC-005)

```bash
docker run --rm rev2-admin-rust-api:latest migration
# 預期 stdout: migration stub — will be implemented in Phase 2 migration feature
# 預期 exit: 0

docker run --rm rev2-admin-rust-api:latest cleanup-job
# 預期 stdout: cleanup-job stub — will be implemented in Phase 5 cleanup-job feature
# 預期 exit: 0

# 未知 command
docker run --rm rev2-admin-rust-api:latest unknown
# 預期 stderr: usage: entrypoint.sh {server|migration|cleanup-job}
# 預期 exit: 64
```

---

## §5 Phase 0 baseline DESIGN §4.6 驗收(對應 spec SC-006)

```bash
grep -rn "<TO_BE_SET>" rust-api/
# 預期: 空輸出(application.yaml 不含 placeholder,secret 走 envvar/_FILE)

ls migration/src/m*.rs 2>/dev/null | sort
# 預期: 本 feature 階段空輸出(migration 是 stub bin、無 entity migration);Phase 2 migration feature 落實後才有 m_<timestamp>_*.rs
```

---

## §6 Unit test 驗收(對應 [secret-loader.md](./secret-loader.md))

```bash
cd rust-api
cargo test --bin server -- config::tests
```

**預期**:8 條 unit test 全 PASS:
- `load_secret_panics_when_neither_set`
- `load_secret_reads_from_file_when_FILE_set`
- `load_secret_falls_back_to_envvar_when_FILE_not_set`
- `load_secret_FILE_takes_precedence_over_envvar`
- `validate_secret_rejects_empty`
- `validate_secret_rejects_placeholders`
- `validate_secret_rejects_short`
- `validate_secret_accepts_32_or_longer_non_blacklist`

---

## §7 Constitution v1.0.0 Compliance 自我覆查

```bash
# 1. 不繼承 rev1 source — diff 跟 fork260509-rev2-anew-rust-api main 應該只看到我們的新增,沒含 rev1 路徑的引用
cd rust-api
git log main..HEAD --stat                    # 看 commit 範圍
grep -rn "rev1\|fork260509-soybean-admin-rust" server/ migration/ cleanup-job/ 2>/dev/null
# 預期: 空(本 feature 不參考 rev1 source)

# 2. 不動 base-web
git -C ../base-web diff
# 預期: 無 diff(base-web 完全不動)

# 3. application.yaml 無 secret
grep -E "secret|password|token" rust-api/application.yaml
# 預期: 空(yaml 不含 secret-related key/value)
```

---

## 驗收紀律總結

- §1-§5 為 user-facing acceptance(operator 跑命令、看結果)
- §6 為 implementation-level unit test(TDD red→green 對 secret loader)
- §7 為 Constitution Compliance 自我覆查(plan.md Constitution Re-Check 對應)

`tasks.md` 階段需把以上 §1-§7 排程進 task 內、對應到 spec 各 acceptance scenario 與 SC。
