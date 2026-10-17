import {cropRegion,containRect} from './crop-math.js';
const el=id=>document.getElementById(id);
let session=null,initialized=false;

function paint(canvas){
  const s=session,ctx=canvas.getContext('2d'),size=canvas.width;
  ctx.clearRect(0,0,size,size);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  if(s.mode==='contain'){
    const rect=containRect(s.bitmap.width,s.bitmap.height,size);
    ctx.drawImage(s.bitmap,rect.x,rect.y,rect.width,rect.height);
  }else{
    const rect=cropRegion(s.bitmap.width,s.bitmap.height,s.zoom,s.centerX,s.centerY);
    // Keep the center in bounds so dragging back from an edge responds immediately.
    s.centerX=(rect.x+rect.size/2)/s.bitmap.width;s.centerY=(rect.y+rect.size/2)/s.bitmap.height;
    ctx.drawImage(s.bitmap,rect.x,rect.y,rect.size,rect.size,0,0,size,size);
  }
}
function render(){
  if(!session)return;
  paint(el('cropCanvas'));
  const s=session,contain=s.mode==='contain',output=Number(el('cropSize').value);
  el('cropSave').textContent=t(s.saving?'이미지를 보관하는 중…':'이미지 보관하기');
  el('cropZoom').disabled=contain;el('cropZoomValue').textContent=contain?t('전체 보기'):`${Math.round(s.zoom*100)}%`;
  el('cropCanvas').classList.toggle('is-contained',contain);el('cropGrid').hidden=contain;
  el('cropOutput').textContent=`${output} × ${output} · PNG`;
  const source=contain?Math.max(s.bitmap.width,s.bitmap.height):cropRegion(s.bitmap.width,s.bitmap.height,s.zoom).size;
  el('cropUpscale').hidden=source>=output;
  el('cropHelp').textContent=contain?t('사진 전체를 담고 남는 공간은 투명하게 저장해요.'):t('사진을 드래그하거나 방향키로 움직이세요. Shift + 방향키로 크게 이동해요.');
}
function moveBy(dx,dy){
  const s=session;if(!s||s.saving||s.mode==='contain')return;
  const region=cropRegion(s.bitmap.width,s.bitmap.height,s.zoom),width=el('cropCanvas').getBoundingClientRect().width;
  s.centerX-=dx/width*region.size/s.bitmap.width;s.centerY-=dy/width*region.size/s.bitmap.height;render();
}
function finish(){
  if(!session)return;
  const s=session;session=null;s.resolve(s.saved===true);s.focus?.focus();
}
function cancel(){if(session&&!session.saving)el('cropDialog').close();}
async function save(){
  const s=session;if(!s||s.saving)return;
  s.saving=true;s.drag=null;el('cropError').textContent='';el('cropSave').textContent=t('이미지를 보관하는 중…');
  for(const id of ['cropSave','cropCancel','cropClose','cropReset','cropMode','cropZoom','cropSize'])el(id).disabled=true;
  try{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=Number(el('cropSize').value);paint(canvas);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob||blob.size>4*1024*1024)throw new Error(t('PNG 파일이 4MB를 넘어요. 512 × 512 크기를 선택해 다시 저장하세요.'));
    const stem=s.name.replace(/\.[^.]+$/,'').replace(/-discord-(512|1024)$/,'').slice(0,85)||'image';
    await s.onSave(blob,`${stem}-discord-${canvas.width}.png`);
    s.saved=true;el('cropDialog').close();
  }catch(error){el('cropError').textContent=t(error.message)||t('이미지를 저장하지 못했어요. 다시 시도해 주세요.');}
  finally{
    s.saving=false;
    for(const id of ['cropSave','cropCancel','cropClose','cropReset','cropMode','cropZoom','cropSize'])el(id).disabled=false;
    el('cropSave').textContent=t('이미지 보관하기');render();
  }
}
function initialize(){
  if(initialized)return;initialized=true;window.addEventListener('studio-language',render);
  el('cropClose').onclick=cancel;el('cropCancel').onclick=cancel;el('cropSave').onclick=save;
  el('cropDialog').addEventListener('cancel',event=>{if(session?.saving)event.preventDefault();});
  el('cropDialog').addEventListener('close',finish);
  el('cropZoom').oninput=()=>{if(session){session.zoom=Number(el('cropZoom').value);render();}};
  el('cropMode').onchange=()=>{if(session){session.mode=el('cropMode').value;session.drag=null;render();}};
  el('cropSize').onchange=render;
  el('cropReset').onclick=()=>{if(session){session.centerX=session.centerY=.5;session.zoom=1;el('cropZoom').value=1;render();}};
  const canvas=el('cropCanvas');
  canvas.addEventListener('pointerdown',event=>{
    if(!session||session.saving||session.mode==='contain'||event.button!==0)return;
    event.preventDefault();canvas.focus();session.drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(session?.drag?.id!==event.pointerId)return;
    const previous=session.drag;session.drag={id:event.pointerId,x:event.clientX,y:event.clientY};moveBy(event.clientX-previous.x,event.clientY-previous.y);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{if(session)session.drag=null;});
  canvas.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!delta)return;event.preventDefault();const step=event.shiftKey?25:5;moveBy(delta[0]*step,delta[1]*step);
  });
}
export function cropImage(bitmap,name,onSave){
  initialize();
  if(session)return Promise.reject(new Error(t('열려 있는 이미지 편집을 먼저 마쳐 주세요.')));
  return new Promise(resolve=>{
    session={bitmap,name,onSave,resolve,mode:'crop',zoom:1,centerX:.5,centerY:.5,saving:false,focus:document.activeElement};
    el('cropMode').value='crop';el('cropZoom').value=1;el('cropSize').value='1024';el('cropError').textContent='';
    el('cropSource').textContent=t('{name} · 원본 {width} × {height}', {name,width:bitmap.width,height:bitmap.height});
    el('cropDialog').showModal();render();el('cropCanvas').focus();
  });
}
