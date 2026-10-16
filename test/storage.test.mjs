import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { loadSettings, createBridge, ROOT } from '../server.mjs';
import { saveSettings, userDataDirectory } from '../lib/storage.mjs';
import { stagePackage } from '../scripts/package.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'presence-storage-'));
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'presence-storage-'));fs.rmSync(root,{recursive:true,force:true});});
  fs.mkdirSync(path.join(root,'extension'));
  for(const name of ['manifest.json','background.js','content.js'])fs.copyFileSync(path.join(ROOT,'extension',name),path.join(root,'extension',name));
  return root;
}
test('fresh installs have no application ID and unique per-user connection keys',t=>{
  const root=fixture(t), a=loadSettings(root,path.join(root,'user-a')), b=loadSettings(root,path.join(root,'user-b'));
  assert.equal(a.applicationId,'');assert.equal(b.applicationId,'');assert.notEqual(a.token,b.token);assert.notEqual(a.overlayKey,b.overlayKey);
  assert.equal(fs.existsSync(path.join(root,'config.json')),false);assert.equal(fs.existsSync(path.join(root,'extension','connection.js')),false);
  assert.equal(userDataDirectory({APPDATA:path.join(root,'roaming')},'win32'),path.join(root,'roaming','PresenceStudio'));
});
test('saving the application ID through the API persists across a new Node process',async t=>{
  const root=fixture(t),dataDir=path.join(root,'data'),config=loadSettings(root,dataDir),port=49843;
  class FakeRPC extends EventEmitter { ready=false; async connect(){this.ready=true;} async setActivity(){} close(){this.ready=false;} }
  const bridge=createBridge({root,dataDir,config,port,rpc:new FakeRPC()});
  try {
    await bridge.start();
    const response=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Token':config.token},body:JSON.stringify({applicationId:'123456789012345678'})});
    assert.equal(response.status,200);assert.equal((await response.json()).applicationIdConfigured,true);
  } finally {await bridge.shutdown();}
  const script="const {loadSettings}=await import(process.argv[1]);console.log(JSON.stringify(loadSettings(process.argv[2],process.argv[3])));";
  const child=spawnSync(process.execPath,['--input-type=module','-e',script,new URL('../server.mjs',import.meta.url).href,root,dataDir],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  const restored=JSON.parse(child.stdout);assert.equal(restored.applicationId,'123456789012345678');assert.equal(restored.token,config.token);assert.equal(restored.overlayKey,config.overlayKey);
});
test('migrated user settings take priority over old app copies and preserve presets',t=>{
  const root=fixture(t),dataDir=path.join(root,'data');
  fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({applicationId:'123456789012345678'}));
  const settings=loadSettings(root,dataDir);settings.applicationId='987654321098765432';settings.presets=[{id:'focus',name:'집중',manual:{title:'집중하는 중'}}];saveSettings(dataDir,settings);
  const restored=loadSettings(root,dataDir);assert.equal(restored.applicationId,settings.applicationId);assert.equal(restored.presets[0].name,'집중');assert.equal(restored.token,settings.token);
});
test('distribution allowlist excludes personal data even when present beside app files',t=>{
  const root=fixture(t),source=path.join(root,'source'),destination=path.join(root,'package');
  fs.mkdirSync(source);const required=['server.mjs','server-v2.mjs','package.json','config.example.json','README.md','사용방법.txt','Start.cmd','Start.ps1','Autostart.ps1','Enable-Autostart.cmd','Disable-Autostart.cmd','extension/manifest.json','extension/background.js','extension/content.js','extension/connection.example.js','desktop/Presence Studio.exe','desktop/Microsoft.Web.WebView2.Core.dll','desktop/Microsoft.Web.WebView2.WinForms.dll','desktop/WebView2Loader.dll','desktop/studio.ico','desktop/WebView2-LICENSE.txt','desktop/THIRD-PARTY.txt','lib/storage.mjs','ui/index.html'];
  for(const file of required){fs.mkdirSync(path.dirname(path.join(source,file)),{recursive:true});fs.writeFileSync(path.join(source,file),'public content');}
  for(const file of ['config.json','extension/connection.js','.env'])fs.writeFileSync(path.join(source,file),'private test marker');
  const included=stagePackage(source,destination);assert.equal(included.length,required.length);
  for(const file of ['config.json','extension/connection.js','.env'])assert.equal(fs.existsSync(path.join(destination,file)),false);
  assert.throws(()=>stagePackage(source,destination),/must be empty/);
});
