import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { auditSource, git, localPrivateValues } from './check-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = ['LICENSE', 'COPYING', 'THIRD-PARTY-NOTICES.md', 'DEVELOPMENT.md', 'RELEASING.md', 'package.json', 'server.mjs', 'server-v2.mjs', 'desktop/Studio.cs', 'desktop/Build.ps1', 'installer/Installer.cs', 'Build-Installer.ps1', 'Build-Release.ps1', 'Package.ps1', 'extension/manifest.json', 'scripts/Restore-WebView2.ps1', 'scripts/package.mjs', 'scripts/check-source.mjs', 'scripts/source-package.mjs'];
export function packageSource(root, destination, { privateValues = [] } = {}) {
  if (git(root, ['status', '--porcelain', '--untracked-files=all']).trim()) throw new Error('Commit all intended source changes before preparing a release. The worktree must be clean.');
  const commit = git(root, ['rev-parse', 'HEAD']).trim();
  const audit = auditSource(root, { privateValues });
  if (audit.issues.length) throw new Error('Source audit failed. Run node scripts/check-source.mjs --local-settings for locations (values are redacted).');
  const files = git(root, ['ls-tree', '-rz', '--name-only', commit]).split('\0').filter(Boolean);
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing corresponding source: ${file}`);
  if (files.includes('SOURCE.json')) throw new Error('SOURCE.json is generated release provenance; do not commit it.');
  for (const file of files.filter(name => path.posix.basename(name) === '.gitattributes')) {
    if (/\bexport-(?:ignore|subst)\b/.test(git(root, ['show', `${commit}:${file}`]))) throw new Error('Archive export attributes can omit or change corresponding source. Remove them before releasing.');
  }
  // Ignore machine-local Git attributes, which must not alter the committed source.
  const infoAttributes = git(root, ['rev-parse', '--git-path', 'info/attributes']).trim();
  if (fs.existsSync(path.resolve(root, infoAttributes)) && fs.readFileSync(path.resolve(root, infoAttributes), 'utf8').trim()) throw new Error('Remove repository-local info/attributes before packaging.');
  const pkg = JSON.parse(git(root, ['show', `${commit}:package.json`]));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Release version must be x.y.z.');
  const directory = path.resolve(destination);
  fs.mkdirSync(directory, { recursive: true });
  const name = `Presence-Studio-${pkg.version}-source.zip`, archive = path.join(directory, name);
  if (fs.existsSync(archive)) throw new Error('Source archive already exists; use a new empty release directory.');
  const source = { version: pkg.version, commit, license: 'GPL-3.0-only with the WebView2 additional permission in COPYING', build: 'DEVELOPMENT.md', release: 'RELEASING.md' };
  const metadata = JSON.stringify(source);
  // The archive is generated from one immutable commit, not from personal files
  // or ignored build artifacts beside it. Global attributes are disabled.
  git(root, ['-c', 'core.attributesFile=NUL', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=zip', `--output=${archive}`, `--add-virtual-file=SOURCE.json:${metadata}`, commit]);
  const checksum = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(archive + '.sha256', `${checksum}  ${name}\n`, { flag: 'wx' });
  return { ...source, archive, sha256: checksum, audit };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/source-package.mjs <release-directory>');
  console.log(JSON.stringify(packageSource(ROOT, process.argv[2], { privateValues: localPrivateValues(ROOT) }), null, 2));
}
