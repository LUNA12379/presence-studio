import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { createBridge, ROOT } from '../server.mjs';
class FakeRPC extends EventEmitter {
  ready = true; sent = [];
  async setActivity(a) { this.sent.push(a); return {}; }
  close() { this.ready = false; }
}
test('HTTP bridge authenticates requests and clears real state transitions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-discord-test-'));
  fs.cpSync(path.join(ROOT, 'ui'), path.join(root, 'ui'), { recursive: true });
  const rpc = new FakeRPC(); let now = 100000;
  const token = 'ab'.repeat(32);
  const port = 49839;
  const bridge = createBridge({ root, dataDir: root, port, rpc, clock: () => now, config: { token, applicationId: '123456789012345678', enabled: true, mode: 'auto', pauseSeconds: 60 } });
  const base = `http://127.0.0.1:${port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Bridge-Token': token };
  try {
    await bridge.start();
    assert.equal((await fetch(base + '/api/status')).status, 401);
    assert.equal((await fetch(base + '/api/status', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      const request = http.get(base + '/api/status', { headers: { ...headers, Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(hostStatus, 403);
    assert.equal((await fetch(base + '/api/status', { headers: { ...headers, Origin: 'chrome-extension://' + 'a'.repeat(32) } })).status, 403);
    const html = await (await fetch(base)).text(); assert.ok(html.includes(token));
    const response = await fetch(base + '/api/session', { method: 'POST', headers, body: JSON.stringify({ tabId: 1, source: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Integration test', channel: 'Example', position: 10, duration: 200, paused: false }) });
    assert.equal(response.status, 200);
    await bridge.tick(); assert.equal(rpc.sent.at(-1).details, 'Integration test');
    now += 4000;
    await fetch(base + '/api/config', { method: 'POST', headers, body: JSON.stringify({ enabled: false }) });
    assert.equal(rpc.sent.at(-1), null);
    now += 4000;
    await fetch(base + '/api/config', { method: 'POST', headers, body: JSON.stringify({ enabled: true }) });
    assert.equal(rpc.sent.at(-1).details, 'Integration test');
    await fetch(base + '/api/session', { method: 'POST', headers, body: JSON.stringify({ tabId: 1, closed: true }) });
    now += 4000; await bridge.tick(); assert.equal(rpc.sent.at(-1), null);
    const status = await (await fetch(base + '/api/status', { headers })).json();
    assert.equal(status.current, null); assert.equal(status.published, false); assert.equal(status.config.token, undefined);
  } finally {
    await bridge.shutdown();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'yt-discord-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
