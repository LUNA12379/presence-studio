import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SessionStore, validateSession, makeActivity, videoUrl } from '../lib/presence.mjs';
import { soundcloudTrackUrl, soundcloudArtworkUrl } from '../lib/soundcloud.mjs';
import { resolveActivity } from '../lib/activity.mjs';
import { validateConfig } from '../lib/settings.mjs';

const sample={tabId:2,source:'soundcloud',trackUrl:'https://soundcloud.com/forss/flickermood',title:'Flickermood',channel:'Forss',artworkUrl:'https://i1.sndcdn.com/artworks-000067273316-smsiqx-t50x50.jpg',position:12,duration:213,paused:false};
const youtube={tabId:1,source:'youtube',videoId:'abc123abc12',title:'YouTube video',channel:'Channel',position:1,duration:60,paused:false};
const config=validateConfig({language:'en'});
test('SoundCloud sessions create listening presence, cover art, links and timing',()=>{
  const session={...validateSession(sample),updatedAt:100000};const activity=makeActivity(session,config,105000);
  assert.equal(activity.type,2);assert.equal(activity.details,'Flickermood');assert.equal(activity.state,'Forss');
  assert.equal(activity.assets.large_image,'https://i1.sndcdn.com/artworks-000067273316-smsiqx-t500x500.jpg');
  assert.equal(activity.assets.large_text,'SoundCloud');assert.equal(activity.buttons[0].label,'Listen on SoundCloud');
  assert.equal(activity.buttons[0].url,sample.trackUrl);assert.equal(videoUrl(session),sample.trackUrl);
  assert.deepEqual(activity.timestamps,{start:88,end:301});
  assert.equal(makeActivity(session,{...config,mode:'playing'}).type,0);
  assert.equal(makeActivity({...session,paused:true},{...config,language:'ko'}).buttons[0].label,'SoundCloud에서 듣기');
  assert.equal(makeActivity({...session,paused:true},config).timestamps,undefined);
});
test('SoundCloud URLs strip tracking but reject private links, wrong hosts and non-track paths',()=>{
  assert.equal(soundcloudTrackUrl(sample.trackUrl+'/?utm_source=share#t=5'),sample.trackUrl);
  for(const url of ['http://soundcloud.com/a/b','https://evil.example/a/b','https://soundcloud.com.evil.example/a/b','https://u:p@soundcloud.com/a/b','https://soundcloud.com:444/a/b','https://soundcloud.com/a/b/s-secret',sample.trackUrl+'?secret_token=s-secret','https://soundcloud.com/undefined/flickermood','https://soundcloud.com/you/library','https://soundcloud.com/a']){
    assert.equal(soundcloudTrackUrl(url),'',url);assert.throws(()=>validateSession({...sample,trackUrl:url}));
  }
  assert.equal(soundcloudArtworkUrl('https://i1.sndcdn.com/art.jpg?tracking=x'),'https://i1.sndcdn.com/art.jpg');
  for(const url of ['file:///C:/x.png','https://127.0.0.1/a.png','https://evil.sndcdn.com/a.jpg','https://i1.sndcdn.com.evil.test/a.jpg','https://i1.sndcdn.com:444/a.jpg'])assert.equal(soundcloudArtworkUrl(url),'');
});
test('tracks without cover art still produce an activity and overlay',()=>{
  const store=new SessionStore();store.update({...sample,artworkUrl:''},100000);
  const result=resolveActivity(store,config,0,100001);
  assert.equal(result.activity.assets,undefined);assert.equal(result.display.image,'');assert.equal(result.display.url,sample.trackUrl);assert.equal(result.display.type,2);
});
test('YouTube and SoundCloud share last-started priority, pause fallback and tab pinning',()=>{
  const store=new SessionStore();store.update(youtube,100000);store.update(sample,101000);
  store.update(youtube,102000);assert.equal(store.select(config,102000).source,'soundcloud');
  assert.equal(resolveActivity(store,{...config,pinnedTabId:1},0,102000).current.source,'youtube');
  store.update({...sample,paused:true},103000);assert.equal(store.select(config,103000).source,'youtube');
  store.update({...youtube,paused:true},104000);assert.equal(store.select(config,104000).source,'soundcloud');
  store.update({...sample,paused:true},160000);assert.equal(store.select(config,163001).source,'youtube');
  store.update({...sample,trackUrl:'https://soundcloud.com/forss/other'},164000);assert.equal(store.select(config,164000).trackUrl,'https://soundcloud.com/forss/other');
  store.update({...youtube,source:'music'},165000);assert.equal(store.select(config,165000).source,'music');
  store.update({tabId:1,closed:true},165001);assert.equal(store.select(config,165001).source,'soundcloud');
  assert.equal(resolveActivity(store,{...config,excludedKeywords:['forss']},0,165001).display,null);
  assert.equal(resolveActivity(store,{...config,sourceMode:'manual'},0,165001).display.source,'manual');
});

