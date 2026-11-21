#!/bin/bash
# ============================================================
#  Bitget Daily Briefing — desktop shortcut (macOS / Linux)
#  Double-click (macOS) or run in a terminal to fetch a fresh
#  briefing and open it.
#  Requires: git and Node.js 18+ (https://nodejs.org)
#
#  First time on macOS: right-click → Open (to pass Gatekeeper),
#  and if needed: chmod +x Bitget-Briefing-Mac.command
# ============================================================
set -e

command -v git >/dev/null || { echo "[!] git is not installed."; read -r -p "Press Enter to close."; exit 1; }
command -v node >/dev/null || { echo "[!] Node.js is not installed — get it from https://nodejs.org"; read -r -p "Press Enter to close."; exit 1; }

DIR="${HOME}/.bitget-briefing/Cryptonic"

if [ ! -d "$DIR/.git" ]; then
  echo "[*] First run: downloading the briefing bot..."
  git clone --quiet https://github.com/far-reach/Cryptonic "$DIR"
fi

cd "$DIR"
git fetch --quiet origin

# Follow the repo's default branch (where the bot now lives); fall back to the feature branch.
git remote set-head origin --auto >/dev/null 2>&1 || true
BR="$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null | sed 's|^origin/||')"
if [ -z "$BR" ] || ! git ls-tree -r --name-only "origin/$BR" 2>/dev/null | grep -q '^packages/bitget-briefing'; then
  BR="claude/bitget-briefing-bot-0z9sdw"
fi

git checkout --quiet "$BR"
git pull --quiet origin "$BR"

cd packages/bitget-briefing
echo "[*] Installing/updating dependencies (first run takes a minute)..."
npm install --silent --no-audit --no-fund

export BRIEFING_OUTPUT="${TMPDIR:-/tmp}/bitget-briefing.md"
echo "[*] Fetching today's Bitget announcements..."
npm run --silent briefing

if command -v open >/dev/null; then
  open -e "$BRIEFING_OUTPUT" || open "$BRIEFING_OUTPUT" || true
elif command -v xdg-open >/dev/null; then
  xdg-open "$BRIEFING_OUTPUT" || true
fi
echo
echo "[OK] Briefing saved to $BRIEFING_OUTPUT (also shown above)."
read -r -p "Press Enter to close."
