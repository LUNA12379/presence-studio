import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreRelease, STORE_CHANNEL, validateStoreRelease } from '../lib/store-release.mjs';
const release={schema:1,published:true,extensionId:'a'.repeat(32),version:'1.4.0'};
test('only an explicit published store ID produces a store URL; arbitrary URLs are ignored',()=>{
  for(const value of [null,{}, {...release,published:false},{...release,published:'true'},{...release,schema:2}])assert.equal(validateStoreRelease(value).published,false);
  for(const value of [{...release,extensionId:'https://evil.example'},{...release,version:'1.99999'},{...release,version:'0.0'},{...release,version:'1.04'}])assert.throws(()=>validateStoreRelease(value));
  const result=validateStoreRelease({...release,url:'https://evil.example',code:'alert(1)'});
  assert.equal(result.url,'https://chromewebstore.google.com/detail/'+'a'.repeat(32));
  assert.equal(result.code,undefined);
});
test('store checks coalesce, use only the fixed channel, and fail closed on unavailable or oversized responses',async()=>{
  let now=0,count=0,fail=false,large=false;
  const store=new StoreRelease(async(url,options)=>{
    count++;assert.equal(url,STORE_CHANNEL);assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
    if(fail)throw Error('offline');
    return new Response(large?'x'.repeat(4097):JSON.stringify(release));
  },()=>now);
  assert.equal(store.status().published,false);
  await Promise.all([store.check(),store.check()]);assert.equal(count,1);assert.equal(store.status().published,true);
  now+=1000;await store.check();assert.equal(count,1);
  now+=300000;fail=true;await store.check();assert.equal(store.status().published,false);assert.equal(store.status().url,undefined);
  now+=300000;fail=false;large=true;await store.check();assert.equal(store.status().published,false);
});
