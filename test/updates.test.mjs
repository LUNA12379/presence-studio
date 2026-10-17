import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {UpdateManager,compareVersions,releaseCandidate} from '../lib/updates.mjs';
import {createBridge,ROOT,loadSettings} from '../server.mjs';
const repository='example/presence-releases',bytes=Buffer.from('MZ installer fixture');
const release=(version='2.6.0')=>({tag_name:'v'+version,body:'새 버전입니다.',assets:[{name:`Presence-Studio-${version}-Setup.exe`,browser_download_url:`https://github.com/${repository}/releases/download/v${version}/Presence-Studio-${version}-Setup.exe`,size:bytes.length,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex')}]});
function fixture(t,overrides={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'presence-updates-'));
  t.after(()=>{assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(),'presence-updates-')));fs.rmSync(directory,{recursive:true,force:true});});
  const launched=[];
  const manager=new UpdateManager({version:'2.5.0',repository,directory,root:directory,platform:'win32',fetcher:async url=>url.includes('api.github.com')?Response.json(release()):new Response(bytes),launcher:async(...args)=>{launched.push(args);},...overrides});
  return {directory,manager,launched};
}
test('release comparison rejects malformed versions and handles numeric upgrades',()=>{
  assert.equal(compareVersions('2.10.0','2.9.9'),1);assert.equal(compareVersions('2.5.0','2.5.0'),0);assert.equal(compareVersions('2.4.9','2.5.0'),-1);
  for(const value of ['2.5','v2.5.0','2.5.0-beta','02.5.0','../../file'])assert.throws(()=>compareVersions(value,'2.5.0'));
});
test('only matching stable installer assets with trusted URLs and digests are accepted',()=>{
  assert.equal(releaseCandidate(release(),repository).version,'2.6.0');
  for(const mutate of [r=>r.prerelease=true,r=>r.draft=true,r=>r.assets[0].digest='',r=>r.assets[0].size=900000000,r=>r.assets[0].browser_download_url='https://evil.example/setup.exe',r=>r.assets[0].browser_download_url=r.assets[0].browser_download_url.replace(repository,'other/repo')]){const value=release();mutate(value);assert.throws(()=>releaseCandidate(value,repository));}
});
test('checking never downloads or installs; explicit actions verify and launch',async t=>{
  const {manager,directory,launched}=fixture(t);
  assert.equal((await manager.check()).phase,'available');assert.deepEqual(fs.readdirSync(directory),[]);assert.equal(launched.length,0);
  assert.equal((await manager.download()).phase,'ready');assert.equal(manager.status().progress,100);assert.equal(launched.length,0);
  await manager.install();assert.equal(launched.length,1);assert.deepEqual(launched[0][1],['/SILENT']);assert.deepEqual(fs.readFileSync(launched[0][0]),bytes);
});
test('corruption during download or after verification cannot execute',async t=>{
  const {manager,directory,launched}=fixture(t,{fetcher:async url=>url.includes('api.github.com')?Response.json(release()):new Response(Buffer.alloc(bytes.length))});
  await manager.check();assert.equal((await manager.download()).phase,'error');assert.deepEqual(fs.readdirSync(directory),[]);await assert.rejects(manager.install());assert.equal(launched.length,0);
  manager.fetcher=async url=>url.includes('api.github.com')?Response.json(release()):new Response(bytes);
  await manager.check();await manager.download();fs.writeFileSync(manager.file,'modified');await assert.rejects(manager.install());assert.equal(launched.length,0);
});
test('redirects cannot fetch insecure or unrelated hosts',async t=>{
  let calls=0;const {manager}=fixture(t,{fetcher:async url=>{calls++;return url.includes('api.github.com')?Response.json(release()):new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});}});
  await manager.check();assert.equal((await manager.download()).phase,'error');assert.equal(calls,2);
});
test('unconfigured, offline and inaccessible feeds never claim latest version',async t=>{
  const {manager}=fixture(t,{repository:'',fetcher:async()=>{throw Error('should not fetch');}});assert.equal((await manager.check()).phase,'unconfigured');
  manager.repository=repository;manager.fetcher=async()=>new Response('',{status:404});assert.equal((await manager.check()).phase,'error');
  manager.fetcher=async()=>{throw Error('offline');};assert.equal((await manager.check()).phase,'error');
  manager.fetcher=async()=>Response.json(release('2.5.0'));assert.equal((await manager.check()).phase,'current');await manager.download();assert.equal(manager.file,null);
});
test('concurrent downloads are coalesced and truncated transfers are rejected',async t=>{
  let resolve,requests=0;const {manager}=fixture(t,{fetcher:async url=>url.includes('api.github.com')?Response.json(release()):(requests++,await new Promise(r=>{resolve=r;}))});
  await manager.check();const download=manager.download();await manager.download();assert.equal(requests,1);resolve(new Response(bytes.subarray(0,3)));await download;assert.equal(manager.status().phase,'error');
});
test('shutdown cancels pending downloads without creating an executable',async t=>{
  const {manager,directory}=fixture(t,{fetcher:async(url,options)=>url.includes('api.github.com')?Response.json(release()):new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});
  await manager.check();const pending=manager.download();manager.cancel();await pending;
  assert.equal(manager.status().phase,'error');assert.equal(manager.busy,false);assert.deepEqual(fs.readdirSync(directory),[]);
});
test('update API requires pairing and startup preference persists',async t=>{
  const {manager,directory}=fixture(t);const dataDir=path.join(directory,'data'),config=loadSettings(ROOT,dataDir);
  class FakeRPC extends EventEmitter{ready=false;async connect(){this.ready=true;}async setActivity(){}close(){this.ready=false;}}
  const bridge=createBridge({dataDir,config,port:49847,rpc:new FakeRPC(),updater:manager});await bridge.start();
  try{
    const endpoint='http://127.0.0.1:49847/api/';assert.equal((await fetch(endpoint+'updates/check',{method:'POST'})).status,401);
    const headers={'X-Bridge-Token':config.token,'Content-Type':'application/json'};
    const response=await fetch(endpoint+'updates/check',{method:'POST',headers,body:'{}'});assert.equal((await response.json()).phase,'available');
    await fetch(endpoint+'config',{method:'POST',headers,body:JSON.stringify({checkUpdatesOnStartup:false})});
    assert.equal(loadSettings(ROOT,dataDir).checkUpdatesOnStartup,false);
  }finally{await bridge.shutdown();}
});
