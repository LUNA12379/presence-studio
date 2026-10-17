import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const MAX_INSTALLER = 180 * 1024 * 1024;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(a, b) {
  if (!versionPattern.test(a) || !versionPattern.test(b)) throw new Error('버전 정보가 올바르지 않습니다.');
  const left=a.split('.').map(BigInt),right=b.split('.').map(BigInt);
  for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;
  return 0;
}
export function validRepository(value) { return typeof value==='string' && /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(value); }
export function releaseCandidate(release, repository) {
  if(!validRepository(repository)||!release||release.draft||release.prerelease)throw new Error('정식 배포 정보를 확인할 수 없습니다.');
  const version=String(release.tag_name||'').replace(/^v/,'');
  compareVersions(version,version);
  const name=`Presence-Studio-${version}-Setup.exe`;
  const asset=release.assets?.find(item=>item.name===name);
  if(!asset||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||'')||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_INSTALLER)throw new Error('검증 가능한 Windows 설치 파일이 아직 등록되지 않았습니다.');
  const url=new URL(asset.browser_download_url);
  if(url.origin!=='https://github.com'||url.username||url.password||url.search||url.hash||url.pathname!==`/${repository}/releases/download/${release.tag_name}/${name}`)throw new Error('배포 파일 주소가 올바르지 않습니다.');
  return {version,name,url:url.href,sha256:asset.digest.slice(7).toLowerCase(),size:asset.size,notes:String(release.body||'').slice(0,6000),releaseUrl:`https://github.com/${repository}/releases/tag/${release.tag_name}`};
}
async function hashFile(file) {
  const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
function launch(file,args) {
  return new Promise((resolve,reject)=>{const child=spawn(file,args,{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
}
export class UpdateManager {
  constructor({version,repository='',directory,root,fetcher=fetch,launcher=launch,platform=process.platform}) {
    this.version=version;this.repository=repository;this.directory=directory;this.root=root;this.fetcher=fetcher;this.launcher=launcher;this.platform=platform;
    this.state={phase:validRepository(repository)?'idle':'unconfigured',currentVersion:version,latestVersion:'',notes:'',releaseUrl:'',progress:0,checkedAt:0,error:'',repository,canInstall:platform==='win32'};
    this.candidate=null;this.file=null;this.busy=false;
  }
  status(){return {...this.state};}
  cancel(){this.controller?.abort();}
  async check() {
    if(this.busy)return this.status();
    if(!validRepository(this.repository)){this.state.phase='unconfigured';return this.status();}
    this.busy=true;this.controller=new AbortController();this.state.phase='checking';this.state.error='';this.candidate=null;this.file=null;
    try{
      const response=await this.fetcher(`https://api.github.com/repos/${this.repository}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Presence-Studio', 'Cache-Control':'no-cache'},redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(10000),this.controller.signal])});
      if(!response.ok)throw new Error(response.status===404?'공개된 정식 배포가 아직 없거나 배포처에 접근할 수 없어요.':'업데이트 서버에 연결하지 못했어요. 잠시 뒤 다시 확인하세요.');
      const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>256*1024)throw new Error('배포 정보가 너무 큽니다.');chunks.push(chunk);}
      const release=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const candidate=releaseCandidate(release,this.repository);
      this.candidate=candidate;
      Object.assign(this.state,{phase:compareVersions(candidate.version,this.version)>0?'available':'current',latestVersion:candidate.version,notes:candidate.notes,releaseUrl:candidate.releaseUrl,checkedAt:Date.now(),progress:0});
    }catch(error){this.state.phase='error';this.state.error=error.name==='TimeoutError'?'업데이트 확인 시간이 초과됐어요. 다시 시도하세요.':error.message;}
    finally{this.busy=false;}
    return this.status();
  }
  async download() {
    if(this.busy||!this.candidate||compareVersions(this.candidate.version,this.version)<=0)return this.status();
    this.busy=true;this.controller=new AbortController();this.state.phase='downloading';this.state.error='';this.state.progress=0;this.file=null;
    const candidate={...this.candidate},file=path.join(this.directory,`setup-${candidate.version}-${candidate.sha256.slice(0,16)}.exe`),partial=file+'.part';
    try{
      fs.mkdirSync(this.directory,{recursive:true});
      let url=candidate.url,response;
      const signal=AbortSignal.any([AbortSignal.timeout(180000),this.controller.signal]);
      for(let redirect=0;redirect<5;redirect++){
        response=await this.fetcher(url,{redirect:'manual',signal,headers:{'User-Agent':'Presence-Studio'}});
        if([301,302,303,307,308].includes(response.status)){
          const next=new URL(response.headers.get('location'),url);await response.body?.cancel();
          if(next.protocol!=='https:'||next.username||next.password||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))throw new Error('허용되지 않은 다운로드 주소입니다.');
          url=next.href;continue;
        }
        break;
      }
      if(!response?.ok)throw new Error('설치 파일을 내려받지 못했어요. 다시 시도하세요.');
      const hash=createHash('sha256');let size=0;const descriptor=fs.openSync(partial,'w',0o600);
      try{
        for await(const chunk of response.body){size+=chunk.length;if(size>candidate.size||size>MAX_INSTALLER)throw new Error('설치 파일 크기가 배포 정보와 다릅니다.');hash.update(chunk);fs.writeSync(descriptor,chunk);this.state.progress=Math.min(99,Math.floor(size/candidate.size*100));}
        if(size!==candidate.size||hash.digest('hex')!==candidate.sha256)throw new Error('설치 파일 검증에 실패했어요. 파일을 설치하지 않았습니다.');
        fs.fsyncSync(descriptor);
      }finally{fs.closeSync(descriptor);}
      fs.renameSync(partial,file);this.file=file;this.state.phase='ready';this.state.progress=100;
    }catch(error){try{fs.rmSync(partial,{force:true});}catch{}this.state.phase='error';this.state.error=error.name==='TimeoutError'?'다운로드 시간이 초과됐어요. 다시 시도하세요.':error.message;}
    finally{this.busy=false;}
    return this.status();
  }
  async install() {
    if(this.busy||this.state.phase!=='ready'||!this.file||!this.candidate)throw new Error('업데이트를 먼저 내려받으세요.');
    if(this.platform!=='win32')throw new Error('Windows 데스크톱에서 설치할 수 있어요.');
    this.busy=true;
    try{
      if(await hashFile(this.file)!==this.candidate.sha256)throw new Error('다운로드 후 파일이 변경됐어요. 업데이트를 다시 확인하세요.');
      const args=['/SILENT'];
      await this.launcher(this.file,args);this.state.phase='installing';
    }catch(error){this.state.phase='error';this.state.error=error.message;throw error;}
    finally{this.busy=false;}
    return this.status();
  }
}
