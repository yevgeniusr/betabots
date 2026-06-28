#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="betabots"

copy_tree() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  rsync -a --exclude '.git' --exclude '.betabots/runs' --exclude 'node_modules' "$src/" "$dst/"
}

install_codex() {
  local dst="$HOME/plugins/$NAME"
  copy_tree "$ROOT" "$dst"
  mkdir -p "$HOME/.agents/plugins"
  python3 - "$HOME/.agents/plugins/marketplace.json" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]).expanduser()
if path.exists():
    data = json.loads(path.read_text())
else:
    data = {"name": "personal", "interface": {"displayName": "Personal"}, "plugins": []}
plugins = [p for p in data.get("plugins", []) if p.get("name") != "betabots"]
plugins.append({
    "name": "betabots",
    "source": {"source": "local", "path": "./plugins/betabots"},
    "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
    "category": "Coding",
})
data["plugins"] = plugins
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(data, indent=2) + "\n")
PY
  if command -v codex >/dev/null 2>&1; then
    codex plugin add "$NAME@personal" >/dev/null || true
  fi
  mkdir -p "$HOME/.codex/skills"
  copy_tree "$ROOT/skills/betabots" "$HOME/.codex/skills/betabots"
}

install_claude() {
  local dst="$HOME/.claude/plugins/local/$NAME"
  copy_tree "$ROOT" "$dst"
  mkdir -p "$HOME/.claude/skills"
  copy_tree "$ROOT/skills/betabots" "$HOME/.claude/skills/betabots"
  if command -v claude >/dev/null 2>&1; then
    claude plugin marketplace add "$dst" >/dev/null || true
    claude plugin install "$NAME@betabots-dev" --scope user >/dev/null || true
  fi
}

install_cursor() {
  local dst="$HOME/.cursor/plugins/$NAME"
  copy_tree "$ROOT" "$dst"
  mkdir -p "$HOME/.cursor/skills" "$HOME/.cursor/skills-cursor"
  copy_tree "$ROOT/skills/betabots" "$HOME/.cursor/skills/betabots"
  copy_tree "$ROOT/skills/betabots" "$HOME/.cursor/skills-cursor/betabots"
}

case "${1:-all}" in
  codex) install_codex ;;
  claude) install_claude ;;
  cursor) install_cursor ;;
  all) install_codex; install_claude; install_cursor ;;
  *) echo "usage: $0 [all|codex|claude|cursor]" >&2; exit 2 ;;
esac

echo "Installed $NAME locally for ${1:-all}. Restart/new thread required for agents to load updated skills."
