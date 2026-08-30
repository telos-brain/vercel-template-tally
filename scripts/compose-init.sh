#!/bin/sh
# Stack-profile init (TEL1276). Proxies published loopback ports, then
# runs prepare.mjs (supabase start, brain start, keys, db:push).
set -eu

. "$(dirname "$0")/compose-host-ports.sh"

exec node "$(dirname "$0")/prepare.mjs"
