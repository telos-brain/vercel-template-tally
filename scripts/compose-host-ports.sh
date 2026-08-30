# Shared by compose-init.sh and compose-deploy.sh (TEL1276).
# supabase / brain / drizzle CLIs talk to 127.0.0.1 on published host ports.
# Inside the init container that is us, not the host — forward those ports
# to host.docker.internal. Source this file; do not exec it.
#
# Ports: supabase/config.toml (shadow, API, db, studio, analytics, inspector)
# plus brain.config.toml (API, SQL). Pooler 54329 is disabled in config.toml.

compose_proxy_host_port() {
  port="$1"
  socat "TCP-LISTEN:${port},bind=127.0.0.1,fork,reuseaddr" \
    "TCP:host.docker.internal:${port}" &
}

for port in 54320 54321 54322 54323 54324 54327 60061 1433; do
  compose_proxy_host_port "$port"
done
