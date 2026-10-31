(async () => {
  const result = window.studioStoreVerification = {done:false};
  const original = latest, previousStopping = stopping;
  const assert = (value,message) => { if(!value)throw Error(message); };
  const wait = async predicate => { for(let i=0;i<80;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100));}throw Error('Store UI timed out'); };
  const fixture = {schema:1,published:true,state:'published',extensionId:'a'.repeat(32),version:'1.4.0',paired:false};
  try {
    stopping=true;
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    storeNoticeDismissed=false;
    render({...original,store:{state:'pending',published:false}});
    assert(!$('storeDialog').open && $('storeInstallLink').hidden && getComputedStyle($('storeInstallLink')).display === 'none','Unreleased store must not display an installation notice or link');
    render({...original,store:{...fixture,extensionId:'https://invalid.example'}});
    assert(!$('storeDialog').open && $('storeInstallLink').hidden,'Invalid store ID produced a link');
    result.unpublishedAndInvalidHidden=true;
    showGuide();render({...original,store:fixture});
    assert(!$('storeDialog').open,'Store notice interrupted the first-run guide');
    $('guideDialog').close();await wait(()=>$('storeDialog').open);
    assert($('storeDialogLink').href===`https://chromewebstore.google.com/detail/${fixture.extensionId}`,'Store link not derived from validated ID');
    result.guideDefersNotice=true;
    for(const language of ['en','ko']) {
      const data={...original,config:{...original.config,language},store:fixture};
      render(data);
      assert($('storeDialogTitle').textContent===(language==='en'?'Install the store extension':'웹 스토어 확장을 설치해 주세요'),'Store notice translation missing');
      window.studioStoreCapture='store-notice-'+language;await wait(()=>!window.studioStoreCapture);
    }
    $('storeLater').click();render({...original,store:fixture});
    assert(!$('storeDialog').open,'Dismissed notice reopened during polling');
    storeNoticeDismissed=false;render({...original,store:{...fixture,paired:true}});
    assert(!$('storeDialog').open,'Paired browser still receives reminder');
    result.dismissAndPairedSuppression=true;
    for(const language of ['en','ko']) {
      render({...original,config:{...original.config,language},store:{state:'pending',published:false}});panel('settings');
      $('createPairingCode').click();await wait(()=>!$('createPairingCode').disabled && !!pairingCode);
      assert(/^[A-F0-9]{4}(-[A-F0-9]{4}){2}$/.test($('pairingCode').value),'Missing generated pairing code');
      assert(!$('pairingCodeBox').hidden && !$('copyPairingCode').disabled,'Generated code cannot be copied');
      $('browserPairing').scrollIntoView({block:'start'});
      window.studioStoreCapture='pairing-'+language;await wait(()=>!window.studioStoreCapture);
      pairingCode.expiresAt=Date.now()-1;renderPairingCode();
      assert($('copyPairingCode').disabled && !$('pairingCode').value,'Expired code still usable');
    }
    result.pairingCodeAndLanguages=true;
  } catch(error) {result.error=error.stack||error.message;}
  finally {
    pairingCode=null;storeNoticeDismissed=true;
    if($('storeDialog').open)$('storeDialog').close();
    render(original);stopping=previousStopping;result.done=true;
  }
})();
