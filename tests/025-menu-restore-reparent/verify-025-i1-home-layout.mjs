// 025-I1 fix verification — non-mutating CDP proof (isolated browser context, never
// touches the user's tabs/DB). Confirms the parentId type-lie fix in
// base-web/src/views/manage/menu/modules/menu-operate-modal.vue (handleInitModel now
// normalizes model.parentId to number via Number(...)).
//
// The bug: wire parent_id is string "0"/"5"; pre-fix `model.parentId === 0` was always
// false for edit-loaded menus, so editing a TOP-LEVEL LEAF (e.g. seed `home`,
// component=layout.base$view.home) set effectiveLayout='' and stripped the layout prefix.
//
// This proof is purely observational (no submit, no DB write):
//   A) edit `home` (top-level leaf, parentId wire "0"): post-fix showLayout=(0===0)=true
//      → layout NSelect VISIBLE with value "base" + page "home". Pre-fix it was HIDDEN
//      and component would be rebuilt as bare `view.home`.
//   B) edit `manage_user` (NESTED leaf, parentId = manage id): showLayout=(2===0)=false
//      → layout NSelect HIDDEN. This is the CORRECT behavior for a nested leaf (no layout
//      prefix to preserve) — the negative control proving the gate now discriminates
//      top-level vs nested correctly.
//
// Run: node tests/025-menu-restore-reparent/verify-025-i1-home-layout.mjs
import { CDP, sleep } from './cdp.mjs';

const SUPER_LABEL = '超级管理员';
const MENU_URL = 'http://127.0.0.1:21080/manage/menu';
const cdp = new CDP();
const log = (...a) => console.log(...a);

// Find a table row whose text contains needle and click its 编辑 button.
async function openEdit(ctx, needle) {
  const r = await cdp.evalExpr(ctx, `(() => {
    const rows = [...document.querySelectorAll('.n-data-table-tbody .n-data-table-tr, tbody tr')];
    const row = rows.find(r => r.textContent.includes(${JSON.stringify(needle)}));
    if (!row) return { ok:false, reason:'row not found', rows: rows.map(r=>r.textContent.trim().slice(0,60)) };
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑');
    if (!btn) return { ok:false, reason:'edit btn not found', btns:[...row.querySelectorAll('button')].map(b=>b.textContent.trim()) };
    btn.click();
    return { ok:true };
  })()`);
  if (r.ok) await sleep(1600); // modal open + getMenuTree
  return r;
}

// Inspect the open menu-operate modal: is the layout NSelect form-item present? what are
// the layout/page select display values? plus parentId tree-select display text.
async function inspectModalLayout(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const modal = document.querySelector('.n-modal');
    if (!modal) return { hasModal:false };
    const labels = [...modal.querySelectorAll('.n-form-item-label')].map(e=>e.textContent.trim());
    const hasLayoutItem = labels.some(l => l === '布局' || l.toLowerCase() === 'layout');
    const hasPageItem = labels.some(l => l === '页面' || l.toLowerCase() === 'page');
    // collect each visible single-select's displayed value, keyed by its form-item label
    const sels = {};
    [...modal.querySelectorAll('.n-form-item')].forEach(fi => {
      const lab = (fi.querySelector('.n-form-item-label')||{}).textContent;
      const val = (fi.querySelector('.n-base-selection-label, .n-base-selection-input__content')||{}).textContent;
      if (lab) sels[lab.trim()] = val ? val.trim() : null;
    });
    const ts = modal.querySelector('.n-tree-select .n-base-selection');
    const parentSel = ts ? (ts.querySelector('.n-base-selection-label, .n-base-selection-placeholder')||{}).textContent : null;
    return { hasModal:true, hasLayoutItem, hasPageItem, selectValues: sels, parentSelText: parentSel ? parentSel.trim() : null, labels };
  })()`);
}

async function closeModal(ctx) {
  await cdp.evalExpr(ctx, `(() => {
    const modal = document.querySelector('.n-modal');
    const btn = modal && [...modal.querySelectorAll('button')].find(b => b.textContent.trim()==='取消');
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(600);
}

const out = { A_home: {}, B_manage_user: {} };
try {
  await cdp.connect();
  log('Connected to browser WS (9229).');
  const ctx = await cdp.newContextPage();

  const li = await cdp.login(ctx, SUPER_LABEL);
  log('login:', JSON.stringify(li));
  if (!li.ok) throw new Error('login failed');

  await cdp.navigate(ctx, MENU_URL, 3000);

  // ---- A) edit home (top-level leaf): layout selector must be VISIBLE post-fix ----
  const ea = await openEdit(ctx, 'home');
  log('open edit home:', JSON.stringify(ea));
  if (ea.ok) {
    out.A_home = await inspectModalLayout(ctx);
    await cdp.screenshot(ctx, 'screenshots/025-i1-home-edit.png');
    log('A home modal:', JSON.stringify(out.A_home, null, 2));
    await closeModal(ctx);
  } else {
    out.A_home = { error: ea };
  }

  // ---- B) edit manage_user (nested leaf): layout selector must be HIDDEN ----
  const eb = await openEdit(ctx, 'manage_user');
  log('open edit manage_user:', JSON.stringify(eb));
  if (eb.ok) {
    out.B_manage_user = await inspectModalLayout(ctx);
    await cdp.screenshot(ctx, 'screenshots/025-i1-manage-user-edit.png');
    log('B manage_user modal:', JSON.stringify(out.B_manage_user, null, 2));
    await closeModal(ctx);
  } else {
    out.B_manage_user = { error: eb };
  }

  // ---- verdict ----
  const aVisible = out.A_home.hasLayoutItem === true;
  const aLayoutVal = (out.A_home.selectValues || {})['布局'] || (out.A_home.selectValues || {}).layout;
  const bHidden = out.B_manage_user.hasLayoutItem === false;
  const pass = aVisible && bHidden;
  log('\n=== VERDICT ===');
  log('A) edit home  → layout selector visible:', aVisible, '| layout value:', aLayoutVal);
  log('B) edit manage_user → layout selector hidden:', bHidden);
  log(pass ? 'PASS ✓ — parentId gate discriminates top-level (preserve layout) vs nested (no prefix).'
           : 'FAIL ✗ — see modal dumps above.');
} catch (e) {
  log('ERROR:', e.message);
} finally {
  await cdp.cleanup();
}
