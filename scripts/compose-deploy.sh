#!/bin/sh
# Deploy local-brain from the stack-profile init image (TEL1276).
# Starts the same loopback proxies as compose-init.sh so the CLI can reach
# 127.0.0.1:60061, then runs the package Brain CLI from the bind-mounted
# repo ($PWD), not the image copy at /app (which has no .env.local).
#
#   docker compose --profile stack run --rm init ./scripts/compose-deploy.sh
set -eu

. "$(dirname "$0")/compose-host-ports.sh"

root="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
cli="$root/node_modules/@telos.ready/brain/dist/index.js"

if [ ! -f "$cli" ]; then
  echo "Brain CLI package not found at $cli. Rebuild: docker compose build" >&2
  exit 1
fi

cd "$root/brain"
exec node "$cli" deploy --env local --instance local-brain
