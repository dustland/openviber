import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import * as YAML from "yaml";

export type EnvironmentVarScope = "setup_only" | "runtime";

export interface EnvironmentVariableDefinition {
  description?: string;
  required?: boolean;
  secret?: boolean;
  example?: string;
  scope?: EnvironmentVarScope;
}

export interface EnvironmentDefinition {
  name?: string;
  vars?: Record<string, EnvironmentVariableDefinition>;
  setup?: string[];
  maintenance?: string[];
  actions?: Record<string, string>;
}

export interface EnvironmentValues {
  values: Record<string, string>;
}

export interface ResolvedEnvironment {
  envId: string;
  repoRoot: string;
  definitionPath: string;
  storeDir: string;
  definition: EnvironmentDefinition;
  values: Record<string, string>;
}

const ENV_DEF_RELATIVE_PATH = path.join(".openviber", "environment.yaml");

function getStorageRoot(): string {
  return process.env.OPENVIBER_STORAGE_PATH || path.join(os.homedir(), ".openviber");
}

export function getEnvironmentStoreDir(envId: string): string {
  return path.join(getStorageRoot(), "environments", envId);
}

export function getEnvironmentValuesPath(envId: string): string {
  return path.join(getEnvironmentStoreDir(envId), "values.json");
}

export function getEnvironmentStatePath(envId: string): string {
  return path.join(getEnvironmentStoreDir(envId), "state.json");
}

export function getEnvironmentDefinitionPath(repoRoot: string): string {
  return path.join(repoRoot, ENV_DEF_RELATIVE_PATH);
}

export function findRepoRoot(startDir = process.cwd()): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fsSync.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function environmentIdForRepo(repoRoot: string): string {
  const normalized = path.resolve(repoRoot);
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 12);
  return `${path.basename(normalized)}-${hash}`;
}

export async function loadEnvironmentDefinition(repoRoot: string): Promise<EnvironmentDefinition | null> {
  const envPath = getEnvironmentDefinitionPath(repoRoot);
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const parsed = YAML.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as EnvironmentDefinition;
  } catch {
    return null;
  }
}

async function loadEnvironmentValues(envId: string): Promise<EnvironmentValues> {
  const valuesPath = getEnvironmentValuesPath(envId);
  try {
    const raw = await fs.readFile(valuesPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.values !== "object") {
      return { values: {} };
    }
    const values = Object.fromEntries(
      Object.entries(parsed.values as Record<string, unknown>)
        .filter(([k, v]) => typeof k === "string" && typeof v === "string"),
    ) as Record<string, string>;
    return { values };
  } catch {
    return { values: {} };
  }
}

export async function setEnvironmentValue(envId: string, key: string, value: string): Promise<void> {
  const storeDir = getEnvironmentStoreDir(envId);
  const valuesPath = getEnvironmentValuesPath(envId);
  await fs.mkdir(storeDir, { recursive: true });
  const current = await loadEnvironmentValues(envId);
  current.values[key] = value;
  await fs.writeFile(valuesPath, JSON.stringify(current, null, 2), { mode: 0o600 });
  await fs.chmod(valuesPath, 0o600);
}

export async function resolveEnvironment(
  repoRoot: string,
  envId?: string,
): Promise<ResolvedEnvironment | null> {
  const definition = await loadEnvironmentDefinition(repoRoot);
  if (!definition) return null;

  const resolvedEnvId = envId || environmentIdForRepo(repoRoot);
  const values = await loadEnvironmentValues(resolvedEnvId);
  return {
    envId: resolvedEnvId,
    repoRoot,
    definitionPath: getEnvironmentDefinitionPath(repoRoot),
    storeDir: getEnvironmentStoreDir(resolvedEnvId),
    definition,
    values: values.values,
  };
}

export function getMissingRequiredVars(environment: ResolvedEnvironment): string[] {
  const defs = environment.definition.vars || {};
  const missing: string[] = [];
  for (const [key, def] of Object.entries(defs)) {
    if (!def?.required) continue;
    const value = environment.values[key];
    if (!value) missing.push(key);
  }
  return missing;
}

