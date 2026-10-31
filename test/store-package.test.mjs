import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../server.mjs';
import { EXTENSION_FILES } from '../lib/extension-files.mjs';
import { stageStoreExtension } from '../scripts/store-package.mjs';
test('store package contains public extension files and licenses, with no personal keys or runtime code',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'presence-store-package-'));
  t.after(()=>{assert.ok(directory.startsWith(path.join(os.tmpdir(),'presence-store-package-')));fs.rmSync(directory,{recursive:true,force:true});});
  const root=path.join(directory,'source'),destination=path.join(directory,'stage');
  for(const file of [...EXTENSION_FILES.map(file=>'extension/'+file),'LICENSE','COPYING','PRIVACY.md','PRIVACY.ko.md']){
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(ROOT,file),path.join(root,file));
  }
  fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({token:'ab'.repeat(32)}));
  fs.writeFileSync(path.join(root,'extension/connection.js'),'PRIVATE LOCAL KEY');
  const result=stageStoreExtension(root,destination),manifest=JSON.parse(fs.readFileSync(path.join(destination,'manifest.json'),'utf8'));
  assert.equal(result.files.length,EXTENSION_FILES.length+4);
  assert.equal(fs.existsSync(path.join(destination,'config.json')),false);assert.equal(fs.existsSync(path.join(destination,'connection.js')),false);
  assert.equal(manifest.action.default_popup,'popup.html');assert.equal(manifest.incognito,'not_allowed');
  for(const locale of ['en','ko']){
    const messages=JSON.parse(fs.readFileSync(path.join(destination,`_locales/${locale}/messages.json`),'utf8'));
    assert.ok(messages.extensionDescription.message.length<=132);
  }
  for(const size of [16,32,48,128]){
    const bytes=fs.readFileSync(path.join(destination,`icons/${size}.png`));assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
  const worker=fs.readFileSync(path.join(destination,'background.js'),'utf8');assert.ok(worker.includes("const LEGACY_BRIDGE_TOKEN = '';"));assert.ok(!worker.includes('importScripts('));
  fs.writeFileSync(path.join(root,'extension/background.js'),worker.replace("const LEGACY_BRIDGE_TOKEN = '';",`const LEGACY_BRIDGE_TOKEN = '${'ab'.repeat(32)}';`));
  assert.throws(()=>stageStoreExtension(root,path.join(directory,'bad-stage')),/personal connection key/);
});
