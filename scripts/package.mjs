import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'server.mjs', 'server-v2.mjs', 'package.json', 'config.example.json', 'update-channel.json', 'ui/en.json', 'README.md', 'README.ko.md', '사용방법.txt',
  'Start.cmd', 'Start.ps1', 'Autostart.ps1', 'Enable-Autostart.cmd', 'Disable-Autostart.cmd',
  'extension/manifest.json', 'extension/background.js', 'extension/content.js', 'extension/connection.example.js',
  'desktop/Presence Studio.exe', 'desktop/Microsoft.Web.WebView2.Core.dll',
  'desktop/Microsoft.Web.WebView2.WinForms.dll', 'desktop/WebView2Loader.dll',
  'desktop/studio.ico', 'desktop/WebView2-LICENSE.txt', 'desktop/THIRD-PARTY.txt'
];
export function packageFiles(root) {
  const result = [...files];
  // Explicit source directories only. Never copy the app directory recursively.
  for (const directory of ['lib', 'ui']) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.isFile() && /\.(mjs|js|html|css|svg)$/.test(entry.name)) result.push(`${directory}/${entry.name}`);
    }
  }
  for (const file of result) if (!fs.lstatSync(path.join(root, file)).isFile()) throw new Error(`Missing package file: ${file}`);
  return result.sort();
}
export function stagePackage(root, destination) {
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw new Error('Package destination must be empty');
  const included = packageFiles(root);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of included) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  return included;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/package.mjs <empty-staging-directory>');
  const included = stagePackage(projectRoot, path.resolve(process.argv[2]));
  console.log(`Prepared ${included.length} distribution files. Personal settings are excluded.`);
}
