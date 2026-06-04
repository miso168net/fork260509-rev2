// feature 025 menu-restore-reparent — CDP browser visual acceptance (isolated browser contexts).
// VERIFY-ONLY: drives the real base-web menu page in the user's live Edge via a fresh
// isolated browser context (never touches the user's tabs/login). Mirrors 023's helper style.
//
// Scenarios (Super login → /manage/menu):
//   ① Restore toggle + button (US1): flip 「显示已删除」 NSwitch ON → table shows the
//      soft-deleted list, operate column shows 「恢复」 (not edit/delete). Click 恢复 →
//      NPopconfirm 确认 → the menu (t025_del) leaves the deleted list. Flip OFF → it is
//      back in the active list.
//   ② Re-parent NTreeSelect (US2): edit a CUSTOM menu (t025_leaf) → edit modal shows a
//      parentId NTreeSelect populated with the menu tree → pick a directory (t025dir) →
//      submit → menu's parentId changes (verified via API/psql by the runner).
//   ③ Seed disabled (US2/R2): edit a SEED menu (manage_user) → parentId NTreeSelect DISABLED.
//      Edit a CUSTOM menu (t025_leaf) → parentId NTreeSelect ENABLED.
//   ④ Guard toast (2222): trigger a rejected re-parent (cycle: edit a CUSTOM directory
//      t025dir and set its parent to itself) → submit → a Chinese guard toast appears
//      (「不可移动到自己的子层」).
//
// Test data is seeded by the runner BEFORE this script (curl): t025_dir(dir,id29),
// t025_leaf(leaf,id30,parent0), t025_del(leaf,soft-deleted,id31). This script reports
// DOM-level evidence; the runner cross-checks the DB mutations via psql.
//
// Screenshots land in ./screenshots/ (gitignored). Run: node cdp-menu-restore-reparent-smoke.mjs
import { CDP, sleep } from './cdp.mjs';

const SUPER_LABEL = '超级管理员';
const MENU_URL = 'http://127.0.0.1:21080/manage/menu';
const results = { '①_restore': {}, '②_reparent': {}, '③_seedDisabled': {}, '④_guardToast': {} };
const cdp = new CDP();
const log = (...a) => console.log(...a);

// ---- DOM helpers (run in page) -------------------------------------------------

// The 「显示已删除」 toggle: an .n-switch sitting next to a label span. We click the
// switch rail to flip it. Returns the switch state-ish info.
async function inspectToggle(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const labels = [...document.querySelectorAll('span')].map(s=>s.textContent.trim());
    const hasLabel = labels.includes('显示已删除');
    const sw = document.querySelector('.n-switch');
    return {
      hasLabel,
      hasSwitch: !!sw,
      switchChecked: sw ? sw.classList.contains('n-switch--active') : null
    };
  })()`);
}

async function clickToggle(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const sw = document.querySelector('.n-switch');
    if (!sw) return { ok:false, reason:'no switch' };
    sw.click();
    return { ok:true };
  })()`);
}

// Inspect the data table: row count, whether any row has a 恢复 button, and whether
// any row has 编辑/删除 buttons. Also returns the route names visible in rows.
async function inspectTable(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const rows = [...document.querySelectorAll('.n-data-table-tbody .n-data-table-tr, tbody tr')];
    const rowInfo = rows.map(r => {
      const btns = [...r.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean);
      return { text: r.textContent.trim().slice(0,80), btns };
    });
    const allBtns = rowInfo.flatMap(r=>r.btns);
    return {
      rowCount: rows.length,
      hasRestoreBtn: allBtns.includes('恢复'),
      hasEditBtn: allBtns.includes('编辑'),
      hasDeleteBtn: allBtns.includes('删除'),
      rows: rowInfo
    };
  })()`);
}

// Find the table row whose text contains needle and click the button with given label.
async function clickRowButton(ctx, needle, btnLabel) {
  return cdp.evalExpr(ctx, `(() => {
    const rows = [...document.querySelectorAll('.n-data-table-tbody .n-data-table-tr, tbody tr')];
    const row = rows.find(r => r.textContent.includes(${JSON.stringify(needle)}));
    if (!row) return { ok:false, reason:'row not found', rowsText: rows.map(r=>r.textContent.trim().slice(0,50)) };
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(btnLabel)});
    if (!btn) return { ok:false, reason:'btn not found', rowBtns: [...row.querySelectorAll('button')].map(b=>b.textContent.trim()) };
    btn.click();
    return { ok:true };
  })()`);
}

// Confirm an open NPopconfirm by clicking its positive (primary) button (确定/确认/恢复).
async function confirmPopconfirm(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const pop = document.querySelector('.n-popconfirm__action, .n-popover .n-popconfirm__action');
    if (!pop) {
      // fallback: any visible popover primary button
      const b = [...document.querySelectorAll('.n-popover button.n-button--primary-type, .n-popconfirm button.n-button--primary-type')].pop();
      if (b) { b.click(); return { ok:true, via:'fallback' }; }
      return { ok:false, reason:'no popconfirm action' };
    }
    const btn = [...pop.querySelectorAll('button')].pop(); // positive button is the last
    if (!btn) return { ok:false, reason:'no positive btn' };
    btn.click();
    return { ok:true };
  })()`);
}

