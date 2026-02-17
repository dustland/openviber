import { execFileSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";

const DEFAULT_GATEWAY_VIBER_DB_PATH = resolve(
  homedir(),
  ".openviber",
  "gateway",
  "tasks.sqlite3",
);

export interface PersistedGatewayViber {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  connectedAt: string | null;
  lastHeartbeatAt: string | null;
  lastDisconnectedAt: string | null;
  updatedAt: string;
}

export interface PersistedGatewayViberConnectInput {
  id: string;
  name: string;
  version: string;
  platform: string;
  capabilities?: string[];
  connectedAt?: string;
  lastHeartbeatAt?: string;
}

/** Store for viber metadata persisted by gateway. */
export interface GatewayViberStore {
  upsertConnected(input: PersistedGatewayViberConnectInput): Promise<void>;
  touchHeartbeat(id: string, at?: string): Promise<void>;
  markDisconnected(id: string, at?: string): Promise<void>;
  listVibers(): Promise<PersistedGatewayViber[]>;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** In-memory viber store for ephemeral gateway usage and tests. */
export class InMemoryGatewayViberStore implements GatewayViberStore {
  private readonly vibers = new Map<string, PersistedGatewayViber>();

  async upsertConnected(
    input: PersistedGatewayViberConnectInput,
  ): Promise<void> {
    const now = input.connectedAt ?? new Date().toISOString();
    const existing = this.vibers.get(input.id);

    this.vibers.set(input.id, {
      id: input.id,
      name: input.name,
      version: input.version,
      platform: input.platform,
      capabilities: input.capabilities ?? [],
      connectedAt: now,
      lastHeartbeatAt: input.lastHeartbeatAt ?? now,
      lastDisconnectedAt: null,
      updatedAt: now,
      ...(existing ?? {}),
    });
  }

  async touchHeartbeat(id: string, at?: string): Promise<void> {
    const existing = this.vibers.get(id);
    if (!existing) return;

    const now = at ?? new Date().toISOString();
    this.vibers.set(id, {
      ...existing,
      lastHeartbeatAt: now,
      updatedAt: now,
    });
  }

  async markDisconnected(id: string, at?: string): Promise<void> {
    const existing = this.vibers.get(id);
    if (!existing) return;

    const now = at ?? new Date().toISOString();
    this.vibers.set(id, {
      ...existing,
      lastDisconnectedAt: now,
      updatedAt: now,
    });
  }

  async listVibers(): Promise<PersistedGatewayViber[]> {
    return Array.from(this.vibers.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }
}

interface SupabaseViberStoreOptions {
  url: string;
  serviceRoleKey: string;
}

/** Supabase-backed viber store for cloud persistence. */
export class SupabaseGatewayViberStore implements GatewayViberStore {
  constructor(private readonly options: SupabaseViberStoreOptions) {}

  async upsertConnected(
    input: PersistedGatewayViberConnectInput,
  ): Promise<void> {
    const now = input.connectedAt ?? new Date().toISOString();

    await this.request("vibers", {
      method: "POST",
      params: { on_conflict: "id" },
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        id: input.id,
        name: input.name,
        version: input.version,
        platform: input.platform,
        capabilities: input.capabilities ?? [],
        last_connected: now,
        updated_at: now,
        archived_at: null,
      },
    });
  }

  async touchHeartbeat(id: string, at?: string): Promise<void> {
    const now = at ?? new Date().toISOString();
    await this.request("vibers", {
      method: "PATCH",
      params: { id: `eq.${id}` },
      prefer: "return=minimal",
      body: {
        last_connected: now,
        updated_at: now,
      },
    });
  }

  async markDisconnected(id: string, at?: string): Promise<void> {
    const now = at ?? new Date().toISOString();
    await this.request("vibers", {
      method: "PATCH",
      params: { id: `eq.${id}` },
      prefer: "return=minimal",
      body: {
        last_disconnected: now,
        updated_at: now,
      },
    });
  }

  async listVibers(): Promise<PersistedGatewayViber[]> {
    const rows = await this.request<any[]>("vibers", {
      method: "GET",
      params: {
        select:
          "id,name,version,platform,capabilities,last_connected,last_disconnected,updated_at",
        order: "updated_at.desc",
      },
    });

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      version: String(row.version ?? "unknown"),
      platform: String(row.platform ?? "unknown"),
      capabilities: Array.isArray(row.capabilities)
        ? row.capabilities.filter((x: unknown) => typeof x === "string")
        : [],
      connectedAt: row.last_connected ?? null,
      lastHeartbeatAt: row.last_connected ?? null,
      lastDisconnectedAt: row.last_disconnected ?? null,
      updatedAt: row.updated_at ?? row.last_connected ?? new Date().toISOString(),
    }));
  }

  private async request<T>(
    path: string,
    options: {
      method: "GET" | "POST" | "PATCH";
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
        `Supabase viber store request failed (${response.status}) ${options.method} ${path}: ${text}`,
      );
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}

interface SqliteViberStoreOptions {
  dbPath: string;
}

/** SQLite-backed viber store for local persistence. */
export class SqliteGatewayViberStore implements GatewayViberStore {
  private readonly dbPath: string;

