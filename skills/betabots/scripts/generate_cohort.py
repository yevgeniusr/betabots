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


def persona(index: int, rng: random.Random) -> dict:
    role = ROLES[index % len(ROLES)] if index < len(ROLES) else rng.choice(ROLES)
    return {
        "id": f"metabot-{index + 1:02d}",
        "name": rng.choice(["Maya", "Leo", "Sam", "Nina", "Omar", "Iris", "Theo", "Jules", "Rae", "Max"]),
        "age": rng.randint(19, 54),
        "role": role,
        "past": rng.choice(PASTS),
        "discovery_circumstance": rng.choice(CIRCUMSTANCES),
        "goal_today": rng.choice(GOALS),
        "emotional_baseline": rng.choice(EMOTIONS),
        "technical_comfort": rng.choice(TECH),
        "attention_span_minutes": rng.randint(3, 18),
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
    args = parser.parse_args()

    rng = random.Random(args.seed)
    cohort = {
        "product": args.product,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "session_rule": "Each persona behaves as a real human, not as QA, and knows nothing about code.",
        "personas": [persona(index, rng) for index in range(args.count)],
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
