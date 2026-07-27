# Study Contracts Phase Status

## Phase 1 — complete candidate

Versioned public contracts, semantic validation, JSON CLI, generic fixtures, and the OSS/private boundary ADR are present. The public layer records evidence and decisions without representing real spend or exportable authentication material.

## Follow-on phases

1. **Experiment execution:** runner adapters emit contract artifacts after visible browser sessions.
2. **Error taxonomy:** publish run, artifact, evidence, and sanitization error families with remediation guidance.
3. **Safe auth destruction:** implement auditable destruction of user-approved transient authentication state after runs; never include it in exports.
4. **Dashboard comparisons:** compare arms, personas, and surface findings strictly from validated artifacts.
5. **Clustering and contradiction detection:** group similar findings and surface conflicting evidence while retaining source references and confidence limits.

Each phase must preserve the public contract boundary and add contract fixtures plus semantic tests before consumer integration.
