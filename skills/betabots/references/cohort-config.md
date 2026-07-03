# Cohort Configuration

Betabot personas are defined by a cohort JSON file. The same thoughtful browser runner can test any application when the cohort file describes the product domain, audience research, user roles, routes, value signals, trust signals, and idea rules.

For product-quality runs, create audience research first. Read `audience-research.md`, then encode its segment weights, vocabulary, traffic mix, and assumptions in the cohort file.

## Minimal Example

```json
{
  "appName": "Acme CRM",
  "researchSources": [
    "analytics: 30-day route and device export",
    "sales notes: repeated objections about follow-up adoption"
  ],
  "audienceSegments": [
    {
      "name": "Sales manager evaluating team adoption",
      "weight": 45,
      "evidence": "Most demo requests mention inconsistent follow-up and team reporting."
    }
  ],
  "roles": [
    {
      "role": "sales manager evaluating team adoption",
      "past": "My team loses deals when follow-up is inconsistent, but new tools often create admin work.",
      "discovery": "A colleague mentioned this after we missed a renewal.",
      "goal": "Decide whether the product helps my team follow up without extra meetings.",
      "lifeGoal": "Build a reputation for choosing tools that protect my team's future."
    },
    {
      "role": "mobile-first account executive",
      "past": "I update deals between calls from my phone and abandon tools that need desktop setup.",
      "goal": "Update one customer record from mobile.",
      "viewport": "mobile"
    }
  ],
  "screenSizeDistribution": [
    {
      "category": "mobile",
      "weight": 50,
      "devices": [{ "name": "iPhone 13", "width": 390, "height": 844, "deviceScaleFactor": 3 }]
    },
    {
      "category": "tablet",
      "weight": 20,
      "devices": [{ "name": "iPad Air", "width": 820, "height": 1180, "deviceScaleFactor": 2 }]
    },
    {
      "category": "desktop",
      "weight": 30,
      "devices": [{ "name": "Laptop 15", "width": 1440, "height": 900, "deviceScaleFactor": 1 }]
    }
  ],
  "routes": [
    { "labels": ["get started", "start", "try"], "fallback": "/" },
    { "labels": ["dashboard", "pipeline"], "fallback": "/dashboard" },
    { "labels": ["pricing", "plans"], "fallback": "/pricing" }
  ],
  "keywords": {
    "value": ["pipeline", "deal", "follow-up", "saved", "report"],
    "trust": ["security", "permissions", "audit", "support"],
    "risk": ["error", "failed", "unauthorized"],
    "empty": ["empty", "no ", "nothing yet"]
  },
  "ideaRules": [
    {
      "when": ["pricing", "plan"],
      "idea": "Show pricing and team limits before asking me to import data."
    }
  ]
}
```

Run it with:

```bash
BETABOT_COHORT_FILE=cohorts/acme-crm.json \
BETABOT_APP_URL=http://localhost:5173 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Fields

- `appName`: Human-readable product name used in thoughts and analysis.
- `audienceResearch`: Optional object or text summary of source evidence, segment assumptions, traffic mix, vocabulary, and objections.
- `researchSources`: Optional array of evidence sources used to design the cohort. Use source labels, not secrets.
- `audienceSegments`: Optional array of weighted audience segments. Each segment can include `name`, `weight`, `evidence`, `jobs`, `objections`, `deviceBias`, `vocabulary`, and `assumptions`.
- `confidenceRules`: Optional thresholds or notes for mapping repeated findings to high/medium/low confidence.
- `roles` or `personas`: Array of strings or objects. Objects can define `role`, `name`, `past`, `discovery`, `goal`, `lifeGoal`, `traits`, `emotionalBaseline`, `technicalComfort`, `viewport`, `screenSize`, `avatar`, and `attentionSpanMinutes`. For truth-pressure runs, prefer explicit `lifeGoal` values for each important persona; generated defaults are useful but less precise than product-specific stakes.
- `screenSizeDistribution`: Optional weighted screen-size buckets. Each bucket has `category`, `weight`, and `devices`; each device has `name`, `width`, `height`, optional `deviceScaleFactor`, `isMobile`, `hasTouch`, and `userAgent`. Defaults to 50% mobile phones, 20% tablets, and 30% desktop/laptop PCs. Override per run with `BETABOT_SCREEN_SIZE_DISTRIBUTION` or legacy alias `BETABOT_VIEWPORT_DISTRIBUTION`.
- `avatar`: Optional custom avatar object or URL for a persona. If omitted, the runner generates a DiceBear avatar from the persona seed.
- `names`: Optional reusable first names for generated personas.
- `discoveries`: Optional discovery circumstances used when a role omits `discovery`.
- `baselines`: Optional emotional baselines such as `curious`, `skeptical`, or `impatient`.
- `routes`: UI exploration strategy. `labels` are visible link or button names; `fallback` is a route to try when no visible control is found.
- `keywords.value`: Words that mean the user saw useful product value.
- `keywords.trust`: Words that increase confidence, safety, or credibility.
- `keywords.risk`: Words that lower trust.
- `keywords.empty`: Words that indicate empty or low-content states.
- `ideaRules`: Rules that convert observed screen text into first-person product ideas.
- `endings`: Optional human session endings.

## Persona Design

A strong cohort covers researched jobs-to-be-done, not demographics only:

- first-time user who lacks category language;
- skeptical buyer comparing alternatives;
- operator/admin responsible for outcomes;
- mobile user with short patience;
- privacy-sensitive or safety-sensitive user;
- power user who wants depth;
- manager or owner who evaluates adoption, revenue, or risk;
- supplier, creator, or marketplace-side user when the app is multi-sided.

For a domain-specific app, put domain roles in the JSON file. Do not bake them into the runner.

For replacement-grade research, every major role should trace back to `audienceSegments` or `researchSources`. If a role is speculative, label that in the role's `traits` or `past`.

## Weighting

Use research to set:

- number of personas per segment;
- screen-size distribution;
- discovery circumstances;
- attention span;
- trust objections;
- route order;
- vocabulary in `keywords`.

If analytics says 70% of visitors are mobile, do not use the generic 50/20/30 mobile/tablet/desktop default. If most traffic arrives from search, include search-intent discovery paths. If sales notes show procurement risk, include buyer personas with proof and risk goals.

## Route Design

Routes should combine visible affordances and realistic fallback paths:

- Use visible labels first because real users click UI, not routes.
- Use fallback paths only as a determined-user behavior.
- Include routes for onboarding, primary value, settings/account, pricing, help, and each marketplace side when applicable.

Labels can be plain strings or regex strings such as `"/^start$/i"`.
