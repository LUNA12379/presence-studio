import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ImageLibrary, effectiveApplicationId, fetchDiscordAssets } from '../lib/images.mjs';
import { validateConfig } from '../lib/settings.mjs';
import { createBridge, loadSettings, ROOT } from '../server.mjs';
import { resolveActivity } from '../lib/activity.mjs';
import { SessionStore } from '../lib/presence.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1kAAAAASUVORK5CYII=','base64');
const MAIN='123456789012345678',CUSTOM='987654321098765432',ASSET='234567890123456789';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'presence-images-'));t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'presence-images-'));fs.rmSync(root,{recursive:true,force:true});});fs.mkdirSync(path.join(root,'extension'));for(const file of ['manifest.json','background.js','content.js','soundcloud-reader.js','soundcloud.js'])fs.copyFileSync(path.join(ROOT,'extension',file),path.join(root,'extension',file));return root;}
test('local images are copied, deduplicated, bounded and survive a new library instance',t=>{
  const root=fixture(t),library=new ImageLibrary(root),entry=library.importPng(PNG,'내 이미지.png');
  assert.equal(library.importPng(PNG,'duplicate.png').id,entry.id);assert.equal(library.list().length,1);
  const reopened=new ImageLibrary(root);assert.equal(reopened.list()[0].name,'내 이미지.png');assert.deepEqual(fs.readFileSync(reopened.filename(entry.id)),PNG);
  assert.throws(()=>library.filename('../config'));assert.throws(()=>library.importPng(Buffer.from('<svg/>')));assert.throws(()=>library.importPng(PNG.subarray(0,55)));
  const huge=Buffer.from(PNG);huge.writeUInt32BE(100000,16);assert.throws(()=>library.importPng(huge));
});
test('local file references never become Discord URLs and manual presence has no YouTube assets',()=>{
  const config=validateConfig({sourceMode:'manual',applicationId:MAIN,customApplicationId:CUSTOM,manual:{imageId:'ab'.repeat(32),discordAssetId:ASSET,discordAssetAppId:CUSTOM}});
  const activity=resolveActivity(new SessionStore(),config,100000,101000).activity;
  assert.equal(effectiveApplicationId(config),CUSTOM);assert.equal(effectiveApplicationId({...config,sourceMode:'auto'}),MAIN);
  assert.equal(activity.assets.large_image,`https://cdn.discordapp.com/app-assets/${CUSTOM}/${ASSET}.png`);assert.equal(activity.assets.small_image,undefined);assert.ok(!JSON.stringify(activity).includes('YouTube'));assert.ok(!JSON.stringify(activity).includes('127.0.0.1'));
  assert.equal(resolveActivity(new SessionStore(),validateConfig({sourceMode:'manual',manual:{imageId:'ab'.repeat(32)}}),1).activity.assets,undefined);
});
test('Discord asset lists contain only validated public image identifiers',async()=>{
  let requested;
  const assets=await fetchDiscordAssets(CUSTOM,async url=>{requested=url;return{ok:true,json:async()=>[{id:ASSET,name:'focus'},{id:'../config',name:'bad'}]};});
  assert.equal(assets.length,1);assert.equal(assets[0].applicationId,CUSTOM);assert.match(requested,/^https:\/\/discord\.com\/api\/v10\/oauth2\/applications\//);
  await assert.rejects(fetchDiscordAssets('../bad'));await assert.rejects(fetchDiscordAssets(CUSTOM,async()=>({ok:false,status:429})),/잠시/);
});

test('new Discord asset fetches bypass a cached empty CDN response without credentials',async()=>{
  const seen=new Set();
  const fetcher=async(url,options)=>{
    const parsed=new URL(url),fresh=parsed.searchParams.get('refresh');
    assert.equal(parsed.pathname,`/api/v10/oauth2/applications/${CUSTOM}/assets`);
    assert.equal(options.headers['Cache-Control'],'no-cache');
    assert.equal(options.headers.Authorization,undefined);
    const stale=!fresh||seen.has(fresh);seen.add(fresh);
    return{ok:true,json:async()=>stale?[]:[{id:ASSET,name:'uploaded-after-empty-list'}]};
  };
  assert.equal((await fetchDiscordAssets(CUSTOM,fetcher)).length,1);
  assert.equal((await fetchDiscordAssets(CUSTOM,fetcher)).length,1);
});

test('refresh replaces an empty local cache immediately and isolates application lists',async t=>{
  const root=fixture(t),dataDir=path.join(root,'data'),port=49845,config=loadSettings(root,dataDir);config.applicationId=MAIN;
  class FakeRPC extends EventEmitter{ready=false;async connect(){this.ready=true;}async setActivity(){}close(){this.ready=false;}}
  const calls=[];let uploaded=false,fail=false;
  const bridge=createBridge({root,dataDir,config,port,rpc:new FakeRPC(),assetFetcher:async app=>{
    calls.push(app);if(fail)throw new Error('잠시 뒤 이미지 목록을 다시 불러와 주세요.');
    return uploaded?[{id:ASSET,name:'new-image',applicationId:app}]:[];
  }});
  const headers={'X-Bridge-Token':config.token,'Content-Type':'application/json'},base=`http://127.0.0.1:${port}/api/`;
  const list=async(force=false)=>{const r=await fetch(base+'discord-assets'+(force?'?refresh=1':''),{headers});assert.equal(r.status,200);return r.json();};
  try{
    await bridge.start();
    assert.equal((await fetch(base+'discord-assets?refresh=1')).status,401);
    assert.deepEqual((await list()).assets,[]);uploaded=true;
    assert.deepEqual((await list()).assets,[]);assert.equal(calls.length,1);
    assert.equal((await list(true)).assets[0].name,'new-image');assert.equal(calls.length,2);
    assert.equal((await list()).assets.length,1);assert.equal(calls.length,2);
    fail=true;
    const error=await fetch(base+'discord-assets?refresh=1',{headers});assert.equal(error.status,400);assert.match((await error.json()).error,/잠시/);
    assert.equal((await list()).assets.length,1);fail=false;
    assert.equal((await list(true)).assets.length,1);assert.equal(calls.length,4);
    const update=await fetch(base+'config',{method:'POST',headers,body:JSON.stringify({customApplicationId:CUSTOM})});assert.equal(update.status,200);
    assert.equal((await list()).applicationId,CUSTOM);assert.equal(calls.at(-1),CUSTOM);
    assert.equal(calls.length,5);
  }finally{await bridge.shutdown();}
});
test('image API, presets, guide preferences and application switching work together and persist',async t=>{
  const root=fixture(t),dataDir=path.join(root,'data'),port=49844,config=loadSettings(root,dataDir);config.applicationId=MAIN;
  class FakeRPC extends EventEmitter{ready=false;connected=[];sent=[];async connect(id){this.connected.push(id);this.ready=true;}async setActivity(value){this.sent.push(value);}close(){this.ready=false;}}
  const rpc=new FakeRPC(),bridge=createBridge({root,dataDir,config,port,rpc,assetFetcher:async app=>[{id:ASSET,name:'focus',applicationId:app}]});
  const base=`http://127.0.0.1:${port}`,headers={'X-Bridge-Token':config.token,'Content-Type':'application/json'};
  const request=async(endpoint,body)=>{const response=await fetch(base+'/api/'+endpoint,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});assert.equal(response.status,200);return response.json();};
  try{
    await bridge.start();await bridge.tick();assert.equal(rpc.connected.at(-1),MAIN);
    assert.equal((await fetch(base+'/api/images',{method:'POST',headers:{'Content-Type':'image/png'},body:PNG})).status,401);
    const uploaded=await fetch(base+'/api/images',{method:'POST',headers:{'X-Bridge-Token':config.token,'Content-Type':'image/png','X-Image-Name':encodeURIComponent('내 사진.png')},body:PNG});assert.equal(uploaded.status,200);const {image}=await uploaded.json();
    assert.equal((await fetch(base+'/media/'+image.id)).status,404);const photo=await fetch(image.url);assert.equal(photo.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),PNG);
    assert.equal((await fetch(base+'/media/'+image.id+'?download=1')).status,404);
    const exported=await fetch(image.url+'&download=1');assert.equal(exported.status,200);
    assert.match(exported.headers.get('content-disposition'),/^attachment; filename="presence-[a-f0-9]{12}\.png"$/);
    assert.deepEqual(Buffer.from(await exported.arrayBuffer()),PNG);
    const manual={...config.manual,imageId:image.id,discordAssetId:ASSET,discordAssetAppId:CUSTOM};
    let result=await request('config',{customApplicationId:CUSTOM,sourceMode:'manual',manual,showGuideOnStartup:false});
    assert.equal(rpc.connected.at(-1),CUSTOM);assert.equal(result.effectiveApplicationId,CUSTOM);assert.equal(result.display.image,image.url);
    const overlay=await (await fetch(base+'/api/overlay',{headers:{'X-Overlay-Key':config.overlayKey}})).json();assert.equal(overlay.display.image,image.url);assert.equal(overlay.images,undefined);
    const presets=await request('presets/save',{name:'사진과 집중',manual});assert.equal(presets.config.presets[0].manual.imageId,image.id);
    assert.equal((await request('discord-assets')).applicationId,CUSTOM);
    await request('config',{sourceMode:'auto'});assert.equal(rpc.connected.at(-1),MAIN);
    result=await request('presets/apply',{id:presets.config.presets[0].id});assert.equal(result.config.manual.imageId,image.id);assert.equal(rpc.connected.at(-1),CUSTOM);
    await bridge.shutdown();const restored=loadSettings(root,dataDir);assert.equal(restored.showGuideOnStartup,false);assert.equal(restored.customApplicationId,CUSTOM);assert.equal(restored.manual.imageId,image.id);assert.equal(new ImageLibrary(dataDir).list().length,1);
  }finally{await bridge.shutdown();}
});
