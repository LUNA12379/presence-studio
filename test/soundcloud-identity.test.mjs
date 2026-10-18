import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ROOT, createBridge, loadSettings, validateConfig } from '../server.mjs';
import { effectiveApplicationId } from '../lib/images.mjs';

const MAIN='123456789012345678', CUSTOM='987654321098765432', SC='345678901234567890', NEW_SC='456789012345678901';
const youtube={tabId:1,source:'youtube',videoId:'dQw4w9WgXcQ',title:'YouTube sample',channel:'Channel',position:10,duration:300,paused:false};
const soundcloud={tabId:2,source:'soundcloud',trackUrl:'https://soundcloud.com/forss/flickermood',title:'Flickermood',channel:'Forss',position:10,duration:213,paused:false};
class RPC extends EventEmitter {
  ready=false; connections=[]; sent=[];
  async connect(id){this.id=id;this.connections.push(id);this.ready=true;this.emit('ready');}
  async setActivity(activity){this.sent.push({id:this.id,activity});}
  close(){this.ready=false;}
}
async function fixture(t,rpc=new RPC()) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'presence-sc-identity-'));
  const root=path.join(directory,'app'),dataDir=path.join(directory,'data');
  fs.mkdirSync(path.join(root,'extension'),{recursive:true});
  for(const file of ['manifest.json','background.js','content.js','soundcloud-reader.js','soundcloud.js'])fs.copyFileSync(path.join(ROOT,'extension',file),path.join(root,'extension',file));
  const config={...loadSettings(root,dataDir),applicationId:MAIN,customApplicationId:CUSTOM,soundcloudApplicationId:SC};
  let now=100000;
  const port=49855, bridge=createBridge({root,dataDir,config,port,rpc,clock:()=>now});
  // Drive ticks explicitly so delayed-response cases do not depend on wall-clock timers.
  await new Promise(resolve=>bridge.server.listen(port,'127.0.0.1',resolve));
  t.after(async()=>{await bridge.shutdown();assert.ok(directory.startsWith(path.join(os.tmpdir(),'presence-sc-identity-')));fs.rmSync(directory,{recursive:true,force:true});});
  const request=async body=>{
    const response=await fetch(`http://127.0.0.1:${port}/api/config`,{method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Token':config.token},body:JSON.stringify(body)});
    return {code:response.status,data:await response.json()};
  };
  return {bridge,rpc,config,root,dataDir,request,advance(){now+=4000;},update(value){bridge.sessions.update(value,now);},async settle(){now+=4000;await bridge.tick();await bridge.tick();}};
}

test('SoundCloud ID is optional, validated, and never replaces a manual or YouTube identity',()=>{
  const config=validateConfig({applicationId:MAIN,customApplicationId:CUSTOM,soundcloudApplicationId:` ${SC} `});
  assert.equal(config.soundcloudApplicationId,SC);
  for(const source of ['youtube','music',undefined])assert.equal(effectiveApplicationId(config,source),MAIN);
  assert.equal(effectiveApplicationId(config,'soundcloud'),SC);
  assert.equal(effectiveApplicationId({...config,sourceMode:'manual'},'soundcloud'),CUSTOM);
  assert.equal(effectiveApplicationId({...config,soundcloudApplicationId:''},'soundcloud'),MAIN);
  assert.equal(validateConfig({}, {applicationId:MAIN}).soundcloudApplicationId,'');
  for(const id of ['bot-token','1'.repeat(23),'123.45'])assert.throws(()=>validateConfig({soundcloudApplicationId:id},config));
});

test('selected media, pinning, saved IDs, custom mode and fallback switch the actual RPC connection',async t=>{
  const f=await fixture(t),{bridge,rpc,request}=f;
  f.update(youtube);await f.settle();assert.equal(rpc.sent.at(-1).id,MAIN);
  f.update(soundcloud);assert.equal(bridge.status().effectiveApplicationId,SC);assert.equal(bridge.status().published,false);
  await f.settle();assert.equal(rpc.sent.at(-1).id,SC);assert.equal(rpc.sent.at(-1).activity.details,'Flickermood');
  const count=rpc.connections.length;await f.settle();assert.equal(rpc.connections.length,count);
  assert.equal((await request({soundcloudApplicationId:NEW_SC})).code,200);await f.settle();assert.equal(rpc.sent.at(-1).id,NEW_SC);
  assert.equal((await request({soundcloudApplicationId:'invalid'})).code,400);assert.equal(bridge.status().config.soundcloudApplicationId,NEW_SC);
  f.update({...soundcloud,paused:true});await f.settle();assert.equal(rpc.sent.at(-1).id,MAIN);
  await request({pinnedTabId:2});await f.settle();assert.equal(rpc.sent.at(-1).id,NEW_SC);
  await request({sourceMode:'manual'});await f.settle();assert.equal(rpc.sent.at(-1).id,CUSTOM);
  await request({sourceMode:'auto'});await f.settle();assert.equal(rpc.sent.at(-1).id,NEW_SC);
  await request({soundcloudApplicationId:''});await f.settle();assert.equal(rpc.sent.at(-1).id,MAIN);
  await request({soundcloudApplicationId:SC});await f.settle();assert.equal(rpc.sent.at(-1).id,SC);
  await request({enabled:false});await f.settle();assert.equal(rpc.sent.at(-1).activity,null);assert.equal(bridge.status().published,false);
  await request({enabled:true,pinnedTabId:null,excludedKeywords:['Forss']});await f.settle();assert.equal(rpc.sent.at(-1).id,MAIN);
  await request({excludedKeywords:[]});f.update({...soundcloud,paused:false});await f.settle();assert.equal(rpc.sent.at(-1).id,SC);
  f.update({tabId:2,closed:true});await f.settle();assert.equal(rpc.sent.at(-1).id,MAIN);
  const child=spawnSync(process.execPath,['--input-type=module','-e',"const {loadSettings}=await import(process.argv[1]); const c=loadSettings(process.argv[2],process.argv[3]); console.log(JSON.stringify([c.applicationId,c.customApplicationId,c.soundcloudApplicationId]));",new URL('../server.mjs',import.meta.url).href,f.root,f.dataDir],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),[MAIN,CUSTOM,SC]);
});

