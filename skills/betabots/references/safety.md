# Safety Rules

- Run on local/dev/staging by default.
- Never simulate real purchases or submit real payment credentials.
- Never message real users unless the environment is explicitly synthetic.
- Never scrape third-party sites as part of a bot unless allowed by the user and site terms.
- Mark generated identities as synthetic when persisted.
- Keep raw storylines free of secrets, tokens, private keys, and real personal data.
- If a run finds server errors, auth bypass, privacy leaks, or destructive action paths, stop scaling and patch before continuing.
- For approved authenticated production cohorts, use real Playwright storage
  state seeded into unique `0600` per-bot files; never inject auth values.
- Treat interaction policy as a runtime boundary, not a persona instruction.
  Blocked action and request artifacts must be redacted and must never contain
  cookies, headers, tokens, or raw request bodies.
- Community discovery is read-only unless the user explicitly authorizes a
  synthetic environment. Deny comments, replies, posts, reactions, likes,
  follows, messages, shares, and publishing at both UI and network layers.
