// Run by the native verifier with an isolated profile, never with real user data.
(async()=>{
  window.studioLocaleVerification={done:false};
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const wait=async predicate=>{for(let i=0;i<80;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Language UI timed out');};
  const switchTo=async language=>{document.querySelector(`.topbar [data-language="${language}"]`).click();await wait(()=>!languageBusy&&latest.config.language===language&&document.documentElement.lang===language);};
  const capture=async name=>{window.studioLocaleCapture=name;await wait(()=>!window.studioLocaleCapture);};
  try{
    const original=JSON.stringify([latest.config.manual,latest.config.presets,latest.config.applicationId,latest.config.customApplicationId]);
    panel('custom');await wait(()=>!$('refreshDiscordImages').disabled);
    const draftTitle='내 활동 <b>저장 안 한 문구</b>',draftState='한국어 사용자 문구는 그대로';
    $('manualTitle').value=draftTitle;$('manualState').value=draftState;$('manualTitle').dispatchEvent(new Event('input',{bubbles:true}));
    const draftImage=mediaFields();
    $('applicationId').value='987654321098765432';$('applicationId').dispatchEvent(new Event('input',{bubbles:true}));
    await switchTo('en');await refresh();
    assert($('pageName').textContent==='Customize','Breadcrumb did not switch to English');
    assert($('manualTitle').value===draftTitle&&$('manualState').value===draftState,'Switch discarded activity draft');
    assert($('manualPreviewTitle').textContent===draftTitle&&!$('manualPreviewTitle').querySelector('b'),'User content was translated or interpreted as HTML');
    assert($('applicationId').value==='987654321098765432','Unsaved ID was overwritten');
    assert(JSON.stringify(mediaFields())===JSON.stringify(draftImage),'Image selection changed');
    assert($('savePreset').textContent.includes('Save as preset')&&$('localImage').options[0].text==='No image','Editor controls were not translated');
    assert($('manualTimer').querySelector('[value="countdown"]').textContent==='Time remaining','Timer options were not translated');
    assert(t('타이머 분: 1~1440 범위를 입력하세요.')==='Timer minutes must be between 1 and 1440.','Validation translation failed');
    assert(JSON.stringify([latest.config.manual,latest.config.presets,latest.config.applicationId,latest.config.customApplicationId])===original,'Language save changed stored content or identity');
    await capture('custom-en');
    const editing=editLocalImage();await wait(()=>$('cropDialog').open);
    assert($('cropTitle').textContent==='Frame your image'&&$('cropSave').textContent==='Save image','Crop editor was not translated');
    await capture('crop-en');$('cropCancel').click();await editing;
    panel('home');await capture('dashboard-en');
    panel('settings');assert($('checkUpdate').textContent==='Check for updates','Update controls were not translated');await capture('settings-en');
    showGuide(0);assert($('guideBody').textContent.includes('Developer Portal'),'Guide did not switch to English');await capture('guide-en');
    // The language picker inside the modal must work without closing the guide.
    document.querySelector('#guideDialog [data-language="ko"]').click();await wait(()=>!languageBusy&&uiLanguage==='ko');
    assert($('guideDialog').open&&$('guideBody').textContent.includes('개발자 페이지'),'Guide language switch failed');
    $('guideDialog').close();assert($('manualTitle').value===draftTitle,'Switching back discarded draft');
    panel('custom');assert($('savePreset').textContent.includes('프리셋으로 저장'),'Korean controls were not restored');
    await switchTo('en');
    const first=await api('status');assert(first.config.language==='en','Language was not saved on server');
    // Leave English persisted so the native verifier can reload the entire page.
    window.studioLocaleVerification={done:true,english:true,korean:true,draftPreserved:true,identityPreserved:true,imagesPreserved:true,userContentPreserved:true,guide:true,updates:true};
  }catch(error){window.studioLocaleVerification={done:true,error:error.stack||error.message};}
})();
