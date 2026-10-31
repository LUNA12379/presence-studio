import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const extensionId='a'.repeat(32),credential='ab'.repeat(32);
function worker(disk={}) {
  const handlers={},requests=[],access=[],badges=[];let offline=false,revoked=false;
  const event=name=>({addListener:fn=>handlers[name]=fn});
  const chrome={
    runtime:{id:extensionId,getURL:file=>`chrome-extension://${extensionId}/${file}`,getManifest:()=>({version:'1.4.0'}),onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
    storage:{local:{get:async()=>({...disk}),set:async data=>Object.assign(disk,data),remove:async key=>delete disk[key],setAccessLevel:async value=>access.push(value.accessLevel)}},
    tabs:{create:async()=>{},onRemoved:event('removed'),onUpdated:event('updated'),query:async()=>[],sendMessage:async()=>{}},
    action:{setBadgeText:async value=>badges.push(value.text),setBadgeBackgroundColor:async()=>{}},
    alarms:{clear:async()=>{},create:async()=>{},onAlarm:event('alarm')}
  };
  const fetch=async(url,options)=>{if(offline)throw Error('offline');requests.push({url,...options});if(url.endsWith('/claim'))return {ok:true,json:async()=>({token:credential})};return {ok:!revoked,status:revoked?401:200};};
  vm.runInNewContext(source,{chrome,crypto:{randomUUID},navigator:{userAgent:'Chrome/130'},URL,AbortSignal,fetch});
  const popup=(kind,extra={})=>new Promise(resolve=>handlers.message({kind,...extra},{id:extensionId,url:chrome.runtime.getURL('popup.html')},resolve));
  return {handlers,requests,access,badges,popup,offline:value=>offline=value,revoke:()=>revoked=true};
}
test('store worker requires explicit popup pairing, protects credentials and survives worker restart',async()=>{
  const disk={},w=worker(disk);
  await w.handlers.installed();assert.deepEqual(w.access,['TRUSTED_CONTEXTS']);assert.equal(w.requests.length,0);
  assert.equal((await w.popup('studio-status')).connected,false);
  assert.equal((await w.popup('studio-pair',{code:'bad'})).ok,false);assert.equal(w.requests.length,0);
  const result=await w.popup('studio-pair',{code:'abcd-1234-ef56'});assert.equal(result.ok,true);
  assert.equal(disk.bridgeCredential,credential);
  assert.equal(JSON.parse(w.requests[0].body).code,'ABCD1234EF56');
  assert.equal(w.requests[1].headers['X-Bridge-Token'],credential);
  assert.ok(!JSON.stringify(await w.popup('studio-status')).includes(credential));
  const restarted=worker(disk);await restarted.handlers.startup();assert.equal(restarted.requests[0].headers['X-Bridge-Token'],credential);
  assert.equal(JSON.parse(restarted.requests[0].body).browserId,disk.browserId);
  restarted.offline(true);assert.equal((await restarted.popup('studio-status')).connected,false);assert.equal(disk.bridgeCredential,credential);
  restarted.offline(false);restarted.revoke();await restarted.popup('studio-status');assert.equal(disk.bridgeCredential,undefined);
});
test('content scripts cannot pair, read status, disconnect or navigate through popup commands',async()=>{
  const w=worker();
  for(const kind of ['studio-pair','studio-status','studio-disconnect','studio-open'])for(const sender of [{id:extensionId,url:'https://www.youtube.com/watch?v=abc123abc12',tab:{id:7},frameId:0},{id:'b'.repeat(32),url:`chrome-extension://${extensionId}/popup.html`}]) {
    assert.equal(w.handlers.message({kind,code:'ABCD1234EF56'},sender,()=>{throw Error('Unauthorized reply');}),undefined);
  }
  assert.equal(w.requests.length,0);
  await w.popup('studio-pair',{code:'ABCD1234EF56'});
  assert.equal((await w.popup('studio-disconnect')).ok,true);
  assert.ok(w.requests.at(-1).url.endsWith('/pairing/disconnect'));
  const count=w.requests.length;await w.popup('studio-status');assert.equal(w.requests.length,count);
});
