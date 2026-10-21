import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { auditSource, forbiddenPath, git, scanContent } from '../scripts/check-source.mjs';
import { packageSource } from '../scripts/source-package.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-release-'));
  t.after(() => { assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'presence-release-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const root = path.join(directory, 'repo'); fs.mkdirSync(root);
  git(root, ['init', '--quiet']); git(root, ['config', 'user.name', 'Test Maintainer']); git(root, ['config', 'user.email', 'test@users.noreply.github.com']);
  git(root, ['config', 'core.autocrlf', 'false']);
  // A small independent fixture represents the build inputs required in a source release.
  const files = ['LICENSE', 'COPYING', 'THIRD-PARTY-NOTICES.md', 'DEVELOPMENT.md', 'RELEASING.md', 'server.mjs', 'server-v2.mjs', 'desktop/Studio.cs', 'desktop/Build.ps1', 'installer/Installer.cs', 'Build-Installer.ps1', 'Build-Release.ps1', 'Package.ps1', 'extension/manifest.json', 'scripts/Restore-WebView2.ps1', 'scripts/package.mjs', 'scripts/check-source.mjs', 'scripts/source-package.mjs', 'test/example.test.mjs'];
  for (const file of files) write(root, file, 'source for ' + file + '\n');
  write(root, 'package.json', JSON.stringify({ version: '9.8.7' }));
  write(root, '.gitignore', 'config.json\nextension/connection.js\nimages/\n');
  commit(root);
  return { root, output: path.join(directory, 'output') };
}
function write(root, name, value) { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); }
function commit(root) { git(root, ['add', '--all']); git(root, ['commit', '--quiet', '-m', 'Fixture source']); }
function unzip(archive) {
  const bytes = fs.readFileSync(archive), entries = new Map();
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); assert.ok(end >= 0);
  let cursor = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10), size = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const local = bytes.readUInt32LE(cursor + 42), start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const content = bytes.subarray(start, start + size); assert.ok([0, 8].includes(method));
    entries.set(name, method === 8 ? inflateRawSync(content) : content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
test('source release binds archive contents to the commit and excludes ignored personal data', t => {
  const { root, output } = fixture(t);
  for (const name of ['config.json', 'extension/connection.js', 'images/private.png']) write(root, name, 'private fixture data');
  const result = packageSource(root, output), entries = unzip(result.archive);
  assert.equal(result.commit, git(root, ['rev-parse', 'HEAD']).trim());
  assert.equal(result.sha256, createHash('sha256').update(fs.readFileSync(result.archive)).digest('hex'));
  assert.deepEqual(JSON.parse(entries.get('SOURCE.json')), { version: '9.8.7', commit: result.commit, license: result.license, build: 'DEVELOPMENT.md', release: 'RELEASING.md' });
  assert.equal(entries.get('desktop/Studio.cs').toString(), 'source for desktop/Studio.cs\n');
  assert.ok(entries.has('test/example.test.mjs')); assert.ok(entries.has('COPYING')); assert.ok(entries.has('installer/Installer.cs'));
  for (const name of ['config.json', 'extension/connection.js', 'images/private.png', '.git/config']) assert.equal(entries.has(name), false);
  assert.throws(() => packageSource(root, output), /already exists/);
});
test('release preparation rejects uncommitted or forgotten source files', t => {
  const { root, output } = fixture(t);
  write(root, 'server.mjs', 'changed'); assert.throws(() => packageSource(root, output), /worktree must be clean/);
  git(root, ['restore', 'server.mjs']); write(root, 'forgotten.mjs', 'new source');
  assert.throws(() => packageSource(root, output), /worktree must be clean/);
});
test('history audit detects removed credentials without returning their value', t => {
  const { root, output } = fixture(t), secret = 'gh' + 'p_' + 'Z'.repeat(36);
  write(root, 'accidental.txt', secret); commit(root);
  fs.unlinkSync(path.join(root, 'accidental.txt')); commit(root);
  const report = auditSource(root);
  assert.ok(report.issues.some(issue => issue.reason === 'GitHub credential'));
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.throws(() => packageSource(root, output), /Source audit failed/);
});
test('source release rejects archive rules that could drop build inputs or license files', t => {
  const { root, output } = fixture(t);
  write(root, '.gitattributes', 'LICENSE export-ignore\n'); commit(root);
  assert.throws(() => packageSource(root, output), /export attributes/);
});
test('source release requires the installer source and notices', t => {
  const { root, output } = fixture(t);
  fs.unlinkSync(path.join(root, 'installer/Installer.cs')); commit(root);
  assert.throws(() => packageSource(root, output), /Missing corresponding source/);
});
test('audit checks personal file paths and current saved values without exposing them', () => {
  for (const name of ['CONFIG.JSON', 'extension/connection.js', 'nested/.env.local', '.build/a.cs', 'desktop/a.dll', 'images/a.png']) assert.equal(forbiddenPath(name), true, name);
  for (const name of ['config.example.json', 'extension/connection.example.js', 'desktop/studio.ico', 'test/images-guide.test.mjs']) assert.equal(forbiddenPath(name), false, name);
  const saved = 'fixture-' + '1234567890'.repeat(3);
  assert.deepEqual(scanContent('saved=' + saved, [saved]), ['Saved personal setting']);
  assert.deepEqual(scanContent('normal source text'), []);
});
