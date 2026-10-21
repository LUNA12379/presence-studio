# Preparing and publishing releases

Source/development: `LUNA12379/presence-studio`.
Installers and the existing update channel: `LUNA12379/presence-studio-releases`.
Keep the repositories separate; do not replace the distribution Git tree with
development history. This document and its commands do not authorize a visibility
change or publish anything automatically.

## Before the first public source release

1. Review all reachable history, author/committer names/emails, and imported art.
   Run `node scripts/check-source.mjs --local-settings` after staging intended
   files. Known current IDs/keys, generated files and common credentials must be
   absent. If a real credential ever appeared, rotate it and assess history
   cleanup before publication; deleting the latest file alone is insufficient.
2. Review COPYING, LICENSE and THIRD-PARTY-NOTICES.md. GPLv3 applies from the
   licensing commit forward. Do not silently relabel old installers or claim
   that an earlier binary was built from the new GPL source.
3. Enable private vulnerability reporting before making the source public.
   The owner explicitly decides when to change visibility. Update the public
   distribution README in both languages to link to the source repository and
   explain the explicitly attached source archive.

## Prepare locally

1. Use a new version, updating `package.json`, the version constant in
   `server-v2.mjs`, `desktop/Studio.cs`, visible UI version and CHANGELOG together.
   Do not overwrite an already published version. Check all version occurrences.
2. Run the tests and appropriate desktop/installer verification described in
   DEVELOPMENT.md. Commit the intended changes; release preparation requires a
   clean Git worktree. Check `update-channel.json` in that commit. Forks should
   change it to their own release repository or disable their update channel.
3. Run from Windows PowerShell:

   ```powershell
   .\Build-Release.ps1
   ```

   The command audits history, creates an archive of exactly `HEAD`, then builds
   the installer from that extracted archive with fresh dependencies. It never
   builds from the developer's ignored DLLs, personal config or generated files.
   A source archive contains all committed project files, build scripts, tests,
   licenses and `SOURCE.json` with the full source commit. No `.git` directory or
   personal settings are included. Archive export attributes are rejected.

4. A new `dist/release-<version>-<commit>/` directory contains:

   - `Presence-Studio-<version>-Setup.exe` and `.sha256`
   - `Presence-Studio-<version>-source.zip` and `.sha256`
   - `release-manifest.json`, binding the binary and source hashes to the commit

   Check the manifest, inspect/extract the source, and test installation, upgrade,
   rollback, uninstall and settings preservation with a disposable profile.
   Build scripts download public pinned dependencies; no GitHub token, Discord
   token, signing secret or account is needed to rebuild. Binary identity is not
   claimed because toolchain metadata and the Evergreen bootstrapper can differ.

## Publish after review

Create a **draft** stable `v<version>` release in the distribution repository.
Upload all five files above. Verify GitHub's reported SHA-256 against the local
installer and source ZIP. Tag the matching source commit `v<version>` in the
source repository, and link that commit and the explicit source ZIP in the
release notes. Publish only when the source is accessible to recipients at no
charge. Retain the matching source for every available GPL binary release.

GitHub's automatic “Source code” download on the distribution repository contains
only its documentation; it does **not** satisfy this matching-source workflow.
The app updates from the installer asset and its GitHub digest; extra source and
manifest assets do not change the update protocol. After publication, verify an
anonymous update check/download from the previous version. A commit/push alone
does not deploy an update.

Never reuse an old release tag with changed contents, publish a private config,
or embed maintainer credentials. Code signing is a separate future improvement.

한국어: 공개 전 검사 → 새 버전 커밋 → `Build-Release.ps1` → 설치 검증 순서입니다.
설치 파일과 같은 커밋의 소스 ZIP, 각각의 해시, 매니페스트를 함께 배포하세요.
현재 배포 저장소의 자동 업데이트 주소는 유지하며, 이 명령은 로컬 빌드만 합니다.
