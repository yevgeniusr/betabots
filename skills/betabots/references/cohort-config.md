# Cohort Configuration

Betabot personas are defined by a cohort JSON file. The same thoughtful browser runner can test any application when the cohort file describes the product domain, user roles, routes, value signals, trust signals, and idea rules.

## Minimal Example

```json
{
  "appName": "Acme CRM",
  "roles": [
    {
      "role": "sales manager evaluating team adoption",
      "past": "My team loses deals when follow-up is inconsistent, but new tools often create admin work.",
      "discovery": "A colleague mentioned this after we missed a renewal.",
      "goal": "Decide whether the product helps my team follow up without extra meetings."
    },
    {
      "role": "mobile-first account executive",
      "past": "I update deals between calls from my phone and abandon tools that need desktop setup.",
      "goal": "Update one customer record from mobile.",
      "viewport": "mobile"
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
- `roles` or `personas`: Array of strings or objects. Objects can define `role`, `name`, `past`, `discovery`, `goal`, `traits`, `emotionalBaseline`, `technicalComfort`, `viewport`, and `attentionSpanMinutes`.
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

A strong cohort covers jobs-to-be-done, not demographics only:

- first-time user who lacks category language;
- skeptical buyer comparing alternatives;
- operator/admin responsible for outcomes;
- mobile user with short patience;
- privacy-sensitive or safety-sensitive user;
- power user who wants depth;
- manager or owner who evaluates adoption, revenue, or risk;
- supplier, creator, or marketplace-side user when the app is multi-sided.

For a domain-specific app, put domain roles in the JSON file. Do not bake them into the runner.

## Route Design

Routes should combine visible affordances and realistic fallback paths:

- Use visible labels first because real users click UI, not routes.
- Use fallback paths only as a determined-user behavior.
- Include routes for onboarding, primary value, settings/account, pricing, help, and each marketplace side when applicable.

Labels can be plain strings or regex strings such as `"/^start$/i"`.
