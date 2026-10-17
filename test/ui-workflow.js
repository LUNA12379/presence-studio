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
    await wait(()=>!$('refreshDiscordImages').disabled);
    assert($('discordImage').options.length===1,'Fixture should start with a cached empty list');
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=320;const context=canvas.getContext('2d');const gradient=context.createLinearGradient(0,0,480,320);gradient.addColorStop(0,'#8b9dff');gradient.addColorStop(1,'#152d4c');context.fillStyle=gradient;context.fillRect(0,0,480,320);context.fillStyle='#e5eaff';context.font='bold 160px sans-serif';context.textAlign='center';context.fillText('P',240,215);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),file=new File([blob],'내 활동.png',{type:'image/png'}),beforeCount=imageCatalog.length,beforeSelection=$('localImage').value;
    let importing=importImage(file);await wait(()=>$('cropDialog').open);
    $('cropCancel').click();await importing;
    assert(imageCatalog.length===beforeCount&&$('localImage').value===beforeSelection,'Cancel changed saved images');
    importing=importImage(file);await wait(()=>$('cropDialog').open);
    assert($('cropSize').value==='1024'&&!$('cropUpscale').hidden,'Small source should offer Discord size and explain enlargement');
    $('cropZoom').value='1.7';$('cropZoom').dispatchEvent(new Event('input',{bubbles:true}));
    const beforeMove=$('cropCanvas').toDataURL();$('cropCanvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true}));
    assert($('cropCanvas').toDataURL()!==beforeMove,'Keyboard pan did not change the cropped image');
    $('cropMode').value='contain';$('cropMode').dispatchEvent(new Event('change',{bubbles:true}));
    assert($('cropCanvas').getContext('2d').getImageData(0,0,1,1).data[3]===0,'Whole-image mode did not preserve transparent padding');
    assert($('cropZoom').disabled,'Zoom should be disabled while fitting the whole image');
    $('cropMode').value='crop';$('cropMode').dispatchEvent(new Event('change',{bubbles:true}));$('cropReset').click();
    if(window.studioCaptureCrop){window.studioCropReady=true;await wait(()=>window.studioCropCaptured);}
    $('cropSave').click();await importing;
    const imageId=$('localImage').value;assert(imageId.length===64,'File image was not selected');
    await wait(()=>$('manualPreviewImage').complete&&$('manualPreviewImage').naturalWidth>0);
    assert($('manualPreviewImage').naturalWidth===1024&&$('manualPreviewImage').naturalHeight===1024,'Output is not 1024 square');
    const editing=editLocalImage();await wait(()=>$('cropDialog').open);$('cropSize').value='512';$('cropSize').dispatchEvent(new Event('change',{bubbles:true}));$('cropSave').click();await editing;
    assert(imageCatalog.some(item=>item.id===imageId)&&$('localImage').value!==imageId,'Editing overwrote the original image');
    const smaller=await createImageBitmap(await(await fetch(imageCatalog.find(item=>item.id===$('localImage').value).url)).blob());
    assert(smaller.width===512&&smaller.height===512,'512 output size was ignored');smaller.close();
    $('localImage').value=imageId;$('localImage').dispatchEvent(new Event('change',{bubbles:true}));
    $('refreshDiscordImages').click();await wait(()=>!$('refreshDiscordImages').disabled);
    assert($('discordImage').options.length===2,'Refresh did not replace the cached empty list');
    const discordId=$('discordImage').options[1].value;
    $('discordImage').value=discordId;$('discordImage').dispatchEvent(new Event('change',{bubbles:true}));
    assert($('localImage').value===imageId,'Choosing a Discord image changed the local image');
    assert($('manualPreviewImage').getAttribute('src')===imageCatalog.find(item=>item.id===imageId).url,'Local preview must retain its own image');
    $('manualTitle').value='이미지와 함께 집중';$('manualTitle').dispatchEvent(new Event('input',{bubbles:true}));$('manualForm').requestSubmit();
    await wait(()=>latest.config.manual.imageId===imageId&&latest.config.manual.discordAssetId===discordId);
    $('presetName').value='내 이미지 프리셋';$('savePreset').click();await wait(()=>latest.config.presets.some(item=>item.manual.imageId===imageId&&item.manual.discordAssetId===discordId));
    await loadDiscordImages(true);assert($('localImage').value===imageId&&$('discordImage').value===discordId,'Refreshing Discord images changed a saved selection');
    window.studioVerification={done:true,imageSaved:true,presetImageSaved:true,guidePreferenceSaved:true,guideReopened:true,emptyListRefreshFixed:true,separateImageSelectionsSaved:true,cropCancelSafe:true,cropAndKeyboardPan:true,containTransparency:true,output1024:true,output512:true,recropPreservesOriginal:true,imageId};
  }catch(error){window.studioVerification={done:true,error:error.stack||error.message};}
})();
