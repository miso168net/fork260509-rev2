// Reusable CDP client over the BROWSER-level WS, using node v24 built-in WebSocket.
// Isolated browser contexts (incognito-like) so we never disturb the user's tab.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const BROWSER_WS = execSync(
  `curl -s http://127.0.0.1:9229/json/version | python3 -c "import sys,json;print(json.load(sys.stdin)['webSocketDebuggerUrl'])"`
).toString().trim();

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export class CDP {
  constructor() {
    this.ws = null;
    this.id = 0;
    this.pending = new Map();           // id -> {resolve, reject}
    this.eventWaiters = [];             // {method, sessionId, resolve}
    this.contexts = [];                 // {browserContextId, targetId, sessionId}
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(BROWSER_WS);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('WS error: ' + (e.message || 'unknown')));
      this.ws.onclose = (e) => {
        for (const { reject } of this.pending.values()) reject(new Error('WS closed code=' + e.code));
        this.pending.clear();
      };
      this.ws.onmessage = (ev) => this._onMessage(ev.data);
    });
  }

  _onMessage(data) {
    const msg = JSON.parse(data);
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    // event
    if (msg.method) {
      for (let i = this.eventWaiters.length - 1; i >= 0; i--) {
        const w = this.eventWaiters[i];
        if (w.method === msg.method && (w.sessionId === undefined || w.sessionId === msg.sessionId)) {
          this.eventWaiters.splice(i, 1);
          w.resolve(msg.params);
        }
      }
    }
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  waitEvent(method, sessionId, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const w = { method, sessionId, resolve };
      this.eventWaiters.push(w);
      setTimeout(() => {
        const idx = this.eventWaiters.indexOf(w);
        if (idx !== -1) { this.eventWaiters.splice(idx, 1); resolve(null); } // resolve null on timeout, don't hard-fail
      }, timeoutMs);
    });
  }

  // Create isolated context + a target/page in it, attach, enable domains.
  async newContextPage() {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: false });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Page.enable', {}, sessionId);
    await this.send('Runtime.enable', {}, sessionId);
    const ctx = { browserContextId, targetId, sessionId };
    this.contexts.push(ctx);
    return ctx;
  }

  async navigate(ctx, url, mountMs = 2500) {
    const loaded = this.waitEvent('Page.loadEventFired', ctx.sessionId, 20000);
    await this.send('Page.navigate', { url }, ctx.sessionId);
    await loaded;
    await sleep(mountMs);
  }

  async evalExpr(ctx, expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise
    }, ctx.sessionId);
    if (res.exceptionDetails) {
      throw new Error('eval exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  async href(ctx) {
    return this.evalExpr(ctx, 'location.href');
  }

  // `p` may be absolute or relative; relative paths resolve against THIS script's
  // dir (so callers can pass e.g. 'screenshots/x.png' and it lands under
  // tests/022-manage-button-auth/screenshots/ regardless of CWD). Dir is auto-created.
  async screenshot(ctx, p) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' }, ctx.sessionId);
    const abs = path.isAbsolute(p) ? p : path.join(SCRIPT_DIR, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(res.data, 'base64'));
    return abs;
  }

  // Quick-login by clicking the button whose trimmed textContent === label.
  async login(ctx, label) {
    await this.navigate(ctx, 'http://127.0.0.1:21080/login', 3000);
    const clicked = await this.evalExpr(ctx, `(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => x.textContent.trim() === ${JSON.stringify(label)});
      if (b) { b.click(); return true; }
      return false;
    })()`);
    if (!clicked) {
      const btnTexts = await this.evalExpr(ctx, `[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean)`);
      return { ok: false, reason: 'login button not found', btnTexts };
    }
    // poll href until no longer /login
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const h = await this.href(ctx);
      if (!h.includes('/login')) return { ok: true, href: h };
    }
    const err = await this.evalExpr(ctx, `(() => {
      const el = document.querySelector('.n-message, .n-form-item-feedback, [class*="error"]');
      return el ? el.textContent.trim() : null;
    })()`);
    const btnTexts = await this.evalExpr(ctx, `[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean)`);
    return { ok: false, reason: 'did not redirect from /login', err, btnTexts };
  }

  async cleanup() {
    for (const ctx of this.contexts) {
      try { await this.send('Target.closeTarget', { targetId: ctx.targetId }); } catch {}
      try { await this.send('Target.disposeBrowserContext', { browserContextId: ctx.browserContextId }); } catch {}
    }
    this.contexts = [];
    try { this.ws.close(); } catch {}
  }
}
