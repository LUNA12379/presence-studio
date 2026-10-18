(async()=>{
  const result=window.studioSoundCloudVerification={done:false};
  const before={sourceMode:latest.config.sourceMode,mode:latest.config.mode,pinnedTabId:latest.config.pinnedTabId};
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const wait=async predicate=>{for(let i=0;i<70;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('SoundCloud UI wait timed out');};
  try{
    const doc=document.implementation.createHTMLDocument('SoundCloud fixture');
    doc.head.innerHTML='<meta property="og:title" content="Flickermood"><link rel="canonical" href="https://soundcloud.com/forss/flickermood">';
    doc.body.innerHTML='<div class="playControls__elements"><button class="playControls__play playing">Pause current</button><a class="playbackSoundBadge__titleLink" href="/undefined/flickermood" title="Flickermood"><span aria-hidden="true">Flickermood</span></a><a class="playbackSoundBadge__lightLink">Forss</a><div class="playbackTimeline__progressWrapper" aria-valuenow="24" aria-valuemax="213"></div><a class="playbackSoundBadge__avatar"><span class="image__full" style="background-image:url(https://i1.sndcdn.com/artworks-000067273316-smsiqx-t50x50.jpg)"></span></a></div>';
    const reader=PresenceStudioSoundCloud;
    let track=reader.read(doc);
    assert(track.trackUrl==='https://soundcloud.com/forss/flickermood','Malformed SoundCloud href not resolved from matching DOM metadata');
    assert(track.position===24&&track.duration===213&&track.title==='Flickermood','DOM track fields incorrect');
    doc.querySelector('meta').content='Artist page';
    assert(reader.read(doc,track).trackUrl===track.trackUrl,'Browsing away lost the current track');
    doc.querySelector('.playbackSoundBadge__titleLink').title='Different song';
    assert(reader.read(doc,track)===null,'Unrelated page metadata was applied to a new track');
    doc.querySelector('.playbackSoundBadge__titleLink').title='Flickermood';
    doc.querySelector('.playControls__play').classList.remove('playing');
    const paused=reader.read(doc,track);assert(paused.paused,'DOM pause state incorrect');result.realDomReader=true;
    await api('config',{sourceMode:'auto',mode:'auto',pinnedTabId:null});
    await api('session',{...track,tabId:987270});await refresh();panel('home');
    assert(latest.current.source==='soundcloud','SoundCloud session not selected');
    assert(latest.display.type===2&&latest.display.image.endsWith('-t500x500.jpg'),'Listening activity or large cover incorrect');
    assert($('nowTitle').textContent==='Flickermood'&&$('nowSource').textContent.includes('SoundCloud'),'Dashboard did not identify SoundCloud');
    assert($('sessions').textContent.includes('SoundCloud · Forss'),'Session source missing');
    result.dashboard=true;
    const overlayResponse=await fetch('/api/overlay',{headers:{'X-Overlay-Key':new URL(latest.overlayUrl).hash.slice(5)}});
    const overlay=await overlayResponse.json();assert(overlay.display.source==='soundcloud'&&overlay.display.title==='Flickermood','OBS payload missing track');result.obs=true;
    await wait(()=>$('nowImage').complete&&$('nowImage').naturalWidth>0);result.coverLoaded=true;
    window.studioSoundCloudCapture=true;await wait(()=>!window.studioSoundCloudCapture);
    await api('session',{...paused,tabId:987270});await refresh();assert(latest.display.paused,'Pause not reflected');result.pause=true;
    await api('session',{tabId:987270,closed:true});await refresh();assert(latest.current===null,'Closed tab left stale activity');result.closed=true;
  }catch(error){result.error=error.stack||error.message;}
  finally{await api('session',{tabId:987270,closed:true});await api('config',before);await refresh();result.done=true;}
})();
