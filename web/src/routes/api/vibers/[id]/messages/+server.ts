import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db, schema } from "$lib/server/db";
import { eq, asc } from "drizzle-orm";

// GET /api/vibers/[id]/messages - Load chat history for this viber (Viber Board-level persistence)
export const GET: RequestHandler = async ({ params }) => {
  try {
    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.viberId, params.id))
      .orderBy(asc(schema.messages.createdAt));

    const messages = rows.map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant" | "system",
      content: r.content,
      createdAt: r.createdAt,
      taskId: r.taskId ?? undefined,
    }));

    return json({ messages });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return json({ error: "Failed to fetch messages" }, { status: 500 });
  }
};

// POST /api/vibers/[id]/messages - Append one or more messages (Viber Board-level persistence)
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const viberId = params.id;

    // Accept single message or array
    const toInsert = Array.isArray(body.messages)
      ? body.messages
      : [
        {
          role: body.role,
          content: body.content,
          taskId: body.taskId ?? null,
        },
      ];

    const created = [];
    const now = new Date();

    // Ensure viber exists in local DB (auto-create if needed)
    const existingViber = await db.select().from(schema.vibers).where(eq(schema.vibers.id, viberId)).limit(1);
    if (existingViber.length === 0) {
      await db.insert(schema.vibers).values({
        id: viberId,
        name: viberId,
        createdAt: now,
      });
    }

    for (const msg of toInsert) {
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await db.insert(schema.messages).values({
        id,
        viberId,
        taskId: msg.taskId ?? null,
        role: msg.role,
        content: msg.content,
        createdAt: now,
      });
      created.push({
        id,
        role: msg.role,
        content: msg.content,
        createdAt: now,
        taskId: msg.taskId ?? undefined,
      });
    }

    return json(
      Array.isArray(body.messages) ? { messages: created } : created[0],
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to save message:", error);
    return json({ error: "Failed to save message" }, { status: 500 });
  }
};
