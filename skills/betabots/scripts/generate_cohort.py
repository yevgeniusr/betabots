#!/usr/bin/env python3
import argparse
import json
import random
from datetime import datetime, timezone
from pathlib import Path


ROLES = [
    "urgent primary user",
    "curious skeptic",
    "low-technical-comfort user",
    "power user comparing alternatives",
    "privacy-sensitive user",
    "mobile-first impatient user",
    "returning user",
    "mismatched-expectation edge user",
    "marketplace supply-side user",
    "marketplace demand-side user",
    "lurker evaluating trust",
    "friend-referral visitor",
]

PASTS = [
    "recently had a frustrating experience with a competing product",
    "heard about the product from a friend but only half remembers why",
    "saw a social post while distracted between errands",
    "has tried several apps in this category and distrusts big promises",
    "is new to the category and does not know the vocabulary",
    "used something similar years ago and expects the same mental model",
    "is doing this late at night with low patience",
    "is exploring for a friend or partner rather than themselves",
]

CIRCUMSTANCES = [
    "opens the app from a phone during a short break",
    "opens the landing page from a laptop after seeing a link",
    "arrives through search and compares claims against alternatives",
    "gets interrupted twice and returns mid-flow",
    "has weak motivation and will leave if the first screen is unclear",
    "worries about privacy before sharing any personal information",
    "wants one concrete outcome quickly",
    "expects entertainment more than utility",
]

GOALS = [
    "understand what this is and whether it is for them",
    "get to the first useful result without reading much",
    "decide whether the product feels safe enough",
    "compare the product to an existing habit",
    "try a core flow and see if it feels worth returning",
    "find pricing, rules, or trust signals",
    "create something they can show a friend",
    "leave feedback or contact someone if stuck",
]

EMOTIONS = [
    "curious but impatient",
    "skeptical and guarded",
    "lonely and hopeful",
    "busy and easily annoyed",
    "playful and experimental",
    "anxious about privacy",
    "confident and demanding",
    "tired and mistake-prone",
]

TECH = ["low", "medium-low", "medium", "medium-high", "high"]
ENDINGS = [
    "became bored and left",
    "got lost and did not know what to do",
    "got angry after a blocked expectation",
    "completed a useful session and may return later",
    "felt unsafe or unconvinced and left",
    "hit a bug or dead end",
    "saved/bookmarked for later",
]

SCREEN_SIZE_DISTRIBUTION = [
    {
        "category": "mobile",
        "weight": 50,
        "devices": [
            {"name": "iPhone SE", "width": 375, "height": 667, "deviceScaleFactor": 2},
            {"name": "iPhone 13", "width": 390, "height": 844, "deviceScaleFactor": 3},
            {"name": "iPhone 15 Pro Max", "width": 430, "height": 932, "deviceScaleFactor": 3},
            {"name": "Pixel 7", "width": 412, "height": 915, "deviceScaleFactor": 2.625},
            {"name": "Galaxy S22", "width": 360, "height": 780, "deviceScaleFactor": 3},
        ],
    },
    {
        "category": "tablet",
        "weight": 20,
        "devices": [
            {"name": "iPad Mini", "width": 768, "height": 1024, "deviceScaleFactor": 2},
            {"name": "iPad Air", "width": 820, "height": 1180, "deviceScaleFactor": 2},
            {"name": "Surface Pro", "width": 912, "height": 1368, "deviceScaleFactor": 2},
        ],
    },
    {
        "category": "desktop",
        "weight": 30,
        "devices": [
            {"name": "Laptop 13", "width": 1280, "height": 800, "deviceScaleFactor": 1},
            {"name": "Laptop 15", "width": 1440, "height": 900, "deviceScaleFactor": 1},
            {"name": "Desktop HD", "width": 1920, "height": 1080, "deviceScaleFactor": 1},
        ],
    },
]


def weighted_choice(distribution: list[dict], rng: random.Random) -> dict:
    total = sum(float(item.get("weight", 0)) for item in distribution)
    threshold = rng.random() * total
    for item in distribution:
        threshold -= float(item.get("weight", 0))
        if threshold <= 0:
            return item
    return distribution[-1]


def select_screen_size(distribution: list[dict], rng: random.Random, category: str | None = None) -> dict:
    bucket = next((item for item in distribution if item.get("category") == category), None)
    if bucket is None:
        bucket = weighted_choice(distribution, rng)
    device = dict(rng.choice(bucket["devices"]))
    device["category"] = device.get("category", bucket["category"])
    return device


