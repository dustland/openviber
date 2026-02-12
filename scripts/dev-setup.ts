/**
 * Dev Setup Script
 *
 * Ensures the local development environment has a default agent config
 * so that `pnpm dev` works out-of-the-box without requiring `openviber onboard`
 * or publishing the package to npm.
 *
 * 1. Creates ~/.openviber/vibers/default.yaml if it doesn't exist.
 * 2. Reads (or generates) the viber ID from ~/.openviber/viber-id.
 * 3. Injects OPENVIBER_DEV_VIBER_ID into web/.env so the dev viber
 *    automatically appears in the Vibers list.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENVIBER_DIR = process.env.OPENVIBER_DATA_DIR || path.join(os.homedir(), ".openviber");
const VIBERS_DIR = path.join(OPENVIBER_DIR, "vibers");
const DEFAULT_CONFIG = path.join(VIBERS_DIR, "default.yaml");
const VIBER_ID_FILE = path.join(OPENVIBER_DIR, "viber-id");
const WEB_ENV_FILE = path.join(__dirname, "..", "web", ".env");

const DEFAULT_AGENT_YAML = `# OpenViber default agent config (auto-generated for dev)
name: default
provider: openrouter
model: anthropic/claude-sonnet-4-20250514

tools:
  - file
  - terminal
  - search
  - web

skills: []
`;

/**
 * Get (or generate) the local viber ID.
 * Uses the same logic as getViberId() in src/cli/index.ts.
 */
function getOrCreateViberId(): string {
  try {
    fs.mkdirSync(OPENVIBER_DIR, { recursive: true });
    if (fs.existsSync(VIBER_ID_FILE)) {
      return fs.readFileSync(VIBER_ID_FILE, "utf8").trim();
    }
  } catch {
    // Fall through to generate
  }

  const id = `viber-${os
    .hostname()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36).slice(-6)}`;
  fs.mkdirSync(OPENVIBER_DIR, { recursive: true });
  fs.writeFileSync(VIBER_ID_FILE, id, "utf8");
  return id;
}

/**
 * Ensure OPENVIBER_DEV_VIBER_ID is present in web/.env.
 * Appends it if missing; never overwrites an existing value.
 */
function ensureDevViberIdInWebEnv(viberId: string): void {
  if (!fs.existsSync(WEB_ENV_FILE)) {
    console.log(`⚠️  web/.env does not exist — skipping dev viber ID injection`);
    return;
  }

  const content = fs.readFileSync(WEB_ENV_FILE, "utf8");

  // Already set (commented or not)?
  if (/^\s*OPENVIBER_DEV_VIBER_ID\s*=/m.test(content)) {
    console.log(`✅ OPENVIBER_DEV_VIBER_ID already set in web/.env`);
    return;
  }

  const lines = [
    "",
    "# Auto-injected by dev-setup: local viber appears in the Vibers list",
    `OPENVIBER_DEV_VIBER_ID=${viberId}`,
    `OPENVIBER_DEV_VIBER_NAME=Local Dev`,
  ];
  fs.appendFileSync(WEB_ENV_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`✅ Injected OPENVIBER_DEV_VIBER_ID=${viberId} into web/.env`);
}

function main() {
  // 1. Create directories if needed
  if (!fs.existsSync(VIBERS_DIR)) {
    fs.mkdirSync(VIBERS_DIR, { recursive: true });
    console.log(`📁 Created ${VIBERS_DIR}`);
  }

  // 2. Write default config if missing
  if (!fs.existsSync(DEFAULT_CONFIG)) {
    fs.writeFileSync(DEFAULT_CONFIG, DEFAULT_AGENT_YAML, "utf8");
    console.log(`✅ Created default agent config: ${DEFAULT_CONFIG}`);
  } else {
    console.log(`✅ Agent config already exists: ${DEFAULT_CONFIG}`);
  }

  // 3. Ensure viber ID exists and inject into web/.env
  const viberId = getOrCreateViberId();
  console.log(`✅ Viber ID: ${viberId}`);
  ensureDevViberIdInWebEnv(viberId);
}

main();
