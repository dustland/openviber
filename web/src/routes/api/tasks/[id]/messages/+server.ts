import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  appendMessagesForTask,
  listMessagesForTask,
  type MessageInsertInput,
} from "$lib/server/messages";
import { touchViberActivity } from "$lib/server/environments";

// GET /api/tasks/[id]/messages - Load chat history for this task
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listMessagesForTask(params.id);

    const messages = rows.map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant" | "system",
      content: row.content,
      parts: row.parts ?? undefined,
      createdAt: row.createdAt,
      taskId: row.taskId ?? undefined,
    }));

    return json({ messages });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return json({ error: "Failed to fetch messages" }, { status: 500 });
  }
};

// POST /api/tasks/[id]/messages - Append one or more messages
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const taskId = params.id;

    const rawInputs = Array.isArray(body.messages)
      ? body.messages
      : [
        {
          role: body.role,
          content: body.content,
          parts: body.parts,
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
    }));

    const createdRows = await appendMessagesForTask(taskId, inputs);

    if (createdRows.length > 0) {
      await touchViberActivity(taskId);
    }

    const created = createdRows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      parts: row.parts ?? undefined,
      createdAt: row.createdAt,
      taskId: row.taskId ?? undefined,
    }));

    if (Array.isArray(body.messages)) {
      return json({ messages: created }, { status: 201 });
    }

    return json(created[0] || null, { status: 201 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to save message:", errMsg);
    return json({ error: `Failed to save message: ${errMsg}` }, { status: 500 });
  }
};
