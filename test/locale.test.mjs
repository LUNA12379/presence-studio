import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {ROOT, createBridge, loadSettings} from '../server.mjs';
import {saveSettings} from '../lib/storage.mjs';
import {validateConfig} from '../lib/settings.mjs';
import {makeActivity} from '../lib/presence.mjs';
const messages=JSON.parse(fs.readFileSync(path.join(ROOT,'ui/en.json'),'utf8'));
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'presence-locale-'));
  fs.mkdirSync(path.join(root,'extension'));
  for(const file of ['manifest.json','background.js','content.js','soundcloud-reader.js','soundcloud.js'])fs.copyFileSync(path.join(ROOT,'extension',file),path.join(root,'extension',file));
  t.after(()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),'presence-locale-')));fs.rmSync(root,{recursive:true,force:true});});
  return root;
}
test('new installations use English, old installations keep Korean and personal content',t=>{
  const root=fixture(t),data=path.join(root,'data');
  const fresh=loadSettings(root,data);assert.equal(fresh.language,'en');assert.equal(fresh.manual.title,'Focusing');
  const old={...fresh,manual:{...fresh.manual,title:'내 제목'},presets:[{id:'my-preset',name:'내 프리셋',manual:{title:'내 제목'}}]};delete old.language;
  saveSettings(data,old);const migrated=loadSettings(root,data);
  assert.equal(migrated.language,'ko');assert.equal(migrated.manual.title,'내 제목');assert.equal(migrated.presets[0].name,'내 프리셋');assert.equal(migrated.token,fresh.token);
  assert.throws(()=>validateConfig({language:'fr'}),/language/);
  const korean=path.join(root,'ko-install');fs.mkdirSync(korean);fs.writeFileSync(path.join(korean,'initial-language.txt'),'ko');assert.equal(loadSettings(root,korean).language,'ko');
});
test('API language changes persist across a new process without changing activity or identity',async t=>{
  const root=fixture(t),dataDir=path.join(root,'data'),config=loadSettings(root,dataDir),port=49849;
  config.manual.title='직접 작성한 제목';config.applicationId='123456789012345678';config.customApplicationId='987654321098765432';config.presets=[{id:'one',name:'나의 프리셋',manual:config.manual}];saveSettings(dataDir,config);
  class RPC extends EventEmitter{ready=false;async connect(){this.ready=true;}async setActivity(){}close(){this.ready=false;}}
  const bridge=createBridge({root,dataDir,config,port,rpc:new RPC()});
  try{
    await bridge.start();const response=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Token':config.token},body:JSON.stringify({language:'ko'})});
    assert.equal(response.status,200);assert.equal((await response.json()).config.language,'ko');
    const overlay=await fetch(`http://127.0.0.1:${port}/api/overlay`,{headers:{'X-Overlay-Key':config.overlayKey}});assert.equal((await overlay.json()).language,'ko');
    const rejected=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Token':config.token},body:JSON.stringify({language:'invalid'})});assert.equal(rejected.status,400);
  }finally{await bridge.shutdown();}
  const child=spawnSync(process.execPath,['--input-type=module','-e',"const {loadSettings}=await import(process.argv[1]); console.log(JSON.stringify(loadSettings(process.argv[2],process.argv[3])));",new URL('../server.mjs',import.meta.url).href,root,dataDir],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);const restored=JSON.parse(child.stdout);
  assert.equal(restored.language,'ko');for(const field of ['manual','presets','applicationId','customApplicationId','token','overlayKey'])assert.deepEqual(restored[field],config[field]);
});
test('all guide pages have English translations and matching template parameters',()=>{
  const guides=vm.runInNewContext(fs.readFileSync(path.join(ROOT,'ui/guide.js'),'utf8')+';guideSteps');
  for(const step of guides)for(const field of ['title','label','body'])assert.ok(messages[step[field]],`Missing guide ${field}: ${step.title}`);
  for(const [source,value] of Object.entries(messages)){
    assert.ok(value.trim(),`Empty translation: ${source}`);
    const parameters=text=>[...text.matchAll(/\{([A-Za-z]+)\}/g)].map(m=>m[1]).sort();assert.deepEqual(parameters(value),parameters(source),source);
  }
});
test('Discord system labels follow the selected language without translating video titles',()=>{
  const session={title:'한국어 영상 제목',source:'youtube',channel:'내 채널',videoId:'abc123abc12',paused:true,position:3,duration:30,updatedAt:Date.now()};
  const en=makeActivity(session,{mode:'auto',language:'en'});const ko=makeActivity(session,{mode:'auto',language:'ko'});
  assert.equal(en.details,session.title);assert.equal(ko.details,session.title);assert.equal(en.buttons[0].label,'Watch on YouTube');assert.equal(ko.buttons[0].label,'YouTube에서 보기');
  assert.match(en.state,/Paused/);assert.match(ko.state,/일시정지/);
});
