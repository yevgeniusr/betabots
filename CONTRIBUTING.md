# Contributing to Betabots

Betabots is free and open-source software under the GNU Affero General Public License v3.0 or later. Contributions are welcome when they keep the project usable, inspectable, and safe for local or staging product testing.

## License Agreement

By contributing, you agree that your contribution is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).

This means:

- Contributions may be used, copied, modified, and redistributed under AGPLv3 terms.
- Commercial use is allowed under AGPLv3.
- Modified versions that are distributed or made available over a network must provide corresponding source code under the same license.
- You must have the right to submit the code, docs, assets, or examples you contribute.

## Development Workflow

1. Fork or branch from the current default branch.
2. Keep changes focused on one behavior, script, doc area, or integration.
3. Run the smoke test before opening a pull request:

```bash
tests/smoke.sh
```

4. If plugin manifests changed, also run the plugin validator when available:

```bash
python3 /Users/mac/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

## Pull Request Expectations

Good pull requests include:

- A short description of the problem and solution.
- Reproduction steps for bug fixes.
- Before/after behavior for runner or prompt changes.
- Updated docs when behavior, environment variables, outputs, or safety rules change.
- Tests or a clear reason tests were not practical.

## Safety Rules

Betabots should default to local, dev, or staging environments. Do not add behavior that sends real payments, spams real users, bypasses consent, scrapes private data, or hides synthetic-user activity.

Generated product data should remain clearly synthetic. If a runner persists content in a target application, the data should be easy to identify and clean up.

## Style

- Prefer small scripts and plain JSON/Markdown artifacts over hidden framework machinery.
- Preserve first-person raw journey logs before synthesis.
- Keep product-specific assumptions in cohort files or adapters, not in core runner behavior.
- Avoid claiming a bot is happy unless it understood product value and has a credible reason to return.
