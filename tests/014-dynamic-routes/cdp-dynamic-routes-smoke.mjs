#!/usr/bin/env node
// 014-dynamic-routes — CDP browser smoke (US1 / SC-001, D8)
// Drives real base-web (dynamic auth route mode) in Edge (CDP 9229) against rev2
// rust-api. Proves: (a) getConstantRoutes fires on reload (login page builds),
// (b) login as Super → sidebar has 首页 + 系统管理 (full), (c) login as User →
// sidebar has ONLY 首页 (no 系统管理 = menu deny), (d) getUserRoutes hits rust-api
// and the two roles get different route trees.
// Node 24 native global WebSocket — no npm install. Reuses 013 cdp patterns.
//
// usage: node cdp-dynamic-routes-smoke.mjs
import fs from 'node:fs/promises';
const CDP = 'http://127.0.0.1:9229';
const APP = 'http://127.0.0.1:21079';
const SHOT_DIR = '/mnt/d/AnewSpaces/x_Project/fork260509-rev2/tests/014-dynamic-routes/screenshots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await fs.mkdir(SHOT_DIR, { recursive: true });

// ---- browser-level ws: create a fresh tab ----
const ver = await (await fetch(CDP + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
let bidc = 0; const bpending = new Map();
const bsend = (m, p = {}) => new Promise((res, rej) => { const id = ++bidc; bpending.set(id, { res, rej }); bws.send(JSON.stringify({ id, method: m, params: p })); });
bws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && bpending.has(m.id)) { const x = bpending.get(m.id); bpending.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); } });
await new Promise((res, rej) => { bws.addEventListener('open', res); bws.addEventListener('error', rej); });
const { targetId } = await bsend('Target.createTarget', { url: APP + '/login' });
await sleep(500);
const tabs = await (await fetch(CDP + '/json/list')).json();
const tab = tabs.find(t => t.id === targetId) || tabs.find(t => t.type === 'page' && t.url.includes('21079'));
if (!tab) { console.log('FAIL: tab not found'); process.exit(2); }

// ---- page-level ws ----
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let idc = 0; const pending = new Map();
const reqs = new Map(), resps = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const x = pending.get(m.id); pending.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); return; }
  if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (/route\/getConstantRoutes|route\/getUserRoutes|route\/isRouteExist|auth\/login/.test(u)) reqs.set(m.params.requestId, { url: u, method: m.params.request.method }); }
  if (m.method === 'Network.responseReceived') { if (reqs.has(m.params.requestId)) resps.set(m.params.requestId, { status: m.params.response.status, remoteIP: m.params.response.remoteIPAddress }); }
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlockedByCSP: true }); if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text }; return r.result.value; };
const shot = async name => { try { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(`${SHOT_DIR}/${name}.png`, Buffer.from(r.data, 'base64')); console.log('  shot:', name); } catch (e) { console.log('  shot-err', name); } };
const navLogin = async () => {
  await ev(`Object.keys(localStorage).forEach(k=>{if(/token|userInfo/i.test(k))localStorage.removeItem(k)});'ok'`);
  const loaded = new Promise(res => { const t = setTimeout(res, 8000); ws.addEventListener('message', function h(e) { const m = JSON.parse(e.data); if (m.method === 'Page.loadEventFired') { clearTimeout(t); ws.removeEventListener('message', h); res(); } }); });
  await send('Page.navigate', { url: APP + '/login' });
  await loaded; await sleep(2500);
};
const login = async (USER, PASS) => {
  await ev(`(()=>{function setV(el,v){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}const ins=[...document.querySelectorAll('input')];const pw=ins.find(i=>i.type==='password');const un=ins.find(i=>i!==pw);if(un&&pw){setV(un,${JSON.stringify(USER)});setV(pw,${JSON.stringify(PASS)});}return ins.length;})()`);
  await sleep(300);
  await ev(`(()=>{const bs=[...document.querySelectorAll('button')];const re=/登\\s*录|登入|确\\s*认|sign in|log ?in/i;const b=bs.find(x=>re.test(x.innerText))||bs.find(x=>x.type==='submit')||bs.find(x=>/primary/.test(x.className));if(b)b.click();return b?b.innerText.trim():null;})()`);
  for (let i = 0; i < 30; i++) { await sleep(500); const u = await ev('location.href'); if (u && !/\/login/.test(u)) break; }
  await sleep(2000);
};
const sidebar = async () => ev(`(()=>{
  const txt = document.body.innerText;
  // menu titles base-web renders from i18n: route.home=首页 / route.manage=系统管理
  return { hasHome: /首页/.test(txt), hasManage: /系统管理/.test(txt),
           hasUser: /用户管理/.test(txt), hasRole: /角色管理/.test(txt), hasMenuMgmt: /菜单管理/.test(txt) };
})()`);

const result = { constantFired: false, super: null, user: null, net: [] };

console.log('════════ reload → login page (getConstantRoutes 觸發) ════════');
await navLogin();
console.log('LOGIN_URL:', await ev('location.href'));
await shot('01-login');

console.log('════════ login Super ════════');
await login('Super', '123456');
console.log('POST_LOGIN_URL:', await ev('location.href'));
await sleep(1000);
await shot('02-super-dashboard');
result.super = await sidebar();
console.log('SUPER sidebar:', JSON.stringify(result.super));

console.log('════════ logout → login User ════════');
await navLogin();
await login('User', '123456');
console.log('POST_LOGIN_URL:', await ev('location.href'));
await sleep(1000);
await shot('03-user-dashboard');
result.user = await sidebar();
console.log('USER sidebar:', JSON.stringify(result.user));

console.log('════════ captured network ════════');
for (const [id, r] of reqs) {
  const res = resps.get(id);
  const line = `NET ${r.method} ${r.url} -> ${res?.status} ip ${res?.remoteIP}`;
  console.log(line); result.net.push(line);
  if (/getConstantRoutes/.test(r.url)) result.constantFired = true;
}

// ---- assertions ----
console.log('\n════════ ASSERTIONS ════════');
const A = [];
A.push(['getConstantRoutes fired', result.constantFired]);
A.push(['Super sees 首页', result.super?.hasHome]);
A.push(['Super sees 系统管理', result.super?.hasManage]);
A.push(['User sees 首页', result.user?.hasHome]);
A.push(['User does NOT see 系统管理 (menu deny)', result.user && !result.user.hasManage]);
// dev base-web 走 vite proxy(:21079 → rust-api:21081),故 browser-observed remoteIP=21079;
// getUserRoutes 有觸發且 200 + 兩角色側邊欄不同 = 後端 enforce 過濾的端到端證明。
A.push(['getUserRoutes fired (200)', result.net.some(l => /getUserRoutes/.test(l) && /-> 200/.test(l))]);
A.push(['Super≠User sidebar (role-filtered)', result.super?.hasManage === true && result.user?.hasManage === false]);
let pass = true;
for (const [name, ok] of A) { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) pass = false; }
console.log(`\n${pass ? '✅ ALL PASS' : '❌ SOME FAILED'}`);

ws.close(); bws.close();
process.exit(pass ? 0 : 1);
