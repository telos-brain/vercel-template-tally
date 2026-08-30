#!/bin/sh
# Stack-profile init (TEL1276). supabase / brain / drizzle CLIs talk to
# 127.0.0.1 on published host ports. Inside this container that is us, not
# the host — forward those ports to host.docker.internal.
set -eu

proxy() {
  port="$1"
  socat "TCP-LISTEN:${port},bind=127.0.0.1,fork,reuseaddr" \
    "TCP:host.docker.internal:${port}" &
}

# supabase/config.toml + brain.config.toml
for port in 54320 54321 54322 54323 54324 54327 60061 1433; do
  proxy "$port"
done

exec node scripts/prepare.mjs
