# Project workflow

The owner requests that completed improvements be tested, described in a meaningful commit message, and pushed to the existing private GitHub remote. Do not change repository visibility. Follow the user's current instructions if they override this workflow.

Keep user configuration, Application IDs, pairing keys, OBS keys and imported images out of commits and distribution archives. Use `Package.ps1` to create distributables from its explicit file allowlist. Preserve existing personal settings during upgrades.

Run `node --test test/*.test.mjs` for backend behavior changes. Build the Windows desktop shell when changing it and verify affected UI flows in the app. Keep test data separate from the real user's AppData directory.
