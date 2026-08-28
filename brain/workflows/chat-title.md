---
name: Chat title
code: WF-CHAT-TITLE
description: Writes a short session title from the user's first chat message.
version: 1
# Fallback when no brain default is set. Settings / DEFAULT_LLM_MODEL /
# compose llm-model wins when that credential exists (BRA210).
model: anthropic/claude-haiku-4-5
type: RUNNABLE
output-tokens: 64
caching: none
max-turns: 1
thinking: none
max-runs-per-hour: 200
---

# Instructions

The user message is the first question in a chat session. Reply with a short
title for that session.

Rules:

- 3 to 8 words
- A topic phrase, not a question
- No quotation marks, no trailing punctuation, no preamble
- Return only the title
