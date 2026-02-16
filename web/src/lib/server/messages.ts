import { nanoid } from "nanoid";
import { supabaseRequest } from "./supabase";

interface MessageRow {
  id: string;
  task_id: string;
  role: string;
  content: string;
  created_at: string;
}

const MESSAGE_PAYLOAD_PREFIX = "__openviber_message_v1__";

interface EncodedMessagePayloadV1 {
  version: 1;
  content: string;
  parts: unknown[];
}

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  parts: unknown[] | null;
  createdAt: string;
  taskId: string;
}

export interface MessageInsertInput {
  role: string;
  content: string;
  parts?: unknown[] | null;
}

function decodeStoredContent(
  rawContent: string,
): { content: string; parts: unknown[] | null } {
  if (!rawContent.startsWith(MESSAGE_PAYLOAD_PREFIX)) {
    return { content: rawContent, parts: null };
  }

  const payloadText = rawContent.slice(MESSAGE_PAYLOAD_PREFIX.length);
  try {
    const parsed = JSON.parse(payloadText) as Partial<EncodedMessagePayloadV1>;
    if (parsed.version !== 1) {
      return { content: rawContent, parts: null };
    }
    return {
      content: typeof parsed.content === "string" ? parsed.content : "",
      parts: Array.isArray(parsed.parts) ? parsed.parts : null,
    };
  } catch {
    return { content: rawContent, parts: null };
  }
}

function encodeStoredContent(content: string, parts?: unknown[] | null): string {
  if (!Array.isArray(parts) || parts.length === 0) {
    return content;
  }
  const payload: EncodedMessagePayloadV1 = {
    version: 1,
    content,
    parts,
  };
  return `${MESSAGE_PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

function mapMessageRow(row: MessageRow): StoredMessage {
  const decoded = decodeStoredContent(row.content);
  return {
    id: row.id,
    role: row.role,
    content: decoded.content,
    parts: decoded.parts,
    createdAt: row.created_at,
    taskId: row.task_id,
  };
}

export async function listMessagesForTask(
  taskId: string,
): Promise<StoredMessage[]> {
  const params: Record<string, string> = {
    task_id: `eq.${taskId}`,
    select: "*",
    order: "created_at.asc",
  };

  const rows = await supabaseRequest<MessageRow[]>("messages", { params });
  return rows.map(mapMessageRow);
}

export async function appendMessagesForTask(
  taskId: string,
  inputs: MessageInsertInput[],
): Promise<StoredMessage[]> {
  const now = new Date().toISOString();

  const rowsToInsert = inputs
    .map((input) => {
      const role = String(input.role || "").trim();
      const contentText = typeof input.content === "string"
        ? input.content
        : input.content != null
          ? JSON.stringify(input.content)
          : "";
      const parts = Array.isArray(input.parts) ? input.parts : null;
      const content = encodeStoredContent(contentText, parts);

      if (!role || (!contentText && (!parts || parts.length === 0))) {
        return null;
      }

      return {
        id: `msg_${nanoid(12)}`,
        task_id: taskId,
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
