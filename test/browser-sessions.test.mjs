import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { SessionStore, validateSession } from '../lib/presence.mjs';
import { resolveActivity } from '../lib/activity.mjs';
import { validateConfig } from '../lib/settings.mjs';
import { loadUserSettings, saveSettings } from '../lib/storage.mjs';
import { createBridge, ROOT } from '../server.mjs';

const edge = '11111111-1111-4111-8111-111111111111';
const chrome = '22222222-2222-4222-8222-222222222222';
const sample = { tabId: 7, source: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Shared title', channel: 'Example', position: 10, duration: 200 };
const config = validateConfig({});

test('same numeric tab in two browsers has independent priority, pause and close state', () => {
  const store = new SessionStore();
  store.update({ ...sample, browserId: edge }, 100000);
  store.update({ ...sample, browserId: chrome }, 101000);
  assert.equal(store.sessions.size, 2);
  assert.equal(store.select(config, 101000).sessionId, `${chrome}:7`);
  store.update({ ...sample, browserId: edge }, 102000);
  assert.equal(store.select(config, 102000).sessionId, `${chrome}:7`);
  store.update({ ...sample, browserId: chrome, paused: true }, 103000);
  assert.equal(store.select(config, 103000).sessionId, `${edge}:7`);
  store.update({ tabId: 7, browserId: chrome, closed: true }, 104000);
  assert.equal(store.sessions.size, 1);
  assert.equal(store.select(config, 104000).sessionId, `${edge}:7`);
  assert.equal(store.select(config, 198000), null);
});

test('pins do not select another browser after a pinned tab closes; legacy messages are isolated', () => {
  const store = new SessionStore();
  for (const browserId of [edge, chrome, undefined]) store.update({ ...sample, browserId }, 100000);
  const pinned = validateConfig({ pinnedSessionId: `${edge}:7` });
  assert.equal(resolveActivity(store, pinned, 0, 100001).current.sessionId, `${edge}:7`);
  store.update({ tabId: 7, closed: true });
  assert.equal(store.sessions.size, 2);
  assert.equal(resolveActivity(store, pinned, 0, 100002).current.sessionId, `${edge}:7`);
  store.update({ tabId: 7, browserId: edge, closed: true });
  assert.equal(resolveActivity(store, pinned, 0, 100003).current, null);
  assert.equal(resolveActivity(store, config, 0, 100003).current.sessionId, `${chrome}:7`);
  assert.equal(resolveActivity(store, validateConfig({ pinnedTabId: 7 }), 0, 100003).current, null);
});

test('pin migration and saved profile reload preserve IDs, keys, presets and exact browser selection', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-browser-'));
  try {
    const saved = { applicationId: '123456789012345678', token: 'ab'.repeat(32), overlayKey: 'cd'.repeat(32), language: 'ko', pinnedTabId: 7,
      presets: [{ id: 'test-preset', name: 'Keep me', manual: { title: 'Saved activity' } }] };
    saveSettings(dataDir, saved);
    const migrated = loadUserSettings(ROOT, dataDir);
    assert.equal(migrated.pinnedSessionId, 'legacy:7');
    assert.equal(migrated.pinnedTabId, undefined);
    const pinned = validateConfig({ pinnedSessionId: `${chrome}:7` }, migrated);
    saveSettings(dataDir, pinned);
    const reloaded = loadUserSettings(ROOT, dataDir);
    assert.equal(reloaded.pinnedSessionId, `${chrome}:7`);
    for (const key of ['applicationId', 'token', 'overlayKey', 'language']) assert.equal(reloaded[key], saved[key]);
    assert.deepEqual(reloaded.presets, migrated.presets);
    assert.equal(validateConfig({ enabled: false }, reloaded).pinnedSessionId, `${chrome}:7`);
    assert.equal(validateConfig({ pinnedSessionId: null }, reloaded).pinnedSessionId, null);
    assert.equal(validateConfig({ pinnedTabId: null }, reloaded).pinnedSessionId, null);
  } finally {
    assert.ok(dataDir.startsWith(path.join(os.tmpdir(), 'presence-browser-')));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('malformed browser and pin IDs are rejected even for close messages', () => {
  for (const browserId of ['', null, {}, 'legacy', edge + ':8', 'a'.repeat(200)]) {
    assert.throws(() => validateSession({ ...sample, browserId }));
    assert.throws(() => validateSession({ tabId: 7, browserId, closed: true }));
  }
  for (const pinnedSessionId of ['', 7, {}, `${edge}:NaN`, `${edge}:-1`, `${edge}:01`, `${edge}:9007199254740992`, `${edge}:7:8`, 'legacy:', 'legacy:undefined']) {
    assert.throws(() => validateConfig({ pinnedSessionId }));
  }
  assert.equal(validateSession({ ...sample, browserId: edge, sessionId: `${chrome}:7` }).sessionId, `${edge}:7`);
});

const relaySource = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
function worker(storage = {}, userAgent = 'Chrome/120', options = {}) {
  const handlers = {}, sent = [], badges = [];
  let writes = 0, fail = options.failOnce;
  const event = key => ({ addListener: fn => handlers[key] = fn });
  const api = {
    runtime: { onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup') },
    storage: { local: { get: async () => { if (fail) { fail = false; throw Error('Storage unavailable'); } return { ...storage }; }, set: async value => { writes++; Object.assign(storage, value); } } },
    action: { setBadgeText: async value => badges.push(value.text), setBadgeBackgroundColor: async () => {}, onClicked: event('click') },
    tabs: { onRemoved: event('removed'), onUpdated: event('updated'), query: async () => [{ id: 7 }], sendMessage: async () => { throw Error('No receiver'); } },
    alarms: { clear: async () => {}, create: async () => {}, onAlarm: event('alarm') }
  };
  vm.runInNewContext(relaySource, { chrome: api, crypto: { randomUUID }, navigator: { userAgent }, URL, importScripts() {}, BRIDGE_TOKEN: 'test-only', AbortSignal,
    fetch: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
  const send = session => new Promise(resolve => handlers.message({ kind: 'media-presence', session }, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', frameId: 0, tab: { id: 7, active: true } }, resolve));
  return { handlers, sent, badges, send, writes: () => writes };
}

test('extension IDs differ across profiles, survive worker restarts, and override content-script IDs', async () => {
  const disk = {}, a = worker(disk, 'Chrome/120 Edg/120'), b = worker();
  await Promise.all([a.send({ ...sample, browserId: chrome }), a.send(sample), b.send(sample)]);
  assert.equal(a.writes(), 1);
  assert.equal(a.sent[0].browserId, a.sent[1].browserId);
  assert.notEqual(a.sent[0].browserId, b.sent[0].browserId);
  assert.equal(a.sent[0].browser, 'edge');
  assert.equal(b.sent[0].browser, 'chrome');
  const restarted = worker(disk, 'Chrome/120 Edg/120');
  await restarted.send(sample);
  assert.equal(restarted.sent[0].browserId, a.sent[0].browserId);
  assert.equal(restarted.writes(), 0);
  await restarted.handlers.removed(7);
  await restarted.handlers.updated(7, { status: 'loading' });
  await restarted.handlers.startup();
  assert.equal(restarted.sent.length, 4);
  for (const message of restarted.sent.slice(1)) {
    assert.equal(message.closed, true);
    assert.equal(message.browserId, disk.browserId);
  }
});

test('storage failure never sends a shared legacy identity and a later event retries', async () => {
  const runtime = worker({}, 'Chrome/120', { failOnce: true });
  await runtime.send(sample);
  assert.equal(runtime.sent.length, 0);
  assert.equal(runtime.badges.at(-1), '!');
  await runtime.send(sample);
  assert.equal(runtime.sent.length, 1);
  assert.ok(runtime.sent[0].browserId);
  assert.equal(runtime.badges.at(-1), '');
});

test('HTTP status exposes unique rows and pins, pause and close preserve the correct Discord activity', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-browser-http-'));
  const rpc = new class extends EventEmitter { ready = true; sent = []; async setActivity(activity) { this.sent.push(activity); } close() {} }();
  let now = 100000;
  const token = 'ab'.repeat(32);
  const bridge = createBridge({ dataDir, port: 49857, rpc, clock: () => now, config: { token, applicationId: '123456789012345678' } });
  try {
    await bridge.start();
    const base = `http://127.0.0.1:${bridge.server.address().port}`;
    const request = async (endpoint, body) => {
      const response = await fetch(base + '/api/' + endpoint, { method: body ? 'POST' : 'GET', headers: { 'X-Bridge-Token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.equal(response.status, 200); return response.json();
    };
    await request('session', { ...sample, title: 'Edge activity', browserId: edge, browser: 'edge' });
    await request('session', { ...sample, title: 'Chrome activity', browserId: chrome, browser: 'chrome' });
    const status = await request('status');
    assert.equal(status.sessions.length, 2);
    assert.equal(new Set(status.sessions.map(s => s.sessionId)).size, 2);
    assert.deepEqual(status.sessions.map(s => s.browser), ['edge', 'chrome']);
    now += 4000; await request('config', { pinnedSessionId: `${edge}:7` });
    assert.equal(rpc.sent.at(-1).details, 'Edge activity');
    await request('session', { ...sample, browserId: chrome, paused: true });
    now += 4000; await bridge.tick();
    assert.equal(rpc.sent.at(-1).details, 'Edge activity');
    await request('session', { tabId: 7, browserId: edge, closed: true });
    now += 4000; await bridge.tick();
    assert.equal(rpc.sent.at(-1), null);
    assert.equal((await request('status')).sessions.length, 1);
  } finally {
    await bridge.shutdown();
    assert.ok(dataDir.startsWith(path.join(os.tmpdir(), 'presence-browser-http-')));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
