#!/usr/bin/env bash
# Open the actual interactive Codex CLI in a Codespaces/host terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .bastilla-tools/codex/node_modules/.bin/codex ]]; then
  echo "Installing Codex CLI into .bastilla-tools/codex ..."
  bash scripts/setup-codex.sh
fi
if [[ ! -t 0 || ! -t 1 ]]; then
  echo "Codex requires an interactive TTY. Open a Codespaces terminal and run: bash scripts/codex-console.sh" >&2
  exit 2
fi
echo "BastillaOS Codex console — workspace: $(pwd)"
echo "If authentication is needed, run: npm run codex -- login --device-auth"
exec bash scripts/run-codex.sh
