#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 24.04 VPS (run as root):
#   curl -fsSL <raw-url>/setup-vps.sh | bash -s -- https://github.com/far-reach/Cryptonic.git
# or from a clone: sudo packages/trader/deploy/setup-vps.sh
# Installs Node 22, builds the trader, and installs the systemd unit.
# Idempotent: safe to re-run for updates (git pull + rebuild + restart).
set -euo pipefail

REPO_URL="${1:-https://github.com/far-reach/Cryptonic.git}"
BASE=/opt/cryptonic
REPO="$BASE/repo"
RUN="$BASE/run"
TRADER="$REPO/packages/trader"

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }

echo "==> system user + directories"
id trader &>/dev/null || useradd --system --home "$RUN" --shell /usr/sbin/nologin trader
mkdir -p "$RUN"

echo "==> Node.js 22 (NodeSource)"
if ! command -v node &>/dev/null || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs git
fi

echo "==> clone/update repo"
if [ -d "$REPO/.git" ]; then
  git -C "$REPO" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$REPO"
fi

echo "==> build trader"
cd "$TRADER"
# --workspaces=false: build the trader standalone against its own lockfile,
# ignoring the monorepo's workspace root (we don't need the other packages).
npm ci --workspaces=false
npm run build

echo "==> run directory (config + env, created only if missing)"
[ -f "$RUN/config.json" ] || cp "$TRADER/config.example.json" "$RUN/config.json"
[ -f "$RUN/.env" ] || { cp "$TRADER/.env.example" "$RUN/.env"; chmod 600 "$RUN/.env"; }
chown -R trader:trader "$RUN"

echo "==> systemd unit"
cp "$TRADER/deploy/trader.service" /etc/systemd/system/trader.service
systemctl daemon-reload
systemctl enable trader

if systemctl is-active --quiet trader; then
  systemctl restart trader
  echo "==> trader restarted with the new build"
else
  cat <<'EOF'

Setup complete. Before the first start:
  1. edit /opt/cryptonic/run/.env         (API keys, heartbeat/alert URLs)
  2. review /opt/cryptonic/run/config.json (symbol, budget, grid)
  3. read packages/trader/PREREG.md        (which gate are you in?)
then:
  systemctl start trader
  journalctl -u trader -f
EOF
fi
