// Shared by the Android emulator checks (tools/e2e-1014-emulator.mjs): adb, a small DevTools client for the app's
// WebView (Playwright cannot attach to a WebView), real input (taps, swipes, keys, the back gesture), and reconnecting
// after the app is restarted. Emulator only: the app must be a debug build with WebView debugging switched on in a
// scratch copy, and the emulator must be in airplane mode so nothing reaches the live server.
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const PKG = 'uk.co.thewavelength.app';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function kit({ adbPath = 'C:/Android/sdk/platform-tools/adb.exe', out, port = 9333 } = {}) {
  const adb = (...a) => execFileSync(adbPath, a, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  const k = { adb, page: null, dev: null, off: { x: 0, y: 0 } };
  if (adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').trim() !== '1') throw new Error('Turn airplane mode on first: nothing may reach the live server.');
  k.shot = (name) => { adb('shell', 'screencap', '-p', '/sdcard/wl.png'); adb('pull', '/sdcard/wl.png', path.join(out, name + '.png')); };
  k.focus = () => (adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=.*/) || [''])[0];
  // The app's window has the focus; the emulator's own "not responding" dialog is answered with Wait.
  k.appFocused = async () => { for (let i = 0; i < 12; i++) { const w = k.focus(); if (w.includes(PKG)) return true; if (/Not Responding/.test(w)) adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); await sleep(1500); } return false; };
  k.imeShown = () => /mInputShown=true|mIsInputViewShown=true|isInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method'));
  k.pid = () => adb('shell', 'pidof', PKG).trim();
  function client(wsUrl) {
    const ws = new WebSocket(wsUrl); let id = 0; const wait = {};
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } };
    const send = (method, params = {}) => new Promise((ok, no) => { const i = ++id; wait[i] = (d) => (d.error ? no(new Error(method + ': ' + d.error.message)) : ok(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
    return new Promise((ok, no) => { ws.onopen = () => ok({ send, close: () => ws.close() }); ws.onerror = () => no(new Error('WebSocket failed')); });
  }
  // Connect to the running app's WebView (after a start or a restart, the socket name follows the process id).
  k.connect = async () => {
    let C = null;
    for (let t = 0; t < 30 && !C; t++) {
      const pid = k.pid();
      if (pid) {
        try { adb('forward', '--remove', 'tcp:' + port); } catch { /* none */ }
        adb('forward', 'tcp:' + port, 'localabstract:webview_devtools_remote_' + pid);
        try {
          for (const tg of await fetch(`http://localhost:${port}/json`).then((r) => r.json())) {
            if (tg.type !== 'page' || !tg.url.startsWith('https://localhost')) continue;
            const c = await client(tg.webSocketDebuggerUrl);
            const r = await c.send('Runtime.evaluate', { expression: '!!document.querySelector("#app")', returnByValue: true });
            if (r.result.value) { C = c; break; } c.close();
          }
        } catch { /* not ready yet */ }
      }
      if (!C) await sleep(1000);
    }
    if (!C) throw new Error('No Wavelength page in the WebView');
    const page = {
      cdp: C,
      evaluate: async (fn, arg) => { const r = await C.send('Runtime.evaluate', { expression: `(${fn})(${arg === undefined ? '' : JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; },
      waitForFunction: async (fn, arg, { timeout = 10000 } = {}) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(150); } throw new Error('timeout: ' + String(fn).slice(0, 90)); },
      waitForSelector: (sel, o) => page.waitForFunction((s) => !!document.querySelector(s), sel, o),
      click: async (sel) => { await page.waitForSelector(sel); await page.evaluate((s) => document.querySelector(s).click(), sel); },
      reload: async () => { await C.send('Page.reload', {}); await sleep(2500); },
      close: () => C.close(),
    };
    if (k.page) try { k.page.close(); } catch { /* gone */ }
    k.page = page;
    k.dev = await page.evaluate(() => ({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight, native: !!(window.WLNative && window.WLNative.on) }));
    return page;
  };
  // Where the WebView sits on the screen: one real tap on a transparent cover that presses nothing.
  k.calibrate = async () => {
    await k.page.evaluate(() => { window.__calp = null; const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent'; d.addEventListener('pointerdown', (e) => { window.__calp = { x: e.clientX, y: e.clientY }; e.preventDefault(); e.stopPropagation(); }, true); d.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTimeout(() => d.remove(), 50); }, true); document.documentElement.appendChild(d); });
    await k.appFocused();
    const X = Math.round(k.dev.w * k.dev.dpr / 2), Y = Math.round(k.dev.h * k.dev.dpr / 3);
    adb('shell', 'input', 'tap', String(X), String(Y)); await sleep(1000);
    const p = await k.page.evaluate(() => window.__calp || null);
    if (!p) throw new Error('calibration tap not seen');
    k.off = { x: X - p.x * k.dev.dpr, y: Y - p.y * k.dev.dpr };
    return k.off;
  };
  k.scr = (x, y) => [String(Math.round(x * k.dev.dpr + k.off.x)), String(Math.round(y * k.dev.dpr + k.off.y))];
  k.tap = async (x, y) => { await k.appFocused(); adb('shell', 'input', 'tap', ...k.scr(x, y)); await sleep(500); };
  k.tapSel = async (sel) => { const b = await k.page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await k.tap(b.x, b.y); };
  k.swipe = async (a, b, ms = 400) => { await k.appFocused(); adb('shell', 'input', 'swipe', ...k.scr(a.x, a.y), ...k.scr(b.x, b.y), String(ms)); await sleep(600); };
  k.backKey = async () => { await k.appFocused(); adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await sleep(900); };
  k.backGesture = async () => { await k.appFocused(); const W = k.dev.w * k.dev.dpr, H = k.dev.h * k.dev.dpr; adb('shell', 'input', 'swipe', '2', String(Math.round(H / 2)), String(Math.round(W * 0.45)), String(Math.round(H / 2)), '250'); await sleep(1000); };
  k.type = async (text) => { adb('shell', 'input', 'text', text.replace(/ /g, '%s')); await sleep(600); };
  k.start = () => { adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1'); };
  return k;
}
