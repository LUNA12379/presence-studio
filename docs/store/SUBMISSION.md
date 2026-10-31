# Chrome Web Store submission kit

Status: developer-dashboard draft created; **not submitted or published**.

Assigned extension ID: `gplpaakngmgcpjlkckhiaiohgfhhalfg`. The public store link stays disabled until approval and public launch. Extension **1.4.0** requires Presence Studio **2.9.0+**, Windows 10/11 x64 and the Discord desktop client. Default language is English; Korean is also available. The existing local extension remains supported.

## Files and links

Build `Presence-Studio-Extension-1.4.0-webstore.zip` with `./Build-StoreExtension.ps1`. Upload that archive, never `%APPDATA%\PresenceStudio\edge-extension` or a ZIP of the whole app. The manifest must be at the ZIP root. The package includes its license notices and privacy text; corresponding source is available in the source repository's `v2.9.0` tag and the matching source archive.

| Dashboard field | Value |
| --- | --- |
| Name | Presence Studio — YouTube & SoundCloud |
| Default language | English |
| English description | [LISTING.en.txt](LISTING.en.txt) |
| Korean description | [LISTING.ko.txt](LISTING.ko.txt) |
| Website | https://github.com/LUNA12379/presence-studio-releases |
| Support | https://github.com/LUNA12379/presence-studio/issues |
| Privacy policy | https://github.com/LUNA12379/presence-studio-releases/blob/main/PRIVACY.md |
| Windows app | https://github.com/LUNA12379/presence-studio-releases/releases/tag/v2.9.0 |
| Source | https://github.com/LUNA12379/presence-studio/tree/v2.9.0 |
| Store icon | `../../extension/icons/128.png` |
| Category | Productivity / Tools, using the closest category available in the dashboard |

Use the screenshot PNGs in `screenshots/` (1280 × 800) and the 440 × 280 small promotional tile. Screenshots use isolated demonstration data. Do not use personal activity screenshots or imply affiliation with Discord, Google, YouTube, Microsoft or SoundCloud.

## Single purpose

Share current YouTube, YouTube Music and SoundCloud playback metadata with the user's local Presence Studio Windows app so the chosen activity can appear in Discord Rich Presence and optional overlays.

## Permission justifications

**storage**

Stores a randomly generated browser-profile ID, the local app pairing credential and popup language in extension-local storage. They persist across worker/browser restarts and are not synced. The worker restricts access to trusted extension contexts; content scripts cannot read the credential.

**alarms**

Runs a 30-second heartbeat and asks already injected supported media tabs for fresh playback state. This allows the Windows app to detect extension availability and version even when no supported media tab is playing, and recover from service-worker suspension.

**Host access: http://127.0.0.1:49832/**

Sends one-time pairing, authenticated playback metadata, heartbeat and disconnect requests to Presence Studio on the same computer. The endpoint is loopback only. No developer-operated server receives playback information or the pairing credential.

**Host access: https://www.youtube.com/* and https://music.youtube.com/**

The bundled content script reads the current video/music player title, channel, public video ID, playback position/duration and state. These host patterns also let the worker query matching tabs and validate navigation. Unrelated browsing is not inspected.

**Host access: https://soundcloud.com/* and https://www.soundcloud.com/**

The bundled content scripts read the persistent miniplayer's current track, artist, public track URL, artwork URL, playback position and state. Both hostnames are supported. Private track URLs are rejected. The worker queries only the declared supported sites.

**Remote code**

No. All executable JavaScript is bundled in the archive. There is no remote script, dynamic code evaluation or executable configuration. The local app exchanges JSON playback/connection data. The desktop app separately checks a fixed public GitHub file containing only store release metadata; that file is not executed.

## Privacy disclosure draft

Use the dashboard's current definitions when completing its data-use fields. The disclosure should cover data processed locally and passed to the companion app, not claim “no user data” merely because there is no developer collection server.

