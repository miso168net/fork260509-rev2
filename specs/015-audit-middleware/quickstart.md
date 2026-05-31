# Quickstart: 015-audit-middleware

**Branch**: `015-audit-middleware` | 純後端 feature(無前端、無 CDP)。host 無 cargo → 一律 dev docker 編譯(memory `project_rustapi_build_test_env`)。

## 它做什麼(一句話)
全域 request-context middleware 擷取每筆請求的 `client_ip`/`x_forwarded_for`/`region`(xdb)/`trace_id`/`operator_id`,對**已認證**請求寫 `sys_access_log`;`login` handler 對每次登入嘗試(成敗)寫 `sys_login_attempt`。兩表 **append-only**。

## 依賴新增(plan 階段 pin 版本、驗 Rust 1.86)
- `server/Cargo.toml`:`uuid = { version="1", features=["v4"] }`、`xdb = { path="../xdb" }`
- workspace `Cargo.toml` sea-orm features 加 `with-ipnetwork`;加 `ipnetwork` crate(供 entity `client_ip: IpNetwork`)
- compose(dev+prod):`XDB_FILEPATH` env 指 `ip2region.xdb`;**prod Dockerfile runtime stage COPY** `xdb/resources/ip2region.xdb`

## 實作順序(TDD,沿設計鏈 tasks.md 細分)
1. **migration 011/012** 兩 append-only 表(`.custom(Alias::new("INET"))` for client_ip;login_attempt 兩 index)→ `mod`+`migrations()`。
2. **entity** `sys_access_log` / `sys_login_attempt`(沿 `sys_operation_log` 範本:auto-inc id、created_at default-now、無 deleted_at、不 SoftDeletable、空 Relation;`client_ip: IpNetwork`)。
3. **facade**(`facade/sys_access_log.rs`/`sys_login_attempt.rs`):private `*_active_model` + thin `write` + **SQL-build 純單測**(test-first;IpNetwork 真值綁 inet)。
4. **xdb region 薄封裝**:`search_by_ip(client_ip)`→raw 字串(Err→None)+ 純單測;boot `searcher_init(Some(XDB_FILEPATH))`。
5. **request-context middleware**(`server/src/` 新模組):擷取脈絡 → request extension;global `.layer()`。`main.rs` 改 `into_make_service_with_connect_info::<SocketAddr>()`。
6. **access-log 寫入**:ctx_mw `after next` 讀 final status,`operator_id.is_some()` → best-effort `write`。
7. **login handler 改**:讀 extension → 成敗各寫 `sys_login_attempt`。
8. **Dockerfile + compose**:runtime COPY `ip2region.xdb` + `XDB_FILEPATH` env。

## 跑起來 + 驗(細節見 [contracts/verification-commands.md](contracts/verification-commands.md))
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait   # migrate 自動套 011/012
TOKEN=$(curl -s http://127.0.0.1:21081/auth/login -H 'Content-Type: application/json' \
  -d '{"userName":"Super","password":"123456"}' | jq -r '.data.token')
curl -s http://127.0.0.1:21081/auth/getUserInfo -H "Authorization: Bearer $TOKEN" >/dev/null
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "SELECT operator_id,path,http_status,client_ip,region FROM sys_access_log ORDER BY id DESC LIMIT 1;"
```

## 守的紀律
- **007 FR-009**:migration 經 010 自動套、server 不自動 migrate。
- **008**:handler 仍回 `Res<T>`;middleware 旁路寫 log、不改信封。
- **009 entity-access lint**:新 facade 在 `src/model/facade/`;middleware/login handler **不**碰 `entity::`(經 facade)。
- **011**:facade 為唯一 entity 寫入管道;append-only 表沿 `sys_operation_log` 範本。
- **§I.6**:兩 append-only 表走例外(`created_at`+`operator_id`、無 `updated_*`/`deleted_*`)。
- **best-effort**:稽核寫失敗只 `warn!`、不破業務(FR-003)。
- **prod build acceptance 必跑**(新 dep + xdb COPY,dev bind-mount 會遮缺口)。