export function getRuntimeEnvVars(environment: ResolvedEnvironment): Record<string, string> {
  const defs = environment.definition.vars || {};
  const runtime: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment.values)) {
    const scope = defs[key]?.scope || "runtime";
    if (scope === "runtime") {
      runtime[key] = value;
    }
  }
  return runtime;
}

export async function runEnvironmentCommands(
  env: ResolvedEnvironment,
  type: "setup" | "maintenance",
): Promise<{ command: string; code: number | null }[]> {
  const commands = type === "setup" ? env.definition.setup || [] : env.definition.maintenance || [];
  const results: { command: string; code: number | null }[] = [];
  for (const command of commands) {
    const proc = await import("child_process").then(({ spawn }) =>
      spawn("bash", ["-lc", command], {
        cwd: env.repoRoot,
        stdio: "inherit",
        env: { ...process.env, ...getRuntimeEnvVars(env), ...env.values },
      }),
    );
    const code = await new Promise<number | null>((resolve) => {
      proc.on("close", resolve);
    });
    results.push({ command, code });
    if (code !== 0) break;
  }

  await fs.mkdir(env.storeDir, { recursive: true });
  await fs.writeFile(
    getEnvironmentStatePath(env.envId),
    JSON.stringify({
      lastRunType: type,
      lastRunAt: new Date().toISOString(),
      lastRunStatus: results.every((r) => r.code === 0) ? "success" : "failed",
      results,
    }, null, 2),
    { mode: 0o600 },
  );

  return results;
}

export async function writeEnvironmentDefinitionSkeleton(repoRoot: string): Promise<string> {
  const envPath = getEnvironmentDefinitionPath(repoRoot);
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  const skeleton: EnvironmentDefinition = {
    name: path.basename(repoRoot),
    vars: {
      DATABASE_URL: {
        description: "Database connection string",
        required: true,
        secret: true,
        example: "postgres://user:password@localhost:5432/app",
        scope: "runtime",
      },
      OPENAI_API_KEY: {
        description: "OpenAI API key",
        required: true,
        secret: true,
        example: "sk-...",
        scope: "setup_only",
      },
    },
    setup: ["pnpm install"],
    maintenance: ["pnpm test:run"],
    actions: {
      test: "pnpm test:run",
      dev: "pnpm dev",
    },
  };

  await fs.writeFile(envPath, YAML.stringify(skeleton), "utf8");
  return envPath;
}

export async function resolveEnvironmentFromCwd(envId?: string): Promise<ResolvedEnvironment | null> {
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) return null;
  return resolveEnvironment(repoRoot, envId);
}


export interface RuntimeEnvironmentSnapshot {
  runtimeEnv: Record<string, string>;
  secretValues: string[];
}

export function loadRuntimeEnvironmentSnapshotSync(envId?: string): RuntimeEnvironmentSnapshot {
  const activeEnvId = envId || process.env.OPENVIBER_ENV_ID;
  if (!activeEnvId) {
    return { runtimeEnv: {}, secretValues: [] };
  }

  const valuesPath = getEnvironmentValuesPath(activeEnvId);
  let values: Record<string, string> = {};
  try {
    const raw = fsSync.readFileSync(valuesPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.values === "object") {
      values = Object.fromEntries(
        Object.entries(parsed.values as Record<string, unknown>)
          .filter(([_, v]) => typeof v === "string"),
      ) as Record<string, string>;
    }
  } catch {
    return { runtimeEnv: {}, secretValues: [] };
  }

  const secretValues: string[] = [];
  const runtimeEnv: Record<string, string> = {};
  const repoRoot = findRepoRoot(process.cwd());
  let defs: Record<string, EnvironmentVariableDefinition> = {};
  if (repoRoot) {
    const defPath = getEnvironmentDefinitionPath(repoRoot);
    try {
      const rawDef = fsSync.readFileSync(defPath, "utf8");
      const parsedDef = YAML.parse(rawDef) as EnvironmentDefinition;
      defs = parsedDef?.vars || {};
    } catch {
      defs = {};
    }
  }

  for (const [key, value] of Object.entries(values)) {
    const meta = defs[key];
    if (meta?.secret) {
      secretValues.push(value);
    }
    if ((meta?.scope || "runtime") === "runtime") {
      runtimeEnv[key] = value;
    }
  }

  return { runtimeEnv, secretValues };
}
