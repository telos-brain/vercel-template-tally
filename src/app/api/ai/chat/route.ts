import { NextRequest, NextResponse } from "next/server";
import { Role } from "@db/schema";
import { requireRole } from "@/server/api-auth";
import { isBrainConfigured, runWorkflowSync } from "@/server/brain/client";
import { publicChatErrorMessage } from "@/lib/chat";
import {
  applyTraceEvent,
  emptyTraceState,
  encodeAssistantContent,
  fallbackReplyForEmptyTrace,
  finalizeTrace,
} from "@/lib/chat-trace";
import { ensureBrainEntityForOrganisation } from "@/server/brain/entities";
import {
  appendMessage,
  applyBrainSessionTitle,
  createSession,
  getRecentSessionHistory,
  getSession,
} from "@/server/chat/sessions";

/** Deploy code of the starter-brain chat workflow (`brain/workflows/chat.md`). */
const CHAT_WORKFLOW_CODE = "WF-CHAT";
const TITLE_WORKFLOW_CODE = "WF-CHAT-TITLE";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

interface ChatRequestBody {
  message?: string;
  sessionId?: string;
}

function buildInputMessage(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  message: string
): string {
  if (history.length === 0) {
    return message;
  }

  const transcript = history
    .map(
      entry =>
        `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`
    )
    .join("\n\n");

  return `${transcript}\n\nUser: ${message}`;
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { success: false, error } satisfies ChatResponse,
    { status }
  );
}

const sseEncoder = new TextEncoder();

function encodeSse(event: ChatStreamEvent): Uint8Array {
  return sseEncoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * POST /api/ai/chat — run the Brain `WF-CHAT` workflow for the current org.
 *
 * Body: `{ "message": "<user text>", "sessionId"?: "<uuid>" }`
 *
 * Streams Brain text deltas as SSE. History is loaded from the persisted
 * session. A missing `sessionId` creates a new session. Auth: Clerk session
 * (or local auth bypass) + organisation.
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireRole(Role.Member);
  if (error) return error;

  if (!isBrainConfigured()) {
    return jsonError(
      "Telos Brain is not configured. Set BRAIN_API_KEY and BRAIN_URL, or add the Telos Brain Vercel integration.",
      503
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const message = body.message?.trim();
  if (!message) {
    return jsonError("message is required.", 400);
  }

  try {
    let sessionId = body.sessionId?.trim() || "";
    const userId = user.profile.id;
    if (sessionId) {
      const existing = await getSession(
        user.organisation.id,
        sessionId,
        userId
      );
      if (!existing) {
        return jsonError("Chat session not found.", 404);
      }
    } else {
      const created = await createSession(user.organisation.id, userId);
      sessionId = created.id;
    }

    const history = await getRecentSessionHistory(
      user.organisation.id,
      sessionId,
      userId
    );
    const last = history[history.length - 1];
    const alreadyAppended = last?.role === "user" && last.content === message;
    if (!alreadyAppended) {
      await appendMessage(
        user.organisation.id,
        sessionId,
        "user",
        message,
        userId
      );
    }

    let entityId: string | undefined;
    try {
      const ensured = await ensureBrainEntityForOrganisation(
        user.organisation.id
      );
      entityId = ensured ?? undefined;
    } catch (entityError) {
      console.error(
        "Failed to ensure Brain entity for chat; continuing without entityId:",
        entityError
      );
    }

    const orgId = user.organisation.id;
    const inputMessage = buildInputMessage(history, message);
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    void (async () => {
      const send = async (event: ChatStreamEvent) => {
        await writer.write(encodeSse(event));
      };

      try {
        // Defeat proxy / compressor buffering so the first token can flush.
        await writer.write(sseEncoder.encode(`:${" ".repeat(2048)}\n\n`));
        await send({ type: "session", sessionId });

        const isFirstReply = !history.some(entry => entry.role === "assistant");
        const titlePromise = isFirstReply
          ? runWorkflowSync(TITLE_WORKFLOW_CODE, {
              inputMessage: message,
            }).catch((titleError: unknown) => {
              console.error("Failed to summarise chat title:", titleError);
              return null;
            })
          : null;

        let traceState = emptyTraceState();
        const reply = await runWorkflowSync(CHAT_WORKFLOW_CODE, {
          inputMessage,
          entityId,
          onEvent: async event => {
            traceState = applyTraceEvent(traceState, event);
            if (event.type === "text") {
              await send({ type: "text", delta: event.delta });
              return;
            }
            if (event.type === "status") {
              await send({ type: "status", phase: event.phase });
              return;
            }
            if (event.type === "thinking") {
              await send({ type: "thinking", delta: event.delta });
              return;
            }
            if (event.type === "tool_call") {
              await send({
                type: "tool_call",
                id: event.id,
                name: event.name,
                params: event.params,
              });
              return;
            }
            if (event.type === "tool_result") {
              await send({
                type: "tool_result",
                id: event.id,
                name: event.name,
                ok: event.ok,
                label: event.label,
                result: event.result,
              });
            }
          },
        });

        const trace = finalizeTrace(traceState);
        const resolvedReply = reply.trim()
          ? reply
          : fallbackReplyForEmptyTrace(trace);
        if (!resolvedReply) {
          throw new Error(
            "No reply text was produced before the output cap was hit."
          );
        }

        await appendMessage(
          orgId,
          sessionId,
          "assistant",
          encodeAssistantContent(resolvedReply, trace),
          userId
        );

        let title: string | undefined;
        if (titlePromise) {
          const rawTitle = await titlePromise;
          title =
            (await applyBrainSessionTitle(
              orgId,
              sessionId,
              message,
              userId,
              rawTitle
            )) ?? undefined;
        }

        const nextHistory = await getRecentSessionHistory(
          orgId,
          sessionId,
          userId
        );

        await send({
          type: "done",
          reply: resolvedReply,
          sessionId,
          history: nextHistory,
          title,
          trace,
        });
      } catch (err) {
        console.error("Error in POST /api/ai/chat stream:", err);
        await send({
          type: "error",
          message: publicChatErrorMessage(err),
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Encoding": "identity",
      },
    });
  } catch (err) {
    console.error("Error in POST /api/ai/chat:", err);
    return jsonError("Failed to run chat workflow.", 502);
  }
}