def screen_category_plan(count: int, distribution: list[dict], rng: random.Random) -> list[str]:
    total = sum(float(item.get("weight", 0)) for item in distribution)
    rows = []
    for item in distribution:
        exact = count * float(item.get("weight", 0)) / total
        whole = int(exact)
        rows.append({"category": item["category"], "count": whole, "remainder": exact - whole})
    assigned = sum(row["count"] for row in rows)
    for row in sorted(rows, key=lambda item: item["remainder"], reverse=True):
        if assigned >= count:
            break
        row["count"] += 1
        assigned += 1
    categories = [row["category"] for row in rows for _ in range(row["count"])]
    rng.shuffle(categories)
    return categories


def first_person(fragment: str) -> str:
    replacements = {
        "has ": "have ",
        "is ": "am ",
        "opens ": "open ",
        "arrives ": "arrive ",
        "gets ": "get ",
        "worries ": "worry ",
        "wants ": "want ",
        "expects ": "expect ",
    }
    normalized = fragment
    for prefix, replacement in replacements.items():
        if normalized.startswith(prefix):
            normalized = replacement + normalized[len(prefix):]
            break
    return f"I {normalized}."


def persona(index: int, rng: random.Random, screen_distribution: list[dict], screen_plan: list[str]) -> dict:
    role = ROLES[index % len(ROLES)] if index < len(ROLES) else rng.choice(ROLES)
    screen_size = select_screen_size(screen_distribution, rng, screen_plan[index])
    past = rng.choice(PASTS)
    trigger = rng.choice(CIRCUMSTANCES)
    goal = rng.choice(GOALS)
    emotion = rng.choice(EMOTIONS)
    attention_span = rng.randint(3, 18)
    return {
        "id": f"metabot-{index + 1:02d}",
        "name": rng.choice(["Maya", "Leo", "Sam", "Nina", "Omar", "Iris", "Theo", "Jules", "Rae", "Max"]),
        "age": rng.randint(19, 54),
        "role": role,
        "identity": f"I am approaching this decision as: {role}.",
        "lifeSituation": first_person(past),
        "trigger": first_person(trigger),
        "jobToBeDone": f"I need to {goal}.",
        "priorAttempts": [first_person(past)],
        "stakes": ["I do not want to waste limited attention or trust on another weak option."],
        "constraints": [f"I have roughly {attention_span} minutes of attention for this visit."],
        "anxieties": ["I may commit attention before the product proves it understands my situation."],
        "objections": ["Generic promises will not be enough for me to continue."],
        "trustThreshold": "I need one visible, specific result tied to an action I chose.",
        "decisionCriteria": ["A clear next step", "Specific visible value", "No unexpected risk"],
        "vocabulary": ["worth my time", "clear next step", "specific result"],
        "digitalHabits": [f"I am using a {screen_size['category']} device for this visit."],
        "socialContext": "Someone I trust may hear whether this experience was worth recommending.",
        "successEvidence": ["A visible result that directly advances today's goal."],
        "abandonmentConditions": ["The next step stays vague", "The product asks for trust before showing value"],
        "provenance": {
            "source": "standalone-seeded-generator",
            "observedEvidence": [],
            "userGuidance": [],
            "assumptions": [
                "This persona was generated without visible product analysis.",
                "All life context and decision psychology are synthetic assumptions.",
            ],
        },
        "past": past,
        "discovery_circumstance": trigger,
        "goal_today": goal,
        "emotional_baseline": emotion,
        "technical_comfort": rng.choice(TECH),
        "viewport": screen_size["category"],
        "screen_size": screen_size,
        "attention_span_minutes": attention_span,
        "likely_endings": rng.sample(ENDINGS, 3),
        "must_not_know": [
            "source code",
            "test plan",
            "expected product behavior",
            "that they are a beta tester",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a metabot cohort JSON file.")
    parser.add_argument("--count", type=int, default=12)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--product", default="the application")
    parser.add_argument("--out", default="-")
    parser.add_argument(
        "--screen-size-distribution",
        default=None,
        help="JSON array overriding weighted screen-size buckets. Defaults to 50%% mobile, 20%% tablet, 30%% desktop.",
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)
    screen_distribution = json.loads(args.screen_size_distribution) if args.screen_size_distribution else SCREEN_SIZE_DISTRIBUTION
    screen_plan = screen_category_plan(args.count, screen_distribution, rng)
    cohort = {
        "product": args.product,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "session_rule": "Each persona behaves as a real human, not as QA, and knows nothing about code.",
        "screen_size_distribution": screen_distribution,
        "personas": [persona(index, rng, screen_distribution, screen_plan) for index in range(args.count)],
    }

    text = json.dumps(cohort, indent=2, ensure_ascii=False)
    if args.out == "-":
        print(text)
    else:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
