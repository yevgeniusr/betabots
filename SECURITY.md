# Security Policy

Betabots automates synthetic users against applications. Treat unsafe automation, credential exposure, data leakage, and unintended production traffic as security issues.

## Supported Versions

The current default branch is the only supported version for security fixes.

## Report a Vulnerability

Please report security issues privately to the maintainer before opening a public issue. If GitHub private vulnerability reporting is enabled for the repository, use that. Otherwise contact the maintainer listed in the repository profile.

Include:

- A concise description of the issue.
- Steps to reproduce.
- Impact and affected scripts or docs.
- Whether real credentials, real users, or production systems were involved.
- Suggested mitigation, if known.

Do not include secrets in reports. Redact tokens, cookies, personal data, and private URLs.

## Automation Safety

Betabots should run against local, development, or staging systems by default. Production synthetic traffic requires explicit approval, clear labeling, rate limits, cleanup plans, and safeguards against messaging real users or making real payments.

Stop a run if it reveals authentication leaks, authorization bypasses, privacy exposure, destructive actions, or repeated backend failures.
