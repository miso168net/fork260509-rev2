#!/usr/bin/env node
// Orchestrator: connects to a CDP tab, enables Network, performs a sequence of
// actions (eval / navigate / sleep / screenshot), then dumps captured network
// records (request + response + body) to a JSON file.
//
// Usage:
//   node flow.mjs <tabId> <outFile.json> <stepsFile.json> [<urlFilter-regex>]

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
  close() { try { this.ws?.close(); } catch {} }
}

const [, , tabId, outFile, stepsFile, urlFilterRegex = '.*'] = process.argv;
if (!tabId || !outFile || !stepsFile) {
  console.error('Usage: node flow.mjs <tabId> <outFile.json> <stepsFile.json> [<urlFilter-regex>]');
  process.exit(2);
}

const stepsJson = await fs.readFile(stepsFile, 'utf8');
const steps = JSON.parse(stepsJson);

const tabs = await listTabs();
const tab = tabs.find(t => t.id === tabId);
if (!tab) { console.error('tab not found:', tabId); process.exit(1); }

const client = new CDPClient(tab.webSocketDebuggerUrl);
await client.connect();
await client.send('Network.enable');
await client.send('Page.enable');
await client.send('Runtime.enable');

const filter = new RegExp(urlFilterRegex);
const requests = new Map();
const responses = new Map();
const finished = new Set();
const stepLog = [];

client.on('Network.requestWillBeSent', (p) => {
  if (!filter.test(p.request.url)) return;
  requests.set(p.requestId, {
    requestId: p.requestId,
    method: p.request.method,
    url: p.request.url,
    postData: p.request.postData,
    requestHeaders: p.request.headers,
    type: p.type,
    timestamp: p.timestamp,
    wallTime: p.wallTime,
    initiator: p.initiator,
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
const bodies = new Map();
client.on('Network.loadingFinished', async (p) => {
  finished.add(p.requestId);
  if (!responses.has(p.requestId)) return;
  // immediate body fetch — getResponseBody only works briefly after finish
  try {
    const r = await client.send('Network.getResponseBody', { requestId: p.requestId });
    bodies.set(p.requestId, { body: r.body, base64Encoded: r.base64Encoded });
  } catch (e) {
    bodies.set(p.requestId, { error: e.message });
  }
});
client.on('Network.loadingFailed', (p) => finished.add(p.requestId));

function logStep(kind, detail) {
  const entry = { ts: new Date().toISOString(), kind, ...detail };
  stepLog.push(entry);
  console.error(`[step] ${kind} ${JSON.stringify(detail).slice(0, 160)}`);
}

for (const step of steps) {
  if (step.kind === 'sleep') {
    logStep('sleep', { ms: step.ms });
    await delay(step.ms);
  } else if (step.kind === 'eval') {
    try {
      const r = await client.send('Runtime.evaluate', {
        expression: step.expr,
        returnByValue: true,
        awaitPromise: true,
        allowUnsafeEvalBlockedByCSP: true,
      });
      logStep('eval', { note: step.note || '', value: r?.result?.value, exceptionDetails: r?.exceptionDetails ? String(r.exceptionDetails.text) : undefined });
    } catch (e) {
      logStep('eval-error', { note: step.note || '', err: e.message });
    }
  } else if (step.kind === 'navigate') {
    await client.send('Page.navigate', { url: step.url });
    logStep('navigate', { url: step.url });
    // wait a bit for load
    await delay(step.waitMs || 3000);
  } else if (step.kind === 'screenshot') {
    try {
      const r = await client.send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(step.file, Buffer.from(r.data, 'base64'));
      logStep('screenshot', { file: step.file, bytes: r.data.length });
    } catch (e) {
      logStep('screenshot-error', { file: step.file, err: e.message });
    }
  } else if (step.kind === 'log') {
    logStep('log', { msg: step.msg });
  } else {
    logStep('unknown-step', { step });
  }
}

// final sleep to let last requests settle (bodies are already collected on-the-fly)
await delay(2000);

const records = [];
for (const [id, req] of requests) {
  const res = responses.get(id);
  const body = bodies.get(id);
  records.push({
    requestId: id,
    method: req.method,
    url: req.url,
    type: req.type,
    wallTime: req.wallTime,
    requestHeaders: req.requestHeaders,
    requestBody: req.postData,
    response: res || null,
    responseBody: body || null,
    initiatorType: req.initiator?.type,
  });
}

await fs.writeFile(outFile, JSON.stringify({
  tabId,
  capturedAt: new Date().toISOString(),
  stepCount: steps.length,
  stepLog,
  recordCount: records.length,
  records,
}, null, 2));

client.close();
console.log(JSON.stringify({ ok: true, outFile, records: records.length, steps: steps.length }));
