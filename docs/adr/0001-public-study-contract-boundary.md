# ADR 0001: Public study contracts are the OSS boundary

## Status

Accepted — 2026-07-26.

## Decision

Open-source BetaBots proves what happened through versioned study manifests, evidence references, findings, decision outcomes, and sanitized export manifests. The public validator is dependency-free and must not import browser-runner internals.

Private tooling may turn those versioned artifacts into commercial decisions, portfolio views, or client workflows. Private consumers integrate via the public contracts or versioned plugins; they must not import runner internals or depend on raw browser state.

## Consequences

Public reports remain auditable and portable. Commercial interpretation stays explicitly separate from observed evidence. Schema evolution requires a new canonical contract identifier rather than silent shape changes.
