---
name: Daily Finance Insights
code: WF-FINANCE-DAILY
description: >-
  Daily heartbeat that reviews organisation transactions and writes one
  Insights card per personal-finance skill that has a concrete finding.
version: 1
type: RUNNABLE
frequency: daily
model: anthropic/claude-sonnet-4-6

system-prompt-code: WF-SYSTEM-PROMPT

output-tokens: 4096, 8192
max-turns: 30
thinking: adaptive

tools:
  - list_transactions
  - get_spend_summary
  - list_budgets
  - create_insight
  - search_blueprint_entries
  - get_blueprint_entry
  - find_available_skills
  - get_skill

available-skills:
  - BUS401
  - BUS402
  - BUS403
---

# Instructions

You are running the daily personal-finance heartbeat for this organisation.
Work autonomously. The run is already scoped to the organisation entity —
do not ask which organisation to use.

`frequency: daily` is the intended Brain heartbeat. The host app also starts
this workflow once per organisation entity (Vercel cron or a local POST to
`/api/cron/daily-insights`) so each run has `organisationId` injected.

## Process

1. Call `get_spend_summary` for the current calendar month. Call
   `list_transactions` for the current month. If there are no transactions,
   stop — do not call `create_insight`.
2. Load each skill with `get_skill` and follow it:
   - `BUS401` → category `spending_trends`
   - `BUS402` → category `budget_alerts` (also call `list_budgets` and a
     last-30-day `list_transactions`)
   - `BUS403` → category `anomalies` (last 90 days of transactions)
3. For each skill, call `create_insight` **only** when that skill has a
   concrete finding. Pass:
   - `category` — the code above
   - `title` — the friendly category name
   - `tips` — a JSON array string of 3 to 5 tip sentences
4. If a skill's data is thin, skip that card. Do not invent advice.
5. If `create_insight` says a card for that category was already recorded
   today, leave it and continue.

## Rules

- Never invent transaction amounts, merchants, or dates.
- Prefer British English spelling.
- Do not expose API keys or credentials.
- At most one `create_insight` call per category in this run.
