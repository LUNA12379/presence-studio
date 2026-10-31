# Extension 1.4.0 / desktop 2.9.0 verification

- Backend and worker suite: 87 passing tests. Pairing expiration, one-time use, rate limiting, origin/profile binding, persistent hashes, revocation, restricted endpoints, popup sender validation, credential storage, store gating and archive allowlists are covered.
- Native Windows verifier: preset/image/crop, previews, overlays, English/Korean, extension versions, update handling and store pairing UI passed. A computed-style assertion verifies that an unreleased store link is actually hidden.
- The maintainer loaded the public, credential-free test extension in Edge, paired it with the app and confirmed media detection. The live app status independently reported desktop 2.9.0, a paired Edge 1.4.0 connection, one live media tab and Discord connected. Personal IDs, keys, titles and images are omitted from these notes.
- Store notice remains disabled. The assigned store item has not been submitted for review or published. Test the installed store build in Chrome and Edge after approval, before enabling the public release channel.
- Listing screenshots are 1280 × 800 RGB PNG captures of the companion UI with synthetic presentation data. They contain no personal activity or third-party artwork and are not evidence of a live store installation. The promotional tile is 440 × 280 RGB PNG.

Installer verification is recorded with the release artifacts after building the committed source.
