/**
 * Client for the Telos Brain Execution API.
 *
 * The Execution API is the runtime surface of a deployed Telos Brain. It is
 * addressed by the brain service host (`BRAIN_URL` or `TELOS_BRAIN_API_URL`)
 * and authenticated with the per-brain execution API key (`BRAIN_API_KEY`)
 * presented as a bearer token.
 * The key resolves to a single active brain, which becomes the implicit tenant
 * scope for the request — no brain id is ever sent in the body or route.
 *
 * JSON calls use axios. The sync workflow path uses `fetch` so Next.js does
 * not buffer Brain SSE through the axios adapter.
 */
import axios, { type AxiosInstance, isAxiosError } from "axios";
import type { Readable } from "node:stream";
import {
  paramsFromUnknown,
  type BrainActivityEvent,
} from "@/lib/chat-trace";

export type { BrainActivityEvent };

/** Shared request body accepted by both run endpoints. All fields optional. */
export interface RunWorkflowOptions {
  /** The triggering user message. */
  inputMessage?: string;
  /** Optional runtime entity scope (GUID). */
  entityId?: string;
  /** Optional runtime unit-of-work scope (GUID). */
  unitOfWorkId?: string;
  /** Optional run variables exposed to templates as `{{input.<key>}}`. */
  variables?: Record<string, string>;
  /** Honoured on the async path only. */
  callbackUrl?: string;
  /**
   * Called for each Brain `text` delta on the sync path. Not sent to the API.
   */
  onDelta?: (delta: string) => void | Promise<void>;
  /**
   * Called for thinking, tool, status, and text events. Not sent to the API.
   */
  onEvent?: (event: BrainActivityEvent) => void | Promise<void>;
}

export interface BrainConfig {
  baseUrl: string;
  apiKey: string;
}

interface BrainErrorBody {
  error?: string;
}

/**
 * Returns true when both Brain Execution API env vars are set.
 * Used for fail-soft behaviour (e.g. local dev without a deployed brain).
 */
function getBrainBaseUrl(): string | undefined {
  const url = process.env.BRAIN_URL || process.env.TELOS_BRAIN_API_URL;
  return url?.trim() || undefined;
}

export function isBrainConfigured(): boolean {
  return Boolean(getBrainBaseUrl() && process.env.BRAIN_API_KEY);
}

/**
 * Reads and validates the brain execution API configuration from the
 * environment. Throws when either variable is missing.
 */
export function getBrainConfig(): BrainConfig {
  const baseUrl = getBrainBaseUrl();
  const apiKey = process.env.BRAIN_API_KEY;

  if (!baseUrl) {
    throw new Error(
      "BRAIN_URL is not configured. Set BRAIN_URL or add the Telos Brain Vercel integration (writes TELOS_BRAIN_API_URL)."
    );
  }
  if (!apiKey) {
    throw new Error(
      "BRAIN_API_KEY is not configured. Set it to the per-brain execution API key."
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/**
 * Extracts a human-readable detail from an axios (or other) failure.
 * Prefer `{ error }` from the Brain JSON body when present.
 */
async function getBrainErrorDetail(
  error: unknown,
  fallback: string
): Promise<string> {
  if (!isAxiosError<BrainErrorBody | Readable>(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  const data = error.response?.data;

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.length > 0
  ) {
    return data.error;
  }

  // Streamed error bodies (e.g. failed sync run with responseType: "stream").
  if (data && typeof (data as Readable).on === "function") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of data as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text) {
        try {
          const parsed = JSON.parse(text) as BrainErrorBody;
          if (parsed.error) return parsed.error;
        } catch {
          return text;
        }
      }
    } catch {
      // Fall through to status / message.
    }
  }

  if (error.response) {
    return `${error.response.status} ${error.response.statusText}`;
  }

  if (error.code === "ECONNABORTED") {
    return "Request timed out";
  }

  return error.message || fallback;
}

/** Creates an axios instance scoped to the configured Brain Execution API. */
function createBrainAxios(): AxiosInstance {
  const { baseUrl, apiKey } = getBrainConfig();

  return axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    // Brain agent runs can be long; individual calls override when needed.
    timeout: 60_000,
    validateStatus: status => status >= 200 && status < 300,
  });
}

/** A single entity variable key/value pair. */
export interface BrainEntityVariable {
  key: string;
  value: string;
}

