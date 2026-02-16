/**
 * Activity Logs - Persistent log storage via Supabase
 *
 * Provides helpers to write and query activity_logs for the Logs page.
 */

import { supabaseRequest } from "./supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  id?: string;
  user_id: string;
  level: "info" | "warn" | "error";
  category: "activity" | "system";
  component: string; // task | node | hub | skill | job
  message: string;
  viber_id?: string | null;
  task_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface LogQueryParams {
  category?: "activity" | "system";
  level?: string; // comma-separated: "info,warn,error"
  limit?: number;
  before?: string; // ISO cursor for pagination
  search?: string;
}

export interface LogRow {
  id: string;
  user_id: string;
  level: string;
  category: string;
  component: string;
  message: string;
  viber_id: string | null;
  task_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Write a log entry to Supabase. Fire-and-forget — callers should not await.
 */
export function writeLog(entry: LogEntry): void {
  supabaseRequest("activity_logs", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      user_id: entry.user_id,
      level: entry.level,
      category: entry.category,
      component: entry.component,
      message: entry.message,
      viber_id: entry.viber_id ?? null,
      task_id: entry.task_id ?? null,
      metadata: entry.metadata ?? null,
    },
  }).catch((err) => {
    console.error("[Logs] Failed to write log:", err);
  });
}

// ── Query ────────────────────────────────────────────────────────────────────

/**
 * Query persisted logs from Supabase with filters and cursor-based pagination.
 */
export async function queryLogs(
  userId: string,
  params: LogQueryParams = {},
): Promise<LogRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);

  const queryParams: Record<string, string | null | undefined> = {
    select: "*",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(limit),
  };

  if (params.category) {
    queryParams.category = `eq.${params.category}`;
  }

  if (params.level) {
    const levels = params.level.split(",").map((l) => l.trim());
    queryParams.level = `in.(${levels.join(",")})`;
  }

  if (params.before) {
    queryParams.created_at = `lt.${params.before}`;
  }

  if (params.search) {
    queryParams.message = `ilike.*${params.search}*`;
  }

  return supabaseRequest<LogRow[]>("activity_logs", { params: queryParams });
}
