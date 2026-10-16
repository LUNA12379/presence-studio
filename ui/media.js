let imageCatalog=[], discordAssets=[], assetsApplicationId='', imageSignature='', mediaBusy=false;
function mediaFields(){const option=$('discordImage').selectedOptions[0];return{imageId:$('localImage').value,discordAssetId:$('discordImage').value,discordAssetAppId:option?.dataset.applicationId||''};}
function manualImageUrl(m){return imageCatalog.find(item=>item.id===m.imageId)?.url||(m.discordAssetId&&m.discordAssetAppId?`https://cdn.discordapp.com/app-assets/${m.discordAssetAppId}/${m.discordAssetId}.png`:m.imageUrl);}
function imageOption(value,label,applicationId){const option=new Option(label,value);if(applicationId)option.dataset.applicationId=applicationId;return option;}
function setMedia(m){
  $('localImage').value=m.imageId||'';
  if(m.discordAssetId&&!Array.from($('discordImage').options).some(option=>option.value===m.discordAssetId))$('discordImage').append(imageOption(m.discordAssetId,'저장된 Discord 이미지',m.discordAssetAppId));
  $('discordImage').value=m.discordAssetId||'';
}
function syncMedia(data){
  const signature=JSON.stringify(data.images||[]);
  if(signature!==imageSignature){imageSignature=signature;imageCatalog=data.images||[];const selected=$('localImage').value;$('localImage').replaceChildren(imageOption('','이미지 없음'),...imageCatalog.map(item=>imageOption(item.id,item.name)));$('localImage').value=selected;}
  const applicationId=data.config.customApplicationId||data.config.applicationId;
  $('registerDiscordImage').href=applicationId?`https://discord.com/developers/applications/${applicationId}/rich-presence/assets`:'https://discord.com/developers/applications';
  $('manualIdentityNote').textContent=data.config.customApplicationId?'커스텀 전용 애플리케이션의 이름과 아이콘으로 표시됩니다.':'현재 기본 애플리케이션의 이름·작은 아이콘을 사용해요. 설정에서 커스텀 전용 ID를 저장하면 따로 표시할 수 있어요.';
  if(assetsApplicationId&&assetsApplicationId!==applicationId){assetsApplicationId='';discordAssets=[];$('discordImage').replaceChildren(imageOption('','기본 앱 이미지'));$('discordImageStatus').textContent='ID가 바뀌었어요. 목록을 새로 불러오세요.';}
}
async function loadDiscordImages(){
  $('refreshDiscordImages').disabled=true;$('discordImageStatus').textContent='등록한 이미지를 불러오는 중…';
  try{
    const result=await api('discord-assets');
    if(result.applicationId!==(latest.config.customApplicationId||latest.config.applicationId))return;
    const selected=mediaFields();assetsApplicationId=result.applicationId;discordAssets=result.assets;
    $('discordImage').replaceChildren(imageOption('','기본 앱 이미지'),...discordAssets.map(item=>imageOption(item.id,item.name,item.applicationId)));
    setMedia({...selected});
    $('discordImageStatus').textContent=result.assets.length?`${result.assets.length}개 이미지 · 선택한 뒤 활동이나 프리셋을 저장하세요.`:'아직 등록된 이미지가 없어요. 아래 등록 페이지에서 파일을 올린 뒤 목록을 새로 불러오세요.';
  }catch(e){$('discordImageStatus').textContent=e.message;}
  finally{$('refreshDiscordImages').disabled=false;}
}
async function importImage(file){
  if(!file||mediaBusy)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){notify('15MB 이하의 PNG, JPG, WebP 파일을 선택하세요.');return;}
  mediaBusy=true;$('pickImage').disabled=true;$('imageStatus').textContent='이미지를 보관하는 중…';
  try{
    const bitmap=await createImageBitmap(file);
    try{
      const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob||blob.size>4*1024*1024)throw new Error('이미지가 너무 커요. 조금 작은 파일을 선택하세요.');
      const response=await fetch('/api/images',{method:'POST',headers:{'X-Bridge-Token':token,'Content-Type':'image/png','X-Image-Name':encodeURIComponent(file.name.slice(0,120))},body:blob,signal:AbortSignal.timeout(15000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'이미지를 저장하지 못했어요.');
      dirty.add('manualForm');syncMedia({...latest,images:result.images});$('localImage').value=result.image.id;$('manualImage').value='';previewManual();
      $('imageStatus').textContent=`${result.image.name} · 이 PC에 보관했어요. 활동 또는 프리셋을 저장하면 함께 기억합니다.`;
    }finally{bitmap.close();}
  }catch(e){$('imageStatus').textContent='이미지를 저장하지 못했어요.';notify(e.message);}
  finally{mediaBusy=false;$('pickImage').disabled=false;$('imageFile').value='';}
}
function initMedia(){
  $('pickImage').onclick=()=>$('imageFile').click();$('imageFile').onchange=()=>importImage($('imageFile').files[0]);
  for(const name of ['dragenter','dragover'])$('imageDrop').addEventListener(name,event=>{event.preventDefault();$('imageDrop').classList.add('dragging');});
  $('imageDrop').addEventListener('dragleave',()=>$('imageDrop').classList.remove('dragging'));
  $('imageDrop').addEventListener('drop',event=>{event.preventDefault();$('imageDrop').classList.remove('dragging');importImage(event.dataTransfer.files[0]);});
  for(const id of ['localImage','discordImage'])$(id).onchange=()=>{dirty.add('manualForm');$('manualImage').value='';previewManual();};
  $('refreshDiscordImages').onclick=loadDiscordImages;
  $('openImageFolder').onclick=async()=>{try{await mutate('images/open-folder',{});}catch(e){notify(e.message);}};
}
