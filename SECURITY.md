# Security and privacy

## Reporting

Use GitHub's **Security → Report a vulnerability** on the source repository:
[submit a private report](https://github.com/LUNA12379/presence-studio/security/advisories/new). If that option is unavailable,
open an issue saying only that you need a private reporting channel. Do not post
the vulnerability, exploit, credentials, config or private activity data there.
There is no promised response time or bug bounty. Fixes target the latest stable
version; older releases do not have a separate backport commitment.

## Data and trust boundary

- The bridge listens on `127.0.0.1:49832`. It validates Host and Origin and requires
  a per-user pairing key for activity/configuration APIs. This is a local app,
  not a server to expose through port forwarding, a proxy, or a tunnel.
- The browser extension reads current media metadata on its declared YouTube,
  YouTube Music and SoundCloud origins. The selected activity is sent to the
  Discord desktop client over local IPC. Playback sessions stay in memory;
  there is no watch-history database or project telemetry endpoint. A random
  profile ID stays in extension-local storage and namespaces tabs on the local
  bridge; it is not synced between browsers or included in Discord activities.
- Configuration, Application IDs, presets, pairing/OBS keys and imported images
  are stored in `%APPDATA%\PresenceStudio` (or `PRESENCE_STUDIO_DATA_DIR`). Updates
  and uninstall preserve this directory. It is not an encrypted secret vault.
- The generated `edge-extension/connection.js` contains a pairing key. Do not
  share or upload that folder. OBS URLs contain a display-only key; anyone who
  can reach the bridge and has that key can read the current overlay. Signed
  image URLs expose the referenced image, so do not publish them either.
- A process running as the same Windows user can read the settings and local
  app page. The pairing key protects against ordinary unrelated web pages; it
  does not protect against malware or an untrusted program in that user account.
- Discord assets, media thumbnails and configured external image URLs cause
  requests to their hosts. Update checks contact GitHub, and an installation may
  download Microsoft's WebView2 Runtime. Those services have their own policies.
- Installer downloads require the expected repository, tag, filename, size and
  GitHub-provided SHA-256 digest. This detects corruption and mismatched assets;
  it does not protect against a compromised maintainer/release account. Installers
  currently have no project Authenticode code-signing certificate.

Review screenshots and logs before sharing. If a pairing or OBS key leaks, quit
the app, remove only that key from the private config, then restart to generate
a new one. Reload the extension or replace the OBS URL as appropriate. Back up
settings privately before editing; deleting the whole config resets preferences.

## Checks before publication

`node scripts/check-source.mjs --local-settings` scans tracked files, reachable
Git history and commit metadata for known credential formats and current local
IDs/keys. It prints locations and categories, never matching secret values.
It also reports how many Git author/committer email addresses will be exposed.
Manually review that metadata, dependency notices and any media before changing
visibility. The scanner is deliberately not a complete secret detector or an
independent penetration test.

한국어: 보안 문제와 연결 키·OBS 주소·설정 파일은 공개 이슈에 올리지 마세요.
비공개 신고 버튼이 없다면 세부 내용을 쓰지 않고 비공개 연락 경로만 요청하세요.
이 앱은 같은 Windows 계정으로 실행되는 다른 프로그램으로부터 설정을 숨기지
않으며, 로컬 서버를 외부 인터넷에 노출하는 용도로 설계되지 않았습니다.
