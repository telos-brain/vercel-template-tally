# TALLY: Vercel Brain Supabase Template Demo

Demo app (Next.js, Clerk, Supabase) with a Telos Brain schema in `brain/` with the flavour of a personal-finance app. After sign-in you get **Dashboard**, **Chat**, **Transactions**, **Budgets**, and **Insights**. Clone this repo, run everything locally, then deploy the same app and brain schema to stage/prod.

## Prerequisites

- Node.js 25+ (see `.nvmrc`)
- Docker Desktop (or Engine + Compose on Linux, or equivalent like OrbStack).
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (`brew install supabase/tap/supabase`)
- A [Clerk](https://clerk.com) account (optional locally; required for stage/prod)
- An [Anthropic](https://console.anthropic.com) API key
- A [Voyage](https://dash.voyageai.com) API key (embeddings; this brain defaults to `voyage-3-lite`)
  - Add Anthropic and VoyageAI keys before running the 'brain deploy' step.

| Environment | App | Brain |
|---|---|---|
| **Dev (local)** | `npm run dev` + local Supabase (Clerk optional) | Docker on your machine (`brain start`) |
| **Preview / Production** | Vercel + hosted Supabase | [Telos Hosted](https://go.telosbrain.com) (`npm run brain:deploy` on the Vercel build) |

Local Brain is self-hosted Docker and does not use Clerk. The host app can run locally without Clerk: `next dev` with placeholder Clerk keys signs you in as `local@localhost` in a seeded **Local** organisation. Clerk is required on Vercel / production.

After setup you can open **Chat** and paste a bank statement (`samples/bank-statement.txt`).

## 1. Clone and install

```bash
git clone https://github.com/telos-brain/vercel-template-tally.git
cd vercel-template-tally
npm install
```

`npm install` runs the `prepare` script: it prints the [Prerequisites](#prerequisites) above, then `supabase start`, writes local Supabase keys into `.env`, installs the pinned `@telos.ready/brain` CLI globally, generates a shared tool API key (`TOOL_API_KEY` / `MY_APP_API_KEY`), runs `brain start`, copies the announced Brain execution key into `.env` and `brain/.env.local` as `BRAIN_API_KEY`, and runs `npm run db:push`. Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) must already be available.

You can run the same flow later with `npm run prepare`. Skip it with `TEL_SKIP_PREPARE=1` (CI skips automatically). `npm run stack:reset` stops this repo's local Brain (and deletes its Docker SQL volume) and this project's Supabase. It does not stop other Compose stacks. Then `npm run prepare` to start clean.

Then fill `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, and any remaining `MY_APP_*` values in `brain/.env.local`. Do not commit `.env` files.

Optional app vars (already defaulted in code):

| Variable | Default | Used for |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `TALLY` | Invite emails and display name |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Invite links. Set this to your public URL on stage/prod. |

Postmark (`POSTMARK_SERVER_TOKEN`, `FROM_EMAIL`) is only required when inviting teammates, not for first chat.

## 2. Clerk (optional locally)

Local `npm run dev` works without Clerk keys. Leave the placeholder values in `.env`. The app skips Clerk and seeds `local@localhost` plus a **Local** organisation on first request.

Add real Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starting with `pk_`) when you want the production sign-in path locally. Clerk is required on Vercel / production (`NODE_ENV=production` or `VERCEL` set) — the bypass never runs there.

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Copy the **Publishable** and **Secret** keys into `.env`:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. Open [Clerk’s Connect with Supabase](https://dashboard.clerk.com/setup/supabase), select the app, and **Activate Supabase integration**.
4. Copy the Clerk domain (e.g. `your-app.clerk.accounts.dev`).
5. Put that domain in `supabase/config.toml`:

```toml
[auth.third_party.clerk]
enabled = true
domain = "your-app.clerk.accounts.dev"
```

For hosted Supabase (stage/prod), also add Clerk as a third-party provider in the [Supabase Dashboard](https://supabase.com/dashboard) under **Authentication → Third-Party Auth**.

## 3. Local database

1. Open Docker Desktop.
2. `npm install` / `npm run prepare` already ran `supabase start` and wrote these into `.env`:
   - `NEXT_PUBLIC_SUPABASE_URL` — API URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Publishable key (`sb_publishable_…`)
   - `SUPABASE_SECRET_KEY` — Secret key (`sb_secret_…`, server only)
   - `POSTGRES_URL` — database URL

   Use publishable/secret keys, not legacy `anon` / `service_role` JWTs. To refresh them later, run `npm run prepare` again.

3. `prepare` already applied the schema with `npm run db:push`. Re-run that command after you change `db/schema.ts`. Local development uses `db:push`. On hosted Postgres, apply migrations with `npm run db:migrate`.

## 4. Local Brain (dev)

The schema already lives in `brain/`. You do not run `brain init`. `npm install` / `npm run prepare` already installed the pinned `@telos.ready/brain` CLI, generated `MY_APP_API_KEY` (same value as app `TOOL_API_KEY`), ran `brain start`, and wrote `BRAIN_API_KEY` from that start into the app `.env` and `brain/.env.local`.

`brain start` boots SQL Server + Brain in Docker, writes `brain/.env.local` if missing, and opens the admin UI at [http://127.0.0.1:60061](http://127.0.0.1:60061) (no sign-in).

Fill in the keys `prepare` cannot know, in `brain/.env.local`:

```bash
ANTHROPIC_API_KEY=your-anthropic-api-key
VOYAGE_API_KEY=your-voyage-api-key
MY_APP_API_URL=http://host.docker.internal:3000
# MY_APP_API_KEY and BRAIN_API_KEY are already set by npm prepare script.
```

Leave the `TELOS_*` values that `brain start` wrote — they are the well-known local org key and `http://127.0.0.1:60061`. `TELOS_*` is CLI config only; it is never uploaded to the brain.

Deploy so the brain stores `BRAIN_API_KEY` for tool callbacks:

```bash
brain deploy --env local --instance local-brain
```

Do not delete `brain.lock`. Run `brain snapshot --env local --instance local-brain` before later deploys if the live brain has learned (avoids version conflicts).

Use `host.docker.internal`, not `localhost`, for `MY_APP_API_URL`. Brain runs inside Docker; `localhost` inside the container is Brain, not Next.js.

## 5. Pair the app and Brain

In the **app** `.env`:

```bash
BRAIN_URL=http://127.0.0.1:60061
BRAIN_API_KEY=your-brain-execution-api-key
TOOL_API_KEY=your-shared-tool-api-key
```

`prepare` already sets `BRAIN_URL`, a matching `TOOL_API_KEY` / `MY_APP_API_KEY`, and `BRAIN_API_KEY` on both sides from `brain start`. `BRAIN_API_KEY` must stay in sync.

| Direction | Auth | Purpose |
|---|---|---|
| App → Brain Execution API | `Authorization: Bearer ${BRAIN_API_KEY}` | Create entities, run workflows |
| Brain → App `/api/tools/*` | `Authorization: Bearer ${TOOL_API_KEY}` **and** `X-Brain-Authorization: Bearer ${BRAIN_API_KEY}` | Finance and host tools |

If `BRAIN_URL` / `BRAIN_API_KEY` are unset, the app still runs; organisation entity creation and chat are skipped.

## 6. Run the app

From the repo root (not `brain/`):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Clerk keys you land on **Dashboard** as `local@localhost`. With Clerk, sign in and create an organisation, then:

1. Open **Chat** and send a message (workflow `WF-CHAT`). Chats persist in the sidebar; titles are generated automatically (`WF-CHAT-TITLE`). You can watch tools run while Brain works.
2. Paste `samples/bank-statement.txt` into chat, or use **Transactions** / **Budgets**.

You should now have three processes: Next.js `:3000`, Supabase (CLI ports), Brain `:60061`.

```bash
brain status    # API URL, health, Compose project id
# later:
npm run stack:reset   # stop this repo's Brain (--reset) and Supabase
```

## Stage and production (Vercel + Telos Hosted)

First-time walkthrough (real screens for Telos Hosted, GitHub import, and the Clerk / Supabase / Vercel sign-in pages): [docs/hosted-deploy.md](docs/hosted-deploy.md).

Use local Docker Brain for **dev** only. For Preview and Production, Vercel deploys the Next.js app **and** the `brain/` schema together, the same way it applies Drizzle migrations. Sign up at [Telos Hosted](https://go.telosbrain.com) (includes $10 free credit) and mint an organisation API key.

On Vercel, `npm run build` runs `db:migrate`, then `brain:deploy` (to [go.telosbrain.com](https://go.telosbrain.com)), then `next build`. Local `npm run build` is still `next build` only.

Set these on **Production** and **Preview** (different values, like `POSTGRES_URL`):

| Variable | Purpose |
|---|---|
| `TELOS_BRAIN_ORG_API_KEY` | Org key from go.telosbrain.com (CLI only, never uploaded to the brain) |
| `ANTHROPIC_API_KEY` | Required for this brain’s workflows |
| `VOYAGE_API_KEY` | Required (`voyage-3-lite` embeddings) |
| `TOOL_API_KEY` | Shared tool handshake; copied to `MY_APP_API_KEY` on deploy |
| `BRAIN_URL` | App-side Execution API: `https://go.telosbrain.com` |
| `BRAIN_API_KEY` | Per-brain execution key (see first deploy below) |
| `POSTGRES_URL` | Hosted Postgres (Drizzle migrate) |
| `BRAIN_INSTANCE` | Optional. Default `{VERCEL_PROJECT_NAME}-prod` or `{VERCEL_PROJECT_NAME}-preview` |
| `MY_APP_API_URL` | Optional override. Default: production URL, or the Preview deployment URL |
| `TELOS_BRAIN_API_URL` | Optional. Default `https://go.telosbrain.com` |
| `BRAIN_CALLBACK_DOMAIN` | Optional extra hostname merged into `allowed-callback-domains` |
| `BRAIN_DEPLOY` | Set to `0` to skip Brain deploy (app + Drizzle still deploy) |

Also set Clerk, Supabase, and `NEXT_PUBLIC_SITE_URL` per environment. Keep `TOOL_API_KEY` / `MY_APP_API_KEY` and `BRAIN_API_KEY` in sync per environment. Preview and Production **must** use different `BRAIN_INSTANCE` names (the defaults already do). Do not reuse `local-brain`.

The deploy script copies `brain/.env.example` so declared key names exist, then Vercel env vars override placeholders. It also merges the current app hostname into `allowed-callback-domains` in an ephemeral compose file (Preview URLs change; no wildcards). Add a stable custom domain to `allowed-callback-domains` in `brain/brain-compose.yml` as well.

**First hosted deploy:** the CLI prints a **new** execution API key in the Vercel build log (do not reuse the local key). Paste it into that environment’s `BRAIN_API_KEY`, then redeploy so it is uploaded for tool callbacks.

To deploy the brain from a laptop with the same env vars:

```bash
npm run brain:deploy
```

Self-hosted Docker Brain on your own servers is the same stack as local (`brain start` / BRA106). Stage and prod in this template are intended to use Telos Hosted.

## Database migrations

```bash
npm run db:push       # local: apply schema.ts directly
npm run db:generate   # write a migration for deploy
npm run db:migrate    # apply migrations (Vercel / production)
npm run brain:deploy  # deploy brain/ to Telos Hosted (Vercel / production)
```

Do not commit `.env`, `brain/.env.local`, `brain/.env.stage`, `brain/.env.prod`, or `brain.lock` if it contains keys.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `npm install` tries to start Docker | `prepare` runs the local stack. Use `TEL_SKIP_PREPARE=1 npm install` in CI or if you only want dependencies |
| Chat: Brain is not configured | App `.env` missing `BRAIN_URL` or `BRAIN_API_KEY` |
| `BRAIN_API_KEY was not announced` | Leftover local Brain Docker volume; the execution key is shown only once at create. `prepare` resets that volume when neither env file has a real key. Manual recovery: `npm run stack:reset`, then `npm run prepare` |
| Tools never hit Next.js | `MY_APP_API_URL` used `localhost` instead of `http://host.docker.internal:3000` |
| Tool webhook 401 | `TOOL_API_KEY` ≠ `MY_APP_API_KEY`, or Brain keys differ |
| Deploy fails on embeddings | Blank `VOYAGE_API_KEY` in the Vercel env (or brain env file) |
| Vercel build fails at `brain:deploy` | Missing `TELOS_BRAIN_ORG_API_KEY` / `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` / `TOOL_API_KEY`. Set `BRAIN_DEPLOY=0` to ship the app first |
| Tools never hit the Vercel app | Hostname missing from `allowed-callback-domains`, or `MY_APP_API_URL` / `BRAIN_API_KEY` still a placeholder after first hosted deploy |
| Port 1433 already allocated | Change `sql_port` in `brain/brain.config.toml`, then `brain start` again |
| Version conflict on redeploy | `brain snapshot --env local --instance local-brain` then deploy |

Schema edits under `brain/` go live with another `brain deploy --env local` (dev) or the Vercel build / `npm run brain:deploy` (hosted). Details: [`brain/README.md`](brain/README.md) and skill **BRA106**.

## Tech stack

- [Next.js](https://nextjs.org/) — React framework
- [Clerk](https://clerk.com/) — Authentication (optional locally; required in production)
- [Supabase](https://supabase.com/) — Database and storage
- [Drizzle ORM](https://orm.drizzle.team/) — Database ORM
- [Telos Brain](https://go.telosbrain.com) — Local Docker (dev) or Telos Hosted (stage/prod)
- [TailwindCSS](https://tailwindcss.com/) — CSS framework
- [TypeScript](https://www.typescriptlang.org/) — Type safety

## Additional information

Database schema: `db/schema.ts`.

Server helpers:

```ts
import { ensureBrainEntityForOrganisation } from "@/server/brain/entities";
import { runWorkflowSync } from "@/server/brain/client";

const entityId = await ensureBrainEntityForOrganisation(orgId);
if (entityId) {
  await runWorkflowSync("WF-CHAT", { inputMessage: "...", entityId });
}
```

Host tools live in `src/server/tools/host-tools.ts`. Brain tool definitions are under `brain/tools/execution/finance/` and `brain/tools/execution/my-app/`.