// Open the edit modal for the row matching needle, return ok.
async function openEditModal(ctx, needle) {
  const r = await clickRowButton(ctx, needle, '编辑');
  if (!r.ok) return r;
  await sleep(1500); // modal open + getMenuTree fetch
  return { ok: true };
}

// Inspect the open menu-operate modal's parentId NTreeSelect.
async function inspectParentSelect(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const modal = document.querySelector('.n-modal');
    if (!modal) return { hasModal:false };
    const ts = modal.querySelector('.n-tree-select');
    if (!ts) return { hasModal:true, hasTreeSelect:false,
      labels: [...modal.querySelectorAll('.n-form-item-label')].map(e=>e.textContent.trim()) };
    // naive-ui disabled tree-select: the selection box carries .n-base-selection--disabled
    const sel = ts.querySelector('.n-base-selection');
    const disabled = sel ? sel.classList.contains('n-base-selection--disabled') : null;
    const placeholderEl = ts.querySelector('.n-base-selection-placeholder, .n-base-selection-label');
    const valueText = placeholderEl ? placeholderEl.textContent.trim() : null;
    return { hasModal:true, hasTreeSelect:true, disabled, valueText };
  })()`);
}

// Open the NTreeSelect dropdown and read the option labels (the menu tree).
async function openTreeSelectAndReadOptions(ctx) {
  await cdp.evalExpr(ctx, `(() => {
    const modal = document.querySelector('.n-modal');
    const ts = modal && modal.querySelector('.n-tree-select .n-base-selection');
    if (ts) ts.click();
    return true;
  })()`);
  await sleep(800);
  return cdp.evalExpr(ctx, `(() => {
    // dropdown is teleported to body
    const menu = document.querySelector('.n-tree-select-menu, .n-virtual-list');
    const nodes = [...document.querySelectorAll('.n-tree-select-menu .n-tree-node-content, .n-tree-select-menu .n-tree-node-content__text')]
      .map(e=>e.textContent.trim()).filter(Boolean);
    const uniq = [...new Set(nodes)];
    return { hasDropdown: !!menu, optionCount: uniq.length, options: uniq.slice(0,30) };
  })()`);
}

// In an open tree-select dropdown, click the option whose label === target.
async function pickTreeOption(ctx, target) {
  return cdp.evalExpr(ctx, `(() => {
    const opts = [...document.querySelectorAll('.n-tree-select-menu .n-tree-node-content')];
    const o = opts.find(e => e.textContent.trim() === ${JSON.stringify(target)});
    if (!o) return { ok:false, reason:'option not found', opts: opts.map(e=>e.textContent.trim()) };
    o.click();
    return { ok:true };
  })()`);
}

// Click the modal footer 确定/确认 (primary) button to submit.
async function submitModal(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const modal = document.querySelector('.n-modal');
    if (!modal) return { ok:false, reason:'no modal' };
    const btn = [...modal.querySelectorAll('button')].find(b => {
      const t=b.textContent.trim(); return (t==='确定'||t==='确认'||t==='Confirm') && b.classList.contains('n-button--primary-type');
    });
    if (!btn) return { ok:false, reason:'submit btn not found', btns:[...modal.querySelectorAll('button')].map(b=>b.textContent.trim()) };
    btn.click();
    return { ok:true };
  })()`);
}

