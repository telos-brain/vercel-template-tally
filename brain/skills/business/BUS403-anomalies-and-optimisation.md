---
name: Anomalies and Optimisation
code: BUS403
version: 1
description: >-
  Spot price hikes, duplicate or unusual charges, and merchant concentration
  in recent transactions.
tools:
  - list_transactions
  - get_spend_summary
---

# Anomalies and Optimisation

Use this skill when writing an `anomalies` insight, or when a finance review
should call out leaks and one-off spikes.

## Process

1. Call `list_transactions` for the last 90 days (or the full available
   window if shorter). Call `get_spend_summary` for the current month to
   see category mix.
2. Group spend rows by merchant (fall back to description when merchant is
   empty).
3. Look for findings in this order:
   - **Price hikes** — the same merchant's typical amount has stepped up
     (utilities, insurance, subscriptions).
   - **Unusual charges** — duplicate amounts on the same day, sudden dining
     spikes versus the rest of the window, or fee-like descriptions
     (e.g. "fee", "surcharge").
   - **Merchant concentration** — one merchant or app taking a large share
     of a category (delivery, one supermarket, one fuel brand).

## When to write a card

Write an `anomalies` card only when at least one of those patterns is
visible in the returned rows. If merchants are missing and amounts look
ordinary, skip the card rather than guessing.

## Card shape

- Title: a short label such as "Anomalies and optimisation".
- Tips: 3 to 5 sentences in British English. Name the merchant, date, or
  amount the tools returned.
- Call `create_insight` on the daily heartbeat, or `upsert_insight` when
  filling a queued card.

## Rules

- Never invent merchants, dates, or amounts.
- Prefer British English spelling.
- One unusual coffee is not a finding — look for repeats, jumps, or
  concentration.