const readerSource=fs.readFileSync(new URL('../extension/soundcloud-reader.js',import.meta.url),'utf8');
const contentSource=fs.readFileSync(new URL('../extension/soundcloud.js',import.meta.url),'utf8');
function domFixture(){
  const state={title:'Flickermood',artist:'Forss',href:'/forss/flickermood',pageTitle:'Another page',canonical:'https://soundcloud.com/other/track',playing:true,position:'12',duration:'213',present:true};
  const node=(attributes={},text='')=>({getAttribute:key=>attributes[key]??null,textContent:text,querySelector:()=>null});
  const player={querySelector:selector=>({
    '.playControls__play':{classList:{contains:()=>state.playing}},
    '.playbackSoundBadge__titleLink':node({title:state.title,href:state.href}),
    '.playbackSoundBadge__lightLink':node({},state.artist),
    '.playbackTimeline__progressWrapper':node({'aria-valuenow':state.position,'aria-valuemax':state.duration}),
    '.playbackSoundBadge__avatar .image__full':{style:{backgroundImage:`url("${sample.artworkUrl}")`}}
  }[selector]??null)};
  const document={addEventListener(){},querySelector:selector=>({
    '.playControls__elements':state.present?player:null,
    'meta[property="og:title"]':node({content:state.pageTitle}),
    'link[rel="canonical"]':node({href:state.canonical})
  }[selector]??null)};
  return {state,document};
}
test('miniplayer reader follows the playing track instead of the browsed page',()=>{
  const {state,document}=domFixture();const reader=vm.runInNewContext(readerSource+';PresenceStudioSoundCloud',{URL});
  const track=reader.read(document);assert.equal(track.trackUrl,sample.trackUrl);assert.equal(track.title,'Flickermood');assert.equal(track.artworkUrl,sample.artworkUrl);assert.equal(track.position,12);
  state.href='/forss/next';state.title='Next';state.position='0';assert.equal(reader.read(document).trackUrl,'https://soundcloud.com/forss/next');
  state.duration='';assert.equal(reader.read(document),null);state.duration='213';state.position='213';state.playing=false;assert.equal(reader.read(document).ended,true);
  assert.equal(reader.seconds('1:02:03'),3723);assert.equal(reader.seconds(''),null);assert.equal(reader.seconds('NaN'),null);
});
test('new SoundCloud UI malformed link uses only matching metadata or the same cached track',()=>{
  const {state,document}=domFixture();const reader=vm.runInNewContext(readerSource+';PresenceStudioSoundCloud',{URL});
  state.href='/undefined/flickermood';assert.equal(reader.read(document),null);
  state.pageTitle='Flickermood';state.canonical=sample.trackUrl;const current=reader.read(document);assert.equal(current.trackUrl,sample.trackUrl);
  state.pageTitle='Artist profile';state.canonical='https://soundcloud.com/forss';assert.equal(reader.read(document,current).trackUrl,sample.trackUrl);
  state.title='Other track';assert.equal(reader.read(document,current),null);
});
test('content collector ignores restored paused tracks, reports pause/seek/close and remembers playback',()=>{
  const {state,document}=domFixture();state.playing=false;
  const messages=[],events={};let tick;
  const context={URL,document,MutationObserver:class{observe(){}disconnect(){}},window:{addEventListener:(event,fn)=>events[event]=fn},setTimeout:()=>0,clearTimeout(){},setInterval:fn=>(tick=fn,1),clearInterval(){},chrome:{runtime:{sendMessage:async message=>messages.push(message),onMessage:{addListener(){}}}}};
  vm.runInNewContext(readerSource+'\n'+contentSource,context);
  assert.equal(messages.at(-1).session.closed,true);
  state.playing=true;tick();assert.equal(messages.at(-1).session.source,'soundcloud');assert.equal(messages.at(-1).session.href,undefined);
  state.position='80';state.playing=false;tick();assert.equal(messages.at(-1).session.position,80);assert.equal(messages.at(-1).session.paused,true);
  events.pagehide();assert.equal(messages.at(-1).session.closed,true);
  state.present=false;tick();assert.equal(messages.at(-1).session.closed,true);
});
test('extension relay accepts only top-frame media from the matching service and queries SoundCloud',async()=>{
  const handlers={},relayed=[];let queried;
  const event=name=>({addListener:fn=>handlers[name]=fn});
  const chrome={runtime:{getManifest:()=>({version:'1.3.0'}),onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},onClicked:event('clicked')},tabs:{onRemoved:event('removed'),onUpdated:event('updated'),query:async query=>(queried=query,[]),sendMessage:async()=>{}},alarms:{clear:async()=>{},create:async()=>{},onAlarm:event('alarm')}};
  vm.runInNewContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{chrome:{...chrome,storage:{local:{get:async()=>({browserId:'11111111-1111-4111-8111-111111111111'})}}},navigator:{userAgent:'Chrome/120'},URL,importScripts(){},BRIDGE_TOKEN:'test-only',AbortSignal,fetch:async(url,options)=>(relayed.push(JSON.parse(options.body)),{ok:true})});
  const sender={url:sample.trackUrl,tab:{id:12,active:true},frameId:0};
  await new Promise(resolve=>handlers.message({kind:'media-presence',session:{...sample,tabId:999}},sender,resolve));
  assert.equal(relayed[0].tabId,12);assert.equal(relayed[0].active,true);
  for(const change of [{url:'https://evil.example/'},{frameId:1},{url:'https://www.youtube.com/watch?v=abc123abc12'}])assert.equal(handlers.message({kind:'media-presence',session:sample},{...sender,...change},()=>{}),undefined);
  assert.equal(relayed.length,1);await handlers.startup();assert.ok(queried.url.includes('https://soundcloud.com/*'));
  handlers.updated(12,{url:sample.trackUrl});assert.equal(relayed.length,2);
  assert.equal(relayed[1].tabId,undefined);assert.equal(relayed[1].extensionVersion,'1.3.0');
  await handlers.updated(12,{url:'https://example.com/'});assert.equal(relayed.at(-1).closed,true);
});
