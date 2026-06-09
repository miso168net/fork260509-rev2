---
type: community
cohesion: 0.15
members: 14
---

# web: wire

**Cohesion:** 0.15 - loosely connected
**Members:** 14 nodes

## Members
- [[ButtonAuthModal]] - code - base-web/src/views/manage/role/modules/button-auth-modal.vue
- [[EndpointAuthModal]] - code - base-web/src/views/manage/role/modules/endpoint-auth-modal.vue
- [[MenuAuthModal]] - code - base-web/src/views/manage/role/modules/menu-auth-modal.vue
- [[RoleOperateDrawer]] - code - base-web/src/views/manage/role/modules/role-operate-drawer.vue
- [[RoleSearch]] - code - base-web/src/views/manage/role/modules/role-search.vue
- [[SystemSettingsView]] - code - base-web/src/views/manage/system-settings/index.vue
- [[UserManageView]] - code - base-web/src/views/manage/user/index.vue
- [[UserOperateDrawer]] - code - base-web/src/views/manage/user/modules/user-operate-drawer.vue
- [[UserSearch]] - code - base-web/src/views/manage/user/modules/user-search.vue
- [[UserSessionPolicyModal]] - code - base-web/src/views/manage/user/modules/user-session-policy-modal.vue
- [[decodeKey]] - code - base-web/src/views/manage/role/modules/endpoint-auth-modal.vue
- [[encodeKey]] - code - base-web/src/views/manage/role/modules/endpoint-auth-modal.vue
- [[roleendpoint permission wire (R_SUPER read-only)]] - rationale - base-web/src/views/manage/role/modules/endpoint-auth-modal.vue
- [[session policy wire (system default + per-user)]] - rationale - base-web/src/views/manage/system-settings/index.vue

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/web_wire
SORT file.name ASC
```
