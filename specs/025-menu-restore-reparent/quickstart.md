# Quickstart: menu-restore-reparent (025)

> dev 跑通 + 驗收最短路徑。完整 acceptance 見 [contracts/verification-commands.md](contracts/verification-commands.md)。

## 1. 前置(dev stack)

```bash
cd <workspace-root>
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# rust 改後(2 handler/route + MenuUpdateReq/UpdateMenuData + would_create_cycle + D1 count 30):
dcargo build -p server && docker compose -f docker-compose.yml -f docker-compose.dev.yml restart rust-api
# 套 migration 025(2 endpoint policy):
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate up
# base-web 改後(parentId NTreeSelect + 已刪 toggle + 2 wrapper fn):
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart base-web
```

`dcargo`(host 無 cargo,throwaway dev 容器):
```bash
dcargo(){ find "$PWD/rust-api/server/src" "$PWD/rust-api/entity/src" "$PWD/rust-api/migration/src" -name '*.rs' -exec touch {} +; \
 docker run --rm -v "$PWD/rust-api":/app -v rev2-admin_rust_api_cargo_cache:/usr/local/cargo \
 -v rev2-admin_rust_api_target:/app/target -w /app --entrypoint cargo rev2-admin-rust-api:dev "$@"; }
```

## 2. 核心驗(60 秒)

```bash
H=http://127.0.0.1:21081; J='Content-Type: application/json'
SUPER=$(curl -s $H/auth/login -H "$J" -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
# D1 lint(30 三方一致)
dcargo test -p server --test endpoint_coverage_lint
# 純單測(cycle + immutability 重寫)
dcargo test -p server would_create_cycle
dcargo test -p server update_menu_query_sets
# restore round-trip(建→刪→getDeletedMenus→restore→audit)見 contracts §1
```

## 3. 實作順序(MVP=US1 restore)

1. **Foundational**:facade(find_deleted/list_deleted_paginated/find_deleted_by_id/restore/restore_query)+ would_create_cycle 純函式(TDD)+ UpdateMenuData/update_menu_query parent_id + 重寫 immutability 單測。
2. **endpoint 3-way**:main.rs +2 route / ENDPOINT_REGISTRY +2 / migration 025 / count 28→30(D1 lint 綠 = gate)。
3. **US1 restore**:get_deleted_menus + restore_menu handler(guards ①②③)。
4. **US2 re-parent**:MenuUpdateReq parent_id + update_menu re-parent guards(a)(b)(c)。
5. **base-web**(★ 須 v1.5.0 (d) amendment 親決後):index.vue 已刪 toggle + restore 鈕 / menu-operate-modal parentId NTreeSelect(種子 disabled)/ rev2-system-manage +2 fn。
6. **US3 + Polish**:holistic C-V + CDP + 回歸 019/020/021 + 收尾。

## 4. 關鍵 gotcha(grounding)
- restore 載入用 **find_deleted_by_id**(find_active_by_id 找不到已刪)。
- `AuditOperation::Restore` 已存在(audit.rs 零改)。
- re-parent **須加** MenuUpdateReq.parent_id(de_parent_id);**brainstorm「已 absorb」是錯的**(只 MenuCreateReq 接)。
- D1 lint **3 處** count 28→30(lint.rs:602 + endpoint_auth.rs:490 + doc-comment:61)。
- restore/re-parent **零 casbin 觸碰**;restore 後舊可見性自動套回(route_name 不變)。
- migration `down` by-v1 精準(不裸 v2)。
