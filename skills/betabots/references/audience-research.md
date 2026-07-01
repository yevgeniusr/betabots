# Audience Research for Betabot Cohorts

Use this before any product-quality betabot run. The goal is to make synthetic users approximate the real audience distribution instead of inventing convenient personas.

## Research Inputs

Collect the strongest available evidence without exposing secrets:

- Product analytics: top routes, referrers, search terms, device mix, geography, returning/new split, conversion events, drop-off points.
- Sales/support/customer notes: objections, buying triggers, wording customers use, common confusion, urgency, dealbreakers.
- Public web evidence: landing page claims, docs, pricing, social profiles, app-store reviews, community posts, competitor reviews, SEO snippets, category vocabulary.
- Business context: ICP, pricing, acquisition channel, product maturity, sales cycle, risk level, required trust, existing audience assumptions.
- Behavioral constraints: mobile share, session length, account requirement, payment sensitivity, privacy sensitivity, accessibility needs.

If analytics or private customer data is unavailable, say so explicitly and use public evidence plus clearly labeled assumptions.

## Audience Research Artifact

Save `audience-research.md` or `audience-research.json` in the run folder or project. Include:

```json
{
  "product": "Product name",
  "researchSources": [
    "analytics: PostHog 30-day route/device/referrer export",
    "public: homepage/pricing/docs",
    "public: competitor review themes"
  ],
  "audienceSegments": [
    {
      "name": "Seed-stage founder",
      "weight": 35,
      "evidence": "Most contact/referral traffic mentions founder/advisory intent.",
      "jobs": ["decide credibility", "understand expected outcome"],
      "objections": ["vague proof", "unclear pricing", "slow response"],
      "deviceBias": "desktop"
    }
  ],
  "trafficMix": {
    "mobile": 45,
    "tablet": 10,
    "desktop": 45
  },
  "vocabulary": ["terms real users use"],
  "assumptions": ["clearly mark anything inferred"]
}
```

## Cohort Translation

Turn research into the cohort file:

- One persona family per meaningful segment, weighted by the research.
- `role` should describe the job-to-be-done, not just a demographic.
- `past` should encode the segment's prior pain or motivation.
- `discovery` should mirror actual acquisition paths: search, referral, social, ad, marketplace, outbound, word of mouth.
- `goal` should represent the decision the user needs to make today.
- `technicalComfort`, `emotionalBaseline`, and `attentionSpanMinutes` should follow segment evidence where available.
- `screenSizeDistribution` should mirror traffic/device mix rather than defaulting to generic weights.
- `keywords` should include the vocabulary and proof signals real users care about.
- `ideaRules` should convert observed friction into product hypotheses relevant to the researched segments.

## Replacement-Grade Rules

Do not call a run replacement-grade unless all are true:

- Personas are research-backed and weighted.
- Thoughtful mode runs at human pace.
- LLM minds are enabled and actually called.
- Raw logs and screenshots exist for every completed session.
- Findings are tiered by confidence.
- The report separates evidence-backed findings from assumptions.

When these conditions are not met, label the output as directional synthetic UX signal.
