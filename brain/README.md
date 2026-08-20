# Starter Brain

Schema for the host app in the parent folder. **First-time install:** follow the [root README](../README.md) — clone the repo, run local Supabase (Clerk is optional locally), then `brain start` / `brain deploy --env local`. Do not run `brain init`; this folder is already the schema.

| Environment | Brain | Command |
|---|---|---|
| **Dev** | Local Docker | `brain start` then `brain deploy --env local --instance local-brain` |
| **Preview / Production** | [Telos Hosted](https://go.telosbrain.com) ($10 free credit) | Vercel `npm run build` runs `npm run brain:deploy` (or run it from the repo root) |

Precise enough for Cursor / Claude Code. Complete local steps in the root README first.

## Local (dev)

```bash
# From repo root: npm install (or npm run prepare) starts Brain, writes
# MY_APP_API_KEY plus BRAIN_API_KEY (from brain start) into .env.local and the app .env,
# and runs npm run db:push. Then fill ANTHROPIC_API_KEY, VOYAGE_API_KEY, and remaining
# MY_APP_* in .env.local
brain deploy --env local --instance local-brain
```

Do not delete `brain.lock`. Hosted first deploy still prints a **new** execution key — do not reuse the local one.

From the repo root, `npm run stack:reset` stops this stack and deletes the local SQL volume. Then `npm run prepare` to start clean.

`brain snapshot --env local --instance local-brain` before redeploying if the live brain has learned.

Full local stack behaviour: skill **BRA106** (`skills/telos-brain/concepts/BRA106-local-development.md`).

## Preview and production (Telos Hosted)

Vercel deploys this schema on every Preview and Production build (`npm run brain:deploy` from the repo root), next to Drizzle migrate. Set `TELOS_BRAIN_ORG_API_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, and `TOOL_API_KEY` on each Vercel environment. Preview defaults to instance `{project}-preview` (`--env stage`); Production to `{project}-prod` (`--env prod`). Override with `BRAIN_INSTANCE`.

The script copies `.env.example` to `.env.stage` / `.env.prod` so declared keys exist; Vercel secrets override placeholders. It merges the current app hostname into `allowed-callback-domains` (exact hosts only — no wildcards). Add a stable custom domain to `brain-compose.yml` as well.

```bash
# from repo root (same env vars as Vercel)
npm run brain:deploy
# skip on Vercel until Telos Hosted is configured:
# BRAIN_DEPLOY=0
```

Hosted first deploy prints a **new** execution key in the build log — do not reuse the local key. Paste it into that environment’s `BRAIN_API_KEY` and redeploy.

## Building the schema

The starter includes the Telos Brain skill book and learning/maintenance workflows. Two ways to turn that into *your* brain (do this before a hosted deploy). Category quality determines learning quality.

1. **Auto-build from an existing application** — load skill **BRA211** (`skills/telos-brain/brain-schema/BRA211-auto-building-a-brain.md`). Fully contained. Do not copy that process into this README.
2. **Guided interview** — load skill **BRA104** (`skills/telos-brain/concepts/BRA104-getting-started.md`). **Requires human input** — an AI agent must not skip or auto-answer.

Use BRA211 when the host application already exists. Use BRA104 for a greenfield brain.

## Train the brain

After the schema exists, upload documents, transcripts, or emails via the Brain admin UI or API inbox. `brain-compose.yml` defaults to `learning-mode: high`. Start at `high`, review daily checkpoints for the first 5 days, then set `low` when quality is acceptable.

## Execute API smoke test

Local:

```bash
curl -X POST http://127.0.0.1:60061/workflows/WF-CHAT/run/sync \
  -H "Authorization: Bearer YOUR_BRAIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputMessage": "Hello world"}'
```

Hosted: same path on `https://go.telosbrain.com`. Run skills **BRA401** onwards for the Execution API.

## Host app tool handshake

Finance tools call the Next.js app at `POST /api/tools/{toolId}` using the `my-app` connector.

- `MY_APP_API_URL` — host the Brain can reach (local Docker: `http://host.docker.internal:3000`; stage/prod: `https://your-app.example.com`)
- `MY_APP_API_KEY` — **must equal** the app’s `TOOL_API_KEY`
- `BRAIN_API_KEY` — the same per-brain execution key the app stores as `BRAIN_API_KEY`

Both `Authorization: Bearer <TOOL_API_KEY>` and `X-Brain-Authorization: Bearer <BRAIN_API_KEY>` are required. After changing finance tools or `WF-CHAT`, redeploy. If hosted Chat works but tools return `401 Protected deployment`, turn off Vercel Authentication — see [docs/hosted-deploy.md](../docs/hosted-deploy.md) **Deployment Protection**. These tools do not send `x-vercel-protection-bypass`.

## Repository hygiene

Gitignore (do not commit):

- `.env`, `.env.local`, `.env.stage`, `.env.prod`
- `.brain/` (Compose state, encryption key)
- `brain.lock` if it contains API keys
- `brain-compose.deploy.yml` (ephemeral Vercel compose with extra callback hosts)
- `node_modules/`, `dist/`

Commit `.env.example` with placeholder values only.

## Support

Copyright Telos IP Limited 2026
www.telosbrain.com
support@telosbrain.com
