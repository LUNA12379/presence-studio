# Third-party components

Presence Studio's terms are in [COPYING](COPYING) and [LICENSE](LICENSE).
Third-party components keep their own licenses. There are no npm runtime
dependencies. Service logos, media thumbnails and user-imported images are
not included in the source and are not relicensed by this project.

| Component | Use | License / notice |
| --- | --- | --- |
| Microsoft.Web.WebView2 SDK 1.0.3537.50 | Restored during desktop builds; three DLLs are included in Windows packages | Microsoft's BSD-style three-clause terms in [desktop/WebView2-LICENSE.txt](desktop/WebView2-LICENSE.txt), verified against the [pinned NuGet package](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3537.50/License) |
| Microsoft Edge WebView2 Runtime | Installed separately by Microsoft's signed Evergreen bootstrapper when missing | [Microsoft distribution documentation and runtime terms](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution); this is an external platform runtime, not project source |
| Node.js 22.23.3 (Windows x64) | Bundled as a separate interpreter in the installer; portable/source users install Node themselves | [Node.js license and bundled dependency notices](https://github.com/nodejs/node/blob/v22.23.3/LICENSE), copied in full to `runtime/LICENSE.txt` in the installer; [upstream source](https://github.com/nodejs/node/tree/v22.23.3) |
| Windows / .NET Framework | OS and desktop platform; not bundled | Provided by Microsoft under its applicable terms |

The WebView2-specific additional permission in COPYING permits distribution
of the combination without treating Microsoft's components as project source.
It does not grant rights to redistribute Microsoft components beyond their
own terms. The SDK archive and Node executable are SHA-256 pinned, the Node
license is SHA-256 pinned, and the WebView2 bootstrapper's Microsoft signature
is checked during the build. The Evergreen Runtime can change independently
of an app release, so these builds are not claimed to be byte-for-byte reproducible.

The repository's geometric app icon is project artwork under COPYING.
Presence Studio is independent of Discord, Google, YouTube, SoundCloud,
Microsoft and OpenAI; their names identify interoperability and imply no endorsement.
