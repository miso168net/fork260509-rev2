// feature 023 EndpointAuth — CDP browser smoke (isolated browser contexts).
// Checks (Super login → /manage/role → edit a role → 接口权限 modal):
//   ① non-Super role (R_ADMIN): modal opens, NTree renders endpoint nodes,
//      tree is EDITABLE (not disabled), confirm button enabled. (granted preload + 28 registry
//      are curl-proven; virtual-scroll means DOM holds only the viewport window.)
//   ② root-mode (R_SUPER): modal opens, NTree is DISABLED (n-tree--disabled) and
//      confirm button disabled → "全勾且唯讀" (all-checked comes from the Super full-registry fetch).
// Screenshots land in ./screenshots/ (gitignored). Run: node cdp-endpoint-auth-smoke.mjs
import { CDP, sleep } from './cdp.mjs';

const ROLES = { Super: '超级管理员' }; // login quick-button label
const results = { '①_nonSuper': {}, '②_rootMode': {} };
const cdp = new CDP();
const log = (...a) => console.log(...a);

// Open the 接口权限 modal for the table row whose text contains `roleCodeNeedle`
// (use R_ADMIN / R_SUPER — unique substrings; note 管理员 ⊂ 超级管理员 so role names are ambiguous).
async function openEndpointModalForRow(ctx, roleCodeNeedle) {
  await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/role', 3500);
  await sleep(1500);
  const url = await cdp.href(ctx);

  const editRes = await cdp.evalExpr(ctx, `(() => {
    const rows = [...document.querySelectorAll('.n-data-table-tr, tbody tr')];
    const row = rows.find(r => r.textContent.includes(${JSON.stringify(roleCodeNeedle)}));
    if (!row) return { ok:false, reason:'row not found', rowsText: rows.map(r=>r.textContent.trim().slice(0,40)) };
    const edit = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑');
    if (!edit) return { ok:false, reason:'编辑 not in row', rowBtns: [...row.querySelectorAll('button')].map(b=>b.textContent.trim()) };
    edit.click();
    return { ok:true };
  })()`);
  if (!editRes.ok) return { ok:false, stage:'edit', url, ...editRes };
  await sleep(1800); // drawer open

  const trigRes = await cdp.evalExpr(ctx, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '接口权限');
    if (!b) return { ok:false, reason:'接口权限 trigger not found', drawerBtns: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean) };
    b.click();
    return { ok:true };
  })()`);
  if (!trigRes.ok) return { ok:false, stage:'trigger', url, ...trigRes };
  await sleep(2500); // getAllEndpoints + getRoleEndpoints

  return { ok:true, url };
}

// Inspect the open endpoint-auth modal's NTree.
async function inspectModal(ctx) {
  return cdp.evalExpr(ctx, `(() => {
    const tree = document.querySelector('.n-tree');
    const treeDisabled = !!document.querySelector('.n-tree.n-tree--disabled');
    const treeNodes = document.querySelectorAll('.n-tree-node').length;
    const checked = document.querySelectorAll('.n-checkbox.n-checkbox--checked').length;
    const disabledCheckboxes = document.querySelectorAll('.n-checkbox.n-checkbox--disabled').length;
    // confirm button = primary button reading 确认 in the modal footer
    const confirmBtn = [...document.querySelectorAll('.n-modal button, .n-card button')]
      .find(b => b.textContent.trim() === '确认' || b.textContent.trim() === 'Confirm');
    const confirmDisabled = confirmBtn ? confirmBtn.disabled || confirmBtn.classList.contains('n-button--disabled') : null;
    // sample visible node labels (virtual-scroll: only the viewport window)
    const labels = [...new Set([...document.querySelectorAll('.n-tree-node-content')].map(e=>e.textContent.trim()).filter(Boolean))];
    const looksLikeEndpoint = labels.filter(l => /^(GET|POST|DELETE) \\/systemManage\\//.test(l));
    return { hasTree: !!tree, treeDisabled, treeNodes, checked, disabledCheckboxes,
             confirmDisabled, labelSample: labels.slice(0, 12), endpointLabelCount: looksLikeEndpoint.length };
  })()`);
}

try {
  await cdp.connect();
  log('Connected to browser WS (9229).');

  // ============ ① non-Super (R_ADMIN): editable endpoint modal ============
  log('\n========== ① non-Super (R_ADMIN) ==========');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, ROLES.Super);
      out.login = li.ok;
      if (!li.ok) { results['①_nonSuper'] = { status:'FAIL', note:'login failed', login: li }; log('① LOGIN FAIL', JSON.stringify(li)); }
      else {
        const open = await openEndpointModalForRow(ctx, 'R_ADMIN');
        out.open = open;
        await cdp.screenshot(ctx, 'screenshots/endpoint-modal-admin.png');
        if (!open.ok) { results['①_nonSuper'] = { status:'PARTIAL', ...out, screenshot:'screenshots/endpoint-modal-admin.png' }; log('① OPEN FAIL', JSON.stringify(open)); }
        else {
          const m = await inspectModal(ctx);
          out.modal = m;
          // PASS: modal tree present + EDITABLE (no disabled checkboxes) + confirm enabled +
          // the rendered nodes are real endpoint labels ("METHOD /systemManage/..").
          const pass = m.hasTree && m.treeNodes > 0
            && m.disabledCheckboxes === 0
            && m.confirmDisabled === false
            && m.endpointLabelCount > 0;
          results['①_nonSuper'] = { status: pass ? 'PASS' : 'PARTIAL', ...out, screenshot:'screenshots/endpoint-modal-admin.png' };
          log('①', results['①_nonSuper'].status, 'treeNodes=' + m.treeNodes, 'checked=' + m.checked, 'disabled=' + m.treeDisabled, 'confirmDisabled=' + m.confirmDisabled, 'endpointLabels=' + m.endpointLabelCount);
          log('   labelSample:', JSON.stringify(m.labelSample));
        }
      }
    } catch (e) { results['①_nonSuper'] = { status:'FAIL', error:String(e), ...out }; log('① ERROR', String(e)); try { await cdp.screenshot(ctx, 'screenshots/endpoint-modal-admin-ERR.png'); } catch {} }
  }

  // ============ ② root-mode (R_SUPER): disabled / all-checked ============
  log('\n========== ② root-mode (R_SUPER) ==========');
  {
    const ctx = await cdp.newContextPage();
    const out = {};
    try {
      const li = await cdp.login(ctx, ROLES.Super);
      out.login = li.ok;
      if (!li.ok) { results['②_rootMode'] = { status:'FAIL', note:'login failed', login: li }; log('② LOGIN FAIL', JSON.stringify(li)); }
      else {
        const open = await openEndpointModalForRow(ctx, 'R_SUPER');
        out.open = open;
        await cdp.screenshot(ctx, 'screenshots/endpoint-modal-super.png');
        if (!open.ok) { results['②_rootMode'] = { status:'PARTIAL', ...out, screenshot:'screenshots/endpoint-modal-super.png' }; log('② OPEN FAIL', JSON.stringify(open)); }
        else {
          const m = await inspectModal(ctx);
          out.modal = m;
          // PASS: modal tree present + root-mode READ-ONLY. In this naive-ui version the NTree
          // `disabled` prop does NOT add `.n-tree--disabled`; it propagates to the node checkboxes
          // (n-checkbox--disabled). So root-mode is proven by: every visible checkbox disabled
          // AND every visible node checked (all-checked from the Super full-registry fetch)
          // AND the confirm button disabled.
          const pass = m.hasTree && m.treeNodes > 0
            && m.disabledCheckboxes === m.treeNodes
            && m.checked === m.treeNodes
            && m.confirmDisabled === true;
          results['②_rootMode'] = { status: pass ? 'PASS' : 'PARTIAL', ...out, screenshot:'screenshots/endpoint-modal-super.png' };
          log('②', results['②_rootMode'].status, 'treeNodes=' + m.treeNodes, 'checked=' + m.checked, 'treeDisabled=' + m.treeDisabled, 'confirmDisabled=' + m.confirmDisabled, 'endpointLabels=' + m.endpointLabelCount);
          log('   labelSample:', JSON.stringify(m.labelSample));
        }
      }
    } catch (e) { results['②_rootMode'] = { status:'FAIL', error:String(e), ...out }; log('② ERROR', String(e)); try { await cdp.screenshot(ctx, 'screenshots/endpoint-modal-super-ERR.png'); } catch {} }
  }
} catch (e) {
  log('FATAL', String(e));
} finally {
  await cdp.cleanup();
  log('\n========== CLEANUP done (contexts disposed) ==========');
  log('\n===== RESULTS JSON =====');
  log(JSON.stringify(results, null, 2));
}