test('a late YouTube acknowledgement cannot mark the new SoundCloud connection as published',async t=>{
  const rpc=new RPC();let release;
  rpc.setActivity=async function(activity){this.sent.push({id:this.id,activity});if(this.sent.length===1)await new Promise(resolve=>{release=resolve;});};
  const f=await fixture(t,rpc),{bridge}=f;
  f.update(youtube);await bridge.tick();const pending=bridge.tick();
  f.advance();f.update(soundcloud);await bridge.tick();assert.equal(rpc.connections.at(-1),SC);
  release();await pending;assert.equal(bridge.status().published,false);
  await f.settle();assert.equal(rpc.sent.at(-1).id,SC);assert.equal(rpc.sent.at(-1).activity.details,'Flickermood');assert.equal(bridge.status().published,true);
});

test('changing services during a pending connection cancels the old identity before publishing',async t=>{
  const rpc=new RPC();let release;
  rpc.connect=async function(id){this.connections.push(id);if(this.connections.length===1)await new Promise(resolve=>{release=resolve;});this.id=id;this.ready=true;this.emit('ready');};
  const f=await fixture(t,rpc),{bridge}=f;
  f.update(youtube);const pending=bridge.tick();
  f.advance();f.update(soundcloud);await bridge.tick();release();await pending;
  assert.equal(rpc.ready,false);assert.equal(rpc.sent.length,0);
  await f.settle();assert.deepEqual(rpc.connections,[MAIN,SC]);assert.equal(rpc.sent.at(-1).id,SC);assert.equal(bridge.status().error,'');
});
