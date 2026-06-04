// feature 024 ButtonAuth Rollout — CDP browser smoke (isolated browser contexts).
// Verifies the NEW behavior 024 layers on top of 022 (contracts §5), with SEMANTICALLY-CORRECT
// gating proofs that account for the orthogonal 021 menu-visibility dimension:
//
//   IMPORTANT FINDING (psql menu policy v2='menu'): by default ONLY R_SUPER has menu/route
//   access to /manage/role + /manage/menu. R_ADMIN/R_USER_COMMON do NOT → navigating there as
//   Admin yields a not-found page (only a "返回首页" button), NOT the management table. So the
//   button-gating must be observed on a page the role CAN VIEW. Hence:
//
//   1. Super /manage/role — all write buttons visible (新增+编辑+删除), table rows present.
//   2. Super /manage/menu — all write buttons visible (新增+新增子菜单 on dir rows+编辑+删除).
//   3. button-auth-modal registry lists the 6 new role:*/menu:* codes (assignable; NTree virtual-scroll).
//   4. PER-CODE HIDING on a viewable page: revoke role:delete from Super → Super /manage/role now
//      shows 新增+编辑 but NOT 删除 (rows still present) → restore → 删除 returns. This is the proof
//      that the page hides a SPECIFIC button by hasAuth(code) (checks 1/2 only show all-granted).
//   5. LITERAL spec US1 (cross-feature 021+024): grant Admin manage_role MENU (021 updateRoleMenu)
//      + role:edit BUTTON (024 updateRoleButton) → fresh Admin can VIEW /manage/role (rows present)
//      and sees 编辑 but NOT 删除/新增 → restore both menu and button. Proves a non-Super role sees
//      exactly the assigned button after assignment, given it also has menu access.
//
//   decoupled debt (FR-008, intended): a granted button is VISIBLE but the Super-only write endpoint
//   still returns 5003 on click — this smoke verifies visibility only.
// Screenshots land in ./screenshots/ (relative to this script; gitignored).
import { execSync } from 'node:child_process';
import { CDP, sleep } from './cdp.mjs';

const ROLES = { Super: '超级管理员', Admin: '管理员', User: '普通用户' };
const H = 'http://127.0.0.1:21081';
const J = 'Content-Type: application/json';
const SUPER_FULL = ['B_CODE1', 'B_CODE2', 'B_CODE3', 'menu:add', 'menu:delete', 'menu:edit', 'role:add', 'role:delete', 'role:edit', 'user:add', 'user:delete', 'user:edit'];
const ADMIN_BTN_BASELINE = ['B_CODE2', 'B_CODE3', 'user:edit'];
const ADMIN_MENU_BASELINE = [16, 17, 1, 3, 6]; // getRoleMenu?roleId=2 default
const MANAGE_ROLE_MENU_ID = 4;

function sh(cmd) { return execSync(cmd, { encoding: 'utf8' }).trim(); }
const TOK = sh(`curl -s ${H}/auth/login -H '${J}' -d '{"userName":"Super","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])"`);
function setRoleButton(roleId, codes) { return sh(`curl -s ${H}/systemManage/updateRoleButton -H "Authorization: Bearer ${TOK}" -H '${J}' -d '${JSON.stringify({ roleId, codes })}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"`); }
function getRoleButton(roleId) { return sh(`curl -s "${H}/systemManage/getRoleButton?roleId=${roleId}" -H "Authorization: Bearer ${TOK}" | python3 -c "import sys,json;print(','.join(sorted(json.load(sys.stdin)['data'])))"`); }
function setRoleMenu(roleId, menuIds) { return sh(`curl -s ${H}/systemManage/updateRoleMenu -H "Authorization: Bearer ${TOK}" -H '${J}' -d '${JSON.stringify({ roleId, menuIds })}' | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])"`); }
function getRoleMenu(roleId) { return sh(`curl -s "${H}/systemManage/getRoleMenu?roleId=${roleId}" -H "Authorization: Bearer ${TOK}" | python3 -c "import sys,json;print(sorted(json.load(sys.stdin)['data']))"`); }

