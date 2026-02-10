import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  appendMessagesForViber,
  listMessagesForViber,
  type MessageInsertInput,
} from "$lib/server/messages";
import { touchViberActivity } from "$lib/server/environments";

// GET /api/vibers/[id]/messages - Load chat history for this viber
export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const threadId = url.searchParams.get("threadId");
    const rows = await listMessagesForViber(params.id, threadId);

    const messages = rows.map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant" | "system",
      content: row.content,
      parts: row.parts ?? undefined,
      createdAt: row.createdAt,
      taskId: row.taskId ?? undefined,
      threadId: row.threadId ?? undefined,
    }));

    return json({ messages });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return json({ error: "Failed to fetch messages" }, { status: 500 });
  }
};

// POST /api/vibers/[id]/messages - Append one or more messages
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const viberId = params.id;

    const defaultThreadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim()
        : null;

    const rawInputs = Array.isArray(body.messages)
      ? body.messages
      : [
          {
            role: body.role,
            content: body.content,
            parts: body.parts,
            taskId: body.taskId ?? null,
            threadId: defaultThreadId,
          },
        ];

    const inputs: MessageInsertInput[] = rawInputs.map((input: any) => ({
      role: String(input?.role || "").trim(),
      content: typeof input?.content === "string"
        ? input.content
        : input?.content != null
          ? JSON.stringify(input.content)
          : "",
      parts: Array.isArray(input?.parts) ? input.parts : null,
      taskId:
        input?.taskId !== undefined
          ? String(input.taskId || "").trim() || null
          : null,
      threadId:
        input?.threadId !== undefined
          ? String(input.threadId || "").trim() || null
          : defaultThreadId,
    }));

    const createdRows = await appendMessagesForViber(viberId, inputs);

    if (createdRows.length > 0) {
      await touchViberActivity(viberId);
    }

    const created = createdRows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      parts: row.parts ?? undefined,
      createdAt: row.createdAt,
      taskId: row.taskId ?? undefined,
      threadId: row.threadId ?? undefined,
    }));

    if (Array.isArray(body.messages)) {
      return json({ messages: created }, { status: 201 });
    }

    return json(created[0] || null, { status: 201 });
  } catch (error) {
    console.error("Failed to save message:", error);
    return json({ error: "Failed to save message" }, { status: 500 });
  }
};
