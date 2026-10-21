# Development

## Windows prerequisites

- Windows 10/11 x64, .NET Framework 4.7.2 or later and its C# compiler at
  `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`.
- Windows PowerShell 5.1, Git 2.46+ for release archives, Node.js 20.3+ on PATH
  (22 LTS recommended). There are no npm dependencies and no `npm install` step.
- Microsoft Edge WebView2 Runtime for the desktop UI, and the Discord desktop
  app plus Edge or Chrome for live integration. Tests use fake Discord RPC.
- Internet access for the pinned WebView2 SDK, bundled Node runtime/license and
  Microsoft's signed bootstrapper. See THIRD-PARTY-NOTICES.md for sources/terms.

## Run in a separate profile

Quit a running Presence Studio instance before starting another bridge because
the browser extension and native shell use port 49832. Avoid using real settings
for development. From the repository root in PowerShell:

```powershell
$env:PRESENCE_STUDIO_DATA_DIR = Join-Path $env:TEMP ('PresenceStudio-dev-' + [Guid]::NewGuid().ToString('N'))
node server.mjs
```

Open `http://127.0.0.1:49832/`. Start with blank IDs, then use a test application
if testing live Discord. Load the generated `edge-extension` folder inside the
chosen data directory, not the repository's extension source. Never upload the
generated folder: its `connection.js` is paired to your profile. The browser
extension works in Edge and Chrome concurrently. A random ID in extension-local
storage namespaces tab IDs per browser profile and survives worker restarts. It
is not synced and is not sent to Discord. Older extensions use a separate legacy
namespace; reload the extension in every browser after upgrading to 2.8.0. Old
numeric pins cannot identify a browser safely, so re-pin the desired tab after
reloading. Pins never fall back to another browser with the same tab number.

To build/run the native desktop instead:

```powershell
.\desktop\Build.ps1
& '.\desktop\Presence Studio.exe'
```

Keep the data-directory environment variable set in that PowerShell session.
The shell starts the bridge when needed. Clear the variable only when returning
to normal use. Do not point development scripts at the real AppData config.

## Test and audit

```powershell
node --test test/*.test.mjs
node scripts/check-source.mjs --local-settings
```

Run the suite serially as one invocation: integration files use separate fixed
test ports and should not be duplicated concurrently. They create disposable
profiles and fake RPC; they do not require a Discord account or private token.
The audit scans reachable history and tracked working files. Stage intended new
files before the final audit so they are included. `--local-settings` additionally
compares against current local IDs/keys in memory without printing them. A source
ZIP without `.git` can run tests/builds; history auditing and release packaging
require a Git checkout.

For UI changes, check both English and Korean, persisted settings, preset load
and apply, crop/export, local versus Discord images, and guide preferences.
For source detection changes, check paused playback, ads, tab close, pinning and
service/application identity switching. A passing fake-RPC test does not prove
that a future YouTube/SoundCloud page layout or Discord client still works.

The desktop has a developer-only `--verify=<output-directory>` mode. Its optional
mutation workflows require `PRESENCE_STUDIO_VERIFY_MUTATIONS=1` **and** a separate
`PRESENCE_STUDIO_DATA_DIR`; run against an isolated bridge with fake RPC at 49832,
after quitting the real app. See `test/ui-*-workflow.js` and `Studio.cs` for the
checks. This mode must never be pointed at a personal profile.

The installer supports an isolated `--verify=<directory>` run under
`%TEMP%\PresenceStudioInstallerTests\<unique-name>`. It exercises install, upgrade,
rollback, uninstall, profile preservation and both installer languages without
registering a real installation. Use a hidden process and inspect `result.json`
or `error.txt` in that directory. Live desktop verification and installer checks
remain Windows-only; Node tests do not replace them.

## Build outputs

```powershell
.\Package.ps1          # portable ZIP, explicit app-file allowlist
.\Build-Installer.ps1  # local development installer
.\Build-Release.ps1    # reviewed clean commit -> matching source + installer
```

`Package.ps1` and `Build-Installer.ps1` can overwrite same-version files in `dist`;
keep experimental builds separate from published artifacts. `Build-Release.ps1`
requires an empty output directory and builds in a new isolated `.build` folder.
Use it for public GPL releases, following RELEASING.md. It does not upload, sign,
publish or change repository visibility. Rebuilding needs no maintainer secret.
SDK DLLs are verified against the pinned archive even when already present.

The source package includes build scripts, desktop/installer source, extension,
tests, original assets and notices. Windows, .NET, WebView2 and Node are external
components described in THIRD-PARTY-NOTICES.md. A source archive has `SOURCE.json`
with provenance. Keep modified releases visibly distinguishable, and point forks
at their own update channel to avoid replacing a modified build with upstream.

## Code map

| Path | Responsibility |
| --- | --- |
| `server.mjs`, `server-v2.mjs` | Loopback server, authentication, activity/update orchestration |
| `lib/` | Validation, settings/images, session selection, Discord framing and updates |
| `extension/` | Chromium MV3 relay and media collectors; no third-party account credentials |
| `ui/` | Settings, presets, cropper, guide, OBS view, English/Korean strings |
| `desktop/` | WinForms/WebView2 shell, tray, hotkeys, native overlay |
| `installer/` | Per-user installation, rollback and uninstall |
| `scripts/` | Verified SDK restore, package allowlist, history audit and source archive |
| `test/` | Node tests and native verifier UI workflows |

User text is rendered with DOM text APIs. Only bundled guide/translation markup
uses `innerHTML`; never insert service metadata or user strings into that path.
Add full sentence translations to `ui/en.json`, not translations of user content.
Saved presets store the local image ID and Discord asset selection separately.
Settings migration must preserve IDs, keys, language and presets across upgrades.

한국어: Windows에서 Node.js와 .NET Framework를 준비하고 별도 데이터 폴더로
개발하세요. Node 테스트 → 관련 UI·설치 검증 → 개인정보 검사 → 커밋 순서로
진행합니다. 공개 배포에는 RELEASING.md의 동일 커밋 소스·설치 파일 절차를 씁니다.
