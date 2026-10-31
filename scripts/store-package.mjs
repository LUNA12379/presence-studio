import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSION_FILES } from '../lib/extension-files.mjs';
import { localPrivateValues, scanContent } from './check-source.mjs';
export function stageStoreExtension(root, destination) {
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw new Error('Store staging directory must be empty');
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
  if (manifest.manifest_version !== 3 || manifest.key || manifest.update_url) throw new Error('Unexpected store manifest');
  const worker = fs.readFileSync(path.join(root,'extension/background.js'),'utf8');
  if (!worker.includes("const LEGACY_BRIDGE_TOKEN = '';")) throw new Error('Store extension must not include a personal connection key');
  const privateValues = localPrivateValues(root);
  const files = [...EXTENSION_FILES.map(file => [path.join(root,'extension',file),file]), ...['LICENSE','COPYING','PRIVACY.md','PRIVACY.ko.md'].map(file => [path.join(root,file),file])];
  for (const [source, name] of files) {
    if (!fs.lstatSync(source).isFile()) throw new Error(`Not a regular store file: ${name}`);
    if (scanContent(fs.readFileSync(source),privateValues).length) throw new Error(`Private data detected in store file: ${name}`);
    const target = path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  return {version:manifest.version,files:files.map(([,name])=>name)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  if (!process.argv[2]) throw new Error('Usage: node scripts/store-package.mjs <empty-staging-directory>');
  console.log(JSON.stringify(stageStoreExtension(root,path.resolve(process.argv[2]))));
}
