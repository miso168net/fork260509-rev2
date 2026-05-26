#!/usr/bin/env node
// CDP helper for rev2 mock-coverage audit
// Uses Node 24 native global WebSocket (W3C API).
//
// Usage:
//   node cdp.mjs tabs
//   node cdp.mjs eval <tabId> '<js-expr>'
//   node cdp.mjs navigate <tabId> <url>
//   node cdp.mjs capture <tabId> <output.json> [<duration-sec>=30] [<filter-regex>=.*]
//   node cdp.mjs cookies <tabId>
//   node cdp.mjs screenshot <tabId> <output.png>

import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs/promises';

const CDP_HOST = '127.0.0.1:9229';

async function listTabs() {
  const r = await fetch(`http://${CDP_HOST}/json`);
  return await r.json();
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', (e) => reject(new Error(`ws error: ${e?.message || 'unknown'}`)), { once: true });
      this.ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
          else resolve(msg.result);
        } else if (msg.method) {
          const handlers = this.eventHandlers.get(msg.method) || [];
          handlers.forEach((h) => h(msg.params));
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, []);
    this.eventHandlers.get(method).push(handler);
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function cmdTabs() {
  const tabs = await listTabs();
  console.log(JSON.stringify(tabs.filter(t => t.type === 'page').map(t => ({
    id: t.id, title: t.title, url: t.url,
  })), null, 2));
}

async function cmdEval(tabId, expr) {
  const tabs = await listTabs();
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) throw new Error(`tab ${tabId} not found`);
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const r = await client.send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    allowUnsafeEvalBlockedByCSP: true,
  });
  client.close();
  console.log(JSON.stringify(r, null, 2));
}

async function cmdNavigate(tabId, url) {
  const tabs = await listTabs();
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) throw new Error(`tab ${tabId} not found`);
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Page.navigate', { url });
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 8000);
    client.on('Page.loadEventFired', () => { clearTimeout(timer); resolve(); });
  });
  client.close();
  console.log(JSON.stringify({ ok: true, url }));
}

async function cmdCapture(tabId, outFile, durationSec = 30, filterRegex = '.*') {
  const tabs = await listTabs();
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) throw new Error(`tab ${tabId} not found`);
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Network.enable');
  const filter = new RegExp(filterRegex);
  const requests = new Map();
  const responses = new Map();
  const finished = new Set();

  client.on('Network.requestWillBeSent', (p) => {
    if (!filter.test(p.request.url)) return;
    requests.set(p.requestId, {
      requestId: p.requestId,
      method: p.request.method,
      url: p.request.url,
      postData: p.request.postData,
      headers: p.request.headers,
      type: p.type,
      timestamp: p.timestamp,
      documentURL: p.documentURL,
    });
  });
  client.on('Network.responseReceived', (p) => {
    if (!requests.has(p.requestId)) return;
    responses.set(p.requestId, {
      status: p.response.status,
      statusText: p.response.statusText,
      mimeType: p.response.mimeType,
      headers: p.response.headers,
      remoteIP: p.response.remoteIPAddress,
    });
  });
  client.on('Network.loadingFinished', (p) => finished.add(p.requestId));
  client.on('Network.loadingFailed', (p) => finished.add(p.requestId));

  await delay(durationSec * 1000);

  const bodies = new Map();
  for (const reqId of finished) {
    if (!responses.has(reqId)) continue;
    try {
      const r = await client.send('Network.getResponseBody', { requestId: reqId });
      bodies.set(reqId, { body: r.body, base64Encoded: r.base64Encoded });
    } catch (e) {
      bodies.set(reqId, { error: e.message });
    }
  }

  const records = [];
  for (const [id, req] of requests) {
    const res = responses.get(id);
    const body = bodies.get(id);
    records.push({
      requestId: id,
      method: req.method,
      url: req.url,
      type: req.type,
      requestHeaders: req.headers,
      requestBody: req.postData,
      response: res ? { status: res.status, statusText: res.statusText, mimeType: res.mimeType, headers: res.headers, remoteIP: res.remoteIP } : null,
      responseBody: body || null,
    });
  }
  await fs.writeFile(outFile, JSON.stringify({ tabId, capturedAt: new Date().toISOString(), count: records.length, records }, null, 2));
  client.close();
  console.log(JSON.stringify({ ok: true, file: outFile, count: records.length }));
}

async function cmdCookies(tabId) {
  const tabs = await listTabs();
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) throw new Error(`tab ${tabId} not found`);
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const r = await client.send('Network.getCookies');
  client.close();
  console.log(JSON.stringify(r, null, 2));
}

async function cmdScreenshot(tabId, outFile) {
  const tabs = await listTabs();
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) throw new Error(`tab ${tabId} not found`);
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  const r = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(outFile, Buffer.from(r.data, 'base64'));
  client.close();
  console.log(JSON.stringify({ ok: true, file: outFile, bytes: r.data.length }));
}

const [, , cmd, ...args] = process.argv;
try {
  switch (cmd) {
    case 'tabs': await cmdTabs(); break;
    case 'eval': await cmdEval(args[0], args[1]); break;
    case 'navigate': await cmdNavigate(args[0], args[1]); break;
    case 'capture': await cmdCapture(args[0], args[1], parseInt(args[2] || '30', 10), args[3] || '.*'); break;
    case 'cookies': await cmdCookies(args[0]); break;
    case 'screenshot': await cmdScreenshot(args[0], args[1]); break;
    default:
      console.error('unknown cmd:', cmd);
      console.error('commands: tabs | eval | navigate | capture | cookies | screenshot');
      process.exit(2);
  }
} catch (e) {
  console.error('ERR:', e.message);
  process.exit(1);
}
