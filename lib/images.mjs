import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function discordImageUrl(manual) {
  return manual.discordAssetId && manual.discordAssetAppId ? `https://cdn.discordapp.com/app-assets/${manual.discordAssetAppId}/${manual.discordAssetId}.png` : manual.imageUrl || '';
}
export function effectiveApplicationId(config, source) {
  if (config.sourceMode === 'manual') return config.customApplicationId || config.applicationId;
  return source === 'soundcloud' && config.soundcloudApplicationId ? config.soundcloudApplicationId : config.applicationId;
}
export class ImageLibrary {
  constructor(dataDir) { this.directory = path.join(dataDir,'images'); }
  filename(id) { if (!validId(id)) throw new Error('잘못된 이미지 ID입니다.'); return path.join(this.directory,id+'.png'); }
  exists(id) { return validId(id) && fs.existsSync(this.filename(id)); }
  signature(id, token) { return createHmac('sha256',token).update('image:'+id).digest('hex'); }
  url(id, token, origin='') { return this.exists(id) ? `${origin}/media/${id}?key=${this.signature(id,token)}` : ''; }
  list() {
    if (!fs.existsSync(this.directory)) return [];
    return fs.readdirSync(this.directory).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).flatMap(name=>{
      try { const value=JSON.parse(fs.readFileSync(path.join(this.directory,name),'utf8')); return name===value.id+'.json'&&this.exists(value.id)&&typeof value.name==='string' ? [{id:value.id,name:value.name.slice(0,120),createdAt:Number(value.createdAt)||0}] : []; } catch { return []; }
    }).sort((a,b)=>b.createdAt-a.createdAt);
  }
  importPng(bytes, name='이미지') {
    // Only bounded raster PNGs produced by the file picker's canvas are stored.
    if (!Buffer.isBuffer(bytes) || bytes.length>MAX_IMAGE_BYTES || bytes.length<57 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('4MB 이하의 PNG 이미지만 저장할 수 있어요.');
    if(bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)<1||bytes.readUInt32BE(20)<1||bytes.readUInt32BE(16)>2048||bytes.readUInt32BE(20)>2048)throw new Error('이미지 크기를 확인하세요.');
    let offset=8,hasData=false,ended=false;
    while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(size>bytes.length-offset-12)throw new Error('이미지 파일이 손상되었어요.');if(kind==='IDAT')hasData=true;offset+=size+12;if(kind==='IEND'){ended=size===0&&offset===bytes.length;break;}}
    if(!hasData||!ended)throw new Error('이미지 파일이 손상되었어요.');
    const id=createHash('sha256').update(bytes).digest('hex');
    if(this.exists(id)){const existing=this.list().find(item=>item.id===id);if(existing)return existing;}
    if(this.list().length>=60)throw new Error('이미지는 최대 60개까지 보관할 수 있어요.');
    fs.mkdirSync(this.directory,{recursive:true});
    const entry={id,name:String(name).replace(/[\x00-\x1f\\/]/g,'').slice(0,120)||'이미지',createdAt:Date.now()};
    const target=this.filename(id);fs.writeFileSync(target+'.tmp',bytes,{mode:0o600});fs.renameSync(target+'.tmp',target);
    const metadata=path.join(this.directory,id+'.json');fs.writeFileSync(metadata+'.tmp',JSON.stringify(entry),{mode:0o600});fs.renameSync(metadata+'.tmp',metadata);
    return entry;
  }
}
export async function fetchDiscordAssets(applicationId, fetcher=fetch) {
  if(!/^\d{17,22}$/.test(applicationId))throw new Error('먼저 Application ID를 저장하세요.');
  // Discord's CDN can cache an empty list after images have been uploaded.
  const url=new URL(`https://discord.com/api/v10/oauth2/applications/${applicationId}/assets`);
  url.searchParams.set('refresh',randomUUID());
  const response=await fetcher(url.href,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(response.status===429?'잠시 뒤 이미지 목록을 다시 불러와 주세요.':'Discord 이미지 목록을 불러오지 못했어요. Application ID를 확인하세요.');
  const data=await response.json();if(!Array.isArray(data))throw new Error('Discord 이미지 목록 형식이 올바르지 않아요.');
  return data.slice(0,300).filter(a=>/^\d{17,22}$/.test(a.id)&&typeof a.name==='string').map(a=>({id:a.id,name:a.name.slice(0,120),applicationId,url:`https://cdn.discordapp.com/app-assets/${applicationId}/${a.id}.png`}));
}
