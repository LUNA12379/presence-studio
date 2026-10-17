const guideSteps=[
  {title:'내 활동을, 나답게',label:'시작하기',symbol:'✦',body:'<p>Presence Studio는 지금 보는 영상이나 직접 꾸민 활동을 Discord와 오버레이에 보여줘요.</p><div class="guide-cards"><div><strong>자동 감지</strong><p>Edge의 YouTube · YouTube Music</p></div><div><strong>직접 꾸미기</strong><p>게임, 작업, 휴식을 내 문구로</p></div></div><ol><li>Discord 데스크톱 앱을 실행하세요.</li><li><a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Discord 개발자 페이지</a>의 <b>New Application</b>에서 앱을 만드세요. 이름은 <b>Discord 활동에 표시하고 싶은 이름</b>으로 정하세요.</li><li>General Information의 Application ID를 복사해 <b>연결 & 설정 → 기본 Application ID</b>에 저장하세요.</li><li>앱이 안내하는 Edge 확장 폴더를 로드하고 YouTube 탭을 새로고침하세요.</li></ol>'},
  {title:'이미지마다 표시되는 곳이 달라요',label:'이미지',symbol:'▧',body:'<div class="guide-cards"><div><strong>내 이미지</strong><p>앱 미리보기 · 데스크톱 · OBS 오버레이</p></div><div><strong>Discord에 표시할 이미지</strong><p>Discord 활동 카드의 큰 사진</p></div></div><ol><li><b>내 이미지</b>에서 파일을 고르면 자르기 창이 열려요. 드래그·확대로 위치를 맞추거나 <b>전체 담기</b>로 사진을 모두 담으세요.</li><li>1024 × 1024(권장) 또는 512 × 512 크기로 <b>이미지 보관하기</b>를 누르세요. 보관한 사진도 <b>자르기 · 크기 맞추기</b>로 다시 편집할 수 있어요.</li><li><b>PNG로 저장</b>한 파일을 <b>Discord 이미지 등록 → Rich Presence → Art Assets</b>에 올리고 저장하세요. 커스텀 전용 ID가 있으면 그 앱에 등록해요.</li><li><b>목록 새로고침</b> 후 Discord 이미지를 고르고 <b>이 활동으로 표시하기</b> 또는 <b>프리셋으로 저장</b>을 누르세요.</li></ol><div class="guide-note">두 곳에 다른 사진을 써도 돼요. 내 이미지를 고르지 않으면 Discord 이미지나 고급 이미지 주소를 앱·오버레이에도 사용해요. PC 사진은 Discord로 자동 업로드되지 않아요.</div>'},
  {title:'앱을 두 개 만드는 이유',label:'이름과 아이콘',symbol:'◇',body:'<p>Discord 활동의 앱 이름은 연결한 애플리케이션 이름을 따라요. 자동 감지와 커스텀 활동의 이름을 다르게 쓰려면 앱을 두 개 만드세요.</p><ol><li><b>자동 감지용 앱</b>을 만드세요. 예를 들어 YouTube라는 이름으로 만들고 <b>기본 Application ID</b>에 저장하세요.</li><li><b>커스텀 활동용 앱</b>을 하나 더 만드세요. Presence Studio 등 원하는 이름을 정하고 <b>커스텀 활동 전용 Application ID</b>에 저장하세요.</li><li>자동 감지와 직접 꾸미기를 전환하면 해당 앱으로 자동 연결돼요. 같은 이름을 써도 된다면 전용 ID를 비워 두고 앱 하나만 써도 돼요.</li></ol><div class="guide-note guide-warning"><strong>YouTube라는 이름을 사용할 때 주의</strong><p>그 ID를 커스텀 활동에도 쓰면 게임·작업 문구를 적어도 앱 이름은 YouTube로 남고, Discord가 작은 유튜브 로고를 붙여 유튜브 활동처럼 보일 수 있어요. 실제 감지 범위가 바뀌는 것은 아니에요.</p></div><p class="hint">이 작은 로고는 Discord가 이름을 보고 붙이는 표시로, 개발자 페이지의 App Icon이나 직접 고른 큰 사진과 달라요. 저장한 두 ID는 PC를 다시 켜도 유지됩니다.</p>'},
  {title:'내 화면과 방송 화면까지',label:'오버레이와 마무리',symbol:'▣',body:'<ol><li><b>오버레이 → 데스크톱에 표시</b>를 켜고 카드를 원하는 위치로 옮기세요.</li><li>OBS에서는 브라우저 소스를 추가하고 앱에서 복사한 주소와 크기를 입력하세요.</li><li><b>Ctrl+Shift+P</b>는 활동 공유, <b>Ctrl+Shift+O</b>는 오버레이를 켜고 꺼요.</li><li>X 버튼으로 닫으면 트레이에 남아요. 완전히 종료하려면 트레이 메뉴나 설정의 종료 버튼을 누르세요.</li></ol><div class="guide-note">설명서는 언제든 <b>연결 & 설정 → 설명서 보기</b>에서 다시 열 수 있어요.</div>'}
];
let guideStep=0,guideReturnFocus=null;
function renderGuide(){
  const step=guideSteps[guideStep];$('guideTitle').textContent=step.title;$('guideSymbol').textContent=step.symbol;$('guideBody').innerHTML=step.body;$('guideCounter').textContent=`${guideStep+1} / ${guideSteps.length} · ${step.label}`;
  $('guideBack').disabled=guideStep===0;$('guideNext').hidden=guideStep===guideSteps.length-1;$('guideFinish').hidden=guideStep!==guideSteps.length-1;$('guidePreference').hidden=guideStep!==guideSteps.length-1;
  $('guideProgress').value=guideStep+1;$('guideTitle').focus();
}
function showGuide(step=0){guideReturnFocus=document.activeElement;guideStep=Math.max(0,Math.min(guideSteps.length-1,step));$('guideNeverAgain').checked=latest?.config.showGuideOnStartup===false;$('guideSaveError').textContent='';if(!$('guideDialog').open)$('guideDialog').showModal();renderGuide();}
function initGuide(){
  $('openGuide').onclick=()=>showGuide();$('guideClose').onclick=()=>$('guideDialog').close();
  $('guideBack').onclick=()=>{guideStep--;renderGuide();};$('guideNext').onclick=()=>{guideStep++;renderGuide();};
  $('guideDialog').addEventListener('close',()=>guideReturnFocus?.focus());
  $('guideFinish').onclick=async()=>{
    $('guideFinish').disabled=true;$('guideSaveError').textContent='';
    try{render(await mutate('config',{showGuideOnStartup:!$('guideNeverAgain').checked}));$('guideDialog').close();}
    catch(e){$('guideSaveError').textContent=e.message;}
    finally{$('guideFinish').disabled=false;}
  };
}
