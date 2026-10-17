(async()=>{
  window.studioUpdateVerification={done:false};
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const wait=async predicate=>{for(let i=0;i<80;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100));}throw Error('Update UI timed out');};
  try{
    panel('settings');await wait(()=>latest.update.phase==='available'&&!updateRequest);
    assert(!$('updateBanner').hidden&&!$('downloadUpdate').hidden,'Startup update discovery is missing');
    $('checkUpdate').click();await wait(()=>latest.update.phase==='error'&&!updateRequest);
    assert($('updateStatus').textContent.includes('offline')&&$('downloadUpdate').hidden,'Network failure must not claim latest or offer stale download');
    $('checkUpdate').click();await wait(()=>latest.update.phase==='available'&&!updateRequest);
    assert($('updateNotes').textContent.includes('테스트 변경 내용'),'Release notes are missing');
    $('downloadUpdate').click();await wait(()=>latest.update.phase==='ready'&&!updateRequest);
    assert(!$('installUpdate').hidden&&$('downloadUpdate').hidden,'Verified download must require explicit installation');
    $('autoCheckUpdates').checked=false;$('autoCheckUpdates').dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>latest.config.checkUpdatesOnStartup===false&&!$('autoCheckUpdates').disabled);await refresh();
    assert(!$('autoCheckUpdates').checked,'Startup check preference was not retained');
    $('updateStatus').scrollIntoView({block:'center'});
    window.studioUpdateVerification={done:true,startupCheck:true,networkError:true,retry:true,notes:true,downloadVerified:true,explicitInstallRequired:true,preferenceSaved:true};
  }catch(error){window.studioUpdateVerification={done:true,error:error.stack||error.message};}
})();
