// Store apps: the WebView origin must never change.
// The logbook, its images and clips, the sync queue and the cached account live in the WebView's storage (IndexedDB
// and localStorage), which belongs to the app's origin: https://localhost on Android and capacitor://localhost on iOS.
// Changing server.androidScheme, server.iosScheme or server.hostname in mobile/capacitor.config.json gives the
// WebView a new, empty storage area after the next store update. To the learner that looks like total loss of their
// logbook and images: the written record would come back from the server, but unsynced work and every image would
// stay stranded in the old origin's storage. server.url would make the app load a website instead of the bundle.
// If an origin change is ever truly needed, it needs a migration plan first (see the local data migration section of
// the mobile release plan), not an edit here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../mobile/capacitor.config.json', import.meta.url), 'utf8'));
const server = config.server || {};

test('Android keeps the https://localhost origin', () => {
  assert.equal(server.androidScheme, 'https');
});

test('iOS keeps the capacitor://localhost origin (iosScheme left at its default)', () => {
  // Not set today, so Capacitor uses "capacitor". Setting it, even to the default spelled out, must be a deliberate
  // change to this test.
  assert.equal(server.iosScheme, undefined);
});

test('the hostname stays localhost', () => {
  // Not set today, so Capacitor uses "localhost".
  assert.equal(server.hostname, undefined);
  assert.equal(server.hostname ?? 'localhost', 'localhost');
});

test('the app loads its bundled logbook, never a server.url', () => {
  assert.equal(server.url, undefined);
  assert.equal(config.webDir, 'www');
});
