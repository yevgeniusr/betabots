# Changelog

All notable changes to Betabots are documented here.

## 0.1.0 - 2026-07-22

First stable release candidate for local Betabots skill/plugin installs.

### Added

- Pinned repository and skill-runtime dependency manifests with npm lockfiles.
- Deterministic dependency installer for clean clones and copied skill runtimes.
- Chromium-only browser install command for the pinned Playwright runtime.
- Clean-install verifier that copies the repository to a temporary directory, uses an isolated `HOME`, installs host skill copies, and runs smoke without inherited `NODE_PATH`.
- Linux browser-install option for Playwright system dependencies on minimal images.
- Release notes suitable for `gh release create`.

### Changed

- Local installation now installs the Betabots runtime dependency tree inside each copied skill directory for Codex, Agent Skills, Claude Code, and Cursor.
- Browser runner resolves Playwright from the copied skill runtime before falling back to the caller environment.
- Browser action timeouts use the existing action timeout setting instead of a hard-coded 5 second click/fill timeout.

### Notes

- Browser tests require Playwright Chromium for the pinned Playwright revision. The install command downloads Chrome for Testing, Chrome Headless Shell, and FFmpeg for Chromium support, not Firefox or WebKit.
- On minimal Linux images, `node scripts/install-browsers.cjs --with-deps` forwards Playwright's system dependency installation.
- Betabots remains licensed under AGPL-3.0-or-later.