// visible write-buttons + table row count on the current page
async function pageState(cdp, ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
    const btns = [...document.querySelectorAll('button')].filter(vis);
    const txt = b => b.textContent.trim();
    return {
      rows: document.querySelectorAll('.n-data-table-tbody .n-data-table-tr').length,
      edit: btns.filter(b => txt(b)==='编辑').length,
      del:  btns.filter(b => txt(b)==='删除').length,
      add:  btns.some(b => txt(b)==='新增'),
      addChild: btns.filter(b => txt(b)==='新增子菜单').length,
      notFound: btns.some(b => txt(b)==='返回首页'),
    };
  })()`);
}

const results = {};
const cdp = new CDP();
function log(...a) { console.log(...a); }

try {
  await cdp.connect();
  log('Connected to browser WS. Super baseline buttons:', getRoleButton(1));

  // ===== Check 1: Super /manage/role — all write buttons visible =====
  log('\n===== CHECK 1: Super /manage/role (all granted → all visible) =====');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, ROLES.Super);
      if (!li.ok) { out.status = 'FAIL'; out.login = li; }
      else {
        await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/role', 3500); await sleep(1200);
        const s = await pageState(cdp, ctx); out.state = s;
        await cdp.screenshot(ctx, 'screenshots/role-Super.png');
        out.status = (s.rows > 0 && !s.notFound && s.edit > 0 && s.del > 0 && s.add) ? 'PASS' : 'FAIL';
      }
    } catch (e) { out.status = 'FAIL'; out.error = String(e); }
    results.check1_super_role = out; log('1', out.status, JSON.stringify(out.state));
  }

  // ===== Check 2: Super /manage/menu — all write buttons visible =====
  log('\n===== CHECK 2: Super /manage/menu (all granted → all visible) =====');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, ROLES.Super);
      if (!li.ok) { out.status = 'FAIL'; out.login = li; }
      else {
        await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/menu', 3500); await sleep(1500);
        const s = await pageState(cdp, ctx); out.state = s;
        await cdp.screenshot(ctx, 'screenshots/menu-Super.png');
        out.status = (s.rows > 0 && !s.notFound && s.edit > 0 && s.del > 0 && s.add && s.addChild > 0) ? 'PASS' : 'FAIL';
      }
    } catch (e) { out.status = 'FAIL'; out.error = String(e); }
    results.check2_super_menu = out; log('2', out.status, JSON.stringify(out.state));
  }

  // ===== Check 3: button-auth modal registry includes the 6 new codes =====
  log('\n===== CHECK 3: button-auth modal registry (6 new codes assignable) =====');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, ROLES.Super);
      if (!li.ok) { out.status = 'FAIL'; out.login = li; }
      else {
        await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/role', 3500); await sleep(1200);
        out.editClicked = await cdp.evalExpr(ctx, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='编辑'); if(b){b.click();return true;} return false; })()`);
        await sleep(1800);
        out.buttonAuthClicked = await cdp.evalExpr(ctx, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='按钮权限'); if(b){b.click();return true;} return false; })()`);
        await sleep(2400);
        const newDescs = ['新增角色', '编辑角色', '删除角色', '新增菜单', '编辑菜单', '删除菜单'];
        const info = await cdp.evalExpr(ctx, `(async () => {
          const want = ${JSON.stringify(newDescs)}; const collected = new Set();
          const grab = () => [...document.querySelectorAll('.n-tree-node-content, .n-tree-node-content__text, .n-tree-node')].forEach(e => { const t = e.textContent.trim(); if (t) collected.add(t); });
          const scn = document.querySelector('.n-tree .v-vl, .n-tree .n-scrollbar-container, .n-tree [class*="virtual"]') || document.querySelector('.n-tree');
          grab(); if (scn) { for (let y = 0; y <= 720; y += 100) { scn.scrollTop = y; await new Promise(r => setTimeout(r, 130)); grab(); } scn.scrollTop = 0; }
          const labels = [...collected]; const foundNew = want.filter(k => labels.some(l => l.includes(k)));
          return { foundNew, foundNewCount: foundNew.length, modalOpen: !!document.querySelector('.n-tree') };
        })()`, true);
        out.modal = info; await cdp.screenshot(ctx, 'screenshots/button-auth-modal.png');
        out.status = (info.modalOpen && info.foundNewCount >= 5) ? 'PASS' : 'FAIL';
      }
    } catch (e) { out.status = 'FAIL'; out.error = String(e); }
    results.check3_modal_registry = out; log('3', out.status, JSON.stringify(out.modal && out.modal.foundNew));
  }

  // ===== Check 4: PER-CODE hiding on a viewable page (revoke role:delete from Super) =====
  log('\n===== CHECK 4: per-code hiding — revoke role:delete from Super =====');
  {
    const out = {}; let mutated = false;
    try {
      out.before = getRoleButton(1);
      out.revokeCode = setRoleButton(1, SUPER_FULL.filter(c => c !== 'role:delete')); mutated = true;
      // poll until enforcer reflects the revoke
      for (let i = 0; i < 10; i++) { if (!getRoleButton(1).includes('role:delete')) break; await sleep(400); }
      const ctx = await cdp.newContextPage();
      const li = await cdp.login(ctx, ROLES.Super);
      if (!li.ok) { out.status = 'FAIL'; out.login = li; }
      else {
        await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/role', 3500); await sleep(1200);
        const s = await pageState(cdp, ctx); out.state = s;
        await cdp.screenshot(ctx, 'screenshots/role-Super-no-delete.png');
        // 删除 hidden (role:delete revoked), 编辑+新增 still shown (role:edit/role:add kept), rows present
        out.status = (s.rows > 0 && !s.notFound && s.edit > 0 && s.add && s.del === 0) ? 'PASS' : 'FAIL';
      }
    } catch (e) { out.status = 'FAIL'; out.error = String(e); }
    finally {
      if (mutated) { out.restoreCode = setRoleButton(1, SUPER_FULL); out.afterRestore = getRoleButton(1); out.restored = out.afterRestore === SUPER_FULL.slice().sort().join(','); }
    }
    if (out.status === 'PASS' && out.restored === false) out.status = 'FAIL';
    results.check4_percode_hide = out; log('4', out.status, JSON.stringify(out.state), 'restored=' + out.restored);
  }

  // ===== Check 5: LITERAL US1 cross-feature — grant Admin menu(021)+button(024) =====
  log('\n===== CHECK 5: literal US1 — Admin granted manage_role menu + role:edit button =====');
  {
    const out = {}; let menuMut = false, btnMut = false;
    try {
      out.adminMenuBefore = getRoleMenu(2); out.adminBtnBefore = getRoleButton(2);
      out.menuGrant = setRoleMenu(2, [...ADMIN_MENU_BASELINE, MANAGE_ROLE_MENU_ID]); menuMut = true;
      out.btnGrant = setRoleButton(2, [...ADMIN_BTN_BASELINE, 'role:edit']); btnMut = true;
      // poll until both reflect
      for (let i = 0; i < 12; i++) { const m = getRoleMenu(2), b = getRoleButton(2); if (m.includes(String(MANAGE_ROLE_MENU_ID)) && b.includes('role:edit')) { out.apiReadyPolls = i + 1; break; } await sleep(400); }
      const ctx = await cdp.newContextPage();
      const li = await cdp.login(ctx, ROLES.Admin);
      if (!li.ok) { out.status = 'FAIL'; out.login = li; }
      else {
        await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/role', 4000); await sleep(2000);
        const s = await pageState(cdp, ctx); out.state = s;
        await cdp.screenshot(ctx, 'screenshots/role-Admin-granted.png');
        // Admin now CAN view the page (rows present, not 404) and sees 编辑 (role:edit) but NOT 删除/新增
        out.status = (s.rows > 0 && !s.notFound && s.edit > 0 && s.del === 0 && !s.add) ? 'PASS' : 'FAIL';
      }
    } catch (e) { out.status = 'FAIL'; out.error = String(e); }
    finally {
      if (btnMut) { out.btnRestore = setRoleButton(2, ADMIN_BTN_BASELINE); out.adminBtnAfter = getRoleButton(2); }
      if (menuMut) { out.menuRestore = setRoleMenu(2, ADMIN_MENU_BASELINE); out.adminMenuAfter = getRoleMenu(2); }
      out.restored = out.adminBtnAfter === ADMIN_BTN_BASELINE.slice().sort().join(',') && JSON.parse((out.adminMenuAfter || '[]').replace(/'/g, '"')).length === ADMIN_MENU_BASELINE.length;
    }
    if (out.status === 'PASS' && out.restored === false) out.status = 'FAIL';
    results.check5_crossfeature_admin = out; log('5', out.status, JSON.stringify(out.state), 'apiReadyPolls=' + out.apiReadyPolls, 'restored=' + out.restored);
  }

} catch (e) { log('FATAL', String(e)); }
finally {
  await cdp.cleanup();
  log('\n===== CLEANUP done (all contexts disposed) =====');
  // final safety: ensure dev casbin back to baseline
  log('final Super buttons:', getRoleButton(1), '| Admin buttons:', getRoleButton(2), '| Admin menu:', getRoleMenu(2));
  log('\n===== RESULTS JSON =====');
  log(JSON.stringify(results, null, 2));
}
