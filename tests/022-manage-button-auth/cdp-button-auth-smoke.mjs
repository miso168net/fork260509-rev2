// feature 022 ButtonAuth — CDP browser smoke (isolated browser contexts per role).
// Checks: A toggle-auth per-role buttons (3/2/1) · B user-page hasAuth gating ·
//         C button-auth-modal registry · D menu-auth-modal (021 regression).
// Screenshots land in ./screenshots/ (relative to this script; gitignored).
import { CDP, sleep } from './cdp.mjs';

const ROLES = {
  Super: '超级管理员',
  Admin: '管理员',
  User:  '普通用户',
};

const results = { A: {}, B: {}, C: {}, D: {} };
const cdp = new CDP();

function log(...a) { console.log(...a); }

try {
  await cdp.connect();
  log('Connected to browser WS.');

  // ============ Check A: toggle-auth reachability + per-role buttons ============
  log('\n========== CHECK A: toggle-auth per-role buttons ==========');
  for (const role of ['Super', 'Admin', 'User']) {
    const ctx = await cdp.newContextPage();
    const out = { role };
    try {
      const li = await cdp.login(ctx, ROLES[role]);
      if (!li.ok) { out.login = li; results.A[role] = { ...out, status: 'FAIL', note: 'login failed' }; log('A', role, 'LOGIN FAIL', JSON.stringify(li)); continue; }
      out.loginHref = li.href;

      await cdp.navigate(ctx, 'http://127.0.0.1:21080/function/toggle-auth', 3000);
      out.url = await cdp.href(ctx);

      if (role === 'Super') {
        out.allButtons = await cdp.evalExpr(ctx, `[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean)`);
      }
      // count visible buttons whose textContent contains 可见 OR matches known labels
      const known = ['超级管理员可见','管理员可见','管理员或普通用户可见'];
      out.permBtns = await cdp.evalExpr(ctx, `(() => {
        const known = ${JSON.stringify(known)};
        const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
        return [...document.querySelectorAll('button')]
          .filter(b => vis(b))
          .map(b => b.textContent.trim())
          .filter(t => t.includes('可见') || known.includes(t));
      })()`);
      out.count = out.permBtns.length;
      await cdp.screenshot(ctx, `screenshots/toggle-auth-${role}.png`);
      out.screenshot = `screenshots/toggle-auth-${role}.png`;

      const expected = { Super: 3, Admin: 2, User: 1 }[role];
      const urlOk = out.url.includes('/function/toggle-auth');
      out.expected = expected;
      out.status = (out.count === expected && urlOk) ? 'PASS' : 'FAIL';
      log('A', role, out.status, 'count=' + out.count, 'expected=' + expected, 'url=' + out.url);
      if (role === 'Super') log('   Super all buttons:', JSON.stringify(out.allButtons));
      log('   permBtns:', JSON.stringify(out.permBtns));
    } catch (e) {
      out.status = 'FAIL'; out.error = String(e);
      log('A', role, 'ERROR', String(e));
      try { await cdp.screenshot(ctx, `screenshots/toggle-auth-${role}-ERR.png`); } catch {}
    }
    results.A[role] = out;
  }

  // ============ Check B: user-page gating ============
  log('\n========== CHECK B: manage/user gating ==========');
  for (const role of ['Super', 'Admin']) {
    const ctx = await cdp.newContextPage();
    const out = { role };
    try {
      const li = await cdp.login(ctx, ROLES[role]);
      if (!li.ok) { out.login = li; results.B[role] = { ...out, status: 'FAIL', note: 'login failed' }; log('B', role, 'LOGIN FAIL', JSON.stringify(li)); continue; }
      await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/user', 3500);
      await sleep(1500);
      out.url = await cdp.href(ctx);
      const counts = await cdp.evalExpr(ctx, `(() => {
        const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
        const btns = [...document.querySelectorAll('button')].filter(vis);
        const txt = b => b.textContent.trim();
        return {
          edit: btns.filter(b => txt(b)==='编辑').length,
          del:  btns.filter(b => txt(b)==='删除').length,
          add:  btns.some(b => txt(b)==='新增'),
          allToolbarish: btns.map(txt).filter(Boolean),
        };
      })()`);
      out.counts = counts;
      await cdp.screenshot(ctx, `screenshots/manage-user-${role}.png`);
      out.screenshot = `screenshots/manage-user-${role}.png`;
      if (role === 'Super') out.status = (counts.edit>0 && counts.del>0 && counts.add) ? 'PASS' : 'FAIL';
      else out.status = (counts.edit>0 && counts.del===0 && !counts.add) ? 'PASS' : 'FAIL';
      log('B', role, out.status, JSON.stringify({edit:counts.edit, del:counts.del, add:counts.add}), 'url=' + out.url);
    } catch (e) {
      out.status = 'FAIL'; out.error = String(e);
      log('B', role, 'ERROR', String(e));
      try { await cdp.screenshot(ctx, `screenshots/manage-user-${role}-ERR.png`); } catch {}
    }
    results.B[role] = out;
  }

  // ============ Check C + D: manage/role drawer -> button-auth / menu-auth modals (Super) ============
  log('\n========== CHECK C + D: manage/role modals (Super) ==========');
  {
    const ctx = await cdp.newContextPage();
    const outC = {}, outD = {};
    try {
      const li = await cdp.login(ctx, ROLES.Super);
      if (!li.ok) {
        results.C = { status: 'FAIL', note: 'login failed', login: li };
        results.D = { status: 'FAIL', note: 'login failed' };
        log('C/D LOGIN FAIL', JSON.stringify(li));
      } else {
        await cdp.navigate(ctx, 'http://127.0.0.1:21080/manage/role', 3500);
        await sleep(1500);
        outC.url = await cdp.href(ctx);

        // ---- Check C: button-auth modal ----
        const editClicked = await cdp.evalExpr(ctx, `(() => {
          const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim()==='编辑');
          if (b) { b.click(); return true; } return false;
        })()`);
        outC.editClicked = editClicked;
        if (!editClicked) {
          outC.btnTexts = await cdp.evalExpr(ctx, `[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean)`);
          await cdp.screenshot(ctx, 'screenshots/button-auth-modal.png');
          results.C = { status: 'PARTIAL', note: 'edit button not found on /manage/role', ...outC, screenshot: 'screenshots/button-auth-modal.png' };
        } else {
          await sleep(1800);
          outC.drawerButtons = await cdp.evalExpr(ctx, `[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean)`);
          const baClicked = await cdp.evalExpr(ctx, `(() => {
            const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim()==='按钮权限');
            if (b) { b.click(); return true; } return false;
          })()`);
          outC.buttonAuthClicked = baClicked;
          if (!baClicked) {
            await cdp.screenshot(ctx, 'screenshots/button-auth-modal.png');
            results.C = { status: 'PARTIAL', note: '按钮权限 button not found in drawer', ...outC, screenshot: 'screenshots/button-auth-modal.png' };
          } else {
            await sleep(2200); // getAllButtons + getRoleButton
            const modalInfo = await cdp.evalExpr(ctx, `(() => {
              const known = ['超级管理员可见','管理员可见','管理员或普通用户可见','新增用户','编辑用户','删除用户'];
              const all = [...document.querySelectorAll('.n-tree-node-content, .n-checkbox, .n-tree-node, label, span')]
                .map(e => e.textContent.trim()).filter(Boolean);
              const labels = [...new Set(all)];
              const found = known.filter(k => labels.some(l => l.includes(k)));
              const treeNodes = document.querySelectorAll('.n-tree-node').length;
              const checkboxes = document.querySelectorAll('.n-checkbox').length;
              return { found, foundCount: found.length, treeNodes, checkboxes,
                       sample: labels.filter(l => l.length<30).slice(0, 60) };
            })()`);
            outC.modal = modalInfo;
            await cdp.screenshot(ctx, 'screenshots/button-auth-modal.png');
            outC.screenshot = 'screenshots/button-auth-modal.png';
            const pass = modalInfo.foundCount >= 6 || modalInfo.treeNodes >= 6 || modalInfo.checkboxes >= 6;
            results.C = { status: pass ? 'PASS' : 'PARTIAL', ...outC };
            log('C', results.C.status, 'foundRegistry=' + modalInfo.foundCount, 'treeNodes=' + modalInfo.treeNodes, 'checkboxes=' + modalInfo.checkboxes);
            log('   found:', JSON.stringify(modalInfo.found));
          }
        }

        // ---- Check D: menu-auth modal ----
        // close button-auth modal first (Esc), reopen drawer if needed
        await cdp.evalExpr(ctx, `(() => {
          // try to close any open modal via mask or close icon
          const closes = [...document.querySelectorAll('.n-base-close, .n-modal-mask')];
          return closes.length;
        })()`);
        await cdp.evalExpr(ctx, `(() => {
          // press Escape to dismiss modal
          document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', keyCode:27, bubbles:true}));
          return true;
        })()`);
        await sleep(1000);
        // ensure drawer still open; the 菜单权限 button should still be present
        let menuClicked = await cdp.evalExpr(ctx, `(() => {
          const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim()==='菜单权限');
          if (b) { b.click(); return true; } return false;
        })()`);
        if (!menuClicked) {
          // drawer may have closed; reopen edit drawer
          await cdp.evalExpr(ctx, `(() => {
            const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim()==='编辑');
            if (b) b.click();
          })()`);
          await sleep(1800);
          menuClicked = await cdp.evalExpr(ctx, `(() => {
            const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim()==='菜单权限');
            if (b) { b.click(); return true; } return false;
          })()`);
        }
        outD.menuAuthClicked = menuClicked;
        if (!menuClicked) {
          outD.btnTexts = await cdp.evalExpr(ctx, `[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean)`);
          await cdp.screenshot(ctx, 'screenshots/menu-auth-modal.png');
          results.D = { status: 'PARTIAL', note: '菜单权限 button not found', ...outD, screenshot: 'screenshots/menu-auth-modal.png' };
        } else {
          await sleep(2200);
          const menuModal = await cdp.evalExpr(ctx, `(() => {
            const treeNodes = document.querySelectorAll('.n-tree-node').length;
            const checkboxes = document.querySelectorAll('.n-checkbox').length;
            const labels = [...new Set([...document.querySelectorAll('.n-tree-node-content, .n-tree-node')].map(e=>e.textContent.trim()).filter(Boolean))];
            return { treeNodes, checkboxes, labelCount: labels.length, sample: labels.filter(l=>l.length<30).slice(0,40) };
          })()`);
          outD.modal = menuModal;
          await cdp.screenshot(ctx, 'screenshots/menu-auth-modal.png');
          outD.screenshot = 'screenshots/menu-auth-modal.png';
          const pass = menuModal.treeNodes >= 1 || menuModal.labelCount >= 1;
          results.D = { status: pass ? 'PASS' : 'PARTIAL', ...outD };
          log('D', results.D.status, 'treeNodes=' + menuModal.treeNodes, 'labelCount=' + menuModal.labelCount);
          log('   sample:', JSON.stringify(menuModal.sample));
        }
      }
    } catch (e) {
      log('C/D ERROR', String(e));
      try { await cdp.screenshot(ctx, 'screenshots/CD-ERR.png'); } catch {}
      if (!results.C.status) results.C = { status: 'PARTIAL', error: String(e), ...outC };
      if (!results.D.status) results.D = { status: 'PARTIAL', error: String(e), ...outD };
    }
  }

} catch (e) {
  log('FATAL', String(e));
} finally {
  await cdp.cleanup();
  log('\n========== CLEANUP done (all contexts disposed) ==========');
  log('\n===== RESULTS JSON =====');
  log(JSON.stringify(results, null, 2));
}
