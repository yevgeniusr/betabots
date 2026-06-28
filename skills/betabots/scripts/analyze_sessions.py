#!/usr/bin/env python3
import argparse
import re
from collections import Counter
from pathlib import Path


PATTERNS = {
    "confusion": r"\b(confus|lost|unclear|don't understand|not sure|where|what do i)\b",
    "trust": r"\b(trust|safe|privacy|creepy|scam|real|secure)\b",
    "friction": r"\b(stuck|slow|annoy|can't|cannot|error|broken|blocked|dead end)\b",
    "value": r"\b(useful|helpful|cool|love|interesting|worth|return|save)\b",
    "abandonment": r"\b(left|leave|bored|angry|gave up|quit|closed)\b",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate metabot raw-session notes.")
    parser.add_argument("raw_dir", help="Directory containing raw markdown session files")
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    files = sorted(raw_dir.glob("*.md"))
    counts = Counter()
    rows = []

    for file in files:
        text = file.read_text(encoding="utf-8")
        lowered = text.lower()
        matched = []
        for label, pattern in PATTERNS.items():
            hits = len(re.findall(pattern, lowered))
            if hits:
                counts[label] += hits
                matched.append(f"{label}:{hits}")
        end_reason = ""
        match = re.search(r"End reason:\s*(.+)", text, re.IGNORECASE)
        if match:
            end_reason = match.group(1).strip()
        rows.append((file.name, ", ".join(matched) or "none", end_reason))

    lines = [
        "# Metabot Session Aggregate",
        "",
        f"Sessions analyzed: {len(files)}",
        "",
        "## Signal Counts",
        "",
    ]
    for label, count in counts.most_common():
        lines.append(f"- {label}: {count}")
    if not counts:
        lines.append("- No keyword signals detected; read raw sessions manually.")

    lines += ["", "## Session Table", "", "| File | Signals | End Reason |", "|---|---|---|"]
    for name, signals, end_reason in rows:
        lines.append(f"| {name} | {signals} | {end_reason} |")

    output = "\n".join(lines) + "\n"
    if args.out == "-":
        print(output)
    else:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(output, encoding="utf-8")


if __name__ == "__main__":
    main()
