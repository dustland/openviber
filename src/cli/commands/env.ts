import { Command } from "commander";
import {
  environmentIdForRepo,
  findRepoRoot,
  getMissingRequiredVars,
  resolveEnvironment,
  runEnvironmentCommands,
  setEnvironmentValue,
  writeEnvironmentDefinitionSkeleton,
} from "../../environment";

export const envCommand = new Command("env")
  .description("Manage per-repo OpenViber environments");

envCommand
  .command("init")
  .description("Create .openviber/environment.yaml in the current repo")
  .action(async () => {
    const repoRoot = findRepoRoot(process.cwd());
    if (!repoRoot) {
      console.error("[env] Not inside a git repository.");
      process.exit(1);
    }

    const outputPath = await writeEnvironmentDefinitionSkeleton(repoRoot);
    console.log(`[env] Created environment definition: ${outputPath}`);
    console.log("[env] Next: openviber env set KEY=value");
  });

envCommand
  .command("set <pair>")
  .description("Store an environment value for the current repo (KEY=VALUE)")
  .option("--env <envId>", "Environment ID override")
  .action(async (pair, options) => {
    const splitAt = pair.indexOf("=");
    if (splitAt <= 0) {
      console.error("[env] Invalid format. Use KEY=VALUE.");
      process.exit(1);
    }

    const key = pair.slice(0, splitAt).trim();
    const value = pair.slice(splitAt + 1);
    if (!key) {
      console.error("[env] Empty key.");
      process.exit(1);
    }

    const repoRoot = findRepoRoot(process.cwd());
    if (!repoRoot) {
      console.error("[env] Not inside a git repository.");
      process.exit(1);
    }

    const env = await resolveEnvironment(repoRoot, options.env);
    if (!env) {
      console.error("[env] Missing .openviber/environment.yaml. Run `openviber env init` first.");
      process.exit(1);
    }

    await setEnvironmentValue(env.envId, key, value);
    console.log(`[env] Saved ${key} for environment '${env.envId}'.`);
  });

envCommand
  .command("run <type>")
  .description("Run setup or maintenance scripts for the current repo")
  .option("--env <envId>", "Environment ID override")
  .action(async (type: string, options) => {
    if (type !== "setup" && type !== "maintenance") {
      console.error("[env] Type must be one of: setup, maintenance.");
      process.exit(1);
    }

    const repoRoot = findRepoRoot(process.cwd());
    if (!repoRoot) {
      console.error("[env] Not inside a git repository.");
      process.exit(1);
    }

    const env = await resolveEnvironment(repoRoot, options.env);
    if (!env) {
      console.error("[env] Missing .openviber/environment.yaml. Run `openviber env init` first.");
      process.exit(1);
    }

    const missing = getMissingRequiredVars(env);
    if (missing.length > 0) {
      console.error(`[env] Missing required vars: ${missing.join(", ")}`);
      console.error("[env] Set values with: openviber env set KEY=VALUE");
      process.exit(1);
    }

    console.log(`[env] Running ${type} for '${env.envId}'...`);
    const results = await runEnvironmentCommands(env, type);
    for (const result of results) {
      if (result.code === 0) {
        console.log(`  ✓ ${result.command}`);
      } else {
        console.error(`  ✗ ${result.command} (exit ${result.code ?? "null"})`);
        process.exit(1);
      }
    }
    console.log(`[env] ${type} completed.`);
  });

envCommand
  .command("status")
  .description("Show environment id and missing required variables")
  .option("--env <envId>", "Environment ID override")
  .action(async (options) => {
    const repoRoot = findRepoRoot(process.cwd());
    if (!repoRoot) {
      console.error("[env] Not inside a git repository.");
      process.exit(1);
    }

    const env = await resolveEnvironment(repoRoot, options.env);
    const fallbackEnvId = options.env || environmentIdForRepo(repoRoot);
    if (!env) {
      console.log(`[env] environment.yaml not found for repo ${repoRoot}`);
      console.log(`[env] Expected env id: ${fallbackEnvId}`);
      return;
    }

    const missing = getMissingRequiredVars(env);
    console.log(`[env] Environment ID: ${env.envId}`);
    if (missing.length === 0) {
      console.log("[env] All required variables are set.");
    } else {
      console.log(`[env] Missing required vars: ${missing.join(", ")}`);
    }
  });
