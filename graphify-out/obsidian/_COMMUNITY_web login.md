---
type: community
cohesion: 0.29
members: 7
---

# web: login

**Cohesion:** 0.29 - loosely connected
**Members:** 7 nodes

## Members
- [[BindWechat]] - code - base-web/src/views/_builtin/login/modules/bind-wechat.vue
- [[CodeLogin]] - code - base-web/src/views/_builtin/login/modules/code-login.vue
- [[PwdLogin]] - code - base-web/src/views/_builtin/login/modules/pwd-login.vue
- [[Register]] - code - base-web/src/views/_builtin/login/modules/register.vue
- [[ResetPwd]] - code - base-web/src/views/_builtin/login/modules/reset-pwd.vue
- [[_builtinlogin index.vue]] - code - base-web/src/views/_builtin/login/index.vue
- [[seed account quick-login]] - concept - base-web/src/views/_builtin/login/modules/pwd-login.vue

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/web_login
SORT file.name ASC
```
