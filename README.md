# Presence Studio

Edge에서 재생하는 YouTube / YouTube Music을 Discord 활동으로 표시하는 Windows 앱입니다. 직접 입력한 활동, 프리셋, 데스크톱 오버레이와 OBS 브라우저 소스를 한곳에서 관리합니다.

## 시작하기

Windows 10/11 x64, Node.js 20 이상, .NET Framework 4.7.2 이상과 Microsoft Edge WebView2 Runtime이 필요합니다. Discord 활동을 표시하려면 Discord 데스크톱 앱도 실행해야 합니다. 별도 npm 패키지는 사용하지 않습니다.

1. 배포 ZIP을 폴더에 풀고 `Start.cmd`를 실행합니다. 소스만 내려받았다면 먼저 아래 빌드를 실행합니다.
2. **연결 & 설정 → 내 Discord 애플리케이션**에서 본인의 **Application ID**를 입력하고 **ID 저장 후 연결**을 누릅니다. [Discord 개발자 페이지](https://discord.com/developers/applications)에서 애플리케이션을 생성한 뒤 General Information의 ID를 복사하면 됩니다. 봇 토큰이나 계정 비밀번호는 필요하지 않습니다.
3. 같은 화면의 **Edge 확장 연결 → 폴더 경로 복사**를 누릅니다. Edge의 `edge://extensions`에서 개발자 모드를 켜고 **압축 풀린 확장 로드**로 그 폴더를 선택합니다.
4. YouTube 탭을 새로고침하고 재생합니다. Discord에서 활동 공유도 켜 주세요.

처음 실행하면 개인 ID가 비어 있습니다. 저장한 ID와 프리셋, 오버레이 설정은 `%APPDATA%\PresenceStudio\config.json`에 기록되어 앱 종료와 Windows 재시작 후에도 유지됩니다. 이 파일을 삭제하면 설정이 초기화됩니다.

확장은 앱이 `%APPDATA%\PresenceStudio\edge-extension`에 자동으로 준비합니다. 저장소의 `extension` 폴더는 소스이므로 직접 로드하지 마세요. 앱 업데이트 후 Edge 확장 관리에서 새로고침하면 새 확장 코드가 적용됩니다.

## 기능

- 자동 감지와 수동 활동 전환, 재생 탭 고정, 제목/채널 제외 키워드
- 제목·상태·이미지·링크 버튼, 경과 시간·카운트다운, 최대 30개 프리셋
- 항상 위에 표시하는 오버레이: 테마, 색상, 크기, 불투명도, 위치 잠금, 클릭 통과
- OBS 투명 브라우저 소스: 오버레이 화면에서 주소 복사
- 트레이, Windows 로그인 자동 실행, `Ctrl+Shift+P` 공유 토글, `Ctrl+Shift+O` 오버레이 토글

## 개발 / 빌드

Windows PowerShell에서 프로젝트 폴더를 열고 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop\Build.ps1
.\Start.cmd
node --test test/*.test.mjs
```

빌드는 Windows의 .NET Framework C# 컴파일러를 사용합니다. WebView2 SDK DLL이 없으면 공식 NuGet에서 고정 버전 `1.0.3537.50`을 내려받고 SHA-256을 검증합니다. 실행 파일과 SDK DLL은 Git에 포함하지 않습니다.

앱을 완전히 종료한 뒤 다음 명령으로 배포 ZIP을 만들 수 있습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Package.ps1
```

결과는 `dist/Presence-Studio-2.1.0-win-x64.zip`입니다. 허용한 파일만 묶기 때문에 개인 설정, 연결 키, OBS 키, 개발용 캐시는 들어가지 않습니다. ZIP에는 Node.js와 WebView2 Runtime 설치 파일이 포함되지 않습니다.

## 설정과 연결

- 사용자 설정은 앱 설치 위치와 분리되어 있습니다. 고급 사용자는 `PRESENCE_STUDIO_DATA_DIR` 환경 변수로 저장 위치를 바꿀 수 있습니다.
- v1/v2.0의 프로그램 폴더에 있던 `config.json`은 사용자 설정이 아직 없을 때 한 번 가져옵니다. 기존 ID, 확장 연결 키, 프리셋을 유지하며 기존 파일을 삭제하지 않습니다. 이후에는 사용자별 설정을 우선합니다.
- 이미 설치한 구버전 확장도 연결 키가 유지되므로 계속 동작합니다. 업데이트를 받으려면 앱이 안내하는 새 확장 폴더를 로드하고 이전 확장은 제거하세요.
- `127.0.0.1:49832`에서 로컬 서버를 실행합니다. 확장 및 설정 변경은 로컬 연결 키로 인증하며, OBS에는 표시 전용 키를 사용합니다.
- 시청 기록은 파일에 저장하지 않습니다. 확장은 YouTube와 YouTube Music에서만 동작하며 InPrivate에서는 정보를 전달하지 않습니다.
- 이미지 표시 시 해당 이미지 서버에 요청합니다. 수동 이미지에는 공개 HTTPS 이미지 URL을 사용하세요.
- Discord에 표시되는 앱 이름은 본인의 Discord Application 이름에 따라 결정됩니다.

## 파일 구성

`desktop/`은 WinForms 셸과 네이티브 오버레이, `ui/`는 설정 화면, `lib/`는 설정 저장·활동 선택·Discord IPC, `extension/`은 Edge 확장 소스입니다. `server-v2.mjs`가 로컬 API와 상태를 관리합니다.

프로그램 폴더 전체를 직접 압축해서 배포하지 말고 `Package.ps1`을 사용하세요. 개인용 `config.json`, 생성된 `connection.js`, `.env` 등은 Git에서 제외됩니다.
