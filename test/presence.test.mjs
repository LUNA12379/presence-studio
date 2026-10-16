import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, makeActivity, activityChanged, validateSession, STALE_MS } from '../lib/presence.mjs';
import { FrameReader, encodeFrame } from '../lib/rpc.mjs';
import { validateConfig } from '../server.mjs';
const config = { enabled: true, pauseSeconds: 60, mode: 'auto' };
const sample = { tabId: 1, source: 'youtube', videoId: 'dQw4w9WgXcQ', title: '테스트 영상', channel: '테스트 채널', position: 20, duration: 200, rate: 1, paused: false };
test('last started playing tab wins without heartbeat flapping', () => {
  const store = new SessionStore(); store.update(sample, 1000); store.update({ ...sample, tabId: 2 }, 2000);
  store.update(sample, 3000); assert.equal(store.select(config, 3000).tabId, 2);
  store.update({ ...sample, tabId: 2, paused: true }, 4000); assert.equal(store.select(config, 4000).tabId, 1);
});
test('pause expiry uses first pause time, not refresh time', () => {
  const store = new SessionStore(); store.update({ ...sample, paused: true }, 1000);
  store.update({ ...sample, paused: true }, 59000);
  assert.ok(store.select(config, 60000)); assert.equal(store.select(config, 61000), null);
});
test('ended, ads, disabled and expired sessions are not shown', () => {
  for (const extra of [{ ended: true }, { ad: true }]) {
    const store = new SessionStore(); store.update({ ...sample, ...extra }, 1000); assert.equal(store.select(config, 1001), null);
  }
  const store = new SessionStore(); store.update(sample, 1000);
  assert.equal(store.select({ ...config, enabled: false }, 1001), null);
  assert.equal(store.select(config, 1001 + STALE_MS), null);
});
test('closing a tab immediately removes its candidate', () => {
  const store = new SessionStore(); store.update(sample, 1000); store.update({ tabId: 1, closed: true }, 1001);
  assert.equal(store.select(config, 1001), null);
});
test('timing compensates sample age and playback speed', () => {
  const s = { ...sample, updatedAt: 100000, rate: 2 };
  const a = makeActivity(s, config, 110000);
  assert.deepEqual(a.timestamps, { start: 90, end: 190 });
  assert.equal(a.type, 3); assert.equal(makeActivity({ ...s, source: 'music' }, config).type, 2);
});
test('pause and livestream omit timers', () => {
  for (const extra of [{ paused: true }, { live: true }]) assert.equal(makeActivity({ ...sample, updatedAt: 0, ...extra }, config).timestamps, undefined);
});
test('heartbeat does not resend constant timeline; seeks do', () => {
  const a = makeActivity({ ...sample, updatedAt: 100000 }, config, 100000);
  const b = makeActivity({ ...sample, position: 25, updatedAt: 105000 }, config, 105000);
  assert.equal(activityChanged(a, b), false);
  b.timestamps.end -= 20; assert.equal(activityChanged(a, b), true);
  assert.equal(activityChanged(a, null), true);
});
test('video IDs cannot inject URLs, and malformed payloads are rejected', () => {
  assert.throws(() => validateSession({ ...sample, videoId: 'https://evil.example/' }));
  assert.throws(() => validateSession({ ...sample, source: 'other' }));
  assert.throws(() => validateSession({ ...sample, tabId: -1 }));
  assert.throws(() => validateSession({ ...sample, title: '' }));
});
test('long Korean and emoji titles are bounded without broken codepoints', () => {
  const a = makeActivity({ ...sample, title: '안녕🌸'.repeat(200), updatedAt: 0 }, config);
  assert.ok(Buffer.byteLength(a.details) <= 128); assert.ok(!a.details.includes('�'));
});
test('frame decoder handles fragmentation and coalesced ping frames', () => {
  const encoded = Buffer.concat([encodeFrame(1, { title: '안녕🌸' }), encodeFrame(3, { nonce: 1 })]);
  const reader = new FrameReader(); const frames = [];
  for (let i = 0; i < encoded.length; i += 3) frames.push(...reader.push(encoded.subarray(i, i + 3)));
  assert.equal(frames.length, 2); assert.equal(JSON.parse(frames[0].bytes.toString()).title, '안녕🌸'); assert.equal(frames[1].op, 3);
});
test('frame decoder bounds memory allocation', () => {
  const bytes = Buffer.alloc(8); bytes.writeUInt32LE(2 ** 21, 4);
  assert.throws(() => new FrameReader().push(bytes));
});
test('settings cannot override pairing keys and reject bad IDs', () => {
  const current = { ...config, applicationId: '', token: 'local-key' };
  assert.equal(validateConfig({ token: 'attacker', mode: 'playing' }, current).token, 'local-key');
  assert.throws(() => validateConfig({ applicationId: 'not-a-token' }, current));
  assert.throws(() => validateConfig({ pauseSeconds: -1 }, current));
});
