# Contributing

Bug reports, documentation improvements and focused pull requests are welcome.
English and Korean are both fine. Use the source repository's Issues for ordinary
bugs and feature proposals; use [SECURITY.md](SECURITY.md) for vulnerabilities.

1. Describe the problem and expected behavior, with a minimal reproduction and
   the app/browser/Windows versions. Redact titles, images and private URLs.
2. For code changes, follow [DEVELOPMENT.md](DEVELOPMENT.md). Use a separate
   `PRESENCE_STUDIO_DATA_DIR`, fake Application IDs and fake RPC in tests.
3. Keep changes focused. Add a regression test for behavior fixes, update the
   English/Korean UI catalog when changing app text, and update the changelog.
4. Run `node --test test/*.test.mjs`; build the desktop when changing C# or its
   embedded language catalog. Check the affected UI in English and Korean.
5. Run `node scripts/check-source.mjs --local-settings` after staging intended
   files. Review the diff. Do not commit credentials, config, imported images,
   generated extension pairing files, restored DLLs or release binaries.

Contributions are offered under [COPYING](COPYING), including its GPLv3 terms
and narrow WebView2 permission. Only submit work you have the right to license.
Keep existing third-party notices; document new dependencies and their licenses.
No contributor license agreement or copyright transfer is required.

Do not publish releases or change repository visibility as part of a routine PR.
Public binary releases follow [RELEASING.md](RELEASING.md) and require matching
source. A passing test or scanner is useful evidence, not a security guarantee.

한국어: 변경 목적·재현 방법을 함께 적고, 개인 설정과 사진을 제외해 주세요.
동작을 바꾸면 관련 테스트와 영어·한국어 설명을 함께 갱신합니다. 기여 코드는
COPYING의 GPLv3 및 WebView2 예외 조건을 따릅니다.
