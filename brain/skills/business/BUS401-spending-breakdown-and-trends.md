---
name: Spending Breakdown and Trends
code: BUS401
version: 1
description: >-
  Turn transaction totals into spending-mix, month-on-month shift, and
  recurring-bill findings for insight cards and finance reviews.
tools:
  - get_spend_summary
  - list_transactions
  - list_budgets
---

# Spending Breakdown and Trends

Use this skill when writing a `spending_trends` insight, or when a finance
review needs to explain where money went and how that mix is changing.

## Process

1. Call `get_spend_summary` for the current calendar month, then again for the
   previous calendar month (pass `fromDate` and `toDate` as `YYYY-MM-DD`).
2. Call `list_transactions` for the current month (and the previous month if
   the summary is thin). Use merchants and descriptions — do not invent rows.
3. Look for findings in this order:
   - **Top categories** — which categories take the largest share of spend
     this month (ignore Transfers; treat Income separately).
   - **Monthly shifts** — categories whose spend rose or fell sharply versus
     last month.
   - **Recurring bills** — same merchant, similar amount, repeating at least
     twice in the window (subscriptions, utilities, insurance).

## When to write a card

Write a `spending_trends` card only when at least one finding is grounded in
the tool results (for example a category is a clear majority of spend, a
category moved by a large amount versus last month, or a repeating merchant
is visible). If the data is too thin, skip the card.

## Card shape

- Title: a short label such as "Spending breakdown and trends".
- Tips: 3 to 5 sentences in British English. Each tip must name a category,
  merchant, or amount that the tools returned.
- Call `create_insight` on the daily heartbeat, or `upsert_insight` when
  filling a queued card.

## Rules

- Never invent transaction amounts, merchants, or dates.
- Negative amounts are spend; positive amounts are income.
- Prefer British English spelling.
