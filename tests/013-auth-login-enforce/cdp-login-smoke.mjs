#!/usr/bin/env node
// 013-auth-login-enforce — CDP browser login smoke (US1 / SC-001, D10)
// Drives the real base-web login UI in Edge (CDP 9229) against rev2 rust-api,
// captures the /auth/login + /auth/getUserInfo network round-trips, and asserts
// envelope/code/token(iss=rev2-admin)/redirect. Reuses the cdp.mjs patterns.
// Node 24 native global WebSocket — no npm install.
//
// usage: node cdp-login-smoke.mjs [userName] [password] [shotDir]
const [,, USER='Super', PASS='123456', SHOT_DIR='/mnt/d/AnewSpaces/x_Project/fork260509-rev2/tests/013-auth-login-enforce/screenshots'] = process.argv;
import fs from 'node:fs/promises';
const CDP='http://127.0.0.1:9229';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await fs.mkdir(SHOT_DIR,{recursive:true});

const tabs=await (await fetch(CDP+'/json/list')).json();
const tab=tabs.find(t=>t.type==='page'&&t.url.includes('21079'));
if(!tab){console.log('FAIL: no base-web :21079 tab. open one in Edge.');process.exit(2);}
const ws=new WebSocket(tab.webSocketDebuggerUrl);
let idc=0;const pending=new Map();
const reqs=new Map(),resps=new Map(),fin=new Set();
const send=(m,p={})=>new Promise((res,rej)=>{const id=++idc;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);
  if(m.id&&pending.has(m.id)){const x=pending.get(m.id);pending.delete(m.id);m.error?x.rej(new Error(JSON.stringify(m.error))):x.res(m.result);return;}
  if(m.method==='Network.requestWillBeSent'){const u=m.params.request.url;if(/auth\/login|getUserInfo|auth\/refreshToken|getUserList/.test(u))reqs.set(m.params.requestId,{url:u,method:m.params.request.method,body:m.params.request.postData});}
  if(m.method==='Network.responseReceived'){if(reqs.has(m.params.requestId))resps.set(m.params.requestId,{status:m.params.response.status,remoteIP:m.params.response.remoteIPAddress});}
  if(m.method==='Network.loadingFinished'||m.method==='Network.loadingFailed')fin.add(m.params.requestId);
});
await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true,allowUnsafeEvalBlockedByCSP:true});if(r.exceptionDetails)return{__err:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r.result.value;};
const shot=async name=>{try{const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${SHOT_DIR}/${name}.png`,Buffer.from(r.data,'base64'));console.log('  shot:',name);}catch(e){console.log('  shot-err',name,String(e).slice(0,80));}};

// clear auth storage + navigate fresh to /login
await ev(`Object.keys(localStorage).filter(k=>/token|userInfo/i.test(k)).forEach(k=>localStorage.removeItem(k));'ok'`);
const loaded=new Promise(res=>{const t=setTimeout(res,8000);ws.addEventListener('message',function h(e){const m=JSON.parse(e.data);if(m.method==='Page.loadEventFired'){clearTimeout(t);ws.removeEventListener('message',h);res();}});});
await send('Page.navigate',{url:'http://127.0.0.1:21079/login'});
await loaded; await sleep(2500);
console.log('LOGIN_URL:',await ev('location.href'));
await shot('01-login');
console.log('INPUTS:',JSON.stringify(await ev(`[...document.querySelectorAll('input')].map(i=>({type:i.type,ph:i.placeholder}))`)));
console.log('BUTTONS:',JSON.stringify(await ev(`[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean)`)));

// fill username + password (native setter -> vue v-model), then submit
const fill=await ev(`(()=>{
  function setV(el,v){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  const ins=[...document.querySelectorAll('input')];const pw=ins.find(i=>i.type==='password');const un=ins.find(i=>i!==pw);
  if(!un||!pw)return{ok:false,n:ins.length};
  setV(un,${JSON.stringify(USER)});setV(pw,${JSON.stringify(PASS)});return{ok:true,un:un.value,pwlen:pw.value.length};
})()`);
console.log('FILL:',JSON.stringify(fill));
await sleep(300);await shot('02-filled');
const click=await ev(`(()=>{const bs=[...document.querySelectorAll('button')];const re=/登\\s*录|登 录|登入|确\\s*认|确定|sign in|log ?in/i;let b=bs.find(x=>re.test(x.innerText))||bs.find(x=>x.type==='submit')||bs.find(x=>/primary/.test(x.className));if(!b)return{ok:false,bs:bs.map(x=>x.innerText.trim())};b.click();return{ok:true,clicked:b.innerText.trim()};})()`);
console.log('CLICK:',JSON.stringify(click));

// wait for login round-trip + redirect
for(let i=0;i<24;i++){await sleep(500);const u=await ev('location.href');if(u&&!/\/login/.test(u))break;}
await sleep(1500);
console.log('POST_LOGIN_URL:',await ev('location.href'));
console.log('POST_TITLE:',await ev('document.title'));
await shot('03-after-login');

// dump captured network for login + getUserInfo
async function bodyOf(id){try{const b=await send('Network.getResponseBody',{requestId:id});return b.body;}catch(e){return '(no body: '+String(e).slice(0,60)+')';}}
for(const [id,r] of reqs){
  const res=resps.get(id);
  console.log(`NET ${r.method} ${r.url} -> status ${res?.status} ip ${res?.remoteIP}`);
  if(/auth\/login|getUserInfo/.test(r.url)){
    if(r.body)console.log('   reqBody:',r.body.slice(0,200));
    const bd=await bodyOf(id);console.log('   respBody:',String(bd).slice(0,400));
  }
}
// token decode + rendered identity
console.log('TOKEN:',JSON.stringify(await ev(`(()=>{const k=Object.keys(localStorage).find(k=>/token/i.test(k)&&!/refresh/i.test(k));let v=k?localStorage.getItem(k):null;let iss=null,uid=null;try{let t=v;try{const o=JSON.parse(v);t=typeof o==='string'?o:o.token||v;}catch(e){}const p=JSON.parse(atob(t.split('.')[1]));iss=p.iss;uid=p.user_id;}catch(e){}return{key:k,iss,uid,rawHead:v&&String(v).slice(0,40)};})()`)));
console.log('BODY_HAS_SUPER:',await ev(`/Super|超级/.test(document.body.innerText)`));
ws.close();
