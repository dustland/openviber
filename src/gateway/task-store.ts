import { execFileSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";

export type GatewayTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "stopped";

/** Persisted task metadata used by gateway and web APIs. */
export interface PersistedGatewayTask {
  id: string;
  userId: string | null;
  goal: string;
  viberId: string | null;
  environmentId: string | null;
  status: GatewayTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  error: string | null;
  config: Record<string, unknown> | null;
}

/** Input payload when creating a persisted task record. */
export interface PersistedGatewayTaskCreateInput {
  id: string;
  userId?: string | null;
  goal: string;
  viberId?: string | null;
  environmentId?: string | null;
  status?: GatewayTaskStatus;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  archivedAt?: string | null;
  error?: string | null;
  config?: Record<string, unknown> | null;
}

/** Partial update payload for a persisted task. */
export interface PersistedGatewayTaskPatch {
  goal?: string;
  viberId?: string | null;
  environmentId?: string | null;
  status?: GatewayTaskStatus;
  updatedAt?: string;
  completedAt?: string | null;
  archivedAt?: string | null;
  error?: string | null;
  config?: Record<string, unknown> | null;
}

/** Query filters when listing persisted tasks. */
export interface PersistedGatewayTaskListOptions {
  userId?: string;
  includeArchived?: boolean;
}

/**
 * Pluggable persistence interface for gateway task metadata.
 *
 * Implementations can target memory, SQLite, Supabase, or any future backend.
 */
export interface GatewayTaskStore {
  createTask(input: PersistedGatewayTaskCreateInput): Promise<PersistedGatewayTask>;
  getTask(id: string): Promise<PersistedGatewayTask | null>;
  listTasks(options?: PersistedGatewayTaskListOptions): Promise<PersistedGatewayTask[]>;
  updateTask(id: string, patch: PersistedGatewayTaskPatch): Promise<PersistedGatewayTask | null>;
  archiveTask(id: string, userId?: string): Promise<PersistedGatewayTask | null>;
  restoreTask(id: string): Promise<PersistedGatewayTask | null>;
  deleteTask(id: string): Promise<boolean>;
}

const DEFAULT_GATEWAY_TASK_DB_PATH = resolve(
  homedir(),
  ".openviber",
  "gateway",
  "tasks.sqlite3",
);

function normalizeTask(
  input: PersistedGatewayTaskCreateInput,
): PersistedGatewayTask {
  const now = new Date().toISOString();
  return {
    id: input.id,
    userId: input.userId ?? null,
    goal: input.goal,
    viberId: input.viberId ?? null,
    environmentId: input.environmentId ?? null,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    completedAt: input.completedAt ?? null,
    archivedAt: input.archivedAt ?? null,
    error: input.error ?? null,
    config: input.config ?? null,
  };
}

function applyPatch(
  existing: PersistedGatewayTask,
  patch: PersistedGatewayTaskPatch,
): PersistedGatewayTask {
  const updatedAt = patch.updatedAt ?? new Date().toISOString();

  return {
    ...existing,
    goal: patch.goal ?? existing.goal,
    viberId: patch.viberId === undefined ? existing.viberId : patch.viberId,
    environmentId:
      patch.environmentId === undefined
        ? existing.environmentId
        : patch.environmentId,
    status: patch.status ?? existing.status,
    updatedAt,
    completedAt:
      patch.completedAt === undefined ? existing.completedAt : patch.completedAt,
    archivedAt:
      patch.archivedAt === undefined ? existing.archivedAt : patch.archivedAt,
    error: patch.error === undefined ? existing.error : patch.error,
    config: patch.config === undefined ? existing.config : patch.config,
  };
}

function cloneTask(task: PersistedGatewayTask): PersistedGatewayTask {
  return {
    ...task,
    config: task.config ? JSON.parse(JSON.stringify(task.config)) : null,
  };
}

function compareTaskNewestFirst(
  a: PersistedGatewayTask,
  b: PersistedGatewayTask,
): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** In-memory task store for ephemeral gateway usage and tests. */
export class InMemoryGatewayTaskStore implements GatewayTaskStore {
  private readonly tasks = new Map<string, PersistedGatewayTask>();

  async createTask(
    input: PersistedGatewayTaskCreateInput,
  ): Promise<PersistedGatewayTask> {
    const task = normalizeTask(input);
    this.tasks.set(task.id, task);
    return cloneTask(task);
  }

  async getTask(id: string): Promise<PersistedGatewayTask | null> {
    const task = this.tasks.get(id);
    return task ? cloneTask(task) : null;
  }

  async listTasks(
    options: PersistedGatewayTaskListOptions = {},
  ): Promise<PersistedGatewayTask[]> {
    const includeArchived = options.includeArchived === true;

    const rows = Array.from(this.tasks.values()).filter((task) => {
      if (options.userId && task.userId !== options.userId) {
        return false;
      }
      if (!includeArchived && task.archivedAt) {
        return false;
      }
      return true;
    });

    rows.sort(compareTaskNewestFirst);
    return rows.map(cloneTask);
  }

  async updateTask(
    id: string,
    patch: PersistedGatewayTaskPatch,
  ): Promise<PersistedGatewayTask | null> {
    const existing = this.tasks.get(id);
    if (!existing) return null;

    const updated = applyPatch(existing, patch);
    this.tasks.set(id, updated);
    return cloneTask(updated);
  }

  async archiveTask(
    id: string,
    userId?: string,
  ): Promise<PersistedGatewayTask | null> {
    const existing = this.tasks.get(id);
    const now = new Date().toISOString();

    if (existing) {
      const updated = applyPatch(existing, {
        archivedAt: now,
        updatedAt: now,
      });
      this.tasks.set(id, updated);
      return cloneTask(updated);
    }

    const created = normalizeTask({
      id,
      userId: userId ?? null,
      goal: id,
      status: "stopped",
      archivedAt: now,
      updatedAt: now,
    });
    this.tasks.set(id, created);
    return cloneTask(created);
  }

  async restoreTask(id: string): Promise<PersistedGatewayTask | null> {
    return this.updateTask(id, { archivedAt: null });
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }
}

interface SupabaseStoreOptions {
  url: string;
  serviceRoleKey: string;
}

/** Supabase-backed task store for cloud persistence. */
export class SupabaseGatewayTaskStore implements GatewayTaskStore {
  constructor(private readonly options: SupabaseStoreOptions) {}

  async createTask(
    input: PersistedGatewayTaskCreateInput,
  ): Promise<PersistedGatewayTask> {
    const task = normalizeTask(input);

    await this.request("tasks", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      params: {
        on_conflict: "id",
      },
      body: {
        id: task.id,
        user_id: task.userId,
        goal: task.goal,
        viber_id: task.viberId,
        environment_id: task.environmentId,
        status: task.status,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
        completed_at: task.completedAt,
        archived_at: task.archivedAt,
        error: task.error,
        config: task.config ?? {},
      },
    });

    return task;
  }

  async getTask(id: string): Promise<PersistedGatewayTask | null> {
    const rows = await this.request<any[]>("tasks", {
      method: "GET",
      params: {
        id: `eq.${id}`,
        limit: "1",
        select:
          "id,user_id,goal,viber_id,environment_id,status,created_at,updated_at,completed_at,archived_at,error,config",
      },
    });

    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async listTasks(
    options: PersistedGatewayTaskListOptions = {},
  ): Promise<PersistedGatewayTask[]> {
    const params: Record<string, string> = {
      select:
        "id,user_id,goal,viber_id,environment_id,status,created_at,updated_at,completed_at,archived_at,error,config",
      order: "created_at.desc",
    };

    if (options.userId) {
      params.user_id = `eq.${options.userId}`;
    }
    if (!options.includeArchived) {
      params.archived_at = "is.null";
    }

    const rows = await this.request<any[]>("tasks", {
      method: "GET",
      params,
    });

    return rows.map((row) => this.mapRow(row));
  }

  async updateTask(
    id: string,
    patch: PersistedGatewayTaskPatch,
  ): Promise<PersistedGatewayTask | null> {
    const body = this.patchToRow(patch);
    if (Object.keys(body).length === 0) {
      return this.getTask(id);
    }

    await this.request("tasks", {
      method: "PATCH",
      params: { id: `eq.${id}` },
      prefer: "return=minimal",
      body,
    });

    return this.getTask(id);
  }

  async archiveTask(
    id: string,
    userId?: string,
  ): Promise<PersistedGatewayTask | null> {
    const now = new Date().toISOString();

    await this.request("tasks", {
      method: "POST",
      params: { on_conflict: "id" },
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [
        {
          id,
          user_id: userId ?? null,
          archived_at: now,
          updated_at: now,
        },
      ],
    });

    return this.getTask(id);
  }

  async restoreTask(id: string): Promise<PersistedGatewayTask | null> {
    await this.request("tasks", {
      method: "PATCH",
      params: { id: `eq.${id}` },
      prefer: "return=minimal",
      body: { archived_at: null, updated_at: new Date().toISOString() },
    });

    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<boolean> {
    await this.request("tasks", {
      method: "DELETE",
      params: { id: `eq.${id}` },
      prefer: "return=minimal",
    });

    return true;
  }

  private async request<T>(
    path: string,
    options: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      params?: Record<string, string>;
      body?: unknown;
      prefer?: string;
    },
  ): Promise<T> {
    const url = new URL(`/rest/v1/${path}`, this.options.url);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      apikey: this.options.serviceRoleKey,
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
    };

    if (options.prefer) {
      headers.Prefer = options.prefer;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method,
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Supabase task store request failed (${response.status}) ${options.method} ${path}: ${text}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  private patchToRow(patch: PersistedGatewayTaskPatch): Record<string, unknown> {
    const row: Record<string, unknown> = {};

    if (patch.goal !== undefined) row.goal = patch.goal;
    if (patch.viberId !== undefined) row.viber_id = patch.viberId;
    if (patch.environmentId !== undefined)
      row.environment_id = patch.environmentId;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.updatedAt !== undefined)
      row.updated_at = patch.updatedAt;
    else row.updated_at = new Date().toISOString();
    if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
    if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt;
    if (patch.error !== undefined) row.error = patch.error;
    if (patch.config !== undefined) row.config = patch.config ?? {};

    return row;
  }

  private mapRow(row: any): PersistedGatewayTask {
    return {
      id: String(row.id),
      userId: row.user_id ?? null,
      goal: String(row.goal ?? row.id ?? ""),
      viberId: row.viber_id ?? null,
      environmentId: row.environment_id ?? null,
      status: (row.status ?? "pending") as GatewayTaskStatus,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      completedAt: row.completed_at ?? null,
      archivedAt: row.archived_at ?? null,
      error: row.error ?? null,
      config:
        row.config && typeof row.config === "object"
          ? (row.config as Record<string, unknown>)
          : null,
    };
  }
}

interface SqliteTaskStoreOptions {
  dbPath: string;
}

/** SQLite-backed task store for local persistence without cloud dependencies. */
export class SqliteGatewayTaskStore implements GatewayTaskStore {
  private readonly dbPath: string;

  constructor(options: SqliteTaskStoreOptions) {
    this.dbPath = resolve(options.dbPath);
    this.ensureReady();
  }

  async createTask(
    input: PersistedGatewayTaskCreateInput,
  ): Promise<PersistedGatewayTask> {
    const task = normalizeTask(input);

    this.exec(
      `
INSERT INTO gateway_tasks (
  id, user_id, goal, viber_id, environment_id,
  status, created_at, updated_at, completed_at,
  archived_at, error, config
) VALUES (
  ${sqlLiteral(task.id)},
  ${sqlLiteral(task.userId)},
  ${sqlLiteral(task.goal)},
  ${sqlLiteral(task.viberId)},
  ${sqlLiteral(task.environmentId)},
  ${sqlLiteral(task.status)},
  ${sqlLiteral(task.createdAt)},
  ${sqlLiteral(task.updatedAt)},
  ${sqlLiteral(task.completedAt)},
  ${sqlLiteral(task.archivedAt)},
  ${sqlLiteral(task.error)},
  ${sqlLiteral(task.config ? JSON.stringify(task.config) : null)}
)
ON CONFLICT(id) DO UPDATE SET
  user_id = excluded.user_id,
  goal = excluded.goal,
  viber_id = excluded.viber_id,
  environment_id = excluded.environment_id,
  status = excluded.status,
  updated_at = excluded.updated_at,
  completed_at = excluded.completed_at,
  archived_at = excluded.archived_at,
  error = excluded.error,
  config = excluded.config;
`.trim(),
    );

    return task;
  }

  async getTask(id: string): Promise<PersistedGatewayTask | null> {
    const rows = this.query(
      `
SELECT
  id, user_id, goal, viber_id, environment_id,
  status, created_at, updated_at, completed_at,
  archived_at, error, config
FROM gateway_tasks
WHERE id = ${sqlLiteral(id)}
LIMIT 1;
`.trim(),
    );

    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async listTasks(
    options: PersistedGatewayTaskListOptions = {},
  ): Promise<PersistedGatewayTask[]> {
    const where: string[] = [];

    if (options.userId) {
      where.push(`user_id = ${sqlLiteral(options.userId)}`);
    }

    if (!options.includeArchived) {
      where.push("archived_at IS NULL");
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = this.query(
      `
SELECT
  id, user_id, goal, viber_id, environment_id,
  status, created_at, updated_at, completed_at,
  archived_at, error, config
FROM gateway_tasks
${whereClause}
ORDER BY datetime(created_at) DESC;
`.trim(),
    );

    return rows.map((row) => this.mapRow(row));
  }

  async updateTask(
    id: string,
    patch: PersistedGatewayTaskPatch,
  ): Promise<PersistedGatewayTask | null> {
    const assignments: string[] = [];

    if (patch.goal !== undefined) assignments.push(`goal = ${sqlLiteral(patch.goal)}`);
    if (patch.viberId !== undefined)
      assignments.push(`viber_id = ${sqlLiteral(patch.viberId)}`);
    if (patch.environmentId !== undefined)
      assignments.push(`environment_id = ${sqlLiteral(patch.environmentId)}`);
    if (patch.status !== undefined)
      assignments.push(`status = ${sqlLiteral(patch.status)}`);
    if (patch.completedAt !== undefined)
      assignments.push(`completed_at = ${sqlLiteral(patch.completedAt)}`);
    if (patch.archivedAt !== undefined)
      assignments.push(`archived_at = ${sqlLiteral(patch.archivedAt)}`);
    if (patch.error !== undefined)
      assignments.push(`error = ${sqlLiteral(patch.error)}`);
    if (patch.config !== undefined) {
      assignments.push(
        `config = ${sqlLiteral(patch.config ? JSON.stringify(patch.config) : null)}`,
      );
    }

    const updatedAt = patch.updatedAt ?? new Date().toISOString();
    assignments.push(`updated_at = ${sqlLiteral(updatedAt)}`);

    if (assignments.length === 0) {
      return this.getTask(id);
    }

    this.exec(
      `UPDATE gateway_tasks SET ${assignments.join(", ")} WHERE id = ${sqlLiteral(id)};`,
    );

    return this.getTask(id);
  }

  async archiveTask(
    id: string,
    userId?: string,
  ): Promise<PersistedGatewayTask | null> {
    const now = new Date().toISOString();

    this.exec(
      `
INSERT INTO gateway_tasks (
  id, user_id, goal, status, created_at, updated_at, archived_at
) VALUES (
  ${sqlLiteral(id)},
  ${sqlLiteral(userId ?? null)},
  ${sqlLiteral(id)},
  ${sqlLiteral("stopped")},
  ${sqlLiteral(now)},
  ${sqlLiteral(now)},
  ${sqlLiteral(now)}
)
ON CONFLICT(id) DO UPDATE SET
  archived_at = excluded.archived_at,
  updated_at = excluded.updated_at;
`.trim(),
    );

    return this.getTask(id);
  }

  async restoreTask(id: string): Promise<PersistedGatewayTask | null> {
    this.exec(
      `
UPDATE gateway_tasks
SET archived_at = NULL, updated_at = ${sqlLiteral(new Date().toISOString())}
WHERE id = ${sqlLiteral(id)};
`.trim(),
    );

    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<boolean> {
    this.exec(`DELETE FROM gateway_tasks WHERE id = ${sqlLiteral(id)};`);
    return true;
  }

  private ensureReady(): void {
    const parentDir = dirname(this.dbPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    this.exec(
      `
CREATE TABLE IF NOT EXISTS gateway_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  goal TEXT NOT NULL,
  viber_id TEXT,
  environment_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived_at TEXT,
  error TEXT,
  config TEXT
);

CREATE INDEX IF NOT EXISTS idx_gateway_tasks_user_id ON gateway_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_gateway_tasks_archived_at ON gateway_tasks(archived_at);
CREATE INDEX IF NOT EXISTS idx_gateway_tasks_created_at ON gateway_tasks(created_at DESC);
`.trim(),
    );
  }

  private exec(sql: string): void {
    execFileSync("sqlite3", [this.dbPath, sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  private query(sql: string): Array<Record<string, unknown>> {
    const output = execFileSync("sqlite3", ["-json", this.dbPath, sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    if (!output) return [];

    try {
      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private mapRow(row: Record<string, unknown>): PersistedGatewayTask {
    let config: Record<string, unknown> | null = null;
    if (typeof row.config === "string" && row.config.length > 0) {
      try {
        const parsed = JSON.parse(row.config);
        if (parsed && typeof parsed === "object") {
          config = parsed as Record<string, unknown>;
        }
      } catch {
        config = null;
      }
    }

    return {
      id: String(row.id),
      userId: row.user_id == null ? null : String(row.user_id),
      goal: String(row.goal ?? row.id ?? ""),
      viberId: row.viber_id == null ? null : String(row.viber_id),
      environmentId:
        row.environment_id == null ? null : String(row.environment_id),
      status: String(row.status ?? "pending") as GatewayTaskStatus,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
      completedAt:
        row.completed_at == null ? null : String(row.completed_at),
      archivedAt: row.archived_at == null ? null : String(row.archived_at),
      error: row.error == null ? null : String(row.error),
      config,
    };
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  const text = String(value).replace(/'/g, "''");
  return `'${text}'`;
}

export type GatewayTaskStoreMode = "memory" | "sqlite" | "supabase";

export interface GatewayTaskStoreFactoryConfig {
  mode?: GatewayTaskStoreMode;
  sqlitePath?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}

/** Create a task store from explicit config values. */
export function createGatewayTaskStore(
  config: GatewayTaskStoreFactoryConfig = {},
): GatewayTaskStore {
  const mode = config.mode ?? "memory";

  if (mode === "memory") {
    return new InMemoryGatewayTaskStore();
  }

  if (mode === "sqlite") {
    return new SqliteGatewayTaskStore({
      dbPath: config.sqlitePath ?? DEFAULT_GATEWAY_TASK_DB_PATH,
    });
  }

  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceRoleKey = config.supabaseServiceRoleKey;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Supabase task store requires supabaseUrl and supabaseServiceRoleKey.",
    );
  }

  return new SupabaseGatewayTaskStore({
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
  });
}

/** Create a task store from gateway environment variables. */
export function createGatewayTaskStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GatewayTaskStore {
  const modeRaw = (env.VIBER_GATEWAY_TASK_STORE || "memory").toLowerCase();
  const mode =
    modeRaw === "sqlite" || modeRaw === "supabase" || modeRaw === "memory"
      ? modeRaw
      : "memory";

  const sqlitePath = env.VIBER_GATEWAY_SQLITE_PATH;

  const supabaseUrl =
    env.VIBER_GATEWAY_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseServiceRoleKey =
    env.VIBER_GATEWAY_SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY;

  return createGatewayTaskStore({
    mode,
    sqlitePath,
    supabaseUrl,
    supabaseServiceRoleKey,
  });
}
