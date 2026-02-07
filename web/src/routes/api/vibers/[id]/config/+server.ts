import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { homedir } from "os";
import path from "path";
import fs from "fs/promises";
import * as yaml from "yaml";

interface AgentConfig {
  name?: string;
  tools?: string[];
  skills?: string[];
  [key: string]: unknown;
}

const DEFAULT_TOOLS = [
  "file",
  "terminal",
  "browser",
  "search",
  "fetch",
  "git",
  "schedule",
] as const;

function getOpenViberDir(): string {
  return env.OPENVIBER_DATA_DIR || path.join(homedir(), ".openviber");
}

async function resolveConfigPath(viberId: string): Promise<string> {
  const vibersDir = path.join(getOpenViberDir(), "vibers");
  const candidates = [
    path.join(vibersDir, `${viberId}.yaml`),
    path.join(vibersDir, `${viberId}.yml`),
    path.join(vibersDir, "default.yaml"),
    path.join(vibersDir, "default.yml"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue searching candidates.
    }
  }

  throw new Error(
    "Agent config not found. Run `openviber onboard` to create ~/.openviber/vibers/default.yaml.",
  );
}

async function loadConfig(viberId: string): Promise<{ config: AgentConfig; configPath: string }> {
  const configPath = await resolveConfigPath(viberId);
  const content = await fs.readFile(configPath, "utf8");
  const config = (yaml.parse(content) ?? {}) as AgentConfig;
  return { config, configPath };
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { config, configPath } = await loadConfig(params.id);
    const toolOptions = Array.from(
      new Set([...(config.tools ?? []), ...DEFAULT_TOOLS]),
    ).sort((a, b) => a.localeCompare(b));

    return json({
      configFile: path.basename(configPath),
      tools: config.tools ?? [],
      skills: config.skills ?? [],
      toolOptions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load config";
    return json({ error: message }, { status: 404 });
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const body = (await request.json()) as { tools?: string[]; skills?: string[] };
    const { config, configPath } = await loadConfig(params.id);

    const normalize = (items: string[] | undefined) =>
      Array.from(
        new Set(
          (items ?? [])
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        ),
      );

    config.tools = normalize(body.tools);
    config.skills = normalize(body.skills);

    await fs.writeFile(configPath, yaml.stringify(config), "utf8");

    return json({
      ok: true,
      configFile: path.basename(configPath),
      tools: config.tools,
      skills: config.skills,
    });
  } catch (error) {
    console.error("[Viber Config API] Failed to update config:", error);
    return json({ error: "Failed to update config" }, { status: 500 });
  }
};
