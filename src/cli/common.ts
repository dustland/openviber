import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import * as readline from "readline";
import { spawn } from "child_process";
import YAML from "yaml";
import { getOpenViberVersion } from "../utils/version";

export const VERSION = getOpenViberVersion();
export const OPENVIBER_DIR = path.join(os.homedir(), ".openviber");
export const CONFIG_FILE = path.join(OPENVIBER_DIR, "config.yaml");

export interface SavedConfig {
  mode?: string;
  nodeId?: string;
  name?: string;
  gatewayUrl?: string;
  /** @deprecated Use gatewayUrl instead */
  boardUrl?: string;
  /** @deprecated Use gatewayUrl instead */
  hubUrl?: string;
  authToken?: string;
  webUrl?: string;
  onboardedAt?: string;
}

export type SkillHealthCheck = {
  label: string;
  ok: boolean;
  required?: boolean;
  message?: string;
  hint?: string;
};

export type SkillHealthResult = {
  id: string;
  name: string;
  status: string;
  available: boolean;
  checks: SkillHealthCheck[];
  summary: string;
};

export type SkillHealthReport = {
  generatedAt: string;
  skills: SkillHealthResult[];
};

/**
 * Load saved config from ~/.openviber/config.yaml.
 * Returns null if file doesn't exist or is invalid.
 */
export async function loadSavedConfig(): Promise<SavedConfig | null> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = YAML.parse(content) as SavedConfig;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getViberId(): Promise<string> {
  const configDir = path.join(os.homedir(), ".openviber");
  const idFile = path.join(configDir, "viber-id");

  try {
    await fs.mkdir(configDir, { recursive: true });
    const id = await fs.readFile(idFile, "utf8");
    return id.trim();
  } catch {
    // Generate new ID
    const id = `viber-${os
      .hostname()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36).slice(-6)}`;
    await fs.writeFile(idFile, id);
    return id;
  }
}

export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSubcommand(args: string[]): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1], ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

export function formatSkillHealthReport(report: SkillHealthReport): string[] {
  if (!report || report.skills.length === 0) {
    return [];
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case "AVAILABLE":
        return "OK";
      case "NOT_AVAILABLE":
        return "MISSING";
      case "UNKNOWN":
        return "UNKNOWN";
      default:
        return status || "UNKNOWN";
    }
  };

  const lines: string[] = [];
  lines.push("");
  lines.push("Skill Health");
  lines.push("────────────────────────────────────");

  for (const skill of report.skills) {
    const name = (skill.name || skill.id).slice(0, 22);
    const status = statusLabel(skill.status);
    lines.push(`  ${name.padEnd(22)} ${status}`);

    if (skill.status !== "AVAILABLE") {
      const failed = skill.checks.filter(
        (check) => (check.required ?? true) && !check.ok,
      );
      if (failed.length === 0) {
        if (skill.summary) {
          lines.push(`    - ${skill.summary}`);
        }
      } else {
        for (const check of failed) {
          const detail = check.hint || check.message || "missing";
          lines.push(`    - ${check.label}: ${detail}`);
        }
      }
    }
  }

  lines.push("────────────────────────────────────");
  return lines;
}
