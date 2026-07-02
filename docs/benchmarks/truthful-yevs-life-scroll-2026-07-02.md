# Truthful-Personality Benchmark: yevs-life-scroll

Date: 2026-07-02

Target app: `/Users/mac/Desktop/projects/yevs-life-scroll`

App URL: `http://localhost:3014`

Cohort: `.betabots/cohorts/rachkovan-personal-site.json`

Purpose: implementation benchmark for Betabots truthful-personality behavior, not a statistically meaningful product study.

## Setup

Both supported-model runs used:

```bash
BETABOT_APP_URL=http://localhost:3014
BETABOT_COHORT_FILE=/Users/mac/Desktop/projects/yevs-life-scroll/.betabots/cohorts/rachkovan-personal-site.json
BETABOT_THOUGHTFUL_COUNT=2
BETABOT_THOUGHTFUL_CONCURRENCY=1
BETABOT_THOUGHTFUL_MINUTES=0.35
BETABOT_THOUGHTFUL_MIN_SESSION_MINUTES=0.35
BETABOT_THOUGHTFUL_MAX_SESSION_MINUTES=0.35
BETABOT_TIME_SCALE=0.02
BETABOT_HEADLESS=true
BETABOT_VISUAL_EVIDENCE_MODE=audit
BETABOT_SEED=20260702
BETABOT_LLM_PROVIDER=codex
```

Playwright was installed temporarily under `/tmp/betabots-playwright` and exposed with `NODE_PATH`; the target app package files were not modified.

## Runs

| Run | Mortal truth | Run dir | LLM calls | LLM failures | LLM fallbacks | Median score | Truth assessments | Actions charged |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | off | `.betabots/runs/20260702-truth-benchmark-baseline-gpt5` | 4 | 0 | 0 | 40 | 0 | n/a |
| Mortal truth | on | `.betabots/runs/20260702-truth-benchmark-mortal-gpt5` | 3 | 0 | 0 | 32 | 3 | 1 |
| Mortal truth after life-goal mapping fix | on | `.betabots/runs/20260702-truth-benchmark-mortal-gpt5-lifegoals` | 2 | 0 | 0 | 20 | 2 | 0 |

Earlier attempted runs with `BETABOT_LLM_MODEL=gpt-5-mini` completed browser sessions but had 100% LLM fallback because the local Codex CLI account rejected that model. Those runs are not valid for personality-quality evaluation.

## Findings

Mortal-truth mode successfully changed the artifact shape:

- Raw logs included `Truth assessment:` entries.
- Raw logs included `Life-cost decision:` entries.
- `summary.json` included `mortalTruth` accounting.
- The run recorded 3 truth assessments and 0 LLM fallbacks.

Mortal-truth mode also made the language sharper:

- Baseline: "The positioning feels ambitious, but I need proof points, sectors, and outcomes faster."
- Mortal truth: "I do not yet trust the fractional CTO signal; I need clearer evidence of senior product and engineering judgment."
- Mortal truth: "My honest judgment is that Yev might be credible, but I only have low-medium confidence from this screen because it reads more like a general personal site than a leadership case."
- Mortal truth: "This is worth one more look, but I have low confidence in Yev's investing relevance until I find concrete wins or specific theses."

The product signal was consistent across both runs: the site creates curiosity, but founder/investor visitors want proof faster, especially concrete outcomes, sectors, roles, decisions, and theses.

## Implementation Gaps Found

1. `truthAuditRiskEvents` currently means "truth assessments recorded," not "truth independently verified."
2. Cohorts without explicit `lifeGoal` values depend on generated role mapping. The benchmark exposed generic fallback life goals for founder/investor roles, so the mapping was expanded after the run.
3. Truthfulness quality depends on live LLM calls. If `llm.fallbacks > 0`, the run is still useful for runner smoke testing but not for truthful-personality evaluation.
4. This small run did not test money commitment, peer-audit contradictions, long sessions, or multiple repeated decisions.

## Post-Fix Verification

After expanding role-to-life-goal mapping, a final mortal-truth run confirmed more precise stakes:

- Founder bot life goal: "Protect my company, runway, and reputation by choosing partners who improve the odds of survival."
- Investor bot life goal: "Find rare signal without wasting attention, capital, or introductions on weak opportunities."

Representative post-fix truth assessments:

- "Yev may be credible, but I have low confidence from this screen alone because the evidence is still too general."
- "The page title suggests useful structure, but I have low confidence until I see evidence and specifics."

## Verdict

Mortal-truth mode is implemented enough to create visible pressure toward direct, non-performative judgments and to persist auditable artifacts. It is not yet a complete truth-audit system. The next implementation step should be an evaluator pass that scores truth assessments for specificity, evidence grounding, persona consistency, and willingness to reject the product.
