import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { SessionStore } from '../lib/presence.mjs';
import { resolveActivity } from '../lib/activity.mjs';
import { DEFAULTS, validateConfig, validateManual, validateOverlay } from '../lib/settings.mjs';
import { createBridge, loadSettings, ROOT } from '../server.mjs';
const sample={tabId:10,source:'youtube',videoId:'dQw4w9WgXcQ',title:'오늘의 음악',channel:'음악 채널',position:10,duration:180,paused:false};
test('manual takes priority; switching back restores existing automatic session',()=>{
  const sessions=new SessionStore();sessions.update(sample,100000);
  const config=validateConfig({sourceMode:'manual',manual:{title:'코딩하는 중',state:'집중',timer:'elapsed'}});
  assert.equal(resolveActivity(sessions,config,90000,100000).activity.details,'코딩하는 중');
  assert.equal(resolveActivity(sessions,{...config,sourceMode:'auto'},90000,100000).activity.details,sample.title);
  assert.equal(resolveActivity(sessions,{...config,enabled:false},90000,100000).display,null);
});
test('excluded titles or channels are hidden, and pin never falls back to another tab',()=>{
  const sessions=new SessionStore();sessions.update(sample,100000);sessions.update({...sample,tabId:11,title:'다른 영상'},100001);
  assert.equal(resolveActivity(sessions,validateConfig({excludedKeywords:['음악 채널']}),90000,100002).display,null);
  assert.equal(resolveActivity(sessions,validateConfig({pinnedTabId:10}),90000,100002).current.tabId,10);
  sessions.update({tabId:10,closed:true},100003);
  assert.equal(resolveActivity(sessions,validateConfig({pinnedTabId:10}),90000,100004).display,null);
});
test('countdown has a stable deadline and no past Discord timestamps after completion',()=>{
  const config=validateConfig({sourceMode:'manual',manual:{title:'집중',timer:'countdown',minutes:1}});
  const sessions=new SessionStore();const first=resolveActivity(sessions,config,100000,110000);
  assert.deepEqual(first.activity.timestamps,{start:100,end:160});
  assert.equal(resolveActivity(sessions,config,100000,161000).activity.timestamps,undefined);
});
test('invalid custom links, overlay values and setting injections are rejected',()=>{
  for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>validateManual({imageUrl:url}));
  assert.throws(()=>validateOverlay({opacity:0}));assert.throws(()=>validateOverlay({width:5000}));assert.throws(()=>validateOverlay({accent:'red;url()'}));
  const config=validateConfig({token:'untrusted',overlayKey:'untrusted',presets:[{}]},{...DEFAULTS,token:'original',overlayKey:'original'});
  assert.equal(config.token,'original');assert.equal(config.overlayKey,'original');assert.deepEqual(config.presets,[]);
});
test('v1 migration preserves application ID, pairing key and preferences',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'presence-migration-'));const token='ab'.repeat(32);
  try{
    fs.mkdirSync(path.join(root,'extension'));
    for(const name of ['manifest.json','background.js','content.js']) fs.copyFileSync(path.join(ROOT,'extension',name),path.join(root,'extension',name));
    fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({applicationId:'123456789012345678',token,enabled:false,mode:'listening',pauseSeconds:30}));
    const dataDir=path.join(root,'user-data'), config=loadSettings(root,dataDir);
    assert.equal(config.applicationId,'123456789012345678');assert.equal(config.token,token);assert.equal(config.enabled,false);assert.equal(config.sourceMode,'auto');assert.equal(config.mode,'listening');assert.match(config.overlayKey,/^[a-f0-9]{64}$/);assert.equal(config.overlay.enabled,false);
    assert.ok(fs.readFileSync(path.join(dataDir,'edge-extension','connection.js'),'utf8').includes(token));
  }
  finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'presence-migration-'));fs.rmSync(root,{recursive:true,force:true});}
});
class FakeRPC extends EventEmitter{ready=true;sent=[];async setActivity(a){this.sent.push(a);return{};}close(){this.ready=false;}}
test('an in-flight Discord update is resynchronized if settings change before acknowledgement',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'presence-race-'));let now=100000;const port=49842,token='ab'.repeat(32);
  let release;const rpc=new FakeRPC();rpc.setActivity=async function(a){this.sent.push(a);if(this.sent.length===2)await new Promise(resolve=>{release=resolve;});return{};};
  const bridge=createBridge({root,dataDir:root,port,rpc,clock:()=>now,config:{...DEFAULTS,token,overlayKey:'cd'.repeat(32),applicationId:'123456789012345678'}});
  try{await bridge.start();bridge.sessions.update(sample,now);await bridge.tick();now+=4000;
    bridge.sessions.update({...sample,tabId:11,title:'다음 영상'},now);const pending=bridge.tick();
    const response=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Token':token},body:JSON.stringify({overlay:{opacity:80}})});assert.equal(response.status,200);
    bridge.sessions.update({tabId:11,closed:true},now);release();await pending;now+=4000;await bridge.tick();assert.equal(rpc.sent.length,3);assert.equal(rpc.sent.at(-1).details,sample.title);
  }finally{if(release)release();await bridge.shutdown();assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'presence-race-'));fs.rmSync(root,{recursive:true,force:true});}
});
test('studio API supports presets, mode transitions and read-only OBS credentials',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'presence-http-'));fs.cpSync(path.join(ROOT,'ui'),path.join(root,'ui'),{recursive:true});
  const token='ab'.repeat(32),overlayKey='cd'.repeat(32),rpc=new FakeRPC();let now=100000;const port=49841;
  const bridge=createBridge({root,dataDir:root,port,rpc,clock:()=>now,config:{...DEFAULTS,token,overlayKey,applicationId:'123456789012345678'}});const base=`http://127.0.0.1:${port}`;
  const request=async(endpoint,body,headers={})=>{const response=await fetch(base+'/api/'+endpoint,{method:body?'POST':'GET',headers:{'X-Bridge-Token':token,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json()};};
  try{await bridge.start();await request('session',sample);await bridge.tick();assert.equal(rpc.sent.at(-1).details,sample.title);
    const saved=await request('presets/save',{name:'집중',manual:{...DEFAULTS.manual,title:'열심히 작업 중',timer:'countdown',minutes:25}});assert.equal(saved.status,200);const id=saved.data.config.presets[0].id;
    now+=4000;await request('presets/apply',{id});assert.equal(rpc.sent.at(-1).details,'열심히 작업 중');
    assert.equal((await request('config',{enabled:false},{'X-Bridge-Token':overlayKey})).status,401);
    const view=await fetch(base+'/api/overlay',{headers:{'X-Overlay-Key':overlayKey}});assert.equal(view.status,200);const data=await view.json();assert.equal(data.display.title,'열심히 작업 중');assert.equal(data.config,undefined);assert.equal(data.token,undefined);assert.equal(data.appPath,undefined);
    assert.equal((await fetch(base+'/api/overlay')).status,401);
    now+=4000;await request('config',{sourceMode:'auto'});assert.equal(rpc.sent.at(-1).details,sample.title);
    now+=4000;await request('config',{excludedKeywords:['음악']});assert.equal(rpc.sent.at(-1),null);
    const deleted=await request('presets/delete',{id});assert.equal(deleted.data.config.presets.length,0);
  }finally{await bridge.shutdown();assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'presence-http-'));fs.rmSync(root,{recursive:true,force:true});}
});