- **Web history:** current public video/track identifiers and URLs on the supported media sites only; no browser-wide history API.
- **Website content:** the current media title, creator, artwork URL and playback state read from supported players.
- **Authentication information:** the one-time pairing code and generated local-app credential; no site passwords, cookies, OAuth tokens, Discord user tokens or bot tokens. This credential stays in extension-local storage, with a hash on the local app.
- No name/email/account-ID collection, health/financial information, personal communications, location, mouse/keystroke tracking, ad tracking or analytics.

The code does not sell or transfer user data to advertisers, use data for purposes unrelated to the stated activity-sharing purpose, or use it for creditworthiness/lending. The maintainer should review the final dashboard declarations against [PRIVACY.md](../../PRIVACY.md) before certifying them. The selected media activity is intentionally shared with Discord at the user's direction; that transfer is disclosed.

## Reviewer instructions

1. Use Windows 10/11 x64 with Chrome 120+ (or Edge based on Chromium 120+). Download the Windows installer from the versioned app link above. Install and launch Presence Studio. An internet connection is required if Microsoft WebView2 is absent. Node.js is bundled; no development environment is needed.
2. Launch and sign in to the Discord **desktop** app. Presence Studio has no account or paid service. No reviewer login credentials are provided or needed for Presence Studio itself.
3. In the Discord Developer Portal, create an application with a display name such as **Presence Studio Review**. Copy its **Application ID** into Presence Studio → **Connections & settings → Default Application ID** and save. Do not create or supply a bot token or user token.
4. Load the submitted extension. Open Presence Studio → **Connections & settings → Browser extension → Create one-time pairing code**. Click the extension toolbar icon, paste the code and click **Connect this browser**. A code expires in 3 minutes and works once. Pairing survives browser and app restarts.
5. Reload a public YouTube watch page and play a video. Its title, channel, artwork and progress should appear in the app; with **Share activity** enabled, the selected activity is sent to Discord. In Discord settings, enable activity sharing if required. Discord web alone cannot receive local Rich Presence.
6. Repeat with YouTube Music or a public SoundCloud track. SoundCloud reads the bottom miniplayer and keeps following it while navigating the site. The app selects the most recently started playing tab; a tab can be pinned. Private SoundCloud track URLs are intentionally unsupported.
7. Pause media, use the app's sharing switch, or disconnect in the extension/app. Disconnect revokes the paired credential and clears that profile's live sessions. Reconnect with a new code to continue.
8. Switch the popup between English/Korean. Closing the app or using an expired code produces an actionable connection message. Incognito mode is intentionally unavailable.

If a locally generated old extension is already loaded, disable it after pairing the store build to prevent duplicate playback reports. Test using a clean browser profile where possible. Do not upload or send the Windows user's `config.json`, `browser-pairings.json`, generated local extension folder or OBS URL.

## Launch sequence

1. Publish and verify the 2.9.0 Windows companion release and public privacy pages.
2. Add a new Presence Studio item in the developer dashboard; upload the public store ZIP, listing copy and screenshots. Record the assigned 32-letter extension ID. Save a draft first and review all declarations.
3. Submit only after the maintainer approves the completed draft. Do not change the unrelated QR extension.
4. After approval **and public release**, verify the listing is publicly installable in Chrome and Edge. Then set `published: true`, the real `extensionId`, and the released extension version in the distribution repository's `extension-channel.json`.
5. The app derives its Chrome Web Store URL from the validated ID. Until that public channel is enabled, it shows no startup installation dialog. The dialog opens after the first-run guide closes, can be dismissed for the session, and is suppressed once an official store origin has been paired. App polling never repeatedly opens it.

Both the desktop application and extension have independent update versions. A store extension is updated by its browser; an unpacked extension must be reloaded manually. Never publish a new required extension version in the release channel before the corresponding store package is available.

References: [listing guidance](https://developer.chrome.com/docs/webstore/best-listing), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [submission preparation](https://developer.chrome.com/docs/webstore/prepare).
