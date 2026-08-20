---
name: Budget and Goal Alerts
code: BUS402
version: 1
description: >-
  Flag budget pacing, rolling income versus expense, and savings rate from
  host-app budgets and transactions.
tools:
  - list_budgets
  - get_spend_summary
  - list_transactions
---

# Budget and Goal Alerts

Use this skill when writing a `budget_alerts` insight, or when a finance
review needs to say whether spending is on track.

## Process

1. Call `list_budgets` and `get_spend_summary` for the current period.
2. Call `list_transactions` for the last 30 days (`fromDate` / `toDate` as
   `YYYY-MM-DD`) so income, spend, and Savings can be totalled.
3. Look for findings in this order:
   - **Pacing** — any budget at or above 80% used before the period ends.
   - **Income versus expense** — rolling 30-day income (positive amounts in
     Income, or all positive amounts if Income is unused) versus spend
     (negative amounts, excluding Transfers).
   - **Savings rate** — Savings category inflows divided by income over the
     same 30 days. If there is no Savings category, say so; do not invent a
     rate.

## When to write a card

Write a `budget_alerts` card only when a budget is at risk, expenses exceed
income, the savings rate is measurable, or a budget exists and is clearly
on track. If there are no budgets and no income rows, skip the card.

## Card shape

- Title: a short label such as "Budget and goal alerts".
- Tips: 3 to 5 sentences in British English, each tied to a returned budget
  name, percent used, or 30-day total.
- Call `create_insight` on the daily heartbeat, or `upsert_insight` when
  filling a queued card.

## Rules

- Never invent budget amounts or percentages.
- Prefer British English spelling.
- Do not treat Transfers as spend or income.
