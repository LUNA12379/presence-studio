# Presence Studio

This file contains private source-development notes. Public user guides are in [README.md](README.md) and [README.ko.md](README.ko.md). Only those two files currently belong in the public `LUNA12379/presence-studio-releases` repository. The update channel points to that public repository; never upload private source history or personal settings there.

## 2.7.1 — separate SoundCloud application identity

- `soundcloudApplicationId` is optional and persisted with the other identities. The selected SoundCloud session uses it; empty values fall back to `applicationId`. Manual mode still uses `customApplicationId` or the default.
- The bridge resolves the selected source before connecting or sending. A connection revision prevents late acknowledgements or handshakes from publishing stale identity state during a service change. Retries keep the existing connection backoff.
- `test/soundcloud-identity.test.mjs` covers actual RPC target selection, pinning, manual mode, fallback, settings persistence in a new process, and delayed connection/acknowledgement races. Native verification covers the optional field, language switches, form submission and full page reload.
- Extension files are unchanged from 2.7.0; this update does not require another extension reload.

## 2.7.0 — SoundCloud browser support

- Extension 1.1.0 adds only SoundCloud's two website origins. `soundcloud-reader.js` reads the persistent miniplayer DOM; `soundcloud.js` observes playback changes and sends the existing paired local protocol. No SoundCloud credentials or API token are needed.
- Source validation binds messages to the sender's service and top frame. The server permits public SoundCloud track URLs and artwork on `i<number>.sndcdn.com`, removes tracking parameters, and rejects private links.
- The existing last-started ordering, tab pinning, excluded keywords, pause timeout and manual priority apply across all services. Artwork is optional; missing artwork does not stop activity or overlays.
- The public installer includes both new extension files. Existing users must reload the extension and SoundCloud tabs. The application name on Discord still comes from the saved default Application ID.
- `test/soundcloud.test.mjs` covers the collector, relay, URL validation and mixed-source selection. The native verifier also tests real DOM parsing and the dashboard/OBS payload with an isolated profile.

## 2.6.1 — public installer and connected updates

- Build from the private source checkout. Publish the Setup.exe and its SHA-256 file as assets on a stable `v<version>` release in `LUNA12379/presence-studio-releases`. Only public user guides belong in that repository’s Git tree.
- Upload assets to a draft release first and compare the GitHub asset digest with the local SHA-256 before publishing as latest. Then verify an anonymous check and download using `UpdateManager`.
- The channel URL ships with the app. No GitHub access token is needed or bundled for users. Checking is automatic only when the saved startup preference is enabled; download and installation remain explicit actions.

## 2.6.0 — languages and public documentation

- `config.language` accepts `en` or `ko`. New profiles use English; older profiles without the field migrate to Korean. The installer can record an initial language for a new profile.
- `ui/en.json` maps application-owned Korean source strings to English. `ui/i18n.js` captures only the original static UI and translates dynamic messages explicitly. User input, video titles, preset names, filenames and release notes remain untouched.
- Whole sentences with inline links/emphasis use `data-i18n-html`. Only trusted application strings go through this path. New UI strings need a matching translation, including placeholders such as `{version}`.
- The desktop shell and installer embed the same catalog using `desktop/Locale.cs`. Rebuild them when the catalog changes.
- `test/locale.test.mjs` covers migration, API persistence across processes, guide catalogs and Discord labels. The isolated native verifier runs `test/ui-locale-workflow.js` to check both languages, unsaved drafts, image selections and full page reloads.


Edge에서 재생하는 YouTube / YouTube Music을 Discord 활동으로 표시하는 Windows 앱입니다. 직접 입력한 활동, 프리셋, 데스크톱 오버레이와 OBS 브라우저 소스를 한곳에서 관리합니다.

## 시작하기

Windows 10/11 x64와 .NET Framework 4.7.2 이상이 필요합니다. 설치 프로그램에는 Node.js가 포함되어 있고 Microsoft Edge WebView2 Runtime도 없으면 설치합니다. ZIP·소스 실행은 Node.js 20.3 이상과 WebView2 Runtime을 별도로 준비하세요. Discord 활동을 표시하려면 Discord 데스크톱 앱도 실행해야 합니다. 별도 npm 패키지는 사용하지 않습니다.

