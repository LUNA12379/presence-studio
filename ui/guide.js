const guideSteps=[
  {title:'내 활동을, 나답게',label:'시작하기',symbol:'✦',body:'<p>Presence Studio는 지금 보는 영상이나 직접 꾸민 활동을 Discord와 오버레이에 보여줘요.</p><div class="guide-cards"><div><strong>자동 감지</strong><p>Edge의 YouTube · YouTube Music</p></div><div><strong>직접 꾸미기</strong><p>게임, 작업, 휴식을 내 문구로</p></div></div><ol><li>Discord 데스크톱 앱을 실행하세요.</li><li>연결 & 설정에서 내 Application ID를 저장하세요.</li><li>앱이 안내하는 Edge 확장 폴더를 로드하고 YouTube 탭을 새로고침하세요.</li></ol>'},
  {title:'사진 한 장도, 내 스타일로',label:'이미지',symbol:'▧',body:'<ol><li>직접 꾸미기 → <b>이미지 파일 선택</b>에서 PNG, JPG, WebP를 고르세요. 파일을 끌어 놓아도 돼요.</li><li>사진은 앱이 보관해요. 원본을 옮겨도 유지되고, 다음에는 목록에서 고를 수 있어요.</li><li><b>이 활동으로 표시하기</b> 또는 <b>프리셋으로 저장</b>을 누르면 선택한 이미지도 함께 기억해요.</li></ol><div class="guide-note"><strong>Discord에도 같은 사진을 보여주려면</strong><p>직접 꾸미기의 ‘Discord 이미지 등록’을 열어 Rich Presence의 Art Assets에 파일을 올리세요. 앱에서 ‘목록 새로고침’ 후 선택하면 주소를 입력할 필요가 없어요. PC 사진만 선택하면 앱·오버레이에만 표시돼요. 파일은 자동으로 외부에 업로드되지 않아요.</p></div>'},
  {title:'커스텀 활동에 어울리는 아이콘',label:'이름과 아이콘',symbol:'◇',body:'<p>Discord 카드 맨 위의 이름과 작은 아이콘은 연결한 애플리케이션의 정보를 따라요.</p><ol><li>Discord 개발자 페이지에서 새 애플리케이션을 만들고 이름과 App Icon을 지정하세요.</li><li>연결 & 설정 → <b>커스텀 활동 전용 Application ID</b>에 새 ID를 저장하세요.</li><li>직접 꾸민 활동에서는 이 앱을, YouTube 자동 감지에서는 기본 앱을 사용해요.</li></ol><div class="guide-note">전용 ID를 비워 두면 기본 ID를 함께 사용해요. 기본 앱이 YouTube라면 커스텀 활동에서도 그 이름과 아이콘이 보여요. ID는 저장 후 PC를 다시 켜도 유지됩니다.</div>'},
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
