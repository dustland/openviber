import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "$env/dynamic/private";
import { nanoid } from "nanoid";
import { supabaseRequest, toInFilter } from "./supabase-rest";

const ENVIRONMENT_TYPES = new Set(["github", "local", "manual"]);
const SECRET_PLACEHOLDER = "••••••••";

export type EnvironmentType = "github" | "local" | "manual";
export type ThreadStatus = "active" | "paused" | "archived";

export interface EnvironmentVariableInput {
  key: string;
  value: string;
  isSecret?: boolean;
}

export interface EnvironmentSummary {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  type: EnvironmentType;
  repoUrl: string | null;
  repoOrg: string | null;
  repoName: string | null;
  repoBranch: string | null;
  containerImage: string | null;
  workingDir: string | null;
  setupScript: string | null;
  networkAccess: boolean;
  persistVolume: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  threadCount: number;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface EnvironmentDetail extends EnvironmentSummary {
  variables: EnvironmentVariable[];
}

export interface ThreadSummary {
  id: string;
  userId: string;
  viberId: string;
  environmentId: string;
  activeNodeId: string | null;
  title: string;
  status: ThreadStatus;
  lastMessageAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface EnvironmentRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  type: string;
  repo_url: string | null;
  repo_org: string | null;
  repo_name: string | null;
  repo_branch: string | null;
  container_image: string | null;
  working_dir: string | null;
  setup_script: string | null;
  network_access: boolean | number | string | null;
  persist_volume: boolean | number | string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface EnvironmentVarRow {
  key: string;
  value: string;
}

interface EnvironmentSecretRow {
  key: string;
  encrypted_value: string;
}

interface ThreadRow {
  id: string;
  user_id: string;
  viber_id: string;
  environment_id: string;
  active_node_id: string | null;
  title: string;
  status: string;
  last_message_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ViberEnvironmentRow {
  id: string;
  environment_id: string | null;
}

export interface ViberEnvironmentAssignment {
  viberId: string;
  environmentId: string | null;
}

const DEFAULT_ENV_SECRET = "openviber-dev-secret";

function getCipherKey(): Buffer {
  const configured = env.OPENVIBER_ENV_SECRET_KEY || DEFAULT_ENV_SECRET;
  return createHash("sha256").update(configured).digest();
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "t", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "f", "no", "off"].includes(normalized)) return false;
  }
  return Boolean(value);
}

function normalizeEnvironmentType(value: unknown): EnvironmentType {
  const raw = String(value || "github").trim().toLowerCase();
  return ENVIRONMENT_TYPES.has(raw) ? (raw as EnvironmentType) : "github";
}

function normalizeThreadStatus(value: unknown): ThreadStatus {
  const raw = String(value || "active").trim().toLowerCase();
  switch (raw) {
    case "paused":
    case "archived":
      return raw;
    default:
      return "active";
  }
}

function sanitizeVariables(inputs: EnvironmentVariableInput[]): EnvironmentVariableInput[] {
  const out: EnvironmentVariableInput[] = [];
  const seen = new Set<string>();
  for (const item of inputs) {
    const key = String(item.key || "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      value: String(item.value ?? ""),
      isSecret: Boolean(item.isSecret),
    });
  }
  return out;
}