/** Request body for `POST /entities`. */
export interface CreateBrainEntityOptions {
  /** Deploy code of the entity type; must match a type in the brain schema. */
  entityTypeCode: string;
  name: string;
  description?: string;
  /** Key/value pairs bound to the entity's declared variable keys. */
  variables?: BrainEntityVariable[];
}

/** The entity object returned by the Execution API (subset we rely on). */
export interface BrainEntity {
  id: string;
  entityTypeId?: string;
  name?: string;
  description?: string;
  variables?: BrainEntityVariable[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Creates an entity on the deployed brain via `POST {BRAIN_URL}/entities`
 * and returns the created entity, including its generated `id`.
 */
export async function createBrainEntity(
  options: CreateBrainEntityOptions
): Promise<BrainEntity> {
  const client = createBrainAxios();

  try {
    const { data: entity } = await client.post<BrainEntity>(
      "/entities",
      options
    );

    if (!entity?.id) {
      throw new Error("Brain entity creation returned no entity id.");
    }

    return entity;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Brain entity creation returned no entity id."
    ) {
      throw error;
    }
    const detail = await getBrainErrorDetail(error, "Unknown error");
    throw new Error(`Brain entity creation failed: ${detail}`);
  }
}

/** Request body for `POST /units-of-work`. */
export interface CreateBrainUnitOfWorkOptions {
  entityId: string;
  unitOfWorkTypeCode: string;
  title: string;
  variables?: BrainEntityVariable[];
}

/** The unit-of-work object returned by the Execution API (subset we rely on). */
export interface BrainUnitOfWork {
  id: string;
  entityId?: string;
  title?: string;
  status?: string;
  variables?: BrainEntityVariable[];
}

/**
 * Creates a unit of work on the deployed brain via `POST {BRAIN_URL}/units-of-work`.
 */
export async function createBrainUnitOfWork(
  options: CreateBrainUnitOfWorkOptions
): Promise<BrainUnitOfWork> {
  const client = createBrainAxios();

  try {
    const { data: unitOfWork } = await client.post<BrainUnitOfWork>(
      "/units-of-work",
      options
    );

    if (!unitOfWork?.id) {
      throw new Error("Brain unit of work creation returned no id.");
    }

    return unitOfWork;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Brain unit of work creation returned no id."
    ) {
      throw error;
    }
    const detail = await getBrainErrorDetail(error, "Unknown error");
    throw new Error(`Brain unit of work creation failed: ${detail}`);
  }
}

/** One decoded Server-Sent Event from the sync run stream. */
interface BrainStreamEvent {
  type: string;
  delta?: string | { type?: string; text?: string };
  text?: string;
  message?: string;
  phase?: string;
  name?: string;
  id?: string;
  ok?: boolean;
  input?: unknown;
  params?: unknown;
  arguments?: unknown;
  label?: string;
  summary?: string;
  result?: unknown;
  output?: unknown;
  data?: unknown;
}

function extractLooseDelta(event: BrainStreamEvent): string | null {
  if (typeof event.delta === "string" && event.delta.length > 0) {
    return event.delta;
  }

  if (
    event.delta &&
    typeof event.delta === "object" &&
    typeof event.delta.text === "string" &&
    event.delta.text.length > 0
  ) {
    return event.delta.text;
  }

  if (typeof event.text === "string" && event.text.length > 0) {
    return event.text;
  }

  return null;
}

function extractTextDelta(event: BrainStreamEvent): string | null {
  if (event.type !== "text") {
    return null;
  }
  return extractLooseDelta(event);
}

function extractThinkingDelta(event: BrainStreamEvent): string | null {
  if (event.type !== "thinking" && event.type !== "thinking_delta") {
    return null;
  }
  return extractLooseDelta(event);
}