1. `Presence-Studio-2.7.0-Setup.exe`로 설치하고 시작 메뉴에서 실행합니다. ZIP 버전은 폴더에 풀고 `Start.cmd`를 실행합니다. 소스만 내려받았다면 먼저 아래 빌드를 실행합니다.
2. [Discord 개발자 페이지](https://discord.com/developers/applications)의 **New Application**에서 **Discord 활동에 표시하고 싶은 이름**으로 앱을 만듭니다. General Information의 Application ID를 복사해 **연결 & 설정 → 기본 Application ID**에 입력하고 **ID 저장 후 연결**을 누릅니다. 봇 토큰이나 계정 비밀번호는 필요하지 않습니다.
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

결과는 `dist/Presence-Studio-2.7.0-win-x64.zip`입니다. 허용한 파일만 묶기 때문에 개인 설정, 보관한 이미지, 연결 키, OBS 키, 개발용 캐시는 들어가지 않습니다. ZIP에는 Node.js와 WebView2 Runtime 설치 파일이 포함되지 않습니다.

## 프리셋 저장과 불러오기

1. **직접 꾸미기**에서 제목·상태·표시 종류·시간·이미지·링크를 정한 뒤 **프리셋으로 저장**을 누릅니다. 별도 이름을 적을 필요 없이 활동 제목으로 저장됩니다.
2. 바로 아래 **저장한 프리셋** 드롭다운에 추가됩니다. 목록에서 선택하면 모든 편집 내용과 미리보기가 함께 바뀝니다.
3. 확인 후 **이 활동으로 표시하기**를 누르면 Discord와 오버레이에 적용됩니다. 목록에서 불러오거나 저장하는 동안 현재 공유 중인 활동은 유지됩니다.
4. 불러온 내용을 고쳐 **선택한 프리셋 덮어쓰기**를 누르면 같은 항목이 갱신되고 기존 프리셋 이름은 유지됩니다. **프리셋으로 저장**은 현재 제목으로 새 항목을 추가합니다.

최대 30개를 저장할 수 있고 앱·PC를 다시 켜도 유지됩니다. **프리셋** 메뉴에서는 **바로 적용**, **불러오기**, **삭제**를 사용할 수 있습니다. 이전 버전에서 저장한 이름과 이미지도 그대로 불러옵니다. 타이머는 남은 분·표시 방식을 저장하며, 실제 적용할 때 새로 시작합니다.

## 설치 프로그램과 앱 업데이트

**Windows 10/11 x64**: `Presence-Studio-2.7.0-Setup.exe`를 실행하고 설치를 누릅니다. 설치 위치는 `%LOCALAPPDATA%\Programs\Presence Studio`이며 관리자 권한 없이 현재 사용자에게 설치합니다. Node.js 22.23.3을 포함합니다. WebView2 Runtime이 없으면 포함된 Microsoft 부트스트래퍼로 설치하므로 이때 인터넷 연결이 필요합니다.

시작 메뉴 바로가기와 Windows 앱 제거 항목을 만들며 바탕화면 바로가기는 선택할 수 있습니다. 기존 앱을 종료하고 파일 교체에 실패하면 이전 설치 파일을 복구합니다. 기존 자동 실행 바로가기가 있으면 설치 경로로 갱신합니다. ID·프리셋·사진은 `%APPDATA%\PresenceStudio`에 그대로 유지하고, 앱 제거 시에도 지우지 않습니다.

**연결 & 설정 → 앱 업데이트**에서 확인 → 변경 내용 확인 → 다운로드 → **설치하고 다시 시작** 순서로 진행합니다. 실행 시 확인을 켜도 파일을 자동으로 다운로드하거나 설치하지 않습니다. 배포처 미연결, 네트워크 오류, 공개 배포 없음은 최신 버전과 구분해서 표시합니다. 확장 파일도 앱 실행 시 사용자 확장 폴더로 갱신됩니다. 파일이 변경된 확장은 Edge 확장 관리 및 YouTube 탭에서 새로고침해야 합니다.

`update-channel.json`은 공개 배포 전용 저장소 `LUNA12379/presence-studio-releases`를 가리킵니다. 소스 저장소는 비공개로 유지합니다. 초기 미연결 버전 사용자는 최신 설치 파일을 한 번 설치하면 이후 정식 배포를 앱에서 확인할 수 있습니다.

설치 파일 빌드:

```powershell
.\Build-Installer.ps1
# 다른 배포 채널로 테스트할 때만 재정의 (소스 저장소 공개 여부는 바꾸지 않음)
.\Build-Installer.ps1 -Repository OWNER/RELEASE_REPOSITORY
```

결과는 `dist/Presence-Studio-2.7.0-Setup.exe`와 SHA-256 파일입니다. Build-Installer는 Package.ps1의 허용 목록으로만 앱 파일을 가져옵니다. 저장소 접근 토큰은 앱에 포함하지 않습니다. 상업용 코드 서명 인증서는 적용하지 않았습니다.

배포 시 package.json·서버·데스크톱·화면 버전을 함께 올려 빌드하고, 지정한 공개 저장소의 정식 Release에 `v2.7.0` 형식 태그와 해당 버전의 Setup.exe를 첨부하세요. GitHub가 제공하는 자산 SHA-256 digest가 있어야 다운로드를 허용합니다. Draft·Pre-release는 받지 않습니다. 커밋·푸시만으로 업데이트가 배포되지는 않으며, 이 빌드 명령은 Release 게시나 저장소 공개를 수행하지 않습니다.

## 이미지 선택과 저장

직접 꾸미기의 **이미지 파일 선택**으로 15MB 이하 PNG/JPG/WebP 파일을 가져오거나 파일을 끌어 놓으면 자르기 창이 열립니다.

- 사진을 드래그하거나 방향키로 이동하고 확대 슬라이더로 원하는 부분을 맞춥니다. Shift + 방향키는 더 크게 이동합니다.
- **정사각형으로 자르기** 또는 **전체 담기 · 투명 여백**을 선택합니다.
- Discord 등록용으로 **1024 × 1024(권장)** 또는 **512 × 512(최소)** PNG를 만듭니다. 작은 원본도 확대할 수 있지만 원본보다 선명해지는 것은 아닙니다.
- **이미지 보관하기**를 누르면 이 PC의 `%APPDATA%\PresenceStudio\images`에 저장됩니다. 취소하면 보관하거나 선택을 바꾸지 않습니다.
- 보관한 사진은 **자르기 · 크기 맞추기**로 다시 편집할 수 있습니다. 편집 결과를 새 이미지로 보관하므로 기존 파일·프리셋은 그대로 유지됩니다.
- **PNG로 저장**을 누르면 데스크톱 앱에서는 저장 위치를 고를 수 있습니다. 브라우저 모드에서는 브라우저의 다운로드 설정을 따릅니다.

최대 60개까지 보관하며 원본을 이동해도 유지됩니다. 활동 또는 프리셋을 저장하면 선택한 이미지도 함께 기억합니다.

두 이미지 선택란은 표시 위치가 다릅니다. 다른 사진을 골라도 되며, 저장 시 두 선택을 함께 기억합니다.

| 선택란 | 표시되는 위치 |
| --- | --- |
| 내 이미지 / 보관한 이미지 | 앱 미리보기, 데스크톱 오버레이, OBS |
| Discord에 표시할 이미지 | Discord 프로필의 활동 카드에 나오는 큰 사진 |

내 이미지를 고르지 않으면 Discord 이미지나 고급 이미지 주소를 앱·오버레이에도 사용합니다. Discord에는 **등록한 Art Asset 또는 공개 이미지 URL**이 필요합니다. 같은 사진을 Discord에도 보여주려면:

1. 직접 꾸미기에서 **Discord 이미지 등록**을 엽니다.
2. 해당 애플리케이션의 Rich Presence → Art Assets에 **PNG로 저장**한 사진을 등록하고 저장합니다. **조회 대상**에 표시된 앱과 등록한 앱이 같아야 합니다. 커스텀 전용 ID가 있으면 그 앱에 등록하세요. **보관 폴더 열기**에서 앱이 보관한 PNG 파일을 찾을 수도 있습니다.
3. 앱의 **목록 새로고침**을 누른 뒤 **Discord에 표시할 이미지** 목록에서 선택합니다.
4. 활동 또는 프리셋을 저장합니다. 주소를 직접 입력할 필요는 없습니다.

**목록 새로고침**은 이전에 비어 있던 목록을 다시 사용하는 대신 Discord에 최신 목록을 요청합니다. 여전히 비어 있다면 조회 대상 ID와 개발자 페이지의 저장 여부를 확인하세요. 이미지는 자동으로 외부에 업로드되지 않습니다. 직접 URL을 쓰려는 경우에는 **링크와 이미지 주소 (고급)**에서 입력할 수 있습니다.

## 활동별 앱 이름과 전용 ID

현재 연결 방식에서는 Discord 카드의 앱 이름이 연결한 애플리케이션 이름을 따릅니다. 활동별로 다른 이름을 쓰려면 전용 ID를 선택적으로 저장합니다.

1. **기본 Application ID**: YouTube·YouTube Music와 전용 ID가 없는 활동에 사용합니다.
2. **SoundCloud 전용 Application ID**: SoundCloud라는 이름의 앱을 만들고 저장하면 선택된 사클 탭에 사용합니다.
3. **커스텀 활동 전용 Application ID**: Presence Studio 등 원하는 이름의 앱을 만들어 직접 꾸미기에 사용합니다.

기본 앱 이름이 YouTube이면 전용 ID가 없는 SoundCloud와 커스텀 활동도 그 이름으로 표시됩니다. 상단 작은 로고는 Discord가 표시하므로 SoundCloud 이름만으로 로고가 자동으로 붙는 것은 보장하지 않습니다.

선택된 활동에 맞춰 Discord 연결을 전환합니다. 전용 ID를 비우면 기본 ID로 연결합니다. 커스텀 이미지 목록은 기존처럼 커스텀 ID가 있으면 해당 앱의 Art Assets를 조회합니다. 저장한 ID는 앱·PC를 다시 켜도 유지됩니다.

## 시작 설명서

앱을 열면 시작하기, 이미지 자르기·등록, 활동별 앱 이름과 아이콘, 프리셋, 설치·업데이트, 오버레이를 다루는 6단계 설명서가 표시됩니다. 마지막 페이지에서 **앱을 켤 때 다시 표시하지 않기**를 체크하고 **저장하고 시작하기**를 누르면 재실행 후에도 숨김 설정이 유지됩니다. 중간에 닫으면 다음 실행 때 다시 표시됩니다. **연결 & 설정 → 설명서 보기**에서는 언제든 다시 열 수 있고, 마지막 페이지의 체크를 해제해 시작 시 표시를 다시 켤 수 있습니다.

## 설정과 연결

- 사용자 설정은 앱 설치 위치와 분리되어 있습니다. 고급 사용자는 `PRESENCE_STUDIO_DATA_DIR` 환경 변수로 저장 위치를 바꿀 수 있습니다.
- v1/v2.0의 프로그램 폴더에 있던 `config.json`은 사용자 설정이 아직 없을 때 한 번 가져옵니다. 기존 ID, 확장 연결 키, 프리셋을 유지하며 기존 파일을 삭제하지 않습니다. 이후에는 사용자별 설정을 우선합니다.
- 이미 설치한 구버전 확장도 연결 키가 유지되므로 계속 동작합니다. 업데이트를 받으려면 앱이 안내하는 새 확장 폴더를 로드하고 이전 확장은 제거하세요.
- `127.0.0.1:49832`에서 로컬 서버를 실행합니다. 확장 및 설정 변경은 로컬 연결 키로 인증하며, OBS에는 표시 전용 키를 사용합니다.
- 시청 기록은 파일에 저장하지 않습니다. 확장은 YouTube·YouTube Music·SoundCloud에서 동작하며 InPrivate에서는 정보를 전달하지 않습니다.
- 이미지 표시 시 해당 이미지 서버에 요청합니다. 수동 이미지에는 공개 HTTPS 이미지 URL을 사용하세요.
- Discord 이미지 목록은 애플리케이션 ID로 공개 Art Assets 목록만 조회합니다. 로그인 비밀번호나 사용자·봇 토큰을 받지 않습니다.
- Discord에 표시되는 앱 이름은 본인의 Discord Application 이름에 따라 결정됩니다.

## 파일 구성

`desktop/`은 WinForms 셸과 네이티브 오버레이, `ui/`는 설정 화면, `lib/`는 설정 저장·활동 선택·Discord IPC, `extension/`은 Edge 확장 소스입니다. `server-v2.mjs`가 로컬 API와 상태를 관리합니다.

프로그램 폴더 전체를 직접 압축해서 배포하지 말고 `Package.ps1`을 사용하세요. 개인용 `config.json`, 생성된 `connection.js`, `.env` 등은 Git에서 제외됩니다.
