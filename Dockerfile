# syntax=docker/dockerfile:1
# Local Next.js (TEL1276). Not used on Vercel.
#   docker compose up -d
#   docker compose --profile stack up -d

FROM node:25-bookworm-slim AS dev

WORKDIR /app

ENV TEL_SKIP_PREPARE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    WATCHPACK_POLLING=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Bind-mounts overwrite /app (app) and ${PWD} (init). Keep scripts executable
# in git (100755); do not chmod here — it would not survive the mount.
COPY . .

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-dev-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

# Orchestrator for `--profile stack`: supabase CLI + docker CLI so prepare.mjs
# can call `supabase start` / `brain start` against the host daemon.
FROM dev AS stack-init

ARG TARGETARCH
# Compose-init CLI pins (this image only). Host `brew install supabase` is
# independent — bump these ARGs when the stack-init image should match a
# newer CLI. Docker CLI / Compose plugin only talk to the mounted socket.
ARG SUPABASE_CLI_VERSION=2.116.0
ARG DOCKER_CLI_VERSION=27.5.1
ARG DOCKER_COMPOSE_VERSION=2.36.2

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl socat \
    && rm -rf /var/lib/apt/lists/* \
    && DOCKER_ARCH="$([ "$TARGETARCH" = "arm64" ] && echo aarch64 || echo x86_64)" \
    && curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_CLI_VERSION}.tgz" \
        | tar -xz -C /usr/local/bin --strip-components=1 docker/docker \
    && mkdir -p /usr/local/lib/docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${DOCKER_ARCH}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose \
    && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
    && curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin supabase

ENV TEL_COMPOSE=1 \
    TEL_SKIP_PREPARE=0
