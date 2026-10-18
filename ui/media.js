let imageCatalog=[], discordAssets=[], assetsApplicationId='', imageSignature='', mediaBusy=false;
function mediaFields(){const option=$('discordImage').selectedOptions[0];return{imageId:$('localImage').value,discordAssetId:$('discordImage').value,discordAssetAppId:option?.dataset.applicationId||''};}
function manualImageUrl(m){return imageCatalog.find(item=>item.id===m.imageId)?.url||(m.discordAssetId&&m.discordAssetAppId?`https://cdn.discordapp.com/app-assets/${m.discordAssetAppId}/${m.discordAssetId}.png`:m.imageUrl);}
function imageOption(value,label,applicationId){const option=new Option(label,value);if(applicationId)option.dataset.applicationId=applicationId;return option;}
function setMedia(m){
  $('localImage').value=m.imageId||'';
  if(m.discordAssetId&&!Array.from($('discordImage').options).some(option=>option.value===m.discordAssetId))$('discordImage').append(imageOption(m.discordAssetId,t('저장된 Discord 이미지'),m.discordAssetAppId));
  $('discordImage').value=m.discordAssetId||'';
  updateImageActions();
}
function updateImageActions(){const unavailable=mediaBusy||!imageCatalog.some(item=>item.id===$('localImage').value);$('editImage').disabled=unavailable;$('exportImage').disabled=unavailable;}
function syncMedia(data){
  const signature=JSON.stringify([uiLanguage,data.images||[]]);
  if(signature!==imageSignature){imageSignature=signature;imageCatalog=data.images||[];const selected=$('localImage').value;$('localImage').replaceChildren(imageOption('',t('이미지 없음')),...imageCatalog.map(item=>imageOption(item.id,item.name)));$('localImage').value=selected;}
  const applicationId=data.config.customApplicationId||data.config.applicationId;
  $('registerDiscordImage').href=applicationId?`https://discord.com/developers/applications/${applicationId}/rich-presence/assets`:'https://discord.com/developers/applications';
  $('manualIdentityNote').textContent=data.config.customApplicationId?t('직접 꾸민 활동은 커스텀 전용 애플리케이션의 이름으로 표시해요. YouTube는 기본 ID, SoundCloud는 설정한 전용 ID를 사용합니다.'):t('현재 커스텀 활동도 기본 애플리케이션의 이름으로 표시해요. 설정에 커스텀 전용 ID를 저장하면 자동 감지와 다른 이름을 쓸 수 있어요.');
  $('discordImageTarget').textContent=applicationId?t('조회 대상: {kind} 애플리케이션 · {id}', {kind:data.config.customApplicationId?t('커스텀 전용'):t('기본'),id:applicationId}):t('먼저 연결 & 설정에서 Application ID를 저장하세요.');
  if(assetsApplicationId&&assetsApplicationId!==applicationId){assetsApplicationId='';discordAssets=[];$('discordImage').replaceChildren(imageOption('',t('기본 앱 이미지')));$('discordImageStatus').textContent=t('ID가 바뀌었어요. 목록을 새로 불러오세요.');}
  updateImageActions();
}
async function loadDiscordImages(force=false){
  if($('refreshDiscordImages').disabled)return;
  $('refreshDiscordImages').disabled=true;$('discordImageStatus').textContent=t('등록한 이미지를 불러오는 중…');
  try{
    const result=await api(force?'discord-assets?refresh=1':'discord-assets');
    if(result.applicationId!==(latest.config.customApplicationId||latest.config.applicationId)){$('discordImageStatus').textContent=t('ID가 바뀌었어요. 목록을 다시 새로고침하세요.');return;}
    const selected=mediaFields();assetsApplicationId=result.applicationId;discordAssets=result.assets;
    $('discordImage').replaceChildren(imageOption('',t('기본 앱 이미지')),...discordAssets.map(item=>imageOption(item.id,item.name,item.applicationId)));
    setMedia({...selected});
    $('discordImageStatus').textContent=result.assets.length?t('{count}개 이미지 · 선택한 뒤 활동이나 프리셋을 저장하세요.', {count:result.assets.length}):t('이 애플리케이션에서 이미지를 찾지 못했어요. 위 조회 대상과 등록한 앱이 같은지 확인하고, 개발자 페이지에서 저장을 마친 뒤 목록을 새로고침하세요.');
  }catch(e){$('discordImageStatus').textContent=t(e.message);}
  finally{$('refreshDiscordImages').disabled=false;}
}
async function storeImage(blob,name){
  const response=await fetch('/api/images',{method:'POST',headers:{'X-Bridge-Token':token,'Content-Type':'image/png','X-Image-Name':encodeURIComponent(name.slice(0,120))},body:blob,signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||t('이미지를 저장하지 못했어요.'));
  dirty.add('manualForm');syncMedia({...latest,images:result.images});$('localImage').value=result.image.id;$('manualImage').value='';previewManual();
  $('imageStatus').textContent=t('{name} · 보관했어요. 활동·프리셋을 저장하거나 ‘PNG로 저장’으로 Discord에 올릴 파일을 꺼내세요.', {name:result.image.name});
}
async function importImage(file){
  if(!file||mediaBusy)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){notify(t('15MB 이하의 PNG, JPG, WebP 파일을 선택하세요.'));return;}
  mediaBusy=true;$('pickImage').disabled=true;updateImageActions();
  try{
    const bitmap=await createImageBitmap(file);
    try{
      const {cropImage}=await import('./crop.js');await cropImage(bitmap,file.name,storeImage);
    }finally{bitmap.close();}
  }catch(e){notify(t(e.message)||t('이미지를 열지 못했어요. 다른 파일을 선택해 주세요.'));}
  finally{mediaBusy=false;$('pickImage').disabled=false;$('imageFile').value='';updateImageActions();}
}
async function editLocalImage(){
  const selected=imageCatalog.find(item=>item.id===$('localImage').value);if(!selected||mediaBusy)return;
  mediaBusy=true;updateImageActions();$('pickImage').disabled=true;
  try{
    const response=await fetch(selected.url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(t('보관한 이미지를 열지 못했어요.'));
    const bitmap=await createImageBitmap(await response.blob());
    try{const {cropImage}=await import('./crop.js');await cropImage(bitmap,selected.name,storeImage);}finally{bitmap.close();}
  }catch(e){notify(t(e.message)||t('이미지를 열지 못했어요.'));}
  finally{mediaBusy=false;$('pickImage').disabled=false;updateImageActions();}
}
function exportLocalImage(){
  const selected=imageCatalog.find(item=>item.id===$('localImage').value);if(!selected||mediaBusy)return;
  const link=document.createElement('a'),url=new URL(selected.url,location.href);url.searchParams.set('download','1');
  link.href=url.href;link.download='presence-image.png';document.body.append(link);link.click();link.remove();
}
function initMedia(){
  $('pickImage').onclick=()=>$('imageFile').click();$('imageFile').onchange=()=>importImage($('imageFile').files[0]);
  for(const name of ['dragenter','dragover'])$('imageDrop').addEventListener(name,event=>{event.preventDefault();$('imageDrop').classList.add('dragging');});
  $('imageDrop').addEventListener('dragleave',()=>$('imageDrop').classList.remove('dragging'));
  $('imageDrop').addEventListener('drop',event=>{event.preventDefault();$('imageDrop').classList.remove('dragging');importImage(event.dataTransfer.files[0]);});
  for(const id of ['localImage','discordImage'])$(id).onchange=()=>{
    dirty.add('manualForm');$('manualImage').value='';previewManual();updateImageActions();
    if(id==='localImage'){
      const selected=imageCatalog.find(item=>item.id===$('localImage').value);
      $('imageStatus').textContent=selected?t('{name} · 선택했어요. 활동·프리셋을 저장하면 이 선택을 기억합니다.', {name:selected.name}):t('로컬 이미지를 선택하지 않았어요.');
    }
  };
  $('editImage').onclick=editLocalImage;$('exportImage').onclick=exportLocalImage;
  $('refreshDiscordImages').onclick=()=>loadDiscordImages(true);
  $('openImageFolder').onclick=async()=>{try{await mutate('images/open-folder',{});}catch(e){notify(t(e.message));}};
}