export function encryptSecretValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecretValue(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted secret payload.");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const encrypted = Buffer.from(dataPart, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getCipherKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

async function hydratePlaceholderSecrets(
  environmentId: string,
  variables: EnvironmentVariableInput[],
): Promise<EnvironmentVariableInput[]> {
  const placeholderKeys = Array.from(
    new Set(
      variables
        .filter((item) => item.isSecret && item.value === SECRET_PLACEHOLDER)
        .map((item) => item.key),
    ),
  );

  if (placeholderKeys.length === 0) {
    return variables;
  }

  const existingSecrets = await supabaseRequest<EnvironmentSecretRow[]>(
    "environment_secrets",
    {
      params: {
        select: "key,encrypted_value",
        environment_id: `eq.${environmentId}`,
        key: toInFilter(placeholderKeys),
      },
    },
  );

  const existingValues = new Map<string, string>();
  for (const secret of existingSecrets) {
    try {
      existingValues.set(secret.key, decryptSecretValue(secret.encrypted_value));
    } catch {
      throw new Error(`Failed to decrypt existing secret: ${secret.key}`);
    }
  }

  return variables.map((item) => {
    if (!item.isSecret || item.value !== SECRET_PLACEHOLDER) {
      return item;
    }

    const preserved = existingValues.get(item.key);
    if (preserved === undefined) {
      return item;
    }

    return {
      ...item,
      value: preserved,
    };
  });
}

export function extractVariablesFromBody(body: any): EnvironmentVariableInput[] {
  const variables: EnvironmentVariableInput[] = [];

  if (Array.isArray(body?.variables)) {
    for (const item of body.variables) {
      variables.push({
        key: String(item?.key ?? ""),
        value: String(item?.value ?? ""),
        isSecret: Boolean(item?.isSecret),
      });
    }
  }

  if (body?.environmentVariables && typeof body.environmentVariables === "object") {
    for (const [key, value] of Object.entries(body.environmentVariables)) {
      variables.push({ key, value: String(value ?? ""), isSecret: false });
    }
  }

  if (body?.secrets && typeof body.secrets === "object") {
    for (const [key, value] of Object.entries(body.secrets)) {
      variables.push({ key, value: String(value ?? ""), isSecret: true });
    }
  }

  return sanitizeVariables(variables);
}

function parseGitHubRepo(input?: string | null): {
  repoOrg: string | null;
  repoName: string | null;
} {
  if (!input) {
    return { repoOrg: null, repoName: null };
  }
  const trimmed = input.trim();
  const match = trimmed.match(/github\.com[:/]+([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (!match) {
    return { repoOrg: null, repoName: null };
  }
  return {
    repoOrg: match[1] || null,
    repoName: match[2] || null,
  };
}

function mapEnvironmentSummary(
  row: EnvironmentRow,
  threadCount: number,
): EnvironmentSummary {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    type: normalizeEnvironmentType(row.type),
    repoUrl: row.repo_url,
    repoOrg: row.repo_org,
    repoName: row.repo_name,
    repoBranch: row.repo_branch,
    containerImage: row.container_image,
    workingDir: row.working_dir,
    setupScript: row.setup_script,
    networkAccess: toBoolean(row.network_access, true),
    persistVolume: toBoolean(row.persist_volume, true),
    metadata: row.metadata ?? null,
    createdAt: toIso(row.created_at) || new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) || new Date(0).toISOString(),
    threadCount,
  };
}

function mapThreadRow(row: ThreadRow): ThreadSummary {
  return {
    id: row.id,
    userId: row.user_id,
    viberId: row.viber_id,
    environmentId: row.environment_id,
    activeNodeId: row.active_node_id,
    title: row.title,
    status: normalizeThreadStatus(row.status),
    lastMessageAt: toIso(row.last_message_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function environmentExistsForUser(userId: string, environmentId: string) {
  const rows = await supabaseRequest<Array<{ id: string }>>("environments", {
    params: {
      select: "id",
      id: `eq.${environmentId}`,
      user_id: `eq.${userId}`,
      limit: "1",
    },
  });

  return rows.length > 0;
}

export async function listViberEnvironmentAssignmentsForUser(
  userId: string,
  viberIds?: string[],
): Promise<ViberEnvironmentAssignment[]> {
  if (viberIds && viberIds.length === 0) {
    return [];
  }

  const viberRows = await supabaseRequest<ViberEnvironmentRow[]>("vibers", {
    params: {
      select: "id,environment_id",
      ...(viberIds ? { id: toInFilter(viberIds) } : {}),
    },
  });

  if (viberRows.length === 0) {
    return [];
  }

  const environmentIds = Array.from(
    new Set(
      viberRows
        .map((row) => row.environment_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let ownedEnvironmentIds = new Set<string>();
  if (environmentIds.length > 0) {
    const ownedRows = await supabaseRequest<Array<{ id: string }>>("environments", {
      params: {
        select: "id",
        user_id: `eq.${userId}`,
        id: toInFilter(environmentIds),
      },
    });

    ownedEnvironmentIds = new Set(ownedRows.map((row) => row.id));
  }

  return viberRows.map((row) => ({
    viberId: row.id,
    environmentId:
      row.environment_id && ownedEnvironmentIds.has(row.environment_id)
        ? row.environment_id
        : null,
  }));
}

export async function getViberEnvironmentForUser(
  userId: string,
  viberId: string,
): Promise<string | null> {
  const assignments = await listViberEnvironmentAssignmentsForUser(userId, [viberId]);
  return assignments[0]?.environmentId ?? null;
}

export async function setViberEnvironmentForUser(
  userId: string,
  viberId: string,
  environmentId: string | null,
  goal?: string,
): Promise<ViberEnvironmentAssignment | null> {
  const normalizedEnvironmentId = environmentId?.trim() || null;

  if (
    normalizedEnvironmentId &&
    !(await environmentExistsForUser(userId, normalizedEnvironmentId))
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const rows = await supabaseRequest<ViberEnvironmentRow[]>("vibers", {
    method: "POST",
    params: {
      select: "id,environment_id",
      on_conflict: "id",
    },
    prefer: "resolution=merge-duplicates,return=representation",
    body: [
      {
        id: viberId,
        name: goal?.trim() || viberId,
        environment_id: normalizedEnvironmentId,
        created_at: now,
        updated_at: now,
      },
    ],
  });

  const row = rows[0] ?? { id: viberId, environment_id: normalizedEnvironmentId };
  return {
    viberId: row.id,
    environmentId: row.environment_id,
  };
}

export async function listEnvironmentsForUser(
  userId: string,
  viberId?: string,
): Promise<EnvironmentSummary[]> {
  const environments = await supabaseRequest<EnvironmentRow[]>("environments", {
    params: {
      select: "*",
      user_id: `eq.${userId}`,
      order: "updated_at.desc",
    },
  });

  if (environments.length === 0) return [];

  const environmentIds = environments.map((row) => row.id);

  const threadParams: Record<string, string> = {
    select: "id,environment_id,viber_id",
    user_id: `eq.${userId}`,
    environment_id: toInFilter(environmentIds),
  };
  if (viberId) {
    threadParams.viber_id = `eq.${viberId}`;
  }

  const threadsPromise = supabaseRequest<Array<{ id: string; environment_id: string }>>(
    "threads",
    {
      params: threadParams,
    },
  );

  const threadRows = await threadsPromise;

  const threadCounts = new Map<string, number>();
  for (const thread of threadRows) {
    threadCounts.set(
      thread.environment_id,
      (threadCounts.get(thread.environment_id) || 0) + 1,
    );
  }

  return environments.map((row) => mapEnvironmentSummary(row, threadCounts.get(row.id) || 0));
}

export async function getEnvironmentForUser(
  userId: string,
  environmentId: string,
  options: { includeSecretValues?: boolean } = {},
): Promise<EnvironmentDetail | null> {
  const environmentRows = await supabaseRequest<EnvironmentRow[]>("environments", {
    params: {
      select: "*",
      id: `eq.${environmentId}`,
      user_id: `eq.${userId}`,
      limit: "1",
    },
  });

  const environment = environmentRows[0];
  if (!environment) return null;

  const [varsRows, secretRows, threadRows] = await Promise.all([
    supabaseRequest<EnvironmentVarRow[]>("environment_vars", {
      params: {
        select: "key,value",
        environment_id: `eq.${environmentId}`,
      },
    }),
    supabaseRequest<EnvironmentSecretRow[]>("environment_secrets", {
      params: {
        select: "key,encrypted_value",
        environment_id: `eq.${environmentId}`,
      },
    }),
    supabaseRequest<Array<{ id: string }>>("threads", {
      params: {
        select: "id",
        user_id: `eq.${userId}`,
        environment_id: `eq.${environmentId}`,
      },
    }),
  ]);

  const summary = mapEnvironmentSummary(environment, threadRows.length);

  const variables: EnvironmentVariable[] = [
    ...varsRows.map((row) => ({
      key: row.key,
      value: row.value,
      isSecret: false,
    })),
    ...secretRows.map((row) => {
      let value = SECRET_PLACEHOLDER;
      if (options.includeSecretValues) {
        try {
          value = decryptSecretValue(row.encrypted_value);
        } catch {
          value = "";
        }
      }
      return {
        key: row.key,
        value,
        isSecret: true,
      };
    }),
  ];

  return {
    ...summary,
    variables,
  };
}

export async function createEnvironmentForUser(
  userId: string,
  payload: {
    name: string;
    description?: string;
    type?: string;
    repoUrl?: string;
    repoOrg?: string;
    repoName?: string;
    repoBranch?: string;
    containerImage?: string;
    workingDir?: string;
    setupScript?: string;
    networkAccess?: boolean;
    persistVolume?: boolean;
    metadata?: Record<string, unknown>;
    variables?: EnvironmentVariableInput[];
  },
): Promise<EnvironmentDetail> {
  const now = new Date().toISOString();
  const environmentId = `env_${nanoid(12)}`;
  const name = payload.name.trim();
  const type = normalizeEnvironmentType(payload.type);
  const parsedRepo = parseGitHubRepo(payload.repoUrl);

  await supabaseRequest<EnvironmentRow[]>("environments", {
    method: "POST",
    params: {
      select: "*",
    },
    prefer: "return=representation",
    body: [
      {
        id: environmentId,
        user_id: userId,
        name,
        description: payload.description?.trim() || null,
        type,
        repo_url: payload.repoUrl?.trim() || null,
        repo_org: payload.repoOrg?.trim() || parsedRepo.repoOrg,
        repo_name: payload.repoName?.trim() || parsedRepo.repoName,
        repo_branch: payload.repoBranch?.trim() || null,
        container_image: payload.containerImage?.trim() || null,
        working_dir: payload.workingDir?.trim() || null,
        setup_script: payload.setupScript?.trim() || null,
        network_access: payload.networkAccess ?? true,
        persist_volume: payload.persistVolume ?? true,
        metadata: payload.metadata ?? null,
        created_at: now,
        updated_at: now,
      },
    ],
  });

  if (payload.variables && payload.variables.length > 0) {
    await replaceEnvironmentVariables(environmentId, payload.variables);
  }

  const created = await getEnvironmentForUser(userId, environmentId);
  if (!created) {
    throw new Error("Environment was created but could not be loaded.");
  }

  return created;
}

export async function updateEnvironmentForUser(
  userId: string,
  environmentId: string,
  payload: {
    name?: string;
    description?: string | null;
    type?: string;
    repoUrl?: string | null;
    repoOrg?: string | null;
    repoName?: string | null;
    repoBranch?: string | null;
    containerImage?: string | null;
    workingDir?: string | null;
    setupScript?: string | null;
    networkAccess?: boolean;
    persistVolume?: boolean;
    metadata?: Record<string, unknown> | null;
    variables?: EnvironmentVariableInput[];
    replaceVariables?: boolean;
  },
): Promise<EnvironmentDetail | null> {
  const existing = await getEnvironmentForUser(userId, environmentId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextType = payload.type ? normalizeEnvironmentType(payload.type) : existing.type;
  const nextRepoUrl = payload.repoUrl === undefined
    ? existing.repoUrl
    : (payload.repoUrl?.trim() || null);
  const parsedRepo = parseGitHubRepo(nextRepoUrl);

  await supabaseRequest<EnvironmentRow[]>("environments", {
    method: "PATCH",
    params: {
      id: `eq.${environmentId}`,
      user_id: `eq.${userId}`,
      select: "*",
    },
    prefer: "return=representation",
    body: {
      name: payload.name?.trim() || existing.name,
      description: payload.description === undefined
        ? existing.description
        : (payload.description?.trim() || null),
      type: nextType,
      repo_url: nextRepoUrl,
      repo_org: payload.repoOrg === undefined
        ? (parsedRepo.repoOrg ?? existing.repoOrg)
        : (payload.repoOrg?.trim() || null),
      repo_name: payload.repoName === undefined
        ? (parsedRepo.repoName ?? existing.repoName)
        : (payload.repoName?.trim() || null),
      repo_branch: payload.repoBranch === undefined
        ? existing.repoBranch
        : (payload.repoBranch?.trim() || null),
      container_image: payload.containerImage === undefined
        ? existing.containerImage
        : (payload.containerImage?.trim() || null),
      working_dir: payload.workingDir === undefined
        ? existing.workingDir
        : (payload.workingDir?.trim() || null),
      setup_script: payload.setupScript === undefined
        ? existing.setupScript
        : (payload.setupScript?.trim() || null),
      network_access: payload.networkAccess ?? existing.networkAccess,
      persist_volume: payload.persistVolume ?? existing.persistVolume,
      metadata: payload.metadata === undefined ? existing.metadata : payload.metadata,
      updated_at: now,
    },
  });

  if (payload.replaceVariables !== false && payload.variables) {
    const hydratedVariables = await hydratePlaceholderSecrets(
      environmentId,
      payload.variables,
    );
    await replaceEnvironmentVariables(environmentId, hydratedVariables);
  }

  return getEnvironmentForUser(userId, environmentId);
}

export async function replaceEnvironmentVariables(
  environmentId: string,
  variables: EnvironmentVariableInput[],
): Promise<void> {
  const normalized = sanitizeVariables(variables);
  const now = new Date().toISOString();

  await supabaseRequest<unknown>("environment_vars", {
    method: "DELETE",
    params: {
      environment_id: `eq.${environmentId}`,
    },
  });

  await supabaseRequest<unknown>("environment_secrets", {
    method: "DELETE",
    params: {
      environment_id: `eq.${environmentId}`,
    },
  });

  if (normalized.length === 0) return;

  const regular = normalized.filter((item) => !item.isSecret);
  const secrets = normalized.filter((item) => item.isSecret);

  if (regular.length > 0) {
    await supabaseRequest<unknown>("environment_vars", {
      method: "POST",
      prefer: "return=minimal",
      body: regular.map((item) => ({
        id: `envvar_${nanoid(12)}`,
        environment_id: environmentId,
        key: item.key,
        value: item.value,
        is_secret: false,
        created_at: now,
        updated_at: now,
      })),
    });
  }

  if (secrets.length > 0) {
    await supabaseRequest<unknown>("environment_secrets", {
      method: "POST",
      prefer: "return=minimal",
      body: secrets.map((item) => ({
        id: `envsec_${nanoid(12)}`,
        environment_id: environmentId,
        key: item.key,
        encrypted_value: encryptSecretValue(item.value),
        created_at: now,
        updated_at: now,
      })),
    });
  }
}

export async function deleteEnvironmentForUser(
  userId: string,
  environmentId: string,
): Promise<boolean> {
  const existing = await getEnvironmentForUser(userId, environmentId);
  if (!existing) return false;

  const threadRows = await supabaseRequest<Array<{ id: string }>>("threads", {
    params: {
      select: "id",
      environment_id: `eq.${environmentId}`,
    },
  });

  const threadIds = threadRows.map((row) => row.id);
  if (threadIds.length > 0) {
    try {
      await supabaseRequest<unknown>("messages", {
        method: "DELETE",
        params: {
          thread_id: toInFilter(threadIds),
        },
      });
    } catch (error) {
      console.warn("Failed to delete environment messages:", error);
    }
  }

  await supabaseRequest<unknown>("threads", {
    method: "DELETE",
    params: {
      environment_id: `eq.${environmentId}`,
    },
  });

  await supabaseRequest<unknown>("environment_vars", {
    method: "DELETE",
    params: {
      environment_id: `eq.${environmentId}`,
    },
  });

  await supabaseRequest<unknown>("environment_secrets", {
    method: "DELETE",
    params: {
      environment_id: `eq.${environmentId}`,
    },
  });

  await supabaseRequest<unknown>("environments", {
    method: "DELETE",
    params: {
      id: `eq.${environmentId}`,
      user_id: `eq.${userId}`,
    },
  });

  return true;
}

export async function listEnvironmentConfigForNode(
  nodeId: string,
  options: { includeSecrets?: boolean } = {},
): Promise<Array<Record<string, unknown>>> {
  const threadRows = await supabaseRequest<Array<{ environment_id: string | null }>>(
    "threads",
    {
      params: {
        select: "environment_id",
        active_node_id: `eq.${nodeId}`,
        status: "neq.archived",
      },
    },
  );

  const environmentIds = Array.from(
    new Set(
      threadRows
        .map((row) => row.environment_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (environmentIds.length === 0) {
    return [];
  }

  const [environments, vars, secrets] = await Promise.all([
    supabaseRequest<EnvironmentRow[]>("environments", {
      params: {
        select: "*",
        id: toInFilter(environmentIds),
      },
    }),
    supabaseRequest<Array<{ environment_id: string; key: string; value: string }>>(
      "environment_vars",
      {
        params: {
          select: "environment_id,key,value",
          environment_id: toInFilter(environmentIds),
        },
      },
    ),
    supabaseRequest<Array<{ environment_id: string; key: string; encrypted_value: string }>>(
      "environment_secrets",
      {
        params: {
          select: "environment_id,key,encrypted_value",
          environment_id: toInFilter(environmentIds),
        },
      },
    ),
  ]);

  const varsByEnvironment = new Map<string, Record<string, string>>();
  for (const item of vars) {
    const current = varsByEnvironment.get(item.environment_id) || {};
    current[item.key] = item.value;
    varsByEnvironment.set(item.environment_id, current);
  }

  const secretsByEnvironment = new Map<string, Record<string, string>>();
  for (const item of secrets) {
    const current = secretsByEnvironment.get(item.environment_id) || {};
    if (options.includeSecrets) {
      try {
        current[item.key] = decryptSecretValue(item.encrypted_value);
      } catch {
        current[item.key] = "";
      }
    } else {
      current[item.key] = SECRET_PLACEHOLDER;
    }
    secretsByEnvironment.set(item.environment_id, current);
  }

  return environments.map((environment) => ({
    id: environment.id,
    name: environment.name,
    type: normalizeEnvironmentType(environment.type),
    repoUrl: environment.repo_url,
    repoBranch: environment.repo_branch,
    workingDir: environment.working_dir,
    setupScript: environment.setup_script,
    networkAccess: toBoolean(environment.network_access, true),
    persistVolume: toBoolean(environment.persist_volume, true),
    environmentVariables: varsByEnvironment.get(environment.id) || {},
    secrets: secretsByEnvironment.get(environment.id) || {},
    metadata: environment.metadata ?? null,
  }));
}

export async function listThreadsForUser(
  userId: string,
  options: {
    environmentId?: string;
    viberId?: string;
    nodeId?: string;
    status?: ThreadStatus;
  } = {},
): Promise<ThreadSummary[]> {
  const params: Record<string, string> = {
    select: "*",
    user_id: `eq.${userId}`,
    order: "updated_at.desc",
  };

  if (options.environmentId) {
    params.environment_id = `eq.${options.environmentId}`;
  }
  if (options.viberId) {
    params.viber_id = `eq.${options.viberId}`;
  }
  if (options.nodeId) {
    params.active_node_id = `eq.${options.nodeId}`;
  }
  if (options.status) {
    params.status = `eq.${options.status}`;
  }

  const rows = await supabaseRequest<ThreadRow[]>("threads", {
    params,
  });

  return rows.map(mapThreadRow);
}

export async function createThreadForUser(
  userId: string,
  payload: {
    environmentId?: string | null;
    viberId: string;
    activeNodeId?: string | null;
    title?: string;
  },
): Promise<ThreadSummary | null> {
  let resolvedEnvironmentId = payload.environmentId?.trim() || null;
  if (resolvedEnvironmentId) {
    const exists = await environmentExistsForUser(userId, resolvedEnvironmentId);
    if (!exists) return null;

    const assignment = await setViberEnvironmentForUser(
      userId,
      payload.viberId,
      resolvedEnvironmentId,
    );
    if (!assignment) return null;
  } else {
    resolvedEnvironmentId = await getViberEnvironmentForUser(userId, payload.viberId);
    if (!resolvedEnvironmentId) return null;
  }

  const now = new Date().toISOString();
  const insertedRows = await supabaseRequest<ThreadRow[]>("threads", {
    method: "POST",
    params: {
      select: "*",
    },
    prefer: "return=representation",
    body: [
      {
        id: `thr_${nanoid(12)}`,
        user_id: userId,
        viber_id: payload.viberId,
        environment_id: resolvedEnvironmentId,
        active_node_id: (payload.activeNodeId && payload.activeNodeId.trim()) || null,
        title: (payload.title || "").trim() || "New thread",
        status: "active",
        last_message_at: null,
        created_at: now,
        updated_at: now,
      },
    ],
  });

  return insertedRows[0] ? mapThreadRow(insertedRows[0]) : null;
}

export async function getThreadForUser(
  userId: string,
  threadId: string,
): Promise<ThreadSummary | null> {
  const rows = await supabaseRequest<ThreadRow[]>("threads", {
    params: {
      select: "*",
      id: `eq.${threadId}`,
      user_id: `eq.${userId}`,
      limit: "1",
    },
  });

  return rows[0] ? mapThreadRow(rows[0]) : null;
}

export async function updateThreadForUser(
  userId: string,
  threadId: string,
  patch: {
    title?: string;
    status?: string;
    activeNodeId?: string | null;
  },
): Promise<ThreadSummary | null> {
  const existing = await getThreadForUser(userId, threadId);
  if (!existing) return null;

  const updatedRows = await supabaseRequest<ThreadRow[]>("threads", {
    method: "PATCH",
    params: {
      id: `eq.${threadId}`,
      user_id: `eq.${userId}`,
      select: "*",
    },
    prefer: "return=representation",
    body: {
      title:
        patch.title !== undefined
          ? (patch.title.trim() || existing.title)
          : existing.title,
      status:
        patch.status !== undefined
          ? normalizeThreadStatus(patch.status)
          : existing.status,
      active_node_id:
        patch.activeNodeId !== undefined
          ? (patch.activeNodeId?.trim() || null)
          : existing.activeNodeId,
      updated_at: new Date().toISOString(),
    },
  });

  return updatedRows[0] ? mapThreadRow(updatedRows[0]) : null;
}

export async function touchThreadActivity(
  threadId: string,
  viberId: string,
): Promise<void> {
  const now = new Date().toISOString();

  await supabaseRequest<unknown>("threads", {
    method: "PATCH",
    params: {
      id: `eq.${threadId}`,
      viber_id: `eq.${viberId}`,
    },
    body: {
      last_message_at: now,
      updated_at: now,
    },
  });
}
