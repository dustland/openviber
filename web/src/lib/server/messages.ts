import { nanoid } from "nanoid";
import { supabaseRequest } from "./supabase-rest";

interface MessageRow {
  id: string;
  task_id: string | null;
  thread_id: string | null;
  viber_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  taskId: string | null;
  threadId: string | null;
}

export interface MessageInsertInput {
  role: string;
  content: string;
  taskId?: string | null;
  threadId?: string | null;
}

function mapMessageRow(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    taskId: row.task_id,
    threadId: row.thread_id,
  };
}

/**
 * Best-effort upsert for viber identity row to satisfy optional FK constraints.
 */
async function ensureViberRow(viberId: string) {
  try {
    const now = new Date().toISOString();
    await supabaseRequest<unknown>("vibers", {
      method: "POST",
      params: {
        on_conflict: "id",
      },
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [
        {
          id: viberId,
          name: viberId,
          created_at: now,
        },
      ],
    });
  } catch (error) {
    console.warn("Failed to upsert viber row (continuing):", error);
  }
}

export async function listMessagesForViber(
  viberId: string,
  threadId: string | null,
): Promise<StoredMessage[]> {
  const params: Record<string, string> = {
    viber_id: `eq.${viberId}`,
    select: "*",
    order: "created_at.asc",
  };

  if (threadId) {
    params.thread_id = `eq.${threadId}`;
  }

  const rows = await supabaseRequest<MessageRow[]>("messages", { params });
  return rows.map(mapMessageRow);
}

export async function appendMessagesForViber(
  viberId: string,
  inputs: MessageInsertInput[],
): Promise<StoredMessage[]> {
  await ensureViberRow(viberId);

  const now = new Date().toISOString();

  const rowsToInsert = inputs
    .map((input) => {
      const role = String(input.role || "").trim();
      const content = typeof input.content === "string"
        ? input.content
        : input.content != null
          ? JSON.stringify(input.content)
          : "";

      if (!role || !content) {
        return null;
      }

      return {
        id: `msg_${nanoid(12)}`,
        task_id: input.taskId ?? null,
        thread_id: input.threadId ?? null,
        viber_id: viberId,
        role,
        content,
        created_at: now,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rowsToInsert.length === 0) {
    return [];
  }

  const inserted = await supabaseRequest<MessageRow[]>("messages", {
    method: "POST",
    params: {
      select: "*",
    },
    prefer: "return=representation",
    body: rowsToInsert,
  });

  return inserted.map(mapMessageRow);
}
