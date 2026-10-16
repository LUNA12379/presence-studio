// Invoked only by the desktop verifier against an isolated test data directory.
(async()=>{
  window.studioVerification={done:false};
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  const wait=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('UI update timed out');};
  try{
    await wait(()=>!!latest);
    assert($('guideDialog').open,'Startup guide did not open');
    for(let i=0;i<3;i++)$('guideNext').click();
    assert(!$('guidePreference').hidden,'Final page preference is missing');
    $('guideNeverAgain').checked=true;$('guideFinish').click();
    await wait(()=>!$('guideDialog').open);assert(latest.config.showGuideOnStartup===false,'Guide preference was not saved');
    panel('settings');$('openGuide').click();assert($('guideDialog').open,'Settings cannot reopen the guide');$('guideClose').click();
    panel('custom');
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');const gradient=context.createLinearGradient(0,0,256,256);gradient.addColorStop(0,'#8b9dff');gradient.addColorStop(1,'#152d4c');context.fillStyle=gradient;context.fillRect(0,0,256,256);context.fillStyle='#e5eaff';context.font='bold 160px sans-serif';context.textAlign='center';context.fillText('P',128,185);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await importImage(new File([blob],'내 활동.png',{type:'image/png'}));
    const imageId=$('localImage').value;assert(imageId.length===64,'File image was not selected');
    await wait(()=>$('manualPreviewImage').complete&&$('manualPreviewImage').naturalWidth>0);
    $('manualTitle').value='이미지와 함께 집중';$('manualTitle').dispatchEvent(new Event('input',{bubbles:true}));$('manualForm').requestSubmit();
    await wait(()=>latest.config.manual.imageId===imageId);
    $('presetName').value='내 이미지 프리셋';$('savePreset').click();await wait(()=>latest.config.presets.some(item=>item.manual.imageId===imageId));
    const selected=$('localImage').value;await loadDiscordImages();assert($('localImage').value===selected,'Refreshing Discord images changed the local image');
    window.studioVerification={done:true,imageSaved:true,presetImageSaved:true,guidePreferenceSaved:true,guideReopened:true,imageId};
  }catch(error){window.studioVerification={done:true,error:error.stack||error.message};}
})();
