# Contract: Verification commands（C-V acceptance）

**Type**: Shell command sequence;對應 spec User Stories + SCs。

> **§0 — CLAUDE.md §3 紀律**:本 feature 有**可單測純邏輯單元**（信封序列化 + BizCode 映射 + AppError→信封 映射）→ **test-first**。404 fallback 為 wiring → 由 live curl acceptance 覆蓋。`tasks.md`/`plan.md` 明示「信封/code/error 單測 + 404 live acceptance」。
> 無 host cargo → 經 dev image:`docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo ...`。

---

## §1 build + 信封/code/error 單元測試（US1 + US3 / SC-002·SC-003·SC-004）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --entrypoint "" rust-api cargo test -p server envelope error
# 預期 PASS:
#  - Res::ok 序列化 = {"data":..,"code":"0000","msg":..}:欄位順序 data→code→msg、code 為 JSON string、無 "success" key
#  - 空集合 data = []（Res::ok(Vec::<i32>::new()) → "data":[]）
#  - BizCode 全 variant code() 對應正確字串（table-driven 全矩陣）
#  - AppError::NotFound → 404 + {data:null,code:"4040",msg:"接口不存在"}
#  - AppError::Internal(..) → 500 + code "5000"
```

---

## §2 404 fallback live acceptance（US2 / SC-001 + SC-005）

```bash
# dev stack 起（rust-api healthy）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait ; echo "up exit: $?"

# 打不存在 path → HTTP 404 + 標準信封
curl -i -s http://127.0.0.1:21081/nonexistent
# 預期: HTTP/1.1 404 Not Found + body {"data":null,"code":"4040","msg":"接口不存在"}
curl -s http://127.0.0.1:21081/nonexistent | python3 -c "import sys,json;d=json.load(sys.stdin);assert d=={'data':None,'code':'4040','msg':'接口不存在'},d;print('404 envelope OK')"

# /health 仍純 text ok（不被信封包裝）
curl -fsS http://127.0.0.1:21081/health ; echo
# 預期: ok
```

---

## §3 envelope 不漏 pattern（DESIGN §9.3,前瞻)

```bash
# 本 feature 尚無業務 handler;確認未引入繞過信封的 Json<T>(僅 Json<Res<..>> 或 fallback 允許)
grep -rnE 'Json<' rust-api/server/src/ | grep -v 'Json<Res' || echo "(無繞過信封的 Json<T>)"
# 預期: 無（或僅 envelope.rs/error.rs 內 Json(self) 包 Res 的合法用法）
```

---

## 驗收紀律總結

- §1 信封/code/error 單測（US1+US3;SC-002/003/004）— test-first
- §2 404 live curl + /health 不變（US2;SC-001/005）
- §3 envelope 不漏前瞻 grep（DESIGN §9.3,本 feature 立 pattern）
