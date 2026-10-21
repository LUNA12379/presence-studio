import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...options });
}
export function forbiddenPath(name) {
  const value = name.replaceAll('\\', '/').toLowerCase();
  return /(^|\/)(?:\.git|\.cache|\.build|dist|node_modules|images|edge-extension|user-data|runtime)(\/|$)/.test(value)
    || /(^|\/)(?:config\.json(?:\..*)?|connection\.js|initial-language\.txt|\.env(?:\..*)?)$/.test(value)
    || /\.(?:exe|dll|pdb|zip|7z|log|pfx|p12|pem|key)$/.test(value);
}
const credentialPatterns = [
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b/],
  ['API credential', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,255}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['Discord credential', /\b(?:mfa\.[\w-]{60,}|[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,110})\b/]
];
export function scanContent(content, privateValues = []) {
  const value = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  const findings = credentialPatterns.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  if (privateValues.some(secret => typeof secret === 'string' && secret.length >= 16 && value.includes(secret))) findings.push('Saved personal setting');
  return findings;
}
export function localPrivateValues(root) {
  const paths = [path.join(root, 'config.json')];
  if (process.env.PRESENCE_STUDIO_DATA_DIR) paths.push(path.join(process.env.PRESENCE_STUDIO_DATA_DIR, 'config.json'));
  if (process.env.APPDATA) paths.push(path.join(process.env.APPDATA, 'PresenceStudio', 'config.json'));
  const result = new Set();
  for (const file of paths) {
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    for (const key of ['applicationId', 'customApplicationId', 'soundcloudApplicationId', 'token', 'overlayKey']) if (typeof data[key] === 'string' && data[key]) result.add(data[key]);
  }
  return [...result]; // Values remain in memory and are never printed.
}
export function auditSource(root, { history = true, revision = 'HEAD', workingTree = true, privateValues = [] } = {}) {
  const commits = history ? git(root, ['rev-list', '--all']).trim().split(/\r?\n/).filter(Boolean) : [git(root, ['rev-parse', '--verify', revision + '^{commit}']).trim()];
  if (!commits.length) throw new Error('Commit the source before auditing it.');
  const issues = [], blobs = new Map();
  const add = (location, reason) => issues.push({ location, reason });
  for (const commit of commits) {
    const tree = git(root, ['ls-tree', '-rz', commit]).split('\0').filter(Boolean);
    for (const record of tree) {
      const split = record.indexOf('\t'), name = record.slice(split + 1);
      const [mode, type, oid] = record.slice(0, split).split(' ');
      if (forbiddenPath(name)) add(`${commit.slice(0, 12)}:${name}`, 'Private or generated file');
      if (type !== 'blob' || mode === '120000') add(`${commit.slice(0, 12)}:${name}`, 'Submodules and symlinks require a separate source review');
      if (type === 'blob' && !blobs.has(oid)) blobs.set(oid, name);
    }
  }
  for (const [oid, name] of blobs) for (const reason of scanContent(git(root, ['cat-file', 'blob', oid], { encoding: 'buffer' }), privateValues)) add(`${oid.slice(0, 12)}:${name}`, reason);
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  if (workingTree) for (const name of tracked) {
    if (forbiddenPath(name)) add(name, 'Private or generated file');
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    if (!fs.lstatSync(file).isFile()) { add(name, 'Only regular source files are permitted'); continue; }
    for (const reason of scanContent(fs.readFileSync(file), privateValues)) add(name, reason);
  }
  const metadata = git(root, ['log', '--all', '--format=%B%n%an <%ae>%n%cn <%ce>']);
  for (const reason of scanContent(metadata, privateValues)) add('Git commit metadata', reason);
  const emails = new Set(git(root, ['log', '--all', '--format=%ae%n%ce']).trim().split(/\r?\n/).filter(Boolean));
  return {
    commits: commits.length, trackedFiles: tracked.length, historicalBlobs: blobs.size,
    authorEmailCount: emails.size, nonGitHubNoReplyEmailCount: [...emails].filter(email => !email.endsWith('@users.noreply.github.com')).length,
    issues: [...new Map(issues.map(issue => [JSON.stringify(issue), issue])).values()]
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--local-settings')) throw new Error('Usage: node scripts/check-source.mjs [--local-settings]');
  const report = auditSource(ROOT, { privateValues: args.includes('--local-settings') ? localPrivateValues(ROOT) : [] });
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length) process.exitCode = 1;
}
