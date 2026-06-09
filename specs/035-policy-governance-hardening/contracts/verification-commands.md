# Contracts: Verification Commands（C-V acceptance）

> **無 wire / 端點契約變更**(R4)→ 本目錄**無 `endpoints.md`**;`restorePolicy` / `getArchivedPolicies` / 三 auth-modal 的 request·response·錯誤碼逐字不變,只改 restore 審計的**內部** `payload_after`(011 稽核欄、非對外 wire)+ no-op reload 跳過(內部效率、行為不變)。
>
> C-V 契約 = 純函式單測 + live-DB `#[ignore]` + psql 守恆。**跑活體前**:`dcargo build`(dev docker image)+ `docker compose ... restart rust-api`(cargo-watch /mnt/d 不可靠、MEMORY);PUBLISH 測試污染 running watcher → 先 restart/re-sync(MEMORY)。**無新 workspace crate**(改既有 `server` crate)→ prod image build 非強制,仍列一條 sanity(§0)。

## §0 build / lint 守恆（每 US 後跑）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev2
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
dcargo build -p server                          # 綠
dcargo test -p server                           # 純測全綠(+ 新 PolicyMutated 真值表 + restore payload 測;0 failed)
dcargo test -p server --test entity_access_lint # 17 不變(無新 entity 存取)
dcargo test -p server --test endpoint_coverage_lint # 5 @ EXPECTED_ROUTE_COUNT=35 不變(無端點變更)
# prod runtime image build sanity(無新 crate、僅驗 Dockerfile COPY 不破)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
```

## §1 US1 — restore 審計豐富化

**純函式單測**:`Restored { v0, v1, v2 }` → 審計 `payload_after` 構造 == `{ "role": v0, "target": v1, "dimension": dimension_from_v2(v2) }`(三維度各一例:menu/button/GET·POST·DELETE);`dimension_from_v2` 既有測試不退。

**live-DB `#[ignore]`**(對 dev postgres、沿 034 `sys_casbin_rule::live_tests` 隔離範式:fake role、clean 前後、不 publish):
```
- 造一筆 archive(grant fake → revoke)→ restorePolicy(該 archive_id)→ 查 sys_operation_log 最新 operation='RESTORE' entity_table='casbin_rule' 列
  → payload_after == {"role":<fake role>, "target":<obj>, "dimension":<v2 推>}(非 {"archive_id":..})
- archive 列在還原同 txn 已刪 → 上述 payload 仍完整(不依賴已刪列)
```

**psql 守恆**:restore 後 casbin_rule live 集 == 預期;archive 列消費。

## §2 US2 — no-op reload 跳過（明確型）

**純函式單測**:`PolicyMutated::mutated()` 真值表 —
```
SetRoleOutcome::Applied(_)  → true   | SetRoleOutcome::Rejected      → false
RestoreOutcome::Restored{..}→ true   | RestoreOutcome::NoOp / NotFound → false
bool true                   → true   | bool false                   → false
```

**live-DB `#[ignore]` / 行為不變佐證**(reload 沒呼叫無 spy → 以「行為+狀態不變」間接守):
```
- revoke protected policy → set_role_dimension 回 Rejected → 回應與 034 逐字相同(2222)、casbin_rule 不變、無 archive 新列
- restore 撞 live 同列 → RestoreOutcome::NoOp → 回應 0000 no-op、列不變
- restore 不存在 archive_id → NotFound → 2222「归档记录不存在」(不變)
- batch_delete_menus 全 id 不存在 → 整批 any_mutated=false → 回應 ok、無實際刪除
- 對照組:確有變更(set_role_dimension Applied 改集 / restore Restored / menu 軟刪有 policy)→ enforcer reload 後 enforce 反映(無 stale)
```
> reload-skip 主要由 §2 純函式真值表 + `mutate_and_reload` conditional code review 守(R5 誠實註)。

## §3 不變式守恆（feature 收尾整體）

```
- 讀決策零變:013/014 enforce acceptance(Super/Admin/User 選單可見 + endpoint allow/deny)逐項相同(FR-014/SC-003)
- server 既有測試數不退(+ 新純測 + 新 #[ignore]);entity_access_lint 17 / endpoint_coverage_lint 35
- restorePolicy / getArchivedPolicies / 三 auth-modal wire 逐字不變(R4;curl 抽驗 request/response/錯誤碼)
- base-web 零改(typecheck N/A、無 service/型/view 觸及)
```
