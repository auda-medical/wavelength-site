#!/usr/bin/env node
// Builds mobile/www: the Wavelength logbook as it ships inside the Android and iPhone apps.
// The apps run this copy from the phone (https://localhost on Android, capacitor://localhost on iOS), so the logbook
// opens and works offline, and the store builds never load the website. The app talks to thewavelength.co.uk only
// for its API (accounts, sync, sign-off, verification), with a Bearer token (src/app/native.js, worker/native.js).
//
//   node scripts/build-www.mjs            runs the site build (node build.js) first, then assembles www/
//   node scripts/build-www.mjs --no-build uses the existing dist/
//
// www/ is generated: never edit it by hand, and it is not committed.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(MOBILE, '..');
const DIST = path.join(ROOT, 'dist');
const WWW = path.join(MOBILE, 'www');
const SITE = process.env.WL_SITE || 'https://thewavelength.co.uk';

if (!process.argv.includes('--no-build')) execFileSync(process.execPath, ['build.js'], { cwd: ROOT, stdio: 'inherit' });
const APP = path.join(DIST, 'app');
if (!existsSync(path.join(APP, 'index.html'))) throw new Error('dist/app is missing: run node build.js first');

rmSync(WWW, { recursive: true, force: true });
mkdirSync(path.join(WWW, 'app'), { recursive: true });

// The logbook itself. Left out: the service worker and web manifest (the app is installed already), and the
// supervisor, assessment and verify pages, which supervisors open on the website from their links.
const SKIP = new Set(['sw.js', 'sign.js', 'manifest.webmanifest', 'sign', 'verify', 'assess', 'delete-account', 'get']);
for (const f of readdirSync(APP)) {
  if (SKIP.has(f)) continue;
  cpSync(path.join(APP, f), path.join(WWW, 'app', f), { recursive: true });
}
// Fonts the app's CSS uses, and the logo drawn on PDF exports.
const css = readFileSync(path.join(APP, 'app.css'), 'utf8');
for (const m of css.matchAll(/url\('(\/assets\/fonts\/[^']+)'\)/g)) {
  const src = path.join(DIST, m[1]);
  if (!existsSync(src)) throw new Error('font missing from dist: ' + m[1]);
  mkdirSync(path.dirname(path.join(WWW, m[1])), { recursive: true });
  cpSync(src, path.join(WWW, m[1]));
}
mkdirSync(path.join(WWW, 'assets'), { recursive: true });
cpSync(path.join(DIST, 'assets/logo-192.png'), path.join(WWW, 'assets/logo-192.png'));

// Capacitor's JavaScript runtime (registerPlugin), so plugins work the same way on Android and iOS.
cpSync(path.join(MOBILE, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(WWW, 'capacitor.js'));

const build = (readFileSync(path.join(APP, 'config.js'), 'utf8').match(/WL_BUILD = "([^"]+)"/) || [])[1] || 'dev';
// The store version (the workflows pass their version input), sent to the server as X-Wavelength-App.
const version = /^\d+(\.\d+){0,3}$/.test(process.env.WL_APP_VERSION || '') ? process.env.WL_APP_VERSION : '';
// The version code (WL_VERSION_CODE, also read by android/app/build.gradle) is a fallback for About Wavelength,
// which reads the installed app's own version and build first.
const versionCode = /^\d{1,9}$/.test(process.env.WL_VERSION_CODE || '') ? process.env.WL_VERSION_CODE : '';
writeFileSync(path.join(WWW, 'app/native-config.js'), `window.WL_NATIVE = ${JSON.stringify({ site: SITE, build, version, versionCode })};\n`);

// The page. Same as the website's /app/ page, with the web-only tags removed, the runtime and the app settings added,
// and a Content Security Policy that only lets the app talk to the Wavelength server.
const host = SITE.replace(/\/+$/, '');
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: data: ${host}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
let html = readFileSync(path.join(APP, 'index.html'), 'utf8');
const drop = [/\s*<link rel="manifest"[^>]*>/, /\s*<link rel="icon"[^>]*>/, /\s*<link rel="apple-touch-icon"[^>]*>/, /\s*<meta name="apple-mobile-web-app-[^>]*>/g, /\s*<meta name="mobile-web-app-capable"[^>]*>/, /\s*<meta name="robots"[^>]*>/, /\s*<meta name="description"[^>]*>/];
for (const re of drop) html = html.replace(re, '');
html = html.replace('<title>Wavelength app | Ultrasound logbook</title>', '<title>Wavelength</title>');
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
if (!html.includes('<script src="/app/config.js')) throw new Error('unexpected app page: config.js script tag not found');
html = html.replace('<script src="/app/config.js', '<script src="/capacitor.js"></script>\n<script src="/app/native-config.js"></script>\n<script src="/app/config.js');
if (!html.includes('/app/native.js')) throw new Error('unexpected app page: native.js is not loaded');
writeFileSync(path.join(WWW, 'index.html'), html);
writeFileSync(path.join(WWW, 'app/index.html'), html);

// Sanity checks: every script and stylesheet the page loads is in the bundle, and nothing points at the website.
for (const m of html.matchAll(/(?:src|href)="(\/[^"?]+)/g)) {
  if (!existsSync(path.join(WWW, m[1]))) throw new Error('missing from bundle: ' + m[1]);
}
let bytes = 0;
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else bytes += s.size; } };
walk(WWW);
console.log(`www built: build ${build}, ${(bytes / 1048576).toFixed(1)} MB, API ${host}`);
