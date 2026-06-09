---
type: "query"
date: "2026-06-09T16:49:24.759846+00:00"
question: "Casbin enforce 在 rev2 rust-api 的實際解析:enforcer 建構/adapter/model + enforce_mw + menu/button 可見性 + policy 變更 reload?"
contributor: "graphify"
source_nodes: ["build_enforcer", "enforce_mw", "menu_visible", "buttons_for_roles_via_casbin", "set_role_dimension", "mutate_and_reload", "policy_watcher", "roles_for_user"]
---

# Q: Casbin enforce 在 rev2 rust-api 的實際解析:enforcer 建構/adapter/model + enforce_mw + menu/button 可見性 + policy 變更 reload?

## Answer

VERIFIED against source. (1) build_enforcer auth/enforce.rs:47 = DefaultModel::from_str(inline MODEL const) + SeaOrmAdapter -> Enforcer::new; stored AppState Arc<RwLock<casbin::Enforcer>> state.rs:28. MODEL: r/p=sub,obj,act, g=_,_ DECLARED-BUT-UNUSED (role code IS subject, no hierarchy), allow-override, EXACT-equality matcher. DB table is casbin_rule (NOT sys_casbin_rule); two entities map it: adapter-private (id,ptype,v0..v5) for stock load_policy, governance entity entity/src/sys_casbin_rule.rs (+protected/created_at/created_by, 034) for facade. (2) enforce_mw enforce.rs:60 per-route route_layer on /systemManage/*: subject=DB-FRESH role codes via roles_for_user (NOT JWT claims.roles, vestigial 018B), object=literal URI path, action=HTTP method; enforce((role,path,method)) per role allow-override fail-closed enforce.rs:104. Deny: 3333 no/bad token (HTTP200), 7777 superseded session (HTTP200), 5003+HTTP403 all-roles-denied or role-DB-fail. (3) menu: menu_visible route/menu.rs:336 = enforce((role,name,'menu')) USES enforce, filter_routes prunes tree. button: buttons_for_roles_via_casbin button_auth.rs:50 does NOT enforce — get_filtered_policy(0,[role,'','button']) reads loaded policy v0==role&&v2=='button'. mutation: updateRoleMenu system_manage.rs:766 -> policy_governance::mutate_and_reload -> sys_casbin_rule::set_role_dimension sys_casbin_rule.rs:387 DB-FIRST (NOT enforcer add/remove_policies — replaced 034: diff casbin_rule, protected-removal=>Rejected, else revoke(archive+DELETE)+grant(INSERT) in txn). reload: mutate_and_reload policy_governance.rs:81 commits txn then if result.mutated() (PolicyMutated 034 no-op skip) reload_and_publish = enforcer WRITE-lock load_policy() + PUBLISH casbin:policy:invalidate; spawn_policy_watcher policy_watcher.rs:67 subscribes -> same Arc<RwLock> write-lock load_policy() on other instances.

## Source Nodes

- build_enforcer
- enforce_mw
- menu_visible
- buttons_for_roles_via_casbin
- set_role_dimension
- mutate_and_reload
- policy_watcher
- roles_for_user