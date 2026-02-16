import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { env } from "$env/dynamic/private";
import { getServerSupabase, supabaseRequest, toInFilter } from "./supabase";

const ENVIRONMENT_TYPES = new Set(["github", "local", "manual"]);
const SECRET_PLACEHOLDER = "••••••••";

export type EnvironmentType = "github" | "local" | "manual";


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
  viberCount: number;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface EnvironmentDetail extends EnvironmentSummary {
  variables: EnvironmentVariable[];
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
  /** Plain vars: [{ key, value }] (single table merge) */
  variables?: { key: string; value: string }[];
  /** Encrypted secrets: { [key]: encryptedValue } (single table merge) */
  secrets_encrypted?: Record<string, string>;
}



interface ViberEnvironmentRow {
  id: string;
  environment_id: string | null;
  viber_id?: string | null;
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

  const envRows = await supabaseRequest<Pick<EnvironmentRow, "secrets_encrypted">[]>(
    "environments",
    {
      params: {
        select: "secrets_encrypted",
        id: `eq.${environmentId}`,
        limit: "1",
      },
    },
  );
  const secretsEnc = envRows[0]?.secrets_encrypted ?? {};
  const existingValues = new Map<string, string>();
  for (const key of placeholderKeys) {
    const enc = secretsEnc[key];
    if (enc) {
      try {
        existingValues.set(key, decryptSecretValue(enc));
      } catch {
        throw new Error(`Failed to decrypt existing secret: ${key}`);
      }
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
  viberCount: number,
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
    viberCount,
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
  try {
    const assignments = await listViberEnvironmentAssignmentsForUser(userId, [viberId]);
    return assignments[0]?.environmentId ?? null;
  } catch {
    return null;
  }
}

/** Read the extra skills attached to a viber (set during creation from an intent). */
export async function getViberSkills(
  viberId: string,
): Promise<string[]> {
  try {
    const rows = await supabaseRequest<{ skills: string[] | null }[]>("vibers", {
      params: {
        select: "skills",
        id: `eq.${viberId}`,
        limit: "1",
      },
    });
    return rows[0]?.skills ?? [];
  } catch {
    return [];
  }
}

export async function setViberEnvironmentForUser(
  userId: string,
  viberId: string,
  environmentId: string | null,
  goal?: string,
  skills?: string[],
): Promise<ViberEnvironmentAssignment | null> {
  const normalizedEnvironmentId = environmentId?.trim() || null;

  if (
    normalizedEnvironmentId &&
    !(await environmentExistsForUser(userId, normalizedEnvironmentId))
  ) {
    return null;
  }

  const MAX_VIBER_NAME_LENGTH = 80;
  const rawName = goal?.trim() || viberId;
  const name =
    rawName.length > MAX_VIBER_NAME_LENGTH
      ? rawName.slice(0, MAX_VIBER_NAME_LENGTH).trimEnd() + "…"
      : rawName;

  const now = new Date().toISOString();

  // Check if a row with this viber_id already exists (viber_id is a text
  // column that stores the gateway's string ID, distinct from the UUID `id`).
  const existingRows = await supabaseRequest<ViberEnvironmentRow[]>("vibers", {
    params: {
      select: "id,environment_id,viber_id",
      viber_id: `eq.${viberId}`,
      user_id: `eq.${userId}`,
      limit: "1",
    },
  });

  if (existingRows.length > 0) {
    // Update the existing row
    const patchBody: Record<string, unknown> = {
      environment_id: normalizedEnvironmentId,
      name,
      updated_at: now,
    };
    if (skills && skills.length > 0) {
      patchBody.skills = skills;
    }

    const rows = await supabaseRequest<ViberEnvironmentRow[]>("vibers", {
      method: "PATCH",
      params: {
        select: "id,environment_id,viber_id",
        id: `eq.${existingRows[0].id}`,
      },
      prefer: "return=representation",
      body: patchBody,
    });
    const row = rows[0] ?? existingRows[0];
    return {
      viberId: row.id,
      environmentId: row.environment_id,
    };
  }

  // Insert a new row — let the DB generate the UUID id
  const insertBody: Record<string, unknown> = {
    user_id: userId,
    viber_id: viberId,
    name,
    environment_id: normalizedEnvironmentId,
    created_at: now,
    updated_at: now,
  };
  if (skills && skills.length > 0) {
    insertBody.skills = skills;
  }

  const rows = await supabaseRequest<ViberEnvironmentRow[]>("vibers", {
    method: "POST",
    params: {
      select: "id,environment_id,viber_id",
    },
    prefer: "return=representation",
    body: [insertBody],
  });

  const row = rows[0] ?? {
    id: viberId,
    environment_id: normalizedEnvironmentId,
    viber_id: viberId,
  };
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

  // Count vibers per environment (vibers table has environment_id)
  const viberParams: Record<string, string> = {
    select: "id,environment_id",
    environment_id: toInFilter(environmentIds),
  };
  if (viberId) {
    viberParams.id = `eq.${viberId}`;
  }

  const viberRows = await supabaseRequest<Array<{ id: string; environment_id: string }>>(
    "vibers",
    { params: viberParams },
  );

  const viberCounts = new Map<string, number>();
  for (const v of viberRows) {
    if (v.environment_id) {
      viberCounts.set(
        v.environment_id,
        (viberCounts.get(v.environment_id) || 0) + 1,
      );
    }
  }

  return environments.map((row) => mapEnvironmentSummary(row, viberCounts.get(row.id) || 0));
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

  // Count vibers linked to this environment
  const viberRows = await supabaseRequest<Array<{ id: string }>>("vibers", {
    params: {
      select: "id",
      environment_id: `eq.${environmentId}`,
    },
  });

  const summary = mapEnvironmentSummary(environment, viberRows.length);

  const varsList = Array.isArray(environment.variables) ? environment.variables : [];
  const secretsEnc = environment.secrets_encrypted && typeof environment.secrets_encrypted === "object" ? environment.secrets_encrypted : {};
  const variables: EnvironmentVariable[] = [
    ...varsList.map((item) => ({
      key: item.key,
      value: item.value,
      isSecret: false,
    })),
    ...Object.entries(secretsEnc).map(([key, encrypted]) => {
      let value = SECRET_PLACEHOLDER;
      if (options.includeSecretValues && encrypted) {
        try {
          value = decryptSecretValue(encrypted);
        } catch {
          value = "";
        }
      }
      return { key, value, isSecret: true };
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
  const environmentId = randomUUID();
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
  const variablesArray = normalized
    .filter((item) => !item.isSecret)
    .map((item) => ({ key: item.key, value: item.value }));
  const secretsEncrypted: Record<string, string> = {};
  for (const item of normalized.filter((item) => item.isSecret)) {
    secretsEncrypted[item.key] = encryptSecretValue(item.value);
  }

  await supabaseRequest<unknown>("environments", {
    method: "PATCH",
    params: {
      id: `eq.${environmentId}`,
      select: "id",
    },
    body: {
      variables: variablesArray,
      secrets_encrypted: secretsEncrypted,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deleteEnvironmentForUser(
  userId: string,
  environmentId: string,
): Promise<boolean> {
  const existing = await getEnvironmentForUser(userId, environmentId);
  if (!existing) return false;

  // Unlink vibers from this environment (don't delete vibers themselves)
  try {
    await supabaseRequest<unknown>("vibers", {
      method: "PATCH",
      params: {
        environment_id: `eq.${environmentId}`,
      },
      body: {
        environment_id: null,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn("Failed to unlink vibers from environment:", error);
  }

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
  viberId: string,
  options: { includeSecrets?: boolean } = {},
): Promise<Array<Record<string, unknown>>> {
  // Find vibers linked to this node, then get their environments
  const viberRows = await supabaseRequest<Array<{ environment_id: string | null }>>(
    "vibers",
    {
      params: {
        select: "environment_id",
        environment_id: "not.is.null",
      },
    },
  );

  const environmentIds = Array.from(
    new Set(
      viberRows
        .map((row) => row.environment_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (environmentIds.length === 0) {
    return [];
  }

  const environments = await supabaseRequest<EnvironmentRow[]>("environments", {
    params: {
      select: "*",
      id: toInFilter(environmentIds),
    },
  });

  return environments.map((environment) => {
    const varsList = Array.isArray(environment.variables) ? environment.variables : [];
    const environmentVariables: Record<string, string> = {};
    for (const item of varsList) {
      environmentVariables[item.key] = item.value;
    }
    const secretsEnc = environment.secrets_encrypted && typeof environment.secrets_encrypted === "object" ? environment.secrets_encrypted : {};
    const secrets: Record<string, string> = {};
    for (const [key, encrypted] of Object.entries(secretsEnc)) {
      if (options.includeSecrets && encrypted) {
        try {
          secrets[key] = decryptSecretValue(encrypted);
        } catch {
          secrets[key] = "";
        }
      } else {
        secrets[key] = SECRET_PLACEHOLDER;
      }
    }
    return {
      id: environment.id,
      name: environment.name,
      type: normalizeEnvironmentType(environment.type),
      repoUrl: environment.repo_url,
      repoBranch: environment.repo_branch,
      workingDir: environment.working_dir,
      setupScript: environment.setup_script,
      networkAccess: toBoolean(environment.network_access, true),
      persistVolume: toBoolean(environment.persist_volume, true),
      environmentVariables,
      secrets,
      metadata: environment.metadata ?? null,
    };
  });
}

/**
 * Touch a viber's updated_at timestamp when new messages arrive.
 * Replaces the old touchTaskActivity that targeted the tasks table.
 */
export async function touchViberActivity(
  viberId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();

    await supabaseRequest<unknown>("vibers", {
      method: "PATCH",
      params: {
        id: `eq.${viberId}`,
      },
      body: {
        updated_at: now,
      },
    });
  } catch {
    // Non-critical: timestamp touch should not block operations
  }
}

// =============================================================================
// Account-level skills helpers
// =============================================================================

export interface SkillRow {
  id: string;
  user_id: string;
  skill_id: string;
  name: string;
  description: string;
  source: string | null;
  version: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillInput {
  skill_id: string;
  name: string;
  description?: string;
  source?: string;
  version?: string;
}

/**
 * List all skills registered for a user account.
 */
export async function listSkills(userId: string): Promise<SkillRow[]> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as SkillRow[];
  } catch {
    return [];
  }
}

/**
 * Upsert a single skill for a user (insert or update on conflict).
 */
export async function upsertSkill(
  userId: string,
  skill: SkillInput,
): Promise<void> {
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  const { error } = await supabase.from("skills").upsert(
    {
      user_id: userId,
      skill_id: skill.skill_id,
      name: skill.name,
      description: skill.description ?? "",
      source: skill.source ?? null,
      version: skill.version ?? null,
      updated_at: now,
    },
    { onConflict: "user_id,skill_id" },
  );
  if (error) throw error;
}

/**
 * Batch-upsert multiple skills for a user (e.g. syncing from node-reported skills).
 */
export async function upsertSkillsBatch(
  userId: string,
  skills: SkillInput[],
): Promise<void> {
  if (skills.length === 0) return;
  const now = new Date().toISOString();
  const rows = skills.map((skill) => ({
    user_id: userId,
    skill_id: skill.skill_id,
    name: skill.name,
    description: skill.description ?? "",
    source: skill.source ?? null,
    version: skill.version ?? null,
    updated_at: now,
  }));
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("skills")
    .upsert(rows, { onConflict: "user_id,skill_id" });
  if (error) throw error;
}