  constructor(options: SqliteViberStoreOptions) {
    this.dbPath = resolve(options.dbPath);
    this.ensureReady();
  }

  async upsertConnected(
    input: PersistedGatewayViberConnectInput,
  ): Promise<void> {
    const now = input.connectedAt ?? new Date().toISOString();

    this.exec(
      `
INSERT INTO gateway_vibers (
  id, name, version, platform, capabilities,
  connected_at, last_heartbeat_at, last_disconnected_at, updated_at
) VALUES (
  ${sqlLiteral(input.id)},
  ${sqlLiteral(input.name)},
  ${sqlLiteral(input.version)},
  ${sqlLiteral(input.platform)},
  ${sqlLiteral(JSON.stringify(input.capabilities ?? []))},
  ${sqlLiteral(now)},
  ${sqlLiteral(input.lastHeartbeatAt ?? now)},
  NULL,
  ${sqlLiteral(now)}
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  version = excluded.version,
  platform = excluded.platform,
  capabilities = excluded.capabilities,
  connected_at = excluded.connected_at,
  last_heartbeat_at = excluded.last_heartbeat_at,
  last_disconnected_at = NULL,
  updated_at = excluded.updated_at;
`.trim(),
    );
  }

  async touchHeartbeat(id: string, at?: string): Promise<void> {
    const now = at ?? new Date().toISOString();
    this.exec(
      `
UPDATE gateway_vibers
SET last_heartbeat_at = ${sqlLiteral(now)},
    updated_at = ${sqlLiteral(now)}
WHERE id = ${sqlLiteral(id)};
`.trim(),
    );
  }

  async markDisconnected(id: string, at?: string): Promise<void> {
    const now = at ?? new Date().toISOString();
    this.exec(
      `
UPDATE gateway_vibers
SET last_disconnected_at = ${sqlLiteral(now)},
    updated_at = ${sqlLiteral(now)}
WHERE id = ${sqlLiteral(id)};
`.trim(),
    );
  }

  async listVibers(): Promise<PersistedGatewayViber[]> {
    const rows = this.query(
      `
SELECT
  id, name, version, platform, capabilities,
  connected_at, last_heartbeat_at, last_disconnected_at, updated_at
FROM gateway_vibers
ORDER BY datetime(updated_at) DESC;
`.trim(),
    );

    return rows.map((row) => this.mapRow(row));
  }

  private ensureReady(): void {
    const parentDir = dirname(this.dbPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    this.exec(
      `
CREATE TABLE IF NOT EXISTS gateway_vibers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  capabilities TEXT,
  connected_at TEXT,
  last_heartbeat_at TEXT,
  last_disconnected_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gateway_vibers_updated_at ON gateway_vibers(updated_at DESC);
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

  private mapRow(row: Record<string, unknown>): PersistedGatewayViber {
    let capabilities: string[] = [];
    if (typeof row.capabilities === "string" && row.capabilities.length > 0) {
      try {
        const parsed = JSON.parse(row.capabilities);
        if (Array.isArray(parsed)) {
          capabilities = parsed.filter((x) => typeof x === "string");
        }
      } catch {
        capabilities = [];
      }
    }

    return {
      id: String(row.id),
      name: String(row.name ?? row.id),
      version: String(row.version ?? "unknown"),
      platform: String(row.platform ?? "unknown"),
      capabilities,
      connectedAt: row.connected_at == null ? null : String(row.connected_at),
      lastHeartbeatAt:
        row.last_heartbeat_at == null ? null : String(row.last_heartbeat_at),
      lastDisconnectedAt:
        row.last_disconnected_at == null
          ? null
          : String(row.last_disconnected_at),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  }
}

export type GatewayViberStoreMode = "memory" | "sqlite" | "supabase";

export interface GatewayViberStoreFactoryConfig {
  mode?: GatewayViberStoreMode;
  sqlitePath?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}

export function createGatewayViberStore(
  config: GatewayViberStoreFactoryConfig = {},
): GatewayViberStore {
  const mode = config.mode ?? "memory";

  if (mode === "memory") {
    return new InMemoryGatewayViberStore();
  }

  if (mode === "sqlite") {
    return new SqliteGatewayViberStore({
      dbPath: config.sqlitePath ?? DEFAULT_GATEWAY_VIBER_DB_PATH,
    });
  }

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase viber store requires supabaseUrl and supabaseServiceRoleKey.",
    );
  }

  return new SupabaseGatewayViberStore({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });
}

export function createGatewayViberStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GatewayViberStore {
  const modeRaw = (
    env.VIBER_GATEWAY_VIBER_STORE ||
    env.VIBER_GATEWAY_TASK_STORE ||
    "memory"
  ).toLowerCase();
  const mode =
    modeRaw === "sqlite" || modeRaw === "supabase" || modeRaw === "memory"
      ? modeRaw
      : "memory";

  return createGatewayViberStore({
    mode,
    sqlitePath: env.VIBER_GATEWAY_SQLITE_PATH,
    supabaseUrl: env.VIBER_GATEWAY_SUPABASE_URL || env.SUPABASE_URL,
    supabaseServiceRoleKey:
      env.VIBER_GATEWAY_SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