function toActivityEvent(event: BrainStreamEvent): BrainActivityEvent | null {
  if (event.type === "status" && event.phase) {
    return { type: "status", phase: event.phase };
  }

  const thinking = extractThinkingDelta(event);
  if (thinking) {
    return { type: "thinking", delta: thinking };
  }

  if (event.type === "tool_call" && event.name) {
    return {
      type: "tool_call",
      id: event.id ?? `tool-${event.name}`,
      name: event.name,
      params:
        paramsFromUnknown(event.params) ??
        paramsFromUnknown(event.input) ??
        paramsFromUnknown(event.arguments),
    };
  }

  if (event.type === "tool_result" && event.name) {
    const label =
      event.label ??
      event.summary ??
      (typeof event.message === "string" ? event.message : undefined);
    return {
      type: "tool_result",
      id: event.id ?? `tool-${event.name}`,
      name: event.name,
      ok: event.ok !== false,
      label,
      result:
        paramsFromUnknown(event.result) ??
        paramsFromUnknown(event.output) ??
        paramsFromUnknown(event.data),
    };
  }

  const text = extractTextDelta(event);
  if (text) {
    return { type: "text", delta: text };
  }

  return null;
}

async function consumeBrainSseWebStream(
  stream: ReadableStream<Uint8Array>,
  onDelta?: (delta: string) => void | Promise<void>,
  onEvent?: (event: BrainActivityEvent) => void | Promise<void>
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let streamError: string | null = null;
  let done = false;

  const consumeLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;

    const payload = trimmed.slice("data:".length).trim();
    if (!payload) return;

    let event: BrainStreamEvent;
    try {
      event = JSON.parse(payload) as BrainStreamEvent;
    } catch {
      return;
    }

    if (event.type === "error") {
      streamError = event.message ?? "Unknown brain workflow error.";
      return;
    }

    if (event.type === "done") {
      done = true;
      return;
    }

    const activity = toActivityEvent(event);
    if (!activity) return;

    if (activity.type === "text") {
      text += activity.delta;
      await onDelta?.(activity.delta);
    }

    await onEvent?.(activity);
  };

  try {
    while (!done) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        await consumeLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (done) break;
      }
    }

    if (buffer) {
      await consumeLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (streamError) {
    throw new Error(`Brain workflow error: ${streamError}`);
  }

  if (!done && !text) {
    throw new Error("Brain workflow ended without a reply.");
  }

  return text;
}

/**
 * Runs a workflow synchronously against the deployed brain and returns the
 * full accumulated text once the stream completes.
 *
 * `POST {BRAIN_URL}/workflows/{code}/run/sync` streams the result as SSE.
 */
export async function runWorkflowSync(
  workflowCode: string,
  options: RunWorkflowOptions = {}
): Promise<string> {
  const { onDelta, onEvent, ...body } = options;
  const { baseUrl, apiKey } = getBrainConfig();

  try {
    const response = await fetch(
      `${baseUrl}/workflows/${encodeURIComponent(workflowCode)}/run/sync`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const raw = (await response.text()).trim();
      let detail = `${response.status} ${response.statusText}`;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as BrainErrorBody;
          if (parsed.error) {
            detail = parsed.error;
          }
        } catch {
          detail = raw;
        }
      }
      throw new Error(`Brain workflow run failed: ${detail}`);
    }

    if (!response.body) {
      throw new Error("Brain workflow run returned an empty stream.");
    }

    return await consumeBrainSseWebStream(response.body, onDelta, onEvent);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Brain workflow error:") ||
        error.message.startsWith("Brain workflow run failed:") ||
        error.message === "Brain workflow run returned an empty stream.")
    ) {
      throw error;
    }
    const detail = await getBrainErrorDetail(error, "Unknown error");
    throw new Error(`Brain workflow run failed: ${detail}`);
  }
}

/** Result of queuing an async workflow run. */
export interface AsyncRunResult {
  runId: string;
  status: string;
}

/**
 * Queues a workflow run on the deployed brain via
 * `POST {BRAIN_URL}/workflows/{code}/run/async` and returns immediately.
 */
export async function runWorkflowAsync(
  workflowCode: string,
  options: RunWorkflowOptions = {}
): Promise<AsyncRunResult> {
  const { onDelta, onEvent, ...body } = options;
  void onDelta;
  void onEvent;
  const client = createBrainAxios();

  try {
    const { data } = await client.post<Partial<AsyncRunResult>>(
      `/workflows/${encodeURIComponent(workflowCode)}/run/async`,
      body
    );

    if (!data?.runId) {
      throw new Error("Brain workflow queue returned no run id.");
    }

    return { runId: data.runId, status: data.status ?? "queued" };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Brain workflow queue returned no run id."
    ) {
      throw error;
    }
    const detail = await getBrainErrorDetail(error, "Unknown error");
    throw new Error(`Brain workflow queue failed: ${detail}`);
  }
}
