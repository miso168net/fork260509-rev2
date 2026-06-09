# Contracts: Verification Commands(C-V acceptance)

> C-V 契約 = 純函式單測 + live-DB `#[ignore]` 整合測 + curl/CDP/psql 活體。**跑活體前**:`dcargo build`(dev docker image build)+ `docker compose ... restart rust-api`(cargo-watch 在 /mnt/d 不可靠、MEMORY)+ 注意 PUBLISH 測試污染 running watcher(先 restart/re-sync、MEMORY)。
>
> **無新 workspace crate**(entity 進既有 `entity` crate、facade 進既有 `server` crate)→ 不觸發「加 crate 須 prod image build」硬守則;仍含一條 prod runtime image build sanity(下 §0)。

## §0 build / lint 守恆(每 US 後跑)

```bash
# dev build
dcargo build                                  # = docker compose run rust-api cargo build(快取卷)
# 守恆 lint(必綠)
dcargo test --test entity_access_lint         # 009:治理 entity 只在 facade(R11)
dcargo test --test endpoint_coverage_lint      # 33→35:registry/main.rs/seed 三源一致(US5 後)
dcargo test endpoint_registry_is_well_formed  # in-module:len==35 + method∈CLOSED + path 唯一
# prod runtime image build sanity(無新 crate、但驗 Dockerfile COPY 不破)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build rust-api
```

## §1 US1 — 原子 facade(grant/revoke/restore + audit)

**純函式單測**:`set_role_dimension` diff(current-live vs desired → add/remove)/ dimension→(ptype,v0,v1,v2) 對映 / restore 撞 live → NoOp 判定。

**live-DB `#[ignore]` 整合測**(對 dev postgres):
```
- grant 一條 → casbin_rule 多一 live 列 + 恰一筆 Insert audit(entity_table=casbin_rule)
- revoke → casbin_rule 該列消失 + archive 多一列(reason/archived_by 正確)+ 一筆 SoftDelete audit;commit 後 enforcer.load_policy → enforce 拒
- 注入 audit 寫入失敗 → casbin_rule 與 archive 一併 rollback(both-or-neither、沿 011 範式)
- restore → archive 列消失 + casbin_rule 回來 + Restore audit;enforce 允
- restore 撞 live 同列 → Ok(no-op)、不產生重複(7-col unique)
```

**psql 守恆**:`select count(*) from casbin_rule` live 集 == enforcer policy 數;`archive == 已撤未還原集`。

## §2 US2 — protected(seed 固定、4 guard 退役、修 D13)

```
- m033/m034 套用後:psql 查 protected=true 列 = §4 預期集(casbin 治理列 + sys_menu 7 列)
- revoke 一條 protected policy → facade 回 Rejected、handler 2222、列不動
- set_role_dimension(menu) 省略 (R_SUPER,manage_role,menu) → 整筆拒 2222(修 D13:今天 menu_set_locks_out_super 不擋此列)
- delete/disable/re-parent/batch-delete 一個 protected sys_menu → 2222(4 個 caller 全擋:1207/1213/1642/1767)
- 執行期無 un-protect 路徑(grep handler 無 set protected 端點)
```

## §3 US3 — 收斂三胞胎(wire 零改 regression)

```
- 既有 021/022/023 curl acceptance 全綠(getRoleMenu Vec<i64> / getRoleButton 字典序 / getRoleEndpoints (path,method) 序 + R_SUPER 短路回 registry / updateRoleEndpoints R_SUPER 拒編 2222)
- 三 modal 的 CDP smoke(Super 開 role drawer → menu/button/endpoint auth-modal 預勾正確、提交 200)續綠
- psql:每維 set 後 casbin_rule 該維列 == 提交集;空集 → 清光合法
- 一筆 Update audit(entity_table=casbin_rule、before/after 快照)
```

## §4 US4 — menu↔policy 同步(DRIFT-2/3/4)

```
- 軟刪一個有可見性 policy 的 menu → 同 txn:sys_menu.deleted_at set + 該 route_name 跨 role 的 menu-policy 進 archive(reason=menu_soft_delete) + enforce 拒可見;psql 確認無孤兒 (role,route_name,menu) live 列
- 還原該 menu → archived menu-policy 回 casbin_rule + enforce 允可見
- DRIFT-3:軟刪 foo → 以同名 route 建新 foo → 新 foo 對所有 role 不可見(getUserRoutes 不含)、psql 無 (role,foo,menu) live 列
- batch_delete_menus 多筆 → 逐 menu both-or-neither(任一筆失敗不影響他筆已 commit)
- menu_soft_delete archive 列不出現在 getArchivedPolicies(list 過濾)
```

## §5 US5 — 回收桶 UI + 端點 + D10

**curl**:
```
- GET /systemManage/getArchivedPolicies(Super token)→ Res<ArchivedPolicy[]>、排除 menu_soft_delete、欄齊
- POST /systemManage/restorePolicy {archiveId} → 0000;不存在 archiveId → 2222「归档记录不存在」;撞 live → 0000 no-op
- 非 Super → 5003
```
**CDP browser smoke**(base-web,沿 022 harness 範式):
```
- Super 登入 → 側欄見「回收桶」(manage_policy-archive,§I.2 menu policy seed)→ 開頁列出 archived → 點還原 → 列消失 + 對應權限重新生效
- User 登入 → 側欄無此頁(menu deny)、直打端點 5003
- D10:menu 管理頁 edit 一個種子選單 → parentId selector 鎖定(讀 row.protected、非硬寫名單)
```
> **CDP defer 風險**:若 US5 CDP smoke 暫 defer,須在 spec/follow-up 明示「curl 直送 ≠ base-web modal 對齊」風險並登記補測(CLAUDE.md §3)。

## §6 不變式守恆(feature 收尾整體)

```
- 讀決策零變:013/014 enforce acceptance(Super/Admin/User 選單可見 + endpoint allow/deny)逐項相同
- casbin seed baseline:m031-m034 後 live policy 集與既有 enforce 結果一致(僅多治理欄、policy 列數不因 schema 變)
- entity_access_lint + endpoint_coverage_lint 綠
- server 既有測試數不退(+ 新單測 + 新 #[ignore] 整合測)
```
