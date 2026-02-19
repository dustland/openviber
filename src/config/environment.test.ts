import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import {
  environmentIdForRepo,
  getMissingRequiredVars,
  getRuntimeEnvVars,
  loadRuntimeEnvironmentSnapshotSync,
  resolveEnvironment,
  setEnvironmentValue,
} from "./environment";

describe("environment helpers", () => {
  const tempRoot = path.join(os.tmpdir(), `openviber-env-test-${Date.now()}`);
  const repoRoot = path.join(tempRoot, "repo");
  const storageRoot = path.join(tempRoot, "storage");

  beforeEach(async () => {
    await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, ".openviber"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, ".openviber", "environment.yaml"), `name: repo\nvars:\n  REQUIRED_KEY:\n    required: true\n    scope: runtime\n  SETUP_ONLY:\n    required: false\n    scope: setup_only\n  SECRET_KEY:\n    required: false\n    scope: runtime\n    secret: true\n`);
    process.env.OPENVIBER_STORAGE_PATH = storageRoot;
    process.chdir(repoRoot);
  });

  afterEach(async () => {
    delete process.env.OPENVIBER_STORAGE_PATH;
    delete process.env.OPENVIBER_ENV_ID;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("reports missing required vars and filters runtime vars", async () => {
    const env = await resolveEnvironment(repoRoot);
    expect(env).not.toBeNull();

    expect(getMissingRequiredVars(env!)).toEqual(["REQUIRED_KEY"]);

    await setEnvironmentValue(env!.envId, "REQUIRED_KEY", "present");
    await setEnvironmentValue(env!.envId, "SETUP_ONLY", "setup-value");
    const resolved = await resolveEnvironment(repoRoot, env!.envId);

    expect(getMissingRequiredVars(resolved!)).toEqual([]);
    expect(getRuntimeEnvVars(resolved!)).toEqual({ REQUIRED_KEY: "present" });
  });

  it("loads runtime snapshot with secret values", async () => {
    const envId = environmentIdForRepo(repoRoot);
    await setEnvironmentValue(envId, "REQUIRED_KEY", "present");
    await setEnvironmentValue(envId, "SECRET_KEY", "super-secret");
    process.env.OPENVIBER_ENV_ID = envId;

    const snapshot = loadRuntimeEnvironmentSnapshotSync();
    expect(snapshot.runtimeEnv.REQUIRED_KEY).toBe("present");
    expect(snapshot.runtimeEnv.SECRET_KEY).toBe("super-secret");
    expect(snapshot.secretValues).toContain("super-secret");

    const valuesPath = path.join(storageRoot, "environments", envId, "values.json");
    const mode = fsSync.statSync(valuesPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
