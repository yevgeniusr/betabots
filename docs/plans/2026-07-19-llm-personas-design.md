# LLM-Grounded Personas and Action Provenance

## Goal

Make Betabots fully persona-LLM driven at every meaningful action boundary and generate deeper personas from visible product evidence plus optional user guidance. Preserve supplied cohorts and supplied personas as first-class inputs.

## Persona Sources

Persona selection uses this precedence:

1. `BETABOT_COHORT_FILE`: load the existing full cohort format.
2. `BETABOT_PERSONAS_FILE`: load supplied personas and merge them with run configuration.
3. Generated personas: inspect the visible product, ask the LLM for a product analysis, combine it with optional user guidance, and ask the LLM for a deep cohort.

Supplied cohort and persona files are treated as approved. Generated personas are written to the run directory with their product analysis and provenance.

## Generation Inputs

The preflight product analysis is based only on evidence available to a user in the browser: page title, visible text, interactive controls, URL, and screenshot. It does not inspect application source code.

Optional guidance comes from either:

- `BETABOT_PERSONA_GUIDANCE`
- `BETABOT_PERSONA_GUIDANCE_FILE`

The guidance can name audiences, exclusions, research questions, market context, or desired tensions. The LLM must distinguish visible evidence, user-provided context, and its assumptions.

## Deep Persona Model

Each generated persona contains enough context to produce distinct decisions rather than demographic role-play:

- identity, role, and life situation;
- discovery trigger and job to be done;
- prior attempts and current alternatives;
- personal or professional stakes;
- practical constraints and anxieties;
- objections and trust threshold;
- decision criteria and abandonment conditions;
- vocabulary and digital habits;
- social context and influence;
- success evidence;
- provenance for claims that are observed, guided, or assumed.

The full persona is included in every reflection prompt. Missing optional details may be normalized, but generated personas must pass a strict minimum schema before a run begins.

## Approval Policy

`BETABOT_PERSONA_APPROVAL_MODE` supports:

- `auto` (default): generate, record, and proceed immediately.
- `required`: generate and record the artifacts, then stop before running bots.

Set `BETABOT_PERSONAS_APPROVED=true` to resume a required-approval run from the generated persona artifact in the same run directory. This avoids regenerating a different cohort after review.

## Action Provenance

Every meaningful browser or social action must originate in a fresh, successful persona-LLM decision. A decision must have a known action type and pass control validation. Missing, malformed, or unsupported responses fail the step; they are not converted into a deterministic wait.

Every accepted decision records:

- a unique decision ID;
- `origin: "persona-llm"`;
- the persona and step;
- the validated action;
- the resulting evidence.

An explicit LLM-selected `wait` remains valid. Browser perception, control validation, safety checks, action execution, evidence capture, and timing remain deterministic infrastructure.

## Destiny and Social Behavior

Destiny nudges become prompt context for the next persona reflection. Destiny cannot select or execute a browser control directly. The persona LLM may follow, reinterpret, or reject the nudge.

Social posts, replies, and short text must also come from a successful persona-LLM response. A provider failure or invalid text skips/fails that social action and is recorded; hard-coded fallback copy is never published as persona speech.

## Compatibility

Existing full cohort files continue to work without persona generation. Existing shallow role fields are normalized into the richer prompt shape and marked as supplied or assumed. Cohort-only runs with a supplied cohort remain browser-independent; cohort-only runs without one perform the generation preflight first.

## Verification

Verification includes unit tests for configuration, schema validation, strict decision handling, Destiny context, and social failure behavior; integration tests with a fake LLM; the existing smoke suite; and a small live run against Besimple. The Besimple run will retain generated artifacts and raw feedback so persona depth and action provenance can be inspected directly.
