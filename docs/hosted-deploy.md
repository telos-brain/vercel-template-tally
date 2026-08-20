# First-time hosted deploy

This is the Preview / Production path for TALLY: a personal GitHub repo, Clerk + hosted Supabase, a Vercel project, and a Brain instance on [Telos Hosted](https://go.telosbrain.com). Local Docker Brain (`brain start`) is **dev only**. Do not copy `BRAIN_API_KEY` from `brain.lock` or `brain/.env.local` into Vercel.

If the Cursor browser hangs on Clerk **Continue**, GitHub OAuth **Authorize**, or similar, finish the step in a regular browser, then return.

## Prerequisites

Accounts and keys you will need:

- GitHub (to host your copy of this template)
- [Telos Hosted](https://go.telosbrain.com) (organisation API key, `$10` welcome credit)
- [Clerk](https://dashboard.clerk.com) (required on Vercel / production)
- [Supabase](https://supabase.com/dashboard) (hosted project, not local `supabase start`)
- [Vercel](https://vercel.com)
- Anthropic and Voyage API keys (this brain defaults to `voyage-3-lite`)

A random shared tool secret (`TOOL_API_KEY` / `MY_APP_API_KEY`) — generate a new one for hosted; do not reuse a value you are not sure about.

## 1. Put the template on your GitHub

Source of truth (always this repo, not someone else’s copy):

```bash
git clone https://github.com/telos-brain/vercel-template-tally.git
cd vercel-template-tally
```

Then create **your** GitHub repo (`<your-github-user>/<your-repo>`) and push `main` there, **or** use GitHub **Import** with the same source URL (`https://github.com/telos-brain/vercel-template-tally.git`).

GitHub **Import** (`https://github.com/<your-github-user>/<your-repo>/import`) shows **Importing commits and revision history…** until it finishes. When it is done, the repo has `main` as the default branch (and any other branches that existed on the source).

Use **`main`** for the first Vercel production deploy. Vercel **Import** should point at `<your-github-user>/<your-repo>`, not at the template org unless you are deploying from a fork you control.

## 2. Sign up at Telos Hosted and mint an org API key

### Sign in / sign up

- Sign in: [https://go.telosbrain.com/login](https://go.telosbrain.com/login) — heading **Sign in to Telos Brain** (Clerk email/password).
- Sign up: [https://go.telosbrain.com/sign-up](https://go.telosbrain.com/sign-up) — heading **Create your account** (first/last optional, email, password).
- An email that has not signed up yet is not found on Sign in. Create the account first.
- If Clerk **Continue** spins forever in the Cursor browser, complete signup in a regular browser, then sign in.

After login you land on **Brains**: [https://go.telosbrain.com/brains](https://go.telosbrain.com/brains).

### Brains (empty organisation)

Header: your organisation **Name** · **Brains** · **`$10.00`** (Token Counter) · user avatar.

Page:

- Heading **Brains**
- Subtitle **Deployed brain instances for your organisation**
- Empty card **Deploy your first brain**
  1. **Create an API key** (the words **API key** link to organisation settings)
  2. **Use the Telos Brain CLI** with:

```bash
npm install -g @telos.ready/brain
brain init  # clones starter-brain into ./brain
cd brain
cp .env.example .env # fill in API keys
brain deploy --instance my-brain
```

For **this template**, skip `brain init`. The schema already lives in `brain/`. Vercel runs `npm run brain:deploy` on build. The empty-state CLI snippet is for a greenfield Brain, not TALLY.

The **`$10.00`** header amount is the organisation welcome credit (see Billing below).

### Create the organisation API key

Click **API key**. URL: [https://go.telosbrain.com/organisation-settings/api-keys](https://go.telosbrain.com/organisation-settings/api-keys).

Breadcrumb: **\<org\> → Organisation Settings → API Keys**.

Settings sidebar: **Organisation**, **Users**, **API Keys**, **Billing**, **Inbox**, **Integrations**.

Page:

- Heading **API Keys**
- Subtitle **Organisation-scoped keys for CLI and CI/CD access**
- Empty copy: **No API keys yet. Create one to authenticate the CLI or CI/CD pipelines.**
- Button **+ Create API key**

**Create API key** modal:

- **Name** (placeholder `e.g. CI pipeline`) — required. Example: `Vercel tally`.
- **Expiry date** (`dd/mm/yyyy`) — **required** (validation: **An expiry date is required**). Minimum is today.
- **Cancel** / **Create key** (button shows **Creating…** while the request runs).

When minting succeeds, dialog **API key created**:

> Copy **\<name\>** now. For security it is only shown once and cannot be recovered after you close this dialog.

The full key is shown (`tbk_…`) with **Copy**. Yellow warning:

> If you lose this key you cannot retrieve it — you will need to delete it and create a new one.

Click **I have copied this key**. The table then lists **NAME**, truncated `tbk_…`, **Active**, expiry, created date. Set this value as Vercel `TELOS_BRAIN_ORG_API_KEY` (Preview and Production can share the same **org** key; they must **not** share `BRAIN_API_KEY`).

### Other organisation screens (same `$10.00` header)

| Sidebar | URL | Heading | What you see on a new org |
|---|---|---|---|
| Organisation | `/organisation-settings/organisation` | Organisation | **Profile settings for your organisation.** **Name** is shown in the sidebar, breadcrumbs, and member invites. **Save**. |
| Users | `/organisation-settings/users` | Users | **Manage user accounts, roles, and access status.** **Invite User**. You appear as **Admin** / **Active**. |
| Billing | `/organisation-settings/billing` | Billing | **Statement of credits, charges, and running balance for your organisation.** Month selector. Opening balance `$0.00`. Row **Welcome credit** **Credit** **+$10.00** running **`$10.00`**. |
| Inbox | `/organisation-settings/inbox` | Inbox | Email-to-brain off by default; Granola **Not connected**. Not required for first Chat. |
| Integrations | `/organisation-settings/integrations` | Integrations | Hosted MCP at `https://mcp.telosbrain.com`. Optional. Org keys authenticate as `Bearer tbk_…` or `X-Telos-Api-Key`. |

## 3. Clerk (production app)

Clerk is optional locally (placeholder keys seed `local@localhost`). It is **required** on Vercel.

Sign-in screen ([dashboard.clerk.com](https://dashboard.clerk.com)): heading **Sign in to Clerk**, **Welcome back! Please sign in to continue**. **GitHub**, **Google**, or email/password. **Sign up** if you have no account.

Create a **new** app (do not reuse a leftover app with **No Production Environment**).

**Create application** (`/apps/new`):

- **B2B**
- Application name (for example **TALLY**)
- Email + Google
- **Enable Organizations (multi-tenancy)** on

After create you land on the Development instance. **Configure → API keys**:

- Heading **API keys**
- **Publishable key** (`pk_test_…`) → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- **Secret keys** default (`sk_test_…`) → `CLERK_SECRET_KEY`

**Go to prod** exists, but this first walk stays on Development. On Clerk’s Supabase setup page the **Production** radio is disabled until you have a production instance (`no-production`).

Then:

1. Open [Clerk’s Connect with Supabase](https://dashboard.clerk.com/setup/supabase) — heading **Connect Clerk with Supabase**.
2. Select your app’s **Development** instance.
3. **Activate Supabase integration** → **Status: Enabled**.
4. Copy the Clerk domain (`https://<your-app>.clerk.accounts.dev`).

You will also add that domain as a third-party provider on hosted Supabase (**Authentication → Sign In / Providers → Third-Party Auth**).

## 4. Hosted Supabase

Sign-in ([supabase.com/dashboard](https://supabase.com/dashboard)): heading **Welcome back** / **Sign in to your account**. **Continue with GitHub**, **Continue with ChatGPT**, **Continue with SSO**, or email/password. **Sign up** if you have no account.

Pick (or create) a Supabase organisation. Ignore paused leftover projects.

**Create a new project**:

- Name (for example **TALLY**)
- Database password: **Generate a password** (required; it is **not viewable after creation**)
- Region: choose one close to you (this walk used **Oceania (Sydney)** `ap-southeast-2`)

Project overview shows **STATUS Healthy**, compute **NANO**, **Primary Database** Oceania (Sydney). Project URL is `https://<ref>.supabase.co`.

From **Project Settings → API Keys** (heading **API Keys**; **Publishable and secret API keys**, not legacy `anon` / `service_role`):

| Variable | What to copy |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Secret (`sb_secret_…`, server only). **Reveal API key** may stay masked in the Cursor browser; **New secret key** (name: lowercase letters, digits, underscore) shows the value once. |
| `POSTGRES_URL` | From overview **Connect** → **Direct** / **Connection string** → **Transaction pooler** (serverless). URI looks like `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres`. Substitute the password from create. Add `sslmode=require`. |

**Authentication → Sign In / Providers → Third-Party Auth**: **Add provider** → **Clerk**. Modal **Add new Clerk connection**, field **Clerk Domain**. **Create connection**. The row then shows the domain and **ENABLED**.

Vercel `npm run build` runs `db:migrate` then Brain deploy then `next build`. Do not use local `db:push` against hosted Postgres from this guide.

## 5. Vercel project

Sign-in ([vercel.com/login](https://vercel.com/login)): heading **Log in to Vercel**. Email, **Continue with Google**, **Continue with GitHub**, **Continue with ChatGPT**, SAML SSO, or passkey. **Sign Up** if you have no account. 2FA may need a regular browser.

A new Hobby dashboard starts empty: **Deploy your first project** / **Import Project**.

**Continue with GitHub** may first show **Install the GitHub application…**. GitHub **Installing Vercel** → install on your personal account (or **All repositories** / only the repo you just created). Success: **GitHub Installation Completed**. If **Authorize** stays disabled in the Cursor browser (GitHub may also show **Uh oh! There was an error while loading**), authorize in a regular browser.

Do **not** paste a GitHub URL into Vercel’s clone/create-repo bar (that creates a *new* repo). Click **Import** on `<your-github-user>/<your-repo>`.

**New Project** import form (`/new/import?…provider=github`):

- **Importing from GitHub** `<your-github-user>/<your-repo>` **main**
- Vercel Team: your Hobby team
- **Project Name**: your app name (this becomes `{VERCEL_PROJECT_NAME}` for Brain instance defaults)
- Application Preset: **Next.js**
- Root Directory: `./`
- **Environment Variables 15 Detected** (from `.env.example`, values empty)

Detected keys do **not** include `TELOS_BRAIN_ORG_API_KEY`, `ANTHROPIC_API_KEY`, or `VOYAGE_API_KEY`. Use **Add More** (or **Import .env**) for those. Leave `BRAIN_API_KEY` empty. Skip Postmark / `FROM_EMAIL` for first Chat. `NEXT_PUBLIC_SITE_URL` can wait until the production URL is known.

Click **Deploy**. While it runs: **Deployment started … ago…**, **Build Logs**, **Deploying schema…**. Success: **Congratulations! You just deployed a new project to …**. Preview shows Clerk **Sign in** on the TALLY welcome page.

Production aliases look like `<project>-<team>.vercel.app` (primary), plus a `*-git-main-*` alias and a per-deployment URL. Deployments list: **Ready**, **Production**, branch **main**. After the first deploy, set `NEXT_PUBLIC_SITE_URL` to that primary URL (optional extra hostname: `BRAIN_CALLBACK_DOMAIN`). Also set `MY_APP_API_URL` to that same `https://…` URL if Vercel imported `http://host.docker.internal:3000` from `.env.example` — Telos Hosted cannot call Docker.

### Deployment Protection (do this before Chat tools)

Hobby projects often enable **Vercel Authentication** (commonly **Standard Protection**). You can still open the app in the browser because you are on the Vercel team. Telos Hosted is not: Brain tool webhooks (`POST /api/tools/…`) get `401 Protected deployment` with `vercel_auth_enabled: true`. Chat can look fine while `record_transactions` fails.

This is **project-wide**. There is no exception for `/api/tools/*`. Standard Protection is *meant* to leave the production domain public, but a production `*.vercel.app` alias can still be gated — treat the HTTP response as the source of truth.

**Required check:** `POST` your production `/api/tools/recordTransactions` (or any `/api/tools/…`). If the body is `Protected deployment` / `vercel_auth_enabled`, turn **Vercel Authentication off** (**Settings → Deployment Protection**). Clerk remains the app login. Saving the setting applies to existing deployments — no redeploy required.

This template’s finance tools do **not** send `x-vercel-protection-bypass`. [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) only works if you add that header to the tool YAML and a Brain env secret. Leave Production SSO off unless you do that extra wiring.

### Environment variables

Set these on **Production** and **Preview** separately (different `POSTGRES_URL`, different Brain instance / `BRAIN_API_KEY`). Full table: [README — Stage and production](../README.md#stage-and-production-vercel--telos-hosted).

Minimum for a first Brain-enabled deploy:

| Variable | Notes |
|---|---|
| `TELOS_BRAIN_ORG_API_KEY` | Org key from step 2 (`tbk_…`). CLI only; never uploaded to the brain. |
| `BRAIN_URL` | `https://go.telosbrain.com` |
| `ANTHROPIC_API_KEY` | Required for this brain’s workflows |
| `VOYAGE_API_KEY` | Required (`voyage-3-lite`) |
| `TOOL_API_KEY` | Shared tool handshake; deploy copies it to `MY_APP_API_KEY` |
| `POSTGRES_URL` | Hosted Postgres |
| Clerk + Supabase vars | From steps 3–4 |
| `NEXT_PUBLIC_SITE_URL` | Public app URL |
| `MY_APP_API_URL` | Optional. Public `https://` app URL the Brain calls for tools. Default: Vercel production / Preview URL. Override if `.env.example` imported `host.docker.internal`. |

Leave **`BRAIN_API_KEY` empty** on the first deploy (or set `BRAIN_DEPLOY=0` if you only want the Next.js app + migrations while you debug). Do **not** paste the local Docker execution key.

Optional: `BRAIN_INSTANCE` defaults to `{VERCEL_PROJECT_NAME}-prod` or `{VERCEL_PROJECT_NAME}-preview`. Do not reuse `local-brain`.

**Required on Preview and Production:** `CRON_SECRET` authorises the daily insight heartbeat (`GET /api/cron/daily-insights`, 07:00 UTC in `vercel.json`). Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Without it the hosted job 401s and never starts Brain runs. Vercel Hobby does not execute crons — use local curl or Brain UI Run. Locally you can call the same path with `Authorization: Bearer $BRAIN_API_KEY`.

## 6. First deploy — copy the execution key

On Vercel, `npm run build` runs `db:migrate`, then `brain:deploy` (to go.telosbrain.com), then `next build`. `db:migrate` applies every file in `supabase/migrations/`, including `0001_*.sql` (chat, transactions, budgets, insights). You do not generate a migration for those tables on first deploy.

The first hosted deploy of a **new** Brain instance prints a **new** execution API key in the **Build Logs** during `brain:deploy`. Expand **Build Logs** (warning badge if present). Search for `brain:deploy`. Real lines:

- `BRAIN_API_KEY is unset or still a placeholder — first hosted deploy…`
- `brain:deploy env=prod instance=<project>-prod api=https://go.telosbrain.com`
- `› No local record for instance <project>-prod — creating it.`
- `✓ Created brain <uuid> (instance <project>-prod)`
- `Save this API key now — it is shown only once:` followed by the key on the next line (a long token; it may **not** use a `bk_…` prefix)

Paste that value into that environment’s `BRAIN_API_KEY` (**Environment Variables** → search `BRAIN_API_KEY` → **Edit** → **Save**). Preview and Production each get their own instance and key.

After a successful Brain deploy, **Brains** on go.telosbrain.com lists the instance: columns **NAME**, **STATUS**, **API KEY**, **CREATED**. Example: **Starter Brain** / `<project>-prod` / **Active**. Empty org starts with **Deploy your first brain**; it fills in after the first `brain:deploy`.

## 7. Second deploy

Redeploy so the app **and** the brain pick up `BRAIN_API_KEY` for tool callbacks (`MY_APP_API_KEY` / `TOOL_API_KEY` must already match).

## 8. Smoke-test Chat

Open the Vercel URL, sign in with Clerk, create/select an organisation if prompted, open **Chat**, send a message (workflow `WF-CHAT`). Titles generate via `WF-CHAT-TITLE`. You can paste `samples/bank-statement.txt`.

If Chat says Brain is not configured, `BRAIN_URL` or `BRAIN_API_KEY` is missing for that environment.

Chat is **app → Brain**. Tools such as `record_transactions` are **Brain → your Vercel URL**. After a first Chat message works, paste `samples/bank-statement.txt` to prove the webhook path. Two host-side blocks look similar (parsed rows, import never lands):

1. **Vercel Authentication** — `401 Protected deployment`. See **Deployment Protection** above. Your browser has a Vercel SSO cookie; the Brain does not.
2. **Callback allowlist** — `The tool 'record_transactions' webhook URL was blocked for safety: URL host is not in the allowed callback domains.` Set `MY_APP_API_URL` to the public production URL, then redeploy so `brain:deploy` merges that hostname into `allowed-callback-domains` (exact hosts only; no wildcards). Optional extra host: `BRAIN_CALLBACK_DOMAIN`.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Clerk **Continue** spinner in Cursor browser | Finish signup/sign-in in a regular browser |
| GitHub **Authorize** stuck disabled / **Uh oh!** | Same: use a regular browser |
| Email not found on Telos Sign in | Create the account on **Create your account** first |
| Empty **Brains** after Vercel deploy | Check the Vercel build log for `brain:deploy`; confirm `TELOS_BRAIN_ORG_API_KEY` |
| Skip Brain deploy while debugging | Set `BRAIN_DEPLOY=0` (app + Drizzle still deploy) |
| Auth failures on hosted Chat | You reused local Docker `BRAIN_API_KEY` — use the key from the hosted build log |
| Chat works; tools 401 `Protected deployment` | Vercel Authentication is gating the production URL. **Settings → Deployment Protection** — turn it **off**. Standard Protection is not a guaranteed fix. Not a `TOOL_API_KEY` mismatch (that JSON error is `Invalid or missing tool API key`). This template does not send `x-vercel-protection-bypass`. |
| Chat works; `webhook URL was blocked for safety` | Hostname of `MY_APP_API_URL` is missing from `allowed-callback-domains`. Point `MY_APP_API_URL` at `https://<project>-<team>.vercel.app` (not `host.docker.internal`) and redeploy so `brain:deploy` merges the host. |
| Chat 502 / `relation "chat_sessions" does not exist` | Current template `main` already ships `0001_*.sql` for chat, finance, and insights. If you still see this, the GitHub repo Vercel is building is older than that — merge https://github.com/telos-brain/vercel-template-tally.git `main` and redeploy. Do not run `db:push` on Vercel. |
| Go empty-state `brain init` | Do not run it in this repo; `brain/` already exists |

Laptop deploy with the same env vars: `npm run brain:deploy`.
