export interface ChatTraceThought {
  id: string;
  kind: "thought";
  label: string;
}

export interface ChatTraceTool {
  id: string;
  kind: "tool";
  tool: string;
  label: string;
  params?: string;
  result?: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  startedAt?: number;
}

export type ChatTraceStep = ChatTraceThought | ChatTraceTool;

export interface ChatTrace {
  elapsedMs: number;
  steps: ChatTraceStep[];
}

export type BrainActivityEvent =
  | { type: "status"; phase: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_call"; id: string; name: string; params?: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      label?: string;
      result?: string;
    }
  | { type: "text"; delta: string };

export interface ChatTraceState {
  steps: ChatTraceStep[];
  startedAt: number | null;
  currentThoughtId: string | null;
}

const TRACE_PREFIX = "<!--telos-chat-trace:";
const TRACE_SUFFIX = "-->";

const TOOL_RUNNING_LABELS: Record<string, string> = {
  listTransactions: "Reading transactions",
  list_transactions: "Reading transactions",
  getSpendSummary: "Summarising spend",
  get_spend_summary: "Summarising spend",
  listBudgets: "Reading budgets",
  list_budgets: "Reading budgets",
  recordTransactions: "Recording transactions",
  record_transactions: "Recording transactions",
  upsertBudget: "Updating budget",
  upsert_budget: "Updating budget",
  upsertInsight: "Saving insight",
  upsert_insight: "Saving insight",
  createInsight: "Saving insight",
  create_insight: "Saving insight",
  updateTransaction: "Updating transaction",
  update_transaction: "Updating transaction",
  search_blueprint_entries: "Searching memory",
  get_blueprint_entry: "Reading memory",
  find_available_skills: "Finding skills",
  get_skill: "Reading a skill",
  web_search: "Searching the web",
  web_fetch: "Reading a page",
};

export function emptyTraceState(): ChatTraceState {
  return { steps: [], startedAt: null, currentThoughtId: null };
}

export function emptyTrace(): ChatTrace {
  return { elapsedMs: 0, steps: [] };
}

function runningLabel(name: string): string {
  return TOOL_RUNNING_LABELS[name] ?? `Running ${name}`;
}

function stringifyParams(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

export function formatTraceDuration(ms: number): string {
  return `${(Math.max(ms, 0) / 1000).toFixed(1)}s`;
}

export function formatTraceSummary(trace: ChatTrace, live: boolean): string {
  if (live) {
    return "Thinking";
  }
  const elapsed = formatTraceDuration(trace.elapsedMs);
  const tools = trace.steps.filter(step => step.kind === "tool").length;
  if (tools === 0) {
    return `Thought for ${elapsed}`;
  }
  return `Thought for ${elapsed} · used ${tools} ${tools === 1 ? "tool" : "tools"}`;
}

export function statusPhaseLabel(phase: string): string {
  switch (phase) {
    case "model":
      return "Thinking";
    case "tool":
    case "tools":
      return "Reading your organisation's data";
    case "respond":
    case "text":
      return "Writing the answer";
    default:
      return "Sending to Telos Brain";
  }
}

export function applyTraceEvent(
  state: ChatTraceState,
  event: BrainActivityEvent,
  now = Date.now()
): ChatTraceState {
  const startedAt = state.startedAt ?? now;
  const steps = state.steps.map(step =>
    step.kind === "tool" ? { ...step } : { ...step }
  );

  if (event.type === "thinking") {
    if (state.currentThoughtId) {
      const current = steps.find(
        step => step.kind === "thought" && step.id === state.currentThoughtId
      );
      if (current && current.kind === "thought") {
        current.label = `${current.label}${event.delta}`;
        return { steps, startedAt, currentThoughtId: state.currentThoughtId };
      }
    }
    const id = `thought-${steps.length + 1}`;
    steps.push({ id, kind: "thought", label: event.delta });
    return { steps, startedAt, currentThoughtId: id };
  }

  if (event.type === "tool_call") {
    steps.push({
      id: event.id,
      kind: "tool",
      tool: event.name,
      label: runningLabel(event.name),
      params: event.params,
      status: "running",
      startedAt: now,
    });
    return { steps, startedAt, currentThoughtId: null };
  }

  if (event.type === "tool_result") {
    const tool = steps.find(
      step => step.kind === "tool" && step.id === event.id
    );
    if (tool && tool.kind === "tool") {
      tool.status = event.ok ? "done" : "error";
      tool.label = event.label ?? (event.ok ? "Completed" : "Failed");
      if (event.result) {
        tool.result = event.result;
      }
      if (tool.startedAt) {
        tool.durationMs = Math.max(now - tool.startedAt, 0);
      }
    }
    return { steps, startedAt, currentThoughtId: null };
  }

  return { steps, startedAt, currentThoughtId: state.currentThoughtId };
}

const TRACE_JSON_FIELD_MAX = 8000;

function capTraceJson(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= TRACE_JSON_FIELD_MAX) return value;
  return `${value.slice(0, TRACE_JSON_FIELD_MAX)}\n…truncated`;
}

function persistToolStep(step: ChatTraceTool, now: number): ChatTraceTool {
  const durationMs =
    step.durationMs ??
    (step.startedAt ? Math.max(now - step.startedAt, 0) : undefined);
  return {
    id: step.id,
    kind: "tool",
    tool: step.tool,
    label: step.label,
    params: capTraceJson(step.params),
    result: capTraceJson(step.result),
    status: step.status === "running" ? "done" : step.status,
    durationMs,
  };
}

export function finalizeTrace(
  state: ChatTraceState,
  now = Date.now()
): ChatTrace {
  const elapsedMs = state.startedAt ? Math.max(now - state.startedAt, 0) : 0;
  return {
    elapsedMs,
    steps: state.steps.map(step =>
      step.kind === "tool" ? persistToolStep(step, now) : step
    ),
  };
}

export function encodeAssistantContent(text: string, trace?: ChatTrace): string {
  if (!trace || trace.steps.length === 0) {
    return text;
  }
  return `${TRACE_PREFIX}${JSON.stringify(trace)}${TRACE_SUFFIX}\n\n${text}`;
}

export function decodeAssistantContent(content: string): {
  text: string;
  trace?: ChatTrace;
} {
  if (!content.startsWith(TRACE_PREFIX)) {
    return { text: content };
  }
  const end = content.indexOf(TRACE_SUFFIX);
  if (end === -1) {
    return { text: content };
  }
  try {
    const parsed = JSON.parse(
      content.slice(TRACE_PREFIX.length, end)
    ) as ChatTrace;
    const text = content.slice(end + TRACE_SUFFIX.length).replace(/^\n+/, "");
    if (!parsed || !Array.isArray(parsed.steps)) {
      return { text: content };
    }
    return { text, trace: parsed };
  } catch {
    return { text: content };
  }
}

export function paramsFromUnknown(value: unknown): string | undefined {
  return stringifyParams(value);
}

export function formatJsonBlock(value: string | undefined): string {
  if (!value || !value.trim()) return "{}";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

const RECORD_TOOLS = new Set(["record_transactions", "recordTransactions"]);

/** When thinking ate the reply but a write tool already succeeded. */
export function fallbackReplyForEmptyTrace(trace: ChatTrace): string | null {
  const recorded = trace.steps.some(
    step =>
      step.kind === "tool" &&
      RECORD_TOOLS.has(step.tool) &&
      step.status === "done"
  );
  if (recorded) {
    return "Recorded the transactions, but the reply was cut off before a summary.";
  }
  return null;
}