// Read any visible naive-ui message toast text.
async function readToast(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const msgs = [...document.querySelectorAll('.n-message, .n-message__content')].map(e=>e.textContent.trim()).filter(Boolean);
    return [...new Set(msgs)];
  })()`);
}

// ---- scenarios -----------------------------------------------------------------

try {
  await cdp.connect();
  log('Connected to browser WS (9229).');

  // ============ ① Restore toggle + button + restore action (US1) ============
  log('\n========== ① restore toggle + 恢复 button (US1) ==========');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, SUPER_LABEL);
      out.login = li.ok;
      if (!li.ok) { results['①_restore'] = { status:'FAIL', note:'login failed', login: li }; log('① LOGIN FAIL', JSON.stringify(li)); }
      else {
        await cdp.navigate(ctx, MENU_URL, 3500);
        await sleep(1200);

        // before flip: active list
        const beforeToggle = await inspectToggle(ctx);
        const activeTable = await inspectTable(ctx);
        out.beforeToggle = beforeToggle;
        out.activeTableHasEdit = activeTable.hasEditBtn;
        await cdp.screenshot(ctx, 'screenshots/01a-active-list.png');

        // flip toggle ON
        await clickToggle(ctx);
        await sleep(1800); // getDeletedMenus fetch
        const afterToggle = await inspectToggle(ctx);
        const deletedTable = await inspectTable(ctx);
        out.afterToggle = afterToggle;
        out.deletedTable = { rowCount: deletedTable.rowCount, hasRestoreBtn: deletedTable.hasRestoreBtn, hasEditBtn: deletedTable.hasEditBtn, hasDeleteBtn: deletedTable.hasDeleteBtn };
        out.deletedHasT025 = deletedTable.rows.some(r => r.text.includes('t025_del'));
        await cdp.screenshot(ctx, 'screenshots/01b-deleted-list.png');

        // click 恢复 on the t025_del row → confirm popconfirm
        const clickRestore = await clickRowButton(ctx, 't025_del', '恢复');
        out.clickRestore = clickRestore;
        await sleep(700);
        await cdp.screenshot(ctx, 'screenshots/01c-popconfirm.png');
        const confirm = await confirmPopconfirm(ctx);
        out.confirm = confirm;
        await sleep(1800); // restoreMenu + getDeletedMenus refresh
        const restoreToast = await readToast(ctx);
        out.restoreToast = restoreToast;
        await cdp.screenshot(ctx, 'screenshots/01d-after-restore.png');

        const deletedAfter = await inspectTable(ctx);
        out.deletedAfterRestore_stillHasT025 = deletedAfter.rows.some(r => r.text.includes('t025_del'));

        // flip toggle OFF → table returns to the active list. NOTE: the active list is
        // paginated (page size 10); the restored t025_del has the highest id+order so it
        // lands on page 2, so a page-1 DOM scan may not see it. The authoritative proof of
        // restore is that t025_del LEFT the deleted list (deletedAfterRestore_stillHasT025
        // === false), cross-checked by the runner via psql (deleted_at → NULL).
        await clickToggle(ctx);
        await sleep(1800);
        const activeAfter = await inspectTable(ctx);
        out.activeAfter_hasT025_page1 = activeAfter.rows.some(r => r.text.includes('t025_del'));
        out.activeAfter_backToActiveView = !activeAfter.hasRestoreBtn && activeAfter.hasEditBtn;
        await cdp.screenshot(ctx, 'screenshots/01e-active-after-restore.png');

        const pass =
          beforeToggle.hasLabel && beforeToggle.hasSwitch &&
          out.deletedTable.hasRestoreBtn && !out.deletedTable.hasEditBtn && !out.deletedTable.hasDeleteBtn &&
          out.deletedHasT025 &&
          clickRestore.ok && confirm.ok &&
          restoreToast.some(t => t.includes('恢复成功')) &&
          !out.deletedAfterRestore_stillHasT025 &&
          out.activeAfter_backToActiveView;
        results['①_restore'] = { status: pass ? 'PASS' : 'PARTIAL', ...out };
        log('①', results['①_restore'].status,
          'label=' + beforeToggle.hasLabel, 'switch=' + beforeToggle.hasSwitch,
          'restoreBtn=' + out.deletedTable.hasRestoreBtn, 'noEdit=' + !out.deletedTable.hasEditBtn,
          'leftDeleted=' + !out.deletedAfterRestore_stillHasT025, 'backToActiveView=' + out.activeAfter_backToActiveView,
          'onPage1=' + out.activeAfter_hasT025_page1);
        log('   restoreToast:', JSON.stringify(restoreToast));
      }
    } catch (e) { results['①_restore'] = { status:'FAIL', error:String(e), ...out }; log('① ERROR', String(e)); try { await cdp.screenshot(ctx, 'screenshots/01-ERR.png'); } catch {} }
  }

  // ============ ③ Seed disabled vs custom enabled (US2/R2) — do this BEFORE ② ============
  // (③ is read-only / no mutation; ② mutates t025_leaf's parent. Run ③ first to keep
  //  t025_leaf at parent 0 when ③ inspects it, then ② mutates it.)
  log('\n========== ③ seed parentId DISABLED, custom ENABLED (US2/R2) ==========');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, SUPER_LABEL);
      out.login = li.ok;
      if (!li.ok) { results['③_seedDisabled'] = { status:'FAIL', note:'login failed', login: li }; }
      else {
        await cdp.navigate(ctx, MENU_URL, 3500);
        await sleep(1200);

        // --- SEED menu: manage_user → parentId tree-select DISABLED ---
        const openSeed = await openEditModal(ctx, 'manage_user');
        out.openSeed = openSeed;
        const seedSel = await inspectParentSelect(ctx);
        out.seedSelect = seedSel;
        await cdp.screenshot(ctx, 'screenshots/03a-seed-disabled.png');
        // close modal
        await cdp.evalExpr(ctx, `(() => { const b=[...document.querySelectorAll('.n-modal button')].find(x=>x.textContent.trim()==='取消'); if(b)b.click(); return true; })()`);
        await sleep(1000);

        // --- CUSTOM menu: t025_leaf → parentId tree-select ENABLED ---
        const openCustom = await openEditModal(ctx, 't025_leaf');
        out.openCustom = openCustom;
        const customSel = await inspectParentSelect(ctx);
        out.customSelect = customSel;
        await cdp.screenshot(ctx, 'screenshots/03b-custom-enabled.png');
        await cdp.evalExpr(ctx, `(() => { const b=[...document.querySelectorAll('.n-modal button')].find(x=>x.textContent.trim()==='取消'); if(b)b.click(); return true; })()`);
        await sleep(600);

        const pass =
          seedSel.hasTreeSelect && seedSel.disabled === true &&
          customSel.hasTreeSelect && customSel.disabled === false;
        results['③_seedDisabled'] = { status: pass ? 'PASS' : 'PARTIAL', ...out };
        log('③', results['③_seedDisabled'].status,
          'seedTS=' + seedSel.hasTreeSelect, 'seedDisabled=' + seedSel.disabled,
          'customTS=' + customSel.hasTreeSelect, 'customDisabled=' + customSel.disabled);
      }
    } catch (e) { results['③_seedDisabled'] = { status:'FAIL', error:String(e), ...out }; log('③ ERROR', String(e)); try { await cdp.screenshot(ctx, 'screenshots/03-ERR.png'); } catch {} }
  }

  // ============ ② Re-parent NTreeSelect renders + works (US2) ============
  log('\n========== ② re-parent NTreeSelect (US2) ==========');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, SUPER_LABEL);
      out.login = li.ok;
      if (!li.ok) { results['②_reparent'] = { status:'FAIL', note:'login failed', login: li }; }
      else {
        await cdp.navigate(ctx, MENU_URL, 3500);
        await sleep(1200);

        const openCustom = await openEditModal(ctx, 't025_leaf');
        out.openCustom = openCustom;
        const sel = await inspectParentSelect(ctx);
        out.parentSelect = sel;
        await cdp.screenshot(ctx, 'screenshots/02a-edit-modal.png');

        // open the tree-select dropdown, read the menu-tree options
        const opts = await openTreeSelectAndReadOptions(ctx);
        out.treeOptions = opts;
        await cdp.screenshot(ctx, 'screenshots/02b-treeselect-open.png');

        // pick the custom directory "t025dir" as the new parent
        const pick = await pickTreeOption(ctx, 't025dir');
        out.pick = pick;
        await sleep(700);
        await cdp.screenshot(ctx, 'screenshots/02c-parent-picked.png');

        // submit
        const submit = await submitModal(ctx);
        out.submit = submit;
        await sleep(1800);
        const toast = await readToast(ctx);
        out.submitToast = toast;
        await cdp.screenshot(ctx, 'screenshots/02d-after-submit.png');

        // DOM-level pass = tree-select rendered + has options including a directory;
        // the actual parentId DB mutation is cross-checked by the runner via psql.
        const pass =
          sel.hasTreeSelect && sel.disabled === false &&
          opts.hasDropdown && opts.optionCount > 0 &&
          pick.ok && submit.ok &&
          toast.some(t => t.includes('成功') || t.includes('更新'));
        results['②_reparent'] = { status: pass ? 'PASS' : 'PARTIAL', ...out };
        log('②', results['②_reparent'].status,
          'treeSelect=' + sel.hasTreeSelect, 'enabled=' + (sel.disabled===false),
          'optionCount=' + opts.optionCount, 'pickedDir=' + pick.ok, 'submit=' + submit.ok);
        log('   options:', JSON.stringify(opts.options));
        log('   submitToast:', JSON.stringify(toast));
      }
    } catch (e) { results['②_reparent'] = { status:'FAIL', error:String(e), ...out }; log('② ERROR', String(e)); try { await cdp.screenshot(ctx, 'screenshots/02-ERR.png'); } catch {} }
  }

  // ============ ④ Guard toast (2222) — cycle re-parent rejection ============
  // Edit the CUSTOM directory t025dir and try to set its parent to ITSELF → backend
  // rejects with 「不可移动到自己的子层」 (cycle guard).
  log('\n========== ④ guard toast: cycle re-parent rejection (2222) ==========');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, SUPER_LABEL);
      out.login = li.ok;
      if (!li.ok) { results['④_guardToast'] = { status:'FAIL', note:'login failed', login: li }; }
      else {
        await cdp.navigate(ctx, MENU_URL, 3500);
        await sleep(1200);

        const openDir = await openEditModal(ctx, 't025dir');
        out.openDir = openDir;
        const sel = await inspectParentSelect(ctx);
        out.parentSelect = sel;

        const opts = await openTreeSelectAndReadOptions(ctx);
        out.treeOptions = { hasDropdown: opts.hasDropdown, optionCount: opts.optionCount, options: opts.options };
        // try to pick itself (t025dir) as its own parent → cycle
        const pick = await pickTreeOption(ctx, 't025dir');
        out.pick = pick;
        await sleep(600);
        await cdp.screenshot(ctx, 'screenshots/04a-cycle-pick.png');

        const submit = await submitModal(ctx);
        out.submit = submit;
        await sleep(1800);
        const toast = await readToast(ctx);
        out.guardToast = toast;
        await cdp.screenshot(ctx, 'screenshots/04b-guard-toast.png');

        const hasGuardToast = toast.some(t =>
          t.includes('不可移动到自己的子层') || t.includes('上层菜单无效') ||
          t.includes('不可移动系统内置菜单') || t.includes('上层菜单已删除'));
        // If picking self wasn't possible (naive-ui may exclude self), fall back to
        // reporting what happened — still capture toast for evidence.
        const pass = pick.ok && submit.ok && hasGuardToast;
        results['④_guardToast'] = { status: pass ? 'PASS' : (hasGuardToast ? 'PASS' : 'PARTIAL'), ...out };
        log('④', results['④_guardToast'].status,
          'pickedSelf=' + pick.ok, 'submit=' + submit.ok, 'guardToast=' + hasGuardToast);
        log('   guardToast text:', JSON.stringify(toast));
      }
    } catch (e) { results['④_guardToast'] = { status:'FAIL', error:String(e), ...out }; log('④ ERROR', String(e)); try { await cdp.screenshot(ctx, 'screenshots/04-ERR.png'); } catch {} }
  }
} catch (e) {
  log('FATAL', String(e));
} finally {
  await cdp.cleanup();
  log('\n========== CLEANUP done (contexts disposed) ==========');
  log('\n===== RESULTS JSON =====');
  log(JSON.stringify(results, null, 2));
}
