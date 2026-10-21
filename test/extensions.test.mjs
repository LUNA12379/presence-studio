import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ExtensionRegistry, parseExtensionReport } from '../lib/extensions.mjs';
import { STALE_MS } from '../lib/presence.mjs';
import { createBridge, ROOT } from '../server.mjs';

const edge = '11111111-1111-4111-8111-111111111111';
const chrome = '22222222-2222-4222-8222-222222222222';
const report = (browserId, extensionVersion, browser = 'edge') => parseExtensionReport({ browserId, extensionVersion, browser });

test('each browser is checked against the required extension version, not the app version', () => {
  const registry = new ExtensionRegistry('1.3.0');
  registry.update(report(edge, '1.2.0'), 100000);
  registry.update(report(chrome, '1.3.0', 'chrome'), 100001);
  assert.deepEqual(registry.status(100002).clients.map(c => c.state), ['update-extension', 'current']);
  assert.equal(registry.status(100002).needsAttention, true);
  registry.update(report(edge, '1.3.0'), 100003);
  assert.equal(registry.status(100004).needsAttention, false);
  registry.update(report(chrome, '1.4.0', 'chrome'), 100005);
  assert.equal(registry.status(100006).clients[1].state, 'update-app');
});

test('Chrome manifest version components compare numerically and omitted components are zero', () => {
  const registry = new ExtensionRegistry('1.10.0');
  for (const [version, state] of [['1.9.65535.65535', 'update-extension'], ['1.10', 'current'], ['1.10.0.0', 'current'], ['1.10.0.1', 'update-app'], ['2', 'update-app']]) {
    registry.update(report(edge, version), 100);
    assert.equal(registry.status(100).clients[0].state, state, version);
  }
});

test('missing legacy versions are unknown and disconnected profiles expire without a false update warning', () => {
  const registry = new ExtensionRegistry('1.3.0');
  assert.deepEqual(registry.status(100).clients, []);
  assert.equal(registry.status(100).needsAttention, false);
  registry.update(parseExtensionReport({ tabId: 7 }), 100);
  registry.update(report(edge, undefined), 101);
  registry.update(report(chrome, '1.3.0', 'chrome'), 200);
  assert.deepEqual(registry.status(200).clients.map(c => c.state), ['unknown', 'unknown', 'current']);
  registry.update(report(edge, '1.3.0'), 201);
  assert.equal(registry.status(201).clients[1].state, 'current');
  assert.equal(registry.status(STALE_MS + 102).needsAttention, false);
  assert.equal(registry.status(STALE_MS + 202).clients.length, 0);
});

test('malformed identity and version reports cannot enter the connection list', () => {
  for (const extensionVersion of [null, 12, '', '0', '0.0.0.0', '1.02', '1.65536', '-1.2', '1.2.3.4.5', '<img>', '1'.repeat(24)]) {
    assert.throws(() => report(edge, extensionVersion));
  }
  for (const browserId of ['', null, {}, 'legacy', edge + ':7']) assert.throws(() => report(browserId, '1.3.0'));
  assert.throws(() => parseExtensionReport({ extensionVersion: '1.3.0' }, true));
  assert.throws(() => parseExtensionReport({ browserId: edge }, true));
  assert.equal(parseExtensionReport({ browserId: edge, extensionVersion: '1.3.0', browser: '<script>' }, true).browser, '');
});

test('authenticated heartbeats work without media and cannot access configuration from an extension origin', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-version-'));
  const token = 'ab'.repeat(32), port = 49858;
  let now = 100000;
  const rpc = new class extends EventEmitter { ready = false; close() {} }();
  const bridge = createBridge({ dataDir: directory, port, config: { token, applicationId: '' }, clock: () => now, rpc });
  try {
    await bridge.start();
    const origin = 'chrome-extension://' + 'a'.repeat(32);
    const request = (endpoint, body, headers = {}) => fetch(`http://127.0.0.1:${port}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token, Origin: origin, ...headers }, body: JSON.stringify(body) });
    const body = { browserId: edge, browser: 'edge', extensionVersion: '1.3.0' };
    assert.equal((await request('extension', body, { 'X-Bridge-Token': 'wrong' })).status, 401);
    assert.equal((await request('extension', body, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('config', { enabled: false })).status, 403);
    assert.equal(bridge.status().extensionConnected, false);
    const response = await request('extension', body);
    assert.equal(response.status, 200);
    const required = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8')).version;
    assert.equal((await response.json()).requiredVersion, required);
    assert.equal(bridge.status().extension.requiredVersion, required);
    assert.equal(bridge.status().extensionConnected, true);
    assert.equal(bridge.status().sessions.length, 0);
    assert.equal(bridge.status().display, null);
    assert.equal(bridge.status().extension.needsAttention, false);
    assert.equal((await request('session', { browserId: chrome, browser: 'chrome', tabId: 7, closed: true })).status, 200);
    assert.deepEqual(bridge.status().extension.clients.map(c => c.state), ['current', 'unknown']);
    assert.equal((await request('extension', { ...body, browserId: chrome, browser: 'chrome' })).status, 200);
    assert.equal(bridge.status().extension.needsAttention, false);
    assert.equal((await request('session', { ...body, extensionVersion: '<script>', tabId: 7, closed: true })).status, 400);
    assert.equal((await request('session', { ...body, extensionVersion: '1.1.0', tabId: -1, closed: true })).status, 400);
    assert.equal(bridge.status().extension.clients[0].version, '1.3.0');
    now += STALE_MS + 1;
    assert.equal(bridge.status().extensionConnected, false);
    assert.equal(bridge.status().extension.needsAttention, false);
  } finally {
    await bridge.shutdown();
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'presence-version-')));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
