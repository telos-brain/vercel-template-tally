#!/bin/sh
# Rewrite loopback hosts so server-side URLs reach services published on the
# Docker host. Browser-facing NEXT_PUBLIC_* stay as written in .env.
set -eu

rewrite_loopback() {
  printf '%s' "$1" | sed -e 's/127\.0\.0\.1/host.docker.internal/g' -e 's/localhost/host.docker.internal/g'
}

if [ -z "${SUPABASE_INTERNAL_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  SUPABASE_INTERNAL_URL="$(rewrite_loopback "$NEXT_PUBLIC_SUPABASE_URL")"
  export SUPABASE_INTERNAL_URL
fi

if [ -n "${POSTGRES_URL:-}" ]; then
  POSTGRES_URL="$(rewrite_loopback "$POSTGRES_URL")"
  export POSTGRES_URL
fi

if [ -n "${BRAIN_URL:-}" ]; then
  BRAIN_URL="$(rewrite_loopback "$BRAIN_URL")"
  export BRAIN_URL
fi

exec "$@"
